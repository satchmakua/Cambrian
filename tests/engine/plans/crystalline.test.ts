import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { GENE_BOUNDS } from '../../../src/engine/bounds';
import { buildMeshData } from '../../../src/viewer/meshData';
import { eyeVariant } from '../../../src/viewer/partStyles';
import { traitsOf } from '../../../src/sim/traits';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

const beast = (seed: number) => {
  const g = genomeOfMorphotype(seed, 'crystalline');
  const p = grow(g);
  return { g, p, md: buildMeshData(p) };
};
const ends = (p: Phenotype, kind: string) => p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === kind);
/** where along the trunk (0 rump … 1 shoulders) a point stands */
const along = (p: Phenotype) => {
  const zs = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0).map((n) => n.pos[2]);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  return (z: number) => (z - z0) / (z1 - z0);
};

describe('crystalline', () => {
  it('is a beast of cut stone: a crystal hide in one clear colour, lit from within', () => {
    // (it wore plates — a turtle's scutes — in bands and spots: nothing about it said crystal)
    for (const seed of SEEDS) {
      const { g } = beast(seed);
      expect(g.covering.type).toBe('crystal');
      expect(['plain', 'gradient']).toContain(g.covering.pattern); // no stripes or spots painted on a gem
      expect(g.covering.sheen).toBeGreaterThanOrEqual(0.75);
      expect(g.covering.sheen).toBeLessThanOrEqual(GENE_BOUNDS.covering.sheen[1]);
      expect(g.palette.sat).toBeGreaterThanOrEqual(0.5); // a stone's clear colour, never grey
    }
  });

  it('carries a row of five shards along the whole of its back, from rump to shoulders', () => {
    // (three little thorns between the shoulders; now the outline of the animal)
    for (const seed of SEEDS) {
      const { p, md } = beast(seed);
      const shards = md.features.filter((f) => f.type === 'claw' && f.kind === 'spine');
      expect(shards.length, `seed ${seed}`).toBe(5);
      const at = along(p);
      const zs = shards.map((f) => at(p.nodes[f.idx].pos[2])).sort((a, b) => a - b);
      expect(zs[0], `seed ${seed}: the first over the rump`).toBeLessThan(0.15);
      expect(zs[4], `seed ${seed}: the last over the shoulders`).toBeGreaterThan(0.85);
      expect(zs[2], `seed ${seed}: and some between`).toBeGreaterThan(0.2);
      expect(zs[2]).toBeLessThan(0.8);
      // each stands on the back (above the trunk's own line), big enough to be seen across a meadow
      for (const f of shards) {
        expect(p.nodes[f.idx].pos[1]).toBeGreaterThan(0);
        expect(f.radius).toBeGreaterThan(0.08);
      }
    }
  });

  it('is a four-legged animal: a head with one pair of glowing eyes, a leg pair under each end, no tail', () => {
    let horned = 0;
    for (const seed of SEEDS) {
      const { g, p, md } = beast(seed);
      const segs = new Set(p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment));
      expect(segs.size, `seed ${seed}: a trunk and a head`).toBe(2);
      const eyes = md.features.filter((f) => f.type === 'eye');
      expect(eyes.length, `seed ${seed}`).toBe(2); // (it had up to six, scattered)
      for (const e of eyes) expect(eyeVariant(e.style)).toBe('glowing');
      const legs = ends(p, 'leg');
      expect(legs.length, `seed ${seed}`).toBe(4);
      const at = along(p);
      const zs = legs.map((n) => at(n.pos[2])).sort((a, b) => a - b);
      expect(zs[1], `seed ${seed}: hind legs under the rump`).toBeLessThan(0.2);
      expect(zs[2], `seed ${seed}: forelegs under the shoulders`).toBeGreaterThan(0.75);
      expect(ends(p, 'tail').length, `seed ${seed}`).toBe(0);
      expect(g.body.child, 'no neck: the head sits on the shoulders').toBeDefined();
      if (md.features.some((f) => f.type === 'claw' && f.kind === 'horn')) horned++;
    }
    expect(horned).toBeGreaterThan(4); // most carry a pair of shards on the head too
    expect(horned).toBeLessThan(16);
  });

  it('its hide is the hardest there is', () => {
    // (crystal: 0.30 of armour from the hide alone; plates 0.25, chitin 0.18)
    const { g, p } = beast(3);
    const asPlates = { ...g, covering: { ...g.covering, type: 'plates' as const } };
    const mine = traitsOf(p);
    const theirs = traitsOf(grow(asPlates));
    expect(mine.defense).toBeGreaterThan(theirs.defense);
  });
});
