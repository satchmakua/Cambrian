import { describe, it, expect } from 'vitest';
import { crossover } from '../../src/engine/crossover';
import { genomeOfMorphotype, randomGenome, MORPHOTYPE_IDS } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { grow } from '../../src/engine/grow';
import { encodeGenome } from '../../src/engine/share';
import type { Genome, SegmentGene } from '../../src/engine/genome';
import { expectGenomeWithinBounds, expectValidPhenotype } from './invariants';

/** A genome's plan: what crossover must never mix — the chain, each segment's repeats, each part's
 *  kind, tip, pairing and joints, the symmetry and the covering's kind. */
function planOf(g: Genome): string {
  const segs: string[] = [];
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) {
    segs.push(`${s.repeat}[${s.appendages.map((a) => `${a.kind}/${a.terminal}/${a.pair ? 'p' : '-'}${a.radialPair ? 'r' : ''}/${a.segments}`).join(',')}]`);
  }
  return `${g.symmetry}:${g.symmetry === 'radial' ? g.radialCount : ''}:${g.covering.type}:${segs.join('>')}`;
}

describe('crossover', () => {
  const a = genomeOfMorphotype(11, 'canid');
  const b = mutate(mutate(genomeOfMorphotype(12, 'canid'), 5, 1), 6, 2);

  it('is a pure function of its parents and seed', () => {
    expect(encodeGenome(crossover(a, b, 42))).toBe(encodeGenome(crossover(a, b, 42)));
    // a different seed can make a different child
    const kids = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => encodeGenome(crossover(a, b, s))));
    expect(kids.size).toBeGreaterThan(1);
  });

  it("takes its whole plan from one parent and each matched number from either", () => {
    for (let s = 0; s < 40; s++) {
      const kid = crossover(a, b, s);
      const plan = planOf(kid);
      expect([planOf(a), planOf(b)]).toContain(plan);
      // every number in the body is one parent's own (a mendelian pick, never a blend)
      const pa = planOf(a) === plan ? a : b;
      const po = pa === a ? b : a;
      const k = kid.body.size[0];
      expect([pa.body.size[0], po.body.size[0]]).toContain(k);
      expect([pa.palette.hueA, po.palette.hueA]).toContain(kid.palette.hueA);
      expect([pa.covering.sheen, po.covering.sheen]).toContain(kid.covering.sheen);
    }
  });

  it('two parents alike give a child alike (only its growth jitter is its own)', () => {
    const kid = crossover(a, a, 9);
    expect(encodeGenome({ ...kid, seed: a.seed })).toBe(encodeGenome(a));
  });

  it('mixes the genes of two lines: over a litter, each parent gives some of them', () => {
    let fromA = 0, fromB = 0;
    for (let s = 0; s < 30; s++) {
      const kid = crossover(a, b, s);
      if (kid.palette.sat === a.palette.sat) fromA++;
      if (kid.palette.sat === b.palette.sat) fromB++;
    }
    expect(fromA).toBeGreaterThan(5);
    expect(fromB).toBeGreaterThan(5);
  });

  it('every child of any two genomes stays in bounds and grows (300 crosses, within and across plans)', () => {
    for (let i = 0; i < 300; i++) {
      const p = i % 2 === 0 ? genomeOfMorphotype(i, MORPHOTYPE_IDS[i % MORPHOTYPE_IDS.length]) : randomGenome(i * 7 + 1);
      // a relative (within its kind) half the time, a stranger the rest
      const q = i % 3 === 0 ? randomGenome(i * 13 + 5) : mutate(p, i, 1);
      const kid = crossover(p, q, i);
      expectGenomeWithinBounds(kid);
      expectValidPhenotype(grow(kid));
    }
  });
});
