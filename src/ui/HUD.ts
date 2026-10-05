import * as THREE from 'three';
import { WEAPONS, weaponById } from '../data/weapons';
import { AVES, STREETS, ROAD_HALF, BOUNDS } from '../world/City';
import { applyStatic, getLang, onLangChange, setLang, t, tr } from '../i18n/i18n';
import type { WeaponSystem } from '../combat/Weapons';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface MapDot { x: number; z: number; color: string; r: number }

/** All DOM HUD work; writes are cached so unchanged values never touch the DOM. */
export class HUD {
  private cache = new Map<string, string>();
  private radioQueue: string[] = [];
  private radioTimer = 0;
  private mapBase: HTMLCanvasElement;
  private mm: CanvasRenderingContext2D;
  onWeaponPick?: (id: string) => void;

  constructor(private weapons: WeaponSystem) {
    this.mm = $<HTMLCanvasElement>('minimap').getContext('2d')!;
    this.mapBase = this.renderMapBase();
    document.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => this.closeModals()));
    $('btn-help').onclick = () => this.toggle('help');
    $('btn-lang').onclick = () => setLang(getLang() === 'zh' ? 'en' : 'zh');
    $('btn-lang-title').onclick = () => setLang(getLang() === 'zh' ? 'en' : 'zh');
    onLangChange(() => { this.cache.clear(); if (!$('wheel').classList.contains('hidden')) this.renderWheel(); });
    applyStatic();
  }

  set(id: string, v: string, prop: 'text' | 'width' | 'html' = 'text') {
    const k = id + prop;
    if (this.cache.get(k) === v) return;
    this.cache.set(k, v);
    const el = $(id);
    if (prop === 'text') el.textContent = v; else if (prop === 'html') el.innerHTML = v; else el.style.width = v;
  }

  show() { $('hud').classList.remove('hidden'); }

  toast(msg: string, cls = '') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${cls}`;
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild!.remove();
    setTimeout(() => el.remove(), 2700);
  }

  radio(lines: string[]) { this.radioQueue.push(...lines); if (this.radioTimer <= 0) this.radioTimer = 0.01; }

  flashMission() { const m = document.querySelector('.mission')!; m.classList.remove('flash'); void (m as HTMLElement).offsetWidth; m.classList.add('flash'); }

  // ---------------------------------------------------------------- per-frame
  update(dt: number, s: {
    missionNum: string; missionTitle: string; objective: string; progress: string;
    hp: number; maxHp: number; armor: number; stamina: number; grenades: number; medkits: number; adrenaline: number; rage: number;
    kills: number; hurt: number; vehicle: { name: string; speed: number; hp: number } | null; boss: { name: string; hp: number } | null;
    prompt: { text: string; hold: number } | null;
  }) {
    this.set('m-num', s.missionNum); this.set('m-title', s.missionTitle); this.set('m-obj', s.objective); this.set('m-prog', s.progress);
    this.set('hp-bar', `${(s.hp / s.maxHp) * 100}%`, 'width'); this.set('hp-val', String(Math.ceil(s.hp)));
    this.set('ar-bar', `${s.armor}%`, 'width'); this.set('ar-val', String(Math.ceil(s.armor)));
    this.set('st-bar', `${s.stamina * 100}%`, 'width');
    this.set('gr', String(s.grenades)); this.set('mk', String(s.medkits)); this.set('kills', String(s.kills));
    this.set('buffs', (s.adrenaline > 0 ? `<span class="buff-adr">⚡ ${Math.ceil(s.adrenaline)}s</span>` : '') + (s.rage > 0 ? `<span class="buff-rage">✸ ×2 ${Math.ceil(s.rage)}s</span>` : ''), 'html');
    $('hurt').style.opacity = String(Math.min(1, s.hurt + (s.hp < 30 ? 0.25 + Math.sin(performance.now() / 200) * 0.1 : 0)));

    // weapon
    const w = this.weapons.def, a = this.weapons.ammo;
    this.set('w-name', tr(w.name));
    this.set('w-mag', w.mag ? String(a.mag) : '∞'); this.set('w-res', w.mag ? String(a.reserve) : '');
    this.set('w-rl', this.weapons.reloading > 0 ? `${(1 - this.weapons.reloading / w.reload) * 100}%` : '0%', 'width');
    this.set('w-status', this.weapons.reloading > 0 ? t('hud.reloading') : w.mag && a.mag === 0 && a.reserve === 0 ? t('hud.empty') : '');

    // vehicle
    $('vehicle-hud').classList.toggle('hidden', !s.vehicle);
    if (s.vehicle) { this.set('v-name', s.vehicle.name); this.set('v-speed', String(Math.round(Math.abs(s.vehicle.speed) * 3.6))); this.set('v-hp', `${s.vehicle.hp * 100}%`, 'width'); }
    $('weapon-panel').style.opacity = s.vehicle ? '0.4' : '1';

    // boss
    $('boss').classList.toggle('hidden', !s.boss);
    if (s.boss) { this.set('boss-name', s.boss.name); this.set('boss-hp', `${s.boss.hp * 100}%`, 'width'); }

    // prompt
    $('prompt').classList.toggle('hidden', !s.prompt);
    if (s.prompt) { this.set('prompt-text', s.prompt.text); this.set('prompt-hold', `${s.prompt.hold * 100}%`, 'width'); }

    // radio
    if (this.radioTimer > 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) {
        const next = this.radioQueue.shift();
        if (next) { $('radio').classList.remove('hidden'); $('radio-text').textContent = next; this.radioTimer = Math.max(3.5, next.length * 0.06); this.onRadio?.(); }
        else $('radio').classList.add('hidden');
      }
    }
  }
  onRadio?: () => void;

  weaponSwap() { const el = $('weapon-panel'); el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }

  /** Objective arrow: on-screen marker or clamped to the edge */
  arrow(target: THREE.Vector3 | null, camera: THREE.Camera, player: THREE.Vector3) {
    const el = $('arrow');
    if (!target) { el.classList.add('hidden'); return; }
    const p = target.clone().setY(2).project(camera);
    const W = innerWidth, H = innerHeight;
    let x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    const behind = p.z > 1;
    const m = 50;
    const onScreen = !behind && x > m && x < W - m && y > m && y < H - m;
    let ang = 0;
    if (!onScreen) {
      const cx = W / 2, cy = H / 2;
      let dx = x - cx, dy = y - cy;
      if (behind) { dx = -dx; dy = -dy; }
      ang = Math.atan2(dy, dx) + Math.PI / 2;
      const k = Math.min((W / 2 - m) / Math.abs(dx || 1), (H / 2 - m) / Math.abs(dy || 1));
      x = cx + dx * k; y = cy + dy * k;
    } else ang = Math.PI; // pointing down at the target
    el.classList.remove('hidden');
    el.style.transform = `translate(${x}px, ${y}px)`;
    (el.firstElementChild as HTMLElement).style.transform = `rotate(${ang}rad)`;
    this.set('arrow-d', `${Math.round(Math.hypot(target.x - player.x, target.z - player.z))}${t('dist.m')}`);
  }

  // ---------------------------------------------------------------- minimap
  private renderMapBase() {
    const S = 4; // px per world unit
    const cv = document.createElement('canvas');
    cv.width = (BOUNDS.maxX - BOUNDS.minX) * S; cv.height = (BOUNDS.maxZ - BOUNDS.minZ) * S;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#3a2f2c'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#1f3a1e'; c.fillRect((-68 - BOUNDS.minX) * S, 0, 136 * S, (-102 - BOUNDS.minZ) * S);
    c.fillStyle = '#16141a';
    for (const x of AVES) c.fillRect((x - ROAD_HALF - BOUNDS.minX) * S, 0, ROAD_HALF * 2 * S, cv.height);
    for (const z of STREETS) c.fillRect(0, (z - ROAD_HALF - BOUNDS.minZ) * S, cv.width, ROAD_HALF * 2 * S);
    // plazas
    c.fillStyle = '#4a3a26';
    for (const [x, z] of [[-17, 17], [17, 17], [-51, -17], [17, -51]]) c.fillRect((x - 12 - BOUNDS.minX) * S, (z - 12 - BOUNDS.minZ) * S, 24 * S, 24 * S);
    return cv;
  }

  minimap(px: number, pz: number, yaw: number, heading: number, dots: MapDot[], target: [number, number] | null) {
    const c = this.mm, W = 200, R = 100, S = 4, zoom = 0.55;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip();
    c.translate(R, R);
    c.rotate(yaw);        // rotate so "up" on the map = camera forward
    c.scale(zoom, zoom);
    c.drawImage(this.mapBase, -(px - BOUNDS.minX) * S, -(pz - BOUNDS.minZ) * S);
    for (const d of dots) {
      c.fillStyle = d.color;
      c.beginPath(); c.arc((d.x - px) * S, (d.z - pz) * S, d.r / zoom, 0, Math.PI * 2); c.fill();
    }
    if (target) {
      const tx = (target[0] - px) * S, tz = (target[1] - pz) * S;
      const d = Math.hypot(tx, tz), lim = (R - 10) / zoom;
      const k = d > lim ? lim / d : 1;
      c.fillStyle = '#7dff4a'; c.strokeStyle = '#000'; c.lineWidth = 3;
      c.beginPath(); c.arc(tx * k, tz * k, 7 / zoom, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.restore();
    // player arrow (always centre)
    c.save(); c.translate(R, R); c.rotate(yaw - heading + Math.PI);
    c.fillStyle = '#ffd23a'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill();
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.stroke();
  }

  // ---------------------------------------------------------------- arsenal & modals
  toggle(id: string) { const el = $(id); const show = el.classList.contains('hidden'); this.closeModals(); if (show) { el.classList.remove('hidden'); if (id === 'wheel') this.renderWheel(); } }
  closeModals() { document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden')); }
  get modalOpen() { return [...document.querySelectorAll('.modal')].some((m) => !m.classList.contains('hidden')); }

  renderWheel() {
    const owned = WEAPONS.filter((w) => this.weapons.has(w.id) && w.id !== 'bat');
    const card = (id: string) => {
      const w = weaponById(id), has = this.weapons.has(id), a = this.weapons.owned.get(id);
      const key = owned.findIndex((o) => o.id === id) + 1;
      return `<button class="w-card ${has ? '' : 'locked'} ${this.weapons.current === id ? 'on' : ''}" data-w="${id}">
        ${has && key > 0 && key < 10 ? `<span class="key">[${key}]</span>` : ''}
        <b>${has ? tr(w.name) : '???'}</b>
        <small>${has ? tr(w.desc) : t('wheel.locked')}</small>
        ${has ? `<div class="stats"><span>DMG <em>${w.damage}${w.pellets ? '×' + w.pellets : ''}</em></span><span>RPM <em>${w.rpm}</em></span><span>AMMO <em>${a?.mag ?? 0}/${a?.reserve ?? 0}</em></span></div>` : ''}
      </button>`;
    };
    $('w-guns').innerHTML = card('bat') + WEAPONS.filter((w) => w.category === 'gun').map((w) => card(w.id)).join('');
    $('w-heavy').innerHTML = WEAPONS.filter((w) => w.category === 'heavy').map((w) => card(w.id)).join('');
    document.querySelectorAll<HTMLButtonElement>('.w-card').forEach((b) => (b.onclick = () => {
      if (!this.weapons.has(b.dataset.w!)) return;
      this.onWeaponPick?.(b.dataset.w!);
      this.closeModals();
    }));
  }
}
