"use client";

/**
 * The direction of the navigation that is about to happen, for the route
 * transition CSS (globals.css, "Route transitions"): forward content settles
 * up into place, back content settles down. Kept on <html> as data-nav and
 * cleared by the template once the transition has played.
 */
export function markNavDirection(direction: "forward" | "back") {
  document.documentElement.dataset.nav = direction;
}
