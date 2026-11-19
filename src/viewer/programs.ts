/**
 * Keep compiled shader programs for the whole session.
 *
 * three deletes a program as soon as the last material using it is disposed. Swapping a breeder
 * litter disposes all nine thumbnails' materials in one commit, before their replacements first
 * render — so every program the litter shared was deleted and then linked all over again: 4–14
 * relinks per pick, measured. A link of the creature shader (a physical material plus the covering
 * code) costs ~100–500 ms on a real GPU, and that was the pick's "freeze"; a creature dying in the
 * World, or each portrait drawn, paid the same. The variants are few (coverings × skinning × a scene's
 * lights), so they are simply kept: after every frame, each program a renderer holds gets one extra
 * use that is never given back, and three never frees it.
 */
import { useEffect, useRef } from 'react';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';

interface ProgramLike {
  usedTimes: number;
}

/** how long a patient WarmShaders waits where programs are built off the page's thread */
export const PATIENCE_MS = 180000;

/** how long a canvas taken down keeps its context while programs it asked for are still being built
 *  (ms; see guardDraws) */
export const LOSE_WAIT_MS = 20000;

const RENDERERS = new Set<THREE.WebGLRenderer>();
const PINNED = new WeakSet<object>();
let hooked = false;

/** Pin every program this renderer holds; returns how many were newly pinned (idempotent, cheap). */
export function pinPrograms(gl: Pick<THREE.WebGLRenderer, 'info'>): number {
  const progs = (gl.info as { programs?: ProgramLike[] | null }).programs;
  if (!progs) return 0;
  let n = 0;
  for (const p of progs) {
    if (PINNED.has(p)) continue;
    PINNED.add(p);
    p.usedTimes++;
    n++;
  }
  return n;
}

/** thrown out of three's first use of a program that is still being built (see guardDraws) */
const NOT_READY = new Error('shader program still building');

export interface DrawGuard {
  /** programs a draw was held back for, not yet built */
  waiting: Set<WebGLProgram>;
  /** called when the last of them is built, and when a creature's drawn parts must be taken back */
  wake: Set<() => void>;
  /** how many draws have been held back */
  held: number;
}
const GUARDS = new WeakMap<object, DrawGuard>();
/** a creature drawn whole or not at all (userData.drawWhole on its root) → the programs it waits for */
const WHOLE = new WeakMap<THREE.Object3D, Set<WebGLProgram>>();
const ROOTS = new WeakMap<THREE.Object3D, THREE.Object3D | null>();

function wholeOf(o: THREE.Object3D | null | undefined): THREE.Object3D | null {
  if (!o) return null;
  const known = ROOTS.get(o);
  if (known !== undefined) return known;
  let root: THREE.Object3D | null = null;
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p.userData.drawWhole) {
      root = p;
      break;
    }
  }
  ROOTS.set(o, root);
  return root;
}

/**
 * Never wait for a shader program inside a draw.
 *
 * Where the browser builds programs off the page's thread (KHR_parallel_shader_compile), a program
 * asked for is not built yet — and three's first use of one asks the driver for its link status, which
 * WAITS for the build. On Windows, where Chrome compiles through Direct3D, the creature's program took
 * 52 s: a draw that used it before then held the whole page for the rest of that time (measured on the
 * owner's laptop: a 32 s block when a 20 s wait gave up). So a draw whose program is still building is
 * skipped: the first question three asks of an unbuilt program throws out of the draw, and the object
 * is drawn on a later frame, when its program is ready. A creature (userData.drawWhole on its root) is
 * held back whole while any of its programs is building. Whoever needs the finished picture (a still
 * canvas, a portrait) is woken through `wake`, or waits on shadersSettled.
 *
 * Without the extension nothing is changed: programs are built where they are first used, as before.
 */
