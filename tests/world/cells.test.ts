/**
 * The valley's scattered things, sorted into squares that are each drawn — and culled — on their own.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { cellMeshes, cellPrint, cellsOf, keepAt } from '../../src/world/cells';
import { mulberry32 } from '../../src/engine/rng';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

/** n things scattered over a square of side `size`, each with a height of its own */
function scatter(n: number, size: number, seed = 7) {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => ({ x: (rng() - 0.5) * size, y: rng() * 6, z: (rng() - 0.5) * size, s: 0.5 + rng() }));
}

describe('cells', () => {
  it('every thing is in exactly one cell, inside that cell\'s sphere out to its own reach', () => {
    const things = scatter(4000, 200);
    const cells = cellsOf(things, 200, 5, (i) => things[i].s * 2);
    expect(cells.length).toBe(25);
    const seen = new Set<number>();
    for (const c of cells) {
      for (const i of c.items) {
        expect(seen.has(i)).toBe(false);
        seen.add(i);
        const t = things[i];
        expect(c.sphere.center.distanceTo(new THREE.Vector3(t.x, t.y, t.z)) + things[i].s * 2).toBeLessThanOrEqual(c.sphere.radius + 1e-9);
        // …and in the square it belongs to
        const col = Math.min(4, Math.max(0, Math.floor((t.x + 100) / 40)));
        const row = Math.min(4, Math.max(0, Math.floor((t.z + 100) / 40)));
        expect(c.id).toBe(row * 5 + col);
      }
      // a cell's sphere is its own square's, not the valley's
      expect(c.sphere.radius).toBeLessThan(40);
    }
    expect(seen.size).toBe(things.length);
    // in order, so the same valley always gives the same meshes in the same order
    expect(cells.map((c) => c.id)).toEqual([...cells.map((c) => c.id)].sort((a, b) => a - b));
  });

  it('leaves out the squares with nothing in them, and keeps what lies on or past the edge', () => {
    const things = [
      { x: -99, y: 0, z: -99 },
      { x: 100, y: 0, z: 100 }, // on the far edge
      { x: 250, y: 0, z: -250 }, // past it (a tuft scattered a hair outside): the nearest square
    ];
    const cells = cellsOf(things, 200, 4, () => 1);
    expect(cells.map((c) => c.id)).toEqual([0, 3, 15]);
    expect(cells.map((c) => c.items)).toEqual([[0], [2], [1]]);
    expect(cellsOf([], 200, 4, () => 1)).toEqual([]);
  });

  it('a camera close in draws a few of the squares; the sun\'s shadow box, the ones it covers', () => {
    // (one mesh for the whole meadow was drawn whole wherever the camera looked)
    const things = scatter(6000, 200, 11);
    const cells = cellsOf(things, 200, 5, () => 1.5);
    const geo = new THREE.BoxGeometry(0.2, 1, 0.2);
    const mat = new THREE.MeshBasicMaterial();
    const meshes = cellMeshes(cells, geo, mat, { receive: true });
    expect(meshes.length).toBe(cells.length);
    meshes.forEach((m, k) => {
      expect(m.count).toBe(cells[k].items.length);
      expect(m.boundingSphere!.equals(cells[k].sphere)).toBe(true);
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(true);
      expect(m.frustumCulled).toBe(true);
      m.updateMatrixWorld();
    });
    /** the share of all the things that a camera's frustum does not cull */
    const drawn = (cam: THREE.Camera) => {
      cam.updateMatrixWorld();
      const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      return meshes.filter((m) => f.intersectsObject(m)).reduce((t, m) => t + m.count, 0) / things.length;
    };
    const view = (from: [number, number, number], at: [number, number, number]) => {
      const cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.2, 1200);
      cam.position.set(...from);
      cam.lookAt(...at);
      return drawn(cam);
    };
    // the follow camera (fourteen-odd units from what it looks at), in the middle of the valley
    expect(view([14, 12, 16], [0, 0, 0])).toBeLessThan(0.55); // (0.45)
    // …near a corner, looking out of the valley: a sixth of it
    expect(view([46, 12, 44], [60, 0, 60])).toBeLessThan(0.25); // (0.16)
    // …looking along its edge
    expect(view([80, 12, 0], [80, 0, -20])).toBeLessThan(0.32); // (0.23)
    // …looking steeply down at one spot
    expect(view([3, 14, 3], [0, 0, 0])).toBeLessThan(0.28); // (0.20)
    // from a corner looking the length of the valley there is nothing to cull (the far grass is
    // thinned instead: keepAt), and from high overhead it is all in view
    expect(view([74, 12, 76], [60, 0, 60])).toBeGreaterThan(0.8);
    expect(view([0, 260, 1], [0, 0, 0])).toBe(1);
    // the sun's shadow camera: a box 140 across round what the camera looks at
    const sun = new THREE.OrthographicCamera(-70, 70, 70, -70, 10, 300);
    sun.position.set(-60, 110, -60 + 40);
    sun.lookAt(-60, 0, -60);
    expect(drawn(sun)).toBeGreaterThan(0.2);
    expect(drawn(sun)).toBeLessThan(0.7);
    meshes.forEach((m) => m.dispose());
    geo.dispose();
    mat.dispose();
  });

  it('a cell\'s fingerprint changes when any one thing in it changes, and not otherwise', () => {
    const things = scatter(300, 200, 3);
    const [cell] = cellsOf(things, 200, 1, () => 1);
    const levels = things.map((_, i) => (i * 7) % 33);
    const print = cellPrint(cell, (i) => levels[i]);
    expect(cellPrint(cell, (i) => levels[i])).toBe(print);
    for (const i of [0, 17, 299]) {
      const changed = [...levels];
      changed[i] += 1;
      expect(cellPrint(cell, (j) => changed[j])).not.toBe(print);
    }
    // the same grass under snow is another state
    expect(cellPrint(cell, (i) => levels[i], 4)).not.toBe(print);
    // two levels swapped between two things are not the same meadow
    const swapped = [...levels];
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    expect(swapped[3]).not.toBe(levels[3]);
    expect(cellPrint(cell, (j) => swapped[j])).not.toBe(print);
  });
});

