/**
 * Keys: who gets them.
 */

/**
 * Is this where text is being typed? Only there does Esc keep its own meaning (clear the field, leave
 * it). A slider, a tick box or a button holds the keyboard focus after a click too — the breeder is
 * mostly sliders — and Esc means nothing to them: it must still open the menu.
 */
const TEXT_INPUTS = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number', '']);
export function typingIn(target: unknown): boolean {
  const t = target as { tagName?: string; type?: string; isContentEditable?: boolean } | null;
  if (!t || typeof t.tagName !== 'string') return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  return tag === 'INPUT' && TEXT_INPUTS.has((t.type ?? '').toLowerCase());
}
