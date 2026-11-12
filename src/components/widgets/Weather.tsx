"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { condition, conditionLabel } from "@/lib/weather";
import { WeatherGlyph } from "@/components/weather/WeatherGlyph";

interface Wx {
  temp: number;
  code: number;
  /** absent in snapshots cached before it existed → treat as day */
  isDay?: boolean;
  wind: number;
  hi: number;
  lo: number;
  days: { code: number; hi: number; lo: number; label: string }[];
}

export function WeatherWidget() {
  const { latitude, longitude, place } = useEmber((s) => s.settings);
  const t = useT();
  const lang = useLang();
  const [wx, setWx] = useState<Wx | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `ember-wx-${latitude}-${longitude}`;
    Promise.resolve()
      .then(() => {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const { at, data } = JSON.parse(cached);
          if (Date.now() - at < 30 * 60_000) {
            if (!cancelled) setWx(data);
            return null;
          }
        }
        return fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,is_day,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto`,
        ).then((r) => r.json());
      })
      .then((d) => {
        if (cancelled || !d) return;
        const days = [0, 1, 2, 3].map((_, i) => ({
          code: d.daily.weather_code[i],
          hi: Math.round(d.daily.temperature_2m_max[i]),
          lo: Math.round(d.daily.temperature_2m_min[i]),
          label:
            i < 2
              ? ["__today__", "__tomorrow__"][i]
              : new Date(d.daily.time[i]).toLocaleDateString(lang === "de" ? "de-DE" : "en", { weekday: "short" }),
        }));
        const data: Wx = {
          temp: Math.round(d.current.temperature_2m),
          code: d.current.weather_code,
          isDay: d.current.is_day !== 0,
          wind: Math.round(d.current.wind_speed_10m),
          hi: days[0].hi,
          lo: days[0].lo,
          days,
        };
        sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data }));
        setWx(data);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, lang]);

  if (failed)
    return (
      <div className="panel flex h-full min-h-40 flex-col items-center justify-center gap-2 p-5 text-center">
        <WifiOff size={18} className="text-faint" />
        <p className="text-sm text-muted">{t("w.wxOffline")}</p>
      </div>
    );

  if (!wx)
    return (
      <div className="panel flex h-full min-h-40 flex-col justify-between p-5">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-12 w-28" />
        <div className="skeleton h-4 w-full" />
      </div>
    );

  const dayLabel = (label: string) =>
    label === "__today__" ? t("w.today") : label === "__tomorrow__" ? t("w.tomorrow") : label;

  return (
    <Link href="/weather" className="panel panel-hover relative block h-full overflow-hidden p-5">
      {/* A soft sky-coloured glow in the top-right corner, drawn as a gradient
          and not as a blurred disc: a CSS `filter: blur()` inside a pane that
          has a backdrop-filter is what WebKit gets wrong (the blur escaped the
          rounded corner here, and a composited icon above it showed as a dark
          box on iPad). A gradient needs no filter and clips reliably; it sits
          in its own clipper so the glow can run past the card's edge. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <span
          className="absolute -right-[142px] -top-[150px] block h-[380px] w-[380px] rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklch, var(--c-sky) 17%, transparent), color-mix(in oklch, var(--c-sky) 9%, transparent) 42%, color-mix(in oklch, var(--c-sky) 3%, transparent) 72%, transparent)",
          }}
        />
      </span>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-muted">{place}</p>
          <p className="num mt-1 text-5xl font-semibold tracking-tight">{wx.temp}°</p>
          <p className="mt-1 text-sm text-muted">
            {conditionLabel(wx.code, lang)} · H {wx.hi}° L {wx.lo}°
          </p>
        </div>
        {/* deliberately not animated: a transformed layer over the blurred
            backdrop showed as a dark box around the icon on iPad */}
        <WeatherGlyph cond={condition(wx.code)} isDay={wx.isDay !== false} size={60} className="-mr-1 -mt-1" />
      </div>
      <div className="mt-5 grid grid-cols-4 gap-1 border-t border-white/[0.06] pt-4">
        {wx.days.map((d, i) => {
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              {/* full words: slicing "Morgen" to three letters gave "Mor" */}
              <span className="text-[11px] text-faint">{d.label === "__today__" ? t("w.now") : dayLabel(d.label)}</span>
              <WeatherGlyph cond={condition(d.code)} isDay={i === 0 ? wx.isDay !== false : true} size={26} />
              <span className="num text-xs">
                {d.hi}° <span className="text-faint">{d.lo}°</span>
              </span>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
