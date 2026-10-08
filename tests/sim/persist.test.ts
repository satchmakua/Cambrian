import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, STEP, worldHash } from '../../src/sim/world';
import { saveWorld, loadWorld } from '../../src/sim/persist';
import { genomeOfMorphotype } from '../../src/engine/random';

const run = (w: ReturnType<typeof createWorld>, seconds: number) => {
  for (let i = 0; i < seconds / STEP; i++) stepWorld(w);
};

function living(seed: number) {
  const w = createWorld(seed);
  const kinds: [string, number][] = [['rodent', 8], ['ungulate', 6], ['bird', 6], ['fish', 7], ['canid', 3], ['felid', 2]];
  kinds.forEach(([kind, n], i) => release(w, genomeOfMorphotype(seed * 97 + i * 13, kind), n, undefined, kind));
  return w;
}

describe('saving a world', () => {
  it('a saved world reloads and carries on bit-for-bit as the original would', () => {
    const a = living(3);
    run(a, 420);
    expect(a.corpses.length + a.tally.births).toBeGreaterThan(0);
    const saved = saveWorld(a);
    const b = loadWorld(saved);
    expect(saveWorld(b)).toBe(saved);
    run(a, 150);
    run(b, 150);
    expect(worldHash(b)).toBe(worldHash(a));
    expect(saveWorld(b)).toBe(saveWorld(a));
  });

  it('stores each genome once and keeps genome identity (founders stay their herds’ genomes)', () => {
    const a = living(4);
    const json = JSON.parse(saveWorld(a));
    expect(json.genomes.length).toBe(6);
    const b = loadWorld(saveWorld(a));
    for (const sp of b.species) {
      const first = b.creatures.find((c) => c.species === sp.id);
      if (first) expect(first.genome).toBe(sp.founder);
    }
  });

  it('rejects things that are not saved worlds', () => {
    expect(() => loadWorld('nope')).toThrow(/not valid JSON/);
    expect(() => loadWorld('{"format":"other"}')).toThrow(/Not a saved/);
    expect(() => loadWorld('{"format":"cambrian-world","v":99}')).toThrow(/version/);
  });
});
