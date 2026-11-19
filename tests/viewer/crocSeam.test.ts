import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { genomeOfMorphotype } from '../../src/engine/random';
import { grow, type Phenotype } from '../../src/engine/grow';
import { mouthCarves, mouthSpec } from '../../src/viewer/mouthLine';
import { buildJawed } from '../../src/viewer/mouths/jawed';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { norm3, qRotateV } from '../../src/viewer/bodyField';
import { drawnField, polygonize } from '../../src/viewer/polygonize';

// A crocodile's shut mouth is a groove along its jaw that turns round the end of its snout IN the skin as it
// is drawn (the polygonized hybrid skin, at the Studio's quality) — not a wire traced on the exact field, which
// the drawn snout (only a cell or two deep) lies inside of, and whose tip it falls short of.
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 29, 37];
const croc = (seed: number) => grow(genomeOfMorphotype(seed, 'crocodilian'));

/** the drawn skin's triangles around the head, with their outward normals */
function headTriangles(p: Phenotype, near: readonly number[], reach: number) {
  const g = buildSmoothGeometry(p, true, mouthCarves(p), 'high');
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), idx = g.getIndex()!;
  const end = (g.userData.tubeFrom as { index: number }).index; // the polygonized surface (not the limb tubes)
  const tris: { t: THREE.Triangle; n: THREE.Vector3 }[] = [];
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i);
  for (let k = 0; k < end; k += 3) {
    const a = idx.getX(k), b = idx.getX(k + 1), c = idx.getX(k + 2);
    const A = v(a);
    if (A.distanceTo(new THREE.Vector3(near[0], near[1], near[2])) > reach) continue;
    const n = new THREE.Vector3().fromBufferAttribute(nrm, a).add(new THREE.Vector3().fromBufferAttribute(nrm, b)).add(new THREE.Vector3().fromBufferAttribute(nrm, c)).normalize();
    tris.push({ t: new THREE.Triangle(A, v(b), v(c)), n });
  }
  return { g, tris };
}

describe('the drawn field (polygonize drawnField)', () => {
  it('is zero on every vertex the polygonizer draws, and signed like the field away from them', () => {
    const field = (x: number, y: number, z: number) => Math.hypot(x / 0.9, y / 0.25, z / 0.6) * 0.25 - 0.25; // a flat lens, a cell or two deep
    const min = [-1, -1, -1], max = [1, 1, 1];
    const poly = polygonize(field, min, max, { res: 12 });
    const drawn = drawnField(field, min, max, 12);
    let worst = 0;
    for (let v = 0; v < poly.positions.length; v += 3) worst = Math.max(worst, Math.abs(drawn(poly.positions[v], poly.positions[v + 1], poly.positions[v + 2])));
    expect(poly.positions.length).toBeGreaterThan(0);
    expect(worst).toBeLessThan(1e-6);
    expect(drawn(0, 0, 0)).toBeLessThan(0);
    expect(drawn(0.95, 0.5, 0)).toBeGreaterThan(0);
  });
});

describe("a crocodile's shut mouth", () => {
  it('lies on its skin as drawn, round the end of its snout too (not a hoop through the air)', () => {
    let worst = 0, past = -Infinity;
    for (const seed of SEEDS) {
      const p = croc(seed);
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as 'fanged', 'hybrid')!;
      const o = spec.node.pos;
      const { g, tris } = headTriangles(p, spec.anchor.pos, 2.5);
      const tmp = new THREE.Vector3();
      // each seam sample's distance OUT from the drawn skin (× the mouth's size)
      for (const sm of b.upper) {
        const P = new THREE.Vector3(sm.p[0] + o[0], sm.p[1] + o[1], sm.p[2] + o[2]);
        let best = Infinity, out = 0;
        for (const { t, n } of tris) {
          t.closestPointToPoint(P, tmp);
          const d = tmp.distanceTo(P);
          if (d < best) {
            best = d;
            out = P.clone().sub(tmp).dot(n) > 0 ? d : 0;
          }
        }
        worst = Math.max(worst, out / spec.r);
      }
      // …and how far its front runs on past the drawn snout's end, along the head
      const up = norm3(qRotateV(spec.anchor.quat, [0, 1, 0]));
      const f = qRotateV(spec.anchor.quat, [0, 0, 1]);
      const fu = f[0] * up[0] + f[1] * up[1] + f[2] * up[2];
      const ahead = norm3([f[0] - up[0] * fu, f[1] - up[1] * fu, f[2] - up[2] * fu]);
      const along = (x: number, y: number, z: number) => x * ahead[0] + y * ahead[1] + z * ahead[2];
      const pos = g.getAttribute('position');
      let skinFront = -Infinity;
      for (let i = 0; i < (g.userData.tubeFrom as { vertex: number }).vertex; i++) skinFront = Math.max(skinFront, along(pos.getX(i), pos.getY(i), pos.getZ(i)));
      let seamFront = -Infinity;
      for (const sm of b.upper) seamFront = Math.max(seamFront, along(sm.p[0] + o[0], sm.p[1] + o[1], sm.p[2] + o[2]));
      past = Math.max(past, (seamFront - skinFront) / spec.r);
    }
    // (HEAD: samples 0.11–0.72 of the mouth's size off the drawn skin, the front 0.6 of it past the snout's end at
    // #37; laid on the drawn skin, 0.02 and none past)
    expect(worst, 'the seam off the drawn skin').toBeLessThan(0.05);
    expect(past, "the seam's front past the drawn snout's end").toBeLessThan(0.05);
  });
});
