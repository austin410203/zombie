import * as THREE from 'three';
import { CollisionWorld } from './Collision';
import { box, canvasTexture, std } from './props';
import { asphalt, concreteTiles, facade, grass as grassPBR, roof as roofPBR, worldUV, type PBRSet } from './PBR';
import { Assets, type PropId } from '../assets/Assets';

export const AVES = [-102, -68, -34, 0, 34, 68, 102];          // north-south roads (x)
export const STREETS = [-136, -102, -68, -34, 0, 34, 68, 102, 136]; // east-west roads (z)
export const ROAD_HALF = 5;
export const BOUNDS = { minX: -119, maxX: 119, minZ: -153, maxZ: 153 };

const PLAZAS = new Set(['-17,17', '17,17', '-51,-17', '17,-51']);
const isPark = (cx: number, cz: number) => cz < -102 && Math.abs(cx) < 68;

function cells(lines: number[], min: number, max: number) {
  const edges = [min];
  for (const l of lines) edges.push(l - ROAD_HALF, l + ROAD_HALF);
  edges.push(max);
  const out: [number, number][] = [];
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 4) out.push([edges[i], edges[i + 1]]);
  return out;
}

// deterministic random so the city is identical every run
let seed = 20260915;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Manhattan, Day 1. Compact grid of Midtown blocks, Times Square, landmarks and Central Park. */
export class City {
  group = new THREE.Group();
  collision = new CollisionWorld();
  sun!: THREE.DirectionalLight;
  private fires: { light: THREE.PointLight; sprite: THREE.Sprite; base: number }[] = [];
  private beacons: THREE.Mesh[] = [];
  private smoke!: THREE.Points;
  private t = 0;
  helicopter!: THREE.Group;
  private rotor!: THREE.Object3D;

  private pbr: { asphalt: PBRSet; concrete: PBRSet; grass: PBRSet; roof: PBRSet; facades: PBRSet[] };

  constructor(scene: THREE.Scene, private mobile: boolean) {
    const S = mobile ? 256 : 512;
    this.pbr = { asphalt: asphalt(S), concrete: concreteTiles(S), grass: grassPBR(S), roof: roofPBR(S / 2), facades: [0, 1, 2, 3, 4].map((v) => facade(S, v)) };
    scene.add(this.group);
    scene.background = new THREE.Color(0x1a0f12);
    scene.fog = new THREE.Fog(0x2a1a1c, 30, 110);
    this.collision.bounds = { ...BOUNDS };
    this.buildGround();
    this.buildBlocks();
    this.buildStreetProps();
    this.buildLandmarks();
    this.buildPark();
    this.buildLights();
    this.buildSmoke();
  }

