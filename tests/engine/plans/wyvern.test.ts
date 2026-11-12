import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

type Node = Phenotype['nodes'][number];
const rx = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);

describe('wyvern', () => {
  it('its skull is a dragon’s: a little wider than tall and a head’s size on its neck — not a disc on a pole', () => {
    // (half its founders wore a 'flat' skull twice as wide as it was tall and twice the neck's width —
    // a mushroom cap, a cobra's hood on a pole — and the rest a 'wedge' half as wide as tall)
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'wyvern'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const head = spine.filter((n) => n.segment === last);
      const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
      const top = neck[neck.length - 1];
      expect(rx(head[0]) / ry(head[0]), `#${seed} width against depth`).toBeGreaterThan(0.95);
      expect(rx(head[0]) / ry(head[0]), `#${seed} width against depth`).toBeLessThan(1.5);
      expect(rx(head[0]) / rx(top), `#${seed} against the neck`).toBeLessThan(1.9);
    }
  });
});
