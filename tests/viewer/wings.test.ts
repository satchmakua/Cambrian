import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMembraneWing, buildFoldedMembraneWing, buildFeatheredWing, buildSpreadFeatheredWing, buildTailFan, conformToSurface } from '../../src/viewer/wings';

function finite(g: THREE.BufferGeometry): boolean {
  const a = g.getAttribute('position').array as ArrayLike<number>;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}
function bbox(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!;
}

describe('wings (shoulder-built, body frame)', () => {
  it('a membrane wing spreads OUT to its side and back from the shoulder, with bones and a wrist', () => {
    for (const side of [1, -1]) {
      const w = buildMembraneWing(side, 2, 0.6);
      expect(finite(w.surface)).toBe(true);
      const b = bbox(w.surface);
      // spans outward on its own side, never across the midline
      if (side > 0) expect(b.min.x).toBeGreaterThan(-0.05);
      else expect(b.max.x).toBeLessThan(0.05);
      expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeGreaterThan(1.0);
      expect(b.min.z).toBeLessThan(-0.5); // the trailing panels reach back along the flank
      expect(w.bones.length).toBe(6); // humerus + forearm + four fingers
      expect(w.wrist).not.toBeNull();
      // the arm folds at an elbow that sits BEHIND the straight shoulder→wrist line (the leading
      // edge's M), and the fingers don't all spring from one point like umbrella ribs
      const [hum, fore] = w.bones;
      expect(hum.b.distanceTo(fore.a)).toBeLessThan(1e-9);
      expect(hum.b.z).toBeLessThan(fore.b.z * (hum.b.x / fore.b.x));
      const roots = new Set(w.bones.slice(2).map((b) => b.a.toArray().map((v) => v.toFixed(4)).join(',')));
      expect(roots.size).toBe(4);
    }
  });

  it('a membrane wing at rest is folded along its own flank: the wrist up over the shoulder, the fingers back and down', () => {
    // (held spread and raised at all times, a dragon walking the valley carried two poles on its back,
    // each a narrow strip of skin seen edge on)
    for (const side of [1, -1]) {
      const S = 2;
      const w = buildFoldedMembraneWing(side, S);
      expect(finite(w.surface)).toBe(true);
      const b = bbox(w.surface);
      // close against its own side: never across the midline, never spread out from the body
      if (side > 0) expect(b.min.x).toBeGreaterThan(-0.05);
      else expect(b.max.x).toBeLessThan(0.05);
      expect(Math.max(Math.abs(b.min.x), Math.abs(b.max.x))).toBeLessThan(0.15 * S);
      // long back along the body, the wrist standing over the shoulder
      expect(b.min.z).toBeLessThan(-0.45 * S);
      expect(w.wrist!.y).toBeGreaterThan(0.1 * S);
      expect(Math.abs(w.wrist!.z)).toBeLessThan(0.1 * S);
      // the elbow behind the shoulder, the fingers running back and down from the wrist
      const [hum, fore, ...fingers] = w.bones;
      expect(hum.b.z).toBeLessThan(-0.15 * S);
      expect(fore.b.y).toBeGreaterThan(hum.b.y);
      for (const f of fingers) {
        expect(f.b.z).toBeLessThan(f.a.z - 0.25 * S);
        expect(f.b.y).toBeLessThanOrEqual(f.a.y + 1e-9);
      }
      // mirror-exact
      const o = buildFoldedMembraneWing(-side, S).surface.getAttribute('position');
      const a = w.surface.getAttribute('position');
      for (let i = 0; i < a.count; i += 5) expect(a.getX(i)).toBeCloseTo(-o.getX(i), 6);
    }
  });

  it('the two sides are exact mirror images (bilateral symmetry holds through the wings)', () => {
    const a = buildMembraneWing(1, 1.7, 0.5).surface.getAttribute('position');
    const b = buildMembraneWing(-1, 1.7, 0.5).surface.getAttribute('position');
    expect(a.count).toBe(b.count);
    for (let i = 0; i < a.count; i += 7) {
      expect(a.getX(i)).toBeCloseTo(-b.getX(i), 6);
      expect(a.getY(i)).toBeCloseTo(b.getY(i), 6);
      expect(a.getZ(i)).toBeCloseTo(b.getZ(i), 6);
    }
  });

  it("a folded membrane wing hangs from the wrist like a cape, on slim bones — not a little fan on a peg", () => {
    // (fingers run back nearly level stood the fold on the back as a dorsal sail the size of the head,
    // and a humerus a thirtieth of the span thick stood out of the shoulder like a peg)
    const S = 2;
    const w = buildFoldedMembraneWing(1, S);
    const [hum, fore, ...fingers] = w.bones;
    const lowest = Math.min(...fingers.map((f) => f.b.y));
    expect(w.wrist!.y - lowest).toBeGreaterThan(0.33 * S);
    expect(hum.r0).toBeLessThan(0.012 * S);
    expect(fore.r0).toBeLessThan(hum.r0);
  });

  it('a folded feathered wing lies back along the flank, vertex-coloured', () => {
    const w = buildFeatheredWing(1, 2, new THREE.Color(0.6, 0.5, 0.3), new THREE.Color(0.1, 0.3, 0.8));
    expect(finite(w.surface)).toBe(true);
    expect(w.surface.getAttribute('color')).toBeDefined();
    const b = bbox(w.surface);
    expect(b.min.z).toBeLessThan(-1.5); // primaries reach well behind the shoulder
    expect(b.max.z).toBeLessThan(0.3); // and nothing pokes forward of it
    expect(b.max.x - b.min.x).toBeLessThan(0.8); // folded flat against the side, not spread
  });

  it('a tail fan points back from the tail tip', () => {
    const g = buildTailFan(1, new THREE.Color(0.5, 0.4, 0.3), new THREE.Color(0.2, 0.2, 0.6));
    const b = bbox(g);
    expect(b.min.z).toBeLessThan(-0.7);
    expect(b.max.z).toBeLessThan(0.1);
  });

  it('a tail fan lies in a shallow trough, so from the side it is a tail and not its own edge', () => {
    // (laid flat, from the side or any low angle a hawk's tail was a twig stuck in its rump)
    const g = buildTailFan(1, new THREE.Color(0.5, 0.4, 0.3), new THREE.Color(0.2, 0.2, 0.6), 0);
    const b = bbox(g);
    expect(b.max.y - b.min.y).toBeGreaterThan(0.12);
    // the outer feathers stand above the middle ones, and both sides alike
    const pos = g.getAttribute('position');
    let hiL = -Infinity, hiR = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) < -0.15) hiL = Math.max(hiL, pos.getY(i));
      if (pos.getX(i) > 0.15) hiR = Math.max(hiR, pos.getY(i));
    }
    expect(Math.abs(hiL - hiR)).toBeLessThan(0.02);
  });

  it('conformToSurface lifts every vertex out of a body to ride the margin above it', () => {
    const w = buildFeatheredWing(1, 2, new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1));
    const sphere = (x: number, y: number, z: number) => Math.hypot(x, y, z + 0.8) - 0.7; // a body
    conformToSurface(w.surface, sphere, [0.5, 0, 0], 0.02);
    const pos = w.surface.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      expect(sphere(pos.getX(i) + 0.5, pos.getY(i), pos.getZ(i))).toBeGreaterThan(0.015);
    }
  });

  it('fins are built in the body frame: chords sweep back along the body, caudals stand vertical', async () => {
    const { buildFin, finKindOf } = await import('../../src/viewer/wings');
    const side = new THREE.Vector3(1, -0.2, 0).normalize();
    expect(finKindOf(new THREE.Vector3(0, 1, 0), 'fin')).toBe('dorsal');
    expect(finKindOf(side, 'fin')).toBe('pectoral');
    expect(finKindOf(new THREE.Vector3(0, 0, -1), 'tail')).toBe('caudal');
    const pect = buildFin('pectoral', side, 0.5);
    const pb = bbox(pect.membrane);
    expect(finite(pect.membrane)).toBe(true);
    expect(pb.min.z).toBeLessThan(-0.2); // the chord trails back along the flank
    expect(pb.max.x).toBeGreaterThan(0.3); // and the span reaches out to its side
    const caudal = buildFin('caudal', new THREE.Vector3(0, 0, -1), 0.5);
    const cb = bbox(caudal.membrane);
    expect(cb.max.y - cb.min.y).toBeGreaterThan(0.6); // a tall vertical fork
    expect(cb.max.x - cb.min.x).toBeLessThan(0.15); // thin side to side
  });

  it('a fin under the body on the midline is the anal fin; a pair set out to the sides, the pelvics', async () => {
    const { finKindOf } = await import('../../src/viewer/wings');
    expect(finKindOf(new THREE.Vector3(0, -1, -0.3).normalize(), 'fin')).toBe('anal');
    expect(finKindOf(new THREE.Vector3(0.3, -1, -0.4).normalize(), 'fin')).toBe('pelvic');
    expect(finKindOf(new THREE.Vector3(-0.3, -1, -0.4).normalize(), 'fin')).toBe('pelvic');
  });

  it('the cut of a fin comes from its style: the plain fin, a bony fish’s, a shark’s', async () => {
    const { buildFin, finCutOf, finScaleOf } = await import('../../src/viewer/wings');
    expect([0, 0.29, 0.3, 0.59, 0.6, 1].map(finCutOf)).toEqual(['plain', 'plain', 'fish', 'fish', 'shark', 'shark']);
    // the plain fin is sized as it always was; the others run small → large across their band
    expect(finScaleOf(0.2)).toBeCloseTo(0.8 + 0.2 * 0.6, 9);
    expect(finScaleOf(0.31)).toBeLessThan(finScaleOf(0.58));
    expect(finScaleOf(0.61)).toBeLessThan(finScaleOf(0.95));
    const up = new THREE.Vector3(0, 1, 0);
    const g = 0.5;
    const box = (kind: 'dorsal' | 'caudal' | 'pectoral', cut: 'plain' | 'fish' | 'shark', aim = up) => {
      const b = buildFin(kind, aim, g, 1, cut);
      expect(finite(b.membrane), `${kind} ${cut}`).toBe(true);
      return bbox(b.membrane);
    };
    // a bony fish's dorsal is a long low sail; a shark's a tall blade, taller than it is long
    const sail = box('dorsal', 'fish');
    const blade = box('dorsal', 'shark');
    const plain = box('dorsal', 'plain');
    const long = (b: THREE.Box3) => b.max.z - b.min.z;
    const tall = (b: THREE.Box3) => b.max.y; // (above the root, which is on the skin at y = 0)
    expect(long(sail) / tall(sail)).toBeGreaterThan(2.2);
    expect(tall(blade) / long(blade)).toBeGreaterThan(1.05);
    expect(tall(blade)).toBeGreaterThan(1.2 * tall(plain));
    expect(tall(sail)).toBeLessThan(tall(plain));
    // …and the blade rakes back: its tip hangs over the rear of its base
    const tip = new THREE.Vector3();
    const pos = buildFin('dorsal', up, g, 1, 'shark').membrane.getAttribute('position');
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > tip.y) tip.fromBufferAttribute(pos, i);
    expect(tip.z).toBeLessThan(-0.3 * g);
    // a shark's tail: the upper lobe reaches well past the lower, and further back
    const back = new THREE.Vector3(0, 0, -1);
    const sharkTail = buildFin('caudal', back, g, 1, 'shark').membrane.getAttribute('position');
    let upper = 0, lower = 0;
    for (let i = 0; i < sharkTail.count; i++) {
      const reach = -sharkTail.getZ(i);
      if (sharkTail.getY(i) > 0.2 * g) upper = Math.max(upper, reach);
      if (sharkTail.getY(i) < -0.2 * g) lower = Math.max(lower, reach);
    }
    expect(upper).toBeGreaterThan(1.6 * lower);
    // a fish's fork is even, top and bottom
    const fork = box('caudal', 'fish', back);
    expect(Math.abs(fork.max.y + fork.min.y)).toBeLessThan(0.08);
    // a shark's pectoral is a long plane, a fish's a short paddle
    const side = new THREE.Vector3(1, -0.2, 0).normalize();
    expect(box('pectoral', 'shark', side).max.x).toBeGreaterThan(1.5 * box('pectoral', 'fish', side).max.x);
  });
});


