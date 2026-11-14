/**
 * The World session — one live ecosystem, outside React.
 *
 * The simulation (src/sim/world.ts) is a mutable, deterministic object stepped from the render loop;
 * it must not live in React state (it changes 20× a second). This module owns it and exposes a small
 * zustand store for what the HUD shows: transport (running / speed), the selected creature, and a
 * throttled SNAPSHOT (populations, tallies, recent events, the selected creature's needs) refreshed a
 * few times a second.
 */
import { create } from 'zustand';
import { SOUND } from './audio';
import { NARRATOR } from './narrator';
import { loadWorld, saveWorld } from '../sim/persist';
import { droughtOf, weatherAt, weatherWord } from '../sim/weather';
import { adoptWorld, chronicle, snapshotForChronicle, type Chronicle } from '../sim/fastForward';
import type { Genome } from '../engine/genome';
import { genomeOfMorphotype, randomGenome } from '../engine/random';
import {
  AIRBORNE, createWorld, release, dayNumber, dayPhase, isNight, growthOf, speciesById, liveCount, seasonOf, type Season,
  type World, type Action, type HistorySample, type WorldEvent,
} from '../sim/world';
import type { Traits } from '../sim/traits';
import { useSettings } from '../ui/settings';
import { DEFAULT_SETUP, type Ecosystem, type GameSetup } from '../ui/saves';

let WORLD: World | null = null;
/** the fast-forward in flight: its worker, and whether the valley was running when it began */
let FF: { worker: Worker; wasRunning: boolean } | null = null;
let VERSION = 0; // bumps whenever the set of live creatures/corpses changes shape (re-render actors)

export function getWorld(): World {
  if (!WORLD) WORLD = resumeWorld() ?? createWorld(SETUP.worldSeed);
  return WORLD;
}

// --- persistence: the world is kept in the browser between visits, and can be saved to a file -----

const AUTOSAVE_KEY = 'cambrian.world';
const SETUP_KEY = 'cambrian.world.setup';

/** Is this a dev page opened with query parameters (the screenshot harness)? Those start from the
 *  same fresh valley every time, whatever game the browser holds. */
function devFresh(): boolean {
  return import.meta.env.DEV && typeof location !== 'undefined' && !!location.search && !new URLSearchParams(location.search).has('resume');
}

function loadSetup(): GameSetup {
  if (devFresh()) return { ...DEFAULT_SETUP };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETUP_KEY) : null;
    const v = raw ? (JSON.parse(raw) as Partial<GameSetup>) : null;
    if (v && typeof v.worldSeed === 'number' && Number.isFinite(v.worldSeed)) {
      return { worldSeed: v.worldSeed >>> 0, ecosystem: v.ecosystem === 'sparse' || v.ecosystem === 'empty' ? v.ecosystem : 'standard' };
    }
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_SETUP };
}

/** The valley's set-up: its seed, and the cast it starts with (a game's choice, kept with it). */
let SETUP: GameSetup = loadSetup();

export function worldSetup(): GameSetup {
  return SETUP;
}

function keepSetup(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SETUP_KEY, JSON.stringify(SETUP));
  } catch {
    /* ignore */
  }
}

/** The world left running last visit, if there is one (and it still loads). Dev pages opened with
 *  query parameters (the screenshot harness) start fresh, so they stay reproducible — unless they
 *  ask to `resume`. */
function resumeWorld(): World | null {
  if (devFresh()) return null;
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    return s ? loadWorld(s) : null;
  } catch {
    return null;
  }
}

/** Keep the current world in the browser (called periodically and when the page is hidden). */
export function autosave(): void {
  // (a valley nobody has opened holds nothing to keep; one whose animals have all died does — it must
  // come back as it was left, not repopulated)
  if (!worldStarted()) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, saveWorld(WORLD!));
  } catch {
    // storage full or blocked — the world simply won't be there next visit
  }
}

