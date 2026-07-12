"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue,
} from "framer-motion";
import { NAV, type NavItem } from "./nav";

/** macOS-style dock with cursor magnification. Desktop only. */
export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-4 z-(--z-sticky) hidden justify-center md:flex"
    >
      <motion.div
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        className="glass-strong glass-edge relative flex h-[60px] items-end gap-1.5 rounded-2xl px-2.5 pb-2 shadow-[0_18px_60px_-10px_rgba(0,0,0,0.65)]"
      >
        {NAV.map((item) => (
          <DockIcon key={item.href} item={item} mouseX={mouseX} active={isActive(pathname, item.href)} />
        ))}
      </motion.div>
    </nav>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function DockIcon({ item, mouseX, active }: { item: NavItem; mouseX: MotionValue<number>; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.x + r.width / 2) : Infinity;
  });
  const sizeRaw = useTransform(distance, [-110, 0, 110], [38, 58, 38]);
  const size = useSpring(sizeRaw, { mass: 0.1, stiffness: 320, damping: 16 });
  const iconScale = useTransform(size, [38, 58], [1, 1.28]);

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
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      <Link
        href={item.href}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="outline-offset-4"
      >
        <motion.span
          style={{ width: size, height: size }}
          whileTap={{ scale: 0.9 }}
          className={`flex items-center justify-center rounded-[13px] border transition-colors duration-150 ${
            active
              ? "border-white/[0.14] bg-white/[0.10] text-ink"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <motion.span style={{ scale: iconScale }} className="flex">
            <Icon size={19} strokeWidth={1.9} />
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
