"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { format, parseISO, subMonths } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Coins, Eye, EyeOff, Landmark, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useBank } from "@/hooks/useIntegrations";
import { eur, todayKey, dfLocale } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import { CATEGORY_VAR, type Txn } from "@/lib/types";
import { BankPanel } from "@/components/finance/BankPanel";
import { BudgetPanel } from "@/components/finance/BudgetPanel";
import { Donut, MonthBars, SummaryCard } from "@/components/finance/charts";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Select } from "@/components/ui/inputs";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";

const CAT_COLORS = ["ember", "amber", "sage", "sky", "lilac", "rose"] as const;

export default function FinancePage() {
  const hydrated = useHydrated();
  const txns = useEmber((s) => s.txns);
  const subs = useEmber((s) => s.subs);
  const deleteTxn = useEmber((s) => s.deleteTxn);
  const [adding, setAdding] = useState(false);
  const bank = useBank();
  const privacy = useEmber((s) => s.privacy);
  const togglePrivacy = useEmber((s) => s.togglePrivacy);
  const [tab, setTab] = useState<"bank" | "manual">("bank");
  const showBank = bank.connected && tab === "bank";
  const tr = useT();
  const lang = useLang();

  const monthKey = todayKey().slice(0, 7);

  const { income, expenses, months, categories } = useMemo(() => {
    const inMonth = txns.filter((t) => t.date.startsWith(monthKey));
    const income = inMonth.filter((t) => t.kind === "income").reduce((a, t) => a + t.amount, 0);
    const expenses = inMonth.filter((t) => t.kind === "expense").reduce((a, t) => a + t.amount, 0);

    const months = Array.from({ length: 4 }, (_, i) => {
      const key = format(subMonths(new Date(), 3 - i), "yyyy-MM");
      const list = txns.filter((t) => t.date.startsWith(key));
      return {
        label: format(subMonths(new Date(), 3 - i), "MMM", { locale: dfLocale(lang) }),
        income: list.filter((t) => t.kind === "income").reduce((a, t) => a + t.amount, 0),
        expenses: list.filter((t) => t.kind === "expense").reduce((a, t) => a + t.amount, 0),
      };
    });

    const catMap = new Map<string, number>();
    for (const t of inMonth.filter((t) => t.kind === "expense"))
      catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount);
    const categories = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount], i) => ({ name, amount, color: CATEGORY_VAR[CAT_COLORS[i % CAT_COLORS.length]] }));

    return { income, expenses, months, categories };
  }, [txns, monthKey, lang]);

  const subsMonthly = subs.reduce((a, s) => a + (s.cycle === "monthly" ? s.amount : s.amount / 12), 0);
  const recent = useMemo(() => [...txns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12), [txns]);

  // the budget panel speaks the bank's language: money out is negative
  const budgetTxns = useMemo(
    () =>
      txns.map((t) => ({
        date: t.date,
        amount: t.kind === "expense" ? -t.amount : t.amount,
        category: t.category,
      })),
    [txns],
  );

  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;

  return (
    <div>
      <PageHeader
        title={tr("fin.title")}
        sub={showBank ? `${format(new Date(), "MMMM yyyy", { locale: dfLocale(lang) })} · ${tr("fin.liveFrom")} ${bank.status?.account}` : format(new Date(), "MMMM yyyy", { locale: dfLocale(lang) })}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={togglePrivacy}
              aria-label={privacy ? tr("fin.showAmounts") : tr("fin.hideAmounts")}
              title={privacy ? tr("fin.showAmounts") : tr("fin.privacyScreen")}
              aria-pressed={privacy}
            >
              {privacy ? <EyeOff size={15} /> : <Eye size={15} />}
            </Button>
            {bank.connected && (
              <div className="flex rounded-[11px] border border-white/[0.08] bg-white/[0.04] p-0.5">
                {(["bank", "manual"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setTab(v)}
                    aria-pressed={tab === v}
                    className={`relative flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium transition-colors ${
                      tab === v ? "text-ink" : "text-faint hover:text-muted"
                    }`}
                  >
                    {tab === v && (
                      <motion.span
                        layoutId="fin-tab"
                        className="absolute inset-0 rounded-[9px] bg-white/[0.09]"
                        transition={{ type: "spring", stiffness: 500, damping: 38 }}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      {v === "bank" ? <Landmark size={13} /> : <NotebookPen size={13} />}
                      <span className="hidden sm:inline">{v === "bank" ? tr("fin.bank") : tr("fin.manual")}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!showBank && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> {tr("fin.addTxn")}
              </Button>
            )}
          </>
        }
      />

      {showBank && <BankPanel bank={bank} />}

      {!showBank && (
      <>
      {/* month summary */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard blur={privacy} label={tr("fin.income")} value={eur(income)} tone="var(--success)" icon={<ArrowDownLeft size={15} />} />
        <SummaryCard blur={privacy} label={tr("fin.expenses")} value={eur(expenses)} tone="var(--c-ember)" icon={<ArrowUpRight size={15} />} />
        <SummaryCard blur={privacy} label={tr("fin.net")} value={`${income - expenses >= 0 ? "+" : ""}${eur(income - expenses)}`}
          tone={income - expenses >= 0 ? "var(--success)" : "var(--danger)"} />
        <SummaryCard blur={privacy} label={tr("fin.subscriptions")} value={`${eur(subsMonthly)}/${tr("fin.moAbbr")}`} tone="var(--c-lilac)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 4-month bars */}
        <div className="panel p-5 lg:col-span-7">
          <p className="mb-1 text-[13px] font-medium text-muted">{tr("fin.incomeVsExpenses")}</p>
          <p className="mb-5 text-xs text-faint">{tr("fin.lastFourMonths")}</p>
          <MonthBars months={months} />
        </div>

        {/* category breakdown */}
        <div className="panel p-5 lg:col-span-5">
          <p className="mb-1 text-[13px] font-medium text-muted">{tr("fin.whereItWent")}</p>
          <p className="mb-4 text-xs text-faint">{tr("fin.spendingByCat")}</p>
          <Donut categories={categories} total={expenses} blur={privacy} />
        </div>

        {/* budgets — same analysis, driven by the manually logged spending */}
        <div className="lg:col-span-12">
          <BudgetPanel txns={budgetTxns} blur={privacy} />
        </div>

        {/* subscriptions */}
        <div className="panel p-5 lg:col-span-5">
          <p className="mb-4 text-[13px] font-medium text-muted">{tr("fin.subscriptions")}</p>
          <ul className="flex flex-col gap-2.5">
            {subs.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-semibold"
                  style={{ background: `color-mix(in oklch, ${CATEGORY_VAR[s.color]} 16%, transparent)`, color: CATEGORY_VAR[s.color] }}>
                  {s.name[0]}
                </span>
                <span className="flex-1 text-sm">{s.name}</span>
                <span className={`num text-sm text-muted ${privacy ? "money-blur" : ""}`}>
                  {eur(s.amount)}<span className="text-faint">/{s.cycle === "monthly" ? tr("fin.moAbbr") : tr("fin.yrAbbr")}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="num mt-4 border-t border-white/[0.06] pt-3 text-right text-sm text-muted">
            ≈ {eur(subsMonthly)} {tr("fin.perMonth")}
          </p>
        </div>

        {/* recent transactions */}
        <div className="panel overflow-hidden lg:col-span-7">
          <p className="px-5 pb-2 pt-5 text-[13px] font-medium text-muted">{tr("fin.recentActivity")}</p>
          {recent.length === 0 ? (
            bank.connected ? (
              <EmptyState icon={<Coins size={20} />} title={tr("fin.noManual")} hint={tr("fin.noManualHint")} />
            ) : (
              <EmptyState
                icon={<Coins size={20} />}
                title={tr("fin.connectBank")}
                hint={tr("fin.connectBankHint")}
                action={
                  <Link href="/settings/connections">
                    <Button variant="primary">{tr("fin.connectBankBtn")}</Button>
                  </Link>
                }
              />
            )
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {recent.map((t) => (
                <div key={t.id} className="group flex items-center gap-3 px-5 py-2.5">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    t.kind === "income" ? "bg-success/15 text-success" : "bg-white/[0.06] text-muted"
                  }`}>
                    {t.kind === "income" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.note || tr(`fin.cat.${t.category}`, t.category)}</p>
                    <p className="text-[11px] text-faint">{tr(`fin.cat.${t.category}`, t.category)} · {format(parseISO(t.date), lang === "de" ? "d. MMM" : "MMM d", { locale: dfLocale(lang) })}</p>
                  </div>
                  <span className={`num text-sm font-medium ${t.kind === "income" ? "text-success" : ""} ${privacy ? "money-blur" : ""}`}>
                    {t.kind === "income" ? "+" : "-"}{eur(t.amount)}
                  </span>
                  <button
                    onClick={() => { deleteTxn(t.id); toast(tr("fin.txnRemoved"), "info"); }}
                    aria-label={tr("fin.deleteTxn")}
                    className="rounded p-1 text-faint opacity-0 transition-all hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      </>
      )}

      <AddTxn open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function AddTxn({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addTxn = useEmber((s) => s.addTxn);
  const tr = useT();
  const [kind, setKind] = useState<Txn["kind"]>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Groceries");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());

  const save = () => {
    const n = parseFloat(amount.replace(",", "."));
    if (!n || n <= 0) return;
    addTxn({ kind, amount: n, category, note: note.trim(), date });
    toast((kind === "income" ? tr("fin.incomeAdded") : tr("fin.expenseAdded")).replace("{amount}", eur(n)));
    setAmount(""); setNote("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={tr("fin.addTxn")}>
      <div className="flex flex-col gap-4">
        <div className="flex rounded-[11px] border border-white/[0.08] bg-white/[0.04] p-0.5">
          {(["expense", "income"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
              className={`relative h-9 flex-1 rounded-[9px] text-sm font-medium transition-colors ${kind === k ? "text-ink" : "text-faint"}`}>
              {kind === k && (
                <motion.span layoutId="txn-kind" className="absolute inset-0 rounded-[9px] bg-white/[0.09]"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }} />
              )}
              <span className="relative">{k === "expense" ? tr("fin.kindExpense") : tr("fin.kindIncome")}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{tr("fin.amountEuro")}</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          </label>
          <label>
            <Label>{tr("fin.date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label>
          <Label>{tr("fin.category")}</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {(kind === "expense"
              ? ["Groceries", "Rent", "Dining", "Transport", "Health", "Shopping", "Travel", "Other"]
              : ["Salary", "Freelance", "Gift", "Other"]
            ).map((c) => <option key={c} value={c}>{tr(`fin.cat.${c}`, c)}</option>)}
          </Select>
        </label>
        <label>
          <Label>{tr("fin.note")}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("fin.optional")} />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{tr("action.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={!parseFloat(amount.replace(",", "."))}>{tr("fin.add")}</Button>
        </div>
      </div>
    </Modal>
  );
}
