/**
 * Renders a Phenotype and gives it life (DESIGN §6.3/§6.4, M5 motion).
 *
 * The body is a capsule-union skinned with the shared countershaded material, plus
 * features (eyes, mouth, feet, claws, fins), rendered in the static rest pose grow() produced.
 *
 * There is no idle animation: the procedural undulation/gait pass was removed deliberately — it
 * read as wobble rather than life and obscured the silhouette. The ONLY thing that moves a
 * creature now is playback of a physics-recorded gait (M6), which re-poses the nodes from the
 * recorded trajectory. Pure viewer concern either way: grow() stays static and deterministic.
 */
import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FlightContext } from './flight';
import { blinkAt, LidContext } from './eyelids';
import { legBearer, pointedLegs, type Phenotype } from '../engine/grow';
import { unitHash } from '../engine/rng';
import { buildMeshData, type MeshFeature } from './meshData';
import { scutePlan, scuteGeometries } from './scutes';
import { eyeVariant, earVariant } from './partStyles';
import { earGeometry } from './ear';
import { Mouth } from './mouths';
import type { Carve } from './bodyField';
import type { SkinSurface } from './mouthLine';
import { makeCreatureMaterial } from './creatureMaterial';
import { bareOf, clawedHandGeometry, footPlanOf, isHindFoot, isTheropod, lastLinkOf, partWeights, ratLike, toedFootGeometry, TALONED, type FootPlan } from './feet';
import { shankColor } from './keratin';
import { buildSmoothGeometry, buildShellGeometry, type SkinQuality } from './smoothSkin';
import { buildFeatheredWing, buildFoldedMembraneWing, buildMembraneWing, buildSpreadFeatheredWing, buildTailFan, conformToSurface, buildFin, finChord, finCutOf, finGirth, finKindOf, finScaleOf, longWingFold, trunkGirth, wingCarriage, LONG_WING, type FinBuild } from './wings';
import { ensureSkinWeights, flightLevel, type RigInstance } from './rig';
import { fieldAt, projectToSurface, qRotateV } from './bodyField';
import { BROW_TILT, bulgingEye, eyeClearings, eyeSeat, eyeTilt, isSwimmer } from './eyeSeat';
import { coatDark, coatFin, coatMain, coatPattern } from './palette';
import { browRidgeGeometry, faceMaskOf, headMaskOf, isApe } from './face';
import { apeFootGeometry, fistGeometry } from './apeLimbs';
import { clawGeometry, wristQuat } from './claw';
import { hornGeometry } from './horn';
import { shardGeometry } from './shards';
import { facetKeep, facetSizeOf, facetSkin } from './facets';
import { quillGeometry } from './quills';
import { frillGeometry, frillPlan } from './frill';
import { getGeometry, retainGeometry, releaseGeometry, hasGeometry } from './geometryCache';
import { drawnMouths, mouthCarves, surfacePrims } from './mouthLine';
import { gillCutOf, gillGeometry, gillMarks, gillRadiusOf } from './gills';
import { sampleTrajectory, type Trajectory } from '../physics/fitness';
import type { SkinMode } from '../ui/store';

const UP = new THREE.Vector3(0, 1, 0);

// Curated iris palette: [hue, sat, light], weighted so warm animal eyes (amber/gold/green/copper)
// are common and striking colours (blue/red/violet/pale) are a rarer accent. Deterministic per
// creature so a seed always regrows the same eyes.
const IRIS_PALETTE: [number, number, number, number][] = [
  // weight, hue, sat, light
  [5, 0.09, 0.9, 0.34], // amber
  [5, 0.13, 0.85, 0.4], // gold
  [4, 0.28, 0.6, 0.3], // green
  [3, 0.07, 0.95, 0.3], // copper/orange
  [3, 0.15, 0.55, 0.5], // pale yellow
  [2, 0.55, 0.75, 0.4], // ice blue
  [1.4, 0.62, 0.85, 0.32], // deep blue
  [1.2, 0.98, 0.8, 0.32], // blood red
  [1, 0.78, 0.55, 0.34], // violet
  [1, 0.0, 0.0, 0.12], // near-black
];
// An animal's eye (round or beady) is one of the natural colours: dark brown above all (most mammals'
// and most birds'), amber, hazel, gold, a cat's green, a rare pale blue; never the accents above (a
// violet- or blood-eyed dog read as a toy, or a demon). An alien's glowing eye keeps the full palette.
const NATURAL_IRIS: [number, number, number, number][] = [
  // weight, hue, sat, light
  [6, 0.07, 0.6, 0.16], // dark brown
  [4, 0.08, 0.7, 0.24], // brown
  [4, 0.09, 0.9, 0.34], // amber
  [2, 0.11, 0.55, 0.3], // hazel
  [2, 0.13, 0.85, 0.4], // gold
  [1.5, 0.27, 0.55, 0.3], // green
  [1, 0.55, 0.6, 0.45], // pale blue
  [1.5, 0.0, 0.0, 0.1], // near-black
];
export function irisFor(seed: number, natural = false): number {
  const palette = natural ? NATURAL_IRIS : IRIS_PALETTE;
  const total = palette.reduce((t, e) => t + e[0], 0);
  // two independent hashes: one picks the swatch, one jitters hue/sat a touch for within-type variety
  let r = unitHash(seed, 0x1e5) * total;
  let e = palette[0];
  for (const c of palette) {
    r -= c[0];
    if (r <= 0) { e = c; break; }
  }
  const j = (unitHash(seed, 0x2e5) - 0.5) * 0.05;
  return new THREE.Color().setHSL((e[1] + j + 1) % 1, e[2], e[3]).getHex();
}

// stable empty carve list for the capsule kit — the mouth builds must trace the PRISTINE surface
// when the carved one isn't rendered (a lip traced onto an invisible cavity is a buried lip)
const NO_CARVES: readonly Carve[] = [];

// Dev/headless: ?hide=mouth,eye,… suppresses feature types — for bisecting a rendering artefact.
const DEV_HIDE: ReadonlySet<string> =
  import.meta.env?.DEV && typeof location !== 'undefined'
    ? new Set((new URLSearchParams(location.search).get('hide') ?? '').split(',').filter(Boolean))
    : new Set();

/** Bake an `aBodyPos` attribute = `matrix · localVertex` (the vertex's rest-pose body position).
 *  Also zero-fills `aFlesh` — only the carved smooth skin has real mouth-cavity weights, but the
 *  extended material reads the attribute on every body geometry, so it must always exist. */
function bakeBodyPos(geo: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    arr[i * 3] = v.x;
    arr[i * 3 + 1] = v.y;
    arr[i * 3 + 2] = v.z;
  }
  geo.setAttribute('aBodyPos', new THREE.BufferAttribute(arr, 3));
  geo.setAttribute('aFlesh', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  geo.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
}

export type Detail = 'full' | 'lite' | 'none';

/** The geometry cache's key for a skin (the World's skin scheduler builds ahead under the same key). */
export const skinKey = (full: boolean, quality: SkinQuality, carved = true) => `${full ? 'hybrid' : 'smooth'}:${quality}${carved ? '' : ':intact'}`;

function buildSkin(phenotype: Phenotype, full: boolean, carves: readonly Carve[], quality: SkinQuality): THREE.BufferGeometry {
  const g = buildSmoothGeometry(phenotype, full, carves, quality);
  // a crystal hide is cut into flat faces, outline and all (facets.ts)
  if (phenotype.genomeRef.covering.type === 'crystal') facetSkin(g, facetSizeOf(phenotype), phenotype.genomeRef.seed, facetKeep(phenotype, g));
  // smooth mesh is untransformed, so its local position *is* the body-space coord (M17)
  g.setAttribute('aBodyPos', (g.getAttribute('position') as THREE.BufferAttribute).clone());
  bakeLegs(g, phenotype);
  return g;
}

/** The bare-part gate (aLeg) for a body geometry with baked aBodyPos — only for a creature with bare
 *  shanks or a naked tail (bareOf); a geometry without it reads 0 (not bare) in the shader. */
function bakeLegs(g: THREE.BufferGeometry, phenotype: Phenotype): void {
  const b = bareOf(phenotype);
  if (!b) return;
  const bp = g.getAttribute('aBodyPos') as THREE.BufferAttribute | undefined;
  if (!bp) return;
  g.setAttribute('aLeg', new THREE.BufferAttribute(partWeights(phenotype, bp.array, bp.count, b.kind), 1));
}

/** The geometry cache's key for a carapace shell (turtle, crab, beetle) at a fineness. */
export const shellKey = (quality: SkinQuality) => `shell:${quality}`;

const hasCarapace = (phenotype: Phenotype) => phenotype.nodes.some((n) => n.terminal === 'carapace');

/** A creature's carapace shell, built once per fineness and shared (an empty geometry where the body
 *  gives the shell nothing to cover). */
function shellGeometry(phenotype: Phenotype, quality: SkinQuality): THREE.BufferGeometry {
  return getGeometry(phenotype, shellKey(quality), () => {
    const g = buildShellGeometry(phenotype, quality);
    if (!g) return new THREE.BufferGeometry();
    g.setAttribute('aBodyPos', (g.getAttribute('position') as THREE.BufferAttribute).clone());
    return g;
  });
}

/** The fineness of a carapace shell that is already built — the asked one, else any — or null. (The
 *  World's stand-in kit draws a shell only if one is; it never builds one inside a render.) */
export function builtShell(phenotype: Phenotype, quality: SkinQuality): SkinQuality | null {
  return ([quality, 'far', 'low', 'high'] as const).find((q) => hasGeometry(phenotype, shellKey(q))) ?? null;
}

/**
 * Build (and cache) everything a creature's smooth skin needs, ahead of mounting it — the World
 * schedules these within a time budget each frame, so a burst of new genomes never stalls rendering.
 * Same keys and builders as CreatureMesh, which then finds it all ready: the surface, its carapace
 * shell where it has one, and (`rigged`) the skin weights that bind the surface to a skeleton —
 * between them a third to a half again of the surface's own cost, which a render used to pay.
 */
export function prebuildSkin(phenotype: Phenotype, mode: 'smooth' | 'hybrid', quality: SkinQuality, carved = true, rigged = false): void {
  const full = mode === 'hybrid';
  const geo = getGeometry(phenotype, skinKey(full, quality, carved), () =>
    buildSkin(phenotype, full, carved ? mouthCarves(phenotype) : NO_CARVES, quality),
  );
  if (rigged) ensureSkinWeights(geo, phenotype);
  if (hasCarapace(phenotype)) shellGeometry(phenotype, quality);
}

