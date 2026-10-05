import * as THREE from 'three';
import type { CollisionWorld } from '../world/Collision';
import { makeRig, type Rig } from './KayRig';

export class Player {
  rig: Rig;
  object = new THREE.Group();
  radius = 0.4;
  speed = 0;
  hp = 100;
  maxHp = 100;
  armor = 0;
  stamina = 1;
  medkits = 1;
  grenades = 2;
  adrenaline = 0;   // seconds left
  rage = 0;         // seconds left (double damage)
  hurtFlash = 0;
  dead = false;
  private stepAcc = 0;
  onStep?: (run: boolean) => void;

  constructor() {
    // Detective Jamie Reyes: navy coat, NYPD badge gold accent
    this.rig = makeRig('player', { coat: 0x1e2a44, accent: 0xd9a63a, skin: 0xc89a74, hair: 0x1a1210 });
    this.rig.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.object.add(this.rig.object);
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 16), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03;
    this.object.add(blob);
  }

  get position() { return this.object.position; }

  /** Damage after armor absorption. Returns true if this killed the player. */
  hurt(n: number) {
    if (this.dead) return false;
    const absorbed = Math.min(this.armor, n * 0.6);
    this.armor -= absorbed;
    this.hp -= n - absorbed;
    this.hurtFlash = Math.min(1, this.hurtFlash + n / 30);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.rig.setState('dead'); return true; }
    return false;
  }

  heal(n: number) { this.hp = Math.min(this.maxHp, this.hp + n); }

  update(dt: number, move: { x: number; y: number; run: boolean }, basis: { fwd: THREE.Vector3; right: THREE.Vector3 }, world: CollisionWorld, aimYaw: number, aiming: boolean) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    this.adrenaline = Math.max(0, this.adrenaline - dt);
    this.rage = Math.max(0, this.rage - dt);
    if (this.dead) { this.rig.update(dt, 0); return; }
    const mag = Math.hypot(move.x, move.y);
    const sprint = move.run && this.stamina > 0.05 && mag > 0.3;
    this.stamina = Math.min(1, Math.max(0, this.stamina + (sprint ? -dt * 0.22 : dt * 0.15)));
    const base = (sprint ? 7.2 : 4.4) * (this.adrenaline > 0 ? 1.45 : 1);
    if (mag > 0.08) {
      const dir = basis.fwd.clone().multiplyScalar(move.y).add(basis.right.clone().multiplyScalar(move.x)).normalize();
      this.speed += (base * Math.min(1, mag * 1.2) - this.speed) * (1 - Math.exp(-dt * 12));
      const [nx, nz] = world.move(this.position.x, this.position.z, dir.x * this.speed * dt, dir.z * this.speed * dt, this.radius);
      this.position.x = nx; this.position.z = nz;
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > (sprint ? 1.3 : 0.9)) { this.stepAcc = 0; this.onStep?.(sprint); }
      if (!aiming) aimYaw = Math.atan2(dir.x, dir.z);
    } else this.speed += (0 - this.speed) * (1 - Math.exp(-dt * 14));
    const cur = this.rig.object.rotation.y;
    this.rig.object.rotation.y = cur + Math.atan2(Math.sin(aimYaw - cur), Math.cos(aimYaw - cur)) * (1 - Math.exp(-dt * 20));
    this.rig.aiming = aiming;
    this.rig.setState(this.speed > 5.5 ? 'run' : this.speed > 0.4 ? 'walk' : 'idle');
    this.rig.update(dt, this.speed / 3);
  }

  get facing() { return this.rig.object.rotation.y; }

  respawn(x: number, z: number) {
    this.dead = false; this.hp = this.maxHp; this.stamina = 1; this.hurtFlash = 0;
    this.position.set(x, 0, z);
    this.rig.setState('idle');
  }
}
