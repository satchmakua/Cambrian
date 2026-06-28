/**
 * App state (DESIGN §5): a Zustand store that holds the current genome. The engine
 * stays pure and is *called by* the store/UI, never the other way around. M0 holds a
 * single creature; M2 grows this into the lineage + offspring gallery.
 */
import { create } from 'zustand';
import { defaultGenome, type Genome } from '../engine/genome';

interface AppState {
  genome: Genome;
  /** M0 demo: re-roll the growth seed (jitter only). M1 swaps in real random genomes. */
  reseed: () => void;
}

export const useStore = create<AppState>((set) => ({
  genome: defaultGenome(),
  reseed: () => set({ genome: defaultGenome((Math.random() * 0xffffffff) >>> 0) }),
}));
