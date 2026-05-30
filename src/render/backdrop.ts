// Procedural background primitives. Each stage composes these with its own
// palette to build a unique multi-layer parallax scene — no image assets.
// All functions draw in screen space and take the camera offset explicitly.

import { TAU } from '../core/math.ts';

// Deterministic hashes so silhouettes/stars are stable frame to frame.
function hash1(i: number): number {
  let h = (i | 0) * 374761393;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function hash2(x: number, y: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Smooth 1D value noise in [0,1].
function vnoise(x: number): number {
  const xi = Math.floor(x);
  const xf = x - xi;
  const a = hash1(xi);
  const b = hash1(xi + 1);
  const t = xf * xf * (3 - 2 * xf);
  return a + (b - a) * t;
}

function fbm(x: number): number {
  return (
    vnoise(x) * 0.55 +
    vnoise(x * 2.1 + 11.3) * 0.3 +
    vnoise(x * 4.3 + 4.7) * 0.15
  );
}

export function gradientSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  top: string,
  bottom: string,
  midStop?: { color: string; at: number },
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  if (midStop) g.addColorStop(midStop.at, midStop.color);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A soft glowing celestial body (sun / moon / core). */
export function celestialGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  core: string,
  glow: string,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, core);
  g.addColorStop(0.25, glow);
  g.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function starfield(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  w: number,
  h: number,
  factor: number,
  cell: number,
  color: string,
  time: number,
  maxSize = 1.8,
): void {
  const ox = camX * factor;
  const oy = camY * factor;
  const startCol = Math.floor(ox / cell) - 1;
  const startRow = Math.floor(oy / cell) - 1;
  const cols = Math.ceil(w / cell) + 2;
  const rows = Math.ceil(h / cell) + 2;
  ctx.save();
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = startCol + c;
      const gy = startRow + r;
      const rnd = hash2(gx, gy);
      if (rnd > 0.55) continue; // sparse
      const px = gx * cell + hash2(gx + 7, gy) * cell - ox;
      const py = gy * cell + hash2(gx, gy + 13) * cell - oy;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + rnd * 30));
      ctx.globalAlpha = tw;
      const size = (0.4 + rnd * maxSize) * tw;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * A procedural silhouette ridge (mountains / city / canopy) filling from the
 * baseline to the bottom of the screen.
 */
export function ridge(
  ctx: CanvasRenderingContext2D,
  camX: number,
  w: number,
  h: number,
  factor: number,
  baseY: number,
  amplitude: number,
  roughness: number,
  color: string,
  seed: number,
  step = 10,
): void {
  const ox = camX * factor;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let sx = 0; sx <= w + step; sx += step) {
    const wx = (ox + sx) * roughness * 0.01 + seed * 100;
    const y = baseY - fbm(wx) * amplitude;
    ctx.lineTo(sx, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Horizontal drifting fog band. */
export function fogBand(
  ctx: CanvasRenderingContext2D,
  y: number,
  h: number,
  w: number,
  color: string,
  alpha: number,
): void {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'transparent');
  g.addColorStop(0.5, color);
  g.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, y, w, h);
  ctx.restore();
}
