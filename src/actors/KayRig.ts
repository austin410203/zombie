import * as THREE from 'three';
import { Assets, type CharacterId } from '../assets/Assets';
import { Humanoid, type AnimState, type HumanoidOptions } from './Humanoid';

export type Action = 'punch' | 'slam' | 'hit' | 'throw' | 'cast' | 'spawn' | 'shoot';

/** What the game needs from any character visual (procedural or GLB). */
export interface Rig {
  object: THREE.Object3D;
  hand: THREE.Object3D;
  aiming: boolean;
  twoHanded?: boolean;
  setState(s: AnimState): void;
  update(dt: number, speed: number): void;
  act?(a: Action): void;
}

const ACTION_CLIP: Record<Action, string> = {
  punch: 'Unarmed_Melee_Attack_Punch_A', slam: '2H_Melee_Attack_Chop', hit: 'Hit_A', throw: 'Throw',
  cast: 'Spellcast_Shoot', spawn: 'Skeletons_Awaken_Floor', shoot: '1H_Ranged_Shooting',
};

interface KayOptions { walk: string; run: string; idle?: string; walkSpeed?: number; tint?: number; emissive?: number }

/** Skinned KayKit character driven by the shared animation library. */
export class KayRig implements Rig {
  object: THREE.Object3D;
  hand = new THREE.Group();
  aiming = false;
  twoHanded = false;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private state: AnimState = 'idle';
  private loop?: THREE.AnimationAction;
  private oneShot?: THREE.AnimationAction;
  private loopName = '';

  constructor(id: CharacterId, height: number, private o: KayOptions) {
    this.object = Assets.character(id, height);
    if (o.tint !== undefined || o.emissive !== undefined) {
      const tint = new THREE.Color(o.tint ?? 0xffffff);
      this.object.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiply(tint);
        if (o.emissive !== undefined) { mat.emissive.setHex(o.emissive); mat.emissiveIntensity = 0.35; mat.userData.baseEmissive = mat.emissive.clone(); }
        m.material = mat;
      });
    }
    // gun socket on the right hand slot bone
    const slot = this.object.getObjectByName('handslot.r') ?? this.object.getObjectByName('hand.r');
    if (slot) {
      const inv = 1 / this.object.scale.x; // undo character scale so guns keep world size
      this.hand.scale.setScalar(inv);
      this.hand.rotation.set(0, 0, 0);
      slot.add(this.hand);
    }
    this.mixer = new THREE.AnimationMixer(this.object);
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.oneShot) { this.oneShot.fadeOut(0.15); this.oneShot = undefined; this.loop?.reset().fadeIn(0.15).play(); }
    });
    this.play(o.idle ?? 'Idle');
  }

  private action(name: string) {
    let a = this.actions.get(name);
    if (!a) {
      const clip = Assets.clips.get(name);
      if (!clip) return undefined;
      a = this.mixer.clipAction(clip);
      this.actions.set(name, a);
    }
    return a;
  }

  private play(name: string, fade = 0.2) {
    if (name === this.loopName) return;
    const a = this.action(name);
    if (!a) return;
    const once = name.startsWith('Death') || name === 'Lie_Idle';
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.loop && !this.oneShot) a.crossFadeFrom(this.loop, fade, false);
    a.play();
    this.loop = a;
    this.loopName = name;
  }

  setState(s: AnimState) {
    this.state = s;
    const o = this.o;
    const aimClip = this.twoHanded ? '2H_Ranged_Aiming' : '1H_Ranged_Aiming';
    const map: Record<AnimState, string> = {
      idle: this.aiming ? aimClip : o.idle ?? 'Idle', walk: o.walk, run: o.run, zombie: o.walk, aim: aimClip,
      talk: 'Cheer', investigate: 'Interact', dead: Math.random() < 0.5 ? 'Death_A' : 'Death_B', drive: 'Sit_Chair_Idle',
    };
    if (s === 'dead' && this.loopName.startsWith('Death')) return;
    if (s === 'dead' && this.oneShot) { this.oneShot.stop(); this.oneShot = undefined; }
    this.play(map[s]);
  }

  act(a: Action) {
    if (this.state === 'dead') return;
    const act = this.action(ACTION_CLIP[a]);
    if (!act) return;
    if (this.oneShot && this.oneShot !== act) this.oneShot.stop();
    act.reset().setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = false;
    act.setEffectiveTimeScale(a === 'spawn' ? 1.6 : 1.3);
    act.fadeIn(0.08).play();
    this.loop?.fadeOut(0.08);
    this.oneShot = act;
  }

  update(dt: number, speed: number) {
    // keep foot speed roughly matched to movement
    if (this.loop && (this.state === 'walk' || this.state === 'zombie' || this.state === 'run')) {
      this.loop.setEffectiveTimeScale(Math.max(0.4, Math.min(1.8, speed * (this.o.walkSpeed ?? 1))));
    } else this.loop?.setEffectiveTimeScale(1);
    this.mixer.update(dt);
  }
}

export type RigKind = 'player' | 'walker' | 'runner' | 'brute' | 'spitter' | 'boss' | 'survivor';

let variant = 0;
/** Pick the GLB character for a role, falling back to the procedural rig if assets failed to load. */
export function makeRig(kind: RigKind, fallback: HumanoidOptions): Rig {
  if (!Assets.ready) return new Humanoid(fallback);
  const infected = 0x88b070; // sickly green-grey skin tint
  switch (kind) {
    case 'player': return new KayRig('player', 1.95, { walk: 'Walking_A', run: 'Running_A', walkSpeed: 0.55 });
    case 'walker': {
      const pool: CharacterId[] = ['z_barbarian', 'z_knight', 'z_minion', 'z_barbarian', 'z_knight'];
      const id = pool[variant++ % pool.length];
      return new KayRig(id, 1.85 + Math.random() * 0.15, { walk: 'Walking_C', run: 'Running_B', idle: 'Unarmed_Idle', walkSpeed: 0.75, tint: id === 'z_minion' ? 0xd8e8c0 : infected });
    }
    case 'runner': return new KayRig('z_rogue', 1.8, { walk: 'Running_B', run: 'Running_B', idle: 'Unarmed_Idle', walkSpeed: 0.3, tint: infected });
    case 'spitter': return new KayRig('z_mage', 1.9, { walk: 'Walking_B', run: 'Walking_B', idle: 'Idle', walkSpeed: 0.7, tint: 0xb0e080, emissive: 0x2a5a00 });
    case 'brute': return new KayRig('z_warrior', 2.9, { walk: 'Walking_C', run: 'Walking_C', idle: 'Idle', walkSpeed: 0.55, tint: 0xc8d0b0 });
    case 'boss': return new KayRig('z_warrior', 6.5, { walk: 'Walking_C', run: 'Walking_C', idle: 'Idle', walkSpeed: 0.35, tint: 0xd08080, emissive: 0x3a0000 });
    case 'survivor': return new KayRig((['z_knight', 'z_mage', 'z_rogue'] as CharacterId[])[variant++ % 3], 1.85, { walk: 'Walking_A', run: 'Running_A' });
  }
}
