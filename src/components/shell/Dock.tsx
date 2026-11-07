"use client";

import { ViewTransition, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  motion, useAnimate, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue,
} from "framer-motion";
import { useT } from "@/lib/i18n";
import { markTransitionOrigin, recordNavOrigin } from "@/lib/navOrigin";
import { NAV, type NavItem } from "./nav";

/* Touch screens get 46px icons (Apple's 44pt minimum plus a little); a
   mouse or trackpad gets the classic 40px dock. Magnification follows any
   real pointer — including an iPad trackpad — and a finger sliding along the
   dock ("scrubbing"). */
const coarseQuery = "(pointer: coarse) and (hover: none)";
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia(coarseQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useTouchOnly = () =>
  useSyncExternalStore(subscribeCoarse, () => window.matchMedia(coarseQuery).matches, () => false);

/** how far (px) a finger must travel before a press becomes a scrub */
const SCRUB_SLOP = 10;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * macOS-style dock. Hover (or slide a finger along it) and the icons swell in
 * a wave, rise out of the bar and show their names, while a soft light follows
 * the pointer through the glass; opening an app makes its icon bounce.
 *
 * Everything that moves per frame is a motion value — no React re-render per
 * pointer move. Sizes change width/height on purpose (neighbours have to make
 * room, as in macOS), which is layout on a dozen small boxes only.
 */
export function Dock() {
  const mouseX = useMotionValue(Infinity);
  const localX = useMotionValue(-400);
  const glow = useSpring(0, { stiffness: 260, damping: 30 });
  const glowX = useTransform(localX, (v) => v - 80);
  const pathname = usePathname();
  const router = useRouter();
  const touch = useTouchOnly();
  const bar = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ id: number; startX: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [bounce, setBounce] = useState<{ href: string; n: number } | null>(null);

  const follow = (x: number) => {
    mouseX.set(x);
    const r = bar.current?.getBoundingClientRect();
    if (r) localX.set(x - r.left);
    glow.set(1);
  };
  const rest = () => {
    mouseX.set(Infinity);
    glow.set(0);
  };
  const hrefAt = (x: number) => {
    for (const el of bar.current?.querySelectorAll<HTMLElement>("[data-dock-href]") ?? []) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - 3 && x <= r.right + 3) return el.dataset.dockHref ?? null;
    }
    return null;
  };
  const launch = (href: string) => setBounce((b) => ({ href, n: (b?.n ?? 0) + 1 }));

  return (
    <nav
      aria-label="Main"
      // clears the iPad home indicator instead of sitting on top of it
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-(--z-sticky) hidden justify-center md:flex"
    >
      {/* its own layer during a route View Transition: pages pass beneath */}
      <ViewTransition name="shell-dock">
        <motion.div
          ref={bar}
          // a finger may slide along the dock without the page panning away
          style={{ touchAction: "none" }}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse") return follow(e.clientX);
            const s = scrub.current;
            if (!s || s.id !== e.pointerId) return;
            if (Math.abs(e.clientX - s.startX) > SCRUB_SLOP) s.moved = true;
            if (s.moved) follow(e.clientX);
          }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") rest(); }}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            scrub.current = { id: e.pointerId, startX: e.clientX, moved: false };
          }}
          onPointerUp={(e) => {
            const s = scrub.current;
            if (!s || s.id !== e.pointerId) return;
            scrub.current = null;
            rest();
            if (!s.moved) return; // a plain tap: the link handles it
            // a scrub opens whatever is under the finger, not where it started
            swallowClick.current = true;
            setTimeout(() => { swallowClick.current = false; }, 500);
            const href = hrefAt(e.clientX);
            if (!href || isActive(pathname, href)) return;
            recordNavOrigin(e.clientX, e.clientY);
            markTransitionOrigin(e.clientX, e.clientY);
            launch(href);
            router.push(href);
          }}
          onPointerCancel={() => { scrub.current = null; rest(); }}
          // the browser still fires a click on the link the scrub started on
          onClickCapture={(e) => {
            if (!swallowClick.current) return;
            swallowClick.current = false;
            e.preventDefault();
          }}
          className={`glass-strong glass-edge relative flex select-none items-end gap-1.5 rounded-2xl px-2.5 pb-2 shadow-[0_18px_60px_-10px_rgba(0,0,0,0.65)] ${touch ? "h-[64px]" : "h-[60px]"}`}
        >
          {/* the light that follows the pointer through the glass */}
          <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <motion.span
              className="absolute -top-10 h-40 w-40 rounded-full"
              style={{
                x: glowX,
                opacity: glow,
                background: "radial-gradient(circle closest-side, color-mix(in oklch, var(--primary-bright) 28%, transparent), transparent)",
              }}
            />
          </span>
          {NAV.map((item) => (
            <DockIcon
              key={item.href}
              item={item}
              mouseX={mouseX}
              touch={touch}
              active={isActive(pathname, item.href)}
              bounce={bounce?.href === item.href ? bounce.n : 0}
              onLaunch={() => launch(item.href)}
            />
          ))}
        </motion.div>
      </ViewTransition>
    </nav>
  );
}

