import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFin, buildMembraneWing, buildFoldedMembraneWing, buildFeatheredWing, buildSpreadFeatheredWing, buildTailFan, conformToSurface, MEMBRANE_FOLD, wingOpenSpan, wingShoulder } from '../../src/viewer/wings';
import { dorsalSpikeGeometry, DORSAL_SPIKE, TAIL_STING } from '../../src/viewer/scutes';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';

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
        expect(f.b.z).toBeLessThan(f.a.z - 0.15 * S);
        expect(f.b.y).toBeLessThanOrEqual(f.a.y + 1e-9);
      }
      // the top edge FALLS from the wrist (run back level, the first finger was a rod with the skin
      // hung from it like a flag), and the tips end along the flank, not past the rump
      const top = fingers[0];
      expect(top.a.y - top.b.y).toBeGreaterThan(0.3 * (top.a.z - top.b.z));
      expect(b.min.z).toBeGreaterThan(-0.62 * S);
      // the skin is gathered: the finger tips stand out from the flank and in toward it by turns
      const outOf = (v: { x: number }) => v.x * side;
      for (let i = 1; i < fingers.length; i++) {
        expect(Math.sign(outOf(fingers[i].b) - outOf(fingers[i - 1].b))).toBe(i % 2 ? -1 : 1);
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

  it("a shark's tail is a broad crescent, its upper lobe sweeping up and back — not two thin spikes", () => {
    // (drawn from the root to an outline that ran from the lower tip through a notch right behind the
    // root to the upper tip, each lobe was a sliver of a triangle: a small fork on a long tube, a dolphin)
    const fin = buildFin('caudal', new THREE.Vector3(0, 0, -1), 1, 1, 'shark');
    const pos = fin.membrane.getAttribute('position');
    const ix = fin.membrane.getIndex()!;
    let area = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < ix.count; t += 3) {
      a.fromBufferAttribute(pos, ix.getX(t));
      b.fromBufferAttribute(pos, ix.getX(t + 1));
      c.fromBufferAttribute(pos, ix.getX(t + 2));
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    // a crescent fills a good share of the box it spans
    expect(area / (size.y * size.z)).toBeGreaterThan(0.3);
    // its upper lobe reaches higher above the root than the lower reaches below it
    expect(box.max.y).toBeGreaterThan(-box.min.y * 1.5);
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
    // …and a broad fan on the tail stock, notched shallow: it fills half its own box (with the tucked-in
    // hub). A fan from one point notched a third of its length — two needles in a V — filled a fifth.
    const tail = buildFin('caudal', back, g, 1, 'fish').membrane;
    const tp = tail.getAttribute('position');
    const ti = tail.getIndex()!;
    let area = 0;
    for (let t = 0; t < ti.count; t += 3) {
      const [a, b, c] = [ti.getX(t), ti.getX(t + 1), ti.getX(t + 2)];
      const uy = tp.getY(b) - tp.getY(a), uz = tp.getZ(b) - tp.getZ(a);
      const wy = tp.getY(c) - tp.getY(a), wz = tp.getZ(c) - tp.getZ(a);
      area += Math.abs(uy * wz - uz * wy) / 2;
    }
    expect(area / ((fork.max.y - fork.min.y) * (fork.max.z - fork.min.z))).toBeGreaterThan(0.45);
    // a shark's pectoral is a long plane, a fish's a short paddle
    const side = new THREE.Vector3(1, -0.2, 0).normalize();
    expect(box('pectoral', 'shark', side).max.x).toBeGreaterThan(1.5 * box('pectoral', 'fish', side).max.x);
  });
});


