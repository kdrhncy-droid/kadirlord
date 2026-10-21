/**
 * preview-scars.ts — Yara izi / savaş boyası yakın plan önizlemesi (WebGL'siz)
 *
 *   npx tsx scripts/preview-scars.ts
 *
 * Gerçek `createHeroPortraitRig` + `createPortraitCamera` kullanılır; pikseller
 * CPU'da rasterize edilir (kadraj/geometri doğrulaması). Çıktı:
 * `docs/renders/scars-preview.png` — yara izi türleri ve savaş boyaları yan yana,
 * yüze yakınlaştırılmış.
 */
import * as THREE from 'three';
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import {
  createHeroPortraitRig,
  createPortraitCamera,
  disposeRig,
  PORTRAIT_H,
  PORTRAIT_W,
} from '../src/game/portraitRenderer.ts';
import { getLordDNA } from '../src/game/characterMorph.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const heroes = Object.values(buildHeroRegistry(campaign, factionNames).heroes);

/* ── kamerayı yüze yaklaştır (kadrajın %45'i kadar) ── */
function faceCamera(rig: Parameters<typeof createPortraitCamera>[0]) {
  const base = createPortraitCamera(rig);
  const cam = base.clone();
  cam.position.lerp(new THREE.Vector3(rig.head.getWorldPosition(new THREE.Vector3()).x, cam.position.y, cam.position.z), 0.0);
  // Bakış noktasını koruyarak mesafeyi %40 kısalt.
  const target = new THREE.Vector3();
  cam.getWorldDirection(target);
  const head = rig.head.getWorldPosition(new THREE.Vector3());
  const toHead = head.clone().sub(cam.position);
  cam.position.addScaledVector(toHead, 0.33);
  cam.lookAt(head.x, head.y - 0.02, head.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/* ── CPU rasterizer (preview-portraits ile aynı yaklaşım) ── */
type Tri = {
  a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3;
  na: THREE.Vector3; nb: THREE.Vector3; nc: THREE.Vector3;
  color: THREE.Color;
};

function collect(root: THREE.Object3D, camera: THREE.Camera): Tri[] {
  root.updateMatrixWorld(true);
  const tris: Tri[] = [];
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    let p: THREE.Object3D | null = mesh;
    while (p) { if (!p.visible) return; p = p.parent; }
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const index = geo.getIndex();
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    if (!mat || mat.visible === false) return;
    const base = mat.color ? mat.color.clone() : new THREE.Color('#888888');
    if (mat.opacity !== undefined && mat.opacity < 0.35) return;
    const world = mesh.matrixWorld;
    const normals = geo.getAttribute('normal');
    const wv = (i: number) => {
      const idx = index ? index.getX(i) : i;
      return new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)).applyMatrix4(world);
    };
    const nm = new THREE.Matrix3().getNormalMatrix(world);
    const wn = (i: number, fb: THREE.Vector3) => {
      if (!normals) return fb;
      const idx = index ? index.getX(i) : i;
      return new THREE.Vector3(normals.getX(idx), normals.getY(idx), normals.getZ(idx)).applyMatrix3(nm).normalize();
    };
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const wa = wv(i); const wb = wv(i + 1); const wc = wv(i + 2);
      const fn = new THREE.Vector3().subVectors(wb, wa).cross(new THREE.Vector3().subVectors(wc, wa)).normalize();
      tris.push({
        a: wa.clone().applyMatrix4(vp), b: wb.clone().applyMatrix4(vp), c: wc.clone().applyMatrix4(vp),
        na: wn(i, fn), nb: wn(i + 1, fn), nc: wn(i + 2, fn), color: base,
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
    const pts = [t.a, t.b, t.c].map((p) => ({
      x: (p.x * 0.5 + 0.5) * w, y: (1 - (p.y * 0.5 + 0.5)) * h, z: p.z,
    }));
    if (pts.some((p) => p.z < -1 || p.z > 1)) continue;
    const n = t.na.clone().add(t.nb).add(t.nc).normalize();
    const lambert = Math.max(0, n.dot(KEY)) * 0.75 + Math.max(0, n.dot(FILL)) * 0.25 + Math.max(0, -n.dot(KEY)) * 0.06;
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
        const cx = x + 0.5; const cy = y + 0.5;
        const w0 = ((p1.x - p0.x) * (cy - p0.y) - (cx - p0.x) * (p1.y - p0.y)) / area;
        const w1 = ((cx - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (cy - p0.y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w2 * p0.z + w1 * p1.z + w0 * p2.z; // w2→p0, w1→p1, w0→p2
        const idx = y * w + x;
        if (z >= zbuf[idx]) continue;
        zbuf[idx] = z;
        px[idx * 4] = r; px[idx * 4 + 1] = g; px[idx * 4 + 2] = b; px[idx * 4 + 3] = 255;
      }
    }
  }
  return px;
}

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
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── seçim: her yara türünden bir kahraman (yoksa ilk kahraman) ── */
const wanted = ['eye_slash', 'cheek_cross', 'jaw_gash', 'battle_brow'];
const picked: { label: string; hero: (typeof heroes)[number] }[] = [];
for (const scar of wanted) {
  const h = heroes.find((x) => getLordDNA(x.id, x.culture).scar === scar);
  if (h) picked.push({ label: `yara: ${scar}`, hero: h });
}
const paintHero = heroes.find((x) => getLordDNA(x.id, x.culture).warPaint !== 'none');
if (paintHero) picked.push({ label: 'boya', hero: paintHero });

const TILE = 260;
const tiles: { label: string; name: string; px: Uint8ClampedArray }[] = picked.map(({ label, hero }) => {
  const rig = createHeroPortraitRig(hero);
  try {
    const cam = faceCamera(rig);
    const px = rasterize(collect(rig.root, cam), TILE, TILE);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) { px[i] = 30; px[i + 1] = 25; px[i + 2] = 18; px[i + 3] = 255; }
    }
    return { label, name: hero.name, px };
  } finally {
    disposeRig(rig);
  }
});

const GAP = 8;
const W = tiles.length * (TILE + GAP) + GAP;
const H = TILE + GAP * 2 + 18;
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < out.length; i += 4) { out[i] = 16; out[i + 1] = 13; out[i + 2] = 9; out[i + 3] = 255; }
tiles.forEach((tile, t) => {
  const ox = GAP + t * (TILE + GAP);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const src = (y * TILE + x) * 4;
      const dst = ((y + GAP) * W + (x + ox)) * 4;
      out[dst] = tile.px[src]; out[dst + 1] = tile.px[src + 1]; out[dst + 2] = tile.px[src + 2]; out[dst + 3] = 255;
    }
  }
  console.log(`✓ ${tile.label.padEnd(22)} ${tile.name}`);
});

mkdirSync('docs/renders', { recursive: true });
writeFileSync('docs/renders/scars-preview.png', encodePng(out, W, H));
console.log(`\n✅ docs/renders/scars-preview.png (${W}×${H})`);
