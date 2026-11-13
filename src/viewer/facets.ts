/**
 * Cut stone: a crystal body's skin as flat faces.
 *
 * The crystalline beast's hide was faceted only in its shading (the covering shader's per-pixel
 * cuts): its outline stayed the soft round body every other creature has, a pig in a glass texture.
 * A cut stone's outline is a polygon. Its skin is partitioned into Voronoi cells over body space (a
 * jittered grid, hashed from the seed), and every cell's vertices are laid onto that cell's own
 * plane — through their mean position, square to their mean normal — taking the plane's normal as
 * theirs. Each cell becomes one flat face; the triangles spanning two cells are the bevels between
 * faces. The surface stays one connected mesh (vertices are moved, never split), within a few
 * hundredths of a body unit of where it was. Pure.
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { unitHash } from '../engine/rng';
import { legWeights } from './feet';

/** a face's size, × the trunk's girth (its largest spine radius): about nine faces round a trunk */
export const FACET_SPAN = 0.75;
/** how far a vertex's own normal may turn from its face's and still be laid onto it (cosine), and how
 *  far off the face's plane it may lie (× the face's size) */
const FACET_AGREE = 0.7;
const FACET_REACH = 0.3;
/** …and the least a triangle may keep facing the way it did (the cosine of the most it may turn) */
const FACET_TURN = 0.2;

/** The size of the faces a crystal creature is cut into. */
export function facetSizeOf(p: Phenotype): number {
  let r = 0;
  for (const n of p.nodes) if (n.kind === 'spine' && (n.segment ?? 0) === 0) r = Math.max(r, n.radius);
  return Math.max(0.08, r * FACET_SPAN);
}

/** how far round an eye or a mouth the skin is left uncut (× its radius): what sits on the skin there
 *  — the lids, the socket, the lips — was seated on the uncut surface */
const FACE_CLEAR = 1.6;

/**
 * The vertices a cut leaves as they were: the legs (a face is wider than a shin: its plane cut a notch
 * into the leg's outline, the background showing through it), and round the eyes and the mouth (the
 * dark lip seam and the sockets were seated on the uncut skin; where the cut sank it, they stood out
 * of it in black flecks).
 */
export function facetKeep(p: Phenotype, geo: THREE.BufferGeometry): Uint8Array {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const keep = new Uint8Array(pos.count);
  const legs = legWeights(p, pos.array, pos.count);
  const face = p.nodes.filter((n) => n.terminal === 'eye' || n.terminal === 'mouth');
  for (let v = 0; v < pos.count; v++) {
    if (legs[v] > 0.2) {
      keep[v] = 1;
      continue;
    }
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    for (const n of face) {
      if (Math.hypot(x - n.pos[0], y - n.pos[1], z - n.pos[2]) < n.radius * FACE_CLEAR + 0.04) {
        keep[v] = 1;
        break;
      }
    }
  }
  return keep;
}

/** Cut a skin (indexed, with normals) into flat faces of about `size` across, in place; vertices
 *  marked in `keep` stay as they were. */
