/**
 * Smooth skin (MORPHOLOGY §12, ROADMAP M15) — one organic surface over the node field.
 *
 * The capsule-union "kit" is robust but reads as separate parts welded with hard seams.
 * This replaces it (when toggled) with a single watertight surface: a signed-distance
 * field that is the **smooth union** of the skeleton's capsules + joint spheres, polygonized
 * by **marching tetrahedra** (6 tets per grid cell — small, watertight, no 256-entry table,
 * no opaque metaball tuning; the iso-surface is exactly the smoothed capsule union, so it
 * hugs the body predictably). Pure geometry in body space (= world space — the creature isn't
 * transformed), so the existing covering shader's world-space patterns/bump carry straight over.
 *
 * It's a *viewer* concern and gated behind the capsule path: `grow()` stays static, thumbnails
 * keep capsules, and the build is one-time per creature (off the render loop). Deterministic
 * from the phenotype; bounded & finite on any topology (asserted by the test).
 */
import * as THREE from 'three';
import type { Phenotype, BodyNode } from '../engine/grow';

// keep grid_samples × primitives under this, so the (one-time, off-render-loop) build is quick
const BUDGET = 1e6;

// The smooth body meshes only the locomotor silhouette — trunk + these limb kinds. Eyes, mouth,
// horns, wings, fins, ears, whiskers, etc. are drawn as solid features on top, so meshing them into
// the field only made thin floating lumps + gaps (M24 fix).
const BODY_PART_KINDS = new Set(['leg', 'tail', 'arm', 'tentacle', 'neck']);
function isBodyNode(n: BodyNode): boolean {
  return n.kind === 'spine' || (n.part != null && BODY_PART_KINDS.has(n.part.kind));
}
// The HYBRID mode meshes *everything* (full part definition) except the eyes/mouth, which always draw
// as solids — best of both: an organic surface like smooth, but nothing drops out like capsules keep.
function isHybridNode(n: BodyNode): boolean {
  return n.terminal !== 'eye' && n.terminal !== 'mouth';
}

