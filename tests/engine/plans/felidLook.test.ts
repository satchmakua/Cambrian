import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildJawed } from '../../../src/viewer/mouths/jawed';
import { mouthSpec, surfacePrims } from '../../../src/viewer/mouthLine';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { earGeometry } from '../../../src/viewer/ear';
import { earVariant } from '../../../src/viewer/partStyles';
import { pileLength } from '../../../src/viewer/CreatureMesh';

const SEEDS = [37, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('felid: pads, ears, carriage', () => {
  it('wears whisker pads shaded smooth — one normal wherever the lobe’s triangles meet, not a faceted egg', () => {
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as 'fanged', 'hybrid')!;
      expect(b.pads, `#${seed}`).not.toBeNull();
      const pos = b.pads!.getAttribute('position');
      const nrm = b.pads!.getAttribute('normal');
      // the normals at each point of the surface (welded by position): flat-shaded, each of the six triangles round
      // a vertex carried its own face's normal, 15–30° apart
      // (per lobe: the two lobes' inner sides touch at the midline, their normals there opposed)
      const at = new Map<string, THREE.Vector3[]>();
      for (let i = 0; i < pos.count; i++) {
        const lobe = i < pos.count / 2 ? 'L' : 'R';
        const key = lobe + [pos.getX(i), pos.getY(i), pos.getZ(i)].map((x) => Math.round(x * 1e5)).join(',');
        const list = at.get(key) ?? [];
        list.push(new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).normalize());
        at.set(key, list);
      }
      let worst = 0;
      for (const list of at.values()) for (const n of list) worst = Math.max(worst, n.angleTo(list[0]));
      expect((worst * 180) / Math.PI, `#${seed}`).toBeLessThan(3);
    }
  });

  it('wears its whisker pads under a pile proud of its muzzle, so its coat’s shells over them make a swelling, not two puffballs', () => {
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const spec = mouthSpec(p, idx)!;
      const b = buildJawed(p, idx, [], false, spec.variant as 'fanged', 'hybrid')!;
      const f = surfacePrims(p, 'hybrid');
      const body = b.pads!.getAttribute('aBodyPos');
      let proud = -Infinity;
      for (let i = 0; i < body.count; i++) proud = Math.max(proud, fieldAt(f, body.getX(i), body.getY(i), body.getZ(i)));
      // (at PAD_SINK 0.14 a bare lobe stood 0.86–1.15 of a pile off the skin)
      expect(proud / pileLength(p), `#${seed}`).toBeLessThan(0.8);
      expect(proud, `#${seed} still a pad`).toBeGreaterThan(0);
    }
  });

  it('stands its pointed ears up off the corners of its skull — not splayed out to the sides like cards', () => {
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const f = surfacePrims(p, 'hybrid');
      const ears = p.nodes.filter((n) => n.terminal === 'ear');
      expect(ears.length, `#${seed}`).toBe(2);
      for (const e of ears) {
        const v = earVariant(e.part?.style ?? 0.5);
        expect(v, `#${seed}`).toBe('pointed');
        const g = earGeometry(v, Math.max(e.radius, 0.06), e.quat).outer;
        const pos = g.getAttribute('position');
        // the tip: the front surface's last row, middle column (a 15 × 15 grid)
        const tip = 14 * 15 + 7;
        const lean = Math.abs(Math.atan2(pos.getX(tip), pos.getY(tip))) * (180 / Math.PI);
        // (aimed along the skull's normal where it sat, a cat's ear leaned out 40–54°)
        expect(lean, `#${seed} lean`).toBeLessThan(36);
        // …and its root stays in the skull, all along the base of both faces
        for (const s0 of [0, 225]) {
          for (let i = 0; i < 15; i++) {
            const j = s0 + i;
            expect(fieldAt(f, pos.getX(j) + e.pos[0], pos.getY(j) + e.pos[1], pos.getZ(j) + e.pos[2]), `#${seed} root`).toBeLessThan(0);
          }
        }
      }
    }
  });

  it('wears a pointed ear as a rounded triangle — sides bowed out, a blunt tip — not a card cut to a needle', () => {
    // (an ear rising straight up: across it is x, up it y)
    const up = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
    const g = earGeometry('pointed', 1, [up.x, up.y, up.z, up.w]).outer;
    const pos = g.getAttribute('position');
    // the front surface's rows (t = j/14 up the ear): its half-width at three quarters of the way up, against the
    // straight line from its widest point to its tip
    const half = (j: number) => Math.abs(pos.getX(j * 15)); // (column 0: the rim, u = −1)
    const yOf = (j: number) => pos.getY(j * 15 + 7);
    const base = half(3), top = yOf(14);
    const j = 11;
    const straight = (base * (top - yOf(j))) / (top - yOf(3));
    // (straight edges, (1 − t)^0.85, stood 1.22 of it; bowed, 1.68)
    expect(half(j) / straight).toBeGreaterThan(1.5);
    // …and a seventh of the way below its tip still a sixth of its broadest (a needle's: 0.13)
    expect(half(13) / base).toBeGreaterThan(0.17);
  });

  it('carries its back level from hips to shoulders — not a hyena’s, sloping down from high withers to a low rump', () => {
    let sum = 0;
    for (const seed of SEEDS.slice(1)) {
      const p = grow(genomeOfMorphotype(seed, 'felid'));
      const f = buildFieldPrims(p, 'hybrid');
      f.k = 0.34 * f.meanR;
      const top = (z: number) => {
        for (let y = 4; y > -1; y -= 0.005) if (fieldAt(f, 0, y, z) < 0) return y;
        return NaN;
      };
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
      const zr = trunk[0].pos[2], zf = trunk[trunk.length - 1].pos[2];
      const rump = top(zr);
      const withers = Math.max(...[0.7, 0.8, 0.9, 1].map((t) => top(zr + (zf - zr) * t)));
      // (the default pitch bent some cats' chests up off their hips: withers 0.3 above the rump)
      expect(withers - rump, `#${seed}`).toBeLessThan(0.2);
      sum += withers - rump;
      // …and the head still carried well above the back (its crown 0.4–0.75 over the withers)
      const skull = p.nodes.find((n) => n.kind === 'spine' && n.segment === 2)!;
      expect(skull.pos[1] + skull.radius - withers, `#${seed} head`).toBeGreaterThan(0.35);
    }
    // …and on the whole a hair over the rump, the chest's depth (0.14 on the default pitch)
    expect(sum / 12).toBeLessThan(0.11);
  });
});
