import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { mouthSpec } from '../../../src/viewer/mouthLine';

const SEEDS = [...Array.from({ length: 10 }, (_, i) => i + 1), 23];

/** the thin upper feelers, each as its chain of node indices, root first */
function feelers(p: Phenotype): number[][] {
  const parent = new Map<number, number>();
  for (const [a, b] of p.edges) parent.set(b, a);
  const roots = p.nodes.map((n, i) => [n, i] as const).filter(([n, i]) => n.part?.kind === 'tentacle' && p.nodes[parent.get(i)!]?.kind === 'spine');
  const thin = Math.min(...roots.map(([n]) => n.radius));
  return roots
    .filter(([n]) => n.radius < thin * 1.5)
    .map(([, i]) => {
      const chain = [i];
      for (let cur = i; ; ) {
        const next = p.edges.find(([a]) => a === cur);
        if (!next) break;
        cur = next[1];
        chain.push(cur);
      }
      return chain;
    });
}

/** the closest two segments come (sampled) */
function segGap(a0: readonly number[], a1: readonly number[], b0: readonly number[], b1: readonly number[]): number {
  let best = Infinity;
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const a = [0, 1, 2].map((k) => a0[k] + ((a1[k] - a0[k]) * i) / 8);
      const b = [0, 1, 2].map((k) => b0[k] + ((b1[k] - b0[k]) * j) / 8);
      best = Math.min(best, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  return best;
}

describe('horror', () => {
  it('its thin feelers ring the crown mouth from outside its lip, splay apart and stay above its eyes', () => {
    // (rooted halfway up the body, the front one hung across the face — a pencil stuck in an egg; rooted
    // inside the mouth's lip and swirling sideways, they arched over its rim through each other in a knot)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'horror'));
      const fs = feelers(p);
      expect(fs.length, `#${seed}`).toBe(p.genomeRef.radialCount);
      const body = p.nodes.find((n) => n.kind === 'spine')!;
      const topEye = Math.max(...p.nodes.filter((n) => n.terminal === 'eye').map((n) => n.pos[1]));
      const spec = mouthSpec(p, p.nodes.findIndex((n) => n.terminal === 'mouth'))!;
      for (const ch of fs) {
        const r0 = p.nodes[ch[0]];
        // rooted outside the lip (which lies about at the mouth's radius from the crown's axis)
        expect(Math.hypot(r0.pos[0] - body.pos[0], r0.pos[2] - body.pos[2]), `#${seed} outside the lip`).toBeGreaterThan(0.95 * spec.r);
        for (const k of ch) expect(p.nodes[k].pos[1], `#${seed} above the eyes`).toBeGreaterThan(topEye + 0.1 * body.radius);
      }
      // no two feelers come within their girths of each other
      for (let a = 0; a < fs.length; a++) {
        for (let b = a + 1; b < fs.length; b++) {
          for (let i = 0; i + 1 < fs[a].length; i++) {
            for (let j = 0; j + 1 < fs[b].length; j++) {
              const A = p.nodes[fs[a][i]], A1 = p.nodes[fs[a][i + 1]], B = p.nodes[fs[b][j]], B1 = p.nodes[fs[b][j + 1]];
              expect(segGap(A.pos, A1.pos, B.pos, B1.pos), `#${seed} feelers ${a},${b}`).toBeGreaterThan(A.radius + B.radius + 0.15 * body.radius);
            }
          }
        }
      }
    }
  });
});
