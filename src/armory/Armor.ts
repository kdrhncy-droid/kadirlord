/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · Armor.ts
 *  Modüler, giyilebilir low-poly zırh sistemi.
 *
 *  Zırh "kuşanma bölgeleri"ne ayrılır; her bölge tier'a (hafif/orta/ağır) ve
 *  LOD'a göre farklı parça kümesi üretir. Karakter (Character.ts) bu parçaları
 *  ilgili EKLEM PIVOT'una bağlar, böylece zırh karakterle birlikte hareket eder.
 *
 *  BÖLGELER: head · neck · torso · shoulders · armsUpper · armsLower · hands
 *            legsUpper · legsLower · feet
 *  TIER:     'light' (gambeson/deri) · 'medium' (mail+levha) · 'heavy' (tam levha)
 *
 *  ÜÇGEN BÜTÇESİ (battle LOD, tüm set): hafif ≈ 90, orta ≈ 190, ağır ≈ 300.
 *  Tüm parçalar flatShading + fraksiyon tint'i (surcoat/astar) destekler.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import {
  DEG,
  LodLevel,
  MaterialDef,
  MaterialLibrary,
  Piece,
  TAU,
  Vec2Tuple,
  Vec3Tuple,
  bendGeometry,
  extrudeOpts,
  jitterGeometry,
  mergePieces,
  profile2,
  quantizeGeometry,
  reduceToBudget,
  shellSweep,
  shapeFrom,
  sweep,
  tubeFromPoints,
  v3,
  weldVertices,
} from './Core.ts';
import { buildCharge, FactionPalette } from './Faction.ts';
import { HUMANOID } from './Rig.ts';

export type ArmorZone =
  | 'head' | 'neck' | 'torso' | 'shoulders'
  | 'armsUpper' | 'armsLower' | 'hands'
  | 'legsUpper' | 'legsLower' | 'feet';

export type ArmorTier = 'light' | 'medium' | 'heavy';

export const ARMOR_ZONES: ArmorZone[] = [
  'head', 'neck', 'torso', 'shoulders',
  'armsUpper', 'armsLower', 'hands',
  'legsUpper', 'legsLower', 'feet',
];

export interface ArmorSet {
  tier: ArmorTier;
  lod: LodLevel;
  /** Bölge → parça listesi. Her parça EKLEM UZAYINDA tanımlıdır. */
  zones: Partial<Record<ArmorZone, ArmorPiece[]>>;
  triangles: number;
}

/** Bir zırh parçası: geometri + hangi ekleme bağlanacağı + yerel ofset. */
export interface ArmorPiece {
  geometry: THREE.BufferGeometry;
  material: string | MaterialDef;
  /** Bağlanacağı eklem (Rig joint adı). */
  joint: string;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple | number;
  name?: string;
}

export interface ArmorOptions {
  tier?: ArmorTier;
  lod?: LodLevel;
  /** Hangi bölgeler kuşanılacak (varsayılan: tier'a göre otomatik). */
  zones?: ArmorZone[];
  faction?: FactionPalette;
  /** Miğfer tipi (heavy: greatHelm, medium: spangen, light: kettle/kep). */
  helmStyle?: 'greatHelm' | 'spangen' | 'kettle' | 'none';
  /** Surcoat/astar (fraksiyon kumaşı) eklensin mi? */
  surcoat?: boolean;
  seed?: number;
}

/* ─────────────────────────── palet ─────────────────────────── */

export function createArmorPalette(f: FactionPalette): Record<string, Omit<MaterialDef, 'key'>> {
  const c = f.colors;
  return {
    plate: { color: c.steel, metalness: 0.72, roughness: 0.46 },
    plateBright: { color: mixArmor(c.steel, 0xffffff, 0.3), metalness: 0.82, roughness: 0.34 },
    plateDark: { color: c.steelDark, metalness: 0.6, roughness: 0.6 },
    mail: { color: mixArmor(c.steelDark, 0x7d838a, 0.45), metalness: 0.55, roughness: 0.74 },
    gold: { color: c.gold, metalness: 0.9, roughness: 0.32 },
    leather: { color: c.leather, metalness: 0.04, roughness: 0.92 },
    leatherDark: { color: mixArmor(c.leather, 0x14100a, 0.45), metalness: 0.04, roughness: 0.95 },
    gambeson: { color: mixArmor(c.cloth, 0xd8cdb4, 0.35), metalness: 0.03, roughness: 0.96, factionTint: 'secondary' },
    surcoat: { color: c.primary, metalness: 0.04, roughness: 0.95, factionTint: 'primary' },
    surcoatTrim: { color: c.trim, metalness: 0.35, roughness: 0.6, factionTint: 'trim' },
    cloth: { color: c.cloth, metalness: 0.04, roughness: 0.95 },
    horn: { color: 0x3b3226, metalness: 0.08, roughness: 0.78 },
    bone: { color: 0xd6cdb2, metalness: 0.04, roughness: 0.82 },
    dark: { color: 0x1b1a18, metalness: 0.15, roughness: 0.9 },
  };
}

function paletteFor(f: FactionPalette): Record<string, Omit<MaterialDef, 'key'>> {
  return createArmorPalette(f);
}

