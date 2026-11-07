"use client";

import { useId } from "react";
import type { Condition } from "@/lib/weather";

/**
 * Multicolour weather symbols in the spirit of the macOS Weather app: a warm
 * yellow sun, soft white clouds, blue rain, a pale moon at night.
 *
 * Everything — glow and shading included — is painted inside the SVG. No CSS
 * filter, transform or animation: on iPad Safari a composited layer above the
 * card's blurred backdrop rendered as a dark box around the old icon.
 */

// one cloud silhouette (bumps of r 11.5 / 14 / 10), reused at different sizes
const CLOUD = "M20 48H46A10 10 0 0 0 47.6 28.1A14 14 0 0 0 21 25.5A11.5 11.5 0 0 0 20 48Z";
const DROP = "M0 0c2.3 3.1 3.6 5.1 3.6 6.8a3.6 3.6 0 0 1-7.2 0c0-1.7 1.3-3.7 3.6-6.8Z";

export function WeatherGlyph({
  cond, isDay = true, size = 40, className = "", title,
}: {
  cond: Condition;
  isDay?: boolean;
  size?: number;
  className?: string;
  /** accessible name; omit when the condition is already written next to it */
  title?: string;
}) {
  // gradient ids must be unique per instance; useId's punctuation is not
  // reliable inside url(#…), so keep only safe characters
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const u = (name: string) => `url(#${id}${name})`;

  const rainy = cond === "rain" || cond === "showers" || cond === "drizzle" || cond === "thunder" || cond === "snow" || cond === "fog";
  const dark = cond === "rain" || cond === "showers" || cond === "thunder";
  // with something falling out of it, the cloud sits higher
  const lift = rainy ? "translate(0 -8)" : undefined;

  const sun = (cx: number, cy: number, r: number, rays = true) => (
    <g>
      <circle cx={cx} cy={cy} r={r * 2} fill={u("glow")} />
      {rays &&
        Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * r * 1.45} y1={cy + Math.sin(a) * r * 1.45}
              x2={cx + Math.cos(a) * r * 1.9} y2={cy + Math.sin(a) * r * 1.9}
              // a solid colour: a bounding-box gradient on a perfectly
              // horizontal or vertical line has zero area and paints nothing
              stroke="#ffc53a" strokeWidth={r * 0.28} strokeLinecap="round"
            />
          );
        })}
      <circle cx={cx} cy={cy} r={r} fill={u("sun")} />
    </g>
  );

  const moon = (cx: number, cy: number, r: number) => (
    <g>
      <circle cx={cx} cy={cy} r={r * 1.8} fill={u("moonGlow")} />
      {/* crescent: a disc with a second disc cut out of its upper right */}
      <path
        d={`M${cx + r * 0.35} ${cy - r}A${r} ${r} 0 1 0 ${cx + r} ${cy + r * 0.35}A${r * 0.82} ${r * 0.82} 0 0 1 ${cx + r * 0.35} ${cy - r}Z`}
        fill={u("moon")}
      />
    </g>
  );

  const cloud = (transform?: string, tone: "light" | "dark" = "light") => (
    <g transform={transform}>
      {/* a soft contact shadow under the cloud gives it volume */}
      <path d={CLOUD} transform="translate(0 1.6)" fill="oklch(0 0 0 / 0.22)" />
      <path d={CLOUD} fill={u(tone === "dark" ? "cloudDark" : "cloud")} />
    </g>
  );

  const celestial = (cx: number, cy: number, r: number) => (isDay ? sun(cx, cy, r) : moon(cx, cy, r));

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 overflow-visible ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <radialGradient id={`${id}glow`}>
          <stop offset="0.35" stopColor="#ffcf3d" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffcf3d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}sun`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe56b" />
          <stop offset="1" stopColor="#ffab0a" />
        </linearGradient>
        <radialGradient id={`${id}moonGlow`}>
          <stop offset="0.4" stopColor="#dfe6ff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#dfe6ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}moon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="1" stopColor="#e6d79c" />
        </linearGradient>
        <linearGradient id={`${id}cloud`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d3dae5" />
        </linearGradient>
        <linearGradient id={`${id}cloudDark`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9edf3" />
          <stop offset="1" stopColor="#9aa5b6" />
        </linearGradient>
        <linearGradient id={`${id}drop`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7ad7ff" />
          <stop offset="1" stopColor="#0a84ff" />
        </linearGradient>
        <linearGradient id={`${id}bolt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe55c" />
          <stop offset="1" stopColor="#ff9f0a" />
        </linearGradient>
      </defs>

      {cond === "clear" && (isDay ? sun(32, 32, 12.5) : moon(30, 32, 15))}

      {cond === "partly" && (
        <>
          {celestial(41, 22, 9)}
          {cloud("translate(-3 7) scale(0.92)")}
        </>
      )}

      {cond === "cloudy" && (
        <>
          {cloud("translate(18 -2) scale(0.7)", "dark")}
          {cloud("translate(-4 6) scale(0.95)")}
        </>
      )}

      {cond === "showers" && (
        <>
          {celestial(42, 16, 8)}
          {cloud("translate(-3 -1) scale(0.92)", "dark")}
        </>
      )}

      {(cond === "rain" || cond === "drizzle" || cond === "snow" || cond === "fog") && cloud(lift, dark ? "dark" : "light")}
      {cond === "thunder" && cloud(lift, "dark")}

      {(cond === "rain" || cond === "showers") &&
        [[22, 44], [32, 48], [42, 44]].map(([x, y]) => <path key={x} d={DROP} transform={`translate(${x} ${y})`} fill={u("drop")} />)}

      {cond === "drizzle" &&
        [[21, 46], [29, 50], [37, 46], [45, 50], [25, 56], [41, 56]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={1.9} fill={u("drop")} />
        ))}

      {cond === "snow" &&
        [[22, 47], [33, 52], [44, 47]].map(([x, y]) => (
          <g key={x} stroke="#e2f4ff" strokeWidth={2.2} strokeLinecap="round">
            {[0, 60, 120].map((deg) => {
              const a = (deg * Math.PI) / 180;
              return <line key={deg} x1={x - Math.cos(a) * 4.2} y1={y - Math.sin(a) * 4.2} x2={x + Math.cos(a) * 4.2} y2={y + Math.sin(a) * 4.2} />;
            })}
          </g>
        ))}

      {cond === "fog" &&
        [[14, 46, 36], [10, 52, 44], [18, 58, 30]].map(([x, y, w]) => (
          <line key={y} x1={x} y1={y} x2={x + w} y2={y} stroke="#c9d0da" strokeWidth={3.4} strokeLinecap="round" />
        ))}

      {cond === "thunder" && <path d="M34.5 38 26 50.5h7l-3.2 11.5L41 47h-7.2l4.4-9Z" fill={u("bolt")} strokeLinejoin="round" />}
    </svg>
  );
}
