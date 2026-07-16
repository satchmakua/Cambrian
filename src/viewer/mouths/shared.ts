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
