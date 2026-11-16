import { describe, it, expect } from 'vitest';
import { grow, nodeReach, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
type Node = Phenotype['nodes'][number];
const len = (a: Node, b: Node) => Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]);

/** each leg on the creature's right side: its chain of nodes, hip first, and the trunk node it hangs from */
function legsOf(p: Phenotype): { chain: Node[]; body: Node }[] {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const out: { chain: Node[]; body: Node }[] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg' || n.pos[0] < 0) return;
    const chain = [n];
    let k = parent.get(i)!;
    while (p.nodes[k].part?.kind === 'leg') {
      chain.unshift(p.nodes[k]);
      k = parent.get(k)!;
    }
    out.push({ chain, body: p.nodes[k] });
  });
  return out;
}

describe('a lizard sprawls: its belly low, its elbows and knees out beside it', () => {
  it('its belly hangs low over the floor, not held up on posts', () => {
    // (every link the gene's length, the shin and the foot both falling near plumb, a two-link leg
    // stretched to the floor of a three-link one: the belly stood up to 0.45 of the trunk's depth off
    // the floor, a push-up)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'lizard'));
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
      const belly = Math.min(...trunk.map((n) => n.pos[1] - nodeReach(n)[1]));
      const back = Math.max(...trunk.map((n) => n.pos[1] + nodeReach(n)[1]));
      expect((belly - p.bounds.min[1]) / (back - belly), `#${seed} belly off the floor`).toBeLessThan(0.3);
    }
  });

  it('the upper limb reaches out clear of the flank, and the forearm or shin below it is no post', () => {
    // (the elbow sat in the flank's swell a third of the forearm's length out, and the forearm under it
    // ran twice the upper arm's length straight down to the floor)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'lizard'));
      for (const { chain, body } of legsOf(p)) {
        const [hip, elbow, wrist] = chain;
        const flank = body.pos[0] + nodeReach(body)[0];
        const upper = len(hip, elbow);
        const fore = len(elbow, wrist);
        expect(fore / upper, `#${seed} forearm/shin no longer than the upper limb by much`).toBeLessThan(1.4);
        expect((elbow.pos[0] - flank) / fore, `#${seed} elbow/knee out clear of the flank`).toBeGreaterThan(0.5);
      }
    }
  });
});
