/**
 * The breeder gallery (DESIGN §7): a 3×3 grid of mutant offspring of the current
 * parent. Click one → it becomes the next parent. This is the feel-good core loop.
 */
import { OffspringThumb } from './OffspringThumb';
import type { Genome } from '../engine/genome';

interface Props {
  offspring: Genome[];
  generation: number;
  onPick: (child: Genome) => void;
  onReroll: () => void;
}

export function OffspringGallery({ offspring, generation, onPick, onReroll }: Props) {
  return (
    <aside className="gallery">
      <div className="gallery-head">
        <span>
          Gen {generation} → {generation + 1}
        </span>
        <button className="reroll" onClick={onReroll} title="new litter from the same parent">
          ↻ new litter
        </button>
      </div>
      <p className="gallery-hint">Pick the offspring you like — it becomes the next parent.</p>
      <div className="grid">
        {offspring.map((g, i) => (
          <OffspringThumb key={`${generation}-${i}-${g.seed}`} genome={g} onPick={() => onPick(g)} />
        ))}
      </div>
    </aside>
  );
}
