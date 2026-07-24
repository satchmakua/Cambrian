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
    // a dragon reads as a winged beast — its own basin holds the structural siblings dragon /
    // wyvern / chimera (all winged, tailed quadrupeds). The point: not a fish.
    let winged = 0;
    for (let s = 0; s < 10; s++) {
      const n = coherence(grow(genomeOfMorphotype(s * 13 + 2, 'dragon'))).nearest;
      if (n === 'dragon' || n === 'wyvern' || n === 'chimera') winged++;
    }
    expect(winged).toBeGreaterThan(5);
  });
});

group('descriptor dims (M26 — §11.1)', () => {
  const DIMS = 10;
  const HEADED = 8;
  const SHEEN = 9;

  it('is the full 10-D vector, every dim finite and in [0,1]', () => {
    for (let s = 0; s < 40; s++) {
      const d = describe(grow(randomGenome(s)));
      expect(d).toHaveLength(DIMS);
      for (const v of d) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('headedness separates necked bodies from undifferentiated blobs', () => {
    // a blob has no forward constriction at all…
    for (const id of ['slime', 'urchin']) {
      for (let s = 0; s < 6; s++) {
        expect(describe(grow(genomeOfMorphotype(s * 41 + 3, id)))[HEADED]).toBeLessThan(0.12);
      }
    }
    // …while a chain-bodied creature pinches toward its head
    const mean = (id: string) => {
      let t = 0;
      for (let s = 0; s < 8; s++) t += describe(grow(genomeOfMorphotype(s * 41 + 3, id)))[HEADED];
      return t / 8;
    };
    expect(mean('serpent')).toBeGreaterThan(0.25);
    expect(mean('ungulate')).toBeGreaterThan(0.25);
    expect(mean('slime')).toBeLessThan(0.1);
  });

  it('sheen reports the creature’s actual surface gene', () => {
    for (let s = 0; s < 20; s++) {
      const p = grow(randomGenome(s));
      expect(describe(p)[SHEEN]).toBeCloseTo(p.genomeRef.covering.sheen, 6);
    }
    // and it genuinely varies across the catalogue (a constant dim would separate nothing)
    const vals = MORPHOTYPE_IDS.map((id) => describe(grow(genomeOfMorphotype(11, id)))[SHEEN]);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.4);
  });

  it('the new dims sharpen the labels — chimera stops being read as a dragon', () => {
    const tally = (id: string) => {
      let self = 0;
      let asDragon = 0;
      for (let s = 0; s < 40; s++) {
        const n = coherence(grow(genomeOfMorphotype(s * 97 + 5, id))).nearest;
        if (n === id) self++;
        if (n === 'dragon') asDragon++;
      }
      return { self, asDragon };
    };
    const chimera = tally('chimera');
    // Before the sheen+headedness dims, chimera read as dragon far more often. The exact self count
    // drifts with unrelated structural tuning (fin node counts, etc.), so assert the robust property:
    // chimera labels as ITSELF clearly more than as a dragon, and dragon-confusion stays rare.
    expect(chimera.asDragon).toBeLessThanOrEqual(4);
    expect(chimera.self).toBeGreaterThan(chimera.asDragon * 2);
    expect(chimera.self).toBeGreaterThan(12);
  });

  it('self-labelling across the whole catalogue improved and stays there', () => {
    let hits = 0;
    let total = 0;
    for (const id of MORPHOTYPE_IDS) {
      for (let s = 0; s < 12; s++) {
        if (coherence(grow(genomeOfMorphotype(s * 97 + 5, id))).nearest === id) hits++;
        total++;
      }
    }
    // 47.1% on the 8-D descriptor → 57.3% on the full 10-D one; guard the gain, not the exact number
    expect(hits / total).toBeGreaterThan(0.52);
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
