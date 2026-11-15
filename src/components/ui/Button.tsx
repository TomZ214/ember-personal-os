"use client";

import { forwardRef } from "react";

type Variant = "primary" | "subtle" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const styles: Record<Variant, string> = {
  primary:
    "glow-brand glow-hover bg-[image:var(--grad-sunset)] font-semibold text-(--on-sunset) hover:brightness-110 disabled:shadow-none",
  subtle:
    // the inset pair is a bevel: lit top edge, shaded bottom edge
    "bg-white/[0.06] text-ink border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-1px_0_rgba(0,0,0,0.16)] hover:bg-white/[0.10] hover:border-white/[0.14]",
  ghost: "text-muted hover:text-ink hover:bg-white/[0.06]",
  danger:
    "bg-danger/15 text-[oklch(0.78_0.13_25)] border border-danger/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(0,0,0,0.16)] hover:bg-danger/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[9px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[11px]",
};

/**
 * A plain <button>. Its motion is not here: the press (sinks in, springs
 * back) and the eased colours are the "controls" recipe in globals.css, which
 * every button in the app shares — so this one feels exactly like a chip, an
 * icon button or a tab, and none of the 140 places that render it mounts an
 * animation component to get there.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "subtle", size = "md", className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      /* Magnetism is opt-in per element via this attribute — LightingProvider
         picks it up globally, so there is no MagneticButton wrapper to keep in
         sync with this one. Primary actions only: if everything leans toward
         the cursor, nothing reads as important. */
      data-magnetic={variant === "primary" && !disabled ? "" : undefined}
      className={`inline-flex select-none items-center justify-center font-medium disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
