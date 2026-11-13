import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

type Node = Phenotype['nodes'][number];
const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);

describe('ratite', () => {
  it('carries a small head on its long neck, and no fan stuck out of its rump', () => {
    // (it drew any skull going, the bulbous and the domed among them: a third of its heads were
    // 0.6–0.75 of the body's depth, a big-headed chick on stilts; and a feathered tail fan seen edge-on
    // was a straw with bristles stuck straight out of the back of an egg)
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ratite'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const head = spine.filter((n) => n.segment === last);
      const trunk = spine.filter((n) => n.segment === 0);
      expect(Math.max(...head.map(ry)) / Math.max(...trunk.map(ry)), `#${seed} a small head`).toBeLessThan(0.5);
      // a short plain tail at most, drooping under the rump's plumage — never a feathered fan
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      expect(tail.some((n) => n.terminal === 'fin'), `#${seed} no fan`).toBe(false);
      if (tail.length) expect(tail[tail.length - 1].pos[1], `#${seed} drooping`).toBeLessThan(tail[0].pos[1] + 0.02);
    }
  });

  it('stands with its feet under its hips — and so do a songbird and a hawk', () => {
    // (legs bent toward each other at every joint, an emu stood knock-kneed on one crossed foot: its
    // feet came down at an eighth of its hips' spread)
    for (const id of ['ratite', 'bird', 'raptor']) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const parent = new Int32Array(p.nodes.length).fill(-1);
        for (const [a, b] of p.edges) parent[b] = a;
        const feet = p.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.kind === 'terminal' && n.part?.kind === 'leg');
        expect(feet.length, `${id} #${seed}`).toBe(2);
        for (const { n, i } of feet) {
          let j = i;
          while (parent[j] >= 0 && p.nodes[parent[j]].part?.kind === 'leg') j = parent[j];
          const hip = p.nodes[j];
          const ratio = (n.pos[0] * Math.sign(hip.pos[0])) / Math.abs(hip.pos[0]);
          expect(ratio, `${id} #${seed}`).toBeGreaterThan(0.9);
        }
      }
    }
  });
});