function mixArmor(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

interface Ctx {
  lod: LodLevel;
  tier: ArmorTier;
  faction: FactionPalette;
  rng: () => number;
  jitter: number;
  rad: (n?: number) => number;
  steps: (n: number) => number;
}

function makeCtx(o: { lod: LodLevel; tier: ArmorTier; faction: FactionPalette; seed: number }): Ctx {
  const radialBase = o.lod === 'hero' ? 8 : o.lod === 'battle' ? 6 : 5;
  const stepScale = o.lod === 'hero' ? 1 : o.lod === 'battle' ? 0.55 : 0.38;
  let a = o.seed >>> 0 || 7;
  return {
    lod: o.lod,
    tier: o.tier,
    faction: o.faction,
    rng: () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    jitter: o.lod === 'hero' ? 0.0035 : 0,
    rad: (n = radialBase) => Math.max(4, n),
    steps: (n: number) => Math.max(2, Math.round(n * stepScale)),
  };
}

/* ─────────────────────────── temel parça üreticileri ─────────────────────────── */

/** Eklem boyunca uzanan konik boru (kol/bacak zırhı temel biçimi). */
function limbPlate(
  ctx: Ctx,
  len: number,
  r0: number,
  r1: number,
  mat: string,
  opts: { radial?: number; facet?: number; squash?: number } = {},
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, len, Math.max(4, opts.radial ?? ctx.rad()), ctx.steps(3));
  g.translate(0, -len / 2, 0);
  if (opts.squash) g.scale(1, 1, opts.squash);
  if (ctx.jitter) jitterGeometry(g, ctx.jitter, 91);
  if (opts.facet) quantizeGeometry(g, opts.facet);
  return g;
}

/** Levha kabuğu (omuzluk, göğüs plakası): kontur + profil süpürmesi. */
function plateShell(outline: Vec2Tuple[], profile: Vec2Tuple[]): THREE.BufferGeometry {
  return shellSweep(profile2(outline), profile2(profile));
}

/** Mail (zincir) dokusu hissi: jitter'lı konik boru. */
function mailSleeve(ctx: Ctx, len: number, r0: number, r1: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, len, ctx.rad(6), ctx.steps(4));
  g.translate(0, -len / 2, 0);
  jitterGeometry(g, ctx.lod === 'crowd' ? 0.004 : 0.008, 555);
  return g;
}

/* ═══════════════════════════════════════════════════════════════════════
   BÖLGE ÜRETİCİLERİ
   ═══════════════════════════════════════════════════════════════════════ */

function buildHead(ctx: Ctx, style: NonNullable<ArmorOptions['helmStyle']>): ArmorPiece[] {
  const P: ArmorPiece[] = [];
  const seg = ctx.lod === 'hero' ? 10 : ctx.lod === 'battle' ? 7 : 6;
  const hero = ctx.lod === 'hero';

  if (style === 'none') return P;

  if (style === 'greatHelm') {
    const prof = profile2([
      [0.152, -0.21], [0.145, -0.175], [0.143, -0.1], [0.146, -0.032],
      [0.152, 0.012], [0.156, 0.06], [0.146, 0.12], [0.112, 0.166],
      [0.052, 0.192], [0.0, 0.198],
    ]);
    const shell = new THREE.LatheGeometry(prof, seg);
    weldVertices(shell, 1e-4);
    P.push({ geometry: carveSlit(shell, hero ? 52 : 64, -0.062, 0.028), material: 'plate', joint: 'head', position: [0, 0.055, 0] });
    if (hero) {
      const inner = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p.x * 0.9, p.y * 0.985 - 0.004)), seg);
      P.push({ geometry: flip(inner), material: 'dark', joint: 'head', position: [0, 0.055, 0] });
    }
    const rim = new THREE.TorusGeometry(0.152, hero ? 0.012 : 0.015, 3, seg);
    rim.rotateX(90 * DEG);
    P.push({ geometry: rim, material: 'plateDark', joint: 'head', position: [0, -0.153, 0] });
    const nasal = new THREE.BoxGeometry(hero ? 0.034 : 0.04, 0.13, hero ? 0.026 : 0.032);
    P.push({ geometry: nasal, material: 'plateDark', joint: 'head', position: [0, -0.018, 0.15] });
    const cv = new THREE.BoxGeometry(0.026, 0.12, 0.012);
    const ch = new THREE.BoxGeometry(0.084, 0.026, 0.012);
    P.push({ geometry: cv, material: 'gold', joint: 'head', position: [0, 0.11, 0.138] });
    P.push({ geometry: ch, material: 'gold', joint: 'head', position: [0, 0.11, 0.138] });
    const holes = hero ? 4 : 2;
    for (const side of [-1, 1]) {
      for (let i = 0; i < holes; i++) {
        const a = side * (28 + (i % 2) * 14) * DEG;
        const y = -0.1 + Math.floor(i / 2) * 0.04;
        const h = new THREE.CylinderGeometry(0.008, 0.008, 0.032, hero ? 5 : 4);
        h.rotateX(90 * DEG);
        P.push({ geometry: h, material: 'dark', joint: 'head', position: [Math.sin(a) * 0.147, y + 0.055, Math.cos(a) * 0.147], rotation: [0, a, 0] });
      }
    }
    const finial = new THREE.ConeGeometry(0.018, 0.05, hero ? 5 : 4);
    P.push({ geometry: finial, material: 'gold', joint: 'head', position: [0, 0.275, 0] });
    return P;
  }

  if (style === 'spangen') {
    const prof = profile2([
      [0.146, -0.14], [0.15, -0.08], [0.152, -0.02], [0.148, 0.045],
      [0.128, 0.104], [0.084, 0.154], [0.034, 0.182], [0.0, 0.188],
    ]);
    const skull = new THREE.LatheGeometry(prof, seg);
    weldVertices(skull, 1e-4);
    if (ctx.jitter) jitterGeometry(skull, ctx.jitter * 0.6, 77);
    P.push({ geometry: skull, material: 'plate', joint: 'head', position: [0, 0.05, 0] });
    const nasal = new THREE.BoxGeometry(hero ? 0.032 : 0.038, 0.15, hero ? 0.022 : 0.028);
    P.push({ geometry: nasal, material: 'plateDark', joint: 'head', position: [0, -0.045, 0.148] });
    const tip = new THREE.ConeGeometry(0.018, 0.04, 4);
    tip.rotateX(180 * DEG);
    P.push({ geometry: tip, material: 'plateDark', joint: 'head', position: [0, -0.138, 0.148] });
    // boynuzlar (Nord/Sturgiya silüeti)
    const hornSteps = ctx.steps(8);
    for (const side of [-1, 1]) {
      const spinePts: Vec3Tuple[] = [];
      for (let i = 0; i <= hornSteps; i++) {
        const t = i / hornSteps;
        const a = t * 116 * DEG;
        spinePts.push([side * (0.145 + Math.sin(a) * 0.18), 0.09 + t * 0.11 - Math.cos(a) * 0.05, -0.012 + t * 0.05]);
      }
      const horn = sweep(
        profile2([[-0.03, 0], [0, -0.034], [0.03, 0], [0.012, 0.026], [-0.012, 0.026], [-0.03, 0]]),
        spinePts.map((p) => v3(...p)),
        { scale: (t) => Math.pow(1 - t, 0.72) * 0.95 + 0.05, seedNormal: v3(0, 1, 0) },
      );
      P.push({ geometry: horn, material: 'bone', joint: 'head' });
      if (hero) {
        const ferrule = new THREE.CylinderGeometry(0.036, 0.03, 0.05, 6);
        ferrule.rotateZ(side * 90 * DEG);
        P.push({ geometry: ferrule, material: 'plateDark', joint: 'head', position: [side * 0.15, 0.09, -0.012] });
      }
    }
    // fraksiyon sorgucu
    const plumes = hero ? 6 : 3;
    for (let i = 0; i < plumes; i++) {
      const t = plumes > 1 ? i / (plumes - 1) : 0.5;
      const feather = sweep(
        profile2([[-0.024, 0], [0.024, 0], [0.016, 0.006], [-0.016, 0.006], [-0.024, 0]]),
        [v3(0, 0.22, -0.02 + (t - 0.5) * 0.05), v3(0, 0.3, -0.07 + (t - 0.5) * 0.08), v3(0, 0.35, -0.15 + (t - 0.5) * 0.1)],
        { scale: (u) => Math.sin(Math.PI * Math.min(1, u * 1.02)) ** 0.5, seedNormal: v3(1, 0, 0), twist: () => (t - 0.5) * 0.8 },
      );
      P.push({ geometry: feather, material: i % 3 === 1 ? 'surcoatTrim' : 'surcoat', joint: 'head' });
    }
    const spike = new THREE.ConeGeometry(0.02, 0.07, hero ? 5 : 4);
    P.push({ geometry: spike, material: 'plateBright', joint: 'head', position: [0, 0.27, 0] });
    if (hero) {
      const guard = new THREE.LatheGeometry(profile2([[0.15, 0], [0.166, -0.02], [0.158, -0.07], [0.132, -0.085]]), seg, 100 * DEG, 160 * DEG);
      P.push({ geometry: guard, material: 'leatherDark', joint: 'head', position: [0, -0.09, 0] });
    }
    return P;
  }

  // kettle hat (hafif tier): geniş kenarlı konik şapka
  const prof = profile2([[0.02, 0.16], [0.09, 0.13], [0.14, 0.05], [0.155, -0.01], [0.24, -0.035], [0.245, -0.055], [0.15, -0.04]]);
  const kettle = new THREE.LatheGeometry(prof, seg);
  weldVertices(kettle, 1e-4);
  P.push({ geometry: kettle, material: 'plate', joint: 'head', position: [0, 0.06, 0] });
  const brim = new THREE.TorusGeometry(0.242, hero ? 0.012 : 0.015, 3, seg);
  brim.rotateX(90 * DEG);
  P.push({ geometry: brim, material: 'plateDark', joint: 'head', position: [0, 0.008, 0] });
  if (hero) {
    const finial = new THREE.SphereGeometry(0.024, 5, 4);
    P.push({ geometry: finial, material: 'gold', joint: 'head', position: [0, 0.235, 0] });
  }
  return P;
}

