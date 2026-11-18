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
import { useEffect } from 'react';
import { addAfterEffect, useThree } from '@react-three/fiber';
import type * as THREE from 'three';

interface ProgramLike {
  usedTimes: number;
}

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

/** Put inside any <Canvas> (or offscreen root): its renderer keeps every program it compiles. */
export function KeepPrograms(): null {
  const gl = useThree((s) => s.gl);
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
 * timeout guarantees the scene is shown whatever happens.
 *
 * (The wait is three's `compileAsync`, done here: three's own throws if a material is disposed while
 * it waits — a creature swapped for another during the compile — and then never reports at all. Here
 * the programs are pinned as soon as they are asked for, so the swap does not throw the compile away
 * — the creature that replaces it finds them — and whatever the swap brought is compiled and waited
 * for too.)
 */
export function WarmShaders({ onReady, timeoutMs = 6000 }: { onReady: () => void; timeoutMs?: number }): null {
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
    const t = setTimeout(finish, timeoutMs);
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
