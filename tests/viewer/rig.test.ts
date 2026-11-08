import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { rigTemplate, createRig, ensureSkinWeights, poseRig, poseDead, gaitAmplitude } from '../../src/viewer/rig';
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

  it('a walk takes short steps and a run reaches out — and the planted foot keeps pace either way', () => {
    // (at the full ±0.42 rad swing whatever the speed, a walking cat swung its legs like a galloping
    // one)
    const cruise = 4;
    const walk = gaitAmplitude(cruise * 0.55, cruise);
    const run = gaitAmplitude(cruise * 1.7, cruise);
    expect(walk).toBeLessThan(0.3);
    expect(run).toBeCloseTo(0.42, 6);
    expect(gaitAmplitude(0, cruise)).toBeGreaterThan(0.1);
    // over one stance (half a cycle) the body moves half a stride while the hip swings the foot back
    // through 2·sin(amp)·leg: the same distance at a walk as at a run, so the foot never skates
    const ph = p('felid');
    const r = createRig(ph);
    const T = r.template;
    for (const speed of [cruise * 0.55, cruise * 1.7]) {
      const before = r.phase;
      poseRig(r, { dt: 0.01, speed, cruise, sleep: 0, eat: 0, swim: false, turn: 0 });
      const cyclesPerUnit = (((r.phase - before + 1) % 1) / 0.01) / speed; // cycles per distance
      const strideNow = 1 / cyclesPerUnit;
      const amp = gaitAmplitude(speed, cruise);
      expect(strideNow / Math.sin(amp)).toBeCloseTo(T.stride / Math.sin(0.42), 3);
    }
  });

  it('asleep, a quadruped lies on its belly with its legs folded — not standing with its feet in the air', () => {
    for (const id of ['felid', 'canid', 'ursid', 'ungulate']) {
      for (let seed = 1; seed <= 4; seed++) {
        const ph = p(id, seed);
        const r = createRig(ph);
        const T = r.template;
        expect(T.belly, `${id} #${seed}`).toBeGreaterThan(0);
        poseRig(r, { dt: 0, speed: 0, cruise: 1, sleep: 1, eat: 0, swim: false, turn: 0 });
        const ground = Math.min(...T.legs.map((l) => ph.nodes[l.nodes[l.nodes.length - 1]].pos[1] - ph.nodes[l.nodes[l.nodes.length - 1]].radius));
        const drop = T.belly * 0.95; // what the World and the Studio lower a sleeper by
        // the belly comes down to the floor…
        const under = Math.min(...T.trunk.map((i) => ph.nodes[i].pos[1] - ph.nodes[i].radius * (ph.nodes[i].scale?.[1] ?? 1)));
        expect(under - drop - ground, `${id} #${seed}`).toBeLessThan(0.1 * T.belly + 0.02);
        // …and the folded legs stay near it rather than driving deep through it
        for (const l of T.legs) {
          for (const i of l.nodes) {
            const w = footWorld(r, i);
            expect(w.y - drop - ph.nodes[i].radius - ground, `${id} #${seed}`).toBeGreaterThan(-0.35 * T.belly);
          }
          // a foreleg reaches forward along the ground (the sphinx); a hind leg folds up beside the belly
          const foot = footWorld(r, l.nodes[l.nodes.length - 1]);
          const hip = ph.nodes[l.nodes[0]].pos;
          if (l.fore) expect(foot.z, `${id} #${seed} fore`).toBeGreaterThan(hip[2]);
        }
      }
    }
  });

  it('at a run a quadruped gallops: forelegs together, hind legs half a cycle behind, the back flexing', () => {
    const ph = p('canid');
    const T = rigTemplate(ph);
    expect(T.gallops).toBe(true);
    const leg = (pair: number, side: number) => T.legs.find((l) => l.pair === pair && l.side === side)!;
    const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
    // the trot pairs the diagonals; the gallop pairs the fore and the hind legs
    expect(gap(leg(0, 1).gallop, leg(0, -1).gallop)).toBeLessThan(0.15);
    expect(gap(leg(1, 1).gallop, leg(1, -1).gallop)).toBeLessThan(0.15);
    expect(gap(leg(0, -1).gallop, leg(1, -1).gallop)).toBeCloseTo(0.5, 6);
    // and the back only flexes at a run
    const backAt = (speed: number) => {
      const r = createRig(ph);
      let most = 0;
      for (let i = 0; i < 40; i++) {
        poseRig(r, { dt: 0.03, speed, cruise: 4, sleep: 0, eat: 0, swim: false, turn: 0 });
        for (const k of r.template.trunk) most = Math.max(most, Math.abs(new THREE.Euler().setFromQuaternion(r.bones[k].quaternion).x));
      }
      return most;
    };
    expect(backAt(2)).toBeLessThan(1e-6);
    expect(backAt(7)).toBeGreaterThan(0.1);
    // neither spiders nor birds gallop
    expect(rigTemplate(p('arachnid')).gallops).toBe(false);
    expect(rigTemplate(p('bird')).gallops).toBe(false);
  });

  it('a carcass goes limp: legs half-flexed, the neck sagging — not the standing pose knocked over', () => {
    const ph = p('canid');
    const r = createRig(ph);
    poseDead(r);
    const pitch = (i: number) => new THREE.Euler().setFromQuaternion(r.bones[i].quaternion).x;
    for (const L of r.template.legs) expect(pitch(L.nodes[1]), 'knee').toBeGreaterThan(0.2);
    expect(pitch(r.template.neck[0])).toBeGreaterThan(0.3);
    // and it's a pose, not an animation: posing again changes nothing
    const before = r.bones.map((b) => b.quaternion.clone());
    poseDead(r);
    r.bones.forEach((b, i) => expect(b.quaternion.angleTo(before[i])).toBeLessThan(1e-6));
  });
});

