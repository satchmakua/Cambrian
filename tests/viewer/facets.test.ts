import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { facetKeep, facetSizeOf, facetSkin } from '../../src/viewer/facets';

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
      // and none turned over that wasn't already: lit against its corners' normals…
      expect(folded(g), `#${seed}`).toBeLessThanOrEqual(foldedBefore + 2);
      // …or facing into the body — a black speck in the hide (tested only against the corners'
      // new normals, a bevel between two faces passed while it faced the wrong way)
      const ix = g.getIndex()!;
      let turned = 0;
      for (let t = 0; t < ix.count; t += 3) {
        const [a, b, c] = [ix.getX(t), ix.getX(t + 1), ix.getX(t + 2)];
        const f = (P: ArrayLike<number>) => {
          const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
          const v = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
          return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        };
        const f0 = f(before), f1 = f(pos.array);
        if (f0[0] * f1[0] + f0[1] * f1[1] + f0[2] * f1[2] < 0) turned++;
      }
      expect(turned, `#${seed} turned over`).toBe(0);
    }
  });

  it('leaves the legs and the face uncut: what sits on the skin there was seated on the smooth surface', () => {
    // (a face wider than a shin cut a notch into the leg's outline; round the mouth the cut sank the
    // skin under the dark lip seam, which then stood out of the hide in black flecks)
    for (const seed of [8, 13]) {
      const p = grow(genomeOfMorphotype(seed, 'crystalline'));
      const g = buildSmoothGeometry(p, true, [], 'low');
      const before = Float32Array.from(g.getAttribute('position').array as Float32Array);
      const keep = facetKeep(p, g);
      facetSkin(g, facetSizeOf(p), p.genomeRef.seed, keep);
      const pos = g.getAttribute('position');
      let moved = 0;
      for (let i = 0; i < pos.count; i++) {
        const d = Math.hypot(pos.getX(i) - before[i * 3], pos.getY(i) - before[i * 3 + 1], pos.getZ(i) - before[i * 3 + 2]);
        if (keep[i]) expect(d, `#${seed} kept`).toBe(0);
        else if (d > 1e-6) moved++;
      }
      // the body is still cut
      expect(moved / pos.count, `#${seed}`).toBeGreaterThan(0.3);
      // the skin near the eyes and the mouth is kept, and at the feet
      const near = (q: readonly number[], r: number) => {
        for (let i = 0; i < pos.count; i++) if (Math.hypot(before[i * 3] - q[0], before[i * 3 + 1] - q[1], before[i * 3 + 2] - q[2]) < r && !keep[i]) return false;
        return true;
      };
      for (const n of p.nodes.filter((n) => n.terminal === 'eye' || n.terminal === 'mouth')) expect(near(n.pos, n.radius * 1.2), `#${seed} ${n.terminal}`).toBe(true);
      for (const n of p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg')) expect(near(n.pos, n.radius * 1.5), `#${seed} foot`).toBe(true);
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
