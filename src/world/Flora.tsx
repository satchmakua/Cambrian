/**
 * Ground cover — grass you can see grow back, and wildflowers (viewer only).
 *
 * Meadows (and, sparser, the woodland floor) are carpeted with instanced grass tufts: a handful of
 * tapering blades each, swaying in a travelling wind (a vertex patch — the blade bends more toward
 * its tip). Each tuft reads the LIVE grass field under it a couple of times a second, so a herd
 * leaves cropped, straw-coloured stubble behind it and the meadow greens and grows tall again as it
 * recovers — the same field the grazers actually eat. Wildflowers dot the meadows on the same wind.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mulberry32 } from '../engine/rng';
import { biomeAt, heightAt, normalAt, type Terrain } from '../sim/terrain';
import type { World } from '../sim/world';
import { SEASON_LOOK } from './Landscape';
import { useQuality } from '../ui/settings';
import { cellMeshes, cellPrint, cellsOf, keepAt } from './cells';

/** the meadow is drawn as this many squares a side, each culled on its own (see cells.ts) */
export const GRASS_CELLS = 5;
/** every square of grass is looked at again this often (s) — and re-posed only if its grass changed */
const GRASS_LOOK = 0.5;
/** a square of meadow is drawn in full within this distance of the camera, thinning to GRASS_LEAST of
 *  its tufts at GRASS_FAR and beyond (a tuft that far off is a pixel or two of a green ground) */
export const GRASS_FULL = 45;
export const GRASS_FAR = 150;
export const GRASS_LEAST = 0.35;

