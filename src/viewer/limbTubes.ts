/**
 * Thin limbs drawn exact. A limb link not much thicker than the skin's grid cell is more than marching
 * tets can resolve: at a cell or so across, a spider's leg, an octopus's arm tip, a tail's last links
 * came out beaded — the outline wobbling with every cell the link crossed — and since such a link is
 * floored at 0.88 of a cell to keep it whole, it came out too thick as well (a cat's tail tip at twice
 * its girth; on the World's coarser skins every leg of a cat, two or three times over). So a limb link
 * that thin leaves the field, and is drawn as what the field says it is: a round cone, with a sphere
 * at each joint. The tubes are appended to the skin's own geometry, so the covering shader, the rig's
 * skin weights (which already know these cones) and the fur shells treat them as skin.
 *
 * Where the field hands a limb on to a tube, the field's cone is tucked in under the tube's joint
 * sphere (see splitThin): two surfaces of the same girth meeting there would fight over the pixels.
 */
import type { Phenotype } from '../engine/grow';
import { roundConeDist, setCone, withoutCones, type FieldPrims } from './bodyField';

/** a limb link at most this many grid cells thick is drawn exact */
export const TUBE_THIN = 1.6;
/** a field cone that tapers this steeply into a tube's joint (girth per length) or more is tucked in by
 *  slimming its end (to TUCK_SLIM of the joint's girth); a gentler one by stopping it short */
const TUCK_STEEP = 0.3;
const TUCK_SLIM = 0.6;

const keyOf = (x: number, y: number, z: number) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

export interface ThinSplit {
  /** the field without its thin limb links, the cones that hand on to one tucked in under its joint */
  field: FieldPrims;
  /** per cone of `field`: 1 — its a end hands on to a tube, 2 — its b end does (neither is floored) */
  handoff: Uint8Array;
  /** the thin links, as cone indices into the full field */
  tubes: number[];
  /** the ends of the field's own cones (keyOf) — a tube's joint there meets the polygonized skin */
  fieldEnds: Set<string>;
}

/** Which of the field's limb links are too thin for the grid (`cell`), and the field without them —
 *  or null when none is (or nothing else would be left to polygonize). */
export function splitThin(p: Phenotype, full: FieldPrims, cell: number): ThinSplit | null {
  const thin = new Uint8Array(full.nc);
  const tubes: number[] = [];
  for (let m = 0; m < full.nc; m++) {
    // a limb's own links only: a cone from the trunk is the limb's root (it blends into the body), a
    // shaped link keeps its cross-section in the field
    if (full.ia[m] === full.ib[m] || full.an[m]) continue;
    if (p.nodes[full.ia[m]].kind === 'spine' || p.nodes[full.ib[m]].kind === 'spine') continue;
    if (Math.max(full.ra[m], full.rb[m]) >= TUBE_THIN * cell) continue;
    thin[m] = 1;
    tubes.push(m);
  }
  if (tubes.length === 0 || (tubes.length === full.nc && full.ne === 0)) return null;

  const tubeAt = new Set<string>();
  for (const m of tubes) {
    tubeAt.add(keyOf(full.ax[m], full.ay[m], full.az[m]));
    tubeAt.add(keyOf(full.bx[m], full.by[m], full.bz[m]));
  }
  const field = withoutCones(full, (m) => !thin[m]);
  const fieldAt = new Map<string, number>();
  const bump = (k: string) => fieldAt.set(k, (fieldAt.get(k) ?? 0) + 1);
  for (let i = 0; i < field.nc; i++) {
    bump(keyOf(field.ax[i], field.ay[i], field.az[i]));
    bump(keyOf(field.bx[i], field.by[i], field.bz[i]));
  }
  const handoff = new Uint8Array(field.nc);
  for (let i = 0; i < field.nc; i++) {
    const A = [field.ax[i], field.ay[i], field.az[i]];
    const B = [field.bx[i], field.by[i], field.bz[i]];
    const kA = keyOf(A[0], A[1], A[2]), kB = keyOf(B[0], B[1], B[2]);
    // (only where this cone is the field's one cone at the joint: at a fork, the rest carry on)
    const atA = tubeAt.has(kA) && fieldAt.get(kA) === 1;
    const atB = tubeAt.has(kB) && fieldAt.get(kB) === 1;
    if (!atA && !atB) continue;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    if (L < 1e-9) continue;
    let rA = field.ra[i], rB = field.rb[i];
    let tA = 0, tB = 0; // how far each end is drawn in (× L)
    // tuck an end in: a steep cone slims its end, a gentle one stops short by enough that its end cap
    // stays inside the joint sphere (the ball of the joint's girth on the tube's side)
    const tuck = (r: number, rOther: number): { t: number; r: number } => {
      const steep = (rOther - r) / L;
      if (steep >= TUCK_STEEP) return { t: 0, r: r * TUCK_SLIM };
      const s = Math.min(r * Math.max(0.3, (2.2 * steep) / (1 - steep * steep) + 0.15), 0.42 * L);
      return { t: s / L, r: r + (rOther - r) * (s / L) };
    };
    if (atB) {
      const k = tuck(rB, rA);
      tB = k.t;
      rB = k.r;
      handoff[i] |= 2;
    }
    if (atA) {
      const k = tuck(field.ra[i], field.rb[i]);
      tA = k.t;
      rA = k.r;
      handoff[i] |= 1;
    }
    const at = (t: number) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    setCone(field, i, at(tA), at(1 - tB), rA, rB);
  }
  return { field, handoff, tubes, fieldEnds: new Set(fieldAt.keys()) };
}