describe('spread feathered wing (flight posture)', () => {
  it('reaches out along its own side in a near-horizontal plane, never across the midline', () => {
    const base = new THREE.Color(0.5, 0.6, 0.4), accent = new THREE.Color(0.8, 0.3, 0.2);
    for (const side of [1, -1]) {
      const S = 2;
      const { surface } = buildSpreadFeatheredWing(side, S, base, accent);
      const pos = surface.getAttribute('position');
      let reach = 0, minSide = Infinity, yLo = Infinity, yHi = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) * side;
        reach = Math.max(reach, x);
        minSide = Math.min(minSide, x);
        yLo = Math.min(yLo, pos.getY(i));
        yHi = Math.max(yHi, pos.getY(i));
      }
      expect(reach).toBeGreaterThan(S * 0.85); // a span, not a stub
      expect(minSide).toBeGreaterThan(-S * 0.05); // its own side of the body
      expect(yHi - yLo).toBeLessThan(S * 0.35); // spread flat, not hanging
    }
  });
});

describe('plumage sheets (one continuous surface, painted in feather tiers)', () => {
  const base = new THREE.Color(0.55, 0.45, 0.3), accent = new THREE.Color(0.1, 0.3, 0.7);
  const lum = (g: THREE.BufferGeometry, pick: (x: number, z: number) => boolean) => {
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    let sum = 0, n = 0;
    for (let i = 0; i < pos.count; i++) {
      if (!pick(pos.getX(i), pos.getZ(i))) continue;
      sum += 0.3 * col.getX(i) + 0.59 * col.getY(i) + 0.11 * col.getZ(i);
      n++;
    }
    return sum / Math.max(n, 1);
  };

  it('the hand (primaries) is painted darker than the shoulder (coverts), folded or spread', () => {
    // (the old wing was ~30 loose cards that z-fought into a clump; tiers must read by colour alone)
    const folded = buildFeatheredWing(1, 2, base, accent).surface;
    expect(lum(folded, (_x, z) => z < -1.5)).toBeLessThan(0.6 * lum(folded, (_x, z) => z > -0.4));
    const spread = buildSpreadFeatheredWing(1, 2, base, accent).surface;
    expect(lum(spread, (x) => x > 1.5)).toBeLessThan(0.6 * lum(spread, (x) => x < 0.6));
  });

  it('is a single welded sheet (no stacked cards), and conforming keeps its dome', () => {
    const w = buildFeatheredWing(1, 2, base, accent);
    const pos = w.surface.getAttribute('position');
    // every triangle shares its vertices with neighbours: an indexed grid, one connected sheet
    expect(w.surface.getIndex()!.count / 3).toBeGreaterThan(pos.count * 1.5);
    expect(w.lift!.length).toBe(pos.count);
    // wrapped onto a body it doesn't flatten: the lift (dome) rides above the margin
    const sphere = (x: number, y: number, z: number) => Math.hypot(x, y, z + 0.8) - 0.9;
    conformToSurface(w.surface, sphere, [0.5, 0, 0], 0.02, w.lift);
    let domed = 0;
    for (let i = 0; i < pos.count; i++) {
      const d = sphere(pos.getX(i) + 0.5, pos.getY(i), pos.getZ(i));
      expect(d).toBeGreaterThan(0.015);
      if (w.lift![i] > 0.05 && d > 0.02 + w.lift![i] * 0.9) domed++;
    }
    expect(domed).toBeGreaterThan(0);
  });
});

