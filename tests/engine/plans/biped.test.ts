import { describe, it, expect } from 'vitest';
import { grow, type BodyNode, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../../src/engine/random';
import { clawedHandGeometry, footPlanOf, isTheropod, toedFootGeometry } from '../../../src/viewer/feet';

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);

const rx = (n: BodyNode) => n.radius * (n.scale?.[0] ?? 1);
const ry = (n: BodyNode) => n.radius * (n.scale?.[1] ?? 1);
const rz = (n: BodyNode) => n.radius * (n.scale?.[2] ?? 1);

/** The parts of a grown theropod, each chain in order from the body outward (right side for pairs). */
function anatomy(p: Phenotype) {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const last = Math.max(...spine.map((n) => n.segment ?? 0));
  const trunk = spine.filter((n) => n.segment === 0);
  const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
  const head = spine.filter((n) => n.segment === last);
  const side = (kind: string) => p.nodes.filter((n) => n.part?.kind === kind && n.pos[0] > 0);
  const eyeIdx = p.nodes.findIndex((n) => n.terminal === 'eye' && n.pos[0] > 0);
  const mouthIdx = p.nodes.findIndex((n) => n.terminal === 'mouth');
  const chest = trunk[trunk.length - 1];
  return {
    trunk,
    neck,
    head,
    chest,
    leg: side('leg'),
    arm: side('arm'),
    tail: p.nodes.filter((n) => n.part?.kind === 'tail'),
    eye: p.nodes[eyeIdx],
    eyeHost: p.nodes[parent.get(eyeIdx)!],
    mouth: p.nodes[mouthIdx],
    mouthHost: p.nodes[parent.get(mouthIdx)!],
    depth: 2 * Math.max(...trunk.map(ry)),
    width: 2 * Math.max(...trunk.map(rx)),
    trunkBack: trunk[0].pos[2] - rz(trunk[0]),
    trunkFront: chest.pos[2] + rz(chest),
    belly: Math.min(...trunk.map((n) => n.pos[1] - ry(n))),
    skullBack: head[0].pos[2] - rz(head[0]),
    skullFront: head[head.length - 1].pos[2] + rz(head[head.length - 1]),
  };
}

