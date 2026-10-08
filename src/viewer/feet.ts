/**
 * Toed feet and bare shanks.
 *
 * A bird stands on scaly, featherless shanks ending in four thin toes — three spread forward, the
 * hallux turned back — each tipped with a claw. A lizard's foot is a splayed fan of five clawed
 * toes. Both are authored in the BODY frame around the foot node (toes run along the ground, +Z
 * forward), so they read the same on either side and need no per-leg mirroring. The toes wear the
 * body's own covering material (baked body-space coordinates), which below the bare line is the
 * keratin of the shanks — the toe joins the leg without a seam.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Phenotype } from '../engine/grow';
import { shankColor } from './keratin';
import type { BareLegs } from './creatureMaterial';

export type FootPlan = 'bird' | 'reptile';

/** Which toed foot a clawed leg ends in, by covering (arthropods keep their single tarsal claw). */
export function footPlanOf(p: Phenotype): FootPlan | null {
  const t = p.genomeRef.covering.type;
  if (t === 'feathers') return 'bird';
  if (t === 'scales' || t === 'skin' || t === 'plates') return 'reptile';
  return null;
}

/** The leg chains: [hip node, …, foot node] for every leg that reaches a terminal. */
function legChains(p: Phenotype): number[][] {
  const parent = new Int32Array(p.nodes.length).fill(-1);
  for (const [a, b] of p.edges) parent[b] = a;
  const out: number[][] = [];
  p.nodes.forEach((n, i) => {
    if (n.kind !== 'terminal' || n.part?.kind !== 'leg') return;
    const chain = [i];
    let j = parent[i];
    while (j >= 0 && p.nodes[j].part?.kind === 'leg' && p.nodes[j].kind !== 'spine') {
      chain.unshift(j);
      j = parent[j];
    }
    out.push(chain);
  });
  return out;
}

/** A feathered body's bare-shank line: plumage covers the thigh and "drumstick", the lower ~55% of
 *  the standing leg is scaly keratin. Null for anything that isn't feathered with legs. */
export function bareLegsOf(p: Phenotype): BareLegs | null {
  if (p.genomeRef.covering.type !== 'feathers') return null;
  const chains = legChains(p).filter((c) => c.length >= 2);
  if (chains.length === 0) return null;
  let hip = 0;
  let foot = 0;
  for (const c of chains) {
    hip += p.nodes[c[0]].pos[1];
    foot += p.nodes[c[c.length - 1]].pos[1];
  }
  hip /= chains.length;
  foot /= chains.length;
  const span = hip - foot;
  if (span <= 0.05) return null;
  return { y: foot + span * 0.55, band: span * 0.06, color: shankColor(p.genomeRef.seed) };
}

/** Length of the leg's last link (foot node → its parent), for proportioning the toes. */
export function lastLinkOf(p: Phenotype, idx: number): number {
  for (const [a, b] of p.edges) {
    if (b !== idx) continue;
    const u = p.nodes[a].pos, v = p.nodes[idx].pos;
    return Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  }
  return p.nodes[idx].radius * 3;
}

interface ToeSpec {
  az: number; // heading off body-forward (rad, about +Y)
  len: number;
  r0: number; // root radius
}

function toesOf(plan: FootPlan, r: number, link: number): ToeSpec[] {
  if (plan === 'bird') {
    const L = Math.max(r * 3.4, link * 0.55);
    const t = Math.max(r * 0.34, L * 0.075);
    return [
      { az: -0.48, len: L * 0.9, r0: t },
      { az: 0, len: L, r0: t * 1.05 },
      { az: 0.48, len: L * 0.9, r0: t },
      { az: Math.PI, len: L * 0.5, r0: t * 0.9 }, // the hallux
    ];
  }
  const L = Math.max(r * 2.2, link * 0.32);
  const t = Math.max(r * 0.36, L * 0.13);
  return [-0.95, -0.48, 0, 0.48, 0.95].map((az, i) => ({ az, len: L * (i === 0 || i === 4 ? 0.62 : i === 2 ? 1 : 0.86), r0: t }));
}

/** The toes (skin) and claws (dark keratin) of one foot, in the body frame about the foot node. */
export function toedFootGeometry(plan: FootPlan, r: number, link: number): { toes: THREE.BufferGeometry; claws: THREE.BufferGeometry } {
  const toes: THREE.BufferGeometry[] = [];
  const claws: THREE.BufferGeometry[] = [];
  const floor = -r; // the foot node's underside sits on the ground (levelFeet)
  const up = new THREE.Vector3(0, 1, 0);
  // a pad under the ankle joining the toes
  const pad = new THREE.SphereGeometry(1, 12, 8);
  pad.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, floor + r * 0.42, 0), new THREE.Quaternion(), new THREE.Vector3(r * 0.95, r * 0.5, r * 0.95)));
  toes.push(pad);
  for (const t of toesOf(plan, r, link)) {
    const dir = new THREE.Vector3(Math.sin(t.az), 0, Math.cos(t.az));
    // two phalanges: up over a knuckle and down to the claw, so the toe grips rather than lies flat
    const y0 = floor + t.r0 * 1.1;
    const knuckle = dir.clone().multiplyScalar(t.len * 0.5).setY(floor + t.r0 * 1.45);
    const tip = dir.clone().multiplyScalar(t.len).setY(floor + t.r0 * 0.75);
    const pts = [new THREE.Vector3(0, y0, 0), knuckle, tip];
    for (let k = 0; k < 2; k++) {
      const a = pts[k], b = pts[k + 1];
      const ra = t.r0 * (k === 0 ? 1 : 0.82), rb = t.r0 * (k === 0 ? 0.82 : 0.6);
      const seg = b.clone().sub(a);
      const cyl = new THREE.CylinderGeometry(rb, ra, seg.length(), 8, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(up, seg.clone().normalize());
      cyl.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
      toes.push(cyl);
      const joint = new THREE.SphereGeometry(rb, 8, 6);
      joint.translate(b.x, b.y, b.z);
      toes.push(joint);
    }
    // the claw: a curved-down cone off the tip
    const cdir = dir.clone().setY(-0.55).normalize();
    const cl = t.r0 * (plan === 'bird' ? 2.2 : 1.9);
    const claw = new THREE.ConeGeometry(t.r0 * 0.5, cl, 6);
    claw.applyMatrix4(
      new THREE.Matrix4().compose(tip.clone().add(cdir.clone().multiplyScalar(cl * 0.45)), new THREE.Quaternion().setFromUnitVectors(up, cdir), new THREE.Vector3(1, 1, 1)),
    );
    claws.push(claw);
  }
  const merge = (gs: THREE.BufferGeometry[]) => {
    const m = mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)), false) ?? gs[0];
    for (const g of gs) if (g !== m) g.dispose();
    return m;
  };
  return { toes: merge(toes), claws: merge(claws) };
}