export function CreatureMesh({
  phenotype,
  skinMode = 'capsules',
  trajectory = null,
  quality = 'high',
  rig = null,
  detail = 'full',
  carved = true,
  fur = false,
  lazyShell = false,
}: {
  phenotype: Phenotype;
  skinMode?: SkinMode;
  trajectory?: Trajectory | null;
  quality?: SkinQuality;
  /** level of detail (World): 'full' everything · 'lite' drops tiny features (teeth/mouth parts, toes,
   *  whiskers, gills) and simplifies eyes · 'none' keeps only silhouette parts (wings, fins, horns, crests) */
  detail?: Detail;
  /** an animation rig (World): the smooth skin becomes a SkinnedMesh on its skeleton and every
   *  feature rides its node's bone. Ignored by the capsule kit. */
  rig?: RigInstance | null;
  /** carve the mouth cavity into the smooth skin (the rest pose). An articulated jaw (World) wants
   *  intact skin: the static cavity would show beneath a mouth that closes. */
  carved?: boolean;
  /** shell fur over a furred coat (close-up views: a dozen extra passes of the body) */
  fur?: boolean;
  /** draw the carapace shell only if one is already built, never build it in this render (the World's
   *  stand-in kit: the scheduler builds the shell with the skin the body is waiting for) */
  lazyShell?: boolean;
}) {
  const data = useMemo(() => buildMeshData(phenotype), [phenotype]);
  // a myriapod stands on the points of its legs: they are the last of each leg, kept at any distance
  // its legs are (dropped with the other claws, every leg ended in the air)
  const pointed = useMemo(() => pointedLegs(phenotype.genomeRef), [phenotype]);
  const pal = phenotype.genomeRef.palette;
  const cov = phenotype.genomeRef.covering;
  const seed = phenotype.genomeRef.seed;

  const face = useMemo(() => faceMaskOf(phenotype), [phenotype]);
  const headMask = useMemo(() => headMaskOf(phenotype), [phenotype]);
  const bodyMat = useMemo(() => makeCreatureMaterial(pal, cov, seed, bareOf(phenotype)?.bare ?? null, null, face, 0, headMask), [pal, cov, seed, phenotype, face, headMask]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);
  // a crystal's smooth skin is cut into faces (buildSkin), and its material cuts none of its own
  const cutMat = useMemo(() => (cov.type === 'crystal' ? makeCreatureMaterial(pal, cov, seed, bareOf(phenotype)?.bare ?? null, null, face, 0, headMask, true) : null), [pal, cov, seed, phenotype, face, headMask]);
  useEffect(() => () => cutMat?.dispose(), [cutMat]);
  const skinMat = cutMat ?? bodyMat;
  // shell fur: FUR_SHELLS layers of the body out to a pile scaled to the creature
  const furMats = useMemo(() => {
    if (!fur || cov.type !== 'fur' || skinMode === 'capsules') return [];
    const { min, max } = phenotype.bounds;
    const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const len = Math.min(0.08, Math.max(0.022, size * 0.0095));
    const bare = bareOf(phenotype)?.bare ?? null;
    const eyes = eyeClearings(phenotype, data.features);
    return Array.from({ length: FUR_SHELLS }, (_, i) => makeCreatureMaterial(pal, cov, seed, bare, { h: (i + 1) / FUR_SHELLS, len, density: 3.2 / len, eyes }, face, 0, headMask));
  }, [fur, cov, skinMode, phenotype, pal, seed, data, face, headMask]);
  useEffect(() => () => furMats.forEach((m) => m.dispose()), [furMats]);

  // physics playback (post-roadmap): when a recorded gait is present, capsules re-pose from it
  // each frame — so the body must be the capsule kit (the smooth mesh is static), and it animates.
  const showSmooth = skinMode !== 'capsules' && !trajectory;
  const full = skinMode === 'hybrid'; // hybrid meshes every part; smooth just the locomotor body

  // mouth overhaul: the cavity carves — subtracted from the smooth skin so the maw is a true
  // recess, and shared with the mouth builds so lips/teeth land on the same carved rim.
  const carves = useMemo(() => (carved ? mouthCarves(phenotype) : NO_CARVES), [phenotype, carved]);

  // M15: one organic surface over the node field, built once (only when toggled on). The
  // smooth body is static, so motion is paused while it's shown (re-meshing per frame is dear).
  // Shared through the geometry cache: the Studio shows one creature in five viewports at once.
  const smoothKey = skinKey(full, quality, carved);
  const smoothGeo = useMemo(() => {
    if (!showSmooth) return null;
    return getGeometry(phenotype, smoothKey, () => buildSkin(phenotype, full, carves, quality));
  }, [showSmooth, full, phenotype, carves, quality, smoothKey]);
  useEffect(() => {
    if (!smoothGeo) return;
    retainGeometry(phenotype, smoothKey);
    return () => releaseGeometry(phenotype, smoothKey);
  }, [smoothGeo, phenotype, smoothKey]);
  // a conforming carapace shell (turtle / crab), built from the trunk's own field — shared + cached
  // like the skin. Drawn in every skin mode: it is a separate solid, not part of the body field.
  const hasShell = useMemo(() => hasCarapace(phenotype), [phenotype]);
  // (a World body still waiting for its first skin draws its kit bare-backed for those few frames:
  // building a shell here stalled the render that mounted it — 7 ms, 27 at the worst — and where the
  // skin then came at another fineness, that shell was thrown away and later built again)
  const shellQ = useMemo(() => (!hasShell ? null : lazyShell ? builtShell(phenotype, quality) : quality), [hasShell, lazyShell, phenotype, quality]);
  const shellGeo = useMemo(() => (shellQ ? shellGeometry(phenotype, shellQ) : null), [shellQ, phenotype]);
  useEffect(() => {
    if (!shellGeo || !shellQ) return;
    const key = shellKey(shellQ);
    retainGeometry(phenotype, key);
    return () => releaseGeometry(phenotype, key);
  }, [shellGeo, phenotype, shellQ]);
  // the shell wears hard scutes: plates (turtle) or the body's own chitin (crab), with a bold
  // reticulate seam pattern. A turtle's is a darker, browner horn than the leathery skin that comes
  // out from under it — in the body's own tone the dome had no edge and the scutes ran on over the
  // head and legs.
  const shellMat = useMemo(() => {
    if (!hasShell) return null;
    const crab = cov.type === 'chitin';
    // a BEETLE's wing-cases (a chitin shell over an arthropod's abdomen) wear the body's own coat and
    // markings — a ladybird's spots, a tiger beetle's bands — glossier, split by the dark seam where
    // the two cases meet; a crab's carapace keeps its seamed plates
    if (crab && tagmata(phenotype)) {
      return makeCreatureMaterial(pal, { ...cov, sheen: Math.min(1, cov.sheen + 0.15) }, seed ^ 0x5e11, null, null, null, trunkGirth(phenotype) * 0.07);
    }
    const hueA = crab ? pal.hueA : pal.hueA + (0.09 - pal.hueA) * 0.45;
    const shellPal = crab
      ? { ...pal, light: pal.light * 0.82, sat: pal.sat * 0.9, hueB: pal.hueA }
      : { ...pal, hueA, hueB: hueA - 0.02, light: pal.light * 0.66, sat: pal.sat * 0.85 };
    const shellCov = {
      ...cov,
      type: cov.type === 'chitin' ? ('chitin' as const) : ('plates' as const),
      pattern: 'reticulate' as const,
      patternScale: 2.4,
      patternContrast: 0.55,
    };
    return makeCreatureMaterial(shellPal, shellCov, seed ^ 0x5e11);
  }, [hasShell, pal, cov, seed, phenotype]);
  useEffect(() => () => shellMat?.dispose(), [shellMat]);

  const playing = !!trajectory; // the recorded physics gait is the only motion left

  const footColor = useMemo(
    () => coatDark(pal).getHex(),
    [pal],
  );
  const finColor = useMemo(() => coatFin(pal).getHex(), [pal]);
  // Iris color — deterministic per creature (from its seed), drawn from a curated eye palette rather
  // than tied to the body hue (which gave every animal an eye a shade off its own coat). Warm animal
  // colors dominate; striking blues/reds/violets appear as a minority, so eye colour is a real point
  // of variety without every creature reading as a clown.
  // (an ape's eyes are a warm dark brown — the curated palette's yellow-greens read as a cat's)
  // (an animal's eye — round or beady — is a natural colour; an alien's glowing one may be any)
  const animalEye = useMemo(() => {
    const eye = data.features.find((f) => f.type === 'eye');
    const v = eye ? eyeVariant(eye.style) : 'round';
    return v === 'round' || v === 'beady';
  }, [data]);
  const irisColor = useMemo(
    () => (isApe(phenotype) ? new THREE.Color().setHSL(0.07 + 0.03 * unitHash(seed, 0xa9e), 0.55, 0.12).getHex() : irisFor(seed, animalEye)),
    [seed, phenotype, animalEye],
  );

  // scratch buffer the trajectory sampler writes each played-back frame into
  const animScratch = useMemo(() => new Float32Array(data.nodes.length * 3), [data]);

  // base capsule transforms for the initial (pre-animation) frame
  const baseCaps = useMemo(() => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    return data.edges.map((e) => {
      a.fromArray(data.nodes[e.a].pos);
      b.fromArray(data.nodes[e.b].pos);
      dir.subVectors(b, a);
      const len = Math.max(dir.length(), 1e-3);
      dir.divideScalar(len);
      q.setFromUnitVectors(UP, dir);
      return {
        len,
        pos: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2] as [number, number, number],
        quat: [q.x, q.y, q.z, q.w] as [number, number, number, number],
      };
    });
  }, [data]);

  // M17: body geometries with a baked `aBodyPos` attribute (the vertex's rest-pose / body-space
  // position) so the covering shader can weld the texture to the skin even as the mesh animates.
  const sphereGeos = useMemo(() => {
    const m = new THREE.Matrix4();
    const rs = new THREE.Matrix4();
    const zero = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    return data.bodySpheres.map((i) => {
      const n = data.nodes[i];
      const g = new THREE.SphereGeometry(n.radius, 18, 14);
      // an anisotropic node (a shaped head, a flat body) bakes its local-frame ellipsoid scale +
      // orientation into the sphere, so the silhouette reads as a wedge/dome/slab — not a round ball.
      // Baked before aBodyPos so the covering shader still welds to the deformed rest surface.
      if (n.scale && n.quat) {
        g.applyMatrix4(rs.compose(zero, qq.fromArray(n.quat), sc.fromArray(n.scale)));
      }
      const p = n.pos;
      bakeBodyPos(g, m.makeTranslation(p[0], p[1], p[2]));
      bakeLegs(g, phenotype);
      return g;
    });
  }, [data, phenotype]);
  const capsuleGeos = useMemo(() => {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    return data.edges.map((e, k) => {
      const g = new THREE.CapsuleGeometry(e.radius, baseCaps[k].len, 6, 14);
      bakeBodyPos(g, m.compose(p.fromArray(baseCaps[k].pos), qq.fromArray(baseCaps[k].quat), one));
      bakeLegs(g, phenotype);
      return g;
    });
  }, [data, baseCaps, phenotype]);
  // A static kit (no recorded gait to play) is ONE merged mesh — the capsule kit is ~20–60 parts, and
  // as separate meshes it cost a draw call each (the World's fallback while smooth skins build).
  const kitGeo = useMemo(() => {
    // a playing gait re-poses the individual parts every frame; a smooth skin replaces the kit
    if (trajectory || showSmooth) return null;
    const parts: THREE.BufferGeometry[] = [];
    data.bodySpheres.forEach((i, k) => {
      const g = sphereGeos[k].clone();
      g.translate(data.nodes[i].pos[0], data.nodes[i].pos[1], data.nodes[i].pos[2]);
      parts.push(g);
    });
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    data.edges.forEach((_e, k) => {
      const g = capsuleGeos[k].clone();
      g.applyMatrix4(m.compose(p.fromArray(baseCaps[k].pos), qq.fromArray(baseCaps[k].quat), one));
      parts.push(g);
    });
    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    // (aLeg rides along from the parts)
    return merged;
  }, [trajectory, showSmooth, data, sphereGeos, capsuleGeos, baseCaps]);
  useEffect(() => () => kitGeo?.dispose(), [kitGeo]);
  useEffect(
    () => () => {
      sphereGeos.forEach((g) => g.dispose());
      capsuleGeos.forEach((g) => g.dispose());
    },
    [sphereGeos, capsuleGeos],
  );

  const sphereRefs = useRef<THREE.Mesh[]>([]);
  const capsuleRefs = useRef<THREE.Mesh[]>([]);
  const featureRefs = useRef<THREE.Object3D[]>([]);
  // truncate on creature change — the `if (el)` ref guards never clear, so without this a big
  // creature's detached meshes (and their CPU attribute arrays) outlive it in the tail slots
  useEffect(() => {
    sphereRefs.current.length = data.bodySpheres.length;
    capsuleRefs.current.length = data.edges.length;
    featureRefs.current.length = data.features.length;
  }, [data]);

  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame((st) => {
    if (!playing || !trajectory) return; // no gait recorded → the creature simply stands still
    const anim = sampleTrajectory(trajectory, st.clock.elapsedTime, animScratch);
    const { bodySpheres, edges, features } = data;

    if (import.meta.env.DEV) {
      // dev-only motion probe: the live played-back position of the last node
      const li = (data.nodes.length - 1) * 3;
      (window as unknown as { __cambrianAnim?: number[] }).__cambrianAnim = [
        +anim[li].toFixed(3),
        +anim[li + 1].toFixed(3),
        +anim[li + 2].toFixed(3),
      ];
    }

    for (let s = 0; s < bodySpheres.length; s++) {
      const i = bodySpheres[s];
      const m = sphereRefs.current[s];
      if (m) m.position.set(anim[i * 3], anim[i * 3 + 1], anim[i * 3 + 2]);
    }
    for (let e = 0; e < edges.length; e++) {
      const m = capsuleRefs.current[e];
      if (!m) continue;
      const { a: ia, b: ib } = edges[e];
      a.set(anim[ia * 3], anim[ia * 3 + 1], anim[ia * 3 + 2]);
      b.set(anim[ib * 3], anim[ib * 3 + 1], anim[ib * 3 + 2]);
      dir.subVectors(b, a);
      const len = dir.length() || 1e-3;
      dir.divideScalar(len);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.quaternion.copy(q.setFromUnitVectors(UP, dir));
    }
    for (let f = 0; f < features.length; f++) {
      const i = features[f].idx;
      const o = featureRefs.current[f];
      if (o) o.position.set(anim[i * 3], anim[i * 3 + 1], anim[i * 3 + 2]);
    }
  });

  // rigged (World): the shared smooth surface gains skin weights once, and each creature binds its own
  // skeleton to it. Bones are children of the skinned mesh ('attached' bind mode follows the actor).
  const rigged = !!rig && showSmooth && !!smoothGeo;
  const skinned = useMemo(() => {
    if (!rigged || !rig || !smoothGeo) return null;
    ensureSkinWeights(smoothGeo, phenotype);
    const sm = new THREE.SkinnedMesh(smoothGeo, skinMat);
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.add(rig.root);
    sm.bind(rig.skeleton, new THREE.Matrix4());
    // fur shells ride the same skeleton (children with an identity transform, so 'attached' binding
    // sees the same world matrix)
    for (const m of furMats) {
      const sh = new THREE.SkinnedMesh(smoothGeo, m);
      sh.bind(rig.skeleton, new THREE.Matrix4());
      sm.add(sh);
    }
    return sm;
  }, [rigged, rig, smoothGeo, skinMat, phenotype, furMats]);
  useEffect(
    () => () => {
      if (skinned && rig) skinned.remove(rig.root);
    },
    [skinned, rig],
  );
  // the shell rides the trunk bone nearest its middle
  const shellMount = useMemo(() => {
    if (!rig || !shellGeo) return null;
    const shell = phenotype.nodes.findIndex((n) => n.terminal === 'carapace');
    const par = rig.template.parent[shell];
    // the shell geometry is in body space; inside the bone it is offset by the bone's REST position
    const at = par >= 0 ? phenotype.nodes[par].pos : [0, 0, 0];
    return { bone: par >= 0 ? rig.bones[par] : rig.root, at };
  }, [rig, shellGeo, phenotype]);

  // an urchin's quills, one smooth cone each, root to point — all of them one mesh, kept at every
  // distance (they are its outline: without them it was a bare ball), riding the trunk
  const quillGeo = useMemo(() => quillGeometry(phenotype, detail === 'full' ? 8 : 5), [phenotype, detail]);
  useEffect(() => () => quillGeo?.dispose(), [quillGeo]);
  const quillColor = useMemo(() => coatDark(pal).getHex(), [pal]);
  const quillMount = useMemo(() => (rig && quillGeo ? { bone: rig.bones[0] ?? rig.root, at: phenotype.nodes[0].pos } : null), [rig, quillGeo, phenotype]);
  const quillNode = quillGeo ? (
    quillMount ? (
      createPortal(
        <mesh geometry={quillGeo} position={[-quillMount.at[0], -quillMount.at[1], -quillMount.at[2]]} castShadow>
          <meshStandardMaterial color={quillColor} roughness={0.38} metalness={0.05} />
        </mesh>,
        quillMount.bone,
      )
    ) : (
      <mesh geometry={quillGeo} castShadow>
        <meshStandardMaterial color={quillColor} roughness={0.38} metalness={0.05} />
      </mesh>
    )
  ) : null;

  // a crocodile's armour — rows of keeled scutes down the back and the crest of the tail — in the
  // skin's own material, each link's plates hung from that link (not drawn at a distance, nor on a
  // recorded gait's re-posed kit)
  const scuteSurface = showSmooth ? (full ? 'hybrid' : 'smooth') : 'kit';
  const armoured = detail !== 'none' && !trajectory;
  const scutes = useMemo(
    () => (armoured ? scuteGeometries(phenotype, scutePlan(phenotype, scuteSurface)) : []),
    [phenotype, armoured, scuteSurface],
  );
  useEffect(() => () => scutes.forEach((s) => s.geo.dispose()), [scutes]);
  const scuteNodes = scutes.map((s, k) =>
    skinned && rig ? (
      <group key={`sc${k}`}>{createPortal(<mesh geometry={s.geo} material={bodyMat} castShadow />, rig.bones[s.node])}</group>
    ) : (
      <mesh key={`sc${k}`} geometry={s.geo} material={bodyMat} position={data.nodes[s.node].pos} castShadow />
    ),
  );

  const featureNodes = data.features.map((f, k) => {
    if (detail !== 'full' && !keepAt(detail, f, cov.type === 'crystal') && !(detail === 'lite' && pointed && f.type === 'claw' && f.kind === 'leg')) return null;
    if (DEV_HIDE.has(f.type)) return null;
    const el = detail === 'lite' && f.type === 'eye' ? (
      <LiteEye f={f} iris={irisColor} />
    ) : (
      <Feature
        f={f}
        footColor={footColor}
        finColor={finColor}
        irisColor={irisColor}
        skin={bodyMat}
        phenotype={phenotype}
        carves={showSmooth ? carves : NO_CARVES}
        recessed={showSmooth && carves.length > 0}
        surface={showSmooth ? (full ? 'hybrid' : 'smooth') : 'kit'}
        lite={detail !== 'full'}
        fur={furMats}
      />
    );
    // rigged: the feature sits at its bone's origin (= its node at rest) and moves with it
    if (skinned && rig) return <group key={`f${k}`}>{createPortal(el, rig.bones[f.idx])}</group>;
    return (
      <group
        key={`f${k}`}
        ref={(o) => {
          if (o) featureRefs.current[k] = o;
        }}
        position={data.nodes[f.idx].pos}
      >
        {el}
      </group>
    );
  });

  if (skinned && rig) {
    return (
      <group>
        <primitive object={skinned} />
        {shellGeo && shellMat && shellMount &&
          createPortal(
            <mesh geometry={shellGeo} material={shellMat} position={[-shellMount.at[0], -shellMount.at[1], -shellMount.at[2]]} castShadow />,
            shellMount.bone,
          )}
        {featureNodes}
        {scuteNodes}
        {quillNode}
      </group>
    );
  }

  return (
    <group>
      {showSmooth && smoothGeo ? (
        // M15: a single welded organic surface replaces the capsule kit
        <>
          <mesh geometry={smoothGeo} material={skinMat} castShadow receiveShadow />
          {furMats.map((m, i) => (
            <mesh key={`fur${i}`} geometry={smoothGeo} material={m} receiveShadow />
          ))}
        </>
      ) : kitGeo ? (
        <mesh geometry={kitGeo} material={bodyMat} castShadow receiveShadow />
      ) : (
        <>
          {data.bodySpheres.map((i, s) => (
            <mesh
              key={`s${s}`}
              ref={(el) => {
                if (el) sphereRefs.current[s] = el;
              }}
              geometry={sphereGeos[s]}
              position={data.nodes[i].pos}
              material={bodyMat}
              castShadow
            />
          ))}
          {data.edges.map((_e, k) => (
            <mesh
              key={`c${k}`}
              ref={(el) => {
                if (el) capsuleRefs.current[k] = el;
              }}
              geometry={capsuleGeos[k]}
              position={baseCaps[k].pos}
              quaternion={baseCaps[k].quat}
              material={bodyMat}
              castShadow
            />
          ))}
        </>
      )}
      {shellGeo && shellMat && <mesh geometry={shellGeo} material={shellMat} castShadow receiveShadow />}
      {featureNodes}
      {scuteNodes}
      {quillNode}
    </group>
  );
}

