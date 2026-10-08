/**
 * The Specimen Studio — a naturalist's inspection bench for one creature.
 *
 * Breeding shows a creature turning on a turntable; judging *anatomy* needs more: the same body
 * from canonical angles at once, true proportions, the skeleton under the skin, and what the
 * genome and morphospace say it is. The Studio lays that out:
 *
 *   - a large orbitable stage,
 *   - four fixed PLATES — side / front / top orthographic elevations (true proportions, no
 *     perspective) and a face close-up — each with a body-unit scale bar,
 *   - overlays: an x-ray skeleton coloured by part, a ground grid, and single shading channels,
 *   - an inspector: the nearest morphotypes, dimensions, the 10-D morphospace descriptor, the body
 *     plan's parts, and the covering/palette.
 *
 * All five viewports share ONE WebGL context via drei `<View>` (scissored sub-views of one canvas),
 * one prefiltered environment, and one cached smooth surface — so the bench costs little more than
 * the main stage. The Bestiary tab lays out one specimen of every morphotype the same way.
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { View, OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { grow, type Phenotype } from '../engine/grow';
import type { Genome } from '../engine/genome';
import { describe, nearestKinds, DESCRIPTOR_LABELS } from '../engine/morphospace';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../engine/random';
import type { SkinMode } from '../ui/store';
import { CreatureMesh } from './CreatureMesh';
import { SkeletonOverlay, BONE_COLORS } from './SkeletonOverlay';
import { StudioEnvironment } from './StudioEnvironment';
import { mouthVariant, eyeVariant } from './partStyles';
import type { SkinQuality } from './smoothSkin';
import { createRig, poseRig, type RigInstance } from './rig';
import { JawContext, type JawControl } from './mouths/jaw';
import { FlightContext, wingbeat, type FlightControl } from './flight';
import { LidContext, type LidControl } from './eyelids';
import { traitsOf } from '../sim/traits';

/** The Studio's motion preview: the World's gait, run in place so a body's movement can be judged. */
export type Motion = 'still' | 'walk' | 'run' | 'eat' | 'sleep' | 'fly';

const DEV_JAW: number | null =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('jawopen')
    ? Number(new URLSearchParams(location.search).get('jawopen'))
    : null;

