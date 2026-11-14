/**
 * Level of detail for the World's creatures, from their distance to the camera: how much of a body's
 * detail is drawn, and which of its skins it wears. Pure (the actors poll it — see Actors.tsx).
 */
import type { Detail } from '../viewer/CreatureMesh';

export const LOD_FULL = 24; // bu from the camera: full detail inside this
export const LOD_LITE = 62; // simplified features inside this; silhouette only beyond
/** The distant skin's own floor. The creature-detail option pulls the feature bands in (to 55% on
 *  Low) — but a body is not put in its coarse skin any nearer than this share of the full band: at
 *  half the distance it is still a couple of hundred pixels long on screen, and the coarse skin's
 *  thickened limbs show plainly. */
export const FAR_SKIN_K = 0.9;

/** What the camera's distance asks of an actor: how much of its detail to draw, and whether it is far
 *  enough off to wear the distant skin. */
export interface Lod {
  detail: Detail;
  distant: boolean;
}

/** The level of detail at distance `d` with the bands scaled by `k` (the creature-detail option).
 *  `was`: the level held now — a finer level is kept until 15% past its band's edge, so an actor at
 *  an edge does not flicker (nor order a skin on every step). */
export function lodAt(d: number, k: number, was: Lod | null): Lod {
  let detail: Detail = d < LOD_FULL * k ? 'full' : d < LOD_LITE * k ? 'lite' : 'none';
  const farAt = LOD_LITE * Math.max(k, FAR_SKIN_K);
  let distant = d >= farAt;
  if (was) {
    if (was.detail === 'full' && detail !== 'full' && d < LOD_FULL * k * 1.15) detail = 'full';
    if (was.detail === 'lite' && detail === 'none' && d < LOD_LITE * k * 1.15) detail = 'lite';
    if (!was.distant && distant && d < farAt * 1.15) distant = false;
  }
  return { detail, distant };
}
