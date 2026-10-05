import * as THREE from 'three';
import { makeRig, type Rig } from './KayRig';
import type { CollisionWorld } from '../world/Collision';

export type ZType = 'walker' | 'runner' | 'brute' | 'spitter' | 'boss';

interface ZDef { hp: number; speed: number; damage: number; reach: number; radius: number; scale: number; coat: number[]; skin: number; score: number; cooldown: number }

export const ZDEFS: Record<ZType, ZDef> = {
  walker:  { hp: 80,   speed: 1.6, damage: 10, reach: 1.25, radius: 0.42, scale: 1.0,  coat: [0x4a4a52, 0x5a3a2a, 0x2a3a4a, 0x6a6a5a, 0x3a2a3a], skin: 0x7a9a6a, score: 1, cooldown: 1.1 },
  runner:  { hp: 55,   speed: 4.6, damage: 8,  reach: 1.2,  radius: 0.38, scale: 0.95, coat: [0x8a2a2a, 0x2a2a2a, 0x3a5a7a],           skin: 0x8aa27a, score: 1, cooldown: 0.8 },
  brute:   { hp: 600,  speed: 1.9, damage: 28, reach: 1.9,  radius: 0.85, scale: 1.7,  coat: [0x2a3a2a, 0x3a3a3a],                     skin: 0x6a8a5a, score: 5, cooldown: 1.6 },
  spitter: { hp: 90,   speed: 1.8, damage: 12, reach: 14,   radius: 0.42, scale: 1.0,  coat: [0xd8d8d0],                               skin: 0x9ac04a, score: 2, cooldown: 2.4 },
  boss:    { hp: 9000, speed: 2.4, damage: 40, reach: 3.4,  radius: 2.0,  scale: 3.6,  coat: [0x3a1a1a],                               skin: 0x7a5a5a, score: 50, cooldown: 2.0 },
};

let pick = 0;
export class Zombie {
  object = new THREE.Group();
  rig: Rig;
  private hitCd = 0;
  private glowing = false;
  def: ZDef;
  hp = 0;
  alive = true;
  deadTime = 0;
  knock = new THREE.Vector2();
  attackCd = 0;
  burn = 0;
  slow = 0;
  aggro = false;
  wander = Math.random() * Math.PI * 2;
  groanCd = 2 + Math.random() * 8;
  flash = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  private t = Math.random() * 10;

