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
import { coatMain } from './palette';
import type { BareLegs } from './creatureMaterial';

export type FootPlan = 'bird' | 'reptile' | 'frog' | 'theropod' | 'stump';

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

/** A FLIGHTLESS BIRD's plumage (an ostrich's, an emu's): loose shaggy plumes, drawn as long shells. A
 *  feathered body with no wing but a pair of clawed arms is a theropod, and its feathers lie sleek: in the
 *  ostrich's plumes (a pile 0.4 of its skull's girth deep, its strands two pixels across in the whole-body
 *  view) a dinosaur was a ball of green moss, its jaw buried, its plumes ending in a cliff at the knee. */
export function shaggyPlumage(p: Phenotype): boolean {
  return p.genomeRef.covering.type === 'feathers' && !p.nodes.some((n) => n.part?.kind === 'wing') && !isTheropod(p);
}

/** Which toed foot a clawed leg ends in, by covering (arthropods keep their single tarsal claw):
 *  feathers → a bird's, scales/plates → a lizard's clawed fan, bare skin → a frog's pad-tipped toes.
 *  A theropod stands on three thick clawed toes whatever it wears: on a lizard's fan of five, or a
 *  frog's long pad-tipped fingers, a striding dinosaur stood on a pair of small splayed hands. */
export function footPlanOf(p: Phenotype): FootPlan | null {
  const t = p.genomeRef.covering.type;
  if (isTheropod(p)) return 'theropod';
  // a tortoise stands on round stumps with short blunt claws (on a lizard's splayed fan, or a frog's
  // long pad-tipped toes, a shelled body stood on hands)
  if (t !== 'chitin' && p.genomeRef.body.appendages.some((a) => a.terminal === 'carapace')) return 'stump';
  if (t === 'feathers') return 'bird';
  if (t === 'scales' || t === 'plates' || t === 'crystal') return 'reptile';
  if (t === 'skin') return 'frog';
  return null;
}

/** A RAT-LIKE body: a small furred animal standing on paws and trailing a thin tail, or none — a mouse,
 *  a rat, a hamster.
 *  Its paws are bare pink skin with slender toes (in the coat, a mouse's paw was a fuzzy slipper).
 *  Small: the back stands under RAT_HEIGHT above the lowest thing on it (a rat ~1, a weasel ~1.3, a cat
 *  ~2.5). Thin-tailed: the tail's root under RAT_TAIL of the trunk's radius (a rat's ~0.12, a cat's
 *  ~0.2 — but a cat is tall — a weasel's brush ~0.37). */
export const RAT_HEIGHT = 1.6;
export const RAT_TAIL = 0.26;
/** The tail's root radius against the trunk's (Infinity with no tail): a rat's ~0.12, a cat's ~0.2, a
 *  weasel's brush ~0.37. */
export function tailRootRatio(p: Phenotype): number {
  let trunk = 0;
  let tail = Infinity;
  for (const n of p.nodes) {
    if (n.kind === 'spine') trunk = Math.max(trunk, n.radius);
    else if (n.part?.kind === 'tail' && !Number.isFinite(tail)) tail = n.radius; // (its root: grown first)
  }
  return trunk > 0 ? tail / trunk : Infinity;
}
export function ratLike(p: Phenotype): boolean {
  if (p.genomeRef.covering.type !== 'fur') return false;
  let paws = false;
  let top = -Infinity;
  let floor = Infinity;
  for (const n of p.nodes) {
    floor = Math.min(floor, n.pos[1] - n.radius);
    if (n.kind === 'spine' && (n.segment ?? 0) === 0) top = Math.max(top, n.pos[1] + n.radius * (n.scale?.[1] ?? 1));
    if (n.terminal === 'paw' && n.part?.kind === 'leg') paws = true;
  }
  // (no tail at all counts: a hamster's, a guinea pig's)
  const tail = tailRootRatio(p);
  return paws && top - floor < RAT_HEIGHT && (tail < RAT_TAIL || !Number.isFinite(tail));
}

/** a rat's naked tail: a pinkish grey skin of fine rings (in the coat, a mouse trailed a furred rope) */
export const TAIL_SKIN = new THREE.Color().setHSL(0.01, 0.22, 0.52).getHex();

/** What of a body goes bare — the shader's bare zone, where the coat's relief gives way to fine scutes
 *  and the fur shells stop: a feathered body's shanks below its bare line, a rat-like body's whole tail
 *  (its height gate set over all of it). Null for the rest. */
