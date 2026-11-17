"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Mail } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useGmailUnread } from "@/hooks/useIntegrations";
import { greetingFor, useLang, useT } from "@/lib/i18n";
import { todayKey, dfLocale } from "@/lib/dates";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ProgressRing } from "@/components/ui/misc";
import { AgendaWidget } from "@/components/widgets/Agenda";
import { AlarmsWidget } from "@/components/widgets/AlarmsWidget";
import { BankGlanceWidget } from "@/components/widgets/BankGlance";
import { BriefingWidget } from "@/components/widgets/Briefing";
import { FocusTimer } from "@/components/widgets/FocusTimer";
import { GoalsGlanceWidget } from "@/components/widgets/GoalsGlance";
import { HabitsTodayWidget } from "@/components/widgets/HabitsToday";
import { PetWidget } from "@/components/widgets/PetWidget";
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
  // the parts travel with the number: a score nobody can read is decoration
  return { score: Math.min(100, score), tasksDone, habitsDone, habits: habits.length, sessions };
}

export default function Dashboard() {
  const hydrated = useHydrated();
  const settings = useEmber((s) => s.settings);
  const mails = useEmber((s) => s.mails);
  const { score, tasksDone, habitsDone, habits, sessions } = useScore();
  const gmail = useGmailUnread();
  const lang = useLang();
  const t = useT();
  const localUnread = mails.filter((m) => m.folder === "inbox" && !m.read).length;
  // real Gmail count when connected, demo mailbox otherwise
  const unread = gmail.connected ? (gmail.unread ?? 0) : localUnread;

  if (!hydrated) return <DashboardSkeleton />;

  return (
    <div>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-faint">{format(new Date(), lang === "de" ? "EEEE, d. MMMM" : "EEEE, MMMM d", { locale: dfLocale(lang) })}</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight sm:text-3xl">
            {greetingFor(lang, settings.userName)}
          </h1>
          {unread > 0 && (
            <Link
              href="/mail"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
            >
              <Mail size={14} />
              {unread} {unread === 1 ? t("dash.unreadOne") : t("dash.unreadMany")}{gmail.connected ? ` ${t("dash.inGmail")}` : ` ${t("dash.waiting")}`}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-3.5">
          <ProgressRing value={score / 100} size={72} stroke={6} color="var(--accent)">
            {/* counts up with the ring, on the same spring */}
            <AnimatedNumber value={score} from={0} spring="fill" className="num text-lg font-semibold" />
          </ProgressRing>
          <div className="leading-snug">
            <p className="text-sm font-medium">{t("dash.productivity")}</p>
            {/* what the number is made of, instead of a line of encouragement */}
            <p className="num mt-0.5 text-xs text-muted">
              {tasksDone} {t("dash.scoreTasks")} · {habits ? `${habitsDone}/${habits}` : 0} {t("dash.scoreHabits")} · {sessions} {t("dash.scoreFocus")}
            </p>
          </div>
        </div>
      </header>

      {/* .stagger: on a route change the widgets settle in one after another
          (globals.css, "Route transitions"). Transform only — a fading
          wrapper would strip the frosting off every pane inside it. */}
      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        {/* empty:hidden: the briefing renders nothing until it is set up, and
            an empty grid cell would still cost a row gap */}
        <section aria-label={t("brief.title")} className="empty:hidden sm:col-span-2 lg:col-span-12">
          <BriefingWidget />
        </section>
        <section aria-label={t("w.agenda")} className="lg:col-span-5 lg:row-span-2">
          <AgendaWidget />
        </section>
        <section aria-label={t("w.focus")} className="lg:col-span-3 lg:row-span-2">
          <FocusTimer />
        </section>
        <section aria-label={t("nav.weather")} className="lg:col-span-4">
          <WeatherWidget />
        </section>
        <section aria-label={t("w.habits")} className="lg:col-span-4">
          <HabitsTodayWidget />
        </section>
        <section aria-label={t("w.tasks")} className="lg:col-span-5">
          <TodayTasksWidget />
        </section>
        <section aria-label={t("w.twoWeekPulse")} className="lg:col-span-7">
          <WeekPulseWidget />
        </section>
        <section aria-label={t("w.goals")} className="lg:col-span-7">
          <GoalsGlanceWidget />
        </section>
        <section aria-label={t("alarm.title")} className="lg:col-span-5">
          <AlarmsWidget />
        </section>
        <section aria-label={t("w.quickNote")} className="lg:col-span-5">
          <QuickNoteWidget />
        </section>
        <section aria-label={t("nav.pet")} className="lg:col-span-7">
          <PetWidget />
        </section>
        <section aria-label={t("nav.finance")} className="sm:col-span-2 lg:col-span-12">
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
