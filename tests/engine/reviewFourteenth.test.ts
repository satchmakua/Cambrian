import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildFieldPrims } from '../../src/viewer/bodyField';
import { podomeres } from '../../src/viewer/limbTubes';

/** the right arm's hand, from the arm's first node */
function hand(p: Phenotype): [number, number, number] {
  const arm = p.nodes.map((n, i) => [n, i] as const).filter(([n]) => n.part?.kind === 'arm' && n.pos[0] > 0);
  const a = arm[0][0].pos, h = arm[arm.length - 1][0].pos;
  return [h[0] - a[0], h[1] - a[1], h[2] - a[2]];
}
const at = (id: string, seed: number, pitch: number) => {
  const g = genomeOfMorphotype(seed, id);
  g.body.curve = [pitch, g.body.curve[1]];
  return grow(g);
};
const moved = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('what a review of the fourteenth look found', () => {
  it("a theropod's arm folds by degrees with its trunk's pitch, and an ape's long arm never folds", () => {
    // (switched on at one pitch, a hand jumped a third of its reach between two near-identical genomes; an ape
    // mutated to a level back swept its long arms back under it)
    for (const seed of [1, 5]) {
      for (const id of ['biped', 'primate']) {
        expect(moved(hand(at(id, seed, -0.2699)), hand(at(id, seed, -0.2705))), `${id} #${seed}`).toBeLessThan(0.03);
      }
      const ape = genomeOfMorphotype(seed, 'primate');
      const level = at('primate', seed, -0.1);
      const knuckled = grow(ape);
      // (on a level back the ape's arm hangs at its own curl, not folded back toward its hips)
      expect(hand(level)[2], `primate #${seed}`).toBeGreaterThan(hand(knuckled)[2] - 0.6);
    }
  });

  it("a long bred theropod arm folds once at its elbow, its links past it running on, not coiling back", () => {
    // (each link past the elbow folded again: at six links the hand pointed back at the shoulder, through the chest)
    for (const seed of [1, 2, 3]) {
      const g = genomeOfMorphotype(seed, 'biped');
      const arm = g.body.appendages.find((a) => a.kind === 'arm')!;
      arm.segments = 6;
      const p = grow(g);
      const links = p.nodes.filter((n) => n.part?.kind === 'arm' && n.pos[0] > 0);
      for (let k = 2; k < links.length; k++) {
        const d = [0, 1, 2].map((i) => links[k].pos[i] - links[k - 1].pos[i]);
        // every link past the elbow still points forward of straight down
        expect(d[2], `biped #${seed} link ${k}`).toBeGreaterThan(-0.02);
      }
    }
  });

  it("one pair of beast's feet bred onto an arthropod leaves its other legs jointed", () => {
    // (one hooved pair stripped the podomeres from every leg on the body)
    for (const seed of [1, 2, 3]) {
      const g = genomeOfMorphotype(seed, 'insectoid');
      const legs = g.body.child?.appendages ?? g.body.appendages;
      const leg = [g.body, g.body.child, g.body.child?.child].flatMap((s) => s?.appendages ?? []).find((a) => a.kind === 'leg')!;
      leg.terminal = 'hoof';
      expect(legs).toBeDefined();
      const p = grow(g);
      const f = buildFieldPrims(p, 'hybrid');
      const podo = podomeres(p, f);
      expect(podo, `insect #${seed}`).not.toBeNull();
      // the hooved legs themselves are smooth
      let onHoof = 0;
      for (let m = 0; m < f.nc; m++) if (podo![m] && p.nodes[f.ib[m]].terminal === 'hoof') onHoof++;
      expect(onHoof, `insect #${seed}`).toBe(0);
    }
  });
});
