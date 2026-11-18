"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cookie, Megaphone, MousePointer2, UtensilsCrossed, Volleyball } from "lucide-react";
import { useEmber, useHydrated } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { dayKey, todayKey } from "@/lib/dates";
import { swap } from "@/lib/motion";
import { MAX_TREATS } from "@/lib/pet";
import { PageHeader } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { LazyPetScene } from "@/components/pet/LazyPetScene";
import { PetLooks, PetSoundSwitch, PetStats, useLivePet, useMoodLine } from "@/components/pet/PetUI";
import type { PetControls } from "@/components/pet/PetScene";
import type { CatStatus } from "@/components/pet/brain";

export default function PetPage() {
  const hydrated = useHydrated();
  if (!hydrated) return <div className="skeleton h-[70vh]" style={{ borderRadius: 18 }} />;
  return <PetRoom />;
}

function PetRoom() {
  const pet = useLivePet();
  const t = useT();
  const line = useMoodLine(pet);
  const controls = useRef<PetControls | null>(null);
  const [status, setStatus] = useState<CatStatus>("relaxing");
  const [laser, setLaser] = useState(false);
  // completedAt is an ISO time in UTC: compare by the local calendar day
  const doneToday = useEmber((s) => s.tasks.filter((x) => x.completedAt && dayKey(new Date(x.completedAt)) === todayKey()).length);
  const petAct = useEmber((s) => s.petAct);
  const name = pet.name;

  const say = (key: string) => t(key).replace("{name}", name);

  // without the 3D room (no WebGL, still loading) the cat is fed all the same
  const feed = () => {
    if (!controls.current) return petAct({ kind: "feed" });
    if (!controls.current.feed()) toast(say("pet.bowlFull"), "info");
  };
  const treat = () => {
    if (pet.treats <= 0) return toast(say("pet.noTreats"), "info");
    if (controls.current) controls.current.treat();
    else petAct({ kind: "treat" });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={name} sub={line} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-label={t("pet.room")}
          className="panel relative overflow-hidden p-0"
          style={{ height: "clamp(340px, min(64vh, 66vw), 640px)" }}
        >
          <LazyPetScene
            mode="stage"
            eager
            laser={laser}
            onReady={(c) => {
              controls.current = c;
            }}
            onStatus={setStatus}
          />

          {/* what the cat is doing, quietly, in the corner */}
          <div className="pointer-events-none absolute left-4 top-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={status}
                {...swap}
                className="glass-strong inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-ink"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
                {say(`pet.status.${status}`)}
              </motion.span>
            </AnimatePresence>
          </div>
          {laser && (
            <p className="pointer-events-none absolute right-4 top-4 max-w-[22ch] text-right text-[12px] text-muted">
              {say("pet.laserHint")}
            </p>
          )}

          {/* things to do with the cat */}
          <div className="absolute inset-x-0 bottom-0 flex justify-center p-3">
            <div className="glass-strong glass-edge relative flex max-w-full gap-1.5 overflow-x-auto rounded-2xl p-1.5 shadow-[0_14px_40px_-14px_rgba(0,0,0,0.55)] [scrollbar-width:none]">
              <Action icon={UtensilsCrossed} label={t("pet.feed")} onClick={feed} />
              <Action
                icon={Cookie}
                label={t("pet.treat")}
                badge={pet.treats}
                onClick={treat}
                disabled={pet.treats <= 0}
              />
              <Action icon={Volleyball} label={t("pet.ball")} onClick={() => controls.current?.ball()} />
              <Action
                icon={MousePointer2}
                label={t("pet.laser")}
                pressed={laser}
                onClick={() => setLaser((v) => !v)}
              />
              <Action icon={Megaphone} label={t("pet.call")} onClick={() => controls.current?.call()} />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="panel p-5">
            <h2 className="mb-3 text-[15px] font-semibold">{say("pet.howIs")}</h2>
            <PetStats pet={pet} />
            <p className="mt-4 text-[12px] leading-relaxed text-muted">{say("pet.strokeHint")}</p>
          </section>

          <section className="panel p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold">{t("pet.jar")}</h2>
              <span className="num text-[13px] text-muted">
                {pet.treats}/{MAX_TREATS}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{say("pet.jarSub")}</p>
            {doneToday > 0 && (
              <p className="mt-2 text-[12px] text-ink">
                {say(doneToday === 1 ? "pet.todayOne" : "pet.todayMany").replace("{n}", String(doneToday))}
              </p>
            )}
          </section>

          <PetLooks />
          <PetSoundSwitch />
        </aside>
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<CatStatus, string> = {
  relaxing: "var(--c-sage)",
  exploring: "var(--c-sky)",
  sleeping: "var(--c-lilac)",
  eating: "var(--c-amber)",
  playing: "var(--c-ember)",
  purring: "var(--c-rose)",
  grooming: "var(--c-sky)",
  hungry: "var(--c-amber)",
  greeting: "var(--c-rose)",
};

function Action({
  icon: Icon, label, onClick, badge, pressed, disabled,
}: {
  icon: typeof Cookie;
  label: string;
  onClick: () => void;
  badge?: number;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-disabled={disabled}
      className={`relative flex min-w-[64px] shrink-0 flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-medium [--press-scale:0.94] ${
        pressed ? "bg-accent/90 text-bg-deep" : "text-ink hover:bg-white/[0.08]"
      } ${disabled ? "opacity-45" : ""}`}
    >
      <Icon size={18} aria-hidden />
      <span className="whitespace-nowrap">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="num absolute right-1 top-1 min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 text-bg-deep">{badge}</span>
      )}
    </button>
  );
}
