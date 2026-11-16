import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildFieldPrims } from '../../../src/viewer/bodyField';
import { podomeres } from '../../../src/viewer/limbTubes';
import { eyeVariant } from '../../../src/viewer/partStyles';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1).concat([37]);
const eyesOf = (p: Phenotype) => p.nodes.filter((n) => n.terminal === 'eye');

describe("a chimera's face and legs", () => {
  it('looks out of one pair of eyes, never one eye stacked over another on the same side of its head', () => {
    // (every pair on a plain head seats on the same node at the same elevation: on HEAD a second pair stood
    // straight over the first, its centre 0.08 off it with eyes 0.075 in radius — two sockets, half over each other)
    for (const seed of SEEDS) {
      const eyes = eyesOf(grow(genomeOfMorphotype(seed, 'chimera')));
      expect(eyes.length, `#${seed}`).toBe(2);
      const [a, b] = eyes;
      expect(Math.sign(a.pos[0]), `#${seed} one eye a side`).toBe(-Math.sign(b.pos[0]));
    }
  });

  it("its eyes are a reptile's — a coloured ball round a slit — not a black bead (a hole in the head)", () => {
    for (const seed of SEEDS)
      for (const e of eyesOf(grow(genomeOfMorphotype(seed, 'chimera')))) expect(eyeVariant(e.part!.style), `#${seed}`).toBe('slit');
  });

  it('a chitin-coated chimera on paws stands on smooth legs (no podomeres); a claw-footed one and the arthropods keep them', () => {
    // seeds 37 and 42 are chitin on paws (37 is the audited specimen: its legs pinched at the knee and the wrist)
    for (const seed of [37, 42]) {
      const p = grow(genomeOfMorphotype(seed, 'chimera'));
      expect(p.genomeRef.covering.type).toBe('chitin');
      expect(p.nodes.some((n) => n.part?.kind === 'leg' && n.terminal === 'paw')).toBe(true);
      expect(podomeres(p, buildFieldPrims(p, 'hybrid')), `chimera #${seed}`).toBeNull();
    }
    // (a chitin chimera on claws or pincers, and every arthropod, is still a row of stiff segments)
    for (const [id, seed] of [['chimera', 1], ['chimera', 22], ['crab', 1], ['insectoid', 1], ['arthro-alien', 1]] as const) {
      const p = grow(genomeOfMorphotype(seed, id));
      if (p.genomeRef.covering.type !== 'chitin') continue;
      expect(podomeres(p, buildFieldPrims(p, 'hybrid')), `${id} #${seed}`).not.toBeNull();
    }
  });
});
