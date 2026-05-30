// Stage 1 (full) + assembly of all stages. Shared drawing/terrain helpers live
// in stage-helpers.ts; stages 2–5 are built in stages-more.ts.

import type { StageDef, SpawnDef } from './stagedef.ts';
import type { Solid } from '../core/physics.ts';
import type { MusicMood } from '../core/audio.ts';
import { PAL } from './design.ts';
import { flatGround, plat, drawImageBg, drawRain } from './stage-helpers.ts';
import { makeBoss } from '../entities/boss.ts';
import { buildStagesMore } from './stages-more.ts';

const STAGE1_MOOD: MusicMood = {
  root: 220,
  scale: [0, 3, 5, 7, 10],
  stepDur: 0.17,
  bassWave: 'sawtooth',
  leadWave: 'triangle',
  name: 'rain',
};

function buildStage1(): StageDef {
  const groundY = 580;
  const length = 5400;
  const platforms: Solid[] = [
    plat(640, 452, 150), plat(900, 372, 140), plat(1180, 470, 170),
    plat(1500, 392, 130), plat(1980, 440, 200), plat(2360, 360, 150),
    plat(2680, 470, 160), plat(3120, 410, 180), plat(3520, 360, 150),
    plat(3900, 460, 170), plat(4360, 400, 160), plat(4720, 470, 200),
  ];
  const spawns: SpawnDef[] = [
    { x: 700, kind: 'grunt' }, { x: 1150, kind: 'grunt' }, { x: 1450, kind: 'drone' },
    { x: 1850, kind: 'grunt' }, { x: 2150, kind: 'charger' }, { x: 2550, kind: 'drone' },
    { x: 2750, kind: 'grunt' }, { x: 3100, kind: 'guard' }, { x: 3450, kind: 'flyer' },
    { x: 3700, kind: 'grunt' }, { x: 4050, kind: 'charger' }, { x: 4300, kind: 'drone' },
    { x: 4550, kind: 'grunt' }, { x: 4750, kind: 'flyer' }, { x: 5000, kind: 'guard' },
  ];

  return {
    id: 1,
    name: '雨都・歌舞伎横丁',
    subtitle: 'RAIN DISTRICT',
    palette: [PAL.void, PAL.magenta, PAL.cyan, PAL.cream],
    length,
    groundY,
    solids: flatGround(length, groundY, platforms),
    spawns,
    music: STAGE1_MOOD,
    drawBackground(ctx, world) {
      drawImageBg(ctx, world, 'stage1_far.png', 'stage1_near.png', '#ff8fb4', '#ff2d6f');
    },
    drawForeground(ctx, world) {
      drawRain(ctx, world.camera.viewX, world.time, 1, PAL.cyan);
    },
    spawnBoss(world) {
      return makeBoss('amazarashi', world.stage.length - 280, world.stage.groundY - 170);
    },
  };
}

let cached: StageDef[] | null = null;

export function getStages(): StageDef[] {
  if (!cached) cached = [buildStage1(), ...buildStagesMore()];
  return cached;
}
