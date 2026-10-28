import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildJawed } from '../../../src/viewer/mouths/jawed';
import { hingeOf, poseJaw } from '../../../src/viewer/mouths/jaw';

describe('jaw articulation (World)', () => {
  it('closing swings the lower lip up to meet the upper, and opening wider drops it further', () => {
    for (const [kind, seed] of [['felid', 11], ['canid', 31], ['rodent', 3], ['crocodilian', 5]] as const) {
      const p = grow(genomeOfMorphotype(seed, kind));
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const b = buildJawed(p, mi, [], false, 'maw', 'hybrid');
      if (!b) continue;
      const h = hingeOf(b.upper, b.lower, b.aim);
      expect(h).not.toBeNull();
      expect(h!.close).toBeGreaterThan(0);
      const U = new THREE.Vector3(...b.upper[b.upper.length >> 1].p);
      const L = new THREE.Vector3(...b.lower[b.lower.length >> 1].p);
      const gap = (open: number) => {
        const g = new THREE.Group();
        poseJaw(g, h!, open);
        g.updateMatrixWorld();
        return L.clone().applyMatrix4(g.matrixWorld).distanceTo(U);
      };
      const built = gap(1);
      expect(built).toBeCloseTo(U.distanceTo(L), 6); // open = 1 is exactly the built pose
      // closed: the lips meet — the centreline gap is about the two lip tubes' thickness (~0.3·r)
      expect(gap(0)).toBeLessThan(Math.min(built * 0.5, b.r * 0.4));
      expect(gap(1.5)).toBeGreaterThan(built); // a bite gapes wider than rest
    }
  });
});
