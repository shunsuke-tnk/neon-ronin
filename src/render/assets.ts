// Image asset registry. Uses Vite's import.meta.glob so the build only bundles
// PNGs that actually exist (missing assets degrade gracefully to procedural
// rendering). In the single-file build these are inlined as data URIs.

const modules = import.meta.glob('../assets/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const EXT = /\.(png|webp|jpe?g)$/i;

// Map basename-without-extension -> url, so callers can ask by name regardless
// of the on-disk format (e.g. 'hero.png' resolves to hero.webp).
const byName = new Map<string, string>();
for (const k of Object.keys(modules)) {
  const file = k.slice(k.lastIndexOf('/') + 1);
  byName.set(file.replace(EXT, ''), modules[k]);
}

const cache = new Map<string, HTMLImageElement>();

/** Get an image by name with or without extension. Returns null if not bundled. */
export function getImage(name: string): HTMLImageElement | null {
  const base = name.replace(EXT, '');
  const url = byName.get(base);
  if (!url) return null;
  let img = cache.get(base);
  if (!img) {
    img = new Image();
    img.src = url;
    cache.set(base, img);
  }
  return img;
}

/** True once the image has finished decoding and is safe to draw. */
export function ready(img: HTMLImageElement | null): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

/** Kick off decoding for everything up-front. */
export function preloadAll(): void {
  for (const base of byName.keys()) getImage(base);
}

/**
 * Draw a horizontally-tiled parallax layer (screen space). `camX` is the
 * camera world-x, `factor` the parallax ratio (0 = static, 1 = locked to world).
 */
export function tiledLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  camX: number,
  factor: number,
  viewW: number,
  drawH: number,
  yTop: number,
  alpha = 1,
): void {
  const ar = img.naturalWidth / img.naturalHeight;
  const drawW = drawH * ar;
  let off = (camX * factor) % drawW;
  if (off < 0) off += drawW;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let x = -off; x < viewW + 1; x += drawW) {
    ctx.drawImage(img, Math.round(x), Math.round(yTop), Math.ceil(drawW) + 1, drawH);
  }
  ctx.restore();
}

/** Draw an image scaled to COVER the viewport (fill, preserve aspect, crop). */
export function coverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  viewW: number,
  viewH: number,
  ox = 0,
  oy = 0,
): void {
  const ar = img.naturalWidth / img.naturalHeight;
  const va = viewW / viewH;
  let dw: number;
  let dh: number;
  if (ar > va) {
    dh = viewH;
    dw = dh * ar;
  } else {
    dw = viewW;
    dh = dw / ar;
  }
  // extra margin so drift never exposes an edge
  dw *= 1.06;
  dh *= 1.06;
  ctx.drawImage(img, (viewW - dw) / 2 + ox, (viewH - dh) / 2 + oy, dw, dh);
}

/** Draw a sprite anchored by its feet (bottom-center), facing-aware. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  feetY: number,
  drawH: number,
  facing: number,
  opts: { alpha?: number; additive?: boolean; sx?: number; sy?: number } = {},
): void {
  const ar = img.naturalWidth / img.naturalHeight;
  const w = drawH * ar;
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.additive) ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, feetY);
  ctx.scale(facing * (opts.sx ?? 1), opts.sy ?? 1);
  ctx.drawImage(img, -w / 2, -drawH, w, drawH);
  ctx.restore();
}
