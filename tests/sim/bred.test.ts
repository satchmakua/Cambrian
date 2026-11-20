import { describe, it, expect } from 'vitest';
import { boostSpecies, bredFromHere, cloneCreature, createWorld, release, speciesById, takeHome, worldHash } from '../../src/sim/world';
import { speciesProfile } from '../../src/sim/evolution';
import { loadWorld, saveWorld } from '../../src/sim/persist';
import { genomeOfMorphotype } from '../../src/engine/random';
import { mutate } from '../../src/engine/mutate';

function valley() {
  const w = createWorld(5);
  const [first] = release(w, genomeOfMorphotype(21, 'ungulate'), 6, undefined, 'ungulate');
  release(w, genomeOfMorphotype(22, 'canid'), 3, undefined, 'canid');
  return { w, first };
}

describe('a creature taken home, bred, and released', () => {
  it('comes back as its own species, a branch of the one it was bred from', () => {
    const { w, first } = valley();
    const source = speciesById(w, first.species)!;
    takeHome(w, first);
    // in the breeder: the lineage is rooted at the creature taken home, and bred on from it
    const root = structuredClone(first.genome);
    let bred = root;
    for (let i = 0; i < 6; i++) bred = mutate(bred, 100 + i, i);
    const from = bredFromHere(w, root);
    expect(from?.id).toBe(source.id);
    const out = release(w, bred, 4, { x: first.x, z: first.z }, undefined, from!);
    expect(out).toHaveLength(4);
    const sp = speciesById(w, out[0].species)!;
    expect(sp.id).not.toBe(source.id);
    expect(sp.parent).toBe(source.id);
    expect(sp.bred).toBe(true);
    expect(sp.kind).toBe('ungulate');
    expect(sp.name).not.toBe(source.name);
    expect(speciesProfile(w, sp.id)!.parent).toEqual({ id: source.id, name: source.name, how: 'bred' });
    // released again, the same bred creature joins its branch
    const again = release(w, bred, 2, undefined, undefined, from!);
    expect(again[0].species).toBe(sp.id);
    // a lineage not rooted here was not bred from this valley
    expect(bredFromHere(w, genomeOfMorphotype(99, 'felid'))).toBeNull();
  });

  it('what was taken home, and what was bred, are kept in a save', () => {
    const { w, first } = valley();
    takeHome(w, first);
    const from = bredFromHere(w, first.genome)!;
    release(w, mutate(first.genome, 7, 0), 3, undefined, undefined, from);
    const b = loadWorld(saveWorld(w));
    expect(b.homes).toEqual(w.homes);
    expect(b.species.filter((s) => s.bred).map((s) => s.parent)).toEqual([from.id]);
    expect(worldHash(b)).toBe(worldHash(w));
  });
});

describe('more of a kind, by hand', () => {
  it('a clone is the creature again: its genome, its species, its generation, beside it', () => {
    const { w, first } = valley();
    first.generation = 7;
    const before = speciesById(w, first.species)!.alive;
    const copies = cloneCreature(w, first, 5);
    expect(copies).toHaveLength(5);
    for (const c of copies) {
      expect(c.genome).toBe(first.genome);
      expect(c.species).toBe(first.species);
      expect(c.generation).toBe(7);
      expect(Math.hypot(c.x - first.x, c.z - first.z)).toBeLessThan(10);
    }
    expect(speciesById(w, first.species)!.alive).toBe(before + 5);
    first.alive = false;
    expect(cloneCreature(w, first, 2)).toHaveLength(0); // (the dead are not copied)
  });

  it('a species boosted gains members from its own stock', () => {
    const { w, first } = valley();
    const sp = speciesById(w, first.species)!;
    const before = sp.alive;
    const more = boostSpecies(w, sp, 5);
    expect(more).toHaveLength(5);
    expect(more.every((c) => c.species === sp.id)).toBe(true);
    expect(sp.alive).toBe(before + 5);
  });
});
