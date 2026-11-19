import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';

const sub = (a: readonly number[], b: readonly number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: readonly number[]) => Math.hypot(a[0], a[1], a[2]);
const deg = (x: number) => (x * 180) / Math.PI;

/** one side's antenna, base to tip, and the head node it grows from */
function feeler(p: Phenotype) {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const idx = p.nodes.map((_, i) => i).filter((i) => p.nodes[i].part?.kind === 'antenna' && p.nodes[i].pos[0] >= 0);
  return { pos: idx.map((i) => p.nodes[i].pos), head: p.nodes[parent.get(idx[0])!] };
}

describe('an insect', () => {
  it('carries long elbowed feelers: a scape up from the crown, the flagellum bent forward from it', () => {
    // (one 0.2 link a side, about a head's radius long and straight, they were cigarette butts)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'insectoid'));
      const { pos, head } = feeler(p);
      if (pos.length === 0) continue; // (5% grow none)
      expect(pos.length, `#${seed} links`).toBe(3);
      const scape = sub(pos[1], pos[0]);
      const flag = sub(pos[2], pos[1]);
      expect((len(scape) + len(flag)) / head.radius, `#${seed} length`).toBeGreaterThan(2.5);
      const elbow = deg(Math.acos((scape[0] * flag[0] + scape[1] * flag[1] + scape[2] * flag[2]) / len(scape) / len(flag)));
      expect(elbow, `#${seed} elbow`).toBeGreaterThan(40);
      expect(deg(Math.asin(scape[1] / len(scape))), `#${seed} scape rises`).toBeGreaterThan(20);
      expect(flag[2], `#${seed} flagellum reaches forward`).toBeGreaterThan(0);
      // its tip stays off the ground (well above the lowest point of the body and legs)
      const floor = Math.min(...p.nodes.map((n) => n.pos[1] - n.radius));
      expect(pos[2][1] - floor, `#${seed} tip off the ground`).toBeGreaterThan(0.5);
    }
  });

  it('stands on legs with a stout femur thinning to a fine tarsus, not dowels', () => {
    // (thin at the hip, every leg met R_MIN by the knee: tibia and tarsus one girth)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'insectoid'));
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'leg' || n.terminal !== 'claw') return;
        const chain = [i];
        while (p.nodes[parent.get(chain[0])!]?.part?.kind === 'leg') chain.unshift(parent.get(chain[0])!);
        const r = chain.map((k) => p.nodes[k].radius);
        expect(r[1] / r[r.length - 1], `#${seed} knee / tarsus`).toBeGreaterThan(1.3);
        expect(r[r.length - 2] / r[r.length - 1], `#${seed} ankle / tarsus`).toBeGreaterThan(1.0);
      });
    }
  });

  it('wears a dark cuticle, plain, banded or spotted — never a reticulate camouflage', () => {
    // (light lime green under a clearcoat was a plastic toy; reticulate on it, mould)
    for (let seed = 1; seed <= 40; seed++) {
      const g = genomeOfMorphotype(seed, 'insectoid');
      expect(g.covering.pattern, `#${seed}`).not.toBe('reticulate');
      expect(g.palette.light, `#${seed}`).toBeLessThanOrEqual(0.5); // (an exotic morph keeps its draw)
      expect(g.covering.sheen, `#${seed}`).toBeLessThanOrEqual(0.72);
    }
  });
});
