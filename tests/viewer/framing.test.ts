import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { framingOf, reachOf } from '../../src/viewer/framing';
import { restPosed } from '../../src/viewer/rig';

describe('framing a creature', () => {
  it('a body is centred on its bounds, its size the longest of its extents', () => {
    const cat = grow(genomeOfMorphotype(3, 'felid'));
    const f = framingOf(cat);
    for (let k = 0; k < 3; k++) {
      expect(f.center[k]).toBeCloseTo((cat.bounds.min[k] + cat.bounds.max[k]) / 2, 9);
      expect(f.ext[k]).toBeCloseTo(cat.bounds.max[k] - cat.bounds.min[k], 9);
    }
    expect(f.size).toBe(Math.max(...f.ext));
    expect(f.groundY).toBeCloseTo(-f.ext[1] / 2, 9);
    expect(f.face).not.toBeNull();
  });

  it('a view of a body in more than one pose stands off by one distance for all of them', () => {
    // (the Studio framed its main view on whichever pose was showing: a snake lying in its S is a
    // fifth shorter than the same snake laid out to slither, so setting it moving — or stopping it —
    // moved the camera, and threw away the angle it had been turned to)
    let seen = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const grown = grow(genomeOfMorphotype(seed, 'serpent'));
      const rest = restPosed(grown);
      if (rest === grown) continue;
      seen++;
      const a = framingOf(grown).size, b = framingOf(rest).size;
      expect(Math.abs(a - b), `serpent #${seed}: the two poses differ`).toBeGreaterThan(0.3);
      expect(reachOf(grown, rest)).toBe(Math.max(a, b));
      expect(reachOf(rest, grown)).toBe(reachOf(grown, rest)); // whichever is showing
    }
    expect(seen).toBeGreaterThan(5);
    // a legged body has the one pose
    const cat = grow(genomeOfMorphotype(3, 'felid'));
    expect(restPosed(cat)).toBe(cat);
    expect(reachOf(cat, restPosed(cat))).toBe(framingOf(cat).size);
  });
});
