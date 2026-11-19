import { describe, it, expect } from 'vitest';
import { grow, type BodyNode } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { surfacePrims, mouthSpec } from '../../../src/viewer/mouthLine';
import { rayToSurface, projectToSurface } from '../../../src/viewer/bodyField';
import { buildJawed } from '../../../src/viewer/mouths/jawed';
import { gillCoverFlap, gillRadiusOf, COVER_FLAP } from '../../../src/viewer/gills';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const ry = (n: BodyNode) => n.radius * (n.scale?.[1] ?? 1);

function fishHead(seed: number) {
  const p = grow(genomeOfMorphotype(seed, 'fish'));
  const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
  const S = surfacePrims(p, 'hybrid');
  const tip = head[head.length - 1];
  const front = rayToSurface(S, [], [0, tip.pos[1], head[1].pos[2]], [0, 0, 1])!.p[2];
  return { p, head, S, tip, front };
}

describe("a bony fish's head", () => {
  it('comes to a pointed snout, not a round dome', () => {
    // half-depth a tenth of the head's length behind its front: HEAD 0.31–0.38 × the head's depth, patched 0.22–0.25
    for (const seed of SEEDS) {
      const { head, S, tip, front } = fishHead(seed);
      const z = front - 0.1 * (front - head[0].pos[2]);
      const top = rayToSurface(S, [], [0, tip.pos[1], z], [0, 1, 0])!;
      expect((top.p[1] - tip.pos[1]) / ry(head[0]), `#${seed}`).toBeLessThan(0.29);
    }
  });

  it('has a lower jaw: its chin stands under and a little ahead of the upper snout', () => {
    // the furthest-forward point of the head's front: HEAD at the snout's axis (dy 0), patched 0.11–0.12 × the
    // head's depth below it
    for (const seed of SEEDS) {
      const { head, S, tip } = fishHead(seed);
      let best = -Infinity;
      let bestDy = 0;
      for (let dy = -0.5; dy <= 0.2; dy += 0.01) {
        const h = rayToSurface(S, [], [0, tip.pos[1] + dy * ry(head[0]), head[1].pos[2]], [0, 0, 1]);
        if (h && h.p[2] > best) {
          best = h.p[2];
          bestDy = dy;
        }
      }
      expect(bestDy, `#${seed}`).toBeLessThan(-0.06);
    }
  });

  it("its gape runs back from the snout's point to under the front of its eye", () => {
    // the seam's rearmost point, in eye radii ahead of the eye's centre: HEAD 1.1–2.4, patched 0.17–0.31
    for (const seed of SEEDS) {
      const { p } = fishHead(seed);
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      expect(mouthSpec(p, idx)).not.toBeNull();
      const b = buildJawed(p, idx, [], false, 'maw', 'hybrid')!;
      const o = p.nodes[idx].pos;
      const eye = p.nodes.find((n) => n.terminal === 'eye' && n.pos[0] > 0)!;
      const corner = b.upper.reduce((m, s) => (s.p[2] < m.p[2] ? s : m), b.upper[0]);
      const ahead = (corner.p[2] + o[2] - eye.pos[2]) / eye.radius;
      expect(ahead, `#${seed}`).toBeLessThan(0.6);
      expect(ahead, `#${seed}`).toBeGreaterThan(-0.6);
      expect(corner.p[1] + o[1], `#${seed}: below the eye`).toBeLessThan(eye.pos[1] - eye.radius);
      expect(b.upperTeeth.length + b.lowerTeeth.length, `#${seed}: no teeth on show`).toBe(0);
    }
  });

  it('its gill cover is a plate whose rear edge stands proud of the skin', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const { p, S } = fishHead(seed);
      const gi = p.nodes.findIndex((n) => n.part?.kind === 'gill');
      if (gi < 0) continue;
      checked++;
      const r = gillRadiusOf(p, gi, 'cover', Math.max(p.nodes[gi].radius, 0.06));
      const { flap } = gillCoverFlap(p, gi, 'hybrid', r);
      const pos = flap.getAttribute('position');
      const o = p.nodes[gi].pos;
      const R = pos.count / COVER_FLAP.cols;
      const height = (i: number) => {
        const q: [number, number, number] = [pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]];
        const s = projectToSurface(S, [], q);
        return (q[0] - s.p[0]) * s.n[0] + (q[1] - s.p[1]) * s.n[1] + (q[2] - s.p[2]) * s.n[2];
      };
      const mid = Math.floor(COVER_FLAP.cols / 2) * R;
      expect(height(mid + 4) / r, `#${seed}: the rim`).toBeGreaterThan(0.08);
      expect(height(mid), `#${seed}: its front flush`).toBeLessThanOrEqual(0.001);
      expect(height(mid + R - 1), `#${seed}: the skin behind it`).toBeLessThanOrEqual(0.001);
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("its tail stalk flattens side to side into the fin (a shark's is left as it was)", () => {
    for (const seed of SEEDS) {
      const tails = grow(genomeOfMorphotype(seed, 'fish')).nodes.filter((n) => n.part?.kind === 'tail');
      expect(tails[tails.length - 1].scale?.[0] ?? 1, `fish #${seed}`).toBeLessThanOrEqual(0.5);
      const shark = grow(genomeOfMorphotype(seed, 'shark')).nodes.filter((n) => n.part?.kind === 'tail');
      for (const n of shark) expect(n.scale?.[0] ?? 1, `shark #${seed}`).toBe(1);
    }
  });
});
