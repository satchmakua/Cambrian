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
import type { Genome } from '../engine/genome';
import { genomeOfMorphotype, randomGenome } from '../engine/random';
import {
  createWorld, release, dayNumber, dayPhase, isNight, growthOf, speciesById, liveCount,
  type World, type Action, type HistorySample, type WorldEvent,
} from '../sim/world';
import type { Traits } from '../sim/traits';

let WORLD: World | null = null;
let VERSION = 0; // bumps whenever the set of live creatures/corpses changes shape (re-render actors)

export function getWorld(): World {
  if (!WORLD) WORLD = createWorld(1);
  return WORLD;
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
}

export interface Snapshot {
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
  snapshot: Snapshot | null;
  setRunning: (v: boolean) => void;
  setSpeed: (v: number) => void;
  select: (id: number | null) => void;
  setFollow: (v: boolean) => void;
  refresh: () => void;
  /** Start a new world from a seed, populated with a starter ecosystem (and optionally `founder`). */
  reset: (seed: number, founder?: Genome | null) => void;
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
  snapshot: null,
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
