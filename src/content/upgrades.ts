// Level-up upgrade cards (roguelite build). Each mutates the run's stats.
// rollUpgrades() picks distinct eligible cards by weight.

import type { RunState } from '../game/stats.ts';
import { PAL } from './design.ts';

export interface UpgradeDef {
  id: string;
  name: string;
  kana: string;
  desc: string;
  color: string;
  maxStacks: number;
  weight: number;
  apply(run: RunState): void;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'attack', name: '攻', kana: 'POWER', desc: '斬撃ダメージ +20%',
    color: PAL.magenta, maxStacks: 6, weight: 10,
    apply: (r) => { r.stats.attackMul += 0.2; },
  },
  {
    id: 'speed', name: '疾', kana: 'SWIFT', desc: '移動速度 +12%',
    color: PAL.cyan, maxStacks: 4, weight: 8,
    apply: (r) => { r.stats.moveSpeedMul += 0.12; },
  },
  {
    id: 'reach', name: '刃', kana: 'REACH', desc: '斬撃のリーチ +12%',
    color: PAL.jade, maxStacks: 4, weight: 8,
    apply: (r) => { r.stats.rangeMul += 0.12; },
  },
  {
    id: 'crit', name: '会', kana: 'CRIT', desc: '会心率 +8%',
    color: PAL.gold, maxStacks: 5, weight: 8,
    apply: (r) => { r.stats.critChance += 0.08; },
  },
  {
    id: 'core', name: '炉', kana: 'CORE', desc: '残刃ゲージの蓄積 +25%',
    color: PAL.violet, maxStacks: 4, weight: 7,
    apply: (r) => { r.stats.ultGainMul += 0.25; },
  },
  {
    id: 'airdash', name: '影', kana: 'SHADE', desc: '空中ダッシュ +1回',
    color: PAL.cyan, maxStacks: 2, weight: 5,
    apply: (r) => { r.stats.airDashMax += 1; },
  },
  {
    id: 'life', name: '命', kana: 'VITAL', desc: '最大HP +25（即回復）',
    color: PAL.jade, maxStacks: 5, weight: 8,
    apply: (r) => { r.stats.maxHp += 25; r.hp += 25; },
  },
  {
    id: 'leech', name: '吸', kana: 'LEECH', desc: '撃破でHP +3%回復',
    color: PAL.magenta, maxStacks: 3, weight: 6,
    apply: (r) => { r.stats.lifestealPct += 0.03; },
  },
  {
    id: 'magnet', name: '引', kana: 'DRAW', desc: '魂片の吸引範囲 +45',
    color: PAL.cyan, maxStacks: 3, weight: 5,
    apply: (r) => { r.stats.magnetRadius += 45; },
  },
  {
    id: 'evade', name: '避', kana: 'EVADE', desc: '被弾を回避する確率 +8%',
    color: PAL.violet, maxStacks: 3, weight: 5,
    apply: (r) => { r.stats.evadeChance += 0.08; },
  },
];

export function rollUpgrades(run: RunState, n = 3): UpgradeDef[] {
  const pool = UPGRADES.filter((u) => (run.upgradeStacks[u.id] ?? 0) < u.maxStacks);
  const chosen: UpgradeDef[] = [];
  const work = pool.slice();
  while (chosen.length < n && work.length) {
    let total = 0;
    for (const u of work) total += u.weight;
    let pick = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < work.length; i++) {
      pick -= work[i].weight;
      if (pick <= 0) {
        idx = i;
        break;
      }
    }
    chosen.push(work[idx]);
    work.splice(idx, 1);
  }
  return chosen;
}
