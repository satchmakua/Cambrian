/**
 * App state (DESIGN §5): a Zustand store that holds the current genome. The engine
 * stays pure and is *called by* the store/UI, never the other way around. M1 adds
 * full random creatures; M2 grows this into the lineage + offspring gallery.
 */
import { create } from 'zustand';
import { defaultGenome, type Genome } from '../engine/genome';
import { randomGenome } from '../engine/random';

interface AppState {
  genome: Genome;
  /** Generate a fresh random creature (its seed is shown in the HUD). */
  newCreature: () => void;
}

export const useStore = create<AppState>((set) => ({
  genome: defaultGenome(),
  newCreature: () => set({ genome: randomGenome((Math.random() * 0xffffffff) >>> 0) }),
}));
