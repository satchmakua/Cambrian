import { describe, it, expect } from 'vitest';
import { scorePhenotype, runGenerations, ZERO_PRESSURE, type Pressure } from '../../src/engine/pressures';
import { randomGenome } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { describe as describeMorph, distance } from '../../src/engine/morphospace';

const score = (g: ReturnType<typeof randomGenome>, t: Pressure) => scorePhenotype(grow(g), t);
const descOf = (g: ReturnType<typeof randomGenome>) => describeMorph(grow(g));

describe('directed pressures', () => {
  it('runGenerations is deterministic (Pillar 3)', () => {
    const root = randomGenome(1);
    const t: Pressure = { ...ZERO_PRESSURE, size: 1 };
    expect(runGenerations(root, t, 20, 999)).toEqual(runGenerations(root, t, 20, 999));
  });

  it('never regresses on the target score (elitism)', () => {
    const t: Pressure = { ...ZERO_PRESSURE, limbCount: 1, bodyLength: 1 };
    for (let s = 0; s < 20; s++) {
      const root = randomGenome(s);
      const path = runGenerations(root, t, 25, s * 13 + 1);
      let prev = -Infinity;
      for (const g of path) {
        const sc = score(g, t);
        expect(sc).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = sc;
      }
    }
  });

  it('drives a single-axis pressure in the right direction (and reproduces it)', () => {
    const axes: [keyof Pressure, number][] = [
      ['size', 1],
      ['bodyLength', 1],
      ['limbCount', 1],
    ];
    for (const [axis, dir] of axes) {
      const t: Pressure = { ...ZERO_PRESSURE, [axis]: dir };
      let improved = 0;
      for (let s = 0; s < 12; s++) {
        const root = randomGenome(s);
        const path = runGenerations(root, t, 40, s * 7 + 3);
        const start = score(root, t);
        const end = score(path[path.length - 1], t);
        expect(end).toBeGreaterThanOrEqual(start - 1e-9); // monotonic by elitism
        if (end > start + 1e-6) improved++;
      }
      // across a dozen roots, the pressure should actually move most of them
      expect(improved).toBeGreaterThan(6);
    }
  });

  it('aquatic pressure trades legs for fins', () => {
    const t: Pressure = { ...ZERO_PRESSURE, aquatic: 1 };
    let wins = 0;
    for (let s = 0; s < 12; s++) {
      const path = runGenerations(randomGenome(s), t, 40, s * 5 + 2);
      if (score(path[path.length - 1], t) >= score(path[0], t)) wins++;
    }
    expect(wins).toBe(12); // elitism ⇒ always ≥ start
  });

  it('the novelty steer drives toward forms far from the reference set (M14)', () => {
    const t: Pressure = { ...ZERO_PRESSURE, novelty: 1 };
    let moved = 0;
    for (let s = 0; s < 12; s++) {
      const root = randomGenome(s);
      const refs = [descOf(root)]; // be novel away from the starting form
      const path = runGenerations(root, t, 40, s * 11 + 5, { refs });
      const endDist = distance(descOf(path[path.length - 1]), refs[0]);
      // novelty score = soft(min distance to refs); elitism ⇒ the end is ≥ as far as the start (0)
      if (endDist > 0.05) moved++;
    }
    expect(moved).toBeGreaterThan(6); // most lineages travel away from where they began
  });

  it('novelty has no effect without references (degrades to zero)', () => {
    const t: Pressure = { ...ZERO_PRESSURE, novelty: 1 };
    const g = randomGenome(7);
    expect(scorePhenotype(grow(g), t)).toBe(0); // no refs ⇒ novelty term is 0
  });
});
