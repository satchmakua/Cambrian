import { describe, it, expect } from 'vitest';
import { viabilityOf, fusedChains, STILLBORN } from '../../src/sim/viability';
import { createWorld, release, stepWorld, STEP, type World } from '../../src/sim/world';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../src/engine/random';
import { mutate, type MutationRates } from '../../src/engine/mutate';
import { grow } from '../../src/engine/grow';
import { GENE_BOUNDS } from '../../src/engine/bounds';
import type { Genome } from '../../src/engine/genome';

const DUP: MutationRates = { point: 0, pointSigma: 0, structural: 0, duplication: 1, macro: 0 };
/** a body with parts copied again and again (what bloats a line left unchecked) */
function bloated(g: Genome, n: number): Genome {
  let x = g;
  for (let i = 0; i < n; i++) x = mutate(x, 500 + i, i, DUP);
  return x;
}

describe('a body judged against its line', () => {
  it("every plan's founder is as viable as can be: nothing fused, nothing charged", () => {
    for (const id of MORPHOTYPE_IDS) {
      for (const seed of [3, 17, 41]) {
        const p = grow(genomeOfMorphotype(seed, id));
        expect(viabilityOf(p, p).score, `${id} ${seed}`).toBe(1);
        expect(fusedChains(p), `${id} ${seed} fused`).toBe(0);
      }
    }
  });

  it('parts copied again and again cost it: a body bloated far past its founder is stillborn', () => {
    const g = genomeOfMorphotype(5, 'canid');
    const p = grow(g);
    const v1 = viabilityOf(grow(bloated(g, 1)), p);
    const v9 = viabilityOf(grow(bloated(g, 9)), p);
    expect(v1.bloat).toBeGreaterThan(1);
    expect(v9.bloat).toBeGreaterThan(1.5);
    expect(v9.score).toBeLessThan(v1.score);
    expect(v9.score).toBeLessThan(STILLBORN);
  });

  it('a bilateral line gone lopsided is charged', () => {
    const g = genomeOfMorphotype(7, 'canid');
    const lop = structuredClone(g);
    lop.symmetry = 'none';
    const v = viabilityOf(grow(lop), grow(g));
    expect(v.asymmetric).toBe(true);
    expect(v.score).toBeLessThan(1);
  });

  it('limbs twisted to the limit of their joints are charged', () => {
    const g = genomeOfMorphotype(7, 'ungulate');
    const tw = structuredClone(g);
    const max = GENE_BOUNDS.appendage.curlPitch[1];
    for (let s: Genome['body'] | undefined = tw.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'leg' || a.kind === 'tail') a.curl = [max, max];
    const v = viabilityOf(grow(tw), grow(g));
    expect(v.contortion).toBeGreaterThan(0.2);
    expect(v.score).toBeLessThan(1);
  });
});

describe('the valley charges for it', () => {
  const run = (w: World, s: number) => {
    for (let i = 0; i < s / STEP; i++) stepWorld(w);
  };

  it('an egg whose body is far gone never hatches (it is counted stillborn)', () => {
    const w = createWorld(4);
    const g = genomeOfMorphotype(5, 'insectoid');
    const [mum] = release(w, g, 1, undefined, 'insectoid');
    const bad = bloated(g, 9);
    const born = w.tally.births;
    w.eggs.push({ id: w.nextId++, x: mum.x, z: mum.z, y: mum.y, genome: bad, species: mum.species, mother: mum.id, generation: 1, laidAt: w.time, hatchAt: w.time, nest: -1, water: false });
    stepWorld(w);
    expect(w.eggs.length).toBe(0);
    expect(w.tally.stillborn).toBe(1);
    expect(w.tally.births).toBe(born);
    expect(w.creatures.some((c) => c.genome === bad)).toBe(false);
  });

  it('a misbuilt body burns more at rest than a well-made one', () => {
    const w = createWorld(4);
    const [a, b] = release(w, genomeOfMorphotype(9, 'ungulate'), 2, undefined, 'ungulate');
    b.genome = a.genome;
    b.traits = a.traits;
    a.fit = 1;
    b.fit = 0.3;
    for (const c of [a, b]) {
      c.energy = c.traits.maxEnergy * 0.8;
      c.age = c.traits.maturity * 2;
      c.action = 'sleep';
      c.fatigue = 1;
      c.decideIn = 1e9;
    }
    run(w, 30);
    expect(b.energy).toBeLessThan(a.energy);
  });
});
