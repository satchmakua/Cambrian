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
import { usePortrait } from '../../viewer/portrait';
import { exportSave, founderFor, importSave, loadGame, saveGame, type NewGameOptions } from '../game';
import { cleanName, describeSave, nextGameName, saveStore, NAME_MAX, type Ecosystem, type SaveHeader } from '../saves';
import { AUTOSAVE_MINUTES, DENSITIES, RENDER_SCALES, useSettings, type CreatureDetail, type QualityPreset } from '../settings';
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
  const { setPreset, setGraphics, setAudio, setGameplay, resetDefaults } = useSettings.getState();
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
        <Row label="Quality" hint={g.preset === 'custom' ? 'Custom — the options below were changed by hand.' : 'Sets every option below at once.'}>
          <Choice<QualityPreset | 'custom'>
            label="Quality"
            value={g.preset}
            options={[{ v: 'low', label: 'Low' }, { v: 'medium', label: 'Medium' }, { v: 'high', label: 'High' }]}
            onChange={(v) => v !== 'custom' && setPreset(v)}
          />
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
        <Row label="Creature detail" hint="How far away creatures keep their features, and how fine their skin is up close.">
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
        <button className="plain" onClick={resetDefaults}>Reset to defaults</button>
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

function SlotPortrait({ genome }: { genome: Genome }) {
  const url = usePortrait(genome);
  return <span className="slot-portrait">{url && <img src={url} alt="" />}</span>;
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
                  <span>{describeSave(h.summary)}</span>
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

// --- new game --------------------------------------------------------------------------------------

const ECO_WORDS: Record<Ecosystem, { label: string; hint: string }> = {
  standard: { label: 'Lively', hint: 'Grazers, browsers, birds, fish and their hunters are already at home.' },
  sparse: { label: 'Sparse', hint: 'The same animals, half as many: more room for yours.' },
  empty: { label: 'Empty', hint: 'Nobody but what you release.' },
};

const randomSeed = () => (Math.random() * 0xffffffff) >>> 0; // UI layer only; the engine's RNG is seeded

/**
 * New-game set-up. The founder is shown on the stage behind the menu as it is chosen (`onPreview`),
 * and `onStart` receives the finished options.
 */
export function NewGamePanel({ onPreview, onStart }: { onPreview: (g: Genome) => void; onStart: (o: NewGameOptions) => void }) {
  const store = useMemo(() => saveStore(), []);
  const hasGame = useStore((s) => s.hasGame);
  const current = useStore((s) => s.game);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('');
  const [symmetry, setSymmetry] = useState<SymmetryMode>('auto');
  const [seed, setSeed] = useState(randomSeed);
  const [worldSeed, setWorldSeed] = useState(() => randomSeed() % 100000);
  const [ecosystem, setEcosystem] = useState<Ecosystem>('standard');
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
  const start = () => onStart({ name: cleanName(name, 'Game 1'), founder, symmetry, worldSeed, ecosystem, startIn });
  return (
    <div className="newgame">
      <Row label="Name">
        <input value={name} maxLength={NAME_MAX} aria-label="Game name" onChange={(e) => setName(e.target.value)} />
      </Row>
      <section>
        <h3>Your first creature</h3>
        <Row label="Kind" hint="It is shown behind this menu.">
          <select value={kind} aria-label="Kind" onChange={(e) => setKind(e.target.value)}>
            <option value="">Any kind</option>
            {MORPHOTYPE_IDS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <button className="plain" onClick={() => setSeed(randomSeed())} title="another creature of this kind">↻ Another</button>
        </Row>
        {!kind && (
          <Row label="Symmetry">
            <Choice<SymmetryMode> label="Symmetry" value={symmetry} options={[{ v: 'auto', label: 'Any' }, { v: 'bilateral', label: 'Two-sided' }, { v: 'radial', label: 'Radial' }]} onChange={setSymmetry} />
          </Row>
        )}
      </section>
      <section>
        <h3>The valley</h3>
        <Row label="Wildlife" hint={ECO_WORDS[ecosystem].hint}>
          <Choice<Ecosystem> label="Wildlife" value={ecosystem} options={(['standard', 'sparse', 'empty'] as const).map((v) => ({ v, label: ECO_WORDS[v].label }))} onChange={setEcosystem} />
        </Row>
        <Row label="Seed" hint="The same seed grows the same valley.">
          <input className="seed" type="number" min={0} max={4294967295} value={worldSeed} aria-label="Valley seed" onChange={(e) => setWorldSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)) >>> 0)} />
          <button className="plain" onClick={() => setWorldSeed(randomSeed() % 100000)} title="a random valley">↻ Random</button>
        </Row>
      </section>
      <Row label="Begin in">
        <Choice<GameView> label="Begin in" value={startIn} options={[{ v: 'breed', label: 'The breeder' }, { v: 'world', label: 'The valley' }]} onChange={setStartIn} />
      </Row>
      <div className="panel-foot">
        {confirm ? (
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
      ['Click a census row', 'Follow one of that species'],
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
