// Config-driven enemy. A single class covers all standard mob archetypes via
// a `kind` switch (cheaper than many subclasses for this scope). Bosses are
// handled separately. Ground kinds obey gravity/terrain; flyers hover.

import { Entity } from './entity.ts';
import type { World } from '../game/world.ts';
import { TAU, clamp, damp, sign, rand } from '../core/math.ts';
import { moveAndCollide } from '../core/physics.ts';
import { hexToRgb, rgba } from '../render/color.ts';
import { PAL } from '../content/design.ts';
import { getImage, ready, drawSprite } from '../render/assets.ts';

export type EnemyKind = 'grunt' | 'drone' | 'guard' | 'charger' | 'flyer';

const SPRITES: Record<EnemyKind, string> = {
  grunt: 'enemy_grunt.png',
  drone: 'enemy_drone.png',
  guard: 'enemy_guard.png',
  charger: 'enemy_charger.png',
  flyer: 'enemy_flyer.png',
};

interface EnemyConfig {
  hp: number;
  w: number;
  h: number;
  speed: number;
  damage: number;
  color: string;
  core: string;
  fly: boolean;
  shielded: boolean;
  soul: number;
  shootInterval?: number;
}

const CONFIGS: Record<EnemyKind, EnemyConfig> = {
  grunt: { hp: 30, w: 26, h: 40, speed: 92, damage: 8, color: PAL.magenta, core: PAL.cyan, fly: false, shielded: false, soul: 2 },
  drone: { hp: 22, w: 36, h: 26, speed: 130, damage: 7, color: PAL.cyan, core: PAL.cream, fly: true, shielded: false, soul: 2, shootInterval: 1.7 },
  guard: { hp: 78, w: 36, h: 48, speed: 52, damage: 13, color: PAL.violet, core: PAL.magenta, fly: false, shielded: true, soul: 5 },
  charger: { hp: 48, w: 42, h: 34, speed: 96, damage: 16, color: PAL.gold, core: PAL.cream, fly: false, shielded: false, soul: 3 },
  flyer: { hp: 30, w: 30, h: 30, speed: 150, damage: 9, color: PAL.jade, core: PAL.cyan, fly: true, shielded: false, soul: 3, shootInterval: 1.4 },
};

export class Enemy extends Entity {
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  cfg: EnemyConfig;
  color: string;
  core: string;
  shielded: boolean;
  shieldFront = true;
  facing = -1;
  private contactCd = 0;
  private hurtFlash = 0;
  private burnT = 0;
  private burnDps = 0;
  private burnTick = 0;
  private shootT = 0;
  private state = 'idle';
  private stateT = 0;
  private bob = Math.random() * TAU;
  private spawnT = 0;
  hpBarT = 0;

  constructor(kind: EnemyKind, x: number, y: number, tint?: string) {
    super();
    const cfg = CONFIGS[kind];
    this.kind = kind;
    this.cfg = cfg;
    this.w = cfg.w;
    this.h = cfg.h;
    this.x = x;
    this.y = y;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.color = tint ?? cfg.color;
    this.core = cfg.core;
    this.shielded = cfg.shielded;
    this.shootT = (cfg.shootInterval ?? 2) * Math.random();
  }

  update(dt: number, world: World): void {
    this.spawnT += dt;
    if (this.contactCd > 0) this.contactCd -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.hpBarT > 0) this.hpBarT -= dt;
    this.bob += dt * 3;
    this.stateT += dt;

    // burn damage over time
    if (this.burnT > 0) {
      this.burnT -= dt;
      this.burnTick -= dt;
      if (this.burnTick <= 0) {
        this.burnTick = 0.25;
        this.hp -= this.burnDps * 0.25;
        world.particles.spawn({
          x: this.cx + rand(-this.w / 2, this.w / 2), y: this.y,
          vy: -60, life: 0.4, size: 4, color: hexToRgb(PAL.gold), fadeColor: hexToRgb(PAL.magenta),
          additive: true, shrink: 0, drag: 1,
        });
        if (this.hp <= 0) {
          this.die(world);
          return;
        }
      }
    }

