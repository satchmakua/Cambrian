import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, STEP, DAY_LENGTH } from '../../src/sim/world';
import { saveWorld, loadWorld } from '../../src/sim/persist';
import { adoptWorld, chronicle, runFor, snapshotForChronicle } from '../../src/sim/fastForward';
import { genomeOfMorphotype } from '../../src/engine/random';

function living(seed: number) {
  const w = createWorld(seed);
  const kinds: [string, number][] = [['rodent', 8], ['ungulate', 6], ['bird', 6], ['fish', 7], ['canid', 3]];
  kinds.forEach(([kind, n], i) => release(w, genomeOfMorphotype(seed * 97 + i * 13, kind), n, undefined, kind));
  return w;
}

describe('fast-forward', () => {
  it('a world run on in a "worker" (save → run → load → adopt) is the world run on in place', () => {
    const a = living(2);
    const b = living(2);
    // in place
    for (let i = 0; i < DAY_LENGTH / STEP; i++) stepWorld(a);
    // shipped out as a save, run there, and folded back into the same object
    const far = loadWorld(saveWorld(b));
    runFor(far, DAY_LENGTH);
    const keep = b.terrain;
    adoptWorld(b, loadWorld(saveWorld(far)));
    expect(b.terrain).toBe(keep); // the landscape survives
    expect(saveWorld(b)).toBe(saveWorld(a));
  });

  it('the chronicle tells what happened: births, deaths and new species', () => {
    const w = living(4);
    const before = snapshotForChronicle(w);
    runFor(w, DAY_LENGTH * 2);
    const c = chronicle(before, w);
    expect(c.seconds).toBeCloseTo(DAY_LENGTH * 2, 3);
    expect(c.born).toBe(w.tally.births);
    expect(c.population[1]).toBe(w.creatures.length);
    for (const name of c.arose) expect(w.species.some((s) => s.name === name)).toBe(true);
  });

  it('can stop early at a clean step', () => {
    const w = living(5);
    let calls = 0;
    runFor(w, DAY_LENGTH, () => calls++, () => true, 100);
    expect(w.stepCount).toBe(100);
    expect(calls).toBe(1);
  });
});
