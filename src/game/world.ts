// The World simulates one stage run: terrain, all entities, collisions, loot,
// screen juice (hit-stop, flash, glitch) and progression triggers. The Game
// state machine owns a World while a stage is being played.

import { Player } from '../entities/player.ts';
import { Enemy } from '../entities/enemy.ts';
import { Projectile, ProjOpts } from '../entities/projectile.ts';
import { Pickup } from '../entities/pickup.ts';
import type { Entity } from '../entities/entity.ts';
import { Camera } from '../core/camera.ts';
import { ParticleSystem } from '../core/particles.ts';
import { EffectsLayer } from '../render/effects.ts';
import type { Input } from '../core/input.ts';
import type { GameAudio } from '../core/audio.ts';
import type { Solid } from '../core/physics.ts';
import type { RunState } from './stats.ts';
import { soulNeeded } from './stats.ts';
import type { StageDef } from '../content/stagedef.ts';
import { VIEW_W, VIEW_H } from '../render/renderer.ts';
import { clamp01, rand, chance } from '../core/math.ts';
import { hexToRgb, rgba } from '../render/color.ts';
import { PAL, WEAPONS } from '../content/design.ts';

interface BurnZone {
  x: number;
  y: number;
  w: number;
  t: number;
  dps: number;
}

export type WorldResult = 'clear' | 'dead' | null;

export interface BossLike extends Entity {
  readonly displayName: string;
  readonly hpPct: number;
  readonly phaseLabel: string;
  hurt(dmg: number, kx: number, ky: number, world: World): void;
}

export class World {
  input: Input;
  audio: GameAudio;
  run: RunState;
  stage: StageDef;
  solids: Solid[];
  camera = new Camera();
  particles = new ParticleSystem();
  fx = new EffectsLayer();

  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  boss: BossLike | null = null;
  private burns: BurnZone[] = [];

  time = 0;
  bounds: { minX: number; maxX: number; bottom: number };

  private hitStopT = 0;
  private flashCol = { r: 0, g: 0, b: 0, a: 0 };
  glitchT = 0;
  slowFactor = 1;
  private ultT = 0;
  ultActive = false;

  pendingLevelUps = 0;
  result: WorldResult = null;
  private clearTimer = -1;
  private deadTimer = -1;
  private spawnedBoss = false;
  bossDefeatedFx = false;

  constructor(stage: StageDef, run: RunState, input: Input, audio: GameAudio) {
    this.stage = stage;
    this.run = run;
    this.input = input;
    this.audio = audio;
    this.solids = stage.solids.slice();
    this.bounds = { minX: 0, maxX: stage.length, bottom: stage.groundY + 520 };
    this.player = new Player(120, stage.groundY - 60);
    this.camera.minX = 0;
    this.camera.maxX = Math.max(0, stage.length - VIEW_W);
    this.camera.minY = -260;
    this.camera.maxY = stage.groundY - VIEW_H + 220;
    this.camera.x = 0;
    this.camera.y = this.player.cy - VIEW_H * 0.58;
  }

  // ---- services used by entities -----------------------------------------

  spawnProjectile(o: ProjOpts): Projectile {
    const p = new Projectile(o);
    this.projectiles.push(p);
    return p;
  }

  addEnemy(e: Enemy): void {
    this.enemies.push(e);
  }

  spawnBurnZone(x: number, _world?: unknown): void {
    this.burns.push({ x: x - 36, y: this.stage.groundY, w: 72, t: 3, dps: 14 });
  }

  hitStop(sec: number): void {
    this.hitStopT = Math.max(this.hitStopT, sec);
  }

  flash(r: number, g: number, b: number, a: number): void {
    if (a > this.flashCol.a) {
      this.flashCol = { r, g, b, a };
    }
  }

  glitch(amount: number): void {
    this.glitchT = Math.max(this.glitchT, amount);
  }

  gainUlt(a: number): void {
    this.run.ultGauge = clamp01(this.run.ultGauge + a);
  }