    const player = world.player;
    const pdx = player ? player.cx - this.cx : 0;
    if (player && Math.abs(pdx) > 4) this.facing = sign(pdx);

    switch (this.kind) {
      case 'grunt':
        this.vx = damp(this.vx, this.facing * this.cfg.speed, 6, dt);
        break;
      case 'guard':
        this.vx = damp(this.vx, this.facing * this.cfg.speed, 4, dt);
        break;
      case 'charger':
        this.updateCharger(dt, player ? Math.abs(pdx) : 9999);
        break;
      case 'drone':
        this.updateFlyer(dt, world, 130, -120, true);
        break;
      case 'flyer':
        this.updateFlyer(dt, world, 60, -60, true);
        break;
    }

    // physics
    if (this.cfg.fly) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    } else {
      this.vy = Math.min(this.vy + 2100 * dt, 1180);
      const col = moveAndCollide(this, world.solids, dt);
      if ((col.hitWallLeft || col.hitWallRight) && this.kind === 'grunt' && col.onGround) {
        this.vy = -380; // hop over obstacles
      }
      if (this.kind === 'charger' && (col.hitWallLeft || col.hitWallRight) && this.state === 'charge') {
        this.state = 'recover';
        this.stateT = 0;
        world.camera.addTrauma(0.1);
      }
    }
    this.x = clamp(this.x, world.bounds.minX, world.bounds.maxX - this.w);

    // shooting
    if (this.cfg.shootInterval && player && !player.dead) {
      this.shootT -= dt;
      if (this.shootT <= 0 && Math.abs(this.cx - player.cx) < 720) {
        this.shootT = this.cfg.shootInterval;
        this.shoot(world);
      }
    }

    // contact damage
    if (player && !player.dead && this.contactCd <= 0) {
      if (
        this.x < player.x + player.w && this.x + this.w > player.x &&
        this.y < player.y + player.h && this.y + this.h > player.y
      ) {
        const dmg = this.state === 'charge' ? this.cfg.damage * 1.4 : this.cfg.damage;
        player.takeHit(Math.round(dmg), this.cx, world);
        this.contactCd = 0.6;
        this.vx = -this.facing * 160;
      }
    }
  }

  private updateCharger(dt: number, pdist: number): void {
    switch (this.state) {
      case 'idle':
        this.vx = damp(this.vx, this.facing * 40, 4, dt);
        if (pdist < 360 && this.stateT > 0.4) {
          this.state = 'windup';
          this.stateT = 0;
        }
        break;
      case 'windup':
        this.vx = damp(this.vx, 0, 10, dt);
        if (this.stateT > 0.5) {
          this.state = 'charge';
          this.stateT = 0;
        }
        break;
      case 'charge':
        this.vx = this.facing * 560;
        if (this.stateT > 0.55) {
          this.state = 'recover';
          this.stateT = 0;
        }
        break;
      case 'recover':
        this.vx = damp(this.vx, 0, 8, dt);
        if (this.stateT > 0.7) {
          this.state = 'idle';
          this.stateT = 0;
        }
        break;
    }
  }

  private updateFlyer(dt: number, world: World, offX: number, offY: number, _bob: boolean): void {
    const p = world.player;
    if (!p) return;
    const tx = p.cx - this.facing * offX;
    const ty = p.cy + offY + Math.sin(this.bob) * 26;
    this.vx = damp(this.vx, (tx - this.cx) * 2.2, 5, dt);
    this.vy = damp(this.vy, (ty - this.cy) * 2.2, 5, dt);
    const vmax = this.cfg.speed * 2.2;
    this.vx = clamp(this.vx, -vmax, vmax);
    this.vy = clamp(this.vy, -vmax, vmax);
  }

  private shoot(world: World): void {
    const p = world.player;
    if (!p) return;
    const ang = Math.atan2(p.cy - this.cy, p.cx - this.cx);
    const spd = this.kind === 'flyer' ? 420 : 320;
    world.spawnProjectile({
      x: this.cx, y: this.cy,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      faction: 'enemy', damage: this.cfg.damage,
      color: this.color, coreColor: this.core,
      radius: 7, life: 3.4, kind: this.kind === 'flyer' ? 'fang' : 'orb',
      homing: this.kind === 'flyer' ? 1.6 : 0,
    });
    world.audio.shoot();
  }

  hurt(dmg: number, kx: number, ky: number, world: World): void {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtFlash = 0.12;
    this.hpBarT = 2.5;
    this.vx += kx;
    if (!this.cfg.fly) this.vy += ky;
    else this.vy += ky * 0.5;
    if (this.hp <= 0) this.die(world);
  }

  ignite(dur: number, dps: number, world: World): void {
    void world;
    this.burnT = Math.max(this.burnT, dur);
    this.burnDps = Math.max(this.burnDps, dps);
  }

  private die(world: World): void {
    if (this.dead) return;
    this.dead = true;
    world.particles.burst(this.cx, this.cy, 22, 320, {
      life: 0.5, size: 3.6, color: hexToRgb(this.color), fadeColor: hexToRgb('#ffffff'),
      additive: true, shrink: 0, drag: 2.5, grav: 120,
    });
    world.fx.shockwave(this.cx, this.cy, 50, this.color, { life: 0.4, width: 4 });
    world.camera.addTrauma(0.12);
    world.audio.explosion(this.maxHp > 60);
    world.dropLoot(this);
    if (world.player) world.player.notifyKill(world);
    world.notifyEnemyKilled();
  }

  render(ctx: CanvasRenderingContext2D, world: World): void {
    const sIn = clamp(this.spawnT / 0.25, 0, 1);
    const flash = this.hurtFlash > 0;

    // core glow (additive, absolute)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.w);
    cg.addColorStop(0, rgba(...this.coreRgb(), 0.45));
    cg.addColorStop(1, 'transparent');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.w, 0, TAU);
    ctx.fill();
    ctx.restore();

    const img = getImage(SPRITES[this.kind]);
    if (ready(img)) {
      const drawH = this.h * 2.0 * sIn;
      const feetY = this.cfg.fly ? this.cy + drawH / 2 : this.y + this.h;
      drawSprite(ctx, img, this.cx, feetY, drawH, this.facing);
      if (flash) {
        drawSprite(ctx, img, this.cx, feetY, drawH, this.facing, { additive: true, alpha: 0.7 });
      }
      // guard keeps its energy shield arc on top for the gameplay read
      if (this.kind === 'guard' && this.shielded) {
        ctx.save();
        ctx.translate(this.cx, this.cy);
        ctx.scale(this.facing, 1);
        ctx.strokeStyle = PAL.cyan;
        ctx.shadowColor = PAL.cyan;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.w / 2 + 4, -this.h / 2 + 6);
        ctx.quadraticCurveTo(this.w / 2 + 16, 0, this.w / 2 + 4, this.h / 2 - 6);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      const col = flash ? '#ffffff' : this.color;
      ctx.save();
      ctx.translate(this.cx, this.cy);
      ctx.scale(sIn, sIn);
      ctx.scale(this.facing, 1);
      switch (this.kind) {
        case 'grunt': this.drawGrunt(ctx, col, flash); break;
        case 'guard': this.drawGuard(ctx, col, flash); break;
        case 'charger': this.drawCharger(ctx, col, flash); break;
        case 'drone': this.drawDrone(ctx, col, world); break;
        case 'flyer': this.drawFlyer(ctx, col, world); break;
      }
      ctx.restore();
    }

    this.drawHpBar(ctx);
  }

  private coreRgb(): [number, number, number] {
    const c = hexToRgb(this.core);
    return [c.r, c.g, c.b];
  }

  private outline(ctx: CanvasRenderingContext2D, col: string): void {
    ctx.fillStyle = '#0a0a14';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
  }

  private drawGrunt(ctx: CanvasRenderingContext2D, col: string, _f: boolean): void {
    const hw = this.w / 2;
    const hh = this.h / 2;
    this.outline(ctx, col);
    ctx.beginPath();
    ctx.moveTo(-hw, hh);
    ctx.lineTo(-hw + 3, -hh + 4);
    ctx.lineTo(0, -hh);
    ctx.lineTo(hw - 3, -hh + 4);
    ctx.lineTo(hw, hh);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // eye
    ctx.shadowBlur = 6;
    ctx.fillStyle = this.core;
    ctx.beginPath();
    ctx.arc(4, -hh + 10, 2.4, 0, TAU);
    ctx.fill();
  }

  private drawGuard(ctx: CanvasRenderingContext2D, col: string, _f: boolean): void {
    const hw = this.w / 2;
    const hh = this.h / 2;
    this.outline(ctx, col);
    ctx.beginPath();
    ctx.rect(-hw + 2, -hh, this.w - 4, this.h);
    ctx.fill();
    ctx.stroke();
    // shield (front)
    if (this.shielded) {
      ctx.strokeStyle = PAL.cyan;
      ctx.shadowColor = PAL.cyan;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hw + 3, -hh + 6);
      ctx.quadraticCurveTo(hw + 14, 0, hw + 3, hh - 6);
      ctx.stroke();
    }
    ctx.shadowBlur = 6;
    ctx.fillStyle = this.core;
    ctx.beginPath();
    ctx.arc(3, -hh + 12, 3, 0, TAU);
    ctx.fill();
  }

  private drawCharger(ctx: CanvasRenderingContext2D, col: string, _f: boolean): void {
    const hw = this.w / 2;
    const hh = this.h / 2;
    const wind = this.state === 'windup' ? Math.sin(this.stateT * 40) * 2 : 0;
    this.outline(ctx, col);
    ctx.beginPath();
    ctx.moveTo(-hw + wind, -hh + 4);
    ctx.lineTo(hw + 8, 0); // forward spike
    ctx.lineTo(-hw + wind, hh - 4);
    ctx.lineTo(-hw + 6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.fillStyle = this.state === 'windup' ? PAL.blood : this.core;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
  }

  private drawDrone(ctx: CanvasRenderingContext2D, col: string, _w: World): void {
    const hw = this.w / 2;
    this.outline(ctx, col);
    // umbrella canopy
    ctx.beginPath();
    ctx.moveTo(-hw, 0);
    ctx.quadraticCurveTo(0, -this.h, hw, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // body
    ctx.beginPath();
    ctx.arc(0, 4, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 8;
    ctx.fillStyle = this.core;
    ctx.beginPath();
    ctx.arc(0, 4, 2.2, 0, TAU);
    ctx.fill();
  }

  private drawFlyer(ctx: CanvasRenderingContext2D, col: string, _w: World): void {
    const hw = this.w / 2;
    const flap = Math.sin(this.bob * 3) * 6;
    this.outline(ctx, col);
    // wings
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-hw, -hw + flap);
    ctx.lineTo(-hw + 6, 2);
    ctx.lineTo(-hw, hw - flap);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(hw, -hw - flap);
    ctx.lineTo(hw - 6, 2);
    ctx.lineTo(hw, hw + flap);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // core
    ctx.shadowBlur = 12;
    ctx.fillStyle = this.core;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
  }

  private drawHpBar(ctx: CanvasRenderingContext2D): void {
    if (this.hpBarT <= 0 || this.hp >= this.maxHp) return;
    const w = Math.max(26, this.w);
    const x = this.cx - w / 2;
    const y = this.y - 10;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = this.color;
    ctx.fillRect(x, y, w * clamp(this.hp / this.maxHp, 0, 1), 4);
    ctx.restore();
  }
}
