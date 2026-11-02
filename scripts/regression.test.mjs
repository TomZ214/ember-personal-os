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
      supabase: () => sb, cloudConfigured: () => true,
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
