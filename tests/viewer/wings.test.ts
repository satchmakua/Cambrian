import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMembraneWing, buildFeatheredWing, buildTailFan, conformToSurface } from '../../src/viewer/wings';

function finite(g: THREE.BufferGeometry): boolean {
  const a = g.getAttribute('position').array as ArrayLike<number>;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}
function bbox(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!;
}

describe('wings (shoulder-built, body frame)', () => {
  it('a membrane wing spreads OUT to its side and back from the shoulder, with bones and a wrist', () => {
    for (const side of [1, -1]) {
      const w = buildMembraneWing(side, 2, 0.6);
      expect(finite(w.surface)).toBe(true);
      const b = bbox(w.surface);
      // spans outward on its own side, never across the midline
      if (side > 0) expect(b.min.x).toBeGreaterThan(-0.05);
      else expect(b.max.x).toBeLessThan(0.05);
      expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeGreaterThan(1.0);
      expect(b.min.z).toBeLessThan(-0.5); // the trailing panels reach back along the flank
      expect(w.bones.length).toBe(5); // arm + four fingers
      expect(w.wrist).not.toBeNull();
    }
  });

  it('the two sides are exact mirror images (bilateral symmetry holds through the wings)', () => {
    const a = buildMembraneWing(1, 1.7, 0.5).surface.getAttribute('position');
    const b = buildMembraneWing(-1, 1.7, 0.5).surface.getAttribute('position');
    expect(a.count).toBe(b.count);
    for (let i = 0; i < a.count; i += 7) {
      expect(a.getX(i)).toBeCloseTo(-b.getX(i), 6);
      expect(a.getY(i)).toBeCloseTo(b.getY(i), 6);
      expect(a.getZ(i)).toBeCloseTo(b.getZ(i), 6);
    }
  });

  it('a folded feathered wing lies back along the flank, vertex-coloured', () => {
    const w = buildFeatheredWing(1, 2, new THREE.Color(0.6, 0.5, 0.3), new THREE.Color(0.1, 0.3, 0.8));
    expect(finite(w.surface)).toBe(true);
    expect(w.surface.getAttribute('color')).toBeDefined();
    const b = bbox(w.surface);
    expect(b.min.z).toBeLessThan(-1.5); // primaries reach well behind the shoulder
    expect(b.max.z).toBeLessThan(0.3); // and nothing pokes forward of it
    expect(b.max.x - b.min.x).toBeLessThan(0.8); // folded flat against the side, not spread
  });

  it('a tail fan points back from the tail tip', () => {
    const g = buildTailFan(1, new THREE.Color(0.5, 0.4, 0.3), new THREE.Color(0.2, 0.2, 0.6));
    const b = bbox(g);
    expect(b.min.z).toBeLessThan(-0.7);
    expect(b.max.z).toBeLessThan(0.1);
  });

  it('conformToSurface lifts every vertex out of a body to ride the margin above it', () => {
    const w = buildFeatheredWing(1, 2, new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1));
    const sphere = (x: number, y: number, z: number) => Math.hypot(x, y, z + 0.8) - 0.7; // a body
    conformToSurface(w.surface, sphere, [0.5, 0, 0], 0.02);
    const pos = w.surface.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(sphere(pos.getX(i) + 0.5, pos.getY(i), pos.getZ(i))).toBeGreaterThan(0.015);
    }
  });
});
