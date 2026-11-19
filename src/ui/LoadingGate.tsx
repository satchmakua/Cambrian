/**
 * The loading screen in front of a game screen.
 *
 * A screen is mounted behind it and gets ready there: its code fetched, its creatures grown, their
 * shaders built, their first frames drawn whole and timed — and the graphics lowered, where those
 * frames were slow, and timed again. Only then does it lift: a player is never let into a screen that
 * cannot answer a click, or that draws a frame a second. (On a laptop's built-in graphics the creature's
 * shader alone takes seconds to build; before there was a loading screen the breeder sat there blank,
 * its buttons dead, for all of it.)
 *
 * It says what is being done, and how long it has taken; after a few seconds, why it can take long; and
 * where the game has found the drawing slow, what draws it. The way back to the menu is always there,
 * and after a while a way in regardless.
 *
 * Nothing of the 3D library is imported here: the menu shows it while the game's code is fetched.
 */
import { useEffect, useRef, useState } from 'react';
import type { GateStep } from './gate';

/** (s) before the hint saying why it can take long, and before the way in regardless */
export const GATE_WHY_S = 5;
export const GATE_ENTER_S = 12;
/** how long the screen takes to fade once it lifts (ms; matches the stylesheet) */
const FADE_MS = 300;

// One clock from the click that asked for a screen to the moment it is let in: the gate shown while
// the game's code is fetched and the one shown while its screen gets ready are one wait to the player.
let clock: { screen: string; since: number } | null = null;

export function LoadingGate({
  screen,
  steps,
  open,
  hint,
  onMenu,
  onEnter,
}: {
  /** the screen being got ready (its clock carries over from one gate to the next for the same one) */
  screen: string;
  steps: GateStep[];
  /** the screen behind is ready: the gate fades out and is gone */
  open: boolean;
  /** a line on what draws the game, when the game has found the drawing slow */
  hint?: string | null;
  onMenu: () => void;
  /** go in before the screen is ready (offered after GATE_ENTER_S) */
  onEnter?: () => void;
}) {
  const [since] = useState(() => {
    if (!clock || clock.screen !== screen) clock = { screen, since: Date.now() };
    return clock.since;
  });
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - since) / 1000));
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (open) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - since) / 1000)), 500);
    return () => clearInterval(t);
  }, [open, since]);
  useEffect(() => {
    if (!open) {
      setGone(false);
      return;
    }
    clock = null;
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [open]);
  const leave = () => {
    clock = null;
    onMenu();
  };
  // (the keyboard's focus is taken off the screen behind — a Space or an Enter must not press one of its
  // buttons — and given to no button here either: a key still held from the menu would press it)
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) card.current?.focus();
  }, [open]);
  if (gone) return null;
  return (
    <div ref={card} tabIndex={-1} className={`gate${open ? ' leaving' : ''}`} role="dialog" aria-modal="true" aria-label="Loading" aria-busy={!open}>
      <div className="gate-card">
        <h1>Cambrian</h1>
        <p className="gate-lead">Getting the creatures ready…</p>
        <ol className="gate-steps">
          {steps.map((s) => (
            <li key={s.label} className={s.state}>
              <span className="gate-mark" aria-hidden="true">{s.state === 'done' ? '✓' : s.state === 'now' ? '' : '·'}</span>
              <span>{s.label}</span>
              {s.detail && <small>{s.detail}</small>}
            </li>
          ))}
        </ol>
        <p className="gate-time">{seconds} s</p>
        {seconds >= GATE_WHY_S && (
          <p className="gate-why">
            The first time takes longest: the browser builds the shaders that draw the creatures, and keeps
            them for later visits.
          </p>
        )}
        {hint && <p className="gate-hint">{hint}</p>}
        <div className="gate-actions">
          <button className="plain" onClick={leave}>Back to the menu</button>
          {onEnter && seconds >= GATE_ENTER_S && <button className="plain" onClick={onEnter} title="go in now; what is not ready yet appears when it is">Go in now</button>}
        </div>
      </div>
    </div>
  );
}
