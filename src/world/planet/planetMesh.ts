/**
 * The lab planet drawn: its ground in chunks over the cube-sphere (each a grid of cells pushed out to the
 * ground's height, at the detail its distance asks for: GroundChunks.tsx), coloured pixel by pixel as the
 * valley colours its own; its sea, a smooth ball at
 * the water line with pack ice at the poles; and its lakes and rivers, a second skin at each water's own
 * surface, which the ground hides wherever it stands above it.
 *
 * The ground's colour is worked out in its fragment shader from the height, the water's surface and the
 * damp, interpolated from the corners: laid on the corners themselves (as vertex colours) every shore and
 * every wood's edge came out in steps a cell wide.
 */
import * as THREE from 'three';
import { cubeToSphere, FACE_COUNT } from '../../sim/sphere';
import { heightOn, levelOn, moistOn, rainOn, tempOn, type PlanetGround } from '../../sim/planetGround';
import { BIOME_COLOUR } from '../../sim/palette';

// the ground's colours: the one palette (sim/palette.ts), the camouflage's own; and the water's
const B = Object.fromEntries(Object.entries(BIOME_COLOUR).map(([b, c]) => [b, new THREE.Color(c)])) as Record<keyof typeof BIOME_COLOUR, THREE.Color>;
const C = {
  lakebed: B.deep,
  deep: new THREE.Color(0x1b2627),
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

const glsl = (c: THREE.Color) => `vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)})`;

/**
 * The ground's material: what grows where, by the year's warmth and rain (the Whittaker diagram the
 * simulation's biomes come from: planetGround.ts), each in the one palette, blended smoothly across the
 * lines between them; then the ground's own cases — sand up from every waterline (a cold shore's tundra),
 * marsh on the wet flats, rock on the steeps and the cold heights (scaled to this planet's relief: `relief`
 * / 14, the valley's highest ground), ice where it is cold enough — and the bed under any water darkening
 * with its depth.
 */
/** the season the ground is drawn in: the year's phase (0: the north's first morning of spring) and how far
 *  the planet's axis leans; and where the sea stands (bu from its own level: the sea-level lever). Shared by
 *  every ground material: set each frame. */
export const GROUND_SEASON = { yearPhase: { value: 0 }, tilt: { value: 0.5 }, sea: { value: 0 } };

export function groundMaterial(relief: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const k = Math.max(0.2, relief / 14);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uYearPhase = GROUND_SEASON.yearPhase;
    shader.uniforms.uTilt = GROUND_SEASON.tilt;
    shader.uniforms.uSea = GROUND_SEASON.sea;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aH;\nattribute float aL;\nattribute float aM;\nattribute float aT;\nattribute float aP;\nvarying float vH;\nvarying float vL;\nvarying float vM;\nvarying float vT;\nvarying float vP;\nvarying vec3 vOP;\nvarying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vH = aH;\n  vL = aL;\n  vM = aM;\n  vT = aT;\n  vP = aP;\n  vOP = position;\n  vON = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vH;
varying float vL;
varying float vM;
varying float vT;
varying float vP;
varying vec3 vOP;
varying vec3 vON;
const float K = ${k.toFixed(4)};
uniform float uYearPhase;
uniform float uTilt;
uniform float uSea;
// a season's warmth from its year's mean (the simulation's: planetSeasons.ts), keyed at the seasons' middles
float seasonKey(float i) {
  float a = mod(i, 4.0);
  return a < 0.5 ? 0.1 : a < 1.5 ? 1.0 : a < 2.5 ? -0.1 : -1.0;
}
float seasonWarmth(float phase) {
  float x = phase * 4.0 - 0.5;
  float i = floor(x), f = x - i;
  return mix(seasonKey(i), seasonKey(i + 1.0), f * f * (3.0 - 2.0 * f));
}
// the Whittaker diagram, its lines blurred a little: cold, temperate and tropical columns, each from desert
// through grass to forest by its rain
vec3 biomeColour(float T, float P) {
  vec3 cold = mix(${glsl(B.tundra)}, ${glsl(B.taiga)}, smoothstep(220.0, 290.0, P));
  vec3 temperate = mix(${glsl(B.desert)}, ${glsl(B.meadow)}, smoothstep(220.0, 290.0, P));
  temperate = mix(temperate, ${glsl(B.wood)}, smoothstep(640.0, 760.0, P));
  vec3 tropical = mix(${glsl(B.desert)}, ${glsl(B.savanna)}, smoothstep(260.0, 340.0, P));
  tropical = mix(tropical, ${glsl(B.jungle)}, smoothstep(1100.0, 1300.0, P));
  vec3 c = mix(cold, temperate, smoothstep(4.0, 6.0, T));
  c = mix(c, tropical, smoothstep(17.0, 19.0, T));
  return mix(${glsl(B.tundra)}, c, smoothstep(-2.0, 0.0, T));
}
vec3 groundColour(float h, float L, float up, float m, float T, float P, float y) {
  vec3 c;
  // (the water's surface with the sea where it stands now: risen over every lower water, fallen under the
  // lakes and rivers; at its own level, the baked surface as it is)
  float d = (L > 0.0 ? max(L, uSea) : uSea) - h;
  // its warmth now: its hemisphere's season, as far as its latitude swings
  float swing = (uTilt / 0.5) * min(1.0, abs(y)) / 0.70711;
  float Tn = T + swing * 13.0 * seasonWarmth(fract(uYearPhase + (y < 0.0 ? 0.5 : 0.0)));
  if (d > 0.0) {
    c = mix(${glsl(C.lakebed)}, ${glsl(B.sand)}, clamp((1.5 - d) / 1.5, 0.0, 1.0) * 0.7);
    c = mix(c, ${glsl(C.deep)}, clamp((d - 2.0) / (6.0 * K + 2.0), 0.0, 1.0));
  } else {
    float a = -d;
    c = biomeColour(T, P) * (0.92 + 0.16 * m);
    c = mix(c, ${glsl(B.marsh)}, (1.0 - smoothstep(1.2, 1.6, a)) * smoothstep(600.0, 700.0, P) * smoothstep(0.985, 0.995, up) * step(0.0, T));
    c = mix(c, T < -1.0 ? ${glsl(B.tundra)} : ${glsl(B.sand)}, 1.0 - smoothstep(0.15, 0.6, a));
    c = mix(c, ${glsl(B.rock)}, max(clamp((h - 7.5 * K) / (1.5 * K), 0.0, 1.0) * (1.0 - smoothstep(13.0, 15.0, T)), smoothstep(0.86, 0.72, up)));
    // winter's dull browning, and the snow lying where it is cold now
    c = mix(c, c * vec3(0.9, 0.84, 0.7), (1.0 - smoothstep(-2.0, 6.0, Tn)) * 0.6);
    c = mix(c, ${glsl(B.ice)}, 0.9 * (1.0 - smoothstep(-5.0, 1.0, Tn)));
  }
  return mix(c, ${glsl(B.ice)}, 1.0 - smoothstep(-12.0, -8.0, T));
}`,
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  vec3 rU = normalize(vOP);\n  diffuseColor.rgb = groundColour(vH, vL, dot(normalize(vON), rU), vM, vT, vP, rU.y);',
      );
  };
  // (one program for every relief: three would otherwise reuse the first relief's compiled shader)
  m.customProgramCacheKey = () => `planet-ground-seasons-sea-${k.toFixed(4)}`;
  return m;
}

/** The sea: the cube-sphere at the water line, its colour the valley's lake's, turning to pack ice where
 *  the sea is cold enough. */
export function seaGeometry(s: PlanetGround, n = 64): THREE.BufferGeometry {
  const radius = s.radius;
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
        c.copy(C.water).lerp(C.ice, clamp01((-6 - tempOn(s, d)) / 4));
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

/** the most fronts the clouds are drawn from at once */
export const MOST_FRONTS = 64;

/**
 * The clouds: a shell some way above the highest ground, drawn from the simulation's own weather fronts
 * (planetSeasons.ts), so the overcast seen from orbit is the rain on the ground; broken up by noise, lit on
 * the day side, dark on the night side. Its fronts are set each frame (`setFronts`).
 */
export function cloudMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uF: { value: Array.from({ length: MOST_FRONTS }, () => new THREE.Vector4()) },
      uS: { value: new Float32Array(MOST_FRONTS) },
      uN: { value: 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: `varying vec3 vP;
void main() {
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `uniform vec4 uF[${MOST_FRONTS}];
uniform float uS[${MOST_FRONTS}];
uniform int uN;
uniform vec3 uSun;
varying vec3 vP;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 p = normalize(vP);
  float sum = 0.0;
  for (int i = 0; i < ${MOST_FRONTS}; i++) {
    if (i >= uN) break;
    float r2 = uF[i].w * uF[i].w;
    float c2 = 2.0 * (1.0 - dot(p, uF[i].xyz));
    if (c2 < 9.0 * r2) sum += uS[i] * exp(-c2 / r2);
  }
  float n = 0.6 * vnoise(p * 11.0) + 0.4 * vnoise(p * 29.0);
  float dense = smoothstep(0.3, 0.85, sum * 1.3 * (0.5 + 0.9 * n));
  float lit = smoothstep(-0.12, 0.3, dot(p, uSun));
  vec3 col = mix(vec3(0.03, 0.035, 0.05), vec3(0.9, 0.91, 0.93), lit);
  gl_FragColor = vec4(col, dense * 0.82);
}`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Set the clouds' fronts (their middles, reaches and strengths) and the sun's way. */
export function setFronts(m: THREE.ShaderMaterial, fronts: { at: number[]; reach: number; strength: number }[], sun: THREE.Vector3): void {
  const u = m.uniforms;
  const n = Math.min(MOST_FRONTS, fronts.length);
  for (let i = 0; i < n; i++) {
    const f = fronts[i];
    (u.uF.value as THREE.Vector4[])[i].set(f.at[0], f.at[1], f.at[2], f.reach);
    (u.uS.value as Float32Array)[i] = Math.max(0, f.strength);
  }
  u.uN.value = n;
  (u.uSun.value as THREE.Vector3).copy(sun);
}

// --- the ground in chunks: drawn at the detail its distance asks for, and not at all past the horizon ------

/** chunks along a face's edge, and the cells along a chunk's edge at each detail level (finest first: the
 *  finest is the single mesh's 256 a face) */
export const CHUNKS = 8;
export const CHUNK_CELLS = [32, 16, 8] as const;

/** A chunk's middle (a unit vector) and how far round it reaches from there (radians). */
export function chunkBounds(face: number, ci: number, cj: number): { at: [number, number, number]; reach: number } {
  const s0 = -1 + (2 * ci) / CHUNKS, s1 = -1 + (2 * (ci + 1)) / CHUNKS;
  const t0 = -1 + (2 * cj) / CHUNKS, t1 = -1 + (2 * (cj + 1)) / CHUNKS;
  const at = cubeToSphere(face, (s0 + s1) / 2, (t0 + t1) / 2);
  let reach = 0;
  for (const [s, t] of [[s0, t0], [s1, t0], [s0, t1], [s1, t1]]) {
    const c = cubeToSphere(face, s, t);
    reach = Math.max(reach, Math.acos(Math.min(1, c[0] * at[0] + c[1] * at[1] + c[2] * at[2])));
  }
  return { at: at as [number, number, number], reach };
}

/**
 * One chunk of the ground at `n` cells a side: its grid pushed out to the ground's height, with the
 * shader's attributes (its height `aH`, the water's surface `aL`, its damp `aM`, warmth `aT` and rain `aP`),
 * normals taken across one more row of samples all round (so
 * the light runs on unbroken into the next chunk), and a skirt: its edge's points again, let down some way,
 * walling off any crack where a chunk drawn finer meets one drawn coarser.
 */
export function chunkGeometry(s: PlanetGround, face: number, ci: number, cj: number, n: number): THREE.BufferGeometry {
  const span = 2 / CHUNKS;
  const s0 = -1 + span * ci, t0 = -1 + span * cj;
  const W = n + 1, B = W + 2;
  const grid = new Float32Array(B * B * 3), hts = new Float32Array(B * B);
  for (let j = -1; j <= n + 1; j++) {
    for (let i = -1; i <= n + 1; i++) {
      const d = cubeToSphere(face, s0 + (span * i) / n, t0 + (span * j) / n);
      const h = heightOn(s, d);
      const r = s.radius + h;
      const g = (j + 1) * B + (i + 1);
      grid[g * 3] = d[0] * r;
      grid[g * 3 + 1] = d[1] * r;
      grid[g * 3 + 2] = d[2] * r;
      hts[g] = h;
    }
  }
  const rim = 4 * n; // the skirt's points
  const verts = W * W + rim;
  const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3);
  const hs = new Float32Array(verts), ls = new Float32Array(verts), ms = new Float32Array(verts), ts = new Float32Array(verts), ps = new Float32Array(verts);
  let v = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const g = (j + 1) * B + (i + 1), o = g * 3;
      pos.set([grid[o], grid[o + 1], grid[o + 2]], v * 3);
      const ax = grid[o + 3] - grid[o - 3], ay = grid[o + 4] - grid[o - 2], az = grid[o + 5] - grid[o - 1];
      const bx = grid[o + B * 3] - grid[o - B * 3], by = grid[o + B * 3 + 1] - grid[o - B * 3 + 1], bz = grid[o + B * 3 + 2] - grid[o - B * 3 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.set([nx / l, ny / l, nz / l], v * 3);
      const r = Math.hypot(grid[o], grid[o + 1], grid[o + 2]);
      const u: [number, number, number] = [grid[o] / r, grid[o + 1] / r, grid[o + 2] / r];
      hs[v] = hts[g];
      ls[v] = levelOn(s, u);
      ms[v] = moistOn(s, u);
      ts[v] = tempOn(s, u);
      ps[v] = rainOn(s, u);
      v++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W;
      idx.push(a, b, c, a, c, d);
    }
  }
  // the skirt: round the edge (counter-clockwise seen from outside), each point let down below the ground
  const edge: number[] = [];
  for (let i = 0; i < n; i++) edge.push(i);
  for (let j = 0; j < n; j++) edge.push(j * W + n);
  for (let i = n; i > 0; i--) edge.push(n * W + i);
  for (let j = n; j > 0; j--) edge.push(j * W);
  const drop = 1.5 + (span * s.radius * Math.PI) / 4 / n;
  const first = v;
  for (const e of edge) {
    const x = pos[e * 3], y = pos[e * 3 + 1], z = pos[e * 3 + 2];
    const r = Math.hypot(x, y, z), k = (r - drop) / r;
    pos.set([x * k, y * k, z * k], v * 3);
    nor.set([nor[e * 3], nor[e * 3 + 1], nor[e * 3 + 2]], v * 3);
    hs[v] = hs[e];
    ls[v] = ls[e];
    ms[v] = ms[e];
    ts[v] = ts[e];
    ps[v] = ps[e];
    v++;
  }
  for (let q = 0; q < edge.length; q++) {
    const a = edge[q], b = edge[(q + 1) % edge.length], a2 = first + q, b2 = first + ((q + 1) % edge.length);
    // (wound to face outward, and the other way too: a skirt is seen from either side)
    idx.push(a, a2, b2, a, b2, b, a, b2, a2, a, b, b2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aH', new THREE.BufferAttribute(hs, 1));
  geo.setAttribute('aL', new THREE.BufferAttribute(ls, 1));
  geo.setAttribute('aM', new THREE.BufferAttribute(ms, 1));
  geo.setAttribute('aT', new THREE.BufferAttribute(ts, 1));
  geo.setAttribute('aP', new THREE.BufferAttribute(ps, 1));
  geo.setIndex(new THREE.BufferAttribute(verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}
