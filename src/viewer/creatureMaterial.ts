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

// Per-covering PBR presets. `bump` scales the relief; the physical lobes are what make each covering
// read as its material at a glance: fur and feathers get a soft velvet SHEEN lobe (light grazing the
// pile), slime and chitin a wet/lacquered CLEARCOAT over the bumpy base, chitin + iridescent scales a
// thin-film IRIDESCENCE scaled by the genome's sheen. `freq` is the relief's base spatial frequency
// (cycles/bu) — the anti-aliasing fades it out as it approaches the pixel footprint.
interface Preset {
  rough: number;
  metal: number;
  bump: number;
  velvet: number; // sheen lobe weight
  velvetRough: number;
  coat: number; // clearcoat weight (scaled up by the genome sheen)
  coatRough: number;
  irid: number; // max iridescence at sheen = 1
}
const PRESET: Record<CoveringType, Preset> = {
  skin: { rough: 0.62, metal: 0.0, bump: 1.0, velvet: 0.25, velvetRough: 0.7, coat: 0.1, coatRough: 0.4, irid: 0 },
  scales: { rough: 0.48, metal: 0.04, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 0.3, coatRough: 0.3, irid: 0.5 },
  fur: { rough: 0.9, metal: 0.0, bump: 1.0, velvet: 1.0, velvetRough: 0.45, coat: 0, coatRough: 0.5, irid: 0 },
  feathers: { rough: 0.72, metal: 0.0, bump: 1.0, velvet: 0.55, velvetRough: 0.35, coat: 0, coatRough: 0.5, irid: 0.35 },
  chitin: { rough: 0.38, metal: 0.1, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 0.7, coatRough: 0.12, irid: 0.85 },
  slime: { rough: 0.3, metal: 0.0, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 1.0, coatRough: 0.04, irid: 0.25 },
  plates: { rough: 0.58, metal: 0.02, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 0.15, coatRough: 0.35, irid: 0.2 },
};

/** Dev-only shading channel (`?dbg=N`): 1 pattern · 2 relief · 3 musculature · 4 AO · 5 pixel footprint.
 *  Renders that single term as greyscale so a texture artefact can be traced to its source. */
function debugChannel(): number {
  if (!import.meta.env?.DEV || typeof location === 'undefined') return 0;
  return Number(new URLSearchParams(location.search).get('dbg') ?? 0) | 0;
}

/** Bare, scaly lower legs (a bird's scutellate tarsi and toes): below body height `y` (rest pose,
 *  body space; softened over ±`band`) the covering gives way to `color` keratin scales. */
export interface BareLegs {
  y: number;
  band: number;
  color: number;
}

