/**
 * Mouth dispatcher (mouth overhaul) — the style band picks a build, so a lineage's mouth drifts
 * between forms as it evolves. Every variant is a surface-anchored module: geometry derives from
 * the mouth line / mouth ring traced onto the true skin (`mouthLine.ts`), so nothing floats.
 *
 *   herbivore · maw · fanged · underbite → jawed.tsx   (lips + gums + instanced teeth + gape)
 *   beak                                 → beak.tsx    (cere collar + hooked keratin halves)
 *   mandibles                            → mandibles.tsx (paired shear blades + serrations)
 *   sucker · lamprey                     → ring.tsx    (orifice lip + funnel + tooth rings)
 *   baleen                               → baleen.tsx  (fringe curtain in a heavy jaw line)
 *   proboscis · trunk                    → probe.tsx   (collared feeding tubes)
 */
import type { Phenotype } from '../../engine/grow';
import type { Carve } from '../bodyField';
import type { MeshFeature } from '../meshData';
import type { SkinSurface } from '../mouthLine';
import { mouthVariant } from '../partStyles';
import { JawedMouth, type JawedVariant } from './jawed';
import { RingMouth } from './ring';
import { BaleenMouth } from './baleen';
import { BeakMouth } from './beak';
import { MandiblesMouth } from './mandibles';
import { ProbeMouth } from './probe';

export function Mouth({
  f,
  dark,
  phenotype,
  carves,
  recessed,
  surface = 'kit',
  animate = false,
}: {
  f: MeshFeature;
  dark: number;
  phenotype: Phenotype;
  carves: readonly Carve[];
  recessed: boolean;
  surface?: SkinSurface;
  animate?: boolean;
}) {
  const v = mouthVariant(f.style);
  const shared = { f, phenotype, carves, recessed, surface, dark } as const;
  if (v === 'herbivore' || v === 'maw' || v === 'fanged') {
    // the old fanged band split hinged (style < 0.22) vs underbite — kept as a parameter flip
    const variant: JawedVariant = v === 'fanged' && f.style >= 0.22 ? 'underbite' : v;
    return <JawedMouth {...shared} variant={variant} animate={animate} />;
  }
  if (v === 'beak') return <BeakMouth {...shared} />;
  if (v === 'mandibles') return <MandiblesMouth {...shared} />;
  if (v === 'sucker' || v === 'lamprey') return <RingMouth {...shared} />;
  if (v === 'baleen') return <BaleenMouth {...shared} />;
  // proboscis · trunk
  return <ProbeMouth {...shared} />;
}
