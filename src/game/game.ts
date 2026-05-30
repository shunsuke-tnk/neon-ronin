// Top-level state machine. Owns the persistent save, the current run and the
// active World, routing update/render by state and drawing all the non-play
// screens (title, level-up, pause, clear, game-over, victory).

import type { Input } from '../core/input.ts';
import type { GameAudio } from '../core/audio.ts';
import type { TouchControls } from '../core/touch.ts';
import { World } from './world.ts';
import { baseStats, soulNeeded, type RunState } from './stats.ts';
import { drawHUD } from './hud.ts';
import { getStages } from '../content/stages.ts';
import { cityLayer, drawRain } from '../content/stage-helpers.ts';
import { gradientSky } from '../render/backdrop.ts';
import { getImage, ready, coverImage } from '../render/assets.ts';
import { rollUpgrades, type UpgradeDef } from '../content/upgrades.ts';
import { glowText, panel, diamond } from '../render/ui.ts';
import { VIEW_W, VIEW_H } from '../render/renderer.ts';
import { TITLE, SUBTITLE, PAL, WEAPON_ORDER, type WeaponId } from '../content/design.ts';

type State = 'title' | 'howto' | 'playing' | 'levelup' | 'paused' | 'cleared' | 'gameover' | 'victory';

const TITLE_MENU = ['はじめる', 'あそびかた', '音'] as const;

interface SaveData {
  persistentSoul: number;
  maxStageUnlocked: number;
  unlockedWeapons: WeaponId[];
  bestStage: number;
}

const SAVE_KEY = 'neon-ronin-save-v1';

function loadSave(): SaveData {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) return { ...defaultSave(), ...(JSON.parse(s) as Partial<SaveData>) };
  } catch {
    /* ignore */
  }
  return defaultSave();
}

function defaultSave(): SaveData {
  return {
    persistentSoul: 0,
    maxStageUnlocked: 0,
    unlockedWeapons: WEAPON_ORDER.slice(),
    bestStage: 0,
  };
}

export class Game {
  private input: Input;
  private audio: GameAudio;
  private touch: TouchControls;
  private save: SaveData;
  private stages = getStages();

  state: State = 'title';
  private run: RunState | null = null;
  private world: World | null = null;

  private titleTime = 0;
  private cards: UpgradeDef[] = [];
  private cardIndex = 0;
  private menuIndex = 0;
  private flashTimer = 0;

  constructor(input: Input, audio: GameAudio, touch: TouchControls) {
    this.input = input;
    this.audio = audio;
    this.touch = touch;
    this.save = loadSave();
  }

