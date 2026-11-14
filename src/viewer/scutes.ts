/**
 * Scutes: the keeled plates of a crocodile's armour. Rows of them run down the back from the neck to
 * the hips, the two inner rows carry on along the top of the tail as a double crest of taller blades,
 * and half-way down the tail the two crests close into the single saw-toothed one the animal sculls
 * with. (Its back was bare skin from snout to tail tip — a newt's — or carried three dark cones stood
 * point-down on the midline, which read as buttons dropped on it.)
 *
 * A body wears them when its tail is a sculling tail (grow's `isScullingTail`) and its hide is bare,
 * scaled or plated: the armour and the blade are one trait, and it is a reptile's — a pelt or plumage
 * that came by such a tail keeps its coat. Each scute is seated on the true skin (the same field the surface is meshed
 * from) and belongs to the nearest link of the back or tail, so it rides that link's bone.
 *
 * `scutePlan` is pure data (tested); `scuteGeometries` turns it into one small mesh per link.
 */
import * as THREE from 'three';
import { isScullingTail, type Phenotype } from '../engine/grow';
import type { Vec3 } from '../engine/genome';
import { buildFieldPrims, fieldAt, type FieldPrims } from './bodyField';

export interface Scute {
  /** the link (node index) it rides */
  node: number;
  /** centre of its base on the skin, body space */
  at: Vec3;
  /** the skin's outward normal there */
  up: Vec3;
  /** along the body toward the head, in the skin's plane */
  fwd: Vec3;
  len: number;
  wid: number;
  /** height of the keel at its rear */
  h: number;
  /** which run it belongs to: the back's rows, the tail's crest — or the boss on the snout's tip that
   *  carries the nostrils (a smooth dome, not a keeled plate: `h` is its height) */
  on: 'back' | 'tail' | 'snout';
}

/** a back scute's width, × the trunk's greatest half-width — four rows down the back, six at its widest */
const BACK_WID = 0.26;
/** …and its length along the body, × its width */
const BACK_LEN = 1.2;
/** row pairs across the back at its widest */
const BACK_PAIRS = 3;
/** rows stay on the top of the back: none further out than this × the body's half-width there */
const BACK_REACH = 0.9;
/** a back scute's keel, × its width (the outer rows lie flatter). (At half its width and more, peaked
 *  over a plate pitched to it, each scute was a cone: the back a hairbrush, a saw blade, of thin spikes.) */
const BACK_KEEL = [0.24, 0.2, 0.15] as const;
/** a back scute's slab: how far its flat top stands off the skin (× its width), and how far in from the
 *  base its top's edges lie (× its half-size) */
const PLATE_T = 0.1;
const PLATE_INSET = 0.85;
/** the tail's two crests start this far apart (× the trunk's half-width: the back's second rows)… */
const CREST_SPREAD = 0.3;
/** …and have closed into one by this fraction of the tail's length */
const CREST_JOIN = 0.45;
/** a crest blade's height, × the trunk's greatest half-width, at its tallest */
const CREST_H = 0.36;
/** the nostril boss sits this far out along the snout's last link (× its half-length)… */
const NOSE_AT = 0.4;
/** …and stands this high (× the snout tip's half-depth) */
const NOSE_H = 0.42;

/** the hides that grow scutes */
const ARMOURED: ReadonlySet<string> = new Set(['scales', 'plates', 'skin']);

type Surface = 'kit' | 'smooth' | 'hybrid';

/** The skin a scute is seated on — the field the rendered surface is meshed from (smoothSkin's blend). */
function skinField(p: Phenotype, surface: Surface): FieldPrims {
  // (the capsule kit draws the tail round — see meshData — so there the crest sits on a round tail)
  const body = surface === 'kit' ? { ...p, nodes: p.nodes.map((n) => (n.kind === 'spine' || !n.scale ? n : { ...n, scale: undefined })) } : p;
  const f = buildFieldPrims(body, surface === 'hybrid' ? 'hybrid' : 'body');
  if (surface !== 'kit') {
    let meanR = 0;
    for (let i = 0; i < f.nc; i++) meanR += f.pr[i];
    f.k = (surface === 'hybrid' ? 0.34 : 0.5) * (meanR / Math.max(f.nc, 1));
  }
  return f;
}

