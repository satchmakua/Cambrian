import { describe, it, expect } from 'vitest';
import { grow, nodeReach } from '../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../src/engine/random';

// Where a creature stands: the floor its bounds give is the lowest of its body and limbs, as they are
// drawn. (A sea star's mouth, an octopus's beak and a slug's mouth hung below the arms and the sole and
// set the ground under them; flat discs, soles and shells were measured as balls of their radius and
// reached below what is drawn: five plans floated a hand's breadth over the floor.)
describe('ground', () => {
  const plans = [...new Set(MORPHOTYPE_IDS)];

  it('every plan rests on its body or limbs — the floor is their true lowest point, never a mouth or an eye', () => {
    for (const id of plans) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const lowest = Math.min(...p.nodes.filter((n) => n.terminal !== 'mouth' && n.terminal !== 'eye').map((n) => n.pos[1] - nodeReach(n)[1]));
        // (a myriapod stands on the points of its legs, drawn on below their last joint: its floor is under them)
        if (id === 'arthro-alien') expect(p.bounds.min[1], `${id} #${seed}`).toBeLessThan(lowest);
        else expect(p.bounds.min[1], `${id} #${seed}`).toBeCloseTo(lowest, 6);
      }
    }
  });

  it("a shaped node's reach is its ellipsoid as it is turned, not a ball of its radius", () => {
    const flat = { radius: 1, scale: [2, 0.5, 1] as [number, number, number], quat: [0, 0, 0, 1] };
    expect(nodeReach(flat)).toEqual([2, 0.5, 1]);
    // turned a quarter about Z: its long axis now stands up
    const s = Math.SQRT1_2;
    const r = nodeReach({ ...flat, quat: [0, 0, s, s] });
    expect(r[0]).toBeCloseTo(0.5, 9);
    expect(r[1]).toBeCloseTo(2, 9);
    expect(nodeReach({ radius: 0.3, quat: [0, 0, 0, 1] })).toEqual([0.3, 0.3, 0.3]);
  });

  it('a crab stands on the tips of its legs, its shell clear of the floor', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      const belly = Math.min(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.pos[1] - nodeReach(n)[1]));
      expect(Math.min(...feet.map((n) => n.pos[1] - n.radius)), `#${seed}`).toBeCloseTo(p.bounds.min[1], 6);
      expect(belly - p.bounds.min[1], `#${seed} clear`).toBeGreaterThan(0.03);
    }
  });

  it('a slug lies along its sole: head and tail ends both near the floor', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const trunk = p.nodes.filter((n) => n.kind === 'spine').sort((a, b) => a.pos[2] - b.pos[2]);
      const under = (n: (typeof trunk)[number]) => n.pos[1] - nodeReach(n)[1] - p.bounds.min[1];
      const len = trunk[trunk.length - 1].pos[2] - trunk[0].pos[2];
      expect(Math.abs(under(trunk[trunk.length - 1]) - under(trunk[0])) / len, `#${seed} level`).toBeLessThan(0.06);
    }
  });

  it('an octopus has eight arms', () => {
    for (let seed = 1; seed <= 8; seed++) expect(genomeOfMorphotype(seed, 'cephalopod').radialCount).toBe(8);
  });
});
