/**
 * Style-band lookups (MORPHOLOGY §6) — the single source of truth that turns a part's
 * continuous `style` gene (0..1) into a discrete render variant. The renderer
 * (`CreatureMesh`) and the tests both read these, so "which mouth does style 0.3 give"
 * is defined in exactly one place. Pure — no three.js.
 */

/** The 8 mouth styles (§6.3), ordered so predators (maw/fanged) sit low where most priors aim. */
export type MouthVariant = 'maw' | 'fanged' | 'beak' | 'mandibles' | 'sucker' | 'lamprey' | 'baleen' | 'proboscis';
const MOUTHS: readonly MouthVariant[] = ['maw', 'fanged', 'beak', 'mandibles', 'sucker', 'lamprey', 'baleen', 'proboscis'];

/** Map a 0..1 style to one of the 8 mouth variants (equal 0.125 bands). */
export function mouthVariant(style: number): MouthVariant {
  return MOUTHS[bandIndex(style, MOUTHS.length)];
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