  constructor(public type: ZType) {
    const d = (this.def = ZDEFS[type]);
    this.rig = makeRig(type, { coat: d.coat[pick++ % d.coat.length], accent: type === 'spitter' ? 0x5aa02a : 0x3a2a22, skin: d.skin, hair: 0x2a2a20, skirt: pick % 3 === 0, height: d.scale });
    this.object.add(this.rig.object);
    this.rig.object.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.isMeshStandardMaterial) { const c = m.clone(); c.userData.baseEmissive = (m.userData.baseEmissive ?? m.emissive).clone(); (o as THREE.Mesh).material = c; this.mats.push(c); } });
    if (type === 'boss' && !this.rig.act) {
      // mass of fused bodies: extra lumps on the back and shoulders
      const flesh = new THREE.MeshStandardMaterial({ color: 0x8a4a4a, flatShading: true, roughness: 0.7 });
      for (let i = 0; i < 7; i++) {
        const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + Math.random() * 0.14, 0), flesh);
        lump.position.set((Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 0.5, -0.2 - Math.random() * 0.15);
        this.rig.object.add(lump); this.mats.push(flesh);
      }
    }
    // blob shadow
    const blob = new THREE.Mesh(new THREE.CircleGeometry(d.radius * 1.1, 12), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03;
    this.object.add(blob);
    this.reset();
  }

  /** reused from the pool: climb out of the ground */
  private spawned = false;

  reset() {
    if (this.spawned) this.rig.act?.('spawn');
    this.spawned = true;
    this.hp = this.def.hp;
    this.alive = true;
    this.deadTime = 0;
    this.burn = 0; this.slow = 0; this.flash = 0;
    this.knock.set(0, 0);
    this.aggro = false;
    this.rig.setState('zombie');
    this.object.visible = true;
    this.rig.object.rotation.set(0, Math.random() * 6.28, 0);
    this.rig.object.position.y = 0;
    for (const m of this.mats) m.emissive.copy(m.userData.baseEmissive ?? new THREE.Color(0));
  }

  get position() { return this.object.position; }
  get radius() { return this.def.radius; }

  update(dt: number, target: THREE.Vector3, world: CollisionWorld, hunt: boolean) {
    this.t += dt;
    if (!this.alive) {
      this.deadTime += dt;
      this.rig.update(dt, 0);
      if (this.deadTime > 2.5) this.rig.object.position.y = -(this.deadTime - 2.5) * 0.6; // sink
      return;
    }
    this.attackCd -= dt;
    this.groanCd -= dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    const burnGlow = this.burn > 0 ? 0.45 + Math.sin(this.t * 20) * 0.15 : 0;
    this.hitCd -= dt;
    if (this.flash > 0.01 || burnGlow > 0) { for (const m of this.mats) m.emissive.setRGB(this.flash + burnGlow, this.flash * 0.9 + burnGlow * 0.35, this.flash * 0.9); this.glowing = true; }
    else if (this.glowing) { for (const m of this.mats) m.emissive.copy(m.userData.baseEmissive ?? new THREE.Color(0)); this.glowing = false; }

    const dx = target.x - this.position.x, dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 28 || hunt) this.aggro = true;
    let mx = 0, mz = 0;
    if (this.aggro) {
      const stop = this.type === 'spitter' ? this.def.reach * 0.7 : this.def.reach * 0.7;
      if (dist > stop) { mx = dx / dist; mz = dz / dist; }
    } else {
      this.wander += (Math.random() - 0.5) * dt;
      mx = Math.cos(this.wander) * 0.3; mz = Math.sin(this.wander) * 0.3;
    }
    const sp = this.def.speed * (this.slow > 0 ? 0.5 : 1) * (this.type === 'runner' ? 0.9 + Math.sin(this.t * 3) * 0.15 : 1);
    this.slow = Math.max(0, this.slow - dt);
    // knockback decays
    const kx = this.knock.x * dt, kz = this.knock.y * dt;
    this.knock.multiplyScalar(Math.exp(-dt * 6));
    const [nx, nz] = world.move(this.position.x, this.position.z, mx * sp * dt + kx, mz * sp * dt + kz, this.def.radius * 0.8);
    // if blocked while chasing, slide around the obstacle
    if (this.aggro && Math.abs(nx - this.position.x) + Math.abs(nz - this.position.z) < sp * dt * 0.2 && dist > 2) {
      const [sx, sz] = world.move(this.position.x, this.position.z, -mz * sp * dt, mx * sp * dt, this.def.radius * 0.8);
      this.position.x = sx; this.position.z = sz;
    } else { this.position.x = nx; this.position.z = nz; }
    if (mx || mz) {
      const yaw = Math.atan2(mx, mz);
      const cur = this.rig.object.rotation.y;
      this.rig.object.rotation.y = cur + Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur)) * Math.min(1, dt * 6);
    }
    this.rig.update(dt, Math.hypot(mx, mz) * sp / 2);
  }

  /** Returns true if this hit killed it */
  damage(amount: number, dirX = 0, dirZ = 0, knock = 0) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.flash = 1;
    this.aggro = true;
    const massK = this.type === 'boss' ? 0.05 : this.type === 'brute' ? 0.3 : 1;
    this.knock.x += dirX * knock * massK; this.knock.y += dirZ * knock * massK;
    if (this.hp > 0 && this.hitCd <= 0 && this.type !== 'boss') { this.rig.act?.('hit'); this.hitCd = 0.8; }
    if (this.hp <= 0) {
      this.alive = false;
      this.rig.setState('dead');
      this.rig.update(0.001, 0);
      return true;
    }
    return false;
  }
}

