import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../../src/engine/grow';
import { coherence } from '../../../src/engine/morphospace';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { apeFootGeometry, fistGeometry, FIST_SIZE } from '../../../src/viewer/apeLimbs';
import { eyeSeat } from '../../../src/viewer/eyeSeat';
import { browRidgeGeometry, faceMaskOf } from '../../../src/viewer/face';

type Node = Phenotype['nodes'][number];
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const ape = (seed: number) => grow(genomeOfMorphotype(seed, 'primate'));

const halfW = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const halfH = (n: Node) => n.radius * (n.scale?.[1] ?? 1);
const dist = (a: Node, b: Node) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);

/** The parts of an ape, by name: trunk (rump → chest), the nape link, the head (cranium, muzzle), one
 *  arm (shoulder → hand) and one leg (hip → foot) on the +X side, and the face. */
function parts(p: Phenotype) {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const last = Math.max(...spine.map((n) => n.segment ?? 0));
  const chainTo = (tip: number, kind: string) => {
    const chain = [tip];
    while (p.nodes[parent.get(chain[0])!].part?.kind === kind) chain.unshift(parent.get(chain[0])!);
    return chain.map((i) => p.nodes[i]);
  };
  const trunk = spine.filter((n) => n.segment === 0);
  const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
  return {
    trunk,
    rump: trunk[0],
    chest: trunk[trunk.length - 1],
    nape: spine.filter((n) => (n.segment ?? 0) > 0 && n.segment !== last),
    head: spine.filter((n) => n.segment === last),
    arm: chainTo(p.nodes.findIndex((n) => n.terminal === 'hand' && n.pos[0] > 0), 'arm'),
    leg: chainTo(p.nodes.findIndex((n) => n.kind === 'terminal' && n.part?.kind === 'leg' && n.pos[0] > 0), 'leg'),
    eyes: p.nodes.filter((n) => n.terminal === 'eye'),
    ears: p.nodes.filter((n) => n.terminal === 'ear'),
    mouth: p.nodes.find((n) => n.terminal === 'mouth')!,
    ground: Math.min(...feet.map((n) => n.pos[1])),
    floor: Math.min(...feet.map((n) => n.pos[1] - n.radius)),
  };
}

