/**
 * A planet's ground: its terrain and its climate, baked once from its spec (planetBake.ts: plates, the
 * rivers' carving, lakes, rivers, the sea let in to the share of land asked for; planetClimate.ts: warmth,
 * winds and rain), and read anywhere between the cells' middles — the ground's height, the water's surface
 * over it, its warmth, its rain — by the simulation, the planet's mesh and its trees alike. Places here are
 * unit vectors.
 *
 * The water has a surface of its own, not one level for all: the sea's at 0, each lake's at its brim, each
 * river's a little below its banks and falling toward the sea. Wet is where the ground lies under it.
 *
 * What grows where is a Whittaker diagram — the year's warmth against its rain — with the ground's own cases
 * on top (the shore's sand, the heights' and the cliffs' rock, the wet flats' marsh), and how much of it
 * grows is the climate's productivity, measured from the valley's own meadow (planetClimate.ts's
 * `lushness`): a temperate meadow feeds as the valley's does, a desert a fifth as well, a rainforest's floor
 * as well as a meadow, and the open sea, beyond its shelf, nothing.
 */
import { mulberry32 } from '../engine/rng';
import { apronOf, cellIndex, sampleAt, type Apron } from './cubeGrid';
import { bakePlanet, LAKE, LAND, RIVER, SPEC_DEFAULTS, SWIM_FLOW, type Bake, type PlanetSpec } from './planetBake';
import { lushness, waterLushness } from './planetClimate';
import { randomPlace, type Vec3 } from './sphere';
import type { Biome } from './terrain';
import type { Stand } from './stands';

export type { PlanetSpec } from './planetBake';

export interface PlanetGround extends PlanetSpec {
  continents: number;
  rugged: number;
  temperature: number;
  wetness: number;
  bake: Bake;
  /** the ground's height, the water's surface, the damp, the warmth (°C), the rain (mm) and the slope,
   *  laid out to be read between cells */
  aH: Apron;
  aL: Apron;
  aM: Apron;
  aT: Apron;
  aP: Apron;
  aS: Apron;
}

// (the last two grounds made: a world made again on the same planet, at another size, keeps its ground)
const MADE = new Map<string, PlanetGround>();

/** A planet's ground, from its spec: baked (a second or two at 300 bu), or the one already baked for it. */
export function makePlanetGround(spec: PlanetSpec): PlanetGround {
  const s = { ...SPEC_DEFAULTS, ...spec };
  const key = [s.seed, s.radius, s.relief, s.land, s.continents, s.rugged, s.temperature, s.wetness].join(':');
  const made = MADE.get(key);
  if (made) return made;
  const bake = bakePlanet(s);
  const N = bake.grid.N;
  const g: PlanetGround = {
    ...s,
    bake,
    aH: apronOf(N, bake.h),
    aL: apronOf(N, bake.level),
    aM: apronOf(N, bake.moist),
    aT: apronOf(N, bake.T),
    aP: apronOf(N, bake.P),
    aS: apronOf(N, bake.slope),
  };
  MADE.set(key, g);
  if (MADE.size > 2) MADE.delete(MADE.keys().next().value as string);
  return g;
}

/** The ground's height at p (a unit vector), bu above the sea (under it, negative): what bodies stand on,
 *  and what lies under the water. */
export function heightOn(g: PlanetGround, p: Vec3): number {
  return sampleAt(g.aH, p);
}

/** The water's surface at p (bu): the sea's 0, a lake's brim, a river's water. Where it is above the
 *  ground, p is wet; on dry ground away from any lake or river, the sea's. */
export function levelOn(g: PlanetGround, p: Vec3): number {
  return sampleAt(g.aL, p);
}

/** How lush the ground looks at p (∈ [0, 1]): its rain, and the water near it. */
export function moistOn(g: PlanetGround, p: Vec3): number {
  return sampleAt(g.aM, p);
}

/** The year's mean warmth at p (°C): by latitude, and colder the higher. */
export function tempOn(g: PlanetGround, p: Vec3): number {
  return sampleAt(g.aT, p);
}

/** The year's rain at p (mm): carried in off the sea on the winds, wrung out by the ranges. */
export function rainOn(g: PlanetGround, p: Vec3): number {
  return sampleAt(g.aP, p);
}

/** How steep the ground is at p (rise over run). */
export function slopeOn(g: PlanetGround, p: Vec3): number {
  return sampleAt(g.aS, p);
}

/** The water at p: which body it is (or runs into: a river's), and whether a swimmer can reach it from
 *  others of its `reach` (−1 for both: dry ground, or a stream too shallow to swim). */
export function waterOn(g: PlanetGround, p: Vec3): { body: number; reach: number } {
  const b = g.bake;
  const k = cellIndex(b.grid.N, p);
  const body = b.body[k];
  if (body < 0 || (b.kind[k] === RIVER && b.flow[k] < SWIM_FLOW)) return { body: -1, reach: -1 };
  return { body, reach: b.bodies[body].reach };
}

/** a cell's kind, for tests and reports (LAND, SEA, LAKE, RIVER) */
export function kindOn(g: PlanetGround, p: Vec3): number {
  const b = g.bake;
  return b.kind[cellIndex(b.grid.N, p)] ?? LAND;
}

/** the Whittaker diagram's lines (°C a year, and mm): ice below the first, tundra below the second, the
 *  boreal forest below the third, the tropics above the fourth; and the rain that makes a desert a
 *  grassland, a grassland a forest */
