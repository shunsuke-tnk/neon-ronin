// Projectiles fired by enemies and some player weapons. World resolves their
// collisions; they handle their own motion, trail and rendering.

import { Entity } from './entity.ts';
import type { World } from '../game/world.ts';
import type { Faction } from '../content/design.ts';
import { TAU } from '../core/math.ts';
import { hexToRgb } from '../render/color.ts';

export type ProjKind = 'orb' | 'bolt' | 'wave' | 'fang';

export interface ProjOpts {
  x: number;
  y: number;
  vx: number;
  vy: number;
  faction: Faction;
  damage: number;
  color: string;
  coreColor?: string;
  radius?: number;
  life?: number;
  kind?: ProjKind;
  pierce?: boolean;
  gravity?: number;
  knockback?: number;
  /** Homing strength (0 = none). */
  homing?: number;
  /** Ignore enemy shields (黙 wave). */
  breakShield?: boolean;
}

export class Projectile extends Entity {
  faction: Faction;
  damage: number;
  color: string;
  coreColor: string;
  radius: number;
  age = 0;
  maxLife: number;
  kind: ProjKind;
  pierce: boolean;
  gravity: number;
  knockback: number;
  homing: number;
  breakShield: boolean;
  spin = Math.random() * TAU;
  hitIds = new Set<number>();
  private rgb: { r: number; g: number; b: number };

  constructor(o: ProjOpts) {
    super();
    this.radius = o.radius ?? 7;
    this.w = this.radius * 2;
    this.h = this.radius * 2;
    this.x = o.x - this.radius;
    this.y = o.y - this.radius;
    this.vx = o.vx;
    this.vy = o.vy;
    this.faction = o.faction;
    this.damage = o.damage;
    this.color = o.color;
    this.coreColor = o.coreColor ?? '#ffffff';
    this.maxLife = o.life ?? 3;
    this.kind = o.kind ?? 'orb';
    this.pierce = o.pierce ?? false;
    this.gravity = o.gravity ?? 0;
    this.knockback = o.knockback ?? 0;
    this.homing = o.homing ?? 0;
    this.breakShield = o.breakShield ?? false;
    this.rgb = hexToRgb(o.color);
  }

  update(dt: number, world: World): void {
    this.age += dt;
    if (this.age >= this.maxLife) {
      this.dead = true;
      return;
    }
    if (this.homing > 0 && this.faction === 'enemy' && world.player && !world.player.dead) {
      const tx = world.player.cx;
      const ty = world.player.cy;
      const ang = Math.atan2(ty - this.cy, tx - this.cx);
      const sp = Math.hypot(this.vx, this.vy);
      const cur = Math.atan2(this.vy, this.vx);
      let d = ang - cur;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const na = cur + Math.max(-this.homing * dt, Math.min(this.homing * dt, d));
      this.vx = Math.cos(na) * sp;
      this.vy = Math.sin(na) * sp;
    }
    if (this.gravity) this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += dt * 9;

    // trailing embers
    if (this.kind !== 'wave') {
      world.particles.spawn({
        x: this.cx,
        y: this.cy,
        life: 0.3,
        size: this.radius * 0.7,
        color: this.rgb,
        additive: true,
        shrink: 0,
        drag: 3,
      });
    }
  }

  render(ctx: CanvasRenderingContext2D, _world?: World): void {
    const x = this.cx;
    const y = this.cy;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (this.kind === 'wave') {
      // expanding crescent shockwave
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 5;
      ctx.globalAlpha = Math.max(0, 1 - this.age / this.maxLife);
      ctx.beginPath();
      ctx.arc(x, y, this.radius, -1.1, 1.1);
      ctx.stroke();
      ctx.restore();
      return;
    }
    // glow
    const g = ctx.createRadialGradient(x, y, 0, x, y, this.radius * 3);
    g.addColorStop(0, this.color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, this.radius * 3, 0, TAU);
    ctx.fill();
    // core
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.coreColor;
    if (this.kind === 'bolt' || this.kind === 'fang') {
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.beginPath();
      ctx.moveTo(this.radius * 1.6, 0);
      ctx.lineTo(-this.radius, this.radius * 0.7);
      ctx.lineTo(-this.radius * 0.5, 0);
      ctx.lineTo(-this.radius, -this.radius * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, this.radius * 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
