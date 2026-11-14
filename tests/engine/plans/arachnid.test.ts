import { describe, it, expect } from 'vitest';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import * as THREE from 'three';
import { fieldAt } from '../../../src/viewer/bodyField';
import { surfacePrims } from '../../../src/viewer/mouthLine';
import { eyeSeat, isOcellus } from '../../../src/viewer/eyeSeat';
import { coatMain } from '../../../src/viewer/palette';

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);

describe('arachnid', () => {
  it("a spider's leg is an arc from a high knee to a foot planted far out — its last link leaning out, not plumb", () => {
    // (dropped near plumb from the knee, the near leg seen down its own plane was one straight pole
    // through the spider's head)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'arachnid'));
      const parent = new Map<number, number>();
      for (const [a, b] of p.edges) parent.set(b, a);
      let legs = 0;
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'leg' || !n.terminal) return;
        const a = p.nodes[parent.get(i)!];
        const d = [n.pos[0] - a.pos[0], n.pos[1] - a.pos[1], n.pos[2] - a.pos[2]];
        const out = Math.hypot(d[0], d[2]);
        // well off plumb (the old near-plumb drop leaned 17°), going down
        expect(d[1], `#${seed} leg ${i} down`).toBeLessThan(0);
        expect(Math.atan2(out, -d[1]), `#${seed} leg ${i}`).toBeGreaterThan(0.4);
        legs++;
      });
      expect(legs, `#${seed}`).toBe(8);
    }
  });

  it("its eyes are a cluster of distinct glossy lenses on the front of its carapace, the front pair the biggest", () => {
    // (every pair at one height, a twelfth of a radian apart and each as big as a mammal's eye, each side's
    // three or four eyes ran together into one jagged black blot cut by its lids)
    for (const seed of [...SEEDS, 11, 12, 29]) {
      const p = grow(genomeOfMorphotype(seed, 'arachnid'));
      const prims = surfacePrims(p, 'hybrid');
      const eyes = p.nodes.map((n, i) => [n, i] as const).filter(([n]) => n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBeGreaterThanOrEqual(6);
      const seats = eyes.map(([n, i]) => {
        expect(isOcellus(p, i), `#${seed} a lens`).toBe(true);
        const s = eyeSeat(p, i, n.quat, n.radius);
        expect(s.flat ?? null, `#${seed} unpressed`).toBeNull();
        // half of it out of the carapace: a dome, neither buried nor a ball stood on it
        const c = s.centre!;
        const dome = 0.92 + fieldAt(prims, c[0], c[1], c[2]) / n.radius;
        expect(dome, `#${seed} dome`).toBeGreaterThan(0.35);
        expect(dome, `#${seed} dome`).toBeLessThan(0.7);
        return { c, r: n.radius };
      });
      // every lens clear of the next
      for (let a = 0; a < seats.length; a++)
        for (let b = a + 1; b < seats.length; b++) {
          const A = seats[a], B = seats[b];
          const gap = Math.hypot(A.c[0] - B.c[0], A.c[1] - B.c[1], A.c[2] - B.c[2]) - 0.92 * (A.r + B.r);
          expect(gap / Math.min(A.r, B.r), `#${seed} eyes ${a},${b} apart`).toBeGreaterThan(0.25);
        }
      // the front pair the biggest
      const rs = seats.map((s) => s.r).sort((x, y) => y - x);
      expect(rs[0] / rs[2], `#${seed} front pair`).toBeGreaterThanOrEqual(1.3);
    }
  });

  it('its legs taper from a stout femur to a fine tarsus, and sweep toward their own end of the body', () => {
    // (thin at the hip, its legs met the least radius by the knee: dowels; run straight out in one plane,
    // evenly fanned, from above they were the spokes of a compass rose)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'arachnid'));
      const parent = new Map<number, number>();
      for (const [a, b] of p.edges) parent.set(b, a);
      p.nodes.forEach((n, i) => {
        if (n.part?.kind !== 'leg' || !n.terminal) return;
        const chain = [i];
        while (parent.has(chain[0]) && p.nodes[parent.get(chain[0])!].part?.kind === 'leg') chain.unshift(parent.get(chain[0])!);
        const nodes = chain.map((j) => p.nodes[j]);
        const tip = nodes[nodes.length - 1].radius;
        expect(nodes[1].radius / tip, `#${seed} knee`).toBeGreaterThanOrEqual(1.4);
        expect(nodes[0].radius / tip, `#${seed} hip`).toBeGreaterThanOrEqual(1.9);
        // seen from above, the last link heads off from the femur's line
        const h = (a: number, b: number) => Math.atan2(nodes[b].pos[2] - nodes[a].pos[2], Math.abs(nodes[b].pos[0] - nodes[a].pos[0]));
        expect(Math.abs(h(nodes.length - 2, nodes.length - 1) - h(0, 1)), `#${seed} sweeps`).toBeGreaterThanOrEqual(0.25);
      });
    }
  });

  it('wears a brown coat, marked in its own hue or umber: never pale pink skin with mould on it', () => {
    const hsl = { h: 0, s: 0, l: 0 };
    const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
    for (const seed of [...SEEDS, 11, 12, 29]) {
      const g = genomeOfMorphotype(seed, 'arachnid');
      coatMain(g.palette).getHSL(hsl, THREE.SRGBColorSpace);
      expect(hsl.l, `#${seed} not pale`).toBeLessThanOrEqual(0.48);
      const kin = dist(g.palette.hueA, g.palette.hueB) <= 0.061;
      const umber = g.palette.hueB >= 0.05 && g.palette.hueB <= 0.11;
      expect(kin || umber, `#${seed} its own marks`).toBe(true);
    }
  });
});
