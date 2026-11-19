import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type BodyNode, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { qRotateV } from '../../../src/viewer/bodyField';
import { mouthSpec } from '../../../src/viewer/mouthLine';
import { buildJawed, type JawedVariant } from '../../../src/viewer/mouths/jawed';
import { drawnSkin } from '../../../src/viewer/smoothSkin';
import { fangGeometry } from '../../../src/viewer/teeth';

// The fourteenth look's theropod: "the snout a blunt rounded box with the mouth drawn as a raised lip ring all
// around it, the teeth hanging like a fringe outside the ring at the corners: a muppet or hippo mouth", and "the
// forelimbs long and thick, hanging down to around knee level".

const theropod = (seed: number) => grow(genomeOfMorphotype(seed, 'biped'));
const ry = (n: BodyNode) => n.radius * (n.scale?.[1] ?? 1);
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** the mouth as the Studio draws it: the hybrid skin at high quality, the band split as mouths/index.tsx splits it */
function mouthOf(p: Phenotype) {
  const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  const spec = mouthSpec(p, idx)!;
  const style = p.nodes[idx].part?.style ?? 0;
  const variant = (spec.variant === 'fanged' && style >= 0.22 ? 'underbite' : spec.variant) as JawedVariant;
  const b = buildJawed(p, idx, [], false, variant, 'hybrid', 'high')!;
  return { spec, b, drawn: drawnSkin(p, true, [], 'high') };
}

describe("the theropod's shut mouth", () => {
  it('is a seam on its jaw as drawn, its blades hung straight from it: no lip under it, no roots standing above it', () => {
    const fang = fangGeometry();
    const fp = fang.getAttribute('position');
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), v = new THREE.Vector3();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 37]) {
      const p = theropod(seed);
      const { spec, b, drawn } = mouthOf(p);
      const o = spec.node.pos;
      const up = qRotateV(spec.anchor.quat, [0, 1, 0]);
      const out = (x: readonly number[]) => drawn.field(x[0] + o[0], x[1] + o[1], x[2] + o[2]);
      // no skin fold drawn over the teeth (it lay under the seam, a lower lip ring round the snout)
      expect(b.fold, `#${seed} fold`).toBe(false);
      // the seam lies on the skin as drawn (HEAD: up to 0.06 of the mouth's size off it at high quality, 0.14 at low)
      let off = 0;
      for (const sm of b.upper) off = Math.max(off, out(sm.p));
      expect(off / b.r, `#${seed} seam off the drawn jaw`).toBeLessThan(0.03);
      // every blade hangs from the seam: none of a tooth stands above the seam, outside the skin, by more than the
      // seam's own width (HEAD: their broad roots stood a fifth of the mouth's size above it)
      const seamAt = (x: readonly number[]) => b.upper.reduce((a, c) => (Math.hypot(c.p[0] - x[0], c.p[1] - x[1], c.p[2] - x[2]) < Math.hypot(a.p[0] - x[0], a.p[1] - x[1], a.p[2] - x[2]) ? c : a));
      let rootUp = 0, shown = 0;
      expect(b.upperTeeth.length, `#${seed} blades`).toBeGreaterThanOrEqual(8);
      for (const tooth of b.upperTeeth) {
        q.set(tooth.quat[0], tooth.quat[1], tooth.quat[2], tooth.quat[3]);
        s.set(tooth.w * 2, tooth.len, tooth.w * 2);
        t.set(tooth.pos[0], tooth.pos[1], tooth.pos[2]);
        m.compose(t, q, s);
        for (let i = 0; i < fp.count; i++) {
          v.set(fp.getX(i), fp.getY(i), fp.getZ(i)).applyMatrix4(m);
          const x = [v.x, v.y, v.z];
          const sm = seamAt(x);
          const h = dot([x[0] - sm.p[0], x[1] - sm.p[1], x[2] - sm.p[2]], up);
          if (h > 0 && out(x) > 0) rootUp = Math.max(rootUp, h);
        }
        const Y = qRotateV(tooth.quat, [0, 1, 0]);
        let k = 0;
        for (let j = 1; j <= 24; j++) if (out([tooth.pos[0] + (Y[0] * tooth.len * j) / 24, tooth.pos[1] + (Y[1] * tooth.len * j) / 24, tooth.pos[2] + (Y[2] * tooth.len * j) / 24]) > 0) k++;
        shown += k / 24;
      }
      expect(rootUp / b.r, `#${seed} roots above the seam`).toBeLessThan(0.09);
      expect(shown / b.upperTeeth.length, `#${seed} crowns showing`).toBeGreaterThan(0.78);
    }
  });
});

describe("the theropod's small arms", () => {
  it('are slim and fold at the elbow: the upper arm down along the chest, the forearm forward, the hand up under the chest', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const p = theropod(seed);
      const [root, elbow, hand] = p.nodes.filter((n) => n.part?.kind === 'arm' && n.pos[0] > 0);
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
      const chest = trunk[trunk.length - 1];
      const upper = [0, 1, 2].map((k) => elbow.pos[k] - root.pos[k]);
      const fore = [0, 1, 2].map((k) => hand.pos[k] - elbow.pos[k]);
      const pitch = (d: number[]) => Math.atan2(d[1], Math.hypot(d[0], d[2]));
      const bend = Math.acos(dot(upper, fore) / (Math.hypot(...upper) * Math.hypot(...fore)));
      // (HEAD: one gentle arc down and forward — the forearm 57–71° below level, bent 0.2–0.3 rad from the upper arm)
      expect(pitch(upper), `#${seed} upper arm down`).toBeLessThan(-0.5);
      expect(pitch(fore), `#${seed} forearm held forward`).toBeGreaterThan(-0.2);
      expect(bend, `#${seed} elbow`).toBeGreaterThan(0.7);
      // the hand held up under the chest (HEAD: at or below its underside)
      expect(hand.pos[1] - (chest.pos[1] - ry(chest)), `#${seed} hand up`).toBeGreaterThan(0.05);
      // slim: the arm's root under a fifth of the chest's radius (HEAD: 0.19–0.23 of it, as thick as the shank)
      expect(root.radius / chest.radius, `#${seed} slim`).toBeLessThan(0.2);
    }
  });
});
