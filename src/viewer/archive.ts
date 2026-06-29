/**
 * The Menagerie — a MAP-Elites archive over morphospace (MORPHOLOGY §11.4).
 *
 * As the user breeds and fast-forwards, every creature that appears is binned into a grid
 * over two morphospace axes (limb count × elongation) and each cell keeps its **most
 * coherent** specimen — a living field guide of divergent forms that fills over a session.
 * This lives in the UI layer, NOT the pure engine (the engine stays a pure genome→phenotype
 * function); but the binning/insert logic itself is pure & deterministic, so it's tested
 * headlessly. The archive is persisted with the session and replays from the user's choices.
 */
import { grow } from '../engine/grow';
import { describe, coherence } from '../engine/morphospace';
import type { Genome } from '../engine/genome';

/** Grid resolution per axis (GRID × GRID cells). */
export const MENAGERIE_GRID = 7;

export interface MenagerieEntry {
  genome: Genome;
  desc: number[]; // its morphospace descriptor (kept for the novelty steer)
  score: number; // elite quality = coherence (keeps the clearest specimen per cell)
  nearest: string; // nearest morphotype label
}

export type Menagerie = Record<string, MenagerieEntry>;

const bin = (v: number): number => Math.min(MENAGERIE_GRID - 1, Math.max(0, Math.floor(v * MENAGERIE_GRID)));

/** Grid key from a descriptor: x = limb count (desc[1]), y = elongation (desc[0]). */
export function binKey(desc: number[]): string {
  return `${bin(desc[1])}:${bin(desc[0])}`;
}

/**
 * Fold genomes into the archive; each cell keeps its highest-coherence specimen. Returns a
 * new map if anything changed, else the same reference (so callers can skip a needless write).
 */
export function archiveAll(menagerie: Menagerie, genomes: Genome[]): Menagerie {
  let next = menagerie;
  for (const g of genomes) {
    const p = grow(g);
    const desc = describe(p);
    const key = binKey(desc);
    const cur = next[key];
    const coh = coherence(p);
    if (!cur || coh.score > cur.score) {
      if (next === menagerie) next = { ...menagerie };
      next[key] = { genome: g, desc, score: coh.score, nearest: coh.nearest };
    }
  }
  return next;
}

/** The descriptors of everything in the archive — the reference set for the novelty steer. */
export function descriptorsOf(menagerie: Menagerie): number[][] {
  return Object.values(menagerie).map((e) => e.desc);
}
