import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../../src/engine/random';
import { nearestKinds } from '../../../src/engine/morphospace';
import { LONG_WING, longWingFold } from '../../../src/viewer/wings';
import { TALONED, lastLinkOf, toedFootGeometry } from '../../../src/viewer/feet';
import { BROW_TILT, eyeTilt } from '../../../src/viewer/eyeSeat';
import { createRig, flightLevel, poseRig, trunkRise } from '../../../src/viewer/rig';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const hawk = (seed: number) => grow(genomeOfMorphotype(seed, 'raptor'));
const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
const feetOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
const groundOf = (p: Phenotype) => Math.min(...feetOf(p).map((n) => n.pos[1] - n.radius));
const partGene = (seed: number, id: string, kind: string) => genomeOfMorphotype(seed, id).body.appendages.find((a) => a.kind === kind);

describe('the raptor plan', () => {
  it('stands tall: the trunk rises steeply from rump to shoulders and carries the head over the feet', () => {
    // (leaning forward at a songbird's 0.2–0.4 rad, its head pushed out half its height ahead of
    // its feet, a hawk was a plump pigeon in brown)
    for (const seed of SEEDS) {
      const p = hawk(seed);
      const t = trunkOf(p);
      expect(t.length, `#${seed} links`).toBe(4);
      const rise = Math.atan2(t[3].pos[1] - t[0].pos[1], t[3].pos[2] - t[0].pos[2]);
      expect(rise, `#${seed} rise`).toBeGreaterThan(0.55);
      expect(rise, `#${seed} rise`).toBeLessThan(0.72);
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const tall = Math.max(...spine.map((n) => n.pos[1] + n.radius * (n.scale?.[1] ?? 1))) - groundOf(p);
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      const footZ = Math.max(...feetOf(p).map((n) => n.pos[2]));
      expect((mouth.pos[2] - footZ) / tall, `#${seed} bill ahead of the feet`).toBeLessThan(0.47);
      // …on its legs, mind: they still stand under the body, not behind it
      expect((mouth.pos[2] - footZ) / tall, `#${seed} feet under the body`).toBeGreaterThan(0.2);
    }
  });

  it('has a flat-crowned head sloping to the bill, and scowls: its eyes are tilted under a brow', () => {
    // (a round dome with round, level, wide-open eyes was a dove's head)
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'raptor');
      let head = g.body;
      while (head.child) head = head.child;
      expect(head.size[1] / head.size[0], `#${seed} crown`).toBeLessThan(0.9);
      expect(head.repeat, `#${seed} cranium and face`).toBe(2);
      expect(head.taper, `#${seed} slope`).toBeLessThan(0.86);
      expect(head.appendages.some((a) => a.kind === 'crest'), `#${seed} no crest`).toBe(false);
      const p = grow(g);
      for (const e of p.nodes.filter((n) => n.terminal === 'eye')) expect(eyeTilt(e.quat), `#${seed} tilt`).toBeGreaterThan(BROW_TILT + 0.15);
    }
  });

  it('carries a head well under its chest on a neck narrower still — not a gourd on a pear', () => {
    // (its neck was thicker than its head, 0.7–0.8 of the chest's girth under a head of 0.64–0.74: the
    // head flowed into the body unbroken, a gourd on a pear — from the front a bowling pin, a parrot)
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'raptor');
      const neck = g.body.child!;
      let head = neck;
      while (head.child) head = head.child;
      expect(head, `#${seed} has a neck`).not.toBe(neck);
      expect(neck.size[0], `#${seed} neck under the head`).toBeLessThan(0.95 * head.size[0]);
      expect(head.size[0], `#${seed} head under the chest`).toBeLessThan(0.75 * g.body.size[0]);
    }
  });

  it('only a hawk and the dragons scowl: every other face keeps its level, browless eyes', () => {
    for (const id of MORPHOTYPE_IDS) {
      if (id === 'raptor' || id === 'dragon' || id === 'wyvern') continue;
      for (let seed = 1; seed <= 8; seed++) {
        const g = genomeOfMorphotype(seed, id);
        if (g.symmetry !== 'bilateral') continue; // (a brow is only ever drawn on a bilateral face…
        const p = grow(g);
        p.edges.forEach(([a, b]) => {
          // …over an eye set in the skull, not one up a stalk)
          if (p.nodes[b].terminal !== 'eye' || p.nodes[a].kind !== 'spine') return;
          expect(eyeTilt(p.nodes[b].quat), `${id} #${seed}`).toBeLessThan(1e-3);
        });
      }
    }
  });

  it('folds long wings down the line of its back, their tips over the tail', () => {
    // (the songbird's short leaf lay level along the flank from mid-trunk: on an upright body it
    // stuck out behind like a shelf, well above the tail it should have covered)
    for (const seed of SEEDS) {
      expect(partGene(seed, 'raptor', 'wing')!.style, `#${seed} cut`).toBeGreaterThanOrEqual(LONG_WING);
      const p = hawk(seed);
      const t = trunkOf(p);
      const chest = t[t.length - 1];
      for (const side of [1, -1]) {
        const fold = longWingFold(p, side)!;
        // rooted high on the shoulders, out on that side
        expect(fold.anchor[1], `#${seed} shoulder`).toBeGreaterThan(chest.pos[1] + 0.3 * chest.radius);
        expect(fold.anchor[0] * side, `#${seed} side`).toBeGreaterThan(0.5 * chest.radius);
        // running back and DOWN (a level leaf's axis dropped 0.12 in 1)
        expect(fold.axis.y, `#${seed} slope`).toBeLessThan(-0.35);
        expect(fold.axis.z, `#${seed} back`).toBeLessThan(-0.8);
        // …to end on the tail fan: past the tail's own tip, tucked in toward the midline
        const end = new THREE.Vector3(...fold.anchor).addScaledVector(fold.axis, fold.S * 1.05);
        const tail = p.nodes.find((n) => n.kind === 'terminal' && n.part?.kind === 'tail')!;
        expect(end.z, `#${seed} reaches the tail`).toBeLessThan(tail.pos[2]);
        expect(end.z, `#${seed} not past it`).toBeGreaterThan(tail.pos[2] - 0.6);
        expect(Math.abs(end.x), `#${seed} tips meet`).toBeLessThan(0.4 * t[0].radius);
        expect(Math.abs(end.y - t[0].pos[1]), `#${seed} at the rump's height`).toBeLessThan(0.25);
      }
    }
  });

  it('always has its tail, and a songbird keeps the short wing and the perching foot', () => {
    for (const seed of SEEDS) {
      expect(partGene(seed, 'raptor', 'tail'), `raptor #${seed} tail`).toBeDefined();
      const wing = partGene(seed, 'bird', 'wing');
      if (wing) expect(wing.style, `bird #${seed} wing`).toBeLessThan(LONG_WING);
      expect(partGene(seed, 'bird', 'leg')!.style, `bird #${seed} foot`).toBeLessThan(TALONED);
    }
  });

  it('stands on stout shanks ending in taloned feet: thick spread toes, long hooks that meet the ground', () => {
    // (on a songbird's thin shanks and wire toes a hawk had nothing to kill with)
    for (const seed of SEEDS) {
      expect(partGene(seed, 'raptor', 'leg')!.style, `#${seed} cut`).toBeGreaterThanOrEqual(TALONED);
      const p = hawk(seed);
      const girth = Math.max(...trunkOf(p).map((n) => n.radius));
      const leg = p.nodes.filter((n) => n.part?.kind === 'leg' && n.pos[0] > 0);
      expect(leg.length, `#${seed} links`).toBe(4);
      expect(leg[2].radius / girth, `#${seed} shank`).toBeGreaterThan(0.135);
      expect(leg[3].radius / girth, `#${seed} foot`).toBeGreaterThan(0.085);
      const fi = p.nodes.indexOf(leg[3]);
      const r = leg[3].radius;
      const link = lastLinkOf(p, fi);
      const plain = toedFootGeometry('bird', r, link, false);
      const hooked = toedFootGeometry('bird', r, link, true);
      const box = (g: THREE.BufferGeometry) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute);
      const pt = box(plain.toes), ht = box(hooked.toes), pc = box(plain.claws), hc = box(hooked.claws);
      // the toes spread half as wide again, and reach further fore and aft
      expect(ht.max.x - ht.min.x, `#${seed} spread`).toBeGreaterThan(1.5 * (pt.max.x - pt.min.x));
      expect(ht.max.z - ht.min.z, `#${seed} reach`).toBeGreaterThan(1.3 * (pt.max.z - pt.min.z));
      // the hind toe carries a talon as far behind the foot as the front ones reach ahead
      expect(-hc.min.z, `#${seed} hind talon`).toBeGreaterThan(0.6 * hc.max.z);
      // the talons arch: they stand taller than a plain claw, and their points come down to the
      // ground the foot stands on (−r) without going through it
      expect(hc.max.y - hc.min.y, `#${seed} hook`).toBeGreaterThan(1.5 * (pc.max.y - pc.min.y));
      expect(hc.min.y, `#${seed} on the ground`).toBeGreaterThan(-r * 1.05);
      expect(hc.min.y, `#${seed} touching it`).toBeLessThan(-r * 0.6);
      for (const g of [plain.toes, plain.claws, hooked.toes, hooked.claws]) g.dispose();
    }
  });

  it('wears sober plumage: muted browns, its markings its own hue darker or a dark umber', () => {
    // (let loose like a songbird's, half of all hawks wore a violet hood or green bars)
    let sober = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { hueA, hueB, sat } = genomeOfMorphotype(seed, 'raptor').palette;
      if (sat > 0.65) continue; // the rare vivid morph every plan throws up
      sober++;
      expect(hueA, `#${seed} brown`).toBeGreaterThan(0.045);
      expect(hueA, `#${seed} brown`).toBeLessThan(0.115);
      const d = Math.abs(((hueB - hueA + 1.5) % 1) - 0.5);
      expect(d <= 0.061 || (hueB >= 0.059 && hueB <= 0.106), `#${seed} markings ${hueB.toFixed(3)} on ${hueA.toFixed(3)}`).toBe(true);
    }
    expect(sober).toBeGreaterThanOrEqual(32);
  });

  it('bows right down to feed — the bill reaches the ground — and flies with its back level', () => {
    // (held to the dip of a level bird it tore at the air a third to a half of its hip height above
    // its kill; carried through the air as it stood it flew chest first, like a rocket)
    for (let seed = 1; seed <= 10; seed++) {
      const p = hawk(seed);
      const r = createRig(p);
      const T = r.template;
      poseRig(r, { dt: 0, speed: 0, cruise: 1, sleep: 0, eat: 1, swim: false, turn: 0 });
      r.root.updateMatrixWorld(true);
      const ground = groundOf(p);
      const tall = Math.max(...T.legs.map((l) => p.nodes[l.nodes[0]].pos[1])) - ground;
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const mouthY = new THREE.Vector3().setFromMatrixPosition(r.bones[mi].matrixWorld).y;
      expect((mouthY - ground - p.nodes[mi].radius * 0.5 - 0.03) / tall, `#${seed} miss`).toBeLessThan(0.05);
      // on the wing the whole body pitches forward by most of its rise
      const { rise, upright } = trunkRise(p);
      expect(upright, `#${seed} upright`).toBe(1);
      expect(flightLevel(p), `#${seed} level`).toBeGreaterThan(0.4);
      expect(flightLevel(p), `#${seed} still a touch nose-up`).toBeLessThan(rise);
      poseRig(r, { dt: 0, speed: 0, cruise: 1, sleep: 0, eat: 0, swim: false, turn: 0, fly: 1 });
      expect(r.bones[T.trunk[0]].rotation.x, `#${seed} in flight`).toBeCloseTo(flightLevel(p), 6);
      poseRig(r, { dt: 0, speed: 0, cruise: 1, sleep: 0, eat: 0, swim: false, turn: 0 });
      expect(Math.abs(r.bones[T.trunk[0]].rotation.x), `#${seed} standing again`).toBeLessThan(1e-9);
    }
  });

  it('is known for a raptor by the game itself, and a songbird is still known for a bird', () => {
    // (a third of all hawks were identified as "bird": the two plans differed in nothing the
    // identifier measures. A hawk's long three-link wing and matte plumage now set it apart.)
    const own = (id: string) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) if (nearestKinds(grow(genomeOfMorphotype(seed, id)), 1)[0].id === id) n++;
      return n;
    };
    expect(own('raptor')).toBeGreaterThanOrEqual(56);
    expect(own('bird')).toBeGreaterThanOrEqual(50);
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'raptor');
      expect(partGene(seed, 'raptor', 'wing')!.segments, `#${seed} wing links`).toBe(3);
      expect(g.covering.sheen, `#${seed} matte`).toBeLessThanOrEqual(0.1);
    }
  });

  it('is the only two-legged plan upright enough for that: the others feed and fly as they did', () => {
    for (const id of ['bird', 'biped', 'ratite', 'wyvern']) {
      for (const seed of SEEDS) {
        const p = grow(genomeOfMorphotype(seed, id));
        expect(trunkRise(p).upright, `${id} #${seed}`).toBe(0);
        expect(flightLevel(p), `${id} #${seed}`).toBe(0);
        expect(createRig(p).template.flyLevel, `${id} #${seed}`).toBe(0);
      }
    }
  });
});
