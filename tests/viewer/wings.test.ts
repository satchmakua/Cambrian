import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMembraneWing, buildFeatheredWing, buildSpreadFeatheredWing, buildTailFan, conformToSurface } from '../../src/viewer/wings';

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

  it('fins are built in the body frame: chords sweep back along the body, caudals stand vertical', async () => {
    const { buildFin, finKindOf } = await import('../../src/viewer/wings');
    const side = new THREE.Vector3(1, -0.2, 0).normalize();
    expect(finKindOf(new THREE.Vector3(0, 1, 0), 'fin')).toBe('dorsal');
    expect(finKindOf(side, 'fin')).toBe('pectoral');
    expect(finKindOf(new THREE.Vector3(0, 0, -1), 'tail')).toBe('caudal');
    const pect = buildFin('pectoral', side, 0.5);
    const pb = bbox(pect.membrane);
    expect(finite(pect.membrane)).toBe(true);
    expect(pb.min.z).toBeLessThan(-0.2); // the chord trails back along the flank
    expect(pb.max.x).toBeGreaterThan(0.3); // and the span reaches out to its side
    const caudal = buildFin('caudal', new THREE.Vector3(0, 0, -1), 0.5);
    const cb = bbox(caudal.membrane);
    expect(cb.max.y - cb.min.y).toBeGreaterThan(0.6); // a tall vertical fork
    expect(cb.max.x - cb.min.x).toBeLessThan(0.15); // thin side to side
  });
});


describe('spread feathered wing (flight posture)', () => {
  it('reaches out along its own side in a near-horizontal plane, never across the midline', () => {
    const base = new THREE.Color(0.5, 0.6, 0.4), accent = new THREE.Color(0.8, 0.3, 0.2);
    for (const side of [1, -1]) {
      const S = 2;
      const { surface } = buildSpreadFeatheredWing(side, S, base, accent);
      const pos = surface.getAttribute('position');
      let reach = 0, minSide = Infinity, yLo = Infinity, yHi = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) * side;
        reach = Math.max(reach, x);
        minSide = Math.min(minSide, x);
        yLo = Math.min(yLo, pos.getY(i));
        yHi = Math.max(yHi, pos.getY(i));
      }
      expect(reach).toBeGreaterThan(S * 0.85); // a span, not a stub
      expect(minSide).toBeGreaterThan(-S * 0.05); // its own side of the body
      expect(yHi - yLo).toBeLessThan(S * 0.35); // spread flat, not hanging
    }
  });
});
