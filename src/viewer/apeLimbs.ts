/**
 * An ape's hands and feet.
 *
 * A knuckle-walker stands on a FIST: the back of the hand carries on down from the forearm, the
 * fingers fold under it and their middle joints take the weight. Drawn as an open hand — a palm with
 * four straight fingers and a thumb splayed flat on the floor — it lay beside the wrist like a garden
 * rake, and read as a bird's foot. Its hind foot is a long flat sole with four toes and a big toe
 * that stands off to the inside, like a thumb (a dark oval cap read as a hoof).
 *
 * Both are authored in the body frame relative to their node (+Y up, +Z forward), like a paw: they
 * rest on the floor whatever way the limb above them leans. The furred part wears the body's own
 * covering; the fingers and toes are bare skin.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface ApeLimbGeometry {
  fur: THREE.BufferGeometry; // the back of the hand / the top of the foot
  bare: THREE.BufferGeometry; // fingers and thumb / toes
}

function blob(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, seg = 14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg - 4));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(sx, sy, sz)));
  return g;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // (each ball keeps its own smooth normals)
  const g = mergeGeometries(parts, false) ?? parts[0].clone();
  for (const p of parts) p.dispose();
  return g;
}

/** how much broader than the wrist a fist is */
export const FIST_SIZE = 1.3;

/**
 * A knuckle-walking fist. `r` is the wrist's radius, `drop` how far below the wrist node the floor
 * lies, `side` which flank it is on (+1 / −1: the thumb is on the inside).
 */
export function fistGeometry(r: number, drop: number, side: number): ApeLimbGeometry {
  const R = r * FIST_SIZE;
  const floor = -drop;
  // the back of the hand: a rounded block standing on the floor, leaning a little forward of the wrist
  const fur = merged([blob(0, floor + 0.95 * R, 0.1 * R, 0.98 * R, 0.94 * R, 0.84 * R, 0, 18)]);
  const bare: THREE.BufferGeometry[] = [];
  // four fingers folded under: a row of knuckles along the foot of the fist's front, shoulder to
  // shoulder and barely proud of it (set apart and reaching forward they were toes, or claws)
  for (const x of [-0.63, -0.21, 0.21, 0.63]) bare.push(blob(x * R, floor + 0.33 * R, 0.56 * R, 0.25 * R, 0.33 * R, 0.4 * R));
  // the thumb, tucked along the inside
  bare.push(blob(-side * 0.93 * R, floor + 0.36 * R, 0.25 * R, 0.22 * R, 0.27 * R, 0.44 * R, -side * 0.3));
  return { fur, bare: merged(bare) };
}

/**
 * An ape's hind foot: a long flat sole on the floor (the foot node's own bottom, −r), four toes at
 * its front and a big toe standing off the inside edge.
 */
export function apeFootGeometry(r: number, side: number): ApeLimbGeometry {
  const floor = -r;
  const fur = merged([blob(0, floor + 0.52 * r, 0.62 * r, 0.98 * r, 0.52 * r, 1.75 * r, 0, 18)]);
  const bare: THREE.BufferGeometry[] = [];
  const toes: readonly [number, number][] = [
    [-0.34, 2.22],
    [0.08, 2.32],
    [0.46, 2.2],
    [0.8, 1.98],
  ];
  // (the outer toes sit back a little, as on a hand)
  for (const [x, z] of toes) bare.push(blob(side * x * r, floor + 0.27 * r, z * r, 0.21 * r, 0.27 * r, 0.5 * r));
  bare.push(blob(-side * 1.02 * r, floor + 0.28 * r, 1.25 * r, 0.25 * r, 0.28 * r, 0.62 * r, -side * 0.6));
  return { fur, bare: merged(bare) };
}
