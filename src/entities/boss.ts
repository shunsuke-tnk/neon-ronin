// Multi-phase boss. One configurable class drives all five bosses via a config
// (sprite, hp, attack pool, phase count). Attacks are telegraphed primitives:
// fan, aimed, rain, radial, charge, summon. Hovers, keeps distance, ramps
// aggression each phase.

import { Entity } from './entity.ts';
import { Enemy, type EnemyKind } from './enemy.ts';
import type { World, BossLike } from '../game/world.ts';
import { getImage, ready, drawSprite } from '../render/assets.ts';
import { TAU, clamp, clamp01, damp, rand, sign } from '../core/math.ts';
import { hexToRgb, rgba } from '../render/color.ts';
import { PAL } from '../content/design.ts';

export type BossAttack = 'fan' | 'aimed' | 'rain' | 'radial' | 'charge' | 'summon';

export interface BossConfig {
  id: string;
  name: string;
  sprite: string;
  maxHp: number;
  w: number;
  h: number;
  color: string;
  accent: string;
  phases: number;
  attacks: BossAttack[];
  preferDist: number;
  summonKind: EnemyKind;
}

export const BOSSES: Record<string, BossConfig> = {
  amazarashi: {
    id: 'amazarashi', name: '傘鬼 雨曝', sprite: 'boss_amazarashi.png',
    maxHp: 700, w: 116, h: 150, color: PAL.magenta, accent: PAL.cyan,
    phases: 2, attacks: ['fan', 'rain', 'charge'], preferDist: 150, summonKind: 'grunt',
  },
  gourai: {
    id: 'gourai', name: '機関車頭 轟雷', sprite: 'boss_gourai.png',
    maxHp: 1500, w: 168, h: 130, color: PAL.cyan, accent: PAL.violet,
    phases: 3, attacks: ['aimed', 'charge', 'fan', 'radial'], preferDist: 210, summonKind: 'charger',
  },
  kitsunebi: {
    id: 'kitsunebi', name: '演算神 狐火', sprite: 'boss_kitsunebi.png',
    maxHp: 1600, w: 134, h: 150, color: PAL.gold, accent: PAL.magenta,
    phases: 3, attacks: ['fan', 'rain', 'radial', 'summon'], preferDist: 340, summonKind: 'flyer',
  },
  souga: {
    id: 'souga', name: '双頭鎮圧機 双牙', sprite: 'boss_souga.png',
    maxHp: 1900, w: 156, h: 150, color: PAL.cyan, accent: PAL.magenta,
    phases: 3, attacks: ['charge', 'fan', 'summon', 'radial'], preferDist: 180, summonKind: 'guard',
  },
  tenshu: {
    id: 'tenshu', name: '電脳将軍 天守・零式', sprite: 'boss_tenshu.png',
    maxHp: 2800, w: 158, h: 172, color: PAL.magenta, accent: PAL.gold,
    phases: 4, attacks: ['aimed', 'fan', 'rain', 'charge', 'radial', 'summon'], preferDist: 250, summonKind: 'flyer',
  },
};

export function makeBoss(id: string, x: number, cy: number): Boss {
  return new Boss(BOSSES[id], x, cy);
}

type BossState = 'intro' | 'idle' | 'telegraph' | 'recover';

export class Boss extends Entity implements BossLike {
  cfg: BossConfig;
  hp: number;
  maxHp: number;
  color: string;
  accent: string;
  phase = 1;
  facing = -1;

  private homeY: number;
  private state: BossState = 'intro';
  private stateT = 0;
  private cooldown = 1.6;
  private telegraph = 0;
  private curAttack: BossAttack | null = null;
  private atkIndex = 0;
  private hurtFlash = 0;
  private invuln = 1.4;
  private contactCd = 0;
  private bobp = Math.random() * TAU;
  private chargeVX = 0;
  private chargeT = 0;
  defeated = false;
  private deathT = 0;

  constructor(cfg: BossConfig, x: number, cy: number) {
    super();
    this.cfg = cfg;
    this.w = cfg.w;
    this.h = cfg.h;
    this.x = x - cfg.w / 2;
    this.y = cy - cfg.h / 2;
    this.homeY = cy;
    this.hp = cfg.maxHp;
    this.maxHp = cfg.maxHp;
    this.color = cfg.color;
    this.accent = cfg.accent;
  }

  get displayName(): string {
    return this.cfg.name;
  }
  get hpPct(): number {
    return clamp01(this.hp / this.maxHp);
  }
  get phaseLabel(): string {
    return `PHASE ${this.phase} / ${this.cfg.phases}`;
  }
  get telegraphing(): boolean {
    return this.state === 'telegraph';
  }

