import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { encodeGenome, decodeGenome } from '../../../src/engine/share';
import { buildFieldPrims, fieldAt, isHybridNode, webPanels } from '../../../src/viewer/bodyField';
import { eyeVariant } from '../../../src/viewer/partStyles';

// (the octopus read as a googly-eyed egg on a spider's legs: a ring of one glowing eye per arm round
// its mantle, over eight even sticks radiating straight out — a starburst from above)
const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const octopus = (seed: number) => grow(genomeOfMorphotype(seed, 'cephalopod'));
const mantle = (p: Phenotype) => p.nodes.find((n) => n.kind === 'spine')!;

/** each main arm's chain, root first (the arms of the ring rooted on the mantle, the longest kind) */
function arms(p: Phenotype): number[][] {
  const kids: number[][] = p.nodes.map(() => []);
  for (const [a, b] of p.edges) kids[a].push(b);
  const body = p.nodes.indexOf(mantle(p));
  const chains = kids[body]
    .filter((i) => p.nodes[i].part?.kind === 'tentacle')
    .map((i) => {
      const c = [i];
      for (let cur = i; ; ) {
        const next = kids[cur].find((k) => p.nodes[k].part?.kind === 'tentacle');
        if (next === undefined) break;
        c.push(next);
        cur = next;
      }
      return c;
    });
  const longest = Math.max(...chains.map((c) => c.length));
  return chains.filter((c) => c.length === longest);
}

describe('octopus', () => {
  it('has two eyes, a pair either side of the front of its head, low on the mantle — not a ring of them', () => {
    for (const seed of SEEDS) {
      const p = octopus(seed);
      const B = mantle(p);
      const halfH = B.radius * (B.scale?.[1] ?? 1);
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBe(2);
      const [a, b] = eyes;
      // mirrored across the midline, facing forward of the sides
      expect(a.pos[0] + b.pos[0], `#${seed} mirrored`).toBeCloseTo(0, 6);
      expect(a.pos[1], `#${seed} level`).toBeCloseTo(b.pos[1], 6);
      expect(Math.abs(a.pos[0]), `#${seed} apart`).toBeGreaterThan(0.3 * B.radius);
      expect(a.pos[2] - B.pos[2], `#${seed} toward the front`).toBeGreaterThan(0);
      // low on the head, above the arms: below the mantle's middle
      expect(a.pos[1] - B.pos[1], `#${seed} low`).toBeLessThan(0);
      expect(a.pos[1] - B.pos[1], `#${seed} above the arms`).toBeGreaterThan(-0.5 * halfH);
      // gold with a bar of a pupil, not a glowing disc
      expect(eyeVariant(a.part?.style ?? 0), `#${seed}`).toBe('slit');
    }
  });

  it("its arms are broad where they leave the head and drawn out to fine tips", () => {
    for (const seed of SEEDS) {
      const p = octopus(seed);
      const B = mantle(p);
      const halfW = B.radius * Math.max(B.scale?.[0] ?? 1, B.scale?.[2] ?? 1);
      for (const c of arms(p)) {
        const root = p.nodes[c[0]].radius;
        const tip = p.nodes[c[c.length - 1]].radius;
        expect(root / halfW, `#${seed} root`).toBeGreaterThan(0.24);
        expect(tip / root, `#${seed} tip`).toBeLessThan(0.3);
        expect(c.length, `#${seed} links`).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('each arm bends its own way: from above, not a starburst of identical arcs', () => {
    for (const seed of SEEDS) {
      const p = octopus(seed);
      const B = mantle(p);
      // how far each arm's tip has swung round from its root's heading (about the vertical)
      const swing = arms(p).map((c) => {
        const r = p.nodes[c[0]].pos, t = p.nodes[c[c.length - 1]].pos;
        const a0 = Math.atan2(r[0] - B.pos[0], r[2] - B.pos[2]);
        const a1 = Math.atan2(t[0] - B.pos[0], t[2] - B.pos[2]);
        return Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
      });
      const mean = swing.reduce((s, x) => s + x, 0) / swing.length;
      const spread = Math.sqrt(swing.reduce((s, x) => s + (x - mean) ** 2, 0) / swing.length);
      expect(spread, `#${seed} spread`).toBeGreaterThan(0.04);
      // …and none bends down into the floor: every arm still lies low (the bodyplan test holds the rest)
      for (const c of arms(p)) for (const i of c) expect(p.nodes[i].pos[1], `#${seed}`).toBeLessThan(B.pos[1]);
    }
  });

  it('a web of skin joins its arms near their roots, a panel between each arm and the next', () => {
    for (const seed of SEEDS) {
      const p = octopus(seed);
      const ring = arms(p);
      const webs = webPanels(p, isHybridNode);
      expect(webs.length, `#${seed}`).toBe(ring.length);
      const f = buildFieldPrims(p, 'hybrid');
      f.k = 0.05;
      // the skin is closed between two neighbouring arms, a little out from the mantle: midway between
      // their second nodes, at their height
      const B = mantle(p);
      const ang = (c: number[]) => Math.atan2(p.nodes[c[0]].pos[0] - B.pos[0], p.nodes[c[0]].pos[2] - B.pos[2]);
      const sorted = [...ring].sort((u, v) => ang(u) - ang(v));
      let closed = 0;
      for (let k = 0; k < sorted.length; k++) {
        const a = p.nodes[sorted[k][1]].pos, b = p.nodes[sorted[(k + 1) % sorted.length][1]].pos;
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        if (fieldAt(f, m[0], m[1], m[2]) < 0) closed++;
      }
      expect(closed, `#${seed}`).toBe(sorted.length);
      // and thinner than the arms it joins: the arms stand on it as ridges
      for (const w of webs) expect(w.r[1], `#${seed} thin`).toBeLessThan(0.6 * Math.min(...ring.map((c) => p.nodes[c[0]].radius)));
    }
  });

  it('a shared octopus regrows with its two eyes and its web', () => {
    const g = genomeOfMorphotype(4, 'cephalopod');
    const back = decodeGenome(encodeGenome(g));
    expect(back).toEqual(g);
    const p = grow(back);
    expect(p.nodes.filter((n) => n.terminal === 'eye').length).toBe(2);
    expect(webPanels(p, isHybridNode).length).toBeGreaterThan(0);
  });
});
