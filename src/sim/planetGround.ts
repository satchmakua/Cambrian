/**
 * A planet's ground: a ball of a chosen radius, raised into continents and hills by fractal noise on the
 * unit vector, with the sea let in until a chosen share of the surface stands above it. Pure, and the same
 * for the same spec every time.
 *
 * Terrain from noise alone, for now: plates, erosion and rivers are the planet's later steps (ROADMAP.md).
 * Its continents are the same map at every radius (the noise is sampled on the unit vector), and its hills
 * are the valley's, a few dozen bu across whatever the radius, so planets of different sizes differ in their
 * curve and their room, not their ground.
 *
 * Heights are SAMPLED, as the valley's are (terrain.ts): onto a grid on each face of the cube-sphere about
 * a bu apart, a tile at a time as the ground is first asked for there, and read back bilinearly — the noise
 * costs a microsecond or two a sample, and a step asks for each body's ground several times. The
 * simulation, the planet's mesh and its trees all read this one surface. Places here are unit vectors.
 */
import { mulberry32 } from '../engine/rng';
import { cubeToSphere, fibonacci, randomPlace, sphereToCube, type Vec3 } from './sphere';
import { WATER_LEVEL, type Biome } from './terrain';
import type { Stand } from './stands';

/** What a planet is made from: its seed, its size, how high its ground stands, how much of it is land. */
export interface PlanetSpec {
  seed: number;
  /** the sea's radius (bu) */
  radius: number;
  /** how high the highest ground stands above the sea (bu): the valley's reaches about 14 */
  relief: number;
  /** the share of the surface above the sea */
  land: number;
}

export interface PlanetGround extends PlanetSpec {
  hashA: number;
  hashB: number;
  hashC: number;
  /** the continents' noise at the shore, near the top of the land, and near the bottom of the sea */
  shore: number;
  top: number;
  floor: number;
  /** height samples along a face's edge, less one (about a bu apart) */
  n: number;
}

/** How near the poles the ice lies (the sine of the latitude): no grass grows past it. */
export const POLAR_ICE = 0.9;

function hash3(ix: number, iy: number, iz: number, salt: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(iz | 0, 0x1b873593) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** value noise in 3D (∈ [0, 1)), smoothly interpolated between the lattice's points */
function vnoise(x: number, y: number, z: number, salt: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, iy, iz, salt), b = hash3(ix + 1, iy, iz, salt);
  const c = hash3(ix, iy + 1, iz, salt), d = hash3(ix + 1, iy + 1, iz, salt);
  const e = hash3(ix, iy, iz + 1, salt), f = hash3(ix + 1, iy, iz + 1, salt);
  const g = hash3(ix, iy + 1, iz + 1, salt), h = hash3(ix + 1, iy + 1, iz + 1, salt);
  const x00 = a + (b - a) * ux, x10 = c + (d - c) * ux, x01 = e + (f - e) * ux, x11 = g + (h - g) * ux;
  const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** fractal value noise (∈ [0, 1)): `octaves` layers, each about twice as fine and half as strong */
function fbm(x: number, y: number, z: number, salt: number, octaves: number): number {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * f, y * f, z * f, salt + i * 1013);
    sum += amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v / sum;
}

/** The continents' noise at p: broad, its coasts bent by more noise (warped), so they wander instead of
 *  following the lattice's grain. The same at every radius. */
function continent(g: PlanetGround, p: Vec3): number {
  const wx = fbm(p[0] * 1.9 + 7.1, p[1] * 1.9, p[2] * 1.9, g.hashB, 2) - 0.5;
  const wy = fbm(p[0] * 1.9, p[1] * 1.9 + 3.3, p[2] * 1.9, g.hashB + 77, 2) - 0.5;
  const wz = fbm(p[0] * 1.9, p[1] * 1.9, p[2] * 1.9 + 5.9, g.hashB + 155, 2) - 0.5;
  return fbm((p[0] + 0.55 * wx) * 1.3, (p[1] + 0.55 * wy) * 1.3, (p[2] + 0.55 * wz) * 1.3, g.hashA, 4);
}

