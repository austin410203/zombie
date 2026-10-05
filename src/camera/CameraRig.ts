import * as THREE from 'three';

/**
 * Third-person / isometric hybrid. Smooth follow + smooth yaw rotation.
 * Walls between camera and player fade out so the detective is never hidden.
 */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw = Math.PI * 0.18;
  private targetYaw = this.yaw;
  private pitch = 1.02;
  private dist = 18;
  private targetDist = 18;
  private focus = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private shake = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 120);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    // portrait phones need to see more
    const portrait = w < h;
    if (portrait !== this.portrait) {
      this.portrait = portrait;
      this.userDist = portrait ? 26 : 18;
      if (!this.zoomOverride) this.targetDist = this.userDist;
    }
    this.camera.updateProjectionMatrix();
  }

  rotate(delta: number) { this.targetYaw += delta; }
  /** user zoom level (mouse wheel / pinch); dialogue close-ups return to it */
  private userDist = 18;
  private portrait: boolean | null = null;
  private zoomOverride = false;
  zoomTo(d: number | null) {
    this.zoomOverride = d != null;
    this.targetDist = d ?? this.userDist;
  }
  zoomBy(factor: number) {
    this.userDist = Math.min(42, Math.max(8, this.userDist * factor));
    if (!this.zoomOverride) this.targetDist = this.userDist;
  }
  bump(amount = 0.15) { this.shake = amount; }

  snap(target: THREE.Vector3) {
    this.focus.copy(target);
    this.yaw = this.targetYaw;
    this.dist = this.targetDist;
    this.apply();
  }

  private apply() {
    const off = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.dist);
    this.camera.position.copy(this.focus).add(off);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.focus);
  }

  update(dt: number, target: THREE.Vector3, walls: THREE.Mesh[]) {
    const k = 1 - Math.exp(-dt * 5);
    this.focus.lerp(new THREE.Vector3(target.x, target.y + 1.0, target.z), k);
    this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-dt * 6));
    this.dist += (this.targetDist - this.dist) * (1 - Math.exp(-dt * 3));
    this.shake = Math.max(0, this.shake - dt * 0.6);
    this.apply();

    // occlusion fade: buildings between camera and player turn see-through
    const hits = new Set<THREE.Object3D>();
    const near = walls.filter((w) => Math.abs(w.position.x - target.x) < 40 && Math.abs(w.position.z - target.z) < 40);
    for (const h of [0.8, 1.8]) {
      const p = new THREE.Vector3(target.x, h, target.z);
      const dir = p.clone().sub(this.camera.position);
      const len = dir.length();
      this.ray.set(this.camera.position, dir.normalize());
      this.ray.far = len - 0.4;
      for (const i of this.ray.intersectObjects(near, false)) hits.add(i.object);
    }
    for (const w of near.concat(this.faded.filter((f) => !near.includes(f)))) {
      const mats = (Array.isArray(w.material) ? w.material : [w.material]) as THREE.MeshStandardMaterial[];
      const goal = hits.has(w) ? 0.18 : 1;
      let op = (w.userData.op as number) ?? 1;
      op += (goal - op) * (1 - Math.exp(-dt * 10));
      if (goal === 1 && op > 0.97) op = 1;
      w.userData.op = op;
      const tr = op < 0.99;
      for (const m of mats) {
        if (m.transparent !== tr) { m.transparent = tr; m.depthWrite = !tr; m.needsUpdate = true; }
        m.opacity = op;
      }
      if (tr && !this.faded.includes(w)) this.faded.push(w);
      if (!tr) { const k = this.faded.indexOf(w); if (k >= 0) this.faded.splice(k, 1); }
    }
  }
  private faded: THREE.Mesh[] = [];

  /** Unit vectors on the ground plane for camera-relative movement */
  basis() {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { fwd, right };
  }
}
