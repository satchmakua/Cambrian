import { describe, it, expect } from 'vitest';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import * as THREE from 'three';
import { buildJawed, NOSE_POINTED, pinkNoseChance, stopOf, whiskerPads, type JawedVariant } from '../../src/viewer/mouths/jawed';
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
});
