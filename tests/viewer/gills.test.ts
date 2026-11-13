/**
 * Marks and fins that belong ON the skin: a fish's gill cover, a shark's gill slits, and the base of a
 * fin that runs along the midline of a back or a belly.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildMeshData, type MeshFeature } from '../../src/viewer/meshData';
import { COVER_OF_DEPTH, gillCutOf, gillGeometry, gillMarks, gillRadiusOf } from '../../src/viewer/gills';
import { finOf } from '../../src/viewer/CreatureMesh';
import { buildFin, finChord, finCutOf, finKindOf, finScaleOf } from '../../src/viewer/wings';
import { surfacePrims } from '../../src/viewer/mouthLine';
import { fieldAt } from '../../src/viewer/bodyField';

const body = (id: string, seed: number) => grow(genomeOfMorphotype(seed, id));
const gillsOf = (p: Phenotype) => buildMeshData(p).features.filter((f) => f.type === 'gill');

describe('gills that lie in the skin', () => {
  it('the style gene picks the look: a gill cover, a rake of bars, a row of slits', () => {
    expect(gillCutOf(0.1)).toBe('cover');
    expect(gillCutOf(0.5)).toBe('bars');
    expect(gillCutOf(0.9)).toBe('slits');
    // (and the two kinds that wear them)
    expect(gillsOf(body('fish', 11)).every((f) => gillCutOf(f.style) === 'cover')).toBe(true);
    expect(gillsOf(body('shark', 11)).every((f) => gillCutOf(f.style) === 'slits')).toBe(true);
  });

  it('every point of a gill cover and of each gill slit is on the skin — not under it, not off it', () => {
    // (laid flat in the plane of the gill's node, two thirds of a cover's edge and half of all slits
    // were under the skin: one fish in four showed no gill at all, the rest broken slivers)
    let marks = 0;
    for (const id of ['fish', 'shark']) {
      for (let seed = 1; seed <= 12; seed++) {
        const p = body(id, seed);
        const prims = surfacePrims(p, 'hybrid');
        for (const f of gillsOf(p)) {
          const cut = gillCutOf(f.style);
          if (cut === 'bars') continue;
          const m = gillMarks(p, f.idx, 'hybrid', cut, gillRadiusOf(p, f.idx, cut, Math.max(f.radius, 0.06)));
          const o = p.nodes[f.idx].pos;
          expect(m.lines.length, `${id} #${seed}`).toBe(cut === 'cover' ? 1 : 5);
          for (const line of m.lines) {
            marks++;
            for (const q of line) {
              // the cord's centre: just outside the surface, by less than its own radius (so it is sunk in it)
              const d = fieldAt(prims, o[0] + q.x, o[1] + q.y, o[2] + q.z);
              expect(d, `${id} #${seed} above the skin`).toBeGreaterThan(0);
              expect(d, `${id} #${seed} touching the skin`).toBeLessThan(m.radius);
            }
          }
        }
      }
    }
    expect(marks).toBeGreaterThan(100);
  });

  it('a gill cover is the plate over the gills: its rim crosses more than half the depth of the flank', () => {
    // (sized to the gill part alone — a third of a girth — it was a comma scratched on the flank,
    // a sixth of the body's depth from end to end)
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = body('fish', seed);
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      for (const f of gillsOf(p)) {
        const link = p.nodes[parent.get(f.idx)!];
        const half = link.radius * (link.scale?.[1] ?? 1);
        const own = Math.max(f.radius, 0.06);
        const r = gillRadiusOf(p, f.idx, 'cover', own);
        expect(r).toBeCloseTo(Math.max(own, COVER_OF_DEPTH * half), 12);
        const span = (rad: number) => {
          const [line] = gillMarks(p, f.idx, 'hybrid', 'cover', rad).lines;
          return Math.max(...line.map((q) => q.y)) - Math.min(...line.map((q) => q.y));
        };
        expect(span(r) / (2 * half), `fish #${seed}`).toBeGreaterThan(0.42);
        expect(span(r) / (2 * half), `fish #${seed}: within the flank`).toBeLessThan(0.75);
        expect(span(own) / (2 * half), `fish #${seed}: the part's own size is a scratch`).toBeLessThan(0.3);
        seen++;
      }
      // a shark's slits each run about a third of the flank's depth: not a smudge (the gill part's own
      // size, a twelfth of it), nor cuts across the whole flank
      const sh = body('shark', seed);
      const shParent = new Map(sh.edges.map(([a, b]) => [b, a]));
      for (const f of gillsOf(sh)) {
        const link = sh.nodes[shParent.get(f.idx)!];
        const half = link.radius * (link.scale?.[1] ?? 1);
        const r = gillRadiusOf(sh, f.idx, 'slits', Math.max(f.radius, 0.06));
        const lines = gillMarks(sh, f.idx, 'hybrid', 'slits', r).lines;
        const tall = Math.max(...lines.map((l) => Math.max(...l.map((q) => q.y)) - Math.min(...l.map((q) => q.y))));
        expect(tall / (2 * half), `shark #${seed}`).toBeGreaterThan(0.2);
        expect(tall / (2 * half), `shark #${seed}`).toBeLessThan(0.45);
      }
    }
    expect(seen).toBeGreaterThan(12);
  });

  it("a gill cover's rim is on the tail side of the gill and bulges toward the tail, on both flanks", () => {
    // (the arc was drawn the other way round: its rim headward of its centre, opening to the tail)
    let seen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = body('fish', seed);
      for (const f of gillsOf(p)) {
        const [line] = gillMarks(p, f.idx, 'hybrid', 'cover', Math.max(f.radius, 0.06)).lines;
        const mid = line[(line.length - 1) / 2];
        // (points are relative to the gill's node; the head is +Z)
        expect(mid.z, `fish #${seed} rim behind the gill`).toBeLessThan(-0.5 * f.radius);
        expect(line[0].z, `fish #${seed} one end forward of the rim`).toBeGreaterThan(mid.z + 0.3 * f.radius);
        expect(line[line.length - 1].z, `fish #${seed} the other end too`).toBeGreaterThan(mid.z + 0.3 * f.radius);
        // it runs up and down the flank: its ends on either side of its middle
        expect((line[0].y - mid.y) * (line[line.length - 1].y - mid.y), `fish #${seed} spans the flank`).toBeLessThan(0);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(12);
  });

  it("a shark's slits are five short creases in a row along the body", () => {
    const p = body('shark', 11);
    const f = gillsOf(p)[0];
    const m = gillMarks(p, f.idx, 'hybrid', 'slits', f.radius);
    const zs = m.lines.map((l) => l[2].z);
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeGreaterThan(zs[i - 1] + 0.2 * f.radius); // tail → head, evenly spaced
    for (const l of m.lines) {
      const len = l[0].distanceTo(l[l.length - 1]);
      expect(len).toBeGreaterThan(0.6 * f.radius);
      expect(len).toBeLessThan(1.3 * f.radius);
    }
    const g = gillGeometry(m);
    expect(g.getAttribute('position').count).toBeGreaterThan(5 * 20);
    const a = g.getAttribute('position').array as ArrayLike<number>;
    for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true);
    g.dispose();
  });
});

/** The lower edge of a fin's membrane: where planes across its chord cut its triangles, lowest along its aim. */
function lowerEdge(geo: THREE.BufferGeometry, chord: THREE.Vector3, aim: THREE.Vector3, steps = 20): THREE.Vector3[] {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const idx = geo.getIndex();
  const n = idx ? idx.count : pos.count;
  const V = (i: number) => {
    const k = idx ? idx.getX(i) : i;
    return new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k));
  };
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const a = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).dot(chord);
    lo = Math.min(lo, a);
    hi = Math.max(hi, a);
  }
  const out: THREE.Vector3[] = [];
  for (let s = 0; s <= steps; s++) {
    const a = lo + (hi - lo) * (0.04 + 0.92 * (s / steps));
    let best: THREE.Vector3 | null = null;
    for (let t = 0; t < n; t += 3) {
      const tri = [V(t), V(t + 1), V(t + 2)];
      for (let e = 0; e < 3; e++) {
        const p = tri[e], q = tri[(e + 1) % 3];
        const ap = p.dot(chord), aq = q.dot(chord);
        if ((ap - a) * (aq - a) > 0 || ap === aq) continue;
        const x = p.clone().lerp(q, (a - ap) / (aq - ap));
        if (!best || x.dot(aim) < best.dot(aim)) best = x;
      }
    }
    if (best) out.push(best);
  }
  return out;
}

