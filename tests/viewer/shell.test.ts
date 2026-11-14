import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import { buildShellGeometry, shellScutes, SHELL_SCUTES } from '../../src/viewer/smoothSkin';
import { makeCreatureMaterial, MAX_SCUTES } from '../../src/viewer/creatureMaterial';

/** the shell mesh's nearest vertex to a point */
function nearest(g: THREE.BufferGeometry, x: number, y: number, z: number): number {
  const pos = g.getAttribute('position');
  let best = Infinity;
  for (let i = 0; i < pos.count; i++) best = Math.min(best, Math.hypot(pos.getX(i) - x, pos.getY(i) - y, pos.getZ(i) - z));
  return best;
}

describe("a tortoise's shell", () => {
  it('is laid out in rows of scutes: five down its midline, four either side, a ring round its rim', () => {
    // (seamed by a random net of cells, a tortoise's shell was crazy paving)
    const total = SHELL_SCUTES.vertebral + 2 * SHELL_SCUTES.costal + SHELL_SCUTES.marginal;
    expect(total).toBeLessThanOrEqual(MAX_SCUTES);
    for (let seed = 1; seed <= 8; seed++) {
      const p = grow(genomeOfMorphotype(seed, 'chelonian'));
      const c = shellScutes(p)!;
      expect(c, `#${seed}`).not.toBeNull();
      expect(c.length / 3, `#${seed}`).toBe(total);
      const at = (i: number) => [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]];
      const g = buildShellGeometry(p, 'low')!;
      g.computeBoundingBox();
      const box = g.boundingBox!;
      const cell = (box.max.x - box.min.x) / 30;
      // the vertebrals on the midline, front to back along it, on the shell's crown
      const V = Array.from({ length: SHELL_SCUTES.vertebral }, (_, i) => at(i));
      for (let i = 0; i < V.length; i++) {
        expect(V[i][0], `#${seed} vertebral ${i} on the midline`).toBe(0);
        if (i > 0) expect(V[i][2], `#${seed} vertebrals in a row`).toBeGreaterThan(V[i - 1][2]);
        expect(nearest(g, V[i][0], V[i][1], V[i][2]), `#${seed} vertebral ${i} on the shell`).toBeLessThan(2 * cell);
      }
      // the costals in mirrored pairs either side, between the vertebrals, on the shell
      for (let j = 0; j < SHELL_SCUTES.costal; j++) {
        const a = at(SHELL_SCUTES.vertebral + 2 * j), b = at(SHELL_SCUTES.vertebral + 2 * j + 1);
        expect(a[0], `#${seed} costal ${j} out to the side`).toBeGreaterThan(0.25 * (box.max.x - box.min.x) / 2);
        expect(b[0], `#${seed} mirrored`).toBeCloseTo(-a[0], 6);
        expect(b[1], `#${seed} mirrored`).toBeCloseTo(a[1], 6);
        expect(nearest(g, a[0], a[1], a[2]), `#${seed} costal ${j} on the shell`).toBeLessThan(2 * cell);
      }
      // the marginals round the rim, low, out near its edge, one over the neck
      const M = Array.from({ length: SHELL_SCUTES.marginal }, (_, k) => at(SHELL_SCUTES.vertebral + 2 * SHELL_SCUTES.costal + k));
      for (const m of M) expect(m[1], `#${seed} marginal low`).toBeLessThan(V[2][1]);
      expect(M[0][0], `#${seed} the nuchal over the neck`).toBeCloseTo(0, 6);
      expect(M[0][2], `#${seed} the nuchal in front`).toBeGreaterThan(V[V.length - 1][2]);
      const reach = Math.max(...M.map((m) => Math.abs(m[0])));
      expect(reach / ((box.max.x - box.min.x) / 2), `#${seed} out to the rim`).toBeGreaterThan(0.75);
      g.dispose();
    }
  });

  it("is a tortoise's alone: a crab's carapace keeps its plates, a body with no shell has none", () => {
    expect(shellScutes(grow(genomeOfMorphotype(23, 'crab')))).toBeNull();
    expect(shellScutes(grow(genomeOfMorphotype(23, 'felid')))).toBeNull();
  });

  it("its material takes the scutes, and its seams and relief are drawn from them", () => {
    const p = grow(genomeOfMorphotype(23, 'chelonian'));
    const c = shellScutes(p)!;
    const g = p.genomeRef;
    const mat = makeCreatureMaterial(g.palette, { ...g.covering, type: 'plates', pattern: 'reticulate' }, g.seed, null, null, null, 0, null, false, false, c);
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    (mat.onBeforeCompile as (s: typeof shader) => void)(shader);
    expect(shader.uniforms.uScuteN.value).toBe(c.length / 3);
    const centres = shader.uniforms.uScutes.value as THREE.Vector3[];
    expect(centres.length).toBe(MAX_SCUTES);
    expect(centres[2].toArray()).toEqual([c[6], c[7], c[8]]);
    const f = shader.fragmentShader;
    // the pattern's seams and the relief's grooves both read the scutes before anything else
    const pf = f.indexOf('float patternField(');
    expect(f.indexOf('if (uScuteN > 0)', pf)).toBeLessThan(f.indexOf('if (type == 0)', pf));
    const sh = f.indexOf('float surfaceHeight(');
    expect(f.indexOf('if (uScuteN > 0)', sh)).toBeLessThan(f.indexOf('if (cover == 1)', sh));
    mat.dispose();
    // …and any other coat takes none
    const plain = makeCreatureMaterial(g.palette, g.covering, g.seed);
    const s2 = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    (plain.onBeforeCompile as (s: typeof s2) => void)(s2);
    expect(s2.uniforms.uScuteN.value).toBe(0);
    plain.dispose();
  });
});
