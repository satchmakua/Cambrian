import { describe, it, expect } from 'vitest';
import { createWorld, worldHash } from '../../src/sim/world';
import { castOf, checkCast, founderOf, lookFor, populateCast, starterCast, type CastEntry } from '../../src/sim/cast';
import { encodeGenome } from '../../src/engine/share';
import { genomeOfMorphotype } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { describe as describeMorph, distance } from '../../src/engine/morphospace';

describe('the cast a valley starts with', () => {
  it("an ecosystem's cast, as entries, releases exactly the valley the ecosystem does", () => {
    for (const eco of ['standard', 'sparse'] as const) {
      const a = createWorld(7), b = createWorld(7);
      populateCast(a, eco);
      populateCast(b, castOf(eco));
      expect(worldHash(b)).toBe(worldHash(a));
      expect(castOf(eco).map((e) => [e.kind, e.count])).toEqual(starterCast(eco));
    }
  });

  it("each valley's founders are its own: two seeds' felids differ, within their plan", () => {
    const e: CastEntry = { kind: 'felid', count: 2, look: lookFor('felid') };
    const a = founderOf(11, e), b = founderOf(12, e);
    expect(encodeGenome(a)).not.toBe(encodeGenome(b));
    // visibly different: apart in morphospace, though both still read as felids
    expect(distance(describeMorph(grow(a)), describeMorph(grow(b)))).toBeGreaterThan(0.05);
    // …and another look of the same kind in the same valley is another felid again
    expect(encodeGenome(founderOf(11, { ...e, look: 991 }))).not.toBe(encodeGenome(a));
  });

  it('a pasted founder is released as it is, under the kind it was given', () => {
    const g = genomeOfMorphotype(5, 'otter');
    const w = createWorld(3);
    populateCast(w, [{ kind: 'otter', count: 3, look: 0, genome: encodeGenome(g) }]);
    expect(w.species).toHaveLength(1);
    expect(encodeGenome(w.species[0].founder)).toBe(encodeGenome(g));
    expect(w.creatures.filter((c) => c.alive)).toHaveLength(3);
  });

  it('a cast read back is checked entry by entry', () => {
    const good = encodeGenome(genomeOfMorphotype(2, 'fish'));
    const out = checkCast([
      { kind: 'rodent', count: 5, look: 0 },
      { kind: 'rodent', count: 500, look: 3.7 }, // clamped and floored
      { kind: 'not-a-kind', count: 2, look: 0 }, // dropped
      { kind: 'fish', count: 2, look: 0, genome: 'CAM2:garbage' }, // dropped
      { kind: 'fish', count: 2, look: 0, genome: good }, // kept
      { kind: 'rodent', count: 'many', look: 0 }, // dropped
      null,
    ]);
    expect(out).toEqual([
      { kind: 'rodent', count: 5, look: 0 },
      { kind: 'rodent', count: 30, look: 3 },
      { kind: 'fish', count: 2, look: 0, genome: good },
    ]);
    expect(checkCast(undefined)).toBeUndefined();
    expect(checkCast('standard')).toBeUndefined();
  });
});
