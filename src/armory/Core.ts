/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · Core.ts
 *  Saf Three.js (r150+) prosedürel low-poly geometri çekirdeği.
 *
 *  Bu dosya motorun "matematik katmanı"dır:
 *    · sweep()        → 2B profili omurga boyunca süpürür (loft): namlular, boynuzlar, gövdeler
 *    · shellSweep()   → kapalı kontur boyunca açık kabuk: kalkan yüzü, pauldron, miğfer siperi
 *    · bendGeometry() → Y boyunca bükme deformasyonu: eğri kılıç, yay, hilal balta
 *    · lathe/profile  → miğfer tasları, gövde zırhları
 *    · weld/capHoles  → dikiş izlerini ve açık delikleri kapatır
 *    · makeMaterial() → flatShading standardı (roughness 0.85 / metalness 0.15 taban)
 *    · Budget         → üçgen bütçesi muhasebesi (bütçe aşımında console.warn)
 *
 *  ÖLÇEK: 1 birim = 1 metre. Zemin y = 0. Pivotlar eklem merkezlerinde.
 *  DIŞA BAĞIMLILIK: yok (yalnızca three + BufferGeometryUtils).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ─────────────────────────── sabitler ─────────────────────────── */

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

/** Motor materyal standardı (Bölüm 1 / madde 4). */
export const MATERIAL_STANDARD = {
  flatShading: true,
  roughness: 0.85,
  metalness: 0.15,
} as const;

/** Performans bütçeleri (Bölüm 1 / madde 3). */
export const BUDGET = {
  soldierMax: 800,
  soldierMin: 400,
  horseMax: 900,
  horseMin: 500,
  weaponMax: 150,
  weaponMin: 60,
} as const;

export type LodLevel = 'hero' | 'battle' | 'crowd';

export interface LodSpec {
  /** Süpürme adımları çarpanı (profil omurga çözünürlüğü). */
  sweep: number;
  /** Silindir/koni radyal segment sayısı. */
  radial: number;
  /** Küre radyal × dikey segment sayısı. */
  sphere: [number, number];
  /** ExtrudeGeometry eğri segmentleri. */
  curve: number;
  /** Mikro vertex jitter (0 = kapalı). */
  jitter: number;
}

export const LOD: Record<LodLevel, LodSpec> = {
  /** Vitrin / yakın plan: tam detay, bütçe kısıtı yok. */
  hero: { sweep: 1.0, radial: 8, sphere: [8, 6], curve: 6, jitter: 0.0035 },
  /** Savaş alanı: Bölüm 1 bütçesine (60–150 üçgen) zorunlu uyum. */
  battle: { sweep: 0.5, radial: 5, sphere: [5, 4], curve: 2, jitter: 0.0 },
  /** 500v500 kalabalık: silüet öncelikli, en ucuz. */
  crowd: { sweep: 0.34, radial: 4, sphere: [4, 3], curve: 1, jitter: 0.0 },
};

/* ─────────────────────────── rastgelelik ─────────────────────────── */

/** Deterministik PRNG (mulberry32) — aynı tohum, aynı ordu. */
export function makeRng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return function rng(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);
export const snap = (v: number, step: number): number => Math.round(v / step) * step;

/* ─────────────────────────── geometri yardımcıları ─────────────────────────── */

export type Vec2Tuple = [number, number];
export type Vec3Tuple = [number, number, number];

export const v2 = (x: number, y: number): THREE.Vector2 => new THREE.Vector2(x, y);
export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

export function profile2(pts: Vec2Tuple[]): THREE.Vector2[] {
  return pts.map((p) => new THREE.Vector2(p[0], p[1]));
}

export function spine3(pts: Vec3Tuple[], subdivisions = 0): THREE.Vector3[] {
  const base = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  if (subdivisions <= 0) return base;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < base.length - 1; i++) {
    for (let s = 0; s < subdivisions; s++) {
      out.push(base[i].clone().lerp(base[i + 1], s / subdivisions));
    }
  }
  out.push(base[base.length - 1].clone());
  return out;
}

/** Üçgen sayısı (indexed / non-indexed ayrımı yapmadan). */
export function triCount(g: THREE.BufferGeometry): number {
  if (g.index) return g.index.count / 3;
  const p = g.attributes.position;
  return p ? p.count / 3 : 0;
}

/**
 * Merge öncesi normalizasyon: yalnızca position + normal (+opsiyonel color)
 * kalır, UV gibi değişken attribute'lar atılır. Böylece ExtrudeGeometry,
 * LatheGeometry ve özel sweep çıktıları sorunsuz birleşir.
 */
export function normalizeGeometry(
  g: THREE.BufferGeometry,
  color?: THREE.Color | number | null,
): THREE.BufferGeometry {
  let out = g.index ? g.toNonIndexed() : g;
  if (out !== g) out = out.clone();

  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') out.deleteAttribute(name);
  }
  if (!out.attributes.normal) out.computeVertexNormals();

  if (color !== undefined && color !== null) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = (out.attributes.position as THREE.BufferAttribute).count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    out.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  } else if (!out.attributes.color) {
    const n = (out.attributes.position as THREE.BufferAttribute).count;
    out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  return out;
}

export interface Piece {
  geometry: THREE.BufferGeometry;
  material?: MaterialDef | string;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple | number;
  name?: string;
}

