/**
 * A crab's claw (the `pincer` terminal): a swollen, side-flattened PALM with two curved fingers — the
 * fixed one running on from the palm's underside, the hinged one (the dactyl) closing down onto it
 * from above, a hair of gape between their tips — the fingers darkening to horn at the points. (Two
 * cones angled together read as a pair of tweezers, not a claw.)
 *
 * Built in the claw's own frame (+Z along the limb, +Y its back) and turned by the node's rest
 * orientation into body space, so the covering's pattern (sampled in body space) runs on unbroken
 * from the arm into the palm.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../engine/genome';
import { sweepTube, type SweepPoint } from './sweep';

export interface ClawPlan {
  /** the palm ellipsoid: centre and semi-axes, claw frame */
  palm: { c: Vec3; r: Vec3 };
  /** finger centrelines, claw frame: the fixed finger and the dactyl (base → tip) */
  fixed: Vec3[];
  dactyl: Vec3[];
  /** finger radius at u ∈ [0, 1] along each */
  fixedR: (u: number) => number;
  dactylR: (u: number) => number;
}

const PTS = 9;

/** The claw's shape for a node of radius `r` (pure, claw frame). */
export function clawPlan(r: number): ClawPlan {
  const fixed: Vec3[] = [];
  const dactyl: Vec3[] = [];
  for (let k = 0; k < PTS; k++) {
    const u = k / (PTS - 1);
    // the fixed finger leaves the palm's lower front and curls up a little at the point
    fixed.push([0, -r * 0.42 + r * 0.34 * u * u, r * 1.55 + r * 1.75 * u]);
    // the dactyl hinges at the palm's upper front and closes down onto it
    dactyl.push([0, r * 0.5 - r * 0.32 * u - r * 0.12 * u * u, r * 1.4 + r * 1.95 * u]);
  }
  return {
    palm: { c: [0, 0, r * 0.7], r: [r * 0.78, r * 1.1, r * 1.5] },
    fixed,
    dactyl,
    fixedR: (u) => r * (0.44 - 0.4 * u),
    dactylR: (u) => r * (0.4 - 0.36 * u),
  };
}

/** Split a centreline at `cut` (fraction of its samples) → [base, tip], sharing the cut sample. */
function split(path: Vec3[], cut: number): [Vec3[], Vec3[]] {
  const k = Math.round((path.length - 1) * cut);
  return [path.slice(0, k + 1), path.slice(k)];
}

/**
 * The claw's geometry in body space (relative to its node): the palm and the fingers' roots (to wear
 * the creature's own skin) and the dark finger points. `quat` is the node's rest orientation.
 */
export function clawGeometry(r: number, quat: readonly number[]): { shell: THREE.BufferGeometry; tips: THREE.BufferGeometry } {
  const plan = clawPlan(r);
  const q = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]);
  const side: Vec3 = [1, 0, 0]; // the flattening axis: a claw is pressed flat side to side
  const tube = (path: Vec3[], radius: (u: number) => number, u0: number, u1: number) => {
    const pts: SweepPoint[] = path.map((p) => ({ p, n: side }));
    return sweepTube(pts, { radius: (u) => radius(u0 + (u1 - u0) * u), flatten: 0.75, radialSegments: 10 });
  };
  const CUT = 0.55;
  const [fb, ft] = split(plan.fixed, CUT);
  const [db, dt] = split(plan.dactyl, CUT);
  const palm = new THREE.SphereGeometry(1, 20, 14).deleteAttribute('uv'); // (the tubes carry no uv; merging needs one attribute set)
  palm.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...plan.palm.c), new THREE.Quaternion(), new THREE.Vector3(...plan.palm.r)));
  // the dactyl's hinge knuckle
  const knuckle = new THREE.SphereGeometry(1, 12, 8).deleteAttribute('uv');
  knuckle.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...plan.dactyl[0]), new THREE.Quaternion(), new THREE.Vector3(r * 0.36, r * 0.36, r * 0.42)));
  const shellParts = [palm, knuckle, tube(fb, plan.fixedR, 0, CUT), tube(db, plan.dactylR, 0, CUT)];
  const tipParts = [tube(ft, plan.fixedR, CUT, 1), tube(dt, plan.dactylR, CUT, 1)];
  const merge = (parts: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false) ?? parts[0];
    for (const p of parts) if (p !== g) p.dispose();
    g.applyQuaternion(q);
    g.computeVertexNormals();
    return g;
  };
  return { shell: merge(shellParts), tips: merge(tipParts) };
}
