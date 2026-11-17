"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { PetSceneProps } from "./PetScene";

/**
 * The 3D room, loaded only in the browser and only when it is wanted.
 *
 * three.js and the scene are a separate chunk (next/dynamic, ssr: false),
 * fetched once the room is near the screen and the browser has a quiet
 * moment — so neither start-up nor the dashboard's first paint waits for
 * it. Without WebGL, or if the scene fails, a still drawing stands in.
 */

const Scene = dynamic(() => import("./PetScene"), { ssr: false, loading: () => <Placeholder /> });

function webgl(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function LazyPetScene({ eager = false, ...props }: PetSceneProps & { eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"waiting" | "ready" | "nogl">("waiting");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let idle = 0;
    let timer = 0;
    const go = () => setState(webgl() ? "ready" : "nogl");
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (eager) go();
        else if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(go, { timeout: 1500 });
        else timer = window.setTimeout(go, 300);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (idle) window.cancelIdleCallback(idle);
      window.clearTimeout(timer);
    };
  }, [eager]);

  return (
    <div ref={ref} className="absolute inset-0">
      {state === "ready" ? (
        <Boundary fallback={<Placeholder still />}>
          <Scene {...props} />
        </Boundary>
      ) : (
        <Placeholder still={state === "nogl"} />
      )}
    </div>
  );
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** a quiet line drawing of a sitting cat while the room loads (or instead of it) */
function Placeholder({ still = false }: { still?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
      <svg
        viewBox="0 0 120 120"
        className={`h-[38%] max-h-40 text-faint ${still ? "" : "animate-pulse"}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M38 52 L34 26 L50 40 Q60 37 70 40 L86 26 L82 52" />
        <path d="M38 52 Q34 70 46 78 Q60 86 74 78 Q86 70 82 52" />
        <path d="M46 78 Q36 92 40 108 L80 108 Q86 92 74 78" />
        <path d="M80 104 Q100 104 98 88" />
        <circle cx="51" cy="58" r="2.6" fill="currentColor" stroke="none" />
        <circle cx="69" cy="58" r="2.6" fill="currentColor" stroke="none" />
        <path d="M57 66 Q60 69 63 66" strokeWidth="2.4" />
      </svg>
    </div>
  );
}
