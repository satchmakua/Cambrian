/**
 * The planet lab's camera: a globe you spin from orbit, which becomes, as you come down to the ground, the
 * valley's orbit view with the ground's own up. One camera, with no switch between the two.
 *
 * It is held as the place it looks at (T, a unit vector), a heading there (H: the way the top of the screen
 * faces, laid on the ground), a tilt (0 looks straight down; near the ground up to the valley's 0.47π, from
 * orbit none) and a range (bu from that place). The camera stands back and up from it, at
 * T + range · (cos tilt · up − sin tilt · H), its own up between the two. Nothing here is a latitude or a
 * longitude, so it passes over a pole as over anywhere else, and never flips.
 *
 * A drag spins the globe from afar and, close by, turns the view about the place looked at, blended between
 * the two by the range; a right drag (or a shift-drag) pans; the wheel zooms toward the pointer; a double
 * click flies there. F frames the whole planet and 1–4 give its four views; Esc lets a followed creature go.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { anyTangent, arc, cross, settle, slide, tangent, toward, turn, type Vec3 } from '../../sim/sphere';
import { heightOn, type PlanetGround } from '../../sim/planetGround';
import type { Creature, World } from '../../sim/world';
import { START_FOLLOW, START_VIEW, useLab, type ViewName } from './labStore';

interface View {
  T: Vec3;
  H: Vec3;
  tilt: number;
  range: number;
}

/** a flight to a place: along the great circle there, out and back in if it is far */
interface Flight {
  from: Vec3;
  dir: Vec3;
  total: number;
  H0: Vec3;
  r0: number;
  r1: number;
  a0: number;
  a1: number;
  bump: number;
  t: number;
  dur: number;
}

/** What the camera is doing, for the HUD and a headless harness: its range and tilt, its height above the
 *  ground and above the sea, how far off its horizon is, and how far below level (degrees). */
export const CAMERA = { range: 0, tilt: 0, alt: 0, height: 0, horizon: 0, dip: 0 };

/** Where the camera looks (T, a unit vector; `at`, the point itself), and how far it has drawn back into
 *  orbit (0 on the ground … 1 out in space): the scene's light is turned and dimmed by them, and the trees
 *  between the camera and that point are left out. */
export const LOOK: { T: Vec3; at: Vec3; orbit: number } = { T: [0, 1, 0], at: [0, 0, 0], orbit: 1 };

const MAX_TILT = Math.PI * 0.47;
const MIN_RANGE = 1.2;

/** the tilt a range allows: the valley's near the ground, none from orbit (so zooming out levels the view) */
function tiltCap(range: number, R: number): number {
  return MAX_TILT * (1 - THREE.MathUtils.smoothstep(range, 0.22 * R, 1.1 * R));
}

/** how much a drag spins the globe (1) rather than turning the view about the place looked at (0) */
function spinShare(range: number, R: number): number {
  return THREE.MathUtils.smoothstep(range, 0.3 * R, 1.25 * R);
}

/** The four views (the number keys 1–4, and ?view=): the whole planet, a region, the ground, a creature's
 *  height. */
export const VIEWS: Record<ViewName, (R: number) => { range: number; tilt: number }> = {
  orbit: (R) => ({ range: 2.7 * R, tilt: 0 }),
  region: (R) => ({ range: 0.55 * R, tilt: 0.5 }),
  ground: () => ({ range: 26, tilt: 1.12 }),
  low: () => ({ range: 7, tilt: 1.38 }),
};
const KEYS: Record<string, ViewName> = { '1': 'orbit', '2': 'region', '3': 'ground', '4': 'low' };

/** Where the lab opens: over the homeland, where life starts, with the top of the screen facing north. */
function startView(R: number, home: Vec3): View {
  const north = tangent(home, [0, 1, 0]);
  const v = VIEWS[START_VIEW](R);
  return { T: home, H: north[0] || north[1] || north[2] ? north : anyTangent(home), tilt: Math.min(v.tilt, tiltCap(v.range, R)), range: v.range };
}

/** A living creature of the world, by id (undefined: none). */
const creatureOf = (w: World, id: number | null): Creature | undefined => (id === null ? undefined : w.creatures.find((c) => c.id === id && c.alive));
/** A creature's place, as a unit vector. */
const placeOf = (c: Creature, R: number): Vec3 => [c.x / R, c.y / R, c.z / R];

const RAYCASTER = new THREE.Raycaster();
const NDC = new THREE.Vector2();
const HIT = new THREE.Vector3();

/** The place under the pointer, on the ball at the sea's height (null: the pointer is off the planet). */
function pick(camera: THREE.Camera, el: HTMLElement, x: number, y: number, R: number): Vec3 | null {
  const r = el.getBoundingClientRect();
  NDC.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  RAYCASTER.setFromCamera(NDC, camera);
  const o = RAYCASTER.ray.origin, d = RAYCASTER.ray.direction;
  const b = o.dot(d), h = b * b - (o.lengthSq() - R * R);
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  if (t < 0) return null;
  HIT.copy(o).addScaledVector(d, t).normalize();
  return [HIT.x, HIT.y, HIT.z];
}

