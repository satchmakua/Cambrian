/**
 * The world's ground — a deterministic heightfield with water, beaches, meadows, woods and rock.
 *
 * Pure math, seeded (the sim is held to the engine's determinism discipline): the same seed always
 * raises the same island. Height is an fbm of value noise shaped into a broad basin — a central lake
 * with rolling meadows around it and rocky highlands toward the rim — so every world has the three
 * habitats the food web needs: open water for swimmers and filter feeders, grassland for grazers,
 * and woodland where fruit grows. Moisture is a second, independent noise field that tilts meadow ↔
 * woodland.
 *
 * Units are body units (bu), +Y up, the world spans [-SIZE/2, SIZE/2] on X and Z, water level is 0.
 */
import { mulberry32 } from '../engine/rng';

export const WORLD_SIZE = 200;
export const WATER_LEVEL = 0;

export type Biome = 'deep' | 'shallow' | 'sand' | 'meadow' | 'wood' | 'rock';

export interface Terrain {
  seed: number;
  size: number;
  /** permutation-free value-noise lattice seeds */
  hashA: number;
  hashB: number;
  /** the lake's centre (the basin is offset so worlds don't all look alike) */
  lakeX: number;
  lakeZ: number;
  lakeR: number;
}

export function makeTerrain(seed: number): Terrain {
  const rng = mulberry32(seed ^ 0x7e44a1);
  return {
    seed,
    size: WORLD_SIZE,
    hashA: (rng() * 0xffffffff) >>> 0,
    hashB: (rng() * 0xffffffff) >>> 0,
    lakeX: (rng() - 0.5) * WORLD_SIZE * 0.25,
    lakeZ: (rng() - 0.5) * WORLD_SIZE * 0.25,
    lakeR: WORLD_SIZE * (0.14 + rng() * 0.06),
  };
}

// --- value noise -------------------------------------------------------------------------------

function hash2(ix: number, iz: number, salt: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, z: number, salt: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt), b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt), d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number, salt: number, octaves = 5): number {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * f, z * f, salt + i * 1013);
    f *= 2.03;
    amp *= 0.5;
  }
  return v; // ~[0, 1)
}

// --- the shaped heightfield ------------------------------------------------------------------------

/** Ground height at (x, z), in bu. Negative = under water. */
export function heightAt(t: Terrain, x: number, z: number): number {
  const s = 1 / 38; // feature scale: rolling hills a few dozen bu across
  const n = fbm(x * s, z * s, t.hashA); // 0..1
  // the basin: low toward the lake centre, rising to highlands at the rim
  const dl = Math.hypot(x - t.lakeX, z - t.lakeZ) / t.lakeR;
  const basin = smooth(0.55, 1.35, dl); // 0 in the lake → 1 on the land
  const rim = Math.max(0, Math.hypot(x, z) / (t.size * 0.5) - 0.62) * 2.6; // highlands near the edge
  const hills = (n - 0.45) * 7;
  return -3.2 + basin * 4.6 + hills * (0.35 + 0.65 * basin) + rim * rim * 9;
}

/** Moisture ∈ [0,1] — tilts dry meadow ↔ damp woodland. */
export function moistureAt(t: Terrain, x: number, z: number): number {
  const near = Math.max(0, 1 - Math.hypot(x - t.lakeX, z - t.lakeZ) / (t.lakeR * 2.4));
  return Math.min(1, fbm(x / 30, z / 30, t.hashB, 4) * 0.85 + near * 0.35);
}

export function biomeAt(t: Terrain, x: number, z: number): Biome {
  const h = heightAt(t, x, z);
  if (h < -1.2) return 'deep';
  if (h < WATER_LEVEL) return 'shallow';
  if (h < 0.45) return 'sand';
  if (h > 7.5) return 'rock';
  return moistureAt(t, x, z) > 0.58 ? 'wood' : 'meadow';
}

export function isWater(t: Terrain, x: number, z: number): boolean {
  return heightAt(t, x, z) < WATER_LEVEL;
}

/** Surface normal (unit) of the ground at (x, z). */
export function normalAt(t: Terrain, x: number, z: number): [number, number, number] {
  const e = 0.5;
  const hx = heightAt(t, x + e, z) - heightAt(t, x - e, z);
  const hz = heightAt(t, x, z + e) - heightAt(t, x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}

/** Is (x, z) inside the playable world (with a margin)? */
export function inBounds(t: Terrain, x: number, z: number, margin = 4): boolean {
  const h = t.size / 2 - margin;
  return x > -h && x < h && z > -h && z < h;
}

function smooth(a: number, b: number, x: number): number {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}