export function bareOf(p: Phenotype): { bare: BareLegs; kind: 'leg' | 'tail' } | null {
  const legs = bareLegsOf(p);
  if (legs) return { bare: legs, kind: 'leg' };
  if (ratLike(p) && p.nodes.some((n) => n.part?.kind === 'tail')) return { bare: { y: 1e6, band: 1, color: TAIL_SKIN }, kind: 'tail' };
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

/** how much of the coat's own colour (darkened) a bare shank's keratin takes */
export const SHANK_COAT = 0.4;
/** where a THEROPOD's plumage ends, × its leg's standing height over the foot: at its ankle (0.36–0.37 of
 *  it on every feathered theropod) — feathered to the end of the drumstick, scaly below */
export const THEROPOD_BARE = 0.4;

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
  // (a soft fringe where the plumage ends: drawn as a hard line, the shanks were stockings pulled up;
  // and their keratin takes a little of the coat's own colour, darkened — a grey or a yellow unrelated
  // to the body above it was a pair of stockings, a mint theropod's or a beige ostrich's)
  const color = new THREE.Color(shankColor(p.genomeRef.seed)).lerp(coatMain(p.genomeRef.palette).multiplyScalar(0.6), SHANK_COAT).getHex();
  // (at a bird's 0.55, a third of the way down a theropod's long shin, its plumage stopped mid-shank: a
  // pair of stockings pulled up to the knee)
  return { y: foot + span * (isTheropod(p) ? THEROPOD_BARE : 0.55), band: span * 0.12, color };
}

/**
 * How much each vertex of a body surface belongs to a LEG (0..1), from its rest-pose body position:
 * 1 where the nearest part of the skeleton is a leg segment, 0 where it is anything else (the trunk,
 * a tail, a neck), soft across a few hundredths of a body unit. The bare-shank zone is gated on it —
 * by height alone, a low-slung bird's belly and tail were painted as scaly leg.
 */
export function legWeights(p: Phenotype, bodyPos: ArrayLike<number>, count: number): Float32Array {
  return partWeights(p, bodyPos, count, 'leg');
}

/**
 * The part gate a body's skin bakes (the shader's aLeg): how much each vertex is leg — where a coat's
 * spots fade out, the flank's tone runs on down, and a bird's bare shank starts — or, on a rat-like
 * body, how much is its naked tail. Null for a body with neither.
 */
export function skinPartWeights(p: Phenotype, bodyPos: ArrayLike<number>, count: number): Float32Array | null {
  const kind = bareOf(p)?.kind ?? 'leg';
  if (!p.nodes.some((n) => n.part?.kind === kind && n.kind !== 'spine')) return null;
  return partWeights(p, bodyPos, count, kind);
}

