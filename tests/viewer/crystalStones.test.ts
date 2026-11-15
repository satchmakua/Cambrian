import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { crystalStones, cullCovered, CUT_SHADE, EYE_FACE, type Plane } from '../../src/viewer/facets';
import { eyeSeat, EYE_PROUD } from '../../src/viewer/eyeSeat';

const SEEDS = [1, 3, 5, 8, 13, 29];

const area = (g: THREE.BufferGeometry) => {
  const pos = g.getAttribute('position');
  const idx = g.getIndex()!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let A = 0;
  for (let t = 0; t + 2 < idx.count; t += 3) {
    a.fromBufferAttribute(pos, idx.getX(t));
    b.fromBufferAttribute(pos, idx.getX(t + 1));
    c.fromBufferAttribute(pos, idx.getX(t + 2));
    A += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return A;
};
const isLeg = (p: Phenotype, i: number) => p.nodes[i].part?.kind === 'leg' && p.nodes[i].kind !== 'spine';
const beast = (seed: number, q: 'high' | 'low' = 'low') => {
  const p = grow(genomeOfMorphotype(seed, 'crystalline'));
  const skin = buildSmoothGeometry(p, true, [], q);
  const stones = crystalStones(p, skin);
  expect(stones, `crystalline #${seed}`).not.toBeNull();
  return { p, skin, stones: stones!, solids: stones!.userData.solids as Plane[][] };
};

describe('a crystal beast is cut stone from its snout to its toes', () => {
  it('shows almost none of its uncut skin: its head and every link of its legs are stones too', () => {
    // (only its trunk was: a third to a half of its skin — the head, the legs, a smooth ball at every hip
    // and shoulder, a circle where the head met the gem — showed as glossy balloons in the cut material)
    for (const seed of SEEDS) {
      const { p, skin, solids } = beast(seed);
      const before = area(skin);
      cullCovered(skin, solids);
      expect(area(skin) / before, `#${seed} skin left drawn`).toBeLessThan(0.03);
      const links = p.edges.filter(([a, b]) => isLeg(p, a) && isLeg(p, b)).length;
      expect(solids.length, `#${seed}: the trunk, the head and ${links} leg links`).toBe(2 + links);
    }
  });

  it('sets each eye in a face of its own, the gem of it a little proud of that face', () => {
    // (pressed flat into a smooth ball, a dark ring round a disc of the stone's own tone, it was a washer)
    for (const seed of SEEDS) {
      const { p, solids } = beast(seed);
      for (let i = 0; i < p.nodes.length; i++) {
        if (p.nodes[i].terminal !== 'eye') continue;
        const r = Math.max(p.nodes[i].radius, 0.06);
        const fl = eyeSeat(p, i, p.nodes[i].quat, r).flat!;
        const n = new THREE.Vector3(...fl.n), at = new THREE.Vector3(...fl.at);
        const head = solids.find((s) => s.some((pl) => pl.n.distanceTo(n) < 1e-9))!;
        expect(head, `#${seed} eye ${i} has a face`).toBeDefined();
        const top = at.clone().addScaledVector(n, EYE_PROUD * r);
        expect(Math.max(...head.map((pl) => pl.n.dot(top) - pl.d)), `#${seed} eye ${i} proud`).toBeCloseTo((EYE_PROUD - EYE_FACE) * r, 4);
        // its disc, three quarters of its radius round it, lies on its own face, cut by no other
        const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        const w = new THREE.Vector3().crossVectors(n, u);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const q = at.clone().addScaledVector(n, EYE_FACE * r).addScaledVector(u, Math.cos(a) * 0.75 * r).addScaledVector(w, Math.sin(a) * 0.75 * r);
          for (const pl of head) if (pl.n.distanceTo(n) > 1e-9) expect(pl.n.dot(q) - pl.d, `#${seed} eye ${i} disc`).toBeLessThanOrEqual(1e-6);
        }
      }
    }
  });

  it('is cut at its mouth: a skull facing down onto a jaw facing up, under its eyes', () => {
    // (a cut stone has no lips, and a seam drawn across its glass head was a cartoon's smile: so it had none)
    for (const seed of SEEDS) {
      const { p, stones } = beast(seed);
      const ao = stones.getAttribute('aAO'), nrm = stones.getAttribute('normal'), pos = stones.getAttribute('position');
      let down = 0, up = 0;
      const eyes = p.nodes.filter((n) => n.terminal === 'eye');
      for (let v = 0; v < ao.count; v++) {
        if (Math.abs(ao.getX(v) - CUT_SHADE) > 1e-6) continue;
        if (nrm.getY(v) < 0 && nrm.getZ(v) > 0) down++;
        if (nrm.getY(v) > 0 && nrm.getZ(v) > 0) up++;
        // (the cut runs under the eyes wherever it shows: ahead of them)
        for (const e of eyes) if (pos.getZ(v) >= e.pos[2]) expect(pos.getY(v), `#${seed}: the cut under the eye`).toBeLessThan(e.pos[1] - 0.5 * Math.max(e.radius, 0.06));
      }
      expect(down, `#${seed}: the skull's underside`).toBeGreaterThan(0);
      expect(up, `#${seed}: the jaw's top`).toBeGreaterThan(0);
    }
  });

  it("is the same stone every time; every stone rides one bone, the head's bending from its neck root to its front", () => {
    const { p, stones: a } = beast(5);
    const b = beast(5).stones;
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
    const w = a.getAttribute('skinWeight'), i = a.getAttribute('skinIndex');
    const pos = a.getAttribute('position');
    const head = p.nodes.map((n, k) => (n.kind === 'spine' && (n.segment ?? 0) >= 1 ? k : -1)).filter((k) => k >= 0);
    const rear = head.reduce((m, k) => (p.nodes[k].pos[2] < p.nodes[m].pos[2] ? k : m), head[0]);
    const front = head.reduce((m, k) => (p.nodes[k].pos[2] > p.nodes[m].pos[2] ? k : m), head[0]);
    let blended = 0, nearRoot = 0, onRoot = 0;
    for (let v = 0; v < w.count; v++) {
      expect(w.getX(v) + w.getY(v), `vertex ${v}`).toBeCloseTo(1, 6);
      if (w.getX(v) === 1) continue;
      // (only the head's stone bends, and only between its own two bones)
      blended++;
      expect(i.getX(v) - 1, `vertex ${v}`).toBe(front);
      expect(i.getY(v) - 1, `vertex ${v}`).toBe(rear);
      // (its rear rides its neck root: a glance turns no part of it about the head's front)
      if (pos.getZ(v) <= p.nodes[rear].pos[2]) {
        nearRoot++;
        if (w.getY(v) > 0.99) onRoot++;
      }
    }
    expect(blended).toBeGreaterThan(0);
    expect(onRoot).toBe(nearRoot);
  });

  it("an insect's crystal head is a stone of its own: its thorax, which carries its legs, is no part of it", () => {
    // (a stone holding both swung the thorax round with every glance, the rig turning the head's sections
    // and leaving its legs on the thorax's bones)
    for (const seed of [1, 5, 29]) {
      const g = genomeOfMorphotype(seed, 'insectoid');
      g.covering = { ...g.covering, type: 'crystal' };
      const p = grow(g);
      const parent = new Map(p.edges.map(([x, y]) => [y, x]));
      let legSeg = 0;
      p.nodes.forEach((n, k) => {
        const up = parent.get(k);
        if (n.part?.kind === 'leg' && up !== undefined && p.nodes[up].kind === 'spine') legSeg = Math.max(legSeg, p.nodes[up].segment ?? 0);
      });
      expect(legSeg, `insect #${seed}`).toBeGreaterThan(0);
      const stones = crystalStones(p, buildSmoothGeometry(p, true, [], 'low'));
      if (!stones) continue;
      const solids = stones.userData.solids as Plane[][];
      const holds = (pl: Plane[], q: readonly number[]) => pl.every((h) => h.n.x * q[0] + h.n.y * q[1] + h.n.z * q[2] <= h.d);
      // the stone that holds the head's front (its eyes' bone) holds none of the thorax's nodes
      const spine = p.nodes.filter((n) => n.kind === 'spine');
      const front = spine.reduce((m, n) => (n.pos[2] > m.pos[2] ? n : m), spine[0]);
      const headStone = solids.find((pl) => holds(pl, front.pos));
      if (!headStone) continue;
      for (const n of spine) if ((n.segment ?? 0) >= 1 && (n.segment ?? 0) <= legSeg) expect(holds(headStone, n.pos), `insect #${seed} thorax in the head's stone`).toBe(false);
    }
  });
});
