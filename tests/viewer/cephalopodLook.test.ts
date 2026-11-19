import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildFieldPrims, fieldAt, isHybridNode, webPanels } from '../../src/viewer/bodyField';
import { drawnSkin } from '../../src/viewer/smoothSkin';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const mantle = (p: Phenotype) => p.nodes.find((n) => n.kind === 'spine')!;

/** an eye-spot's ring as creatureMaterial's patternField (type 4, ocelli) draws it: its cells are 2/scale body
 *  units across (q = p · scale · 0.5) and the ring lies at 0.32 ± 0.06 of a cell from the spot's centre — so
 *  its outer diameter is 2 · 0.38 · 2/scale body units */
const OCELLUS_RING_D = (scale: number) => (2 * 0.38 * 2) / scale;

/** a panel's own local axis (its run outward, Z) in body space */
function runOf(q: readonly number[]): [number, number, number] {
  const [x, y, z, w] = q;
  return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
}

describe("an octopus's look", () => {
  it('wears small eye-spots, far smaller than its eyes: no pair of spectacles round its face', () => {
    // (on the default scale an eye-spot's ring was its own eye's size or more — 0.6–1.1 bu on a 1.3–2 bu mantle —
    // and the mirrored pair either side of its front sat between its eyes: a pair of spectacles)
    for (let seed = 1; seed <= 40; seed++) {
      const g = genomeOfMorphotype(seed, 'cephalopod');
      const p = grow(g);
      const B = mantle(p);
      const eye = p.nodes.find((n) => n.terminal === 'eye')!;
      const width = 2 * B.radius * Math.min(B.scale?.[0] ?? 1, B.scale?.[2] ?? 1);
      const ring = OCELLUS_RING_D(g.covering.patternScale);
      expect(ring, `#${seed} ring against its eye`).toBeLessThan(0.55 * 2 * eye.radius);
      expect(ring, `#${seed} ring against its mantle`).toBeLessThan(width / 6);
    }
  });

  it("its web's margin is drawn whole by the skin grid: no ragged rim of beads and holes", () => {
    // (each panel 1.3–1.9 cells of the grid thick, its rim thinning to under one: drawn, 3/4 of the way out
    // the web was 7–74% as thick as its field — a lumpy shelf with holes round the mantle's base)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'cephalopod'));
      const webs = webPanels(p, isHybridNode);
      expect(webs.length, `#${seed}`).toBeGreaterThan(0);
      const drawn = drawnSkin(p, true, [], 'high');
      const f = buildFieldPrims(p, 'hybrid');
      f.k = 0.34 * f.meanR; // the hybrid skin's own blend
      for (const w of webs) {
        const Z = runOf(w.q);
        const at = [0, 1, 2].map((k) => w.c[k] + Z[k] * w.r[2] * 0.75);
        let exact = 0, shown = 0;
        const dy = 0.004;
        for (let y = at[1] - 0.5; y < at[1] + 0.5; y += dy) {
          if (fieldAt(f, at[0], y, at[2]) < 0) exact += dy;
          if (drawn.field(at[0], y, at[2]) < 0) shown += dy;
        }
        expect(exact, `#${seed} web there`).toBeGreaterThan(0);
        expect(shown / exact, `#${seed} rim drawn`).toBeGreaterThan(0.6);
      }
    }
  });
});
