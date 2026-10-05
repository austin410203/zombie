import type { L } from '../i18n/i18n';

export type FireKind = 'bullet' | 'pellet' | 'rocket' | 'grenade' | 'flame' | 'beam' | 'melee' | 'shell';

export interface WeaponDef {
  id: string;
  slot: number;            // display order in arsenal
  category: 'melee' | 'gun' | 'heavy';
  name: L;
  desc: L;
  kind: FireKind;
  damage: number;          // per projectile / per tick
  rpm: number;             // rounds per minute
  auto: boolean;
  mag: number;             // 0 = infinite (melee)
  reserve: number;         // starting reserve when found
  maxReserve: number;
  reload: number;          // seconds
  spread: number;          // radians
  pellets?: number;
  speed: number;           // projectile speed (u/s); bullets are near-instant
  range: number;
  blast?: number;          // explosion radius
  knockback?: number;
  pierce?: number;         // how many zombies a bullet passes through
  homing?: boolean;
  color: number;
  shake: number;
  sound: 'pistol' | 'heavyPistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'minigun' | 'launcher' | 'cannon' | 'flame' | 'rail' | 'swing';
  /** visual model parameters for the in-hand gun */
  model: { len: number; thick: number; color: number; barrels?: number; tube?: boolean };
}

const W = (d: WeaponDef) => d;

