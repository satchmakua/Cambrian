import { describe, expect, it } from 'vitest';
import { createPlanet, stepWorld, DAY_LENGTH, STEP, type World } from '../../src/sim/world';
import { populateCast } from '../../src/sim/cast';
import { scenarioById, startScenario } from '../../src/sim/scenarios';
import { landsOf, makePlanetGround } from '../../src/sim/planetGround';
import { SEA } from '../../src/sim/planetBake';
import { PLANET_PRESETS, specOf } from '../../src/sim/planetDesign';
import type { PlanetSurface } from '../../src/sim/planetSurface';
import type { Place } from '../../src/sim/surface';
import { checkSetup } from '../../src/ui/saves';

const ARCHIPELAGO = { ...PLANET_PRESETS.find((p) => p.id === 'archipelago')!.design, radius: 200 };
const toDawn = (w: World) => {
  const day = Math.floor(w.time / DAY_LENGTH);
  while (Math.floor(w.time / DAY_LENGTH) === day) stepWorld(w);
};
/** run on to a moment before the next dawn */
const almostDawn = (w: World) => {
  while (w.time % DAY_LENGTH < DAY_LENGTH - 3 * STEP) stepWorld(w);
};

/** The first field cell's middle that passes `ok` (a place on the ground to set animals down on). */
function placeWhere(w: World, ok: (p: Place) => boolean): Place {
  const S = w.surface as PlanetSurface;
  for (let k = 0; k < S.cells; k += 7) {
    const p = S.cellCenter(k);
    if (S.height(p) > S.level(p) + 0.8 && ok(p)) return p;
  }
  throw new Error('no such place');
}

/** Set `n` of the scenario's own walkers (its rodents) down at p, as if they had come there themselves. */
function bring(w: World, p: Place, n: number): void {
  const S = w.surface;
  const kin = w.creatures.filter((c) => c.alive && c.traits.habitat === 'land' && !c.traits.flies && !c.traits.glides).slice(0, n);
  expect(kin.length).toBe(n);
  for (const c of kin) {
    S.moveTo(c, p);
    S.aim(c, p);
    S.settle(c);
  }
}

describe('a planet’s lands', () => {
  it('numbers every land, the largest first, its lakes and rivers with it', () => {
    const g = makePlanetGround(specOf(5, ARCHIPELAGO));
    const { label, cells } = landsOf(g);
    let land = 0;
    for (let k = 0; k < label.length; k++) {
      expect(label[k] < 0).toBe(g.bake.kind[k] === SEA);
      if (label[k] >= 0) land++;
    }
    expect(cells.reduce((a, b) => a + b, 0)).toBe(land);
    for (let i = 1; i < cells.length; i++) expect(cells[i]).toBeLessThanOrEqual(cells[i - 1]);
    // (an archipelago is islands: a good many of any size)
    expect(cells.filter((c) => c > 200).length).toBeGreaterThan(4);
  });
});

describe('a planet’s scenarios', () => {
  it('Across the water: won once six of its own walkers live on an island none of its founders stood on', () => {
    const w = createPlanet(specOf(5, ARCHIPELAGO), 330);
    const sc = scenarioById('across')!;
    populateCast(w, sc.cast());
    startScenario(w, sc.id);
    const S = w.surface as PlanetSurface;
    toDawn(w);
    expect(w.scenario!.status).toBe('going');
    const started = new Set(w.scenario!.lands);
    expect(started.size).toBeGreaterThan(0);
    almostDawn(w);
    bring(w, placeWhere(w, (p) => S.landOf(p) >= 0 && !started.has(S.landOf(p))), 6);
    toDawn(w);
    expect(w.scenario!.status).toBe('won');
    expect(sc.progress(w)).toMatch(/of your walkers on other islands/);
  });

  it('Life on the ice: won once six of its own land animals live where the year is below −6°', () => {
    const w = createPlanet(specOf(9, { ...PLANET_PRESETS[0].design, radius: 200 }), 330);
    const sc = scenarioById('ice-cap')!;
    populateCast(w, sc.cast());
    startScenario(w, sc.id);
    const S = w.surface as PlanetSurface;
    toDawn(w);
    expect(w.scenario!.status).toBe('going');
    almostDawn(w);
    bring(w, placeWhere(w, (p) => S.warmthAt(p) < -8), 6);
    toDawn(w);
    expect(w.scenario!.status).toBe('won');
  });

  it('is played only on a planet', () => {
    expect(checkSetup({ worldSeed: 1, ecosystem: 'standard', scenario: 'across' }).scenario).toBeUndefined();
    expect(checkSetup({ worldSeed: 1, ecosystem: 'standard', scenario: 'across', planet: ARCHIPELAGO }).scenario).toBe('across');
    expect(checkSetup({ worldSeed: 1, ecosystem: 'standard', scenario: 'take-wing' }).scenario).toBe('take-wing');
  });
});

