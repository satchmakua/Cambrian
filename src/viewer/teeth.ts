/**
 * Teeth (mouth overhaul) — placement is PURE math over the mouth line; geometry is one shared
 * curved-fang mesh drawn as an InstancedMesh (a whole row is a single draw call).
 *
 * The one rule that kills floating teeth: a tooth's root interpolates the SAME on-surface curve
 * its gum ridge is swept along, and its frame comes from that curve's tangent + surface normal.
 * Sizes follow a per-variant profile (canine peaks, blunt incisors, ragged needles); jitter is
 * seeded and mirrored so bilateral symmetry (M18) survives; lower rows offset half a spacing so
 * closed jaws interlock instead of clashing tip-to-tip.
 */
import * as THREE from 'three';
import type { Vec3 } from '../engine/genome';
import { basisToQuat, norm3 } from './bodyField';
import { hash01, type MouthSample } from './mouthLine';
import { TOOTH } from './mouths/palette';

export interface ToothXform {
  pos: Vec3; // root center, pulled back into the gum by `sink`
  quat: [number, number, number, number]; // local +Y = the emerge axis, +Z ≈ out of the face
  len: number; // world crown height
  w: number; // world base radius
}

export interface ToothProfile {
  count: number;
  /** crown length (multiples of the mouth radius r) at |t| = u — 0 is the front, 1 the corner */
  len: (u: number) => number;
  width: number; // base radius as a fraction of crown length
  curl: number; // rake toward the throat (rad) — predator teeth sweep back
  jitterLen: number; // ± fraction of length, drawn per |t| so left/right twins match
  jitterRock: number; // ± side-rock (rad), antisymmetric (twins rock opposite ways)
  sink: number; // fraction of the crown buried in the gum
  margin: number; // keep this fraction of t clear of the corners
  salt: number; // seed salt — upper vs lower rows draw independent jitter
}

/** Interpolate the mouth-line polyline (uniform in t) at an arbitrary t ∈ [−1, 1]. */
function sampleAt(row: readonly MouthSample[], t: number): MouthSample {
  const n = row.length;
  const x = ((t + 1) / 2) * (n - 1);
  const i = Math.min(n - 2, Math.max(0, Math.floor(x)));
  const f = Math.min(1, Math.max(0, x - i));
  return lerpSamples(row[i], row[i + 1], f, t);
}

/** Ring interpolation: buildMouthRing's samples are CLOSED (t ∈ [−1, 1), the last segment wraps
 *  back to the first), so mapping t through the open `sampleAt` compresses the ring into n−1
 *  segments and bunches teeth at the wrap. This maps the full turn, wrap segment included. */
function sampleAtRing(ring: readonly MouthSample[], t: number): MouthSample {
  const n = ring.length;
  let x = ((t + 1) / 2) * n;
  x = ((x % n) + n) % n;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return lerpSamples(ring[i], ring[(i + 1) % n], f, t);
}

function lerpSamples(a: MouthSample, b: MouthSample, f: number, t: number): MouthSample {
  const lerp3 = (u: Vec3, v: Vec3): Vec3 => [u[0] + (v[0] - u[0]) * f, u[1] + (v[1] - u[1]) * f, u[2] + (v[2] - u[2]) * f];
  return {
    t,
    p: lerp3(a.p, b.p),
    n: norm3(lerp3(a.n, b.n)),
    tan: norm3(lerp3(a.tan, b.tan)),
    away: norm3(lerp3(a.away, b.away)),
  };
}

/**
 * Place one row of teeth along a lip curve. `r` scales the profile; `seed` feeds every draw;
 * `interlock` shifts the row half a spacing (use on the lower row so closed jaws mesh).
 */
