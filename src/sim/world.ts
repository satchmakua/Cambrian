/**
 * The World — a deterministic ecosystem the evolved creatures live, eat, sleep, breed and die in.
 *
 * Every creature is a grown genome with traits read off its anatomy (traits.ts). Each one carries
 * needs — energy (hunger), fatigue (sleep), health, age — and every half-second or so chooses what to
 * do from them and from what it can see:
 *
 *   flee    a predator is in sight                     (overrides everything, wakes a sleeper)
 *   sleep   tired, and it's its night (diurnal) or day (nocturnal)
 *   eat     hungry — graze the meadow, pick fruit, filter algae, scavenge a corpse, or HUNT
 *   breed   well-fed adult with a willing mate of its species nearby (some kinds bud alone)
 *   wander  otherwise — drifting, herd animals keeping close to their own kind
 *
 * Breeding copies the parent's genome — and with some probability MUTATES it with the breeder's own
 * operators. When a lineage drifts far enough in morphospace from its species' founder, it is a new
 * species. So natural selection, drift and speciation happen on screen, on the same bodies you breed.
 *
 * The plants are a grass biomass field over the meadows and woods, algae in the lake, and fruit
 * bushes in the woods; carcasses rot. Determinism: all randomness flows from the world's seeded
 * mulberry32 and the engine's seeded mutate(); a fixed step reproduces a run exactly (Pillar 3).
 */
import { mulberry32State, mix32, type StatefulRng } from '../engine/rng';
import { weatherAt } from './weather';
import { grow, type Phenotype } from '../engine/grow';
import type { Genome } from '../engine/genome';
import { mutate, type MutationRates } from '../engine/mutate';
import { describe as describeMorph, distance as morphDistance, coherence } from '../engine/morphospace';
import { traitsOf, type Traits } from './traits';
import { makeTerrain, heightAt, biomeAt, inBounds, WATER_LEVEL, type Terrain } from './terrain';

// --- tunables -----------------------------------------------------------------------------------

export const STEP = 1 / 20; // fixed simulation step (s)
export const DAY_LENGTH = 240; // seconds of sim time per day/night cycle
const DECIDE_EVERY = 0.6; // s between deliberations (staggered per creature)
const GRID_CELL = 4; // grass / algae field resolution (bu)
const GRASS_ENERGY = 26; // energy per unit of grass biomass
const ALGAE_ENERGY = 20;
const FRUIT_ENERGY = 14;
const MEAT_ENERGY = 1; // corpses store energy directly
const GRASS_REGROW = 0.0032; // logistic rate (/s)
const FRUIT_REGROW = 0.028; // fruit per second per bush
const CORPSE_LIFE = 120; // s before a carcass is gone
/** The hard population cap (a rendering budget, not an ecological limit). */
export const MAX_POP = 165;
/** Above this, only RARE species (fewer than RARE alive) may still breed — so a minority lineage
 *  (a lake of fish, a pair of hunters) is never locked out of reproduction by a crowded world. */
const SOFT_POP = 135;
const RARE = 10;
/** No one species may hold more than this share of the soft cap. */
const SPECIES_SHARE = 0.3;
/** each guild's share of the soft cap (they sum past 1: a guild that is absent leaves room to others,
 *  and MAX_POP is the hard ceiling) */
const GUILD_SHARE = { water: 0.28, hunter: 0.16, grazer: 0.7 } as const;
type Guild = keyof typeof GUILD_SHARE;
function guildOf(c: Creature): Guild {
  if (c.traits.habitat === 'water') return 'water';
  return c.traits.diet === 'carnivore' ? 'hunter' : 'grazer';
}
const SPECIATION_DIST = 0.32; // morphospace distance from the species founder that founds a new one
const WORLD_MUTATION: MutationRates = { point: 0.22, pointSigma: 0.05, structural: 0.05, duplication: 0.02, macro: 0.0 };
const MUTATION_CHANCE = 0.3; // per offspring
const SPATIAL = 10; // spatial-hash cell (bu)
const SCENT = 2.6; // hungry hunters smell prey this many vision-radii away
/** seconds a pair circle each other in display before they mate */
export const COURT_TIME = 4;
/** above this altitude (bu) a flier is airborne: out of a walker's reach, free of the ground's rules */
export const AIRBORNE = 0.45;
const CLIMB = 2.6; // bu/s up
const SINK = 3.4; // bu/s down (a stooping hunter drops twice as fast)

/** Feeding rate while eating, in energy/s as a multiple of the eater's resting metabolism — a
 *  specialist eats its food fast (it can top up in a fraction of its day), a generalist slowly. */
const INTAKE: Record<string, Partial<Record<'grass' | 'algae' | 'fruit' | 'meat', number>>> = {
  herbivore: { grass: 4.5, fruit: 4 },
  omnivore: { grass: 1.7, algae: 2.6, fruit: 4, meat: 3.5 },
  carnivore: { meat: 7 },
  filter: { algae: 5.5 },
  nectar: { fruit: 6 },
};

// --- types --------------------------------------------------------------------------------------

export type Action = 'wander' | 'graze' | 'forage' | 'scavenge' | 'filter' | 'hunt' | 'flee' | 'sleep' | 'mate' | 'eat';
export type DeathCause = 'starvation' | 'predation' | 'old age';

export interface Species {
  id: number;
  name: string;
  kind: string; // nearest morphotype attractor
  founder: Genome;
  descriptor: number[];
  hue: number; // UI colour
  parent: number | null;
  firstSeen: number;
  extinctAt: number | null;
  alive: number;
  born: number;
  deaths: number;
}

export interface Creature {
  id: number;
  species: number;
  genome: Genome;
  traits: Traits;
  x: number;
  z: number;
  y: number; // ground height under it (kept fresh for the viewer)
  heading: number; // radians; 0 faces +Z, π/2 faces +X
  speed: number; // current ground speed (bu/s)
  energy: number;
  health: number;
  fatigue: number; // 0 rested … 1 exhausted
  age: number;
  lifeFactor: number; // individual lifespan multiplier
  action: Action;
  target: number; // creature / plant / corpse id, or grid cell index, by action
  tx: number;
  tz: number;
  decideIn: number;
  breedCooldown: number;
  generation: number;
  parent: number | null;
  children: number;
  kills: number;
  alive: boolean;
  attacker: number; // last creature to bite it (-1 none)
  attackedAt: number;
  /** sim time of its last bite (the viewer's lunge) */
  bitAt: number;
  wanderSeed: number;
  /** height above the ground (or the water) it is flying at — 0 on its feet */
  alt: number;
  /** a flier's wish to be airborne this step (set by the current action; landing is gradual) */
  fly: boolean;
  /** seconds of courtship display danced with the current partner (0 when not courting) */
  courtT: number;
  /** seconds into the current pounce (a hunter's all-out sprint); a hopeless chase is given up */
  chaseT: number;
}

export interface Plant {
  id: number;
  x: number;
  z: number;
  fruit: number;
  max: number;
  size: number; // visual size
}

export interface Corpse {
  id: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  meat: number;
  maxMeat: number;
  rot: number; // seconds left
  genome: Genome;
  growth: number;
  species: number;
}

export interface WorldEvent {
  t: number;
  kind: 'birth' | 'death' | 'speciation' | 'extinction' | 'release' | 'kill' | 'mutation';
  text: string;
  species?: number;
  creature?: number;
}

export interface HistorySample {
  t: number;
  pops: Record<number, number>;
  grass: number;
}

