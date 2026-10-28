/**
 * The weather you see: rain streaks or drifting snowflakes in a box that travels with the camera
 * (GPU-animated: each drop's fall and wrap is a function of time in the vertex shader, so thousands
 * cost one draw and no per-frame CPU), and a shared WEATHER_LOOK the sky, the ground and the sound
 * read from. The weather itself is the sim's (src/sim/weather.ts) — a pure function of seed and time.
 */
import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { weatherAt } from '../sim/weather';
import type { World } from '../sim/world';
import { SEASON_LOOK } from './Landscape';

/** The look of the sky right now — eased toward the sim's weather; `wet` lags behind the rain. */
export const WEATHER_LOOK = { cloud: 0, rain: 0, snow: false, wet: 0, lastT: -1 };

/** Ease the shared look toward the weather at the world's time (call once a frame). */
export function updateWeatherLook(w: World, dt: number): void {
  const sky = weatherAt(w.seed, w.time);
  const L = WEATHER_LOOK;
  const k = Math.min(1, dt * 1.5);
  L.cloud += (sky.cloud - L.cloud) * k;
  L.rain += (sky.rain - L.rain) * k;
  L.snow = sky.snow;
  // the ground soaks up a shower quickly and dries over a few minutes of sim time
  const simDt = L.lastT < 0 ? 0 : Math.max(0, Math.min(30, w.time - L.lastT));
  L.lastT = w.time;
  const target = sky.snow ? 0 : sky.rain;
  L.wet += (target - L.wet) * Math.min(1, simDt * (target > L.wet ? 0.08 : 0.006));
  SEASON_LOOK.wet.value = L.wet;
}

const BOX = new THREE.Vector3(56, 30, 56);
const PRECIP_DAY = { value: 1 };
const N_RAIN = 9000;
const N_SNOW = 9000;

const COMMON = /* glsl */ `
attribute vec3 aSeed;
attribute float aRand;
uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform float uAmt;
varying float vA;
vec3 wrapAround(vec3 s, float fall) {
  vec3 p;
  p.x = uCam.x + (fract(s.x - uCam.x / uBox.x) - 0.5) * uBox.x;
  p.z = uCam.z + (fract(s.z - uCam.z / uBox.z) - 0.5) * uBox.z;
  p.y = uCam.y - uBox.y * 0.55 + fract(s.y - fall / uBox.y) * uBox.y;
  return p;
}
`;

function rainGeometry(): THREE.BufferGeometry {
  const seed = new Float32Array(N_RAIN * 2 * 3);
  const end = new Float32Array(N_RAIN * 2);
  const rnd = new Float32Array(N_RAIN * 2);
  for (let i = 0; i < N_RAIN; i++) {
    const s = [Math.random(), Math.random(), Math.random()];
    const r = Math.random();
    for (let v = 0; v < 2; v++) {
      seed.set(s, (i * 2 + v) * 3);
      end[i * 2 + v] = v;
      rnd[i * 2 + v] = r;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_RAIN * 2 * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  return g;
}

function snowGeometry(): THREE.BufferGeometry {
  const seed = new Float32Array(N_SNOW * 3);
  const rnd = new Float32Array(N_SNOW);
  for (let i = 0; i < N_SNOW; i++) {
    seed.set([Math.random(), Math.random(), Math.random()], i * 3);
    rnd[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_SNOW * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  return g;
}

export function Precipitation() {
  const camera = useThree((s) => s.camera);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX }, uAmt: { value: 0 }, uDay: PRECIP_DAY }),
    [],
  );
  const rain = useMemo(() => {
    const geo = rainGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: COMMON + /* glsl */ `
        attribute float aEnd;
        void main() {
          float fall = uTime * 24.0 * (0.85 + 0.3 * aSeed.y);
          vec3 p = wrapAround(aSeed, fall);
          // a streak slanted by the wind; the drops past the shower's strength are hidden
          p += normalize(vec3(0.16, -1.0, 0.07)) * aEnd * 1.1;
          vA = step(aRand, uAmt) * mix(0.0, 1.0, aEnd);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDay;
        varying float vA;
        void main() {
          if (vA <= 0.001) discard;
          // brighter toward the streak's head, a pale blue-white that reads on turf and on sky alike
          gl_FragColor = vec4(mix(vec3(0.45, 0.5, 0.6), vec3(0.86, 0.9, 0.96), uDay), 0.62 * sqrt(vA));
        }`,
    });
    const obj = new THREE.LineSegments(geo, mat);
    obj.frustumCulled = false;
    return obj;
  }, [uniforms]);
  const snow = useMemo(() => {
    const geo = snowGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: COMMON + /* glsl */ `
        void main() {
          float fall = uTime * 1.9 * (0.7 + 0.6 * aRand);
          vec3 p = wrapAround(aSeed, fall);
          // flakes drift and flutter as they fall
          p.x += sin(uTime * 0.9 + aSeed.y * 31.0) * 0.7;
          p.z += cos(uTime * 0.7 + aSeed.x * 23.0) * 0.5;
          vA = step(aRand, uAmt);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.0 + aRand * 0.9) * 130.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDay;
        varying float vA;
        void main() {
          if (vA <= 0.001) discard;
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          // faintly blue-grey, so a flake still reads against snow-covered ground
          gl_FragColor = vec4(mix(vec3(0.5, 0.55, 0.65), vec3(0.86, 0.89, 0.95), uDay), (1.0 - smoothstep(0.25, 0.5, d)) * 0.9);
        }`,
    });
    const obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false;
    return obj;
  }, [uniforms]);

  useFrame((st) => {
    const L = WEATHER_LOOK;
    uniforms.uTime.value = st.clock.elapsedTime;
    uniforms.uCam.value.copy(camera.position);
    uniforms.uAmt.value = Math.min(1, L.rain * 1.1);
    rain.visible = !L.snow && L.rain > 0.01;
    snow.visible = L.snow && L.rain > 0.01;
  });
  return (
    <>
      <primitive object={rain} />
      <primitive object={snow} />
    </>
  );
}

/** Daylight 0..1 for the precipitation's tint (set by the sky). */
export function setPrecipDaylight(day: number): void {
  PRECIP_DAY.value = day;
}