// --- level of detail ----------------------------------------------------------------------------

/** Which features survive a reduced level of detail: the silhouette parts always (a wing, a fin, a
 *  horn reads from across the meadow); at 'lite' also the eyes (simplified), ears, pincers and tail
 *  weapons. Teeth/lips, toes, whiskers and gill slits are sub-pixel at a distance — dropped. */
function keepAt(detail: Detail, f: MeshFeature, crystal = false): boolean {
  // (a crystal body's back spines are its shards: as much its outline as a horn is)
  const silhouette = f.type === 'fin' || f.type === 'crest' || (f.type === 'claw' && (f.kind === 'horn' || (crystal && f.kind === 'spine')));
  if (detail === 'none') return silhouette;
  return silhouette || f.type === 'eye' || f.type === 'ear' || f.type === 'pincer' || f.type === 'club' || f.type === 'barb';
}

/** layers of shell fur in the close-up views */
const FUR_SHELLS = 12;

const LITE_BALL = new THREE.SphereGeometry(1, 10, 8);
const LITE_DARK = new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.15 });

/** A two-mesh eye for mid-distance: a glossy dark ball and an iris cap. */
function LiteEye({ f, iris }: { f: MeshFeature; iris: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <group quaternion={f.quat}>
      <mesh geometry={LITE_BALL} material={LITE_DARK} scale={r * 0.9} />
      <mesh geometry={LITE_BALL} position={[0, 0, r * 0.7]} scale={[r * 0.6, r * 0.6, r * 0.2]}>
        <meshStandardMaterial color={iris} roughness={0.2} />
      </mesh>
    </group>
  );
}

// Features render at the local origin of their (animated) parent group.
function Feature({
  f,
  footColor,
  finColor,
  irisColor,
  skin,
  phenotype,
  carves,
  recessed,
  surface,
  lite = false,
  fur = NO_FUR,
}: {
  f: MeshFeature;
  footColor: number;
  finColor: number;
  irisColor: number;
  skin: THREE.Material;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean;
  surface: SkinSurface;
  lite?: boolean; // reduced detail: structural spars (fin rays, wing bones) are dropped
  fur?: readonly THREE.Material[]; // the coat's fur shells, for the parts the coat runs onto (a paw)
}) {
  switch (f.type) {
    case 'eye':
      return <Eye f={f} socket={footColor} iris={irisColor} lid={finColor} seed={phenotype.genomeRef.seed} skin={skin} phenotype={phenotype} />;
    case 'mouth':
      // (one of a radial body's copies of its central maw: see drawnMouths)
      if (!drawnMouths(phenotype).has(f.idx)) return null;
      return (
        <Mouth f={f} dark={footColor} skin={skin} phenotype={phenotype} carves={carves} recessed={recessed} surface={surface} />
      );
    case 'pincer':
      return <Pincer f={f} color={footColor} skin={skin} origin={phenotype.nodes[f.idx].pos} />;
    case 'fin':
      return f.kind === 'wing' ? (
        <Wing f={f} color={finColor} phenotype={phenotype} lite={lite} />
      ) : f.kind === 'tail' && phenotype.genomeRef.covering.type === 'feathers' ? (
        <TailFan phenotype={phenotype} />
      ) : f.kind === 'frill' ? (
        <Frill f={f} color={finColor} phenotype={phenotype} />
      ) : (
        <Fin f={f} color={finColor} lite={lite} phenotype={phenotype} surface={surface} />
      );
    case 'claw': {
      // a crystal body's horns and back spines are clusters of shards (shards.ts)
      if ((f.kind === 'horn' || f.kind === 'spine') && phenotype.genomeRef.covering.type === 'crystal') {
        return <Shards f={f} palette={phenotype.genomeRef.palette} seed={phenotype.genomeRef.seed} />;
      }
      if (f.kind === 'horn') return <Horn f={f} color={footColor} seed={phenotype.genomeRef.seed} />;
      const reach = phenotype.nodes[f.idx].pos[1] - phenotype.bounds.min[1];
      if (f.kind === 'leg' && arthropodLegs(phenotype)) return <LegTip f={f} color={footColor} skin={skin} origin={phenotype.nodes[f.idx].pos} reach={reach} />;
      const plan = f.kind === 'leg' ? footPlanOf(phenotype) : null;
      return plan ? <ToedFoot f={f} plan={plan} skin={skin} phenotype={phenotype} /> : <Claw f={f} color={footColor} />;
    }
    case 'club':
      return <Club f={f} color={footColor} />;
    case 'barb':
      return <Barb f={f} color={footColor} />;
    case 'ear':
      return <Ear f={f} color={footColor} skin={skin} origin={phenotype.nodes[f.idx].pos} bare={ratLike(phenotype)} />;
    case 'gill':
      return <Gill f={f} color={footColor} phenotype={phenotype} surface={surface} />;
    case 'crest':
      return <Crest f={f} color={finColor} feathered={phenotype.genomeRef.covering.type === 'feathers'} />;
    case 'carapace':
      return null; // the conforming shell is drawn by CreatureMesh from the trunk field
    case 'whisker':
      return <Whisker f={f} color={footColor} />;
    case 'paw':
      return <Paw f={f} color={footColor} skin={skin} origin={phenotype.nodes[f.idx].pos} leg={f.kind === 'leg'} fur={fur} bare={f.kind === 'leg' && ratLike(phenotype)} />;
    case 'hoof':
      return <Hoof f={f} color={footColor} />;
    case 'hand':
      return isApe(phenotype) ? (
        <ApeLimb f={f} skin={skin} phenotype={phenotype} fist />
      ) : isTheropod(phenotype) ? (
        <ClawedHand f={f} skin={skin} phenotype={phenotype} />
      ) : (
        <Hand f={f} color={footColor} />
      );
    default:
      return f.kind === 'leg' && isApe(phenotype) ? <ApeLimb f={f} skin={skin} phenotype={phenotype} /> : <Foot f={f} color={footColor} />;
  }
}

// --- eyes (5 styles by `style`) — the emotional anchor -----------------------

// A lid: a hemisphere just outside the eyeball, rotated about the eye's X axis to open or close (its
// front rim is the lid margin; the back rim hides in the head). Shared unit geometries.
const UPPER_LID = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const LOWER_LID = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);

// open: the upper margin ~31° above the eye's equator, the lower ~36° below — an almond aperture
// (wider read as a startled stare); shut: they meet a little below centre
const LID_OPEN = { upper: -0.54, lower: 0.62 } as const;
const LID_SHUT = { upper: 0.16, lower: 0.1 } as const;
// …but an octopus's eye is round, open ~52° all about its bar of a pupil. (In the almond, the upper lid
// hid the top half of the iris from any view above it: a yellow half-disc with a dark bar along its top
// edge, under a skin hood — a gaping mouth.)
const LID_ROUND = { upper: -0.92, lower: 0.92 } as const;

