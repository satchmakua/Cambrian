import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { buildJawed, JAWED_PARAMS, type JawedVariant } from '../../../src/viewer/mouths/jawed';
import { mouthCarves } from '../../../src/viewer/mouthLine';

const VARIANTS: JawedVariant[] = ['herbivore', 'maw', 'fanged', 'underbite'];

function mouthIdx(p: Phenotype): number {
  return p.nodes.findIndex((n) => n.terminal === 'mouth');
}

function scanPositions(geo: { getAttribute(name: string): { array: ArrayLike<number> } }): boolean {
  const a = geo.getAttribute('position').array;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}

describe('jawed mouth build (mouth overhaul)', () => {
  it('returns null for a non-mouth node and builds for the guaranteed face', () => {
    const p = grow(defaultGenome());
    expect(buildJawed(p, 0, [], false, 'maw')).toBeNull(); // node 0 is the root spine
    const idx = mouthIdx(p);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(buildJawed(p, idx, [], false, 'maw')).not.toBeNull();
  });

  it('is deterministic — identical builds down to every vertex and tooth', () => {
    const p = grow(randomGenome(9));
    const idx = mouthIdx(p);
    expect(idx).toBeGreaterThanOrEqual(0);
    const a = buildJawed(p, idx, [], false, 'fanged')!;
    const b = buildJawed(p, idx, [], false, 'fanged')!;
    expect(Array.from(a.upperLip.getAttribute('position').array as Float32Array)).toEqual(
      Array.from(b.upperLip.getAttribute('position').array as Float32Array),
    );
    expect(a.upperTeeth).toEqual(b.upperTeeth);
    expect(a.lowerTeeth).toEqual(b.lowerTeeth);
    expect(a.jaw).toEqual(b.jaw);
  });

  it('every variant builds finite geometry across random genomes, both recessed flags', () => {
    for (let s = 0; s < 10; s++) {
      const p = grow(randomGenome(s));
      const idx = mouthIdx(p);
      if (idx < 0) continue;
      for (const v of VARIANTS) {
        for (const recessed of [false, true]) {
          const b = buildJawed(p, idx, recessed ? mouthCarves(p) : [], recessed, v)!;
          expect(scanPositions(b.upperLip)).toBe(true);
          expect(scanPositions(b.lowerLip)).toBe(true);
          expect(scanPositions(b.interior)).toBe(true);
          for (const t of [...b.upperTeeth, ...b.lowerTeeth]) {
            expect(t.pos.every(Number.isFinite)).toBe(true);
            expect(t.len).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('tooth roots stay within sink-depth of the true skin (node-relative build)', () => {
    const p = grow(defaultGenome());
    const idx = mouthIdx(p);
    const node = p.nodes[idx];
    const f = buildFieldPrims(p, 'body');
    for (const v of VARIANTS) {
      const b = buildJawed(p, idx, [], false, v)!;
      const profs = JAWED_PARAMS[v];
      for (const [teeth, prof] of [
        [b.upperTeeth, profs.upper],
        [b.lowerTeeth, profs.lower],
      ] as const) {
        if (!prof) continue;
        for (const t of teeth) {
          const d = Math.abs(
            fieldAt(f, t.pos[0] + node.pos[0], t.pos[1] + node.pos[1], t.pos[2] + node.pos[2]),
          );
          expect(d).toBeLessThanOrEqual(t.len * prof.sink + 6e-3);
        }
      }
    }
  });

  it('is bilaterally symmetric on the midline mouth — teeth mirror, hinge lies on ±X', () => {
    const p = grow(defaultGenome());
    const b = buildJawed(p, mouthIdx(p), [], false, 'maw')!;
    const n = b.upperTeeth.length;
    for (let i = 0; i < n; i++) {
      const a = b.upperTeeth[i];
      const m = b.upperTeeth[n - 1 - i];
      expect(a.pos[0]).toBeCloseTo(-m.pos[0], 4);
      expect(a.pos[1]).toBeCloseTo(m.pos[1], 4);
      expect(a.pos[2]).toBeCloseTo(m.pos[2], 4);
      expect(a.len).toBeCloseTo(m.len, 6);
    }
    // the mandible hinge: pivot on the midline plane, axis along ±X
    expect(Math.abs(b.jaw.pivot[0])).toBeLessThan(1e-3);
    expect(Math.abs(b.jaw.axis[0])).toBeGreaterThan(0.99);
  });

  it('variants differ where their anatomy differs (underbite tusks outsize maw teeth)', () => {
    const p = grow(defaultGenome());
    const idx = mouthIdx(p);
    const maw = buildJawed(p, idx, [], false, 'maw')!;
    const under = buildJawed(p, idx, [], false, 'underbite')!;
    const maxLen = (ts: { len: number }[]) => Math.max(...ts.map((t) => t.len));
    expect(maxLen(under.lowerTeeth)).toBeGreaterThan(maxLen(maw.lowerTeeth));
    expect(buildJawed(p, idx, [], false, 'herbivore')!.lowerTeeth.length).toBe(0);
  });

  it('the jaw oscillation parameters stay in their sane idle band', () => {
    for (let s = 0; s < 8; s++) {
      const p = grow(randomGenome(s));
      const idx = mouthIdx(p);
      if (idx < 0) continue;
      for (const v of VARIANTS) {
        const jaw = buildJawed(p, idx, [], false, v)!.jaw;
        expect(jaw.amp).toBeGreaterThan(0);
        expect(jaw.amp).toBeLessThanOrEqual(0.12); // subtle idle, never a flapping cartoon jaw
        expect(jaw.omega).toBeGreaterThan(0);
        expect(Math.hypot(jaw.axis[0], jaw.axis[1], jaw.axis[2])).toBeCloseTo(1, 6);
      }
    }
  });
});
