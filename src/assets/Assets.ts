import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * CC0 models: KayKit (Kay Lousberg) City Builder Bits, Adventurers & Skeletons packs; Kenney Racing kit.
 * Built into /public/models by scripts/prepare-assets.mjs.
 */
export const CHARACTERS = ['player', 'z_barbarian', 'z_knight', 'z_rogue', 'z_mage', 'z_warrior', 'z_minion'] as const;
export const PROPS = ['car_taxi', 'car_police', 'car_sedan', 'car_hatchback', 'car_stationwagon', 'motorcycle', 'streetlight', 'trafficlight_A',
  'firehydrant', 'dumpster', 'trash_A', 'trash_B', 'bench', 'box_A', 'box_B', 'bush', 'watertower',
  'building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'] as const;
export type CharacterId = (typeof CHARACTERS)[number];
export type PropId = (typeof PROPS)[number];

const HIDE = /crossbow|knife|throwable|axe|sword|shield|staff|wand|spellbook|mug|blade|quiver|arrow|smokebomb/i;

class AssetStore {
  ready = false;
  clips = new Map<string, THREE.AnimationClip>();
  private chars = new Map<string, { scene: THREE.Object3D; height: number }>();
  private props = new Map<string, THREE.Object3D>();

  async load(onProgress: (p: number) => void) {
    const loader = new GLTFLoader();
    const base = `${import.meta.env.BASE_URL}models/`;
    const files = ['anims', ...CHARACTERS, ...PROPS];
    let done = 0;
    const one = async (name: string) => {
      const g: GLTF = await loader.loadAsync(`${base}${name}.glb`);
      done++; onProgress(done / files.length);
      return g;
    };
    const results = await Promise.all(files.map((f) => one(f).then((g) => [f, g] as const)));
    for (const [name, g] of results) {
      if (name === 'anims') { for (const c of g.animations) this.clips.set(c.name, c); continue; }
      if ((CHARACTERS as readonly string[]).includes(name)) {
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && HIDE.test(o.name)) o.visible = false;
          if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = true; (o as THREE.Mesh).frustumCulled = false; }
        });
        const box = new THREE.Box3();
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) box.expandByObject(o); });
        this.chars.set(name, { scene: g.scene, height: box.max.y - box.min.y });
      } else {
        g.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.props.set(name, g.scene);
      }
    }
    this.ready = true;
  }

  /** Skinned character clone, scaled to `height` world units */
  character(id: CharacterId, height: number) {
    const src = this.chars.get(id)!;
    const obj = SkeletonUtils.clone(src.scene);
    obj.scale.setScalar(height / src.height);
    return obj;
  }

  /** Static prop clone (materials shared unless `uniqueMaterials`) */
  prop(id: PropId, uniqueMaterials = false) {
    const o = this.props.get(id)!.clone(true);
    if (uniqueMaterials) o.traverse((m) => { const mesh = m as THREE.Mesh; if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone(); });
    return o;
  }

  /** First mesh of a prop — for InstancedMesh / shared-geometry use */
  mesh(id: PropId) {
    let found: THREE.Mesh | null = null;
    this.props.get(id)!.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
    const m = found! as THREE.Mesh;
    m.updateWorldMatrix(true, false);
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    return { geometry: geo, material: m.material as THREE.MeshStandardMaterial };
  }

  has(id: string) { return this.props.has(id) || this.chars.has(id); }
}

export const Assets = new AssetStore();