export const ICE_BELOW = -10;
export const TUNDRA_BELOW = -1;
export const BOREAL_BELOW = 5;
export const TROPIC_ABOVE = 18;
/** a slope past this is a cliff: bare rock */
const CLIFF = 1;

/** What grows at p: the water's depth from its own surface; then ice, the shore, the heights and cliffs,
 *  the wet flats, and the Whittaker diagram's lands. */
export function biomeOn(g: PlanetGround, p: Vec3): Biome {
  const h = heightOn(g, p), L = levelOn(g, p);
  if (h < L - 1.2) return 'deep';
  if (h < L) return 'shallow';
  const T = tempOn(g, p);
  if (T < ICE_BELOW) return 'ice';
  if (h < L + 0.45) return T < TUNDRA_BELOW ? 'tundra' : 'sand';
  const k = Math.max(0.2, g.relief / 14);
  const s = slopeOn(g, p);
  // (the valley's highlands are rock; in the warm the woods climb higher)
  if ((h > 7.5 * k && T < 14) || s > CLIFF) return 'rock';
  if (T < TUNDRA_BELOW) return 'tundra';
  const P = rainOn(g, p);
  if (h < L + 1.5 && P > 650 && s < 0.1) return 'marsh';
  if (T < BOREAL_BELOW) return P < 250 ? 'tundra' : 'taiga';
  if (T < TROPIC_ABOVE) return P < 250 ? 'desert' : P < 700 ? 'meadow' : 'wood';
  return P < 300 ? 'desert' : P < 1200 ? 'savanna' : 'jungle';
}

/** the grass each ground grows at the valley's meadow's climate (world.ts's own numbers for its six: the
 *  open grounds a meadow's, under trees about half of it, sand a twelfth) */
const GRASS: Partial<Record<Biome, number>> = { meadow: 0.6, savanna: 0.6, tundra: 0.6, marsh: 0.6, desert: 0.6, wood: 0.32, jungle: 0.32, taiga: 0.32, sand: 0.05 };

/** What grows for the grazers and the filter feeders at p: its ground's grass at the climate's
 *  productivity, and algae in the shallows and the lakes (the valley's 1.25 and 0.8 at its warmth) — none
 *  in the open sea beyond the shelf, as real oceans are mostly barren, so deep water parts coastal fish. */
export function foodOn(g: PlanetGround, p: Vec3): { grass: number; algae: number } {
  const b = biomeOn(g, p);
  const T = tempOn(g, p);
  const grass = (GRASS[b] ?? 0) * lushness(T, rainOn(g, p));
  let algae = 0;
  if (b === 'shallow') algae = 1.25 * waterLushness(T);
  else if (b === 'deep') {
    const kind = kindOn(g, p);
    algae = kind === LAKE || kind === RIVER ? 0.8 * waterLushness(T) : 0;
  }
  return { grass, algae };
}

/** A planet's tree: its place (on the sea's sphere, `radius` out) and the height of its ground. */
export interface PlanetStand extends Stand {
  h: number;
}

const STANDS = new WeakMap<PlanetGround, { trees: PlanetStand[]; pines: PlanetStand[] }>();

/** Every tree of a planet, by what grows where: thick in the woods (broadleaves low, conifers high) and the
 *  jungles, conifers through the boreal forest and up to the rock, a few over the meadows, the savanna and
 *  the marshes, hardly any on the tundra, none on the sand, the deserts and the ice; at about the valley's
 *  spacing, the same for the same planet every time. Broadleaves are where fliers roost. */
export function planetStands(g: PlanetGround): { trees: PlanetStand[]; pines: PlanetStand[] } {
  let out = STANDS.get(g);
  if (out) return out;
  const rng = mulberry32(g.seed ^ 0x7ee5);
  const trees: PlanetStand[] = [], pines: PlanetStand[] = [];
  const k = Math.max(0.2, g.relief / 14);
  // (about the valley's tries for its ground — so about its spacing — and never more than a laptop draws)
  const tries = Math.round(4 * Math.PI * g.radius * g.radius * 0.045);
  for (let i = 0; i < tries && trees.length + pines.length < 3000; i++) {
    const p = randomPlace(rng);
    const b = biomeOn(g, p);
    const h = heightOn(g, p);
    if (h - levelOn(g, p) < 0.6) continue;
    const at = (s: number): PlanetStand => ({ x: p[0] * g.radius, y: p[1] * g.radius, z: p[2] * g.radius, h, s, r: rng() * 6.28 });
    if (b === 'wood') {
      if (rng() < 0.6) (h > 4.2 * k || rng() < 0.18 ? pines : trees).push(at(0.8 + rng() * 0.9));
    } else if (b === 'jungle') {
      if (rng() < 0.7) trees.push(at(1 + rng() * 1.1));
    } else if (b === 'taiga') {
      if (rng() < 0.55) pines.push(at(0.7 + rng() * 0.8));
    } else if (b === 'rock') {
      if (h < 9.5 * k && rng() < 0.12) pines.push(at(0.6 + rng() * 0.5));
    } else if (b === 'savanna') {
      if (rng() < 0.05) trees.push(at(0.9 + rng() * 0.6));
    } else if (b === 'meadow' || b === 'marsh') {
      if (rng() < 0.03) trees.push(at(0.7 + rng() * 0.6));
    } else if (b === 'tundra') {
      if (rng() < 0.01) pines.push(at(0.4 + rng() * 0.3));
    }
  }
  out = { trees, pines };
  STANDS.set(g, out);
  return out;
}
