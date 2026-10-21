/**
 * softRender.ts — tarayıcısız (headless) yazılım rasterizasyonu
 *
 * Tarayıcı/WebGL olmadığı için karakter modellerini Node üzerinde CPU ile
 * çizip PNG'ye yazar. Amaç: kafa, saç, sakal ve miğfer hizalamasını gözle
 * doğrulamak. Three.js'in matris matematiği kullanılır; yalnızca çizim
 * katmanı burada yeniden yazılmıştır.
 */
import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

/* ───────────────────── PNG kodlayıcı ───────────────────── */

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export interface Bitmap {
  width: number;
  height: number;
  data: Buffer; // RGB
}

export function writePng(file: string, img: Bitmap): void {
  const { width: w, height: h, data } = img;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    data.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
}

/* ───────────────────── 3B → bitmap ───────────────────── */

export interface Tri {
  v: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  color: THREE.Color;
  doubleSided: boolean;
}

const BG = { r: 24, g: 27, b: 34 };

/** Nesne hiyerarşisini üçgen listesine indirger (görünürlük + materyal rengi). */
export function collectTriangles(root: THREE.Object3D, includeInvisible = false): Tri[] {
  root.updateMatrixWorld(true);
  const out: Tri[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!includeInvisible) {
      let p: THREE.Object3D | null = mesh;
      while (p) {
        if (!p.visible) return;
        p = p.parent;
      }
    }
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    const color = mat?.color ? mat.color.clone() : new THREE.Color(0xcccccc);
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const index = geo.getIndex();
    const count = index ? index.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = index ? index.getX(i) : i;
      const b = index ? index.getX(i + 1) : i + 1;
      const c = index ? index.getX(i + 2) : i + 2;
      out.push({
        v: [
          new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(mesh.matrixWorld),
          new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(mesh.matrixWorld),
          new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(mesh.matrixWorld),
        ],
        color,
        doubleSided: mat?.side === THREE.DoubleSide,
      });
    }
  });
  return out;
}

/** Perspektif kamera ile z-buffer rasterizasyonu. */
export function renderTriangles(
  tris: Tri[],
  eye: THREE.Vector3,
  target: THREE.Vector3,
  fovDeg: number,
  width: number,
  height: number,
  opts: { bg?: { r: number; g: number; b: number } } = {},
): Bitmap {
  const bg = opts.bg ?? BG;
  const data = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = bg.r;
    data[i * 3 + 1] = bg.g;
    data[i * 3 + 2] = bg.b;
  }
  const depth = new Float32Array(width * height).fill(Infinity);

  const cam = new THREE.PerspectiveCamera(fovDeg, width / height, 0.01, 100);
  cam.position.copy(eye);
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const viewProj = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const lightDir = new THREE.Vector3(0.42, 0.78, 0.8).normalize();

  const project = (v: THREE.Vector3) => {
    const p = v.clone().applyMatrix4(viewProj);
    return { x: (p.x * 0.5 + 0.5) * width, y: (1 - (p.y * 0.5 + 0.5)) * height, z: p.z };
  };

  for (const tri of tris) {
    const [a, b, c] = tri.v;
    const normal = new THREE.Vector3().copy(b).sub(a).cross(new THREE.Vector3().copy(c).sub(a)).normalize();
    if (!tri.doubleSided && normal.dot(new THREE.Vector3().copy(eye).sub(a)) <= 0) continue;
    const shade = Math.max(0.14, Math.abs(normal.dot(lightDir)) * 0.8 + 0.38);

    const pa = project(a);
    const pb = project(b);
    const pc = project(c);
    if ([pa, pb, pc].some((p) => p.z < -1 || p.z > 1)) continue;

    const minX = Math.max(0, Math.floor(Math.min(pa.x, pb.x, pc.x)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(pa.x, pb.x, pc.x)));
    const minY = Math.max(0, Math.floor(Math.min(pa.y, pb.y, pc.y)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(pa.y, pb.y, pc.y)));
    const area = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (Math.abs(area) < 1e-9) continue;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((pb.x - pa.x) * (py - pa.y) - (pb.y - pa.y) * (px - pa.x)) / area;
        const w1 = ((px - pa.x) * (pc.y - pa.y) - (py - pa.y) * (pc.x - pa.x)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // DİKKAT: w0 ↔ c, w1 ↔ b köşelerine ait (yukarıdaki çapraz çarpımlardan).
        // Önceden `pb.z * w0 + pc.z * w1` yazılıydı → b/c ağırlıkları yer
        // değiştiriyordu; perspektifte NDC z doğrusal olmadığı için iç yüzeyler
        // dış yüzeylerin **önüne** geçiyordu (zırhın içinden ten görünmesi).
        const z = pa.z * w2 + pb.z * w1 + pc.z * w0;
        const idx = y * width + x;
        if (z >= depth[idx]) continue;
        depth[idx] = z;
        data[idx * 3] = Math.min(255, Math.round(tri.color.r * 255 * shade));
        data[idx * 3 + 1] = Math.min(255, Math.round(tri.color.g * 255 * shade));
        data[idx * 3 + 2] = Math.min(255, Math.round(tri.color.b * 255 * shade));
      }
    }
  }
  return { width, height, data };
}

/* ───────────────────── kontakt sayfası ───────────────────── */

export function montage(tiles: Bitmap[], cols: number, gap = 6): Bitmap {
  const tileW = tiles[0]?.width ?? 0;
  const tileH = tiles[0]?.height ?? 0;
  const rows = Math.ceil(tiles.length / cols);
  const width = cols * tileW + (cols + 1) * gap;
  const height = rows * tileH + (rows + 1) * gap;
  const data = Buffer.alloc(width * height * 3, 12);
  tiles.forEach((tile, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const ox = gap + col * (tileW + gap);
    const oy = gap + row * (tileH + gap);
    for (let y = 0; y < tileH; y++) {
      const src = y * tileW * 3;
      const dst = ((oy + y) * width + ox) * 3;
      tile.data.copy(data, dst, src, src + tileW * 3);
    }
  });
  return { width, height, data };
}
