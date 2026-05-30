// Locked design constants for NEON RONIN (synthesised from the design
// workflow). Palette, identity, weapon definitions and shared enums.

export const TITLE = 'NEON RONIN';
export const SUBTITLE = '斬光帝都 — SEVERED SKY';

/** Core neon palette. Black ground, pure-neon accents (no muddy gradients). */
export const PAL = {
  void: '#0a0a14',
  ink: '#121426',
  magenta: '#ff2d6f',
  cyan: '#00f0ff',
  gold: '#ffd23f',
  violet: '#9b5cff',
  jade: '#0affc2',
  cream: '#fdf6e3',
  blood: '#ff3b3b',
} as const;

export type Faction = 'player' | 'enemy';

export type WeaponId = 'hizuki' | 'raiga' | 'moda' | 'enge';

export type WeaponKind = 'melee' | 'chain' | 'wave' | 'fire';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  kana: string;
  kind: WeaponKind;
  /** Primary blade/trail color. */
  color: string;
  /** Secondary color the trail flows toward. */
  color2: string;
  baseDamage: number;
  /** Reach of the slash arc (px). */
  range: number;
  /** Seconds between swings. */
  cooldown: number;
  /** Knockback imparted to hit enemies. */
  knockback: number;
  desc: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  hizuki: {
    id: 'hizuki',
    name: '緋月',
    kana: 'ヒヅキ',
    kind: 'melee',
    color: PAL.magenta,
    color2: PAL.cyan,
    baseDamage: 17,
    range: 96,
    cooldown: 0.3,
    knockback: 220,
    desc: '基本の片手刀。最速の居合斬り。3段目で斬撃波を飛ばす。',
  },
  raiga: {
    id: 'raiga',
    name: '雷牙',
    kana: 'ライガ',
    kind: 'chain',
    color: PAL.cyan,
    color2: PAL.jade,
    baseDamage: 12,
    range: 150,
    cooldown: 0.42,
    knockback: 120,
    desc: '分節する鞭状刀。命中後、稲妻が近くの敵へ連鎖感電する。',
  },
  moda: {
    id: 'moda',
    name: '黙',
    kana: 'モダ',
    kind: 'wave',
    color: PAL.cream,
    color2: PAL.violet,
    baseDamage: 26,
    range: 132,
    cooldown: 0.62,
    knockback: 300,
    desc: '無音の衝撃波を前方へ放つ。盾を無視して貫通する。',
  },
  enge: {
    id: 'enge',
    name: '焔華',
    kana: 'エンゲ',
    kind: 'fire',
    color: PAL.gold,
    color2: PAL.magenta,
    baseDamage: 14,
    range: 120,
    cooldown: 0.8,
    knockback: 90,
    desc: '炎を撒く広範囲の太刀。地面に継続ダメージの火床を残す。',
  },
};

export const WEAPON_ORDER: WeaponId[] = ['hizuki', 'raiga', 'moda', 'enge'];
