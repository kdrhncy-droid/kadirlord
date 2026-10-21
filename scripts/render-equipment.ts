/**
 * render-equipment.ts — Faz 9: miğfer/kalkan görselleri (tarayıcısız önizleme)
 *
 *   npx tsx scripts/render-equipment.ts
 *
 * Sandbox'ta WebGL/Chromium sistem kütüphaneleri olmadığı için three.js
 * sahnelerini **yazılımsal** rasterize ediyoruz: üçgenleri z-buffer ile
 * düz gölgeli olarak doldurup PNG yazıyoruz (harici bağımlılık yok).
 * Çıktı: docs/renders/equip-fixed.png
 */
import * as THREE from 'three';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { createCharacterRig, setRigSheathed, type CharacterVisualOptions } from '../src/game/characterRig.ts';

const base = {
  skinTone: '#e8be99',
  hairColor: '#2b1b10',
  beardColor: '#2b1b10',
  factionColor: '#7f1d1d',
  hasBeard: false,
  weaponType: 'NONE',
  shieldType: 'NONE',
  helmetType: 'NONE',
  armorTier: 'CHAINMAIL',
  factionId: 'vlandia',
} as unknown as CharacterVisualOptions;

/* ───────────────────────── PNG yazıcı ───────────────────────── */

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function writePNG(path: string, width: number, height: number, rgb: Uint8Array) {
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

/* ───────────────────────── yazılımsal rasterizer ───────────────────────── */

interface Tile {
  label: string;
  objects: THREE.Object3D[];
  /** Görünüm penceresi: [minX, maxX, minY, maxY] dünya uzayı. */
  view: [number, number, number, number];
  /** Karo için dikey eksende döndürme (3/4 görünüm). */
  yaw?: number;
}

const TILE_W = 340;
const TILE_H = 380;

function renderTiles(tiles: Tile[]): { width: number; height: number; rgb: Uint8Array } {
  const width = TILE_W * tiles.length;
  const height = TILE_H;
  const rgb = new Uint8Array(width * height * 3);
  // arka plan: koyu kahve gradyan
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = y / height;
      const i = (y * width + x) * 3;
      rgb[i] = Math.round(26 - 8 * t);
      rgb[i + 1] = Math.round(21 - 6 * t);
      rgb[i + 2] = Math.round(17 - 5 * t);
    }
  }

  const light = new THREE.Vector3(0.35, 0.55, 0.75).normalize();

  tiles.forEach((tile, tIndex) => {
    const [minX, maxX, minY, maxY] = tile.view;
    const scale = Math.min(TILE_W / (maxX - minX), TILE_H / (maxY - minY));
    const ox = tIndex * TILE_W + TILE_W / 2 - ((minX + maxX) / 2) * scale;
    const oy = TILE_H / 2 + ((minY + maxY) / 2) * scale;

    // Kamera -Z yönüne bakıyor: en YAKIN yüzey en BÜYÜK z'dir.
    const zBuffer = new Float32Array(TILE_W * TILE_H).fill(-Infinity);

    // NOT: nesneleri başka bir gruba TAŞIMIYORUZ — kafayı/kalkanı iskeletten
    // koparınca dünya konumu sıfıra kayıyor ve karo boş çıkıyordu. Dönüş,
    // karo kurulurken nesnenin kendi ekseninde uygulanır.
    for (const object of tile.objects) {
      object.updateMatrixWorld(true);
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || typeof mesh.geometry?.getAttribute !== 'function') return;
        const geo = mesh.geometry as THREE.BufferGeometry;
        const pos = geo.getAttribute('position');
        if (!pos) return;
        const index = geo.getIndex();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const mat = mats[0] as THREE.MeshStandardMaterial | undefined;
        const color = mat?.color
          ? new THREE.Color(mat.color.getHex())
          : new THREE.Color('#8a8a8a');

        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const c = new THREE.Vector3();
        const ab = new THREE.Vector3();
        const ac = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const triCount = index ? index.count / 3 : pos.count / 3;

        for (let t = 0; t < triCount; t++) {
          const i0 = index ? index.getX(t * 3) : t * 3;
          const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
          b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
          c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);

          ab.subVectors(b, a);
          ac.subVectors(c, a);
          normal.crossVectors(ab, ac).normalize();
          const lambert = Math.max(0.18, normal.dot(light));
          const shade = 0.35 + 0.75 * lambert;

          const px = [a, b, c].map((v) => v.x * scale + ox);
          const py = [a, b, c].map((v) => -v.y * scale + oy);
          const pz = [a, b, c].map((v) => v.z);

          const minPx = Math.max(Math.floor(Math.min(...px)), tIndex * TILE_W);
          const maxPx = Math.min(Math.ceil(Math.max(...px)), (tIndex + 1) * TILE_W - 1);
          const minPy = Math.max(Math.floor(Math.min(...py)), 0);
          const maxPy = Math.min(Math.ceil(Math.max(...py)), TILE_H - 1);

          const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
          if (Math.abs(area) < 1e-6) continue;

          for (let y = minPy; y <= maxPy; y++) {
            for (let x = minPx; x <= maxPx; x++) {
              const w0 = ((px[1] - x) * (py[2] - y) - (px[2] - x) * (py[1] - y)) / area;
              const w1 = ((px[2] - x) * (py[0] - y) - (px[0] - x) * (py[2] - y)) / area;
              const w2 = 1 - w0 - w1;
              if (w0 < 0 || w1 < 0 || w2 < 0) continue;
              const z = w0 * pz[0] + w1 * pz[1] + w2 * pz[2];
              const localIndex = (y - 0) * TILE_W + (x - tIndex * TILE_W);
              if (z <= zBuffer[localIndex]) continue;
              zBuffer[localIndex] = z;
              const i = (y * width + x) * 3;
              rgb[i] = Math.min(255, Math.round(color.r * 255 * shade));
              rgb[i + 1] = Math.min(255, Math.round(color.g * 255 * shade));
              rgb[i + 2] = Math.min(255, Math.round(color.b * 255 * shade));
            }
          }
        }
      });
    }
  });

  return { width, height, rgb };
}

