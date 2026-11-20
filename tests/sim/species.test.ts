import { describe, it, expect } from 'vitest';
import {
  createWorld, release, stepWorld, bodyOf, STEP, DAY_LENGTH, SPECIATION_DIST, SPLIT_DIST, type World, type Species,
} from '../../src/sim/world';
import { saveWorld, loadWorld } from '../../src/sim/persist';
import { genomeOfMorphotype } from '../../src/engine/random';
import { describe as describeMorph, distance } from '../../src/engine/morphospace';
import { encodeGenome } from '../../src/engine/share';
import type { Genome } from '../../src/engine/genome';

const g = (kind: string, seed = 11) => genomeOfMorphotype(seed, kind);
const desc = (genome: Genome) => describeMorph(bodyOf(genome).phenotype);
const run = (w: World, seconds: number) => {
  for (let i = 0; i < seconds / STEP; i++) stepWorld(w);
};
/** Step across the next dawn (where the day's species work is done). */
const dawn = (w: World) => {
  w.time = (Math.floor(w.time / DAY_LENGTH) + 1) * DAY_LENGTH - STEP / 2;
  stepWorld(w);
};
const members = (w: World, sp: Species) => w.creatures.filter((c) => c.alive && c.species === sp.id);
const speciesOf = (w: World, id: number) => w.species.find((s) => s.id === id)!;
const books = (w: World) => {
  for (const sp of w.species) expect(sp.alive, sp.name).toBe(members(w, sp).length);
};
/** Fold every member of `from` into `to` (a mixed population, built by hand). */
function fold(w: World, from: Species, to: Species): void {
  for (const c of members(w, from)) {
    c.species = to.id;
    from.alive--;
    to.alive++;
  }
  from.extinctAt = w.time;
}
/** Keep a population still and well: nobody starves, breeds or wanders off during the test. */
function still(w: World): void {
  for (const c of w.creatures) {
    c.energy = c.traits.maxEnergy;
    c.breedCooldown = 1e6;
  }
}

// two plans far apart, and a third near neither
const A = g('canid', 21);
const B = g('crab', 22);

