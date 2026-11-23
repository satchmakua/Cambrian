/**
 * The menus' panels — shared by the main menu and the in-game (pause) menu:
 *
 *   SettingsPanel   graphics / audio / gameplay options, applied as they are changed
 *   SavesPanel      the save slots: load, save (new or over a slot), export, import, delete
 *   NewGamePanel    the set-up for a fresh game: its name, the founder, the valley
 *   ControlsPanel   what the mouse and the keys do
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Genome } from '../../engine/genome';
import { MORPHOTYPE_IDS, type SymmetryMode } from '../../engine/random';
import { exportSave, founderFor, importSave, loadGame, saveGame, type NewGameOptions } from '../game';
import { cleanName, describeSave, nextGameName, saveStore, NAME_MAX, type CastEntry, type Ecosystem, type SaveHeader } from '../saves';
import { CAST_COUNT, CAST_KINDS, castOf, founderOf, lookFor } from '../../sim/cast';
import { CAPACITIES } from '../../sim/model';
import { SCENARIOS } from '../../sim/scenarios';
import { EARTHLIKE, PLANET_CAP, PLANET_CAPS, type PlanetDesign } from '../../sim/planetDesign';
import { PlanetDesigner } from './PlanetDesigner';
import { decodeGenome } from '../../engine/share';
import { grow } from '../../engine/grow';
import { coherence } from '../../engine/morphospace';
import { noGpu, settleGraphics, slowGpuHint } from '../gpu';
import { AUTOSAVE_MINUTES, DENSITIES, RENDER_SCALES, SAFE, useSettings, type CreatureDetail, type QualityPreset } from '../settings';
import { useStore, type GameView } from '../store';

// --- small controls --------------------------------------------------------------------------------

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="opt-row">
      <div className="opt-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="opt-control">{children}</div>
    </div>
  );
}

/** A row of mutually exclusive choices. */
function Choice<T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === value} className={o.v === value ? 'active' : ''} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <i />
      <span>{on ? 'On' : 'Off'}</span>
    </button>
  );
}

// --- settings --------------------------------------------------------------------------------------

const SCALE_WORDS: Record<number, string> = { 0.75: 'Low', 1: 'Standard', 1.5: 'High', 2: 'Full' };
const DENSITY_WORDS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾', 1: 'Full' };

