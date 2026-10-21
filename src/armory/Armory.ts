/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · Armory.ts
 *  Prosedürel low-poly silah & kalkan üreticisi (14 ekipman, 2 LOD).
 *
 *  ✦ SIFIR harici dosya: .glb / .obj / texture yok — saf BufferGeometry.
 *  ✦ Üretim teknikleri: sweep (loft), shellSweep (kabuk), bendGeometry
 *    (eğri namlu / yay gövdesi), ExtrudeGeometry (balta ağızları, siperler),
 *    LatheGeometry, Cone/Cylinder/Torus/Octahedron + vertex jitter/facet.
 *  ✦ LOD:
 *      · 'hero'   → vitrin & yakın plan, tam detay
 *      · 'battle' → BÖLÜM 1 BÜTÇESİ: 60–150 üçgen / silah-kalkan (zorunlu)
 *      · 'crowd'  → 500v500 instancing, silüet öncelikli
 *  ✦ Çıktı: hem THREE.Group (animasyon/hiyerarşi) hem merged BufferGeometry
 *    + tek materyal (InstancedMesh, tek draw-call).
 *  ✦ Fraksiyon renkleri: kabza sargısı, flama, kalkan arması dinamik.
 *
 *  ÖLÇEK: 1 birim = 1 m. Silahlar kabza altta, +Y yukarı, namlu +Y/+X.
 *         Kalkanlar yüzey +Z'ye bakar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import {
  BUDGET,
  BudgetTracker,
  DEG,
  LOD,
  LodLevel,
  MaterialDef,
  MaterialLibrary,
  Piece,
  TAU,
  Vec2Tuple,
  Vec3Tuple,
  bendGeometry,
  capHoles,
  clothGeometry,
  extrudeOpts,
  flipWinding,
  jitterGeometry,
  lerp,
  mergePieces,
  profile2,
  shellSweep,
  domeShell,
  quantizeGeometry,
  reduceToBudget,
  shapeFrom,
  spine3,
  starPoints,
  sweep,
  triCount,
  tubeFromPoints,
  v2,
  v3,
  weldVertices,
} from './Core.ts';
import { buildCharge, ChargeType, FactionPalette } from './Faction.ts';

/* ─────────────────────────── katalog ─────────────────────────── */

export type WeaponClass = 'sword' | 'axe' | 'mace' | 'polearm' | 'bow' | 'arrow' | 'shield' | 'armor';

export type ArmoryItemId =
  | 'gladius' | 'greatsword' | 'scimitar'
  | 'warAxe' | 'bardiche'
  | 'lance' | 'halberd'
  | 'recurveBow' | 'arrow'
  | 'vikingShield' | 'kiteShield'
  | 'greatHelm' | 'hornedHelm' | 'cuirass'
  | 'flangedMace' | 'warHammer' | 'morningstar'
  | 'billhook'
  | 'paviseShield' | 'cavalryRound'
  | 'nasalHelm' | 'kettleHat';

export type AttackAnimType = 'swing' | 'thrust' | 'draw' | 'raise' | 'bash' | 'chop';

export interface AttackSpec {
  type: AttackAnimType;
  /** Tutuş noktası (yerel) — pivot buraya kaydırılır. */
  grip: Vec3Tuple;
  /** Kurma dönüşü (derece, XYZ). */
  arm: Vec3Tuple;
  /** Vuruş dönüşü (derece, XYZ). */
  strike: Vec3Tuple;
  /** İleri atılım (m). */
  lunge: number;
  /** Yay/kalkan için geri çekme mesafesi (m). */
  pullback?: number;
  duration: number;
  /** Vuruş anı (sn) ve tetiklenecek prosedürel ses. */
  impactAt: number;
  impactSound?: 'swordClash' | 'shieldBlock' | 'bowRelease' | 'arrowHit' | 'heavyAxeSwing' | 'battleHorn';
}

export interface ArmoryItemSpec {
  id: ArmoryItemId;
  name: string;
  cls: WeaponClass;
  faction: string;
  /** Ağır/iki el mi? (animasyon ve hasar mantığı için) */
  twoHanded: boolean;
  /** Vitrin ölçeği: model bu yüksekliğe (m) normalize edilir. */
  displayScale: number;
  displayOffset: Vec3Tuple;
  displayRotation: Vec3Tuple;
  /** Kabza ucu → namlu ucu uzunluğu (m) — oyun dengesi için. */
  reach: number;
  weightKg: number;
  description: string;
  attack: AttackSpec;
  showcaseSound: NonNullable<AttackSpec['impactSound']>;
}

export interface ArmoryItemBuild {
  id: ArmoryItemId;
  spec: ArmoryItemSpec;
  lod: LodLevel;
  /** Hiyerarşik grup (sahne/animasyon için). */
  group: THREE.Group;
  /** Birleştirilmiş geometri (position + normal + color) — instancing uyumlu. */
  merged: THREE.BufferGeometry;
  /** merged ile kullanılacak tek materyal. */
  material: THREE.MeshStandardMaterial;
  /** group ile kullanılacak materyal listesi. */
  materials: THREE.MeshStandardMaterial[];
  triangles: number;
  budget: number;
  withinBudget: boolean;
  boundingBox: THREE.Box3;
  size: THREE.Vector3;
}

/* ─────────────────────────── materyal paleti ─────────────────────────── */

/** Fraksiyondan türetilen silah/zırh paleti (metal + ahşap + kumaş). */
export function createArmoryPalette(f: FactionPalette): Record<string, Omit<MaterialDef, 'key'>> {
  const c = f.colors;
  return {
    steel: { color: c.steel, metalness: 0.78, roughness: 0.42 },
    steelBright: { color: blend(c.steel, 0xffffff, 0.35), metalness: 0.88, roughness: 0.28 },
    steelDark: { color: c.steelDark, metalness: 0.66, roughness: 0.58 },
    iron: { color: blend(c.steelDark, 0x2b2724, 0.25), metalness: 0.55, roughness: 0.66 },
    gold: { color: c.gold, metalness: 0.92, roughness: 0.3 },
    bronze: { color: blend(c.gold, 0x7a4a22, 0.35), metalness: 0.8, roughness: 0.44 },
    wood: { color: c.wood, metalness: 0.06, roughness: 0.85 },
    woodDark: { color: blend(c.wood, 0x1b1108, 0.4), metalness: 0.05, roughness: 0.9 },
    woodLight: { color: blend(c.wood, 0xd9bd8a, 0.35), metalness: 0.05, roughness: 0.86 },
    leather: { color: c.leather, metalness: 0.04, roughness: 0.92 },
    leatherDark: { color: blend(c.leather, 0x120c06, 0.45), metalness: 0.04, roughness: 0.95 },
    horn: { color: 0x3b3226, metalness: 0.08, roughness: 0.78 },
    bone: { color: 0xd6cdb2, metalness: 0.04, roughness: 0.82 },
    cloth: { color: c.primary, metalness: 0.04, roughness: 0.94, factionTint: 'primary' },
    clothLight: { color: c.secondary, metalness: 0.04, roughness: 0.94, factionTint: 'secondary' },
    trim: { color: c.trim, metalness: 0.5, roughness: 0.5, factionTint: 'trim' },
    plume: { color: c.primary, metalness: 0.04, roughness: 0.95, factionTint: 'primary' },
    mail: { color: blend(c.steelDark, 0x6d737a, 0.4), metalness: 0.6, roughness: 0.72 },
    dark: { color: 0x1b1a18, metalness: 0.15, roughness: 0.9 },
    gem: { color: 0x7d1f2a, metalness: 0.3, roughness: 0.18, emissive: 0x32060c, emissiveIntensity: 0.55 },
  };
}

function blend(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/* ─────────────────────────── parça yardımcıları ─────────────────────────── */

interface BuildCtx {
  lod: LodLevel;
  spec: (typeof LOD)[LodLevel];
  mats: MaterialLibrary;
  faction: FactionPalette;
  rng: () => number;
  jitter: number;
  /** Süpürme çözünürlüğü (üçgen bütçesini asıl belirleyen değer). */
  res: (base: number) => number;
  /** Radyal segment sayısı. */
  rad: (base?: number) => number;
}

const RAD_BY_LOD: Record<LodLevel, number> = { hero: 8, battle: 6, crowd: 5 };

function ctxFor(lod: LodLevel, mats: MaterialLibrary, faction: FactionPalette, seed: number): BuildCtx {
  const spec = LOD[lod];
  return {
    lod,
    spec,
    mats,
    faction,
    rng: (() => {
      let a = seed >>> 0 || 1;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })(),
    jitter: spec.jitter,
    res: (base: number) => Math.max(2, Math.round(base * spec.sweep)),
    rad: (base = RAD_BY_LOD[lod]) => Math.max(3, base),
  };
}

/** Dairesel (kapalı) profil — borular, kabzalar, kirişler. */
function discProfile(r: number, n: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    pts.push(v2(Math.cos(a) * r, Math.sin(a) * r));
  }
  pts.push(pts[0].clone());
  return pts;
}

/** Silindirik gövde/sap: hafif konik, düşük poligon, jitter'lı. */
function haft(
  ctx: BuildCtx,
  y0: number,
  y1: number,
  r0: number,
  r1: number,
  mat: string,
  opts: { radial?: number; jitter?: number; facet?: number; axis?: 'y' | 'x' | 'z' } = {},
): Piece {
  const radial = Math.max(3, opts.radial ?? ctx.rad());
  const seg = Math.max(1, ctx.res(4));
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(y1 - y0), radial, seg);
  g.translate(0, (y0 + y1) / 2, 0);
  if (opts.jitter || ctx.jitter) jitterGeometry(g, opts.jitter ?? ctx.jitter, 4242);
  if (opts.facet) quantizeGeometry(g, opts.facet);
  if (opts.axis === 'x') g.rotateZ(-90 * DEG);
  if (opts.axis === 'z') g.rotateX(90 * DEG);
  return { geometry: g, material: mat };
}

/** Deri/ tel sarım: N adet alçak halka. */
function bindings(ctx: BuildCtx, y0: number, y1: number, r: number, count: number, mat = 'leatherDark'): Piece[] {
  const out: Piece[] = [];
  const n = Math.max(2, Math.round(count * (ctx.lod === 'hero' ? 1 : 0.6)));
  for (let i = 0; i < n; i++) {
    const y = lerp(y0, y1, i / Math.max(1, n - 1));
    const g = new THREE.TorusGeometry(r, r * 0.26, 3, ctx.rad(6));
    g.rotateX(90 * DEG);
    g.translate(0, y, 0);
    out.push({ geometry: g, material: mat });
  }
  return out;
}

/** Küre/çokyüzlü topuz (kabza başı, göbek, perçin). */
function ball(r: number, mat: string, detail: number, pos: Vec3Tuple = [0, 0, 0], scale?: Vec3Tuple): Piece {
  const g = new THREE.IcosahedronGeometry(r, detail);
  return { geometry: g, material: mat, position: pos, scale };
}

/** Kalkan yüzeyinde (XY düzlemi, z sabit) halka perçinler.
 *  Yatay halka veren rivets() düz kalkanlarda yarısı havada kalıyordu. */
function rivetsXY(ctx: BuildCtx, count: number, radius: number, r: number, z: number, mat = 'iron', arc = TAU, phase = 0): Piece[] {
  const out: Piece[] = [];
  const n = ctx.lod === 'crowd' ? Math.max(3, Math.round(count * 0.5)) : count;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * arc;
    const g = new THREE.OctahedronGeometry(r, 0);
    g.scale(1, 1, 0.72);
    out.push({ geometry: g, material: mat, position: [Math.cos(a) * radius, Math.sin(a) * radius, z] });
  }
  return out;
}

/** Perçin dizisi (dairesel ya da çizgi boyunca). */
function rivets(ctx: BuildCtx, count: number, radius: number, r: number, y: number, mat = 'iron', arc = TAU, phase = 0): Piece[] {
  const out: Piece[] = [];
  const n = ctx.lod === 'crowd' ? Math.max(3, Math.round(count * 0.5)) : count;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * arc;
    const g = new THREE.OctahedronGeometry(r, 0);
    g.scale(1, 0.72, 1);
    out.push({ geometry: g, material: mat, position: [Math.cos(a) * radius, y, Math.sin(a) * radius] });
  }
  return out;
}

/** Balta ağzı / hilal bıçak: 2B kontur + ExtrudeGeometry (keskin kenar için bevel). */
function extrudedBlade(
  outline: Vec2Tuple[],
  thickness: number,
  bevel: number,
  mat: string,
  transform: { position?: Vec3Tuple; rotation?: Vec3Tuple; scale?: Vec3Tuple | number } = {},
): Piece {
  const g = new THREE.ExtrudeGeometry(shapeFrom(outline), extrudeOpts(thickness, bevel, 1));
  return { geometry: g, material: mat, ...transform };
}

/** Süpürülmüş namlu (kılıç, mızrak ucu, hançer): profil + omurga + inceltme. */
function sweptBlade(
  ctx: BuildCtx,
  opts: {
    profile: Vec2Tuple[];
    spine: Vec3Tuple[];
    steps: number;
    scale?: number | ((t: number) => number);
    seedNormal?: Vec3Tuple;
    twist?: (t: number) => number;
    mat?: string;
    jitter?: number;
    facet?: number;
  },
): THREE.BufferGeometry {
  const g = sweep(profile2(opts.profile), spine3(opts.spine, Math.max(0, opts.steps - opts.spine.length)), {
    scale: opts.scale ?? 1,
    twist: opts.twist,
    seedNormal: opts.seedNormal ? v3(...opts.seedNormal) : undefined,
    jitter: opts.jitter ?? 0,
    facet: opts.facet,
  });
  return g;
}

const smoothArmory = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/* ═══════════════════════════════════════════════════════════════════════
   KILIÇLAR
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 1) İMPARATORLUK KISA KILICI (Gladius / Spatha)
 *    Yaprak şeklinde namlu, altın kabza, kartal başı topuz.
 */
function buildGladius(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const steps = ctx.res(hero ? 16 : 9);
  const halfW = 0.05;

  // ── namlu: yaprak profili + elmas kesit ──
  const blade = sweptBlade(ctx, {
    profile: [
      [-halfW, 0],
      [0, -0.021],
      [halfW, 0],
      [halfW * 0.62, 0.009],
      [0, 0.015],
      [-halfW * 0.62, 0.009],
      [-halfW, 0],
    ],
    spine: [[0, 0.3, 0], [0, 0.92, 0.004]],
    steps,
    scale: (t) => {
      const body = 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)) ** 0.45;
      const tip = t < 0.88 ? 1 : Math.max(0, 1 - smoothArmory((t - 0.88) / 0.12));
      return body * tip;
    },
    seedNormal: [1, 0, 0],
    mat: 'steelBright',
  });
  P.push({ geometry: blade, material: 'steelBright' });

  // ── orta damar (hero) ──
  if (hero) {
    const rib = new THREE.BoxGeometry(0.016, 0.56, 0.026);
    rib.translate(0, 0.58, 0.002);
    P.push({ geometry: rib, material: 'steel' });
  }

  // ── kabza başlığı (guard): İmparatorluk tarzı geniş plaka ──
  const guard = new THREE.BoxGeometry(hero ? 0.19 : 0.17, 0.036, hero ? 0.052 : 0.045);
  guard.translate(0, 0.282, 0);
  P.push({ geometry: guard, material: 'gold' });
  if (hero) {
    for (const s of [-1, 1]) {
      const tip = new THREE.OctahedronGeometry(0.02, 0);
      tip.scale(1.1, 0.8, 1);
      P.push({ geometry: tip, material: 'gold', position: [s * 0.1, 0.282, 0] });
    }
  }

  // ── kabza ──
  P.push(haft(ctx, 0.14, 0.268, 0.026, 0.022, 'woodDark', { radial: ctx.rad() }));
  P.push(...bindings(ctx, 0.15, 0.258, 0.027, hero ? 6 : 3, 'gold'));

  // ── topuz: kartal başı stilizasyonu ──
  const pommel = new THREE.IcosahedronGeometry(0.036, 0);
  pommel.scale(1, 0.85, 1.15);
  P.push({ geometry: pommel, material: 'gold', position: [0, 0.115, 0] });
  if (hero) {
    const beak = new THREE.ConeGeometry(0.014, 0.045, 4);
    beak.rotateX(90 * DEG);
    P.push({ geometry: beak, material: 'gold', position: [0, 0.112, 0.045] });
    const gemGeo = new THREE.OctahedronGeometry(0.012, 0);
    P.push({ geometry: gemGeo, material: 'gem', position: [0, 0.115, -0.038] });
  }

  // ── kın halkası (opsiyonel detay, hero) ──
  if (hero) {
    const ring = new THREE.TorusGeometry(0.03, 0.006, 3, 7);
    ring.rotateX(90 * DEG);
    P.push({ geometry: ring, material: 'bronze', position: [0, 0.3, 0] });
  }
  return P;
}

