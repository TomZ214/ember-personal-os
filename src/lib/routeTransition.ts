"use client";

/**
 * Route changes as a browser View Transition, driven by Ember rather than
 * React: React only animates its own <ViewTransition> boundaries and cancels
 * the root crossfade, but a boundary is captured in isolation — every glass
 * panel on it lost its frosting mid-animation. A root transition is one
 * viewport-sized snapshot of the whole screen with the glass already right.
 *
 * transitionTo(navigate) snapshots the screen, runs the navigation, and lets
 * the browser crossfade as soon as the new page has mounted (the route
 * template calls routeReady()). Keyframes: "Route transitions" in globals.css.
 */

let pending: (() => void) | null = null;

/** called by the route template once the new page has committed */
export function routeReady() {
  const resolve = pending;
  pending = null;
  resolve?.();
}

/** never hold the old frame longer than this, whatever the network does */
const MAX_WAIT_MS = 1500;

export function transitionTo(navigate: () => void) {
  // an earlier transition still waiting for its page: let it go first
  routeReady();
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function") {
    navigate();
    return;
  }
  const vt = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        pending = resolve;
        navigate();
        setTimeout(() => {
          if (pending === resolve) routeReady();
        }, MAX_WAIT_MS);
      }),
  );
  // a skipped transition (tab hidden, another one started) is not an error
  vt.ready.catch(() => {});
  vt.finished.catch(() => {});
}

/** a same-origin path worth a transition: another page, not a hash or query change */
export function isRouteChange(href: string): boolean {
  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin && url.pathname !== window.location.pathname;
}