/** …and the same for any one kind of part (a rat's naked TAIL: see bareOf). */
export function partWeights(p: Phenotype, bodyPos: ArrayLike<number>, count: number, kind: 'leg' | 'tail'): Float32Array {
  const isLeg = (i: number) => p.nodes[i].part?.kind === kind && p.nodes[i].kind !== 'spine';
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

/**
 * Is this foot on one of the HINDMOST legs? Its leg roots furthest back of all the legs (a body with
 * every leg rooted level has no hind feet).
 */
export function isHindFoot(p: Phenotype, idx: number): boolean {
  const chains = legChains(p);
  const mine = chains.find((c) => c[c.length - 1] === idx);
  if (!mine || chains.length < 2) return false;
  const zs = chains.map((c) => p.nodes[c[0]].pos[2]);
  const back = Math.min(...zs), front = Math.max(...zs);
  if (front - back < 1e-3) return false;
  return p.nodes[mine[0]].pos[2] - back < (front - back) * 0.25;
}

interface ToeSpec {
  az: number; // heading off body-forward (rad, about +Y)
  len: number;
  r0: number; // root radius
}

/** how far out along a frog's toes its web reaches (a share of each toe's length), how far its margin
 *  falls back between two toes (a share of that reach), and how thick it is (×a toe's root radius) */
const WEB_REACH = 0.96;
const WEB_DIP = 0.26;
const WEB_THICK = 0.16;
/** a webbed (hind) foot's toes are this much longer than a hand's fingers, and spread this much wider:
 *  a frog swims with long hind toes fanned out (at a hand's length, its toes nearly touched along
 *  most of their run and a web between them lay hidden under them) */
const WEBBED_LONG = 1.3;
const WEBBED_SPREAD = 1.12;

/** the point `s` of the way along a polyline, by length */
function alongLine(pts: THREE.Vector3[], s: number): THREE.Vector3 {
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += pts[k].distanceTo(pts[k - 1]);
  let left = Math.max(0, Math.min(1, s)) * total;
  for (let k = 1; k < pts.length; k++) {
    const l = pts[k].distanceTo(pts[k - 1]);
    if (left <= l || k === pts.length - 1) return pts[k - 1].clone().lerp(pts[k], l > 1e-9 ? Math.min(1, left / l) : 0);
    left -= l;
  }
  return pts[0].clone();
}

/**
 * The WEB between two neighbouring toes (a frog's hind foot): a thin sheet from where they leave the
 * foot out most of their length, its free margin falling back in a curve between them. Built as two
 * faces (it is seen from above and below) a hair apart; its sides run inside the toes it joins.
 */
function toeWebGeometry(a: THREE.Vector3[], b: THREE.Vector3[], r0: number): THREE.BufferGeometry {
  const NU = 6, NV = 5;
  const h = r0 * WEB_THICK * 0.5;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let v = 0; v <= NV; v++)
      for (let u = 0; u <= NU; u++) {
        const fu = u / NU;
        const reach = WEB_REACH * (1 - WEB_DIP * Math.sin(Math.PI * fu));
        const sv = (v / NV) * reach;
        // (a little below the toes' centre lines: it joins them along their undersides, as a web does)
        const p = alongLine(a, sv).lerp(alongLine(b, sv), fu);
        pos.push(p.x, p.y - r0 * 0.25 + side * h, p.z);
        uv.push(fu, v / NV);
      }
    for (let v = 0; v < NV; v++)
      for (let u = 0; u < NU; u++) {
        const i0 = base + v * (NU + 1) + u, i1 = i0 + 1, i2 = i0 + NU + 1, i3 = i2 + 1;
        if (side > 0) idx.push(i0, i2, i1, i1, i2, i3);
        else idx.push(i0, i1, i2, i1, i3, i2);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A leg part's style gene at or over this ends a bird's leg in a bird of prey's foot. */
export const TALONED = 0.6;

function toesOf(plan: FootPlan, r: number, link: number, taloned = false, webbed = false): ToeSpec[] {
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
  if (plan === 'stump') {
    // five short blunt toes, barely clear of a broad round sole: the elephantine foot of a tortoise
    const L = Math.max(r * 1.25, link * 0.18);
    const t = Math.max(r * 0.42, L * 0.3);
    return [-0.9, -0.45, 0, 0.45, 0.9].map((az, i) => ({ az, len: L * (i === 0 || i === 4 ? 0.8 : 1), r0: t }));
  }
  if (plan === 'frog') {
    // long, widely splayed toes — slim, but fingers, not sticks (at a fourteenth of their length
    // thick, with a ball on each tip, every foot was a little star of pins)
    const L0 = Math.max(r * 2.8, link * 0.42);
    const t = Math.max(r * 0.32, L0 * 0.1);
    const L = L0 * (webbed ? WEBBED_LONG : 1);
    const fan = webbed ? WEBBED_SPREAD : 1;
    return [-1.15, -0.55, 0, 0.55, 1.15].map((az, i) => ({ az: az * fan, len: L * (i === 0 || i === 4 ? 0.7 : i === 2 ? 1 : 0.88), r0: t }));
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
export function toedFootGeometry(plan: FootPlan, r: number, link: number, taloned = false, webbed = false): { toes: THREE.BufferGeometry; claws: THREE.BufferGeometry } {
  const hooked = taloned && plan === 'bird';
  // each toe's centre line, for the webs between them (a frog's hind foot)
  const lines: { pts: THREE.Vector3[]; r0: number }[] = [];
  const toes: THREE.BufferGeometry[] = [];
  const claws: THREE.BufferGeometry[] = [];
  const floor = -r; // the foot node's underside sits on the ground (levelFeet)
  const up = new THREE.Vector3(0, 1, 0);
  // a pad under the ankle joining the toes
  const pad = new THREE.SphereGeometry(1, 12, 8);
  // (tall enough to swallow the end of the leg tube above it)
  // (a tortoise's sole is broad: the stump of its leg spread a little on the ground)
  const sole = plan === 'stump' ? 1.35 : 1.08;
  pad.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, floor + r * 0.62, 0), new THREE.Quaternion(), new THREE.Vector3(r * sole, r * 0.72, r * sole)));
  toes.push(pad);
  for (const t of toesOf(plan, r, link, hooked, webbed && plan === 'frog')) {
    const dir = new THREE.Vector3(Math.sin(t.az), 0, Math.cos(t.az));
    // two phalanges: up over a knuckle and down to the claw, so the toe grips rather than lies flat
    const y0 = floor + t.r0 * 1.1;
    const knuckle = dir.clone().multiplyScalar(t.len * 0.5).setY(floor + t.r0 * 1.45);
    // (a hooked talon needs room to come down: the toe's end rides high enough that its point just
    // meets the ground instead of stabbing through it)
    const tip = dir.clone().multiplyScalar(t.len).setY(floor + t.r0 * (hooked ? TALON_LEN * TALON_DROP : 0.75));
    const pts = [new THREE.Vector3(0, y0, 0), knuckle, tip];
    lines.push({ pts, r0: t.r0 });
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
    const cl = t.r0 * (plan === 'bird' ? 2.2 : plan === 'theropod' ? 2.3 : plan === 'stump' ? 1.1 : 1.9);
    const claw = new THREE.ConeGeometry(t.r0 * 0.5, cl, 6);
    claw.applyMatrix4(
      new THREE.Matrix4().compose(tip.clone().add(cdir.clone().multiplyScalar(cl * 0.45)), new THREE.Quaternion().setFromUnitVectors(up, cdir), new THREE.Vector3(1, 1, 1)),
    );
    claws.push(claw);
  }
  // a frog's hind toes are joined by webs, one between each toe and the next (the toes run in order
  // round the foot; bare-tipped splayed toes on a hind foot read as a tree frog's hand)
  if (webbed && plan === 'frog')
    for (let k = 0; k + 1 < lines.length; k++) toes.push(toeWebGeometry(lines[k].pts, lines[k + 1].pts, Math.min(lines[k].r0, lines[k + 1].r0)));
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
