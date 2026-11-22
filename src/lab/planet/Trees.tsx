/**
 * A planet's trees drawn: the simulation's own (planetGround.ts's planetStands — the broadleaves its fliers
 * roost in), in the valley's broadleaf and conifer shapes, sizes and greens (world/Landscape.tsx), each
 * standing up the planet's own up. No wind and no seasons yet.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { coniferGeometry, crownGeometry } from '../../world/foliage';
import { anyTangent, cross, turn, type Vec3 } from '../../sim/sphere';
import { planetStands, type PlanetGround, type PlanetStand } from '../../sim/planetGround';
import { LOOK } from './GlobeCamera';

type Stand = PlanetStand;

const O = new THREE.Object3D();
const BASIS = new THREE.Matrix4();
const VX = new THREE.Vector3();
const VY = new THREE.Vector3();
const VZ = new THREE.Vector3();

/** A tree's matrix: standing at t on the planet's ground, `rise` bu up its own up, turned t.r about its
 *  trunk, scaled (sx, sy, sz). */
function placeOn(R: number, t: Stand, rise: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  const p: Vec3 = [t.x / R, t.y / R, t.z / R];
  const f = turn(p, anyTangent(p), t.r);
  const x = cross(p, f);
  BASIS.makeBasis(VX.set(x[0], x[1], x[2]), VY.set(p[0], p[1], p[2]), VZ.set(f[0], f[1], f[2]));
  O.quaternion.setFromRotationMatrix(BASIS);
  O.position.set(p[0], p[1], p[2]).multiplyScalar(R + t.h + rise);
  O.scale.set(sx, sy, sz);
  O.updateMatrix();
  return O.matrix;
}

