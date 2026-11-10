/**
 * A frill: half of a ruff of skin round the neck (the pair makes the whole collar). Ribs radiate from
 * the neck across a membrane whose rim scallops between them, swept back a little and darkening to
 * the edge. (A flattened sphere stuck to the shoulder read as a paper plate.)
 *
 * Built in body orientation around the neck's spine node: the ruff lies across the body's axis (+Z),
 * from just over the top of the neck down past the side, on the side its part grows from.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../engine/genome';
import { sweepTube, type SweepPoint } from './sweep';

export interface FrillPlan {
  /** rib angles (rad in the cross-section plane: 0 = out to the side, π/2 = straight up) */
  ribs: number[];
  inner: number;
  outer: number;
  rake: number; // how far the rim sweeps back (−Z) per unit of radius
  side: 1 | -1;
}

/** The ruff's shape for a neck of radius `neckR` and a frill gene `length` (pure). */
export function frillPlan(neckR: number, length: number, side: 1 | -1): FrillPlan {
  const ribs: number[] = [];
  const N = 7;
  // from a touch past the top (so the two halves meet over the neck) down to below the side
  const top = Math.PI / 2 + 0.08;
  const bottom = -0.45;
  for (let i = 0; i < N; i++) ribs.push(top + ((bottom - top) * i) / (N - 1));
  return { ribs, inner: neckR * 0.85, outer: neckR * 0.85 + length * 1.25, rake: 0.32, side };
}

/** A point of the ruff at angle `a`, radius `r`, relative to the neck node's centre. */
export function frillPoint(p: FrillPlan, a: number, r: number): Vec3 {
  return [p.side * Math.cos(a) * r, Math.sin(a) * r, -p.rake * (r - p.inner)];
}

/** The rim's radius at angle `a`: full at a rib, dipping between ribs (the scallop). */
export function frillRim(p: FrillPlan, a: number): number {
  const step = (p.ribs[0] - p.ribs[p.ribs.length - 1]) / (p.ribs.length - 1);
  const u = ((p.ribs[0] - a) / step) % 1; // 0 at a rib, 0.5 mid-gap
  return p.outer * (1 - 0.13 * Math.sin(Math.PI * u) ** 2);
}

/**
 * Geometry relative to the frill's own node (`offset` = the neck centre minus that node): the
 * membrane (vertex-coloured from `base` at the neck to `rim` at the edge) and the ribs.
 */
export function frillGeometry(p: FrillPlan, offset: Vec3, base: THREE.Color, rim: THREE.Color): THREE.BufferGeometry {
  const K = 5; // samples per gap between ribs
  const M = 5; // rings from the neck to the rim
  const a0 = p.ribs[0];
  const a1 = p.ribs[p.ribs.length - 1];
  const cols = (p.ribs.length - 1) * K + 1;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < cols; i++) {
    const a = a0 + ((a1 - a0) * i) / (cols - 1);
    const R = frillRim(p, a);
    for (let j = 0; j <= M; j++) {
      const t = j / M;
      const v = frillPoint(p, a, p.inner + (R - p.inner) * t);
      pos.push(v[0] + offset[0], v[1] + offset[1], v[2] + offset[2]);
      c.copy(base).lerp(rim, t * t);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const membrane = new THREE.BufferGeometry();
  membrane.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  membrane.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  membrane.setIndex(idx);
  const parts: THREE.BufferGeometry[] = [membrane.toNonIndexed()];
  membrane.dispose();
  // the ribs: thin spines from the neck out just past the rim, in the rim's colour
  const ribR = Math.max(0.006, (p.outer - p.inner) * 0.028);
  for (const a of p.ribs) {
    const pts: SweepPoint[] = [];
    for (let j = 0; j <= 4; j++) {
      const v = frillPoint(p, a, p.inner + (p.outer * 1.04 - p.inner) * (j / 4));
      pts.push({ p: [v[0] + offset[0], v[1] + offset[1], v[2] + offset[2]], n: [0, 0, 1] });
    }
    const rib = sweepTube(pts, { radius: (u) => ribR * (1.2 - 0.9 * u), radialSegments: 5 }).toNonIndexed();
    const n = rib.getAttribute('position').count;
    const rc = new Float32Array(n * 3);
    const dark = rim.clone().multiplyScalar(0.7);
    for (let k = 0; k < n; k++) rc.set([dark.r, dark.g, dark.b], k * 3);
    rib.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    rib.deleteAttribute('normal');
    parts.push(rib);
  }
  for (const g of parts) if (g.getAttribute('normal')) g.deleteAttribute('normal');
  const merged = mergeGeometries(parts, false) ?? parts[0];
  for (const g of parts) if (g !== merged) g.dispose();
  merged.computeVertexNormals();
  return merged;
}
