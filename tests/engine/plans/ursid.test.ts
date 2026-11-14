import { describe, it, expect } from 'vitest';
import { grow, headStop, type BodyNode } from '../../../src/engine/grow';
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

  it('is a barrel on thick columns, its head at its shoulders on a neck as thick as its skull, its snout short', () => {
    // (a wedge sloping off steep withers to a small rump, on long thin legs ending in small paws, the
    // head held up over the withers on a waist of a neck, with a dog's length of muzzle: a hyena)
    const top = (n: BodyNode) => n.pos[1] + n.radius * (n.scale?.[1] ?? 1);
    const bot = (n: BodyNode) => n.pos[1] - n.radius * (n.scale?.[1] ?? 1);
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'ursid'));
      const depth = Math.max(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment ?? 0));
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0).sort((a, b) => a.pos[2] - b.pos[2]);
      const neck = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) > 0 && (n.segment ?? 0) < depth);
      const skull = p.nodes.filter((n) => n.kind === 'spine' && n.segment === depth);
      const rump = trunk[0], chest = trunk[trunk.length - 1];
      const brain = skull[0], nose = skull[skull.length - 1];
      // a barrel: the rump near the chest's girth, the back falling only a little to it
      expect(rump.radius / chest.radius, `#${seed} rump`).toBeGreaterThan(0.75);
      expect((top(chest) - top(rump)) / rump.radius, `#${seed} slope`).toBeLessThan(0.8);
      // on columns: big paws, and the belly low between them
      const paws = p.nodes.filter((n) => n.terminal === 'paw');
      expect(Math.min(...paws.map((n) => n.radius)) / chest.radius, `#${seed} paws`).toBeGreaterThan(0.25);
      const belly = Math.min(...trunk.map(bot)), back = Math.max(...trunk.map(top));
      const footY = Math.min(...p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').map((n) => n.pos[1]));
      expect((belly - footY) / (back - belly), `#${seed} belly`).toBeLessThan(0.62);
      // the head carried at the withers, on a neck nearly the skull's girth
      expect((top(brain) - top(chest)) / chest.radius, `#${seed} head`).toBeLessThan(0.2);
      expect(Math.min(...neck.map((n) => n.radius)) / brain.radius, `#${seed} neck`).toBeGreaterThan(0.82);
      // a short snout on a broad head: the nose under a skull's radius past the braincase
      expect((nose.pos[2] + nose.radius - (brain.pos[2] + brain.radius)) / brain.radius, `#${seed} snout`).toBeLessThan(0.9);
      // and small eyes
      for (const e of p.nodes.filter((n) => n.terminal === 'eye')) expect(e.radius / brain.radius, `#${seed} eye`).toBeLessThan(0.21);
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
