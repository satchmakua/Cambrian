/**
 * App state (DESIGN §5): the lineage tree + the current creature + its offspring
 * litter, persisted to localStorage so a session survives a reload. The engine stays
 * pure and is *called by* the store. M3 = lineage + sharing.
 */
import { create } from 'zustand';
import { mix32 } from '../engine/rng';
import { defaultGenome, type Genome } from '../engine/genome';
import { randomGenome } from '../engine/random';
import { breederOffspring } from '../engine/selection';
import { decodeGenome } from '../engine/share';
import type { LineageNode, LineageNodes } from '../engine/lineage';

const LITTER = 9;
const STORAGE_KEY = 'cambrian.session.v1';

interface AppState {
  nodes: LineageNodes; // the family tree
  currentId: string; // the creature on the turntable
  counter: number; // next node id
  streamSeed: number; // seed for the current litter
  offspring: Genome[]; // LITTER mutants of the current creature

  newCreature: () => void;
  promote: (child: Genome) => void;
  selectNode: (id: string) => void; // revisit / branch from an ancestor
  reroll: () => void;
  importString: (s: string) => void; // CAM1: → new lineage rooted at that creature
}

const seed32 = () => (Math.random() * 0xffffffff) >>> 0; // UI-layer only; engine RNG is seeded

/** Compute the litter for whichever node is current. */
type Batch = Pick<AppState, 'nodes' | 'currentId' | 'counter' | 'streamSeed' | 'offspring'>;
function batch(nodes: LineageNodes, currentId: string, counter: number, streamSeed?: number): Batch {
  const cur = nodes[currentId];
  const ss = streamSeed ?? mix32(cur.genome.seed, cur.generation);
  return { nodes, currentId, counter, streamSeed: ss, offspring: breederOffspring(cur.genome, ss, LITTER) };
}

function rootedAt(genome: Genome): Batch {
  const node: LineageNode = { id: '0', genome, parentId: null, generation: 0 };
  return batch({ '0': node }, '0', 1);
}

// --- localStorage persistence ------------------------------------------------

function persist(b: Batch): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: b.nodes, currentId: b.currentId, counter: b.counter }));
  } catch {
    /* ignore quota / unavailable */
  }
}

function loadInitial(): Batch {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as { nodes?: LineageNodes; currentId?: string; counter?: number };
        if (s.nodes && s.currentId && s.nodes[s.currentId] && typeof s.counter === 'number') {
          return batch(s.nodes, s.currentId, s.counter);
        }
      }
    }
  } catch {
    /* fall through to a fresh session */
  }
  return rootedAt(defaultGenome());
}

export const useStore = create<AppState>((set) => {
  const commit = (b: Batch) => {
    persist(b);
    set(b);
  };
  return {
    ...loadInitial(),

    newCreature: () => commit(rootedAt(randomGenome(seed32()))),

    promote: (child) =>
      set((state) => {
        const id = String(state.counter);
        const node: LineageNode = {
          id,
          genome: child,
          parentId: state.currentId,
          generation: state.nodes[state.currentId].generation + 1,
        };
        const nodes = { ...state.nodes, [id]: node };
        const b = batch(nodes, id, state.counter + 1);
        persist(b);
        return b;
      }),

    selectNode: (id) =>
      set((state) => {
        if (!state.nodes[id]) return state;
        const b = batch(state.nodes, id, state.counter);
        persist(b);
        return b;
      }),

    reroll: () => set((state) => batch(state.nodes, state.currentId, state.counter, seed32())),

    importString: (s) => commit(rootedAt(decodeGenome(s))),
  };
});
