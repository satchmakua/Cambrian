import { describe, it, expect } from 'vitest';
import { buildExportGroup } from '../../src/viewer/exportGltf';
import { grow } from '../../src/engine/grow';
import { randomGenome } from '../../src/engine/random';
import { defaultGenome } from '../../src/engine/genome';
import type { Mesh } from 'three';

function meshes(group: ReturnType<typeof buildExportGroup>) {
  const out: Mesh[] = [];
  group.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

describe('glTF export group (M7)', () => {
  it('bakes the default creature (capsules) into real meshes with finite geometry', () => {
    const g = buildExportGroup(grow(defaultGenome()), false);
    const ms = meshes(g);
    expect(ms.length).toBeGreaterThan(3); // body + features
    for (const m of ms) {
      const pos = m.geometry.getAttribute('position');
      expect(pos).toBeTruthy();
      expect(pos.count).toBeGreaterThan(0);
      const arr = pos.array as ArrayLike<number>;
      let finite = true;
      for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) finite = false;
      expect(finite).toBe(true);
      expect(m.material).toBeTruthy(); // every mesh is materialled (glTF needs it)
    }
  });

  it('bakes the smooth surface into a single body mesh + features', () => {
    const g = buildExportGroup(grow(defaultGenome()), true);
    expect(meshes(g).length).toBeGreaterThan(1);
  });

  it('produces a non-empty group across many random creatures (any topology)', () => {
    for (let s = 0; s < 20; s++) {
      for (const smooth of [false, true]) {
        const ms = meshes(buildExportGroup(grow(randomGenome(s)), smooth));
        expect(ms.length).toBeGreaterThan(0);
      }
    }
  });
});
