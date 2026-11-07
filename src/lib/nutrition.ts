/**
 * Calorie tracker — data model and pure logic. No React, no storage: the
 * store keeps the state, this file only calculates. Every number that comes
 * from outside (Open Food Facts, the AI estimate, a form) goes through a
 * sanitiser here before it can reach the store.
 */

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export const MEALS: Meal[] = ["breakfast", "lunch", "snack", "dinner"];

export type Unit = "g" | "ml";

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A food in the library. Macros are per 100 g (or 100 ml). */
export interface Food extends Macros {
  id: string;
  name: string;
  /** English name for built-in foods */
  nameEn?: string;
  brand?: string;
  unit?: Unit;
  /** one serving in g/ml */
  serving?: number;
  barcode?: string;
  source: "builtin" | "custom" | "off" | "ai";
}

/** One logged item. Macros are the totals for `amount`. */
export interface FoodEntry extends Macros {
  id: string;
  /** yyyy-MM-dd */
  date: string;
  meal: Meal;
  name: string;
  brand?: string;
  /** g or ml; 0 for a quick calorie entry without an amount */
  amount: number;
  unit: Unit;
  /** per-100 values, so changing the amount recalculates; null for quick entries */
  per100: Macros | null;
  source: Food["source"] | "quick";
  createdAt: string;
}

export interface WeightEntry {
  /** yyyy-MM-dd, one per day */
  date: string;
  kg: number;
}

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very";
export type GoalKind = "lose" | "maintain" | "gain";
export type MacroPreset = "balanced" | "protein" | "lowcarb";

export interface NutritionProfile {
  setupDone: boolean;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: GoalKind;
  /** kg per week to lose or gain */
  rate: number;
  macroPreset: MacroPreset;
  /** overrides the calculated calorie target when set */
  manualKcal: number | null;
  waterGoalMl: number;
}

export interface NutritionState {
  profile: NutritionProfile;
  entries: FoodEntry[];
  /** the user's own foods */
  foods: Food[];
  /** yyyy-MM-dd → ml */
  water: Record<string, number>;
  weights: WeightEntry[];
}

export const DEFAULT_PROFILE: NutritionProfile = {
  setupDone: false,
  sex: "male",
  age: 25,
  heightCm: 178,
  weightKg: 75,
  activity: "moderate",
  goal: "maintain",
  rate: 0.5,
  macroPreset: "balanced",
  manualKcal: null,
  waterGoalMl: 2500,
};

export const emptyNutrition = (): NutritionState => ({
  profile: { ...DEFAULT_PROFILE },
  entries: [],
  foods: [],
  water: {},
  weights: [],
});

/* ---------------- targets ---------------- */

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
};

/** share of calories from protein / carbs / fat */
export const MACRO_SPLIT: Record<MacroPreset, { protein: number; carbs: number; fat: number }> = {
  balanced: { protein: 0.3, carbs: 0.4, fat: 0.3 },
  protein: { protein: 0.4, carbs: 0.35, fat: 0.25 },
  lowcarb: { protein: 0.35, carbs: 0.2, fat: 0.45 },
};

export const RATES = [0.25, 0.5, 0.75, 1] as const;

/** a kilogram of body fat ≈ 7700 kcal */
const KCAL_PER_KG = 7700;
/** never suggest less than this, whatever the goal */
const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

/** basal metabolic rate, Mifflin-St Jeor */
export function bmr(p: Pick<NutritionProfile, "sex" | "age" | "heightCm" | "weightKg">): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
}

/** total daily energy expenditure */
export function tdee(p: NutritionProfile): number {
  return bmr(p) * ACTIVITY_FACTOR[p.activity];
}

const round10 = (n: number) => Math.round(n / 10) * 10;

export interface Targets extends Macros {
  bmr: number;
  tdee: number;
  /** true when the goal had to be raised to the safe minimum */
  clamped: boolean;
}

export function targets(p: NutritionProfile): Targets {
  const base = tdee(p);
  const daily = (p.rate * KCAL_PER_KG) / 7;
  const wanted = p.goal === "lose" ? base - daily : p.goal === "gain" ? base + daily : base;
  const floor = MIN_KCAL[p.sex];
  let kcal = round10(Math.max(wanted, floor));
  const clamped = p.manualKcal == null && wanted < floor;
  if (p.manualKcal != null && Number.isFinite(p.manualKcal) && p.manualKcal > 0) kcal = Math.round(p.manualKcal);
  const split = MACRO_SPLIT[p.macroPreset];
  return {
    kcal,
    protein: Math.round((kcal * split.protein) / 4),
    carbs: Math.round((kcal * split.carbs) / 4),
    fat: Math.round((kcal * split.fat) / 9),
    bmr: Math.round(bmr(p)),
    tdee: Math.round(base),
    clamped,
  };
}

