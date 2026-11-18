/**
 * What draws this browser's WebGL: a graphics card, or the processor.
 *
 * Without a graphics card (none in the machine, a driver the browser refuses, hardware acceleration
 * switched off) the browser still offers WebGL, drawn by a software renderer on the processor — and a
 * furred creature then takes seconds a frame, each of them holding the page. The game asks once, before
 * its first canvas, so it can go without the menu's backdrop and start at the lowest quality instead.
 */

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
