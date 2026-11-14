import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';
import { fieldAt, projectToSurface, qRotateV } from '../../src/viewer/bodyField';
import { buildMeshData } from '../../src/viewer/meshData';
import { BULGE_DEPTH, bulgingEye, COMPOUND_DEPTH, EYE_PROUD, eyeClearings, eyeSeat, FEELER_KNOB, FEELER_SPOT, feelerTip, isFaceEye, isSwimmer, MAX_EYE_CLEAR, SEAT_DEPTH, SEAT_MAX_TILT, type EyeFlat } from '../../src/viewer/eyeSeat';
import { eyeVariant } from '../../src/viewer/partStyles';
import { surfacePrims } from '../../src/viewer/mouthLine';
import type { Phenotype } from '../../src/engine/grow';

const MORPHS = ['felid', 'canid', 'primate', 'ungulate', 'rodent', 'ursid', 'mustelid', 'crocodilian', 'anuran', 'lizard', 'bird', 'fish'];

function faceEyes(p: Phenotype) {
  return buildMeshData(p).features.filter((f) => f.type === 'eye' && isFaceEye(p, f));
}

/** how deep a seated eye's centre lies under its skin, along its own aim (× its radius): the TRUE distance —
 *  on a flattened section the field's value under-reads it (see eyeSeat), so a depth read from the field let
 *  a snake's eye lie a whole radius under its skin */
