// Drops: soul shards (XP/currency, magnetised to the player), health, and
// ultimate-gauge motes. Settle on terrain, then home in once the player is
// within magnet range.

import { Entity } from './entity.ts';
import type { World } from '../game/world.ts';
import { TAU, clamp, dist } from '../core/math.ts';
import { moveAndCollide } from '../core/physics.ts';
import { hexToRgb, rgba } from '../render/color.ts';
import { PAL } from '../content/design.ts';

export type PickupKind = 'soul' | 'heal' | 'gauge';

export class Pickup extends Entity {
  kind: PickupKind;
  value: number;
  private color: string;
  private age = 0;
  private life = 16;
  private magnet = false;
  private bob = Math.random() * TAU;
  private settled = false;

  constructor(kind: PickupKind, x: number, y: number, value: number) {
    super();
    this.kind = kind;
    this.value = value;
    this.w = kind === 'soul' ? 10 : 16;
    this.h = this.w;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.vx = (Math.random() - 0.5) * 180;
    this.vy = -180 - Math.random() * 120;
    this.color = kind === 'soul' ? PAL.cyan : kind === 'heal' ? PAL.jade : PAL.gold;
  }

  update(dt: number, world: World): void {
    this.age += dt;
    this.bob += dt * 6;
    if (this.age > this.life) {
      this.dead = true;
      return;
    }
    const p = world.player;
    if (p && !p.dead) {
      const d = dist(this.cx, this.cy, p.cx, p.cy);
      const range = this.kind === 'soul' ? world.run.stats.magnetRadius : 60;
      if (d < range) this.magnet = true;
      if (this.magnet) {
        const ang = Math.atan2(p.cy - this.cy, p.cx - this.cx);
        const pull = clamp(900 - d * 2, 260, 1000);
        this.vx += Math.cos(ang) * pull * dt * 4;
        this.vy += Math.sin(ang) * pull * dt * 4;
      }
      if (d < 22) {
        this.collect(world);
        return;
      }
    }

    if (this.magnet) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      this.vy = Math.min(this.vy + 1400 * dt, 900);
      const col = moveAndCollide(this, world.solids, dt);
      if (col.onGround) {
        this.settled = true;
        this.vx *= 0.7;
      }
    }
  }

  private collect(world: World): void {
    this.dead = true;
    if (this.kind === 'soul') {
      world.collectSoul(this.value);
    } else if (this.kind === 'heal') {
      world.run.hp = Math.min(world.run.stats.maxHp, world.run.hp + this.value);
      world.fx.text(this.cx, this.cy - 8, `+${this.value}`, PAL.jade, { size: 18 });
      world.audio.pickup();
    } else {
      world.gainUlt(this.value);
      world.fx.text(this.cx, this.cy - 8, 'CHARGE', PAL.gold, { size: 16 });
      world.audio.pickup();
    }
    world.particles.burst(this.cx, this.cy, 8, 160, {
      life: 0.3, size: 2.6, color: hexToRgb(this.color), additive: true, shrink: 0,
    });
  }

  render(ctx: CanvasRenderingContext2D, _world?: World): void {
    const x = this.cx;
    const y = this.cy + (this.settled && !this.magnet ? Math.sin(this.bob) * 2 : 0);
    const r = this.w / 2;
    const rgb = hexToRgb(this.color);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // glow
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, rgba(rgb.r, rgb.g, rgb.b, 0.7));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    if (this.kind === 'soul') {
      ctx.rotate(this.bob * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      // cross / spark mark
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      if (this.kind === 'heal') {
        ctx.moveTo(-r * 0.5, 0); ctx.lineTo(r * 0.5, 0);
        ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, r * 0.5);
      } else {
        ctx.moveTo(-r * 0.4, -r * 0.4); ctx.lineTo(r * 0.4, r * 0.4);
        ctx.moveTo(r * 0.4, -r * 0.4); ctx.lineTo(-r * 0.4, r * 0.4);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
