/**
 * Smooth skin (MORPHOLOGY §12, ROADMAP M15) — one organic surface over the node field.
 *
 * The capsule-union "kit" is robust but reads as separate parts welded with hard seams.
 * This replaces it (when toggled) with a single watertight surface: the shared body field
 * (`bodyField.ts` — smooth union of the skeleton's capsules + the anisotropic node ellipsoids,
 * so shaped skulls/flat torsos keep their silhouette), polygonized by **marching tetrahedra**
 * (6 tets per grid cell — small, watertight, no 256-entry table; the iso-surface is exactly
 * the smoothed capsule union, so it hugs the body predictably). Pure geometry in body space
 * (= world space — the creature isn't transformed), so the existing covering shader's
 * world-space patterns/bump carry straight over.
 *
 * `carves` subtract mouth cavities from the field (the mouth-overhaul): the maw becomes a real
 * recess in the head with a soft lip rim, and every vertex gets an `aFlesh` weight (1 inside the
 * cavity → 0 at `band` outside it) that the covering shader turns into dark wet mouth-flesh.
 *
 * It's a *viewer* concern and gated behind the capsule path: `grow()` stays static, thumbnails
 * keep capsules, and the build is one-time per creature (off the render loop). Deterministic
 * from the phenotype; bounded & finite on any topology (asserted by the test).
 */
import * as THREE from 'three';
import type { Phenotype } from '../engine/grow';
import { buildFieldPrims, fieldAt, fieldAtCarved, carveDist, type Carve, type FieldPrims } from './bodyField';
import { polygonize, gridCells } from './polygonize';

// Grid resolution, in cells along the creature's longest padded extent. The grid is sampled as a
// NARROW BAND (exact field only near the skin — see polygonize) so resolution costs surface area.
export const SKIN_RES = { high: 84, low: 44 } as const;
export type SkinQuality = keyof typeof SKIN_RES;

function meanRadius(prims: FieldPrims): number {
  let meanR = 0;
  for (let i = 0; i < prims.nc; i++) meanR += prims.pr[i];
  return meanR / Math.max(prims.nc, 1);
}

/** Floor every cone radius at ~0.6 of a grid cell, so a thin limb (a leg, a tail tip) is always at
 *  least one cell thick and can't be missed/fragmented by the marching tets (M24). */
function floorRadii(prims: FieldPrims, cell: number): void {
  const rFloor = 0.6 * cell;
  for (let m = 0; m < prims.nc; m++) {
    if (prims.pr[m] < rFloor) prims.pr[m] = rFloor;
    if (prims.ra[m] < rFloor) prims.ra[m] = rFloor;
    if (prims.rb[m] < rFloor) prims.rb[m] = rFloor;
  }
}

