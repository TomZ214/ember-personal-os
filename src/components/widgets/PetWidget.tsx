"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowUpRight, Cookie } from "lucide-react";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";
import { LazyPetScene } from "@/components/pet/LazyPetScene";
import { PetStats, useLivePet, useMoodLine } from "@/components/pet/PetUI";
import type { PetControls } from "@/components/pet/PetScene";

/**
 * The cat on the dashboard: a small window into its room, how it is, and a
 * treat to give. The 3D view loads after the rest of the dashboard, when the
 * widget scrolls into view.
 */
export function PetWidget() {
  const pet = useLivePet();
  const petAct = useEmber((s) => s.petAct);
  const t = useT();
  const line = useMoodLine(pet);
  const controls = useRef<PetControls | null>(null);

  const treat = () => {
    // the room may not have loaded yet: the treat still counts
    if (controls.current) controls.current.treat();
    else petAct({ kind: "treat" });
  };

  return (
    // laid out by its own width: side by side when wide, stacked in a narrow column
    <div className="panel @container flex h-full flex-col p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{pet.name}</p>
        <Link
          href="/pet"
          className="-mx-1 -my-2 flex items-center gap-1 px-1 py-2 text-xs text-faint transition-colors hover:text-accent"
        >
          {t("w.petOpen")} <ArrowUpRight size={13} />
        </Link>
      </div>

      <div className="grid flex-1 grid-cols-1 items-center gap-x-5 gap-y-3 @lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="relative -mx-2 h-48 @lg:h-full @lg:min-h-48">
          <LazyPetScene
            mode="widget"
            onReady={(c) => {
              controls.current = c;
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="text-[13px] leading-snug text-ink">{line}</p>
          <PetStats pet={pet} compact />
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[12px] text-muted">
              <span className="num text-ink">{pet.treats}</span> {t(pet.treats === 1 ? "pet.treatOne" : "pet.treatMany")}
            </span>
            <Button size="sm" onClick={treat} disabled={pet.treats <= 0}>
              <Cookie size={14} aria-hidden /> {t("pet.give")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
