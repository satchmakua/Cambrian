import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { brilleEye, irisFor, IRIS_APART, lidOpening, slitIrisOf } from '../../src/viewer/CreatureMesh';
import { coatMain, coatPattern } from '../../src/viewer/palette';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';

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

  it("a slit eye's iris stands apart from the hide round it: never the colour of the net it sits in", () => {
    // (an olive iris in an olive net left the snake's slit alone in its face: a speck)
    const srgb = (c: THREE.Color) => c.clone().convertLinearToSRGB();
    for (const id of ['serpent', 'crocodilian', 'wyvern', 'lizard']) {
      let apart = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const iris = srgb(new THREE.Color(slitIrisOf(p.genomeRef.seed, p)));
        if ([coatMain(p.genomeRef.palette), coatPattern(p.genomeRef.palette)].map(srgb).every((h) => Math.hypot(iris.r - h.r, iris.g - h.g, iris.b - h.b) > IRIS_APART)) apart++;
      }
      // (when no swatch of the palette stands apart, the hashed one is kept: rare)
      expect(apart / 40, id).toBeGreaterThan(0.9);
    }
    const p = grow(genomeOfMorphotype(29, 'serpent'));
    const iris = srgb(new THREE.Color(slitIrisOf(p.genomeRef.seed, p)));
    const net = srgb(coatPattern(p.genomeRef.palette));
    expect(Math.hypot(iris.r - net.r, iris.g - net.g, iris.b - net.b), 'serpent #29 off its net').toBeGreaterThan(IRIS_APART);
  });

  it("a snake's eye is open round under a clear scale: no lizard's almond of lids", () => {
    for (let seed = 1; seed <= 6; seed++) expect(brilleEye(grow(genomeOfMorphotype(seed, 'serpent'))), `serpent #${seed}`).toBe(true);
    for (const id of ['lizard', 'crocodilian', 'fish', 'felid']) expect(brilleEye(grow(genomeOfMorphotype(1, id))), id).toBe(false);
    const open = lidOpening(true, false);
    expect(0.9 * Math.sin(Math.abs(open.upper))).toBeGreaterThanOrEqual(0.7); // (an almond showed 0.46r)
  });
});
