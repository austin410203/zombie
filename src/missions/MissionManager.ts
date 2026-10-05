import * as THREE from 'three';
import { MISSIONS, type Mission, type Step, type Vec2 } from '../data/missions';
import { Humanoid } from '../actors/Humanoid';
import type { Zombie, ZombieManager } from '../actors/Zombie';
import type { PickupManager } from '../items/Pickups';
import { t, tr } from '../i18n/i18n';

export interface MissionHooks {
  playerPos: () => THREE.Vector3;
  inVehicle: () => boolean;
  holdingUse: () => boolean;
  zombies: ZombieManager;
  pickups: PickupManager;
  flare: (x: number, z: number) => void;
  radio: (lines: string[]) => void;
  completed: (m: Mission) => void;
  finale: () => void;
}

interface Survivor { rig: Humanoid; pos: Vec2; progress: number; done: boolean; leave: number }

export class MissionManager {
  index = 0;
  step = 0;
  count = 0;
  timer = 0;
  boss: Zombie | null = null;
  private survivors: Survivor[] = [];
  private beacon: THREE.Mesh;
  private beaconMat: THREE.MeshBasicMaterial;
  private t = 0;
  finished = false;
  /** 0..1 progress of the current "hold F" rescue (for HUD) */
  holdProgress = 0;
  nearSurvivor = false;

