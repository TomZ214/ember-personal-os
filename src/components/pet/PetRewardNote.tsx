"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useEmber } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toast";

const SHOWN_KEY = "ember-pet-note";
/** at most one note this often: a nudge of joy, not a notification stream */
const EVERY_MS = 90 * 60_000;

/**
 * Finishing a task puts a treat in the cat's jar. Now and then — not every
 * time — a quiet note says so, so the link is felt without becoming noise.
 * Never on the cat's own page (the cat shows it there), and never for
 * rewards that arrived from another device.
 */
export function PetRewardNote() {
  const at = useEmber((s) => s.pet.lastRewardAt);
  const name = useEmber((s) => s.pet.name);
  const pathname = usePathname();
  const t = useT();
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const value = at ?? 0;
    // the first value is whatever was stored: nothing new happened
    if (seen.current === null || value <= seen.current) {
      seen.current = Math.max(seen.current ?? 0, value);
      return;
    }
    seen.current = value;
    if (Date.now() - value > 10_000 || pathname === "/pet") return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(SHOWN_KEY) || 0);
    } catch {}
    if (Date.now() - last < EVERY_MS) return;
    try {
      localStorage.setItem(SHOWN_KEY, String(Date.now()));
    } catch {}
    toast(t("pet.earned").replace("{name}", name));
  }, [at, name, pathname, t]);

  return null;
}