function carveSlit(g: THREE.BufferGeometry, halfAngleDeg: number, yBottom: number, yTop: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g.clone();
  const p = src.attributes.position as THREE.BufferAttribute;
  const keep: number[] = [];
  for (let t = 0; t < p.count; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += p.getX(t + k); cy += p.getY(t + k); cz += p.getZ(t + k);
    }
    cx /= 3; cy /= 3; cz /= 3;
    const ang = Math.atan2(cx, cz);
    if (Math.abs(ang) < halfAngleDeg * DEG && cy > yBottom && cy < yTop) continue;
    for (let k = 0; k < 3; k++) keep.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  out.computeVertexNormals();
  return out;
}

function flip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position as THREE.BufferAttribute;
  const arr = new Float32Array(p.array as ArrayLike<number>);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  // üçgen sırasını ters çevir
  const idx: number[] = [];
  for (let i = 0; i < p.count; i += 3) idx.push(i + 2, i + 1, i);
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

function buildNeck(ctx: Ctx): ArmorPiece[] {
  const P: ArmorPiece[] = [];
  const hero = ctx.lod === 'hero';
  if (ctx.tier === 'light') {
    const collar = new THREE.LatheGeometry(profile2([[0.085, 0.03], [0.1, 0.0], [0.095, -0.04], [0.075, -0.05]]), ctx.rad(7));
    P.push({ geometry: collar, material: 'gambeson', joint: 'neck', position: [0, -0.01, 0] });
    return P;
  }
  if (ctx.tier === 'medium') {
    const mail = new THREE.LatheGeometry(profile2([[0.09, 0.04], [0.115, 0.0], [0.11, -0.06], [0.085, -0.09]]), ctx.rad(7));
    jitterGeometry(mail, hero ? 0.006 : 0.004, 212);
    P.push({ geometry: mail, material: 'mail', joint: 'neck', position: [0, -0.01, 0] });
    return P;
  }
  // heavy: gorget (levha boyunluk) + mail astar
  const gorget = new THREE.LatheGeometry(profile2([[0.095, 0.035], [0.122, 0.005], [0.118, -0.045], [0.095, -0.06]]), ctx.rad(8));
  P.push({ geometry: gorget, material: 'plate', joint: 'neck', position: [0, -0.005, 0] });
  const trim = new THREE.TorusGeometry(0.121, hero ? 0.008 : 0.01, 3, ctx.rad(8));
  trim.rotateX(90 * DEG);
  P.push({ geometry: trim, material: 'gold', joint: 'neck', position: [0, 0.028, 0] });
  if (hero) {
    const mail = new THREE.LatheGeometry(profile2([[0.088, -0.05], [0.108, -0.075], [0.1, -0.12], [0.08, -0.13]]), ctx.rad(7));
    jitterGeometry(mail, 0.006, 333);
    P.push({ geometry: mail, material: 'mail', joint: 'neck', position: [0, 0, 0] });
  }
  return P;
}

