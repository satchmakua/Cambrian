/**
 * The body's skin material (MORPHOLOGY §7) — a MeshStandardMaterial extended via
 * `onBeforeCompile` with everything that turns a smooth capsule-union into a textured,
 * living animal. All procedural, in body/object space (stable under the camera turntable),
 * deterministic from the genome's `covering` + seed:
 *
 *   - countershading: darker on the back, lighter on the belly (DESIGN §6.4)
 *   - a color PATTERN field (plain / stripes / bands / spots / ocelli / reticulate /
 *     mottle / gradient) mixed in by `patternContrast`  (§7.1)
 *   - in-shader surface RELIEF per covering (scales / fur / feathers / chitin / plates /
 *     slime / skin) via screen-space-derivative bump — no textures allocated  (§7.2)
 *   - per-covering material presets (roughness/metalness) + a `sheen`→iridescent oil-film
 *   - a fresnel rim so the silhouette glows like backlit skin
 *
 * One material instance is shared across every body mesh of a creature, so the extended
 * shader compiles once.
 */
import * as THREE from 'three';
import type { Palette, Covering, CoveringType, PatternType } from '../engine/genome';

const COVERING_INDEX: Record<CoveringType, number> = {
  skin: 0,
  scales: 1,
  fur: 2,
  feathers: 3,
  chitin: 4,
  slime: 5,
  plates: 6,
};
const PATTERN_INDEX: Record<PatternType, number> = {
  plain: 0,
  stripes: 1,
  bands: 2,
  spots: 3,
  ocelli: 4,
  reticulate: 5,
  mottle: 6,
  gradient: 7,
};

// roughness / metalness / bump-strength per covering — fur is matte & soft, chitin glossy
// & hard, slime wet & smooth, plates deeply grooved.
const PRESET: Record<CoveringType, { rough: number; metal: number; bump: number }> = {
  skin: { rough: 0.7, metal: 0.0, bump: 0.22 },
  scales: { rough: 0.5, metal: 0.08, bump: 0.6 },
  fur: { rough: 0.95, metal: 0.0, bump: 0.5 },
  feathers: { rough: 0.8, metal: 0.0, bump: 0.45 },
  chitin: { rough: 0.35, metal: 0.15, bump: 0.5 },
  slime: { rough: 0.16, metal: 0.0, bump: 0.18 },
  plates: { rough: 0.6, metal: 0.0, bump: 0.7 },
};

