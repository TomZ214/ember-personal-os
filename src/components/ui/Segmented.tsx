"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { SPRING } from "@/lib/motion";

interface Option<T extends string> {
  id: T;
  label: React.ReactNode;
}

interface Props<T extends string> {
  value: T;
  onChange: (id: T) => void;
  options: readonly Option<T>[];
  /** what the group chooses between, for screen readers */
  label: string;
  /** `tabs` when the choice swaps the content below it, `toggle` when it only sets an option */
  role?: "tabs" | "toggle";
  className?: string;
}

/**
 * The one way this app switches between a few views of the same thing: a
 * track with a single raised segment that glides to the choice.
 *
 * Tabs used to be rows of full buttons, the chosen one filled with the brand
 * gradient. That made every tab bar a row of calls to action, and put a
 * second primary button next to the real one in the page header.
 */
export function Segmented<T extends string>({ value, onChange, options, label, role = "tabs", className = "" }: Props<T>) {
  // one shared pill per control, however many controls are on the page
  const pill = useId();
  const tabs = role === "tabs";
  return (
    <div
      role={tabs ? "tablist" : "group"}
      aria-label={label}
      className={`inline-flex rounded-[11px] border border-white/[0.08] bg-white/[0.04] p-0.5 ${className}`}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role={tabs ? "tab" : undefined}
            aria-selected={tabs ? on : undefined}
            aria-pressed={tabs ? undefined : on}
            onClick={() => onChange(o.id)}
            // the pill is the feedback; a segment that shrinks under it fights it
            className={`relative flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-medium [--press-scale:1] ${
              on ? "text-ink" : "text-faint hover:text-muted"
            }`}
          >
            {on && (
              <motion.span
                layoutId={pill}
                aria-hidden
                className="absolute inset-0 rounded-[9px] bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                transition={SPRING.snappy}
              />
            )}
            <span className="relative flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
