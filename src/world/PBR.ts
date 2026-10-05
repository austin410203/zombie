import * as THREE from 'three';

/**
 * Procedurally generated, tileable PBR texture sets (albedo / normal / roughness / metalness / emissive).
 * Generated once at startup on a canvas — no image downloads needed.
 */
export interface PBRSet {
  map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture;
  metalnessMap?: THREE.Texture; emissiveMap?: THREE.Texture;
}

let seed = 1337;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Tileable value-noise FBM */
function makeNoise(period: number) {
  const g = new Float32Array(period * period).map(() => rand());
  const at = (x: number, y: number) => g[((y % period + period) % period) * period + ((x % period + period) % period)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
function fbm(size: number, base: number, octaves = 5) {
  const out = new Float32Array(size * size);
  const ns = Array.from({ length: octaves }, (_, o) => makeNoise(base << o));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < octaves; o++) { const f = (base << o) / size; v += ns[o](x * f, y * f) * amp; tot += amp; amp *= 0.5; }
    out[y * size + x] = v / tot;
  }
  return out;
}

function tex(size: number, fill: (img: Uint8ClampedArray) => void, color = false) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const id = ctx.createImageData(size, size);
  fill(id.data);
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  return t;
}

/** Height field → tangent-space normal map (tileable Sobel) */
function normalFrom(h: Float32Array, size: number, strength: number) {
  return tex(size, (d) => {
    const H = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x - 1, y) - H(x - 1, y + 1)) * strength;
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1) - H(x - 1, y - 1) - 2 * H(x, y - 1) - H(x + 1, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255; d[i + 1] = (dy / len * 0.5 + 0.5) * 255; d[i + 2] = (1 / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
}
const gray = (v: Float32Array, size: number, f: (x: number, i: number) => number) =>
  tex(size, (d) => { for (let i = 0; i < size * size; i++) { const g = Math.max(0, Math.min(255, f(v[i], i) * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g; d[i * 4 + 3] = 255; } });

// ------------------------------------------------------------------ materials

export function asphalt(size: number): PBRSet {
  const n = fbm(size, 8), grain = fbm(size, 64, 2), stain = fbm(size, 3, 3);
  const h = new Float32Array(size * size);
  const crack = new Uint8Array(size * size);
  // a few wandering cracks
  for (let c = 0; c < 5; c++) {
    let x = rand() * size, y = rand() * size, a = rand() * Math.PI * 2;
    for (let s = 0; s < size * 0.7; s++) {
      a += (rand() - 0.5) * 0.5; x += Math.cos(a); y += Math.sin(a);
      crack[((Math.floor(y) % size + size) % size) * size + ((Math.floor(x) % size + size) % size)] = 1;
    }
  }
  for (let i = 0; i < size * size; i++) h[i] = n[i] * 0.4 + grain[i] * 0.6 - crack[i] * 0.8;
  return {
    map: tex(size, (d) => {
      for (let i = 0; i < size * size; i++) {
        const oil = Math.max(0, stain[i] - 0.58) * 2.5;
        const v = (0.16 + grain[i] * 0.1 + n[i] * 0.05) * (1 - oil * 0.5) * (crack[i] ? 0.4 : 1);
        d[i * 4] = v * 255; d[i * 4 + 1] = v * 250; d[i * 4 + 2] = v * 245; d[i * 4 + 3] = 255;
      }
    }, true),
    normalMap: normalFrom(h, size, 2.2),
    roughnessMap: gray(stain, size, (s, i) => (s > 0.62 ? 0.5 : 0.93 - grain[i] * 0.08)), // oily / wet patches are glossy
  };
}

export function concreteTiles(size: number, tiles = 4): PBRSet {
  const n = fbm(size, 8), grain = fbm(size, 64, 2);
  const tile = size / tiles;
  const joint = (i: number) => { const x = i % size, y = Math.floor(i / size); return (x % tile < 2 || y % tile < 2) ? 1 : 0; };
  const shade = new Float32Array(tiles * tiles).map(() => 0.9 + rand() * 0.15);
  const h = new Float32Array(size * size).map((_, i) => grain[i] * 0.3 + n[i] * 0.2 - joint(i) * 0.8);
  return {
    map: tex(size, (d) => {
      for (let i = 0; i < size * size; i++) {
        const x = i % size, y = Math.floor(i / size);
        const v = (0.42 + grain[i] * 0.12 - n[i] * 0.12) * shade[Math.floor(y / tile) * tiles + Math.floor(x / tile)] * (joint(i) ? 0.55 : 1);
        d[i * 4] = v * 255; d[i * 4 + 1] = v * 252; d[i * 4 + 2] = v * 246; d[i * 4 + 3] = 255;
      }
    }, true),
    normalMap: normalFrom(h, size, 3),
    roughnessMap: gray(grain, size, (g) => 0.82 + g * 0.15),
  };
}

export function grass(size: number): PBRSet {
  const n = fbm(size, 6), blades = fbm(size, 96, 2);
  const h = new Float32Array(size * size).map((_, i) => blades[i] * 0.8 + n[i] * 0.2);
  return {
    map: tex(size, (d) => {
      for (let i = 0; i < size * size; i++) {
        const dry = Math.max(0, n[i] - 0.55) * 2;
        d[i * 4] = (0.1 + dry * 0.18 + blades[i] * 0.06) * 255; d[i * 4 + 1] = (0.22 + blades[i] * 0.14 - dry * 0.04) * 255; d[i * 4 + 2] = (0.08 + dry * 0.05) * 255; d[i * 4 + 3] = 255;
      }
    }, true),
    normalMap: normalFrom(h, size, 2.5),
    roughnessMap: gray(blades, size, (b) => 0.85 + b * 0.12),
  };
}

export function roof(size: number): PBRSet {
  const g = fbm(size, 48, 2), n = fbm(size, 6);
  return {
    map: gray(g, size, (v, i) => 0.12 + v * 0.1 + n[i] * 0.05),
    normalMap: normalFrom(g, size, 2),
    roughnessMap: gray(g, size, () => 0.95),
  };
}

/**
 * Building façade: `cols`×`rows` windows per tile. Variants: 0 brick, 1 glass curtain wall, 2 limestone, 3 dark glass, 4 red brick.
 * Includes lit windows in the emissive map and glossy/metal glass in roughness/metalness.
 */
export function facade(size: number, variant: number): PBRSet {
  const cols = 4, rows = 4, cw = size / cols, rh = size / rows;
  const glass = variant === 1 || variant === 3;
  const wallCol = [[0.36, 0.2, 0.15], [0.32, 0.38, 0.44], [0.55, 0.5, 0.42], [0.12, 0.14, 0.18], [0.42, 0.16, 0.12]][variant];
  const lit = new Float32Array(cols * rows).map(() => rand());
  const tintLit = [[1, 0.8, 0.45], [0.6, 0.85, 1], [1, 0.85, 0.55], [0.55, 0.75, 1], [1, 0.55, 0.35]][variant];
  const n = fbm(size, 8), grain = fbm(size, 64, 2);
  const win = (x: number, y: number) => {
    const fx = (x % cw) / cw, fy = (y % rh) / rh;
    return glass ? (fx > 0.06 && fx < 0.94 && fy > 0.12 && fy < 0.92) : (fx > 0.22 && fx < 0.78 && fy > 0.2 && fy < 0.78);
  };
  const cell = (x: number, y: number) => Math.floor(y / rh) * cols + Math.floor(x / cw);
  const brick = variant === 0 || variant === 4;
  const mortar = (x: number, y: number) => brick && ((y % 8 < 1) || ((x + (Math.floor(y / 8) % 2) * 8) % 16 < 1));
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    h[i] = win(x, y) ? -0.6 : (mortar(x, y) ? -0.3 : grain[i] * 0.2);
  }
  return {
    map: tex(size, (d) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = y * size + x, k = i * 4;
        if (win(x, y)) { const s = lit[cell(x, y)] < 0.22 ? 0.35 : 0.06; d[k] = s * 120; d[k + 1] = s * 140; d[k + 2] = s * 170 + 15; }
        else { const m = mortar(x, y) ? 0.6 : 1; const v = (0.85 + n[i] * 0.3 + grain[i] * 0.15) * m; d[k] = wallCol[0] * v * 255; d[k + 1] = wallCol[1] * v * 255; d[k + 2] = wallCol[2] * v * 255; }
        d[k + 3] = 255;
      }
    }, true),
    emissiveMap: tex(size, (d) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const k = (y * size + x) * 4, c = cell(x, y);
        const on = win(x, y) && lit[c] < 0.22 ? 1 : win(x, y) && lit[c] < 0.27 ? 0.35 : 0;
        const fl = on * (0.75 + n[y * size + x] * 0.5);
        d[k] = tintLit[0] * fl * 255; d[k + 1] = tintLit[1] * fl * 255; d[k + 2] = tintLit[2] * fl * 255; d[k + 3] = 255;
      }
    }, true),
    normalMap: normalFrom(h, size, 3),
    roughnessMap: tex(size, (d) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const k = (y * size + x) * 4; const v = win(x, y) ? 0.06 : 0.85 - grain[y * size + x] * 0.1; d[k] = d[k + 1] = d[k + 2] = v * 255; d[k + 3] = 255; } }),
    metalnessMap: tex(size, (d) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const k = (y * size + x) * 4; const v = win(x, y) ? 0.8 : glass ? 0.3 : 0; d[k] = d[k + 1] = d[k + 2] = v * 255; d[k + 3] = 255; } }),
  };
}

/** World-space planar UVs so textures keep a constant scale on any box size. */
export function worldUV(geo: THREE.BufferGeometry, offset: THREE.Vector3, scale: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x, y = pos.getY(i) + offset.y, z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const [u, v] = ny > 0.5 ? [x, z] : nx > 0.5 ? [z, y] : [x, y];
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
