import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../../src/engine/grow';
import { genomeOfMorphotype } from '../../../src/engine/random';
import { eyeVariant, earVariant } from '../../../src/viewer/partStyles';
import { earGeometry } from '../../../src/viewer/ear';
import { ratLike } from '../../../src/viewer/feet';

function area(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const idx = g.getIndex()!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let s = 0;
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(pos, idx.getX(t));
    b.fromBufferAttribute(pos, idx.getX(t + 1));
    c.fromBufferAttribute(pos, idx.getX(t + 2));
    s += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  }
  return s;
}

describe('a mouse', () => {
  it("has a black bead of an eye, never a round one with a goat's coloured iris", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'rodent'));
      for (const n of p.nodes.filter((n) => n.terminal === 'eye')) expect(eyeVariant(n.part?.style ?? 0), `#${seed}`).toBe('beady');
    }
  });

  it('wears a plain coat, never mottled with dark blotches', () => {
    for (let seed = 1; seed <= 40; seed++) expect(genomeOfMorphotype(seed, 'rodent').covering.pattern, `#${seed}`).toBe('plain');
  });

  it("has thin, open, pink ears: the pink runs out to a hair of the rim (no broad brown rim), and the leaf is thin", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'rodent'));
      expect(ratLike(p), `#${seed}`).toBe(true);
      for (const e of p.nodes.filter((n) => n.terminal === 'ear')) {
        const v = earVariant(e.part?.style ?? 0.5);
        const r = Math.max(e.radius, 0.06);
        const bare = earGeometry(v, r, e.quat, false, true);
        const furred = earGeometry(v, r, e.quat, false, false);
        // the pink hollow covers at least 3/4 of the ear's front (HEAD: 0.44 — a third of the width each side was coat)
        expect(area(bare.inner) / (area(bare.outer) / 2), `#${seed}`).toBeGreaterThan(0.75);
        // a bear's or a cat's furred cup keeps its inset hollow
        expect(area(furred.inner) / (area(furred.outer) / 2), `#${seed} furred`).toBeLessThan(0.5);
        // the bare leaf is thinner than the furred cup: its bounding depth (along the face normal) is smaller
        const depth = (g: THREE.BufferGeometry) => {
          g.computeBoundingBox();
          const s = new THREE.Vector3();
          g.boundingBox!.getSize(s);
          return s.length();
        };
        expect(depth(bare.outer), `#${seed}`).toBeLessThan(depth(furred.outer));
      }
    }
  });
});
