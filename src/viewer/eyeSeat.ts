/**
 * Seating an eye in the face.
 *
 * The grown eye node rides proud of (or deep under) the skin wherever its bud landed, and its aim
 * can run oblique to the skull. These measure the real skin — the same hybrid body field the smooth
 * surface is meshed from — and say where a lidded face eye's ball should sit and point, so a third
 * of it shows, centred in the opening the skin cuts round it. The fur shells read the same seats to
 * keep their pile out of the eyes.
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { fieldAt, projectToSurface, qRotateV } from './bodyField';
import type { MeshFeature } from './meshData';
import { surfacePrims } from './mouthLine';
import { eyeVariant } from './partStyles';

/** how deep the ball's centre sits under the skin, in eye radii */
export const SEAT_DEPTH = 0.42;
/** …and a frog's: its eyes bulge from the crown, half the ball proud */
export const BULGE_DEPTH = 0.06;

/** A frog's or a toad's eye: bare skin, a walker (not a fish), looking up out of the top of the head. */
export function bulgingEye(p: Phenotype, aim: readonly number[]): boolean {
  return p.genomeRef.covering.type === 'skin' && !isSwimmer(p) && aim[1] > 0.45;
}
/** the most a seated eye's aim may stray from the face normal (rad) */
export const SEAT_MAX_TILT = 0.5;

/** Where a lidded face eye really sits. First it turns to within ~29° of the face's normal: the
 *  grown aim can run oblique to the skull (a forward gaze set on a rounded head), and the opening the
 *  skin cuts round the ball then sits off the iris — a crescent of bare eyeball to one side. Then it
 *  marches along that aim until its centre lies ~0.42r under the surface, so about a third of the
 *  ball shows: a fixed sink buried eyes the head already half-swallowed (under a deer's brow) and
 *  left proud ones bulging (a lizard's, a bird's). Cached per phenotype (the fur shells read it too). */
export interface EyeSeat {
  quat: readonly number[];
  sink: number;
  centre: [number, number, number] | null; // the seated ball's centre, body space
}
const SEATS = new WeakMap<Phenotype, Map<number, EyeSeat>>();
export function eyeSeat(p: Phenotype, idx: number, quat0: readonly number[], r: number): EyeSeat {
  let per = SEATS.get(p);
  if (!per) SEATS.set(p, (per = new Map()));
  const hit = per.get(idx);
  if (hit) return hit;
  const prims = surfacePrims(p, 'hybrid');
  const c = p.nodes[idx].pos;
  let quat = quat0;
  let aim = qRotateV(quat, [0, 0, 1]);
  const n = projectToSurface(prims, [], [c[0], c[1], c[2]]).n;
  const ang = Math.acos(Math.max(-1, Math.min(1, aim[0] * n[0] + aim[1] * n[1] + aim[2] * n[2])));
  if (ang > SEAT_MAX_TILT) {
    const axis = new THREE.Vector3(aim[1] * n[2] - aim[2] * n[1], aim[2] * n[0] - aim[0] * n[2], aim[0] * n[1] - aim[1] * n[0]);
    if (axis.lengthSq() > 1e-10) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), ang - SEAT_MAX_TILT).multiply(new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]));
      quat = [q.x, q.y, q.z, q.w];
      aim = qRotateV(quat, [0, 0, 1]);
    }
  }
  const depth = bulgingEye(p, aim) ? BULGE_DEPTH : SEAT_DEPTH;
  let s = r * 0.36;
  for (let i = 0; i < 8; i++) {
    const d = fieldAt(prims, c[0] - aim[0] * s, c[1] - aim[1] * s, c[2] - aim[2] * s);
    s = Math.min(r * 1.1, Math.max(-r * 0.6, s + d + r * depth));
  }
  const seat: EyeSeat = { quat, sink: s, centre: [c[0] - aim[0] * s, c[1] - aim[1] * s, c[2] - aim[2] * s] };
  per.set(idx, seat);
  return seat;
}

/** A swimmer: fins and no legs (a fish, a shark) — its eyes are lidless and lie flush with the head. */
export function isSwimmer(p: Phenotype): boolean {
  let fins = false;
  for (const n of p.nodes) {
    if (n.part?.kind === 'leg') return false;
    if (n.part?.kind === 'fin') fins = true;
  }
  return fins;
}

/** A vertebrate eye set in the face (lidded, on a spine node — not up a stalk). */
export function isFaceEye(p: Phenotype, f: MeshFeature): boolean {
  const v = eyeVariant(f.style);
  if (v !== 'round' && v !== 'beady' && v !== 'slit') return false;
  const e = p.edges.find(([, b]) => b === f.idx);
  return !!e && p.nodes[e[0]].kind === 'spine';
}

/** The fur shells' bare rings: each eye's seated centre + radius (xyz r, flat; at most MAX_EYE_CLEAR). */
export const MAX_EYE_CLEAR = 6;
export function eyeClearings(p: Phenotype, features: readonly MeshFeature[]): number[] {
  const out: number[] = [];
  for (const f of features) {
    if (f.type !== 'eye' || out.length >= MAX_EYE_CLEAR * 4) continue;
    const r = Math.max(f.radius, 0.06);
    const c = isFaceEye(p, f) ? eyeSeat(p, f.idx, f.quat, r).centre : null;
    const at = c ?? p.nodes[f.idx].pos;
    out.push(at[0], at[1], at[2], r);
  }
  return out;
}
