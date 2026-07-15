"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Condition } from "@/lib/weather";

/**
 * Living weather backdrop. Everything animates transform/opacity only, so it
 * composites on the GPU and stays at 60fps. The gradient shifts with the
 * condition and time of day; particle layers switch by condition.
 */

const GRADIENTS: Record<string, string> = {
  "clear-day": "linear-gradient(160deg, #2b6fb3 0%, #4a9fd4 45%, #8fd0e8 100%)",
  "clear-night": "linear-gradient(160deg, #0b1026 0%, #1b2350 55%, #2d2a63 100%)",
  "partly-day": "linear-gradient(160deg, #3a6ea5 0%, #6ba3cc 50%, #a9cfe3 100%)",
  "partly-night": "linear-gradient(160deg, #10152e 0%, #232b57 60%, #3a3a6b 100%)",
  "cloudy-day": "linear-gradient(160deg, #55677d 0%, #7c8da4 55%, #9aa7bb 100%)",
  "cloudy-night": "linear-gradient(160deg, #1a1f2b 0%, #2c3444 60%, #3a4152 100%)",
  "fog-day": "linear-gradient(160deg, #6b7480 0%, #939aa4 55%, #b6bcc4 100%)",
  "fog-night": "linear-gradient(160deg, #20242c 0%, #333a44 60%, #464d58 100%)",
  "rain-day": "linear-gradient(160deg, #3f4d5e 0%, #566a80 55%, #6c7f92 100%)",
  "rain-night": "linear-gradient(160deg, #12161f 0%, #232d3b 60%, #313d4c 100%)",
  "snow-day": "linear-gradient(160deg, #7d8da4 0%, #a7b6cb 55%, #d3dde9 100%)",
  "snow-night": "linear-gradient(160deg, #1c2230 0%, #333d52 60%, #4a556b 100%)",
  "thunder-day": "linear-gradient(160deg, #2c3340 0%, #444b5c 55%, #59617a 100%)",
  "thunder-night": "linear-gradient(160deg, #0d1017 0%, #1e2330 60%, #2b3040 100%)",
};

function gradientFor(cond: Condition, isDay: boolean): string {
  const base = cond === "drizzle" || cond === "showers" ? "rain" : cond;
  return GRADIENTS[`${base}-${isDay ? "day" : "night"}`] ?? GRADIENTS[`clear-${isDay ? "day" : "night"}`];
}

export function WeatherBackground({ cond, isDay }: { cond: Condition; isDay: boolean }) {
  const reduced = useReducedMotion();
  const rainy = cond === "rain" || cond === "drizzle" || cond === "showers" || cond === "thunder";
  const snowy = cond === "snow";
  const cloudy = cond === "cloudy" || cond === "partly" || cond === "fog" || rainy || snowy;
  const foggy = cond === "fog";

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
      <motion.div
        key={`${cond}-${isDay}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="absolute inset-0"
        style={{ background: gradientFor(cond, isDay) }}
      />

      {/* sun / moon glow */}
      {!reduced && (cond === "clear" || cond === "partly") && (
        <motion.div
          animate={{ opacity: [0.5, 0.8, 0.5], scale: [1, 1.06, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-8 -top-10 h-52 w-52 rounded-full blur-2xl"
          style={{ background: isDay ? "radial-gradient(circle, rgba(255,236,170,0.9), transparent 70%)" : "radial-gradient(circle, rgba(214,225,255,0.5), transparent 70%)" }}
        />
      )}

      {cloudy && !reduced && <Clouds dark={!isDay} dense={cond === "cloudy" || rainy || snowy} />}
      {rainy && !reduced && <Rain heavy={cond === "rain" || cond === "thunder"} />}
      {snowy && !reduced && <Snow />}
      {foggy && !reduced && <Fog />}
      {cond === "thunder" && !reduced && <Lightning />}
      {(cond === "clear" || cond === "partly") && !reduced && <Wind />}
    </div>
  );
}

function Clouds({ dark, dense }: { dark: boolean; dense: boolean }) {
  // lazy initializer: random layout is computed once, not on every render
  const [clouds] = useState(() =>
    Array.from({ length: dense ? 6 : 4 }, (_, i) => ({
      id: i,
      top: 5 + Math.random() * 45,
      scale: 0.7 + Math.random() * 0.8,
      dur: 40 + Math.random() * 40,
      delay: -Math.random() * 60,
      opacity: (dark ? 0.18 : 0.5) + Math.random() * 0.2,
    })),
  );
  return (
    <>
      {clouds.map((c) => (
        <motion.div
          key={c.id}
          initial={{ x: "-30%" }}
          animate={{ x: "130%" }}
          transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: "linear" }}
          className="absolute h-24 w-48 rounded-full blur-2xl"
          style={{ top: `${c.top}%`, opacity: c.opacity, scale: c.scale, background: dark ? "rgba(180,190,210,0.5)" : "rgba(255,255,255,0.85)" }}
        />
      ))}
    </>
  );
}

function Rain({ heavy }: { heavy: boolean }) {
  const [drops] = useState(() =>
    Array.from({ length: heavy ? 60 : 32 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      dur: 0.5 + Math.random() * 0.4,
      delay: Math.random() * 2,
      len: 12 + Math.random() * 14,
    })),
  );
  return (
    <>
      {drops.map((d) => (
        <motion.span
          key={d.id}
          className="absolute w-px bg-white/40"
          style={{ left: `${d.left}%`, height: d.len, top: "-6%" }}
          initial={{ y: "-10%", opacity: 0 }}
          animate={{ y: "115%", opacity: [0, 0.7, 0] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </>
  );
}

function Snow() {
  const [flakes] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: 2 + Math.random() * 4,
      dur: 4 + Math.random() * 5,
      delay: Math.random() * 5,
      drift: (Math.random() - 0.5) * 40,
    })),
  );
  return (
    <>
      {flakes.map((f) => (
        <motion.span
          key={f.id}
          className="absolute rounded-full bg-white/80"
          style={{ left: `${f.left}%`, width: f.size, height: f.size, top: "-5%" }}
          initial={{ y: "-8%", opacity: 0 }}
          animate={{ y: "112%", x: [0, f.drift, 0], opacity: [0, 0.9, 0] }}
          transition={{ duration: f.dur, delay: f.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </>
  );
}

function Fog() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-x-0 h-24 blur-2xl"
          style={{ top: `${20 + i * 25}%`, background: "linear-gradient(90deg, transparent, rgba(220,224,230,0.35), transparent)" }}
          initial={{ x: "-40%" }}
          animate={{ x: "40%" }}
          transition={{ duration: 18 + i * 6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
        />
      ))}
    </>
  );
}

function Lightning() {
  return (
    <motion.div
      className="absolute inset-0 bg-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0, 0.5, 0, 0.3, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 5, times: [0, 0.5, 0.55, 0.6, 0.66, 0.72] }}
    />
  );
}

function Wind() {
  const [streaks] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      top: 20 + Math.random() * 60,
      dur: 3 + Math.random() * 3,
      delay: Math.random() * 4,
      w: 30 + Math.random() * 60,
    })),
  );
  return (
    <>
      {streaks.map((s) => (
        <motion.span
          key={s.id}
          className="absolute h-px rounded-full bg-white/25"
          style={{ top: `${s.top}%`, width: s.w }}
          initial={{ x: "-20%", opacity: 0 }}
          animate={{ x: "120%", opacity: [0, 0.5, 0] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: "easeIn" }}
        />
      ))}
    </>
  );
}
