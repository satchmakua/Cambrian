/**
 * Whiskers: a fan of fine filaments set out level from the muzzle's pad, spread fore and aft in rows,
 * each tapering to a hair and drooping a little at its tip.
 *
 * They used to be three straight sticks along the whisker part's own aim — out to the side and a third
 * of a radian down — fanned about whatever roll the part's frame happened to have. Seen from three
 * quarters, a near whisker coming toward the eye shows only its downward run: from under the chin it
 * hung to the floor like a string, a fork of drool. A whisker's set is the body's, not the part's: level
 * to the ground, splayed sideways, the rows fanning forward and back.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../engine/genome';
import { sweepTube } from './sweep';

/** each whisker of a pad: how far it swings forward (+) or back (rad, off square to the side), how far
 *  up (+) or down from level, and its length (× the part's radius) */
export const WHISKER_FAN: readonly (readonly [number, number, number])[] = [
  [0.42, 0.14, 3.1],
  [0.12, 0.08, 3.6],
  [-0.2, 0.02, 3.4],
  [0.3, -0.08, 2.9],
  [-0.05, -0.13, 3.2],
  [-0.34, -0.06, 2.7],
];
/** how far a whisker's tip droops below its line (× its length) */
const WHISKER_DROOP = 0.12;

function rotConj(q: readonly number[], v: readonly number[]): Vec3 {
  // v by the inverse of the unit quaternion q
  const x = -q[0], y = -q[1], z = -q[2], w = q[3];
  const tx = w * v[0] + y * v[2] - z * v[1];
  const ty = w * v[1] + z * v[0] - x * v[2];
  const tz = w * v[2] + x * v[1] - y * v[0];
  const tw = -x * v[0] - y * v[1] - z * v[2];
  return [tx * w + tw * -x + ty * -z - tz * -y, ty * w + tw * -y + tz * -x - tx * -z, tz * w + tw * -z + tx * -y - ty * -x];
}
const unit = (v: readonly number[]): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * One pad's whiskers, in the part's own frame (`quat`: its orientation in the body; the body's up is +Y
 * and its front +Z), from a pad of radius `r`. Returns the merged filaments and their directions (body
 * frame, for tests).
 */
export function whiskerFan(quat: readonly number[], r: number): { geometry: THREE.BufferGeometry; dirs: Vec3[] } {
  // the body's up and front, and this pad's side, in the part's frame
  const up = rotConj(quat, [0, 1, 0]);
  const fwd0 = rotConj(quat, [0, 0, 1]);
  const fd = fwd0[0] * up[0] + fwd0[1] * up[1] + fwd0[2] * up[2];
  const fwd = unit([fwd0[0] - up[0] * fd, fwd0[1] - up[1] * fd, fwd0[2] - up[2] * fd]);
  // the part's aim (its +Z) laid level and stripped of its fore-aft part: straight out to its side
  const ad = up[2];
  const lev: Vec3 = [-up[0] * ad, -up[1] * ad, 1 - up[2] * ad];
  const af = lev[0] * fwd[0] + lev[1] * fwd[1] + lev[2] * fwd[2];
  const side = unit([lev[0] - fwd[0] * af, lev[1] - fwd[1] * af, lev[2] - fwd[2] * af]);
  const parts: THREE.BufferGeometry[] = [];
  const dirs: Vec3[] = [];
  WHISKER_FAN.forEach(([a, e, len], i) => {
    const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
    const d: Vec3 = [
      (side[0] * ca + fwd[0] * sa) * ce + up[0] * se,
      (side[1] * ca + fwd[1] * sa) * ce + up[1] * se,
      (side[2] * ca + fwd[2] * sa) * ce + up[2] * se,
    ];
    const L = len * r;
    // rooted in rows on the pad: higher whiskers a little higher, the forward ones a little forward
    const root: Vec3 = [
      up[0] * e * r * 0.9 + fwd[0] * a * r * 0.35 - side[0] * r * 0.1,
      up[1] * e * r * 0.9 + fwd[1] * a * r * 0.35 - side[1] * r * 0.1,
      up[2] * e * r * 0.9 + fwd[2] * a * r * 0.35 - side[2] * r * 0.1,
    ];
    const pts = [];
    const STEPS = 6;
    for (let k = 0; k <= STEPS; k++) {
      const t = k / STEPS;
      const sag = WHISKER_DROOP * L * t * t;
      pts.push({
        p: [root[0] + d[0] * L * t - up[0] * sag, root[1] + d[1] * L * t - up[1] * sag, root[2] + d[2] * L * t - up[2] * sag] as Vec3,
        n: up,
      });
    }
    parts.push(sweepTube(pts, { radius: (u) => r * (0.05 - 0.04 * u) * (i < 3 ? 1 : 0.85), radialSegments: 4 }));
    dirs.push(unit([d[0], d[1], d[2]]));
  });
  const geometry = mergeGeometries(parts, false) ?? parts[0];
  for (const g of parts) if (g !== geometry) g.dispose();
  geometry.computeVertexNormals();
  return { geometry, dirs: dirs.map((d) => rotateBy(quat, d)) };
}

function rotateBy(q: readonly number[], v: readonly number[]): Vec3 {
  return rotConj([-q[0], -q[1], -q[2], q[3]], v);
}
