"use client";

import { motion } from "framer-motion";
import { subDays, format } from "date-fns";
import { useEmber } from "@/lib/store";
import { dayKey, todayKey, dfLocale } from "@/lib/dates";
import { useLang, useT } from "@/lib/i18n";

/** Last 14 days of completed tasks + habit check-ins as a mini bar chart. */
export function WeekPulseWidget() {
  const tasks = useEmber((s) => s.tasks);
  const habits = useEmber((s) => s.habits);
  const t = useT();
  const lang = useLang();

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    const key = dayKey(d);
    const tc = tasks.filter((x) => x.completedAt?.slice(0, 10) === key).length;
    const h = habits.filter((x) => x.log[key]).length;
    return { key, label: format(d, "EEEEE", { locale: dfLocale(lang) }), tasks: tc, habits: h, total: tc + h };
  });
  const max = Math.max(4, ...days.map((d) => d.total));
  const thisWeek = days.slice(7).reduce((a, d) => a + d.total, 0);
  const lastWeek = days.slice(0, 7).reduce((a, d) => a + d.total, 0);
  const delta = lastWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{t("w.twoWeekPulse")}</p>
        <p className={`num text-xs font-medium ${delta >= 0 ? "text-success" : "text-danger"}`}>
          {delta >= 0 ? "+" : ""}
          {delta}{t("w.vsLastWeek")}
        </p>
      </div>
      <p className="mb-4 text-xs text-faint">{t("w.pulseSub")}</p>

      <div className="flex flex-1 items-end gap-1.5">
        {days.map((d, i) => {
          const isToday = d.key === todayKey();
          return (
            <div key={d.key} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="pointer-events-none absolute -top-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                {d.total}
              </span>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (d.total / max) * 100)}%` }}
                transition={{ delay: i * 0.03, type: "spring", stiffness: 160, damping: 22 }}
                className="w-full rounded-[5px]"
                style={{
                  background: isToday
                    ? "var(--primary-bright)"
                    : i >= 7
                      ? "color-mix(in oklch, var(--primary) 55%, transparent)"
                      : "oklch(1 0 0 / 0.10)",
                  boxShadow: isToday ? "0 0 12px -2px var(--primary)" : undefined,
                }}
              />
              <span className={`text-[9px] ${isToday ? "text-ink" : "text-faint"}`}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
