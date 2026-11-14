import { describe, it, expect } from 'vitest';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../../src/engine/random';
import { buildMeshData } from '../../../src/viewer/meshData';
import { hornReachOf } from '../../../src/viewer/CreatureMesh';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const deer = (seed: number) => {
  const p = grow(genomeOfMorphotype(seed, 'ungulate'));
  const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
  const z0 = Math.min(...trunk.map((n) => n.pos[2] - n.radius));
  const z1 = Math.max(...trunk.map((n) => n.pos[2] + n.radius));
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const hips = p.nodes.filter((n, i) => n.part?.kind === 'leg' && p.nodes[parent.get(i)!].kind === 'spine');
  return { p, trunk, z0, z1, hips, parent };
};

describe('ungulate', () => {
  it('its legs frame its trunk: the hind under the back of the rump, the fore under the front of the chest', () => {
    // (all four bunched under its middle, hind a quarter of the way along and fore at seven tenths:
    // a barrel balanced on a trestle, overhanging it at both ends)
    for (const seed of SEEDS) {
      const { z0, z1, hips } = deer(seed);
      const at = hips.map((h) => (h.pos[2] - z0) / (z1 - z0)).sort((a, b) => a - b);
      expect(at[0], `#${seed} hind`).toBeLessThan(0.19);
      expect(at[at.length - 1], `#${seed} fore`).toBeGreaterThan(0.79);
    }
  });

  it('its legs drop straight under the body, hooves within its width — not splayed in an A', () => {
    // (the hooves stood near twice the body's width apart; from above the legs stuck out sideways)
    for (const seed of SEEDS) {
      const { p, trunk } = deer(seed);
      const halfW = Math.max(...trunk.map((n) => n.radius * (n.scale?.[0] ?? 1)));
      for (const h of p.nodes.filter((n) => n.terminal === 'hoof')) expect(Math.abs(h.pos[0]) / halfW, `#${seed}`).toBeLessThan(1.2);
    }
  });

  it('its short tail leaves the top of the croup and falls away behind it — not a peg at belly height', () => {
    for (const seed of SEEDS) {
      const { p, trunk } = deer(seed);
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      if (!tail.length) continue;
      const rump = trunk.reduce((a, b) => (b.pos[2] < a.pos[2] ? b : a));
      expect(tail[0].pos[1] - rump.pos[1], `#${seed} set high`).toBeGreaterThan(0.3 * rump.radius);
      const tip = tail[tail.length - 1];
      expect(tip.pos[1], `#${seed} falls away`).toBeLessThan(tail[0].pos[1] + 0.05);
      expect(tip.pos[2], `#${seed} behind`).toBeLessThan(tail[0].pos[2]);
    }
  });

  it('only a hooved leg roots on toward the trunk’s ends', () => {
    // (the rule is a hoof's: every other plan's legs keep their slots)
    for (const id of MORPHOTYPE_IDS) {
      if (id === 'ungulate') continue;
      for (let seed = 1; seed <= 6; seed++) {
        const g = genomeOfMorphotype(seed, id);
        for (let s: typeof g.body | undefined = g.body; s; s = s.child) for (const a of s.appendages) expect(a.terminal, `${id} #${seed}`).not.toBe('hoof');
      }
    }
  });

  it('carries its neck as one straight column from its shoulders, deep at its root, and bows its head from the poll', () => {
    // (bent a little at every link, a neck of four or five rose from level out of the chest to plumb at the
    // throat — a llama's J — one even thin tube, with the head held level on top of it)
    for (const seed of SEEDS) {
      const { p } = deer(seed);
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
      const head = spine.filter((n) => n.segment === last);
      const C = head[0], tip = head[head.length - 1];
      const chain = [...neck, C];
      const angles: number[] = [];
      for (let i = 1; i < neck.length; i++) angles.push(Math.atan2(chain[i].pos[1] - chain[i - 1].pos[1], chain[i].pos[2] - chain[i - 1].pos[2]));
      expect(Math.max(...angles) - Math.min(...angles), `#${seed} straight`).toBeLessThan(0.1);
      const rise = Math.atan2(C.pos[1] - neck[0].pos[1], C.pos[2] - neck[0].pos[2]);
      expect(rise, `#${seed} carried forward`).toBeGreaterThan(0.6);
      expect(rise, `#${seed} not upright`).toBeLessThan(0.95);
      expect(Math.atan2(tip.pos[1] - C.pos[1], tip.pos[2] - C.pos[2]), `#${seed} head bowed`).toBeLessThan(-0.35);
      expect(neck[neck.length - 1].radius / neck[0].radius, `#${seed} slim at the throat`).toBeLessThan(0.65);
    }
  });

  it("its foreleg's cannon drops plumb from its knee to its hoof", () => {
    // (a paw's forward pastern fold, on a leg whose third link is the cannon, slanted the lower leg 25°)
    for (const seed of SEEDS) {
      const { p, parent } = deer(seed);
      p.nodes.forEach((n, i) => {
        if (n.terminal !== 'hoof') return;
        const k = p.nodes[parent.get(i)!];
        const fore = n.pos[2] > 0 && Math.abs(n.pos[2]) > 0.1;
        if (!fore) return;
        const lean = Math.atan2(Math.abs(n.pos[2] - k.pos[2]), Math.abs(n.pos[1] - k.pos[1]));
        expect(lean, `#${seed}`).toBeLessThan((3 * Math.PI) / 180);
      });
    }
  });

  it("wears horns near its head's length that rise and sweep back off its crown — not two stubs", () => {
    // (on one link a horn was drawn 3.6 tip radii long whatever its gene said, leaning forward of upright)
    let checked = 0;
    for (const seed of SEEDS) {
      const { p } = deer(seed);
      for (const f of buildMeshData(p).features.filter((x) => x.kind === 'horn')) {
        const { reach } = hornReachOf(p, f);
        expect(reach.len!, `#${seed} long`).toBeGreaterThanOrEqual(0.45);
        if (reach.aim) expect(reach.aim[2], `#${seed} swept back`).toBeLessThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(4);
  });

  it('wears a rufous coat: never a pale salmon one', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = genomeOfMorphotype(seed, 'ungulate');
      if (g.palette.sat < 0.2) continue; // (a rare melanistic or leucistic morph, charcoal or cream)
      expect(0.18 + 0.72 * g.palette.light, `#${seed}`).toBeLessThanOrEqual(0.55);
    }
  });
});
