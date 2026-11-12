import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const ry = (n: Phenotype['nodes'][number]) => n.radius * (n.scale?.[1] ?? 1);
const rx = (n: Phenotype['nodes'][number]) => n.radius * (n.scale?.[0] ?? 1);
/** each leg as its chain of nodes, hip first, on the creature's right side */
function legsOf(p: Phenotype): Phenotype['nodes'][] {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const out: Phenotype['nodes'][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg' || n.pos[0] < 0) return;
    const chain = [n];
    let k = parent.get(i)!;
    while (p.nodes[k].part?.kind === 'leg') {
      chain.unshift(p.nodes[k]);
      k = parent.get(k)!;
    }
    out.push(chain);
  });
  return out;
}

describe('a walking sprawler: lizard, crocodile, a frog’s arms', () => {
  it('each limb rises out of the flank to an elbow or a knee held up beside the body, then angles down and out', () => {
    // (run level out of the flank under a haunch that swallowed it, then straight down: a stub on a
    // table leg, a push-up stance with no elbow or knee to be seen)
    const cases: [string, (leg: Phenotype['nodes'], p: Phenotype) => boolean][] = [
      ['lizard', () => true],
      ['crocodilian', () => true],
      // (a frog's hind legs are a jumper's, folded in a Z: only its arms walk)
      ['anuran', (leg, p) => leg[0].pos[2] >= Math.max(...legsOf(p).map((l) => l[0].pos[2]))],
    ];
    for (const [id, which] of cases) {
      for (const seed of SEEDS) {
        const p = grow(genomeOfMorphotype(seed, id));
        const legs = legsOf(p).filter((l) => which(l, p));
        expect(legs.length, `${id} #${seed}`).toBeGreaterThan(0);
        for (const leg of legs) {
          const [hip, knee] = leg;
          const foot = leg[leg.length - 1];
          expect(knee.pos[1] - hip.pos[1], `${id} #${seed} the knee held up`).toBeGreaterThan(0.08 * hip.radius);
          expect(knee.pos[0], `${id} #${seed} out beside the body`).toBeGreaterThan(hip.pos[0] + 0.8 * hip.radius);
          expect(foot.pos[0], `${id} #${seed} the foot planted wide of the knee`).toBeGreaterThan(knee.pos[0] + 0.15 * hip.radius);
          // the upper limb a limb, not a haunch: its root no stouter than its taper makes it (it was
          // twice the elbow's girth: a ball in the flank)
          expect(leg[0].radius / leg[1].radius, `${id} #${seed} no ball at the hip`).toBeLessThan(1.6);
        }
      }
    }
  });

  it("a lizard's head is a low wedge on a neck narrower than its shoulders, never taller than its body", () => {
    // (a 'wedge' skull drawn tall and narrow stood twice the trunk's depth: a helmet, a fish's head
    // on a lizard; and the trunk tapered to its shoulders so the neck bulged out ahead of them)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'lizard'));
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
      const last = Math.max(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment ?? 0));
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === last);
      const neck = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
      const bodyDepth = Math.max(...trunk.map(ry));
      expect(Math.max(...head.map(ry)) / bodyDepth, `#${seed} no taller than the body`).toBeLessThan(1.05);
      expect(rx(head[0]) / ry(head[0]), `#${seed} wider than tall`).toBeGreaterThan(1.0);
      const shoulders = trunk.reduce((a, b) => (b.pos[2] > a.pos[2] ? b : a));
      for (const n of neck) expect(n.radius, `#${seed} neck`).toBeLessThan(shoulders.radius * 1.02);
    }
  });

  it("a tortoise's legs keep their columns: its shell is over them", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const p = grow(genomeOfMorphotype(seed, 'chelonian'));
      for (const leg of legsOf(p)) expect(leg[1].pos[1] - leg[0].pos[1], `#${seed}`).toBeLessThan(0.08 * leg[0].radius);
    }
  });
});
