"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal fetch hook with a shared in-memory cache, optional polling and
 * manual refresh. Instances watching the same URL share data and updates.
 */

interface Entry {
  data: unknown;
  at: number;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
// cross-instance dedupe: N components watching one URL = one network request
const inflightByUrl = new Map<string, Promise<Response>>();

function notify(url: string) {
  listeners.get(url)?.forEach((l) => l());
}

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  /** HTTP status of the last failed response (401 = reconnect needed) */
  errorStatus: number | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useApi<T>(url: string | null, opts?: { refreshMs?: number }): ApiState<T> {
  const [, force] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (!url || inflight.current) return;
    inflight.current = true;
    setPending(true);
    try {
      let req = inflightByUrl.get(url);
      if (!req) {
        req = fetch(url);
        inflightByUrl.set(url, req);
        void req.finally(() => inflightByUrl.delete(url));
      }
      const res = (await req).clone();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? `HTTP ${res.status}`);
        setErrorStatus(res.status);
      } else {
        cache.set(url, { data: body, at: Date.now() });
        setError(null);
        setErrorStatus(null);
        notify(url);
      }
    } catch (e) {
      setError(String(e));
      setErrorStatus(null);
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }, [url]);

  // subscribe to shared cache updates for this URL
  useEffect(() => {
    if (!url) return;
    const l = () => force((n) => n + 1);
    if (!listeners.has(url)) listeners.set(url, new Set());
    listeners.get(url)!.add(l);
    return () => {
      listeners.get(url)?.delete(l);
    };
  }, [url]);

  useEffect(() => {
    if (!url) return;
    // defer the initial fetch a tick so effects never set state synchronously
    const kick = setTimeout(() => {
      if (!cache.has(url)) void refresh();
    }, 0);
    const poll = opts?.refreshMs ? setInterval(() => void refresh(), opts.refreshMs) : null;
    return () => {
      clearTimeout(kick);
      if (poll) clearInterval(poll);
    };
  }, [url, refresh, opts?.refreshMs]);

  const entry = url ? cache.get(url) : undefined;
  return {
    data: (entry?.data as T) ?? null,
    error,
    errorStatus,
    loading: (!entry && !error && !!url) || pending,
    refresh,
  };
}

/** drop cached responses whose URL starts with the given prefix, then refetch watchers */
export function invalidateApi(prefix: string) {
  for (const url of [...cache.keys()]) {
    if (url.startsWith(prefix)) {
      cache.delete(url);
      notify(url);
    }
  }
}
