import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildSmoothGeometry } from '../../../src/viewer/smoothSkin';
import { hoofGeometry } from '../../../src/viewer/feet';
import { buildJawed, noseColorOf, NOSTRIL, type JawedVariant } from '../../../src/viewer/mouths/jawed';
import { mouthVariant } from '../../../src/viewer/partStyles';

const deer = (seed: number) => grow(genomeOfMorphotype(seed, 'ungulate'));
const parentOf = (p: Phenotype) => new Map(p.edges.map(([a, b]) => [b, a]));

/** a leg's nodes, hip to hoof, for every hoof on the right (+X) side */
function legsOf(p: Phenotype): { fore: boolean; chain: number[] }[] {
  const parent = parentOf(p);
  const out: { fore: boolean; chain: number[] }[] = [];
  p.nodes.forEach((n, i) => {
    if (n.terminal !== 'hoof' || n.pos[0] < 0) return;
    const chain = [i];
    for (let k = parent.get(i); k !== undefined && p.nodes[k].part?.kind === 'leg'; k = parent.get(k)) chain.unshift(k);
    out.push({ fore: n.pos[2] > 0.5, chain });
  });
  return out;
}

/** the lean of a link from the plumb, in the side view (rad; + forward) */
const lean = (a: readonly number[], b: readonly number[]) => Math.atan2(b[2] - a[2], a[1] - b[1]);