/**
 * 2) ÇİFT ELLİ ŞÖVALYE KILICI (Greatsword)
 *    Kan oluklu (fuller) geniş namlu, aşağı kıvrık siper, haç kabza.
 */
function buildGreatsword(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const steps = ctx.res(hero ? 18 : 10);
  const halfW = 0.058;

  // ── namlu: kan oluklu (fuller) kesit + hafif öne kavis ──
  const fuller = hero ? 0.012 : 0.016;
  const blade = sweptBlade(ctx, {
    profile: [
      [-halfW, -0.004],
      [-halfW * 0.42, -fuller],
      [0, -fuller * 1.15],
      [halfW * 0.42, -fuller],
      [halfW, -0.004],
      [halfW * 0.7, 0.012],
      [0, 0.017],
      [-halfW * 0.7, 0.012],
      [-halfW, -0.004],
    ],
    spine: [
      [0, 0.34, 0],
      [0, 0.86, 0.012],
      [0, 1.24, 0.03],
      [0, 1.5, 0.042],
    ],
    steps,
    scale: (t) => (t < 0.84 ? 1 : 1 - smoothArmory((t - 0.84) / 0.16)),
    seedNormal: [1, 0, 0],
  });
  P.push({ geometry: blade, material: 'steelBright' });

  // ── ricasso (namlu dibi çelik plakası) ──
  const ricasso = new THREE.BoxGeometry(0.075, 0.055, 0.028);
  ricasso.translate(0, 0.355, 0);
  P.push({ geometry: ricasso, material: 'steel' });

  // ── siper (crossguard): uçları aşağı kıvrık, merkezde haç kabartması ──
  const guardShape = shapeFrom([
    [-0.26, 0.0],
    [-0.235, -0.075],
    [-0.2, -0.012],
    [0.2, -0.012],
    [0.235, -0.075],
    [0.26, 0.0],
    [0.055, 0.032],
    [-0.055, 0.032],
  ]);
  const guard = new THREE.ExtrudeGeometry(guardShape, extrudeOpts(hero ? 0.052 : 0.044, hero ? 0.008 : 0.004, 1));
  guard.rotateX(90 * DEG);
  guard.translate(0, 0.316, 0.026);
  P.push({ geometry: guard, material: 'steelDark' });

  if (hero) {
    // merkezdeki altın haç kabartması
    const crossV = new THREE.BoxGeometry(0.016, 0.05, 0.012);
    const crossH = new THREE.BoxGeometry(0.04, 0.016, 0.012);
    P.push({ geometry: crossV, material: 'gold', position: [0, 0.318, 0.056] });
    P.push({ geometry: crossH, material: 'gold', position: [0, 0.322, 0.056] });
    // siper uçlarında altın bilye
    for (const s of [-1, 1]) {
      const tip = new THREE.OctahedronGeometry(0.018, 0);
      P.push({ geometry: tip, material: 'gold', position: [s * 0.245, 0.3, -0.055] });
    }
  }

  // ── uzun kabza (çift el) ──
  P.push(haft(ctx, 0.1, 0.3, 0.027, 0.024, 'leather', { radial: ctx.rad() }));
  P.push(...bindings(ctx, 0.12, 0.29, 0.028, hero ? 8 : 4, 'steelDark'));

  // ── topuz: ağırlık halkası ──
  const pommel = new THREE.OctahedronGeometry(0.045, 0);
  pommel.scale(1, 1.25, 0.72);
  P.push({ geometry: pommel, material: 'steel', position: [0, 0.068, 0] });
  if (hero) {
    P.push(ball(0.014, 'gold', 0, [0, 0.115, 0]));
    const ring = new THREE.TorusGeometry(0.05, 0.008, 3, 7);
    ring.rotateX(90 * DEG);
    P.push({ geometry: ring, material: 'gold', position: [0, 0.068, 0] });
  }
  return P;
}

/**
 * 3) KUZAİT EĞRİ KILICI (Scimitar / Kılıç)
 *    Kavisli namlu (bendGeometry), yalman (uç genişlemesi), S siper.
 */
function buildScimitar(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const steps = ctx.res(hero ? 20 : 11);
  const L = 0.74;

  // ── kavisli namlu: düz süpür + Y boyunca bük ──
  const blade = sweptBlade(ctx, {
    profile: [
      [-0.019, -0.002],
      [-0.006, -0.013],
      [0.017, -0.004],
      [0.021, 0.006],
      [0.004, 0.013],
      [-0.013, 0.008],
      [-0.019, -0.002],
    ],
    spine: [[0, 0.3, 0], [0, 0.3 + L, 0]],
    steps,
    scale: (t) => {
      const base = 0.88 + 0.12 * Math.sin(Math.PI * t);
      // yalman: ucun son %28'inde genişleme (0.9'da tepe, sonra sivrilir)
      const flare = t > 0.72 ? 1 + 0.5 * Math.sin(Math.PI * Math.min(1, (t - 0.72) / 0.28)) : 1;
      const tip = t < 0.9 ? 1 : Math.max(0, 1 - smoothArmory((t - 0.9) / 0.1));
      return base * flare * tip;
    },
    seedNormal: [1, 0, 0],
  });
  bendGeometry(blade, (y) => 0.42 * Math.max(0, y - 0.3) * Math.max(0, y - 0.3));
  P.push({ geometry: blade, material: 'steelBright' });

  // ── sırt boyunca kaburga (hero) ──
  if (hero) {
    const spineRib = new THREE.BoxGeometry(0.012, 0.6, 0.014);
    spineRib.translate(-0.02, 0.62, 0.004);
    bendGeometry(spineRib, (y) => 0.42 * Math.max(0, y - 0.3) * Math.max(0, y - 0.3));
    P.push({ geometry: spineRib, material: 'steel' });
  }

  // ── S biçimli siper ──
  const guard = sweptBlade(ctx, {
    profile: [[-0.014, -0.008], [0.014, -0.008], [0.014, 0.008], [-0.014, 0.008], [-0.014, -0.008]],
    spine: [
      [-0.055, 0.262, -0.03],
      [-0.02, 0.292, -0.005],
      [0.02, 0.318, 0.01],
      [0.062, 0.352, 0.028],
    ],
    steps: ctx.res(hero ? 8 : 5),
    seedNormal: [1, 0, 0],
  });
  P.push({ geometry: guard, material: 'gold' });
  if (hero) {
    P.push(ball(0.017, 'gold', 0, [-0.058, 0.258, -0.032]));
    P.push(ball(0.017, 'gold', 0, [0.066, 0.356, 0.03]));
    P.push(ball(0.024, 'gem', 0, [0, 0.304, 0]));
  }

  // ── kabza (kamış biçimli) ──
  P.push(haft(ctx, 0.135, 0.29, 0.023, 0.026, 'leather', { radial: ctx.rad() }));
  P.push(...bindings(ctx, 0.15, 0.28, 0.027, hero ? 6 : 3, 'gold'));

  // ── topuz ──
  const pommel = new THREE.IcosahedronGeometry(0.032, 0);
  pommel.scale(1, 0.8, 1);
  P.push({ geometry: pommel, material: 'gold', position: [0, 0.118, 0] });

  // ── kumaş püskül (fraksiyon rengi) ──
  if (hero) {
    const tassel = new THREE.ConeGeometry(0.022, 0.1, 4);
    tassel.rotateX(180 * DEG);
    P.push({ geometry: tassel, material: 'cloth', position: [0, 0.06, -0.02] });
  }
  return P;
}

/* ═══════════════════════════════════════════════════════════════════════
   BALTALAR
   ═══════════════════════════════════════════════════════════════════════ */

/** Balta başı konturu: keskin ağız + sakal (beard) + sırt. */
/**
 * Balta başı konturu (ExtrudeGeometry şekil düzlemi):
 *   shape.x → dünya Z (ağız açıklığı: yukarı/aşağı)
 *   shape.y → dünya X (saptan dışa, keskin ağza doğru)
 * Soket (göz) x≈0'da kalır; keskin ağız x≈0.28'de dışbükey kavis çizer.
 */
function axeHeadOutline(size: number, beard: number, sweepBack: number): Vec2Tuple[] {
  return [
    [-0.045 * size, 0.05 * size],
    [0.05 * size, 0.075 * size + sweepBack],
    [0.16 * size, 0.15 * size + sweepBack],
    [0.28 * size, 0.045 * size],
    [0.24 * size, -0.07 * size],
    [0.12 * size, -0.19 * size - beard],
    [0.02 * size, -0.13 * size - beard * 0.5],
    [-0.045 * size, -0.055 * size],
  ];
}

/**
 * 4) TEK ELLİ SAVAŞ BALTASI
 *    Hilal ağız, çekiç poll'u, deri sarımlı sap, dip diken.
 */
function buildWarAxe(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';

  // ── sap ──
  P.push(haft(ctx, 0, 0.72, 0.024, 0.019, 'wood', { radial: ctx.rad(), jitter: ctx.jitter, facet: hero ? 0.012 : 0 }));
  P.push(...bindings(ctx, 0.26, 0.44, 0.026, hero ? 7 : 4, 'leatherDark'));

  // ── dip başlığı + diken ──
  const butt = new THREE.CylinderGeometry(0.026, 0.022, 0.05, ctx.rad());
  butt.translate(0, 0.025, 0);
  P.push({ geometry: butt, material: 'steelDark' });
  if (hero) {
    const spike = new THREE.ConeGeometry(0.018, 0.07, 4);
    spike.rotateX(180 * DEG);
    P.push({ geometry: spike, material: 'steel', position: [0, -0.03, 0] });
  }

  // ── balta başı (ExtrudeGeometry + bevel → keskin fasetli ağız) ──
  const outline = axeHeadOutline(1, hero ? 0.03 : 0.02, hero ? 0.02 : 0);
  const head = extrudedBlade(outline, hero ? 0.034 : 0.028, hero ? 0.011 : 0.006, 'steelBright', {
    rotation: [0, 90 * DEG, 0],
    position: [-0.017, 0.63, 0],
  });
  P.push(head);

  // ── ağız kamaları (hero: çift katman → keskinlik hissi) ──
  if (hero) {
    const edge = extrudedBlade(
      [
        [0.16, 0.15],
        [0.28, 0.045],
        [0.24, -0.07],
        [0.255, -0.075],
        [0.3, 0.048],
        [0.17, 0.16],
      ],
      0.038,
      0.004,
      'steel',
      { rotation: [0, 90 * DEG, 0], position: [-0.019, 0.63, 0] },
    );
    P.push(edge);
  }

  // ── göz (socket) + yanak plakası ──
  const socket = new THREE.CylinderGeometry(0.037, 0.033, hero ? 0.14 : 0.12, ctx.rad(6));
  socket.rotateZ(90 * DEG);
  P.push({ geometry: socket, material: 'steelDark', position: [0, 0.64, 0] });
  const cheek = new THREE.BoxGeometry(hero ? 0.05 : 0.04, 0.16, hero ? 0.03 : 0.026);
  P.push({ geometry: cheek, material: 'steel', position: [0, 0.64, 0] });

  // ── poll (çekiç yüzü) ──
  const poll = new THREE.BoxGeometry(hero ? 0.075 : 0.06, 0.085, hero ? 0.055 : 0.045);
  P.push({ geometry: poll, material: 'steelDark', position: [hero ? -0.055 : -0.045, 0.655, 0] });
  if (hero) {
    const pollFace = new THREE.BoxGeometry(0.014, 0.07, 0.05);
    P.push({ geometry: pollFace, material: 'steel', position: [-0.095, 0.655, 0] });
  }

  // ── langet (sapı koruyan çelik şerit) ──
  if (hero) {
    for (const s of [-1, 1]) {
      const langet = new THREE.BoxGeometry(0.008, 0.2, 0.024);
      P.push({ geometry: langet, material: 'iron', position: [s * 0.026, 0.5, 0] });
    }
  }
  return P;
}

/**
 * 5) ÇİFT ELLİ DEVASA STURGIA BALTASI (Bardiche / Dane Axe)
 *    Uzun hilal ağız, sap boyunca uzanan çelik dil, dikenli dip.
 */
function buildBardiche(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';

  // ── uzun sap ──
  P.push(haft(ctx, 0, 1.72, 0.03, 0.024, 'woodDark', { radial: ctx.rad(), jitter: ctx.jitter, facet: hero ? 0.016 : 0 }));
  P.push(...bindings(ctx, 0.62, 0.92, 0.032, hero ? 9 : 4, 'leather'));
  P.push(...bindings(ctx, 0.16, 0.3, 0.032, hero ? 5 : 2, 'leatherDark'));

  // ── dev hilal ağız ──
  // shape.x → dünya Z (aşağı/yukarı), shape.y → dünya X (saptan dışa)
  const outline: Vec2Tuple[] = [
    [-0.03, 0.05],
    [0.03, 0.06],
    [0.03, -0.5],
    [-0.03, -0.5],
    [0.02, -0.56],
    [0.2, -0.6],
    [0.24, -0.24],
    [0.34, 0.1],
    [0.5, 0.44],
    [0.32, 0.7],
    [0.06, 0.6],
  ];
  const head = extrudedBlade(outline, hero ? 0.034 : 0.028, hero ? 0.012 : 0.006, 'steelBright', {
    rotation: [0, 90 * DEG, 0],
    position: [-0.017, 1.36, 0],
  });
  P.push(head);

  // ── keskin ağız şeridi ──
  const edge = extrudedBlade(
    [
      [0.24, -0.24],
      [0.34, 0.1],
      [0.5, 0.44],
      [0.32, 0.7],
      [0.345, 0.715],
      [0.525, 0.45],
      [0.365, 0.105],
      [0.262, -0.245],
    ],
    hero ? 0.038 : 0.032,
    0.004,
    'steel',
    { rotation: [0, 90 * DEG, 0], position: [-0.019, 1.36, 0] },
  );
  P.push(edge);

  // ── sap boyunca uzanan çelik dil (langet) ──
  const langet = new THREE.BoxGeometry(hero ? 0.05 : 0.042, 0.72, hero ? 0.014 : 0.012);
  P.push({ geometry: langet, material: 'steelDark', position: [0.022, 1.16, 0] });
  if (hero) {
    const langetBack = new THREE.BoxGeometry(0.034, 0.62, 0.012);
    P.push({ geometry: langetBack, material: 'steelDark', position: [-0.024, 1.2, 0] });
    for (let i = 0; i < 5; i++) {
      const rv = new THREE.OctahedronGeometry(0.009, 0);
      rv.scale(1, 0.7, 1);
      P.push({ geometry: rv, material: 'iron', position: [0.042, 1.0 + i * 0.12, 0] });
    }
  }

  // ── başın üstündeki delici diken ──
  const spike = new THREE.ConeGeometry(hero ? 0.032 : 0.026, hero ? 0.26 : 0.2, ctx.rad(5));
  P.push({ geometry: spike, material: 'steel', position: [0, 1.85, 0] });
  const spikeBase = new THREE.CylinderGeometry(0.036, 0.03, 0.09, ctx.rad(6));
  P.push({ geometry: spikeBase, material: 'steelDark', position: [0, 1.74, 0] });

  // ── dip: dikenli başlık ──
  const butt = new THREE.CylinderGeometry(0.032, 0.026, 0.07, ctx.rad());
  butt.translate(0, 0.035, 0);
  P.push({ geometry: butt, material: 'steelDark' });
  const buttSpike = new THREE.ConeGeometry(0.024, 0.11, 4);
  buttSpike.rotateX(180 * DEG);
  P.push({ geometry: buttSpike, material: 'steel', position: [0, -0.05, 0] });

  // ── fraksiyon püskülü ──
  if (hero) {
    const tassel = new THREE.ConeGeometry(0.03, 0.16, 4);
    tassel.rotateX(180 * DEG);
    P.push({ geometry: tassel, material: 'cloth', position: [-0.04, 1.42, 0] });
  }
  return P;
}

