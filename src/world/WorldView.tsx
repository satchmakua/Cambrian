/**
 * The World screen — the ecosystem in 3D with a naturalist's HUD over it:
 *
 *   top bar     day & clock, play/pause and time-warp, release controls, back to breeding
 *   left        the census: every living species (colour, diet, count) + a population chart
 *   right       the selected creature: what it is doing, its needs (energy / health / fatigue /
 *               age), its traits as read off its body, and buttons to follow it with the camera or
 *               take it home to the breeder
 *   bottom      the field journal: births, kills, starvation, speciation, extinction as they happen
 */
import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Genome } from '../engine/genome';
import { WorldScene } from './WorldScene';
import { TreeOfLife } from './TreeOfLife';
import { useWorldUi, getWorld, populate, strangerGenome, bumpVersion, type Snapshot } from './worldStore';
import { stepWorld, type HistorySample } from '../sim/world';

const SPEEDS = [1, 4, 16, 48];
let DEV_WARMED = false;

const ACTION_LABEL: Record<string, string> = {
  wander: 'wandering',
  graze: 'grazing',
  forage: 'eating fruit',
  scavenge: 'going for a carcass',
  filter: 'filter-feeding',
  hunt: 'hunting',
  flee: 'fleeing!',
  sleep: 'asleep',
  mate: 'courting',
  eat: 'feeding on a kill',
};

