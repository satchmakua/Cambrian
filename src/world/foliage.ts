/**
 * Foliage — crowns and bushes that read as masses of leaves rather than faceted gems.
 *
 * Geometry: overlapping lobes, each a subdivided sphere pushed in and out by a smooth noise so the
 * outline is clumpy, with SOFT normals (a blend of the lobe's own outward direction and the whole
 * crown's) — a crown is lit like one soft volume, the old flat-shaded facets read as cut glass.
 *
 * Material (a MeshStandardMaterial patched in onBeforeCompile; instance colour still carries each
 * tree's own green and the season's tint):
 *   - leaf clusters: a world-space voronoi of leaf cells, each its own shade, with dark gaps between
 *     them (anti-aliased: the pattern fades to its mean once a cell nears a pixel);
 *   - self-shadow: darker toward the underside and the core of the crown;
 *   - translucency: a soft yellow-green glow at grazing angles, as leaves lit from behind;
 *   - wind: the crown sways, more toward its top, each tree on its own phase.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const FOLIAGE_TIME = { value: 0 };

function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(Math.floor(x) | 0, 0x27d4eb2d) ^ Math.imul(Math.floor(y) | 0, 0x165667b1) ^ Math.imul(Math.floor(z) | 0, 0x1b873593);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = (t: number) => t * t * (3 - 2 * t);
  const ux = u(fx), uy = u(fy), uz = u(fz);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    const w = (dx ? ux : 1 - ux) * (dy ? uy : 1 - uy) * (dz ? uz : 1 - uz);
    v += w * hash3(ix + dx, iy + dy, iz + dz);
  }
  return v;
}

/** A clumpy crown from lobes [x, y, z, r]: lumpy subdivided spheres with soft, crown-wide normals. */
export function crownGeometry(lobes: readonly (readonly [number, number, number, number])[], lumpy = 0.18, detail = 2): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3(), nl = new THREE.Vector3(), nc = new THREE.Vector3();
  for (const [cx, cy, cz, r] of lobes) {
    const g0 = new THREE.IcosahedronGeometry(1, detail);
    const g = g0.index ? g0.toNonIndexed() : g0;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      // push the lobe's surface in and out by a smooth noise (two octaves), so its outline clumps
      const n = vnoise3(v.x * 2.3 + cx * 3, v.y * 2.3 + cy * 3, v.z * 2.3 + cz * 3) * 0.7 + vnoise3(v.x * 5.1, v.y * 5.1, v.z * 5.1) * 0.3;
      const rr = r * (1 + lumpy * (n - 0.5) * 2);
      const p = v.clone().multiplyScalar(rr).add(new THREE.Vector3(cx, cy, cz));
      pos.setXYZ(i, p.x, p.y, p.z);
      // soft normal: the lobe's outward direction blended with the whole crown's
      nl.copy(v);
      nc.copy(p).normalize();
      nl.multiplyScalar(0.45).addScaledVector(nc, 0.55).normalize();
      nrm.set([nl.x, nl.y, nl.z], i * 3);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    parts.push(g);
  }
  const g = mergeGeometries(parts, false) ?? parts[0];
  for (const p of parts) if (p !== g) p.dispose();
  return g;
}

/** A conifer: stacked drooping tiers, each a cone whose skirt is ragged (alternating long and short
 *  boughs), with soft normals. */
export function coniferGeometry(): THREE.BufferGeometry {
  const tiers: [number, number, number][] = [
    [1.05, 1.3, 0.0],
    [0.9, 1.2, 0.5],
    [0.74, 1.1, 1.0],
    [0.56, 1.0, 1.48],
    [0.38, 0.9, 1.92],
  ];
  const parts: THREE.BufferGeometry[] = [];
  for (const [r, h, y] of tiers) {
    const radial = 22;
    const g0 = new THREE.ConeGeometry(r, h, radial, 2, false);
    const g = g0.index ? g0.toNonIndexed() : g0;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nrm = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const a = Math.atan2(v.x, v.z);
      const skirt = 1 - (v.y + h / 2) / h; // 1 at the rim, 0 at the tip
      // a softly ragged skirt (bough tips pushed out a little, unevenly) that droops at the rim
      const bough = 1 + 0.09 * skirt * (Math.sin(a * 5 + y * 7) * 0.6 + Math.sin(a * 11 + y * 3) * 0.4);
      v.x *= bough;
      v.z *= bough;
      v.y -= 0.12 * skirt * skirt * r;
      v.y += y + h / 2;
      pos.setXYZ(i, v.x, v.y, v.z);
      const n = new THREE.Vector3(v.x, r * 0.55, v.z).normalize();
      nrm.set([n.x, n.y, n.z], i * 3);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    parts.push(g);
  }
  const g = mergeGeometries(parts, false) ?? parts[0];
  for (const p of parts) if (p !== g) p.dispose();
  return g;
}

