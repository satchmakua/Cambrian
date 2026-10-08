/**
 * Fast-forward: run a world on for a stretch of sim time as fast as the machine allows (the World
 * view does it in a worker — see src/world/ffWorker.ts — shipping the world over as a save), then
 * fold the result back into the live world object and say what happened while you were away.
 */
import { stepWorld, STEP, type World } from './world';

/** Step `w` on by `seconds` of sim time. `onProgress(fraction)` is called every `every` steps;
 *  `stop()` returning true ends the run early (the world is left at a clean step boundary). */
export function runFor(w: World, seconds: number, onProgress?: (f: number) => void, stop?: () => boolean, every = 2000): void {
  const n = Math.max(0, Math.round(seconds / STEP));
  for (let i = 0; i < n; i++) {
    stepWorld(w);
    if (i % every === every - 1) {
      onProgress?.((i + 1) / n);
      if (stop?.()) return;
    }
  }
  onProgress?.(1);
}

/** Move `from`'s dynamic state into `into` (same seed — same terrain), keeping `into`'s identity so
 *  a view holding it (and its landscape) carries on without rebuilding. */
export function adoptWorld(into: World, from: World): void {
  if (into.seed !== from.seed) throw new Error('adoptWorld: worlds with different seeds');
  into.time = from.time;
  into.stepCount = from.stepCount;
  into.nextId = from.nextId;
  into.rng.state.a = from.rng.state.a;
  into.historyTimer = from.historyTimer;
  into.fieldTimer = from.fieldTimer;
  into.grass.set(from.grass);
  into.algae.set(from.algae);
  into.plants = from.plants;
  into.species = from.species;
  into.creatures = from.creatures;
  into.corpses = from.corpses;
  into.events = from.events;
  into.history = from.history;
  into.tally = from.tally;
  into.buckets = new Map();
}

export interface Chronicle {
  seconds: number;
  born: number;
  died: number;
  killed: number;
  starved: number;
  aged: number;
  /** names of species that arose */
  arose: string[];
  /** …and their ids (for portraits of their founders) */
  aroseIds: number[];
  /** names of species that died out */
  lost: string[];
  population: [number, number];
}

/** What changed between two snapshots of a world's tallies and species list. */
export function chronicle(before: { time: number; tally: World['tally']; species: { id: number; name: string; extinctAt: number | null }[]; pop: number }, after: World): Chronicle {
  const known = new Set(before.species.map((s) => s.id));
  const extinctBefore = new Set(before.species.filter((s) => s.extinctAt !== null).map((s) => s.id));
  const t0 = before.tally, t1 = after.tally;
  const deaths = (t: World['tally']) => t.kills + t.starvation + t.oldAge;
  return {
    seconds: after.time - before.time,
    born: t1.births - t0.births,
    died: deaths(t1) - deaths(t0),
    killed: t1.kills - t0.kills,
    starved: t1.starvation - t0.starvation,
    aged: t1.oldAge - t0.oldAge,
    arose: after.species.filter((s) => !known.has(s.id)).map((s) => s.name),
    aroseIds: after.species.filter((s) => !known.has(s.id)).map((s) => s.id),
    lost: after.species.filter((s) => s.extinctAt !== null && !extinctBefore.has(s.id)).map((s) => s.name),
    population: [before.pop, after.creatures.length],
  };
}

/** A snapshot `chronicle` can compare against later. */
export function snapshotForChronicle(w: World): Parameters<typeof chronicle>[0] {
  return {
    time: w.time,
    tally: { ...w.tally },
    species: w.species.map((s) => ({ id: s.id, name: s.name, extinctAt: s.extinctAt })),
    pop: w.creatures.length,
  };
}
