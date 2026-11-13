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
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/**
 * The claw's shape for a node of radius `r` (pure, claw frame).
 *
 * The fingers are as long as the palm and half its depth each at the root, with daylight between them
 * from the palm's front edge to their points: that notch is what says "pincer". (As two short spikes
 * on the front of a long bulb, half buried in it, the claw read as a sharpened crayon.)
 */
export function clawPlan(r: number): ClawPlan {
  const fixed: Vec3[] = [];
  const dactyl: Vec3[] = [];
  for (let k = 0; k < PTS; k++) {
    const u = k / (PTS - 1);
    // the fixed finger runs on from the palm's underside, near level, and turns up at its point
    fixed.push([0, r * (-0.5 + 0.1 * u + 0.36 * u * u * u), r * (1.1 + 2.45 * u)]);
    // the dactyl hinges at the palm's upper front, arches over the gape and hooks down to meet it
    dactyl.push([0, r * (0.55 + 0.22 * u - 0.67 * u * u), r * (1.15 + 2.35 * u)]);
  }
  return {
    palm: { c: [0, 0, r * 0.5], r: [r * 0.62, r * 1.02, r * 1.2] },
    fixed,
    dactyl,
    fixedR: (u) => r * (0.46 - 0.42 * Math.pow(u, 1.2)),
    dactylR: (u) => r * (0.42 - 0.38 * Math.pow(u, 1.2)),
  };
}

/** how far short of the midline a paired claw's fingertips stop, in claw radii */
export const CHELA_GAP = 0.3;
/** the fingers' reach along the claw's aim, in claw radii (the fixed finger's point: see clawPlan) */
export const CLAW_REACH = 3.55;
/** the most a claw is turned in across the face (rad from straight ahead) */
export const CHELA_IN = 1.3;

/**
 * A paired claw's rest orientation, turned at the wrist about the body's vertical so its fingertips
 * come to rest just short of the midline, in front of the mouth: a crab's claws are held folded,
 * pointing in at each other. (Left at the arm's own heading, they crossed in an X before the face if
 * the arm curled far in, and ran straight out ahead like a lobster's if it did not.) A claw on the
 * midline itself (unpaired) keeps its aim.
 */
export function wristQuat(quat: readonly number[], origin: readonly number[], r: number): number[] {
  const x0 = origin[0];
  const gap = CHELA_GAP * r;
  if (Math.abs(x0) <= gap) return [quat[0], quat[1], quat[2], quat[3]];
  const side = Math.sign(x0);
  const q = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]);
  const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const h = Math.hypot(aim.x, aim.z);
  if (h < 1e-6) return [quat[0], quat[1], quat[2], quat[3]];
  // the heading (about +Y, from +Z toward +X) that lands the tip `gap` short of the midline
  const inward = Math.min(CHELA_IN, Math.asin(Math.min(1, (Math.abs(x0) - gap) / (CLAW_REACH * r * h))));
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -side * inward - Math.atan2(aim.x, aim.z));
  const out = turn.multiply(q);
  return [out.x, out.y, out.z, out.w];
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
    const loose = parts.map((p) => (p.index ? p.toNonIndexed() : p));
    const soup = mergeGeometries(loose, false) ?? loose[0];
    for (const p of [...parts, ...loose]) if (p !== soup) p.dispose();
    // weld by position, then shade smooth: left as a triangle soup, every triangle took its own
    // normal and the palm was a ball of flat tiles on an otherwise smooth animal
    soup.deleteAttribute('normal');
    const g = mergeVertices(soup, r * 1e-4);
    if (g !== soup) soup.dispose();
    g.applyQuaternion(q);
    g.computeVertexNormals();
    return g;
  };
  return { shell: merge(shellParts), tips: merge(tipParts) };
}