/* ═══════════════════════════════════════════════════════════════════════
   GÖNDERLİ SİLAHLAR
   ═══════════════════════════════════════════════════════════════════════ */

/** Ortak gönder (uzun ahşap sap + çelik yüksükler + dip diken). */
function poleShaft(ctx: BuildCtx, y0: number, y1: number, r: number, mat = 'wood'): Piece[] {
  const hero = ctx.lod === 'hero';
  const P: Piece[] = [
    haft(ctx, y0, y1, r, r * 0.86, mat, { radial: ctx.rad(), jitter: ctx.jitter * 0.6, facet: hero ? 0.018 : 0 }),
  ];
  const ferruleTop = new THREE.CylinderGeometry(r * 1.22, r * 1.1, 0.09, ctx.rad(6));
  P.push({ geometry: ferruleTop, material: 'steelDark', position: [0, y1 - 0.05, 0] });
  const ferruleBot = new THREE.CylinderGeometry(r * 1.15, r * 1.25, 0.07, ctx.rad(6));
  P.push({ geometry: ferruleBot, material: 'steelDark', position: [0, y0 + 0.04, 0] });
  if (hero) {
    const grip = new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.26, ctx.rad(6));
    P.push({ geometry: grip, material: 'leather', position: [0, y0 + 0.52, 0] });
    P.push(...bindings(ctx, y0 + 0.42, y0 + 0.62, r * 1.2, 5, 'leatherDark'));
  }
  return P;
}

/**
 * 6) SÜVARİ KARGISI / MIZRAK
 *    Uzun ahşap gövde, yaprak biçimli çelik uç, fraksiyon flamalı.
 */
function buildLance(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';

  P.push(...poleShaft(ctx, 0, 2.02, 0.022, 'woodLight'));

  // ── dip diken ──
  const butt = new THREE.ConeGeometry(0.028, 0.14, ctx.rad(5));
  butt.rotateX(180 * DEG);
  P.push({ geometry: butt, material: 'steelDark', position: [0, -0.06, 0] });

  // ── namlu: yaprak biçimli süpürme + orta damar ──
  const head = sweptBlade(ctx, {
    profile: [
      [-0.034, 0],
      [0, -0.016],
      [0.034, 0],
      [0.014, 0.012],
      [0, 0.02],
      [-0.014, 0.012],
      [-0.034, 0],
    ],
    spine: [[0, 2.0, 0], [0, 2.36, 0]],
    steps: ctx.res(hero ? 12 : 7),
    scale: (t) => (t > 0.93 ? 1 - smoothArmory((t - 0.93) / 0.07) : 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.12))),
    seedNormal: [1, 0, 0],
  });
  P.push({ geometry: head, material: 'steelBright' });
  if (hero) {
    const midrib = new THREE.BoxGeometry(0.014, 0.34, 0.028);
    midrib.translate(0, 2.17, 0);
    P.push({ geometry: midrib, material: 'steel' });
  }

  // ── yüksük (socket) ──
  const socket = new THREE.CylinderGeometry(0.033, 0.026, 0.16, ctx.rad(6));
  P.push({ geometry: socket, material: 'steelDark', position: [0, 2.02, 0] });

  // ── kan oluğu halkası (vamplate yerine süvari kargısında el koruyucu) ──
  if (hero) {
    const vamplate = new THREE.ConeGeometry(0.11, 0.09, 8, 1, true);
    vamplate.rotateX(180 * DEG);
    P.push({ geometry: vamplate, material: 'steel', position: [0, 1.62, 0] });
  }

  // ── fraksiyon flamalı (pennon) ──
  const flagSeg: [number, number] = hero ? [5, 4] : [3, 2];
  const flag = clothGeometry(
    (v) => 0.26 * (1 - v * 0.55),
    hero ? 0.42 : 0.34,
    flagSeg[0],
    flagSeg[1],
    (u, v) => Math.sin(u * 6.5 + v * 3.2) * 0.035 * (0.25 + v),
  );
  flag.translate(0.13, 1.94, 0);
  P.push({ geometry: flag, material: { key: 'pennon', color: ctx.faction.colors.primary, metalness: 0.04, roughness: 0.95, flatShading: true, side: THREE.DoubleSide, factionTint: 'primary' } });
  if (hero) {
    // flama saçak şeridi
    const fringe = clothGeometry((v) => 0.245 * (1 - v * 0.55), 0.06, 4, 1, (u, v) => Math.sin(u * 6.5 + v * 3.2) * 0.03);
    fringe.translate(0.13, 1.55, 0.002);
    P.push({ geometry: fringe, material: 'trim' });
    // bağlama ipleri
    for (const y of [1.92, 1.78]) {
      const cord = tubeFromPoints([v3(0.02, y, 0), v3(0.05, y - 0.01, 0.01), v3(0.02, y - 0.02, 0)], 0.004, 3, 1);
      P.push({ geometry: cord, material: 'clothLight' });
    }
  }
  return P;
}

/**
 * 7) HALBERD / GLAIVE
 *    Mızrak ucu + yan balta ağzı + arka diken + sancakçık.
 */
function buildHalberd(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';

  P.push(...poleShaft(ctx, 0, 1.86, 0.024, 'wood'));

  const butt = new THREE.ConeGeometry(0.03, 0.15, ctx.rad(5));
  butt.rotateX(180 * DEG);
  P.push({ geometry: butt, material: 'steelDark', position: [0, -0.07, 0] });

  // ── mızrak ucu ──
  const head = sweptBlade(ctx, {
    profile: [
      [-0.042, 0],
      [0, -0.018],
      [0.042, 0],
      [0.016, 0.013],
      [0, 0.022],
      [-0.016, 0.013],
      [-0.042, 0],
    ],
    spine: [[0, 1.84, 0], [0, 2.22, 0]],
    steps: ctx.res(hero ? 12 : 7),
    scale: (t) => (t > 0.92 ? 1 - smoothArmory((t - 0.92) / 0.08) : 0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.1))),
    seedNormal: [1, 0, 0],
  });
  P.push({ geometry: head, material: 'steelBright' });

  // ── yan balta ağzı (hilal) ──
  const axe = extrudedBlade(
    [
      [-0.03, 0.05],
      [0.03, 0.06],
      [0.03, -0.22],
      [-0.03, -0.2],
      [0.06, -0.26],
      [0.2, -0.16],
      [0.3, 0.0],
      [0.2, 0.16],
      [0.06, 0.2],
    ],
    hero ? 0.028 : 0.024,
    hero ? 0.009 : 0.005,
    'steel',
    { rotation: [0, 90 * DEG, 0], position: [-0.014, 1.86, 0] },
  );
  P.push(axe);

  // ── arka diken (kanca) ──
  const backSpike = sweptBlade(ctx, {
    profile: [[-0.018, -0.008], [0.018, -0.008], [0.018, 0.008], [-0.018, 0.008], [-0.018, -0.008]],
    spine: [
      [-0.02, 1.8, 0],
      [-0.11, 1.9, 0],
      [-0.21, 2.04, 0],
    ],
    steps: ctx.res(hero ? 8 : 5),
    scale: (t) => 1 - smoothArmory(t) * 0.82,
    seedNormal: [1, 0, 0],
  });
  P.push({ geometry: backSpike, material: 'steelDark' });

  // ── yüksük + bilezik ──
  const socket = new THREE.CylinderGeometry(0.036, 0.028, 0.2, ctx.rad(6));
  P.push({ geometry: socket, material: 'steelDark', position: [0, 1.88, 0] });
  if (hero) {
    const ring = new THREE.TorusGeometry(0.045, 0.008, 3, 8);
    ring.rotateX(90 * DEG);
    P.push({ geometry: ring, material: 'gold', position: [0, 1.74, 0] });
    for (const s of [-1, 1]) {
      const langet = new THREE.BoxGeometry(0.01, 0.34, 0.026);
      P.push({ geometry: langet, material: 'iron', position: [s * 0.028, 1.66, 0] });
    }
  }

  // ── sancakçık (bannerette) ──
  const flagSeg: [number, number] = hero ? [4, 3] : [3, 2];
  const flag = clothGeometry((v) => 0.2, 0.26, flagSeg[0], flagSeg[1], (u, v) => Math.sin(u * 7 + v * 3) * 0.03 * (0.3 + v));
  flag.translate(-0.1, 1.68, 0);
  P.push({ geometry: flag, material: { key: 'bannerette', color: ctx.faction.colors.secondary, metalness: 0.04, roughness: 0.95, flatShading: true, side: THREE.DoubleSide, factionTint: 'secondary' } });
  return P;
}

/* ═══════════════════════════════════════════════════════════════════════
   MENZİLLİ SİLAHLAR
   ═══════════════════════════════════════════════════════════════════════ */

const BOW = {
  half: 0.7, // kol uzunluğu (kabza merkezinden uç nock'a)
  k: 0.52,   // eğrilik çarpanı → θ(y) = k·y²  (toplam 0.255 rad ≈ 14.6°)
  tipZ: -0.0901, // bükülmüş uç z konumu
  brace: 0.16,   // kiriş germe yüksekliği
};

/**
 * 8) GELENEKSEL KAVİSLİ YAY (Recurve / Kuzait kompozit yay)
 *    Bükülmüş gövde (bendGeometry), kemik uç nock'lar, deri kabza, kiriş.
 */
function buildRecurveBow(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const steps = ctx.res(hero ? 12 : 7);
  const radial = ctx.rad(hero ? 6 : 5);

  // ── kol profili: dış (hedefe bakan) karın, iç (kiriş) sırt ──
  const limbProfile: Vec2Tuple[] = [
    [-0.021, 0.007],
    [0.021, 0.007],
    [0.016, -0.009],
    [-0.016, -0.009],
    [-0.021, 0.007],
  ];

  const buildLimb = (dir: 1 | -1): void => {
    const spine: Vec3Tuple[] = [];
    for (let i = 0; i <= steps; i++) spine.push([0, (i / steps) * BOW.half * 0.985, 0]);
    const g = sweptBlade(ctx, {
      profile: limbProfile,
      spine,
      steps: steps + 1,
      scale: (t) => {
        const w = lerp(1, 0.46, t); // uçlara doğru daralma
        const swell = 1 + 0.1 * Math.sin(Math.PI * t);
        return w * swell;
      },
      seedNormal: [1, 0, 0],
    });
    // kompozit yay: boynuz karın + ahşap çekirdek hissi için hafif bük
    bendGeometry(g, (y) => dir * BOW.k * y * y);
    P.push({ geometry: g, material: dir === 1 ? 'wood' : 'woodDark' });

    // ── kemik uç nock ──
    const nock = new THREE.CylinderGeometry(0.013, 0.019, 0.075, radial);
    nock.translate(0, 0.03 * dir, 0);
    const tipY = dir * BOW.half;
    const ang = Math.atan2(-BOW.k * BOW.half * BOW.half * 0 + dir * 2 * BOW.k * BOW.half, 1);
    P.push({ geometry: nock, material: 'bone', position: [0, tipY, BOW.tipZ], rotation: [dir * ang * 0.55, 0, 0] });
    const groove = new THREE.TorusGeometry(0.014, 0.004, 3, radial);
    groove.rotateX(90 * DEG);
    P.push({ geometry: groove, material: 'horn', position: [0, tipY + dir * 0.03, BOW.tipZ], rotation: [dir * ang * 0.55, 0, 0] });

    // ── kol üzerinde tendon sarımı / süs şeridi ──
    if (hero) {
      for (const t of [0.34, 0.56, 0.76]) {
        const y = dir * BOW.half * t;
        const ring = new THREE.TorusGeometry(0.02, 0.005, 3, 7);
        ring.rotateX(90 * DEG);
        const z = -BOW.k * y * y * (y / Math.abs(y || 1)) * Math.abs(y) * 0 + -Math.sign(y) * BOW.k * y * y * 0;
        P.push({ geometry: ring, material: 'trim', position: [0, y, -BOW.k * y * y * Math.abs(y) * 0] });
      }
      // kabza derisi
      const wrapGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8);
      P.push({ geometry: wrapGeo, material: 'leather', position: [0, dir * 0.02, 0.004] });
    }
  };
  buildLimb(1);
  buildLimb(-1);

  // ── kabza (riser): kalınlaştırılmış merkez ──
  const riser = new THREE.CylinderGeometry(0.034, 0.03, 0.17, radial);
  P.push({ geometry: riser, material: 'leatherDark', position: [0, 0, 0.002] });
  const riserPlate = new THREE.BoxGeometry(0.05, 0.11, 0.022);
  P.push({ geometry: riserPlate, material: 'woodDark', position: [0, 0, -0.026] });
  if (hero) {
    const gripRingTop = new THREE.TorusGeometry(0.032, 0.006, 3, 8);
    gripRingTop.rotateX(90 * DEG);
    P.push({ geometry: gripRingTop, material: 'gold', position: [0, 0.085, 0.002] });
    const gripRingBot = gripRingTop.clone();
    P.push({ geometry: gripRingBot, material: 'gold', position: [0, -0.085, 0.002] });
  }

  // ── kiriş: iki kol ucundan hafif içe kavisle ──
  const stringPath = [
    v3(0, BOW.half, BOW.tipZ),
    v3(0, BOW.half * 0.5, BOW.tipZ * 0.55 + BOW.brace * 0.35),
    v3(0, 0, BOW.brace),
    v3(0, -BOW.half * 0.5, BOW.tipZ * 0.55 + BOW.brace * 0.35),
    v3(0, -BOW.half, BOW.tipZ),
  ];
  const string = tubeFromPoints(stringPath, hero ? 0.0055 : 0.007, hero ? 4 : 3, 1);
  P.push({ geometry: string, material: hero ? 'bone' : 'clothLight' });

  // ── kiriş orta sarımı (serving) ──
  if (hero) {
    const serving = new THREE.CylinderGeometry(0.009, 0.009, 0.09, 5);
    P.push({ geometry: serving, material: 'clothLight', position: [0, 0, BOW.brace] });
  }
  return P;
}

/**
 * 9) TÜYLÜ LOW-POLY OK
 *    Demir bodkin uç + soket, ahşap gövde, kırmızı/beyaz üç tüy, kertikli arka.
 */
