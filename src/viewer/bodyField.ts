/**
 * The creature's skin as an implicit field — pure math, no three.js (headless-testable; vec/quat
 * inlined per the engine house style).
 *
 * One source of truth for "where exactly is the surface?". Two consumers:
 *   - smoothSkin polygonizes the field (soft union, k > 0) into the M15 organic surface;
 *   - the mouth system (mouthLine/teeth) projects lip curves and tooth roots onto the SAME field,
 *     so face geometry is anchored to the true skin instead of hovering at idealized offsets —
 *     the root cause of the old floating teeth and glued-on "sandwich" jaws.
 *
 * The field is the smooth union of one capsule per body edge plus one ellipsoid per anisotropic
 * node (`BodyNode.scale` — shaped skulls, flat torsos), so a wedge head keeps its wedge in smooth
 * mode too. `Carve` ops subtract ellipsoidal cavities (mouth maws, lamprey funnels) with a soft
 * rim — a mouth becomes negative space cut into the head, not a lump glued in front of it.
 */
import type { Phenotype, BodyNode } from '../engine/grow';
import type { Vec3 } from '../engine/genome';

export interface FieldPrims {
  /** capsules, one per included edge: a→b with radius pr (round caps — joints need no spheres) */
  ax: Float64Array;
  ay: Float64Array;
  az: Float64Array;
  bx: Float64Array;
  by: Float64Array;
  bz: Float64Array;
  pr: Float64Array; // mean radius (legacy consumers: mean-girth measures, the grid floor)
  /** per-end radii: each edge is a ROUND CONE a(ra) → b(rb), so a chain of tapering nodes reads as one
   *  smooth tapered limb/trunk instead of a string of beads joined by constant-radius tubes */
  ra: Float64Array;
  rb: Float64Array;
  /** per-cone bounding sphere: centre (cx,cy,cz) and half-length hl (radius = hl + max(ra, rb)) —
   *  lets fieldAt skip any primitive that provably cannot change the smooth union at a point */
  cx: Float64Array;
  cy: Float64Array;
  cz: Float64Array;
  hl: Float64Array;
  nc: number;
  /** ellipsoid nodes (per-node anisotropy): centers ec (3·ne), orientations eq (4·ne), semi-axes er (3·ne) */
  ec: Float64Array;
  eq: Float64Array;
  er: Float64Array;
  ne: number;
  /** smooth-union blend radius; 0 → hard union (matches the capsule-kit surface) */
  k: number;
  /** how far an ellipsoid can overshoot its node's scalar radius (grid padding must cover this) */
  excess: number;
}

/** A subtractive ellipsoid cavity (a mouth, a funnel, an eye socket) smooth-MAXed out of the body. */
export interface Carve {
  pos: Vec3;
  quat: [number, number, number, number];
  radii: Vec3; // semi-axes in the carve's local frame (x width, y height, z depth)
  blend: number; // rim softness in world units — the fleshy lip roll where cavity meets skin
  band: number; // wet-flesh shading falloff: aFlesh fades to 0 this far outside the cavity wall
}

// The smooth body meshes only the locomotor silhouette — trunk + these limb kinds. Eyes, mouth,
// horns, wings, fins, ears, whiskers, etc. are drawn as solid features on top, so meshing them into
// the field only made thin floating lumps + gaps (M24 fix).
const BODY_PART_KINDS = new Set(['leg', 'tail', 'arm', 'tentacle', 'neck']);
export function isBodyNode(n: BodyNode): boolean {
  return n.kind === 'spine' || (n.part != null && BODY_PART_KINDS.has(n.part.kind));
}
// The HYBRID mode meshes *everything* (full part definition) except the eyes/mouth, which always draw
// as solids — best of both: an organic surface like smooth, but nothing drops out like capsules keep.
export function isHybridNode(n: BodyNode): boolean {
  // the carapace stub is drawn as a conforming shell of its own (smoothSkin.buildShellGeometry)
  return n.terminal !== 'eye' && n.terminal !== 'mouth' && n.terminal !== 'carapace';
}

