import { describe, it, expect } from 'vitest';
import { randomGenome } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { expectValidPhenotype, expectGenomeWithinBounds, expectBilateralSymmetry } from './invariants';

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

  it('honors the symmetry mode and stays valid for forced modes', () => {
    for (let s = 0; s < 300; s++) {
      const radial = randomGenome(s, 'radial');
      expect(radial.symmetry).toBe('radial');
      expectGenomeWithinBounds(radial);
      expectValidPhenotype(grow(radial));

      const bilat = randomGenome(s, 'bilateral');
      expect(bilat.symmetry).toBe('bilateral');
      expectGenomeWithinBounds(bilat);
      expectValidPhenotype(grow(bilat));
    }
  });

  it('grows exactly mirror-symmetric bodies in bilateral mode (M18)', () => {
    for (let s = 0; s < 400; s++) expectBilateralSymmetry(grow(randomGenome(s, 'bilateral')));
  });

  it('every creature has a readable face — eyes and a mouth, eyes prominent (M19)', () => {
    for (let s = 0; s < 200; s++) {
      const p = grow(randomGenome(s));
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      const mouths = p.nodes.filter((n) => n.terminal === 'mouth');
      expect(eyes.length).toBeGreaterThan(0);
      expect(mouths.length).toBeGreaterThan(0);
      expect(Math.max(...eyes.map((e) => e.radius))).toBeGreaterThan(0.15); // floored — never tiny
    }
  });
});