export function makeCreatureMaterial(pal: Palette, cov: Covering, seed: number, bare: BareLegs | null = null): THREE.MeshPhysicalMaterial {
  // A moodier base than the raw palette: real integument is rarely a bright, saturated toy. We
  // desaturate and darken a touch so creatures read as living tissue, not painted plastic.
  const main = new THREE.Color().setHSL(pal.hueA, pal.sat * 0.8, pal.light * 0.88);
  const back = main.clone().multiplyScalar(0.55); // dorsal — deeper, for countershading
  // ventral — lighter, but a muted greyed tone, never the cartoon white belly
  const belly = main.clone().lerp(new THREE.Color(0xc4bcab), 0.38);
  const pattern = new THREE.Color().setHSL(pal.hueB, Math.min(1, pal.sat * 1.1), pal.light * 0.44);
  // a deeper, slightly hue-shifted accent — outlines rosettes/ocelli and adds depth inside markings
  const accent = new THREE.Color().setHSL((pal.hueB + 0.08) % 1, Math.min(1, pal.sat * 1.2), pal.light * 0.3);
  // a cool, dim skylight edge — a thin backlit rim of living skin, NOT a warm glossy halo
  const rim = new THREE.Color(0x74839c);
  // warm blood-tinted translucency where the body is lit from behind / at thin edges (cheap SSS)
  const blood = new THREE.Color().setHSL((pal.hueA * 0.3 + 0.0) % 1, 0.75, 0.32);

  const preset = PRESET[cov.type];
  const roughness = THREE.MathUtils.clamp(preset.rough * (1 - 0.4 * cov.sheen), 0.05, 1);

  // a per-creature spatial offset so two same-covering creatures don't share a pattern phase
  const off = new THREE.Vector3(
    ((seed & 0xff) / 255) * 20 - 10,
    (((seed >>> 8) & 0xff) / 255) * 20 - 10,
    (((seed >>> 16) & 0xff) / 255) * 20 - 10,
  );

  const mat = new THREE.MeshPhysicalMaterial({
    color: main,
    roughness,
    metalness: preset.metal,
    sheen: preset.velvet,
    sheenRoughness: preset.velvetRough,
    sheenColor: main.clone().lerp(new THREE.Color(0xffffff), 0.35),
    clearcoat: THREE.MathUtils.clamp(preset.coat * (0.45 + 0.75 * cov.sheen), 0, 1),
    clearcoatRoughness: preset.coatRough,
    iridescence: THREE.MathUtils.clamp(preset.irid * Math.max(0, cov.sheen - 0.25) * 1.4, 0, 1),
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBack = { value: back };
    shader.uniforms.uBelly = { value: belly };
    shader.uniforms.uPattern = { value: pattern };
    shader.uniforms.uPattern2 = { value: accent };
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uBlood = { value: blood };
    shader.uniforms.uPType = { value: PATTERN_INDEX[cov.pattern] };
    shader.uniforms.uCover = { value: COVERING_INDEX[cov.type] };
    shader.uniforms.uPScale = { value: cov.patternScale };
    shader.uniforms.uContrast = { value: cov.patternContrast };
    shader.uniforms.uSheen = { value: cov.sheen };
    shader.uniforms.uBump = { value: preset.bump };
    shader.uniforms.uOff = { value: off };
    shader.uniforms.uDebug = { value: debugChannel() };
    shader.uniforms.uBareY = { value: bare ? bare.y : -1e6 };
    shader.uniforms.uBareBand = { value: bare ? Math.max(bare.band, 1e-3) : 1 };
    shader.uniforms.uBareCol = { value: new THREE.Color(bare ? bare.color : 0) };

    // Pattern + relief sample `aBodyPos` — a per-vertex *body-space* coordinate (the vertex's
    // rest-pose position, baked into the geometry by CreatureMesh). Because it's fixed to the mesh,
    // the texture stays welded to the skin as the body animates and the camera orbits (no swimming).
    // World normal (for countershading) we still compute ourselves — three's `worldPosition` is only
    // declared under certain defines (envmap/shadow), which don't hold for every body/thumbnail.
    // `aFlesh` (mouth overhaul) marks carved mouth-cavity vertices: 1 deep inside the maw → 0 on
    // untouched skin. Every body geometry sets it (zeros when there is no carve). `aAO` is a baked
    // ambient-occlusion term (1 = open, 0 = buried in a crease) — the smooth skin computes it from
    // the body field; the capsule kit fills it with 1.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aBodyPos;\nattribute float aFlesh;\nattribute float aAO;\nvarying vec3 vBodyPos;\nvarying vec3 vWNrm;\nvarying float vFlesh;\nvarying float vAO;',
      )
      .replace('#include <project_vertex>', '  vBodyPos = aBodyPos;\n  vFlesh = aFlesh;\n  vAO = aAO;\n#include <project_vertex>')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n  vWNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HELPERS)
      // color: countershading + the pattern field. Also primes the per-fragment globals (the pixel
      // footprint gFw and the relief height gH) that the AA'd noise + the bump below share.
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 bp = vBodyPos + uOff;
          gFw = max(length(dFdx(vBodyPos)), length(dFdy(vBodyPos))) + 1e-5;
          gH = surfaceHeight(bp, uCover);
          gM = muscle(bp);
          float up = clamp(vWNrm.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 skin = mix(uBelly, uBack, smoothstep(0.22, 0.8, up));
          float pat = patternField(bp, uPType, uPScale);
          skin = mix(skin, uPattern, clamp(pat * uContrast, 0.0, 1.0));
          // a deeper accent in the cores of strong markings (rosette rings, ocelli) → richness
          skin = mix(skin, uPattern2, smoothstep(0.55, 0.95, pat) * uContrast * 0.4);
          // low-frequency tonal break-up so the surface never reads as flat plastic
          skin *= 0.92 + 0.16 * fbmA(bp * 2.2, 2.2);
          // bare legs: the plumage ends in a soft cuff and the shank below is keratin scutes
          float bare = 1.0 - smoothstep(uBareY - uBareBand, uBareY + uBareBand, vBodyPos.y);
          if (bare > 0.0) {
            float hb = gHb;
            float hs = surfaceHeight(bp * 2.6, 1);
            gH = mix(gH, hs, bare);
            gHb = mix(hb, gHb * 0.6, bare);
            skin = mix(skin, uBareCol * (0.72 + 0.36 * hs), bare);
          }
          // gentle sub-surface musculature shading (creases a touch darker → taut, not a balloon)
          skin *= mix(0.78, 1.0, smoothstep(-0.24, 0.2, gM));
          // grime in the recesses (scale seams, plate grooves, fur partings)
          skin *= 1.0 - 0.22 * smoothstep(0.35, 0.85, gH);
          // baked crease occlusion (limb roots, under the jaw, between toes) — a soft multiply
          skin *= mix(0.42, 1.0, vAO);
          // carved mouth interior (mouth overhaul): covering/pattern give way to dark wet gum-flesh,
          // deepening toward near-black down the throat — depth + darkness is what reads "orifice"
          float fw = smoothstep(0.1, 0.75, vFlesh);
          vec3 gum = mix(vec3(0.16, 0.035, 0.045), vec3(0.045, 0.008, 0.012), smoothstep(0.4, 1.0, vFlesh));
          skin = mix(skin, gum, fw);
          diffuseColor.rgb = skin;
          if (uDebug == 1) diffuseColor.rgb = vec3(pat);
          if (uDebug == 2) diffuseColor.rgb = vec3(gH);
          if (uDebug == 3) diffuseColor.rgb = vec3(gM + 0.5);
          if (uDebug == 4) diffuseColor.rgb = vec3(vAO);
          if (uDebug == 5) diffuseColor.rgb = vec3(gFw * 60.0);
        }`,
      )
      // roughness: patchy wet/dry, so the skin catches light unevenly like real hide (never uniform gloss)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.85 + 0.32 * fbmA(vBodyPos * 3.6 + uOff, 3.6)), 0.05, 1.0);
        // relief peaks are polished, recesses dull
        roughnessFactor = clamp(roughnessFactor + 0.12 * (gH - 0.5), 0.05, 1.0);
        // mouth flesh is wet — glassy specular, whatever the covering
        roughnessFactor = mix(roughnessFactor, 0.14, smoothstep(0.1, 0.75, vFlesh));`,
      )
      // relief: perturb the (view-space) normal by the body-space height field's gradient. The height
      // is band-limited (see fbmA/aaW), so its screen derivatives stay smooth instead of sparkling.
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        {
          float h = (gHb + gM * 0.02) * uBump;
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
      // rim + cheap translucency (use the geometric vNormal for a clean silhouette glow)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          // a thin, dim, cool backlit edge — just enough to separate the silhouette from the dark
          // ground, never the warm glossy halo that read as a toy
          float fres = pow(1.0 - ndv, 5.0);
          // no backlit rim inside the mouth — a glowing throat would break the recess illusion
          float noMouth = 1.0 - 0.9 * smoothstep(0.1, 0.6, vFlesh);
          totalEmissiveRadiance += uRim * fres * 0.12 * noMouth;
          // living tissue glows warm where light scatters through thin edges (ears, fins, webbing)
          // — a soft blood-tinted wrap at grazing angles, strongest on soft coverings
          float soft = (uCover == 0 || uCover == 5) ? 1.0 : (uCover == 2 || uCover == 3) ? 0.5 : 0.2;
          totalEmissiveRadiance += uBlood * pow(1.0 - ndv, 2.5) * 0.09 * soft * noMouth * vAO;
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
varying float vFlesh;
varying float vAO;
uniform vec3 uBack; uniform vec3 uBelly; uniform vec3 uPattern; uniform vec3 uPattern2; uniform vec3 uRim;
uniform vec3 uBlood;
uniform int uPType; uniform int uCover;
uniform float uPScale; uniform float uContrast; uniform float uSheen; uniform float uBump;
uniform vec3 uOff;
uniform int uDebug;
uniform float uBareY; uniform float uBareBand; uniform vec3 uBareCol;

// Per-fragment globals, primed at the top of the colour stage and reused by the roughness + normal
// stages (so the expensive relief is evaluated once per pixel, not three times).
float gFw = 0.01; // the pixel footprint in body units — what every AA fade below is measured against
float gH = 0.0;   // covering relief, normalized [0,1] — drives grime + roughness
float gHb = 0.0;  // the same relief as a PHYSICAL height in body units — drives the bump
float gM = 0.0;   // musculature relief

// ANTI-ALIASING. A procedural texture aliases into "TV static" once its detail is finer than a pixel:
// the old fur relief ran at 26 cycles/bu × 5 octaves, i.e. sub-pixel for any creature not filling
// the screen, and its screen-derivative bump turned that into sparkle. aaW(freq) is the weight an
// octave of spatial frequency \`freq\` (cycles per body unit) keeps: 1 while its wavelength spans many
// pixels, fading to 0 by the time it spans ~2. Faded detail is replaced by its MEAN, so tone stays
// consistent at every zoom (the classic band-limited / "clamped" procedural texture).
float aaW(float freq) { return 1.0 - smoothstep(0.12, 0.42, freq * gFw); }

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
// band-limited fbm: \`p\` is already scaled by \`freq\` (its base frequency, cycles/bu)
float fbmA(vec3 p, float freq) {
  float a = 0.5; float v = 0.0;
  for (int i = 0; i < 5; i++) {
    v += a * mix(0.5, vnoise(p), aaW(freq));
    p = p * 2.02 + 7.3; a *= 0.5; freq *= 2.02;
  }
  return v;
}
// unfiltered low-frequency fbm — only for domain warps (≤ ~1 cycle/bu, never near a pixel)
float fbm3(vec3 p) {
  float a = 0.5; float v = 0.0;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.02 + 7.3; a *= 0.5; }
  return v;
}
// band-limited ridged multifractal — sharp veins/fibres (muscle striations, scale keels)
float ridgedA(vec3 p, float freq) {
  float a = 0.5; float v = 0.0;
  for (int i = 0; i < 4; i++) {
    float n = 1.0 - abs(2.0 * vnoise(p) - 1.0);
    v += a * mix(0.333, n * n, aaW(freq));
    p = p * 2.03 + 3.7; a *= 0.5; freq *= 2.03;
  }
  return v;
}
// domain warp — turns static noise into flowing, organic, cohesive structure
vec3 warp(vec3 p, float amt) {
  vec3 q = vec3(fbm3(p), fbm3(p + 5.2), fbm3(p + 9.7));
  return p + amt * (q - 0.5);
}
// a shared sub-surface musculature relief in [-~0.25, ~0.25] (so nothing reads as a smooth balloon)
float muscle(vec3 p) {
  return (ridgedA(vec3(p.x * 2.6, p.y * 2.3, p.z * 1.3), 2.6) - 0.45) * 0.5;
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
// Every edge is widened by the pattern's own pixel footprint \`c\` (cells per pixel) so markings stay
// crisp up close and blur gracefully — rather than shimmer — when the creature is small on screen.
float patternField(vec3 p0, int type, float scale) {
  if (type == 0) return 0.0;                                    // plain
  vec3 p = warp(p0, 0.5);                                       // a flowing coordinate
  if (type == 1) {                                              // stripes — wavy transverse (tiger/zebra)
    float coord = (p.z * 1.5 + p.y * 0.45) * scale + 1.8 * fbm3(p0 * 0.85);
    float w = fwidth(coord);
    float v = smoothstep(0.04 - w, 0.5 + w, abs(sin(coord)));
    return mix(0.68, v, 1.0 - smoothstep(0.6, 1.6, w));
  }
  if (type == 2) {                                              // bands — bold transverse
    float s = sin(p.z * scale * 0.8 + 0.6 * fbm3(p0));
    float w = fwidth(s) + 0.02;
    return smoothstep(-w, w, s);
  }
  float c = gFw * scale * 0.55;                                 // voronoi cells per pixel
  if (type == 3) {                                              // spots / rosettes (leopard)
    vec2 F = voronoi(p * scale * 0.55);
    // a band-limited wobble roughens the spot edge and BREAKS the rosette ring into arcs — a
    // leopard's rosette is a broken ring of dark blotches, a whole crisp circle read as a stamp
    float n = fbmA(p * scale * 1.6, scale * 1.6);
    float fill = 1.0 - smoothstep(0.14 - c, 0.3 + c, F.x + (n - 0.5) * 0.14);
    float ring = smoothstep(0.085 + c, 0.0, abs(F.x - 0.29 + (n - 0.5) * 0.1)) * smoothstep(0.28, 0.46, n);
    return mix(0.3, clamp(max(fill * 0.72, ring * 1.1), 0.0, 1.0), 1.0 - smoothstep(0.25, 0.6, c));
  }
  if (type == 4) {                                              // ocelli — concentric eye-spots (peacock)
    c = gFw * scale * 0.5;
    vec2 F = voronoi(p * scale * 0.5);
    float center = 1.0 - smoothstep(0.07 - c, 0.13 + c, F.x);
    float ring = smoothstep(0.055 + c, 0.0, abs(F.x - 0.4));
    return mix(0.2, clamp(max(center, ring * 0.9), 0.0, 1.0), 1.0 - smoothstep(0.25, 0.6, c));
  }
  if (type == 5) {                                              // reticulate — crisp net (giraffe/croc)
    c = gFw * scale * 0.5;
    vec2 F = voronoi(p * scale * 0.5);
    return mix(0.15, 1.0 - smoothstep(0.0, 0.05 + 1.5 * c, F.y - F.x), 1.0 - smoothstep(0.25, 0.6, c));
  }
  if (type == 6) {                                              // mottle — flowing camo
    return smoothstep(0.34, 0.66, fbmA(p * scale * 0.5, scale * 0.5));
  }
  // gradient — a head→tail ramp, softly broken by low-freq noise
  return smoothstep(-1.6, 1.6, p0.z * 0.9 + (fbm3(p0 * 0.6) - 0.5));
}

// --- surface relief per covering (MORPHOLOGY §7.2) ----------------------------
// Returns the relief normalized to [0,1] (grime + roughness read it) and writes gHb, the same relief
// as a PHYSICAL height in body units. The bump must use a physical height: a scale ~1/8 bu across is
// ~0.01 bu tall, and feeding the normalized 0..1 value straight into the bump (as before) meant
// slopes of ~30 — every normal saturated, and any tiny variation became full-range pixel noise.
// Amplitudes are set so each relief's peak slope (2π·freq·amp) lands near 0.5–1.
// Each relief also fades to its mean as its cells shrink toward the pixel footprint (aaW), so the
// bump is a crisp scale/plate/feather read up close and a clean surface at a distance.
float surfaceHeight(vec3 p, int cover) {
  if (cover == 1) {                                             // scales — row-offset lenses
    // (no row bricking: a floor(z) shift is a hard seam under the derivative bump — a 1-px streak
    // at every row — and the 3-D cells are irregular enough on their own)
    vec3 q = p * 8.0;
    vec2 F = voronoi(q);
    float lens = 1.0 - smoothstep(0.0, 0.9, F.x);               // each scale domes from its centre
    float seam = smoothstep(0.0, 0.08 + gFw * 8.0, F.y - F.x);  // and dips at the seams
    float h = mix(0.45, lens * 0.75 * seam + 0.1, aaW(8.0));
    gHb = h * 0.016;
    return h;
  }
  if (cover == 2) {                                             // fur — clumped pile + directional streaks
    float clumps = fbmA(vec3(p.x * 5.0, p.y * 5.0, p.z * 2.4), 5.0);
    float streak = fbmA(vec3(p.x * 22.0, p.y * 22.0, p.z * 5.0), 22.0);
    gHb = clumps * 0.02 + streak * 0.005;
    return clumps * 0.55 + streak * 0.45;
  }
  if (cover == 3) {                                             // feathers — overlapping vanes
    // elongated cells (stretched head-to-tail) each domed like a laid feather, seams between them,
    // plus a fine barb grain along the body. (Straight constant-z rows read as planks, and their
    // sawtooth step sat under the derivative bump as a 1-px streak at every row.)
    vec3 q = vec3(p.x * 7.0, p.y * 7.0, p.z * 4.2);
    vec2 F = voronoi(q);
    float vane = 1.0 - smoothstep(0.0, 1.05, F.x);
    float seam = smoothstep(0.0, 0.12 + gFw * 7.0, F.y - F.x);
    float barbs = fbmA(vec3(p.x * 34.0, p.y * 34.0, p.z * 8.0), 34.0);
    float h = mix(0.4, vane * 0.62 * mix(0.6, 1.0, seam) + 0.18, aaW(7.0)) + (barbs - 0.5) * 0.08;
    gHb = h * 0.014;
    return h;
  }
  if (cover == 4) {                                             // chitin — large smooth plates
    vec2 F = voronoi(p * 3.0);
    float h = mix(0.8, smoothstep(0.0, 0.09 + gFw * 3.0, F.y - F.x), aaW(3.0));   // grooves at the seams
    gHb = h * 0.012;
    return h;
  }
  if (cover == 5) {                                             // slime — faint wet ripple
    float h = fbmA(p * 3.5, 3.5);
    gHb = h * 0.018;
    return h * 0.35;
  }
  if (cover == 6) {                                             // plates — big deep scutes
    vec2 F = voronoi(p * 2.2);
    float h = mix(0.75, smoothstep(0.0, 0.13 + gFw * 2.2, F.y - F.x), aaW(2.2));
    gHb = h * 0.03;
    return h;
  }
  // skin — fine wrinkle-and-pore relief
  float pores = fbmA(p * 6.0, 6.0);
  float wrinkle = ridgedA(p * vec3(3.0, 9.0, 3.0), 9.0);
  gHb = pores * 0.008 + wrinkle * 0.006;
  return pores * 0.22 + wrinkle * 0.12;
}
`;
