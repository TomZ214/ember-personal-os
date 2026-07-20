"use client";

import { motion } from "framer-motion";
import { eur } from "@/lib/dates";
import { useT } from "@/lib/i18n";

export function SummaryCard({ label, value, tone, icon, blur }: { label: string; value: string; tone: string; icon?: React.ReactNode; blur?: boolean }) {
  return (
    <div className="panel p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon && <span style={{ color: tone }}>{icon}</span>}
        {label}
      </p>
      <p className={`num mt-1.5 truncate text-xl font-semibold tracking-tight sm:text-2xl ${blur ? "money-blur" : ""}`}>{value}</p>
    </div>
  );
}

export function MonthBars({ months }: { months: { label: string; income: number; expenses: number }[] }) {
  const t = useT();
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));
  return (
    <div>
      <div className="flex h-44 items-end justify-around gap-4">
        {months.map((m, i) => (
          <div key={m.label} className="flex h-full flex-1 items-end justify-center gap-1.5">
            {[
              { v: m.income, c: "var(--success)", n: "income" },
              { v: m.expenses, c: "var(--c-ember)", n: "expenses" },
            ].map((bar) => (
              <div key={bar.n} className="group relative flex h-full w-full max-w-9 items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(bar.v / max) * 100}%` }}
                  transition={{ delay: i * 0.07, type: "spring", stiffness: 120, damping: 20 }}
                  className="lit w-full rounded-t-md"
                  style={
                    {
                      color: `color-mix(in oklch, ${bar.c} 75%, transparent)`,
                      background: "currentColor",
                      "--lit-glow": "4px",
                    } as React.CSSProperties
                  }
                />
                <span className="num pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/85 px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                  {eur(Math.round(bar.v))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-around">
        {months.map((m) => (
          <span key={m.label} className="flex-1 text-center text-xs text-faint">{m.label}</span>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-5 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> {t("fin.income")}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--c-ember)" }} /> {t("fin.expenses")}</span>
      </div>
    </div>
  );
}

export function Donut({ categories, total, blur }: { categories: { name: string; amount: number; color: string }[]; total: number; blur?: boolean }) {
  const t = useT();
  const size = 150, stroke = 16;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const segments = categories.map((c) => ({ ...c, frac: total ? c.amount / total : 0 }));
  const starts = segments.reduce<number[]>((acc, s, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + segments[i - 1].frac);
    return acc;
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        {/* overflow-visible so the segment glow isn't clipped square — see ProgressRing */}
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(1 0 0 / 0.06)" strokeWidth={stroke} />
          {segments.map((c, i) => (
            <motion.circle
              key={c.name}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="currentColor" className="lit"
              style={{ color: c.color, "--lit-glow": "4px" } as React.CSSProperties}
              strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, c.frac * circ - 2)} ${circ}`}
              initial={{ strokeDashoffset: -starts[i] * circ + circ * 0.25, opacity: 0 }}
              animate={{ strokeDashoffset: -starts[i] * circ, opacity: 1 }}
              transition={{ type: "spring", stiffness: 70, damping: 20 }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`num text-lg font-semibold ${blur ? "money-blur" : ""}`}>{eur(Math.round(total))}</span>
          <span className="text-[10px] uppercase tracking-wide text-faint">{t("fin.spent")}</span>
        </div>
      </div>
      <ul className="flex min-w-36 flex-1 flex-col gap-2">
        {categories.slice(0, 6).map((c) => (
          <li key={c.name} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="flex-1 truncate text-muted">{t(`fin.cat.${c.name}`, c.name)}</span>
            <span className={`num ${blur ? "money-blur" : ""}`}>{eur(Math.round(c.amount))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
