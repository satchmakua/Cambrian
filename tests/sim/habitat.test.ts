import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, bodyOf, STEP, DAY_LENGTH, type World, type Creature } from '../../src/sim/world';
import { heightAt, WATER_LEVEL } from '../../src/sim/terrain';
import { traitsOf, BREATHES_AIR } from '../../src/sim/traits';
import { genomeOfMorphotype } from '../../src/engine/random';
import { grow, formable } from '../../src/engine/grow';
import type { Genome, SegmentGene } from '../../src/engine/genome';

const g = (kind: string, seed = 11) => genomeOfMorphotype(seed, kind);
const run = (w: World, seconds: number, each?: () => void) => {
  for (let i = 0; i < seconds / STEP; i++) {
    stepWorld(w);
    each?.();
  }
};
const dryLand = (w: World, c: Creature) => heightAt(w.terrain, c.x, c.z) > WATER_LEVEL + 0.15;
function withFinForm(genome: Genome, form: number): Genome {
  const out = structuredClone(genome) as Genome;
  for (let s: SegmentGene | undefined = out.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'fin' && formable(a)) a.form = form;
  return out;
}

describe('water, land and air by degree', () => {
  it('each plan swims and walks as its body lets it', () => {
    const t = (k: string) => traitsOf(grow(g(k)));
    for (const k of ['fish', 'shark']) {
      expect(t(k).habitat, k).toBe('water');
      expect(t(k).walk, k).toBeLessThan(0.12);
      expect(t(k).ashore, k).toBeLessThan(60); // gills: a few seconds out of water
    }
    for (const k of ['anuran', 'otter', 'pinniped', 'crocodilian']) {
      expect(t(k).habitat, k).toBe('amphibious');
      expect(t(k).ashore, k).toBe(BREATHES_AIR);
    }
    for (const k of ['ungulate', 'canid', 'felid', 'bird']) {
      expect(t(k).habitat, k).toBe('land');
      expect(t(k).swim, k).toBeLessThan(0.25);
    }
    // the half-way bodies: a lobe-finned fish can crawl a little, and has longer out of the water
    const lobe = traitsOf(grow(withFinForm(g('fish'), 0.5)));
    expect(lobe.habitat).toBe('amphibious');
    expect(lobe.walk).toBeGreaterThan(t('fish').walk);
    expect(lobe.ashore).toBeGreaterThan(t('fish').ashore);
    expect(lobe.swim).toBeGreaterThan(0.6);
    // …and a seal on its flippers swims far better than it walks
    expect(t('pinniped').swim).toBeGreaterThan(t('pinniped').walk * 3);
  });

  it('a fish keeps to water it can swim in; a deer never swims the lake', () => {
    const w = createWorld(3);
    const fish = release(w, g('fish'), 6);
    const deer = release(w, g('ungulate'), 6);
    run(w, 120, () => {
      // (as deep as a fish needs, up the margin as far as its fins have begun to crawl — never out onto
      // dry land: see model.ts's canStand)
      for (const c of fish) if (c.alive) expect(heightAt(w.terrain, c.x, c.z)).toBeLessThan(Math.min(WATER_LEVEL + 0.1, WATER_LEVEL - 0.3 + 3.5 * c.traits.walk));
      // (a land animal may wade the edge, to half a unit deep; never further)
      for (const c of deer) if (c.alive) expect(heightAt(w.terrain, c.x, c.z)).toBeGreaterThan(WATER_LEVEL - 0.5);
    });
  });

  it('a lobe-finned fish caught ashore heads back to the water before its breath runs out', () => {
    const w = createWorld(3);
    const [f] = release(w, withFinForm(g('fish'), 0.5), 1);
    // set it on the bank, out of breath to the half
    const L = w.terrain;
    let placed = false;
    for (let r = L.lakeR * 0.9; r < L.lakeR * 1.8 && !placed; r += 0.5) {
      for (let a = 0; a < Math.PI * 2 && !placed; a += 0.2) {
        const x = L.lakeX + Math.sin(a) * r, z = L.lakeZ + Math.cos(a) * r;
        if (heightAt(L, x, z) > WATER_LEVEL + 0.4 && heightAt(L, x, z) < WATER_LEVEL + 1.5) {
          f.x = x;
          f.z = z;
          f.y = heightAt(L, x, z);
          placed = true;
        }
      }
    }
    expect(placed).toBe(true);
    f.dry = f.traits.ashore * 0.55;
    f.decideIn = 0;
    f.energy = f.traits.maxEnergy;
    let back = false;
    run(w, Math.min(60, f.traits.ashore * 0.4), () => {
      if (!dryLand(w, f)) back = true;
    });
    expect(back, 'it made it back to the water').toBe(true);
    expect(f.alive).toBe(true);
  });

  it('an otter forages on both sides of the shore', () => {
    const w = createWorld(5);
    const band = release(w, g('otter'), 5, { x: w.terrain.lakeX + w.terrain.lakeR, z: w.terrain.lakeZ });
    let wet = 0, dry = 0;
    run(w, DAY_LENGTH * 2, () => {
      for (const c of band) {
        if (!c.alive) continue;
        if (c.y < WATER_LEVEL - 0.3) wet++;
        else if (c.y > WATER_LEVEL + 0.15) dry++;
      }
    });
    expect(wet).toBeGreaterThan((wet + dry) * 0.05);
    expect(dry).toBeGreaterThan((wet + dry) * 0.05);
  }, 60000);

  it('a seal swims for the shore and sleeps hauled out on dry ground', () => {
    const w = createWorld(5);
    const seals = release(w, g('pinniped'), 3, { x: w.terrain.lakeX, z: w.terrain.lakeZ });
    for (const c of seals) {
      c.fatigue = 0.92;
      c.energy = c.traits.maxEnergy;
      c.decideIn = 0;
    }
    let slept = 0, sleptAshore = 0;
    run(w, 120, () => {
      for (const c of seals) {
        if (!c.alive || c.action !== 'sleep') continue;
        slept++;
        if (c.y > WATER_LEVEL - 0.3) sleptAshore++;
      }
    });
    expect(slept).toBeGreaterThan(0);
    expect(sleptAshore / slept).toBeGreaterThan(0.8);
  });

  it('every creature’s body says how it can live (bodyOf traits are those of its body)', () => {
    const t = bodyOf(g('otter')).traits;
    expect(t.swim).toBeGreaterThan(0.25);
    expect(t.walk).toBeGreaterThan(0.12);
  });
});
