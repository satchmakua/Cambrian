/**
 * What draws this browser's WebGL: a graphics card, or the processor.
 *
 * Without a graphics card (none in the machine, a driver the browser refuses, hardware acceleration
 * switched off) the browser still offers WebGL, drawn by a software renderer on the processor — and a
 * furred creature then takes seconds a frame, each of them holding the page. The game asks once, before
 * its first canvas, so it can go without the menu's backdrop and start at the lowest quality instead.
 *
 * Asking makes a WebGL context, which can itself be slow — so it is whatever is about to mount a
 * canvas that asks (the menu, after its first paint; the game's screens, when their code arrives),
 * never the page's start-up: the menu's buttons do not wait for it. In safe mode nothing is asked.
 */
import { SAFE, useSettings } from './settings';

export interface GpuInfo {
  /** the renderer's own name ('' when it cannot be read) */
  renderer: string;
  /** is there WebGL at all */
  webgl: boolean;
  /** drawn by the processor — or not drawn at all: either way, no 3D that the page has to wait for */
  software: boolean;
}

/** Is this renderer's name a software one? (Chrome's SwiftShader, Mesa's llvmpipe and softpipe,
 *  Windows' Basic Render Driver, and anything that says so itself.) */
export function isSoftwareRenderer(name: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

let cached: GpuInfo | null = null;

/** Asked once, of a throwaway 1×1 context that is given straight back (about 10 ms), then remembered. */
export function gpuInfo(): GpuInfo {
  if (cached) return cached;
  let renderer = '';
  let webgl = false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      webgl = true;
      // (the unmasked name where the browser gives it; else the masked one, which still names a
      // software renderer in the browsers that have one)
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? '');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no document, or WebGL refused: counted as software */
  }
  cached = { renderer, webgl, software: !webgl || isSoftwareRenderer(renderer) };
  return cached;
}

/** Is 3D to be spared on this visit: safe mode (WebGL is not even asked), or a browser that draws in
 *  software? */
export function noGpu(): boolean {
  return SAFE || gpuInfo().software;
}

/**
 * Before a first canvas, and after the options are reset: where the browser draws without a graphics
 * card the game goes to the Low quality (if the player lets it adjust: see settings). Lowering the
 * options under a canvas that is already up would compile every shader a second time. Returns `noGpu()`.
 */
export function settleGraphics(): boolean {
  if (SAFE) return true;
  const { software } = gpuInfo();
  if (software) useSettings.getState().autoLower('software');
  return software;
}