function buildTorso(ctx: Ctx): ArmorPiece[] {
  const P: ArmorPiece[] = [];
  const hero = ctx.lod === 'hero';
  const seg = ctx.rad(ctx.lod === 'hero' ? 10 : 8);

  if (ctx.tier === 'light') {
    // gambeson: kalın, yumuşak, dikey dikişli
    const body = new THREE.LatheGeometry(
      profile2([[0.175, 0.3], [0.2, 0.25], [0.212, 0.14], [0.208, 0.02], [0.19, -0.1], [0.178, -0.2]]),
      seg,
    );
    body.scale(1, 1, 0.82);
    jitterGeometry(body, hero ? 0.006 : 0.004, 808);
    P.push({ geometry: body, material: 'gambeson', joint: 'pelvis', position: [0, 0.02, 0] });
    if (hero) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const stitch = new THREE.BoxGeometry(0.012, 0.44, 0.012);
        P.push({
          geometry: stitch,
          material: 'surcoatTrim',
          joint: 'pelvis',
          position: [Math.sin(a) * 0.196, 0.07, Math.cos(a) * 0.16],
        });
      }
    }
    const belt = new THREE.TorusGeometry(0.192, hero ? 0.02 : 0.024, 3, seg);
    belt.rotateX(90 * DEG);
    belt.scale(1, 1, 0.82);
    P.push({ geometry: belt, material: 'leatherDark', joint: 'pelvis', position: [0, -0.14, 0] });
    return P;
  }

  if (ctx.tier === 'medium') {
    // mail gömlek + göğüs levhası + etek
    const mail = new THREE.LatheGeometry(
      profile2([[0.17, 0.3], [0.198, 0.24], [0.212, 0.12], [0.2, 0.0], [0.185, -0.12], [0.176, -0.24]]),
      seg,
    );
    mail.scale(1, 1, 0.82);
    jitterGeometry(mail, hero ? 0.007 : 0.005, 909);
    P.push({ geometry: mail, material: 'mail', joint: 'pelvis', position: [0, 0.02, 0] });
    // yarım göğüs levhası
    const breast = plateShell(
      [[-0.13, 0.14], [-0.155, 0.0], [-0.12, -0.16], [0.12, -0.16], [0.155, 0.0], [0.13, 0.14]],
      [[0, 0.012], [0.05, 0.03], [0.085, 0.012], [0.092, -0.018]],
    );
    P.push({ geometry: breast, material: 'plate', joint: 'chest', position: [0, -0.04, 0.1] });
    const belt = new THREE.TorusGeometry(0.19, hero ? 0.02 : 0.024, 3, seg);
    belt.rotateX(90 * DEG);
    belt.scale(1, 1, 0.82);
    P.push({ geometry: belt, material: 'leatherDark', joint: 'pelvis', position: [0, -0.16, 0] });
    const buckle = new THREE.BoxGeometry(0.065, 0.055, 0.02);
    P.push({ geometry: buckle, material: 'gold', joint: 'pelvis', position: [0, -0.16, 0.152] });
    return P;
  }

  // ── heavy: tam levha gövde (cuirass) ──
  const torso = new THREE.LatheGeometry(
    profile2([
      [0.1, 0.3], [0.185, 0.27], [0.215, 0.19], [0.228, 0.09],
      [0.21, 0.0], [0.182, -0.11], [0.172, -0.17],
    ]),
    seg,
  );
  torso.scale(1, 1, 0.8);
  weldVertices(torso, 1e-4);
  if (hero) {
    jitterGeometry(torso, 0.004, 313);
    quantizeGeometry(torso, 0.012);
  }
  P.push({ geometry: torso, material: 'plate', joint: 'pelvis', position: [0, -0.02, 0] });
  if (hero) {
    const inner = torso.clone();
    inner.scale(0.93, 0.98, 0.93);
    P.push({ geometry: flip(inner), material: 'dark', joint: 'pelvis', position: [0, -0.02, 0] });
  }
  // göğüs omurgası (keel)
  const keel = new THREE.BoxGeometry(0.036, 0.4, 0.05);
  P.push({ geometry: keel, material: 'plateBright', joint: 'chest', position: [0, -0.02, 0.17] });
  // fraksiyon arması
  const charge = buildCharge(ctx.faction.charge, ctx.faction.colors.trim, hero ? 0.07 : 0.065, ctx.faction.colors.secondary);
  for (const cp of charge) {
    P.push({
      geometry: cp.geometry,
      material: { key: 'armorCharge', color: (cp.material as { color?: number })?.color ?? ctx.faction.colors.trim, metalness: 0.7, roughness: 0.42, flatShading: true },
      joint: 'chest',
      position: [(cp.position?.[0] ?? 0) * 0.9, 0.04 + (cp.position?.[1] ?? 0) * 0.9, 0.2],
      rotation: cp.rotation,
    });
  }
  // bel bantları (fauld)
  const bands = hero ? 3 : 2;
  for (let i = 0; i < bands; i++) {
    const r = 0.176 + i * 0.014;
    const band = new THREE.LatheGeometry(profile2([[r, 0.024], [r + 0.022, 0], [r + 0.016, -0.026], [r - 0.004, -0.03]]), seg);
    band.scale(1, 1, 0.82);
    P.push({ geometry: band, material: i % 2 === 0 ? 'plateDark' : 'plate', joint: 'pelvis', position: [0, -0.21 - i * 0.055, 0] });
  }
  const belt = new THREE.TorusGeometry(0.188, hero ? 0.022 : 0.026, 3, seg);
  belt.rotateX(90 * DEG);
  belt.scale(1, 1, 0.82);
  P.push({ geometry: belt, material: 'leatherDark', joint: 'pelvis', position: [0, -0.18, 0] });
  const buckle = new THREE.BoxGeometry(0.07, 0.06, 0.02);
  P.push({ geometry: buckle, material: 'gold', joint: 'pelvis', position: [0, -0.18, 0.154] });
  return P;
}