  private persist(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* ignore */
    }
  }

  // ---- run/stage lifecycle ----

  private makeRun(stageIndex: number): RunState {
    const stats = baseStats();
    const weapons = this.save.unlockedWeapons.length ? this.save.unlockedWeapons.slice() : ['hizuki' as WeaponId];
    return {
      stats,
      hp: stats.maxHp,
      level: 1,
      soulShards: 0,
      soulToNext: soulNeeded(1),
      bankedSoul: 0,
      ultGauge: 0,
      weapons,
      weaponIndex: 0,
      stageIndex,
      upgradeStacks: {},
    };
  }

  private startStage(index: number, run: RunState): void {
    const stage = this.stages[index];
    run.stageIndex = index;
    this.world = new World(stage, run, this.input, this.audio);
    this.audio.startMusic(stage.music);
    this.audio.setIntensity(0.6);
    this.state = 'playing';
  }

  private startRun(index: number): void {
    this.audio.ensure();
    this.run = this.makeRun(index);
    this.startStage(index, this.run);
  }

  // ---- update ----

  update(dt: number): void {
    this.titleTime += dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;

    // The on-screen pad is only live during play; every other state takes taps.
    this.touch.setMode(this.state === 'playing' ? 'play' : 'menu');

    switch (this.state) {
      case 'title': this.updateTitle(); break;
      case 'howto': this.updateHowto(); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'levelup': this.updateLevelUp(); break;
      case 'paused': this.updatePaused(); break;
      case 'cleared': this.updateCleared(); break;
      case 'gameover': this.updateGameOver(); break;
      case 'victory': this.updateVictory(); break;
    }
    this.input.postUpdate();
    this.touch.postUpdate();
  }

  private updateTitle(): void {
    const i = this.input;
    if (i.justPressed('up')) {
      this.menuIndex = (this.menuIndex + TITLE_MENU.length - 1) % TITLE_MENU.length;
      this.audio.ensure();
      this.audio.uiMove();
    }
    if (i.justPressed('down')) {
      this.menuIndex = (this.menuIndex + 1) % TITLE_MENU.length;
      this.audio.ensure();
      this.audio.uiMove();
    }
    if (i.justPressed('confirm') || i.justPressed('attack')) {
      this.activateTitle();
    }
    // touch: tap a menu row to pick it directly
    for (const t of this.touch.takeTaps()) {
      const k = this.titleMenuHit(t.x, t.y);
      if (k >= 0) {
        this.menuIndex = k;
        this.activateTitle();
        break;
      }
    }
  }

  private activateTitle(): void {
    this.audio.ensure();
    if (this.menuIndex === 0) {
      this.audio.uiSelect();
      this.startRun(0);
    } else if (this.menuIndex === 1) {
      this.audio.uiSelect();
      this.state = 'howto';
    } else {
      this.audio.toggleMute();
      this.audio.uiSelect();
    }
  }

  /** Hit-test a tap against the title menu rows (see drawTitle). -1 if none. */
  private titleMenuHit(x: number, y: number): number {
    const cx = VIEW_W / 2;
    const baseY = 452;
    if (Math.abs(x - cx) > 170) return -1;
    for (let k = 0; k < TITLE_MENU.length; k++) {
      if (Math.abs(y - (baseY + k * 50)) <= 25) return k;
    }
    return -1;
  }

  private updateHowto(): void {
    const i = this.input;
    if (
      i.justPressed('confirm') || i.justPressed('attack') || i.justPressed('pause') ||
      this.touch.takeTaps().length > 0
    ) {
      this.state = 'title';
      this.menuIndex = 0;
      this.audio.uiSelect();
    }
  }

  private updatePlaying(dt: number): void {
    const w = this.world;
    if (!w) return;
    if (this.input.justPressed('pause')) {
      this.state = 'paused';
      this.menuIndex = 0;
      this.audio.uiSelect();
      return;
    }
    w.update(dt);
    // intensity rises with threat
    this.audio.setIntensity(0.5 + Math.min(0.6, w.enemies.length * 0.08));

    if (w.pendingLevelUps > 0) {
      this.openLevelUp();
      return;
    }
    if (w.result === 'dead') {
      this.onDeath();
    } else if (w.result === 'clear') {
      this.onStageClear();
    }
  }

  private openLevelUp(): void {
    this.state = 'levelup';
    this.cards = rollUpgrades(this.run!);
    this.cardIndex = 0;
    this.audio.levelUp();
    this.flashTimer = 0.3;
  }

  private updateLevelUp(): void {
    const i = this.input;
    const n = this.cards.length;
    if (n === 0) {
      this.world!.pendingLevelUps = 0;
      this.state = 'playing';
      return;
    }
    if (i.justPressed('left')) {
      this.cardIndex = (this.cardIndex - 1 + n) % n;
      this.audio.uiMove();
    }
    if (i.justPressed('right')) {
      this.cardIndex = (this.cardIndex + 1) % n;
      this.audio.uiMove();
    }
    if (i.justPressed('confirm') || i.justPressed('attack')) {
      this.chooseCard();
      return;
    }
    // touch: tap a card to choose it directly
    for (const t of this.touch.takeTaps()) {
      const k = this.cardHit(t.x, t.y, n);
      if (k >= 0) {
        this.cardIndex = k;
        this.chooseCard();
        break;
      }
    }
  }

  private chooseCard(): void {
    const card = this.cards[this.cardIndex];
    const run = this.run!;
    card.apply(run);
    run.upgradeStacks[card.id] = (run.upgradeStacks[card.id] ?? 0) + 1;
    this.audio.powerUp();
    this.world!.pendingLevelUps--;
    this.world!.flash(0, 240, 255, 0.4);
    if (this.world!.pendingLevelUps > 0) {
      this.cards = rollUpgrades(run);
      this.cardIndex = 0;
    } else {
      this.state = 'playing';
    }
  }

  /** Hit-test a tap against the upgrade cards (layout mirrors drawLevelUp). */
  private cardHit(x: number, y: number, n: number): number {
    const cw = 240;
    const gap = 36;
    const totalW = n * cw + (n - 1) * gap;
    let cx = (VIEW_W - totalW) / 2;
    const y0 = 260;
    const ch = 300;
    for (let k = 0; k < n; k++) {
      if (x >= cx && x <= cx + cw && y >= y0 - 16 && y <= y0 + ch) return k;
      cx += cw + gap;
    }
    return -1;
  }

  private updatePaused(): void {
    const i = this.input;
    if (i.justPressed('up') || i.justPressed('down')) {
      this.menuIndex = (this.menuIndex + 1) % 2;
      this.audio.uiMove();
    }
    if (i.justPressed('pause')) {
      this.state = 'playing';
      return;
    }
    if (i.justPressed('confirm') || i.justPressed('attack')) {
      this.activatePause();
      return;
    }
    // touch: tap a row to pick it
    for (const t of this.touch.takeTaps()) {
      const k = this.pauseMenuHit(t.x, t.y);
      if (k >= 0) {
        this.menuIndex = k;
        this.activatePause();
        break;
      }
    }
  }

  private activatePause(): void {
    if (this.menuIndex === 0) {
      this.state = 'playing';
    } else {
      this.audio.stopMusic();
      this.bankSoul();
      this.state = 'title';
    }
    this.audio.uiSelect();
  }

  /** Hit-test a tap against the pause menu rows (see drawPause). -1 if none. */
  private pauseMenuHit(x: number, y: number): number {
    if (Math.abs(x - VIEW_W / 2) > 200) return -1;
    for (let k = 0; k < 2; k++) {
      if (Math.abs(y - (360 + k * 54)) <= 26) return k;
    }
    return -1;
  }

  private bankSoul(): void {
    if (this.run) {
      this.save.persistentSoul += this.run.bankedSoul;
      this.run.bankedSoul = 0;
      this.persist();
    }
  }

  private onStageClear(): void {
    const run = this.run!;
    this.save.persistentSoul += run.bankedSoul;
    run.bankedSoul = 0;
    this.save.maxStageUnlocked = Math.max(this.save.maxStageUnlocked, run.stageIndex + 1);
    this.save.bestStage = Math.max(this.save.bestStage, run.stageIndex + 1);
    this.persist();
    this.audio.stopMusic();
    if (run.stageIndex + 1 >= this.stages.length) {
      this.state = 'victory';
    } else {
      this.state = 'cleared';
    }
  }

  private updateCleared(): void {
    if (
      this.input.justPressed('confirm') || this.input.justPressed('attack') ||
      this.input.justPressed('jump') || this.touch.takeTaps().length > 0
    ) {
      const run = this.run!;
      run.hp = Math.min(run.stats.maxHp, run.hp + run.stats.maxHp * 0.35);
      run.ultGauge = Math.min(1, run.ultGauge + 0.3);
      this.startStage(run.stageIndex + 1, run);
      this.audio.uiSelect();
    }
  }

  private onDeath(): void {
    this.bankSoul();
    this.audio.stopMusic();
    this.audio.explosion(true);
    this.state = 'gameover';
  }

  private updateGameOver(): void {
    if (
      this.input.justPressed('confirm') || this.input.justPressed('attack') ||
      this.touch.takeTaps().length > 0
    ) {
      this.state = 'title';
      this.world = null;
      this.run = null;
      this.audio.uiSelect();
    }
  }

  private updateVictory(): void {
    if (
      this.input.justPressed('confirm') || this.input.justPressed('attack') ||
      this.touch.takeTaps().length > 0
    ) {
      this.state = 'title';
      this.world = null;
      this.run = null;
      this.audio.uiSelect();
    }
  }

  // ---- render ----

  render(ctx: CanvasRenderingContext2D): void {
    switch (this.state) {
      case 'title':
        this.drawTitle(ctx);
        break;
      case 'howto':
        this.drawTitleBackdrop(ctx);
        this.dim(ctx, 0.5);
        this.drawHowto(ctx);
        break;
      case 'playing':
        this.world!.render(ctx);
        drawHUD(ctx, this.world!);
        this.touch.render(ctx, { ultReady: this.world!.run.ultGauge >= 1 });
        break;
      case 'levelup':
        this.world!.render(ctx);
        drawHUD(ctx, this.world!);
        this.drawLevelUp(ctx);
        break;
      case 'paused':
        this.world!.render(ctx);
        drawHUD(ctx, this.world!);
        this.drawPause(ctx);
        break;
      case 'cleared':
        this.world!.render(ctx);
        this.dim(ctx, 0.55);
        this.drawCleared(ctx);
        break;
      case 'gameover':
        if (this.world) this.world.render(ctx);
        this.dim(ctx, 0.66);
        this.drawGameOver(ctx);
        break;
      case 'victory':
        this.drawTitleBackdrop(ctx);
        this.drawVictory(ctx);
        break;
    }
  }

  private dim(ctx: CanvasRenderingContext2D, a: number): void {
    ctx.save();
    ctx.fillStyle = `rgba(5,6,13,${a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  private drawTitleBackdrop(ctx: CanvasRenderingContext2D): void {
    // AI-generated key art if available
    const art = getImage('title');
    if (ready(art)) {
      const drift = Math.sin(this.titleTime * 0.18) * 18;
      coverImage(ctx, art, VIEW_W, VIEW_H, drift, 0);
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, 'rgba(5,6,13,0.74)');
      grad.addColorStop(0.42, 'rgba(5,6,13,0.12)');
      grad.addColorStop(1, 'rgba(5,6,13,0.8)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      drawRain(ctx, this.titleTime * 40, this.titleTime, 0.45, PAL.cyan);
      return;
    }

    // procedural fallback
    const camX = this.titleTime * 48;
    gradientSky(ctx, VIEW_W, VIEW_H, '#0c0a1c', '#06060e', { color: '#180a24', at: 0.6 });
    // sweeping magenta moon glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(VIEW_W * 0.7, 180, 0, VIEW_W * 0.7, 180, 260);
    g.addColorStop(0, 'rgba(255,45,111,0.25)');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
    cityLayer(ctx, camX, 0.3, 560, 150, 120, 320, '#0d0c1c', [PAL.violet, PAL.cyan], 11, this.titleTime, PAL.cyan);
    cityLayer(ctx, camX, 0.7, 640, 210, 200, 380, '#0a0916', [PAL.magenta, PAL.cyan, PAL.gold], 7, this.titleTime, PAL.gold);
    drawRain(ctx, camX, this.titleTime, 0.8);
  }

  private drawTitle(ctx: CanvasRenderingContext2D): void {
    this.drawTitleBackdrop(ctx);
    const cx = VIEW_W / 2;
    const bob = Math.sin(this.titleTime * 1.5) * 4;
    glowText(ctx, TITLE, cx, 250 + bob, {
      size: 110, weight: '900', color: PAL.cream, glow: PAL.magenta, blur: 40, letterSpacing: '12px',
    });
    glowText(ctx, TITLE, cx + 3, 250 + bob, {
      size: 110, weight: '900', color: 'rgba(0,240,255,0.4)', glow: PAL.cyan, blur: 10, letterSpacing: '12px',
    });
    glowText(ctx, SUBTITLE, cx, 326, {
      size: 20, color: PAL.cyan, glow: PAL.cyan, blur: 14, letterSpacing: '10px',
    });

    // ---- selectable menu ----
    const baseY = 452;
    for (let k = 0; k < TITLE_MENU.length; k++) {
      const sel = k === this.menuIndex;
      const y = baseY + k * 50;
      const label = k === 2 ? (this.audio.muted ? '音　：　OFF' : '音　：　ON') : TITLE_MENU[k];
      if (sel) {
        const pulse = 0.7 + 0.3 * Math.sin(this.titleTime * 6);
        glowText(ctx, label, cx, y, { size: 28, color: PAL.gold, glow: PAL.gold, blur: 18 * pulse, weight: '900' });
        diamond(ctx, cx - 138, y, 7, PAL.gold);
        diamond(ctx, cx + 138, y, 7, PAL.gold);
      } else {
        glowText(ctx, label, cx, y, { size: 23, color: 'rgba(253,246,227,0.55)', weight: '700' });
      }
    }
    glowText(
      ctx,
      this.touch.enabled ? 'メニューをタップして選択' : '↑ ↓ で選択　・　Z / Enter で決定',
      cx,
      baseY + TITLE_MENU.length * 50 + 16,
      { size: 12, color: 'rgba(253,246,227,0.42)', weight: '600' },
    );
    glowText(ctx, `電脳魂  ◆ ${this.save.persistentSoul}`, cx, 642, {
      size: 14, color: PAL.gold, glow: PAL.gold, blur: 8,
    });
    glowText(ctx, 'GPT-image キービジュアル × Canvas 2D — エフェクトとサウンドは手続き生成', cx, 686, {
      size: 11, color: 'rgba(253,246,227,0.28)', weight: '600',
    });
  }

  private drawHowto(ctx: CanvasRenderingContext2D): void {
    const cx = VIEW_W / 2;
    panel(ctx, cx - 380, 96, 760, 558, {
      fill: 'rgba(10,12,24,0.92)', stroke: PAL.cyan, radius: 18, glow: PAL.cyan,
    });
    glowText(ctx, 'あそびかた', cx, 146, {
      size: 32, color: PAL.cyan, glow: PAL.cyan, blur: 16, weight: '900', letterSpacing: '10px',
    });

    const rows: [string, string][] = this.touch.enabled
      ? [
          ['移動', '左スティック'],
          ['ジャンプ（空中でもう一度＝二段）', '跳 ボタン'],
          ['ダッシュ（空中・無敵あり）', '駆 ボタン'],
          ['斬る（居合）', '斬 ボタン'],
          ['武器を切り替える', '武 ボタン'],
          ['残刃（必殺・ゲージ満タンで発動）', '残刃 ボタン'],
          ['ポーズ', '右上のポーズ'],
          ['音の ON / OFF', 'タイトルの「音」'],
        ]
      : [
          ['移動', '← →  /  A  D'],
          ['ジャンプ（空中でもう一度＝二段）', 'Z  /  Space'],
          ['ダッシュ（空中・無敵あり）', 'Shift'],
          ['斬る（居合）', 'X  /  J'],
          ['武器を切り替える', 'C'],
          ['残刃（必殺・ゲージ満タンで発動）', 'B'],
          ['ポーズ', 'Esc'],
          ['音の ON / OFF', 'M'],
        ];
    let y = 208;
    for (const [k, v] of rows) {
      glowText(ctx, k, cx - 330, y, { size: 17, align: 'left', color: PAL.cream, weight: '700' });
      glowText(ctx, v, cx + 330, y, { size: 17, align: 'right', color: PAL.cyan, weight: '800' });
      y += 37;
    }

    y += 8;
    glowText(ctx, '目的', cx - 330, y, { size: 16, align: 'left', color: PAL.gold, weight: '800' });
    glowText(ctx, '敵を斬って魂片を集め、レベルアップで強化を3択から選ぶ。', cx, y + 28, {
      size: 14, color: 'rgba(253,246,227,0.72)',
    });
    glowText(ctx, '5つのステージのボスを討ち、帝都の空を断て。', cx, y + 52, {
      size: 14, color: 'rgba(253,246,227,0.72)',
    });

    const blink = 0.55 + 0.45 * Math.sin(this.titleTime * 4);
    ctx.save();
    ctx.globalAlpha = blink;
    glowText(ctx, this.touch.enabled ? 'タップで戻る' : '戻る　—　Z / Esc', cx, 628, {
      size: 16, color: PAL.gold, glow: PAL.gold, blur: 10, weight: '800',
    });
    ctx.restore();
  }

  private drawLevelUp(ctx: CanvasRenderingContext2D): void {
    // time-stop wash
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,13,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = PAL.cyan;
    for (let y = 0; y < VIEW_H; y += 3) ctx.fillRect(0, y, VIEW_W, 1);
    ctx.restore();

    glowText(ctx, 'LEVEL UP', VIEW_W / 2, 150, {
      size: 30, color: PAL.gold, glow: PAL.gold, blur: 18, letterSpacing: '10px',
    });
    glowText(ctx, '強化を選べ', VIEW_W / 2, 192, {
      size: 16, color: 'rgba(253,246,227,0.7)', letterSpacing: '8px',
    });

    const n = this.cards.length;
    const cw = 240;
    const gap = 36;
    const totalW = n * cw + (n - 1) * gap;
    let x = (VIEW_W - totalW) / 2;
    const y = 260;
    const ch = 300;
    for (let i = 0; i < n; i++) {
      const card = this.cards[i];
      const sel = i === this.cardIndex;
      const yy = sel ? y - 12 : y;
      panel(ctx, x, yy, cw, ch, {
        fill: 'rgba(12,14,28,0.92)',
        stroke: sel ? card.color : 'rgba(255,255,255,0.12)',
        radius: 16,
        glow: sel ? card.color : undefined,
      });
      // big kanji
      glowText(ctx, card.name, x + cw / 2, yy + 96, {
        size: 96, weight: '900', color: card.color, glow: card.color, blur: sel ? 28 : 12,
      });
      glowText(ctx, card.kana, x + cw / 2, yy + 168, {
        size: 16, color: 'rgba(253,246,227,0.65)', letterSpacing: '6px',
      });
      // desc (wrapped simply)
      glowText(ctx, card.desc, x + cw / 2, yy + 214, {
        size: 16, color: PAL.cream, weight: '700',
      });
      const stacks = this.run!.upgradeStacks[card.id] ?? 0;
      glowText(ctx, `${'◆'.repeat(stacks)}${'◇'.repeat(Math.max(0, Math.min(6, card.maxStacks) - stacks))}`, x + cw / 2, yy + 256, {
        size: 14, color: card.color,
      });
      if (sel) {
        glowText(ctx, '▼', x + cw / 2, yy - 18, { size: 20, color: card.color, glow: card.color, blur: 10 });
      }
      x += cw + gap;
    }
    glowText(ctx, this.touch.enabled ? 'カードをタップして選ぶ' : '←→ で選択   Z / X で決定', VIEW_W / 2, 612, {
      size: 14, color: 'rgba(253,246,227,0.5)',
    });
  }

  private drawPause(ctx: CanvasRenderingContext2D): void {
    this.dim(ctx, 0.6);
    glowText(ctx, 'PAUSE', VIEW_W / 2, 250, {
      size: 56, color: PAL.cream, glow: PAL.cyan, blur: 20, letterSpacing: '12px',
    });
    const items = ['再開する', 'タイトルへ戻る'];
    for (let i = 0; i < items.length; i++) {
      const sel = i === this.menuIndex;
      glowText(ctx, items[i], VIEW_W / 2, 360 + i * 54, {
        size: 26, color: sel ? PAL.gold : 'rgba(253,246,227,0.55)',
        glow: sel ? PAL.gold : undefined, blur: 12, weight: sel ? '900' : '700',
      });
    }
    glowText(ctx, this.touch.enabled ? '項目をタップして選択' : '↑↓ で選択   Z で決定   Esc で再開', VIEW_W / 2, 520, {
      size: 13, color: 'rgba(253,246,227,0.4)',
    });
  }

  private drawCleared(ctx: CanvasRenderingContext2D): void {
    const run = this.run!;
    glowText(ctx, 'STAGE CLEAR', VIEW_W / 2, 230, {
      size: 64, color: PAL.cream, glow: PAL.gold, blur: 28, weight: '900', letterSpacing: '8px',
    });
    glowText(ctx, this.stages[run.stageIndex].name, VIEW_W / 2, 290, {
      size: 22, color: PAL.cyan, glow: PAL.cyan, blur: 10,
    });
    glowText(ctx, `到達レベル  Lv.${run.level}`, VIEW_W / 2, 360, { size: 20, color: PAL.cream });
    glowText(ctx, `獲得した電脳魂  ◆ ${this.save.persistentSoul}`, VIEW_W / 2, 396, { size: 20, color: PAL.gold });
    const blink = 0.5 + 0.5 * Math.sin(this.titleTime * 4);
    ctx.save();
    ctx.globalAlpha = blink;
    glowText(ctx, this.touch.enabled ? '次のステージへ — タップ' : '次のステージへ — PRESS Z', VIEW_W / 2, 480, {
      size: 22, color: PAL.cream, glow: PAL.magenta, blur: 12, weight: '800',
    });
    ctx.restore();
  }

  private drawGameOver(ctx: CanvasRenderingContext2D): void {
    glowText(ctx, 'GAME OVER', VIEW_W / 2, 260, {
      size: 80, color: PAL.blood, glow: PAL.magenta, blur: 30, weight: '900', letterSpacing: '10px',
    });
    glowText(ctx, '骸、ネオンの雨に還る', VIEW_W / 2, 330, {
      size: 20, color: 'rgba(253,246,227,0.6)', letterSpacing: '6px',
    });
    glowText(ctx, `電脳魂  ◆ ${this.save.persistentSoul}`, VIEW_W / 2, 400, { size: 18, color: PAL.gold });
    const blink = 0.5 + 0.5 * Math.sin(this.titleTime * 4);
    ctx.save();
    ctx.globalAlpha = blink;
    glowText(ctx, this.touch.enabled ? 'タップで戻る' : 'PRESS Z', VIEW_W / 2, 470, { size: 22, color: PAL.cream, glow: PAL.cyan, blur: 12, weight: '800' });
    ctx.restore();
  }

  private drawVictory(ctx: CanvasRenderingContext2D): void {
    glowText(ctx, 'VICTORY', VIEW_W / 2, 250, {
      size: 96, color: PAL.cream, glow: PAL.gold, blur: 36, weight: '900', letterSpacing: '14px',
    });
    glowText(ctx, '帝都の空を、一閃が断つ', VIEW_W / 2, 330, {
      size: 22, color: PAL.cyan, glow: PAL.cyan, blur: 12, letterSpacing: '6px',
    });
    glowText(ctx, `電脳魂  ◆ ${this.save.persistentSoul}`, VIEW_W / 2, 410, { size: 20, color: PAL.gold });
    const blink = 0.5 + 0.5 * Math.sin(this.titleTime * 4);
    ctx.save();
    ctx.globalAlpha = blink;
    glowText(ctx, this.touch.enabled ? 'タップで戻る' : 'PRESS Z', VIEW_W / 2, 480, { size: 22, color: PAL.cream, glow: PAL.magenta, blur: 12, weight: '800' });
    ctx.restore();
  }
}