describe('a winged quadruped (a dragon, a chimera)', () => {
  it('roots its wings at its shoulders: the wrist over the forelegs, the elbow ahead of the hind legs', () => {
    // (anchored on the trunk link nearest the grown wing root — the middle of a three-link trunk, for
    // most of them — the wrist stood 0.4 behind the forelegs and the sail hung over the haunch)
    for (const id of ['dragon', 'chimera']) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = grow(genomeOfMorphotype(seed, id));
        const legRoots: number[] = [];
        for (const [a, b] of p.edges) if (p.nodes[b].part?.kind === 'leg' && p.nodes[a].kind === 'spine' && (p.nodes[a].segment ?? 0) === 0) legRoots.push(p.nodes[b].pos[2]);
        const fore = Math.max(...legRoots), hind = Math.min(...legRoots);
        for (const side of [1, -1]) {
          const at = wingShoulder(p, side)!;
          expect(Math.abs(at[2] - fore), `${id} #${seed} over the forelegs`).toBeLessThan(0.01);
          expect(Math.sign(at[0]), `${id} #${seed} on its own side`).toBe(side);
        }
        if (p.genomeRef.covering.type === 'feathers') continue; // (a raised feathered wing: no fold)
        const tip = p.nodes.find((n) => n.part?.kind === 'wing' && n.terminal && n.pos[0] > 0)!;
        const S = wingOpenSpan(p, tip.radius).openS * MEMBRANE_FOLD;
        const w = buildFoldedMembraneWing(1, S);
        const at = wingShoulder(p, 1)!;
        expect(at[2] + w.wrist!.z, `${id} #${seed} wrist`).toBeGreaterThan(fore - 0.1);
        expect(at[2] - 0.2 * S, `${id} #${seed} elbow`).toBeGreaterThan(hind);
        w.surface.dispose();
      }
    }
  });

  it("a wyvern's wings are its arms: they root at its chest", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'wyvern'));
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0).sort((a, b) => a.pos[2] - b.pos[2]);
      const chest = trunk[trunk.length - 1];
      expect(wingShoulder(p, 1)![2], `#${seed}`).toBeCloseTo(chest.pos[2] + 0.2 * chest.radius, 6);
    }
  });

  it("a folded wing's leading web is slack skin, bowed out, not an exact plane", () => {
    // (one flat plane from the back up to the wrist, lit flat: a pale slab on the withers)
    const g = buildFoldedMembraneWing(1, 4.6).surface;
    const n = g.getAttribute('normal');
    const ns: THREE.Vector3[] = [];
    for (let v = 0; v < 54; v++) if (v % 6 !== 0) ns.push(new THREE.Vector3().fromBufferAttribute(n, v));
    const mean = ns.reduce((a, b) => a.add(b), new THREE.Vector3()).normalize();
    const worst = Math.max(...ns.map((x) => (Math.acos(Math.min(1, x.dot(mean))) * 180) / Math.PI));
    expect(worst).toBeGreaterThan(8);
  });

  it('wears its back spines point out along their aim, raked back — never a cone stood point-down', () => {
    // (drawn as a leg's claw, each was a dark disc on a lump: a bolt-head beside the wing root)
    const up = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
    const r = 0.08;
    const g = dorsalSpikeGeometry(r, [up.x, up.y, up.z, up.w]);
    const pos = g.getAttribute('position');
    let top = -Infinity;
    for (let v = 0; v < pos.count; v++) top = Math.max(top, pos.getY(v));
    expect(top / r).toBeGreaterThan(2.5);
    // the far end is a point: every vertex out there is the one point
    const far: THREE.Vector3[] = [];
    for (let v = 0; v < pos.count; v++) if (pos.getY(v) > top - 0.05 * r) far.push(new THREE.Vector3().fromBufferAttribute(pos, v));
    for (const q of far) expect(q.distanceTo(far[0]) / r).toBeLessThan(0.05);
    // no flat face (the base's ring) stands out over the hide: the base is sunk
    const base: number[] = [];
    for (let v = 0; v < pos.count; v++) {
      const q = new THREE.Vector3().fromBufferAttribute(pos, v);
      if (q.distanceTo(far[0]) > DORSAL_SPIKE[0] * r * 0.9) base.push(q.y);
    }
    expect(Math.max(...base) / r).toBeLessThan(0.5);
    // …and its point leans back along the body (−Z)
    expect(far[0].z).toBeLessThan(-0.3 * r);
    g.dispose();
  });
});

describe("a tail's claw", () => {
  it('runs on from the tail tip as a sting along the tail — not a disc floating over its end', () => {
    // (drawn as a leg's claw — a cone stood point-down, never turned to its aim — a chimera's tail ended in a
    // blunt fingertip with a dark slate disc floating just past it)
    for (let seed = 1; seed <= 30; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'chimera'));
      const tip = p.nodes.find((n) => n.terminal === 'claw' && n.part?.kind === 'tail');
      if (!tip) continue;
      const r = Math.max(tip.radius, 0.06);
      const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(tip.quat[0], tip.quat[1], tip.quat[2], tip.quat[3]));
      const g = dorsalSpikeGeometry(r, tip.quat, TAIL_STING);
      const pos = g.getAttribute('position');
      let far = -Infinity, near = Infinity, side = 0;
      for (let v = 0; v < pos.count; v++) {
        const q = new THREE.Vector3().fromBufferAttribute(pos, v);
        const along = q.dot(aim);
        far = Math.max(far, along);
        near = Math.min(near, along);
        side = Math.max(side, q.clone().addScaledVector(aim, -along).length());
      }
      // its point out along the tail, its base sunk in the tip, no wider than the tail
      expect(far / r, `#${seed} reach`).toBeGreaterThan((TAIL_STING[0] - TAIL_STING[1]) * 0.98);
      expect(near / r, `#${seed} sunk`).toBeLessThan(-0.5 * TAIL_STING[1]);
      expect(side / r, `#${seed} slim`).toBeLessThanOrEqual(1.0001);
      g.dispose();
    }
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

