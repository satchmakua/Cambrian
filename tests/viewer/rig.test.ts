import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { rigTemplate, createRig, ensureSkinWeights, poseRig } from '../../src/viewer/rig';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';

const p = (kind: string, seed = 11) => grow(genomeOfMorphotype(seed, kind));

function footWorld(r: ReturnType<typeof createRig>, i: number): THREE.Vector3 {
  r.root.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(r.bones[i].matrixWorld);
}

describe('animation rig', () => {
  it('one bone per node, parented like the growth edges, resting exactly on the nodes', () => {
    const ph = p('felid');
    const r = createRig(ph);
    expect(r.bones.length).toBe(ph.nodes.length);
    expect(r.skeleton.bones.length).toBe(ph.nodes.length + 1); // + the synthetic root
    r.root.updateMatrixWorld(true);
    ph.nodes.forEach((n, i) => {
      const w = new THREE.Vector3().setFromMatrixPosition(r.bones[i].matrixWorld);
      expect(w.distanceTo(new THREE.Vector3(...n.pos))).toBeLessThan(1e-6);
    });
  });

  it('gait phases: a quadruped trots (diagonals together), a biped alternates, a hexapod uses tripods', () => {
    const quad = rigTemplate(p('ungulate'));
    expect(quad.legs.length).toBe(4);
    const byKey = (pair: number, side: number) => quad.legs.find((l) => l.pair === pair && l.side === side)!.offset;
    expect(byKey(0, 1)).toBe(byKey(1, -1)); // front-right with hind-left
    expect(byKey(0, -1)).toBe(byKey(1, 1));
    expect(byKey(0, 1)).not.toBe(byKey(0, -1));
    const bip = rigTemplate(p('ratite'));
    expect(new Set(bip.legs.map((l) => l.offset)).size).toBe(2);
    const hex = rigTemplate(p('insectoid'));
    const sideA = hex.legs.filter((l) => l.offset === 0).length;
    expect(sideA).toBe(hex.legs.length / 2);
  });

  it('skin weights: every vertex rides ≤4 bones with weights summing to 1', () => {
    const ph = p('canid');
    const geo = buildSmoothGeometry(ph, true, [], 'low');
    ensureSkinWeights(geo, ph);
    const si = geo.getAttribute('skinIndex');
    const sw = geo.getAttribute('skinWeight');
    expect(si.count).toBe(geo.getAttribute('position').count);
    for (let v = 0; v < sw.count; v++) {
      const sum = sw.getX(v) + sw.getY(v) + sw.getZ(v) + sw.getW(v);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-4);
      for (const k of [si.getX(v), si.getY(v), si.getZ(v), si.getW(v)]) expect(k).toBeLessThanOrEqual(ph.nodes.length);
    }
  });

  it('walking swings the feet, sleeping folds them; every pose stays finite', () => {
    const ph = p('felid');
    const r = createRig(ph);
    const T = r.template;
    const foot = T.legs[0].nodes[T.legs[0].nodes.length - 1];
    const rest = footWorld(r, foot);
    poseRig(r, { dt: 0.25, speed: 2, cruise: 3, sleep: 0, eat: 0, swim: false, turn: 0 });
    const step = footWorld(r, foot);
    expect(step.distanceTo(rest)).toBeGreaterThan(0.02);
    poseRig(r, { dt: 0, speed: 0, cruise: 3, sleep: 1, eat: 0, swim: false, turn: 0 });
    const curled = footWorld(r, foot);
    expect(curled.distanceTo(rest)).toBeGreaterThan(0.02);
    for (const b of r.bones) for (const c of b.quaternion.toArray()) expect(Number.isFinite(c)).toBe(true);
  });
});
