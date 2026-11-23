/**
 * Selection that is real — what a body's look and build cost it, or earn it, on the valley:
 *
 *   seen     how plainly it shows against the ground it stands on (its coat against the meadow, the wood,
 *            the sand, the rock, the lake — or the snow, in the depth of winter): a hunter spots a
 *            well-matched animal only nearer, and a well-matched hunter creeps nearer before it is seen
 *   showy    crests, frills, a bright coat and a bold pattern: a mate is drawn to them — and a hunter's eye
 *            as well
 *   warm     a coat of fur or feathers makes a body warm-blooded (traits.ts): it keeps going in the cold
 *            and the dark, and pays to keep warm through a hard winter — a small body more than a big one,
 *            its skin large for its bulk — and a little, under its coat, in a hot summer; bare, scaled and
 *            slimy bodies are cold-blooded, cheap to keep, and slow in the cold instead (motion.ts)
 *
 * Coats, crests and sizes all evolve (point mutations move the palette, the covering, the parts), so each
 * of these pulls the valley's lines somewhere: toward the colours of their ground, toward display where
 * mates choose and hunters are few, toward bulk where the winters bite. Pure.
 */
import type { Genome, SegmentGene } from '../engine/genome';
import type { Biome } from './terrain';
import { cellOf, climateOf, leverSnow, seasonal, type Creature, type World } from './model';
import { BIOME_COLOUR, SNOW_COLOUR } from './palette';
import { yearLook } from './seasonLook';
import type { Traits } from './traits';

type RGB = [number, number, number];

/** the ground's colours, as the scene paints them (the one palette: palette.ts) */
const GROUND = Object.fromEntries(Object.entries(BIOME_COLOUR).map(([b, c]) => [b, hex(c)])) as Record<Biome, RGB>;
const SNOW = hex(SNOW_COLOUR);

function hex(h: number): RGB {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}

/** HSL (each 0..1) to RGB, as three.js's Color.setHSL does it */
function hsl(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const COAT = new WeakMap<Genome, RGB>();
/** a body's coat colour (its first hue, at its saturation and lightness) */
function coatOf(g: Genome): RGB {
  let c = COAT.get(g);
  if (!c) COAT.set(g, (c = hsl(((g.palette.hueA % 1) + 1) % 1, Math.min(1, g.palette.sat), Math.min(1, Math.max(0, g.palette.light)))));
  return c;
}

/** a bold, broken pattern (stripes, spots, a mottle) breaks an outline up: it shows a little less */
const DISRUPTIVE = new Set(['stripes', 'bands', 'spots', 'mottle', 'reticulate']);

/** 0 (melts into the ground under it) … 1 (stands out against it): a creature's coat, now. */
export function conspicuity(w: World, c: Creature): number {
  const b = w.surface.biome(c);
  let g = GROUND[b];
  // (snow lies on the land in the depth of winter, not on the lake; on a planet, where its own winter is)
  if (b !== 'deep' && b !== 'shallow') {
    const local = w.surface.seasonsNow?.(w);
    const snow = local ? Math.max(local.snow[cellOf(w, c)], leverSnow(w)) : snowNow(w);
    if (snow > 0) g = [g[0] + (SNOW[0] - g[0]) * snow, g[1] + (SNOW[1] - g[1]) * snow, g[2] + (SNOW[2] - g[2]) * snow];
  }
  const coat = coatOf(c.genome);
  const d = Math.hypot(coat[0] - g[0], coat[1] - g[1], coat[2] - g[2]);
  const cov = c.genome.covering;
  const broken = DISRUPTIVE.has(cov.pattern) ? 1 - 0.3 * cov.patternContrast : 1;
  return Math.min(1, d * 2.2 * broken);
}

let SNOW_AT = -1, SNOW_V = 0;
function snowNow(w: World): number {
  const t = Math.floor(w.time);
  if (t !== SNOW_AT) {
    SNOW_AT = t;
    SNOW_V = Math.max(yearLook(w.time).snow, leverSnow(w));
  }
  return SNOW_V;
}

const SHOW = new WeakMap<Genome, number>();
/** 0 … 1: how showy a body is — its crests and frills, how bright its coat, how bold its pattern. */
export function showiness(g: Genome): number {
  let v = SHOW.get(g);
  if (v !== undefined) return v;
  let crests = 0;
  for (let s: SegmentGene | undefined = g.body; s; s = s.child) for (const a of s.appendages) if (a.kind === 'crest' || a.kind === 'frill') crests += Math.min(1.5, a.length);
  const bright = Math.min(1, g.palette.sat) * (1 - Math.abs(Math.min(1, Math.max(0, g.palette.light)) - 0.55) * 1.6);
  const bold = g.covering.pattern === 'plain' ? 0 : g.covering.patternContrast;
  v = Math.min(1, 0.45 * Math.min(1, crests / 1.5) + 0.35 * Math.max(0, bright) + 0.2 * bold);
  SHOW.set(g, v);
  return v;
}

/**
 * The cost of the weather to a warm-blooded body, as a share of its resting burn: the cold of a hard
 * winter, the more the smaller it is (heat leaves through the skin, and a small body has more skin for its
 * bulk: a deer's a tenth of its burn again, a mouse's a seventh, a songbird's a sixth — at a fifth for a
 * mouse, the rodents starved out of a valley a winter at a time); and a summer's heat, a little, under the
 * coat of a big one. Nothing for the cold-blooded (they slow in the cold instead: motion.ts). On a planet,
 * the cold and the heat where the body is (`at`): its hemisphere's season, and its latitude's climate.
 */
export function weatherCost(t: Traits, w: World, at?: Creature): number {
  if (!t.endotherm) return 0;
  const local = at ? w.surface.seasonsNow?.(w) : undefined;
  const k = local && at ? cellOf(w, at) : -1;
  const cold = local ? local.cold[k] : climateOf(w).cold;
  const heat = local ? local.heat[k] : seasonal(w.time, [0.15, 1, 0.1, 0]) * Math.max(0, 1 + 0.6 * w.levers.warmth);
  const size = Math.cbrt(Math.max(0.05, t.mass));
  return (0.13 * cold) / size + 0.06 * heat * size;
}
