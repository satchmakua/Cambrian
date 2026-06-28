import { describe, it, expect } from 'vitest';
import { randomGenome } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { expectValidPhenotype, expectGenomeWithinBounds } from './invariants';

describe('randomGenome', () => {
  it('is deterministic: the same seed regrows the same creature (Pillar 3)', () => {
    expect(randomGenome(42)).toEqual(randomGenome(42));
    // and so does the grown phenotype
    expect(grow(randomGenome(42))).toEqual(grow(randomGenome(42)));
  });

  it('produces visibly different creatures for different seeds', () => {
    const sizes = new Set<number>();
    for (let s = 0; s < 60; s++) sizes.add(grow(randomGenome(s)).nodes.length);
    // many distinct node counts ⇒ structural variety, not just jitter
    expect(sizes.size).toBeGreaterThan(8);
  });

  it('always keeps every gene within GENE_BOUNDS (Pillar 1)', () => {
    for (let s = 0; s < 2000; s++) expectGenomeWithinBounds(randomGenome(s));
  });

  it('always grows to a valid phenotype (Pillar 2)', () => {
    for (let s = 0; s < 2000; s++) expectValidPhenotype(grow(randomGenome(s)));
  });

  it('carries the seed into the genome so it can be shown and reproduced', () => {
    expect(randomGenome(0xabcdef).seed).toBe(0xabcdef);
  });
});