  // ------------------------------------------------------------------ ground
  private buildGround() {
    const W = BOUNDS.maxX * 2 + 60, D = BOUNDS.maxZ * 2 + 60;
    const a = this.pbr.asphalt;
    for (const t of [a.map, a.normalMap, a.roughnessMap]) t.repeat.set(W / 9, D / 9);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: a.map, normalMap: a.normalMap, roughnessMap: a.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.45 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true;
    this.group.add(g);

    // lane markings (dashed yellow centre lines) — merged into one instanced mesh
    const dashes: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    for (const x of AVES) for (let z = BOUNDS.minZ; z < BOUNDS.maxZ; z += 4) {
      if (STREETS.some((s) => Math.abs(s - z) < 6)) continue;
      dashes.push(m.clone().compose(new THREE.Vector3(x, 0.02, z), new THREE.Quaternion(), new THREE.Vector3(0.18, 1, 1.8)));
    }
    for (const z of STREETS) for (let x = BOUNDS.minX; x < BOUNDS.maxX; x += 4) {
      if (AVES.some((a) => Math.abs(a - x) < 6)) continue;
      dashes.push(m.clone().compose(new THREE.Vector3(x, 0.02, z), new THREE.Quaternion(), new THREE.Vector3(1.8, 1, 0.18)));
    }
    const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0xc9a227 }), dashes.length);
    dashes.forEach((d, i) => inst.setMatrixAt(i, d));
    this.group.add(inst);

    // crosswalks
    const cw: THREE.Matrix4[] = [];
    for (const x of AVES) for (const z of STREETS) {
      for (const [dx, dz, rot] of [[0, 6.5, 0], [0, -6.5, 0], [6.5, 0, 1], [-6.5, 0, 1]] as const) {
        for (let k = -3; k <= 3; k++) {
          const px = x + dx + (rot ? 0 : k * 1.3), pz = z + dz + (rot ? k * 1.3 : 0);
          cw.push(m.clone().compose(new THREE.Vector3(px, 0.021, pz), new THREE.Quaternion(), rot ? new THREE.Vector3(2.4, 1, 0.6) : new THREE.Vector3(0.6, 1, 2.4)));
        }
      }
    }
    const cwi = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0xbdbdbd, transparent: true, opacity: 0.55 }), cw.length);
    cw.forEach((d, i) => cwi.setMatrixAt(i, d));
    this.group.add(cwi);
  }

  // ------------------------------------------------------------------ buildings
  private facadeMats: THREE.MeshStandardMaterial[] = [];
  private facadeMat(variant: number) {
    if (!this.facadeMats[variant]) {
      const f = this.pbr.facades[variant];
      this.facadeMats[variant] = new THREE.MeshStandardMaterial({
        map: f.map, normalMap: f.normalMap, roughnessMap: f.roughnessMap, metalnessMap: f.metalnessMap, emissiveMap: f.emissiveMap,
        emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 1, metalness: 1, envMapIntensity: 1.1,
      });
    }
    return this.facadeMats[variant];
  }
  private roofMat?: THREE.MeshStandardMaterial;

  /** Procedural PBR tower (one material instance per building so the camera can fade it) */
  private building(x: number, z: number, w: number, d: number, h: number, variant = Math.floor(rnd() * 5)) {
    const geo = worldUV(new THREE.BoxGeometry(w, h, d), new THREE.Vector3(x, h / 2, z), 12);
    this.roofMat ??= new THREE.MeshStandardMaterial({ map: this.pbr.roof.map, normalMap: this.pbr.roof.normalMap, roughness: 0.95 });
    const mat = this.facadeMat(variant).clone();
    const roof = this.roofMat.clone();
    const mesh = new THREE.Mesh(geo, [mat, mat, roof, roof, mat, mat]);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = h < 34; mesh.receiveShadow = true;
    mesh.userData.building = true;
    this.group.add(mesh);
    // rooftop clutter (KayKit water towers / AC boxes)
    if (Assets.ready && rnd() < 0.45) {
      const wt = Assets.prop(rnd() < 0.5 ? 'watertower' : 'box_A');
      wt.scale.setScalar(3.2); wt.position.set(x + (rnd() - 0.5) * w * 0.4, h, z + (rnd() - 0.5) * d * 0.4); this.group.add(wt);
    } else if (rnd() < 0.5) this.group.add(box(Math.min(3, w * 0.3), 1.6, Math.min(3, d * 0.3), std(0x4a4a50), x + (rnd() - 0.5) * w * 0.4, h + 0.8, z + (rnd() - 0.5) * d * 0.4));
    this.collision.addBox(x, z, w, d);
    return mesh;
  }

  /** KayKit low-rise building (2×2 unit footprint) scaled to fill a lot */
  private kayBuilding(x: number, z: number, size: number, rot: number) {
    const ids: PropId[] = ['building_A', 'building_B', 'building_C', 'building_D', 'building_E', 'building_F', 'building_G', 'building_H'];
    const src = Assets.mesh(ids[Math.floor(rnd() * ids.length)]);
    const mat = src.material.clone();
    mat.roughness = 0.75; mat.envMapIntensity = 0.8;
    const mesh = new THREE.Mesh(src.geometry, mat);
    const k = size / 2;
    mesh.scale.set(k, k * (0.9 + rnd() * 0.5), k);
    mesh.rotation.y = rot;
    mesh.position.set(x, 0, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.building = true;
    this.group.add(mesh);
    this.collision.addBox(x, z, size * 0.95, size * 0.95);
  }

  private buildBlocks() {
    const c = this.pbr.concrete;
    const sidewalk = new THREE.MeshStandardMaterial({ map: c.map, normalMap: c.normalMap, roughnessMap: c.roughnessMap, roughness: 1, envMapIntensity: 0.6 });
    const curb = std(0x77777d);
    for (const [x0, x1] of cells(AVES, BOUNDS.minX, BOUNDS.maxX)) {
      for (const [z0, z1] of cells(STREETS, BOUNDS.minZ, BOUNDS.maxZ)) {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
        if (isPark(cx, cz)) continue;
        const key = `${Math.round(cx)},${Math.round(cz)}`;
        const slab = box(w, 0.16, d, sidewalk, cx, 0.08, cz, false);
        worldUV(slab.geometry, slab.position, 6);
        this.group.add(slab);
        this.group.add(box(w + 0.1, 0.18, 0.25, curb, cx, 0.09, z0, false), box(w + 0.1, 0.18, 0.25, curb, cx, 0.09, z1, false));
        if (PLAZAS.has(key) || key === '-51,85' || key === '51,-17') continue; // special blocks
        const inset = 2.6, iw = w - inset * 2, id = d - inset * 2;
        if (iw < 4 || id < 4) continue;
        // outer neighbourhoods: KayKit low-rise blocks (2×2 lots), Midtown core: PBR towers
        const core = Math.abs(cz) < 75 && Math.abs(cx) < 75;
        if (Assets.ready && !core && rnd() < 0.75) {
          const lot = Math.min(iw, id) / 2 - 0.4;
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.kayBuilding(cx + sx * (iw / 4), cz + sz * (id / 4), lot, [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(rnd() * 4)]);
          continue;
        }
        // 1–4 buildings per block
        const split = rnd();
        const hBase = Math.abs(cz) < 60 && Math.abs(cx) < 60 ? 22 : 12;
        if (split < 0.3) this.building(cx, cz, iw, id, hBase + rnd() * 28);
        else if (split < 0.65) {
          const a = iw * (0.4 + rnd() * 0.2);
          this.building(x0 + inset + a / 2, cz, a - 0.4, id, hBase + rnd() * 24);
          this.building(x0 + inset + a + (iw - a) / 2, cz, iw - a - 0.4, id, hBase * 0.6 + rnd() * 20);
        } else {
          const hw = iw / 2 - 0.3, hd = id / 2 - 0.3;
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.building(cx + sx * (hw / 2 + 0.3), cz + sz * (hd / 2 + 0.3), hw, hd, 8 + rnd() * (hBase + 14));
        }
      }
    }
  }

  // ------------------------------------------------------------------ props
  private wreckColors = [0xe0b020, 0x8a1e1e, 0x2a3a5a, 0xdedede, 0x1e1e1e, 0x3a5a3a];
  private instanced(id: PropId, mats: THREE.Matrix4[], cast = true) {
    if (!mats.length) return;
    const { geometry, material } = Assets.mesh(id);
    const im = new THREE.InstancedMesh(geometry, material, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = cast; im.receiveShadow = true;
    this.group.add(im);
  }

  private buildStreetProps() {
    const m = new THREE.Matrix4();
    const Q = (y: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), y);
    const lamps: THREE.Matrix4[] = [], pools: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [];
    for (const x of AVES) for (let z = BOUNDS.minZ + 8; z < BOUNDS.maxZ; z += 17) {
      if (STREETS.some((s) => Math.abs(s - z) < 8)) continue;
      for (const side of [-1, 1]) {
        lamps.push(m.clone().compose(new THREE.Vector3(x + side * 6.3, 0.16, z), Q(side > 0 ? -Math.PI / 2 : Math.PI / 2), new THREE.Vector3(5.5, 5.5, 5.5)));
        pools.push(m.clone().compose(new THREE.Vector3(x + side * 4.6, 0.05, z), new THREE.Quaternion(), new THREE.Vector3(7, 1, 7)));
        heads.push(m.clone().makeTranslation(x + side * 5.3, 5.1, z));
      }
    }
    if (Assets.ready) this.instanced('streetlight', lamps);
    // fake light pools on the ground (cheap "lights" that bloom nicely)
    const poolTex = canvasTexture(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,190,110,0.55)'); g.addColorStop(1, 'rgba(255,170,90,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const pool = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), pools.length);
    pools.forEach((p, i) => pool.setMatrixAt(i, p));
    this.group.add(pool);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.25, 0.75) }), heads.length);
    heads.forEach((p, i) => head.setMatrixAt(i, p));
    this.group.add(head);

    if (Assets.ready) {
      // traffic lights on intersection corners, hydrants / dumpsters / trash / benches on sidewalks
      const tl: THREE.Matrix4[] = [], hy: THREE.Matrix4[] = [], du: THREE.Matrix4[] = [], ta: THREE.Matrix4[] = [], tb: THREE.Matrix4[] = [], be: THREE.Matrix4[] = [];
      for (const x of AVES) for (const z of STREETS) {
        if (isPark(x, z - 1) && z < -102) continue;
        for (const [sx, sz, r] of [[1, 1, Math.PI], [-1, -1, 0]] as const)
          tl.push(m.clone().compose(new THREE.Vector3(x + sx * 6.2, 0.16, z + sz * 6.2), Q(r), new THREE.Vector3(5, 5, 5)));
      }
      for (let i = 0; i < 160; i++) {
        const onAve = rnd() < 0.5;
        const side = rnd() < 0.5 ? -1 : 1;
        const x = onAve ? AVES[Math.floor(rnd() * AVES.length)] + side * 6.6 : BOUNDS.minX + 8 + rnd() * (BOUNDS.maxX - BOUNDS.minX - 16);
        const z = onAve ? BOUNDS.minZ + 8 + rnd() * (BOUNDS.maxZ - BOUNDS.minZ - 16) : STREETS[Math.floor(rnd() * STREETS.length)] + side * 6.6;
        if (isPark(x, z) || !this.collision.free(x, z, 0.8)) continue;
        const k = rnd(), rot = onAve ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
        const mat = m.clone().compose(new THREE.Vector3(x, 0.16, z), Q(rot), new THREE.Vector3(4.5, 4.5, 4.5));
        if (k < 0.3) hy.push(mat); else if (k < 0.45) { du.push(mat); this.collision.addBox(x, z, 1.6, 1.6); } else if (k < 0.65) ta.push(mat); else if (k < 0.8) tb.push(mat); else be.push(mat);
      }
      this.instanced('trafficlight_A', tl); this.instanced('firehydrant', hy); this.instanced('dumpster', du);
      this.instanced('trash_A', ta); this.instanced('trash_B', tb); this.instanced('bench', be);
    }

    // abandoned / wrecked cars (static obstacles)
    for (let i = 0; i < 46; i++) {
      const onAve = rnd() < 0.5;
      const lane = (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 2);
      let x: number, z: number, rot: number;
      if (onAve) { x = AVES[Math.floor(rnd() * AVES.length)] + lane; z = BOUNDS.minZ + 10 + rnd() * (BOUNDS.maxZ - BOUNDS.minZ - 20); rot = rnd() * 0.6 - 0.3; }
      else { z = STREETS[Math.floor(rnd() * STREETS.length)] + lane; x = BOUNDS.minX + 10 + rnd() * (BOUNDS.maxX - BOUNDS.minX - 20); rot = Math.PI / 2 + rnd() * 0.6 - 0.3; }
      if (Math.hypot(x + 68, z - 108) < 14) continue; // keep the spawn clear
      if (isPark(x, z)) continue;
      const burnt = rnd() < 0.25;
      const car = this.wreck(burnt ? 0x2a2522 : this.wreckColors[Math.floor(rnd() * this.wreckColors.length)], burnt);
      car.position.set(x, 0, z); car.rotation.y = rot;
      this.group.add(car);
      const long = Math.abs(Math.cos(rot)) > 0.7;
      this.collision.addBox(x, z, long ? 1.9 : 4.2, long ? 4.2 : 1.9);
      if (burnt && this.fires.length < (this.mobile ? 3 : 6)) this.fire(x, z);
    }
    // NYPD barricades & sandbags near precinct / Times Square
    const barr = std(0x2a4aa0);
    for (const [x, z, r] of [[-6, 30, 0], [6, 30, 0], [-12, 4, 1.57], [12, 4, 1.57], [-44, 63, 0], [-58, 63, 0]] as const) {
      const b = new THREE.Group();
      b.add(box(2.4, 0.18, 0.12, barr, 0, 0.9, 0), box(2.4, 0.18, 0.12, std(0xdedede), 0, 0.6, 0), box(0.1, 1, 0.5, std(0x333333), -1, 0.5, 0), box(0.1, 1, 0.5, std(0x333333), 1, 0.5, 0));
      b.position.set(x, 0, z); b.rotation.y = r; this.group.add(b);
      this.collision.addBox(x, z, r ? 0.5 : 2.4, r ? 2.4 : 0.5);
    }
  }

  wreck(color: number, burnt = false) {
    if (Assets.ready) {
      const ids: PropId[] = ['car_sedan', 'car_hatchback', 'car_stationwagon', 'car_taxi', 'car_sedan'];
      const car = Assets.prop(ids[Math.floor(rnd() * ids.length)], burnt);
      if (burnt) car.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mm?.isMeshStandardMaterial) { mm.color.multiplyScalar(0.18); mm.roughness = 0.95; } });
      car.scale.setScalar(4.7);
      const g = new THREE.Group(); g.add(car);
      return g;
    }
    const g = new THREE.Group();
    const body = std(color, { metalness: 0.4, roughness: 0.5 });
    g.add(box(1.8, 0.6, 4.0, body, 0, 0.55, 0), box(1.6, 0.55, 2.0, body, 0, 1.1, -0.2), box(1.62, 0.42, 1.9, std(0x101418, { metalness: 0.8, roughness: 0.1 }), 0, 1.12, -0.2, false));
    for (const [x, z] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), std(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, z); g.add(w);
    }
    return g;
  }

  private fire(x: number, z: number) {
    const tex = canvasTexture(64, 64, (c) => {
      const g = c.createRadialGradient(32, 40, 2, 32, 36, 30);
      g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.35, 'rgba(255,140,40,0.9)'); g.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(x, 1.8, z); s.scale.set(3, 3.5, 1);
    const light = new THREE.PointLight(0xff7a2a, 30, 16, 1.6);
    light.position.set(x, 2.5, z);
    this.group.add(s, light);
    this.fires.push({ light, sprite: s, base: 30 });
  }

  // ------------------------------------------------------------------ landmarks
  private sign(text: string, w: number, h: number, bg: string, fg: string, font = 'bold 64px Impact, Arial Black, sans-serif') {
    const tex = canvasTexture(512, Math.round(512 * (h / w)), (c) => {
      c.fillStyle = bg; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
      c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = fg; c.shadowBlur = 18;
      const lines = text.split('\n');
      lines.forEach((l, i) => c.fillText(l, 256, (c.canvas.height / (lines.length + 1)) * (i + 1)));
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  }

  private buildLandmarks() {
    // ---- Times Square: plaza with towering billboards
    const ads: [string, string, string][] = [
      ['NEON COLA', '#d6102a', '#fff'], ['BROADWAY\nTONIGHT', '#1a1a40', '#ffd23a'], ['STAY INDOORS\nEMERGENCY ALERT', '#000', '#ff3b2f'],
      ['QUANTUM\nPHONE 9', '#0a0a0a', '#4fd8ff'], ['NYC 2026', '#ffd23a', '#111'], ['EVACUATE\nCENTRAL PARK', '#000', '#7dff4a'],
    ];
    const spots: [number, number, number][] = [[-27, 6, Math.PI / 2], [-27, 28, Math.PI / 2], [27, 6, -Math.PI / 2], [27, 28, -Math.PI / 2], [-10, 40, Math.PI], [10, 40, Math.PI]];
    spots.forEach(([x, z, r], i) => {
      const [txt, bg, fg] = ads[i];
      const b = this.sign(txt, 9, 6, bg, fg);
      b.position.set(x, 10, z); b.rotation.y = r; this.group.add(b);
      this.group.add(box(0.4, 7, 0.4, std(0x222222), x, 3.5, z));
      this.collision.addBox(x, z, 0.6, 0.6);
    });
    // red steps (TKTS-style bleachers, original)
    const steps = new THREE.Group();
    for (let i = 0; i < 5; i++) steps.add(box(8, 0.4, 1.2, std(0xb3121e, { roughness: 0.4 }), 0, 0.2 + i * 0.4, -i * 1.2));
    steps.position.set(-17, 0, 24); this.group.add(steps);
    this.collision.addBox(-17, 21.6, 8, 6);

    // ---- 14th Precinct
    const pre = this.building(-51, 87, 16, 14, 14, 2);
    (pre.material as THREE.Material[]).forEach((m) => ((m as THREE.MeshStandardMaterial).emissiveIntensity = 0.35));
    const ps = this.sign('NYPD\n14TH PRECINCT', 10, 3.2, '#0d2a6a', '#ffffff', 'bold 54px Arial, sans-serif');
    ps.position.set(-51, 8, 79.9); ps.rotation.y = Math.PI; this.group.add(ps);
    for (const x of [-56, -46]) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a6aff })); lamp.position.set(x, 4, 79.6); this.group.add(lamp); this.beacons.push(lamp); }

    // ---- Midtown Clinic
    this.building(51, -19, 18, 14, 16, 1);
    const cross = this.sign('+', 4, 4, '#ffffff', '#e01a1a', 'bold 400px Arial, sans-serif');
    cross.position.set(51, 10, -11.9); this.group.add(cross);
    const cs = this.sign('MIDTOWN CLINIC', 12, 1.6, '#e01a1a', '#ffffff', 'bold 48px Arial, sans-serif');
    cs.position.set(51, 5, -11.9); this.group.add(cs);

    // ---- Bryant Park CDC field lab (tents)
    for (const [x, z] of [[-57, -22], [-45, -22], [-51, -10]]) {
      const tent = new THREE.Group();
      tent.add(box(6, 2.6, 4.5, std(0xe8e8e0), 0, 1.3, 0));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3.6, 1.4, 4), std(0xd8d8d0)); top.position.y = 3.3; top.rotation.y = Math.PI / 4; tent.add(top);
      tent.position.set(x, 0, z); this.group.add(tent);
      this.collision.addBox(x, z, 6, 4.5);
    }
    const lab = this.sign('CDC FIELD LAB', 8, 1.4, '#103a7a', '#ffffff', 'bold 50px Arial, sans-serif');
    lab.position.set(-51, 3.4, -7.7); this.group.add(lab);

    // ---- Empire relay antenna
    const tower = new THREE.Group();
    tower.add(box(5, 1.2, 5, std(0x3a3a40), 0, 0.6, 0));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.4, 22, 4, 6, true), new THREE.MeshStandardMaterial({ color: 0xb0b0b8, wireframe: true }));
    mast.position.y = 12; tower.add(mast);
    for (const y of [6, 12, 18]) { const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.3, 0.4, 10), std(0xdedede)); dish.position.set(0.8, y, 0); dish.rotation.z = Math.PI / 2; tower.add(dish); }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tip.position.y = 23.4; tower.add(tip); this.beacons.push(tip);
    tower.position.set(17, 0, -51); this.group.add(tower);
    this.collision.addBox(17, -51, 5, 5);
  }

  private buildPark() {
    const gp = this.pbr.grass;
    for (const t of [gp.map, gp.normalMap, gp.roughnessMap]) { t.repeat.set(126 / 8, 51 / 8); }
    const park = new THREE.Mesh(new THREE.PlaneGeometry(126, 51), new THREE.MeshStandardMaterial({ map: gp.map, normalMap: gp.normalMap, roughnessMap: gp.roughnessMap, roughness: 1, envMapIntensity: 0.5 }));
    park.rotation.x = -Math.PI / 2; park.position.set(0, 0.03, -127.5); park.receiveShadow = true;
    this.group.add(park);
    // stone wall around park (south edge, with gaps for avenues)
    for (const [a, b] of [[-63, -39], [-29, -5], [5, 29], [39, 63]]) {
      this.group.add(box(b - a, 1, 0.6, std(0x6a6258), (a + b) / 2, 0.5, -102 + 5.5));
      this.collision.addBox((a + b) / 2, -96.5, b - a, 0.6);
    }
    // trees (instanced)
    const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    for (let i = 0; i < 110; i++) {
      const x = -60 + rnd() * 120, z = -150 + rnd() * 44;
      if (Math.abs(x) < 14 && z < -108) continue; // keep helipad clearing open
      if (AVES.some((a) => Math.abs(a - x) < 6) || STREETS.some((s) => Math.abs(s - z) < 6)) continue;
      const s = 0.8 + rnd() * 0.7;
      trunks.push(m.clone().compose(new THREE.Vector3(x, 1.2 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)));
      crowns.push(m.clone().compose(new THREE.Vector3(x, 3.4 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), new THREE.Vector3(s, s * 1.2, s)));
      this.collision.circles.push({ x, z, r: 0.5 * s });
    }
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6), std(0x3a2618), trunks.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 0), std(0x2c4a22), crowns.length);
    trunks.forEach((t, i) => trunk.setMatrixAt(i, t)); crowns.forEach((t, i) => crown.setMatrixAt(i, t));
    trunk.castShadow = crown.castShadow = true;
    this.group.add(trunk, crown);
    // pond
    const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 24), std(0x0e1e2a, { metalness: 0.8, roughness: 0.1 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(-40, 0.05, -125); this.group.add(pond);
    this.collision.circles.push({ x: -40, z: -125, r: 8.6 });
    // helipad
    const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({
      map: canvasTexture(256, 256, (c) => {
        c.fillStyle = '#2a2a2e'; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ffd23a'; c.lineWidth = 10; c.beginPath(); c.arc(128, 128, 110, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#ffffff'; c.font = 'bold 150px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 136);
      }),
    }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.06, -140); this.group.add(pad);
    // evac helicopter (appears at the end)
    this.helicopter = new THREE.Group();
    const hb = std(0x3a4a2a);
    this.helicopter.add(box(2.4, 2.2, 6, hb, 0, 1.6, 0), box(0.6, 0.6, 5, hb, 0, 2.2, 5), box(0.1, 1.6, 1.2, hb, 0, 2.8, 7.4));
    this.helicopter.add(box(2.2, 1.0, 1.6, std(0x0d1820, { metalness: 0.8, roughness: 0.1 }), 0, 2.0, -2.6));
    this.helicopter.add(box(0.15, 0.15, 6, std(0x222222), -1.3, 0.2, 0), box(0.15, 0.15, 6, std(0x222222), 1.3, 0.2, 0));
    this.rotor = new THREE.Group();
    this.rotor.add(box(12, 0.08, 0.4, std(0x111111), 0, 0, 0), box(0.4, 0.08, 12, std(0x111111), 0, 0, 0));
    this.rotor.position.y = 3.0; this.helicopter.add(this.rotor);
    this.helicopter.position.set(0, 40, -140);
    this.helicopter.visible = false;
    this.group.add(this.helicopter);
  }

  // ------------------------------------------------------------------ light & atmosphere
  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0x8a7aa8, 0x2a1a14, 1.4));
    this.group.add(new THREE.AmbientLight(0x3a2a30, 0.8));
    this.sun = new THREE.DirectionalLight(0xff9a6a, 2.2); // burning dusk
    this.sun.castShadow = true;
    const s = this.mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(s, s);
    const c = this.sun.shadow.camera;
    c.left = -40; c.right = 40; c.top = 40; c.bottom = -40; c.near = 1; c.far = 160;
    this.sun.shadow.bias = -0.0015; this.sun.shadow.normalBias = 0.05;
    this.group.add(this.sun, this.sun.target);
  }

  private buildSmoke() {
    const n = this.mobile ? 120 : 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (rnd() - 0.5) * 60; pos[i * 3 + 1] = rnd() * 12; pos[i * 3 + 2] = (rnd() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.smoke = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffb080, size: 0.08, transparent: true, opacity: 0.6, depthWrite: false }));
    this.group.add(this.smoke);
  }

  /** Is (x,z) free of buildings/obstacles (used for spawning)? */
  isOpen(x: number, z: number, r = 0.6) { return this.collision.free(x, z, r); }

  update(dt: number, focus: THREE.Vector3) {
    this.t += dt;
    // shadow camera follows the player so shadows stay crisp in a big city
    this.sun.position.set(focus.x - 30, 60, focus.z + 18);
    this.sun.target.position.set(focus.x, 0, focus.z);
    for (const f of this.fires) {
      const k = 0.85 + Math.sin(this.t * 9 + f.base) * 0.08 + Math.sin(this.t * 23) * 0.05;
      f.light.intensity = f.base * k;
      f.sprite.scale.set(3 * k, 3.6 * k, 1);
    }
    for (const b of this.beacons) b.visible = Math.sin(this.t * 4 + b.position.x) > 0;
    // drifting embers around the player
    this.smoke.position.set(focus.x, 0, focus.z);
    const p = this.smoke.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * 0.6; if (y > 12) y = 0; p.setY(i, y); }
    p.needsUpdate = true;
    if (this.helicopter.visible) this.rotor.rotation.y += dt * 25;
  }
}
