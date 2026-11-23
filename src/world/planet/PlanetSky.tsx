/**
 * A planet's ground, waters and sky, as the game and the planet lab both draw them: the ground in its detail
 * chunks (GroundChunks.tsx), the sea and the lakes and rivers, the cloud shell from the simulation's own
 * fronts, the air's shell, the stars, and the sun where the simulation has it (its night is the creatures'
 * night). The night side is moonlit, not black: a dim blue light from the far side of the sky, a little cool
 * fill everywhere, and a deep blue haze in the air — so the ground and the living still show by night, as
 * the valley's do. The ground is drawn in its season where each hemisphere is, and the studio light that
 * gives the bodies their sheen is turned up the planet's up where the camera looks.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { StudioEnvironment } from '../../viewer/StudioEnvironment';
import { yearPhase, type World } from '../../sim/world';
import type { PlanetSurface } from '../../sim/planetSurface';
import { airRadius, atmosphereMaterial } from './atmosphere';
import { LOOK } from './GlobeCamera';
import { cellsFor, cloudMaterial, freshWaterGeometry, freshWaterMaterial, GROUND_SEASON, groundMaterial, seaGeometry, setFronts } from './planetMesh';
import { GroundChunks } from './GroundChunks';

const UP = new THREE.Vector3(0, 1, 0);
const AT = new THREE.Vector3();
const SUN = new THREE.Vector3();
/** the moonlight on the night side (the valley's night light's blue) and the cool fill everywhere */
const MOON = 0.55;
const FILL = 0.1;
const TURN = new THREE.Quaternion();
const TURNED = new THREE.Euler();

export function PlanetSky({ world, S }: { world: World; S: PlanetSurface }) {
  const g = S.ground;
  const R = g.radius;
  const sea = useMemo(() => seaGeometry(g), [g]);
  useEffect(() => () => sea.dispose(), [sea]);
  const groundMat = useMemo(() => groundMaterial(g.relief), [g.relief]);
  const fresh = useMemo(() => freshWaterGeometry(g, cellsFor(R)), [g, R]);
  useEffect(() => () => fresh.dispose(), [fresh]);
  const freshMat = useMemo(() => freshWaterMaterial(), []);
  const clouds = useMemo(() => cloudMaterial(), []);
  const cloudGeo = useMemo(() => new THREE.SphereGeometry(1, 160, 80), []);
  const seaMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.86, depthWrite: false }), []);
  const air = useMemo(() => atmosphereMaterial(), []);
  const airGeo = useMemo(() => new THREE.SphereGeometry(1, 128, 64), []);
  useEffect(
    () => () => {
      groundMat.dispose();
      freshMat.dispose();
      clouds.dispose();
      cloudGeo.dispose();
      seaMat.dispose();
      air.dispose();
      airGeo.dispose();
    },
    [groundMat, freshMat, clouds, cloudGeo, seaMat, air, airGeo],
  );
  const scene = useThree((st) => st.scene);
  const fog = useMemo(() => new THREE.FogExp2(0x000000, 0), []);
  useEffect(() => {
    scene.fog = fog;
    scene.background = new THREE.Color(0x020306);
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene, fog]);
  const sun = useRef<THREE.DirectionalLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const seaMesh = useRef<THREE.Mesh>(null);
  const Ra = airRadius(R);
  useFrame(({ camera }) => {
    // the sun where the simulation has it (its night is the creatures' night)
    const s = S.sunAt(world.time);
    SUN.set(s[0], s[1], s[2]);
    // the season the ground is drawn in, and the clouds where the simulation's fronts are now
    GROUND_SEASON.yearPhase.value = yearPhase(world.time);
    GROUND_SEASON.tilt.value = S.tilt;
    // the sea where it stands now (the sea-level lever): its surface, and every shore the ground draws
    const seaNow = S.seaLevel();
    GROUND_SEASON.sea.value = seaNow;
    seaMesh.current?.scale.setScalar((R + seaNow) / R);
    setFronts(clouds, S.fronts(world.time), SUN);
    sun.current?.position.copy(SUN).multiplyScalar(1000);
    // (the moon stands over the night side: it lights what the sun does not, and least at the terminator)
    moon.current?.position.copy(SUN).multiplyScalar(-1000);
    // the studio light (the valley's environment map), turned so its overhead lies up the planet's up where
    // the camera looks: a map lights by world direction, and unturned its sky would light the flanks of
    // every body away from the north pole. Dimmed with the day there, and drawn back from orbit, where the
    // sun alone should light the globe and leave its night side dark.
    const T = LOOK.T;
    TURN.setFromUnitVectors(UP, AT.set(T[0], T[1], T[2])).invert();
    TURNED.setFromQuaternion(TURN, 'XYZ');
    // (three samples the map turned by the opposite of each angle: see its WebGLMaterials)
    scene.environmentRotation.set(-TURNED.x, -TURNED.y, -TURNED.z, 'XYZ');
    const dayT = THREE.MathUtils.smoothstep(AT.dot(SUN), -0.12, 0.25);
    scene.environmentIntensity = (0.18 + 0.62 * dayT) * (1 - 0.85 * LOOK.orbit);
    const u = air.uniforms;
    u.uCam.value.copy(camera.position);
    u.uSun.value.copy(SUN);
    u.uR.value = R;
    u.uRa.value = Ra;
    // in the air, a haze in the sky's colour (dark on the night side), the thicker the deeper in it the
    // camera is: from orbit, none
    const c = camera.position, r = c.length();
    const inAir = 1 - THREE.MathUtils.smoothstep(r, R + (Ra - R) * 0.35, Ra);
    const day = THREE.MathUtils.smoothstep(c.dot(SUN) / r, -0.12, 0.25);
    fog.color.setRGB(0.025 + 0.275 * day, 0.035 + 0.365 * day, 0.07 + 0.43 * day);
    fog.density = 0.0055 * inAir;
  });
  return (
    <>
      <StudioEnvironment />
      <directionalLight ref={sun} intensity={2.6} />
      <directionalLight ref={moon} intensity={MOON} color="#8ea8ff" />
      <ambientLight intensity={FILL} color="#a9b8de" />
      <GroundChunks ground={g} material={groundMat} />
      <mesh geometry={fresh} material={freshMat} renderOrder={1} />
      <mesh geometry={cloudGeo} material={clouds} scale={R + g.relief * 1.15 + 4} renderOrder={1.5} frustumCulled={false} />
      <mesh ref={seaMesh} geometry={sea} material={seaMat} renderOrder={1} />
      <mesh geometry={airGeo} material={air} scale={Ra} renderOrder={2} frustumCulled={false} />
      <Stars radius={R * 9} depth={R * 2} count={3000} factor={5} saturation={0} fade speed={0} />
    </>
  );
}
