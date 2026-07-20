"use client";

import { motion } from "framer-motion";
import { CATEGORY_VAR, type CategoryColor } from "@/lib/types";

export function Badge({
  color,
  children,
  className = "",
}: {
  color?: CategoryColor;
  children: React.ReactNode;
  className?: string;
}) {
  const c = color ? CATEGORY_VAR[color] : "var(--muted)";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
      style={{
        color: c,
        borderColor: `color-mix(in oklch, ${c} 35%, transparent)`,
        background: `color-mix(in oklch, ${c} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ color, size = 7 }: { color: CategoryColor | string; size?: number }) {
  const c = (color in CATEGORY_VAR ? CATEGORY_VAR[color as CategoryColor] : color) as string;
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: c, boxShadow: `0 0 8px color-mix(in oklch, ${c} 60%, transparent)` }}
    />
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-white/[0.12] bg-white/[0.06] px-1.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  color = "var(--accent)",
  children,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* overflow-visible: the arc's glow extends past the ring, and an SVG
          clips to its own box by default — without this the soft halo is
          sliced into a hard square and you see the corners. The parent div
          does not clip, so the glow can spill into it cleanly. */}
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          // currentColor + .lit: the arc glows in whatever colour it is drawn
          // in, and the radius tracks the stroke weight so a hairline ring
          // does not get the same bloom as a heavy one
          stroke="currentColor"
          className="lit"
          style={{ color, "--lit-glow": `${Math.max(3, stroke * 1.1)}px` } as React.CSSProperties}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - Math.min(1, Math.max(0, value))) }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, color = "var(--accent)" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <motion.div
        className="lit h-full rounded-full"
        style={{ color, background: "currentColor", "--lit-glow": "4px" } as React.CSSProperties}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        transition={{ type: "spring", stiffness: 60, damping: 20 }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-muted">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
      <p className="max-w-[34ch] text-sm text-muted">{hint}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
