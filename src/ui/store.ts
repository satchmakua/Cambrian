/**
 * App state (DESIGN §5): the lineage tree + the current creature + its offspring
 * litter + the symmetry mode, persisted to localStorage so a session survives a
 * reload. The engine stays pure and is *called by* the store.
 */
import { create } from 'zustand';
import { mix32 } from '../engine/rng';
import { defaultGenome, type Genome } from '../engine/genome';
import { grow } from '../engine/grow';
import { randomGenome, genomeOfMorphotype, type SymmetryMode } from '../engine/random';
import { breederLitter } from '../engine/selection';
import { decodeGenome } from '../engine/share';
import { runGenerations, ZERO_PRESSURE, type Pressure } from '../engine/pressures';
import type { LineageNode, LineageNodes } from '../engine/lineage';
import { archiveAll, descriptorsOf, type Menagerie } from '../viewer/archive';
import type { Trajectory } from '../physics/fitness';

const LITTER = 9;
const STORAGE_KEY = 'cambrian.session.v2c'; // bumped for the M12 covering genes
const SKIN_KEY = 'cambrian.skinMode.v1'; // a render preference, persisted on its own

/** capsules (the kit) · smooth (organic SDF, body only) · hybrid (organic SDF over every part). */
export type SkinMode = 'capsules' | 'smooth' | 'hybrid';

function loadSkinMode(): SkinMode {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SKIN_KEY) : null;
    if (v === 'smooth' || v === 'hybrid' || v === 'capsules') return v;
  } catch {
    /* ignore */
  }
  return 'capsules';
}

interface Session {
  nodes: LineageNodes; // the family tree
  currentId: string; // the creature on the turntable
  counter: number; // next node id
  streamSeed: number; // seed for the current litter
  offspring: Genome[]; // LITTER mutants of the current creature
  symmetryMode: SymmetryMode;
  menagerie: Menagerie; // MAP-Elites archive over morphospace (M14)
}

interface AppState extends Session {
  pressure: Pressure; // directed-evolution target (M4)
  skinMode: SkinMode; // capsules / smooth / hybrid (M15 + the hybrid)
  setSkinMode: (mode: SkinMode) => void;
  morphoFilter: string | null; // bias "New random creature" to one morphotype, or null for the full sampler (M16)
  setMorphoFilter: (id: string | null) => void;
  newCreature: () => void;
  promote: (child: Genome) => void;
  selectNode: (id: string) => void; // revisit / branch from an ancestor
  reroll: () => void;
  importString: (s: string) => void; // CAM1: → new lineage rooted at that creature
  setSymmetryMode: (mode: SymmetryMode) => void;
  setPressure: (patch: Partial<Pressure>) => void;
  /** Live "weirdness" dial: set the current creature's structural coherence and regrow (M24). */
  setCoherence: (coherence: number) => void;
  /** Fast-forward `generations` of directed selection; appends the path to the tree. */
  runDirected: (generations: number) => void;
  /** Pull a Menagerie cell back as a fresh parent (M14). */
  loadCell: (key: string) => void;
  physicsRunning: boolean; // a physics-fitness run is in flight (M6)
  physicsDistance: number | null; // distance the latest evolved walker travelled (bu)
  /** Evolve for locomotion in a lazy-loaded physics sim; appends the path to the tree (M6). */
  runPhysics: (generations: number) => Promise<void>;
  playback: (Trajectory & { seed: number }) | null; // the evolved walker's recorded gait
  playbackOn: boolean; // play the recorded gait in the viewer instead of procedural motion
  togglePlayback: () => void;
}

const seed32 = () => (Math.random() * 0xffffffff) >>> 0; // UI-layer only; engine RNG is seeded

/** Build the litter for whichever node is current; offspring stay in-symmetry when locked. */
function batch(
  nodes: LineageNodes,
  currentId: string,
  counter: number,
  mode: SymmetryMode,
  menagerie: Menagerie,
  streamSeed?: number,
): Session {
  const cur = nodes[currentId];
  const ss = streamSeed ?? mix32(cur.genome.seed, cur.generation);
  const lock = mode !== 'auto';
  const offspring = breederLitter(cur.genome, ss, LITTER, lock);
  return {
    nodes,
    currentId,
    counter,
    streamSeed: ss,
    symmetryMode: mode,
    offspring,
    // the current creature + its divergent litter are the specimens the menagerie collects
    menagerie: archiveAll(menagerie, [cur.genome, ...offspring]),
  };
}

function rootedAt(genome: Genome, mode: SymmetryMode, menagerie: Menagerie): Session {
  const node: LineageNode = { id: '0', genome, parentId: null, generation: 0 };
  return batch({ '0': node }, '0', 1, mode, menagerie);
}

// --- localStorage persistence ------------------------------------------------

function persist(s: Session): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nodes: s.nodes,
        currentId: s.currentId,
        counter: s.counter,
        symmetryMode: s.symmetryMode,
        menagerie: s.menagerie,
      }),
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
          return batch(s.nodes, s.currentId, s.counter, s.symmetryMode ?? 'auto', s.menagerie ?? {});
        }
      }
    }
  } catch {
    /* fall through to a fresh session */
  }
  return rootedAt(defaultGenome(), 'auto', {});
}

