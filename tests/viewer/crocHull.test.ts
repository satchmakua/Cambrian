import { describe, it, expect } from 'vitest';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../src/engine/random';
import { grow, type Phenotype, type BodyNode } from '../../src/engine/grow';
import { buildFieldPrims, fieldAt, hullBody, qRotateV } from '../../src/viewer/bodyField';
import { scutePlan } from '../../src/viewer/scutes';
import { mouthSpec, surfacePrims } from '../../src/viewer/mouthLine';
import { buildJawed } from '../../src/viewer/mouths/jawed';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 29];
const croc = (seed: number) => grow(genomeOfMorphotype(seed, 'crocodilian'));
const skin = (p: Phenotype) => {
  const f = buildFieldPrims(p, 'hybrid');
  f.k = 0.34 * f.meanR; // smoothSkin's hybrid blend
  return f;
};
const spineOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine').sort((a, b) => a.pos[2] - b.pos[2]);
const halfDepth = (n: BodyNode) => n.radius * (n.scale?.[1] ?? 1);

describe("a crocodile's hull", () => {
  it('only a crocodile is skinned as one hull', () => {
    for (const id of MORPHOTYPE_IDS) for (let seed = 1; seed <= 8; seed++) expect(hullBody(grow(genomeOfMorphotype(seed, id))), `${id} #${seed}`).toBe(id === 'crocodilian');
  });

  it("its neck is as flat as its back and its skull: no hump between them (the frog's face)", () => {
    for (const seed of SEEDS) {
      const s = spineOf(croc(seed));
      const trunk = s.filter((n) => (n.segment ?? 0) === 0), neck = s.filter((n) => n.segment === 1), head = s.filter((n) => n.segment === 2);
      expect(halfDepth(neck[0]), `#${seed} neck under the shoulders`).toBeLessThanOrEqual(halfDepth(trunk[trunk.length - 1]) + 1e-9);
      expect(halfDepth(neck[0]), `#${seed} neck over the skull`).toBeGreaterThanOrEqual(halfDepth(head[0]));
    }
  });

  it('runs smooth from the shoulders to the skull: no ring at the shoulder, the neck or the head (the onion)', () => {
    for (const seed of SEEDS) {
      const p = croc(seed);
      const f = skin(p);
      const s = spineOf(p);
      const trunk = s.filter((n) => (n.segment ?? 0) === 0);
      const z0 = trunk[trunk.length - 2].pos[2], z1 = s.find((n) => n.segment === 2)!.pos[2];
      const yAt = (z: number) => {
        for (let i = 1; i < s.length; i++) if (z <= s[i].pos[2]) { const u = (z - s[i - 1].pos[2]) / (s[i].pos[2] - s[i - 1].pos[2]); return s[i - 1].pos[1] + (s[i].pos[1] - s[i - 1].pos[1]) * u; }
        return s[s.length - 1].pos[1];
      };
      // the underside only rises toward the head, the back only falls: sum what runs the other way
      let pl = NaN, ph = NaN, wrong = 0;
      for (let z = z0; z <= z1 + 1e-6; z += 0.02) {
        const yc = yAt(z);
        let lo = NaN, hi = NaN;
        for (let y = yc - 0.7; y <= yc + 0.7; y += 0.002) if (fieldAt(f, 0, y, z) < 0) { if (isNaN(lo)) lo = y; hi = y; }
        if (!isNaN(pl)) wrong += Math.max(0, pl - lo) + Math.max(0, hi - ph);
        pl = lo; ph = hi;
      }
      // (HEAD: 0.057–0.184; with the hull 0.000–0.021)
      expect(wrong, `#${seed} ripple under the chin and over the neck`).toBeLessThan(0.03);
    }
  });

  it("its snout narrows to the tip: no knob on the end (a clown's nose)", () => {
    for (const seed of SEEDS) {
      const p = croc(seed);
      const f = skin(p);
      const head = spineOf(p).filter((n) => n.segment === 2);
      const t = head[head.length - 1], q = head[head.length - 2];
      const hw = (n: BodyNode) => { let w = 0; for (let x = 0; x < 1; x += 0.002) if (fieldAt(f, n.pos[0] + x, n.pos[1], n.pos[2]) < 0) w = x; return w; };
      // the skin narrows as the links do (0.75–0.8 a link); HEAD's swelled tip was 0.91–0.95 of the link behind
      expect(hw(t) / hw(q), `#${seed}`).toBeLessThan(0.85);
    }
  });

  it("its nostril boss lies on the snout, its rim in the skin, not over the tip's end", () => {
    for (const seed of SEEDS) {
      const p = croc(seed);
      const f = surfacePrims(p, 'hybrid');
      const s = scutePlan(p, 'hybrid').find((x) => x.on === 'snout')!;
      const rt = [s.up[1] * s.fwd[2] - s.up[2] * s.fwd[1], s.up[2] * s.fwd[0] - s.up[0] * s.fwd[2], s.up[0] * s.fwd[1] - s.up[1] * s.fwd[0]];
      let rim = -Infinity;
      for (let j = 0; j < 24; j++) {
        const th = (j / 24) * Math.PI * 2, a = (s.len / 2) * Math.cos(th), r = (s.wid / 2) * Math.sin(th);
        const q = [0, 1, 2].map((k) => s.at[k] + s.fwd[k] * a + rt[k] * r - s.up[k] * 0.35 * s.h);
        rim = Math.max(rim, fieldAt(f, q[0], q[1], q[2]));
      }
      // (HEAD: its front edge 0.010–0.015 off the skin, past the end of the snout)
      expect(rim, `#${seed}`).toBeLessThan(0.002);
    }
  });

  it('shows its teeth along the shut jaw', () => {
    for (const seed of SEEDS) {
      const p = croc(seed);
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as 'fanged', 'hybrid')!;
      const f = surfacePrims(p, 'hybrid');
      const o = spec.node.pos;
      const out = [...b.upperTeeth, ...b.lowerTeeth]
        .map((t) => { const ax = qRotateV(t.quat, [0, 1, 0]); return fieldAt(f, o[0] + t.pos[0] + ax[0] * t.len, o[1] + t.pos[1] + ax[1] * t.len, o[2] + t.pos[2] + ax[2] * t.len); })
        .sort((a, c) => a - c);
      // (HEAD: the median crown tip 0.03–0.045 of the mouth's size off the skin — a hair, invisible in the face
      // close-up; patched 0.064–0.09)
      expect(out[out.length >> 1] / spec.r, `#${seed} median tooth tip off the skin`).toBeGreaterThan(0.055);
    }
  });
});
