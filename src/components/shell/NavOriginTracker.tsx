"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markNavDirection } from "@/lib/navOrigin";
import { isRouteChange, transitionTo } from "@/lib/routeTransition";

/**
 * Turns internal link clicks into route View Transitions and notes the
 * direction of each navigation for the transition CSS: a link is forward,
 * browser back/forward is back.
 *
 * Capture phase on the document, so it runs before Next's <Link> handler:
 * it prevents the default, which <Link> respects, and navigates inside the
 * transition instead. It never stops propagation — other onClick handlers on
 * the link (closing a sheet, the dock's bounce) still run.
 */
export function NavOriginTracker() {
  const router = useRouter();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      // the dock swallows the click that follows a scrub; it navigates itself
      if (anchor.closest("[data-swallow-click]")) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href.startsWith("/") || !isRouteChange(href)) return;
      e.preventDefault();
      markNavDirection("forward");
      transitionTo(() => router.push(href));
    };
    const onPop = () => markNavDirection("back");

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, [router]);

  return null;
}
