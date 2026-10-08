/**
 * The documentary's voice: the caption read aloud with the browser's own speech synthesis (no
 * recordings) — a measured, low British voice where the system has one. It speaks when the story
 * changes, never over itself, and at most every few seconds.
 */
const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu',
};

/** Spell out the Greek letters of species names so the voice can say them. */
export function speakable(text: string): string {
  return text.replace(/[α-μ]/g, (g) => GREEK[g] ?? g).replace(/(\d)/g, ' $1');
}

const OPENERS = ['Here,', 'Watch now:', 'Out in the valley,', 'And here,', 'Look closely:', 'Meanwhile,', ''];

/** A spoken sentence for a caption, its opening varied but fixed per `key` (so a scene that holds
 *  doesn't change its words). */
export function sentence(subject: string, doing: string, key: number): string {
  const o = OPENERS[Math.abs(key) % OPENERS.length];
  const s = `${o} ${o ? subject.charAt(0).toLowerCase() + subject.slice(1) : subject} ${doing}.`.trim();
  return speakable(s.charAt(0).toUpperCase() + s.slice(1));
}

class Narrator {
  private on = false;
  private last = '';
  private lastAt = -1e9;
  private voice: SpeechSynthesisVoice | null = null;

  get available(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  setOn(v: boolean): void {
    this.on = v;
    this.last = '';
    if (!v && this.available) window.speechSynthesis.cancel();
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    if (this.voice) return this.voice;
    const vs = window.speechSynthesis.getVoices();
    const score = (v: SpeechSynthesisVoice) =>
      (v.lang === 'en-GB' ? 4 : v.lang.startsWith('en') ? 2 : 0) + (/daniel|male|arthur|george|oliver/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
    this.voice = vs.filter((v) => v.lang.startsWith('en')).sort((a, b) => score(b) - score(a))[0] ?? null;
    return this.voice;
  }

  /** Say this line if it is new and the voice is free (or has been talking a while). */
  say(text: string): void {
    if (!this.on || !this.available || !text || text === this.last) return;
    const now = performance.now();
    const synth = window.speechSynthesis;
    if (synth.speaking && now - this.lastAt < 7000) return;
    this.last = text;
    this.lastAt = now;
    const u = new SpeechSynthesisUtterance(text);
    const v = this.pickVoice();
    if (v) u.voice = v;
    u.rate = 0.9;
    u.pitch = 0.82;
    synth.cancel();
    synth.speak(u);
  }
}

export const NARRATOR = new Narrator();
