/**
 * Scissored sub-views of one shared canvas: where an element's rectangle falls inside the canvas.
 *
 * Both rectangles are `getBoundingClientRect()`s (window CSS pixels); the result is in the canvas's
 * CSS pixels in three's viewport convention — measured from the canvas's LEFT and BOTTOM edges, as
 * `WebGLRenderer.setViewport`/`setScissor` take them. (drei's <View> tested "offscreen" by comparing
 * the element's WINDOW position with the canvas's SIZE, which only holds for a canvas at the window's
 * top-left corner: in the breeder's right-hand rail every thumbnail read as offscreen after its first
 * frame, and the litter froze.)
 */
export interface ScissorRect {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

type Rect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/** The element's rectangle within the canvas, or null when it is empty or wholly outside it. */
export function scissorRect(el: Rect, canvas: Rect): ScissorRect | null {
  if (el.width < 1 || el.height < 1) return null;
  if (el.right <= canvas.left || el.left >= canvas.right || el.bottom <= canvas.top || el.top >= canvas.bottom) return null;
  return { left: el.left - canvas.left, bottom: canvas.bottom - el.bottom, width: el.width, height: el.height };
}
