/**
 * The 3D viewport: the current creature, explicitly centered and framed, lit studio-style,
 * with an orbit camera that slowly auto-rotates (DESIGN §7).
 *
 * Centering is deterministic: the creature grows from the origin at its *back* (extending +Z,
 * with a tail behind and legs below), so its bounding-box centre is far from the origin. We offset
 * the creature group by −centre so its centre sits at the origin, point OrbitControls' target at the
 * origin, and frame the camera by the creature's size — so it never lists off-screen as it rotates.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';

// Dev/headless: a URL `view` param picks a canonical camera angle for reproducible face shots.
// The creature faces +Z, so 'front' looks back along +Z at the head; 'side' from +X. `head=1`
// tightens the frame onto the face (eye/mouth nodes) so mouth detail is inspectable.
function devView(): 'front' | 'side' | 'default' {
  if (!import.meta.env.DEV) return 'default';
  const v = new URLSearchParams(location.search).get('view');
  return v === 'front' || v === 'side' ? v : 'default';
}
function devHead(): boolean {
  return import.meta.env.DEV && new URLSearchParams(location.search).get('head') === '1';
}

interface Focus {
  pt: [number, number, number]; // orbit target, in centered (world) space
  r: number; // focus radius (frame distance derives from it)
}

/** Re-frame the camera (distance + clip planes) whenever the creature's size changes, and keep the
 *  orbit target pinned at the origin — so a tiny critter and a long serpent are both well-framed. */
function Framer({ size, focus }: { size: number; focus: Focus | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    const view = devView();
    const head = devHead() && focus;
    // head-focus: orbit the face and pull in close; otherwise frame the whole body from the origin
    const [tx, ty, tz] = head ? focus.pt : [0, 0, 0];
    // head distance must clear the whole body (a small face on a fluffy body would otherwise clip
    // the camera inside the fur), so floor it at a fraction of the body size
    const d = head ? Math.max(focus.r * 4.0, size * 0.85) : size * 2.1;
    if (view === 'front') camera.position.set(tx + d * 0.2, ty + d * 0.3, tz + d * 0.95);
    else if (view === 'side') camera.position.set(tx + d * 1.0, ty + d * 0.28, tz + d * 0.16);
    else camera.position.set(tx + d * 0.52, ty + d * 0.42, tz + d * 0.78);
    (camera as { near: number; far: number }).near = Math.max(0.02, size * 0.01);
    (camera as { near: number; far: number }).far = size * 30;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(tx, ty, tz);
      controls.update();
    }
  }, [size, camera, controls, focus]);
  return null;
}
import type { Phenotype } from '../engine/grow';
import type { Trajectory } from '../physics/fitness';
import type { SkinMode } from '../ui/store';
import { CreatureMesh } from './CreatureMesh';

export function CreatureViewer({
  phenotype,
  skinMode = 'capsules',
  trajectory = null,
}: {
  phenotype: Phenotype;
  skinMode?: SkinMode;
  trajectory?: Trajectory | null;
}) {
  // Dev-only: freezing stops the auto-rotate and switches to on-demand rendering so the
  // page can go idle (a continuous loop otherwise blocks headless captures).
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    (window as unknown as { __cambrianFreeze?: (v?: boolean) => void }).__cambrianFreeze = (v = true) =>
      setFrozen(!!v);
  }, []);

  // Dev-only handle so a headless harness can read creature state behind the loop.
  useEffect(() => {
    const { min, max } = phenotype.bounds;
    const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const terminals: Record<string, number> = {};
    for (const n of phenotype.nodes) {
      if (n.terminal && n.terminal !== 'none') terminals[n.terminal] = (terminals[n.terminal] ?? 0) + 1;
    }
    (window as unknown as { __cambrian?: unknown }).__cambrian = {
      nodeCount: phenotype.nodes.length,
      edgeCount: phenotype.edges.length,
      seed: phenotype.genomeRef.seed,
      symmetry: phenotype.genomeRef.symmetry,
      dims: dims.map((d) => +d.toFixed(2)),
      maxRadius: +Math.max(...phenotype.nodes.map((n) => n.radius)).toFixed(2),
      terminals,
      covering: phenotype.genomeRef.covering.type,
      skin: skinMode,
      gait: trajectory ? `playback(${trajectory.frameCount}f)` : 'static',
    };
  }, [phenotype, skinMode, trajectory]);

  // explicit framing from the creature's bounds
  const { center, size, groundY } = useMemo(() => {
    const { min, max } = phenotype.bounds;
    const c: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const s = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 0.6);
    return { center: c, size: s, groundY: -(max[1] - min[1]) / 2 - 0.04 };
  }, [phenotype]);

  // Dev/headless: the face centroid (eye/mouth nodes) in centered space, for the head-focus camera.
  const faceFocus = useMemo<Focus | null>(() => {
    const face = phenotype.nodes.filter((n) => n.terminal === 'mouth' || n.terminal === 'eye');
    if (face.length === 0) return null;
    const acc = [0, 0, 0];
    for (const n of face) for (let a = 0; a < 3; a++) acc[a] += n.pos[a];
    const pt: [number, number, number] = [
      acc[0] / face.length - center[0],
      acc[1] / face.length - center[1],
      acc[2] / face.length - center[2],
    ];
    let r = 0.2;
    for (const n of face) {
      const dx = n.pos[0] - center[0] - pt[0], dy = n.pos[1] - center[1] - pt[1], dz = n.pos[2] - center[2] - pt[2];
      r = Math.max(r, Math.hypot(dx, dy, dz) + n.radius);
    }
    return { pt, r };
  }, [phenotype, center]);

  const dist = size * 2.1;

  return (
    <Canvas
      key="creature-canvas"
      frameloop={frozen ? 'demand' : 'always'}
      gl={{ preserveDrawingBuffer: import.meta.env.DEV }}
      shadows
      dpr={[1, 2]}
      camera={{ position: [dist * 0.52, dist * 0.42, dist * 0.78], fov: 42 }}
    >
      <color attach="background" args={['#0f1116']} />
      <hemisphereLight args={['#cfe0ff', '#2a2620', 0.55]} />
      <ambientLight intensity={0.22} />
      <directionalLight
        position={[size * 1.2, size * 1.8, size * 1.0]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-size * 1.0, size * 0.6, -size * 0.8]} intensity={0.35} color="#a7c0ff" />
      {/* The preset HDR is fetched from a CDN and SUSPENDS. Without its own boundary that suspense
          propagates and blanks the whole canvas whenever the fetch is slow, cold-cached, or offline
          (it silently broke headless captures). Isolated, the creature renders immediately and the
          environment lighting pops in when — or if — it arrives. */}
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>

      {/* centre the creature at the origin so the auto-rotate orbits its middle, not its tail */}
      <group position={[-center[0], -center[1], -center[2]]}>
        <CreatureMesh phenotype={phenotype} skinMode={skinMode} trajectory={trajectory} />
      </group>
      <ContactShadows position={[0, groundY, 0]} scale={size * 2.4} blur={2.2} opacity={0.5} far={size} resolution={512} />

      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        autoRotate={!frozen}
        autoRotateSpeed={0.8}
        enablePan={false}
        minDistance={size * 0.7}
        maxDistance={size * 7}
      />
      <Framer size={size} focus={faceFocus} />
    </Canvas>
  );
}
