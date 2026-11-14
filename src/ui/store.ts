/**
 * App state (DESIGN §5): the lineage tree + the current creature + its offspring
 * litter + the symmetry mode, persisted to localStorage so a session survives a
 * reload. The engine stays pure and is *called by* the store.
 */
import { create } from 'zustand';
import { mix32 } from '../engine/rng';
import type { Genome } from '../engine/genome';
import { grow } from '../engine/grow';
import { randomGenome, genomeOfMorphotype, type SymmetryMode } from '../engine/random';
import { breederLitter } from '../engine/selection';
import { decodeGenome } from '../engine/share';
import { runGenerations, ZERO_PRESSURE, type Pressure } from '../engine/pressures';
import type { LineageNode, LineageNodes } from '../engine/lineage';
import { archiveAll, descriptorsOf, type Menagerie } from '../viewer/archive';
import type { Trajectory } from '../physics/fitness';
import { DEFAULT_SETUP, cleanName, type BreederSave, type GameSetup } from './saves';

const LITTER = 9;
const STORAGE_KEY = 'cambrian.session.v2c'; // bumped for the M12 covering genes
const SKIN_KEY = 'cambrian.skinMode.v2'; // a render preference, persisted on its own (v2: hybrid default)
const VIEW_KEY = 'cambrian.lastView'; // the screen a game was left on (Continue returns there)

/** capsules (the kit) · smooth (organic SDF, body only) · hybrid (organic SDF over every part). */
export type SkinMode = 'capsules' | 'smooth' | 'hybrid';

/** A screen of the game itself: breed (the Biomorphs loop) · studio (inspect one specimen) · world (ecosystem). */
export type GameView = 'breed' | 'studio' | 'world';
/** The top-level screen: the main menu, or one of the game's. */
export type AppView = 'menu' | GameView;

/** The game being played: the slot it was last saved to (null: never), its name, its valley's set-up. */
export interface GameInfo {
  id: string | null;
  name: string;
  setup: GameSetup;
}

const NEW_GAME: GameInfo = { id: null, name: 'Game 1', setup: DEFAULT_SETUP };

/** The page opens on the main menu — except a dev page asked for a screen by URL (the screenshot
 *  harness: ?studio=1, ?world=1, ?seed=…), which opens straight onto it as it always did. */
function initialView(): AppView {
  try {
    if (typeof location !== 'undefined') {
      const q = new URLSearchParams(location.search);
      if (q.get('menu') === '1') return 'menu';
      if (q.get('studio') === '1' || q.get('bestiary') === '1') return 'studio';
      if (q.get('world') === '1') return 'world';
      if (import.meta.env.DEV && location.search.length > 1) return 'breed';
    }
  } catch {
    /* ignore */
  }
  return 'menu';
}

/** The screen the last game was left on. */
export function lastGameView(): GameView {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_KEY) : null;
    if (v === 'breed' || v === 'studio' || v === 'world') return v;
  } catch {
    /* ignore */
  }
  return 'breed';
}

function loadSkinMode(): SkinMode {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(SKIN_KEY) : null;
    if (v === 'smooth' || v === 'hybrid' || v === 'capsules') return v;
  } catch {
    /* ignore */
  }
  // the welded smooth surface over every part — the capsule kit is the fallback, not the face
  return 'hybrid';
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
  view: AppView;
  setView: (view: AppView) => void;
  /** the in-game menu is up: the screens behind it stop drawing (and the valley's clock stops) */
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  /** the game being played (its name, its save slot, its valley's set-up) */
  game: GameInfo;
  /** is there a game to continue? (false on a first visit, until one is started or loaded) */
  hasGame: boolean;
  /** Start a fresh game: a new lineage rooted at `founder`, an empty menagerie. */
  newGame: (founder: Genome, mode: SymmetryMode, game: GameInfo) => void;
  /** Swap in a saved game's lineage. */
  restore: (save: BreederSave, game: GameInfo) => void;
  /**
   * The same in two steps, for a load that must be all-or-nothing: everything that can fail (the
   * creature being bred is grown, its litter bred) happens here and changes nothing; calling what
   * comes back puts the lineage in place, and cannot fail.
   */
  readyRestore: (save: BreederSave) => (game: GameInfo) => void;
  /** the browser could not keep the game at its last attempt (its store is full or blocked): until a
   *  write succeeds, only a save to a slot — or a file — holds what has been bred since */
  unkept: boolean;
  /** The lineage as a save holds it. */
  snapshot: () => BreederSave;
  /** Note the slot/name the game was just saved under. */
  setGame: (patch: Partial<GameInfo>) => void;
  /** Root a fresh lineage at this exact genome (the Bestiary's "adopt", the World's "take home"). */
  adopt: (genome: Genome) => void;
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
  /** Dev/headless only: root the lineage at a deterministic seed (+ optional morphotype) so a
   *  screenshot harness can request an exact creature via URL params. */
  devLoad: (seed: number, morph: string | null, sym: SymmetryMode) => void;
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

// (the game's name, slot and set-up ride along with the session: module state, written with it)
let GAME: GameInfo = NEW_GAME;

/** Write the session to the browser. `replacing`: the game was just swapped for another (a new game,
 *  a load) — the last game's copy goes first, so that if this one cannot be written (the store is
 *  full) Continue never finds the old game's lineage under the new game's name, and so the old copy's
 *  bulk is not what leaves no room for the new. Returns whether the browser now holds the session. */
function persist(s: Session, replacing = false): boolean {
  try {
    if (typeof localStorage === 'undefined') return true; // (nowhere to keep it: nothing has failed)
    if (replacing) localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nodes: s.nodes,
        currentId: s.currentId,
        counter: s.counter,
        symmetryMode: s.symmetryMode,
        menagerie: s.menagerie,
        game: GAME,
      }),
    );
    return true;
  } catch {
    return false; // quota / unavailable
  }
}