function buildArrow(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const radial = ctx.rad(hero ? 6 : 5);

  // ── gövde ──
  P.push(haft(ctx, -0.36, 0.3, 0.0075, 0.0068, 'woodLight', { radial, jitter: 0 }));

  // ── soket ──
  const socket = new THREE.CylinderGeometry(0.0095, 0.008, 0.045, radial);
  socket.translate(0, 0.315, 0);
  P.push({ geometry: socket, material: 'iron' });

  // ── bodkin uç: dört yüzlü delici ──
  const point = sweptBlade(ctx, {
    profile: [[-0.0085, 0], [0.0085, 0], [0, 0.011], [-0.0085, 0]],
    spine: [[0, 0.33, 0], [0, 0.45, 0]],
    steps: ctx.res(hero ? 7 : 4),
    scale: (t) => (t > 0.9 ? 1 - smoothArmory((t - 0.9) / 0.1) : 0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.1))),
    seedNormal: [1, 0, 0],
  });
  P.push({ geometry: point, material: 'steelBright' });

  // ── kertik (nock) ──
  const nock = new THREE.CylinderGeometry(0.0095, 0.0085, 0.026, radial);
  nock.translate(0, -0.372, 0);
  P.push({ geometry: nock, material: 'horn' });
  if (hero) {
    const slot = new THREE.BoxGeometry(0.004, 0.024, 0.02);
    P.push({ geometry: slot, material: 'dark', position: [0, -0.378, 0] });
  }

  // ── üç tüy: 120° aralıklı, kırmızı / beyaz / kırmızı ──
  const featherShape = shapeFrom([
    [0.011, 0.0],
    [0.028, 0.034],
    [0.03, 0.076],
    [0.02, 0.108],
    [0.006, 0.118],
    [0.001, 0.062],
    [0.004, 0.02],
  ]);
  const featherCount = hero ? 3 : 3;
  for (let i = 0; i < featherCount; i++) {
    const geo = new THREE.ExtrudeGeometry(featherShape, extrudeOpts(hero ? 0.005 : 0.006, hero ? 0.0018 : 0.001, 1));
    geo.translate(0, 0, -(hero ? 0.005 : 0.006) / 2);
    // tüyü hafifçe dışa bük (kavisli kesit hissi)
    bendGeometry(geo, () => 0);
    const mat = i === 1 ? 'clothLight' : 'cloth';
    P.push({
      geometry: geo,
      material: mat,
      position: [i === 0 ? 0.006 : -0.003, -0.335, i === 0 ? 0 : i === 1 ? 0.006 : -0.006],
      rotation: [0, (i * 120) * DEG, i === 0 ? 8 * DEG : i === 1 ? -4 * DEG : 12 * DEG],
    });
    if (hero) {
      // tüy mili (rachis)
      const rachis = new THREE.BoxGeometry(0.003, 0.115, 0.003);
      P.push({
        geometry: rachis,
        material: 'bone',
        position: [i === 0 ? 0.008 : -0.004, -0.283, i === 0 ? 0 : i === 1 ? 0.008 : -0.008],
        rotation: [0, (i * 120) * DEG, 0],
      });
    }
  }

  // ── gövde üzerinde sarım ipi ──
  if (hero) {
    for (const y of [-0.24, -0.225]) {
      const ring = new THREE.TorusGeometry(0.0085, 0.0018, 3, 6);
      ring.rotateX(90 * DEG);
      P.push({ geometry: ring, material: 'clothLight', position: [0, y, 0] });
    }
  }
  return P;
}

/* ═══════════════════════════════════════════════════════════════════════
   KALKANLAR
   ═══════════════════════════════════════════════════════════════════════ */

/** Kalkan konturu üretici (dairesel ya da kite/heater). */
function shieldOutline(kind: 'round' | 'kite', segments: number, scale = 1): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  if (kind === 'round') {
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * TAU;
      pts.push(v2(Math.cos(a) * 0.36 * scale, Math.sin(a) * 0.36 * scale));
    }
    return pts;
  }
  // heater/kite: üst geniş, alta doğru sivrilen simetrik kontur
  const raw: Vec2Tuple[] = [
    [0.0, 0.54],
    [0.33, 0.44],
    [0.37, 0.1],
    [0.29, -0.3],
    [0.0, -0.94],
    [-0.29, -0.3],
    [-0.37, 0.1],
    [-0.33, 0.44],
  ];
  const n = Math.max(4, Math.min(raw.length, segments));
  const step = raw.length / n;
  for (let i = 0; i < n; i++) {
    const f = i * step;
    const i0 = Math.floor(f) % raw.length;
    const i1 = (i0 + 1) % raw.length;
    const k = f - Math.floor(f);
    pts.push(
      v2(
        lerp(raw[i0][0], raw[i1][0], k) * scale,
        lerp(raw[i0][1], raw[i1][1], k) * scale,
      ),
    );
  }
  return pts;
}

/**
 * 10) YUVARLAK VİKİNG KALKANI
 *    Kubbeli tahta gövde (shellSweep), demir çember, konik göbek (boss),
 *    arkada takviye çıtaları, deri kayış ve perçinler.
 */
function buildVikingShield(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  // Tarihsel ölçü: Viking yuvarlak kalkanı ≈ 0.88 m çap, 8-12 cm bombe.
  const R = 0.44;
  const outline = shieldOutline('round', hero ? 12 : 9, R / 0.36);
  const dome = hero ? 0.062 : 0.055;

  // ── ön yüz: merkezden kenara hafif kubbe (KAPALI kabuk) ──
  const face = domeShell(
    outline,
    [
      [0, dome],
      [0.42, dome * 0.94],
      [0.72, dome * 0.7],
      [0.92, dome * 0.3],
      [1, -0.006],
    ],
    { cap: true, jitter: ctx.jitter, facet: hero ? 0.008 : 0 },
  );
  P.push({ geometry: face, material: 'wood' });

  // ── arka yüz: düze yakın, içbükey ──
  const back = domeShell(
    outline,
    [
      [0, -0.03],
      [0.5, -0.026],
      [0.85, -0.016],
      [1, -0.006],
    ],
    { cap: true, jitter: ctx.jitter },
  );
  P.push({ geometry: back, material: 'woodDark' });

  // ── kenar kalınlığı (ön ve arka yüzü birleştiren çember bandı) ──
  const edge = shellSweepFixed(outline, [[-0.012, dome * 0.12], [0.012, dome * 0.12], [0.012, -0.012], [-0.012, -0.012]]);
  P.push({ geometry: edge, material: 'woodDark' });

  // ── demir kenar çemberi ──
  const rim = new THREE.TorusGeometry(R + 0.004, 0.017, 3, hero ? 12 : 9);
  P.push({ geometry: rim, material: 'iron', position: [0, 0, 0.004] });

  // ── tahta kalas çizgileri (arkada çıtalar, önde boya şeridi) ──
  if (hero) {
    for (let i = 0; i < 5; i++) {
      const x = -0.34 + i * 0.17;
      const batten = new THREE.BoxGeometry(0.022, 2 * Math.sqrt(Math.max(0.01, R * R - x * x)) * 0.94, 0.014);
      P.push({ geometry: batten, material: 'woodDark', position: [x, 0, -0.03] });
    }
  } else {
    const batten = new THREE.BoxGeometry(0.034, 0.82, 0.014);
    P.push({ geometry: batten, material: 'woodDark', position: [0, 0, -0.03] });
  }

  // ── göbek (boss): konik kubbe + halka + sivri tepe ──
  const bossBase = new THREE.CylinderGeometry(0.13, 0.142, 0.022, ctx.rad(8));
  bossBase.rotateX(90 * DEG);
  P.push({ geometry: bossBase, material: 'steelDark', position: [0, 0, 0.055] });
  const bossDome = new THREE.ConeGeometry(0.115, hero ? 0.11 : 0.1, ctx.rad(8));
  bossDome.rotateX(90 * DEG);
  P.push({ geometry: bossDome, material: 'steel', position: [0, 0, 0.105] });
  if (hero) {
    const bossTip = new THREE.ConeGeometry(0.017, 0.05, 4);
    bossTip.rotateX(90 * DEG);
    P.push({ geometry: bossTip, material: 'steelBright', position: [0, 0, 0.175] });
    P.push(...rivetsXY(ctx, 6, 0.124, 0.009, 0.062, 'iron'));
  }

  // ── kenar perçinleri ──
  const rivetCount = hero ? 12 : 8;
  for (let i = 0; i < rivetCount; i++) {
    const a = (i / rivetCount) * TAU;
    const g = new THREE.OctahedronGeometry(0.011, 0);
    g.scale(1, 1, 0.6);
    P.push({ geometry: g, material: 'iron', position: [Math.cos(a) * (R - 0.012), Math.sin(a) * (R - 0.012), 0.026] });
  }

  // ── fraksiyon boyası: merkez halka + iki çeyrek dilim ──
  const paintRing = new THREE.TorusGeometry(R * 0.62, hero ? 0.024 : 0.028, 3, hero ? 12 : 8);
  P.push({ geometry: paintRing, material: 'cloth', position: [0, 0, dome * 0.86] });

  // ── arkada deri kayış + tutamak ──
  const strap = new THREE.BoxGeometry(0.055, 0.62, 0.012);
  P.push({ geometry: strap, material: 'leather', position: [0, 0.06, -0.024] });
  const handle = new THREE.BoxGeometry(0.04, 0.2, 0.03);
  P.push({ geometry: handle, material: 'leatherDark', position: [0, -0.02, -0.032] });
  if (hero) {
    const buckle = new THREE.TorusGeometry(0.024, 0.005, 3, 6);
    P.push({ geometry: buckle, material: 'bronze', position: [0, 0.27, -0.03] });
  }
  return P;
}

/**
 * 11) ŞÖVALYE UÇURTMA / KULE KALKANI (Heater / Kite Shield)
 *    Kavisli (içe bombeli) gövde, çelik kenar, heraldik arma, kemerde taşımak
 *    için guige kayışı.
 */
function buildKiteShield(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  // Tarihsel ölçü: uçurtma kalkanı ≈ 0.60 m genişlik × 1.20 m boy.
  const outline = shieldOutline('kite', hero ? 9 : 6, 0.82);
  const dome = hero ? 0.105 : 0.095;

  // ── ön yüz: kenarlara doğru İÇE kıvrılan (vücudu saran) kapalı kabuk ──
  const face = domeShell(
    outline,
    [
      [0, dome],
      [0.35, dome * 0.9],
      [0.68, dome * 0.6],
      [0.9, dome * 0.16],
      [1, -0.05],
    ],
    { cap: true, jitter: ctx.jitter, facet: hero ? 0.008 : 0 },
  );
  P.push({ geometry: face, material: 'cloth' });

  // ── iç (arka) yüz ──
  const back = domeShell(
    outline,
    [
      [0, dome - 0.05],
      [0.45, dome * 0.82 - 0.044],
      [0.8, dome * 0.4 - 0.03],
      [1, -0.05],
    ],
    { cap: true, jitter: ctx.jitter },
  );
  P.push({ geometry: back, material: 'woodDark' });

  // ── çelik kenar bandı ──
  const band: THREE.Vector2[] = [];
  for (let i = 0; i < outline.length; i++) {
    const prev = outline[(i - 1 + outline.length) % outline.length];
    const next = outline[(i + 1) % outline.length];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = ty / len;
    const ny = -tx / len;
    band.push(v2(outline[i].x + nx * 0.024, outline[i].y + ny * 0.024));
  }
  const rim = shellSweepFixed(band, [
    [0, -0.03],
    [0.016, -0.012],
    [0.02, 0.014],
    [0, 0.03],
  ]);
  P.push({ geometry: rim, material: 'steelDark' });

  // ── heraldik arma (fraksiyon) ──
  const chargePieces = buildCharge(ctx.faction.charge, ctx.faction.colors.secondary, hero ? 0.145 : 0.14, ctx.faction.colors.trim);
  for (const cp of chargePieces) {
    P.push({
      geometry: cp.geometry,
      material: {
        key: 'heraldry',
        color: (cp.material as { color?: number })?.color ?? ctx.faction.colors.secondary,
        metalness: 0.35,
        roughness: 0.55,
        flatShading: true,
      },
      position: [(cp.position?.[0] ?? 0) * 0.78, 0.05 + (cp.position?.[1] ?? 0) * 0.78, dome * 0.8],
      rotation: cp.rotation,
    });
  }

  // ── merkez kaburga + perçinler ──
  if (hero) {
    const rib = new THREE.BoxGeometry(0.026, 0.95, 0.02);
    P.push({ geometry: rib, material: 'steel', position: [0, -0.12, dome * 0.86] });
  }
  const rivetPts: Vec3Tuple[] = hero
    ? [[0, 0.38, dome + 0.01], [0.23, 0.26, dome * 0.92], [-0.23, 0.26, dome * 0.92], [0.2, -0.2, dome * 0.7], [-0.2, -0.2, dome * 0.7], [0, -0.66, dome * 0.3]]
    : [[0, 0.38, dome + 0.01], [0.23, 0.25, dome * 0.92], [-0.23, 0.25, dome * 0.92], [0, -0.64, dome * 0.3]];
  for (const rp of rivetPts) {
    const g = new THREE.OctahedronGeometry(0.014, 0);
    g.scale(1, 1, 0.6);
    P.push({ geometry: g, material: 'gold', position: rp });
  }

  // ── guige (omuz kayışı) + kol kayışları ──
  const guige = tubeFromPoints(
    [v3(-0.17, 0.17, dome - 0.16), v3(-0.05, -0.02, dome - 0.2), v3(0.12, -0.15, dome - 0.16)],
    hero ? 0.017 : 0.02,
    ctx.rad(4),
    2,
  );
  P.push({ geometry: guige, material: 'leather' });
  if (hero) {
    const enarme = tubeFromPoints([v3(0.09, 0.1, dome - 0.15), v3(0.02, 0.0, dome - 0.19), v3(-0.07, -0.09, dome - 0.15)], 0.014, 4, 2);
    P.push({ geometry: enarme, material: 'leatherDark' });
    const buckle = new THREE.TorusGeometry(0.026, 0.006, 3, 6);
    P.push({ geometry: buckle, material: 'bronze', position: [-0.17, 0.17, dome - 0.16] });
  }

  // ── alt uç koruyucu (çelik çorap) ──
  const chausse = new THREE.ConeGeometry(hero ? 0.062 : 0.058, 0.17, ctx.rad(5));
  chausse.rotateX(180 * DEG);
  P.push({ geometry: chausse, material: 'steelDark', position: [0, -0.71, 0.0] });
  return P;
}

/** shellSweep'in yerel sarmalayıcısı: profile'ı Vector2 dizisine çevirir. */
function shellSweepFixed(outline: THREE.Vector2[], profile: Vec2Tuple[], flip = false): THREE.BufferGeometry {
  const g = shellSweep(outline, profile2(profile));
  return flip ? flipWinding(g) : g;
}

/* ═══════════════════════════════════════════════════════════════════════
   ZIRH VE MİĞFERLER
   ═══════════════════════════════════════════════════════════════════════ */

/** Miğfer tası profili (LatheGeometry: x = yarıçap, y = yükseklik). */
function helmProfile(kind: 'great' | 'spangen', segmentsHint: number): THREE.Vector2[] {
  if (kind === 'great') {
    return profile2([
      [0.152, -0.21],
      [0.145, -0.175],
      [0.143, -0.1],
      [0.146, -0.032],
      [0.152, 0.012],
      [0.156, 0.06],
      [0.146, 0.12],
      [0.112, 0.166],
      [0.052, 0.192],
      [0.0, 0.198],
    ]);
  }
  return profile2([
    [0.146, -0.14],
    [0.15, -0.08],
    [0.152, -0.02],
    [0.148, 0.045],
    [0.128, 0.104],
    [0.084, 0.154],
    [0.034, 0.182],
    [0.0, 0.188],
  ]);
}

/**
 * 12) KAPALI ŞÖVALYE MİĞFERİ (Great Helm)
 *    LatheGeometry tas + gerçek göz yarığı (üçgen silme + delik kapama),
 *    çift cidar (dış/iç kabuk) ile kalınlık, burun koruyucu, altın haç,
 *    nefes delikleri, perçinler ve alt bant.
 */
