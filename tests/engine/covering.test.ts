import { describe, it, expect } from 'vitest';
import { randomGenome } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { encodeGenome, decodeGenome } from '../../src/engine/share';
import { GENE_BOUNDS } from '../../src/engine/bounds';
import type { CoveringType, PatternType } from '../../src/engine/genome';

const COVERINGS: readonly CoveringType[] = ['skin', 'scales', 'fur', 'feathers', 'chitin', 'slime', 'plates'];
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
