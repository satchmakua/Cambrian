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
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { mix32 } from '../engine/rng';
import { buildMeshData, type MeshFeature } from './meshData';
import { eyeVariant, earVariant } from './partStyles';
import { Mouth } from './mouths';
import type { Carve } from './bodyField';
import type { SkinSurface } from './mouthLine';
import { makeCreatureMaterial } from './creatureMaterial';
import { buildSmoothGeometry, buildShellGeometry, type SkinQuality } from './smoothSkin';
import { buildFeatheredWing, buildMembraneWing, buildTailFan, conformToSurface } from './wings';
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
  let r = (mix32(seed, 0x1e5) / 0xffffffff) * total;
  let e = IRIS_PALETTE[0];
  for (const c of IRIS_PALETTE) {
    r -= c[0];
    if (r <= 0) { e = c; break; }
  }
  const j = (mix32(seed, 0x2e5) / 0xffffffff - 0.5) * 0.05;
  return new THREE.Color().setHSL((e[1] + j + 1) % 1, e[2], e[3]).getHex();
}

// stable empty carve list for the capsule kit — the mouth builds must trace the PRISTINE surface
// when the carved one isn't rendered (a lip traced onto an invisible cavity is a buried lip)
const NO_CARVES: readonly Carve[] = [];

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