function readGame(v: unknown): GameInfo {
  const g = (v && typeof v === 'object' ? v : {}) as Partial<GameInfo>;
  const setup = (g.setup && typeof g.setup === 'object' ? g.setup : {}) as Partial<GameSetup>;
  return {
    id: typeof g.id === 'string' ? g.id : null,
    name: cleanName(typeof g.name === 'string' ? g.name : '', NEW_GAME.name),
    setup: {
      worldSeed: typeof setup.worldSeed === 'number' && Number.isFinite(setup.worldSeed) ? setup.worldSeed >>> 0 : DEFAULT_SETUP.worldSeed,
      ecosystem: setup.ecosystem === 'sparse' || setup.ecosystem === 'empty' ? setup.ecosystem : 'standard',
    },
  };
}

function loadInitial(): Session & { game: GameInfo; hasGame: boolean } {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw) as Partial<Session> & { game?: unknown };
        if (s.nodes && s.currentId && s.nodes[s.currentId] && typeof s.counter === 'number') {
          GAME = readGame(s.game);
          return { ...batch(s.nodes, s.currentId, s.counter, s.symmetryMode ?? 'auto', s.menagerie ?? {}), game: GAME, hasGame: true };
        }
      }
    }
  } catch {
    /* fall through to a fresh session */
  }
  // a first visit starts on a creature from the library chosen to read well (a russet fox-dog); the
  // hand-built demo genome (`defaultGenome`) stays the engine's fixture
  return { ...rootedAt(genomeOfMorphotype(3, 'canid'), 'auto', {}), game: GAME, hasGame: false };
}

// Saving is off the click's path: the lineage's JSON grows with every generation (~2 MB by the 200th,
// ~16 ms to stringify), so each commit only marks the session dirty and the write happens when the
// browser is idle — the latest state wins, and leaving the page flushes it.
let unsaved: Session | null = null;
let replacing = false; // the session waiting to be written is a different game from the one stored
function flushSave(): void {
  const s = unsaved;
  unsaved = null;
  if (!s) return;
  const kept = persist(s, replacing);
  replacing = false;
  // (the store only hears about a change: a write that works, as nearly all do, touches nothing)
  if (useStore.getState().unkept === kept) useStore.setState({ unkept: !kept });
}
function persistSoon(s: Session): void {
  const scheduled = unsaved !== null;
  unsaved = s;
  if (scheduled) return;
  const w = typeof window !== 'undefined' ? (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }) : null;
  if (w?.requestIdleCallback) w.requestIdleCallback(flushSave, { timeout: 2000 });
  else setTimeout(flushSave, 300);
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', flushSave);

/** Write the session out now (before leaving for the menu, before a save is taken). */
export function saveSessionNow(): void {
  flushSave();
}

export const useStore = create<AppState>((set, get) => {
  const commit = (s: Session) => {
    persistSoon(s);
    set({ ...s, playback: null, playbackOn: false }); // a new creature invalidates the recorded gait
  };
  const CLEAR_GAIT = { playback: null, playbackOn: false } as const; // for the set-callback actions
  return {
    ...loadInitial(),
    menuOpen: false,
    setMenuOpen: (menuOpen) => set({ menuOpen }),
    view: initialView(),
    setView: (view) => {
      if (view !== 'menu') {
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem(VIEW_KEY, view);
        } catch {
          /* ignore */
        }
        // (entering a game screen from a first visit's menu is starting to play it)
        if (!get().hasGame) {
          persistSoon(get());
          set({ hasGame: true });
        }
      }
      set({ view });
    },
    unkept: false,
    newGame: (founder, mode, game) => {
      const next = rootedAt(structuredClone(founder), mode, {}); // (first: a founder that will not grow changes nothing)
      GAME = game;
      commit(next);
      set({ game, hasGame: true, pressure: ZERO_PRESSURE, physicsDistance: null });
      replacing = true;
      flushSave();
    },
    restore: (save, game) => get().readyRestore(save)(game),
    readyRestore: (save) => {
      const next = batch(save.nodes, save.currentId, save.counter, save.symmetryMode, save.menagerie);
      return (game) => {
        GAME = game;
        commit(next);
        set({ game, hasGame: true, pressure: ZERO_PRESSURE, physicsDistance: null });
        replacing = true;
        flushSave();
      };
    },
    snapshot: () => {
      const { nodes, currentId, counter, symmetryMode, menagerie } = get();
      return { nodes, currentId, counter, symmetryMode, menagerie };
    },
    setGame: (patch) => {
      GAME = { ...GAME, ...patch };
      set({ game: GAME });
      persistSoon(get());
    },
    adopt: (genome) => commit(rootedAt(structuredClone(genome), get().symmetryMode, get().menagerie)),
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
        persistSoon(b);
        return { ...b, ...CLEAR_GAIT };
      }),

    selectNode: (id) =>
      set((state) => {
        if (!state.nodes[id]) return state;
        const b = batch(state.nodes, id, state.counter, state.symmetryMode, state.menagerie);
        persistSoon(b);
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
        persistSoon(b);
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
        persistSoon(b);
        return { ...b, ...CLEAR_GAIT };
      }),

    loadCell: (key) => {
      const entry = get().menagerie[key];
      if (entry) commit(rootedAt(entry.genome, get().symmetryMode, get().menagerie));
    },

    devLoad: (seed, morph, sym) => {
      const g = morph ? genomeOfMorphotype(seed >>> 0, morph) : randomGenome(seed >>> 0, sym);
      commit(rootedAt(g, sym, get().menagerie));
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
          persistSoon(b);
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
