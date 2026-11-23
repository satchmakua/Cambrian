/**
 * A World-screen panel the player can move and fold: dragged by its head (anywhere on it but a button or a
 * field), folded to its head and opened again, and put back where it was made with a double click on its
 * head. Where each one sits, and whether it is folded, is kept in this browser (a viewer's own convenience:
 * nothing in a save), and a panel is never dragged off the screen past its head.
 *
 * The drag writes the panel's `translate` itself, a frame at a time, and tells React only when it is let go:
 * the screen the panels sit on is a large component, not to be drawn again sixty times a second.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const KEY = 'cambrian.panels';

interface Placed {
  x: number;
  y: number;
  folded: boolean;
}

function readAll(): Record<string, Placed> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, Placed>) : {};
  } catch {
    return {};
  }
}

function keep(id: string, p: Placed): void {
  try {
    const all = readAll();
    all[id] = p;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* not kept: it lasts until the page closes */
  }
}

function placedOf(id: string): Placed {
  const p = readAll()[id];
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y, folded: !!p.folded } : { x: 0, y: 0, folded: false };
}

/** how much of a panel's head stays on the screen, at least (px) */
const KEEP = 48;

export interface Panel<T extends HTMLElement> {
  /** the panel itself */
  ref: (el: T | null) => void;
  /** its head: drag it, double-click to put it back */
  head: { onPointerDown: (e: ReactPointerEvent) => void; onDoubleClick: (e: React.MouseEvent) => void; className: string };
  folded: boolean;
  fold: (v?: boolean) => void;
}

export function usePanel<T extends HTMLElement = HTMLElement>(id: string): Panel<T> {
  const [placed, setPlaced] = useState<Placed>(() => placedOf(id));
  const el = useRef<T | null>(null);
  const at = useRef(placed);
  at.current = placed;
  const show = (x: number, y: number) => {
    if (el.current) el.current.style.translate = x || y ? `${Math.round(x)}px ${Math.round(y)}px` : '';
  };
  // (the panel mounted, or put back: where it sits)
  useEffect(() => show(placed.x, placed.y), [placed.x, placed.y]);
  const ref = useCallback((e: T | null) => {
    el.current = e;
    if (e) show(at.current.x, at.current.y);
  }, []);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !el.current) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ox = at.current.x, oy = at.current.y;
    // (the panel's box with no drag on it, to hold its head on the screen)
    const box = el.current.getBoundingClientRect();
    const left0 = box.left - ox, top0 = box.top - oy;
    let x = ox, y = oy;
    const move = (m: PointerEvent) => {
      x = Math.min(window.innerWidth - KEEP - left0, Math.max(KEEP - box.width - left0, ox + m.clientX - sx));
      y = Math.min(window.innerHeight - KEEP - top0, Math.max(-top0, oy + m.clientY - sy));
      show(x, y);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const p = { ...at.current, x, y };
      keep(id, p);
      setPlaced(p);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    const p = { ...at.current, x: 0, y: 0 };
    keep(id, p);
    setPlaced(p);
  };
  const fold = (v?: boolean) => {
    const p = { ...at.current, folded: v ?? !at.current.folded };
    keep(id, p);
    setPlaced(p);
  };
  return { ref, head: { onPointerDown, onDoubleClick, className: 'panel-head' }, folded: placed.folded, fold };
}
