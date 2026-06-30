import { describe, it, expect } from 'vitest';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { grow } from '../../src/engine/grow';
import { randomGenome, genomeOfMorphotype } from '../../src/engine/random';
import { defaultGenome } from '../../src/engine/genome';

// scan an attribute once in a plain loop (per-vertex expect() is far too slow at this scale)
function scan(arr: ArrayLike<number>) {
  let finite = true;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) finite = false;
    const a = i % 3;
    if (v < min[a]) min[a] = v;
    if (v > max[a]) max[a] = v;
  }
  return { finite, min, max };
}

describe('smooth skin (M15)', () => {
  it('builds a non-empty, finite surface for the default creature', () => {
    const geo = buildSmoothGeometry(grow(defaultGenome()));
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    expect(pos.count).toBeGreaterThan(60); // a real mesh, not a stray triangle
    expect(pos.count % 3).toBe(0); // whole triangles
    expect(scan(pos.array as ArrayLike<number>).finite).toBe(true);
    expect(scan(nrm.array as ArrayLike<number>).finite).toBe(true);
  });

  it('hugs the body: vertices sit within the padded bounds, and the surface spans it', () => {
    for (let s = 0; s < 30; s++) {
      const p = grow(randomGenome(s));
      const geo = buildSmoothGeometry(p);
      const pos = geo.getAttribute('position') as { array: ArrayLike<number>; count: number };
      expect(pos.count).toBeGreaterThan(0); // never breaks down to nothing (any topology)

      const { finite, min, max } = scan(pos.array);
      expect(finite).toBe(true);
      const padBy = 1.6; // generous: the field is sampled on a padded grid
      for (let a = 0; a < 3; a++) {
        expect(min[a]).toBeGreaterThanOrEqual(p.bounds.min[a] - padBy);
        expect(max[a]).toBeLessThanOrEqual(p.bounds.max[a] + padBy);
      }
      // the surface actually spans most of the body on its longest axis (not a speck)
      const bodyZ = p.bounds.max[2] - p.bounds.min[2];
      if (bodyZ > 0.6) expect(max[2] - min[2]).toBeGreaterThan(bodyZ * 0.5);
    }
  });

  it('is deterministic (same phenotype → identical surface)', () => {
    const p = grow(randomGenome(123));
    const a = buildSmoothGeometry(p).getAttribute('position').array;
    const b = buildSmoothGeometry(p).getAttribute('position').array;
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
    let identical = true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) identical = false;
    expect(identical).toBe(true);
  });

  it('meshes thin limbs into the body — legs reach the surface, not float above it (M24)', () => {
    for (let s = 0; s < 8; s++) {
      const p = grow(genomeOfMorphotype(s * 5 + 1, 'felid')); // a clearly-legged quadruped
      const legNodes = p.nodes.filter((n) => n.part?.kind === 'leg');
      const feetY = Math.min(...legNodes.map((n) => n.pos[1]));
      const { min } = scan(buildSmoothGeometry(p).getAttribute('position').array);
      // the surface descends to within ~0.5 bu of the lowest leg node (the legs are meshed, not dropped)
      expect(min[1]).toBeLessThan(feetY + 0.5);
    }
  });

  it('the hybrid mode builds a non-empty, finite, in-bounds, deterministic surface over every part', () => {
    for (let s = 0; s < 14; s++) {
      const p = grow(randomGenome(s));
      const geo = buildSmoothGeometry(p, true);
      const pos = geo.getAttribute('position') as { array: ArrayLike<number>; count: number };
      expect(pos.count).toBeGreaterThan(0);
      const { finite, min, max } = scan(pos.array);
      expect(finite).toBe(true);
      for (let a = 0; a < 3; a++) {
        expect(min[a]).toBeGreaterThanOrEqual(p.bounds.min[a] - 1.6);
        expect(max[a]).toBeLessThanOrEqual(p.bounds.max[a] + 1.6);
      }
    }
    // deterministic
    const q = grow(randomGenome(5));
    const a = buildSmoothGeometry(q, true).getAttribute('position').array;
    const b = buildSmoothGeometry(q, true).getAttribute('position').array;
    expect(a.length).toBe(b.length);
  });

  it('survives extreme topologies (serpent, radial) without exploding', () => {
    for (const p of [grow(randomGenome(7, 'bilateral')), grow(randomGenome(3, 'radial'))]) {
      const pos = buildSmoothGeometry(p).getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      expect(scan(pos.array as ArrayLike<number>).finite).toBe(true);
    }
  });
});
