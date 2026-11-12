/**
 * Crystal shards: what a crystal-covered body's horns and back spines are — a cluster of six-sided
 * prisms, each cut to a point: the tallest along the part's aim, the others leaning out round it, like
 * the crystals of a geode. (On any other hide a horn is a smooth cone and a back spine a small claw.)
 *
 * Built in the part's own frame (+Z its aim), flat-faced: a shard's six sides and the six of its point
 * each catch the light as one plane.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from './mouthLine';

export interface Shard {
  /** from its buried root to its point */
  len: number;
  /** across its flats, at the root (it narrows a little toward the shoulder of its point) */
  rad: number;
  /** how far it leans from the part's aim (radians) … */
  lean: number;
  /** … and which way round (radians about the aim) */
  turn: number;
}

/** how much of a shard's length is its point */
const POINT = 0.3;
/** the shoulder of the point, × the root's width */
const SHOULDER = 0.8;

/** The shards of one cluster, for a part of radius `r` (pure: `seed` makes each cluster its own). */
export function shardPlan(r: number, seed: number): Shard[] {
  const h = (k: number) => hash01(seed, 0x5a4d + k);
  const sides = h(0) < 0.5 ? 2 : 3;
  // the leader: tall, nearly straight up the part's aim
  const out: Shard[] = [{ len: r * (6.2 + 2.2 * h(1)), rad: r * 1.1, lean: 0.12 * h(2), turn: h(3) * Math.PI * 2 }];
  const start = h(4) * Math.PI * 2;
  for (let k = 0; k < sides; k++) {
    out.push({
      len: r * (2.6 + 2.6 * h(10 + k)),
      rad: r * (0.6 + 0.35 * h(20 + k)),
      lean: 0.45 + 0.35 * h(30 + k),
      turn: start + (k * Math.PI * 2) / sides + (h(40 + k) - 0.5) * 0.7,
    });
  }
  return out;
}

/** One cluster as a mesh (flat-shaded), in the part's frame: +Z the aim, the roots sunk at the origin. */
export function shardGeometry(r: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of shardPlan(r, seed)) {
    const body = s.len * (1 - POINT);
    const prism = new THREE.CylinderGeometry(s.rad * SHOULDER, s.rad, body, 6, 1, true);
    prism.translate(0, body / 2, 0);
    const point = new THREE.ConeGeometry(s.rad * SHOULDER, s.len * POINT, 6, 1, true);
    point.translate(0, body + (s.len * POINT) / 2, 0);
    const one = mergeGeometries([prism.toNonIndexed(), point.toNonIndexed()]) ?? prism;
    prism.dispose();
    point.dispose();
    // +Y (the cylinder's axis) → +Z, then lean out from the aim and turn round it; the root is sunk
    // a little so no shard stands on its rim
    one.rotateX(Math.PI / 2);
    one.translate(0, 0, -s.rad * 0.7);
    one.rotateX(s.lean);
    one.rotateZ(s.turn);
    parts.push(one);
  }
  const g = mergeGeometries(parts) ?? parts[0];
  for (const p of parts) if (p !== g) p.dispose();
  g.deleteAttribute('uv');
  g.computeVertexNormals(); // (a triangle soup: every face its own normal — the facets)
  return g;
}
