import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CHELA_GAP, CLAW_REACH, clawPlan, clawGeometry, wristQuat } from '../../src/viewer/claw';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';

describe('crab claw', () => {
  it('a swollen palm with two fingers that close on each other, the hinged one above', () => {
    const r = 0.2;
    const c = clawPlan(r);
    const fTip = c.fixed[c.fixed.length - 1];
    const dTip = c.dactyl[c.dactyl.length - 1];
    // both fingers run on well past the palm
    const palmFront = c.palm.c[2] + c.palm.r[2];
    expect(fTip[2]).toBeGreaterThan(palmFront + r);
    expect(dTip[2]).toBeGreaterThan(palmFront + r);
    // the dactyl rides above the fixed finger all along, and they close to a narrow gape at the tips
    for (let k = 0; k < c.fixed.length; k++) expect(c.dactyl[k][1]).toBeGreaterThan(c.fixed[k][1]);
    const gapRoot = c.dactyl[0][1] - c.fixed[0][1];
    const gapTip = dTip[1] - fTip[1];
    expect(gapTip).toBeLessThan(0.4 * gapRoot);
    expect(gapTip - c.dactylR(1) - c.fixedR(1)).toBeGreaterThan(0); // never through each other
    // the palm is the bulk: deeper than either finger's root
    expect(c.palm.r[1]).toBeGreaterThan(2 * c.fixedR(0));
  });

  it('the fingers are as long as the palm, with daylight between them from the palm to their points', () => {
    // (two short spikes on the front of a long bulb, half buried in it: the claw read as a
    // sharpened crayon — it is the notch between the fingers that says "pincer")
    const r = 0.2;
    const c = clawPlan(r);
    const n = c.fixed.length;
    const palmFront = c.palm.c[2] + c.palm.r[2];
    const palmLong = 2 * c.palm.r[2];
    expect(c.fixed[n - 1][2] - palmFront).toBeGreaterThan(0.7 * palmLong);
    expect(c.dactyl[n - 1][2] - palmFront).toBeGreaterThan(0.7 * palmLong);
    // each finger half the palm's depth at its root
    expect(c.fixedR(0)).toBeGreaterThan(0.4 * c.palm.r[1]);
    expect(c.dactylR(0)).toBeGreaterThan(0.38 * c.palm.r[1]);
    // the gape: clear between the fingers' surfaces at every sample past the palm's front
    let widest = 0;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1);
      if (c.fixed[k][2] < palmFront) continue;
      const gape = c.dactyl[k][1] - c.dactylR(u) - (c.fixed[k][1] + c.fixedR(u));
      expect(gape, `sample ${k}`).toBeGreaterThan(0);
      widest = Math.max(widest, gape);
    }
    expect(widest).toBeGreaterThan(0.25 * r);
  });

  it('is shaded smooth: one welded surface, not a soup of flat tiles', () => {
    // (merged as loose triangles, every triangle took its own normal: a faceted ball on a smooth animal)
    const g = clawGeometry(0.2, [0, 0, 0, 1]);
    for (const geo of [g.shell, g.tips]) {
      expect(geo.index).not.toBeNull();
      const tris = geo.index!.count / 3;
      expect(geo.getAttribute('position').count).toBeLessThan(tris); // (a soup has three vertices a triangle)
      const nrm = geo.getAttribute('normal');
      expect(nrm.count).toBe(geo.getAttribute('position').count);
    }
    // the palm's normals turn smoothly: neighbouring vertices of a triangle never face far apart
    const idx = g.shell.index!;
    const nrm = g.shell.getAttribute('normal');
    let sharp = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1);
      const dot = nrm.getX(a) * nrm.getX(b) + nrm.getY(a) * nrm.getY(b) + nrm.getZ(a) * nrm.getZ(b);
      if (dot < 0.3) sharp++;
    }
    expect(sharp / (idx.count / 3)).toBeLessThan(0.05);
  });

  it('builds finite geometry turned into the node frame', () => {
    const q = [0, Math.sin(0.4), 0, Math.cos(0.4)];
    const g = clawGeometry(0.2, q);
    for (const geo of [g.shell, g.tips]) {
      const a = geo.getAttribute('position').array as ArrayLike<number>;
      expect(a.length).toBeGreaterThan(90);
      for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true);
    }
    // turned: the claw points along the rotated +Z (yaw 0.8 rad → +X and +Z)
    g.tips.computeBoundingBox();
    const bb = g.tips.boundingBox!;
    expect(bb.max.x).toBeGreaterThan(0.3);
    expect(bb.max.z).toBeGreaterThan(0.3);
  });

  it("a crab's claws are folded in across its face, their points short of each other", () => {
    // (the arm curled in until the claws' fingers crossed in an X before the face; uncurled, they ran
    // out ahead side by side like a lobster's)
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const claws = p.nodes.filter((n) => n.terminal === 'pincer' && n.part?.kind === 'arm');
      expect(claws.length, `crab #${seed}`).toBe(2);
      for (const n of claws) {
        const r = n.radius;
        const q = new THREE.Quaternion(...(wristQuat(n.quat, n.pos, r) as [number, number, number, number]));
        const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const tip = n.pos[0] + aim.x * CLAW_REACH * r;
        // on its own side of the midline, by the gap…
        expect(tip * Math.sign(n.pos[0]), `crab #${seed}`).toBeGreaterThan(CHELA_GAP * r * 0.99);
        // …pointing in across the face, 20° or more off straight ahead, and still forward
        const inward = -Math.sign(n.pos[0]) * Math.atan2(aim.x, aim.z);
        expect(inward, `crab #${seed}`).toBeGreaterThan(0.35);
        expect(aim.z, `crab #${seed}`).toBeGreaterThan(0);
      }
      // and the arm is slim beside its claw: the palm stands half again the arm's girth
      for (const n of claws) {
        const i = p.nodes.indexOf(n);
        const wrist = p.nodes[p.edges.find(([, b]) => b === i)![0]];
        expect(clawPlan(n.radius).palm.r[1], `crab #${seed}`).toBeGreaterThan(1.5 * wrist.radius);
      }
    }
  });

  it('an unpaired claw on the midline keeps its aim', () => {
    const q = [0, 0.2, 0, Math.sqrt(1 - 0.04)];
    expect(wristQuat(q, [0, 0.3, 1], 0.2)).toEqual(q);
  });
});
