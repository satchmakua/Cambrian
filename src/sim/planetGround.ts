/**
 * A planet's ground: its terrain, baked once from its spec (planetBake.ts: plates, the rivers' carving,
 * lakes, rivers, the sea let in to the share of land asked for), and read anywhere between the cells'
 * middles — the ground's height, the water's surface over it, the damp — by the simulation, the planet's
 * mesh and its trees alike. Places here are unit vectors.
 *
 * The water has a surface of its own, not one level for all: the sea's at 0, each lake's at its brim, each
 * river's a little below its banks and falling toward the sea. Wet is where the ground lies under it.
 */
import { mulberry32 } from '../engine/rng';
import { apronOf, cellIndex, sampleAt, type Apron } from './cubeGrid';
import { bakePlanet, LAND, RIVER, SPEC_DEFAULTS, SWIM_FLOW, type Bake, type PlanetSpec } from './planetBake';
import { randomPlace, type Vec3 } from './sphere';
import type { Biome } from './terrain';
import type { Stand } from './stands';

export type { PlanetSpec } from './planetBake';

export interface PlanetGround extends PlanetSpec {
  continents: number;
  rugged: number;
  bake: Bake;
  /** the ground's height, the water's surface and the damp, laid out to be read between cells */
  aH: Apron;
  aL: Apron;
  aM: Apron;
}

/** How near the poles the ice lies (the sine of the latitude): no grass grows past it. */
export const POLAR_ICE = 0.9;

// (the last two grounds made: a world made again on the same planet, at another size, keeps its ground)
const MADE = new Map<string, PlanetGround>();

/** A planet's ground, from its spec: baked (a second or so at 300 bu), or the one already baked for it. */
export function makePlanetGround(spec: PlanetSpec): PlanetGround {
  const s = { ...SPEC_DEFAULTS, ...spec };
  const key = [s.seed, s.radius, s.relief, s.land, s.continents, s.rugged].join(':');
  const made = MADE.get(key);
  if (made) return made;
  const bake = bakePlanet(s);
  const N = bake.grid.N;
  const g: PlanetGround = { ...s, bake, aH: apronOf(N, bake.h), aL: apronOf(N, bake.level), aM: apronOf(N, bake.moist) };
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

/** How damp the ground is at p (∈ [0, 1]): rain and the water near it; it tilts meadow toward wood. */
export function moistOn(g: PlanetGround, p: Vec3): number {
  return sampleAt(g.aM, p);
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

/** What grows at p, by the valley's rules (its heights scaled to this planet's relief), the water's depth
 *  taken from its own surface; the poles are ice, bare as rock. (Biomes by temperature and rainfall are
 *  the climate's step.) */
export function biomeOn(g: PlanetGround, p: Vec3): Biome {
  const h = heightOn(g, p), L = levelOn(g, p);
  if (h < L - 1.2) return 'deep';
  if (h < L) return 'shallow';
  if (h < L + 0.45) return 'sand';
  const k = Math.max(0.2, g.relief / 14);
  if (h > 7.5 * k || Math.abs(p[1]) > POLAR_ICE) return 'rock';
  return moistOn(g, p) > 0.58 ? 'wood' : 'meadow';
}

/** A planet's tree: its place (on the sea's sphere, `radius` out) and the height of its ground. */
export interface PlanetStand extends Stand {
  h: number;
}

const STANDS = new WeakMap<PlanetGround, { trees: PlanetStand[]; pines: PlanetStand[] }>();

/** Every tree of a planet, set where the valley would set them (sim/stands.ts: thick in the woods,
 *  broadleaves low and conifers high, a few on the meadows, conifers up to the edge of the rock), at about
 *  the valley's spacing: the same for the same planet, every time. Broadleaves are where fliers roost. */
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
    const h = heightOn(g, p);
    if (h - levelOn(g, p) < 0.6 || h > 9.5 * k || Math.abs(p[1]) > 0.88) continue;
    const m = moistOn(g, p);
    const pine = h > 4.2 * k || rng() < 0.18;
    const at = (s: number): PlanetStand => ({ x: p[0] * g.radius, y: p[1] * g.radius, z: p[2] * g.radius, h, s, r: rng() * 6.28 });
    if (m > 0.58) {
      if (rng() < 0.6) (pine ? pines : trees).push(at(0.8 + rng() * 0.9));
    } else if (h > 7.5 * k) {
      if (rng() < 0.12) pines.push(at(0.6 + rng() * 0.5));
    } else if (rng() < 0.03) trees.push(at(0.7 + rng() * 0.6));
  }
  out = { trees, pines };
  STANDS.set(g, out);
  return out;
}

/** a cell's kind, for tests and reports (LAND, SEA, LAKE, RIVER) */
export function kindOn(g: PlanetGround, p: Vec3): number {
  const b = g.bake;
  return b.kind[cellIndex(b.grid.N, p)] ?? LAND;
}
