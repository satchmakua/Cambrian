/**
 * Toed feet and bare shanks.
 *
 * A bird stands on scaly, featherless shanks ending in four thin toes — three spread forward, the
 * hallux turned back — each tipped with a claw. A lizard's foot is a splayed fan of five clawed
 * toes. Both are authored in the BODY frame around the foot node (toes run along the ground, +Z
 * forward), so they read the same on either side and need no per-leg mirroring. The toes wear the
 * body's own covering material (baked body-space coordinates), which below the bare line is the
 * keratin of the shanks — the toe joins the leg without a seam.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Phenotype } from '../engine/grow';
import { shankColor } from './keratin';
import type { BareLegs } from './creatureMaterial';

export type FootPlan = 'bird' | 'reptile' | 'frog' | 'theropod';

/** A THEROPOD: a scaled, bare-skinned or feathered body walking on one pair of clawed legs that
 *  carries a pair of arms, not wings, in front of them — the two-legged dinosaur (a bird's forelimbs
 *  are its wings, a lizard walks on four, and a furred ape stands on flat feet, not claws). */
export function isTheropod(p: Phenotype): boolean {
  const t = p.genomeRef.covering.type;
  if (t !== 'feathers' && t !== 'scales' && t !== 'plates' && t !== 'skin') return false;
  const apps = p.genomeRef.body.appendages;
  const legs = apps.filter((a) => a.kind === 'leg');
  return (
    legs.length === 1 &&
    legs[0].terminal === 'claw' &&
    apps.some((a) => a.kind === 'arm' && a.terminal === 'hand') &&
    !apps.some((a) => a.kind === 'wing')
  );
}

/** Which toed foot a clawed leg ends in, by covering (arthropods keep their single tarsal claw):
 *  feathers → a bird's, scales/plates → a lizard's clawed fan, bare skin → a frog's pad-tipped toes.
 *  A theropod stands on three thick clawed toes whatever it wears: on a lizard's fan of five, or a
 *  frog's long pad-tipped fingers, a striding dinosaur stood on a pair of small splayed hands. */
export function footPlanOf(p: Phenotype): FootPlan | null {
  const t = p.genomeRef.covering.type;
  if (isTheropod(p)) return 'theropod';
  if (t === 'feathers') return 'bird';
  if (t === 'scales' || t === 'plates' || t === 'crystal') return 'reptile';
  if (t === 'skin') return 'frog';
  return null;
}

/** The leg chains: [hip node, …, foot node] for every leg that reaches a terminal. */
function legChains(p: Phenotype): number[][] {
  const parent = new Int32Array(p.nodes.length).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  const out: number[][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
    const chain = [i];
    let j = parent[i];
    while (j >= 0 && p.nodes[j].part?.kind === 'leg' && p.nodes[j].kind !== 'spine') {
      chain.unshift(j);
      j = parent[j];
    }
    out.push(chain);
  });
  return out;
}

/** A feathered body's bare-shank line: plumage covers the thigh and "drumstick", the lower ~55% of
 *  the standing leg is scaly keratin. Null for anything that isn't feathered with legs. */
export function bareLegsOf(p: Phenotype): BareLegs | null {
  if (p.genomeRef.covering.type !== 'feathers') return null;
  const chains = legChains(p).filter((c) => c.length >= 2);
  if (chains.length === 0) return null;
  let hip = 0;
  let foot = 0;
  for (const c of chains) {
    hip += p.nodes[c[0]].pos[1];
    foot += p.nodes[c[c.length - 1]].pos[1];
  }
  hip /= chains.length;
  foot /= chains.length;
  const span = hip - foot;
  if (span <= 0.05) return null;
  return { y: foot + span * 0.55, band: span * 0.06, color: shankColor(p.genomeRef.seed) };
}

/**
 * How much each vertex of a body surface belongs to a LEG (0..1), from its rest-pose body position:
 * 1 where the nearest part of the skeleton is a leg segment, 0 where it is anything else (the trunk,
 * a tail, a neck), soft across a few hundredths of a body unit. The bare-shank zone is gated on it —
 * by height alone, a low-slung bird's belly and tail were painted as scaly leg.
 */
