import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type BodyNode, type Phenotype } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { buildMeshData, type MeshFeature } from '../../../src/viewer/meshData';
import { finOf } from '../../../src/viewer/CreatureMesh';
import { finKindOf } from '../../../src/viewer/wings';
import { surfacePrims, mouthCarves } from '../../../src/viewer/mouthLine';
import { fieldAt, projectToSurface, rayToSurface } from '../../../src/viewer/bodyField';
import { buildJawed } from '../../../src/viewer/mouths/jawed';

const SEEDS = [...Array.from({ length: 12 }, (_, i) => i + 1), 37];
const ry = (n: BodyNode) => n.radius * (n.scale?.[1] ?? 1);
const fish = (seed: number) => grow(genomeOfMorphotype(seed, 'fish'));
const aimOf = (f: MeshFeature) => new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...f.quat));

/** a fin's membrane as drawn (body space): its area, the share of it outside the skin, its mean normal */
function membrane(p: Phenotype, f: MeshFeature) {
  const geo = finOf(f, p, 'hybrid').membrane;
  const S = surfacePrims(p, 'hybrid');
  const pos = geo.getAttribute('position');
  const ix = geo.getIndex()!;
  const o = p.nodes[f.idx].pos;
  const v = (i: number) => new THREE.Vector3(pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  let area = 0, outside = 0;
  const normal = new THREE.Vector3();
  for (let t = 0; t < ix.count; t += 3) {
    const [a, b, c] = [v(ix.getX(t)), v(ix.getX(t + 1)), v(ix.getX(t + 2))];
    const cr = b.clone().sub(a).cross(c.clone().sub(a));
    const A = cr.length() / 2;
    const m = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    area += A;
    if (fieldAt(S, m.x, m.y, m.z) > 0) outside += A;
    // (one side's normal: the membrane's triangles all wind the same way)
    normal.addScaledVector(cr.normalize(), A);
  }
  return { area, outside: outside / area, normal: normal.normalize(), seat: projectToSurface(S, [], [o[0], o[1], o[2]]) };
}

describe("a bony fish's face and fins", () => {
  it('its pectoral fans back from a root up its flank, standing off the skin: not a shelf facing the sky, half under the skin', () => {
    // HEAD: the paddle's normal 0.69-0.92 up (a shelf lit white by the key light), 44-64% of it under the skin,
    // 57-72 degrees off the flank. Patched: within 0.01 of level, 98-100% outside, 21-34 degrees off the flank.
    for (const seed of SEEDS) {
      const p = fish(seed);
      const pectorals = buildMeshData(p).features.filter((f) => f.type === 'fin' && finKindOf(aimOf(f), f.kind) === 'pectoral');
      expect(pectorals.length, `#${seed}`).toBe(2);
      for (const f of pectorals) {
        const m = membrane(p, f);
        expect(Math.abs(m.normal.y), `#${seed}: faces the side, not the sky`).toBeLessThan(0.3);
        expect(m.outside, `#${seed}: out of the skin`).toBeGreaterThan(0.9);
        const off = (Math.acos(Math.min(1, Math.abs(m.normal.dot(new THREE.Vector3(...m.seat.n))))) * 180) / Math.PI;
        expect(off, `#${seed}: stands off the flank`).toBeGreaterThan(15);
        expect(off, `#${seed}: …but lies back along it`).toBeLessThan(45);
      }
    }
  });

  it('its gape runs between two jaws: under the front of the gape the lower jaw stands broader than the snout over it', () => {
    // the most the head's half-width just under the gape exceeds it just over the gape, along the front half of
    // the seam (× the head's half-depth): HEAD -0.008-0.021 (the jaw a pea inside the snout's cone, sized off the
    // capped snout tip — the gape a line drawn on a smooth blob); patched 0.061-0.104
    for (const seed of SEEDS) {
      const p = fish(seed);
      const head = p.nodes.filter((n) => n.kind === 'spine' && n.segment === 1);
      const H = ry(head[0]);
      const S = surfacePrims(p, 'hybrid');
      const idx = p.nodes.findIndex((n) => n.terminal === 'mouth');
      const o = p.nodes[idx].pos;
      const b = buildJawed(p, idx, mouthCarves(p), true, 'maw', 'hybrid')!;
      let step = -Infinity;
      for (const s of b.upper) {
        if (s.t < 0.15 || s.t > 0.5) continue; // the front half of the right-hand run
        const y = s.p[1] + o[1], z = s.p[2] + o[2];
        const w = (dy: number) => rayToSurface(S, [], [0, y + dy * H, z], [1, 0, 0])!.p[0];
        step = Math.max(step, (w(-0.06) - w(0.06)) / H);
      }
      expect(step, `#${seed}`).toBeGreaterThan(0.04);
    }
  });
});