export const WEAPONS: WeaponDef[] = [
  W({ id: 'bat', slot: 0, category: 'melee', name: { en: 'Louisville Slugger', zh: '球棒' }, desc: { en: 'Wooden bat. Never runs out.', zh: '木製球棒，永遠不缺彈藥。' },
    kind: 'melee', damage: 45, rpm: 110, auto: true, mag: 0, reserve: 0, maxReserve: 0, reload: 0, spread: 1.2, speed: 0, range: 2.0, knockback: 6, color: 0xc9a46a, shake: 0.05, sound: 'swing', model: { len: 0.9, thick: 0.07, color: 0x8a6a3a } }),

  // ---------------------------------------------------------------- FIREARMS
  W({ id: 'pistol', slot: 1, category: 'gun', name: { en: 'M1911 Pistol', zh: 'M1911 手槍' }, desc: { en: 'NYPD sidearm. Reliable.', zh: '紐約警局制式手槍，可靠。' },
    kind: 'bullet', damage: 28, rpm: 360, auto: false, mag: 12, reserve: 60, maxReserve: 180, reload: 1.1, spread: 0.04, speed: 140, range: 30, color: 0xffe28a, shake: 0.04, sound: 'pistol', model: { len: 0.32, thick: 0.1, color: 0x2a2a2e } }),
  W({ id: 'magnum', slot: 2, category: 'gun', name: { en: '.44 Magnum', zh: '.44 麥格農左輪' }, desc: { en: 'Six shots. Each one counts. Pierces.', zh: '六發子彈，每一發都致命，可貫穿。' },
    kind: 'bullet', damage: 95, rpm: 150, auto: false, mag: 6, reserve: 24, maxReserve: 72, reload: 2.0, spread: 0.02, speed: 160, range: 34, pierce: 2, knockback: 3, color: 0xffd36a, shake: 0.12, sound: 'heavyPistol', model: { len: 0.42, thick: 0.12, color: 0x8c8f96 } }),
  W({ id: 'uzi', slot: 3, category: 'gun', name: { en: 'Uzi', zh: '烏茲衝鋒槍' }, desc: { en: 'Spray and pray.', zh: '亂槍打鳥專用。' },
    kind: 'bullet', damage: 16, rpm: 950, auto: true, mag: 32, reserve: 160, maxReserve: 480, reload: 1.4, spread: 0.12, speed: 130, range: 24, color: 0xfff0a0, shake: 0.03, sound: 'smg', model: { len: 0.45, thick: 0.13, color: 0x1e1f22 } }),
  W({ id: 'mp5', slot: 4, category: 'gun', name: { en: 'MP5 SMG', zh: 'MP5 衝鋒槍' }, desc: { en: 'Accurate, fast, SWAT favorite.', zh: '精準又快速，特警最愛。' },
    kind: 'bullet', damage: 20, rpm: 800, auto: true, mag: 30, reserve: 150, maxReserve: 450, reload: 1.6, spread: 0.06, speed: 140, range: 28, color: 0xfff0a0, shake: 0.03, sound: 'smg', model: { len: 0.6, thick: 0.13, color: 0x26282c } }),
  W({ id: 'shotgun', slot: 5, category: 'gun', name: { en: 'Pump Shotgun', zh: '泵動式霰彈槍' }, desc: { en: '8 pellets of crowd control.', zh: '一發 8 顆彈丸，清場利器。' },
    kind: 'pellet', damage: 18, pellets: 8, rpm: 75, auto: false, mag: 6, reserve: 30, maxReserve: 90, reload: 2.4, spread: 0.32, speed: 110, range: 16, knockback: 4, color: 0xffb860, shake: 0.18, sound: 'shotgun', model: { len: 0.85, thick: 0.12, color: 0x4a3524 } }),
  W({ id: 'aa12', slot: 6, category: 'gun', name: { en: 'AA-12 Auto Shotgun', zh: 'AA-12 全自動霰彈槍' }, desc: { en: 'Full-auto buckshot. Absolute chaos.', zh: '全自動霰彈，純粹的混亂。' },
    kind: 'pellet', damage: 15, pellets: 7, rpm: 300, auto: true, mag: 20, reserve: 60, maxReserve: 160, reload: 2.8, spread: 0.34, speed: 110, range: 15, knockback: 3, color: 0xffb860, shake: 0.14, sound: 'shotgun', model: { len: 0.8, thick: 0.16, color: 0x2c3a2a } }),
  W({ id: 'ak47', slot: 7, category: 'gun', name: { en: 'AK-47', zh: 'AK-47 突擊步槍' }, desc: { en: 'Hits hard, kicks harder.', zh: '威力大，後座力更大。' },
    kind: 'bullet', damage: 36, rpm: 600, auto: true, mag: 30, reserve: 120, maxReserve: 360, reload: 2.2, spread: 0.07, speed: 160, range: 36, pierce: 1, color: 0xffe28a, shake: 0.06, sound: 'rifle', model: { len: 0.95, thick: 0.13, color: 0x5a3a20 } }),
  W({ id: 'm4', slot: 8, category: 'gun', name: { en: 'M4 Carbine', zh: 'M4 卡賓槍' }, desc: { en: 'Military grade. Precise.', zh: '軍規等級，精準穩定。' },
    kind: 'bullet', damage: 32, rpm: 720, auto: true, mag: 30, reserve: 150, maxReserve: 360, reload: 1.9, spread: 0.045, speed: 170, range: 38, pierce: 1, color: 0xfff0a0, shake: 0.05, sound: 'rifle', model: { len: 0.9, thick: 0.13, color: 0x2e3034 } }),
  W({ id: 'sniper', slot: 9, category: 'gun', name: { en: 'Barrett .50 Sniper', zh: '巴雷特 .50 狙擊槍' }, desc: { en: 'One shot, a whole line of them.', zh: '一發子彈，貫穿一整排。' },
    kind: 'bullet', damage: 320, rpm: 50, auto: false, mag: 5, reserve: 20, maxReserve: 50, reload: 3.0, spread: 0.0, speed: 260, range: 70, pierce: 8, knockback: 8, color: 0xa8e8ff, shake: 0.3, sound: 'sniper', model: { len: 1.35, thick: 0.13, color: 0x3a3d33 } }),
  W({ id: 'minigun', slot: 10, category: 'gun', name: { en: 'M134 Minigun', zh: 'M134 迷你砲' }, desc: { en: '3,000 rounds per minute. Bring snacks.', zh: '每分鐘三千發，盡情掃射。' },
    kind: 'bullet', damage: 22, rpm: 2400, auto: true, mag: 300, reserve: 600, maxReserve: 1500, reload: 4.0, spread: 0.13, speed: 160, range: 32, color: 0xffd060, shake: 0.08, sound: 'minigun', model: { len: 1.0, thick: 0.22, color: 0x2a2a2a, barrels: 6 } }),
  W({ id: 'flamer', slot: 11, category: 'gun', name: { en: 'Flamethrower', zh: '火焰噴射器' }, desc: { en: 'Short range. Burns everything.', zh: '射程短，但燒光一切。' },
    kind: 'flame', damage: 9, rpm: 1200, auto: true, mag: 150, reserve: 300, maxReserve: 600, reload: 2.6, spread: 0.3, speed: 16, range: 8, color: 0xff7a20, shake: 0.02, sound: 'flame', model: { len: 0.95, thick: 0.18, color: 0x7a2a1a, tube: true } }),

  // ---------------------------------------------------------------- HEAVY & CANNONS
  W({ id: 'm79', slot: 12, category: 'heavy', name: { en: 'M79 Grenade Launcher', zh: 'M79 榴彈發射器' }, desc: { en: 'Lobbed 40mm explosive rounds.', zh: '拋射 40mm 爆裂彈。' },
    kind: 'grenade', damage: 140, rpm: 70, auto: false, mag: 1, reserve: 12, maxReserve: 36, reload: 1.5, spread: 0.02, speed: 26, range: 26, blast: 4.5, color: 0xffa040, shake: 0.35, sound: 'launcher', model: { len: 0.75, thick: 0.2, color: 0x4a5a30, tube: true } }),
  W({ id: 'rpg', slot: 13, category: 'heavy', name: { en: 'RPG-7', zh: 'RPG-7 火箭筒' }, desc: { en: 'Straight-flying rocket. Huge blast.', zh: '直線飛行火箭，爆炸範圍巨大。' },
    kind: 'rocket', damage: 260, rpm: 40, auto: false, mag: 1, reserve: 8, maxReserve: 24, reload: 2.4, spread: 0.01, speed: 34, range: 60, blast: 6, color: 0xff6a2a, shake: 0.55, sound: 'launcher', model: { len: 1.15, thick: 0.18, color: 0x4a5a30, tube: true } }),
  W({ id: 'javelin', slot: 14, category: 'heavy', name: { en: 'Homing Missile Launcher', zh: '追蹤飛彈發射器' }, desc: { en: 'Locks on to the biggest threat.', zh: '自動鎖定最大的威脅。' },
    kind: 'rocket', homing: true, damage: 300, rpm: 45, auto: false, mag: 2, reserve: 8, maxReserve: 20, reload: 3.0, spread: 0.05, speed: 28, range: 70, blast: 5.5, color: 0x60d0ff, shake: 0.5, sound: 'launcher', model: { len: 1.2, thick: 0.24, color: 0x3a4a3a, tube: true } }),
  W({ id: 'cannon', slot: 15, category: 'heavy', name: { en: 'Hand Cannon', zh: '手持加農砲' }, desc: { en: 'Fires a solid shell that plows through hordes, then explodes.', zh: '發射實心砲彈，犁穿屍群後爆炸。' },
    kind: 'shell', damage: 200, rpm: 35, auto: false, mag: 1, reserve: 10, maxReserve: 30, reload: 2.2, spread: 0.01, speed: 40, range: 45, pierce: 99, blast: 5, knockback: 10, color: 0xffc070, shake: 0.6, sound: 'cannon', model: { len: 0.9, thick: 0.32, color: 0x3a3a3a, tube: true } }),
  W({ id: 'mortar', slot: 16, category: 'heavy', name: { en: 'Cluster Mortar', zh: '集束迫擊砲' }, desc: { en: 'High arc shell that splits into 5 bomblets.', zh: '高拋物線砲彈，空中分裂成 5 枚子彈。' },
    kind: 'grenade', damage: 110, rpm: 40, auto: false, mag: 3, reserve: 9, maxReserve: 27, reload: 2.8, spread: 0.04, speed: 22, range: 30, blast: 3.6, pellets: 5, color: 0xff9030, shake: 0.4, sound: 'cannon', model: { len: 0.8, thick: 0.26, color: 0x535a40, tube: true } }),
  W({ id: 'railgun', slot: 17, category: 'heavy', name: { en: 'XR-9 Railgun (Prototype)', zh: 'XR-9 磁軌砲(原型)' }, desc: { en: 'Experimental. Hypersonic slug pierces everything.', zh: '實驗型武器，超音速彈丸貫穿一切。' },
    kind: 'beam', damage: 500, rpm: 50, auto: false, mag: 4, reserve: 12, maxReserve: 32, reload: 2.6, spread: 0, speed: 0, range: 80, pierce: 99, knockback: 6, color: 0x7ae8ff, shake: 0.45, sound: 'rail', model: { len: 1.2, thick: 0.16, color: 0x30404a, barrels: 2 } }),
];

export const weaponById = (id: string) => WEAPONS.find((w) => w.id === id)!;
