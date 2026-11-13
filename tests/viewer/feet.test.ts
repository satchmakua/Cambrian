import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { bareLegsOf, footPlanOf, isHindFoot, legWeights, ratLike, toedFootGeometry } from '../../src/viewer/feet';
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

  it("a mouse stands on bare pink paws; a cat, a dog, a bear and a weasel on furred ones", () => {
    // (a mouse in a dark disc of a foot, then in a fuzzy coat-coloured mitten, stood on stilts in slippers)
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'rodent'));
      expect(p.nodes.some((n) => n.part?.kind === 'leg' && n.terminal === 'paw'), `rodent #${seed}`).toBe(true);
      expect(ratLike(p), `rodent #${seed}`).toBe(true);
      for (const id of ['felid', 'canid', 'ursid', 'mustelid']) expect(ratLike(grow(genomeOfMorphotype(seed, id))), `${id} #${seed}`).toBe(false);
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

  it('a frog\'s hind feet are its hind feet, its hands are not; a bird has none', () => {
    for (const seed of [1, 4, 11]) {
      const p = grow(genomeOfMorphotype(seed, 'anuran'));
      const feet = p.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.kind === 'terminal' && n.part?.kind === 'leg');
      const hind = feet.filter(({ i }) => isHindFoot(p, i));
      expect(hind.length, `#${seed}`).toBe(2);
      // the hind pair is the one rooted further back
      const z = (i: number) => p.nodes[i].pos[2];
      for (const h of hind) for (const f of feet.filter((x) => !hind.includes(x))) expect(z(h.i), `#${seed}`).toBeLessThan(z(f.i) + 0.5);
    }
    const bird = grow(genomeOfMorphotype(3, 'bird'));
    bird.nodes.forEach((n, i) => {
      if (n.kind === 'terminal' && n.part?.kind === 'leg') expect(isHindFoot(bird, i)).toBe(false);
    });
  });

  it("a frog's hind foot is webbed between its toes, out most of their length; its hand is not", () => {
    // (pad-tipped toes splayed on bare ground: a tree frog's hand on the end of a swimmer's leg)
    const r = 0.12, link = 0.5;
    const covered = (g: ReturnType<typeof toedFootGeometry>['toes'], x: number, z: number) => {
      const pos = g.getAttribute('position');
      const idx = g.getIndex();
      const n = idx ? idx.count : pos.count;
      const at = (k: number) => (idx ? idx.getX(k) : k);
      for (let t = 0; t < n; t += 3) {
        const [a, b, c] = [at(t), at(t + 1), at(t + 2)];
        const ax = pos.getX(a), az = pos.getZ(a), bx = pos.getX(b), bz = pos.getZ(b), cx = pos.getX(c), cz = pos.getZ(c);
        const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
        const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
        const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
        const neg = d1 < 0 || d2 < 0 || d3 < 0, pos3 = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos3)) return true;
      }
      return false;
    };
    // midway between the middle toe and the next, at three-fifths of their length
    const probe = (webbed: boolean) => {
      const g = toedFootGeometry('frog', r, link, false, webbed).toes;
      const L = Math.max(r * 2.8, link * 0.42) * (webbed ? 1.3 : 1);
      const az = 0.55 * (webbed ? 1.12 : 1) * 0.5;
      const s = 0.6 * L * 0.94;
      return covered(g, Math.sin(az) * s, Math.cos(az) * s);
    };
    expect(probe(true)).toBe(true);
    expect(probe(false)).toBe(false);
  });
});