function buildGreatHelm(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const seg = hero ? 10 : 6;
  const prof = helmProfile('great', seg);

  // ── dış kabuk ──
  const outer = new THREE.LatheGeometry(prof, seg);
  weldVertices(outer, 1e-4);
  const carved = carveEyeSlit(outer, hero ? 52 : 62, -0.062, 0.028);
  P.push({ geometry: carved, material: 'steel' });

  // ── iç kabuk (kalınlık + yarıktan bakınca karanlık iç hacim) ──
  if (hero) {
    const innerProf = prof.map((p) => v2(Math.max(0, p.x * 0.9), p.y * 0.985 - 0.004));
    const inner = new THREE.LatheGeometry(innerProf, seg);
    weldVertices(inner, 1e-4);
    flipWinding(inner);
    P.push({ geometry: inner, material: 'dark' });
  }

  // ── alt bant (rolled rim) ──
  const rim = new THREE.TorusGeometry(0.152, hero ? 0.012 : 0.014, 3, seg);
  rim.rotateX(90 * DEG);
  P.push({ geometry: rim, material: 'steelDark', position: [0, -0.208, 0] });

  // ── kaş bandı (yarığın üst sınırı) ──
  const browProf = profile2([[0.155, -0.012], [0.166, -0.006], [0.166, 0.012], [0.155, 0.018]]);
  const brow = new THREE.LatheGeometry(browProf, seg);
  weldVertices(brow, 1e-4);
  P.push({
    geometry: carveEyeSlit(brow, hero ? 52 : 62, -0.02, 0.02),
    material: 'steelDark',
    position: [0, 0.032, 0],
  });

  // ── burun koruyucu (nasal) ──
  const nasal = new THREE.BoxGeometry(hero ? 0.034 : 0.038, 0.13, hero ? 0.026 : 0.03);
  P.push({ geometry: nasal, material: 'steelDark', position: [0, -0.02, 0.152] });
  if (hero) {
    const nasalTip = new THREE.BoxGeometry(0.03, 0.03, 0.024);
    P.push({ geometry: nasalTip, material: 'steelDark', position: [0, -0.086, 0.15] });
  }

  // ── altın haç (alın) ──
  const crossV = new THREE.BoxGeometry(0.026, 0.125, 0.012);
  const crossH = new THREE.BoxGeometry(0.086, 0.026, 0.012);
  P.push({ geometry: crossV, material: 'gold', position: [0, 0.108, 0.141] });
  P.push({ geometry: crossH, material: 'gold', position: [0, 0.108, 0.141] });
  if (hero) {
    const gemGeo = new THREE.OctahedronGeometry(0.014, 0);
    P.push({ geometry: gemGeo, material: 'gem', position: [0, 0.108, 0.152] });
  }

  // ── nefes delikleri (her iki yanakta, artı düzeninde) ──
  const holeCount = hero ? 5 : 3;
  for (const side of [-1, 1]) {
    for (let i = 0; i < holeCount; i++) {
      const a = side * (26 + (i % 2) * 13) * DEG;
      const y = -0.1 + Math.floor(i / 2) * 0.036;
      const r = 0.148 - Math.abs(y) * 0.02;
      const hole = new THREE.CylinderGeometry(0.0075, 0.0075, 0.03, hero ? 5 : 4);
      hole.rotateX(90 * DEG);
      P.push({
        geometry: hole,
        material: 'dark',
        position: [Math.sin(a) * r, y, Math.cos(a) * r],
        rotation: [0, a, 0],
      });
    }
  }

  // ── perçinler (kaş bandı boyunca) ──
  if (hero) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TAU + Math.PI / seg;
      // ön bölgedeki perçinleri atla (göz yarığına denk gelmesin)
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 62 * DEG) continue;
      const g = new THREE.OctahedronGeometry(0.009, 0);
      g.scale(1, 0.7, 1);
      P.push({ geometry: g, material: 'iron', position: [Math.sin(a) * 0.16, 0.036, Math.cos(a) * 0.16] });
    }
  }

  // ── tepe süsü (kısa diken) ──
  const finial = new THREE.ConeGeometry(0.018, 0.05, hero ? 5 : 4);
  P.push({ geometry: finial, material: 'gold', position: [0, 0.22, 0] });
  return P;
}

/** LatheGeometry'den göz yarığı üçgenlerini söker ve delikleri kapatır. */
function carveEyeSlit(g: THREE.BufferGeometry, halfAngleDeg: number, yBottom: number, yTop: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const p = src.attributes.position as THREE.BufferAttribute;
  const keep: number[] = [];
  const c = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      c.x += p.getX(t + k);
      c.y += p.getY(t + k);
      c.z += p.getZ(t + k);
    }
    c.divideScalar(3);
    const ang = Math.atan2(c.x, c.z); // 0 = ön (+Z)
    const inFront = Math.abs(ang) < halfAngleDeg * DEG;
    const inSlit = c.y > yBottom && c.y < yTop;
    if (inFront && inSlit) continue;
    for (let k = 0; k < 3; k++) keep.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  out.computeVertexNormals();
  return capHoles(out);
}

/**
 * 13) KUZAİT / NORD BOYNUZLU MİĞFER
 *    Konik spangen tas, süpürülmüş boynuzlar (gerçek kavis + kemik fasetleri),
 *    burun koruyucu, fraksiyon sorgucu, deri ense koruyucu.
 */
function buildHornedHelm(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const seg = hero ? 8 : 6;
  const prof = helmProfile('spangen', seg);

  // ── konik tas ──
  const skull = new THREE.LatheGeometry(prof, seg);
  weldVertices(skull, 1e-4);
  jitterGeometry(skull, ctx.jitter * 0.6, 77);
  P.push({ geometry: skull, material: 'steel' });

  // ── kaş bandı + burun koruyucu ──
  const browProf = profile2([[0.152, -0.014], [0.166, -0.004], [0.166, 0.016], [0.152, 0.02]]);
  const brow = new THREE.LatheGeometry(browProf, seg);
  P.push({ geometry: brow, material: 'steelDark', position: [0, -0.032, 0] });
  const nasal = new THREE.BoxGeometry(hero ? 0.032 : 0.036, 0.14, hero ? 0.022 : 0.026);
  P.push({ geometry: nasal, material: 'steelDark', position: [0, -0.09, 0.15] });
  const nasalTip = new THREE.ConeGeometry(0.018, 0.04, 4);
  nasalTip.rotateX(180 * DEG);
  P.push({ geometry: nasalTip, material: 'steelDark', position: [0, -0.176, 0.15] });

  // ── spangen şeritleri (tasın üzerindeki çelik bantlar) ──
  if (hero) {
    for (const azim of [0, 90, 180, 270]) {
      const a = azim * DEG;
      const bandSpine: Vec3Tuple[] = [];
      for (let i = 0; i <= 6; i++) {
        const u = i / 6;
        const th = (-10 + u * 188) * DEG;
        const rr = 0.15 * Math.cos(th * 0.5) + 0.006;
        bandSpine.push([Math.sin(a) * rr * Math.cos(th), 0.02 + Math.sin(th) * 0.15, Math.cos(a) * rr * Math.cos(th)]);
      }
      const band = sweep(
        profile2([[-0.011, -0.004], [0.011, -0.004], [0.011, 0.004], [-0.011, 0.004], [-0.011, -0.004]]),
        spine3(bandSpine),
        { seedNormal: v3(Math.sin(a), 0, Math.cos(a)) },
      );
      P.push({ geometry: band, material: 'steelBright' });
    }
  }

  // ── boynuzlar: süpürülmüş kavis + kemik halkaları ──
  const hornSteps = ctx.res(hero ? 9 : 6);
  for (const side of [-1, 1]) {
    const spinePts: Vec3Tuple[] = [];
    for (let i = 0; i <= hornSteps; i++) {
      const t = i / hornSteps;
      const a = t * 118 * DEG;
      spinePts.push([
        side * (0.145 + Math.sin(a) * 0.185),
        0.045 + Math.cos(a) * -0.055 + t * 0.115,
        -0.012 + t * 0.05,
      ]);
    }
    const horn = sweptBlade(ctx, {
      profile: [
        [-0.03, 0],
        [0, -0.034],
        [0.03, 0],
        [0.012, 0.026],
        [-0.012, 0.026],
        [-0.03, 0],
      ],
      spine: spinePts,
      steps: hornSteps + 1,
      scale: (t) => Math.pow(1 - t, 0.72) * 0.96 + 0.04,
      seedNormal: [0, 1, 0],
    });
    P.push({ geometry: horn, material: 'bone' });

    if (hero) {
      // boynuz kaidesi (çelik yüksük) + halka fasetleri
      const ferrule = new THREE.CylinderGeometry(0.038, 0.03, 0.05, 6);
      ferrule.rotateZ(side * 90 * DEG);
      P.push({ geometry: ferrule, material: 'steelDark', position: [side * 0.15, 0.045, -0.012] });
      for (const t of [0.34, 0.6]) {
        const at = spinePts[Math.round(t * hornSteps)];
        const ring = new THREE.TorusGeometry(0.024 * (1 - t * 0.6), 0.005, 3, 5);
        ring.rotateY(90 * DEG);
        P.push({ geometry: ring, material: 'horn', position: at });
      }
    }
  }

  // ── fraksiyon sorgucu (tepe tüyleri) ──
  const plumeCount = hero ? 7 : 4;
  for (let i = 0; i < plumeCount; i++) {
    const t = plumeCount > 1 ? i / (plumeCount - 1) : 0.5;
    const feather = sweptBlade(ctx, {
      profile: [
        [-0.026, 0],
        [0.026, 0],
        [0.018, 0.006],
        [-0.018, 0.006],
        [-0.026, 0],
      ],
      spine: [
        [0, 0.18, -0.02 + (t - 0.5) * 0.05],
        [0, 0.27, -0.06 + (t - 0.5) * 0.08],
        [0, 0.33, -0.14 + (t - 0.5) * 0.1],
      ],
      steps: ctx.res(hero ? 6 : 4),
      scale: (u) => Math.sin(Math.PI * Math.min(1, u * 1.02)) ** 0.5,
      seedNormal: [1, 0, 0],
      twist: () => (t - 0.5) * 0.9,
    });
    P.push({ geometry: feather, material: i % 3 === 1 ? 'clothLight' : 'plume' });
  }

  // ── deri ense/yanak koruyucu ──
  const guardProf = profile2([[0.15, 0.0], [0.168, -0.02], [0.16, -0.075], [0.132, -0.09]]);
  const guard = new THREE.LatheGeometry(guardProf, seg, 105 * DEG, 150 * DEG);
  P.push({ geometry: guard, material: 'leatherDark', position: [0, -0.13, 0] });
  if (hero) {
    const chinStrap = tubeFromPoints([v3(-0.13, -0.14, 0.06), v3(-0.05, -0.2, 0.12), v3(0.05, -0.2, 0.12), v3(0.13, -0.14, 0.06)], 0.008, 4, 2);
    P.push({ geometry: chinStrap, material: 'leather' });
  }

  // ── tepe diken ──
  const spike = new THREE.ConeGeometry(0.02, 0.07, hero ? 5 : 4);
  P.push({ geometry: spike, material: 'steelBright', position: [0, 0.215, 0] });
  return P;
}

/**
 * 14) LOW-POLY GÖĞÜS ZIRHI (Cuirass + Pauldron + Fauld + Gorget)
 *    Lathe gövde (eliptik ölçekli, çekiç fasetli), göğüs omurgası (keel),
 *    üç katmanlı süpürülmüş omuzluk, bel bantları ve fraksiyon astarı.
 */
function buildCuirass(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const seg = hero ? 10 : 8;

  // ── gövde tası (boyun → bel) ──
  const torsoProf = profile2([
    [0.1, 0.3],
    [0.185, 0.27],
    [0.215, 0.19],
    [0.228, 0.09],
    [0.21, 0.0],
    [0.182, -0.11],
    [0.172, -0.17],
  ]);
  const torso = new THREE.LatheGeometry(torsoProf, seg);
  torso.scale(1, 1, 0.8); // eliptik kesit: göğüs derinliği < genişliği
  weldVertices(torso, 1e-4);
  if (hero) {
    jitterGeometry(torso, 0.004, 313);
    quantizeGeometry(torso, 0.012);
  }
  P.push({ geometry: torso, material: 'steel' });

  // ── iç astar (karanlık) ──
  if (hero) {
    const inner = torso.clone();
    inner.scale(0.93, 0.98, 0.93);
    flipWinding(inner);
    P.push({ geometry: inner, material: 'dark' });
  }

  // ── göğüs omurgası (keel) ve sırt omurgası ──
  const keel = new THREE.BoxGeometry(0.036, 0.4, 0.05);
  keel.translate(0, 0.09, 0.185);
  P.push({ geometry: keel, material: 'steelBright' });
  if (hero) {
    const keelBack = new THREE.BoxGeometry(0.032, 0.36, 0.042);
    keelBack.translate(0, 0.09, -0.15);
    P.push({ geometry: keelBack, material: 'steel' });
  }

  // ── boyunluk (gorget) ──
  const gorget = new THREE.TorusGeometry(0.108, hero ? 0.024 : 0.026, 3, seg);
  gorget.rotateX(90 * DEG);
  P.push({ geometry: gorget, material: 'steelDark', position: [0, 0.292, 0] });
  if (hero) {
    const collar = new THREE.LatheGeometry(profile2([[0.1, 0.02], [0.122, 0.0], [0.116, -0.03], [0.096, -0.04]]), seg);
    P.push({ geometry: collar, material: 'mail', position: [0, 0.31, 0] });
  }

  // ── fraksiyon göğüs arması ──
  const charge = buildCharge(ctx.faction.charge, ctx.faction.colors.trim, hero ? 0.075 : 0.07, ctx.faction.colors.secondary);
  for (const cp of charge) {
    P.push({
      geometry: cp.geometry,
      material: {
        key: 'cuirassCharge',
        color: (cp.material as { color?: number })?.color ?? ctx.faction.colors.trim,
        metalness: 0.75,
        roughness: 0.4,
        flatShading: true,
      },
      position: [(cp.position?.[0] ?? 0), 0.15 + (cp.position?.[1] ?? 0), 0.213],
      rotation: cp.rotation,
    });
  }

  // ── bel bantları (fauld) ──
  const fauldCount = hero ? 3 : 2;
  for (let i = 0; i < fauldCount; i++) {
    const t = i / Math.max(1, fauldCount - 1);
    const y = -0.19 - i * 0.055;
    const r = 0.176 + i * 0.014;
    const band = new THREE.LatheGeometry(profile2([[r, 0.024], [r + 0.022, 0.0], [r + 0.016, -0.026], [r - 0.004, -0.03]]), seg);
    band.scale(1, 1, 0.82);
    P.push({ geometry: band, material: i % 2 === 0 ? 'steelDark' : 'steel', position: [0, y, 0] });
    if (hero && t >= 0) {
      // bant uçlarında altın perçin
      for (const s of [-1, 1]) {
        const rv = new THREE.OctahedronGeometry(0.011, 0);
        rv.scale(1, 0.7, 1);
        P.push({ geometry: rv, material: 'gold', position: [s * (r * 0.72), y + 0.004, r * 0.42] });
      }
    }
  }

  // ── kemer + tokası ──
  const belt = new THREE.TorusGeometry(0.188, hero ? 0.022 : 0.024, 3, seg);
  belt.rotateX(90 * DEG);
  belt.scale(1, 1, 0.82);
  P.push({ geometry: belt, material: 'leatherDark', position: [0, -0.16, 0] });
  const buckle = new THREE.BoxGeometry(0.07, 0.06, 0.02);
  P.push({ geometry: buckle, material: 'gold', position: [0, -0.16, 0.156] });

  // ── omuzluklar (pauldron): 3 katman süpürülmüş kabuk ──
  // Kabuk yönleri (rotation.y = ±90° ile):
  //   local +Z (kabuk normali / profil radyal yönü) → dünya ±X = kol ekseni (dışa)
  //   local  x  (kontur yatay)                      → dünya ∓Z = ön/arka
  //   local  y  (kontur dikey)                      → dünya  Y = yukarı/aşağı
  // Kontur omuzluğun DİKEY × ÖN/ARKA kaplamasını, profil ise omuz üzerinden
  // kola doğru dışarı taşan kubbeyi tanımlar.
  const pauldronOutline = profile2([
    [-0.14, -0.03],
    [-0.07, 0.08],
    [0.05, 0.1],
    [0.13, 0.01],
    [0.15, -0.1],
    [0.04, -0.17],
    [-0.08, -0.15],
  ]);
  const pauldronProfile: Vec2Tuple[] = [
    [0.0, 0.014],
    [0.045, 0.04],
    [0.088, 0.03],
    [0.112, -0.012],
    [0.104, -0.055],
  ];
  for (const side of [-1, 1]) {
    const layers = hero ? 3 : 2;
    for (let i = 0; i < layers; i++) {
      const rotY = side > 0 ? 90 * DEG : -90 * DEG;
      const shell = shellSweep(
        pauldronOutline,
        profile2(pauldronProfile.map((q) => [q[0] + i * 0.014, q[1] - i * 0.012] as Vec2Tuple)),
      );
      P.push({
        geometry: shell,
        material: i === 0 ? 'steelBright' : 'steel',
        position: [side * 0.166, 0.245 - i * 0.058, 0],
        rotation: [0, rotY, 0],
      });
      if (hero) {
        // katman eteğinde altın biye
        const trimShell = shellSweep(
          pauldronOutline,
          profile2([
            [0.1 + i * 0.014, -0.055 - i * 0.012],
            [0.116 + i * 0.014, -0.062 - i * 0.012],
            [0.112 + i * 0.014, -0.046 - i * 0.012],
          ]),
        );
        P.push({ geometry: trimShell, material: 'trim', position: [side * 0.166, 0.245 - i * 0.058, 0], rotation: [0, rotY, 0] });
      }
    }
    // omuz tepesi rondel + diken
    const rondel = new THREE.CylinderGeometry(hero ? 0.042 : 0.038, hero ? 0.046 : 0.042, 0.018, ctx.rad(6));
    rondel.rotateZ(side * 90 * DEG);
    P.push({ geometry: rondel, material: 'gold', position: [side * 0.225, 0.268, 0] });
    if (hero && side > 0) {
      const spike = new THREE.ConeGeometry(0.018, 0.07, 4);
      spike.rotateZ(-90 * DEG);
      P.push({ geometry: spike, material: 'steelBright', position: [0.265, 0.28, 0] });
    }
    if (hero && side < 0) {
      // sol omuzda küçük kanat/çıkıntı (asimetrik Bannerlord silüeti)
      const fin = shapeFrom([
        [0, 0],
        [0.1, 0.03],
        [0.13, -0.06],
        [0.04, -0.05],
      ]);
      const finGeo = new THREE.ExtrudeGeometry(fin, extrudeOpts(0.014, 0.004, 1));
      P.push({ geometry: finGeo, material: 'steelDark', position: [-0.236, 0.288, 0], rotation: [0, -90 * DEG, 20 * DEG] });
    }
  }

  // ── koltuk altı / kol ağzı kapakları (içerisi görünmesin) ──
  for (const side of [-1, 1]) {
    const armpit = new THREE.CircleGeometry(0.078, ctx.rad(6));
    armpit.rotateY(side > 0 ? -90 * DEG : 90 * DEG);
    P.push({
      geometry: armpit,
      material: { key: 'armpit', color: 0x1b1a18, metalness: 0.15, roughness: 0.9, flatShading: true, side: THREE.DoubleSide },
      position: [side * 0.175, 0.13, 0],
    });
  }
  return P;
}

