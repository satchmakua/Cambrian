// Each block fails on HEAD (7494cb4..6c6bc26) and passes with diag13b/bird/bird.patch.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { grow } from '../../src/engine/grow';
import { genomeOfMorphotype } from '../../src/engine/random';
import type { Vec3 } from '../../src/engine/genome';
import { buildBeak, type BeakBuild } from '../../src/viewer/mouths/beak';
import { buildFeatheredWing, conformToSurface, shortWingLie, wingOpenSpan, FOLD_TUCK } from '../../src/viewer/wings';
import { surfacePrims } from '../../src/viewer/mouthLine';
import { fieldAt } from '../../src/viewer/bodyField';
import { coatMain, coatPattern } from '../../src/viewer/palette';
import { makeCreatureMaterial } from '../../src/viewer/creatureMaterial';
import { defaultGenome } from '../../src/engine/genome';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 29];
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** a swept tube's rings (10 vertices each, one per spine point): each ring's centre along the bill and its
 *  lowest (lo) or highest point across the bill's up, in units of the mouth's radius */
function rings(b: BeakBuild, g: THREE.BufferGeometry, n: number, lo: boolean): [number, number][] {
  const root = b.upperPath[0];
  const pos = g.getAttribute('position');
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let a = 0, e = lo ? Infinity : -Infinity;
    for (let j = 0; j < 10; j++) {
      const k = i * 10 + j;
      const v: Vec3 = [pos.getX(k) - root[0], pos.getY(k) - root[1], pos.getZ(k) - root[2]];
      a += (v[0] * b.dir[0] + v[1] * b.dir[1] + v[2] * b.dir[2]) / b.r / 10;
      const u = (v[0] * b.up[0] + v[1] * b.up[1] + v[2] * b.up[2]) / b.r;
      e = lo ? Math.min(e, u) : Math.max(e, u);
    }
    out.push([a, e]);
  }
  return out;
}
const at = (r: [number, number][], a: number) => {
  for (let i = 1; i < r.length; i++) if (a <= r[i][0]) return r[i - 1][1] + ((a - r[i - 1][0]) / (r[i][0] - r[i - 1][0])) * (r[i][1] - r[i - 1][1]);
  return NaN;
};

describe("a songbird's bill is shut", () => {
  it('its lower mandible lies under the upper to its tip: no daylight between them, no drooping lower half', () => {
    // (pitched down on its own line, the lower parted from the upper two thirds of the way along and ended
    // up to 0.14 of the mouth's radius below it: a gaping, cracked bill)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'bird'));
      const b = buildBeak(p, p.nodes.findIndex((n) => n.terminal === 'mouth'), [], false, 'hybrid')!;
      expect(b.hooked).toBe(false);
      const U = rings(b, b.upper, b.upperPath.length, true);
      const L = rings(b, b.lower, b.lowerPath.length, false);
      const a1 = L[L.length - 1][0];
      for (let k = 0; k <= 8; k++) {
        const a = a1 * (0.6 + 0.4 * (k / 8));
        expect(at(U, a) - at(L, a), `#${seed} gap at ${(a / a1).toFixed(2)} of the lower`).toBeLessThan(0.01);
      }
    }
  });
});

