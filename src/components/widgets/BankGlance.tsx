"use client";

import Link from "next/link";
import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Landmark } from "lucide-react";
import { useBank } from "@/hooks/useIntegrations";
import { useEmber } from "@/lib/store";
import { eur, todayKey } from "@/lib/dates";

/** full-width finance strip: balance · monthly flow · latest movements. */
export function BankGlanceWidget() {
  const bank = useBank();
  const privacy = useEmber((s) => s.privacy);
  const monthKey = todayKey().slice(0, 7);

  const { spent, incoming } = useMemo(() => {
    const inMonth = bank.transactions.filter((t) => t.date.startsWith(monthKey) && !t.pending);
    return {
      spent: inMonth.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0),
      incoming: inMonth.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0),
    };
  }, [bank.transactions, monthKey]);

  if (!bank.connected || !bank.syncedAt) return null;

  const balance = bank.accounts.reduce((a, acc) => a + acc.balance, 0);
  const subsMonthly = bank.subscriptions.reduce((a, s) => a + s.amount, 0);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
          <Landmark size={14} /> {bank.status?.account}
        </p>
        <Link href="/finance" className="text-xs text-faint transition-colors hover:text-accent">
          Finance ↗
        </Link>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-faint">Balance</p>
          <p className={`num mt-1 text-2xl font-semibold tracking-tight ${privacy ? "money-blur" : ""}`}>{eur(balance)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-faint">{format(new Date(), "MMMM")}</p>
          <p className={`num mt-1 flex items-baseline gap-3 text-sm ${privacy ? "money-blur" : ""}`}>
            <span className="flex items-center gap-1 text-success"><ArrowDownLeft size={12} />{eur(Math.round(incoming))}</span>
            <span className="flex items-center gap-1" style={{ color: "var(--c-ember)" }}><ArrowUpRight size={12} />{eur(Math.round(spent))}</span>
          </p>
          <p className={`num mt-1 text-xs text-faint ${privacy ? "money-blur" : ""}`}>≈ {eur(Math.round(subsMonthly))}/mo recurring</p>
        </div>
        <div className="col-span-2">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">Latest</p>
          <ul className="flex flex-col gap-1">
            {bank.transactions.slice(0, 3).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-[13px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.amount > 0 ? "var(--success)" : "var(--c-ember)" }} />
                <span className="min-w-0 flex-1 truncate text-muted">{t.merchant}</span>
                <span className="num shrink-0 text-xs text-faint">{format(parseISO(t.date), "MMM d")}</span>
                <span className={`num shrink-0 font-medium ${t.amount > 0 ? "text-success" : ""} ${privacy ? "money-blur" : ""}`}>
                  {t.amount > 0 ? "+" : "−"}{eur(Math.abs(t.amount))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
