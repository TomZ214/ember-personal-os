/**
 * The arithmetic of the virtual light (LightingProvider). Pure functions, so
 * the falloff and the follow behaviour can be tested without a DOM.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** distance in px from a point to a box; 0 anywhere inside it */
export function distanceToBox(x: number, y: number, box: Box): number {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy);
}

/**
 * How strongly a pane is lit, 0..1: full under the pointer, then easing out
 * (quadratic, so the light dies away softly) to nothing at `reach` px from its
 * edge. A neighbour never quite reaches the strength of the pane the pointer
 * is on. `reach` 0 lights only that pane.
 */
export function litStrength(distance: number, reach: number): number {
  if (distance <= 0) return 1;
  if (reach <= 0 || distance >= reach) return 0;
  const near = 1 - distance / reach;
  return 0.8 * near * near;
}

/**
 * Where the light is relative to a box: position in % of the box (runs past
 * 0–100 for a pointer outside it) and the angle, in CSS gradient degrees,
 * that points from the box's centre toward the light.
 */
export function lightPosition(x: number, y: number, box: Box): { mx: number; my: number; angle: number } {
  const mx = ((x - box.left) / box.width) * 100;
  const my = ((y - box.top) / box.height) * 100;
  const angle = (Math.atan2(my - 50, mx - 50) * 180) / Math.PI + 90;
  return { mx, my, angle };
}

/**
 * Share of the remaining distance the light closes in `dt` ms, for a time
 * constant `tau` ms. Exponential, so the motion is the same at 60 and 120 Hz:
 * two half-length frames cover exactly what one full frame does.
 */
export function followFactor(dt: number, tau: number): number {
  if (dt <= 0) return 0;
  return 1 - Math.exp(-dt / tau);
}

/** the smallest of the boxes that contain the point, or -1: the pane that was pressed */
export function innermostAt(x: number, y: number, boxes: Box[]): number {
  let best = -1;
  let bestArea = Infinity;
  boxes.forEach((b, i) => {
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) return;
    const area = b.width * b.height;
    if (area < bestArea) {
      best = i;
      bestArea = area;
    }
  });
  return best;
}
