import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { eyeVariant } from '../../../src/viewer/partStyles';
import { buildJawed, noseScaleOf, snoutReach, SNOUT_SHORT } from '../../../src/viewer/mouths/jawed';
import { mouthSpec } from '../../../src/viewer/mouthLine';
import { coatMain } from '../../../src/viewer/palette';

describe('felid', () => {
  it("looks out of a cat's slit eyes", () => {
    // (round eyes with a brown iris — the commonest mammal eye — gave the cat a dog's face)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBe(2);
      for (const e of eyes) expect(eyeVariant(e.part!.style), `#${seed}`).toBe('slit');
    }
  });

  it("wears a small nose on its short muzzle, where a dog wears a broad pad", () => {
    // (the same pad on every muzzle: a cat with a dog's big black nose)
    const noseWidth = (id: string, seed: number) => {
      const p = grow(genomeOfMorphotype(seed, id));
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as 'fanged' | 'maw' | 'herbivore' | 'underbite')!;
      expect(b.nose, `${id} #${seed}`).not.toBeNull();
      b.nose!.computeBoundingBox();
      const s = b.nose!.boundingBox!.getSize(new THREE.Vector3());
      return { w: Math.max(s.x, s.y, s.z) / b.r, reach: snoutReach(p, idx) };
    };
    for (let seed = 1; seed <= 6; seed++) {
      const cat = noseWidth('felid', seed);
      const dog = noseWidth('canid', seed);
      expect(cat.reach, `cat #${seed}`).toBeLessThan(SNOUT_SHORT);
      expect(dog.reach, `dog #${seed}`).toBeGreaterThan(SNOUT_SHORT);
      expect(cat.w, `#${seed}`).toBeLessThan(dog.w * 0.85);
      // a dog's pad is wider than its mouth is deep (at a cat's size it was three-quarters of that)
      expect(dog.w, `dog #${seed}`).toBeGreaterThan(1.0);
    }
    expect(noseScaleOf(1.6)).toBeCloseTo(0.75, 9);
    // …and a dog's or a bear's covers most of its muzzle's front (at a cat's size it was a dot on the
    // end of a hippo's snout)
    expect(noseScaleOf(2.4)).toBe(1.5);
  });

  it("wears fine, dense markings: a cheetah's spots, a tiger's stripes — not a dalmatian's blobs", () => {
    // (at 1.4–6.8 cells a unit, a spotted cat wore about twenty big sparse blobs: a dalmatian, a hyena;
    // a striped one a few broad hoops)
    let marked = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const c = genomeOfMorphotype(seed, 'felid').covering;
      if (c.pattern !== 'spots' && c.pattern !== 'stripes') continue;
      marked++;
      expect(c.patternScale, `#${seed} ${c.pattern}`).toBeGreaterThanOrEqual(8.5);
    }
    expect(marked).toBeGreaterThan(8);
  });

  it("wears a tawny, ginger, sandy or grey coat — never a pale salmon pink, a hairless cat's", () => {
    // (on the reddest hues, lit pale, a plain cat came out salmon pink)
    const hsl = { h: 0, s: 0, l: 0 };
    for (let seed = 1; seed <= 32; seed++) {
      const g = genomeOfMorphotype(seed, 'felid');
      coatMain(g.palette).getHSL(hsl, THREE.SRGBColorSpace); // (as it is seen: the palette is sRGB)
      if (hsl.s < 0.25) continue; // (a grey coat)
      expect(hsl.h, `#${seed} hue`).toBeGreaterThan(0.064);
      expect(hsl.l, `#${seed} light`).toBeLessThan(0.75);
    }
  });
});