function buildShoulders(ctx: Ctx): ArmorPiece[] {
  const P: ArmorPiece[] = [];
  const hero = ctx.lod === 'hero';
  if (ctx.tier === 'light') {
    // deri omuz koruyucuları
    for (const side of [-1, 1]) {
      const pad = new THREE.SphereGeometry(0.085, ctx.rad(6), 4, 0, TAU, 0, 105 * DEG);
      pad.scale(1, 0.8, 1.05);
      P.push({ geometry: pad, material: 'leather', joint: side > 0 ? 'shoulderR' : 'shoulderL', position: [side * 0.02, 0.01, 0] });
    }
    return P;
  }

  const outline: Vec2Tuple[] = [
    [-0.14, -0.03], [-0.07, 0.08], [0.05, 0.1], [0.13, 0.01],
    [0.15, -0.1], [0.04, -0.17], [-0.08, -0.15],
  ];
  const profileLight: Vec2Tuple[] = [[0, 0.012], [0.05, 0.032], [0.09, 0.02], [0.105, -0.02]];
  const profileHeavy: Vec2Tuple[] = [[0, 0.014], [0.045, 0.04], [0.088, 0.03], [0.112, -0.012], [0.104, -0.055]];
  const layers = ctx.tier === 'heavy' ? (hero ? 3 : 2) : 1;

  for (const side of [-1, 1]) {
    const joint = side > 0 ? 'shoulderR' : 'shoulderL';
    const rotY = side > 0 ? 90 * DEG : -90 * DEG;
    for (let i = 0; i < layers; i++) {
      const prof = ctx.tier === 'heavy' ? profileHeavy : profileLight;
      const shell = plateShell(outline, prof.map((q) => [q[0] + i * 0.014, q[1] - i * 0.012] as Vec2Tuple));
      P.push({
        geometry: shell,
        material: i === 0 ? 'plateBright' : 'plate',
        joint,
        position: [side * 0.045, 0.03 - i * 0.058, 0],
        rotation: [0, rotY, 0],
      });
      if (hero && ctx.tier === 'heavy') {
        const trim = plateShell(outline, [
          [0.1 + i * 0.014, -0.055 - i * 0.012],
          [0.116 + i * 0.014, -0.062 - i * 0.012],
          [0.112 + i * 0.014, -0.046 - i * 0.012],
        ]);
        P.push({ geometry: trim, material: 'surcoatTrim', joint, position: [side * 0.045, 0.03 - i * 0.058, 0], rotation: [0, rotY, 0] });
      }
    }
    if (ctx.tier === 'heavy') {
      const rondel = new THREE.CylinderGeometry(hero ? 0.042 : 0.038, hero ? 0.046 : 0.042, 0.018, ctx.rad(6));
      rondel.rotateZ(side * 90 * DEG);
      P.push({ geometry: rondel, material: 'gold', joint, position: [side * 0.11, 0.05, 0] });
    }
  }
  return P;
}

