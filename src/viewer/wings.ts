/**
 * Wing geometry — pure three.js BufferGeometry builders (no React), unit-testable headlessly.
 *
 * The old wing was one flat triangle fan drawn outward from the wing's TIP node: a kite. Real wings
 * are built from the shoulder and come in two very different constructions:
 *
 *   - FEATHERED (birds, feathered chimeras): at rest the wing is FOLDED along the flank — a leaf of
 *     layered feathers: rows of short rounded coverts over the shoulder, a row of secondaries along
 *     the lower edge (with a contrasting speculum band), and long primaries stacked at the tip,
 *     reaching back past the hip. Merged into one vertex-coloured mesh.
 *   - MEMBRANE (dragons, wyverns, bats): spread and raised — a stout arm bone to the wrist, four
 *     finger bones fanning from it, and skin panels stretched between the fingers whose trailing
 *     edges sag in scallops between the tips and billow slightly out of plane, plus the hind panel
 *     back to the flank and a small thumb claw at the wrist.
 *
 * Everything is built in the creature's BODY frame (+Z forward, +Y up, ±X the side), relative to the
 * shoulder, so posture is controlled directly instead of inheriting whatever aim the part grew with.
 */
import * as THREE from 'three';

export type WingKind = 'feathered' | 'membrane';

export interface WingBone {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r0: number; // radius at a
  r1: number; // radius at b
}

export interface WingBuild {
  /** the membrane / feather surface (vertex-coloured for feathers) */
  surface: THREE.BufferGeometry;
  /** structural bones (membrane wings) — empty for feathered */
  bones: WingBone[];
  /** wrist position (thumb claw) for membrane wings */
  wrist: THREE.Vector3 | null;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- membrane ------------------------------------------------------------------------------------

/**
 * A spread membrane wing on side `side` (±1) with span `S`, relative to the shoulder at the origin.
 * `raise` (0..1) lifts the wing from a level glide to a high display.
 */
export function buildMembraneWing(side: number, S: number, raise = 0.6): WingBuild {
  const s = side >= 0 ? 1 : -1;
  // span axis: out, up and a little back; chord axis: back toward the trailing edge
  const u = v3(s, 0.35 + 0.5 * raise, -0.28).normalize();
  const c0 = v3(0, -0.2, -1);
  const c = c0.sub(u.clone().multiplyScalar(c0.dot(u))).normalize(); // orthogonal to the span
  const n = new THREE.Vector3().crossVectors(u, c).normalize(); // membrane normal (for billow)

  const P0 = v3(0, 0, 0);
  const W = u.clone().multiplyScalar(0.4 * S); // wrist
  // finger fan: angle from the span axis toward the chord axis, and finger length
  const fingers: [number, number][] = [
    [0.12, 0.66],
    [0.48, 0.64],
    [0.86, 0.56],
    [1.25, 0.46],
  ];
  const tips = fingers.map(([th, L]) =>
    W.clone().add(u.clone().multiplyScalar(Math.cos(th) * L * S)).add(c.clone().multiplyScalar(Math.sin(th) * L * S)),
  );
  // the hind panel attaches back along the flank, a little below the shoulder
  const B = c.clone().multiplyScalar(0.5 * S).add(v3(0, -0.06 * S, 0));
  B.x = s * Math.max(s * B.x, 0.03 * S); // the hind panel meets ITS OWN flank, never across the midline
  // a little leading-edge skin (propatagium) from the shoulder out to the first finger's base
  const L0 = u.clone().multiplyScalar(0.18 * S).add(c.clone().multiplyScalar(-0.05 * S));

  const pos: number[] = [];
  const idx: number[] = [];
  const ROWS = 6;
  const COLS = 10;
  /** A skin panel fanning from hub H across the scalloped edge e0 → e1 (sagging toward H). */
  const panel = (H: THREE.Vector3, e0: THREE.Vector3, e1: THREE.Vector3, sag: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= COLS; i++) {
      const t = i / COLS;
      const edge = e0.clone().lerp(e1, t);
      // scallop: the free edge between two fingertips sags back toward the hub
      edge.lerp(H, sag * Math.sin(Math.PI * t));
      for (let j = 0; j <= ROWS; j++) {
        const r = j / ROWS;
        const p = H.clone().lerp(edge, r);
        // billow: the skin bellies out of plane between its bones
        p.add(n.clone().multiplyScalar(0.035 * S * Math.sin(Math.PI * r) * Math.sin(Math.PI * t)));
        pos.push(p.x, p.y, p.z);
      }
    }
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        const a = base + i * (ROWS + 1) + j;
        const b = a + ROWS + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  };
  panel(P0, L0, W, 0.0);
  panel(W, tips[0], tips[1], 0.12);
  panel(W, tips[1], tips[2], 0.14);
  panel(W, tips[2], tips[3], 0.14);
  panel(W, tips[3], B, 0.2);
  panel(P0, W, B, 0.0); // the inner panel from the arm back to the flank

  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  surface.setIndex(idx);
  surface.computeVertexNormals();

