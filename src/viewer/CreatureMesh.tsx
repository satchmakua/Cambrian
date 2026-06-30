/**
 * Renders a Phenotype and gives it life (DESIGN §6.3/§6.4, M5 motion).
 *
 * The body is a capsule-union skinned with the shared countershaded material, plus
 * features (eyes, mouth, feet, claws, fins). Each frame a topology-free deformation
 * animates the node positions — a traveling sine wave along the body (undulation, strong
 * for serpents, gentle for legged bodies) plus a phased leg gait (low nodes lift/swing) —
 * and the capsules/spheres/features are re-posed to match. Pure viewer concern: the
 * engine's grow() stays static and deterministic.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { buildMeshData, type MeshFeature } from './meshData';
import { eyeVariant, mouthVariant, earVariant } from './partStyles';
import { buildRig, computeAnim } from './animation';
import { makeCreatureMaterial } from './creatureMaterial';
import { buildSmoothGeometry } from './smoothSkin';
import { sampleTrajectory, type Trajectory } from '../physics/fitness';

const UP = new THREE.Vector3(0, 1, 0);

/** Bake an `aBodyPos` attribute = `matrix · localVertex` (the vertex's rest-pose body position). */
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
}

export function CreatureMesh({
  phenotype,
  animate = true,
  smooth = false,
  trajectory = null,
}: {
  phenotype: Phenotype;
  animate?: boolean;
  smooth?: boolean;
  trajectory?: Trajectory | null;
}) {
  const data = useMemo(() => buildMeshData(phenotype), [phenotype]);
  const pal = phenotype.genomeRef.palette;
  const cov = phenotype.genomeRef.covering;
  const seed = phenotype.genomeRef.seed;

  const bodyMat = useMemo(() => makeCreatureMaterial(pal, cov, seed), [pal, cov, seed]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

  // physics playback (post-roadmap): when a recorded gait is present, capsules re-pose from it
  // each frame — so the body must be the capsule kit (the smooth mesh is static), and it animates.
  const showSmooth = smooth && !trajectory;

  // M15: one organic surface over the node field, built once (only when toggled on). The
  // smooth body is static, so motion is paused while it's shown (re-meshing per frame is dear).
  const smoothGeo = useMemo(() => {
    if (!showSmooth) return null;
    const g = buildSmoothGeometry(phenotype);
    // smooth mesh is untransformed, so its local position *is* the body-space coord (M17)
    g.setAttribute('aBodyPos', (g.getAttribute('position') as THREE.BufferAttribute).clone());
    return g;
  }, [showSmooth, phenotype]);
  useEffect(() => () => smoothGeo?.dispose(), [smoothGeo]);
  const animateBody = !!trajectory || (animate && !showSmooth);

  const footColor = useMemo(
    () => new THREE.Color().setHSL(pal.hueA, pal.sat, Math.max(0.12, pal.light * 0.45)).getHex(),
    [pal],
  );
  const finColor = useMemo(() => new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light).getHex(), [pal]);
  // a warm-ish iris derived from the creature's own hue (M-refine: a real coloured iris, not just black)
  const irisColor = useMemo(
    () => new THREE.Color().setHSL((pal.hueA + 0.08) % 1, Math.min(1, pal.sat * 0.7 + 0.18), 0.42).getHex(),
    [pal],
  );

  const rig = useMemo(() => buildRig(data, phenotype), [data, phenotype]);

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
    return data.bodySpheres.map((i) => {
      const g = new THREE.SphereGeometry(data.nodes[i].radius, 18, 14);
      const p = data.nodes[i].pos;
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

  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame((st) => {
    if (!animateBody) return; // thumbnails + smooth skin render the static base pose
    // a recorded physics gait plays back from the trajectory; otherwise procedural motion
    const anim = trajectory
      ? sampleTrajectory(trajectory, st.clock.elapsedTime, rig.anim)
      : computeAnim(rig, st.clock.elapsedTime);
    const { bodySpheres, edges, features } = data;

    if (import.meta.env.DEV) {
      // dev-only motion probe: the live animated position of the last node
      const li = (rig.n - 1) * 3;
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
      {data.features.map((f, k) => (
        <group
          key={`f${k}`}
          ref={(el) => {
            if (el) featureRefs.current[k] = el;
          }}
          position={data.nodes[f.idx].pos}
        >
          <Feature f={f} footColor={footColor} finColor={finColor} irisColor={irisColor} />
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
}: {
  f: MeshFeature;
  footColor: number;
  finColor: number;
  irisColor: number;
}) {
  switch (f.type) {
    case 'eye':
      return <Eye f={f} socket={footColor} iris={irisColor} lid={finColor} />;
    case 'mouth':
      return <Mouth f={f} dark={footColor} />;
    case 'pincer':
      return <Pincer f={f} color={footColor} />;
    case 'fin':
      return f.kind === 'wing' ? (
        <Wing f={f} color={finColor} />
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
      return <Carapace f={f} color={finColor} />;
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
  return (
    <group quaternion={f.quat}>
      {/* orbital rim — every eye is set INTO a socket (the receptacle), so it reads as part of the
          head, not a ball stuck on top. The lidless styles (slit/compound) keep just this bony ring. */}
      <mesh position={[0, 0, r * 0.12]}>
        <torusGeometry args={[r * 0.95, r * 0.26, 10, 22]} />
        <meshStandardMaterial color={socket} roughness={0.8} metalness={0.0} />
      </mesh>
      {v === 'round' || v === 'beady' ? (
        // a real eyeball: off-white sclera · coloured iris · pupil · a small sharp catchlight · a lid
        <>
          <mesh position={[0, 0, r * 0.05]}>
            <sphereGeometry args={[r * 0.92, 18, 14]} />
            <meshStandardMaterial color={v === 'round' ? 0xd8d4c4 : 0x0e0e12} roughness={0.32} metalness={0.0} />
          </mesh>
          <mesh position={[0, 0, r * 0.64]}>
            <sphereGeometry args={[r * 0.5, 18, 14]} />
            <meshStandardMaterial color={iris} roughness={0.35} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0, r * 0.86]}>
            <sphereGeometry args={[r * (v === 'round' ? 0.24 : 0.32), 14, 12]} />
            <meshStandardMaterial color={0x05050a} roughness={0.1} />
          </mesh>
          <mesh position={[r * 0.2, r * 0.24, r * 0.92]}>
            <sphereGeometry args={[r * 0.08, 8, 8]} />
            <meshBasicMaterial color={0xffffff} />
          </mesh>
          {/* upper eyelid — a skin-toned hood over the top third (no more full bulging ball) */}
          <mesh position={[0, r * 0.34, r * 0.28]} rotation={[-0.5, 0, 0]} scale={[r * 1.04, r * 0.95, r * 0.95]}>
            <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
            <meshStandardMaterial color={lid} roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
        </>
      ) : v === 'slit' ? (
        // slit — a reptile vertical-pupil eye with a metallic iris sheen
        <>
          <mesh position={[0, 0, r * 0.05]}>
            <sphereGeometry args={[r * 0.92, 16, 12]} />
            <meshStandardMaterial color={0xc9a23e} roughness={0.22} metalness={0.18} />
          </mesh>
          <mesh position={[0, 0, r * 0.72]} scale={[0.16, 0.95, 0.4]}>
            <sphereGeometry args={[r * 0.8, 10, 12]} />
            <meshStandardMaterial color={0x06060a} roughness={0.1} />
          </mesh>
        </>
      ) : v === 'compound' ? (
        // compound — a dark faceted dome (insect)
        <mesh position={[0, 0, r * 0.1]}>
          <icosahedronGeometry args={[r * 0.98, 1]} />
          <meshStandardMaterial color={0x161a22} roughness={0.25} metalness={0.6} flatShading />
        </mesh>
      ) : (
        // glowing — emissive alien eye
        <>
          <mesh position={[0, 0, r * 0.08]}>
            <sphereGeometry args={[r * 0.9, 14, 12]} />
            <meshStandardMaterial color={0x0a1410} emissive={0x55ffcc} emissiveIntensity={1.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, r * 0.62]}>
            <sphereGeometry args={[r * 0.38, 10, 10]} />
            <meshBasicMaterial color={0xd9fff2} />
          </mesh>
        </>
      )}
    </group>
  );
}

// --- mouths (8 styles §6.3) — maw · fanged · beak · mandibles · sucker · lamprey · baleen · proboscis

function Mouth({ f, dark }: { f: MeshFeature; dark: number }) {
  const r = Math.max(f.radius, 0.06);
  const v = mouthVariant(f.style);
  if (v === 'herbivore') {
    // a soft grazing mouth — a flat closed lip line + blunt incisors, no fangs (cow/horse/rodent)
    return (
      <group quaternion={f.quat}>
        {/* the mouth slot (dark, thin) */}
        <mesh position={[0, 0, r * 0.22]} scale={[r * 1.25, r * 0.16, r * 0.38]}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial color={0x3a1418} roughness={0.62} />
        </mesh>
        {/* upper + lower lips */}
        <mesh position={[0, r * 0.24, r * 0.24]} scale={[r * 1.32, r * 0.2, r * 0.5]}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial color={dark} roughness={0.6} />
        </mesh>
        <mesh position={[0, -r * 0.24, r * 0.24]} scale={[r * 1.24, r * 0.2, r * 0.46]}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial color={dark} roughness={0.6} />
        </mesh>
        {/* a pair of blunt flat incisors */}
        {[-0.2, 0.2].map((x, i) => (
          <mesh key={i} position={[x * r, r * 0.02, r * 0.44]} scale={[r * 0.16, r * 0.2, r * 0.08]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={0xeae6d8} roughness={0.45} />
          </mesh>
        ))}
      </group>
    );
  }
  if (v === 'maw' || v === 'fanged') {
    // a mouth set INTO the face (M-refine): a recessed cavity framed by thin lips, teeth pulled back —
    // reads as a real mouth, not a protruding duck-bill. fanged adds two corner tusks.
    return (
      <group quaternion={f.quat}>
        {/* recessed dark-red oral cavity (sits back in the face, not jutting forward) */}
        <mesh position={[0, 0, r * 0.16]} scale={[r * 1.32, r * 0.8, r * 0.5]}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color={0x4a1014} roughness={0.62} side={THREE.DoubleSide} />
        </mesh>
        {/* upper + lower LIPS — thin rims framing the opening (a mouth line, not a bill) */}
        <mesh position={[0, r * 0.4, r * 0.28]} rotation={[-0.18, 0, 0]} scale={[r * 1.42, r * 0.22, r * 0.62]}>
          <sphereGeometry args={[1, 18, 8]} />
          <meshStandardMaterial color={dark} roughness={0.55} />
        </mesh>
        <mesh position={[0, -r * 0.4, r * 0.28]} rotation={[0.18, 0, 0]} scale={[r * 1.3, r * 0.22, r * 0.56]}>
          <sphereGeometry args={[1, 18, 8]} />
          <meshStandardMaterial color={dark} roughness={0.55} />
        </mesh>
        {/* the mouth corners — little wedges that close the line at the sides */}
        {[-1, 1].map((s) => (
          <mesh key={`c${s}`} position={[s * r * 0.62, 0, r * 0.24]} scale={[r * 0.2, r * 0.5, r * 0.4]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial color={dark} roughness={0.55} />
          </mesh>
        ))}
        {/* tongue, deeper in the cavity */}
        <mesh position={[0, -r * 0.06, r * 0.42]} scale={[r * 0.44, r * 0.18, r * 0.48]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color={0xa85560} roughness={0.6} />
        </mesh>
        {/* upper tooth row (pointing down) + a sparser lower row, set back behind the lips */}
        {[-0.52, -0.18, 0.18, 0.52].map((x, i) => (
          <mesh key={`u${i}`} position={[x * r, r * 0.2, r * 0.54]} rotation={[Math.PI, 0, 0]} scale={[r * 0.1, r * 0.26, r * 0.1]}>
            <coneGeometry args={[1, 1.4, 5]} />
            <meshStandardMaterial color={0xf2efe6} roughness={0.4} />
          </mesh>
        ))}
        {[-0.36, 0, 0.36].map((x, i) => (
          <mesh key={`l${i}`} position={[x * r, -r * 0.2, r * 0.54]} scale={[r * 0.09, r * 0.2, r * 0.09]}>
            <coneGeometry args={[1, 1.2, 5]} />
            <meshStandardMaterial color={0xf2efe6} roughness={0.4} />
          </mesh>
        ))}
        {v === 'fanged' &&
          [-1, 1].map((side) => (
            <mesh key={`fang${side}`} position={[side * r * 0.5, -r * 0.04, r * 0.6]} rotation={[0.28, 0, 0]} scale={[r * 0.15, r * 0.58, r * 0.15]}>
              <coneGeometry args={[1, 1.5, 6]} />
              <meshStandardMaterial color={0xf2efe6} roughness={0.4} />
            </mesh>
          ))}
      </group>
    );
  }
  if (v === 'beak') {
    // beak: two hard cones meeting, pointing forward
    return (
      <group quaternion={f.quat}>
        <mesh position={[0, r * 0.18, r * 0.5]} rotation={[Math.PI / 2 + 0.35, 0, 0]} scale={[r * 0.9, r * 1.6, r * 0.9]}>
          <coneGeometry args={[1, 1, 7]} />
          <meshStandardMaterial color={dark} roughness={0.4} />
        </mesh>
        <mesh position={[0, -r * 0.18, r * 0.5]} rotation={[Math.PI / 2 - 0.35, 0, 0]} scale={[r * 0.8, r * 1.4, r * 0.8]}>
          <coneGeometry args={[1, 1, 7]} />
          <meshStandardMaterial color={dark} roughness={0.4} />
        </mesh>
      </group>
    );
  }
  if (v === 'mandibles') {
    // mandibles: two side prongs that converge in front
    return (
      <group quaternion={f.quat}>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * r * 0.5, 0, r * 0.4]} rotation={[Math.PI / 2, 0, -side * 0.5]} scale={[r * 0.35, r * 1.5, r * 0.35]}>
            <coneGeometry args={[1, 1, 6]} />
            <meshStandardMaterial color={dark} roughness={0.45} />
          </mesh>
        ))}
      </group>
    );
  }
  if (v === 'sucker' || v === 'lamprey') {
    // sucker: a ring disc with a dark center. lamprey adds concentric rasping tooth rings.
    return (
      <group quaternion={f.quat}>
        <mesh position={[0, 0, r * 0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 0.9, r * 0.35, 8, 16]} />
          <meshStandardMaterial color={0x6a2f33} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0, r * 0.2]} scale={[r, r, r * 0.4]}>
          <sphereGeometry args={[0.7, 12, 10]} />
          <meshStandardMaterial color={0x130809} roughness={0.5} />
        </mesh>
        {v === 'lamprey' &&
          [0.62, 0.42, 0.24].map((rad, i) => (
            <mesh key={i} position={[0, 0, r * 0.34]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[r * rad, r * 0.07, 6, 14]} />
              <meshStandardMaterial color={0xe7ddca} roughness={0.45} />
            </mesh>
          ))}
      </group>
    );
  }
  if (v === 'proboscis') {
    // proboscis: a thin tube extending forward (butterfly / mosquito)
    return (
      <group quaternion={f.quat}>
        <mesh position={[0, -r * 0.05, r * 1.0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r * 0.15, r * 0.24, r * 2.2, 8]} />
          <meshStandardMaterial color={dark} roughness={0.5} />
        </mesh>
      </group>
    );
  }
  if (v === 'trunk') {
    // a long prehensile trunk that reaches forward then droops + tapers (elephant / tapir)
    return (
      <group quaternion={f.quat}>
        {[0, 1, 2, 3, 4].map((i) => {
          const t = i / 4;
          const z = r * (0.45 + t * 0.95); // forward
          const y = -r * (t * t * 1.5); // droops down, accelerating
          const w = r * (0.34 - t * 0.18); // tapers
          return (
            <mesh key={i} position={[0, y, z]} rotation={[Math.PI / 2 - t * 0.5, 0, 0]} scale={[w, w, r * 0.5]}>
              <cylinderGeometry args={[1, 0.85, 1, 8]} />
              <meshStandardMaterial color={dark} roughness={0.6} />
            </mesh>
          );
        })}
      </group>
    );
  }
  // baleen: a dark slot with vertical fringe bars
  return (
    <group>
      <mesh scale={[r * 1.6, r * 0.5, r * 0.7]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={0x140a0b} roughness={0.6} />
      </mesh>
      {[-0.6, -0.3, 0, 0.3, 0.6].map((x, i) => (
        <mesh key={i} position={[x * r, -r * 0.1, r * 0.25]} scale={[r * 0.05, r * 0.45, r * 0.05]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={0x9a8d72} roughness={0.7} />
        </mesh>
      ))}
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

// A hoof: a solid keratin block, flat on the ground, with a cleft (ungulate).
function Hoof({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const horn = useMemo(() => new THREE.Color(color).multiplyScalar(0.4).getHex(), [color]);
  return (
    <group>
      <mesh position={[0, -r * 0.15, r * 0.05]} scale={[r * 1.0, r * 1.0, r * 1.15]} castShadow>
        <cylinderGeometry args={[0.78, 1.0, 1, 12]} />
        <meshStandardMaterial color={horn} roughness={0.42} metalness={0.06} />
      </mesh>
      <mesh position={[0, -r * 0.62, r * 0.25]} scale={[r * 0.07, r * 0.55, r * 0.95]}>
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
function Fin({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh quaternion={f.quat} scale={[r * 0.32, r * 1.2, r * 1.6]}>
      <sphereGeometry args={[1, 12, 10]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.0} />
    </mesh>
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

// A wing: a thin membrane spanning out along the aim, braced by a few articulated struts
// (finger-bones radiating into the web — bat/dragon/raptor read).
function Wing({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const strut = useMemo(() => new THREE.Color(color).multiplyScalar(0.6).getHex(), [color]);
  return (
    <group quaternion={f.quat}>
      <mesh scale={[r * 0.16, r * 2.6, r * 3.2]} castShadow>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.0} side={THREE.DoubleSide} />
      </mesh>
      {/* struts fan within the membrane (the local YZ plane) — rotate the +Z bone about local X */}
      {[-0.55, -0.18, 0.2, 0.6].map((ang, i) => (
        <group key={i} rotation={[ang, 0, 0]}>
          <mesh position={[0, 0, r * 1.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[r * 0.06, r * 0.11, r * 3.0, 6]} />
            <meshStandardMaterial color={strut} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
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

// A carapace: a big domed shell over a body region (turtle / crab / armadillo). World-aligned
// (broad in X·Z, domed in Y) and shifted down so it caps the back rather than floating.
function Carapace({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  const dark = useMemo(() => new THREE.Color(color).multiplyScalar(0.85).getHex(), [color]);
  return (
    <mesh position={[0, -r * 0.5, 0]} scale={[r * 3.2, r * 2.2, r * 4.0]} castShadow receiveShadow>
      <sphereGeometry args={[1, 20, 16]} />
      <meshStandardMaterial color={dark} roughness={0.5} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
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
