// Base class for everything that lives in the world and is updated/rendered
// each frame. World is imported as a type only to avoid a runtime cycle.

import type { Rect } from '../core/math.ts';
import type { World } from '../game/world.ts';

let NEXT_ID = 1;

export abstract class Entity {
  readonly id: number = NEXT_ID++;
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  vx = 0;
  vy = 0;
  dead = false;

  abstract update(dt: number, world: World): void;
  abstract render(ctx: CanvasRenderingContext2D, world: World): void;

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }
  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}
