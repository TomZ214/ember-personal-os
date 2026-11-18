import * as THREE from "three";
import { buildCatArrays, type CatArrays } from "./anatomy";

/**
 * The cat's body as a three.js geometry, built once per page load in a web
 * worker and shared by every view of the cat (and every layer of its fur).
 * If a worker cannot be started, it is built on the main thread instead.
 */

let geometry: THREE.BufferGeometry | null = null;
let loading: Promise<THREE.BufferGeometry> | null = null;

function toGeometry(a: CatArrays) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(a.position, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(a.normal, 3));
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(a.skinIndex, 4));
  g.setAttribute("skinWeight", new THREE.BufferAttribute(a.skinWeight, 4));
  g.setAttribute("aRest", new THREE.BufferAttribute(a.rest, 3));
  g.setAttribute("aComb", new THREE.BufferAttribute(a.comb, 3));
  g.setAttribute("aFur", new THREE.BufferAttribute(a.fur, 1));
  g.setAttribute("aRegion", new THREE.BufferAttribute(a.region, 1));
  const count = a.position.length / 3;
  g.setIndex(count > 65535 ? new THREE.BufferAttribute(a.index, 1) : new THREE.BufferAttribute(Uint16Array.from(a.index), 1));
  g.computeBoundingSphere();
  return g;
}

/** the geometry, once loaded (throws before) */
export function catGeometry(): THREE.BufferGeometry {
  if (!geometry) throw new Error("cat geometry not loaded yet");
  return geometry;
}

export function loadCatGeometry(): Promise<THREE.BufferGeometry> {
  if (geometry) return Promise.resolve(geometry);
  if (!loading) {
    loading = new Promise((resolve) => {
      const done = (a: CatArrays) => {
        geometry ??= toGeometry(a);
        resolve(geometry);
      };
      const here = () => window.setTimeout(() => done(buildCatArrays()), 0);
      try {
        const worker = new Worker(new URL("./anatomy.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (e: MessageEvent<CatArrays>) => {
          done(e.data);
          worker.terminate();
        };
        worker.onerror = () => {
          worker.terminate();
          here();
        };
      } catch {
        here();
      }
    });
  }
  return loading;
}
