/**
 * What grows and lies on a planet's ground, drawn where the simulation has it: each fruit bush (its fruit
 * showing as it ripens and is eaten), each carcass (shrinking as it is eaten and rots), each egg.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { heightOn, type PlanetGround } from '../../sim/planetGround';
import { anyTangent, cross, normalize, turn, type Vec3 } from '../../sim/sphere';
import type { World } from '../../sim/world';

const O = new THREE.Object3D();
const BASIS = new THREE.Matrix4();
const VX = new THREE.Vector3();
const VY = new THREE.Vector3();
const VZ = new THREE.Vector3();
const C = new THREE.Color();

/** Set `O` standing at the unit vector p, `rise` bu above its ground, turned `spin` about its up. */
function standOn(g: PlanetGround, p: Vec3, rise: number, spin: number): void {
  const f = turn(p, anyTangent(p), spin);
  const x = cross(p, f);
  BASIS.makeBasis(VX.set(x[0], x[1], x[2]), VY.set(p[0], p[1], p[2]), VZ.set(f[0], f[1], f[2]));
  O.quaternion.setFromRotationMatrix(BASIS);
  O.position.set(p[0], p[1], p[2]).multiplyScalar(g.radius + Math.max(heightOn(g, p), -0.3) + rise);
}

const MOST_REMAINS = 512;

export function Bushes({ world, ground }: { world: World; ground: PlanetGround }) {
  const plants = world.plants;
  const geos = useMemo(() => ({ bush: new THREE.DodecahedronGeometry(1, 1), berry: new THREE.SphereGeometry(1, 8, 6), carcass: new THREE.SphereGeometry(1, 10, 6), egg: new THREE.SphereGeometry(1, 10, 8) }), []);
  const mats = useMemo(
    () => ({
      bush: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      berry: new THREE.MeshStandardMaterial({ color: 0xc8322e, roughness: 0.35, emissive: 0x3a0808 }),
      carcass: new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.85 }),
      egg: new THREE.MeshStandardMaterial({ color: 0xe8dfc8, roughness: 0.5 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geos).forEach((x) => x.dispose());
      Object.values(mats).forEach((x) => x.dispose());
    },
    [geos, mats],
  );
  const bushRef = useRef<THREE.InstancedMesh>(null);
  const berryRef = useRef<THREE.InstancedMesh>(null);
  const carcassRef = useRef<THREE.InstancedMesh>(null);
  const eggRef = useRef<THREE.InstancedMesh>(null);
  // the bushes never move: set once
  const units = useMemo(() => plants.map((p) => normalize([p.x, p.y ?? 0, p.z])), [plants]);
  useEffect(() => {
    const m = bushRef.current;
    if (!m) return;
    plants.forEach((p, i) => {
      standOn(ground, units[i], p.size * 0.3, p.id * 2.4);
      O.scale.set(p.size * 0.9, p.size * 0.7, p.size * 0.9);
      O.updateMatrix();
      m.setMatrixAt(i, O.matrix);
      m.setColorAt(i, C.setHSL(0.27 + (p.id % 5) * 0.012, 0.42, 0.16 + (p.id % 4) * 0.015));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [plants, units, ground]);
  const tick = useRef(0);
  useFrame((_, dt) => {
    // the fruit, a couple of times a second: a red cluster on the bush, as big as what is left on it
    tick.current -= dt;
    const b = berryRef.current;
    if (b && tick.current <= 0) {
      tick.current = 0.5;
      plants.forEach((p, i) => {
        const ripe = p.max > 0 ? Math.sqrt(Math.max(0, p.fruit) / p.max) : 0;
        standOn(ground, units[i], p.size * 0.85, p.id * 2.4);
        O.scale.setScalar(Math.max(1e-3, p.size * 0.42 * ripe));
        O.updateMatrix();
        b.setMatrixAt(i, O.matrix);
      });
      b.instanceMatrix.needsUpdate = true;
    }
    // the remains, every frame (there are few)
    const k = carcassRef.current, e = eggRef.current;
    if (k) {
      let n = 0;
      for (const c of world.corpses) {
        if (n >= MOST_REMAINS) break;
        const left = c.maxMeat > 0 ? Math.max(0.3, c.meat / c.maxMeat) : 1;
        const size = 0.5 * (0.4 + 0.6 * c.growth) * Math.cbrt(Math.max(1, c.maxMeat) / 30);
        standOn(ground, normalize([c.x, c.y, c.z]), size * 0.2, c.id);
        O.scale.set(size * 0.6 * left, size * 0.35 * left, size);
        O.updateMatrix();
        k.setMatrixAt(n++, O.matrix);
      }
      k.count = n;
      k.instanceMatrix.needsUpdate = true;
    }
    if (e) {
      let n = 0;
      for (const egg of world.eggs) {
        if (n >= MOST_REMAINS) break;
        standOn(ground, normalize([egg.x, egg.y, egg.z]), 0.12, egg.id);
        O.scale.set(0.16, 0.2, 0.16);
        O.updateMatrix();
        e.setMatrixAt(n++, O.matrix);
      }
      e.count = n;
      e.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <instancedMesh ref={bushRef} args={[geos.bush, mats.bush, Math.max(1, plants.length)]} count={plants.length} frustumCulled={false} />
      <instancedMesh ref={berryRef} args={[geos.berry, mats.berry, Math.max(1, plants.length)]} count={plants.length} frustumCulled={false} />
      <instancedMesh ref={carcassRef} args={[geos.carcass, mats.carcass, MOST_REMAINS]} count={0} frustumCulled={false} />
      <instancedMesh ref={eggRef} args={[geos.egg, mats.egg, MOST_REMAINS]} count={0} frustumCulled={false} />
    </>
  );
}
