import { describe, it, expect } from 'vitest';
import { simulateDistance, runPhysicsGenerations } from '../../src/physics/fitness';
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
});
