// Lightweight juice layer for floating text (damage / pickups) and expanding
// shockwave rings. Lives in world space; render() runs after the camera
// transform is applied. Heavier sparks/smoke go through ParticleSystem.

import { TAU, clamp01 } from '../core/math.ts';

interface FloatText {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  text: string;
  color: string;
  size: number;
  bold: boolean;
}

interface Shockwave {
  x: number;
  y: number;
  age: number;
  life: number;
  maxR: number;
  color: string;
  width: number;
  startR: number;
}

export class EffectsLayer {
  private texts: FloatText[] = [];
  private shocks: Shockwave[] = [];

  text(
    x: number,
    y: number,
    text: string,
    color: string,
    opts: { size?: number; bold?: boolean; vy?: number; vx?: number; life?: number } = {},
  ): void {
    this.texts.push({
      x,
      y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? -54,
      age: 0,
      life: opts.life ?? 0.85,
      text,
      color,
      size: opts.size ?? 22,
      bold: opts.bold ?? true,
    });
  }

  shockwave(
    x: number,
    y: number,
    maxR: number,
    color: string,
    opts: { life?: number; width?: number; startR?: number } = {},
  ): void {
    this.shocks.push({
      x,
      y,
      age: 0,
      life: opts.life ?? 0.4,
      maxR,
      color,
      width: opts.width ?? 4,
      startR: opts.startR ?? 6,
    });
  }

  update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 60 * dt; // gentle gravity so numbers arc
      if (t.age >= t.life) this.texts.splice(i, 1);
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.age += dt;
      if (s.age >= s.life) this.shocks.splice(i, 1);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // shockwaves (additive rings)
    if (this.shocks.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.shocks) {
        const t = s.age / s.life;
        const e = 1 - (1 - t) * (1 - t); // ease-out
        const r = s.startR + (s.maxR - s.startR) * e;
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width * (1 - t) + 0.6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // floating text
    if (this.texts.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of this.texts) {
        const k = t.age / t.life;
        const alpha = k < 0.15 ? clamp01(k / 0.15) : 1 - clamp01((k - 0.15) / 0.85);
        const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1;
        ctx.globalAlpha = alpha;
        ctx.font = `${t.bold ? '900' : '600'} ${t.size * pop}px "Hiragino Sans", system-ui, sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.restore();
    }
  }

  clear(): void {
    this.texts.length = 0;
    this.shocks.length = 0;
  }
}