/** The sculling tail's links, root to tip (empty when the body has none). */
export function scullingTail(p: Phenotype): number[] {
  if (p.genomeRef.symmetry === 'radial') return [];
  const parent = new Map<number, number>();
  for (const [a, b] of p.edges) parent.set(b, a);
  const root = p.nodes.findIndex((n, i) => n.part?.kind === 'tail' && p.nodes[parent.get(i) ?? -1]?.kind === 'spine');
  if (root < 0) return [];
  const chain = [root];
  for (;;) {
    const cur = chain[chain.length - 1];
    const next = p.edges.find(([a, b]) => a === cur && p.nodes[b].part?.kind === 'tail');
    if (!next) break;
    chain.push(next[1]);
  }
  const tip = p.nodes[chain[chain.length - 1]];
  return chain.length >= 3 && isScullingTail(p.nodes[root].part, tip.terminal) ? chain : [];
}

interface Station {
  c: Vec3; // on the chain's axis
  fwd: Vec3; // toward the head
  node: number; // nearest link
  hw: number; // the body's half-width here
  hd: number; // …and half-depth
  u: number; // 0..1 along the run
}

/** Stations every `pitch` along a chain of links (given tail-end first, so `fwd` points at the head). */
function stations(p: Phenotype, chain: number[], pitch: number): Station[] {
  const out: Station[] = [];
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = p.nodes[chain[i]].pos, b = p.nodes[chain[i + 1]].pos;
    seg.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    total += seg[i];
  }
  if (total < pitch) return out;
  const n = Math.floor(total / pitch);
  const lead = (total - n * pitch) / 2; // centred: the same margin at both ends
  for (let k = 0; k < n; k++) {
    let s = lead + (k + 0.5) * pitch;
    const u = s / total;
    let i = 0;
    while (i < seg.length - 1 && s > seg[i]) s -= seg[i++];
    const t = seg[i] > 1e-9 ? s / seg[i] : 0;
    const A = p.nodes[chain[i]], B = p.nodes[chain[i + 1]];
    const mix = (x: number, y: number) => x + (y - x) * t;
    const d: Vec3 = [B.pos[0] - A.pos[0], B.pos[1] - A.pos[1], B.pos[2] - A.pos[2]];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    out.push({
      c: [mix(A.pos[0], B.pos[0]), mix(A.pos[1], B.pos[1]), mix(A.pos[2], B.pos[2])],
      fwd: [d[0] / dl, d[1] / dl, d[2] / dl],
      node: chain[t < 0.5 ? i : i + 1],
      hw: mix(A.radius * (A.scale?.[0] ?? 1), B.radius * (B.scale?.[0] ?? 1)),
      hd: mix(A.radius * (A.scale?.[1] ?? 1), B.radius * (B.scale?.[1] ?? 1)),
      u,
    });
  }
  return out;
}

const G: Vec3 = [0, 0, 0];
/** The skin straight above the chain's axis at a station, `x` out to the side: its point and normal. */
function seat(f: FieldPrims, st: Station, x: number): { at: Vec3; up: Vec3 } | null {
  // "above": square to the chain, in the body's midline plane
  const fy = st.fwd[1], fz = st.fwd[2];
  const l = Math.hypot(fy, fz) || 1;
  let uy = fz / l, uz = -fy / l;
  if (uy < 0) { uy = -uy; uz = -uz; }
  const ox = st.c[0] + x, oy = st.c[1], oz = st.c[2];
  if (fieldAt(f, ox, oy, oz) >= 0) return null; // out past the flank
  let lo = 0, hi = st.hd * 2.4 + 0.3;
  if (fieldAt(f, ox, oy + uy * hi, oz + uz * hi) < 0) return null; // under something else (a shell, a hump)
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (fieldAt(f, ox, oy + uy * m, oz + uz * m) < 0) lo = m;
    else hi = m;
  }
  const at: Vec3 = [ox, oy + uy * lo, oz + uz * lo];
  const e = 0.01;
  G[0] = fieldAt(f, at[0] + e, at[1], at[2]) - fieldAt(f, at[0] - e, at[1], at[2]);
  G[1] = fieldAt(f, at[0], at[1] + e, at[2]) - fieldAt(f, at[0], at[1] - e, at[2]);
  G[2] = fieldAt(f, at[0], at[1], at[2] + e) - fieldAt(f, at[0], at[1], at[2] - e);
  const gl = Math.hypot(G[0], G[1], G[2]);
  if (gl < 1e-9) return null;
  return { at, up: [G[0] / gl, G[1] / gl, G[2] / gl] };
}

