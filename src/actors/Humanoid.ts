import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type AnimState = 'idle' | 'walk' | 'run' | 'investigate' | 'talk' | 'zombie' | 'aim' | 'dead' | 'drive';

/** Any character visual — placeholder or GLB — implements this. */
export interface CharacterRig {
  object: THREE.Object3D;
  setState(s: AnimState): void;
  update(dt: number, speed: number): void;
  /** meshes that can glow for highlight / detective vision */
  meshes: THREE.Mesh[];
}

export interface HumanoidOptions {
  coat: number; accent: number; skin: number; hair: number;
  hat?: boolean; height?: number; skirt?: boolean;
}

const mat = (color: number, rough = 0.8) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05, flatShading: true });

/** Low-poly procedural humanoid with code-driven animation (no assets required). */
export class Humanoid implements CharacterRig {
  object = new THREE.Group();
  meshes: THREE.Mesh[] = [];
  private body = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  /** attach weapons here (sits in the right hand) */
  hand = new THREE.Group();
  private head = new THREE.Group();
  private state: AnimState = 'idle';
  private t = Math.random() * 10;
  private blend = { walk: 0, run: 0, investigate: 0, talk: 0, zombie: 0, aim: 0, dead: 0, drive: 0 };
  /** set true to keep the aim pose while walking */
  aiming = false;

  constructor(o: HumanoidOptions) {
    const s = o.height ?? 1;
    const coat = mat(o.coat), accent = mat(o.accent, 0.6), skin = mat(o.skin, 0.9), hair = mat(o.hair, 0.9);
    const pants = mat(0x1b1d24), shoe = mat(0x0c0c0e, 0.5);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      this.meshes.push(mesh);
      return mesh;
    };

