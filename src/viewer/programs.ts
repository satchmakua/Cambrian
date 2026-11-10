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
