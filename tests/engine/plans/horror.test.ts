import { describe, it, expect } from 'vitest';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = [...Array.from({ length: 10 }, (_, i) => i + 1), 23];

describe('horror', () => {
  it('its thin upper feelers ring the crown about the mouth, above its eyes — none hangs across its face', () => {
    // (rooted halfway up the body, the front feeler hung down across the face between the eyes: a pencil
    // stuck in an egg)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'horror'));
      const parent = new Map<number, number>();
      for (const [a, b] of p.edges) parent.set(b, a);
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      const topEye = Math.max(...eyes.map((n) => n.pos[1]));
      // each tentacle's root link, and how thick its chain starts
      const roots = p.nodes.filter((n, i) => n.part?.kind === 'tentacle' && p.nodes[parent.get(i)!]?.kind === 'spine');
      const thin = Math.min(...roots.map((n) => n.radius));
      const feelers = roots.filter((n) => n.radius < thin * 1.5);
      expect(feelers.length, `#${seed}`).toBe(p.genomeRef.radialCount);
      // every link of every feeler, root to tip, stays well above the eyes (the old ring's front feeler
      // ran forward from just over them, its tip a tenth of the body's girth above eye level)
      const body = p.nodes.find((n) => n.kind === 'spine')!;
      const feelerIdx = new Set(feelers.map((f) => p.nodes.indexOf(f)));
      p.nodes.forEach((n, i) => {
        let r = i;
        while (parent.has(r) && p.nodes[parent.get(r)!].part?.kind === 'tentacle') r = parent.get(r)!;
        if (feelerIdx.has(r)) expect(n.pos[1], `#${seed} feeler link ${i}`).toBeGreaterThan(topEye + 0.4 * body.radius);
      });
    }
  });
});