/** `fwd` laid into the skin's plane at a seat */
function along(fwd: Vec3, up: Vec3): Vec3 {
  const d = fwd[0] * up[0] + fwd[1] * up[1] + fwd[2] * up[2];
  const v: Vec3 = [fwd[0] - up[0] * d, fwd[1] - up[1] * d, fwd[2] - up[2] * d];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Whether a body wears the armour: a sculling tail on a reptile's hide. */
export function armoured(p: Phenotype): boolean {
  return ARMOURED.has(p.genomeRef.covering.type) && scullingTail(p).length > 0;
}

/** Every scute of a body's armour (none for a body without a sculling tail). */
export function scutePlan(p: Phenotype, surface: Surface = 'hybrid'): Scute[] {
  if (!armoured(p)) return [];
  const tail = scullingTail(p);
  const spine = p.nodes.map((n, i) => ({ n, i })).filter((e) => e.n.kind === 'spine');
  const last = Math.max(...spine.map((e) => e.n.segment ?? 0));
  // the back: the trunk, and a neck between it and the head (the skull itself is bare)
  const back = spine.filter((e) => (e.n.segment ?? 0) === 0 || ((e.n.segment ?? 0) < last && last >= 2)).map((e) => e.i);
  if (back.length < 2) return [];
  const W = Math.max(...back.map((i) => p.nodes[i].radius * (p.nodes[i].scale?.[0] ?? 1)));
  const wid = BACK_WID * W;
  const pitch = wid * BACK_LEN;
  const f = skinField(p, surface);
  const out: Scute[] = [];

  for (const st of stations(p, back, pitch)) {
    for (let k = 0; k < BACK_PAIRS; k++) {
      const x = (k + 0.5) * wid;
      if (x + wid / 2 > BACK_REACH * st.hw) break;
      for (const side of [1, -1]) {
        const s = seat(f, st, side * x);
        if (!s) continue;
        out.push({ node: st.node, at: s.at, up: s.up, fwd: along(st.fwd, s.up), len: pitch * 0.9, wid: wid * 0.86, h: wid * BACK_KEEL[k], on: 'back' });
      }
    }
  }

  // the tail's crest, from the hips (the trunk's first link) out to the tip: stations run tip-first
  const run = [...tail].reverse();
  run.push(back[0]);
  for (const st of stations(p, run, pitch)) {
    const v = 1 - st.u; // 0 at the hips … 1 at the tip
    const spread = v < CREST_JOIN ? CREST_SPREAD * W * (1 - v / CREST_JOIN) : 0;
    // tallest where the two crests have just closed into one, falling away to the tip
    const h = CREST_H * W * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, v * 1.5) * 0.75)) * (1 - 0.6 * v * v);
    const len = pitch * 0.94;
    for (const side of spread > wid * 0.3 ? [1, -1] : [0]) {
      const s = seat(f, st, side * spread);
      if (!s) continue;
      // (a crest blade stands square to the body, not to the skin's slope at its foot: the pair
      // would splay apart as the tail narrows under them)
      const lean: Vec3 = [s.up[0] * 0.35, s.up[1], s.up[2]];
      const ll = Math.hypot(lean[0], lean[1], lean[2]);
      const up: Vec3 = [lean[0] / ll, lean[1] / ll, lean[2] / ll];
      out.push({ node: st.node, at: s.at, up, fwd: along(st.fwd, up), len, wid: Math.min(wid * 0.7, st.hw * 0.9 + 0.02), h, on: 'tail' });
    }
  }

  // the nostril boss: a low dome on top of the snout's tip, so the nose rides up out of the flat jaw
  // (the last of the animal to go under, with the eyes). On a head of a few links only — a snout.
  const head = spine.filter((e) => (e.n.segment ?? 0) === last && last >= 1);
  if (head.length >= 3) {
    const tip = head[head.length - 1].n, prev = head[head.length - 2].n;
    const d: Vec3 = [tip.pos[0] - prev.pos[0], tip.pos[1] - prev.pos[1], tip.pos[2] - prev.pos[2]];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    const fwd: Vec3 = [d[0] / dl, d[1] / dl, d[2] / dl];
    const hw = tip.radius * (tip.scale?.[0] ?? 1), hd = tip.radius * (tip.scale?.[1] ?? 1);
    const reach = tip.radius * (tip.scale?.[2] ?? 1) * NOSE_AT;
    const st: Station = { c: [tip.pos[0] + fwd[0] * reach, tip.pos[1] + fwd[1] * reach, tip.pos[2] + fwd[2] * reach], fwd, node: head[head.length - 1].i, hw, hd, u: 1 };
    const s = seat(f, st, 0);
    if (s) out.push({ node: st.node, at: s.at, up: s.up, fwd: along(fwd, s.up), len: hw * 1.8, wid: hw * 1.35, h: hd * NOSE_H, on: 'snout' });
  }
  return out;
}

