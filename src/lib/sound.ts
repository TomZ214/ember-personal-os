"use client";

/**
 * EmberOS sound design.
 *
 * Every cue is synthesised with the Web Audio API rather than shipped as an
 * audio file: no network cost, no decoding, nothing to lazy-load, and the
 * whole palette is tuned from one place. Cues are deliberately short, soft and
 * built from consonant intervals so they read as "system feedback" rather than
 * as notification jingles.
 *
 * Nothing here throws if audio is unavailable or blocked — sound is a garnish,
 * never a dependency.
 */

export type Cue =
  | "boot"
  | "tap"
  | "navigate"
  | "open"
  | "close"
  | "success"
  | "error"
  | "notify"
  | "sync"
  | "send";

interface Note {
  /** frequency in Hz */
  f: number;
  /** start offset in seconds */
  t: number;
  /** duration in seconds */
  d: number;
  type?: OscillatorType;
  /** relative gain 0..1 */
  g?: number;
}

/* A quiet, mostly-sine palette. Fifths and major thirds for the positive cues,
   a soft low fall for errors. Nothing longer than ~0.4s except the boot swell. */
const CUES: Record<Cue, Note[]> = {
  // the workhorse: fires on every button/link press, so it has to be almost
  // subliminal — a short high tick you feel more than hear
  tap: [{ f: 1050, t: 0, d: 0.028, g: 0.22 }],
  navigate: [
    { f: 587.33, t: 0, d: 0.05, g: 0.3 },
    { f: 880.0, t: 0.035, d: 0.08, g: 0.22 },
  ],
  open: [
    { f: 523.25, t: 0, d: 0.09, g: 0.5 },
    { f: 783.99, t: 0.04, d: 0.13, g: 0.4 },
  ],
  close: [
    { f: 659.25, t: 0, d: 0.08, g: 0.45 },
    { f: 392.0, t: 0.038, d: 0.12, g: 0.35 },
  ],
  success: [
    { f: 523.25, t: 0, d: 0.11, g: 0.5 },
    { f: 659.25, t: 0.055, d: 0.11, g: 0.45 },
    { f: 987.77, t: 0.11, d: 0.2, g: 0.35 },
  ],
  error: [
    { f: 196.0, t: 0, d: 0.15, type: "triangle", g: 0.45 },
    { f: 146.83, t: 0.075, d: 0.2, type: "triangle", g: 0.35 },
  ],
  notify: [
    { f: 880.0, t: 0, d: 0.12, g: 0.4 },
    { f: 1318.51, t: 0.045, d: 0.18, g: 0.28 },
  ],
  sync: [
    { f: 587.33, t: 0, d: 0.07, g: 0.4 },
    { f: 880.0, t: 0.065, d: 0.13, g: 0.32 },
  ],
  send: [
    { f: 440.0, t: 0, d: 0.06, g: 0.4 },
    { f: 659.25, t: 0.045, d: 0.09, g: 0.35 },
    { f: 880.0, t: 0.09, d: 0.15, g: 0.28 },
  ],
  // a warm swell that arrives with the logo rather than announcing itself
  boot: [
    { f: 130.81, t: 0, d: 0.85, type: "triangle", g: 0.45 },
    { f: 261.63, t: 0.1, d: 0.8, g: 0.4 },
    { f: 392.0, t: 0.28, d: 0.7, g: 0.3 },
    { f: 523.25, t: 0.46, d: 0.6, g: 0.24 },
  ],
};

let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.5;

/** Kept in sync with the user's settings by <SoundEngine />. */
export function configureSound(on: boolean, vol: number) {
  enabled = on;
  volume = Math.min(1, Math.max(0, vol));
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // Browsers start the context suspended until a gesture; resuming is a
    // no-op once it's already running.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Unlock audio on the first real user gesture. Autoplay policy blocks the
 * context before that, so the boot cue is simply skipped rather than queued —
 * a sound arriving seconds late is worse than no sound.
 */
export function primeAudio() {
  audio();
}

export function playCue(cue: Cue) {
  if (!enabled || volume <= 0) return;
  const c = audio();
  if (!c || c.state !== "running") return;

  const now = c.currentTime;
  // one shared bus so the master volume can't be exceeded by stacked cues
  const bus = c.createGain();
  bus.gain.value = volume * 0.16;
  bus.connect(c.destination);

  for (const n of CUES[cue]) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.f, now + n.t);

    // exponential ramps: linear ones click audibly at these durations
    const peak = Math.max(0.0002, n.g ?? 1);
    gain.gain.setValueAtTime(0.0001, now + n.t);
    gain.gain.exponentialRampToValueAtTime(peak, now + n.t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);

    osc.connect(gain);
    gain.connect(bus);
    osc.start(now + n.t);
    osc.stop(now + n.t + n.d + 0.03);
  }

  // release the bus once the longest note has decayed
  const tail = Math.max(...CUES[cue].map((n) => n.t + n.d)) + 0.1;
  window.setTimeout(() => bus.disconnect(), tail * 1000 + 60);
}
