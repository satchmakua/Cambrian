import { describe, it, expect } from 'vitest';
import { createWorld, release, DAY_LENGTH, YEAR_DAYS, type World, type Creature } from '../../src/sim/world';
import { conspicuity, showiness, weatherCost } from '../../src/sim/selection';
import { biomeAt } from '../../src/sim/terrain';
import { genomeOfMorphotype } from '../../src/engine/random';
import { traitsOf } from '../../src/sim/traits';
import { grow } from '../../src/engine/grow';
import type { Genome, SegmentGene } from '../../src/engine/genome';

const YEAR = DAY_LENGTH * YEAR_DAYS;
/** a creature of `kind` in a coat of hue/lightness (saturation as given), stood on the first spot of `biome` */
function coated(w: World, biome: string, hue: number, sat: number, light: number): Creature {
  const g = structuredClone(genomeOfMorphotype(4, 'rodent')) as Genome;
  g.palette = { ...g.palette, hueA: hue, sat, light };
  g.covering = { ...g.covering, pattern: 'plain' };
  const [c] = release(w, g, 1);
  for (let x = -90; x < 90; x += 3) for (let z = -90; z < 90; z += 3) if (biomeAt(w.terrain, x, z) === biome) {
    c.x = x;
    c.z = z;
    return c;
  }
  throw new Error(`no ${biome}`);
}

describe('selection that is real', () => {
  it('a coat matched to its ground shows less than one that is not — and in the snow the white one hides', () => {
    const w = createWorld(3);
    w.time = YEAR * 0.3; // summer: no snow
    const green = coated(w, 'meadow', 0.25, 0.45, 0.4);
    const white = coated(w, 'meadow', 0.1, 0.05, 0.85);
    expect(conspicuity(w, green)).toBeLessThan(conspicuity(w, white));
    w.time = YEAR * (1 + 0.885); // the depth of winter: snow on the land
    expect(conspicuity(w, white)).toBeLessThan(conspicuity(w, green));
    // …and on the sand a sandy coat hides
    const sandy = coated(w, 'sand', 0.12, 0.3, 0.6);
    w.time = YEAR * 0.3;
    expect(conspicuity(w, sandy)).toBeLessThan(0.3);
  });

  it('crests, a bright coat and a bold pattern make a body showy', () => {
    const plain = structuredClone(genomeOfMorphotype(4, 'rodent')) as Genome;
    plain.palette = { ...plain.palette, sat: 0.1, light: 0.35 };
    plain.covering = { ...plain.covering, pattern: 'plain' };
    for (let s: SegmentGene | undefined = plain.body; s; s = s.child) s.appendages = s.appendages.filter((a) => a.kind !== 'crest' && a.kind !== 'frill');
    const bright = structuredClone(plain) as Genome;
    bright.palette = { ...bright.palette, sat: 0.95, light: 0.55 };
    bright.covering = { ...bright.covering, pattern: 'stripes', patternContrast: 0.9 };
    expect(showiness(bright)).toBeGreaterThan(showiness(plain) + 0.3);
  });

  it('keeping warm in winter costs a small warm-blooded body more than a big one; the cold-blooded nothing', () => {
    const at = (time: number) => {
      const w = createWorld(1);
      w.time = time;
      return w;
    };
    const winter = at(YEAR * 0.9), summer = at(YEAR * 0.35);
    const t = (g: Genome) => traitsOf(grow(g));
    const rodent = t(genomeOfMorphotype(4, 'rodent')), bear = t(genomeOfMorphotype(4, 'ursid'));
    expect(rodent.endotherm && bear.endotherm).toBe(true);
    expect(weatherCost(rodent, winter)).toBeGreaterThan(weatherCost(bear, winter) * 1.2);
    // a bare body is a cold-blooded one: it pays nothing to keep warm (it slows in the cold instead)
    const bare = structuredClone(genomeOfMorphotype(4, 'rodent')) as Genome;
    bare.covering = { ...bare.covering, type: 'skin' };
    expect(t(bare).endotherm).toBe(false);
    expect(weatherCost(t(bare), winter)).toBe(0);
    // in summer the cold costs nothing, and a big body's coat a little
    expect(weatherCost(bear, summer)).toBeGreaterThan(0);
    expect(weatherCost(bear, summer)).toBeLessThan(0.15);
    // a colder age makes the winter dearer still
    const colder = at(YEAR * 0.9);
    colder.levers.warmth = -1;
    expect(weatherCost(rodent, colder)).toBeGreaterThan(weatherCost(rodent, winter));
  });
});
