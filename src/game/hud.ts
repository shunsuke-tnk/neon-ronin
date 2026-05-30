// In-game heads-up display: HP, residual-blade (ult) gauge, current weapon,
// soul/level, XP bar and the stage-intro banner. Minimal neon framing that
// keeps the play area clear.

import type { World } from './world.ts';
import { VIEW_W } from '../render/renderer.ts';
import { bar, glowText, ringMeter, panel, roundRect } from '../render/ui.ts';
import { mix, rgbStr } from '../render/color.ts';
import { clamp01 } from '../core/math.ts';
import { isTouch } from '../core/touch.ts';
import { WEAPONS, PAL } from '../content/design.ts';

export function drawHUD(ctx: CanvasRenderingContext2D, world: World): void {
  const run = world.run;
  const hpPct = clamp01(run.hp / run.stats.maxHp);

  // ---- HP ----
  const hpCol = rgbStr(mix(PAL.magenta, PAL.cyan, hpPct));
  const hpCol2 = rgbStr(mix(PAL.blood, PAL.jade, hpPct));
  bar(ctx, 26, 28, 320, 16, hpPct, hpCol, hpCol2, { radius: 4 });
  // segment ticks
  ctx.save();
  ctx.strokeStyle = 'rgba(5,6,13,0.8)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 10; i++) {
    const x = 26 + (320 / 10) * i;
    ctx.beginPath();
    ctx.moveTo(x, 28);
    ctx.lineTo(x, 44);
    ctx.stroke();
  }
  ctx.restore();
  glowText(ctx, `${Math.max(0, Math.ceil(run.hp))}`, 30, 36, {
    size: 12, align: 'left', color: PAL.cream, weight: '800',
  });

  // ---- ultimate (residual blade) gauge ----
  const ultReady = run.ultGauge >= 1;
  ringMeter(ctx, 372, 36, 18, run.ultGauge, ultReady ? PAL.cream : PAL.gold, 5);
  if (ultReady) {
    const pulse = 0.6 + 0.4 * Math.sin(world.time * 8);
    glowText(ctx, '残刃', 372, 36, { size: 12, color: PAL.gold, glow: PAL.gold, blur: 12 * pulse });
  } else {
    glowText(ctx, '残', 372, 36, { size: 12, color: 'rgba(255,210,63,0.6)' });
  }

  // ---- weapon + level + soul (top-right) ----
  const wid = run.weapons[run.weaponIndex];
  const weapon = WEAPONS[wid];
  panel(ctx, VIEW_W - 250, 22, 226, 52, { fill: 'rgba(10,12,24,0.55)', stroke: 'rgba(255,255,255,0.08)', radius: 8 });
  drawKatanaGlyph(ctx, VIEW_W - 232, 48, weapon.color);
  glowText(ctx, weapon.name, VIEW_W - 208, 40, {
    size: 20, align: 'left', color: weapon.color, glow: weapon.color, blur: 10,
  });
  glowText(ctx, weapon.kana, VIEW_W - 208, 60, {
    size: 10, align: 'left', color: 'rgba(253,246,227,0.6)', weight: '600',
  });
  glowText(ctx, `Lv.${run.level}`, VIEW_W - 34, 40, { size: 18, align: 'right', color: PAL.cyan });
  glowText(ctx, `◆ ${run.bankedSoul}`, VIEW_W - 34, 60, { size: 12, align: 'right', color: 'rgba(0,240,255,0.7)' });

  // ---- XP bar (bottom center) ----
  const xpW = 440;
  const xpPct = clamp01(run.soulShards / run.soulToNext);
  bar(ctx, (VIEW_W - xpW) / 2, 700, xpW, 5, xpPct, 'rgba(0,240,255,0.5)', PAL.cyan, {
    bg: 'rgba(255,255,255,0.06)', radius: 2.5,
  });

  // ---- weapon switch hint (small) — on-screen buttons replace it on touch ----
  if (run.weapons.length > 1 && !isTouch()) {
    glowText(ctx, '[C] 武器切替   [B] 残刃', VIEW_W / 2, 688, {
      size: 10, color: 'rgba(253,246,227,0.35)', weight: '600',
    });
  }

  // ---- boss health bar (top center) ----
  if (world.boss && !world.boss.dead) {
    const b = world.boss;
    const bw = 660;
    const bx = (VIEW_W - bw) / 2;
    const by = 96;
    glowText(ctx, b.displayName, VIEW_W / 2, 80, {
      size: 18, color: PAL.cream, glow: PAL.magenta, blur: 12, weight: '900', letterSpacing: '3px',
    });
    bar(ctx, bx, by, bw, 12, b.hpPct, PAL.blood, PAL.magenta, {
      bg: 'rgba(0,0,0,0.5)', radius: 3,
    });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, bw, 12, 3);
    ctx.stroke();
    ctx.restore();
    glowText(ctx, b.phaseLabel, bx + bw, by + 26, {
      size: 11, align: 'right', color: PAL.cyan, weight: '700',
    });
  }

  // ---- stage intro banner ----
  if (world.time < 3.6) {
    const a = world.time < 0.5 ? world.time / 0.5 : world.time > 3 ? clamp01((3.6 - world.time) / 0.6) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    glowText(ctx, `STAGE ${world.stage.id}`, VIEW_W / 2, 250, {
      size: 18, color: PAL.cyan, glow: PAL.cyan, blur: 14, letterSpacing: '8px',
    });
    glowText(ctx, world.stage.name, VIEW_W / 2, 292, {
      size: 44, color: PAL.cream, glow: PAL.magenta, blur: 22, weight: '900',
    });
    if (world.stage.subtitle) {
      glowText(ctx, world.stage.subtitle, VIEW_W / 2, 330, {
        size: 14, color: 'rgba(253,246,227,0.6)', letterSpacing: '6px',
      });
    }
    ctx.restore();
  }

  // ---- ultimate active vignette ----
  if (world.ultActive) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    // scanlines
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#00f0ff';
    for (let y = 0; y < 720; y += 3) ctx.fillRect(0, y, VIEW_W, 1);
    ctx.restore();
  }
}

function drawKatanaGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.6);
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9, 8);
  ctx.lineTo(8, -10);
  ctx.stroke();
  // guard
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-11, 3);
  ctx.lineTo(-5, 9);
  ctx.stroke();
  ctx.restore();
}
