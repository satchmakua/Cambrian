/**
 * A planet's grid: the equiangular cube-sphere (sphere.ts), N cells along each face's edge, every cell a
 * point on the unit sphere with its eight neighbours — across the faces' seams as within them, and seven
 * at the cube's eight corners, where three faces meet. A planet's terrain is baked on it (planetBake.ts):
 * the plates, the noise, the rivers' flow from cell to cell, the lakes.
 *
 * A cell's index is face·N² + j·N + i (i along the face's s, j along its t), the layout of the fields'
 * cells (planetSurface.ts). Across a seam a cell's neighbour is found by its place on the shared edge,
 * where both faces' coordinates agree exactly (each divides the edge into the same N equal angles); off
 * the edge they do not, and a neighbour found by running on past it can land a cell out near the corners.
 *
 * Pure: the same N and seed make the same grid.
 */
import { mulberry32 } from '../engine/rng';
import { cubeToSphere, FACE_COUNT, sphereToCube, type Vec3 } from './sphere';

export interface CubeGrid {
  /** cells along a face's edge */
  N: number;
  /** cells in all (6N²) */
  count: number;
  /** each cell's point (x, y, z in turn): its middle, moved a little at random within it, so the rivers
   *  traced through the points neither run along the grid's lines nor kink at its seams */
  pt: Float64Array;
  /** each cell's neighbours, eight to a cell (−1 for the eighth a cube corner lacks) */
  nbr: Int32Array;
  /** the straight-line distance (on the unit sphere) from each cell's point to each neighbour's */
  gap: Float32Array;
  /** each cell's share of the unit sphere (they sum to 4π) */
  area: Float64Array;
}

/** the eight ways to a neighbour, (di, dj): the four across its sides first, then the four corners */
const WAYS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** how far a cell's point may sit from its middle (a share of the cell's width, either way) */
const JITTER = 0.35;

/** The cell holding the unit vector p. */
export function cellIndex(N: number, p: Vec3): number {
  const { face, s, t } = sphereToCube(p);
  const i = Math.min(N - 1, Math.max(0, Math.floor(((s + 1) / 2) * N)));
  const j = Math.min(N - 1, Math.max(0, Math.floor(((t + 1) / 2) * N)));
  return face * N * N + j * N + i;
}

/** A cell's middle (unjittered), on the unit sphere. */
export function cellCentre(N: number, k: number): Vec3 {
  const face = Math.floor(k / (N * N)), r = k - face * N * N;
  const j = Math.floor(r / N), i = r - j * N;
  return cubeToSphere(face, -1 + (2 * i + 1) / N, -1 + (2 * j + 1) / N);
}

/** The solid angle of the spherical triangle a, b, c (Van Oosterom and Strackee). */
function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  const ab = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const bc = b[0] * c[0] + b[1] * c[1] + b[2] * c[2];
  const ca = c[0] * a[0] + c[1] * a[1] + c[2] * a[2];
  return 2 * Math.abs(Math.atan2(det, 1 + ab + bc + ca));
}

