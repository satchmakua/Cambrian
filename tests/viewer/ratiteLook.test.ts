// Proposed location: tests/viewer/ratiteLook.test.ts
import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../src/viewer/bodyField';
import { buildBeak, type BeakBuild } from '../../src/viewer/mouths/beak';
import { footPlanOf, lastLinkOf, shaggyPlumage, TALONED, toedFootGeometry } from '../../src/viewer/feet';

type V3 = readonly number[];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: V3, b: V3): number[] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function billOf(p: Phenotype): BeakBuild {
  return buildBeak(p, p.nodes.findIndex((n) => n.terminal === 'mouth'), [], false, 'hybrid')!;
}

/** The upper mandible's rings: its vertex count less the two cap centres, over its spine's samples. */
function ringsOf(b: BeakBuild): { rings: number; radial: number } {
  const rings = b.upperPath.length;
  return { rings, radial: (b.upper.getAttribute('position').count - 2) / rings };
}

/** Seen from above, how sharply the upper mandible's outline turns anywhere over its outer half and round its
 *  tip (degrees): a round spoon's end turns a little at each step, a chamfered card's in two hard cuts. */
function tipTurn(b: BeakBuild): number {
  const pos = b.upper.getAttribute('position');
  const { rings, radial } = ringsOf(b);
  const root = b.upperPath[0];
  const pts: number[][] = [];
  for (let i = 0; i < rings; i++) {
    let side = -Infinity, along = 0;
    for (let j = 0; j < radial; j++) {
      const k = i * radial + j;
      const v = [pos.getX(k) - root[0], pos.getY(k) - root[1], pos.getZ(k) - root[2]];
      const s = dot3(v, b.spec.right);
      if (s > side) {
        side = s;
        along = dot3(v, b.dir);
      }
    }
    pts.push([along, side]);
  }
  pts.push([dot3(sub3(b.upperPath[rings - 1], root), b.dir), 0]); // the tip cap's centre
  let worst = 0;
  for (let i = Math.floor(rings / 2); i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const c = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    worst = Math.max(worst, (Math.abs(c - a) * 180) / Math.PI);
  }
  return worst;
}

/** The sharpest corner (degrees) round the upper mandible's section halfway along it: a ridge down its side
 *  where a flat section's rim turns all at once. */
function rimCorner(b: BeakBuild): number {
  const pos = b.upper.getAttribute('position');
  const { rings, radial } = ringsOf(b);
  const im = Math.floor(rings / 2);
  const sec: number[][] = [];
  for (let j = 0; j < radial; j++) {
    const k = im * radial + j;
    const v = sub3([pos.getX(k), pos.getY(k), pos.getZ(k)], b.upperPath[im]);
    sec.push([dot3(v, b.spec.right), dot3(v, b.up)]);
  }
  let worst = 0;
  for (let j = 0; j < radial; j++) {
    const a = sec[(j - 1 + radial) % radial], m = sec[j], c = sec[(j + 1) % radial];
    let d = Math.abs(Math.atan2(c[1] - m[1], c[0] - m[0]) - Math.atan2(m[1] - a[1], m[0] - a[0]));
    if (d > Math.PI) d = 2 * Math.PI - d;
    worst = Math.max(worst, (d * 180) / Math.PI);
  }
  return worst;
}

/** Where the bill leaves the face (the first 15% of it out of the skin): both mandibles' depth over their width. */
function baseDepth(p: Phenotype, b: BeakBuild): number {
  const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
  const o = p.nodes[mi].pos;
  const f = buildFieldPrims(p, 'hybrid');
  const root = b.upperPath[0];
  let out = 1;
  for (let t = 0; t <= 1; t += 0.005) {
    if (fieldAt(f, root[0] + b.dir[0] * t * b.upperLen + o[0], root[1] + b.dir[1] * t * b.upperLen + o[1], root[2] + b.dir[2] * t * b.upperLen + o[2]) > 0) {
      out = t;
      break;
    }
  }
  let d0 = Infinity, d1 = -Infinity, w0 = Infinity, w1 = -Infinity;
  for (const g of [b.upper, b.lower]) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const v = [pos.getX(i) - root[0], pos.getY(i) - root[1], pos.getZ(i) - root[2]];
      const a = dot3(v, b.dir) / b.upperLen;
      if (a < out || a > out + 0.15) continue;
      const up = dot3(v, b.up), side = dot3(v, b.spec.right);
      d0 = Math.min(d0, up);
      d1 = Math.max(d1, up);
      w0 = Math.min(w0, side);
      w1 = Math.max(w1, side);
    }
  }
  return (d1 - d0) / (w1 - w0);
}