describe('ungulate look', () => {
  it("its knee swells smoothly into its forearm and cannon: no ring seam, no ball on a stick", () => {
    // (a ball 1.35× the cannon at the knee met the forearm in a waist and the cannon in a step — a crease at each
    // side of its equator, its top lit: a pale ring seam at every knee and hock, the leg a stack of tubes)
    for (let seed = 1; seed <= 3; seed++) {
      const p = deer(seed);
      const g = buildSmoothGeometry(p, true, [], 'high');
      const pos = g.getAttribute('position');
      const idx = g.getIndex()!;
      const fore = legsOf(p).find((l) => l.fore)!;
      const knee = fore.chain[fore.chain.length - 2], hoof = fore.chain[fore.chain.length - 1];
      const K = p.nodes[knee].pos, H = p.nodes[hoof].pos, r = p.nodes[knee].radius;
      const L = Math.hypot(H[0] - K[0], H[1] - K[1], H[2] - K[2]);
      const u = [(H[0] - K[0]) / L, (H[1] - K[1]) / L, (H[2] - K[2]) / L];
      const along = (v: number) => (pos.getX(v) - K[0]) * u[0] + (pos.getY(v) - K[1]) * u[1] + (pos.getZ(v) - K[2]) * u[2];
      const s = idx.count;
      const sv = new Float64Array(pos.count);
      for (let v = 0; v < pos.count; v++) sv[v] = along(v);
      // the outline: the skin's cross-section girth at each step along the leg's axis, 2.5 girths either side
      const prof: number[] = [];
      for (let k = -25; k <= 25; k++) {
        const at = k * 0.1 * r;
        let best = 0;
        for (let t = 0; t < s; t += 3) {
          for (let e = 0; e < 3; e++) {
            const a = idx.getX(t + e), b = idx.getX(t + ((e + 1) % 3));
            const sa = sv[a], sb = sv[b];
            if ((sa - at) * (sb - at) > 0 || sa === sb) continue;
            const f = (at - sa) / (sb - sa);
            const P = [0, 1, 2].map((c) => pos.getComponent(a, c) + (pos.getComponent(b, c) - pos.getComponent(a, c)) * f - K[c]);
            const d = P[0] * u[0] + P[1] * u[1] + P[2] * u[2];
            const rr = Math.hypot(P[0] - u[0] * d, P[1] - u[1] * d, P[2] - u[2] * d);
            if (rr < 3 * r) best = Math.max(best, rr / r);
          }
        }
        prof.push(best);
      }
      let slope = 0, crease = 0;
      for (let k = 1; k < prof.length; k++) slope = Math.max(slope, Math.abs(prof[k] - prof[k - 1]) / 0.1);
      for (let k = 1; k + 1 < prof.length; k++) crease = Math.max(crease, (prof[k + 1] + prof[k - 1] - 2 * prof[k]) / 0.01);
      expect(slope, `#${seed} the outline never steps`).toBeLessThan(0.45);
      expect(crease, `#${seed} no crease round the knee`).toBeLessThan(4);
      // (and it is still a knee: the cannon below it slimmer than the joint)
      expect(prof[0] - prof[prof.length - 1], `#${seed} a slim cannon under it`).toBeGreaterThan(0.25);
    }
  });

  it('its hind leg folds at a hock: the gaskin runs back from the stifle, the cannon drops near plumb', () => {
    // (on a paw's angles the gaskin ran back 18–29° and the cannon on 6–13° forward: a straight stilt bent a little)
    for (let seed = 1; seed <= 12; seed++) {
      const p = deer(seed);
      const hind = legsOf(p).find((l) => !l.fore)!;
      const [, stifle, hock, hoof] = hind.chain.map((i) => p.nodes[i].pos);
      expect(lean(stifle, hock), `#${seed} gaskin back`).toBeLessThan(-(30 * Math.PI) / 180);
      expect(Math.abs(lean(hock, hoof)), `#${seed} cannon plumb`).toBeLessThan((5 * Math.PI) / 180);
      // (the hock a joint off the ground, not a heel on it)
      expect((hock[1] - hoof[1]) / (p.nodes[hind.chain[0]].pos[1] - hoof[1]), `#${seed} hock high`).toBeGreaterThan(0.3);
    }
  });

  it('stands on hooves: keratin wedges taller than the cannon is wide, toe ahead of the leg — not black dots', () => {
    // (a puck 1.35 of the cannon's girth tall, its top hardly wider than the cannon, was a dot under each leg)
    const r = 0.064;
    const { horn } = hoofGeometry(r);
    horn.computeBoundingBox();
    const box = horn.boundingBox!;
    expect((box.max.y - box.min.y) / r, 'tall').toBeGreaterThanOrEqual(2);
    expect(box.max.z / r, 'toe ahead').toBeGreaterThan(1.8);
    // the front wall slopes: its toe at the sole well ahead of its front at the coronet
    const pos = horn.getAttribute('position');
    let topFront = -Infinity, soleFront = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > box.max.y - 0.05 * r) topFront = Math.max(topFront, pos.getZ(i));
      if (pos.getY(i) < box.min.y + 0.05 * r) soleFront = Math.max(soleFront, pos.getZ(i));
    }
    expect((soleFront - topFront) / r, 'a sloping wall').toBeGreaterThan(0.6);
    // (the coronet caps the cannon: wider than it)
    expect(Math.min(-box.min.x, box.max.x) / r).toBeGreaterThan(1);
  });

  it("its nose shows its nostrils: low on the pad's face, half-way out, black on a charcoal pad", () => {
    // (on the pad's rim, black on black, the far one gone from three-quarters: the open end of a hollow tube)
    // (lightness of the sRGB swatch)
    const L = (hex: number) => {
      const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      return (Math.max(...c) + Math.min(...c)) / 510;
    };
    for (let seed = 1; seed <= 12; seed++) {
      const p = deer(seed);
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const b = buildJawed(p, mi, [], false, mouthVariant(p.nodes[mi].part!.style) as JawedVariant, 'hybrid')!;
      b.nose!.computeBoundingBox();
      const pad = b.nose!.boundingBox!;
      const half = (pad.max.x - pad.min.x) / 2, cx = (pad.max.x + pad.min.x) / 2;
      const pos = b.nostrils!.getAttribute('position');
      let sum = 0, n = 0, outer = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) - cx;
        if (x > 0) {
          sum += x;
          n++;
        }
        outer = Math.max(outer, Math.abs(x));
      }
      expect(sum / n / half, `#${seed} half-way out`).toBeLessThan(0.55);
      expect(outer / half, `#${seed} on the pad's face, not its rim`).toBeLessThan(0.8);
      const tone = L(noseColorOf(p, mi));
      expect(tone, `#${seed} charcoal`).toBeGreaterThan(0.15);
      expect(tone / L(NOSTRIL), `#${seed} the nostrils show on it`).toBeGreaterThan(4);
    }
  });
});
