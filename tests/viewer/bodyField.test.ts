/**
 * The body field's chains: a trunk, a neck, a tail is a curve through its nodes, not a row of straight
 * cones that meet at an angle.
 */
import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildFieldPrims, CHAIN_CUTS, type FieldPrims, jawOf, fieldAt, bridgeOf, withoutCones, slugMantle, MANTLE, apeSkull, apeForearms, qRotateV } from '../../src/viewer/bodyField';

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

  it("an insect's feelers are drawn finer than its legs' thinnest links — not two pipes on its head", () => {
    // (no node grows thinner than R_MIN: at their nodes' girth, an ant's or a centipede's feelers were as
    // thick as its legs' tips)
    for (const id of ['insectoid', 'arthro-alien']) {
      for (let seed = 1; seed <= 4; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const f = buildFieldPrims(p, 'hybrid');
        const legs = p.nodes.filter((n) => n.part?.kind === 'leg' && n.kind !== 'spine');
        const thinnestLeg = Math.min(...legs.map((n) => n.radius));
        let feelers = 0;
        for (let m = 0; m < f.nc; m++) {
          if (p.nodes[f.ia[m]].part?.kind !== 'antenna' || p.nodes[f.ib[m]].part?.kind !== 'antenna') continue;
          expect(Math.max(f.ra[m], f.rb[m]) / thinnestLeg, `${id} #${seed}`).toBeLessThan(0.6);
          feelers++;
        }
        expect(feelers, `${id} #${seed}`).toBeGreaterThan(0);
      }
    }
  });

  it("a slug wears a mantle over the front of its back: proud of the back, its rim standing off the flanks", () => {
    // (with none, a slug was a glossy teardrop: an aubergine with feelers)
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'slime'));
      const m = slugMantle(p)!;
      expect(m, `#${seed}`).not.toBeNull();
      const prims = buildFieldPrims(p, 'hybrid');
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0).sort((a, b) => a.pos[2] - b.pos[2]);
      const z0 = trunk[0].pos[2] - trunk[0].radius, z1 = trunk[trunk.length - 1].pos[2] + trunk[trunk.length - 1].radius;
      // over the front of the back, behind the head
      expect((m.c[2] - z0) / (z1 - z0), `#${seed} forward`).toBeGreaterThan(0.55);
      expect((m.c[2] + m.r[2] - z0) / (z1 - z0), `#${seed} behind the head`).toBeLessThan(0.9);
      // the skin with the mantle stands proud of the skin without it, over the back and out past the flank
      const bare = buildFieldPrims(p, 'hybrid');
      bare.ne -= 1; // (the mantle is the last ellipsoid)
      const above = (f: FieldPrims, x: number, z: number) => {
        let lo = m.c[1] - 2 * m.r[1], hi = m.c[1] + 2 * m.r[1];
        for (let i = 0; i < 40; i++) {
          const y = (lo + hi) / 2;
          if (fieldAt(f, x, y, z) > 0) hi = y;
          else lo = y;
        }
        return lo;
      };
      expect(above(prims, 0, m.c[2]) - above(bare, 0, m.c[2]), `#${seed} proud of the back`).toBeGreaterThan(0.02 * m.r[0]);
      const side = (f: FieldPrims) => {
        let lo = 0, hi = 3 * m.r[0];
        for (let i = 0; i < 40; i++) {
          const x = (lo + hi) / 2;
          if (fieldAt(f, x, m.c[1], m.c[2]) > 0) hi = x;
          else lo = x;
        }
        return lo;
      };
      expect(side(prims) - side(bare), `#${seed} its rim off the flank`).toBeGreaterThan(0.04 * m.r[0]);
    }
    // a slime body without feelers (an octopus) and anything else wears none
    expect(slugMantle(grow(genomeOfMorphotype(23, 'cephalopod')))).toBeNull();
    expect(slugMantle(grow(genomeOfMorphotype(23, 'crab')))).toBeNull();
    expect(slugMantle(grow(genomeOfMorphotype(23, 'serpent')))).toBeNull();
    expect(MANTLE.blend).toBeLessThan(0.5); // (blended in with a crease round its edge, not smoothed away)
  });

  // an ape's head and arms on the hybrid skin (the blend that skin uses)
  const apeField = (p: Phenotype) => {
    const f = buildFieldPrims(p, 'hybrid');
    f.k = 0.34 * f.meanR;
    return f;
  };
  const apeHead = (p: Phenotype) => {
    const spine = p.nodes.filter((n) => n.kind === 'spine');
    const last = Math.max(...spine.map((n) => n.segment ?? 0));
    return spine.filter((n) => n.segment === last);
  };

  it("an ape's skull juts below its eyes, peaks behind its crown, and its jaw stands clear of its throat", () => {
    // (its cranium and muzzle balls were meshed as one round cone: an egg with a flat front, a bullet, on which
    // the bare face was a black hood)
    const progs: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const p = body('primate', seed);
      const f = apeField(p);
      const [C] = apeHead(p);
      const rc = C.radius;
      const eyeY = p.nodes.find((n) => n.terminal === 'eye')!.pos[1];
      const mouthY = p.nodes.find((n) => n.terminal === 'mouth')!.pos[1];
      const front = (y: number) => {
        for (let z = C.pos[2] + 3 * rc; z > C.pos[2] - 3 * rc; z -= 0.004) if (fieldAt(f, 0, y, z) < 0) return z;
        return -Infinity;
      };
      // the crown peaks over the back of the skull (a sagittal crest), not over its middle
      let top = -Infinity, topZ = 0;
      for (let z = C.pos[2] - 1.5 * rc; z <= C.pos[2] + 1.2 * rc; z += 0.01)
        for (let y = C.pos[1] + 2 * rc; y > C.pos[1]; y -= 0.004)
          if (fieldAt(f, 0, y, z) < 0) {
            if (y > top) { top = y; topZ = z; }
            break;
          }
      expect((top - C.pos[1]) / rc, `#${seed} crest height`).toBeGreaterThan(1.12);
      expect((topZ - C.pos[2]) / rc, `#${seed} crest behind`).toBeLessThan(-0.2);
      // a jaw: a cranium's radius below its centre, the face still stands well out in front
      expect((front(C.pos[1] - rc) - C.pos[2]) / rc, `#${seed} jaw`).toBeGreaterThan(1.22);
      // the muzzle juts ahead of the face at the eyes
      let muzzle = -Infinity;
      for (let y = eyeY - 0.05; y > mouthY - 1.2 * rc; y -= 0.01) muzzle = Math.max(muzzle, front(y));
      progs.push((muzzle - front(eyeY)) / rc);
    }
    expect(progs.reduce((a, b) => a + b, 0) / progs.length, 'mean prognathism').toBeGreaterThan(0.5);
    expect(Math.min(...progs), 'least prognathism').toBeGreaterThan(0.44);
  });

  it("an ape's forearm swells below its elbow and narrows to its wrist", () => {
    // (three links tapering by one ratio: a plain tube from the shoulder to a fist no wider than it)
    for (let seed = 1; seed <= 8; seed++) {
      const p = body('primate', seed);
      const f = apeField(p);
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      const hi = p.nodes.findIndex((n) => n.terminal === 'hand' && n.pos[0] > 0);
      const E = p.nodes[parent.get(hi)!].pos, H = p.nodes[hi].pos;
      const girth = (t: number) => {
        const at = [E[0] + (H[0] - E[0]) * t, E[1] + (H[1] - E[1]) * t, E[2] + (H[2] - E[2]) * t];
        let w = 0;
        for (let d = 0; d < 0.5; d += 0.002) if (fieldAt(f, at[0] + d, at[1], at[2]) < 0) w = d; else break;
        return w;
      };
      expect(girth(0.33) / girth(0), `#${seed} forearm belly`).toBeGreaterThan(1.1);
      expect(girth(0.85) / girth(0.33), `#${seed} wrist`).toBeLessThan(0.8);
    }
  });

  it("an ape's new skull and forearms leave its eyes' seats where they were, and touch no other animal", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = body('primate', seed);
      const f = apeField(p);
      const bare = apeField(p);
      bare.ne -= apeSkull(p).length + apeForearms(p).length; // (they are the field's last ellipsoids)
      let flips = 0;
      for (const e of p.nodes.filter((n) => n.terminal === 'eye')) {
        const aim = qRotateV(e.quat, [0, 0, 1]);
        for (let t = -1.5; t <= 3; t += 0.05) {
          const x = e.pos[0] - aim[0] * t * e.radius, y = e.pos[1] - aim[1] * t * e.radius, z = e.pos[2] - aim[2] * t * e.radius;
          if ((fieldAt(f, x, y, z) <= 0) !== (fieldAt(bare, x, y, z) <= 0)) flips++;
        }
      }
      expect(flips, `#${seed} eye seat`).toBe(0);
    }
    for (const id of ['felid', 'ursid', 'canid', 'biped', 'mustelid']) {
      const p = body(id, 7);
      expect(apeSkull(p).length + apeForearms(p).length, id).toBe(0);
    }
  });
});
