// Shared building blocks for stages: terrain helpers, procedural fallbacks
// (city/rain) and the image-based parallax background drawer. Kept dependency-
// free of stages.ts so both stages.ts and stages-more.ts can import it.

import type { Solid } from '../core/physics.ts';
import type { SpawnDef } from './stagedef.ts';
import type { World } from '../game/world.ts';
import type { EnemyKind } from '../entities/enemy.ts';
import { VIEW_W, VIEW_H } from '../render/renderer.ts';
import { getImage, ready, tiledLayer } from '../render/assets.ts';
import { gradientSky, celestialGlow, starfield } from '../render/backdrop.ts';
import { rgba } from '../render/color.ts';
import { PAL } from './design.ts';

export function h2(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function flatGround(length: number, groundY: number, platforms: Solid[] = []): Solid[] {
  return [{ x: -40, y: groundY, w: length + 80, h: 320 }, ...platforms];
}

export function plat(x: number, y: number, w: number, oneWay = true): Solid {
  return { x, y, w, h: 18, oneWay };
}

/** Deterministic scattered floating platforms across the level. */
export function scatterPlatforms(length: number, groundY: number, seed: number): Solid[] {
  const out: Solid[] = [];
  let x = 600;
  let i = 0;
  while (x < length - 500) {
    const r = h2(i, seed);
    const y = groundY - (130 + r * 230);
    out.push(plat(Math.round(x), Math.round(y), 120 + Math.round(h2(i, seed + 5) * 90)));
    x += 250 + h2(i, seed + 9) * 230;
    i++;
  }
  return out;
}

/** Ramped enemy spawns cycling through a kind list. */
export function makeSpawns(length: number, kinds: EnemyKind[]): SpawnDef[] {
  const out: SpawnDef[] = [];
  let x = 660;
  let i = 0;
  while (x < length - 420) {
    out.push({ x: Math.round(x), kind: kinds[i % kinds.length] });
    x += 300 + (i % 3) * 130;
    i++;
  }
  return out;
}

/** Image-based multi-layer parallax background (far plate + near silhouettes). */
export function drawImageBg(
  ctx: CanvasRenderingContext2D,
  world: World,
  farKey: string,
  nearKey: string,
  moonCore: string,
  moonGlow: string,
  fallbackTop = '#0c0a1c',
  fallbackBottom = '#06060e',
): void {
  const cam = world.camera;
  const far = getImage(farKey);
  if (ready(far)) {
    const drawH = VIEW_H * 1.16;
    tiledLayer(ctx, far, cam.viewX, 0.08, VIEW_W, drawH, -(drawH - VIEW_H) / 2 - 24);
  } else {
    gradientSky(ctx, VIEW_W, VIEW_H, fallbackTop, fallbackBottom);
    starfield(ctx, cam.viewX, cam.viewY, VIEW_W, VIEW_H, 0.05, 70, 'rgba(180,200,255,0.7)', world.time, 1.4);
  }

  // depth wash (top + bottom darken for legibility)
  ctx.save();
  const vg = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  vg.addColorStop(0, 'rgba(5,6,13,0.5)');
  vg.addColorStop(0.4, 'rgba(5,6,13,0)');
  vg.addColorStop(1, 'rgba(5,6,13,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.restore();

  celestialGlow(ctx, VIEW_W * 0.8 - cam.viewX * 0.04, 140, 52, moonCore, moonGlow);

  const near = getImage(nearKey);
  if (ready(near)) {
    const gy = world.stage.groundY - cam.viewY;
    const nh = 372;
    tiledLayer(ctx, near, cam.viewX, 0.42, VIEW_W, nh, gy - nh + 26, 0.92);
  }

  // wet ground reflection band
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gy = world.stage.groundY - cam.viewY;
  const rg = ctx.createLinearGradient(0, gy, 0, gy + 120);
  rg.addColorStop(0, rgba(...rgbOf(moonGlow), 0.09));
  rg.addColorStop(1, 'transparent');
  ctx.fillStyle = rg;
  ctx.fillRect(0, gy, VIEW_W, 120);
  ctx.restore();
}

/** Procedural neon-city fallback layer (used only if images are unavailable). */
export function cityLayer(
  ctx: CanvasRenderingContext2D,
  camX: number,
  factor: number,
  baseY: number,
  spacing: number,
  minH: number,
  maxH: number,
  bodyColor: string,
  neonColors: string[],
  seed: number,
  time: number,
  windowColor: string,
): void {
  const ox = camX * factor;
  const first = Math.floor(ox / spacing) - 1;
  const count = Math.ceil(VIEW_W / spacing) + 2;
  const bucket = Math.floor(time * 1.5);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const idx = first + i;
    const r = h2(idx, seed);
    const bw = spacing * (0.62 + h2(idx, seed + 3) * 0.32);
    const bh = minH + r * (maxH - minH);
    const bx = idx * spacing - ox + (spacing - bw) / 2;
    const by = baseY - bh;
    ctx.fillStyle = bodyColor;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = neonColors[idx % neonColors.length];
    ctx.globalAlpha = 0.85;
    ctx.fillRect(bx, by, bw, 2.5);
    ctx.globalAlpha = 1;
    const cols = Math.max(2, Math.floor(bw / 12));
    const rows = Math.max(2, Math.floor(bh / 16));
    ctx.fillStyle = windowColor;
    for (let cxg = 0; cxg < cols; cxg++) {
      for (let ry = 0; ry < rows; ry++) {
        if (h2(idx * 131 + cxg * 7 + ry * 17, seed + bucket) > 0.78) {
          ctx.globalAlpha = 0.35 + h2(cxg, ry + bucket) * 0.5;
          ctx.fillRect(bx + 4 + cxg * 12, by + 6 + ry * 16, 5, 7);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Colored, slanted multi-layer rain in screen space. */
export function drawRain(
  ctx: CanvasRenderingContext2D,
  camX: number,
  time: number,
  intensity = 1,
  color: string = PAL.cyan,
): void {
  const layers = [
    { factor: 0.2, count: 38, len: 18, w: 1, speed: 700, alpha: 0.1, slant: 0.18 },
    { factor: 0.5, count: 48, len: 26, w: 1.4, speed: 1000, alpha: 0.16, slant: 0.22 },
    { factor: 0.9, count: 38, len: 40, w: 2, speed: 1500, alpha: 0.26, slant: 0.26 },
  ];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let li = 0; li < layers.length; li++) {
    const L = layers[li];
    ctx.strokeStyle = rgba(...rgbOf(li === 2 ? PAL.cream : color), L.alpha * intensity);
    ctx.lineWidth = L.w;
    ctx.beginPath();
    for (let i = 0; i < L.count; i++) {
      const seed = i * 53 + li * 1000;
      const baseX = h2(seed, 1) * (VIEW_W + 300) - 150;
      const fall = (time * L.speed + h2(seed, 2) * VIEW_H * 4) % (VIEW_H + 80);
      const x = baseX - ((camX * L.factor) % VIEW_W);
      const xx = ((x % (VIEW_W + 60)) + (VIEW_W + 60)) % (VIEW_W + 60) - 30;
      const y = fall - 40;
      ctx.moveTo(xx, y);
      ctx.lineTo(xx - L.len * L.slant, y + L.len);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Darkness overlay with light holes around the player, enemies and boss. */
export function drawDarkness(ctx: CanvasRenderingContext2D, world: World, ambientDark = 0.9): void {
  const cam = world.camera;
  ctx.save();
  ctx.fillStyle = `rgba(2,3,8,${ambientDark})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalCompositeOperation = 'destination-out';
  const hole = (x: number, y: number, r: number, strength = 1) => {
    const sx = x - cam.viewX;
    const sy = y - cam.viewY;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  };
  if (world.player && !world.player.dead) hole(world.player.cx, world.player.cy, 220);
  for (const e of world.enemies) hole(e.cx, e.cy, 96, 0.85);
  if (world.boss && !world.boss.dead) hole(world.boss.cx, world.boss.cy, 190, 0.9);

  // additive lantern glow so the dark-silhouette hero stays readable
  ctx.globalCompositeOperation = 'lighter';
  if (world.player && !world.player.dead) {
    const sx = world.player.cx - cam.viewX;
    const sy = world.player.cy - cam.viewY;
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 170);
    g.addColorStop(0, 'rgba(0,240,255,0.16)');
    g.addColorStop(1, 'rgba(0,240,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 170, sy - 170, 340, 340);
  }
  ctx.restore();
}
