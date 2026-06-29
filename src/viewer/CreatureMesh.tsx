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
import { buildRig, computeAnim } from './animation';
import { makeCreatureMaterial } from './creatureMaterial';
import { buildSmoothGeometry } from './smoothSkin';

const UP = new THREE.Vector3(0, 1, 0);

export function CreatureMesh({
  phenotype,
  animate = true,
  smooth = false,
}: {
  phenotype: Phenotype;
  animate?: boolean;
  smooth?: boolean;
}) {
  const data = useMemo(() => buildMeshData(phenotype), [phenotype]);
  const pal = phenotype.genomeRef.palette;
  const cov = phenotype.genomeRef.covering;
  const seed = phenotype.genomeRef.seed;

  const bodyMat = useMemo(() => makeCreatureMaterial(pal, cov, seed), [pal, cov, seed]);
  useEffect(() => () => bodyMat.dispose(), [bodyMat]);

  // M15: one organic surface over the node field, built once (only when toggled on). The
  // smooth body is static, so motion is paused while it's shown (re-meshing per frame is dear).
  const smoothGeo = useMemo(() => (smooth ? buildSmoothGeometry(phenotype) : null), [smooth, phenotype]);
  useEffect(() => () => smoothGeo?.dispose(), [smoothGeo]);
  const animateBody = animate && !smooth;

  const footColor = useMemo(
    () => new THREE.Color().setHSL(pal.hueA, pal.sat, Math.max(0.12, pal.light * 0.45)).getHex(),
    [pal],
  );
  const finColor = useMemo(() => new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light).getHex(), [pal]);

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

  const sphereRefs = useRef<THREE.Mesh[]>([]);
  const capsuleRefs = useRef<THREE.Mesh[]>([]);
  const featureRefs = useRef<THREE.Object3D[]>([]);

  const a = useMemo(() => new THREE.Vector3(), []);
  const b = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);

  useFrame((st) => {
    if (!animateBody) return; // thumbnails + smooth skin render the static base pose
    const anim = computeAnim(rig, st.clock.elapsedTime);
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
      {smooth && smoothGeo ? (
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
              position={data.nodes[i].pos}
              material={bodyMat}
              castShadow
            >
              <sphereGeometry args={[data.nodes[i].radius, 18, 14]} />
            </mesh>
          ))}
          {data.edges.map((e, k) => (
            <mesh
              key={`c${k}`}
              ref={(el) => {
                if (el) capsuleRefs.current[k] = el;
              }}
              position={baseCaps[k].pos}
              quaternion={baseCaps[k].quat}
              material={bodyMat}
              castShadow
            >
              <capsuleGeometry args={[e.radius, baseCaps[k].len, 6, 14]} />
            </mesh>
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
          <Feature f={f} footColor={footColor} finColor={finColor} />
        </group>
      ))}
    </group>
  );
}

// Features render at the local origin of their (animated) parent group.
function Feature({ f, footColor, finColor }: { f: MeshFeature; footColor: number; finColor: number }) {
  switch (f.type) {
    case 'eye':
      return <Eye f={f} />;
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
    default:
      return <Foot f={f} color={footColor} />;
  }
}

// --- eyes (5 styles by `style`) — the emotional anchor -----------------------

function Eye({ f }: { f: MeshFeature }) {
  const r = Math.max(f.radius, 0.06);
  const s = f.style;
  return (
    <group quaternion={f.quat}>
      {s < 0.4 ? (
        // round (sclera + pupil + highlight) / beady (smaller, darker sclera)
        <>
          <mesh>
            <sphereGeometry args={[r, 16, 12]} />
            <meshStandardMaterial color={s < 0.2 ? 0xe8e6dc : 0x14141a} roughness={0.16} metalness={0.0} />
          </mesh>
          <mesh position={[0, 0, r * 0.6]}>
            <sphereGeometry args={[r * (s < 0.2 ? 0.55 : 0.4), 14, 12]} />
            <meshStandardMaterial color={0x07070a} roughness={0.08} />
          </mesh>
          <mesh position={[r * 0.26, r * 0.3, r * 0.78]}>
            <sphereGeometry args={[r * 0.16, 8, 8]} />
            <meshBasicMaterial color={0xffffff} />
          </mesh>
        </>
      ) : s < 0.6 ? (
        // slit (sclera + a vertical-slit pupil)
        <>
          <mesh>
            <sphereGeometry args={[r, 16, 12]} />
            <meshStandardMaterial color={0xe9c14a} roughness={0.2} metalness={0.0} />
          </mesh>
          <mesh position={[0, 0, r * 0.7]} scale={[0.18, 0.95, 0.4]}>
            <sphereGeometry args={[r * 0.7, 10, 10]} />
            <meshStandardMaterial color={0x07070a} roughness={0.1} />
          </mesh>
        </>
      ) : s < 0.8 ? (
        // compound (a dark faceted dome)
        <mesh>
          <icosahedronGeometry args={[r * 1.05, 1]} />
          <meshStandardMaterial color={0x161a22} roughness={0.25} metalness={0.6} flatShading />
        </mesh>
      ) : (
        // glowing (emissive alien eye)
        <>
          <mesh>
            <sphereGeometry args={[r, 14, 12]} />
            <meshStandardMaterial color={0x0a1410} emissive={0x55ffcc} emissiveIntensity={1.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, r * 0.6]}>
            <sphereGeometry args={[r * 0.4, 10, 10]} />
            <meshBasicMaterial color={0xd9fff2} />
          </mesh>
        </>
      )}
    </group>
  );
}

// --- mouths (5 styles) — beak, maw, mandibles, sucker, baleen ----------------

function Mouth({ f, dark }: { f: MeshFeature; dark: number }) {
  const r = Math.max(f.radius, 0.06);
  const s = f.style;
  if (s < 0.2) {
    // maw: a dark cavity + a row of little teeth
    return (
      <group>
        <mesh scale={[r * 1.7, r * 0.6, r * 1.0]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshStandardMaterial color={0x180a0c} roughness={0.5} />
        </mesh>
        {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
          <mesh key={i} position={[x * r, r * 0.18, r * 0.5]} rotation={[Math.PI, 0, 0]} scale={[r * 0.12, r * 0.22, r * 0.12]}>
            <coneGeometry args={[1, 1.4, 5]} />
            <meshStandardMaterial color={0xf2efe6} roughness={0.4} />
          </mesh>
        ))}
      </group>
    );
  }
  if (s < 0.4) {
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
  if (s < 0.6) {
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
  if (s < 0.8) {
    // sucker: a ring disc with a dark center
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

// A wing: a large thin membrane spanning out along the aim.
function Wing({ f, color }: { f: MeshFeature; color: number }) {
  const r = Math.max(f.radius, 0.06);
  return (
    <mesh quaternion={f.quat} scale={[r * 0.18, r * 2.6, r * 3.2]} castShadow>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.0} side={THREE.DoubleSide} />
    </mesh>
  );
}
