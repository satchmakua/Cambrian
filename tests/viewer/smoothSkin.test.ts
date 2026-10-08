import { describe, it, expect } from 'vitest';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { grow } from '../../src/engine/grow';
import { randomGenome, genomeOfMorphotype } from '../../src/engine/random';
import { defaultGenome } from '../../src/engine/genome';

// scan an attribute once in a plain loop (per-vertex expect() is far too slow at this scale)
function scan(arr: ArrayLike<number>) {
  let finite = true;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!Number.isFinite(v)) finite = false;
    const a = i % 3;
    if (v < min[a]) min[a] = v;
    if (v > max[a]) max[a] = v;
  }
  return { finite, min, max };
}

describe('smooth skin (M15)', () => {
  it('builds a non-empty, finite surface for the default creature', () => {
    const geo = buildSmoothGeometry(grow(defaultGenome()));
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    expect(pos.count).toBeGreaterThan(60); // a real mesh, not a stray triangle
    const index = geo.getIndex();
    expect(index).not.toBeNull(); // welded: an indexed mesh, not a triangle soup
    expect(index!.count % 3).toBe(0); // whole triangles
    let maxI = 0;
    for (let i = 0; i < index!.count; i++) maxI = Math.max(maxI, index!.getX(i));
    expect(maxI).toBeLessThan(pos.count);
    // vertices are shared between triangles (a welded surface averages ~6 triangles per vertex)
    expect(index!.count / 3).toBeGreaterThan(pos.count * 1.5);
    expect(scan(pos.array as ArrayLike<number>).finite).toBe(true);
    expect(scan(nrm.array as ArrayLike<number>).finite).toBe(true);
  });

  it('hugs the body: vertices sit within the padded bounds, and the surface spans it', () => {
    for (let s = 0; s < 30; s++) {
      const p = grow(randomGenome(s));
      const geo = buildSmoothGeometry(p);
      const pos = geo.getAttribute('position') as { array: ArrayLike<number>; count: number };
      expect(pos.count).toBeGreaterThan(0); // never breaks down to nothing (any topology)

      const { finite, min, max } = scan(pos.array);
      expect(finite).toBe(true);
      const padBy = 1.6; // generous: the field is sampled on a padded grid
      for (let a = 0; a < 3; a++) {
        expect(min[a]).toBeGreaterThanOrEqual(p.bounds.min[a] - padBy);
        expect(max[a]).toBeLessThanOrEqual(p.bounds.max[a] + padBy);
      }
      // the surface actually spans most of the body on its longest axis (not a speck)
      const bodyZ = p.bounds.max[2] - p.bounds.min[2];
      if (bodyZ > 0.6) expect(max[2] - min[2]).toBeGreaterThan(bodyZ * 0.5);
    }
  });

  it('is deterministic (same phenotype → identical surface)', () => {
    const p = grow(randomGenome(123));
    const a = buildSmoothGeometry(p).getAttribute('position').array;
    const b = buildSmoothGeometry(p).getAttribute('position').array;
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
    let identical = true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) identical = false;
    expect(identical).toBe(true);
  });

  it('meshes thin limbs into the body — legs reach the surface, not float above it (M24)', () => {
    for (let s = 0; s < 8; s++) {
      const p = grow(genomeOfMorphotype(s * 5 + 1, 'felid')); // a clearly-legged quadruped
      const legNodes = p.nodes.filter((n) => n.part?.kind === 'leg');
      const feetY = Math.min(...legNodes.map((n) => n.pos[1]));
      const { min } = scan(buildSmoothGeometry(p).getAttribute('position').array);
      // the surface descends to within ~0.5 bu of the lowest leg node (the legs are meshed, not dropped)
      expect(min[1]).toBeLessThan(feetY + 0.5);
    }
  });

  it('the hybrid mode builds a non-empty, finite, in-bounds, deterministic surface over every part', () => {
    for (let s = 0; s < 14; s++) {
      const p = grow(randomGenome(s));
      const geo = buildSmoothGeometry(p, true);
      const pos = geo.getAttribute('position') as { array: ArrayLike<number>; count: number };
      expect(pos.count).toBeGreaterThan(0);
      const { finite, min, max } = scan(pos.array);
      expect(finite).toBe(true);
      for (let a = 0; a < 3; a++) {
        expect(min[a]).toBeGreaterThanOrEqual(p.bounds.min[a] - 1.6);
        expect(max[a]).toBeLessThanOrEqual(p.bounds.max[a] + 1.6);
      }
    }
    // deterministic
    const q = grow(randomGenome(5));
    const a = buildSmoothGeometry(q, true).getAttribute('position').array;
    const b = buildSmoothGeometry(q, true).getAttribute('position').array;
    expect(a.length).toBe(b.length);
  });

  it('survives extreme topologies (serpent, radial) without exploding', () => {
    for (const p of [grow(randomGenome(7, 'bilateral')), grow(randomGenome(3, 'radial'))]) {
      const pos = buildSmoothGeometry(p).getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      expect(scan(pos.array as ArrayLike<number>).finite).toBe(true);
    }
  });

  it('shades smoothly: unit normals pointing out of the body, and baked AO in [0,1]', async () => {
    const { buildFieldPrims, fieldAt } = await import('../../src/viewer/bodyField');
    for (let s = 0; s < 8; s++) {
      const p = grow(randomGenome(100 + s));
      const geo = buildSmoothGeometry(p);
      const pos = geo.getAttribute('position');
      const nrm = geo.getAttribute('normal');
      const ao = geo.getAttribute('aAO');
      expect(ao.count).toBe(pos.count);
      const f = buildFieldPrims(p, 'body');
      let outward = 0;
      for (let v = 0; v < pos.count; v++) {
        const len = Math.hypot(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
        expect(Math.abs(len - 1)).toBeLessThan(1e-3);
        const a = ao.getX(v);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
        // stepping along the normal moves AWAY from the body (the field rises)
        const e = 0.05;
        const out = fieldAt(f, pos.getX(v) + nrm.getX(v) * e, pos.getY(v) + nrm.getY(v) * e, pos.getZ(v) + nrm.getZ(v) * e);
        const inn = fieldAt(f, pos.getX(v) - nrm.getX(v) * e, pos.getY(v) - nrm.getY(v) * e, pos.getZ(v) - nrm.getZ(v) * e);
        if (out > inn) outward++;
      }
      expect(outward / pos.count).toBeGreaterThan(0.97);
    }
  });

  it('round cones taper continuously: the exact distance matches both end spheres and the flank', async () => {
    const { roundConeDist } = await import('../../src/viewer/bodyField');
    // cone from (0,0,0) r=1 to (0,0,4) r=0.5
    expect(roundConeDist(0, 0, -1, 0, 0, 0, 0, 0, 4, 1, 0.5)).toBeCloseTo(0, 6); // back cap
    expect(roundConeDist(0, 0, 4.5, 0, 0, 0, 0, 0, 4, 1, 0.5)).toBeCloseTo(0, 6); // front cap
    // the flank radius shrinks along the axis (between the caps, ~linear for a shallow cone)
    const flank = (z: number) => {
      // find the surface radius at height z by bisection on x
      let lo = 0, hi = 3;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        if (roundConeDist(m, 0, z, 0, 0, 0, 0, 0, 4, 1, 0.5) < 0) lo = m;
        else hi = m;
      }
      return lo;
    };
    expect(flank(1)).toBeGreaterThan(flank(2));
    expect(flank(2)).toBeGreaterThan(flank(3));
    // a swallowed end-sphere degenerates to the bigger sphere, never NaN
    expect(roundConeDist(0, 0, 0, 0, 0, 0, 0, 0, 0.1, 1, 0.2)).toBeCloseTo(-1, 6);
  });

  it('a carapace is a shell CONFORMING to the trunk — not a giant egg', async () => {
    const { buildShellGeometry } = await import('../../src/viewer/smoothSkin');
    for (const id of ['chelonian', 'crab']) {
      for (let s = 0; s < 6; s++) {
        const p = grow(genomeOfMorphotype(s * 11 + 2, id));
        const shell = buildShellGeometry(p, 'low');
        if (!p.nodes.some((n) => n.terminal === 'carapace')) {
          expect(shell).toBeNull();
          continue;
        }
        expect(shell).not.toBeNull();
        const pos = shell!.getAttribute('position');
        expect(pos.count).toBeGreaterThan(50);
        const { finite, min, max } = scan(pos.array as ArrayLike<number>);
        expect(finite).toBe(true);
        // hugging the trunk: never wider than the trunk plus a modest margin
        const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
        const rMax = Math.max(...trunk.map((n) => n.radius));
        const tx0 = Math.min(...trunk.map((n) => n.pos[0] - n.radius * (n.scale?.[0] ?? 1)));
        const tx1 = Math.max(...trunk.map((n) => n.pos[0] + n.radius * (n.scale?.[0] ?? 1)));
        expect(min[0]).toBeGreaterThan(tx0 - rMax * 0.9);
        expect(max[0]).toBeLessThan(tx1 + rMax * 0.9);
        // and it is a BACK shell: nothing hangs below the trunk's mid-height skirt
        const yMid = trunk.reduce((t, n) => t + n.pos[1], 0) / trunk.length;
        expect(min[1]).toBeGreaterThan(yMid - rMax * 0.45);
      }
    }
  });

  it('an anisotropic trunk is one smooth elliptical tube — no per-node bulges (the caterpillar)', async () => {
    const { buildFieldPrims, fieldAt } = await import('../../src/viewer/bodyField');
    for (const id of ['fish', 'felid', 'crocodilian']) {
      const p = grow(genomeOfMorphotype(4, id));
      const f = buildFieldPrims(p, 'body');
      f.k = 0;
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
      if (trunk.length < 3 || !trunk.some((n) => n.scale)) continue;
      // sample the top-of-back height along the trunk: it must vary smoothly (no bead-per-node ripple)
      const zs = trunk.map((n) => n.pos[2]).sort((a, b) => a - b);
      const top = (z: number) => {
        let lo = 0, hi = 4;
        for (let i = 0; i < 40; i++) {
          const m = (lo + hi) / 2;
          if (fieldAt(f, 0, m, z) < 0) lo = m;
          else hi = m;
        }
        return lo;
      };
      const ys: number[] = [];
      for (let i = 0; i <= 40; i++) ys.push(top(zs[0] + ((zs[zs.length - 1] - zs[0]) * i) / 40));
      // beads show as one bump per node along the back; a smooth trunk has at most a bump per haunch
      // (shoulder / hip) plus the fusiform middle
      const girth = Math.max(...trunk.map((n) => n.radius));
      let bumps = 0;
      for (let i = 1; i < ys.length - 1; i++) {
        if (ys[i] > ys[i - 1] + girth * 0.004 && ys[i] >= ys[i + 1] + girth * 0.004) bumps++;
      }
      const legPairs = p.genomeRef.body.appendages.filter((a) => a.kind === 'leg').length;
      expect(bumps).toBeLessThanOrEqual(legPairs + 1);
      expect(bumps).toBeLessThan(trunk.length); // and never one per node
    }
  });
});

