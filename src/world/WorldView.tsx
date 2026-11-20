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
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import type { Genome } from '../engine/genome';
import { WorldScene, captureStill } from './WorldScene';
import { TreeOfLife } from './TreeOfLife';
import { SpeciesCard } from './SpeciesCard';
import { useWorldUi, getWorld, populate, starterCast, strangerGenome, bumpVersion, changed, autosave, downloadWorld, type Snapshot } from './worldStore';
import { DAY_LENGTH, YEAR_DAYS, bredFromHere, dayNumber, liveCount, release, speciesById, stepWorld, type Creature, type HistorySample, type World } from '../sim/world';
import { genomeOfMorphotype } from '../engine/random';
import { MUTATION_DIAL, bloom, cull, forceWeather, glut, heal, makeBreed, setGodMode, setImmigration, setMutation, smite } from '../sim/god';
import { inAdoptedLine } from '../sim/evolution';
import { setRain, setWarmth, startEvent } from '../sim/levers';
import { howItDiffers } from '../sim/lineage';
import { usePortrait } from '../viewer/portrait';
import { DrawnWhole, KeepPrograms, WarmShaders } from '../viewer/programs';
import { MeasureFrames } from '../viewer/FramePace';
import { WORLD_SMOOTH_MS, type StageStatus } from '../viewer/pace';
import { NARRATOR, sentence } from './narrator';
import { droughtOf, spell, weatherAt } from '../sim/weather';
import { dprOf, useQuality, useSettings } from '../ui/settings';
import { useStore } from '../ui/store';

const SPEEDS = [1, 4, 16, 48];
let DEV_WARMED = false;
let DEV_CROWDED = false;

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
  if (c.raiding) return a ? `raids ${an(a)} nest` : 'raids a nest';
  if (c.nesting && (c.action === 'wander' || c.action === 'sleep')) return c.action === 'sleep' ? 'sleeps beside its eggs' : 'keeps watch over its nest';
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

