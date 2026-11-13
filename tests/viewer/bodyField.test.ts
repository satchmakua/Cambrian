/**
 * The body field's chains: a trunk, a neck, a tail is a curve through its nodes, not a row of straight
 * cones that meet at an angle.
 */
import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildFieldPrims, CHAIN_CUTS, type FieldPrims, jawOf, fieldAt, bridgeOf, withoutCones } from '../../src/viewer/bodyField';

const body = (id: string, seed: number) => grow(genomeOfMorphotype(seed, id));

/** the cones cut from the edge a → b, in order */
function conesOf(f: FieldPrims, a: number, b: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < f.nc; m++) if (f.ia[m] === a && f.ib[m] === b) out.push(m);
  return out;
}
const lengthOf = (f: FieldPrims, m: number) => Math.hypot(f.bx[m] - f.ax[m], f.by[m] - f.ay[m], f.bz[m] - f.az[m]);
/** how fast a cone's radius changes along it */
const slopeOf = (f: FieldPrims, m: number) => (f.rb[m] - f.ra[m]) / Math.max(lengthOf(f, m), 1e-9);

describe('body field chains', () => {
  it('a link of a spine or a tail is cut into cones along a curve; a leg\'s links stay straight', () => {
    for (const id of ['felid', 'mustelid', 'fish', 'lizard']) {
      const p = body(id, 11);
      const f = buildFieldPrims(p, 'hybrid');
      for (const [a, b] of p.edges) {
        const A = p.nodes[a], B = p.nodes[b];
        const cones = conesOf(f, a, b);
        if (cones.length === 0) continue; // (a part left out of the skin)
        const spine = A.kind === 'spine' && B.kind === 'spine' && A.segment === B.segment;
        const tail = A.kind !== 'spine' && A.part?.kind === 'tail' && B.part?.kind === 'tail';
        expect(cones.length, `${id} ${A.kind}/${A.part?.kind ?? ''} → ${B.kind}/${B.part?.kind ?? ''}`).toBe(spine || tail ? CHAIN_CUTS : 1);
        // whatever it is cut into, the link begins at its first node and ends at its second, at their radii:
        // everything rooted on a node is where it was
        const first = cones[0], last = cones[cones.length - 1];
        expect(Math.hypot(f.ax[first] - A.pos[0], f.ay[first] - A.pos[1], f.az[first] - A.pos[2])).toBeLessThan(1e-9);
        expect(Math.hypot(f.bx[last] - B.pos[0], f.by[last] - B.pos[1], f.bz[last] - B.pos[2])).toBeLessThan(1e-9);
        expect(f.rb[last]).toBeCloseTo(B.radius, 9);
        // …and its cones join end to end
        for (let k = 1; k < cones.length; k++) {
          const u = cones[k - 1], v = cones[k];
          expect(Math.hypot(f.ax[v] - f.bx[u], f.ay[v] - f.by[u], f.az[v] - f.bz[u])).toBeLessThan(1e-9);
          expect(f.ra[v]).toBeCloseTo(f.rb[u], 9);
        }
      }
    }
  });

  it('where the girth changes along a trunk the cones meet at a third of the angle: no crease ring at each node', () => {
    // (straight cones from node to node met at an angle wherever the girth or the heading changed, and
    // the light picked out every one: a weasel's chest, seen from the front, was a stack of bands like
    // a grub's; a shark's belly was terraced)
    let judged = 0;
    for (const id of ['mustelid', 'shark', 'serpent', 'fish', 'felid', 'crocodilian']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p: Phenotype = body(id, seed);
        const f = buildFieldPrims(p, 'hybrid');
        const parent = new Map(p.edges.map(([a, b]) => [b, a]));
        const trunk = p.nodes.map((n, i) => ({ n, i })).filter((x) => x.n.kind === 'spine' && (x.n.segment ?? 0) === 0);
        let raw = 0, cut = 0;
        for (let k = 1; k + 1 < trunk.length; k++) {
          const a = trunk[k - 1], b = trunk[k], c = trunk[k + 1];
          if (parent.get(b.i) !== a.i || parent.get(c.i) !== b.i) continue;
          const dist = (u: typeof a, v: typeof a) => Math.hypot(v.n.pos[0] - u.n.pos[0], v.n.pos[1] - u.n.pos[1], v.n.pos[2] - u.n.pos[2]);
          // the change of slope at node b: between the straight cones a→b and b→c …
          raw = Math.max(raw, Math.abs((c.n.radius - b.n.radius) / dist(b, c) - (b.n.radius - a.n.radius) / dist(a, b)));
          // … and between the cones that now meet there, and at every cut along the two links
          const into = conesOf(f, a.i, b.i), outOf = conesOf(f, b.i, c.i);
          const run = [...into, ...outOf];
          for (let j = 1; j < run.length; j++) cut = Math.max(cut, Math.abs(slopeOf(f, run[j]) - slopeOf(f, run[j - 1])));
        }
        if (raw < 0.08) continue; // (a trunk of even girth has no corner to round)
        judged++;
        expect(cut, `${id} #${seed}: sharpest corner ${cut.toFixed(3)} against ${raw.toFixed(3)}`).toBeLessThan(0.62 * raw);
      }
    }
    expect(judged).toBeGreaterThan(12);
  });

  it('the blend radius is measured against the skeleton\'s edges, however many cones they are cut into', () => {
    for (const id of ['felid', 'serpent', 'cephalopod', 'crab']) {
      const p = body(id, 5);
      const f = buildFieldPrims(p, 'hybrid');
      // the mean of each meshed edge's two end radii, as the cones' first and last give them
      const seen = new Map<string, { ra: number; rb: number }>();
      for (let m = 0; m < f.nc; m++) {
        const key = `${f.ia[m]}>${f.ib[m]}`;
        const e = seen.get(key);
        if (!e) seen.set(key, { ra: f.ra[m], rb: f.rb[m] });
        else e.rb = f.rb[m];
      }
      let sum = 0;
      for (const e of seen.values()) sum += (e.ra + e.rb) / 2;
      expect(f.meanR, id).toBeCloseTo(sum / seen.size, 9);
      expect(f.nc, id).toBeGreaterThanOrEqual(seen.size);
    }
  });

  it("a dog's and a bear's skull has a jaw: the skin runs on under the muzzle from the cheek to the chin", () => {
    // (a braincase with a muzzle half its girth plugged into its front was a sausage in an orange, its
    // lower outline stepping up where the muzzle began)
    for (const id of ['canid', 'ursid']) {
      for (let seed = 1; seed <= 6; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const jaw = jawOf(p);
        expect(jaw, `${id} #${seed}`).not.toBeNull();
        const prims = buildFieldPrims(p, 'hybrid');
        // half-way along the muzzle, below its line by its own girth and a sixth more, is skin
        const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === p.nodes[jaw!.i0].segment);
        const m = head[1], t = head[head.length - 1];
        const mid = [0, 1, 2].map((k) => (m.pos[k] + t.pos[k]) / 2);
        const r = (m.radius + t.radius) / 2;
        expect(fieldAt(prims, mid[0], mid[1] - 1.15 * r, mid[2]), `${id} #${seed}`).toBeLessThan(0);
      }
    }
    // a cat's short face has no muzzle hung on it, and wears none
    for (let seed = 1; seed <= 6; seed++) expect(jawOf(grow(genomeOfMorphotype(seed, 'felid'))), `felid #${seed}`).toBeNull();
  });

  it("…and a bridge over its stop: the brow slopes down onto the muzzle, no crease round its top", () => {
    // (the step from braincase to muzzle was sharper than the skin's blend could round: a bulb stuck on
    // the front of a ball)
    for (let seed = 1; seed <= 6; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'canid'));
      expect(bridgeOf(p), `canid #${seed}`).not.toBeNull();
      const j = jawOf(p)!;
      const c = p.nodes[j.i0], t = p.nodes[j.i1];
      const m = p.nodes[p.edges.find(([a, b]) => a === j.i0 && p.nodes[b].kind === 'spine')![1]];
      const prims = buildFieldPrims(p, 'hybrid');
      // the top line where the stop was, under half-way from the braincase to the nose: the bridge lifts
      // the skin there well over where it dipped without it (the bridge is the field's last cone)
      const q = [0, 1, 2].map((k) => c.pos[k] + (t.pos[k] - c.pos[k]) * 0.45);
      const top = (f: typeof prims) => {
        let s = 0;
        while (s < 2 && fieldAt(f, q[0], q[1] + s, q[2]) < 0) s += 0.002;
        return s;
      };
      const bare = withoutCones(prims, (k) => k !== prims.nc - 1);
      expect((top(prims) - top(bare)) / m.radius, `canid #${seed}`).toBeGreaterThan(0.04);
    }
  });
});
