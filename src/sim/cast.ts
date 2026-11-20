/**
 * The cast a valley starts with. Pure (no React, no browser): the game, the fast-forward worker and the
 * headless reports (scripts/valley-report.ts) all populate a new valley the same way.
 *
 * A cast is a list of kinds, each with how many to release and which of the kind's looks: the valley's
 * seed and the look pick its founder, so a new game's felids are not every game's felids, and a look the
 * player re-rolls in the new-game panel is the one that game keeps. A founder can also be pasted as a
 * `CAM2:` string, and is then released as it is.
 */
import { release, type World } from './world';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../engine/random';
import { decodeGenome } from '../engine/share';
import type { Genome } from '../engine/genome';

/** How full a new valley starts: the whole starter ecosystem, half of it, or nobody. */
export type Ecosystem = 'standard' | 'sparse' | 'empty';

/** One kind in a valley's cast. */
export interface CastEntry {
  /** its morphotype (for a pasted founder, only its label: the kind it reads as) */
  kind: string;
  /** how many to release */
  count: number;
  /** which of the kind's looks: with the valley's seed, it picks the founder */
  look: number;
  /** a founder pasted as a `CAM2:` string, released as it is */
  genome?: string;
}

/** The most kinds a cast holds, and the most of one kind released (the valley holds 165 in all). */
export const CAST_KINDS = 24;
export const CAST_COUNT = 30;

/** A starter ecosystem: grazers, browsers, a scavenger-omnivore or two, predators — and a lake with life
 *  of its own: two kinds in the water, and two that live on both sides of the shore. (With one kind of
 *  fish alone the lake was a backwater: a handful of fish, held down by its algae, barely evolving.) */
const STARTER: [string, number][] = [
  ['rodent', 8],
  ['ungulate', 6],
  ['insectoid', 6],
  ['bird', 6],
  ['fish', 7],
  ['cephalopod', 3],
  ['anuran', 4],
  ['otter', 3],
  ['canid', 3],
  ['felid', 2],
];

/** The cast a valley starts with, by the game's set-up: the full starter ecosystem, half of each kind
 *  (never fewer than a pair), or nobody. Each kind keeps its place in the list, so a sparse valley
 *  holds the same species as a standard one of its seed. */
export function starterCast(ecosystem: Ecosystem): [string, number][] {
  if (ecosystem === 'empty') return [];
  if (ecosystem === 'sparse') return STARTER.map(([kind, n]) => [kind, Math.max(2, Math.round(n / 2))]);
  return STARTER;
}

/** An ecosystem's cast as entries the player can edit: each kind's look is its place in the starter
 *  list, so an edited cast that keeps a kind keeps its founder. */
export function castOf(ecosystem: Ecosystem): CastEntry[] {
  return starterCast(ecosystem).map(([kind, count], look) => ({ kind, count, look }));
}

/** A kind's first look in a cast it was added to: its starter look if it has one, else one of its own. */
export function lookFor(kind: string): number {
  const i = STARTER.findIndex(([k]) => k === kind);
  return i >= 0 ? i : STARTER.length + Math.max(0, MORPHOTYPE_IDS.indexOf(kind));
}

/** The founder a cast entry releases in a valley of this seed. */
export function founderOf(worldSeed: number, e: CastEntry): Genome {
  if (e.genome) {
    try {
      return decodeGenome(e.genome);
    } catch {
      /* a founder that no longer reads: the kind's own look instead */
    }
  }
  return genomeOfMorphotype((worldSeed * 97 + e.look * 13) >>> 0, MORPHOTYPE_IDS.includes(e.kind) ? e.kind : 'rodent');
}

/** Release a new valley's cast (an ecosystem's, or one the player chose). */
export function populateCast(w: World, cast: Ecosystem | readonly CastEntry[]): void {
  for (const e of typeof cast === 'string' ? castOf(cast) : cast) release(w, founderOf(w.seed, e), e.count, undefined, e.kind);
}

/** A cast read from a save or the browser, checked entry by entry: an entry that is not one is dropped.
 *  Undefined where there is no list at all (the set-up's ecosystem then stands). */
export function checkCast(v: unknown): CastEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CastEntry[] = [];
  for (const x of v.slice(0, CAST_KINDS)) {
    if (typeof x !== 'object' || x === null) continue;
    const e = x as Record<string, unknown>;
    if (typeof e.kind !== 'string' || e.kind.length === 0 || e.kind.length > 32) continue;
    const count = typeof e.count === 'number' && Number.isFinite(e.count) ? Math.max(1, Math.min(CAST_COUNT, Math.round(e.count))) : null;
    const look = typeof e.look === 'number' && Number.isFinite(e.look) ? Math.floor(Math.abs(e.look)) >>> 0 : null;
    if (count === null || look === null) continue;
    const entry: CastEntry = { kind: e.kind, count, look };
    if (typeof e.genome === 'string') {
      try {
        decodeGenome(e.genome);
        entry.genome = e.genome;
      } catch {
        continue;
      }
    } else if (!MORPHOTYPE_IDS.includes(e.kind)) continue;
    out.push(entry);
  }
  return out;
}
