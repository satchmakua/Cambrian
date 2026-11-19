/**
 * The 3D viewport: the current creature, explicitly centered and framed, lit studio-style,
 * with an orbit camera that slowly auto-rotates (DESIGN §7).
 *
 * Centering is deterministic: the creature grows from the origin at its *back* (extending +Z,
 * with a tail behind and legs below), so its bounding-box centre is far from the origin. We offset
 * the creature group by −centre so its centre sits at the origin, point OrbitControls' target at the
 * origin, and frame the camera by the creature's size — so it never lists off-screen as it rotates.
 *
 * The stage never holds the page. Nothing is drawn until its shaders are compiled (off the page's
 * thread, where the browser can); it then starts still, and turns only once a frame has been
 * measured cheap (FramePace). Where a frame is dear the creature stays a picture — redrawn on a drag
 * or a change, a recorded gait stepped a frame at a time — and says so; and if that was the stage's
 * first measurement, the graphics are lowered once, if the player lets the game adjust them. Where
 * the browser is known to draw without a graphics card, or in safe mode, it is a picture from the
 * start and nothing is measured.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { StudioEnvironment } from './StudioEnvironment';
import { DrawnWhole, KeepPrograms, WarmShaders } from './programs';
import { FramePace, type PaceVerdict } from './FramePace';
import { PACE, type Pace, type StageStatus } from './pace';

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

// Dev/headless: ?forcestage=1 measures the stage even where the browser draws in software (with the
// menu's ?menu=1&forcestage=1, which mounts its backdrop there), to see what the frame pacing makes of it.
const DEV_MEASURE = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('forcestage') === '1';

// Dev/headless: ?failstage=1 makes this viewport fail to draw, to see what the screens around it do.
const DEV_FAIL = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('failstage') === '1';

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
    const d = head ? Math.max(focus.r * 4.0, size * 0.85) : size * 1.65;
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
import { createRig, poseRig } from './rig';
import { traitsOf } from '../sim/traits';
import { noGpu } from '../ui/gpu';
import { HARNESS, dprOf, useQuality, useSettings } from '../ui/settings';
import { useStore } from '../ui/store';

export function CreatureViewer({
  phenotype,
  skinMode = 'capsules',
  trajectory = null,
  backdrop = false,
  paused = false,
  onSlow,
  onShown,
  onStatus,
}: {
  phenotype: Phenotype;
  skinMode?: SkinMode;
  trajectory?: Trajectory | null;
  /** the main menu's backdrop: drawn cheaply until it is known to be cheap — the coat goes without
   *  its shells of fur, which are most of a frame, unless a frame was measured with room to spare */
  backdrop?: boolean;
  /** hold still: something over the stage (a menu's panel) should have the machine to itself */
  paused?: boolean;
  /** the stage's first measurement found it too slow to loop (the menu takes its backdrop down) */
  onSlow?: () => void;
  /** the stage has drawn its first frame */
  onShown?: () => void;
  /** told each change in what the stage is doing (the loading screen waits for 'ready') */
  onStatus?: (status: StageStatus) => void;
}) {
  if (DEV_FAIL) throw new Error('the stage failed to draw (dev: ?failstage=1)');
  const quality = useQuality();
  const spin = useSettings((s) => s.gameplay.spin);
  // (the stage holds still while the game menu is over it)
  const menuOpen = useStore((s) => s.menuOpen);
  // Dev-only: freezing stops the auto-rotate and switches to on-demand rendering so the
  // page can go idle (a continuous loop otherwise blocks headless captures).
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    (window as unknown as { __cambrianFreeze?: (v?: boolean) => void }).__cambrianFreeze = (v = true) =>
      setFrozen(!!v);
  }, []);

  // nothing is drawn until the shaders are ready (WarmShaders); then the stage is measured before
  // it is let loop (FramePace) — unless it is known beforehand to be a picture
  const [warm, setWarm] = useState(false);
  const [shown, setShown] = useState(false); // its first frame has been drawn
  const [measured] = useState(() => !noGpu() || DEV_MEASURE);
  const [pace, setPace] = useState<Pace>(measured ? 'probing' : 'still');
  // a frame has been drawn whole (nothing in it held back for a shader still building)
  const [whole, setWhole] = useState(false);
  // the options the last verdict holds for (a stage lowered from still is measured again at the new ones)
  const [verdictFor, setVerdictFor] = useState<string | null>(null);
  const [lowered, setLowered] = useState(false);
  // (the backdrop's fur: put on once, after a frame without it was timed with room to spare)
  const [lush, setLush] = useState(false);
  const lushTried = useRef(false);
  const slow = useRef(onSlow);
  slow.current = onSlow;
  const onPace = useCallback(
    (p: Pace, verdict: PaceVerdict) => {
      setPace(p);
      let again = false;
      if (p === 'still') {
        setLush(false);
        // (too slow as it is, on its first measurement: start lower, if the game may. The stage is
        // still by now, so the options' change is drawn once, not in a loop — and measured again. A
        // stage that has looped and then slowed is only held still: whatever slowed it may pass)
        if (verdict.first) {
          again = useSettings.getState().autoLower('slow');
          if (again) setLowered(true);
          slow.current?.();
        }
      } else if (p === 'live') {
        // (cheap enough to loop, but not to turn smoothly — under thirty frames a second the turntable
        // judders: the game's own stage starts lower, if the game may. It keeps looping meanwhile, and
        // lower options only make its frames cheaper)
        if (!backdrop && verdict.first && verdict.ms > PACE.smoothMs && useSettings.getState().autoLower('slow')) setLowered(true);
        if (backdrop && !lushTried.current && verdict.ms <= PACE.roomyMs && useSettings.getState().quality.furShells > 0) {
          // (the fur's shaders are compiled as the first were: nothing is drawn until they are ready,
          // so the turntable starts with the coat on, not with a hitch a moment after)
          lushTried.current = true;
          setLush(true);
          setWarm(false);
        }
      }
      if (!again) setVerdictFor(JSON.stringify(useSettings.getState().quality));
    },
    [backdrop],
  );
  // what the stage is doing, for the loading screen
  const stageKey = JSON.stringify(quality);
  const step: StageStatus['step'] = !warm || !shown || !whole ? 'shaders' : measured && (pace === 'probing' || verdictFor !== stageKey) ? 'measuring' : 'ready';
  const status = useMemo<StageStatus>(() => ({ step, still: pace === 'still', lowered }), [step, pace, lowered]);
  const told = useRef(onStatus);
  told.current = onStatus;
  useEffect(() => {
    told.current?.(status);
  }, [status]);
  const idle = frozen || menuOpen || paused;
  const hold = idle || pace !== 'live';
  // (a line on the stage where it is a picture, or not yet drawn — never on the menu's backdrop, nor
  // in a capture)
  const says = backdrop || HARNESS ? null : !shown ? 'wait' : pace === 'still' ? 'still' : null;

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
      pace,
    };
  }, [phenotype, skinMode, trajectory, pace]);

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

  const dist = size * 1.65;

  return (
    <>
      <Canvas
        key="creature-canvas"
        frameloop={!warm ? 'never' : hold ? 'demand' : 'always'}
        gl={{ preserveDrawingBuffer: import.meta.env.DEV }}
        shadows={quality.shadows}
        dpr={dprOf(quality, 2)}
        camera={{ position: [dist * 0.52, dist * 0.42, dist * 0.78], fov: 42 }}
      >
        <KeepPrograms />
        <DrawnWhole onChange={setWhole} />
        {/* (a long wait: where the browser compiles off the page's thread the menu stays usable
            meanwhile, and drawing any sooner would make the page wait for the compiler instead) */}
        {!warm && <WarmShaders onReady={() => setWarm(true)} timeoutMs={20000} patient />}
        {measured && <FramePace pace={pace} idle={idle || !warm} stage={stageKey} onPace={onPace} />}
        {!shown && (
          <FirstFrame
            onDrawn={() => {
              setShown(true);
              onShown?.();
            }}
          />
        )}
        {trajectory && pace === 'still' && !idle && <StepFrames />}
        <color attach="background" args={['#0f1116']} />
        <hemisphereLight args={['#cfe0ff', '#2a2620', 0.55]} />
        <ambientLight intensity={0.22} />
        <directionalLight
          position={[size * 1.2, size * 1.8, size * 1.0]}
          intensity={1.15}
          castShadow={quality.shadows}
          shadow-mapSize={[1024, 1024]}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-size * 1.0, size * 0.6, -size * 0.8]} intensity={0.35} color="#a7c0ff" />
        <StudioEnvironment />

        {/* centre the creature at the origin so the auto-rotate orbits its middle, not its tail */}
        <group position={[-center[0], -center[1], -center[2]]}>
          <IdleCreature phenotype={phenotype} skinMode={skinMode} trajectory={trajectory} alive={!frozen && !trajectory && skinMode !== 'capsules'} best={quality.heroSkin} fur={backdrop && !lush ? 0 : quality.furShells} />
        </group>
        {quality.contactShadow > 0 && (
          <ContactShadows key={quality.contactShadow} position={[0, groundY, 0]} scale={size * 2.4} blur={2.2} opacity={0.5} far={size} resolution={quality.contactShadow} />
        )}

        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          autoRotate={!hold && spin}
          autoRotateSpeed={0.8}
          // (held, the turn stops dead: left to coast, its easing asks for frame after frame — on a slow
          // machine, for many seconds — behind a menu that should have the machine to itself)
          enableDamping={!hold}
          enablePan={false}
          minDistance={size * 0.7}
          maxDistance={size * 7}
        />
        <Framer size={size} focus={faceFocus} />
      </Canvas>
      {says === 'wait' && <p className="stage-says">Preparing…</p>}
      {says === 'still' && <p className="stage-says">Drawing is slow on this machine, so the creature holds still. Drag to turn it.</p>}
    </>
  );
}