/** Bir parçaya dönüşüm + renk uygular (merge'e hazır hale getirir). */
export function bakePiece(piece: Piece, matLib: MaterialLibrary): THREE.BufferGeometry {
  const g = piece.geometry.clone();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = piece.rotation ? new THREE.Euler(piece.rotation[0], piece.rotation[1], piece.rotation[2]) : new THREE.Euler();
  q.setFromEuler(e);
  const s =
    piece.scale === undefined
      ? new THREE.Vector3(1, 1, 1)
      : typeof piece.scale === 'number'
        ? new THREE.Vector3(piece.scale, piece.scale, piece.scale)
        : new THREE.Vector3(piece.scale[0], piece.scale[1], piece.scale[2]);
  const p = piece.position ? new THREE.Vector3(...piece.position) : new THREE.Vector3();
  m.compose(p, q, s);
  g.applyMatrix4(m);
  const def = matLib.resolve(piece.material);
  // Satır içi (inline) materyal tanımları da fraksiyon tint'ine saygı duyar.
  const faction = matLib.getFaction();
  if (def && def.factionTint && faction) return normalizeGeometry(g, faction.colorFor(def.factionTint));
  if (def) return normalizeGeometry(g, def.color);
  // Materyal verilmemişse geometrideki mevcut renk attribute'u korunur
  // (bakeHierarchy / bakeToGeometry zinciri için kritik).
  if (!g.attributes.color && piece.material === undefined) return normalizeGeometry(g, 0xffffff);
  return normalizeGeometry(g, null);
}

/**
 * Parça listesini TEK BufferGeometry'de birleştirir.
 * Çıktı InstancedMesh ile %100 uyumludur (tek materyal + vertexColors).
 */
export function mergePieces(
  pieces: Piece[],
  matLib: MaterialLibrary,
  opts: { keepEmpty?: boolean } = {},
): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const piece of pieces) {
    const baked = bakePiece(piece, matLib);
    if (!opts.keepEmpty && (baked.attributes.position as THREE.BufferAttribute).count === 0) continue;
    list.push(baked);
  }
  if (list.length === 0) return new THREE.BufferGeometry();
  if (list.length === 1) return list[0];
  const merged = mergeGeometries(list, false);
  if (!merged) throw new Error('[Bannerforge] mergePieces: geometriler birleştirilemedi (attribute uyumsuzluğu).');
  for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/* ─────────────────────────── materyal kütüphanesi ─────────────────────────── */

export interface MaterialDef {
  key: string;
  color: number;
  metalness: number;
  roughness: number;
  flatShading?: boolean;
  side?: THREE.Side;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  /** Fraksiyon rengiyle çarpılacak kanal: 'primary' | 'secondary' | null */
  factionTint?: 'primary' | 'secondary' | 'trim' | null;
}

export class MaterialLibrary {
  private defs = new Map<string, MaterialDef>();
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  private tintedCache = new Map<string, THREE.MeshStandardMaterial>();
  private faction: FactionPalette | null = null;

  constructor(defs: Record<string, Omit<MaterialDef, 'key'>>) {
    for (const key of Object.keys(defs)) this.defs.set(key, { key, ...defs[key] });
  }

  define(key: string, def: Omit<MaterialDef, 'key'>): this {
    this.defs.set(key, { key, ...def });
    this.cache.delete(key);
    this.tintedCache.clear();
    return this;
  }

  get(key: string): MaterialDef {
    const d = this.defs.get(key);
    if (!d) throw new Error(`[Bannerforge] Bilinmeyen materyal: "${key}"`);
    return d;
  }

  has(key: string): boolean {
    return this.defs.has(key);
  }

  resolve(m?: MaterialDef | string | null): MaterialDef | null {
    if (!m) return null;
    return typeof m === 'string' ? this.get(m) : m;
  }

  /** Aktif fraksiyon paletini bağla (tint'li materyaller yeniden üretilir). */
  setFaction(faction: FactionPalette | null): void {
    this.faction = faction;
    this.tintedCache.clear();
  }

  getFaction(): FactionPalette | null {
    return this.faction;
  }

  /** Group/hero modu için gerçek THREE materyali (cache'li). */
  material(key: string, tinted = true): THREE.MeshStandardMaterial {
    const def = this.get(key);
    if (tinted && def.factionTint && this.faction) {
      const ck = `${key}|${this.faction.id}`;
      const hit = this.tintedCache.get(ck);
      if (hit) return hit;
      const m = this.buildMaterial(def, this.faction.colorFor(def.factionTint));
      this.tintedCache.set(ck, m);
      return m;
    }
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = this.buildMaterial(def, def.color);
    this.cache.set(key, m);
    return m;
  }

  private buildMaterial(def: MaterialDef, color: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      // Bölüm 1 / madde 4 standardı: flatShading + roughness 0.85 + metalness 0.15 taban.
      // Metal parçalar metalness/roughness override eder; ahşap-kumaş standarda sadık kalır.
      flatShading: def.flatShading !== undefined ? def.flatShading : MATERIAL_STANDARD.flatShading,
      roughness: def.roughness !== undefined ? def.roughness : MATERIAL_STANDARD.roughness,
      metalness: def.metalness !== undefined ? def.metalness : MATERIAL_STANDARD.metalness,
      side: def.side ?? THREE.FrontSide,
      emissive: def.emissive ?? 0x000000,
      emissiveIntensity: def.emissiveIntensity ?? 1,
      transparent: def.transparent ?? false,
      opacity: def.opacity ?? 1,
      vertexColors: false,
    });
  }

  /** Merged geometri için tek materyal (vertexColors açık, flatShading açık). */
  mergedMaterial(key = '__merged__'): THREE.MeshStandardMaterial {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
      roughness: MATERIAL_STANDARD.roughness,
      metalness: MATERIAL_STANDARD.metalness,
    });
    this.cache.set(key, m);
    return m;
  }

  dispose(): void {
    this.cache.forEach((m) => m.dispose());
    this.tintedCache.forEach((m) => m.dispose());
    this.cache.clear();
    this.tintedCache.clear();
  }
}

