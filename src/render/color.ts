// Color helpers: hex parsing, interpolation, HSL, and rgba string building.
// Particles and procedural gradients all flow through these.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const HEX_CACHE = new Map<string, RGB>();

export function hexToRgb(hex: string): RGB {
  const cached = HEX_CACHE.get(hex);
  if (cached) return cached;
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  const n = parseInt(h, 16);
  const rgb: RGB = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  HEX_CACHE.set(hex, rgb);
  return rgb;
}

export function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function rgbStr(c: RGB, a = 1): string {
  return rgba(c.r, c.g, c.b, a);
}

export function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

// Lighten (amt > 0) or darken (amt < 0) a hex color toward white/black.
export function shade(hex: string, amt: number): string {
  const c = hexToRgb(hex);
  const t = Math.abs(amt);
  const target = amt >= 0 ? 255 : 0;
  return rgba(
    c.r + (target - c.r) * t,
    c.g + (target - c.g) * t,
    c.b + (target - c.b) * t,
    1,
  );
}

export function mix(hexA: string, hexB: string, t: number): RGB {
  return lerpRgb(hexToRgb(hexA), hexToRgb(hexB), t);
}
