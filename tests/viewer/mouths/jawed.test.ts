import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome, genomeOfMorphotype } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { buildJawed, jawDrawn, seamShown, teethDrawn, JAW_SHOWN, TEETH_SHOWN, JAWED_PARAMS, type JawedVariant } from '../../../src/viewer/mouths/jawed';
import { mouthCarves, mouthSpec, surfacePrims } from '../../../src/viewer/mouthLine';

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


  it('a shut mouth is one seam: the lower jaw is not drawn until it opens, nor a mammal\'s teeth', () => {
    // (the mouth is built agape and its lower jaw swung shut; but the lower lip is a longer curve than
    // the upper, and swung up it crossed it in an X at the corners, doubled it into a bar, or stood out
    // past the snout like whiskers — and a mammal's canine tips hung off its shut lip as stray pegs)
    expect(jawDrawn(0)).toBe(false); // at rest: Breed, the Studio, a creature in the World with its mouth shut
    expect(jawDrawn(0.05)).toBe(false);
    expect(jawDrawn(0.3)).toBe(true); // chewing
    expect(jawDrawn(1)).toBe(true); // a bite, a call
    expect(teethDrawn(true, 0)).toBe(false);
    expect(teethDrawn(true, 0.3)).toBe(true);
    expect(teethDrawn(false, 0)).toBe(true); // a crocodile's, a shark's: along the seam
    expect(JAW_SHOWN).toBeGreaterThan(0);
    expect(TEETH_SHOWN).toBeGreaterThanOrEqual(JAW_SHOWN);
  });

  it('a seam mouth lies in the snout: neither its lip nor the fold over its teeth stands off the head', () => {
    // (the lip rim was pushed forward a fifth as far as a projecting muzzle's and the fold over the
    // teeth as far as a muzzle's own: a shelf a quarter of the mouth's radius clear of the head, teeth
    // hanging under it — a brace on a shark's chin, a plank on a theropod's nose)
    let seen = 0;
    for (const id of ['shark', 'crocodilian', 'biped', 'lizard', 'fish', 'anuran', 'serpent', 'dragon']) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const idx = mouthIdx(p);
        const variant = mouthSpec(p, idx)!.variant;
        if (!(VARIANTS as string[]).includes(variant)) continue;
        const b = buildJawed(p, idx, [], false, variant as JawedVariant, 'hybrid')!;
        if (!b.sealed) continue;
        seen++;
        const f = surfacePrims(p, 'hybrid'); // (the skin as it is drawn: the blended field)
        const o = p.nodes[idx].pos;
        const off = (g: { getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } }) => {
          const a = g.getAttribute('position');
          let worst = -Infinity;
          for (let i = 0; i < a.count; i++) worst = Math.max(worst, fieldAt(f, a.getX(i) + o[0], a.getY(i) + o[1], a.getZ(i) + o[2]));
          return worst / b.r;
        };
        expect(off(b.upperLip), `${id} #${seed} lip`).toBeLessThan(0.07);
        expect(off(b.muzzle), `${id} #${seed} rim`).toBeLessThan(0.11);
        if (b.upperTeeth.length > 0) expect(off(b.upperFold), `${id} #${seed} fold`).toBeLessThan(0.14);
      }
    }
    expect(seen).toBeGreaterThan(40);
  });

  it('a reptile, a frog or a fish shuts its mouth as a seam: no projecting grin, a croc or a shark shows only small teeth', () => {
    // (a fish's and a shark's projecting grin of cream teeth over a sausage lip read as a Muppet)
    for (const [kind, variant] of [['lizard', 'maw'], ['crocodilian', 'fanged'], ['anuran', 'maw'], ['fish', 'maw'], ['shark', 'fanged']] as const) {
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
  });

  it("a slug's shut mouth draws no seam across the front of its head; a lizard's and a frog's do", () => {
    // (a crease across the front of its dome was a line painted on a pickle)
    for (let seed = 1; seed <= 6; seed++) {
      for (const [id, shown] of [['slime', false], ['lizard', true], ['anuran', true]] as const) {
        const p = grow(genomeOfMorphotype(seed, id));
        const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
        const spec = mouthSpec(p, idx);
        if (!spec || !['herbivore', 'maw', 'fanged', 'underbite'].includes(spec.variant)) continue;
        const b = buildJawed(p, idx, [], false, spec.variant as JawedVariant)!;
        expect(b.sealed, `${id} #${seed}`).toBe(true);
        expect(seamShown(p, b.sealed), `${id} #${seed}`).toBe(shown);
      }
    }
    // a furred muzzle's lip line stays
    const cat = grow(genomeOfMorphotype(2, 'felid'));
    expect(seamShown(cat, false)).toBe(true);
  });
});
