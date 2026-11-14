import { describe, it, expect } from 'vitest';
import { HORN_LEN, hornGeometry, hornPath } from '../../src/viewer/horn';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildMeshData } from '../../src/viewer/meshData';
import { hornReachOf } from '../../src/viewer/CreatureMesh';
import { isHybridNode } from '../../src/viewer/bodyField';

describe('horn', () => {
  it('sweeps back from its root and tapers to a point: not a straight cone', () => {
    // (every horn was one smooth straight cone: party hats, a unicorn's spike)
    const up = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]; // aim +Z turned to +Y: straight up
    for (const sweep of [0, 0.5, 1]) {
      const path = hornPath(0.1, up, sweep);
      const tip = path[path.length - 1];
      // it rises, and its point lies back toward the tail (−Z) of its root, by a share of its length
      expect(tip[1]).toBeGreaterThan(0.5 * HORN_LEN * 0.1);
      expect(-tip[2]).toBeGreaterThan(0.2 * HORN_LEN * 0.1);
      // …curving: the middle of the horn lies off the straight line from root to point
      const mid = path[Math.floor(path.length / 2)];
      const t = Math.hypot(tip[1], tip[2]);
      const cross = Math.abs(mid[1] * tip[2] - mid[2] * tip[1]) / t;
      expect(cross).toBeGreaterThan(0.02 * HORN_LEN * 0.1);
    }
    // darker at the root than at the point
    const g = hornGeometry(0.1, up, 0.5, true);
    const pos = g.getAttribute('position');
    const col = g.getAttribute('color');
    let lo = { y: Infinity, c: 0 }, hi = { y: -Infinity, c: 0 };
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < lo.y) lo = { y: pos.getY(i), c: col.getX(i) };
      if (pos.getY(i) > hi.y) hi = { y: pos.getY(i), c: col.getX(i) };
    }
    expect(hi.c).toBeGreaterThan(lo.c + 0.25);
    g.dispose();
  });

  it('a horn grown as links is drawn whole from its root on the skull — not a fat stub with a needle on it', () => {
    // (its links meshed as skin and its sheath drawn on from the last node, every horn was a pencil: a fat
    // olive cone with a thin pale needle on its point)
    let checked = 0;
    for (const id of ['ungulate', 'wyvern', 'dragon', 'chimera']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        for (const f of buildMeshData(p).features.filter((x) => x.kind === 'horn')) {
          // its links are no part of the skin…
          const parent = new Map(p.edges.map(([a, b]) => [b, a]));
          let root = f.idx;
          while (parent.has(root) && p.nodes[parent.get(root)!].part?.kind === 'horn') root = parent.get(root)!;
          for (let j = f.idx; ; j = parent.get(j)!) {
            expect(isHybridNode(p.nodes[j]), `${id} #${seed} horn link in the skin`).toBe(false);
            if (j === root) break;
          }
          if (root === f.idx) continue;
          // …and its sheath starts at the root and runs the links' length and more
          const { reach } = hornReachOf(p, f);
          const path = hornPath(1, f.quat, 0.5, reach);
          const base = p.nodes[root].pos, tip = p.nodes[f.idx].pos;
          const start = [path[0][0] + tip[0], path[0][1] + tip[1], path[0][2] + tip[2]];
          expect(Math.hypot(start[0] - base[0], start[1] - base[1], start[2] - base[2]), `${id} #${seed} from its root`).toBeLessThan(1e-6);
          expect(reach.len!, `${id} #${seed} as long as its links`).toBeGreaterThan(Math.hypot(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("a dragon's and a wyvern's horns sweep up and out off the skull: no fork laid on the neck", () => {
    // (the part of −Z square to a back-and-up aim points down and in: their horns curled down onto the
    // neck, the tips meeting — from above, a cream fork on the neck)
    for (const id of ['dragon', 'wyvern']) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        for (const f of buildMeshData(p).features.filter((x) => x.kind === 'horn' && p.nodes[x.idx].pos[0] > 0)) {
          const { r, reach } = hornReachOf(p, f);
          const path = hornPath(r, f.quat, 0.5, reach);
          const root = path[0], tip = path[path.length - 1];
          expect(tip[1], `${id} #${seed} rises`).toBeGreaterThan(root[1]);
          expect(tip[0], `${id} #${seed} spreads`).toBeGreaterThan(root[0]);
        }
      }
    }
  });
});