// Iris and pupil: true spherical CAPS on the eyeball (a polar angle of the ball's own sphere), so
// they curve with it like a cornea — a flat squashed disc parked in front read as a painted coin.
// The iris darkens toward its rim, the limbal ring every real eye has. `squeezeX` narrows a cap
// across the eye while keeping it ON the sphere (a reptile's slit pupil).
const CAP_GEO = new Map<string, THREE.SphereGeometry>();
function capGeometry(theta: number, limbal: boolean, squeezeX = 1): THREE.SphereGeometry {
  const key = `${theta}:${limbal}:${squeezeX}`;
  let g = CAP_GEO.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(1, limbal ? 48 : 28, 10, 0, Math.PI * 2, 0, theta);
    g.rotateX(Math.PI / 2); // pole on +Z, the eye's aim
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      if (squeezeX !== 1) {
        const x = pos.getX(i) * squeezeX, y = pos.getY(i), z = pos.getZ(i);
        const n = Math.hypot(x, y, z);
        pos.setXYZ(i, x / n, y / n, z / n);
      }
      const a = Math.acos(Math.min(1, Math.max(-1, pos.getZ(i)))) / theta; // 0 centre … 1 rim
      const t = limbal ? Math.min(1, Math.max(0, (a - 0.62) / 0.38)) : 0;
      let k = 1 - 0.62 * t * t * (3 - 2 * t);
      if (limbal) {
        // fine radial fibres (a hashed brightness per spoke) and a paler collarette ring round the pupil
        const spoke = Math.round(((Math.atan2(pos.getY(i), pos.getX(i)) + Math.PI) / (Math.PI * 2)) * 48) % 48;
        k *= 0.84 + 0.22 * unitHash(spoke, 0x1e15) + 0.16 * Math.exp(-(((a - 0.5) / 0.1) ** 2));
      }
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(pos.array as Float32Array), 3)); // unit sphere: normal = position
    CAP_GEO.set(key, g);
  }
  return g;
}
/** a membrane wing folded at rest, against its open span: a dragon's folded wing is a great sail over
 *  its back (at the open span's scale, folded, it was a fan the size of the head) */
const MEMBRANE_FOLD = 1.35;
const REPTILE_IRIS = [0xb08a2e, 0xa8661f, 0x7d8a33, 0x9a4f24, 0x8f8a6e, 0xc2a046];
/** a cat's iris round its slit (a slit eye in a coat of fur): gold, amber, green, a pale copper, rarely a
 *  pale blue. (A reptile's russet on a cat glared like a demon's.) */
const CAT_IRIS = [0xd2a72c, 0xc8901f, 0x9aae3c, 0x7f9c3a, 0xc07b2c, 0xd2a72c, 0x9fbcc8];
const FISH_IRIS = [0xc9cdd2, 0xb9bfc4, 0xd2b062, 0xbf9a4a, 0xa9b49c];
/** a shark's iris (a swimmer in bare skin): dark all through, a slate or bottle-green glint at most.
 *  (A bony fish's silver or brass ring round a big pupil, on a grey shark, was a toy's googly eye.) */
const SHARK_IRIS = [0x2c3336, 0x283330, 0x34383a];
/** a frog's iris: gold, bronze, copper, an olive gold */
const FROG_IRIS = [0xc9a23a, 0xb8862e, 0xb06a2a, 0xa6a04a];

/** One eye's lids in the body's own covering: the shared hemispheres scaled to the eye, with the
 *  covering shader's body-space coordinates baked at the open pose (so the coat runs onto the lids
 *  and the eye sits in the face rather than in a coloured cup). Blinks rotate the meshes. */
function lidGeometry(base: THREE.BufferGeometry, scale: number, openX: number, sink: number, quat: readonly number[], origin: readonly number[]): THREE.BufferGeometry {
  const g = base.clone();
  g.scale(scale, scale, scale);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(origin[0], origin[1], origin[2]),
    new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]),
    new THREE.Vector3(1, 1, 1),
  )
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -sink))
    .multiply(new THREE.Matrix4().makeRotationX(openX));
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const body = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    body[i * 3] = v.x;
    body[i * 3 + 1] = v.y;
    body[i * 3 + 2] = v.z;
  }
  g.setAttribute('aBodyPos', new THREE.BufferAttribute(body, 3));
  g.setAttribute('aFlesh', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.count).fill(0.8), 1));
  return g;
}

/** A brow: a low ridge of the body's own covering lying across the top of a tilted eye's opening,
 *  overhanging it a little (baked like the lids, so the coat runs over it). */
function browGeometry(r: number, sink: number, quat: readonly number[], origin: readonly number[]): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 16, 10);
  g.scale(r * 1.35, r * 0.32, r * 0.38);
  // (the skin lies ~0.42r ahead of the sunk ball's centre: the ridge sits on it, over the lid's rim)
  g.translate(0, r * 0.74, r * 0.3);
  g.computeVertexNormals();
  const m = new THREE.Matrix4()
    .compose(new THREE.Vector3(origin[0], origin[1], origin[2]), new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]), new THREE.Vector3(1, 1, 1))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -sink));
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const body = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    body[i * 3] = v.x;
    body[i * 3 + 1] = v.y;
    body[i * 3 + 2] = v.z;
  }
  g.setAttribute('aBodyPos', new THREE.BufferAttribute(body, 3));
  g.setAttribute('aFlesh', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.count).fill(0.7), 1));
  return g;
}

/** A glowing eye's rim: a ring of the body's own hide round the ball, in the eye's frame (baked like
 *  the lids, so the coat runs onto it). (A dark ring a quarter of the eye thick round a flat lit disc
 *  was a pair of spectacles.) */
function rimGeometry(r: number, quat: readonly number[], origin: readonly number[]): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r * 1.06, r * 0.2, 10, 28);
  g.translate(0, 0, -r * 0.12);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(origin[0], origin[1], origin[2]), new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]), new THREE.Vector3(1, 1, 1));
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const body = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    body[i * 3] = v.x;
    body[i * 3 + 1] = v.y;
    body[i * 3 + 2] = v.z;
  }
  g.setAttribute('aBodyPos', new THREE.BufferAttribute(body, 3));
  g.setAttribute('aFlesh', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.count).fill(0.6), 1));
  return g;
}

/** an insect's compound eye: dark bronze, rust, bottle green, slate */
const COMPOUND = [0x3a2614, 0x4a1a12, 0x1e3420, 0x23252e];
/** a glowing eye's light: a sickly teal, a bile green, an amber, a violet */
const GLOW = [0x3fd8a8, 0x9fd84a, 0xe0a030, 0xb070e8];

