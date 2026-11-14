/**
 * A screen that fails must not take the game with it.
 *
 * React unmounts everything when a render throws and nothing catches it: one creature that will not
 * draw, or a screen whose code could not be fetched, left a blank page — and, since the game the
 * browser holds was the same on the next visit, left it blank again. This catches what a screen
 * throws and says so, with the ways out a player needs: try again, go back to the main menu (the game
 * is kept as it was last written; a save slot is untouched either way), or reload.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useStore } from './store';

/** Did this come from fetching a screen's code (a dropped connection, a page older than the site)? */
export function isLoadFailure(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading dynamically/i.test(text);
}

/** What to tell the player: one plain sentence, and the error's own words underneath. */
export function failureWords(error: unknown): { title: string; advice: string; detail: string } {
  const detail = error instanceof Error ? error.message : String(error);
  if (isLoadFailure(error)) {
    return { title: 'This screen could not be loaded', advice: 'The connection dropped, or the game has been updated since this page was opened. Reloading fetches it afresh — your game is kept.', detail };
  }
  return { title: 'Something went wrong on this screen', advice: 'Your game is kept as it was last written, and your save slots are untouched. You can try again, or go back to the main menu.', detail };
}

/**
 * Fetch a screen's code, once more after a moment if the first try fails (a blip is the usual cause;
 * a failure that lasts is shown by the boundary, with Reload).
 */
export function fetching<T>(load: () => Promise<T>, waitMs = 700): () => Promise<T> {
  return () => load().catch(() => new Promise<T>((resolve, reject) => setTimeout(() => load().then(resolve, reject), waitMs)));
}

/**
 * A part of a screen that may fail on its own — a stage drawing one creature — without taking the
 * screen with it: on a fault it simply is not drawn (or `fallback` is). It tries again when
 * `resetKey` changes (another creature).
 */
export class PartBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; resetKey?: unknown }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('A part of the screen failed to draw:', error);
  }

  componentDidUpdate(prev: { resetKey?: unknown }): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

interface Props {
  children: ReactNode;
}
interface State {
  error: unknown;
  failed: boolean;
}

export class ScreenBoundary extends Component<Props, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('A screen failed to draw:', error, info.componentStack);
  }

  private retry = () => this.setState({ error: null, failed: false });
  private toMenu = () => {
    useStore.getState().setView('menu');
    this.retry();
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const words = failureWords(this.state.error);
    const onMenu = useStore.getState().view === 'menu';
    const load = isLoadFailure(this.state.error);
    return (
      <div className="screen-failed" role="alert">
        <div className="screen-failed-card">
          <h2>{words.title}</h2>
          <p>{words.advice}</p>
          {words.detail && <pre>{words.detail}</pre>}
          <div className="row">
            {load ? (
              <button className="primary" onClick={() => location.reload()}>Reload</button>
            ) : (
              <button className="primary" onClick={this.retry}>Try again</button>
            )}
            {!onMenu && <button onClick={this.toMenu}>Main menu</button>}
            {!load && <button onClick={() => location.reload()}>Reload</button>}
          </div>
        </div>
      </div>
    );
  }
}
