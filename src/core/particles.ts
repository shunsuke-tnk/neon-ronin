// Pooled particle system. Particles live in world space; render() assumes the
// context is already translated by the camera. Normal and additive particles
// are drawn in two passes to minimise composite-mode switches.

import { TAU } from './math.ts';
import { RGB, rgba } from '../render/color.ts';

export type ParticleKind = 'dot' | 'spark' | 'glow';

export interface ParticleOpts {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life: number;
  size: number;
  color: RGB;
  fadeColor?: RGB;
  /** Velocity damping per second (0 = none, ~4 = strong). */
  drag?: number;
  /** Downward acceleration (world units / s^2). */
  grav?: number;
  additive?: boolean;
  /** Size multiplier at end of life (1 = no shrink, 0 = vanish). */
  shrink?: number;
  kind?: ParticleKind;
  /** Extra alpha multiplier. */
  alpha?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  cr: number;
  cg: number;
  cb: number;
  fr: number;
  fg: number;
  fb: number;
  hasFade: boolean;
  drag: number;
  grav: number;
  additive: boolean;
  shrink: number;
  kind: ParticleKind;
  alpha: number;
}

const MAX = 4000;

export class ParticleSystem {
  private parts: Particle[] = [];
  private free: Particle[] = [];

  get count(): number {
    return this.parts.length;
  }

  private obtain(): Particle {
    const p = this.free.pop();
    if (p) return p;
    return {
      x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 1,
      cr: 255, cg: 255, cb: 255, fr: 255, fg: 255, fb: 255,
      hasFade: false, drag: 0, grav: 0, additive: false,
      shrink: 1, kind: 'dot', alpha: 1,
    };
  }

  spawn(o: ParticleOpts): void {
    if (this.parts.length >= MAX) return;
    const p = this.obtain();
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.age = 0;
    p.life = o.life;
    p.size = o.size;
    p.cr = o.color.r;
    p.cg = o.color.g;
    p.cb = o.color.b;
    if (o.fadeColor) {
      p.hasFade = true;
      p.fr = o.fadeColor.r;
      p.fg = o.fadeColor.g;
      p.fb = o.fadeColor.b;
    } else {
      p.hasFade = false;
    }
    p.drag = o.drag ?? 0;
    p.grav = o.grav ?? 0;
    p.additive = o.additive ?? false;
    p.shrink = o.shrink ?? 1;
    p.kind = o.kind ?? 'dot';
    p.alpha = o.alpha ?? 1;
    this.parts.push(p);
  }

  /** Radial burst of particles. */
  burst(
    x: number,
    y: number,
    count: number,
    speed: number,
    o: Omit<ParticleOpts, 'x' | 'y' | 'vx' | 'vy'>,
    spread = TAU,
    baseAngle = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      const a = baseAngle + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.spawn({
        ...o,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
      });
    }
  }

  update(dt: number): void {
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        // swap-remove and recycle
        const last = parts.pop()!;
        if (i < parts.length) parts[i] = last;
        this.free.push(p);
        continue;
      }
      if (p.drag !== 0) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      if (p.grav !== 0) p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.renderPass(ctx, false);
    this.renderPass(ctx, true);
  }

  private renderPass(ctx: CanvasRenderingContext2D, additive: boolean): void {
    const parts = this.parts;
    let drew = false;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.additive !== additive) continue;
      if (!drew) {
        ctx.save();
        ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
        drew = true;
      }
      const t = p.age / p.life;
      const a = (1 - t) * p.alpha;
      let r = p.cr;
      let g = p.cg;
      let b = p.cb;
      if (p.hasFade) {
        r = p.cr + (p.fr - p.cr) * t;
        g = p.cg + (p.fg - p.cg) * t;
        b = p.cb + (p.fb - p.cb) * t;
      }
      const size = p.size * (1 - (1 - p.shrink) * t);

      if (p.kind === 'spark') {
        const len = Math.min(26, Math.hypot(p.vx, p.vy) * 0.05) + size;
        const inv = 1 / (Math.hypot(p.vx, p.vy) || 1);
        ctx.strokeStyle = rgba(r, g, b, a);
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * inv * len, p.y - p.vy * inv * len);
        ctx.stroke();
      } else if (p.kind === 'glow') {
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
        grd.addColorStop(0, rgba(r, g, b, a));
        grd.addColorStop(1, rgba(r, g, b, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = rgba(r, g, b, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, TAU);
        ctx.fill();
      }
    }
    if (drew) ctx.restore();
  }

  clear(): void {
    while (this.parts.length) this.free.push(this.parts.pop()!);
  }
}
