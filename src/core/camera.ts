// Side-scrolling camera. Smoothly follows a target on X (with look-ahead),
// gently tracks Y, supports trauma-based screen shake and a hit-stop zoom kick.

import { clamp, damp, lerp, rand } from './math.ts';
import { VIEW_W, VIEW_H } from '../render/renderer.ts';

export class Camera {
  x = 0;
  y = 0;
  /** World bounds the camera is allowed to scroll within. */
  minX = 0;
  maxX = Infinity;
  minY = -200;
  maxY = 200;

  zoom = 1;
  private targetZoom = 1;

  // Trauma in [0,1]; shake magnitude scales with trauma^2 for a punchy feel.
  private trauma = 0;
  private shakeT = 0;
  shakeX = 0;
  shakeY = 0;

  lookAhead = 220;
  private facing = 1;

  follow(targetX: number, targetY: number, facing: number, dt: number): void {
    this.facing = lerp(this.facing, facing, clamp(dt * 6, 0, 1));
    const desiredX = targetX - VIEW_W * 0.5 + this.lookAhead * this.facing;
    const desiredY = targetY - VIEW_H * 0.58;
    this.x = clamp(damp(this.x, desiredX, 6, dt), this.minX, this.maxX);
    this.y = clamp(damp(this.y, desiredY, 5, dt), this.minY, this.maxY);

    this.zoom = damp(this.zoom, this.targetZoom, 8, dt);
    this.targetZoom = lerp(this.targetZoom, 1, clamp(dt * 4, 0, 1));

    // Decay trauma and resolve shake offset.
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.shakeT += dt * 60;
    const mag = this.trauma * this.trauma * 26;
    this.shakeX = (rand(-1, 1)) * mag;
    this.shakeY = (rand(-1, 1)) * mag;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Briefly punch the zoom (e.g. on a heavy hit or boss intro). */
  punchZoom(z: number): void {
    this.targetZoom = z;
  }

  get viewX(): number {
    return this.x + this.shakeX;
  }
  get viewY(): number {
    return this.y + this.shakeY;
  }
}
