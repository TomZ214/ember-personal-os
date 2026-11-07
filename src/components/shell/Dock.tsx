"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue,
} from "framer-motion";
import { useT } from "@/lib/i18n";
import { NAV, type NavItem } from "./nav";

/* A finger has no hover, so on touch screens (iPad) the dock drops the
   magnification and uses 44pt targets instead (Apple's minimum). An iPad
   with a trackpad reports pointer "mouse" and gets the full dock. */
const coarseQuery = "(pointer: coarse) and (hover: none)";
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia(coarseQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useTouchOnly = () =>
  useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);

/** macOS-style dock with cursor magnification. Tablet and desktop. */
export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const pathname = usePathname();
  const touch = useTouchOnly();

  return (
    <nav
      aria-label="Main"
      // clears the iPad home indicator instead of sitting on top of it
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-(--z-sticky) hidden justify-center md:flex"
    >
      <motion.div
        // pointer events, mouse only: iOS replays a tap as mousemove, which
        // left an icon magnified (and its label up) after every tap
        onPointerMove={(e) => { if (e.pointerType === "mouse") mouseX.set(e.clientX); }}
        onPointerLeave={() => mouseX.set(Infinity)}
        className={`glass-strong glass-edge relative flex items-end gap-1.5 rounded-2xl px-2.5 pb-2 shadow-[0_18px_60px_-10px_rgba(0,0,0,0.65)] ${touch ? "h-[64px]" : "h-[60px]"}`}
      >
        {NAV.map((item) => (
          <DockIcon key={item.href} item={item} mouseX={mouseX} touch={touch} active={isActive(pathname, item.href)} />
        ))}
      </motion.div>
    </nav>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function DockIcon({ item, mouseX, active, touch }: { item: NavItem; mouseX: MotionValue<number>; active: boolean; touch: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const t = useT();
  const label = t(`nav.${item.key}`);

  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.x + r.width / 2) : Infinity;
  });
  const rest = touch ? 46 : 38;
  const sizeRaw = useTransform(distance, [-110, 0, 110], [rest, touch ? rest : 58, rest]);
  const size = useSpring(sizeRaw, { mass: 0.1, stiffness: 320, damping: 16 });
  const iconScale = useTransform(size, [rest, 58], [1, 1.28]);

  const Icon = item.icon;

  return (
    <div ref={ref} className="relative flex flex-col items-center">
      <AnimatePresence>
        {hovered && (
          <motion.span
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="glass-strong pointer-events-none absolute -top-10 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
      <Link
        href={item.href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={() => setHovered(false)}
        onClick={() => setHovered(false)}
        /* app icons lean toward the cursor as it travels the dock */
        data-magnetic={touch ? undefined : ""}
        className="outline-offset-4"
      >
        <motion.span
          style={{ width: size, height: size }}
          whileTap={{ scale: 0.9 }}
          className={`flex items-center justify-center rounded-[13px] border transition-colors duration-150 ${
            active
              ? "glow-brand border-white/[0.14] bg-white/[0.10] text-ink"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <motion.span style={{ scale: iconScale }} className="flex">
            <Icon size={touch ? 21 : 19} strokeWidth={1.9} />
          </motion.span>
        </motion.span>
      </Link>
      <span
        aria-hidden
        className={`absolute -bottom-1.5 h-1 w-1 rounded-full transition-all duration-200 ${
          active ? "bg-accent shadow-[0_0_6px_var(--accent)]" : "bg-transparent"
        }`}
      />
    </div>
  );
}
