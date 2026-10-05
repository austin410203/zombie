import * as THREE from 'three';
import type { L } from '../i18n/i18n';
import type { CollisionWorld } from '../world/Collision';
import { box, canvasTexture, std } from '../world/props';

export interface VehicleDef {
  id: string; name: L; bike: boolean;
  maxSpeed: number; accel: number; turn: number; hp: number; radius: number; mass: number;
  color: number;
}

export const VEHICLES: Record<string, VehicleDef> = {
  taxi:    { id: 'taxi',    name: { en: 'Yellow Cab', zh: '黃色計程車' },   bike: false, maxSpeed: 26, accel: 14, turn: 2.2, hp: 260, radius: 1.35, mass: 1.0, color: 0xf2b705 },
  police:  { id: 'police',  name: { en: 'NYPD Cruiser', zh: '紐約警車' },   bike: false, maxSpeed: 30, accel: 16, turn: 2.3, hp: 320, radius: 1.35, mass: 1.1, color: 0xf0f0f0 },
  pickup:  { id: 'pickup',  name: { en: 'Pickup Truck', zh: '皮卡貨車' },   bike: false, maxSpeed: 24, accel: 12, turn: 1.9, hp: 420, radius: 1.5,  mass: 1.5, color: 0x8a2a1a },
  ambulance:{ id: 'ambulance', name: { en: 'Ambulance', zh: '救護車' },     bike: false, maxSpeed: 22, accel: 10, turn: 1.7, hp: 480, radius: 1.6,  mass: 1.7, color: 0xf4f4f4 },
  suv:     { id: 'suv',     name: { en: 'Armored SUV', zh: '裝甲休旅車' },  bike: false, maxSpeed: 25, accel: 12, turn: 2.0, hp: 650, radius: 1.5,  mass: 1.8, color: 0x1a1d22 },
  sports:  { id: 'sports',  name: { en: 'Sports Car', zh: '跑車' },         bike: false, maxSpeed: 38, accel: 22, turn: 2.6, hp: 180, radius: 1.3,  mass: 0.9, color: 0xc4101a },
  moto:    { id: 'moto',    name: { en: 'Motorcycle', zh: '重型機車' },     bike: true,  maxSpeed: 36, accel: 24, turn: 3.2, hp: 140, radius: 0.7,  mass: 0.5, color: 0x1a1a1a },
  dirtbike:{ id: 'dirtbike',name: { en: 'Dirt Bike', zh: '越野機車' },      bike: true,  maxSpeed: 30, accel: 26, turn: 3.6, hp: 120, radius: 0.65, mass: 0.45, color: 0xf06a10 },
};

export class Vehicle {
  object = new THREE.Group();
  speed = 0;
  heading: number;
  hp: number;
  dead = false;
  occupied = false;
  private wheels: THREE.Object3D[] = [];
  private lightbar: THREE.Mesh[] = [];
  private t = 0;
  private lean = 0;
  seat = new THREE.Object3D();

  constructor(public def: VehicleDef, x: number, z: number, heading: number) {
    this.hp = def.hp;
    this.heading = heading;
    this.object.position.set(x, 0, z);
    this.object.rotation.y = heading;
    this.build();
  }

  get position() { return this.object.position; }