/**
 * Flatten a phenotype into field primitives. `mode` picks the node filter (locomotor body vs. every
 * part); the same fallbacks as the original smoothSkin keep the field non-empty on any topology.
 * `k` starts at 0 (hard union) — smoothSkin assigns its blend radius after measuring mean girth.
 */
export function buildFieldPrims(p: Phenotype, mode: 'body' | 'hybrid' = 'body'): FieldPrims {
  const include = mode === 'hybrid' ? isHybridNode : isBodyNode;
  let bodyEdges = p.edges.filter(([a, b]) => include(p.nodes[a]) && include(p.nodes[b]));
  if (bodyEdges.length === 0) bodyEdges = p.edges;
  const edges = bodyEdges.length > 0 ? bodyEdges : null;
  const nc = edges ? edges.length : p.nodes.length;
  const ax = new Float64Array(nc), ay = new Float64Array(nc), az = new Float64Array(nc);
  const bx = new Float64Array(nc), by = new Float64Array(nc), bz = new Float64Array(nc);
  const pr = new Float64Array(nc);
  const ra = new Float64Array(nc);
  const rb = new Float64Array(nc);
  const included = new Set<BodyNode>();
  if (edges) {
    for (let i = 0; i < edges.length; i++) {
      const a = p.nodes[edges[i][0]];
      const b = p.nodes[edges[i][1]];
      ax[i] = a.pos[0]; ay[i] = a.pos[1]; az[i] = a.pos[2];
      bx[i] = b.pos[0]; by[i] = b.pos[1]; bz[i] = b.pos[2];
      pr[i] = (a.radius + b.radius) * 0.5;
      ra[i] = a.radius;
      rb[i] = b.radius;
      included.add(a);
      included.add(b);
    }
  } else {
    for (let i = 0; i < p.nodes.length; i++) {
      const n = p.nodes[i];
      ax[i] = bx[i] = n.pos[0]; ay[i] = by[i] = n.pos[1]; az[i] = bz[i] = n.pos[2];
      pr[i] = ra[i] = rb[i] = n.radius;
      included.add(n);
    }
  }

  // anisotropic nodes carry their shape as an ellipsoid primitive (capsules only know one radius)
  const shaped: BodyNode[] = [];
  for (const n of included) if (n.scale) shaped.push(n);
  const ne = shaped.length;
  const ec = new Float64Array(ne * 3);
  const eq = new Float64Array(ne * 4);
  const er = new Float64Array(ne * 3);
  let excess = 0;
  for (let i = 0; i < ne; i++) {
    const n = shaped[i];
    const s = n.scale as Vec3;
    ec[i * 3] = n.pos[0]; ec[i * 3 + 1] = n.pos[1]; ec[i * 3 + 2] = n.pos[2];
    eq[i * 4] = n.quat[0]; eq[i * 4 + 1] = n.quat[1]; eq[i * 4 + 2] = n.quat[2]; eq[i * 4 + 3] = n.quat[3];
    er[i * 3] = n.radius * s[0]; er[i * 3 + 1] = n.radius * s[1]; er[i * 3 + 2] = n.radius * s[2];
    excess = Math.max(excess, n.radius * (Math.max(s[0], s[1], s[2]) - 1));
  }
  const cx = new Float64Array(nc), cy = new Float64Array(nc), cz = new Float64Array(nc), hl = new Float64Array(nc);
  for (let i = 0; i < nc; i++) {
    cx[i] = (ax[i] + bx[i]) / 2;
    cy[i] = (ay[i] + by[i]) / 2;
    cz[i] = (az[i] + bz[i]) / 2;
    hl[i] = Math.hypot(bx[i] - ax[i], by[i] - ay[i], bz[i] - az[i]) / 2;
  }
  return { ax, ay, az, bx, by, bz, pr, ra, rb, cx, cy, cz, hl, nc, ec, eq, er, ne, k: 0, excess };
}

