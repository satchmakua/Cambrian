/**
 * The planet designer, in the new-game panel: a game's planet chosen as one of the planet types (the presets)
 * and moved on from slider by slider — its size, its land, its relief, how its land lies, how rugged it is,
 * its warmth and its rain, its seasons and its shallow seas — with a map of the planet the sliders make and
 * what it is like in numbers. The map is baked in a worker (world/planet/planetBaker.ts) as a slider is let
 * go, so the menu never stalls; the same worker hands the game its ground when it starts.
 */
import { useEffect, useRef, useState } from 'react';
import { DESIGN_RANGES, PLANET_PRESETS, onStep, presetOf, specOf, type DesignKey, type PlanetDesign } from '../../sim/planetDesign';
import type { PlanetFacts } from '../../world/planet/planetMap';

/** the map's size in pixels (drawn wider by the page) */
const MAP_W = 480;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number, unit = '') => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}${unit}`;
const band = (x: number, words: string[]) => words[Math.min(words.length - 1, Math.floor(x * words.length))];

/** each slider: its label, what it does, and its value in words */
const SLIDERS: { k: DesignKey; label: string; hint: string; say: (v: number, d: PlanetDesign) => string }[] = [
  { k: 'radius', label: 'Size', hint: 'The sea’s radius. A bigger world takes longer to fill.', say: (v, d) => `${v} bu · ${Math.round((4 * Math.PI * v * v * d.land) / 40000)} valleys of land` },
  { k: 'land', label: 'Land', hint: 'How much of the surface stands above the sea.', say: pct },
  { k: 'continents', label: 'Continents', hint: 'A few great lands, or many smaller ones and islands.', say: (v) => band(v, ['one great land', 'a few great lands', 'continents', 'many lands', 'islands']) },
  { k: 'relief', label: 'Relief', hint: 'How high the highest ground stands (the valley’s: about 14 bu).', say: (v) => `${v} bu` },
  { k: 'rugged', label: 'Ruggedness', hint: 'Rolling country, or ranges and deep valleys.', say: (v) => band(v, ['gentle', 'rolling', 'hilly', 'rugged', 'mountainous']) },
  { k: 'temperature', label: 'Temperature', hint: 'An ice world or a hothouse: the ice caps and the snow line.', say: (v) => signed(Math.round(v * 12), '°') },
  { k: 'wetness', label: 'Wetness', hint: 'Deserts or forests: how much rain the winds carry inland.', say: (v) => band((v + 1) / 2, ['deserts', 'dry', 'temperate', 'wet', 'rainforests']) },
  { k: 'tilt', label: 'Seasons', hint: 'How far the axis leans: none, the Earth’s, or harsh.', say: (v) => (v === 0 ? 'none' : v < 0.35 ? 'mild' : v <= 0.6 ? 'the Earth’s' : 'harsh') },
  { k: 'shelf', label: 'Shallow seas', hint: 'How far out the sea stays shallow, where the fish feed.', say: (v) => (v < 0.1 ? 'steep coasts' : v < 0.2 ? 'narrow shelves' : v < 0.4 ? 'shelves' : v < 0.7 ? 'wide shallows' : 'shallow seas') },
];

/** A slider that holds its value while dragged and gives it up when let go (a new planet each time). */
function Slider({ k, value, onCommit }: { k: DesignKey; value: number; onCommit: (v: number) => void }) {
  const r = DESIGN_RANGES[k];
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => v !== value && onCommit(onStep(k, v));
  return <input type="range" min={r.min} max={r.max} step={r.step} value={v} aria-label={k} onChange={(e) => setV(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />;
}

export function PlanetDesigner({ design, seed, onChange }: { design: PlanetDesign; seed: number; onChange: (d: PlanetDesign) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [facts, setFacts] = useState<PlanetFacts | null>(null);
  const [making, setMaking] = useState(true);
  const [failed, setFailed] = useState(false);
  const preset = presetOf(design);
  // the map: baked in the worker a moment after the design or the seed settles (a newer one replaces it)
  useEffect(() => {
    let live = true;
    setMaking(true);
    const t = setTimeout(() => {
      void import('../../world/planet/planetBaker')
        .then((m) => m.previewPlanet(specOf(seed, design), MAP_W))
        .then((p) => {
          if (!live) return;
          const c = canvas.current;
          const ctx = c?.getContext('2d');
          if (c && ctx) {
            c.width = p.width;
            c.height = p.width / 2;
            ctx.putImageData(new ImageData(new Uint8ClampedArray(p.map), p.width, p.width / 2), 0, 0);
          }
          setFacts(p.facts);
          setFailed(false);
          setMaking(false);
        })
        .catch((e: unknown) => {
          // (replaced by a newer map: that one says how it went)
          if (!live || (e instanceof Error && e.message === 'replaced')) return;
          setFailed(true);
          setMaking(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [design, seed]);
  const set = (k: DesignKey, v: number) => onChange({ ...design, [k]: v });
  return (
    <div className="planet-designer">
      <div className="planet-presets" role="radiogroup" aria-label="Planet type">
        {PLANET_PRESETS.map((p) => (
          <button key={p.id} role="radio" aria-checked={preset?.id === p.id} className={preset?.id === p.id ? 'active' : ''} title={p.blurb} onClick={() => onChange({ ...p.design })}>
            {p.title}
          </button>
        ))}
        {!preset && <span className="planet-own">your own</span>}
      </div>
      <div className={`planet-map${making ? ' making' : ''}`}>
        <canvas ref={canvas} width={MAP_W} height={MAP_W / 2} aria-label="A map of the planet" />
        {making && <span className="planet-note">Making the planet…</span>}
        {failed && !making && <span className="planet-note">The map could not be drawn here; the planet will be made when the game starts.</span>}
      </div>
      <p className="planet-facts">
        {preset ? <b>{preset.blurb} </b> : null}
        {facts && (
          <>
            {pct(facts.land)} land · {facts.grounds.slice(0, 4).map((g) => `${g.biome} ${pct(g.share)}`).join(', ')} · {facts.lakes} lakes
          </>
        )}
      </p>
      <div className="planet-sliders">
        {SLIDERS.map((s) => (
          <label key={s.k} className="planet-slider" title={s.hint}>
            <span className="planet-label">{s.label}</span>
            <Slider k={s.k} value={design[s.k]} onCommit={(v) => set(s.k, v)} />
            <span className="planet-val">{s.say(design[s.k], design)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
