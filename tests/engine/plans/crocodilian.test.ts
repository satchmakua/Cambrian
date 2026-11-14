import { describe, it, expect } from 'vitest';
import { grow, isScullingTail, SCULL_STYLE, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../../src/engine/random';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { scutePlan, scullingTail } from '../../../src/viewer/scutes';
import { buildMeshData } from '../../../src/viewer/meshData';
import { bulgingEye, eyeSeat, isFaceEye } from '../../../src/viewer/eyeSeat';
import { qRotateV } from '../../../src/viewer/bodyField';

type Node = Phenotype['nodes'][number];
const rx = (n: Node) => n.radius * (n.scale?.[0] ?? 1);
const ry = (n: Node) => n.radius * (n.scale?.[1] ?? 1);
const rz = (n: Node) => n.radius * (n.scale?.[2] ?? 1);

/** A crocodile's parts, front to back. */
function parts(p: Phenotype) {
  const spine = p.nodes.filter((n) => n.kind === 'spine');
  const last = Math.max(...spine.map((n) => n.segment ?? 0));
  const trunk = spine.filter((n) => (n.segment ?? 0) === 0);
  const neck = spine.filter((n) => (n.segment ?? 0) > 0 && (n.segment ?? 0) < last);
  const head = spine.filter((n) => (n.segment ?? 0) === last);
  const tail = p.nodes.filter((n) => n.part?.kind === 'tail');
  const snout = head[head.length - 1].pos[2] + rz(head[head.length - 1]);
  const skullBack = head[0].pos[2] - 0.5 * rx(head[0]);
  const tailTip = tail[tail.length - 1].pos[2];
  return { last, trunk, neck, head, tail, snout, skullBack, tailTip, total: snout - tailTip, W: Math.max(...trunk.map(rx)) };
}

const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const croc = (seed: number) => grow(genomeOfMorphotype(seed, 'crocodilian'));

describe('crocodilian', () => {
  it('carries a skull narrower than its body, tapering to a snout half as wide again', () => {
    // (the head was a loaf as wide and as deep as the trunk and a third of the animal's length, its
    // sides near parallel: from above the whole animal was one lozenge — a log with eyes)
    for (const seed of SEEDS) {
      const { head, trunk, W, snout, skullBack, total } = parts(croc(seed));
      expect(head.length, `#${seed} head links`).toBe(4);
      expect(rx(head[0]) / W, `#${seed} skull against the body's width`).toBeLessThan(0.78);
      expect(rx(head[0]) / W, `#${seed} skull against the body's width`).toBeGreaterThan(0.45);
      expect(rx(head[3]) / rx(head[0]), `#${seed} snout tip against the skull`).toBeLessThan(0.56);
      // flat: a head half as deep as it is wide, and shallower than the back behind it
      expect(ry(head[0]) / rx(head[0]), `#${seed} skull depth`).toBeLessThan(0.7);
      expect(ry(head[0]), `#${seed}`).toBeLessThan(0.75 * Math.max(...trunk.map(ry)));
      // about a seventh of the animal, and near twice as long as the skull is wide
      expect((snout - skullBack) / total, `#${seed} head's share of the length`).toBeLessThan(0.2);
      expect((snout - skullBack) / total, `#${seed} head's share of the length`).toBeGreaterThan(0.1);
      expect((snout - skullBack) / (2 * rx(head[0])), `#${seed} head length against its width`).toBeGreaterThan(1.6);
    }
  });

  it('has a neck: a pinch between the shoulders and the back of the skull', () => {
    // (the skull sat straight on the shoulders, as wide as they were)
    for (const seed of SEEDS) {
      const { last, neck, head, trunk } = parts(croc(seed));
      expect(last, `#${seed} trunk, neck, head`).toBe(2);
      expect(neck.length, `#${seed}`).toBe(1);
      expect(rx(neck[0]), `#${seed} neck against the skull`).toBeLessThan(rx(head[0]));
      expect(rx(neck[0]), `#${seed} neck against the shoulders`).toBeLessThan(0.85 * rx(trunk[trunk.length - 1]));
      // a short one, held level: the head is no higher than the back
      const back = Math.max(...trunk.map((n) => n.pos[1] + ry(n)));
      expect(head[0].pos[1] + ry(head[0]), `#${seed} head below the back`).toBeLessThan(back + 0.05);
    }
  });

  it('lies level and broad-chested: shoulders as wide as the hips, the snout no higher than the rump', () => {
    // (a third of them tapered to shoulders half the width of the hips, and a few held the chest up
    // off the ground with the snout in the air)
    for (const seed of SEEDS) {
      const { trunk, head, W } = parts(croc(seed));
      expect(rx(trunk[trunk.length - 1]) / rx(trunk[0]), `#${seed} shoulders against hips`).toBeGreaterThan(0.72);
      expect(Math.abs(head[3].pos[1] - trunk[0].pos[1]) / W, `#${seed} snout level with the rump`).toBeLessThan(0.45);
      // wider than deep, but not a plank
      const D = Math.max(...trunk.map(ry));
      expect(D / W, `#${seed} trunk depth against width`).toBeGreaterThan(0.6);
      expect(D / W, `#${seed} trunk depth against width`).toBeLessThan(0.9);
    }
  });

  it("sets its eyes apart on the skull's upper edges, not together on its crown", () => {
    // (two dots side by side in the middle of the head: a quarter of the skull's half-width out)
    for (const seed of SEEDS) {
      const p = croc(seed);
      const { head } = parts(p);
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      expect(eyes.length, `#${seed}`).toBe(2);
      for (const e of eyes) {
        expect(Math.abs(e.pos[0]) / rx(head[0]), `#${seed} eye out from the midline`).toBeGreaterThan(0.42);
        expect(e.pos[1], `#${seed} eye on top`).toBeGreaterThan(head[0].pos[1] + 0.5 * ry(head[0]));
        expect(e.pos[2], `#${seed} eye on the skull, behind the snout`).toBeLessThan(head[1].pos[2]);
      }
    }
  });

  it("its eyes ride raised, half out of the skull — a lizard's stay sunk in it", () => {
    const raised = (p: Phenotype) =>
      buildMeshData(p)
        .features.filter((f) => f.type === 'eye' && isFaceEye(p, f))
        .map((f) => bulgingEye(p, qRotateV(eyeSeat(p, f.idx, f.quat, Math.max(f.radius, 0.06)).quat, [0, 0, 1])));
    for (const seed of SEEDS.slice(0, 10)) {
      const eyes = raised(croc(seed));
      expect(eyes.length, `#${seed}`).toBe(2);
      expect(eyes.every(Boolean), `#${seed}`).toBe(true);
      expect(raised(grow(genomeOfMorphotype(seed, 'lizard'))).some(Boolean), `lizard #${seed}`).toBe(false);
    }
  });

  it('trails a tail near half its length that turns into a blade: deep, and thin from above', () => {
    // (a round cone a third of the animal's length, lifting off the ground toward its tip)
    for (const seed of SEEDS) {
      const p = croc(seed);
      const { tail, trunk, tailTip, total } = parts(p);
      expect(tail.length, `#${seed}`).toBe(6);
      const rump = trunk[0].pos[2] - 0.5 * rz(trunk[0]);
      expect((rump - tailTip) / total, `#${seed} tail's share of the length`).toBeGreaterThan(0.36);
      expect((rump - tailTip) / total, `#${seed} tail's share of the length`).toBeLessThan(0.52);
      // round where it leaves the rump, a blade by the tip
      expect(tail[0].scale, `#${seed} root`).toBeUndefined();
      const tip = tail[tail.length - 1];
      expect(rx(tip) / ry(tip), `#${seed} tip`).toBeLessThan(0.55);
      const mid = tail[3];
      expect(ry(mid) / mid.radius, `#${seed} mid-tail depth`).toBeGreaterThan(1.25);
      expect(rx(mid) / mid.radius, `#${seed} mid-tail width`).toBeLessThan(0.8);
      // it lies along the ground: the tip is below the hips, its lower edge not under the feet
      expect(tip.pos[1], `#${seed} tip`).toBeLessThan(trunk[0].pos[1]);
      const ground = Math.min(...p.nodes.filter((n) => n.kind === 'terminal' && n.part?.kind === 'leg').map((n) => n.pos[1]));
      for (const n of tail) expect(n.pos[1] - ry(n) * 0.85, `#${seed} tail on the floor`).toBeGreaterThan(ground - 1e-6);
    }
  });

  it("the blade is in the skin: at mid-tail the surface is further off above the link than beside it", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const p = croc(seed);
      const f = buildFieldPrims(p, 'body');
      f.k = 0;
      const n = parts(p).tail[3];
      const [x, y, z] = n.pos;
      // inside a little above where a round link's skin would be, outside a little short of its side
      expect(fieldAt(f, x, y + n.radius * 1.12, z), `#${seed} above`).toBeLessThan(0);
      expect(fieldAt(f, x + n.radius * 0.95, y, z), `#${seed} beside`).toBeGreaterThan(0);
    }
  });

  it('wears rows of scutes down its back and a crest along its tail — and no cones stood on the midline', () => {
    // (a bare back, or three dark cones point-down on it that read as buttons)
    for (const seed of SEEDS.slice(0, 10)) {
      const p = croc(seed);
      expect(p.nodes.some((n) => n.part?.kind === 'spine'), `#${seed}`).toBe(false);
      const { trunk, neck, tail, W } = parts(p);
      const scutes = scutePlan(p);
      const back = scutes.filter((s) => s.on === 'back');
      const crest = scutes.filter((s) => s.on === 'tail');
      expect(back.length, `#${seed} back scutes`).toBeGreaterThan(60);
      expect(crest.length, `#${seed} crest blades`).toBeGreaterThan(20);
      // at least four rows across the back, mirrored left and right
      const rows = new Set(back.map((s) => Math.round(s.at[0] / (0.26 * W))));
      expect(rows.size, `#${seed} rows`).toBeGreaterThanOrEqual(4);
      expect(back.filter((s) => s.at[0] > 0).length, `#${seed} mirrored`).toBe(back.filter((s) => s.at[0] < 0).length);
      // they run from the hips to the neck, each riding a link of the back; the crest rides the tail
      const backIdx = new Set([...trunk, ...neck].map((n) => p.nodes.indexOf(n)));
      for (const s of back) expect(backIdx.has(s.node), `#${seed}`).toBe(true);
      const zs = back.map((s) => s.at[2]);
      expect(Math.min(...zs), `#${seed} from the hips`).toBeLessThan(trunk[0].pos[2] + 0.45 * W);
      expect(Math.max(...zs), `#${seed} to the neck`).toBeGreaterThan(trunk[trunk.length - 1].pos[2]);
      const tipZ = tail[tail.length - 1].pos[2];
      expect(Math.min(...crest.map((s) => s.at[2])), `#${seed} crest to the tip`).toBeLessThan(tipZ + 0.2 * (trunk[0].pos[2] - tipZ));
      // two crests off the hips close into one down the tail's far half
      const midZ = (trunk[0].pos[2] + tipZ) / 2;
      expect(crest.some((s) => s.at[2] > midZ && Math.abs(s.at[0]) > 0.05 * W), `#${seed} a double crest`).toBe(true);
      for (const s of crest) if (s.at[2] < midZ) expect(Math.abs(s.at[0]), `#${seed} a single crest`).toBeLessThan(1e-6);
      // every plate is seated on the skin (the hybrid surface it is drawn on), keel up
      const f = buildFieldPrims(p, 'hybrid');
      let meanR = 0;
      for (let i = 0; i < f.nc; i++) meanR += f.pr[i];
      f.k = (0.34 * meanR) / f.nc;
      for (const s of scutes) {
        expect(Math.abs(fieldAt(f, s.at[0], s.at[1], s.at[2])), `#${seed} seated`).toBeLessThan(0.01);
        expect(s.up[1], `#${seed} keel up`).toBeGreaterThan(0.45);
        expect(s.h, `#${seed}`).toBeGreaterThan(0.02);
      }
      // …and one boss on top of the snout's tip, carrying the nostrils clear of the flat jaw
      const { head } = parts(p);
      const nose = scutes.filter((s) => s.on === 'snout');
      expect(nose.length, `#${seed} nostril boss`).toBe(1);
      expect(nose[0].node, `#${seed}`).toBe(p.nodes.indexOf(head[3]));
      expect(nose[0].at[2], `#${seed} on the tip`).toBeGreaterThan(head[3].pos[2]);
      expect(nose[0].at[1], `#${seed} on top`).toBeGreaterThan(head[3].pos[1]);
      // the crest stands taller than the plates of the back
      expect(Math.max(...crest.map((s) => s.h)), `#${seed}`).toBeGreaterThan(1.5 * Math.max(...back.map((s) => s.h)));
      // …which are low keeled slabs, not cones (keeled at half their width and more, peaked over a plate
      // pitched to it, the back was a hairbrush of spikes)
      for (const s of back) expect(s.h / s.wid, `#${seed} a low keel`).toBeLessThanOrEqual(0.3);
    }
  });

  it('is the only plan with a sculling tail and its armour', () => {
    for (const id of MORPHOTYPE_IDS) {
      for (let seed = 1; seed <= 8; seed++) {
        const g = genomeOfMorphotype(seed, id);
        const p = grow(g);
        const blade = p.nodes.some((n) => n.kind !== 'spine' && n.scale !== undefined);
        if (id === 'crocodilian') {
          expect(scullingTail(p).length, `${id} #${seed}`).toBe(6);
          expect(blade, `${id} #${seed}`).toBe(true);
          const gene = g.body.appendages.find((a) => a.kind === 'tail')!;
          expect(isScullingTail(gene, gene.terminal), `${id} #${seed}`).toBe(true);
          expect(gene.style, `${id} #${seed}`).toBeGreaterThanOrEqual(SCULL_STYLE);
        } else {
          expect(scullingTail(p).length, `${id} #${seed}`).toBe(0);
          expect(scutePlan(p).length, `${id} #${seed}`).toBe(0);
          expect(blade, `${id} #${seed}`).toBe(false);
        }
      }
    }
    // …and the armour is a reptile's hide: the same body in a pelt keeps its coat
    const g = genomeOfMorphotype(3, 'crocodilian');
    expect(scutePlan(grow({ ...g, covering: { ...g.covering, type: 'fur' } })).length).toBe(0);
  });

  it('wears a fine scaled hide in olive and umber, its markings in its own hue', () => {
    // (plates the size of its legs, a crackle of dark net over them, and on some violet blotches)
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'crocodilian');
      expect(g.covering.type, `#${seed}`).toBe('scales');
      expect(['mottle', 'plain'], `#${seed}`).toContain(g.covering.pattern);
      expect(g.covering.patternScale, `#${seed}`).toBeGreaterThanOrEqual(3.5);
      // (a rare vivid morph draws its own colours)
      if (g.palette.sat > 0.6) continue;
      expect(g.palette.hueA, `#${seed}`).toBeGreaterThanOrEqual(0.14);
      expect(g.palette.hueA, `#${seed}`).toBeLessThanOrEqual(0.28);
      const kin = Math.abs(g.palette.hueB - g.palette.hueA) < 0.065;
      const umber = g.palette.hueB > 0.055 && g.palette.hueB < 0.11;
      expect(kin || umber, `#${seed} marking hue ${g.palette.hueB.toFixed(2)} on ${g.palette.hueA.toFixed(2)}`).toBe(true);
    }
  });

  it('has its mouth on the snout behind the tip, aimed ahead and a little down', () => {
    // (seated near the tip and aimed dead ahead, the lip line was traced up over the top of the flat
    // snout like the seam of a lid, and round its blunt front as a ring)
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'crocodilian');
      const p = grow(g);
      const { head } = parts(p);
      const gene = g.body.child!.child!.appendages.find((a) => a.terminal === 'mouth')!;
      expect(gene.attachElevation, `#${seed}`).toBeLessThan(1.3);
      expect(gene.attachElevation, `#${seed}`).toBeGreaterThan(1.15);
      // it rides the snout's second link: the jaw line starts there and runs forward round the tip
      const mi = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const anchor = p.nodes[p.edges.find(([, b]) => b === mi)![0]];
      expect(anchor, `#${seed}`).toBe(head[1]);
    }
  });
});
