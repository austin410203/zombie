import * as THREE from 'three';

export const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...opts });

export function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** Build the 3D prop for an evidence item. Returned group is placed at the evidence position. */
export function evidenceProp(kind: string): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'book': {
      g.add(box(0.7, 0.06, 0.5, std(0x3b2a1e), 0, 0, 0));
      const pages = box(0.66, 0.02, 0.46, std(0xe8dfc8, { flatShading: false }), 0, 0.04, 0);
      pages.material = std(0xe8dfc8, {
        map: canvasTexture(128, 96, (c) => {
          c.fillStyle = '#e8dfc8'; c.fillRect(0, 0, 128, 96);
          c.strokeStyle = '#6b5a48'; c.lineWidth = 1;
          for (let y = 12; y < 96; y += 9) { c.beginPath(); c.moveTo(8, y); c.lineTo(58, y); c.moveTo(70, y); c.lineTo(120, y); c.stroke(); }
          c.strokeStyle = '#13265a'; c.lineWidth = 3; c.beginPath(); c.moveTo(72, 58); c.lineTo(118, 58); c.stroke();
        }),
      });
      g.add(pages);
      g.add(box(0.02, 0.2, 0.02, std(0x111111), 0.25, 0.1, 0.15)); // pen
      break;
    }
    case 'notebook': {
      g.add(box(0.36, 0.05, 0.48, std(0xa3161c, { roughness: 0.5, emissive: 0x2a0000 }), 0, 0, 0));
      g.add(box(0.02, 0.04, 0.48, std(0x1a1a1a), -0.17, 0.005, 0));
      break;
    }
    case 'phone': {
      g.add(box(0.16, 0.025, 0.32, std(0x0b0b0e, { metalness: 0.6, roughness: 0.3 }), 0, 0, 0));
      g.add(box(0.14, 0.005, 0.28, new THREE.MeshBasicMaterial({ color: 0x4fb6ff }), 0, 0.016, 0, false));
      break;
    }
    case 'clock': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 12), std(0x8c7a5a, { metalness: 0.5, roughness: 0.4 }));
      body.rotation.x = Math.PI / 2 - 0.25; body.rotation.z = 0.6; body.position.y = 0.1;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 16), std(0xf2ecd8, {
        map: canvasTexture(64, 64, (c) => {
          c.fillStyle = '#f2ecd8'; c.fillRect(0, 0, 64, 64);
          c.strokeStyle = '#111'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + 12 * Math.cos(-Math.PI / 2 + (3.28 / 12) * Math.PI * 2), 32 + 12 * Math.sin(-Math.PI / 2 + (3.28 / 12) * Math.PI * 2)); c.stroke();
          c.lineWidth = 2; c.beginPath(); c.moveTo(32, 32); c.lineTo(32 + 20 * Math.cos(-Math.PI / 2 + (17 / 60) * Math.PI * 2), 32 + 20 * Math.sin(-Math.PI / 2 + (17 / 60) * Math.PI * 2)); c.stroke();
          c.strokeStyle = '#555'; c.lineWidth = 1; c.beginPath(); c.moveTo(10, 14); c.lineTo(30, 30); c.lineTo(52, 22); c.moveTo(30, 30); c.lineTo(40, 54); c.stroke();
        }),
      }));
      face.position.y = 0.046; face.rotation.x = -Math.PI / 2;
      body.add(face);
      g.add(body);
      for (let i = 0; i < 5; i++) {
        const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.03 + Math.random() * 0.03), std(0xcfe3ff, { transparent: true, opacity: 0.7, metalness: 0.8 }));
        shard.position.set((Math.random() - 0.5) * 0.7, 0.01, (Math.random() - 0.5) * 0.7);
        g.add(shard);
      }
      break;
    }
    case 'terminal': {
      g.add(box(0.7, 0.45, 0.06, std(0x15181f, { metalness: 0.4 }), 0, 0.25, 0));
      const screen = box(0.62, 0.37, 0.01, new THREE.MeshBasicMaterial({
        map: canvasTexture(128, 80, (c) => {
          c.fillStyle = '#061018'; c.fillRect(0, 0, 128, 80);
          c.fillStyle = '#0f3'; c.globalAlpha = 0.18;
          for (let y = 0; y < 80; y += 3) c.fillRect(0, y, 128, 1);
          c.globalAlpha = 1; c.fillStyle = '#5fe3c0'; c.font = '9px monospace';
          c.fillText('CAM 3F-ELEV', 6, 12); c.fillText('03:06:41  ●REC', 6, 24);
          c.fillStyle = '#2a4a55'; c.fillRect(30, 34, 40, 38);
          c.fillStyle = '#9ad'; c.fillRect(46, 38, 10, 10); c.fillRect(43, 48, 16, 22);
        }),
      }), 0, 0.25, 0.035, false);
      g.add(screen);
      g.add(box(0.14, 0.04, 0.2, std(0x15181f), 0, 0.02, -0.05));
      g.add(box(0.5, 0.02, 0.18, std(0x222630), 0, 0.01, 0.25));
      g.rotation.y = Math.PI;
      break;
    }
    case 'bin': {
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.55, 10, 1, true), std(0x3a3d44, { metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }));
      bin.position.y = -0.27; bin.castShadow = true;
      g.add(bin);
      const card = box(0.2, 0.01, 0.13, std(0xd6b25a, { metalness: 0.6, roughness: 0.3 }), 0.03, 0.02, 0);
      card.rotation.z = 0.4;
      g.add(card);
      const paper = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), std(0xdedede));
      paper.position.set(-0.08, 0, 0.05);
      g.add(paper);
      break;
    }
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return g;
}
