/**
 * The main menu's backdrop: one creature on the turntable.
 *
 * It lives in its own file so the menu can fetch it after it is up (React.lazy): with it come the 3D
 * library and the creature renderer — most of the game's code — and the menu's buttons must not wait
 * for those, nor for anything the stage then does.
 */
import { useMemo } from 'react';
import type { Genome } from '../../engine/genome';
import { grow } from '../../engine/grow';
import { CreatureViewer } from '../../viewer/CreatureViewer';
import type { SkinMode } from '../store';

/** (Grown here, inside the menu's boundary.) `paused` holds it still under a panel; `onSlow` says its
 *  frames were measured slow — the menu then does without it. */
export default function MenuStage({ genome, skinMode, paused, onSlow }: { genome: Genome; skinMode: SkinMode; paused: boolean; onSlow: () => void }) {
  const phenotype = useMemo(() => grow(genome), [genome]);
  return <CreatureViewer phenotype={phenotype} skinMode={skinMode} backdrop paused={paused} onSlow={onSlow} />;
}
