/**
 * The valley's trees and rocks — where each stands, and how tall — as a pure function of its terrain.
 *
 * The scene draws them (world/Landscape.tsx), and the simulation uses the broadleaf crowns as perches: a
 * flier roosts in one at night, out of reach of anything that walks. Both read the same list, so a bird
 * asleep in a tree is asleep in a tree you can see.
 */
import { mulberry32 } from '../engine/rng';
import { biomeAt, heightAt, type Terrain } from './terrain';

export interface Stand {
  x: number;
  /** the ground under it */
  y: number;
  z: number;
  /** its size (1: an ordinary tree) */
  s: number;
  /** its turn about its trunk (radians) */
  r: number;
}

export interface Stands {
  /** broadleaf trees: a trunk 3.2 s tall under a round crown */
  trees: Stand[];
  pines: Stand[];
  rocks: Stand[];
}

const CACHE = new WeakMap<Terrain, Stands>();

/** Every tree, pine and rock of a valley (the same for the same terrain, every time). */
export function standsOf(terrain: Terrain): Stands {
  let out = CACHE.get(terrain);
  if (out) return out;
  const rng = mulberry32(terrain.seed ^ 0x7ee5);
  const trees: Stand[] = [];
  const pines: Stand[] = [];
  const rocks: Stand[] = [];
  for (let i = 0; i < 9000 && (trees.length + pines.length < 300 || rocks.length < 160); i++) {
    const x = (rng() - 0.5) * terrain.size * 0.97;
    const z = (rng() - 0.5) * terrain.size * 0.97;
    const b = biomeAt(terrain, x, z);
    const y = heightAt(terrain, x, z);
    const full = trees.length + pines.length >= 300;
    // conifers climb the high woods and the edge of the rock; broadleaves keep the low woods
    const pine = y > 4.2 || rng() < 0.18;
    if (b === 'wood' && !full && rng() < 0.6) (pine ? pines : trees).push({ x, y, z, s: 0.8 + rng() * 0.9, r: rng() * 6.28 });
    else if (b === 'meadow' && !full && rng() < 0.03) trees.push({ x, y, z, s: 0.7 + rng() * 0.6, r: rng() * 6.28 });
    else if (b === 'rock' && !full && y < 9.5 && rng() < 0.12) pines.push({ x, y, z, s: 0.6 + rng() * 0.5, r: rng() * 6.28 });
    else if ((b === 'rock' || b === 'sand') && rocks.length < 160 && rng() < 0.4) rocks.push({ x, y, z, s: 0.3 + rng() * 1.1, r: rng() * 6.28 });
  }
  out = { trees, pines, rocks };
  CACHE.set(terrain, out);
  return out;
}

/** How high above its ground a bird perches in a broadleaf's crown: on its upper boughs. */
export function perchHeight(tree: Stand): number {
  return 3.2 * tree.s + 0.9 * tree.s + 1.1 * tree.s;
}

/** The nearest broadleaf to (x, z) within `within`, as its index in `trees` (-1: none). A tie goes to the
 *  one listed first. */
export function nearestTree(terrain: Terrain, x: number, z: number, within: number): number {
  const { trees } = standsOf(terrain);
  let best = -1, bd = within * within;
  for (let i = 0; i < trees.length; i++) {
    const dx = trees[i].x - x, dz = trees[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
