import { describe, it, expect } from 'vitest';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry, type SkinQuality } from '../../src/viewer/smoothSkin';
import { buildFieldPrims, roundConeDist, type FieldPrims } from '../../src/viewer/bodyField';
import { TUBE_THIN } from '../../src/viewer/limbTubes';

type Geo = ReturnType<typeof buildSmoothGeometry>;

/** the limb links the skin draws exact at this grid cell (as splitThin picks them) */
function thinLinks(p: Phenotype, f: FieldPrims, cell: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < f.nc; m++) {
    if (f.ia[m] === f.ib[m] || f.an[m]) continue;
    if (p.nodes[f.ia[m]].kind === 'spine' || p.nodes[f.ib[m]].kind === 'spine') continue;
    if (Math.max(f.ra[m], f.rb[m]) < TUBE_THIN * cell) out.push(m);
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
      let on = 0;
      let off = 0;
      for (let v = from; v < pos.count; v++) {
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
        if (Math.abs(d) < 0.03 * r) on++;
      }
      expect(off, `${kind}: tube vertices outside every thin link`).toBe(0);
      // (the rest sit just inside a neighbouring link: corners of the triangles that straddle a joint)
      expect(on / (pos.count - from), kind).toBeGreaterThan(0.75);
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
});
