import { describe, it, expect } from 'vitest';
import { buildRig, computeAnim } from '../../src/viewer/animation';
import { buildMeshData } from '../../src/viewer/meshData';
import { grow } from '../../src/engine/grow';
import { randomGenome } from '../../src/engine/random';
import { defaultGenome } from '../../src/engine/genome';

function rigFor(seed: number) {
  return buildRig(buildMeshData(grow(randomGenome(seed))));
}

describe('procedural animation', () => {
  it('actually moves the creature over time', () => {
    const rig = buildRig(buildMeshData(grow(defaultGenome())));
    const pose0 = Float32Array.from(computeAnim(rig, 0));
    const pose1 = Float32Array.from(computeAnim(rig, 0.6));
    let maxDelta = 0;
    for (let i = 0; i < pose0.length; i++) maxDelta = Math.max(maxDelta, Math.abs(pose0[i] - pose1[i]));
    expect(maxDelta).toBeGreaterThan(0.02); // something visibly moved
  });

  it('is deterministic and bounded (no drift / NaN) across many creatures and times', () => {
    for (let s = 0; s < 200; s++) {
      const rig = rigFor(s);
      const slack = rig.waveAmp + rig.legLift + rig.legSwing + 1e-6;
      for (const t of [0, 0.37, 1.5, 7.3]) {
        const out = computeAnim(rig, t);
        expect(out).toEqual(computeAnim(rig, t)); // deterministic
        for (let i = 0; i < rig.n; i++) {
          // displacement from the base pose never exceeds the rig's amplitudes
          expect(Math.abs(out[i * 3] - rig.base[i * 3])).toBeLessThanOrEqual(slack);
          expect(Math.abs(out[i * 3 + 1] - rig.base[i * 3 + 1])).toBeLessThanOrEqual(slack);
          expect(Math.abs(out[i * 3 + 2] - rig.base[i * 3 + 2])).toBeLessThanOrEqual(slack);
          expect(Number.isFinite(out[i * 3])).toBe(true);
        }
      }
    }
  });

  it('serpents (legless, long) undulate more than compact legged bodies', () => {
    // a long legless body vs the compact default quadruped
    let serpentAmp = 0;
    for (let s = 0; s < 60 && serpentAmp === 0; s++) {
      const g = randomGenome(s);
      const p = grow(g);
      const legs = p.nodes.filter((n) => n.terminal === 'foot' || n.terminal === 'claw').length;
      const dz = p.bounds.max[2] - p.bounds.min[2];
      if (legs === 0 && dz > 5) serpentAmp = buildRig(buildMeshData(p)).waveAmp;
    }
    const quadAmp = buildRig(buildMeshData(grow(defaultGenome()))).waveAmp;
    if (serpentAmp > 0) expect(serpentAmp).toBeGreaterThan(quadAmp);
  });
});
