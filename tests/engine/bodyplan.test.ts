import { describe, it, expect } from 'vitest';
import { bipedSlot, grow, rearedness, type Phenotype } from '../../src/engine/grow';
import type { Genome, SegmentGene } from '../../src/engine/genome';
import { genomeOfMorphotype, randomGenome } from '../../src/engine/random';

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

  it('a fish is deep and flattened side to side, narrowing to a slim stalk before its tail fin', () => {
    // (a round tube of even girth with a fin at each end read as an eel, or a sausage)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'fish'));
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      const depth = (n: Phenotype['nodes'][number]) => n.radius * (n.scale?.[1] ?? 1);
      const width = (n: Phenotype['nodes'][number]) => n.radius * (n.scale?.[0] ?? 1);
      const peak = t.reduce((b, n) => (depth(n) > depth(b) ? n : b), t[0]);
      expect(depth(peak) / width(peak), `#${seed} compressed`).toBeGreaterThan(1.45);
      // a spindle, not a loaf: the body thins steadily back to the rump…
      expect(depth(t[0]) / depth(peak), `#${seed} rump`).toBeLessThan(0.6);
      // …where a short stalk carries the tail fin, carrying the taper on: slimmer than the rump, but
      // not a stick (a rod a third of the rump's depth, a fifth of the body long, was a pinch and a pole)
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      expect(tail.length, `#${seed} tail`).toBe(2);
      expect(tail[0].radius / depth(t[0]), `#${seed} stalk`).toBeLessThan(0.85);
      expect(tail[0].radius / depth(t[0]), `#${seed} stalk`).toBeGreaterThan(0.45);
      expect(t[0].pos[2] - tail[1].pos[2], `#${seed} stalk length`).toBeLessThan(0.2 * (p.bounds.max[2] - p.bounds.min[2]));
      // a wedge of a head: three links narrowing to a small mouth at the tip, the eyes back on its sides
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1).sort((a, b) => a.pos[2] - b.pos[2]);
      expect(head.length, `#${seed} head links`).toBe(3);
      expect(depth(head[2]) / depth(head[0]), `#${seed} snout`).toBeLessThan(0.5);
      expect(depth(head[0]) / depth(peak), `#${seed} head joins the body`).toBeGreaterThan(0.6);
      const eye = p.nodes.find((n) => n.terminal === 'eye')!;
      expect(eye.pos[2], `#${seed} eye behind the snout tip`).toBeLessThan(head[2].pos[2]);
      // it has a head (not its face on the blunt front of the trunk), and a fish's proportions
      expect(p.nodes.some((n) => n.kind === 'spine' && (n.segment ?? 0) > 0), `#${seed} head`).toBe(true);
      expect((p.bounds.max[2] - p.bounds.min[2]) / (2 * depth(peak)), `#${seed} length/depth`).toBeLessThan(4);
    }
    // and most carry an anal fin on the belly toward the tail, opposite the dorsal
    let anal = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const fins = genomeOfMorphotype(seed, 'fish').body.appendages.filter((a) => a.kind === 'fin' && Math.abs(a.attachAzimuth - Math.PI * 1.5) < 0.01);
      anal += fins.length > 0 ? 1 : 0;
    }
    expect(anal).toBeGreaterThanOrEqual(8);
  });

  it('a fish and a shark wear different fins, and each a full set', () => {
    const fins = (id: string, seed: number) => genomeOfMorphotype(seed, id).body.appendages.filter((a) => a.kind === 'fin');
    const tailOf = (id: string, seed: number) => genomeOfMorphotype(seed, id).body.appendages.find((a) => a.kind === 'tail')!;
    let pelvics = 0;
    let second = 0;
    for (let seed = 1; seed <= 16; seed++) {
      // every fin of a body is of one cut: a bony fish's (0.3–0.6) or a shark's (over 0.6)
      for (const f of [...fins('fish', seed), tailOf('fish', seed)]) {
        expect(f.style, `fish #${seed}`).toBeGreaterThanOrEqual(0.3);
        expect(f.style, `fish #${seed}`).toBeLessThan(0.6);
      }
      for (const f of [...fins('shark', seed), tailOf('shark', seed)]) expect(f.style, `shark #${seed}`).toBeGreaterThanOrEqual(0.6);
      // the fish: its dorsal stands over the deepest part of the body (it sat back by the tail), its
      // pectorals lie back along the flank (they stuck out level, like a plane's wings)
      const dorsal = fins('fish', seed).find((f) => Math.abs(f.attachAzimuth - Math.PI / 2) < 0.01)!;
      expect(dorsal.attachT, `fish #${seed} dorsal`).toBeGreaterThanOrEqual(0.5);
      const pect = fins('fish', seed).find((f) => f.pair && f.attachAzimuth < 4.1)!;
      expect(pect.attachElevation, `fish #${seed} pectorals laid back`).toBeLessThan(-0.7);
      if (fins('fish', seed).some((f) => f.pair && f.attachAzimuth > 4.2)) pelvics++;
      // the shark: a second, smaller dorsal toward the tail
      if (fins('shark', seed).filter((f) => Math.abs(f.attachAzimuth - Math.PI / 2) < 0.01).length === 2) second++;
    }
    expect(pelvics).toBeGreaterThanOrEqual(12);
    expect(second).toBeGreaterThanOrEqual(11);
  });

  it('a bird has one tail: the stub runs straight back from the rump, under the fan it carries', () => {
    // (the stub hung down and back, so the fan on its tip trailed below the wingtips: a second tail)
    for (const id of ['bird', 'raptor']) {
      for (let seed = 1; seed <= 16; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
        if (tail.length === 0) continue;
        const rump = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2])[0];
        const tip = tail[tail.length - 1];
        const back = rump.pos[2] - tip.pos[2];
        expect(back, `${id} #${seed} runs back`).toBeGreaterThan(0);
        // level or a touch raised: never more than a little below the rump's own height
        expect((tip.pos[1] - rump.pos[1]) / Math.max(back, 1e-6), `${id} #${seed} not hanging`).toBeGreaterThan(-0.2);
      }
    }
  });

  it('a bird of prey is not the pigeon recoloured: a shorter neck, a bigger head and bill, thicker legs', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const measure = (id: string) => {
      const neck: number[] = [], head: number[] = [], bill: number[] = [], leg: number[] = [];
      for (let seed = 1; seed <= 24; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const spine = p.nodes.filter((n) => n.kind === 'spine');
        const last = Math.max(...spine.map((n) => n.segment ?? 0));
        const girth = Math.max(...trunkOf(p).map((n) => n.radius));
        neck.push(spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last).length);
        head.push(spine.filter((n) => n.segment === last)[0].radius / girth);
        bill.push(p.nodes.find((n) => n.terminal === 'mouth')!.radius / girth);
        leg.push(Math.max(...p.nodes.filter((n) => n.part?.kind === 'leg' && n.kind === 'limb').map((n) => n.radius)) / girth);
      }
      return { neck: mean(neck), head: mean(head), bill: mean(bill), leg: mean(leg) };
    };
    const hawk = measure('raptor');
    const dove = measure('bird');
    expect(hawk.neck).toBeLessThan(dove.neck);
    expect(hawk.head).toBeGreaterThan(1.08 * dove.head);
    expect(hawk.bill).toBeGreaterThan(1.15 * dove.bill);
    expect(hawk.leg).toBeGreaterThan(1.2 * dove.leg);
  });

  it('a raised neck roots at the top of the shoulders, so the head it carries clears the back', () => {
    // (begun on the trunk's axis it had the whole chest to climb first: a dog's crown rode 0.25 of
    // its chest's depth above its back, a deer's 0.3 — every necked animal stretching forward to sniff)
    for (const [id, min] of [['canid', 0.2], ['felid', 0.25], ['ungulate', 0.35], ['bird', 0.3], ['dragon', 0.2]] as const) {
      for (let seed = 1; seed <= 16; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const spine = p.nodes.filter((n) => n.kind === 'spine');
        const last = Math.max(...spine.map((n) => n.segment ?? 0));
        const ry = (n: (typeof spine)[number]) => n.radius * (n.scale?.[1] ?? 1);
        const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
        const chest = t[t.length - 1];
        const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last).sort((a, b) => (a.segment ?? 0) - (b.segment ?? 0) || 0);
        // the neck's first link sits above the chest's own axis
        expect(neck[0].pos[1], `${id} #${seed} neck root`).toBeGreaterThan(chest.pos[1] + 0.15 * ry(chest));
        const skull = spine.filter((n) => n.segment === last)[0];
        const back = Math.max(...t.map((n) => n.pos[1] + ry(n)));
        expect((skull.pos[1] + ry(skull) - back) / (2 * Math.max(...t.map(ry))), `${id} #${seed} crown`).toBeGreaterThan(min);
      }
    }
    // …while a bear's stays level with its back: its neck barely lifts
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ursid'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const ry = (n: (typeof spine)[number]) => n.radius * (n.scale?.[1] ?? 1);
      const t = trunkOf(p);
      const skull = spine.filter((n) => n.segment === last)[0];
      const back = Math.max(...t.map((n) => n.pos[1] + ry(n)));
      expect((skull.pos[1] + ry(skull) - back) / (2 * Math.max(...t.map(ry))), `bear #${seed}`).toBeLessThan(0.3);
    }
  });

  it('a dragon stands tall with its head above its back; a wyvern is a biped, chest up over big legs', () => {
    const measure = (id: string, seed: number) => {
      const p = grow(genomeOfMorphotype(seed, id));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const ry = (n: (typeof spine)[number]) => n.radius * (n.scale?.[1] ?? 1);
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      const D = 2 * Math.max(...t.map(ry));
      const back = Math.max(...t.map((n) => n.pos[1] + ry(n)));
      const belly = Math.min(...t.map((n) => n.pos[1] - ry(n)));
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      const ground = Math.min(...feet.map((n) => n.pos[1] - n.radius));
      const skull = spine.filter((n) => n.segment === last)[0];
      const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
      const wing = p.nodes.find((n) => n.part?.kind === 'wing' && n.kind === 'terminal');
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      const legs = p.nodes.filter((n) => n.part?.kind === 'leg' && n.kind === 'limb');
      return {
        clearance: (belly - ground) / D,
        crown: (skull.pos[1] + ry(skull) - back) / D,
        neckLinks: neck.length,
        wing: wing ? wing.radius / Math.max(...t.map((n) => n.radius)) : null,
        tailRoot: tail.length ? (2 * tail[0].radius) / D : null,
        shank: (2 * Math.min(...legs.map((n) => n.radius))) / D,
        feet: feet.length,
        chestUp: t[t.length - 1].pos[1] - t[0].pos[1],
        footZ: feet.reduce((a, n) => a + n.pos[2], 0) / feet.length,
        z0: t[0].pos[2] - t[0].radius,
        z1: t[t.length - 1].pos[2] + t[t.length - 1].radius,
      };
    };
    for (let seed = 1; seed <= 12; seed++) {
      const d = measure('dragon', seed);
      // (a belly-dragging sausage on pegs, the head at ground level: a winged shrew)
      expect(d.feet, `dragon #${seed}`).toBe(4);
      expect(d.clearance, `dragon #${seed} clearance`).toBeGreaterThan(0.45);
      expect(d.crown, `dragon #${seed} head above the back`).toBeGreaterThan(0.2);
      expect(d.neckLinks, `dragon #${seed} neck`).toBeGreaterThanOrEqual(3);
      if (d.tailRoot !== null) expect(d.tailRoot, `dragon #${seed} tail root`).toBeGreaterThan(0.3);
      if (d.wing !== null) expect(d.wing, `dragon #${seed} wing`).toBeGreaterThan(0.42);
      const w = measure('wyvern', seed);
      // (the dragon with its forelegs deleted: a balloon on two pegs under its back third)
      expect(w.feet, `wyvern #${seed}`).toBe(2);
      expect(w.chestUp, `wyvern #${seed} chest up`).toBeGreaterThan(0.25);
      expect(w.clearance, `wyvern #${seed} clearance`).toBeGreaterThan(0.5);
      expect(w.shank, `wyvern #${seed} legs`).toBeGreaterThan(0.14);
      expect(w.crown, `wyvern #${seed} head above the back`).toBeGreaterThan(0.25);
      // its feet stand under the middle of its body, not its rear end
      const u = (w.footZ - w.z0) / (w.z1 - w.z0);
      expect(u, `wyvern #${seed} feet under it`).toBeGreaterThan(0.3);
      expect(u, `wyvern #${seed} feet under it`).toBeLessThan(0.75);
      expect(w.wing!, `wyvern #${seed} wing`).toBeGreaterThan(0.42);
    }
  });

  it('a turtle has a small head on a thinner neck — not a balloon half the size of its shell', () => {
    // (its skull drew any shape going, the swollen ones included: 0.24 to 1.1 of the shell's depth)
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'chelonian'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const shell = Math.max(...trunkOf(p).map((n) => n.radius));
      const skull = spine.filter((n) => n.segment === last)[0];
      const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
      expect(skull.radius / shell, `#${seed} head`).toBeLessThan(0.46);
      expect(skull.radius / shell, `#${seed} head`).toBeGreaterThan(0.18);
      expect(Math.min(...neck.map((n) => n.radius)), `#${seed} neck thinner than the head`).toBeLessThan(skull.radius);
    }
  });

  it('a theropod carries a heavy tail: deep at the root, a counterweight to its head and chest', () => {
    // (a thin rod a quarter of the body's depth, stuck in a round rump like a stick in a potato)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'biped'));
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      expect(tail.length, `#${seed}`).toBeGreaterThanOrEqual(5);
      expect(tail[0].radius / t[0].radius, `#${seed} root`).toBeGreaterThan(0.5);
      const len = t[0].pos[2] - Math.min(...tail.map((n) => n.pos[2]));
      const body = t[t.length - 1].pos[2] + t[t.length - 1].radius - (t[0].pos[2] - t[0].radius);
      expect(len / body, `#${seed} length`).toBeGreaterThan(0.8);
    }
  });

  it('a chimera stands on its legs and carries a head on a neck', () => {
    // (it lay on its belly on sprawled legs behind a swollen sack of a head)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'chimera'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      expect(last, `#${seed} neck and head`).toBeGreaterThanOrEqual(2);
      const ry = (n: (typeof spine)[number]) => n.radius * (n.scale?.[1] ?? 1);
      const t = trunkOf(p);
      const D = 2 * Math.max(...t.map(ry));
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      const ground = Math.min(...feet.map((n) => n.pos[1] - n.radius));
      const belly = Math.min(...t.map((n) => n.pos[1] - ry(n)));
      expect((belly - ground) / D, `#${seed} clearance`).toBeGreaterThan(0.3);
      const skull = spine.filter((n) => n.segment === last)[0];
      expect((2 * ry(skull)) / D, `#${seed} head no bigger than its body`).toBeLessThan(0.9);
    }
  });

  it('a crocodile has long near-parallel jaws, its eyes on the skull behind them, and a tail to a point', () => {
    // (a blunt oval barely longer than wide — a toad's face — a mouth like a lip plate under the very
    // tip, and a tail that ended in a stub)
    for (let seed = 1; seed <= 12; seed++) {
      const g = genomeOfMorphotype(seed, 'crocodilian');
      const p = grow(g);
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1).sort((a, b) => a.pos[2] - b.pos[2]);
      expect(head.length, `#${seed} head links`).toBe(4);
      const rx = (n: (typeof head)[number]) => n.radius * (n.scale?.[0] ?? 1);
      const length = head[3].pos[2] + head[3].radius * (head[3].scale?.[2] ?? 1) - (head[0].pos[2] - head[0].radius * (head[0].scale?.[2] ?? 1));
      expect(length / (2 * rx(head[0])), `#${seed} long`).toBeGreaterThan(2);
      // near parallel: the snout's tip still over half the skull's width
      expect(rx(head[3]) / rx(head[0]), `#${seed} jaws`).toBeGreaterThan(0.5);
      const eye = p.nodes.find((n) => n.terminal === 'eye')!;
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      expect(eye.pos[2], `#${seed} eyes behind the jaws`).toBeLessThan(head[2].pos[2]);
      // the mouth sits along the snout (its line then runs back down the jaws), looking straight ahead
      const gene = g.body.child!.appendages.find((a) => a.terminal === 'mouth')!;
      expect(gene.attachT, `#${seed}`).toBeLessThan(0.7);
      expect(gene.attachElevation, `#${seed}`).toBeGreaterThan(1.4);
      expect(mouth.pos[2], `#${seed}`).toBeGreaterThan(head[2].pos[2]);
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      expect(tail[tail.length - 1].radius / tail[0].radius, `#${seed} tail to a point`).toBeLessThan(0.36);
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      expect((t[0].pos[2] - tail[tail.length - 1].pos[2]) / (t[t.length - 1].pos[2] - t[0].pos[2] + 1e-6), `#${seed} tail as long as the trunk`).toBeGreaterThan(0.75);
    }
  });

  it('a lizard holds its head up on a short neck and trails a long whip of a tail', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'lizard'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      expect(last, `#${seed} a neck and a head`).toBe(2);
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      const skull = spine.filter((n) => n.segment === last)[0];
      expect(skull.pos[1], `#${seed} head up`).toBeGreaterThan(t[t.length - 1].pos[1]);
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      expect(tail.length, `#${seed} tail links`).toBe(6);
      const tr = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      expect((tr[0].pos[2] - tail[tail.length - 1].pos[2]) / (tr[tr.length - 1].pos[2] - tr[0].pos[2]), `#${seed} tail as long as the trunk`).toBeGreaterThan(0.75);
      expect(tail[tail.length - 1].radius / tail[0].radius, `#${seed} whip`).toBeLessThan(0.4);
    }
  });

  it('a weasel is a slim tube barely wider than its short blunt head, with a tail thinner than its body', () => {
    // (a fat sausage three times the width of a rat's face, carried on into a body-thick nub)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'mustelid'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const head = spine.filter((n) => n.segment === last);
      const t = trunkOf(p);
      const girth = Math.max(...t.map((n) => n.radius));
      expect(head.length, `#${seed} short head`).toBe(2);
      expect(girth / head[0].radius, `#${seed} body vs head`).toBeLessThan(1.9);
      const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
      if (tail.length) expect(tail[0].radius / girth, `#${seed} tail`).toBeLessThan(0.45);
    }
  });

  it('an urchin is a ball of spines: dozens, straight, standing out all over it', () => {
    // (it had one ring of jointed arms curled under it as legs: a ball on a spider's legs)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'urchin'));
      const body = trunkOf(p)[0];
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const tips = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'spine');
      expect(tips.length, `#${seed} spines`).toBeGreaterThanOrEqual(40);
      let up = 0, down = 0;
      for (const tip of tips) {
        const root = p.nodes[parent.get(p.nodes.indexOf(tip))!];
        // straight out from the body: root → tip runs along the line from the body's centre
        const out = [root.pos[0] - body.pos[0], root.pos[1] - body.pos[1], root.pos[2] - body.pos[2]];
        const along = [tip.pos[0] - root.pos[0], tip.pos[1] - root.pos[1], tip.pos[2] - root.pos[2]];
        const dot = (out[0] * along[0] + out[1] * along[1] + out[2] * along[2]) / (Math.hypot(...out) * Math.hypot(...along));
        expect(dot, `#${seed} spine stands out`).toBeGreaterThan(0.9);
        // long and thin: several times the tip's width, a fair share of the body's radius
        expect(Math.hypot(...along) / body.radius, `#${seed} spine length`).toBeGreaterThan(0.6);
        expect(tip.radius / body.radius, `#${seed} spine thin`).toBeLessThan(0.12);
        if (tip.pos[1] > body.pos[1] + 0.3 * body.radius) up++;
        if (tip.pos[1] < body.pos[1] - 0.3 * body.radius) down++;
      }
      // all over it: above and below its middle alike
      expect(up, `#${seed} upper spines`).toBeGreaterThanOrEqual(12);
      expect(down, `#${seed} lower spines`).toBeGreaterThanOrEqual(8);
    }
  });

  it('a horror is its own thing: coiling tentacles low, feelers round a big maw, eyes round its flank', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = genomeOfMorphotype(seed, 'horror');
      const p = grow(g);
      const body = trunkOf(p)[0];
      const arms = g.body.appendages.filter((a) => a.kind === 'tentacle');
      expect(arms.length, `#${seed} rings`).toBe(2);
      const [low, high] = arms;
      // the lower ring: thick, long, leaving the body below its middle and curling up along its length
      expect(low.attachElevation, `#${seed}`).toBeLessThan(-0.3);
      expect(low.thickness / high.thickness, `#${seed} uneven`).toBeGreaterThan(1.8);
      expect(low.segments * low.length, `#${seed} uneven`).toBeGreaterThan(1.8 * high.segments * high.length);
      expect(Math.abs(low.curl[0]) * low.segments, `#${seed} coils`).toBeGreaterThan(1.1);
      expect(Math.abs(low.curl[1]), `#${seed} swirls`).toBeGreaterThan(0.12);
      // (they were dead-straight rods a twentieth of the body's width)
      const roots = p.nodes.filter((n, i) => n.part?.kind === 'tentacle' && p.edges.some(([a, b]) => b === i && p.nodes[a].kind === 'spine'));
      expect(Math.max(...roots.map((n) => n.radius)) / body.radius, `#${seed} thick at the root`).toBeGreaterThan(0.17);
      // the eyes ring the flank, each on its own (not a knot on the crown), below the maw
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      expect(eyes.length, `#${seed} eyes`).toBe(g.radialCount);
      for (const e of eyes) expect(e.pos[1], `#${seed} eye below the maw`).toBeLessThan(mouth.pos[1] - 0.2 * body.radius);
      for (let i = 0; i < eyes.length; i++) {
        for (let j = i + 1; j < eyes.length; j++) {
          const d = Math.hypot(eyes[i].pos[0] - eyes[j].pos[0], eyes[i].pos[1] - eyes[j].pos[1], eyes[i].pos[2] - eyes[j].pos[2]);
          expect(d, `#${seed} eyes apart`).toBeGreaterThan(1.2 * (eyes[i].radius + eyes[j].radius));
        }
      }
      // a ring mouth, on the crown
      const style = g.body.appendages.find((a) => a.terminal === 'mouth')!.style;
      expect(style, `#${seed} ring mouth`).toBeGreaterThanOrEqual(0.5);
      expect(style, `#${seed} ring mouth`).toBeLessThan(0.75);
    }
  });

  it('a slug is long and low with short slender eye stalks at its head end', () => {
    // (a two-link bean; stalks as long as the body and as thick as the eyes on them, or none at all)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      const ry = (n: (typeof t)[number]) => n.radius * (n.scale?.[1] ?? 1);
      const length = t[t.length - 1].pos[2] + t[t.length - 1].radius - (t[0].pos[2] - t[0].radius);
      expect(length / (2 * Math.max(...t.map(ry))), `#${seed} long and low`).toBeGreaterThan(3);
      // tapering to the tail
      expect(t[0].radius / Math.max(...t.map((n) => n.radius)), `#${seed} tail`).toBeLessThan(0.75);
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      expect(eyes.length, `#${seed} eyes`).toBe(2);
      const stalk = p.nodes.filter((n) => n.part?.kind === 'eyestalk' && n.kind === 'limb');
      expect(stalk.length, `#${seed} stalks`).toBeGreaterThanOrEqual(2);
      // slender: the stalk is thinner than the eye it carries
      for (const n of stalk) expect(n.radius, `#${seed} stalk`).toBeLessThan(0.75 * eyes[0].radius);
      // short: the eye stands up no more than a third of the body's length from where its stalk roots
      const root = stalk.reduce((a, b) => (b.pos[1] < a.pos[1] ? b : a));
      expect(Math.hypot(eyes[0].pos[0] - root.pos[0], eyes[0].pos[1] - root.pos[1], eyes[0].pos[2] - root.pos[2]) / length, `#${seed} stalk length`).toBeLessThan(0.34);
      // at the head end
      expect((eyes[0].pos[2] - t[0].pos[2]) / length, `#${seed} head end`).toBeGreaterThan(0.6);
    }
  });

  it('a shark has a long pointed snout with its mouth set back beneath it', () => {
    // (a blunt melon with a grin on its very tip, and no snout at all, read as a porpoise)
    for (let seed = 1; seed <= 16; seed++) {
      const g = genomeOfMorphotype(seed, 'shark');
      const p = grow(g);
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1).sort((a, b) => a.pos[2] - b.pos[2]);
      expect(head.length, `#${seed} head links`).toBe(3);
      expect(head[2].radius / head[0].radius, `#${seed} pointed`).toBeLessThan(0.55);
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      // the snout runs on past the mouth, and the mouth is on the underside
      expect(head[2].pos[2] + head[2].radius - mouth.pos[2], `#${seed} snout past the mouth`).toBeGreaterThan(0.25 * head[0].radius);
      expect(mouth.pos[1], `#${seed} mouth below the head's axis`).toBeLessThan(head[1].pos[1]);
      const eye = p.nodes.find((n) => n.terminal === 'eye')!;
      expect(eye.pos[1], `#${seed} eyes above the mouth`).toBeGreaterThan(mouth.pos[1]);
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
    const peak = (p: Phenotype) => Math.max(...trunkOf(p).map((n) => n.radius));
    // a legless body (a fish): the deepest link is exactly what an untapered chain's would be
    const f = genomeOfMorphotype(1, 'fish');
    const flatFish = grow({ ...f, body: { ...f.body, taper: 1 } });
    const heavyFish = grow({ ...f, body: { ...f.body, taper: 1.15 } });
    expect(peak(heavyFish)).toBeCloseTo(peak(flatFish), 6);
    expect(trunkOf(heavyFish)[0].radius).toBeLessThan(trunkOf(flatFish)[0].radius);
    // a four-legged runner: never more than that — and leaner, the middle's swell given up for a wedge
    const g = genomeOfMorphotype(1, 'felid');
    const flat = grow({ ...g, body: { ...g.body, taper: 1 } });
    const heavy = grow({ ...g, body: { ...g.body, taper: 1.15 } });
    expect(peak(heavy)).toBeLessThan(peak(flat));
    expect(peak(heavy)).toBeGreaterThan(0.75 * peak(flat));
    expect(trunkOf(heavy)[0].radius).toBeLessThan(trunkOf(flat)[0].radius);
  });

  it('a cat or a dog is a wedge, not a bean: deepest at the chest, drawn up behind it, no hump', () => {
    // (the trunk's middle link was its deepest and highest — a third fatter than chest or hips — so
    // every cat and dog stood hunched over a pot belly, the head hung off the front like a grazing fawn)
    for (const id of ['felid', 'canid']) {
      for (let seed = 1; seed <= 16; seed++) {
        const t = trunkOf(grow(genomeOfMorphotype(seed, id))).sort((a, b) => a.pos[2] - b.pos[2]);
        const depth = t.map((n) => n.radius * (n.scale?.[1] ?? 1));
        const chest = depth[depth.length - 1];
        // the chest (the front link, where the shoulders are) is the deepest part, or within a hair of it
        expect(Math.max(...depth) / chest, `${id} #${seed} chest deepest`).toBeLessThan(1.04);
        // …and the hips are shallower than the chest
        expect(depth[0] / chest, `${id} #${seed} hips`).toBeLessThan(0.95);
        // the back: no link's top stands above the line from hips to withers by more than a little
        const top = t.map((n, i) => n.pos[1] + depth[i]);
        for (let i = 1; i < t.length - 1; i++) {
          const u = (t[i].pos[2] - t[0].pos[2]) / (t[t.length - 1].pos[2] - t[0].pos[2]);
          const line = top[0] + (top[top.length - 1] - top[0]) * u;
          expect((top[i] - line) / (2 * chest), `${id} #${seed} hump at link ${i}`).toBeLessThan(0.08);
        }
      }
    }
  });

  it('a cat’s head is big and round on a thick neck, a dog’s carried above its back — not a fawn’s', () => {
    for (const [id, cranium, neckMin] of [['felid', 0.52, 0.6], ['canid', 0.46, 0.52]] as const) {
      for (let seed = 1; seed <= 16; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const spine = p.nodes.filter((n) => n.kind === 'spine');
        const last = Math.max(...spine.map((n) => n.segment ?? 0));
        const ry = (n: (typeof spine)[number]) => n.radius * (n.scale?.[1] ?? 1);
        const t = trunkOf(p);
        const D = 2 * Math.max(...t.map(ry));
        const skull = spine.filter((n) => n.segment === last)[0];
        const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
        // (the skull was 0.38–0.51 of the chest's depth, the neck under half of it)
        expect((2 * ry(skull)) / D, `${id} #${seed} skull`).toBeGreaterThan(cranium);
        expect((2 * Math.min(...neck.map(ry))) / D, `${id} #${seed} neck`).toBeGreaterThan(neckMin);
        // the crown rides above the line of the back
        const back = Math.max(...t.map((n) => n.pos[1] + ry(n)));
        expect(skull.pos[1] + ry(skull), `${id} #${seed} crown`).toBeGreaterThan(back);
      }
    }
  });

  it('a haunch is part of the body it hangs from, never a second body beside it', () => {
    // (a bear's hips were 0.9 of its chest's depth across: four balls, the trunk a peanut between them)
    for (const id of ['ursid', 'felid', 'canid', 'ungulate', 'rodent', 'mustelid']) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const parent = new Map(p.edges.map(([a, b]) => [b, a]));
        const girth = Math.max(...trunkOf(p).map((n) => n.radius));
        p.nodes.forEach((n, i) => {
          const par = p.nodes[parent.get(i) ?? -1];
          if (n.part?.kind !== 'leg' || !par || par.kind !== 'spine') return; // a leg's root link
          expect(n.radius / girth, `${id} #${seed}`).toBeLessThan(0.7);
        });
      }
    }
  });

  it('a mouse is a sleek teardrop on thin legs: widest at the haunch, not a barrel on columns', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'rodent'));
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      expect(t.length, `#${seed}`).toBe(3);
      // narrower at the shoulders than behind them (the dorsal outline was a knobbly barrel)
      expect(t[2].radius, `#${seed} shoulders`).toBeLessThan(Math.max(t[0].radius, t[1].radius));
      // legs a fraction of the body's girth (the hips were two-thirds of it: shoulder and haunch lobes)
      const girth = Math.max(...t.map((n) => n.radius));
      const legs = p.nodes.filter((n) => n.part?.kind === 'leg' && n.kind === 'limb');
      expect(Math.max(...legs.map((n) => n.radius)) / girth, `#${seed} legs`).toBeLessThan(0.5);
      // …and the body is longer than a ball: at least 1.6 depths from rump to chest
      expect((t[2].pos[2] + t[2].radius - (t[0].pos[2] - t[0].radius)) / (2 * girth), `#${seed} length`).toBeGreaterThan(1.6);
    }
  });

  it('a bear has a broad skull and a short blunt muzzle on short thick limbs — not a capybara’s cone', () => {
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ursid'));
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const last = Math.max(...spine.map((n) => n.segment ?? 0));
      const head = spine.filter((n) => n.segment === last);
      // a cranium and one muzzle link (three links tapered evenly from brow to nose: a rodent's snout)
      expect(head.length, `#${seed}`).toBe(2);
      const ry = (n: (typeof spine)[number]) => n.radius * (n.scale?.[1] ?? 1);
      const tip = head[1];
      const len = tip.pos[2] + tip.radius * (tip.scale?.[2] ?? 1) - (head[0].pos[2] - head[0].radius);
      expect(len / (2 * ry(head[0])), `#${seed} head length`).toBeLessThan(1.8);
      // the limb below the haunch stays thick: the thinnest link over a fifth of the chest's depth
      const t = trunkOf(p);
      const D = 2 * Math.max(...t.map(ry));
      const legs = p.nodes.filter((n) => n.part?.kind === 'leg' && n.kind === 'limb');
      expect((2 * Math.min(...legs.map((n) => n.radius))) / D, `#${seed} shank`).toBeGreaterThan(0.2);
    }
  });

  it('ears are flaps on the skull, not lumps in it: rooted on its surface, set apart on its upper corners', () => {
    for (const id of ['felid', 'canid', 'ursid', 'rodent', 'mustelid', 'ungulate']) {
      let seen = 0;
      for (let seed = 1; seed <= 16; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const ears = p.nodes.filter((n) => n.terminal === 'ear');
        if (ears.length === 0) continue;
        seen++;
        expect(ears.length, `${id} #${seed}`).toBe(2);
        const parent = new Map(p.edges.map(([a, b]) => [b, a]));
        const skull = p.nodes[parent.get(p.nodes.indexOf(ears[0]))!];
        const rx = skull.radius * (skull.scale?.[0] ?? 1);
        for (const e of ears) {
          // on the surface: its root is within a fraction of its own size of the skull's skin (it stood
          // half its width proud, on a ball of skin meshed in to hide the gap — two lobes on every cat)
          const d = Math.hypot(e.pos[0] - skull.pos[0], e.pos[1] - skull.pos[1], e.pos[2] - skull.pos[2]);
          expect(d, `${id} #${seed} proud`).toBeLessThan(skull.radius * 1.25 + 0.2 * e.radius);
          // set apart: each well to its own side of the midline, and on the upper half of the skull
          expect(Math.abs(e.pos[0]) / rx, `${id} #${seed} apart`).toBeGreaterThan(0.3);
          expect(e.pos[1], `${id} #${seed} up`).toBeGreaterThan(skull.pos[1]);
        }
        expect(ears[0].pos[0] * ears[1].pos[0], `${id} #${seed} one each side`).toBeLessThan(0);
      }
      expect(seen, `${id} has ears`).toBeGreaterThan(8);
    }
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

  it('lizards and crocodiles sprawl: the upper leg reaches out to the side, not down like a post', () => {
    // (the sprawl starts at a splay of 0.5, and a third of crocodiles drew less: thin column legs under
    // a long body)
    for (const id of ['lizard', 'crocodilian']) {
      for (let seed = 1; seed <= 12; seed++) {
        for (const l of legChains(grow(genomeOfMorphotype(seed, id)))) {
          const [hip, knee] = l.nodes;
          const out = Math.abs(knee.pos[0]) - Math.abs(hip.pos[0]);
          const len = Math.hypot(knee.pos[0] - hip.pos[0], knee.pos[1] - hip.pos[1], knee.pos[2] - hip.pos[2]);
          expect(out / len, `${id} #${seed}`).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it("a body's legs agree: they all sprawl or all stand — never sprawled forelegs on post hind legs", () => {
    let mixedBodies = 0;
    let checked = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const p = grow(randomGenome(seed));
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      // per trunk node: does each leg hanging from it reach out (a sprawl) or drop (a column)?
      const bySection = new Map<number, Set<boolean>>();
      for (const l of legChains(p)) {
        if (l.nodes.length < 3) continue;
        const [hip, knee] = l.nodes;
        if (knee.pos[1] > hip.pos[1] + 0.02) continue; // an arched (arthropod) leg: neither
        const out = Math.abs(knee.pos[0]) - Math.abs(hip.pos[0]);
        const len = Math.hypot(knee.pos[0] - hip.pos[0], knee.pos[1] - hip.pos[1], knee.pos[2] - hip.pos[2]);
        const base = p.nodes[parent.get(p.nodes.indexOf(hip))!];
        const seg = base.segment ?? 0;
        if (!bySection.has(seg)) bySection.set(seg, new Set());
        bySection.get(seg)!.add(out / len > 0.6);
      }
      for (const kinds of bySection.values()) {
        checked++;
        if (kinds.size > 1) mixedBodies++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(mixedBodies).toBe(0);
    // and one whose genes sit either side of the line (as a turtle's could): one stance for both pairs
    const g = genomeOfMorphotype(2, 'lizard');
    const [hind, fore] = g.body.appendages.filter((a) => a.kind === 'leg').sort((a, b) => a.attachT - b.attachT);
    hind.attachAzimuth = 3.97; // splay ≈ 0.46
    fore.attachAzimuth = 3.86; // splay ≈ 0.53
    const stances = new Set(
      legChains(grow(g)).map((l) => {
        const [hip, knee] = l.nodes;
        const len = Math.hypot(knee.pos[0] - hip.pos[0], knee.pos[1] - hip.pos[1], knee.pos[2] - hip.pos[2]);
        return (Math.abs(knee.pos[0]) - Math.abs(hip.pos[0])) / len > 0.6;
      }),
    );
    expect(stances.size).toBe(1);
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

  it('a frog sits up on its forelegs, its long hind feet folded forward beside it', () => {
    // (it lay on its belly like a pillow, the hind legs swollen into round lobes at its rump)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'anuran'));
      const t = trunkOf(p).sort((a, b) => a.pos[2] - b.pos[2]);
      expect(t.length, `#${seed}`).toBeGreaterThanOrEqual(2);
      // the chest rides higher than the rump
      expect(t[t.length - 1].pos[1] - t[0].pos[1], `#${seed} chest up`).toBeGreaterThan(0.05);
      const legs = legChains(p);
      const hind = legs.filter((l) => l.attachT < 0.5);
      const fore = legs.filter((l) => l.attachT >= 0.5);
      expect(hind.length && fore.length, `#${seed}`).toBeTruthy();
      for (const { nodes } of hind) {
        // thigh forward, shin back, and the long foot forward again along the ground: a Z
        expect(nodes.length, `#${seed} hind links`).toBeGreaterThanOrEqual(4);
        const [, , ankle, toe] = nodes;
        expect(toe.pos[2], `#${seed} foot forward`).toBeGreaterThan(ankle.pos[2]);
        // a muscular thigh, not a lobe as big as the body
        expect(nodes[0].radius, `#${seed} haunch`).toBeLessThan(0.85 * Math.max(...t.map((n) => n.radius)));
      }
      // the forelegs reach down from the raised chest to the ground
      for (const { nodes } of fore) expect(nodes[0].pos[1] - nodes[nodes.length - 1].pos[1], `#${seed} fore reach`).toBeGreaterThan(0.25);
      // and big eyes bulge from the top of the head
      const head = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) > 0);
      const headW = Math.max(...head.map((n) => n.radius * (n.scale?.[0] ?? 1)));
      const eye = p.nodes.find((n) => n.terminal === 'eye');
      expect(eye!.radius / headW, `#${seed} eye`).toBeGreaterThan(0.16);
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

  it('an octopus: a tall mantle over arms that root beneath it and sprawl along the ground', () => {
    // (its arms left the middle of a round body and curled up at every joint: an umbrella blown
    // inside out, with the eyes and the beak on top)
    for (let seed = 1; seed <= 10; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'cephalopod'));
      const body = p.nodes.filter((n) => n.kind === 'spine');
      expect(body.length, `#${seed}`).toBe(1);
      const B = body[0];
      const halfH = B.radius * (B.scale?.[1] ?? 1);
      const halfW = B.radius * Math.max(B.scale?.[0] ?? 1, B.scale?.[2] ?? 1);
      expect(halfH / halfW, `#${seed} mantle`).toBeGreaterThan(1.15);
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const arms = p.nodes.filter((n) => n.part?.kind === 'tentacle');
      const roots = arms.filter((n) => p.nodes[parent.get(p.nodes.indexOf(n))!] === B);
      expect(roots.length, `#${seed}`).toBeGreaterThanOrEqual(6);
      // rooted on the underside…
      for (const r of roots) expect(r.pos[1] - B.pos[1], `#${seed} root`).toBeLessThan(-0.5 * halfH);
      // …and lying low: no arm rises above the mantle's middle, and the tips reach well out
      const reach = Math.max(...arms.map((n) => Math.hypot(n.pos[0] - B.pos[0], n.pos[2] - B.pos[2])));
      for (const n of arms) expect(n.pos[1], `#${seed} arm low`).toBeLessThan(B.pos[1]);
      expect(reach, `#${seed} sprawl`).toBeGreaterThan(1.5 * halfW);
      // the eyes ring the mantle below its top; the beak is underneath
      for (const e of p.nodes.filter((n) => n.terminal === 'eye')) expect(e.pos[1] - B.pos[1], `#${seed} eye`).toBeLessThan(0.6 * halfH);
      const mouth = p.nodes.find((n) => n.terminal === 'mouth')!;
      expect(mouth.pos[1], `#${seed} beak`).toBeLessThan(B.pos[1] - 0.5 * halfH);
    }
  });

  it("a cat's or a dog's tail sweeps back and levels out or curves up — not a stick falling to the ground", () => {
    // (drooped steeply with a downward curl, it ran straight to the floor: from behind, a fifth leg)
    for (const id of ['felid', 'canid']) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const tail = p.nodes.filter((n) => n.part?.kind === 'tail').sort((a, b) => b.pos[2] - a.pos[2]); // root → tip
        if (tail.length < 3) continue;
        const [prev, tip] = tail.slice(-2);
        const ground = Math.min(...p.nodes.filter((n) => n.part?.kind === 'leg' && n.kind === 'terminal').map((n) => n.pos[1]));
        expect((tip.pos[1] - prev.pos[1]) / Math.abs(tip.pos[2] - prev.pos[2]), `${id} #${seed} tip level`).toBeGreaterThan(-0.35);
        expect(tip.pos[1] - ground, `${id} #${seed} off the ground`).toBeGreaterThan(0.25 * (p.bounds.max[1] - ground));
        expect(tip.pos[2], `${id} #${seed} behind`).toBeLessThan(tail[0].pos[2]);
      }
    }
  });

  it("an ape's arms hang down from its shoulders to the ground in front of it — not swept out behind", () => {
    // (aimed out and back, they ran out to the sides and lay along the floor behind the shoulders: in
    // a thumbnail the ape was a hunched lump sliding on its belly)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'primate'));
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      for (let i = 0; i < p.nodes.length; i++) {
        const h = p.nodes[i];
        if (h.terminal !== 'hand') continue;
        let s = i;
        while (p.nodes[parent.get(s)!].part?.kind === 'arm') s = parent.get(s)!;
        const S = p.nodes[s].pos;
        const d = [h.pos[0] - S[0], h.pos[1] - S[1], h.pos[2] - S[2]];
        const len = Math.hypot(d[0], d[1], d[2]);
        expect(-d[1] / len, `#${seed} hangs down`).toBeGreaterThan(0.75);
        expect(d[2], `#${seed} not behind`).toBeGreaterThan(-0.05 * len);
        expect(Math.abs(h.pos[0]) - Math.abs(S[0]), `#${seed} not splayed`).toBeLessThan(0.5 * len);
      }
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
        expect(c.radius, `#${seed} a big claw`).toBeGreaterThan(1.4 * Math.max(...hips.map((h) => h.radius)));
      }
      const feet = p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
      expect(feet.length, `#${seed} legs`).toBe(8);
      for (const f of feet) expect(Math.abs(f.pos[0]), `#${seed} splayed`).toBeGreaterThan(halfW * 1.15);
    }
  });

  it("a crab's legs arch out and down to points planted wide, the body slung low between them", () => {
    // (out level and then straight down on two links, they were the legs of a table: the crab stood
    // as tall as it was wide, a tick on stilts)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const body = trunkOf(p)[0];
      const s = body.scale ?? [1, 1, 1];
      const belly = body.pos[1] - body.radius * s[1];
      const tall = 2 * body.radius * s[1];
      const legs = legChains(p);
      expect(legs.length, `#${seed}`).toBe(8);
      for (const { nodes } of legs) {
        expect(nodes.length, `#${seed} links`).toBe(4);
        const [hip, knee, shin, foot] = nodes;
        expect(knee.pos[1], `#${seed} the knee rises over the hip`).toBeGreaterThan(hip.pos[1] + 0.15);
        expect(Math.abs(shin.pos[0]), `#${seed} runs on outward`).toBeGreaterThan(Math.abs(knee.pos[0]));
        expect(shin.pos[1], `#${seed} and down`).toBeLessThan(knee.pos[1]);
        // the last link still leans outward: a point planted wide, not a post under the knee
        expect(Math.abs(foot.pos[0]), `#${seed} planted wide`).toBeGreaterThan(Math.abs(shin.pos[0]) + 0.1);
        // slung low: the belly clears the ground by a fraction of the body's own depth
        const clear = belly - foot.pos[1];
        expect(clear / tall, `#${seed} off the ground`).toBeGreaterThan(0.04);
        expect(clear / tall, `#${seed} slung low`).toBeLessThan(0.35);
      }
    }
  });

  it("a crab's eyes stand on slender stalks at the front rim of its shell — every crab's", () => {
    // (one crab in twenty had no stalks and its eyes were buried under the shell: no face at all;
    // the rest wore thick chimneys rising from the middle of the dome, splayed like horns)
    for (let seed = 1; seed <= 24; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'crab'));
      const body = trunkOf(p)[0];
      const s = body.scale ?? [1, 1, 1];
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const eyes = p.nodes.map((n, i) => ({ n, i })).filter((e) => e.n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBe(2);
      for (const { n: eye, i } of eyes) {
        const stalk = p.nodes[parent.get(i)!];
        expect(stalk.part?.kind, `#${seed} on a stalk`).toBe('eyestalk');
        expect(stalk.kind, `#${seed} on a stalk`).toBe('limb');
        expect(stalk.radius, `#${seed} slender`).toBeLessThan(0.7 * eye.radius);
        // at the front, either side of the middle
        expect(eye.pos[2], `#${seed} at the front`).toBeGreaterThan(body.pos[2] + 0.7 * body.radius * s[2]);
        expect(Math.abs(eye.pos[0]), `#${seed} apart`).toBeGreaterThan(0.3 * body.radius * s[0]);
        // standing up: the eye well above where its stalk leaves the body
        expect(eye.pos[1] - stalk.pos[1], `#${seed} standing`).toBeGreaterThan(0.6 * Math.hypot(eye.pos[0] - stalk.pos[0], eye.pos[2] - stalk.pos[2]));
        expect(eye.pos[1], `#${seed} up at the shell's top`).toBeGreaterThan(body.pos[1] + 0.8 * body.radius * s[1]);
      }
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

describe('bred bodies keep the rules their founders keep', () => {
  const sections = (g: Genome) => {
    const out: SegmentGene[] = [];
    for (let s: SegmentGene | undefined = g.body; s; s = s.child) out.push(s);
    return out;
  };

  it('an ear is one flap seated on the skull, however many links its gene asks for', () => {
    // (founders' ears have one link; mutation jitters every part's link count, and one child in
    // twenty of a cat, dog, mouse, deer or bear — a third of all litters — grew a two-link ear:
    // a flap hovering a fifth of a body unit above the head, since ears are left out of the skin)
    const ears = (p: Phenotype) => p.nodes.filter((n) => n.part?.kind === 'ear');
    let seen = 0;
    for (const id of ['felid', 'canid', 'rodent', 'ungulate', 'ursid']) {
      for (let seed = 1; seed <= 6; seed++) {
        const g = genomeOfMorphotype(seed, id);
        const one = ears(grow(g));
        if (one.length === 0) continue;
        seen++;
        for (const links of [2, 3, 6]) {
          const h = structuredClone(g);
          for (const s of sections(h)) for (const a of s.appendages) if (a.terminal === 'ear') a.segments = links;
          const many = ears(grow(h));
          expect(many.length, `${id} #${seed} ×${links}`).toBe(one.length);
          many.forEach((n, i) => {
            expect(n.terminal, `${id} #${seed} ×${links}`).toBe('ear');
            for (let k = 0; k < 3; k++) expect(n.pos[k], `${id} #${seed} ×${links}`).toBeCloseTo(one[i].pos[k], 9);
          });
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('a one-link trunk is not shrunk by a taper it has no chest to shape with', () => {
    // (the four-legged runner's tuck read the taper gene of any trunk with two pairs of legs: a crab's
    // single link lost a fifth of its radius — a quarter of its mass, a sixth of its health and its
    // bite in the valley — as that idle gene drifted up, under an unchanged shell)
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = genomeOfMorphotype(seed, 'crab');
      if (g.body.repeat !== 1) continue;
      seen++;
      const at = (taper: number) => {
        const h = structuredClone(g);
        h.body.taper = taper;
        return trunkOf(grow(h))[0].radius;
      };
      for (const taper of [1.03, 1.06, 1.11, 1.15]) expect(at(taper), `crab #${seed} taper ${taper}`).toBeCloseTo(at(1), 9);
    }
    expect(seen).toBeGreaterThan(6);
  });

  it('a trunk rears by degrees: no one step of its lean takes the legs from mid-body to the rump', () => {
    // (one threshold at −0.26, 0.005 from the most upright hawk: a tenth of all hawk chicks — one in
    // every other litter — stood on two pegs under its back third)
    expect(rearedness(-0.255)).toBe(0); // the most upright hawk: a level walker still
    expect(rearedness(-0.34)).toBe(1); // the least upright ape: reared
    expect(bipedSlot(-0.2)).toBeCloseTo(0.55, 9);
    expect(bipedSlot(-0.4)).toBeCloseTo(0.06, 9);
    for (let pitch = -0.2; pitch > -0.42; pitch -= 0.005) expect(bipedSlot(pitch - 0.005)).toBeLessThanOrEqual(bipedSlot(pitch));

    // the hips' place along the trunk (0 its rear end … 1 its front), as the lean is swept
    const hipsAt = (p: Phenotype) => {
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const t = trunkOf(p);
      const a = t[0].pos, b = t[t.length - 1].pos;
      const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const len2 = ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2;
      const ts: number[] = [];
      p.nodes.forEach((n, i) => {
        const up = parent.get(i);
        if (n.part?.kind !== 'leg' || up === undefined || p.nodes[up].part?.kind === 'leg') return;
        ts.push(((n.pos[0] - a[0]) * ax[0] + (n.pos[1] - a[1]) * ax[1] + (n.pos[2] - a[2]) * ax[2]) / len2);
      });
      return ts.reduce((x, y) => x + y, 0) / ts.length;
    };
    for (const id of ['raptor', 'bird', 'wyvern', 'primate']) {
      for (let seed = 1; seed <= 6; seed++) {
        const g = genomeOfMorphotype(seed, id);
        const at = (pitch: number) => {
          const h = structuredClone(g);
          h.body.curve = [pitch, h.body.curve[1]];
          return hipsAt(grow(h));
        };
        let was = at(-0.2);
        for (let k = 1; k <= 22; k++) {
          const now = at(-0.2 - 0.01 * k);
          expect(Math.abs(now - was), `${id} #${seed} at ${(-0.2 - 0.01 * k).toFixed(2)}`).toBeLessThan(0.14);
          was = now;
        }
        // a level body's legs under its middle, an upright one's under its pelvis
        expect(at(-0.2), `${id} #${seed}`).toBeGreaterThan(0.35);
        expect(at(-0.42), `${id} #${seed}`).toBeLessThan(0.2);
      }
    }
  });
});
