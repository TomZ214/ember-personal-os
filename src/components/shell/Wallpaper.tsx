"use client";

import { useEmber } from "@/lib/store";
import { WALLPAPERS } from "@/lib/types";

/**
 * The desktop picture.
 *
 * Sits below everything, above nothing. Independent of the theme by design:
 * the accent ramp decides what the buttons look like, this decides what is
 * behind them, and neither needs to know about the other.
 *
 * Two things make it usable rather than just pretty:
 *
 *  1. A scrim. A photograph has bright regions, and white text over a cloud is
 *     unreadable. The scrim is heavier for wallpapers marked light, so the
 *     interface keeps one text colour instead of trying to adapt per pixel.
 *  2. It replaces the ambient gradient rather than layering over it — two
 *     backgrounds fighting each other reads as muddy, never as depth.
 *
 * The glass benefits: with a picture behind them, blurred surfaces finally
 * have something to refract, which is what the material was built for.
 */
export function Wallpaper() {
  const id = useEmber((s) => s.settings.wallpaper ?? "none");
  const paper = WALLPAPERS.find((w) => w.id === id);

  // One element owns the background, always. Rendering the ambient wash here
  // rather than beside this component is what guarantees the two can never be
  // on screen together — two backgrounds layered reads as muddy, not as depth.
  if (!paper?.file) return <div className="ambient parallax-bg" aria-hidden />;

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${paper.file})` }}
      />
      {/* the scrim: enough to guarantee text contrast, not so much that the
          picture becomes a grey rectangle */}
      <div
        className="absolute inset-0"
        style={{
          background: paper.dark
            ? "linear-gradient(180deg, oklch(0 0 0 / 0.35), oklch(0 0 0 / 0.55))"
            : "linear-gradient(180deg, oklch(0 0 0 / 0.55), oklch(0 0 0 / 0.72))",
        }}
      />
      {/* a breath of the accent, so a wallpaper still feels like it belongs to
          the current theme rather than sitting under a different app */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          background:
            "radial-gradient(60rem 40rem at 15% 105%, var(--primary), transparent 60%)",
        }}
      />
    </div>
  );
}