export function Trees({ ground }: { ground: PlanetGround }) {
  const shape = ground;
  const { trees, pines } = useMemo(() => planetStands(ground), [ground]);
  const geos = useMemo(
    () => ({
      trunk: new THREE.CylinderGeometry(0.22, 0.34, 1, 6),
      // the valley's broadleaf crown (its lumpy lobes), a step coarser: there are thousands here
      crown: crownGeometry(
        [
          [0, 0.1, 0, 1],
          [0.62, -0.22, 0.2, 0.74],
          [-0.5, -0.18, -0.36, 0.7],
          [0.05, -0.3, 0.6, 0.62],
          [-0.15, 0.55, -0.1, 0.62],
          [0.4, 0.32, -0.42, 0.55],
        ],
        0.18,
        1,
      ),
      pine: coniferGeometry(),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      crown: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      pine: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 }),
    }),
    [],
  );
  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [geos, mats],
  );
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const pineTrunkRef = useRef<THREE.InstancedMesh>(null);
  const pineRef = useRef<THREE.InstancedMesh>(null);
  // each tree's crown: where its middle is and how far round it reaches (for the sightline below), which
  // trees are left out now, and every instance's own matrix, to put them back from
  const crowns = useRef<{ at: Float32Array; reach: Float32Array }>({ at: new Float32Array(0), reach: new Float32Array(0) });
  const held = useRef<{ cut: Uint8Array; kept: Float32Array[] }>({ cut: new Uint8Array(0), kept: [] });
  const judged = useRef(0);
  useEffect(() => {
    const R = shape.radius;
    const c = new THREE.Color();
    const n = trees.length + pines.length;
    const at = new Float32Array(n * 3), reach = new Float32Array(n);
    const mark = (k: number, t: Stand, rise: number, r: number) => {
      const p = [t.x / R, t.y / R, t.z / R];
      for (let a = 0; a < 3; a++) at[k * 3 + a] = p[a] * (R + t.h + rise);
      reach[k] = r;
    };
    trees.forEach((t, i) => {
      const H = 3.2 * t.s;
      trunkRef.current?.setMatrixAt(i, placeOn(R, t, H / 2, t.s, H, t.s));
      crownRef.current?.setMatrixAt(i, placeOn(R, t, H + 0.9 * t.s, 1.9 * t.s, 1.75 * t.s, 1.9 * t.s));
      // (the valley's spread of greens, a few going gold)
      crownRef.current?.setColorAt(i, (i * 7) % 23 === 0 ? c.setHSL(0.13, 0.55, 0.3) : c.setHSL(0.24 + (i % 7) * 0.014, 0.45, 0.17 + (i % 5) * 0.018));
      mark(i, t, H + 0.9 * t.s, 2.2 * t.s);
    });
    pines.forEach((t, i) => {
      const H = 1.4 * t.s;
      pineTrunkRef.current?.setMatrixAt(i, placeOn(R, t, H / 2, t.s * 0.8, H, t.s * 0.8));
      pineRef.current?.setMatrixAt(i, placeOn(R, t, H * 0.7, 1.3 * t.s, 1.6 * t.s, 1.3 * t.s));
      pineRef.current?.setColorAt(i, c.setHSL(0.36 + (i % 5) * 0.01, 0.38, 0.13 + (i % 4) * 0.015));
      mark(trees.length + i, t, H * 0.7 + 0.8 * t.s, 1.6 * t.s);
    });
    for (const m of [trunkRef.current, crownRef.current, pineTrunkRef.current, pineRef.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    crowns.current = { at, reach };
    held.current = { cut: new Uint8Array(n), kept: [trunkRef, crownRef, pineTrunkRef, pineRef].map((r) => (r.current ? (r.current.instanceMatrix.array as Float32Array).slice() : new Float32Array(0))) };
    judged.current = 0;
  }, [shape, trees, pines]);

  // The trees between the camera and what it looks at are left out, as the valley's follow camera sees
  // through the leaves on its sightline: a crown a few bu off the lens filled the whole view. (Judged a
  // few times a second; a tree left out is scaled to nothing, and put back from the matrices kept.)
  useFrame((st, dt) => {
    judged.current -= dt;
    if (judged.current > 0) return;
    judged.current = 0.15;
    const { at, reach } = crowns.current;
    const { cut, kept } = held.current;
    if (cut.length !== reach.length) return;
    const ox = st.camera.position.x, oy = st.camera.position.y, oz = st.camera.position.z;
    const [tx, ty, tz] = LOOK.at;
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const L2 = dx * dx + dy * dy + dz * dz || 1;
    const meshes = [trunkRef.current, crownRef.current, pineTrunkRef.current, pineRef.current];
    const dirty = [false, false, false, false];
    for (let k = 0; k < reach.length; k++) {
      // the distance from the crown's middle to the sightline (the segment from the lens to the point)
      const px = at[k * 3] - ox, py = at[k * 3 + 1] - oy, pz = at[k * 3 + 2] - oz;
      const u = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / L2));
      const ex = px - dx * u, ey = py - dy * u, ez = pz - dz * u;
      const out = ex * ex + ey * ey + ez * ez < (reach[k] + 0.6) ** 2 ? 1 : 0;
      if (out === cut[k]) continue;
      cut[k] = out;
      const pine = k >= trees.length;
      const i = pine ? k - trees.length : k;
      for (const part of pine ? [2, 3] : [0, 1]) {
        const m = meshes[part];
        if (!m) continue;
        const arr = m.instanceMatrix.array as Float32Array;
        if (out) arr.fill(0, i * 16, i * 16 + 16);
        else arr.set(kept[part].subarray(i * 16, i * 16 + 16), i * 16);
        dirty[part] = true;
      }
    }
    meshes.forEach((m, j) => {
      if (m && dirty[j]) m.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <group key={`${shape.seed}:${shape.radius}:${shape.relief}:${shape.land}:${shape.continents}:${shape.rugged}`}>
      <instancedMesh ref={trunkRef} args={[geos.trunk, mats.trunk, Math.max(1, trees.length)]} count={trees.length} frustumCulled={false} />
      <instancedMesh ref={crownRef} args={[geos.crown, mats.crown, Math.max(1, trees.length)]} count={trees.length} frustumCulled={false} />
      <instancedMesh ref={pineTrunkRef} args={[geos.trunk, mats.trunk, Math.max(1, pines.length)]} count={pines.length} frustumCulled={false} />
      <instancedMesh ref={pineRef} args={[geos.pine, mats.pine, Math.max(1, pines.length)]} count={pines.length} frustumCulled={false} />
    </group>
  );
}