  constructor(private scene: THREE.Scene, private h: MissionHooks) {
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0x7dff4a, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 60, 16, 1, true), this.beaconMat);
    this.beacon.position.y = 30;
    scene.add(this.beacon);
  }

  get mission(): Mission | undefined { return MISSIONS[this.index]; }
  get current(): Step | undefined { return this.mission?.steps[this.step]; }

  start(index: number) {
    this.index = index;
    this.step = 0;
    this.finished = index >= MISSIONS.length;
    if (this.finished) return;
    this.h.radio(this.mission!.radio.map(tr));
    this.enterStep();
  }

  private enterStep() {
    const s = this.current!;
    const z = this.h.zombies;
    z.intensity = 1; z.hotspot = null;
    this.count = 0;
    this.clearSurvivors();
    this.h.pickups.remove('sample');
    switch (s.type) {
      case 'kill': z.intensity = 1.5; z.hotspot = s.center ? new THREE.Vector3(s.center[0], 0, s.center[1]) : null; break;
      case 'collect': for (const [x, zz] of s.points) this.h.pickups.add('sample', x, zz); break;
      case 'rescue':
        for (const p of s.points) {
          const rig = new Humanoid({ coat: [0x4a6a9a, 0x9a5a3a, 0x6a4a8a][this.survivors.length % 3], accent: 0xdedede, skin: 0xe0b896, hair: 0x2a1a10, skirt: this.survivors.length === 1 });
          rig.object.position.set(p[0], 0, p[1]);
          this.scene.add(rig.object);
          this.survivors.push({ rig, pos: p, progress: 0, done: false, leave: 0 });
        }
        break;
      case 'survive': this.timer = s.seconds; break;
      case 'boss':
        z.intensity = 1.2;
        if (!this.boss || !this.boss.alive) this.boss = z.spawn('boss', s.pos[0], s.pos[1]);
        break;
    }
  }

  private clearSurvivors() {
    for (const s of this.survivors) this.scene.remove(s.rig.object);
    this.survivors = [];
  }

  private next() {
    const m = this.mission!;
    this.step++;
    if (this.step >= m.steps.length) {
      this.h.zombies.intensity = 1; this.h.zombies.hotspot = null;
      this.clearSurvivors();
      if (this.index === MISSIONS.length - 1) { this.finished = true; this.h.finale(); return; }
      this.h.completed(m);
      this.index++;
      this.step = 0;
      this.start(this.index);
      return;
    }
    this.enterStep();
  }

  onKill(z: Zombie) {
    const s = this.current;
    if (!s) return;
    if (s.type === 'kill') {
      if (!s.center || Math.hypot(z.position.x - s.center[0], z.position.z - s.center[1]) < (s.radius ?? 40)) this.count++;
    }
    if (s.type === 'boss' && z === this.boss) { this.boss = null; this.next(); }
  }

  onSample() { const s = this.current; if (s?.type === 'collect') { this.count++; if (this.count >= s.points.length) this.next(); } }

  /** Where the HUD arrow / beacon should point */
  target(): Vec2 | null {
    const s = this.current;
    if (!s) return null;
    const p = this.h.playerPos();
    const nearest = (pts: Vec2[]) => pts.reduce((a, b) => (Math.hypot(a[0] - p.x, a[1] - p.z) < Math.hypot(b[0] - p.x, b[1] - p.z) ? a : b));
    switch (s.type) {
      case 'reach': case 'reachVehicle': case 'survive': return s.pos;
      case 'kill': return s.center ?? null;
      case 'collect': { const left = this.h.pickups.list.filter((q) => q.type === 'sample').map((q) => [q.object.position.x, q.object.position.z] as Vec2); return left.length ? nearest(left) : null; }
      case 'rescue': { const left = this.survivors.filter((q) => !q.done).map((q) => q.pos); return left.length ? nearest(left) : null; }
      case 'boss': return this.boss ? [this.boss.position.x, this.boss.position.z] : s.pos;
      case 'drive': return null;
    }
  }

  objectiveText() {
    const s = this.current;
    if (!s) return '';
    return tr(s.label);
  }

  progressText() {
    const s = this.current;
    if (!s) return '';
    switch (s.type) {
      case 'kill': return `${this.count} / ${s.count}`;
      case 'collect': return `${this.count} / ${s.points.length}`;
      case 'rescue': return `${this.survivors.filter((q) => q.done).length} / ${s.points.length}`;
      case 'survive': { const sec = Math.ceil(this.timer); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
      case 'boss': return this.boss ? `${Math.max(0, Math.round((this.boss.hp / this.boss.def.hp) * 100))}%` : '';
      default: { const tg = this.target(); if (!tg) return ''; const p = this.h.playerPos(); return `${Math.round(Math.hypot(tg[0] - p.x, tg[1] - p.z))} ${t('dist.m')}`; }
    }
  }

  update(dt: number) {
    this.t += dt;
    const s = this.current;
    const p = this.h.playerPos();
    const tg = this.target();
    this.beacon.visible = !!tg && !this.finished;
    if (tg) { this.beacon.position.x = tg[0]; this.beacon.position.z = tg[1]; }
    this.beaconMat.opacity = 0.18 + Math.sin(this.t * 3) * 0.07;
    this.beaconMat.color.setHex(s?.type === 'boss' || s?.type === 'kill' || s?.type === 'survive' ? 0xff3b2f : 0x7dff4a);
    this.holdProgress = 0; this.nearSurvivor = false;
    if (!s || this.finished) return;
    const near = (pos: Vec2, r: number) => Math.hypot(pos[0] - p.x, pos[1] - p.z) < r;

    switch (s.type) {
      case 'reach': if (near(s.pos, s.radius)) this.next(); break;
      case 'kill': if (this.count >= s.count) this.next(); break;
      case 'drive': if (this.h.inVehicle()) this.next(); break;
      case 'reachVehicle': if (this.h.inVehicle() && near(s.pos, s.radius)) this.next(); break;
      case 'survive':
        if (near(s.pos, s.radius)) {
          this.timer -= dt;
          this.h.zombies.intensity = 2.2;
          this.h.zombies.hotspot = new THREE.Vector3(s.pos[0], 0, s.pos[1]);
        } else this.h.zombies.intensity = 1.4;
        if (this.timer <= 0) this.next();
        break;
      case 'rescue':
        for (const sv of this.survivors) {
          // idle wave animation
          sv.rig.setState(sv.done ? 'idle' : 'talk');
          sv.rig.update(dt, 0);
          if (sv.done) {
            sv.leave -= dt;
            if (sv.leave > 0) this.h.flare(sv.pos[0], sv.pos[1]);
            else sv.rig.object.visible = false;
            continue;
          }
          if (near(sv.pos, 3.2) && !this.h.inVehicle()) {
            this.nearSurvivor = true;
            if (this.h.holdingUse()) { sv.progress += dt / 2; this.holdProgress = sv.progress; }
            if (sv.progress >= 1) { sv.done = true; sv.leave = 3; this.h.radio([tr({ en: 'Flare spotted! Extraction team inbound for that survivor.', zh: '看到信號彈了!撤離小組正前往接應那名倖存者。' })]); }
          }
        }
        if (this.survivors.length && this.survivors.every((q) => q.done)) this.next();
        break;
    }
  }

  /** Restart current mission from its first step (after death) */
  restartMission() {
    if (this.boss) { this.boss.alive = false; this.boss.deadTime = 99; this.boss = null; }
    this.start(this.index);
  }
}