/** One tuft: `n` blades fanned around the base, each a 2-segment tapering strip (uv.y = 0 root … 1 tip). */
function tuftGeometry(n = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rng = mulberry32(0x9a55);
  for (let b = 0; b < n; b++) {
    const a = (b / n) * Math.PI * 2 + rng() * 0.6;
    const lean = 0.18 + rng() * 0.3;
    const h = 0.75 + rng() * 0.5;
    const w = 0.045 + rng() * 0.02;
    const ox = Math.cos(a) * 0.08, oz = Math.sin(a) * 0.08;
    const dx = Math.cos(a), dz = Math.sin(a);
    // blade cross axis ⟂ its lean direction
    const cx = -dz * w, cz = dx * w;
    const base = pos.length / 3;
    for (let k = 0; k <= 2; k++) {
      const t = k / 2;
      const taper = 1 - t * 0.85;
      const bend = lean * t * t;
      const px = ox + dx * bend, pz = oz + dz * bend, py = h * t;
      if (k < 2) {
        pos.push(px - cx * taper, py, pz - cz * taper, px + cx * taper, py, pz + cz * taper);
        uv.push(0, t, 1, t);
        const s = 0.5 + 0.75 * t; // shaded at the root, sunlit at the tip
        col.push(s, s, s, s, s, s);
      } else {
        pos.push(px, py, pz);
        uv.push(0.5, 1);
        col.push(1.32, 1.32, 1.2);
      }
    }
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // grass lit like the ground it grows from: blade normals point (mostly) up — sideways normals left
  // every blade facing away from the sun nearly black against the meadow
  const nrm = new Float32Array((pos.length / 3) * 3);
  for (let i = 0; i < pos.length / 3; i++) {
    nrm[i * 3] = pos[i * 3] * 0.6;
    nrm[i * 3 + 1] = 1;
    nrm[i * 3 + 2] = pos[i * 3 + 2] * 0.6;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.normalizeNormals();
  return g;
}

/** Patch a material so instanced geometry sways in a travelling wind, bending more toward uv.y = 1.
 *  `keepNormals`: a double-sided blade keeps its (upward) normal on its back face too — three flips
 *  it for back faces, which turned every blade seen from behind black. */
function windy<T extends THREE.Material>(m: T, time: { value: number }, amp: number, keepNormals = false): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    if (keepNormals) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
      );
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 root = instanceMatrix[3].xyz;
        #else
          vec3 root = vec3(0.0);
        #endif
          float gust = sin(uTime * 1.3 + root.x * 0.11 + root.z * 0.07) * 0.6 + sin(uTime * 2.9 + root.x * 0.37 - root.z * 0.29) * 0.4;
          float k = uv.y * uv.y * ${amp.toFixed(3)};
          transformed.x += gust * k;
          transformed.z += gust * k * 0.6;`,
      );
  };
  return m;
}

interface Tuft {
  x: number;
  z: number;
  y: number;
  cell: number;
  s: number; // size
  r: number; // yaw
  tilt: [number, number]; // lean with the ground slope
  wood: boolean;
}

/** Scatter up to `maxTufts` tufts and `maxFlowers` flowers. One seeded stream decides every site, so
 *  a lower budget keeps a subset of the same meadow (the first sites drawn), not a different one. */
function scatter(terrain: Terrain, gridN: number, maxTufts: number, maxFlowers: number) {
  const rng = mulberry32(terrain.seed ^ 0x6a55);
  const tufts: Tuft[] = [];
  const flowers: { x: number; z: number; y: number; cell: number; c: number; s: number }[] = [];
  const cellSize = terrain.size / gridN;
  const cellOf = (x: number, z: number) => {
    const i = Math.min(gridN - 1, Math.max(0, Math.floor((x + terrain.size / 2) / cellSize)));
    const j = Math.min(gridN - 1, Math.max(0, Math.floor((z + terrain.size / 2) / cellSize)));
    return j * gridN + i;
  };
  for (let i = 0; i < maxTufts * 6 && tufts.length < maxTufts; i++) {
    const x = (rng() - 0.5) * terrain.size * 0.98;
    const z = (rng() - 0.5) * terrain.size * 0.98;
    const b = biomeAt(terrain, x, z);
    if (b !== 'meadow' && !(b === 'wood' && rng() < 0.35)) continue;
    const n = normalAt(terrain, x, z);
    if (n[1] < 0.8) continue; // no grass on steep banks
    tufts.push({ x, z, y: heightAt(terrain, x, z), cell: cellOf(x, z), s: 0.45 + rng() * 0.5, r: rng() * 6.283, tilt: [n[2] * 0.6, -n[0] * 0.6], wood: b === 'wood' });
    if (b === 'meadow' && flowers.length < maxFlowers && rng() < 0.09) {
      flowers.push({ x: x + (rng() - 0.5) * 0.3, z: z + (rng() - 0.5) * 0.3, y: heightAt(terrain, x, z), cell: cellOf(x, z), c: Math.floor(rng() * 5), s: 0.7 + rng() * 0.5 });
    }
  }
  return { tufts, flowers };
}

const LUSH = new THREE.Color(0x6aa63a);
const SHADE = new THREE.Color(0x4f7a32);
const STRAW = new THREE.Color(0xc0ad62);
const PETALS = [0xf4f1e6, 0xf2c94c, 0xb48be6, 0xe98bb0, 0x8fb8f0].map((c) => new THREE.Color(c));

export function Grass({ world }: { world: World }) {
  // (how much is drawn is a graphics option: the meshes are rebuilt when it changes)
  const q = useQuality();
  const { tufts, flowers } = useMemo(() => scatter(world.terrain, world.gridN, q.grass, q.flowers), [world, q.grass, q.flowers]);
  const geo = useMemo(() => tuftGeometry(), []);
  const head = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.075, 0);
    // a stalk of uv.y: the head sways like a blade tip
    const n = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2).fill(1), 2));
    return g;
  }, []);
  const time = useMemo(() => ({ value: 0 }), []);
  const mats = useMemo(
    () => ({
      grass: windy(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), time, 0.16, true),
      flower: windy(new THREE.MeshStandardMaterial({ roughness: 0.6, emissiveIntensity: 0.15 }), time, 0.1),
    }),
    [time],
  );
  useEffect(() => () => {
    geo.dispose();
    head.dispose();
    mats.grass.dispose();
    mats.flower.dispose();
  }, [geo, head, mats]);
  const flowerRef = useRef<THREE.InstancedMesh>(null);
  // The tufts, a square of meadow at a time: one instanced mesh each, with bounds of its own, so the
  // squares behind the camera and out to its sides are not drawn. (One mesh for the whole meadow was
  // drawn whole wherever the camera looked: 306k triangles at High, most of them out of view.)
  const cells = useMemo(() => cellsOf(tufts, world.terrain.size, GRASS_CELLS, (i) => tufts[i].s * 1.7 + 0.4), [tufts, world.terrain.size]);
  const meshes = useMemo(() => cellMeshes(cells, geo, mats.grass, { receive: true }), [cells, geo, mats.grass]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);

  // (re)pose the tufts from the live grass field: tall and green where lush, short stubble where
  // cropped. A square at a time, round and round, and only a square whose grass (or snow) has changed
  // since it was last posed: re-posing every tuft twice a second uploaded the whole meadow's
  // matrices and colours each time, though a herd grazes a few squares of it.
  const prints = useRef<number[]>([]);
  const next = useRef(0);
  const due = useRef(0);
  const flowerTimer = useRef(1);
  // (a rebuilt mesh starts with every instance at the origin: pose them all on the first frame)
  useEffect(() => {
    prints.current = cells.map(() => NaN);
    next.current = 0;
    due.current = cells.length;
    flowerTimer.current = 1;
  }, [cells, flowers]);
  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const white = useMemo(() => new THREE.Color(0xe8ecef), []);
  useFrame((st, dt) => {
    time.value += dt;
    // the season's tint, and a frosting of snow on the blades in winter
    const snow = SEASON_LOOK.snow.value;
    mats.grass.color.copy(SEASON_LOOK.tint.value).lerp(white, snow * 0.4);
    // the far squares are drawn thinner (a camera looking the length of the valley has all of it in
    // view: nothing to cull, and most of the meadow a hundred units off)
    for (let k = 0; k < cells.length; k++) {
      const d = st.camera.position.distanceTo(cells[k].sphere.center) - cells[k].sphere.radius;
      meshes[k].count = Math.ceil(cells[k].items.length * keepAt(d, GRASS_FULL, GRASS_FAR, GRASS_LEAST));
    }
    const lushOf = (cell: number) => {
      const cap = world.grassCap[cell];
      return cap > 0 ? Math.min(1, world.grass[cell] / cap) : 0.6;
    };
    due.current = Math.min(cells.length, due.current + (dt / GRASS_LOOK) * cells.length);
    for (; due.current >= 1 && cells.length > 0; due.current -= 1) {
      const k = next.current;
      next.current = (k + 1) % cells.length;
      const cell = cells[k];
      const print = cellPrint(cell, (i) => Math.round(lushOf(tufts[i].cell) * 32), Math.round(snow * 20));
      if (print === prints.current[k]) continue;
      prints.current[k] = print;
      const m = meshes[k];
      cell.items.forEach((i, j) => {
        const t = tufts[i];
        const lush = lushOf(t.cell);
        const h = t.s * (0.22 + 0.78 * lush) * (1 - 0.4 * snow); // winter flattens it
        o.position.set(t.x, t.y - 0.02, t.z);
        o.rotation.set(t.tilt[0], t.r, t.tilt[1]);
        o.scale.set(t.s * 0.9, h, t.s * 0.9);
        o.updateMatrix();
        m.setMatrixAt(j, o.matrix);
        c.copy(t.wood ? SHADE : LUSH).lerp(STRAW, (1 - lush) * 0.85);
        m.setColorAt(j, c);
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    flowerTimer.current += dt;
    if (flowerTimer.current < 0.5) return;
    flowerTimer.current = 0;
    const f = flowerRef.current;
    if (f) {
      for (let i = 0; i < flowers.length; i++) {
        const fl = flowers[i];
        const cap = world.grassCap[fl.cell];
        const lush = cap > 0 ? Math.min(1, world.grass[fl.cell] / cap) : 0.6;
        // grazed off with the grass; they come back when it does
        const s = lush > 0.45 && SEASON_LOOK.snow.value < 0.3 ? fl.s : 0; // and no flowers under snow
        o.position.set(fl.x, fl.y + 0.55 * fl.s, fl.z);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(s);
        o.updateMatrix();
        f.setMatrixAt(i, o.matrix);
        f.setColorAt(i, PETALS[fl.c]);
      }
      f.instanceMatrix.needsUpdate = true;
      if (f.instanceColor) f.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={cells[i].id} object={m} />
      ))}
      <instancedMesh ref={flowerRef} args={[head, mats.flower, flowers.length]} frustumCulled={false} />
    </>
  );
}