  private wheel(x: number, z: number, r: number, w: number) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 10), std(0x111111));
    m.rotation.z = Math.PI / 2; g.add(m);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 6), std(0x8a8a90, { metalness: 0.8 }));
    hub.rotation.z = Math.PI / 2; g.add(hub);
    g.position.set(x, r, z);
    this.object.add(g); this.wheels.push(g);
  }

  private build() {
    const d = this.def;
    const paint = std(d.color, { metalness: 0.5, roughness: 0.35 });
    const glass = std(0x0e1620, { metalness: 0.9, roughness: 0.08 });
    const dark = std(0x1a1a1a);
    if (d.bike) {
      this.object.add(box(0.28, 0.35, 1.5, paint, 0, 0.75, 0), box(0.3, 0.22, 0.6, dark, 0, 0.95, -0.25), box(0.5, 0.06, 0.08, std(0x999999, { metalness: 0.9 }), 0, 1.15, 0.6));
      this.object.add(box(0.2, 0.25, 0.3, paint, 0, 0.95, 0.55));
      const head = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), new THREE.MeshBasicMaterial({ color: 0xfff2c0 })); head.position.set(0, 0.95, 0.71); this.object.add(head);
      this.wheel(0, 0.75, 0.36, 0.14); this.wheel(0, -0.7, 0.36, 0.16);
      this.seat.position.set(0, 0.55, -0.15);
    } else {
      const big = d.id === 'ambulance' || d.id === 'pickup' || d.id === 'suv';
      const w = 1.9, len = d.id === 'ambulance' ? 5.0 : 4.4, h = big ? 0.85 : 0.65;
      this.object.add(box(w, h, len, paint, 0, 0.35 + h / 2, 0));
      if (d.id === 'pickup') {
        this.object.add(box(w * 0.95, 0.7, 1.8, paint, 0, 1.5, 0.6), box(w * 0.97, 0.62, 1.7, glass, 0, 1.52, 0.6, false));
        this.object.add(box(w, 0.4, 0.1, paint, 0, 1.25, -2.15), box(0.1, 0.4, 2, paint, -0.9, 1.25, -1.2), box(0.1, 0.4, 2, paint, 0.9, 1.25, -1.2));
      } else if (d.id === 'ambulance') {
        this.object.add(box(w, 1.6, 3.2, paint, 0, 1.95, -0.8), box(w * 0.95, 0.6, 1.2, glass, 0, 1.5, 1.6));
        const cross = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: canvasTexture(64, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#d01818'; c.fillRect(24, 8, 16, 48); c.fillRect(8, 24, 48, 16); }) }));
        for (const s of [-1, 1]) { const cc = cross.clone(); cc.position.set(s * 0.96, 2.1, -0.8); cc.rotation.y = s * Math.PI / 2; this.object.add(cc); }
        this.object.add(box(w, 0.12, 4.9, std(0xd01818), 0, 1.0, 0, false));
      } else {
        const cabin = d.id === 'sports' ? 0.45 : d.id === 'suv' ? 0.8 : 0.6;
        this.object.add(box(w * 0.9, cabin, 2.1, paint, 0, 0.35 + h + cabin / 2, -0.2), box(w * 0.92, cabin * 0.8, 2.0, glass, 0, 0.35 + h + cabin / 2, -0.2, false));
      }
      if (d.id === 'taxi') {
        const sign = box(0.7, 0.22, 0.3, new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), 0, 1.75, -0.2); this.object.add(sign);
        this.object.add(box(w + 0.02, 0.12, len * 0.6, std(0x111111), 0, 0.85, 0, false)); // checker stripe
      }
      if (d.id === 'police') {
        this.object.add(box(w + 0.01, 0.5, 2.2, std(0x111111), 0, 0.75, 0, false));
        for (const s of [-1, 1]) {
          const lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff1a1a : 0x1a4aff }));
          lb.position.set(s * 0.3, 1.72, -0.2); this.object.add(lb); this.lightbar.push(lb);
        }
      }
      // lights
      for (const s of [-0.65, 0.65]) {
        const hl = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.18), new THREE.MeshBasicMaterial({ color: 0xfff2c0 })); hl.position.set(s, 0.75, len / 2 + 0.01); this.object.add(hl);
        const tl = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.15), new THREE.MeshBasicMaterial({ color: 0xff2020 })); tl.position.set(s, 0.8, -len / 2 - 0.01); tl.rotation.y = Math.PI; this.object.add(tl);
      }
      const wr = big ? 0.45 : 0.38;
      for (const [x, z] of [[-0.95, len * 0.32], [0.95, len * 0.32], [-0.95, -len * 0.32], [0.95, -len * 0.32]]) this.wheel(x, z, wr, 0.3);
      this.seat.position.set(-0.4, 0.35, 0.2);
    }
    this.object.add(this.seat);
    this.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  /**
   * Arcade driving. throttle -1..1, steer -1..1 (positive = right).
   * Returns impact speed if it hit a wall this frame (for damage / shake).
   */
  drive(dt: number, throttle: number, steer: number, brake: boolean, world: CollisionWorld): number {
    const d = this.def;
    this.t += dt;
    if (this.dead) { this.speed *= Math.exp(-dt * 3); throttle = 0; }
    if (throttle > 0) this.speed += d.accel * throttle * dt * (this.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) this.speed += d.accel * throttle * dt * (this.speed > 0 ? 2.2 : 0.6);
    else this.speed *= Math.exp(-dt * 0.8);
    if (brake) this.speed *= Math.exp(-dt * 3.5);
    this.speed = Math.max(-d.maxSpeed * 0.35, Math.min(d.maxSpeed, this.speed));
    const grip = Math.min(1, Math.abs(this.speed) / 6);
    this.heading -= steer * d.turn * grip * Math.sign(this.speed || 1) * dt * (brake ? 1.5 : 1);
    const vx = Math.sin(this.heading) * this.speed * dt, vz = Math.cos(this.heading) * this.speed * dt;
    const [nx, nz] = world.move(this.position.x, this.position.z, vx, vz, d.radius);
    let impact = 0;
    const moved = Math.hypot(nx - this.position.x, nz - this.position.z), wanted = Math.hypot(vx, vz);
    if (wanted > 0.001 && moved < wanted * 0.5) { impact = Math.abs(this.speed); this.speed *= -0.25; }
    this.position.x = nx; this.position.z = nz;
    this.object.rotation.y = this.heading;
    // cosmetics
    for (const w of this.wheels) w.children.forEach((c) => (c.rotation.x += this.speed * dt * 2.5));
    if (d.bike) { this.lean += (-steer * 0.35 * grip - this.lean) * Math.min(1, dt * 6); this.object.rotation.z = this.lean; }
    for (const [i, l] of this.lightbar.entries()) l.visible = Math.sin(this.t * 14 + i * Math.PI) > 0;
    return impact;
  }

  damage(n: number) {
    if (this.dead) return false;
    this.hp -= n;
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      this.object.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m?.isMeshStandardMaterial) m.color.multiplyScalar(0.18); });
      return true;
    }
    return false;
  }

  repair() { this.hp = this.def.hp; }
}

/** Where vehicles are parked at the start (all on roads) */
export const VEHICLE_SPAWNS: [string, number, number, number][] = [
  ['taxi', -71, 96, 0], ['moto', -64, 112, 0.3], ['police', -42, 66, Math.PI / 2], ['police', -60, 66, -Math.PI / 2],
  ['sports', -34, 88, Math.PI], ['pickup', 37, 30, 0], ['taxi', 3, 58, Math.PI], ['ambulance', 40, -2, Math.PI / 2],
  ['dirtbike', 99, 4, 0], ['suv', -99, -30, 0], ['police', 66, -66, Math.PI], ['taxi', -3, -80, 0], ['moto', 31, -40, 1.57],
  ['sports', 102, 60, Math.PI], ['dirtbike', -104, 70, 0], ['suv', 0, -96, 0],
];