function buildArms(ctx: Ctx, zone: 'armsUpper' | 'armsLower' | 'hands'): ArmorPiece[] {
  const P: ArmorPiece[] = [];
  const hero = ctx.lod === 'hero';
  const upperLen = HUMANOID.upperArm;
  const foreLen = HUMANOID.forearm;

  if (zone === 'armsUpper') {
    for (const side of [-1, 1]) {
      const joint = side > 0 ? 'upperArmR' : 'upperArmL';
      if (ctx.tier === 'light') {
        P.push({ geometry: mailSleeve(ctx, upperLen * 0.92, 0.056, 0.05), material: 'gambeson', joint });
      } else if (ctx.tier === 'medium') {
        P.push({ geometry: mailSleeve(ctx, upperLen * 0.94, 0.058, 0.05), material: 'mail', joint });
        if (hero) {
          const strap = new THREE.TorusGeometry(0.055, 0.008, 3, 6);
          strap.rotateX(90 * DEG);
          P.push({ geometry: strap, material: 'leatherDark', joint, position: [0, -upperLen * 0.55, 0] });
        }
      } else {
        // rerebrace (üst kol levhası)
        P.push({
          geometry: limbPlate(ctx, upperLen * 0.9, 0.062, 0.052, 'plate', { radial: ctx.rad(), facet: hero ? 0.012 : 0, squash: 0.92 }),
          material: 'plate',
          joint,
        });
        // omuz eklemi küresi
        const couter = new THREE.SphereGeometry(0.062, ctx.rad(5), 4);
        P.push({ geometry: couter, material: 'plateBright', joint, position: [0, -0.01, 0] });
      }
    }
    return P;
  }

  if (zone === 'armsLower') {
    for (const side of [-1, 1]) {
      const joint = side > 0 ? 'forearmR' : 'forearmL';
      if (ctx.tier === 'light') {
        P.push({ geometry: mailSleeve(ctx, foreLen * 0.8, 0.05, 0.042), material: 'cloth', joint, position: [0, -foreLen * 0.1, 0] });
      } else if (ctx.tier === 'medium') {
        P.push({ geometry: mailSleeve(ctx, foreLen * 0.86, 0.052, 0.042), material: 'mail', joint, position: [0, -foreLen * 0.08, 0] });
      } else {
        // vambrace: dirsekte geniş, bilekte dar — dış yüzü kabartmalı
        const v = limbPlate(ctx, foreLen * 0.88, 0.058, 0.044, 'plate', { radial: ctx.rad(), facet: hero ? 0.011 : 0, squash: 0.9 });
        P.push({ geometry: v, material: 'plate', joint, position: [0, -foreLen * 0.06, 0] });
        const elbow = new THREE.SphereGeometry(0.055, ctx.rad(5), 4, 0, TAU, 0, 110 * DEG);
        P.push({ geometry: elbow, material: 'plateBright', joint, position: [0, -0.015, 0] });
        if (hero) {
          const flange = new THREE.BoxGeometry(0.012, foreLen * 0.7, 0.03);
          P.push({ geometry: flange, material: 'plateBright', joint, position: [side * 0.05, -foreLen * 0.45, 0] });
          const cuff = new THREE.TorusGeometry(0.048, 0.009, 3, ctx.rad(7));
          cuff.rotateX(90 * DEG);
          P.push({ geometry: cuff, material: 'gold', joint, position: [0, -foreLen * 0.9, 0] });
        }
      }
    }
    return P;
  }

  // hands: eldivenler
  for (const side of [-1, 1]) {
    const joint = side > 0 ? 'handR' : 'handL';
    if (ctx.tier === 'light') {
      const glove = new THREE.BoxGeometry(0.052, 0.1, 0.042);
      P.push({ geometry: glove, material: 'leather', joint, position: [0, -0.045, 0] });
    } else if (ctx.tier === 'medium') {
      const glove = new THREE.BoxGeometry(0.056, 0.105, 0.046);
      P.push({ geometry: glove, material: 'mail', joint, position: [0, -0.045, 0] });
      const cuff = new THREE.CylinderGeometry(0.04, 0.036, 0.04, ctx.rad(5));
      P.push({ geometry: cuff, material: 'leatherDark', joint, position: [0, 0.005, 0] });
    } else {
      // gauntlet: bilek plakası + el + parmak blokları
      const cuff = new THREE.CylinderGeometry(0.05, 0.042, 0.075, ctx.rad(6));
      P.push({ geometry: cuff, material: 'plate', joint, position: [0, 0.02, 0] });
      const palm = new THREE.BoxGeometry(0.058, 0.075, 0.048);
      P.push({ geometry: palm, material: 'plateBright', joint, position: [0, -0.055, 0] });
      const fingers = new THREE.BoxGeometry(0.056, 0.055, 0.042);
      P.push({ geometry: fingers, material: 'plate', joint, position: [0, -0.11, 0.004] });
      if (hero) {
        const thumb = new THREE.BoxGeometry(0.024, 0.05, 0.03);
        P.push({ geometry: thumb, material: 'plate', joint, position: [side * 0.038, -0.07, 0.012], rotation: [0, 0, side * -22 * DEG] });
        for (let i = 0; i < 3; i++) {
          const knuckle = new THREE.BoxGeometry(0.054, 0.012, 0.044);
          P.push({ geometry: knuckle, material: 'plateDark', joint, position: [0, -0.09 - i * 0.018, 0.004] });
        }
      }
    }
  }
  return P;
}

function buildLegs(ctx: Ctx, zone: 'legsUpper' | 'legsLower' | 'feet'): ArmorPiece[] {
  const P: ArmorPiece[] = [];
  const hero = ctx.lod === 'hero';
  const thigh = HUMANOID.thigh;
  const shin = HUMANOID.shin;

  if (zone === 'legsUpper') {
    for (const side of [-1, 1]) {
      const joint = side > 0 ? 'thighR' : 'thighL';
      if (ctx.tier === 'light') {
        P.push({ geometry: mailSleeve(ctx, thigh * 0.9, 0.082, 0.068), material: 'cloth', joint });
      } else if (ctx.tier === 'medium') {
        P.push({ geometry: mailSleeve(ctx, thigh * 0.88, 0.084, 0.068), material: 'mail', joint });
        if (hero) {
          const strap = new THREE.TorusGeometry(0.078, 0.009, 3, 6);
          strap.rotateX(90 * DEG);
          P.push({ geometry: strap, material: 'leatherDark', joint, position: [0, -thigh * 0.5, 0] });
        }
      } else {
        // cuisse (uyluk levhası) + poleyn (diz)
        P.push({
          geometry: limbPlate(ctx, thigh * 0.86, 0.088, 0.07, 'plate', { radial: ctx.rad(), facet: hero ? 0.014 : 0, squash: 0.94 }),
          material: 'plate',
          joint,
        });
        const poleyn = new THREE.SphereGeometry(0.072, ctx.rad(5), 4, 0, TAU, 0, 120 * DEG);
        poleyn.rotateX(180 * DEG);
        P.push({ geometry: poleyn, material: 'plateBright', joint, position: [0, -thigh * 0.94, 0.012] });
        if (hero) {
          const wing = new THREE.BoxGeometry(0.05, 0.05, 0.014);
          P.push({ geometry: wing, material: 'plate', joint, position: [side * 0.075, -thigh * 0.94, 0.01], rotation: [0, 0, side * 20 * DEG] });
        }
      }
    }
    return P;
  }

  if (zone === 'legsLower') {
    for (const side of [-1, 1]) {
      const joint = side > 0 ? 'shinR' : 'shinL';
      if (ctx.tier === 'light') {
        P.push({ geometry: mailSleeve(ctx, shin * 0.86, 0.066, 0.05), material: 'cloth', joint, position: [0, -shin * 0.06, 0] });
      } else if (ctx.tier === 'medium') {
        P.push({ geometry: mailSleeve(ctx, shin * 0.88, 0.068, 0.05), material: 'mail', joint, position: [0, -shin * 0.05, 0] });
      } else {
        // greave: baldır levhası (arkası açık, önde kaburga)
        const greave = new THREE.CylinderGeometry(0.058, 0.046, shin * 0.86, ctx.rad(7), ctx.steps(3), true, -110 * DEG, 220 * DEG);
        greave.translate(0, -shin * 0.48, 0);
        if (hero) quantizeGeometry(greave, 0.012);
        P.push({ geometry: greave, material: 'plate', joint, position: [0, 0, 0] });
        const ridge = new THREE.BoxGeometry(0.016, shin * 0.7, 0.02);
        P.push({ geometry: ridge, material: 'plateBright', joint, position: [0, -shin * 0.46, 0.055] });
        if (hero) {
          const anklet = new THREE.TorusGeometry(0.05, 0.009, 3, ctx.rad(7));
          anklet.rotateX(90 * DEG);
          P.push({ geometry: anklet, material: 'gold', joint, position: [0, -shin * 0.9, 0] });
        }
      }
    }
    return P;
  }

  // feet: çizmeler / sabaton
  for (const side of [-1, 1]) {
    const joint = side > 0 ? 'footR' : 'footL';
    if (ctx.tier === 'heavy') {
      const sabaton = new THREE.BoxGeometry(0.088, 0.05, 0.24);
      P.push({ geometry: sabaton, material: 'plate', joint, position: [0, -0.06, 0.055] });
      const toe = new THREE.ConeGeometry(0.045, 0.08, 4);
      toe.rotateX(-90 * DEG);
      P.push({ geometry: toe, material: 'plateBright', joint, position: [0, -0.062, 0.19] });
      if (hero) {
        for (let i = 0; i < 3; i++) {
          const lame = new THREE.BoxGeometry(0.09, 0.016, 0.05);
          P.push({ geometry: lame, material: 'plateDark', joint, position: [0, -0.04, 0.02 + i * 0.055] });
        }
      }
    } else {
      const boot = new THREE.BoxGeometry(0.092, 0.075, 0.25);
      P.push({ geometry: boot, material: ctx.tier === 'light' ? 'leatherDark' : 'leather', joint, position: [0, -0.05, 0.05] });
      const toe = new THREE.BoxGeometry(0.088, 0.05, 0.06);
      P.push({ geometry: toe, material: 'leatherDark', joint, position: [0, -0.062, 0.185] });
      if (hero && ctx.tier === 'medium') {
        const spur = new THREE.BoxGeometry(0.05, 0.012, 0.012);
        P.push({ geometry: spur, material: 'gold', joint, position: [side * 0.05, -0.04, -0.07] });
      }
    }
  }
  return P;
}