export function WorldView({ founder, lineageRoot = null, onExit, onAdopt, onMenu, onStatus }: { founder: Genome; lineageRoot?: Genome | null; onExit: () => void; onAdopt: (g: Genome) => void; onMenu?: () => void; onStatus?: (s: StageStatus) => void }) {
  const running = useWorldUi((s) => s.running);
  const speed = useWorldUi((s) => s.speed);
  const follow = useWorldUi((s) => s.follow);
  const snap = useWorldUi((s) => s.snapshot);
  const emotes = useWorldUi((s) => s.emotes);
  const documentary = useWorldUi((s) => s.documentary);
  const sound = useWorldUi((s) => s.sound);
  // (dev: ?tree=1 opens it, for inspection screenshots)
  const [showTree, setShowTree] = useState(() => import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('tree') === '1');
  const narration = useWorldUi((s) => s.narration);
  const panel = useWorldUi((s) => s.panel);
  const { setRunning, setSpeed, setFollow, setEmotes, setDocumentary, setNarration, setSound, select, pick, setPanel, reset, open, releaseGenome, refresh, fastForward, stopFastForward, dismissChronicle, takeHome, clone, boost, setPlacing, godAct } = useWorldUi.getState();
  const god = snap?.god ?? null;
  // a god-mode act on the selected creature
  const onSel = (act: (w: World, c: Creature) => boolean) => {
    const id = useWorldUi.getState().selected;
    godAct((w) => {
      const c = w.creatures.find((x) => x.id === id);
      return !!c && act(w, c);
    });
  };
  const placing = useWorldUi((s) => s.placing);
  // the release card: how many of the creature being bred to let go, and where
  const [releasing, setReleasing] = useState(false);
  const [releaseN, setReleaseN] = useState(6);
  // (the species the breeder's line was bred from, if its first creature was taken home from here)
  const bredFrom = useMemo(() => (lineageRoot ? bredFromHere(getWorld(), lineageRoot) : null), [lineageRoot, snap?.time]);
  // (a count changed while placing applies to the next click; leaving the valley ends the placing)
  useEffect(() => {
    const p = useWorldUi.getState().placing;
    if (p && p.kind === 'release' && p.count !== releaseN) setPlacing({ ...p, count: releaseN });
  }, [releaseN, setPlacing]);
  useEffect(() => () => setPlacing(null), [setPlacing]);
  const ff = useWorldUi((s) => s.ff);
  const chron = useWorldUi((s) => s.chronicle);
  const fileRef = useRef<HTMLInputElement>(null);
  const quality = useQuality();
  // (the scene holds still while the game menu is over it — nothing steps — and is drawn again only
  // when something asks: the window changing size, an option changed in the menu's own Settings.
  // Switched off outright it kept nothing: resizing a canvas clears it, and the valley behind the
  // menu went blank on entering full screen or changing the resolution.)
  const menuOpen = useStore((s) => s.menuOpen);
  const hints = useSettings((s) => s.gameplay.hints);
  const autosaveMinutes = useSettings((s) => s.gameplay.autosaveMinutes);
  const [warm, setWarm] = useState(false);
  // For the loading screen: a frame drawn whole (no draw held back for a shader still building), then
  // the frame rate measured — and, where it is under WORLD_SMOOTH_MS, the graphics lowered once, if the
  // game may, and the frame rate measured again at the new ones.
  const [whole, setWhole] = useState(false);
  const [rate, setRate] = useState<{ tries: number; ms: number | null }>({ tries: 0, ms: null });
  const [lowered, setLowered] = useState(false);
  const onRate = (ms: number) => {
    if (rate.tries === 0 && ms > WORLD_SMOOTH_MS && useSettings.getState().autoLower('slow')) {
      setLowered(true);
      setRate({ tries: 1, ms: null });
    } else setRate({ tries: rate.tries + 1, ms });
  };
  const step: StageStatus['step'] = !warm || !whole ? 'shaders' : rate.ms === null ? 'measuring' : 'ready';
  const slow = rate.ms !== null && rate.ms > WORLD_SMOOTH_MS;
  const status = useMemo<StageStatus>(() => ({ step, still: false, lowered, slow }), [step, lowered, slow]);
  const told = useRef(onStatus);
  told.current = onStatus;
  useEffect(() => {
    told.current?.(status);
  }, [status]);
  // the species card open beside the census (null: none)
  const [card, setCard] = useState<number | null>(null);
  // (a new or loaded world numbers its species afresh: an open card would show a stranger)
  const epoch = useWorldUi((s) => s.epoch);
  useEffect(() => setCard(null), [epoch]);
  const followOne = (id: number) => {
    const c = getWorld().creatures.find((x) => x.species === id && x.alive);
    if (c) {
      pick(c.id);
      setFollow(true);
    }
  };
  // The selected creature's living kin, in a fixed order: ‹ and › (or the , and . keys) step through
  // them. Stepping by hand is browsing, so the documentary's director stands aside.
  const kinOf = (speciesId: number) => getWorld().creatures.filter((x) => x.alive && x.species === speciesId).sort((a, b) => a.id - b.id);
  const stepKin = (d: number) => {
    const cur = useWorldUi.getState().selected;
    const me = cur === null ? undefined : getWorld().creatures.find((x) => x.id === cur);
    if (!me) return;
    const kin = kinOf(me.species);
    if (kin.length === 0) return;
    const i = kin.findIndex((x) => x.id === me.id);
    const at = i < 0 ? (d > 0 ? -1 : 0) : i; // (it died: step on from where it stood)
    const next = kin[(at + d + kin.length) % kin.length];
    if (next.id === me.id) return;
    if (useWorldUi.getState().documentary) setDocumentary(false);
    pick(next.id);
  };
  // the bar's height, for the panels under it: on a narrow window its groups wrap onto a second row,
  // and a panel pinned 60 px down sat over it
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const r = root.current, h = bar.current;
    if (!r || !h || typeof ResizeObserver === 'undefined') return;
    const fit = () => r.style.setProperty('--bar-h', `${Math.ceil(h.getBoundingClientRect().height)}px`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(h);
    return () => ro.disconnect();
  }, []);
  const [ownNotice, setNotice] = useState<string | null>(null);
  const storeNotice = useWorldUi((s) => s.notice);
  const notice = ownNotice ?? storeNotice;
  useEffect(() => {
    if (!storeNotice) return;
    const t = setTimeout(() => useWorldUi.getState().notify(null), 4000);
    return () => clearTimeout(t);
  }, [storeNotice]);
  const photo = useWorldUi((s) => s.photo);
  // news of an adopted line: a split, a renaming, an extinction — each said for a while, with a way to it
  const [lineNews, setLineNews] = useState<{ key: string; text: string; id: number }[]>([]);
  const seenNews = useRef<string | null>(null);
  useEffect(() => {
    const evs = snap?.events;
    if (!evs || evs.length === 0) return;
    const keyOf = (e: { t: number; text: string }) => `${e.t}:${e.text}`;
    const lastKey = keyOf(evs[evs.length - 1]);
    if (seenNews.current === null) {
      seenNews.current = lastKey; // (what was already in the journal when the valley opened is old news)
      return;
    }
    if (lastKey === seenNews.current) return;
    let from = evs.length - 1;
    while (from >= 0 && keyOf(evs[from]) !== seenNews.current) from--;
    seenNews.current = lastKey;
    const w = getWorld();
    const fresh = evs.slice(from + 1).filter((e) => (e.kind === 'speciation' || e.kind === 'extinction') && e.species !== undefined && inAdoptedLine(w, e.species));
    if (fresh.length === 0) return;
    setLineNews((l) => [...l, ...fresh.map((e) => ({ key: keyOf(e), text: e.text, id: e.species! }))].slice(-3));
  }, [snap?.events]);
  useEffect(() => {
    if (lineNews.length === 0) return;
    const t = setTimeout(() => setLineNews((l) => l.slice(1)), 12000);
    return () => clearTimeout(t);
  }, [lineNews]);
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

  // the world is kept in the browser: every so often (a setting), and whenever the page is hidden or left
  useEffect(() => {
    const t = autosaveMinutes > 0 ? setInterval(autosave, autosaveMinutes * 60_000) : undefined;
    const hide = () => document.visibilityState === 'hidden' && autosave();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', autosave);
    return () => {
      if (t !== undefined) clearInterval(t);
      autosave();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', autosave);
    };
  }, [autosaveMinutes]);

  // Space stops and starts time (not while typing, nor while a button has the focus — Space presses it);
  // I shows or hides the creature panel; , and . step to the previous or next one of its species
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (useStore.getState().menuOpen) return; // (the menu is up: time is stopped, and stays stopped)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.code === 'Space') {
        if (e.repeat || t?.tagName === 'BUTTON') return;
        e.preventDefault();
        setRunning(!useWorldUi.getState().running);
      } else if (e.code === 'KeyI' && !e.repeat) {
        const ui = useWorldUi.getState();
        if (ui.selected === null) setNotice('Click a creature to open its panel');
        else setPanel(!ui.panel);
      } else if (e.code === 'Comma' || e.code === 'Period') {
        stepKin(e.code === 'Comma' ? -1 : 1);
      } else if (e.code === 'KeyP' && !e.repeat) {
        useWorldUi.getState().setPhoto(!useWorldUi.getState().photo);
      } else if (e.code === 'KeyS' && !e.repeat && useWorldUi.getState().photo) {
        e.preventDefault();
        saveStill();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // first visit: populate the starter ecosystem (+ the breeder's creature)
  useEffect(() => {
    // Dev/headless: ?crowd=N opens a valley with room for N, filled to the brim with the starter cast's
    // kinds (to measure what a crowded valley costs to draw)
    const crowd = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('crowd') ?? 0) : 0;
    if (crowd > 0 && !DEV_CROWDED) {
      DEV_CROWDED = true;
      reset(1, null, crowd);
      const cw = getWorld();
      const kinds = starterCast('standard');
      for (let i = 0; liveCount(cw) < crowd && i < 400; i++) release(cw, genomeOfMorphotype((cw.seed * 97 + (i % kinds.length) * 13) >>> 0, kinds[i % kinds.length][0]), 6, undefined, kinds[i % kinds.length][0]);
      bumpVersion();
    }
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
      // follow=aloft: the first creature on the wing; follow=courting / stalking / nesting / young: run
      // on (up to ten minutes) until a pair is mid-display, a hunter is creeping up on something, a
      // clutch is laid, or a youngster is out with its parent
      const wanted: Record<string, (x: (typeof w.creatures)[number]) => boolean> = {
        aloft: (x) => x.alt > 1,
        courting: (x) => x.action === 'mate' && x.courtT > 1.2,
        stalking: (x) => x.action === 'hunt' && x.chaseT <= 0 && x.alt <= 0.1,
        nesting: (x) => w.eggs.some((e) => e.mother === x.id && !e.water),
        // a youngster still in its baby proportions, on land, near a parent
        young: (x) => x.age < x.traits.maturity * 0.4 && x.alt <= 0.1 && x.traits.habitat !== 'water' && w.creatures.some((m) => m.id === x.parent && m.alive),
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
      // dry=1: jump the clock to the middle of the valley's first dry year (to inspect a drought)
      if (q.get('dry') === '1') {
        const year = DAY_LENGTH * YEAR_DAYS;
        for (let y = 1; y < 64; y++) {
          if (droughtOf(w.seed, (y + 0.5) * year) > 0) {
            w.time = (y + 0.45) * year;
            break;
          }
        }
      }
      if (q.get('paused') === '1') setRunning(false);
      if (q.get('doc') === '1') setDocumentary(true);
      changed(); // (the valley was run on, or its clock moved, here: whoever steps it goes on from this)
      bumpVersion();
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sel = snap?.selected ?? null;
  const kin = sel ? kinOf(sel.speciesId) : [];
  const kinAt = sel ? kin.findIndex((x) => x.id === sel.id) : -1;
  return (
    <div className={`world${placing ? ' placing' : ''}${photo ? ' photo' : ''}`} ref={root}>
      {/* the scene mounts paused while its shaders compile (in parallel, where the browser can), then runs */}
      <Canvas className="world-canvas" frameloop={!warm ? 'never' : menuOpen ? 'demand' : 'always'} shadows={quality.shadows} dpr={dprOf(quality, 1.75)} camera={{ position: [40, 38, 70], fov: 45, near: 0.2, far: 1200 }} gl={{ preserveDrawingBuffer: import.meta.env.DEV }}>
        <KeepPrograms />
        <DrawnWhole onChange={setWhole} />
        {!warm && <WarmShaders onReady={() => setWarm(true)} />}
        {/* (a measurement of its own for each try: the one after a lowering starts from nothing) */}
        <MeasureFrames key={rate.tries} run={warm && whole && rate.ms === null && !menuOpen} onDone={onRate} />
        <WorldScene />
      </Canvas>
      {!warm && <div className="world-loading">Waking the world…</div>}
      {warm && hints && <div className="cam-hint">drag to orbit · scroll to zoom · WASD or arrows to pan (Shift: faster) · I: the creature panel</div>}

      <header className="world-bar" ref={bar}>
        <h1>Cambrian</h1>
        <nav className="tabs">
          <button onClick={onExit}>Breed</button>
          <button className="active">World</button>
          {onMenu && <button className="menu-btn" onClick={onMenu} title="menu: save, load, settings, exit (Esc)" aria-label="Menu">☰</button>}
        </nav>
        {snap && (
          <div className="clock">
            <b title={`a year in the valley is ${YEAR_DAYS} days, three to a season`}>Year {snap.year}</b> <span className="day">day {snap.day}</span> <span className="season">{snap.season}{snap.dry > 0 && <span className="dry" title="a dry year: fewer showers, and the grass and the fruit come back slower"> · {snap.dry > 0.8 ? 'drought' : 'dry year'}</span>}</span>{snap.weather && <span className="weather">{snap.weather === 'overcast' ? '☁' : snap.weather.includes('snow') ? '❄' : '☂'} {snap.weather}</span>} <span>{clock(snap.phase)}</span> <span className="sky">{snap.night ? '☾ night' : '☀ day'}</span>
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
          <button disabled={!!ff} onClick={() => fastForward(DAY_LENGTH * YEAR_DAYS, 'a year')} title={`a year: ${YEAR_DAYS} days`}>year</button>
        </div>
        <div className="releases">
          <button className={sound ? 'active' : ''} onClick={() => setSound(!sound)} title="synthesized wind, birdsong and crickets, and the creatures' own calls">{sound ? '♪ sound' : '♪ sound off'}</button>
          <button className={documentary ? 'active' : ''} onClick={() => setDocumentary(!documentary)} title="documentary mode: the camera finds the most interesting things happening and follows them">▶ documentary</button>
          {documentary && NARRATOR.available && (
            <button className={narration ? 'active' : ''} onClick={() => setNarration(!narration)} title="read the documentary's captions aloud">🎙 voice</button>
          )}
          <button className={emotes ? 'active' : ''} onClick={() => setEmotes(!emotes)} title="mood icons over the creatures: asleep, courting, alarmed, hunting">moods</button>
          <Menu label="+ release" title="release new animals into the valley">
            <button onClick={() => setReleasing(true)} title="release the creature you're breeding: as many as you like, where you click">{bredFrom ? `your line, bred from ${bredFrom.name}…` : 'your creature…'}</button>
            <button onClick={() => releaseGenome(strangerGenome((Date.now() * 2654435761) >>> 0), 6)} title="release six of a random new species">six strangers</button>
          </Menu>
          {snap && (
            <Menu label="🌦 climate" title="levers on the environment: a colder or warmer age, a drier or wetter valley, and what may befall it (told in the journal)">
              <span className="menu-sub">the age</span>
              <span className="menu-dial">
                {[-1, -0.5, 0, 0.5, 1].map((x) => (
                  <button key={x} className={snap.levers.warmth === x ? 'active' : ''} onClick={() => godAct((w) => setWarmth(w, x))} title={x === 0 ? 'the valley’s own climate' : x < 0 ? 'a colder age' : 'a warmer age'}>
                    {x === -1 ? '❄❄' : x === -0.5 ? '❄' : x === 0 ? '·' : x === 0.5 ? '☀' : '☀☀'}
                  </button>
                ))}
              </span>
              <span className="menu-sub">the rains</span>
              <span className="menu-dial">
                {[0.5, 0.75, 1, 1.25, 1.5].map((x) => (
                  <button key={x} className={snap.levers.rain === x ? 'active' : ''} onClick={() => godAct((w) => setRain(w, x))} title={x === 1 ? 'the valley’s own rains' : x < 1 ? 'a drier valley' : 'a wetter valley'}>
                    {x}×
                  </button>
                ))}
              </span>
              <span className="menu-sub">events</span>
              <button onClick={() => godAct((w) => startEvent(w, 'ice-age'))} title="four years of hard cold, and snow that does not melt">an ice age</button>
              <button onClick={() => godAct((w) => startEvent(w, 'ash-winter'))} title="a volcano far off: three days of cold and dark, little growing">an ash winter</button>
              <button onClick={() => godAct((w) => startEvent(w, 'meteor'))} title="most of the big animals killed at a stroke, and dust after">a meteor</button>
            </Menu>
          )}
          {god?.on && (
            <Menu label="⚡ god" title="god mode: the valley is yours to change (every act is told in the journal)">
              <button onClick={() => godAct(bloom)} title="the lake as rich as it can be">algae bloom</button>
              <button onClick={() => godAct(glut)} title="every bush and tree in full fruit">fruit glut</button>
              <button onClick={() => godAct((w) => forceWeather(w, 'rain'))} title="a shower, now, for half a day">rain now</button>
              <button onClick={() => godAct((w) => forceWeather(w, 'drought'))} title="a dry spell, now, for three days">drought now</button>
              <button onClick={() => godAct((w) => setImmigration(w, !w.god.immigration))} title="whether founding stocks lost from the valley wander back in">
                {god.immigration ? 'close the valley' : 'open the valley'}
              </button>
              <span className="menu-sub">births mutated</span>
              <span className="menu-dial">
                {MUTATION_DIAL.map((x) => (
                  <button key={x} className={god.mutation === x ? 'active' : ''} onClick={() => godAct((w) => setMutation(w, x))} title={x === 1 ? "the valley's own rate" : `${x}× the valley's own rate`}>
                    {x === 0.5 ? '½' : x}×
                  </button>
                ))}
              </span>
            </Menu>
          )}
          <Menu label="world ▾" title="new, save and open worlds">
            <button onClick={() => reset((Date.now() >>> 0) % 100000, founder)} title="a fresh world">new world</button>
            <button onClick={downloadWorld} title="save this world to a file (it is also kept in your browser between visits)">save to a file</button>
            {!snap?.scenario && (
              <button onClick={() => godAct((w) => (setGodMode(w, !w.god.on), true))} title="a sandbox: strike creatures down, heal them, carry them, call down rain or drought (every act is told in the journal)">
                {god?.on ? 'god mode: on' : 'god mode'}
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} title="open a saved world file">open a file…</button>
          </Menu>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { void openFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {notice && <div className="world-notice">{notice}</div>}
      </header>

      {snap?.scenario && (
        <div className={`goal goal-${snap.scenario.status}`} title={snap.scenario.goal}>
          <b>{snap.scenario.status === 'won' ? 'Won' : snap.scenario.status === 'lost' ? 'Lost' : 'Goal'}</b> {snap.scenario.title} — {snap.scenario.progress}
        </div>
      )}
      {lineNews.length > 0 && (
        <div className="line-news">
          {lineNews.map((n) => (
            <div key={n.key} className="line-news-item">
              <b>Your line</b> {n.text}
              <button
                onClick={() => {
                  setCard(n.id);
                  setLineNews((l) => l.filter((x) => x.key !== n.key));
                }}
              >
                see
              </button>
              <button onClick={() => setLineNews((l) => l.filter((x) => x.key !== n.key))} title="dismiss">✕</button>
            </div>
          ))}
        </div>
      )}
      {photo && (
        <div className="photo-bar">
          <span>Photo mode — drag and scroll to frame the shot</span>
          <button onClick={saveStill} title="save the picture as it is now (S)">save a still</button>
          <button onClick={() => useWorldUi.getState().setPhoto(false)} title="bring back the bar and the panels (P)">done</button>
        </div>
      )}
      {placing && (
        <div className="placing-hint">
          {placing.kind === 'release' ? `Click the ground to release ${placing.count} there` : 'Click the ground to set it down there'}{' '}
          <button onClick={() => setPlacing(null)}>{placing.kind === 'release' ? 'done' : 'cancel'}</button>
        </div>
      )}
      {releasing && (
        <div className="release-card">
          <div className="critter-head">
            <h3>Release {bredFrom ? <>your line <small>bred from {bredFrom.name}</small></> : 'your creature'}</h3>
            <button onClick={() => { setReleasing(false); setPlacing(null); }} title="close">✕</button>
          </div>
          <p className="doing">
            {bredFrom ? 'It joins the valley as a species of its own, a branch of the one it was bred from.' : 'It joins the valley as a species of its own.'}
          </p>
          <div className="release-row">
            <span className="cast-n">
              <button onClick={() => setReleaseN(Math.max(1, releaseN - 1))} aria-label="fewer">−</button>
              <b>{releaseN}</b>
              <button onClick={() => setReleaseN(Math.min(30, releaseN + 1))} aria-label="more">+</button>
            </span>
            <button className={placing?.kind === 'release' ? 'active' : ''} onClick={() => setPlacing(placing?.kind === 'release' ? null : { kind: 'release', genome: founder, count: releaseN, root: lineageRoot })} title="each click on the ground releases them there">
              {placing?.kind === 'release' ? 'placing: click the ground' : 'where I click'}
            </button>
            <button onClick={() => releaseGenome(founder, releaseN, null, lineageRoot)} title="where its kind can live">anywhere</button>
          </div>
        </div>
      )}


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
          {chron.aroseIds.length > 0 && (
            <div className="chron-portraits">
              {chron.aroseIds.slice(0, 4).map((id) => (
                <SpeciesPortrait key={id} speciesId={id} />
              ))}
            </div>
          )}
          {chron.became.length > 0 && <p className="arose">Lines that changed: {chron.became.join(', ')}</p>}
          {chron.lost.length > 0 && <p className="lost">Died out: {chron.lost.join(', ')}</p>}
          {chron.arose.length === 0 && chron.lost.length === 0 && <p className="quiet">No species arose or died out.</p>}
          {chron.stillborn > 0 && <p className="quiet">{chron.stillborn} young too misshapen to live were never born.</p>}
        </div>
      )}

      {snap && (
        <aside className="census">
          <h3>
            Census <span>{snap.pop} alive{snap.aloft > 0 && <em className="aloft" title="in the air now"> · {snap.aloft} aloft</em>}</span>
            <button className={`tol-toggle${showTree ? ' active' : ''}`} onClick={() => setShowTree(!showTree)} title="every species the world has known, as a branching tree through time">tree of life</button>
          </h3>
          <PopulationChart history={snap.history} species={snap.species} />
          <ul>
            {snap.species.slice(0, 14).map((s) => (
              <li
                key={s.id}
                onClick={() => {
                  // its card (a second click closes it), and the camera on a living member
                  setCard(card === s.id ? null : s.id);
                  followOne(s.id);
                }}
                className={`${s.extinct ? 'extinct' : ''}${card === s.id ? ' open' : ''}`}
                title={s.extinct ? 'extinct: its record' : 'its record, and follow one'}
              >
                <CensusIcon speciesId={s.id} hue={s.hue} />
                <span className="sp-name">{s.name}</span>
                <span className="sp-diet">
                  {s.diet}
                  {s.aloft > 0 && <em className="aloft" title={`${s.aloft} in the air now`}> ↑{s.aloft}</em>}
                </span>
                <span className="sp-n" title={s.became ? `became ${s.became}` : undefined}>{s.became ? '→' : s.extinct ? '†' : s.alive}</span>
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

      {sel && panel && (
        <aside className="critter">
          <div className="critter-head">
            <h3>
              <button className="link" onClick={() => setCard(sel.speciesId)} title="its species' record">
                {sel.species}
              </button>
            </h3>
            <div className="critter-nav">
              <button onClick={() => stepKin(-1)} disabled={kin.length < 2} title="the previous one of its species (,)" aria-label="the previous one of its species">‹</button>
              <span className="kin-n" title="which of its species' living members this is">{kinAt >= 0 ? `${kinAt + 1} of ${kin.length}` : `of ${kin.length}`}</span>
              <button onClick={() => stepKin(1)} disabled={kin.length < 2} title="the next one of its species (.)" aria-label="the next one of its species">›</button>
              <button className="close" onClick={() => setPanel(false)} title="close the panel (I opens it again)" aria-label="close the panel">✕</button>
            </div>
          </div>
          <p className="doing">
            {sel.adult ? 'adult' : 'juvenile'} · gen {sel.generation} · <b>{sel.raiding ? 'raiding a nest' : sel.nesting && sel.action === 'wander' ? 'minding its nest' : ACTION_LABEL[sel.action] ?? sel.action}{sel.flying ? ' · on the wing' : ''}</b>
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
            <dt title="how well its body is made, against its line's first founder: a poorer one burns more and is passed over by mates">build</dt><dd>{Math.round(sel.fit * 100)}%</dd>
            <dt>offspring</dt><dd>{sel.children}{sel.kills ? ` · ${sel.kills} kills` : ''}</dd>
          </dl>
          <Lineage genome={sel.genome} speciesId={sel.speciesId} />
          <div className="critter-actions">
            <button className={follow ? 'active' : ''} onClick={() => setFollow(!follow)}>{follow ? 'following' : 'follow'}</button>
            <button
              onClick={() => {
                takeHome(sel.id);
                onAdopt(sel.genome);
              }}
              title="make this creature the parent in the breeder (released again, its line is a branch of its species)"
            >
              take home
            </button>
            <span className="clone">
              <button onClick={() => clone(sel.id, 1)} disabled={!sel.alive} title="a grown copy of it, beside it">clone</button>
              <button onClick={() => clone(sel.id, 5)} disabled={!sel.alive} title="five grown copies of it">×5</button>
            </span>
          </div>
          {god?.on && sel.alive && (
            <div className="critter-actions god-actions">
              <button onClick={() => onSel(heal)} title="healed, fed and rested">heal &amp; feed</button>
              <button onClick={() => setPlacing({ kind: 'carry', id: sel.id })} className={placing?.kind === 'carry' ? 'active' : ''} title="pick it up: click the ground to set it down">carry</button>
              <button onClick={() => onSel(makeBreed)} title="breed now, with the nearest grown one of its kind">breed</button>
              <button onClick={() => onSel(smite)} title="struck dead where it stands">smite</button>
              <button onClick={() => onSel(cull)} title="taken out of the valley, no carcass">cull</button>
            </div>
          )}
        </aside>
      )}

      {documentary && sel && (
        <div className="doc-caption">
          <b>{sel.adult ? capital(sel.species) : `A young ${sel.species}`}</b>
          <span>{narrate(sel)}</span>
          <Narration subject={sel.adult ? `the ${sel.species}` : `a young ${sel.species}`} doing={narrate(sel)} id={sel.id} />
        </div>
      )}

      {snap && showTree && (
        <TreeOfLife
          tree={snap.tree}
          now={snap.time}
          onClose={() => setShowTree(false)}
          onPick={(id) => {
            setCard(id);
            followOne(id);
          }}
        />
      )}

      {snap && card !== null && <SpeciesCard id={card} at={snap.time} onClose={() => setCard(null)} onPick={setCard} onFollow={followOne} onBoost={boost} onAdopt={(id, on) => useWorldUi.getState().adoptLine(id, on)} onPlague={(id) => godAct((w) => startEvent(w, 'plague', id))} />}

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

/** The scene as it is now, saved as a picture (photo mode's S). */
function saveStill(): void {
  const url = captureStill();
  if (!url) return;
  const w = getWorld();
  const a = document.createElement('a');
  a.href = url;
  a.download = `cambrian-valley-${w.seed}-day${dayNumber(w.time)}.png`;
  a.click();
  useWorldUi.getState().notify('Still saved');
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

/** Where this animal's species came from, and how it differs from the species' founder — two
 *  portraits side by side when they differ (evolution you can see), in words underneath. */
function Lineage({ genome, speciesId }: { genome: Genome; speciesId: number }) {
  const w = getWorld();
  const sp = speciesById(w, speciesId);
  const parent = sp && sp.parent !== null ? speciesById(w, sp.parent) : undefined;
  const founder = sp?.founder;
  const diffs = useMemo(() => (founder ? howItDiffers(founder, genome) : []), [founder, genome]);
  // (the card being looked at: drawn ahead of any row of icons still waiting)
  const mine = usePortrait(genome, true);
  const theirs = usePortrait(diffs.length > 0 ? founder : null, true);
  if (!sp) return null;
  return (
    <div className="lineage">
      <div className="portraits">
        {diffs.length > 0 && (
          <figure>
            {theirs ? <img src={theirs} alt="" /> : <div className="ph" />}
            <figcaption>its species' founder</figcaption>
          </figure>
        )}
        <figure>
          {mine ? <img src={mine} alt="" /> : <div className="ph" />}
          <figcaption>{diffs.length > 0 ? 'this one' : sp.name}</figcaption>
        </figure>
      </div>
      {diffs.length > 0 && <p>Since the founder: {diffs.join(', ')}.</p>}
      <AncestryStrip speciesId={sp.id} />
      {parent && (
        <p className="from">
          Branched off {parent.name} on day {dayNumber(sp.firstSeen)}
          {(() => {
            const d = howItDiffers(parent.founder, sp.founder, 3);
            return d.length ? ` — ${d.join(', ')}` : '';
          })()}
          .
        </p>
      )}
    </div>
  );
}

/** A species' founder, drawn small, with its name. */
function SpeciesPortrait({ speciesId }: { speciesId: number }) {
  const sp = speciesById(getWorld(), speciesId);
  const url = usePortrait(sp?.founder);
  if (!sp) return null;
  return (
    <figure>
      {url ? <img src={url} alt="" /> : <div className="ph" />}
      <figcaption>{sp.name}</figcaption>
    </figure>
  );
}

/** A census row's face: the species' founder, tiny, edged in its chart colour. */
function CensusIcon({ speciesId, hue }: { speciesId: number; hue: number }) {
  const sp = speciesById(getWorld(), speciesId);
  const url = usePortrait(sp?.founder);
  return (
    <span className="sp-icon" style={{ borderColor: hueCss(hue) }}>
      {url && <img src={url} alt="" />}
    </span>
  );
}

/** Speaks the caption when the story changes (the narrator drops repeats and never talks over itself). */
function Narration({ subject, doing, id }: { subject: string; doing: string; id: number }) {
  // (re-run when the voice is switched on, so it reads the caption already showing)
  const narration = useWorldUi((s) => s.narration);
  useEffect(() => {
    NARRATOR.say(sentence(subject, doing, id + doing.length));
  }, [subject, doing, id, narration]);
  return null;
}

/** The line of descent as a strip of founders: the original released stock, each species it branched
 *  into on the way, down to this one's (only drawn when there is a line to draw). */
function AncestryStrip({ speciesId }: { speciesId: number }) {
  const w = getWorld();
  const chain: { id: number; name: string }[] = [];
  for (let sp = speciesById(w, speciesId); sp && chain.length < 8; sp = sp.parent !== null ? speciesById(w, sp.parent) : undefined) {
    chain.unshift({ id: sp.id, name: sp.name });
  }
  if (chain.length < 2) return null;
  const shown = chain.length > 5 ? [chain[0], ...chain.slice(-4)] : chain;
  return (
    <div className="ancestry">
      <span className="lbl">line of descent</span>
      <div className="strip">
        {shown.map((c, i) => (
          <Fragment key={c.id}>
            {i > 0 && <span className="arrow">{i === 1 && chain.length > 5 ? '⋯›' : '›'}</span>}
            <SpeciesPortrait speciesId={c.id} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

