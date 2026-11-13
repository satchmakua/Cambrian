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
import { coatAccent, coatBelly, coatMain, coatPattern } from './palette';
import type { FaceMask, HeadMask } from './face';
import type { Palette, Covering, CoveringType, PatternType } from '../engine/genome';
import { getQuality, useSettings } from '../ui/settings';

const COVERING_INDEX: Record<CoveringType, number> = {
  skin: 0,
  scales: 1,
  fur: 2,
  feathers: 3,
  chitin: 4,
  slime: 5,
  plates: 6,
  crystal: 7,
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
  muscle: number; // how strongly the sub-surface musculature shows (a shark's skin is taut: under the
  //                full relief its flanks were lumpy, a stuffed sock)
}
const PRESET: Record<CoveringType, Preset> = {
  skin: { rough: 0.62, metal: 0.0, bump: 1.0, velvet: 0.25, velvetRough: 0.7, coat: 0.1, coatRough: 0.4, irid: 0, muscle: 0.3 },
  scales: { rough: 0.48, metal: 0.04, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 0.3, coatRough: 0.3, irid: 0.5, muscle: 0.6 },
  fur: { rough: 0.9, metal: 0.0, bump: 1.0, velvet: 1.0, velvetRough: 0.45, coat: 0, coatRough: 0.5, irid: 0, muscle: 1 },
  feathers: { rough: 0.72, metal: 0.0, bump: 1.0, velvet: 0.55, velvetRough: 0.35, coat: 0, coatRough: 0.5, irid: 0.35, muscle: 1 },
  // (a lacquered shell, a satin one: under a near-mirror coat with an oil-slick shimmer, a crab, a beetle
  // and a spider were vinyl toys)
  chitin: { rough: 0.45, metal: 0.06, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 0.45, coatRough: 0.24, irid: 0.5, muscle: 0.5 },
  slime: { rough: 0.3, metal: 0.0, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 1.0, coatRough: 0.04, irid: 0.25, muscle: 0.4 },
  plates: { rough: 0.58, metal: 0.02, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 0.15, coatRough: 0.35, irid: 0.2, muscle: 1 },
  // a cut stone: glassy under a hard polish, a thin-film shimmer on its faces
  crystal: { rough: 0.2, metal: 0.0, bump: 1.0, velvet: 0.0, velvetRough: 0.5, coat: 1.0, coatRough: 0.05, irid: 0.7, muscle: 0.5 },
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

/** One layer of shell fur: the body redrawn `h` (0 root … 1 tip) of the way out along its normals
 *  over a pile `len` deep, keeping only fragments inside a strand (see the shader). */
export interface FurShell {
  h: number;
  len: number;
  /** strands per body unit */
  density: number;
  /** eyes to keep the pile out of — body-space centre + radius, flat (x, y, z, r, …; up to 6) */
  eyes?: readonly number[];
}

/** Whether the relief's slope is measured at every pixel (two more evaluations of the relief each) or
 *  taken from the GPU's per-block derivative. Shared by every creature material: see `setFineRelief`. */
const FINE_RELIEF = { value: 1 };

/** a cut crystal skin's clear coat, and how rough it is (see makeCreatureMaterial) */
export const CUT_COAT = 0.35;
export const CUT_COAT_ROUGH = 0.3;

/** The graphics option behind the per-pixel relief (RenderQuality.fineRelief). */
export function setFineRelief(on: boolean): void {
  FINE_RELIEF.value = on ? 1 : 0;
}
// (it follows the settings: every coat already drawn changes with the option, no material is rebuilt)
setFineRelief(getQuality().fineRelief);
useSettings.subscribe(() => setFineRelief(getQuality().fineRelief));

export function makeCreatureMaterial(
  pal: Palette,
  cov: Covering,
  seed: number,
  bare: BareLegs | null = null,
  shell: FurShell | null = null,
  face: FaceMask | null = null,
  seam = 0, // a beetle's wing-cases: the half-width of the dark suture down the back's midline (0 = none)
  head: HeadMask | null = null, // where bands and stripes stop: the head takes one tone
  cut = false, // a crystal skin already cut into flat faces (facets.ts): the shader cuts none of its own
): THREE.MeshPhysicalMaterial {
  // A moodier base than the raw palette: real integument is rarely a bright, saturated toy. We
  // desaturate and darken a touch so creatures read as living tissue, not painted plastic.
  // (see palette.ts: the palette is sRGB HSL — read as linear, every coat came out a pale pastel)
  const main = coatMain(pal);
  const back = main.clone().multiplyScalar(0.62); // dorsal — deeper, for countershading
  // ventral — the coat's own hue, lighter and a little greyer (a fixed grey lerped in linear space
  // outweighed a brown coat ~4:1 and gave every species the same greige belly)
  const belly = coatBelly(pal);
  const pattern = coatPattern(pal);
  // a deeper accent toward umber — outlines rosettes/ocelli and adds depth inside markings
  const accent = coatAccent(pal);
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
    // a velvet lobe in the coat's own tint: lerped toward white it frosted every pelt at the edges
    sheenColor: main.clone().multiplyScalar(0.6),
    clearcoat: THREE.MathUtils.clamp(preset.coat * (0.45 + 0.75 * cov.sheen), 0, 1),
    clearcoatRoughness: preset.coatRough,
    iridescence: THREE.MathUtils.clamp(preset.irid * Math.max(0, cov.sheen - 0.25) * 1.4, 0, 1),
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
  });
  // A skin already cut into faces (facets.ts) takes a satin polish, not a mirror: each of its faces
  // mirrored the sky or the dark ground its own way, white or deep blue, and the faces' borders — which
  // follow the mesh, ragged — drew a torn-paper patchwork over the stone.
  if (cut) {
    mat.clearcoat = Math.min(mat.clearcoat, CUT_COAT);
    mat.clearcoatRoughness = Math.max(mat.clearcoatRoughness, CUT_COAT_ROUGH);
    mat.iridescence = Math.min(mat.iridescence, 0.25);
    mat.roughness = Math.max(mat.roughness, 0.3);
  }

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMain = { value: main };
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
    shader.uniforms.uShellH = { value: shell ? shell.h : -1 };
    shader.uniforms.uShellLen = { value: shell ? shell.len : 0 };
    shader.uniforms.uShellDen = { value: shell ? shell.density : 1 };
    // a bare face (an ape's) — w = 0 when there is none
    shader.uniforms.uFace = { value: face ? new THREE.Vector4(face.c[0], face.c[1], face.c[2], face.r) : new THREE.Vector4(0, 0, 0, 0) };
    shader.uniforms.uFaceCol = { value: new THREE.Color(face ? face.color : 0) };
    // the head, plain under a transverse marking — w = 0 when it is not kept plain
    shader.uniforms.uHeadA = { value: head ? new THREE.Vector4(head.a[0], head.a[1], head.a[2], head.r) : new THREE.Vector4(0, 0, 0, 0) };
    shader.uniforms.uHeadB = { value: new THREE.Vector3(...(head ? head.b : [0, 0, 0])) };
    shader.uniforms.uSeam = { value: seam };
    shader.uniforms.uCut = { value: cut ? 1 : 0 };
    shader.uniforms.uMuscle = { value: preset.muscle };
    shader.uniforms.uFine = FINE_RELIEF; // (one object, shared: the graphics option switches every coat at once)
    // (unused slots keep r = 0, which clears nothing)
    shader.uniforms.uEyes = { value: Array.from({ length: 6 }, (_, i) => new THREE.Vector4(...(shell?.eyes?.slice(i * 4, i * 4 + 4) ?? []).concat([0, 0, 0, 0]).slice(0, 4))) };

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
        '#include <common>\nattribute vec3 aBodyPos;\nattribute float aFlesh;\nattribute float aAO;\nattribute float aLeg;\nattribute float aCut;\nvarying vec3 vBodyPos;\nvarying vec3 vWNrm;\nvarying vec3 vBNrm;\nvarying float vFlesh;\nvarying float vAO;\nvarying float vLeg;\nvarying float vCut;',
      )
      .replace('#include <project_vertex>', '  vBodyPos = aBodyPos;\n  vFlesh = aFlesh;\n  vAO = aAO;\n  vLeg = aLeg;\n  vCut = aCut;\n#include <project_vertex>')
      // a fur shell rides out along the (skinned) normal
      // …and the outer shells lean back along the body and down, so the slices stack into combed
      // hairs rather than standing straight up like the pile of a towel
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  if (uShellH >= 0.0) transformed += (normalize(objectNormal) + vec3(0.0, -0.45, -1.1) * uShellH) * uShellH * uShellLen;')
      .replace('#include <common>', '#include <common>\nuniform float uShellH;\nuniform float uShellLen;')
      .replace(
        '#include <beginnormal_vertex>',
        // (objectNormal here is the REST normal, in the body's own frame — before skinning bends it)
        '#include <beginnormal_vertex>\n  vWNrm = normalize(mat3(modelMatrix) * objectNormal);\n  vBNrm = objectNormal;',
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
          vec3 dPx = dFdx(vBodyPos);
          vec3 dPy = dFdy(vBodyPos);
          gFw = max(length(dPx), length(dPy)) + 1e-5;
          // The relief's slope, for the bump: the height one pixel over, across and down, measured at
          // THIS pixel. (The GPU's own derivative of the height is taken once per 2x2 block of pixels:
          // wherever the relief is fine — a scale a few pixels across, the edge of a plate — every
          // block took one slope and the hide broke into a mosaic of little squares, its plate edges
          // into staircases. The fur's shells keep the cheap derivative: a strand hides it.)
          float hX = 0.0;
          float hY = 0.0;
          // which way the plumage lies here: toward the tail and a little down, flat on the skin — back
          // along the back and the belly, down-and-back on a flank, down a chest that faces forward —
          // and on skin that faces forward and up (a brow, a snout) up and back over the head. (Toward
          // the tail everywhere, a forehead facing just the way that flow came from had none left to lie
          // along: the scales there whirled into a rosette.)
          {
            gNb = normalize(vBNrm);
            float fore = max(gNb.z, 0.0);
            vec3 flow = vec3(0.0, -0.45 + 1.2 * fore * fore, -1.0);
            vec3 t = flow - gNb * dot(flow, gNb);
            gLay = t / max(length(t), 1e-3);
          }
          if (uShellH < 0.0 && uFine > 0.5) {
            surfaceHeight(bp + dPx, uCover);
            hX = gHb;
            surfaceHeight(bp + dPy, uCover);
            hY = gHb;
            gFine = 1.0;
          }
          gH = surfaceHeight(bp, uCover);
          gDhx = hX - gHb;
          gDhy = hY - gHb;
          gM = muscle(bp) * uMuscle;
          // (a cut stone has no countershading: by its flat faces' normals, whole faces snapped between
          // the belly's, the flank's and the back's tones — pale and dark patches, a camouflage)
          float up = uCut > 0.5 ? 0.5 : clamp(vWNrm.y * 0.5 + 0.5, 0.0, 1.0);
          // (a leg, and a paw on it, wears the flank's tone: facing the ground, a paw took the belly's —
          // pale puffballs under a dark animal)
          up = mix(up, 0.5, vLeg);
          // countershading kept to the underside and the spine: the flanks carry the coat's true
          // colour (a flank used to be 58% belly — fixed grey — and 42% darkened back, never the coat)
          vec3 skin = mix(uMain, uBelly, 1.0 - smoothstep(0.1, 0.4, up));
          skin = mix(skin, uBack, smoothstep(0.64, 0.96, up));
          // a body's markings mirror across its midline: sampled where they lay, the noise under them
          // differed left and right, and one arm wore a band the other didn't (a magenta arm and a mint
          // one). (The skin's normal is mirrored with it: an eye-spot is laid on it.)
          float sx = vBodyPos.x < 0.0 ? -1.0 : 1.0;
          vec3 bpP = vec3(abs(vBodyPos.x), vBodyPos.y, vBodyPos.z) + uOff;
          gNb.x *= sx;
          float pat = patternField(bpP, uPType, uPScale);
          gNb.x *= sx;
          // stripes and bands run down from the back, stripes thinning as they go, and give out under the
          // belly — a tiger's, a lizard's crossbands, a fish's bars. (Wrapped right round the trunk at one
          // width, they were hoops on a toy.) A band keeps half its tone on the belly.
          if (uPType == 1 || uPType == 2) {
            float dorsal = smoothstep(-0.6, 0.05, gNb.y);
            pat = uPType == 1 ? pow(pat, mix(2.6, 1.0, dorsal)) * dorsal : pat * mix(0.5, 1.0, dorsal);
          }
          // (spots fade out down the legs, as a fawn's dapples or a cheetah's do — the blotches laid on
          // a slim shin stretched into streaks)
          if (uPType == 3) pat *= 1.0 - 0.75 * vLeg;
          // (a band's edge across a face drew a bill or a mask on it: the head is one tone)
          if (uPType == 2 && uHeadA.w > 0.0) {
            vec3 hab = uHeadB - uHeadA.xyz;
            float ht = clamp(dot(vBodyPos - uHeadA.xyz, hab) / max(dot(hab, hab), 1e-6), 0.0, 1.0);
            pat *= smoothstep(uHeadA.w * 1.1, uHeadA.w * 1.5, length(vBodyPos - uHeadA.xyz - hab * ht));
          }
          skin = mix(skin, uPattern, clamp(pat * uContrast, 0.0, 1.0));
          // a deeper accent in the cores of strong markings (rosette rings, ocelli) → richness
          skin = mix(skin, uPattern2, smoothstep(0.55, 0.95, pat) * uContrast * 0.4);
          // low-frequency tonal break-up so the surface never reads as flat plastic
          skin *= 0.92 + 0.16 * fbmA(bp * 2.2, 2.2);
          // a crystal's faces each take the light their own way: lighter and darker cuts of one stone
          // (a cut skin's faces already take the light by their own tilts: their shades only nudge it —
          // spread from 0.7 to 1.28, the faces were pale and dark patches, a camouflage)
          if (uCover == 7) skin *= (uCut > 0.5 ? 0.9 + 0.2 * gFacet : 0.7 + 0.58 * gFacet) * (1.0 + (uCut > 0.5 ? 0.25 : 0.18) * gSeam);
          // a beetle's wing-cases meet in a dark seam down the middle of the back
          if (uSeam > 0.0) skin = mix(skin, uPattern2 * 0.3, (1.0 - smoothstep(uSeam * 0.35, uSeam, abs(vBodyPos.x))) * smoothstep(0.45, 0.75, up));
          // a bare face (an ape's): the coat gives way to skin round the eyes and the muzzle, and the
          // pile's relief smooths out there (the fur shells stop at its edge, below)
          float faceW = uFace.w > 0.0 ? 1.0 - smoothstep(uFace.w * 0.62, uFace.w, length(vBodyPos - uFace.xyz)) : 0.0;
          if (faceW > 0.0) {
            skin = mix(skin, uFaceCol * (0.9 + 0.2 * fbmA(bp * 9.0, 9.0)), faceW);
            gHb *= 1.0 - 0.85 * faceW;
            gDhx *= 1.0 - 0.85 * faceW;
            gDhy *= 1.0 - 0.85 * faceW;
          }
          // bare legs: the plumage ends in a soft cuff and the shank below is keratin scutes
          // (only on the legs themselves — vLeg — not a low belly or tail under the same height)
          float bare = vLeg * (1.0 - smoothstep(uBareY - uBareBand, uBareY + uBareBand, vBodyPos.y));
          if (bare > 0.0) {
            float hb = gHb;
            // the scutes are sampled 2.6x finer: their anti-aliasing must see the footprint in that
            // scaled coordinate (and gFw is restored — the fur shells and debug views read it after)
            float fw0 = gFw;
            gFw *= 2.6;
            float hs = surfaceHeight(bp * 2.6, 1);
            gFw = fw0;
            gH = mix(gH, hs, bare);
            gHb = mix(hb, gHb * 0.6, bare);
            // (a shank's scutes are a second relief, mixed in: there the bump falls back on the
            // derivative of the mixed height)
            gFine *= 1.0 - bare;
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
          // FUR SHELL: keep only what lies inside a strand. Strands are cells of a body-space grid
          // (so they stay rooted to the skin through any pose), each with its own length, tapering
          // to a point; every shell slices the same cells, so the slices stack into straight hairs.
          // Where a strand would be smaller than a pixel the shells fade out and the base coat
          // carries the look (no shimmer at a distance).
          if (uShellH >= 0.0) {
            // TUFTS: the strands of a ~3-strand patch draw together toward their tips, so the pile parts
            // into locks instead of standing as an even stipple (salt-and-pepper sandpaper up close)
            vec3 q0 = vBodyPos * uShellDen + uOff;
            vec3 cid = floor(q0 / 3.2);
            vec3 cc = (cid + 0.5 + (hash33(cid + 41.0) - 0.5) * 0.6) * 3.2;
            vec3 q = q0 + (cc - q0) * 0.5 * uShellH * uShellH;
            vec3 cell = floor(q);
            vec3 jit = hash33(cell) - 0.5;
            float sLen = (0.45 + 0.55 * hash13(cell + 17.0)) * (0.72 + 0.5 * hash13(cid + 3.0));
            // round an eye the pile shortens to a fine fringe and then stops: strands rooted in the
            // face otherwise stand out over the sunken eyeball and comb straight across the iris
            float eyeClear = 0.0;
            for (int i = 0; i < 6; i++) {
              vec4 e = uEyes[i];
              if (e.w > 0.0) eyeClear = max(eyeClear, 1.0 - smoothstep(e.w * 1.05, e.w * 1.9, length(vBodyPos - e.xyz)));
            }
            sLen *= 1.0 - 0.92 * eyeClear;
            float u = uShellH / sLen;
            float dc = length(fract(q) - 0.5 - jit * 0.5);
            float far = smoothstep(0.28, 1.15, gFw * uShellDen);
            // …except along the outline, where the strands are seen side-on and stand out against the
            // ground as fuzz however far off the animal is (faded there too, a coat at a distance was a
            // smooth hide with a hard edge: bare rubber)
            float graze = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
            // (…but they keep the faded strands' tone, below: with their root shadow back, the fringe
            // round a muzzle was a grainy dark stubble)
            float tone = far;
            far *= 1.0 - 0.85 * smoothstep(0.6, 0.92, graze) * (1.0 - eyeClear);
            if (u > 1.0 || dc > 0.62 * (1.0 - u) || far > hash13(cell + 5.0) || vFlesh > 0.05 || bare > 0.3 || faceW > 0.3) discard;
            // depth in the pile: shadowed at the root, catching light at the tips; each lock its own shade
            // — but only while the pile is dense. Where strands are thinning out toward a pixel's size
            // the survivors take the coat's own tone: left with their root shadow, the last sparse
            // strands of a bear seen whole were a scatter of dark specks, pepper on a smooth hide.
            float shade = mix(0.62, 1.12, uShellH) * (0.93 + 0.14 * hash13(cid + 9.0));
            diffuseColor.rgb *= mix(shade, 1.0, smoothstep(0.0, 0.55, tone));
          }
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
        // a skin cut into faces is lit face by face: each triangle by its own plane, so a face is one shade
        // to its edges (by the vertex normals, blended across each triangle, the border between two faces
        // ran where the vertices' faces changed — a zigzag along the mesh, torn paper)
        // (…where the cut laid the skin onto its faces — vCut: the uncut legs and face keep their smooth
        // normals, or each of their mesh's triangles caught the light as a chip of its own)
        if (uCut > 0.5 && vCut > 0.99) {
          vec3 fv = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          normal = dot(fv, normal) < 0.0 ? -fv : fv;
        }
        {
          // (the musculature is broad and smooth: its derivative is as good taken per block)
          float hm = gM * 0.02 * uBump;
          float h = gHb * uBump + hm;
          vec3 P = -vViewPosition;
          vec3 sx = dFdx(P);
          vec3 sy = dFdy(P);
          float dhx = mix(dFdx(h), gDhx * uBump + dFdx(hm), gFine);
          float dhy = mix(dFdy(h), gDhy * uBump + dFdy(hm), gFine);
          vec3 R1 = cross(sy, normal);
          vec3 R2 = cross(normal, sx);
          float det = dot(sx, R1);
          vec3 grad = sign(det) * (dhx * R1 + dhy * R2);
          normal = normalize(abs(det) * normal - uBump * grad);
        }`,
      )
      // a crystal's polish IS its faces: the clear coat takes each facet's tilt and mirrors the sky its
      // own way, face by face. (On any other hide the coat is a wet film lying over the relief, and
      // stays as smooth as the body under it.)
      .replace(
        '#include <clearcoat_normal_fragment_begin>',
        `#include <clearcoat_normal_fragment_begin>
        #ifdef USE_CLEARCOAT
          if (uCover == 7) clearcoatNormal = normal;
        #endif`,
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
          // a crystal holds light: a glow of its own colour from within, brightest at its edges
          // (a cut skin's faces glow alike, and its edges brightest: lit from within face by face at its
          // own random strength, the stone was a patchwork of pale and dark)
          if (uCover == 7) totalEmissiveRadiance += uMain * ((0.1 + 0.3 * pow(1.0 - ndv, 2.0)) * (uCut > 0.5 ? 0.85 + 0.3 * gFacet : 0.55 + 0.9 * gFacet) + (uCut > 0.5 ? 0.12 : 0.1) * gSeam) * noMouth;
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
varying vec3 vBNrm;
varying float vFlesh;
varying float vAO;
varying float vLeg;
varying float vCut;
uniform vec3 uMain; uniform vec3 uBack; uniform vec3 uBelly; uniform vec3 uPattern; uniform vec3 uPattern2; uniform vec3 uRim;
uniform vec3 uBlood;
uniform int uPType; uniform int uCover;
uniform float uPScale; uniform float uContrast; uniform float uSheen; uniform float uBump;
uniform vec3 uOff;
uniform int uDebug;
uniform float uBareY; uniform float uBareBand; uniform vec3 uBareCol;
uniform float uShellH; uniform float uShellDen; uniform vec4 uEyes[6]; uniform vec4 uFace; uniform vec3 uFaceCol; uniform vec4 uHeadA; uniform vec3 uHeadB; uniform float uSeam; uniform float uCut; uniform float uMuscle;
uniform float uFine;

// Per-fragment globals, primed at the top of the colour stage and reused by the roughness + normal
// stages (so the expensive relief is evaluated once per pixel, not three times).
float gFw = 0.01; // the pixel footprint in body units — what every AA fade below is measured against
float gH = 0.0;   // covering relief, normalized [0,1] — drives grime + roughness
float gHb = 0.0;  // the same relief as a PHYSICAL height in body units — drives the bump
float gM = 0.0;   // musculature relief
float gDhx = 0.0; // the relief's physical height one pixel across, less its height here …
float gDhy = 0.0; // … and one pixel down (see the colour stage)
float gFine = 0.0; // 1 where those are measured (else the bump takes the derivative of the height)
float gFacet = 0.5; // a crystal's facet under this pixel: its own shade, 0..1 (see surfaceHeight)
float gSeam = 0.0;  // … and how near this pixel is to that facet's cut edge, 0..1
vec3 gLay = vec3(0.0, 0.0, -1.0); // which way a feather lies on the skin here (body space, unit; see scallops)
vec3 gNb = vec3(0.0, 1.0, 0.0);   // … and the skin's own normal there (body space, unit)

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

// the nearest 3-D cell to p: xyz = p − its jittered centre (cell units), w = F1; f2 = F2
vec4 cellNear(vec3 p, out float f2) {
  vec3 b = floor(p); vec3 f = fract(p);
  float f1 = 8.0; f2 = 8.0;
  vec3 best = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + hash33(b + g) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; best = r; } else if (d < f2) { f2 = d; }
  }
  f2 = sqrt(f2);
  return vec4(-best, sqrt(f1));
}

