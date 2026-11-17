"use client";

import { audioContext, soundVolume } from "@/lib/sound";
import { useEmber } from "@/lib/store";

/**
 * The cat's voice, synthesised like every other sound in Ember: no audio
 * files. Off unless switched on in Settings (petSounds); the volume follows
 * the master volume.
 *
 * Meow: a buzzy source through two formant filters that glide from "ee" to
 * "ah" to "oo" while the pitch rises and falls — "mi-a-ow".
 * Purr: low filtered noise pulsing ~25 times a second, swelling and easing
 * with each breath.
 */

const on = () => !!useEmber.getState().settings.petSounds;
const level = () => Math.max(0, Math.min(1, soundVolume()));

export type MeowKind = "hello" | "ask" | "happy" | "sleepy";

export function meow(kind: MeowKind = "hello") {
  if (!on() || level() <= 0) return;
  const c = audioContext();
  if (!c) return;
  const now = c.currentTime + 0.01;
  const dur = kind === "ask" ? 0.72 : kind === "sleepy" ? 0.5 : kind === "happy" ? 0.42 : 0.56;
  // a small cat: high voice; a little random so no two meows are the same
  const pitch = 560 * (0.92 + Math.random() * 0.16) * (kind === "sleepy" ? 0.85 : 1);

  const out = c.createGain();
  out.gain.value = level() * 0.32;
  out.connect(c.destination);

  const src = c.createOscillator();
  src.type = "sawtooth";
  src.frequency.setValueAtTime(pitch * 0.85, now);
  src.frequency.linearRampToValueAtTime(pitch * 1.25, now + dur * 0.35);
  src.frequency.linearRampToValueAtTime(kind === "ask" ? pitch * 1.4 : pitch * 0.78, now + dur);
  // a touch of vibrato keeps it from sounding like a synth
  const vib = c.createOscillator();
  const vibDepth = c.createGain();
  vib.frequency.value = 7;
  vibDepth.gain.value = pitch * 0.015;
  vib.connect(vibDepth).connect(src.frequency);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(1, now + 0.06);
  env.gain.setValueAtTime(1, now + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  // formants: ee → ah → oo
  const f1 = c.createBiquadFilter();
  f1.type = "bandpass";
  f1.Q.value = 5;
  f1.frequency.setValueAtTime(380, now);
  f1.frequency.linearRampToValueAtTime(950, now + dur * 0.45);
  f1.frequency.linearRampToValueAtTime(520, now + dur);
  const f2 = c.createBiquadFilter();
  f2.type = "bandpass";
  f2.Q.value = 7;
  f2.frequency.setValueAtTime(2500, now);
  f2.frequency.linearRampToValueAtTime(1450, now + dur * 0.45);
  f2.frequency.linearRampToValueAtTime(950, now + dur);
  const g2 = c.createGain();
  g2.gain.value = 0.6;

  src.connect(env);
  env.connect(f1).connect(out);
  env.connect(f2).connect(g2).connect(out);

  src.start(now);
  vib.start(now);
  src.stop(now + dur + 0.05);
  vib.stop(now + dur + 0.05);
  window.setTimeout(() => out.disconnect(), (dur + 0.3) * 1000);
}

let purring: { stop: () => void } | null = null;

export function startPurr() {
  if (purring || !on() || level() <= 0) return;
  const c = audioContext();
  if (!c) return;
  const now = c.currentTime;

  // two seconds of brownish noise, looped
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
    data[i] = last * 3;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;

  // the rumble: amplitude pulsing ~25 Hz
  const pulse = c.createGain();
  pulse.gain.value = 0.5;
  const lfo = c.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 25;
  const lfoDepth = c.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth).connect(pulse.gain);

  // the breath: in, out, a little louder on the out-breath
  const breath = c.createGain();
  breath.gain.value = 0.75;
  const br = c.createOscillator();
  br.frequency.value = 0.55;
  const brDepth = c.createGain();
  brDepth.gain.value = 0.25;
  br.connect(brDepth).connect(breath.gain);

  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(level() * 0.55, now + 0.5);

  src.connect(lp).connect(pulse).connect(breath).connect(master).connect(c.destination);
  src.start(now);
  lfo.start(now);
  br.start(now);

  purring = {
    stop: () => {
      const t = c.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      for (const n of [src, lfo, br]) n.stop(t + 0.65);
      window.setTimeout(() => master.disconnect(), 800);
    },
  };
}

export function stopPurr() {
  purring?.stop();
  purring = null;
}
