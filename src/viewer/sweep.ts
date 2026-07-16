/**
 * Swept-tube geometry (mouth overhaul) — a variable-radius, flattenable tube along a polyline.
 *
 * three's TubeGeometry can't vary its radius or cross-section, which is exactly what lips, gum
 * ridges and trunks need: fat in the middle, vanishing at the corners, squashed against the skin.
 * Each input sample carries the surface normal it should hug; the cross-section ellipse's short
 * axis lies along that normal (`flatten` < 1), so the tube reads as flesh pressed onto the face,
 * not a torus resting on it.
 */
import * as THREE from 'three';
import type { Vec3 } from '../engine/genome';
import { norm3 } from './bodyField';

export interface SweepPoint {
  p: Vec3;
  n: Vec3; // the direction to flatten along (usually the local surface normal)
}

export interface SweepOpts {
  radius: (u: number) => number; // world radius at u ∈ [0..1] along the polyline
  flatten?: number; // 1 = round; < 1 squashes the cross-section along each sample's n
  radialSegments?: number;
  caps?: boolean; // close the ends with triangle fans
  closed?: boolean; // treat the points as a loop (rings) — wraps rings, ignores caps
}

export function sweepTube(pts: readonly SweepPoint[], opts: SweepOpts): THREE.BufferGeometry {
  const m = pts.length;
  const radial = Math.max(3, opts.radialSegments ?? 10);
  const flatten = opts.flatten ?? 1;
  const closed = opts.closed ?? false;
  const positions: number[] = [];
  const indices: number[] = [];

  // per-sample frames: tangent from neighbors; N = the sample normal made ⊥ tangent; B = T × N.
  // Using the *supplied* normals (not parallel transport) keeps the flatten axis welded to the
  // skin along the whole sweep — which is the point.
  const T: Vec3[] = [];
  const N: Vec3[] = [];
  const B: Vec3[] = [];
  for (let i = 0; i < m; i++) {
    const a = closed ? pts[(i - 1 + m) % m].p : pts[Math.max(0, i - 1)].p;
    const b = closed ? pts[(i + 1) % m].p : pts[Math.min(m - 1, i + 1)].p;
    const t = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let n: Vec3 = pts[i].n;
    const d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
    n = norm3([n[0] - t[0] * d, n[1] - t[1] * d, n[2] - t[2] * d]);
    T.push(t);
    N.push(n);
    B.push([t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]]);
  }

  for (let i = 0; i < m; i++) {
    const u = closed ? i / m : m > 1 ? i / (m - 1) : 0;
    const r = Math.max(opts.radius(u), 1e-4);
    const c = pts[i].p;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cn = Math.cos(a) * r * flatten;
      const cb = Math.sin(a) * r;
      positions.push(
        c[0] + N[i][0] * cn + B[i][0] * cb,
        c[1] + N[i][1] * cn + B[i][1] * cb,
        c[2] + N[i][2] * cn + B[i][2] * cb,
      );
    }
  }
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    const i2 = (i + 1) % m;
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + j2;
      const c = i2 * radial + j;
      const d = i2 * radial + j2;
      // outward winding for the N×B = T frame (the caps below already face outward and agree);
      // regression-guarded by the signed-volume test — an inside-out lip backface-culls away
      indices.push(a, b, c, b, d, c);
    }
  }
  if (!closed && (opts.caps ?? true)) {
    const start = positions.length / 3;
    positions.push(pts[0].p[0], pts[0].p[1], pts[0].p[2]);
    positions.push(pts[m - 1].p[0], pts[m - 1].p[1], pts[m - 1].p[2]);
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      indices.push(start, j2, j); // front cap (winding faces −tangent)
      indices.push(start + 1, (m - 1) * radial + j, (m - 1) * radial + j2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

