/**
 * An insect's compound eye is a honeycomb of ommatidia: hundreds of tiny lenses, each a glint of its own
 * between dark walls, so the dome reads matte and grainy with a sparkle of points — never one smooth glossy
 * highlight. (A dark brown ball under one broad highlight, its facets the 320 flat faces of an
 * icosahedron, was a chocolate truffle: no facets at the scale an eye is seen at.)
 *
 * The lattice is laid on a sphere's own UVs (a three SphereGeometry: U round the equator, V pole to pole,
 * the poles on ±Y). The eye looks down +Z, which is on the equator, so the dome one sees is where the
 * map is least stretched; the poles lie on its rim, under the cuticle (eyeSeat COMPOUND_DEPTH).
 */
import * as THREE from 'three';

/** facets round the eye's equator: about half of them span the dome that is seen */
export const OMMA_COLS = 44;
/** the shade of the walls between the facets (× the facet's own) */
export const OMMA_WALL = 0.3;
/** a facet's roughness at its centre, and the walls' (× the material's roughness of 1) */
export const OMMA_ROUGH: readonly [number, number] = [0.3, 0.9];
/** the map's size (texels): ~11.6 texels a facet round the equator */
export const OMMA_SIZE: readonly [number, number] = [512, 256];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far a point of the map (u, v in [0, 1)) is inside its facet: 0 on the wall between two facets,
 *  rising to ~1 at a facet's centre (the gap between its nearest and second-nearest lattice point). */
export function facetDepth(u: number, v: number, cols = OMMA_COLS): number {
  // in units of one facet's width at the equator: U spans 2π, V spans π, so V runs half as many widths
  const x = u * cols;
  const y = (v * cols) / 2;
  const rowH = Math.sqrt(3) / 2;
  const r0 = Math.round(y / rowH);
  let d1 = Infinity;
  let d2 = Infinity;
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    const off = (r & 1) * 0.5;
    const c0 = Math.round(x - off);
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      // (a whole number of columns round the equator: the lattice runs on across the seam at U = 0)
      const cx = c + off;
      const d = Math.hypot(x - cx, y - r * rowH);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) d2 = d;
    }
  }
  return Math.min(1, d2 - d1);
}

/** The shade (RGB) and roughness (G) maps' texels, RGBA, row-major from V = 0. */
export function ommatidiaPixels(w = OMMA_SIZE[0], h = OMMA_SIZE[1], cols = OMMA_COLS): { shade: Uint8Array; rough: Uint8Array } {
  const shade = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const f = smooth(0.04, 0.24, facetDepth((i + 0.5) / w, (j + 0.5) / h, cols));
      const s = Math.round(255 * (OMMA_WALL + (1 - OMMA_WALL) * f));
      const g = Math.round(255 * (OMMA_ROUGH[1] + (OMMA_ROUGH[0] - OMMA_ROUGH[1]) * f));
      const k = (j * w + i) * 4;
      shade[k] = shade[k + 1] = shade[k + 2] = s;
      shade[k + 3] = 255;
      rough[k] = rough[k + 1] = rough[k + 2] = g;
      rough[k + 3] = 255;
    }
  }
  return { shade, rough };
}

let maps: { shade: THREE.DataTexture; rough: THREE.DataTexture } | null = null;
/** The compound eye's maps, built once and shared by every eye (never disposed). */
export function ommatidiaMaps(): { shade: THREE.DataTexture; rough: THREE.DataTexture } {
  if (maps) return maps;
  const [w, h] = OMMA_SIZE;
  const px = ommatidiaPixels(w, h);
  const tex = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  maps = { shade: tex(px.shade, true), rough: tex(px.rough, false) };
  return maps;
}
