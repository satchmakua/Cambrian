/**
 * Style-band lookups (MORPHOLOGY §6) — the single source of truth that turns a part's
 * continuous `style` gene (0..1) into a discrete render variant. The renderer
 * (`CreatureMesh`) and the tests both read these, so "which mouth does style 0.3 give"
 * is defined in exactly one place. Pure — no three.js.
 */

/**
 * The 10 mouth styles (§6.3 + herbivore/trunk). Non-uniform bands so the original styles keep their
 * positions: a thin **herbivore** slice splits off the bottom of the maw range, and a **trunk** slice
 * the top — the rest (fanged/beak/mandibles/sucker/lamprey) are unchanged, so the priors barely move.
 */
export type MouthVariant =
  | 'herbivore'
  | 'maw'
  | 'fanged'
  | 'beak'
  | 'mandibles'
  | 'sucker'
  | 'lamprey'
  | 'baleen'
  | 'proboscis'
  | 'trunk';

export function mouthVariant(style: number): MouthVariant {
  const s = style < 0 ? 0 : style > 1 ? 1 : style;
  if (s < 0.06) return 'herbivore'; // soft grazing mouth, blunt incisors, no fangs
  if (s < 0.125) return 'maw'; // a toothed open maw
  if (s < 0.25) return 'fanged'; // maw + tusks/fangs (predator)
  if (s < 0.375) return 'beak'; // hard cones (bird/turtle/cephalopod)
  if (s < 0.5) return 'mandibles'; // side pincers (insect/arachnid)
  if (s < 0.625) return 'sucker'; // a suction ring
  if (s < 0.75) return 'lamprey'; // concentric rasping tooth rings
  if (s < 0.85) return 'baleen'; // a fringed filter slot
  if (s < 0.93) return 'proboscis'; // a thin feeding tube
  return 'trunk'; // a long drooping prehensile trunk
}

/** The 5 eye styles (§6.2). 'stalked' is structural (a multi-segment eyestalk), not a tip band. */
export type EyeVariant = 'round' | 'beady' | 'slit' | 'compound' | 'glowing';
const EYES: readonly EyeVariant[] = ['round', 'beady', 'slit', 'compound', 'glowing'];

export function eyeVariant(style: number): EyeVariant {
  return EYES[bandIndex(style, EYES.length)];
}

/** The 3 ear shapes (§6.4). */
export type EarVariant = 'pointed' | 'leaf' | 'round';
const EARS: readonly EarVariant[] = ['pointed', 'leaf', 'round'];

export function earVariant(style: number): EarVariant {
  return EARS[bandIndex(style, EARS.length)];
}

/** Clamp style to [0,1) and split into `n` equal bands. */
function bandIndex(style: number, n: number): number {
  const s = style < 0 ? 0 : style > 0.999999 ? 0.999999 : style;
  return Math.min(n - 1, Math.floor(s * n));
}