describe('the theropod (biped)', () => {
  it('has a long deep trunk — narrower than it is deep — that runs on into a tail as thick as its hips', () => {
    // (three round links as wide as they were deep, the tail root under half the body's girth: from
    // above a fat diamond pinched into a spike — a tadpole)
    for (const seed of SEEDS) {
      const a = anatomy(grow(genomeOfMorphotype(seed, 'biped')));
      expect(a.trunk.length, `#${seed} trunk links`).toBe(4);
      expect(a.width / a.depth, `#${seed} deeper than wide`).toBeLessThan(0.85);
      expect((a.trunkFront - a.trunkBack) / a.depth, `#${seed} long`).toBeGreaterThan(1.5);
      const deepest = Math.max(...a.trunk.map((n) => n.radius));
      expect(a.tail[0].radius / deepest, `#${seed} tail root`).toBeGreaterThan(0.5);
      expect(a.tail[0].radius / a.trunk[0].radius, `#${seed} tail root against the rump`).toBeGreaterThan(0.7);
      // …and it thins to a point
      expect(a.tail[a.tail.length - 1].radius / a.tail[0].radius, `#${seed} tail tip`).toBeLessThan(0.4);
    }
  });

  it('carries a long flat-topped wedge of a skull on a neck that shows', () => {
    // (a two-link head stretched to twice its length: a dome up to three quarters the depth of the
    // chest whose back end reached past the neck onto the shoulders — a balloon on a pinch)
    for (const seed of SEEDS) {
      const a = anatomy(grow(genomeOfMorphotype(seed, 'biped')));
      expect(a.neck.length, `#${seed} neck links`).toBe(3);
      expect(a.head.length, `#${seed} skull links`).toBe(3);
      // the back of the skull stops short of the chest: there is neck between them
      expect((a.skullBack - a.trunkFront) / a.depth, `#${seed} neck shows`).toBeGreaterThan(0.03);
      // …and the neck is slimmer than the skull it carries
      expect(Math.max(...a.neck.map((n) => n.radius)) / ry(a.head[0]), `#${seed} neck slimmer than the skull`).toBeLessThan(0.8);
      const H = 2 * Math.max(...a.head.map(ry));
      const L = a.skullFront - a.skullBack;
      expect(H / a.depth, `#${seed} skull depth`).toBeLessThan(0.55);
      expect(H / a.depth, `#${seed} skull depth`).toBeGreaterThan(0.33);
      expect(H / L, `#${seed} longer than deep`).toBeLessThan(0.58);
      expect(L / a.depth, `#${seed} a big-jawed head`).toBeGreaterThan(0.68);
      // a wedge: it narrows link by link to a blunt snout, no link swollen past the one behind
      for (let i = 1; i < a.head.length; i++) expect(a.head[i].radius, `#${seed} link ${i}`).toBeLessThan(a.head[i - 1].radius);
      expect(a.head[2].radius / a.head[0].radius, `#${seed} snout`).toBeGreaterThan(0.5);
      // no stretched balloon of a braincase
      expect(a.head[0].scale?.[2] ?? 1, `#${seed} braincase`).toBeLessThan(1.3);
    }
  });

  it('has its eyes high on the sides of the skull mid-way back, and a mouth that runs along the jaws', () => {
    // (both eyes sat at the very front, level with the lips, under the dome; the mouth wrapped the tip)
    for (const seed of SEEDS) {
      const a = anatomy(grow(genomeOfMorphotype(seed, 'biped')));
      const L = a.skullFront - a.skullBack;
      const along = (a.eye.pos[2] - a.skullBack) / L;
      expect(along, `#${seed} eye mid-way back`).toBeGreaterThan(0.5);
      expect(along, `#${seed} eye mid-way back`).toBeLessThan(0.75);
      expect((a.eye.pos[1] - a.eyeHost.pos[1]) / ry(a.eyeHost), `#${seed} eye high`).toBeGreaterThan(0.4);
      expect(a.eye.pos[0], `#${seed} eye on the side`).toBeGreaterThan(0.5 * rx(a.eyeHost));
      // the mouth sits on the middle of the skull, under the eye, the snout running on ahead of it
      expect(a.mouthHost, `#${seed} mouth on the mid skull`).toBe(a.head[1]);
      expect((a.skullFront - a.mouth.pos[2]) / L, `#${seed} mouth set back`).toBeGreaterThan(0.15);
      expect(a.mouth.pos[1], `#${seed} mouth under the eye`).toBeLessThan(a.eye.pos[1]);
    }
  });

  it('holds small arms forward from the front of its chest', () => {
    // (rooted low under the chest on up to four links, they hung straight down past the belly and a
    // little back: from the front, a second shrivelled pair of legs)
    for (const seed of SEEDS) {
      const a = anatomy(grow(genomeOfMorphotype(seed, 'biped')));
      expect(a.arm.length, `#${seed} upper arm, forearm, hand`).toBe(3);
      const [root, , hand] = a.arm;
      expect((root.pos[2] - a.chest.pos[2]) / a.chest.radius, `#${seed} on the chest's front`).toBeGreaterThan(0.6);
      expect((root.pos[1] - a.chest.pos[1]) / ry(a.chest), `#${seed} not under the chest`).toBeGreaterThan(-0.56);
      expect(hand.pos[2] - root.pos[2], `#${seed} reaches forward`).toBeGreaterThan(0.1);
      expect((hand.pos[1] - a.belly) / a.depth, `#${seed} hand above the belly line`).toBeGreaterThan(0.1);
      const reach = Math.hypot(...[0, 1, 2].map((k) => a.arm[1].pos[k] - root.pos[k])) + Math.hypot(...[0, 1, 2].map((k) => hand.pos[k] - a.arm[1].pos[k]));
      const thigh = Math.hypot(...[0, 1, 2].map((k) => a.leg[1].pos[k] - a.leg[0].pos[k]));
      expect(reach / thigh, `#${seed} shorter than the thigh`).toBeLessThan(0.7);
    }
  });

  it('stands on stout legs dropped straight under its hips', () => {
    // (the shank a sixteenth of the body's width — a tube on a stilt — and the feet planted up to a
    // fifth of a body-unit in or out of the hips: an A-frame on one animal, crossed toes on the next)
    for (const seed of SEEDS) {
      const a = anatomy(grow(genomeOfMorphotype(seed, 'biped')));
      const [hip, knee, hock, foot] = a.leg;
      expect(Math.abs(foot.pos[0] - hip.pos[0]), `#${seed} foot under the hip`).toBeLessThan(1e-6);
      expect(foot.pos[0] / a.width, `#${seed} narrow gauge`).toBeLessThan(0.3);
      expect(knee.radius / a.width, `#${seed} drumstick`).toBeGreaterThan(0.17);
      expect(hock.radius / a.width, `#${seed} shank`).toBeGreaterThan(0.105);
      expect(foot.radius / a.width, `#${seed} ankle`).toBeGreaterThan(0.076);
      // …a drumstick all the same: each link slimmer than the one above
      expect(knee.radius, `#${seed}`).toBeLessThan(hip.radius);
      expect(hock.radius, `#${seed}`).toBeLessThan(knee.radius);
      // the belly rides well clear of the ground
      const ground = foot.pos[1] - foot.radius;
      expect((a.belly - ground) / a.depth, `#${seed} clearance`).toBeGreaterThan(0.6);
    }
  });

  it('stands on three stout clawed toes whatever it wears, and ends its arms in three clawed fingers', () => {
    // (a lizard's fan of five on a scaled one, a frog's long pad-tipped fingers on a bare-skinned one)
    const worn = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'biped'));
      worn.add(p.genomeRef.covering.type);
      expect(isTheropod(p), `#${seed}`).toBe(true);
      expect(footPlanOf(p), `#${seed} (${p.genomeRef.covering.type})`).toBe('theropod');
    }
    expect(worn.size, 'the seeds span more than one covering').toBeGreaterThan(1);

    const r = 0.1;
    const link = 0.7;
    const foot = toedFootGeometry('theropod', r, link);
    const lizard = toedFootGeometry('reptile', r, link);
    const bird = toedFootGeometry('bird', r, link);
    // three toes forward and a spur behind: four claws to a lizard's five
    const claws = foot.claws.getAttribute('position').count;
    expect(claws / lizard.claws.getAttribute('position').count).toBeCloseTo(4 / 5, 6);
    const box = (g: { computeBoundingBox(): void; boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null }) => {
      g.computeBoundingBox();
      return g.boundingBox!;
    };
    const tb = box(foot.toes);
    for (const v of [tb.min.x, tb.min.y, tb.min.z, tb.max.x, tb.max.y, tb.max.z]) expect(Number.isFinite(v)).toBe(true);
    expect(tb.max.z, 'a big foot, the toes running forward').toBeGreaterThan(3 * r);
    expect(-tb.min.z, 'only a spur behind').toBeLessThan(0.5 * tb.max.z);
    expect(tb.min.y, 'on the ground, not through it').toBeGreaterThan(-r * 1.6);
    // heavy claws: longer than a bird's on the same leg
    const drop = (g: typeof foot.claws) => box(g).max.y - box(g).min.y;
    expect(drop(foot.claws)).toBeGreaterThan(1.3 * drop(bird.claws));

    // the hand, along a wrist pointing straight down the arm (+Z): three fingers reaching on, three claws
    const hand = clawedHandGeometry(0.05, [0, 0, 0, 1]);
    expect(hand.claws.getAttribute('position').count).toBe((claws / 4) * 3);
    const hb = box(hand.fingers);
    for (const v of [hb.min.x, hb.min.y, hb.min.z, hb.max.x, hb.max.y, hb.max.z]) expect(Number.isFinite(v)).toBe(true);
    expect(hb.max.z, 'fingers reach on past the wrist').toBeGreaterThan(0.05 * 2);
    expect(hb.max.x + hb.min.x, 'the same either side').toBeCloseTo(0, 6);
    expect(box(hand.claws).min.y, 'claws hook down').toBeLessThan(hb.min.y);
    // …and turned with the wrist: aimed straight down, the fingers hang below it
    const down = clawedHandGeometry(0.05, [Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
    expect(box(down.fingers).min.y).toBeLessThan(-0.05 * 2);
  });

  it('is the only plan that wears the theropod foot and hand', () => {
    // (a wyvern's forelimbs are wings, a lizard walks on four, an ape's feet are not clawed)
    for (const id of MORPHOTYPE_IDS) {
      if (id === 'biped') continue;
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        expect(isTheropod(p), `${id} #${seed}`).toBe(false);
        expect(footPlanOf(p), `${id} #${seed}`).not.toBe('theropod');
      }
    }
    expect(footPlanOf(grow(genomeOfMorphotype(3, 'wyvern')))).toBe('reptile');
    expect(footPlanOf(grow(genomeOfMorphotype(3, 'lizard')))).toBe('reptile');
    expect(footPlanOf(grow(genomeOfMorphotype(3, 'raptor')))).toBe('bird');
    expect(footPlanOf(grow(genomeOfMorphotype(3, 'anuran')))).toBe('frog');
  });
});
