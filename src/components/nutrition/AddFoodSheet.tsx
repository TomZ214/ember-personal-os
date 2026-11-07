"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, Globe, Loader2, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useLang, useT, type Translator } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/inputs";
import { toast } from "@/components/ui/toast";
import {
  cleanEstimate, cleanMacros, MEALS, parseOffProduct, per100From, recentFoods, scale, searchFoods,
  type EstimatedItem, type Food, type Macros, type Meal, type Unit,
} from "@/lib/nutrition";
import { BUILTIN_FOODS } from "@/lib/nutrition-foods";

type Tab = "search" | "ai" | "quick" | "custom";

/** "1,5" and "1.5" both mean one and a half; empty → null */
export const parseNum = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** numbers in the app language: "10,8" in German, "10.8" in English */
export const fmt = (n: number, lang: string, digits = 1) =>
  n.toLocaleString(lang === "de" ? "de-DE" : "en-US", { maximumFractionDigits: digits });

/** a number to prefill an input with: decimal comma in German, never a
 *  thousands separator (parseNum would read "1.500" as 1.5) */
export const toInput = (n: number, lang: string) => {
  const s = String(Math.round(n * 100) / 100);
  return lang === "de" ? s.replace(".", ",") : s;
};

export const foodName = (f: Pick<Food, "name" | "nameEn">, lang: string) => (lang === "en" && f.nameEn ? f.nameEn : f.name);

const OFF_FIELDS = "code,product_name,product_name_de,brands,nutriments,serving_quantity,quantity,serving_size";

/** the AI tab only shows when the server has a key; asked once per page load */
let aiConfigured: Promise<boolean> | null = null;
const checkAi = () =>
  (aiConfigured ??= fetch("/api/ai/nutrition")
    .then((r) => (r.ok ? r.json() : { configured: false }))
    .then((d: { configured?: boolean }) => !!d.configured)
    .catch(() => false));

