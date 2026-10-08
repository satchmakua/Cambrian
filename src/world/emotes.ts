/**
 * Mood icons — tiny speech-bubble sprites over a creature that say at a glance what it is doing:
 * asleep (Zz), courting (a heart), bolting in alarm (!), on the hunt (claw marks). They make the
 * World legible from a distance, the way a nature documentary's narrator does. Drawn once each on a
 * canvas and shared by every actor (one SpriteMaterial per icon).
 */
import * as THREE from 'three';
import type { Action } from '../sim/world';

export type Emote = 'sleep' | 'love' | 'alarm' | 'hunt';

const EMOTE_OF: Partial<Record<Action, Emote>> = { sleep: 'sleep', mate: 'love', flee: 'alarm', hunt: 'hunt' };

export function emoteFor(action: Action): Emote | null {
  return EMOTE_OF[action] ?? null;
}

const S = 128;

function bubble(ctx: CanvasRenderingContext2D, ring: string): void {
  ctx.clearRect(0, 0, S, S);
  // a soft round bubble with a small tail pointing down at the creature
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(250,248,242,0.94)';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2 - 8, 46, 0, Math.PI * 2);
  ctx.moveTo(S / 2 - 12, S / 2 + 30);
  ctx.lineTo(S / 2, S / 2 + 52);
  ctx.lineTo(S / 2 + 12, S / 2 + 30);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 5;
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2 - 8, 46, 0, Math.PI * 2);
  ctx.stroke();
}

function draw(e: Emote): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const cx = S / 2, cy = S / 2 - 8;
  if (e === 'sleep') {
    bubble(ctx, '#7f9cc9');
    ctx.fillStyle = '#4d6c9e';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Z', cx - 12, cy + 8);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('z', cx + 18, cy - 14);
  } else if (e === 'love') {
    bubble(ctx, '#e58aa6');
    ctx.fillStyle = '#d94d77';
    ctx.beginPath();
    ctx.moveTo(cx, cy + 24);
    ctx.bezierCurveTo(cx - 40, cy - 2, cx - 22, cy - 34, cx, cy - 14);
    ctx.bezierCurveTo(cx + 22, cy - 34, cx + 40, cy - 2, cx, cy + 24);
    ctx.fill();
  } else if (e === 'alarm') {
    bubble(ctx, '#e8b44a');
    ctx.fillStyle = '#d0861b';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', cx, cy + 4);
  } else {
    bubble(ctx, '#d86a5a');
    ctx.strokeStyle = '#b8402e';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    for (const dx of [-16, 0, 16]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx - 9, cy - 22);
      ctx.quadraticCurveTo(cx + dx + 4, cy, cx + dx - 3, cy + 22);
      ctx.stroke();
    }
  }
  return c;
}

let MATS: Record<Emote, THREE.SpriteMaterial> | null = null;

/** The shared sprite material for an icon (built on first use — needs a DOM canvas). */
export function emoteMaterial(e: Emote): THREE.SpriteMaterial {
  if (!MATS) {
    const make = (k: Emote) => {
      const tex = new THREE.CanvasTexture(draw(k));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    };
    MATS = { sleep: make('sleep'), love: make('love'), alarm: make('alarm'), hunt: make('hunt') };
  }
  return MATS[e];
}
