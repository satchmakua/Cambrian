/**
 * Keyboard panning for the World camera: WASD or the arrow keys slide the view over the ground,
 * relative to where the camera faces (W / ↑ away from you, A / ← to the left), at a speed that scales
 * with the zoom so it feels the same from a creature's whiskers to the whole valley; Shift hurries.
 * Pure — the World scene feeds it the keys held, the camera's heading and its distance.
 */

/** The keys that pan (KeyboardEvent.code). */
export const PAN_KEYS: ReadonlySet<string> = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

export interface PanAxes {
  fwd: number; // +1 away from the viewer, −1 toward
  right: number; // +1 to the right, −1 to the left
  fast: boolean;
}

/** The pan direction asked for by the held keys (opposite keys cancel). */
export function keysToAxes(held: ReadonlySet<string>): PanAxes {
  const on = (...codes: string[]) => (codes.some((c) => held.has(c)) ? 1 : 0);
  return {
    fwd: on('KeyW', 'ArrowUp') - on('KeyS', 'ArrowDown'),
    right: on('KeyD', 'ArrowRight') - on('KeyA', 'ArrowLeft'),
    fast: held.has('ShiftLeft') || held.has('ShiftRight') || held.has('Shift'),
  };
}

/** Pan speed (bu/s) at a camera distance: proportional to the zoom, with a floor for close-ups. */
export function panSpeed(distance: number, fast: boolean): number {
  return Math.max(2.5, distance * 0.6) * (fast ? 2.5 : 1);
}

/**
 * The ground-plane step for one frame: `(vx, vz)` is the camera's view direction (any length; its
 * vertical part is ignored), `distance` its distance to the orbit target. Diagonals are no faster.
 */
export function panDelta(axes: PanAxes, vx: number, vz: number, distance: number, dt: number): [number, number] {
  if (!axes.fwd && !axes.right) return [0, 0];
  const l = Math.hypot(vx, vz);
  // looking straight down there is no heading: treat the screen's up as −Z
  const fx = l > 1e-6 ? vx / l : 0;
  const fz = l > 1e-6 ? vz / l : -1;
  // right = forward × up
  const rx = -fz;
  const rz = fx;
  let dx = fx * axes.fwd + rx * axes.right;
  let dz = fz * axes.fwd + rz * axes.right;
  const n = Math.hypot(dx, dz) || 1;
  const step = panSpeed(distance, axes.fast) * dt;
  dx = (dx / n) * step;
  dz = (dz / n) * step;
  return [dx, dz];
}
