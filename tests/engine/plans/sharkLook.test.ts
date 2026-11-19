/**
 * A shark as it is seen: its gill slits are cuts in the skin, not a grille of rods standing on it, and its
 * pectorals are foils with a body to them, not needles, from ahead.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildMeshData, type MeshFeature } from '../../../src/viewer/meshData';
import { gillCutOf, gillGeometry, gillMarks, gillRadiusOf, gillSlits, SLIT_HALF } from '../../../src/viewer/gills';
import { finOf } from '../../../src/viewer/CreatureMesh';
import { buildFin, finGirth, finKindOf } from '../../../src/viewer/wings';
import { surfacePrims } from '../../../src/viewer/mouthLine';
import { fieldAt } from '../../../src/viewer/bodyField';

const body = (seed: number) => grow(genomeOfMorphotype(seed, 'shark'));
const features = (p: Phenotype, type: string) => buildMeshData(p).features.filter((f) => f.type === type);
const aimOf = (f: MeshFeature) => new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...f.quat));

/** how far each vertex of a node-relative geometry stands over the skin (the field's value there) */
function heights(p: Phenotype, idx: number, g: THREE.BufferGeometry): number[] {
  const prims = surfacePrims(p, 'hybrid');
  const o = p.nodes[idx].pos;
  const pos = g.getAttribute('position');
  const out: number[] = [];
  for (let i = 0; i < pos.count; i++) out.push(fieldAt(prims, o[0] + pos.getX(i), o[1] + pos.getY(i), o[2] + pos.getZ(i)));
  return out;
}

/** a fin seen from ahead (along the body): its depth across its span, at a share `s` of the way out */
function frontDepth(geo: THREE.BufferGeometry, aim: THREE.Vector3, s: number): number {
  const a = new THREE.Vector2(aim.x, aim.y).normalize();
  const n = new THREE.Vector2(-a.y, a.x);
  const pos = geo.getAttribute('position');
  let span = 0;
  for (let i = 0; i < pos.count; i++) span = Math.max(span, pos.getX(i) * a.x + pos.getY(i) * a.y);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs((pos.getX(i) * a.x + pos.getY(i) * a.y) / span - s) > 0.15) continue;
    const h = pos.getX(i) * n.x + pos.getY(i) * n.y;
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return hi > lo ? hi - lo : 0;
}

describe("a shark's gill slits are cut in the skin", () => {
  it('each lies flat on the skin — nothing of it stands out of the outline — a thin lens, pointed at its ends', () => {
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = body(seed);
      for (const f of features(p, 'gill')) {
        expect(gillCutOf(f.style)).toBe('slits');
        const r = gillRadiusOf(p, f.idx, 'slits', Math.max(f.radius, 0.06));
        const g = gillSlits(p, f.idx, 'hybrid', r);
        const hs = heights(p, f.idx, g);
        // on the skin, never under it (the polygonized skin lies a little inside the field), and no more than a
        // fiftieth of the gill's radius over it: the round cords stood two thirds of a tenth of it proud
        expect(Math.min(...hs), `#${seed} under the skin`).toBeGreaterThan(0);
        expect(Math.max(...hs) / r, `#${seed} standing proud`).toBeLessThan(0.02);
        // five slits, each a lens: its middle row SLIT_HALF of the radius either side of its line, its ends a point
        const pos = g.getAttribute('position');
        const rows = pos.count / 15;
        expect(Number.isInteger(rows) && rows >= 5, `#${seed} five slits of rows of three`).toBe(true);
        for (let s = 0; s < 5; s++) {
          const at = (j: number, k: number) => new THREE.Vector3().fromBufferAttribute(pos, s * rows * 3 + j * 3 + k);
          const mid = (rows - 1) / 2;
          expect(at(mid, 0).distanceTo(at(mid, 2)) / r, `#${seed} slit ${s} width`).toBeCloseTo(2 * SLIT_HALF, 2);
          expect(at(0, 0).distanceTo(at(0, 2)), `#${seed} slit ${s} pointed`).toBeLessThan(1e-6);
        }
        g.dispose();
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('…where the old cords stood out of the skin by more than half a tenth of the gill', () => {
    // (the premise: the five round cords of gillMarks, drawn as rods, were what broke the outline)
    const p = body(37);
    const f = features(p, 'gill')[0];
    const r = gillRadiusOf(p, f.idx, 'slits', Math.max(f.radius, 0.06));
    const cords = gillGeometry(gillMarks(p, f.idx, 'hybrid', 'slits', r));
    expect(Math.max(...heights(p, f.idx, cords)) / r).toBeGreaterThan(0.05);
    cords.dispose();
  });
});

describe("a shark's pectorals have a body to them from ahead", () => {
  it('seen along the body each is a foil, deep at its root and thinning out to its tip — not a needle', () => {
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = body(seed);
      for (const f of features(p, 'fin')) {
        const aim = aimOf(f);
        if (finKindOf(aim, f.kind) !== 'pectoral') continue;
        const g = finGirth(p, f.idx, 'pectoral', f.radius);
        const m = finOf(f, p, 'hybrid').membrane;
        const root = frontDepth(m, aim, 0.2), half = frontDepth(m, aim, 0.5), tip = frontDepth(m, aim, 0.8);
        // (a flat sheet edge-on to the front showed 0.03 of a girth all the way out)
        expect(root / g, `#${seed} at its root`).toBeGreaterThan(0.18);
        expect(half / g, `#${seed} half way out`).toBeGreaterThan(0.1);
        expect(tip, `#${seed} thinning to the tip`).toBeLessThan(root);
        m.dispose();
        seen++;
      }
    }
    expect(seen).toBe(24);
  });

  it('…while the plain fin is still the sheet it was', () => {
    // (the foil is a shark's alone: every other body's pectoral, edge-on from ahead, is as thin as ever)
    const side = new THREE.Vector3(1, -0.3, -0.3).normalize();
    const m = buildFin('pectoral', side, 0.6, 1, 'plain').membrane;
    expect(frontDepth(m, side, 0.5) / 0.6).toBeLessThan(0.06);
    m.dispose();
  });
});
