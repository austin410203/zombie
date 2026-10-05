import * as THREE from 'three';
import { canvasTexture } from '../world/props';

export type PickupType = 'medkit' | 'bandage' | 'armor' | 'ammo' | 'grenade' | 'adrenaline' | 'rage' | 'toolkit' | 'weapon' | 'sample';

const LOOK: Record<PickupType, { color: number; icon: string }> = {
  medkit: { color: 0xff3b3b, icon: '✚' }, bandage: { color: 0xff8a8a, icon: '+' }, armor: { color: 0x4a8aff, icon: '◆' },
  ammo: { color: 0xffc23a, icon: '▮' }, grenade: { color: 0x7ab04a, icon: '●' }, adrenaline: { color: 0x3affd0, icon: '⚡' },
  rage: { color: 0xff3a9a, icon: '✸' }, toolkit: { color: 0xc0c0c0, icon: '⚙' }, weapon: { color: 0xffe07a, icon: '★' }, sample: { color: 0x7dff4a, icon: '☣' },
};

export interface Pickup { type: PickupType; object: THREE.Group; weapon?: string; alive: boolean; respawn: number; bob: number }

const iconCache = new Map<string, THREE.Texture>();
function icon(ch: string, color: number) {
  const k = ch + color;
  if (!iconCache.has(k)) iconCache.set(k, canvasTexture(64, 64, (c) => {
    c.fillStyle = 'rgba(10,10,14,0.85)'; c.beginPath(); c.arc(32, 32, 30, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#' + color.toString(16).padStart(6, '0'); c.lineWidth = 4; c.stroke();
    c.fillStyle = c.strokeStyle; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 32, 34);
  }));
  return iconCache.get(k)!;
}

export class PickupManager {
  list: Pickup[] = [];
  private t = 0;

  constructor(private scene: THREE.Scene) {}

  add(type: PickupType, x: number, z: number, weapon?: string, respawn = 0) {
    const look = LOOK[type];
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: look.color, emissive: look.color, emissiveIntensity: 0.5, roughness: 0.4 });
    const body = type === 'weapon'
      ? new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, emissive: 0x222a10 }))
      : new THREE.Mesh(type === 'grenade' ? new THREE.SphereGeometry(0.22, 8, 6) : new THREE.BoxGeometry(0.5, 0.36, 0.36), mat);
    body.position.y = 0.45; body.castShadow = true;
    g.add(body);
    if (type === 'weapon') { const lid = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.62), mat); lid.position.y = 0.72; g.add(lid); }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon(look.icon, look.color), depthTest: false, transparent: true }));
    sp.position.y = 1.4; sp.scale.setScalar(0.6); sp.renderOrder = 5;
    g.add(sp);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const p: Pickup = { type, object: g, weapon, alive: true, respawn, bob: Math.random() * 6 };
    this.list.push(p);
    return p;
  }

  color(type: PickupType) { return LOOK[type].color; }

  /** Returns picked-up items this frame */
  update(dt: number, player: THREE.Vector3, radius = 1.3): Pickup[] {
    this.t += dt;
    const got: Pickup[] = [];
    for (const p of this.list) {
      if (!p.alive) {
        if (p.respawn > 0) { p.respawn -= dt; if (p.respawn <= 0) { p.alive = true; p.object.visible = true; p.respawn = 90; } }
        continue;
      }
      const body = p.object.children[0];
      body.rotation.y += dt * 1.5;
      body.position.y = 0.45 + Math.sin(this.t * 3 + p.bob) * 0.08;
      if (Math.hypot(p.object.position.x - player.x, p.object.position.z - player.z) < radius) got.push(p);
    }
    return got;
  }

  consume(p: Pickup) {
    p.alive = false;
    p.object.visible = false;
    if (!p.respawn) { this.scene.remove(p.object); this.list.splice(this.list.indexOf(p), 1); }
  }

  remove(type: PickupType) {
    for (const p of [...this.list]) if (p.type === type) { this.scene.remove(p.object); this.list.splice(this.list.indexOf(p), 1); }
  }
}
