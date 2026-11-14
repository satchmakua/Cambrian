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
import { cross3, dot3, fieldAt, norm3, projectToSurface, qRotateV, type FieldPrims } from './bodyField';
import type { Vec3 } from '../engine/genome';
import type { MeshFeature } from './meshData';
import { surfacePrims } from './mouthLine';
import { eyeVariant } from './partStyles';
import { armoured } from './scutes';

/** how deep the ball's centre sits under the skin, in eye radii */
/** the deepest an eye's seat may sink its ball along its gaze (× its radius) */
const SEAT_MAX_SINK = 2.0;
export const SEAT_DEPTH = 0.52;
/** …and a frog's: its eyes bulge from the crown, half the ball proud */
export const BULGE_DEPTH = 0.06;
/** …and an octopus's (a radial body's slit eye): raised on the side of its head in a turret of its own
 *  skin — its round lids — most of the ball proud. (Seated a third out like a mammal's, flush in the
 *  mantle, it was a pale disc with a dark bar across it: a mouth.) */
export const TURRET_DEPTH = 0.2;
/** …and an insect's compound eye: a low dome on the side of its head, most of the ball under the
 *  cuticle. (Stood on its node unseated, riding proud of the head, it was a black marble bolted on.) */
export const COMPOUND_DEPTH = 0.4;
/** …and a spider's simple eye: a glossy lens, half its ball out of the carapace, unpressed (see isOcellus) */
export const OCELLUS_DEPTH = 0.4;

/** A SPIDER's eye: one on a face that is its CEPHALOTHORAX — a body section past the trunk carrying legs too
 *  (as its chelicerae are: mouths/mandibles isChelicerate). A simple eye, a lens: a glossy black dome out of
 *  the carapace, no lids, no iris, at its own size (grow's OCELLI: the small ones are beads). */
export function isOcellus(p: Phenotype, idx: number): boolean {
  const e = p.edges.find(([, b]) => b === idx);
  const base = e ? p.nodes[e[0]] : undefined;
  if (!base || base.kind !== 'spine' || !base.segment) return false;
  return p.edges.some(([a, b]) => p.nodes[b].part?.kind === 'leg' && p.nodes[a].kind === 'spine' && p.nodes[a].segment === base.segment);
}

/** A frog's or a toad's eye: bare skin, a walker (not a fish), looking up out of the top of the head.
 *  A crocodile's too (an armoured body — see scutes): its eyes ride raised on the skull's upper
 *  edges, the last of it to go under. (Sunk in the flat skull like a lizard's they were two dots.) */
export function bulgingEye(p: Phenotype, aim: readonly number[]): boolean {
  if (aim[1] <= 0.45 || isSwimmer(p)) return false;
  return p.genomeRef.covering.type === 'skin' || armoured(p);
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
  /** how the eye is pressed down into its skin (see eyeFlat), or null: it stands as seated */
  flat?: EyeFlat | null;
}

/** The most a seated face eye stands out of its skin (× its radius). Seated a third of the ball proud, every
 *  lidded eye was a dome 0.3r high (a glowing one 0.5r), and on the side of a round head the far eye crossed
 *  the head's outline — a goggle on a bird's, a hawk's, a mouse's, a crystal beast's head. What stands further
 *  out is pressed down along the skin's normal: the opening keeps its size, the dome over it flattens to a
 *  cornea's. */
export const EYE_PROUD = 0.12;
/** …toward the skin's mean height over a ring this far round the eye (× its radius): on a round head the skin
 *  falls away under the eye's rim, and pressed only toward the skin at its middle, the rim still stood off */
