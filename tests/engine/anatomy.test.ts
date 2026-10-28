import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { expectBilateralSymmetry, expectValidPhenotype } from './invariants';

/** Each leg chain (hip → foot) of a phenotype, as node index lists. */
function legChains(p: Phenotype): number[][] {
  const parent = new Int32Array(p.nodes.length).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  const chains: number[][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
    const chain = [i];
    let c = parent[i];
    while (c >= 0 && p.nodes[c].part?.kind === 'leg') {
      chain.unshift(c);
      c = parent[c];
    }
    chains.push(chain);
  });
  return chains;
}

function belly(p: Phenotype): number {
  let b = Infinity;
  for (const n of p.nodes) if (n.kind === 'spine') b = Math.min(b, n.pos[1] - n.radius * (n.scale?.[1] ?? 1));
  return b;
}

describe('anatomy: legs stand, arthropods arch, bodies stay in proportion', () => {
  it('every legged creature stands on its feet — all feet at one ground level, below the belly', () => {
    for (const id of ['felid', 'ursid', 'chelonian', 'mustelid', 'arachnid', 'insectoid', 'crab', 'bird']) {
      for (let s = 0; s < 12; s++) {
        const p = grow(genomeOfMorphotype(s * 31 + 5, id));
        const feet = legChains(p).map((c) => p.nodes[c[c.length - 1]].pos[1]);
        if (feet.length < 2) continue;
        const ground = Math.min(...feet);
        for (const y of feet) expect(Math.abs(y - ground)).toBeLessThan(1e-6);
        expect(ground).toBeLessThan(belly(p));
      }
    }
  });

  it('arthropod legs arch: the knee rises above the hip, and pairs fan fore-aft', () => {
    for (const id of ['arachnid', 'insectoid', 'arthro-alien']) {
      for (let s = 0; s < 10; s++) {
        const p = grow(genomeOfMorphotype(s * 17 + 3, id));
        expectValidPhenotype(p);
        expectBilateralSymmetry(p);
        const chains = legChains(p).filter((c) => c.length >= 3);
        let arched = 0;
        for (const c of chains) if (p.nodes[c[1]].pos[1] > p.nodes[c[0]].pos[1]) arched++;
        expect(arched / Math.max(chains.length, 1)).toBeGreaterThan(0.6);
        // the feet spread along the body: front and hind feet are well apart in z
        const zs = legChains(p).map((c) => p.nodes[c[c.length - 1]].pos[2]);
        expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.4);
      }
    }
  });

  it('many legs on a short trunk do not swell it into a ball (haunches thicken a node once)', () => {
    for (let s = 0; s < 20; s++) {
      const g = genomeOfMorphotype(s * 7 + 1, 'arachnid');
      const p = grow(g);
      const girth = (g.body.size[0] + g.body.size[1]) / 2;
      const trunkMax = Math.max(...p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0).map((n) => n.radius));
      // fusiform bulge (×1.35) and one haunch (×1.22) at most
      expect(trunkMax).toBeLessThanOrEqual(girth * 1.35 * 1.22 + 1e-9);
    }
  });
});
