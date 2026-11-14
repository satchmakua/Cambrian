import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import { randomGenome, genomeOfMorphotype } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt, qRotateV, rayToSurface } from '../../../src/viewer/bodyField';
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
        // (a crocodile's row runs back along its jaw, more of them and as small: see the seam's own tests)
        if (kind === 'shark') expect(sealed.upperTeeth.length).toBeLessThanOrEqual(9);
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

  it("a reptile's shut mouth runs along its jaw, a third of the way up its head's side, back past its eye", () => {
    // (traced from its node, grown under the snout's tip, and swept round the tip a mouth's width either
    // way, the seam lay along the underside of the snout: from the side a crocodile had no mouth at all)
    let checked = 0;
    for (const id of ['crocodilian', 'lizard', 'wyvern', 'dragon', 'biped', 'serpent']) {
      for (let seed = 1; seed <= 4; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const idx = mouthIdx(p);
        const spec = mouthSpec(p, idx);
        if (!spec || !['herbivore', 'maw', 'fanged'].includes(spec.variant)) continue;
        const b = buildJawed(p, idx, [], false, spec.variant as JawedVariant)!;
        const o = spec.node.pos;
        const f = surfacePrims(p, 'kit');
        const up = qRotateV(spec.anchor.quat, [0, 1, 0]);
        const fwd = qRotateV(spec.anchor.quat, [0, 0, 1]);
        const back = (q: readonly number[]) => -((q[0] - spec.anchor.pos[0]) * fwd[0] + (q[1] - spec.anchor.pos[1]) * fwd[1] + (q[2] - spec.anchor.pos[2]) * fwd[2]);
        const world = b.upper.map((s) => [s.p[0] + o[0], s.p[1] + o[1], s.p[2] + o[2]]);
        // back past the eye
        const eye = Math.max(...p.nodes.filter((n) => n.terminal === 'eye').map((n) => back(n.pos)));
        const hinge = Math.max(back(world[0]), back(world[world.length - 1]));
        expect(hinge, `${id} #${seed} hinge back past the eye`).toBeGreaterThan(eye);
        // up the side of the head, not under it: how high each sample is in the head's depth there
        // (measured from the head's axis at each sample's station: its depth there, top to underside)
        let side = 0, measured = 0;
        const a = spec.anchor.pos;
        for (const q of world) {
          const along = (q[0] - a[0]) * fwd[0] + (q[1] - a[1]) * fwd[1] + (q[2] - a[2]) * fwd[2];
          const c = [a[0] + fwd[0] * along, a[1] + fwd[1] * along, a[2] + fwd[2] * along];
          if (fieldAt(f, c[0], c[1], c[2]) > 0) continue; // (past the tip)
          const top = rayToSurface(f, [], c as [number, number, number], up);
          const bottom = rayToSurface(f, [], c as [number, number, number], [-up[0], -up[1], -up[2]]);
          if (!top || !bottom) continue;
          const h = (v: readonly number[]) => v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
          const frac = (h(q) - h(bottom.p)) / Math.max(h(top.p) - h(bottom.p), 1e-6);
          measured++;
          if (frac > 0.15 && frac < 0.6) side++;
        }
        expect(side / Math.max(measured, 1), `${id} #${seed} on the side of the head`).toBeGreaterThan(0.7);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(16);
  });

  it("a shut reptile's teeth hang outside its closed jaw; a snake shows none", () => {
    // (raked in toward the throat like an open mouth's, every crown ran from the seam into the shut lower
    // jaw, under the skin: a crocodile, a dragon, a theropod had no teeth)
    for (const [id, shown] of [['crocodilian', true], ['dragon', true], ['wyvern', true], ['serpent', false]] as const) {
      for (let seed = 1; seed <= 4; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const idx = mouthIdx(p);
        const spec = mouthSpec(p, idx);
        if (!spec || spec.variant !== 'fanged') continue;
        const b = buildJawed(p, idx, [], false, 'fanged')!;
        const f = surfacePrims(p, 'kit');
        const o = spec.node.pos;
        let out = 0;
        for (const t of b.upperTeeth) {
          const Y = qRotateV(t.quat, [0, 1, 0]);
          const tip = [t.pos[0] + o[0] + Y[0] * t.len, t.pos[1] + o[1] + Y[1] * t.len, t.pos[2] + o[2] + Y[2] * t.len];
          if (fieldAt(f, tip[0], tip[1], tip[2]) > 0) out++;
        }
        const share = out / Math.max(b.upperTeeth.length, 1);
        if (shown) expect(share, `${id} #${seed}`).toBeGreaterThan(0.75);
        else expect(out, `${id} #${seed}`).toBe(0);
      }
    }
  });

  it("a theropod's shut jaw shows a row of blades, none hanging below its chin", () => {
    // (a crocodile's small pegs, sunk 0.42 of their length, stood a fiftieth of a unit off a theropod's
    // skin — no teeth in its face — and an underbite's upper row was none)
    for (let seed = 1; seed <= 10; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'biped'));
      const idx = mouthIdx(p);
      const spec = mouthSpec(p, idx);
      if (!spec || !['herbivore', 'maw', 'fanged', 'underbite'].includes(spec.variant)) continue;
      const b = buildJawed(p, idx, [], false, spec.variant as JawedVariant, 'hybrid')!;
      expect(b.upperTeeth.length, `biped #${seed}`).toBeGreaterThanOrEqual(12);
      const f = surfacePrims(p, 'hybrid');
      const o = spec.node.pos;
      let shown = 0;
      for (const t of b.upperTeeth) {
        const Y = qRotateV(t.quat, [0, 1, 0]);
        let out = 0;
        for (let k = 1; k <= 24; k++) {
          const q = [o[0] + t.pos[0] + Y[0] * t.len * (k / 24), o[1] + t.pos[1] + Y[1] * t.len * (k / 24), o[2] + t.pos[2] + Y[2] * t.len * (k / 24)];
          if (fieldAt(f, q[0], q[1], q[2]) > 0) out++;
        }
        shown += (out / 24) * t.len;
        // its tip still above the head's underside there
        const tip: [number, number, number] = [o[0] + t.pos[0] + Y[0] * t.len, o[1] + t.pos[1] + Y[1] * t.len, o[2] + t.pos[2] + Y[2] * t.len];
        const below = rayToSurface(f, [], [spec.anchor.pos[0], tip[1] + 0.5, tip[2]], [0, -1, 0]);
        if (below) expect(tip[1], `biped #${seed} tip under the chin`).toBeGreaterThan(below.p[1] - 1e-3 - 2 * (spec.anchor.radius));
      }
      expect(shown / b.upperTeeth.length, `biped #${seed} crown showing`).toBeGreaterThan(0.045);
    }
  });
});