  const bones: WingBone[] = [
    { a: P0, b: W, r0: 0.05 * S, r1: 0.035 * S },
    ...tips.map((t, i) => ({ a: W, b: t, r0: 0.024 * S * (1 - i * 0.12), r1: 0.006 * S })),
  ];
  return { surface, bones, wrist: W };
}

// --- feathers ------------------------------------------------------------------------------------

/** One feather: a slightly cupped lens in its own frame (+X along the shaft, +Y across the vane). */
function featherInto(
  pos: number[], col: number[], idx: number[],
  origin: THREE.Vector3, along: THREE.Vector3, across: THREE.Vector3, normal: THREE.Vector3,
  length: number, width: number, color: THREE.Color, lift: number,
): void {
  const base = pos.length / 3;
  const SEG = 7;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    // a feather is widest a third of the way along, rounded at the tip, narrow at the quill
    const w = width * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.08)) * (t < 0.12 ? t / 0.12 : 1);
    for (const k of [-1, 0, 1]) {
      const p = origin.clone()
        .add(along.clone().multiplyScalar(t * length))
        .add(across.clone().multiplyScalar(k * w * 0.5))
        // the vane cups away from the body and the whole feather rides `lift` proud of the one below
        .add(normal.clone().multiplyScalar(lift + (k === 0 ? 0.25 : 0) * width * 0.25));
      pos.push(p.x, p.y, p.z);
      // the rachis (shaft) runs a touch lighter
      const shade = k === 0 ? 1.12 : 1.0;
      col.push(color.r * shade, color.g * shade, color.b * shade);
    }
  }
  for (let i = 0; i < SEG; i++) {
    const a = base + i * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
}

/**
 * A folded feathered wing on side `side` (±1), length `S` (shoulder → primary tips), relative to the
 * shoulder at the origin. `base` is the plumage colour; `accent` tints the speculum band.
 */
