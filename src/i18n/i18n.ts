/** EN / 繁體中文. UI strings live in DICT; content uses inline { en, zh } pairs via tr(). */
export type Lang = 'en' | 'zh';
export type L = { en: string; zh: string };

const KEY = 'outbreak-nyc:lang';
const listeners: (() => void)[] = [];

function detect(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'zh') return q;
  try { const s = localStorage.getItem(KEY); if (s === 'en' || s === 'zh') return s; } catch { /* noop */ }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
let lang: Lang = detect();
document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';

export const getLang = () => lang;
export const onLangChange = (f: () => void) => listeners.push(f);
export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en';
  try { localStorage.setItem(KEY, l); } catch { /* noop */ }
  applyStatic();
  listeners.forEach((f) => f());
}
export const tr = (x: L) => x[lang];

const DICT: Record<string, L> = {
  'title.kicker': { en: 'DAY 1 OF THE OUTBREAK', zh: '爆發第一天' },
  'title.sub': { en: 'NEW YORK CITY · 2026', zh: '紐約市 · 2026' },
  'title.start': { en: 'Start New Game', zh: '開始新遊戲' },
  'title.load': { en: 'Continue', zh: '繼續遊戲' },
  'title.loading': { en: 'Loading Manhattan…', zh: '曼哈頓載入中…' },
  'title.tagline': { en: 'THE CITY THAT NEVER SLEEPS JUST WOKE UP DEAD.', zh: '不夜城，今晚醒來的是死人。' },
  'hud.hp': { en: 'HEALTH', zh: '生命' },
  'hud.armor': { en: 'ARMOR', zh: '護甲' },
  'hud.kills': { en: 'KILLS', zh: '擊殺' },
  'hud.mission': { en: 'MISSION', zh: '任務' },
  'hud.reloading': { en: 'RELOADING…', zh: '換彈中…' },
  'hud.empty': { en: 'NO AMMO', zh: '沒子彈了' },
  'hud.vehicle': { en: 'VEHICLE', zh: '載具' },
  'hud.grenades': { en: 'Grenades', zh: '手榴彈' },
  'hud.medkits': { en: 'Medkits', zh: '急救包' },
  'hud.lang': { en: 'Language (L)', zh: '語言 (L)' },
  'hud.sound': { en: 'Sound (M)', zh: '音效 (M)' },
  'hud.help': { en: 'Controls (H)', zh: '操作說明 (H)' },
  'prompt.enter': { en: 'ENTER', zh: '上車' },
  'prompt.exit': { en: 'EXIT VEHICLE', zh: '下車' },
  'prompt.rescue': { en: 'RESCUE', zh: '救援' },
  'prompt.hold': { en: 'HOLD', zh: '按住' },
  'wheel.title': { en: 'ARSENAL', zh: '武器庫' },
  'wheel.locked': { en: 'Not found yet', zh: '尚未取得' },
  'wheel.guns': { en: 'FIREARMS', zh: '槍械' },
  'wheel.heavy': { en: 'HEAVY & CANNONS', zh: '重武器與火砲' },
  'toast.newWeapon': { en: 'NEW WEAPON: {w}', zh: '取得新武器：{w}' },
  'toast.ammo': { en: '+ Ammo', zh: '+ 彈藥' },
  'toast.medkit': { en: '+ Medkit', zh: '+ 急救包' },
  'toast.bandage': { en: '+25 Health', zh: '+25 生命' },
  'toast.armor': { en: '+50 Armor', zh: '+50 護甲' },
  'toast.grenade': { en: '+2 Grenades', zh: '+2 手榴彈' },
  'toast.adrenaline': { en: 'ADRENALINE — speed up!', zh: '腎上腺素——速度提升!' },
  'toast.rage': { en: 'BERSERK — double damage!', zh: '狂暴——雙倍傷害!' },
  'toast.toolkit': { en: 'Vehicle repaired', zh: '載具已修復' },
  'toast.noMedkit': { en: 'No medkits', zh: '沒有急救包' },
  'toast.fullHp': { en: 'Health already full', zh: '生命已滿' },
  'toast.vehicleDestroyed': { en: 'Vehicle destroyed!', zh: '載具被摧毀了!' },
  'toast.missionDone': { en: 'MISSION COMPLETE', zh: '任務完成' },
  'toast.reward': { en: 'Reward: {r}', zh: '獎勵：{r}' },
  'toast.start': { en: 'WASD move · Mouse aim & shoot · F vehicles · Tab arsenal · Scroll zoom', zh: 'WASD 移動 · 滑鼠瞄準射擊 · F 上下車 · Tab 武器庫 · 滾輪縮放' },
  'toast.startMobile': { en: 'Left stick: move · Right stick: aim & fire', zh: '左搖桿移動 · 右搖桿瞄準射擊' },
  'over.title': { en: 'YOU DIED', zh: '你死了' },
  'over.sub': { en: 'Manhattan claims another one.', zh: '曼哈頓又多了一個亡魂。' },
  'over.retry': { en: 'Retry from checkpoint', zh: '從檢查點重來' },
  'end.title': { en: 'EVACUATED', zh: '成功撤離' },
  'end.sub': { en: 'The chopper lifts off over a burning skyline. You made it out of New York — this time.', zh: '直升機在燃燒的天際線上起飛。這一次，你逃出了紐約。' },
  'end.stats': { en: 'Zombies killed: {k} · Time: {t}', zh: '擊殺殭屍：{k} · 時間：{t}' },
  'end.again': { en: 'Play again', zh: '再玩一次' },
  'help.title': { en: 'Controls', zh: '操作說明' },
  'help.body': {
    en: 'WASD move · Shift sprint · Mouse aim · Left click shoot · R reload · 1-9 / Q E switch weapon · Tab arsenal · G grenade · H medkit (hold H for help) · F enter/exit vehicle, rescue · Space handbrake · Scroll / + − zoom · L language · M mute · Esc pause',
    zh: 'WASD 移動 · Shift 衝刺 · 滑鼠瞄準 · 左鍵射擊 · R 換彈 · 1-9 / Q E 切換武器 · Tab 武器庫 · G 手榴彈 · H 急救包 · F 上下車、救援 · 空白鍵 手煞車 · 滾輪 / + − 縮放 · L 語言 · M 靜音 · Esc 暫停',
  },
  'help.mobile': { en: 'Mobile: left stick moves, right stick aims and fires. Buttons for reload, weapon, grenade, medkit, vehicle.', zh: '手機：左搖桿移動，右搖桿瞄準並自動射擊。右側按鈕可換彈、換武器、丟手榴彈、補血、上下車。' },
  'pause.title': { en: 'PAUSED', zh: '暫停' },
  'pause.resume': { en: 'Resume', zh: '繼續' },
  'btn.reload': { en: 'RELOAD', zh: '換彈' },
  'btn.weapon': { en: 'WEAPON', zh: '武器' },
  'btn.vehicle': { en: 'CAR', zh: '載具' },
  'obj.reach': { en: 'Reach', zh: '前往' },
  'obj.kill': { en: 'Kill zombies', zh: '擊殺殭屍' },
  'obj.collect': { en: 'Collect', zh: '蒐集' },
  'obj.survive': { en: 'Survive', zh: '堅守' },
  'obj.boss': { en: 'Destroy the Abomination', zh: '消滅巨型憎惡體' },
  'obj.drive': { en: 'Get in a vehicle', zh: '找一台載具坐上去' },
  'obj.rescue': { en: 'Rescue survivors', zh: '救援倖存者' },
  'dist.m': { en: 'm', zh: '公尺' },
};

export function t(k: string, vars?: Record<string, string | number>) {
  let s = DICT[k] ? DICT[k][lang] : k;
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(String(b));
  return s;
}

export function applyStatic() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle!)));
  document.querySelectorAll<HTMLElement>('.lang-toggle').forEach((el) => (el.textContent = lang === 'zh' ? 'EN' : '中文'));
}