describe("a songbird's folded wing", () => {
  const base = new THREE.Color(0.3, 0.6, 0.5);
  const accent = new THREE.Color(0.1, 0.3, 0.3);
  it('wears the tone of the back it lies on, not the raw coat: its coverts no paler than 0.85 of it', () => {
    // (at the raw coat, against a back the countershading and the coat's recesses darken to ~0.6-0.8 of it,
    // the folded wing was a paler flat pad stuck on the flank)
    const w = buildFeatheredWing(1, 2, base, accent);
    const col = w.surface.getAttribute('color');
    let sum = 0, n = 0;
    for (let i = 7; i <= 32; i++) for (let j = 0; j <= 7; j++) {
      const k = i * 21 + j;
      sum += lum(col.getX(k), col.getY(k), col.getZ(k));
      n++;
    }
    expect(sum / n / lum(base.r, base.g, base.b)).toBeLessThan(0.85);
  });

  it('tucks its leading edge and its front end under the coat: a negative lift there, a dome in the middle', () => {
    // (riding the wrapping margin proud of the skin all round, its edge was a hard step — a pocket)
    const w = buildFeatheredWing(1, 2, base, accent);
    const lift = w.lift!;
    for (let i = 0; i <= 36; i++) expect(lift[i * 21], `leading edge at a=${(i / 72).toFixed(2)}`).toBeLessThan(-0.5 * FOLD_TUCK * 2);
    for (let j = 0; j <= 20; j++) expect(lift[j], `front end at b=${(j / 20).toFixed(2)}`).toBeLessThan(0.02);
    expect(Math.max(...Array.from(lift))).toBeGreaterThan(0.05);
  });

  it('lies down its back onto its tail: its tips end on the tail, not a third of the body past the rump', () => {
    // (laid level along a trunk that falls to its rump, its dark primaries stood 0.45-0.72 off the skin
    // behind the rump, two blades over a drooping tail)
    for (const seed of SEEDS) {
      const p = grow(genomeOfMorphotype(seed, 'bird'));
      const tipIdx = p.nodes.findIndex((n) => n.terminal && n.part?.kind === 'wing' && n.pos[0] > 0);
      const trunk = p.nodes.filter((n) => n.kind === 'spine' && (n.segment ?? 0) === 0);
      const { trunkLen, girth, gene } = wingOpenSpan(p, p.nodes[tipIdx].radius);
      const foldS = (trunkLen * 1.05 + girth * 0.9) * (0.85 + gene * 0.3);
      // (the anchor CreatureMesh's Wing gives a folded feathered wing)
      const shoulderZ = p.nodes[tipIdx].pos[2];
      let near = trunk[0];
      for (const n of trunk) if (Math.abs(n.pos[2] - shoulderZ) < Math.abs(near.pos[2] - shoulderZ)) near = n;
      const anchor = [near.pos[0] + near.radius * (near.scale?.[0] ?? 1) * 0.86, near.pos[1] + near.radius * 0.28, near.pos[2] + near.radius * 0.35];
      const lie = shortWingLie(p, 1, anchor, foldS)!;
      expect(lie, `#${seed}`).not.toBeNull();
      expect(lie.S).toBeLessThanOrEqual(foldS);
      const w = buildFeatheredWing(1, lie.S, coatMain(p.genomeRef.palette), coatPattern(p.genomeRef.palette), lie.axis);
      const prims = surfacePrims(p, 'hybrid');
      const field = (x: number, y: number, z: number) => fieldAt(prims, x, y, z);
      conformToSurface(w.surface, field, anchor, girth * 0.04, w.lift);
      const pos = w.surface.getAttribute('position');
      let far = 0;
      for (let i = 0; i < pos.count; i++) far = Math.max(far, field(pos.getX(i) + anchor[0], pos.getY(i) + anchor[1], pos.getZ(i) + anchor[2]));
      expect(far, `#${seed} farthest off the skin`).toBeLessThan(0.35);
    }
  });
});

describe("a flier's plumage", () => {
  const compile = () => {
    const g = defaultGenome();
    const mat = makeCreatureMaterial(g.palette, { ...g.covering, type: 'feathers' }, g.seed);
    const s = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    (mat.onBeforeCompile as (x: typeof s) => void)(s);
    mat.dispose();
    return s.fragmentShader;
  };
  it("shows its feathers' edges along its back alone: smooth down its breast, flanks and neck", () => {
    // (kept off the belly and the head alone, the edges ran in dark-rimmed arcs over the breast and up the
    // neck to the chin: fish scales)
    const f = compile();
    const m = f.match(/const float FEATHER_EDGE_Y = ([0-9.]+);/);
    expect(m).not.toBeNull();
    const y0 = Number(m![1]);
    expect(f).toContain('if (uShag < 0.5) plain = max(plain, 1.0 - smoothstep(FEATHER_EDGE_Y, FEATHER_EDGE_Y + 0.45, gNb.y) * (1.0 - smoothstep(0.2, 0.6, gNb.z)));');
    // the same arithmetic: how plain the plumage is for a skin normal (body space)
    const ss = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const plain = (n: Vec3) => Math.max(ss(0.1, -0.6, n[1]) * 0.7, 1 - ss(y0, y0 + 0.45, n[1]) * (1 - ss(0.2, 0.6, n[2])));
    expect(plain([0, 0.3, 0.95])).toBeGreaterThan(0.95); // the breast
    expect(plain([1, 0, 0])).toBe(1); // the flank
    expect(plain([0, 1, 0])).toBe(0); // the back
    expect(plain([0, 0.9, -0.4])).toBe(0); // the rump
  });

  it("lets a band back by degrees down a feathered neck: no hood edge round the throat", () => {
    const f = compile();
    expect(f).toContain('uHeadA.w * (uCover == 3 ? FEATHER_HOOD : 1.5)');
    const m = f.match(/const float FEATHER_HOOD = ([0-9.]+);/);
    expect(Number(m![1])).toBeGreaterThanOrEqual(2);
  });
});