export function buildSmoothGeometry(p: Phenotype, full = false): THREE.BufferGeometry {
  // primitives as flat typed arrays (capsule a→b, radius r) — a hot-loop win over objects.
  // Capsules already round-cap their endpoints, so the joints/leaves need no extra spheres.
  // `full` (hybrid) meshes every part for full definition; otherwise just the locomotor body.
  const { ax, ay, az, bx, by, bz, pr, count: np } = primitives(p, full);

  let meanR = 0;
  for (let i = 0; i < np; i++) meanR += pr[i];
  meanR = meanR / Math.max(np, 1);
  const k = (full ? 0.34 : 0.5) * meanR; // hybrid blends tighter → keeps more part definition

  // grid bounds: the body bounds padded so the inflated surface stays inside
  const pad = meanR * 1.5 + k + 0.05;
  const min = [p.bounds.min[0] - pad, p.bounds.min[1] - pad, p.bounds.min[2] - pad];
  const max = [p.bounds.max[0] + pad, p.bounds.max[1] + pad, p.bounds.max[2] + pad];
  const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];

  // adaptive, roughly-cubic cells, total samples bounded by the budget
  const vol = Math.max(ext[0] * ext[1] * ext[2], 1e-6);
  const cs = Math.cbrt((vol * np) / BUDGET) || ext[0] / 32;
  const nx = clampi(Math.ceil(ext[0] / cs), 8, 64);
  const ny = clampi(Math.ceil(ext[1] / cs), 8, 64);
  const nz = clampi(Math.ceil(ext[2] / cs), 8, 64);
  const dx = ext[0] / nx;
  const dy = ext[1] / ny;
  const dz = ext[2] / nz;

  // M24: floor every primitive radius at ~0.6 of a grid cell, so a thin limb (a leg, a tail tip) is
  // always at least one cell thick and can't be missed/fragmented by the marching tets (the gaps).
  const rFloor = 0.6 * Math.max(dx, dy, dz);
  for (let m = 0; m < np; m++) if (pr[m] < rFloor) pr[m] = rFloor;

  // sample the field once at every grid corner: (nx+1)(ny+1)(nz+1) values.
  // sdf = smooth-union of every capsule, inlined over the flat prim arrays.
  const sx = nx + 1;
  const sy = ny + 1;
  const sz = nz + 1;
  const field = new Float32Array(sx * sy * sz);
  const idx = (i: number, j: number, l: number) => (l * sy + j) * sx + i;
  for (let l = 0; l < sz; l++) {
    const z = min[2] + l * dz;
    for (let j = 0; j < sy; j++) {
      const y = min[1] + j * dy;
      for (let i = 0; i < sx; i++) {
        const x = min[0] + i * dx;
        let d = Infinity;
        for (let m = 0; m < np; m++) {
          const pax = x - ax[m], pay = y - ay[m], paz = z - az[m];
          const bxx = bx[m] - ax[m], byy = by[m] - ay[m], bzz = bz[m] - az[m];
          const dot = bxx * bxx + byy * byy + bzz * bzz;
          let h = dot > 1e-9 ? (pax * bxx + pay * byy + paz * bzz) / dot : 0;
          h = h < 0 ? 0 : h > 1 ? 1 : h;
          const ex = pax - bxx * h, ey = pay - byy * h, ez = paz - bzz * h;
          const val = Math.sqrt(ex * ex + ey * ey + ez * ez) - pr[m];
          if (d === Infinity) {
            d = val;
          } else {
            // polynomial smooth-min (soft union)
            const t = 0.5 + (0.5 * (val - d)) / k;
            const hh = t < 0 ? 0 : t > 1 ? 1 : t;
            d = val * (1 - hh) + d * hh - k * hh * (1 - hh);
          }
        }
        field[idx(i, j, l)] = d;
      }
    }
  }

  const positions: number[] = [];
  const px = (i: number) => min[0] + i * dx;
  const py = (j: number) => min[1] + j * dy;
  const pz = (l: number) => min[2] + l * dz;

  // cube-corner offsets v0..v7 and the 6-tet decomposition sharing the v0–v6 diagonal
  const CORN: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ];
  const TETS: [number, number, number, number][] = [
    [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6],
  ];
  const cvx = new Float64Array(8);
  const cvy = new Float64Array(8);
  const cvz = new Float64Array(8);
  const cval = new Float64Array(8);

  for (let l = 0; l < nz; l++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        for (let c = 0; c < 8; c++) {
          const o = CORN[c];
          cvx[c] = px(i + o[0]);
          cvy[c] = py(j + o[1]);
          cvz[c] = pz(l + o[2]);
          cval[c] = field[idx(i + o[0], j + o[1], l + o[2])];
        }
        // outward gradient of the cell (field rises away from the body), to orient winding
        const gx = cval[1] + cval[2] + cval[5] + cval[6] - (cval[0] + cval[3] + cval[4] + cval[7]);
        const gy = cval[2] + cval[3] + cval[6] + cval[7] - (cval[0] + cval[1] + cval[4] + cval[5]);
        const gz = cval[4] + cval[5] + cval[6] + cval[7] - (cval[0] + cval[1] + cval[2] + cval[3]);
        for (const t of TETS) {
          marchTet(t, cvx, cvy, cvz, cval, gx, gy, gz, positions);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// --- a tet's contribution: 0/1/2 triangles, oriented outward by the cell gradient -----------

function marchTet(
  tet: [number, number, number, number],
  vx: Float64Array, vy: Float64Array, vz: Float64Array, val: Float64Array,
  gx: number, gy: number, gz: number,
  out: number[],
): void {
  const [A, B, C, D] = tet;
  const vA = val[A], vB = val[B], vC = val[C], vD = val[D];
  let ti = 0;
  if (vA < 0) ti |= 1;
  if (vB < 0) ti |= 2;
  if (vC < 0) ti |= 4;
  if (vD < 0) ti |= 8;
  if (ti === 0 || ti === 0x0f) return;

  // interpolate the zero-crossing on edge (corner m → corner n)
  const ip = (m: number, n: number): [number, number, number] => {
    const a = m === A ? vA : m === B ? vB : m === C ? vC : vD;
    const b = n === A ? vA : n === B ? vB : n === C ? vC : vD;
    const t = Math.abs(a - b) < 1e-9 ? 0.5 : a / (a - b);
    return [vx[m] + t * (vx[n] - vx[m]), vy[m] + t * (vy[n] - vy[m]), vz[m] + t * (vz[n] - vz[m])];
  };
  const tri = (P: number[][]) => emit(P[0], P[1], P[2], gx, gy, gz, out);

  switch (ti) {
    case 0x01: case 0x0e: // A alone
      tri([ip(A, B), ip(A, C), ip(A, D)]);
      break;
    case 0x02: case 0x0d: // B alone
      tri([ip(B, A), ip(B, C), ip(B, D)]);
      break;
    case 0x04: case 0x0b: // C alone
      tri([ip(C, A), ip(C, B), ip(C, D)]);
      break;
    case 0x08: case 0x07: // D alone
      tri([ip(D, A), ip(D, B), ip(D, C)]);
      break;
    case 0x03: case 0x0c: { // A,B together → quad across the other edges
      const p1 = ip(A, C), p2 = ip(A, D), p3 = ip(B, D), p4 = ip(B, C);
      tri([p1, p2, p3]);
      tri([p1, p3, p4]);
      break;
    }
    case 0x05: case 0x0a: { // A,C together
      const p1 = ip(A, B), p2 = ip(A, D), p3 = ip(C, D), p4 = ip(C, B);
      tri([p1, p2, p3]);
      tri([p1, p3, p4]);
      break;
    }
    case 0x06: case 0x09: { // B,C together
      const p1 = ip(B, A), p2 = ip(B, D), p3 = ip(C, D), p4 = ip(C, A);
      tri([p1, p2, p3]);
      tri([p1, p3, p4]);
      break;
    }
  }
}

// push a triangle, flipping winding so its face points the way the field rises (outward)
function emit(
  a: number[], b: number[], c: number[],
  gx: number, gy: number, gz: number,
  out: number[],
): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
  const nx = uy * wz - uz * wy;
  const ny = uz * wx - ux * wz;
  const nz = ux * wy - uy * wx;
  if (nx * gx + ny * gy + nz * gz >= 0) {
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  } else {
    out.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]); // flip
  }
}