function clock(phase: number): string {
  // phase 0 = dawn (6:00), 0.25 = noon, 0.5 = dusk (18:00)
  const hours = (6 + phase * 24) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hueCss(h: number, l = 58): string {
  return `hsl(${Math.round(h * 360)} 62% ${l}%)`;
}

function PopulationChart({ history, species }: { history: HistorySample[]; species: Snapshot['species'] }) {
  const W = 260, H = 92;
  const paths = useMemo(() => {
    if (history.length < 2) return [];
    const ids = species.slice(0, 8).map((s) => s.id);
    let max = 4;
    for (const h of history) for (const id of ids) max = Math.max(max, h.pops[id] ?? 0);
    const t0 = history[0].t, t1 = history[history.length - 1].t || t0 + 1;
    return ids.map((id) => {
      const sp = species.find((s) => s.id === id)!;
      const d = history
        .map((h, i) => {
          const x = ((h.t - t0) / Math.max(1, t1 - t0)) * W;
          const y = H - ((h.pops[id] ?? 0) / max) * (H - 4) - 2;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join('');
      return { id, d, color: hueCss(sp.hue) };
    });
  }, [history, species]);
  return (
    <svg className="pop-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
      {paths.map((p) => (
        <path key={p.id} d={p.d} fill="none" stroke={p.color} strokeWidth={1.6} strokeLinejoin="round" />
      ))}
    </svg>
  );
}

function Bar({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div className="need">
      <span>{label}</span>
      <span className="need-bar">
        <i style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, background: color }} />
      </span>
    </div>
  );
}

export function WorldView({ founder, onExit, onAdopt }: { founder: Genome; onExit: () => void; onAdopt: (g: Genome) => void }) {
  const running = useWorldUi((s) => s.running);
  const speed = useWorldUi((s) => s.speed);
  const follow = useWorldUi((s) => s.follow);
  const snap = useWorldUi((s) => s.snapshot);
  const emotes = useWorldUi((s) => s.emotes);
  // (dev: ?tree=1 opens it, for inspection screenshots)
  const [showTree, setShowTree] = useState(() => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('tree') === '1');
  const { setRunning, setSpeed, setFollow, setEmotes, select, reset, releaseGenome, refresh } = useWorldUi.getState();

  // first visit: populate the starter ecosystem (+ the breeder's creature)
  useEffect(() => {
    const w = getWorld();
    if (w.creatures.length === 0 && w.species.length === 0) {
      populate(w, founder);
    }
    // Dev/headless: ?warm=SECONDS fast-forwards the sim; ?follow=KIND selects + follows the first
    // creature whose species name contains KIND (or any, with follow=1; one in flight, with
    // follow=aloft) — for inspection screenshots.
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search);
      // (once per page: StrictMode runs this effect twice in dev, which doubled the warm-up)
      const warm = DEV_WARMED ? 0 : Number(q.get('warm') ?? 0);
      DEV_WARMED = true;
      for (let i = 0; i < warm * 20; i++) stepWorld(w);
      const f = q.get('follow');
      if (f) {
        // follow=aloft: the first creature on the wing
        const sp = f === 'aloft' ? undefined : w.species.find((x) => f === '1' || x.name.includes(f) || x.kind.includes(f));
        const c = w.creatures.find((x) => (f === 'aloft' ? x.alt > 1 : sp ? x.species === sp.id : true));
        if (c) {
          select(c.id);
          setFollow(true);
        }
      }
      if (q.get('paused') === '1') setRunning(false);
      bumpVersion();
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sel = snap?.selected ?? null;
  return (
    <div className="world">
      <Canvas className="world-canvas" shadows dpr={[1, 1.75]} camera={{ position: [40, 38, 70], fov: 45, near: 0.2, far: 1200 }} gl={{ preserveDrawingBuffer: import.meta.env.DEV }}>
        <WorldScene />
      </Canvas>

      <header className="world-bar">
        <h1>Cambrian</h1>
        <nav className="tabs">
          <button onClick={onExit}>Breed</button>
          <button className="active">World</button>
        </nav>
        {snap && (
          <div className="clock">
            <b>Day {snap.day}</b> <span className="season">{snap.season}</span> <span>{clock(snap.phase)}</span> <span className="sky">{snap.night ? '☾ night' : '☀ day'}</span>
          </div>
        )}
        <div className="transport">
          <button onClick={() => setRunning(!running)}>{running ? '❚❚' : '▶'}</button>
          {SPEEDS.map((s) => (
            <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <div className="releases">
          <button className={emotes ? 'active' : ''} onClick={() => setEmotes(!emotes)} title="mood icons over the creatures: asleep, courting, alarmed, hunting">moods</button>
          <button onClick={() => releaseGenome(founder, 6)} title="release six of the creature you're breeding">+ your creature</button>
          <button onClick={() => releaseGenome(strangerGenome((Date.now() * 2654435761) >>> 0), 6)} title="release six of a random new species">+ a stranger</button>
          <button onClick={() => reset((Date.now() >>> 0) % 100000, founder)} title="a fresh world">new world</button>
        </div>
      </header>

      {snap && (
        <aside className="census">
          <h3>
            Census <span>{snap.pop} alive</span>
            <button className={`tol-toggle${showTree ? ' active' : ''}`} onClick={() => setShowTree(!showTree)} title="every species the world has known, as a branching tree through time">tree of life</button>
          </h3>
          <PopulationChart history={snap.history} species={snap.species} />
          <ul>
            {snap.species.slice(0, 14).map((s) => (
              <li key={s.id} className={s.extinct ? 'extinct' : ''}>
                <i style={{ background: hueCss(s.hue) }} />
                <span className="sp-name">{s.name}</span>
                <span className="sp-diet">{s.diet}</span>
                <span className="sp-n">{s.extinct ? '†' : s.alive}</span>
              </li>
            ))}
          </ul>
          <div className="tally">
            <span>{snap.tally.births} born</span>
            <span>{snap.tally.kills} killed</span>
            <span>{snap.tally.starvation} starved</span>
            <span>{snap.tally.oldAge} old age</span>
            <span>{snap.tally.speciations} new species</span>
          </div>
        </aside>
      )}

      {sel && (
        <aside className="critter">
          <div className="critter-head">
            <h3>{sel.species}</h3>
            <button onClick={() => select(null)} title="deselect">✕</button>
          </div>
          <p className="doing">
            {sel.adult ? 'adult' : 'juvenile'} · gen {sel.generation} · <b>{ACTION_LABEL[sel.action] ?? sel.action}{sel.flying ? ' · on the wing' : ''}</b>
          </p>
          <Bar label="energy" v={sel.energy} color="#e0b84f" />
          <Bar label="health" v={sel.health} color="#e06a5f" />
          <Bar label="rested" v={1 - sel.fatigue} color="#7f9be0" />
          <Bar label="age" v={sel.age} color="#9a9a9a" />
          <dl className="kv">
            <dt>diet</dt><dd>{sel.traits.diet} ({sel.traits.mouth})</dd>
            <dt>moves</dt><dd>{sel.traits.locomotion}{sel.traits.flies ? ' + flight' : ''}, {sel.traits.habitat}</dd>
            <dt>speed</dt><dd>{sel.traits.speed.toFixed(1)} / {sel.traits.sprint.toFixed(1)} bu/s</dd>
            <dt>vision</dt><dd>{sel.traits.vision.toFixed(0)} bu{sel.traits.nocturnal ? ', nocturnal' : ''}</dd>
            <dt>bite</dt><dd>{sel.traits.attack.toFixed(1)}</dd>
            <dt>armour</dt><dd>{Math.round(sel.traits.defense * 100)}%</dd>
            <dt>mass</dt><dd>{sel.traits.mass.toFixed(2)}</dd>
            <dt>offspring</dt><dd>{sel.children}{sel.kills ? ` · ${sel.kills} kills` : ''}</dd>
          </dl>
          <div className="critter-actions">
            <button className={follow ? 'active' : ''} onClick={() => setFollow(!follow)}>{follow ? 'following' : 'follow'}</button>
            <button onClick={() => onAdopt(sel.genome)} title="make this creature the parent in the breeder">take home</button>
          </div>
        </aside>
      )}

      {snap && showTree && (
        <TreeOfLife
          tree={snap.tree}
          now={snap.time}
          onClose={() => setShowTree(false)}
          onPick={(id) => {
            const c = getWorld().creatures.find((x) => x.species === id && x.alive);
            if (c) {
              select(c.id);
              setFollow(true);
            }
          }}
        />
      )}

      {snap && (
        <footer className="journal">
          {snap.events.slice(-6).reverse().map((e, i) => (
            <span key={`${e.t}-${i}`} className={`ev ev-${e.kind}`}>
              <b>D{Math.floor(e.t / 240) + 1}</b> {e.text}
            </span>
          ))}
        </footer>
      )}
    </div>
  );
}
