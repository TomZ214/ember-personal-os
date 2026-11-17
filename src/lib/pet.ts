/**
 * The cat: what it is, and how it changes.
 *
 * Pure functions over a small serialisable record, so the store, the cloud
 * snapshot and the tests all agree on one model. Nothing here knows about
 * three.js or React.
 *
 * Time. The record says how the cat was at `updatedAt`; how it is now is
 * worked out from the clock (`tickPet`) whenever it is shown. Nothing is
 * written once a minute: a write would push a cloud snapshot every minute.
 * The record is written only when something happens to the cat.
 *
 * Kindness. Every value has a floor above nothing: a cat left alone for a
 * week is hungry, a bit lonely and a bit low, and is fine again after one
 * meal and a scratch behind the ears. It never dies, never runs away, never
 * holds a grudge, and the app never nags about it.
 */

export const COATS = ["tabby", "ginger", "black", "white", "grey", "calico"] as const;
export type CoatId = (typeof COATS)[number];

export interface PetState {
  name: string;
  coat: CoatId;
  /** 0 empty tummy … 100 full. Shown as "fullness" so every bar reads "more is better". */
  fullness: number;
  /** 0 low … 100 delighted */
  mood: number;
  /** 0 worn out … 100 full of beans */
  energy: number;
  /** 0 aloof … 100 adores you */
  affection: number;
  /** treats in the jar, earned by finishing tasks and keeping habits */
  treats: number;
  /** epoch ms: the values above are true as of this moment */
  updatedAt: number;
  /** epoch ms: when someone last looked in on the cat (page or widget) */
  lastSeen: number;
  /** epoch ms the cat moved in */
  adoptedAt: number;
  /**
   * Keys of the completions already rewarded ("t:<task id>", "h:<habit id>:<day>"),
   * so a task ticked, unticked and ticked again, or a snapshot arriving from
   * another device, never pays twice. Newest last, capped.
   */
  rewarded: string[];
  /** epoch ms of the last reward, for the "earned a treat" note */
  lastRewardAt?: number;
}

/** values never go below these — sad and sleepy are allowed, gone is not */
export const FLOOR = { fullness: 0, mood: 12, energy: 8, affection: 20 } as const;
export const MAX_TREATS = 30;
const REWARD_MEMORY = 400;
/** decay is computed over at most this long; past it the floors hold anyway */
const MAX_ELAPSED_H = 24 * 7;

/** per hour, while time passes */
export const RATES = {
  /** a full cat is peckish after about half a day */
  hunger: 5.5,
  /** cats sleep most of the day: rest comes back on its own */
  rest: 7,
  /** affection fades slowly and never below its floor */
  fade: 0.6,
  /** mood drifts toward how fed and loved the cat is */
  moodDrift: 10,
} as const;

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

export function newPet(now = Date.now(), name = "Mochi"): PetState {
  return {
    name,
    coat: "tabby",
    fullness: 75,
    mood: 70,
    energy: 80,
    affection: 45,
    treats: 2,
    updatedAt: now,
    lastSeen: now,
    adoptedAt: now,
    rewarded: [],
  };
}

const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** a pet record with every field present and in range, from whatever was stored */
export function withPetDefaults(raw: Partial<PetState> | undefined | null, now = Date.now()): PetState {
  const base = newPet(now);
  if (!raw || typeof raw !== "object") return base;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 24) : base.name;
  return {
    name,
    coat: COATS.includes(raw.coat as CoatId) ? (raw.coat as CoatId) : base.coat,
    fullness: clamp(finite(raw.fullness, base.fullness), FLOOR.fullness),
    mood: clamp(finite(raw.mood, base.mood), FLOOR.mood),
    energy: clamp(finite(raw.energy, base.energy), FLOOR.energy),
    affection: clamp(finite(raw.affection, base.affection), FLOOR.affection),
    treats: Math.round(clamp(finite(raw.treats, base.treats), 0, MAX_TREATS)),
    updatedAt: finite(raw.updatedAt, now),
    lastSeen: finite(raw.lastSeen, now),
    adoptedAt: finite(raw.adoptedAt, now),
    rewarded: Array.isArray(raw.rewarded) ? raw.rewarded.filter((k) => typeof k === "string").slice(-REWARD_MEMORY) : [],
    ...(typeof raw.lastRewardAt === "number" ? { lastRewardAt: raw.lastRewardAt } : {}),
  };
}

/** where mood settles on its own, given how fed and how loved the cat is */
export function moodBaseline(p: Pick<PetState, "fullness" | "affection" | "energy">): number {
  return clamp(30 + p.fullness * 0.3 + p.affection * 0.3 + p.energy * 0.1, FLOOR.mood, 92);
}

/**
 * The cat as it is at `now`. Pure: the stored record is not touched, and a
 * clock that went backwards changes nothing.
 */