/** Has the valley been opened (does it hold anything a save should keep)? */
function worldStarted(): boolean {
  return !!WORLD && (WORLD.creatures.length > 0 || WORLD.species.length > 0);
}

/** The valley as a save holds it: null where it was never opened (a save then keeps its set-up only).
 *  A world left in the browser by an earlier visit counts — it is read back first. */
export function worldForSave(): string | null {
  if (!WORLD) WORLD = resumeWorld();
  return worldStarted() ? saveWorld(WORLD!) : null;
}

/** Day, head-count and species of the valley, for a save's summary (null: never opened). */
export function worldSummary(): { day: number; population: number; species: number } | null {
  if (!WORLD) WORLD = resumeWorld();
  if (!worldStarted()) return null;
  const w = WORLD!;
  return { day: dayNumber(w.time), population: liveCount(w), species: w.species.filter((sp) => sp.alive > 0).length };
}

/**
 * Put a game's valley in place: the saved World where there is one, else a fresh, empty valley of
 * its set-up (populated on the first visit, with the creature then being bred). Throws — leaving
 * the current valley — if a saved World will not load.
 */
export function installWorld(setup: GameSetup, json: string | null): void {
  const next = json !== null ? loadWorld(json) : createWorld(setup.worldSeed >>> 0);
  abandonFastForward(); // (only now: a save that will not load leaves a run in progress alone)
  WORLD = next;
  SETUP = { ...setup };
  keepSetup();
  try {
    // (the last game's valley goes first: if the new one cannot be written — the browser's store is
    // full — Continue must not find the old game's valley beside the new game's lineage)
    localStorage.removeItem(AUTOSAVE_KEY);
    if (json !== null) localStorage.setItem(AUTOSAVE_KEY, json);
  } catch {
    /* storage full or blocked */
  }
  bumpVersion();
  // (the epoch remounts the World screen if it is the one showing: a valley not yet visited is
  // populated when the screen mounts, and a loaded one must not inherit the last one's camera or cast)
  useWorldUi.setState((u) => ({ epoch: u.epoch + 1, selected: null, follow: false, chronicle: null, running: true, snapshot: worldStarted() ? snapshotOf(next, null) : null }));
}

/**
 * Give up a fast-forward in flight, because the valley it set out from is being replaced (a game
 * loaded or started from the menu, a new or an opened world): its worker is stopped — what it was
 * computing belongs to a valley that is gone, and must never land on another — and the transport
 * goes back to what it was.
 */
function abandonFastForward(): void {
  if (!FF) return;
  FF.worker.terminate();
  const { wasRunning } = FF;
  FF = null;
  useWorldUi.setState({ ff: null, running: wasRunning });
}