/* ═══════════════════════════════════════════════════════════════════════
   KATALOG
   ═══════════════════════════════════════════════════════════════════════ */

const SWING_FAST: Omit<AttackSpec, 'grip' | 'arm' | 'strike'> = {
  type: 'swing', lunge: 0.14, duration: 0.85, impactAt: 0.34, impactSound: 'swordClash',
};

export const ARMORY_CATALOG: ArmoryItemSpec[] = [
  {
    id: 'gladius',
    name: 'İmparatorluk Kısa Kılıcı',
    cls: 'sword',
    faction: 'İmparatorluk',
    twoHanded: false,
    displayScale: 1.15,
    displayOffset: [0, -0.5, 0],
    displayRotation: [0, 0, 8],
    reach: 0.92,
    weightKg: 1.1,
    description:
      'Legion piyadesinin yemin kılıcı. Yaprak biçimli namlu zırh aralığına saplanmak için daraltılmış, kartal başlı altın topuz imparatorluk rütbesini taşır.',
    attack: { ...SWING_FAST, grip: [0, 0.19, 0], arm: [-108, -22, 16], strike: [104, 26, -12], duration: 0.78, impactAt: 0.3 },
    showcaseSound: 'swordClash',
  },
  {
    id: 'greatsword',
    name: 'Çift Elli Şövalye Kılıcı',
    cls: 'sword',
    faction: 'Vlandiya',
    twoHanded: true,
    displayScale: 1.05,
    displayOffset: [0, -0.78, 0],
    displayRotation: [0, 0, 5],
    reach: 1.5,
    weightKg: 2.6,
    description:
      'Kan oluklu (fuller) geniş namlu, aşağı kıvrık ağır siper ve haç kabartmalı kabza. İki elle savrulduğunda kalkan hattını yarar.',
    attack: {
      type: 'swing', grip: [0, 0.18, 0], arm: [-128, -30, 18], strike: [126, 34, -16],
      lunge: 0.24, duration: 1.15, impactAt: 0.5, impactSound: 'swordClash',
    },
    showcaseSound: 'swordClash',
  },
  {
    id: 'scimitar',
    name: 'Kuzait Eğri Kılıcı',
    cls: 'sword',
    faction: 'Kuzait',
    twoHanded: false,
    displayScale: 1.1,
    displayOffset: [0, -0.55, 0],
    displayRotation: [0, 0, 12],
    reach: 0.98,
    weightKg: 1.3,
    description:
      'Bozkırın kesme ustası. Kavisli namlu at sırtında çekme kesikleri üretir; uçtaki yalman genişlemesi darbenin ağırlığını bıçak ucuna taşır.',
    attack: { ...SWING_FAST, grip: [0, 0.2, 0], arm: [-96, -48, 22], strike: [86, 62, -18], duration: 0.72, impactAt: 0.28 },
    showcaseSound: 'swordClash',
  },
  {
    id: 'warAxe',
    name: 'Tek Elli Savaş Baltası',
    cls: 'axe',
    faction: 'Sturgia',
    twoHanded: false,
    displayScale: 1.15,
    displayOffset: [0, -0.42, 0],
    displayRotation: [0, 0, -6],
    reach: 0.86,
    weightKg: 1.6,
    description:
      'Sakallı (bearded) hilal ağız, çekiç poll\'u ve dikenli dip. Kalkana takıp aşağı çeken kuzeyli tekniği için dengelenmiş.',
    attack: {
      type: 'chop', grip: [0, 0.3, 0], arm: [-132, -26, 20], strike: [128, 22, -14],
      lunge: 0.18, duration: 1.0, impactAt: 0.44, impactSound: 'heavyAxeSwing',
    },
    showcaseSound: 'heavyAxeSwing',
  },
  {
    id: 'bardiche',
    name: 'Çift Elli Sturgia Baltası (Bardiche)',
    cls: 'axe',
    faction: 'Sturgia',
    twoHanded: true,
    displayScale: 1.0,
    displayOffset: [0, -0.9, 0],
    displayRotation: [0, 0, -4],
    reach: 1.9,
    weightKg: 3.4,
    description:
      'Sap boyunca uzanan dev hilal ağız ve çelik dil. Druzhinnik\'in hattı: tek savurmada kalkanı da, mızrak hizasını da söker.',
    attack: {
      type: 'chop', grip: [0, 0.82, 0], arm: [-142, -34, 24], strike: [140, 30, -20],
      lunge: 0.3, duration: 1.5, impactAt: 0.66, impactSound: 'heavyAxeSwing',
    },
    showcaseSound: 'heavyAxeSwing',
  },
  {
    id: 'lance',
    name: 'Süvari Kargısı',
    cls: 'polearm',
    faction: 'Vlandiya',
    twoHanded: true,
    displayScale: 0.72,
    displayOffset: [0, -0.9, 0],
    displayRotation: [0, 0, 10],
    reach: 2.36,
    weightKg: 2.2,
    description:
      'Uzun dişbudak gövde, yaprak biçimli çelik uç, el koruyucu (vamplate) ve fraksiyon flamalı. Dörtnala hücumda tüm kinetik enerjiyi uca taşır.',
    attack: {
      type: 'thrust', grip: [0, 1.0, 0], arm: [-24, -18, 0], strike: [16, 12, 0],
      lunge: 0.55, duration: 1.35, impactAt: 0.62, impactSound: 'arrowHit',
    },
    showcaseSound: 'battleHorn',
  },
  {
    id: 'halberd',
    name: 'Halberd / Glaive',
    cls: 'polearm',
    faction: 'İmparatorluk',
    twoHanded: true,
    displayScale: 0.78,
    displayOffset: [0, -0.9, 0],
    displayRotation: [0, 0, 8],
    reach: 2.22,
    weightKg: 2.9,
    description:
      'Mızrak ucu + yan balta ağzı + arka kanca. Süvariyi eyerden çekmek, zırh eklemine saplamak ve hattı tutmak için üç işlev tek gövdede.',
    attack: {
      type: 'thrust', grip: [0, 0.78, 0], arm: [-30, -22, 6], strike: [22, 18, -6],
      lunge: 0.45, duration: 1.4, impactAt: 0.64, impactSound: 'swordClash',
    },
    showcaseSound: 'swordClash',
  },
  {
    id: 'recurveBow',
    name: 'Kavisli Kompozit Yay',
    cls: 'bow',
    faction: 'Kuzait',
    twoHanded: true,
    displayScale: 1.0,
    displayOffset: [0, 0, 0],
    displayRotation: [0, 0, 90],
    reach: 0.7,
    weightKg: 0.9,
    description:
      'Boynuz karın, ahşap çekirdek ve tendon sırt. Uçları içe kıvrık (recurve) gövde kısa boyda yüksek çekiş gücü verir; at sırtında kurmak için tasarlanmış.',
    attack: {
      type: 'draw', grip: [0, 0, 0], arm: [-70, 0, 0], strike: [10, 0, 0],
      pullback: 0.22, lunge: 0, duration: 1.9, impactAt: 1.16, impactSound: 'bowRelease',
    },
    showcaseSound: 'bowRelease',
  },
  {
    id: 'arrow',
    name: 'Tüylü Savaş Oku',
    cls: 'arrow',
    faction: 'Kuzait',
    twoHanded: false,
    displayScale: 1.7,
    displayOffset: [0, 0, 0],
    displayRotation: [0, 0, -28],
    reach: 0.46,
    weightKg: 0.05,
    description:
      'Dört yüzlü bodkin uç zırh halkalarını aralar; üç tüy (kırmızı-beyaz-kırmızı) oku döndürerek uçuşu stabilize eder.',
    attack: {
      type: 'thrust', grip: [0, -0.2, 0], arm: [-40, 0, 0], strike: [70, 0, 0],
      lunge: 0.9, duration: 0.55, impactAt: 0.3, impactSound: 'arrowHit',
    },
    showcaseSound: 'arrowHit',
  },
  {
    id: 'vikingShield',
    name: 'Yuvarlak Viking Kalkanı',
    cls: 'shield',
    faction: 'Sturgia',
    twoHanded: false,
    displayScale: 1.15,
    displayOffset: [0, 0, 0],
    displayRotation: [0, -18, 6],
    reach: 0.72,
    weightKg: 5.4,
    description:
      'Kubbeli tahta gövde, demir kenar çemberi ve konik göbek (boss). Göbek yumruk darbelerini dağıtır, çıtalar balta ağızını tutar.',
    attack: {
      type: 'bash', grip: [0, 0, -0.06], arm: [-26, -18, 0], strike: [22, 24, 0],
      lunge: 0.28, duration: 0.95, impactAt: 0.46, impactSound: 'shieldBlock',
    },
    showcaseSound: 'shieldBlock',
  },
  {
    id: 'kiteShield',
    name: 'Şövalye Uçurtma Kalkanı',
    cls: 'shield',
    faction: 'Vlandiya',
    twoHanded: false,
    displayScale: 0.95,
    displayOffset: [0, 0.1, 0],
    displayRotation: [0, -16, 4],
    reach: 1.5,
    weightKg: 6.8,
    description:
      'İçe bombeli heater gövde, çelik kenar bandı ve guige kayışı. Eyerde bacakları örten uzun alt uç, eyerden alma hücumlarında hayat kurtarır.',
    attack: {
      type: 'bash', grip: [0, 0.1, -0.08], arm: [-24, -22, 0], strike: [18, 26, 0],
      lunge: 0.24, duration: 1.05, impactAt: 0.5, impactSound: 'shieldBlock',
    },
    showcaseSound: 'shieldBlock',
  },
  {
    id: 'greatHelm',
    name: 'Kapalı Şövalye Miğferi (Great Helm)',
    cls: 'armor',
    faction: 'Vlandiya',
    twoHanded: false,
    displayScale: 1.9,
    displayOffset: [0, -0.05, 0],
    displayRotation: [0, -22, 0],
    reach: 0.4,
    weightKg: 2.8,
    description:
      'Tam kapalı tas, dar göz yarığı, nefes delikleri ve alın üzerinde altın haç. Görüşü kısar ama mızrak hücumunda yüzü kurtarır.',
    attack: {
      type: 'raise', grip: [0, 0, 0], arm: [-24, 0, 0], strike: [22, 0, 0],
      lunge: 0, duration: 1.2, impactAt: 0.6, impactSound: 'shieldBlock',
    },
    showcaseSound: 'battleHorn',
  },
  {
    id: 'hornedHelm',
    name: 'Boynuzlu Nord Miğferi',
    cls: 'armor',
    faction: 'Sturgia',
    twoHanded: false,
    displayScale: 1.9,
    displayOffset: [0, -0.06, 0],
    displayRotation: [0, -20, 0],
    reach: 0.42,
    weightKg: 2.4,
    description:
      'Konik spangen tas, süpürülmüş kemik boynuzlar ve fraksiyon sorgucu. Konik tepe balta ağızını yana kaydırır; boynuzlar silüeti büyütüp korku salar.',
    attack: {
      type: 'raise', grip: [0, 0, 0], arm: [-26, 0, 0], strike: [24, 0, 0],
      lunge: 0, duration: 1.2, impactAt: 0.6, impactSound: 'shieldBlock',
    },
    showcaseSound: 'battleHorn',
  },
  {
    id: 'cuirass',
    name: 'Göğüs Zırhı + Omuzluklar',
    cls: 'armor',
    faction: 'İmparatorluk',
    twoHanded: false,
    displayScale: 1.25,
    displayOffset: [0, -0.1, 0],
    displayRotation: [0, -18, 0],
    reach: 0.6,
    weightKg: 9.5,
    description:
      'Eliptik gövde tası, göğüs omurgası (keel), üç katmanlı omuzluk, bel bantları ve boyunluk. Kavisli yüzeyler oku sektirir, katmanlar omuz darbelerini yayar.',
    attack: {
      type: 'raise', grip: [0, 0, 0], arm: [-18, 0, 0], strike: [16, 0, 0],
      lunge: 0, duration: 1.3, impactAt: 0.65, impactSound: 'shieldBlock',
    },
    showcaseSound: 'battleHorn',
  },
  {
    id: 'flangedMace',
    name: 'Dilimli Aseray Topuzu',
    cls: 'mace',
    faction: 'Aseray',
    twoHanded: false,
    displayScale: 0.85,
    displayOffset: [0, -0.42, 0],
    displayRotation: [0, 0, 10],
    reach: 0.72,
    weightKg: 1.6,
    description:
      'Yıldız kesitli çelik başı zırh plakasını içe göçertmek için dövüldü. Çöl süvarisinin eyerinde kılıçtan önce bu asılır: kalkan kavsa da kemik kırılır.',
    attack: {
      type: 'bash', grip: [0, 0.16, 0], arm: [-104, -20, 12], strike: [100, 24, -10],
      lunge: 0.12, duration: 0.82, impactAt: 0.32, impactSound: 'shieldBlock',
    },
    showcaseSound: 'shieldBlock',
  },
  {
    id: 'warHammer',
    name: 'Şövalye Savaş Çekici',
    cls: 'mace',
    faction: 'Vlandiya',
    twoHanded: false,
    displayScale: 0.9,
    displayOffset: [0, -0.45, 0],
    displayRotation: [0, 0, 6],
    reach: 0.78,
    weightKg: 2.0,
    description:
      'Dört yüzlü vuruş piramidi miğferi içeriden titretecek kadar yoğun; arkadaki ince gaga zincir halkasının arasını bulur. Turnuva değil, iş aleti.',
    attack: {
      type: 'bash', grip: [0, 0.17, 0], arm: [-118, -26, 14], strike: [114, 28, -12],
      lunge: 0.16, duration: 0.95, impactAt: 0.4, impactSound: 'shieldBlock',
    },
    showcaseSound: 'shieldBlock',
  },
  {
    id: 'morningstar',
    name: 'Zincirli Morningstar',
    cls: 'mace',
    faction: 'Sturgia',
    twoHanded: false,
    displayScale: 0.85,
    displayOffset: [0, -0.42, 0],
    displayRotation: [0, 0, 14],
    reach: 0.68,
    weightKg: 2.4,
    description:
      'Dikenli demir top üç halkalı zincirin ucunda savrulur; savuşturması kolay, kestirmesi imkânsız. Kuzey taygasında kalkanlı duvarı çatlatan köylü silahı.',
    attack: {
      type: 'bash', grip: [0, 0.15, 0], arm: [-96, -30, 20], strike: [110, 34, -16],
      lunge: 0.1, duration: 1.0, impactAt: 0.45, impactSound: 'swordClash',
    },
    showcaseSound: 'swordClash',
  },
  {
    id: 'billhook',
    name: 'Vlandya Billhook\'u',
    cls: 'polearm',
    faction: 'Vlandiya',
    twoHanded: true,
    displayScale: 2.1,
    displayOffset: [0, -1.05, 0],
    displayRotation: [0, 0, 4],
    reach: 2.05,
    weightKg: 2.6,
    description:
      'Çiftlik çapalarından bozma kanca ağzı süvariyi eyerden çeker, sırt dikeni mızrak gibi iter. Piyade hattının atlılara karşı en ucuz cevabı.',
    attack: {
      type: 'chop', grip: [0, 0.55, 0], arm: [-120, -18, 10], strike: [118, 22, -8],
      lunge: 0.22, duration: 1.1, impactAt: 0.48, impactSound: 'heavyAxeSwing',
    },
    showcaseSound: 'heavyAxeSwing',
  },
  {
    id: 'paviseShield',
    name: 'İmparatorluk Pavise Kalkanı',
    cls: 'shield',
    faction: 'İmparatorluk',
    twoHanded: false,
    displayScale: 1.2,
    displayOffset: [0, -0.6, 0],
    displayRotation: [0, -18, 0],
    reach: 1.1,
    weightKg: 3.6,
    description:
      'Boylu boyunca çelik omurgalı, kavisli dev gövde; okçu siperi olarak yere çakılır, sahra duvarı olur. Ön yüzdeki haç lejyon consecratio\'sunu taşır.',
    attack: {
      type: 'raise', grip: [0, 0, 0], arm: [-18, 0, 8], strike: [16, 0, -6],
      pullback: 0.1, lunge: 0, duration: 1.0, impactAt: 0.5, impactSound: 'shieldBlock',
    },
    showcaseSound: 'shieldBlock',
  },
  {
    id: 'cavalryRound',
    name: 'Kuzait Süvari Round Kalkanı',
    cls: 'shield',
    faction: 'Kuzait',
    twoHanded: false,
    displayScale: 0.62,
    displayOffset: [0, -0.31, 0],
    displayRotation: [0, -24, 0],
    reach: 0.55,
    weightKg: 1.7,
    description:
      'Derin bombeli çelik kubbe: okları kaydırır, yakın dövüşte yumruk gibi kullanılır. Bozkır akıncısının sol kolunda hafifliğinden ödün vermez.',
    attack: {
      type: 'raise', grip: [0, 0, 0], arm: [-22, 0, 10], strike: [20, 0, -8],
      pullback: 0.08, lunge: 0, duration: 0.9, impactAt: 0.45, impactSound: 'shieldBlock',
    },
    showcaseSound: 'shieldBlock',
  },
  {
    id: 'nasalHelm',
    name: 'Lejyon Nasal Miğferi',
    cls: 'armor',
    faction: 'İmparatorluk',
    twoHanded: false,
    displayScale: 0.42,
    displayOffset: [0, -0.1, 0],
    displayRotation: [0, -22, 0],
    reach: 0.34,
    weightKg: 1.3,
    description:
      'Konik tasın alnından inen nasal çubuğu burun kökünü, ense dilimleri boyun vuruşlarını karşılar. Lejyon veteranının kırk yıllık sigortası.',
    attack: {
      type: 'raise', grip: [0, 0, 0], arm: [-24, 0, 0], strike: [22, 0, 0],
      lunge: 0, duration: 1.2, impactAt: 0.6, impactSound: 'shieldBlock',
    },
    showcaseSound: 'battleHorn',
  },
  {
    id: 'kettleHat',
    name: 'Sturgia Kettle Hat\'ı',
    cls: 'armor',
    faction: 'Sturgia',
    twoHanded: false,
    displayScale: 0.36,
    displayOffset: [0, -0.08, 0],
    displayRotation: [0, -22, 0],
    reach: 0.3,
    weightKg: 1.0,
    description:
      'Geniş konik kenarlığı yukarıdan düşen ok ve gürzü sekiyor; görüşü kapatmadığı için balta hattında great helm\'den yeğ. Kar fırtınasında şemsiye niyetine de geçer.',
    attack: {
      type: 'raise', grip: [0, 0, 0], arm: [-24, 0, 0], strike: [22, 0, 0],
      lunge: 0, duration: 1.2, impactAt: 0.6, impactSound: 'shieldBlock',
    },
    showcaseSound: 'battleHorn',
  },
];


