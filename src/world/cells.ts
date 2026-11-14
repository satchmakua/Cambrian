/**
 * Cells — the valley's scattered things (grass tufts, tree crowns, bushes) sorted into a coarse grid
 * of squares, so that each square can be one instanced mesh with bounds of its own.
 *
 * One instanced mesh for the whole valley has the whole valley for its bounds: it is drawn — every
 * instance of it, in the main pass and again in the sun's shadow pass — wherever the camera looks.
 * Up close most of it is behind the camera or out to the sides. Sorted into cells, the renderer's own
 * frustum test drops the squares that are out of view, and the shadow pass drops the squares outside
 * the box the sun's shadow camera covers. Pure: no scene, no renderer.
 */
import * as THREE from 'three';

export interface Cell {
  /** which square of the grid (row by row) */
  id: number;
  /** the things in this square: their indices in the list that was sorted */
  items: number[];
  /** a sphere that holds every one of them, each out to its own reach */
  sphere: THREE.Sphere;
}

/**
 * Sort `things` into an n×n grid over a square of side `size` centred on the origin. Squares with
 * nothing in them are left out. `reach(i)` is how far thing i extends from its own position (a
 * tuft's height, a crown's width): the cell's sphere is grown to hold it.
 */
export function cellsOf(things: readonly { x: number; y: number; z: number }[], size: number, n: number, reach: (i: number) => number): Cell[] {
  const side = size / n;
  const at = (v: number) => Math.min(n - 1, Math.max(0, Math.floor((v + size / 2) / side)));
  const byCell = new Map<number, number[]>();
  things.forEach((t, i) => {
    const id = at(t.z) * n + at(t.x);
    const list = byCell.get(id);
    if (list) list.push(i);
    else byCell.set(id, [i]);
  });
  const cells: Cell[] = [];
  for (const [id, items] of [...byCell.entries()].sort((a, b) => a[0] - b[0])) {
    // the middle of the things themselves (a square half full is bounded by its full half)
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const i of items) {
      const t = things[i];
      lo.min(_v.set(t.x, t.y, t.z));
      hi.max(_v);
    }
    const centre = lo.clone().add(hi).multiplyScalar(0.5);
    let radius = 0;
    for (const i of items) {
      const t = things[i];
      radius = Math.max(radius, _v.set(t.x, t.y, t.z).distanceTo(centre) + reach(i));
    }
    cells.push({ id, items, sphere: new THREE.Sphere(centre, radius) });
  }
  return cells;
}
const _v = new THREE.Vector3();

/**
 * One instanced mesh per cell, sharing a geometry and a material, each bounded by its cell's sphere
 * (so it is culled on its own). The caller sets the instances' matrices and disposes the meshes.
 */
export function cellMeshes(cells: readonly Cell[], geometry: THREE.BufferGeometry, material: THREE.Material, shadows: { cast?: boolean; receive?: boolean } = {}): THREE.InstancedMesh[] {
  return cells.map((c) => {
    const m = new THREE.InstancedMesh(geometry, material, c.items.length);
    // (an instanced mesh's own sphere is what the frustum test reads; left unset it is worked out from
    // the instances' matrices as they are at that moment — before any is set, a point at the origin)
    m.boundingSphere = c.sphere.clone();
    m.castShadow = !!shadows.cast;
    m.receiveShadow = !!shadows.receive;
    return m;
  });
}

/**
 * A fingerprint of a cell's state, for "has anything in this cell changed since it was last drawn?":
 * `level(i)` is each thing's state as a small whole number (its grass, in thirty-seconds). Two states
 * with the same levels give the same fingerprint; a change of any one level changes it (but for the
 * rare collision, which costs one late redraw).
 */
export function cellPrint(cell: Cell, level: (i: number) => number, salt = 0): number {
  let h = (0x811c9dc5 ^ salt) | 0;
  for (const i of cell.items) h = Math.imul(h ^ level(i), 16777619);
  return h | 0;
}

/**
 * How much of a cell's contents to draw from a distance `d`: all of it within `full`, thinning evenly
 * to the share `least` at `far` and beyond. (For things too small to tell apart far off — a tuft of
 * grass a hundred units away is a pixel — whose order in the cell is not their order on the ground,
 * so that the first few of them are a sparser scatter of the same patch, not a corner of it.)
 */
export function keepAt(d: number, full: number, far: number, least: number): number {
  if (d <= full) return 1;
  if (d >= far) return least;
  return 1 - (1 - least) * ((d - full) / (far - full));
}
