import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, STEP, dryNow, skyNow, speciesById, worldHash } from '../../src/sim/world';
import { bloom, carry, cull, forceWeather, glut, heal, makeBreed, setGodMode, setImmigration, setMutation, smite, DROUGHT_FOR, RAIN_FOR } from '../../src/sim/god';
import { loadWorld, saveWorld } from '../../src/sim/persist';
import { genomeOfMorphotype } from '../../src/engine/random';

function valley() {
  const w = createWorld(9);
  release(w, genomeOfMorphotype(31, 'ungulate'), 6, undefined, 'ungulate');
  release(w, genomeOfMorphotype(32, 'fish'), 4, undefined, 'fish');
  return w;
}
const godLines = (w: ReturnType<typeof createWorld>) => w.events.filter((e) => e.kind === 'god').length;

describe('god mode', () => {
  it('with god mode off, no act does anything', () => {
    const w = valley();
    const c = w.creatures[0];
    const before = saveWorld(w);
    expect([smite(w, c), cull(w, c), heal(w, c), carry(w, c, { x: 0, z: 0 }), makeBreed(w, c), bloom(w), glut(w), forceWeather(w, 'rain'), setMutation(w, 3), setImmigration(w, false)]).toEqual(Array(10).fill(false));
    expect(saveWorld(w)).toBe(before);
  });

  it('each act on a creature works, and is told in the journal', () => {
    const w = valley();
    setGodMode(w, true);
    expect(godLines(w)).toBe(1);
    const [a, b, c, d] = w.creatures;
    const sp = speciesById(w, a.species)!;
    // heal and feed
    a.health = 1;
    a.energy = 1;
    expect(heal(w, a)).toBe(true);
    expect(a.health).toBe(a.traits.maxHealth);
    expect(a.energy).toBeGreaterThan(1);
    // carry
    expect(carry(w, b, { x: 10, z: -12 })).toBe(true);
    expect([b.x, b.z]).toEqual([10, -12]);
    // breed: a litter or a clutch, at once
    const n = w.creatures.length + w.eggs.length;
    for (const x of [a, c]) x.age = x.traits.maturity * 1.5;
    expect(makeBreed(w, a)).toBe(true);
    expect(w.creatures.length + w.eggs.length).toBeGreaterThan(n);
    // smite leaves a carcass; a cull none
    const corpses = w.corpses.length, alive = sp.alive;
    expect(smite(w, c)).toBe(true);
    expect(w.corpses.length).toBe(corpses + 1);
    expect(cull(w, d)).toBe(true);
    expect(w.corpses.length).toBe(corpses + 1);
    expect(sp.alive).toBe(alive - 2);
    // (neither counts as a kill of the valley's own)
    expect(w.tally.kills).toBe(0);
    expect(godLines(w)).toBe(6);
  });

  it('each act on the valley works, and is told in the journal', () => {
    const w = valley();
    setGodMode(w, true);
    for (let k = 0; k < w.algae.length; k++) w.algae[k] = 0;
    expect(bloom(w)).toBe(true);
    expect(Array.from(w.algae)).toEqual(Array.from(w.algaeCap));
    for (const p of w.plants) p.fruit = 0;
    expect(glut(w)).toBe(true);
    expect(w.plants.every((p) => p.fruit === p.max)).toBe(true);
    // rain now: clouds over, rains, and is gone in half a day
    expect(forceWeather(w, 'rain')).toBe(true);
    for (let i = 0; i < RAIN_FOR / 2 / STEP; i++) stepWorld(w);
    expect(skyNow(w).rain).toBeGreaterThan(0.5);
    for (let i = 0; i < RAIN_FOR / STEP; i++) stepWorld(w);
    expect(w.time).toBeGreaterThan(w.god.forced!.until);
    // a drought now: as dry as the hardest year, for three days
    expect(forceWeather(w, 'drought')).toBe(true);
    expect(dryNow(w)).toBe(1);
    expect(skyNow(w).rain).toBe(0);
    expect(w.god.forced!.until - w.god.forced!.from).toBe(DROUGHT_FOR);
    expect(setMutation(w, 2)).toBe(true);
    expect(w.god.mutation).toBe(2);
    expect(setImmigration(w, false)).toBe(true);
    expect(w.god.immigration).toBe(false);
    expect(godLines(w)).toBe(7);
  });

  it("god mode's settings are kept in a save, and the valley carries on from them bit-for-bit", () => {
    const w = valley();
    setGodMode(w, true);
    setMutation(w, 3);
    forceWeather(w, 'drought');
    for (let i = 0; i < 40 / STEP; i++) stepWorld(w);
    const b = loadWorld(saveWorld(w));
    expect(b.god).toEqual(w.god);
    for (let i = 0; i < 60 / STEP; i++) {
      stepWorld(w);
      stepWorld(b);
    }
    expect(worldHash(b)).toBe(worldHash(w));
  });
});
