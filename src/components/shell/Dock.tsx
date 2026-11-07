"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  motion, useAnimate, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue,
} from "framer-motion";
import { useT } from "@/lib/i18n";
import { markNavDirection } from "@/lib/navOrigin";
import { transitionTo } from "@/lib/routeTransition";
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
/** reach of the wave either side of the pointer */
const RADIUS = 150;
/** the icon right under the pointer grows by this much */
const GROWTH = 0.6;

const falloff = (d: number) => (d >= RADIUS ? 0 : 0.5 * (1 + Math.cos((Math.PI * d) / RADIUS)));

/**
 * The wave for icon `i`: its scale, and how far it shifts so the row spreads
 * around the pointer the way macOS does. Pure arithmetic over the resting
 * slot centres — nothing is measured per frame.
 */
function waveAt(i: number, x: number, k: number, centres: number[], base: number) {
  let before = 0, total = 0, mine = 0;
  if (k > 0) {
    for (let j = 0; j < centres.length; j++) {
      const grow = base * GROWTH * k * falloff(Math.abs(x - centres[j]));
      total += grow;
      if (j < i) before += grow;
      else if (j === i) mine = grow;
    }
  }
  return { scale: 1 + mine / base, shift: before + mine / 2 - total / 2, total, near: k * (Math.abs(x - (centres[i] ?? -1e9)) < base * 0.55 ? 1 : 0) };
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

interface Wave {
  pointer: MotionValue<number>;
  strength: MotionValue<number>;
  centres: React.RefObject<number[]>;
}

/**
 * macOS-style dock. Hover (or slide a finger along it) and the icons swell in
 * a wave and show their names; opening an app makes its icon bounce.
 *
 * Built for the compositor: the icons only ever change transform — they are
 * drawn at full magnified size and scaled down at rest, so they stay crisp
 * when they grow — and the glass bar keeps its layout, stretching by a
 * transform. The earlier version resized boxes every frame, which re-laid
 * out the row and made the frosted bar re-blur on every frame.
 */
export function Dock() {
  const touch = useTouchOnly();
  const base = touch ? 46 : 40;
  const pointer = useMotionValue(0);
  const strengthTarget = useMotionValue(0);
  // the wave rises and falls softly; the pointer itself is followed instantly
  const strength = useSpring(strengthTarget, { stiffness: 420, damping: 40 });
  const centres = useRef<number[]>([]);
  const barWidth = useRef(1);
  const pathname = usePathname();
  const router = useRouter();
  const bar = useRef<HTMLDivElement>(null);
  const scrub = useRef<{ id: number; startX: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const bouncers = useRef(new Map<string, () => void>());

  const measure = () => {
    const el = bar.current;
    if (!el) return;
    barWidth.current = el.getBoundingClientRect().width || 1;
    centres.current = [...el.querySelectorAll<HTMLElement>("[data-dock-slot]")].map((s) => {
      const r = s.getBoundingClientRect();
      return r.left + r.width / 2;
    });
  };
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [touch]);

  const follow = (x: number) => {
    if (!centres.current.length) measure();
    pointer.set(x);
    strengthTarget.set(1);
  };
  const rest = () => strengthTarget.set(0);
  const hrefAt = (x: number) => {
    for (const el of bar.current?.querySelectorAll<HTMLElement>("[data-dock-href]") ?? []) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - 3 && x <= r.right + 3) return el.dataset.dockHref ?? null;
    }
    return null;
  };

  // the bar stretches with the wave so the outermost icons stay on the glass
  const barScale = useTransform([pointer, strength], ([x, k]: number[]) => {
    const total = waveAt(0, x, k, centres.current, base).total;
    return (barWidth.current + total) / barWidth.current;
  });

  const wave: Wave = { pointer, strength, centres };

  return (
    <nav
      aria-label="Main"
      // clears the iPad home indicator instead of sitting on top of it
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-(--z-sticky) hidden justify-center md:flex"
    >
      <div
        ref={bar}
        // a finger may slide along the dock without the page panning away
        style={{ touchAction: "none" }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") measure(); }}
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
          measure();
          scrub.current = { id: e.pointerId, startX: e.clientX, moved: false };
        }}
        onPointerUp={(e) => {
          const s = scrub.current;
          if (!s || s.id !== e.pointerId) return;
          scrub.current = null;
          rest();
          if (!s.moved) return; // a plain tap: the link handles it
          // a scrub opens whatever is under the finger, not where it started;
          // the click the browser still fires on the first link is swallowed
          // (data-swallow-click also keeps the route-transition handler off it)
          swallowClick.current = true;
          bar.current?.setAttribute("data-swallow-click", "");
          setTimeout(() => {
            swallowClick.current = false;
            bar.current?.removeAttribute("data-swallow-click");
          }, 500);
          const href = hrefAt(e.clientX);
          if (!href || isActive(pathname, href)) return;
          markNavDirection("forward");
          bouncers.current.get(href)?.();
          transitionTo(() => router.push(href));
        }}
        onPointerCancel={() => { scrub.current = null; rest(); }}
        // the browser still fires a click on the link the scrub started on
        onClickCapture={(e) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          e.preventDefault();
        }}
        className={`relative flex select-none items-end gap-1.5 px-2.5 pb-2 ${touch ? "h-[64px]" : "h-[60px]"}`}
      >
        <motion.span
          aria-hidden
          style={{ scaleX: barScale }}
          className="glass-strong glass-edge pointer-events-none absolute inset-0 rounded-2xl shadow-[0_18px_60px_-10px_rgba(0,0,0,0.65)]"
        />
        {NAV.map((item, i) => (
          <DockIcon
            key={item.href}
            index={i}
            item={item}
            wave={wave}
            base={base}
            active={isActive(pathname, item.href)}
            register={(fn) => {
              if (fn) bouncers.current.set(item.href, fn);
              else bouncers.current.delete(item.href);
            }}
          />
        ))}
      </div>
    </nav>
  );
}

