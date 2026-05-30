// 骸 (Mukuro) — the player. A backlit neon silhouette animated with a
// procedural part skeleton, a trailing bezier haori, squash & stretch and an
// additive blade trail. Iai-based combat: a fast forward lunge that sweeps a
// glowing arc; behaviour varies per equipped weapon.

import { Entity } from './entity.ts';
import type { World } from '../game/world.ts';
import { Ribbon } from '../render/trail.ts';
import { hexToRgb } from '../render/color.ts';
import { getImage, ready, drawSprite } from '../render/assets.ts';
import { WEAPONS } from '../content/design.ts';
import {
  TAU,
  clamp,
  clamp01,
  lerp,
  damp,
  approach,
  sign,
} from '../core/math.ts';
import { moveAndCollide } from '../core/physics.ts';

const GRAVITY = 2150;
const MAX_FALL = 1180;
const MOVE = 320;
const ACCEL = 2900;
const AIR_ACCEL = 2100;
const FRICTION = 2700;
const JUMP_V = -720;
const DJUMP_V = -670;
const JUMP_CUT = 0.42;
const COYOTE = 0.09;
const JUMP_BUF = 0.1;
const DASH_SPEED = 800;
const DASH_TIME = 0.16;
const DASH_CD = 0.3;
const WALL_SLIDE = 150;
const WALLJUMP_X = 400;
const WALLJUMP_Y = -690;
const HURT_IFRAMES = 1.0;
const ATTACK_WINDUP = 0.045;
const ATTACK_ACTIVE = 0.14;

interface AfterImage {
  x: number;
  y: number;
  facing: number;
  phase: number;
  crouch: number;
  t: number;
  color: string;
}

export class Player extends Entity {
  facing = 1;
  onGround = false;
  private coyote = 0;
  private jumpBuf = 0;
  private jumpsUsed = 0;
  private airDashesUsed = 0;
  private dashTime = 0;
  private dashCd = 0;
  private dashDirX = 1;
  iframes = 0;
  private wallDir = 0;

  // attack
  private attackT = -1;
  private attackDur = 0.3;
  private comboStep = 0;
  private comboTimer = 0;
  private swingHit = new Set<number>();
  private didSpawnWave = false;
  chargeT = 0;
  attacking = false;

  // animation
  private runPhase = 0;
  private crouch = 0; // 0 standing .. 1 crouch (for squash visual)
  private sx = 1;
  private sy = 1;
  private hurtFlash = 0;
  private idleBob = 0;

  private bladeTrail = new Ribbon(0.16, 22);
  private dashTrail = new Ribbon(0.18, 18);
  private haori: { x: number; y: number }[] = [];
  private afterImages: AfterImage[] = [];
  private aiTimer = 0;

  constructor(x: number, y: number) {
    super();
    this.w = 26;
    this.h = 52;
    this.x = x;
    this.y = y;
    for (let i = 0; i < 7; i++) this.haori.push({ x, y });
  }

  get invulnerable(): boolean {
    return this.iframes > 0 || this.dashTime > 0;
  }

  update(dt: number, world: World): void {
    const input = world.input;
    const stats = world.run.stats;

    this.coyote -= dt;
    this.jumpBuf -= dt;
    this.dashCd -= dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.comboTimer > 0) this.comboTimer -= dt;
    else this.comboStep = 0;
    this.idleBob += dt * 4;

    // ---- input intents ----
    if (input.justPressed('jump')) this.jumpBuf = JUMP_BUF;
    if (input.justPressed('attack')) this.tryAttack(world);
    if (input.justPressed('dash')) this.tryDash(world, input.moveX);

    // ---- attack timeline ----
    if (this.attackT >= 0) {
      this.attackT += dt;
      this.attacking = this.attackT < ATTACK_WINDUP + ATTACK_ACTIVE;
      this.updateAttack(dt, world);
      if (this.attackT >= this.attackDur) {
        this.attackT = -1;
        this.attacking = false;
        this.comboTimer = 0.36;
      }
    }