function toGeometry(
  poly: ReturnType<typeof polygonize>,
  flesh?: Float32Array,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(poly.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(poly.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(poly.indices, 1));
  const n = poly.positions.length / 3;
  // aFlesh — mouth-cavity weight (the covering shader's wet gum-flesh); zeros when there is none
  geo.setAttribute('aFlesh', new THREE.BufferAttribute(flesh ?? new Float32Array(n), 1));
  geo.setAttribute('aAO', new THREE.BufferAttribute(poly.ao, 1));
  return geo;
}

export function buildSmoothGeometry(
  p: Phenotype,
  full = false,
  carves: readonly Carve[] = [],
  quality: SkinQuality = 'high',
): THREE.BufferGeometry {
  // the shared body field as flat typed arrays — `full` (hybrid) meshes every part for full
  // definition; otherwise just the locomotor body (see bodyField for the filters + fallbacks).
  const prims = buildFieldPrims(p, full ? 'hybrid' : 'body');
  const np = prims.nc + prims.ne;
  const meanR = meanRadius(prims);
  prims.k = (full ? 0.34 : 0.5) * meanR; // hybrid blends tighter → keeps more part definition

  // grid bounds: the body bounds padded so the inflated surface stays inside — including any
  // ellipsoid node's overshoot past its scalar radius (a stretched snout, a broad slab body)
  const pad = meanR * 1.5 + prims.k + prims.excess + 0.05;
  const min = [p.bounds.min[0] - pad, p.bounds.min[1] - pad, p.bounds.min[2] - pad];
  const max = [p.bounds.max[0] + pad, p.bounds.max[1] + pad, p.bounds.max[2] + pad];
  // a very many-part creature steps the resolution down a touch so its per-sample cost stays bounded
  const res = SKIN_RES[quality] * (np > 160 ? 0.8 : 1);
  const g = gridCells(min, max, res);
  const cell = Math.max(g.dx, g.dy, g.dz);
  floorRadii(prims, cell);

  // a carve rim thinner than a grid cell aliases into stair-steps — soften it to the cell size
  const carved: Carve[] =
    carves.length === 0 ? [] : carves.map((c) => (c.blend >= cell * 0.8 ? c : { ...c, blend: cell * 0.8 }));

  const poly = polygonize((x, y, z) => fieldAtCarved(prims, carved, x, y, z), min, max, {
    res,
    aoScale: meanR * 0.2,
  });

  // aFlesh — 1 deep inside a carved cavity, fading to 0 `band` outside its wall
  const nVerts = poly.positions.length / 3;
  const flesh = new Float32Array(nVerts);
  if (carved.length > 0) {
    const pos = poly.positions;
    for (let v = 0; v < nVerts; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let w = 0;
      for (const c of carved) {
        const cd = carveDist(c, x, y, z);
        const cw = 1 - cd / Math.max(c.band, 1e-4);
        if (cw > w) w = cw;
      }
      flesh[v] = w < 0 ? 0 : w > 1 ? 1 : w;
    }
  }
  return toGeometry(poly, flesh);
}

// =============================================================================
// Carapace shell
// =============================================================================

/**
 * A carapace that CONFORMS to the body: the trunk's own field inflated by a shell thickness (more on
 * top — a domed back) and cut off below the flank by a skirt plane that flares out at the rim. The
 * old carapace was a scaled sphere hung on one node — on a wide crab or a deep turtle it swelled into
 * a giant egg that swallowed the creature. Derived from the trunk, the shell is always the animal's
 * own outline, a little bigger: the head, legs and tail emerge from under its rim.
 *
 * Returns null when the creature has no carapace part (or no trunk to cover).
 */
export function buildShellGeometry(p: Phenotype, quality: SkinQuality = 'high'): THREE.BufferGeometry | null {
  const shellNode = p.nodes.find((n) => n.terminal === 'carapace');
  if (!shellNode) return null;
  const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
  if (trunk.length === 0) return null;
  // a field of the trunk alone: its spine chain (round cones) + shaped nodes
  const trunkSet = new Set(trunk);
  const sub: Phenotype = {
    ...p,
    nodes: p.nodes,
    edges: p.edges.filter(([a, b]) => trunkSet.has(p.nodes[a]) && trunkSet.has(p.nodes[b])),
  };
  const prims = buildFieldPrims(sub, 'body');
  if (sub.edges.length === 0) {
    // a one-node trunk: build the field from that node alone
    const n = trunk[0];
    prims.nc = 1;
    prims.ax[0] = prims.bx[0] = n.pos[0];
    prims.ay[0] = prims.by[0] = n.pos[1];
    prims.az[0] = prims.bz[0] = n.pos[2];
    prims.ra[0] = prims.rb[0] = prims.pr[0] = n.radius;
    prims.cx[0] = n.pos[0]; prims.cy[0] = n.pos[1]; prims.cz[0] = n.pos[2]; prims.hl[0] = 0;
    prims.ne = 0;
  }
  let rMax = 0, ySum = 0;
  let zMin = Infinity, zMax = -Infinity;
  for (const n of trunk) {
    rMax = Math.max(rMax, n.radius);
    ySum += n.pos[1];
    zMin = Math.min(zMin, n.pos[2] - n.radius);
    zMax = Math.max(zMax, n.pos[2] + n.radius);
  }
  const yMid = ySum / trunk.length;
  prims.k = 0.4 * rMax;
  // the shell's size gene: the carapace part's thickness (relative to the trunk) sets how proud it sits
  const prominence = Math.min(1.6, Math.max(0.6, shellNode.radius / Math.max(rMax, 1e-3)));
  const t0 = rMax * 0.1 * prominence; // flank thickness
  const dome = rMax * 0.22 * prominence; // extra on top — the domed back
  const yCut = yMid - rMax * 0.28; // the skirt: covers the back and upper flanks, not the belly
  const flare = rMax * 0.18; // the rim lips outward over the legs

  const field = (x: number, y: number, z: number): number => {
    const up = Math.min(1, Math.max(0, (y - yCut) / (rMax * 1.4)));
    // inflate: thicker toward the crown; flare at the rim (just above the cut)
    const rim = Math.max(0, 1 - (y - yCut) / (rMax * 0.35));
    const t = t0 + dome * up * up + flare * rim;
    const body = fieldAt(prims, x, y, z) - t;
    const cut = yCut - y; // > 0 below the skirt → outside
    return body > cut ? body : cut;
  };
  const pad = rMax * 0.9 + 0.1;
  let xMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const n of trunk) {
    xMin = Math.min(xMin, n.pos[0] - n.radius * (n.scale?.[0] ?? 1));
    xMax = Math.max(xMax, n.pos[0] + n.radius * (n.scale?.[0] ?? 1));
    yMax = Math.max(yMax, n.pos[1] + n.radius * (n.scale?.[1] ?? 1));
  }
  const min = [xMin - pad, yCut - rMax * 0.1, zMin - pad];
  const max = [xMax + pad, yMax + pad, zMax + pad];
  const poly = polygonize(field, min, max, { res: SKIN_RES[quality] * 0.75, aoScale: rMax * 0.15 });
  return toGeometry(poly);
}