export interface World {
  seed: number;
  /** the world's one random stream (its state is saved with the world) */
  rng: StatefulRng;
  time: number;
  terrain: Terrain;
  gridN: number;
  grass: Float32Array; // biomass per cell (0..cap)
  grassCap: Float32Array; // carrying capacity per cell
  algae: Float32Array;
  algaeCap: Float32Array;
  plants: Plant[];
  creatures: Creature[];
  corpses: Corpse[];
  species: Species[];
  nextId: number;
  events: WorldEvent[];
  history: HistorySample[];
  historyTimer: number;
  fieldTimer: number;
  stepCount: number;
  /** cumulative tallies since the world began */
  tally: { births: number; kills: number; starvation: number; oldAge: number; mutations: number; speciations: number };
  /** spatial hash of live creatures, rebuilt each step */
  buckets: Map<number, Creature[]>;
}

// --- body cache: grow + traits once per genome object --------------------------------------------

const BODY = new WeakMap<Genome, { phenotype: Phenotype; traits: Traits }>();
export function bodyOf(genome: Genome): { phenotype: Phenotype; traits: Traits } {
  let b = BODY.get(genome);
  if (!b) {
    const phenotype = grow(genome);
    b = { phenotype, traits: traitsOf(phenotype) };
    BODY.set(genome, b);
  }
  return b;
}

/** 0 at dawn … 0.25 noon … 0.5 dusk … 0.75 midnight. */
export function dayPhase(time: number): number {
  return ((time / DAY_LENGTH) % 1 + 1) % 1;
}
export function isNight(time: number): boolean {
  const p = dayPhase(time);
  return p > 0.52 && p < 0.98;
}
export function dayNumber(time: number): number {
  return Math.floor(time / DAY_LENGTH) + 1;
}

// --- seasons ----------------------------------------------------------------------------------------
/** Days in a year: three per season. */
export const YEAR_DAYS = 12;
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** 0..1 through the year (0 = the first morning of spring). */
export function yearPhase(time: number): number {
  return ((time / (DAY_LENGTH * YEAR_DAYS)) % 1 + 1) % 1;
}
export function seasonOf(time: number): Season {
  return SEASONS[Math.floor(yearPhase(time) * 4) % 4];
}
/** Smooth cyclic interpolation of one value per season (keyed at each season's middle). */
export function seasonal(time: number, v: readonly [number, number, number, number]): number {
  const x = yearPhase(time) * 4 - 0.5; // season centres at integers
  const i = Math.floor(x);
  const f = x - i;
  const a = v[((i % 4) + 4) % 4], b = v[(((i + 1) % 4) + 4) % 4];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
/** The climate right now: how fast grass and fruit come back, and how cold it is (0 mild … 1 hard frost). */
export function climate(time: number): { grass: number; fruit: number; cold: number } {
  return {
    grass: seasonal(time, [1.45, 1.05, 0.78, 0.45]),
    fruit: seasonal(time, [0.6, 1.3, 1.55, 0.3]),
    cold: seasonal(time, [0.25, 0, 0.35, 1]),
  };
}

/** Adult fraction of full size (newborns are ~40%; grown by maturity). */
export function growthOf(c: Creature): number {
  return 0.4 + 0.6 * Math.min(1, c.age / Math.max(1, c.traits.maturity));
}

// --- construction --------------------------------------------------------------------------------

export function createWorld(seed: number): World {
  const terrain = makeTerrain(seed);
  const rng = mulberry32State(mix32(seed, 0x3c0105));
  const gridN = Math.ceil(terrain.size / GRID_CELL);
  const grass = new Float32Array(gridN * gridN);
  const grassCap = new Float32Array(gridN * gridN);
  const algae = new Float32Array(gridN * gridN);
  const algaeCap = new Float32Array(gridN * gridN);
  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      const x = -terrain.size / 2 + (i + 0.5) * GRID_CELL;
      const z = -terrain.size / 2 + (j + 0.5) * GRID_CELL;
      const b = biomeAt(terrain, x, z);
      const k = j * gridN + i;
      grassCap[k] = b === 'meadow' ? 0.6 : b === 'wood' ? 0.32 : b === 'sand' ? 0.05 : 0;
      algaeCap[k] = b === 'shallow' ? 1 : b === 'deep' ? 0.55 : 0;
      grass[k] = grassCap[k] * (0.6 + 0.4 * rng());
      algae[k] = algaeCap[k] * (0.6 + 0.4 * rng());
    }
  }
  const world: World = {
    seed,
    rng,
    time: DAY_LENGTH * 0.08, // start just after dawn
    terrain,
    gridN,
    grass,
    grassCap,
    algae,
    algaeCap,
    plants: [],
    creatures: [],
    corpses: [],
    species: [],
    nextId: 1,
    events: [],
    history: [],
    historyTimer: 0,
    fieldTimer: 0,
    stepCount: 0,
    tally: { births: 0, kills: 0, starvation: 0, oldAge: 0, mutations: 0, speciations: 0 },
    buckets: new Map(),
  };
  // fruit bushes: dense in the woods, scattered across the meadows
  let tries = 0;
  while (world.plants.length < 170 && tries++ < 8000) {
    const x = (rng() - 0.5) * terrain.size * 0.94;
    const z = (rng() - 0.5) * terrain.size * 0.94;
    const b = biomeAt(terrain, x, z);
    if (b !== 'wood' && !(b === 'meadow' && rng() < 0.25)) continue;
    const max = 3 + Math.floor(rng() * 5);
    world.plants.push({ id: world.nextId++, x, z, fruit: max * rng(), max, size: 0.8 + rng() * 0.9 });
  }
  return world;
}

/** Find a spawn point suited to a habitat, near (cx, cz) if given. */
function spawnPoint(w: World, t: Traits, cx?: number, cz?: number, spread = 14): { x: number; z: number } {
  for (let i = 0; i < 400; i++) {
    const far = cx === undefined || i > 200;
    const x = far ? (w.rng() - 0.5) * w.terrain.size * 0.85 : (cx as number) + (w.rng() - 0.5) * spread;
    const z = far ? (w.rng() - 0.5) * w.terrain.size * 0.85 : (cz as number) + (w.rng() - 0.5) * spread;
    if (!inBounds(w.terrain, x, z, 8)) continue;
    if (canStand(w, t, x, z)) return { x, z };
  }
  return { x: w.terrain.lakeX, z: w.terrain.lakeZ + w.terrain.lakeR * 1.3 };
}

function canStand(w: World, t: Traits, x: number, z: number): boolean {
  const h = heightAt(w.terrain, x, z);
  if (t.habitat === 'water') return h < WATER_LEVEL - 0.3;
  if (t.habitat === 'land') return h > WATER_LEVEL - 0.5;
  return true;
}

function speciesFor(w: World, genome: Genome, parent: number | null, label?: string): Species {
  const { phenotype } = bodyOf(genome);
  // a known label (the morphotype it was released as, or its parent species' kind) beats the
  // morphospace classifier's guess, which can mislabel close basins (an ungulate read as a canid)
  const kind = label ?? (parent !== null ? speciesById(w, parent)?.kind : undefined) ?? coherence(phenotype).nearest;
  const sameKind = w.species.filter((s) => s.kind === kind).length;
  const sp: Species = {
    id: w.nextId++,
    name: `${kind} ${GREEK[sameKind % GREEK.length]}${sameKind >= GREEK.length ? Math.floor(sameKind / GREEK.length) + 1 : ''}`,
    kind,
    founder: genome,
    descriptor: describeMorph(phenotype),
    hue: genome.palette.hueA,
    parent,
    firstSeen: w.time,
    extinctAt: null,
    alive: 0,
    born: 0,
    deaths: 0,
  };
  w.species.push(sp);
  return sp;
}
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ'];

