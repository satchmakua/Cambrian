/**
 * A single offspring in the breeder gallery: a small static render of a candidate creature, drawn
 * into ONE shared canvas the gallery owns (nine canvases meant nine WebGL contexts, and the browser
 * drops contexts past ~16). Each is lit by the same procedural studio environment as the hero view
 * and wears the same hybrid skin — but the skins are built staggered (slot i upgrades from the capsule
 * kit after a short delay), so a fresh litter never stalls a frame building nine surfaces at once.
 *
 * The thumbnail's scene lives in the gallery canvas (a portal into its own THREE.Scene) and draws
 * itself, scissored, into the rectangle of its button — measured against the canvas's own rectangle
 * every frame. (drei's <View> did this for us, but it judges a view offscreen by comparing the
 * view's position in the WINDOW with the canvas's SIZE — it assumes a full-window canvas. The
 * gallery's canvas sits in the right-hand rail, so after its first frame every thumbnail decided it
 * was offscreen and never drew again: the litter froze on the first generation it showed.)
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { grow } from '../engine/grow';
import { CreatureMesh } from './CreatureMesh';
import { StudioEnvironment } from './StudioEnvironment';
import { framingOf } from './framing';
import { scissorRect } from './scissor';
import { restPosed } from './rig';
import type { Genome } from '../engine/genome';

export function OffspringThumb({ genome, slot, track }: { genome: Genome; slot: number; track: MutableRefObject<(HTMLElement | null)[]> }) {
  // (a snake lies in its resting S, as it does on the main stage — no rig here to pose it)
  const phenotype = useMemo(() => restPosed(grow(genome)), [genome]);
  const framing = useMemo(() => framingOf(phenotype), [phenotype]);
  const [smooth, setSmooth] = useState(false);
  useEffect(() => {
    setSmooth(false);
    // (one ~20–50 ms build per slot, spaced so input still gets in between them)
    const t = setTimeout(() => setSmooth(true), 40 + slot * 55);
    return () => clearTimeout(t);
  }, [phenotype, slot]);

  const [scene] = useState(() => new THREE.Scene());
  const camera = useMemo(() => {
    const d = framing.size * 1.75;
    const cam = new THREE.PerspectiveCamera(36, 1, framing.size * 0.01, framing.size * 40);
    cam.position.set(d * 0.62, d * 0.34, d * 0.72);
    cam.lookAt(0, 0, 0);
    return cam;
  }, [framing]);

  // The canvas renders on demand and keeps its pixels between frames (preserveDrawingBuffer), so a
  // thumbnail redraws only when ITS content changed or it moved — a skin upgrading in one slot used to
  // redraw all nine scenes, twice, for each of the nine upgrades. Ask for a frame whenever this
  // thumbnail's content changes (and once more shortly after, when a freshly built skin has landed).
  const invalidate = useThree((s) => s.invalidate);
  const dirty = useRef(true);
  const drawn = useRef({ left: NaN, bottom: NaN, width: NaN, height: NaN, cw: 0, ch: 0 });
  useEffect(() => {
    dirty.current = true;
    invalidate();
    const t = setTimeout(() => {
      dirty.current = true;
      invalidate();
    }, 120);
    return () => clearTimeout(t);
  }, [phenotype, smooth, invalidate]);

  useFrame(({ gl }) => {
    const el = track.current[slot];
    if (!el) return;
    const r = scissorRect(el.getBoundingClientRect(), gl.domElement.getBoundingClientRect());
    if (!r) return;
    // (a resized drawing buffer comes back blank: everything redraws)
    const cw = gl.domElement.width;
    const ch = gl.domElement.height;
    const d = drawn.current;
    if (!dirty.current && d.left === r.left && d.bottom === r.bottom && d.width === r.width && d.height === r.height && d.cw === cw && d.ch === ch) return;
    dirty.current = false;
    Object.assign(d, r, { cw, ch });
    const aspect = r.width / r.height;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setViewport(r.left, r.bottom, r.width, r.height);
    gl.setScissor(r.left, r.bottom, r.width, r.height);
    gl.setScissorTest(true);
    gl.clear(true, true, true); // this rectangle only: last generation's creature must not show through
    gl.render(scene, camera);
    gl.setScissorTest(false);
    gl.autoClear = autoClear;
    // what this slot shows now (headless checks read it: the preview must match the litter)
    el.dataset.drawn = `${genome.seed}:${smooth ? 'skin' : 'kit'}`;
  }, 1);

  const c = framing.center;
  return createPortal(
    <>
      <StudioEnvironment />
      <hemisphereLight args={['#cfe0ff', '#2a2620', 0.55]} />
      <directionalLight position={[framing.size, framing.size * 1.6, framing.size]} intensity={1.1} />
      <group position={[-c[0], -c[1], -c[2]]}>
        <CreatureMesh phenotype={phenotype} skinMode={smooth ? 'hybrid' : 'capsules'} quality="low" />
      </group>
    </>,
    scene,
  );
}
