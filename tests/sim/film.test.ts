import { describe, it, expect } from 'vitest';
import { createWorld, release, stepWorld, DAY_LENGTH, STEP, type World } from '../../src/sim/world';
import { loadWorld, saveWorld } from '../../src/sim/persist';
import { inAdoptedLine } from '../../src/sim/evolution';
import { FILM_MAX } from '../../src/sim/species';
import { genomeOfMorphotype } from '../../src/engine/random';
import { describe as describeMorph, distance } from '../../src/engine/morphospace';
import { grow } from '../../src/engine/grow';
import { starterCast } from '../../src/sim/cast';

function lived(seed: number, days: number): World {
  const w = createWorld(seed);
  starterCast('standard').forEach(([kind, n], i) => release(w, genomeOfMorphotype((seed * 97 + i * 13) >>> 0, kind), n, undefined, kind));
  for (let i = 0; i < (days * DAY_LENGTH) / STEP; i++) stepWorld(w);
  return w;
}

describe("a species' film", () => {
  const w = lived(8, 6);
  it('is taken at dawn: its typical body, a frame whenever it has visibly changed, never more than FILM_MAX', () => {
    const filmed = w.species.filter((s) => s.film.length > 0);
    expect(filmed.length).toBeGreaterThan(3);
    for (const s of w.species) {
      expect(s.film.length).toBeLessThanOrEqual(FILM_MAX);
      for (let i = 1; i < s.film.length; i++) {
        expect(s.film[i].t).toBeGreaterThan(s.film[i - 1].t);
        // (a frame is a body visibly different from the one before it)
        expect(distance(describeMorph(grow(s.film[i].genome)), describeMorph(grow(s.film[i - 1].genome)))).toBeGreaterThan(0.03);
      }
    }
  });

  it('is kept in a save', () => {
    const b = loadWorld(saveWorld(w));
    expect(b.species.map((s) => s.film.length)).toEqual(w.species.map((s) => s.film.length));
    expect(saveWorld(b)).toBe(saveWorld(w));
  });
});

describe('an adopted line', () => {
  it('takes in every species descended from the one adopted, and is kept in a save', () => {
    const w = createWorld(3);
    const [a] = release(w, genomeOfMorphotype(5, 'felid'), 4, undefined, 'felid');
    const [b] = release(w, genomeOfMorphotype(6, 'canid'), 4, undefined, 'canid');
    const felid = w.species.find((s) => s.id === a.species)!;
    // a branch of the felids (as a split founds one)
    const [c] = release(w, genomeOfMorphotype(7, 'felid'), 3, undefined, undefined, felid);
    w.adopted = [felid.id];
    expect(inAdoptedLine(w, felid.id)).toBe(true);
    expect(inAdoptedLine(w, c.species)).toBe(true);
    expect(inAdoptedLine(w, b.species)).toBe(false);
    expect(loadWorld(saveWorld(w)).adopted).toEqual([felid.id]);
  });
});