export function CreatureMesh({
  phenotype,
  skinMode = 'capsules',
  trajectory = null,
  quality = 'high',
}: {
  phenotype: Phenotype;
  skinMode?: SkinMode;
  trajectory?: Trajectory | null;
  quality?: SkinQuality;
}) {
  const data = useMemo(() => buildMeshData(phenotype), [phenotype]);
  const pal = phenotype.genomeRef.palette;
  const cov = phenotype.genomeRef.covering;
  const seed = phenotype.genomeRef.seed;

  const bodyMat = useMemo(() => makeCreatureMaterial(pal, cov, seed), [pal, cov, seed]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

  // physics playback (post-roadmap): when a recorded gait is present, capsules re-pose from it
  // each frame — so the body must be the capsule kit (the smooth mesh is static), and it animates.
  const showSmooth = skinMode !== 'capsules' && !trajectory;
  const full = skinMode === 'hybrid'; // hybrid meshes every part; smooth just the locomotor body

  // mouth overhaul: the cavity carves — subtracted from the smooth skin so the maw is a true
  // recess, and shared with the mouth builds so lips/teeth land on the same carved rim.
  const carves = useMemo(() => mouthCarves(phenotype), [phenotype]);

  // M15: one organic surface over the node field, built once (only when toggled on). The
  // smooth body is static, so motion is paused while it's shown (re-meshing per frame is dear).
  // Shared through the geometry cache: the Studio shows one creature in five viewports at once.
  const smoothKey = `${full ? 'hybrid' : 'smooth'}:${quality}`;
  const smoothGeo = useMemo(() => {
    if (!showSmooth) return null;
    return getGeometry(phenotype, smoothKey, () => {
      const g = buildSmoothGeometry(phenotype, full, carves, quality);
      // smooth mesh is untransformed, so its local position *is* the body-space coord (M17)
      g.setAttribute('aBodyPos', (g.getAttribute('position') as THREE.BufferAttribute).clone());
      return g;
    });
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

  return (
    <group>
      {showSmooth && smoothGeo ? (
        // M15: a single welded organic surface replaces the capsule kit
        <mesh geometry={smoothGeo} material={bodyMat} castShadow receiveShadow />
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
      {data.features.map((f, k) => (
        <group
          key={`f${k}`}
          ref={(el) => {
            if (el) featureRefs.current[k] = el;
          }}
          position={data.nodes[f.idx].pos}
        >
          <Feature
            f={f}
            footColor={footColor}
            finColor={finColor}
            irisColor={irisColor}
            phenotype={phenotype}
            carves={showSmooth ? carves : NO_CARVES}
            recessed={showSmooth && carves.length > 0}
            surface={showSmooth ? (full ? 'hybrid' : 'smooth') : 'kit'}
          />
        </group>
      ))}
    </group>
  );
}

// Features render at the local origin of their (animated) parent group.
function Feature({
  f,
  footColor,
  finColor,
  irisColor,
  phenotype,
  carves,
  recessed,
  surface,
}: {
  f: MeshFeature;
  footColor: number;
  finColor: number;
  irisColor: number;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean;
  surface: SkinSurface;
}) {
  switch (f.type) {
    case 'eye':
      return <Eye f={f} socket={footColor} iris={irisColor} lid={finColor} />;
    case 'mouth':
      return (
        <Mouth f={f} dark={footColor} phenotype={phenotype} carves={carves} recessed={recessed} surface={surface} />
      );
    case 'pincer':
      return <Pincer f={f} color={footColor} />;
    case 'fin':
      return f.kind === 'wing' ? (
        <Wing f={f} color={finColor} phenotype={phenotype} />
      ) : f.kind === 'tail' && phenotype.genomeRef.covering.type === 'feathers' ? (
        <TailFan phenotype={phenotype} />
      ) : f.kind === 'frill' ? (
        <Frill f={f} color={finColor} />
      ) : (
        <Fin f={f} color={finColor} />
      );
    case 'claw':
      return f.kind === 'horn' ? <Horn f={f} color={footColor} /> : <Claw f={f} color={footColor} />;
    case 'club':
      return <Club f={f} color={footColor} />;
    case 'barb':
      return <Barb f={f} color={footColor} />;
    case 'ear':
      return <Ear f={f} color={footColor} />;
    case 'gill':
      return <Gill f={f} color={footColor} />;
    case 'crest':
      return <Crest f={f} color={finColor} />;
    case 'carapace':
      return null; // the conforming shell is drawn by CreatureMesh from the trunk field
    case 'whisker':
      return <Whisker f={f} color={footColor} />;
    case 'paw':
      return <Paw f={f} color={footColor} />;
    case 'hoof':
      return <Hoof f={f} color={footColor} />;
    case 'hand':
      return <Hand f={f} color={footColor} />;
    default:
      return <Foot f={f} color={footColor} />;
  }
}

// --- eyes (5 styles by `style`) — the emotional anchor -----------------------

function Eye({ f, socket, iris, lid }: { f: MeshFeature; socket: number; iris: number; lid: number }) {
  const r = Math.max(f.radius, 0.06);
  const v = eyeVariant(f.style);
  // a dark bony orbit tone
  const socketDark = useMemo(() => new THREE.Color(socket).multiplyScalar(0.5).getHex(), [socket]);
  void lid;
  return (
    <group quaternion={f.quat}>
      {/* The brow ridge and lower lid used to live here as open hemispherical shells. Whatever
          their orientation, the shell's RIM cut a hard crescent across the sclera — an eyelid has
          to lie flat on a curved eye and a capped sphere never does. Removed; the orbit ring below
          gives the set-in read on its own.
          the bony orbit the eye is sunk into — a dark receptacle ring, so the eye reads as set INTO
          the skull (hooded, sunken), never a ball stuck on the surface.
          The ring must CLEAR the eyeball: its inner edge is (major − tube), which has to stay wider
          than the 0.9r ball or the torus drives straight through the sclera as a hard ridge. It also
          sits back along −Z so it rings the eye's equator like an orbit rather than a hoop in front. */}
      <mesh position={[0, 0, -r * 0.18]}>
        <torusGeometry args={[r * 1.2, r * 0.26, 12, 28]} />
        <meshStandardMaterial color={socketDark} roughness={0.85} metalness={0.0} />
      </mesh>
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
        // slit — a reptile vertical-pupil eye sunk under a brow, a duller metallic iris (less toy-gold)
        <>
          <mesh position={[0, 0, -r * 0.02]}>
            <sphereGeometry args={[r * 0.9, 18, 14]} />
            <meshStandardMaterial color={iris} roughness={0.28} metalness={0.22} />
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

// A paw: a soft padded foot — a sole pad, toe pads, and small claws (cat / dog / bear).
function Paw({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getHex(), [color]);
  return (
    <group>
      <mesh scale={[r * 1.3, r * 0.62, r * 1.45]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      {[-0.55, 0, 0.55].map((x, i) => (
        <mesh key={`t${i}`} position={[x * r * 0.7, -r * 0.08, r * 1.0]} scale={[r * 0.34, r * 0.42, r * 0.5]} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color={color} roughness={0.78} />
        </mesh>
      ))}
      {[-0.55, 0, 0.55].map((x, i) => (
        <mesh key={`c${i}`} position={[x * r * 0.7, -r * 0.02, r * 1.35]} rotation={[Math.PI / 2 + 0.4, 0, 0]} scale={[r * 0.1, r * 0.32, r * 0.1]} castShadow>
          <coneGeometry args={[1, 1, 6]} />
          <meshStandardMaterial color={dark} roughness={0.5} />
        </mesh>
      ))}
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
  const r = Math.max(f.radius, 0.06);
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

// A fin: a thin blade, oriented outward by the node frame.
// A fin — a broad fanned blade, not the old flattened bead on a stalk (which read as a limb stump).
// The membrane fans from the root out along the node's aim (+Z), spread in ±Y, thin along X, with
// radial fin-rays for the ribbed fish-fin look. A caudal (a tail-terminal fin, kind 'tail') is
// bigger and FORKED — a proper tail fin — so a fish's tail reads as a caudal fan.
function Fin({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const caudal = f.kind === 'tail';
  const S = r * (caudal ? 7.5 : 5.5);
  const ray = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getHex(), [color]);

  const { root, tips } = useMemo(() => {
    const RAYS = 8;
    const rt = new THREE.Vector3(0, 0, 0);
    const ts: THREE.Vector3[] = [];
    for (let i = 0; i < RAYS; i++) {
      const t = i / (RAYS - 1);
      const ang = -0.85 + t * 1.7; // fan from a leading edge to a trailing edge, around +Z
      // reach: a rounded blade (fullest mid-fan). A caudal notches in the middle → a forked fork.
      const round = 0.62 + 0.55 * Math.sin(t * Math.PI);
      const reach = caudal ? round * (1 - 0.42 * Math.exp(-((t - 0.5) ** 2) / 0.02)) : round;
      ts.push(new THREE.Vector3(0, Math.sin(ang) * reach * S, Math.cos(ang) * reach * S));
    }
    return { root: rt, tips: ts };
  }, [S, caudal]);

  const membrane = useMemo(() => {
    const verts: number[] = [];
    for (let i = 0; i < tips.length - 1; i++) {
      verts.push(root.x, root.y, root.z, tips[i].x, tips[i].y, tips[i].z, tips[i + 1].x, tips[i + 1].y, tips[i + 1].z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeVertexNormals();
    return g;
  }, [root, tips]);
  useEffect(() => () => membrane.dispose(), [membrane]);

  // fin rays — thin spars from the root to every other tip, the stiffening rods of a real fin
  const rays = useMemo(
    () =>
      tips.filter((_, i) => i % 2 === 0).map((tip) => {
        const mid = tip.clone().multiplyScalar(0.5);
        const len = Math.max(tip.length(), 1e-3);
        const q = new THREE.Quaternion().setFromUnitVectors(UP, tip.clone().normalize());
        return { pos: [mid.x, mid.y, mid.z] as [number, number, number], quat: [q.x, q.y, q.z, q.w] as [number, number, number, number], len };
      }),
    [tips],
  );

  return (
    <group quaternion={f.quat}>
      <mesh geometry={membrane} castShadow>
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.0} side={THREE.DoubleSide} transparent opacity={0.94} />
      </mesh>
      {rays.map((b, i) => (
        <mesh key={i} position={b.pos} quaternion={b.quat}>
          <cylinderGeometry args={[r * 0.04, r * 0.06, b.len, 4]} />
          <meshStandardMaterial color={ray} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
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
function Wing({ f, color, phenotype }: { f: MeshFeature; color: number; phenotype: Phenotype }) {
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
    const w = feathered
      ? buildFeatheredWing(side, (trunkLen * 1.05 + girth * 0.9) * (0.85 + gene * 0.3), plumage, accent)
      : buildMembraneWing(side, Math.max(trunkLen * 1.15, girth * 3) * (0.75 + gene * 0.5), 0.55 + 0.3 * (g.seed % 7) / 7);
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
    return { w, off, bones };
  }, [phenotype, f.idx, f.radius, feathered, g]);
  useEffect(() => () => build.w.surface.dispose(), [build]);
  const bone = useMemo(() => new THREE.Color(color).multiplyScalar(0.45).getHex(), [color]);
  const skin = useMemo(() => new THREE.Color(color).multiplyScalar(0.85).getHex(), [color]);
  return (
    <group position={build.off}>
      {feathered ? (
        <mesh geometry={build.w.surface} castShadow>
          <meshPhysicalMaterial vertexColors roughness={0.72} sheen={0.6} sheenRoughness={0.4} side={THREE.DoubleSide} />
        </mesh>
      ) : (
        <>
          <mesh geometry={build.w.surface} castShadow>
            <meshPhysicalMaterial color={skin} roughness={0.62} sheen={0.3} sheenRoughness={0.5} side={THREE.DoubleSide} transparent opacity={0.93} />
          </mesh>
          {build.bones.map((b, i) => (
            <mesh key={i} position={b.pos} quaternion={b.quat} castShadow>
              <cylinderGeometry args={[b.r1, b.r0, b.len, 8]} />
              <meshStandardMaterial color={bone} roughness={0.5} />
            </mesh>
          ))}
          {build.w.wrist && (
            <mesh position={[build.w.wrist.x, build.w.wrist.y + build.bones[0].r1 * 0.6, build.w.wrist.z]} rotation={[-0.4, 0, 0]} castShadow>
              <coneGeometry args={[build.bones[0].r1 * 0.7, build.bones[0].r1 * 3.2, 7]} />
              <meshStandardMaterial color={0x2a2420} roughness={0.45} />
            </mesh>
          )}
        </>
      )}
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
function Ear({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const v = earVariant(f.style);
  if (v === 'pointed') {
    // a triangular cat/fox ear standing up
    return (
      <group quaternion={f.quat}>
        <mesh position={[0, 0, r * 0.9]} rotation={[Math.PI / 2, 0, 0]} scale={[r * 0.95, r * 1.9, r * 0.3]} castShadow>
          <coneGeometry args={[1, 1, 5]} />
          <meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }
  // round (mouse/bear) vs leaf (rabbit/fox) — a flat upright plate, thin side-to-side (local X)
  const scale: [number, number, number] = v === 'round' ? [r * 0.3, r * 1.3, r * 1.3] : [r * 0.28, r * 1.0, r * 2.1];
  return (
    <mesh quaternion={f.quat} position={[0, 0, r * 0.8]} scale={scale} castShadow>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
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
