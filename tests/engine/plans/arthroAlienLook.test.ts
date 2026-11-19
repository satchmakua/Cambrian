import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt, myriapodTergites, withoutCones } from '../../../src/viewer/bodyField';
import { buildMandibles } from '../../../src/viewer/mouths/mandibles';
import { OCELLI_BEAD, OCELLI_CLUSTER } from '../../../src/viewer/CreatureMesh';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1).concat([29]);
const alien = (seed: number) => grow(genomeOfMorphotype(seed, 'arthro-alien'));
const ringsOf = (p: Phenotype) =>
  [...new Set(p.edges.filter(([a, b]) => p.nodes[a].kind === 'spine' && (p.nodes[a].segment ?? 0) === 0 && p.nodes[b].part?.kind === 'leg').map(([a]) => a))].sort((a, b) => a - b);

describe('arthro-alien reads as an armoured alien, not a toy caterpillar', () => {
  it('each ring wears a tergite: a flat back, its widest edge high on the flank', () => {
    // HEAD: the section at a ring is an ellipse — widest at the axis (y ≈ -0.1 hh), the back falling to
    // 0.63 hh at 0.8 of the half-width. Plated: widest ≥ 0.4 hh up the flank, ≥ 0.85 hh there.
    for (const seed of SEEDS) {
      const p = alien(seed);
      const full = buildFieldPrims(p, 'hybrid');
      full.k = 0.34 * full.meanR;
      const body = withoutCones(full, (m) => p.nodes[full.ia[m]].kind === 'spine' && p.nodes[full.ib[m]].kind === 'spine');
      const rings = ringsOf(p);
      expect(myriapodTergites(p).length, `#${seed}`).toBe(rings.length);
      for (const i of rings.slice(1, -1)) {
        const n = p.nodes[i];
        const hw = n.radius * (n.scale?.[0] ?? 1), hh = n.radius * (n.scale?.[1] ?? 1);
        const z = n.pos[2];
        const inside = (x: number, y: number) => fieldAt(body, x, n.pos[1] + y, z) <= 0;
        let W = 0, Wy = 0;
        for (let yy = -12; yy <= 12; yy++) for (let xs = 0; xs <= 150; xs++) {
          const x = (xs / 100) * hw * 1.5, y = (yy / 10) * hh;
          if (inside(x, y) && x > W) { W = x; Wy = y; }
        }
        let top = -Infinity;
        for (let s = 0; s <= 280; s++) { const y = hh * (1.4 - s / 100); if (inside(0.8 * hw, y)) { top = y; break; } }
        expect(Wy / hh, `#${seed} ring ${i} edge height`).toBeGreaterThan(0.4);
        expect(W / hw, `#${seed} ring ${i} plate breadth`).toBeGreaterThan(1.05);
        expect(top / hh, `#${seed} ring ${i} flat back`).toBeGreaterThan(0.85);
      }
    }
  });

  it('no other body plan grows tergites', () => {
    for (const id of MORPHOTYPE_IDS) {
      if (id === 'arthro-alien') continue;
      for (let seed = 1; seed <= 4; seed++) expect(myriapodTergites(grow(genomeOfMorphotype(seed, id))).length, `${id} #${seed}`).toBe(0);
    }
  });

  it('its cuticle is dark and sober: no camouflage, no lime, its marks its own hue or umber', () => {
    // HEAD #29: hueA 0.30 (lime) under hueB 0.60 (blue) reticulate, light 0.41, sheen 0.81
    const gap = (a: number, b: number) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
    for (let seed = 1; seed <= 60; seed++) {
      const g = genomeOfMorphotype(seed, 'arthro-alien');
      expect(g.covering.pattern, `#${seed}`).not.toBe('reticulate');
      expect(g.palette.light, `#${seed} dark`).toBeLessThanOrEqual(0.35);
      expect(g.covering.sheen, `#${seed} lacquer, not glass`).toBeLessThanOrEqual(0.6);
      const umber = g.palette.hueB >= 0.06 && g.palette.hueB <= 0.106;
      expect(gap(g.palette.hueA, g.palette.hueB) <= 0.061 || umber, `#${seed} sober marks`).toBe(true);
    }
  });

  it('its feelers root on the front of the head, well clear of its eyes', () => {
    // HEAD: 23–38° apart about the head's centre (the feeler's root all but touching the eye); now 42–56°
    for (const seed of SEEDS) {
      const p = alien(seed);
      const head = p.nodes.find((n) => n.kind === 'spine' && n.segment === 1)!;
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const eye = p.nodes.find((n) => n.terminal === 'eye' && n.pos[0] > 0)!;
      const root = p.nodes.find((n, i) => n.part?.kind === 'antenna' && n.pos[0] > 0 && p.nodes[parent.get(i)!].part?.kind !== 'antenna')!;
      const u = (v: readonly number[]) => { const d = [0, 1, 2].map((k) => v[k] - head.pos[k]); const l = Math.hypot(...d); return d.map((x) => x / l); };
      const a = u(eye.pos), b = u(root.pos);
      expect(Math.acos(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]), `#${seed}`).toBeGreaterThan(0.7);
      expect(root.pos[2], `#${seed} feeler ahead of the eye`).toBeGreaterThan(eye.pos[2]);
    }
  });

  it('its forcipules close level under the head — not tusks hanging below it', () => {
    // HEAD: the blade tips droop 0.12–0.24 of the mouth's radius below their hinges
    for (const seed of SEEDS) {
      const p = alien(seed);
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const b = buildMandibles(p, idx, [], false, 'hybrid')!;
      for (const path of b.bladePaths) {
        const h = path[0], t = path[path.length - 1];
        const drop = -[0, 1, 2].reduce((s, k) => s + (t[k] - h[k]) * b.spec.up[k], 0);
        expect(drop / b.r, `#${seed}`).toBeLessThan(0.05);
      }
    }
    // (an insect's jaws keep their droop)
    const p = grow(genomeOfMorphotype(11, 'insectoid'));
    const b = buildMandibles(p, p.nodes.findIndex((n) => n.terminal === 'mouth'), [], false, 'hybrid')!;
    const h = b.bladePaths[0][0], t = b.bladePaths[0][b.bladePaths[0].length - 1];
    expect(-[0, 1, 2].reduce((s, k) => s + (t[k] - h[k]) * b.spec.up[k], 0) / b.r).toBeGreaterThan(0.1);
  });

  it("its eyes are clusters of small lenses, smaller than one compound dome", () => {
    // the compound dome seated COMPOUND_DEPTH (0.4) deep shows a disc 2·√(1−0.4²) = 1.83 r across
    let extent = 0;
    for (const [x, y] of OCELLI_CLUSTER) extent = Math.max(extent, Math.hypot(x, y) + OCELLI_BEAD);
    expect(2 * extent).toBeLessThan(1.5);
    expect(OCELLI_CLUSTER.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < OCELLI_CLUSTER.length; i++)
      for (let j = i + 1; j < OCELLI_CLUSTER.length; j++) {
        const [a, b] = [OCELLI_CLUSTER[i], OCELLI_CLUSTER[j]];
        expect(Math.hypot(a[0] - b[0], a[1] - b[1]), 'lenses apart').toBeGreaterThan(1.9 * OCELLI_BEAD);
      }
  });
});
