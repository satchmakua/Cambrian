import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildJawed, DRAGON_FANGS } from '../../../src/viewer/mouths/jawed';
import { mouthCarves } from '../../../src/viewer/mouthLine';
import { mouthVariant } from '../../../src/viewer/partStyles';

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
/** the reticulate net's cells per (pattern scale × body unit) — creatureMaterial.ts RETIC_CELL (GLSL) */
const RETIC_CELL = 0.38;

const trunkDiameter = (p: Phenotype) =>
  2 * Math.max(...p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0).map((n) => n.radius * Math.min(n.scale?.[0] ?? 1, n.scale?.[1] ?? 1)));

function jawOf(p: Phenotype) {
  const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  const style = p.nodes[idx].part!.style;
  let v = mouthVariant(style) as string;
  if (v === 'fanged' && style >= 0.22) v = 'underbite';
  if (!['herbivore', 'maw', 'fanged', 'underbite'].includes(v)) return null;
  return buildJawed(p, idx, mouthCarves(p), true, v as never, 'hybrid');
}

describe('chimera markings, feet and fangs', () => {
  it("its markings are a beast's: a net's cells at most 0.65 of its trunk across (not planes through it — straps, a cross)", () => {
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'chimera');
      const cell = 1 / (g.covering.patternScale * RETIC_CELL);
      expect(cell / trunkDiameter(grow(g)), `#${seed}`).toBeLessThan(0.65); // seed 29 on HEAD: 1.23 (worst with the patch: #23, 0.60)
    }
  });

  it('stands on paws, claws or pincers — never the bare disc of a generic foot', () => {
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'chimera'));
      for (const n of p.nodes) if (n.part?.kind === 'leg' && n.terminal) expect(n.terminal, `#${seed}`).not.toBe('foot');
    }
  });

  it("a blunt head's shut jaw shows its fangs apart, not shoulder to shoulder in a grin", () => {
    for (const seed of SEEDS) {
      const b = jawOf(grow(genomeOfMorphotype(seed, 'chimera')));
      if (!b) continue;
      const T = b.upperTeeth;
      for (let i = 1; i < T.length; i++) {
        const gap = Math.hypot(T[i].pos[0] - T[i - 1].pos[0], T[i].pos[1] - T[i - 1].pos[1], T[i].pos[2] - T[i - 1].pos[2]);
        expect(gap / (T[i].w + T[i - 1].w), `#${seed} tooth ${i}`).toBeGreaterThan(1.3); // seed 29 on HEAD: 0.74
      }
    }
  });

  it("a dragon's and a wyvern's long jaws keep all six fangs", () => {
    for (const plan of ['dragon', 'wyvern']) for (const seed of SEEDS.slice(0, 12)) {
      const b = jawOf(grow(genomeOfMorphotype(seed, plan)));
      if (b && b.sealed) expect(b.upperTeeth.length, `${plan} #${seed}`).toBe(DRAGON_FANGS.count);
    }
  });
});
