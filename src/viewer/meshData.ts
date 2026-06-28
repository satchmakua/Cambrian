/**
 * Render data for a Phenotype (DESIGN §6.3).
 *
 * The skeleton splits into the **body** (spine + limb capsules and joint spheres,
 * drawn with the shared countershaded creature material) and **features** (eyes,
 * mouth, feet, claws, fins) — the bits that turn a blob into a face/limbs and get
 * special rendering. Pure data; CreatureMesh renders it.
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import type { Terminal } from '../engine/genome';

export interface CapsuleInst {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  length: number;
  radius: number;
}

export interface SphereInst {
  position: [number, number, number];
  radius: number;
}

export interface FeatureInst {
  type: Exclude<Terminal, 'none'>;
  position: [number, number, number];
  quaternion: [number, number, number, number]; // node orientation; local +Z points outward
  radius: number;
}

export interface MeshData {
  capsules: CapsuleInst[];
  spheres: SphereInst[];
  features: FeatureInst[];
}

const Y = new THREE.Vector3(0, 1, 0);

export function buildMeshData(p: Phenotype): MeshData {
  const capsules: CapsuleInst[] = [];
  const spheres: SphereInst[] = [];
  const features: FeatureInst[] = [];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();

  for (const [i, j] of p.edges) {
    const na = p.nodes[i];
    const nb = p.nodes[j];
    a.fromArray(na.pos);
    b.fromArray(nb.pos);
    dir.subVectors(b, a);
    const length = dir.length();
    if (length < 1e-5) continue;
    dir.normalize();
    q.setFromUnitVectors(Y, dir);
    const mid = a.clone().addScaledVector(dir, length / 2);
    capsules.push({
      position: [mid.x, mid.y, mid.z],
      quaternion: [q.x, q.y, q.z, q.w],
      length,
      radius: ((na.radius + nb.radius) / 2) * 0.9,
    });
  }

  for (const n of p.nodes) {
    if (n.terminal && n.terminal !== 'none') {
      features.push({ type: n.terminal, position: n.pos, quaternion: n.quat, radius: n.radius });
    } else {
      spheres.push({ position: n.pos, radius: n.radius });
    }
  }

  return { capsules, spheres, features };
}
