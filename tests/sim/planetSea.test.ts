import { describe, expect, it } from 'vitest';
import { createPlanet, createWorld, stepWorld, DAY_LENGTH, STEP, type World } from '../../src/sim/world';
import { loadWorld, saveWorld } from '../../src/sim/persist';
import { applySea, seaShown, seaTarget, setSea, startEvent } from '../../src/sim/levers';
import { biomeOn, heightOn, levelOn, makePlanetGround } from '../../src/sim/planetGround';
import type { PlanetSurface } from '../../src/sim/planetSurface';
import { cellCentre } from '../../src/sim/cubeGrid';
import { populateCast } from '../../src/sim/cast';

const SPEC = { seed: 23, radius: 120, relief: 20, land: 0.5 };
const runDays = (w: World, days: number) => {
  for (let i = 0; i < (days * DAY_LENGTH) / STEP; i++) stepWorld(w);
};

/** the share of the planet's surface standing above its water, with the sea where the world has it */
function landShare(w: World): number {
  const S = w.surface as PlanetSurface;
  let dry = 0;
  for (let k = 0; k < S.cells; k++) {
    const p = S.cellCenter(k);
    if (S.height(p) > S.level(p)) dry++;
  }
  return dry / S.cells;
}

describe('the sea as a lever', () => {
  it('a risen sea floods the low ground, a fallen one lays the shelves bare; the lakes keep their own', () => {
    const g = makePlanetGround(SPEC);
    const N = g.bake.grid.N;
    let drowned = 0, bared = 0, lakes = 0;
    for (let k = 0; k < g.bake.grid.count; k += 5) {
      const p = cellCentre(N, k);
      const h = heightOn(g, p), L = levelOn(g, p);
      // (where the sea rises over dry ground, it is the sea; where it falls from the sea floor, dry ground)
      if (h > L && h < 2 && L === 0) {
        expect(levelOn(g, p, 2)).toBe(2);
        expect(['shallow', 'deep']).toContain(biomeOn(g, p, 2));
        drowned++;
      }
      if (L === 0 && h < 0 && h > -3) {
        expect(levelOn(g, p, -3)).toBe(-3);
        expect(['shallow', 'deep']).not.toContain(biomeOn(g, p, -3));
        bared++;
      }
      // (a lake above the fallen sea keeps its brim)
      if (L > 0.5 && h < L) {
        expect(levelOn(g, p, -3)).toBe(L);
        lakes++;
      }
    }
    expect(drowned).toBeGreaterThan(20);
    expect(bared).toBeGreaterThan(20);
    expect(lakes).toBeGreaterThan(0);
    // (with the sea at its own level, nothing changes)
    for (let k = 0; k < g.bake.grid.count; k += 97) expect(levelOn(g, cellCentre(N, k), 0)).toBe(levelOn(g, cellCentre(N, k)));
  });

  it('moves the sea a little each day, and the land, the grass and the shallows with it', () => {
    const w = createPlanet(SPEC, 165);
    const S = w.surface as PlanetSurface;
    const land0 = landShare(w);
    const grass0 = w.grassCap.reduce((a, b) => a + b, 0);
    expect(setSea(w, -1)).toBe(true);
    expect(setSea(w, -1)).toBe(false);
    expect(seaTarget(w)).toBeCloseTo(-0.1 * SPEC.relief);
    runDays(w, 2);
    // (on its way: two days of a fall of a thirtieth of the relief a day)
    expect(w.levers.seaNow!).toBeCloseTo((-2 * SPEC.relief) / 30, 5);
    expect(S.seaLevel()).toBe(seaShown(w));
    runDays(w, 5);
    expect(w.levers.seaNow).toBe(seaTarget(w));
    expect(S.seaLevel()).toBe(-2);
    expect(landShare(w)).toBeGreaterThan(land0 + 0.02);
    expect(w.grassCap.reduce((a, b) => a + b, 0)).toBeGreaterThan(grass0);
    expect(w.events.some((e) => e.text.includes('lower than its own level'))).toBe(true);
    // and back, past its own level, the low coasts drowned
    setSea(w, 1);
    runDays(w, 13);
    expect(S.seaLevel()).toBe(2);
    expect(landShare(w)).toBeLessThan(land0 - 0.01);
    for (const b of w.plants) if (S.height(b) < S.level(b)) expect(b.fruit).toBe(0);
  });

  it('falls through an ice age on a planet, and comes back after', () => {
    const w = createPlanet(SPEC, 165);
    startEvent(w, 'ice-age');
    expect(seaTarget(w)).toBeCloseTo(-0.05 * SPEC.relief);
    runDays(w, 4);
    expect(w.levers.seaNow!).toBeCloseTo(-0.05 * SPEC.relief, 9);
    w.levers.events = [];
    runDays(w, 4);
    expect(w.levers.seaNow).toBe(0);
  });

  it('is saved, and a world loaded mid-fall carries on bit-for-bit', () => {
    const w = createPlanet(SPEC, 165);
    populateCast(w, 'sparse');
    setSea(w, -1);
    runDays(w, 1.6);
    const saved = saveWorld(w);
    const b = loadWorld(saved);
    expect((b.surface as PlanetSurface).seaLevel()).toBe((w.surface as PlanetSurface).seaLevel());
    expect(Array.from(b.grassCap)).toEqual(Array.from(w.grassCap));
    expect(saveWorld(b)).toBe(saved);
    runDays(w, 1);
    runDays(b, 1);
    expect(saveWorld(b)).toBe(saveWorld(w));
  });

  it('is no lever in a valley: its levers and its saves are as they were', () => {
    const w = createWorld(4);
    expect(setSea(w, -1)).toBe(false);
    expect('sea' in w.levers).toBe(false);
    startEvent(w, 'ice-age');
    runDays(w, 0.2);
    expect('seaNow' in w.levers).toBe(false);
    applySea(w, true);
    expect(JSON.parse(saveWorld(w)).levers.sea).toBeUndefined();
  });
});