describe('the primate plan', () => {
  it('its head is clearly smaller than its chest, close on the shoulders at the end of a short thick nape', () => {
    // (a dome as wide as the whole torso ran straight down into the chest as one column: from the
    // front the animal was a thumb, or a hooded figure, standing on four posts)
    for (const seed of SEEDS) {
      const a = parts(ape(seed));
      const cranium = a.head[0];
      expect(halfW(cranium) / halfW(a.chest), `#${seed} head width`).toBeLessThan(0.75);
      expect(halfH(cranium) / halfH(a.chest), `#${seed} head height`).toBeLessThan(0.95);
      // one nape link, as thick as the skull it carries — a neck, not a stalk
      expect(a.nape.length, `#${seed} nape`).toBe(1);
      expect(a.nape[0].radius / cranium.radius, `#${seed} nape girth`).toBeGreaterThan(0.9);
      // the skull overlaps the chest (no gap for a long neck) and rides in front of it
      expect(dist(cranium, a.chest) / (cranium.radius + a.chest.radius), `#${seed} head on the shoulders`).toBeLessThan(1);
      expect((cranium.pos[2] - a.chest.pos[2]) / (2 * halfH(a.chest)), `#${seed} head forward`).toBeGreaterThan(0.42);
    }
  });

  it('its shoulders are the widest part of it: the arms hang from the top corners of the chest', () => {
    // (the arms left the underside of the chest side by side, like forelegs: the animal was no wider
    // at the shoulder than at the neck)
    for (const seed of SEEDS) {
      const a = parts(ape(seed));
      const shoulder = a.arm[0];
      expect(shoulder.pos[0] / halfW(a.chest), `#${seed} out on the flank`).toBeGreaterThan(0.7);
      expect(shoulder.pos[1], `#${seed} above the chest's axis`).toBeGreaterThan(a.chest.pos[1]);
      const span = shoulder.pos[0] + shoulder.radius;
      expect(span / halfW(a.chest), `#${seed} proud of the ribs`).toBeGreaterThan(1.1);
      expect(span / halfW(a.head[0]), `#${seed} twice the head`).toBeGreaterThan(1.6);
      for (const n of a.trunk) expect(halfW(n), `#${seed} widest`).toBeLessThan(span);
    }
  });

  it('each arm is a shoulder, an elbow and a fist: bent a little at the elbow, tapering to the wrist, the hand on the ground', () => {
    // (uniform sausages from shoulder to floor, some with a second joint above the wrist; on long legs
    // the hands hung in the air, on short ones the forearm was squashed to half the upper arm)
    for (const seed of SEEDS) {
      const a = parts(ape(seed));
      expect(a.arm.length, `#${seed} links`).toBe(3);
      const [shoulder, elbow, hand] = a.arm;
      const len = dist(shoulder, hand);
      // the elbow sits behind the line from shoulder to hand
      expect(((shoulder.pos[2] + hand.pos[2]) / 2 - elbow.pos[2]) / len, `#${seed} elbow`).toBeGreaterThan(0.03);
      expect(elbow.radius / shoulder.radius, `#${seed} forearm`).toBeLessThan(0.78);
      expect(hand.radius / shoulder.radius, `#${seed} wrist`).toBeLessThan(0.68);
      // upper arm and forearm of a length
      expect(dist(elbow, hand) / dist(shoulder, elbow), `#${seed} forearm length`).toBeGreaterThan(0.85);
      expect(dist(elbow, hand) / dist(shoulder, elbow), `#${seed} forearm length`).toBeLessThan(1.18);
      // the hand rests on the ground, under its shoulder
      expect(Math.abs(hand.pos[1] - (a.ground + 0.85 * hand.radius)) / hand.radius, `#${seed} on the ground`).toBeLessThan(0.01);
      expect(Math.abs(hand.pos[2] - shoulder.pos[2]) / len, `#${seed} under the shoulder`).toBeLessThan(0.1);
      expect((hand.pos[0] - shoulder.pos[0]) / len, `#${seed} not splayed`).toBeLessThan(0.2);
    }
  });

  it('its hips are the narrow end of the trunk, and the rump ends over the heels', () => {
    // (the rump was a ball nearly as broad as the chest, standing out behind the hind legs)
    for (const seed of SEEDS) {
      const a = parts(ape(seed));
      expect(a.rump.radius / a.chest.radius, `#${seed} hips`).toBeLessThan(0.8);
      for (let k = 1; k < a.trunk.length; k++) expect(a.trunk[k].radius, `#${seed} widens forward`).toBeGreaterThan(a.trunk[k - 1].radius);
      const foot = a.leg[a.leg.length - 1];
      const overhang = foot.pos[2] - foot.radius - (a.rump.pos[2] - a.rump.radius);
      expect(overhang / (2 * halfH(a.chest)), `#${seed} rump behind the heel`).toBeLessThan(0.16);
      // short hind legs: a thigh and a shin, the chest carried about its own depth off the ground
      expect(a.leg.length, `#${seed} leg links`).toBe(3);
      const clear = (a.chest.pos[1] - halfH(a.chest) - a.ground) / (2 * halfH(a.chest));
      expect(clear, `#${seed} chest clearance`).toBeGreaterThan(0.7);
      expect(clear, `#${seed} chest clearance`).toBeLessThan(1.35);
    }
  });

  it('its ears lie on the sides of the head at eye level, its eyes look forward over a muzzle set below them', () => {
    // (small round ears high on the crown were a teddy bear's — and three apes in ten had none)
    for (const seed of SEEDS) {
      const a = parts(ape(seed));
      const [cranium, muzzle] = a.head;
      expect(a.ears.length, `#${seed} ears`).toBe(2);
      const eyeY = a.eyes[0].pos[1];
      for (const e of a.ears) {
        expect((e.pos[1] - eyeY) / halfH(cranium), `#${seed} ear height`).toBeLessThan(0.1);
        expect(Math.abs(e.pos[0]) / halfW(cranium), `#${seed} ear on the side`).toBeGreaterThan(0.9);
      }
      expect(a.eyes.length, `#${seed} eyes`).toBe(2);
      expect(Math.abs(a.eyes[0].pos[0]) / halfW(cranium), `#${seed} eyes close-set`).toBeLessThan(0.45);
      // the muzzle's top comes no higher than the eyes: they look out over it
      expect((muzzle.pos[1] + halfH(muzzle) - eyeY) / a.eyes[0].radius, `#${seed} muzzle below the eyes`).toBeLessThan(0.4);
      expect(muzzle.radius / cranium.radius, `#${seed} muzzle`).toBeLessThan(0.7);
    }
  });

  it('it is an ape — no tail — and is recognised as a primate', () => {
    // (four in ten carried a stiff tail, and those were identified as bipeds or ratites)
    for (const seed of SEEDS) {
      const p = ape(seed);
      expect(p.nodes.filter((n) => n.part?.kind === 'tail').length, `#${seed} tail`).toBe(0);
      expect(coherence(p).nearest, `#${seed}`).toBe('primate');
    }
  });

  it('its face is dark bare skin from the brow down — the forehead keeps its fur', () => {
    // (a salmon-pink mask over the whole front of the head, forehead and temples included)
    for (const seed of SEEDS) {
      const p = ape(seed);
      const a = parts(p);
      const f = faceMaskOf(p)!;
      const [r, g, b] = [(f.color >> 16) & 255, (f.color >> 8) & 255, f.color & 255];
      expect(Math.max(r, g, b), `#${seed} dark`).toBeLessThan(150);
      const cranium = a.head[0];
      // a point on the forehead, half-way from the face's front to the crown
      const k = Math.SQRT1_2;
      const brow = [0, cranium.pos[1] + halfH(cranium) * k, cranium.pos[2] + cranium.radius * k];
      expect(Math.hypot(brow[0] - f.c[0], brow[1] - f.c[1], brow[2] - f.c[2]) / f.r, `#${seed} forehead furred`).toBeGreaterThan(0.62);
      // …while the eyes and the mouth are inside it
      for (const n of [...a.eyes, a.mouth]) expect(Math.hypot(n.pos[0] - f.c[0], n.pos[1] - f.c[1], n.pos[2] - f.c[2]), `#${seed} ${n.terminal}`).toBeLessThan(f.r);
    }
  });

  it('a brow ridge runs over each eye from the middle of the forehead to past its outer corner', () => {
    // (two eyes on a smooth dome: nothing above them said ape)
    for (const seed of SEEDS.slice(0, 8)) {
      const p = ape(seed);
      for (let i = 0; i < p.nodes.length; i++) {
        const eye = p.nodes[i];
        if (eye.terminal !== 'eye') continue;
        const g = browRidgeGeometry(p, i)!;
        expect(g, `#${seed}`).not.toBeNull();
        const pos = g.getAttribute('position');
        const side = eye.pos[0] > 0 ? 1 : -1;
        // the eyeball as it is drawn: sunk into the skull from the grown node
        const ball = eyeSeat(p, i, eye.quat, eye.radius).centre!;
        let inner = Infinity, outer = -Infinity, low = Infinity, high = -Infinity, front = -Infinity;
        for (let v = 0; v < pos.count; v++) {
          const x = (pos.getX(v) + eye.pos[0]) * side; // body space, mirrored onto +X
          inner = Math.min(inner, x);
          outer = Math.max(outer, x);
          // over the eye itself (not the outer end, which turns down round the orbit)
          if (Math.abs(x - ball[0] * side) < 0.5 * eye.radius) {
            low = Math.min(low, pos.getY(v) + eye.pos[1]);
            high = Math.max(high, pos.getY(v) + eye.pos[1]);
            front = Math.max(front, pos.getZ(v) + eye.pos[2]);
          }
        }
        expect(inner, `#${seed} reaches the midline`).toBeLessThan(0.02);
        expect((outer - ball[0] * side) / eye.radius, `#${seed} past the outer corner`).toBeGreaterThan(1.1);
        // over the eye's opening, not across it (the lids part ~0.5 of a radius above its centre)…
        expect((low - ball[1]) / eye.radius, `#${seed} clear of the eye`).toBeGreaterThan(0.5);
        expect((high - ball[1]) / eye.radius, `#${seed} a ridge, not a forehead`).toBeLessThan(1.8);
        // …and standing forward of the ball's centre: the eye looks out from under it
        expect((front - ball[2]) / eye.radius, `#${seed} overhangs`).toBeGreaterThan(0.2);
      }
    }
    // only apes have one
    const cat = grow(genomeOfMorphotype(3, 'felid'));
    expect(browRidgeGeometry(cat, cat.nodes.findIndex((n) => n.terminal === 'eye'))).toBeNull();
  });

  it('it stands on fists and flat long-toed feet that rest on the floor', () => {
    // (an open hand with four straight fingers lay beside the wrist like a rake; the feet were dark caps)
    const box = (g: { getAttribute(name: string): { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } }) => {
      const pos = g.getAttribute('position');
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.count; i++)
        [pos.getX(i), pos.getY(i), pos.getZ(i)].forEach((v, k) => {
          lo[k] = Math.min(lo[k], v);
          hi[k] = Math.max(hi[k], v);
        });
      return { lo, hi };
    };
    for (const seed of SEEDS.slice(0, 8)) {
      const a = parts(ape(seed));
      const hand = a.arm[2];
      const r = hand.radius;
      const drop = hand.pos[1] - a.floor;
      expect(drop / r, `#${seed} a fist's height off the floor`).toBeLessThan(2.2);
      for (const side of [1, -1]) {
        const fist = fistGeometry(r, drop, side);
        const fur = box(fist.fur), bare = box(fist.bare);
        // on the floor, not through it; a compact block no longer than it is broad (no rake of fingers)
        expect(Math.min(fur.lo[1], bare.lo[1]), `#${seed} fist on the floor`).toBeGreaterThan(-drop - 1e-6);
        expect(Math.min(fur.lo[1], bare.lo[1]), `#${seed} fist on the floor`).toBeLessThan(-drop + 0.15 * r);
        expect(fur.hi[1], `#${seed} covers the wrist`).toBeGreaterThan(-0.5 * r);
        const width = Math.max(fur.hi[0], bare.hi[0]) - Math.min(fur.lo[0], bare.lo[0]);
        const length = Math.max(fur.hi[2], bare.hi[2]) - Math.min(fur.lo[2], bare.lo[2]);
        expect(width / r, `#${seed} broader than the wrist`).toBeGreaterThan(2 * FIST_SIZE * 0.95);
        expect(length / width, `#${seed} a fist, not a hand laid flat`).toBeLessThan(1);
        // the thumb is on the inside
        expect(side * (bare.lo[0] + bare.hi[0]), `#${seed} thumb inside`).toBeLessThan(0);
      }
      const fr = a.leg[2].radius;
      const foot = apeFootGeometry(fr, 1);
      const fur = box(foot.fur), bare = box(foot.bare);
      expect(Math.min(fur.lo[1], bare.lo[1]), `#${seed} sole on the floor`).toBeGreaterThan(-fr - 1e-6);
      expect(Math.min(fur.lo[1], bare.lo[1]), `#${seed} sole on the floor`).toBeLessThan(-fr + 0.1 * fr);
      // flat and long: three times as long as it is high, the toes out in front of the ankle
      const height = Math.max(fur.hi[1], bare.hi[1]) + fr;
      const length = Math.max(fur.hi[2], bare.hi[2]) - Math.min(fur.lo[2], bare.lo[2]);
      expect(length / height, `#${seed} flat foot`).toBeGreaterThan(3);
      expect(bare.hi[2] / fr, `#${seed} toes forward`).toBeGreaterThan(2);
    }
  });
});
