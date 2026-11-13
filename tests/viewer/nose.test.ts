import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { pinkNoseChance } from '../../src/viewer/mouths/jawed';

describe('noses', () => {
  it('a pink nose is a small animal’s: about even on a mouse, never on a wolf or a bear', () => {
    // (two in five of every kind had one, and a pink-nosed bear read as a giant rodent)
    for (let seed = 1; seed <= 12; seed++) {
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'ursid'))), `bear #${seed}`).toBe(0);
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'canid'))), `dog #${seed}`).toBe(0);
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'ungulate'))), `deer #${seed}`).toBe(0);
      const mouse = pinkNoseChance(grow(genomeOfMorphotype(seed, 'rodent')));
      expect(mouse, `mouse #${seed}`).toBeGreaterThan(0.25);
      expect(mouse, `mouse #${seed}`).toBeLessThanOrEqual(0.7);
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'felid'))), `cat #${seed}`).toBeLessThan(0.2);
    }
  });

  it("a weasel's nose is dark more often than not, small as it is: a mouse's pink", () => {
    // (a pink button on a small furred face with whiskers was a hamster's)
    for (let seed = 1; seed <= 12; seed++) {
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'mustelid'))), `weasel #${seed}`).toBeLessThan(0.25);
    }
  });
});