function Eye({ f, socket, iris, lid, seed, skin, phenotype }: { f: MeshFeature; socket: number; iris: number; lid: number; seed: number; skin?: THREE.Material; phenotype?: Phenotype }) {
  const r = Math.max(f.radius, 0.06);
  const v = eyeVariant(f.style);
  // A vertebrate eye on the face (not up a stalk) sits IN the skull: the grown eye node rides proud of
  // the surface (so it always clears it), which drew the whole eyeball bulging out like a marble.
  // Sink it along its aim, so the lids and the head swallow its back half.
  const onFace = useMemo(() => {
    if (!phenotype) return false;
    const e = phenotype.edges.find(([, b]) => b === f.idx);
    return !!e && phenotype.nodes[e[0]].kind === 'spine';
  }, [phenotype, f.idx]);
  // a dark bony orbit tone
  const socketDark = useMemo(() => new THREE.Color(socket).multiplyScalar(0.5).getHex(), [socket]);
  // vertebrate eyes have lids that blink — and shut in sleep; an insect's facets and a glowing alien
  // eye stare
  const vertebrate = v === 'round' || v === 'beady' || v === 'slit';
  // …except a fish's: no lids at all — a flat, lidless, metallic-ringed eye lying flush with the head
  // (lidded and staring forward over a grin, every fish read as a Muppet)
  const fishEye = useMemo(() => vertebrate && onFace && !!phenotype && isSwimmer(phenotype), [vertebrate, onFace, phenotype]);
  const lidded = vertebrate && !fishEye;
  const furred = phenotype?.genomeRef.covering.type === 'fur';
  const slitIris = useMemo(() => {
    const pal = furred ? CAT_IRIS : REPTILE_IRIS;
    return pal[Math.floor(unitHash(seed, 0x511) * pal.length)];
  }, [seed, furred]);
  const sharkEye = fishEye && phenotype?.genomeRef.covering.type === 'skin';
  const radialEye = phenotype?.genomeRef.symmetry === 'radial';
  // a frog's eye (round, bulging from its crown): a gold or bronze iris round a black horizontal pupil
  // (a dark iris round a round pupil, in green lids, was a marble in an egg-cup: goggles)
  const frogEye = useMemo(() => (v === 'round' || v === 'beady') && onFace && !!phenotype && bulgingEye(phenotype, qRotateV(f.quat, [0, 0, 1])), [v, onFace, phenotype, f.quat]);
  const frogIris = useMemo(() => FROG_IRIS[Math.floor(unitHash(seed, 0xf20) * FROG_IRIS.length)], [seed]);
  const fishIris = useMemo(() => (sharkEye ? SHARK_IRIS : FISH_IRIS)[Math.floor(unitHash(seed, 0xf15) * (sharkEye ? SHARK_IRIS : FISH_IRIS).length)], [seed, sharkEye]);
  const seat = useMemo(() => (vertebrate && onFace && phenotype ? eyeSeat(phenotype, f.idx, f.quat, r) : { quat: f.quat, sink: 0, centre: null }), [vertebrate, onFace, phenotype, f.idx, f.quat, r]);
  const sink = seat.sink;
  // the ball takes the iris's own hue, deep — a brown ball behind a green or blue iris read as a bruise
  const ballColor = useMemo(() => new THREE.Color(iris).multiplyScalar(0.16).lerp(new THREE.Color(0x1c120e), 0.5).getHex(), [iris]);
  const lidColor = useMemo(() => new THREE.Color(lid).multiplyScalar(0.82).getHex(), [lid]);
  const origin = phenotype?.nodes[f.idx].pos;
  const open = phenotype?.genomeRef.symmetry === 'radial' ? LID_ROUND : LID_OPEN;
  const lidGeo = useMemo(() => {
    if (!lidded || !skin || !origin) return null;
    return {
      upper: lidGeometry(UPPER_LID, r * 0.97, open.upper, sink, seat.quat, origin),
      lower: lidGeometry(LOWER_LID, r * 0.96, open.lower, sink, seat.quat, origin),
    };
  }, [lidded, skin, origin, r, sink, seat.quat, open]);
  useEffect(() => () => {
    lidGeo?.upper.dispose();
    lidGeo?.lower.dispose();
  }, [lidGeo]);
  // a tilted eye (a bird of prey's) scowls from under a brow
  const browGeo = useMemo(() => {
    if (!lidded || !onFace || !skin || !origin || phenotype?.genomeRef.symmetry !== 'bilateral' || eyeTilt(f.quat) < BROW_TILT) return null;
    return browGeometry(r, sink, seat.quat, origin);
  }, [lidded, onFace, skin, origin, phenotype, f.quat, r, sink, seat.quat]);
  useEffect(() => () => browGeo?.dispose(), [browGeo]);
  // a glowing eye sits in a rim of the hide; an insect's compound eye needs none
  const rim = useMemo(() => (v === 'glowing' && skin && origin ? rimGeometry(r, seat.quat, origin) : null), [v, skin, origin, r, seat.quat]);
  useEffect(() => () => rim?.dispose(), [rim]);
  const glow = useMemo(() => GLOW[Math.floor(unitHash(seed, 0x61c) * GLOW.length)], [seed]);
  // an ape's brow ridge over the eye (face.ts) — skin, in the body frame (it does not turn with the ball)
  const brow = useMemo(() => {
    if (!lidded || !skin || !origin || !phenotype) return null;
    const g = browRidgeGeometry(phenotype, f.idx);
    return g ? bakeSkin(g, origin) : null;
  }, [lidded, skin, origin, phenotype, f.idx]);
  useEffect(() => () => brow?.dispose(), [brow]);
  const lids = useContext(LidContext);
  const upper = useRef<THREE.Mesh>(null);
  const lower = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => ((seed >>> 0) % 997) / 997, [seed]);
  useFrame((st) => {
    if (!lidded || !upper.current || !lower.current) return;
    const close = Math.max(lids ? lids.shut : 0, lids?.blink === false ? 0 : blinkAt(st.clock.elapsedTime, phase));
    // open: the upper margin rides ~35° above the eye's equator, the lower ~42° below; shut: they meet
    // a little below centre
    upper.current.rotation.x = open.upper + close * (LID_SHUT.upper - open.upper);
    lower.current.rotation.x = open.lower + close * (LID_SHUT.lower - open.lower);
  });
  return (
    <>
    {brow && skin && <mesh geometry={brow} material={skin} castShadow />}
    <group quaternion={seat.quat as [number, number, number, number]}>
      <group position={[0, 0, -sink]}>
      {lidded && lidGeo && skin ? (
        <>
          {/* (geometry pre-scaled; the open rotation is baked into aBodyPos only — the mesh rotates) */}
          <mesh ref={upper} geometry={lidGeo.upper} material={skin} rotation-x={open.upper} />
          <mesh ref={lower} geometry={lidGeo.lower} material={skin} rotation-x={open.lower} />
          {browGeo && <mesh geometry={browGeo} material={skin} castShadow />}
        </>
      ) : lidded ? (
        <>
          <mesh ref={upper} geometry={UPPER_LID} scale={r * 0.97} rotation-x={open.upper}>
            <meshStandardMaterial color={lidColor} roughness={0.72} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={lower} geometry={LOWER_LID} scale={r * 0.96} rotation-x={open.lower}>
            <meshStandardMaterial color={lidColor} roughness={0.72} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : null}
      {/* The brow ridge and lower lid used to live here as open hemispherical shells. Whatever
          their orientation, the shell's RIM cut a hard crescent across the sclera — an eyelid has
          to lie flat on a curved eye and a capped sphere never does. Removed; the orbit ring below
          gives the set-in read on its own.
          the bony orbit the eye is sunk into — a dark receptacle ring, so the eye reads as set INTO
          the skull (hooded, sunken), never a ball stuck on the surface.
          The ring must CLEAR the eyeball: its inner edge is (major − tube), which has to stay wider
          than the 0.9r ball or the torus drives straight through the sclera as a hard ridge. It also
          sits back along −Z so it rings the eye's equator like an orbit rather than a hoop in front. */}
      {/* (a lidded eye needs no ring: its coat-covered lids set it into the face) */}
      {/* (only a glowing eye wears a rim, and in the hide's own covering: see rimGeometry; an insect's
          compound eye is a bare dome on the head — ringed in dark, it was a pair of goggles) */}
      {v === 'glowing' && (rim && skin ? (
        <mesh geometry={rim} material={skin} />
      ) : (
        <mesh position={[0, 0, -r * 0.12]}>
          <torusGeometry args={[r * 1.06, r * 0.2, 10, 28]} />
          <meshStandardMaterial color={socketDark} roughness={0.85} metalness={0.0} />
        </mesh>
      ))}
      {fishEye ? (
        // a fish's eye: a flattened dark ball flush in the head, a broad metallic iris ring (silver,
        // brass or gold) round a big round pupil — no lids, no white
        <group scale={[1, 1, 0.72]}>
          <mesh position={[0, 0, -r * 0.04]}>
            <sphereGeometry args={[r * 0.9, 22, 18]} />
            <meshStandardMaterial color={0x0b0c0e} roughness={0.1} />
          </mesh>
          <mesh position={[0, 0, -r * 0.04]} scale={r * 0.9 * 1.012} geometry={capGeometry(0.82, true)}>
            <meshStandardMaterial color={fishIris} vertexColors roughness={0.28} metalness={0.6} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
          <mesh position={[0, 0, -r * 0.04]} scale={r * 0.9 * 1.024} geometry={capGeometry(0.46, false)}>
            <meshStandardMaterial color={0x020203} roughness={0.04} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
        </group>
      ) : v === 'round' || v === 'beady' ? (
        // a wet animal eye set deep under a heavy brow — dark, glassy, watching. No cream sclera,
        // no fat white sticker; the low-roughness ball catches the environment like real moisture.
        <>
          {/* the eyeball — the iris's hue, deep (round) or a glossy black bead (beady), set deep */}
          <mesh position={[0, 0, -r * 0.04]}>
            <sphereGeometry args={[r * 0.9, 22, 18]} />
            <meshStandardMaterial color={v === 'round' ? ballColor : 0x070709} roughness={0.12} metalness={0.0} />
          </mesh>
          {/* iris + pupil: caps of the ball's own sphere (see capGeometry), a hair proud of it */}
          <mesh position={[0, 0, -r * 0.04]} scale={r * 0.9 * 1.012} geometry={capGeometry(frogEye ? 0.95 : v === 'round' ? 0.7 : 0.56, true)}>
            <meshStandardMaterial color={frogEye ? frogIris : iris} vertexColors roughness={0.16} metalness={frogEye ? 0.25 : 0.1} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
          <mesh
            position={[0, 0, -r * 0.04]}
            rotation-z={frogEye ? Math.PI / 2 : 0}
            scale={r * 0.9 * 1.024}
            geometry={frogEye ? capGeometry(0.42, false, 0.5) : capGeometry(v === 'round' ? 0.3 : 0.5, false)}
          >
            <meshStandardMaterial color={0x030304} roughness={0.05} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
          {/* a small, sharp catchlight — a wet glint, not a cartoon sticker */}
          <mesh position={[r * 0.17, r * 0.2, r * 0.88]}>
            <sphereGeometry args={[r * 0.05, 8, 8]} />
            <meshBasicMaterial color={0xdce4f0} />
          </mesh>
        </>
      ) : v === 'slit' ? (
        // slit — a reptile vertical-pupil eye sunk under a brow; the whole visible ball is iris, so it
        // takes a reptile's colours (gold, amber, olive, copper, stone) — a blue marble read as a toy.
        // On a radial body the slit lies flat and short: an octopus's pupil is a rounded bar across the
        // middle of its eye (a sliver from rim to rim, laid flat, was a pair of sunglasses; an oval half
        // as tall as it was wide, on a big yellow eye, was a gaping mouth).
        // (An octopus's is not one metallic gold dome — a pair of goggles — but a dark wet eyeball with a
        // fibred iris, darkening to its rim, round a bolder bar.)
        <>
          <mesh position={[0, 0, -r * 0.02]}>
            <sphereGeometry args={[r * 0.9, 18, 14]} />
            {radialEye ? (
              <meshStandardMaterial color={ballColor} roughness={0.12} />
            ) : (
              <meshStandardMaterial color={slitIris} roughness={0.28} metalness={0.22} />
            )}
          </mesh>
          {radialEye && (
            <mesh position={[0, 0, -r * 0.02]} scale={r * 0.9 * 1.008} geometry={capGeometry(0.86, true)}>
              <meshStandardMaterial color={slitIris} vertexColors roughness={0.42} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
          )}
          <mesh
            position={[0, 0, -r * 0.02]}
            rotation-z={radialEye ? Math.PI / 2 : 0}
            scale={r * 0.9 * 1.014}
            geometry={radialEye ? capGeometry(0.42, false, 0.3) : capGeometry(0.66, false, 0.16)}
          >
            <meshStandardMaterial color={0x040406} roughness={0.06} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
          <mesh position={[r * 0.12, r * 0.24, r * 0.86]}>
            <sphereGeometry args={[r * 0.045, 8, 8]} />
            <meshBasicMaterial color={0xdce4f0} />
          </mesh>
        </>
      ) : v === 'compound' ? (
        // compound — an insect's: a big glossy dome of fine facets, dark with a tint of bronze, rust or
        // bottle green (coarse facets were a disco ball; jet black, a marble)
        <mesh position={[0, 0, r * 0.08]}>
          <icosahedronGeometry args={[r * 0.98, 3]} />
          <meshStandardMaterial color={COMPOUND[Math.floor(unitHash(seed, 0xc0e) * COMPOUND.length)]} roughness={0.3} metalness={0.45} flatShading />
        </mesh>
      ) : (
        // glowing — an alien eye: a dark wet ball, a lit iris (darkening to its rim, fibred like any
        // iris) round a slit of a pupil. (A flat lit disc with a dot of a pupil was a lamp, not an eye.)
        <>
          <mesh position={[0, 0, r * 0.02]}>
            <sphereGeometry args={[r * 0.9, 18, 14]} />
            <meshStandardMaterial color={0x060908} roughness={0.12} />
          </mesh>
          <mesh position={[0, 0, r * 0.02]} scale={r * 0.9 * 1.012} geometry={capGeometry(0.8, true)}>
            <meshStandardMaterial color={glow} vertexColors emissive={glow} emissiveIntensity={0.4} roughness={0.25} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
          <mesh position={[0, 0, r * 0.02]} scale={r * 0.9 * 1.024} geometry={capGeometry(0.62, false, 0.22)}>
            <meshStandardMaterial color={0x020302} roughness={0.05} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
          <mesh position={[r * 0.14, r * 0.24, r * 0.86]}>
            <sphereGeometry args={[r * 0.05, 8, 8]} />
            <meshBasicMaterial color={0xdce4f0} />
          </mesh>
        </>
      )}
      </group>
    </group>
    </>
  );
}

// A foot/paw: a flattened pad, sole-down, longer front-to-back.
function Foot({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh scale={[r * 1.15, r * 0.55, r * 1.45]} castShadow>
      <sphereGeometry args={[1, 14, 12]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.0} />
    </mesh>
  );
}

// A paw: a soft padded mitten — a broad sole, a fan of four toe lobes, small dark claws (cat / dog /
// bear). The fur parts wear the body's own covering (baked body-space coordinates, so the coat's
// pattern and countershading run down the leg onto the foot); a dark detached disc read as a shoe.
const PAW_TOES: readonly [number, number][] = [
  [-0.66, 0.82],
  [-0.23, 1.0],
  [0.23, 1.0],
  [0.66, 0.82],
];
function pawGeometry(r: number, origin: readonly number[], slender = false): { fur: THREE.BufferGeometry; claws: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const sole = new THREE.SphereGeometry(1, 18, 12);
  // the sole's underside sits on the ground plane (the foot node's own bottom, −r); a mouse's is a
  // narrow palm, its toes long and thin and spread (as a cat's soft lobes, at a mouse's size, they
  // were one round button)
  sole.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(0, -r * (slender ? 0.45 : 0.2), r * 0.42),
      new THREE.Quaternion(),
      slender ? new THREE.Vector3(r * 0.78, r * 0.42, r * 1.3) : new THREE.Vector3(r * 1.5, r * 0.8, r * 1.7),
    ),
  );
  parts.push(sole);
  const claws: THREE.BufferGeometry[] = [];
  for (const [x, z] of PAW_TOES) {
    const toe = new THREE.SphereGeometry(1, 12, 8);
    if (slender) {
      // a finger: a long thin capsule fanned out from the palm's front edge
      const yaw = x * 0.55;
      const at = new THREE.Vector3(x * r * 0.6, -r * 0.74, r * 0.42 + z * r * 1.3);
      toe.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(r * 0.2, r * 0.18, r * 0.62)));
      parts.push(toe);
      const claw = new THREE.ConeGeometry(1, 1, 6);
      const tip = at.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(r * 0.62));
      claw.applyMatrix4(
        new THREE.Matrix4().compose(
          tip,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.4, yaw, 0, 'YXZ')),
          new THREE.Vector3(r * 0.06, r * 0.2, r * 0.06),
        ),
      );
      claws.push(claw);
      continue;
    }
    toe.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x * r * 1.1, -r * 0.55, r * 0.42 + z * r * 1.5), new THREE.Quaternion(), new THREE.Vector3(r * 0.44, r * 0.45, r * 0.52)));
    parts.push(toe);
    const claw = new THREE.ConeGeometry(1, 1, 6);
    claw.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x * r * 1.12, -r * 0.62, r * 0.42 + z * r * 1.5 + r * 0.5),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.55, 0, 0)),
        new THREE.Vector3(r * 0.09, r * 0.3, r * 0.09),
      ),
    );
    claws.push(claw);
  }
  const fur = bakeSkin(mergeGeometries(parts.map((g) => g.toNonIndexed()), false) ?? parts[0], origin);
  const clawGeo = mergeGeometries(claws.map((g) => g.toNonIndexed()), false) ?? claws[0];
  for (const g of [...parts, ...claws]) g.dispose();
  return { fur, claws: clawGeo };
}

/** a mouse's bare paw: a pale flesh pink (in the coat's own colour it was a felt slipper) */
const BARE_PAW = new THREE.Color().setHSL(0.99, 0.4, 0.5).getHex();

const NO_FUR: readonly THREE.Material[] = [];

