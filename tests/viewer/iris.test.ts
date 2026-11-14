import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { irisFor } from '../../src/viewer/CreatureMesh';

const hsl = (hex: number) => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });

describe('iris colours', () => {
  it("an animal's eye (round or beady) is a natural colour: browns above all, never violet or blood red", () => {
    // (a violet- or a blood-eyed dog read as a toy, or a demon)
    const n = 600;
    let brown = 0;
    for (let s = 1; s <= n; s++) {
      const c = hsl(irisFor(s, true));
      const violet = c.h > 0.65 && c.h < 0.92 && c.s > 0.2;
      const red = (c.h > 0.94 || c.h < 0.03) && c.s > 0.3;
      expect(violet || red, `#${s}`).toBe(false);
      if (c.h > 0.03 && c.h < 0.12 && c.l < 0.3) brown++;
    }
    expect(brown / n).toBeGreaterThan(0.3);
  });

  it('no eye is a grey ball bearing: a near-black iris is the darkest brown on screen, not a mid-grey', () => {
    // (the swatches' lightness is linear, as setHSL takes it: a colourless 0.1 was #595959 on screen, and
    // every dark-eyed dog, deer, bear and ostrich wore a grey ball bearing)
    for (const natural of [true, false]) {
      for (let s = 1; s <= 600; s++) {
        const hex = irisFor(s, natural);
        const rgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
        const chroma = Math.max(...rgb) - Math.min(...rgb);
        // a hue you can see, or dark enough to read as black
        expect(chroma > 0.06 || Math.max(...rgb) < 0.2, `#${s} ${natural ? 'animal' : 'alien'}: #${hex.toString(16).padStart(6, '0')}`).toBe(true);
      }
    }
  });

  it("an alien's glowing eye keeps the striking accents", () => {
    let accents = 0;
    for (let s = 1; s <= 600; s++) {
      const c = hsl(irisFor(s));
      if ((c.h > 0.65 && c.h < 0.92 && c.s > 0.2) || ((c.h > 0.94 || c.h < 0.03) && c.s > 0.3)) accents++;
    }
    expect(accents).toBeGreaterThan(0);
  });
});