/** Tells when the canvas has drawn its first frame. */
function FirstFrame({ onDrawn }: { onDrawn: () => void }): null {
  const told = useRef(false);
  useFrame(() => {
    if (told.current) return;
    told.current = true;
    onDrawn();
  });
  return null;
}

/**
 * A recorded gait on a stage that does not loop: drawn a frame at a time, the page left to itself
 * for twice as long as each took (and a quarter of a second at the least) before the next — the
 * gait keeps its own speed, at whatever frame rate that comes to.
 */
function StepFrames(): null {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const step = () => {
      const t0 = performance.now();
      invalidate();
      // (the frame is drawn in the browser's next frame; the one after that is when the page was free again)
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => {
          timer = window.setTimeout(step, Math.max(250, (performance.now() - t0) * 2));
        });
      });
    };
    step();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [invalidate]);
  return null;
}

/** The hero creature, alive at rest: on a smooth skin it is rigged and idles — breathes, shifts its
 *  weight, glances about, swishes its tail, blinks (the eyes blink on their own). Frozen headless
 *  captures and the capsule kit stay static. */
function IdleCreature({ phenotype, skinMode, trajectory, alive, best, fur }: { phenotype: Phenotype; skinMode: SkinMode; trajectory: Trajectory | null; alive: boolean; best: 'high' | 'low'; fur: number }) {
  const rig = useMemo(() => (alive ? createRig(phenotype) : null), [phenotype, alive]);
  const swim = useMemo(() => {
    const t = traitsOf(phenotype);
    return t.habitat === 'water' || t.locomotion === 'swim';
  }, [phenotype]);
  useFrame((_, dt) => {
    if (!rig) return;
    // a swimmer idles with a slow fin-and-tail scull; a walker stands
    poseRig(rig, { dt: Math.min(dt, 0.05), speed: swim ? 0.25 : 0, cruise: 1, sleep: 0, eat: 0, swim, turn: 0, idle: 1 });
  });
  // A pick should show the new creature at once: its skin is first built at the thumbnails' quality
  // (a fraction of the cost), and the full one replaces it a moment later — off the click's frame.
  // (Frozen headless captures go straight to full quality.)
  const [full, setFull] = useState(!alive);
  useEffect(() => {
    if (!alive) {
      setFull(true);
      return;
    }
    setFull(false);
    const t = setTimeout(() => setFull(true), 150);
    return () => clearTimeout(t);
  }, [phenotype, alive]);
  // (the full skin is a graphics option: at low creature detail the hero keeps the thumbnails' skin)
  return <CreatureMesh phenotype={phenotype} skinMode={skinMode} trajectory={trajectory} rig={rig} carved={!rig} quality={full ? best : 'low'} fur={fur} />;
}
