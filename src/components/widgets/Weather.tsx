"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, WifiOff,
} from "lucide-react";
import { useEmber } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { conditionLabel } from "@/lib/weather";

interface Wx {
  temp: number;
  code: number;
  wind: number;
  hi: number;
  lo: number;
  days: { code: number; hi: number; lo: number; label: string }[];
}

function iconFor(code: number): typeof Sun {
  if (code === 0) return Sun;
  if (code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code <= 48) return CloudFog;
  if (code <= 57) return CloudDrizzle;
  if (code <= 67) return CloudRain;
  if (code <= 77) return CloudSnow;
  if (code <= 82) return CloudRain;
  if (code <= 86) return CloudSnow;
  return CloudLightning;
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
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=4&timezone=auto`,
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

  const Icon = iconFor(wx.code);
  const dayLabel = (label: string) =>
    label === "__today__" ? t("w.today") : label === "__tomorrow__" ? t("w.tomorrow") : label;

  return (
    <Link href="/weather" className="panel panel-hover relative block h-full overflow-hidden p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full opacity-25 blur-3xl"
        style={{ background: "var(--c-sky)" }}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-medium text-muted">{place}</p>
          <p className="num mt-1 text-5xl font-semibold tracking-tight">{wx.temp}°</p>
          <p className="mt-1 text-sm text-muted">
            {conditionLabel(wx.code, lang)} · H {wx.hi}° L {wx.lo}°
          </p>
        </div>
        <motion.span
          initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 16 }}
          className="text-info"
        >
          <Icon size={40} strokeWidth={1.5} />
        </motion.span>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-1 border-t border-white/[0.06] pt-4">
        {wx.days.map((d, i) => {
          const DIcon = iconFor(d.code);
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[11px] text-faint">{d.label === "__today__" ? t("w.now") : dayLabel(d.label).slice(0, 3)}</span>
              <DIcon size={16} className="text-muted" strokeWidth={1.8} />
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