function DockIcon({
  item, mouseX, active, touch, bounce, onLaunch,
}: {
  item: NavItem;
  mouseX: MotionValue<number>;
  active: boolean;
  touch: boolean;
  bounce: number;
  onLaunch: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const t = useT();
  const label = t(`nav.${item.key}`);

  const base = touch ? 46 : 40;
  const peak = Math.round(base * 1.75);
  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r && Number.isFinite(x) ? x - (r.x + r.width / 2) : Infinity;
  });
  // A wide, soft wave: the icon under the pointer swells most, its neighbours
  // follow, and everything beyond 160px stays at rest. Ranges are memoised and
  // nothing below is React state: a re-render mid-hover used to reset the
  // hovered icon to its resting size until the pointer moved again.
  const wave = useMemo(
    () => ({ input: [-160, -80, 0, 80, 160], output: [base, base * 1.22, peak, base * 1.22, base] }),
    [base, peak],
  );
  const sizeRaw = useTransform(distance, wave.input, wave.output);
  const size = useSpring(sizeRaw, { mass: 0.12, stiffness: 340, damping: 18 });
  const lift = useTransform(size, [base, peak], [0, -12]);
  const iconScale = useTransform(size, [base, peak], [1, 1.45]);

  // the name and a soft highlight show for the icon under the pointer (mouse
  // or scrubbing finger) — motion values too, so hovering never re-renders
  const nearRaw = useTransform(distance, (d): number => (Math.abs(d) < base * 0.7 ? 1 : 0));
  const near = useSpring(nearRaw, { stiffness: 520, damping: 34 });
  const labelY = useTransform(near, [0, 1], [8, 0]);
  const labelScale = useTransform(near, [0, 1], [0.85, 1]);

  // the macOS launch bounce
  useEffect(() => {
    if (!bounce || reduced || !scope.current) return;
    void animate(scope.current, { y: [0, -22, 0, -9, 0] }, { duration: 0.7, ease: "easeOut", times: [0, 0.3, 0.55, 0.75, 1] });
  }, [bounce, reduced, animate, scope]);

  const Icon = item.icon;

  return (
    <div ref={ref} className="relative flex flex-col items-center" data-dock-href={item.href}>
      <motion.span
        aria-hidden
        style={{ bottom: size, opacity: near, y: labelY, scale: labelScale }}
        className="glass-strong pointer-events-none absolute z-10 mb-5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
      >
        {label}
      </motion.span>
      <motion.div style={{ y: lift }}>
        <div ref={scope}>
          <Link
            href={item.href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => { if (!active) onLaunch(); }}
            draggable={false}
            className="block outline-offset-4"
          >
            <motion.span
              style={{ width: size, height: size }}
              whileTap={{ scale: 0.9 }}
              className={`relative flex items-center justify-center rounded-[13px] border transition-colors duration-150 ${
                active ? "glow-brand border-white/[0.14] bg-white/[0.10] text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {!active && (
                <motion.span
                  aria-hidden
                  style={{ opacity: near }}
                  className="pointer-events-none absolute -inset-px rounded-[13px] border border-white/[0.10] bg-white/[0.06]"
                />
              )}
              <motion.span style={{ scale: iconScale }} className="relative flex">
                <Icon size={touch ? 21 : 19} strokeWidth={1.9} />
              </motion.span>
            </motion.span>
          </Link>
        </div>
      </motion.div>
      <span
        aria-hidden
        className={`absolute -bottom-1.5 h-1 w-1 rounded-full transition-all duration-200 ${
          active ? "bg-accent shadow-[0_0_6px_var(--accent)]" : "bg-transparent"
        }`}
      />
    </div>
  );
}
