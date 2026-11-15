import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { eyeVariant } from '../../../src/viewer/partStyles';
import { buildJawed, noseScaleOf, snoutReach, SNOUT_SHORT } from '../../../src/viewer/mouths/jawed';
import { mouthSpec } from '../../../src/viewer/mouthLine';
import { coatMain } from '../../../src/viewer/palette';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { WHISKER_FAN, whiskerStretch } from '../../../src/viewer/whiskers';

describe('felid', () => {
  it("looks out of a cat's slit eyes", () => {
    // (round eyes with a brown iris — the commonest mammal eye — gave the cat a dog's face)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBe(2);
      for (const e of eyes) expect(eyeVariant(e.part!.style), `#${seed}`).toBe('slit');
    }
  });

  it("wears a small nose on its short muzzle, where a dog wears a broad pad", () => {
    // (the same pad on every muzzle: a cat with a dog's big black nose)
    const noseWidth = (id: string, seed: number) => {
      const p = grow(genomeOfMorphotype(seed, id));
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as 'fanged' | 'maw' | 'herbivore' | 'underbite')!;
      expect(b.nose, `${id} #${seed}`).not.toBeNull();
      b.nose!.computeBoundingBox();
      const s = b.nose!.boundingBox!.getSize(new THREE.Vector3());
      return { w: Math.max(s.x, s.y, s.z) / b.r, reach: snoutReach(p, idx) };
    };
    for (let seed = 1; seed <= 6; seed++) {
      const cat = noseWidth('felid', seed);
      const dog = noseWidth('canid', seed);
      expect(cat.reach, `cat #${seed}`).toBeLessThan(SNOUT_SHORT);
      expect(dog.reach, `dog #${seed}`).toBeGreaterThan(SNOUT_SHORT);
      expect(cat.w, `#${seed}`).toBeLessThan(dog.w * 0.85);
      // a dog's pad is wider than its mouth is deep (at a cat's size it was three-quarters of that)
      expect(dog.w, `dog #${seed}`).toBeGreaterThan(1.0);
    }
    expect(noseScaleOf(1.6)).toBeCloseTo(0.75, 9);
    // …and a dog's or a bear's covers most of its muzzle's front (at a cat's size it was a dot on the
    // end of a hippo's snout)
    expect(noseScaleOf(2.4)).toBe(1.5);
  });

  it("wears fine, dense markings: a cheetah's spots, a tiger's stripes — not a dalmatian's blobs", () => {
    // (at 1.4–6.8 cells a unit, a spotted cat wore about twenty big sparse blobs: a dalmatian, a hyena;
    // a striped one a few broad hoops)
    let marked = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const c = genomeOfMorphotype(seed, 'felid').covering;
      if (c.pattern !== 'spots' && c.pattern !== 'stripes') continue;
      marked++;
      expect(c.patternScale, `#${seed} ${c.pattern}`).toBeGreaterThanOrEqual(8.5);
    }
    expect(marked).toBeGreaterThan(8);
  });

  it("wears a tawny, ginger, sandy or grey coat — never a pale salmon pink, a hairless cat's", () => {
    // (on the reddest hues, lit pale, a plain cat came out salmon pink)
    const hsl = { h: 0, s: 0, l: 0 };
    for (let seed = 1; seed <= 32; seed++) {
      const g = genomeOfMorphotype(seed, 'felid');
      coatMain(g.palette).getHSL(hsl, THREE.SRGBColorSpace); // (as it is seen: the palette is sRGB)
      if (hsl.s < 0.25) continue; // (a grey coat)
      expect(hsl.h, `#${seed} hue`).toBeGreaterThan(0.064);
      expect(hsl.l, `#${seed} light`).toBeLessThan(0.75);
    }
  });
});

const skullOf = (p: Phenotype) => p.nodes.find((n) => n.kind === 'spine' && n.segment === 2)!;
const ry = (n: { radius: number; scale?: readonly number[] }) => n.radius * (n.scale?.[1] ?? 1);