export function legWeights(p: Phenotype, bodyPos: ArrayLike<number>, count: number): Float32Array {
  const isLeg = (i: number) => p.nodes[i].part?.kind === 'leg' && p.nodes[i].kind !== 'spine';
  type Seg = { a: readonly number[]; b: readonly number[]; ra: number; rb: number };
  const legs: Seg[] = [];
  const other: Seg[] = [];
  for (const [ia, ib] of p.edges) {
    const A = p.nodes[ia], B = p.nodes[ib];
    // a segment is leg only when both ends are (the hip's attachment to the trunk is trunk)
    (isLeg(ia) && isLeg(ib) ? legs : other).push({ a: A.pos, b: B.pos, ra: A.radius, rb: B.radius });
  }
  // the body's own shaped nodes (a broad slab of a trunk reaches past its capsules)
  for (const n of p.nodes) {
    if (n.kind !== 'spine') continue;
    const r = n.radius * (n.scale ? (n.scale[0] + n.scale[1] + n.scale[2]) / 3 : 1);
    other.push({ a: n.pos, b: n.pos, ra: r, rb: r });
  }
  const out = new Float32Array(count);
  if (legs.length === 0) return out;
  const dist = (s: Seg, x: number, y: number, z: number) => {
    const ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1], ez = s.b[2] - s.a[2];
    const L2 = ex * ex + ey * ey + ez * ez;
    let t = L2 > 1e-12 ? ((x - s.a[0]) * ex + (y - s.a[1]) * ey + (z - s.a[2]) * ez) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.a[0] + ex * t - x, cy = s.a[1] + ey * t - y, cz = s.a[2] + ez * t - z;
    return Math.sqrt(cx * cx + cy * cy + cz * cz) - (s.ra + (s.rb - s.ra) * t);
  };
  const band = 0.05;
  for (let v = 0; v < count; v++) {
    const x = bodyPos[v * 3], y = bodyPos[v * 3 + 1], z = bodyPos[v * 3 + 2];
    let dl = Infinity, doth = Infinity;
    for (const s of legs) dl = Math.min(dl, dist(s, x, y, z));
    for (const s of other) doth = Math.min(doth, dist(s, x, y, z));
    const u = Math.min(1, Math.max(0, ((doth - dl) / band + 1) / 2));
    out[v] = u * u * (3 - 2 * u);
  }
  return out;
}

/** Length of the leg's last link (foot node → its parent), for proportioning the toes. */
export function lastLinkOf(p: Phenotype, idx: number): number {
  for (const [a, b] of p.edges) {
    if (b !== idx) continue;
    const u = p.nodes[a].pos, v = p.nodes[idx].pos;
    return Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  }
  return p.nodes[idx].radius * 3;
}

interface ToeSpec {
  az: number; // heading off body-forward (rad, about +Y)
  len: number;
  r0: number; // root radius
}

/** A leg part's style gene at or over this ends a bird's leg in a bird of prey's foot. */
export const TALONED = 0.6;

function toesOf(plan: FootPlan, r: number, link: number, taloned = false): ToeSpec[] {
  if (plan === 'bird' && taloned) {
    // a bird of prey's foot is its weapon: thick, widely spread toes, the hind one nearly as long as
    // the front three (it closes the grip). (On a songbird's thin perching toes a hawk stood on wire.)
    const L = Math.max(r * 4.6, link * 0.7);
    const t = Math.max(r * 0.52, L * 0.115);
    return [
      { az: -0.62, len: L * 0.9, r0: t },
      { az: 0, len: L, r0: t * 1.05 },
      { az: 0.62, len: L * 0.9, r0: t },
      { az: Math.PI, len: L * 0.7, r0: t * 1.05 }, // the hallux
    ];
  }
  if (plan === 'bird') {
    const L = Math.max(r * 3.4, link * 0.55);
    const t = Math.max(r * 0.34, L * 0.075);
    return [
      { az: -0.48, len: L * 0.9, r0: t },
      { az: 0, len: L, r0: t * 1.05 },
      { az: 0.48, len: L * 0.9, r0: t },
      { az: Math.PI, len: L * 0.5, r0: t * 0.9 }, // the hallux
    ];
  }
  if (plan === 'theropod') {
    // three stout toes spread forward, the middle one longest, and a short spur of a hallux behind:
    // a big foot, about as long as half the shank above it
    const L = Math.max(r * 3.2, link * 0.5);
    const t = Math.max(r * 0.52, L * 0.14);
    return [
      { az: -0.5, len: L * 0.8, r0: t * 0.94 },
      { az: 0, len: L, r0: t },
      { az: 0.5, len: L * 0.8, r0: t * 0.94 },
      { az: Math.PI, len: L * 0.3, r0: t * 0.7 },
    ];
  }
  if (plan === 'frog') {
    // long, thin, widely splayed toes
    const L = Math.max(r * 2.8, link * 0.42);
    const t = Math.max(r * 0.26, L * 0.075);
    return [-1.15, -0.55, 0, 0.55, 1.15].map((az, i) => ({ az, len: L * (i === 0 || i === 4 ? 0.7 : i === 2 ? 1 : 0.88), r0: t }));
  }
  const L = Math.max(r * 2.2, link * 0.32);
  const t = Math.max(r * 0.36, L * 0.13);
  return [-0.95, -0.48, 0, 0.48, 0.95].map((az, i) => ({ az, len: L * (i === 0 || i === 4 ? 0.62 : i === 2 ? 1 : 0.86), r0: t }));
}

