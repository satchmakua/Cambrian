// (numbers measured with vite-node probes in diag13b/crab/: probe8, probe9, probe10, probe12).
import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildShellGeometry } from '../../../src/viewer/smoothSkin';
import { buildMandibles } from '../../../src/viewer/mouths/mandibles';

const trunk = (p: Phenotype) => p.nodes.find((n) => n.kind === 'spine' && (n.segment ?? 0) === 0)!;
const half = (p: Phenotype) => {
  const t = trunk(p);
  const s = t.scale ?? [1, 1, 1];
  return { t, w: t.radius * s[0], h: t.radius * s[1], l: t.radius * s[2] };
};

describe('crab: a front to its shell', () => {
  it("its eyestalks rise from the shell's front rim, close together over the mouth — not from the dome's shoulders", () => {
    // HEAD: roots at 0.71..0.79 of the half-length, eyes 0.53..0.74 of the half-width out (ensureFace held the
    // gene's 1.05..1.15 elevation to a plain head's 0.75). Patched: roots 0.86+ forward, eyes 0.33..0.51 out.
    for (let seed = 1; seed <= 24; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const { t, w, h, l } = half(p);
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      p.nodes.forEach((e, i) => {
        if (e.terminal !== 'eye' || e.pos[0] <= 0) return;
        let r = i;
        while (p.nodes[parent.get(r)!].kind !== 'spine') r = parent.get(r)!;
        const root = p.nodes[r].pos;
        expect((root[2] - t.pos[2]) / l, `#${seed} rooted on the front rim`).toBeGreaterThan(0.84);
        expect(e.pos[0] / w, `#${seed} close together`).toBeLessThan(0.55);
        expect(e.pos[0] / w, `#${seed} but a pair`).toBeGreaterThan(0.3);
        expect((e.pos[1] - t.pos[1]) / h, `#${seed} up at the shell's top`).toBeGreaterThan(0.8);
      });
    }
  });

  it('its carapace is widest toward the front and its front margin is toothed — not an egg', () => {
    // bearing about the vertical, 0 dead ahead; the outline's normalized reach in 2.5° bins
    for (let seed = 1; seed <= 6; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      if (!p.nodes.some((n) => n.terminal === 'carapace')) continue;
      const { w, l } = half(p);
      const pos = buildShellGeometry(p, 'high')!.getAttribute('position').array as ArrayLike<number>;
      const bins = new Array(73).fill(0);
      for (let i = 0; i < pos.length; i += 3) {
        const th = Math.atan2(Math.abs(pos[i]) / w, pos[i + 2] / l);
        const b = Math.min(72, Math.floor(th / (Math.PI / 72)));
        bins[b] = Math.max(bins[b], Math.hypot(pos[i] / w, pos[i + 2] / l));
      }
      // wider at the front corners (40-62°) than at the back ones (110-132°): HEAD 1.00, patched ~1.10
      const front = Math.max(...bins.slice(16, 25));
      const rear = Math.max(...bins.slice(44, 53));
      expect(front / rear, `#${seed} broad in front`).toBeGreaterThan(1.05);
      // teeth: prominent local maxima along the anterolateral margin (22-75°): HEAD 0, patched 4
      let teeth = 0;
      for (let b = 9; b < 30; b++)
        if (bins[b] > bins[b - 1] && bins[b] >= bins[b + 1] && bins[b] - Math.min(...bins.slice(b - 3, b + 4)) > 0.015) teeth++;
      expect(teeth, `#${seed} teeth`).toBeGreaterThanOrEqual(3);
    }
  });

  it("its mouthparts fold under the shell's front — not jaws reached out ahead of it (a handle from above)", () => {
    // HEAD: blade tips up to 0.43 of the half-length ahead of the shell's front; patched ≤ 0.06
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const { t, l } = half(p);
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const o = p.nodes[mi].pos;
      const built = buildMandibles(p, mi, [], false)!;
      for (const path of built.bladePaths)
        for (const q of path) expect((q[2] + o[2] - (t.pos[2] + l)) / l, `#${seed}`).toBeLessThan(0.15);
    }
  });

  it("its walking legs reach under twice its body's half-width — not a sun of rays", () => {
    // HEAD: up to 2.05 half-widths; patched (legLen 0.5..0.6) up to 1.91
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const { w } = half(p);
      for (const f of p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg'))
        expect(Math.abs(f.pos[0]) / w, `#${seed}`).toBeLessThan(1.95);
    }
  });
});
