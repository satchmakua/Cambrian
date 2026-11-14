import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildShellGeometry } from '../../../src/viewer/smoothSkin';
import { footPlanOf } from '../../../src/viewer/feet';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const turtle = (seed: number) => grow(genomeOfMorphotype(seed, 'chelonian'));
const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
/** each leg as its chain of nodes, hip first */
function legsOf(p: Phenotype): Phenotype['nodes'][] {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const out: Phenotype['nodes'][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
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
function shellOf(p: Phenotype) {
  const g = buildShellGeometry(p, 'low')!;
  g.computeBoundingBox();
  const b = g.boundingBox!.clone();
  g.dispose();
  return b;
}

describe('chelonian', () => {
  it('its shell encloses it: the rim comes down to just above a flat underside', () => {
    // (the rim stood two-thirds of the body's depth above the belly, which hung below it as a ball:
    // a cap on a round animal)
    for (const seed of SEEDS) {
      const p = turtle(seed);
      const trunk = trunkOf(p);
      const depth = Math.max(...trunk.map((n) => n.radius * (n.scale?.[1] ?? 1)));
      const belly = Math.min(...trunk.map((n) => n.pos[1] - n.radius * (n.scale?.[1] ?? 1)));
      const shell = shellOf(p);
      expect((shell.min.y - belly) / depth, `#${seed} rim over the belly`).toBeLessThan(0.4);
      // …and the body under it is flat: half again as wide as it is deep, or more
      for (const n of trunk) expect((n.scale?.[0] ?? 1) / (n.scale?.[1] ?? 1), `#${seed} flat`).toBeGreaterThan(1.5);
    }
  });

  it('stands on short stout columns out from under the rim, with no ball of a thigh', () => {
    // (a lizard's haunch at each hip, half the leg's girth again, stood out under the rim as a ball as
    // big as the head; the legs held the shell high like a dog's)
    for (const seed of SEEDS) {
      const p = turtle(seed);
      const shell = shellOf(p);
      const ground = p.bounds.min[1];
      expect((shell.min.y - ground) / (shell.max.y - ground), `#${seed} short legs`).toBeLessThan(0.36);
      for (const leg of legsOf(p)) {
        expect(leg[0].radius / leg[1].radius, `#${seed} a column, not a haunch`).toBeLessThan(1.25);
        expect(leg[leg.length - 1].radius / leg[1].radius, `#${seed} stout to the foot`).toBeGreaterThan(0.65);
      }
      // on a tortoise's round stumps of feet, not a lizard's fan of toes or a frog's pads
      expect(footPlanOf(p), `#${seed}`).toBe('stump');
    }
  });

  it('has a short thin tail, if any, and a small head longer than it is wide', () => {
    // (a tail as thick as a leg drooped behind like a fifth limb; the head was a ball)
    for (const seed of SEEDS) {
      const p = turtle(seed);
      const trunk = trunkOf(p);
      const girth = Math.max(...trunk.map((n) => n.radius));
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      if (tail.length) {
        expect(tail[0].radius / girth, `#${seed} thin`).toBeLessThan(0.25);
        expect(tail[0].pos[2] - tail[tail.length - 1].pos[2], `#${seed} short`).toBeLessThan(0.5 * girth); // (it was up to 1.2 girths)
      }
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 2);
      expect(head.length, `#${seed}`).toBe(2);
      const long = head[1].pos[2] - head[0].pos[2] + head[0].radius + head[1].radius;
      const wide = 2 * Math.max(...head.map((n) => n.radius * (n.scale?.[0] ?? 1)));
      expect(long / wide, `#${seed} longer than wide`).toBeGreaterThan(1.45);
      expect(head[1].radius, `#${seed} tapers to the snout`).toBeLessThan(head[0].radius);
    }
  });

  it('a shelled body grows its legs as columns; the same body without a shell walks on a lizard’s limbs', () => {
    const g = genomeOfMorphotype(3, 'chelonian');
    const bare = { ...g, body: { ...g.body, appendages: g.body.appendages.filter((a) => a.terminal !== 'carapace') } };
    const shelled = legsOf(grow(g))[0];
    const naked = legsOf(grow(bare))[0];
    expect(shelled[0].radius / shelled[1].radius).toBeLessThan(1.25);
    // (its knee no higher than its hip under the shell; held up beside the body without it)
    expect(shelled[1].pos[1] - shelled[0].pos[1]).toBeLessThan(0.08 * shelled[0].radius);
    expect(naked[1].pos[1] - naked[0].pos[1]).toBeGreaterThan(0.08 * naked[0].radius);
    // (a crab's or a beetle's chitin shell is not a horn one: its legs are an arthropod's)
    const crab = grow(genomeOfMorphotype(3, 'crab'));
    expect(footPlanOf(crab)).toBeNull();
  });

  it("its shell swells out over each leg's root: the leg comes out from under it, not through its wall", () => {
    // (legs leaving the flat body at its widest line, as thick as a quarter of the shell, stood their
    // tops up above the shell's curve outside it: periscopes)
    for (let seed = 1; seed <= 4; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'chelonian'));
      const shell = buildShellGeometry(p, 'low')!;
      const pos = shell.getAttribute('position');
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const hips = p.nodes.filter((n, i) => n.part?.kind === 'leg' && p.nodes[parent.get(i)!].kind === 'spine');
      expect(hips.length, `#${seed}`).toBe(4);
      for (const h of hips) {
        // the leg runs out level to a knee at the shell's edge: the shell reaches past the knee's outer
        // side, level with it, front to back
        const k = p.nodes[p.edges.find(([a, b]) => a === p.nodes.indexOf(h) && p.nodes[b].part?.kind === 'leg')![1]];
        let reach = 0;
        for (let v = 0; v < pos.count; v++) {
          if (Math.abs(pos.getZ(v) - k.pos[2]) > 0.3 * k.radius || Math.abs(pos.getY(v) - k.pos[1]) > 0.3 * k.radius) continue;
          if (Math.sign(pos.getX(v)) === Math.sign(k.pos[0])) reach = Math.max(reach, Math.abs(pos.getX(v)));
        }
        expect(reach, `#${seed} over the knee`).toBeGreaterThan(Math.abs(k.pos[0]) + k.radius);
      }
      shell.dispose();
    }
  });
});
