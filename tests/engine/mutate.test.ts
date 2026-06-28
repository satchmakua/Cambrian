import { describe, it, expect } from 'vitest';
import { mutate } from '../../src/engine/mutate';
import { breederOffspring } from '../../src/engine/selection';
import { randomGenome } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { expectValidPhenotype, expectGenomeWithinBounds } from './invariants';

describe('mutate', () => {
  it('is deterministic: (parent, streamSeed, n) reproduces the same child (Pillar 3)', () => {
    const parent = randomGenome(7);
    expect(mutate(parent, 123, 0)).toEqual(mutate(parent, 123, 0));
    expect(grow(mutate(parent, 123, 4))).toEqual(grow(mutate(parent, 123, 4)));
  });

  it('does not mutate the parent in place', () => {
    const parent = randomGenome(11);
    const snapshot = structuredClone(parent);
    mutate(parent, 99, 3);
    expect(parent).toEqual(snapshot);
  });

  it('keeps every mutant within GENE_BOUNDS and growable (Pillars 1 & 2)', () => {
    for (let s = 0; s < 200; s++) {
      const parent = randomGenome(s);
      for (let n = 0; n < 9; n++) {
        const child = mutate(parent, s * 31 + 1, n);
        expectGenomeWithinBounds(child);
        expectValidPhenotype(grow(child));
      }
    }
  });

  it('actually changes the creature: a litter shows structural variety', () => {
    const parent = randomGenome(3);
    const litter = breederOffspring(parent, 555, 9);
    const counts = new Set(litter.map((g) => grow(g).nodes.length));
    // not every child differs, but a 9-strong litter should not be uniform
    expect(counts.size).toBeGreaterThan(1);
  });

  it('cumulative selection can drift a trait: greedily picking "more nodes" grows it', () => {
    let parent = randomGenome(20);
    const start = grow(parent).nodes.length;
    for (let gen = 0; gen < 25; gen++) {
      const litter = breederOffspring(parent, gen * 7 + 1, 9);
      // pick the child with the most nodes (a stand-in for a "bigger" pressure)
      parent = litter.reduce((best, g) =>
        grow(g).nodes.length > grow(best).nodes.length ? g : best,
      );
    }
    expect(grow(parent).nodes.length).toBeGreaterThan(start);
  });
});

describe('breederOffspring', () => {
  it('returns the requested count of valid offspring', () => {
    const litter = breederOffspring(randomGenome(1), 42, 9);
    expect(litter).toHaveLength(9);
    for (const g of litter) expectValidPhenotype(grow(g));
  });
});
