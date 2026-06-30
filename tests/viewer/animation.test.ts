import { describe, it, expect } from 'vitest';
import { buildRig, computeAnim, type MotionStyle } from '../../src/viewer/animation';
import { buildMeshData } from '../../src/viewer/meshData';
import { grow } from '../../src/engine/grow';
import { randomGenome, genomeOfMorphotype } from '../../src/engine/random';
import { defaultGenome } from '../../src/engine/genome';

function rigFor(seed: number) {
  const p = grow(randomGenome(seed));
  return buildRig(buildMeshData(p), p);
}
function rigOf(p: ReturnType<typeof grow>) {
  return buildRig(buildMeshData(p), p);
}

describe('procedural animation', () => {
  it('actually moves the creature over time', () => {
    const p = grow(defaultGenome());
    const rig = rigOf(p);
    const pose0 = Float32Array.from(computeAnim(rig, 0));
    const pose1 = Float32Array.from(computeAnim(rig, 0.6));
    let maxDelta = 0;
    for (let i = 0; i < pose0.length; i++) maxDelta = Math.max(maxDelta, Math.abs(pose0[i] - pose1[i]));
    expect(maxDelta).toBeGreaterThan(0.02); // something visibly moved
  });

  it('is deterministic and bounded (no drift / NaN) across many creatures and times', () => {
    for (let s = 0; s < 200; s++) {
      const rig = rigFor(s);
      const slack = rig.maxDisp + 1e-6;
      for (const t of [0, 0.37, 1.5, 7.3]) {
        const out = computeAnim(rig, t);
        expect(out).toEqual(computeAnim(rig, t)); // deterministic
        for (let i = 0; i < rig.n; i++) {
          // displacement from the base pose never exceeds the rig's amplitudes (per axis)
          expect(Math.abs(out[i * 3] - rig.base[i * 3])).toBeLessThanOrEqual(slack);
          expect(Math.abs(out[i * 3 + 1] - rig.base[i * 3 + 1])).toBeLessThanOrEqual(slack);
          expect(Math.abs(out[i * 3 + 2] - rig.base[i * 3 + 2])).toBeLessThanOrEqual(slack);
          expect(Number.isFinite(out[i * 3])).toBe(true);
        }
      }
    }
  });

  it('serpents (legless, long) undulate more than compact legged bodies', () => {
    // force a serpent (legless slither) rather than fishing auto-roll seeds — the latter can
    // surface a *winged* legless body (a wyvern → flap), which isn't the undulation being tested.
    let serpentAmp = 0;
    for (let s = 0; s < 12; s++) serpentAmp += rigOf(grow(genomeOfMorphotype(s * 13 + 1, 'serpent'))).waveAmp;
    serpentAmp /= 12;
    const quadAmp = rigOf(grow(defaultGenome())).waveAmp;
    expect(serpentAmp).toBeGreaterThan(quadAmp);
  });

  it('picks a motion style in character with the body plan (MORPHOLOGY §8)', () => {
    // the dominant style across many rolls of a morphotype should match its locomotion
    const dominant = (id: string): MotionStyle => {
      const tally = new Map<MotionStyle, number>();
      for (let s = 0; s < 40; s++) {
        const style = rigOf(grow(genomeOfMorphotype(s * 17 + 3, id))).style;
        tally.set(style, (tally.get(style) ?? 0) + 1);
      }
      return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };
    expect(dominant('fish')).toBe('swim');
    expect(dominant('crab')).toBe('scuttle');
    expect(dominant('bird')).toBe('flap');
    expect(dominant('serpent')).toBe('slither');
    expect(dominant('cephalopod')).toBe('drift');
    expect(dominant('felid')).toBe('walk');
  });
});
