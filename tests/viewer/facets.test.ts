import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry } from '../../src/viewer/smoothSkin';
import { gemGeometry, GEM_CUTS } from '../../src/viewer/facets';
import { legWeights } from '../../src/viewer/feet';

const SEEDS = [1, 3, 5, 8, 13, 23];

interface Plane {
  n: THREE.Vector3;
  d: number;
}

function stone(seed: number, q: 'high' | 'low' | 'far' = 'low'): { p: Phenotype; skin: THREE.BufferGeometry; gem: THREE.BufferGeometry } {
  const p = grow(genomeOfMorphotype(seed, 'crystalline'));
  const skin = buildSmoothGeometry(p, true, [], q);
  const gem = gemGeometry(p, skin);
  expect(gem, `crystalline #${seed} ${q}`).not.toBeNull();
  return { p, skin, gem: gem! };
}

/** how far a point lies outside the stone (its worst plane: ≤ 0 inside) */
const outside = (planes: Plane[], x: number, y: number, z: number) => Math.max(...planes.map((pl) => pl.n.x * x + pl.n.y * y + pl.n.z * z - pl.d));

describe('a crystal trunk is one cut stone', () => {
  it('is cut in a few dozen exact planes: every triangle on its face, facing out, the faces meeting in real edges', () => {
    // (the smooth skin cut in place ran every edge between two faces through the mesh: a seventh of the
    // hide was chips tilted every way between the faces, and lit triangle by triangle, torn paper)
    for (const seed of SEEDS) {
      const { gem } = stone(seed);
      const planes = gem.userData.planes as Plane[];
      expect(planes.length, `#${seed} faces`).toBeGreaterThanOrEqual(24);
      expect(planes.length, `#${seed} faces`).toBeLessThanOrEqual(GEM_CUTS);
      const pos = gem.getAttribute('position');
      const nrm = gem.getAttribute('normal');
      for (let t = 0; t < pos.count; t += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(pos, t);
        const b = new THREE.Vector3().fromBufferAttribute(pos, t + 1);
        const c = new THREE.Vector3().fromBufferAttribute(pos, t + 2);
        const n = new THREE.Vector3().fromBufferAttribute(nrm, t);
        const f = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        if (f.length() < 1e-9) continue;
        // facing out along its face's own normal, and flat on its plane
        expect(f.normalize().dot(n), `#${seed} triangle ${t / 3}`).toBeGreaterThan(0.999);
        for (const q of [b, c]) expect(Math.abs(n.dot(q) - n.dot(a)), `#${seed} flat`).toBeLessThan(1e-4);
      }
      // the faces turn well between neighbours: a stone's edges, not a polished pebble
      const turns: number[] = [];
      for (let i = 0; i < planes.length; i++) {
        let best = -1;
        for (let j = 0; j < planes.length; j++) if (j !== i) best = Math.max(best, planes[i].n.dot(planes[j].n));
        turns.push(Math.acos(Math.min(1, best)));
      }
      turns.sort((x, y) => x - y);
      expect(turns[turns.length >> 1], `#${seed} median turn to the nearest face`).toBeGreaterThan(0.18);
    }
  });

  it('encloses the trunk, is cut in mirrored pairs, and lets the eyes, head and legs out', () => {
    for (const seed of SEEDS) {
      for (const q of ['high', 'low', 'far'] as const) {
        const { p, skin, gem } = stone(seed, q);
        const planes = gem.userData.planes as Plane[];
        // every trunk-owned skin vertex off the legs lies inside
        const pos = skin.getAttribute('position').array as Float32Array;
        const nV = (skin.userData.tubeFrom?.vertex as number | undefined) ?? pos.length / 3;
        const legs = legWeights(p, pos, nV);
        for (let v = 0; v < nV; v++) {
          if (legs[v] >= 0.2) continue;
          let best = Infinity, bi = -1;
          for (let i = 0; i < p.nodes.length; i++) {
            const n = p.nodes[i];
            const d = Math.hypot(pos[v * 3] - n.pos[0], pos[v * 3 + 1] - n.pos[1], pos[v * 3 + 2] - n.pos[2]) - n.radius;
            if (d < best) {
              best = d;
              bi = i;
            }
          }
          if (p.nodes[bi].kind !== 'spine' || (p.nodes[bi].segment ?? 0) !== 0) continue;
          expect(outside(planes, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]), `#${seed} ${q} trunk skin inside`).toBeLessThanOrEqual(1e-4);
        }
        // the eyes stay outside it (a stone over the face would swallow them)
        for (const e of p.nodes.filter((n) => n.terminal === 'eye')) {
          expect(outside(planes, e.pos[0], e.pos[1], e.pos[2]), `#${seed} ${q} eye out`).toBeGreaterThan(e.radius);
        }
        // the back's shards stand rooted in it
        for (const n of p.nodes.filter((nd) => nd.part?.kind === 'spine' && nd.kind !== 'spine')) {
          const parent = p.edges.find(([, b]) => b === p.nodes.indexOf(n))?.[0];
          if (parent === undefined || p.nodes[parent].kind !== 'spine') continue;
          expect(outside(planes, n.pos[0], n.pos[1], n.pos[2]), `#${seed} ${q} shard root inside`).toBeLessThan(0);
        }
        // as symmetric as the beast: every plane has its mirror across the midline
        for (const pl of planes) {
          const m = planes.some((o) => Math.abs(o.n.x + pl.n.x) < 1e-6 && Math.abs(o.n.y - pl.n.y) < 1e-6 && Math.abs(o.n.z - pl.n.z) < 1e-6 && Math.abs(o.d - pl.d) < 0.03);
          expect(m, `#${seed} ${q} mirrored`).toBe(true);
        }
      }
    }
  });

  it('is the same stone every time, and a body too long or bent to be one stone (a snake) gets none', () => {
    const a = stone(5).gem, b = stone(5).gem;
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
    const snake = grow(genomeOfMorphotype(3, 'serpent'));
    expect(gemGeometry(snake, buildSmoothGeometry(snake, true, [], 'far'))).toBeNull();
  });
});
