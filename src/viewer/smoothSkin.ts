/**
 * Smooth skin (MORPHOLOGY §12, ROADMAP M15) — one organic surface over the node field.
 *
 * The capsule-union "kit" is robust but reads as separate parts welded with hard seams.
 * This replaces it (when toggled) with a single watertight surface: the shared body field
 * (`bodyField.ts` — smooth union of the skeleton's capsules + the anisotropic node ellipsoids,
 * so shaped skulls/flat torsos keep their silhouette), polygonized by **marching tetrahedra**
 * (6 tets per grid cell — small, watertight, no 256-entry table; the iso-surface is exactly
 * the smoothed capsule union, so it hugs the body predictably). Pure geometry in body space
 * (= world space — the creature isn't transformed), so the existing covering shader's
 * world-space patterns/bump carry straight over.
 *
 * `carves` subtract mouth cavities from the field (the mouth-overhaul): the maw becomes a real
 * recess in the head with a soft lip rim, and every vertex gets an `aFlesh` weight (1 inside the
 * cavity → 0 at `band` outside it) that the covering shader turns into dark wet mouth-flesh.
 *
 * It's a *viewer* concern and gated behind the capsule path: `grow()` stays static, thumbnails
 * keep capsules, and the build is one-time per creature (off the render loop). Deterministic
 * from the phenotype; bounded & finite on any topology (asserted by the test).
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { buildFieldPrims, fieldAtCarved, carveDist, type Carve } from './bodyField';

// Grid resolution, in cells along the creature's longest padded extent. The grid is sampled as a
// NARROW BAND (exact field only near the skin, see below) so resolution costs surface area, not volume.
export const SKIN_RES = { high: 84, low: 44 } as const;
export type SkinQuality = keyof typeof SKIN_RES;
// coarse-grid stride for the narrow band (fine cells per coarse cell)
const STRIDE = 4;

export function buildSmoothGeometry(
  p: Phenotype,
  full = false,
  carves: readonly Carve[] = [],
  quality: SkinQuality = 'high',
): THREE.BufferGeometry {
  // the shared body field as flat typed arrays — `full` (hybrid) meshes every part for full
  // definition; otherwise just the locomotor body (see bodyField for the filters + fallbacks).
  const prims = buildFieldPrims(p, full ? 'hybrid' : 'body');
  const np = prims.nc + prims.ne;

  let meanR = 0;
  for (let i = 0; i < prims.nc; i++) meanR += prims.pr[i];
  meanR = meanR / Math.max(prims.nc, 1);
  prims.k = (full ? 0.34 : 0.5) * meanR; // hybrid blends tighter → keeps more part definition

  // grid bounds: the body bounds padded so the inflated surface stays inside — including any
  // ellipsoid node's overshoot past its scalar radius (a stretched snout, a broad slab body)
  const pad = meanR * 1.5 + prims.k + prims.excess + 0.05;
  const min = [p.bounds.min[0] - pad, p.bounds.min[1] - pad, p.bounds.min[2] - pad];
  const max = [p.bounds.max[0] + pad, p.bounds.max[1] + pad, p.bounds.max[2] + pad];
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

  // roughly-cubic cells sized off the longest extent; a very many-part creature steps the resolution
  // down a touch so its (per-sample) cost stays bounded
  const res = SKIN_RES[quality] * (np > 160 ? 0.8 : 1);
  const cs = Math.max(ext[0], ext[1], ext[2]) / res;
  const cap = Math.ceil(res * 1.05);
  const nx = clampi(Math.ceil(ext[0] / cs), 8, cap);
  const ny = clampi(Math.ceil(ext[1] / cs), 8, cap);
  const nz = clampi(Math.ceil(ext[2] / cs), 8, cap);
  const dx = ext[0] / nx;
  const dy = ext[1] / ny;
  const dz = ext[2] / nz;

  // M24: floor every capsule radius at ~0.6 of a grid cell, so a thin limb (a leg, a tail tip) is
  // always at least one cell thick and can't be missed/fragmented by the marching tets (the gaps).
  // (Ellipsoid nodes ride fat body nodes and never bind — their thin axis is backed by a capsule.)
  const rFloor = 0.6 * Math.max(dx, dy, dz);
  for (let m = 0; m < prims.nc; m++) {
    if (prims.pr[m] < rFloor) prims.pr[m] = rFloor;
    if (prims.ra[m] < rFloor) prims.ra[m] = rFloor;
    if (prims.rb[m] < rFloor) prims.rb[m] = rFloor;
  }

  // a carve rim thinner than a grid cell aliases into stair-steps — soften it to the cell size
  const cell = Math.max(dx, dy, dz);
  const carved: Carve[] =
    carves.length === 0 ? [] : carves.map((c) => (c.blend >= cell * 0.8 ? c : { ...c, blend: cell * 0.8 }));

  // Sample the field at every grid corner: (nx+1)(ny+1)(nz+1) values — as a NARROW BAND. A coarse
  // grid (every STRIDE-th corner) is evaluated exactly first; a fine corner whose nearest coarse value
  // is further from the skin than that coarse sample could possibly be from the corner (the field is
  // 1-Lipschitz) provably has the same sign, and only the SIGN matters away from the surface — so it
  // borrows the coarse value instead of evaluating. Every cell the surface actually crosses, plus a
  // ring around it (for the gradient normals below), is evaluated exactly.
  const sx = nx + 1;
  const sy = ny + 1;
  const sz = nz + 1;
  const idx = (i: number, j: number, l: number) => (l * sy + j) * sx + i;
  const cxn = Math.ceil(nx / STRIDE) + 1;
  const cyn = Math.ceil(ny / STRIDE) + 1;
  const czn = Math.ceil(nz / STRIDE) + 1;
  const coarse = new Float32Array(cxn * cyn * czn);
  const cidx = (i: number, j: number, l: number) => (l * cyn + j) * cxn + i;
  for (let l = 0; l < czn; l++) {
    const z = min[2] + Math.min(l * STRIDE, nz) * dz;
    for (let j = 0; j < cyn; j++) {
      const y = min[1] + Math.min(j * STRIDE, ny) * dy;
      for (let i = 0; i < cxn; i++) {
        coarse[cidx(i, j, l)] = fieldAtCarved(prims, carved, min[0] + Math.min(i * STRIDE, nx) * dx, y, z);
      }
    }
  }
  // a corner must be exact if it is within 2 cell-diagonals of the skin (the crossing cells + the
  // ring the gradient normals read); borrowing is safe when |coarse| minus the distance to that coarse
  // sample still clears that (with a little slack, as soft blends are only ~1-Lipschitz)
  const need = 2 * Math.hypot(dx, dy, dz);
  const field = new Float32Array(sx * sy * sz);
  for (let l = 0; l < sz; l++) {
    const z = min[2] + l * dz;
    const cl = Math.min(Math.round(l / STRIDE), czn - 1);
    const ez = (l - Math.min(cl * STRIDE, nz)) * dz;
    for (let j = 0; j < sy; j++) {
      const y = min[1] + j * dy;
      const cj = Math.min(Math.round(j / STRIDE), cyn - 1);
      const ey = (j - Math.min(cj * STRIDE, ny)) * dy;
      for (let i = 0; i < sx; i++) {
        const ci = Math.min(Math.round(i / STRIDE), cxn - 1);
        const c = coarse[cidx(ci, cj, cl)];
        const ex = (i - Math.min(ci * STRIDE, nx)) * dx;
        const reach = Math.sqrt(ex * ex + ey * ey + ez * ez) * 1.15 + need;
        field[idx(i, j, l)] = Math.abs(c) > reach ? c : fieldAtCarved(prims, carved, min[0] + i * dx, y, z);
      }
    }
  }
  // trilinear sample of the (smooth, exact-at-corners) coarse grid — for the low-frequency AO probe
  const cdx = dx * STRIDE, cdy = dy * STRIDE, cdz = dz * STRIDE;
  const sampleCoarse = (x: number, y: number, z: number): number => {
    const fx = clampf((x - min[0]) / cdx, 0, cxn - 1.0001);
    const fy = clampf((y - min[1]) / cdy, 0, cyn - 1.0001);
    const fz = clampf((z - min[2]) / cdz, 0, czn - 1.0001);
    const i = Math.floor(fx), j = Math.floor(fy), l = Math.floor(fz);
    const tx = fx - i, ty = fy - j, tz = fz - l;
    const c00 = coarse[cidx(i, j, l)] * (1 - tx) + coarse[cidx(i + 1, j, l)] * tx;
    const c10 = coarse[cidx(i, j + 1, l)] * (1 - tx) + coarse[cidx(i + 1, j + 1, l)] * tx;
    const c01 = coarse[cidx(i, j, l + 1)] * (1 - tx) + coarse[cidx(i + 1, j, l + 1)] * tx;
    const c11 = coarse[cidx(i, j + 1, l + 1)] * (1 - tx) + coarse[cidx(i + 1, j + 1, l + 1)] * tx;
    return (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  };

  // Vertices are WELDED: every surface vertex lies on one grid edge (corner g0 → corner g1), so the
  // edge's key identifies it and the neighbouring tets/cells that cross the same edge share it. An
  // indexed mesh is ~6× fewer vertices than the old triangle soup, and — the visible part — lets
  // each vertex carry a smooth normal instead of the per-facet normal that faceted every body.
  const positions: number[] = [];
  const indices: number[] = [];
  const vmap = new Map<number, number>();
  const nCorners = sx * sy * sz;

  // cube-corner offsets v0..v7 and the 6-tet decomposition sharing the v0–v6 diagonal
  const CORN: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const TETS: [number, number, number, number][] = [
    [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6],
  ];
  const cg = new Int32Array(8); // global corner index of each cell corner
  const cval = new Float64Array(8);

  const grads: number[] = [];
  const G0: [number, number, number] = [0, 0, 0];
  const G1: [number, number, number] = [0, 0, 0];
  const gradAt = (i: number, j: number, l: number, out: [number, number, number]): void => {
    const i0 = i > 0 ? i - 1 : i, i1 = i < nx ? i + 1 : i;
    const j0 = j > 0 ? j - 1 : j, j1 = j < ny ? j + 1 : j;
    const l0 = l > 0 ? l - 1 : l, l1 = l < nz ? l + 1 : l;
    out[0] = (field[idx(i1, j, l)] - field[idx(i0, j, l)]) / ((i1 - i0) * dx);
    out[1] = (field[idx(i, j1, l)] - field[idx(i, j0, l)]) / ((j1 - j0) * dy);
    out[2] = (field[idx(i, j, l1)] - field[idx(i, j, l0)]) / ((l1 - l0) * dz);
  };
  const vertexOn = (ga: number, gb: number, va: number, vb: number): number => {
    const lo = ga < gb ? ga : gb;
    const hi = ga < gb ? gb : ga;
    const key = lo * nCorners + hi;
    const hit = vmap.get(key);
    if (hit !== undefined) return hit;
    const t = Math.abs(va - vb) < 1e-12 ? 0.5 : va / (va - vb);
    const ia = ga % sx, ja = Math.floor(ga / sx) % sy, la = Math.floor(ga / (sx * sy));
    const ib = gb % sx, jb = Math.floor(gb / sx) % sy, lb = Math.floor(gb / (sx * sy));
    const xa = min[0] + ia * dx, ya = min[1] + ja * dy, za = min[2] + la * dz;
    const xb = min[0] + ib * dx, yb = min[1] + jb * dy, zb = min[2] + lb * dz;
    const id = positions.length / 3;
    positions.push(xa + t * (xb - xa), ya + t * (yb - ya), za + t * (zb - za));
    // the vertex normal: the grid gradient at both edge ends (central differences of the exact
    // near-surface samples), interpolated to the crossing — smooth shading for zero extra field calls
    gradAt(ia, ja, la, G0);
    gradAt(ib, jb, lb, G1);
    grads.push(G0[0] + t * (G1[0] - G0[0]), G0[1] + t * (G1[1] - G0[1]), G0[2] + t * (G1[2] - G0[2]));
    vmap.set(key, id);
    return id;
  };

  let cgx = 0, cgy = 0, cgz = 0;
  // push a triangle, flipping winding so its face points the way the field rises (outward);
  // degenerate slivers (two corners welded onto one vertex) are dropped
  const emit = (a: number, b: number, c: number): void => {
    if (a === b || b === c || a === c) return;
    const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const wx = positions[c * 3] - positions[a * 3], wy = positions[c * 3 + 1] - positions[a * 3 + 1], wz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const nx2 = uy * wz - uz * wy, ny2 = uz * wx - ux * wz, nz2 = ux * wy - uy * wx;
    if (nx2 * cgx + ny2 * cgy + nz2 * cgz >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };

  for (let l = 0; l < nz; l++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let anyIn = false, anyOut = false;
        for (let c = 0; c < 8; c++) {
          const o = CORN[c];
          const g = idx(i + o[0], j + o[1], l + o[2]);
          cg[c] = g;
          cval[c] = field[g];
          if (cval[c] < 0) anyIn = true;
          else anyOut = true;
        }
        if (!anyIn || !anyOut) continue; // the cell doesn't straddle the skin
        // outward gradient of the cell (field rises away from the body), to orient winding
        cgx = cval[1] + cval[2] + cval[5] + cval[6] - (cval[0] + cval[3] + cval[4] + cval[7]);
        cgy = cval[2] + cval[3] + cval[6] + cval[7] - (cval[0] + cval[1] + cval[4] + cval[5]);
        cgz = cval[4] + cval[5] + cval[6] + cval[7] - (cval[0] + cval[1] + cval[2] + cval[3]);
        for (const t of TETS) marchTet(t, cg, cval, vertexOn, emit);
      }
    }
  }

  const nVerts = positions.length / 3;
  const pos = new Float32Array(positions);
  const normals = new Float32Array(nVerts * 3);
  const ao = new Float32Array(nVerts);
  // Ambient occlusion from the field (the classic SDF AO): step out along the normal and see how
  // much body is nearer than the step — a vertex in a crease (a leg root, under the jaw, between
  // neck and shoulder) finds flesh close by on every side and darkens. AO is low-frequency, so the
  // probes read the smooth coarse grid rather than paying for exact field evaluations.
  const aoSteps = [0.8, 1.8, 3.2, 5.0].map((m) => m * Math.max(meanR * 0.2, cell * 0.8));
  for (let v = 0; v < nVerts; v++) {
    let gx = grads[v * 3], gy = grads[v * 3 + 1], gz = grads[v * 3 + 2];
    const gl = Math.hypot(gx, gy, gz);
    if (gl > 1e-12) {
      gx /= gl; gy /= gl; gz /= gl;
    } else {
      gx = 0; gy = 1; gz = 0;
    }
    normals[v * 3] = gx;
    normals[v * 3 + 1] = gy;
    normals[v * 3 + 2] = gz;
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let occ = 0;
    let wsum = 0;
    for (let s = 0; s < aoSteps.length; s++) {
      const dist = aoSteps[s];
      const d = sampleCoarse(x + gx * dist, y + gy * dist, z + gz * dist);
      const w = 1 / (s + 1);
      occ += w * Math.max(0, (dist - d) / dist);
      wsum += w;
    }
    ao[v] = Math.min(1, Math.max(0, 1 - 1.5 * (occ / wsum)));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);

  // aFlesh — 1 deep inside a carved cavity, fading to 0 `band` outside its wall. The covering
  // shader shades it as dark wet mouth-flesh. Always present (zeros without carves), so the
  // extended material never references a missing attribute.
  const flesh = new Float32Array(nVerts);
  if (carved.length > 0) {
    for (let v = 0; v < nVerts; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let w = 0;
      for (const c of carved) {
        const cd = carveDist(c, x, y, z);
        const cw = 1 - cd / Math.max(c.band, 1e-4);
        if (cw > w) w = cw;
      }
      flesh[v] = w < 0 ? 0 : w > 1 ? 1 : w;
    }
  }
  geo.setAttribute('aFlesh', new THREE.BufferAttribute(flesh, 1));
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
  return geo;
}

// --- a tet's contribution: 0/1/2 triangles, oriented outward by the cell gradient -----------

type VertexOn = (ga: number, gb: number, va: number, vb: number) => number;

function marchTet(
  tet: [number, number, number, number],
  cg: Int32Array, val: Float64Array,
  vertexOn: VertexOn,
  emit: (a: number, b: number, c: number) => void,
): void {
  const [A, B, C, D] = tet;
  let ti = 0;
  if (val[A] < 0) ti |= 1;
  if (val[B] < 0) ti |= 2;
  if (val[C] < 0) ti |= 4;
  if (val[D] < 0) ti |= 8;
  if (ti === 0 || ti === 0x0f) return;
  const ip = (m: number, n: number) => vertexOn(cg[m], cg[n], val[m], val[n]);
  switch (ti) {
    case 0x01: case 0x0e: emit(ip(A, B), ip(A, C), ip(A, D)); break; // A alone
    case 0x02: case 0x0d: emit(ip(B, A), ip(B, C), ip(B, D)); break; // B alone
    case 0x04: case 0x0b: emit(ip(C, A), ip(C, B), ip(C, D)); break; // C alone
    case 0x08: case 0x07: emit(ip(D, A), ip(D, B), ip(D, C)); break; // D alone
    case 0x03: case 0x0c: { // A,B together → quad across the other edges
      const p1 = ip(A, C), p2 = ip(A, D), p3 = ip(B, D), p4 = ip(B, C);
      emit(p1, p2, p3);
      emit(p1, p3, p4);
      break;
    }
    case 0x05: case 0x0a: { // A,C together
      const p1 = ip(A, B), p2 = ip(A, D), p3 = ip(C, D), p4 = ip(C, B);
      emit(p1, p2, p3);
      emit(p1, p3, p4);
      break;
    }
    case 0x06: case 0x09: { // B,C together
      const p1 = ip(B, A), p2 = ip(B, D), p3 = ip(C, D), p4 = ip(C, A);
      emit(p1, p2, p3);
      emit(p1, p3, p4);
      break;
    }
  }
}

function clampf(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampi(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
