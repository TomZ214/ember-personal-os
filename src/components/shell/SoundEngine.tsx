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

  useEffect(() => {
    let played = false;
    const unlock = () => {
      primeAudio();
      if (!played) {
        played = true;
        // a beat after the gesture so the swell doesn't collide with the
        // click sound of whatever the user actually pressed
        window.setTimeout(() => playCue("boot"), 90);
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return null;
}
