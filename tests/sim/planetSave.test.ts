import { describe, expect, it } from 'vitest';
import { createPlanet, createWorld, stepWorld, worldHash, DAY_LENGTH, STEP, type World } from '../../src/sim/world';
import { loadWorld, PLANET_SAVE_VERSION, SAVE_VERSION, saveWorld, savedPlanetSpec } from '../../src/sim/persist';
import { applyFrame, frameOf, genomeTable, sentOf } from '../../src/sim/replica';
import { populateCast } from '../../src/sim/cast';
import { checkDesign, DESIGN_KEYS, DESIGN_RANGES, EARTHLIKE, onStep, PLANET_CAPS, PLANET_PRESETS, presetOf, specOf } from '../../src/sim/planetDesign';
import { CAPACITIES } from '../../src/sim/model';
import type { PlanetSurface } from '../../src/sim/planetSurface';

const SPEC = { seed: 11, radius: 120, relief: 24, land: 0.55, continents: 0.5, rugged: 0.5, temperature: 0.1, wetness: 0.2, tilt: 0.45, shelf: 0.3 };
const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds / STEP; i++) stepWorld(w);
};

function lived(): World {
  const w = createPlanet(SPEC, 165);
  populateCast(w, 'standard');
  run(w, 90);
  return w;
}

describe('a planet, saved', () => {
  it('reloads and carries on bit-for-bit as the original would', () => {
    const a = lived();
    expect(a.tally.births + a.corpses.length).toBeGreaterThan(0);
    const saved = saveWorld(a);
    const b = loadWorld(saved);
    expect(b.surface.kind).toBe('planet');
    expect(saveWorld(b)).toBe(saved);
    run(a, 60);
    run(b, 60);
    expect(worldHash(b)).toBe(worldHash(a));
    expect(saveWorld(b)).toBe(saveWorld(a));
  });

  it('is version 2, and carries its planet: the spec it is made from, its bake and checksum', () => {
    const w = lived();
    const json = JSON.parse(saveWorld(w));
    expect(json.v).toBe(PLANET_SAVE_VERSION);
    expect(json.planet.spec).toEqual(SPEC);
    expect(json.planet.checksum).toBe((w.surface as PlanetSurface).ground.bake.checksum);
    expect(savedPlanetSpec(saveWorld(w))).toEqual(SPEC);
    // (a valley is still version 1, with no planet in it: its saves are as they always were)
    const v = JSON.parse(saveWorld(createWorld(3)));
    expect(v.v).toBe(SAVE_VERSION);
    expect('planet' in v).toBe(false);
    expect(savedPlanetSpec(saveWorld(createWorld(3)))).toBe(null);
  });

  it('loads a planet made again that is not quite the one saved, and says so in the journal once', () => {
    const json = JSON.parse(saveWorld(lived()));
    json.planet.checksum = 'deadbeef';
    const w = loadWorld(JSON.stringify(json));
    expect(w.events[w.events.length - 1].text).toMatch(/another browser/);
    // (its next save holds this ground's mark, so it is not said again)
    const again = loadWorld(saveWorld(w));
    expect(again.events.length).toBe(w.events.length);
  });

  it('refuses a planet it cannot read', () => {
    const json = JSON.parse(saveWorld(lived()));
    json.planet.spec.radius = 'big';
    expect(() => loadWorld(JSON.stringify(json))).toThrow(/planet is unreadable/);
    delete json.planet;
    expect(() => loadWorld(JSON.stringify(json))).toThrow(/planet is unreadable/);
  });

  it('crosses from the worker to the page: a mirrored planet saves byte for byte as the one stepped', () => {
    const w = lived();
    const r = loadWorld(saveWorld(w));
    const sent = sentOf(w);
    const table = genomeTable(r);
    for (let t = 0; t < DAY_LENGTH / 4; t++) {
      for (let i = 0; i < 2 / STEP; i++) stepWorld(w);
      applyFrame(r, structuredClone(frameOf(w, sent)), table);
    }
    expect(saveWorld(r)).toBe(saveWorld(w));
  });
});

describe('a planet’s design', () => {
  it('holds every value to its slider’s range and step', () => {
    expect(onStep('land', 0.6123)).toBe(0.6);
    expect(onStep('radius', 9999)).toBe(DESIGN_RANGES.radius.max);
    expect(onStep('temperature', -0.333)).toBe(-0.35);
    expect(checkDesign({ ...EARTHLIKE, land: 'lots', tilt: Infinity, radius: 312 })).toEqual({ ...EARTHLIKE, radius: 300 });
    expect(checkDesign(null)).toBe(null);
    expect(checkDesign([1, 2])).toBe(null);
  });

  it('has presets on their sliders’ steps, each known for itself', () => {
    const ids = new Set<string>();
    for (const p of PLANET_PRESETS) {
      for (const k of DESIGN_KEYS) expect(onStep(k, p.design[k])).toBe(p.design[k]);
      expect(presetOf(p.design)?.id).toBe(p.id);
      ids.add(p.id);
    }
    expect(ids.size).toBe(PLANET_PRESETS.length);
    expect(presetOf({ ...EARTHLIKE, land: 0.45 })).toBe(null);
    expect(specOf(7, EARTHLIKE)).toEqual({ seed: 7, ...EARTHLIKE });
    // (a planet holds the valley's three sizes, and one twice its largest)
    expect(PLANET_CAPS).toEqual([...CAPACITIES, 2 * CAPACITIES[CAPACITIES.length - 1]]);
  });
});