/* ---------------- arithmetic ---------------- */

const r1 = (n: number) => Math.round(n * 10) / 10;

export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** totals for `amount` g/ml of a food given per 100 */
export function scale(per100: Macros, amount: number): Macros {
  const f = amount / 100;
  return {
    kcal: Math.round(per100.kcal * f),
    protein: r1(per100.protein * f),
    carbs: r1(per100.carbs * f),
    fat: r1(per100.fat * f),
  };
}

export function sum(items: Macros[]): Macros {
  const t = items.reduce(
    (a, b) => ({ kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat }),
    { ...ZERO },
  );
  return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat) };
}

export const entriesOn = (entries: FoodEntry[], day: string) => entries.filter((e) => e.date === day);

/** the meal a new entry most likely belongs to, by the local time of day */
export function mealForTime(date: Date): Meal {
  const m = date.getHours() * 60 + date.getMinutes();
  if (m >= 4 * 60 && m < 10 * 60 + 30) return "breakfast";
  if (m >= 10 * 60 + 30 && m < 14 * 60 + 30) return "lunch";
  if (m >= 17 * 60 && m < 21 * 60 + 30) return "dinner";
  return "snack";
}

/* ---------------- dates (local, yyyy-MM-dd) ---------------- */

export function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d + by);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** kcal per day for the `days` days ending at `end` (oldest first) */
export function dailyKcal(entries: FoodEntry[], end: string, days: number): { day: string; kcal: number; logged: boolean }[] {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.kcal);
  return Array.from({ length: days }, (_, i) => {
    const day = shiftDay(end, i - days + 1);
    return { day, kcal: Math.round(byDay.get(day) ?? 0), logged: byDay.has(day) };
  });
}

/** consecutive days with at least one entry, ending today (or yesterday, so the
 *  streak survives the morning before the first meal is logged) */
