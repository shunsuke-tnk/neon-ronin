// Shape of a stage. Layout (solids/spawns) is data; the parallax background,
// optional foreground and per-frame ambient gimmick are functions so each
// stage can paint and behave uniquely. World imported as type only.

import type { EnemyKind } from '../entities/enemy.ts';
import type { Solid } from '../core/physics.ts';
import type { MusicMood } from '../core/audio.ts';
import type { World, BossLike } from '../game/world.ts';

export interface SpawnDef {
  x: number;
  /** Optional explicit ground/anchor Y (defaults to stage.groundY). */
  y?: number;
  kind: EnemyKind;
}

export interface StageDef {
  id: number;
  name: string;
  subtitle?: string;
  palette: string[];
  /** World width in px. */
  length: number;
  groundY: number;
  solids: Solid[];
  spawns: SpawnDef[];
  music: MusicMood;
  /** Recolor standard enemies to fit the stage. */
  tint?: string;
  /** Limited-vision stage (handled by World/foreground). */
  darkness?: boolean;
  drawBackground(ctx: CanvasRenderingContext2D, world: World): void;
  drawForeground?(ctx: CanvasRenderingContext2D, world: World): void;
  ambient?(world: World, dt: number): void;
  /** If present the stage ends with a boss; otherwise reaching the end clears it. */
  spawnBoss?(world: World): BossLike;
}