    // ---- horizontal movement ----
    const moveX = input.moveX;
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashDirX * DASH_SPEED;
      this.vy = 0;
      this.spawnDashFx(world);
    } else {
      const targetVx = moveX * MOVE * stats.moveSpeedMul;
      const accel = this.onGround ? ACCEL : AIR_ACCEL;
      if (moveX !== 0) {
        this.vx = approach(this.vx, targetVx, accel * dt);
        if (!this.attacking) this.facing = sign(moveX);
      } else if (this.onGround) {
        this.vx = approach(this.vx, 0, FRICTION * dt);
      } else {
        this.vx = approach(this.vx, 0, AIR_ACCEL * 0.3 * dt);
      }
      // attacks slow ground movement slightly
      if (this.attacking && this.onGround) this.vx *= 0.86;
    }

    // ---- gravity / wall slide ----
    if (this.dashTime <= 0) {
      let g = GRAVITY;
      if (this.wallDir !== 0 && !this.onGround && this.vy > 0 && moveX === this.wallDir) {
        g = GRAVITY * 0.35;
        this.vy = Math.min(this.vy, WALL_SLIDE);
      }
      this.vy = Math.min(this.vy + g * dt, MAX_FALL);
    }

    // ---- jump ----
    if (this.jumpBuf > 0) {
      if (this.onGround || this.coyote > 0) {
        this.doJump(world, JUMP_V);
        this.jumpsUsed = 1;
      } else if (this.wallDir !== 0 && !this.onGround) {
        // wall jump
        this.vy = WALLJUMP_Y;
        this.vx = -this.wallDir * WALLJUMP_X;
        this.facing = -this.wallDir;
        this.jumpsUsed = 1;
        this.jumpBuf = 0;
        this.stretch(0.78, 1.28);
        world.audio.jump();
        world.particles.burst(this.cx, this.y + this.h, 8, 180, {
          life: 0.3, size: 3, color: hexToRgb('#00f0ff'), additive: true, shrink: 0,
        }, 1.4, this.wallDir > 0 ? Math.PI : 0);
      } else if (this.jumpsUsed < 2) {
        this.doJump(world, DJUMP_V);
        this.jumpsUsed = 2;
        // double-jump ring
        world.fx.shockwave(this.cx, this.cy + 10, 38, '#00f0ff', { life: 0.32, width: 3 });
        world.particles.burst(this.cx, this.y + this.h - 4, 12, 230, {
          life: 0.36, size: 3, color: hexToRgb('#9b5cff'), additive: true, shrink: 0, grav: 200,
        }, 1.0, Math.PI / 2);
      }
    }
    // variable jump height
    if (world.input.justReleased('jump') && this.vy < 0) this.vy *= JUMP_CUT;

    // ---- integrate + collide ----
    const before = this.vy;
    const col = moveAndCollide(this, world.solids, dt);
    this.x = clamp(this.x, world.bounds.minX, world.bounds.maxX - this.w);

    this.wallDir = col.hitWallRight ? 1 : col.hitWallLeft ? -1 : 0;
    const wasAir = !this.onGround;
    this.onGround = col.onGround;
    if (this.onGround) {
      this.coyote = COYOTE;
      this.jumpsUsed = 0;
      this.airDashesUsed = 0;
      if (wasAir && before > 620) {
        // landing squash + dust
        this.stretch(1.32, 0.7);
        world.particles.burst(this.cx, this.y + this.h, 10, 160, {
          life: 0.34, size: 3.4, color: hexToRgb('#fdf6e3'), additive: false, shrink: 0, drag: 4,
        }, 1.1, 0);
        if (before > 980) world.camera.addTrauma(0.16);
      }
    }

    // fell into a pit
    if (this.y > world.bounds.bottom) this.takeHit(9999, this.cx, world, true);

    // ---- animation state ----
    const speed = Math.abs(this.vx);
    this.runPhase += (speed / MOVE) * dt * 11;
    const targetCrouch = world.input.isDown('down') && this.onGround ? 1 : 0;
    this.crouch = damp(this.crouch, targetCrouch, 14, dt);
    this.sx = damp(this.sx, 1, 12, dt);
    this.sy = damp(this.sy, 1, 12, dt);

    // ---- haori follow ----
    this.updateHaori();

    // ---- trails / afterimages ----
    this.bladeTrail.update(dt);
    this.dashTrail.update(dt);
    for (let i = this.afterImages.length - 1; i >= 0; i--) {
      this.afterImages[i].t -= dt;
      if (this.afterImages[i].t <= 0) this.afterImages.splice(i, 1);
    }
    if (this.aiTimer > 0) this.aiTimer -= dt;
  }

  private doJump(world: World, v: number): void {
    this.vy = v;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.stretch(0.8, 1.26);
    world.audio.jump();
  }

  private stretch(sx: number, sy: number): void {
    this.sx = sx;
    this.sy = sy;
  }

  private tryDash(world: World, dirInput: number): void {
    if (this.dashTime > 0 || this.dashCd > 0) return;
    if (!this.onGround) {
      if (this.airDashesUsed >= world.run.stats.airDashMax) return;
      this.airDashesUsed++;
    }
    this.dashDirX = dirInput !== 0 ? sign(dirInput) : this.facing;
    this.facing = this.dashDirX;
    this.dashTime = DASH_TIME;
    this.dashCd = DASH_CD;
    this.iframes = Math.max(this.iframes, 0.12);
    this.stretch(1.35, 0.72);
    this.pushAfterImage('#00f0ff');
    world.audio.dash();
    world.camera.addTrauma(0.08);
  }

  private spawnDashFx(world: World): void {
    this.dashTrail.push(this.cx, this.cy);
    if (Math.random() < 0.8) {
      world.particles.spawn({
        x: this.cx - this.dashDirX * 12,
        y: this.cy + (Math.random() - 0.5) * 30,
        vx: -this.dashDirX * 120,
        life: 0.3,
        size: 3,
        color: hexToRgb('#0affc2'),
        additive: true,
        shrink: 0,
        drag: 3,
      });
    }
    if (this.aiTimer <= 0) {
      this.pushAfterImage('#0affc2');
      this.aiTimer = 0.03;
    }
  }

  private pushAfterImage(color: string): void {
    this.afterImages.push({
      x: this.x,
      y: this.y,
      facing: this.facing,
      phase: this.runPhase,
      crouch: this.crouch,
      t: 0.26,
      color,
    });
  }

  // ---- combat -------------------------------------------------------------

  private tryAttack(world: World): void {
    if (this.attackT >= 0 && this.attackT < ATTACK_WINDUP + ATTACK_ACTIVE * 0.6) return;
    const weapon = WEAPONS[world.run.weapons[world.run.weaponIndex]];
    this.attackT = 0;
    this.attackDur = weapon.cooldown + ATTACK_WINDUP + ATTACK_ACTIVE;
    this.attacking = true;
    this.swingHit.clear();
    this.didSpawnWave = false;
    this.comboStep = (this.comboTimer > 0 ? this.comboStep + 1 : 0) % 3;
    this.comboTimer = 0.5;
    this.bladeTrail.clear();
    // a small forward lunge
    const lunge = this.onGround ? 150 : 90;
    this.vx += this.facing * lunge;
    if (weapon.kind === 'fire') world.audio.slash();
    else world.audio.slash();
    this.pushAfterImage(weapon.color);
  }

  private updateAttack(dt: number, world: World): void {
    void dt;
    const weapon = WEAPONS[world.run.weapons[world.run.weaponIndex]];
    const reach = weapon.range * world.run.stats.rangeMul;
    const t = this.attackT;
    // sweep progress across windup+active
    const p = clamp01((t - ATTACK_WINDUP) / ATTACK_ACTIVE);
    const ease = 1 - (1 - p) * (1 - p);
    const ang = lerp(-1.35, 0.95, ease);
    const ox = this.cx;
    const oy = this.cy - 6;
    const tipX = ox + this.facing * Math.cos(ang) * reach;
    const tipY = oy + Math.sin(ang) * reach;
    if (t <= ATTACK_WINDUP + ATTACK_ACTIVE) this.bladeTrail.push(tipX, tipY);

    const active = t >= ATTACK_WINDUP && t <= ATTACK_WINDUP + ATTACK_ACTIVE;
    if (!active) return;

    if (weapon.kind === 'wave') {
      if (!this.didSpawnWave) {
        this.didSpawnWave = true;
        world.spawnProjectile({
          x: ox + this.facing * 24,
          y: oy,
          vx: this.facing * 620,
          vy: 0,
          faction: 'player',
          damage: this.rollDamage(weapon.baseDamage, world),
          color: weapon.color,
          coreColor: '#ffffff',
          radius: 30,
          life: 0.4,
          kind: 'wave',
          pierce: true,
          breakShield: true,
          knockback: weapon.knockback,
        });
        world.fx.shockwave(ox + this.facing * 30, oy, 70, weapon.color, { life: 0.4, width: 5 });
        world.audio.shoot();
      }
      return;
    }

    // melee arc hit test (forgiving: in-front cone OR physically overlapping)
    for (const e of world.enemies) {
      if (e.dead || this.swingHit.has(e.id)) continue;
      const dx = e.cx - ox;
      const dy = e.cy - oy;
      const d = Math.hypot(dx, dy);
      const touching =
        this.x < e.x + e.w && this.x + this.w > e.x &&
        this.y < e.y + e.h && this.y + this.h > e.y;
      const inFront = dx * this.facing > -(e.w * 0.5 + 18);
      if (!touching) {
        if (!inFront) continue;
        if (d > reach + e.w * 0.5) continue;
        if (Math.abs(dy) > reach) continue;
      }
      this.swingHit.add(e.id);
      this.hitEnemy(e, weapon, world, this.rollDamage(weapon.baseDamage, world));
    }

    // boss melee
    const boss = world.boss;
    if (boss && !boss.dead && !this.swingHit.has(boss.id)) {
      const bdx = boss.cx - ox;
      const bdy = boss.cy - oy;
      const touching =
        this.x < boss.x + boss.w && this.x + this.w > boss.x &&
        this.y < boss.y + boss.h && this.y + this.h > boss.y;
      const inFront = bdx * this.facing > -(boss.w * 0.5 + 18);
      if (touching || (inFront && Math.abs(bdx) <= reach + boss.w * 0.5 && Math.abs(bdy) <= reach + boss.h * 0.55)) {
        this.swingHit.add(boss.id);
        const dmg = this.rollDamage(weapon.baseDamage, world);
        boss.hurt(dmg, 0, 0, world);
        world.fx.text(boss.cx, boss.cy - 36, String(dmg), weapon.color, { size: 22 });
        world.fx.shockwave(this.cx + this.facing * 44, oy, 42, '#ffffff', { life: 0.3, width: 3 });
        world.particles.burst(this.cx + this.facing * 52, oy, 12, 280, {
          life: 0.32, size: 3, color: hexToRgb(weapon.color), additive: true, shrink: 0, drag: 4,
        });
        world.hitStop(0.06);
        world.camera.addTrauma(0.18);
        world.audio.hit();
        this.onDamageDealt(dmg, world);
        if (weapon.kind === 'fire') world.spawnBurnZone(boss.cx, world);
      }
    }
  }

  private rollDamage(base: number, world: World): number {
    const s = world.run.stats;
    let dmg = base * s.attackMul;
    const combo = 1 + this.comboStep * 0.12;
    dmg *= combo;
    if (Math.random() < s.critChance) dmg *= s.critMul;
    return Math.round(dmg);
  }

  private hitEnemy(e: import('./enemy.ts').Enemy, weapon: typeof WEAPONS[keyof typeof WEAPONS], world: World, dmg: number): void {
    const breakShield = weapon.kind === 'wave';
    const blocked = e.shielded && !breakShield && (e.cx - this.cx) * this.facing > 0 && e.shieldFront;
    if (blocked) {
      world.fx.text(e.cx, e.y - 10, 'GUARD', '#ffd23f', { size: 16 });
      world.particles.burst(e.cx - this.facing * 14, e.cy, 8, 200, {
        life: 0.25, size: 2.5, color: hexToRgb('#ffd23f'), additive: true, shrink: 0,
      });
      world.audio.enemyHit();
      this.vx -= this.facing * 120;
      return;
    }
    e.hurt(dmg, this.facing * weapon.knockback, -120, world);
    this.onDamageDealt(dmg, world);

    // hit feedback
    world.fx.text(e.cx, e.y - 6, String(dmg), weapon.color, { size: 18 + Math.min(14, dmg / 6) });
    world.fx.shockwave(e.cx, e.cy, 26 + dmg * 0.4, '#ffffff', { life: 0.3, width: 3 });
    world.particles.burst(e.cx, e.cy, 10, 260, {
      life: 0.3, size: 3, color: hexToRgb(weapon.color), additive: true, shrink: 0, drag: 4,
    });
    world.hitStop(0.05 + Math.min(0.06, dmg / 400));
    world.camera.addTrauma(0.12 + Math.min(0.18, dmg / 200));
    world.audio.hit();

    // weapon specials
    if (weapon.kind === 'chain') this.chainLightning(e, world, dmg);
    if (weapon.kind === 'fire') {
      e.ignite(2.2, Math.max(3, dmg * 0.12), world);
      world.spawnBurnZone(e.cx, world);
    }
  }

  private chainLightning(from: import('./enemy.ts').Enemy, world: World, dmg: number): void {
    let src = from;
    const hit = new Set<number>([from.id]);
    for (let n = 0; n < 2; n++) {
      let best: import('./enemy.ts').Enemy | null = null;
      let bd = 220 * 220;
      for (const e of world.enemies) {
        if (e.dead || hit.has(e.id)) continue;
        const dd = (e.cx - src.cx) ** 2 + (e.cy - src.cy) ** 2;
        if (dd < bd) {
          bd = dd;
          best = e;
        }
      }
      if (!best) break;
      hit.add(best.id);
      this.drawLightning(src.cx, src.cy, best.cx, best.cy, world);
      best.hurt(Math.round(dmg * 0.6), 0, -60, world);
      this.onDamageDealt(Math.round(dmg * 0.6), world);
      src = best;
    }
  }

  private drawLightning(x1: number, y1: number, x2: number, y2: number, world: World): void {
    const seg = 6;
    let px = x1;
    let py = y1;
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      const nx = lerp(x1, x2, t) + (Math.random() - 0.5) * 26;
      const ny = lerp(y1, y2, t) + (Math.random() - 0.5) * 26;
      world.particles.spawn({
        x: (px + nx) / 2, y: (py + ny) / 2, life: 0.18, size: 3,
        color: hexToRgb('#00f0ff'), additive: true, shrink: 0,
      });
      px = nx;
      py = ny;
    }
  }

  private onDamageDealt(dmg: number, world: World): void {
    const s = world.run.stats;
    world.gainUlt(dmg * 0.0016 * s.ultGainMul);
  }

  notifyKill(world: World): void {
    const s = world.run.stats;
    if (s.lifestealPct > 0) {
      world.run.hp = Math.min(s.maxHp, world.run.hp + s.maxHp * s.lifestealPct);
    }
    world.gainUlt(0.03 * s.ultGainMul);
  }

  takeHit(dmg: number, fromX: number, world: World, ignoreInvuln = false): void {
    if (this.dead) return;
    if (!ignoreInvuln && this.invulnerable) return;
    const s = world.run.stats;
    if (!ignoreInvuln && s.evadeChance > 0 && Math.random() < s.evadeChance) {
      world.fx.text(this.cx, this.y - 8, 'EVADE', '#0affc2', { size: 18 });
      this.iframes = 0.3;
      return;
    }
    world.run.hp -= dmg;
    this.iframes = HURT_IFRAMES;
    this.hurtFlash = 0.4;
    this.vx = -sign(fromX - this.cx || this.facing) * 260;
    this.vy = -260;
    world.camera.addTrauma(0.5);
    world.hitStop(0.08);
    world.flash(255, 60, 90, 0.32);
    world.glitch(0.6);
    world.audio.hurt();
    world.particles.burst(this.cx, this.cy, 16, 320, {
      life: 0.4, size: 3.4, color: hexToRgb('#ff2d6f'), additive: true, shrink: 0, drag: 3,
    });
    if (world.run.hp <= 0) {
      if (s.reviveCharges > 0) {
        s.reviveCharges--;
        world.run.hp = s.maxHp * 0.5;
        this.iframes = 1.6;
        world.flash(0, 240, 255, 0.6);
        world.fx.text(this.cx, this.cy - 30, 'REVIVE', '#00f0ff', { size: 30 });
      } else {
        this.dead = true;
      }
    }
  }

  private updateHaori(): void {
    // anchor at upper back, segments lag behind for cloth-like motion
    const anchorX = this.cx - this.facing * 6;
    const anchorY = this.y + 14;
    this.haori[0].x = anchorX;
    this.haori[0].y = anchorY;
    for (let i = 1; i < this.haori.length; i++) {
      const p = this.haori[i];
      const prev = this.haori[i - 1];
      const lag = 0.45;
      p.x = lerp(p.x, prev.x - this.facing * 9 - this.vx * 0.012, lag);
      p.y = lerp(p.y, prev.y + 6 + Math.max(0, this.vy) * 0.006, lag);
    }
  }

  // ---- rendering ----------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, world: World): void {
    const hero = getImage('hero.png');
    const useSprite = ready(hero);
    const SPRITE_H = 98;
    const feetY = this.y + this.h;

    // afterimages first (behind), additive neon echoes
    for (const ai of this.afterImages) {
      const a = (ai.t / 0.26) * 0.4;
      if (useSprite) {
        drawSprite(ctx, hero, ai.x + this.w / 2, ai.y + this.h, SPRITE_H, ai.facing, {
          alpha: a, additive: true,
        });
      } else {
        ctx.save();
        ctx.globalAlpha = a;
        ctx.globalCompositeOperation = 'lighter';
        this.drawBody(ctx, ai.x, ai.y, ai.facing, ai.phase, ai.crouch, ai.color, true);
        ctx.restore();
      }
    }

    this.dashTrail.render(ctx, '#0affc2', '#ffffff', 16);

    const blink = this.hurtFlash > 0 && Math.floor(world.time * 30) % 2 === 0;
    if (useSprite) {
      if (!blink) {
        drawSprite(ctx, hero, this.cx, feetY, SPRITE_H, this.facing, { sx: this.sx, sy: this.sy });
        if (this.hurtFlash > 0) {
          drawSprite(ctx, hero, this.cx, feetY, SPRITE_H, this.facing, {
            sx: this.sx, sy: this.sy, additive: true, alpha: 0.6,
          });
        }
      }
    } else {
      this.drawHaori(ctx);
      this.drawBody(ctx, this.x, this.y, this.facing, this.runPhase, this.crouch, blink ? '#ffffff' : '#00f0ff', false);
    }

    // blade + trail (in front, only while drawn)
    if (this.attackT >= 0) {
      const weapon = WEAPONS[world.run.weapons[world.run.weaponIndex]];
      this.bladeTrail.render(ctx, weapon.color, '#ffffff', 16 * world.run.stats.rangeMul);
    } else {
      this.bladeTrail.render(ctx, '#ff2d6f', '#ffffff', 12);
    }
  }

  private drawHaori(ctx: CanvasRenderingContext2D): void {
    const h = this.haori;
    if (h.length < 3) return;
    ctx.save();
    ctx.globalAlpha = 0.8;
    const grad = ctx.createLinearGradient(h[0].x, h[0].y, h[h.length - 1].x, h[h.length - 1].y);
    grad.addColorStop(0, '#ff2d6f');
    grad.addColorStop(1, 'rgba(155,92,255,0.05)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(h[0].x, h[0].y);
    for (let i = 1; i < h.length - 1; i++) {
      const xc = (h[i].x + h[i + 1].x) / 2;
      const yc = (h[i].y + h[i + 1].y) / 2;
      ctx.quadraticCurveTo(h[i].x, h[i].y, xc, yc);
    }
    ctx.stroke();
    ctx.restore();
  }

  private capsule(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number): void {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
    ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
    ctx.closePath();
  }

  private drawBody(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: number,
    phase: number,
    crouch: number,
    rim: string,
    ghost: boolean,
  ): void {
    const cx = x + this.w / 2;
    const baseY = y + this.h;
    const sxv = this.sx;
    const syv = this.sy * (1 - crouch * 0.22);

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.scale(facing * sxv, syv);
    ctx.translate(-0, 0);

    const swing = this.onGround && Math.abs(this.vx) > 30 ? Math.sin(phase) : 0;
    const swing2 = this.onGround && Math.abs(this.vx) > 30 ? Math.sin(phase + Math.PI) : 0;
    const air = !this.onGround;
    const bob = this.onGround && Math.abs(this.vx) <= 30 ? Math.sin(this.idleBob) * 1.2 : 0;

    const hipY = -28 + crouch * 8 + bob;
    const shoulderY = -46 + crouch * 6 + bob;
    const headY = -52 + crouch * 5 + bob;

    const fillCol = ghost ? rim : '#0a0a14';

    // ---- legs ----
    const legSpread = 5;
    const kneeBend = air ? 10 : 0;
    const footFront = air ? -6 : swing * 9;
    const footBack = air ? 6 : swing2 * 9;
    ctx.fillStyle = fillCol;
    if (!ghost) {
      ctx.strokeStyle = rim;
      ctx.lineWidth = 2;
      ctx.shadowColor = rim;
      ctx.shadowBlur = 8;
    }
    // back leg
    this.capsule(ctx, -legSpread, hipY, footBack - 3, -2 - kneeBend * 0.2, 4.5);
    ctx.fill();
    if (!ghost) ctx.stroke();
    // front leg
    this.capsule(ctx, legSpread, hipY, footFront + 3, -2, 5);
    ctx.fill();
    if (!ghost) ctx.stroke();

    // ---- torso ----
    ctx.beginPath();
    ctx.moveTo(-9, hipY);
    ctx.lineTo(9, hipY);
    ctx.lineTo(7, shoulderY);
    ctx.lineTo(-7, shoulderY);
    ctx.closePath();
    ctx.fill();
    if (!ghost) ctx.stroke();

    // ---- arms (one holds the blade forward when attacking) ----
    const attackReach = this.attacking ? 1 : 0;
    const armPhase = this.attacking ? lerp(-1.2, 0.7, clamp01((this.attackT - ATTACK_WINDUP) / ATTACK_ACTIVE)) : swing2 * 0.5;
    const handX = lerp(10, 22, attackReach);
    const handY = shoulderY + Math.sin(armPhase) * 6 + 6 + attackReach * 2;
    this.capsule(ctx, 4, shoulderY + 2, handX, handY, 3.6);
    ctx.fill();
    if (!ghost) ctx.stroke();
    // back arm
    this.capsule(ctx, -4, shoulderY + 2, -8 + swing * 4, shoulderY + 14, 3.2);
    ctx.fill();
    if (!ghost) ctx.stroke();

    // ---- head ----
    ctx.beginPath();
    ctx.ellipse(1, headY, 6.5, 7.5, 0, 0, TAU);
    ctx.fill();
    if (!ghost) ctx.stroke();

    // ---- blade in hand (only while attacking, drawn additively) ----
    if (this.attacking && !ghost) {
      ctx.shadowBlur = 0;
      ctx.restore();
      return;
    }

    // eye glow
    if (!ghost) {
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(4, headY - 1, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