function devGaitPhase(): number | null {
  if (!import.meta.env.DEV || typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('gaitphase');
  return v === null ? null : Number(v);
}

/** Animate a rig in place for the Studio preview (the canvas renders on demand, so keep asking). */
function useMotion(phenotype: Phenotype, motion: Motion, jaw: JawControl, flight: FlightControl): RigInstance | null {
  const rig = useMemo(() => (motion === 'still' ? null : createRig(phenotype)), [phenotype, motion]);
  const traits = useMemo(() => traitsOf(phenotype), [phenotype]);
  const cruise = traits.speed;
  const swim = traits.habitat === 'water' || traits.locomotion === 'swim';
  const invalidate = useThree((s) => s.invalidate);
  const frozen = devGaitPhase();
  useFrame((_, dt) => {
    if (!rig) return;
    const speed = motion === 'walk' ? cruise * 0.55 : motion === 'run' ? cruise * 1.7 : 0;
    if (frozen !== null) rig.phase = frozen; // a zero-dt pose holds the frozen phase at full stride
    jaw.open = motion === 'eat' ? 0.3 + 0.45 * Math.max(0, Math.sin(rig.t * 9)) : motion === 'run' ? 0.7 : 0;
    // fly: wings out and beating (a frozen gait phase holds them at the top of the stroke)
    flight.spread = motion === 'fly' ? 1 : 0;
    flight.flap = motion === 'fly' ? wingbeat(frozen !== null ? 0 : rig.t * 7, 0.6) : 0;
    if (DEV_JAW !== null) jaw.open = DEV_JAW;
    poseRig(rig, {
      dt: frozen !== null ? 0 : Math.min(dt, 0.05),
      speed,
      cruise,
      sleep: motion === 'sleep' ? 1 : 0,
      eat: motion === 'eat' ? 1 : 0,
      fly: motion === 'fly' ? 1 : 0,
      swim,
      turn: 0,
    });
    invalidate();
  });
  return rig;
}

// --- framing ------------------------------------------------------------------------------------

export interface Framing {
  center: [number, number, number];
  ext: [number, number, number]; // bounds extents (x width, y height, z length)
  size: number; // longest extent
  groundY: number; // ground plane in centred space
  face: { pt: [number, number, number]; r: number } | null; // face focus in centred space
}

export function framingOf(p: Phenotype): Framing {
  const { min, max } = p.bounds;
  const center: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const ext: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const size = Math.max(ext[0], ext[1], ext[2], 0.6);
  const faceNodes = p.nodes.filter((n) => n.terminal === 'mouth' || n.terminal === 'eye');
  let face: Framing['face'] = null;
  if (faceNodes.length) {
    const acc = [0, 0, 0];
    for (const n of faceNodes) for (let a = 0; a < 3; a++) acc[a] += n.pos[a];
    const pt: [number, number, number] = [
      acc[0] / faceNodes.length - center[0],
      acc[1] / faceNodes.length - center[1],
      acc[2] / faceNodes.length - center[2],
    ];
    let r = 0.2;
    for (const n of faceNodes) {
      r = Math.max(r, Math.hypot(n.pos[0] - center[0] - pt[0], n.pos[1] - center[1] - pt[1], n.pos[2] - center[2] - pt[2]) + n.radius);
    }
    face = { pt, r };
  }
  return { center, ext, size, groundY: -ext[1] / 2, face };
}

// --- one viewport's contents ---------------------------------------------------------------------

export interface Overlays {
  skeleton: boolean;
  grid: boolean;
}

export function SpecimenContent({
  phenotype,
  framing,
  skinMode,
  overlays,
  quality = 'high',
  background = '#0f1116',
  motion = 'still',
}: {
  phenotype: Phenotype;
  framing: Framing;
  skinMode: SkinMode;
  overlays: Overlays;
  quality?: SkinQuality;
  background?: string;
  motion?: Motion;
}) {
  const { center, size, groundY } = framing;
  const jaw = useMemo<JawControl>(() => ({ open: 1 }), []);
  const flight = useMemo<FlightControl>(() => ({ spread: 0, flap: 0 }), []);
  const lids = useMemo<LidControl>(() => ({ shut: 0 }), []);
  lids.shut = motion === 'sleep' ? 1 : 0;
  const rig = useMotion(phenotype, skinMode === 'capsules' ? 'still' : motion, jaw, flight);
  return (
    <>
      <color attach="background" args={[background]} />
      <StudioEnvironment />
      <hemisphereLight args={['#cfe0ff', '#2a2620', 0.55]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[size * 1.2, size * 1.8, size * 1.0]} intensity={1.15} />
      <directionalLight position={[-size * 1.0, size * 0.6, -size * 0.8]} intensity={0.35} color="#a7c0ff" />
      <group position={[-center[0], -center[1], -center[2]]}>
        {/* the jaw is articulated only while previewing motion; still keeps the built rest gape */}
        <JawContext.Provider value={rig ? jaw : null}>
          <FlightContext.Provider value={rig ? flight : null}>
            <LidContext.Provider value={lids}>
              <CreatureMesh phenotype={phenotype} skinMode={skinMode} quality={quality} rig={rig} carved={!rig} fur={quality === 'high'} />
            </LidContext.Provider>
          </FlightContext.Provider>
        </JawContext.Provider>
        {overlays.skeleton && <SkeletonOverlay phenotype={phenotype} rig={rig} />}
      </group>
      {overlays.grid && <GroundGrid y={groundY - 0.01} size={size} />}
    </>
  );
}

/** A body-unit ground grid: fine lines every 0.25 bu, bold every 1 bu. */
function GroundGrid({ y, size }: { y: number; size: number }) {
  const span = Math.ceil(size * 1.6);
  const geo = useMemo(() => {
    const fine: number[] = [];
    const bold: number[] = [];
    const n = span * 4;
    for (let i = -n; i <= n; i++) {
      const v = i / 4;
      const dst = i % 4 === 0 ? bold : fine;
      dst.push(-span, 0, v, span, 0, v, v, 0, -span, v, 0, span);
    }
    const f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute(fine, 3));
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', new THREE.Float32BufferAttribute(bold, 3));
    return { f, b };
  }, [span]);
  useEffect(() => () => {
    geo.f.dispose();
    geo.b.dispose();
  }, [geo]);
  return (
    <group position={[0, y, 0]}>
      <lineSegments geometry={geo.f}>
        <lineBasicMaterial color="#2a3140" transparent opacity={0.55} />
      </lineSegments>
      <lineSegments geometry={geo.b}>
        <lineBasicMaterial color="#46526a" transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}

// --- plate cameras -------------------------------------------------------------------------------

export type PlateKind = 'side' | 'front' | 'top' | 'face';
const PLATES: { kind: PlateKind; label: string }[] = [
  { kind: 'side', label: 'Lateral' },
  { kind: 'front', label: 'Anterior' },
  { kind: 'top', label: 'Dorsal' },
  { kind: 'face', label: 'Face' },
];

/** Orthographic zoom (px per bu) that fits a plate's two visible extents into its pixel box. */
export function plateZoom(kind: PlateKind, ext: [number, number, number], w: number, h: number): number {
  const [ex, ey, ez] = ext;
  const [hz, vt] = kind === 'side' ? [ez, ey] : kind === 'front' ? [ex, ey] : [ex, ez];
  return 0.84 * Math.min(w / Math.max(hz, 0.1), h / Math.max(vt, 0.1));
}

function PlateCamera({ kind, framing, px }: { kind: PlateKind; framing: Framing; px: { w: number; h: number } }) {
  const ref = useRef<THREE.OrthographicCamera>(null);
  const pref = useRef<THREE.PerspectiveCamera>(null);
  const invalidate = useThree((s) => s.invalidate);
  const D = framing.size * 4;
  useEffect(() => {
    if (kind === 'face') {
      const cam = pref.current;
      if (!cam) return;
      const f = framing.face ?? { pt: [0, 0, framing.ext[2] / 2] as [number, number, number], r: framing.size * 0.25 };
      // look at the face from front, a touch high and to the side (a three-quarter portrait)
      const d = Math.max(f.r * 3.6, framing.size * 0.55);
      cam.position.set(f.pt[0] + d * 0.42, f.pt[1] + d * 0.22, f.pt[2] + d * 0.88);
      cam.near = Math.max(0.01, framing.size * 0.005);
      cam.far = framing.size * 40;
      cam.lookAt(f.pt[0], f.pt[1], f.pt[2]);
      cam.updateProjectionMatrix();
    } else {
      const cam = ref.current;
      if (!cam) return;
      if (kind === 'side') {
        cam.up.set(0, 1, 0);
        cam.position.set(D, 0, 0);
      } else if (kind === 'front') {
        cam.up.set(0, 1, 0);
        cam.position.set(0, 0, D);
      } else {
        cam.up.set(0, 0, 1); // head toward the top of the plate
        cam.position.set(0, D, 0);
      }
      cam.lookAt(0, 0, 0);
      cam.zoom = plateZoom(kind, framing.ext, px.w, px.h);
      cam.near = 0.01;
      cam.far = D * 3;
      cam.updateProjectionMatrix();
    }
    invalidate();
  }, [kind, framing, px.w, px.h, D, invalidate]);
  return kind === 'face' ? (
    <PerspectiveCamera ref={pref} makeDefault fov={34} />
  ) : (
    <OrthographicCamera ref={ref} makeDefault />
  );
}

function usePixelSize(ref: MutableRefObject<HTMLElement | null>): { w: number; h: number } {
  const [px, setPx] = useState({ w: 200, h: 150 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx({ w: el.clientWidth || 200, h: el.clientHeight || 150 }));
    ro.observe(el);
    setPx({ w: el.clientWidth || 200, h: el.clientHeight || 150 });
    return () => ro.disconnect();
  }, [ref]);
  return px;
}

