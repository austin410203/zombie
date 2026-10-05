import * as THREE from 'three';

function radial(inner: string, outer: string) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

/** One pooled point-cloud per look (cheap: 1 draw call each). */
class ParticleSystem {
  points: THREE.Points;
  private pos: Float32Array; private col: Float32Array;
  private vel: Float32Array; private life: Float32Array; private maxLife: Float32Array;
  private base: Float32Array; private grav: Float32Array;
  private next = 0;

  constructor(scene: THREE.Scene, private n: number, size: number, tex: THREE.Texture | null, additive: boolean) {
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.base = new Float32Array(n * 3); this.grav = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size, vertexColors: true, transparent: true, depthWrite: false, map: tex ?? undefined,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: THREE.Color, gravity = 9) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life; this.grav[i] = gravity;
    this.base.set([color.r, color.g, color.b], i * 3);
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.05, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] <= 0.05) { this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      this.col[i * 4] = this.base[i * 3]; this.col[i * 4 + 1] = this.base[i * 3 + 1]; this.col[i * 4 + 2] = this.base[i * 3 + 2];
      this.col[i * 4 + 3] = k;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class FX {
  private bits: ParticleSystem;
  private fire: ParticleSystem;
  private smoke: ParticleSystem;
  private decals: THREE.InstancedMesh;
  private decalNext = 0;
  private flashes: { light: THREE.PointLight; t: number }[] = [];
  private tracers: THREE.LineSegments;
  private tPos: Float32Array; private tCol: Float32Array; private tLife: Float32Array; private tBase: Float32Array;
  private tNext = 0;
  private c = new THREE.Color();

  constructor(scene: THREE.Scene, mobile: boolean) {
    this.bits = new ParticleSystem(scene, mobile ? 500 : 1200, 0.16, radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.6)'), false);
    this.fire = new ParticleSystem(scene, mobile ? 300 : 700, 1.3, radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), true);
    this.smoke = new ParticleSystem(scene, mobile ? 160 : 360, 2.4, radial('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)'), false);
    // ground splats
    const dg = new THREE.CircleGeometry(0.6, 8); dg.rotateX(-Math.PI / 2);
    this.decals = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), 220);
    this.decals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(220 * 3), 3);
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < 220; i++) this.decals.setMatrixAt(i, hide);
    this.decals.frustumCulled = false;
    scene.add(this.decals);
    // tracers
    const N = 160;
    this.tPos = new Float32Array(N * 6); this.tCol = new Float32Array(N * 8); this.tLife = new Float32Array(N); this.tBase = new Float32Array(N * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tCol, 4));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    // reusable flash lights (muzzle / explosion)
    for (let i = 0; i < (mobile ? 2 : 4); i++) {
      const l = new THREE.PointLight(0xffa040, 0, 14, 1.5); scene.add(l); this.flashes.push({ light: l, t: 0 });
    }
  }

  tracer(x0: number, z0: number, x1: number, z1: number, color: number, y = 1.25) {
    const i = this.tNext; this.tNext = (this.tNext + 1) % this.tLife.length;
    this.tPos.set([x0, y, z0, x1, y, z1], i * 6);
    this.c.setHex(color);
    this.tBase.set([this.c.r, this.c.g, this.c.b], i * 3);
    this.tLife[i] = 0.08;
  }
  beam(x0: number, z0: number, x1: number, z1: number, color: number) {
    for (let k = 0; k < 3; k++) { this.tracer(x0, z0, x1, z1, color, 1.15 + k * 0.08); this.tLife[(this.tNext + this.tLife.length - 1) % this.tLife.length] = 0.35; }
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let s = 0; s < len; s += 1.2) {
      const k = s / len;
      this.bits.emit(x0 + (x1 - x0) * k, 1.2, z0 + (z1 - z0) * k, (Math.random() - 0.5), Math.random(), (Math.random() - 0.5), 0.5, this.c.setHex(color), 0);
    }
  }

  flash(x: number, y: number, z: number, intensity: number, color = 0xffa040, dur = 0.06) {
    const f = this.flashes.reduce((a, b) => (a.t < b.t ? a : b));
    f.light.position.set(x, y, z); f.light.color.setHex(color); f.light.intensity = intensity; f.t = dur;
  }

  muzzle(x: number, z: number, dx: number, dz: number, color: number) {
    for (let i = 0; i < 3; i++) this.fire.emit(x + dx * 0.3, 1.25, z + dz * 0.3, dx * 6 + (Math.random() - 0.5) * 2, Math.random(), dz * 6 + (Math.random() - 0.5) * 2, 0.05, this.c.setHex(color), 0);
  }

  blood(x: number, z: number, dx: number, dz: number, green = false, amount = 6) {
    const col = this.c.setHex(green ? 0x6ac02a : 0x8a0a0a);
    for (let i = 0; i < amount; i++)
      this.bits.emit(x, 1.1 + Math.random() * 0.4, z, dx * 3 + (Math.random() - 0.5) * 4, 1 + Math.random() * 3, dz * 3 + (Math.random() - 0.5) * 4, 0.5 + Math.random() * 0.4, col);
    if (Math.random() < 0.35) this.decal(x + dx * 0.8, z + dz * 0.8, green ? 0x2a5a10 : 0x3a0606, 0.6 + Math.random() * 0.8);
  }

  sparks(x: number, z: number, y = 1.2) {
    for (let i = 0; i < 5; i++) this.bits.emit(x, y, z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.25, this.c.setHex(0xffd27a));
  }

  flame(x: number, z: number, vx: number, vz: number) {
    const k = Math.random();
    this.fire.emit(x, 1.1, z, vx, 1 + Math.random(), vz, 0.45 + Math.random() * 0.2, this.c.setHSL(0.05 + k * 0.07, 1, 0.5), -2);
  }

  burnTick(x: number, z: number) {
    if (Math.random() < 0.5) this.fire.emit(x + (Math.random() - 0.5) * 0.5, 0.8 + Math.random(), z + (Math.random() - 0.5) * 0.5, 0, 1.5, 0, 0.4, this.c.setHex(0xff7a20), -2);
  }

  acid(x: number, z: number) { this.bits.emit(x, 1.0, z, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.3, this.c.setHex(0x9aff3a), 3); }

  flare(x: number, z: number) {
    for (let i = 0; i < 4; i++) this.fire.emit(x + (Math.random() - 0.5) * 0.3, 1.5, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.6, 8 + Math.random() * 4, (Math.random() - 0.5) * 0.6, 1.4, this.c.setHex(0xff2a2a), 1);
  }

  pickupGlow(x: number, z: number, color: number) { this.bits.emit(x + (Math.random() - 0.5) * 0.6, 0.3, z + (Math.random() - 0.5) * 0.6, 0, 1.4, 0, 0.8, this.c.setHex(color), 0); }

  explosion(x: number, z: number, r: number) {
    this.flash(x, 2.5, z, 120 * r / 5, 0xff8a30, 0.18);
    for (let i = 0; i < 26 * r / 4; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * r * 2.2;
      this.fire.emit(x, 0.8 + Math.random(), z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 0.4 + Math.random() * 0.4, this.c.setHSL(0.02 + Math.random() * 0.1, 1, 0.55), 2);
    }
    for (let i = 0; i < 10 * r / 4; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * r;
      this.smoke.emit(x, 1 + Math.random() * 2, z, Math.cos(a) * s, 1.5 + Math.random() * 2, Math.sin(a) * s, 1.6 + Math.random(), this.c.setHex(0x5a4e48), -0.5);
    }
    for (let i = 0; i < 16; i++) this.bits.emit(x, 0.5, z, (Math.random() - 0.5) * 14, 4 + Math.random() * 8, (Math.random() - 0.5) * 14, 1.0, this.c.setHex(0x1a1a1a));
    this.decal(x, z, 0x0e0c0a, r * 0.7);
  }

  private decal(x: number, z: number, color: number, s: number) {
    const i = this.decalNext; this.decalNext = (this.decalNext + 1) % 220;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.03 + (i % 7) * 0.002, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), new THREE.Vector3(s, 1, s * (0.7 + Math.random() * 0.6)));
    this.decals.setMatrixAt(i, m);
    this.decals.setColorAt(i, this.c.setHex(color));
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor!.needsUpdate = true;
  }

  update(dt: number) {
    this.bits.update(dt); this.fire.update(dt); this.smoke.update(dt);
    for (let i = 0; i < this.tLife.length; i++) {
      const l = Math.max(0, this.tLife[i] -= dt);
      const a = Math.min(1, l * 14);
      for (let v = 0; v < 2; v++) {
        this.tCol[i * 8 + v * 4] = this.tBase[i * 3]; this.tCol[i * 8 + v * 4 + 1] = this.tBase[i * 3 + 1]; this.tCol[i * 8 + v * 4 + 2] = this.tBase[i * 3 + 2];
        this.tCol[i * 8 + v * 4 + 3] = v === 0 ? a * 0.25 : a;
      }
    }
    (this.tracers.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.tracers.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    for (const f of this.flashes) { f.t -= dt; if (f.t <= 0) f.light.intensity = 0; }
  }
}