  private cooldownBase(): number {
    return Math.max(0.5, 1.5 - (this.phase - 1) * 0.28);
  }

  private nextThresholdHp(): number {
    return (this.maxHp * (this.cfg.phases - this.phase)) / this.cfg.phases;
  }

  hurt(dmg: number, _kx: number, _ky: number, world: World): void {
    if (this.defeated) return;
    if (this.invuln > 0) {
      world.fx.text(this.cx, this.y - 8, 'GUARD', PAL.cream, { size: 16 });
      return;
    }
    this.hp -= dmg;
    this.hurtFlash = 0.1;
    if (this.phase < this.cfg.phases && this.hp <= this.nextThresholdHp()) {
      this.phase++;
      this.onPhaseChange(world);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.defeated = true;
      this.deathT = 0;
      world.flash(255, 255, 255, 0.5);
      world.glitch(1);
      world.camera.addTrauma(0.7);
      world.audio.explosion(true);
    }
  }

  private onPhaseChange(world: World): void {
    this.invuln = 0.9;
    this.hurtFlash = 0.3;
    this.state = 'idle';
    this.cooldown = 0.4;
    world.flash(hexToRgb(this.color).r, hexToRgb(this.color).g, hexToRgb(this.color).b, 0.4);
    world.glitch(0.9);
    world.camera.addTrauma(0.5);
    world.audio.bossWarn();
    world.fx.text(this.cx, this.y - 20, this.phaseLabel, this.accent, { size: 26 });
    // each new phase calls in reinforcements
    this.summon(world, 2);
  }

  update(dt: number, world: World): void {
    this.bobp += dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.contactCd > 0) this.contactCd -= dt;

    if (this.defeated) {
      this.runDeath(dt, world);
      return;
    }

    const p = world.player;
    this.move(dt, p, world);

    if (this.state === 'intro') {
      this.stateT += dt;
      if (this.stateT > 1.3) {
        this.invuln = 0;
        this.state = 'idle';
        this.cooldown = 0.9;
        this.stateT = 0;
      }
      return;
    }

    this.stateT += dt;
    if (this.state === 'idle') {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.beginAttack();
    } else if (this.state === 'telegraph') {
      if (this.stateT >= this.telegraph) {
        this.execAttack(world);
        this.state = 'recover';
        this.stateT = 0;
      }
    } else if (this.state === 'recover') {
      const rec = this.curAttack === 'charge' ? 0.7 : 0.4;
      if (this.stateT > rec) {
        this.state = 'idle';
        this.cooldown = this.cooldownBase();
      }
    }

