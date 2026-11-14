import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { earGeometry, lowEar } from '../../src/viewer/ear';
import { fieldAt } from '../../src/viewer/bodyField';
import { surfacePrims } from '../../src/viewer/mouthLine';
import { earVariant } from '../../src/viewer/partStyles';
import { buildFieldPrims } from '../../src/viewer/bodyField';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';

/** the mean outward normal of a surface (area-weighted) */
function meanNormal(g: THREE.BufferGeometry): THREE.Vector3 {
  const pos = g.getAttribute('position');
  const idx = g.getIndex()!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(pos, idx.getX(t));
    b.fromBufferAttribute(pos, idx.getX(t + 1));
    c.fromBufferAttribute(pos, idx.getX(t + 2));
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    sum.add(n);
  }
  return sum.normalize();
}

describe('ears', () => {
  it('an ear is drawn whole, never meshed into the skin as a lump under itself', () => {
    // (the ear's one-node stub is as thick as the ear is wide: in the skin it was a ball half the size
    // of the skull under each ear — the "two-lobed" cranium with a cleft down the middle)
    for (const id of ['felid', 'canid', 'rodent', 'ursid']) {
      for (let seed = 1; seed <= 8; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const prims = buildFieldPrims(p, 'hybrid');
        for (let m = 0; m < prims.nc; m++) {
          expect(p.nodes[prims.ia[m]].terminal, `${id} #${seed}`).not.toBe('ear');
          expect(p.nodes[prims.ib[m]].terminal, `${id} #${seed}`).not.toBe('ear');
        }
      }
    }
  });

  it('an ear’s root goes well into the head, so a wide ear shows no seam where the skull curves away', () => {
    const up = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
    for (const v of ['pointed', 'round', 'leaf'] as const) {
      const g = earGeometry(v, 1, [up.x, up.y, up.z, up.w]).outer;
      g.computeBoundingBox();
      expect(g.boundingBox!.min.y, v).toBeLessThan(-0.4); // (in units of the ear's size, below its root)
      expect(g.boundingBox!.max.y, v).toBeGreaterThan(1.5);
    }
  });


  it("an ear opens forward and out to its own side — not dead ahead, seen edge-on from the side", () => {
    // an ear rising up-and-out from the right (+X) of the skull
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.35, 1, 0).normalize());
    for (const v of ['pointed', 'round', 'leaf'] as const) {
      const right = meanNormal(earGeometry(v, 0.1, [q.x, q.y, q.z, q.w]).inner);
      expect(right.z, `${v} forward`).toBeGreaterThan(0.4);
      expect(right.x, `${v} out`).toBeGreaterThan(0.25);
      // …and its mirror on the left opens out to the left
      const ql = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-0.35, 1, 0).normalize());
      const left = meanNormal(earGeometry(v, 0.1, [ql.x, ql.y, ql.z, ql.w]).inner);
      expect(left.x, `${v} mirrored`).toBeCloseTo(-right.x, 6);
    }
  });

  it("a bear's round ears both show their hollow to the studio's three-quarter view, the far one never edge-on", () => {
    // (turned 45° out on an ear already leaning out and forward, a round cup opened out and down: the
    // far ear was seen dead edge-on, 91–95° from the camera — a spike beside the near one's cup)
    const cam = new THREE.Vector3(0.62, 0.38, 0.7).normalize();
    for (let seed = 1; seed <= 16; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'ursid'));
      const ears = p.nodes.filter((n) => n.terminal === 'ear');
      expect(ears.length, `#${seed}`).toBe(2);
      for (const e of ears) {
        const v = earVariant(e.part?.style ?? 0.5);
        expect(v, `#${seed}`).toBe('round');
        const inner = meanNormal(earGeometry(v, Math.max(e.radius, 0.06), e.quat).inner);
        const deg = (Math.acos(inner.dot(cam)) * 180) / Math.PI;
        expect(deg, `#${seed} ${e.pos[0] > 0 ? 'near' : 'far'} ear`).toBeLessThan(80);
      }
    }
  });

  it('an ear is a deep cup: seen edge-on it keeps a good part of its width, never a thin horn', () => {
    // (a shallow dish a fifth to a third as deep as it was wide: the far ear of a three-quarter view
    // was a dark spike, like a horn)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.35, 0.94, 0).normalize());
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    for (const [v, least] of [['pointed', 0.4], ['round', 0.25], ['leaf', 0.3]] as const) {
      const pos = earGeometry(v, 0.1, [q.x, q.y, q.z, q.w]).outer.getAttribute('position');
      // the ear's own frame: up it (out), across it, and through it (its face normal, ⟂ to both)
      const across = new THREE.Vector3(), through = new THREE.Vector3();
      const inner = meanNormal(earGeometry(v, 0.1, [q.x, q.y, q.z, q.w]).inner);
      through.copy(inner).addScaledVector(out, -inner.dot(out)).normalize();
      across.crossVectors(out, through);
      let top = 0;
      for (let i = 0; i < pos.count; i++) top = Math.max(top, new THREE.Vector3().fromBufferAttribute(pos, i).dot(out));
      for (const t of [0.35, 0.55, 0.75]) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(pos, i);
          if (Math.abs(p.dot(out) - t * top) > 0.04 * top) continue;
          x0 = Math.min(x0, p.dot(across));
          x1 = Math.max(x1, p.dot(across));
          z0 = Math.min(z0, p.dot(through));
          z1 = Math.max(z1, p.dot(through));
        }
        expect((z1 - z0) / (x1 - x0), `${v} at ${t} of its height`).toBeGreaterThan(least);
      }
    }
  });

  it("a weasel's small round ears are low flaps half hidden in its coat; a mouse's big ones keep their cups", () => {
    // (drawn as a mouse's, a cup as tall as it was wide standing a fifth to a quarter of the skull's height
    // clear of it, a weasel's ears were a hamster's)
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'mustelid'));
      const prims = surfacePrims(p, 'hybrid');
      const depth = Math.max(...p.nodes.filter((n) => n.kind === 'spine').map((n) => n.segment ?? 0));
      const skull = p.nodes.find((n) => n.kind === 'spine' && n.segment === depth)!;
      const skullH = 2 * skull.radius * (skull.scale?.[1] ?? 1);
      p.nodes.forEach((n, i) => {
        if (n.terminal !== 'ear') return;
        expect(lowEar(p, i), `#${seed}`).toBe(true);
        const g = earGeometry('round', n.radius, n.quat, true).outer;
        const pos = g.getAttribute('position');
        let proud = -Infinity;
        for (let v = 0; v < pos.count; v++) proud = Math.max(proud, fieldAt(prims, pos.getX(v) + n.pos[0], pos.getY(v) + n.pos[1], pos.getZ(v) + n.pos[2]));
        expect(proud / skullH, `#${seed} stands low`).toBeLessThan(0.18);
      });
    }
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'rodent'));
      p.nodes.forEach((n, i) => {
        if (n.terminal === 'ear') expect(lowEar(p, i), `mouse #${seed}`).toBe(false);
      });
    }
  });
});
