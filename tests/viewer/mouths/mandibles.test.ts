import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { buildMandibles, type MandiblesBuild } from '../../../src/viewer/mouths/mandibles';

// Blade hinges are corner samples of the mouth line — the same on-surface tolerance as mouthLine
// plus a hair for the Newton fallback on soft saddles.
const ON_SURFACE = 6e-3;

/** Force the phenotype's first mouth node into the mandibles style band (0.375..0.5). */
function forceMandibles(p: Phenotype): number | null {
  const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (idx < 0) return null;
  const node = p.nodes[idx];
  node.part = { kind: node.part?.kind ?? 'maw', style: 0.44 };
  return idx;
}

function positions(g: THREE.BufferGeometry): Float32Array {
  return g.getAttribute('position').array as Float32Array;
}

function allFinite(g: THREE.BufferGeometry): boolean {
  const arr = positions(g);
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return false;
  return true;
}

function geoms(b: MandiblesBuild): THREE.BufferGeometry[] {
  return [b.blades[0], b.blades[1], b.upperLip, b.lowerLip, b.interior];
}

describe('mandibles mouth (mouth overhaul)', () => {
  it('is deterministic (two builds → identical paths, transforms, and vertex arrays)', () => {
    let checked = 0;
    for (const s of [3, 9, 15]) {
      const p = grow(randomGenome(s));
      const idx = forceMandibles(p);
      if (idx == null) continue;
      const a = buildMandibles(p, idx, [], false)!;
      const b = buildMandibles(p, idx, [], false)!;
      expect(a.bladePaths).toEqual(b.bladePaths);
      expect(a.serrations).toEqual(b.serrations);
      for (let g = 0; g < 5; g++) {
        expect(Array.from(positions(geoms(a)[g]))).toEqual(Array.from(positions(geoms(b)[g])));
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('returns null when the node is not a mouth', () => {
    const p = grow(defaultGenome());
    const notMouth = p.nodes.findIndex((n) => n.terminal !== 'mouth');
    expect(notMouth).toBeGreaterThanOrEqual(0);
    expect(buildMandibles(p, notMouth, [], false)).toBeNull();
  });

  it('every geometry and transform is finite across random genomes', () => {
    let checked = 0;
    for (let s = 0; s < 16; s++) {
      const p = grow(randomGenome(s));
      const idx = forceMandibles(p);
      if (idx == null) continue;
      const built = buildMandibles(p, idx, [], s % 2 === 0)!;
      for (const g of geoms(built)) expect(allFinite(g)).toBe(true);
      for (const t of built.serrations) {
        expect(t.pos.every(Number.isFinite)).toBe(true);
        expect(Number.isFinite(t.quat[0] + t.quat[1] + t.quat[2] + t.quat[3])).toBe(true);
        expect(t.len).toBeGreaterThan(0);
        expect(t.w).toBeGreaterThan(0);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(6);
  });

  it('blade hinges root ON the true skin — floating mandibles are impossible', () => {
    let checked = 0;
    for (let s = 0; s < 16; s++) {
      const p = grow(randomGenome(s));
      const idx = forceMandibles(p);
      if (idx == null) continue;
      const built = buildMandibles(p, idx, [], false)!;
      const f = buildFieldPrims(p, 'body');
      const o = p.nodes[idx].pos; // paths are node-relative — lift back to world for the field
      for (const path of built.bladePaths) {
        const d = Math.abs(fieldAt(f, path[0][0] + o[0], path[0][1] + o[1], path[0][2] + o[2]));
        expect(d).toBeLessThan(ON_SURFACE);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(6);
  });

  it('the pair is an exact bilateral mirror on the default genome', () => {
    const p = grow(defaultGenome());
    const idx = forceMandibles(p);
    expect(idx).not.toBeNull();
    const built = buildMandibles(p, idx!, [], false)!;
    expect(Math.abs(built.spec.node.pos[0])).toBeLessThan(1e-6); // the face mouth sits on X=0

    // centerlines mirror point-for-point (node-relative, so the mirror plane is X=0)
    const [lp, rp] = built.bladePaths;
    for (let k = 0; k < lp.length; k++) {
      expect(lp[k][0]).toBeCloseTo(-rp[k][0], 4);
      expect(lp[k][1]).toBeCloseTo(rp[k][1], 4);
      expect(lp[k][2]).toBeCloseTo(rp[k][2], 4);
    }
    // serration twins: same path key on both blades → mirrored roots, identical lengths
    for (let i = 0; i < 4; i++) {
      const a = built.serrations[i];
      const b = built.serrations[i + 4];
      expect(a.pos[0]).toBeCloseTo(-b.pos[0], 4);
      expect(a.pos[1]).toBeCloseTo(b.pos[1], 4);
      expect(a.pos[2]).toBeCloseTo(b.pos[2], 4);
      expect(a.len).toBeCloseTo(b.len, 6);
      expect(a.w).toBeCloseTo(b.w, 6);
    }
    // the swept blade meshes mirror as point sets (ring windings differ, so match by search)
    const va = built.blades[0].getAttribute('position');
    const vb = built.blades[1].getAttribute('position');
    expect(va.count).toBe(vb.count);
    for (let i = 0; i < va.count; i++) {
      let best = Infinity;
      for (let j = 0; j < vb.count; j++) {
        const d = Math.hypot(va.getX(i) + vb.getX(j), va.getY(i) - vb.getY(j), va.getZ(i) - vb.getZ(j));
        if (d < best) best = d;
      }
      expect(best).toBeLessThan(1e-3);
    }
  });

  it('paired blades: 8 serrations, tips nearly meeting by the gape, protrusion under 1.3r', () => {
    const p = grow(defaultGenome());
    const idx = forceMandibles(p);
    const built = buildMandibles(p, idx!, [], false)!;
    const r = built.r;
    const spec = built.spec;
    expect(built.serrations.length).toBe(8);
    const [lp, rp] = built.bladePaths;
    expect(lp.length).toBe(8);
    expect(rp.length).toBe(8);

    // tips converge to the designed clearance — nearly meeting, far inside the hinge span
    const tip = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const tipGap = tip(lp[7], rp[7]);
    const hingeSpan = tip(lp[0], rp[0]);
    expect(Math.abs(tipGap - r * (0.12 + 0.2 * spec.gape))).toBeLessThan(r * 0.05);
    expect(tipGap).toBeLessThan(hingeSpan * 0.5);

    for (const path of built.bladePaths) {
      // forward protrusion off the hinge stays under the variant cap, but the blades do protrude
      let maxFwd = -Infinity;
      for (const pt of path) {
        const fwd =
          (pt[0] - path[0][0]) * spec.aim[0] + (pt[1] - path[0][1]) * spec.aim[1] + (pt[2] - path[0][2]) * spec.aim[2];
        if (fwd > maxFwd) maxFwd = fwd;
      }
      expect(maxFwd).toBeLessThanOrEqual(r * 1.3);
      expect(maxFwd).toBeGreaterThan(r * 0.8);
    }
    // every serration stays rooted at its blade path point (inner-rim offset + sink only)
    built.serrations.forEach((tooth, i) => {
      const path = built.bladePaths[i < 4 ? 0 : 1];
      const at = path[2 + (i % 4)];
      expect(tip(tooth.pos, at)).toBeLessThan(r * 0.2);
    });
  });

  it('the interior sheet recesses into a carved cavity and sits proud on the capsule kit', () => {
    const p = grow(defaultGenome());
    const idx = forceMandibles(p);
    const proud = buildMandibles(p, idx!, [], false)!;
    const sunk = buildMandibles(p, idx!, [], true)!;
    const a = proud.interior.getAttribute('position');
    const b = sunk.interior.getAttribute('position');
    expect(a.count).toBe(b.count);
    // the recessed build pulls EVERY interior vertex off the proud placement (into the cavity)
    for (let i = 0; i < a.count; i++) {
      const d = Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i));
      expect(d).toBeGreaterThan(proud.r * 0.1);
    }
  });
});