// rotate v by the CONJUGATE of q (world → the prim's local frame), inlined, no allocation of q'
function rotConj(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number, out: Vec3): void {
  // q* = (-x,-y,-z,w); v' = q* v q
  const ix = -qx, iy = -qy, iz = -qz, iw = qw;
  const tx = iw * vx + iy * vz - iz * vy;
  const ty = iw * vy + iz * vx - ix * vz;
  const tz = iw * vz + ix * vy - iy * vx;
  const tw = -ix * vx - iy * vy - iz * vz;
  out[0] = tx * iw + tw * -ix + ty * -iz - tz * -iy;
  out[1] = ty * iw + tw * -iy + tz * -ix - tx * -iz;
  out[2] = tz * iw + tw * -iz + tx * -iy - ty * -ix;
}

const SCRATCH: Vec3 = [0, 0, 0];

// --- shared small vector math (the viewer's pure-math home, next to qRotateV/basisToQuat) ------

/** Normalize, with an explicit degenerate fallback — callers pick the axis that is load-bearing
 *  for THEM (e.g. the jaw hinge falls back to the corner axis [1,0,0], aim-shaped code to [0,0,1]). */
export function norm3(v: Vec3, fallback: Vec3 = [0, 0, 1]): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [fallback[0], fallback[1], fallback[2]];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Rotate v by quaternion q (allocating — for the cold mouth-line paths, not the field hot loop). */
export function qRotateV(q: readonly number[], v: readonly number[]): Vec3 {
  const [x, y, z, w] = q;
  const tx = w * v[0] + y * v[2] - z * v[1];
  const ty = w * v[1] + z * v[0] - x * v[2];
  const tz = w * v[2] + x * v[1] - y * v[0];
  const tw = -x * v[0] - y * v[1] - z * v[2];
  return [
    tx * w + tw * -x + ty * -z - tz * -y,
    ty * w + tw * -y + tz * -x - tx * -z,
    tz * w + tw * -z + tx * -y - ty * -x,
  ];
}

/** Quaternion from an orthonormal right-handed basis (columns X, Y, Z) — orients teeth/lips. */
export function basisToQuat(X: readonly number[], Y: readonly number[], Z: readonly number[]): [number, number, number, number] {
  // standard rotation-matrix → quaternion (Shepperd), matrix columns = the basis vectors
  const m00 = X[0], m10 = X[1], m20 = X[2];
  const m01 = Y[0], m11 = Y[1], m21 = Y[2];
  const m02 = Z[0], m12 = Z[1], m22 = Z[2];
  const tr = m00 + m11 + m22;
  let qx: number, qy: number, qz: number, qw: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return [qx, qy, qz, qw];
}

// polynomial smooth-min (soft union) — the same form smoothSkin has always used
function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const t = 0.5 + (0.5 * (a - b)) / k;
  const h = t < 0 ? 0 : t > 1 ? 1 : t;
  return a * (1 - h) + b * h - k * h * (1 - h);
}

/**
 * Exact signed distance to a round cone — the convex hull of sphere(a, r1) and sphere(b, r2)
 * (Quilez). This is what makes a tapering chain read as ONE smooth limb: consecutive cones share the
 * joint sphere, so radius varies continuously along the skeleton instead of stepping per edge.
 */