/** A planet's ground, from its spec (its sea let in to leave `land` of the surface dry). */
export function makePlanetGround(spec: PlanetSpec): PlanetGround {
  const rng = mulberry32(spec.seed ^ 0x51a9e7);
  const g: PlanetGround = {
    ...spec,
    hashA: (rng() * 0xffffffff) >>> 0,
    hashB: (rng() * 0xffffffff) >>> 0,
    hashC: (rng() * 0xffffffff) >>> 0,
    shore: 0.5,
    top: 0.8,
    floor: 0.2,
    n: Math.max(32, Math.round((Math.PI / 2) * spec.radius)),
  };
  // the shore where the chosen share of the continents' noise lies above it (sampled over the whole ball)
  const n = 12000;
  const cs = new Float64Array(n);
  for (let i = 0; i < n; i++) cs[i] = continent(g, fibonacci(i, n));
  cs.sort();
  g.shore = cs[Math.min(n - 1, Math.floor((1 - spec.land) * n))];
  g.top = Math.max(g.shore + 1e-3, cs[Math.floor(0.997 * n)]);
  g.floor = Math.min(g.shore - 1e-3, cs[Math.floor(0.003 * n)]);
  return g;
}

/**
 * The ground's height at p (a unit vector), bu above the sea (under it, negative): the noise itself. The
 * land rises from a coastal plain into highlands, and the valley's own hills roll over it (its
 * `exactHeightAt`: some ±3 bu, 38 bu across), fading out toward the shore, which the continents alone
 * draw. The sea bed shelves away from the coast.
 */
export function exactHeight(g: PlanetGround, p: Vec3): number {
  const c = continent(g, p);
  if (c >= g.shore) {
    const t = Math.min(1.2, (c - g.shore) / (g.top - g.shore));
    const k = g.radius / 38;
    const hills = (fbm(p[0] * k, p[1] * k, p[2] * k, g.hashC, 4) - 0.5) * g.relief * 0.5;
    return g.relief * (0.35 * t + 0.65 * t * t * t) + hills * Math.min(1, t / 0.15);
  }
  const t = Math.min(1.2, (g.shore - c) / (g.shore - g.floor));
  return -g.relief * 0.55 * Math.pow(t, 0.75);
}

const TILE = 32; // cells along a tile's edge (its samples overlap the next tile's by one)
const TILES = new WeakMap<PlanetGround, Map<number, Float32Array>>();

/** The ground's height at p (a unit vector), read from the sampled grid: what the simulation stands on. */
export function heightOn(g: PlanetGround, p: Vec3): number {
  const { face, s, t } = sphereToCube(p);
  const n = g.n;
  const gs = ((s + 1) / 2) * n, gt = ((t + 1) / 2) * n;
  const i = Math.min(n - 1, Math.max(0, Math.floor(gs))), j = Math.min(n - 1, Math.max(0, Math.floor(gt)));
  const ti = Math.floor(i / TILE), tj = Math.floor(j / TILE);
  let tiles = TILES.get(g);
  if (!tiles) TILES.set(g, (tiles = new Map()));
  const key = (face * 1024 + ti) * 1024 + tj;
  let tile = tiles.get(key);
  const W = TILE + 1;
  if (!tile) {
    tile = new Float32Array(W * W);
    for (let a = 0; a < W; a++) {
      for (let b = 0; b < W; b++) {
        const si = Math.min(n, ti * TILE + a), tj2 = Math.min(n, tj * TILE + b);
        tile[a * W + b] = exactHeight(g, cubeToSphere(face, -1 + (2 * si) / n, -1 + (2 * tj2) / n));
      }
    }
    tiles.set(key, tile);
  }
  const k = (i - ti * TILE) * W + (j - tj * TILE);
  const fs = Math.min(1, Math.max(0, gs - i)), ft = Math.min(1, Math.max(0, gt - j));
  return (tile[k] * (1 - ft) + tile[k + 1] * ft) * (1 - fs) + (tile[k + W] * (1 - ft) + tile[k + W + 1] * ft) * fs;
}

/** How damp the ground is at p (∈ [0, 1)): it tilts meadow toward wood, as the valley's `moistureAt`. */
export function moistOn(g: PlanetGround, p: Vec3): number {
  const k = g.radius / 30;
  return fbm(p[0] * k, p[1] * k, p[2] * k, g.hashC + 991, 3);
}

/** What grows at p, by the valley's rules (its heights scaled to this planet's relief); the poles are ice,
 *  bare as rock. (New biomes, by temperature and rainfall, are a later step.) */
export function biomeOn(g: PlanetGround, p: Vec3): Biome {
  const h = heightOn(g, p);
  if (h < -1.2) return 'deep';
  if (h < WATER_LEVEL) return 'shallow';
  if (h < 0.45) return 'sand';
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
    if (h < 0.6 || h > 9.5 * k || Math.abs(p[1]) > 0.88) continue;
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
