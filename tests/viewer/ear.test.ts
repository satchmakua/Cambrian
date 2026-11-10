import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { earGeometry } from '../../src/viewer/ear';

/** the mean outward normal of a surface (area-weighted) */
function meanNormal(g: THREE.BufferGeometry): THREE.Vector3 {
  const pos = g.getAttribute('position');
  const idx = g.getIndex()!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(pos, idx.getX(t));
    b.fromBufferAttribute(pos, idx.getX(t + 1));
    c.fromBufferAttribute(pos, idx.getX(t + 2));
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    sum.add(n);
  }
  return sum.normalize();
}

describe('ears', () => {
  it("an ear opens forward and out to its own side — not dead ahead, seen edge-on from the side", () => {
    // an ear rising up-and-out from the right (+X) of the skull
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.35, 1, 0).normalize());
    for (const v of ['pointed', 'round', 'leaf'] as const) {
      const right = meanNormal(earGeometry(v, 0.1, [q.x, q.y, q.z, q.w]).inner);
      expect(right.z, `${v} forward`).toBeGreaterThan(0.4);
      expect(right.x, `${v} out`).toBeGreaterThan(0.25);
      // …and its mirror on the left opens out to the left
      const ql = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-0.35, 1, 0).normalize());
      const left = meanNormal(earGeometry(v, 0.1, [ql.x, ql.y, ql.z, ql.w]).inner);
      expect(left.x, `${v} mirrored`).toBeCloseTo(-right.x, 6);
    }
  });
});
