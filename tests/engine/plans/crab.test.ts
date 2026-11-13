import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);

/** each walking leg's heading in plan, from its root to its point: radians off square to the flank,
 *  + forward, − back; front legs first */
function legHeadings(p: Phenotype): number[] {
  const parent = new Map<number, number>();
  for (const [a, b] of p.edges) parent.set(b, a);
  const out: { z: number; a: number }[] = [];
  p.nodes.forEach((n, i) => {
    // a walking leg's point (the claw arms are pincers, not legs)
    if (n.part?.kind !== 'leg' || !n.terminal || n.pos[0] <= 0) return;
    let r = i;
    while (p.nodes[parent.get(r)!]?.part?.kind === 'leg') r = parent.get(r)!;
    const root = p.nodes[r];
    out.push({ z: root.pos[2], a: Math.atan2(n.pos[2] - root.pos[2], n.pos[0] - root.pos[0]) });
  });
  return out.sort((x, y) => y.z - x.z).map((o) => o.a);
}

describe('crab', () => {
  it("its walking legs sweep back as a set — not fanned evenly round the shell like a tick's", () => {
    // (fanned fore and aft about the middle, the front pair reached as far forward as the last reached
    // back: from above, a spider)
    for (const seed of SEEDS) {
      const h = legHeadings(grow(genomeOfMorphotype(seed, 'crab')));
      expect(h.length, `#${seed}`).toBe(4);
      // the first pair barely forward of square, the last well behind it
      expect(h[0], `#${seed} front`).toBeLessThan(0.3);
      expect(h[3], `#${seed} back`).toBeLessThan(-0.45);
      // the set as a whole leans back
      expect(h.reduce((s, a) => s + a, 0) / h.length, `#${seed} mean`).toBeLessThan(-0.1);
    }
  });
});
