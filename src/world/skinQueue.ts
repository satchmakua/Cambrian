/**
 * The World's skin orders: which skins are waiting to be built, and for whom.
 *
 * The queue half of the "skins" notes in Actors.tsx, kept free of React so it can be run (and tested)
 * on its own: actors ask for a skin and go on wearing what they have; `buildSkins` builds what was
 * asked for, a few milliseconds' worth each frame.
 */
import type { Phenotype } from '../engine/grow';
import { prebuildSkin, skinKey } from '../viewer/CreatureMesh';
import { hasGeometry } from '../viewer/geometryCache';

export type Skin = 'far' | 'low' | 'high';

/** the geometry cache's key for each fineness of the World's (uncarved, hybrid) skin */
export const SKIN_KEY: Record<Skin, string> = {
  far: skinKey(true, 'far', false),
  low: skinKey(true, 'low', false),
  high: skinKey(true, 'high', false),
};

const QUEUES: Record<Skin, Phenotype[]> = { far: [], low: [], high: [] };
const WAITING: Record<Skin, Map<Phenotype, Set<() => void>>> = { far: new Map(), low: new Map(), high: new Map() };

/** Ask for a body's skin at a fineness: `onReady` is called once it is built (at once, if it already
 *  is). Returns a function that withdraws the request — a skin nobody waits for is never built. */
export function requestSkin(p: Phenotype, q: Skin, onReady: () => void): () => void {
  if (hasGeometry(p, SKIN_KEY[q])) {
    onReady();
    return () => {};
  }
  let set = WAITING[q].get(p);
  if (!set) {
    WAITING[q].set(p, (set = new Set()));
    QUEUES[q].push(p);
  }
  set.add(onReady);
  return () => set!.delete(onReady);
}

/** Build the next queued skin of a fineness, if anyone still wants it. Returns whether one was built. */
export function buildNext(q: Skin): boolean {
  while (QUEUES[q].length) {
    const p = QUEUES[q].shift()!;
    const ls = WAITING[q].get(p);
    WAITING[q].delete(p);
    if (!ls || ls.size === 0) continue; // nobody waiting any more
    prebuildSkin(p, 'hybrid', q, false, true);
    for (const f of ls) f();
    return true;
  }
  return false;
}

/**
 * One frame's builds: a time budget (always at least one build), so a burst of new genomes drains
 * quickly on a fast machine without ever stalling a frame for long on a slow one. The distant skin
 * goes first: it is the cheapest, and it gets a newcomer out of its capsule kit. Then, on a frame
 * with nothing else to build, at most one fine skin (3–4x a plain one's cost).
 */
export function buildSkins(budgetMs = 6, clock: () => number = () => performance.now()): void {
  const t0 = clock();
  let built = false;
  for (const q of ['far', 'low'] as const) {
    while (clock() - t0 < budgetMs && buildNext(q)) built = true;
  }
  if (!built) buildNext('high');
}

/** The fineness nearest the wanted one that is already built (null: none — the capsule kit). */
export function bestBuilt(p: Phenotype, want: Skin): Skin | null {
  if (hasGeometry(p, SKIN_KEY[want])) return want;
  const others = want === 'far' ? (['low', 'high'] as const) : want === 'low' ? (['far', 'high'] as const) : (['low', 'far'] as const);
  return others.find((q) => hasGeometry(p, SKIN_KEY[q])) ?? null;
}

/** The skin a body's distance calls for when nothing asks for the fine one. */
export const plainSkin = (distant: boolean): Skin => (distant ? 'far' : 'low');

/** A standing order for a body that is not being worn yet (a youngster's adult shape): see `skinOrder`. */
export interface SkinOrder {
  /** say (again) which fineness is wanted now */
  ask(q: Skin): void;
  /** withdraw it: nothing is built for it, and `onReady` is never called */
  cancel(): void;
}

/**
 * An order for a body's first skin that follows what is wanted. `onReady` is called once, as soon as
 * the body has ANY skin built (it can then be mounted without building in a render, and orders the
 * one it wants like every other body). Asking at another fineness withdraws the earlier request:
 * the order was once pinned to the fineness wanted when it was made, and a fine skin asked for while
 * the camera sat on a youngster was still built — a tenth of a second in one frame — after the camera
 * had left, for an animal that then wore thirty thousand triangles a field away.
 */
export function skinOrder(p: Phenotype, onReady: () => void): SkinOrder {
  let at: Skin | null = null;
  let withdraw: (() => void) | null = null;
  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    withdraw?.();
    withdraw = null;
    onReady();
  };
  return {
    ask(q) {
      if (done) return;
      if (bestBuilt(p, q)) return ready();
      if (q === at) return;
      withdraw?.();
      at = q;
      withdraw = requestSkin(p, q, ready);
    },
    cancel() {
      withdraw?.();
      withdraw = null;
      at = null;
      done = true;
    },
  };
}