/** A dome: a boss rising out of the skin (the nostrils' mound). */
function pushDome(s: Scute, pos: number[]): void {
  const { at, up, fwd } = s;
  const rt: Vec3 = [up[1] * fwd[2] - up[2] * fwd[1], up[2] * fwd[0] - up[0] * fwd[2], up[0] * fwd[1] - up[1] * fwd[0]];
  const SEG = 10, RING = 4;
  const sink = 0.35 * s.h;
  const P = (i: number, j: number): Vec3 => {
    const phi = (i / RING) * (Math.PI / 2), th = (j / SEG) * Math.PI * 2;
    const a = (s.len / 2) * Math.cos(phi) * Math.cos(th), r = (s.wid / 2) * Math.cos(phi) * Math.sin(th), n = (s.h + sink) * Math.sin(phi) - sink;
    return [at[0] + fwd[0] * a + rt[0] * r + up[0] * n, at[1] + fwd[1] * a + rt[1] * r + up[1] * n, at[2] + fwd[2] * a + rt[2] * r + up[2] * n];
  };
  const inside: Vec3 = [at[0] - up[0] * sink, at[1] - up[1] * sink, at[2] - up[2] * sink];
  for (let i = 0; i < RING; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j + 1), d = P(i + 1, j);
      pushTri(pos, inside, a, b, c);
      if (i + 1 < RING) pushTri(pos, inside, a, c, d);
    }
  }
}

/** A triangle wound outward from a point inside the solid it belongs to. */
function pushTri(pos: number[], inside: Vec3, a: Vec3, b: Vec3, c: Vec3): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const cx = (a[0] + b[0] + c[0]) / 3 - inside[0], cy = (a[1] + b[1] + c[1]) / 3 - inside[1], cz = (a[2] + b[2] + c[2]) / 3 - inside[2];
  if (nx * cx + ny * cy + nz * cz >= 0) pos.push(...a, ...b, ...c);
  else pos.push(...a, ...c, ...b);
}

/**
 * One scute. A back scute is a low slab — its top a flat plate standing off the skin, PLATE_T of its
 * width, with a keel along its middle rising from the front to its rear edge; a crest blade (the tail's)
 * is a saw tooth from the side, its ridge rising from the front to a point over its rear edge. Vertices are
 * pushed onto `pos` in body space.
 */
