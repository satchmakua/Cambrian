import { describe, it, expect } from 'vitest';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';
import { grow, type Phenotype } from '../../src/engine/grow';
import { mouthVariant, eyeVariant, earVariant } from '../../src/viewer/partStyles';
import type { PartKind, Terminal, SegmentGene } from '../../src/engine/genome';
import { expectValidPhenotype, expectGenomeWithinBounds, expectBilateralSymmetry } from './invariants';

function kindsOf(p: Phenotype): Set<string> {
  return new Set(p.nodes.map((n) => n.part?.kind).filter(Boolean) as string[]);
}
function termsOf(p: Phenotype): Set<string> {
  return new Set(p.nodes.map((n) => n.terminal).filter((t) => t && t !== 'none') as string[]);
}
/** Does any of N seeds of morphotype `id` grow a node with this part kind? */
function morphoHasKind(id: string, kind: PartKind, n = 24): boolean {
  for (let s = 0; s < n; s++) if (kindsOf(grow(genomeOfMorphotype(s * 7 + 1, id))).has(kind)) return true;
  return false;
}
function morphoHasTerm(id: string, term: Terminal, n = 24): boolean {
  for (let s = 0; s < n; s++) if (termsOf(grow(genomeOfMorphotype(s * 7 + 1, id))).has(term)) return true;
  return false;
}
/** Across N seeds, does morphotype `id`'s mouth ever land on `variant`? */
function morphoReachesMouth(id: string, variant: string, n = 40): boolean {
  for (let s = 0; s < n; s++) {
    const m = grow(genomeOfMorphotype(s * 13 + 3, id)).nodes.find((x) => x.terminal === 'mouth');
    if (m && mouthVariant(m.part?.style ?? 0) === variant) return true;
  }
  return false;
}
/** The dominant mouth variant across many seeds of a morphotype. */
function dominantMouth(id: string): string {
  const tally = new Map<string, number>();
  for (let s = 0; s < 30; s++) {
    const m = grow(genomeOfMorphotype(s * 13 + 3, id)).nodes.find((x) => x.terminal === 'mouth');
    if (m) {
      const v = mouthVariant(m.part?.style ?? 0);
      tally.set(v, (tally.get(v) ?? 0) + 1);
    }
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

describe('part vocabulary (M23 — §6)', () => {
  it('style bands cover every variant across 0..1', () => {
    expect(new Set([0.03, 0.09, 0.18, 0.31, 0.44, 0.56, 0.69, 0.8, 0.89, 0.97].map(mouthVariant)).size).toBe(10);
    expect(new Set([0, 0.3, 0.5, 0.7, 0.95].map(eyeVariant)).size).toBe(5);
    expect(new Set([0.1, 0.5, 0.9].map(earVariant)).size).toBe(3);
  });

  it('all 5 eye styles appear across a sample of creatures', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 600; s++)
      for (const n of grow(randomGenome(s)).nodes) if (n.terminal === 'eye') seen.add(eyeVariant(n.part?.style ?? 0));
    expect(seen.size).toBe(5); // round · beady · slit · compound · glowing
  });

  it('each creature has a single eye style (one eye type per animal, the norm)', () => {
    for (let s = 0; s < 200; s++) {
      const styles = new Set(
        grow(randomGenome(s)).nodes.filter((n) => n.terminal === 'eye').map((n) => eyeVariant(n.part?.style ?? 0)),
      );
      expect(styles.size).toBeLessThanOrEqual(1);
    }
  });

  it('grows each deferred part for the morphotype that should have it', () => {
    expect(morphoHasKind('felid', 'ear')).toBe(true);
    expect(morphoHasKind('felid', 'whisker')).toBe(true);
    expect(morphoHasKind('fish', 'gill')).toBe(true);
    expect(morphoHasKind('chelonian', 'plate')).toBe(true); // carapace = a plate part
    expect(morphoHasTerm('chelonian', 'carapace')).toBe(true);
    expect(morphoHasKind('bird', 'crest')).toBe(true);
    expect(morphoHasTerm('wyvern', 'barb')).toBe(true); // a barbed tail tip
    // a stalked eye = an eyestalk chain longer than 1 node ending in an eye (more stalk nodes than eyes)
    let stalked = false;
    for (let s = 0; s < 24 && !stalked; s++) {
      const p = grow(genomeOfMorphotype(s * 7 + 1, 'crab'));
      const stalkNodes = p.nodes.filter((n) => n.part?.kind === 'eyestalk').length;
      const eyeTips = p.nodes.filter((n) => n.terminal === 'eye').length;
      if (stalkNodes > eyeTips) stalked = true;
    }
    expect(stalked).toBe(true);
  });

  it('the mouths read on their morphotypes — herbivore vs predator, beaks, mandibles, …', () => {
    expect(dominantMouth('ungulate')).toBe('herbivore'); // grazer
    expect(dominantMouth('felid')).toBe('fanged'); // predator
    expect(dominantMouth('bird')).toBe('beak');
    expect(dominantMouth('crab')).toBe('mandibles');
    expect(dominantMouth('cephalopod')).toBe('beak');
    expect(dominantMouth('shark')).toBe('fanged');
    expect(morphoReachesMouth('horror', 'lamprey')).toBe(true);
    // the new styles (proboscis / trunk) stay reachable via the clashing chimera + the wild tail
    expect(morphoReachesMouth('chimera', 'trunk', 80)).toBe(true);
  });

  it('mutation can reach the new kinds and terminals (evolvability — Pillar 1)', () => {
    const seenK = new Set<string>();
    const seenT = new Set<string>();
    let parent = randomGenome(1);
    for (let i = 0; i < 8000; i++) {
      const child = mutate(parent, 7, i);
      const chain: SegmentGene[] = [];
      for (let s: SegmentGene | undefined = child.body; s; s = s.child) chain.push(s);
      for (const seg of chain) for (const a of seg.appendages) { seenK.add(a.kind); seenT.add(a.terminal); }
      if (i % 25 === 0) parent = child; // wander so structural ops accumulate
    }
    for (const k of ['ear', 'gill', 'crest', 'whisker', 'plate'] as const) expect(seenK.has(k)).toBe(true);
    for (const t of ['club', 'barb', 'ear', 'gill', 'crest', 'carapace', 'whisker'] as const) expect(seenT.has(t)).toBe(true);
  });

  it('stays valid, in-bounds, and exactly bilaterally symmetric with the new parts (Pillars 1–3)', () => {
    for (let s = 0; s < 300; s++) {
      const g = randomGenome(s);
      expectGenomeWithinBounds(g);
      expectValidPhenotype(grow(g));
      expectBilateralSymmetry(grow(randomGenome(s, 'bilateral')));
    }
  });
});
