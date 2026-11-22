/**
 * The lab planet's air: one shell round the planet, drawn from inside (the back faces), so the same shader
 * is the bright rim seen from orbit and the sky seen from the ground.
 *
 * Each pixel follows its ray through the air (from the camera, or from where the ray enters the shell, to
 * where it leaves or meets the ground), sums the air's density along it at a few points (thinning with
 * height), lit where the sun is up and reddened at the day's edge, and adds that light over what is behind:
 * thin overhead, thick and pale toward the horizon, a glowing ring from space. A cheap stand-in for real
 * scattering (no optical-depth table, no Mie lobe beyond a glow toward the sun): enough to judge the
 * planet's look by.
 */
import * as THREE from 'three';

/** How far the air reaches above the sea (bu): deep enough to fly in on any size of planet. */
export function airRadius(radius: number): number {
  return radius * 1.18 + 15;
}

export function atmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uR: { value: 100 },
      uRa: { value: 133 },
      uDay: { value: new THREE.Color(0x6e9fc8) },
      uDusk: { value: new THREE.Color(0xd08050) },
      uK: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCam;
      uniform vec3 uSun;
      uniform float uR;
      uniform float uRa;
      uniform vec3 uDay;
      uniform vec3 uDusk;
      uniform float uK;
      varying vec3 vW;
      // where a ray crosses a sphere about the origin: near and far (no crossing: far < near)
      vec2 crossing(vec3 o, vec3 d, float r) {
        float b = dot(o, d);
        float h = b * b - (dot(o, o) - r * r);
        if (h < 0.0) return vec2(1e9, -1e9);
        h = sqrt(h);
        return vec2(-b - h, -b + h);
      }
      void main() {
        vec3 d = normalize(vW - uCam);
        vec2 a = crossing(uCam, d, uRa);
        float t0 = max(a.x, 0.0);
        float t1 = a.y;
        // (the ground stops the ray)
        vec2 g = crossing(uCam, d, uR);
        if (g.x > 0.0) t1 = min(t1, g.x);
        float len = t1 - t0;
        if (len <= 0.0) discard;
        float H = (uRa - uR) * 0.28; // the air thins by e in this much height
        vec3 sum = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          vec3 x = uCam + d * (t0 + len * (float(i) + 0.5) / 6.0);
          float rx = length(x);
          float mu = dot(x / rx, uSun);
          // lit where the sun is up over that air, reddened where its light came the long way through
          vec3 tint = mix(uDusk, uDay, smoothstep(0.0, 0.35, mu));
          sum += tint * exp(-(rx - uR) / H) * smoothstep(-0.14, 0.18, mu);
        }
        vec3 col = sum * (len / 6.0) / H * uK;
        col *= 1.0 + 0.6 * pow(max(dot(d, uSun), 0.0), 12.0);
        gl_FragColor = vec4(1.0 - exp(-col), 1.0);
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