/** Fraksiyon paleti arayüzü (Faction.ts içinde somutlanır). */
export interface FactionPalette {
  id: string;
  name: string;
  colorFor(slot: 'primary' | 'secondary' | 'trim'): number;
}

/* ─────────────────────────── bütçe muhasebesi ─────────────────────────── */

export interface BudgetReport {
  name: string;
  triangles: number;
  budget: number;
  ok: boolean;
  overflow: number;
}

/**
 * Üçgen bütçesi denetçisi. buildXXX() çağrıları report() ile kayıt altına
 * alınır; bütçe aşımında konsola uyarı düşer (geliştirme sırasında kırmızı
 * bayrak, runtime'da sessiz).
 */
export class BudgetTracker {
  readonly reports: BudgetReport[] = [];
  warn = true;

  check(name: string, geometry: THREE.BufferGeometry, budget: number): BudgetReport {
    const triangles = Math.round(triCount(geometry));
    const report: BudgetReport = {
      name,
      triangles,
      budget,
      ok: triangles <= budget,
      overflow: Math.max(0, triangles - budget),
    };
    this.reports.push(report);
    if (!report.ok && this.warn && typeof console !== 'undefined') {
      console.warn(
        `[Bannerforge] BÜTÇE AŞIMI: ${name} → ${triangles} üçgen (izin: ${budget}, +%${Math.round((report.overflow / budget) * 100)})`,
      );
    }
    return report;
  }

  summary(): { total: number; worst: BudgetReport | null; failures: BudgetReport[] } {
    const failures = this.reports.filter((r) => !r.ok);
    let worst: BudgetReport | null = null;
    for (const r of this.reports) {
      if (!worst || r.triangles / r.budget > worst.triangles / worst.budget) worst = r;
    }
    return { total: this.reports.reduce((a, r) => a + r.triangles, 0), worst, failures };
  }

  clear(): void {
    this.reports.length = 0;
  }
}

/* ─────────────────────────── süpürme (loft) çekirdeği ─────────────────────────── */

export interface SweepOptions {
  /** t (0..1) boyunca ölçek: sabit ya da eğri fonksiyonu (namlu inceltme). */
  scale?: number | ((t: number) => number);
  /** t boyunca profil düzleminde dönme (radyan) — burmalı namlu/tüy. */
  twist?: (t: number) => number;
  /** Profil X eksenini sabit dünya yönüne kilitle (parallel transport yerine). */
  seedNormal?: THREE.Vector3;
  /** Kapalı profilde uçları kapat. */
  capEnds?: boolean;
  /** Sarma yönünü ters çevir. */
  flip?: boolean;
  /** Mikro jitter (dövme çelik hissi). */
  jitter?: number;
  /** Vertex'leri ızgaraya oturt (keskin faset). */
  facet?: number;
}

/**
 * 2B profili (Vector2: x = profil "genişlik" ekseni, y = profil "kalınlık"
 * ekseni) 3B omurga boyunca süpürür. Çerçeveler parallel-transport ile
 * taşındığı için kavisli namlularda flip/bükülme olmaz.
 *
 * Üçgen maliyeti ≈ (S-1) × (P-1) × 2   →  bütçe kontrolü için S ve P'yi
 * LOD.sweep ile ölçekle.
 */
