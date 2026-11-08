import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FOLIAGE_CUT, foliageMaterial, withSightCut } from '../../src/world/foliage';

/** Run a material's onBeforeCompile against three's real shader source (as the renderer would). */
function compiled(m: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
  };
  (m.onBeforeCompile as (s: typeof shader) => void)(shader);
  return shader;
}

const braces = (src: string) => [...src].reduce((n, ch) => n + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0);

describe('the follow camera sees through the leaves', () => {
  it('leaves, trunks and berries share one sightline uniform and cut along it', () => {
    // (a creature walking behind a bush or under a crown was hidden by a wall of leaves)
    for (const m of [foliageMaterial(7, 1), withSightCut(new THREE.MeshStandardMaterial())]) {
      const s = compiled(m);
      expect(s.uniforms.uCut).toBe(FOLIAGE_CUT);
      expect(s.fragmentShader).toContain('bool sightCut(vec3 w)');
      expect(s.fragmentShader).toMatch(/if \(sightCut\(v(FolW|CutW)\)\) discard;/);
      // the world position flows vertex → fragment, and every injection kept the source balanced
      expect(s.vertexShader).toMatch(/v(FolW|CutW) = \(modelMatrix \* wp\)\.xyz;/);
      expect(braces(s.vertexShader)).toBe(0);
      expect(braces(s.fragmentShader)).toBe(0);
      m.dispose();
    }
  });

  it('cuts nothing until a creature is followed', () => {
    expect(FOLIAGE_CUT.value.w).toBe(0);
  });
});
