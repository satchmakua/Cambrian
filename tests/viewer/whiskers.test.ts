import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { whiskerFan } from '../../src/viewer/whiskers';

describe('whiskers', () => {
  it('fan out level from the pad, splayed to its side — none hangs toward the floor', () => {
    // (three straight sticks along the part's own aim, a third of a radian down: seen from three quarters
    // a near whisker hung from the chin like a string)
    let checked = 0;
    for (const id of ['felid', 'canid', 'rodent', 'mustelid']) {
      for (const seed of [1, 2, 3, 4, 23]) {
        const p = grow(genomeOfMorphotype(seed, id));
        const pads = p.nodes.filter((n) => n.part?.kind === 'whisker' && n.terminal);
        if (pads.length === 0) continue; // (a dog has whiskers one time in four)
        expect(pads.length, `${id} #${seed}`).toBe(2);
        checked++;
        const fans = pads.map((n) => whiskerFan(n.quat, Math.max(n.radius, 0.06)));
        for (let k = 0; k < 2; k++) {
          const side = Math.sign(pads[k].pos[0]);
          for (const d of fans[k].dirs) {
            expect(Math.abs(d[1]), `${id} #${seed}: level`).toBeLessThan(0.2);
            expect(d[0] * side, `${id} #${seed}: out to its side`).toBeGreaterThan(0.8);
          }
          fans[k].geometry.dispose();
        }
        // the two pads mirror each other
        fans[0].dirs.forEach((d, i) => {
          const e = fans[1].dirs[i];
          expect(d[0], `${id} #${seed}`).toBeCloseTo(-e[0], 5);
          expect(d[1], `${id} #${seed}`).toBeCloseTo(e[1], 5);
          expect(d[2], `${id} #${seed}`).toBeCloseTo(e[2], 5);
        });
      }
    }
    expect(checked).toBeGreaterThan(12);
  });
});
