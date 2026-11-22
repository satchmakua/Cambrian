/**
 * The lab planet drawn: its ground as one mesh over the cube-sphere (each face a grid of cells pushed out to
 * the ground's height), coloured pixel by pixel as the valley colours its own; its sea, a smooth ball at
 * the water line with pack ice at the poles; and its lakes and rivers, a second skin at each water's own
 * surface, which the ground hides wherever it stands above it.
 *
 * The ground's colour is worked out in its fragment shader from the height, the water's surface and the
 * damp, interpolated from the corners: laid on the corners themselves (as vertex colours) every shore and
 * every wood's edge came out in steps a cell wide.
 */
import * as THREE from 'three';
import { cubeToSphere, FACE_COUNT } from '../../sim/sphere';
import { heightOn, levelOn, moistOn, type PlanetGround } from '../../sim/planetGround';

// the valley's ground colours (world/Landscape.tsx), a deep sea bed, and ice
const C = {
  lakebed: new THREE.Color(0x3d4a3f),
  deep: new THREE.Color(0x1b2627),
  sand: new THREE.Color(0xb8a77c),
  meadow: new THREE.Color(0x5f8f3a),
  dry: new THREE.Color(0xa8994f),
  wood: new THREE.Color(0x3f5f2c),
  rock: new THREE.Color(0x77736c),
  snow: new THREE.Color(0xd8d8d2),
  water: new THREE.Color(0x2b5866),
  fresh: new THREE.Color(0x2f6170),
  ice: new THREE.Color(0xd4dadb),
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Cells across each face: about one to every bu of ground (the valley's own grid), within what a laptop
 *  draws. */
export function cellsFor(radius: number): number {
  return Math.max(64, Math.min(256, Math.round((Math.PI / 2) * radius)));
}

/**
 * The ground: each face of the cube-sphere a grid `n` cells across, carrying its height (`aH`, bu above the
 * sea), the water's surface over it (`aL`) and its damp (`aM`) for the shader to colour by. Its normals are
 * taken across the grid from one more row of cells all round, which reaches over each seam onto the next
 * face's ground, so the light runs on unbroken from face to face.
 */
export function groundGeometry(s: PlanetGround, n: number): THREE.BufferGeometry {
  const W = n + 1; // points along a face's edge
  const B = W + 2; // …with a border row all round
  const verts = FACE_COUNT * W * W;
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
  const hs = new Float32Array(verts), ls = new Float32Array(verts), ms = new Float32Array(verts);
  const idx = new Uint32Array(FACE_COUNT * n * n * 6);
  const grid = new Float32Array(B * B * 3);
  const hts = new Float32Array(B * B);
  let v = 0, k = 0;
  for (let f = 0; f < FACE_COUNT; f++) {
    for (let j = -1; j <= n + 1; j++) {
      for (let i = -1; i <= n + 1; i++) {
        const d = cubeToSphere(f, -1 + (2 * i) / n, -1 + (2 * j) / n);
        const h = heightOn(s, d);
        const r = s.radius + h;
        const g = (j + 1) * B + (i + 1);
        grid[g * 3] = d[0] * r;
        grid[g * 3 + 1] = d[1] * r;
        grid[g * 3 + 2] = d[2] * r;
        hts[g] = h;
      }
    }
    const first = v;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const g = (j + 1) * B + (i + 1);
        const o = g * 3;
        pos[v * 3] = grid[o];
        pos[v * 3 + 1] = grid[o + 1];
        pos[v * 3 + 2] = grid[o + 2];
        // across the grid both ways (u × v points outward on every face: see sim/sphere.ts)
        const ax = grid[o + 3] - grid[o - 3], ay = grid[o + 4] - grid[o - 2], az = grid[o + 5] - grid[o - 1];
        const bx = grid[o + B * 3] - grid[o - B * 3], by = grid[o + B * 3 + 1] - grid[o - B * 3 + 1], bz = grid[o + B * 3 + 2] - grid[o - B * 3 + 2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nor[v * 3] = nx / l;
        nor[v * 3 + 1] = ny / l;
        nor[v * 3 + 2] = nz / l;
        hs[v] = hts[g];
        const r = Math.hypot(grid[o], grid[o + 1], grid[o + 2]);
        const u: [number, number, number] = [grid[o] / r, grid[o + 1] / r, grid[o + 2] / r];
        ls[v] = levelOn(s, u);
        ms[v] = moistOn(s, u);
        v++;
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = first + j * W + i, b = a + 1, c = a + W + 1, d = a + W;
        idx[k++] = a;
        idx[k++] = b;
        idx[k++] = c;
        idx[k++] = a;
        idx[k++] = c;
        idx[k++] = d;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aH', new THREE.BufferAttribute(hs, 1));
  geo.setAttribute('aL', new THREE.BufferAttribute(ls, 1));
  geo.setAttribute('aM', new THREE.BufferAttribute(ms, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

const glsl = (c: THREE.Color) => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;

/**
 * The ground's material: the valley's palette by height, damp, slope and latitude, its heights scaled to
 * this planet's relief (`relief` / 14: the valley's highest ground). Smooth bands throughout: sand shading
 * up from every waterline (the sea's, a lake's, a river's) into the meadow, meadow into wood, rock up the
 * steeps and the heights, snow above, and the bed under any water darkening with its depth; ice at the
 * poles.
 */
export function groundMaterial(relief: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const k = Math.max(0.2, relief / 14);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aH;\nattribute float aL;\nattribute float aM;\nvarying float vH;\nvarying float vL;\nvarying float vM;\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vH = aH;\n  vL = aL;\n  vM = aM;\n  vOP = position;\n  vON = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vH;
varying float vL;
varying float vM;
varying vec3 vOP;
varying vec3 vON;
const float K = ${k.toFixed(4)};
vec3 groundColour(float h, float L, float up, float m, float lat) {
  vec3 c;
  float d = L - h;
  if (d > 0.0) {
    c = mix(${glsl(C.lakebed)}, ${glsl(C.sand)}, clamp((1.5 - d) / 1.5, 0.0, 1.0) * 0.7);
    c = mix(c, ${glsl(C.deep)}, clamp((d - 2.0) / (6.0 * K + 2.0), 0.0, 1.0));
  } else {
    float a = -d;
    vec3 meadow = mix(${glsl(C.meadow)}, ${glsl(C.dry)}, clamp((0.32 - m) / 0.32, 0.0, 1.0) * 0.6);
    vec3 wood = mix(${glsl(C.wood)}, ${glsl(C.meadow)}, 0.25 * (1.0 - m));
    c = mix(meadow, wood, smoothstep(0.53, 0.63, m));
    c = mix(c, ${glsl(C.sand)}, 1.0 - smoothstep(0.15, 0.9, a));
    c = mix(c, ${glsl(C.rock)}, max(clamp((h - 7.5 * K) / (1.5 * K), 0.0, 1.0), smoothstep(0.9, 0.78, up)));
    c = mix(c, ${glsl(C.snow)}, clamp((h - 11.0 * K) / (3.0 * K), 0.0, 1.0));
  }
  return mix(c, ${glsl(C.snow)}, clamp((abs(lat) - 0.9) / 0.05, 0.0, 1.0));
}`,
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  vec3 rU = normalize(vOP);\n  diffuseColor.rgb = groundColour(vH, vL, dot(normalize(vON), rU), vM, rU.y);',
      );
  };
  // (one program for every relief: three would otherwise reuse the first relief's compiled shader)
  m.customProgramCacheKey = () => `lab-ground-water-${k.toFixed(4)}`;
  return m;
}

/** The sea: the cube-sphere at the water line, its colour the valley's lake's, turning to pack ice at
 *  the poles. */
export function seaGeometry(radius: number, n = 64): THREE.BufferGeometry {
  const W = n + 1;
  const verts = FACE_COUNT * W * W;
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const idx = new Uint32Array(FACE_COUNT * n * n * 6);
  const c = new THREE.Color();
  let v = 0, k = 0;
  for (let f = 0; f < FACE_COUNT; f++) {
    const first = v;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const d = cubeToSphere(f, -1 + (2 * i) / n, -1 + (2 * j) / n);
        for (let a = 0; a < 3; a++) {
          pos[v * 3 + a] = d[a] * radius;
          nor[v * 3 + a] = d[a];
        }
        c.copy(C.water).lerp(C.ice, clamp01((Math.abs(d[1]) - 0.9) / 0.04));
        col[v * 3] = c.r;
        col[v * 3 + 1] = c.g;
        col[v * 3 + 2] = c.b;
        v++;
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = first + j * W + i;
        idx[k++] = a;
        idx[k++] = a + 1;
        idx[k++] = a + W + 1;
        idx[k++] = a;
        idx[k++] = a + W + 1;
        idx[k++] = a + W;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The lakes and rivers: over the ground's own grid, a skin at the water's surface wherever it stands above
 * the sea's (each lake level at its brim, each river falling toward the sea), kept only where some water is
 * near. On dry ground beside a lake or river the surface still runs on at its level, under the ground,
 * which hides it: the shore is drawn where the two meet.
 */
export function freshWaterGeometry(s: PlanetGround, n: number): THREE.BufferGeometry {
  const W = n + 1;
  const level = new Float32Array(FACE_COUNT * W * W);
  const at = new Float32Array(FACE_COUNT * W * W);
  const wet = new Uint8Array(FACE_COUNT * W * W);
  const unit = new Float32Array(FACE_COUNT * W * W * 3);
  for (let f = 0, v = 0; f < FACE_COUNT; f++) {
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++, v++) {
        const d = cubeToSphere(f, -1 + (2 * i) / n, -1 + (2 * j) / n);
        const L = levelOn(s, d), h = heightOn(s, d);
        level[v] = L;
        // (a dry point's water is held under its ground: the skin and the ground, laid over the same grid,
        // then cross along one line in each triangle — the shore — and no corner of a water that belongs to
        // a lake beyond pokes up through a low bank)
        at[v] = L > h ? L : Math.min(L, h - 0.5);
        wet[v] = L > 0.02 && L > h - 0.6 ? 1 : 0;
        unit.set(d, v * 3);
      }
    }
  }
  // the quads with water above the sea's at all four corners and some of it showing at one, and only the
  // points they use
  const used = new Int32Array(FACE_COUNT * W * W).fill(-1);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const take = (v: number) => {
    if (used[v] < 0) {
      used[v] = pos.length / 3;
      const r = s.radius + at[v];
      pos.push(unit[v * 3] * r, unit[v * 3 + 1] * r, unit[v * 3 + 2] * r);
      nor.push(unit[v * 3], unit[v * 3 + 1], unit[v * 3 + 2]);
    }
    return used[v];
  };
  for (let f = 0; f < FACE_COUNT; f++) {
    const first = f * W * W;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = first + j * W + i, b = a + 1, c = a + W + 1, d = a + W;
        if (level[a] <= 0.02 || level[b] <= 0.02 || level[c] <= 0.02 || level[d] <= 0.02) continue;
        if (!(wet[a] || wet[b] || wet[c] || wet[d])) continue;
        const A = take(a), Bv = take(b), Cv = take(c), D = take(d);
        idx.push(A, Bv, Cv, A, Cv, D);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}

/** The lakes' and rivers' water: the sea's, a shade greener. */
export function freshWaterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: C.fresh, roughness: 0.14, metalness: 0, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}