describe('a fin along the midline stands on the skin', () => {
  const aimOf = (f: MeshFeature) => new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...f.quat));
  /** the most daylight under the fin's lower edge, and its deepest burial (body units, by the skin's field) */
  const clearance = (p: Phenotype, f: MeshFeature, geo: THREE.BufferGeometry) => {
    const aim = aimOf(f);
    const chord = finChord(finKindOf(aim, f.kind), aim);
    const prims = surfacePrims(p, 'hybrid');
    const o = p.nodes[f.idx].pos;
    const ds = lowerEdge(geo, chord, aim).map((v) => fieldAt(prims, o[0] + v.x, o[1] + v.y, o[2] + v.z));
    return { day: Math.max(...ds), deep: Math.min(...ds) };
  };
  const midline = (p: Phenotype) =>
    buildMeshData(p).features.filter((f) => {
      if (f.type !== 'fin') return false;
      const k = finKindOf(aimOf(f), f.kind);
      return k === 'dorsal' || k === 'anal';
    });

  it("a fish's sail and keel, a shark's blades: the base follows the back or the belly it grows from", () => {
    // (run straight out from its root point, a bony fish's sail — three girths long — hung in the air
    // over the back's fall to the tail: a pennant held at its front, daylight under its rear half)
    const sails: number[] = [];
    for (const id of ['fish', 'shark']) {
      for (let seed = 1; seed <= 10; seed++) {
        const p = body(id, seed);
        for (const f of midline(p)) {
          const aim = aimOf(f);
          const kind = finKindOf(aim, f.kind);
          const c = clearance(p, f, finOf(f, p, 'hybrid').membrane);
          expect(c.day, `${id} #${seed} ${kind}: daylight under its edge`).toBeLessThan(0.1);
          expect(c.deep, `${id} #${seed} ${kind}: sunk in the body`).toBeGreaterThan(-0.2);
          if (id === 'fish' && kind === 'dorsal') sails.push(c.day);
        }
      }
    }
    expect(sails.length).toBe(10);
    sails.sort((a, b) => a - b);
    expect(sails[5], 'the median sail').toBeLessThan(0.04);
  });

  it('…where the same fin run straight stands clear of a falling back', () => {
    // (the premise of the test above: were this to stop holding, that one would prove nothing)
    const p = body('fish', 5);
    const f = midline(p).find((x) => finKindOf(aimOf(x), x.kind) === 'dorsal')!;
    const aim = aimOf(f);
    const parent = new Map(p.edges.map(([a, b]) => [b, a]));
    let c = parent.get(f.idx);
    while (c !== undefined && p.nodes[c].kind !== 'spine') c = parent.get(c);
    const straight = buildFin('dorsal', aim, p.nodes[c!].radius, finScaleOf(f.style), finCutOf(f.style));
    expect(clearance(p, f, straight.membrane).day).toBeGreaterThan(0.2);
    expect(clearance(p, f, finOf(f, p, 'hybrid').membrane).day).toBeLessThan(0.1);
  });

  it('buildFin lifts and drops its base by the root it is given, and leaves the fin its height', () => {
    const aim = new THREE.Vector3(0, 1, 0);
    const chord = finChord('dorsal', aim);
    const flat = buildFin('dorsal', aim, 0.8, 1, 'fish');
    const fall = buildFin('dorsal', aim, 0.8, 1, 'fish', (along) => -0.3 * along);
    const a = flat.membrane.getAttribute('position') as THREE.BufferAttribute;
    const b = fall.membrane.getAttribute('position') as THREE.BufferAttribute;
    expect(b.count).toBe(a.count);
    for (let i = 0; i < a.count; i++) {
      const v = new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i));
      const w = new THREE.Vector3(b.getX(i), b.getY(i), b.getZ(i));
      // each point keeps its place along the chord and moves along the aim by the root's height there
      // (the buffer is 32-bit floats)
      expect(w.dot(chord)).toBeCloseTo(v.dot(chord), 5);
      expect(w.dot(aim) - v.dot(aim)).toBeCloseTo(-0.3 * v.dot(chord), 5);
    }
  });
});
