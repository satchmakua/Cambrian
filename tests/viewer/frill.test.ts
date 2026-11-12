import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { frillGeometry, frillPlan, frillPoint, frillRim } from '../../src/viewer/frill';

describe('frill', () => {
  it('is half a ruff round the neck: from over the top down past its own side', () => {
    const p = frillPlan(0.3, 0.4, 1);
    const top = frillPoint(p, p.ribs[0], p.outer);
    const low = frillPoint(p, p.ribs[p.ribs.length - 1], p.outer);
    expect(top[1]).toBeGreaterThan(0.9 * p.outer); // over the top…
    expect(Math.abs(top[0])).toBeLessThan(0.1 * p.outer); // …meeting its twin on the midline
    expect(low[0]).toBeGreaterThan(0.8 * p.outer); // out on its side
    expect(low[1]).toBeLessThan(0); // and below it
    // the other side mirrors it
    const q = frillPlan(0.3, 0.4, -1);
    expect(frillPoint(q, q.ribs[3], q.outer)[0]).toBeCloseTo(-frillPoint(p, p.ribs[3], p.outer)[0], 9);
    // the rim sweeps back from the neck
    expect(top[2]).toBeLessThan(0);
  });

  it('its rim scallops between the ribs', () => {
    const p = frillPlan(0.3, 0.4, 1);
    const mid = (p.ribs[2] + p.ribs[3]) / 2;
    expect(frillRim(p, p.ribs[2])).toBeCloseTo(p.outer, 6);
    expect(frillRim(p, mid)).toBeLessThan(0.9 * p.outer);
  });

  it('builds finite, coloured geometry', () => {
    const g = frillGeometry(frillPlan(0.3, 0.4, -1), [0.1, -0.05, 0], new THREE.Color(0x44aa44), new THREE.Color(0xaa2244));
    const pos = g.getAttribute('position').array as ArrayLike<number>;
    expect(pos.length).toBeGreaterThan(300);
    for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true);
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
  });
});
