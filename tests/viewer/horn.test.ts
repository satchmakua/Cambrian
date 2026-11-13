import { describe, it, expect } from 'vitest';
import { HORN_LEN, hornGeometry, hornPath } from '../../src/viewer/horn';

describe('horn', () => {
  it('sweeps back from its root and tapers to a point: not a straight cone', () => {
    // (every horn was one smooth straight cone: party hats, a unicorn's spike)
    const up = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // aim +Z turned to +Y: straight up
    for (const sweep of [0, 0.5, 1]) {
      const path = hornPath(0.1, up, sweep);
      const tip = path[path.length - 1];
      // it rises, and its point lies back toward the tail (−Z) of its root, by a share of its length
      expect(tip[1]).toBeGreaterThan(0.5 * HORN_LEN * 0.1);
      expect(-tip[2]).toBeGreaterThan(0.2 * HORN_LEN * 0.1);
      // …curving: the middle of the horn lies off the straight line from root to point
      const mid = path[Math.floor(path.length / 2)];
      const t = Math.hypot(tip[1], tip[2]);
      const cross = Math.abs(mid[1] * tip[2] - mid[2] * tip[1]) / t;
      expect(cross).toBeGreaterThan(0.02 * HORN_LEN * 0.1);
    }
    // darker at the root than at the point
    const g = hornGeometry(0.1, up, 0.5, true);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    let lo = { y: Infinity, c: 0 }, hi = { y: -Infinity, c: 0 };
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < lo.y) lo = { y: pos.getY(i), c: col.getX(i) };
      if (pos.getY(i) > hi.y) hi = { y: pos.getY(i), c: col.getX(i) };
    }
    expect(hi.c).toBeGreaterThan(lo.c + 0.25);
    g.dispose();
  });
});