export function sweep(
  profile: THREE.Vector2[],
  spine: THREE.Vector3[],
  opts: SweepOptions = {},
): THREE.BufferGeometry {
  const P = profile.length;
  const S = spine.length;
  if (P < 2 || S < 2) throw new Error('[Bannerforge] sweep: profil ve omurga en az 2 nokta olmalı.');

  const closedProfile = profile[0].distanceToSquared(profile[P - 1]) < 1e-12;
  const rings = closedProfile ? P - 1 : P;
  const capEnds = !!opts.capEnds && closedProfile;

  const vertCount = S * P + (capEnds ? 2 : 0);
  const pos = new Float32Array(vertCount * 3);
  const idx: number[] = [];

  // ── omurga teğetleri ──
  const tangents: THREE.Vector3[] = [];
  for (let s = 0; s < S; s++) {
    const a = spine[Math.max(0, s - 1)];
    const b = spine[Math.min(S - 1, s + 1)];
    const t = b.clone().sub(a);
    if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
    tangents.push(t.normalize());
  }

  // ── başlangıç normali (parallel transport tohumu) ──
  let n0: THREE.Vector3;
  if (opts.seedNormal) {
    n0 = opts.seedNormal.clone().sub(tangents[0].clone().multiplyScalar(opts.seedNormal.dot(tangents[0])));
    if (n0.lengthSq() < 1e-8) n0.set(1, 0, 0);
    n0.normalize();
  } else {
    const helper =
      Math.abs(tangents[0].dot(new THREE.Vector3(0, 1, 0))) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    n0 = new THREE.Vector3().crossVectors(tangents[0], helper).normalize();
  }

  const scaleFn: (t: number) => number =
    typeof opts.scale === 'function'
      ? (opts.scale as (t: number) => number)
      : (_t: number) => (opts.scale === undefined ? 1 : (opts.scale as number));

  const N = n0.clone();
  const B = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const twistQ = new THREE.Quaternion();
  const pv = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  // ── halkalar ──
  for (let s = 0; s < S; s++) {
    if (s > 0) {
      cross.crossVectors(tangents[s - 1], tangents[s]);
      if (cross.lengthSq() > 1e-12) {
        const ang = Math.acos(clamp(tangents[s - 1].dot(tangents[s]), -1, 1));
        N.applyAxisAngle(cross.normalize(), ang);
      }
      N.addScaledVector(tangents[s], -N.dot(tangents[s]));
      if (N.lengthSq() < 1e-10) N.copy(n0);
      N.normalize();
    }
    B.crossVectors(tangents[s], N).normalize();
    basis.makeBasis(N, B, tangents[s]);
    q.setFromRotationMatrix(basis);
    const t = s / (S - 1);
    const tw = opts.twist ? opts.twist(t) : 0;
    if (tw !== 0) {
      twistQ.setFromAxisAngle(tangents[s], tw);
      q.premultiply(twistQ);
    }
    const sc = scaleFn(t);
    for (let p = 0; p < P; p++) {
      pv.set(profile[p].x * sc, profile[p].y * sc, 0).applyQuaternion(q).add(spine[s]);
      const o = (s * P + p) * 3;
      pos[o] = pv.x;
      pos[o + 1] = pv.y;
      pos[o + 2] = pv.z;
    }
  }

  // ── yan yüzeyler (ölçek 0 olan halkalarda üçgen yutularak sivri uç elde edilir) ──
  for (let s = 0; s < S - 1; s++) {
    const scA = scaleFn(s / (S - 1));
    const scB = scaleFn((s + 1) / (S - 1));
    for (let p = 0; p < rings; p++) {
      const p2 = (p + 1) % P;
      const a = s * P + p;
      const b = s * P + p2;
      const c = (s + 1) * P + p2;
      const d = (s + 1) * P + p;
      if (scA > 1e-5 && scB > 1e-5) idx.push(a, b, d, b, c, d);
      else if (scA <= 1e-5 && scB > 1e-5) idx.push(a, c, d);
      else if (scB <= 1e-5 && scA > 1e-5) idx.push(a, b, d);
    }
  }

  // ── uç kapakları ──
  if (capEnds) {
    for (const end of [0, S - 1]) {
      centroid.set(0, 0, 0);
      for (let p = 0; p < rings; p++) {
        const o = (end * P + p) * 3;
        centroid.x += pos[o];
        centroid.y += pos[o + 1];
        centroid.z += pos[o + 2];
      }
      centroid.divideScalar(rings);
      const ci = end === 0 ? S * P : S * P + 1;
      pos[ci * 3] = centroid.x;
      pos[ci * 3 + 1] = centroid.y;
      pos[ci * 3 + 2] = centroid.z;
      for (let p = 0; p < rings; p++) {
        const p2 = (p + 1) % P;
        if (end === 0) idx.push(ci, end * P + p2, end * P + p);
        else idx.push(ci, end * P + p, end * P + p2);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (opts.flip) flipWinding(g);
  if (opts.jitter) jitterGeometry(g, opts.jitter, 7331);
  if (opts.facet) quantizeGeometry(g, opts.facet);
  return g;
}

/**
 * Kapalı 2B kontur boyunca, kontur düzlemine dik profili süpürerek AÇIK kabuk
 * üretir. Normal konturun dışına bakar. Kalkan yüzü, pauldron katı, miğfer
 * siperliği, at zırhı (barding) gibi "levha" parçalar için kullanılır.
 */
export function shellSweep(
  outline: THREE.Vector2[],
  profile: THREE.Vector2[],
  opts: { flip?: boolean; jitter?: number; facet?: number; closedProfile?: boolean } = {},
): THREE.BufferGeometry {
  const O = outline.length;
  const P = profile.length;
  const pos = new Float32Array(O * P * 3);
  const idx: number[] = [];
  const basis = new THREE.Matrix4();
  const T = new THREE.Vector3();
  const B = new THREE.Vector3(0, 0, 1);
  const Nrm = new THREE.Vector3();
  const local = new THREE.Vector3();

  for (let i = 0; i < O; i++) {
    const prev = outline[(i - 1 + O) % O];
    const next = outline[(i + 1) % O];
    T.set(next.x - prev.x, next.y - prev.y, 0);
    if (T.lengthSq() < 1e-12) T.set(1, 0, 0);
    T.normalize();
    Nrm.crossVectors(T, B).normalize(); // = (Ty, -Tx, 0) → kontur dışına bakar
    basis.makeBasis(Nrm, B, T);
    for (let p = 0; p < P; p++) {
      local.set(profile[p].x, profile[p].y, 0).applyMatrix4(basis);
      const o = (i * P + p) * 3;
      pos[o] = local.x + outline[i].x;
      pos[o + 1] = local.y + outline[i].y;
      pos[o + 2] = local.z;
    }
  }

  const rings = opts.closedProfile ? P - 1 : P;
  for (let i = 0; i < O; i++) {
    const i2 = (i + 1) % O;
    for (let p = 0; p < rings; p++) {
      const p2 = p + 1;
      if (p2 > P - 1) break;
      idx.push(i * P + p, i * P + p2, i2 * P + p, i * P + p2, i2 * P + p2, i2 * P + p);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (opts.flip) flipWinding(g);
  if (opts.jitter) jitterGeometry(g, opts.jitter, 991);
  if (opts.facet) quantizeGeometry(g, opts.facet);
  return g;
}

/** Y ekseni boyunca bükme deformasyonu (θ = curvature(y)). */
export function bendGeometry(g: THREE.BufferGeometry, curvature: (y: number) => number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const a = curvature(y);
    const c = Math.cos(a);
    const s = Math.sin(a);
    p.setXYZ(i, x * c - y * s, x * s + y * c, p.getZ(i));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Vertex'leri 3B ızgaraya oturtur → keskin low-poly fasetler. */
export function quantizeGeometry(g: THREE.BufferGeometry, step: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const inv = 1 / Math.max(step, 1e-6);
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, Math.round(p.getX(i) * inv) / inv, Math.round(p.getY(i) * inv) / inv, Math.round(p.getZ(i) * inv) / inv);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Deterministik mikro jitter: el yapımı / dövme çelik hissi. */
export function jitterGeometry(g: THREE.BufferGeometry, amount: number, seed = 1234): THREE.BufferGeometry {
  if (amount <= 0) return g;
  const rng = makeRng(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + (rng() - 0.5) * amount, p.getY(i) + (rng() - 0.5) * amount, p.getZ(i) + (rng() - 0.5) * amount);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Sarma yönünü (dolayısıyla normal yönünü) ters çevirir. */
export function flipWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.index) {
    const arr = g.index.array as unknown as number[];
    for (let i = 0; i + 2 < arr.length; i += 3) {
      const t = arr[i];
      arr[i] = arr[i + 2];
      arr[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i + 2 < p.count; i += 3) {
      const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
      p.setXYZ(i, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, ax, ay, az);
    }
    p.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

/** Eş konumlu vertex'leri kaynaklar (lathe dikişi / silindir birleşim izi). */
export function weldVertices(g: THREE.BufferGeometry, precision = 1e-4): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position as THREE.BufferAttribute;
  const k = 1 / precision;
  const map = new Map<string, number>();
  const out: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const key = `${Math.round(x * k)}|${Math.round(y * k)}|${Math.round(z * k)}`;
    let vi = map.get(key);
    if (vi === undefined) {
      vi = out.length / 3;
      map.set(key, vi);
      out.push(x, y, z);
    }
    index.push(vi);
  }
  const w = new THREE.BufferGeometry();
  w.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  w.setIndex(index);
  w.computeVertexNormals();
  return w;
}

/** Açık sınır kenarlarını üçgenle kapatır (göz yarığı, boru ucu delikleri). */
export function capHoles(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const p = src.attributes.position as THREE.BufferAttribute;
  const key = (i: number): string =>
    `${Math.round(p.getX(i) * 1e4)}|${Math.round(p.getY(i) * 1e4)}|${Math.round(p.getZ(i) * 1e4)}`;

  const edgeUse = new Map<string, number[]>();
  const edgeThird = new Map<string, number[]>();
  for (let t = 0; t < p.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = t + e;
      const b = t + ((e + 1) % 3);
      const c = t + ((e + 2) % 3);
      const ka = key(a), kb = key(b);
      const ek = ka < kb ? `${ka}>${kb}` : `${kb}>${ka}`;
      const uses = edgeUse.get(ek);
      if (uses) uses.push(a);
      else edgeUse.set(ek, [a]);
      const thirds = edgeThird.get(ek);
      if (thirds) thirds.push(c);
      else edgeThird.set(ek, [c]);
    }
  }

  const add: number[] = [];
  edgeUse.forEach((uses, ek) => {
    if (uses.length !== 1) return;
    const a = uses[0];
    const t = a - (a % 3);
    const local = [t, t + 1, t + 2].filter((i) => i !== a);
    const b = local[0], c = local[1];
    const thirds = edgeThird.get(ek) ?? [];
    const inner = thirds.find((i) => i !== a && i !== b && i !== c);
    if (inner !== undefined) add.push(a, inner, c);
    else add.push(a, c, b);
  });

  if (add.length === 0) return src;
  const merged = new Float32Array((p.count + add.length) * 3);
  merged.set(p.array as Float32Array, 0);
  for (let i = 0; i < add.length; i++) {
    const o = (p.count + i) * 3;
    merged[o] = p.getX(add[i]);
    merged[o + 1] = p.getY(add[i]);
    merged[o + 2] = p.getZ(add[i]);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  out.computeVertexNormals();
  return out;
}

/** Polyline → düşük poligon boru (kiriş, kordon, tel sarım, kayış). */
export function tubeFromPoints(
  points: THREE.Vector3[],
  radius: number,
  radialSegments = 4,
  cornerSmooth = 1,
): THREE.BufferGeometry {
  const path: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) {
      path.push(points[i].clone());
      continue;
    }
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const steps = Math.max(1, cornerSmooth);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ab = a.clone().lerp(b, t);
      const bc = b.clone().lerp(c, t);
      path.push(ab.lerp(bc, t));
    }
  }
  const profile: THREE.Vector2[] = [];
  const sides = Math.max(3, radialSegments);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * TAU;
    profile.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  profile.push(profile[0].clone());
  return sweep(profile, path, { capEnds: true });
}

/** Düşük poligon kumaş yüzeyi (flama, sancak, pelerin, at örtüsü). */
export function clothGeometry(
  widthFn: (v: number) => number,
  length: number,
  uSeg: number,
  vSeg: number,
  wave: (u: number, v: number) => number,
  doubleSided = true,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= vSeg; j++) {
    const v = j / vSeg;
    const w = widthFn(v);
    for (let i = 0; i <= uSeg; i++) {
      const u = i / uSeg - 0.5;
      pos.push(u * w, -v * length, wave(u + 0.5, v));
    }
  }
  for (let j = 0; j < vSeg; j++) {
    for (let i = 0; i < uSeg; i++) {
      const a = j * (uSeg + 1) + i;
      const b = a + 1;
      const c = a + (uSeg + 1);
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (doubleSided) {
    const n = idx.length;
    for (let i = 0; i < n; i += 3) idx.push(idx[i + 2], idx[i + 1], idx[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Extrude ayarları: low-poly için minimal bevel (keskin ama fasetli kenar). */
export function extrudeOpts(depth: number, bevel: number, curveSegments = 2): THREE.ExtrudeGeometryOptions {
  return {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.85,
    bevelOffset: 0,
    bevelSegments: bevel > 0 ? 1 : 0,
    curveSegments,
    steps: 1,
  };
}

/** 2B nokta listesinden THREE.Shape üretir. */
export function shapeFrom(points: Vec2Tuple[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

/** n köşeli yıldız / arma konturu (arma, perçin rozeti, taç). */
export function starPoints(n: number, rOuter: number, rInner: number, phase = 0): Vec2Tuple[] {
  const pts: Vec2Tuple[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = phase + (i / (n * 2)) * TAU;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Düşük poligon halka (kalkan çemberi, miğfer bandı) — kısmi açılar destekli. */
export function ringGeometry(
  rOuter: number,
  rInner: number,
  segments: number,
  arc = TAU,
  arcStart = 0,
): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = arcStart + (i / segments) * arc;
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * rInner, s * rInner, 0, c * rOuter, s * rOuter, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
    idx.push(a, b, c, b, d, c); // çift taraf
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}


/**
 * KAPALI BOMBELİ YÜZEY (kalkan yüzü, miğfer tası, göğüs kabuğu).
 *
 * shellSweep'ten farkı: shellSweep kontur boyunca bir KENAR BANDI üretir
 * (içi boş çerçeve); domeShell ise konturu merkezden kenara doğru küçülten
 * kapalı bir kabuk üretir.
 *
 * @param outline  kapalı, saat yönünün tersine (CCW) kontur — XY düzleminde
 * @param profile  [r, z] çiftleri; r = 0 (tepe/merkez) → r = 1 (kenar),
 *                 z = yükseklik (yüzeyin +Z'ye bombe miktarı)
 * @param opts     flip (sarım yönü), jitter, facet, cap (merkez üçgenleri)
 */
export function domeShell(
  outline: THREE.Vector2[],
  profile: Vec2Tuple[],
  opts: { flip?: boolean; jitter?: number; facet?: number; cap?: boolean } = {},
): THREE.BufferGeometry {
  const O = outline.length;
  const P = Math.max(2, profile.length);
  const rings = opts.cap ? P - 1 : P;
  const vertsPerRing = O;
  const pos = new Float32Array(((opts.cap ? 1 : 0) + rings) * vertsPerRing * 3);
  const idx: number[] = [];

  // profil normalize: r değerleri 0..1 aralığına ölçeklenir
  let rMax = 0;
  for (const q of profile) rMax = Math.max(rMax, Math.abs(q[0]));
  if (rMax <= 0) rMax = 1;

  let w = 0;
  if (opts.cap) {
    // merkez halkası: tüm köşeler tepe noktasında birleşir
    const cz = profile[0][1];
    for (let i = 0; i < O; i++) {
      pos[w++] = 0;
      pos[w++] = 0;
      pos[w++] = cz;
    }
  }
  const firstRing = opts.cap ? 1 : 0;
  for (let p2 = firstRing; p2 < firstRing + rings; p2++) {
    const src = opts.cap ? p2 : p2;
    const r = profile[src][0] / rMax;
    const z = profile[src][1];
    for (let i = 0; i < O; i++) {
      pos[w++] = outline[i].x * r;
      pos[w++] = outline[i].y * r;
      pos[w++] = z;
    }
  }

  const totalRings = (opts.cap ? 1 : 0) + rings;
  for (let ring = 0; ring < totalRings - 1; ring++) {
    for (let i = 0; i < O; i++) {
      const i2 = (i + 1) % O;
      const a = ring * O + i;
      const b = ring * O + i2;
      const c = (ring + 1) * O + i;
      const d = (ring + 1) * O + i2;
      idx.push(a, c, b, b, c, d);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (opts.flip) flipWinding(g);
  if (opts.jitter) jitterGeometry(g, opts.jitter, 4242);
  if (opts.facet) quantizeGeometry(g, opts.facet);
  return g;
}

/* ═══════════════════════════════════════════════════════════════════════
   OTOMATİK LOD İNDİRGEME (bütçe garantisi)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Uzaysal kümeleme (vertex clustering) ile üçgen sayısını hedefin altına
 * indirir. Yöntem:
 *   1) Nesnenin yönlendirilmiş çevreleyen kutusu (OBB) bulunur.
 *   2) OBB uzayı hücrelere bölünür; her hücredeki köşeler hücre merkezine
 *      kaynatılır → üçgenler birleşir/erir.
 *   3) Hücre boyutu, hedef üçgen sayısı tutana kadar ikili arama ile büyütülür.
 *
 * Silüet korunur (OBB hizalı olduğu için ince levhalar ezilmez), renk
 * attribute'u ortalanarak taşınır, normaller yeniden hesaplanır.
 *
 * @param geometry  kaynak (non-indexed ya da indexed)
 * @param maxTris   hedef üst sınır
 * @param minCell   hücre boyutu alt sınırı (m) — gereksiz erimeyi önler
 */
export function reduceToBudget(
  geometry: THREE.BufferGeometry,
  maxTris: number,
  minCell = 0.0004,
): THREE.BufferGeometry {
  if (maxTris <= 0) return geometry;
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = src.attributes.position as THREE.BufferAttribute;
  if (!pos || pos.count / 3 <= maxTris) return geometry;

  const count = pos.count;
  const col = src.attributes.color as THREE.BufferAttribute | undefined;
  const hasColor = !!col;
  // Tek seferlik düz dizi kopyası: kümeleme döngüleri attribute getter
  // çağırmaz (1000 birimlik orduda bake maliyeti ~4x düşer).
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const pz = new Float32Array(count);
  const parr = pos.array as ArrayLike<number>;
  for (let i = 0; i < count; i++) {
    px[i] = parr[i * 3];
    py[i] = parr[i * 3 + 1];
    pz[i] = parr[i * 3 + 2];
  }
  let cr = new Float32Array(0);
  let cg = new Float32Array(0);
  let cb = new Float32Array(0);
  if (hasColor && col) {
    cr = new Float32Array(count);
    cg = new Float32Array(count);
    cb = new Float32Array(count);
    const carr = col.array as ArrayLike<number>;
    for (let i = 0; i < count; i++) {
      cr[i] = carr[i * 3];
      cg[i] = carr[i * 3 + 1];
      cb[i] = carr[i * 3 + 2];
    }
  }

  // ── 1) merkez + kovaryans (PCA) ──
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < count; i++) {
    cx += px[i]; cy += py[i]; cz += pz[i];
  }
  cx /= count; cy /= count; cz /= count;

  let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0;
  for (let i = 0; i < count; i++) {
    const x = px[i] - cx;
    const y = py[i] - cy;
    const z = pz[i] - cz;
    m00 += x * x; m01 += x * y; m02 += x * z;
    m11 += y * y; m12 += y * z; m22 += z * z;
  }
  const k = 1 / count;
  const cov: [number, number, number, number, number, number, number, number, number] = [
    m00 * k, m01 * k, m02 * k,
    m01 * k, m11 * k, m12 * k,
    m02 * k, m12 * k, m22 * k,
  ];

  // ── 2) 3 ana eksen (güç iterasyonu + Gram-Schmidt) ──
  const e1 = powerEigen(cov, null);
  const e2 = powerEigen(cov, e1);
  const e3: [number, number, number] = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];
  normalize3(e3);

  // ── 3) yerel (OBB) uzayda sınırlar ──
  const lx = new Float32Array(count);
  const ly = new Float32Array(count);
  const lz = new Float32Array(count);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const dx = px[i] - cx;
    const dy = py[i] - cy;
    const dz = pz[i] - cz;
    const a = dx * e1[0] + dy * e1[1] + dz * e1[2];
    const b = dx * e2[0] + dy * e2[1] + dz * e2[2];
    const c = dx * e3[0] + dy * e3[1] + dz * e3[2];
    lx[i] = a; ly[i] = b; lz[i] = c;
    if (a < minX) minX = a; if (a > maxX) maxX = a;
    if (b < minY) minY = b; if (b > maxY) maxY = b;
    if (c < minZ) minZ = c; if (c > maxZ) maxZ = c;
  }
  const sx = Math.max(1e-4, maxX - minX);
  const sy = Math.max(1e-4, maxY - minY);
  const sz = Math.max(1e-4, maxZ - minZ);

  // ── 4) hücre kümelemesi ──
  // NOT: Yineleme başına büyük TypedArray tahsisi (nx*ny*nz ~ milyonlarca slot)
  // 1000 birimlik orduda saniyeler kaybettirir. Bu yüzden kümeler Map ile
  // tutulur; yalnızca köşe başına O(1) dizi kullanılır.
  let bestPos: number[] = [];
  let bestCol: number[] = [];
  let bestIdx: number[] = [];
  let bestTris = Infinity;
  let fitPos: number[] = [];
  let fitCol: number[] = [];
  let fitIdx: number[] = [];
  let bestFitTris = -1;
  let bestFitIdx: number[] = [];

  const remap = new Int32Array(count);
  const cellSumX = new Float64Array(count);
  const cellSumY = new Float64Array(count);
  const cellSumZ = new Float64Array(count);
  const cellSumR = new Float64Array(count);
  const cellSumG = new Float64Array(count);
  const cellSumB = new Float64Array(count);
  const cellCnt = new Int32Array(count);
  const cellIdx = new Int32Array(count);

  const cluster = (cell: number): number => {
    const nx = Math.max(1, Math.round(sx / cell));
    const ny = Math.max(1, Math.round(sy / cell));
    const nz = Math.max(1, Math.round(sz / cell));
    const buckets = new Map<number, number>(); // hücre anahtarı → yoğun slot
    let used = 0;

    for (let i = 0; i < count; i++) {
      const ix = clampInt(((lx[i] - minX) * nx / sx) | 0, 0, nx - 1);
      const iy = clampInt(((ly[i] - minY) * ny / sy) | 0, 0, ny - 1);
      const iz = clampInt(((lz[i] - minZ) * nz / sz) | 0, 0, nz - 1);
      const key = (ix * ny + iy) * nz + iz;
      let slot = buckets.get(key);
      if (slot === undefined) {
        slot = used++;
        buckets.set(key, slot);
        cellSumX[slot] = 0; cellSumY[slot] = 0; cellSumZ[slot] = 0;
        cellSumR[slot] = 0; cellSumG[slot] = 0; cellSumB[slot] = 0;
        cellCnt[slot] = 0;
      }
      cellSumX[slot] += lx[i];
      cellSumY[slot] += ly[i];
      cellSumZ[slot] += lz[i];
      if (hasColor) {
        cellSumR[slot] += cr[i];
        cellSumG[slot] += cg[i];
        cellSumB[slot] += cb[i];
      }
      cellCnt[slot]++;
      remap[i] = slot;
    }

    const outPos: number[] = new Array(used * 3);
    const outCol: number[] = hasColor ? new Array(used * 3) : [];
    for (let slot = 0; slot < used; slot++) {
      const inv = 1 / cellCnt[slot];
      const a = cellSumX[slot] * inv;
      const b = cellSumY[slot] * inv;
      const c = cellSumZ[slot] * inv;
      outPos[slot * 3] = cx + a * e1[0] + b * e2[0] + c * e3[0];
      outPos[slot * 3 + 1] = cy + a * e1[1] + b * e2[1] + c * e3[1];
      outPos[slot * 3 + 2] = cz + a * e1[2] + b * e2[2] + c * e3[2];
      if (hasColor) {
        outCol[slot * 3] = cellSumR[slot] * inv;
        outCol[slot * 3 + 1] = cellSumG[slot] * inv;
        outCol[slot * 3 + 2] = cellSumB[slot] * inv;
      }
      cellIdx[slot] = slot;
    }

    const idx: number[] = [];
    let tris = 0;
    for (let t = 0; t + 2 < count; t += 3) {
      const i0 = remap[t];
      const i1 = remap[t + 1];
      const i2 = remap[t + 2];
      if (i0 === i1 || i1 === i2 || i0 === i2) continue;
      idx.push(i0, i1, i2);
      tris++;
    }
    if (tris > 0 && tris < bestTris) {
      bestTris = tris;
      bestPos = outPos;
      bestCol = outCol;
      bestIdx = idx;
    }
    if (tris > 0 && tris <= maxTris && tris > bestFitTris) {
      bestFitTris = tris;
      fitPos = outPos;
      fitCol = outCol;
      fitIdx = idx;
      bestFitIdx = idx;
    }
    return tris;
  };

  const maxSpan = Math.max(sx, sy, sz);
  const minSpan = Math.min(sx, sy, sz);
  // Hücre boyutu üçgen sayısını (genel olarak) monoton azaltır: önce kaba bir
  // tarama ile hedefin altına inen ilk boyut bulunur, sonra [lo, hi] aralığında
  // İKİLİ ARAMA ile hedefi tutturan EN BÜYÜK üçgen sayısı seçilir. Böylece
  // bütçe tam olarak tutar ve gereksiz detay kaybı olmaz.
  let cell = Math.max(minCell, minSpan * 0.015);
  let lo = cell;
  let hi = -1;
  let lastTris = cluster(cell);
  let guard = 0;
  while (lastTris > maxTris && cell < maxSpan * 2 && guard++ < 14) {
    lo = cell;
    cell *= 1.45;
    lastTris = cluster(cell);
  }
  if (lastTris <= maxTris) hi = cell;

  if (hi > 0) {
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (mid <= lo || mid >= hi) break;
      const t = cluster(mid);
      if (t > maxTris) lo = mid;
      else hi = mid;
      if (hi - lo < minSpan * 0.002) break;
    }
    cluster(hi);
  }
  if (bestFitIdx.length === 0 && bestIdx.length === 0) return geometry;

  const usePos = bestFitIdx.length > 0 ? fitPos : bestPos;
  const useCol = bestFitIdx.length > 0 ? fitCol : bestCol;
  const useIdx = bestFitIdx.length > 0 ? fitIdx : bestIdx;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(usePos, 3));
  if (hasColor) out.setAttribute('color', new THREE.Float32BufferAttribute(useCol, 3));
  out.setIndex(useIdx);
  out.computeVertexNormals();
  return out;
}

/** Kovaryans matrisinden güç iterasyonu ile özvektör (3×3, satır bazlı dizi). */
function powerEigen(
  cov: [number, number, number, number, number, number, number, number, number],
  orthogonalTo: [number, number, number] | null,
): [number, number, number] {
  let v: [number, number, number] = [0.41, 0.82, 0.39];
  for (let i = 0; i < 30; i++) {
    const x = cov[0] * v[0] + cov[1] * v[1] + cov[2] * v[2];
    const y = cov[3] * v[0] + cov[4] * v[1] + cov[5] * v[2];
    const z = cov[6] * v[0] + cov[7] * v[1] + cov[8] * v[2];
    v = [x, y, z];
    if (orthogonalTo) {
      const d = v[0] * orthogonalTo[0] + v[1] * orthogonalTo[1] + v[2] * orthogonalTo[2];
      v = [v[0] - d * orthogonalTo[0], v[1] - d * orthogonalTo[1], v[2] - d * orthogonalTo[2]];
    }
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-10) {
      v = orthogonalTo ? [orthogonalTo[2], -orthogonalTo[1], orthogonalTo[0]] : [1, 0, 0];
      continue;
    }
    v = [v[0] / len, v[1] / len, v[2] / len];
  }
  return v;
}

function normalize3(v: [number, number, number]): void {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= len; v[1] /= len; v[2] /= len;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

