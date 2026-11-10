import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';

const trunkOf = (p: Phenotype) => p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);

/** Each leg chain (hip → foot) as node lists, with the hip's parent (the trunk node it hangs off). */
function legChains(p: Phenotype) {
  const parent = new Map(p.edges.map(([a, b]) => [b, a]));
  const out: { nodes: Phenotype['nodes']; attachT: number }[] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
    const chain = [n];
    let cur = i;
    while (parent.has(cur) && p.nodes[parent.get(cur)!].part?.kind === 'leg') {
      cur = parent.get(cur)!;
      chain.unshift(p.nodes[cur]);
    }
    const trunk = trunkOf(p);
    const z0 = trunk[0].pos[2];
    const z1 = trunk[trunk.length - 1].pos[2];
    out.push({ nodes: chain, attachT: (chain[0].pos[2] - z0) / Math.max(z1 - z0, 1e-6) });
  });
  return out;
}

describe('body plans', () => {
  it('a quadruped is deepest at the chest, not the rump', () => {
    // the trunk grows rear → front, and the old taper below 1 shrank it toward the shoulders: every
    // cat, dog, deer and bear was a pear with its neck growing out of the thinnest section
    for (const id of ['felid', 'canid', 'ungulate', 'ursid']) {
      for (let seed = 1; seed <= 12; seed++) {
        const t = trunkOf(grow(genomeOfMorphotype(seed, id)));
        expect(t[t.length - 1].radius, `${id} #${seed}`).toBeGreaterThan(t[0].radius);
      }
    }
  });

  it('a fish is deepest toward its head and thins to its tail stalk', () => {
    for (const id of ['fish', 'shark']) {
      for (let seed = 1; seed <= 12; seed++) {
        const t = trunkOf(grow(genomeOfMorphotype(seed, id)));
        const peak = t.reduce((b, n, i) => (n.radius > t[b].radius ? i : b), 0);
        expect(peak / (t.length - 1), `${id} #${seed}`).toBeGreaterThanOrEqual(0.5);
        expect(t[0].radius, `${id} #${seed}`).toBeLessThan(t[t.length - 1].radius);
      }
    }
  });

  it('a snake is an even rope that lies flat and runs on into a tail', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'serpent'));
      const t = trunkOf(p);
      const r = t.map((n) => n.radius);
      // (it was a cone: the neck 34% of the rump)
      expect(Math.min(...r) / Math.max(...r), `#${seed}`).toBeGreaterThan(0.6);
      const ys = t.map((n) => n.pos[1]);
      expect(Math.max(...ys) - Math.min(...ys), `#${seed}`).toBeLessThan(Math.max(...r) * 2);
      expect(p.nodes.some((n) => n.part?.kind === 'tail'), `#${seed}`).toBe(true);
    }
  });

  it('a front-heavy taper moves the bulk forward without adding any', () => {
    const g = genomeOfMorphotype(1, 'felid');
    const flat = grow({ ...g, body: { ...g.body, taper: 1 } });
    const heavy = grow({ ...g, body: { ...g.body, taper: 1.15 } });
    const peak = (p: Phenotype) => Math.max(...trunkOf(p).map((n) => n.radius));
    expect(peak(heavy)).toBeCloseTo(peak(flat), 6);
    expect(trunkOf(heavy)[0].radius).toBeLessThan(trunkOf(flat)[0].radius);
  });

  it('cats, dogs and deer stand on their legs, well clear of the ground', () => {
    for (const [id, min] of [['felid', 0.55], ['canid', 0.55], ['ungulate', 0.85], ['ursid', 0.25]] as const) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const t = trunkOf(p);
        const belly = Math.min(...t.map((n) => n.pos[1] - n.radius * (n.scale?.[1] ?? 1)));
        const back = Math.max(...t.map((n) => n.pos[1] + n.radius * (n.scale?.[1] ?? 1)));
        const ground = Math.min(...p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').map((n) => n.pos[1]));
        // (the legs below the belly were 2–42% of the trunk's depth — a capybara on castors)
        expect((belly - ground) / (back - belly), `${id} #${seed}`).toBeGreaterThan(min);
      }
    }
  });

  it('cats, dogs and bears stand with their legs straight down under them — not splayed like a foal', () => {
    // (each leg leaned out up to 27° from the shoulder: an A-frame stance, every one a newborn)
    for (const id of ['felid', 'canid', 'ursid']) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const parent = new Map(p.edges.map(([a, b]) => [b, a]));
        p.nodes.forEach((n, i) => {
          if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
          let c = i;
          while (p.nodes[parent.get(c)!].part?.kind === 'leg') c = parent.get(c)!;
          const hip = p.nodes[c];
          const lean = Math.atan2(Math.abs(n.pos[0]) - Math.abs(hip.pos[0]), hip.pos[1] - n.pos[1]);
          expect(lean, `${id} #${seed}`).toBeLessThan((16 * Math.PI) / 180);
        });
      }
    }
  });

  it("a quadruped's elbow sits behind its shoulder; its knee in front of its hip", () => {
    for (const id of ['felid', 'canid', 'ungulate', 'ursid']) {
      for (let seed = 1; seed <= 12; seed++) {
        for (const leg of legChains(grow(genomeOfMorphotype(seed, id)))) {
          const [hip, joint] = leg.nodes;
          if (leg.attachT > 0.5) expect(joint.pos[2], `${id} #${seed} fore`).toBeLessThan(hip.pos[2]);
          else expect(joint.pos[2], `${id} #${seed} hind`).toBeGreaterThan(hip.pos[2]);
        }
      }
    }
  });

  it('a frog: a broad flat head as wide as its shoulders, and hind legs folded in a Z beside the body', () => {
    // (a pear-shaped sack under a narrow conical head, on hind legs planted like stilts)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'anuran'));
      const halfW = (ns: Phenotype['nodes']) => Math.max(...ns.map((n) => n.radius * (n.scale?.[0] ?? 1)));
      const halfH = (ns: Phenotype['nodes']) => Math.max(...ns.map((n) => n.radius * (n.scale?.[1] ?? 1)));
      const head = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) > 0);
      expect(head.length, `#${seed}`).toBeGreaterThan(0);
      expect(halfW(head), `#${seed}`).toBeGreaterThan(0.8 * halfW(trunkOf(p)));
      expect(halfH(head), `#${seed}`).toBeLessThan(halfW(head)); // flat, not domed
      const hind = legChains(p).filter((l) => l.attachT < 0.5);
      expect(hind.length, `#${seed}`).toBeGreaterThan(0);
      for (const { nodes: [hip, knee, ankle] } of hind) {
        expect(knee.pos[2], `#${seed} knee forward`).toBeGreaterThan(hip.pos[2]);
        expect(ankle.pos[2], `#${seed} shin folds back`).toBeLessThan(knee.pos[2]);
      }
    }
  });

  it("a dragon's head is a long reptilian skull — a cranium with a jaw running out ahead of it", () => {
    // (a short round cranium under two horns read as a cat's face)
    for (const id of ['dragon', 'wyvern']) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const last = Math.max(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment ?? 0));
        const head = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === last);
        expect(head.length, `${id} #${seed}`).toBeGreaterThanOrEqual(3);
        const zs = head.map((n) => n.pos[2]);
        expect(Math.max(...zs) - Math.min(...zs), `${id} #${seed}`).toBeGreaterThan(1.3 * head[0].radius);
      }
    }
  });

  it('a ratite holds a long neck up over its body, its head high, on long legs', () => {
    // (a ball of a body with a short drooping neck on stubby legs read as a dodo or a kiwi)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ratite'));
      const t = trunkOf(p);
      const back = Math.max(...t.map((n) => n.pos[1] + n.radius * (n.scale?.[1] ?? 1)));
      const belly = Math.min(...t.map((n) => n.pos[1] - n.radius * (n.scale?.[1] ?? 1)));
      const ground = Math.min(...p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').map((n) => n.pos[1]));
      const eye = p.nodes.find((n) => n.terminal === 'eye')!;
      expect(eye.pos[1] - back, `#${seed} head above the back`).toBeGreaterThan(0.15 * (back - belly));
      expect(belly - ground, `#${seed} legs`).toBeGreaterThan(0.9 * (back - belly));
    }
  });
  it('an insect is head, thorax and abdomen: all six legs hang from the thorax, each joint a narrow waist', () => {
    // (one trunk with the legs spread evenly down it read as a caterpillar)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'insectoid'));
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const sections = new Set(p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment));
      expect(sections.size, `#${seed} sections`).toBe(3);
      const hips = p.nodes.filter((n, i) => n.part?.kind === 'leg' && p.nodes[parent.get(i)!].kind === 'spine');
      expect(hips.length, `#${seed} legs`).toBe(6);
      for (const h of hips) expect(p.nodes[parent.get(p.nodes.indexOf(h))!].segment, `#${seed} hip on the thorax`).toBe(1);
      // the waists: the narrowest spine node at each joint is well under the sections it joins
      for (const seg of [1, 2]) {
        const here = p.nodes.filter((n) => n.kind === 'spine' && n.segment === seg);
        const before = p.nodes.filter((n) => n.kind === 'spine' && n.segment === seg - 1);
        const waist = Math.min(...here.map((n) => n.radius));
        const bulk = Math.min(Math.max(...here.map((n) => n.radius)), Math.max(...before.map((n) => n.radius)));
        expect(waist / bulk, `#${seed} joint ${seg}`).toBeLessThan(0.5);
      }
    }
  });

  it("a spider's legs radiate from its cephalothorax, knees high, round a big abdomen held off the ground", () => {
    // (legs bunched under one round body read as a tick)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'arachnid'));
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const abdomen = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 0);
      const ceph = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
      const rA = Math.max(...abdomen.map((n) => n.radius));
      const rC = Math.max(...ceph.map((n) => n.radius));
      expect(rA / rC, `#${seed} abdomen ×ceph`).toBeGreaterThan(1.4);
      // the face rides the cephalothorax
      const eye = p.nodes.findIndex((n) => n.terminal === 'eye');
      let up = eye;
      while (p.nodes[up].kind !== 'spine') up = parent.get(up)!;
      expect(p.nodes[up].segment, `#${seed} eyes`).toBe(1);
      const legs = legChains(p);
      expect(legs.length, `#${seed} legs`).toBe(8);
      const zC = ceph[ceph.length - 1].pos[2];
      const fore = legs.filter((l) => l.nodes[0].pos[2] > zC);
      const hind = legs.filter((l) => l.nodes[0].pos[2] < zC - 0.1);
      expect(fore.length + hind.length, `#${seed} fanned pairs`).toBeGreaterThanOrEqual(4);
      for (const l of legs) {
        const [hip, knee] = l.nodes;
        const foot = l.nodes[l.nodes.length - 1];
        expect(knee.pos[1], `#${seed} knee above the hip`).toBeGreaterThan(hip.pos[1] + 0.2);
        // the front pairs reach forward, the back pairs back
        if (hip.pos[2] > zC + 0.1) expect(foot.pos[2], `#${seed} fore foot`).toBeGreaterThan(hip.pos[2]);
        if (hip.pos[2] < zC - 0.1) expect(foot.pos[2], `#${seed} hind foot`).toBeLessThan(hip.pos[2]);
      }
      // a leg span well beyond the body's length, and the abdomen slung clear of the ground
      const feet = legs.map((l) => l.nodes[l.nodes.length - 1]);
      const span = Math.max(...feet.map((f) => f.pos[0])) - Math.min(...feet.map((f) => f.pos[0]));
      const body = p.nodes.filter((n) => n.kind === 'spine');
      const len = Math.max(...body.map((n) => n.pos[2] + n.radius)) - Math.min(...body.map((n) => n.pos[2] - n.radius * (n.scale?.[2] ?? 1)));
      expect(span / len, `#${seed} span`).toBeGreaterThan(1.3);
      const ground = Math.min(...feet.map((f) => f.pos[1]));
      const belly = Math.min(...abdomen.map((n) => n.pos[1] - n.radius * (n.scale?.[1] ?? 1)));
      expect(belly - ground, `#${seed} clearance`).toBeGreaterThan(0.25 * rA);
    }
  });

  it('an ape: a broad chest over narrow hips, its head on its shoulders, eyes forward, long arms to the ground', () => {
    // (a pear-shaped trunk swelling at the belly, a neck, eyes on the sides of the head and arms that
    // stopped at the hips read as a seal)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'primate'));
      const t = trunkOf(p);
      expect(t[t.length - 1].radius, `#${seed} chest`).toBeGreaterThan(1.1 * t[0].radius);
      for (let k = 1; k < t.length - 1; k++) expect(t[k].radius, `#${seed} no belly`).toBeLessThan(t[t.length - 1].radius);
      const sections = new Set(p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment));
      expect(sections.size, `#${seed} no neck`).toBe(2);
      const ground = Math.min(...p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').map((n) => n.pos[1]));
      const height = p.bounds.max[1] - ground;
      for (const h of p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'arm')) {
        expect(h.pos[1] - h.radius, `#${seed} hand above the floor`).toBeGreaterThanOrEqual(ground - h.radius - 1e-9);
        expect((h.pos[1] - ground) / height, `#${seed} hand low`).toBeLessThan(0.4);
      }
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
      const headW = 2 * Math.max(...head.map((n) => n.radius * (n.scale?.[0] ?? 1)));
      expect(Math.abs(eyes[0].pos[0] - eyes[1].pos[0]) / headW, `#${seed} eyes close-set`).toBeLessThan(0.6);
    }
  });

  it('a theropod: a level body balanced over its legs, a long tail held out behind, the head out in front', () => {
    // (as an upright walker on a deep two-link trunk it read as a blob — a cartoon dinosaur, a penguin)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'biped'));
      const t = trunkOf(p);
      const dz = t[t.length - 1].pos[2] - t[0].pos[2];
      expect(Math.abs(t[t.length - 1].pos[1] - t[0].pos[1]) / dz, `#${seed} level`).toBeLessThan(0.35);
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      for (const f of feet) {
        expect(f.pos[2], `#${seed} feet under the body`).toBeGreaterThan(t[0].pos[2]);
        expect(f.pos[2], `#${seed} feet under the body`).toBeLessThan(t[t.length - 1].pos[2]);
      }
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      const tip = tail.reduce((a, b) => (b.pos[2] < a.pos[2] ? b : a));
      expect(t[0].pos[2] - tip.pos[2], `#${seed} long tail`).toBeGreaterThan(0.8 * dz);
      const ground = Math.min(...feet.map((f) => f.pos[1]));
      expect(tip.pos[1] - ground, `#${seed} tail held up`).toBeGreaterThan(0.25 * (t[0].pos[1] - ground));
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      expect(mouth.pos[2], `#${seed} head out front`).toBeGreaterThan(t[t.length - 1].pos[2] + t[t.length - 1].radius);
    }
  });

  it("a bird's head is round — about as wide as it is tall — not a tall narrow hood", () => {
    for (const id of ['bird', 'raptor']) {
      for (let seed = 1; seed <= 12; seed++) {
        const g = genomeOfMorphotype(seed, id);
        let head = g.body;
        while (head.child) head = head.child;
        expect(head.size[1] / head.size[0], `${id} #${seed}`).toBeLessThan(1.3);
      }
    }
  });

  it('a crab is wide and flat, its claws held out in front and four pairs of legs splayed to its sides', () => {
    // (a round domed body on three pairs of stubby legs read as a beetle)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const body = trunkOf(p)[0];
      const s = body.scale ?? [1, 1, 1];
      expect(s[0] / s[2], `#${seed} wider than long`).toBeGreaterThan(1.25);
      expect(s[1] / s[0], `#${seed} flat`).toBeLessThan(0.55);
      const halfW = body.radius * s[0];
      const claws = p.nodes.filter((n) => n.terminal === 'pincer');
      expect(claws.length, `#${seed} claws`).toBe(2);
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const hips = p.nodes.filter((n, i) => n.part?.kind === 'leg' && p.nodes[parent.get(i)!].kind === 'spine');
      for (const c of claws) {
        expect(c.pos[2], `#${seed} claw ahead`).toBeGreaterThan(body.pos[2] + body.radius * s[2] * 0.6);
        expect(c.radius, `#${seed} a big claw`).toBeGreaterThan(1.8 * Math.max(...hips.map((h) => h.radius)));
      }
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      expect(feet.length, `#${seed} legs`).toBe(8);
      for (const f of feet) expect(Math.abs(f.pos[0]), `#${seed} splayed`).toBeGreaterThan(halfW * 1.15);
    }
  });

  it('a crab keeps its legs on its one body: no waist pinched behind its head', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const head = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) > 0);
      const trunk = trunkOf(p);
      if (head.length === 0) continue;
      expect(Math.min(...head.map((n) => n.radius)) / Math.max(...trunk.map((n) => n.radius)), `#${seed}`).toBeGreaterThan(0.4);
    }
  });
});
