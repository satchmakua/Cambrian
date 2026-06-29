import { describe, it, expect } from 'vitest';
import { simulateDistance, runPhysicsGenerations, simulateTrajectory, sampleTrajectory, type Trajectory } from '../../src/physics/fitness';
import { grow } from '../../src/engine/grow';
import { randomGenome } from '../../src/engine/random';
import { defaultGenome } from '../../src/engine/genome';

// physics is slower than the pure-engine tests; keep the runs small but meaningful
describe('physics fitness (M6)', () => {
  it('is deterministic — the same creature travels the exact same distance', async () => {
    for (const s of [0, 3, 7]) {
      const p = grow(randomGenome(s));
      const a = await simulateDistance(p);
      const b = await simulateDistance(p);
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBe(b); // bit-identical (deterministic build + fixed timestep + seeded phases)
    }
  });

  it('produces finite, non-negative, non-exploding distances across many creatures', async () => {
    for (let s = 0; s < 14; s++) {
      const d = await simulateDistance(grow(randomGenome(s)));
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(100); // a sane crawl, not a launched-into-orbit explosion
    }
  });

  it('selection makes later creatures travel farther (and replays identically)', async () => {
    const a = await runPhysicsGenerations(defaultGenome(), 8, 12345, { litter: 6 });
    // elitism ⇒ the best distance never regresses; over the run it should strictly improve
    for (let i = 1; i < a.distances.length; i++) expect(a.distances[i]).toBeGreaterThanOrEqual(a.distances[i - 1] - 1e-9);
    expect(a.distances[a.distances.length - 1]).toBeGreaterThan(a.distances[0] + 1e-6);

    // identical seed ⇒ identical run
    const b = await runPhysicsGenerations(defaultGenome(), 8, 12345, { litter: 6 });
    expect(b.distances).toEqual(a.distances);
  }, 20000);

  it('records a deterministic, treadmill-centred gait trajectory for playback', async () => {
    const p = grow(defaultGenome());
    const t = await simulateTrajectory(p, { stride: 2 });
    expect(t.nodeCount).toBe(p.nodes.length);
    expect(t.frameCount).toBeGreaterThan(50); // ~120 frames at 240 steps / stride 2
    expect(t.frames.length).toBe(t.frameCount * t.nodeCount * 3);
    // every recorded position is finite, and each frame is centred (horizontal COM removed)
    let allFinite = true;
    let maxComXZ = 0;
    for (let f = 0; f < t.frameCount; f++) {
      let cx = 0;
      let cz = 0;
      for (let i = 0; i < t.nodeCount; i++) {
        const o = (f * t.nodeCount + i) * 3;
        if (!Number.isFinite(t.frames[o]) || !Number.isFinite(t.frames[o + 1]) || !Number.isFinite(t.frames[o + 2])) allFinite = false;
        cx += t.frames[o];
        cz += t.frames[o + 2];
      }
      maxComXZ = Math.max(maxComXZ, Math.abs(cx / t.nodeCount), Math.abs(cz / t.nodeCount));
    }
    expect(allFinite).toBe(true);
    expect(maxComXZ).toBeLessThan(1e-4); // treadmill: each frame sits at the origin in xz

    // deterministic
    const t2 = await simulateTrajectory(p, { stride: 2 });
    expect(t2.frames).toEqual(t.frames);
  });

  it('sampleTrajectory interpolates and loops (pure — no physics)', () => {
    // 2 frames, 1 node: A=(0,0,0) → B=(2,0,0); dt=1s
    const traj: Trajectory = {
      frames: new Float32Array([0, 0, 0, 2, 0, 0]),
      frameCount: 2,
      nodeCount: 1,
      dt: 1,
      distance: 0,
    };
    const out = new Float32Array(3);
    expect(sampleTrajectory(traj, 0, out)[0]).toBeCloseTo(0); // frame 0
    expect(sampleTrajectory(traj, 0.5, out)[0]).toBeCloseTo(1); // halfway A→B
    expect(sampleTrajectory(traj, 1.5, out)[0]).toBeCloseTo(1); // halfway B→A (loops)
    expect(sampleTrajectory(traj, 2, out)[0]).toBeCloseTo(0); // back to frame 0
  });
});