export function roundConeDist(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2: number,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  // degenerate: a zero-length edge, or one end-sphere swallows the other → the bigger sphere
  if (l2 < 1e-12 || a2 <= 1e-12) {
    const da = Math.sqrt(pax * pax + pay * pay + paz * paz) - r1;
    const qx = px - bx, qy = py - by, qz = pz - bz;
    const db = Math.sqrt(qx * qx + qy * qy + qz * qz) - r2;
    return da < db ? da : db;
  }
  const il2 = 1 / l2;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const wx = pax * l2 - bax * y, wy = pay * l2 - bay * y, wz = paz * l2 - baz * y;
  const x2 = wx * wx + wy * wy + wz * wz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** The body field: < 0 inside the creature, 0 on the skin, > 0 outside. */
export function fieldAt(f: FieldPrims, x: number, y: number, z: number): number {
  let d = Infinity;
  const k = f.k;
  for (let m = 0; m < f.nc; m++) {
    // Exact culling: smin(val, d, k) returns d unchanged whenever val ≥ d + k, and val is at least
    // the distance to the cone's bounding sphere — so a cone whose sphere is that far away is skipped.
    // per-primitive blend: a thin limb blends over at most ~its own radius, so slender legs keep their
    // definition instead of webbing into each other, while fat trunk sections still fuse softly
    const rMaxM = f.ra[m] > f.rb[m] ? f.ra[m] : f.rb[m];
    const km = k < rMaxM * 1.1 ? k : rMaxM * 1.1;
    if (d !== Infinity) {
      const ox = x - f.cx[m], oy = y - f.cy[m], oz = z - f.cz[m];
      const lim = d + km + f.hl[m] + rMaxM;
      if (lim > 0 && ox * ox + oy * oy + oz * oz > lim * lim) continue;
    }
    const val = roundConeDist(x, y, z, f.ax[m], f.ay[m], f.az[m], f.bx[m], f.by[m], f.bz[m], f.ra[m], f.rb[m]);
    d = d === Infinity ? val : smin(val, d, km);
  }
  for (let m = 0; m < f.ne; m++) {
    if (d !== Infinity) {
      const ox = x - f.ec[m * 3], oy = y - f.ec[m * 3 + 1], oz = z - f.ec[m * 3 + 2];
      const R = Math.max(f.er[m * 3], f.er[m * 3 + 1], f.er[m * 3 + 2]);
      const lim = d + k + R;
      if (lim > 0 && ox * ox + oy * oy + oz * oz > lim * lim) continue;
    }
    // scaled-space ellipsoid distance (underestimates on long axes — safe for a union)
    rotConj(f.eq[m * 4], f.eq[m * 4 + 1], f.eq[m * 4 + 2], f.eq[m * 4 + 3], x - f.ec[m * 3], y - f.ec[m * 3 + 1], z - f.ec[m * 3 + 2], SCRATCH);
    const rx = f.er[m * 3], ry = f.er[m * 3 + 1], rz = f.er[m * 3 + 2];
    const qx = SCRATCH[0] / rx, qy = SCRATCH[1] / ry, qz = SCRATCH[2] / rz;
    const minR = Math.min(rx, ry, rz);
    const val = (Math.sqrt(qx * qx + qy * qy + qz * qz) - 1) * minR;
    d = d === Infinity ? val : smin(val, d, f.k);
  }
  return d;
}

/** Signed distance to a carve's cavity wall: < 0 inside the cavity, > 0 in solid flesh/air. */
export function carveDist(c: Carve, x: number, y: number, z: number): number {
  rotConj(c.quat[0], c.quat[1], c.quat[2], c.quat[3], x - c.pos[0], y - c.pos[1], z - c.pos[2], SCRATCH);
  const qx = SCRATCH[0] / c.radii[0], qy = SCRATCH[1] / c.radii[1], qz = SCRATCH[2] / c.radii[2];
  return (Math.sqrt(qx * qx + qy * qy + qz * qz) - 1) * Math.min(c.radii[0], c.radii[1], c.radii[2]);
}

/** The body field with cavities subtracted: smax(body, −cavity) with a soft fleshy rim. */
export function fieldAtCarved(f: FieldPrims, carves: readonly Carve[], x: number, y: number, z: number): number {
  let d = fieldAt(f, x, y, z);
  for (let i = 0; i < carves.length; i++) {
    const c = carves[i];
    d = -smin(-d, carveDist(c, x, y, z), c.blend); // smax(d, −cd) = −smin(−d, cd)
  }
  return d;
}

/** Central-difference gradient of the carved field (≈ the outward surface normal on the skin). */
export function fieldGrad(f: FieldPrims, carves: readonly Carve[], x: number, y: number, z: number, out: Vec3): void {
  const h = 1e-3;
  out[0] = fieldAtCarved(f, carves, x + h, y, z) - fieldAtCarved(f, carves, x - h, y, z);
  out[1] = fieldAtCarved(f, carves, x, y + h, z) - fieldAtCarved(f, carves, x, y - h, z);
  out[2] = fieldAtCarved(f, carves, x, y, z + h) - fieldAtCarved(f, carves, x, y, z - h);
  const len = Math.hypot(out[0], out[1], out[2]);
  if (len > 1e-9) {
    out[0] /= len;
    out[1] /= len;
    out[2] /= len;
  } else {
    out[0] = 0; out[1] = 0; out[2] = 1;
  }
}

export interface SurfacePoint {
  p: Vec3;
  n: Vec3; // outward unit normal
}

/**
 * March a ray from `origin` along unit `dir` to the first inside→outside zero crossing, then bisect.
 * Use with an origin inside the body (a head center) to find where a face ray exits the skin.
 * Returns null if the ray never exits within `maxT` (origin already outside marches forward first).
 */
export function rayToSurface(f: FieldPrims, carves: readonly Carve[], origin: Vec3, dir: Vec3, maxT = 12): SurfacePoint | null {
  let t = 0;
  let dPrev = fieldAtCarved(f, carves, origin[0], origin[1], origin[2]);
  let tPrev = 0;
  for (let i = 0; i < 96 && t < maxT; i++) {
    // inside: |d| under-estimates the distance to the surface, so stepping by −d can't overshoot
    const step = dPrev < 0 ? Math.max(-dPrev * 0.9, 0.01) : 0.02;
    t += step;
    const d = fieldAtCarved(f, carves, origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t);
    if (dPrev < 0 && d >= 0) {
      // bisect the bracket [tPrev, t] — 16 halvings take a ~0.5 bu bracket well under the 1e-4
      // tolerance the callers assert, and each extra step is a full field evaluation
      let lo = tPrev, hi = t;
      for (let j = 0; j < 16; j++) {
        const mid = (lo + hi) / 2;
        if (hi - lo < 1e-5) break;
        const dm = fieldAtCarved(f, carves, origin[0] + dir[0] * mid, origin[1] + dir[1] * mid, origin[2] + dir[2] * mid);
        if (dm < 0) lo = mid;
        else hi = mid;
      }
      const tf = (lo + hi) / 2;
      const p: Vec3 = [origin[0] + dir[0] * tf, origin[1] + dir[1] * tf, origin[2] + dir[2] * tf];
      const n: Vec3 = [0, 0, 1];
      fieldGrad(f, carves, p[0], p[1], p[2], n);
      return { p, n };
    }
    dPrev = d;
    tPrev = t;
  }
  return null;
}

/**
 * Newton-walk a point onto the nearest surface (|field| → 0 along the gradient). For points already
 * near the skin (offset lip curves, tooth roots) this converges in a few steps; the field is not a
 * true SDF under soft blends, so steps are damped and capped for safety.
 */
export function projectToSurface(f: FieldPrims, carves: readonly Carve[], start: Vec3): SurfacePoint {
  const p: Vec3 = [start[0], start[1], start[2]];
  const g: Vec3 = [0, 0, 1];
  for (let i = 0; i < 32; i++) {
    const d = fieldAtCarved(f, carves, p[0], p[1], p[2]);
    if (Math.abs(d) < 1e-4) break;
    fieldGrad(f, carves, p[0], p[1], p[2], g);
    const step = Math.max(-0.25, Math.min(0.25, d * 0.85)); // damped + capped — soft blends are not unit-gradient
    p[0] -= g[0] * step;
    p[1] -= g[1] * step;
    p[2] -= g[2] * step;
  }
  fieldGrad(f, carves, p[0], p[1], p[2], g);
  return { p, n: [g[0], g[1], g[2]] };
}
