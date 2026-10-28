import { describe, it, expect } from 'vitest';
import {
  createWorld, release, stepWorld, worldHash, bodyOf, liveCount, preysOn, STEP, DAY_LENGTH, MAX_POP, AIRBORNE, climate, seasonOf, YEAR_DAYS, COURT_TIME,
} from '../../src/sim/world';
import { traitsOf } from '../../src/sim/traits';
import { saveWorld, loadWorld } from '../../src/sim/persist';
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

describe('courtship & young', () => {
  it('a pair dance about each other for the whole display before the young arrive', () => {
    const w = createWorld(3);
    const pair = release(w, g('ungulate'), 2);
    pair[1].x = pair[0].x + 2.5;
    pair[1].z = pair[0].z;
    for (const c of pair) {
      c.age = c.traits.maturity + 10;
      c.energy = c.traits.maxEnergy;
      c.fatigue = 0;
      c.breedCooldown = 0;
    }
    let danced = 0;
    let maxGap = 0;
    for (let i = 0; i < 60 / STEP && w.tally.births === 0; i++) {
      stepWorld(w);
      const courting = pair.some((c) => c.action === 'mate' && c.courtT > 0);
      if (courting) {
        danced += STEP;
        maxGap = Math.max(maxGap, Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z));
      }
    }
    expect(w.tally.births).toBeGreaterThan(0);
    expect(danced).toBeGreaterThanOrEqual(COURT_TIME - STEP); // no birth before the display is through
    const contact = pair[0].traits.radius + pair[1].traits.radius;
    expect(maxGap).toBeLessThan(contact + 4.5); // they circle close, not wander apart
  });

  it('the young bolt with a fleeing parent', () => {
    const w = createWorld(3);
    const [mum] = release(w, g('ungulate'), 1);
    const [cat] = release(w, g('felid'), 1, { x: mum.x, z: mum.z });
    cat.x = mum.x + 12;
    cat.z = mum.z;
    // a newborn asleep beside its mother (a sleeper sees only a third as far: not the hunter)
    const [calf] = release(w, mum.genome, 1, { x: mum.x, z: mum.z });
    calf.age = 0;
    calf.parent = mum.id;
    calf.x = mum.x - 2;
    calf.z = mum.z;
    calf.action = 'sleep';
    calf.fatigue = 0.5;
    calf.decideIn = 0;
    mum.action = 'flee';
    mum.target = cat.id;
    mum.decideIn = 5; // she is mid-flight this step
    cat.decideIn = 5;
    stepWorld(w);
    expect(calf.action).toBe('flee');
    expect(calf.target).toBe(cat.id);
  });
});


