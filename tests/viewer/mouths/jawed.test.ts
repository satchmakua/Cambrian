import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome, genomeOfMorphotype } from '../../../src/engine/random';
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

  it('tooth roots are rooted IN the mouth line — floating teeth stay impossible', () => {
    // The muzzle projects off the skull by design, so the anchor is the projected lip curve, not
    // the raw body field: every root must sit within its own sink depth of that curve.
    const p = grow(defaultGenome());
    const idx = mouthIdx(p);
    for (const v of VARIANTS) {
      const b = buildJawed(p, idx, [], false, v)!;
      const profs = JAWED_PARAMS[v];
      for (const [teeth, prof, row] of [
        [b.upperTeeth, profs.upper, b.upper],
        [b.lowerTeeth, profs.lower, b.lower],
      ] as const) {
        if (!prof) continue;
        for (const t of teeth) {
          let best = Infinity;
          for (const s of row) {
            best = Math.min(best, Math.hypot(t.pos[0] - s.p[0], t.pos[1] - s.p[1], t.pos[2] - s.p[2]));
          }
          // within a sink depth of the curve, plus the polyline's own chord sag between samples
          expect(best).toBeLessThanOrEqual(t.len * prof.sink + b.r * 0.25);
        }
      }
    }
  });

  it('the projected muzzle actually stands off the skull (there IS a snout)', () => {
    const p = grow(defaultGenome());
    const idx = mouthIdx(p);
    const node = p.nodes[idx];
    const f = buildFieldPrims(p, 'body');
    const b = buildJawed(p, idx, [], false, 'fanged')!;
    const mid = b.upper[(b.upper.length / 2) | 0];
    // the front centre of the lip line sits OUTSIDE the raw body surface (positive field)
    const d = fieldAt(f, mid.p[0] + node.pos[0], mid.p[1] + node.pos[1], mid.p[2] + node.pos[2]);
    expect(d).toBeGreaterThan(0.02);
    // …while the corners stay welded to it
    const corner = b.upper[0];
    const dc = Math.abs(fieldAt(f, corner.p[0] + node.pos[0], corner.p[1] + node.pos[1], corner.p[2] + node.pos[2]));
    expect(dc).toBeLessThan(b.r * 0.2);
  });

  it('is bilaterally symmetric on the midline mouth — teeth mirror', () => {
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


  it('a reptile or a frog shuts its mouth as a seam: no projecting grin, a croc shows only small teeth', () => {
    for (const [kind, variant] of [['lizard', 'maw'], ['crocodilian', 'fanged'], ['anuran', 'maw']] as const) {
      const p = grow(genomeOfMorphotype(5, kind));
      const idx = mouthIdx(p);
      const sealed = buildJawed(p, idx, [], false, variant)!;
      expect(sealed.sealed).toBe(true);
      expect(sealed.muzzled).toBe(false);
      if (variant === 'maw') {
        expect(sealed.upperTeeth.length + sealed.lowerTeeth.length).toBe(0);
      } else {
        expect(sealed.upperTeeth.length).toBeLessThanOrEqual(9);
        const grin = JAWED_PARAMS.fanged.upper.len(0.55);
        for (const t of sealed.upperTeeth) expect(t.len).toBeLessThan(grin * sealed.r);
      }
    }
    // a shark keeps its grin
    const shark = grow(genomeOfMorphotype(5, 'shark'));
    expect(buildJawed(shark, mouthIdx(shark), [], false, 'fanged')!.sealed).toBe(false);
  });
});
