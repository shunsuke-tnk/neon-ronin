// Owns the canvas + 2D context, handles HiDPI scaling and letterboxing the
// fixed logical resolution into the browser window. Also exposes a small set
// of glow/gradient helpers used everywhere to get the "lit" look.

import { TAU } from '../core/math.ts';

export const VIEW_W = 1280;
export const VIEW_H = 720;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Logical viewport size (constant). */
  readonly w = VIEW_W;
  readonly h = VIEW_H;
  /** Device-pixel scale from logical units to backing-store pixels. */
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    // Fit logical viewport into the window preserving aspect ratio.
    const fit = Math.min(winW / this.w, winH / this.h);
    const cssW = this.w * fit;
    const cssH = this.h * fit;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.scale = fit * dpr;
    this.offsetX = 0;
    this.offsetY = 0;
  };

  /** Reset the transform so 1 unit == 1 logical pixel and clear the frame. */
  begin(): void {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    ctx.imageSmoothingEnabled = true;
  }

  clear(color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }

  // ---- glow helpers --------------------------------------------------------

  /** Soft radial blob (additive-friendly). */
  glowCircle(x: number, y: number, r: number, color: string, alpha = 1): void {
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Crisp core circle with a surrounding glow. */
  orb(x: number, y: number, r: number, core: string, glow: string): void {
    this.glowCircle(x, y, r * 2.6, glow, 0.5);
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** Glowing line segment (used for blades, beams, trails). */
  beam(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width: number,
    color: string,
    glowColor = color,
    glowWidth = width * 3,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = glowColor;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = glowWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }
}
