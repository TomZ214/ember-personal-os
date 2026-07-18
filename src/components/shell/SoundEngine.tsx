"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    configureSound(sound, volume);
  }, [sound, volume]);

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
