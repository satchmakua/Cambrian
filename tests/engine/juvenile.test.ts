import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';
import { juvenileGenome, HEAD_MAX, HEAD_MIN } from '../../src/engine/juvenile';
import type { Genome, SegmentGene } from '../../src/engine/genome';
import { expectGenomeWithinBounds, expectValidPhenotype } from './invariants';

const headR = (p: Phenotype) => {
  const last = Math.max(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment ?? 0));
  return Math.max(...p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === last).map((n) => n.radius));
};
const trunkR = (p: Phenotype) => Math.max(...p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0).map((n) => n.radius));
const eyeR = (p: Phenotype) => Math.max(...p.nodes.filter((n) => n.terminal === 'eye').map((n) => n.radius));
const legReach = (p: Phenotype) => {
  const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
  const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
  return Math.min(...trunk.map((n) => n.pos[1])) - Math.min(...feet.map((n) => n.pos[1]));
};

describe('juvenile proportions', () => {
  it('a youngster has a bigger head and bigger eyes for its body, and shorter legs', () => {
    // (the World's young were their parents shrunk: miniatures, not young)
    for (const id of ['felid', 'canid', 'ungulate', 'ursid', 'rodent', 'bird']) {
      for (let seed = 1; seed <= 4; seed++) {
        const g = genomeOfMorphotype(seed, id);
        const adult = grow(g);
        const young = grow(juvenileGenome(g));
        expect(headR(young) / trunkR(young), `${id} #${seed}`).toBeGreaterThan((headR(adult) / trunkR(adult)) * 1.1);
        // (the face's eye cap scales with the head, so the eyes grow with it: big for the BODY)
        expect(eyeR(young) / trunkR(young), `${id} #${seed}`).toBeGreaterThan((eyeR(adult) / trunkR(adult)) * 1.1);
        expect(legReach(young) / trunkR(young), `${id} #${seed}`).toBeLessThan(legReach(adult) / trunkR(adult));
      }
    }
  });

  it("a youngster's head is big for its body, not bigger than its body", () => {
    // (the young's head was the adult's ×1.42 whatever the adult's was: once a cat's skull was most
    // of its trunk's girth, its kitten's was a third wider than the body carrying it — a head on legs)
    const girth = (s: SegmentGene) => (s.size[0] + s.size[1]) / 2;
    const ends = (g: Genome) => {
      let head = g.body;
      while (head.child) head = head.child;
      return { head: girth(head), trunk: girth(g.body) };
    };
    for (const id of ['felid', 'primate', 'anuran', 'fish', 'crocodilian', 'mustelid', 'canid', 'ungulate']) {
      for (let seed = 1; seed <= 40; seed++) {
        const g = genomeOfMorphotype(seed, id);
        const adult = ends(g);
        const young = ends(juvenileGenome(g));
        // it grows — by the full ×1.42 where there is room, by ×HEAD_MIN at the least …
        expect(young.head, `${id} #${seed}`).toBeGreaterThan(adult.head * 1.1);
        // … and stops at HEAD_MAX of the trunk's girth, unless the adult's own already passes that
        expect(young.head, `${id} #${seed}`).toBeLessThanOrEqual(Math.max(HEAD_MAX * young.trunk, HEAD_MIN * adult.head) + 1e-9);
      }
    }
    // a kitten's grown head is about as wide as its chest (it was 1.35× it, 1.5× at the worst)
    for (let seed = 1; seed <= 40; seed++) {
      const young = grow(juvenileGenome(genomeOfMorphotype(seed, 'felid')));
      const r = headR(young) / trunkR(young);
      expect(r, `kitten #${seed}`).toBeGreaterThan(0.85);
      expect(r, `kitten #${seed}`).toBeLessThan(1.12);
    }
  });

  it('stays in bounds, grows a valid body, and is the same object every time it is asked', () => {
    for (let seed = 0; seed < 300; seed++) {
      const g = randomGenome(seed);
      const j = juvenileGenome(g);
      expectGenomeWithinBounds(j);
      expectValidPhenotype(grow(j));
      expect(juvenileGenome(g)).toBe(j);
    }
  });
});
