import { describe, it, expect } from 'vitest';
import { randomGenome } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { encodeGenome, decodeGenome } from '../../src/engine/share';
import { GENE_BOUNDS } from '../../src/engine/bounds';
import type { CoveringType, PatternType } from '../../src/engine/genome';

const COVERINGS: readonly CoveringType[] = ['skin', 'scales', 'fur', 'feathers', 'chitin', 'slime', 'plates', 'crystal'];
const PATTERNS: readonly PatternType[] = [
  'plain', 'stripes', 'bands', 'spots', 'ocelli', 'reticulate', 'mottle', 'gradient',
];

function inBounds(v: number, [min, max]: readonly [number, number]): void {
  expect(v).toBeGreaterThanOrEqual(min);
  expect(v).toBeLessThanOrEqual(max);
}

describe('covering (M12)', () => {
  it('every random creature has a valid, in-bounds covering (Pillar 1)', () => {
    const C = GENE_BOUNDS.covering;
    for (let s = 0; s < 2000; s++) {
      const c = randomGenome(s).covering;
      expect(COVERINGS).toContain(c.type);
      expect(PATTERNS).toContain(c.pattern);
      inBounds(c.patternScale, C.patternScale);
      inBounds(c.patternContrast, C.patternContrast);
      inBounds(c.sheen, C.sheen);
    }
  });

  it('the covering survives a CAM2 round-trip', () => {
    for (let s = 0; s < 200; s++) {
      const g = randomGenome(s);
      expect(decodeGenome(encodeGenome(g)).covering).toEqual(g.covering);
    }
  });

  it('mutation keeps the covering valid and in bounds', () => {
    const C = GENE_BOUNDS.covering;
    for (let s = 0; s < 400; s++) {
      const child = mutate(randomGenome(s), s * 7, s % 9);
      const c = child.covering;
      expect(COVERINGS).toContain(c.type);
      expect(PATTERNS).toContain(c.pattern);
      inBounds(c.patternScale, C.patternScale);
      inBounds(c.patternContrast, C.patternContrast);
      inBounds(c.sheen, C.sheen);
    }
  });

  it('every covering is a gene like any other: it is shared, and bred into and out of', () => {
    // (crystal — the eighth — is a hide any lineage can come to wear, not a property of one plan)
    const reached = new Set<string>();
    const left = new Set<string>();
    for (const type of COVERINGS) {
      const g = { ...randomGenome(3), covering: { ...randomGenome(3).covering, type } };
      expect(decodeGenome(encodeGenome(g)).covering.type).toBe(type);
      for (let s = 0; s < 600 && !left.has(type); s++) {
        const child = mutate(g, s * 31 + 7, 8).covering.type;
        if (child !== type) {
          left.add(type);
          reached.add(child);
        }
      }
    }
    expect([...left].sort()).toEqual([...COVERINGS].sort());
    for (let s = 0; s < 4000 && reached.size < COVERINGS.length; s++) {
      reached.add(mutate(randomGenome(s % 50), s * 17 + 1, 8).covering.type);
    }
    expect([...reached].sort()).toEqual([...COVERINGS].sort());
    // …and a share code naming a covering that does not exist is refused, not drawn as bare skin
    const real = randomGenome(3);
    expect(decodeGenome('CAM2:' + btoa(JSON.stringify(real)))).toEqual(real);
    const forged = { ...real, covering: { ...real.covering, type: 'glass' } };
    expect(() => decodeGenome('CAM2:' + btoa(JSON.stringify(forged)))).toThrow();
  });

  it('the generator spreads coverings and patterns across a sample (variety)', () => {
    const types = new Set<string>();
    const patterns = new Set<string>();
    for (let s = 0; s < 400; s++) {
      const c = randomGenome(s).covering;
      types.add(c.type);
      patterns.add(c.pattern);
    }
    // the morphotype priors should reach most of the catalogue, not collapse to one skin
    expect(types.size).toBeGreaterThanOrEqual(5);
    expect(patterns.size).toBeGreaterThanOrEqual(5);
  });
});
