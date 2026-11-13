/**
 * A horn: a tapering keratin sheath that sweeps back from its root (an antelope's, a goat's, a
 * dragon's), ridged with growth rings toward its base, darker at the root than at the point. Built in
 * the body frame relative to its node, from the node's aim. (Every horn was one smooth straight cone:
 * party hats, a unicorn's spike.)
 */
import * as THREE from 'three';
import type { Vec3 } from '../engine/genome';
import { sweepTube, type SweepPoint } from './sweep';

/** a horn's length and root girth, ×its node's radius */
export const HORN_LEN = 3.6;
export const HORN_ROOT = 0.9;
/** how far it sweeps back over its length (×its length), by its seed: from a gentle curve to a sickle */
export const HORN_SWEEP: readonly [number, number] = [0.25, 0.6];
/** its growth rings: how many along its length, and how deep (×its girth there) */
const RINGS = 9;
const RING_DEPTH = 0.07;
const SAMPLES = 14;

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The horn's centreline (node-relative, body frame), root first. `sweep` ∈ [0, 1] picks its curve. */
export function hornPath(r: number, quat: readonly number[], sweep: number): Vec3[] {
  const q = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]);
  const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  // it sweeps back toward the tail (−Z), and up if it already points back
  let back = new THREE.Vector3(0, 0, -1).addScaledVector(aim, aim.z);
  if (back.lengthSq() < 1e-4) back = new THREE.Vector3(0, 1, 0).addScaledVector(aim, -aim.y);
  back.normalize();
  const L = HORN_LEN * r;
  const bend = HORN_SWEEP[0] + (HORN_SWEEP[1] - HORN_SWEEP[0]) * sweep;
  const pts: Vec3[] = [];
  for (let k = 0; k <= SAMPLES; k++) {
    const u = k / SAMPLES;
    // out along its aim, curving back ever more toward the point (shortened a little as it bends, so
    // its length along the curve stays near L)
    const out = L * u * (1 - 0.25 * bend * u);
    const off = L * bend * u * u;
    pts.push([aim.x * out + back.x * off, aim.y * out + back.y * off, aim.z * out + back.z * off]);
  }
  return pts;
}

/** The horn's geometry (node-relative, body frame) with a vertex colour shade (root dark → point pale). */
export function hornGeometry(r: number, quat: readonly number[], sweep: number, ringed: boolean): THREE.BufferGeometry {
  const path = hornPath(r, quat, sweep);
  // its flatten axis (round: none) — any direction square to the path
  const pts: SweepPoint[] = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const t = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const side = Math.abs(t[1]) < 0.9 ? norm([t[2], 0, -t[0]]) : [1, 0, 0] as Vec3;
    return { p, n: side };
  });
  const g = sweepTube(pts, {
    radius: (u) => {
      const base = HORN_ROOT * r * Math.pow(1 - u, 0.85);
      // the rings fade out up the horn: the old growth at the root is the most ridged
      const ring = ringed ? 1 - RING_DEPTH * (1 - u) * (0.5 + 0.5 * Math.cos(u * RINGS * Math.PI * 2)) : 1;
      return Math.max(r * 0.02, base * ring);
    },
    flatten: 1,
    radialSegments: 12,
    caps: true,
  });
  g.computeVertexNormals();
  // shade along the horn: a vertex's place along it, by its nearest centreline sample
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let best = Infinity, at = 0;
    for (let k = 0; k < path.length; k++) {
      const d = (pos.getX(i) - path[k][0]) ** 2 + (pos.getY(i) - path[k][1]) ** 2 + (pos.getZ(i) - path[k][2]) ** 2;
      if (d < best) {
        best = d;
        at = k / (path.length - 1);
      }
    }
    const shade = 0.62 + 0.45 * at;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