// --- the bench -----------------------------------------------------------------------------------

function Plate({
  kind,
  label,
  phenotype,
  framing,
  skinMode,
  overlays,
  motion,
}: {
  kind: PlateKind;
  label: string;
  phenotype: Phenotype;
  framing: Framing;
  skinMode: SkinMode;
  overlays: Overlays;
  motion: Motion;
}) {
  const box = useRef<HTMLDivElement>(null);
  const px = usePixelSize(box);
  const zoom = kind === 'face' ? 0 : plateZoom(kind, framing.ext, px.w, px.h);
  // a scale bar: the largest "nice" body-unit length that fits a quarter of the plate width
  const bar = useMemo(() => {
    if (!zoom) return null;
    const target = px.w * 0.25;
    const nice = [0.1, 0.25, 0.5, 1, 2, 5, 10];
    let pick = nice[0];
    for (const n of nice) if (n * zoom <= target) pick = n;
    return { len: pick, px: pick * zoom };
  }, [zoom, px.w]);
  return (
    <div className="plate" ref={box}>
      <View className="plate-view">
        <PlateCamera kind={kind} framing={framing} px={px} />
        <SpecimenContent phenotype={phenotype} framing={framing} skinMode={skinMode} overlays={overlays} background="#11141a" motion={motion} />
      </View>
      <span className="plate-label">{label}</span>
      {bar && (
        <span className="scale-bar">
          <i style={{ width: bar.px }} />
          {bar.len} bu
        </span>
      )}
    </div>
  );
}

