"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { flagFor, searchPlaces, type PlaceHit } from "@/lib/weather";
import { Input } from "@/components/ui/inputs";
import { toast } from "@/components/ui/toast";

/** Drop every cached forecast so the new place is fetched fresh. */
function clearWeatherCache() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("ember-wx")) sessionStorage.removeItem(key);
    }
  } catch {
    /* private mode — nothing to clear */
  }
}

/**
 * City search for the weather location: type a name, pick from Open-Meteo's
 * geocoder, and place + coordinates are filled in for you.
 */
export function LocationSearch() {
  const updateSettings = useEmber((s) => s.updateSettings);
  const t = useT();
  const lang = useLang();

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // debounce + cancel in-flight requests so fast typing can't race
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;

    // `cancelled` matters as much as the abort: a request that already
    // resolved still runs its .then(), which would otherwise re-open the
    // dropdown with stale results right after the user picked a city.
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      searchPlaces(q, lang, controller.signal)
        .then((results) => {
          if (cancelled) return;
          setHits(results);
          setActive(0);
          setOpen(true);
        })
        .catch((e) => {
          if (!cancelled && (e as Error)?.name !== "AbortError") setFailed(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, lang]);

  // a too-short query simply shows nothing — derived, so the effect above
  // never has to synchronously reset state
  const tooShort = query.trim().length < 2;
  const visibleHits = tooShort ? [] : hits;

  // click outside closes the dropdown
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (hit: PlaceHit) => {
    updateSettings({
      place: hit.name,
      latitude: hit.latitude,
      longitude: hit.longitude,
    });
    clearWeatherCache();
    setQuery("");
    setHits([]);
    setOpen(false);
    toast(t("settings.locationSet").replace("{place}", hit.name));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || visibleHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, visibleHits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = visibleHits[active];
      if (hit) choose(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showEmpty = open && !loading && !failed && !tooShort && visibleHits.length === 0;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => visibleHits.length > 0 && setOpen(true)}
          placeholder={t("settings.searchCityPh")}
          aria-label={t("settings.searchCity")}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="pl-9 pr-9"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-accent" />
        )}
        {!loading && query && (
          <button
            onClick={() => { setQuery(""); setOpen(false); }}
            aria-label={t("action.close")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-faint transition-colors hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Plain conditional render, deliberately NOT AnimatePresence: with an
          exit animation the node finished fading but was left mounted at
          opacity 0, still 258px tall and still swallowing clicks. A dropdown
          should vanish on select anyway. */}
      {(open && visibleHits.length > 0) || showEmpty || failed ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            className="glass-strong glass-edge absolute left-0 right-0 top-full z-(--z-dropdown) mt-2 overflow-hidden rounded-xl shadow-[0_20px_50px_-16px_rgba(0,0,0,0.7)]"
          >
            {failed ? (
              <p className="px-3.5 py-3 text-[13px] text-muted">{t("settings.searchFailed")}</p>
            ) : showEmpty ? (
              <p className="px-3.5 py-3 text-[13px] text-muted">
                {t("settings.noCities").replace("{q}", query.trim())}
              </p>
            ) : (
              <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto py-1">
                {visibleHits.map((hit, i) => (
                  <li key={hit.id} role="option" aria-selected={i === active}>
                    <button
                      onClick={() => choose(hit)}
                      onMouseMove={() => setActive(i)}
                      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                        i === active ? "bg-white/[0.08]" : ""
                      }`}
                    >
                      <span className="text-[15px] leading-none" aria-hidden>
                        {flagFor(hit.countryCode) || <MapPin size={14} className="text-faint" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{hit.name}</span>
                        <span className="block truncate text-[11px] text-faint">
                          {[hit.admin1, hit.country].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="num shrink-0 text-[10px] text-faint">
                        {hit.latitude.toFixed(2)}, {hit.longitude.toFixed(2)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
      ) : null}
    </div>
  );
}
