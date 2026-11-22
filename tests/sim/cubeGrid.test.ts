import { describe, it, expect } from 'vitest';
import { apronOf, cellCentre, cellIndex, makeGrid, pointOf, sampleAt } from '../../src/sim/cubeGrid';
import { cubeToSphere, normalize, type Vec3 } from '../../src/sim/sphere';
import { mulberry32 } from '../../src/engine/rng';

/** the cube-sphere grid a planet's terrain is baked on (src/sim/cubeGrid.ts) */
describe('the cube-sphere grid', () => {
  const N = 24;
  const g = makeGrid(N, 7);

  it('finds each cell from its own middle, and its point inside it', () => {
    for (let k = 0; k < g.count; k++) {
      expect(cellIndex(N, cellCentre(N, k))).toBe(k);
      expect(cellIndex(N, pointOf(g, k))).toBe(k);
    }
  });

  it('gives every cell eight neighbours, but seven at the cube corners, and neighbours each other both ways', () => {
    let corners = 0;
    for (let k = 0; k < g.count; k++) {
      const ns = [...g.nbr.subarray(k * 8, k * 8 + 8)].filter((n) => n >= 0);
      expect(new Set(ns).size).toBe(ns.length);
      expect(ns).not.toContain(k);
      if (ns.length === 7) corners++;
      else expect(ns.length).toBe(8);
      for (const n of ns) expect([...g.nbr.subarray(n * 8, n * 8 + 8)]).toContain(k);
    }
    // (four corner cells on each face meet the cube's eight corners, three faces to each)
    expect(corners).toBe(24);
  });

  it('keeps its neighbours near: no step over a seam is much longer than one within a face', () => {
    let most = 0;
    for (let k = 0; k < g.count * 8; k++) if (g.nbr[k] >= 0) most = Math.max(most, g.gap[k]);
    // (a cell is about π/2N across; a diagonal near a cube corner, where cells lean into rhombi, with both
    // points jittered toward its ends, under three of those)
    expect(most).toBeLessThan((Math.PI / 2 / N) * 3);
  });

  it('covers the sphere: its cells sum to 4π, each within twice another', () => {
    let sum = 0, lo = Infinity, hi = 0;
    for (let k = 0; k < g.count; k++) {
      sum += g.area[k];
      lo = Math.min(lo, g.area[k]);
      hi = Math.max(hi, g.area[k]);
    }
    expect(sum).toBeCloseTo(4 * Math.PI, 9);
    expect(hi / lo).toBeLessThan(Math.SQRT2 * 1.05);
  });

  it('reads a field smoothly across the seams', () => {
    // a smooth field (a tilted plane through the ball), read at places a hair either side of each seam
    const field = new Float32Array(g.count);
    const along = (p: Vec3) => 0.3 * p[0] - 0.7 * p[1] + 0.5 * p[2];
    for (let k = 0; k < g.count; k++) field[k] = along(cellCentre(N, k));
    const a = apronOf(N, field);
    const rng = mulberry32(3);
    let worst = 0;
    for (let n = 0; n < 2000; n++) {
      const f = Math.floor(rng() * 6), t = rng() * 2 - 1;
      const inside = cubeToSphere(f, 0.9999, t), beyond = cubeToSphere(f, 1.0001, t);
      worst = Math.max(worst, Math.abs(sampleAt(a, inside) - sampleAt(a, beyond)));
      // …and close to the field itself anywhere
      const p = normalize([rng() - 0.5, rng() - 0.5, rng() - 0.5]);
      expect(Math.abs(sampleAt(a, p) - along(p))).toBeLessThan(0.02);
    }
    expect(worst).toBeLessThan(2e-3);
  });
});