function MainView({
  phenotype,
  framing,
  skinMode,
  overlays,
  motion,
}: {
  phenotype: Phenotype;
  framing: Framing;
  skinMode: SkinMode;
  overlays: Overlays;
  motion: Motion;
}) {
  const track = useRef<HTMLDivElement>(null);
  const d = framing.size * 1.9;
  // dev/headless: ?studiocam=side|front|top|face|headside|feet for a canonical main-view angle
  const cam = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('studiocam') : null;
  const f = framing.face ?? { pt: [0, 0, framing.ext[2] / 2] as [number, number, number], r: framing.size * 0.25 };
  const fd = Math.max(f.r * 3.2, framing.size * 0.4);
  // face / headside: a full-size portrait of the head (three-quarter, or straight profile);
  // feet: a low close-up of the first foot
  const foot = phenotype.nodes.find((n) => n.kind === 'terminal' && n.part?.kind === 'leg');
  const fp: [number, number, number] = foot
    ? [foot.pos[0] - framing.center[0], foot.pos[1] - framing.center[1], foot.pos[2] - framing.center[2]]
    : [0, framing.groundY, 0];
  const footD = framing.size * 0.38;
  const target: [number, number, number] = cam === 'face' || cam === 'headside' ? f.pt : cam === 'feet' ? fp : [0, 0, 0];
  const camPos: [number, number, number] =
    cam === 'side' ? [d * 0.95, d * 0.12, 0.01] : cam === 'front' ? [0.01, d * 0.15, d * 0.95] : cam === 'top' ? [0.01, d, 0.02]
      : cam === 'feet' ? [fp[0] + footD * 0.75 * Math.sign(fp[0] || 1), fp[1] + footD * 0.35, fp[2] + footD * 0.65]
      : cam === 'face' ? [f.pt[0] + fd * 0.42, f.pt[1] + fd * 0.22, f.pt[2] + fd * 0.88]
      : cam === 'headside' ? [f.pt[0] + fd, f.pt[1] + fd * 0.05, f.pt[2]]
      : [d * 0.62, d * 0.38, d * 0.7];
  return (
    <div className="studio-main" ref={track}>
      <View className="studio-main-view" track={track as MutableRefObject<HTMLElement>}>
        <PerspectiveCamera makeDefault position={camPos} fov={38} near={Math.max(0.02, framing.size * 0.01)} far={framing.size * 40} />
        <OrbitControls makeDefault target={target} enablePan={false} minDistance={framing.size * 0.4} maxDistance={framing.size * 7} />
        <SpecimenContent phenotype={phenotype} framing={framing} skinMode={skinMode} overlays={overlays} motion={motion} />
      </View>
    </div>
  );
}

