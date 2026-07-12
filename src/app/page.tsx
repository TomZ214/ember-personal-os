"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Mail } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useGmailUnread } from "@/hooks/useIntegrations";
import { greeting, todayKey } from "@/lib/dates";
import { ProgressRing } from "@/components/ui/misc";
import { AgendaWidget } from "@/components/widgets/Agenda";
import { BankGlanceWidget } from "@/components/widgets/BankGlance";
import { FocusTimer } from "@/components/widgets/FocusTimer";
import { GoalsGlanceWidget } from "@/components/widgets/GoalsGlance";
import { HabitsTodayWidget } from "@/components/widgets/HabitsToday";
import { QuickNoteWidget } from "@/components/widgets/QuickNote";
import { TodayTasksWidget } from "@/components/widgets/TodayTasks";
import { WeatherWidget } from "@/components/widgets/Weather";
import { WeekPulseWidget } from "@/components/widgets/WeekPulse";

function useScore() {
  const tasks = useEmber((s) => s.tasks);
  const habits = useEmber((s) => s.habits);
  const focus = useEmber((s) => s.focus);
  const today = todayKey();
  const tasksDone = tasks.filter((t) => t.completedAt?.slice(0, 10) === today).length;
  const habitsDone = habits.filter((h) => h.log[today]).length;
  const sessions = focus.sessionsDate === today ? focus.sessionsToday : 0;
  const score =
    Math.min(36, tasksDone * 12) +
    (habits.length ? Math.round((habitsDone / habits.length) * 34) : 0) +
    Math.min(30, sessions * 10);
  return Math.min(100, score);
}

export default function Dashboard() {
  const hydrated = useHydrated();
  const settings = useEmber((s) => s.settings);
  const mails = useEmber((s) => s.mails);
  const score = useScore();
  const gmail = useGmailUnread();
  const localUnread = mails.filter((m) => m.folder === "inbox" && !m.read).length;
  // real Gmail count when connected, demo mailbox otherwise
  const unread = gmail.connected ? (gmail.unread ?? 0) : localUnread;

  if (!hydrated) return <DashboardSkeleton />;

  return (
    <div>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-faint">{format(new Date(), "EEEE, MMMM d")}</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight sm:text-3xl">
            {greeting(settings.userName)}
          </h1>
          {unread > 0 && (
            <Link
              href="/mail"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
            >
              <Mail size={14} />
              {unread} unread message{unread === 1 ? "" : "s"}{gmail.connected ? " in Gmail" : " waiting"}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3.5">
          <ProgressRing value={score / 100} size={72} stroke={6} color="var(--accent)">
            <span className="num text-lg font-semibold">{score}</span>
          </ProgressRing>
          <div className="leading-snug">
            <p className="text-sm font-medium">Productivity</p>
            <p className="max-w-[18ch] text-xs text-muted">
              {score >= 70 ? "You're on fire today." : score >= 35 ? "Solid momentum — keep going." : "The day is still young."}
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <section aria-label="Today's agenda" className="lg:col-span-5 lg:row-span-2">
          <AgendaWidget />
        </section>
        <section aria-label="Focus timer" className="lg:col-span-3 lg:row-span-2">
          <FocusTimer />
        </section>
        <section aria-label="Weather" className="lg:col-span-4">
          <WeatherWidget />
        </section>
        <section aria-label="Habits" className="lg:col-span-4">
          <HabitsTodayWidget />
        </section>
        <section aria-label="Tasks" className="lg:col-span-5">
          <TodayTasksWidget />
        </section>
        <section aria-label="Activity" className="lg:col-span-7">
          <WeekPulseWidget />
        </section>
        <section aria-label="Goals" className="lg:col-span-7">
          <GoalsGlanceWidget />
        </section>
        <section aria-label="Quick note" className="lg:col-span-5">
          <QuickNoteWidget />
        </section>
        <section aria-label="Bank" className="sm:col-span-2 lg:col-span-12">
          <BankGlanceWidget />
        </section>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-7">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton mt-2 h-8 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <div className="skeleton h-72 lg:col-span-5" style={{ borderRadius: 18 }} />
        <div className="skeleton h-72 lg:col-span-3" style={{ borderRadius: 18 }} />
        <div className="skeleton h-72 lg:col-span-4" style={{ borderRadius: 18 }} />
        <div className="skeleton h-56 lg:col-span-4" style={{ borderRadius: 18 }} />
        <div className="skeleton h-56 lg:col-span-5" style={{ borderRadius: 18 }} />
        <div className="skeleton h-56 lg:col-span-3" style={{ borderRadius: 18 }} />
      </div>
    </div>
  );
}