export const EYE_RING = 0.7;
/** A squash by `s` along `n` about the plane through `at` (body space): x' = x + n·((x − at)·n)·(s − 1). */
export interface EyeFlat {
  at: [number, number, number];
  n: [number, number, number];
  s: number;
}
function eyeFlat(prims: FieldPrims, centre: Vec3, aim: readonly number[], r: number, ballZ: number): EyeFlat | null {
  const sp = projectToSurface(prims, [], [centre[0], centre[1], centre[2]]);
  const n = norm3(sp.n);
  const t1 = norm3(cross3(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const t2 = cross3(n, t1);
  let sum = 0;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const c = Math.cos(a) * EYE_RING * r, sn = Math.sin(a) * EYE_RING * r;
    const q = [sp.p[0] + t1[0] * c + t2[0] * sn, sp.p[1] + t1[1] * c + t2[1] * sn, sp.p[2] + t1[2] * c + t2[2] * sn];
    let h = 0; // the skin's height over q along n
    for (let i = 0; i < 6; i++) h = Math.max(-2 * r, Math.min(r, h - fieldAt(prims, q[0] + n[0] * h, q[1] + n[1] * h, q[2] + n[2] * h)));
    sum += h;
  }
  const sag = Math.max(0, -sum / 6);
  const at: [number, number, number] = [sp.p[0] - n[0] * sag, sp.p[1] - n[1] * sag, sp.p[2] - n[2] * sag];
  const ball = [centre[0] + aim[0] * ballZ * r - at[0], centre[1] + aim[1] * ballZ * r - at[1], centre[2] + aim[2] * ballZ * r - at[2]];
  const top = dot3(ball as Vec3, n) + 0.9 * r; // the ball's highest point over that plane
  const s = Math.min(1, Math.max(0.25, (sag + EYE_PROUD * r) / top));
  return s < 0.999 ? { at, n: [n[0], n[1], n[2]], s } : null;
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
  // (a compound eye, and an alien's glowing one, sit as low domes in the head)
  const ev = eyeVariant(p.nodes[idx].part?.style ?? 0.5);
  const ocellus = isOcellus(p, idx);
  const bulge = !ocellus && ev !== 'compound' && ev !== 'glowing' && bulgingEye(p, aim);
  const turret = ev === 'slit' && p.genomeRef.symmetry === 'radial';
  const depth = ocellus ? OCELLUS_DEPTH : ev === 'compound' || ev === 'glowing' ? COMPOUND_DEPTH : bulge ? BULGE_DEPTH : turret ? TURRET_DEPTH : SEAT_DEPTH;
  // Seated by the SKIN along its aim, not by the field's value: on a flattened section the field is no distance
  // (ellipticConeDist scales it by the section's smaller axis, so across the wide one it under-reads), and marched
  // to a field of −depth·r an eye on the side of a flat skull sank depth × its width-to-height: a snake's (1.85 : 1)
  // a whole radius — the skin closed over the ball and only the tip of its slit showed, a speck — a lizard's,
  // a cat's or a weasel's a third deeper than it should. The skin is found coming in along the aim from outside
  // it (the node itself may have grown just under it).
  const inside = (t: number) => fieldAt(prims, c[0] - aim[0] * t, c[1] - aim[1] * t, c[2] - aim[2] * t) <= 0;
  let s = r * 0.36;
  let out = -1.5 * r, at = NaN;
  if (!inside(out)) {
    for (let t = out + r * 0.25; t <= r * (SEAT_MAX_SINK + 1); t += r * 0.25) {
      if (inside(t)) {
        at = t;
        break;
      }
      out = t;
    }
  }
  if (!Number.isNaN(at)) {
    for (let i = 0; i < 16; i++) {
      const m = (out + at) / 2;
      if (inside(m)) at = m;
      else out = m;
    }
    // (as deep as two radii: an eye grown at a flattened skull's round radius floats a radius over its
    // skin, and stopped at one it sat half out of the head — a bead on a lizard's broad flat crown)
    s = Math.min(r * SEAT_MAX_SINK, Math.max(-r * 0.6, at + r * depth));
  } else {
    // (a node grown inside its skin, or an aim that never meets it within reach: marched by the field, as before)
    for (let i = 0; i < 8; i++) {
      const d = fieldAt(prims, c[0] - aim[0] * s, c[1] - aim[1] * s, c[2] - aim[2] * s);
      s = Math.min(r * SEAT_MAX_SINK, Math.max(-r * 0.6, s + d + r * depth));
    }
  }
  const centre: [number, number, number] = [c[0] - aim[0] * s, c[1] - aim[1] * s, c[2] - aim[2] * s];
  // (a frog's and a crocodile's eyes bulge, an insect's facets are a dome by design, a fish's lie flush, a radial
  // body's eyes — an octopus's, a horror's band — are its own; the rest are pressed into the skin)
  // (…and a spider's are lenses, domes by design: pressed to a twelfth of their radius they were black stains)
  const pressed = p.genomeRef.symmetry === 'bilateral' && !bulge && !ocellus && ev !== 'compound' && (ev === 'glowing' || !isSwimmer(p));
  const seat: EyeSeat = { quat, sink: s, centre, flat: pressed ? eyeFlat(prims, centre, aim, r, ev === 'slit' ? -0.02 : ev === 'glowing' ? 0.02 : -0.04) : null };
  per.set(idx, seat);
  return seat;
}

/** An eye rolled about its own gaze by more than this (rad) wears a BROW along its upper lid. */
export const BROW_TILT = 0.25;

/**
 * How far an eye is rolled about its own gaze (rad, unsigned): 0 as every eye grows, more when its
 * gene tilts it. A tilted eye's lids slant down toward the bill, and a ridge of brow is drawn over
 * the upper one — a hawk's scowl. (Round and wide open under a bare forehead, a bird of prey's eye
 * was a dove's.)
 */
export function eyeTilt(quat: readonly number[]): number {
  const aim = qRotateV(quat, [0, 0, 1]);
  const plain = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(aim[0], aim[1], aim[2]));
  const d = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]).multiply(plain.invert());
  const a = Math.abs(2 * Math.atan2(d.x * aim[0] + d.y * aim[1] + d.z * aim[2], d.w));
  return a > Math.PI ? 2 * Math.PI - a : a;
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

