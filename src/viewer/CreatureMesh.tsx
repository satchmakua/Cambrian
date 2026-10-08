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
import type { Phenotype } from '../engine/grow';
import { unitHash } from '../engine/rng';
import { buildMeshData, type MeshFeature } from './meshData';
import { eyeVariant, earVariant } from './partStyles';
import { Mouth } from './mouths';
import type { Carve } from './bodyField';
import type { SkinSurface } from './mouthLine';
import { makeCreatureMaterial } from './creatureMaterial';
import { bareLegsOf, footPlanOf, lastLinkOf, toedFootGeometry, type FootPlan } from './feet';
import { shankColor } from './keratin';
import { buildSmoothGeometry, buildShellGeometry, type SkinQuality } from './smoothSkin';
import { buildFeatheredWing, buildMembraneWing, buildSpreadFeatheredWing, buildTailFan, conformToSurface, buildFin, finKindOf } from './wings';
import { ensureSkinWeights, type RigInstance } from './rig';
import { buildFieldPrims, fieldAt } from './bodyField';
import { getGeometry, retainGeometry, releaseGeometry } from './geometryCache';
import { mouthCarves } from './mouthLine';
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
function irisFor(seed: number): number {
  const total = IRIS_PALETTE.reduce((t, e) => t + e[0], 0);
  // two independent hashes: one picks the swatch, one jitters hue/sat a touch for within-type variety
  let r = unitHash(seed, 0x1e5) * total;
  let e = IRIS_PALETTE[0];
  for (const c of IRIS_PALETTE) {
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

const skinKey = (full: boolean, quality: SkinQuality, carved = true) => `${full ? 'hybrid' : 'smooth'}:${quality}${carved ? '' : ':intact'}`;

function buildSkin(phenotype: Phenotype, full: boolean, carves: readonly Carve[], quality: SkinQuality): THREE.BufferGeometry {
  const g = buildSmoothGeometry(phenotype, full, carves, quality);
  // smooth mesh is untransformed, so its local position *is* the body-space coord (M17)
  g.setAttribute('aBodyPos', (g.getAttribute('position') as THREE.BufferAttribute).clone());
  return g;
}

/** Build (and cache) a creature's smooth surface ahead of mounting it — the World schedules these
 *  one per frame so a burst of new genomes never stalls rendering. Same key/builder as CreatureMesh. */
export function prebuildSkin(phenotype: Phenotype, mode: 'smooth' | 'hybrid', quality: SkinQuality, carved = true): void {
  const full = mode === 'hybrid';
  getGeometry(phenotype, skinKey(full, quality, carved), () =>
    buildSkin(phenotype, full, carved ? mouthCarves(phenotype) : NO_CARVES, quality),
  );
}

export function CreatureMesh({
  phenotype,
  skinMode = 'capsules',
  trajectory = null,
  quality = 'high',
  rig = null,
  detail = 'full',
  carved = true,
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
}) {
  const data = useMemo(() => buildMeshData(phenotype), [phenotype]);
  const pal = phenotype.genomeRef.palette;
  const cov = phenotype.genomeRef.covering;
  const seed = phenotype.genomeRef.seed;

  const bodyMat = useMemo(() => makeCreatureMaterial(pal, cov, seed, bareLegsOf(phenotype)), [pal, cov, seed, phenotype]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

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
  const hasShell = useMemo(() => phenotype.nodes.some((n) => n.terminal === 'carapace'), [phenotype]);
  const shellKey = `shell:${quality}`;
  const shellGeo = useMemo(() => {
    if (!hasShell) return null;
    return getGeometry(phenotype, shellKey, () => {
      const g = buildShellGeometry(phenotype, quality);
      if (!g) return new THREE.BufferGeometry();
      g.setAttribute('aBodyPos', (g.getAttribute('position') as THREE.BufferAttribute).clone());
      return g;
    });
  }, [hasShell, phenotype, quality, shellKey]);
  useEffect(() => {
    if (!shellGeo) return;
    retainGeometry(phenotype, shellKey);
    return () => releaseGeometry(phenotype, shellKey);
  }, [shellGeo, phenotype, shellKey]);
  // the shell wears hard scutes: plates (turtle) or the body's own chitin (crab), a darker tone of
  // the body hue with a bold reticulate seam pattern
  const shellMat = useMemo(() => {
    if (!hasShell) return null;
    const shellPal = { ...pal, light: pal.light * 0.82, sat: pal.sat * 0.9, hueB: pal.hueA };
    const shellCov = {
      ...cov,
      type: cov.type === 'chitin' ? ('chitin' as const) : ('plates' as const),
      pattern: 'reticulate' as const,
      patternScale: 2.4,
      patternContrast: 0.55,
    };
    return makeCreatureMaterial(shellPal, shellCov, seed ^ 0x5e11);
  }, [hasShell, pal, cov, seed]);
  useEffect(() => () => shellMat?.dispose(), [shellMat]);

  const playing = !!trajectory; // the recorded physics gait is the only motion left

  const footColor = useMemo(
    () => new THREE.Color().setHSL(pal.hueA, pal.sat, Math.max(0.12, pal.light * 0.45)).getHex(),
    [pal],
  );
  const finColor = useMemo(() => new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light).getHex(), [pal]);
  // Iris color — deterministic per creature (from its seed), drawn from a curated eye palette rather
  // than tied to the body hue (which gave every animal an eye a shade off its own coat). Warm animal
  // colors dominate; striking blues/reds/violets appear as a minority, so eye colour is a real point
  // of variety without every creature reading as a clown.
  const irisColor = useMemo(() => irisFor(seed), [seed]);

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
      return g;
    });
  }, [data]);
  const capsuleGeos = useMemo(() => {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const qq = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    return data.edges.map((e, k) => {
      const g = new THREE.CapsuleGeometry(e.radius, baseCaps[k].len, 6, 14);
      bakeBodyPos(g, m.compose(p.fromArray(baseCaps[k].pos), qq.fromArray(baseCaps[k].quat), one));
      return g;
    });
  }, [data, baseCaps]);
  // A static kit (no recorded gait to play) is ONE merged mesh — the capsule kit is ~20–60 parts, and
  // as separate meshes it cost a draw call each (the World's fallback while smooth skins build).
  const kitGeo = useMemo(() => {
    if (trajectory) return null; // a playing gait re-poses the individual parts every frame
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
    return merged;
  }, [trajectory, skinMode, data, sphereGeos, capsuleGeos, baseCaps]);
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
    const sm = new THREE.SkinnedMesh(smoothGeo, bodyMat);
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.add(rig.root);
    sm.bind(rig.skeleton, new THREE.Matrix4());
    return sm;
  }, [rigged, rig, smoothGeo, bodyMat, phenotype]);
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

  const featureNodes = data.features.map((f, k) => {
    if (detail !== 'full' && !keepAt(detail, f)) return null;
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
      </group>
    );
  }

  return (
    <group>
      {showSmooth && smoothGeo ? (
        // M15: a single welded organic surface replaces the capsule kit
        <mesh geometry={smoothGeo} material={bodyMat} castShadow receiveShadow />
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
    </group>
  );
}

// --- level of detail ----------------------------------------------------------------------------

/** Which features survive a reduced level of detail: the silhouette parts always (a wing, a fin, a
 *  horn reads from across the meadow); at 'lite' also the eyes (simplified), ears, pincers and tail
 *  weapons. Teeth/lips, toes, whiskers and gill slits are sub-pixel at a distance — dropped. */
function keepAt(detail: Detail, f: MeshFeature): boolean {
  const silhouette = f.type === 'fin' || f.type === 'crest' || (f.type === 'claw' && f.kind === 'horn');
  if (detail === 'none') return silhouette;
  return silhouette || f.type === 'eye' || f.type === 'ear' || f.type === 'pincer' || f.type === 'club' || f.type === 'barb';
}

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
}) {
  switch (f.type) {
    case 'eye':
      return <Eye f={f} socket={footColor} iris={irisColor} lid={finColor} seed={phenotype.genomeRef.seed} skin={skin} phenotype={phenotype} />;
    case 'mouth':
      return (
        <Mouth f={f} dark={footColor} skin={skin} phenotype={phenotype} carves={carves} recessed={recessed} surface={surface} />
      );
    case 'pincer':
      return <Pincer f={f} color={footColor} />;
    case 'fin':
      return f.kind === 'wing' ? (
        <Wing f={f} color={finColor} phenotype={phenotype} lite={lite} />
      ) : f.kind === 'tail' && phenotype.genomeRef.covering.type === 'feathers' ? (
        <TailFan phenotype={phenotype} />
      ) : f.kind === 'frill' ? (
        <Frill f={f} color={finColor} />
      ) : (
        <Fin f={f} color={finColor} lite={lite} phenotype={phenotype} />
      );
    case 'claw': {
      if (f.kind === 'horn') return <Horn f={f} color={footColor} />;
      const plan = f.kind === 'leg' ? footPlanOf(phenotype) : null;
      return plan ? <ToedFoot f={f} plan={plan} skin={skin} phenotype={phenotype} /> : <Claw f={f} color={footColor} />;
    }
    case 'club':
      return <Club f={f} color={footColor} />;
    case 'barb':
      return <Barb f={f} color={footColor} />;
    case 'ear':
      return <Ear f={f} color={footColor} skin={skin} origin={phenotype.nodes[f.idx].pos} />;
    case 'gill':
      return <Gill f={f} color={footColor} />;
    case 'crest':
      return <Crest f={f} color={finColor} />;
    case 'carapace':
      return null; // the conforming shell is drawn by CreatureMesh from the trunk field
    case 'whisker':
      return <Whisker f={f} color={footColor} />;
    case 'paw':
      return <Paw f={f} color={footColor} skin={skin} origin={phenotype.nodes[f.idx].pos} />;
    case 'hoof':
      return <Hoof f={f} color={footColor} />;
    case 'hand':
      return <Hand f={f} color={footColor} />;
    default:
      return <Foot f={f} color={footColor} />;
  }
}