function depthAlong(prims: ReturnType<typeof surfacePrims>, c: readonly number[], aim: readonly number[], r: number): number {
  let lo = 0, hi = 3 * r;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (fieldAt(prims, c[0] + aim[0] * m, c[1] + aim[1] * m, c[2] + aim[2] * m) > 0) hi = m;
    else lo = m;
  }
  return lo / r;
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
          const seat = eyeSeat(p, f.idx, f.quat, r);
          const c = seat.centre!;
          const aim = qRotateV(seat.quat, [0, 0, 1]);
          const d = depthAlong(prims, c, aim, r);
          if (bulgingEye(p, aim)) {
            // a frog's bulges from its crown: half the ball proud, but still seated in the skin
            expect(d, `${id} #${seed} (bulging)`).toBeGreaterThan(0);
            expect(Math.abs(d - BULGE_DEPTH), `${id} #${seed} (bulging)`).toBeLessThan(0.12);
            continue;
          }
          expect(d, `${id} #${seed}`).toBeGreaterThan(0.15);
          expect(d, `${id} #${seed}`).toBeLessThan(0.8);
          n++;
          if (Math.abs(d - SEAT_DEPTH) < 0.08) near++;
        }
      }
    }
    expect(n).toBeGreaterThan(50);
    expect(near / n).toBeGreaterThan(0.9);
  });

  it('an eye grown above a flattened skull still sinks to its seat — it does not stand half out of the head', () => {
    // (its sink was stopped at one radius: on a broad flat crown — a lizard's, a shark's, a bear's — the
    // eye grown at the skull's round radius stood a radius proud and stopped half seated)
    for (const id of ['lizard', 'shark', 'ursid']) {
      for (let seed = 1; seed <= 4; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const prims = surfacePrims(p, 'hybrid');
        for (const f of faceEyes(p)) {
          const r = Math.max(f.radius, 0.06);
          const seat = eyeSeat(p, f.idx, f.quat, r);
          expect(depthAlong(prims, seat.centre!, qRotateV(seat.quat, [0, 0, 1]), r), `${id} #${seed}`).toBeGreaterThan(0.4);
        }
      }
    }
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

  it('a fish or a shark wears lidless eyes; anything that walks keeps its lids', () => {
    for (const id of ['fish', 'shark']) for (let seed = 1; seed <= 6; seed++) expect(isSwimmer(grow(genomeOfMorphotype(seed, id))), id).toBe(true);
    for (const id of ['felid', 'lizard', 'anuran', 'bird', 'crocodilian']) for (let seed = 1; seed <= 6; seed++) expect(isSwimmer(grow(genomeOfMorphotype(seed, id))), id).toBe(false);
  });

  it("a frog's eyes bulge from the top of its head", () => {
    let bulging = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'anuran'));
      for (const f of faceEyes(p)) if (bulgingEye(p, qRotateV(eyeSeat(p, f.idx, f.quat, Math.max(f.radius, 0.06)).quat, [0, 0, 1]))) bulging++;
    }
    expect(bulging).toBeGreaterThanOrEqual(10);
    // nothing furred or feathered bulges
    for (const id of ['felid', 'bird', 'primate']) {
      const p = grow(genomeOfMorphotype(1, id));
      for (const f of faceEyes(p)) expect(bulgingEye(p, qRotateV(eyeSeat(p, f.idx, f.quat, Math.max(f.radius, 0.06)).quat, [0, 0, 1])), id).toBe(false);
    }
  });

  it("an insect's compound eye is a low dome set in its head — not a marble stood on it", () => {
    // (unseated, the ball's centre rode a third of a radius OUT of the head: more than half of it stood
    // proud, a black marble bolted on)
    let n = 0;
    for (const id of ['insectoid', 'arthro-alien']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const prims = surfacePrims(p, 'hybrid');
        for (const f of buildMeshData(p).features) {
          if (f.type !== 'eye' || eyeVariant(f.style) !== 'compound') continue;
          const r = Math.max(f.radius, 0.06);
          const seat = eyeSeat(p, f.idx, f.quat, r);
          const d = depthAlong(prims, seat.centre!, qRotateV(seat.quat, [0, 0, 1]), r);
          expect(d, `${id} #${seed}`).toBeGreaterThan(0.3); // under the cuticle…
          expect(d, `${id} #${seed}`).toBeLessThan(0.6); // …with a dome of it still standing out
          expect(Math.abs(d - COMPOUND_DEPTH), `${id} #${seed}`).toBeLessThan(0.1);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(20);
  });

  it("an alien's glowing eye is a low dome set in its head too — not a goggle over the outline", () => {
    // (unseated, a crystal beast's glowing eye stood on its grown node, its centre a fifth of a radius out
    // of the skin: more than half the ball stood proud, and the far one crossed the head's outline)
    let n = 0;
    for (const id of ['crystalline', 'horror']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const prims = surfacePrims(p, 'hybrid');
        for (const f of buildMeshData(p).features) {
          if (f.type !== 'eye' || eyeVariant(f.style) !== 'glowing') continue;
          const e = p.edges.find(([, b]) => b === f.idx);
          if (!e || p.nodes[e[0]].kind !== 'spine') continue; // (on the face, not up a stalk)
          const r = Math.max(f.radius, 0.06);
          const seat = eyeSeat(p, f.idx, f.quat, r);
          const d = depthAlong(prims, seat.centre!, qRotateV(seat.quat, [0, 0, 1]), r);
          expect(d, `${id} #${seed}`).toBeGreaterThan(0.3);
          expect(d, `${id} #${seed}`).toBeLessThan(0.6);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(20);
  });

  it("a slug's eyes are the tips of its feelers: a knob in its own skin, the eye a small dark spot in its point", () => {
    // (a lidded vertebrate eyeball on each stalk, set in green lids, was a pair of visors)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const eyes = p.nodes.map((n, i) => [n, i] as const).filter(([n]) => n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBe(2);
      for (const [, i] of eyes) expect(feelerTip(p, i), `#${seed}`).toBe(true);
    }
    // the knob swells past the feeler it ends; the spot is small and stands at its point
    const p = grow(genomeOfMorphotype(23, 'slime'));
    const i = p.nodes.findIndex((n) => n.terminal === 'eye');
    const stalk = p.nodes[p.edges.find(([, b]) => b === i)![0]];
    const r = Math.max(p.nodes[i].radius, 0.06);
    expect(FEELER_KNOB * r).toBeGreaterThan(1.2 * stalk.radius);
    expect(FEELER_KNOB * r).toBeLessThan(2 * stalk.radius);
    expect(FEELER_SPOT[1]).toBeLessThan(0.5 * FEELER_KNOB);
    expect(FEELER_SPOT[0] + FEELER_SPOT[1]).toBeGreaterThan(FEELER_KNOB); // (it shows, proud of the knob)
    expect(FEELER_SPOT[0] - FEELER_SPOT[1]).toBeLessThan(FEELER_KNOB); // (…and is set in it)
    // a crab's eyes on stalks, an octopus's in its mantle, a frog's in its head are eyes of their own
    for (const id of ['crab', 'cephalopod', 'anuran']) {
      const q = grow(genomeOfMorphotype(23, id));
      q.nodes.forEach((n, j) => {
        if (n.terminal === 'eye') expect(feelerTip(q, j), id).toBe(false);
      });
    }
  });

  it('no seated face eye stands more than EYE_PROUD out of its skin: the far one stays inside the outline', () => {
    // (seated a third of the ball proud, every lidded eye was a dome 0.3r high and a glowing one 0.5r: on
    // the side of a round head the far eye crossed the head's outline — a goggle on a bird, a hawk, a mouse,
    // a crystal beast)
    const press = (fl: EyeFlat | null | undefined, x: number[]) => {
      if (!fl) return x;
      const k = ((x[0] - fl.at[0]) * fl.n[0] + (x[1] - fl.at[1]) * fl.n[1] + (x[2] - fl.at[2]) * fl.n[2]) * (fl.s - 1);
      return [x[0] + fl.n[0] * k, x[1] + fl.n[1] * k, x[2] + fl.n[2] * k];
    };
    const FIB: number[][] = [];
    for (let i = 0, g = Math.PI * (3 - Math.sqrt(5)); i < 300; i++) {
      const y = 1 - (2 * (i + 0.5)) / 300, rr = Math.sqrt(1 - y * y);
      FIB.push([Math.cos(g * i) * rr, y, Math.sin(g * i) * rr]);
    }
    let checked = 0;
    for (const id of ['bird', 'raptor', 'rodent', 'canid', 'felid', 'primate', 'ratite', 'chimera', 'crystalline', 'wyvern']) {
      for (const seed of [1, 2, 3, 4]) {
        const p = grow(genomeOfMorphotype(seed, id));
        const prims = surfacePrims(p, 'hybrid');
        for (const f of buildMeshData(p).features) {
          if (f.type !== 'eye') continue;
          const e = p.edges.find(([, b]) => b === f.idx);
          if (!e || p.nodes[e[0]].kind !== 'spine') continue;
          const v = eyeVariant(f.style);
          const r = Math.max(f.radius, 0.06);
          const aim0 = qRotateV(f.quat, [0, 0, 1]);
          if (v === 'compound' || (v !== 'glowing' && bulgingEye(p, aim0))) continue; // (they bulge by design)
          const seat = eyeSeat(p, f.idx, f.quat, r);
          const aim = qRotateV(seat.quat, [0, 0, 1]);
          const z = v === 'slit' ? -0.02 : v === 'glowing' ? 0.02 : -0.04;
          const c = seat.centre!;
          let top = -Infinity, outB = 0, outA = 0;
          for (const d of FIB) {
            const x = [0, 1, 2].map((k) => c[k] + (d[k] * 0.9 + aim[k] * z) * r);
            const y = press(seat.flat, x);
            const f1 = fieldAt(prims, y[0], y[1], y[2]) / r;
            top = Math.max(top, f1);
            if (fieldAt(prims, x[0], x[1], x[2]) > 0) outB++;
            if (f1 > 0) outA++;
          }
          expect(top, `${id} #${seed} eye ${f.idx} stands out`).toBeLessThan(EYE_PROUD + 0.03);
          // …its opening keeping its size: pressed, not buried
          if (outB > 0) expect(outA / outB, `${id} #${seed} eye ${f.idx} opening`).toBeGreaterThan(0.85);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(60);
  });

  it("a snake's eye shows: seated by its skin, not buried under a flattened skull", () => {
    // (seated by the field's value, which under-reads across a flat section's wide axis, a snake's eye sank a
    // whole radius: the skin closed over the ball and only the tip of its slit showed, a speck)
    const FIB: number[][] = [];
    for (let i = 0, g = Math.PI * (3 - Math.sqrt(5)); i < 300; i++) {
      const y = 1 - (2 * (i + 0.5)) / 300, rr = Math.sqrt(1 - y * y);
      FIB.push([Math.cos(g * i) * rr, y, Math.sin(g * i) * rr]);
    }
    for (const seed of [1, 2, 3, 4, 5, 6, 29]) {
      const p = grow(genomeOfMorphotype(seed, 'serpent'));
      const prims = surfacePrims(p, 'hybrid');
      for (const f of faceEyes(p)) {
        const r = Math.max(f.radius, 0.06);
        const seat = eyeSeat(p, f.idx, f.quat, r);
        const aim = qRotateV(seat.quat, [0, 0, 1]);
        expect(Math.abs(depthAlong(prims, seat.centre!, aim, r) - SEAT_DEPTH), `#${seed} seated`).toBeLessThan(0.08);
        let out = 0;
        for (const d of FIB) {
          const x = [0, 1, 2].map((k) => seat.centre![k] + d[k] * 0.9 * r);
          const fl = seat.flat;
          const y = fl ? x.map((v, k) => v + fl.n[k] * ((x[0] - fl.at[0]) * fl.n[0] + (x[1] - fl.at[1]) * fl.n[1] + (x[2] - fl.at[2]) * fl.n[2]) * (fl.s - 1)) : x;
          if (fieldAt(prims, y[0], y[1], y[2]) > 0) out++;
        }
        expect(out / FIB.length, `#${seed} the eye shows`).toBeGreaterThan(0.2);
      }
    }
  });
});
