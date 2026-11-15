import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, isBonyFish } from '../../src/engine/grow';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';
import { mutate, DEFAULT_RATES } from '../../src/engine/mutate';
import { fishJaw, myriapodTergites } from '../../src/viewer/bodyField';
import { buildShellGeometry } from '../../src/viewer/smoothSkin';

/** edges used by one triangle only (vertices welded by position): a cut in a closed shell */
function openEdges(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position').array as Float32Array;
  const idx = geo.index ? geo.index.array : null;
  const key = (i: number) => `${pos[3 * i].toFixed(5)},${pos[3 * i + 1].toFixed(5)},${pos[3 * i + 2].toFixed(5)}`;
  const n = idx ? idx.length : pos.length / 3;
  const count = new Map<string, number>();
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((k) => key(idx ? idx[t + k] : t + k));
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      const e = a < b ? a + '|' + b : b + '|' + a;
      count.set(e, (count.get(e) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const c of count.values()) if (c === 1) open++;
  return open;
}

describe('what a review of the round-2 commits found', () => {
  it("a fish's lower jaw grows only on a bony fish in scales with a jaw: never under a lamprey, a sucker, a proboscis or a plated swimmer's mandibles", () => {
    // (gated on fins and no legs alone, eighteen of 3,000 random bodies grew a fish's chin under a funnel, a
    // sucker or mandibles, with no gape run back to it and a round snout that was never brought to a point)
    for (const seed of [4, 407, 537, 924, 1193, 1320, 1698, 1728]) {
      expect(fishJaw(grow(randomGenome(seed))), `random #${seed}`).toEqual([]);
    }
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'fish'));
      expect(isBonyFish(p), `fish #${seed}`).toBe(true);
      expect(fishJaw(p).length, `fish #${seed}`).toBe(1);
    }
  });

  it("a crab grown longer than round keeps its shell whole: no cut across its front and back", () => {
    // (the shell's box was cut to the trunk's radius, not its length: one mutation of a crab's body length
    // sliced its shell open front and back, 72 open edges where its founder has none)
    const g0 = genomeOfMorphotype(2, 'crab');
    const g = mutate(g0, 26, 0, DEFAULT_RATES);
    const trunk = grow(g).nodes.find((n) => n.kind === 'spine' && (n.segment ?? 0) === 0)!;
    expect(trunk.scale?.[2] ?? 1, 'the mutant is longer than round').toBeGreaterThan(1.2);
    expect(openEdges(buildShellGeometry(grow(g0), 'low')!), 'founder').toBe(0);
    expect(openEdges(buildShellGeometry(grow(g), 'low')!), 'mutant').toBe(0);
  });

  it('a ringed body wears a plate on every ring, legged or not, each a ring long', () => {
    // (a mutant with more rings than leg pairs left a ring bare, and the plate before it ran two rings long)
    const g = mutate(genomeOfMorphotype(1, 'arthro-alien'), 23, 0, DEFAULT_RATES);
    const legs = g.body.appendages.filter((a) => a.kind === 'leg').length;
    expect(g.body.repeat, 'more rings than leg pairs').toBeGreaterThan(legs);
    const plates = myriapodTergites(grow(g));
    expect(plates.length).toBe(g.body.repeat);
    const lengths = plates.map((t) => Math.hypot(t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]) + 2 * t.r);
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.6);
  });
});
