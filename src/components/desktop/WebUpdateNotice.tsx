"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useIsDesktop } from "@/lib/desktop";
import { Button } from "@/components/ui/Button";

/** Web deployments and native installer releases have separate lifecycles. */
export function WebUpdateNotice() {
  const desktop = useIsDesktop();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const { revision } = await response.json();
        if (!controller.signal.aborted && typeof revision === "string" && revision !== "development" && revision !== process.env.NEXT_PUBLIC_APP_REVISION) setAvailable(true);
      } catch { /* Keep the current app usable while offline. */ }
    };
    void check();
    const timer = setInterval(() => void check(), 60_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("ember-check-update", onFocus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ember-check-update", onFocus);
    };
  }, [desktop]);
  if (!available) return null;
  return <div role="status" className="glass-strong fixed bottom-24 left-1/2 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 items-center justify-between gap-4 rounded-2xl border border-white/15 p-4 shadow-xl">
    <div><p className="text-sm font-semibold">Neue EmberOS-Funktionen verfügbar</p><p className="mt-1 text-xs text-muted">Offene Eingaben zuerst speichern.</p></div>
    <Button onClick={() => { const url = new URL(window.location.href); url.searchParams.set("_refresh", Date.now().toString()); window.location.replace(url.href); }}><RefreshCw size={15} />Neu laden</Button>
  </div>;
}