/**
 * A talon: a horn hook that leaves the toe tip rising a little, curls over and comes down to a
 * point — `len` along its arc, `r0` thick at the root, `dir` the toe's heading along the ground.
 */
function talonGeometry(root: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number): THREE.BufferGeometry {
  const N = 7, M = 8;
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(up, dir).normalize();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = root.clone();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const phi = TALON_RISE - TALON_CURL * u; // the arc's heading above the ground
    const tan = dir.clone().multiplyScalar(Math.cos(phi)).addScaledVector(up, Math.sin(phi));
    const nrm = up.clone().multiplyScalar(Math.cos(phi)).addScaledVector(dir, -Math.sin(phi));
    const rad = Math.max(r0 * 0.05, r0 * Math.pow(1 - u, 0.85));
    for (let k = 0; k < M; k++) {
      const a = (k / M) * Math.PI * 2;
      // (a little deeper than wide: a blade of horn, not a peg)
      pos.push(p.x + nrm.x * Math.cos(a) * rad + side.x * Math.sin(a) * rad * 0.8, p.y + nrm.y * Math.cos(a) * rad + side.y * Math.sin(a) * rad * 0.8, p.z + nrm.z * Math.cos(a) * rad + side.z * Math.sin(a) * rad * 0.8);
      uv.push(k / M, u);
    }
    p.addScaledVector(tan, len / N);
  }
  for (let i = 0; i < N; i++)
    for (let k = 0; k < M; k++) {
      const a = i * M + k, b = i * M + ((k + 1) % M), c = a + M, d = b + M;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** a talon's heading as it leaves the toe (rad above the ground) and how far it turns over its length */
const TALON_RISE = 0.35;
const TALON_CURL = 1.55;
/** …so its point comes down this much of its length below its root */
export const TALON_DROP = (Math.cos(TALON_RISE - TALON_CURL) - Math.cos(TALON_RISE)) / -TALON_CURL;
/** a talon's length and root thickness, in toe-root radii */
const TALON_LEN = 3.6;
const TALON_ROOT = 0.72;

/** The toes (skin) and claws (dark keratin) of one foot, in the body frame about the foot node.
 *  `taloned` is the cut of a bird of prey's foot (a bird's only): stout toes ending in long hooks. */
export function toedFootGeometry(plan: FootPlan, r: number, link: number, taloned = false): { toes: THREE.BufferGeometry; claws: THREE.BufferGeometry } {
  const hooked = taloned && plan === 'bird';
  const toes: THREE.BufferGeometry[] = [];
  const claws: THREE.BufferGeometry[] = [];
  const floor = -r; // the foot node's underside sits on the ground (levelFeet)
  const up = new THREE.Vector3(0, 1, 0);
  // a pad under the ankle joining the toes
  const pad = new THREE.SphereGeometry(1, 12, 8);
  // (tall enough to swallow the end of the leg tube above it)
  pad.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, floor + r * 0.62, 0), new THREE.Quaternion(), new THREE.Vector3(r * 1.08, r * 0.72, r * 1.08)));
  toes.push(pad);
  for (const t of toesOf(plan, r, link, hooked)) {
    const dir = new THREE.Vector3(Math.sin(t.az), 0, Math.cos(t.az));
    // two phalanges: up over a knuckle and down to the claw, so the toe grips rather than lies flat
    const y0 = floor + t.r0 * 1.1;
    const knuckle = dir.clone().multiplyScalar(t.len * 0.5).setY(floor + t.r0 * 1.45);
    // (a hooked talon needs room to come down: the toe's end rides high enough that its point just
    // meets the ground instead of stabbing through it)
    const tip = dir.clone().multiplyScalar(t.len).setY(floor + t.r0 * (hooked ? TALON_LEN * TALON_DROP : 0.75));
    const pts = [new THREE.Vector3(0, y0, 0), knuckle, tip];
    for (let k = 0; k < 2; k++) {
      const a = pts[k], b = pts[k + 1];
      const ra = t.r0 * (k === 0 ? 1 : 0.82), rb = t.r0 * (k === 0 ? 0.82 : 0.6);
      const seg = b.clone().sub(a);
      const cyl = new THREE.CylinderGeometry(rb, ra, seg.length(), 8, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(up, seg.clone().normalize());
      cyl.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      toes.push(cyl);
      const joint = new THREE.SphereGeometry(rb, 8, 6);
      joint.translate(b.x, b.y, b.z);
      toes.push(joint);
    }
    if (plan === 'frog') {
      // no claw: a round adhesive pad on the toe tip
      const pad = new THREE.SphereGeometry(t.r0 * 1.45, 10, 8);
      pad.applyMatrix4(new THREE.Matrix4().compose(tip.clone().setY(floor + t.r0 * 0.9), new THREE.Quaternion(), new THREE.Vector3(1, 0.6, 1)));
      toes.push(pad);
      continue;
    }
    if (hooked) {
      claws.push(talonGeometry(tip.clone().addScaledVector(dir, -t.r0 * 0.3), dir, t.r0 * TALON_LEN, t.r0 * TALON_ROOT));
      continue;
    }
    // the claw: a curved-down cone off the tip
    const cdir = dir.clone().setY(-0.55).normalize();
    const cl = t.r0 * (plan === 'bird' ? 2.2 : plan === 'theropod' ? 2.3 : 1.9);
    const claw = new THREE.ConeGeometry(t.r0 * 0.5, cl, 6);
    claw.applyMatrix4(
      new THREE.Matrix4().compose(tip.clone().add(cdir.clone().multiplyScalar(cl * 0.45)), new THREE.Quaternion().setFromUnitVectors(up, cdir), new THREE.Vector3(1, 1, 1)),
    );
    claws.push(claw);
  }
  const merge = (gs: THREE.BufferGeometry[]) => {
    const m = mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)), false) ?? gs[0];
    for (const g of gs) if (g !== m) g.dispose();
    return m;
  };
  // (a frog's foot has no claws: an empty geometry keeps the mesh pair uniform)
  return { toes: merge(toes), claws: claws.length ? merge(claws) : new THREE.BufferGeometry() };
}

