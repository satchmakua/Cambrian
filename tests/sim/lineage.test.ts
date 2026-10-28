import { describe, it, expect } from 'vitest';
import { howItDiffers } from '../../src/sim/lineage';
import { genomeOfMorphotype } from '../../src/engine/random';

describe('how a lineage has changed', () => {
  it('says nothing for the same animal', () => {
    const g = genomeOfMorphotype(3, 'felid');
    expect(howItDiffers(g, g)).toEqual([]);
    expect(howItDiffers(g, structuredClone(g))).toEqual([]);
  });

  it('names a change of coat, diet, size and limbs', () => {
    const a = genomeOfMorphotype(3, 'felid');
    const b = structuredClone(a);
    b.covering.type = 'scales';
    const words = howItDiffers(a, b);
    expect(words).toContain('scales instead of fur');
    const big = structuredClone(a);
    big.body.size = big.body.size.map((v) => v * 1.4) as typeof big.body.size;
    expect(howItDiffers(a, big).some((w) => w.includes('bigger'))).toBe(true);
    // a cat against a bird: wings, legs, coat — and capped at four phrases
    const bird = genomeOfMorphotype(3, 'bird');
    const many = howItDiffers(a, bird);
    expect(many.length).toBeLessThanOrEqual(4);
    expect(many).toContain('has grown wings');
  });
});
