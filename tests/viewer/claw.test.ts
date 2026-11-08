import { describe, it, expect } from 'vitest';
import { clawPlan, clawGeometry } from '../../src/viewer/claw';

describe('crab claw', () => {
  it('a swollen palm with two fingers that close on each other, the hinged one above', () => {
    const r = 0.2;
    const c = clawPlan(r);
    const fTip = c.fixed[c.fixed.length - 1];
    const dTip = c.dactyl[c.dactyl.length - 1];
    // both fingers run on well past the palm
    const palmFront = c.palm.c[2] + c.palm.r[2];
    expect(fTip[2]).toBeGreaterThan(palmFront + r);
    expect(dTip[2]).toBeGreaterThan(palmFront + r);
    // the dactyl rides above the fixed finger all along, and they close to a narrow gape at the tips
    for (let k = 0; k < c.fixed.length; k++) expect(c.dactyl[k][1]).toBeGreaterThan(c.fixed[k][1]);
    const gapRoot = c.dactyl[0][1] - c.fixed[0][1];
    const gapTip = dTip[1] - fTip[1];
    expect(gapTip).toBeLessThan(0.4 * gapRoot);
    expect(gapTip - c.dactylR(1) - c.fixedR(1)).toBeGreaterThan(0); // never through each other
    // the palm is the bulk: deeper than either finger's root
    expect(c.palm.r[1]).toBeGreaterThan(2 * c.fixedR(0));
  });

  it('builds finite geometry turned into the node frame', () => {
    const q = [0, Math.sin(0.4), 0, Math.cos(0.4)];
    const g = clawGeometry(0.2, q);
    for (const geo of [g.shell, g.tips]) {
      const a = geo.getAttribute('position').array as ArrayLike<number>;
      expect(a.length).toBeGreaterThan(90);
      for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true);
    }
    // turned: the claw points along the rotated +Z (yaw 0.8 rad → +X and +Z)
    g.tips.computeBoundingBox();
    const bb = g.tips.boundingBox!;
    expect(bb.max.x).toBeGreaterThan(0.3);
    expect(bb.max.z).toBeGreaterThan(0.3);
  });
});
