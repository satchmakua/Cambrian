import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCreatureMaterial } from '../../src/viewer/creatureMaterial';
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
    for (const u of ['uBack', 'uBelly', 'uPattern', 'uPattern2', 'uRim', 'uPType', 'uCover', 'uPScale', 'uContrast', 'uSheen', 'uBump', 'uOff']) {
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
    expect(s.fragmentShader).toContain('float h = (gHb + gM * 0.02) * uBump;');
    // the pixel footprint is measured before any AA'd noise is evaluated
    const iFw = s.fragmentShader.indexOf('gFw = max(length(dFdx(vBodyPos))');
    const iH = s.fragmentShader.indexOf('gH = surfaceHeight(bp, uCover);');
    expect(iFw).toBeGreaterThan(0);
    expect(iH).toBeGreaterThan(iFw);
  });
});