function pushScute(s: Scute, pos: number[]): void {
  const { at, up, fwd } = s;
  const rt: Vec3 = [up[1] * fwd[2] - up[2] * fwd[1], up[2] * fwd[0] - up[0] * fwd[2], up[0] * fwd[1] - up[1] * fwd[0]];
  const P = (a: number, r: number, n: number): Vec3 => [
    at[0] + fwd[0] * a + rt[0] * r + up[0] * n,
    at[1] + fwd[1] * a + rt[1] * r + up[1] * n,
    at[2] + fwd[2] * a + rt[2] * r + up[2] * n,
  ];
  const hl = s.len / 2, hw = s.wid / 2;
  if (s.on === 'back') {
    const t = PLATE_T * s.wid;
    const sink = -0.3 * (t + s.h) - 0.012; // (its base edges sit in the skin, whatever its curve)
    const il = hl * PLATE_INSET, iw = hw * PLATE_INSET;
    const b = [P(hl, -hw, sink), P(hl, hw, sink), P(-hl, hw, sink), P(-hl, -hw, sink)];
    const top = [P(il, -iw, t), P(il, iw, t), P(-il, iw, t), P(-il, -iw, t)];
    const keelF = P(il, 0, t), keelB = P(-il * 0.95, 0, t + s.h);
    const inside = P(0, 0, t * 0.3);
    const tri = (a: Vec3, c: Vec3, d: Vec3) => pushTri(pos, inside, a, c, d);
    // the slab's four sides
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      tri(b[k], b[k1], top[k1]);
      tri(b[k], top[k1], top[k]);
    }
    // its top, pitched up each side of the keel to the ridge (from the low front to the high rear)
    tri(top[0], keelF, keelB); tri(top[0], keelB, top[3]); // one side
    tri(top[1], keelB, keelF); tri(top[1], top[2], keelB); // the other
    tri(top[3], keelB, top[2]); // the rear, under the ridge's end
    return;
  }
  const sink = -0.3 * s.h - 0.012; // the plate's edges sit in the skin, whatever its curve
  const fl = P(hl, -hw, sink), fr = P(hl, hw, sink), bl = P(-hl, -hw, sink), br = P(-hl, hw, sink);
  const nose = P(hl * 0.8, 0, s.h * 0.12);
  const peak = P(-hl * 0.72, 0, s.h);
  const inside = P(0, 0, s.h * 0.1);
  const tri = (a: Vec3, b: Vec3, c: Vec3) => pushTri(pos, inside, a, b, c); // (wound outward, whichever way the frame turned out)
  tri(fl, bl, peak); tri(fl, peak, nose); // one flank
  tri(fr, peak, br); tri(fr, nose, peak); // the other
  tri(fl, nose, fr); // the low front
  tri(bl, br, peak); // the steep rear
}

/**
 * The armour as meshes: one per link, positions relative to that link's node (so it can hang from the
 * link's bone), flat-shaded, carrying the body-space attributes the skin's own material reads.
 */
export function scuteGeometries(p: Phenotype, scutes: readonly Scute[]): { node: number; geo: THREE.BufferGeometry }[] {
  const by = new Map<number, number[]>();
  for (const s of scutes) {
    let pos = by.get(s.node);
    if (!pos) by.set(s.node, (pos = []));
    if (s.on === 'snout') pushDome(s, pos);
    else pushScute(s, pos);
  }
  const out: { node: number; geo: THREE.BufferGeometry }[] = [];
  for (const [node, body] of by) {
    const o = p.nodes[node].pos;
    const local = new Float32Array(body.length);
    for (let i = 0; i < body.length; i += 3) {
      local[i] = body[i] - o[0];
      local[i + 1] = body[i + 1] - o[1];
      local[i + 2] = body[i + 2] - o[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(local, 3));
    geo.computeVertexNormals();
    const count = body.length / 3;
    geo.setAttribute('aBodyPos', new THREE.BufferAttribute(Float32Array.from(body), 3));
    geo.setAttribute('aFlesh', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    out.push({ node, geo });
  }
  return out;
}

/**
 * A BACK SPINE (a dragon's, a wyvern's, a chimera's) stands out of the hide along its node's aim: a cone
 * DORSAL_SPIKE[0] × the node's radius long, its base sunk DORSAL_SPIKE[1] × into the hide, its point
 * raked back DORSAL_SPIKE[2] rad (for a node aimed up, its own +Y runs back along the body). Built in
 * the node's frame, turned by its quat. (Drawn as a leg's claw — a cone stood point-down on its node,
 * never turned to its aim, its flat base standing over the skin — each was a dark disc on a lump: a
 * bolt-head beside the wing root, two square pads from above.)
 */
export const DORSAL_SPIKE: readonly [number, number, number] = [3.4, 0.7, 0.3];
export function dorsalSpikeGeometry(r: number, quat: readonly number[]): THREE.BufferGeometry {
  const [len, sink, rake] = DORSAL_SPIKE;
  const g = new THREE.ConeGeometry(r, len * r, 9, 1);
  g.translate(0, (len / 2 - sink) * r, 0); // the base sunk into the hide, the point out
  g.rotateX(Math.PI / 2); // its point (+Y) along the node's aim (+Z)
  g.rotateX(-rake); // …raked back
  g.applyQuaternion(new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]));
  g.computeVertexNormals();
  return g;
}
