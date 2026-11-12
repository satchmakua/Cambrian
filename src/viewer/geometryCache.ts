/**
 * A ref-counted cache for the expensive per-creature smooth-skin geometry.
 *
 * The welded smooth surface costs ~100 ms to build. When one creature is on screen in several
 * viewports at once — the main stage plus the Studio's four plates — every `CreatureMesh` used to
 * build (and own) its own copy. Here each (phenotype, mode, quality) surface is built once and shared.
 *
 * Usage splits building from ownership so it survives React's StrictMode double-invocation:
 *   - `getGeometry` (in render / useMemo) returns the cached surface, building it on a miss;
 *   - `retainGeometry` / `releaseGeometry` (in an effect) count the live users.
 * When the count falls to zero the GPU buffers are disposed after a short grace period, so a
 * remount (StrictMode, a tab switch) re-retains the same surface instead of rebuilding it.
 * Keyed on the Phenotype object identity, so a regrown creature (a new object) never sees a stale one.
 */
import type * as THREE from 'three';
import type { Phenotype } from '../engine/grow';

interface Entry {
  geo: THREE.BufferGeometry;
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const CACHE = new WeakMap<Phenotype, Map<string, Entry>>();
const GRACE_MS = 1500;

function entry(p: Phenotype, key: string): Entry | undefined {
  return CACHE.get(p)?.get(key);
}

export function getGeometry(p: Phenotype, key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let byKey = CACHE.get(p);
  if (!byKey) {
    byKey = new Map();
    CACHE.set(p, byKey);
  }
  let e = byKey.get(key);
  if (!e) {
    e = { geo: build(), refs: 0, timer: null };
    byKey.set(key, e);
    scheduleSweep(p, key, e); // never retained (a render that didn't commit) → still freed
  }
  return e.geo;
}

/** Is this surface built (and not yet swept)? */
export function hasGeometry(p: Phenotype, key: string): boolean {
  return entry(p, key) !== undefined;
}

/** Count a user of a built surface. Returns whether there was one to count (a caller that keeps
 *  surfaces for later — the World's actors — must release only what it really retained). */
export function retainGeometry(p: Phenotype, key: string): boolean {
  const e = entry(p, key);
  if (!e) return false;
  e.refs++;
  if (e.timer) {
    clearTimeout(e.timer);
    e.timer = null;
  }
  return true;
}

/** Give a surface up. With no users left it is disposed after `graceMs` — a moment by default (a
 *  remount re-retains it), longer for a surface likely to be wanted again soon (a creature's fine skin
 *  when the camera has only just moved off). */
export function releaseGeometry(p: Phenotype, key: string, graceMs = GRACE_MS): void {
  const e = entry(p, key);
  if (!e) return;
  e.refs = Math.max(0, e.refs - 1);
  if (e.refs === 0) scheduleSweep(p, key, e, graceMs);
}

function scheduleSweep(p: Phenotype, key: string, e: Entry, graceMs = GRACE_MS): void {
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => {
    e.timer = null;
    if (e.refs > 0) return;
    e.geo.dispose();
    CACHE.get(p)?.delete(key);
  }, graceMs);
}
