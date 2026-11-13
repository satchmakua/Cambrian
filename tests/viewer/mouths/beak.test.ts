import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { defaultGenome } from '../../../src/engine/genome';
import type { Vec3 } from '../../../src/engine/genome';
import { genomeOfMorphotype, randomGenome } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt, qRotateV } from '../../../src/viewer/bodyField';
import { buildBeak, type BeakBuild } from '../../../src/viewer/mouths/beak';

// On-surface tolerance for the socket ring + seat (ray-trace is 1e-4; Newton fallback looser).
const ON_SURFACE = 6e-3;

/** Force the first mouth node into the beak band (the builder reads style off the node). */
function forceBeak(p: Phenotype, style = 0.3): number {
  const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  if (idx >= 0) {
    const n = p.nodes[idx];
    n.part = { kind: n.part?.kind ?? 'maw', style };
  }
  return idx;
}

function beakOn(p: Phenotype, style = 0.3, recessed = false): BeakBuild | null {
  const idx = forceBeak(p, style);
  return idx < 0 ? null : buildBeak(p, idx, [], recessed);
}

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

const GEOS = ['collar', 'upper', 'lower', 'interior'] as const;

describe('beak mouth (mouth overhaul)', () => {
  it('returns null when the node is not a mouth', () => {
    const p = grow(defaultGenome());
    expect(p.nodes[0].terminal).not.toBe('mouth');
    expect(buildBeak(p, 0, [], false)).toBeNull();
  });

  it('is deterministic: identical builds produce identical geometry and paths', () => {
    let checked = 0;
    for (const p of [grow(defaultGenome()), grow(randomGenome(5))]) {
      const idx = forceBeak(p);
      if (idx < 0) continue;
      const a = buildBeak(p, idx, [], false)!;
      const b = buildBeak(p, idx, [], false)!;
      for (const key of GEOS) {
        expect(Array.from(a[key].getAttribute('position').array)).toEqual(Array.from(b[key].getAttribute('position').array));
      }
      expect(a.upperPath).toEqual(b.upperPath);
      expect(a.lowerPath).toEqual(b.lowerPath);
      expect(a.hook).toBe(b.hook);
      expect(a.ring).toEqual(b.ring);
      checked++;
    }
    expect(checked).toBeGreaterThan(0); // the default genome always has a face mouth
  });

  it('every geometry attribute value is finite', () => {
    let checked = 0;
    for (const p of [grow(defaultGenome()), grow(randomGenome(3)), grow(randomGenome(9))]) {
      const built = beakOn(p);
      if (!built) continue;
      for (const key of GEOS) {
        const pos = built[key].getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) {
          expect(Number.isFinite((pos.array as Float32Array)[i])).toBe(true);
        }
        expect(built[key].getIndex()!.count % 3).toBe(0);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(1);
  });

  it('the cere ring and the interior seat sit on the true skin', () => {
    let checked = 0;
    for (let s = 0; s < 10; s++) {
      const p = grow(randomGenome(s));
      const built = beakOn(p);
      if (!built) continue;
      const o = built.spec.node.pos;
      const f = buildFieldPrims(p, 'body');
      for (const sm of built.ring) {
        expect(Math.abs(fieldAt(f, sm.p[0] + o[0], sm.p[1] + o[1], sm.p[2] + o[2]))).toBeLessThan(ON_SURFACE);
      }
      expect(Math.abs(fieldAt(f, built.seat.p[0] + o[0], built.seat.p[1] + o[1], built.seat.p[2] + o[2]))).toBeLessThan(ON_SURFACE);
      checked++;
    }
    expect(checked).toBeGreaterThan(4); // the bauplan guarantees faces — most creatures have mouths
  });

  it('is exactly bilaterally symmetric on the default genome', () => {
    const p = grow(defaultGenome());
    const built = beakOn(p);
    expect(built).not.toBeNull();
    if (!built) return;
    expect(Math.abs(built.spec.node.pos[0])).toBeLessThan(1e-6); // the face mouth sits on X=0
    // ring samples mirror pairwise: t ↦ 1 − t (mod the turn) is the X-mirror, i.e. i ↦ 3n/2 − i
    const n = built.ring.length;
    for (let i = 0; i < n; i++) {
      const a = built.ring[i];
      const b = built.ring[((3 * n) / 2 - i) % n];
      expect(a.p[0]).toBeCloseTo(-b.p[0], 4);
      expect(a.p[1]).toBeCloseTo(b.p[1], 4);
      expect(a.p[2]).toBeCloseTo(b.p[2], 4);
    }
    // both loft spines live ON the midline plane — no asymmetric jitter in X, by construction
    for (const path of [built.upperPath, built.lowerPath]) {
      for (const q of path) expect(q[0]).toBeCloseTo(0, 4);
    }
    // and the blade cross-sections straddle it: X extents mirror
    for (const key of ['upper', 'lower'] as const) {
      const pos = built[key].getAttribute('position');
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      expect(minX + maxX).toBeCloseTo(0, 3);
    }
  });

  it('the bill runs out mostly ahead of the face (not down at the ground), under 1.7r, with an accelerating 0.25r–0.6r hook (0.95r hooked)', () => {
    let checked = 0;
    for (const p of [grow(defaultGenome()), grow(randomGenome(2)), grow(randomGenome(7))]) {
      const built = beakOn(p);
      if (!built) continue;
      const { r, seat, dir, up } = built;
      const pos = built.upper.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const v: Vec3 = [pos.getX(i) - seat.p[0], pos.getY(i) - seat.p[1], pos.getZ(i) - seat.p[2]];
        expect(dot3(v, dir)).toBeLessThan(1.7 * r);
      }
      // the bill's axis leans toward the head's forward, away from the mouth's downward aim
      const fwd = qRotateV(built.spec.anchor.quat, [0, 0, 1]);
      expect(dot3(dir, fwd)).toBeGreaterThanOrEqual(dot3(built.spec.aim, fwd) - 1e-6);
      expect(dot3(dir, fwd)).toBeGreaterThan(0.7);
      // the tip protrudes visibly, and the hook lands in the specified band
      const tip = built.upperPath[built.upperPath.length - 1];
      expect(dot3(sub3(tip, seat.p), dir)).toBeGreaterThan(0.5 * r);
      expect(built.hook).toBeGreaterThanOrEqual(0.25 * r - 1e-9);
      // (a hooked bill — a hawk's — drops by more than half its depth: at 0.6r its underside ran near
      // level to the point, a straight cone)
      expect(built.hook).toBeLessThanOrEqual((built.hooked ? 0.95 : 0.6) * r + 1e-9);
      // acceleration: half-way along the spine the drop is still well under half the full hook
      const dropAt = (k: number): number => -dot3(sub3(built.upperPath[k], built.upperPath[0]), up);
      expect(dropAt(8)).toBeCloseTo(built.hook, 6);
      expect(dropAt(4)).toBeGreaterThan(0.05 * built.hook);
      expect(dropAt(4)).toBeLessThan(0.35 * built.hook);
      checked++;
    }
    expect(checked).toBeGreaterThan(1);
  });

  it('the lower mandible is a 0.75-scale counter-piece resting just open below the upper (0.64 under a hook)', () => {
    const p = grow(defaultGenome());
    const built = beakOn(p);
    expect(built).not.toBeNull();
    if (!built) return;
    expect(built.upperPath.length).toBe(9);
    expect(built.lowerPath.length).toBe(9);
    // (under a hooked bill it is shorter, so the hook overhangs it)
    expect(built.lowerLen).toBeCloseTo((built.hooked ? 0.64 : 0.75) * built.upperLen, 9);
    const up = built.up;
    // roots below the upper's, spine pitched a hair down off the bill axis — closed, but two parts
    expect(dot3(sub3(built.lowerPath[0], built.upperPath[0]), up)).toBeLessThan(0);
    const dirL = norm3(sub3(built.lowerPath[8], built.lowerPath[0]));
    expect(dot3(dirL, up)).toBeLessThan(-0.01);
    expect(dot3(dirL, up)).toBeGreaterThan(-0.2);
    // structure: a closed 20-sample collar ring, two capped 9×10 lofts, no teeth anywhere
    expect(built.ring.length).toBe(20);
    expect(built.collar.getAttribute('position').count).toBe(20 * 8);
    expect(built.upper.getAttribute('position').count).toBe(9 * 10 + 2);
    expect(built.lower.getAttribute('position').count).toBe(9 * 10 + 2);
  });

  it('style position inside the band changes length and hook — beaks evolve visibly', () => {
    const p = grow(defaultGenome());
    const lo = beakOn(p, 0.255);
    const hi = beakOn(p, 0.372);
    expect(lo).not.toBeNull();
    expect(hi).not.toBeNull();
    if (!lo || !hi) return;
    expect(hi.upperLen - lo.upperLen).toBeGreaterThan(0.2 * lo.r); // slenderness: longer up-band
    // …and the hook goes with the build: the short stout bill (a hawk's, a parrot's) is the deeply
    // hooked one, the long slim one (a dove's, a wader's) near straight
    expect(lo.hook).toBeGreaterThan(1.5 * hi.hook);
    expect(lo.hook / lo.r).toBeGreaterThan(0.4);
    expect(hi.hook / hi.r).toBeLessThan(0.3);
  });

  it('a turtle’s beak lies flat across its jaws, at its mouth — not on edge down the middle of its face', () => {
    // (built like a bird's — a tall narrow blade, ridden up toward the brow — but too short to read as
    // a bill, it was a black slot between the eyes)
    for (let seed = 11; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'chelonian'));
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const built = buildBeak(p, idx, [], false, 'hybrid')!;
      expect(built, `#${seed}`).not.toBeNull();
      built.upper.computeBoundingBox();
      const b = built.upper.boundingBox!;
      const wide = b.max.x - b.min.x;
      const tall = b.max.y - b.min.y;
      expect(wide / tall, `#${seed} wide and low`).toBeGreaterThan(1.5);
      // rooted at the mouth: its top no higher above the seat than the beak's own size
      expect(b.max.y - built.seat.p[1], `#${seed} at the mouth`).toBeLessThan(0.75 * built.r);
    }
    // a bird's stays a blade on edge
    const bird = grow(genomeOfMorphotype(12, 'bird'));
    const bb = buildBeak(bird, bird.nodes.findIndex((n) => n.terminal === 'mouth'), [], false, 'hybrid')!;
    bb.upper.computeBoundingBox();
    expect(bb.upper.boundingBox!.max.x - bb.upper.boundingBox!.min.x).toBeLessThan(bb.upper.boundingBox!.max.y - bb.upper.boundingBox!.min.y);
  });

  it('a bird of prey wears a hawk’s bill and a songbird a slim one, whatever the seed', () => {
    // (the hook was half a coin toss: the two plans drew from the same bills and looked alike)
    for (let seed = 1; seed <= 12; seed++) {
      const style = (id: string) => {
        let seg = genomeOfMorphotype(seed, id).body;
        while (seg.child) seg = seg.child;
        return seg.appendages.find((a) => a.terminal === 'mouth')!.style;
      };
      expect(style('raptor'), `raptor #${seed}`).toBeLessThan(0.29);
      expect(style('bird'), `bird #${seed}`).toBeGreaterThan(0.3);
      expect(style('bird'), `bird #${seed}`).toBeLessThan(0.375);
      expect(style('raptor'), `raptor #${seed}`).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('recessed sinks the interior wedge into the cavity; the capsule kit keeps it a hair proud', () => {
    const p = grow(defaultGenome());
    const idx = forceBeak(p);
    expect(idx).toBeGreaterThanOrEqual(0);
    const proud = buildBeak(p, idx, [], false)!;
    const rec = buildBeak(p, idx, [], true)!;
    const throat = (b: BeakBuild): Vec3 => {
      const a = b.interior.getAttribute('position'); // vertex 4 is the throat point
      return [a.getX(4), a.getY(4), a.getZ(4)];
    };
    const nrm = proud.seat.n;
    const r = proud.r;
    const dProud = dot3(sub3(throat(proud), proud.seat.p), nrm);
    const dRec = dot3(sub3(throat(rec), rec.seat.p), nrm);
    expect(dProud).toBeGreaterThan(0.005 * r); // never hidden inside the body
    expect(dProud).toBeLessThan(0.03 * r);
    expect(dRec).toBeLessThan(-0.3 * r); // sunk into the real carve
    expect(dRec).toBeGreaterThan(-0.9 * r);
  });

  it("a bird's bill runs on from its brow: rooted up the face, not hung off the chin", () => {
    // the mouth seat sits low on the face (its aim pitches down onto the front); a bill rooted right
    // there hung under the forehead like a thorn — every raptor read as a pigeon chick
    for (const id of ['bird', 'raptor']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
        const b = buildBeak(p, idx, [], false)!;
        const rise = dot3(sub3(b.upperPath[0], b.seat.p), b.up);
        expect(rise, `${id} #${seed}`).toBeGreaterThan(0.35 * b.r);
        // and it points out ahead of the face more than down at the ground
        const fwd = qRotateV(b.spec.anchor.quat, [0, 0, 1]);
        expect(dot3(b.dir, fwd as Vec3), `${id} #${seed}`).toBeGreaterThan(0.85);
      }
    }
  });

  it("a hawk's bill is short, deep-hooked and two-toned; a songbird's and an ostrich's are not", () => {
    // (hooked only at its very tip and pale all over, a hawk's bill was a candy-corn wedge — a pigeon's)
    const bill = (seed: number, id: string) => {
      const p = grow(genomeOfMorphotype(seed, id));
      return buildBeak(p, p.nodes.findIndex((n) => n.terminal === 'mouth'), [], false)!;
    };
    for (let seed = 1; seed <= 8; seed++) {
      const hawk = bill(seed, 'raptor');
      expect(hawk.hooked, `raptor #${seed}`).toBe(true);
      expect(hawk.hook, `raptor #${seed}`).toBeGreaterThan(0.48 * hawk.r);
      // the hook turns the tip down past the lower mandible: the upper mandible's point lies below the
      // lower's, and below its own root by more than the root's half-depth
      const tipU = hawk.upperPath[hawk.upperPath.length - 1];
      const tipL = hawk.lowerPath[hawk.lowerPath.length - 1];
      const upOf = (v: number[]) => v[0] * hawk.up[0] + v[1] * hawk.up[1] + v[2] * hawk.up[2];
      expect(upOf(tipU), `raptor #${seed} overhangs`).toBeLessThan(upOf(tipL));
      expect(upOf(hawk.upperPath[0]) - upOf(tipU), `raptor #${seed} hooks down`).toBeGreaterThan(0.6 * hawk.r);
      // painted: yellow at the face, darker toward the hook
      const col = hawk.upper.getAttribute('color');
      expect(col, `raptor #${seed}`).toBeTruthy();
      for (const id of ['bird', 'ratite']) {
        const b = bill(seed, id);
        expect(b.hooked, `${id} #${seed}`).toBe(false);
        expect(b.hook, `${id} #${seed}`).toBeLessThan(0.48 * b.r);
      }
    }
  });

  it("a bill's buried root stays buried: no ring still inside the head pokes out through the brow", () => {
    // (a tall blade-bill rooted up the face stood its root's top edge out above a sloping brow — a
    // plate fixed upright on the forehead)
    for (const id of ['raptor', 'bird']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
        const b = buildBeak(p, idx, [], false)!;
        const f = buildFieldPrims(p, 'body');
        const o = p.nodes[idx].pos;
        const pos = b.upper.getAttribute('position');
        let buried = 0;
        for (let i = 0; i < b.upperPath.length; i++) {
          const s = b.upperPath[i];
          // (a ring whose spine point is within a hair of the skin is the bill's base, not its root)
          if (fieldAt(f, s[0] + o[0], s[1] + o[1], s[2] + o[2]) > -0.02 * b.r) break;
          buried++;
          for (let j = 0; j < 10; j++) {
            const k = i * 10 + j;
            const d = fieldAt(f, pos.getX(k) + o[0], pos.getY(k) + o[1], pos.getZ(k) + o[2]);
            expect(d, `${id} #${seed} ring ${i}`).toBeLessThan(0.01 * b.r);
          }
        }
        expect(buried, `${id} #${seed}`).toBeGreaterThan(0); // the bill roots inside the head
      }
    }
  });

  it("a turtle wears a short horny beak under a shell of its own, its soft parts leathery", () => {
    // (a bird's bill on a turtle hung off its chin like a thorn; plates everywhere left no shell edge)
    for (let seed = 1; seed <= 6; seed++) {
      const g = genomeOfMorphotype(seed, 'chelonian');
      expect(['scales', 'skin'], `#${seed}`).toContain(g.covering.type);
      const p = grow(g);
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const b = buildBeak(p, idx, [], false)!;
      // short and blunt — shorter than any bird's bill (1.1 of the mouth's size and more), a little
      // hooked — but there to be seen: at half the mouth's size it was sunk in the snout
      expect(b.upperLen, `#${seed}`).toBeLessThan(1.0 * b.r);
      expect(b.upperLen, `#${seed}`).toBeGreaterThan(0.75 * b.r);
      expect(b.hook, `#${seed}`).toBeLessThan(0.3 * b.r);
      expect(b.hook, `#${seed}`).toBeGreaterThan(0.18 * b.r);
    }
  });
});