function Paw({ f, color, skin, origin, leg = false, fur = NO_FUR, bare = false }: { f: MeshFeature; color: number; skin?: THREE.Material; origin: readonly number[]; leg?: boolean; fur?: readonly THREE.Material[]; bare?: boolean }) {
  const r = Math.max(f.radius, 0.06);
  const geo = useMemo(() => {
    const g = pawGeometry(r, origin, bare);
    // a paw ending a leg is all leg: below a bare-shank line it wears the shank's keratin, like toes
    if (leg) g.fur.setAttribute('aLeg', new THREE.BufferAttribute(new Float32Array(g.fur.getAttribute('position').count).fill(1), 1));
    return g;
  }, [r, origin, leg, bare]);
  useEffect(() => () => {
    geo.fur.dispose();
    geo.claws.dispose();
  }, [geo]);
  const dark = useMemo(() => new THREE.Color(bare ? 0x8a6a5c : color).multiplyScalar(bare ? 1 : 0.45).getHex(), [color, bare]);
  if (bare) {
    return (
      <group>
        <mesh geometry={geo.fur} castShadow>
          <meshStandardMaterial color={BARE_PAW} roughness={0.55} />
        </mesh>
        <mesh geometry={geo.claws}>
          <meshStandardMaterial color={dark} roughness={0.4} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      {skin ? (
        <mesh geometry={geo.fur} material={skin} castShadow />
      ) : (
        <mesh geometry={geo.fur} castShadow>
          <meshStandardMaterial color={color} roughness={0.78} />
        </mesh>
      )}
      {/* the coat runs on down over the paw: its shells, as on the leg above (without them the fur
          stopped at the ankle in a ring, over a bare shiny paw — a sock and a slipper) */}
      {skin && fur.map((m, i) => <mesh key={`fur${i}`} geometry={geo.fur} material={m} />)}
      <mesh geometry={geo.claws} castShadow>
        <meshStandardMaterial color={dark} roughness={0.45} />
      </mesh>
    </group>
  );
}

// A hoof: a big solid keratin block, flat on the ground, with a cleft (ungulate).
function Hoof({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const horn = useMemo(() => new THREE.Color(color).multiplyScalar(0.4).getHex(), [color]);
  return (
    <group>
      <mesh position={[0, -r * 0.2, r * 0.05]} scale={[r * 1.45, r * 1.35, r * 1.6]} castShadow>
        <cylinderGeometry args={[0.78, 1.0, 1, 12]} />
        <meshStandardMaterial color={horn} roughness={0.42} metalness={0.06} />
      </mesh>
      <mesh position={[0, -r * 0.85, r * 0.4]} scale={[r * 0.1, r * 0.7, r * 1.3]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={0x0e0a07} roughness={0.6} />
      </mesh>
    </group>
  );
}

// A hand: a palm + four fingers and a thumb, oriented along the arm (primate).
function Hand({ f, color }: { f: MeshFeature; color: number }) {
  // a hand is broader and longer than the wrist it ends (at the wrist's own radius it vanished)
  const r = Math.max(f.radius, 0.06) * 1.45;
  return (
    <group quaternion={f.quat}>
      <mesh scale={[r * 0.95, r * 0.42, r * 0.85]} castShadow>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      {[-0.5, -0.17, 0.17, 0.5].map((x, i) => (
        <mesh key={i} position={[x * r * 0.85, 0, r * 0.95]} rotation={[Math.PI / 2 - 0.2, 0, 0]} scale={[r * 0.13, r * 0.13, r * 0.95]} castShadow>
          <cylinderGeometry args={[1, 0.8, 1, 6]} />
          <meshStandardMaterial color={color} roughness={0.72} />
        </mesh>
      ))}
      <mesh position={[-r * 0.6, 0, r * 0.3]} rotation={[Math.PI / 2, 0, 0.7]} scale={[r * 0.13, r * 0.13, r * 0.6]} castShadow>
        <cylinderGeometry args={[1, 0.8, 1, 6]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
    </group>
  );
}

// An ape's knuckle-walking fist or its long-toed hind foot (apeLimbs.ts): the back of the hand and the
// top of the foot in the body's own coat, the fingers and toes in the bare skin of its face.
function ApeLimb({ f, skin, phenotype, fist = false }: { f: MeshFeature; skin: THREE.Material; phenotype: Phenotype; fist?: boolean }) {
  const r = Math.max(f.radius, 0.06);
  const node = phenotype.nodes[f.idx];
  const geo = useMemo(() => {
    const side = node.pos[0] >= 0 ? 1 : -1;
    let g;
    if (fist) {
      // the floor is where the feet stand; a fist reaches down to it (but no further than a hand's length)
      let floor = Infinity;
      for (const n of phenotype.nodes) if (n.kind === 'terminal' && n.part?.kind === 'leg') floor = Math.min(floor, n.pos[1] - n.radius);
      g = fistGeometry(r, Math.min(Math.max(node.pos[1] - floor, 0.8 * r), 2.2 * r), side);
    } else g = apeFootGeometry(r, side);
    bakeSkin(g.fur, node.pos);
    // (it has no pile of its own: shaded like the furred limb above it, not a pale cuff under it)
    (g.fur.getAttribute('aAO').array as Float32Array).fill(0.45);
    return g;
  }, [r, node, phenotype, fist]);
  useEffect(() => () => {
    geo.fur.dispose();
    geo.bare.dispose();
  }, [geo]);
  // (the face's own bare skin, a shade darker: at half its tone the fingers were black beads)
  const bare = useMemo(() => new THREE.Color(faceMaskOf(phenotype)?.color ?? 0x3a2a22).multiplyScalar(0.72).getHex(), [phenotype]);
  return (
    <group>
      <mesh geometry={geo.fur} material={skin} castShadow />
      <mesh geometry={geo.bare} castShadow>
        <meshStandardMaterial color={bare} roughness={0.8} />
      </mesh>
    </group>
  );
}

// A theropod's hand (feet.ts): three short clawed fingers in the body's own covering.
function ClawedHand({ f, skin, phenotype }: { f: MeshFeature; skin: THREE.Material; phenotype: Phenotype }) {
  // (the wrist of so small an arm is a few hundredths across: at its own size the hand vanished)
  const r = Math.max(f.radius, 0.045) * 1.15;
  const origin = phenotype.nodes[f.idx].pos;
  const geo = useMemo(() => {
    const g = clawedHandGeometry(r, f.quat);
    return { fingers: bakeSkin(g.fingers, origin), claws: g.claws };
  }, [r, f.quat, origin]);
  useEffect(() => () => {
    geo.fingers.dispose();
    geo.claws.dispose();
  }, [geo]);
  const claw = useMemo(() => new THREE.Color(shankColor(phenotype.genomeRef.seed)).multiplyScalar(0.35).getHex(), [phenotype]);
  return (
    <group>
      <mesh geometry={geo.fingers} material={skin} castShadow />
      <mesh geometry={geo.claws} castShadow>
        <meshStandardMaterial color={claw} roughness={0.4} />
      </mesh>
    </group>
  );
}

// A toed foot (feet.ts): a bird's four thin toes or a lizard's splayed five, in the body's own
// covering (the bare-shank keratin, for a bird), with dark claws.
function ToedFoot({ f, plan, skin, phenotype }: { f: MeshFeature; plan: FootPlan; skin: THREE.Material; phenotype: Phenotype }) {
  const r = Math.max(f.radius, 0.04);
  const origin = phenotype.nodes[f.idx].pos;
  const link = useMemo(() => lastLinkOf(phenotype, f.idx), [phenotype, f.idx]);
  // (a frog's hind feet are webbed; its hands are not)
  const webbed = useMemo(() => plan === 'frog' && isHindFoot(phenotype, f.idx), [plan, phenotype, f.idx]);
  const geo = useMemo(() => {
    const g = toedFootGeometry(plan, r, link, f.style >= TALONED, webbed);
    const toes = bakeSkin(g.toes, origin);
    // the toes are all leg (a bird's are bare keratin to the claw)
    toes.setAttribute('aLeg', new THREE.BufferAttribute(new Float32Array(toes.getAttribute('position').count).fill(1), 1));
    return { toes, claws: g.claws };
  }, [plan, r, link, origin, f.style, webbed]);
  useEffect(() => () => {
    geo.toes.dispose();
    geo.claws.dispose();
  }, [geo]);
  const claw = useMemo(() => new THREE.Color(shankColor(phenotype.genomeRef.seed)).multiplyScalar(0.35).getHex(), [phenotype]);
  return (
    <group>
      <mesh geometry={geo.toes} material={skin} castShadow />
      <mesh geometry={geo.claws} castShadow>
        <meshStandardMaterial color={claw} roughness={0.4} />
      </mesh>
    </group>
  );
}

// A claw: a darker, pointed talon.
function Claw({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.7).getHex(), [color]);
  return (
    <mesh rotation={[Math.PI, 0, 0]} scale={[r * 1.0, r * 1.7, r * 1.0]} castShadow>
      <coneGeometry args={[1, 1.4, 7]} />
      <meshStandardMaterial color={dark} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

/** An ARTHROPOD's legs (a chitin body's, a myriapod's, or anything on three or more pairs): jointed
 *  rods that run on into points. */
function arthropodLegs(p: Phenotype): boolean {
  if (pointedLegs(p.genomeRef) || p.genomeRef.covering.type === 'chitin') return true;
  let legs = 0;
  for (const n of p.nodes) if (n.kind === 'terminal' && n.part?.kind === 'leg') legs++;
  return legs >= 6;
}

/** An arthropod leg's tip, in the node's frame (+Z its last link's run): the link tapering on as the
 *  body's own covering (`shell`), then a hardened point (`point`) reaching `len` along it. */
function legTipGeometry(r: number, len: number, quat: readonly number[], origin: readonly number[]): { shell: THREE.BufferGeometry; point: THREE.BufferGeometry } {
  const q = new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3]);
  const cut = len * 0.5;
  // (it starts inside the leg's last node: the taper grows out of the skin with no collar)
  const shell = new THREE.CylinderGeometry(r * 0.46, r * 0.86, cut + r * 0.5, 10, 1, true);
  shell.rotateX(Math.PI / 2);
  shell.translate(0, 0, (cut - r * 0.5) / 2);
  shell.applyQuaternion(q);
  shell.computeVertexNormals();
  bakeSkin(shell, origin);
  const point = new THREE.ConeGeometry(r * 0.47, len - cut, 10);
  point.rotateX(Math.PI / 2);
  point.translate(0, 0, cut + (len - cut) / 2);
  point.applyQuaternion(q);
  return { shell, point };
}

// A leg that runs on into a POINT (an insect's tarsus, a spider's, a crab's dactyl, a myriapod's): the
// last link tapers on in the body's own covering to a slim dark point on the ground `reach` below the
// leg's last node. (A dark cone as wide as the leg or wider, capping its end, was a tack pushed into it.)
function LegTip({ f, color, skin, origin, reach }: { f: MeshFeature; color: number; skin?: THREE.Material; origin: readonly number[]; reach: number }) {
  const r = Math.max(f.radius, 0.04);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.5).getHex(), [color]);
  // the node's +Z is its last link's run: how steeply that falls sets how long a point reaches the ground
  const fall = useMemo(() => -new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(f.quat[0], f.quat[1], f.quat[2], f.quat[3])).y, [f.quat]);
  const len = Math.min(Math.max(reach, 0.04) / Math.max(fall, 0.45), 0.6) + r * 0.9;
  const geo = useMemo(() => legTipGeometry(r, len, f.quat, origin), [r, len, f.quat, origin]);
  useEffect(() => () => {
    geo.shell.dispose();
    geo.point.dispose();
  }, [geo]);
  return (
    <group>
      {skin ? (
        <mesh geometry={geo.shell} material={skin} castShadow />
      ) : (
        <mesh geometry={geo.shell} castShadow>
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      )}
      <mesh geometry={geo.point} castShadow>
        <meshStandardMaterial color={dark} roughness={0.35} metalness={0.05} />
      </mesh>
    </group>
  );
}

// A horn: a keratin sheath sweeping back from its root, ringed toward its base (horn.ts).
function Horn({ f, color, seed }: { f: MeshFeature; color: number; seed: number }) {
  const r = Math.max(f.radius, 0.06);
  const keratin = useMemo(() => new THREE.Color(color).lerp(new THREE.Color(0xcfc3a0), 0.4).getHex(), [color]);
  // (each creature's horns their own curve; a mammal's ringed, a reptile's smooth)
  const geo = useMemo(() => hornGeometry(r, f.quat, unitHash(seed, 0x40e), true), [r, f.quat, seed]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial color={keratin} vertexColors roughness={0.5} metalness={0.05} />
    </mesh>
  );
}

// Crystal shards: a cluster of pointed six-sided prisms in the body's own colour, lighter and lit from
// within — glassy, never see-through enough to need the scene drawn twice behind them.
function Shards({ f, palette, seed }: { f: MeshFeature; palette: Phenotype['genomeRef']['palette']; seed: number }) {
  const r = Math.max(f.radius, 0.06);
  const geo = useMemo(() => shardGeometry(r, (seed ^ Math.imul(f.idx + 1, 0x9e3779b1)) >>> 0), [r, seed, f.idx]);
  useEffect(() => () => geo.dispose(), [geo]);
  const tint = useMemo(() => coatMain(palette).lerp(new THREE.Color(0xffffff), 0.3), [palette]);
  return (
    <group quaternion={f.quat}>
      <mesh geometry={geo} castShadow>
        <meshPhysicalMaterial color={tint} roughness={0.08} metalness={0} clearcoat={1} clearcoatRoughness={0.04} emissive={tint} emissiveIntensity={0.42} transparent opacity={0.9} flatShading />
      </mesh>
    </group>
  );
}

// A pincer: a crab's claw — a swollen palm in the creature's own skin, two curved fingers closing on
// each other, dark at the points (claw.ts).
function Pincer({ f, color, skin, origin }: { f: MeshFeature; color: number; skin?: THREE.Material; origin: readonly number[] }) {
  // a claw on an arm (a crab's) is turned at the wrist to fold it in across the face (see claw.ts)
  const arm = f.kind === 'arm';
  const r = Math.max(f.radius, 0.06);
  const geo = useMemo(() => {
    const g = clawGeometry(r, arm ? wristQuat(f.quat, origin, r) : f.quat);
    bakeSkin(g.shell, origin);
    return g;
  }, [r, f.quat, origin, arm]);
  useEffect(() => () => {
    geo.shell.dispose();
    geo.tips.dispose();
  }, [geo]);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.4).getHex(), [color]);
  return (
    <group>
      {skin ? (
        <mesh geometry={geo.shell} material={skin} castShadow />
      ) : (
        <mesh geometry={geo.shell} castShadow>
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      )}
      <mesh geometry={geo.tips} castShadow>
        <meshStandardMaterial color={dark} roughness={0.32} metalness={0.05} />
      </mesh>
    </group>
  );
}

