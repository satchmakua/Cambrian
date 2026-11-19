import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildShellGeometry, shellScutes, SHELL_SCUTES } from '../../src/viewer/smoothSkin';
import { toedFootGeometry } from '../../src/viewer/feet';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const turtle = (seed: number) => grow(genomeOfMorphotype(seed, 'chelonian'));
function shellOf(p: Phenotype): THREE.BufferGeometry {
  const g = buildShellGeometry(p, 'low')!;
  g.computeBoundingBox();
  return g;
}

describe("a tortoise's look", () => {
  it('carries its head out of its shell on a neck, slimmer than the head', () => {
    // (two links of a neck as thick as the head, the first of them under the shell's front: the head a
    // ball pushed against the shell, no neck to be seen)
    for (const seed of SEEDS) {
      const p = turtle(seed);
      const neck = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 2);
      const g = shellOf(p);
      const pos = g.getAttribute('position');
      let front = -Infinity;
      for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getX(v)) < 0.15) front = Math.max(front, pos.getZ(v));
      g.dispose();
      const back = head[0].pos[2] - head[0].radius;
      expect(back - front, `#${seed} neck out of the shell`).toBeGreaterThan(0.3);
      expect(neck[neck.length - 1].radius / head[0].radius, `#${seed} a neck, not a second head`).toBeLessThan(0.68);
    }
  });

  it("stands on an elephant's foot: a column flaring to a flat round sole, nails at its front edge", () => {
    // (five toes of two knuckle-balls each round a ball of a pad: a pile of grapes, claws poking out)
    const r = 0.2;
    const floor = -r;
    const { toes, claws } = toedFootGeometry('stump', r, 0.25);
    const pos = toes.getAttribute('position');
    let reach = 0;
    let high = 0;
    for (let i = 0; i < pos.count; i++) {
      const h = Math.hypot(pos.getX(i), pos.getZ(i));
      reach = Math.max(reach, h);
      if (pos.getY(i) > floor + 0.5 * r) high = Math.max(high, h);
    }
    expect(reach / r, 'no toe out past the sole').toBeLessThan(1.32);
    expect(high / r, 'a column, no knobs round it').toBeLessThan(1.2);
    // the nails come down to the ground
    const cp = claws.getAttribute('position');
    let low = Infinity;
    for (let i = 0; i < cp.count; i++) low = Math.min(low, cp.getY(i));
    expect((low - floor) / r, 'nails to the ground').toBeLessThan(0.05);
    toes.dispose();
    claws.dispose();
  });

  it('wears a domed shell: highest over the middle of its back, its sides sloping in to the crown', () => {
    // (the trunk's flat back and straight flanks showed through an even thickness: a flat-topped loaf
    // with upright walls)
    let taper = 0;
    for (const seed of SEEDS) {
      const g = shellOf(turtle(seed));
      const b = g.boundingBox!;
      const pos = g.getAttribute('position');
      const H = b.max.y - b.min.y, zc = (b.max.z + b.min.z) / 2, hz = (b.max.z - b.min.z) / 2, W = b.max.x - b.min.x;
      const halfW = (f: number) => {
        let w = 0;
        const y = b.min.y + f * H;
        for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getY(v) - y) < 0.06 * H && Math.abs(pos.getZ(v) - zc) < 0.25 * hz) w = Math.max(w, Math.abs(pos.getX(v)));
        return w;
      };
      const topAt = (f: number) => {
        let t = -Infinity;
        const z = zc + f * hz;
        for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getZ(v) - z) < 0.06 * hz && Math.abs(pos.getX(v)) < 0.15 * W) t = Math.max(t, pos.getY(v));
        return t;
      };
      // side-on, it arches: well down from its crown a little way fore and aft of the middle
      expect((topAt(0) - Math.max(topAt(0.6), topAt(-0.6))) / H, `#${seed} arched`).toBeGreaterThan(0.09);
      taper += halfW(0.8) / halfW(0.3) / SEEDS.length;
      g.dispose();
    }
    // end-on, its sides lean in: high up it is well narrower than low down
    expect(taper, 'domed in section').toBeLessThan(0.7);
  });

  it('its marginal scutes are a band round the rim, not ribs up its flanks', () => {
    // (seated on the crown, the costals left the marginals the whole wall below them: tall thin cells, their
    // seams dark stripes up the shell's sides like a pumpkin's)
    const first = SHELL_SCUTES.vertebral + 2 * SHELL_SCUTES.costal;
    for (const seed of SEEDS) {
      const p = turtle(seed);
      const c = shellScutes(p)!;
      const g = shellOf(p);
      const b = g.boundingBox!;
      const pos = g.getAttribute('position');
      const zc = (b.max.z + b.min.z) / 2, hz = (b.max.z - b.min.z) / 2, H = b.max.y - b.min.y;
      let reach = 0;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
        if (Math.abs(z - zc) > hz / 3 || Math.abs(x) < 0.3 * b.max.x) continue;
        let best = Infinity, k = -1;
        for (let i = 0; i < c.length / 3; i++) {
          const d = Math.hypot(x - c[3 * i], y - c[3 * i + 1], z - c[3 * i + 2]);
          if (d < best) {
            best = d;
            k = i;
          }
        }
        if (k >= first) reach = Math.max(reach, (y - b.min.y) / H);
      }
      expect(reach, `#${seed} the marginals a low band`).toBeLessThan(0.5);
      g.dispose();
    }
  });
});
