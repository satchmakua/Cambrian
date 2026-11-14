import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry, type SkinQuality } from '../../src/viewer/smoothSkin';
import { buildFieldPrims, roundConeDist, type FieldPrims } from '../../src/viewer/bodyField';
import { TUBE_THIN, PODO_WAIST, PODO_EASE, TIP_POINT, HOOF_KNOB, bareTips, podomeres, splitThin } from '../../src/viewer/limbTubes';

type Geo = ReturnType<typeof buildSmoothGeometry>;

/** the limb links the skin draws exact at this grid cell (as splitThin picks them: the thin ones, and
 *  a jointed shell's leg links at any girth) */
function thinLinks(p: Phenotype, f: FieldPrims, cell: number): number[] {
  const out: number[] = [];
  const podo = podomeres(p, f);
  const tips = bareTips(p, f);
  for (let m = 0; m < f.nc; m++) {
    if (f.ia[m] === f.ib[m] || f.an[m]) continue;
    if (p.nodes[f.ia[m]].kind === 'spine' || p.nodes[f.ib[m]].kind === 'spine') continue;
    if (Math.max(f.ra[m], f.rb[m]) < TUBE_THIN * cell || podo?.[m] || tips?.[m]) out.push(m);
  }
  return out;
}

/** the points bare tails and tentacles run on to past their last nodes: each its root, heading, girth */
function bareTipPoints(p: Phenotype, f: FieldPrims): { b: number[]; u: number[]; r: number }[] {
  const tips = bareTips(p, f);
  const leaf = new Set(p.nodes.map((_, i) => i));
  for (const [a] of p.edges) leaf.delete(a);
  const out: { b: number[]; u: number[]; r: number }[] = [];
  if (!tips) return out;
  for (let m = 0; m < f.nc; m++) {
    if (!tips[m]) continue;
    const b = [f.bx[m], f.by[m], f.bz[m]];
    const n = p.nodes[f.ib[m]];
    // (only the last piece of the link ends AT the leaf node)
    if (!leaf.has(f.ib[m]) || Math.hypot(b[0] - n.pos[0], b[1] - n.pos[1], b[2] - n.pos[2]) > 1e-6) continue;
    const L = Math.hypot(f.bx[m] - f.ax[m], f.by[m] - f.ay[m], f.bz[m] - f.az[m]) || 1;
    out.push({ b, u: [(f.bx[m] - f.ax[m]) / L, (f.by[m] - f.ay[m]) / L, (f.bz[m] - f.az[m]) / L], r: f.rb[m] });
  }
  return out;
}

/** whether a point lies on one of those points (past its root along its heading, within its girth) */
const onPoint = (pts: ReturnType<typeof bareTipPoints>, x: number, y: number, z: number) =>
  pts.some(({ b, u, r }) => {
    const d = [x - b[0], y - b[1], z - b[2]];
    const t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
    return t > -1e-6 && t <= TIP_POINT * r * 1.01 && Math.hypot(d[0] - u[0] * t, d[1] - u[1] * t, d[2] - u[2] * t) <= r * 1.01;
  });

/** the knees of a jointed shell's legs: each joint where one podomere hands on to the next — its
 *  centre, girth (the wider of the two links' ends there) and the two links */
function podoJoints(p: Phenotype, f: FieldPrims): { c: number[]; r: number; inLink: number; outLink: number }[] {
  const podo = podomeres(p, f);
  const out: { c: number[]; r: number; inLink: number; outLink: number }[] = [];
  if (!podo) return out;
  for (let m = 0; m < f.nc; m++) {
    if (!podo[m]) continue;
    for (let n = 0; n < f.nc; n++) {
      if (!podo[n] || Math.hypot(f.ax[n] - f.bx[m], f.ay[n] - f.by[m], f.az[n] - f.bz[m]) > 1e-6) continue;
      out.push({ c: [f.bx[m], f.by[m], f.bz[m]], r: Math.max(f.rb[m], f.ra[n]), inLink: m, outLink: n });
    }
  }
  return out;
}

