import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';

/** How far the deepest tail node reaches under the floor the feet stand on (≤ 0: none does). */
function tailBelowFloor(p: Phenotype): number | null {
  const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
  if (feet.length < 2) return null;
  const ground = Math.min(...feet.map((n) => n.pos[1]));
  let worst = -Infinity;
  for (const n of p.nodes) if (n.part?.kind === 'tail') worst = Math.max(worst, ground - (n.pos[1] - n.radius * 0.85));
  return worst;
}

describe('tails', () => {
  it('no tail reaches through the floor — a creature stands on its feet, not its tail tip', () => {
    // a hanging tail's tip used to end below the feet (81 of 100 lizards, 68 wyverns), and every
    // view puts the floor at the lowest point: the animal stood on its tail with its feet in the air
    for (const id of ['lizard', 'crocodilian', 'chelonian', 'wyvern', 'biped', 'dragon', 'felid', 'canid', 'ungulate']) {
      for (let seed = 1; seed <= 30; seed++) {
        const d = tailBelowFloor(grow(genomeOfMorphotype(seed, id)));
        if (d !== null) expect(d, `${id} #${seed}`).toBeLessThan(1e-6);
      }
    }
    for (let seed = 1; seed <= 200; seed++) {
      const d = tailBelowFloor(grow(randomGenome(seed)));
      if (d !== null) expect(d, `random #${seed}`).toBeLessThan(1e-6);
    }
  });

  it("a reptile's tail is the body running on, not a wire off its rump", () => {
    for (const id of ['lizard', 'crocodilian']) {
      for (let seed = 1; seed <= 20; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const parentOf = new Map(p.edges.map(([a, b]) => [b, a]));
        const root = p.nodes.findIndex((n, i) => n.part?.kind === 'tail' && p.nodes[parentOf.get(i) ?? i].kind === 'spine');
        expect(root, `${id} #${seed}`).toBeGreaterThanOrEqual(0);
        const hip = p.nodes[parentOf.get(root)!];
        // thick at the root (lizard seed 1's was 0.083 against a 0.366 hip)…
        expect(p.nodes[root].radius / hip.radius, `${id} #${seed}`).toBeGreaterThan(0.45);
        // …and long: it runs on behind the hips at least ~half the trunk's length again
        const trunk = p.nodes.filter((n) => n.kind === 'spine').map((n) => n.pos[2]);
        const tailZ = Math.min(...p.nodes.filter((n) => n.part?.kind === 'tail').map((n) => n.pos[2]));
        expect(Math.min(...trunk) - tailZ, `${id} #${seed}`).toBeGreaterThan(0.45 * (Math.max(...trunk) - Math.min(...trunk)));
      }
    }
  });
});