/* ───────────────────────── sahneler ───────────────────────── */

const tiles: Tile[] = [];

// 1-2) Katafrakt miğferi: önden ve 3/4
for (const yaw of [0, -0.62]) {
  const rig = createCharacterRig({ ...base, helmetType: 'IMPERIAL_VISOR' } as CharacterVisualOptions);
  rig.head.rotation.y = yaw;
  rig.root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(rig.head);
  const pad = 0.05;
  tiles.push({
    label: 'Katafrakt',
    objects: [rig.head],
    view: [b.min.x - pad, b.max.x + pad, b.min.y - pad, b.max.y + pad],
  });
}

// 2-4) Kalkanlar
for (const shieldType of ['ROUND_SHIELD', 'KITE_SHIELD', 'PAVISE'] as const) {
  for (const yaw of [0, -0.6]) {
    const rig = createCharacterRig({ ...base, shieldType } as CharacterVisualOptions);
    const shield = rig.leftShieldSocket.children.find((c) => c.name === 'Shield')!;
    shield.rotation.y = yaw;
    rig.root.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(shield);
    const pad = 0.06;
    tiles.push({
      label: shieldType,
      objects: [shield],
      view: [b.min.x - pad, b.max.x + pad, b.min.y - pad, b.max.y + pad],
    });
  }
}

// 5) Dik duruş sonrası vücut (kalkan + göğüs)
{
  const rig = createCharacterRig({ ...base, shieldType: 'KITE_SHIELD', helmetType: 'IMPERIAL_VISOR' } as CharacterVisualOptions);
  setRigSheathed(rig, true);
  setRigSheathed(rig, false);
  rig.root.rotation.y = -0.5;
  rig.root.updateMatrixWorld(true);
  tiles.push({
    label: 'Bütün',
    objects: [rig.root],
    view: [-0.85, 0.85, 0.3, 2.3],
  });
}

const { width, height, rgb } = renderTiles(tiles);
writePNG('docs/renders/equip-fixed.png', width, height, rgb);
console.log(`docs/renders/equip-fixed.png yazıldı (${width}×${height}) — ${tiles.length} karo`);
