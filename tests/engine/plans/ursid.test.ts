import { describe, it, expect } from 'vitest';
import { grow, headStop } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

describe('ursid', () => {
  it('its skull has a stop: a broad braincase stepping down to a shorter, narrower, round muzzle', () => {
    // (the muzzle was 0.62–0.7 of the skull's girth and as wide as it, running flat from the brow to
    // the nose: a capybara's head, a hippo's)
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'ursid');
      let head = g.body;
      let depth = 0;
      while (head.child) {
        head = head.child;
        depth++;
      }
      expect(headStop(head, depth), `#${seed}`).toBeGreaterThan(0.9);
      const p = grow(g);
      const skull = p.nodes.filter((n) => n.kind === 'spine' && n.segment === depth);
      const brain = skull[0];
      const muzzle = skull[skull.length - 1];
      expect(muzzle.radius / brain.radius, `#${seed} narrower`).toBeLessThan(0.55);
      // …and tapering on to the nose: an even tube ending in a round bulb was a hippo's
      expect(muzzle.radius / skull[1].radius, `#${seed} tapers`).toBeLessThan(0.8);
      // round in section: not the braincase's broad flat shape carried down to the nose
      expect(muzzle.scale?.[0] ?? 1, `#${seed} round`).toBeLessThan(1.05);
      // and no whiskers: a bear has none to speak of
      expect(p.nodes.some((n) => n.terminal === 'whisker'), `#${seed}`).toBe(false);
    }
  });

  it("its back rises to the hump over its shoulders, and its muzzle is held out level from the brow", () => {
    // (level from rump to shoulders, the muzzle hung from the brow at a hound's droop: a tapir, a hippo)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'ursid'));
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0).sort((a, b) => a.pos[2] - b.pos[2]);
      const top = (n: (typeof trunk)[number]) => n.pos[1] + n.radius * (n.scale?.[1] ?? 1);
      const rump = trunk[0], shoulders = trunk[trunk.length - 1];
      expect((top(shoulders) - top(rump)) / rump.radius, `#${seed} hump`).toBeGreaterThan(0.4);
      const depth = Math.max(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment ?? 0));
      const skull = p.nodes.filter((n) => n.kind === 'spine' && n.segment === depth);
      const brain = skull[0], muzzle = skull[skull.length - 1];
      expect((muzzle.pos[1] - brain.pos[1]) / brain.radius, `#${seed} level muzzle`).toBeGreaterThan(-0.55);
    }
  });

  it('always has ears: small and round, on the top of its head', () => {
    // (one bear in ten drew none: a smooth domed skull on a tube of a muzzle, a seal's head)
    for (let seed = 1; seed <= 60; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ursid'));
      expect(p.nodes.filter((n) => n.terminal === 'ear').length, `#${seed}`).toBe(2);
    }
  });
});