/** The leafy material. `leaf` sets the leaf-cell size (cells per bu): broadleaf ~3, needles ~7. */
export function foliageMaterial(leaf = 3, sway = 1): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = FOLIAGE_TIME;
    shader.uniforms.uLeaf = { value: leaf };
    shader.uniforms.uSway = { value: sway };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;\nvarying vec3 vFolW;\nvarying vec3 vFolL;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFolL = position;
        {
          // wind: the crown sways, more toward its top; each instance on its own phase
          vec3 base = vec3(0.0);
          #ifdef USE_INSTANCING
            base = instanceMatrix[3].xyz;
          #endif
          float ph = base.x * 0.21 + base.z * 0.17;
          float h = clamp(position.y * 0.5 + 0.5, 0.0, 1.5);
          float w = sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
          transformed.x += w * 0.05 * h * uSway;
          transformed.z += cos(uTime * 0.9 + ph) * 0.03 * h * uSway;
        }`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          vFolW = (modelMatrix * wp).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uLeaf;
        varying vec3 vFolW;
        varying vec3 vFolL;
        vec3 fHash3(vec3 p) {
          p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
          return fract(sin(p) * 43758.5453);
        }
        vec3 gLeafTilt = vec3(0.0);
        float gLeafAmt = 0.0;
        // (F1, F2) of a voronoi; the nearest cell's hash in gCell
        vec3 gCell;
        vec2 fVoronoi(vec3 x) {
          vec3 i = floor(x), f = fract(x);
          float d1 = 8.0, d2 = 8.0;
          for (int k = 0; k < 27; k++) {
            vec3 g = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
            vec3 o = fHash3(i + g);
            vec3 r = g + o - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; gCell = o; } else if (d < d2) d2 = d;
          }
          return vec2(sqrt(d1), sqrt(d2));
        }
        float fNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = fHash3(i).x, b = fHash3(i + vec3(1, 0, 0)).x, c = fHash3(i + vec3(0, 1, 0)).x, d = fHash3(i + vec3(1, 1, 0)).x;
          float e = fHash3(i + vec3(0, 0, 1)).x, g = fHash3(i + vec3(1, 0, 1)).x, h = fHash3(i + vec3(0, 1, 1)).x, k = fHash3(i + vec3(1, 1, 1)).x;
          return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 q = vFolW * uLeaf;
          float fw = length(fwidth(q));
          vec2 F = fVoronoi(q);
          // small leaves, each its own shade, a faint shadow where they overlap; up close each tilts
          // the normal its own way, so the crown glints leaf by leaf
          float near = 1.0 - smoothstep(0.3, 0.85, fw);
          float gap = mix(0.78, 1.0, smoothstep(0.0, 0.1 + fw, F.y - F.x));
          float shade = 0.86 + 0.28 * gCell.y;
          diffuseColor.rgb *= mix(0.95, gap * shade, near);
          gLeafTilt = (gCell - 0.5) * 2.0;
          gLeafAmt = near;
          // larger clumps of leaves: soft lighter and darker masses
          float clump = fNoise(vFolW * 0.9) * 0.65 + fNoise(vFolW * 2.1) * 0.35;
          diffuseColor.rgb *= 0.78 + 0.42 * clump;
          // self-shadow: the underside and the core of the crown are darker
          float under = smoothstep(-1.1, 0.7, vFolL.y);
          diffuseColor.rgb *= mix(0.48, 1.05, under);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize(normal + gLeafTilt * 0.38 * gLeafAmt);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // leaves lit through from behind: a soft warm-green glow at grazing angles
          float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          totalEmissiveRadiance += diffuseColor.rgb * vec3(0.55, 0.7, 0.25) * pow(1.0 - ndv, 2.2) * 0.35;
        }`,
      );
  };
  return m;
}