// --- the implicit field --------------------------------------------------------------------

interface FlatPrims {
  ax: Float64Array; ay: Float64Array; az: Float64Array;
  bx: Float64Array; by: Float64Array; bz: Float64Array;
  pr: Float64Array; count: number;
}

function primitives(p: Phenotype, full: boolean): FlatPrims {
  // one capsule per edge (a capsule round-caps its ends, so joints/leaves need no spheres);
  // a lone node with no edges falls back to a degenerate a→a capsule (a sphere). Mesh only the body
  // skeleton (trunk + locomotor limbs); feature tips are drawn as solids (M24). Fall back to all
  // edges if a creature somehow has no body edges, so the surface is never empty.
  const include = full ? isHybridNode : isBodyNode;
  let bodyEdges = p.edges.filter(([a, b]) => include(p.nodes[a]) && include(p.nodes[b]));
  if (bodyEdges.length === 0) bodyEdges = p.edges;
  const edges = bodyEdges.length > 0 ? bodyEdges : null;
  const count = edges ? edges.length : p.nodes.length;
  const ax = new Float64Array(count), ay = new Float64Array(count), az = new Float64Array(count);
  const bx = new Float64Array(count), by = new Float64Array(count), bz = new Float64Array(count);
  const pr = new Float64Array(count);
  if (edges) {
    for (let i = 0; i < edges.length; i++) {
      const a = p.nodes[edges[i][0]];
      const b = p.nodes[edges[i][1]];
      ax[i] = a.pos[0]; ay[i] = a.pos[1]; az[i] = a.pos[2];
      bx[i] = b.pos[0]; by[i] = b.pos[1]; bz[i] = b.pos[2];
      pr[i] = (a.radius + b.radius) * 0.5;
    }
  } else {
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i];
      ax[i] = bx[i] = n.pos[0]; ay[i] = by[i] = n.pos[1]; az[i] = bz[i] = n.pos[2];
      pr[i] = n.radius;
    }
  }
  return { ax, ay, az, bx, by, bz, pr, count };
}

function clampi(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
