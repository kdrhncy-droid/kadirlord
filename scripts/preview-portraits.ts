/**
 * preview-portraits.ts — Portre önizlemesi (WebGL'siz, CPU rasterizer)
 *
 *   npx tsx scripts/preview-portraits.ts
 *
 * Tarayıcı/WebGL olmadığı için oyundaki `portraitRenderer` pikselleri burada
 * **aynen o kamerayla** CPU'da rasterize edilir: köşe projeksiyonu + z-buffer +
 * düz (flat) Lambert gölgeleme. Amaç estetik değil, **kadrajın doğruluğunu
 * gözle görebilmek**. Çıktı: `docs/renders/portrait-preview.png` (6 kahraman yan yana).
 */
import * as THREE from 'three';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import {
  PORTRAIT_H,
  PORTRAIT_W,
  createHeroPortraitRig,
  createPortraitCamera,
  disposeRig,
} from '../src/game/portraitRenderer.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const heroes = Object.values(buildHeroRegistry(campaign, factionNames).heroes);

/* ─────────────────────────── CPU rasterizer ─────────────────────────── */

type Tri = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  na: THREE.Vector3;
  nb: THREE.Vector3;
  nc: THREE.Vector3;
  color: THREE.Color;
};

function collect(root: THREE.Object3D, camera: THREE.Camera): Tri[] {
  root.updateMatrixWorld(true);
  const tris: Tri[] = [];
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    // Gizli ebeveyn zinciri kontrolü
    let p: THREE.Object3D | null = mesh;
    while (p) {
      if (!p.visible) return;
      p = p.parent;
    }
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const index = geo.getIndex();
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    if (!mat || mat.visible === false) return;
    const base = mat.color ? mat.color.clone() : new THREE.Color('#888888');
    if (mat.opacity !== undefined && mat.opacity < 0.35) return;

    const world = mesh.matrixWorld;
    const count = index ? index.count : pos.count;
    const normals = geo.getAttribute('normal');
    // Dünya uzayı köşe + NDC karşılığı
    const wv = (i: number) => {
      const idx = index ? index.getX(i) : i;
      return new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)).applyMatrix4(world);
    };
    const wn = (i: number, fallback: THREE.Vector3) => {
      if (!normals) return fallback;
      const idx = index ? index.getX(i) : i;
      const n = new THREE.Vector3(normals.getX(idx), normals.getY(idx), normals.getZ(idx));
      return n.applyMatrix3(new THREE.Matrix3().getNormalMatrix(world)).normalize();
    };
    for (let i = 0; i < count; i += 3) {
      const wa = wv(i);
      const wb = wv(i + 1);
      const wc = wv(i + 2);
      const faceN = new THREE.Vector3()
        .subVectors(wb, wa)
        .cross(new THREE.Vector3().subVectors(wc, wa))
        .normalize();
      tris.push({
        a: wa.clone().applyMatrix4(vp),
        b: wb.clone().applyMatrix4(vp),
        c: wc.clone().applyMatrix4(vp),
        na: wn(i, faceN),
        nb: wn(i + 1, faceN),
        nc: wn(i + 2, faceN),
        color: base,
      });
    }
  });
  return tris;
}

const KEY = new THREE.Vector3(0.9, 2.1, 2.2).normalize();
const FILL = new THREE.Vector3(-1.4, 0.9, 1.2).normalize();

function rasterize(tris: Tri[], w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  const zbuf = new Float32Array(w * h).fill(Infinity);

  for (const t of tris) {
    // NDC → ekran; arka planda kalan üçgenleri at
    const pts = [t.a, t.b, t.c].map((p) => ({
      x: (p.x * 0.5 + 0.5) * w,
      y: (1 - (p.y * 0.5 + 0.5)) * h,
      z: p.z,
    }));
    if (pts.some((p) => p.z < -1 || p.z > 1)) continue;

    const n = t.na.clone().add(t.nb).add(t.nc).normalize();
    const lambert =
      Math.max(0, n.dot(KEY)) * 0.75 + Math.max(0, n.dot(FILL)) * 0.25 + Math.max(0, -n.dot(KEY)) * 0.06;
    const shade = 0.42 + lambert * 0.72;
    const r = Math.min(255, t.color.r * 255 * shade);
    const g = Math.min(255, t.color.g * 255 * shade);
    const b = Math.min(255, t.color.b * 255 * shade);

    const minX = Math.max(0, Math.floor(Math.min(pts[0].x, pts[1].x, pts[2].x)));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(pts[0].x, pts[1].x, pts[2].x)));
    const minY = Math.max(0, Math.floor(Math.min(pts[0].y, pts[1].y, pts[2].y)));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(pts[0].y, pts[1].y, pts[2].y)));

    const [p0, p1, p2] = pts;
    const area = (p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y);
    if (Math.abs(area) < 1e-6) continue;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        const w0 = ((p1.x - p0.x) * (cy - p0.y) - (cx - p0.x) * (p1.y - p0.y)) / area;
        const w1 = ((cx - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (cy - p0.y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // Barycentric ağırlıklar: w2 → p0, w1 → p1, w0 → p2.
        // (Önceden p0/p1 yer değiştirmişti; perspektifte NDC z doğrusal
        //  olmadığı için zırhın içindeki kumaş öne geçip mor çizik üretiyordu.)
        const z = w2 * p0.z + w1 * p1.z + w0 * p2.z;
        const idx = y * w + x;
        if (z >= zbuf[idx]) continue;
        zbuf[idx] = z;
        px[idx * 4] = r;
        px[idx * 4 + 1] = g;
        px[idx * 4 + 2] = b;
        px[idx * 4 + 3] = 255;
      }
    }
  }
  return px;
}

/* ─────────────────────────── PNG yazıcı ─────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ─────────────────────────── üretim ─────────────────────────── */

const GAP = 6;
const BG = [26, 22, 17];
const picks = heroes.slice(0, 6);

const tiles = picks.map((hero) => {
  const rig = createHeroPortraitRig(hero);
  try {
    const camera = createPortraitCamera(rig);
    const tris = collect(rig.root, camera);
    const px = rasterize(tris, PORTRAIT_W, PORTRAIT_H);
    // Şeffaf zemin → koyu parşömen arka plan
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) {
        px[i] = BG[0];
        px[i + 1] = BG[1];
        px[i + 2] = BG[2];
        px[i + 3] = 255;
      }
    }
    console.log(`✓ ${hero.name.padEnd(14)} ${hero.occupation.padEnd(12)} üçgen: ${tris.length}`);
    return px;
  } finally {
    disposeRig(rig);
  }
});

const W = PORTRAIT_W * tiles.length + GAP * (tiles.length + 1);
const H = PORTRAIT_H + GAP * 2;
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < out.length; i += 4) {
  out[i] = 18;
  out[i + 1] = 15;
  out[i + 2] = 11;
  out[i + 3] = 255;
}
tiles.forEach((tile, t) => {
  const ox = GAP + t * (PORTRAIT_W + GAP);
  for (let y = 0; y < PORTRAIT_H; y++) {
    for (let x = 0; x < PORTRAIT_W; x++) {
      const src = (y * PORTRAIT_W + x) * 4;
      const dst = ((y + GAP) * W + (x + ox)) * 4;
      out[dst] = tile[src];
      out[dst + 1] = tile[src + 1];
      out[dst + 2] = tile[src + 2];
      out[dst + 3] = 255;
    }
  }
});

mkdirSync('docs/renders', { recursive: true });
writeFileSync('docs/renders/portrait-preview.png', encodePng(out, W, H));
console.log(`\n✅ docs/renders/portrait-preview.png (${W}×${H})`);
