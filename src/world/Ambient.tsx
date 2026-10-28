/**
 * Ambient life — the small things that make a meadow feel alive and that the sim doesn't model:
 * fireflies drifting and blinking low over the grass on warm nights, butterflies fluttering by day.
 * Both live in a box around the camera's focus and are animated wholly in their vertex shaders
 * (one draw each); how many show follows the hour, the season and the weather.
 */
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorld } from './worldStore';
import { dayPhase, seasonOf } from '../sim/world';
import { heightAt } from '../sim/terrain';
import { WEATHER_LOOK } from './Weather';

const N_FLIES = 520;
const N_BUTTERFLIES = 46;
const BOX = 38;

function flyGeometry(): THREE.BufferGeometry {
  const seed = new Float32Array(N_FLIES * 4);
  for (let i = 0; i < N_FLIES; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_FLIES * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  return g;
}

/** A butterfly: two wing quads hinged on the body axis (x = ±1 marks the wing tip side). */
function butterflyGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const side: number[] = [];
  const seed: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < N_BUTTERFLIES; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    for (const sd of [-1, 1]) {
      // a wing: a quad from the hinge (x=0) out to the tip (|x|=1), front (z=+0.6) to back (z=-0.7)
      const quad = [
        [0, 0, 0.5], [sd, 0, 0.75], [sd, 0, -0.55],
        [0, 0, 0.5], [sd, 0, -0.55], [0, 0, -0.7],
      ];
      const quv = [[0, 1], [1, 1], [1, 0], [0, 1], [1, 0], [0, 0]];
      quad.forEach((p, k) => {
        pos.push(...p);
        side.push(sd);
        seed.push(...s);
        uv.push(...quv[k]);
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function Ambient() {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const u = useMemo(
    () => ({
      uTime: { value: 0 },
      uFocus: { value: new THREE.Vector3() },
      uGround: { value: 0 },
      uFlies: { value: 0 },
      uBugs: { value: 0 },
    }),
    [],
  );
  const flies = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uGround, uFlies;
        uniform vec3 uFocus;
        varying float vA;
        void main() {
          float B = ${BOX.toFixed(1)};
          vec3 p;
          p.x = uFocus.x + (fract(aSeed.x - uFocus.x / B) - 0.5) * B;
          p.z = uFocus.z + (fract(aSeed.z - uFocus.z / B) - 0.5) * B;
          float t = uTime * (0.25 + 0.2 * aSeed.w) + aSeed.y * 40.0;
          p.x += sin(t * 1.3) * 1.2 + sin(t * 0.37) * 2.0;
          p.z += cos(t * 1.1) * 1.2 + cos(t * 0.29) * 2.0;
          p.y = uGround + 0.6 + aSeed.y * 2.4 + sin(t * 0.9) * 0.4;
          // a slow glow-and-fade, each on its own clock; only a fraction show, set by the night
          float blink = pow(max(0.0, sin(uTime * (0.9 + aSeed.w) + aSeed.x * 31.0)), 4.0);
          vA = blink * step(aSeed.w, uFlies);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = 120.0 / max(1.0, -mv.z) * (0.5 + blink);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          if (vA < 0.01) discard;
          float d = length(gl_PointCoord - 0.5);
          float glow = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * glow * vA * 2.0, glow * vA);
        }`,
    });
    const o = new THREE.Points(flyGeometry(), m);
    o.frustumCulled = false;
    return o;
  }, [u]);
  const bugs = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute float aSide;
        attribute vec4 aSeed;
        uniform float uTime, uGround, uBugs;
        uniform vec3 uFocus;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vShow;
        void main() {
          float B = ${BOX.toFixed(1)};
          float t = uTime * (0.35 + 0.25 * aSeed.w) + aSeed.y * 50.0;
          vec3 c;
          c.x = uFocus.x + (fract(aSeed.x - uFocus.x / B) - 0.5) * B + sin(t * 0.7) * 3.0 + sin(t * 2.3) * 0.4;
          c.z = uFocus.z + (fract(aSeed.z - uFocus.z / B) - 0.5) * B + cos(t * 0.53) * 3.0 + cos(t * 1.9) * 0.4;
          c.y = uGround + 0.5 + aSeed.y * 1.6 + abs(sin(t * 3.1)) * 0.35;
          float heading = t * 0.7 + aSeed.x * 6.28;
          // the wings beat about the body axis
          float flap = sin(uTime * (11.0 + 5.0 * aSeed.w) + aSeed.z * 20.0) * 1.05;
          vec3 p = position * 0.22;
          float a = abs(p.x) > 0.0 ? flap : 0.0;
          vec3 q = vec3(p.x * cos(a), abs(p.x) * sin(a), p.z);
          float ch = cos(heading), sh = sin(heading);
          q = vec3(q.x * ch + q.z * sh, q.y, -q.x * sh + q.z * ch);
          vUv = uv;
          vShow = step(aSeed.w, uBugs);
          vCol = mix(mix(vec3(0.95, 0.6, 0.15), vec3(0.95, 0.92, 0.85), step(0.55, aSeed.y)), vec3(0.35, 0.55, 0.95), step(0.85, aSeed.z));
          gl_Position = projectionMatrix * viewMatrix * vec4(c + q * vShow, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vShow;
        void main() {
          if (vShow < 0.5) discard;
          // a rounded wing with a dark margin
          vec2 w = vec2(vUv.x, vUv.y * 1.2 - 0.1);
          float r = length(w - vec2(0.45, 0.5));
          if (r > 0.55) discard;
          vec3 col = mix(vCol, vCol * 0.25, smoothstep(0.36, 0.5, r));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const o = new THREE.Mesh(butterflyGeometry(), m);
    o.frustumCulled = false;
    return o;
  }, [u]);

  useFrame((st, dt) => {
    const w = getWorld();
    u.uTime.value = st.clock.elapsedTime;
    const f = controls?.target ?? new THREE.Vector3();
    u.uFocus.value.copy(f);
    u.uGround.value += (Math.max(0, heightAt(w.terrain, f.x, f.z)) - u.uGround.value) * Math.min(1, dt * 2);
    const p = dayPhase(w.time);
    const night = p > 0.52 && p < 0.98 ? 1 : 0;
    const season = seasonOf(w.time);
    const warm = season === 'summer' ? 1 : season === 'spring' ? 0.6 : season === 'autumn' ? 0.25 : 0;
    const dry = 1 - Math.min(1, WEATHER_LOOK.rain * 2);
    const flyWant = night * warm * dry;
    const bugWant = (1 - night) * (warm > 0 ? 0.35 + 0.65 * warm : 0) * dry * (1 - WEATHER_LOOK.cloud * 0.6);
    u.uFlies.value += (flyWant - u.uFlies.value) * Math.min(1, dt * 0.8);
    u.uBugs.value += (bugWant - u.uBugs.value) * Math.min(1, dt * 0.8);
    flies.visible = u.uFlies.value > 0.01;
    bugs.visible = u.uBugs.value > 0.01;
  });
  return (
    <>
      <primitive object={flies} />
      <primitive object={bugs} />
    </>
  );
}
