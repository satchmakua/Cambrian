import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
type Node = Phenotype['nodes'][number];
const rx = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const rz = (n: Node) => n.radius * (n.scale?.[2] ?? 1);

describe('anuran', () => {
  it('its head is short and wide, set on the body — not a slab as long as the trunk jutting out ahead of it', () => {
    // (a head of two stretched links ran 0.8–1.1 of the trunk's length, more than half of it out
    // ahead of the trunk: a hammer head, a tadpole's)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'anuran'));
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
      const tz0 = Math.min(...trunk.map((n) => n.pos[2] - rz(n)));
      const tz1 = Math.max(...trunk.map((n) => n.pos[2] + rz(n)));
      const hz0 = Math.min(...head.map((n) => n.pos[2] - rz(n)));
      const hz1 = Math.max(...head.map((n) => n.pos[2] + rz(n)));
      expect(head.length, `#${seed}`).toBe(1);
      expect((hz1 - hz0) / (tz1 - tz0), `#${seed} short`).toBeLessThan(0.7);
      expect((hz1 - tz1) / (tz1 - tz0), `#${seed} set on the body`).toBeLessThan(0.42);
      expect(Math.max(...head.map(rx)) / Math.max(...trunk.map(rx)), `#${seed} as wide as the body`).toBeGreaterThan(0.9);
      // its eyes on the front half of the head (they were stranded two-thirds of the way back on it)
      const eye = p.nodes.find((n) => n.terminal === 'eye')!;
      expect((eye.pos[2] - hz0) / (hz1 - hz0), `#${seed} eyes forward`).toBeGreaterThan(0.5);
    }
  });
});
