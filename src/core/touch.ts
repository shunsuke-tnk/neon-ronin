// On-screen touch controls: a floating virtual stick (left thumb) and an action
// button cluster (right thumb), drawn in the neon style and overlaid on the
// canvas. Pointer hits are hit-tested in logical viewport coordinates and fed
// into the shared Input as virtual actions, so the rest of the game stays
// unaware that the input came from touch rather than the keyboard.

import type { Input, Action } from './input.ts';
import { VIEW_H, type Renderer } from '../render/renderer.ts';
import { PAL } from '../content/design.ts';
import { glowText } from '../render/ui.ts';
import { hexToRgb, rgbStr } from '../render/color.ts';
import { TAU } from './math.ts';

let touchCache: boolean | null = null;

/** True on phones/tablets (coarse pointer or touch points present). Cached. */
export function isTouch(): boolean {
  if (touchCache !== null) return touchCache;
  if (typeof window === 'undefined') return (touchCache = false);
  touchCache =
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    'ontouchstart' in window;
  return touchCache;
}

type Mode = 'play' | 'menu';

interface Btn {
  action: Action;
  x: number;
  y: number;
  r: number;
  label: string;
  color: string;
  pause?: boolean;
  /** Lights up only when its resource (ult gauge) is ready. */
  special?: boolean;
}

// Positions are in logical viewport units (1280×720). The right cluster sits
// clear of the HUD (HP top-left, weapon panel top-right, XP bottom-center).
const BUTTONS: Btn[] = [
  { action: 'attack', x: 1198, y: 598, r: 58, label: '斬', color: PAL.magenta },
  { action: 'jump', x: 1072, y: 598, r: 52, label: '跳', color: PAL.cyan },
  { action: 'dash', x: 1090, y: 488, r: 38, label: '駆', color: PAL.jade },
  { action: 'switch', x: 1196, y: 484, r: 36, label: '武', color: PAL.violet },
  { action: 'special', x: 1140, y: 392, r: 44, label: '残刃', color: PAL.gold, special: true },
  { action: 'pause', x: 1238, y: 106, r: 24, label: '', color: PAL.cream, pause: true },
];

const STICK = {
  zoneX: 540, // a touch left of this x (and below zoneY) spawns the stick
  zoneY: 290,
  restX: 175, // idle hint position
  restY: 558,
  radius: 80,
  knobR: 38,
  dead: 0.16,
};

type Tracked = { type: 'button'; action: Action } | { type: 'stick' };

export class TouchControls {
  enabled = isTouch();
  private input: Input;
  private renderer: Renderer;
  private canvas: HTMLCanvasElement;
  private mode: Mode = 'menu';

  private pointers = new Map<number, Tracked>();
  private stickId: number | null = null;
  private stickOX = 0;
  private stickOY = 0;
  private knobX = 0; // normalized knob offset in [-1, 1]
  private knobY = 0;
  private active = false; // stick engaged this gesture

  /** Tap-down positions (logical) collected this frame for menu hit-testing. */
  private taps: { x: number; y: number }[] = [];

  constructor(input: Input, renderer: Renderer, canvas: HTMLCanvasElement) {
    this.input = input;
    this.renderer = renderer;
    this.canvas = canvas;
    if (this.enabled) this.attach();
  }

  private attach(): void {
    const c = this.canvas;
    c.style.touchAction = 'none';
    // Gestures start on the canvas, but move/up/cancel listen on window so a
    // finger that drifts into the letterbox bars — or lifts off-canvas — never
    // leaves a control stuck "held" (which would make the hero run forever).
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  private onBlur = (): void => {
    this.reset();
  };

  /** 'play' shows/activates the pad; any other state hides it and frees holds. */
  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    if (this.mode === 'play') this.reset();
    this.mode = mode;
  }

  private reset(): void {
    this.input.releaseAll();
    this.pointers.clear();
    this.stickId = null;
    this.active = false;
    this.knobX = 0;
    this.knobY = 0;
  }

  /** Return and clear the taps gathered this frame (for menu selection). */
  takeTaps(): { x: number; y: number }[] {
    const t = this.taps;
    this.taps = [];
    return t;
  }

  /** Clear any unconsumed taps; call once at the end of each fixed update. */
  postUpdate(): void {
    this.taps.length = 0;
  }

  private onDown = (e: PointerEvent): void => {
    e.preventDefault();
    const p = this.renderer.clientToLogical(e.clientX, e.clientY);
    this.taps.push(p);
    if (this.mode !== 'play') return;

    // action buttons take priority over the stick zone
    for (const b of BUTTONS) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const hit = b.r + 8;
      if (dx * dx + dy * dy <= hit * hit) {
        this.input.setAction(b.action, true);
        this.pointers.set(e.pointerId, { type: 'button', action: b.action });
        this.capture(e.pointerId);
        return;
      }
    }