export function toothRow(
  row: readonly MouthSample[],
  profile: ToothProfile,
  r: number,
  seed: number,
  interlock = false,
): ToothXform[] {
  const out: ToothXform[] = [];
  if (profile.count <= 0) return out;
  const span = 2 * (1 - profile.margin);
  const step = profile.count > 1 ? span / (profile.count - 1) : 0;
  // an interlocked row sits at the gaps of the other row: count−1 teeth at the midpoints,
  // so closed jaws mesh tooth-into-gap instead of clashing tip to tip
  const n = interlock && profile.count > 1 ? profile.count - 1 : profile.count;
  for (let i = 0; i < n; i++) {
    const t = profile.count > 1 ? -(span / 2) + (i + (interlock ? 0.5 : 0)) * step : 0;
    const sm = sampleAt(row, t);

    // mirrored jitter: twins at ±t share a |t| key, so symmetry survives (M18)
    const key = Math.round(Math.abs(t) * 512);
    const jl = (hash01(seed, profile.salt * 131 + key) * 2 - 1) * profile.jitterLen;
    const rockMag = (hash01(seed, profile.salt * 131 + key + 7) * 2 - 1) * profile.jitterRock;
    // antisymmetric — twins rock apart, mirror-true. The centre tooth of an ODD row must not rock
    // at all: its `t` is a sum of steps that only lands on exactly 0 for some counts, so an
    // `=== 0` test let a t of ~1e-16 take a full-magnitude rock and broke bilateral symmetry (M18).
    const rock = Math.abs(t) < 1e-9 ? 0 : Math.sign(t) * rockMag;

    const len = Math.max(0.02, profile.len(Math.abs(t)) * r * (1 + jl));
    const w = Math.max(0.008, len * profile.width);

    // emerge = across the mouth opening (−away), raked toward the throat (−n) by curl, rocked
    // side-to-side about the emerge axis by tilting along the tangent.
    const cc = Math.cos(profile.curl), sc = Math.sin(profile.curl);
    let ey = -sm.away[1] * cc - sm.n[1] * sc;
    let ex = -sm.away[0] * cc - sm.n[0] * sc;
    let ez = -sm.away[2] * cc - sm.n[2] * sc;
    if (rock !== 0) {
      const cr = Math.cos(rock), sr = Math.sin(rock);
      ex = ex * cr + sm.tan[0] * sr;
      ey = ey * cr + sm.tan[1] * sr;
      ez = ez * cr + sm.tan[2] * sr;
    }
    const Y = norm3([ex, ey, ez]);
    // Z = outward surface normal made ⊥ Y; X completes the right-handed frame
    const d = sm.n[0] * Y[0] + sm.n[1] * Y[1] + sm.n[2] * Y[2];
    const Z = norm3([sm.n[0] - Y[0] * d, sm.n[1] - Y[1] * d, sm.n[2] - Y[2] * d]);
    const X: Vec3 = [Y[1] * Z[2] - Y[2] * Z[1], Y[2] * Z[0] - Y[0] * Z[2], Y[0] * Z[1] - Y[1] * Z[0]];

    out.push({
      pos: [sm.p[0] - Y[0] * len * profile.sink, sm.p[1] - Y[1] * len * profile.sink, sm.p[2] - Y[2] * len * profile.sink],
      quat: basisToQuat(X, Y, Z),
      len,
      w,
    });
  }
  return out;
}