// --- color pattern field p(x) in [0,1] (MORPHOLOGY §7.1) — domain-warped for organic flow --------
// Every edge is widened by the pattern's own pixel footprint \`c\` (cells per pixel) so markings stay
// crisp up close and blur gracefully — rather than shimmer — when the creature is small on screen.
float patternField(vec3 p0, int type, float scale) {
  if (type == 0) return 0.0;                                    // plain
  vec3 p = warp(p0, 0.5);                                       // a flowing coordinate
  if (type == 1) {                                              // stripes — wavy transverse (tiger/zebra)
    // narrow dark stripes on the coat, the marking where the wave crosses zero. (The other way about —
    // the marking everywhere but there — a tiger was a dark coat ringed with thin pale hoops.)
    float coord = (p.z * 1.5 + p.y * 0.45) * scale + 1.8 * fbm3(p0 * 0.85);
    float w = fwidth(coord);
    float v = 1.0 - smoothstep(0.12 - w, 0.42 + w, abs(sin(coord)));
    return mix(0.2, v, 1.0 - smoothstep(0.6, 1.6, w));
  }
  if (type == 2) {                                              // bands — bold transverse
    // (each band's edge a short blend, as a crossband's is, and the bands a little narrower than the
    // ground between them: edged dead sharp, half the body in each, they were painted on — bandages
    // round a dragon's limbs, an arachnid's abdomen dipped in ink)
    float s = sin(p.z * scale * 0.8 + 0.6 * fbm3(p0));
    float w = fwidth(s) + 0.2;
    return smoothstep(0.12 - w, 0.12 + w, s);
  }
  float c = gFw * scale * 0.55;                                 // voronoi cells per pixel
  if (type == 3) {                                              // spots — solid, soft-edged blotches
    // One blotch per cell, its edge roughened by a band-limited wobble. (Rings drawn at radii of their
    // own through the body were cut by the skin wherever they fell: open rings and doubled rings — the
    // letters C, O and 8, coffee-cup stains, stamped over the animal; and a paler middle in every
    // blotch kept a fawn's dapples rings still.)
    vec2 F = voronoi(p * scale * 0.55);
    float n = fbmA(p * scale * 1.6, scale * 1.6);
    float v = F.x + (n - 0.5) * 0.16;
    return mix(0.12, 1.0 - smoothstep(0.24 - c, 0.32 + c, v), 1.0 - smoothstep(0.25, 0.6, c));
  }
  if (type == 4) {                                              // ocelli — concentric eye-spots (peacock)
    // An eye-spot is a figure ON the skin — a dark pupil, a pale gap, a ring — so it is measured in
    // the skin: from each cell's centre laid flat on it (gNb is the skin's own normal). A centre deep
    // under the skin fades out. (Measured through the body, the skin cut every one at its own depth:
    // most showed as an empty ring of some size or other, a few as a bare dot.)
    c = gFw * scale * 0.5;
    vec3 q = p * scale * 0.5;
    vec3 ip = floor(q);
    vec3 fp = q - ip;
    float mark = 0.0;
    for (int k = -1; k <= 1; k++)
    for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec3 g = vec3(float(i), float(j), float(k));
      vec3 d = g + 0.25 + 0.5 * hash33(ip + g) - fp;
      float dn = dot(d, gNb);
      float rho = sqrt(max(dot(d, d) - dn * dn, 0.0));
      float pupil = 1.0 - smoothstep(0.1 - c, 0.15 + c, rho);
      float ring = smoothstep(0.06 + c, 0.0, abs(rho - 0.32));
      mark = max(mark, (1.0 - smoothstep(0.22, 0.42, abs(dn))) * max(pupil, ring * 0.9));
    }
    return mix(0.12, mark, 1.0 - smoothstep(0.25, 0.6, c));
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

// --- an imbricated coat ---------------------------------------------------------
// Overlapping scallops laid along a direction: a bird's contour feathers, roof tiles. Every cell of a
// grid roots one scallop — a ball, stretched a little along the lay, whose height ramps up from its
// root end to its tip — and the HIGHEST scallop over a point is the one that shows. So every tip lies
// over the roots of the scallops behind it and ends there in a round edge: rows of soft arcs, each
// shadowed where it lies on the next. (A cell per feather with straight borders, each sloped back,
// was a crazed glaze of little polygons — scales or cobbles, never plumage.)
// The grid is sheared: each layer along z stands half a cell across from the last, in x and in y, so
// the scallops fall in a quincunx on the back and on a flank alike. fw is a pixel's width in cells.
// Returns the coat's height at q, 0..1, and how near q is to the midline of the scallop that shows.
float scallops(vec3 q, vec3 lay, vec3 nrm, float fw, out float shaft) {
  vec3 qs = vec3(q.x + 0.5 * q.z, q.y + 0.5 * q.z, q.z);
  vec3 ip = floor(qs);
  vec3 fp = qs - ip;
  float soft = 0.1 + fw;
  float top = 0.0;
  float ta = 0.0;
  vec3 td = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 ds = fp - g - 0.5 - (hash33(ip + g) - 0.5) * 0.16;
    vec3 d = vec3(ds.x - 0.5 * ds.z, ds.y - 0.5 * ds.z, ds.z); // (unsheared: true distances)
    float along = dot(d, lay);
    // across² + (along / 1.15)²: a scallop is a little longer than it is wide
    float ell = sqrt(max(dot(d, d) - along * along * 0.2439, 0.0));
    float h = (0.5 + 0.51 * along) * (1.0 - smoothstep(0.85 - soft, 0.85, ell));
    if (h > top) { top = h; ta = along; td = d; }
  }
  // the top scallop's midline, measured in the skin: a feather's shaft
  vec3 side = td - lay * ta;
  side -= nrm * dot(side, nrm);
  shaft = 1.0 - smoothstep(0.015, 0.06 + fw, length(side));
  return clamp(top, 0.0, 1.0);
}