const coneDist = (f: FieldPrims, m: number, x: number, y: number, z: number) =>
  roundConeDist(x, y, z, f.ax[m], f.ay[m], f.az[m], f.bx[m], f.by[m], f.bz[m], f.ra[m], f.rb[m]);

/** how far a point lies from the trunk's own skin — its spine cones and its shaped (ellipsoid) nodes —
 *  so a measure of a limb can leave out the body it springs from */
function bodyDist(p: Phenotype, f: FieldPrims, x: number, y: number, z: number): number {
  let d = Infinity;
  for (let m = 0; m < f.nc; m++) {
    if (p.nodes[f.ia[m]].kind === 'spine' && p.nodes[f.ib[m]].kind === 'spine') d = Math.min(d, coneDist(f, m, x, y, z));
  }
  for (let e = 0; e < f.ne; e++) {
    // the point in the ellipsoid's frame (rotate by the conjugate of its orientation)
    const [qx, qy, qz, qw] = [-f.eq[e * 4], -f.eq[e * 4 + 1], -f.eq[e * 4 + 2], f.eq[e * 4 + 3]];
    const vx = x - f.ec[e * 3], vy = y - f.ec[e * 3 + 1], vz = z - f.ec[e * 3 + 2];
    const tx = qw * vx + qy * vz - qz * vy, ty = qw * vy + qz * vx - qx * vz, tz = qw * vz + qx * vy - qy * vx, tw = -qx * vx - qy * vy - qz * vz;
    const lx = tx * qw - tw * qx - ty * qz + tz * qy;
    const ly = ty * qw - tw * qy - tz * qx + tx * qz;
    const lz = tz * qw - tw * qz - tx * qy + ty * qx;
    const rx = f.er[e * 3], ry = f.er[e * 3 + 1], rz = f.er[e * 3 + 2];
    d = Math.min(d, (Math.hypot(lx / rx, ly / ry, lz / rz) - 1) * Math.min(rx, ry, rz));
  }
  return d;
}

