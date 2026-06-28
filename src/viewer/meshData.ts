/**
 * Capsule-union skinning data (DESIGN §6.3).
 *
 * Each skeleton edge becomes a capsule sized to its endpoints; each node a sphere.
 * The union reads as one body and is robust by construction — it handles *any*
 * evolved topology without self-destructing (Pillar 2). This module is pure data;
 * CreatureMesh renders it.
 */
import * as THREE from 'three';
import type { Phenotype, BodyNode } from '../engine/grow';
import type { Palette } from '../engine/genome';

export interface CapsuleInst {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  length: number; // cylinder portion
  radius: number;
  color: number; // hex
}

export interface SphereInst {
  position: [number, number, number];
  radius: number;
  color: number; // hex
  eye: boolean;
}

export interface MeshData {
  capsules: CapsuleInst[];
  spheres: SphereInst[];
}

const Y = new THREE.Vector3(0, 1, 0);

export function buildMeshData(p: Phenotype): MeshData {
  const pal = p.genomeRef.palette;
  const capsules: CapsuleInst[] = [];
  const spheres: SphereInst[] = [];

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
      radius: ((na.radius + nb.radius) / 2) * 0.85,
      color: colorFor(nb, pal),
    });
  }

  for (const n of p.nodes) {
    spheres.push({
      position: n.pos,
      radius: n.radius,
      color: colorFor(n, pal),
      eye: n.terminal === 'eye',
    });
  }

  return { capsules, spheres };
}

const _c = new THREE.Color();

function colorFor(n: BodyNode, pal: Palette): number {
  if (n.terminal === 'eye') return 0x101014;
  const hue = n.kind === 'spine' ? pal.hueA : pal.hueB;
  return _c.setHSL(hue, pal.sat, pal.light).getHex();
}
