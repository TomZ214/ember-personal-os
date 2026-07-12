"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { eventOccursOn, useCalendarSource } from "@/hooks/useIntegrations";
import { minutesToLabel, todayKey } from "@/lib/dates";
import { EmptyState } from "@/components/ui/misc";

export function AgendaWidget() {
  const cal = useCalendarSource();
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
          Today’s agenda
          {cal.connected && <span className="ml-2 text-[11px] text-faint">· Google synced</span>}
        </p>
        <Link href="/calendar" className="flex items-center gap-1 text-xs text-faint transition-colors hover:text-accent">
          Calendar <ArrowUpRight size={13} />
        </Link>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={20} />}
          title="A clear day"
          hint="No events today. Protect the calm — or press ⌘K and type one."
        />
      ) : (
        <ol className="relative flex flex-col">
          {list.slice(0, 7).map((e, i) => {
            const past = !e.allDay && nowMin >= 0 && e.end < nowMin;
            const current = !e.allDay && nowMin >= 0 && e.start <= nowMin && nowMin <= e.end;
            return (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 300, damping: 26 }}
                className={`relative flex gap-3.5 pb-4 last:pb-0 ${past ? "opacity-45" : ""}`}
              >
                <div className="flex w-11 shrink-0 flex-col items-end pt-0.5">
                  {e.allDay ? (
                    <span className="text-[11px] font-medium text-faint">all day</span>
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
                        now
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
