"use client";

import { useState } from "react";

/**
 * Two single-series charts in the accent colour. Single series → no legend;
 * the panel title names it. Every chart ships a hover/tap tooltip and a
 * visually hidden table, so the numbers never depend on seeing the marks.
 */

export function WeekBars({
  days, target, label, unit,
}: {
  days: { day: string; label: string; kcal: number }[];
  target: number;
  label: string;
  unit: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(target * 1.15, ...days.map((d) => d.kcal), 1);
  const targetPct = (target / max) * 100;

  return (
    <figure className="relative">
      <div className="relative h-40" onPointerLeave={() => setActive(null)}>
        {/* recessive target line */}
        {target > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/25"
            style={{ bottom: `${targetPct}%` }}
          >
            <span className="absolute -top-4 right-0 text-[10px] text-faint num">{target}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((d, i) => (
            <button
              key={d.day}
              type="button"
              aria-label={`${d.label}: ${d.kcal} ${unit}`}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(i)}
              // the hit target is the whole column, not just the bar
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span
                className="w-full max-w-9 rounded-t-[4px] transition-opacity"
                style={{
                  height: d.kcal ? `${Math.max(2, (d.kcal / max) * 100)}%` : 0,
                  background: "var(--accent)",
                  opacity: active === null || active === i ? 0.9 : 0.4,
                }}
              />
            </button>
          ))}
        </div>
        {active !== null && (
          <div
            role="status"
            className="glass-strong pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg px-2.5 py-1 text-xs"
            style={{ left: `${((active + 0.5) / days.length) * 100}%` }}
          >
            <span className="text-muted">{days[active].label}</span>{" "}
            <span className="num font-semibold">{days[active].kcal}</span> <span className="text-muted">{unit}</span>
          </div>
        )}
      </div>
      <div aria-hidden className="mt-2 flex gap-[2px] text-center text-[11px] text-faint">
        {days.map((d) => <span key={d.day} className="flex-1 truncate">{d.label}</span>)}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>{days.map((d) => <tr key={d.day}><th scope="row">{d.label}</th><td>{d.kcal} {unit}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export function WeightLine({
  points, label, formatDate, formatKg,
}: {
  points: { date: string; kg: number; trend: number }[];
  label: string;
  formatDate: (day: string) => string;
  formatKg: (kg: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 600, H = 140, PAD = 10;
  const values = points.flatMap((p) => [p.kg, p.trend]);
  const lo = Math.min(...values) - 0.5, hi = Math.max(...values) + 0.5;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
  const trend = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.trend).toFixed(1)}`).join(" ");
  const shown = active ?? points.length - 1;

  return (
    <figure>
      <div className="mb-2 flex items-baseline gap-2 text-sm">
        <span className="num text-xl font-semibold">{formatKg(points[shown].kg)} kg</span>
        <span className="text-muted">{formatDate(points[shown].date)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
          setActive(Math.min(points.length - 1, Math.max(0, i)));
        }}
        onPointerLeave={() => setActive(null)}
        aria-hidden
      >
        <path d={trend} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.kg)} r={i === shown ? 4.5 : 2.5} fill={i === shown ? "var(--accent)" : "oklch(1 0 0 / 0.45)"} stroke="var(--bg-deep)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>{points.map((p) => <tr key={p.date}><th scope="row">{formatDate(p.date)}</th><td>{formatKg(p.kg)} kg</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
