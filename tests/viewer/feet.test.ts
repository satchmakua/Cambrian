import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { bareLegsOf, footPlanOf, toedFootGeometry } from '../../src/viewer/feet';

describe('feet', () => {
  it('a feathered bird stands on bare shanks: the line sits between its feet and its hips', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'bird'));
      const bare = bareLegsOf(p);
      expect(bare).not.toBeNull();
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      const lowest = Math.min(...feet.map((n) => n.pos[1]));
      expect(bare!.y).toBeGreaterThan(lowest);
      // the plumage still covers the body: nothing above the belly is bare
      const trunk = p.nodes.filter((n) => n.kind === 'spine');
      expect(bare!.y).toBeLessThan(Math.min(...trunk.map((n) => n.pos[1])));
      expect(footPlanOf(p)).toBe('bird');
    }
  });

  it('pelts and shells keep their covering all the way down', () => {
    expect(bareLegsOf(grow(genomeOfMorphotype(3, 'felid')))).toBeNull();
    expect(bareLegsOf(grow(genomeOfMorphotype(3, 'lizard')))).toBeNull();
    expect(footPlanOf(grow(genomeOfMorphotype(3, 'insectoid')))).toBeNull();
  });

  it('toes are finite, lie on the ground plane and reach forward of the ankle', () => {
    for (const plan of ['bird', 'reptile'] as const) {
      const r = 0.07;
      const { toes, claws } = toedFootGeometry(plan, r, 0.6);
      for (const g of [toes, claws]) {
        const pos = g.getAttribute('position');
        let minY = Infinity, maxZ = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
          minY = Math.min(minY, pos.getY(i));
          maxZ = Math.max(maxZ, pos.getZ(i));
        }
        expect(minY).toBeGreaterThan(-r * 1.6); // nothing sinks far below the sole
        expect(maxZ).toBeGreaterThan(r * 1.5); // the toes run forward
      }
    }
  });
});