describe('ratite look', () => {
  it("an ostrich's bill is a horn spoon growing out of its face — not a flat card with a chamfered end", () => {
    // (nine even rings of ten vertices, a third as deep as wide: from above its round end was two straight
    // cuts, its rim a hard ridge down each side, and where it met the round head a slab a fifth as deep)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ratite'));
      const b = billOf(p);
      expect(tipTurn(b), `#${seed} round tip`).toBeLessThan(25);
      expect(rimCorner(b), `#${seed} no ridge round its rim`).toBeLessThan(35);
      expect(baseDepth(p, b), `#${seed} deep where it leaves the face`).toBeGreaterThan(0.66);
    }
  });

  it("a songbird's and a hawk's bills are built as before", () => {
    // (the even-turn section and the ever-closer rings are a broad bill's only)
    for (const id of ['bird', 'raptor']) {
      const b = billOf(grow(genomeOfMorphotype(3, id)));
      expect(b.upperPath.length, id).toBe(9);
      expect(ringsOf(b).radial, id).toBe(10);
    }
  });

  it('a running bird stands on three short toes under its body — none reach out past its flanks, and no hind toe', () => {
    // (a perching bird's four long thin toes, the outer two splayed half a radian: from above, two pale spikes
    // through its plumage either side of the breast)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ratite'));
      const plan = footPlanOf(p)!;
      expect(plan, `#${seed}`).toBe('bird');
      const f = buildFieldPrims(p, 'body');
      const y0 = p.bounds.min[1], y1 = p.bounds.max[1];
      const under = (x: number, z: number): boolean => {
        for (let y = y0; y <= y1; y += 0.02) if (fieldAt(f, x, y, z) < 0) return true;
        return false;
      };
      for (let i = 0; i < p.nodes.length; i++) {
        const n = p.nodes[i];
        if (n.terminal !== 'claw' || n.part?.kind !== 'leg') continue;
        const r = Math.max(n.radius, 0.04);
        const g = toedFootGeometry(plan, r, lastLinkOf(p, i), (n.part?.style ?? 0) >= TALONED, false, shaggyPlumage(p));
        let past = 0, back = 0;
        for (const geo of [g.toes, g.claws]) {
          const pos = geo.getAttribute('position');
          for (let k = 0; k < pos.count; k++) {
            if (!under(pos.getX(k) + n.pos[0], pos.getZ(k) + n.pos[2])) past++;
            back = Math.min(back, pos.getZ(k));
          }
        }
        expect(past, `#${seed} foot ${i}: toe vertices out past the body from above`).toBe(0);
        expect(back / r, `#${seed} foot ${i}: no hind toe`).toBeGreaterThan(-1.3);
      }
    }
  });

  it('a perching bird and a bird of prey keep their hind toe', () => {
    for (const id of ['bird', 'raptor']) {
      const p = grow(genomeOfMorphotype(3, id));
      const i = p.nodes.findIndex((n) => n.terminal === 'claw' && n.part?.kind === 'leg');
      const n = p.nodes[i];
      const r = Math.max(n.radius, 0.04);
      const g = toedFootGeometry(footPlanOf(p)!, r, lastLinkOf(p, i), (n.part?.style ?? 0) >= TALONED, false, shaggyPlumage(p));
      const pos = g.toes.getAttribute('position');
      let back = 0;
      for (let k = 0; k < pos.count; k++) back = Math.min(back, pos.getZ(k));
      expect(back / r, id).toBeLessThan(-1.5);
    }
  });
});
