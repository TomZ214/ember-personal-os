"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Flame, Search } from "lucide-react";
import { useEmber } from "@/lib/store";
import { Kbd } from "@/components/ui/misc";

function subscribeClock(cb: () => void) {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
}
const clockSnapshot = () => format(new Date(), "HH:mm|EEE, MMM d");
const clockServerSnapshot = () => "";

export function TopBar() {
  const setPaletteOpen = useEmber((s) => s.setPaletteOpen);
  const clock = useSyncExternalStore(subscribeClock, clockSnapshot, clockServerSnapshot);
  const [time, date] = clock ? clock.split("|") : ["--:--", ""];

  return (
    // pt-safe: in the iOS home-screen app the page runs under the status bar
    <header className="sticky top-0 z-(--z-sticky) border-b border-white/[0.06] bg-bg-deep/70 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-primary/15 text-primary-bright shadow-[0_0_18px_-2px_var(--primary-glow)]">
            <Flame size={15} strokeWidth={2.2} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Ember</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 items-center gap-2.5 rounded-[11px] border border-white/[0.08] bg-white/[0.05] px-3 text-sm text-muted transition-colors hover:border-white/[0.14] hover:text-ink"
          >
            <Search size={15} />
            <span className="hidden sm:inline">Search anything…</span>
            <span className="hidden items-center gap-1 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <div className="num hidden text-right leading-tight sm:block" suppressHydrationWarning>
            <p className="text-sm font-medium">{time}</p>
            <p className="text-[11px] text-faint">{date}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