/** Surcoat: fraksiyon kumaşı, göğüsten dize kadar (hero detayı + silüet). */
function buildSurcoat(ctx: Ctx): ArmorPiece[] {
  const P: ArmorPiece[] = [];
  const hero = ctx.lod === 'hero';
  const uSeg = hero ? 8 : 5;
  const vSeg = hero ? 4 : 2;
  // ön ve arka panel: göğüsten (chest) aşağı sarkan hafif dalgalı kumaş
  for (const side of [1, -1]) {
    const panel = new THREE.PlaneGeometry(0.42, 0.62, uSeg, vSeg);
    const pos = panel.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // bele doğru daral, etekte genişle ve hafif dalga ver
      const v = (y + 0.31) / 0.62; // 0 = etek ucu, 1 = göğüs
      const taper = 0.82 + 0.3 * v + 0.1 * Math.max(0, 0.25 - v);
      pos.setX(i, x * taper);
      pos.setZ(i, Math.sin(x * 6) * 0.012 + Math.sin((y + 0.31) * 4) * 0.01);
    }
    pos.needsUpdate = true;
    panel.computeVertexNormals();
    P.push({
      geometry: panel,
      material: { key: 'surcoatPanel', color: ctx.faction.colors.primary, metalness: 0.04, roughness: 0.95, flatShading: true, side: THREE.DoubleSide, factionTint: 'primary' },
      joint: 'pelvis',
      position: [0, 0.12, side * 0.178],
    });
  }
  if (hero) {
    // arma (göğüs üzerinde)
    const charge = buildCharge(ctx.faction.charge, ctx.faction.colors.secondary, 0.11, ctx.faction.colors.trim);
    for (const cp of charge) {
      P.push({
        geometry: cp.geometry,
        material: { key: 'surcoatCharge', color: (cp.material as { color?: number })?.color ?? ctx.faction.colors.secondary, metalness: 0.2, roughness: 0.7, flatShading: true },
        joint: 'pelvis',
        position: [(cp.position?.[0] ?? 0), 0.3 + (cp.position?.[1] ?? 0), 0.195],
        rotation: cp.rotation,
      });
    }
    // omuz askıları
    for (const side of [-1, 1]) {
      const strapGeo = tubeFromPoints(
        [v3(side * 0.11, 0.44, 0.17), v3(side * 0.155, 0.53, 0.05), v3(side * 0.11, 0.45, -0.17)],
        0.016,
        4,
        2,
      );
      P.push({ geometry: strapGeo, material: 'surcoatTrim', joint: 'pelvis', position: [0, 0, 0] });
    }
  }
  return P;
}

/* ─────────────────────────── ana API ─────────────────────────── */

const TIER_ZONES: Record<ArmorTier, ArmorZone[]> = {
  light: ['torso', 'armsUpper', 'armsLower', 'hands', 'legsUpper', 'legsLower', 'feet'],
  medium: ['head', 'neck', 'torso', 'shoulders', 'armsUpper', 'armsLower', 'hands', 'legsUpper', 'legsLower', 'feet'],
  heavy: ['head', 'neck', 'torso', 'shoulders', 'armsUpper', 'armsLower', 'hands', 'legsUpper', 'legsLower', 'feet'],
};

/**
 * Bölüm 1 bütçesinden türetilen zırh payı.
 * Piyade toplamı 400–800 üçgen: gövde ≈ 360, ekipman ≈ 250 → zırha kalan pay.
 */
export function armorBudget(tier: ArmorTier, lod: LodLevel): number {
  const table: Record<ArmorTier, { hero: number; battle: number; crowd: number }> = {
    light: { hero: 520, battle: 120, crowd: 85 },
    medium: { hero: 900, battle: 210, crowd: 150 },
    heavy: { hero: 1300, battle: 300, crowd: 215 },
  };
  return table[tier][lod];
}