export function makeCreatureMaterial(pal: Palette, cov: Covering, seed: number): THREE.MeshStandardMaterial {
  const main = new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light);
  const back = main.clone().multiplyScalar(0.6); // dorsal — darker
  const belly = main.clone().lerp(new THREE.Color(0xffffff), 0.42); // ventral — lighter
  const pattern = new THREE.Color().setHSL(pal.hueB, Math.min(1, pal.sat * 1.1), pal.light * 0.5);
  // a deeper, slightly hue-shifted accent — outlines rosettes/ocelli and adds depth inside markings
  const accent = new THREE.Color().setHSL((pal.hueB + 0.08) % 1, Math.min(1, pal.sat * 1.2), pal.light * 0.34);
  const rim = main.clone().lerp(new THREE.Color(0xffe2b8), 0.5); // warm backlight

  const preset = PRESET[cov.type];
  const roughness = THREE.MathUtils.clamp(preset.rough * (1 - 0.45 * cov.sheen), 0.05, 1);

  // a per-creature spatial offset so two same-covering creatures don't share a pattern phase
  const off = new THREE.Vector3(
    ((seed & 0xff) / 255) * 20 - 10,
    (((seed >>> 8) & 0xff) / 255) * 20 - 10,
    (((seed >>> 16) & 0xff) / 255) * 20 - 10,
  );

  const mat = new THREE.MeshStandardMaterial({ color: main, roughness, metalness: preset.metal });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBack = { value: back };
    shader.uniforms.uBelly = { value: belly };
    shader.uniforms.uPattern = { value: pattern };
    shader.uniforms.uPattern2 = { value: accent };
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uPType = { value: PATTERN_INDEX[cov.pattern] };
    shader.uniforms.uCover = { value: COVERING_INDEX[cov.type] };
    shader.uniforms.uPScale = { value: cov.patternScale };
    shader.uniforms.uContrast = { value: cov.patternContrast };
    shader.uniforms.uSheen = { value: cov.sheen };
    shader.uniforms.uBump = { value: preset.bump };
    shader.uniforms.uOff = { value: off };

    // Pattern + relief sample `aBodyPos` — a per-vertex *body-space* coordinate (the vertex's
    // rest-pose position, baked into the geometry by CreatureMesh). Because it's fixed to the mesh,
    // the texture stays welded to the skin as the body animates and the camera orbits (no swimming).
    // World normal (for countershading) we still compute ourselves — three's `worldPosition` is only
    // declared under certain defines (envmap/shadow), which don't hold for every body/thumbnail.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBodyPos;\nvarying vec3 vBodyPos;\nvarying vec3 vWNrm;')
      .replace('#include <project_vertex>', '  vBodyPos = aBodyPos;\n#include <project_vertex>')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n  vWNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HELPERS)
      // color: countershading + the pattern field
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float up = clamp(vWNrm.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 skin = mix(uBelly, uBack, smoothstep(0.25, 0.78, up));
          vec3 bp = vBodyPos + uOff;
          float pat = patternField(bp, uPType, uPScale);
          skin = mix(skin, uPattern, clamp(pat * uContrast, 0.0, 1.0));
          // a deeper accent in the cores of strong markings (rosette rings, ocelli) → richness
          skin = mix(skin, uPattern2, smoothstep(0.55, 0.95, pat) * uContrast * 0.4);
          // subtle tonal break-up so the surface never reads as flat plastic
          skin *= 0.9 + 0.18 * fbm(bp * uPScale * 1.6);
          // fake AO from the sub-surface musculature: creases darken → the form reads (less balloon)
          skin *= mix(0.72, 1.0, smoothstep(-0.22, 0.22, muscle(bp)));
          diffuseColor.rgb = skin;
        }`,
      )
      // relief: perturb the (view-space) normal by the body-space height field's gradient
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          // every covering rides on a shared sub-surface musculature relief, so no body is a smooth balloon
          float h = surfaceHeight(vBodyPos + uOff, uCover) + muscle(vBodyPos + uOff) * 0.7;
          vec3 P = -vViewPosition;
          vec3 sx = dFdx(P);
          vec3 sy = dFdy(P);
          float dhx = dFdx(h);
          float dhy = dFdy(h);
          vec3 R1 = cross(sy, normal);
          vec3 R2 = cross(normal, sx);
          float det = dot(sx, R1);
          vec3 grad = sign(det) * (dhx * R1 + dhy * R2);
          normal = normalize(abs(det) * normal - uBump * grad);
        }`,
      )
      // sheen iridescence + warm rim (use the geometric vNormal for a clean silhouette glow)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // a tighter, dimmer rim than before — a subtle backlit edge, not a glossy balloon halo
          float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 4.0);
          totalEmissiveRadiance += uRim * fres * 0.3;
          if (uSheen > 0.01) {
            float vd = abs(dot(normalize(normal), normalize(vViewPosition)));
            vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + vd));
            totalEmissiveRadiance += irid * uSheen * (1.0 - vd) * 0.22;
          }
        }`,
      );
  };

  return mat;
}

// =============================================================================
// GLSL: value noise + voronoi, the pattern fields, and the per-covering relief.
// =============================================================================

const FRAG_HELPERS = /* glsl */ `
varying vec3 vBodyPos;
varying vec3 vWNrm;
uniform vec3 uBack; uniform vec3 uBelly; uniform vec3 uPattern; uniform vec3 uPattern2; uniform vec3 uRim;
uniform int uPType; uniform int uCover;
uniform float uPScale; uniform float uContrast; uniform float uSheen; uniform float uBump;
uniform vec3 uOff;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5; float v = 0.0;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.02 + 7.3; a *= 0.5; }
  return v;
}
// ridged multifractal — sharp veins/fibres (muscle striations, scale keels, bark)
float ridged(vec3 p) {
  float a = 0.5; float v = 0.0;
  for (int i = 0; i < 4; i++) { float n = 1.0 - abs(2.0 * vnoise(p) - 1.0); v += a * n * n; p = p * 2.03 + 3.7; a *= 0.5; }
  return v;
}
// domain warp — turns static noise into flowing, organic, cohesive structure (the #1 "less static" fix)
vec3 warp(vec3 p, float amt) {
  vec3 q = vec3(fbm(p), fbm(p + 5.2), fbm(p + 9.7));
  return p + amt * (q - 0.5);
}
// a shared sub-surface musculature relief in [-~0.25, ~0.25] (so nothing reads as a smooth balloon)
float muscle(vec3 p) {
  return (ridged(vec3(p.x * 3.4, p.y * 3.0, p.z * 1.7)) - 0.45) * 0.5;
}
// returns (F1, F2) — distances to the nearest two feature points
vec2 voronoi(vec3 p) {
  vec3 b = floor(p); vec3 f = fract(p);
  float f1 = 8.0; float f2 = 8.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 o = hash33(b + g);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return vec2(sqrt(f1), sqrt(f2));
}

