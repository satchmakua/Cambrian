import { describe, it, expect } from 'vitest';
import { keysToAxes, panDelta, panSpeed } from '../../src/world/keyPan';

const held = (...k: string[]) => new Set(k);

describe('keyboard panning', () => {
  it('WASD and the arrows map to the same axes; opposite keys cancel', () => {
    expect(keysToAxes(held('KeyW'))).toEqual({ fwd: 1, right: 0, fast: false });
    expect(keysToAxes(held('ArrowUp'))).toEqual({ fwd: 1, right: 0, fast: false });
    expect(keysToAxes(held('KeyA', 'ArrowDown'))).toEqual({ fwd: -1, right: -1, fast: false });
    expect(keysToAxes(held('KeyD', 'ArrowLeft'))).toEqual({ fwd: 0, right: 0, fast: false });
    expect(keysToAxes(held('KeyS', 'ShiftLeft')).fast).toBe(true);
  });

  it('moves relative to where the camera faces, over the ground', () => {
    // looking along −Z: W goes −Z, D goes +X
    const [fx, fz] = panDelta({ fwd: 1, right: 0, fast: false }, 0, -1, 10, 0.1);
    expect(fx).toBeCloseTo(0, 9);
    expect(fz).toBeLessThan(0);
    const [rx, rz] = panDelta({ fwd: 0, right: 1, fast: false }, 0, -1, 10, 0.1);
    expect(rx).toBeGreaterThan(0);
    expect(rz).toBeCloseTo(0, 9);
    // looking along +X (turned right): W goes +X, D goes +Z
    const [ax, az] = panDelta({ fwd: 1, right: 1, fast: false }, 1, 0, 10, 0.1);
    expect(ax).toBeGreaterThan(0);
    expect(az).toBeGreaterThan(0);
  });

  it('a diagonal is no faster than a straight pan, and the speed scales with the zoom', () => {
    const straight = Math.hypot(...panDelta({ fwd: 1, right: 0, fast: false }, 0.3, -0.8, 20, 0.05));
    const diagonal = Math.hypot(...panDelta({ fwd: 1, right: 1, fast: false }, 0.3, -0.8, 20, 0.05));
    expect(diagonal).toBeCloseTo(straight, 9);
    expect(panSpeed(80, false)).toBeGreaterThan(panSpeed(10, false));
    expect(panSpeed(0.5, false)).toBeGreaterThan(0); // a floor for close-ups
    expect(panSpeed(20, true)).toBeCloseTo(panSpeed(20, false) * 2.5, 9);
  });

  it('nothing held, or a camera looking straight down, stays well defined', () => {
    expect(panDelta({ fwd: 0, right: 0, fast: false }, 0, -1, 10, 0.1)).toEqual([0, 0]);
    const [x, z] = panDelta({ fwd: 1, right: 0, fast: false }, 0, 0, 10, 0.1);
    expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
  });
});
