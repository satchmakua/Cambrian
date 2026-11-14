/**
 * Ear geometry (pure three.js — no React), built in the body frame relative to its node.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { earVariant } from './partStyles';

/** how deep an ear's hollow is (× its half-width there): a cat's ear is a rolled half-cone, a bear's
 *  or a mouse's a cup. (At 0.42 every ear was a shallow dish a fifth to a third as deep as it was wide:
 *  seen edge-on in a three-quarter view, the far one was a thin horn.) */
export const EAR_CUP: Record<ReturnType<typeof earVariant>, number> = { pointed: 0.9, round: 0.72, leaf: 0.78 };

/**
 * An ear, built in the BODY frame: it rises along the part's outward aim, its face turned forward
 * and out to its own side (an ear's opening looks forward-out, whatever roll the growth frame happened
 * to carry). A real
 * ear is a CUP: a hollow front (the darker inner ear) and a rounded, furred back, thick at the base
 * and thinning to a fine rim — so it is lofted as two surfaces over one outline that meet at the rim,
 * the front pushed back into a hollow, the back bowed out, the tip curling back a touch, the base
 * sunk into the head. (A flat cone or a squashed sphere with a disc on its face read as cardboard.)
 *   pointed — a cat/fox triangle · round — a bear/mouse cup · leaf — a long rabbit/deer blade
 */
export function earGeometry(v: ReturnType<typeof earVariant>, r: number, quat: readonly number[]): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const out = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(quat[0], quat[1], quat[2], quat[3])).normalize();
  // the ear's face normal: forward and turned OUT to its own side (a cat's opens ~30° out, a bear's
  // or a mouse's round cup ~45°, a rabbit's or a deer's blade more) — made perpendicular to the
  // ear's rise. (Faced dead ahead, an ear was seen edge-on from the side: a thin dark horn.)
  const turn = v === 'pointed' ? 0.52 : v === 'round' ? 0.78 : 0.87;
  const lat = Math.sign(out.x);
  const n = new THREE.Vector3(lat * Math.sin(turn), 0, Math.cos(turn));
  n.addScaledVector(out, -n.dot(out));
  if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
  n.normalize();
  const side = new THREE.Vector3().crossVectors(out, n).normalize();
  // local frame: X = across the ear, Y = up the ear (out), Z = its face normal (forward)
  const basis = new THREE.Matrix4().makeBasis(side, out, n);
  // the outline's half-width (×r) up the ear (v 0 base … 1 tip) and its height (×r)
  const H = v === 'pointed' ? 1.95 : v === 'round' ? 1.75 : 3.5;
  const halfW = (t: number): number =>
    v === 'pointed'
      ? 0.95 * Math.pow(1 - t, 0.85) * (0.82 + 0.18 * Math.min(1, t / 0.2))
      : v === 'round'
        ? 1.08 * Math.sqrt(Math.max(0, 1 - ((t - 0.42) / 0.58) ** 2))
        : 0.8 * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.75);
  // the base sits sunk into the head (×r): deep enough that the corners of a wide ear are still under
  // the skin where the skull curves away beneath them, so no seam shows
  const base = -0.5;
  const NU = 14, NV = 14;
  const cupK = EAR_CUP[v];
  // the ear's surfaces at (u across −1…1, t up 0…1): the front pushed back into a hollow (deepest low
  // in the ear), the back bowed out behind it, thick at the base and thin at the rim and the tip
  const at = (u: number, t: number, layer: 'front' | 'back' | 'inner'): [number, number, number] => {
    const w = Math.max(halfW(t), 0.015);
    const bulge = 1 - u * u;
    const cup = cupK * w * bulge * (1 - 0.55 * t);
    const thick = (0.2 - 0.12 * t) * Math.sqrt(bulge);
    const curl = (v === 'leaf' ? 0.35 : 0.18) * t * t * t; // the tip leans back a little
    // (the inner ear lies a hair in front of the hollow, a patch on it)
    const z = (layer === 'back' ? -cup - thick : layer === 'inner' ? -cup + 0.012 : -cup) - curl;
    return [u * w * r, (base + t * (H - base)) * r, z * r];
  };
  const surface = (layer: 'front' | 'back' | 'inner'): THREE.BufferGeometry => {
    const pos: number[] = [];
    // the inner ear: an inset patch of the front, clear of the furred rim and short of the tip
    const [u0, t0, t1] = layer === 'inner' ? [0.66, 0.12, v === 'round' ? 0.82 : 0.78] : [1, 0, 1];
    for (let j = 0; j <= NV; j++) {
      const t = t0 + (t1 - t0) * (j / NV);
      for (let i = 0; i <= NU; i++) pos.push(...at(((i / NU) * 2 - 1) * u0, t, layer));
    }
    const idx: number[] = [];
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i, b = a + NU + 1;
        // the front and the inner ear look forward (+Z), the back backward
        if (layer !== 'back') idx.push(a, a + 1, b, a + 1, b + 1, b);
        else idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.applyMatrix4(basis);
    g.computeVertexNormals();
    return g;
  };
  // the coat covers the back and the front's rim (one mesh); the inner ear is its own
  const front = surface('front'), back = surface('back');
  const outer = mergeGeometries([front, back]) ?? back;
  front.dispose();
  if (outer !== back) back.dispose();
  return { outer, inner: surface('inner') };
}