function spawn(w: World, genome: Genome, species: Species, x: number, z: number, adult: boolean, parent: Creature | null): Creature {
  const { traits } = bodyOf(genome);
  const c: Creature = {
    id: w.nextId++,
    species: species.id,
    genome,
    traits,
    x,
    z,
    y: Math.max(heightAt(w.terrain, x, z), WATER_LEVEL - 10),
    heading: w.rng() * Math.PI * 2,
    speed: 0,
    energy: traits.maxEnergy * (adult ? 0.85 : 0.5),
    health: traits.maxHealth,
    fatigue: w.rng() * 0.3,
    age: adult ? traits.maturity * (1 + w.rng()) : 0,
    lifeFactor: 0.85 + w.rng() * 0.3,
    action: 'wander',
    target: -1,
    tx: x,
    tz: z,
    decideIn: w.rng() * DECIDE_EVERY,
    breedCooldown: adult ? traits.lifespan * 0.03 * w.rng() : traits.maturity,
    generation: parent ? parent.generation + 1 : 0,
    parent: parent ? parent.id : null,
    children: 0,
    kills: 0,
    alive: true,
    attacker: -1,
    attackedAt: -1e9,
    bitAt: -1e9,
    wanderSeed: w.rng() * 1000,
    alt: 0,
    fly: false,
    courtT: 0,
    chaseT: 0,
  };
  w.creatures.push(c);
  species.alive++;
  species.born++;
  return c;
}

/** Release `count` adults of a genome into the world (a new species unless one has this founder). */
export function release(w: World, genome: Genome, count: number, near?: { x: number; z: number }, label?: string): Creature[] {
  const { traits } = bodyOf(genome);
  let sp = w.species.find((s) => s.founder === genome && s.extinctAt === null);
  if (!sp) sp = speciesFor(w, genome, null, label);
  const base = near ?? spawnPoint(w, traits);
  const out: Creature[] = [];
  for (let i = 0; i < count && liveCount(w) < MAX_POP; i++) {
    const p = spawnPoint(w, traits, base.x, base.z, 18);
    out.push(spawn(w, genome, sp, p.x, p.z, true, null));
  }
  log(w, 'release', `${count} ${sp.name} released`, sp.id);
  return out;
}

export function liveCount(w: World): number {
  let n = 0;
  for (const c of w.creatures) if (c.alive) n++;
  return n;
}

function log(w: World, kind: WorldEvent['kind'], text: string, species?: number, creature?: number): void {
  w.events.push({ t: w.time, kind, text, species, creature });
  if (w.events.length > 160) w.events.splice(0, w.events.length - 160);
}

export function speciesById(w: World, id: number): Species | undefined {
  return w.species.find((s) => s.id === id);
}

// --- the step ------------------------------------------------------------------------------------

export function stepWorld(w: World, dt = STEP): void {
  const day = Math.floor(w.time / DAY_LENGTH);
  w.time += dt;
  w.stepCount++;
  if (Math.floor(w.time / DAY_LENGTH) !== day) immigrate(w);
  rebuildBuckets(w);
  for (const c of w.creatures) if (c.alive) live(w, c, dt);
  // the dead are kept one step for the viewer's fade, then culled
  w.creatures = w.creatures.filter((c) => c.alive);
  // carcasses rot
  for (const k of w.corpses) k.rot -= dt;
  w.corpses = w.corpses.filter((k) => k.rot > 0 && k.meat > 0.5);
  // plants grow (the fields are slow — update them once a second)
  w.fieldTimer += dt;
  if (w.fieldTimer >= 1) {
    growFields(w, w.fieldTimer);
    w.fieldTimer = 0;
  }
  // a population sample every 5 s
  w.historyTimer += dt;
  if (w.historyTimer >= 5) {
    w.historyTimer = 0;
    sampleHistory(w);
  }
}

function growFields(w: World, dt: number): void {
  const { grass, grassCap, algae, algaeCap } = w;
  const cl = climate(w.time);
  // a shower brings the grass on (snow doesn't)
  const sky = weatherAt(w.seed, w.time);
  const wet = 1 + (sky.snow ? 0 : 0.8 * sky.rain);
  for (let k = 0; k < grass.length; k++) {
    const K = grassCap[k];
    if (K > 0) {
      const b = grass[k];
      grass[k] = Math.min(K, b + (GRASS_REGROW * b * (1 - b / K) + 0.0004 * K) * cl.grass * wet * dt);
    }
    const A = algaeCap[k];
    if (A > 0) {
      const a = algae[k];
      algae[k] = Math.min(A, a + (GRASS_REGROW * 3 * a * (1 - a / A) + 0.001 * A) * dt);
    }
  }
  for (const p of w.plants) p.fruit = Math.min(p.max, p.fruit + FRUIT_REGROW * cl.fruit * dt);
}

function sampleHistory(w: World): void {
  const pops: Record<number, number> = {};
  for (const c of w.creatures) if (c.alive) pops[c.species] = (pops[c.species] ?? 0) + 1;
  let g = 0;
  for (let k = 0; k < w.grass.length; k++) g += w.grass[k];
  w.history.push({ t: w.time, pops, grass: g });
  if (w.history.length > 720) w.history.splice(0, w.history.length - 720);
}

function rebuildBuckets(w: World): void {
  w.buckets.clear();
  for (const c of w.creatures) {
    if (!c.alive) continue;
    const key = bucketKey(c.x, c.z);
    let b = w.buckets.get(key);
    if (!b) w.buckets.set(key, (b = []));
    b.push(c);
  }
}
function bucketKey(x: number, z: number): number {
  return (Math.floor(x / SPATIAL) + 1000) * 4096 + (Math.floor(z / SPATIAL) + 1000);
}
/** Live creatures within `r` of (x, z). */
export function nearby(w: World, x: number, z: number, r: number, out: Creature[] = []): Creature[] {
  out.length = 0;
  const i0 = Math.floor((x - r) / SPATIAL), i1 = Math.floor((x + r) / SPATIAL);
  const j0 = Math.floor((z - r) / SPATIAL), j1 = Math.floor((z + r) / SPATIAL);
  const r2 = r * r;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const b = w.buckets.get((i + 1000) * 4096 + (j + 1000));
      if (!b) continue;
      for (const c of b) {
        const dx = c.x - x, dz = c.z - z;
        if (dx * dx + dz * dz <= r2) out.push(c);
      }
    }
  }
  return out;
}
const NEAR: Creature[] = [];
const FEEDING = new Set<Action>(['graze', 'filter', 'forage', 'scavenge', 'eat', 'hunt']);
const SCENT_BUF: Creature[] = [];

function cellOf(w: World, x: number, z: number): number {
  const i = Math.min(w.gridN - 1, Math.max(0, Math.floor((x + w.terrain.size / 2) / GRID_CELL)));
  const j = Math.min(w.gridN - 1, Math.max(0, Math.floor((z + w.terrain.size / 2) / GRID_CELL)));
  return j * w.gridN + i;
}
function cellCenter(w: World, k: number): { x: number; z: number } {
  const i = k % w.gridN, j = Math.floor(k / w.gridN);
  return { x: -w.terrain.size / 2 + (i + 0.5) * GRID_CELL, z: -w.terrain.size / 2 + (j + 0.5) * GRID_CELL };
}

// --- predator/prey relations -----------------------------------------------------------------------

/** Would `a` hunt `b`? Carnivores take anything they can overpower; omnivores only small prey. */
export function preysOn(a: Creature, b: Creature): boolean {
  if (a.species === b.species || !b.alive) return false;
  const ta = a.traits, tb = b.traits;
  if (ta.diet !== 'carnivore' && ta.diet !== 'omnivore') return false;
  // can it reach it? land hunters don't chase into deep water and vice versa
  if (ta.habitat === 'water' && tb.habitat === 'land') return false;
  if (ta.habitat === 'land' && tb.habitat === 'water') return false;
  const ma = ta.mass * growthOf(a) ** 3, mb = tb.mass * growthOf(b) ** 3;
  const limit = ta.diet === 'carnivore' ? 1.6 : 0.45;
  if (mb > ma * limit) return false;
  // too well armed / armoured to be worth it?
  const threat = tb.attack * (1 - ta.defense) / Math.max(1, ta.maxHealth);
  return threat < 0.12;
}

