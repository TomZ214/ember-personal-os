"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format, getDaysInMonth, subMonths } from "date-fns";
import { AlertTriangle, Check, PiggyBank, Plus, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useEmber } from "@/lib/store";
import { eur, todayKey, dfLocale } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import type { Budgets } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/inputs";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

interface Movement {
  date: string;
  amount: number; // negative = money out
  category: string;
  pending?: boolean;
}

type Status = "ok" | "warn" | "over";

const TONE: Record<Status, { color: string; label: string }> = {
  ok: { color: "var(--success)", label: "On track" },
  warn: { color: "var(--c-amber)", label: "Running close" },
  over: { color: "var(--danger)", label: "Over budget" },
};

/**
 * Budget analysis: what you set, what you've spent, and — the useful part —
 * whether your current pace lands you over the line before the month is out.
 */
export function BudgetPanel({ txns, blur }: { txns: Movement[]; blur: boolean }) {
  const settings = useEmber((s) => s.settings);
  const updateSettings = useEmber((s) => s.updateSettings);
  const tr = useT();
  const lang = useLang();
  const budgets: Budgets = useMemo(() => settings.budgets ?? {}, [settings.budgets]);
  const [editing, setEditing] = useState(false);

  const monthKey = todayKey().slice(0, 7);
  const now = new Date();
  const daysInMonth = getDaysInMonth(now);
  const dayOfMonth = now.getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  const model = useMemo(() => {
    const spend = (list: Movement[]) => {
      const m = new Map<string, number>();
      for (const t of list) {
        if (t.amount >= 0 || t.pending) continue;
        m.set(t.category, (m.get(t.category) ?? 0) - t.amount);
      }
      return m;
    };

    const thisMonth = spend(txns.filter((t) => t.date.startsWith(monthKey)));

    // 3-month average per category — used to suggest sensible limits
    const past = [1, 2, 3].map((back) => {
      const key = format(subMonths(now, back), "yyyy-MM");
      return spend(txns.filter((t) => t.date.startsWith(key)));
    });
    const avg = new Map<string, number>();
    const allCats = new Set<string>([...thisMonth.keys(), ...past.flatMap((m) => [...m.keys()])]);
    for (const c of allCats) {
      const vals = past.map((m) => m.get(c) ?? 0);
      avg.set(c, vals.reduce((a, b) => a + b, 0) / past.length);
    }

    const lastMonth = past[0];

    const rows = Object.entries(budgets)
      .filter(([, limit]) => limit > 0)
      .map(([category, limit]) => {
        const spent = thisMonth.get(category) ?? 0;
        const pct = limit > 0 ? spent / limit : 0;
        // linear pace: at this rate, where does the month end up?
        const projected = monthProgress > 0 ? spent / monthProgress : spent;
        const status: Status = pct >= 1 ? "over" : pct >= 0.8 ? "warn" : "ok";
        const prev = lastMonth.get(category) ?? 0;
        const delta = prev > 0 ? Math.round(((spent - prev) / prev) * 100) : null;
        return { category, limit, spent, pct, projected, status, delta, willOvershoot: projected > limit * 1.02 };
      })
      .sort((a, b) => b.pct - a.pct);

    // spending with no budget yet — worth flagging
    const unbudgeted = [...thisMonth.entries()]
      .filter(([c]) => !budgets[c])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, spent]) => ({ category, spent }));

    const totalLimit = rows.reduce((a, r) => a + r.limit, 0);
    const totalSpent = rows.reduce((a, r) => a + r.spent, 0);
    const totalProjected = rows.reduce((a, r) => a + r.projected, 0);

    return { rows, unbudgeted, totalLimit, totalSpent, totalProjected, avg, thisMonth, allCats: [...allCats] };
    // `now` is intentionally read fresh on each render; the month math is cheap
  }, [txns, budgets, monthKey, monthProgress]); // eslint-disable-line react-hooks/exhaustive-deps

  const { rows, unbudgeted, totalLimit, totalSpent, totalProjected } = model;
  const left = totalLimit - totalSpent;
  const money = (n: number) => (blur ? "•••" : eur(Math.round(n)));

  return (
    <div className="panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <Target size={14} /> {tr("fin.budgets")}
          </p>
          <p className="mt-0.5 text-xs text-faint">
            {tr("fin.dayProgress")
              .replace("{d}", String(dayOfMonth))
              .replace("{total}", String(daysInMonth))
              .replace("{pct}", String(Math.round(monthProgress * 100)))
              .replace("{month}", format(now, "MMMM", { locale: dfLocale(lang) }))}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing(true)}>
          {rows.length === 0 ? <><Plus size={13} /> {tr("fin.setBudgets")}</> : tr("fin.editBudgets")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<PiggyBank size={20} />}
          title={tr("fin.noBudgets")}
          hint={tr("fin.noBudgetsHint")}
          action={<Button variant="primary" onClick={() => setEditing(true)}>{tr("fin.setupBudgets")}</Button>}
        />
      ) : (
        <>
          {/* overall */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={tr("fin.budgeted")} value={money(totalLimit)} />
            <Stat label={tr("fin.spentLabel")} value={money(totalSpent)} tone="var(--c-ember)" />
            <Stat
              label={left >= 0 ? tr("fin.left") : tr("fin.over")}
              value={money(Math.abs(left))}
              tone={left >= 0 ? "var(--success)" : "var(--danger)"}
            />
            <Stat
              label={tr("fin.projected")}
              value={money(totalProjected)}
              tone={totalProjected > totalLimit ? "var(--danger)" : "var(--success)"}
              hint={totalProjected > totalLimit ? tr("fin.overBy").replace("{amount}", money(totalProjected - totalLimit)) : tr("fin.withinBudget")}
            />
          </div>

          <ul className="flex flex-col gap-3.5">
            {rows.map((r, i) => (
              <motion.li
                key={r.category}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {tr(`fin.cat.${r.category}`, r.category)}
                    {r.status === "over" && <AlertTriangle size={12} className="text-danger" />}
                    {r.status === "ok" && !r.willOvershoot && <Check size={12} className="text-success" />}
                  </span>
                  <span className={`num shrink-0 text-[13px] ${blur ? "money-blur" : ""}`}>
                    <span style={{ color: TONE[r.status].color }}>{eur(Math.round(r.spent))}</span>
                    <span className="text-faint"> / {eur(Math.round(r.limit))}</span>
                  </span>
                </div>

                {/* bar: spend, plus a marker for where the month currently is */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/[0.07]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, r.pct * 100)}%` }}
                    transition={{ type: "spring", stiffness: 90, damping: 20, delay: i * 0.04 }}
                    className="h-full rounded-full"
                    style={{ background: TONE[r.status].color }}
                  />
                  <span
                    aria-hidden
                    title={tr("fin.monthHere")}
                    className="absolute top-0 h-full w-px bg-white/45"
                    style={{ left: `${monthProgress * 100}%` }}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  <span style={{ color: TONE[r.status].color }}>
                    {r.status === "over"
                      ? tr("fin.overSuffix").replace("{amount}", eur(Math.round(r.spent - r.limit)))
                      : tr("fin.leftSuffix").replace("{amount}", eur(Math.round(r.limit - r.spent)))}
                  </span>
                  {r.willOvershoot && r.status !== "over" && (
                    <span className="flex items-center gap-1 text-warning">
                      <TrendingUp size={11} /> {tr("fin.atThisPace").replace("{amount}", eur(Math.round(r.projected)))}
                    </span>
                  )}
                  {r.delta !== null && (
                    <span className="flex items-center gap-1 text-faint">
                      {r.delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {tr("fin.vsLastMonth").replace("{pct}", String(Math.abs(r.delta)))}
                    </span>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>

          {unbudgeted.length > 0 && (
            <div className="mt-5 border-t border-white/[0.06] pt-3.5">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">{tr("fin.noBudgetSet")}</p>
              <div className="flex flex-wrap gap-2">
                {unbudgeted.map((u) => (
                  <button
                    key={u.category}
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-3 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.09] hover:text-ink"
                  >
                    <Plus size={11} />
                    {tr(`fin.cat.${u.category}`, u.category)}
                    <span className={`num text-faint ${blur ? "money-blur" : ""}`}>{eur(Math.round(u.spent))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <BudgetEditor
        open={editing}
        onClose={() => setEditing(false)}
        categories={model.allCats}
        budgets={budgets}
        suggest={(c) => Math.round((model.avg.get(c) ?? 0) / 10) * 10}
        onSave={(next) => {
          updateSettings({ budgets: next });
          toast(tr("fin.budgetsSaved"));
          setEditing(false);
        }}
      />
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3.5 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className="num mt-0.5 truncate text-[15px] font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {hint && <p className="truncate text-[10px] text-faint">{hint}</p>}
    </div>
  );
}

/* ---------------- editor ---------------- */

function BudgetEditor({
  open, onClose, categories, budgets, suggest, onSave,
}: {
  open: boolean;
  onClose: () => void;
  categories: string[];
  budgets: Budgets;
  suggest: (c: string) => number;
  onSave: (b: Budgets) => void;
}) {
  const tr = useT();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [inited, setInited] = useState(false);

  if (open && !inited) {
    setInited(true);
    setDraft(Object.fromEntries(categories.map((c) => [c, budgets[c] ? String(budgets[c]) : ""])));
  }
  if (!open && inited) setInited(false);

  const save = () => {
    const next: Budgets = {};
    for (const [c, v] of Object.entries(draft)) {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n) && n > 0) next[c] = Math.round(n);
    }
    onSave(next);
  };

  const fillSuggestions = () =>
    setDraft((d) =>
      Object.fromEntries(
        Object.keys(d).map((c) => {
          const s = suggest(c);
          return [c, d[c] || (s > 0 ? String(s) : "")];
        }),
      ),
    );

  return (
    <Modal open={open} onClose={onClose} title={tr("fin.monthlyBudgets")}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted">
          {tr("fin.budgetEditorIntro")}
        </p>

        {categories.length === 0 ? (
          <p className="py-4 text-sm text-faint">
            {tr("fin.noCatsYet")}
          </p>
        ) : (
          <>
            <button
              onClick={fillSuggestions}
              className="self-start text-xs text-accent underline underline-offset-2 hover:text-ink"
            >
              {tr("fin.suggestAvg")}
            </button>
            <div className="flex flex-col gap-2.5">
              {categories.map((c) => (
                <label key={c} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{tr(`fin.cat.${c}`, c)}</span>
                  <span className="flex w-32 shrink-0 items-center gap-1.5">
                    <Input
                      inputMode="decimal"
                      value={draft[c] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
                      placeholder={suggest(c) > 0 ? String(suggest(c)) : "—"}
                      className="h-9 text-right"
                      aria-label={tr("fin.monthlyBudgetFor").replace("{c}", tr(`fin.cat.${c}`, c))}
                    />
                    <span className="text-xs text-faint">€</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{tr("action.cancel")}</Button>
          <Button variant="primary" onClick={save}>{tr("fin.saveBudgets")}</Button>
        </div>
      </div>
    </Modal>
  );
}