export function streak(entries: FoodEntry[], today: string): number {
  const days = new Set(entries.map((e) => e.date));
  let day = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

/** 7-entry moving average of the weight log (oldest first) */
export function weightTrend(weights: WeightEntry[]): { date: string; kg: number; trend: number }[] {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((w, i) => {
    const window = sorted.slice(Math.max(0, i - 6), i + 1);
    return { ...w, trend: r1(window.reduce((s, x) => s + x.kg, 0) / window.length) };
  });
}

/* ---------------- search ---------------- */

export const normalize = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();

/** local search: prefix matches first, then word starts, then substrings */
export function searchFoods(query: string, foods: Food[], limit = 30): Food[] {
  const q = normalize(query);
  if (!q) return foods.slice(0, limit);
  const words = q.split(" ");
  const scored: { food: Food; score: number }[] = [];
  for (const food of foods) {
    const hay = normalize([food.name, food.nameEn, food.brand].filter(Boolean).join(" "));
    if (!words.every((w) => hay.includes(w))) continue;
    const name = normalize(food.name);
    const en = normalize(food.nameEn);
    const score =
      name.startsWith(q) || en.startsWith(q) ? 0 : ` ${hay}`.includes(` ${words[0]}`) ? 1 : 2;
    scored.push({ food, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.food.name.length - b.food.name.length)
    .slice(0, limit)
    .map((s) => s.food);
}

/** foods eaten recently, newest first, one per name+brand */
export function recentFoods(entries: FoodEntry[], limit = 12): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const e of sorted) {
    if (!e.per100) continue;
    const key = `${normalize(e.name)}|${normalize(e.brand)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `recent:${key}`, name: e.name, brand: e.brand, unit: e.unit, serving: e.amount || undefined,
      source: e.source === "quick" ? "custom" : e.source, ...e.per100,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------------- sanitising outside data ---------------- */

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** validated macros; null when calories are missing or implausible. Defaults
 *  fit per-100 values (≤ 950 kcal, ≤ 100 g of any macro); totals pass wider limits. */
export function cleanMacros(
  raw: { kcal?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown },
  maxKcal = 950,
  maxPart = 100,
): Macros | null {
  const kcal = num(raw.kcal);
  if (kcal == null || kcal < 0 || kcal > maxKcal) return null;
  const part = (v: unknown) => r1(clamp(num(v) ?? 0, 0, maxPart));
  return { kcal: Math.round(kcal), protein: part(raw.protein), carbs: part(raw.carbs), fat: part(raw.fat) };
}

/** Open Food Facts product → Food, or null when it has no usable nutrition data */
export function parseOffProduct(p: unknown): Food | null {
  if (!p || typeof p !== "object") return null;
  const prod = p as Record<string, unknown>;
  const n = (prod.nutriments ?? {}) as Record<string, unknown>;
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy-kj_100g"] ?? n["energy_100g"]);
    if (kj != null) kcal = kj / 4.184;
  }
  const macros = cleanMacros({ kcal, protein: n.proteins_100g, carbs: n.carbohydrates_100g, fat: n.fat_100g });
  const name = String(prod.product_name_de || prod.product_name || "").trim().slice(0, 120);
  if (!macros || !name) return null;
  const code = String(prod.code ?? "").replace(/\D/g, "");
  const serving = num(prod.serving_quantity);
  const unitHint = `${prod.quantity ?? ""} ${prod.serving_size ?? ""}`.toLowerCase();
  return {
    id: `off:${code || normalize(name)}`,
    name,
    brand: String(prod.brands ?? "").split(",")[0].trim().slice(0, 80) || undefined,
    unit: /\d\s*(ml|cl|l)\b/.test(unitHint) ? "ml" : "g",
    serving: serving && serving > 0 && serving <= 2000 ? Math.round(serving) : undefined,
    barcode: code || undefined,
    source: "off",
    ...macros,
  };
}

export interface EstimatedItem extends Macros {
  name: string;
  amount: number;
}

/** AI estimate → validated items (totals per item, not per 100) */
export function cleanEstimate(raw: unknown): EstimatedItem[] {
  const items = (raw as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: EstimatedItem[] = [];
  for (const it of items.slice(0, 20)) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 120);
    const amount = num(o.grams ?? o.amount);
    const totals = cleanMacros({ kcal: o.kcal, protein: 0, carbs: 0, fat: 0 }, 5000);
    if (!name || !totals || amount == null || amount < 0 || amount > 5000) continue;
    const part = (v: unknown) => r1(clamp(num(v) ?? 0, 0, 1000));
    out.push({ name, amount: Math.round(amount), kcal: totals.kcal, protein: part(o.protein), carbs: part(o.carbs), fat: part(o.fat) });
  }
  return out;
}

/** per-100 values from item totals, or null when there is no amount to divide by */
export function per100From(totals: Macros, amount: number): Macros | null {
  if (!(amount > 0)) return null;
  const f = 100 / amount;
  return { kcal: Math.round(totals.kcal * f), protein: r1(totals.protein * f), carbs: r1(totals.carbs * f), fat: r1(totals.fat * f) };
}

/** a profile coming from storage or the cloud, with every field defined and in range */
export function cleanProfile(raw: Partial<NutritionProfile> | undefined): NutritionProfile {
  const p = { ...DEFAULT_PROFILE, ...(raw ?? {}) };
  const within = (v: unknown, lo: number, hi: number, fallback: number) => {
    const n = num(v);
    return n == null ? fallback : clamp(n, lo, hi);
  };
  return {
    setupDone: !!p.setupDone,
    sex: p.sex === "female" ? "female" : "male",
    age: Math.round(within(p.age, 14, 100, DEFAULT_PROFILE.age)),
    heightCm: Math.round(within(p.heightCm, 120, 230, DEFAULT_PROFILE.heightCm)),
    weightKg: r1(within(p.weightKg, 30, 300, DEFAULT_PROFILE.weightKg)),
    activity: p.activity in ACTIVITY_FACTOR ? p.activity : DEFAULT_PROFILE.activity,
    goal: p.goal === "lose" || p.goal === "gain" ? p.goal : "maintain",
    rate: (RATES as readonly number[]).includes(p.rate) ? p.rate : DEFAULT_PROFILE.rate,
    macroPreset: p.macroPreset in MACRO_SPLIT ? p.macroPreset : "balanced",
    manualKcal: p.manualKcal == null ? null : Math.round(within(p.manualKcal, 800, 6000, 2000)),
    waterGoalMl: Math.round(within(p.waterGoalMl, 500, 6000, DEFAULT_PROFILE.waterGoalMl)),
  };
}
