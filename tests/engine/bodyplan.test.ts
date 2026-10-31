import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';

const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);

/** Each leg chain (hip → foot) as node lists, with the hip's parent (the trunk node it hangs off). */
function legChains(p: Phenotype) {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const out: { nodes: Phenotype['nodes']; attachT: number }[] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
    const chain = [n];
    let cur = i;
    while (parent.has(cur) && p.nodes[parent.get(cur)!].part?.kind === 'leg') {
      cur = parent.get(cur)!;
      chain.unshift(p.nodes[cur]);
    }
    const trunk = trunkOf(p);
    const z0 = trunk[0].pos[2];
    const z1 = trunk[trunk.length - 1].pos[2];
    out.push({ nodes: chain, attachT: (chain[0].pos[2] - z0) / Math.max(z1 - z0, 1e-6) });
  });
  return out;
}

describe('body plans', () => {
  it('a quadruped is deepest at the chest, not the rump', () => {
    // the trunk grows rear → front, and the old taper below 1 shrank it toward the shoulders: every
    // cat, dog, deer and bear was a pear with its neck growing out of the thinnest section
    for (const id of ['felid', 'canid', 'ungulate', 'ursid']) {
      for (let seed = 1; seed <= 12; seed++) {
        const t = trunkOf(grow(genomeOfMorphotype(seed, id)));
        expect(t[t.length - 1].radius, `${id} #${seed}`).toBeGreaterThan(t[0].radius);
      }
    }
  });

  it('a fish is deepest toward its head and thins to its tail stalk', () => {
    for (const id of ['fish', 'shark']) {
      for (let seed = 1; seed <= 12; seed++) {
        const t = trunkOf(grow(genomeOfMorphotype(seed, id)));
        const peak = t.reduce((b, n, i) => (n.radius > t[b].radius ? i : b), 0);
        expect(peak / (t.length - 1), `${id} #${seed}`).toBeGreaterThanOrEqual(0.5);
        expect(t[0].radius, `${id} #${seed}`).toBeLessThan(t[t.length - 1].radius);
      }
    }
  });

  it('a snake is an even rope that lies flat and runs on into a tail', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'serpent'));
      const t = trunkOf(p);
      const r = t.map((n) => n.radius);
      // (it was a cone: the neck 34% of the rump)
      expect(Math.min(...r) / Math.max(...r), `#${seed}`).toBeGreaterThan(0.6);
      const ys = t.map((n) => n.pos[1]);
      expect(Math.max(...ys) - Math.min(...ys), `#${seed}`).toBeLessThan(Math.max(...r) * 2);
      expect(p.nodes.some((n) => n.part?.kind === 'tail'), `#${seed}`).toBe(true);
    }
  });

  it('a front-heavy taper moves the bulk forward without adding any', () => {
    const g = genomeOfMorphotype(1, 'felid');
    const flat = grow({ ...g, body: { ...g.body, taper: 1 } });
    const heavy = grow({ ...g, body: { ...g.body, taper: 1.15 } });
    const peak = (p: Phenotype) => Math.max(...trunkOf(p).map((n) => n.radius));
    expect(peak(heavy)).toBeCloseTo(peak(flat), 6);
    expect(trunkOf(heavy)[0].radius).toBeLessThan(trunkOf(flat)[0].radius);
  });

  it('cats, dogs and deer stand on their legs, well clear of the ground', () => {
    for (const [id, min] of [['felid', 0.55], ['canid', 0.55], ['ungulate', 0.5], ['ursid', 0.25]] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const t = trunkOf(p);
        const belly = Math.min(...t.map((n) => n.pos[1] - n.radius * (n.scale?.[1] ?? 1)));
        const back = Math.max(...t.map((n) => n.pos[1] + n.radius * (n.scale?.[1] ?? 1)));
        const ground = Math.min(...p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').map((n) => n.pos[1]));
        // (the legs below the belly were 2–42% of the trunk's depth — a capybara on castors)
        expect((belly - ground) / (back - belly), `${id} #${seed}`).toBeGreaterThan(min);
      }
    }
  });

  it("a quadruped's elbow sits behind its shoulder; its knee in front of its hip", () => {
    for (const id of ['felid', 'canid', 'ungulate', 'ursid']) {
      for (let seed = 1; seed <= 12; seed++) {
        for (const leg of legChains(grow(genomeOfMorphotype(seed, id)))) {
          const [hip, joint] = leg.nodes;
          if (leg.attachT > 0.5) expect(joint.pos[2], `${id} #${seed} fore`).toBeLessThan(hip.pos[2]);
          else expect(joint.pos[2], `${id} #${seed} hind`).toBeGreaterThan(hip.pos[2]);
        }
      }
    }
  });

  it('a frog: a broad flat head as wide as its shoulders, and hind legs folded in a Z beside the body', () => {
    // (a pear-shaped sack under a narrow conical head, on hind legs planted like stilts)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'anuran'));
      const halfW = (ns: Phenotype['nodes']) => Math.max(...ns.map((n) => n.radius * (n.scale?.[0] ?? 1)));
      const halfH = (ns: Phenotype['nodes']) => Math.max(...ns.map((n) => n.radius * (n.scale?.[1] ?? 1)));
      const head = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) > 0);
      expect(head.length, `#${seed}`).toBeGreaterThan(0);
      expect(halfW(head), `#${seed}`).toBeGreaterThan(0.8 * halfW(trunkOf(p)));
      expect(halfH(head), `#${seed}`).toBeLessThan(halfW(head)); // flat, not domed
      const hind = legChains(p).filter((l) => l.attachT < 0.5);
      expect(hind.length, `#${seed}`).toBeGreaterThan(0);
      for (const { nodes: [hip, knee, ankle] } of hind) {
        expect(knee.pos[2], `#${seed} knee forward`).toBeGreaterThan(hip.pos[2]);
        expect(ankle.pos[2], `#${seed} shin folds back`).toBeLessThan(knee.pos[2]);
      }
    }
  });
});

