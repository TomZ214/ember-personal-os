"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, CheckSquare, LayoutGrid, NotebookPen, Grip } from "lucide-react";
import { useT } from "@/lib/i18n";
import { NAV } from "./nav";

const PRIMARY = [
  { href: "/", key: "home", icon: LayoutGrid },
  { href: "/tasks", key: "tasks", icon: CheckSquare },
  { href: "/calendar", key: "calendar", icon: CalendarDays },
  { href: "/notes", key: "notes", icon: NotebookPen },
];

/** iOS-style bottom tab bar + "Apps" sheet for the rest. Mobile only. */
export function MobileTabs() {
  const pathname = usePathname();
  const [appsOpen, setAppsOpen] = useState(false);
  const t = useT();
  const inPrimary = PRIMARY.some((p) => (p.href === "/" ? pathname === "/" : pathname.startsWith(p.href)));

  return (
    <>
      <nav
        aria-label="Main"
        // The bar FLOATS (inset-x-3 / bottom), so the home indicator has to be
        // cleared by offsetting the bar — not by padding its inside. Padding it
        // left a tall dead strip inside the pill on iPhone and pushed the icons
        // up. `max()` keeps the 12px gap on devices without an inset.
        className="glass-strong glass-edge tabs-float fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-(--z-sticky) flex items-stretch justify-around rounded-3xl md:hidden"
      >
        {PRIMARY.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="relative flex min-w-16 flex-1 flex-col items-center gap-1 py-2.5"
            >
              {active && (
                <motion.span
                  layoutId="tab-glow"
                  className="absolute inset-x-3 top-1 h-9 rounded-2xl bg-white/[0.08]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icon
                size={21}
                strokeWidth={active ? 2.2 : 1.8}
                className={`relative transition-colors ${active ? "text-accent" : "text-muted"}`}
              />
              <span className={`relative text-[10px] font-medium ${active ? "text-ink" : "text-faint"}`}>
                {t(`nav.${item.key}`)}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setAppsOpen(true)}
          className="relative flex min-w-16 flex-1 flex-col items-center gap-1 py-2.5"
          aria-label={t("nav.allApps")}
        >
          {!inPrimary && (
            <motion.span
              layoutId="tab-glow"
              className="absolute inset-x-3 top-1 h-9 rounded-2xl bg-white/[0.08]"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <Grip size={21} strokeWidth={1.8} className={`relative ${inPrimary ? "text-muted" : "text-accent"}`} />
          <span className={`relative text-[10px] font-medium ${inPrimary ? "text-faint" : "text-ink"}`}>{t("nav.apps")}</span>
        </button>
      </nav>

      <AnimatePresence>
        {appsOpen && (
          // keyed motion child so AnimatePresence can track presence properly
          <motion.div key="apps-sheet-root" className="fixed inset-0 z-(--z-modal) md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAppsOpen(false)}
              className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 500) setAppsOpen(false);
              }}
              className="glass-strong glass-edge absolute inset-x-0 bottom-0 rounded-t-[28px] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
              <p className="mb-4 text-sm font-medium text-muted">{t("nav.allApps")}</p>
              <div className="grid grid-cols-4 gap-2">
                {NAV.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.03 * i, type: "spring", stiffness: 400, damping: 28 }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setAppsOpen(false)}
                        className="flex flex-col items-center gap-2 rounded-2xl py-3 active:bg-white/[0.07]"
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-[15px] border border-white/[0.10] bg-white/[0.06]">
                          <Icon size={21} strokeWidth={1.8} />
                        </span>
                        <span className="text-[11px] text-muted">{t(`nav.${item.key}`)}</span>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