// --- a cut stone's faces -------------------------------------------------------
// Space divided into tetrahedra (a simplex grid): every corner of the grid takes a height of its own,
// and the height inside a tetrahedron is the flat blend of its four corners. So the height is FLAT
// across each face a surface cuts through a tetrahedron (one slope: the face catches the light as
// one plane), CONTINUOUS everywhere (no step for a bump to draw as a line) and creased where faces
// meet. Also gives the tetrahedron's own shade (id, 0..1) and how near the point is to its nearest
// wall (0 on the wall; in the tetrahedron's barycentric units).
float facets(vec3 q, out float id, out float wall) {
  vec3 qs = q + dot(q, vec3(1.0 / 3.0));                        // (skewed: the grid's cubes)
  vec3 s = floor(qs);
  vec3 u = qs - s;
  vec3 e = step(u.yzx, u);
  vec3 i1 = e * (1.0 - e.zxy);                                  // the largest of u's three …
  vec3 i2 = 1.0 - e.zxy * (1.0 - e);                            // … and its two largest
  float ua = dot(u, i1);
  float uc = dot(u, 1.0 - i2);
  float ub = u.x + u.y + u.z - ua - uc;
  vec4 wt = vec4(1.0 - ua, ua - ub, ub - uc, uc);               // weights of the tetrahedron's corners
  id = hash13(s * 1.7 + i1 * 3.1 + i2 * 5.3 + 0.37);
  wall = min(min(wt.x, wt.y), min(wt.z, wt.w));
  return dot(wt, vec4(hash13(s), hash13(s + i1), hash13(s + i2), hash13(s + 1.0)));
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
  if (cover == 1) {                                             // scales — imbricated, laid back
    // A fish's scales, a snake's, a lizard's: small round-edged scallops shingled toward the tail, each
    // lying on the roots of the ones behind (see scallops). (A cell per scale with straight borders
    // was a fine crazing that read as rough skin; larger, a tortoiseshell of polygons.)
    float mid;
    float lay = mix(0.66, scallops(p * 17.0, gLay, gNb, gFw * 17.0, mid), aaW(17.0));
    gHb = lay * 0.006;
    return clamp(0.8 - lay * 0.55, 0.0, 1.0);
  }
  if (cover == 2) {                                             // fur — clumped pile, locks, streaks
    float clumps = fbmA(vec3(p.x * 5.0, p.y * 5.0, p.z * 2.4), 5.0);
    // locks of hair laid back along the body: the grain that still reads once the strands are
    // smaller than a pixel (the shells fade out there and the coat carries the look)
    float locks = fbmA(vec3(p.x * 10.0, p.y * 10.0, p.z * 2.2), 10.0);
    float streak = fbmA(vec3(p.x * 22.0, p.y * 22.0, p.z * 5.0), 22.0);
    gHb = clumps * 0.018 + locks * 0.007 + streak * 0.004;
    return clumps * 0.4 + locks * 0.32 + streak * 0.28;
  }
  if (cover == 3) {                                             // feathers — imbricated, laid back
    // Contour feathers: overlapping scallops laid along the body (see scallops), each a little under
    // a tenth of a body unit long — a bird's head wears a dozen across, not five polygons — and down
    // the middle of each, seen close, the fine pale line of its shaft.
    float barbs = fbmA(vec3(p.x * 40.0, p.y * 40.0, p.z * 9.0), 40.0);
    float shaft;
    float lay = mix(0.66, scallops(p * 13.0, gLay, gNb, gFw * 13.0, shaft), aaW(13.0));
    // A bird's head and its underside are smooth plumage; the feathers' edges show on its back and
    // its wings. (Scalloped evenly all over, each feather's edge in shadow, it wore fish scales.)
    float plain = smoothstep(0.1, -0.6, gNb.y) * 0.7;
    if (uHeadA.w > 0.0) {
      vec3 hab = uHeadB - uHeadA.xyz;
      float ht = clamp(dot(vBodyPos - uHeadA.xyz, hab) / max(dot(hab, hab), 1e-6), 0.0, 1.0);
      plain = max(plain, 1.0 - smoothstep(uHeadA.w * 1.0, uHeadA.w * 1.6, length(vBodyPos - uHeadA.xyz - hab * ht)));
    }
    lay = mix(lay, 0.66, plain * 0.85);
    shaft *= aaW(50.0) * (1.0 - plain);
    gHb = lay * 0.0075 + (barbs - 0.5) * 0.001 + shaft * 0.0012;
    // (gH reads as a RECESS for the grime and roughness: where a feather comes out from under the
    // one in front is where the shadow sits; its tip is clean — a soft shadow, not an outline)
    return clamp(0.82 - lay * 0.42 + (barbs - 0.5) * 0.05 - shaft * 0.18, 0.0, 1.0);
  }
  if (cover == 4) {                                             // chitin — a smooth lacquered cuticle
    // Hard and glossy: a faint undulation and fine punctures, no seam network. (Voronoi grooves drew a
    // tortoiseshell over every beetle and spider; an arthropod's plates are its body SEGMENTS, which
    // the geometry already carries.)
    float swell = fbmA(p * 2.2, 2.2);
    float pits = fbmA(p * 26.0, 26.0);
    float h = 0.62 + (swell - 0.5) * 0.25 - smoothstep(0.62, 0.8, pits) * 0.18 * aaW(26.0);
    gHb = swell * 0.006 - smoothstep(0.62, 0.8, pits) * 0.0012 * aaW(26.0);
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
  if (cover == 7 && uCut > 0.5) {                               // crystal, its skin already cut
    // the geometry's own flat faces carry the cut; cut again here, at other places, the two sets of
    // faces showed through each other — torn patches, two skins flickering. Each face takes a shade
    // of its own: on a face its normal is the same at every corner, so it neither varies across the
    // pixel nor between the face's pixels, and hashes to one value. (The uncut legs and face, whose
    // normals vary, stay the stone's own tone.)
    // The narrow bevels between faces, where the normal swings from one face's to the next within a
    // pixel or two, are the cut's EDGES: they catch the light as bright lines. (A curved, uncut skin
    // turns its normal far more slowly than that.)
    // (the face's own normal — the triangle's, from the body-space position's slopes — one value across
    // the face, and turned to the outside)
    vec3 fn = normalize(cross(dFdx(vBodyPos), dFdy(vBodyPos)));
    if (dot(fn, vBNrm) < 0.0) fn = -fn;
    float bend = length(fwidth(fn));
    float planar = 1.0 - smoothstep(0.0, 0.03, bend);
    gFacet = mix(0.5, hash13(floor(fn * 5.0 + 0.5) + 3.0), planar);
    gSeam = smoothstep(0.05, 0.16, bend);
    gHb = 0.0;
    return 0.3;
  }
  if (cover == 7) {                                             // crystal — cut facets
    // A cut stone: flat faces, each tilted its own way, meeting in sharp edges — see facets(). One
    // grid alone is a regular net of triangles (a wire mesh drawn over the body); so the stone is cut
    // TWICE, at two angles and two sizes, and the higher cut shows. The higher of two reliefs that are
    // each flat-faced and continuous is flat-faced and continuous too, and where one cut passes under
    // the other is a new edge at an angle of its own: faces of every shape and size.
    // (Cells with a plane each, tilted at random, cannot meet their neighbours: bevelled down to a
    // common floor they were a mosaic of rounded pebbles, each in a dark gutter.)
    float idA, idB, wallA, wallB;
    float hA = facets(p * 1.9, idA, wallA);
    vec3 pr = vec3(dot(p, vec3(0.36, 0.48, -0.8)), dot(p, vec3(-0.8, 0.6, 0.0)), dot(p, vec3(0.48, 0.64, 0.6)));
    float hB = facets(pr * 2.7 + 11.3, idB, wallB);
    float top = step(hB, hA);
    gFacet = mix(idB, idA, top);
    float w = aaW(6.5);
    // the cut edge (in body units, near enough): the nearest wall of the face's own tetrahedron, or
    // the line where the two cuts cross
    float d = min(mix(wallB / 5.4, wallA / 3.8, top), abs(hA - hB) * 0.4);
    gSeam = (1.0 - smoothstep(0.0, 0.006 + gFw, d)) * w;
    gHb = max(hA, hB) * 0.11 * w;
    return 0.3;                                                 // (no grime: a crystal has no recesses)
  }
  // skin — fine wrinkle-and-pore relief
  float pores = fbmA(p * 6.0, 6.0);
  float wrinkle = ridgedA(p * vec3(3.0, 9.0, 3.0), 9.0);
  gHb = pores * 0.008 + wrinkle * 0.006;
  return pores * 0.22 + wrinkle * 0.12;
}
`;