/**
 * A theropod's hand: a small palm and three short fingers reaching on along the forearm, each bent
 * down at the knuckle and tipped with a dark hooked claw. Authored along the wrist node's rest
 * orientation `quat` (local +Z runs on down the arm, local −Y is the way the elbow folds) and
 * returned in the body frame about the node, like a foot. (A primate's flat four-fingered hand at
 * the end of an arm this small was a dark knot — a burnt lump on a stick.)
 */
export function clawedHandGeometry(r: number, quat: readonly number[]): { fingers: THREE.BufferGeometry; claws: THREE.BufferGeometry } {
  const fingers: THREE.BufferGeometry[] = [];
  const claws: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const palm = new THREE.SphereGeometry(1, 10, 8);
  palm.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, 0, r * 0.35), new THREE.Quaternion(), new THREE.Vector3(r * 1.25, r * 0.85, r * 1.2)));
  fingers.push(palm);
  const t = r * 0.42; // a finger's root radius
  const L = r * 3.0; // …and its length
  [-0.5, 0, 0.5].forEach((az, i) => {
    const len = L * (i === 1 ? 1 : 0.86);
    const root = new THREE.Vector3(Math.sin(az) * r * 0.75, 0, r * 0.7);
    const knuckle = root.clone().add(new THREE.Vector3(Math.sin(az) * 0.9, -0.25, Math.cos(az)).normalize().multiplyScalar(len * 0.55));
    const tip = knuckle.clone().add(new THREE.Vector3(Math.sin(az) * 0.5, -0.9, Math.cos(az) * 0.6).normalize().multiplyScalar(len * 0.45));
    const pts = [root, knuckle, tip];
    for (let k = 0; k < 2; k++) {
      const a = pts[k], b = pts[k + 1];
      const ra = t * (k === 0 ? 1 : 0.85), rb = t * (k === 0 ? 0.85 : 0.65);
      const seg = b.clone().sub(a);
      const cyl = new THREE.CylinderGeometry(rb, ra, seg.length(), 8, 1);
      cyl.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, seg.clone().normalize()), one));
      fingers.push(cyl);
      const joint = new THREE.SphereGeometry(rb, 8, 6);
      joint.translate(b.x, b.y, b.z);
      fingers.push(joint);
    }
    // the claw hooks on down and back toward the palm
    const cdir = new THREE.Vector3(Math.sin(az) * 0.2, -1, -0.15).normalize();
    const cl = t * 2.6;
    const claw = new THREE.ConeGeometry(t * 0.6, cl, 6);
    claw.applyMatrix4(new THREE.Matrix4().compose(tip.clone().add(cdir.clone().multiplyScalar(cl * 0.42)), new THREE.Quaternion().setFromUnitVectors(up, cdir), one));
    claws.push(claw);
  });
  const turn = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]));
  const merge = (gs: THREE.BufferGeometry[]) => {
    const m = mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)), false) ?? gs[0];
    for (const g of gs) if (g !== m) g.dispose();
    m.applyMatrix4(turn);
    return m;
  };
  return { fingers: merge(fingers), claws: merge(claws) };
}