// --- one creature's life, one step ---------------------------------------------------------------

function live(w: World, c: Creature, dt: number): void {
  const t = c.traits;
  c.age += dt;
  c.breedCooldown -= dt;
  const growth = growthOf(c);
  const asleep = c.action === 'sleep';

  // metabolism: resting burn + the cost of moving fast; sleep is cheap
  // flapping flight is dear: a flat surcharge while aloft (instead of the speed² running cost, which
  // an airspeed above sprint would make ruinous) and it tires faster
  const aloft = c.alt > AIRBORNE;
  const moveCost = aloft ? t.metabolism * 0.8 : t.metabolism * 1.6 * (c.speed / Math.max(0.1, t.sprint)) ** 2;
  // the warm-blooded burn more to keep warm through a hard winter
  const warmth = t.endotherm ? 1 + 0.14 * climate(w.time).cold : 1;
  c.energy -= (t.metabolism * warmth * (asleep ? 0.55 : 1) * growth ** 2 + moveCost) * dt;
  c.fatigue = Math.min(1, Math.max(0, c.fatigue + (asleep ? -dt / (DAY_LENGTH * 0.22) : (aloft ? 1.4 : 1) * dt / (DAY_LENGTH * 0.62))));
  if (c.energy <= 0) {
    c.energy = 0;
    c.health -= t.maxHealth * 0.04 * dt; // starving
  } else if (c.energy > t.maxEnergy * 0.3) {
    c.health = Math.min(t.maxHealth * growth, c.health + t.maxHealth * 0.006 * dt);
  }
  c.energy = Math.min(c.energy, t.maxEnergy * growth);

  if (c.health <= 0) return die(w, c, c.energy <= 0 ? 'starvation' : 'predation');
  if (c.age > t.lifespan * c.lifeFactor) return die(w, c, 'old age');

  c.decideIn -= dt;
  if (c.decideIn <= 0) {
    c.decideIn = DECIDE_EVERY * (0.8 + 0.4 * w.rng());
    decide(w, c);
  }
  act(w, c, dt);
  c.y = heightAt(w.terrain, c.x, c.z);
}

function die(w: World, c: Creature, cause: DeathCause): void {
  c.alive = false;
  const sp = speciesById(w, c.species);
  const g = growthOf(c);
  w.corpses.push({
    id: w.nextId++,
    x: c.x,
    z: c.z,
    y: c.y,
    heading: c.heading,
    meat: (c.traits.maxEnergy * 0.8 + 30) * g * g,
    maxMeat: (c.traits.maxEnergy * 0.8 + 30) * g * g,
    rot: CORPSE_LIFE,
    genome: c.genome,
    growth: g,
    species: c.species,
  });
  if (sp) {
    sp.alive--;
    sp.deaths++;
    if (cause !== 'predation') log(w, 'death', `a ${sp.name} died of ${cause}`, sp.id, c.id);
  }
  if (cause === 'starvation') w.tally.starvation++;
  else if (cause === 'old age') w.tally.oldAge++;
  else w.tally.kills++;
  if (sp) {
    if (sp.alive <= 0 && sp.extinctAt === null) {
      sp.extinctAt = w.time;
      log(w, 'extinction', `${sp.name} went extinct`, sp.id);
    }
  }
}

