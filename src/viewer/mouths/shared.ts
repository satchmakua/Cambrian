/**
 * Geometry helpers shared by the mouth variant modules — hoisted so the interior sheet and the
 * node-relative row mapper exist exactly once (jawed/baleen/mandibles each carried a verbatim
 * copy, which is how silent divergence starts).
 */
import * as THREE from 'three';
import type { Vec3 } from '../../engine/genome';
import type { MouthSample } from '../mouthLine';

/** Map a mouth-line row into the node-relative authoring frame (subtract the mouth node origin). */
export function relRow(row: readonly MouthSample[], o: Vec3): MouthSample[] {
  return row.map((s) => ({ ...s, p: [s.p[0] - o[0], s.p[1] - o[1], s.p[2] - o[2]] as Vec3 }));
}

/**
 * The muzzle WALL: a skirt lofted from the projected lip rim back to where that curve was traced
 * on the skull, swelling outward on the way to give the jaw volume.
 *
 * Projecting the lip curve forward creates a snout, but on its own it leaves the snout standing
 * off the head with an open hollow behind it — the floating-mouth failure this whole system exists
 * to prevent. Sweeping fat tubes near the rim only *hopes* to span that gap (it did for shallow
 * projections and failed for deep ones). Lofting to the traced curve closes it by construction:
 * the last row IS the skull surface, whatever the projection distance.
 */
export function muzzleSkirt(
  rim: readonly MouthSample[], // projected lip curve — the snout's edge
  base: readonly MouthSample[], // the same samples before projection — on the skull
  bulge: number, // outward swell along `away` at mid-span, world units
  rows = 4,
): THREE.BufferGeometry {
  const m = rim.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ri = 0; ri <= rows; ri++) {
    const v = ri / rows; // 0 = rim … 1 = welded to the skull
    const swell = bulge * Math.sin(Math.PI * v); // 0 at both ends, fattest mid-jaw
    for (let i = 0; i < m; i++) {
      const a = rim[i];
      const b = base[i];
      positions.push(
        a.p[0] + (b.p[0] - a.p[0]) * v + a.away[0] * swell,
        a.p[1] + (b.p[1] - a.p[1]) * v + a.away[1] * swell,
        a.p[2] + (b.p[2] - a.p[2]) * v + a.away[2] * swell,
      );
    }
  }
  for (let ri = 0; ri < rows; ri++) {
    for (let i = 0; i < m - 1; i++) {
      const a = ri * m + i, b = a + 1, c = (ri + 1) * m + i, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A concave mouth BAG spanning the opening — the throat you can actually see into.
 *
 * The flat 3-row sheet this replaces met the lips and stopped, so a mouth read as a painted-on
 * dark patch. Here the surface bows *backwards* into the head: deepest at the mouth's centre and
 * relaxing to zero at the lip rim and at the corners, so the rim stays welded to the lips while
 * the middle recedes. `depth` is in world units along `back` (normally −aim, i.e. down the throat).
 * Rows run upper lip → throat → lower lip; drawn DoubleSide so the interior reads from any angle.
 */
export function interiorBowl(
  upper: readonly MouthSample[],
  lower: readonly MouthSample[],
  back: Vec3,
  depth: number,
  rows = 5,
): THREE.BufferGeometry {
  const m = upper.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let ri = 0; ri <= rows; ri++) {
    const v = ri / rows; // 0 = upper lip … 1 = lower lip
    for (let i = 0; i < m; i++) {
      const u = upper[i];
      const l = lower[i];
      // across the opening, then sunk: sin(πv) is 0 at both lips and 1 midway between them,
      // and the |t| falloff keeps the corners tight where the lips meet
      const t = u.t;
      const sink = depth * Math.sin(Math.PI * v) * Math.pow(Math.cos((t * Math.PI) / 2), 0.7);
      positions.push(
        u.p[0] + (l.p[0] - u.p[0]) * v + back[0] * sink,
        u.p[1] + (l.p[1] - u.p[1]) * v + back[1] * sink,
        u.p[2] + (l.p[2] - u.p[2]) * v + back[2] * sink,
      );
    }
  }
  for (let ri = 0; ri < rows; ri++) {
    for (let i = 0; i < m - 1; i++) {
      const a = ri * m + i, b = a + 1, c = (ri + 1) * m + i, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A 3-row sheet spanning the mouth opening: upper gum line → a deepened center → lower gum line.
 * `inset` pulls the rim rows along −normal (negative = into the face); `deepen` sinks the center
 * row further for a throat. Normals via computeVertexNormals; drawn DoubleSide.
 */
export function interiorSheet(upper: readonly MouthSample[], lower: readonly MouthSample[], inset: number, deepen: number): THREE.BufferGeometry {
  const m = upper.length;
  const positions: number[] = [];
  const indices: number[] = [];
  const push = (s: MouthSample, off: number) => {
    positions.push(s.p[0] - s.n[0] * off, s.p[1] - s.n[1] * off, s.p[2] - s.n[2] * off);
  };
  for (let i = 0; i < m; i++) push(upper[i], -inset);
  for (let i = 0; i < m; i++) {
    // center row: midway between the lips, sunk by `deepen`
    const u = upper[i], l = lower[i];
    const nx = (u.n[0] + l.n[0]) / 2, ny = (u.n[1] + l.n[1]) / 2, nz = (u.n[2] + l.n[2]) / 2;
    positions.push(
      (u.p[0] + l.p[0]) / 2 + nx * (inset + deepen),
      (u.p[1] + l.p[1]) / 2 + ny * (inset + deepen),
      (u.p[2] + l.p[2]) / 2 + nz * (inset + deepen),
    );
  }
  for (let i = 0; i < m; i++) push(lower[i], -inset);
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < m - 1; i++) {
      const a = row * m + i, b = a + 1, c = (row + 1) * m + i, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