export function makeGrid(N: number, seed: number): CubeGrid {
  const count = FACE_COUNT * N * N;
  const pt = new Float64Array(count * 3);
  const nbr = new Int32Array(count * 8).fill(-1);
  const gap = new Float32Array(count * 8);
  const area = new Float64Array(count);
  const rng = mulberry32(seed ^ 0x6c1d);
  const w = 2 / N; // a cell's width in face coordinates
  for (let f = 0; f < FACE_COUNT; f++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = f * N * N + j * N + i;
        const s = -1 + (2 * i + 1) / N, t = -1 + (2 * j + 1) / N;
        const p = cubeToSphere(f, s + (rng() - 0.5) * 2 * JITTER * w, t + (rng() - 0.5) * 2 * JITTER * w);
        pt[k * 3] = p[0];
        pt[k * 3 + 1] = p[1];
        pt[k * 3 + 2] = p[2];
        const c00 = cubeToSphere(f, s - w / 2, t - w / 2), c10 = cubeToSphere(f, s + w / 2, t - w / 2);
        const c11 = cubeToSphere(f, s + w / 2, t + w / 2), c01 = cubeToSphere(f, s - w / 2, t + w / 2);
        area[k] = triangleArea(c00, c10, c11) + triangleArea(c00, c11, c01);
        WAYS.forEach(([di, dj], e) => {
          const ii = i + di, jj = j + dj;
          const inI = ii >= 0 && ii < N, inJ = jj >= 0 && jj < N;
          if (inI && inJ) nbr[k * 8 + e] = f * N * N + jj * N + ii;
          else if (inI || inJ) {
            // over a seam: the place on the shared edge level with the neighbour's middle, nudged across it
            const over = !inI ? cubeToSphere(f, (ii < 0 ? -1 : 1) * (1 + 1e-4), -1 + (2 * jj + 1) / N) : cubeToSphere(f, -1 + (2 * ii + 1) / N, (jj < 0 ? -1 : 1) * (1 + 1e-4));
            nbr[k * 8 + e] = cellIndex(N, over);
          }
          // (both out: the corner of the cube itself, which has no cell beyond it)
        });
      }
    }
  }
  for (let k = 0; k < count; k++) {
    for (let e = 0; e < 8; e++) {
      const n = nbr[k * 8 + e];
      if (n < 0) continue;
      const dx = pt[n * 3] - pt[k * 3], dy = pt[n * 3 + 1] - pt[k * 3 + 1], dz = pt[n * 3 + 2] - pt[k * 3 + 2];
      gap[k * 8 + e] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  return { N, count, pt, nbr, gap, area };
}

/** a cell's point, as a vector */
export function pointOf(g: CubeGrid, k: number): Vec3 {
  return [g.pt[k * 3], g.pt[k * 3 + 1], g.pt[k * 3 + 2]];
}

// --- reading a field between the cells' middles --------------------------------------------------------

/**
 * A field laid out for reading anywhere: each face's cells with a border of one more cell all round, taken
 * from the faces next door, so a place near a seam reads between cells on both sides of it, not up to the
 * edge and stopping. (Each face (N + 2)² values; the border's from the neighbouring face read between its
 * cells, as near as its own cells come.)
 */
export interface Apron {
  N: number;
  v: Float32Array;
}

/** The field read between the middles of one face's own cells, run on straight past its outermost middles
 *  toward its edges (a border cell's place lies between them, and clamped there it would read a step). */
function insideFace(N: number, field: ArrayLike<number>, p: Vec3): number {
  const { face, s, t } = sphereToCube(p);
  const u = ((s + 1) / 2) * N - 0.5, v = ((t + 1) / 2) * N - 0.5;
  const i = Math.min(N - 2, Math.max(0, Math.floor(u))), j = Math.min(N - 2, Math.max(0, Math.floor(v)));
  const fu = u - i, fv = v - j;
  const b = face * N * N;
  const a00 = field[b + j * N + i], a10 = field[b + j * N + i + 1];
  const a01 = field[b + (j + 1) * N + i], a11 = field[b + (j + 1) * N + i + 1];
  return (a00 * (1 - fu) + a10 * fu) * (1 - fv) + (a01 * (1 - fu) + a11 * fu) * fv;
}

export function apronOf(N: number, field: ArrayLike<number>): Apron {
  const B = N + 2;
  const v = new Float32Array(FACE_COUNT * B * B);
  for (let f = 0; f < FACE_COUNT; f++) {
    for (let j = -1; j <= N; j++) {
      for (let i = -1; i <= N; i++) {
        const o = f * B * B + (j + 1) * B + (i + 1);
        if (i >= 0 && i < N && j >= 0 && j < N) v[o] = field[f * N * N + j * N + i];
        else v[o] = insideFace(N, field, cubeToSphere(f, -1 + (2 * i + 1) / N, -1 + (2 * j + 1) / N));
      }
    }
  }
  return { N, v };
}

/** The field at the unit vector p: read between the four cells' middles round it (bilinearly). */
export function sampleAt(a: Apron, p: Vec3): number {
  const N = a.N, B = N + 2;
  const { face, s, t } = sphereToCube(p);
  // (a cell's middle lies at u = its index + 1 in the bordered face)
  const u = Math.min(N + 0.999, Math.max(0, ((s + 1) / 2) * N + 0.5));
  const v = Math.min(N + 0.999, Math.max(0, ((t + 1) / 2) * N + 0.5));
  const i = Math.floor(u), j = Math.floor(v);
  const fu = u - i, fv = v - j;
  const o = face * B * B + j * B + i;
  const x = a.v;
  return (x[o] * (1 - fu) + x[o + 1] * fu) * (1 - fv) + (x[o + B] * (1 - fu) + x[o + B + 1] * fu) * fv;
}
