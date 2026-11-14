/**
 * Crystal shards: what a crystal-covered body's horns and back spines are drawn as.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { shardGeometry, shardPlan } from '../../src/viewer/shards';

describe('crystal shards', () => {
  it('a cluster is one tall leader up the aim with two or three shorter shards leaning out round it', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const plan = shardPlan(0.12, seed);
      counts.add(plan.length);
      const [leader, ...sides] = plan;
      expect(leader.lean).toBeLessThan(0.13); // nearly straight up the part's aim
      for (const s of sides) {
        expect(s.len, `seed ${seed}: a side shard is shorter than the leader`).toBeLessThan(leader.len);
        expect(s.rad).toBeLessThan(leader.rad);
        expect(s.lean).toBeGreaterThan(0.44); // it leans OUT: a cluster, not a bundle of parallel rods
        expect(s.lean).toBeLessThan(0.81); // … and still points away from the body
      }
      // the side shards stand round the leader, not all to one side: no two within a sixth of a turn
      const turns = sides.map((s) => ((s.turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
      for (let i = 0; i < turns.length; i++) {
        const gap = i + 1 < turns.length ? turns[i + 1] - turns[i] : turns[0] + 2 * Math.PI - turns[i];
        expect(gap, `seed ${seed}`).toBeGreaterThan(Math.PI / 3);
      }
    }
    expect([...counts].sort()).toEqual([3, 4]);
  });

  it('is its own for each seed and the same every time for one seed; it scales with the part', () => {
    expect(shardPlan(0.1, 7)).toEqual(shardPlan(0.1, 7));
    expect(shardPlan(0.1, 7)).not.toEqual(shardPlan(0.1, 8));
    const small = shardPlan(0.1, 7);
    const big = shardPlan(0.2, 7);
    big.forEach((s, i) => {
      expect(s.len).toBeCloseTo(small[i].len * 2, 10);
      expect(s.rad).toBeCloseTo(small[i].rad * 2, 10);
      expect(s.lean).toBe(small[i].lean);
    });
  });

  it('the mesh is flat-faced prisms cut to a point: every triangle one plane, the tallest point up +Z', () => {
    for (const seed of [1, 2, 3, 11]) {
      const r = 0.15;
      const plan = shardPlan(r, seed);
      const g = shardGeometry(r, seed);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
      expect(g.getIndex(), 'a triangle soup: no vertex is shared between two faces').toBeNull();
      expect(g.getAttribute('uv')).toBeUndefined();
      // each shard: six sides (two triangles each) and a six-sided point
      expect(pos.count).toBe(plan.length * (6 * 2 + 6) * 3);
      let top = -Infinity;
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        for (const v of [a, b, c]) {
          expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
          top = Math.max(top, v.z);
        }
        // the three corners of a face carry that face's own normal (flat shading: the facets)
        const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
        for (let k = 0; k < 3; k++) {
          n.fromBufferAttribute(nrm, i + k);
          expect(n.dot(face)).toBeGreaterThan(0.999);
        }
      }
      // the leader's point is the top of the cluster, a little short of its full length (its root is sunk)
      const leader = plan[0];
      expect(top).toBeGreaterThan(leader.len * Math.cos(leader.lean) - leader.rad);
      expect(top).toBeLessThan(leader.len);
      // and nothing reaches far below the part's root: the cluster stands ON the body
      g.computeBoundingBox();
      expect(g.boundingBox!.min.z).toBeGreaterThan(-leader.rad * 1.6);
      g.dispose();
    }
  });
});
