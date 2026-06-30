import { describe, it, expect } from 'vitest';
import { randomGenome, genomeOfMorphotype, MORPHOTYPE_IDS } from '../../src/engine/random';
import { grow, type Phenotype } from '../../src/engine/grow';
import { coherence } from '../../src/engine/morphospace';
import { expectValidPhenotype, expectGenomeWithinBounds, expectBilateralSymmetry } from './invariants';

/** Count grown legs (one terminal node per leg, both mirrored sides). */
function legCount(p: Phenotype): number {
  return p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').length;
}
function hasPart(p: Phenotype, kind: string): boolean {
  return p.nodes.some((n) => n.part?.kind === kind);
}

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
      expect(Math.max(...eyes.map((e) => e.radius))).toBeGreaterThan(0.1); // floored — never tiny
    }
  });

  it('at least half of all creatures have eyes (the M24 face guarantee — in practice ~all)', () => {
    let withEyes = 0;
    for (let s = 0; s < 300; s++) if (grow(randomGenome(s)).nodes.some((n) => n.terminal === 'eye')) withEyes++;
    expect(withEyes).toBeGreaterThanOrEqual(150); // ≥ 50%
  });
});

describe('morphotype library (M22 — full catalogue §4)', () => {
  const NEW = ['primate', 'mustelid', 'chelonian', 'ratite', 'chimera', 'arthro-alien', 'crystalline'] as const;

  it('ships the full catalogue — every §4 morphotype is present', () => {
    for (const id of NEW) expect(MORPHOTYPE_IDS).toContain(id);
    expect(MORPHOTYPE_IDS.length).toBeGreaterThanOrEqual(30);
  });

  it('every new morphotype grows valid, in-bounds creatures over many seeds', () => {
    for (const id of NEW) {
      for (let s = 0; s < 40; s++) {
        const g = genomeOfMorphotype(s * 23 + 1, id);
        expectGenomeWithinBounds(g);
        expectValidPhenotype(grow(g));
      }
    }
  });

  it('each new morphotype reads structurally as its kind', () => {
    for (let s = 0; s < 8; s++) {
      // mustelid / chelonian — four-legged
      for (const id of ['mustelid', 'chelonian'] as const) {
        expect(legCount(grow(genomeOfMorphotype(s * 11 + 3, id)))).toBe(4);
      }
      // ratite + primate — bipeds (one leg pair; the primate also carries grasping arms)
      expect(legCount(grow(genomeOfMorphotype(s * 11 + 3, 'ratite')))).toBe(2);
      expect(legCount(grow(genomeOfMorphotype(s * 11 + 3, 'primate')))).toBe(2);
      // arthro-alien — ten-plus legs, a true many-legged body
      expect(legCount(grow(genomeOfMorphotype(s * 11 + 3, 'arthro-alien')))).toBeGreaterThanOrEqual(8);
      // chimera — a winged, tailed mishmash
      const chim = grow(genomeOfMorphotype(s * 11 + 3, 'chimera'));
      expect(hasPart(chim, 'wing')).toBe(true);
      expect(hasPart(chim, 'tail')).toBe(true);
      // crystalline — a spiked, glowing-eyed plated thing
      const crys = grow(genomeOfMorphotype(s * 11 + 3, 'crystalline'));
      expect(hasPart(crys, 'spine')).toBe(true);
      expect(crys.genomeRef.covering.type).toBe('plates');
    }
  });

  it('the larger library stays coherent — no new morphotype is lost in the void', () => {
    for (const id of NEW) {
      let total = 0;
      for (let s = 0; s < 8; s++) total += coherence(grow(genomeOfMorphotype(s * 17 + 3, id))).score;
      expect(total / 8).toBeGreaterThan(0.3); // clearly near an attractor (the §4 test floor)
    }
  });
});
