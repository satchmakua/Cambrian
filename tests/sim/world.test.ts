import { describe, it, expect } from 'vitest';
import {
  createWorld, release, stepWorld, worldHash, bodyOf, liveCount, preysOn, STEP, DAY_LENGTH, MAX_POP, AIRBORNE, climate, seasonOf, YEAR_DAYS,
} from '../../src/sim/world';
import { traitsOf } from '../../src/sim/traits';
import { heightAt, makeTerrain, biomeAt, WORLD_SIZE, WATER_LEVEL } from '../../src/sim/terrain';
import { genomeOfMorphotype } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';

const g = (kind: string, seed = 11) => genomeOfMorphotype(seed, kind);
const run = (w: ReturnType<typeof createWorld>, seconds: number) => {
  for (let i = 0; i < seconds / STEP; i++) stepWorld(w);
};

describe('terrain', () => {
  it('is deterministic and holds every habitat the food web needs', () => {
    const a = makeTerrain(5), b = makeTerrain(5);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const x = ((i * 37) % 100) / 100 * WORLD_SIZE - WORLD_SIZE / 2;
      const z = ((i * 61) % 100) / 100 * WORLD_SIZE - WORLD_SIZE / 2;
      expect(heightAt(a, x, z)).toBe(heightAt(b, x, z));
      expect(Number.isFinite(heightAt(a, x, z))).toBe(true);
      seen.add(biomeAt(a, x, z));
    }
    for (const b of ['shallow', 'meadow', 'wood']) expect(seen.has(b)).toBe(true);
  });
});

describe('traits are read off the anatomy', () => {
  it('mouths set the diet, fins set the habitat, legs set the gait', () => {
    expect(traitsOf(grow(g('ungulate'))).diet).toBe('herbivore');
    expect(traitsOf(grow(g('shark'))).diet).toBe('carnivore');
    const fish = traitsOf(grow(g('fish')));
    expect(fish.habitat).toBe('water');
    expect(fish.locomotion).toBe('swim');
    const spider = traitsOf(grow(g('arachnid')));
    expect(spider.locomotion).toBe('walk');
    expect(spider.legs).toBeGreaterThanOrEqual(6);
  });

  it('allometry: bigger bodies burn more, live longer, and store more', () => {
    const small = traitsOf(grow(g('rodent')));
    const big = traitsOf(grow(g('ursid')));
    expect(big.mass).toBeGreaterThan(small.mass);
    expect(big.metabolism).toBeGreaterThan(small.metabolism);
    expect(big.lifespan).toBeGreaterThan(small.lifespan);
    expect(big.maxEnergy).toBeGreaterThan(small.maxEnergy);
    for (const t of [small, big]) for (const v of Object.values(t)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
  });
});

describe('the world', () => {
  it('is deterministic: the same seed and releases replay bit-for-bit', () => {
    const mk = () => {
      const w = createWorld(3);
      release(w, g('rodent'), 6);
      release(w, g('felid'), 2);
      release(w, g('fish'), 4);
      run(w, 90);
      return worldHash(w);
    };
    expect(mk()).toBe(mk());
  });

  it('grazers eat: a hungry herbivore in a meadow gains energy', () => {
    const w = createWorld(3);
    const [c] = release(w, g('ungulate'), 1);
    c.energy = c.traits.maxEnergy * 0.4;
    c.fatigue = 0;
    const e0 = c.energy;
    run(w, 40);
    expect(c.alive).toBe(true);
    expect(c.energy).toBeGreaterThan(e0);
  });

  it('predators hunt: a hungry carnivore beside prey makes a kill and eats', () => {
    const w = createWorld(3);
    const [cat] = release(w, g('felid'), 1);
    const prey = release(w, g('rodent'), 5, { x: cat.x, z: cat.z });
    expect(preysOn(cat, prey[0])).toBe(true);
    cat.energy = cat.traits.maxEnergy * 0.3;
    cat.fatigue = 0;
    for (const p of prey) p.fatigue = 0;
    run(w, 120);
    expect(w.tally.kills).toBeGreaterThan(0);
  });

  it('life goes on: over days creatures are born, some mutated, some die', () => {
    const w = createWorld(7);
    for (const k of ['rodent', 'ungulate', 'insectoid', 'bird']) release(w, g(k), 8);
    run(w, DAY_LENGTH * 4);
    expect(w.tally.births).toBeGreaterThan(20);
    expect(w.tally.mutations).toBeGreaterThan(3);
    expect(w.tally.oldAge + w.tally.starvation + w.tally.kills).toBeGreaterThan(5);
    expect(liveCount(w)).toBeLessThanOrEqual(MAX_POP);
    expect(liveCount(w)).toBeGreaterThan(10);
    for (const c of w.creatures) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.energy)).toBe(true);
      expect(Math.abs(c.x)).toBeLessThan(WORLD_SIZE / 2);
      expect(Math.abs(c.z)).toBeLessThan(WORLD_SIZE / 2);
    }
  });

  it('starvation is real: with the plants stripped, grazers die of hunger', () => {
    const w = createWorld(4);
    w.grass.fill(0);
    w.grassCap.fill(0);
    for (const p of w.plants) p.fruit = p.max = 0;
    release(w, g('rodent'), 6);
    run(w, DAY_LENGTH * 3);
    expect(w.tally.starvation).toBeGreaterThan(0);
  });

  it('swimmers stay in the water and walkers on land', () => {
    const w = createWorld(7);
    const fish = release(w, g('fish'), 5);
    const deer = release(w, g('ungulate'), 5);
    run(w, 120);
    for (const f of fish) if (f.alive) expect(heightAt(w.terrain, f.x, f.z)).toBeLessThan(0);
    for (const d of deer) if (d.alive) expect(heightAt(w.terrain, d.x, d.z)).toBeGreaterThan(-0.6);
    expect(bodyOf(fish[0].genome).traits.habitat).toBe('water');
  });
});