/** the cone a point lies nearest (by the exact round-cone distance) */
function nearestCone(f: FieldPrims, x: number, y: number, z: number): number {
  let best = -1;
  let bd = Infinity;
  for (let m = 0; m < f.nc; m++) {
    const d = coneDist(f, m, x, y, z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function build(kind: string, seed: number, q: SkinQuality): { p: Phenotype; f: FieldPrims; g: Geo; cell: number } {
  const p = grow(genomeOfMorphotype(seed, kind));
  const g = buildSmoothGeometry(p, true, [], q);
  return { p, f: buildFieldPrims(p, 'hybrid'), g, cell: g.userData.cell as number };
}

describe('thin limbs drawn exact', () => {
  it('a thin leg keeps its own girth on a coarse skin (it is not floored to the grid)', () => {
    // a spider's legs on the World's coarser skins: marching tets floor a link at 0.88 of a cell, two
    // or three times a leg's own girth at these fineness levels
    let checked = 0;
    for (const seed of [1, 2, 3]) {
      for (const q of ['low', 'far'] as const) {
        const { p, f, g, cell } = build('arachnid', seed, q);
        const pos = g.getAttribute('position');
        for (const m of thinLinks(p, f, cell)) {
          if (p.nodes[f.ib[m]].part?.kind !== 'leg') continue;
          const A = [f.ax[m], f.ay[m], f.az[m]], B = [f.bx[m], f.by[m], f.bz[m]];
          const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
          const rMid = (f.ra[m] + f.rb[m]) / 2;
          if (L < 6 * rMid || rMid > 0.6 * cell) continue; // a long link a floor would swell
          const u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L, (B[2] - A[2]) / L];
          const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
          let widest = 0;
          for (let v = 0; v < pos.count; v++) {
            const d = [pos.getX(v) - M[0], pos.getY(v) - M[1], pos.getZ(v) - M[2]];
            const ax = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
            if (Math.abs(ax) > 0.2 * L) continue;
            const rad = Math.hypot(d[0] - u[0] * ax, d[1] - u[1] * ax, d[2] - u[2] * ax);
            if (rad > 2 * cell) continue;
            if (nearestCone(f, pos.getX(v), pos.getY(v), pos.getZ(v)) !== m) continue;
            if (bodyDist(p, f, pos.getX(v), pos.getY(v), pos.getZ(v)) < 0.5 * cell) continue; // the body's own skin
            widest = Math.max(widest, rad);
          }
          expect(widest, `arachnid #${seed} ${q} link ${m}`).toBeGreaterThan(0.8 * rMid);
          expect(widest, `arachnid #${seed} ${q} link ${m}`).toBeLessThan(1.15 * rMid);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("a tube is its link's own surface: no tube vertex stands off the thin links, most lie on them", () => {
    for (const [kind, seed, q] of [['arachnid', 2, 'high'], ['cephalopod', 3, 'low'], ['felid', 1, 'high'], ['horror', 1, 'far']] as const) {
      const { p, f, g, cell } = build(kind, seed, q);
      const thin = thinLinks(p, f, cell);
      expect(thin.length, `${kind} has thin links`).toBeGreaterThan(0);
      const pos = g.getAttribute('position');
      const from = g.userData.tubeFrom.vertex as number;
      expect(pos.count).toBeGreaterThan(from);
      // (a jointed shell's leg is pinched in at its knees, inside its link by design: see the next test;
      // a bare tail or tentacle runs on past its last node to a point, past the link by design)
      const knees = podoJoints(p, f);
      const points = bareTipPoints(p, f);
      let on = 0;
      let off = 0;
      let pinched = 0;
      for (let v = from; v < pos.count; v++) {
        if (onPoint(points, pos.getX(v), pos.getY(v), pos.getZ(v))) {
          pinched++;
          continue;
        }
        let d = Infinity;
        let r = 0;
        for (const m of thin) {
          const dm = coneDist(f, m, pos.getX(v), pos.getY(v), pos.getZ(v));
          if (dm < d) {
            d = dm;
            r = Math.max(f.ra[m], f.rb[m]);
          }
        }
        // (a swept ring is a frustum's: a hair inside the round cone where the link tapers)
        if (d > 1e-4) off++;
        if (knees.some((k) => Math.hypot(pos.getX(v) - k.c[0], pos.getY(v) - k.c[1], pos.getZ(v) - k.c[2]) < (PODO_EASE + 1) * k.r)) pinched++;
        else if (Math.abs(d) < 0.03 * r) on++;
      }
      expect(off, `${kind}: tube vertices outside every thin link`).toBe(0);
      // (the rest sit just inside a neighbouring link: corners of the triangles that straddle a joint)
      expect(on / (pos.count - from - pinched), kind).toBeGreaterThan(0.75);
    }
  });

  it("where the field hands a limb on to a tube, the field's end is tucked inside the joint's ball (no two skins at one girth)", () => {
    // (the field cone's own end cap, past the joint along its own axis, would otherwise lie ON the tube's
    // joint ball — two surfaces of one girth, fighting over the pixels in a speckled ring)
    let checked = 0;
    for (const [kind, seed, q] of [['arachnid', 2, 'high'], ['felid', 1, 'high'], ['cephalopod', 2, 'high'], ['horror', 1, 'high']] as const) {
      const { p, f, g, cell } = build(kind, seed, q);
      const thin = new Set(thinLinks(p, f, cell));
      const key = (x: number, y: number, z: number) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      const ending = new Map<string, number[]>(); // the field cones that end at a point
      const touching = new Map<string, number>(); // …and how many field cones touch it at all
      for (let m = 0; m < f.nc; m++) {
        if (thin.has(m)) continue;
        const ka = key(f.ax[m], f.ay[m], f.az[m]), kb = key(f.bx[m], f.by[m], f.bz[m]);
        touching.set(ka, (touching.get(ka) ?? 0) + 1);
        touching.set(kb, (touching.get(kb) ?? 0) + 1);
        ending.set(kb, [...(ending.get(kb) ?? []), m]);
      }
      const pos = g.getAttribute('position');
      const fieldVerts = g.userData.tubeFrom.vertex as number;
      for (const m of thin) {
        // a tube that starts where exactly one field cone ends: the hand-over
        const k = key(f.ax[m], f.ay[m], f.az[m]);
        if (touching.get(k) !== 1 || !ending.has(k)) continue;
        const F = ending.get(k)![0];
        const P = [f.ax[m], f.ay[m], f.az[m]];
        const r = f.ra[m];
        const LF = Math.hypot(P[0] - f.ax[F], P[1] - f.ay[F], P[2] - f.az[F]);
        // (a steeply tapering cone — a leg's root, from the trunk's girth down to the leg's — crosses the
        // joint's ball at a steep angle, which no two skins can fight over: the gentle hand-over is the one
        // that would lay a second skin over the ball)
        if (Math.abs(f.ra[F] - f.rb[F]) / LF >= 0.3) continue;
        const u = [(P[0] - f.ax[F]) / LF, (P[1] - f.ay[F]) / LF, (P[2] - f.az[F]) / LF];
        let worst = -Infinity;
        for (let v = 0; v < fieldVerts; v++) {
          const d = [pos.getX(v) - P[0], pos.getY(v) - P[1], pos.getZ(v) - P[2]];
          // the field past its cone's end, along that cone's own heading
          if (d[0] * u[0] + d[1] * u[1] + d[2] * u[2] < 0.15 * r || Math.hypot(d[0], d[1], d[2]) > 3 * r) continue;
          if (bodyDist(p, f, pos.getX(v), pos.getY(v), pos.getZ(v)) < 0.5 * cell) continue; // the body the limb springs from
          const near = nearestCone(f, pos.getX(v), pos.getY(v), pos.getZ(v));
          if (near !== F && near !== m) continue; // another limb passing by
          worst = Math.max(worst, Math.hypot(d[0], d[1], d[2]) - r);
        }
        if (worst === -Infinity) continue; // the field doesn't reach past the joint at all
        // (left untucked, the cap lies right on the ball: its worst vertex at ~0)
        expect(worst, `${kind} #${seed} ${q} hand-over to link ${m}`).toBeLessThan(-0.05 * r);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(12);
  });

  it('where the field hands a limb on, the tube takes the shade of the skin round the joint — no dark ring', () => {
    // (probed from the joint's ball, in the crease with the field's tucked-in end, the tube wore a dark
    // ring where it came out of the skin: the top of a sock a third of the way up a deer's leg)
    let checked = 0;
    for (const [kind, seed] of [['felid', 23], ['ungulate', 23], ['canid', 2], ['felid', 1]] as const) {
      const { p, f, g, cell } = build(kind, seed, 'high');
      const thin = new Set(thinLinks(p, f, cell));
      const key = (x: number, y: number, z: number) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      const fieldEnds = new Set<string>();
      for (let m = 0; m < f.nc; m++) {
        if (thin.has(m)) continue;
        fieldEnds.add(key(f.ax[m], f.ay[m], f.az[m]));
        fieldEnds.add(key(f.bx[m], f.by[m], f.bz[m]));
      }
      const pos = g.getAttribute('position');
      const ao = g.getAttribute('aAO');
      const from = g.userData.tubeFrom.vertex as number;
      for (const m of thin) {
        if (!fieldEnds.has(key(f.ax[m], f.ay[m], f.az[m]))) continue;
        const P = [f.ax[m], f.ay[m], f.az[m]];
        const r = f.ra[m];
        let tube = 0, nt = 0, skin = 0, ns = 0;
        for (let v = 0; v < pos.count; v++) {
          const d = Math.hypot(pos.getX(v) - P[0], pos.getY(v) - P[1], pos.getZ(v) - P[2]);
          if (v >= from && d <= 1.2 * r) {
            tube += ao.getX(v);
            nt++;
          } else if (v < from && d > 1.1 * r && d < 2.4 * r) {
            skin += ao.getX(v);
            ns++;
          }
        }
        if (nt === 0 || ns === 0) continue;
        expect(tube / nt, `${kind} #${seed} hand-over to link ${m}`).toBeGreaterThan(skin / ns - 0.1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it("a jointed shell's leg is a row of segments, pinched in at each knee and dark there — not a straw strung with beads", () => {
    // (drawn as the field has it, every knee was a ball of the leg's girth: an insect, a crab, a centipede
    // stood on smooth straws strung with beads, a doll's ball joints)
    let checked = 0;
    for (const [kind, seed] of [['insectoid', 1], ['insectoid', 2], ['crab', 23], ['arthro-alien', 3]] as const) {
      const { p, f, g } = build(kind, seed, 'high');
      const pos = g.getAttribute('position');
      const ao = g.getAttribute('aAO');
      const from = g.userData.tubeFrom.vertex as number;
      const knees = podoJoints(p, f);
      expect(knees.length, `${kind} #${seed} has knees`).toBeGreaterThan(0);
      const dist = (v: number, c: readonly number[]) => Math.hypot(pos.getX(v) - c[0], pos.getY(v) - c[1], pos.getZ(v) - c[2]);
      for (const k of knees) {
        const m = k.inLink;
        const L = Math.hypot(f.bx[m] - f.ax[m], f.by[m] - f.ay[m], f.bz[m] - f.az[m]);
        const u = [(f.bx[m] - f.ax[m]) / L, (f.by[m] - f.ay[m]) / L, (f.bz[m] - f.az[m]) / L];
        let waist = 0, dark = 0, shell = 0, ns = 0;
        for (let v = from; v < pos.count; v++) {
          const d = dist(v, k.c);
          // the leg's skin at the knee, well inside the leg's girth of the joint's centre (a ball of the
          // leg's girth kept it all at one girth out)…
          if (d < 0.8 * k.r) {
            waist++;
            dark += ao.getX(v);
          }
          // …and back up the segment, past the pinch, for the shell's own shade
          const t = (pos.getX(v) - k.c[0]) * u[0] + (pos.getY(v) - k.c[1]) * u[1] + (pos.getZ(v) - k.c[2]) * u[2];
          if (d > (PODO_EASE + 0.5) * k.r && d < (PODO_EASE + 1.2) * k.r && t < -PODO_EASE * k.r) {
            shell += ao.getX(v);
            ns++;
          }
        }
        if (ns === 0) continue; // (a segment too short to show its own shade past the pinch)
        expect(waist, `${kind} #${seed} knee of link ${m}: pinched`).toBeGreaterThan(0);
        expect(dark / waist, `${kind} #${seed} knee of link ${m}: the membrane's shade`).toBeLessThan(0.85 * (shell / ns));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('a knee keeps its whole membrane: a pose that bends it further than the rest shape opens no hole', () => {
    // (cut to the rest shape — the half of each knee's ball sunk in its segments dropped — a crab walking
    // bent its knees further, opened their outer side, and you could see the ground through the gap)
    let checked = 0;
    for (const [kind, seed] of [['crab', 23], ['insectoid', 1]] as const) {
      const { p, f, g } = build(kind, seed, 'high');
      const pos = g.getAttribute('position');
      const from = g.userData.tubeFrom.vertex as number;
      for (const k of podoJoints(p, f)) {
        const m = k.inLink;
        const L = Math.hypot(f.bx[m] - f.ax[m], f.by[m] - f.ay[m], f.bz[m] - f.az[m]);
        const u = [(f.bx[m] - f.ax[m]) / L, (f.by[m] - f.ay[m]) / L, (f.bz[m] - f.az[m]) / L];
        const jr = PODO_WAIST * k.r;
        let sunk = 0;
        for (let v = from; v < pos.count; v++) {
          const d = [pos.getX(v) - k.c[0], pos.getY(v) - k.c[1], pos.getZ(v) - k.c[2]];
          // a vertex of the knee's ball on the side sunk deep in the segment the knee ends
          if (Math.abs(Math.hypot(d[0], d[1], d[2]) - jr) < 0.02 * jr && d[0] * u[0] + d[1] * u[1] + d[2] * u[2] < -0.6 * jr) sunk++;
        }
        expect(sunk, `${kind} #${seed} knee of link ${m}`).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(12);
  });

  it("a furred spider's legs, and every limb but a shell's, keep their round knees", () => {
    // (the pinch is a jointed shell's: a hairy leg, a tail, a tentacle are drawn as they were)
    let furred = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'arachnid'));
      if (p.genomeRef.covering.type === 'chitin') continue;
      expect(podomeres(p, buildFieldPrims(p, 'hybrid')), `arachnid #${seed} (${p.genomeRef.covering.type})`).toBeNull();
      furred++;
    }
    expect(furred).toBeGreaterThan(0);
    for (const kind of ['felid', 'cephalopod', 'horror', 'lizard']) {
      const p = grow(genomeOfMorphotype(3, kind));
      expect(podomeres(p, buildFieldPrims(p, 'hybrid')), kind).toBeNull();
    }
  });

  it('a bare tail or tentacle runs on past its last node to a point — not a round fingertip', () => {
    // (capped with a ball of its last node's girth, never under R_MIN, every such tail ended blunt: a
    // snake's, a mouse's pink rod, a horror's tentacles like hoses)
    let checked = 0;
    for (const [kind, seed] of [['rodent', 2], ['serpent', 1], ['cephalopod', 3], ['horror', 1], ['felid', 1]] as const) {
      const { p, f, g } = build(kind, seed, 'high');
      const pos = g.getAttribute('position');
      const from = g.userData.tubeFrom.vertex as number;
      for (const { b, u, r } of bareTipPoints(p, f)) {
        let reach = 0, apex = Infinity;
        for (let v = from; v < pos.count; v++) {
          const d = [pos.getX(v) - b[0], pos.getY(v) - b[1], pos.getZ(v) - b[2]];
          const t = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
          const rad = Math.hypot(d[0] - u[0] * t, d[1] - u[1] * t, d[2] - u[2] * t);
          if (rad > 1.2 * r || t < 0) continue;
          if (t > reach) {
            reach = t;
            apex = rad;
          }
        }
        expect(reach / r, `${kind} #${seed} reach`).toBeGreaterThan(1.8);
        expect(apex / r, `${kind} #${seed} point`).toBeLessThan(0.25);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("a hooved leg's knee and hock are knobs: wider than the links they join, never swept through", () => {
    // (a ball of the joint's own girth, swept through or not, ran a deer's leg from its forearm to its hoof as
    // one smooth tapering stilt: no knee, no hock)
    expect(HOOF_KNOB).toBeGreaterThan(1.2);
    let drawn = 0;
    for (let seed = 1; seed <= 6; seed++) {
      // (at the near skin's own grid cell: its cannons are drawn exact)
      const { p, f, cell } = build('ungulate', seed, 'high');
      const split = splitThin(p, f, cell);
      if (!split) continue;
      drawn++;
      const parent = new Map(p.edges.map(([a, b]) => [b, a]));
      // every hoof's parent leg node is a knob
      const hooves = p.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.terminal === 'hoof');
      expect(hooves.length, `#${seed}`).toBe(4);
      expect(split!.knobs!.size, `#${seed} knees and hocks`).toBe(4);
      for (const { i } of hooves) expect(p.nodes[parent.get(i)!].part?.kind, `#${seed}`).toBe('leg');
    }
    expect(drawn).toBeGreaterThan(3);
    // (no other leg has any)
    for (const id of ['canid', 'felid', 'ursid']) {
      const { p, f, cell } = build(id, 3, 'high');
      expect(splitThin(p, f, cell)?.knobs?.size ?? 0, id).toBe(0);
    }
  });
});