  private handleAbilities(dt: number): void {
    if (this.player.dead) return;
    // weapon switch
    if (this.input.justPressed('switch') && this.run.weapons.length > 1) {
      this.run.weaponIndex = (this.run.weaponIndex + 1) % this.run.weapons.length;
      this.audio.uiSelect();
      const wid = this.run.weapons[this.run.weaponIndex];
      this.fx.text(this.player.cx, this.player.y - 24, WEAPONS[wid].name, WEAPONS[wid].color, { size: 20 });
    }
    // ultimate (残刃) — time-slow burst that scythes every enemy on screen
    if (this.input.justPressed('special') && this.run.ultGauge >= 1 && this.ultT <= 0) {
      this.triggerUltimate();
    }
    if (this.ultT > 0) {
      this.ultT -= dt;
      this.slowFactor = 0.32;
      if (this.ultT <= 0) this.slowFactor = 1;
      this.ultActive = this.ultT > 0;
    }
  }

  private triggerUltimate(): void {
    this.run.ultGauge = 0;
    this.ultT = 1.15;
    this.ultActive = true;
    this.slowFactor = 0.32;
    this.flash(220, 250, 255, 0.55);
    this.glitch(0.7);
    this.camera.addTrauma(0.5);
    this.camera.punchZoom(1.06);
    this.audio.levelUp();
    const dmg = Math.round(60 * this.run.stats.attackMul);
    const targets: { x: number; y: number }[] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.abs(e.cx - this.player.cx) < VIEW_W * 0.7) {
        targets.push({ x: e.cx, y: e.cy });
        e.hurt(dmg, 0, -200, this);
      }
    }
    if (this.boss && !this.boss.dead && Math.abs(this.boss.cx - this.player.cx) < VIEW_W) {
      (this.boss as unknown as { hurt?: (d: number, kx: number, ky: number, w: World) => void }).hurt?.(
        dmg * 1.5, 0, 0, this,
      );
    }
    // residual slash streaks between every target
    for (const t of targets) {
      this.fx.shockwave(t.x, t.y, 70, '#ffffff', { life: 0.5, width: 4 });
      this.particles.burst(t.x, t.y, 16, 360, {
        life: 0.5, size: 3, color: hexToRgb(PAL.cyan), additive: true, shrink: 0, drag: 3,
      });
    }
  }

  collectSoul(v: number): void {
    this.run.soulShards += v;
    this.run.bankedSoul += v;
    this.audio.pickup();
    while (this.run.soulShards >= this.run.soulToNext) {
      this.run.soulShards -= this.run.soulToNext;
      this.run.level++;
      this.run.soulToNext = soulNeeded(this.run.level);
      this.pendingLevelUps++;
    }
  }

  dropLoot(e: Enemy): void {
    const n = e.cfg.soul;
    for (let i = 0; i < n; i++) {
      this.pickups.push(new Pickup('soul', e.cx + rand(-10, 10), e.cy + rand(-10, 10), 1));
    }
    if (chance(0.16)) this.pickups.push(new Pickup('heal', e.cx, e.cy, 18));
    if (chance(0.1)) this.pickups.push(new Pickup('gauge', e.cx, e.cy, 0.2));
  }

  notifyEnemyKilled(): void {
    /* hook for combo/score systems */
  }

  // ---- main loop ----------------------------------------------------------

  update(dt: number): void {
    // freeze-frame impact
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      this.camera.follow(this.player.cx, this.player.cy, this.player.facing, dt);
      this.decayOverlays(dt);
      return;
    }
    this.time += dt;
    this.decayOverlays(dt);
    this.handleAbilities(dt);

    this.stage.ambient?.(this, dt);
    this.triggerSpawns();

    const eDt = dt * this.slowFactor;

    if (!this.player.dead) this.player.update(dt, this);

    for (const e of this.enemies) e.update(eDt, this);
    if (this.boss) this.boss.update(eDt, this);
    for (const p of this.projectiles) p.update(p.faction === 'player' ? dt : eDt, this);
    for (const p of this.pickups) p.update(dt, this);
    this.updateBurns(eDt);
    this.particles.update(dt);
    this.fx.update(dt);

    this.resolveProjectiles();

    // cull dead
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);

    this.camera.follow(this.player.cx, this.player.cy, this.player.facing, dt);

    this.checkOutcome(dt);
  }

  private decayOverlays(dt: number): void {
    if (this.flashCol.a > 0) this.flashCol.a = Math.max(0, this.flashCol.a - dt * 2.6);
    if (this.glitchT > 0) this.glitchT = Math.max(0, this.glitchT - dt * 2.2);
  }

  private triggerSpawns(): void {
    const stage = this.stage;
    while (
      stage.spawns.length &&
      this.player.cx > stage.spawns[0].x - VIEW_W * 0.55
    ) {
      const s = stage.spawns.shift()!;
      const gy = s.y ?? stage.groundY;
      const e = new Enemy(s.kind, s.x, gy - (s.kind === 'drone' || s.kind === 'flyer' ? 180 : 50), stage.tint);
      this.enemies.push(e);
    }

    // boss trigger near the end
    if (!this.spawnedBoss && this.stage.spawnBoss && this.player.cx > this.stage.length - VIEW_W * 0.7) {
      this.spawnedBoss = true;
      this.boss = this.stage.spawnBoss(this);
      this.audio.bossWarn();
      this.camera.punchZoom(1.08);
      this.glitch(0.8);
    }
  }

  private updateBurns(dt: number): void {
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.t -= dt;
      if (b.t <= 0) {
        this.burns.splice(i, 1);
        continue;
      }
      // damage enemies standing in it
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.cx > b.x && e.cx < b.x + b.w && Math.abs(e.y + e.h - b.y) < 40) {
          e.hurt(b.dps * dt, 0, 0, this);
        }
      }
      if (chance(0.6)) {
        this.particles.spawn({
          x: b.x + rand(0, b.w), y: b.y, vy: -rand(40, 120), life: 0.5, size: rand(3, 6),
          color: hexToRgb(PAL.gold), fadeColor: hexToRgb(PAL.magenta), additive: true, shrink: 0, drag: 1,
        });
      }
    }
  }

  private resolveProjectiles(): void {
    const player = this.player;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      if (pr.faction === 'enemy') {
        if (!player.dead && this.overlap(pr, player) && !player.invulnerable) {
          player.takeHit(pr.damage, pr.cx, this);
          if (!pr.pierce) pr.dead = true;
        }
      } else {
        for (const e of this.enemies) {
          if (e.dead || pr.hitIds.has(e.id)) continue;
          if (this.overlap(pr, e)) {
            pr.hitIds.add(e.id);
            const blocked = e.shielded && !pr.breakShield && (e.cx - pr.cx) * Math.sign(pr.vx || 1) > 0;
            if (!blocked) {
              e.hurt(pr.damage, Math.sign(pr.vx || 1) * pr.knockback, -60, this);
              this.fx.text(e.cx, e.y - 6, String(pr.damage), pr.color, { size: 18 });
              this.fx.shockwave(e.cx, e.cy, 30, '#ffffff', { life: 0.3, width: 3 });
            } else {
              this.fx.text(e.cx, e.y - 8, 'GUARD', PAL.gold, { size: 14 });
            }
            if (!pr.pierce) {
              pr.dead = true;
              break;
            }
          }
        }
        // boss hit
        if (!pr.dead && this.boss && !this.boss.dead && !pr.hitIds.has(this.boss.id) && this.overlap(pr, this.boss)) {
          pr.hitIds.add(this.boss.id);
          this.boss.hurt(pr.damage, 0, 0, this);
          this.fx.text(this.boss.cx, this.boss.cy - 30, String(pr.damage), pr.color, { size: 18 });
          if (!pr.pierce) pr.dead = true;
        }
      }
    }
  }

  private overlap(a: Entity, b: Entity): boolean {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  private checkOutcome(dt: number): void {
    if (this.result) return;
    if (this.player.dead) {
      if (this.deadTimer < 0) {
        this.deadTimer = 1.4;
        this.flash(0, 0, 0, 0.2);
        this.camera.addTrauma(0.6);
      } else {
        this.deadTimer -= dt;
        if (this.deadTimer <= 0) this.result = 'dead';
      }
      return;
    }

    if (this.stage.spawnBoss) {
      if (this.boss && this.boss.dead) {
        if (this.clearTimer < 0) this.clearTimer = 2.6;
        else {
          this.clearTimer -= dt;
          if (this.clearTimer <= 0) this.result = 'clear';
        }
      }
    } else if (this.player.cx > this.stage.length - 90 && this.enemies.length === 0) {
      if (this.clearTimer < 0) this.clearTimer = 1.0;
      else {
        this.clearTimer -= dt;
        if (this.clearTimer <= 0) this.result = 'clear';
      }
    }
  }

  // ---- render -------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    this.stage.drawBackground(ctx, this);

    const camX = Math.round(this.camera.viewX);
    const camY = Math.round(this.camera.viewY);
    ctx.save();
    ctx.translate(-camX, -camY);

    this.renderTerrain(ctx);
    this.renderBurns(ctx);
    for (const p of this.pickups) p.render(ctx, this);
    for (const e of this.enemies) e.render(ctx, this);
    if (this.boss) this.boss.render(ctx, this);
    if (!this.player.dead) this.player.render(ctx, this);
    for (const p of this.projectiles) p.render(ctx, this);
    this.particles.render(ctx);
    this.fx.render(ctx);

    ctx.restore();

    this.stage.drawForeground?.(ctx, this);
    this.renderOverlays(ctx);
  }

  private renderTerrain(ctx: CanvasRenderingContext2D): void {
    const pal = this.stage.palette;
    const accents = pal.length > 1 ? pal.slice(1) : [PAL.cyan];
    for (let i = 0; i < this.solids.length; i++) {
      const s = this.solids[i];
      const isGround = s.h > 120;
      const edge = isGround ? PAL.magenta : accents[i % accents.length];
      const e = hexToRgb(edge);

      // dark body with a faint vertical gradient
      const bodyTop = s.y;
      const bg = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + Math.min(160, s.h));
      bg.addColorStop(0, '#10122a');
      bg.addColorStop(1, '#070812');
      ctx.fillStyle = bg;
      ctx.fillRect(s.x, s.y, s.w, s.h);

      // edge glow (additive)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createLinearGradient(0, s.y - 4, 0, s.y + 26);
      gg.addColorStop(0, rgba(e.r, e.g, e.b, 0.0));
      gg.addColorStop(0.18, rgba(e.r, e.g, e.b, 0.4));
      gg.addColorStop(1, rgba(e.r, e.g, e.b, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(s.x, s.y - 4, s.w, 30);
      ctx.restore();

      // crisp neon edge line
      ctx.save();
      ctx.fillStyle = edge;
      ctx.shadowColor = edge;
      ctx.shadowBlur = 10;
      ctx.fillRect(s.x, s.y, s.w, isGround ? 3 : 3);
      ctx.restore();

      // grid texture on the ground plane
      if (isGround) {
        ctx.save();
        ctx.strokeStyle = rgba(e.r, e.g, e.b, 0.06);
        ctx.lineWidth = 1;
        const step = 64;
        const startX = Math.floor(s.x / step) * step;
        for (let x = startX; x < s.x + s.w; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, s.y);
          ctx.lineTo(x, s.y + 80);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  private renderBurns(ctx: CanvasRenderingContext2D): void {
    for (const b of this.burns) {
      const a = clamp01(b.t / 3) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, b.y - 30, 0, b.y);
      g.addColorStop(0, rgba(255, 120, 30, 0));
      g.addColorStop(1, rgba(255, 180, 60, a));
      ctx.fillStyle = g;
      ctx.fillRect(b.x, b.y - 30, b.w, 30);
      ctx.restore();
    }
  }

  private renderOverlays(ctx: CanvasRenderingContext2D): void {
    // glitch RGB slices
    if (this.glitchT > 0.05) {
      const slices = 3 + Math.floor(this.glitchT * 5);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < slices; i++) {
        const y = rand(0, VIEW_H);
        const h = rand(3, 18);
        const off = rand(-24, 24) * this.glitchT;
        ctx.globalAlpha = 0.25 * this.glitchT;
        ctx.fillStyle = i % 2 ? PAL.magenta : PAL.cyan;
        ctx.fillRect(off, y, VIEW_W, h);
      }
      ctx.restore();
    }
    // full-screen flash
    if (this.flashCol.a > 0.001) {
      ctx.save();
      ctx.fillStyle = rgba(this.flashCol.r, this.flashCol.g, this.flashCol.b, this.flashCol.a);
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
  }
}