/** Drag the ground under the pointer `dx`, `dy` pixels (`span` bu of ground to a pixel): the place looked
 *  at slides the other way, its heading carried with it. */
function panBy(v: View, dx: number, dy: number, span: number, R: number): void {
  const E = cross(v.H, v.T); // the screen's right, laid on the ground
  const m: Vec3 = [-E[0] * dx + v.H[0] * dy, -E[1] * dx + v.H[1] * dy, -E[2] * dx + v.H[2] * dy];
  const l = Math.hypot(m[0], m[1], m[2]);
  if (l < 1e-9) return;
  const s = slide(v.T, [m[0] / l, m[1] / l, m[2] / l], (Math.hypot(dx, dy) * span) / R, v.H);
  v.T = s.p;
  v.H = s.v;
}

const GV = new THREE.Vector3();
const CV = new THREE.Vector3();

/** The globe camera, over a planet's world (made anew with each world: it opens over that one's homeland). */
export function GlobeCamera({ ground, world, home }: { ground: PlanetGround; world: World; home: Vec3 }) {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const gl = useThree((st) => st.gl);
  const R = ground.radius;
  const view = useRef<View | null>(null);
  if (view.current === null) view.current = startView(R, home);
  const sized = useRef(R);
  // input waiting to be applied, a share of it a frame (a little inertia, as the valley's damped controls have)
  const pend = useRef({ dx: 0, dy: 0, px: 0, py: 0, zoom: 0 });
  const zoomAt = useRef<Vec3 | null>(null);
  const flight = useRef<Flight | null>(null);
  const lift = useRef(0);

  const flyTo = useRef<(q: Vec3, to: { range: number; tilt: number }) => void>(() => {});
  flyTo.current = (q, to) => {
    const v = view.current!;
    const total = arc(v.T, q);
    const Rn = sized.current;
    flight.current = {
      from: v.T,
      dir: total > 1e-6 ? toward(v.T, q) : v.H,
      total,
      H0: v.H,
      r0: v.range,
      r1: to.range,
      a0: v.tilt,
      a1: Math.min(to.tilt, tiltCap(to.range, Rn)),
      // (far off, it rises on the way to see where it is going)
      bump: Math.max(0, total * Rn * 0.9 - Math.max(v.range, to.range)) * 0.6,
      t: 0,
      dur: 0.9 + Math.min(1.6, total * 1.2),
    };
  };

  useEffect(() => {
    const el = gl.domElement;
    let drag: { id: number; button: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (drag) return;
      drag = { id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const P = pend.current;
      if (drag.button !== 0 || e.shiftKey) {
        P.px += dx;
        P.py += dy;
      } else {
        P.dx += dx;
        P.dy += dy;
      }
      // (a drag takes over from a flight)
      if (dx || dy) flight.current = null;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      pend.current.zoom += e.deltaY * k;
      zoomAt.current = e.deltaY < 0 ? pick(camera, el, e.clientX, e.clientY, sized.current) : null;
      flight.current = null;
    };
    const dbl = (e: MouseEvent) => {
      const q = pick(camera, el, e.clientX, e.clientY, sized.current);
      if (q) flyTo.current(q, { range: Math.min(view.current!.range, Math.max(20, 0.18 * sized.current)), tilt: 0.9 });
    };
    const menu = (e: Event) => e.preventDefault();
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const v = view.current!;
      if (e.key === 'Escape') useLab.getState().set({ follow: null });
      else if (e.key === 'f' || e.key === 'F') flyTo.current(v.T, VIEWS.orbit(sized.current));
      else if (KEYS[e.key]) flyTo.current(v.T, VIEWS[KEYS[e.key]](sized.current));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    el.addEventListener('contextmenu', menu);
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
      el.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', key);
    };
  }, [gl, camera]);

  // (?follow=1: open on the animal nearest the opening view, the way a click on it would)
  const opened = useRef(false);
  useEffect(() => {
    if (!START_FOLLOW || opened.current) return;
    opened.current = true;
    const T = view.current!.T;
    let best: Creature | null = null, bd = Infinity;
    for (const c of world.creatures) {
      const d = arc(T, placeOf(c, R));
      if (c.alive && c.traits.habitat !== 'water' && d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best) useLab.getState().set({ follow: best.id });
  }, [world, R]);

  // a creature picked: fly down to it (it is then kept under the camera, frame by frame)
  const follow = useLab((st) => st.follow);
  useEffect(() => {
    const c = creatureOf(world, follow);
    if (c) flyTo.current(placeOf(c, R), { range: Math.min(view.current!.range, 16), tilt: 1.05 });
  }, [follow, world, R]);

  useFrame((_, dt) => {
    const v = view.current!;
    const Rn = R;
    const P = pend.current;
    const share = 1 - Math.pow(0.75, Math.min(dt, 0.1) * 60);
    const tall = gl.domElement.clientHeight || 1;
    // bu of ground to a pixel, at the place looked at
    const span = (2 * v.range * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / tall;

    const fl = flight.current;
    if (fl) {
      fl.t = Math.min(1, fl.t + dt / fl.dur);
      const e = fl.t * fl.t * (3 - 2 * fl.t);
      const at = slide(fl.from, fl.dir, e * fl.total, fl.H0);
      v.T = at.p;
      v.H = at.v;
      v.range = fl.r0 + (fl.r1 - fl.r0) * e + fl.bump * Math.sin(Math.PI * e);
      v.tilt = fl.a0 + (fl.a1 - fl.a0) * e;
      if (fl.t >= 1) flight.current = null;
    }
    // a drag: spin the globe, or turn about the place looked at (drag right: the view swings right, as the
    // valley's camera does; drag up: it tips toward the horizon)
    const dx = P.dx * share, dy = P.dy * share;
    P.dx -= dx;
    P.dy -= dy;
    if (dx || dy) {
      const w = spinShare(v.range, Rn);
      if (w > 0) panBy(v, dx * w, dy * w, span, Rn);
      if (w < 1) {
        v.H = turn(v.T, v.H, (-dx * (1 - w) * 2 * Math.PI) / tall);
        v.tilt = Math.max(0, Math.min(tiltCap(v.range, Rn), v.tilt - (dy * (1 - w) * Math.PI) / tall));
      }
    }
    const px = P.px * share, py = P.py * share;
    P.px -= px;
    P.py -= py;
    if (px || py) panBy(v, px, py, span, Rn);
    // the wheel: zoom, toward the pointer coming in
    const z = P.zoom * share;
    P.zoom -= z;
    if (z) {
      const r1 = Math.max(MIN_RANGE, Math.min(5 * Rn, v.range * Math.exp(z * 0.0011)));
      const q = zoomAt.current;
      if (q && r1 < v.range) {
        const a = arc(v.T, q);
        if (a > 1e-7) {
          const m = slide(v.T, toward(v.T, q), a * (1 - r1 / v.range), v.H);
          v.T = m.p;
          v.H = m.v;
        }
      }
      v.range = r1;
    }
    // a creature followed is kept under the camera (and its height, if it flies)
    const b = creatureOf(world, useLab.getState().follow);
    if (b && !flight.current) {
      const bp = placeOf(b, Rn);
      const a = arc(v.T, bp);
      if (a > 1e-7) {
        const m = slide(v.T, toward(v.T, bp), a * (1 - Math.exp(-dt * 6)), v.H);
        v.T = m.p;
        v.H = m.v;
      }
    }
    lift.current += ((b ? b.alt : 0) - lift.current) * Math.min(1, dt * 3);
    const cap = tiltCap(v.range, Rn);
    if (v.tilt > cap) v.tilt += (cap - v.tilt) * Math.min(1, dt * 8);
    const kept = settle(v.T, v.H);
    v.T = kept.p;
    v.H = kept.f;

    // the camera: back and up from the ground looked at, never under the ground itself
    const G = GV.set(v.T[0], v.T[1], v.T[2]).multiplyScalar(Rn + Math.max(heightOn(ground, v.T), 0) + lift.current);
    const ct = Math.cos(v.tilt), st = Math.sin(v.tilt);
    const C = CV.set(v.T[0] * ct - v.H[0] * st, v.T[1] * ct - v.H[1] * st, v.T[2] * ct - v.H[2] * st).multiplyScalar(v.range).add(G);
    let cr = C.length();
    const under = Math.max(heightOn(ground, [C.x / cr, C.y / cr, C.z / cr]), 0);
    if (cr < Rn + under + 0.6) {
      C.multiplyScalar((Rn + under + 0.6) / cr);
      cr = Rn + under + 0.6;
    }
    camera.position.copy(C);
    camera.up.set(v.T[0] * st + v.H[0] * ct, v.T[1] * st + v.H[1] * ct, v.T[2] * st + v.H[2] * ct);
    camera.lookAt(G);
    const alt = cr - Rn - under;
    // (the near plane follows the camera's height: close to the ground it must be close, and from orbit
    // the depth buffer is wanted out there)
    camera.near = Math.max(0.05, Math.min(20, alt * 0.03));
    camera.far = cr + 11 * Rn;
    camera.updateProjectionMatrix();
    LOOK.T = v.T;
    LOOK.at = [G.x, G.y, G.z];
    LOOK.orbit = spinShare(v.range, Rn);
    CAMERA.range = v.range;
    CAMERA.tilt = v.tilt;
    CAMERA.alt = alt;
    CAMERA.height = cr - Rn;
    CAMERA.horizon = Math.sqrt(Math.max(0, cr * cr - Rn * Rn));
    CAMERA.dip = (Math.acos(Math.min(1, Rn / cr)) * 180) / Math.PI;
  });
  return null;
}
