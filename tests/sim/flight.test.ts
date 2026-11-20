import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, STEP, AIRBORNE, DAY_LENGTH, isNight, type World } from '../../src/sim/world';
import { perchHeight, standsOf } from '../../src/sim/stands';
import { traitsOf } from '../../src/sim/traits';
import { genomeOfMorphotype } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import type { Genome, SegmentGene } from '../../src/engine/genome';

const g = (kind: string, seed = 11) => genomeOfMorphotype(seed, kind);
const t = (genome: Genome) => traitsOf(grow(genome));
/** the same body made heavier: every segment fuller, the wings as they were */
function heavier(genome: Genome, k: number): Genome {
  const out = structuredClone(genome) as Genome;
  for (let s: SegmentGene | undefined = out.body; s; s = s.child) s.size = [s.size[0] * k, s.size[1] * k, s.size[2]];
  return out;
}
/** the same body with stubs for wings */
function stubWinged(genome: Genome): Genome {
  const out = structuredClone(genome) as Genome;
  for (let s: SegmentGene | undefined = out.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'wing') a.thickness = 0.05;
  return out;
}

describe('flight by degree', () => {
  it('lift is wing against weight: a songbird flies better than a hawk, and a heavier body worse', () => {
    const bird = t(g('bird')), hawk = t(g('raptor'));
    expect(bird.flies).toBe(true);
    expect(hawk.flies).toBe(true);
    expect(bird.lift).toBeGreaterThan(hawk.lift);
    expect(t(heavier(g('bird'), 1.25)).lift).toBeLessThan(bird.lift);
    // no wings, no lift
    expect(t(g('ungulate')).lift).toBe(0);
  });

  it('a bird grown too heavy for its wings can only glide; with stubs for wings it stays on the ground', () => {
    let k = 1, glider: Genome | null = null;
    for (; k < 3 && !glider; k += 0.05) {
      const x = heavier(g('bird'), k);
      if (t(x).glides) glider = x;
    }
    expect(glider, 'some heavier bird glides').not.toBeNull();
    const gt = t(glider!);
    expect(gt.flies).toBe(false);
    expect(gt.lift).toBeGreaterThanOrEqual(0.4);
    expect(gt.lift).toBeLessThan(0.8);
    const stub = t(stubWinged(heavier(g('bird'), 1.6)));
    expect(stub.flies).toBe(false);
    expect(stub.glides).toBe(false);
  });

  it('a glider leaps and comes down: it never climbs above its leap on level ground', () => {
    const w: World = createWorld(2);
    let k = 1, glider: Genome | null = null;
    for (; k < 3 && !glider; k += 0.05) {
      const x = heavier(g('bird'), k);
      if (t(x).glides) glider = x;
    }
    const [c] = release(w, glider!, 1);
    c.action = 'flee';
    c.fly = true;
    c.alt = 0;
    c.decideIn = 1e9;
    c.tx = c.x + 30;
    c.tz = c.z;
    let top = 0, landed = false;
    for (let i = 0; i < 12 / STEP; i++) {
      stepWorld(w);
      top = Math.max(top, c.alt);
      if (top > 0 && c.alt === 0) landed = true;
    }
    expect(top).toBeGreaterThan(AIRBORNE);
    expect(top).toBeLessThan(3); // a leap and whatever the ground's fall gave it, not a climb
    expect(landed).toBe(true);
  });

  it('a tired bird roosts in the crown of a tree, and sleeps there at no cost of flight', () => {
    const w: World = createWorld(4);
    const tree = standsOf(w.terrain).trees[0];
    const [b] = release(w, g('bird'), 1, { x: tree.x + 6, z: tree.z });
    b.x = tree.x + 6;
    b.z = tree.z;
    // the evening: tired, fed
    w.time = DAY_LENGTH * 0.8;
    expect(isNight(w.time)).toBe(true);
    b.fatigue = 0.95;
    b.energy = b.traits.maxEnergy;
    b.decideIn = 0;
    let roosted = -1;
    for (let i = 0; i < 40 / STEP && roosted < 0; i++) {
      stepWorld(w);
      b.fatigue = Math.max(b.fatigue, 0.6); // (still tired: it is the roost being tested, not the rest)
      if (b.action === 'sleep' && b.perch >= 0 && b.alt > perchHeight(standsOf(w.terrain).trees[b.perch]) - 0.1) roosted = i;
    }
    expect(roosted, 'it reached a crown').toBeGreaterThan(0);
    const top = perchHeight(standsOf(w.terrain).trees[b.perch]);
    expect(b.alt).toBeGreaterThan(AIRBORNE * 3); // out of a walker's reach
    expect(b.alt).toBeLessThan(top + 0.2);
    // asleep up there, it burns what a sleeper burns: no surcharge for being off the ground
    const e0 = b.energy;
    for (let i = 0; i < 10 / STEP; i++) stepWorld(w);
    expect(b.action).toBe('sleep');
    expect(e0 - b.energy).toBeLessThan(b.traits.metabolism * 10 * 0.7);
  });

  it('a big flier with nothing to do by day rides the thermals: high, circling, cheaply', () => {
    const w: World = createWorld(6);
    w.time = DAY_LENGTH * 1.02; // (just after dawn: a day ahead of it)
    const birds = release(w, g('raptor'), 6);
    for (const b of birds) {
      b.energy = b.traits.maxEnergy;
      b.fatigue = 0;
      b.age = b.traits.maturity * 2;
      b.breedCooldown = 1e9; // (between broods: nothing to do)
    }
    let soared = false, top = 0;
    for (let i = 0; i < 120 / STEP; i++) {
      stepWorld(w);
      for (const b of birds) {
        if (!b.alive) continue;
        b.energy = Math.max(b.energy, b.traits.maxEnergy * 0.9);
        if (b.soarT > 0 && b.alt > 9) {
          soared = true;
          top = Math.max(top, b.alt);
        }
      }
    }
    expect(soared).toBe(true);
    expect(top).toBeGreaterThan(9);
  });
});
