/**
 * Jaw articulation — how open a creature's mouth is, right now.
 *
 * Mouths are BUILT slightly agape (the rest pose the breeder and the Studio show — a closed neutral
 * mouth read as cartoonish there). In the World a creature that always gapes reads as a gawping
 * mask, so the World provides a JawControl per creature: `open` = 0 closes the lips, 1 is the built
 * gape, > 1 opens wider (a bite, a call). A mouth with no control in context keeps its built pose.
 *
 * `hingeOf` derives the hinge from the built lip curves: the axis runs corner to corner, the pivot
 * sits a touch behind the corners, and `close` is the exact rotation that brings the lower lip's
 * front centre up to the upper lip's — measured, so every mouth closes flush whatever its shape.
 */
import { createContext } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../../engine/genome';

export interface JawControl {
  open: number;
}

export const JawContext = createContext<JawControl | null>(null);

export interface Hinge {
  pivot: THREE.Vector3;
  axis: THREE.Vector3; // unit; rotating the lower jaw by +close about it shuts the mouth
  close: number; // radians from the built pose to closed
}

/** Hinge for a lower jaw given the node-relative upper & lower lip rows (corner → corner). */
export function hingeOf(upper: { p: Vec3 }[], lower: { p: Vec3 }[], aim: Vec3): Hinge | null {
  if (upper.length < 3 || lower.length < 3) return null;
  const a = new THREE.Vector3(...upper[0].p).add(new THREE.Vector3(...lower[0].p)).multiplyScalar(0.5);
  const b = new THREE.Vector3(...upper[upper.length - 1].p).add(new THREE.Vector3(...lower[lower.length - 1].p)).multiplyScalar(0.5);
  const axis = b.clone().sub(a);
  if (axis.lengthSq() < 1e-10) return null;
  axis.normalize();
  // the jaw pivots a little behind its corners (a real jaw hinges near the ear, not at the lip)
  const back = new THREE.Vector3(...aim).normalize().multiplyScalar(-a.distanceTo(b) * 0.25);
  const pivot = a.clone().add(b).multiplyScalar(0.5).add(back);
  const U = new THREE.Vector3(...upper[upper.length >> 1].p).sub(pivot);
  const L = new THREE.Vector3(...lower[lower.length >> 1].p).sub(pivot);
  // project both onto the plane ⟂ axis and measure the signed angle L → U
  U.addScaledVector(axis, -U.dot(axis));
  L.addScaledVector(axis, -L.dot(axis));
  if (U.lengthSq() < 1e-12 || L.lengthSq() < 1e-12) return null;
  let ang = L.angleTo(U);
  const sign = Math.sign(new THREE.Vector3().crossVectors(L, U).dot(axis)) || 1;
  if (sign < 0) axis.negate();
  ang = Math.min(ang, 1.2) * 0.94; // stop a hair short so the lips meet rather than interpenetrate
  return { pivot, axis, close: ang };
}

const Q = new THREE.Quaternion();
const P = new THREE.Vector3();

/** Pose a lower-jaw group for an `open` amount (0 closed · 1 as built · >1 wider). */
export function poseJaw(group: THREE.Object3D, h: Hinge, open: number): void {
  const angle = h.close * (1 - open);
  Q.setFromAxisAngle(h.axis, angle);
  group.quaternion.copy(Q);
  // rotate about the pivot: position = pivot − R·pivot
  P.copy(h.pivot).applyQuaternion(Q);
  group.position.copy(h.pivot).sub(P);
}