const PART_LABEL: Record<string, string> = {
  leg: 'legs', arm: 'arms', wing: 'wings', fin: 'fins', tail: 'tails', horn: 'horns', spine: 'spines',
  frill: 'frills', antenna: 'antennae', tentacle: 'tentacles', eyestalk: 'eyes', maw: 'mouths',
  plate: 'carapace', ear: 'ears', gill: 'gills', crest: 'crests', whisker: 'whiskers',
};

/** Count the grown parts by kind (a part = one limb chain, i.e. one terminal node). */
export function partCounts(p: Phenotype): { kind: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const n of p.nodes) {
    if (n.kind !== 'terminal' || !n.part) continue;
    counts.set(n.part.kind, (counts.get(n.part.kind) ?? 0) + 1);
  }
  return [...counts.entries()].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n);
}

function Inspector({ genome, phenotype, framing }: { genome: Genome; phenotype: Phenotype; framing: Framing }) {
  const kinds = useMemo(() => nearestKinds(phenotype, 3), [phenotype]);
  const desc = useMemo(() => describe(phenotype), [phenotype]);
  const parts = useMemo(() => partCounts(phenotype), [phenotype]);
  const mass = useMemo(() => {
    let v = 0;
    for (const n of phenotype.nodes) if (n.kind === 'spine') v += (4 / 3) * Math.PI * n.radius ** 3;
    return v;
  }, [phenotype]);
  const mouth = phenotype.nodes.find((n) => n.terminal === 'mouth');
  const eye = phenotype.nodes.find((n) => n.terminal === 'eye');
  const pal = genome.palette;
  const swatch = (h: number, s: number, l: number) => `hsl(${(h * 360).toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
  return (
    <aside className="inspector">
      <section>
        <h3>Identification</h3>
        {kinds.map((k, i) => (
          <div key={k.id} className={`kind-row${i === 0 ? ' top' : ''}`}>
            <span>{k.id}</span>
            <span className="kind-bar"><i style={{ width: `${Math.round(k.score * 100)}%` }} /></span>
            <span className="num">{Math.round(k.score * 100)}%</span>
          </div>
        ))}
      </section>
      <section>
        <h3>Measurements</h3>
        <dl className="kv">
          <dt>length</dt><dd>{framing.ext[2].toFixed(2)} bu</dd>
          <dt>height</dt><dd>{framing.ext[1].toFixed(2)} bu</dd>
          <dt>width</dt><dd>{framing.ext[0].toFixed(2)} bu</dd>
          <dt>trunk mass</dt><dd>{mass.toFixed(2)} bu³</dd>
          <dt>nodes</dt><dd>{phenotype.nodes.length}</dd>
        </dl>
      </section>
      <section>
        <h3>Morphospace</h3>
        {desc.map((v, i) => (
          <div key={i} className="desc-row">
            <span>{DESCRIPTOR_LABELS[i]}</span>
            <span className="kind-bar"><i style={{ width: `${Math.round(v * 100)}%` }} /></span>
          </div>
        ))}
      </section>
      <section>
        <h3>Body plan</h3>
        <dl className="kv">
          <dt>symmetry</dt><dd>{genome.symmetry}{genome.symmetry === 'radial' ? ` ×${genome.radialCount}` : ''}</dd>
          <dt>coherence</dt><dd>{(genome.coherence ?? 1).toFixed(2)}</dd>
          {mouth && (<><dt>mouth</dt><dd>{mouthVariant(mouth.part?.style ?? 0)}</dd></>)}
          {eye && (<><dt>eyes</dt><dd>{eyeVariant(eye.part?.style ?? 0)}</dd></>)}
        </dl>
        <div className="parts">
          {parts.map((p) => (
            <span key={p.kind} className="part-chip">
              <i style={{ background: BONE_COLORS[p.kind] ?? BONE_COLORS.other }} />
              {p.n} {PART_LABEL[p.kind] ?? p.kind}
            </span>
          ))}
        </div>
      </section>
      <section>
        <h3>Covering</h3>
        <dl className="kv">
          <dt>type</dt><dd>{genome.covering.type}</dd>
          <dt>pattern</dt><dd>{genome.covering.pattern}</dd>
          <dt>sheen</dt><dd>{genome.covering.sheen.toFixed(2)}</dd>
        </dl>
        <div className="swatches">
          <i style={{ background: swatch(pal.hueA, pal.sat * 0.8, pal.light * 0.88) }} title="body" />
          <i style={{ background: swatch(pal.hueB, Math.min(1, pal.sat * 1.1), pal.light * 0.44) }} title="pattern" />
        </div>
      </section>
    </aside>
  );
}

function Bench({ genome, skinMode, overlays, motion }: { genome: Genome; skinMode: SkinMode; overlays: Overlays; motion: Motion }) {
  const phenotype = useMemo(() => grow(genome), [genome]);
  const framing = useMemo(() => framingOf(phenotype), [phenotype]);
  return (
    <div className="bench">
      <div className="bench-views">
        <MainView phenotype={phenotype} framing={framing} skinMode={skinMode} overlays={overlays} motion={motion} />
        <div className="plates">
          {PLATES.map((pl) => (
            <Plate key={pl.kind} kind={pl.kind} label={pl.label} phenotype={phenotype} framing={framing} skinMode={skinMode} overlays={overlays} motion={motion} />
          ))}
        </div>
      </div>
      <Inspector genome={genome} phenotype={phenotype} framing={framing} />
    </div>
  );
}

// --- the bestiary --------------------------------------------------------------------------------

function BestiaryCard({
  genome,
  label,
  skinMode,
  overlays,
  ready,
  onAdopt,
}: {
  genome: Genome;
  label: string;
  skinMode: SkinMode;
  overlays: Overlays;
  ready: boolean;
  onAdopt: () => void;
}) {
  const phenotype = useMemo(() => grow(genome), [genome]);
  const framing = useMemo(() => framingOf(phenotype), [phenotype]);
  const box = useRef<HTMLButtonElement>(null);
  const d = framing.size * 2.0;
  return (
    <button className="bestiary-card" ref={box} onClick={onAdopt} title={`adopt this ${label} as the breeding parent`}>
      {ready && (
        <View className="bestiary-view">
          <PerspectiveCamera makeDefault position={[d * 0.62, d * 0.36, d * 0.7]} fov={34} onUpdate={(c) => c.lookAt(0, 0, 0)} />
          <SpecimenContent phenotype={phenotype} framing={framing} skinMode={skinMode} overlays={overlays} quality="low" background="#11141a" />
        </View>
      )}
      <span className="plate-label">{label}</span>
    </button>
  );
}

function Bestiary({
  seed,
  skinMode,
  overlays,
  onAdopt,
}: {
  seed: number;
  skinMode: SkinMode;
  overlays: Overlays;
  onAdopt: (g: Genome) => void;
}) {
  const genomes = useMemo(() => MORPHOTYPE_IDS.map((id, i) => ({ id, g: genomeOfMorphotype((seed + i * 7919) >>> 0, id) })), [seed]);
  // reveal specimens one at a time so building ~30 smooth surfaces never stalls a frame for seconds
  const [shown, setShown] = useState(0);
  useEffect(() => setShown(0), [seed, skinMode]);
  useEffect(() => {
    if (shown >= genomes.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 16);
    return () => clearTimeout(t);
  }, [shown, genomes.length]);
  return (
    <div className="bestiary">
      {genomes.map(({ id, g }, i) => (
        <BestiaryCard key={id} genome={g} label={id} skinMode={skinMode} overlays={overlays} ready={i < shown} onAdopt={() => onAdopt(g)} />
      ))}
    </div>
  );
}

// --- the studio shell ----------------------------------------------------------------------------

export function Studio({
  genome,
  skinMode,
  onSkinMode,
  onAdopt,
  onExit,
}: {
  genome: Genome;
  skinMode: SkinMode;
  onSkinMode: (m: SkinMode) => void;
  onAdopt: (g: Genome) => void;
  onExit: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'bench' | 'bestiary'>(() =>
    typeof location !== 'undefined' && new URLSearchParams(location.search).get('bestiary') === '1' ? 'bestiary' : 'bench',
  );
  const [overlays, setOverlays] = useState<Overlays>(() => ({
    skeleton: typeof location !== 'undefined' && new URLSearchParams(location.search).get('bones') === '1',
    grid: true,
  }));
  const [bestiarySeed, setBestiarySeed] = useState(() => (import.meta.env.DEV && typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('bseed') ?? 1) : 1));
  const [motion, setMotion] = useState<Motion>(() => {
    const m = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('motion') : null;
    return m === 'walk' || m === 'run' || m === 'eat' || m === 'sleep' || m === 'fly' ? m : 'still';
  });
  const winged = useMemo(() => traitsOf(grow(genome)).winged, [genome]);
  return (
    <div className="studio" ref={container}>
      <header className="studio-bar">
        <h1>Cambrian</h1>
        <nav className="tabs">
          <button className={tab === 'bench' ? 'active' : ''} onClick={() => setTab('bench')}>Specimen</button>
          <button className={tab === 'bestiary' ? 'active' : ''} onClick={() => setTab('bestiary')}>Bestiary</button>
        </nav>
        <div className="studio-tools">
          <label><input type="checkbox" checked={overlays.skeleton} onChange={(e) => setOverlays((o) => ({ ...o, skeleton: e.target.checked }))} /> skeleton</label>
          <label><input type="checkbox" checked={overlays.grid} onChange={(e) => setOverlays((o) => ({ ...o, grid: e.target.checked }))} /> grid</label>
          {tab === 'bench' && (
            <select className="motion-pick" value={motion} onChange={(e) => setMotion(e.target.value as Motion)} title="preview the creature's gait and poses (smooth skins)">
              <option value="still">still</option>
              <option value="walk">walk</option>
              <option value="run">run</option>
              <option value="eat">eat</option>
              <option value="sleep">sleep</option>
              {winged && <option value="fly">fly</option>}
            </select>
          )}
          <span className="sep" />
          {(['capsules', 'smooth', 'hybrid'] as const).map((m) => (
            <button key={m} className={skinMode === m ? 'active' : ''} onClick={() => onSkinMode(m)}>{m}</button>
          ))}
          {tab === 'bestiary' && <button onClick={() => setBestiarySeed((s) => s + 1)}>↻ new specimens</button>}
          <span className="sep" />
          <button onClick={onExit}>← back to breeding</button>
        </div>
      </header>
      {tab === 'bench' ? (
        <Bench genome={genome} skinMode={skinMode} overlays={overlays} motion={motion} />
      ) : (
        <Bestiary seed={bestiarySeed} skinMode={skinMode} overlays={overlays} onAdopt={(g) => { onAdopt(g); setTab('bench'); }} />
      )}
      {/* on-demand: the bench is static unless orbited (OrbitControls invalidates on change), so it
          renders a frame per interaction instead of five viewports every frame */}
      <Canvas
        className="studio-canvas"
        frameloop="demand"
        eventSource={container as MutableRefObject<HTMLElement>}
        gl={{ preserveDrawingBuffer: import.meta.env.DEV, antialias: true }}
        dpr={[1, 2]}
      >
        <View.Port />
      </Canvas>
    </div>
  );
}