export function buildFeatheredWing(side: number, S: number, base: THREE.Color, accent: THREE.Color): WingBuild {
  const s = side >= 0 ? 1 : -1;
  // the folded wing lies along the flank: its long axis runs back and a little down, its plane
  // faces outward (normal ≈ +side X), tucked a touch toward the body at the tips
  const back = v3(-0.12 * s, -0.12, -1).normalize();
  const normal = v3(s, 0.1, -0.05).normalize();
  // in-plane "down": world down with its normal and long-axis components removed (Gram–Schmidt)
  const down = v3(0, -1, 0);
  down.sub(normal.clone().multiplyScalar(down.dot(normal)));
  down.sub(back.clone().multiplyScalar(down.dot(back)));
  down.normalize();

  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const at = (alongT: number, downT: number) =>
    back.clone().multiplyScalar(alongT * S).add(down.clone().multiplyScalar(downT * S));

  const dark = base.clone().multiplyScalar(0.5);
  const mid = base.clone().multiplyScalar(0.78);
  const spec = base.clone().lerp(accent, 0.65).multiplyScalar(0.9);

  // primaries — long, stacked at the tip, fanning very slightly so their tips separate
  const NP = 7;
  for (let i = 0; i < NP; i++) {
    const t = i / (NP - 1);
    const dir = back.clone().add(down.clone().multiplyScalar(0.08 + 0.1 * t)).normalize();
    featherInto(pos, col, idx, at(0.42 + 0.03 * t, 0.06 + 0.07 * t), dir, down, normal,
      S * (0.62 - 0.14 * t), S * 0.13, dark.clone().multiplyScalar(0.92 + 0.16 * t), 0.004 * S * (NP - i));
  }
  // secondaries — along the lower edge, pointing back-and-down, the speculum band near their tips
  const NS = 8;
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1);
    const dir = back.clone().multiplyScalar(0.75).add(down.clone().multiplyScalar(0.62)).normalize();
    featherInto(pos, col, idx, at(0.05 + 0.4 * t, 0.06), dir, back, normal,
      S * 0.3, S * 0.11, (i % 2 === 0 ? spec : mid).clone(), 0.03 * S + 0.002 * S * i);
  }
  // coverts — two rows of short rounded feathers shingled over the shoulder and wing root
  for (let row = 0; row < 2; row++) {
    const NC = 6 - row;
    for (let i = 0; i < NC; i++) {
      const t = i / Math.max(NC - 1, 1);
      const dir = back.clone().multiplyScalar(0.8).add(down.clone().multiplyScalar(0.5)).normalize();
      featherInto(pos, col, idx, at(0.02 + 0.38 * t, -0.04 + row * 0.07), dir, back, normal,
        S * (0.17 - row * 0.03), S * 0.12, base.clone().multiplyScalar(1.0 - row * 0.08), 0.05 * S + row * 0.008 * S);
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  surface.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  surface.setIndex(idx);
  surface.computeVertexNormals();
  return { surface, bones: [], wrist: null };
}

/**
 * A bird's tail: a fan of long rectrices spread in a near-horizontal plane, pointing back from the
 * tail tip (in the body frame, origin at the tail node). Replaces the fish caudal fin a feathered
 * creature's tail used to end in.
 */
export function buildTailFan(S: number, base: THREE.Color, accent: THREE.Color, droop = 0.25): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const N = 9;
  const normal = v3(0, 1, -droop).normalize();
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const ang = (t - 0.5) * 1.1; // ±31° fan
    const along = v3(Math.sin(ang), -droop, -Math.cos(ang)).normalize();
    const across = new THREE.Vector3().crossVectors(normal, along).normalize();
    // outer feathers shorter (a rounded fan), the central pair longest, banded tips
    const len = S * (0.75 + 0.25 * Math.cos((t - 0.5) * Math.PI));
    const c = (i % 2 === 0 ? base.clone().multiplyScalar(0.62) : base.clone().lerp(accent, 0.35).multiplyScalar(0.7));
    // stack from the outside in so the central feathers lie on top
    const lift = 0.006 * S * (N / 2 - Math.abs(i - (N - 1) / 2));
    featherInto(pos, col, idx, v3(0, 0, 0), along, across, normal, len, S * 0.2, c, lift);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Shrink-wrap a surface onto a body: every vertex closer to (or inside) the body than `margin` is
 * pushed out along the field gradient until it rides `margin` above the skin. A flat leaf of folded
 * feathers cannot lie on a convex flank — wrapped, the wing hugs the body's curvature the way a real
 * folded wing does, its layers keeping their stacking order. `origin` is the geometry's offset in the
 * body frame (the field is in body space). Normals are recomputed.
 */
export function conformToSurface(
  geo: THREE.BufferGeometry,
  field: (x: number, y: number, z: number) => number,
  origin: readonly number[],
  margin: number,
): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const h = 1e-3;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) + origin[0], y = pos.getY(i) + origin[1], z = pos.getZ(i) + origin[2];
    for (let it = 0; it < 4; it++) {
      const d = field(x, y, z);
      if (d >= margin) break;
      let gx = field(x + h, y, z) - field(x - h, y, z);
      let gy = field(x, y + h, z) - field(x, y - h, z);
      let gz = field(x, y, z + h) - field(x, y, z - h);
      const gl = Math.hypot(gx, gy, gz);
      if (gl < 1e-12) break;
      gx /= gl; gy /= gl; gz /= gl;
      const step = Math.min(margin - d, 0.5);
      x += gx * step; y += gy * step; z += gz * step;
    }
    pos.setXYZ(i, x - origin[0], y - origin[1], z - origin[2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}