describe('flight', () => {
  it('wings on a walking body fly; everything else keeps its feet', () => {
    for (const kind of ['bird', 'raptor']) {
      const t = traitsOf(grow(g(kind)));
      expect(t.flies).toBe(true);
      expect(t.flySpeed).toBeGreaterThan(t.speed);
    }
    for (const kind of ['felid', 'ungulate', 'fish', 'arachnid']) expect(traitsOf(grow(g(kind))).flies).toBe(false);
  });

  it('birds take to the air and come back down — and never set down on the lake', () => {
    const w = createWorld(3);
    for (let s = 0; s < 3; s++) release(w, g('bird', 40 + s), 4);
    release(w, g('felid'), 3);
    let aloft = 0, landed = 0;
    for (let i = 0; i < 180 / STEP; i++) {
      stepWorld(w);
      if (i % 10 !== 0) continue;
      for (const c of w.creatures) {
        if (!c.traits.flies) continue;
        if (c.alt > AIRBORNE) aloft++;
        else if (c.alt === 0) {
          landed++;
          // on its feet means on ground it can stand on
          expect(heightAt(w.terrain, c.x, c.z)).toBeGreaterThan(WATER_LEVEL - 0.5);
        }
        expect(c.alt).toBeLessThan(15);
      }
    }
    expect(aloft).toBeGreaterThan(20);
    expect(landed).toBeGreaterThan(aloft); // flight is for trips and escapes, not a way of life
  });
});

describe('seasons', () => {
  it('a year turns spring → summer → autumn → winter, and winter is lean and cold', () => {
    const day = (d: number) => (d + 0.5) * DAY_LENGTH;
    expect([day(1), day(4), day(7), day(10), day(13)].map(seasonOf)).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring']);
    const spring = climate(day(1)), winter = climate(day(10)), autumn = climate(day(7));
    expect(winter.grass).toBeLessThan(spring.grass * 0.5);
    expect(winter.fruit).toBeLessThan(autumn.fruit * 0.3);
    expect(winter.cold).toBeGreaterThan(0.8);
    // smooth: no jumps between neighbouring moments
    for (let t = 0; t < DAY_LENGTH * YEAR_DAYS; t += 30) expect(Math.abs(climate(t + 30).grass - climate(t).grass)).toBeLessThan(0.08);
  });
});
