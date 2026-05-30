// Stages 2–5. Built from a shared image-stage factory; each gets its own
// AI-generated parallax plates, palette, music mood, boss and ambient gimmick
// (rain / rising embers / darkness / lightning).

import type { StageDef } from './stagedef.ts';
import type { MusicMood } from '../core/audio.ts';
import type { EnemyKind } from '../entities/enemy.ts';
import { VIEW_W, VIEW_H } from '../render/renderer.ts';
import { PAL } from './design.ts';
import { hexToRgb } from '../render/color.ts';
import { rand } from '../core/math.ts';
import { makeBoss } from '../entities/boss.ts';
import {
  flatGround,
  scatterPlatforms,
  makeSpawns,
  drawImageBg,
  drawRain,
  drawDarkness,
} from './stage-helpers.ts';

interface StageOpts {
  id: number;
  name: string;
  subtitle: string;
  palette: string[];
  length: number;
  far: string;
  near: string;
  moonCore: string;
  moonGlow: string;
  music: MusicMood;
  bossId: string;
  kinds: EnemyKind[];
  seed: number;
  rain?: string;
  embers?: boolean;
  darkness?: boolean;
  lightning?: boolean;
}

function imageStage(o: StageOpts): StageDef {
  const groundY = 580;
  let lightningT = 3 + Math.random() * 3;

  const def: StageDef = {
    id: o.id,
    name: o.name,
    subtitle: o.subtitle,
    palette: o.palette,
    length: o.length,
    groundY,
    solids: flatGround(o.length, groundY, scatterPlatforms(o.length, groundY, o.seed)),
    spawns: makeSpawns(o.length, o.kinds),
    music: o.music,
    darkness: o.darkness,
    drawBackground(ctx, world) {
      drawImageBg(ctx, world, o.far, o.near, o.moonCore, o.moonGlow);
    },
    drawForeground(ctx, world) {
      if (o.darkness) drawDarkness(ctx, world, 0.9);
      if (o.rain) drawRain(ctx, world.camera.viewX, world.time, 0.8, o.rain);
    },
    spawnBoss(world) {
      return makeBoss(o.bossId, world.stage.length - 300, groundY - 170);
    },
  };

  if (o.embers || o.lightning) {
    def.ambient = (world, dt) => {
      if (o.embers && Math.random() < dt * 24) {
        world.particles.spawn({
          x: world.camera.viewX + Math.random() * VIEW_W,
          y: world.camera.viewY + VIEW_H + 12,
          vx: rand(-12, 12), vy: -rand(22, 60),
          life: 3.4, size: rand(1.4, 3),
          color: hexToRgb(PAL.gold), fadeColor: hexToRgb(PAL.magenta),
          additive: true, shrink: 0, drag: 0.3,
        });
      }
      if (o.lightning) {
        lightningT -= dt;
        if (lightningT <= 0) {
          lightningT = 3 + Math.random() * 4;
          world.flash(200, 210, 255, 0.5);
          world.camera.addTrauma(0.16);
        }
      }
    };
  }

  return def;
}

const MOOD2: MusicMood = { root: 247, scale: [0, 2, 4, 7, 9], stepDur: 0.13, bassWave: 'sawtooth', leadWave: 'square', name: 'maglev' };
const MOOD3: MusicMood = { root: 196, scale: [0, 2, 3, 7, 8], stepDur: 0.18, bassWave: 'sine', leadWave: 'triangle', name: 'shrine' };
const MOOD4: MusicMood = { root: 165, scale: [0, 3, 5, 6, 10], stepDur: 0.2, bassWave: 'sawtooth', leadWave: 'sine', name: 'sump' };
const MOOD5: MusicMood = { root: 233, scale: [0, 2, 3, 7, 10], stepDur: 0.12, bassWave: 'sawtooth', leadWave: 'square', name: 'keep' };

export function buildStagesMore(): StageDef[] {
  return [
    imageStage({
      id: 2, name: '高架・磁気鉄道', subtitle: 'MAGLEV SPRAWL',
      palette: [PAL.void, PAL.cyan, PAL.violet, PAL.jade], length: 5600,
      far: 'stage2_far.png', near: 'stage2_near.png', moonCore: '#a9f0ff', moonGlow: PAL.cyan,
      music: MOOD2, bossId: 'gourai',
      kinds: ['charger', 'flyer', 'grunt', 'drone', 'charger', 'guard'],
      seed: 21, rain: PAL.cyan,
    }),
    imageStage({
      id: 3, name: '電脳神社・サーバー鳥居', subtitle: 'SHRINE OF WIRES',
      palette: [PAL.void, PAL.gold, PAL.magenta, PAL.cream], length: 5600,
      far: 'stage3_far.png', near: 'stage3_near.png', moonCore: '#ffe9a8', moonGlow: PAL.gold,
      music: MOOD3, bossId: 'kitsunebi',
      kinds: ['flyer', 'grunt', 'drone', 'guard', 'flyer', 'grunt'],
      seed: 37, embers: true,
    }),
    imageStage({
      id: 4, name: 'ネオン地下・密造区', subtitle: 'UNDERGLOW SUMP',
      palette: [PAL.void, PAL.jade, PAL.violet, PAL.magenta], length: 5400,
      far: 'stage4_far.png', near: 'stage4_near.png', moonCore: '#9bffe0', moonGlow: PAL.jade,
      music: MOOD4, bossId: 'souga',
      kinds: ['guard', 'grunt', 'charger', 'grunt', 'guard', 'flyer'],
      seed: 53, darkness: true,
    }),
    imageStage({
      id: 5, name: '天守・企業中枢タワー', subtitle: 'SKY KEEP',
      palette: [PAL.void, PAL.magenta, PAL.gold, PAL.violet, PAL.cream], length: 6000,
      far: 'stage5_far.png', near: 'stage5_near.png', moonCore: '#ffd2e6', moonGlow: PAL.magenta,
      music: MOOD5, bossId: 'tenshu',
      kinds: ['guard', 'flyer', 'charger', 'grunt', 'guard', 'flyer', 'charger'],
      seed: 71, rain: PAL.magenta, lightning: true,
    }),
  ];
}
