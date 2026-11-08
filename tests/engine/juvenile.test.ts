import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';
import { juvenileGenome } from '../../src/engine/juvenile';
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
        expect(headR(young) / trunkR(young), `${id} #${seed}`).toBeGreaterThan((headR(adult) / trunkR(adult)) * 1.15);
        // (the face's eye cap scales with the head, so the eyes grow with it: big for the BODY)
        expect(eyeR(young) / trunkR(young), `${id} #${seed}`).toBeGreaterThan((eyeR(adult) / trunkR(adult)) * 1.15);
        expect(legReach(young) / trunkR(young), `${id} #${seed}`).toBeLessThan(legReach(adult) / trunkR(adult));
      }
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