/** Bütçe sınıfları: silah/kalkan sıkı, miğfer orta, gövde zırhı geniş. */
export function budgetFor(id: ArmoryItemId, lod: LodLevel): number {
  const isWeapon = !['greatHelm', 'hornedHelm', 'cuirass', 'nasalHelm', 'kettleHat'].includes(id);
  if (lod === 'hero') return isWeapon ? 600 : id === 'cuirass' ? 2600 : 900;
  if (lod === 'battle') return isWeapon ? BUDGET.weaponMax : id === 'cuirass' ? 420 : 280;
  return isWeapon ? 90 : id === 'cuirass' ? 260 : 170;
}

/* ═══════════════════════════════════════════════════════════════════════
   TOPUZLAR & ÇEKİÇLER (Bölüm 2 ek paketi)
   ═══════════════════════════════════════════════════════════════════════ */

/** Yıldız kesit (topuz başı): dış/iç yarıçap arasında sivri dilimler. */
function flangeStar(points: number, rInner: number, rOuter: number): Vec2Tuple[] {
  const out: Vec2Tuple[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU;
    const r = i % 2 === 0 ? rOuter : rInner;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/**
 * 15) DİKENLİ TOPUZ (Flanged Mace · Aseray)
 *    Yıldız kesitli çelik baş, dilimli sap, bronz bilezik, kubbe dip.
 */
function buildFlangedMace(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const starPts = hero ? 10 : ctx.lod === 'battle' ? 8 : 6;

  // ── sap + deri kabza ──
  P.push(haft(ctx, 0, 0.52, 0.021, 0.017, 'wood', { radial: ctx.rad(), jitter: ctx.jitter, facet: hero ? 0.01 : 0 }));
  P.push(haft(ctx, 0.05, 0.24, 0.024, 0.023, 'leatherDark', { radial: ctx.rad(6) }));
  if (hero) P.push(...bindings(ctx, 0.07, 0.22, 0.026, 5, 'leatherDark'));

  // ── bilezik + baş altı yaka ──
  const collar = new THREE.CylinderGeometry(0.032, 0.026, 0.035, ctx.rad(6));
  collar.translate(0, 0.4, 0);
  P.push({ geometry: collar, material: 'bronze' });

  // ── yıldız kesitli baş (tek extrude = ucuz ve fasetli) ──
  const head = extrudedBlade(
    flangeStar(starPts, 0.045, hero ? 0.085 : 0.078),
    hero ? 0.15 : 0.13,
    hero ? 0.008 : 0.004,
    'steelBright',
    { rotation: [90 * DEG, 0, 0], position: [0, hero ? 0.55 : 0.54, 0] },
  );
  P.push(head);

  // ── merkez göbek + tepe dikeni ──
  const core = new THREE.CylinderGeometry(0.04, 0.044, 0.15, ctx.rad(6));
  core.translate(0, 0.475, 0);
  P.push({ geometry: core, material: 'steel' });
  const spike = new THREE.ConeGeometry(0.02, 0.06, 4);
  P.push({ geometry: spike, material: 'steelBright', position: [0, 0.58, 0] });

  // ── kubbe dip topuzu ──
  P.push(ball(0.026, 'bronze', hero ? 1 : 0, [0, 0.015, 0]));
  if (hero) P.push(...rivets(ctx, 6, 0.045, 0.008, 0.415, 'bronze'));
  return P;
}

/**
 * 16) ŞÖVALYE SAVAŞ ÇEKİCİ (War Hammer · Vlandiya)
 *    Dört yüzlü vuruş piramidi, arkada zırh delen gaga, çelik langetler.
 */
function buildWarHammer(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';

  P.push(haft(ctx, 0, 0.6, 0.023, 0.018, 'wood', { radial: ctx.rad(), jitter: ctx.jitter, facet: hero ? 0.01 : 0 }));
  P.push(haft(ctx, 0.06, 0.26, 0.026, 0.025, 'leatherDark', { radial: ctx.rad(6) }));

  // ── baş gövdesi + vuruş yüzü piramidi ──
  const head = new THREE.BoxGeometry(0.13, 0.085, 0.08);
  P.push({ geometry: head, material: 'steelDark', position: [0.02, 0.52, 0] });
  const face = new THREE.ConeGeometry(0.05, 0.06, 4);
  face.rotateZ(-90 * DEG);
  P.push({ geometry: face, material: 'steelBright', position: [0.115, 0.52, 0] });

  // ── arka gaga (zırh delici) ──
  const beak = new THREE.ConeGeometry(0.028, hero ? 0.14 : 0.11, 4);
  beak.rotateZ(90 * DEG);
  beak.rotateY(12 * DEG);
  P.push({ geometry: beak, material: 'steel', position: [-0.09, 0.525, 0] });

  // ── göz (socket) + tepe çıkıntısı ──
  const socket = new THREE.CylinderGeometry(0.034, 0.03, 0.12, ctx.rad(6));
  socket.translate(0, 0.52, 0);
  P.push({ geometry: socket, material: 'steelDark' });
  const crown = new THREE.ConeGeometry(0.022, 0.05, 4);
  P.push({ geometry: crown, material: 'steel', position: [0, 0.6, 0] });

  if (hero) {
    for (const s of [-1, 1]) {
      const langet = new THREE.BoxGeometry(0.008, 0.18, 0.022);
      P.push({ geometry: langet, material: 'iron', position: [s * 0.025, 0.4, 0] });
    }
    P.push(ball(0.024, 'steel', 0, [0, 0.012, 0]));
  }
  return P;
}

/**
 * 17) ZİNCİRLİ MORNINGSTAR (Flail · Sturgia)
 *    Dönme halkası, üç halkalı zincir, dikenli demir top.
 */
function buildMorningstar(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const battle = ctx.lod !== 'crowd';

  // ── sap ──
  P.push(haft(ctx, 0, 0.42, 0.02, 0.017, 'wood', { radial: ctx.rad(), jitter: ctx.jitter }));
  P.push(haft(ctx, 0.05, 0.2, 0.023, 0.022, 'leatherDark', { radial: ctx.rad(6) }));

  // ── fırdöndü halkası + zincir baklaları ──
  const swivel = new THREE.TorusGeometry(0.02, 0.006, 3, ctx.rad(6));
  P.push({ geometry: swivel, material: 'iron', position: [0, 0.44, 0] });
  const links = hero ? 3 : battle ? 2 : 1;
  for (let i = 0; i < links; i++) {
    const link = new THREE.BoxGeometry(0.012, 0.05, 0.02);
    P.push({
      geometry: link,
      material: 'iron',
      position: [0.012 * (i % 2 === 0 ? 1 : -1), 0.48 + i * 0.036, 0],
      rotation: [i % 2 === 0 ? 0 : 90 * DEG, 0, 14 * DEG],
    });
  }

  // ── dikenli top ──
  const headY = 0.48 + links * 0.036 + 0.045;
  P.push(ball(0.055, 'iron', 0, [0.02, headY, 0], [1, 1.12, 1]));
  // tepe + dip dikeni
  const topSpike = new THREE.ConeGeometry(0.016, 0.06, 4);
  P.push({ geometry: topSpike, material: 'steel', position: [0.02, headY + 0.06, 0] });
  const botSpike = new THREE.ConeGeometry(0.016, 0.06, 4);
  botSpike.rotateX(180 * DEG);
  P.push({ geometry: botSpike, material: 'steel', position: [0.02, headY - 0.06, 0] });
  // yatay halka dikenleri
  const ring = hero ? 6 : battle ? 5 : 4;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * TAU;
    const spike = new THREE.ConeGeometry(0.016, 0.06, 4);
    spike.rotateZ(-90 * DEG);
    spike.rotateY(-a);
    P.push({
      geometry: spike,
      material: 'steel',
      position: [0.02 + Math.cos(a) * 0.05, headY, Math.sin(a) * 0.05],
    });
  }
  P.push(ball(0.02, 'steelDark', 0, [0, 0.01, 0]));
  return P;
}

/**
 * 18) VLANDYA BILLHOOK'U (Bill / Glaive)
 *    Uzun sap, içe kavisli kanca ağzı, arkada delici sırt dikeni.
 */
function buildBillhook(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';

  P.push(...poleShaft(ctx, 0, 1.72, 0.021, 'wood'));
  if (hero) P.push(...bindings(ctx, 0.3, 0.52, 0.024, 6, 'leatherDark'));

  // ── kanca ağzı: içe dönen fasetli kontur ──
  const hook: Vec2Tuple[] = [
    [0.0, 0.0],
    [0.06, 0.07],
    [0.11, 0.18],
    [0.115, 0.3],
    [0.06, 0.4],
    [-0.03, 0.44],
    [-0.075, 0.38],
    [-0.01, 0.32],
    [0.035, 0.24],
    [0.03, 0.12],
    [-0.035, 0.04],
  ];
  P.push(
    extrudedBlade(hook, hero ? 0.026 : 0.02, hero ? 0.008 : 0.004, 'steelBright', {
      rotation: [0, 90 * DEG, 0],
      position: [-0.013, 1.66, 0],
    }),
  );

  // ── sırt dikeni + soket ──
  const spike = new THREE.ConeGeometry(0.02, hero ? 0.16 : 0.12, 4);
  spike.rotateZ(90 * DEG);
  P.push({ geometry: spike, material: 'steel', position: [-0.1, 1.74, 0] });
  const socket = new THREE.CylinderGeometry(0.03, 0.026, 0.16, ctx.rad(6));
  socket.translate(0, 1.66, 0);
  P.push({ geometry: socket, material: 'steelDark' });
  if (hero) {
    const butt = new THREE.CylinderGeometry(0.024, 0.02, 0.06, ctx.rad(6));
    butt.translate(0, 0.03, 0);
    P.push({ geometry: butt, material: 'iron' });
  }
  return P;
}

/* ═══════════════════════════════════════════════════════════════════════
   KALKANLAR (Bölüm 2 ek paketi)
   ═══════════════════════════════════════════════════════════════════════ */

/** Pavise konturu: geniş omuzlu, alt köşeleri pahlı dikdörtgen. */
function paviseOutline(segments: number): THREE.Vector2[] {
  const raw: Vec2Tuple[] = [
    [-0.26, 0.52],
    [0.26, 0.52],
    [0.31, 0.3],
    [0.31, -0.3],
    [0.2, -0.56],
    [-0.2, -0.56],
    [-0.31, -0.3],
    [-0.31, 0.3],
  ];
  const n = Math.max(4, Math.min(raw.length, segments));
  const step = raw.length / n;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const f = i * step;
    const i0 = Math.floor(f) % raw.length;
    const i1 = (i0 + 1) % raw.length;
    const k = f - Math.floor(f);
    pts.push(v2(lerp(raw[i0][0], raw[i1][0], k), lerp(raw[i0][1], raw[i1][1], k)));
  }
  return pts;
}

/**
 * 19) İMPARATORLUK PAVİSE KALKANI
 *    Boylu boyunca omurga, kavisli kapalı kabuk, haç boyalı ön yüz.
 */