function decide(w: World, c: Creature): void {
  const t = c.traits;
  const asleep = c.action === 'sleep';
  const sight = t.vision * (asleep ? 0.35 : 1) * (isNight(w.time) && !t.nocturnal ? 0.6 : 1);
  const near = nearby(w, c.x, c.z, sight, NEAR);

  // 1. danger — the nearest thing that hunts us (or just bit us)
  let threat: Creature | null = null;
  let threatD = Infinity;
  for (const o of near) {
    if (o === c) continue;
    const bitUs = o.id === c.attacker && w.time - c.attackedAt < 4;
    if (!bitUs && !preysOn(o, c)) continue;
    if (c.alt > AIRBORNE * 3 && !o.traits.flies) continue; // safe on the wing from anything that walks
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    // flight distance: a hunter charging is seen at once; one merely about is watched and only fled
    // when it comes close; a stalker creeping in low goes unnoticed until it is nearly on top of you
    if (!bitUs) {
      const charging = o.action === 'hunt' && o.chaseT > 0;
      const stalking = o.action === 'hunt' && !charging;
      if (!charging && d > sight * (stalking ? 0.42 : 0.72)) continue;
    }
    if (d < threatD) {
      threatD = d;
      threat = o;
    }
  }
  // an alarm runs through a herd: kin bolting from a hunter set the rest running from it too, before
  // they've seen it themselves (and wake the sleepers)
  let alarmed = false;
  if (!threat && t.herding > 0.3) {
    for (const o of near) {
      // only close kin carry the alarm, and only about a hunter that is close enough to matter
      if (o === c || o.species !== c.species || o.action !== 'flee') continue;
      if (Math.hypot(o.x - c.x, o.z - c.z) > 9) continue;
      const th = w.creatures.find((x) => x.id === o.target && x.alive);
      if (!th || (c.alt > AIRBORNE * 3 && !th.traits.flies)) continue;
      const d = Math.hypot(th.x - c.x, th.z - c.z);
      if (d > t.vision * 0.8) continue;
      threat = th;
      threatD = d;
      alarmed = true;
      break;
    }
  }
  // the young bolt when their parent does (they follow it through the escape, not just a stroll)
  if (!threat && c.age < t.maturity && c.parent !== null) {
    const mum = w.creatures.find((o) => o.id === c.parent && o.alive);
    if (mum && mum.action === 'flee' && Math.hypot(mum.x - c.x, mum.z - c.z) < 20) {
      const th = w.creatures.find((x) => x.id === mum.target && x.alive);
      if (th) {
        threat = th;
        threatD = Math.hypot(th.x - c.x, th.z - c.z);
        alarmed = true;
      }
    }
  }
  if (threat && (!asleep || threatD < sight || alarmed)) {
    c.action = 'flee';
    c.target = threat.id;
    return;
  }

  // hysteresis: a meal in progress continues until full, a courtship until it's done — re-deliberating
  // every half-second would otherwise drop the food the moment hunger dipped under the threshold
  // that started the meal, and nobody but the grazers ever got fed enough to breed
  const hunger = 1 - c.energy / (t.maxEnergy * growthOf(c));
  if (FEEDING.has(c.action) && hunger > 0.04) return;
  if (c.action === 'mate' && c.breedCooldown <= 0) return;

  // 2. sleep — when tired at its time of day; a sleeper keeps sleeping until rested
  const night = isNight(w.time);
  const myNight = t.nocturnal ? !night : night;
  if (asleep && c.fatigue > 0.1 && hunger < 0.9) return;
  if ((c.fatigue > 0.9 || (c.fatigue > 0.5 && myNight)) && hunger < 0.8) {
    c.action = 'sleep';
    return;
  }

  // 3. eat — grazers nibble whenever not full; others eat when properly hungry
  const grazer = t.diet === 'herbivore' || t.diet === 'filter';
  if (hunger > (grazer ? 0.25 : 0.4)) {
    if (findFood(w, c, near, sight, hunger)) return;
  }

  // 4. breed — well fed, adult, and not crowded: a dense herd breeds slowly, a full world not at all
  // only animals in good condition breed — so a population that has stripped its food stops
  // multiplying before it starves (the boom-bust brake). Hunters feast and fast, so their bar is lower.
  const fedEnough = t.diet === 'carnivore' ? 0.45 : 0.28;
  if (c.age > t.maturity && c.breedCooldown <= 0 && hunger < fedEnough && roomToBreed(w, c, near)) {
    let mate: Creature | null = null;
    let md = Infinity;
    for (const o of near) {
      if (o === c || o.species !== c.species || o.age < o.traits.maturity || o.breedCooldown > 0) continue;
      if (o.energy < o.traits.maxEnergy * 0.45 || o.action === 'sleep' || o.action === 'flee') continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < md) {
        md = d;
        mate = o;
      }
    }
    if (mate) {
      c.action = 'mate';
      c.target = mate.id;
      c.courtT = 0;
      return;
    }
    // radial / oozing kinds bud alone when there is no partner
    if ((t.locomotion === 'drift' || t.locomotion === 'ooze') && hunger < 0.15) {
      breed(w, c, null);
      return;
    }
    // no one in sight: call — head for the nearest of its kind within earshot (solitary hunters and
    // scattered shoals would otherwise never meet)
    // roaming hunters range far wider to find a mate than herd animals ever need to
    const far = nearby(w, c.x, c.z, t.vision * SCENT * (t.diet === 'carnivore' ? 2 : 1), SCENT_BUF);
    let call: Creature | null = null;
    let cd = Infinity;
    for (const o of far) {
      if (o === c || o.species !== c.species || o.age < o.traits.maturity) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < cd) {
        cd = d;
        call = o;
      }
    }
    if (call) {
      c.action = 'wander';
      c.target = -1;
      c.tx = call.x;
      c.tz = call.z;
      return;
    }
  }

  // a flight in progress finishes at its destination (re-picking a stroll every half-second would
  // keep a flier circling aloft forever, never arriving anywhere to land)
  if (c.action === 'wander' && c.alt > AIRBORNE && Math.hypot(c.tx - c.x, c.tz - c.z) > 6) return;

  // 5. wander — herd animals drift toward their own kind; a hungry hunter follows its nose; the young
  // keep close to a parent
  c.action = 'wander';
  c.target = -1;
  if (c.age < t.maturity && c.parent !== null) {
    const mum = w.creatures.find((o) => o.id === c.parent && o.alive);
    if (mum && Math.hypot(mum.x - c.x, mum.z - c.z) < 60) {
      const a = c.wanderSeed + w.time * 0.3;
      c.tx = mum.x + Math.sin(a) * (1.5 + mum.traits.radius * 2);
      c.tz = mum.z + Math.cos(a) * (1.5 + mum.traits.radius * 2);
      return;
    }
  }
  if ((t.diet === 'carnivore' || t.diet === 'omnivore') && hunger > 0.45) {
    const far = nearby(w, c.x, c.z, t.vision * SCENT, SCENT_BUF);
    let best: Creature | null = null;
    let bd = Infinity;
    for (const o of far) {
      if (!preysOn(c, o)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) {
      c.tx = best.x + (w.rng() - 0.5) * 6;
      c.tz = best.z + (w.rng() - 0.5) * 6;
      return;
    }
  }
  let hx = 0, hz = 0, hn = 0;
  if (t.herding > 0) {
    for (const o of near) {
      if (o === c || o.species !== c.species) continue;
      hx += o.x;
      hz += o.z;
      hn++;
    }
  }
  // a well-fed flier sometimes ranges far — the trip is flown
  // (rolled at every deliberation, so the odds are per ~0.6 s: about one roam per half-minute adrift)
  const wanderR = t.flies && hunger < 0.3 && w.rng() < 0.02 ? 24 + t.flySpeed * 3 : 6 + t.speed * 4;
  const a = c.heading + (w.rng() - 0.5) * 1.6;
  c.tx = c.x + Math.sin(a) * wanderR;
  c.tz = c.z + Math.cos(a) * wanderR;
  if (hn > 0) {
    const cx = hx / hn, cz = hz / hn;
    const d = Math.hypot(cx - c.x, cz - c.z);
    if (d > 5) {
      c.tx = c.tx * (1 - t.herding * 0.7) + cx * t.herding * 0.7;
      c.tz = c.tz * (1 - t.herding * 0.7) + cz * t.herding * 0.7;
    }
  }
  // keep the destination inside the world (a target past the edge was never reached: the walker
  // turned back at the wall, but a flier on a long trip slid along it forever)
  const half = w.terrain.size / 2 - 10;
  c.tx = Math.max(-half, Math.min(half, c.tx));
  c.tz = Math.max(-half, Math.min(half, c.tz));
}

/**
 * Recolonisation. The valley is a patch of a wider country: a founding stock that has died out here
 * may, a day or two later, return as a small band wandering in from the edge (checked each dawn).
 * Without it a closed world of ~150 animals sheds its specialists one by one — rodents outcompeted
 * by generalists, a hunter pair that missed each other — until three species are left.
 */
function immigrate(w: World): void {
  if (liveCount(w) > MAX_POP - 8) return;
  for (const sp of w.species) {
    if (sp.parent !== null || sp.extinctAt === null) continue;
    if (w.time - sp.extinctAt < DAY_LENGTH * 1.5) continue;
    if (w.rng() > 0.5) continue;
    const t = bodyOf(sp.founder).traits;
    let at: { x: number; z: number } | undefined;
    if (t.habitat !== 'water') {
      for (let i = 0; i < 40 && !at; i++) {
        const a = w.rng() * Math.PI * 2;
        const x = Math.sin(a) * w.terrain.size * 0.42, z = Math.cos(a) * w.terrain.size * 0.42;
        if (canStand(w, t, x, z)) at = { x, z };
      }
    }
    const base = at ?? spawnPoint(w, t);
    const n = 3 + Math.floor(w.rng() * 3);
    sp.extinctAt = null;
    for (let i = 0; i < n && liveCount(w) < MAX_POP; i++) {
      const q = spawnPoint(w, t, base.x, base.z, 10);
      spawn(w, sp.founder, sp, q.x, q.z, true, null);
    }
    log(w, 'release', `${n} ${sp.name} wandered in`, sp.id);
  }
}

/** Below this mass, prey can hide from hunters in the bushes. */
const COVER_MASS = 1.5;

