import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { facetSizeOf, facetSkin } from '../../src/viewer/facets';

/** triangles whose face turns against the mean of their corners' normals */
function folded(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const ix = g.getIndex()!;
  let k = 0;
  for (let t = 0; t < ix.count; t += 3) {
    const [a, b, c] = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)];
    const u = [pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a)];
    const v = [pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a)];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = [0, 1, 2].map((q) => nrm.getComponent(a, q) + nrm.getComponent(b, q) + nrm.getComponent(c, q));
    if (f[0] * m[0] + f[1] * m[1] + f[2] * m[2] < 0) k++;
  }
  return k;
}

describe('a crystal hide cut into faces', () => {
  it('lays the skin onto flat faces, outline and all: one connected mesh, every vertex moved a little, none turned over', () => {
    // (faceted only in its shading, the crystalline beast's outline was every other creature's soft
    // round body — a pig in a glass texture; laid flat across a crease, the skin folded over itself)
    for (const seed of [1, 3, 5, 8]) {
      const p = grow(genomeOfMorphotype(seed, 'crystalline'));
      const g = buildSmoothGeometry(p, true, [], 'low');
      const before = Float32Array.from(g.getAttribute('position').array as Float32Array);
      const index = Array.from(g.getIndex()!.array);
      const foldedBefore = folded(g);
      const size = facetSizeOf(p);
      facetSkin(g, size, p.genomeRef.seed);
      const pos = g.getAttribute('position');
      // nothing split, nothing re-joined
      expect(pos.count, `#${seed}`).toBe(before.length / 3);
      expect(Array.from(g.getIndex()!.array), `#${seed}`).toEqual(index);
      // within a third of a face of where it was
      for (let i = 0; i < pos.count; i++) {
        const d = Math.hypot(pos.getX(i) - before[i * 3], pos.getY(i) - before[i * 3 + 1], pos.getZ(i) - before[i * 3 + 2]);
        expect(d, `#${seed}`).toBeLessThanOrEqual(0.3 * size + 1e-6);
      }
      // gathered onto faces: a few hundred planes for thousands of vertices
      const nrm = g.getAttribute('normal');
      const planes = new Set<string>();
      for (let i = 0; i < nrm.count; i++) planes.add(`${nrm.getX(i).toFixed(5)},${nrm.getY(i).toFixed(5)},${nrm.getZ(i).toFixed(5)}`);
      expect(planes.size / pos.count, `#${seed}`).toBeLessThan(0.2);
      // and none turned over that wasn't already
      expect(folded(g), `#${seed}`).toBeLessThanOrEqual(foldedBefore + 2);
    }
  });

  it('is the same cut every time', () => {
    const p = grow(genomeOfMorphotype(3, 'crystalline'));
    const a = buildSmoothGeometry(p, true, [], 'far');
    const b = buildSmoothGeometry(p, true, [], 'far');
    facetSkin(a, facetSizeOf(p), p.genomeRef.seed);
    facetSkin(b, facetSizeOf(p), p.genomeRef.seed);
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
    expect(Array.from(a.getAttribute('normal').array)).toEqual(Array.from(b.getAttribute('normal').array));
  });
});