    this.contactDamage(p, world);
  }

  private move(dt: number, p: World['player'] | null, world: World): void {
    if (this.chargeT > 0) {
      this.chargeT -= dt;
      this.x += this.chargeVX * dt;
      this.x = clamp(this.x, world.bounds.minX, world.bounds.maxX - this.w);
      if (Math.random() < 0.7) {
        world.particles.spawn({
          x: this.cx, y: this.cy + rand(-this.h / 2, this.h / 2), vx: -this.chargeVX * 0.3,
          life: 0.3, size: 5, color: hexToRgb(this.accent), additive: true, shrink: 0, drag: 3,
        });
      }
      return;
    }
    if (!p) return;
    this.facing = (sign(p.cx - this.cx) || this.facing) as number;
    const desiredX = p.cx - this.facing * this.cfg.preferDist - this.w / 2;
    const desiredY = this.homeY + Math.sin(this.bobp * 1.3) * 18 - this.h / 2;
    const lerpSpd = this.state === 'intro' ? 1.6 : 2.0;
    this.x = damp(this.x, desiredX, lerpSpd, dt);
    this.y = damp(this.y, desiredY, 3, dt);
    this.x = clamp(this.x, world.bounds.minX, world.bounds.maxX - this.w);
  }

  private beginAttack(): void {
    this.curAttack = this.cfg.attacks[this.atkIndex % this.cfg.attacks.length];
    this.atkIndex++;
    this.telegraph = this.curAttack === 'charge' ? 0.6 : 0.45;
    this.state = 'telegraph';
    this.stateT = 0;
  }

  private aimAngle(world: World): number {
    const p = world.player;
    if (!p) return this.facing < 0 ? Math.PI : 0;
    return Math.atan2(p.cy - this.cy, p.cx - this.cx);
  }

  private shoot(world: World, ang: number, speed: number, opts: { gravity?: number; radius?: number; homing?: number } = {}): void {
    world.spawnProjectile({
      x: this.cx, y: this.cy,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      faction: 'enemy', damage: 12 + this.phase * 2,
      color: this.color, coreColor: '#ffffff',
      radius: opts.radius ?? 9, life: 4,
      gravity: opts.gravity ?? 0, homing: opts.homing ?? 0, kind: 'orb',
    });
  }

  private execAttack(world: World): void {
    world.audio.shoot();
    switch (this.curAttack) {
      case 'fan': {
        const base = this.aimAngle(world);
        const n = 4 + this.phase;
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.2;
          this.shoot(world, a, 300);
        }
        break;
      }
      case 'aimed': {
        const base = this.aimAngle(world);
        for (let i = 0; i < 3; i++) this.shoot(world, base + (i - 1) * 0.08, 470);
        break;
      }
      case 'rain': {
        const p = world.player;
        const cx = p ? p.cx : this.cx;
        const topY = world.camera.viewY - 30;
        const n = 8 + this.phase * 2;
        for (let i = 0; i < n; i++) {
          world.spawnProjectile({
            x: cx + rand(-360, 360), y: topY,
            vx: rand(-30, 30), vy: 180,
            faction: 'enemy', damage: 11 + this.phase,
            color: this.accent, coreColor: '#ffffff',
            radius: 8, life: 5, gravity: 420, kind: 'orb',
          });
        }
        break;
      }
      case 'radial': {
        const n = 12 + this.phase * 2;
        for (let i = 0; i < n; i++) this.shoot(world, (i / n) * TAU, 240);
        break;
      }
      case 'charge': {
        const p = world.player;
        this.chargeVX = (p ? sign(p.cx - this.cx) : this.facing) * 920;
        this.chargeT = 0.55;
        world.camera.addTrauma(0.3);
        break;
      }
      case 'summon':
        this.summon(world, 2);
        break;
    }
  }

  private summon(world: World, n: number): void {
    const p = world.player;
    for (let i = 0; i < n; i++) {
      const ex = (p ? p.cx : this.cx) + rand(-260, 260);
      const e = new Enemy(this.cfg.summonKind, ex, world.stage.groundY - 60, this.cfg.color);
      world.addEnemy(e);
    }
    world.fx.text(this.cx, this.y - 16, '召喚', this.accent, { size: 18 });
  }

  private contactDamage(p: World['player'] | null, world: World): void {
    if (!p || p.dead || this.contactCd > 0) return;
    if (this.x < p.x + p.w && this.x + this.w > p.x && this.y < p.y + p.h && this.y + this.h > p.y) {
      p.takeHit(this.chargeT > 0 ? 24 : 16, this.cx, world);
      this.contactCd = 0.7;
    }
  }

  private runDeath(dt: number, world: World): void {
    this.deathT += dt;
    this.y += 30 * dt;
    if (Math.random() < 0.6) {
      world.particles.burst(
        this.cx + rand(-this.w / 2, this.w / 2),
        this.cy + rand(-this.h / 2, this.h / 2),
        10, 280,
        { life: 0.6, size: 4, color: hexToRgb(this.color), fadeColor: hexToRgb('#ffffff'), additive: true, shrink: 0, drag: 2 },
      );
    }
    if (this.deathT > 0.5 && this.deathT < 0.55) world.audio.explosion(true);
    if (this.deathT >= 2.2) this.dead = true;
  }

  render(ctx: CanvasRenderingContext2D, world: World): void {
    const img = getImage(this.cfg.sprite);
    const flash = this.hurtFlash > 0;
    const telegraphPulse = this.telegraphing ? 0.5 + 0.5 * Math.sin(this.stateT * 30) : 0;

    // aura / telegraph glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const auraR = this.w * (0.7 + telegraphPulse * 0.25);
    const ac = hexToRgb(this.telegraphing ? this.accent : this.color);
    const g = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, auraR);
    g.addColorStop(0, rgba(ac.r, ac.g, ac.b, 0.3 + telegraphPulse * 0.3));
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, auraR, 0, TAU);
    ctx.fill();
    ctx.restore();

    const drawH = this.h * (this.defeated ? 1 - clamp01(this.deathT / 2.2) * 0.2 : 1);
    if (ready(img)) {
      const alpha = this.invuln > 0 && !this.defeated ? (Math.floor(world.time * 20) % 2 ? 0.5 : 1) : 1;
      drawSprite(ctx, img, this.cx, this.cy + this.h / 2, drawH, this.facing, { alpha });
      if (flash) drawSprite(ctx, img, this.cx, this.cy + this.h / 2, drawH, this.facing, { additive: true, alpha: 0.7 });
    } else {
      ctx.save();
      ctx.fillStyle = '#0a0a14';
      ctx.strokeStyle = flash ? '#fff' : this.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 16;
      ctx.fillRect(this.x, this.y, this.w, this.h);
      ctx.strokeRect(this.x, this.y, this.w, this.h);
      ctx.restore();
    }
  }
}