/** Download the current world as a file. */
export function downloadWorld(): void {
  const w = getWorld();
  const blob = new Blob([saveWorld(w)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cambrian-world-${w.seed}-day${dayNumber(w.time)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function worldVersion(): number {
  return VERSION;
}
export function bumpVersion(): void {
  VERSION++;
}

export interface SpeciesRow {
  id: number;
  name: string;
  kind: string;
  hue: number;
  alive: number;
  born: number;
  extinct: boolean;
  diet: string;
}

export interface CreatureCard {
  id: number;
  species: string;
  speciesId: number;
  action: Action;
  energy: number; // 0..1
  health: number;
  fatigue: number;
  age: number; // fraction of lifespan
  adult: boolean;
  generation: number;
  children: number;
  kills: number;
  traits: Traits;
  genome: Genome;
  alive: boolean;
  flying: boolean; // on the wing right now
  /** the other party in what it is doing — the prey it hunts, what it flees, the carcass it eats */
  about: string | null;
  /** it has a clutch of eggs it is keeping near */
  nesting: boolean;
  /** it is going for another kind's eggs */
  raiding: boolean;
}

/** One species as a branch of the tree of life (every species ever, extinct ones included). */
export interface TreeNode {
  id: number;
  name: string;
  hue: number;
  parent: number | null;
  born: number; // sim time it was founded
  extinctAt: number | null;
  alive: number;
}

export interface Snapshot {
  tree: TreeNode[];
  season: Season;
  /** how dry this year is: 0 an ordinary year, 0.5 … 1 a drought */
  dry: number;
  /** '' when fair, else 'overcast' / 'rain' / 'downpour' / 'snow' / 'heavy snow' */
  weather: string;
  time: number;
  day: number;
  phase: number;
  night: boolean;
  pop: number;
  species: SpeciesRow[];
  tally: World['tally'];
  events: WorldEvent[];
  history: HistorySample[];
  selected: CreatureCard | null;
}

interface WorldUi {
  /** counts the valleys put in place (a new game, a loaded save): the World screen starts afresh on each */
  epoch: number;
  running: boolean;
  speed: number;
  selected: number | null;
  follow: boolean;
  /** mood icons over the creatures (asleep, courting, alarmed, hunting) */
  emotes: boolean;
  /** synthesized ambience and creature calls (starts on the user's click — browsers require it) */
  sound: boolean;
  setSound: (v: boolean) => void;
  /** the auto-director: the camera cuts between the most interesting things happening */
  documentary: boolean;
  setDocumentary: (v: boolean) => void;
  /** the documentary's captions read aloud (browser speech synthesis) */
  narration: boolean;
  setNarration: (v: boolean) => void;
  snapshot: Snapshot | null;
  setEmotes: (v: boolean) => void;
  setRunning: (v: boolean) => void;
  setSpeed: (v: number) => void;
  select: (id: number | null) => void;
  setFollow: (v: boolean) => void;
  refresh: () => void;
  /** Start a new world from a seed, populated with a starter ecosystem (and optionally `founder`). */
  reset: (seed: number, founder?: Genome | null) => void;
  /** Swap in a loaded world (from a saved file). Throws, leaving the current world, if it won't load. */
  open: (json: string) => void;
  /** a fast-forward in progress (run in a worker): how far through, and a line of news */
  ff: { f: number; label: string } | null;
  /** what happened over the last fast-forward (shown until dismissed) */
  chronicle: (Chronicle & { span: string }) | null;
  /** run the world on `seconds` of sim time in a worker, then show what happened */
  fastForward: (seconds: number, span: string) => void;
  stopFastForward: () => void;
  dismissChronicle: () => void;
  releaseGenome: (g: Genome, count: number) => void;
}

/** A starter ecosystem: grazers, browsers, a scavenger-omnivore or two, a predator and some fish. */
const STARTER: [string, number][] = [
  ['rodent', 8],
  ['ungulate', 6],
  ['insectoid', 6],
  ['bird', 6],
  ['fish', 7],
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

export function populate(w: World, founder?: Genome | null, ecosystem: Ecosystem = SETUP.ecosystem): void {
  starterCast(ecosystem).forEach(([kind, n], i) => release(w, genomeOfMorphotype((w.seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
  if (founder) release(w, founder, 6);
}

function aboutOf(w: World, c: World['creatures'][number]): string | null {
  if (c.action === 'hunt' || c.action === 'flee' || c.action === 'mate') {
    const o = w.creatures.find((x) => x.id === c.target && x.alive);
    return o ? speciesById(w, o.species)?.name ?? null : null;
  }
  if (c.action === 'scavenge') {
    const egg = w.eggs.find((x) => x.id === c.target);
    if (egg) return speciesById(w, egg.species)?.name ?? null;
  }
  if (c.action === 'eat' || c.action === 'scavenge') {
    const k = w.corpses.find((x) => x.id === c.target);
    return k ? speciesById(w, k.species)?.name ?? null : null;
  }
  return null;
}

export function snapshotOf(w: World, selected: number | null): Snapshot {
  const species: SpeciesRow[] = w.species
    .filter((s) => s.alive > 0 || (s.extinctAt !== null && w.time - s.extinctAt < 240))
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      hue: s.hue,
      alive: s.alive,
      born: s.born,
      extinct: s.extinctAt !== null,
      diet: '',
    }));
  for (const row of species) {
    const c = w.creatures.find((x) => x.species === row.id);
    if (c) row.diet = c.traits.diet;
  }
  species.sort((a, b) => b.alive - a.alive);
  let card: CreatureCard | null = null;
  if (selected !== null) {
    const c = w.creatures.find((x) => x.id === selected);
    if (c) {
      const g = growthOf(c);
      card = {
        id: c.id,
        species: speciesById(w, c.species)?.name ?? '?',
        speciesId: c.species,
        action: c.action,
        energy: c.energy / (c.traits.maxEnergy * g),
        health: c.health / (c.traits.maxHealth * g),
        fatigue: c.fatigue,
        age: c.age / (c.traits.lifespan * c.lifeFactor),
        adult: c.age > c.traits.maturity,
        flying: c.alt > AIRBORNE,
        about: aboutOf(w, c),
        nesting: w.eggs.some((e) => e.mother === c.id),
        raiding: c.action === 'scavenge' && w.eggs.some((e) => e.id === c.target),
        generation: c.generation,
        children: c.children,
        kills: c.kills,
        traits: c.traits,
        genome: c.genome,
        alive: c.alive,
      };
    }
  }
  return {
    tree: w.species.map((sp) => ({ id: sp.id, name: sp.name, hue: sp.hue, parent: sp.parent, born: sp.firstSeen, extinctAt: sp.extinctAt, alive: sp.alive })),
    season: seasonOf(w.time),
    dry: droughtOf(w.seed, w.time),
    weather: weatherWord(weatherAt(w.seed, w.time)),
    time: w.time,
    day: dayNumber(w.time),
    phase: dayPhase(w.time),
    night: isNight(w.time),
    pop: liveCount(w),
    species,
    tally: { ...w.tally },
    events: w.events.slice(-40),
    history: w.history,
    selected: card,
  };
}

// The World's sound only plays while its scene is on screen (the scene says when); the options that
// outlive a visit — sound, the voice, the mood icons — are settings, kept between sessions.
let SCENE_LIVE = false;
export function worldSceneLive(live: boolean): void {
  SCENE_LIVE = live;
  if (live && useWorldUi.getState().sound) SOUND.start();
  if (!live) SOUND.stop();
}

export const useWorldUi = create<WorldUi>((set, get) => ({
  epoch: 0,
  running: true,
  speed: 1,
  selected: null,
  follow: false,
  emotes: useSettings.getState().gameplay.moods,
  sound: useSettings.getState().audio.sound,
  setSound: (sound) => {
    if (sound && SCENE_LIVE) SOUND.start();
    else if (!sound) SOUND.stop();
    if (useSettings.getState().audio.sound !== sound) useSettings.getState().setAudio({ sound });
    set({ sound });
  },
  documentary: false,
  setDocumentary: (documentary) => {
    if (!documentary) NARRATOR.setOn(false);
    else NARRATOR.setOn(get().narration);
    set({ documentary, follow: documentary ? true : get().follow });
  },
  narration: useSettings.getState().audio.narration,
  setNarration: (narration) => {
    NARRATOR.setOn(narration && get().documentary);
    if (useSettings.getState().audio.narration !== narration) useSettings.getState().setAudio({ narration });
    set({ narration });
  },
  snapshot: null,
  setEmotes: (emotes) => {
    if (useSettings.getState().gameplay.moods !== emotes) useSettings.getState().setGameplay({ moods: emotes });
    set({ emotes });
  },
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed }),
  select: (selected) => set({ selected, follow: selected !== null ? get().follow : false, snapshot: snapshotOf(getWorld(), selected) }),
  setFollow: (follow) => set({ follow }),
  refresh: () => set({ snapshot: snapshotOf(getWorld(), get().selected) }),
  reset: (seed, founder) => {
    abandonFastForward();
    WORLD = createWorld(seed >>> 0);
    // (a new world from the World screen keeps the game's cast but takes the new seed as its own)
    SETUP = { ...SETUP, worldSeed: seed >>> 0 };
    keepSetup();
    populate(WORLD, founder);
    bumpVersion();
    set({ selected: null, follow: false, chronicle: null, snapshot: snapshotOf(WORLD, null) });
  },
  open: (json) => {
    const next = loadWorld(json); // (throws, with nothing changed, if it will not load)
    abandonFastForward();
    WORLD = next;
    bumpVersion();
    set({ selected: null, follow: false, chronicle: null, snapshot: snapshotOf(WORLD, null) });
  },
  ff: null,
  chronicle: null,
  fastForward: (seconds, span) => {
    if (get().ff) return;
    const w = getWorld();
    const before = snapshotForChronicle(w);
    const wasRunning = get().running;
    set({ ff: { f: 0, label: '' }, running: false, chronicle: null });
    const worker = new Worker(new URL('./ffWorker.ts', import.meta.url), { type: 'module' });
    FF = { worker, wasRunning };
    /** The run is over (done, failed or refused): stop the worker and hand the valley back. */
    const end = (patch: Partial<WorldUi> = {}) => {
      worker.terminate();
      FF = null;
      set({ ff: null, running: wasRunning, ...patch });
    };
    worker.onmessage = (e: MessageEvent) => {
      // (a run that was abandoned — or one whose valley is no longer the live one — has nothing to say)
      if (FF?.worker !== worker) return;
      const m = e.data as { type: string; f?: number; time?: number; pop?: number; species?: number; json?: string; message?: string };
      if (m.type === 'progress') {
        set({ ff: { f: m.f ?? 0, label: `Day ${dayNumber(m.time ?? 0)} · ${m.pop} alive · ${m.species} species` } });
      } else if (m.type === 'done' && m.json) {
        if (WORLD !== w) return end();
        try {
          adoptWorld(w, loadWorld(m.json));
        } catch {
          return end(); // (a result that will not read back: the valley stays as it was)
        }
        bumpVersion();
        const sel = get().selected;
        const keep = sel !== null && w.creatures.some((c) => c.id === sel) ? sel : null;
        end({ selected: keep, follow: keep !== null && get().follow, chronicle: { ...chronicle(before, w), span }, snapshot: snapshotOf(w, keep) });
      } else if (m.type === 'error' || m.type === 'done') {
        end();
      }
    };
    // (a worker that cannot start or dies — a script that fails to load — must not leave the valley
    // stopped behind "Time passes…" for good)
    worker.onerror = () => {
      if (FF?.worker === worker) end();
    };
    worker.postMessage({ type: 'run', json: saveWorld(w), seconds });
  },
  stopFastForward: () => FF?.worker.postMessage({ type: 'stop' }),
  dismissChronicle: () => set({ chronicle: null }),
  releaseGenome: (g, count) => {
    release(getWorld(), g, count);
    bumpVersion();
    get().refresh();
  },
}));

// the options screen changes these too: follow the settings (volume straight to the mixers)
SOUND.setVolume(useSettings.getState().audio.volume);
NARRATOR.setVolume(useSettings.getState().audio.volume);
useSettings.subscribe((s) => {
  SOUND.setVolume(s.audio.volume);
  NARRATOR.setVolume(s.audio.volume);
  const ui = useWorldUi.getState();
  if (ui.sound !== s.audio.sound) ui.setSound(s.audio.sound);
  if (ui.narration !== s.audio.narration) ui.setNarration(s.audio.narration);
  if (ui.emotes !== s.gameplay.moods) ui.setEmotes(s.gameplay.moods);
});

/** A random visitor for the "release a stranger" button. */
export function strangerGenome(seed: number): Genome {
  return randomGenome(seed >>> 0);
}
