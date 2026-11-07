import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import ts from "typescript";
import { createStore } from "zustand/vanilla";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const create = (initializer) => createStore(initializer);
const storage = () => {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
};

// Compile the actual source in isolation, substituting only browser/service
// boundaries. No network, real account, or additional test dependency needed.
function sourceLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} };
    cache.set(file, loaded);
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: file,
    }).outputText;
    vm.runInNewContext(code, {
      module: loaded, exports: loaded.exports, console, Date, crypto: webcrypto,
      setTimeout, clearTimeout, localStorage: storage(), ...globals,
      require: (name) => {
        if (Object.hasOwn(mocks, name)) return mocks[name];
        if (name.startsWith(".") || name.startsWith("@/")) {
          const base = name.startsWith("@/")
            ? path.join(root, "src", name.slice(2))
            : path.resolve(path.dirname(file), name);
          const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
          return load(target);
        }
        return require(name);
      },
    }, { filename: file });
    return loaded.exports;
  }
  return (file) => load(path.join(root, file));
}

function syncFixture() {
  let effect, auth, listener;
  let session = { user: { id: "user", email: "test@example.com" } };
  let pulls = 0, claims = 0, pushes = 0;
  let pull = async () => null;
  const timers = new Map();
  const localStorage = storage();
  const state = { tasks: [], addTask: (task) => { state.tasks.push(task); listener?.(); } };
  const channel = { on: () => channel, subscribe: () => channel };
  const sb = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (fn) => {
        auth = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    channel: () => channel,
    removeChannel() {},
  };
  const load = sourceLoader({
    react: { useEffect: (fn) => { effect = fn; }, useRef: () => ({ current: false }) },
    zustand: { create },
    "@/lib/cloud": {
      supabase: async () => sb, cloudConfigured: () => true,
      LAST_SYNC_KEY: "last-sync", deviceId: () => "device",
      pullCloud: async () => { pulls++; return pull(); },
      pushCloud: async () => { pushes++; return "2026-11-02T12:00:00Z"; },
      claimInboxTasks: async () => { claims++; return [{ id: "family-task", title: "Family task" }]; },
      reconcileSharedTasks: async () => {},
      applyCloudData: (data) => { state.tasks = [...data.tasks]; listener?.(); },
    },
    "@/lib/store": { useEmber: {
      getState: () => state,
      subscribe: (fn) => { listener = fn; return () => { listener = null; }; },
    } },
    "@/lib/push": { refreshPushSubscription: async () => {} },
    "@/components/ui/toast": { toast() {} },
  }, {
    localStorage,
    setTimeout: (fn, delay) => { const id = Symbol(); timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const api = load("src/hooks/useCloudSync.ts");
  api.CloudSyncEngine();
  return {
    api, state, localStorage,
    setup: () => effect(),
    setPull: (fn) => { pull = fn; },
    change: () => listener?.(),
    signOut: () => { session = null; auth("SIGNED_OUT", null); },
    counters: () => ({ pulls, claims, pushes }),
    async run(delay) {
      // the client arrives asynchronously; let the engine start first
      for (let i = 0; i < 12; i++) await Promise.resolve();
      for (const [id, timer] of [...timers]) {
        if (timer.delay === delay) { timers.delete(id); await timer.fn(); }
      }
      // Settle the initial reconciliation/inbox promise chain.
      for (let i = 0; i < 12; i++) await Promise.resolve();
    },
  };
}

test("cloud sync survives Strict Mode effect setup/cleanup/setup", async () => {
  const f = syncFixture();
  f.setup()();
  const cleanup = f.setup();
  await f.run(0);
  assert.equal(f.api.useCloudStatus.getState().signedIn, true);
  assert.equal(f.counters().pulls, 1);
  cleanup();
});

test("signing out cancels an already scheduled upload", async () => {
  const f = syncFixture();
  const cleanup = f.setup();
  await f.run(0);
  f.change();
  const before = f.counters().pushes;
  f.signOut();
  await f.run(2500);
  assert.equal(f.counters().pushes, before);
  cleanup();
});

test("the initial cloud pull completes before family tasks are claimed", async () => {
  const f = syncFixture();
  let resolvePull;
  f.setPull(() => new Promise((resolve) => { resolvePull = resolve; }));
  const cleanup = f.setup();
  await f.run(0);
  assert.equal(f.counters().claims, 0);
  resolvePull({ updated_at: "2026-11-02T10:00:00Z", data: { tasks: [{ title: "Remote task" }] } });
  await f.run(0);
  assert.equal(f.state.tasks.length, 2);
  assert.equal(f.state.tasks[1].sharedId, "family-task");
  // A real edit immediately after a pull must still upload.
  const before = f.counters().pushes;
  f.change();
  await f.run(2500);
  assert.equal(f.counters().pushes, before + 1);
  cleanup();
});

test("a pull finishing after sign-out cannot replace local data or claim tasks", async () => {
  const f = syncFixture();
  let resolvePull;
  f.setPull(() => new Promise((resolve) => { resolvePull = resolve; }));
  const cleanup = f.setup();
  await f.run(0);
  f.signOut();
  resolvePull({ updated_at: "2026-11-02T10:00:00Z", data: { tasks: [{ title: "Stale task" }] } });
  await f.run(0);
  assert.equal(f.state.tasks.length, 0);
  assert.equal(f.counters().claims, 0);
  cleanup();
});

for (const method of ["updateTask", "moveTask"]) {
  test(`${method}: recurring successors do not reopen the family's submitted task`, () => {
    const load = sourceLoader({
      zustand: { create },
      "zustand/middleware": { persist: (initializer) => initializer },
    });
    const { useEmber } = load("src/lib/store.ts");
    useEmber.getState().addTask({
      title: "Recurring family task", sharedId: "submission", due: "2026-11-02",
      repeat: { freq: "daily", interval: 1 },
    });
    const original = useEmber.getState().tasks[0];
    if (method === "updateTask") useEmber.getState().updateTask(original.id, { status: "done" });
    else useEmber.getState().moveTask(original.id, "done");
    const tasks = useEmber.getState().tasks;
    assert.equal(tasks.length, 2);
    assert.equal(tasks.find((t) => t.status === "done").sharedId, "submission");
    assert.equal(tasks.find((t) => t.status === "todo").sharedId, undefined);
    assert.equal(tasks.find((t) => t.status === "todo").due, "2026-11-03");
  });
}

test("cloud vault deletion propagates, while older snapshots without a vault field preserve it", () => {
  const localStorage = storage();
  const load = sourceLoader({
    "./store": { useEmber: { getState: () => ({ applyCloudState() {} }) } },
    "./crypto": { VAULT_STORAGE_KEY: "vault" },
  }, { localStorage });
  const { applyCloudData } = load("src/lib/cloud.ts");
  localStorage.setItem("vault", "encrypted");
  applyCloudData({});
  assert.equal(localStorage.getItem("vault"), "encrypted");
  applyCloudData({ vaultBlob: null });
  assert.equal(localStorage.getItem("vault"), null);
  applyCloudData({ vaultBlob: "new-encrypted" });
  assert.equal(localStorage.getItem("vault"), "new-encrypted");
});

test("report topics count completed reports and suppress related suggestions", () => {
  const core = sourceLoader()("src/lib/reports/core.js");
  const rows = [{ status: "completed", topics: ["Online-Banking"] }, { status: "open", topics: ["Sparbuch"] }];
  assert.equal(core.topicIndex(rows).length, 1);
  assert.equal(core.unusedTopics(rows).some(t => t.name === "Onlinebanking"), false);
  assert.equal(core.unusedTopics(rows).some(t => t.name === "pushTAN"), false);
  assert.equal(core.unusedTopics(rows).some(t => t.name === "Sparbuch"), true);
});

test("report import validates dates and reads German CSV", () => {
  const core = sourceLoader()("src/lib/reports/core.js");
  const rows = core.parseCSV("Nummer;Von;Bis;Thema;Status\n3;01.11.2026;02.11.2026;Online-Banking;abgeschlossen");
  assert.equal(rows[0].from, "2026-11-01");
  assert.equal(rows[0].topics[0], "Onlinebanking");
  assert.throws(() => core.cleanRecord({ topics: ["Test"], from: "2026-11-03", to: "2026-11-01" }));
  assert.throws(() => core.cleanRecord({ topics: [] }));
});

test("report checker finds numbering gaps, next defaults and topic conflicts", () => {
  const core = sourceLoader()("src/lib/reports/core.js");
  const rows = [
    { id: "a", number: "1", to: "2026-10-30", status: "completed", topics: ["Onlinebanking"] },
    { id: "b", number: "2", status: "completed", topics: ["Sparbuch"] },
    { id: "c", number: "2", status: "open", topics: ["Kreditkarte"] },
    { id: "d", number: "5", status: "open", topics: ["Tagesgeld"] },
  ];
  const issues = core.numberingIssues(rows);
  assert.deepEqual([...issues.missing], [3, 4]);
  assert.deepEqual([...issues.duplicates], [2]);
  const next = core.nextReportDefaults(rows);
  assert.equal(next.number, "6");
  assert.equal(next.from, "2026-11-02");
  assert.equal(next.to, "2026-11-06");
  assert.deepEqual(rows.slice().sort(core.compareReports).map(r => r.id), ["d", "b", "c", "a"]);
  const conflicts = core.topicConflicts("Online-Banking; pushTAN; Bausparen", rows);
  assert.equal(conflicts.length, 2);
  assert.equal(conflicts[0].same[0].id, "a");
  assert.equal(conflicts[1].related[0].name, "Onlinebanking");
  assert.equal(core.topicConflicts("Onlinebanking", rows, "a").length, 0);
  assert.ok(core.searchable({ topics: ["SEPA-Überweisung"], attachments: [{ name: "KW44.docx" }] }).includes("uberweisung"));
});

test("nutrition targets follow Mifflin-St Jeor, goals and the safe minimum", () => {
  const n = sourceLoader()("src/lib/nutrition.ts");
  const p = { ...n.DEFAULT_PROFILE, sex: "male", age: 25, heightCm: 180, weightKg: 80, activity: "moderate", goal: "maintain" };
  // 10*80 + 6.25*180 - 5*25 + 5 = 1805
  assert.equal(n.bmr(p), 1805);
  const keep = n.targets(p);
  assert.equal(keep.tdee, Math.round(1805 * 1.55));
  assert.equal(keep.kcal, Math.round((1805 * 1.55) / 10) * 10);
  // 0.5 kg/week = 550 kcal/day less
  assert.equal(n.targets({ ...p, goal: "lose", rate: 0.5 }).kcal, Math.round((1805 * 1.55 - 550) / 10) * 10);
  const tiny = n.targets({ ...p, sex: "female", weightKg: 45, heightCm: 150, age: 60, activity: "sedentary", goal: "lose", rate: 1 });
  assert.equal(tiny.kcal, 1200);
  assert.equal(tiny.clamped, true);
  const manual = n.targets({ ...p, manualKcal: 2222 });
  assert.equal(manual.kcal, 2222);
  // balanced split: 30 % protein → kcal*0.3/4 g
  assert.equal(manual.protein, Math.round((2222 * 0.3) / 4));
  assert.equal(manual.fat, Math.round((2222 * 0.3) / 9));
});

test("nutrition arithmetic, dates, streaks and search", () => {
  const n = sourceLoader()("src/lib/nutrition.ts");
  const { BUILTIN_FOODS } = sourceLoader()("src/lib/nutrition-foods.ts");
  assert.deepEqual({ ...n.scale({ kcal: 372, protein: 13.5, carbs: 58.7, fat: 7 }, 50) }, { kcal: 186, protein: 6.8, carbs: 29.4, fat: 3.5 });
  assert.equal(n.shiftDay("2026-03-01", -1), "2026-02-28");
  assert.equal(n.shiftDay("2026-12-31", 1), "2027-01-01");
  // across the DST change in late March the date still moves by exactly one
  assert.equal(n.shiftDay("2026-03-29", 1), "2026-03-30");
  const e = (date, kcal) => ({ date, kcal, protein: 0, carbs: 0, fat: 0, createdAt: `${date}T08:00:00Z` });
  const entries = [e("2026-11-05", 500), e("2026-11-06", 700), e("2026-11-06", 300), e("2026-11-07", 100)];
  assert.equal(n.streak(entries, "2026-11-07"), 3);
  assert.equal(n.streak(entries, "2026-11-08"), 3, "the streak survives the morning before the first entry");
  assert.equal(n.streak(entries, "2026-11-09"), 0);
  const week = n.dailyKcal(entries, "2026-11-07", 3);
  assert.deepEqual([...week.map((d) => d.kcal)], [500, 1000, 100]);
  assert.equal(n.mealForTime(new Date(2026, 0, 1, 8, 0)), "breakfast");
  assert.equal(n.mealForTime(new Date(2026, 0, 1, 12, 30)), "lunch");
  assert.equal(n.mealForTime(new Date(2026, 0, 1, 19, 0)), "dinner");
  assert.equal(n.mealForTime(new Date(2026, 0, 1, 23, 30)), "snack");
  assert.equal(n.searchFoods("hahnchen", BUILTIN_FOODS)[0].name.startsWith("Hähnchenbrust"), true, "umlaut-insensitive");
  assert.equal(n.searchFoods("oats", BUILTIN_FOODS)[0].name, "Haferflocken", "English names are searchable");
  const ids = new Set(BUILTIN_FOODS.map((f) => f.id));
  assert.equal(ids.size, BUILTIN_FOODS.length, "built-in ids are unique");
  for (const f of BUILTIN_FOODS) {
    assert.ok(f.kcal >= 0 && f.kcal <= 900 && f.protein + f.carbs + f.fat <= 101, f.name);
    // energy from macros must roughly match the stated calories (alcohol and fibre aside)
    const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9;
    if (!/bier|wein/i.test(f.name) && f.kcal > 40) assert.ok(Math.abs(fromMacros - f.kcal) / f.kcal < 0.25, `${f.name}: ${fromMacros} vs ${f.kcal}`);
  }
});

test("nutrition sanitises Open Food Facts and AI data", () => {
  const n = sourceLoader()("src/lib/nutrition.ts");
  const off = n.parseOffProduct({
    code: "3017620422003", product_name: "Nutella", brands: "Ferrero, Nutella", serving_quantity: "15", quantity: "400 g",
    nutriments: { "energy-kcal_100g": 539, proteins_100g: "6,3", carbohydrates_100g: 57.5, fat_100g: 30.9 },
  });
  assert.equal(off.kcal, 539);
  assert.equal(off.protein, 6.3);
  assert.equal(off.brand, "Ferrero");
  assert.equal(off.serving, 15);
  assert.equal(off.unit, "g");
  assert.equal(n.parseOffProduct({ product_name: "Saft", quantity: "1 l", nutriments: { energy_100g: 188 } }).kcal, 45, "kJ fallback");
  assert.equal(n.parseOffProduct({ product_name: "Saft", quantity: "1 l", nutriments: { energy_100g: 188 } }).unit, "ml");
  assert.equal(n.parseOffProduct({ product_name: "x", nutriments: {} }), null);
  assert.equal(n.parseOffProduct({ product_name: "x", nutriments: { "energy-kcal_100g": 5000 } }), null);
  assert.equal(n.parseOffProduct(null), null);

  const items = n.cleanEstimate({ items: [
    { name: "Brötchen", grams: 120, kcal: 324, protein: 10.8, carbs: 64.8, fat: 1.8 },
    { name: "", grams: 10, kcal: 10 },
    { name: "Bad", grams: -5, kcal: 10 },
    { name: "Huge", grams: 100, kcal: 99999 },
    "nonsense",
  ] });
  assert.equal(items.length, 1);
  assert.deepEqual({ ...n.per100From(items[0], items[0].amount) }, { kcal: 270, protein: 9, carbs: 54, fat: 1.5 });
  assert.equal(n.per100From(items[0], 0), null);
  assert.deepEqual([...n.cleanEstimate({ items: "x" })], []);
  assert.equal(n.cleanMacros({ kcal: "abc" }), null);
  assert.equal(n.cleanMacros({ kcal: 100, protein: 500 }).protein, 100);
  assert.equal(n.cleanMacros({ kcal: 2000, protein: 150 }, 10000, 1000).protein, 150);

  const p = n.cleanProfile({ age: 500, heightCm: "abc", activity: "couch", rate: 7, waterGoalMl: 10, sex: "female" });
  assert.equal(p.age, 100);
  assert.equal(p.heightCm, n.DEFAULT_PROFILE.heightCm);
  assert.equal(p.activity, n.DEFAULT_PROFILE.activity);
  assert.equal(p.rate, n.DEFAULT_PROFILE.rate);
  assert.equal(p.waterGoalMl, 500);
  assert.equal(p.sex, "female");
});

test("nutrition store actions keep the slice consistent", () => {
  const { useEmber } = sourceLoader({}, { window: {} })("src/lib/store.ts");
  const s = () => useEmber.getState();
  assert.equal(s().nutrition.entries.length, 0);
  const base = { meal: "breakfast", name: "Ei", amount: 60, unit: "g", per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, source: "builtin", kcal: 86, protein: 7.6, carbs: 0.4, fat: 5.7 };
  s().addFoodEntries([{ ...base, date: "2026-11-06" }, { ...base, date: "2026-11-06", meal: "lunch" }]);
  assert.equal(s().nutrition.entries.length, 2);
  assert.ok(s().nutrition.entries.every((e) => e.id && e.createdAt));
  assert.equal(s().copyMeal("2026-11-06", "2026-11-07", "breakfast"), 1);
  assert.equal(s().copyMeal("2026-11-06", "2026-11-07", "dinner"), 0);
  const copy = s().nutrition.entries.find((e) => e.date === "2026-11-07");
  assert.notEqual(copy.id, s().nutrition.entries[0].id);
  s().deleteFoodEntry(copy.id);
  s().restoreFoodEntry(copy);
  s().restoreFoodEntry(copy);
  assert.equal(s().nutrition.entries.filter((e) => e.id === copy.id).length, 1, "undo never duplicates");
  s().setWater("2026-11-07", 750);
  s().setWater("2026-11-07", -250);
  assert.equal(s().nutrition.water["2026-11-07"], undefined, "zero water removes the day");
  s().logWeight("2026-11-01", 80);
  s().logWeight("2026-11-05", 79.4);
  s().logWeight("2026-11-03", 79.9);
  assert.equal(s().nutrition.profile.weightKg, 79.4, "the newest weigh-in drives the target");
  s().logWeight("2026-11-05", 79.1);
  assert.equal(s().nutrition.weights.length, 3, "one weigh-in per day");
  s().updateNutritionProfile({ age: 9999 });
  assert.equal(s().nutrition.profile.age, 100);
  // a cloud snapshot from an older device with a partial slice must not break anything
  s().applyCloudState({ nutrition: { entries: [] } });
  assert.equal(s().nutrition.profile.waterGoalMl, 2500);
  assert.deepEqual([...s().nutrition.weights], []);
});

test("every nutrition text exists in English and German", () => {
  const src = ["src/app/nutrition/page.tsx", "src/components/nutrition/AddFoodSheet.tsx", "src/components/nutrition/charts.tsx"]
    .map((f) => readFileSync(path.join(root, f), "utf8")).join("\n");
  const keys = new Set([...src.matchAll(/t\("(nut\.[\w.]+)"/g)].map((m) => m[1]));
  const dynamic = {
    "nut.meal.": ["breakfast", "lunch", "snack", "dinner"],
    "nut.macro.": ["kcal", "protein", "carbs", "fat"],
    "nut.activity.": ["sedentary", "light", "moderate", "active", "very"],
    "nut.goal.": ["lose", "maintain", "gain"],
    "nut.preset.": ["balanced", "protein", "lowcarb"],
  };
  for (const [prefix, names] of Object.entries(dynamic)) for (const k of names) keys.add(prefix + k);
  assert.ok(keys.size > 100);
  const i18n = readFileSync(path.join(root, "src/lib/i18n.ts"), "utf8");
  const deStart = i18n.indexOf("const de: Dict");
  const en = i18n.slice(0, deStart), de = i18n.slice(deStart);
  for (const k of [...keys, "nav.nutrition"]) {
    assert.ok(en.includes(`"${k}":`), `missing English text ${k}`);
    assert.ok(de.includes(`"${k}":`), `missing German text ${k}`);
  }
});

test("Finanzguru import reads German exports, categories, transfers and duplicates", () => {
  const fg = sourceLoader()("src/lib/finance/finanzguru.ts");
  assert.equal(fg.parseAmount("-1.234,56 €", true), -1234.56);
  assert.equal(fg.parseAmount("1,234.56", false), 1234.56);
  assert.equal(fg.parseAmount("−12,30", true), -12.3);
  assert.equal(fg.parseAmount("abc", true), null);
  assert.equal(fg.parseDate("07.11.2026"), "2026-11-07");
  assert.equal(fg.parseDate("31.02.2026"), null);
  assert.equal(fg.parseDate("07.11.26"), "2026-11-07");
  assert.equal(fg.parseDate(46333), "2026-11-07", "Excel day serial");
  assert.equal(fg.parseDate("2026-11-07T00:00:00"), "2026-11-07");

  const csv = [
    "Finanzguru Export",
    "Buchungstag;Referenzkonto;Name Referenzkonto;Betrag;Waehrung;Beguenstigter/Auftraggeber;Verwendungszweck;Analyse-Hauptkategorie;Analyse-Unterkategorie",
    '01.11.2026;DE00;Girokonto;2.150,00;EUR;Sparkasse Heidelberg;"Gehalt November";Einnahmen;Gehalt',
    "02.11.2026;DE00;Girokonto;-45,90;EUR;REWE SAGT DANKE. 44301612//HEIDELBERG/DE;Einkauf;Lebensmittel & Drogerie;Supermarkt",
    "03.11.2026;DE00;Girokonto;-3,20;EUR;Café Rossi;Kaffee;Freizeit;Restaurants & Cafés",
    "03.11.2026;DE00;Girokonto;-3,20;EUR;Café Rossi;Kaffee;Freizeit;Restaurants & Cafés",
    "04.11.2026;DE00;Girokonto;-500,00;EUR;Tom Kurr;Sparen;Umbuchung;Eigene Konten",
    "04.11.2026;DE01;Tagesgeld;500,00;EUR;Tom Kurr;Sparen;Umbuchung;Eigene Konten",
    "05.11.2026;DE00;Girokonto;-19,99;USD;Shop;USD Kauf;Shopping;Elektronik",
    "06.11.2026;DE00;Girokonto;12,99;EUR;Amazon;Erstattung;Shopping;Online-Handel",
    ";;;;;;;;",
  ].join("\r\n");
  const out = fg.parseImport(fg.parseDelimited(csv));
  assert.deepEqual([...out.accounts], ["Girokonto", "Tagesgeld"]);
  assert.equal(out.skipped, 1, "the USD row is skipped");
  assert.equal(out.rows.length, 7);
  const [salary, rewe, coffee1, coffee2] = out.rows;
  assert.equal(salary.kind, "income");
  assert.equal(salary.amount, 2150);
  assert.equal(salary.category, "Salary");
  assert.equal(rewe.category, "Groceries");
  assert.equal(rewe.amount, 45.9);
  assert.ok(rewe.note.startsWith("Rewe"), rewe.note);
  assert.equal(coffee1.category, "Dining", "the subcategory is more specific than 'Freizeit'");
  assert.notEqual(coffee1.importKey, coffee2.importKey, "two identical coffees are two purchases");
  assert.equal(out.rows.filter((r) => r.transfer).length, 2);
  const refund = out.rows.find((r) => r.note.includes("Erstattung"));
  assert.equal(refund.kind, "income");
  assert.equal(refund.category, "Other", "a refund is not shopping");
  // the same export parsed again yields the same keys → re-import adds nothing
  const again = fg.parseImport(fg.parseDelimited(csv));
  assert.deepEqual([...again.rows.map((r) => r.importKey)], [...out.rows.map((r) => r.importKey)]);

  // minimal export with only the known core columns, numbers as numbers (from Excel)
  const minimal = fg.parseImport([
    ["Buchungstag", "Betrag", "Beguenstigter/Auftraggeber", "Verwendungszweck", "Name Referenzkonto"],
    [46333, -9.99, "SPOTIFY", "Premium", "Giro"],
  ]);
  assert.equal(minimal.rows[0].date, "2026-11-07");
  assert.equal(minimal.rows[0].category, "Subscriptions", "no category column → rule-based");
  assert.throws(() => fg.parseImport([["Datum der Sache", "Wert"], ["x", "y"]]), (e) => e.found.length === 2);
});

test("importing transactions skips known rows and can be undone", () => {
  const { useEmber } = sourceLoader({}, { window: {} })("src/lib/store.ts");
  const s = () => useEmber.getState();
  s().addTxn({ kind: "expense", amount: 5, category: "Other", date: "2026-11-01", note: "manual" });
  const row = (k) => ({ kind: "expense", amount: 3.2, category: "Dining", date: "2026-11-03", note: "Café", importKey: k, importBatch: "b1", account: "Giro" });
  assert.equal(s().importTxns([row("fg:a:1"), row("fg:a:2"), row("fg:a:1")]), 2, "duplicates inside one file are dropped too");
  assert.equal(s().importTxns([{ ...row("fg:a:1"), importBatch: "b2" }, { ...row("fg:b:1"), importBatch: "b2" }]), 1);
  assert.equal(s().txns.length, 4);
  assert.equal(s().deleteTxnBatch("b1"), 2);
  assert.equal(s().txns.length, 2);
  assert.ok(s().txns.some((t) => t.note === "manual"), "manual entries are never touched");
});

test("every Finanzguru import text exists in English and German", () => {
  const src = readFileSync(path.join(root, "src/components/finance/FinanzguruImport.tsx"), "utf8") + readFileSync(path.join(root, "src/app/finance/page.tsx"), "utf8");
  const keys = new Set([...src.matchAll(/t[r]?\("(fin\.fg\.[\w.]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size > 25);
  const i18n = readFileSync(path.join(root, "src/lib/i18n.ts"), "utf8");
  const deStart = i18n.indexOf("const de: Dict");
  for (const k of [...keys, "fin.cat.Insurance", "fin.cat.Cash", "fin.cat.Fees"]) {
    assert.ok(i18n.slice(0, deStart).includes(`"${k}":`), `missing English ${k}`);
    assert.ok(i18n.slice(deStart).includes(`"${k}":`), `missing German ${k}`);
  }
});

test("the Supabase client loads on demand, once, and recovers from a failed load", async () => {
  let loads = 0, created = 0, fail = true;
  const sdk = new Proxy({}, { get(_, key) {
    if (key === "createClient") return () => ({ id: ++created });
    return undefined;
  } });
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "key" };
  const make = (environment) => sourceLoader({
    "@supabase/supabase-js": new Proxy({}, { get(_, key) {
      if (key === "__esModule") return true;
      loads++;
      if (fail) { fail = false; throw new Error("chunk failed"); }
      return sdk[key];
    } }),
    "./store": { useEmber: { getState: () => ({}) } },
    "./crypto": { VAULT_STORAGE_KEY: "vault" },
  }, { process: { env: environment } })("src/lib/cloud.ts");
  assert.equal(await make({}).supabase(), null, "not configured → no client, nothing loaded");
  assert.equal(loads, 0);
  const cloud = make(env);
  await assert.rejects(cloud.supabase(), /chunk failed/);
  const [a, b] = await Promise.all([cloud.supabase(), cloud.supabase()]);
  assert.equal(a, b, "one client for everyone");
  assert.equal(created, 1);
});

test("route transitions navigate inside the view transition and never hang", async () => {
  const timers = [];
  let started = 0, done = null, navigated = 0;
  const document = {
    startViewTransition: (update) => {
      started++;
      done = update();
      return { ready: Promise.resolve(), finished: done };
    },
  };
  const window = { location: { href: "https://ember.app/tasks", origin: "https://ember.app", pathname: "/tasks" } };
  const rt = sourceLoader({}, {
    document, window, URL,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  })("src/lib/routeTransition.ts");

  rt.transitionTo(() => navigated++);
  assert.equal(started, 1);
  assert.equal(navigated, 1, "the navigation runs inside the transition");
  let settled = false;
  done.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "the old frame is held until the page mounts");
  rt.routeReady();
  await Promise.resolve();
  assert.equal(settled, true);

  // a page that never mounts cannot freeze the screen
  rt.transitionTo(() => navigated++);
  let released = false;
  done.then(() => { released = true; });
  const guard = timers.at(-1);
  assert.equal(guard.ms, 1500);
  guard.fn();
  await Promise.resolve();
  assert.equal(released, true);

  assert.equal(rt.isRouteChange("/habits"), true);
  assert.equal(rt.isRouteChange("/tasks?view=list"), false, "same page, other query: no transition");
  assert.equal(rt.isRouteChange("https://example.com/x"), false);

  // without View Transitions the navigation simply happens
  const plain = sourceLoader({}, { document: {}, window, URL, setTimeout })("src/lib/routeTransition.ts");
  let direct = 0;
  plain.transitionTo(() => direct++);
  assert.equal(direct, 1);
});
