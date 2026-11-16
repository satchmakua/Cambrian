import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

// Proposed location: tests/engine/plans/canidCarriage.test.ts

type Node = Phenotype['nodes'][number];
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);

/** A dog side on: its trunk (rump → chest), its skull's three links, its eyes and its paws. */
function measure(seed: number) {
  const p = grow(genomeOfMorphotype(seed, 'canid'));
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const last = Math.max(...spine.map((n) => n.segment ?? 0));
  const trunk = spine.filter((n) => n.segment === 0).sort((a, b) => a.pos[2] - b.pos[2]);
  const head = spine.filter((n) => n.segment === last).sort((a, b) => a.pos[2] - b.pos[2]);
  const eyes = p.nodes.filter((n) => n.terminal === 'eye');
  const paws = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
  const rump = trunk[0], chest = trunk[trunk.length - 1];
  return {
    trunk, rump, chest, head, eyes, paws,
    D: 2 * Math.max(...trunk.map(ry)),
    back: Math.max(...trunk.map((n) => n.pos[1] + ry(n))),
    rumpEnd: rump.pos[2] - rump.radius,
    chestEnd: chest.pos[2] + chest.radius,
  };
}

describe('canid carriage', () => {
  it('carries its head up on its neck: the skull well above the line of the back, not sunk on the chest', () => {
    // (the skull's centre rode 0.13–0.24 of the chest's depth over the back — a big head hung low on a
    // short neck that turned straight up: from the three-quarter view a fawn's or a puppy's)
    for (const seed of SEEDS) {
      const { head, back, D } = measure(seed);
      expect((head[0].pos[1] - back) / D, `#${seed} skull over the back`).toBeGreaterThan(0.26);
    }
  });

  it('has a muzzle about as long as its skull: the eye near half way from the back of the head to the nose', () => {
    // (the nose stood only 0.41–0.44 of the head's length ahead of the eye: the muzzle's excess length was
    // spent stretching the braincase as well, so the eye stayed back and the muzzle read short and blunt)
    for (const seed of SEEDS) {
      const { head, eyes } = measure(seed);
      const skull = head[0], nose = head[head.length - 1];
      const back = skull.pos[2] - skull.radius * (skull.scale?.[2] ?? 1);
      const tip = nose.pos[2] + nose.radius * (nose.scale?.[2] ?? 1);
      const eye = eyes.reduce((s, n) => s + n.pos[2], 0) / eyes.length;
      expect((tip - eye) / (tip - back), `#${seed} muzzle`).toBeGreaterThan(0.46);
    }
  });

  it('stands with its legs under the ends of its trunk: no ball of rump behind the hocks, no chest out ahead', () => {
    // (hung from the middles of the end links, a quarter of the trunk stood behind the hind paws — a heavy
    // round rump — and as much ahead of the fore: the legs under the middle, a fawn's)
    for (const seed of SEEDS) {
      const { paws, rumpEnd, chestEnd } = measure(seed);
      const L = chestEnd - rumpEnd;
      const hind = Math.min(...paws.map((n) => n.pos[2]));
      const fore = Math.max(...paws.map((n) => n.pos[2]));
      expect((hind - rumpEnd) / L, `#${seed} rump behind the hind paws`).toBeLessThan(0.21);
      expect((chestEnd - fore) / L, `#${seed} chest ahead of the fore paws`).toBeLessThan(0.19);
    }
  });
});
