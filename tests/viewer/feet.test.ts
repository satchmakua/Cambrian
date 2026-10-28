import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { bareLegsOf, footPlanOf, legWeights, toedFootGeometry } from '../../src/viewer/feet';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { randomGenome } from '../../src/engine/random';

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
    expect(footPlanOf(grow(genomeOfMorphotype(3, 'anuran')))).toBe('frog');
  });

  it('toes are finite, lie on the ground plane and reach forward of the ankle', () => {
    for (const plan of ['bird', 'reptile', 'frog'] as const) {
      const r = 0.07;
      const { toes, claws } = toedFootGeometry(plan, r, 0.6);
      for (const g of plan === 'frog' ? [toes] : [toes, claws]) {
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

  it('only the legs go bare: a low-slung belly below the shank line keeps its plumage', () => {
    let checked = 0;
    for (const seed of [35, 93, 114, 126, 21]) {
      const p = grow(randomGenome(seed));
      const bare = bareLegsOf(p);
      if (!bare) continue;
      const geo = buildSmoothGeometry(p, true, [], 'low');
      const pos = geo.getAttribute('position');
      const w = legWeights(p, pos.array as Float32Array, pos.count);
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      let belly = 0, bellyLeg = 0, shank = 0, shankLeg = 0;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
        if (y >= bare.y) continue;
        const nearFoot = feet.some((f) => Math.hypot(x - f.pos[0], y - f.pos[1], z - f.pos[2]) < f.radius * 2.5);
        if (nearFoot) {
          shank++;
          if (w[v] > 0.5) shankLeg++;
        } else if (Math.abs(x) < 0.06) {
          // the body's midline below the line: no leg runs down the middle of a bilateral body
          belly++;
          if (w[v] > 0.5) bellyLeg++;
        }
      }
      if (belly > 0) expect(bellyLeg / belly, `seed ${seed} belly`).toBeLessThan(0.1);
      if (shank > 0) expect(shankLeg / shank, `seed ${seed} feet`).toBeGreaterThan(0.8);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

