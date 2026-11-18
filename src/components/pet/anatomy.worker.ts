/**
 * Builds the cat's body off the main thread, so opening the cat's page or
 * scrolling to the widget never stutters while the mesh is made.
 */
import { buildCatArrays } from "./anatomy";

const a = buildCatArrays();
const out = self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void };
out.postMessage(a, [
  a.position.buffer, a.normal.buffer, a.skinIndex.buffer, a.skinWeight.buffer,
  a.rest.buffer, a.comb.buffer, a.fur.buffer, a.region.buffer, a.index.buffer,
]);
