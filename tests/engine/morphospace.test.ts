import { describe as group, it, expect } from 'vitest';
import { describe, distance, coherence } from '../../src/engine/morphospace';
import { breederLitter, breederOffspring } from '../../src/engine/selection';
import { randomGenome, genomeOfMorphotype, MORPHOTYPE_IDS } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';

/** Max pairwise descriptor distance within a set of genomes — how spread the litter is. */
function spread(genomes: ReturnType<typeof randomGenome>[]): number {
  const ds = genomes.map((g) => describe(grow(g)));
  let max = 0;
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) max = Math.max(max, distance(ds[i], ds[j]));
  return max;
}

group('morphospace', () => {
  it('describe() is deterministic and finite', () => {
    const p = grow(randomGenome(7));
    expect(describe(p)).toEqual(describe(p));
    expect(describe(p).every(Number.isFinite)).toBe(true);
  });

  it('creatures sit near an attractor — the clusters are real', () => {
    const scores = MORPHOTYPE_IDS.map((id) => {
      let total = 0;
      for (let s = 0; s < 6; s++) total += coherence(grow(genomeOfMorphotype(s * 17 + 3, id))).score;
      return total / 6;
    });
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(Math.min(...scores)).toBeGreaterThan(0.2); // none are lost in the void
    expect(mean).toBeGreaterThan(0.45); // on average, clearly near their cluster
  });

  it('distinctive features label sensibly', () => {
    // serpent (legless + long) is unambiguous → self-labels
    let serpent = 0;
    for (let s = 0; s < 10; s++) if (coherence(grow(genomeOfMorphotype(s * 31 + 5, 'serpent'))).nearest === 'serpent') serpent++;
    expect(serpent).toBeGreaterThan(5);
    // a dragon reads as a winged beast (dragon or its sibling wyvern)
    let winged = 0;
    for (let s = 0; s < 10; s++) {
      const n = coherence(grow(genomeOfMorphotype(s * 13 + 2, 'dragon'))).nearest;
      if (n === 'dragon' || n === 'wyvern') winged++;
    }
    expect(winged).toBeGreaterThan(5);
  });
});

group('niched litter', () => {
  it('is deterministic and grows valid creatures', () => {
    const parent = randomGenome(2);
    expect(breederLitter(parent, 99, 9)).toEqual(breederLitter(parent, 99, 9));
    for (const g of breederLitter(parent, 99, 9)) expect(grow(g).nodes.length).toBeGreaterThan(0);
  });

  it('spreads offspring across morphospace more than a plain litter', () => {
    let niched = 0;
    let plain = 0;
    for (let s = 0; s < 12; s++) {
      const parent = randomGenome(s);
      niched += spread(breederLitter(parent, s * 7 + 1, 9));
      plain += spread(breederOffspring(parent, s * 7 + 1, 9));
    }
    expect(niched).toBeGreaterThan(plain); // niching genuinely diverges the litter
  });
});
