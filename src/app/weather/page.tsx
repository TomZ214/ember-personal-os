"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, Eye,
  Gauge, Sun, Sunrise, Sunset, Umbrella, Wind, WifiOff,
} from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import {
  aqiMeta, condition, conditionLabel, fetchWeather, hhmm, moonPhase, uvMeta, windCompass,
  type Condition, type WeatherData,
} from "@/lib/weather";
import { WeatherBackground } from "@/components/weather/WeatherBackground";
import { PageHeader } from "@/components/ui/misc";

const ICONS: Record<Condition, typeof Sun> = {
  clear: Sun, partly: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle,
  rain: CloudRain, snow: CloudSnow, showers: CloudRain, thunder: CloudLightning,
};

export default function WeatherPage() {
  const hydrated = useHydrated();
  const { latitude, longitude, place } = useEmber((s) => s.settings);
  const [wx, setWx] = useState<WeatherData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchWeather(latitude, longitude)
      .then((d) => {
        if (!alive) return;
        setWx(d);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [latitude, longitude]);

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  if (failed)
    return (
      <div>
        <PageHeader title="Weather" sub={place} />
        <div className="panel flex flex-col items-center gap-2 py-20 text-center">
          <WifiOff size={22} className="text-faint" />
          <p className="text-sm text-muted">Weather is unavailable right now.</p>
        </div>
      </div>
    );

  if (!wx) return <WeatherSkeleton place={place} />;

  const c = wx.current;
  const cond = condition(c.code);
  const Icon = ICONS[cond];
  const moon = moonPhase();
  const uv = uvMeta(c.uv);
  const air = aqiMeta(c.aqi);
  const today = wx.daily[0];

  return (
    <div>
      <PageHeader title="Weather" sub={place} />

      {/* hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[26px] border border-white/[0.08]"
      >
        <WeatherBackground cond={cond} isDay={c.isDay} />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white/85">{place}</p>
              <p className="num mt-1 text-7xl font-semibold leading-none tracking-tight text-white drop-shadow-sm sm:text-8xl">
                {c.temp}°
              </p>
              <p className="mt-2 text-[15px] text-white/90">{conditionLabel(c.code)}</p>
              <p className="num text-sm text-white/70">
                H {wx.todayHi}° · L {wx.todayLo}° · Feels {c.feels}°
              </p>
            </div>
            <motion.span
              initial={{ scale: 0.5, opacity: 0, rotate: -14 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 180, damping: 15 }}
              className="text-white drop-shadow-md"
            >
              <Icon size={64} strokeWidth={1.4} />
            </motion.span>
          </div>
        </div>
      </motion.div>

      {/* hourly 48h */}
      <Section title="Next 48 hours">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {wx.hourly.map((h, i) => {
            const HIcon = ICONS[condition(h.code)];
            return (
              <div key={h.time} className="flex min-w-[58px] flex-col items-center gap-2 rounded-2xl bg-white/[0.03] px-2 py-3">
                <span className="text-[11px] text-faint">
                  {i === 0 ? "Now" : new Date(h.time).toLocaleTimeString("en-GB", { hour: "2-digit" })}
                </span>
                <HIcon size={18} className={h.isDay ? "text-accent" : "text-info"} strokeWidth={1.8} />
                {h.precipProb > 10 && <span className="text-[10px] text-info">{h.precipProb}%</span>}
                <span className="num text-sm font-medium">{h.temp}°</span>
              </div>
            );
          })}
        </div>
        <HourlyChart data={wx.hourly.slice(0, 24)} />
      </Section>

      {/* 10-day */}
      <Section title="10-day forecast">
        <TenDay wx={wx} />
      </Section>

      {/* detail grid */}
      <Section title="Details">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Detail icon={<Sun size={15} />} label="UV index" value={String(c.uv)} sub={uv.label} tone={uv.color} />
          <Detail icon={<Droplets size={15} />} label="Humidity" value={`${c.humidity}%`} sub={`Feels ${c.feels}°`} />
          <Detail icon={<Wind size={15} />} label="Wind" value={`${c.wind} km/h`} sub={`${windCompass(c.windDir)} · gust ${c.gust}`} />
          <Detail icon={<Umbrella size={15} />} label="Rain chance" value={`${c.precipProb}%`} sub="today" />
          <Detail icon={<Gauge size={15} />} label="Pressure" value={`${c.pressure}`} sub="hPa" />
          <Detail icon={<Eye size={15} />} label="Visibility" value={`${c.visibility} km`} sub={c.visibility >= 10 ? "Clear" : "Reduced"} />
          <Detail icon={<span className="text-[15px] leading-none">{moon.emoji}</span>} label="Moon" value={moon.name} sub={`${Math.round(moon.fraction * 100)}% cycle`} small />
          <Detail icon={<Cloud size={15} />} label="Air quality" value={c.aqi != null ? String(c.aqi) : "—"} sub={air.label} tone={air.color} small />
        </div>
      </Section>

      {/* sun + radar */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="mb-4 text-[13px] font-medium text-muted">Sun</p>
          <SunArc sunrise={today.sunrise} sunset={today.sunset} />
        </div>
        <div className="panel relative flex min-h-40 flex-col items-center justify-center gap-2 overflow-hidden p-5 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "repeating-radial-gradient(circle at 50% 60%, transparent 0 18px, rgba(255,255,255,0.05) 18px 19px)" }} />
          <p className="relative text-[13px] font-medium text-muted">Radar</p>
          <p className="relative max-w-[30ch] text-xs text-faint">Live precipitation radar is coming soon — the map layer will render here.</p>
        </div>
      </div>

      <p className="mt-5 text-center text-[11px] text-faint">
        Updated {hhmm(new Date(wx.fetchedAt).toISOString())} · Open-Meteo · change your location in Settings
      </p>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-[13px] font-semibold text-muted">{title}</h2>
      <div className="panel p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Detail({
  icon, label, value, sub, tone, small,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string; small?: boolean;
}) {
  return (
    <div className="panel p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span style={tone ? { color: tone } : undefined}>{icon}</span>
        {label}
      </p>
      <p className={`mt-1.5 font-semibold tracking-tight ${small ? "truncate text-[15px]" : "text-2xl"}`} style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {sub && <p className="truncate text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function HourlyChart({ data }: { data: WeatherData["hourly"] }) {
  const { area, line, labels, min, max } = useMemo(() => {
    const temps = data.map((h) => h.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const span = Math.max(1, max - min);
    const W = 100, H = 40, PAD = 9; // headroom top/bottom so labels above the peak never clip
    const pts = data.map((h, i) => ({
      x: (i / (data.length - 1)) * W,
      y: H - PAD - ((h.temp - min) / span) * (H - PAD * 2),
      temp: h.temp,
      time: h.time,
    }));

    // smooth the polyline into a Catmull-Rom curve for a premium feel
    const line = pts
      .map((p, i) => {
        if (i === 0) return `M${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        const p0 = pts[i - 1];
        const cx = ((p0.x + p.x) / 2).toFixed(2);
        return `C${cx},${p0.y.toFixed(2)} ${cx},${p.y.toFixed(2)} ${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      })
      .join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;

    // labels as percentages so they render as crisp, undistorted HTML
    const labels = pts
      .filter((_, i) => i % 3 === 0)
      .map((p, idx, arr) => ({
        temp: p.temp,
        leftPct: p.x,
        topPct: (p.y / H) * 100,
        align: idx === 0 ? "left" : idx === arr.length - 1 ? "right" : "center",
      }));

    return { area, line, labels, min, max };
  }, [data]);

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-4">
      <div className="mb-1 flex justify-between text-[11px] text-faint">
        <span>Next 24 h</span>
        <span className="num">▲ {max}° ▽ {min}°</span>
      </div>
      <div className="relative h-28 w-full">
        {/* stretched SVG draws the shape; text lives in the HTML layer so it stays crisp */}
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="wx-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path d={area} fill="url(#wx-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
          <motion.path
            d={line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0">
          {labels.map((l, i) => (
            <span
              key={i}
              className="num absolute text-[11px] font-medium text-ink/90"
              style={{
                left: `${l.leftPct}%`,
                top: `${l.topPct}%`,
                // sit the label fully above the curve point, edge-clamped at the ends
                transform: `translate(${l.align === "left" ? "0" : l.align === "right" ? "-100%" : "-50%"}, calc(-100% - 7px))`,
              }}
            >
              {l.temp}°
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TenDay({ wx }: { wx: WeatherData }) {
  const lo = Math.min(...wx.daily.map((d) => d.lo));
  const hi = Math.max(...wx.daily.map((d) => d.hi));
  const span = Math.max(1, hi - lo);
  return (
    <ul className="flex flex-col">
      {wx.daily.map((d, i) => {
        const DIcon = ICONS[condition(d.code)];
        const left = ((d.lo - lo) / span) * 100;
        const width = ((d.hi - d.lo) / span) * 100;
        return (
          <li key={d.date} className="flex items-center gap-3 border-b border-white/[0.05] py-2.5 last:border-0">
            <span className="w-10 shrink-0 text-[13px] font-medium">
              {i === 0 ? "Today" : new Date(d.date).toLocaleDateString("en", { weekday: "short" })}
            </span>
            <span className="flex w-10 shrink-0 items-center gap-1 text-info">
              <DIcon size={16} strokeWidth={1.8} />
            </span>
            <span className="w-9 shrink-0 text-right text-[11px] text-info">
              {d.precipProb > 10 ? `${d.precipProb}%` : ""}
            </span>
            <span className="num w-8 shrink-0 text-right text-sm text-faint">{d.lo}°</span>
            <span className="relative h-1.5 flex-1 rounded-full bg-white/[0.08]">
              <span
                className="absolute h-full rounded-full"
                style={{ left: `${left}%`, width: `${Math.max(6, width)}%`, background: "linear-gradient(90deg, var(--c-sky), var(--c-amber))" }}
              />
            </span>
            <span className="num w-8 shrink-0 text-sm font-medium">{d.hi}°</span>
          </li>
        );
      })}
    </ul>
  );
}

function SunArc({ sunrise, sunset }: { sunrise: string; sunset: string }) {
  const [now] = useState(() => Date.now());
  const rise = new Date(sunrise).getTime();
  const set = new Date(sunset).getTime();
  const t = Math.min(1, Math.max(0, (now - rise) / (set - rise)));
  // position the sun along a shallow arc between sunrise and sunset
  const x = 8 + t * 84;
  const y = 46 - Math.sin(Math.PI * t) * 34;
  return (
    <div>
      <svg viewBox="0 0 100 52" className="w-full">
        <path d="M8,46 A42,42 0 0 1 92,46" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="2 2" />
        <line x1="8" y1="46" x2="92" y2="46" stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
        {t > 0 && t < 1 && (
          <circle cx={x} cy={y} r="3" fill="var(--c-amber)" style={{ filter: "drop-shadow(0 0 4px var(--c-amber))" }} />
        )}
      </svg>
      <div className="mt-1 flex justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted"><Sunrise size={14} className="text-accent" /> {hhmm(sunrise)}</span>
        <span className="flex items-center gap-1.5 text-muted"><Sunset size={14} className="text-primary-bright" /> {hhmm(sunset)}</span>
      </div>
    </div>
  );
}

function WeatherSkeleton({ place }: { place: string }) {
  return (
    <div>
      <PageHeader title="Weather" sub={place} />
      <div className="skeleton h-56" style={{ borderRadius: 26 }} />
      <div className="mt-6 skeleton h-28" style={{ borderRadius: 18 }} />
      <div className="mt-6 skeleton h-72" style={{ borderRadius: 18 }} />
    </div>
  );
}
