import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS, randomGenome } from '../../src/engine/random';
import { defaultGenome } from '../../src/engine/genome';
import { buildFieldPrims, fieldAt, fieldAtCarved, qRotateV } from '../../src/viewer/bodyField';
import { buildMouthLine, mouthCarves, mouthSpec, mouthSpecs, type MouthSpec } from '../../src/viewer/mouthLine';

// The invariant the whole mouth overhaul exists for: every lip sample must sit ON the true skin.
// Ray-trace tolerance is 1e-4; the Newton fallback can be looser on soft-blended saddles.
const ON_SURFACE = 5e-3;

function firstMouth(p: Phenotype): MouthSpec | undefined {
  return mouthSpecs(p)[0];
}

/** the default creature wearing a lamprey funnel: a carving mouth (jawed mouths rest shut, uncarved) */
function funnelGenome() {
  const g = defaultGenome();
  let seg: typeof g.body | undefined = g.body;
  while (seg) {
    for (const a of seg.appendages) if (a.terminal === 'mouth') a.style = 0.68;
    seg = seg.child;
  }
  return g;
}

describe('mouth line (mouth overhaul)', () => {
  it('every lip sample sits on the true body surface', () => {
    let checked = 0;
    for (let s = 0; s < 24; s++) {
      const p = grow(randomGenome(s));
      const spec = firstMouth(p);
      if (!spec) continue;
      const line = buildMouthLine(p, spec);
      const f = buildFieldPrims(p, 'body');
      for (const sm of [...line.upper, ...line.lower]) {
        expect(Math.abs(fieldAt(f, sm.p[0], sm.p[1], sm.p[2]))).toBeLessThan(ON_SURFACE);
        expect(Number.isFinite(sm.p[0] + sm.p[1] + sm.p[2])).toBe(true);
      }
      expect(line.width).toBeGreaterThan(0.01);
      checked++;
    }
    expect(checked).toBeGreaterThan(10); // the bauplan guarantees faces — most creatures have mouths
  });

  it('the corners are welded and the curves are bilaterally symmetric on a midline mouth', () => {
    const p = grow(defaultGenome());
    const spec = firstMouth(p);
    expect(spec).toBeDefined();
    if (!spec) return;
    expect(Math.abs(spec.node.pos[0])).toBeLessThan(1e-6); // the face mouth sits on X=0
    const line = buildMouthLine(p, spec);
    expect(line.upper[0].p).toEqual(line.lower[0].p);
    expect(line.upper.at(-1)!.p).toEqual(line.lower.at(-1)!.p);
    for (const row of [line.upper, line.lower]) {
      const n = row.length;
      for (let i = 0; i < n; i++) {
        const a = row[i];
        const b = row[n - 1 - i];
        expect(a.p[0]).toBeCloseTo(-b.p[0], 4); // mirrored in X
        expect(a.p[1]).toBeCloseTo(b.p[1], 4);
        expect(a.p[2]).toBeCloseTo(b.p[2], 4);
      }
    }
  });

  it('is deterministic (same phenotype → identical line, spec, and carves)', () => {
    const p = grow(randomGenome(7));
    const s1 = firstMouth(p);
    const s2 = firstMouth(p);
    expect(s1).toBeDefined(); // the bauplan guarantees this face — a missing mouth is a regression
    expect(s1).toEqual(s2);
    if (!s1 || !s2) return;
    expect(buildMouthLine(p, s1)).toEqual(buildMouthLine(p, s2));
    expect(mouthCarves(p)).toEqual(mouthCarves(p));
  });

  it('the gape separates the lip lines in the middle', () => {
    const p = grow(defaultGenome());
    const spec = firstMouth(p);
    expect(spec).toBeDefined();
    if (!spec) return;
    const line = buildMouthLine(p, spec);
    const mid = (line.upper.length - 1) / 2;
    const u = line.upper[mid].p;
    const l = line.lower[mid].p;
    const sep = Math.hypot(u[0] - l[0], u[1] - l[1], u[2] - l[2]);
    expect(sep).toBeGreaterThan(spec.r * 0.1); // visibly open
  });

  it("a flat head's lips stay on its face — never slid under the chin", () => {
    // (on a frog's flat head the gape slid the lower lip, and the drooping corners, round under the
    // jaw: the mouth hung below the head as a loose hooked loop)
    // (a long snout's mouth runs back along its jaw line, a muzzle's mandible drops by design: both
    // are left as traced; and a slug's mouth is under the front of its body, where it belongs)
    for (const kind of ['anuran', 'dragon']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, kind));
        const spec = firstMouth(p);
        if (!spec || spec.muzzled || (spec.anchor.scale?.[2] ?? 1) > 1.3 || !['herbivore', 'maw', 'fanged'].includes(spec.variant)) continue;
        const line = buildMouthLine(p, spec, [], 17, 'hybrid');
        const q = spec.anchor.quat;
        // the head's own forward and down axes (rotate +Z and −Y by its orientation)
        const rot = (v: [number, number, number]) => {
          const [x, y, z, w] = q;
          const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
          return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
        };
        const fwd = rot([0, 0, 1]);
        const down = rot([0, -1, 0]);
        const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const mid = line.lower.length >> 1;
        expect(dot(line.lower[mid].n, fwd), `${kind} #${seed} chin`).toBeGreaterThan(0.44);
        for (const sm of line.lower) expect(dot(sm.n, down), `${kind} #${seed} under`).toBeLessThan(0.81);
      }
    }
  });

  it("a closed mouth doesn't grin: its corners stand no higher on the head than its middle, near enough", () => {
    // (swept across the face about the mouth's own forward-leaning up, a lip line was a circle on a
    // tilted plane: its corners rose above its middle by up to two-thirds of the mouth's size — a
    // shark's, a theropod's, a deer's cartoon grin)
    let seen = 0;
    for (const id of MORPHOTYPE_IDS) {
      for (let seed = 1; seed <= 4; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        if (p.genomeRef.symmetry === 'radial') continue;
        const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
        const spec = idx >= 0 ? mouthSpec(p, idx) : null;
        if (!spec || !['fanged', 'maw', 'herbivore', 'underbite'].includes(spec.variant)) continue;
        seen++;
        const line = buildMouthLine(p, spec, [], 17, 'kit');
        const up = qRotateV(spec.anchor.quat, [0, 1, 0]);
        const h = (q: readonly number[]) => q[0] * up[0] + q[1] * up[1] + q[2] * up[2];
        const u = line.upper;
        const lift = Math.max(h(u[0].p), h(u[u.length - 1].p)) - h(u[u.length >> 1].p);
        expect(lift / spec.r, `${id} #${seed}`).toBeLessThan(0.2);
        // …nor, shut as a seam (not a muzzle), a frown: its corners no lower than its middle, near enough
        // (its lips split a wide gape about the line, and the upper one arched up in the middle — from
        // in front every frog, fish and slug was sulking)
        if (!spec.muzzled) expect(lift / spec.r, `${id} #${seed} frown`).toBeGreaterThan(-0.1);
      }
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('a mandibled mouth is a small one: no wider than its jaws can close across', () => {
    // (a mouth line spans an angle about the body it sits on. On a head that is a mouth's width; on
    // a crab — its mouth on its trunk — the lips ran the whole breadth of the animal, and an ant's
    // ran from one side of its head to the other)
    let seen = 0;
    for (const id of ['crab', 'insectoid', 'arthro-alien']) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const spec = firstMouth(p);
        if (!spec || spec.variant !== 'mandibles') continue;
        seen++;
        const line = buildMouthLine(p, spec, [], 17, 'hybrid');
        expect(line.width / spec.r, `${id} #${seed}`).toBeLessThan(2.1);
        if (id === 'crab') {
          const body = p.nodes.find((n) => n.kind === 'spine')!;
          expect(line.width / (2 * body.radius * (body.scale?.[0] ?? 1)), `crab #${seed} a small mouth under the front`).toBeLessThan(0.4);
        }
        // (still a mouth: its corners apart, its lips on the skin)
        expect(line.width / spec.r, `${id} #${seed}`).toBeGreaterThan(0.8);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('mouth carves remove matter exactly where the maw is', () => {
    const p = grow(funnelGenome());
    const carves = mouthCarves(p);
    expect(carves.length).toBeGreaterThan(0);
    const f = buildFieldPrims(p, 'body');
    for (const c of carves) {
      expect(c.radii.every((r) => r > 0)).toBe(true);
      expect(c.blend).toBeGreaterThan(0);
      // at the cavity center the carved field is emptier (larger d) than the raw body field
      const raw = fieldAt(f, c.pos[0], c.pos[1], c.pos[2]);
      const carved = fieldAtCarved(f, carves, c.pos[0], c.pos[1], c.pos[2]);
      expect(carved).toBeGreaterThan(raw);
      // far from the mouth the field is untouched
      const far = fieldAtCarved(f, carves, c.pos[0], c.pos[1] + 50, c.pos[2]);
      expect(far).toBeCloseTo(fieldAt(f, c.pos[0], c.pos[1] + 50, c.pos[2]), 6);
    }
  });

  it('the carved smooth skin marks wet mouth-flesh vertices (aFlesh) at the maw', async () => {
    const { buildSmoothGeometry } = await import('../../src/viewer/smoothSkin');
    const p = grow(funnelGenome());
    const carves = mouthCarves(p);
    expect(carves.length).toBeGreaterThan(0);
    const geo = buildSmoothGeometry(p, true, carves);
    const flesh = geo.getAttribute('aFlesh');
    expect(flesh).toBeDefined();
    let marked = 0;
    for (let i = 0; i < flesh.count; i++) if ((flesh.array as Float32Array)[i] > 0.3) marked++;
    expect(marked).toBeGreaterThan(4); // the cavity wall exists on the meshed surface
    // and the uncarved build stays all-zero
    const plain = buildSmoothGeometry(p, true).getAttribute('aFlesh');
    let any = false;
    for (let i = 0; i < plain.count; i++) if ((plain.array as Float32Array)[i] !== 0) any = true;
    expect(any).toBe(false);
  });

  it('lip samples track the SMOOTH surface when traced for it (the blended skin, not the kit)', () => {
    for (let s = 0; s < 12; s++) {
      const p = grow(randomGenome(s));
      const spec = mouthSpecs(p)[0];
      if (!spec) continue;
      const line = buildMouthLine(p, spec, [], 17, 'smooth');
      // the exact field smoothSkin polygonizes in smooth mode: body prims, k = 0.5·meanR
      const f = buildFieldPrims(p, 'body');
      f.k = 0.5 * f.meanR;
      for (const sm of [...line.upper, ...line.lower]) {
        expect(Math.abs(fieldAt(f, sm.p[0], sm.p[1], sm.p[2]))).toBeLessThan(ON_SURFACE);
      }
    }
  });

  it('carves spare the eyes — every eye keeps solid flesh behind its bulb', () => {
    let carvedBodies = 0;
    for (let s = 0; s < 160; s++) {
      const p = grow(randomGenome(s));
      const carves = mouthCarves(p);
      if (carves.length === 0) continue;
      carvedBodies++;
      const f = buildFieldPrims(p, 'body');
      let meanR = 0;
      for (let i = 0; i < f.nc; i++) meanR += f.pr[i];
      f.k = 0.5 * (meanR / Math.max(f.nc, 1)); // the smooth field the carve actually cuts
      for (const n of p.nodes) {
        if (n.terminal !== 'eye') continue;
        // the backing point the eye is seated over, just inside the skin
        const q = n.quat;
        const az = [
          2 * (q[0] * q[2] + q[3] * q[1]),
          2 * (q[1] * q[2] - q[3] * q[0]),
          1 - 2 * (q[0] * q[0] + q[1] * q[1]),
        ];
        const back = 1.5 * n.radius;
        const pt = [n.pos[0] - az[0] * back, n.pos[1] - az[1] * back, n.pos[2] - az[2] * back];
        const solid = fieldAt(f, pt[0], pt[1], pt[2]);
        const carved = fieldAtCarved(f, carves, pt[0], pt[1], pt[2]);
        // the carve may graze but must not hollow the eye's backing into open cavity
        if (solid < -0.02) expect(carved).toBeLessThan(0.02);
      }
    }
    expect(carvedBodies).toBeGreaterThan(10);
  });

  it('a mammal (furred, jawed) mouth is muzzled: uncarved, a nose on the skin, opening downward only', () => {
    let checked = 0;
    for (const id of ['felid', 'canid', 'ursid', 'ungulate', 'rodent']) {
      for (let s = 0; s < 4; s++) {
        const p = grow(genomeOfMorphotype(s * 13 + 2, id));
        const spec = mouthSpecs(p)[0];
        if (!spec || !['herbivore', 'maw', 'fanged'].includes(spec.variant)) continue;
        expect(spec.muzzled).toBe(true);
        expect(mouthCarves(p)).toHaveLength(0);
        const line = buildMouthLine(p, spec);
        const f = buildFieldPrims(p, 'body');
        expect(line.nose).not.toBeNull();
        expect(Math.abs(fieldAt(f, ...line.nose!.p))).toBeLessThan(ON_SURFACE);
        // the nose sits above the upper lip; the lower lip hangs below it (the mandible drops)
        const mid = (line.upper.length - 1) / 2;
        const up = (v: readonly number[]) => v[0] * spec.up[0] + v[1] * spec.up[1] + v[2] * spec.up[2];
        expect(up(line.nose!.p)).toBeGreaterThan(up(line.upper[mid].p));
        expect(up(line.upper[mid].p)).toBeGreaterThan(up(line.lower[mid].p));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('every wedge/funnel mouth across random genomes yields exactly one finite carve', () => {
    for (let s = 0; s < 40; s++) {
      const p = grow(randomGenome(s));
      const carvers = mouthSpecs(p).filter((m) => ['baleen', 'sucker', 'lamprey'].includes(m.variant));
      const carves = mouthCarves(p);
      expect(carves.length).toBe(carvers.length);
      for (const c of carves) {
        expect(c.pos.every(Number.isFinite)).toBe(true);
        expect(c.radii.every((r) => Number.isFinite(r) && r > 0)).toBe(true);
      }
    }
  });
});
