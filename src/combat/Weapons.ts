import * as THREE from 'three';
import { WEAPONS, weaponById, type WeaponDef } from '../data/weapons';
import type { Zombie, ZombieManager } from '../actors/Zombie';
import type { CollisionWorld } from '../world/Collision';
import type { FX } from './FX';
import type { AudioManager } from '../core/Audio';

export interface CombatHooks {
  zombies: ZombieManager;
  world: CollisionWorld;
  fx: FX;
  audio: AudioManager;
  shake: (amount: number) => void;
  onKill: (z: Zombie) => void;
  damagePlayer: (amount: number) => void;
  playerPos: () => THREE.Vector3;
  damageVehicles: (x: number, z: number, r: number, dmg: number) => void;
  damageMult: () => number;
}

interface Proj {
  kind: 'rocket' | 'grenade' | 'shell' | 'acid' | 'flame' | 'bomblet';
  mesh?: THREE.Object3D;
  pos: THREE.Vector3; vel: THREE.Vector3;
  life: number; w?: WeaponDef; dmg: number; blast: number;
  hit?: Set<Zombie>; target?: Zombie | null; split?: number;
}

export interface Owned { mag: number; reserve: number }

/** Inventory, firing, reloading and every projectile in flight. */
export class WeaponSystem {
  owned = new Map<string, Owned>();
  current = 'bat';
  reloading = 0;
  private cooldown = 0;
  private projs: Proj[] = [];
  private gunMesh: THREE.Object3D | null = null;
  private triggerWasDown = false;
  onChange?: () => void;
  private rocketGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.7, 6).rotateX(Math.PI / 2);
  private grenadeGeo = new THREE.SphereGeometry(0.13, 6, 5);
  private shellGeo = new THREE.SphereGeometry(0.22, 8, 6);
  private acidGeo = new THREE.SphereGeometry(0.2, 6, 5);
  private matShell = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffa040, emissiveIntensity: 0.4 });
  private matRocket = new THREE.MeshStandardMaterial({ color: 0x4a5a30, emissive: 0xff6a2a, emissiveIntensity: 0.4 });
  private matGrenade = new THREE.MeshStandardMaterial({ color: 0x3a4a2a });
  private matBomblet = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0xff7020, emissiveIntensity: 0.5 });
  private matAcid = new THREE.MeshBasicMaterial({ color: 0x9aff3a });

  constructor(private scene: THREE.Scene, private hooks: CombatHooks, private hand: THREE.Object3D) {
    this.give('bat'); this.give('pistol');
    this.equip('pistol');
  }

  get def() { return weaponById(this.current); }
  get ammo() { return this.owned.get(this.current)!; }
  has(id: string) { return this.owned.has(id); }

  /** Add a weapon (or ammo for it if already owned). Returns true if newly acquired. */
  give(id: string) {
    const w = weaponById(id);
    const o = this.owned.get(id);
    if (o) { o.reserve = Math.min(w.maxReserve, o.reserve + w.reserve); this.onChange?.(); return false; }
    this.owned.set(id, { mag: w.mag, reserve: w.reserve });
    this.onChange?.();
    return true;
  }

  /** Ammo box: top up every owned gun by ~35% of max */
  refillAll(frac = 0.35) {
    for (const [id, o] of this.owned) { const w = weaponById(id); if (w.mag) o.reserve = Math.min(w.maxReserve, o.reserve + Math.ceil(w.maxReserve * frac)); }
    this.onChange?.();
  }

  equip(id: string) {
    if (!this.owned.has(id)) return;
    this.current = id;
    this.reloading = 0;
    this.cooldown = Math.max(this.cooldown, 0.2);
    if (this.gunMesh) this.hand.remove(this.gunMesh);
    this.gunMesh = this.buildModel(this.def);
    this.hand.add(this.gunMesh);
    this.onChange?.();
  }

  cycle(dir: number) {
    const list = WEAPONS.filter((w) => this.owned.has(w.id));
    const i = list.findIndex((w) => w.id === this.current);
    this.equip(list[(i + dir + list.length) % list.length].id);
  }

  equipSlot(n: number) {
    // 1..9 → nth owned weapon (bat excluded); 0 → bat
    const list = WEAPONS.filter((w) => this.owned.has(w.id) && w.id !== 'bat');
    if (n === 0) this.equip('bat'); else if (list[n - 1]) this.equip(list[n - 1].id);
  }

  reload() {
    const w = this.def, a = this.ammo;
    if (!w.mag || this.reloading > 0 || a.mag >= w.mag || a.reserve <= 0) return;
    this.reloading = w.reload;
    this.hooks.audio.reload();
  }

  private buildModel(w: WeaponDef) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: w.model.color, metalness: 0.6, roughness: 0.4, flatShading: true });
    const len = w.model.len, th = w.model.thick;
    if (w.kind === 'melee') {
      const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, len, 6), m);
      bat.rotation.x = Math.PI / 2; bat.position.z = len / 2; g.add(bat);
    } else if (w.model.tube) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(th / 2, th / 2, len, 8), m);
      tube.rotation.x = Math.PI / 2; tube.position.z = len * 0.35; g.add(tube);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), m); grip.position.set(0, -0.1, 0); g.add(grip);
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(th * 0.7, th, len), m);
      body.position.z = len * 0.35; g.add(body);
      const n = w.model.barrels ?? 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len * 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 }));
        br.rotation.x = Math.PI / 2;
        br.position.set(n > 1 ? Math.cos(a) * th * 0.3 : 0, n > 1 ? Math.sin(a) * th * 0.3 : th * 0.2, len * 0.75);
        g.add(br);
      }
    }
    g.traverse((o) => (o.castShadow = true));
    return g;
  }

  /** Called every frame with the aim origin/direction (world XZ, normalized). */
  update(dt: number, trigger: boolean, ox: number, oz: number, dx: number, dz: number) {
    this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const w = this.def, a = this.ammo;
        const need = w.mag - a.mag, take = Math.min(need, a.reserve);
        a.mag += take; a.reserve -= take;
        this.onChange?.();
      }
    }
    const w = this.def;
    const pressed = trigger && (w.auto || !this.triggerWasDown);
    this.triggerWasDown = trigger;
    if (pressed && this.cooldown <= 0 && this.reloading <= 0) {
      const a = this.ammo;
      if (w.mag && a.mag <= 0) {
        if (a.reserve > 0) this.reload(); else { this.hooks.audio.empty(); this.cooldown = 0.25; }
      } else {
        this.fire(w, ox, oz, dx, dz);
        if (w.mag) { a.mag--; if (a.mag <= 0 && a.reserve > 0) this.reload(); }
        this.cooldown = 60 / w.rpm;
        this.onChange?.();
      }
    }
    this.updateProjectiles(dt);
  }

  // ------------------------------------------------------------------ firing
  private fire(w: WeaponDef, ox: number, oz: number, dx: number, dz: number) {
    const h = this.hooks;
    const mx = ox + dx * 0.9, mz = oz + dz * 0.9; // muzzle
    h.audio.shot(w.sound);
    h.shake(w.shake);
    const rot = (ang: number) => [dx * Math.cos(ang) - dz * Math.sin(ang), dx * Math.sin(ang) + dz * Math.cos(ang)] as const;
    switch (w.kind) {
      case 'melee': {
        for (const z of h.zombies.within(ox + dx * 1.1, oz + dz * 1.1, w.range * 0.7)) {
          this.hurt(z, w.damage, dx, dz, w.knockback ?? 0);
        }
        break;
      }
      case 'bullet': case 'pellet': case 'beam': {
        const n = w.pellets ?? 1;
        if (w.kind !== 'beam') { h.fx.muzzle(mx, mz, dx, dz, 0xffd080); h.fx.flash(mx, 1.4, mz, 6, 0xffb060); }
        for (let i = 0; i < n; i++) {
          const [sx, sz] = rot((Math.random() - 0.5) * w.spread);
          this.hitscan(w, mx, mz, sx, sz);
        }
        break;
      }
      case 'flame': {
        for (let i = 0; i < 2; i++) {
          const [sx, sz] = rot((Math.random() - 0.5) * w.spread);
          const sp = w.speed * (0.8 + Math.random() * 0.4);
          this.projs.push({ kind: 'flame', pos: new THREE.Vector3(mx, 1.1, mz), vel: new THREE.Vector3(sx * sp, 0, sz * sp), life: w.range / w.speed, dmg: w.damage, blast: 0.9, w, hit: new Set() });
          h.fx.flame(mx, mz, sx * sp, sz * sp);
        }
        break;
      }
      case 'rocket': case 'grenade': case 'shell': {
        const n = w.kind === 'grenade' && w.id === 'mortar' ? 1 : 1;
        for (let i = 0; i < n; i++) {
          const [sx, sz] = rot((Math.random() - 0.5) * w.spread);
          const geo = w.kind === 'rocket' ? this.rocketGeo : w.kind === 'shell' ? this.shellGeo : this.grenadeGeo;
          const mesh = new THREE.Mesh(geo, w.kind === 'shell' ? this.matShell : w.kind === 'rocket' ? this.matRocket : this.matGrenade);
          mesh.position.set(mx, 1.3, mz);
          this.scene.add(mesh);
          const vy = w.kind === 'grenade' ? (w.id === 'mortar' ? 13 : 5) : 0;
          this.projs.push({
            kind: w.kind, mesh, pos: mesh.position, vel: new THREE.Vector3(sx * w.speed, vy, sz * w.speed),
            life: w.kind === 'grenade' ? 4 : w.range / w.speed, dmg: w.damage, blast: w.blast ?? 3, w, hit: new Set(),
            target: w.homing ? this.bestTarget(mx, mz, sx, sz) : null, split: w.id === 'mortar' ? w.pellets : 0,
          });
          h.fx.flash(mx, 1.4, mz, 10, 0xff9040);
        }
        break;
      }
    }
  }

  private bestTarget(x: number, z: number, dx: number, dz: number) {
    let best: Zombie | null = null, score = -Infinity;
    for (const q of this.hooks.zombies.list) {
      if (!q.alive) continue;
      const ex = q.position.x - x, ez = q.position.z - z, d = Math.hypot(ex, ez);
      if (d > 60) continue;
      const facing = (ex * dx + ez * dz) / d;
      if (facing < 0.5) continue;
      const s = q.def.hp * 0.02 + facing * 10 - d * 0.2;
      if (s > score) { score = s; best = q; }
    }
    return best;
  }

  private hitscan(w: WeaponDef, x: number, z: number, dx: number, dz: number) {
    const h = this.hooks;
    const wallT = h.world.segment(x, z, x + dx * w.range, z + dz * w.range, false);
    const len = w.range * wallT;
    const hits = h.zombies.along(x, z, dx, dz, len, w.kind === 'beam' ? 0.3 : 0);
    let end = len;
    let left = (w.pierce ?? 0) + 1;
    for (const { z: q, t } of hits) {
      this.hurt(q, w.damage, dx, dz, w.knockback ?? 1.2);
      left--;
      if (left <= 0) { end = t; break; }
    }
    const ex = x + dx * end, ez = z + dz * end;
    if (w.kind === 'beam') h.fx.beam(x, z, ex, ez, w.color);
    else h.fx.tracer(x, z, ex, ez, w.color);
    if (end === len && wallT < 1) h.fx.sparks(ex, ez);
  }

  private hurt(q: Zombie, dmg: number, dx: number, dz: number, knock: number) {
    const h = this.hooks;
    const killed = q.damage(dmg * h.damageMult(), dx, dz, knock);
    h.fx.blood(q.position.x, q.position.z, dx, dz, q.type === 'spitter', killed ? 12 : 4);
    h.audio.hit();
    if (killed) h.onKill(q);
  }

  // ------------------------------------------------------------------ explosions & projectiles
  explode(x: number, z: number, r: number, dmg: number) {
    const h = this.hooks;
    h.fx.explosion(x, z, r);
    h.audio.explosion(r / 5);
    const pp = h.playerPos();
    const pd = Math.hypot(pp.x - x, pp.z - z);
    h.shake(Math.min(1, 0.9 * r / Math.max(4, pd)));
    for (const q of h.zombies.within(x, z, r)) {
      const d = Math.hypot(q.position.x - x, q.position.z - z);
      const k = 1 - Math.min(1, d / (r + q.radius));
      const dx = (q.position.x - x) / (d || 1), dz = (q.position.z - z) / (d || 1);
      this.hurt(q, dmg * (0.35 + 0.65 * k), dx, dz, 14 * k);
    }
    if (pd < r) h.damagePlayer(dmg * 0.18 * (1 - pd / r)); // self damage, reduced
    h.damageVehicles(x, z, r, dmg * 0.5);
  }

  /** Thrown hand grenade */
  throwGrenade(x: number, z: number, dx: number, dz: number, dist: number) {
    const mesh = new THREE.Mesh(this.grenadeGeo, this.matGrenade);
    mesh.position.set(x, 1.5, z);
    this.scene.add(mesh);
    const t = 1.0, sp = Math.min(22, dist) / t;
    this.projs.push({ kind: 'grenade', mesh, pos: mesh.position, vel: new THREE.Vector3(dx * sp, 5, dz * sp), life: 1.6, dmg: 180, blast: 5.5, hit: new Set() });
  }

  /** Spitter acid glob aimed at the player */
  spit(x: number, z: number, tx: number, tz: number, dmg: number) {
    const mesh = new THREE.Mesh(this.acidGeo, this.matAcid);
    mesh.position.set(x, 1.4, z);
    this.scene.add(mesh);
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1, sp = 13;
    this.projs.push({ kind: 'acid', mesh, pos: mesh.position, vel: new THREE.Vector3((dx / d) * sp, 2, (dz / d) * sp), life: 2, dmg, blast: 0 });
  }

  private kill(p: Proj) {
    p.life = -1;
    if (p.mesh) this.scene.remove(p.mesh);
  }

  private updateProjectiles(dt: number) {
    const h = this.hooks;
    for (const p of this.projs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const ox = p.pos.x, oz = p.pos.z;
      if (p.kind === 'grenade' || p.kind === 'bomblet' || p.kind === 'acid') p.vel.y -= 18 * dt;
      // homing steer
      if (p.target) {
        if (!p.target.alive) p.target = this.bestTarget(p.pos.x, p.pos.z, p.vel.x / p.vel.length(), p.vel.z / p.vel.length());
        if (p.target) {
          const want = new THREE.Vector3(p.target.position.x - p.pos.x, 0, p.target.position.z - p.pos.z).normalize().multiplyScalar(p.vel.length());
          p.vel.lerp(want, Math.min(1, dt * 4));
        }
      }
      p.pos.addScaledVector(p.vel, dt);
      if (p.mesh) p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
      if (p.kind === 'rocket') { h.fx.flame(p.pos.x - p.vel.x * 0.02, p.pos.z - p.vel.z * 0.02, -p.vel.x * 0.1, -p.vel.z * 0.1); }

      // walls
      const wt = h.world.segment(ox, oz, p.pos.x, p.pos.z, true);
      const hitWall = wt < 1;

      switch (p.kind) {
        case 'flame': {
          h.fx.flame(p.pos.x, p.pos.z, p.vel.x * 0.3, p.vel.z * 0.3);
          for (const q of h.zombies.within(p.pos.x, p.pos.z, p.blast)) {
            if (p.hit!.has(q)) continue; p.hit!.add(q);
            q.burn = 3;
            this.hurt(q, p.dmg, p.vel.x / 16, p.vel.z / 16, 0.3);
          }
          if (hitWall) this.kill(p);
          break;
        }
        case 'acid': {
          h.fx.acid(p.pos.x, p.pos.z);
          const pp = h.playerPos();
          if (Math.hypot(pp.x - p.pos.x, pp.z - p.pos.z) < 0.8 && p.pos.y < 2.2) { h.damagePlayer(p.dmg); this.kill(p); }
          else if (p.pos.y <= 0.1 || hitWall) this.kill(p);
          break;
        }
        case 'shell': {
          for (const q of h.zombies.within(p.pos.x, p.pos.z, 0.5)) {
            if (p.hit!.has(q)) continue; p.hit!.add(q);
            this.hurt(q, p.dmg * 0.5, p.vel.x / 40, p.vel.z / 40, p.w?.knockback ?? 8);
          }
          if (hitWall || p.life <= 0) { this.explode(p.pos.x, p.pos.z, p.blast, p.dmg); this.kill(p); }
          break;
        }
        case 'rocket': {
          const hit = h.zombies.within(p.pos.x, p.pos.z, 0.4).length > 0;
          if (hit || hitWall || p.life <= 0) { this.explode(p.pos.x, p.pos.z, p.blast, p.dmg); this.kill(p); }
          break;
        }
        case 'grenade': case 'bomblet': {
          if (hitWall) { p.pos.x = ox; p.pos.z = oz; p.vel.x *= -0.4; p.vel.z *= -0.4; }
          // mortar splits at the top of its arc
          if (p.split && p.vel.y < 0) {
            for (let i = 0; i < p.split; i++) {
              const a = (i / p.split) * Math.PI * 2;
              const m = new THREE.Mesh(this.grenadeGeo, this.matBomblet);
              m.position.copy(p.pos); this.scene.add(m);
              this.projs.push({ kind: 'bomblet', mesh: m, pos: m.position, vel: new THREE.Vector3(p.vel.x + Math.cos(a) * 3.5, 0, p.vel.z + Math.sin(a) * 3.5), life: 3, dmg: p.dmg, blast: p.blast });
            }
            this.kill(p);
            break;
          }
          const contact = p.kind === 'bomblet' ? false : h.zombies.within(p.pos.x, p.pos.z, 0.3).length > 0 && !!p.w;
          if (p.pos.y <= 0.15) {
            if (p.w || p.kind === 'bomblet') { this.explode(p.pos.x, p.pos.z, p.blast, p.dmg); this.kill(p); break; } // launcher rounds explode on impact
            p.pos.y = 0.15; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6;
          }
          if (contact || p.life <= 0) { this.explode(p.pos.x, p.pos.z, p.blast, p.dmg); this.kill(p); }
          break;
        }
      }
    }
    if (this.projs.length > 60) this.projs = this.projs.filter((p) => p.life > 0);
  }

  /** Spitters and the boss use this */
  get projectileCount() { return this.projs.filter((p) => p.life > 0).length; }
}
