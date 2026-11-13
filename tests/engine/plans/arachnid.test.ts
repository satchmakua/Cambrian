import { describe, it, expect } from 'vitest';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);

describe('arachnid', () => {
  it("a spider's leg is an arc from a high knee to a foot planted far out — its last link leaning out, not plumb", () => {
    // (dropped near plumb from the knee, the near leg seen down its own plane was one straight pole
    // through the spider's head)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'arachnid'));
      const parent = new Map<number, number>();
      for (const [a, b] of p.edges) parent.set(b, a);
      let legs = 0;
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'leg' || !n.terminal) return;
        const a = p.nodes[parent.get(i)!];
        const d = [n.pos[0] - a.pos[0], n.pos[1] - a.pos[1], n.pos[2] - a.pos[2]];
        const out = Math.hypot(d[0], d[2]);
        // well off plumb (the old near-plumb drop leaned 17°), going down
        expect(d[1], `#${seed} leg ${i} down`).toBeLessThan(0);
        expect(Math.atan2(out, -d[1]), `#${seed} leg ${i}`).toBeGreaterThan(0.4);
        legs++;
      });
      expect(legs, `#${seed}`).toBe(8);
    }
  });
});