/** Spawning, pooling and crowd separation */
export class ZombieManager {
  list: Zombie[] = [];
  private pool: Record<ZType, Zombie[]> = { walker: [], runner: [], brute: [], spitter: [], boss: [] };
  max: number;
  intensity = 1;            // multiplier on target population (missions crank it up)
  hotspot: THREE.Vector3 | null = null;
  private spawnCd = 0;

  constructor(private scene: THREE.Scene, private world: CollisionWorld, private isOpen: (x: number, z: number) => boolean, mobile: boolean) {
    this.max = mobile ? 22 : 34;
  }

  spawn(type: ZType, x: number, z: number) {
    const z0 = this.pool[type].pop() ?? new Zombie(type);
    z0.reset();
    z0.position.set(x, 0, z);
    this.scene.add(z0.object);
    this.list.push(z0);
    return z0;
  }

  get aliveCount() { let n = 0; for (const z of this.list) if (z.alive && z.type !== 'boss') n++; return n; }

  private pickType(): ZType {
    const r = Math.random();
    if (r < 0.05 * this.intensity) return 'brute';
    if (r < 0.14) return 'spitter';
    if (r < 0.38) return 'runner';
    return 'walker';
  }

  /** Spawn just outside the camera view, on open ground */
  private spawnNear(center: THREE.Vector3) {
    for (let tries = 0; tries < 10; tries++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 14;
      const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
      if (this.isOpen(x, z)) { this.spawn(this.pickType(), x, z); return; }
    }
  }

  update(dt: number, player: THREE.Vector3, hunt: boolean) {
    // population upkeep
    this.spawnCd -= dt;
    const target = Math.round(this.max * Math.min(1.6, this.intensity));
    if (this.spawnCd <= 0 && this.aliveCount < target) {
      this.spawnNear(this.hotspot ?? player);
      this.spawnCd = this.intensity > 1 ? 0.25 : 0.6;
    }
    for (const z of this.list) z.update(dt, player, this.world, hunt || this.intensity > 1.2);
    // separation so hordes don't stack into one blob
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i]; if (!a.alive) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j]; if (!b.alive) continue;
        const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
        const rr = a.radius + b.radius, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          a.position.x -= (dx / d) * push; a.position.z -= (dz / d) * push;
          b.position.x += (dx / d) * push; b.position.z += (dz / d) * push;
        }
      }
    }
    // recycle corpses and stragglers that got left far behind
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      const far = z.type !== 'boss' && z.position.distanceTo(player) > 70;
      if ((!z.alive && z.deadTime > 4) || far) {
        this.scene.remove(z.object);
        this.list.splice(i, 1);
        this.pool[z.type].push(z);
      }
    }
  }

  /** Circle-vs-segment query: zombies hit along a ray, nearest first */
  along(x0: number, z0: number, dx: number, dz: number, len: number, widen = 0) {
    const hits: { z: Zombie; t: number }[] = [];
    for (const z of this.list) {
      if (!z.alive) continue;
      const fx = z.position.x - x0, fz = z.position.z - z0;
      const t = fx * dx + fz * dz;
      if (t < -0.5 || t > len) continue;
      const px = fx - dx * t, pz = fz - dz * t;
      const r = z.radius + widen;
      if (px * px + pz * pz < r * r) hits.push({ z, t });
    }
    return hits.sort((a, b) => a.t - b.t);
  }

  within(x: number, z: number, r: number) {
    return this.list.filter((q) => q.alive && Math.hypot(q.position.x - x, q.position.z - z) < r + q.radius);
  }

  clearNear(p: THREE.Vector3, r: number) {
    for (const z of this.list) if (z.type !== 'boss' && z.position.distanceTo(p) < r) { z.alive = false; z.deadTime = 99; }
  }
}
