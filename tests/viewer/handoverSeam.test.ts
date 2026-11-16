import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { grow, type Phenotype } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildSmoothGeometry, type SkinQuality } from '../../src/viewer/smoothSkin';
import { buildFieldPrims } from '../../src/viewer/bodyField';
import { splitThin } from '../../src/viewer/limbTubes';

/**
 * THE HAND-OVER SEAM. Where a leg drawn in the skin's field hands on to an exact tube (limbTubes splitThin),
 * the leg must run on as one limb: seen from all round, the outermost surface just above the joint keeps the
 * leg's own girth and the lean of its own flank. (The field's end, tucked in under the tube's joint ball,
 * left a crease ring there — the rounded end's face turned down, the ball's top turned up just under it,
 * the skin's normals bent down a cell above: a dog's every wrist and hock wore the top of a sock.)
 */
interface Row { t: number; rho: number; lean: number; nomLean: number }
const key = (x: number, y: number, z: number) => `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
function perp(u: number[]): number[] {
  const a = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const d = a[0] * u[0] + a[1] * u[1] + a[2] * u[2];
  const v = [a[0] - u[0] * d, a[1] - u[1] * d, a[2] - u[2] * d];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** every leg's (and walking arm's) hand-over (a gently bent joint, the field's own round leg link above it, the tube below):
 *  slices across the field's link from 1 girth above the joint down to 0.1 of one, each cut by 24 rays cast
 *  in toward the axis — the first surface each meets is what is seen there: its radius (× the link's
 *  girth there) and its normal's lean along the leg, medians round the slice */
function seams(p: Phenotype, g: THREE.BufferGeometry): { link: number; rows: Row[] }[] {
  const cell = g.userData.cell as number;
  const f = buildFieldPrims(p, 'hybrid');
  const split = splitThin(p, buildFieldPrims(p, 'hybrid'), cell);
  if (!split) return [];
  const tubes = new Set(split.tubes);
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const idx = g.getIndex()!;
  const out: { link: number; rows: Row[] }[] = [];
  for (const m of split.tubes) {
    // (a leg's, or an arm an ape walks on)
    if (!['leg', 'arm'].includes(p.nodes[f.ib[m]].part?.kind ?? '') || p.nodes[f.ib[m]].terminal === 'hoof') continue;
    const kP = key(f.ax[m], f.ay[m], f.az[m]);
    const at: number[] = [];
    for (let F = 0; F < f.nc; F++) {
      if (tubes.has(F) || f.ia[F] === f.ib[F]) continue;
      if (key(f.bx[F], f.by[F], f.bz[F]) === kP || key(f.ax[F], f.ay[F], f.az[F]) === kP) at.push(F);
    }
    if (at.length !== 1 || key(f.bx[at[0]], f.by[at[0]], f.bz[at[0]]) !== kP) continue;
    const F = at[0];
    if (f.an[F] || p.nodes[f.ia[F]].kind === 'spine') continue; // (a leg's root blends into the body)
    const P = [f.ax[m], f.ay[m], f.az[m]];
    const r = f.ra[m];
    const LF = Math.hypot(P[0] - f.ax[F], P[1] - f.ay[F], P[2] - f.az[F]);
    const Lm = Math.hypot(f.bx[m] - P[0], f.by[m] - P[1], f.bz[m] - P[2]);
    const u = [(P[0] - f.ax[F]) / LF, (P[1] - f.ay[F]) / LF, (P[2] - f.az[F]) / LF]; // down the field's link
    const um = [(f.bx[m] - P[0]) / Lm, (f.by[m] - P[1]) / Lm, (f.bz[m] - P[2]) / Lm];
    if (Math.acos(Math.min(1, u[0] * um[0] + u[1] * um[1] + u[2] * um[2])) > 0.7) continue; // (a knee's own fold)
    const tris: number[] = [];
    for (let i = 0; i < idx.count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = idx.getX(i + k);
        if (Math.hypot(pos.getX(v) - P[0], pos.getY(v) - P[1], pos.getZ(v) - P[2]) < 5 * r) {
          tris.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
          break;
        }
      }
    }
    const rows: Row[] = [];
    const tMin = -Math.min(1, (0.6 * LF) / r);
    for (let ti = Math.ceil(tMin * 10); ti <= -1; ti++) {
      const t = ti / 10;
      const C = [P[0] + u[0] * t * r, P[1] + u[1] * t * r, P[2] + u[2] * t * r];
      const e1 = perp(u);
      const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
      const rhos: number[] = [];
      const leans: number[] = [];
      for (let a = 0; a < 24; a++) {
        const ph = (2 * Math.PI * a) / 24;
        const D = [0, 1, 2].map((x) => -(e1[x] * Math.cos(ph) + e2[x] * Math.sin(ph)));
        const O = [C[0] - D[0] * 2 * r, C[1] - D[1] * 2 * r, C[2] - D[2] * 2 * r];
        let best = Infinity;
        let bn: number[] | null = null;
        for (let q = 0; q < tris.length; q += 3) {
          const [ia, ib, ic] = [tris[q], tris[q + 1], tris[q + 2]];
          const a0 = [pos.getX(ia), pos.getY(ia), pos.getZ(ia)];
          const E1 = [pos.getX(ib) - a0[0], pos.getY(ib) - a0[1], pos.getZ(ib) - a0[2]];
          const E2 = [pos.getX(ic) - a0[0], pos.getY(ic) - a0[1], pos.getZ(ic) - a0[2]];
          const h = [D[1] * E2[2] - D[2] * E2[1], D[2] * E2[0] - D[0] * E2[2], D[0] * E2[1] - D[1] * E2[0]];
          const det = E1[0] * h[0] + E1[1] * h[1] + E1[2] * h[2];
          if (Math.abs(det) < 1e-14) continue;
          const s = [O[0] - a0[0], O[1] - a0[1], O[2] - a0[2]];
          const bu = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
          if (bu < 0 || bu > 1) continue;
          const qv = [s[1] * E1[2] - s[2] * E1[1], s[2] * E1[0] - s[0] * E1[2], s[0] * E1[1] - s[1] * E1[0]];
          const bv = (D[0] * qv[0] + D[1] * qv[1] + D[2] * qv[2]) / det;
          if (bv < 0 || bu + bv > 1) continue;
          const tt = (E2[0] * qv[0] + E2[1] * qv[1] + E2[2] * qv[2]) / det;
          if (tt <= 0 || tt >= best) continue;
          best = tt;
          bn = [0, 1, 2].map((x) => nrm.getComponent(ia, x) * (1 - bu - bv) + nrm.getComponent(ib, x) * bu + nrm.getComponent(ic, x) * bv);
        }
        if (!bn || best > 2 * r) continue;
        rhos.push(2 * r - best);
        leans.push((bn[0] * u[0] + bn[1] * u[1] + bn[2] * u[2]) / (Math.hypot(bn[0], bn[1], bn[2]) || 1));
      }
      if (rhos.length < 12) continue;
      const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
      const girth = f.rb[F] + ((f.ra[F] - f.rb[F]) * -t * r) / LF;
      rows.push({ t, rho: med(rhos) / girth, lean: med(leans), nomLean: (f.ra[F] - f.rb[F]) / LF });
    }
    if (rows.length >= 5) out.push({ link: m, rows });
  }
  return out;
}

const CASES: [string, number, SkinQuality][] = [
  ['canid', 37, 'high'],
  ['canid', 37, 'low'],
  ['canid', 2, 'high'],
  ['felid', 2, 'high'],
  ['felid', 1, 'low'],
  ['ursid', 37, 'far'],
  ['ursid', 2, 'far'],
  ['mustelid', 37, 'high'],
  ['primate', 37, 'far'],
];

describe('where the field hands a leg on to a tube', () => {
  for (const [kind, seed, q] of CASES) {
    it(`a ${kind} #${seed} (${q} skin) runs on smooth through it: no ring, no step, no sock`, () => {
      const p = grow(genomeOfMorphotype(seed, kind));
      const g = buildSmoothGeometry(p, true, [], q);
      const ss = seams(p, g);
      expect(ss.length, 'hand-overs measured').toBeGreaterThanOrEqual(2);
      for (const s of ss) {
        let lean = 0, girth = 0, step = 0;
        s.rows.forEach((row, i) => {
          lean = Math.max(lean, Math.abs(row.lean - row.nomLean));
          girth = Math.max(girth, Math.abs(row.rho - 1));
          if (i > 0) step = Math.max(step, Math.abs(row.rho - s.rows[i - 1].rho));
        });
        // (the tucked end's crease: its face turned down 15–30°, the ball's top turned up — a lean off by
        // 0.25–0.6; and a waist where a steep link's slimmed end ducks under the ball)
        expect(lean, `link ${s.link}: the surface's lean off the leg's own`).toBeLessThan(0.15);
        expect(girth, `link ${s.link}: the outline off the leg's girth`).toBeLessThan(0.05);
        expect(step, `link ${s.link}: the outline's step from slice to slice`).toBeLessThan(0.03);
      }
    });
  }
});
