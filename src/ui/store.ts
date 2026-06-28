/**
 * App state (DESIGN §5): the lineage tree + the current creature + its offspring
 * litter + the symmetry mode, persisted to localStorage so a session survives a
 * reload. The engine stays pure and is *called by* the store.
 */
import { create } from 'zustand';
import { mix32 } from '../engine/rng';
import { defaultGenome, type Genome } from '../engine/genome';
import { randomGenome, type SymmetryMode } from '../engine/random';
import { breederOffspring } from '../engine/selection';
import { decodeGenome } from '../engine/share';
import type { LineageNode, LineageNodes } from '../engine/lineage';

const LITTER = 9;
const STORAGE_KEY = 'cambrian.session.v1';

interface Session {
  nodes: LineageNodes; // the family tree
  currentId: string; // the creature on the turntable
  counter: number; // next node id
  streamSeed: number; // seed for the current litter
  offspring: Genome[]; // LITTER mutants of the current creature
  symmetryMode: SymmetryMode;
}

interface AppState extends Session {
  newCreature: () => void;
  promote: (child: Genome) => void;
  selectNode: (id: string) => void; // revisit / branch from an ancestor
  reroll: () => void;
  importString: (s: string) => void; // CAM1: → new lineage rooted at that creature
  setSymmetryMode: (mode: SymmetryMode) => void;
}

const seed32 = () => (Math.random() * 0xffffffff) >>> 0; // UI-layer only; engine RNG is seeded

/** Build the litter for whichever node is current; offspring stay in-symmetry when locked. */
function batch(
  nodes: LineageNodes,
  currentId: string,
  counter: number,
  mode: SymmetryMode,
  streamSeed?: number,
): Session {
  const cur = nodes[currentId];
  const ss = streamSeed ?? mix32(cur.genome.seed, cur.generation);
  const lock = mode !== 'auto';
  return {
    nodes,
    currentId,
    counter,
    streamSeed: ss,
    symmetryMode: mode,
    offspring: breederOffspring(cur.genome, ss, LITTER, undefined, lock),
  };
}

function rootedAt(genome: Genome, mode: SymmetryMode): Session {
  const node: LineageNode = { id: '0', genome, parentId: null, generation: 0 };
  return batch({ '0': node }, '0', 1, mode);
}

// --- localStorage persistence ------------------------------------------------

function persist(s: Session): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ nodes: s.nodes, currentId: s.currentId, counter: s.counter, symmetryMode: s.symmetryMode }),
    );
  } catch {
    /* ignore quota / unavailable */
  }
}

function loadInitial(): Session {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Session>;
        if (s.nodes && s.currentId && s.nodes[s.currentId] && typeof s.counter === 'number') {
          return batch(s.nodes, s.currentId, s.counter, s.symmetryMode ?? 'auto');
        }
      }
    }
  } catch {
    /* fall through to a fresh session */
  }
  return rootedAt(defaultGenome(), 'auto');
}

export const useStore = create<AppState>((set, get) => {
  const commit = (s: Session) => {
    persist(s);
    set(s);
  };
  return {
    ...loadInitial(),

    newCreature: () => commit(rootedAt(randomGenome(seed32(), get().symmetryMode), get().symmetryMode)),

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
        const b = batch(nodes, id, state.counter + 1, state.symmetryMode);
        persist(b);
        return b;
      }),

    selectNode: (id) =>
      set((state) => {
        if (!state.nodes[id]) return state;
        const b = batch(state.nodes, id, state.counter, state.symmetryMode);
        persist(b);
        return b;
      }),

    reroll: () => set((state) => batch(state.nodes, state.currentId, state.counter, state.symmetryMode, seed32())),

    importString: (s) => commit(rootedAt(decodeGenome(s), get().symmetryMode)),

    setSymmetryMode: (mode) => {
      if (mode === 'auto') {
        // keep the current creature; just unlock offspring symmetry
        commit(batch(get().nodes, get().currentId, get().counter, 'auto'));
      } else {
        // enforce: spawn a fresh creature of that symmetry
        commit(rootedAt(randomGenome(seed32(), mode), mode));
      }
    },
  };
});
