import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildBeak } from '../../src/viewer/mouths/beak';
import { tailFanDroop } from '../../src/viewer/wings';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
/** the seeded droop every level bird's tail fan is carried at */
const seeded = (seed: number) => 0.2 + (seed % 5) * 0.06;

describe("a hawk's look", () => {
  it('its bill leaves the face running out level, and only then hooks: not a dagger hung from under the eye', () => {
    // (laid along the head's forward and hooked by near its own length, the culmen fell 0.25-0.35 of its run
    // over its first half, its point hung under the chin: from in front a dark dagger below the eye)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'raptor'));
      const b = buildBeak(p, p.nodes.findIndex((n) => n.terminal === 'mouth'), [], false, 'hybrid')!;
      const u = b.upperPath;
      const a = u[0], m = u[Math.floor(u.length * 0.5)];
      const fall = (a[1] - m[1]) / Math.hypot(m[0] - a[0], m[2] - a[2]);
      expect(fall, `hawk #${seed}`).toBeLessThan(0.12);
    }
  });

  it("its tail fan hangs on down the line of its upright back; a level songbird's keeps its own droop", () => {
    // (carried at a level bird's 0.2-0.44 from a trunk that rises toward its shoulders, a hawk's tail stood
    // out of its rump at a right angle to its body: a flat banded wafer)
    for (const seed of SEEDS) {
      expect(tailFanDroop(grow(genomeOfMorphotype(seed, 'raptor'))), `hawk #${seed}`).toBeGreaterThan(0.6);
      const bird = grow(genomeOfMorphotype(seed, 'bird'));
      expect(tailFanDroop(bird), `songbird #${seed}`).toBeLessThan(seeded(bird.genomeRef.seed) + 0.15);
    }
  });
});