    this.object.add(this.body);
    // legs (pivot at hip)
    for (const [leg, x] of [[this.legL, -0.13], [this.legR, 0.13]] as const) {
      leg.position.set(x, 0.92, 0);
      this.body.add(leg);
      add(leg, new THREE.BoxGeometry(0.19, 0.82, 0.21), pants, 0, -0.42, 0);
      add(leg, new THREE.BoxGeometry(0.21, 0.1, 0.32), shoe, 0, -0.86, 0.05);
    }
    // coat torso + skirt
    add(this.body, new THREE.CylinderGeometry(0.27, 0.32, 0.72, 7), coat, 0, 1.32, 0);
    add(this.body, new THREE.CylinderGeometry(0.33, o.skirt ? 0.48 : 0.4, o.skirt ? 0.62 : 0.45, 7, 1, true), coat, 0, o.skirt ? 0.72 : 0.86, 0)
      .material = (() => { const m = coat.clone(); m.side = THREE.DoubleSide; return m; })();
    add(this.body, new THREE.BoxGeometry(0.42, 0.1, 0.36), accent, 0, 1.0, 0); // belt / sash
    add(this.body, new THREE.ConeGeometry(0.13, 0.22, 4), accent, 0, 1.56, 0.17).rotation.x = Math.PI; // tie/collar
    // head
    this.head.position.set(0, 1.72, 0);
    this.body.add(this.head);
    add(this.head, new THREE.CylinderGeometry(0.07, 0.08, 0.12, 6), skin, 0, -0.02, 0);
    add(this.head, new THREE.IcosahedronGeometry(0.19, 1), skin, 0, 0.17, 0);
    if (o.hat) {
      add(this.head, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 10), hair, 0, 0.3, 0);
      add(this.head, new THREE.CylinderGeometry(0.17, 0.2, 0.2, 8), hair, 0, 0.41, 0);
      add(this.head, new THREE.CylinderGeometry(0.205, 0.205, 0.045, 8), accent, 0, 0.33, 0);
    } else {
      const h = add(this.head, new THREE.SphereGeometry(0.205, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.2, -0.02);
      h.scale.set(1, 1, 1.05);
    }
    // eyes (tiny, to show facing)
    const eye = mat(0x111111);
    add(this.head, new THREE.BoxGeometry(0.04, 0.03, 0.02), eye, -0.07, 0.19, 0.17);
    add(this.head, new THREE.BoxGeometry(0.04, 0.03, 0.02), eye, 0.07, 0.19, 0.17);
    // arms (pivot at shoulder)
    for (const [arm, x] of [[this.armL, -0.36], [this.armR, 0.36]] as const) {
      arm.position.set(x, 1.62, 0);
      this.body.add(arm);
      add(arm, new THREE.BoxGeometry(0.15, 0.62, 0.17), coat, 0, -0.3, 0);
      add(arm, new THREE.IcosahedronGeometry(0.08, 0), skin, 0, -0.66, 0);
    }
    this.hand.position.set(0, -0.66, 0.05);
    this.hand.rotation.x = Math.PI / 2;
    this.armR.add(this.hand);
    this.object.scale.setScalar(s);
  }

  setState(s: AnimState) { this.state = s; }

  update(dt: number, speed: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 10);
    const target = {
      walk: this.state === 'walk' ? 1 : 0,
      run: this.state === 'run' ? 1 : 0,
      investigate: this.state === 'investigate' ? 1 : 0,
      talk: this.state === 'talk' ? 1 : 0,
      zombie: this.state === 'zombie' ? 1 : 0,
      aim: this.aiming || this.state === 'aim' ? 1 : 0,
      dead: this.state === 'dead' ? 1 : 0,
      drive: this.state === 'drive' ? 1 : 0,
    };
    for (const key of Object.keys(this.blend) as (keyof typeof this.blend)[])
      this.blend[key] += (target[key] - this.blend[key]) * k;

    const b = this.blend;
    const freq = 2 + speed * 1.6;
    const ph = this.t * freq * Math.PI;
    const stride = b.walk * 0.55 + b.run * 0.9 + b.zombie * 0.35 * Math.min(1, speed * 1.5);
    const swing = Math.sin(ph) * stride;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8 - b.investigate * 0.2;
    this.armR.rotation.x = swing * 0.8 - b.investigate * 1.3 - b.talk * (0.6 + Math.sin(this.t * 5) * 0.25);
    this.armR.rotation.z = -b.talk * 0.3;
    // zombie: arms reaching forward, lurching; aim: right arm points the gun, left arm supports
    const zArm = -1.35 + Math.sin(this.t * 3.1) * 0.12;
    this.armL.rotation.x = this.armL.rotation.x * (1 - b.zombie) + zArm * b.zombie;
    this.armR.rotation.x = this.armR.rotation.x * (1 - b.zombie) + (zArm + 0.15) * b.zombie;
    this.armR.rotation.x = this.armR.rotation.x * (1 - b.aim) + -1.5 * b.aim;
    this.armL.rotation.x = this.armL.rotation.x * (1 - b.aim) + -1.3 * b.aim;
    this.armL.rotation.z = this.armL.rotation.z * (1 - b.aim) + -0.5 * b.aim;
    this.armR.rotation.x = this.armR.rotation.x * (1 - b.drive) + -1.0 * b.drive;
    this.armL.rotation.x = this.armL.rotation.x * (1 - b.drive) + -1.0 * b.drive;
    this.armL.rotation.z = 0.05 + Math.sin(this.t * 1.6) * 0.02 * (1 - stride);
    const breathe = Math.sin(this.t * 2) * 0.012;
    this.body.position.y = Math.abs(Math.cos(ph)) * 0.06 * (b.walk + b.run * 1.4) + breathe - b.investigate * 0.18;
    this.body.rotation.x = b.run * 0.12 + b.investigate * 0.32 + b.zombie * 0.18;
    this.body.rotation.z = b.zombie * Math.sin(this.t * 1.7) * 0.12;
    this.legL.rotation.x -= b.investigate * 0.5;
    this.legR.rotation.x += b.investigate * 0.35;
    this.head.rotation.x = b.investigate * 0.3 + Math.sin(this.t * 0.7) * 0.03 - b.zombie * 0.25;
    this.head.rotation.z = b.zombie * Math.sin(this.t * 2.3) * 0.3;
    // dead: topple backwards
    this.object.rotation.x = -b.dead * Math.PI / 2;
    this.object.position.y = b.dead * 0.25;
    // driving: sit
    if (b.drive > 0.01) { this.legL.rotation.x = -1.4 * b.drive; this.legR.rotation.x = -1.4 * b.drive; this.body.position.y -= 0.45 * b.drive; }
    this.head.rotation.y = Math.sin(this.t * 0.45) * 0.15 * (1 - stride) + b.talk * Math.sin(this.t * 2.2) * 0.12;
  }
}

/**
 * Drop-in replacement for the placeholder once a real character exists:
 *   const rig = await GLBCharacter.load('models/detective.glb', { idle:'Idle', walk:'Walk', ... })
 * Uses THREE.AnimationMixer with cross-fades between clips.
 */
export class GLBCharacter implements CharacterRig {
  object: THREE.Object3D;
  meshes: THREE.Mesh[] = [];
  private mixer: THREE.AnimationMixer;
  private actions = new Map<AnimState, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;

  private constructor(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, clipMap: Partial<Record<AnimState, string>>) {
    this.object = gltf.scene;
    this.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; this.meshes.push(o as THREE.Mesh); } });
    this.mixer = new THREE.AnimationMixer(this.object);
    for (const [state, name] of Object.entries(clipMap) as [AnimState, string][]) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, name);
      if (clip) this.actions.set(state, this.mixer.clipAction(clip));
    }
    this.setState('idle');
  }

  static async load(url: string, clipMap: Partial<Record<AnimState, string>>) {
    const gltf = await new GLTFLoader().loadAsync(url);
    return new GLBCharacter(gltf, clipMap);
  }

  setState(s: AnimState) {
    const next = this.actions.get(s) ?? this.actions.get('idle');
    if (!next || next === this.current) return;
    next.reset().fadeIn(0.2).play();
    this.current?.fadeOut(0.2);
    this.current = next;
  }

  update(dt: number) { this.mixer.update(dt); }
}
