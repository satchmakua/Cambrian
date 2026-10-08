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
import { loadWorld, saveWorld } from '../sim/persist';
import { weatherAt, weatherWord } from '../sim/weather';
import { adoptWorld, chronicle, snapshotForChronicle, type Chronicle } from '../sim/fastForward';
import type { Genome } from '../engine/genome';
import { genomeOfMorphotype, randomGenome } from '../engine/random';
import {
  AIRBORNE, createWorld, release, dayNumber, dayPhase, isNight, growthOf, speciesById, liveCount, seasonOf, type Season,
  type World, type Action, type HistorySample, type WorldEvent,
} from '../sim/world';
import type { Traits } from '../sim/traits';

let WORLD: World | null = null;
let FF_WORKER: Worker | null = null;
let VERSION = 0; // bumps whenever the set of live creatures/corpses changes shape (re-render actors)

export function getWorld(): World {
  if (!WORLD) WORLD = resumeWorld() ?? createWorld(1);
  return WORLD;
}

// --- persistence: the world is kept in the browser between visits, and can be saved to a file -----

const AUTOSAVE_KEY = 'cambrian.world';

/** The world left running last visit, if there is one (and it still loads). Dev pages opened with
 *  query parameters (the screenshot harness) always start fresh, so they stay reproducible. */
function resumeWorld(): World | null {
  if (import.meta.env.DEV && typeof location !== 'undefined' && location.search) return null;
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    return s ? loadWorld(s) : null;
  } catch {
    return null;
  }
}

/** Keep the current world in the browser (called periodically and when the page is hidden). */
export function autosave(): void {
  if (!WORLD || WORLD.creatures.length === 0) return;
  try {
    localStorage.setItem(AUTOSAVE_KEY, saveWorld(WORLD));
  } catch {
    // storage full or blocked — the world simply won't be there next visit
  }
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

export function populate(w: World, founder?: Genome | null): void {
  STARTER.forEach(([kind, n], i) => release(w, genomeOfMorphotype((w.seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
  if (founder) release(w, founder, 6);
}

function aboutOf(w: World, c: World['creatures'][number]): string | null {
  if (c.action === 'hunt' || c.action === 'flee' || c.action === 'mate') {
    const o = w.creatures.find((x) => x.id === c.target && x.alive);
    return o ? speciesById(w, o.species)?.name ?? null : null;
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

export const useWorldUi = create<WorldUi>((set, get) => ({
  running: true,
  speed: 1,
  selected: null,
  follow: false,
  emotes: true,
  sound: false,
  setSound: (sound) => {
    if (sound) SOUND.start();
    else SOUND.stop();
    set({ sound });
  },
  documentary: false,
  setDocumentary: (documentary) => set({ documentary, follow: documentary ? true : get().follow }),
  snapshot: null,
  setEmotes: (emotes) => set({ emotes }),
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed }),
  select: (selected) => set({ selected, follow: selected !== null ? get().follow : false, snapshot: snapshotOf(getWorld(), selected) }),
  setFollow: (follow) => set({ follow }),
  refresh: () => set({ snapshot: snapshotOf(getWorld(), get().selected) }),
  reset: (seed, founder) => {
    WORLD = createWorld(seed >>> 0);
    populate(WORLD, founder);
    bumpVersion();
    set({ selected: null, follow: false, snapshot: snapshotOf(WORLD, null) });
  },
  open: (json) => {
    WORLD = loadWorld(json);
    bumpVersion();
    set({ selected: null, follow: false, snapshot: snapshotOf(WORLD, null) });
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
    FF_WORKER = worker;
    const finish = () => {
      worker.terminate();
      FF_WORKER = null;
    };
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: string; f?: number; time?: number; pop?: number; species?: number; json?: string; message?: string };
      if (m.type === 'progress') {
        set({ ff: { f: m.f ?? 0, label: `Day ${dayNumber(m.time ?? 0)} · ${m.pop} alive · ${m.species} species` } });
      } else if (m.type === 'done' && m.json) {
        finish();
        const live = getWorld();
        adoptWorld(live, loadWorld(m.json));
        bumpVersion();
        const sel = get().selected;
        const keep = sel !== null && live.creatures.some((c) => c.id === sel) ? sel : null;
        set({
          ff: null,
          running: wasRunning,
          selected: keep,
          follow: keep !== null && get().follow,
          chronicle: { ...chronicle(before, live), span },
          snapshot: snapshotOf(live, keep),
        });
      } else if (m.type === 'error') {
        finish();
        set({ ff: null, running: wasRunning });
      }
    };
    worker.postMessage({ type: 'run', json: saveWorld(w), seconds });
  },
  stopFastForward: () => FF_WORKER?.postMessage({ type: 'stop' }),
  dismissChronicle: () => set({ chronicle: null }),
  releaseGenome: (g, count) => {
    release(getWorld(), g, count);
    bumpVersion();
    get().refresh();
  },
}));

/** A random visitor for the "release a stranger" button. */
export function strangerGenome(seed: number): Genome {
  return randomGenome(seed >>> 0);
}
