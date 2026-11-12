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

  it("an alien's glowing eye keeps the striking accents", () => {
    let accents = 0;
    for (let s = 1; s <= 600; s++) {
      const c = hsl(irisFor(s));
      if ((c.h > 0.65 && c.h < 0.92 && c.s > 0.2) || ((c.h > 0.94 || c.h < 0.03) && c.s > 0.3)) accents++;
    }
    expect(accents).toBeGreaterThan(0);
  });
});