describe('far grass is drawn thinner', () => {
  it('all of it up close, thinning evenly to a share of it far off', () => {
    expect(keepAt(0, 45, 150, 0.35)).toBe(1);
    expect(keepAt(45, 45, 150, 0.35)).toBe(1);
    expect(keepAt(97.5, 45, 150, 0.35)).toBeCloseTo(0.675, 12);
    expect(keepAt(150, 45, 150, 0.35)).toBe(0.35);
    expect(keepAt(900, 45, 150, 0.35)).toBe(0.35);
    // no step anywhere: moving the camera a pace changes a square by a tuft or two, not a patch
    for (let d = 0; d < 200; d += 0.5) expect(Math.abs(keepAt(d + 0.5, 45, 150, 0.35) - keepAt(d, 45, 150, 0.35))).toBeLessThan(0.004);
  });

  it('the first tufts of a square are a scatter of the whole square, not a corner of it', () => {
    // (a square drawn at a third is its first third: were the tufts in order across the ground,
    // the far meadow would be stripes of grass and bare earth)
    const things = scatter(3000, 200, 5);
    for (const cell of cellsOf(things, 200, 5, () => 1)) {
      if (cell.items.length < 60) continue;
      const span = (items: number[], axis: 'x' | 'z') => Math.max(...items.map((i) => things[i][axis])) - Math.min(...items.map((i) => things[i][axis]));
      const first = cell.items.slice(0, Math.ceil(cell.items.length * 0.35));
      for (const axis of ['x', 'z'] as const) expect(span(first, axis) / span(cell.items, axis)).toBeGreaterThan(0.85);
    }
  });
});

describe('what the valley costs to draw', () => {
  const code = (file: string) => readFileSync(join(SRC, 'world', file), 'utf8');

  it('grass, crowns and bushes are drawn by the square, not as one mesh for the whole valley', () => {
    const flora = code('Flora.tsx');
    expect(flora).toContain('cellsOf(tufts, world.terrain.size, GRASS_CELLS');
    expect(flora).toContain('cellMeshes(cells, geo, mats.grass');
    expect(flora).toContain('meshes[k].count = Math.ceil(cells[k].items.length * keepAt(d, GRASS_FULL, GRASS_FAR, GRASS_LEAST));');
    // (the tufts' own mesh was `frustumCulled={false}`: nothing of it was ever left out)
    expect(flora).not.toMatch(/args=\{\[geo, mats\.grass/);
    const land = code('Landscape.tsx');
    expect(land).toContain('cellsOf(trees, terrain.size, FLORA_CELLS');
    expect(land).toContain('cellsOf(pines, terrain.size, FLORA_CELLS');
    expect(land).toContain('cellsOf(sites, world.terrain.size, FLORA_CELLS');
    expect(land).not.toMatch(/args=\{\[geos\.crown/);
    expect(land).not.toMatch(/args=\{\[leaf, leafMat/);
  });

  it('a square of grass is re-posed only when its grass has changed', () => {
    // (every tuft in the valley was re-posed and re-uploaded twice a second)
    const flora = code('Flora.tsx');
    const iPrint = flora.indexOf('const print = cellPrint(cell');
    const iSkip = flora.indexOf('if (print === prints.current[k]) continue;');
    const iUpload = flora.indexOf('m.instanceMatrix.needsUpdate = true;');
    expect(iPrint).toBeGreaterThan(0);
    expect(iSkip).toBeGreaterThan(iPrint);
    expect(iUpload).toBeGreaterThan(iSkip);
  });

  it('only the berries that are on the bushes are drawn', () => {
    // (an empty slot was an instance scaled to nothing: its triangles were still sent)
    const land = code('Landscape.tsx');
    expect(land).toContain('m.setMatrixAt(n++, o.matrix);');
    expect(land).toContain('m.count = n;');
    expect(land).not.toContain('makeScale(0, 0, 0)');
  });

  it('the sun\'s shadow map is redrawn every other frame, not every frame', () => {
    const scene = code('WorldScene.tsx');
    expect(scene).toContain('export const SHADOW_EVERY = 2;');
    expect(scene).toContain('gl.shadowMap.autoUpdate = false;');
    expect(scene).toContain('if (frame.current++ % SHADOW_EVERY === 0) gl.shadowMap.needsUpdate = true;');
    // …and it is handed back as it was when the valley is left
    expect(scene).toContain('gl.shadowMap.autoUpdate = true;');
  });
});
