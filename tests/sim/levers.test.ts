import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, climateOf, leverSnow, DAY_LENGTH, YEAR_DAYS, STEP, type World } from '../../src/sim/world';
import { eventSpan, runLevers, setRain, setWarmth, startEvent } from '../../src/sim/levers';
import { SCENARIOS, judgeScenario, scenarioById, startScenario } from '../../src/sim/scenarios';
import { setGodMode } from '../../src/sim/god';
import { loadWorld, saveWorld } from '../../src/sim/persist';
import { populateCast } from '../../src/sim/cast';
import { genomeOfMorphotype } from '../../src/engine/random';
import type { Genome, SegmentGene } from '../../src/engine/genome';

const YEAR = DAY_LENGTH * YEAR_DAYS;
function valley(seed = 4): World {
  const w = createWorld(seed);
  release(w, genomeOfMorphotype(41, 'ungulate'), 8, undefined, 'ungulate');
  release(w, genomeOfMorphotype(42, 'rodent'), 8, undefined, 'rodent');
  release(w, genomeOfMorphotype(43, 'felid'), 3, undefined, 'felid');
  return w;
}
const lines = (w: World, kind: string) => w.events.filter((e) => e.kind === kind).length;

describe('levers on the environment', () => {
  it('a colder or warmer age moves every season’s cold; a wetter valley is told too', () => {
    const w = valley();
    w.time = YEAR * 0.6;
    const base = climateOf(w).cold;
    expect(setWarmth(w, -1)).toBe(true);
    expect(climateOf(w).cold).toBeGreaterThan(base);
    expect(setWarmth(w, 1)).toBe(true);
    expect(climateOf(w).cold).toBeLessThan(base + 1e-9);
    expect(setRain(w, 1.5)).toBe(true);
    expect(w.levers.rain).toBe(1.5);
    expect(lines(w, 'climate')).toBe(3);
  });

  it('an ice age brings hard cold and lasting snow, and ends', () => {
    const w = valley();
    w.time = YEAR * 0.3; // summer
    const summer = climateOf(w).cold;
    expect(startEvent(w, 'ice-age')).toBe(true);
    expect(startEvent(w, 'ice-age')).toBe(false); // (one at a time)
    expect(climateOf(w).cold).toBeGreaterThan(summer + 0.4);
    expect(leverSnow(w)).toBeGreaterThan(0.5);
    w.time += eventSpan('ice-age') + 1;
    runLevers(w);
    expect(w.levers.events).toHaveLength(0);
    expect(leverSnow(w)).toBe(0);
  });

  it('a meteor kills most of the big animals at a stroke; a plague most of one species, over its days', () => {
    const w = valley(6);
    const big = () => w.creatures.filter((c) => c.alive && c.traits.mass >= 1.5).length;
    const before = big();
    expect(before).toBeGreaterThan(5);
    startEvent(w, 'meteor');
    expect(big()).toBeLessThan(before * 0.6);
    const rodents = w.creatures.find((c) => c.traits.mass < 1.5)!.species;
    const n0 = w.creatures.filter((c) => c.alive && c.species === rodents).length;
    expect(startEvent(w, 'plague', rodents)).toBe(true);
    const t0 = w.time;
    while (w.time < t0 + eventSpan('plague') + 1) {
      w.time += STEP * 40;
      runLevers(w);
    }
    const n1 = w.creatures.filter((c) => c.alive && c.species === rodents).length;
    expect(n1).toBeLessThan(n0);
    expect(n1).toBeGreaterThan(0); // (some are spared)
  });

  it('what was pulled is kept in a save, and the valley carries on from it bit-for-bit', () => {
    const w = valley(7);
    setWarmth(w, -0.5);
    startEvent(w, 'ash-winter');
    for (let i = 0; i < 30 / STEP; i++) stepWorld(w);
    const b = loadWorld(saveWorld(w));
    expect(b.levers).toEqual(w.levers);
    for (let i = 0; i < 30 / STEP; i++) {
      stepWorld(w);
      stepWorld(b);
    }
    expect(saveWorld(b)).toBe(saveWorld(w));
  });
});

describe('scenarios', () => {
  it('each starts its valley, and is judged at dawn', () => {
    for (const sc of SCENARIOS) {
      const w = createWorld(2);
      populateCast(w, sc.cast());
      startScenario(w, sc.id);
      expect(w.scenario).toMatchObject({ id: sc.id, status: 'going' });
      expect(sc.progress(w).length).toBeGreaterThan(5);
      judgeScenario(w);
      expect(w.scenario!.status).toBe('going');
    }
  });

  it('three levels: lost the dawn a level is gone', () => {
    const w = createWorld(2);
    populateCast(w, scenarioById('three-levels')!.cast());
    startScenario(w, 'three-levels');
    for (const c of w.creatures) if (c.traits.diet === 'carnivore') c.alive = false;
    judgeScenario(w);
    expect(w.scenario!.status).toBe('lost');
  });

  it('a walker takes wing: won by a glider of the valley’s own lines, not one released into it', () => {
    const w = createWorld(2);
    populateCast(w, scenarioById('take-wing')!.cast());
    startScenario(w, 'take-wing');
    w.time += 10;
    release(w, genomeOfMorphotype(9, 'bird'), 4, undefined, 'bird'); // (an introduction)
    judgeScenario(w);
    expect(w.scenario!.status).toBe('going');
    // one of its own rodents grows a patagium
    const r = w.creatures.find((c) => c.traits.mass < 1 && c.traits.habitat === 'land' && !c.traits.glides)!;
    const g = structuredClone(r.genome) as Genome;
    for (let s: SegmentGene | undefined = g.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'leg') a.web = 0.6;
    const [glider] = release(w, g, 1, { x: r.x, z: r.z }, undefined, w.species.find((s) => s.id === r.species)!);
    expect(glider.traits.glides || glider.traits.flies).toBe(true);
    judgeScenario(w);
    expect(w.scenario!.status).toBe('won');
  });

  it('god mode is not offered in a scenario', () => {
    const w = createWorld(2);
    startScenario(w, 'ice-age');
    setGodMode(w, true);
    expect(w.god.on).toBe(false);
    expect(w.levers.events.some((e) => e.kind === 'ice-age')).toBe(true);
  });
});