function DockIcon({
  index, item, wave, base, active, register,
}: {
  index: number;
  item: NavItem;
  wave: Wave;
  base: number;
  active: boolean;
  register: (bounce: (() => void) | null) => void;
}) {
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const t = useT();
  const label = t(`nav.${item.key}`);
  const peak = Math.round(base * (1 + GROWTH));

  const geometry = useTransform([wave.pointer, wave.strength], ([x, k]: number[]) =>
    waveAt(index, x, k, wave.centres.current, base),
  );
  const shift = useTransform(geometry, (g) => g.shift);
  // drawn at peak size, scaled down to `base` at rest
  const scale = useTransform(geometry, (g) => (g.scale * base) / peak);
  const labelY = useTransform(geometry, (g) => -(base * g.scale) - 12);
  const near = useSpring(useTransform(geometry, (g) => g.near), { stiffness: 520, damping: 36 });

  // the macOS launch bounce — on a click here, and offered to the dock for
  // launches by scrubbing
  const bounce = useCallback(() => {
    if (reduced || !scope.current) return;
    void animate(scope.current, { y: [0, -18, 0, -6, 0] }, { duration: 0.62, ease: "easeOut", times: [0, 0.32, 0.58, 0.78, 1] });
  }, [reduced, animate, scope]);
  useEffect(() => {
    register(bounce);
    return () => register(null);
    // register is a fresh closure each render but always does the same thing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounce]);

  const Icon = item.icon;
  const radius = Math.round((13 * peak) / base);

  return (
    <div data-dock-slot className="relative shrink-0" style={{ width: base, height: base }}>
      <motion.div className="absolute bottom-0 left-1/2" style={{ x: shift }}>
        <motion.span
          aria-hidden
          style={{ y: labelY, opacity: near }}
          className="glass-strong pointer-events-none absolute bottom-0 left-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
        >
          {label}
        </motion.span>
        <div ref={scope} className="absolute bottom-0 left-0">
          <motion.div
            className="absolute bottom-0"
            style={{ width: peak, height: peak, left: -peak / 2, scale, transformOrigin: "50% 100%" }}
          >
            <Link
              href={item.href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              data-dock-href={item.href}
              draggable={false}
              onClick={() => { if (!active) bounce(); }}
              className={`relative flex h-full w-full items-center justify-center border outline-offset-4 transition-colors duration-150 ${
                active ? "glow-brand border-white/[0.14] bg-white/[0.10] text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
              style={{ borderRadius: radius }}
            >
              {!active && (
                <motion.span
                  aria-hidden
                  style={{ opacity: near, borderRadius: radius }}
                  className="pointer-events-none absolute -inset-px border border-white/[0.10] bg-white/[0.06]"
                />
              )}
              <Icon size={Math.round((19 * peak) / base)} strokeWidth={1.9} className="relative" />
            </Link>
          </motion.div>
        </div>
        <span
          aria-hidden
          className={`absolute -bottom-1.5 left-0 h-1 w-1 -translate-x-1/2 rounded-full transition-colors duration-200 ${
            active ? "bg-accent shadow-[0_0_6px_var(--accent)]" : "bg-transparent"
          }`}
        />
      </motion.div>
    </div>
  );

}
