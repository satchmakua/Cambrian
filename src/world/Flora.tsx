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

const TUFTS = 17000;
const FLOWERS = 900;

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

function scatter(terrain: Terrain, gridN: number) {
  const rng = mulberry32(terrain.seed ^ 0x6a55);
  const tufts: Tuft[] = [];
  const flowers: { x: number; z: number; y: number; cell: number; c: number; s: number }[] = [];
  const cellSize = terrain.size / gridN;
  const cellOf = (x: number, z: number) => {
    const i = Math.min(gridN - 1, Math.max(0, Math.floor((x + terrain.size / 2) / cellSize)));
    const j = Math.min(gridN - 1, Math.max(0, Math.floor((z + terrain.size / 2) / cellSize)));
    return j * gridN + i;
  };
  for (let i = 0; i < TUFTS * 6 && tufts.length < TUFTS; i++) {
    const x = (rng() - 0.5) * terrain.size * 0.98;
    const z = (rng() - 0.5) * terrain.size * 0.98;
    const b = biomeAt(terrain, x, z);
    if (b !== 'meadow' && !(b === 'wood' && rng() < 0.35)) continue;
    const n = normalAt(terrain, x, z);
    if (n[1] < 0.8) continue; // no grass on steep banks
    tufts.push({ x, z, y: heightAt(terrain, x, z), cell: cellOf(x, z), s: 0.45 + rng() * 0.5, r: rng() * 6.283, tilt: [n[2] * 0.6, -n[0] * 0.6], wood: b === 'wood' });
    if (b === 'meadow' && flowers.length < FLOWERS && rng() < 0.09) {
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
  const { tufts, flowers } = useMemo(() => scatter(world.terrain, world.gridN), [world]);
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
  const tuftRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.InstancedMesh>(null);

  // (re)pose every tuft from the live grass field: tall and green where lush, short stubble where cropped
  const timer = useRef(1);
  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    time.value += dt;
    timer.current += dt;
    if (timer.current < 0.5) return;
    timer.current = 0;
    const m = tuftRef.current;
    if (m) {
      for (let i = 0; i < tufts.length; i++) {
        const t = tufts[i];
        const cap = world.grassCap[t.cell];
        const lush = cap > 0 ? Math.min(1, world.grass[t.cell] / cap) : 0.6;
        const h = t.s * (0.22 + 0.78 * lush);
        o.position.set(t.x, t.y - 0.02, t.z);
        o.rotation.set(t.tilt[0], t.r, t.tilt[1]);
        o.scale.set(t.s * 0.9, h, t.s * 0.9);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        c.copy(t.wood ? SHADE : LUSH).lerp(STRAW, (1 - lush) * 0.85);
        m.setColorAt(i, c);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const f = flowerRef.current;
    if (f) {
      for (let i = 0; i < flowers.length; i++) {
        const fl = flowers[i];
        const cap = world.grassCap[fl.cell];
        const lush = cap > 0 ? Math.min(1, world.grass[fl.cell] / cap) : 0.6;
        // grazed off with the grass; they come back when it does
        const s = lush > 0.45 ? fl.s : 0;
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
      <instancedMesh ref={tuftRef} args={[geo, mats.grass, tufts.length]} receiveShadow frustumCulled={false} />
      <instancedMesh ref={flowerRef} args={[head, mats.flower, flowers.length]} frustumCulled={false} />
    </>
  );
}
