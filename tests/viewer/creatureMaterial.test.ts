import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeCreatureMaterial, setFineRelief, CUT_COAT, CUT_COAT_ROUGH } from '../../src/viewer/creatureMaterial';
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

describe('shaggy plumage', () => {
  it("a flightless bird's coat is loose plumes along the lay: no feather edges — and its pile is drawn", () => {
    // (scalloped like a flier's contour feathers, an ostrich's neck, body and thighs were one tight
    // fish-scale pattern: a pinecone)
    const g = defaultGenome();
    const mat = makeCreatureMaterial(g.palette, { ...g.covering, type: 'feathers' }, g.seed, null, null, null, 0, null, false, true);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    (mat.onBeforeCompile as (s: typeof shader) => void)(shader);
    mat.dispose();
    expect(shader.uniforms.uShag.value).toBe(1);
    // the plumes return before the scallops' edge relief is applied
    const frag = shader.fragmentShader;
    const shag = frag.indexOf('if (uShag > 0.5)');
    expect(shag).toBeGreaterThan(0);
    expect(frag.slice(shag, shag + 800)).toContain('return');
    // …and a flier's stays scalloped
    const flier = makeCreatureMaterial(g.palette, { ...g.covering, type: 'feathers' }, g.seed);
    const s2 = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    (flier.onBeforeCompile as (s: typeof s2) => void)(s2);
    flier.dispose();
    expect(s2.uniforms.uShag.value).toBe(0);
  });

  it("a flightless bird's head and the top of its neck wear short down in the coat's tone, not plumes", () => {
    // (plumed to the bill, an ostrich's small head was a ball of fluff — a kiwi's; and its short down,
    // only its shaded roots left, peppered the neck with dark specks)
    const g = defaultGenome();
    const head = { a: [0, 0, 1] as [number, number, number], b: [0, 0, 1.4] as [number, number, number], r: 0.2 };
    const shell = { h: 0.5, len: 0.1, density: 30, eyes: [] };
    const mat = makeCreatureMaterial(g.palette, { ...g.covering, type: 'feathers' }, g.seed, null, shell, null, 0, head, false, true);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    (mat.onBeforeCompile as (s: typeof shader) => void)(shader);
    mat.dispose();
    const f = shader.fragmentShader;
    expect(shader.uniforms.uShag.value).toBe(1);
    expect((shader.uniforms.uHeadA.value as THREE.Vector4).w).toBeCloseTo(0.2, 9);
    // the strands shorten near the head's axis (the head is the shaggy gate's own), before the pile is cut
    const iDown = f.indexOf('sLen *= mix(1.0, SHAG_HEAD_DOWN, down);');
    const iGate = f.indexOf('if (uShag > 0.5 && uHeadA.w > 0.0)');
    const iCut = f.indexOf('float u = uShellH / sLen;');
    expect(iGate).toBeGreaterThan(0);
    expect(iDown).toBeGreaterThan(iGate);
    expect(iCut).toBeGreaterThan(iDown);
    expect(f).toMatch(/const float SHAG_HEAD_DOWN = 0\.(1|2|3)\d*;/);
    // …and the down keeps the coat's tone
    expect(f).toContain('diffuseColor.rgb *= mix(shade, 1.0, max(smoothstep(0.0, 0.55, tone), down));');
    expect(braceBalance(f)).toBe(0);
  });
});

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
    // each face its own shade of the one stone, its cut edges a touch lighter; and it glows from within.
    // A skin already cut into faces (facets.ts) only nudges each face's shade — its faces take the light
    // by their own tilts — and lights its edges brighter …
    expect(f).toContain('if (uCover == 7) skin *= (uCut > 0.5 ? 0.9 + 0.2 * gFacet : 0.7 + 0.58 * gFacet) * (1.0 + (uCut > 0.5 ? 0.25 : 0.18) * gSeam);');
    // … and has no countershading: by its flat faces' normals whole faces snapped between the belly's,
    // the flank's and the back's tones (a camouflage of pale and dark patches)
    expect(f).toContain('float up = uCut > 0.5 ? 0.5 : clamp(vWNrm.y * 0.5 + 0.5, 0.0, 1.0);');
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

  it('plumage and scales are overlapping scallops laid along the body, not a crazing of polygons', () => {
    // (a cell per feather with straight borders read as cobbles or a turtle's scutes on every bird,
    // and as rough skin on every fish)
    const s = compileShaderStrings('feathers');
    const f = s.fragmentShader;
    expect(f).toContain('float scallops(vec3 q, vec3 lay, vec3 nrm, float fw, out float shaft) {');
    expect(f).toContain('float lay = mix(0.66, scallops(p * 13.0, gLay, gNb, gFw * 13.0, shaft), aaW(13.0));'); // feathers
    expect(f).toContain('float lay = mix(0.66, scallops(p * 17.0, gLay, gNb, gFw * 17.0, mid), aaW(17.0));'); // scales
    // the lay: toward the tail and a little down, flat on the skin — from the body's REST normal, which
    // the vertex stage hands down (the world normal turns with the animal; the pattern must not)
    expect(s.vertexShader).toContain('varying vec3 vBNrm;');
    expect(s.vertexShader).toContain('vBNrm = objectNormal;');
    expect(f).toContain('varying vec3 vBNrm;');
    const iLay = f.indexOf('gLay = t / max(length(t), 1e-3);');
    expect(f).toContain('float fore = max(gNb.z, 0.0);');
    expect(f).toContain('vec3 flow = vec3(0.0, -0.45 + 1.2 * fore * fore, -1.0);');
    // (the lay is a field with no blind spot on the skin that faces forward: the flow there is never
    // along the normal, so its projection on the skin never vanishes)
    for (const [y, z] of [[0, 1], [0.41, 0.91], [0.7, 0.7], [-0.6, 0.8], [1, 0]]) {
      const l = Math.hypot(y, z);
      const n = [0, y / l, z / l];
      const fore = Math.max(n[2], 0);
      const flow = [0, -0.45 + 1.2 * fore * fore, -1];
      const d = flow[1] * n[1] + flow[2] * n[2];
      const t = [0, flow[1] - n[1] * d, flow[2] - n[2] * d];
      expect(Math.hypot(t[1], t[2]), `normal (0, ${y}, ${z})`).toBeGreaterThan(0.3);
    }
    expect(f).toContain('vec3 t = flow - gNb * dot(flow, gNb);');
    expect(iLay).toBeGreaterThan(0);
    // … worked out before the relief is first read
    expect(iLay).toBeLessThan(f.indexOf('surfaceHeight(bp + dPx, uCover);'));

    // The same arithmetic as the shader's scallops() (its loop pinned here line by line):
    expect(f).toContain('vec3 qs = vec3(q.x + 0.5 * q.z, q.y + 0.5 * q.z, q.z);');
    expect(f).toContain('vec3 ds = fp - g - 0.5 - (hash33(ip + g) - 0.5) * 0.16;');
    expect(f).toContain('vec3 d = vec3(ds.x - 0.5 * ds.z, ds.y - 0.5 * ds.z, ds.z);');
    expect(f).toContain('float ell = sqrt(max(dot(d, d) - along * along * 0.2439, 0.0));');
    expect(f).toContain('float h = (0.5 + 0.51 * along) * (1.0 - smoothstep(0.85 - soft, 0.85, ell));');
    const fract = (x: number) => x - Math.floor(x);
    const hash33 = (p: number[]) =>
      [
        p[0] * 127.1 + p[1] * 311.7 + p[2] * 74.7,
        p[0] * 269.5 + p[1] * 183.3 + p[2] * 246.1,
        p[0] * 113.5 + p[1] * 271.9 + p[2] * 124.6,
      ].map((v) => fract(Math.sin(v) * 43758.5453123));
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const scallops = (q: number[], lay: number[]) => {
      const soft = 0.1;
      const qs = [q[0] + 0.5 * q[2], q[1] + 0.5 * q[2], q[2]];
      const ip = qs.map(Math.floor);
      const fp = qs.map((v, i) => v - ip[i]);
      let top = 0;
      for (let k = -1; k <= 1; k++) {
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const g = [i, j, k];
            const jit = hash33(ip.map((v, a) => v + g[a]));
            const ds = fp.map((v, a) => v - g[a] - 0.5 - (jit[a] - 0.5) * 0.16);
            const d = [ds[0] - 0.5 * ds[2], ds[1] - 0.5 * ds[2], ds[2]];
            const along = d[0] * lay[0] + d[1] * lay[1] + d[2] * lay[2];
            const ell = Math.sqrt(Math.max(d[0] * d[0] + d[1] * d[1] + d[2] * d[2] - along * along * 0.2439, 0));
            top = Math.max(top, (0.5 + 0.51 * along) * (1 - smooth(0.85 - soft, 0.85, ell)));
          }
        }
      }
      return Math.min(1, Math.max(0, top));
    };
    let seed = 4242;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let barest = 1;
    let steepest = 0;
    let ahead = 0;
    let behind = 0;
    let tips = 0;
    for (let n = 0; n < 12000; n++) {
      const q = [rnd() * 30 - 15, rnd() * 30 - 15, rnd() * 30 - 15];
      // a skin facing any way, and the lay on it
      const nrm = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5];
      const nl = Math.hypot(nrm[0], nrm[1], nrm[2]);
      const nb = nrm.map((v) => v / nl);
      const flow = [0, -0.45, -1];
      const dot = flow[0] * nb[0] + flow[1] * nb[1] + flow[2] * nb[2];
      const t = flow.map((v, i) => v - nb[i] * dot);
      const tl = Math.hypot(t[0], t[1], t[2]);
      if (tl < 0.2) continue; // (the two whorls, where the skin faces along the flow)
      const lay = t.map((v) => v / tl);
      const h = scallops(q, lay);
      // no bare patch: some scallop covers every point, well up its ramp
      barest = Math.min(barest, h);
      // no step: the round edge is a slope (the bump would draw a step as a hard line)
      const eps = 1e-3;
      steepest = Math.max(steepest, Math.abs(scallops(q.map((v, i) => v + lay[i] * eps), lay) - h) / eps);
      // imbricated: just past a tip the coat falls to the scallop it lies on; just behind the tip
      // it is the same scallop, a little lower on its ramp
      if (h > 0.9) {
        tips++;
        ahead += scallops(q.map((v, i) => v + lay[i] * 0.3), lay);
        behind += scallops(q.map((v, i) => v - lay[i] * 0.3), lay);
      }
    }
    expect(barest).toBeGreaterThan(0.2); // (0.27 here)
    expect(steepest).toBeLessThan(16); // (12 here: the edge's own slope; a step would read as hundreds)
    expect(tips).toBeGreaterThan(100);
    expect(behind / tips).toBeGreaterThan(0.7); // (0.76)
    expect(ahead / tips).toBeLessThan(behind / tips - 0.12); // (0.56)
  });

  it('a spot is one solid blotch, fading down the legs, and an eye-spot is whole or absent', () => {
    // (rings were drawn at radii of their own through the body, and the skin cut each wherever it
    // fell: open rings, doubled rings, rings with no middle — the letters C, O and 8 on every
    // spotted animal; then a paler middle in every blotch kept a fawn's dapples rings; and an
    // octopus's eye-spots were mostly empty hoops)
    const f = compileShaderStrings().fragmentShader;
    const smooth = (a: number, b: number, x: number) => {
      // (GLSL smoothstep, either way round)
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    expect(f).toContain('float v = F.x + (n - 0.5) * 0.16;');
    expect(f).toContain('return mix(0.12, 1.0 - smoothstep(0.24 - c, 0.32 + c, v), 1.0 - smoothstep(0.25, 0.6, c));');
    for (const c of [0, 0.015, 0.03]) {
      const mark = (v: number) => 1 - smooth(0.24 - c, 0.32 + c, v);
      // from the blotch's centre outward: solid, then falling once to the coat
      const ms = Array.from({ length: 251 }, (_, i) => mark(i * 0.002));
      expect(ms[0], `footprint ${c}: solid`).toBe(1);
      expect(ms[ms.length - 1], `footprint ${c}: the coat`).toBe(0);
      for (let i = 1; i < ms.length; i++) expect(ms[i], `footprint ${c}`).toBeLessThanOrEqual(ms[i - 1] + 1e-12);
    }
    expect(f).toContain('if (uPType == 3) pat *= 1.0 - 0.75 * vLeg;');
    // eye-spots: measured in the skin, from each cell's centre laid flat on it
    expect(f).toContain('float dn = dot(d, gNb);');
    expect(f).toContain('float rho = sqrt(max(dot(d, d) - dn * dn, 0.0));');
    expect(f).toContain('float pupil = 1.0 - smoothstep(0.1 - c, 0.15 + c, rho);');
    expect(f).toContain('float ring = smoothstep(0.06 + c, 0.0, abs(rho - 0.32));');
    expect(f).toContain('mark = max(mark, (1.0 - smoothstep(0.22, 0.42, abs(dn))) * max(pupil, ring * 0.9));');
    const figure = (rho: number, dn: number) => (1 - smooth(0.22, 0.42, Math.abs(dn))) * Math.max(1 - smooth(0.1, 0.15, rho), 0.9 * smooth(0.06, 0, Math.abs(rho - 0.32)));
    for (const dn of [0, 0.1, 0.2]) {
      // however deep its centre lies under the skin, the same whole figure: pupil, gap, ring
      expect(figure(0, dn), `depth ${dn}`).toBe(1);
      expect(figure(0.21, dn), `depth ${dn}`).toBeLessThan(0.02);
      expect(figure(0.32, dn), `depth ${dn}`).toBeCloseTo(0.9, 6);
      expect(figure(0.45, dn), `depth ${dn}`).toBe(0);
    }
    // …and one too deep is gone, pupil and ring together (never a ring left alone)
    expect(figure(0, 0.42)).toBe(0);
    expect(figure(0.32, 0.42)).toBe(0);
    for (let dn = 0.22; dn <= 0.42; dn += 0.02) expect(figure(0.32, dn) / Math.max(figure(0, dn), 1e-9)).toBeLessThanOrEqual(0.9 + 1e-9);
    // (the normal the figure is laid on is set before the pattern is read)
    expect(f.indexOf('gNb = normalize(vBNrm);')).toBeLessThan(f.indexOf('float pat = patternField(bpP, uPType, uPScale);'));
    expect(f.indexOf('gNb = normalize(vBNrm);')).toBeGreaterThan(0);
  });

  it('thinning fur takes the coat\'s own tone: no scatter of dark specks on an animal seen whole', () => {
    // (the last sparse strands kept the shadow of a dense pile's roots: a bear seen whole wore pepper)
    const f = compileShaderStrings().fragmentShader;
    const iFar = f.indexOf('float far = smoothstep(0.28, 1.15, gFw * uShellDen);');
    const iShade = f.indexOf('diffuseColor.rgb *= mix(shade, 1.0, max(smoothstep(0.0, 0.55, tone), down));');
    expect(iFar).toBeGreaterThan(0);
    expect(iShade).toBeGreaterThan(iFar);
    // …the tone the fade takes is the fade's own, read before the outline keeps its strands: with their
    // root shadow back, the fringe round a muzzle was a grainy dark stubble
    const iTone = f.indexOf('float tone = far;');
    const iKeep = f.indexOf('far *= 1.0 - 0.85 * smoothstep(0.6, 0.92, graze)');
    expect(iTone).toBeGreaterThan(iFar);
    expect(iKeep).toBeGreaterThan(iTone);
    // (the pile's own shading, where it is dense, is as it was)
    expect(f).toContain('float shade = mix(0.62, 1.12, uShellH) * (0.93 + 0.14 * hash13(cid + 9.0));');
  });

  it("a leg's up-facing surfaces (a paw's top) wear the back's tone, its sides the flank's, never the belly's", () => {
    // (all leg in the flank's tone, a paw's flat top lit by the sky was the brightest thing on a bear:
    // a pale slipper under a dark animal)
    const f = compileShaderStrings('fur').fragmentShader;
    const iUp = f.indexOf('float up = ');
    const iLeg = f.indexOf('up = mix(up, max(up, 0.5), vLeg);');
    const iBack = f.indexOf('skin = mix(skin, uBack, smoothstep(0.64, 0.96, up));');
    expect(iUp).toBeGreaterThan(0);
    expect(iLeg).toBeGreaterThan(iUp);
    expect(iBack).toBeGreaterThan(iLeg);
    // the lines between read the leg's tone from `up` alone: nothing else sets it
    expect(f.slice(iLeg + 1, iBack)).not.toMatch(/\bup\s*=/);
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

  it("a body's markings mirror across its midline, and so does the normal an eye-spot is laid on", () => {
    // (sampled where they lay, the noise under a theropod's two arms differed: one magenta, one mint)
    const f = compileShaderStrings().fragmentShader;
    expect(f).toContain('vec3 bpP = vec3(abs(vBodyPos.x), vBodyPos.y, vBodyPos.z) + uOff;');
    const i = f.indexOf('float pat = patternField(bpP, uPType, uPScale);');
    expect(i).toBeGreaterThan(0);
    // the normal is mirrored just before the pattern reads it, and restored just after
    expect(f.lastIndexOf('gNb.x *= sx;', i)).toBeGreaterThan(f.indexOf('float sx = vBodyPos.x < 0.0 ? -1.0 : 1.0;'));
    expect(f.indexOf('gNb.x *= sx;', i)).toBeGreaterThan(i);
  });

  it('a cut stone takes a glassy coat — its faces are exact planes, each mirroring its own part of the sky', () => {
    // (cut in place, the faces' borders were ragged, and a satin coat of 0.35 at roughness 0.3 hid them: a
    // stone with no glints, flaky paper)
    const g = defaultGenome();
    const cut = makeCreatureMaterial(g.palette, { ...g.covering, type: 'crystal', sheen: 1 }, g.seed, null, null, null, 0, null, true) as THREE.MeshPhysicalMaterial;
    expect(CUT_COAT).toBeGreaterThanOrEqual(0.7);
    expect(CUT_COAT_ROUGH).toBeLessThanOrEqual(0.12);
    expect(cut.clearcoat).toBeLessThanOrEqual(CUT_COAT);
    expect(cut.clearcoatRoughness).toBeGreaterThanOrEqual(CUT_COAT_ROUGH);
    cut.dispose();
    // a face's own shade only where the skin IS a face (the stone): on the GPU each triangle's normal is
    // flat, so the uncut legs and face took a shade per triangle — a mosaic of flakes
    const f = compileShaderStrings('crystal').fragmentShader;
    expect(f).toContain('planar * step(0.99, vCut));');
  });

  it("a reticulate net is broad rims round big patches — not hairline cracks, crackle glaze", () => {
    // (hairline cracks round small cells were crackle glaze, cracked mud, a leaf's veins: never a python)
    const f = compileShaderStrings('scales').fragmentShader;
    const rim = Number(/const float RETIC_RIM = ([0-9.]+);/.exec(f)?.[1]);
    const cell = Number(/const float RETIC_CELL = ([0-9.]+);/.exec(f)?.[1]);
    expect(rim).toBeGreaterThanOrEqual(0.05);
    expect(cell).toBeLessThan(0.45);
    expect(f).not.toContain('smoothstep(0.0, 0.05 + 1.5 * c, F.y - F.x)');
  });
});
