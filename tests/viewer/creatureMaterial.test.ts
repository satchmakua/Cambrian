import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCreatureMaterial, setFineRelief } from '../../src/viewer/creatureMaterial';
import { PRESETS, qualityOf } from '../../src/ui/settings';
import { defaultGenome } from '../../src/engine/genome';

/**
 * The extended skin shader can't be GPU-compiled headlessly, but its riskiest failure mode is
 * checkable: a mistyped `.replace` target silently no-ops, leaving a vertex/fragment varying
 * mismatch that black-screens every creature. So run the real onBeforeCompile against three's
 * actual `physical` shader source and assert each injection landed in both stages, with braces
 * still balanced.
 */
function compileShaderStrings() {
  const g = defaultGenome();
  const mat = makeCreatureMaterial(g.palette, g.covering, g.seed);
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  // onBeforeCompile is our own closure — safe to invoke with just the shader object
  (mat.onBeforeCompile as (s: typeof shader) => void)(shader);
  mat.dispose();
  return shader;
}

function braceBalance(src: string): number {
  let n = 0;
  for (const ch of src) {
    if (ch === '{') n++;
    else if (ch === '}') n--;
  }
  return n;
}

describe('creature material shader injection', () => {
  it('every injection point matched — body-space texture + mouth flesh exist in both stages', () => {
    const s = compileShaderStrings();
    // vertex: attributes declared once, varyings assigned
    expect(s.vertexShader).toContain('attribute vec3 aBodyPos;');
    expect(s.vertexShader).toContain('attribute float aFlesh;');
    expect(s.vertexShader).toContain('vFlesh = aFlesh;');
    expect(s.vertexShader).toContain('vBodyPos = aBodyPos;');
    // fragment: the varyings are declared AND consumed
    expect(s.fragmentShader).toContain('varying float vFlesh;');
    expect(s.fragmentShader).toContain('varying vec3 vBodyPos;');
    expect(s.fragmentShader).toContain('patternField');
    expect(s.fragmentShader.includes('smoothstep(0.1, 0.75, vFlesh)')).toBe(true); // gum mix landed
    expect(s.fragmentShader.includes('roughnessFactor = mix(roughnessFactor, 0.14')).toBe(true);
    // rim damping inside the mouth landed
    expect(s.fragmentShader.includes('1.0 - 0.9 * smoothstep(0.1, 0.6, vFlesh)')).toBe(true);
  });

  it('the injected GLSL keeps braces balanced in both stages', () => {
    const s = compileShaderStrings();
    expect(braceBalance(s.vertexShader)).toBe(0);
    expect(braceBalance(s.fragmentShader)).toBe(0);
  });

  it('declares every uniform the injected code references', () => {
    const s = compileShaderStrings();
    for (const u of ['uMain', 'uBack', 'uBelly', 'uPattern', 'uPattern2', 'uRim', 'uPType', 'uCover', 'uPScale', 'uContrast', 'uSheen', 'uBump', 'uOff']) {
      expect(s.uniforms[u]).toBeDefined();
      expect(s.fragmentShader).toContain(u);
    }
  });

  it('is a physical material whose bump reads the PHYSICAL relief height, band-limited', () => {
    const g = defaultGenome();
    const mat = makeCreatureMaterial(g.palette, { ...g.covering, type: 'fur' }, g.seed);
    expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(mat.sheen).toBeGreaterThan(0.5); // fur gets the velvet lobe
    mat.dispose();
    const s = compileShaderStrings();
    // baked crease occlusion flows vertex → fragment
    expect(s.vertexShader).toContain('attribute float aAO;');
    expect(s.fragmentShader).toContain('mix(0.42, 1.0, vAO)');
    // the bump perturbs by gHb (a height in body units), never the normalized 0..1 relief, which
    // saturated every normal into per-pixel noise
    expect(s.fragmentShader).toContain('float h = gHb * uBump + hm;');
    // the pixel footprint is measured before any AA'd noise is evaluated
    const iFw = s.fragmentShader.indexOf('gFw = max(length(dPx), length(dPy))');
    const iH = s.fragmentShader.indexOf('gH = surfaceHeight(bp, uCover);');
    expect(iFw).toBeGreaterThan(0);
    expect(iH).toBeGreaterThan(iFw);
  });

  it("the relief's slope is measured at every pixel, not once per 2x2 block of them", () => {
    // (the GPU's derivative of the height is one value per 2x2 pixels: a scale a few pixels across,
    // the edge of a plate, broke into a mosaic of little squares and staircases — a crocodile's hide
    // and a turtle's shell read as a low-resolution texture)
    const s = compileShaderStrings();
    const f = s.fragmentShader;
    // the height one pixel across and one down, each evaluated at this pixel, before the height here
    const iX = f.indexOf('surfaceHeight(bp + dPx, uCover);');
    const iY = f.indexOf('surfaceHeight(bp + dPy, uCover);');
    const iC = f.indexOf('gH = surfaceHeight(bp, uCover);');
    expect(iX).toBeGreaterThan(0);
    expect(iY).toBeGreaterThan(iX);
    expect(iC).toBeGreaterThan(iY);
    expect(f).toContain('gDhx = hX - gHb;');
    expect(f).toContain('gDhy = hY - gHb;');
    // …and the bump reads those differences (the smooth musculature alone keeps the cheap derivative)
    expect(f).toContain('float dhx = mix(dFdx(h), gDhx * uBump + dFdx(hm), gFine);');
    expect(f).toContain('float dhy = mix(dFdy(h), gDhy * uBump + dFdy(hm), gFine);');
    // not on the fur's shells (a dozen passes, their strands hide it), and only where the option is on
    expect(f).toContain('if (uShellH < 0.0 && uFine > 0.5) {');
    const fine = s.uniforms.uFine as { value: number };
    setFineRelief(false);
    expect(fine.value).toBe(0); // one shared switch: every coat already drawn follows it
    setFineRelief(true);
    expect(fine.value).toBe(1);
    // on at Medium and High, off at Low (three evaluations of the relief a pixel instead of one)
    expect(qualityOf(PRESETS.high).fineRelief).toBe(true);
    expect(qualityOf(PRESETS.medium).fineRelief).toBe(true);
    expect(qualityOf(PRESETS.low).fineRelief).toBe(false);
  });

  it('thinning fur takes the coat\'s own tone: no scatter of dark specks on an animal seen whole', () => {
    // (the last sparse strands kept the shadow of a dense pile's roots: a bear seen whole wore pepper)
    const f = compileShaderStrings().fragmentShader;
    const iFar = f.indexOf('float far = smoothstep(0.28, 1.15, gFw * uShellDen);');
    const iShade = f.indexOf('diffuseColor.rgb *= mix(shade, 1.0, smoothstep(0.0, 0.55, far));');
    expect(iFar).toBeGreaterThan(0);
    expect(iShade).toBeGreaterThan(iFar);
    // (the pile's own shading, where it is dense, is as it was)
    expect(f).toContain('float shade = mix(0.62, 1.12, uShellH) * (0.93 + 0.14 * hash13(cid + 9.0));');
  });

  it('wears the palette as sRGB: a coat is its own colour, with a belly of its own hue', () => {
    // read as LINEAR HSL a mid lightness rendered as a pale pastel, and the belly was lerped toward
    // a fixed grey that outweighed a brown coat ~4:1 — every pelt came out the same chalky greige
    const hsl = { h: 0, s: 0, l: 0 };
    const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
    for (const pal of [
      { hueA: 0.08, hueB: 0.07, sat: 0.55, light: 0.5 }, // a lion's tawny
      { hueA: 0.3, hueB: 0.12, sat: 0.6, light: 0.42 }, // a lizard's green
      { hueA: 0.6, hueB: 0.62, sat: 0.4, light: 0.35 }, // a slate-blue fish
    ]) {
      const g = defaultGenome();
      const mat = makeCreatureMaterial(pal, { ...g.covering, type: 'fur' }, g.seed);
      const shader = { uniforms: {} as Record<string, { value: THREE.Color }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
      (mat.onBeforeCompile as (s: typeof shader) => void)(shader);
      mat.dispose();
      const main = shader.uniforms.uMain.value.getHSL({ ...hsl }, THREE.SRGBColorSpace);
      const belly = shader.uniforms.uBelly.value.getHSL({ ...hsl }, THREE.SRGBColorSpace);
      expect(main.l).toBeCloseTo(0.18 + pal.light * 0.72, 2);
      expect(hueGap(main.h, pal.hueA)).toBeLessThan(0.005);
      expect(hueGap(belly.h, pal.hueA)).toBeLessThan(0.015);
      expect(belly.l).toBeGreaterThan(main.l);
      expect(belly.s).toBeGreaterThan(main.s * 0.5);
    }
  });
});
