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
      // round in section: not the braincase's broad flat shape carried down to the nose
      expect(muzzle.scale?.[0] ?? 1, `#${seed} round`).toBeLessThan(1.05);
      // and no whiskers: a bear has none to speak of
      expect(p.nodes.some((n) => n.terminal === 'whisker'), `#${seed}`).toBe(false);
    }
  });
});