describe('felid: throat, muzzle, whiskers, paws', () => {
  it("meets its throat at the angle of the jaw — no dewlap hung from chin to chest", () => {
    // (its neck as thick as its skull to the end, run into it from below and behind: the underside from chin to
    // chest was one slope, bellied out below the skull — a sagging dewlap)
    for (const seed of [29, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const C = skullOf(p);
      const f = buildFieldPrims(p, 'hybrid');
      f.k = 0.34 * f.meanR;
      // the midline underside's height at dz skull radii ahead of the skull's centre (× its radius)
      const under = (dz: number): number => {
        const z = C.pos[2] + dz * C.radius;
        for (let y = C.pos[1] - 4 * C.radius; y < C.pos[1] + C.radius; y += 0.003) if (fieldAt(f, 0, y, z) < 0) return (y - C.pos[1]) / C.radius;
        return NaN;
      };
      // against the straight line from a radius behind the skull (the throat) to the jaw half a radius ahead,
      // the underside between them hangs no lower than a tenth of a radius: an angle at the jaw, not a pouch
      const a = under(-1), b = under(0.5);
      for (const d of [-0.75, -0.5, -0.25, 0, 0.25]) {
        const line = a + ((b - a) * (d + 1)) / 1.5;
        expect(line - under(d), `#${seed} at ${d}`).toBeLessThan(0.12);
      }
      // …and under the skull's centre the skin is within a third of a radius of the skull's own floor
      expect(under(0), `#${seed} under the skull`).toBeGreaterThan(-(C.scale?.[1] ?? 1) - 0.52);
    }
  });

  it("stands on paws as wide as its wrists — not tiny balls at the ends of tapering dowels", () => {
    for (const seed of [29, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const D = 2 * Math.max(...p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0).map(ry));
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      for (const n of p.nodes) {
        if (n.terminal !== 'paw') continue;
        expect((2 * n.radius) / D, `#${seed} paw`).toBeGreaterThan(0.16);
        // a paw (its sole 1.12 × its radius across) nearly as wide as the shank it ends (0.70–0.84 of it on HEAD)
        const shank = p.nodes[parent.get(p.nodes.indexOf(n))!];
        expect(1.12 * n.radius, `#${seed} paw vs shank`).toBeGreaterThan(0.83 * shank.radius);
      }
    }
  });

  it("wears its whiskers on the pads beside its nose, reaching out past its cheeks", () => {
    // (rooted on the muzzle's flank behind the corner of the mouth, a fifth of a unit long, they ended inside the
    // cheeks' outline: a short white scribble at the jaw)
    const mean = WHISKER_FAN.reduce((t, w) => t + w[2], 0) / WHISKER_FAN.length;
    for (const seed of [29, 1, 2, 3, 4, 5, 6]) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const w = p.nodes.findIndex((n) => n.part?.kind === 'whisker' && n.terminal && n.pos[0] > 0);
      if (w < 0) continue;
      const n = p.nodes[w];
      const mouth = p.nodes.find((m) => m.terminal === 'mouth')!;
      const C = skullOf(p);
      const half = C.radius * (C.scale?.[0] ?? 1);
      const r = Math.max(n.radius, 0.06);
      // the root no further behind the mouth's front than its own radius (it sat 0.85–1.05 mouth radii back)
      expect(mouth.pos[2] - n.pos[2], `#${seed} root`).toBeLessThan(0.75 * mouth.radius);
      // the tips out past the cheeks
      expect((n.pos[0] + mean * r * whiskerStretch(p, w, r)) / half, `#${seed} reach`).toBeGreaterThan(1.15);
    }
  });

  it("wears whisker pads that run down from its nose onto its upper lip — no bare chin between", () => {
    for (const seed of [29, 1, 3, 5, 9, 12]) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as 'fanged')!;
      expect(b.pads, `#${seed}`).not.toBeNull();
      b.pads!.computeBoundingBox();
      const lip = b.upper[Math.floor(b.upper.length / 2)].p[1];
      expect((b.pads!.boundingBox!.min.y - lip) / b.r, `#${seed} gap`).toBeLessThan(0.15);
    }
  });
});
