/**
 * The body's skin material — a MeshStandardMaterial extended via `onBeforeCompile`
 * with the cues that make a smooth capsule-union read as a living animal (DESIGN §6.4):
 *
 *   - countershading: darker on top (back), lighter underneath (belly)
 *   - a procedural skin pattern: plain / stripes / spots, per creature
 *   - a fresnel rim so the silhouette glows like backlit skin
 *
 * Effects use *world* space, which is stable because the turntable orbits the camera,
 * not the creature (CreatureViewer). One material instance is shared across every body
 * mesh of a creature, so the extended shader compiles once.
 */
import * as THREE from 'three';
import type { Palette } from '../engine/genome';

export function makeCreatureMaterial(pal: Palette, seed: number): THREE.MeshStandardMaterial {
  const main = new THREE.Color().setHSL(pal.hueA, pal.sat, pal.light);
  const back = main.clone().multiplyScalar(0.6); // dorsal — darker
  const belly = main.clone().lerp(new THREE.Color(0xffffff), 0.42); // ventral — lighter
  const pattern = new THREE.Color().setHSL(pal.hueB, Math.min(1, pal.sat * 1.1), pal.light * 0.5);
  const rim = main.clone().lerp(new THREE.Color(0xffe2b8), 0.5); // warm backlight

  const patternType = seed % 3; // 0 plain · 1 stripes · 2 spots
  const patternScale = 2.2 + (seed % 7) * 0.55;

  const mat = new THREE.MeshStandardMaterial({ color: main, roughness: 0.6, metalness: 0.0 });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBack = { value: back };
    shader.uniforms.uBelly = { value: belly };
    shader.uniforms.uPattern = { value: pattern };
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uPType = { value: patternType };
    shader.uniforms.uPScale = { value: patternScale };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n  vWPos = worldPosition.xyz;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n  vWNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNrm;
        uniform vec3 uBack; uniform vec3 uBelly; uniform vec3 uPattern; uniform vec3 uRim;
        uniform int uPType; uniform float uPScale;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float up = clamp(vWNrm.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 skin = mix(uBelly, uBack, smoothstep(0.25, 0.78, up));
          float pat = 0.0;
          if (uPType == 1) {
            pat = smoothstep(0.15, 0.5, sin(vWPos.z * uPScale + vWPos.y * 0.6) * 0.5 + 0.5);
          } else if (uPType == 2) {
            float n = sin(vWPos.x * uPScale) * sin(vWPos.y * uPScale) * sin(vWPos.z * uPScale);
            pat = smoothstep(0.35, 0.62, n * 0.5 + 0.5);
          }
          skin = mix(skin, uPattern, pat * 0.55);
          diffuseColor.rgb = skin;
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
          totalEmissiveRadiance += uRim * fres * 0.55;
        }`,
      );
  };

  return mat;
}
