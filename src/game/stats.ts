// Per-run player stats. Mutated by level-up upgrade cards; seeded from the
// persistent meta tree at the start of each run.

import type { WeaponId } from '../content/design.ts';

export interface PlayerStats {
  maxHp: number;
  /** Outgoing damage multiplier. */
  attackMul: number;
  /** Number of slashes per attack input (1 → 3+ for a fan of cuts). */
  slashCount: number;
  moveSpeedMul: number;
  /** Max air dashes before landing. */
  airDashMax: number;
  /** Ultimate (residual blade) gauge gain multiplier. */
  ultGainMul: number;
  /** Attack reach / trail length multiplier. */
  rangeMul: number;
  critChance: number;
  critMul: number;
  /** Fraction of max HP healed per kill. */
  lifestealPct: number;
  /** Soul shard magnet radius (px). */
  magnetRadius: number;
  /** Chance to evade a hit entirely (glitch dodge). */
  evadeChance: number;
  /** Auto-revive charges remaining this run. */
  reviveCharges: number;
}

export function baseStats(): PlayerStats {
  return {
    maxHp: 120,
    attackMul: 1,
    slashCount: 1,
    moveSpeedMul: 1,
    airDashMax: 1,
    ultGainMul: 1,
    rangeMul: 1,
    critChance: 0.06,
    critMul: 2,
    lifestealPct: 0,
    magnetRadius: 92,
    evadeChance: 0,
    reviveCharges: 0,
  };
}

/** Live state for a single run (one playthrough attempt). */
export interface RunState {
  stats: PlayerStats;
  hp: number;
  level: number;
  soulShards: number;
  /** Shards needed for the next level. */
  soulToNext: number;
  /** Soul shards collected this run (becomes persistent currency on clear). */
  bankedSoul: number;
  ultGauge: number; // 0..1
  weapons: WeaponId[];
  weaponIndex: number;
  stageIndex: number;
  /** Stacks of each upgrade taken (for diminishing/limited cards). */
  upgradeStacks: Record<string, number>;
}

export function soulNeeded(level: number): number {
  return Math.ceil(8 * Math.pow(1.32, level - 1));
}
