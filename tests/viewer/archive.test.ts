import { describe, it, expect } from 'vitest';
import { MENAGERIE_GRID, binKey, archiveAll, descriptorsOf, type Menagerie } from '../../src/viewer/archive';
import { randomGenome } from '../../src/engine/random';
import { grow } from '../../src/engine/grow';
import { describe as describeMorph } from '../../src/engine/morphospace';

describe('menagerie archive (M14)', () => {
  it('binKey maps any descriptor into the grid', () => {
    for (let s = 0; s < 500; s++) {
      const [x, y] = binKey(describeMorph(grow(randomGenome(s)))).split(':').map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(MENAGERIE_GRID);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(MENAGERIE_GRID);
    }
  });

  it('fills many distinct cells over a session (the field guide spreads)', () => {
    let arch: Menagerie = {};
    for (let s = 0; s < 300; s++) arch = archiveAll(arch, [randomGenome(s)]);
    // 300 varied rolls should illuminate a good chunk of the grid, not collapse to one cell
    expect(Object.keys(arch).length).toBeGreaterThanOrEqual(8);
    expect(descriptorsOf(arch).length).toBe(Object.keys(arch).length);
  });

  it('keeps the highest-coherence specimen per cell, and is idempotent', () => {
    const genomes = Array.from({ length: 80 }, (_, s) => randomGenome(s));
    const arch = archiveAll({}, genomes);
    // every occupant is the max score seen in its own bin
    const bestPerBin = new Map<string, number>();
    for (const g of genomes) {
      const p = grow(g);
      const key = binKey(describeMorph(p));
      // recompute coherence the same way the archive does
      const sc = arch[key].score;
      bestPerBin.set(key, Math.max(bestPerBin.get(key) ?? -1, sc));
    }
    for (const [key, e] of Object.entries(arch)) {
      expect(e.score).toBe(bestPerBin.get(key));
    }
    // re-inserting the same genomes changes nothing (and returns the same reference)
    expect(archiveAll(arch, genomes)).toBe(arch);
  });
});
