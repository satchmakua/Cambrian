import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';
import { fieldAt, projectToSurface, qRotateV } from '../../src/viewer/bodyField';
import { buildMeshData } from '../../src/viewer/meshData';
import { eyeClearings, eyeSeat, isFaceEye, MAX_EYE_CLEAR, SEAT_DEPTH, SEAT_MAX_TILT } from '../../src/viewer/eyeSeat';
import { surfacePrims } from '../../src/viewer/mouthLine';
import type { Phenotype } from '../../src/engine/grow';

const MORPHS = ['felid', 'canid', 'primate', 'ungulate', 'rodent', 'ursid', 'mustelid', 'crocodilian', 'anuran', 'lizard', 'bird', 'fish'];

function faceEyes(p: Phenotype) {
  return buildMeshData(p).features.filter((f) => f.type === 'eye' && isFaceEye(p, f));
}

describe('eye seats', () => {
  it('every lidded face eye sits a third out of the skin — never bulging, never buried', () => {
    // (a fixed 0.36r sink left the ball's centre anywhere from 1.1r under the skin to right on it)
    let n = 0;
    let near = 0;
    for (const id of MORPHS) {
      for (let seed = 1; seed <= 4; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const prims = surfacePrims(p, 'hybrid');
        for (const f of faceEyes(p)) {
          const r = Math.max(f.radius, 0.06);
          const c = eyeSeat(p, f.idx, f.quat, r).centre!;
          const d = fieldAt(prims, c[0], c[1], c[2]) / r;
          expect(d, `${id} #${seed}`).toBeLessThan(-0.15);
          expect(d, `${id} #${seed}`).toBeGreaterThan(-0.8);
          n++;
          if (Math.abs(d + SEAT_DEPTH) < 0.1) near++;
        }
      }
    }
    expect(n).toBeGreaterThan(60);
    expect(near / n).toBeGreaterThan(0.9);
  });

  it('a seated eye looks out of the face, within the tilt allowance of its normal', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = grow(randomGenome(seed));
      const prims = surfacePrims(p, 'hybrid');
      for (const f of faceEyes(p)) {
        const r = Math.max(f.radius, 0.06);
        const s = eyeSeat(p, f.idx, f.quat, r);
        const aim = qRotateV(s.quat, [0, 0, 1]);
        const nrm = projectToSurface(prims, [], [...p.nodes[f.idx].pos] as [number, number, number]).n;
        const cos = aim[0] * nrm[0] + aim[1] * nrm[1] + aim[2] * nrm[2];
        expect(Math.acos(Math.min(1, cos)), `#${seed}`).toBeLessThan(SEAT_MAX_TILT + 0.02);
        expect(Number.isFinite(s.sink)).toBe(true);
      }
    }
  });

  it('the fur shells get one finite clearing per eye', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = grow(randomGenome(seed));
      const eyes = buildMeshData(p).features.filter((f) => f.type === 'eye').length;
      const c = eyeClearings(p, buildMeshData(p).features);
      expect(c.length).toBe(Math.min(eyes, MAX_EYE_CLEAR) * 4);
      for (const v of c) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