describe('a living balance', () => {
  it('small prey go to ground in the bushes, and the hunter gives them up', () => {
    const w = createWorld(3);
    const bush = w.plants[0];
    const [mouse] = release(w, g('rodent'), 1, { x: bush.x, z: bush.z });
    mouse.x = bush.x;
    mouse.z = bush.z;
    const [cat] = release(w, g('felid'), 1, { x: bush.x, z: bush.z });
    cat.x = bush.x + 5;
    cat.z = bush.z;
    cat.energy = cat.traits.maxEnergy * 0.2;
    cat.fatigue = 0;
    mouse.fatigue = 0;
    mouse.action = 'flee';
    mouse.target = cat.id;
    mouse.decideIn = 5;
    cat.action = 'hunt';
    cat.target = mouse.id;
    cat.decideIn = 5;
    stepWorld(w);
    expect(cat.action).not.toBe('hunt');
    expect(mouse.alive).toBe(true);
  });

  it('a founding stock that dies out wanders back in from the edge within days', () => {
    const w = createWorld(3);
    const herd = release(w, g('ungulate'), 4);
    release(w, g('rodent'), 6);
    const sp = w.species.find((s) => s.id === herd[0].species)!;
    for (const c of herd) {
      c.alive = false;
      sp.alive--;
    }
    w.creatures = w.creatures.filter((c) => c.alive);
    sp.extinctAt = w.time;
    // (a 50% chance each eligible dawn: ten days makes a miss ~1 in 500)
    run(w, DAY_LENGTH * 10);
    expect(sp.extinctAt).toBeNull();
    expect(w.creatures.some((c) => c.species === sp.id)).toBe(true);
  });

  it('a year on, the valley still holds most of its kinds', () => {
    const seed = 4;
    const w = createWorld(seed);
    const kinds: [string, number][] = [['rodent', 8], ['ungulate', 6], ['insectoid', 6], ['bird', 6], ['fish', 7], ['canid', 3], ['felid', 2]];
    kinds.forEach(([kind, n], i) => release(w, genomeOfMorphotype((seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
    run(w, DAY_LENGTH * YEAR_DAYS);
    const alive = new Set(w.creatures.map((c) => w.species.find((s) => s.id === c.species)!.name.split(' ')[0]));
    expect(alive.size).toBeGreaterThanOrEqual(5);
    // and the hunters are still hunting
    expect(w.creatures.some((c) => c.traits.diet === 'carnivore')).toBe(true);
  }, 60000);
});

describe('nests and eggs', () => {
  const pairUp = (w: ReturnType<typeof createWorld>, kind: string) => {
    const pair = release(w, g(kind), 2);
    pair[1].x = pair[0].x + 2.5;
    pair[1].z = pair[0].z;
    for (const c of pair) {
      c.age = c.traits.maturity + 10;
      c.energy = c.traits.maxEnergy;
      c.fatigue = 0;
      c.breedCooldown = 0;
    }
    return pair;
  };

  it('an egg-layer lays a clutch that hatches a third of a day later into its young', () => {
    const w = createWorld(3);
    const [a] = pairUp(w, 'bird');
    expect(a.traits.oviparous).toBe(true);
    let laidAt = -1;
    for (let i = 0; i < 60 / STEP && laidAt < 0; i++) {
      stepWorld(w);
      if (w.eggs.length) laidAt = w.time;
    }
    expect(laidAt).toBeGreaterThan(0);
    const clutch = w.eggs.length;
    expect(clutch).toBeGreaterThanOrEqual(2);
    expect(w.tally.births).toBe(0); // eggs, not young — yet
    const mother = w.eggs[0].mother;
    const first = new Set(w.eggs.map((e) => e.id));
    run(w, 110);
    // (the pair may well have laid again since — it's THIS clutch that must have hatched)
    expect(w.eggs.filter((e) => first.has(e.id)).length).toBe(0);
    const young = w.creatures.filter((c) => c.parent === mother && c.age < 60);
    expect(young.length).toBeGreaterThan(0);
  });

  it('a furred pair bears live young (no eggs)', () => {
    const w = createWorld(3);
    const [a] = pairUp(w, 'ungulate');
    expect(a.traits.oviparous).toBe(false);
    run(w, 60);
    expect(w.eggs.length).toBe(0);
    expect(w.tally.births).toBeGreaterThan(0);
  });

  it('a hungry hunter raids an unguarded nest', () => {
    const w = createWorld(3);
    const [a] = pairUp(w, 'bird');
    for (let i = 0; i < 60 / STEP && w.eggs.length === 0; i++) stepWorld(w);
    expect(w.eggs.length).toBeGreaterThan(0);
    // the parents leave; a hungry cat comes by
    for (const c of w.creatures) c.alive = false;
    w.creatures = [];
    const nest = w.eggs[0];
    const [cat] = release(w, g('felid'), 1, { x: nest.x, z: nest.z });
    cat.x = nest.x + 4;
    cat.z = nest.z;
    cat.energy = cat.traits.maxEnergy * 0.3;
    cat.fatigue = 0;
    const before = w.eggs.length;
    run(w, 20);
    expect(w.eggs.length).toBeLessThan(before);
    void a;
  });
});

describe('bookkeeping that holds (review fixes)', () => {
  const starter = (seed: number) => {
    const w = createWorld(seed);
    const kinds: [string, number][] = [['rodent', 8], ['ungulate', 6], ['insectoid', 6], ['bird', 6], ['fish', 7], ['canid', 3], ['felid', 2]];
    kinds.forEach(([kind, n], i) => release(w, genomeOfMorphotype((seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
    return w;
  };
  const checkBooks = (w: ReturnType<typeof createWorld>) => {
    for (const sp of w.species) {
      const n = w.creatures.filter((c) => c.alive && c.species === sp.id).length;
      expect(sp.alive, `${sp.name} alive count`).toBe(n);
      // extinct exactly when it has no one left (never "alive" with no members, never dead with some)
      expect(sp.extinctAt === null, `${sp.name} extinct flag (alive ${n})`).toBe(n > 0);
    }
  };

  it('through a year, a species is extinct exactly when it has no living members', () => {
    const w = starter(5);
    for (let d = 0; d < YEAR_DAYS; d++) {
      run(w, DAY_LENGTH);
      checkBooks(w);
    }
  }, 60000);

  it('an egg-laying species keeps to its share of the valley while its clutches wait to hatch', () => {
    const w = createWorld(3);
    const flock = release(w, g('bird'), 36);
    for (const c of flock) {
      c.age = c.traits.maturity + 10;
      c.energy = c.traits.maxEnergy;
      c.fatigue = 0;
      c.breedCooldown = 0;
    }
    const sp = flock[0].species;
    let peak = 0;
    for (let i = 0; i < 200 / STEP; i++) {
      stepWorld(w);
      peak = Math.max(peak, w.creatures.filter((c) => c.species === sp).length + w.eggs.filter((e) => e.species === sp).length);
    }
    expect(peak).toBeLessThanOrEqual(45); // the species' share is 0.3 × 135 = 40.5 (was 129 + 77 eggs)
  });

  it('immigrants that find no room leave their stock extinct (not in limbo)', () => {
    const w = createWorld(1);
    const kinds = ['insectoid', 'fish', 'canid', 'ursid', 'primate', 'mustelid', 'bird', 'lizard'];
    const founders = kinds.map((k, i) => release(w, genomeOfMorphotype(40 + i, k), 1, undefined, k)[0]);
    for (const c of founders) {
      c.alive = false;
      const sp = w.species.find((s) => s.id === c.species)!;
      sp.alive--;
      sp.extinctAt = 0;
    }
    w.creatures = w.creatures.filter((c) => c.alive);
    // fill the valley to 157 (room for only 8 newcomers between them all)
    const filler = g('rodent');
    while (liveCount(w) < MAX_POP - 8) release(w, filler, Math.min(20, MAX_POP - 8 - liveCount(w)));
    for (const c of w.creatures) {
      c.energy = c.traits.maxEnergy;
      c.breedCooldown = 1e6; // nobody breeds into the gap
    }
    w.time = DAY_LENGTH * 2 - STEP / 2; // just before the dawn of day 2
    stepWorld(w);
    checkBooks(w);
  });

  it('a clutch that outlives its parents carries the line on', () => {
    const w = createWorld(3);
    const pair = release(w, g('bird'), 2);
    pair[1].x = pair[0].x + 2.5;
    pair[1].z = pair[0].z;
    for (const c of pair) {
      c.age = c.traits.maturity + 10;
      c.energy = c.traits.maxEnergy;
      c.fatigue = 0;
      c.breedCooldown = 0;
    }
    for (let i = 0; i < 60 / STEP && w.eggs.length === 0; i++) stepWorld(w);
    expect(w.eggs.length).toBeGreaterThan(0);
    const spId = pair[0].species;
    // the parents die
    for (const c of pair) c.health = -1;
    stepWorld(w);
    const sp = w.species.find((s) => s.id === spId)!;
    expect(sp.extinctAt).not.toBeNull();
    run(w, 120);
    checkBooks(w);
    expect(sp.alive).toBeGreaterThan(0);
  });

  it('releasing the same creature after a save/load joins its species instead of founding a twin', () => {
    const w = starter(2);
    const G = genomeOfMorphotype(77, 'mustelid');
    release(w, G, 3, undefined, 'mustelid');
    const n = w.species.length;
    const b = loadWorld(saveWorld(w));
    release(b, G, 2);
    expect(b.species.length).toBe(n);
  });

  it('the river never raises the lake bed where its course begins', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = makeTerrain(seed);
      const ux = Math.sin(t.riverA), uz = Math.cos(t.riverA);
      for (let k = 0.6; k < 0.95; k += 0.01) {
        const x = t.lakeX + ux * t.lakeR * k, z = t.lakeZ + uz * t.lakeR * k;
        // the bed 8 bu to either side of the channel, out of its reach
        const side = (heightAt(t, x + uz * 8, z - ux * 8) + heightAt(t, x - uz * 8, z + ux * 8)) / 2;
        // where that bed lies deeper than the river, the channel must not stand up out of it (the old
        // blend lifted it ~2 bu to the river's depth; the bed's own hills vary well under 0.9)
        if (side < -1.3) expect(heightAt(t, x, z), `seed ${seed} k ${k.toFixed(2)}`).toBeLessThan(side + 0.9);
      }
    }
  });

  it('a creature re-released after its stock died out comes back under its own name (no twin)', () => {
    const w = starter(2);
    const G = genomeOfMorphotype(77, 'mustelid');
    const band = release(w, G, 3, undefined, 'mustelid');
    for (const c of band) c.health = -1;
    run(w, 1);
    const sp = w.species.find((s) => s.id === band[0].species)!;
    expect(sp.extinctAt).not.toBeNull();
    release(w, G, 3);
    run(w, DAY_LENGTH * 4);
    const same = w.species.filter((s) => s.founder === G || JSON.stringify(s.founder) === JSON.stringify(G));
    expect(same.length).toBe(1);
    checkBooks(w);
  });

  it('a courtship display mostly ends in a mating (pairs do not all rush the one place a death opens)', () => {
    const w = starter(1);
    const dancing = new Map<number, number>(); // id -> breedCooldown when its display completed
    let mated = 0, parted = 0;
    for (let i = 0; i < (DAY_LENGTH * 6) / STEP; i++) {
      stepWorld(w);
      for (const c of w.creatures) {
        if (c.action === 'mate' && c.courtT >= COURT_TIME) dancing.set(c.id, c.breedCooldown);
        else if (dancing.has(c.id) && c.action !== 'mate') {
          if (c.breedCooldown > 0) mated++;
          else if (c.action !== 'flee') parted++;
          dancing.delete(c.id);
        }
      }
    }
    expect(mated).toBeGreaterThan(20);
    expect(parted / mated).toBeLessThan(1); // was ~3 empty displays per mating
  }, 60000);
});

