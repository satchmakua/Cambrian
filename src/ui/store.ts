/**
 * App state (DESIGN §5): a Zustand store holding the current parent, its generation,
 * and the litter of mutant offspring. The engine stays pure and is *called by* the
 * store. M2 = the breeder loop; M3 grows this into the lineage tree + sharing.
 */
import { create } from 'zustand';
import { mix32 } from '../engine/rng';
import { defaultGenome, type Genome } from '../engine/genome';
import { randomGenome } from '../engine/random';
import { breederOffspring } from '../engine/selection';

const LITTER = 9;

interface Batch {
  genome: Genome; // the current parent
  generation: number;
  streamSeed: number; // seed for the current litter
  offspring: Genome[]; // LITTER mutants of `genome`
}

interface AppState extends Batch {
  /** Fresh random parent, back to generation 0. */
  newCreature: () => void;
  /** Promote a chosen offspring to parent and breed the next generation. */
  promote: (child: Genome) => void;
  /** Re-breed a different litter from the same parent. */
  reroll: () => void;
}

function makeBatch(genome: Genome, generation: number, streamSeed: number): Batch {
  return { genome, generation, streamSeed, offspring: breederOffspring(genome, streamSeed, LITTER) };
}

const seed32 = () => (Math.random() * 0xffffffff) >>> 0; // UI-layer only; engine RNG is seeded

const initial = defaultGenome();

export const useStore = create<AppState>((set, get) => ({
  ...makeBatch(initial, 0, mix32(initial.seed, 0)),
  newCreature: () => {
    const g = randomGenome(seed32());
    set(makeBatch(g, 0, mix32(g.seed, 0)));
  },
  promote: (child) => {
    const generation = get().generation + 1;
    set(makeBatch(child, generation, mix32(child.seed, generation)));
  },
  reroll: () => {
    const { genome, generation } = get();
    set(makeBatch(genome, generation, seed32()));
  },
}));
