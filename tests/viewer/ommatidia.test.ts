import { describe, it, expect } from 'vitest';
import { facetDepth, ommatidiaPixels, OMMA_COLS, OMMA_SIZE } from '../../src/viewer/ommatidia';

describe("an insect's compound eye", () => {
  it('is a honeycomb of facets round its equator, dark walls between glossy lenses', () => {
    // (an icosahedron's 320 flat faces under one glossy highlight was a chocolate truffle)
    const [w, h] = OMMA_SIZE;
    const { shade, rough } = ommatidiaPixels();
    for (const j of [h / 2, h / 2 + 3, Math.round(h / 4)]) {
      let walls = 0;
      for (let i = 0; i < w; i++) if (shade[(j * w + i) * 4] < 128 && shade[(j * w + ((i + 1) % w)) * 4] >= 128) walls++;
      expect(walls, `row ${j}`).toBe(OMMA_COLS);
    }
    // a lens is glossier than the wall round it
    let rc = 0, rw = 0, nc = 0, nw = 0;
    for (let k = 0; k < w * h; k++) {
      if (shade[k * 4] > 250) (rc += rough[k * 4 + 1]), nc++;
      else if (shade[k * 4] < 100) (rw += rough[k * 4 + 1]), nw++;
    }
    expect(rw / nw - rc / nc).toBeGreaterThan(0.4 * 255);
    // the walls are a fine share of the dome, not a net over it
    let dark = 0;
    for (let k = 0; k < w * h; k++) if (shade[k * 4] < 128) dark++;
    expect(dark / (w * h)).toBeGreaterThan(0.1);
    expect(dark / (w * h)).toBeLessThan(0.35);
  });

  it('runs on across the seam round its equator', () => {
    for (const v of [0.3, 0.5, 0.62]) expect(Math.abs(facetDepth(0, v) - facetDepth(1 - 1e-9, v))).toBeLessThan(1e-3);
  });
});
