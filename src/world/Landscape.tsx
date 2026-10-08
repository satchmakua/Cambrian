/**
 * The world's ground, water and plants (viewer only — the truth lives in src/sim).
 *
 *   - Terrain: one heightfield mesh, vertex-coloured by biome (lakebed, sand, meadow, woodland
 *     floor, rock; steep slopes go rocky). Meadow colour follows the LIVE grass field — a grazed-out
 *     patch fades from lush green to dry straw and greens up again as it regrows — so you can see
 *     herds crop the land.
 *   - Water: a translucent, glossy sheet at the water line.
 *   - Fruit bushes: instanced leafy clumps with instanced fruit, shown as many as the bush holds.
 *   - Trees and rocks: deterministic decor scattered by biome (they don't feed anyone).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../engine/rng';
import { heightAt, biomeAt, moistureAt, normalAt, WATER_LEVEL, type Terrain } from '../sim/terrain';
import type { World } from '../sim/world';

const RES = 200; // terrain grid quads per side

const C = {
  lakebed: new THREE.Color(0x3d4a3f),
  sand: new THREE.Color(0xb8a77c),
  meadow: new THREE.Color(0x5f8f3a),
  dry: new THREE.Color(0xa8994f),
  wood: new THREE.Color(0x3f5f2c),
  rock: new THREE.Color(0x77736c),
  snow: new THREE.Color(0xd8d8d2),
};

export function TerrainMesh({ world }: { world: World }) {
  const t = world.terrain;
  const { geo, meadowW, cellX, cellZ, baseCol } = useMemo(() => buildTerrain(world), [world]);
  useEffect(() => () => geo.dispose(), [geo]);

  // re-tint the meadows from the live grass field a couple of times a second
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current += dt;
    if (clock.current < 0.5) return;
    clock.current = 0;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    const N = world.gridN;
    for (let v = 0; v < meadowW.length; v++) {
      const w = meadowW[v];
      if (w <= 0) continue;
      // bilinear sample of the grass field at the vertex, so grazed patches have soft edges
      const gx = cellX[v], gz = cellZ[v];
      const i0 = Math.floor(gx), j0 = Math.floor(gz);
      const fx = gx - i0, fz = gz - j0;
      let lush = 0, wsum = 0;
      for (let dj = 0; dj <= 1; dj++)
        for (let di = 0; di <= 1; di++) {
          const i = Math.min(N - 1, Math.max(0, i0 + di)), j = Math.min(N - 1, Math.max(0, j0 + dj));
          const k = j * N + i;
          const cap = world.grassCap[k];
          if (cap <= 0) continue;
          const wt = (di ? fx : 1 - fx) * (dj ? fz : 1 - fz);
          lush += Math.min(1, world.grass[k] / cap) * wt;
          wsum += wt;
        }
      lush = wsum > 0 ? lush / wsum : 1;
      tmp.setRGB(baseCol[v * 3], baseCol[v * 3 + 1], baseCol[v * 3 + 2]);
      // grazed → dry straw; lush → the biome colour
      tmp.lerp(C.dry, w * (1 - lush) * 0.85);
      col.setXYZ(v, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  });
  void t;
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.94} metalness={0} />
    </mesh>
  );
}

function buildTerrain(world: World) {
  const t = world.terrain;
  const geo = new THREE.PlaneGeometry(t.size, t.size, RES, RES);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const baseCol = new Float32Array(n * 3);
  const meadowW = new Float32Array(n);
  const cellX = new Float32Array(n);
  const cellZ = new Float32Array(n);
  const rng = mulberry32(t.seed ^ 0x1234);
  const col = new THREE.Color();
  const cell = t.size / world.gridN;
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v);
    const z = pos.getZ(v);
    const h = heightAt(t, x, z);
    pos.setY(v, h);
    const b = biomeAt(t, x, z);
    const nrm = normalAt(t, x, z);
    const steep = 1 - nrm[1];
    const m = moistureAt(t, x, z);
    if (b === 'deep' || b === 'shallow') col.copy(C.lakebed).lerp(C.sand, Math.max(0, Math.min(1, (h + 1.5) / 1.5)) * 0.7);
    else if (b === 'sand') col.copy(C.sand);
    else if (b === 'rock') col.copy(C.rock).lerp(C.snow, Math.max(0, Math.min(1, (h - 11) / 4)));
    else if (b === 'wood') col.copy(C.wood).lerp(C.meadow, 0.25 * (1 - m));
    else col.copy(C.meadow).lerp(C.dry, Math.max(0, 0.55 - m) * 0.6);
    // sand fringe right at the shoreline
    if (h > WATER_LEVEL - 0.1 && h < 0.9 && b !== 'rock') col.lerp(C.sand, 1 - Math.max(0, Math.min(1, (h - 0.2) / 0.7)));
    // steep ground is bare rock
    col.lerp(C.rock, Math.max(0, Math.min(1, (steep - 0.12) * 4)));
    // a little per-vertex mottling so the ground isn't a flat swatch
    const j = 0.92 + rng() * 0.16;
    col.multiplyScalar(j);
    colors[v * 3] = baseCol[v * 3] = col.r;
    colors[v * 3 + 1] = baseCol[v * 3 + 1] = col.g;
    colors[v * 3 + 2] = baseCol[v * 3 + 2] = col.b;
    meadowW[v] = b === 'meadow' ? 1 : b === 'wood' ? 0.4 : 0;
    // continuous grid coordinates (cell centres at integers)
    cellX[v] = (x + t.size / 2) / cell - 0.5;
    cellZ[v] = (z + t.size / 2) / cell - 0.5;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return { geo, meadowW, cellX, cellZ, baseCol };
}

/**
 * The lake: one sheet at the water line, shaded from a baked height texture of the ground below it —
 * turquoise over the shallows, deepening to a dark teal over the deeps, fading out at the waterline
 * with a lapping foam edge, its surface rippled by a few travelling wave trains.
 */
