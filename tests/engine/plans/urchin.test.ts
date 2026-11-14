import { describe, it, expect } from 'vitest';
import { grow, QUILL_STYLE } from '../../../src/engine/grow';
import { genomeOfMorphotype, MORPHOTYPE_IDS } from '../../../src/engine/random';
import { buildMeshData } from '../../../src/viewer/meshData';
import { buildFieldPrims, fieldAt } from '../../../src/viewer/bodyField';
import { quillGeometry, quillNodes, quillsOf } from '../../../src/viewer/quills';
import { buildSmoothGeometry } from '../../../src/viewer/smoothSkin';
import * as THREE from 'three';

const SEEDS = Array.from({ length: 10 }, (_, i) => i + 1);
const urchin = (seed: number) => grow(genomeOfMorphotype(seed, 'urchin'));
const len = (q: { root: number[]; tip: number[] }) => Math.hypot(q.tip[0] - q.root[0], q.tip[1] - q.root[1], q.tip[2] - q.root[2]);

describe('urchin', () => {
  it('bristles all over: long primaries and shorter secondaries of the same shape, nine rings of them', () => {
    // (five sparse rings of rods left bare ball showing between them: studded, not spiny)
    for (const seed of SEEDS) {
      const p = urchin(seed);
      const g = p.genomeRef;
      const qs = quillsOf(p);
      expect(qs.length, `#${seed}`).toBe(9 * g.radialCount);
      const ls = qs.map(len).sort((a, b) => a - b);
      const short = ls.slice(0, 4 * g.radialCount);
      const long = ls.slice(4 * g.radialCount);
      // two families: every secondary under two-thirds of every primary
      expect(Math.max(...short) / Math.min(...long), `#${seed}`).toBeLessThan(0.8);
      expect(Math.min(...short) / Math.max(...long), `#${seed}`).toBeGreaterThan(0.25);
      // the primaries about as long as the ball's radius, or longer
      const body = p.nodes[0];
      expect(Math.min(...long) / body.radius, `#${seed}`).toBeGreaterThan(0.85);
    }
  });

  it('each spine is one smooth cone from its root to a point: not a skinned rod with a dark cap', () => {
    // (grown as any part, each spine was a chain of capsules — beaded — ending in a claw drawn as a
    // flared dark disc: a nail in a pincushion, a naval mine)
    for (const seed of SEEDS) {
      const p = urchin(seed);
      const quills = quillNodes(p);
      const md = buildMeshData(p);
      // none of a quill's nodes is a capsule, a sphere or a feature (no claw cap)
      for (const e of md.edges) expect(quills.has(e.b), `#${seed} edge`).toBe(false);
      for (const i of md.bodySpheres) expect(quills.has(i), `#${seed} sphere`).toBe(false);
      for (const f of md.features) expect(quills.has(f.idx), `#${seed} feature`).toBe(false);
      expect(md.features.some((f) => f.type === 'claw'), `#${seed} no caps`).toBe(false);
      // …nor in the skin: half way along each quill there is no surface
      const prims = buildFieldPrims(p, 'hybrid');
      for (const q of quillsOf(p)) {
        const mid = [0, 1, 2].map((k) => (q.root[k] + q.tip[k]) / 2);
        expect(fieldAt(prims, mid[0], mid[1], mid[2]), `#${seed} bare`).toBeGreaterThan(q.r);
      }
      // the cones: one mesh, its vertices out to every point, the point a sixth of the root's girth
      const geo = quillGeometry(p)!;
      const pos = geo.getAttribute('position');
      expect(pos.count, `#${seed}`).toBe(quillsOf(p).length * 4 * 9);
      geo.computeBoundingBox();
      for (const q of quillsOf(p)) {
        for (let k = 0; k < 3; k++) {
          expect(q.tip[k]).toBeGreaterThanOrEqual(geo.boundingBox!.min.getComponent(k) - 1e-6);
          expect(q.tip[k]).toBeLessThanOrEqual(geo.boundingBox!.max.getComponent(k) + 1e-6);
        }
      }
      geo.dispose();
    }
  });

  it('its test is a low dome, round seen from above — and nothing hangs from its underside', () => {
    // (a ball as tall as it was wide, squeezed front to back — and under it, the links to its eyes and
    // mouth skinned into a bulb: an upside-down pear, its lower lobe through the floor)
    for (const seed of SEEDS) {
      const p = urchin(seed);
      const body = p.nodes[0];
      const [sx, sy, sz] = body.scale ?? [1, 1, 1];
      expect(sy / Math.max(sx, sz), `#${seed} low`).toBeLessThan(0.75);
      expect(Math.abs(sx - sz) / Math.max(sx, sz), `#${seed} round`).toBeLessThan(0.06);
      // the skin's underside is the test's own: no lower than the dome's bottom
      const pos = buildSmoothGeometry(p, true).getAttribute('position');
      let low = Infinity;
      for (let v = 0; v < pos.count; v++) low = Math.min(low, pos.getY(v));
      expect(low, `#${seed} underside`).toBeGreaterThan(body.pos[1] - body.radius * sy * 1.12);
    }
  });

  it('each spine pales from a dark root to its point, each its own shade', () => {
    // (one flat dark colour for every spine read as a cushion of nails)
    const p = urchin(3);
    const geo = quillGeometry(p, 8, new THREE.Color(0.1, 0.05, 0.15), new THREE.Color(0.8, 0.75, 0.85))!;
    const pos = geo.getAttribute('position');
    const col = geo.getAttribute('color');
    expect(col).toBeDefined();
    const per = 4 * 9; // a lathe's vertices per spine (see the cone test)
    const lum = (v: number) => col.getX(v) + col.getY(v) + col.getZ(v);
    const shades = new Set<string>();
    for (let q = 0; q < quillsOf(p).length; q++) {
      const root = lum(q * per);
      const tip = lum(q * per + 3); // the lathe runs root → point along each meridian
      expect(tip, `spine ${q}`).toBeGreaterThan(root * 1.5);
      shades.add(root.toFixed(3));
    }
    expect(shades.size).toBeGreaterThan(5);
    expect(pos.count).toBe(col.count);
  });

  it('rests on its spines, not on a fringe of tube feet', () => {
    // (two links of the shortest limb a gene can grow, under the ball, they stood it on dark stilts)
    for (const seed of SEEDS) {
      const g = genomeOfMorphotype(seed, 'urchin');
      expect(g.body.appendages.some((a) => a.kind === 'tentacle'), `#${seed}`).toBe(false);
    }
  });

  it('has no face on top: small eyes and a mouth underneath', () => {
    // (a fleshy ring of a mouth on top, with teeth standing out of it, made the urchin an open bowl)
    for (const seed of SEEDS) {
      const p = urchin(seed);
      const body = p.nodes[0];
      for (const n of p.nodes.filter((x) => x.terminal === 'eye' || x.terminal === 'mouth')) {
        expect(n.pos[1], `#${seed} ${n.terminal}`).toBeLessThan(body.pos[1] - 0.4 * body.radius * (body.scale?.[1] ?? 1));
      }
    }
  });

  it('no other plan grows a quill, and a part with no claw tip or more than two links is never one', () => {
    for (const id of MORPHOTYPE_IDS) {
      if (id === 'urchin') continue;
      for (let seed = 1; seed <= 8; seed++) expect(quillsOf(grow(genomeOfMorphotype(seed, id))).length, `${id} #${seed}`).toBe(0);
    }
    // a sea star's arm bred into the quill band keeps its skin: it has no claw tip
    const g = genomeOfMorphotype(3, 'starfish');
    for (const a of g.body.appendages) if (a.kind === 'spine') a.style = QUILL_STYLE + 0.05;
    const star = grow(g);
    expect(quillNodes(star).size).toBe(0);
  });

  it("wears one colour, mottled in its own hue — never banded across in a second, clashing one", () => {
    // (banded across in a complementary hue, a small round test was a Christmas bauble, a billiard ball:
    // steel-blue on one side, orange on the other)
    const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
    let kin = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = genomeOfMorphotype(seed, 'urchin');
      expect(['mottle', 'plain'], `#${seed}`).toContain(g.covering.pattern);
      // (a rare vivid morph keeps a hue of its own; the rest mark in their own hue, or umber)
      if (g.palette.hueA < 0.6 || g.palette.hueA > 0.95) continue;
      const umber = g.palette.hueB >= 0.05 && g.palette.hueB <= 0.11;
      expect(gap(g.palette.hueA, g.palette.hueB) <= 0.07 || umber, `#${seed} markings in its own hue`).toBe(true);
      kin++;
    }
    expect(kin).toBeGreaterThan(25);
  });
});
