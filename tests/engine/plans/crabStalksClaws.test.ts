import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildShellGeometry } from '../../../src/viewer/smoothSkin';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { clawGeometry, clawPlan, wristQuat } from '../../../src/viewer/claw';
import { eyeVariant } from '../../../src/viewer/partStyles';

const SEEDS = [...Array.from({ length: 16 }, (_, i) => i + 1), 37];
const crab = (seed: number) => grow(genomeOfMorphotype(seed, 'crab'));
/** the eye's stalk, root to eye: its limb nodes up from the body */
const stalkOf = (p: Phenotype, eye: number): number[] => {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const chain = [eye];
  for (let i = parent.get(eye)!; p.nodes[i].kind !== 'spine'; i = parent.get(i)!) chain.unshift(i);
  return chain;
};

describe('crab: eyes up on stalks, claws that are claws', () => {
  it("its eyes stand on stalks clear over its shell's crown — not half-buried in the dome", () => {
    // HEAD: half the crabs (seed 37 among them) drew one-link stalks of the length gene's floor, 0.2: the eye's foot
    // 0.14-0.24 under the shell's crown (seed 37: -0.152), a tenth of a unit of stalk between rim and ball.
    // Patched: two links of ≥0.62× the girth, bent up: every eye's foot 0.055-0.12 over the crown.
    for (const seed of SEEDS) {
      const p = crab(seed);
      const shell = buildShellGeometry(p, 'low');
      expect(shell, `#${seed}`).not.toBeNull();
      const pos = shell!.getAttribute('position').array as ArrayLike<number>;
      let crown = -Infinity;
      for (let i = 1; i < pos.length; i += 3) crown = Math.max(crown, pos[i]);
      p.nodes.forEach((e, i) => {
        if (e.terminal !== 'eye') return;
        expect(stalkOf(p, i).length, `#${seed} two stalk links and the eye`).toBeGreaterThanOrEqual(3);
        expect(e.pos[1] - e.radius - crown, `#${seed} the eye's foot over the crown`).toBeGreaterThan(0.03);
      });
    }
  });

  it("its eyes are a crab's: dark compound eyes, not lidded eyeballs", () => {
    for (const seed of SEEDS) {
      const p = crab(seed);
      for (const n of p.nodes) if (n.terminal === 'eye') expect(eyeVariant(n.part?.style ?? 0), `#${seed}`).toBe('compound');
    }
  });

  it("its arm's skin ends inside its claw's flat palm — no round ball on the wrist", () => {
    // HEAD: the arm's last link ran on to the claw node at the claw's own radius, a ball 1.0r across every way about
    // the node — twice the palm's 0.46r half-width — with the flat palm poking out of its front. Patched: ≤ 0.49r.
    for (const seed of SEEDS) {
      const p = crab(seed);
      const f = buildFieldPrims(p, 'hybrid');
      f.k = 0.34 * f.meanR; // (smoothSkin's hybrid blend)
      for (const n of p.nodes) {
        if (n.terminal !== 'pincer') continue;
        const r = n.radius;
        const q = new THREE.Quaternion(...(wristQuat(n.quat, n.pos, r) as [number, number, number, number]));
        for (const v of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)]) {
          const d = v.applyQuaternion(q);
          let k = 0;
          while (k < 2 * r && fieldAt(f, n.pos[0] + d.x * k, n.pos[1] + d.y * k, n.pos[2] + d.z * k) <= 0) k += 0.01 * r;
          expect(k / r, `#${seed} the skin's half-width across the claw at its node`).toBeLessThan(0.6);
        }
        expect(clawPlan(r).palm.r[0], `#${seed}`).toBeLessThan(0.6 * r);
      }
    }
  });

  it("its claw's fingers are toothed along their cutting edges, the teeth meshing in the gape", () => {
    // HEAD: two smooth tubes running to dark points, nothing of them in the gape. Patched: three teeth on the fixed
    // finger and two on the dactyl, alternating, each standing into the gape and short of the other finger.
    const r = 0.2;
    const c = clawPlan(r);
    const n = c.fixed.length;
    const surf = (path: readonly number[][], R: (u: number) => number, z: number, side: number) => {
      let k = 0;
      while (k < n - 2 && path[k + 1][2] < z) k++;
      const t = (z - path[k][2]) / (path[k + 1][2] - path[k][2]);
      return path[k][1] + (path[k + 1][1] - path[k][1]) * t + side * R((k + t) / (n - 1));
    };
    const palmFront = c.palm.c[2] + c.palm.r[2];
    let up = 0, down = 0;
    for (const t of c.teeth) {
      expect(t.tip[2], 'past the palm').toBeGreaterThan(palmFront);
      const floor = surf(c.fixed, c.fixedR, t.tip[2], 1), roof = surf(c.dactyl, c.dactylR, t.tip[2], -1);
      expect(t.tip[1], 'in the gape').toBeGreaterThan(floor);
      expect(t.tip[1], 'in the gape').toBeLessThan(roof);
      if (t.tip[1] > t.root[1]) up++;
      else down++;
    }
    expect(up).toBeGreaterThanOrEqual(3);
    expect(down).toBeGreaterThanOrEqual(2);
    // …and drawn: the dark part reaches into the gape before the points (HEAD: none of it short of the points)
    const g = clawGeometry(r, [0, 0, 0, 1]);
    const a = g.tips.getAttribute('position').array as ArrayLike<number>;
    const zs = new Set<number>();
    for (let i = 0; i < a.length; i += 3) {
      const y = a[i + 1], z = a[i + 2];
      if (z < palmFront || z > c.fixed[Math.round((n - 1) * 0.72)][2] - 0.05 * r) continue;
      if (y > surf(c.fixed, c.fixedR, z, 1) + 0.02 * r && y < surf(c.dactyl, c.dactylR, z, -1) - 0.02 * r) zs.add(Math.round(z / (0.2 * r)));
    }
    expect(zs.size).toBeGreaterThanOrEqual(4);
  });
});