const HEIGHT_TEX = 160;
function heightTexture(terrain: Terrain): THREE.DataTexture {
  const data = new Uint16Array(HEIGHT_TEX * HEIGHT_TEX);
  for (let j = 0; j < HEIGHT_TEX; j++)
    for (let i = 0; i < HEIGHT_TEX; i++) {
      const x = ((i + 0.5) / HEIGHT_TEX - 0.5) * terrain.size;
      const z = ((j + 0.5) / HEIGHT_TEX - 0.5) * terrain.size;
      data[j * HEIGHT_TEX + i] = THREE.DataUtils.toHalfFloat(heightAt(terrain, x, z));
    }
  const tex = new THREE.DataTexture(data, HEIGHT_TEX, HEIGHT_TEX, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function Water({ terrain }: { terrain: Terrain }) {
  const tex = useMemo(() => heightTexture(terrain), [terrain]);
  const time = useMemo(() => ({ value: 0 }), []);
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, clearcoat: 1, clearcoatRoughness: 0.06, depthWrite: false });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.uniforms.uHeight = { value: tex };
      shader.uniforms.uSize = { value: terrain.size };
      shader.uniforms.uLevel = { value: WATER_LEVEL };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec2 vWXZ;
          uniform float uTime, uSize, uLevel;
          uniform sampler2D uHeight;
          float wDepth;
          // three travelling wave trains: (dir.x, dir.y, wavenumber, speed)
          vec2 rippleGrad(vec2 p) {
            vec2 g = vec2(0.0);
            vec4 W[3];
            W[0] = vec4(0.8, 0.6, 0.9, 1.1);
            W[1] = vec4(-0.5, 0.86, 1.7, 1.6);
            W[2] = vec4(0.2, -0.98, 3.1, 2.3);
            for (int i = 0; i < 3; i++) {
              vec2 d = normalize(W[i].xy);
              float ph = dot(p, d) * W[i].z + uTime * W[i].w;
              g += d * cos(ph) * (0.032 * (1.0 + 0.6 * float(i)));
            }
            return g;
          }`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float ground = texture2D(uHeight, vWXZ / uSize + 0.5).r;
          wDepth = uLevel - ground;
          vec3 shallow = vec3(0.16, 0.48, 0.5);
          vec3 deep = vec3(0.03, 0.15, 0.2);
          diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 2.6, wDepth));
          // a lapping foam line right at the waterline
          float lap = 0.12 + 0.05 * sin(uTime * 1.4 + vWXZ.x * 0.35 + vWXZ.y * 0.27);
          float foam = (1.0 - smoothstep(lap * 0.4, lap, wDepth)) * step(0.0, wDepth);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.92, 0.9), foam * 0.8);
          diffuseColor.a = clamp(mix(0.25, 0.86, smoothstep(0.0, 1.4, wDepth)) + foam * 0.5, 0.0, 0.92) * step(-0.05, wDepth);`,
        )
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          vec2 rg = rippleGrad(vWXZ);
          normal = normalize(normal + (viewMatrix * vec4(-rg.x, 0.0, -rg.y, 0.0)).xyz);`,
        );
    };
    return m;
  }, [tex, time, terrain.size]);
  useEffect(() => () => {
    tex.dispose();
    mat.dispose();
  }, [tex, mat]);
  useFrame((_, dt) => {
    time.value += dt;
  });
  return (
    <mesh position={[0, WATER_LEVEL + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={mat}>
      <planeGeometry args={[terrain.size, terrain.size, 1, 1]} />
    </mesh>
  );
}

// --- fruit bushes ---------------------------------------------------------------------------------

const MAX_FRUIT_PER_BUSH = 8;
const FRUIT_SLOTS: [number, number, number][] = Array.from({ length: MAX_FRUIT_PER_BUSH }, (_, i) => {
  const a = i * 2.399;
  const r = 0.55 + 0.25 * ((i * 7) % 3) / 2;
  return [Math.sin(a) * r, 0.55 + 0.25 * Math.cos(i * 1.7), Math.cos(a) * r];
});

export function Bushes({ world }: { world: World }) {
  const bushRef = useRef<THREE.InstancedMesh>(null);
  const fruitRef = useRef<THREE.InstancedMesh>(null);
  const plants = world.plants;
  const leaf = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const berry = useMemo(() => new THREE.SphereGeometry(0.16, 8, 6), []);
  useEffect(() => () => {
    leaf.dispose();
    berry.dispose();
  }, [leaf, berry]);

  // static bush transforms
  useEffect(() => {
    const m = bushRef.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    plants.forEach((p, i) => {
      o.position.set(p.x, heightAt(world.terrain, p.x, p.z) + p.size * 0.55, p.z);
      o.scale.set(p.size * 1.15, p.size * 0.8, p.size * 1.1);
      o.rotation.set(0, (p.id * 1.37) % 6.28, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.setHSL(0.27 + ((p.id * 0.13) % 0.06), 0.45, 0.22 + ((p.id * 0.07) % 0.06)));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [plants, world.terrain]);

  // fruit: show as many berries as each bush holds (refreshed twice a second)
  const timer = useRef(1);
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 0.5) return;
    timer.current = 0;
    const m = fruitRef.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    plants.forEach((p, i) => {
      const y0 = heightAt(world.terrain, p.x, p.z);
      for (let s = 0; s < MAX_FRUIT_PER_BUSH; s++) {
        const idx = i * MAX_FRUIT_PER_BUSH + s;
        if (s < Math.floor(p.fruit)) {
          const [fx, fy, fz] = FRUIT_SLOTS[s];
          o.position.set(p.x + fx * p.size, y0 + fy * p.size + p.size * 0.5, p.z + fz * p.size);
          o.scale.setScalar(0.8 + p.size * 0.4);
          o.updateMatrix();
          m.setMatrixAt(idx, o.matrix);
        } else m.setMatrixAt(idx, hidden);
      }
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={bushRef} args={[leaf, undefined, plants.length]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={fruitRef} args={[berry, undefined, plants.length * MAX_FRUIT_PER_BUSH]}>
        <meshStandardMaterial color={0xc8322e} roughness={0.35} emissive={0x3a0808} />
      </instancedMesh>
    </>
  );
}

// --- decor: trees + rocks -------------------------------------------------------------------------

/** A broadleaf crown: three overlapping lobes (one round blob read as a lollipop). */
function broadleafCrown(): THREE.BufferGeometry {
  const lobes: [number, number, number, number][] = [
    [0, 0.1, 0, 1],
    [0.62, -0.22, 0.2, 0.74],
    [-0.5, -0.18, -0.36, 0.7],
    [0.05, -0.3, 0.6, 0.62],
  ];
  const parts = lobes.map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    return g.toNonIndexed();
  });
  const g = mergeGeometries(parts, false) ?? parts[0];
  g.computeVertexNormals();
  return g;
}

/** A conifer: three stacked cones tapering to a spire. */
function coniferCrown(): THREE.BufferGeometry {
  const tiers: [number, number, number][] = [
    [1.0, 1.5, 0.0],
    [0.78, 1.3, 0.85],
    [0.52, 1.1, 1.6],
  ];
  const parts = tiers.map(([r, h, y]) => {
    const g = new THREE.ConeGeometry(r, h, 8, 1);
    g.translate(0, y + h / 2, 0);
    return g.toNonIndexed();
  });
  const g = mergeGeometries(parts, false) ?? parts[0];
  g.computeVertexNormals();
  return g;
}

export function Decor({ terrain }: { terrain: Terrain }) {
  const { trees, pines, rocks } = useMemo(() => {
    const rng = mulberry32(terrain.seed ^ 0x7ee5);
    const trees: { x: number; y: number; z: number; s: number; r: number }[] = [];
    const pines: { x: number; y: number; z: number; s: number; r: number }[] = [];
    const rocks: { x: number; y: number; z: number; s: number; r: number }[] = [];
    for (let i = 0; i < 9000 && (trees.length + pines.length < 300 || rocks.length < 160); i++) {
      const x = (rng() - 0.5) * terrain.size * 0.97;
      const z = (rng() - 0.5) * terrain.size * 0.97;
      const b = biomeAt(terrain, x, z);
      const y = heightAt(terrain, x, z);
      const full = trees.length + pines.length >= 300;
      // conifers climb the high woods and the edge of the rock; broadleaves keep the low woods
      const pine = y > 4.2 || rng() < 0.18;
      if (b === 'wood' && !full && rng() < 0.6) (pine ? pines : trees).push({ x, y, z, s: 0.8 + rng() * 0.9, r: rng() * 6.28 });
      else if (b === 'meadow' && !full && rng() < 0.03) trees.push({ x, y, z, s: 0.7 + rng() * 0.6, r: rng() * 6.28 });
      else if (b === 'rock' && !full && y < 9.5 && rng() < 0.12) pines.push({ x, y, z, s: 0.6 + rng() * 0.5, r: rng() * 6.28 });
      else if ((b === 'rock' || b === 'sand') && rocks.length < 160 && rng() < 0.4) rocks.push({ x, y, z, s: 0.3 + rng() * 1.1, r: rng() * 6.28 });
    }
    return { trees, pines, rocks };
  }, [terrain]);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const pineTrunkRef = useRef<THREE.InstancedMesh>(null);
  const pineRef = useRef<THREE.InstancedMesh>(null);
  const rockRef = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.22, 0.34, 1, 6),
    crown: broadleafCrown(),
    pine: coniferCrown(),
    rock: new THREE.DodecahedronGeometry(1, 0),
  }), []);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  useEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    trees.forEach((t, i) => {
      const H = 3.2 * t.s;
      o.position.set(t.x, t.y + H / 2, t.z);
      o.rotation.set(0, t.r, 0);
      o.scale.set(t.s, H, t.s);
      o.updateMatrix();
      trunkRef.current?.setMatrixAt(i, o.matrix);
      o.position.set(t.x, t.y + H + 0.9 * t.s, t.z);
      o.scale.set(1.9 * t.s, 1.75 * t.s, 1.9 * t.s);
      o.updateMatrix();
      crownRef.current?.setMatrixAt(i, o.matrix);
      // a spread of greens, a few going gold
      const gold = (i * 7) % 23 === 0;
      crownRef.current?.setColorAt(i, gold ? c.setHSL(0.13, 0.55, 0.3) : c.setHSL(0.24 + (i % 7) * 0.014, 0.45, 0.17 + (i % 5) * 0.018));
    });
    pines.forEach((t, i) => {
      const H = 1.4 * t.s;
      o.position.set(t.x, t.y + H / 2, t.z);
      o.rotation.set(0, t.r, 0);
      o.scale.set(t.s * 0.8, H, t.s * 0.8);
      o.updateMatrix();
      pineTrunkRef.current?.setMatrixAt(i, o.matrix);
      o.position.set(t.x, t.y + H * 0.7, t.z);
      o.scale.set(1.3 * t.s, 1.6 * t.s, 1.3 * t.s);
      o.updateMatrix();
      pineRef.current?.setMatrixAt(i, o.matrix);
      pineRef.current?.setColorAt(i, c.setHSL(0.36 + (i % 5) * 0.01, 0.38, 0.13 + (i % 4) * 0.015));
    });
    rocks.forEach((r, i) => {
      o.position.set(r.x, r.y + r.s * 0.25, r.z);
      o.rotation.set(r.r * 0.3, r.r, r.r * 0.7);
      o.scale.set(r.s * 1.3, r.s * 0.8, r.s);
      o.updateMatrix();
      rockRef.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [trunkRef.current, crownRef.current, pineTrunkRef.current, pineRef.current, rockRef.current]) if (m) m.instanceMatrix.needsUpdate = true;
    for (const m of [crownRef.current, pineRef.current]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  }, [trees, pines, rocks]);
  return (
    <>
      <instancedMesh ref={trunkRef} args={[geos.trunk, undefined, trees.length]} castShadow>
        <meshStandardMaterial color={0x4a3626} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crownRef} args={[geos.crown, undefined, trees.length]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={pineTrunkRef} args={[geos.trunk, undefined, pines.length]} castShadow>
        <meshStandardMaterial color={0x3e2c20} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={pineRef} args={[geos.pine, undefined, pines.length]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.88} flatShading />
      </instancedMesh>
      <instancedMesh ref={rockRef} args={[geos.rock, undefined, rocks.length]} castShadow receiveShadow>
        <meshStandardMaterial color={0x6f6a62} roughness={0.92} flatShading />
      </instancedMesh>
    </>
  );
}