/** A slug's eye (an eye up a stalk on a slime body) is the tip of a FEELER: the stalk swells to a knob
 *  in its own skin, FEELER_KNOB × the eye's radius, and the eye is a dark spot in its point —
 *  FEELER_SPOT: how far out along the stalk, and its radius, both × the eye's radius. No lids, no
 *  eyeball. (A lidded vertebrate eyeball on each stalk, set in green lids, was a pair of visors.) */
export const FEELER_KNOB = 0.8;
export const FEELER_SPOT: readonly [number, number] = [0.62, 0.3];
export function feelerTip(p: Phenotype, idx: number): boolean {
  if (p.genomeRef.covering.type !== 'slime' || p.nodes[idx]?.terminal !== 'eye') return false;
  const e = p.edges.find(([, b]) => b === idx);
  return !!e && p.nodes[e[0]].kind === 'limb' && p.nodes[e[0]].part?.kind === 'eyestalk';
}

/** The fur shells' bare rings: each eye's seated centre + radius (xyz r, flat; at most MAX_EYE_CLEAR). */
export const MAX_EYE_CLEAR = 8; // (a spider's eight)
export function eyeClearings(p: Phenotype, features: readonly MeshFeature[]): number[] {
  const out: number[] = [];
  for (const f of features) {
    if (f.type !== 'eye' || out.length >= MAX_EYE_CLEAR * 4) continue;
    const r = isOcellus(p, f.idx) ? f.radius : Math.max(f.radius, 0.06);
    const c = isFaceEye(p, f) ? eyeSeat(p, f.idx, f.quat, r).centre : null;
    const at = c ?? p.nodes[f.idx].pos;
    out.push(at[0], at[1], at[2], r);
  }
  return out;
}
