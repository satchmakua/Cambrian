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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Genome } from '../engine/genome';
import { WorldScene } from './WorldScene';
import { TreeOfLife } from './TreeOfLife';
import { useWorldUi, getWorld, populate, strangerGenome, bumpVersion, autosave, downloadWorld, type Snapshot } from './worldStore';
import { DAY_LENGTH, YEAR_DAYS, stepWorld, type HistorySample } from '../sim/world';
import { spell, weatherAt } from '../sim/weather';

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

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "a rodent", "an ungulate" */
function an(name: string): string {
  return (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;
}

/** The lower-third line for documentary mode: what the subject is doing, and to whom. */
function narrate(c: NonNullable<Snapshot['selected']>): string {
  const a = c.about;
  switch (c.action) {
    case 'hunt':
      return a ? `stalks ${an(a)}${c.flying ? ' from the air' : ''}` : 'is on the hunt';
    case 'flee':
      return a ? `bolts from ${an(a)}${c.flying ? ', taking to the air' : ''}` : 'runs for its life';
    case 'mate':
      return 'courts a mate';
    case 'eat':
      return a ? `feeds on the ${a} it brought down` : 'feeds on its kill';
    case 'scavenge':
      return a ? `goes for ${an(a)} carcass` : 'scavenges';
    case 'sleep':
      return 'sleeps';
    case 'graze':
      return 'grazes the meadow';
    case 'forage':
      return c.flying ? 'flies in to a fruiting bush' : 'strips a bush of fruit';
    case 'filter':
      return 'sieves the shallows';
    default:
      return c.flying ? 'is on the wing' : c.adult ? 'roams' : 'keeps close to its parent';
  }
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
  const documentary = useWorldUi((s) => s.documentary);
  const sound = useWorldUi((s) => s.sound);
  // (dev: ?tree=1 opens it, for inspection screenshots)
  const [showTree, setShowTree] = useState(() => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('tree') === '1');
  const { setRunning, setSpeed, setFollow, setEmotes, setDocumentary, setSound, select, reset, open, releaseGenome, refresh, fastForward, stopFastForward, dismissChronicle } = useWorldUi.getState();
  const ff = useWorldUi((s) => s.ff);
  const chron = useWorldUi((s) => s.chronicle);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const openFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      open(await f.text());
      setNotice(`Opened ${f.name}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'That file is not a saved world.');
    }
  };

  // the world is kept in the browser: every minute, and whenever the page is hidden or left
  useEffect(() => {
    const t = setInterval(autosave, 60_000);
    const hide = () => document.visibilityState === 'hidden' && autosave();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', autosave);
    return () => {
      clearInterval(t);
      autosave();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', autosave);
    };
  }, []);

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
      // follow=aloft: the first creature on the wing; follow=courting / stalking: run on (up to ten
      // minutes) until a pair is mid-display, or a hunter is creeping up on something
      const wanted: Record<string, (x: (typeof w.creatures)[number]) => boolean> = {
        aloft: (x) => x.alt > 1,
        courting: (x) => x.action === 'mate' && x.courtT > 1.2,
        stalking: (x) => x.action === 'hunt' && x.chaseT <= 0 && x.alt <= 0.1,
      };
      const special = f ? wanted[f] : undefined;
      if (special && f !== 'aloft') for (let i = 0; i < 12000 && !w.creatures.some(special); i++) stepWorld(w);
      if (f) {
        const sp = special ? undefined : w.species.find((x) => f === '1' || x.name.includes(f) || x.kind.includes(f));
        const c = w.creatures.find((x) => (special ? special(x) : sp ? x.species === sp.id : true));
        if (c) {
          select(c.id);
          setFollow(true);
        }
      }
      // wx=rain|snow: jump the clock to the middle of the next such spell (to inspect the weather)
      const wx = q.get('wx');
      if (wx === 'rain' || wx === 'snow') {
        for (let k = Math.floor(w.time / spell()); k < 2000; k++) {
          const sky = weatherAt(w.seed, (k + 0.5) * spell());
          if (k % 2 === 0 && sky.rain > 0.5 && sky.snow === (wx === 'snow')) { // (an even spell is centred on noon)
            w.time = (k + 0.5) * spell();
            break;
          }
        }
      }
      if (q.get('paused') === '1') setRunning(false);
      if (q.get('doc') === '1') setDocumentary(true);
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
            <b>Day {snap.day}</b> <span className="season">{snap.season}</span>{snap.weather && <span className="weather">{snap.weather === 'overcast' ? '☁' : snap.weather.includes('snow') ? '❄' : '☂'} {snap.weather}</span>} <span>{clock(snap.phase)}</span> <span className="sky">{snap.night ? '☾ night' : '☀ day'}</span>
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
        <div className="skip" title="fast-forward: the world runs on at full speed, then you see what happened">
          <button disabled={!!ff} onClick={() => fastForward(DAY_LENGTH, 'a day')}>⏩ day</button>
          <button disabled={!!ff} onClick={() => fastForward(DAY_LENGTH * 3, 'a season')}>season</button>
          <button disabled={!!ff} onClick={() => fastForward(DAY_LENGTH * YEAR_DAYS, 'a year')}>year</button>
        </div>
        <div className="releases">
          <button className={sound ? 'active' : ''} onClick={() => setSound(!sound)} title="synthesized wind, birdsong and crickets, and the creatures' own calls">{sound ? '♪ sound' : '♪ sound off'}</button>
          <button className={documentary ? 'active' : ''} onClick={() => setDocumentary(!documentary)} title="documentary mode: the camera finds the most interesting things happening and follows them">▶ documentary</button>
          <button className={emotes ? 'active' : ''} onClick={() => setEmotes(!emotes)} title="mood icons over the creatures: asleep, courting, alarmed, hunting">moods</button>
          <Menu label="+ release" title="release new animals into the valley">
            <button onClick={() => releaseGenome(founder, 6)} title="release six of the creature you're breeding">six of your creature</button>
            <button onClick={() => releaseGenome(strangerGenome((Date.now() * 2654435761) >>> 0), 6)} title="release six of a random new species">six strangers</button>
          </Menu>
          <Menu label="world ▾" title="new, save and open worlds">
            <button onClick={() => reset((Date.now() >>> 0) % 100000, founder)} title="a fresh world">new world</button>
            <button onClick={downloadWorld} title="save this world to a file (it is also kept in your browser between visits)">save to a file</button>
            <button onClick={() => fileRef.current?.click()} title="open a saved world file">open a file…</button>
          </Menu>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {notice && <div className="world-notice">{notice}</div>}
      </header>


      {ff && (
        <div className="ff-overlay">
          <div className="ff-panel">
            <b>Time passes…</b>
            <div className="ff-bar">
              <i style={{ width: `${Math.round(ff.f * 100)}%` }} />
            </div>
            <span>{ff.label || 'starting'}</span>
            <button onClick={stopFastForward}>stop here</button>
          </div>
        </div>
      )}
      {chron && !ff && (
        <div className="chronicle">
          <button className="close" onClick={dismissChronicle} title="dismiss">✕</button>
          <h3>{spanWords(chron.seconds)} went by</h3>
          <p>
            <b>{chron.born}</b> born · <b>{chron.died}</b> died ({chron.killed} to hunters, {chron.starved} starved, {chron.aged} of old age)
          </p>
          <p>
            population {chron.population[0]} → <b>{chron.population[1]}</b>
          </p>
          {chron.arose.length > 0 && <p className="arose">New species: {chron.arose.join(', ')}</p>}
          {chron.lost.length > 0 && <p className="lost">Died out: {chron.lost.join(', ')}</p>}
          {chron.arose.length === 0 && chron.lost.length === 0 && <p className="quiet">No species arose or died out.</p>}
        </div>
      )}

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

      {documentary && sel && (
        <div className="doc-caption">
          <b>{sel.adult ? capital(sel.species) : `A young ${sel.species}`}</b>
          <span>{narrate(sel)}</span>
        </div>
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

/** "a day", "3 days", "a season and a day"… for the chronicle's heading */
function spanWords(seconds: number): string {
  const days = Math.round(seconds / DAY_LENGTH);
  if (days <= 0) return 'A few hours';
  if (days === 1) return 'A day';
  if (days === YEAR_DAYS) return 'A year';
  if (days === 3) return 'A season';
  return `${days} days`;
}

/** A small dropdown: a button that opens a column of actions (closing on a pick or a click away). */
function Menu({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);
  return (
    <div className="menu" ref={box}>
      <button className={open ? 'active' : ''} onClick={() => setOpen(!open)} title={title}>
        {label}
      </button>
      {open && (
        <div className="menu-list" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