/** a phone photo is several MB; ~1 MP JPEG is plenty to recognise a plate */
async function photoToJpeg(file: File): Promise<{ data: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image"));
      el.src = url;
    });
    const scaleBy = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scaleBy));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scaleBy));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("image");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.82);
    return { data: preview.slice(preview.indexOf(",") + 1), preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AddFoodSheet({
  open, onClose, day, initialMeal,
}: {
  open: boolean;
  onClose: () => void;
  day: string;
  initialMeal: Meal;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("search");
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [selected, setSelected] = useState<Food | null>(null);
  const [ai, setAi] = useState(false);

  // every open starts fresh on the meal the page asked for
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => { setMeal(initialMeal); setTab("search"); setSelected(null); }, 0);
    void checkAi().then(setAi);
    return () => clearTimeout(id);
  }, [open, initialMeal]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "search", label: t("nut.tab.search") },
    ...(ai ? [{ id: "ai" as const, label: t("nut.tab.ai") }] : []),
    { id: "quick", label: t("nut.tab.quick") },
    { id: "custom", label: t("nut.tab.custom") },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("nut.add")} wide>
      <div className="space-y-4">
        <MealPicker value={meal} onChange={setMeal} t={t} />
        {selected ? (
          <AmountStep food={selected} meal={meal} day={day} onBack={() => setSelected(null)} onDone={onClose} />
        ) : (
          <>
            <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-white/[0.04] p-1">
              {tabs.map((x) => (
                <button
                  key={x.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === x.id}
                  onClick={() => setTab(x.id)}
                  className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${tab === x.id ? "bg-white/[0.10] text-ink" : "text-muted hover:text-ink"}`}
                >
                  {x.id === "ai" && <Sparkles size={14} />}
                  {x.label}
                </button>
              ))}
            </div>
            {tab === "search" && <SearchTab onPick={setSelected} />}
            {tab === "ai" && <AiTab meal={meal} day={day} onDone={onClose} />}
            {tab === "quick" && <QuickTab meal={meal} day={day} onDone={onClose} />}
            {tab === "custom" && <CustomTab onSaved={setSelected} />}
          </>
        )}
      </div>
    </Modal>
  );
}

export function MealPicker({ value, onChange, t }: { value: Meal; onChange: (m: Meal) => void; t: Translator }) {
  return (
    <div role="radiogroup" aria-label={t("nut.meal")} className="grid grid-cols-4 gap-1">
      {MEALS.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={value === m}
          onClick={() => onChange(m)}
          className={`min-h-9 rounded-lg border px-2 text-[13px] font-medium transition-colors ${value === m ? "border-accent/50 bg-accent/15 text-ink" : "border-white/[0.08] text-muted hover:text-ink"}`}
        >
          {t(`nut.meal.${m}`)}
        </button>
      ))}
    </div>
  );
}

/* ---------------- search ---------------- */

function FoodRow({ food, onPick, lang, t, onDelete }: { food: Food; onPick: (f: Food) => void; lang: string; t: Translator; onDelete?: () => void }) {
  return (
    <li className="flex items-center gap-1">
      <button type="button" onClick={() => onPick(food)} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05] active:bg-white/[0.08]">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{foodName(food, lang)}</span>
          <span className="block truncate text-xs text-muted">
            {[food.brand, `${t("nut.per100")} ${food.unit === "ml" ? "ml" : "g"}`].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="num shrink-0 text-sm text-muted">{food.kcal} kcal</span>
      </button>
      {onDelete && (
        <Button type="button" size="sm" variant="ghost" aria-label={t("nut.deleteFood")} onClick={onDelete}><Trash2 size={14} /></Button>
      )}
    </li>
  );
}

function SearchTab({ onPick }: { onPick: (f: Food) => void }) {
  const t = useT();
  const lang = useLang();
  const entries = useEmber((s) => s.nutrition.entries);
  const myFoods = useEmber((s) => s.nutrition.foods);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState<{ query: string; foods: Food[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const recent = useMemo(() => recentFoods(entries), [entries]);
  const local = useMemo(() => {
    if (!query.trim()) return null;
    // own foods first, then what you ate lately, then the built-in table
    const seen = new Set<string>();
    return searchFoods(query, [...myFoods, ...recent, ...BUILTIN_FOODS], 40).filter((f) => {
      const key = `${f.name}|${f.brand ?? ""}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [query, myFoods, recent]);

  const barcode = /^\d{8,14}$/.test(query.trim());

  const searchOnline = async () => {
    const q = query.trim();
    if (q.length < 2 || loading) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true); setError("");
    try {
      let foods: Food[] = [];
      if (/^\d{8,14}$/.test(q)) {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${OFF_FIELDS}`, { signal: ctrl.signal });
        if (res.status === 404) foods = [];
        else if (!res.ok) throw new Error(String(res.status));
        else {
          const data = (await res.json()) as { status?: number; product?: unknown };
          const food = data.status === 1 ? parseOffProduct({ code: q, ...(data.product as object) }) : null;
          foods = food ? [food] : [];
        }
      } else {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=30&lc=${lang}&fields=${OFF_FIELDS}`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { products?: unknown[] };
        const seen = new Set<string>();
        for (const p of data.products ?? []) {
          const food = parseOffProduct(p);
          if (food && !seen.has(food.id)) { seen.add(food.id); foods.push(food); }
        }
      }
      setOnline({ query: q, foods });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(t("nut.onlineError"));
    } finally {
      if (abort.current === ctrl) setLoading(false);
    }
  };

  const showOnline = online && online.query === query.trim();

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void searchOnline(); }} className="flex gap-2">
        <label className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            autoFocus
            enterKeyHint="search"
            aria-label={t("nut.searchPlaceholder")}
            placeholder={t("nut.searchPlaceholder")}
            className="pl-9"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setError(""); }}
          />
        </label>
        <Button type="submit" disabled={query.trim().length < 2 || loading} aria-label={t("nut.searchOnline")}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
          <span className="hidden sm:inline">{barcode ? t("nut.barcode") : t("nut.online")}</span>
        </Button>
      </form>

      <div className="space-y-4">
        {local === null ? (
          <>
            {recent.length > 0 && <Section title={t("nut.recent")}>{recent.map((f) => <FoodRow key={f.id} food={f} onPick={onPick} lang={lang} t={t} />)}</Section>}
            {myFoods.length > 0 && <Section title={t("nut.myFoods")}>{myFoods.map((f) => <FoodRow key={f.id} food={f} onPick={onPick} lang={lang} t={t} />)}</Section>}
            <p className="px-1 text-xs text-muted">{t("nut.searchHint")}</p>
          </>
        ) : (
          <>
            {local.length > 0
              ? <Section title={t("nut.results")}>{local.map((f) => <FoodRow key={f.id} food={f} onPick={onPick} lang={lang} t={t} />)}</Section>
              : !showOnline && <p className="px-1 text-sm text-muted">{t("nut.noLocal")}</p>}
            {error && <p role="alert" className="px-1 text-sm text-danger">{error}</p>}
            {showOnline && (
              <Section title="Open Food Facts">
                {online.foods.length
                  ? online.foods.map((f) => <FoodRow key={f.id} food={f} onPick={onPick} lang={lang} t={t} />)
                  : <li className="px-3 text-sm text-muted">{t("nut.noOnline")}</li>}
              </Section>
            )}
            {!showOnline && !loading && query.trim().length >= 2 && (
              <button type="button" onClick={() => void searchOnline()} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm text-accent hover:bg-white/[0.04]">
                <Globe size={15} />{barcode ? t("nut.lookupBarcode") : t("nut.searchOnlineFor").replace("{q}", query.trim())}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 px-1 text-xs font-medium uppercase tracking-wide text-faint">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

/* ---------------- amount ---------------- */

function MacroLine({ m, t, lang }: { m: Macros; t: Translator; lang: string }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      {([["kcal", m.kcal, "kcal"], ["protein", m.protein, "g"], ["carbs", m.carbs, "g"], ["fat", m.fat, "g"]] as const).map(([key, v, u]) => (
        <div key={key} className="rounded-xl bg-white/[0.04] px-2 py-2.5">
          <p className="num text-lg font-semibold">{fmt(v, lang)}<span className="ml-0.5 text-xs font-normal text-muted">{u}</span></p>
          <p className="text-[11px] text-muted">{t(`nut.macro.${key}`)}</p>
        </div>
      ))}
    </div>
  );
}

function AmountStep({ food, meal, day, onBack, onDone }: { food: Food; meal: Meal; day: string; onBack: () => void; onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const add = useEmber((s) => s.addFoodEntries);
  const unit: Unit = food.unit ?? "g";
  const [text, setText] = useState(String(food.serving ?? 100));
  const amount = parseNum(text);
  const valid = amount != null && amount > 0 && amount <= 5000;
  const totals = scale(food, valid ? amount : 0);
  const presets = [...new Set([food.serving, 50, 100, 150, 200, unit === "ml" ? 330 : 250].filter((n): n is number => !!n && n > 0))];

  const submit = () => {
    if (!valid) return;
    add([{
      date: day, meal, name: foodName(food, lang), brand: food.brand, amount, unit,
      per100: { kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat },
      source: food.source, ...totals,
    }]);
    toast(t("nut.added").replace("{name}", foodName(food, lang)));
    onDone();
  };

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="flex items-start gap-2">
        <Button type="button" size="sm" variant="ghost" aria-label={t("nut.back")} onClick={onBack}><ArrowLeft size={16} /></Button>
        <div className="min-w-0">
          <p className="font-medium">{foodName(food, lang)}</p>
          <p className="text-xs text-muted">
            {[food.brand, `${food.kcal} kcal ${t("nut.per100")} ${unit}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <label className="block">
        <Label>{t("nut.amount")} ({unit})</Label>
        <Input autoFocus inputMode="decimal" enterKeyHint="done" value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!valid} />
      </label>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p} type="button" onClick={() => setText(String(p))} className={`min-h-9 rounded-lg border px-3 text-sm ${amount === p ? "border-accent/50 bg-accent/15" : "border-white/[0.08] text-muted hover:text-ink"}`}>
            {p === food.serving ? `${t("nut.serving")} · ` : ""}{p} {unit}
          </button>
        ))}
      </div>
      <MacroLine m={totals} t={t} lang={lang} />
      <Button type="submit" variant="primary" className="w-full" disabled={!valid}><Plus size={16} />{t("nut.addTo").replace("{meal}", t(`nut.meal.${meal}`))}</Button>
    </form>
  );
}

/* ---------------- AI ---------------- */

interface Draft extends EstimatedItem {
  keep: boolean;
  amountText: string;
  per100: Macros | null;
}

function AiTab({ meal, day, onDone }: { meal: Meal; day: string; onDone: () => void }) {
  const t = useT();
  const lang = useLang();
  const add = useEmber((s) => s.addFoodEntries);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ data: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Draft[] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const analyse = async () => {
    if ((!text.trim() && !photo) || busy) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true); setError(""); setItems(null);
    try {
      const res = await fetch("/api/ai/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim().slice(0, 2000), lang, image: photo ? { data: photo.data, mediaType: "image/jpeg" } : undefined }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 429 ? t("nut.aiBusy") : t("nut.aiError"));
      const found = cleanEstimate(data);
      if (!found.length) { setError(t("nut.aiNothing")); return; }
      setItems(found.map((it) => ({ ...it, keep: true, amountText: String(it.amount), per100: per100From(it, it.amount) })));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message || t("nut.aiError"));
    } finally {
      setBusy(false);
    }
  };

  // changing an amount rescales that item from its per-100 values
  const totalsOf = (d: Draft): Macros => {
    const amount = parseNum(d.amountText);
    if (d.per100 && amount != null && amount > 0) return scale(d.per100, amount);
    return d;
  };

  const kept = (items ?? []).filter((d) => d.keep && d.name.trim());
  const submit = () => {
    if (!kept.length) return;
    add(kept.map((d) => {
      const amount = parseNum(d.amountText);
      const valid = amount != null && amount > 0 && amount <= 5000;
      return {
        date: day, meal, name: d.name.trim(), amount: valid ? amount : 0, unit: "g" as const,
        per100: valid ? d.per100 : null, source: "ai" as const, ...totalsOf(d),
      };
    }));
    toast(t("nut.addedMany").replace("{n}", String(kept.length)));
    onDone();
  };

  if (items) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">{t("nut.aiReview")}</p>
        <ul className="space-y-2">
          {items.map((d, i) => {
            const m = totalsOf(d);
            const patch = (p: Partial<Draft>) => setItems((list) => list?.map((x, j) => (j === i ? { ...x, ...p } : x)) ?? null);
            return (
              <li key={i} className={`rounded-xl bg-white/[0.04] p-3 ${d.keep ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--accent)]" checked={d.keep} aria-label={t("nut.include")} onChange={(e) => patch({ keep: e.target.checked })} />
                  {/* the shared Input is w-full, so widths live on wrappers */}
                  <div className="min-w-0 flex-1"><Input value={d.name} aria-label={t("nut.name")} onChange={(e) => patch({ name: e.target.value })} /></div>
                  <div className="w-24 shrink-0"><Input inputMode="decimal" value={d.amountText} aria-label={t("nut.amount")} onChange={(e) => patch({ amountText: e.target.value })} /></div>
                  <span className="text-sm text-muted">g</span>
                </div>
                <p className="num mt-2 text-xs text-muted">
                  {m.kcal} kcal · {t("nut.macro.short.protein")} {fmt(m.protein, lang)} g · {t("nut.macro.short.carbs")} {fmt(m.carbs, lang)} g · {t("nut.macro.short.fat")} {fmt(m.fat, lang)} g
                </p>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-faint">{t("nut.aiDisclaimer")}</p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => setItems(null)}>{t("nut.back")}</Button>
          <Button type="button" variant="primary" className="flex-1" disabled={!kept.length} onClick={submit}>
            <Plus size={16} />{t("nut.addSelected").replace("{n}", String(kept.length)).replace("{kcal}", String(kept.reduce((s, d) => s + totalsOf(d).kcal, 0)))}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void analyse(); }}>
      <label className="block">
        <Label>{t("nut.aiPrompt")}</Label>
        <Textarea rows={3} maxLength={2000} placeholder={t("nut.aiPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {photo ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL preview */}
          <img src={photo.preview} alt={t("nut.photo")} className="max-h-40 rounded-xl" />
          <button type="button" aria-label={t("nut.removePhoto")} onClick={() => setPhoto(null)} className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1.5 text-white"><X size={14} /></button>
        </div>
      ) : (
        <Button type="button" onClick={() => fileInput.current?.click()} disabled={busy}><Camera size={16} />{t("nut.addPhoto")}</Button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try { setPhoto(await photoToJpeg(file)); setError(""); } catch { setError(t("nut.photoError")); }
        }}
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={busy || (!text.trim() && !photo)}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {busy ? t("nut.aiWorking") : t("nut.aiAnalyse")}
      </Button>
    </form>
  );
}

/* ---------------- quick & custom ---------------- */

function NumberField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const n = parseNum(value);
  const invalid = value.trim() !== "" && (n == null || n < 0);
  return (
    <label className="block">
      <Label>{label}</Label>
      <Input inputMode="decimal" required={required} value={value} aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function QuickTab({ meal, day, onDone }: { meal: Meal; day: string; onDone: () => void }) {
  const t = useT();
  const add = useEmber((s) => s.addFoodEntries);
  const [f, setF] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const kcal = parseNum(f.kcal);
  const macros = cleanMacros({ kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat }, 10_000, 1000);
  const partsOk = [f.protein, f.carbs, f.fat].every((v) => v.trim() === "" || (parseNum(v) ?? -1) >= 0);
  const valid = kcal != null && kcal > 0 && !!macros && partsOk;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || !macros) return;
        const name = f.name.trim() || t("nut.quickName");
        add([{ date: day, meal, name, amount: 0, unit: "g", per100: null, source: "quick", ...macros }]);
        toast(t("nut.added").replace("{name}", name));
        onDone();
      }}
    >
      <label className="block"><Label>{t("nut.nameOptional")}</Label><Input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <NumberField label={t("nut.kcalTotal")} required value={f.kcal} onChange={(v) => setF({ ...f, kcal: v })} />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label={`${t("nut.macro.protein")} (g)`} value={f.protein} onChange={(v) => setF({ ...f, protein: v })} />
        <NumberField label={`${t("nut.macro.carbs")} (g)`} value={f.carbs} onChange={(v) => setF({ ...f, carbs: v })} />
        <NumberField label={`${t("nut.macro.fat")} (g)`} value={f.fat} onChange={(v) => setF({ ...f, fat: v })} />
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={!valid}><Plus size={16} />{t("nut.addTo").replace("{meal}", t(`nut.meal.${meal}`))}</Button>
    </form>
  );
}