// --- eyes (5 styles by `style`) — the emotional anchor -----------------------

// A lid: a hemisphere just outside the eyeball, rotated about the eye's X axis to open or close (its
// front rim is the lid margin; the back rim hides in the head). Shared unit geometries.
const UPPER_LID = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const LOWER_LID = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);

const LID_OPEN = { upper: -0.62, lower: 0.72 } as const;
const REPTILE_IRIS = [0xb08a2e, 0xa8661f, 0x7d8a33, 0x9a4f24, 0x8f8a6e, 0xc2a046];

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
  const lidded = v === 'round' || v === 'beady' || v === 'slit';
  const slitIris = useMemo(() => REPTILE_IRIS[Math.floor(unitHash(seed, 0x511) * REPTILE_IRIS.length)], [seed]);
  const sink = lidded && onFace ? r * 0.36 : 0;
  const lidColor = useMemo(() => new THREE.Color(lid).multiplyScalar(0.82).getHex(), [lid]);
  const origin = phenotype?.nodes[f.idx].pos;
  const lidGeo = useMemo(() => {
    if (!lidded || !skin || !origin) return null;
    return {
      upper: lidGeometry(UPPER_LID, r * 0.97, LID_OPEN.upper, sink, f.quat, origin),
      lower: lidGeometry(LOWER_LID, r * 0.96, LID_OPEN.lower, sink, f.quat, origin),
    };
  }, [lidded, skin, origin, r, sink, f.quat]);
  useEffect(() => () => {
    lidGeo?.upper.dispose();
    lidGeo?.lower.dispose();
  }, [lidGeo]);
  const lids = useContext(LidContext);
  const upper = useRef<THREE.Mesh>(null);
  const lower = useRef<THREE.Mesh>(null);
  const phase = useMemo(() => ((seed >>> 0) % 997) / 997, [seed]);
  useFrame((st) => {
    if (!lidded || !upper.current || !lower.current) return;
    const close = Math.max(lids ? lids.shut : 0, blinkAt(st.clock.elapsedTime, phase));
    // open: the upper margin rides ~35° above the eye's equator, the lower ~42° below; shut: they meet
    // a little below centre
    upper.current.rotation.x = LID_OPEN.upper + close * 0.78;
    lower.current.rotation.x = LID_OPEN.lower - close * 0.62;
  });
  return (
    <group quaternion={f.quat}>
      <group position={[0, 0, -sink]}>
      {lidded && lidGeo && skin ? (
        <>
          {/* (geometry pre-scaled; the open rotation is baked into aBodyPos only — the mesh rotates) */}
          <mesh ref={upper} geometry={lidGeo.upper} material={skin} rotation-x={LID_OPEN.upper} />
          <mesh ref={lower} geometry={lidGeo.lower} material={skin} rotation-x={LID_OPEN.lower} />
        </>
      ) : lidded ? (
        <>
          <mesh ref={upper} geometry={UPPER_LID} scale={r * 0.97} rotation-x={LID_OPEN.upper}>
            <meshStandardMaterial color={lidColor} roughness={0.72} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={lower} geometry={LOWER_LID} scale={r * 0.96} rotation-x={LID_OPEN.lower}>
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
      {!lidded && (
        <mesh position={[0, 0, -r * 0.18]}>
          <torusGeometry args={[r * 1.2, r * 0.26, 12, 28]} />
          <meshStandardMaterial color={socketDark} roughness={0.85} metalness={0.0} />
        </mesh>
      )}
      {v === 'round' || v === 'beady' ? (
        // a wet animal eye set deep under a heavy brow — dark, glassy, watching. No cream sclera,
        // no fat white sticker; the low-roughness ball catches the environment like real moisture.
        <>
          {/* the eyeball — bloodshot dark amber (round) or a glossy black bead (beady), set deep */}
          <mesh position={[0, 0, -r * 0.04]}>
            <sphereGeometry args={[r * 0.9, 22, 18]} />
            <meshStandardMaterial color={v === 'round' ? 0x3c1f16 : 0x070709} roughness={0.12} metalness={0.0} />
          </mesh>
          {/* Iris + pupil are shallow CAPS lying flush on the eyeball, not balls stacked in front of
              it — full spheres at +z bulged past the ball's pole and read as googly cartoon eyes.
              Each is squashed in z and parked so its face just clears the 0.86r front pole. */}
          <mesh position={[0, 0, r * 0.70]} scale={[1, 1, 0.3]}>
            <sphereGeometry args={[r * 0.62, 20, 14]} />
            <meshStandardMaterial color={iris} roughness={0.16} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0, r * 0.8]} scale={[1, 1, 0.3]}>
            <sphereGeometry args={[r * (v === 'round' ? 0.32 : 0.42), 16, 12]} />
            <meshStandardMaterial color={0x030304} roughness={0.05} />
          </mesh>
          {/* a small, sharp catchlight — a wet glint, not a cartoon sticker */}
          <mesh position={[r * 0.17, r * 0.2, r * 0.88]}>
            <sphereGeometry args={[r * 0.05, 8, 8]} />
            <meshBasicMaterial color={0xdce4f0} />
          </mesh>
        </>
      ) : v === 'slit' ? (
        // slit — a reptile vertical-pupil eye sunk under a brow; the whole visible ball is iris, so it
        // takes a reptile's colours (gold, amber, olive, copper, stone) — a blue marble read as a toy
        <>
          <mesh position={[0, 0, -r * 0.02]}>
            <sphereGeometry args={[r * 0.9, 18, 14]} />
            <meshStandardMaterial color={slitIris} roughness={0.28} metalness={0.22} />
          </mesh>
          <mesh position={[0, 0, r * 0.66]} scale={[0.14, 1.0, 0.4]}>
            <sphereGeometry args={[r * 0.82, 10, 14]} />
            <meshStandardMaterial color={0x040406} roughness={0.06} />
          </mesh>
          <mesh position={[r * 0.12, r * 0.24, r * 0.78]}>
            <sphereGeometry args={[r * 0.045, 8, 8]} />
            <meshBasicMaterial color={0xdce4f0} />
          </mesh>
        </>
      ) : v === 'compound' ? (
        // compound — a dark faceted dome (insect)
        <mesh position={[0, 0, r * 0.08]}>
          <icosahedronGeometry args={[r * 0.98, 1]} />
          <meshStandardMaterial color={0x121620} roughness={0.22} metalness={0.65} flatShading />
        </mesh>
      ) : (
        // glowing — a dim, sickly emissive alien eye with a dark pupil, sunk in the socket (no flashlight)
        <>
          <mesh position={[0, 0, r * 0.06]}>
            <sphereGeometry args={[r * 0.9, 16, 12]} />
            <meshStandardMaterial color={0x0a1410} emissive={0x3fd8a8} emissiveIntensity={1.15} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0, r * 0.6]}>
            <sphereGeometry args={[r * 0.3, 10, 10]} />
            <meshStandardMaterial color={0x02120c} roughness={0.1} />
          </mesh>
        </>
      )}
      </group>
    </group>
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
function pawGeometry(r: number, origin: readonly number[]): { fur: THREE.BufferGeometry; claws: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const sole = new THREE.SphereGeometry(1, 18, 12);
  // the sole's underside sits on the ground plane (the foot node's own bottom, −r)
  sole.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, -r * 0.2, r * 0.42), new THREE.Quaternion(), new THREE.Vector3(r * 1.5, r * 0.8, r * 1.7)));
  parts.push(sole);
  const claws: THREE.BufferGeometry[] = [];
  for (const [x, z] of PAW_TOES) {
    const toe = new THREE.SphereGeometry(1, 12, 8);
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

function Paw({ f, color, skin, origin }: { f: MeshFeature; color: number; skin?: THREE.Material; origin: readonly number[] }) {
  const r = Math.max(f.radius, 0.06);
  const geo = useMemo(() => pawGeometry(r, origin), [r, origin]);
  useEffect(() => () => {
    geo.fur.dispose();
    geo.claws.dispose();
  }, [geo]);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.45).getHex(), [color]);
  return (
    <group>
      {skin ? (
        <mesh geometry={geo.fur} material={skin} castShadow />
      ) : (
        <mesh geometry={geo.fur} castShadow>
          <meshStandardMaterial color={color} roughness={0.78} />
        </mesh>
      )}
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

// A toed foot (feet.ts): a bird's four thin toes or a lizard's splayed five, in the body's own
// covering (the bare-shank keratin, for a bird), with dark claws.
function ToedFoot({ f, plan, skin, phenotype }: { f: MeshFeature; plan: FootPlan; skin: THREE.Material; phenotype: Phenotype }) {
  const r = Math.max(f.radius, 0.04);
  const origin = phenotype.nodes[f.idx].pos;
  const link = useMemo(() => lastLinkOf(phenotype, f.idx), [phenotype, f.idx]);
  const geo = useMemo(() => {
    const g = toedFootGeometry(plan, r, link);
    return { toes: bakeSkin(g.toes, origin), claws: g.claws };
  }, [plan, r, link, origin]);
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

// A horn: a smooth tapering spike along the part's aim.
function Horn({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const keratin = useMemo(() => new THREE.Color(color).lerp(new THREE.Color(0xcfc3a0), 0.4).getHex(), [color]);
  return (
    <group quaternion={f.quat}>
      <mesh position={[0, 0, r * 1.8]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[r * 0.9, r * 3.6, 10]} />
        <meshStandardMaterial color={keratin} roughness={0.5} metalness={0.05} />
      </mesh>
    </group>
  );
}

// A pincer: two prongs that converge — a crab claw.
function Pincer({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <group quaternion={f.quat}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * r * 0.45, 0, r * 0.9]} rotation={[Math.PI / 2, 0, side * 0.45]} scale={[r * 0.45, r * 2.0, r * 0.45]} castShadow>
          <coneGeometry args={[1, 1, 7]} />
          <meshStandardMaterial color={color} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

// A fin, built in the body frame from its aim (wings.ts buildFin): a raked dorsal sail, swept
// pectoral and pelvic paddles lying along the flank, a forked caudal fan — sized to the body's girth.
function Fin({ f, color, lite = false, phenotype }: { f: MeshFeature; color: number; lite?: boolean; phenotype: Phenotype }) {
  const build = useMemo(() => {
    const q = new THREE.Quaternion(f.quat[0], f.quat[1], f.quat[2], f.quat[3]);
    const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    // girth: the radius of the body node this fin grows from (walk up past the fin chain)
    const parent = new Int32Array(phenotype.nodes.length).fill(-1);
    for (const [a, b] of phenotype.edges) parent[b] = a;
    let c = parent[f.idx];
    while (c >= 0 && phenotype.nodes[c].kind !== 'spine') c = parent[c];
    const girth = c >= 0 ? phenotype.nodes[c].radius : Math.max(f.radius, 0.2) * 2;
    const kind = finKindOf(aim, f.kind);
    // a caudal grows at the tail tip, where the body is thin — size it to the trunk instead
    const g = kind === 'caudal' ? Math.max(girth, trunkGirth(phenotype) * 0.8) : girth;
    return buildFin(kind, aim, g, 0.8 + f.style * 0.6);
  }, [f, phenotype]);
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

function trunkGirth(p: Phenotype): number {
  let g = 0;
  for (const n of p.nodes) if (n.kind === 'spine' && (n.segment ?? 0) === 0) g = Math.max(g, n.radius);
  return g || 0.4;
}

// A frill: a broad, thin fanned collar — wider and rounder than a fin.
function Frill({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh quaternion={f.quat} scale={[r * 2.1, r * 1.5, r * 0.16]} castShadow>
      <sphereGeometry args={[1, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.0} side={THREE.DoubleSide} />
    </mesh>
  );
}

// A wing, built from the SHOULDER in the body frame (see wings.ts): a folded feathered wing for a
// feathered creature, a spread membrane (arm + finger bones + scalloped billowing skin) otherwise.
// The feature group sits at the wing's tip node, so the build is offset back to the shoulder.
function Wing({ f, color, phenotype, lite = false }: { f: MeshFeature; color: number; phenotype: Phenotype; lite?: boolean }) {
  const g = phenotype.genomeRef;
  const feathered = g.covering.type === 'feathers';
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
    const plumage = new THREE.Color().setHSL(pal.hueA, pal.sat * 0.8, pal.light * 0.88);
    const accent = new THREE.Color().setHSL(pal.hueB, Math.min(1, pal.sat * 1.1), 0.42);
    const foldS = (trunkLen * 1.05 + girth * 0.9) * (0.85 + gene * 0.3);
    const w = feathered
      ? buildFeatheredWing(side, foldS, plumage, accent)
      : buildMembraneWing(side, Math.max(trunkLen * 1.15, girth * 3) * (0.75 + gene * 0.5), 0.55 + 0.3 * (g.seed % 7) / 7);
    // the flight posture: the same plumage opened out — a wing reaches further spread than folded
    const spread = feathered ? buildSpreadFeatheredWing(side, foldS * 1.35, plumage, accent).surface : null;
    // a folded wing tucks against the UPPER FLANK (a bird's wing lies along its side, not on its
    // spine): anchor it on the trunk node nearest the shoulder, out at its side and a little above
    // the midline, slightly forward — rather than at the dorsal attach point the gene aimed for.
    let anchor: readonly number[] = shoulder;
    if (feathered && trunk.length) {
      let near = trunk[0];
      for (const n of trunk) if (Math.abs(n.pos[2] - shoulder[2]) < Math.abs(near.pos[2] - shoulder[2])) near = n;
      const rx = near.radius * (near.scale?.[0] ?? 1);
      anchor = [near.pos[0] + side * rx * 0.86, near.pos[1] + near.radius * 0.28, near.pos[2] + near.radius * 0.35];
    }
    const off: [number, number, number] = [anchor[0] - tip[0], anchor[1] - tip[1], anchor[2] - tip[2]];
    if (feathered) {
      // wrap the folded wing around the flank (the same field the hybrid skin is meshed from)
      const prims = buildFieldPrims(phenotype, 'hybrid');
      let meanR = 0;
      for (let i = 0; i < prims.nc; i++) meanR += prims.pr[i];
      prims.k = 0.34 * (meanR / Math.max(prims.nc, 1));
      conformToSurface(w.surface, (x, y, z) => fieldAt(prims, x, y, z), anchor, girth * 0.04);
    }
    const bones = w.bones.map((b) => {
      const d = b.b.clone().sub(b.a);
      const len = Math.max(d.length(), 1e-4);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
      const mid = b.a.clone().add(b.b).multiplyScalar(0.5);
      return { pos: [mid.x, mid.y, mid.z] as [number, number, number], quat: [q.x, q.y, q.z, q.w] as [number, number, number, number], len, r0: b.r0, r1: b.r1 };
    });
    return { w, off, bones, side, spread };
  }, [phenotype, f.idx, f.radius, feathered, g]);
  useEffect(() => () => {
    build.w.surface.dispose();
    build.spread?.dispose();
  }, [build]);
  // flight: fold ↔ spread, and the wingbeat as a roll about the body axis at the shoulder
  const flight = useContext(FlightContext);
  const flapRef = useRef<THREE.Group>(null);
  const foldRef = useRef<THREE.Mesh>(null);
  const spreadRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const sp = flight ? flight.spread : 0;
    if (flapRef.current) flapRef.current.rotation.z = build.side * (flight ? flight.flap * sp : 0);
    if (foldRef.current) foldRef.current.visible = !build.spread || sp < 0.35;
    if (spreadRef.current) {
      spreadRef.current.visible = sp >= 0.35;
      // opening out: the spread wing grows from the folded length as it unfolds
      spreadRef.current.scale.setScalar(0.55 + 0.45 * THREE.MathUtils.smoothstep(sp, 0.35, 1));
    }
  });
  const bone = useMemo(() => new THREE.Color(color).multiplyScalar(0.45).getHex(), [color]);
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
          <mesh geometry={build.w.surface} castShadow>
            <meshPhysicalMaterial color={skin} roughness={0.62} sheen={0.3} sheenRoughness={0.5} side={THREE.DoubleSide} transparent opacity={0.93} />
          </mesh>
          {!lite && build.bones.map((b, i) => (
            <mesh key={i} position={b.pos} quaternion={b.quat} castShadow>
              <cylinderGeometry args={[b.r1, b.r0, b.len, 8]} />
              <meshStandardMaterial color={bone} roughness={0.5} />
            </mesh>
          ))}
          {!lite && build.w.wrist && (
            <mesh position={[build.w.wrist.x, build.w.wrist.y + build.bones[0].r1 * 0.6, build.w.wrist.z]} rotation={[-0.4, 0, 0]} castShadow>
              <coneGeometry args={[build.bones[0].r1 * 0.7, build.bones[0].r1 * 3.2, 7]} />
              <meshStandardMaterial color={0x2a2420} roughness={0.45} />
            </mesh>
          )}
        </>
      )}
     </group>
    </group>
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
    const plumage = new THREE.Color().setHSL(pal.hueA, pal.sat * 0.8, pal.light * 0.88);
    const accent = new THREE.Color().setHSL(pal.hueB, Math.min(1, pal.sat * 1.1), 0.42);
    return buildTailFan(Math.max(len * 0.55, girth * 1.6), plumage, accent, 0.2 + (g.seed % 5) * 0.06);
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