function nearestBush(w: World, x: number, z: number, within: number): Plant | null {
  let best: Plant | null = null;
  let bd = within;
  for (const p of w.plants) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** A small animal crouched in a thicket while it flees — out of any hunter's reach. */
function hidden(w: World, c: Creature): boolean {
  if (c.action !== 'flee' || c.traits.mass >= COVER_MASS || c.alt > AIRBORNE) return false;
  const b = nearestBush(w, c.x, c.z, 4);
  return !!b && Math.hypot(b.x - c.x, b.z - c.z) < b.size * 0.8 + 0.45;
}

/** Is there room for this creature's kind to grow — under the world cap, under its species' share,
 *  and not packed in with its own kind? */
function roomToBreed(w: World, c: Creature, near: Creature[]): boolean {
  const live = liveCount(w);
  if (live >= MAX_POP) return false;
  const sp = speciesById(w, c.species);
  if (sp && sp.alive >= SOFT_POP * SPECIES_SHARE) return false;
  // the soft cap is shared out by GUILD: a meadow full of grazers mustn't stop the lake's fish or
  // the hunters breeding (under one global cap they could only breed while rarer than RARE, and
  // drifted out one by one even with their food at full stock)
  if (!sp || sp.alive >= RARE) {
    const g = guildOf(c);
    let n = 0;
    for (const o of w.creatures) if (o.alive && guildOf(o) === g) n++;
    if (n >= SOFT_POP * GUILD_SHARE[g]) return false;
  }
  let crowd = 0;
  for (const o of near) if (o !== c && o.species === c.species && Math.hypot(o.x - c.x, o.z - c.z) < 9) crowd++;
  return crowd < 7;
}

/** Pick the best food in sight for this diet; returns true if a food action was chosen. */
function findFood(w: World, c: Creature, near: Creature[], sight: number, hunger: number): boolean {
  const t = c.traits;
  const eatsPlants = t.diet === 'herbivore' || t.diet === 'omnivore';
  const eatsFruit = t.diet === 'herbivore' || t.diet === 'omnivore' || t.diet === 'nectar';
  const eatsMeat = t.diet === 'carnivore' || t.diet === 'omnivore';

  let best = -Infinity;
  let pick: { action: Action; target: number; x: number; z: number } | null = null;
  const consider = (score: number, action: Action, target: number, x: number, z: number) => {
    if (score > best) {
      best = score;
      pick = { action, target, x, z };
    }
  };

  // carcasses — an easy meal for scavengers
  if (eatsMeat) {
    for (const k of w.corpses) {
      const d = Math.hypot(k.x - c.x, k.z - c.z);
      if (d > sight || !reachable(w, t, k.x, k.z)) continue;
      consider(30 - d * 0.5 + Math.min(20, k.meat * 0.1), 'scavenge', k.id, k.x, k.z);
    }
  }
  // prey
  if (eatsMeat && hunger > (t.diet === 'carnivore' ? 0.3 : 0.55)) {
    for (const o of near) {
      if (o === c || !preysOn(c, o)) continue;
      if (!t.flies && o.alt > AIRBORNE * 3) continue; // out of reach in the air
      if (hidden(w, o)) continue; // gone to ground
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      // the young, the weak, the asleep are easier — and anything it can outrun
      const outrun = (t.sprint - o.traits.sprint * (0.75 + 0.25 * growthOf(o))) / t.sprint;
      const ease = (o.action === 'sleep' ? 8 : 0) + (1 - o.health / o.traits.maxHealth) * 10 + (o.age < o.traits.maturity ? 6 : 0) + 8 * Math.max(-1, Math.min(1, outrun));
      consider((t.diet === 'carnivore' ? 22 : 8) - d * 0.6 + ease, 'hunt', o.id, o.x, o.z);
    }
  }
  // fruit
  if (eatsFruit) {
    for (const p of w.plants) {
      if (p.fruit < 1) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d > sight || !reachable(w, t, p.x, p.z)) continue;
      consider((t.diet === 'nectar' ? 30 : t.diet === 'herbivore' ? 8 : 16) - d * 0.45 + p.fruit, 'forage', p.id, p.x, p.z);
    }
  }
  // grass — search a ring of cells for the richest within reach
  if (eatsPlants && t.habitat !== 'water') {
    const here = cellOf(w, c.x, c.z);
    let bk = -1, bs = -Infinity;
    const r = Math.min(sight, 22);
    const steps = 10;
    for (let i = 0; i < steps * 2; i++) {
      const ang = c.wanderSeed + i * 2.399; // golden-angle probes
      const rr = r * Math.sqrt((i + 0.5) / (steps * 2));
      const x = c.x + Math.sin(ang) * rr, z = c.z + Math.cos(ang) * rr;
      if (!inBounds(w.terrain, x, z) || !reachable(w, t, x, z)) continue;
      const k = cellOf(w, x, z);
      const s = w.grass[k] * 10 - rr * 0.25;
      if (s > bs) {
        bs = s;
        bk = k;
      }
    }
    if (w.grass[here] > 0.25) {
      bk = here;
      bs = w.grass[here] * 10 + 2;
    }
    if (bk >= 0 && w.grass[bk] > 0.12) {
      const cc = cellCenter(w, bk);
      consider(bs + (t.diet === 'herbivore' ? 6 : -4), 'graze', bk, cc.x + (w.rng() - 0.5) * 2, cc.z + (w.rng() - 0.5) * 2);
    }
  }
  // algae — filter feeders sieve the lake
  if (t.diet === 'filter' || (t.habitat === 'water' && t.diet !== 'carnivore')) {
    let bk = -1, bs = -Infinity;
    for (let i = 0; i < 20; i++) {
      const ang = c.wanderSeed + i * 2.399;
      const rr = Math.min(sight, 26) * Math.sqrt((i + 0.5) / 20);
      const x = c.x + Math.sin(ang) * rr, z = c.z + Math.cos(ang) * rr;
      if (!inBounds(w.terrain, x, z) || !reachable(w, t, x, z) || heightAt(w.terrain, x, z) > WATER_LEVEL - 0.05) continue;
      const k = cellOf(w, x, z);
      const s = w.algae[k] * 10 - rr * 0.2;
      if (s > bs) {
        bs = s;
        bk = k;
      }
    }
    const hereA = cellOf(w, c.x, c.z);
    if (w.algae[hereA] > 0.2) {
      bk = hereA;
      bs = w.algae[hereA] * 10 + 2;
    }
    if (bk >= 0 && w.algae[bk] > 0.1) {
      const cc = cellCenter(w, bk);
      consider(bs + 4, 'filter', bk, cc.x, cc.z);
    }
  }
  if (!pick) return false;
  const chosen = pick as { action: Action; target: number; x: number; z: number };
  if (chosen.action !== c.action || chosen.target !== c.target) c.chaseT = 0;
  c.action = chosen.action;
  c.target = chosen.target;
  c.tx = chosen.x;
  c.tz = chosen.z;
  return true;
}

function reachable(w: World, t: Traits, x: number, z: number): boolean {
  return canStand(w, t, x, z);
}