function CustomTab({ onSaved }: { onSaved: (f: Food) => void }) {
  const t = useT();
  const lang = useLang();
  const foods = useEmber((s) => s.nutrition.foods);
  const saveFood = useEmber((s) => s.saveFood);
  const deleteFood = useEmber((s) => s.deleteFood);
  const [f, setF] = useState({ name: "", brand: "", unit: "g" as Unit, kcal: "", protein: "", carbs: "", fat: "", serving: "" });
  const macros = cleanMacros({ kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat });
  const serving = parseNum(f.serving);
  const servingOk = f.serving.trim() === "" || (serving != null && serving > 0 && serving <= 5000);
  const partsOk = [f.protein, f.carbs, f.fat].every((v) => {
    const n = parseNum(v);
    return v.trim() === "" || (n != null && n >= 0 && n <= 100);
  });
  const valid = !!f.name.trim() && f.kcal.trim() !== "" && !!macros && partsOk && servingOk;

  return (
    <div className="space-y-5">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || !macros) return;
          const saved = saveFood({
            name: f.name.trim().slice(0, 120), brand: f.brand.trim().slice(0, 80) || undefined, unit: f.unit,
            serving: serving && servingOk ? Math.round(serving) : undefined, ...macros,
          });
          toast(t("nut.foodSaved"));
          onSaved(saved);
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><Label>{t("nut.name")}</Label><Input required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block"><Label>{t("nut.brandOptional")}</Label><Input maxLength={80} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></label>
        </div>
        <div role="radiogroup" aria-label={t("nut.unit")} className="flex gap-2">
          {(["g", "ml"] as const).map((u) => (
            <button key={u} type="button" role="radio" aria-checked={f.unit === u} onClick={() => setF({ ...f, unit: u })} className={`min-h-9 rounded-lg border px-4 text-sm ${f.unit === u ? "border-accent/50 bg-accent/15" : "border-white/[0.08] text-muted"}`}>
              {t("nut.per100")} {u}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberField label="kcal" required value={f.kcal} onChange={(v) => setF({ ...f, kcal: v })} />
          <NumberField label={`${t("nut.macro.protein")} (g)`} value={f.protein} onChange={(v) => setF({ ...f, protein: v })} />
          <NumberField label={`${t("nut.macro.carbs")} (g)`} value={f.carbs} onChange={(v) => setF({ ...f, carbs: v })} />
          <NumberField label={`${t("nut.macro.fat")} (g)`} value={f.fat} onChange={(v) => setF({ ...f, fat: v })} />
        </div>
        <NumberField label={`${t("nut.servingOptional")} (${f.unit})`} value={f.serving} onChange={(v) => setF({ ...f, serving: v })} />
        {f.kcal.trim() !== "" && !macros && <p role="alert" className="text-sm text-danger">{t("nut.kcalRange")}</p>}
        <Button type="submit" variant="primary" className="w-full" disabled={!valid}>{t("nut.saveAndAdd")}</Button>
      </form>
      {foods.length > 0 && (
        <Section title={t("nut.myFoods")}>
          {foods.map((food) => <FoodRow key={food.id} food={food} onPick={onSaved} lang={lang} t={t} onDelete={() => deleteFood(food.id)} />)}
        </Section>
      )}
    </div>
  );
}
