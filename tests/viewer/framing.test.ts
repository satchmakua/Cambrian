import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { framingOf, reachOf } from '../../src/viewer/framing';
import { restPosed } from '../../src/viewer/rig';
import { buildMeshData } from '../../src/viewer/meshData';
import { finOf } from '../../src/viewer/CreatureMesh';

describe('framing a creature', () => {
  it('a body is centred on its bounds, its size the longest of its extents', () => {
    const cat = grow(genomeOfMorphotype(3, 'felid'));
    const f = framingOf(cat);
    for (let k = 0; k < 3; k++) {
      expect(f.center[k]).toBeCloseTo((cat.bounds.min[k] + cat.bounds.max[k]) / 2, 9);
      expect(f.ext[k]).toBeCloseTo(cat.bounds.max[k] - cat.bounds.min[k], 9);
    }
    expect(f.size).toBe(Math.max(...f.ext));
    expect(f.groundY).toBeCloseTo(-f.ext[1] / 2, 9);
    expect(f.face).not.toBeNull();
  });

  it('a view of a body in more than one pose stands off by one distance for all of them', () => {
    // (the Studio framed its main view on whichever pose was showing: a snake lying in its S is a
    // fifth shorter than the same snake laid out to slither, so setting it moving — or stopping it —
    // moved the camera, and threw away the angle it had been turned to)
    let seen = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const grown = grow(genomeOfMorphotype(seed, 'serpent'));
      const rest = restPosed(grown);
      if (rest === grown) continue;
      seen++;
      const a = framingOf(grown).size, b = framingOf(rest).size;
      expect(Math.abs(a - b), `serpent #${seed}: the two poses differ`).toBeGreaterThan(0.3);
      expect(reachOf(grown, rest)).toBe(Math.max(a, b));
      expect(reachOf(rest, grown)).toBe(reachOf(grown, rest)); // whichever is showing
    }
    expect(seen).toBeGreaterThan(5);
    // a legged body has the one pose
    const cat = grow(genomeOfMorphotype(3, 'felid'));
    expect(restPosed(cat)).toBe(cat);
    expect(reachOf(cat, restPosed(cat))).toBe(framingOf(cat).size);
  });

  it("a finned body is framed out to its fins: a fish's tail fan is in the picture", () => {
    // (a fin is drawn from its node, not grown as nodes: the body's bounds end at the tail's last
    // link, and the Studio's side plate cut the tail fin off at its edge)
    for (const id of ['fish', 'shark']) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const f = framingOf(p);
        const lo = f.center.map((c, k) => c - f.ext[k] / 2);
        const hi = f.center.map((c, k) => c + f.ext[k] / 2);
        let rear = Infinity;
        for (const fin of buildMeshData(p).features.filter((x) => x.type === 'fin')) {
          const g = finOf(fin, p, 'hybrid').membrane;
          const pos = g.getAttribute('position');
          const o = p.nodes[fin.idx].pos;
          for (let i = 0; i < pos.count; i++) {
            const v = [o[0] + pos.getX(i), o[1] + pos.getY(i), o[2] + pos.getZ(i)];
            rear = Math.min(rear, v[2]);
            // (a sail's base is traced down the back it stands on: within a few hundredths of the
            // fin as framed, which stands straight)
            for (let k = 0; k < 3; k++) {
              expect(v[k], `${id} #${seed}`).toBeGreaterThan(lo[k] - 0.08);
              expect(v[k], `${id} #${seed}`).toBeLessThan(hi[k] + 0.08);
            }
          }
          g.dispose();
        }
        // the premise: the tail fin reaches well past the body's own bounds
        expect(p.bounds.min[2] - rear, `${id} #${seed}`).toBeGreaterThan(0.5);
        expect(f.size).toBeGreaterThan(p.bounds.max[2] - p.bounds.min[2] + 0.5);
      }
    }
    // a body without fins is framed on its bounds, as ever
    const cat = grow(genomeOfMorphotype(3, 'felid'));
    expect(framingOf(cat).ext[2]).toBeCloseTo(cat.bounds.max[2] - cat.bounds.min[2], 12);
  });
});
