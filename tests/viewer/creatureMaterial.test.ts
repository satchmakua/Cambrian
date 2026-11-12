import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCreatureMaterial, setFineRelief } from '../../src/viewer/creatureMaterial';
import { PRESETS, qualityOf } from '../../src/ui/settings';
import { defaultGenome, type CoveringType } from '../../src/engine/genome';

/**
 * The extended skin shader can't be GPU-compiled headlessly, but its riskiest failure mode is
 * checkable: a mistyped `.replace` target silently no-ops, leaving a vertex/fragment varying
 * mismatch that black-screens every creature. So run the real onBeforeCompile against three's
 * actual `physical` shader source and assert each injection landed in both stages, with braces
 * still balanced.
 */
function compileShaderStrings(type?: CoveringType) {
  const g = defaultGenome();
  const mat = makeCreatureMaterial(g.palette, type ? { ...g.covering, type } : g.covering, g.seed);
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

  it('a crystal hide is cut facets: flat faces meeting in sharp edges, each mirroring the sky its own way', () => {
    const g = defaultGenome();
    // glassy: polished, under a full clear coat (the plan's own sheen, 0.75 and up), no metal …
    const mat = makeCreatureMaterial(g.palette, { ...g.covering, type: 'crystal', sheen: 0.8 }, g.seed) as THREE.MeshPhysicalMaterial;
    expect(mat.roughness).toBeLessThan(0.2);
    expect(mat.clearcoat).toBe(1);
    expect(mat.clearcoatRoughness).toBeLessThan(0.1);
    expect(mat.metalness).toBe(0);
    mat.dispose();
    // … and never matte, however dull a lineage has bred it: more polished than a plated hide at its wettest
    const dull = makeCreatureMaterial(g.palette, { ...g.covering, type: 'crystal', sheen: 0 }, g.seed) as THREE.MeshPhysicalMaterial;
    const plates = makeCreatureMaterial(g.palette, { ...g.covering, type: 'plates', sheen: 1 }, g.seed) as THREE.MeshPhysicalMaterial;
    expect(dull.clearcoat).toBeGreaterThan(plates.clearcoat);
    expect(dull.roughness).toBeLessThan(plates.roughness);
    dull.dispose();
    plates.dispose();
    const s = compileShaderStrings('crystal');
    const f = s.fragmentShader;
    expect((s.uniforms.uCover as { value: number }).value).toBe(7);
    // the relief: the higher of two cuts of the stone, at two angles and two sizes (see facetsPort below)
    expect(f).toContain('float facets(vec3 q, out float id, out float wall) {');
    expect(f).toContain('vec4 wt = vec4(1.0 - ua, ua - ub, ub - uc, uc);');
    expect(f).toContain('float hA = facets(p * 1.9, idA, wallA);');
    expect(f).toContain('float hB = facets(pr * 2.7 + 11.3, idB, wallB);');
    expect(f).toContain('gHb = max(hA, hB) * 0.11 * w;');
    // (the second cut is the first one turned: a rotation, so its faces are as flat)
    const rows = [[0.36, 0.48, -0.8], [-0.8, 0.6, 0.0], [0.48, 0.64, 0.6]];
    expect(f).toContain('vec3 pr = vec3(dot(p, vec3(0.36, 0.48, -0.8)), dot(p, vec3(-0.8, 0.6, 0.0)), dot(p, vec3(0.48, 0.64, 0.6)));');
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const d = rows[i][0] * rows[j][0] + rows[i][1] * rows[j][1] + rows[i][2] * rows[j][2];
        expect(d).toBeCloseTo(i === j ? 1 : 0, 12);
      }
    }
    // each face its own shade of the one stone, its cut edges a touch lighter; and it glows from within
    expect(f).toContain('if (uCover == 7) skin *= (0.7 + 0.58 * gFacet) * (1.0 + 0.18 * gSeam);');
    expect(f).toMatch(/if \(uCover == 7\) totalEmissiveRadiance \+= uMain \* /);
    // the polish is the faces themselves: the clear coat takes each facet's tilt (three leaves a coat
    // on the smooth body under the relief — a glaze over the stone, the same mirror on every face)
    const iCoat = f.indexOf('#include <clearcoat_normal_fragment_begin>');
    const iTilt = f.indexOf('if (uCover == 7) clearcoatNormal = normal;');
    expect(iCoat).toBeGreaterThan(0);
    expect(iTilt).toBeGreaterThan(iCoat);
    // …after the relief has tilted the normal
    expect(iCoat).toBeGreaterThan(f.indexOf('normal = normalize(abs(det) * normal - uBump * grad);'));
    // and no other covering's coat is touched
    expect(f.match(/clearcoatNormal = normal;/g)!.length).toBe(1);
  });

  it("…and the facets' relief is flat across a face and has no step anywhere", () => {
    // The same arithmetic as the shader's facets() (pinned line by line above): a height that is the
    // flat blend of the four corners of the tetrahedron a point is in.
    const fract = (x: number) => x - Math.floor(x);
    const hash13 = (p: number[]) => {
      let [x, y, z] = p.map((v) => fract(v * 0.1031));
      const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
      x += d; y += d; z += d;
      return fract((x + y) * z);
    };
    const facetsPort = (q: number[]) => {
      const k = (q[0] + q[1] + q[2]) / 3;
      const qs = q.map((v) => v + k);
      const s = qs.map(Math.floor);
      const u = qs.map((v, i) => v - s[i]);
      const e = [u[0] >= u[1] ? 1 : 0, u[1] >= u[2] ? 1 : 0, u[2] >= u[0] ? 1 : 0];
      const i1 = [e[0] * (1 - e[2]), e[1] * (1 - e[0]), e[2] * (1 - e[1])];
      const i2 = [1 - e[2] * (1 - e[0]), 1 - e[0] * (1 - e[1]), 1 - e[1] * (1 - e[2])];
      const ua = u[0] * i1[0] + u[1] * i1[1] + u[2] * i1[2];
      const uc = u[0] * (1 - i2[0]) + u[1] * (1 - i2[1]) + u[2] * (1 - i2[2]);
      const ub = u[0] + u[1] + u[2] - ua - uc;
      const wt = [1 - ua, ua - ub, ub - uc, uc];
      const corner = (o: number[]) => hash13(s.map((v, i) => v + o[i]));
      const h = wt[0] * corner([0, 0, 0]) + wt[1] * corner(i1) + wt[2] * corner(i2) + wt[3] * corner([1, 1, 1]);
      return { h, wt, cell: `${s}|${i1}|${i2}` };
    };
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const at = () => [rnd() * 20 - 10, rnd() * 20 - 10, rnd() * 20 - 10];
    let steepest = 0;
    let crossed = 0;
    let flat = 0;
    for (let n = 0; n < 40000; n++) {
      const a = at();
      const d = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
      const len = Math.hypot(d[0], d[1], d[2]);
      const fa = facetsPort(a);
      // the weights are a point's share of each corner: none negative, together one
      for (const w of fa.wt) expect(w).toBeGreaterThanOrEqual(0);
      expect(fa.wt[0] + fa.wt[1] + fa.wt[2] + fa.wt[3]).toBeCloseTo(1, 12);
      // no step: a tiny move changes the height by no more than a slope's worth, wall or no wall
      const eps = 1e-4;
      const fb = facetsPort(a.map((v, i) => v + (d[i] / len) * eps));
      if (fb.cell !== fa.cell) crossed++;
      steepest = Math.max(steepest, Math.abs(fb.h - fa.h) / eps);
      // flat: three points in a line inside one tetrahedron are in a line in height too
      const m = facetsPort(a.map((v, i) => v + d[i] * 0.02));
      const b = facetsPort(a.map((v, i) => v + d[i] * 0.04));
      if (m.cell === fa.cell && b.cell === fa.cell) {
        flat++;
        expect(Math.abs(fa.h - 2 * m.h + b.h)).toBeLessThan(1e-12);
      }
    }
    expect(crossed, 'some of the tiny moves crossed a wall').toBeGreaterThan(10);
    expect(flat).toBeGreaterThan(30000);
    expect(steepest).toBeLessThan(2.5); // (a step would read as thousands here)
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