    // floating stick (left/lower area), one finger at a time
    if (this.stickId === null && p.x < STICK.zoneX && p.y > STICK.zoneY) {
      this.stickId = e.pointerId;
      this.stickOX = Math.max(STICK.radius + 10, Math.min(STICK.zoneX, p.x));
      this.stickOY = Math.min(VIEW_H - STICK.radius - 10, p.y);
      this.active = true;
      this.pointers.set(e.pointerId, { type: 'stick' });
      this.updateStick(p.x, p.y);
      this.capture(e.pointerId);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (this.stickId !== e.pointerId) return;
    e.preventDefault();
    const p = this.renderer.clientToLogical(e.clientX, e.clientY);
    this.updateStick(p.x, p.y);
  };

  private onUp = (e: PointerEvent): void => {
    const tr = this.pointers.get(e.pointerId);
    if (!tr) return;
    this.pointers.delete(e.pointerId);
    if (tr.type === 'button') {
      this.input.setAction(tr.action, false);
    } else {
      this.stickId = null;
      this.active = false;
      this.knobX = 0;
      this.knobY = 0;
      this.input.setStick(0, 0);
      this.input.setAction('down', false);
    }
  };

  private updateStick(px: number, py: number): void {
    const nx = clampUnit((px - this.stickOX) / STICK.radius);
    const ny = clampUnit((py - this.stickOY) / STICK.radius);
    this.knobX = nx;
    this.knobY = ny;
    // Horizontal drives movement; vertical is crouch-only (no analog Y needed
    // in a side-scroller), so a firm downward push maps to the 'down' action.
    this.input.setStick(Math.abs(nx) < STICK.dead ? 0 : nx, 0);
    this.input.setAction('down', ny > 0.55);
  }

  private capture(id: number): void {
    try {
      this.canvas.setPointerCapture(id);
    } catch {
      /* not all browsers / pointer types support capture */
    }
  }

  // ---- render --------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D, opts: { ultReady?: boolean } = {}): void {
    if (!this.enabled || this.mode !== 'play') return;
    this.drawStick(ctx);
    for (const b of BUTTONS) {
      const held = this.input.isDown(b.action);
      if (b.pause) {
        this.drawPause(ctx, b, held);
      } else {
        this.drawButton(ctx, b, held, b.special ? !!opts.ultReady : true);
      }
    }
  }

  private drawStick(ctx: CanvasRenderingContext2D): void {
    const ox = this.active ? this.stickOX : STICK.restX;
    const oy = this.active ? this.stickOY : STICK.restY;
    const a = this.active ? 0.9 : 0.4;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.cyan;
    ctx.shadowColor = PAL.cyan;
    ctx.shadowBlur = this.active ? 16 : 6;
    ctx.beginPath();
    ctx.arc(ox, oy, STICK.radius, 0, TAU);
    ctx.stroke();
    const kx = ox + this.knobX * STICK.radius;
    const ky = oy + this.knobY * STICK.radius;
    ctx.globalAlpha = a;
    ctx.fillStyle = rgbStr(hexToRgb(PAL.cyan), 0.18);
    ctx.beginPath();
    ctx.arc(kx, ky, STICK.knobR, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PAL.cream;
    ctx.shadowBlur = this.active ? 18 : 8;
    ctx.beginPath();
    ctx.arc(kx, ky, STICK.knobR, 0, TAU);
    ctx.stroke();
    ctx.restore();
    if (!this.active) {
      glowText(ctx, '移動', ox, oy + STICK.radius + 18, {
        size: 12, color: 'rgba(253,246,227,0.45)', weight: '700', letterSpacing: '4px',
      });
    }
  }

  private drawButton(ctx: CanvasRenderingContext2D, b: Btn, held: boolean, ready: boolean): void {
    ctx.save();
    ctx.globalAlpha = ready ? (held ? 1 : 0.72) : 0.4;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fillStyle = held ? rgbStr(hexToRgb(b.color), 0.3) : 'rgba(10,12,24,0.42)';
    ctx.fill();
    ctx.lineWidth = held ? 4 : 2.5;
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = held ? 26 : b.special && ready ? 20 : 10;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.stroke();
    ctx.restore();
    glowText(ctx, b.label, b.x, b.y, {
      size: b.label.length > 1 ? Math.round(b.r * 0.6) : Math.round(b.r * 0.92),
      color: held ? PAL.cream : b.color,
      glow: b.color,
      blur: held ? 16 : 8,
      weight: '900',
    });
  }

  private drawPause(ctx: CanvasRenderingContext2D, b: Btn, held: boolean): void {
    ctx.save();
    ctx.globalAlpha = held ? 0.95 : 0.55;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.fillStyle = 'rgba(10,12,24,0.42)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = b.color;
    const bw = 4;
    const bh = b.r * 0.78;
    const gap = 5;
    ctx.fillRect(b.x - gap - bw, b.y - bh / 2, bw, bh);
    ctx.fillRect(b.x + gap, b.y - bh / 2, bw, bh);
    ctx.restore();
  }
}

function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
