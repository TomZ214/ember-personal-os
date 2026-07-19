"use client";

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

type Variant = "primary" | "subtle" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends HTMLMotionProps<"button"> {
  variant?: Variant;
  size?: Size;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-[image:var(--grad-sunset)] font-semibold text-(--on-sunset) transition-[filter] hover:brightness-110 shadow-[0_2px_16px_-2px_var(--primary-glow)] disabled:shadow-none",
  subtle:
    "bg-white/[0.06] text-ink border border-white/[0.08] hover:bg-white/[0.10] hover:border-white/[0.14]",
  ghost: "text-muted hover:text-ink hover:bg-white/[0.06]",
  danger: "bg-danger/15 text-[oklch(0.78_0.13_25)] border border-danger/25 hover:bg-danger/25",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[9px]",
  md: "h-10 px-4 text-sm gap-2 rounded-[11px]",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "subtle", size = "md", className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled}
      /* Magnetism is opt-in per element via this attribute — LightingProvider
         picks it up globally, so there is no MagneticButton wrapper to keep in
         sync with this one. Primary actions only: if everything leans toward
         the cursor, nothing reads as important. */
      data-magnetic={variant === "primary" && !disabled ? "" : undefined}
      className={`inline-flex select-none items-center justify-center font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${styles[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
