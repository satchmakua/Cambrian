import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, DAY_LENGTH, STEP, type World } from '../../src/sim/world';
import { loadWorld, saveWorld } from '../../src/sim/persist';
import { applyFrame, frameOf, genomeTable, sentOf } from '../../src/sim/replica';
import { genomeOfMorphotype } from '../../src/engine/random';
import { starterCast } from '../../src/sim/cast';
import { setGodMode, bloom } from '../../src/sim/god';

/** a frame crosses to the page the way a worker's message does: structured-cloned */
const post = <T,>(x: T): T => structuredClone(x);

function lived(seed: number): World {
  const w = createWorld(seed);
  starterCast('standard').forEach(([kind, n], i) => release(w, genomeOfMorphotype((seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
  return w;
}

describe('the world, mirrored', () => {
  it('a replica fed frames is the world itself: a save of one is a save of the other', () => {
    const w = lived(5);
    const r = loadWorld(saveWorld(w)); // the page's copy, from the same save
    const sent = sentOf(w);
    const table = genomeTable(r);
    expect(table.length).toBe(sent.table.size);
    // two days, sent in runs of two seconds — births, deaths, a new day's speciation pass, the journal,
    // the history and the species' trends all cross
    for (let t = 0; t < (2 * DAY_LENGTH) / 2; t++) {
      for (let i = 0; i < 2 / STEP; i++) stepWorld(w);
      applyFrame(r, post(frameOf(w, sent)), table);
    }
    expect(w.tally.births).toBeGreaterThan(0);
    expect(saveWorld(r)).toBe(saveWorld(w));
    // …and a player's hand on the world crosses as well as the world's own turns
    setGodMode(w, true);
    bloom(w);
    release(w, genomeOfMorphotype(77, 'raptor'), 3);
    applyFrame(r, post(frameOf(w, sent)), table);
    expect(saveWorld(r)).toBe(saveWorld(w));
  });

  it('keeps the objects it holds: a creature, a species, a plant is the same object from frame to frame', () => {
    const w = lived(6);
    const r = loadWorld(saveWorld(w));
    const sent = sentOf(w);
    const table = genomeTable(r);
    const c = r.creatures[3], sp = r.species[0], plant = r.plants[0], g = r.creatures[3].genome;
    for (let t = 0; t < 10; t++) {
      for (let i = 0; i < 20; i++) stepWorld(w);
      applyFrame(r, post(frameOf(w, sent)), table);
    }
    const same = r.creatures.find((x) => x.id === c.id);
    if (same) {
      expect(same).toBe(c);
      expect(same.genome).toBe(g); // (its genome too: its grown body and skins stay as they are)
    }
    expect(r.species.find((x) => x.id === sp.id)).toBe(sp);
    expect(r.plants[0]).toBe(plant);
    expect(c.x).toBe(w.creatures.find((x) => x.id === c.id)?.x ?? c.x);
  });

  it('sends only what is new: nothing of what accumulates when nothing has happened', () => {
    const w = lived(7);
    const sent = sentOf(w);
    const first = frameOf(w, sent);
    expect(first.genomes).toHaveLength(0); // (the replica was loaded from the same save)
    expect(first.species.every((s) => s.trend !== null)).toBe(true);
    const again = frameOf(w, sent);
    expect(again.genomes).toHaveLength(0);
    expect(again.events).toBeNull();
    expect(again.history).toBeNull();
    expect(again.species.every((s) => s.trend === null)).toBe(true);
  });
});
