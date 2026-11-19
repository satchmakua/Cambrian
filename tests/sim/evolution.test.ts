import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, STEP, SPECIATION_DIST, TREND_EVERY, TREND_MAX, type World } from '../../src/sim/world';
import { saveWorld, loadWorld } from '../../src/sim/persist';
import { speciesProfile } from '../../src/sim/evolution';
import { genomeOfMorphotype } from '../../src/engine/random';

const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds / STEP; i++) stepWorld(w);
};

function living(seed: number) {
  const w = createWorld(seed);
  const kinds: [string, number][] = [['rodent', 8], ['ungulate', 6], ['bird', 6], ['fish', 7], ['canid', 3], ['felid', 2]];
  kinds.forEach(([kind, n], i) => release(w, genomeOfMorphotype(seed * 97 + i * 13, kind), n, undefined, kind));
  return w;
}

// one valley, run for two days, shared by the tests that only read it
const W = living(3);
run(W, 480);

describe('a species keeps its own records', () => {
  it('every death is counted once, by its cause', () => {
    let total = 0;
    for (const sp of W.species) {
      const c = sp.causes;
      expect(c.starvation + c.predation + c.oldAge, sp.name).toBe(sp.deaths);
      total += sp.deaths;
    }
    expect(total).toBe(W.tally.kills + W.tally.starvation + W.tally.oldAge);
    expect(total).toBeGreaterThan(0);
  });

  it("a kill is written on both sides: the hunter's 'killed' and its prey's 'killed by'", () => {
    let kills = 0;
    for (const prey of W.species) {
      for (const [hid, n] of Object.entries(prey.killedBy)) {
        const hunter = W.species.find((s) => s.id === Number(hid))!;
        expect(hunter.killed[prey.id], `${hunter.name} → ${prey.name}`).toBe(n);
        kills += n;
      }
      // (a kill whose hunter died before its prey did is counted as predation, with no one to name)
      const named = Object.values(prey.killedBy).reduce((a, b) => a + b, 0);
      expect(named).toBeLessThanOrEqual(prey.causes.predation);
    }
    expect(kills).toBeGreaterThan(0);
  });

  it('its living members are averaged every quarter day: how many, how big, how fast, how far from the founder', () => {
    for (const sp of W.species.filter((s) => s.parent === null)) {
      // released at the start: a sample at every quarter day it had members
      expect(sp.trend.length, sp.name).toBeGreaterThanOrEqual(sp.extinctAt === null ? 8 : 1);
      for (let i = 1; i < sp.trend.length; i++) expect(sp.trend[i].t - sp.trend[i - 1].t).toBeCloseTo(TREND_EVERY * sp.trendStride, 6);
      for (const x of sp.trend) {
        expect(x.n).toBeGreaterThan(0);
        expect(x.mass).toBeGreaterThan(0);
        expect(x.sprint).toBeGreaterThan(0);
        expect(x.drift).toBeGreaterThanOrEqual(0);
        expect(x.coat).toBeGreaterThanOrEqual(0);
        expect(x.coat).toBeLessThanOrEqual(1);
        expect(x.hunters).toBeGreaterThanOrEqual(0);
        expect(x.hunters).toBeLessThanOrEqual(1);
      }
      // the dead so far only ever grow
      for (let i = 1; i < sp.trend.length; i++) {
        expect(sp.trend[i].starved).toBeGreaterThanOrEqual(sp.trend[i - 1].starved);
        expect(sp.trend[i].eaten).toBeGreaterThanOrEqual(sp.trend[i - 1].eaten);
      }
      // a quarter day in it is still nearly all its founders' body (a mutant or two born since)
      expect(sp.trend[0].drift, sp.name).toBeLessThan(SPECIATION_DIST / 3);
    }
  });

  it("a long-lived species' trend is thinned to half, its spacing kept even, so its whole history fits", () => {
    const w = living(5);
    run(w, TREND_EVERY + STEP * 2);
    const sp = w.species.find((s) => s.alive > 0)!;
    // (as if it had lived TREND_MAX quarter days)
    const t0 = sp.trend[sp.trend.length - 1].t;
    while (sp.trend.length < TREND_MAX - 1) sp.trend.push({ ...sp.trend[sp.trend.length - 1], t: t0 - TREND_EVERY * (TREND_MAX - sp.trend.length) });
    sp.trend.sort((a, b) => a.t - b.t);
    sp.trend[0] = { ...sp.trend[0], t: sp.trend[1].t - TREND_EVERY };
    run(w, TREND_EVERY * 5);
    expect(sp.trendStride).toBe(2);
    expect(sp.trend.length).toBeLessThan(TREND_MAX / 2 + 4);
    // after the first, every sample sits on the doubled stride
    for (const x of sp.trend.slice(1)) expect(Math.abs(Math.round(x.t / TREND_EVERY)) % 2).toBe(0);
  });

  it('the records are saved with the world, and a world saved before them loads with them empty', () => {
    const b = loadWorld(saveWorld(W));
    for (const sp of W.species) {
      const s = b.species.find((x) => x.id === sp.id)!;
      expect(s.causes).toEqual(sp.causes);
      expect(s.killedBy).toEqual(sp.killedBy);
      expect(s.trend).toEqual(sp.trend);
    }
    const old = JSON.parse(saveWorld(W));
    for (const s of old.species) {
      delete s.causes;
      delete s.killedBy;
      delete s.killed;
      delete s.trend;
      delete s.trendStride;
    }
    const c = loadWorld(JSON.stringify(old));
    const sp = c.species[0];
    expect(sp.causes).toEqual({ starvation: 0, predation: 0, oldAge: 0 });
    expect(sp.trend).toEqual([]);
    expect(sp.trendStride).toBe(1);
    run(c, TREND_EVERY);
    expect(c.species.some((s) => s.trend.length > 0)).toBe(true);
  });
});

describe("a species' profile", () => {
  it('says where it lives, what it eats, what eats it and what it dies of', () => {
    const hunter = W.species.find((s) => Object.keys(s.killed).length > 0)!;
    expect(hunter).toBeDefined();
    const p = speciesProfile(W, hunter.id)!;
    expect(p.prey.length).toBeGreaterThan(0);
    expect(p.prey[0].count).toBeGreaterThanOrEqual(p.prey[p.prey.length - 1].count);
    const victim = speciesProfile(W, p.prey[0].id)!;
    expect(victim.predators.some((r) => r.id === hunter.id)).toBe(true);
    for (const sp of W.species.filter((s) => s.alive > 0)) {
      const q = speciesProfile(W, sp.id)!;
      expect(q.where.length).toBeGreaterThan(0);
      expect(q.where.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1, 6);
      expect(W.creatures.some((c) => c.alive && c.species === sp.id && c.genome === q.now)).toBe(true);
    }
    const fish = W.species.find((s) => s.kind === 'fish' && s.alive > 0);
    if (fish) expect(speciesProfile(W, fish.id)!.where[0].biome).toMatch(/shallow|deep/);
    expect(speciesProfile(W, 1e9)).toBeNull();
  });

  it("a branch names the species it came from, and the parent names its branches", () => {
    const w = living(7);
    run(w, 960);
    const branch = w.species.find((s) => s.parent !== null);
    if (!branch) return; // (no speciation in this run: nothing to check)
    const p = speciesProfile(w, branch.id)!;
    expect(p.parent?.id).toBe(branch.parent);
    expect(speciesProfile(w, branch.parent!)!.daughters.some((d) => d.id === branch.id)).toBe(true);
  });
});
