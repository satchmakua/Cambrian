import { describe, it, expect } from 'vitest';
import { grow, formable, expressForm, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype, randomGenome, MORPHOTYPE_IDS } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { encodeGenome, decodeGenome } from '../../src/engine/share';
import { mulberry32 } from '../../src/engine/rng';
import type { Genome, SegmentGene } from '../../src/engine/genome';
import { expectValidPhenotype } from './invariants';

/** Set the form of every formable part of a given kind (on a copy). */
function withForm(g: Genome, kind: 'fin' | 'leg', form: number): Genome {
  const out = structuredClone(g) as Genome;
  for (let s: SegmentGene | undefined = out.body; s; s = s.child) for (const a of s.appendages) if (a.kind === kind && formable(a)) a.form = form;
  return out;
}
const tips = (p: Phenotype, t: string) => p.nodes.filter((n) => n.kind === 'terminal' && n.terminal === t);
const legTips = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');

describe('form: fin ↔ leg, by degrees', () => {
  const fish = genomeOfMorphotype(4, 'fish');
  const pairedFins = () => {
    let n = 0;
    for (let s: SegmentGene | undefined = fish.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'fin' && formable(a)) n++;
    return n;
  };

  it('the fish used here has paired fins low on its body (and its dorsal fin is not one)', () => {
    expect(pairedFins()).toBeGreaterThanOrEqual(1);
    for (let s: SegmentGene | undefined = fish.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'fin' && !a.pair) expect(formable(a)).toBe(false);
  });

  it('a fish whose fins are still fins grows exactly as it did', () => {
    const body = (p: Phenotype) => JSON.stringify(p.nodes.map((n) => [n.pos, n.radius, n.kind, n.terminal ?? null, n.part?.kind ?? null]));
    expect(body(grow(withForm(fish, 'fin', 0.1)))).toBe(body(grow(fish)));
    expect(expressForm(fish)).toBe(fish); // (nothing to express: the very same genome)
  });

  it('rising, its paired fins grow into lobes (more joints, swung down), then legs with feet', () => {
    const base = grow(fish);
    const lobe = grow(withForm(fish, 'fin', 0.5));
    const legs = grow(withForm(fish, 'fin', 0.9));
    expectValidPhenotype(lobe);
    expectValidPhenotype(legs);
    // a lobe is still a fin at its tip, on a longer jointed stalk
    expect(tips(lobe, 'fin').length).toBe(tips(base, 'fin').length);
    expect(lobe.nodes.length).toBeGreaterThan(base.nodes.length);
    // past 0.65 the paired fins are legs, with feet
    expect(legTips(base).length).toBe(0);
    expect(legTips(legs).length).toBeGreaterThanOrEqual(2);
    expect(tips(legs, 'foot').length).toBeGreaterThanOrEqual(2);
    // the legs stand under the body: their feet lower than the trunk's middle
    const trunkY = legs.nodes.filter((n) => n.kind === 'spine').reduce((s, n) => s + n.pos[1], 0) / legs.nodes.filter((n) => n.kind === 'spine').length;
    for (const f of tips(legs, 'foot')) expect(f.pos[1]).toBeLessThan(trunkY);
  });

  it('falling, a walker’s legs turn to paddles, then flippers', () => {
    const otter = genomeOfMorphotype(6, 'mustelid');
    const base = grow(otter);
    const paddle = grow(withForm(otter, 'leg', 0.55));
    const flipper = grow(withForm(otter, 'leg', 0.2));
    expectValidPhenotype(paddle);
    expectValidPhenotype(flipper);
    expect(legTips(paddle).length).toBe(legTips(base).length); // still legs
    expect(legTips(flipper).length).toBe(0); // now fins
    expect(tips(flipper, 'fin').length).toBeGreaterThanOrEqual(legTips(base).length);
    // a flipper is shorter than the leg it was
    const reach = (p: Phenotype) => Math.max(...p.nodes.map((n) => Math.abs(n.pos[1])));
    expect(reach(flipper)).toBeLessThanOrEqual(reach(base) + 1e-9);
  });

  it('mutation moves it slowly, within bounds, and only where it moved', () => {
    let g = fish;
    const seen: number[] = [];
    for (let i = 0; i < 200; i++) {
      g = mutate(g, 1000 + i, i, { point: 0.22, pointSigma: 0.05, structural: 0, duplication: 0, macro: 0 });
      for (let s: SegmentGene | undefined = g.body; s; s = s.child) for (const a of s.appendages) if (a.form !== undefined) seen.push(a.form);
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const f of seen) {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    // a single mutation never takes a fin far: the steps are small
    const one = mutate(fish, 7, 1, { point: 1, pointSigma: 0.05, structural: 0, duplication: 0, macro: 0 });
    for (let s: SegmentGene | undefined = one.body; s; s = s.child) for (const a of s.appendages) if (a.form !== undefined && a.kind === 'fin') expect(a.form).toBeLessThan(0.25);
  });

  it('a share string carries it', () => {
    const g = withForm(fish, 'fin', 0.42);
    const back = decodeGenome(encodeGenome(g));
    expect(encodeGenome(back)).toBe(encodeGenome(g));
  });

  it('any body with any forms on its fins and legs grows valid (300 random)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 300; i++) {
      const g = i % 2 ? randomGenome(i * 31 + 7) : genomeOfMorphotype(i, MORPHOTYPE_IDS[i % MORPHOTYPE_IDS.length]);
      const x = structuredClone(g) as Genome;
      for (let s: SegmentGene | undefined = x.body; s; s = s.child) for (const a of s.appendages) if (formable(a)) a.form = rng();
      expectValidPhenotype(grow(x));
    }
  });
});