/**
 * An ear, built in the BODY frame: it rises along the part's outward aim, its face turned to the
 * front (an ear's opening looks forward, whatever roll the growth frame happened to carry), the
 * outside wearing the coat and a darker inner ear inset on the front face.
 *   pointed — a cat/fox triangle · round — a bear/mouse cup · leaf — a long rabbit/deer blade
 */
function earGeometry(v: ReturnType<typeof earVariant>, r: number, quat: readonly number[]): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const out = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3])).normalize();
  // the ear's face normal: body-forward, made perpendicular to the ear's rise
  const n = new THREE.Vector3(0, 0, 1).addScaledVector(out, -out.z);
  if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
  n.normalize();
  const side = new THREE.Vector3().crossVectors(out, n).normalize();
  // local frame: X = across the ear, Y = up the ear (out), Z = its face normal (forward)
  const basis = new THREE.Matrix4().makeBasis(side, out, n);
  const shape = (inner: boolean): THREE.BufferGeometry => {
    const k = inner ? 0.68 : 1;
    let g: THREE.BufferGeometry;
    if (v === 'pointed') {
      g = new THREE.ConeGeometry(1, 1, 12, 1);
      g.scale(r * 0.95 * k, r * 1.9 * k, r * (inner ? 0.12 : 0.34));
      g.translate(0, r * (0.95 - (inner ? 0.2 : 0)), inner ? r * 0.16 : 0);
    } else {
      g = new THREE.SphereGeometry(1, 16, 12);
      const [w, h] = v === 'round' ? [1.15, 1.1] : [0.85, 2.0];
      g.scale(r * w * k, r * h * k, r * (inner ? 0.1 : 0.3));
      g.translate(0, r * h * 0.72, inner ? r * 0.2 : 0);
    }
    g.applyMatrix4(basis);
    return g;
  };
  return { outer: shape(false), inner: shape(true) };
}

function Ear({ f, color, skin, origin }: { f: MeshFeature; color: number; skin?: THREE.Material; origin: readonly number[] }) {
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
  const innerColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color(0x8a5552), 0.55).multiplyScalar(0.8).getHex(), [color]);
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

// Gills: a rake of dark slits on the side of the neck. Aimed sideways; +Z points outward.
function Gill({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.5).getHex(), [color]);
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
function Crest({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <group quaternion={f.quat}>
      {[-0.6, -0.2, 0.2, 0.6].map((ang, i) => (
        <group key={i} rotation={[0, 0, ang]}>
          <mesh position={[0, r * 0.9, 0]} scale={[r * 0.7, r * 1.8, r * 0.07]} castShadow>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

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