/** Carry out the current action for one step: steer, move, and eat / bite / mate on arrival. */
function act(w: World, c: Creature, dt: number): void {
  const t = c.traits;
  const g = growthOf(c);
  let goal: { x: number; z: number } | null = null;
  let pace = 0; // fraction of cruise speed (>1 = sprinting)
  let arrive = 1.2 + t.radius * g;
  // a flier comes down before it eats, grazes or courts (it keeps approaching while it settles)
  const landed = c.alt <= AIRBORNE;

  switch (c.action) {
    case 'sleep':
      pace = 0;
      break;
    case 'flee': {
      const th = w.creatures.find((o) => o.id === c.target && o.alive);
      if (!th) {
        c.action = 'wander';
        c.decideIn = 0;
        break;
      }
      const dx = c.x - th.x, dz = c.z - th.z;
      const d = Math.hypot(dx, dz) || 1;
      goal = { x: c.x + (dx / d) * 10, z: c.z + (dz / d) * 10 };
      pace = t.sprint / t.speed;
      // small prey dive for cover: the nearest bush that isn't past the hunter — and once in the
      // thicket it crouches there (no hunter can follow it in; see hidden())
      if (t.mass < COVER_MASS && t.habitat !== 'water' && c.alt <= AIRBORNE) {
        const b = nearestBush(w, c.x, c.z, 9);
        if (b) {
          const bx = b.x - c.x, bz = b.z - c.z;
          const bd = Math.hypot(bx, bz) || 1;
          if ((bx * -dx + bz * -dz) / (bd * d) < 0.5) {
            if (bd < b.size * 0.8 + 0.3) {
              goal = null; // crouched in the thicket
              pace = 0;
            } else goal = b;
          }
        }
      }
      if (d > t.vision * 1.2) {
        c.action = 'wander'; // escaped
        c.decideIn = 0;
      }
      break;
    }
    case 'wander':
      goal = { x: c.tx, z: c.tz };
      pace = 0.45;
      if (Math.hypot(c.tx - c.x, c.tz - c.z) < arrive) c.decideIn = Math.min(c.decideIn, 0.2);
      break;
    case 'graze':
    case 'filter': {
      const field = c.action === 'graze' ? w.grass : w.algae;
      const here = cellOf(w, c.x, c.z);
      const d = Math.hypot(c.tx - c.x, c.tz - c.z);
      // graze IN PLACE while the patch underfoot holds out; only travel when it is cropped bare
      if ((field[here] < 0.1 && d > arrive + 1.5) || !landed) {
        goal = { x: c.tx, z: c.tz };
        pace = 0.8;
      } else {
        // crop the cell underfoot
        const k = here;
        const per = c.action === 'graze' ? GRASS_ENERGY : ALGAE_ENERGY;
        const rate = (INTAKE[t.diet][c.action === 'graze' ? 'grass' : 'algae'] ?? 1) * t.metabolism; // energy/s
        const bite = Math.min(field[k], (rate / per) * dt);
        field[k] -= bite;
        c.energy += bite * per;
        pace = 0.08; // shuffle while cropping
        goal = { x: c.tx, z: c.tz };
        if (c.energy > t.maxEnergy * g * 0.97) done(c);
        else if (field[k] < 0.04 && d <= arrive + 1.5) done(c); // patch and target both cropped
      }
      break;
    }
    case 'forage': {
      const p = w.plants.find((q) => q.id === c.target);
      if (!p || p.fruit < 0.2) {
        done(c);
        break;
      }
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      arrive += p.size;
      if (d > arrive || !landed) {
        goal = p;
        pace = 0.85;
      } else {
        // a fruit every ~1.2 s
        const rate = (INTAKE[t.diet].fruit ?? 1) * t.metabolism;
        const per = FRUIT_ENERGY * (1 + t.mass * 0.6); // a big animal strips a bush faster for the same fruit count
        const take = Math.min(p.fruit, (rate / per) * dt);
        p.fruit -= take;
        c.energy += take * per;
        if (c.energy > t.maxEnergy * g * 0.97) done(c);
      }
      break;
    }
    case 'scavenge':
    case 'eat': {
      const k = w.corpses.find((q) => q.id === c.target);
      if (!k || k.meat <= 0.5) {
        done(c);
        break;
      }
      const d = Math.hypot(k.x - c.x, k.z - c.z);
      if (d > arrive + 0.6 || !landed) {
        goal = k;
        pace = 1;
      } else {
        c.action = 'eat';
        const bite = Math.min(k.meat, (INTAKE[t.diet].meat ?? 1) * t.metabolism * dt);
        k.meat -= bite;
        c.energy += bite * MEAT_ENERGY;
        if (c.energy > t.maxEnergy * g * 0.97) done(c);
      }
      break;
    }
    case 'hunt': {
      const prey = w.creatures.find((o) => o.id === c.target && o.alive);
      if (!prey) {
        if (c.action === 'hunt') done(c);
        break;
      }
      if (hidden(w, prey)) {
        done(c); // it went to ground in a thicket: give it up
        c.decideIn = 2;
        break;
      }
      const d = Math.hypot(prey.x - c.x, prey.z - c.z);
      const reach = (t.radius * g + prey.traits.radius * growthOf(prey)) * 0.9 + 0.5;
      // lead the target a little
      goal = { x: prey.x + Math.sin(prey.heading) * prey.speed * 0.4, z: prey.z + Math.cos(prey.heading) * prey.speed * 0.4 };
      // STALK, then POUNCE: creep in at a crouching walk until within a short dash (or until the
      // prey bolts), then sprint all out — and give the dash up if it hasn't connected in a few
      // seconds, rather than run itself to death behind something faster
      const dash = reach + 2.5 + t.sprint * 0.9;
      const bolted = prey.action === 'flee' && prey.target === c.id;
      if (c.chaseT > 0 || d < dash || bolted || t.flies) {
        c.chaseT += dt;
        pace = t.sprint / t.speed;
      } else pace = 0.5;
      // jaws only meet at the same height: a walker can't bite a bird on the wing
      if (d < reach && Math.abs(prey.alt - c.alt) < reach + 0.6) {
        bite(w, c, prey, dt);
        c.chaseT = Math.min(c.chaseT, 0.5); // a struggle at the throat is not a lost chase
        pace = 0.3;
      }
      if (d > t.vision * 1.3 && c.action === 'hunt') done(c); // lost it
      else if (!t.flies && prey.alt > AIRBORNE * 3 && c.action === 'hunt') done(c); // it flew off
      else if (c.chaseT > 4.5 && c.action === 'hunt') {
        done(c); // spent: let it go and get its breath back
        c.decideIn = 2.5;
      }
      break;
    }
    case 'mate': {
      const m = w.creatures.find((o) => o.id === c.target && o.alive);
      if (!m || m.breedCooldown > 0 || m.action === 'flee') {
        done(c);
        break;
      }
      const d = Math.hypot(m.x - c.x, m.z - c.z);
      const contact = t.radius + m.traits.radius;
      if (d > contact + 3 || !landed || m.alt > AIRBORNE) {
        // court from close by and on the ground: approach first
        goal = m;
        pace = 0.75;
        c.courtT = 0;
      } else if (c.courtT < COURT_TIME) {
        // the display: the pair circle each other about their midpoint (the partner, if it's idle,
        // is drawn into the dance — two suitors orbiting the same way go round each other; one busy
        // feeding or hunting carries on and is simply courted)
        c.courtT += dt;
        if (m.action === 'wander' && m.age >= m.traits.maturity && m.breedCooldown <= 0) {
          m.action = 'mate';
          m.target = c.id;
          m.courtT = c.courtT;
        }
        const mx = (c.x + m.x) / 2, mz = (c.z + m.z) / 2;
        const ang = Math.atan2(c.x - mx, c.z - mz) + 0.9;
        const R = contact * 0.6 + 0.9;
        goal = { x: mx + Math.sin(ang) * R, z: mz + Math.cos(ang) * R };
        pace = 0.3;
      } else if (d > contact + 0.8) {
        goal = m;
        pace = 0.5;
      } else if (c.breedCooldown <= 0) {
        breed(w, c, m);
        c.courtT = 0;
        done(c);
      }
      break;
    }
  }

  if (t.flies || c.alt > 0) goal = planFlight(w, c, goal);
  steer(w, c, goal, pace, dt);
}

/**
 * Should a flier be in the air for what it is doing? Long trips, escapes and the approach to a
 * distant meal are flown; feeding, sleeping and courting happen on the ground. A hunter cruises in
 * high and stoops onto its prey from close range. It never sets down where it can't stand (over the
 * lake): it keeps flying — making for the shore if it had nowhere to go.
 */
function planFlight(w: World, c: Creature, goal: { x: number; z: number } | null): { x: number; z: number } | null {
  const t = c.traits;
  const aloft = c.alt > AIRBORNE;
  const d = goal ? Math.hypot(goal.x - c.x, goal.z - c.z) : 0;
  // hysteresis on the INTENT, not the altitude: once it has decided to come down, a fresh nearby
  // goal picked during the descent mustn't send it climbing again
  const flying = c.fly;
  let fly = false;
  if (t.flies) {
    switch (c.action) {
      case 'flee':
        fly = true;
        break;
      case 'wander':
        // a stroll is walked; only a long trip (a far roam, a call to a distant mate) is flown
        fly = d > (flying ? 6 : 24);
        break;
      case 'forage':
      case 'scavenge':
        fly = d > (flying ? 5 : 14);
        break;
      case 'hunt':
        fly = d > (flying ? 6 : 16);
        break;
      default:
        fly = false;
    }
    if (c.energy < t.maxEnergy * growthOf(c) * 0.06) fly = false; // too spent to take off
  }
  if (!fly && aloft && !canStand(w, t, c.x, c.z)) {
    fly = true; // can't land here
    if (!goal) {
      // nowhere to be (asleep, feeding…) yet over water: head straight out from the lake
      const dx = c.x - w.terrain.lakeX, dz = c.z - w.terrain.lakeZ;
      const n = Math.hypot(dx, dz) || 1;
      goal = { x: c.x + (dx / n) * 12, z: c.z + (dz / n) * 12 };
    }
  }
  c.fly = fly;
  return goal;
}