export function guardDraws(gl: THREE.WebGLRenderer): DrawGuard | null {
  const known = GUARDS.get(gl);
  if (known) return known;
  const ctx = gl.getContext() as WebGL2RenderingContext;
  const ext = ctx.getExtension?.('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
  if (!ext) return null;
  const DONE = ext.COMPLETION_STATUS_KHR;
  const param = ctx.getProgramParameter.bind(ctx);
  const info = ctx.getProgramInfoLog.bind(ctx);
  // A program deleted while it was waited for (a thumbnail's kit swapped for its skin before the kit's
  // programs were pinned) is nothing to wait for — and asking after it is an error the browser
  // reports on the console, once per poll.
  const deleted = new WeakSet<WebGLProgram>();
  if (typeof ctx.deleteProgram === 'function') {
    const del = ctx.deleteProgram.bind(ctx);
    (ctx as unknown as Record<string, unknown>).deleteProgram = (program: WebGLProgram | null) => {
      if (program) deleted.add(program);
      return del(program);
    };
  }
  // (a lost context answers null: nothing is waited for there)
  const built = (program: WebGLProgram) => deleted.has(program) || param(program, DONE) !== false;
  // Giving a context up waits for every program it is still building: Chrome's loseContext holds the
  // page until the GPU process is done with them — 9 s, measured, when the menu's stage was taken down
  // on "Start game" a moment after it had asked for the creature's shader. A canvas taken down (React
  // Three Fiber loses its context on unmount) gives it up once they are built, and the page goes on.
  // (Its commands are flushed meanwhile, so the builds it asked for go ahead with no canvas drawing it;
  // and it is given up after LOSE_WAIT_MS whatever: a context kept holds its share of the graphics
  // memory, and a laptop's built-in graphics have little of it.)
  if (typeof gl.forceContextLoss === 'function') {
    const lose = gl.forceContextLoss.bind(gl);
    gl.forceContextLoss = () => {
      const since = Date.now();
      const building = () => ((gl.info as { programs?: { program: WebGLProgram }[] | null }).programs ?? []).some((p) => !built(p.program));
      const later = () => {
        ctx.flush?.();
        if (building() && Date.now() - since < LOSE_WAIT_MS) setTimeout(later, 100);
        else lose();
      };
      later();
    };
  }
  const guard: DrawGuard = { waiting: new Set(), wake: new Set(), held: 0 };
  GUARDS.set(gl, guard);
  const wake = () => {
    for (const w of [...guard.wake]) w();
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  const watch = () => {
    if (timer !== undefined) return;
    timer = setInterval(() => {
      for (const p of [...guard.waiting]) if (built(p)) guard.waiting.delete(p);
      if (guard.waiting.size > 0) return;
      clearInterval(timer);
      timer = undefined;
      wake();
    }, 40);
  };
  let drawing: THREE.Object3D | null | undefined; // the object inside a guarded draw (undefined outside one)
  // A creature held back has all its programs asked for at once, after the frame (three cannot compile
  // in the middle of a render), and waits for every one of them. (Held at its first unbuilt program, its
  // others were not even asked for until that one was built: they built one after another, the creature
  // flashing up and going again between each.)
  let view: { scene: THREE.Scene; camera: THREE.Camera } | null = null;
  const asking = new WeakSet<THREE.Object3D>();
  const askAll = (whole: THREE.Object3D) => {
    const at = view;
    if (!at || asking.has(whole)) return;
    asking.add(whole);
    setTimeout(() => {
      try {
        const set = WHOLE.get(whole);
        for (const m of gl.compile(whole, at.camera, at.scene)) {
          const programs = (gl.properties.get(m) as { programs?: Map<string, { program: WebGLProgram }> }).programs;
          if (!set || !programs) continue;
          for (const { program } of programs.values()) {
            if (built(program)) continue;
            set.add(program);
            guard.waiting.add(program);
          }
        }
        pinPrograms(gl);
        watch();
      } catch {
        // (a creature gone from the scene since: nothing to ask for)
      } finally {
        asking.delete(whole);
      }
    }, 0);
  };
  const hold = (program: WebGLProgram): boolean => {
    if (drawing === undefined || built(program)) return false;
    guard.waiting.add(program);
    const whole = wholeOf(drawing);
    if (whole) {
      let set = WHOLE.get(whole);
      if (!set) WHOLE.set(whole, (set = new Set()));
      set.add(program);
    }
    return true;
  };
  // three's first use of a program (WebGLProgram onFirstUse) begins with one of these two questions
  const raw = ctx as unknown as Record<string, unknown>;
  raw.getProgramInfoLog = (program: WebGLProgram) => {
    if (hold(program)) throw NOT_READY;
    return info(program);
  };
  raw.getProgramParameter = (program: WebGLProgram, name: number) => {
    // (a deleted program is built, as far as anyone waiting for it goes: asked, the browser reports
    // an error on the console — three's own isReady asks, of a disposed thumbnail's program)
    if (name === DONE && deleted.has(program)) return true;
    if (name !== DONE && hold(program)) throw NOT_READY;
    return param(program, name);
  };
  const draw = gl.renderBufferDirect;
  gl.renderBufferDirect = function (this: THREE.WebGLRenderer, camera, scene, geometry, material, object, group) {
    if (drawing !== undefined) return draw.call(this, camera, scene, geometry, material, object, group);
    // (the shadow pass draws with no scene: the view is the main pass's)
    if (scene && (scene as THREE.Scene).isScene) view = { scene: scene as THREE.Scene, camera };
    const whole = wholeOf(object);
    const pending = whole ? WHOLE.get(whole) : undefined;
    if (whole && pending) {
      for (const p of [...pending]) if (built(p)) pending.delete(p);
      if (pending.size > 0) {
        guard.held++;
        return;
      }
      WHOLE.delete(whole);
    }
    drawing = object ?? null;
    try {
      draw.call(this, camera, scene, geometry, material, object, group);
    } catch (e) {
      if (e !== NOT_READY) throw e;
      guard.held++;
      watch();
      // (the parts of this creature already drawn this frame are taken back on the next)
      if (whole) {
        askAll(whole);
        requestAnimationFrame(wake);
      }
    } finally {
      drawing = undefined;
    }
  };
  return guard;
}

/** How many programs this renderer's draws are waiting for (0 where nothing is guarded). */
export function buildingPrograms(gl: THREE.WebGLRenderer): number {
  return GUARDS.get(gl)?.waiting.size ?? 0;
}

/** How many of this renderer's draws have been held back so far (a count that only grows: compare it
 *  before and after a render to learn whether that render was drawn whole). */
export function heldDraws(gl: THREE.WebGLRenderer): number {
  return GUARDS.get(gl)?.held ?? 0;
}

/** Be told when a program this renderer was waiting for is built (returns the way to stop). */
export function onProgramsBuilt(gl: THREE.WebGLRenderer, fn: () => void): () => void {
  const guard = GUARDS.get(gl);
  if (!guard) return () => undefined;
  guard.wake.add(fn);
  return () => {
    guard.wake.delete(fn);
  };
}

/** Wait until no draw of this renderer is held back for a program; resolves true if it had to wait. */
export function shadersSettled(gl: THREE.WebGLRenderer, timeoutMs = 120000): Promise<boolean> {
  const guard = GUARDS.get(gl);
  if (!guard || guard.waiting.size === 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = () => {
      if (guard.waiting.size > 0) return;
      guard.wake.delete(done);
      clearTimeout(t);
      resolve(true);
    };
    const t = setTimeout(() => {
      guard.wake.delete(done);
      resolve(true);
    }, timeoutMs);
    guard.wake.add(done);
  });
}

/** Put inside any <Canvas> (or offscreen root): its renderer keeps every program it compiles, never
 *  waits for one inside a draw (guardDraws), and draws again when one it was waiting for is built. */
export function KeepPrograms(): null {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  // The guard goes in as this renders, not in an effect: a canvas may draw its first frame before
  // its effects have run, and that frame waited for the creature's program (4 s on a laptop's built-in
  // graphics, measured: the litter's first thumbnail). Installing it twice is a no-op.
  guardDraws(gl);
  useEffect(() => {
    const guard = guardDraws(gl);
    const again = () => invalidate();
    guard?.wake.add(again);
    return () => {
      guard?.wake.delete(again);
    };
  }, [gl, invalidate]);
  useEffect(() => {
    RENDERERS.add(gl);
    if (!hooked) {
      hooked = true;
      addAfterEffect(() => {
        for (const r of RENDERERS) pinPrograms(r);
      });
    }
    return () => {
      RENDERERS.delete(gl);
    };
  }, [gl]);
  return null;
}

/**
 * Put inside a <Canvas> that draws one scene a frame (a stage, the valley, the Studio): told `true`
 * once a frame of it has been drawn whole — no draw held back for a program still building, none
 * waited for — and `false` again whenever one is (a creature swapped for one whose programs are new).
 * What the loading screen waits for: a scene whose shaders are built but that has not yet been drawn
 * with them is not ready to be seen.
 */
export function DrawnWhole({ onChange }: { onChange: (whole: boolean) => void }): null {
  const gl = useThree((s) => s.gl);
  // the held-draw count as this canvas's frame began (-1: no frame of it since the last check)
  const start = useRef(-1);
  const tell = useRef(onChange);
  tell.current = onChange;
  useFrame(() => {
    start.current = heldDraws(gl);
  });
  useEffect(() => {
    let last: boolean | null = null;
    // (after every frame of every canvas: the frame this one began has been drawn by now)
    return addAfterEffect(() => {
      if (start.current < 0) return;
      const whole = heldDraws(gl) === start.current && buildingPrograms(gl) === 0;
      start.current = -1;
      if (whole === last) return;
      last = whole;
      tell.current(whole);
    });
  }, [gl]);
  return null;
}

/**
 * Are these materials' programs all built? Each that is — or that has none left to wait for, its
 * material disposed since — is dropped from the set.
 */
export function programsReady(gl: Pick<THREE.WebGLRenderer, 'properties'>, waiting: Set<THREE.Material>): boolean {
  for (const m of [...waiting]) {
    const program = (gl.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram;
    if (!program || program.isReady()) waiting.delete(m);
  }
  return waiting.size === 0;
}

/** Does the scene hold a material that is not among these (a creature swapped for another since
 *  they were compiled)? */
export function holdsUncompiled(scene: Pick<THREE.Object3D, 'traverse'>, compiled: ReadonlySet<THREE.Material>): boolean {
  let found = false;
  scene.traverse((o) => {
    // (the objects three compiles for, and no others)
    const drawn = o as Partial<Record<'isMesh' | 'isPoints' | 'isLine' | 'isSprite', boolean>>;
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (found || !m || !(drawn.isMesh || drawn.isPoints || drawn.isLine || drawn.isSprite)) return;
    found = Array.isArray(m) ? m.some((x) => !compiled.has(x)) : !compiled.has(m);
  });
  return found;
}

/**
 * Compile every material in the scene before its first visible frame: mount the scene with the
 * canvas's frameloop paused, and this reports `onReady` once three has built them all. Where the
 * browser offers KHR_parallel_shader_compile the programs build on the GPU process's own threads,
 * in parallel, and the page stays responsive (the World's ~35 programs, linked one by one on its first
 * frame, were most of its load); without it three compiles as before and the first frame pays. A
 * timeout guarantees the scene is shown whatever happens (and what is not built by then is left out of
 * the frames until it is: guardDraws).
 *
 * (The wait is three's `compileAsync`, done here: three's own throws if a material is disposed while
 * it waits — a creature swapped for another during the compile — and then never reports at all. Here
 * the programs are pinned as soon as they are asked for, so the swap does not throw the compile away
 * — the creature that replaces it finds them — and whatever the swap brought is compiled and waited
 * for too.)
 */
export function WarmShaders({ onReady, timeoutMs = 6000, patient = false }: { onReady: () => void; timeoutMs?: number; patient?: boolean }): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onReady();
    };
    // (`patient`: where the browser builds programs off the page's thread, wait for them however long
    // they take — the page is free meanwhile, and what would be shown before then is half a scene)
    const offThread = patient && !!(gl.getContext() as WebGL2RenderingContext).getExtension?.('KHR_parallel_shader_compile');
    const t = setTimeout(finish, offThread ? Math.max(timeoutMs, PATIENCE_MS) : timeoutMs);
    let poll: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (done) return;
      try {
        const compiled = new Set<THREE.Material>();
        const waiting = new Set<THREE.Material>();
        const compile = () => {
          for (const m of gl.compile(scene, camera)) {
            compiled.add(m);
            waiting.add(m);
          }
          pinPrograms(gl);
        };
        const check = () => {
          if (done) return;
          if (holdsUncompiled(scene, compiled)) compile();
          if (programsReady(gl, waiting)) finish();
          else poll = setTimeout(check, 10);
        };
        compile();
        check();
      } catch {
        finish();
      }
    };
    // (after this commit has been painted — what is on the page around the canvas, a "Preparing"
    // line, is seen before a compile that holds the page where the browser has only one thread for
    // it — and the scene graph is assembled by then)
    const raf = requestAnimationFrame(() => (poll = setTimeout(start, 0)));
    return () => {
      done = true;
      clearTimeout(t);
      clearTimeout(poll);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  return null;
}