/**
 * Bir zırh seti üretir. Çıktı: bölge → eklem uzayında parçalar.
 * Character.build() bu parçaları rig'e bağlar ya da merge eder.
 */
export function buildArmorSet(opts: ArmorOptions & { mats?: MaterialLibrary }): ArmorSet {
  const tier = opts.tier ?? 'medium';
  const lod = opts.lod ?? 'hero';
  const faction = opts.faction ?? FactionPalette.byId('vlandia');
  const ctx = makeCtx({ lod, tier, faction, seed: opts.seed ?? 4711 });
  const zonesIn = opts.zones ?? TIER_ZONES[tier];
  const helmStyle = opts.helmStyle ?? (tier === 'heavy' ? 'greatHelm' : tier === 'medium' ? 'spangen' : 'kettle');

  const zones: Partial<Record<ArmorZone, ArmorPiece[]>> = {};
  let triangles = 0;
  const push = (zone: ArmorZone, pieces: ArmorPiece[]) => {
    if (!pieces.length) return;
    zones[zone] = pieces;
    for (const p of pieces) triangles += triOf(p.geometry);
  };

  for (const zone of zonesIn) {
    switch (zone) {
      case 'head': push('head', buildHead(ctx, helmStyle)); break;
      case 'neck': push('neck', buildNeck(ctx)); break;
      case 'torso': push('torso', buildTorso(ctx)); break;
      case 'shoulders': push('shoulders', buildShoulders(ctx)); break;
      case 'armsUpper': push('armsUpper', buildArms(ctx, 'armsUpper')); break;
      case 'armsLower': push('armsLower', buildArms(ctx, 'armsLower')); break;
      case 'hands': push('hands', buildArms(ctx, 'hands')); break;
      case 'legsUpper': push('legsUpper', buildLegs(ctx, 'legsUpper')); break;
      case 'legsLower': push('legsLower', buildLegs(ctx, 'legsLower')); break;
      case 'feet': push('feet', buildLegs(ctx, 'feet')); break;
    }
  }

  if (opts.surcoat !== false && tier !== 'light') {
    const sc = buildSurcoat(ctx);
    zones.torso = [...(zones.torso ?? []), ...sc];
    for (const p of sc) triangles += triOf(p.geometry);
  }

  // ══ BÜTÇE NOTU ══
  // Zırh burada HAM kalitesinde üretilir. Bölüm 1'in 400-800 üçgen sınırı
  // KARAKTER düzeyinde uygulanır: Character.bakeToGeometry(bütçe) tüm birimi
  // (gövde + zırh + silah + kalkan) tek geçişte hedefe indirger. Böylece
  // parça bazlı yıkıcı kümeleme yerine tek, tutarlı bir silüet indirgemesi
  // yapılır (Army.ts → unitBudget).
  // `armorBudget()` vitrin/telemetri için referans payı vermeye devam eder.

  return { tier, lod, zones, triangles };
}


/** Bölgedeki parçaları tek (vertex renkli) geometride birleştirir. */
function mergeArmorPieces(
  pieces: ArmorPiece[],
  palette: Record<string, Omit<MaterialDef, 'key'>>,
): THREE.BufferGeometry {
  const lib = new MaterialLibrary(palette);
  const merged: Piece[] = [];
  for (const piece of pieces) {
    const g = piece.geometry.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = piece.rotation ? new THREE.Euler(piece.rotation[0], piece.rotation[1], piece.rotation[2]) : new THREE.Euler();
    q.setFromEuler(e);
    const sc =
      piece.scale === undefined
        ? new THREE.Vector3(1, 1, 1)
        : typeof piece.scale === 'number'
          ? new THREE.Vector3(piece.scale, piece.scale, piece.scale)
          : new THREE.Vector3(piece.scale[0], piece.scale[1], piece.scale[2]);
    m.compose(piece.position ? new THREE.Vector3(...piece.position) : new THREE.Vector3(), q, sc);
    g.applyMatrix4(m);
    merged.push({ geometry: g, material: piece.material });
  }
  return mergePieces(merged, lib);
}

/** Bir bölgedeki parçaların en sık kullandığı eklem (birleştirilmiş parça için). */
function dominantJoint(pieces: ArmorPiece[]): string {
  const counts = new Map<string, number>();
  for (const p of pieces) counts.set(p.joint, (counts.get(p.joint) ?? 0) + 1);
  let best = pieces[0]?.joint ?? 'pelvis';
  let bestN = -1;
  for (const [joint, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = joint;
    }
  }
  return best;
}

function triOf(g: THREE.BufferGeometry): number {
  if (g.index) return g.index.count / 3;
  const p = g.attributes.position as THREE.BufferAttribute;
  return p ? p.count / 3 : 0;
}

/** Zırh setini tek BufferGeometry'de birleştirir (instancing/crowd için). */
export function mergeArmorSet(
  set: ArmorSet,
  mats: MaterialLibrary,
  jointMatrices?: Map<string, THREE.Matrix4>,
): THREE.BufferGeometry {
  const pieces: Piece[] = [];
  for (const zone of Object.keys(set.zones) as ArmorZone[]) {
    for (const p of set.zones[zone] ?? []) {
      const g = p.geometry.clone();
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const e = p.rotation ? new THREE.Euler(p.rotation[0], p.rotation[1], p.rotation[2]) : new THREE.Euler();
      q.setFromEuler(e);
      const sc = p.scale === undefined ? new THREE.Vector3(1, 1, 1)
        : typeof p.scale === 'number' ? new THREE.Vector3(p.scale, p.scale, p.scale)
        : new THREE.Vector3(p.scale[0], p.scale[1], p.scale[2]);
      m.compose(p.position ? new THREE.Vector3(...p.position) : new THREE.Vector3(), q, sc);
      g.applyMatrix4(m);
      const jm = jointMatrices?.get(p.joint);
      if (jm) g.applyMatrix4(jm);
      pieces.push({ geometry: g, material: p.material });
    }
  }
  return mergePieces(pieces, mats);
}