function buildPaviseShield(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const outline = paviseOutline(hero ? 8 : ctx.lod === 'battle' ? 8 : 6);

  // ── kapalı kavisli kabuk (ön + arka tek parça) ──
  const shell = domeShell(
    outline,
    hero || ctx.lod === 'battle'
      ? [
          [0, 0.085],
          [0.45, 0.078],
          [0.78, 0.052],
          [1, -0.008],
        ]
      : [
          [0, 0.08],
          [0.6, 0.06],
          [1, -0.008],
        ],
    { cap: true, jitter: ctx.jitter, facet: hero ? 0.008 : 0 },
  );
  P.push({ geometry: shell, material: 'wood' });

  // ── dikey omurga (çelik sırt) ──
  const spine = new THREE.BoxGeometry(0.05, 1.02, 0.05);
  P.push({ geometry: spine, material: 'steelDark', position: [0, 0, 0.075] });

  // ── fraksiyon haçı (boyalı şeritler) ──
  if (ctx.lod !== 'crowd') {
    const vbar = new THREE.BoxGeometry(0.1, 0.72, 0.012);
    P.push({ geometry: vbar, material: 'cloth', position: [0, 0.02, 0.062] });
    const hbar = new THREE.BoxGeometry(0.42, 0.1, 0.012);
    P.push({ geometry: hbar, material: 'cloth', position: [0, 0.16, 0.062] });
  }

  if (hero) {
    const rim = shellSweepFixed(outline, [[-0.014, 0.02], [0.014, 0.02], [0.014, -0.014], [-0.014, -0.014]]);
    P.push({ geometry: rim, material: 'iron' });
    for (let i = 0; i < 5; i++) {
      const y = -0.4 + i * 0.2;
      for (const s of [-1, 1]) {
        const rv = new THREE.OctahedronGeometry(0.011, 0);
        rv.scale(1, 1, 0.72);
        P.push({ geometry: rv, material: 'iron', position: [s * 0.27, y, 0.005] });
      }
    }
    const strap = new THREE.BoxGeometry(0.06, 0.5, 0.014);
    P.push({ geometry: strap, material: 'leather', position: [0, 0, -0.014] });
  }
  return P;
}

/**
 * 20) KUZAİT SÜVARİ ROUND KALKANI
 *    Küçük, çelik, derin bombeli; ok yağmuruna karşı kubbe + sivri göbek.
 */
function buildCavalryRound(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const R = 0.26;
  const outline = shieldOutline('round', hero ? 10 : ctx.lod === 'battle' ? 8 : 6, R / 0.36);

  const shell = domeShell(
    outline,
    [
      [0, 0.09],
      [0.5, 0.082],
      [0.85, 0.045],
      [1, -0.006],
    ],
    { cap: true, jitter: ctx.jitter, facet: hero ? 0.006 : 0 },
  );
  P.push({ geometry: shell, material: 'steel' });

  // ── göbek + sivri tepe ──
  const boss = new THREE.ConeGeometry(0.08, hero ? 0.1 : 0.085, ctx.rad(6));
  boss.rotateX(90 * DEG);
  P.push({ geometry: boss, material: 'steelBright', position: [0, 0, 0.1] });
  if (hero) {
    const tip = new THREE.ConeGeometry(0.014, 0.05, 4);
    tip.rotateX(90 * DEG);
    P.push({ geometry: tip, material: 'steelBright', position: [0, 0, 0.17] });
    P.push(...rivetsXY(ctx, 8, R - 0.03, 0.009, 0.028, 'bronze'));
  }

  // ── mine bandı (fraksiyon emayesi) + kayış ──
  if (ctx.lod !== 'crowd') {
    const band = new THREE.TorusGeometry(R * 0.66, 0.02, 3, ctx.rad(8));
    P.push({ geometry: band, material: 'cloth', position: [0, 0, 0.055] });
  }
  const strap = new THREE.BoxGeometry(0.045, 0.34, 0.012);
  P.push({ geometry: strap, material: 'leatherDark', position: [0, 0, -0.012] });
  return P;
}

/* ═══════════════════════════════════════════════════════════════════════
   MİĞFERLER (Bölüm 2 ek paketi)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 21) NASAL MİĞFER (İmparatorluk lejyon veterani)
 *    Konik tas, kaş bandı, burun koruyan nasal çubuk, ense siperi.
 */
function buildNasalHelm(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const rad = ctx.rad(8);

  // ── konik tas ──
  const skull = new THREE.CylinderGeometry(0.035, 0.155, 0.26, rad, 2);
  skull.translate(0, 0.13, 0);
  if (ctx.jitter) jitterGeometry(skull, ctx.jitter, 91);
  P.push({ geometry: skull, material: 'steel' });

  // ── kaş/alın bandı ──
  const brow = new THREE.CylinderGeometry(0.158, 0.162, 0.05, rad, 1, true);
  brow.translate(0, 0.03, 0);
  P.push({ geometry: brow, material: 'steelDark' });

  // ── nasal (burun) çubuğu ──
  const nasal = new THREE.BoxGeometry(0.022, 0.15, 0.02);
  P.push({ geometry: nasal, material: 'steelBright', position: [0, 0.02, 0.155] });

  // ── ense siperi (3 dilim) ──
  if (ctx.lod !== 'crowd') {
    for (const [x, r] of [[-0.09, 24], [0, 0], [0.09, -24]] as [number, number][]) {
      const flap = new THREE.BoxGeometry(0.09, 0.12, 0.014);
      P.push({ geometry: flap, material: 'steelDark', position: [x, -0.02, -0.13], rotation: [12 * DEG, r * DEG, 0] });
    }
  }

  if (hero) {
    P.push(...rivets(ctx, 8, 0.155, 0.009, 0.055, 'bronze'));
    const crest = new THREE.BoxGeometry(0.014, 0.05, 0.2);
    P.push({ geometry: crest, material: 'bronze', position: [0, 0.26, -0.02] });
  }
  return P;
}

/**
 * 22) KETTLE HAT (Sturgia piyadesi geniş kenarlık)
 *    Geniş konik kenar, alçak tas, tepe kabartması; oklara karşı şemsiye.
 */
function buildKettleHat(ctx: BuildCtx): Piece[] {
  const P: Piece[] = [];
  const hero = ctx.lod === 'hero';
  const rad = ctx.rad(8);

  // ── tas ──
  const skull = new THREE.CylinderGeometry(0.06, 0.15, 0.17, rad, 1);
  skull.translate(0, 0.085, 0);
  if (ctx.jitter) jitterGeometry(skull, ctx.jitter, 97);
  P.push({ geometry: skull, material: 'steel' });

  // ── geniş kenar (açık koni = 16 üçgen) ──
  const brim = new THREE.CylinderGeometry(0.15, 0.27, 0.07, rad, 1, true);
  brim.translate(0, 0.015, 0);
  P.push({ geometry: brim, material: 'steelDark' });

  // ── tepe kabartması + bant ──
  const knob = new THREE.ConeGeometry(0.028, 0.05, 4);
  P.push({ geometry: knob, material: 'steelBright', position: [0, 0.19, 0] });
  if (ctx.lod !== 'crowd') {
    const band = new THREE.CylinderGeometry(0.152, 0.152, 0.03, rad, 1, true);
    band.translate(0, 0.045, 0);
    P.push({ geometry: band, material: 'steelDark' });
  }
  if (hero) {
    P.push(...rivets(ctx, 8, 0.15, 0.008, 0.05, 'iron'));
    // yan havalandırma delikleri hissi: iki alçak kutu
    for (const s of [-1, 1]) {
      const vent = new THREE.BoxGeometry(0.05, 0.016, 0.012);
      P.push({ geometry: vent, material: 'iron', position: [s * 0.11, 0.09, 0.09], rotation: [0, s * -32 * DEG, 0] });
    }
  }
  return P;
}

const BUILDERS: Record<ArmoryItemId, (ctx: BuildCtx) => Piece[]> = {
  gladius: buildGladius,
  greatsword: buildGreatsword,
  scimitar: buildScimitar,
  warAxe: buildWarAxe,
  bardiche: buildBardiche,
  lance: buildLance,
  halberd: buildHalberd,
  recurveBow: buildRecurveBow,
  arrow: buildArrow,
  vikingShield: buildVikingShield,
  kiteShield: buildKiteShield,
  greatHelm: buildGreatHelm,
  hornedHelm: buildHornedHelm,
  cuirass: buildCuirass,
  flangedMace: buildFlangedMace,
  warHammer: buildWarHammer,
  morningstar: buildMorningstar,
  billhook: buildBillhook,
  paviseShield: buildPaviseShield,
  cavalryRound: buildCavalryRound,
  nasalHelm: buildNasalHelm,
  kettleHat: buildKettleHat,
};

export const ARMORY_IDS = Object.keys(BUILDERS) as ArmoryItemId[];

/* ═══════════════════════════════════════════════════════════════════════
   ANA SINIF
   ═══════════════════════════════════════════════════════════════════════ */

export interface ArmoryOptions {
  /** Deterministik üretim tohumu. */
  seed?: number;
  /** Bütçe aşımında konsola uyarı yaz (geliştirme sırasında açık bırak). */
  warnOnBudgetOverflow?: boolean;
}

/**
 * Prosedürel cephanelik. Kullanım:
 *
 *   const armory = new Armory();
 *   const sword  = armory.buildItem('greatsword', 'hero');
 *   scene.add(sword.group);                                  // hiyerarşi
 *   const mesh = new THREE.Mesh(sword.merged, sword.material); // tek draw-call
 *   const crowd = armory.createInstanced('vikingShield', 500);  // InstancedMesh
 */
export class Armory {
  readonly palette: MaterialLibrary;
  readonly faction: FactionPalette;
  readonly budget = new BudgetTracker();
  readonly catalog = ARMORY_CATALOG;
  private seed: number;

  constructor(faction: FactionPalette | string = 'vlandia', options: ArmoryOptions = {}) {
    this.faction = typeof faction === 'string' ? FactionPalette.byId(faction) : faction;
    this.seed = options.seed ?? 20261020;
    this.budget.warn = options.warnOnBudgetOverflow ?? true;
    this.palette = new MaterialLibrary(createArmoryPalette(this.faction));
    this.palette.setFaction(this.faction);
  }

  /** Fraksiyonu değiştir (tüm tint'li materyaller yeniden üretilir). */
  setFaction(faction: FactionPalette | string): void {
    const f = typeof faction === 'string' ? FactionPalette.byId(faction) : faction;
    (this as { faction: FactionPalette }).faction = f;
    for (const [key, def] of Object.entries(createArmoryPalette(f))) this.palette.define(key, def);
    this.palette.setFaction(f);
  }

  getSpec(id: ArmoryItemId): ArmoryItemSpec {
    const spec = ARMORY_CATALOG.find((s) => s.id === id);
    if (!spec) throw new Error(`[Bannerforge] Armory: katalogda "${id}" yok.`);
    return spec;
  }

  /** Bir ekipmanı üret: hem THREE.Group hem merged BufferGeometry döner. */
  buildItem(id: ArmoryItemId, lod: LodLevel = 'hero'): ArmoryItemBuild {
    const builder = BUILDERS[id];
    if (!builder) throw new Error(`[Bannerforge] Armory: "${id}" için üretici yok.`);
    const ctx = ctxFor(lod, this.palette, this.faction, this.seed + hashId(id));
    const pieces = builder(ctx);
    if (pieces.length === 0) throw new Error(`[Bannerforge] Armory: "${id}" üreticisi boş çıktı.`);

    // ── grup (hiyerarşi / materyal başına mesh) ──
    const group = new THREE.Group();
    group.name = `${id}_${lod}`;
    const materials: THREE.MeshStandardMaterial[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const def = this.palette.resolve(piece.material);
      const matKey = def ? def.key : '__inline__' + i;
      const mat = def && this.palette.has(def.key)
        ? this.palette.material(def.key)
        : inlineMaterial((def ?? piece.material) as MaterialDef);
      if (!seen.has(matKey)) {
        seen.add(matKey);
        materials.push(mat);
      }
      const mesh = new THREE.Mesh(piece.geometry, mat);
      mesh.name = piece.name ?? `${matKey}_${i}`;
      if (piece.position) mesh.position.set(piece.position[0], piece.position[1], piece.position[2]);
      if (piece.rotation) mesh.rotation.set(piece.rotation[0], piece.rotation[1], piece.rotation[2]);
      if (piece.scale !== undefined) {
        if (typeof piece.scale === 'number') mesh.scale.setScalar(piece.scale);
        else mesh.scale.set(piece.scale[0], piece.scale[1], piece.scale[2]);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // ── merged (tek draw-call / InstancedMesh) ──
    // Bütçe garantisi: hedef aşıldıysa uzaysal kümeleme ile otomatik LOD.
    const raw = mergePieces(pieces, this.palette);
    const budgetLimit = budgetFor(id, lod);
    const merged = reduceToBudget(raw, budgetLimit);
    const material = this.palette.mergedMaterial(`__merged_${this.faction.id}_${lod}`);
    const triangles = Math.round(triCount(merged));
    const budget = budgetFor(id, lod);
    this.budget.check(`${id}/${lod}`, merged, budget);

    merged.computeBoundingBox();
    const box = merged.boundingBox ?? new THREE.Box3().setFromBufferAttribute(merged.attributes.position as THREE.BufferAttribute);
    const size = box.getSize(new THREE.Vector3());
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);

    return {
      id,
      spec: this.getSpec(id),
      lod,
      group,
      merged,
      material,
      materials,
      triangles,
      budget,
      withinBudget: triangles <= budget,
      boundingBox: box,
      size,
    };
  }

  /** Tüm kataloğu üret (vitrin / test için). */
  buildAll(lod: LodLevel = 'hero'): ArmoryItemBuild[] {
    return ARMORY_IDS.map((id) => this.buildItem(id, lod));
  }

  /**
   * GPU Instancing: merged geometri + tek materyal ile InstancedMesh.
   * 500v500 savaşlarda her birim tipi için bir mesh → draw-call sayısı
   * birim sayısından bağımsız kalır.
   */
  createInstanced(id: ArmoryItemId, count: number, lod: LodLevel = 'battle'): THREE.InstancedMesh {
    const item = this.buildItem(id, lod);
    const mesh = new THREE.InstancedMesh(item.merged, item.material, count);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.name = `instanced_${id}_${lod}`;
    mesh.frustumCulled = true;
    return mesh;
  }

  /**
   * Bir ekipmanı el/askı noktasına takılabilir hale getirir:
   * pivot (grip) orijine gelir, displayOffset + displayScale uygulanır.
   */
  createDisplayNode(item: ArmoryItemBuild, useGrip = true): THREE.Group {
    const holder = new THREE.Group();
    const inner = new THREE.Group();
    inner.add(item.group);
    const s = item.spec.displayScale;
    const off = item.spec.displayOffset;
    const grip = item.spec.attack.grip;
    if (useGrip && (item.spec.cls === 'sword' || item.spec.cls === 'axe' || item.spec.cls === 'polearm')) {
      inner.position.set(-(grip[0] + off[0]) * s, -(grip[1] + off[1]) * s, -(grip[2] + off[2]) * s);
    } else {
      inner.position.set(-off[0] * s, -off[1] * s, -off[2] * s);
    }
    inner.scale.setScalar(s);
    inner.rotation.set(
      item.spec.displayRotation[0] * DEG,
      item.spec.displayRotation[1] * DEG,
      item.spec.displayRotation[2] * DEG,
    );
    holder.add(inner);
    holder.name = `display_${item.id}`;
    return holder;
  }

  /** Bütçe raporunu okunabilir tabloya çevirir. */
  budgetTable(): string {
    const rows = this.budget.reports.map(
      (r) => `${r.ok ? '✓' : '✗'} ${r.name.padEnd(22)} ${String(r.triangles).padStart(5)} / ${String(r.budget).padStart(5)}`,
    );
    return rows.join('\n');
  }
}

/** Satır içi MaterialDef'ten geçici THREE materyali (flama gibi tek kullanımlık parçalar). */
function inlineMaterial(def: MaterialDef): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: def.color,
    metalness: def.metalness,
    roughness: def.roughness,
    flatShading: def.flatShading !== false,
    side: def.side ?? THREE.FrontSide,
    emissive: def.emissive ?? 0x000000,
    emissiveIntensity: def.emissiveIntensity ?? 1,
    transparent: def.transparent ?? false,
    opacity: def.opacity ?? 1,
  });
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