// A fin, built in the body frame from its aim (wings.ts buildFin): a raked dorsal sail, swept
// pectoral and pelvic paddles lying along the flank, a forked caudal fan — sized to the body's girth.
function Fin({ f, color, lite = false, phenotype, surface = 'hybrid' }: { f: MeshFeature; color: number; lite?: boolean; phenotype: Phenotype; surface?: SkinSurface }) {
  const build = useMemo(() => finOf(f, phenotype, surface), [f, phenotype, surface]);
  useEffect(() => () => build.membrane.dispose(), [build]);
  const ray = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getHex(), [color]);
  const bones = useMemo(
    () =>
      build.rays.map((r) => {
        const d = r.b.clone().sub(r.a);
        const len = Math.max(d.length(), 1e-4);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
        const mid = r.a.clone().add(r.b).multiplyScalar(0.5);
        return { pos: [mid.x, mid.y, mid.z] as [number, number, number], quat: [q.x, q.y, q.z, q.w] as [number, number, number, number], len };
      }),
    [build],
  );
  const w = Math.max(0.006, bones.length ? bones[0].len * 0.012 : 0.01);
  return (
    <group>
      <mesh geometry={build.membrane} castShadow>
        <meshPhysicalMaterial color={color} roughness={0.45} sheen={0.4} side={THREE.DoubleSide} transparent opacity={0.9} />
      </mesh>
      {!lite && bones.map((b, i) => (
        <mesh key={i} position={b.pos} quaternion={b.quat}>
          <cylinderGeometry args={[w * 0.5, w, b.len, 4]} />
          <meshStandardMaterial color={ray} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** A fin feature's geometry as its body wears it (body frame, origin at the fin's node). */
export function finOf(f: MeshFeature, phenotype: Phenotype, surface: SkinSurface = 'hybrid'): FinBuild {
  const q = new THREE.Quaternion(f.quat[0], f.quat[1], f.quat[2], f.quat[3]);
  const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const kind = finKindOf(aim, f.kind);
  const g = finGirth(phenotype, f.idx, kind, f.radius);
  const cut = finCutOf(f.style);
  // a fin along the midline of a back or a belly (a bony fish's sail and keel are three body-girths
  // long) stands on the skin all the way: its root is traced down the surface under its chord.
  // Run straight out from its root point, a fish's sail hung in the air over the back's fall to the
  // tail — a third of a body unit of daylight under its rear end, 0.7 at the worst.
  const root = cut !== 'plain' && (kind === 'dorsal' || kind === 'anal') ? finRoot(phenotype, f.idx, kind, aim, g, surface) : undefined;
  return buildFin(kind, aim, g, finScaleOf(f.style), cut, root);
}

/**
 * The skin's height under a fin's chord: for a distance `along` back from the fin's root point (forward
 * if negative), how far the surface stands along the fin's aim relative to where it stands at the root.
 * Sampled along the chord and read off between the samples.
 */
function finRoot(p: Phenotype, idx: number, kind: 'dorsal' | 'anal', aim: THREE.Vector3, g: number, surface: SkinSurface): (along: number) => number {
  const prims = surfacePrims(p, surface);
  const o = p.nodes[idx].pos;
  const chord = finChord(kind, aim);
  const STEP = 0.4 * g;
  const FROM = -4, TO = 7; // (covers a sail's whole base, 1.3 girths ahead of the root to 2 behind, with room)
  const heights: number[] = [];
  for (let i = FROM; i <= TO; i++) {
    const a = i * STEP;
    const hit = projectToSurface(prims, [], [o[0] + chord.x * a, o[1] + chord.y * a, o[2] + chord.z * a]);
    heights.push((hit.p[0] - o[0]) * aim.x + (hit.p[1] - o[1]) * aim.y + (hit.p[2] - o[2]) * aim.z);
  }
  const h0 = heights[-FROM];
  return (along: number) => {
    const u = Math.min(TO - FROM, Math.max(0, along / STEP - FROM));
    const i = Math.min(TO - FROM - 1, Math.floor(u));
    return heights[i] + (heights[i + 1] - heights[i]) * (u - i) - h0;
  };
}

/** An arthropod of tagmata: its legs hang from a section past the trunk (a thorax ahead of the abdomen). */
function tagmata(p: Phenotype): boolean {
  const parent = new Int32Array(p.nodes.length).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  return p.nodes.some((n, i) => n.part?.kind === 'leg' && parent[i] >= 0 && p.nodes[parent[i]].kind === 'spine' && (p.nodes[parent[i]].segment ?? 0) > 0);
}

// A frill: half a ruff of ribbed skin round the neck — the pair is the whole collar (frill.ts).
function Frill({ f, color, phenotype }: { f: MeshFeature; color: number; phenotype: Phenotype }) {
  const geo = useMemo(() => {
    const parent = new Int32Array(phenotype.nodes.length).fill(-1);
    for (const [a, b] of phenotype.edges) parent[b] = a;
    let c = parent[f.idx];
    while (c >= 0 && phenotype.nodes[c].kind !== 'spine') c = parent[c];
    const node = phenotype.nodes[f.idx];
    const neck = c >= 0 ? phenotype.nodes[c] : node;
    const neckR = neck.radius * Math.min(neck.scale?.[0] ?? 1, neck.scale?.[1] ?? 1);
    const plan = frillPlan(neckR, Math.max(f.radius, 0.06) * 2.1, node.pos[0] >= neck.pos[0] ? 1 : -1);
    const offset: [number, number, number] = [neck.pos[0] - node.pos[0], neck.pos[1] - node.pos[1], neck.pos[2] - node.pos[2]];
    return frillGeometry(plan, offset, new THREE.Color(color), coatPattern(phenotype.genomeRef.palette));
  }, [f.idx, f.radius, color, phenotype]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshStandardMaterial vertexColors roughness={0.55} metalness={0.0} side={THREE.DoubleSide} />
    </mesh>
  );
}

// A wing, built from the SHOULDER in the body frame (see wings.ts): a folded feathered wing for a
// feathered creature on two legs, the same plumage held raised and open on four (a griffin's), a
// spread membrane (arm + finger bones + scalloped billowing skin) otherwise.
// The feature group sits at the wing's tip node, so the build is offset back to the shoulder.
function Wing({ f, color, phenotype, lite = false }: { f: MeshFeature; color: number; phenotype: Phenotype; lite?: boolean }) {
  const g = phenotype.genomeRef;
  const feathered = g.covering.type === 'feathers';
  const raised = wingCarriage(feathered, legBearer(g).appendages.filter((a) => a.kind === 'leg').length) === 'raised';
  const build = useMemo(() => {
    // walk back from the tip to the shoulder (the first wing node off the body)
    const parent = new Int32Array(phenotype.nodes.length).fill(-1);
    for (const [a, b] of phenotype.edges) parent[b] = a;
    let root = f.idx;
    while (parent[root] >= 0 && phenotype.nodes[parent[root]].part?.kind === 'wing') root = parent[root];
    const shoulder = phenotype.nodes[root].pos;
    const tip = phenotype.nodes[f.idx].pos;
    const side = shoulder[0] >= 0 ? 1 : -1;
    // size the wing off the trunk it has to carry, nudged by the part's own thickness gene
    const trunk = phenotype.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
    let z0 = Infinity, z1 = -Infinity, girth = 0;
    for (const n of trunk) {
      z0 = Math.min(z0, n.pos[2] - n.radius);
      z1 = Math.max(z1, n.pos[2] + n.radius);
      girth = Math.max(girth, n.radius);
    }
    const trunkLen = Number.isFinite(z1 - z0) ? z1 - z0 : 1;
    const gene = Math.max(f.radius, 0.06) / Math.max(girth, 0.1); // ~0.4–0.6 typical
    const pal = g.palette;
    const plumage = coatMain(pal);
    const accent = coatPattern(pal);
    // (a bird of prey's long wing lies down the line of its back, to its tail — see longWingFold)
    const long = feathered && !raised && f.style >= LONG_WING ? longWingFold(phenotype, side) : null;
    const foldS = long ? long.S : (trunkLen * 1.05 + girth * 0.9) * (0.85 + gene * 0.3);
    // (the wing's own gene counts for more than it did — the same at a typical 0.4, half again
    // at 0.9 — so a body bred or built for big wings gets them)
    const openS = Math.max(trunkLen * 1.15, girth * 3) * (0.55 + gene);
    // a feathered wing on a four-legged body is held up and half open, to the span a membrane wing
    // on the same body would have (wings.ts wingCarriage)
    // (a membrane wing folds along the flank at rest, as a bat's or a dragon's does, and opens to fly)
    const w = raised
      ? buildSpreadFeatheredWing(side, openS, plumage, accent, 0.62 + 0.2 * (g.seed % 7) / 7)
      : feathered
        ? buildFeatheredWing(side, foldS, plumage, accent, long?.axis)
        : buildFoldedMembraneWing(side, openS * MEMBRANE_FOLD);
    // the flight posture: the same plumage opened out — a wing reaches further spread than folded
    const spread = feathered ? buildSpreadFeatheredWing(side, raised ? openS * 1.1 : foldS * 1.35, plumage, accent).surface : null;
    const open = feathered ? null : buildMembraneWing(side, openS, 0.55 + 0.3 * (g.seed % 7) / 7);
    // (an upright body pitches forward to fly: its spread wings are built tilted back by as much, so
    // they come out level — see flightLevel)
    const level = spread ? flightLevel(phenotype) : 0;
    if (spread && level > 0) spread.rotateX(-level);
    // a folded wing tucks against the UPPER FLANK (a bird's wing lies along its side, not on its
    // spine): anchor it on the trunk node nearest the shoulder, out at its side and a little above
    // the midline, slightly forward — rather than at the dorsal attach point the gene aimed for.
    let anchor: readonly number[] = shoulder;
    if (trunk.length) {
      let near = trunk[0];
      for (const n of trunk) if (Math.abs(n.pos[2] - shoulder[2]) < Math.abs(near.pos[2] - shoulder[2])) near = n;
      const rx = near.radius * (near.scale?.[0] ?? 1);
      // (a membrane wing's arm roots at the upper corner of the shoulder, its humerus buried in the
      // body — from the dorsal attach point it stuck out of the spine like a broom handle)
      anchor = feathered && !raised
        ? [near.pos[0] + side * rx * 0.86, near.pos[1] + near.radius * 0.28, near.pos[2] + near.radius * 0.35]
        : [near.pos[0] + side * rx * 0.55, near.pos[1] + near.radius * 0.5, near.pos[2] + near.radius * 0.2];
    }
    if (long) anchor = long.anchor;
    const off: [number, number, number] = [anchor[0] - tip[0], anchor[1] - tip[1], anchor[2] - tip[2]];
    if (!raised) {
      // wrap the folded wing around the flank (the same field the hybrid skin is meshed from) — and a
      // folded membrane wing's bones with it, joint by joint, so the arm lies on the skin, not in it
      const prims = surfacePrims(phenotype, 'hybrid');
      const field = (x: number, y: number, z: number) => fieldAt(prims, x, y, z);
      conformToSurface(w.surface, field, anchor, girth * 0.04, w.lift);
      if (!feathered) {
        const joints: THREE.Vector3[] = [];
        for (const b of w.bones) joints.push(b.a, b.b);
        if (w.wrist) joints.push(w.wrist);
        const pts = new THREE.BufferGeometry().setFromPoints(joints);
        conformToSurface(pts, field, anchor, girth * 0.08);
        const at = pts.getAttribute('position');
        joints.forEach((j, i) => j.set(at.getX(i), at.getY(i), at.getZ(i)));
        pts.dispose();
      }
    }
    const boneOf = (b: { a: THREE.Vector3; b: THREE.Vector3; r0: number; r1: number; buried?: boolean }) => {
      const d = b.b.clone().sub(b.a);
      const len = Math.max(d.length(), 1e-4);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
      const mid = b.a.clone().add(b.b).multiplyScalar(0.5);
      return { pos: [mid.x, mid.y, mid.z] as [number, number, number], quat: [q.x, q.y, q.z, q.w] as [number, number, number, number], len, r0: b.r0, r1: b.r1, buried: b.buried };
    };
    const openBones = open ? open.bones.map(boneOf) : [];
    const bones = w.bones.map(boneOf);
    return { w, off, bones, side, spread, open, openBones };
  }, [phenotype, f.idx, f.radius, f.style, feathered, raised, g]);
  useEffect(() => () => {
    build.w.surface.dispose();
    build.spread?.dispose();
    build.open?.surface.dispose();
  }, [build]);
  // flight: fold ↔ spread, and the wingbeat as a roll about the body axis at the shoulder
  const flight = useContext(FlightContext);
  const flapRef = useRef<THREE.Group>(null);
  const foldRef = useRef<THREE.Mesh>(null);
  const spreadRef = useRef<THREE.Mesh>(null);
  const foldGroup = useRef<THREE.Group>(null);
  const openGroup = useRef<THREE.Group>(null);
  useFrame(() => {
    const sp = flight ? flight.spread : 0;
    if (flapRef.current) flapRef.current.rotation.z = build.side * (flight ? flight.flap * sp : 0);
    const folded = !(build.spread || build.open) || sp < 0.35;
    // opening out: the spread wing grows from the folded length as it unfolds
    const opening = 0.55 + 0.45 * THREE.MathUtils.smoothstep(sp, 0.35, 1);
    for (const o of [foldRef.current, foldGroup.current]) if (o) o.visible = folded;
    for (const o of [spreadRef.current, openGroup.current]) {
      if (!o) continue;
      o.visible = !folded;
      o.scale.setScalar(opening);
    }
  });
  // the arm and finger bones wear the wing's own skin, a shade deeper (a flat dark cylinder read as a
  // stick laid on the membrane)
  const bone = useMemo(() => new THREE.Color(color).multiplyScalar(0.7).getHex(), [color]);
  const skin = useMemo(() => new THREE.Color(color).multiplyScalar(0.85).getHex(), [color]);
  return (
    <group position={build.off}>
     <group ref={flapRef}>
      {feathered ? (
        <>
          <mesh ref={foldRef} geometry={build.w.surface} castShadow>
            <meshPhysicalMaterial vertexColors roughness={0.72} sheen={0.6} sheenRoughness={0.4} side={THREE.DoubleSide} />
          </mesh>
          {build.spread && (
            <mesh ref={spreadRef} geometry={build.spread} visible={false} castShadow>
              <meshPhysicalMaterial vertexColors roughness={0.72} sheen={0.6} sheenRoughness={0.4} side={THREE.DoubleSide} />
            </mesh>
          )}
        </>
      ) : (
        <>
          {/* at rest folded along the flank; in flight opened out (see buildFoldedMembraneWing) */}
          <group ref={foldGroup}>
            <MembraneWing surface={build.w.surface} bones={build.bones} wrist={build.w.wrist} skin={skin} bone={bone} lite={lite} />
          </group>
          {build.open && (
            <group ref={openGroup} visible={false}>
              <MembraneWing surface={build.open.surface} bones={build.openBones} wrist={build.open.wrist} skin={skin} bone={bone} lite={lite} />
            </group>
          )}
        </>
      )}
     </group>
    </group>
  );
}

type WingBoneMesh = { pos: [number, number, number]; quat: [number, number, number, number]; len: number; r0: number; r1: number; buried?: boolean };
// A membrane wing as drawn: its skin, the arm and finger bones in the wing's own skin a shade deeper,
// and the thumb claw at the wrist.
function MembraneWing({ surface, bones, wrist, skin, bone, lite }: { surface: THREE.BufferGeometry; bones: WingBoneMesh[]; wrist: THREE.Vector3 | null; skin: number; bone: number; lite: boolean }) {
  return (
    <>
      <mesh geometry={surface} castShadow>
        <meshPhysicalMaterial color={skin} roughness={0.62} sheen={0.3} sheenRoughness={0.5} side={THREE.DoubleSide} transparent opacity={0.93} />
      </mesh>
      {!lite && bones.map((b, i) => b.buried ? null : (
        <group key={i} position={b.pos} quaternion={b.quat}>
          <mesh castShadow>
            <cylinderGeometry args={[b.r1, b.r0, b.len, 10]} />
            <meshStandardMaterial color={bone} roughness={0.55} />
          </mesh>
          {/* rounded joints: knuckles at both ends, not flat-cut tube ends */}
          <mesh position={[0, -b.len / 2, 0]}>
            <sphereGeometry args={[b.r0, 10, 8]} />
            <meshStandardMaterial color={bone} roughness={0.55} />
          </mesh>
          <mesh position={[0, b.len / 2, 0]}>
            <sphereGeometry args={[b.r1, 8, 6]} />
            <meshStandardMaterial color={bone} roughness={0.55} />
          </mesh>
        </group>
      ))}
      {!lite && wrist && bones.length > 0 && (
        <mesh position={[wrist.x, wrist.y + bones[0].r1 * 0.6, wrist.z]} rotation={[-0.4, 0, 0]} castShadow>
          <coneGeometry args={[bones[0].r1 * 0.7, bones[0].r1 * 3.2, 7]} />
          <meshStandardMaterial color={0x2a2420} roughness={0.45} />
        </mesh>
      )}
    </>
  );
}

// A feathered tail: a fan of long rectrices spread behind the tail tip (wings.ts), sized to the trunk.
function TailFan({ phenotype }: { phenotype: Phenotype }) {
  const g = phenotype.genomeRef;
  const geo = useMemo(() => {
    const trunk = phenotype.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
    let girth = 0.3;
    let z0 = Infinity, z1 = -Infinity;
    for (const n of trunk) {
      girth = Math.max(girth, n.radius);
      z0 = Math.min(z0, n.pos[2] - n.radius);
      z1 = Math.max(z1, n.pos[2] + n.radius);
    }
    const len = Number.isFinite(z1 - z0) ? z1 - z0 : 1;
    const pal = g.palette;
    const plumage = coatMain(pal);
    const accent = coatPattern(pal);
    // (a little longer than it was: at a little over half the trunk, behind a hawk's wing tips it was a stub)
    return buildTailFan(Math.max(len * 0.68, girth * 1.8), plumage, accent, 0.2 + (g.seed % 5) * 0.06);
  }, [phenotype, g]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} castShadow>
      <meshPhysicalMaterial vertexColors roughness={0.72} sheen={0.6} sheenRoughness={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

// A tail club: a knobbed mace with short spikes (ankylosaur / dragon).
function Club({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.8).getHex(), [color]);
  const spikes: [number[], [number, number, number]][] = [
    [[0, r * 1.5, 0], [0, 0, 0]],
    [[0, -r * 1.5, 0], [Math.PI, 0, 0]],
    [[r * 1.5, 0, 0], [0, 0, -Math.PI / 2]],
    [[-r * 1.5, 0, 0], [0, 0, Math.PI / 2]],
    [[0, 0, r * 1.5], [Math.PI / 2, 0, 0]],
  ];
  return (
    <group quaternion={f.quat}>
      <mesh castShadow>
        <icosahedronGeometry args={[r * 1.5, 0]} />
        <meshStandardMaterial color={dark} roughness={0.6} metalness={0.05} flatShading />
      </mesh>
      {spikes.map(([pos, rot], i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={rot} castShadow>
          <coneGeometry args={[r * 0.34, r * 1.1, 6]} />
          <meshStandardMaterial color={dark} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

// A tail barb: a single sharp, slightly hooked sting (scorpion / wyvern).
function Barb({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.65).getHex(), [color]);
  return (
    <group quaternion={f.quat}>
      <mesh position={[0, r * 0.4, r * 1.1]} rotation={[Math.PI / 2 - 0.6, 0, 0]} castShadow>
        <coneGeometry args={[r * 0.5, r * 3.0, 8]} />
        <meshStandardMaterial color={dark} roughness={0.45} metalness={0.1} />
      </mesh>
    </group>
  );
}

// An ear (pointed / leaf / round by style). Aimed up; the part frame's +Z points up.
/** Bake the covering shader's per-vertex inputs onto a feature mesh authored in the body frame
 *  relative to its node (rest body space = local + origin). */
function bakeSkin(g: THREE.BufferGeometry, origin: readonly number[]): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const body = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    body[i * 3] = pos.getX(i) + origin[0];
    body[i * 3 + 1] = pos.getY(i) + origin[1];
    body[i * 3 + 2] = pos.getZ(i) + origin[2];
  }
  g.setAttribute('aBodyPos', new THREE.BufferAttribute(body, 3));
  g.setAttribute('aFlesh', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
  g.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
  return g;
}

function Ear({ f, color, skin, origin, bare = false }: { f: MeshFeature; color: number; skin?: THREE.Material; origin: readonly number[]; bare?: boolean }) {
  const r = Math.max(f.radius, 0.06);
  const v = earVariant(f.style);
  const geo = useMemo(() => {
    const g = earGeometry(v, r, f.quat);
    bakeSkin(g.outer, origin);
    return g;
  }, [v, r, f.quat, origin]);
  useEffect(() => () => {
    geo.outer.dispose();
    geo.inner.dispose();
  }, [geo]);
  // (a mouse's ear is bare pink skin inside, like its paws: the dusky inner ear every mammal wears was,
  // in the shadow of a mouse's big round cup, a dark slot)
  const innerColor = useMemo(() => (bare ? new THREE.Color(BARE_PAW).lerp(new THREE.Color(0xe8b4b0), 0.35).getHex() : new THREE.Color(color).lerp(new THREE.Color(0x8a5552), 0.55).multiplyScalar(0.8).getHex()), [color, bare]);
  return (
    <group>
      {skin ? (
        <mesh geometry={geo.outer} material={skin} castShadow />
      ) : (
        <mesh geometry={geo.outer} castShadow>
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      )}
      <mesh geometry={geo.inner}>
        <meshStandardMaterial color={innerColor} roughness={0.75} />
      </mesh>
    </group>
  );
}

// Gills on the side of the neck, by the part's style: a bony fish's gill COVER — one curved edge, the
// rear rim of the plate over its gills; a rake of dark bars (what every gilled body had); or a
// shark's SLITS — five thin creases. The cover and the slits lie IN the skin (standing proud as the
// bars do, they broke a fish's outline like vents): they are traced over the surface (gills.ts).
function Gill({ f, color, phenotype, surface }: { f: MeshFeature; color: number; phenotype: Phenotype; surface: SkinSurface }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.5).getHex(), [color]);
  const cut = gillCutOf(f.style);
  const marks = useMemo(() => (cut === 'bars' ? null : gillGeometry(gillMarks(phenotype, f.idx, surface, cut, gillRadiusOf(phenotype, f.idx, cut, r)))), [cut, phenotype, f.idx, surface, r]);
  useEffect(() => () => marks?.dispose(), [marks]);
  if (marks) {
    return (
      <mesh geometry={marks}>
        <meshStandardMaterial color={dark} roughness={0.6} />
      </mesh>
    );
  }
  return (
    <group quaternion={f.quat}>
      {[-0.55, -0.18, 0.18, 0.55].map((off, i) => (
        <mesh key={i} position={[off * r, 0, r * 0.15]} scale={[r * 0.1, r * 0.9, r * 0.4]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={dark} roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

// A crest: a fan of thin feathered/membranous blades (songbird / basilisk).
/**
 * A crest: a tuft standing on the crown, in the upright plane through the head's length, sweeping
 * back — the front ones near upright, the rear ones lying back, the middle ones longest; on a bird
 * feathers, on anything else pointed blades. Each is thin across the head, so it stands and is seen
 * side-on. (Its blades were flat across its own aim, which points up: they lay on the crown as a
 * paper hat.)
 */
function Crest({ f, color, feathered }: { f: MeshFeature; color: number; feathered: boolean }) {
  const r = Math.max(f.radius, 0.06);
  const blades = useMemo(() => {
    const inv = new THREE.Quaternion(f.quat[0], f.quat[1], f.quat[2], f.quat[3]).invert();
    const up = new THREE.Vector3(0, 0, 1); // the crest's aim, off the crown
    // the body's back (−Z), in the crest's own frame, flattened onto the crown
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(inv);
    back.addScaledVector(up, -back.dot(up));
    if (back.lengthSq() < 1e-6) back.set(0, -1, 0);
    else back.normalize();
    const side = new THREE.Vector3().crossVectors(up, back).normalize();
    const N = CREST_BLADES;
    return Array.from({ length: N }, (_, i) => {
      const u = i / (N - 1);
      const sweep = 0.2 + 0.85 * u;
      const lat = (i % 2 ? 1 : -1) * 0.1 * (1 - u);
      const dir = up.clone().multiplyScalar(Math.cos(sweep)).addScaledVector(back, Math.sin(sweep)).addScaledVector(side, lat).normalize();
      const len = r * (1.5 + 1.0 * Math.sin(Math.PI * (0.25 + 0.6 * u)));
      // the blade's thin axis across the head, its broad face in the plane of up and back
      const thin = side.clone().addScaledVector(dir, -side.dot(dir)).normalize();
      const broad = new THREE.Vector3().crossVectors(dir, thin);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(thin, broad, dir));
      const root = back.clone().multiplyScalar(r * 0.7 * (u - 0.35));
      return { root, q, len };
    });
  }, [f.quat, r]);
  return (
    <group quaternion={f.quat}>
      {blades.map((b, i) => (
        <group key={i} position={b.root} quaternion={b.q}>
          {feathered ? (
            // a feather: a lens from the root out along the blade
            <mesh position={[0, 0, b.len * 0.5]} scale={[r * 0.06, r * 0.3, b.len * 0.5]} castShadow>
              <sphereGeometry args={[1, 8, 8]} />
              <meshStandardMaterial color={color} roughness={0.6} side={THREE.DoubleSide} />
            </mesh>
          ) : (
            // a pointed blade (a cone along its length, flattened across the head)
            <mesh position={[0, 0, b.len * 0.5]} rotation={[Math.PI / 2, 0, 0]} scale={[0.25, 1, 1]} castShadow>
              <coneGeometry args={[r * 0.3, b.len, 6]} />
              <meshStandardMaterial color={color} roughness={0.55} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
const CREST_BLADES = 5;

// Whiskers: a small fan of fine pale filaments off the snout.
function Whisker({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const pale = useMemo(() => new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45).getHex(), [color]);
  return (
    <group quaternion={f.quat}>
      {[-0.35, 0, 0.35].map((ang, i) => (
        <group key={i} rotation={[0, ang, 0]}>
          <mesh position={[0, -r * 0.1, r * 1.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[r * 0.03, r * 0.07, r * 3.0, 4]} />
            <meshStandardMaterial color={pale} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
