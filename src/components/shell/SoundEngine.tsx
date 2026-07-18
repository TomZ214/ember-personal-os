"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useEmber } from "@/lib/store";
import { configureSound, playCue, primeAudio } from "@/lib/sound";

/**
 * Keeps the synth in step with the user's settings and unlocks the audio
 * context on the first real gesture.
 *
 * Browsers refuse to start an AudioContext before a user interaction, so the
 * boot swell is played on that first gesture rather than queued — a startup
 * sound arriving five seconds late is worse than none at all.
 */
export function SoundEngine() {
  const sound = useEmber((s) => s.settings.sound ?? true);
  const volume = useEmber((s) => s.settings.soundVolume ?? 0.5);
  const pathname = usePathname();
  const firstRoute = useRef(true);

  useEffect(() => {
    configureSound(sound, volume);
  }, [sound, volume]);

  /**
   * A tick on every button/link press. This is what makes the app feel
   * physical — without it the only audible things are toasts, so most of the
   * interface is silent. Delegated from the document so it covers every
   * control in the app, including ones added later.
   */
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "button, a[href], [role='button'], summary",
      );
      if (!el || (el as HTMLButtonElement).disabled) return;
      playCue("tap");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);

  /** a soft two-note rise whenever the route actually changes */
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    playCue("navigate");
  }, [pathname]);

  /**
   * The boot swell should land WITH the logo, not whenever the user happens to
   * click. So: try immediately, and only fall back to the first gesture if the
   * browser's autoplay policy blocked us — and even then only briefly. A
   * startup sound arriving ten seconds into the session is worse than silence.
   */
  useEffect(() => {
    let done = false;
    let giveUp = 0;
    const attempt = () => {
      if (done) return;
      primeAudio(); // resume() is async, so check on the next tick
      window.setTimeout(() => {
        if (!done && playCue("boot")) done = true;
      }, 30);
    };

    // Desktop and returning visitors usually get it right here.
    attempt();

    // iOS — and a home-screen PWA especially — blocks audio outright until the
    // user touches the screen, so the immediate attempt can never succeed
    // there. Only once we know we were blocked do we arm the gesture fallback,
    // and then generously: the first tap after watching the boot animation is
    // the real "entering the app" moment, and cutting that off after a few
    // seconds meant phones simply never got a startup sound.
    const arm = window.setTimeout(() => {
      if (done) return;
      window.addEventListener("pointerdown", attempt);
      window.addEventListener("keydown", attempt);
      giveUp = window.setTimeout(() => {
        done = true;
      }, 20000);
    }, 150);

    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(giveUp);
      window.removeEventListener("pointerdown", attempt);
      window.removeEventListener("keydown", attempt);
    };
  }, []);

  return null;
}
