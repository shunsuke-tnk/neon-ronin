// Minimal AABB platformer physics. The level is described by a list of solid
// rectangles (some one-way) and entities are swept against them axis-by-axis.

import { Rect, aabb } from './math.ts';

export interface Solid extends Rect {
  /** One-way platforms only block a falling body landing from above. */
  oneWay?: boolean;
}

export interface Body extends Rect {
  vx: number;
  vy: number;
}

export interface CollisionResult {
  onGround: boolean;
  hitCeiling: boolean;
  hitWallLeft: boolean;
  hitWallRight: boolean;
}

export function moveAndCollide(b: Body, solids: Solid[], dt: number): CollisionResult {
  const res: CollisionResult = {
    onGround: false,
    hitCeiling: false,
    hitWallLeft: false,
    hitWallRight: false,
  };
  const startBottom = b.y + b.h;

  // --- horizontal sweep ---
  b.x += b.vx * dt;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (s.oneWay) continue;
    if (!aabb(b, s)) continue;
    if (b.vx > 0) {
      b.x = s.x - b.w;
      res.hitWallRight = true;
      b.vx = 0;
    } else if (b.vx < 0) {
      b.x = s.x + s.w;
      res.hitWallLeft = true;
      b.vx = 0;
    }
  }

  // --- vertical sweep ---
  b.y += b.vy * dt;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    if (!aabb(b, s)) continue;
    if (s.oneWay) {
      // Only land if we were above the platform top and moving down.
      if (b.vy > 0 && startBottom <= s.y + 8) {
        b.y = s.y - b.h;
        res.onGround = true;
        b.vy = 0;
      }
      continue;
    }
    if (b.vy > 0) {
      b.y = s.y - b.h;
      res.onGround = true;
      b.vy = 0;
    } else if (b.vy < 0) {
      b.y = s.y + s.h;
      res.hitCeiling = true;
      b.vy = 0;
    }
  }

  return res;
}
