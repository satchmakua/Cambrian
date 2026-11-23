import { describe, expect, it } from 'vitest';
import { genomeOfMorphotype } from '../../src/engine/random';
import { stepWorld } from '../../src/sim/world';
import { EARTHLIKE, PLANET_PRESETS } from '../../src/sim/planetDesign';
import type { PlanetSurface } from '../../src/sim/planetSurface';
import { beginNewGame, loadGame, saveGame, startNewGame } from '../../src/ui/game';
import { checkSetup, describeSave, memoryStore } from '../../src/ui/saves';
import { useStore } from '../../src/ui/store';
import { getWorld, isPlanet, populate, worldForSave, worldSetup } from '../../src/world/worldStore';

// (a small planet, so a test bakes it in a moment)
const SMALL = { ...EARTHLIKE, radius: 200, relief: 20 };

describe('a game on a planet', () => {
  it('starts on a planet of its design, with room for a planet’s numbers', async () => {
    await beginNewGame({ name: 'World game', founder: genomeOfMorphotype(3, 'canid'), symmetry: 'auto', worldSeed: 4321, ecosystem: 'sparse', capacity: 1200, planet: SMALL, startIn: 'world' });
    const s = useStore.getState();
    expect(s.view).toBe('world');
    expect(s.game.setup).toEqual({ worldSeed: 4321, ecosystem: 'sparse', capacity: 1200, planet: SMALL });
    const w = getWorld();
    expect(isPlanet(w)).toBe(true);
    expect(w.cap).toBe(1200);
    expect((w.surface as PlanetSurface).ground.radius).toBe(200);
    expect(worldSetup().planet).toEqual(SMALL);
  });

  it('saves and loads: the planet comes back, the same ground and the same life', async () => {
    const store = memoryStore();
    startNewGame({ name: 'Planet save', founder: genomeOfMorphotype(5, 'felid'), symmetry: 'auto', worldSeed: 99, ecosystem: 'sparse', capacity: 600, planet: SMALL, startIn: 'breed' });
    const w = getWorld();
    populate(w, useStore.getState().nodes[useStore.getState().currentId].genome);
    for (let i = 0; i < 300; i++) stepWorld(w);
    const saved = await saveGame(store, 'On the planet', null, 7000);
    expect(saved.setup.planet).toEqual(SMALL);
    expect(describeSave(saved.summary, true)).toMatch(/a planet, Day 1/);
    const json = worldForSave()!;
    const checksum = (w.surface as PlanetSurface).ground.bake.checksum;
    // another game in its place, a valley…
    startNewGame({ name: 'A valley', founder: genomeOfMorphotype(2, 'rodent'), symmetry: 'auto', worldSeed: 5, ecosystem: 'empty', startIn: 'breed' });
    expect(isPlanet(getWorld())).toBe(false);
    // …and the planet back
    await loadGame(store, saved.id);
    const back = getWorld();
    expect(isPlanet(back)).toBe(true);
    expect((back.surface as PlanetSurface).ground.bake.checksum).toBe(checksum);
    expect(worldForSave()).toBe(json);
    expect(worldSetup().planet).toEqual(SMALL);
  });

  it('keeps a planet’s design through the set-up check, and a valley’s set-up as it was', () => {
    for (const p of PLANET_PRESETS) expect(checkSetup({ worldSeed: 1, ecosystem: 'standard', planet: p.design, capacity: 1200 })).toEqual({ worldSeed: 1, ecosystem: 'standard', capacity: 1200, planet: p.design });
    // (a valley cannot hold a planet's largest; nor is a design that is not one kept)
    expect(checkSetup({ worldSeed: 1, ecosystem: 'standard', capacity: 1200 })).toEqual({ worldSeed: 1, ecosystem: 'standard' });
    expect(checkSetup({ worldSeed: 1, ecosystem: 'standard', planet: 'round' })).toEqual({ worldSeed: 1, ecosystem: 'standard' });
  });
});