export function facetSkin(geo: THREE.BufferGeometry, size: number, seed: number, keep?: Uint8Array): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const n = pos.count;
  if (n === 0) return;
  const p0 = Float32Array.from(pos.array as Float32Array);
  const n0 = Float32Array.from(nrm.array as Float32Array);
  // each grid cell's jittered site, hashed once (a key packs the cell's three indices)
  const key = (cx: number, cy: number, cz: number) => ((cx + 1024) * 2048 + (cy + 1024)) * 2048 + (cz + 1024);
  const sites = new Map<number, [number, number, number]>();
  const siteOf = (cx: number, cy: number, cz: number): [number, number, number] => {
    const k = key(cx, cy, cz);
    let s = sites.get(k);
    if (!s) {
      s = [cx + 0.15 + 0.7 * unitHash(seed, cx, cy, cz, 1), cy + 0.15 + 0.7 * unitHash(seed, cx, cy, cz, 2), cz + 0.15 + 0.7 * unitHash(seed, cx, cy, cz, 3)];
      sites.set(k, s);
    }
    return s;
  };
  // which cell each vertex lies in: the nearest site of the 27 round its grid cell
  const cellOf = new Float64Array(n);
  for (let v = 0; v < n; v++) {
    const x = p0[v * 3] / size, y = p0[v * 3 + 1] / size, z = p0[v * 3 + 2] / size;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    let best = Infinity;
    let id = 0;
    for (let k = -1; k <= 1; k++)
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const s = siteOf(bx + i, by + j, bz + k);
          const d = (x - s[0]) ** 2 + (y - s[1]) ** 2 + (z - s[2]) ** 2;
          if (d < best) {
            best = d;
            id = key(bx + i, by + j, bz + k);
          }
        }
    cellOf[v] = id;
  }
  // each cell's plane: through its vertices' mean, square to their mean normal
  const cells = new Map<number, { c: [number, number, number]; m: [number, number, number]; k: number }>();
  for (let v = 0; v < n; v++) {
    let cell = cells.get(cellOf[v]);
    if (!cell) cells.set(cellOf[v], (cell = { c: [0, 0, 0], m: [0, 0, 0], k: 0 }));
    for (let a = 0; a < 3; a++) {
      cell.c[a] += p0[v * 3 + a];
      cell.m[a] += n0[v * 3 + a];
    }
    cell.k++;
  }
  for (const cell of cells.values()) {
    for (let a = 0; a < 3; a++) cell.c[a] /= cell.k;
    const l = Math.hypot(cell.m[0], cell.m[1], cell.m[2]);
    // (a cell whose normals cancel out — a sliver round a thin limb — keeps its vertices where they are)
    if (l < 0.35 * cell.k) cell.k = 0;
    else for (let a = 0; a < 3; a++) cell.m[a] /= l;
  }
  const arr = pos.array as Float32Array;
  const nar = nrm.array as Float32Array;
  // the mouth's carved cavity, and its rim, stay as they were: laid onto the face's planes, the wet
  // flesh inside came up through the hide in orange flecks, and the dark of the cavity in black ones
  const flesh = geo.getAttribute('aFlesh') as THREE.BufferAttribute | undefined;
  for (let v = 0; v < n; v++) {
    const cell = cells.get(cellOf[v])!;
    if (cell.k === 0) continue;
    if ((flesh && flesh.getX(v) > 0) || keep?.[v]) continue;
    const [nx, ny, nz] = cell.m;
    // a vertex turned well away from its cell's plane, or far off it, stays as it was: where a cell
    // spans a crease (a leg into the body) laying it flat folded the skin over itself, a black tear
    if (n0[v * 3] * nx + n0[v * 3 + 1] * ny + n0[v * 3 + 2] * nz < FACET_AGREE) continue;
    const d = (p0[v * 3] - cell.c[0]) * nx + (p0[v * 3 + 1] - cell.c[1]) * ny + (p0[v * 3 + 2] - cell.c[2]) * nz;
    if (Math.abs(d) > FACET_REACH * size) continue;
    arr[v * 3] = p0[v * 3] - nx * d;
    arr[v * 3 + 1] = p0[v * 3 + 1] - ny * d;
    arr[v * 3 + 2] = p0[v * 3 + 2] - nz * d;
    nar[v * 3] = nx;
    nar[v * 3 + 1] = ny;
    nar[v * 3 + 2] = nz;
  }
  // …and a triangle the cut turned over — its face swung more than FACET_TURN from where it faced
  // before — is put back as it was, until none is. (Tested only against its corners' new normals, a
  // bevel between two faces passed while it faced into the body: a black speck in the hide.)
  const index = geo.getIndex();
  if (index) {
    const ix = index.array;
    const face = (P: Float32Array, a: number, b: number, c: number, out: number[]): void => {
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      out[0] = uy * vz - uz * vy;
      out[1] = uz * vx - ux * vz;
      out[2] = ux * vy - uy * vx;
    };
    const f0 = [0, 0, 0], f1 = [0, 0, 0];
    for (let pass = 0; pass < 8; pass++) {
      let undone = 0;
      for (let t = 0; t < ix.length; t += 3) {
        const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        face(p0, a, b, c, f0);
        face(arr, a, b, c, f1);
        const l0 = Math.hypot(f0[0], f0[1], f0[2]), l1 = Math.hypot(f1[0], f1[1], f1[2]);
        if (l0 < 1e-12) continue;
        const kept = l1 > 1e-12 && f0[0] * f1[0] + f0[1] * f1[1] + f0[2] * f1[2] >= FACET_TURN * l0 * l1;
        // …nor may it come to face against its corners' normals, when it didn't before (it would be lit
        // as if it faced the other way)
        const lit = (N: Float32Array, f: number[]) =>
          f[0] * (N[a] + N[b] + N[c]) + f[1] * (N[a + 1] + N[b + 1] + N[c + 1]) + f[2] * (N[a + 2] + N[b + 2] + N[c + 2]) >= 0;
        if (kept && (lit(nar, f1) || !lit(n0, f0))) continue;
        for (const o of [a, b, c]) {
          for (let q = 0; q < 3; q++) {
            arr[o + q] = p0[o + q];
            nar[o + q] = n0[o + q];
          }
        }
        undone++;
      }
      if (undone === 0) break;
    }
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
  geo.computeBoundingSphere();
}
