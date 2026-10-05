import * as THREE from 'three';
import { AudioManager } from '../core/Audio';
import { Input } from '../core/Input';
import { CameraRig } from '../camera/CameraRig';
import { City } from '../world/City';
import { Player } from '../actors/Player';
import { ZombieManager, type Zombie } from '../actors/Zombie';
import { WeaponSystem } from '../combat/Weapons';
import { FX } from '../combat/FX';
import { PickupManager, type Pickup, type PickupType } from '../items/Pickups';
import { Vehicle, VEHICLES, VEHICLE_SPAWNS } from '../vehicles/Vehicle';
import { MissionManager } from '../missions/MissionManager';
import { HUD, type MapDot } from '../ui/HUD';
import { MISSIONS, WEAPON_CRATES } from '../data/missions';
import { weaponById } from '../data/weapons';
import { t, tr } from '../i18n/i18n';
import { PostFX, type Quality } from '../render/PostFX';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import type { Circle } from '../world/Collision';

const SAVE_KEY = 'outbreak-nyc:save';
interface Save { mission: number; weapons: [string, number, number][]; medkits: number; grenades: number; armor: number; kills: number; time: number }

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam: CameraRig;
  input: Input;
  audio = new AudioManager();
  city: City;
  player = new Player();
  zombies: ZombieManager;
  weapons: WeaponSystem;
  fx: FX;
  pickups: PickupManager;
  vehicles: { v: Vehicle; circles: Circle[]; spawn: [string, number, number, number]; deadFor: number }[] = [];
  missions: MissionManager;
  hud: HUD;
  driving: Vehicle | null = null;
  kills = 0;
  time = 0;
  private running = false;
  private clock = new THREE.Timer();
  private aimYaw = 0;
  private aimPoint = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
  private mobile: boolean;
  private shakeAmt = 0;
  private deadTimer = 0;
  private finale = 0;
  private pixelRatio: number;
  fps = 60;
  private frame = 0;
  private frameAcc = 0; private frameN = 0;
  private buildings: THREE.Mesh[] = [];
  private save: Save | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.input = new Input(canvas);
    this.mobile = this.input.isTouch || Math.min(innerWidth, innerHeight) < 600;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(devicePixelRatio, this.mobile ? 1.5 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.cam = new CameraRig(innerWidth / innerHeight);
    this.city = new City(this.scene, this.mobile);
    this.city.group.traverse((o) => { if (o.userData.building) this.buildings.push(o as THREE.Mesh); });
    let q: Quality = 'medium'; // HQ (AO + depth of field) is opt-in via the button / V
    try { const saved = localStorage.getItem('outbreak-nyc:quality') as Quality | null; if (saved) q = saved; } catch { /* noop */ }
    this.pixelRatio = PostFX.dpr(q, this.mobile);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.autoUpdate = false; // refreshed every other frame in the loop
    this.post = new PostFX(this.renderer, this.scene, this.cam.camera, q);
    this.loadEnvironment();
    this.fx = new FX(this.scene, this.mobile);
    this.zombies = new ZombieManager(this.scene, this.city.collision, (x, z) => this.city.isOpen(x, z, 0.8), this.mobile);
    this.pickups = new PickupManager(this.scene);
    this.scene.add(this.player.object);
    this.player.onStep = (run) => this.audio.footstep(run);

    this.weapons = new WeaponSystem(this.scene, {
      zombies: this.zombies, world: this.city.collision, fx: this.fx, audio: this.audio,
      shake: (a) => (this.shakeAmt = Math.min(1, this.shakeAmt + a)),
      onKill: (z) => this.onKill(z),
      damagePlayer: (n) => this.damagePlayer(n),
      playerPos: () => this.player.position,
      damageVehicles: (x, z, r, d) => this.vehicles.forEach(({ v }) => { if (v.position.distanceTo(new THREE.Vector3(x, 0, z)) < r + 1.5) this.hurtVehicle(v, d); }),
      damageMult: () => (this.player.rage > 0 ? 2 : 1),
    }, this.player.rig.hand);

    this.hud = new HUD(this.weapons);
    this.hud.onWeaponPick = (id) => { this.weapons.equip(id); this.hud.weaponSwap(); };
    this.hud.onRadio = () => this.audio.radio();
    this.weapons.onChange = () => { if (!document.getElementById('wheel')!.classList.contains('hidden')) this.hud.renderWheel(); };

    this.missions = new MissionManager(this.scene, {
      playerPos: () => this.player.position,
      inVehicle: () => !!this.driving,
      holdingUse: () => this.input.down('f'),
      zombies: this.zombies, pickups: this.pickups,
      flare: (x, z) => this.fx.flare(x, z),
      radio: (lines) => this.hud.radio(lines),
      completed: (m) => this.missionComplete(m),
      finale: () => this.startFinale(),
    });

    this.spawnVehicles();
    this.spawnLoot();
    this.bindTouch();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.player.position.set(MISSIONS[0].checkpoint[0], 0, MISSIONS[0].checkpoint[1]);
    this.cam.snap(this.player.position);
    this.loop();
  }

  // ------------------------------------------------------------------ setup
  private spawnVehicles() {
    for (const s of VEHICLE_SPAWNS) this.addVehicle(s);
  }
  private addVehicle(s: [string, number, number, number]) {
    const v = new Vehicle(VEHICLES[s[0]], s[1], s[2], s[3]);
    this.scene.add(v.object);
    const circles: Circle[] = v.def.bike ? [{ x: 0, z: 0, r: 0.55 }] : [{ x: 0, z: 0, r: 1.0 }, { x: 0, z: 0, r: 1.0 }];
    circles.forEach((c) => this.city.collision.circles.push(c));
    const e = { v, circles, spawn: s, deadFor: 0 };
    this.vehicles.push(e);
    this.syncVehicleColliders(e);
  }
  private syncVehicleColliders(e: { v: Vehicle; circles: Circle[] }) {
    const { v, circles } = e;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const own = v === this.driving;
    circles.forEach((c, i) => {
      const off = circles.length === 1 ? 0 : i === 0 ? 1.15 : -1.15;
      c.x = v.position.x + fx * off; c.z = v.position.z + fz * off;
      c.r = own ? 0 : v.def.bike ? 0.55 : 1.0;
    });
  }

  private spawnLoot() {
    // deterministic scatter of supplies along the roads
    let seed = 777;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const table: [PickupType, number][] = [['ammo', 0.3], ['bandage', 0.2], ['medkit', 0.09], ['armor', 0.1], ['grenade', 0.12], ['adrenaline', 0.06], ['rage', 0.06], ['toolkit', 0.07]];
    let placed = 0, tries = 0;
    while (placed < 80 && tries++ < 600) {
      const x = -115 + r() * 230, z = -150 + r() * 300;
      if (!this.city.isOpen(x, z, 1)) continue;
      let k = r(), type: PickupType = 'ammo';
      for (const [tp, p] of table) { if (k < p) { type = tp; break; } k -= p; }
      this.pickups.add(type, x, z, undefined, 90);
      placed++;
    }
    for (const c of WEAPON_CRATES) this.pickups.add('weapon', c.pos[0], c.pos[1], c.id);
    // supplies at landmarks
    for (const [tp, x, z] of [['medkit', -48, 70], ['armor', -54, 70], ['ammo', -51, 66], ['medkit', 48, -4], ['ammo', 20, -38], ['armor', 14, -38], ['medkit', 4, -100], ['ammo', -4, -100]] as [PickupType, number, number][])
      this.pickups.add(tp, x, z, undefined, 60);
  }

  private bindTouch() {
    const $ = (id: string) => document.getElementById(id)!;
    this.input.bindStick($('joy-zone'), $('joy-base'), $('joy-knob'), this.input.joy);
    this.input.bindStick($('aim-zone'), $('aim-base'), $('aim-knob'), this.input.aim);
    const tap = (id: string, key: string) => $(id).addEventListener('click', () => this.input.press(key));
    tap('t-reload', 'r'); tap('t-weapon', 'e'); tap('t-grenade', 'g'); tap('t-med', 'h');
    const use = $('t-use');
    use.addEventListener('pointerdown', () => { this.input.press('f'); this.input.hold('f', true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) use.addEventListener(ev, () => this.input.hold('f', false));
    $('btn-sound').onclick = () => { const m = this.audio.toggleMute(); $('btn-sound').textContent = m ? '🔇' : '🔊'; };
    $('btn-retry').onclick = () => this.retry();
    $('btn-quality').onclick = () => this.cycleQuality();
    $('btn-quality').textContent = this.post.quality[0].toUpperCase() + 'Q';
    $('btn-again').onclick = () => { localStorage.removeItem(SAVE_KEY); location.reload(); };
    // wheel → zoom
    this.renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); if (this.running) this.cam.zoomBy(Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0012)); }, { passive: false });
  }

  static hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }

  begin(load: boolean) {
    this.audio.start();
    // compile every shader up-front so the first explosion / zombie / car doesn't hitch
    try { this.renderer.compile(this.scene, this.cam.camera); } catch { /* noop */ }
    let mission = 0;
    if (load) {
      try { this.save = JSON.parse(localStorage.getItem(SAVE_KEY)!); } catch { this.save = null; }
      if (this.save) { this.restore(this.save); mission = this.save.mission; }
    } else { try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ } }
    const cp = MISSIONS[Math.min(mission, MISSIONS.length - 1)].checkpoint;
    this.player.position.set(cp[0], 0, cp[1]);
    this.cam.snap(this.player.position);
    this.running = true;
    this.hud.show();
    this.missions.start(mission);
    if (!this.save) this.snapshot(0);
    this.hud.toast(t(this.mobile ? 'toast.startMobile' : 'toast.start'));
  }

  private snapshot(mission: number) {
    this.save = {
      mission,
      weapons: [...this.weapons.owned].map(([id, o]) => [id, o.mag, o.reserve]),
      medkits: this.player.medkits, grenades: this.player.grenades, armor: this.player.armor, kills: this.kills, time: this.time,
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* noop */ }
  }

  private restore(s: Save) {
    this.weapons.owned.clear();
    for (const [id, mag, res] of s.weapons) this.weapons.owned.set(id, { mag, reserve: res });
    if (!this.weapons.owned.has('bat')) this.weapons.give('bat');
    this.weapons.equip(this.weapons.owned.has('pistol') ? 'pistol' : 'bat');
    this.player.medkits = s.medkits; this.player.grenades = s.grenades; this.player.armor = s.armor;
    this.kills = s.kills; this.time = s.time;
  }

  private resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.cam.resize(innerWidth, innerHeight); this.post?.setSize(innerWidth, innerHeight); }

  post!: PostFX;
  /** CC0 night-city HDRI (Poly Haven via @pmndrs/assets) for image-based lighting & reflections */
  private async loadEnvironment() {
    try {
      const url = (await import('@pmndrs/assets/hdri/night.exr')).default as string;
      const hdr = await new EXRLoader().loadAsync(url);
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      this.scene.environmentIntensity = 0.55;
      hdr.dispose(); pmrem.dispose();
    } catch (e) { console.warn('HDRI failed', e); }
  }

  private applyQuality(q: Quality) {
    this.pixelRatio = PostFX.dpr(q, this.mobile);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.post.setQuality(q);
    this.resize();
    const b = document.getElementById('btn-quality'); if (b) b.textContent = q[0].toUpperCase() + 'Q';
  }

  cycleQuality() {
    const order: Quality[] = ['high', 'medium', 'low'];
    const q = order[(order.indexOf(this.post.quality) + 1) % 3];
    this.applyQuality(q);
    try { localStorage.setItem('outbreak-nyc:quality', q); } catch { /* noop */ }
    this.hud.toast(`${tr({ en: 'Graphics', zh: '畫質' })}: ${{ high: tr({ en: 'High', zh: '高' }), medium: tr({ en: 'Medium', zh: '中' }), low: tr({ en: 'Low', zh: '低' }) }[q]}`);
    const b = document.getElementById('btn-quality'); if (b) b.textContent = q[0].toUpperCase() + 'Q';
  }

  // ------------------------------------------------------------------ events
  private onKill(z: Zombie) {
    this.kills++;
    this.missions.onKill(z);
    if (z.type === 'boss') { this.weapons.explode(z.position.x, z.position.z, 7, 0); this.hud.toast(tr({ en: 'ABOMINATION DESTROYED', zh: '憎惡體已被消滅' }), 'big'); }
    // loot drops
    const roll = Math.random();
    const chance = z.type === 'brute' ? 0.7 : 0.13;
    if (roll < chance) {
      const k = Math.random();
      const type: PickupType = k < 0.45 ? 'ammo' : k < 0.7 ? 'bandage' : k < 0.85 ? 'grenade' : k < 0.95 ? 'armor' : 'medkit';
      this.pickups.add(type, z.position.x, z.position.z);
    }
  }

  private damagePlayer(n: number) {
    if (this.player.dead || this.finale) return;
    if (this.driving && !this.driving.def.bike) { this.hurtVehicle(this.driving, n); return; }
    this.audio.hurt();
    this.shakeAmt = Math.min(1, this.shakeAmt + n / 60);
    if (this.player.hurt(n)) { this.deadTimer = 1.8; if (this.driving) this.exitVehicle(); }
  }

  private hurtVehicle(v: Vehicle, n: number) {
    if (v.damage(n)) {
      this.weapons.explode(v.position.x, v.position.z, 5, 120);
      if (v === this.driving) { this.exitVehicle(); this.player.hurt(25); this.hud.toast(t('toast.vehicleDestroyed'), 'warn'); }
    }
  }

  private applyPickup(p: Pickup) {
    const pl = this.player;
    switch (p.type) {
      case 'medkit': pl.medkits = Math.min(5, pl.medkits + 1); this.hud.toast(t('toast.medkit')); break;
      case 'bandage': if (pl.hp >= pl.maxHp) return; pl.heal(25); this.hud.toast(t('toast.bandage')); break;
      case 'armor': if (pl.armor >= 100) return; pl.armor = Math.min(100, pl.armor + 50); this.hud.toast(t('toast.armor')); break;
      case 'ammo': this.weapons.refillAll(); this.hud.toast(t('toast.ammo')); break;
      case 'grenade': pl.grenades = Math.min(9, pl.grenades + 2); this.hud.toast(t('toast.grenade')); break;
      case 'adrenaline': pl.adrenaline = 15; pl.stamina = 1; this.hud.toast(t('toast.adrenaline'), 'weaponT'); break;
      case 'rage': pl.rage = 15; this.hud.toast(t('toast.rage'), 'warn'); break;
      case 'toolkit': {
        const v = this.driving ?? this.vehicles.map((e) => e.v).filter((q) => !q.dead).sort((a, b) => a.position.distanceTo(pl.position) - b.position.distanceTo(pl.position))[0];
        if (v && v.position.distanceTo(pl.position) < 12) { v.repair(); this.hud.toast(t('toast.toolkit')); } else { pl.armor = Math.min(100, pl.armor + 25); this.hud.toast('+25 ' + t('hud.armor')); }
        break;
      }
      case 'weapon': {
        const isNew = this.weapons.give(p.weapon!);
        if (isNew) { this.weapons.equip(p.weapon!); this.hud.weaponSwap(); this.audio.weapon(); this.hud.toast(t('toast.newWeapon', { w: tr(weaponById(p.weapon!).name) }), 'weaponT'); }
        else this.hud.toast(t('toast.ammo'));
        break;
      }
      case 'sample': this.missions.onSample(); this.hud.toast(tr({ en: '☣ Sample case secured', zh: '☣ 已取得樣本箱' }), 'weaponT'); break;
    }
    this.audio.pickup();
    this.pickups.consume(p);
  }

  private missionComplete(m: (typeof MISSIONS)[number]) {
    this.audio.mission();
    this.hud.toast(t('toast.missionDone'), 'big');
    this.hud.flashMission();
    const r = m.reward;
    for (const w of r.weapons ?? []) { if (this.weapons.give(w)) this.weapons.equip(w); }
    if (r.medkits) this.player.medkits += r.medkits;
    if (r.grenades) this.player.grenades += r.grenades;
    if (r.armor) this.player.armor = Math.min(100, this.player.armor + r.armor);
    setTimeout(() => this.hud.toast(t('toast.reward', { r: tr(r.text) }), 'weaponT'), 900);
    this.hud.weaponSwap();
    this.snapshot(this.missions.index + 1);
  }

  private startFinale() {
    this.finale = 0.001;
    this.city.helicopter.visible = true;
    this.zombies.intensity = 0;
    this.hud.radio([tr({ en: 'Chopper on final approach. Get aboard, Reyes — we are leaving!', zh: '直升機進場中。上來，雷耶斯——我們要走了!' })]);
  }

  private retry() {
    document.getElementById('over')!.classList.add('hidden');
    if (this.save) this.restore(this.save);
    const cp = MISSIONS[this.missions.index].checkpoint;
    if (this.driving) this.exitVehicle();
    this.player.respawn(cp[0], cp[1]);
    this.zombies.clearNear(this.player.position, 30);
    this.missions.restartMission();
    this.cam.snap(this.player.position);
    this.deadTimer = 0;
  }

  // ------------------------------------------------------------------ vehicles
  private nearestVehicle() {
    let best: Vehicle | null = null, bd = 3.6;
    for (const { v } of this.vehicles) { if (v.dead) continue; const d = v.position.distanceTo(this.player.position); if (d < bd) { bd = d; best = v; } }
    return best;
  }

  private enterVehicle(v: Vehicle) {
    this.driving = v; v.occupied = true;
    this.player.object.visible = false;
    this.audio.horn();
  }

  private exitVehicle() {
    const v = this.driving!;
    v.occupied = false;
    this.driving = null;
    this.audio.engine(0);
    // step out to the left side, or wherever is free
    for (const side of [1, -1, 0]) {
      const ox = Math.cos(v.heading) * 1.9 * side, oz = -Math.sin(v.heading) * 1.9 * side;
      const x = v.position.x + (side ? ox : Math.sin(v.heading) * -3.2), z = v.position.z + (side ? oz : Math.cos(v.heading) * -3.2);
      if (this.city.collision.free(x, z, 0.45)) { this.player.position.set(x, 0, z); break; }
    }
    this.player.object.visible = true;
  }

  // ------------------------------------------------------------------ input & aim
  private updateAim(): { trigger: boolean; aiming: boolean } {
    const p = this.player.position;
    if (this.input.aim.active) {
      const b = this.cam.basis();
      const dir = b.fwd.clone().multiplyScalar(this.input.aim.y).add(b.right.clone().multiplyScalar(this.input.aim.x));
      const mag = dir.length();
      if (mag > 0.15) {
        dir.normalize();
        // aim assist: snap to the nearest zombie inside a 25° cone
        let best: Zombie | null = null, bs = Infinity;
        for (const z of this.zombies.list) {
          if (!z.alive) continue;
          const ex = z.position.x - p.x, ez = z.position.z - p.z, d = Math.hypot(ex, ez);
          if (d > 26) continue;
          const cos = (ex * dir.x + ez * dir.z) / d;
          if (cos < 0.9) continue;
          const s = d * (2 - cos);
          if (s < bs) { bs = s; best = z; }
        }
        if (best) dir.set(best.position.x - p.x, 0, best.position.z - p.z).normalize();
        this.aimYaw = Math.atan2(dir.x, dir.z);
        this.aimPoint.set(p.x + dir.x * 8, 1.2, p.z + dir.z * 8);
      }
      return { trigger: mag > 0.45, aiming: true };
    }
    if (this.mobile) return { trigger: false, aiming: false };
    // mouse → ground plane
    const ndc = new THREE.Vector2((this.input.mouse.x / innerWidth) * 2 - 1, -(this.input.mouse.y / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam.camera);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.ground, hit)) {
      this.aimPoint.copy(hit);
      this.aimYaw = Math.atan2(hit.x - p.x, hit.z - p.z);
    }
    const ch = document.getElementById('crosshair')!;
    ch.style.left = `${this.input.mouse.x}px`; ch.style.top = `${this.input.mouse.y}px`;
    return { trigger: this.input.mouse.down, aiming: this.input.mouse.moved };
  }

  private handleKeys() {
    const inp = this.input, hud = this.hud;
    if (inp.hit('escape')) { if (hud.modalOpen) hud.closeModals(); else hud.toggle('help'); }
    if (inp.hit('m')) document.getElementById('btn-sound')!.click();
    if (inp.hit('v')) this.cycleQuality();
    if (inp.hit('l')) document.getElementById('btn-lang')!.click();
    if (inp.hit('tab')) hud.toggle('wheel');
    if (inp.hit('?')) hud.toggle('help');
    if (inp.hit('=', '+')) this.cam.zoomBy(0.85);
    if (inp.hit('-', '_')) this.cam.zoomBy(1 / 0.85);
    if (hud.modalOpen || this.player.dead) return;
    for (let n = 0; n <= 9; n++) if (inp.hit(String(n))) { this.weapons.equipSlot(n); hud.weaponSwap(); }
    if (inp.hit('q')) { this.weapons.cycle(-1); hud.weaponSwap(); }
    if (inp.hit('e')) { this.weapons.cycle(1); hud.weaponSwap(); }
    if (inp.hit('r')) this.weapons.reload();
    if (inp.hit('h')) {
      if (this.player.medkits <= 0) hud.toast(t('toast.noMedkit'), 'warn');
      else if (this.player.hp >= this.player.maxHp) hud.toast(t('toast.fullHp'));
      else { this.player.medkits--; this.player.heal(60); this.audio.pickup(); hud.toast('+60 ' + t('hud.hp')); }
    }
    if (inp.hit('g') && !this.driving) {
      if (this.player.grenades > 0) {
        this.player.grenades--;
        const p = this.player.position;
        const dx = Math.sin(this.aimYaw), dz = Math.cos(this.aimYaw);
        this.weapons.throwGrenade(p.x + dx * 0.6, p.z + dz * 0.6, dx, dz, Math.max(6, Math.hypot(this.aimPoint.x - p.x, this.aimPoint.z - p.z)));
      } else this.audio.empty();
    }
    if (inp.hit('f')) {
      if (this.driving) this.exitVehicle();
      else if (!this.missions.nearSurvivor) { const v = this.nearestVehicle(); if (v) this.enterVehicle(v); }
    }
    if (inp.hit(' ') && this.driving) this.audio.horn();
  }

  // ------------------------------------------------------------------ main loop
  private loop = () => {
    requestAnimationFrame(this.loop);
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.running) this.handleKeys();
    this.input.endFrame();
    const paused = !this.running || this.hud.modalOpen;
    if (!paused) this.step(dt);
    this.cam.update(paused ? 0 : dt, this.driving ? this.driving.position.clone().add(new THREE.Vector3(Math.sin(this.driving.heading), 0, Math.cos(this.driving.heading)).multiplyScalar(this.driving.speed * 0.25)) : this.player.position, this.buildings);
    if (this.shakeAmt > 0.01) { this.cam.camera.position.x += (Math.random() - 0.5) * this.shakeAmt; this.cam.camera.position.y += (Math.random() - 0.5) * this.shakeAmt; }
    this.shakeAmt *= Math.exp(-dt * 8);
    if ((this.frame++ & 1) === 0) this.renderer.shadowMap.needsUpdate = true;
    this.post.render(dt, this.cam.camera.position.distanceTo(this.driving ? this.driving.position : this.player.position), Math.min(1, this.player.hurtFlash));
    this.adaptQuality(dt);
  };

  private step(dt: number) {
    this.time += dt;
    const pl = this.player;
    const { trigger, aiming } = this.updateAim();

    if (this.driving) {
      const v = this.driving;
      const m = this.input.move();
      const impact = v.drive(dt, m.y, m.x, this.input.down(' '), this.city.collision);
      pl.position.copy(v.position);
      if (impact > 9) { this.hurtVehicle(v, impact * 3); this.shakeAmt = Math.min(1, impact / 30); this.audio.hit(); }
      this.audio.engine(Math.min(1, Math.abs(v.speed) / v.def.maxSpeed) * 0.9 + 0.1, v.def.bike);
      // ram zombies
      if (Math.abs(v.speed) > 3.5) {
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        for (const z of this.zombies.within(v.position.x + fx * 1.4, v.position.z + fz * 1.4, v.def.radius + 0.3)) {
          const sp = Math.abs(v.speed);
          const side = Math.random() < 0.5 ? -1 : 1;
          const killed = z.damage(sp * 14 * (z.type === 'boss' ? 0.3 : 1), fx + fz * side * 0.6, fz - fx * side * 0.6, sp * 0.9);
          this.fx.blood(z.position.x, z.position.z, fx, fz, z.type === 'spitter', 10);
          this.audio.hit();
          v.speed *= z.type === 'brute' || z.type === 'boss' ? 0.4 : 0.92;
          this.hurtVehicle(v, z.type === 'boss' ? 40 : z.type === 'brute' ? 20 : 3);
          this.shakeAmt = Math.min(1, this.shakeAmt + 0.08);
          if (killed) this.onKill(z);
        }
      }
      // bikes: you can still fire a sidearm while riding
      if (v.def.bike && this.weapons.def.category !== 'heavy') this.weapons.update(dt, trigger, pl.position.x, pl.position.z, Math.sin(this.aimYaw), Math.cos(this.aimYaw));
      else this.weapons.update(dt, false, 0, 0, 0, 1);
      this.cam.zoomTo(Math.max(28, Math.abs(v.speed) * 1.2 + 24));
    } else {
      this.cam.zoomTo(null);
      pl.update(dt, this.input.move(), this.cam.basis(), this.city.collision, this.aimYaw, aiming && !pl.dead);
      if (!pl.dead) {
        const yaw = aiming ? this.aimYaw : pl.facing;
        this.weapons.update(dt, trigger && aiming, pl.position.x, pl.position.z, Math.sin(yaw), Math.cos(yaw));
      }
    }
    document.getElementById('crosshair')!.classList.toggle('hot', this.zombies.along(pl.position.x, pl.position.z, Math.sin(this.aimYaw), Math.cos(this.aimYaw), 30).length > 0);

    // zombies
    this.zombies.update(dt, pl.position, false);
    for (const z of this.zombies.list) {
      if (!z.alive) continue;
      if (z.burn > 0) { z.burn -= dt; this.fx.burnTick(z.position.x, z.position.z); if (z.damage(28 * dt)) this.onKill(z); }
      if (z.attackCd > 0 || pl.dead) continue;
      const d = Math.hypot(z.position.x - pl.position.x, z.position.z - pl.position.z);
      if (z.type === 'spitter' && d > 2.5 && d < z.def.reach && this.city.collision.segment(z.position.x, z.position.z, pl.position.x, pl.position.z) >= 1) {
        this.weapons.spit(z.position.x, z.position.z, pl.position.x, pl.position.z, z.def.damage);
        z.attackCd = z.def.cooldown;
      } else if (d < z.def.reach + (this.driving ? 1.2 : 0) && z.type !== 'spitter' || (z.type === 'spitter' && d < 1.4)) {
        z.attackCd = z.def.cooldown;
        if (z.type === 'boss') {
          this.weapons.explode(z.position.x + Math.sin(z.rig.object.rotation.y) * 2, z.position.z + Math.cos(z.rig.object.rotation.y) * 2, 4, 0);
          this.damagePlayer(z.def.damage);
        } else this.damagePlayer(z.def.damage);
      } else if (z.type === 'boss' && d < 30 && Math.random() < 0.5) {
        // acid volley
        for (let i = -1; i <= 1; i++) this.weapons.spit(z.position.x, z.position.z, pl.position.x + i * 3, pl.position.z + i * 2, 15);
        z.attackCd = 3.5;
      }
      if (z.groanCd <= 0 && d < 18) { z.groanCd = 6 + Math.random() * 10; this.audio.groan(); }
    }

    // pickups
    if (!pl.dead) for (const p of this.pickups.update(dt, pl.position, this.driving ? 2.2 : 1.3)) this.applyPickup(p);

    // vehicles: colliders, wreck cleanup, respawn
    for (const e of this.vehicles) {
      this.syncVehicleColliders(e);
      if (e.v.dead) {
        e.deadFor += dt;
        if (e.deadFor > 40 && e.v.position.distanceTo(pl.position) > 45) {
          this.scene.remove(e.v.object);
          e.circles.forEach((c) => (c.r = 0));
          this.vehicles.splice(this.vehicles.indexOf(e), 1);
          this.addVehicle(e.spawn);
          break;
        }
      } else if (e.v !== this.driving && Math.abs(e.v.speed) > 0.1) e.v.drive(dt, 0, 0, true, this.city.collision);
    }

    this.missions.update(dt);
    this.city.update(dt, pl.position);
    this.fx.update(dt);

    // death / finale
    if (pl.dead) { this.deadTimer -= dt; if (this.deadTimer <= 0 && document.getElementById('over')!.classList.contains('hidden')) document.getElementById('over')!.classList.remove('hidden'); }
    if (this.finale > 0) {
      this.finale += dt;
      const h = this.city.helicopter;
      h.position.y = Math.max(0, 40 - this.finale * 9);
      this.audio.engine(0.6);
      if (this.finale > 5 && h.position.distanceTo(pl.position.clone().setY(0)) < 10 || this.finale > 14) {
        this.running = false;
        this.audio.engine(0);
        const mins = Math.floor(this.time / 60), secs = Math.floor(this.time % 60);
        document.getElementById('end-stats')!.textContent = t('end.stats', { k: this.kills, t: `${mins}:${String(secs).padStart(2, '0')}` });
        document.getElementById('end')!.classList.remove('hidden');
        try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
      }
    }

    // HUD
    const m = this.missions;
    const near = !this.driving && !pl.dead ? this.nearestVehicle() : null;
    let prompt: { text: string; hold: number } | null = null;
    if (m.nearSurvivor) prompt = { text: `${t('prompt.hold')} ${t('prompt.rescue')}`, hold: m.holdProgress };
    else if (this.driving) prompt = null;
    else if (near) prompt = { text: `${t('prompt.enter')} · ${tr(near.def.name)}`, hold: 0 };
    this.hud.update(dt, {
      missionNum: m.finished ? '' : `${m.index + 1}/${MISSIONS.length}`,
      missionTitle: m.mission ? tr(m.mission.title) : '',
      objective: m.objectiveText(), progress: m.progressText(),
      hp: pl.hp, maxHp: pl.maxHp, armor: pl.armor, stamina: pl.stamina, grenades: pl.grenades, medkits: pl.medkits,
      adrenaline: pl.adrenaline, rage: pl.rage, kills: this.kills, hurt: pl.hurtFlash,
      vehicle: this.driving ? { name: tr(this.driving.def.name), speed: this.driving.speed, hp: this.driving.hp / this.driving.def.hp } : null,
      boss: m.boss && m.boss.alive ? { name: tr({ en: 'THE ABOMINATION', zh: '巨型憎惡體' }), hp: m.boss.hp / m.boss.def.hp } : null,
      prompt,
    });
    const tg = m.target();
    this.hud.arrow(tg ? new THREE.Vector3(tg[0], 0, tg[1]) : null, this.cam.camera, pl.position);
    const dots: MapDot[] = [];
    for (const z of this.zombies.list) if (z.alive) dots.push({ x: z.position.x, z: z.position.z, color: z.type === 'boss' ? '#ff00ff' : '#ff3b2f', r: z.type === 'boss' ? 6 : 2.2 });
    for (const { v } of this.vehicles) if (!v.dead && v !== this.driving) dots.push({ x: v.position.x, z: v.position.z, color: '#4fd8ff', r: 3 });
    for (const p of this.pickups.list) if (p.alive && (p.type === 'weapon' || p.type === 'medkit')) dots.push({ x: p.object.position.x, z: p.object.position.z, color: p.type === 'weapon' ? '#ffd23a' : '#ffffff', r: 2.6 });
    this.hud.minimap(pl.position.x, pl.position.z, this.cam.yaw, this.driving ? this.driving.heading : pl.facing, dots, tg);
  }

  private adaptQuality(dt: number) {
    this.frameAcc += dt; this.frameN++;
    if (this.frameAcc < 2) return;
    const avg = this.frameAcc / this.frameN;
    this.frameAcc = 0; this.frameN = 0;
    this.fps = 1 / avg;
    // step down: HQ → MQ → LQ → lower resolution (never automatically back up, to avoid oscillating)
    if (avg > 1 / 40 && this.post.quality === 'high') { this.applyQuality('medium'); this.hud.toast(tr({ en: 'Graphics lowered for smoother play', zh: '已自動降低畫質以保持流暢' })); return; }
    if (avg > 1 / 28 && this.post.quality === 'medium') { this.applyQuality('low'); this.hud.toast(tr({ en: 'Graphics lowered for smoother play', zh: '已自動降低畫質以保持流暢' })); return; }
    if (avg > 1 / 26 && this.pixelRatio > 0.65) { this.pixelRatio = Math.max(0.6, this.pixelRatio - 0.15); this.renderer.setPixelRatio(this.pixelRatio); this.resize(); }
  }
}