/** Teeth ringing a closed curve (lamprey funnels): emerge inward across the ring, raked down-throat. */
export function toothRing(
  ring: readonly MouthSample[],
  count: number,
  lenR: number, // crown length in multiples of r
  r: number,
  seed: number,
  salt: number,
  inward: Vec3, // unit direction down the throat (teeth rake toward it)
): ToothXform[] {
  const out: ToothXform[] = [];
  for (let i = 0; i < count; i++) {
    const t = -1 + (2 * i) / count;
    const sm = sampleAtRing(ring, t); // ring-aware — even spacing across the wrap segment
    // Jitter keyed on a MIRROR-INVARIANT of the placement, not the index. The X=0 mirror flips only
    // x, so quantizing (|x|, y) hands mirror-partner teeth the same size while keeping top/bottom
    // distinct — the same trick toothRow uses with |t|. Keying on `i` broke bilateral symmetry on
    // even-count rings (M18): partners i and count/2−i drew different jitter (~0.019r apart).
    const key = Math.round(Math.abs(sm.p[0]) * 512) * 8192 + Math.round((sm.p[1] + 32) * 512);
    const jl = (hash01(seed, salt * 131 + key) * 2 - 1) * 0.3;
    const len = Math.max(0.02, lenR * r * (1 + jl));
    // emerge: across the ring toward its center, tipped down the throat
    const Y = norm3([
      -sm.away[0] * 0.8 + inward[0] * 0.45,
      -sm.away[1] * 0.8 + inward[1] * 0.45,
      -sm.away[2] * 0.8 + inward[2] * 0.45,
    ]);
    const d = sm.n[0] * Y[0] + sm.n[1] * Y[1] + sm.n[2] * Y[2];
    const Z = norm3([sm.n[0] - Y[0] * d, sm.n[1] - Y[1] * d, sm.n[2] - Y[2] * d]);
    const X: Vec3 = [Y[1] * Z[2] - Y[2] * Z[1], Y[2] * Z[0] - Y[0] * Z[2], Y[0] * Z[1] - Y[1] * Z[0]];
    out.push({
      pos: [sm.p[0] - Y[0] * len * 0.3, sm.p[1] - Y[1] * len * 0.3, sm.p[2] - Y[2] * len * 0.3],
      quat: basisToQuat(X, Y, Z),
      len,
      w: len * 0.16,
    });
  }
  return out;
}

// --- geometry + instancing (three.js side) ---------------------------------------------------

/**
 * One shared curved-fang mesh: root at the origin, crown up local +Y, tip curled toward −Z (the
 * throat, once the placement frame orients +Z out of the face). Vertex colors bake a root→tip
 * gradient — shadowed at the gum, grimy ivory mid-crown, faintly translucent-bright at the tip —
 * so instanced teeth read as rooted enamel, not uniform plastic cones.
 */
export function fangGeometry(rings = 7, radial = 7, bend = 0.22): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const root = new THREE.Color(0x8a7a58); // gum-shadowed root
  const mid = new THREE.Color(TOOTH); // the house grimy ivory
  const tip = new THREE.Color(0xf2ead3); // worn translucent point
  const c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const rad = 0.5 * Math.pow(1 - v, 1.15) + 0.005; // tapered crown, never a zero-width ring
    const zOff = -bend * v * v; // quadratic rake — the curve that reads "fang", not "cone"
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      positions.push(Math.cos(a) * rad, v, Math.sin(a) * rad + zOff);
      c.copy(root);
      if (v > 0.25) c.lerpColors(mid, tip, (v - 0.25) / 0.75);
      else c.lerpColors(root, mid, v / 0.25);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j, b = i * radial + j2, d = (i + 1) * radial + j, e = (i + 1) * radial + j2;
      indices.push(a, d, b, b, d, e);
    }
  }
  // tip point + root cap
  const tipIdx = positions.length / 3;
  positions.push(0, 1.02, -bend);
  colors.push(tip.r, tip.g, tip.b);
  const rootIdx = tipIdx + 1;
  positions.push(0, 0, 0);
  colors.push(root.r, root.g, root.b);
  for (let j = 0; j < radial; j++) {
    const j2 = (j + 1) % radial;
    indices.push(tipIdx, rings * radial + j, rings * radial + j2);
    indices.push(rootIdx, j2, j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Write a row of tooth transforms into an InstancedMesh's matrices. */
export function setToothInstances(mesh: THREE.InstancedMesh, teeth: readonly ToothXform[]): void {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i < teeth.length; i++) {
    const tooth = teeth[i];
    q.set(tooth.quat[0], tooth.quat[1], tooth.quat[2], tooth.quat[3]);
    s.set(tooth.w * 2, tooth.len, tooth.w * 2); // fang geometry is unit-height, 0.5-radius
    t.set(tooth.pos[0], tooth.pos[1], tooth.pos[2]);
    m.compose(t, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.count = teeth.length;
  mesh.instanceMatrix.needsUpdate = true;
}