export function tickPet(p: PetState, now = Date.now()): PetState {
  const h = Math.min(MAX_ELAPSED_H, Math.max(0, (now - p.updatedAt) / 3_600_000));
  if (h <= 0) return p;
  const fullness = clamp(p.fullness - RATES.hunger * h, FLOOR.fullness);
  const energy = clamp(p.energy + RATES.rest * h, FLOOR.energy);
  const affection = clamp(p.affection - RATES.fade * h, FLOOR.affection, Math.max(FLOOR.affection, p.affection));
  // mood eases toward the baseline of the cat at the end of the stretch:
  // exponential, so a short gap moves it a little and a long one all the way
  const target = moodBaseline({ fullness, affection, energy });
  const k = 1 - Math.exp(-(RATES.moodDrift / 50) * h);
  const mood = clamp(p.mood + (target - p.mood) * k, FLOOR.mood);
  return { ...p, fullness, energy, affection, mood, updatedAt: now };
}

export type PetAction =
  /** a bowl of food: the real meal */
  | { kind: "feed" }
  /** one treat from the jar */
  | { kind: "treat" }
  /** stroking, for this many seconds */
  | { kind: "stroke"; seconds: number }
  /** chasing the laser or the ball, for this many seconds */
  | { kind: "play"; seconds: number }
  /** a tap: the cat noticed you */
  | { kind: "boop" };

/** what a moment with the cat does to it. Applies the time passed first. */
export function actOnPet(prev: PetState, action: PetAction, now = Date.now()): PetState {
  const p = tickPet(prev, now);
  const at = { ...p, updatedAt: now, lastSeen: now };
  switch (action.kind) {
    case "feed": {
      // a full cat sniffs the bowl and leaves most of it
      const room = 100 - p.fullness;
      const eaten = Math.min(room, 40);
      return {
        ...at,
        fullness: clamp(p.fullness + eaten),
        mood: clamp(p.mood + (room > 20 ? 8 : 1), FLOOR.mood),
        affection: clamp(p.affection + (room > 20 ? 3 : 0), FLOOR.affection),
      };
    }
    case "treat": {
      if (p.treats <= 0) return p;
      return {
        ...at,
        treats: p.treats - 1,
        fullness: clamp(p.fullness + 6),
        mood: clamp(p.mood + 12, FLOOR.mood),
        affection: clamp(p.affection + 5, FLOOR.affection),
      };
    }
    case "stroke": {
      const s = Math.min(30, Math.max(0, action.seconds));
      if (s <= 0) return p;
      // a tired cat loves it even more; a full-up affection meter still lifts mood
      return {
        ...at,
        affection: clamp(p.affection + s * 0.9, FLOOR.affection),
        mood: clamp(p.mood + s * 0.8, FLOOR.mood),
      };
    }
    case "play": {
      const s = Math.min(30, Math.max(0, action.seconds));
      if (s <= 0) return p;
      return {
        ...at,
        mood: clamp(p.mood + s * 1.1, FLOOR.mood),
        affection: clamp(p.affection + s * 0.25, FLOOR.affection),
        energy: clamp(p.energy - s * 0.9, FLOOR.energy),
        fullness: clamp(p.fullness - s * 0.15, FLOOR.fullness),
      };
    }
    case "boop":
      return { ...at, mood: clamp(p.mood + 1, FLOOR.mood) };
  }
}

/**
 * A treat for something done. Idempotent per key: the same completion never
 * pays twice, whichever device sees it first.
 */
export function rewardPet(prev: PetState, key: string, now = Date.now()): PetState {
  if (prev.rewarded.includes(key)) return prev;
  const p = tickPet(prev, now);
  return {
    ...p,
    treats: Math.min(MAX_TREATS, p.treats + 1),
    mood: clamp(p.mood + 3, FLOOR.mood),
    rewarded: [...p.rewarded, key].slice(-REWARD_MEMORY),
    lastRewardAt: now,
    updatedAt: now,
  };
}

export const taskRewardKey = (taskId: string) => `t:${taskId}`;
export const habitRewardKey = (habitId: string, day: string) => `h:${habitId}:${day}`;

/* ---- how the cat is, in words ------------------------------------------ */

export type PetNeed = "hungry" | "tired" | "lonely" | "bored" | null;

/** the most pressing thing, if anything is — a hint, never a warning */
export function petNeed(p: PetState): PetNeed {
  if (p.fullness < 30) return "hungry";
  if (p.energy < 22) return "tired";
  if (p.affection < 32) return "lonely";
  if (p.mood < 40) return "bored";
  return null;
}

export type PetMoodWord = "delighted" | "happy" | "content" | "meh" | "low";

export function moodWord(p: PetState): PetMoodWord {
  if (p.mood >= 85) return "delighted";
  if (p.mood >= 65) return "happy";
  if (p.mood >= 45) return "content";
  if (p.mood >= 28) return "meh";
  return "low";
}

/** away this long and the cat comes to say hello */
export const GREET_AFTER_MS = 30 * 60_000;