describe('species are populations, not single mutants', () => {
  it('the plans used here are far enough apart to test', () => {
    expect(distance(desc(A), desc(B))).toBeGreaterThan(Math.max(SPLIT_DIST, SPECIATION_DIST) * 1.2);
  });

  it("a release's animals are kin, not clones: the first is the founder's genome, the rest a little varied", () => {
    const w = createWorld(2);
    const band = release(w, A, 6);
    expect(band[0].genome).toBe(A);
    expect(new Set(band.map((c) => encodeGenome(c.genome))).size).toBe(6);
    for (const c of band) {
      // varied in its numbers only: the same plan, the same covering, close in morphospace
      expect(c.genome.covering.type).toBe(A.covering.type);
      expect(c.traits.legs).toBe(band[0].traits.legs);
      expect(distance(desc(c.genome), desc(A))).toBeLessThan(0.1);
    }
  });

  it("mutants are variation within their parents' species: no species of one is founded", () => {
    const w = createWorld(3);
    for (const [k, n] of [['rodent', 8], ['ungulate', 6], ['bird', 6], ['fish', 7], ['canid', 3]] as const) release(w, g(k), n, undefined, k);
    run(w, DAY_LENGTH * 4);
    expect(w.tally.mutations).toBeGreaterThan(0);
    for (const sp of w.species.filter((s) => s.parent !== null)) expect(sp.born, sp.name).toBeGreaterThanOrEqual(4);
    books(w);
  }, 60000);

  it('one herd varied about its genome neither splits nor takes a new name', () => {
    const w = createWorld(4);
    const herd = release(w, A, 12);
    still(w);
    const sp = speciesOf(w, herd[0].species);
    const n = w.species.length;
    dawn(w);
    expect(w.species.length).toBe(n);
    expect(sp.alive).toBe(12);
    expect(sp.evolvedInto).toBeNull();
  });

  it('two separate groups in one species split, and the group that changed takes the new name', () => {
    const w = createWorld(5);
    const old = release(w, A, 6);
    const derived = release(w, B, 6);
    still(w);
    const sp = speciesOf(w, old[0].species);
    fold(w, speciesOf(w, derived[0].species), sp);
    // (a gap must hold for six dawns running before the groups are two species)
    for (let d = 0; d < 5; d++) {
      dawn(w);
      still(w);
    }
    expect(w.species.some((s) => s.parent === sp.id), 'not yet, after five dawns').toBe(false);
    dawn(w);
    const branch = w.species.find((s) => s.parent === sp.id);
    expect(branch, 'a branch').toBeDefined();
    expect(branch!.alive).toBe(6);
    expect(sp.alive).toBe(6);
    for (const c of derived) expect(c.species).toBe(branch!.id);
    for (const c of old) expect(c.species).toBe(sp.id);
    expect(w.events.some((e) => e.kind === 'speciation' && e.text.includes('branched off'))).toBe(true);
    books(w);
  });

  it('a line whose members have all drifted from its founder takes a new name: the old one "became" it', () => {
    const w = createWorld(6);
    const founder = release(w, A, 1);
    const drifted = release(w, B, 10);
    still(w);
    const sp = speciesOf(w, founder[0].species);
    fold(w, speciesOf(w, drifted[0].species), sp);
    sp.extinctAt = null;
    dawn(w);
    expect(sp.evolvedInto).not.toBeNull();
    expect(sp.extinctAt).not.toBeNull();
    const next = speciesOf(w, sp.evolvedInto!);
    expect(next.parent).toBe(sp.id);
    expect(next.alive).toBe(11);
    expect(w.events.some((e) => e.kind === 'speciation' && e.text.includes('has become'))).toBe(true);
    books(w);
    // …an egg laid before the new name hatches into it
    const mum = drifted[1];
    w.eggs.push({ id: w.nextId++, x: mum.x, z: mum.z, y: mum.y, genome: mum.genome, species: sp.id, mother: mum.id, generation: 1, laidAt: w.time, hatchAt: w.time, nest: -1, water: false });
    stepWorld(w);
    expect(w.creatures.some((c) => c.alive && c.parent === mum.id && c.species === next.id)).toBe(true);
    // …and the books, the name and the line survive a save
    const b = loadWorld(saveWorld(w));
    const sb = b.species.find((s) => s.id === sp.id)!;
    expect(sb.evolvedInto).toBe(next.id);
    expect(sb.bank.length).toBeGreaterThan(0);
  });

  it('a stock that dies out comes back from its seed bank, not as copies of its first founders', () => {
    const w = createWorld(7);
    const band = release(w, A, 4);
    const sp = speciesOf(w, band[0].species);
    // what it had become here before it died out (its bank, refreshed each dawn while it lived)
    sp.bank = [B];
    for (const c of band) c.health = -1;
    stepWorld(w);
    expect(sp.extinctAt).not.toBeNull();
    sp.extinctAt = w.time - DAY_LENGTH * 2;
    for (let d = 0; d < 12 && members(w, sp).length === 0; d++) dawn(w);
    const back = members(w, sp);
    expect(back.length).toBeGreaterThan(0);
    for (const c of back) {
      expect(c.genome.covering.type).toBe(B.covering.type);
      expect(encodeGenome(c.genome)).not.toBe(encodeGenome(A));
    }
  });

  it('a line living on under a later name sends no one back for its old name', () => {
    const w = createWorld(8);
    const founder = release(w, A, 1);
    const drifted = release(w, B, 10);
    still(w);
    const sp = speciesOf(w, founder[0].species);
    fold(w, speciesOf(w, drifted[0].species), sp);
    sp.extinctAt = null;
    dawn(w);
    expect(sp.evolvedInto).not.toBeNull();
    still(w);
    for (let d = 0; d < 8; d++) dawn(w);
    expect(members(w, sp).length).toBe(0);
  });
});
