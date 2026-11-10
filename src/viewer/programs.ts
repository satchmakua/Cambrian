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
 * Compile every material in the scene before its first visible frame: mount the scene with the
 * canvas's frameloop paused, and this reports `onReady` once three's `compileAsync` has them all. Where
 * the browser offers KHR_parallel_shader_compile the programs build on the GPU process's own threads,
 * in parallel, and the page stays responsive (the World's ~35 programs, linked one by one on its first
 * frame, were most of its load); without it three compiles as before and the first frame pays. A
 * timeout guarantees the scene is shown whatever happens.
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
    // (after this commit and the browser's next frame: the scene graph is assembled)
    const raf = requestAnimationFrame(() => {
      try {
        gl.compileAsync(scene, camera).then(finish, finish);
      } catch {
        finish();
      }
    });
    return () => {
      done = true;
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  return null;
}
