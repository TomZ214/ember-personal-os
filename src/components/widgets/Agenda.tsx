"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SPRING, staggerDelay, withFade } from "@/lib/motion";
import { ArrowUpRight, CalendarDays, MapPin, Plus } from "lucide-react";
import { eventOccursOn, useCalendarSource } from "@/hooks/useIntegrations";
import { minutesToLabel, todayKey } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { EmptyState } from "@/components/ui/misc";

export function AgendaWidget() {
  const cal = useCalendarSource();
  const t = useT();
  const [nowMin, setNowMin] = useState(-1);

  useEffect(() => {
    const update = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    const raf = requestAnimationFrame(update);
    const t = setInterval(update, 60_000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, []);

  const today = todayKey();
  const list = cal.events
    .filter((e) => eventOccursOn(e, today))
    .sort((a, b) => Number(a.allDay ? -1 : 0) - Number(b.allDay ? -1 : 0) || a.start - b.start);

  return (
    <div className="panel flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">
          {t("w.agenda")}
          {cal.connected && <span className="ml-2 text-[11px] text-faint">· {t("w.googleSynced")}</span>}
        </p>
        <Link href="/calendar" className="-mx-1 -my-2 flex items-center gap-1 px-1 py-2 text-xs text-faint transition-colors hover:text-accent">
          {t("w.calendar")} <ArrowUpRight size={13} />
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            size="sm"
            icon={<CalendarDays size={20} />}
            title={t("w.clearDay")}
            hint={t("w.clearDayHint")}
            action={
              <Link href="/calendar" className="pressable inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-white/[0.08] bg-white/[0.06] px-3 text-[13px] font-medium hover:bg-white/[0.10]">
                <Plus size={14} /> {t("w.addEvent")}
              </Link>
            }
          />
        </div>
      ) : (
        <ol className="relative flex flex-col">
          {list.slice(0, 7).map((e, i) => {
            const past = !e.allDay && nowMin >= 0 && e.end < nowMin;
            const current = !e.allDay && nowMin >= 0 && e.start <= nowMin && nowMin <= e.end;
            return (
              <motion.li
                key={e.id}
                // Past events stay dimmed: the dimming is the animation's
                // target, not a class. A class lost to the inline opacity the
                // entrance leaves behind, so everything ended up at full
                // strength.
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: past ? 0.45 : 1, x: 0 }}
                transition={withFade(SPRING.smooth, staggerDelay(i))}
                className="relative flex gap-3.5 pb-4 last:pb-0"
              >
                <div className="flex w-11 shrink-0 flex-col items-end pt-0.5">
                  {e.allDay ? (
                    <span className="text-[11px] font-medium text-faint">{t("w.allDay")}</span>
                  ) : (
                    <>
                      <span className="num text-[13px] font-medium">{minutesToLabel(e.start)}</span>
                      <span className="num text-[11px] text-faint">{minutesToLabel(e.end)}</span>
                    </>
                  )}
                </div>
                <div className="relative flex flex-col items-center">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: e.color,
                      boxShadow: current ? `0 0 10px ${e.color}` : undefined,
                    }}
                  />
                  {i < Math.min(list.length, 7) - 1 && <span className="mt-1 w-px flex-1 bg-white/[0.08]" />}
                </div>
                <div className="min-w-0 pb-1">
                  <p className={`truncate text-sm ${current ? "font-semibold" : "font-medium"}`}>
                    {e.title}
                    {current && (
                      <span className="ml-2 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-accent">
                        {t("w.now")}
                      </span>
                    )}
                  </p>
                  {e.location && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-faint">
                      <MapPin size={11} /> {e.location}
                    </p>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