export function SettingsPanel() {
  const g = useSettings((s) => s.graphics);
  const a = useSettings((s) => s.audio);
  const p = useSettings((s) => s.gameplay);
  const { setPreset, setGraphics, setAuto, setAudio, setGameplay, resetDefaults } = useSettings.getState();
  const [full, setFull] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return (
    <div className="settings">
      <section>
        <h3>Graphics</h3>
        {SAFE && (
          <p className="mm-warn" role="status">
            Safe mode: these are the lowest graphics, for this visit only. Changes made on this screen are not kept — leave safe mode (on the main menu) to set the options the game starts with.
          </p>
        )}
        <Row label="Quality" hint={g.preset === 'custom' ? 'Custom — the options below were changed by hand.' : 'Sets every option below at once.'}>
          <Choice<QualityPreset | 'custom'>
            label="Quality"
            value={g.preset}
            options={[{ v: 'low', label: 'Low' }, { v: 'medium', label: 'Medium' }, { v: 'high', label: 'High' }]}
            onChange={(v) => v !== 'custom' && setPreset(v)}
          />
        </Row>
        <Row label="Adjust automatically on slow machines" hint="The game sets the quality to Low itself, once, if this machine draws slowly. Choosing a quality or an option yourself turns this off.">
          <Toggle label="Adjust automatically on slow machines" on={g.auto} onChange={setAuto} />
        </Row>
        <Row label="Resolution" hint="How finely the 3D views are drawn. Lower is faster on high-density screens.">
          <Choice label="Resolution" value={g.renderScale} options={RENDER_SCALES.map((v) => ({ v, label: SCALE_WORDS[v] }))} onChange={(v) => setGraphics({ renderScale: v })} />
        </Row>
        <Row label="Shadows">
          <Toggle label="Shadows" on={g.shadows} onChange={(v) => setGraphics({ shadows: v })} />
        </Row>
        <Row label="Grass and flowers" hint="How much of the valley's ground cover is drawn.">
          <Choice label="Grass and flowers" value={g.vegetation} options={DENSITIES.map((v) => ({ v, label: DENSITY_WORDS[v] }))} onChange={(v) => setGraphics({ vegetation: v })} />
        </Row>
        <Row label="Weather and insects" hint="Rain, snow, stars, midges and butterflies.">
          <Choice label="Weather and insects" value={g.weather} options={DENSITIES.map((v) => ({ v, label: DENSITY_WORDS[v] }))} onChange={(v) => setGraphics({ weather: v })} />
        </Row>
        <Row label="Creature detail" hint="How far away creatures keep their features, how fine their skin is up close, and whether fur has its pile.">
          <Choice<CreatureDetail>
            label="Creature detail"
            value={g.creatureDetail}
            options={[{ v: 'low', label: 'Low' }, { v: 'medium', label: 'Medium' }, { v: 'high', label: 'High' }]}
            onChange={(v) => setGraphics({ creatureDetail: v })}
          />
        </Row>
        <Row label="Full screen">
          <button className="plain" onClick={toggleFull}>{full ? 'Leave full screen' : 'Enter full screen'}</button>
        </Row>
      </section>
      <section>
        <h3>Sound</h3>
        <Row label="World sound" hint="Wind, birdsong, rain and the creatures' own calls.">
          <Toggle label="World sound" on={a.sound} onChange={(v) => setAudio({ sound: v })} />
        </Row>
        <Row label="Volume">
          <input type="range" min={0} max={1} step={0.05} value={a.volume} aria-label="Volume" onChange={(e) => setAudio({ volume: Number(e.target.value) })} />
          <span className="num">{Math.round(a.volume * 100)}%</span>
        </Row>
        <Row label="Narrator's voice" hint="Reads the documentary's captions aloud.">
          <Toggle label="Narrator's voice" on={a.narration} onChange={(v) => setAudio({ narration: v })} />
        </Row>
      </section>
      <section>
        <h3>Game</h3>
        <Row label="Autosave the valley" hint="It is also kept whenever you leave.">
          <Choice label="Autosave" value={p.autosaveMinutes} options={AUTOSAVE_MINUTES.map((v) => ({ v, label: v === 0 ? 'On exit' : `${v} min` }))} onChange={(v) => setGameplay({ autosaveMinutes: v })} />
        </Row>
        <Row label="Mood icons" hint="Asleep, courting, alarmed, hunting — shown over the creatures.">
          <Toggle label="Mood icons" on={p.moods} onChange={(v) => setGameplay({ moods: v })} />
        </Row>
        <Row label="Hints">
          <Toggle label="Hints" on={p.hints} onChange={(v) => setGameplay({ hints: v })} />
        </Row>
        <Row label="Turntable" hint="The creature being bred turns on its own.">
          <Toggle label="Turntable" on={p.spin} onChange={(v) => setGameplay({ spin: v })} />
        </Row>
      </section>
      <div className="panel-foot">
        {/* (the defaults are the High quality: a browser drawing without a graphics card goes straight
            back to Low, as it did on its first visit, with the same notice saying so) */}
        <button
          className="plain"
          onClick={() => {
            resetDefaults();
            settleGraphics();
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

// --- saves -----------------------------------------------------------------------------------------

function when(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/**
 * A slot's creature, as a small picture once it is drawn. The portrait renderer is fetched when the
 * first picture is wanted: with it come the 3D library and the creature renderer, which the menus do
 * not wait for. In safe mode, and where the browser draws without a graphics card, a slot has no
 * picture: drawing each would hold the page for seconds.
 */
function SlotPortrait({ genome, className = 'slot-portrait' }: { genome: Genome; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (noGpu()) return;
    let live = true;
    void import('../../viewer/portrait')
      .then((m) => m.portraitOf(genome))
      .then((u) => live && setUrl(u))
      .catch(() => undefined); // (no picture: the slot is as usable without one)
    return () => {
      live = false;
    };
  }, [genome]);
  return <span className={className}>{url && <img src={url} alt="" />}</span>;
}

/**
 * The save slots. `mode` 'load' offers to load each (and to import a file); 'save' offers a new slot
 * and to overwrite each. `onDone` is called after a load or a save that should close the menu.
 */
export function SavesPanel({ mode, onLoaded, onSaved }: { mode: 'load' | 'save'; onLoaded?: () => void; onSaved?: () => void }) {
  const store = useMemo(() => saveStore(), []);
  const game = useStore((s) => s.game);
  const hasGame = useStore((s) => s.hasGame);
  const [list, setList] = useState<SaveHeader[] | null>(null);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [ask, setAsk] = useState<{ id: string; what: 'load' | 'delete' | 'overwrite' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(game.name);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await store.list());
    } catch (e) {
      setList([]);
      setNote({ text: e instanceof Error ? e.message : 'The saves could not be read.', bad: true });
    }
  }, [store]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** run one action: one at a time, its failure shown rather than thrown */
  const act = async (work: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(true);
    setAsk(null);
    try {
      const said = await work();
      setNote(said ? { text: said, bad: false } : null);
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : 'That did not work.', bad: true });
    } finally {
      setBusy(false);
      void refresh();
    }
  };
  const save = (id: string | null, as: string) =>
    act(async () => {
      const h = await saveGame(store, as, id);
      onSaved?.();
      return `Saved “${h.name}”.`;
    });
  const load = (h: SaveHeader) =>
    act(async () => {
      // (loaded from inside a game, it opens on the screen you were on; from the main menu, on the breeder)
      const view = useStore.getState().view;
      await loadGame(store, h.id, view === 'menu' ? undefined : view);
      onLoaded?.();
    });

  return (
    <div className="saves">
      {mode === 'save' && (
        <div className="save-new">
          <input value={name} maxLength={NAME_MAX} aria-label="Save name" placeholder="Name this save" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save(null, name)} />
          <button className="primary" disabled={busy} onClick={() => void save(null, name)}>Save as new</button>
        </div>
      )}
      {note && <p className={`save-note${note.bad ? ' bad' : ''}`}>{note.text}</p>}
      {list === null ? (
        <p className="save-empty">Reading saves…</p>
      ) : list.length === 0 ? (
        <p className="save-empty">{mode === 'save' ? 'No saves yet — name this one and save it.' : 'No saved games yet. Start a game and save it from the menu (Esc).'}</p>
      ) : (
        <ul className="slots">
          {list.map((h) => {
            const mine = h.id === game.id && hasGame;
            const asking = ask?.id === h.id ? ask.what : null;
            return (
              <li key={h.id} className={mine ? 'mine' : ''}>
                <SlotPortrait genome={h.summary.creature} />
                <div className="slot-text">
                  <b>{h.name}{mine && <em> · this game</em>}</b>
                  <span>{describeSave(h.summary, !!h.setup.planet)}</span>
                  <small>{when(h.savedAt)}</small>
                </div>
                {asking ? (
                  <div className="slot-ask">
                    <span>{asking === 'delete' ? 'Delete this save?' : asking === 'overwrite' ? 'Save over it?' : 'Load it? The game in progress is replaced.'}</span>
                    <button
                      className={asking === 'delete' ? 'danger' : 'primary'}
                      disabled={busy}
                      onClick={() => (asking === 'delete' ? void act(async () => { await store.remove(h.id); return `Deleted “${h.name}”.`; }) : asking === 'overwrite' ? void save(h.id, h.name) : void load(h))}
                    >
                      {asking === 'delete' ? 'Delete' : asking === 'overwrite' ? 'Overwrite' : 'Load'}
                    </button>
                    <button className="plain" onClick={() => setAsk(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="slot-actions">
                    {mode === 'load' ? (
                      <button className="primary" disabled={busy} onClick={() => (hasGame ? setAsk({ id: h.id, what: 'load' }) : void load(h))}>Load</button>
                    ) : (
                      <button className="primary" disabled={busy} onClick={() => (mine ? void save(h.id, cleanName(name, h.name)) : setAsk({ id: h.id, what: 'overwrite' }))}>{mine ? 'Save' : 'Overwrite'}</button>
                    )}
                    <button className="plain" disabled={busy} title="write this save to a file" onClick={() => void act(async () => { await exportSave(store, h.id); })}>Export</button>
                    <button className="plain" disabled={busy} onClick={() => setAsk({ id: h.id, what: 'delete' })}>Delete</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="panel-foot">
        <button className="plain" disabled={busy} onClick={() => fileRef.current?.click()}>Import a save file…</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void act(async () => `Imported “${(await importSave(store, await f.text())).name}”.`);
          }}
        />
        {!store.durable && <small>This browser is not keeping saves between visits — export a save to a file to keep it.</small>}
      </div>
    </div>
  );
}

// --- what the game did to the graphics itself -------------------------------------------------------

/** Why the game lowered the graphics, as it says it. */
const LOWERED = { software: 'this browser is drawing without a graphics card', slow: 'the first frames were slow' } as const;

/** Said where the valley is offered, on a machine it would crawl on. */
export const VALLEY_SLOW = 'The valley is the heaviest screen to draw: on this machine it may be very slow.';

/** Is this a machine the game has reason to think draws slowly (safe mode, no graphics card, or
 *  graphics it lowered itself)? */
export function useSlowMachine(): boolean {
  const lowered = useSettings((s) => s.notice.lowered);
  return lowered !== null || noGpu();
}

/**
 * The game lowered the graphics itself: one line saying so, until it is dismissed, with the way to
 * the options (`onSettings`). Shown on the main menu, and in the breeder — where the lowering may
 * have just happened under the player's eyes.
 */
export function LoweredNotice({ onSettings }: { onSettings: () => void }) {
  const notice = useSettings((s) => s.notice);
  const dismissNotice = useSettings((s) => s.dismissNotice);
  if (SAFE || !notice.lowered || notice.seen) return null;
  // (slow frames on a laptop's built-in graphics: a card in the same machine may be standing idle)
  const hint = notice.lowered === 'slow' ? slowGpuHint() : null;
  return (
    <div className="mm-notice" role="status">
      <span>
        Graphics were set to Low because {LOWERED[notice.lowered]}.{hint && ` ${hint}`}
      </span>
      <button
        className="plain"
        onClick={() => {
          dismissNotice();
          onSettings();
        }}
      >
        Settings
      </button>
      <button className="plain" onClick={dismissNotice}>OK</button>
    </div>
  );
}

// --- new game --------------------------------------------------------------------------------------

const ECO_WORDS: Record<Ecosystem, { label: string; hint: string }> = {
  standard: { label: 'Lively', hint: 'Grazers, browsers, birds, fish and their hunters are already at home.' },
  sparse: { label: 'Sparse', hint: 'The same animals, half as many: more room for yours.' },
  empty: { label: 'Empty', hint: 'Nobody but what you release.' },
};

const randomSeed = () => (Math.random() * 0xffffffff) >>> 0; // UI layer only; the engine's RNG is seeded

/** One kind in the cast, as its founder will look in this valley (its picture changes with the seed). */
function CastFace({ worldSeed, entry }: { worldSeed: number; entry: CastEntry }) {
  const g = useMemo(() => founderOf(worldSeed, entry), [worldSeed, entry]);
  return <SlotPortrait genome={g} className="cast-face" />;
}

/**
 * The valley's cast, as the new-game panel edits it: each kind with how many of it, another look for
 * it (↻), or out (✕); a kind added; a creature pasted as a `CAM2:` string, released as it is.
 */
function CastEditor({ cast, worldSeed, room, onChange }: { cast: CastEntry[]; worldSeed: number; room: number; onChange: (c: CastEntry[]) => void }) {
  const [adding, setAdding] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const total = cast.reduce((n, e) => n + e.count, 0);
  const set = (i: number, patch: Partial<CastEntry>) => onChange(cast.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const full = cast.length >= CAST_KINDS;
  const addPasted = () => {
    try {
      const text = paste.trim();
      const kind = coherence(grow(decodeGenome(text))).nearest;
      onChange([...cast, { kind, count: 4, look: 0, genome: text }]);
      setPaste('');
      setPasteErr(null);
    } catch (e) {
      setPasteErr(e instanceof Error ? e.message : 'That is not a creature string.');
    }
  };
  return (
    <div className="cast">
      {cast.length === 0 && <p className="cast-empty">Nobody: only what you release.</p>}
      <ul>
        {cast.map((e, i) => (
          <li key={`${i}-${e.kind}`}>
            <CastFace worldSeed={worldSeed} entry={e} />
            <span className="cast-kind">
              {e.kind}
              {e.genome && <small> pasted</small>}
            </span>
            <span className="cast-n">
              <button className="plain" onClick={() => set(i, { count: Math.max(1, e.count - 1) })} aria-label={`fewer ${e.kind}`}>−</button>
              <b>{e.count}</b>
              <button className="plain" onClick={() => set(i, { count: Math.min(CAST_COUNT, e.count + 1) })} aria-label={`more ${e.kind}`}>+</button>
            </span>
            {e.genome ? <span className="cast-gap" /> : <button className="plain" onClick={() => set(i, { look: randomSeed() % 1000000 })} title="another look for this kind">↻</button>}
            <button className="plain" onClick={() => onChange(cast.filter((_, j) => j !== i))} title="leave this kind out">✕</button>
          </li>
        ))}
      </ul>
      <div className="cast-add">
        <select value={adding} aria-label="Add a kind" onChange={(e) => setAdding(e.target.value)}>
          <option value="">Add a kind…</option>
          {MORPHOTYPE_IDS.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <button
          className="plain"
          disabled={!adding || full}
          onClick={() => {
            onChange([...cast, { kind: adding, count: 4, look: lookFor(adding) }]);
            setAdding('');
          }}
        >
          Add
        </button>
      </div>
      <div className="cast-add">
        <input value={paste} placeholder="…or paste a CAM2: creature" aria-label="Paste a creature string" onChange={(e) => setPaste(e.target.value)} />
        <button className="plain" disabled={!paste.trim() || full} onClick={addPasted}>Add</button>
      </div>
      {pasteErr && <small className="warn">{pasteErr}</small>}
      <small className="cast-total">
        {total} animals{total > room ? `: the valley holds ${room}, so the last kinds listed will not all fit` : ''}
      </small>
    </div>
  );
}

/**
 * New-game set-up. The founder is shown on the stage behind the menu as it is chosen (`onPreview`) —
 * where the menu has a stage (`staged`) — and `onStart` receives the finished options. `slow`: the
 * menu knows this machine draws slowly (the valley is then offered with a warning).
 */
export function NewGamePanel({ onPreview, onStart, staged, slow }: { onPreview: (g: Genome) => void; onStart: (o: NewGameOptions) => void | Promise<void>; staged: boolean; slow: boolean }) {
  const lowered = useSettings((s) => s.notice.lowered);
  const store = useMemo(() => saveStore(), []);
  const hasGame = useStore((s) => s.hasGame);
  const current = useStore((s) => s.game);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('');
  const [symmetry, setSymmetry] = useState<SymmetryMode>('auto');
  const [seed, setSeed] = useState(randomSeed);
  const [worldSeed, setWorldSeed] = useState(() => randomSeed() % 100000);
  const [ecosystem, setEcosystem] = useState<Ecosystem>('standard');
  // the cast: the ecosystem's own until the player edits it (a preset picked starts it afresh)
  const [cast, setCast] = useState<CastEntry[]>(() => castOf('standard'));
  const [castOpen, setCastOpen] = useState(false);
  const [capacity, setCapacity] = useState<number>(CAPACITIES[0]);
  const [scenario, setScenario] = useState<string>('');
  // a valley, or a planet of the player's design
  const [kindOfWorld, setKindOfWorld] = useState<'valley' | 'planet'>('valley');
  const planet = kindOfWorld === 'planet';
  const [design, setDesign] = useState<PlanetDesign>(EARTHLIKE);
  const chooseWorld = (k: 'valley' | 'planet') => {
    setKindOfWorld(k);
    // (a planet's scenario goes with the planet)
    if (k === 'valley' && sc?.planetOnly) setScenario('');
    // (a planet is a dozen valleys of land and more: it starts with room for the valley's largest; a valley
    // cannot hold a planet's largest)
    if (k === 'planet' && capacity === CAPACITIES[0]) setCapacity(PLANET_CAP);
    if (k === 'valley' && !CAPACITIES.includes(capacity)) setCapacity(CAPACITIES[CAPACITIES.length - 1]);
  };
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);
  const sc = SCENARIOS.find((x) => x.id === scenario) ?? null;
  const edited = useMemo(() => JSON.stringify(cast) !== JSON.stringify(castOf(ecosystem)), [cast, ecosystem]);
  const [startIn, setStartIn] = useState<GameView>('breed');
  const [confirm, setConfirm] = useState(false);
  // a default name the save list doesn't hold yet
  useEffect(() => {
    let live = true;
    void store
      .list()
      .then((l) => live && setName((n) => n || nextGameName([...l.map((h) => h.name), ...(hasGame ? [current.name] : [])])))
      .catch(() => live && setName((n) => n || 'Game 1'));
    return () => {
      live = false;
    };
  }, [store, hasGame, current.name]);
  const founder = useMemo(() => founderFor(seed, kind || null, symmetry), [seed, kind, symmetry]);
  useEffect(() => onPreview(founder), [founder, onPreview]);
  const start = () => {
    if (starting) return;
    const o: NewGameOptions = { name: cleanName(name, 'Game 1'), founder, symmetry, worldSeed, ecosystem, ...(edited ? { cast } : {}), ...(capacity !== CAPACITIES[0] ? { capacity } : {}), ...(sc ? { scenario: sc.id } : {}), ...(planet ? { planet: design } : {}), startIn };
    const r = onStart(o);
    if (!r) return;
    // (a planet is made first, off the page: the button says so meanwhile)
    setStarting(true);
    setStartErr(null);
    r.catch((e: unknown) => setStartErr(e instanceof Error ? e.message : 'The game could not be started.')).finally(() => setStarting(false));
  };
  const place = planet ? 'planet' : 'valley';
  return (
    <div className="newgame">
      <Row label="Name">
        <input value={name} maxLength={NAME_MAX} aria-label="Game name" onChange={(e) => setName(e.target.value)} />
      </Row>
      <section>
        <h3>Your first creature</h3>
        <Row label="Kind" hint={staged ? 'It is shown behind this menu.' : 'You will see it when the game starts.'}>
          <select value={kind} aria-label="Kind" onChange={(e) => setKind(e.target.value)}>
            <option value="">Any kind</option>
            {MORPHOTYPE_IDS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          {/* (with no stage to show it on, another of the kind is nothing a player can tell apart) */}
          {staged && <button className="plain" onClick={() => setSeed(randomSeed())} title="another creature of this kind">↻ Another</button>}
        </Row>
        {!kind && (
          <Row label="Symmetry">
            <Choice<SymmetryMode> label="Symmetry" value={symmetry} options={[{ v: 'auto', label: 'Any' }, { v: 'bilateral', label: 'Two-sided' }, { v: 'radial', label: 'Radial' }]} onChange={setSymmetry} />
          </Row>
        )}
      </section>
      <section>
        <h3>The world</h3>
        <Row label="World" hint={planet ? 'A whole world of your design: life starts in a homeland and spreads out over the generations.' : 'A valley 200 bu across: a lake, a river, woods and meadows.'}>
          <Choice<'valley' | 'planet'> label="World" value={kindOfWorld} options={[{ v: 'valley', label: 'A valley' }, { v: 'planet', label: 'A planet' }]} onChange={chooseWorld} />
        </Row>
        {planet && <PlanetDesigner design={design} seed={worldSeed} onChange={setDesign} />}
        <Row label="Scenario" hint={sc ? sc.goal : `A free ${place}: no goal but what you make of it.`}>
          <select
            value={scenario}
            aria-label="Scenario"
            onChange={(e) => {
              setScenario(e.target.value);
              // (a scenario made for a planet of its own sets the designer going from that one)
              const pick = SCENARIOS.find((x) => x.id === e.target.value);
              if (pick?.planet) setDesign({ ...pick.planet });
            }}
          >
            <option value="">None</option>
            {SCENARIOS.filter((x) => planet || !x.planetOnly).map((x) => (
              <option key={x.id} value={x.id}>{x.title}</option>
            ))}
          </select>
        </Row>
        {!sc && (
        <>
        <Row label="Wildlife" hint={edited ? 'Your own cast: the kinds and numbers below.' : ECO_WORDS[ecosystem].hint}>
          <Choice<Ecosystem | 'custom'>
            label="Wildlife"
            value={edited ? 'custom' : ecosystem}
            options={[...(['standard', 'sparse', 'empty'] as const).map((v) => ({ v, label: ECO_WORDS[v].label })), ...(edited ? [{ v: 'custom' as const, label: 'Yours' }] : [])]}
            onChange={(v) => {
              if (v === 'custom') return;
              setEcosystem(v);
              setCast(castOf(v));
            }}
          />
        </Row>
        <Row label="The cast" hint={`Which kinds start in the ${place}, and how many. Each ${place}'s founders are its own; ↻ shows another of a kind.`}>
          <button className="plain" aria-expanded={castOpen} onClick={() => setCastOpen(!castOpen)}>
            {castOpen ? 'Hide ▴' : 'Choose ▾'}
          </button>
        </Row>
        {castOpen && <CastEditor cast={cast} worldSeed={worldSeed} room={capacity} onChange={setCast} />}
        </>
        )}
        <Row label="Room for" hint={capacity === CAPACITIES[0] ? 'As many as are drawn whole.' : `Far off, animals are drawn as markers: a busy ${place} asks more of the computer.`}>
          <Choice<number> label="Room for" value={capacity} options={(planet ? PLANET_CAPS : CAPACITIES).map((v) => ({ v, label: `${v}` }))} onChange={setCapacity} />
        </Row>
        <Row label="Seed" hint={planet ? 'The same seed and design make the same planet.' : 'The same seed grows the same valley.'}>
          <input className="seed" type="number" min={0} max={4294967295} value={worldSeed} aria-label="Valley seed" onChange={(e) => setWorldSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)) >>> 0)} />
          <button className="plain" onClick={() => setWorldSeed(randomSeed() % 100000)} title={`a random ${place}`}>↻ Random</button>
        </Row>
      </section>
      <Row label="Begin in" hint={slow || lowered !== null ? VALLEY_SLOW : undefined}>
        <Choice<GameView> label="Begin in" value={startIn} options={[{ v: 'breed', label: 'The breeder' }, { v: 'world', label: planet ? 'The planet' : 'The valley' }]} onChange={setStartIn} />
      </Row>
      <div className="panel-foot">
        {startErr && <span className="warn">{startErr}</span>}
        {starting ? (
          <button className="primary big" disabled>Making the planet…</button>
        ) : confirm ? (
          <>
            <span className="warn">This replaces the game in progress (“{current.name}”). Save it first if you want to keep it.</span>
            <button className="primary" onClick={start}>Start anyway</button>
            <button className="plain" onClick={() => setConfirm(false)}>Cancel</button>
          </>
        ) : (
          <button className="primary big" onClick={() => (hasGame ? setConfirm(true) : start())}>Start game</button>
        )}
      </div>
    </div>
  );
}

// --- controls --------------------------------------------------------------------------------------

const CONTROLS: { where: string; rows: [string, string][] }[] = [
  {
    where: 'Everywhere',
    rows: [
      ['Esc', 'Open or close the menu'],
      ['Drag', 'Turn the view'],
      ['Scroll', 'Zoom'],
    ],
  },
  {
    where: 'The breeder',
    rows: [
      ['Click an offspring', 'It becomes the next parent'],
      ['Click the lineage', 'Go back to an ancestor and branch from it'],
      ['Click the menagerie', 'Take a collected creature as the parent'],
    ],
  },
  {
    where: 'The valley',
    rows: [
      ['W A S D / arrows', 'Pan over the ground (Shift: faster)'],
      ['Space', 'Pause or run time'],
      ['Click a creature', 'Select it — then follow it, or take it home to breed'],
      ['I', 'Close or open the selected creature’s panel'],
      [', and .', 'The previous or next one of its species'],
      ['Click a census row', 'Follow one of that species'],
      ['H', 'Hide or show every panel and the bar'],
      ['Drag a panel by its head', 'Move it (double-click its head to put it back)'],
      ['▾ on a panel', 'Fold it away to its head, or open it again'],
      ['⏩ pass time', 'Run the world on for a day … a century, then see what happened'],
    ],
  },
  {
    where: 'A planet',
    rows: [
      ['Drag', 'Spin the globe from afar; close by, turn the view'],
      ['Right-drag', 'Pan over the ground'],
      ['Scroll', 'Zoom toward the pointer'],
      ['Double-click', 'Fly there'],
      ['1 2 3 4', 'Orbit, a region, the ground, low'],
      ['F', 'The whole planet'],
    ],
  },
];

export function ControlsPanel() {
  return (
    <div className="controls">
      {CONTROLS.map((c) => (
        <section key={c.where}>
          <h3>{c.where}</h3>
          <dl>
            {c.rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
