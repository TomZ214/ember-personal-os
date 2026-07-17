"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { format, formatDistanceToNow, parseISO, subMonths } from "date-fns";
import {
  ArrowDownLeft, ArrowUpRight, Landmark, Loader2, RefreshCw, TrendingDown, TrendingUp,
} from "lucide-react";
import { useEmber } from "@/lib/store";
import { eur, todayKey, dfLocale } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";
import type { useBank } from "@/hooks/useIntegrations";
import { Donut, MonthBars, SummaryCard } from "./charts";
import { BudgetPanel } from "./BudgetPanel";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/Button";

const CAT_CSS = ["var(--c-ember)", "var(--c-amber)", "var(--c-sage)", "var(--c-sky)", "var(--c-lilac)", "var(--c-rose)"];

export function BankPanel({ bank }: { bank: ReturnType<typeof useBank> }) {
  const privacy = useEmber((s) => s.privacy);
  const tr = useT();
  const lang = useLang();
  const monthKey = todayKey().slice(0, 7);
  const txns = bank.transactions;

  const { income, expenses, months, categories, insights } = useMemo(() => {
    const inMonth = txns.filter((t) => t.date.startsWith(monthKey) && !t.pending);
    const income = inMonth.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const expenses = inMonth.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);

    const months = Array.from({ length: 4 }, (_, i) => {
      const key = format(subMonths(new Date(), 3 - i), "yyyy-MM");
      const list = txns.filter((t) => t.date.startsWith(key) && !t.pending);
      return {
        label: format(subMonths(new Date(), 3 - i), "MMM", { locale: dfLocale(lang) }),
        income: list.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0),
        expenses: list.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0),
      };
    });

    const catMap = new Map<string, number>();
    for (const t of inMonth.filter((t) => t.amount < 0 && t.category !== "Savings")) {
      catMap.set(t.category, (catMap.get(t.category) ?? 0) - t.amount);
    }
    const categories = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount], i) => ({ name, amount, color: CAT_CSS[i % CAT_CSS.length] }));

    // insights
    const lastMonthKey = format(subMonths(new Date(), 1), "yyyy-MM");
    const lastMonthSpend = txns
      .filter((t) => t.date.startsWith(lastMonthKey) && t.amount < 0 && !t.pending)
      .reduce((a, t) => a - t.amount, 0);
    const delta = lastMonthSpend > 0 ? Math.round(((expenses - lastMonthSpend) / lastMonthSpend) * 100) : null;
    const biggest = inMonth.filter((t) => t.amount < 0).sort((a, b) => a.amount - b.amount)[0];
    const insights: { icon: "up" | "down"; text: string }[] = [];
    if (delta !== null) {
      const month = format(subMonths(new Date(), 1), "MMMM", { locale: dfLocale(lang) });
      insights.push({
        icon: delta > 0 ? "up" : "down",
        text: (delta >= 0 ? tr("fin.spendingUp") : tr("fin.spendingDown"))
          .replace("{pct}", String(Math.abs(delta)))
          .replace("{month}", month),
      });
    }
    if (categories[0]) insights.push({ icon: "up", text: tr("fin.topCategory").replace("{cat}", tr(`fin.cat.${categories[0].name}`, categories[0].name)).replace("{amount}", eur(Math.round(categories[0].amount))) });
    if (biggest) insights.push({ icon: "up", text: tr("fin.largestExpense").replace("{merchant}", biggest.merchant).replace("{amount}", eur(-biggest.amount)) });

    return { income, expenses, months, categories, insights };
  }, [txns, monthKey, lang, tr]);

  const totalBalance = bank.accounts.reduce((a, acc) => a + acc.balance, 0);

  if (!bank.syncedAt && bank.syncing) {
    return (
      <div className="panel flex flex-col items-center gap-3 py-16 text-center">
        <Loader2 size={22} className="animate-spin text-accent" />
        <p className="text-sm font-medium">{tr("fin.syncing")}</p>
        <p className="max-w-[40ch] text-xs text-muted">
          {tr("fin.syncingHint")}
        </p>
      </div>
    );
  }

  if (!bank.syncedAt) {
    return (
      <div className="panel">
        <EmptyState
          icon={<Landmark size={20} />}
          title={bank.syncError ? tr("fin.syncFailed") : tr("fin.noBankData")}
          hint={bank.syncError ?? tr("fin.runFirstSync")}
          action={<Button variant="primary" onClick={() => bank.sync()}>{bank.syncError ? tr("fin.retrySync") : tr("fin.syncNow")}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* balances */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard blur={privacy} label={tr("fin.totalBalance")} value={eur(Math.round(totalBalance * 100) / 100)} tone="var(--accent)" icon={<Landmark size={14} />} />
        <SummaryCard blur={privacy} label={tr("fin.incomeMonth")} value={eur(Math.round(income))} tone="var(--success)" icon={<ArrowDownLeft size={15} />} />
        <SummaryCard blur={privacy} label={tr("fin.expensesMonth")} value={eur(Math.round(expenses))} tone="var(--c-ember)" icon={<ArrowUpRight size={15} />} />
        <SummaryCard blur={privacy} label={tr("fin.netMonth")} value={`${income - expenses >= 0 ? "+" : ""}${eur(Math.round(income - expenses))}`}
          tone={income - expenses >= 0 ? "var(--success)" : "var(--danger)"} />
      </div>

      {/* accounts + insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="panel p-5 lg:col-span-5">
          <p className="mb-3 text-[13px] font-medium text-muted">{tr("fin.accounts")} · {bank.status?.account}</p>
          <ul className="flex flex-col gap-2.5">
            {bank.accounts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3.5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-accent/12 text-accent">
                  <Landmark size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.name}</p>
                  <p className="num text-xs text-faint">
                    {a.iban ? `···${a.iban.slice(-4)}` : a.balanceType}
                  </p>
                </div>
                <span className={`num text-[15px] font-semibold ${privacy ? "money-blur" : ""}`}>{eur(a.balance)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5 lg:col-span-7">
          <p className="mb-3 text-[13px] font-medium text-muted">{tr("fin.insights")}</p>
          <ul className="flex flex-col gap-2.5">
            {insights.map((ins, i) => (
              <motion.li
                key={ins.text}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`flex items-center gap-2.5 text-sm text-muted ${privacy ? "money-blur" : ""}`}
              >
                {ins.icon === "down" ? (
                  <TrendingDown size={15} className="shrink-0 text-success" />
                ) : (
                  <TrendingUp size={15} className="shrink-0 text-accent" />
                )}
                {ins.text}
              </motion.li>
            ))}
            {insights.length === 0 && <li className="text-sm text-faint">{tr("fin.notEnoughData")}</li>}
          </ul>
          <p className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-xs text-faint">
            {tr("fin.synced")} {formatDistanceToNow(parseISO(bank.syncedAt), { addSuffix: true, locale: dfLocale(lang) })}
            <button onClick={() => bank.sync()} disabled={bank.syncing} className="flex items-center gap-1 text-accent hover:underline disabled:opacity-50">
              {bank.syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} {tr("fin.syncNow")}
            </button>
          </p>
        </div>

        {/* cash flow */}
        <div className="panel p-5 lg:col-span-7">
          <p className="mb-1 text-[13px] font-medium text-muted">{tr("fin.cashFlow")}</p>
          <p className="mb-5 text-xs text-faint">{tr("fin.realTxnsFourMonths")}</p>
          <MonthBars months={months} />
        </div>

        {/* categories */}
        <div className="panel p-5 lg:col-span-5">
          <p className="mb-1 text-[13px] font-medium text-muted">{tr("fin.whereItWent")}</p>
          <p className="mb-4 text-xs text-faint">{tr("fin.autoCatThisMonth")}</p>
          <Donut categories={categories} total={expenses} blur={privacy} />
        </div>

        {/* budgets */}
        <div className="lg:col-span-12">
          <BudgetPanel txns={txns} blur={privacy} />
        </div>

        {/* detected subscriptions */}
        <div className="panel p-5 lg:col-span-5">
          <p className="mb-1 text-[13px] font-medium text-muted">{tr("fin.recurringPayments")}</p>
          <p className="mb-4 text-xs text-faint">{tr("fin.detectedFromStatement")}</p>
          {bank.subscriptions.length === 0 ? (
            <p className="py-4 text-sm text-faint">{tr("fin.noRecurring")}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {bank.subscriptions.slice(0, 7).map((s) => (
                <li key={s.merchant} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.06] text-[13px] font-semibold text-muted">
                    {s.merchant[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{s.merchant}</p>
                    <p className="text-[11px] text-faint">{tr(`fin.cat.${s.category}`, s.category)} · {tr("fin.seen")} {s.occurrences}×</p>
                  </div>
                  <span className={`num text-sm text-muted ${privacy ? "money-blur" : ""}`}>{eur(s.amount)}<span className="text-faint">/{tr("fin.moAbbr")}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* transactions */}
        <div className="panel overflow-hidden lg:col-span-7">
          <p className="px-5 pb-2 pt-5 text-[13px] font-medium text-muted">{tr("fin.latestTransactions")}</p>
          <div className="divide-y divide-white/[0.05]">
            {txns.slice(0, 14).map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  t.amount > 0 ? "bg-success/15 text-success" : "bg-white/[0.06] text-muted"
                }`}>
                  {t.amount > 0 ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {t.merchant}
                    {t.pending && <span className="ml-2 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-faint">{tr("fin.pending")}</span>}
                  </p>
                  <p className="truncate text-[11px] text-faint">{tr(`fin.cat.${t.category}`, t.category)} · {format(parseISO(t.date), lang === "de" ? "d. MMM" : "MMM d", { locale: dfLocale(lang) })}</p>
                </div>
                <span className={`num text-sm font-medium ${t.amount > 0 ? "text-success" : ""} ${privacy ? "money-blur" : ""}`}>
                  {t.amount > 0 ? "+" : "−"}{eur(Math.abs(t.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
