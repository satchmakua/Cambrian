import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import type { Vec3 } from '../../src/engine/genome';
import { sweepTube, type SweepPoint } from '../../src/viewer/sweep';

/** Signed volume via the divergence theorem — positive iff the mesh is wound outward. */
function signedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex()!;
  let v = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c);
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

function circle(n: number, R: number): SweepPoint[] {
  const pts: SweepPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ p: [Math.cos(a) * R, 0, Math.sin(a) * R] as Vec3, n: [0, 1, 0] as Vec3 });
  }
  return pts;
}

describe('sweepTube', () => {
  it('winds a closed loop OUTWARD (an inside-out lip backface-culls away)', () => {
    const torus = sweepTube(circle(24, 2), { radius: () => 0.3, closed: true, radialSegments: 12 });
    expect(signedVolume(torus)).toBeGreaterThan(0);
  });

  it('winds a capped open tube outward too, walls and caps agreeing', () => {
    const pts: SweepPoint[] = [0, 1, 2, 3, 4].map((z) => ({ p: [0, 0, z * 0.5] as Vec3, n: [0, 1, 0] as Vec3 }));
    const tube = sweepTube(pts, { radius: () => 0.2, caps: true, radialSegments: 10 });
    expect(signedVolume(tube)).toBeGreaterThan(0);
  });

  it('is finite and respects flatten', () => {
    const pts: SweepPoint[] = [0, 1, 2].map((z) => ({ p: [0, 0, z] as Vec3, n: [0, 1, 0] as Vec3 }));
    const g = sweepTube(pts, { radius: () => 0.5, flatten: 0.5, radialSegments: 8 });
    const pos = g.getAttribute('position');
    let maxY = 0;
    let maxX = 0;
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      maxY = Math.max(maxY, Math.abs(pos.getY(i)));
      maxX = Math.max(maxX, Math.abs(pos.getX(i)));
    }
    expect(maxY).toBeCloseTo(0.25, 2); // squashed along the supplied normal
    expect(maxX).toBeCloseTo(0.5, 2);
  });
});
