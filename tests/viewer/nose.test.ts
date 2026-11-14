import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import * as THREE from 'three';
import { APE_NOSE, GRAZER_NOSE, buildJawed, NOSE_POINTED, pinkNoseChance, stopOf, whiskerPads, type JawedVariant } from '../../src/viewer/mouths/jawed';
import { mouthCarves, mouthSpec } from '../../src/viewer/mouthLine';
import { mouthVariant } from '../../src/viewer/partStyles';

describe('noses', () => {
  it('a pink nose is a small animal’s: about even on a mouse, never on a wolf or a bear', () => {
    // (two in five of every kind had one, and a pink-nosed bear read as a giant rodent)
    for (let seed = 1; seed <= 12; seed++) {
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'ursid'))), `bear #${seed}`).toBe(0);
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'canid'))), `dog #${seed}`).toBe(0);
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'ungulate'))), `deer #${seed}`).toBe(0);
      const mouse = pinkNoseChance(grow(genomeOfMorphotype(seed, 'rodent')));
      expect(mouse, `mouse #${seed}`).toBeGreaterThan(0.25);
      expect(mouse, `mouse #${seed}`).toBeLessThanOrEqual(0.7);
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'felid'))), `cat #${seed}`).toBeLessThan(0.2);
    }
  });

  it("a weasel's nose is dark more often than not, small as it is: a mouse's pink", () => {
    // (a pink button on a small furred face with whiskers was a hamster's)
    for (let seed = 1; seed <= 12; seed++) {
      expect(pinkNoseChance(grow(genomeOfMorphotype(seed, 'mustelid'))), `weasel #${seed}`).toBeLessThan(0.25);
    }
  });

  it("a big dog's pad only where the skull has a stop: a weasel's long snout ends in a small nose", () => {
    // (sized by the muzzle's reach alone, a weasel's — longer than a dog's — ended in a dog's rhinarium as
    // wide as the muzzle and standing past the fur, a deer's in a glossy black rubber ball)
    const padOf = (id: string, seed: number) => {
      const p = grow(genomeOfMorphotype(seed, id));
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const b = buildJawed(p, mi, mouthCarves(p), true, mouthVariant(p.nodes[mi].part!.style) as JawedVariant, 'hybrid')!;
      const depth = Math.max(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment ?? 0));
      const skull = p.nodes.find((n) => n.kind === 'spine' && n.segment === depth)!;
      b.nose!.computeBoundingBox();
      const box = b.nose!.boundingBox!.getSize(new THREE.Vector3());
      return { stop: stopOf(p, mi), across: box.x / (2 * skull.radius * (skull.scale?.[0] ?? 1)) };
    };
    let weasels = 0, dogs = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const weasel = padOf('mustelid', seed);
      expect(weasel.stop, `weasel #${seed}`).toBeLessThan(0.05);
      expect(weasel.across, `weasel #${seed}`).toBeLessThan(0.19);
      weasels += weasel.across;
      const dog = padOf('canid', seed);
      expect(dog.stop, `dog #${seed}`).toBeGreaterThan(0.95);
      dogs += dog.across;
    }
    // (the dog keeps its broad pad: the bigger nose for its skull of the two)
    expect(dogs / weasels).toBeGreaterThan(1.15);
    expect(NOSE_POINTED).toBeLessThan(1);
  });

  it("a cat's short muzzle wears whisker pads; an ape's flat lip and a bear's stopped muzzle wear none", () => {
    // (two round cat's pads under a small nose made an ape's face a cat's, and paled a bear's muzzle)
    const pads = (id: string, seed: number) => {
      const p = grow(genomeOfMorphotype(seed, id));
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, mi)!;
      return whiskerPads(p, mi, spec.muzzled);
    };
    for (let seed = 1; seed <= 12; seed++) {
      expect(pads('felid', seed), `cat #${seed}`).toBe(true);
      expect(pads('primate', seed), `ape #${seed}`).toBe(false);
      expect(pads('ursid', seed), `bear #${seed}`).toBe(false);
    }
  });

  it("an ape's nose is a gorilla's: broad across its face and wider at its foot, where its nostrils flare", () => {
    // (it wore a small dog's pad, wider across the top: on a bare black face, a grape)
    const shape = (id: string, seed: number) => {
      const p = grow(genomeOfMorphotype(seed, id));
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const b = buildJawed(p, mi, [], false, mouthVariant(p.nodes[mi].part!.style) as JawedVariant, 'hybrid')!;
      const pos = b.nose!.getAttribute('position');
      let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i));
        x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i));
      }
      // (the nose's own frame: across, up; centred on the mouth's x)
      const cx = (x0 + x1) / 2;
      let foot = 0, top = 0;
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) - y0) / (y1 - y0), w = Math.abs(pos.getX(i) - cx);
        if (t < 1 / 3) foot = Math.max(foot, w);
        else if (t > 2 / 3) top = Math.max(top, w);
      }
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      const span = Math.abs(eyes[0].pos[0] - eyes[1].pos[0]);
      return { across: (x1 - x0) / span, foot, top };
    };
    for (let seed = 1; seed <= 12; seed++) {
      const ape = shape('primate', seed);
      expect(ape.across, `ape #${seed} across`).toBeGreaterThan(0.6);
      expect(ape.foot, `ape #${seed} foot`).toBeGreaterThan(ape.top);
    }
    const cat = shape('felid', 3);
    expect(cat.top, 'a cat keeps its triangle').toBeGreaterThan(cat.foot);
    expect(APE_NOSE).toBeGreaterThan(1);
  });

  it("a deer's nose is a broad moist pad across its muzzle's front, its nostrils two big commas at its sides", () => {
    // (held to a weasel's NOSE_POINTED, a deer's was a small round black button — a dog's — its nostrils
    // specks a seventieth of a unit across, black on black)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ungulate'));
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, mi)!;
      const b = buildJawed(p, mi, [], false, mouthVariant(p.nodes[mi].part!.style) as JawedVariant, 'hybrid')!;
      const size = (g: THREE.BufferGeometry) => {
        g.computeBoundingBox();
        return g.boundingBox!.getSize(new THREE.Vector3());
      };
      const pad = size(b.nose!);
      const r = spec.r;
      expect(Math.max(pad.x, pad.z) / r, `#${seed} broad`).toBeGreaterThanOrEqual(0.85);
      expect(pad.y / r, `#${seed} tall`).toBeGreaterThanOrEqual(0.6);
      expect(size(b.nostrils!).y / r, `#${seed} nostrils show`).toBeGreaterThanOrEqual(0.2);
    }
    expect(GRAZER_NOSE).toBeGreaterThan(1);
  });
});