// --- color pattern field p(x) in [0,1] (MORPHOLOGY §7.1) — domain-warped for organic flow --------
float patternField(vec3 p0, int type, float scale) {
  if (type == 0) return 0.0;                                    // plain
  vec3 p = warp(p0, 0.5);                                       // a flowing coordinate — no more static
  if (type == 1) {                                              // stripes — wavy transverse (tiger/zebra)
    float coord = (p.z * 1.5 + p.y * 0.45) * scale + 1.8 * fbm(p0 * 0.85);
    return smoothstep(0.04, 0.5, abs(sin(coord)));
  }
  if (type == 2) {                                              // bands — bold transverse
    float s = sin(p.z * scale * 0.8 + 0.6 * fbm(p0));
    return smoothstep(-0.06, 0.06, s);
  }
  if (type == 3) {                                              // spots / rosettes (leopard)
    vec2 F = voronoi(p * scale * 0.55);
    float fill = 1.0 - smoothstep(0.14, 0.3, F.x);
    float ring = smoothstep(0.06, 0.0, abs(F.x - 0.27));        // a darker rosette outline
    return clamp(max(fill * 0.7, ring), 0.0, 1.0);
  }
  if (type == 4) {                                              // ocelli — concentric eye-spots (peacock)
    vec2 F = voronoi(p * scale * 0.5);
    float center = 1.0 - smoothstep(0.07, 0.13, F.x);
    float ring = smoothstep(0.055, 0.0, abs(F.x - 0.4));
    return clamp(max(center, ring * 0.9), 0.0, 1.0);
  }
  if (type == 5) {                                              // reticulate — crisp net (giraffe/croc)
    vec2 F = voronoi(p * scale * 0.5);
    return 1.0 - smoothstep(0.0, 0.05, F.y - F.x);
  }
  if (type == 6) {                                              // mottle — flowing camo
    return smoothstep(0.34, 0.66, fbm(p * scale * 0.5));
  }
  // gradient — a head→tail ramp, softly broken by low-freq noise
  return smoothstep(-1.6, 1.6, p0.z * 0.9 + (fbm(p0 * 0.6) - 0.5));
}

// --- surface relief height h(x) per covering (MORPHOLOGY §7.2) ----------------
float surfaceHeight(vec3 p, int cover) {
  if (cover == 1) {                                             // scales — row-offset lenses
    vec3 q = p * 9.0;
    q.x += floor(q.z) * 0.5;                                    // brick the rows
    vec2 F = voronoi(q);
    return (1.0 - F.x) * 0.9;
  }
  if (cover == 2) {                                             // fur — directional streaks
    return fbm(vec3(p.x * 26.0, p.y * 26.0, p.z * 7.0)) * 0.8;
  }
  if (cover == 3) {                                             // feathers — overlapping rows
    float row = p.z * 7.0;
    float band = fract(row);
    float across = voronoi(vec3(p.x * 7.0, floor(row), p.y * 7.0)).x;
    return (smoothstep(0.0, 0.85, band) * (1.0 - across)) * 0.8;
  }
  if (cover == 4) {                                             // chitin — large smooth plates
    vec2 F = voronoi(p * 3.2);
    return smoothstep(0.0, 0.09, F.y - F.x);                    // grooves at the seams
  }
  if (cover == 5) {                                             // slime — faint wet ripple
    return fbm(p * 3.5) * 0.35;
  }
  if (cover == 6) {                                             // plates — big deep scutes
    vec2 F = voronoi(p * 2.2);
    return smoothstep(0.0, 0.13, F.y - F.x);
  }
  return fbm(p * 6.0) * 0.25;                                   // skin — very low mottle
}
`;
