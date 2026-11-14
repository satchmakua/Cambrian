import { describe, it, expect } from 'vitest';
import { lidOpening } from '../../src/viewer/CreatureMesh';

describe('eyelids', () => {
  it("a frog's bulging eye opens round, its lids a rim — not the almond that cut a wedge from its dome", () => {
    // (in the almond, a three-quarter view saw the upper lid slant across the gold dome and leave a wedge
    // of it: a Pac-Man)
    const frog = lidOpening(false, true);
    const almond = lidOpening(false, false);
    expect(-frog.upper).toBeGreaterThan(0.8);
    expect(frog.lower).toBeGreaterThan(0.8);
    expect(-frog.upper).toBeGreaterThan(-almond.upper + 0.25);
    // a radial body's eye is round too
    const radial = lidOpening(true, false);
    expect(-radial.upper).toBeGreaterThan(0.8);
  });
});