/** The current action is finished or impossible — drop it and deliberate next step. */
function done(c: Creature): void {
  c.action = 'wander';
  c.target = -1;
  c.decideIn = 0;
  c.courtT = 0;
  c.chaseT = 0;
}

function bite(w: World, a: Creature, b: Creature, dt: number): void {
  const ga = growthOf(a);
  const dmg = a.traits.attack * ga * ga * (1 - b.traits.defense) * dt;
  b.health -= dmg;
  b.attacker = a.id;
  b.attackedAt = w.time;
  a.bitAt = w.time;
  if (b.action === 'sleep') b.decideIn = 0; // woken
  // armed prey bite back
  const gb = growthOf(b);
  if (b.traits.attack * gb * gb > a.traits.attack * 0.35) {
    a.health -= b.traits.attack * gb * gb * 0.45 * (1 - a.traits.defense) * dt;
    if (a.health <= 0) {
      a.kills += 0;
      return;
    }
  }
  if (b.health <= 0) {
    const spA = speciesById(w, a.species), spB = speciesById(w, b.species);
    log(w, 'kill', `a ${spA?.name ?? '?'} killed a ${spB?.name ?? '?'}`, a.species, b.id);
    a.kills++;
    die(w, b, 'predation');
    const corpse = w.corpses[w.corpses.length - 1];
    a.action = 'eat';
    a.target = corpse.id;
  }
}

/** Mate (or bud, when `m` is null): pay the cost and drop a litter — possibly mutated. */
function breed(w: World, a: Creature, m: Creature | null): void {
  const t = a.traits;
  const cost = t.maxEnergy * 0.34;
  if (a.energy < cost * 1.4) return;
  a.energy -= cost;
  a.breedCooldown = t.lifespan * 0.07;
  if (m) {
    m.energy -= m.traits.maxEnergy * 0.2;
    m.breedCooldown = m.traits.lifespan * 0.07;
  }
  const sp = speciesById(w, a.species);
  if (!sp) return;
  const n = t.litter;
  for (let i = 0; i < n && liveCount(w) < MAX_POP; i++) {
    let genome = a.genome;
    let species = sp;
    // either parent's line can carry on; a mutation sometimes rides along
    if (m && w.rng() < 0.5) genome = m.genome;
    if (w.rng() < MUTATION_CHANCE) {
      genome = mutate(genome, mix32(w.seed, w.stepCount, a.id, i), i, WORLD_MUTATION);
      w.tally.mutations++;
      const d = morphDistance(describeMorph(bodyOf(genome).phenotype), sp.descriptor);
      if (d > SPECIATION_DIST) {
        species = speciesFor(w, genome, sp.id);
        w.tally.speciations++;
        log(w, 'speciation', `${species.name} branched off ${sp.name}`, species.id);
      }
    }
    const ct = bodyOf(genome).traits;
    let x = a.x + (w.rng() - 0.5) * 3, z = a.z + (w.rng() - 0.5) * 3;
    if (!canStand(w, ct, x, z)) {
      x = a.x;
      z = a.z;
    }
    const child = spawn(w, genome, species, x, z, false, a);
    w.tally.births++;
    child.heading = a.heading + (w.rng() - 0.5);
    a.children++;
    if (m) m.children++;
    if (i === 0) log(w, 'birth', `a ${species.name} was born${m ? '' : ' (budded)'}`, species.id, child.id);
  }
}

/** Turn toward the goal within the turn rate, then move — respecting habitat, terrain and bounds. */
function steer(w: World, c: Creature, goal: { x: number; z: number } | null, pace: number, dt: number): void {
  const t = c.traits;
  const g = growthOf(c);
  const ground = heightAt(w.terrain, c.x, c.z);
  // altitude: climb toward a per-creature cruising height while it wants the air, settle otherwise
  // (a hunter stoops at twice the sink rate)
  if (t.flies || c.alt > 0) {
    const cruise = 5 + 4 * ((c.wanderSeed * 0.618) % 1) + (c.action === 'flee' ? 3 : 0);
    const want = c.fly ? cruise : 0;
    const sink = c.action === 'hunt' ? SINK * 2 : SINK;
    c.alt = Math.max(0, c.alt + Math.max(-sink * dt, Math.min(CLIMB * dt, want - c.alt)));
  }
  const aloft = c.alt > AIRBORNE;
  const flying = aloft || c.fly;
  // land animals wade slowly; swimmers crawl when stranded
  let terrainMul = 1;
  if (!aloft && t.habitat === 'land' && ground < WATER_LEVEL) terrainMul = 0.45;
  if (!aloft && t.habitat === 'amphibious' && ground < WATER_LEVEL) terrainMul = t.locomotion === 'walk' ? 0.7 : 1.1;
  // the cold-blooded are sluggish after dark, and in the cold of the year
  const chill = t.endotherm ? 1 : (isNight(w.time) ? 0.65 : 1) * (1 - 0.3 * climate(w.time).cold);
  // on the wing: a flier can't dawdle (a floor on the pace), sprints a little faster than it cruises,
  // and slows as it comes in to land
  const airPace = !c.fly ? (c.action === 'hunt' ? 1.1 : 0.5) : pace > 1 ? 1.25 : Math.max(0.7, pace);
  const targetSpeed = goal
    ? flying
      ? t.flySpeed * airPace
      : t.speed * pace * terrainMul * chill * (0.75 + 0.25 * g)
    : 0;
  c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 3);
  if (!goal || c.speed < 0.01) {
    if (!goal) c.speed *= Math.max(0, 1 - dt * 4);
    return;
  }
  const want = Math.atan2(goal.x - c.x, goal.z - c.z);
  let dh = want - c.heading;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const maxTurn = t.turnRate * dt * (pace > 1 ? 1.3 : 1) * (aloft ? 0.7 : 1); // a wide banking turn aloft
  c.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));

  const step = c.speed * dt;
  let nx = c.x + Math.sin(c.heading) * step;
  let nz = c.z + Math.cos(c.heading) * step;
  // airborne, only the world's edge stops it — water and steep ground pass beneath
  const ok = inBounds(w.terrain, nx, nz) && (aloft || canStand(w, t, nx, nz));
  if (!ok) {
    // blocked (shore / world edge): slide along by trying a turn either way
    for (const turn of [0.9, -0.9, 1.8, -1.8, Math.PI]) {
      const h = c.heading + turn;
      const tx = c.x + Math.sin(h) * step, tz = c.z + Math.cos(h) * step;
      if (inBounds(w.terrain, tx, tz) && (aloft || canStand(w, t, tx, tz))) {
        c.heading = h;
        nx = tx;
        nz = tz;
        break;
      }
      if (turn === Math.PI) {
        nx = c.x;
        nz = c.z;
        c.decideIn = 0;
      }
    }
  }
  c.x = nx;
  c.z = nz;
  c.heading = Math.atan2(Math.sin(c.heading), Math.cos(c.heading));
}

/** A cheap deterministic fingerprint of the world state (for replay tests). */
export function worldHash(w: World): number {
  let h = mix32(w.stepCount, w.creatures.length, w.corpses.length, w.species.length);
  for (const c of w.creatures) h = mix32(h, c.id, Math.round(c.x * 1000), Math.round(c.z * 1000), Math.round(c.energy * 10));
  return h >>> 0;
}
