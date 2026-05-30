// Screen-space UI primitives for HUD, menus and overlays. All colors are
// passed in so the same helpers serve every theme.

import { TAU, clamp01 } from '../core/math.ts';

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { fill?: string; stroke?: string; radius?: number; glow?: string; alpha?: number } = {},
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = 26;
  }
  roundRect(ctx, x, y, w, h, opts.radius ?? 14);
  ctx.fillStyle = opts.fill ?? 'rgba(10,14,28,0.82)';
  ctx.fill();
  ctx.shadowBlur = 0;
  if (opts.stroke) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** Horizontal stat bar with a smooth gradient fill and optional ghost (recent damage) layer. */
export function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  colA: string,
  colB: string,
  opts: { bg?: string; ghost?: number; ghostColor?: string; radius?: number } = {},
): void {
  const r = opts.radius ?? h / 2;
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = opts.bg ?? 'rgba(0,0,0,0.45)';
  ctx.fill();

  if (opts.ghost !== undefined && opts.ghost > pct) {
    roundRect(ctx, x, y, w * clamp01(opts.ghost), h, r);
    ctx.fillStyle = opts.ghostColor ?? 'rgba(255,255,255,0.25)';
    ctx.fill();
  }

  const fw = w * clamp01(pct);
  if (fw > 0.5) {
    roundRect(ctx, x, y, fw, h, r);
    ctx.clip();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, colA);
    g.addColorStop(1, colB);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, fw, h);
    // glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, fw, h * 0.4);
  }
  ctx.restore();
}

export function glowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    size?: number;
    weight?: string;
    color?: string;
    glow?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    letterSpacing?: string;
    blur?: number;
  } = {},
): void {
  ctx.save();
  ctx.font = `${opts.weight ?? '800'} ${opts.size ?? 32}px "Hiragino Sans", system-ui, sans-serif`;
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = opts.baseline ?? 'middle';
  if ('letterSpacing' in ctx && opts.letterSpacing) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing =
      opts.letterSpacing;
  }
  if (opts.glow) {
    ctx.shadowColor = opts.glow;
    ctx.shadowBlur = opts.blur ?? 18;
  }
  ctx.fillStyle = opts.color ?? '#ffffff';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Diamond / gem marker used for selection cursors and accents. */
export function diamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function ringMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  pct: number,
  color: string,
  width = 5,
  bg = 'rgba(255,255,255,0.12)',
): void {
  ctx.save();
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.strokeStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(pct));
  ctx.stroke();
  ctx.restore();
}