export const useStore = create<AppState>((set, get) => {
  const commit = (s: Session) => {
    persist(s);
    set({ ...s, playback: null, playbackOn: false }); // a new creature invalidates the recorded gait
  };
  const CLEAR_GAIT = { playback: null, playbackOn: false } as const; // for the set-callback actions
  return {
    ...loadInitial(),
    pressure: ZERO_PRESSURE,
    skinMode: loadSkinMode(),
    morphoFilter: null,
    physicsRunning: false,
    physicsDistance: null,
    playback: null,
    playbackOn: false,

    togglePlayback: () => set((s) => ({ playbackOn: !s.playbackOn })),

    setMorphoFilter: (id) => set({ morphoFilter: id }),

    setSkinMode: (mode) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(SKIN_KEY, mode);
      } catch {
        /* ignore */
      }
      set({ skinMode: mode });
    },

    newCreature: () => {
      const { symmetryMode, menagerie, morphoFilter } = get();
      const g = morphoFilter ? genomeOfMorphotype(seed32(), morphoFilter) : randomGenome(seed32(), symmetryMode);
      commit(rootedAt(g, symmetryMode, menagerie));
    },

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
        const b = batch(nodes, id, state.counter + 1, state.symmetryMode, state.menagerie);
        persist(b);
        return { ...b, ...CLEAR_GAIT };
      }),

    selectNode: (id) =>
      set((state) => {
        if (!state.nodes[id]) return state;
        const b = batch(state.nodes, id, state.counter, state.symmetryMode, state.menagerie);
        persist(b);
        return { ...b, ...CLEAR_GAIT };
      }),

    reroll: () =>
      set((state) => batch(state.nodes, state.currentId, state.counter, state.symmetryMode, state.menagerie, seed32())),

    importString: (s) => commit(rootedAt(decodeGenome(s), get().symmetryMode, get().menagerie)),

    setSymmetryMode: (mode) => {
      if (mode === 'auto') {
        // keep the current creature; just unlock offspring symmetry
        commit(batch(get().nodes, get().currentId, get().counter, 'auto', get().menagerie));
      } else {
        // enforce: spawn a fresh creature of that symmetry
        commit(rootedAt(randomGenome(seed32(), mode), mode, get().menagerie));
      }
    },

    setPressure: (patch) => set((state) => ({ pressure: { ...state.pressure, ...patch } })),

    setCoherence: (coherence) =>
      set((state) => {
        const cur = state.nodes[state.currentId];
        const genome: Genome = { ...structuredClone(cur.genome), coherence: Math.min(1, Math.max(0, coherence)) };
        const nodes = { ...state.nodes, [cur.id]: { ...cur, genome } };
        // re-batch from the same streamSeed so the offspring track the new coherence too
        const b = batch(nodes, cur.id, state.counter, state.symmetryMode, state.menagerie, state.streamSeed);
        persist(b);
        return { ...b, ...CLEAR_GAIT };
      }),

    runDirected: (generations) =>
      set((state) => {
        const start = state.nodes[state.currentId];
        // a covering target seeds the start skin so it's reachable + held through the run
        let rootGenome = start.genome;
        if (state.pressure.coveringTarget) {
          rootGenome = structuredClone(start.genome);
          rootGenome.covering.type = state.pressure.coveringTarget;
        }
        const path = runGenerations(rootGenome, state.pressure, generations, seed32(), {
          lockSymmetry: state.symmetryMode !== 'auto',
          refs: descriptorsOf(state.menagerie), // novelty steers away from what the menagerie holds
        });
        // Append the chosen path (skip index 0 = the current creature) to the tree.
        let nodes = state.nodes;
        let counter = state.counter;
        let parentId = state.currentId;
        for (let i = 1; i < path.length; i++) {
          const id = String(counter++);
          nodes = { ...nodes, [id]: { id, genome: path[i], parentId, generation: start.generation + i } };
          parentId = id;
        }
        const b = batch(nodes, parentId, counter, state.symmetryMode, state.menagerie);
        persist(b);
        return { ...b, ...CLEAR_GAIT };
      }),

    loadCell: (key) => {
      const entry = get().menagerie[key];
      if (entry) commit(rootedAt(entry.genome, get().symmetryMode, get().menagerie));
    },

    runPhysics: async (generations) => {
      if (get().physicsRunning) return;
      const startId = get().currentId;
      const startNode = get().nodes[startId];
      const lock = get().symmetryMode !== 'auto';
      set({ physicsRunning: true });
      try {
        // lazy import keeps the Rapier WASM chunk out of the main bundle until now
        const { runPhysicsGenerations, simulateTrajectory } = await import('../physics/fitness');
        const { path, distances } = await runPhysicsGenerations(startNode.genome, generations, seed32(), {
          lockSymmetry: lock,
        });
        const winner = path[path.length - 1];
        const traj = await simulateTrajectory(grow(winner)); // record the best walker's gait for playback
        set((state) => {
          let nodes = state.nodes;
          let counter = state.counter;
          let parentId = startId;
          for (let i = 1; i < path.length; i++) {
            const id = String(counter++);
            nodes = { ...nodes, [id]: { id, genome: path[i], parentId, generation: startNode.generation + i } };
            parentId = id;
          }
          const b = batch(nodes, parentId, counter, state.symmetryMode, state.menagerie);
          persist(b);
          return {
            ...b,
            physicsRunning: false,
            physicsDistance: distances[distances.length - 1],
            playback: { ...traj, seed: winner.seed },
            playbackOn: true,
          };
        });
      } catch (e) {
        set({ physicsRunning: false });
        throw e;
      }
    },
  };
});