export interface Tubes {
  positions: Float32Array;
  normals: Float32Array;
  ao: Float32Array;
  indices: Uint32Array;
}

/** radial segments for a tube of girth r on a grid of `cell` (fine enough that the outline is round) */
const segsFor = (r: number, cell: number) => Math.max(6, Math.min(16, Math.ceil((2 * Math.PI * r) / (0.55 * cell))));

/** a joint between two links of one chain bent less than this (radians) is swept through, not balled */
const SWEEP_BEND = 0.45;

interface Joint {
  c: number[];
  r: number;
  /** the links that end here, and those that start here */
  ins: number[];
  outs: number[];
  /** swept through: one link in, one out, gently bent, and no field skin here */
  smooth: boolean;
}

/**
 * The thin links as meshes. A chain of links bent gently at each joint (a tail, a tentacle cut into
 * its spline) is swept as one tube; a sharp joint (a knee), a fork, a free tip and the joint where the
 * field hands a limb on are each a ball of the joint's girth — less what lies buried inside the links
 * it joins. `aoAt` is the skin's occlusion probe (the body above a leg shades it).
 */
export function limbTubes(
  full: FieldPrims,
  split: Pick<ThinSplit, 'tubes' | 'fieldEnds'>,
  cell: number,
  aoAt: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number,
): Tubes {
  const tubes = split.tubes;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const A = (m: number) => [full.ax[m], full.ay[m], full.az[m]];
  const B = (m: number) => [full.bx[m], full.by[m], full.bz[m]];
  const dirOf = (m: number) => {
    const a = A(m), b = B(m);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L, (b[2] - a[2]) / L];
  };
  const joints = new Map<string, Joint>();
  const joint = (p: number[], r: number): Joint => {
    const k = keyOf(p[0], p[1], p[2]);
    let j = joints.get(k);
    if (!j) joints.set(k, (j = { c: p, r, ins: [], outs: [], smooth: false }));
    j.r = Math.max(j.r, r);
    return j;
  };
  const startOf = new Map<number, Joint>();
  const endOf = new Map<number, Joint>();
  for (const m of tubes) {
    const ja = joint(A(m), full.ra[m]);
    ja.outs.push(m);
    startOf.set(m, ja);
    const jb = joint(B(m), full.rb[m]);
    jb.ins.push(m);
    endOf.set(m, jb);
  }
  for (const [k, j] of joints) {
    if (j.ins.length !== 1 || j.outs.length !== 1 || split.fieldEnds.has(k)) continue;
    const u = dirOf(j.ins[0]), w = dirOf(j.outs[0]);
    j.smooth = Math.acos(Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1] + u[2] * w[2]))) < SWEEP_BEND;
  }

  // a piece's vertices, then its triangles — dropping a triangle whose corners all lie inside one of
  // the links it meets (the inside of a bent knee, the half of a joint ball sunk in its own links)
  const piece = (base: number, near: readonly number[], margin: number, tris: number[]) => {
    const n = pos.length / 3 - base;
    const buried = new Uint8Array(n);
    for (let v = 0; v < n; v++) {
      const x = pos[(base + v) * 3], y = pos[(base + v) * 3 + 1], z = pos[(base + v) * 3 + 2];
      for (const o of near) {
        if (roundConeDist(x, y, z, full.ax[o], full.ay[o], full.az[o], full.bx[o], full.by[o], full.bz[o], full.ra[o], full.rb[o]) < -margin) {
          buried[v] = 1;
          break;
        }
      }
    }
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      if (buried[a] && buried[b] && buried[c]) continue;
      // wind it to face out (the way its corners' normals point)
      const ia = (base + a) * 3, ib = (base + b) * 3, ic = (base + c) * 3;
      const ux = pos[ib] - pos[ia], uy = pos[ib + 1] - pos[ia + 1], uz = pos[ib + 2] - pos[ia + 2];
      const wx = pos[ic] - pos[ia], wy = pos[ic + 1] - pos[ia + 1], wz = pos[ic + 2] - pos[ia + 2];
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      const ox = nrm[ia] + nrm[ib] + nrm[ic], oy = nrm[ia + 1] + nrm[ib + 1] + nrm[ic + 1], oz = nrm[ia + 2] + nrm[ib + 2] + nrm[ic + 2];
      if (fx * ox + fy * oy + fz * oz >= 0) idx.push(base + a, base + b, base + c);
      else idx.push(base + a, base + c, base + b);
    }
  };

  // --- the runs: chains of links swept through their gentle joints ---
  const done = new Set<number>();
  for (const m0 of tubes) {
    if (done.has(m0)) continue;
    let first = m0;
    for (let guard = 0; startOf.get(first)!.smooth && guard < tubes.length; guard++) first = startOf.get(first)!.ins[0];
    const run: number[] = [];
    for (let m = first, guard = 0; guard <= tubes.length; guard++) {
      run.push(m);
      done.add(m);
      const e = endOf.get(m)!;
      if (!e.smooth || done.has(e.outs[0])) break;
      m = e.outs[0];
    }
    // rings: along each link (straight cone, linearly tapered), and one shared at each swept joint,
    // square to the mean of the two links' headings
    let rMax = 0;
    for (const m of run) rMax = Math.max(rMax, full.ra[m], full.rb[m]);
    const segs = segsFor(rMax, cell);
    const rings: { p: number[]; t: number[]; r: number; s: number }[] = [];
    run.forEach((m, k) => {
      const a = A(m), b = B(m), u = dirOf(m);
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const s = L > 1e-9 ? (full.ra[m] - full.rb[m]) / L : 0; // the flank's lean (sin of its half-angle)
      const along = Math.min(6, Math.max(1, Math.round(L / (2 * Math.max(full.ra[m], full.rb[m])))));
      if (k === 0) rings.push({ p: a, t: u, r: full.ra[m], s });
      else {
        // the shared ring at the joint: the mean heading and lean of the links either side
        const prev = rings[rings.length - 1];
        const t = [prev.t[0] + u[0], prev.t[1] + u[1], prev.t[2] + u[2]];
        const tl = Math.hypot(t[0], t[1], t[2]) || 1;
        prev.t = [t[0] / tl, t[1] / tl, t[2] / tl];
        prev.s = (prev.s + s) / 2;
      }
      for (let j = 1; j <= along; j++) {
        const f = j / along;
        rings.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], t: u, r: full.ra[m] + (full.rb[m] - full.ra[m]) * f, s });
      }
    });
    const base = pos.length / 3;
    let e1 = perp(rings[0].t);
    for (const ring of rings) {
      const t = ring.t;
      // carry the frame along (no twist): the last ring's first axis, squared to this ring's heading
      const d = e1[0] * t[0] + e1[1] * t[1] + e1[2] * t[2];
      let v = [e1[0] - t[0] * d, e1[1] - t[1] * d, e1[2] - t[2] * d];
      const vl = Math.hypot(v[0], v[1], v[2]);
      v = vl > 1e-6 ? [v[0] / vl, v[1] / vl, v[2] / vl] : perp(t);
      e1 = v;
      const e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
      const sn = Math.max(-0.95, Math.min(0.95, ring.s)), cs = Math.sqrt(1 - sn * sn);
      for (let j = 0; j < segs; j++) {
        const ph = (2 * Math.PI * j) / segs;
        const c = Math.cos(ph), sj = Math.sin(ph);
        const dx = e1[0] * c + e2[0] * sj, dy = e1[1] * c + e2[1] * sj, dz = e1[2] * c + e2[2] * sj;
        pos.push(ring.p[0] + dx * ring.r, ring.p[1] + dy * ring.r, ring.p[2] + dz * ring.r);
        nrm.push(dx * cs + t[0] * sn, dy * cs + t[1] * sn, dz * cs + t[2] * sn);
      }
    }
    const tris: number[] = [];
    for (let k = 0; k + 1 < rings.length; k++) {
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        const v00 = k * segs + j, v01 = k * segs + j1, v10 = (k + 1) * segs + j, v11 = (k + 1) * segs + j1;
        tris.push(v00, v01, v10, v01, v11, v10);
      }
    }
    const ends = [startOf.get(run[0])!, endOf.get(run[run.length - 1])!];
    const inRun = new Set(run);
    const near = [...new Set([...ends[0].ins, ...ends[0].outs, ...ends[1].ins, ...ends[1].outs])].filter((o) => !inRun.has(o));
    piece(base, near, 0.03 * rMax, tris);
  }

  // --- the balls: every joint not swept through ---
  for (const j of joints.values()) {
    if (j.smooth) continue;
    const segs = segsFor(j.r, cell);
    const bands = Math.max(3, Math.ceil(segs / 2));
    const base = pos.length / 3;
    const [cx, cy, cz] = j.c;
    pos.push(cx, cy + j.r, cz);
    nrm.push(0, 1, 0);
    for (let i = 1; i < bands; i++) {
      const th = (Math.PI * i) / bands;
      const y = Math.cos(th), rr = Math.sin(th);
      for (let k = 0; k < segs; k++) {
        const ph = (2 * Math.PI * k) / segs;
        const x = rr * Math.cos(ph), z = rr * Math.sin(ph);
        pos.push(cx + x * j.r, cy + y * j.r, cz + z * j.r);
        nrm.push(x, y, z);
      }
    }
    pos.push(cx, cy - j.r, cz);
    nrm.push(0, -1, 0);
    const last = 1 + (bands - 1) * segs;
    const ring = (i: number, k: number) => 1 + (i - 1) * segs + (k % segs);
    const tris: number[] = [];
    for (let k = 0; k < segs; k++) tris.push(0, ring(1, k), ring(1, k + 1));
    for (let i = 1; i < bands - 1; i++) {
      for (let k = 0; k < segs; k++) tris.push(ring(i, k), ring(i + 1, k), ring(i + 1, k + 1), ring(i, k), ring(i + 1, k + 1), ring(i, k + 1));
    }
    for (let k = 0; k < segs; k++) tris.push(last, ring(bands - 1, k + 1), ring(bands - 1, k));
    piece(base, [...j.ins, ...j.outs], 0.03 * j.r, tris);
  }

  // keep only the vertices a triangle still uses
  const nV = pos.length / 3;
  const remap = new Int32Array(nV).fill(-1);
  let n = 0;
  for (const v of idx) if (remap[v] < 0) remap[v] = n++;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const ao = new Float32Array(n);
  for (let v = 0; v < nV; v++) {
    const w = remap[v];
    if (w < 0) continue;
    for (let a = 0; a < 3; a++) {
      positions[w * 3 + a] = pos[v * 3 + a];
      normals[w * 3 + a] = nrm[v * 3 + a];
    }
    ao[w] = aoAt(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
  }
  return { positions, normals, ao, indices: Uint32Array.from(idx, (v) => remap[v]) };
}

/** a unit vector at right angles to unit u */
function perp(u: readonly number[]): number[] {
  const a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = a[0] * u[0] + a[1] * u[1] + a[2] * u[2];
  const v = [a[0] - u[0] * d, a[1] - u[1] * d, a[2] - u[2] * d];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
