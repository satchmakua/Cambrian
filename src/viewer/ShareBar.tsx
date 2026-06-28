/**
 * Share / import (DESIGN §7): shows the current creature's `CAM1:` string. Copy it to
 * share; paste a different one and hit Load to regrow someone else's beast exactly.
 */
import { useEffect, useState } from 'react';
import { encodeGenome } from '../engine/share';
import type { Genome } from '../engine/genome';

export function ShareBar({ genome, onImport }: { genome: Genome; onImport: (s: string) => void }) {
  const current = encodeGenome(genome);
  const [text, setText] = useState(current);
  const [status, setStatus] = useState<string | null>(null);

  // resync when the creature changes (promote / select / new / import)
  useEffect(() => {
    setText(encodeGenome(genome));
    setStatus(null);
  }, [genome]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied to clipboard');
    } catch {
      setStatus('Copy failed — select the text and copy manually');
    }
  };

  const load = () => {
    try {
      onImport(text);
      setStatus('Loaded ✓');
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const changed = text.trim() !== current;

  return (
    <div className="share">
      <div className="share-row">
        <label>genome string (CAM1)</label>
        {status && <span className="share-status">{status}</span>}
      </div>
      <textarea
        className="share-text"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      <div className="share-actions">
        <button onClick={copy}>Copy</button>
        <button onClick={load} disabled={!changed} title="regrow the pasted creature as a new lineage">
          Load
        </button>
      </div>
    </div>
  );
}
