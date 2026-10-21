/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · Horse.ts
 *  Prosedürel low-poly savaş atı: gövde, boyun, kafa, 4 bacak (3 eklem),
 *  yele, kuyruk, eyer + üzengi, ve zırhlı barding (chanfron / criniere /
 *  peytral / flanchard / croupiere / caparison).
 *
 *  ✦ Rig: Rig.horseJoints() — bacak pivotları kalça/diz/topuk eklemlerinde.
 *  ✦ Animasyon: ANIMATION_CLIPS.horseWalk (speed ile yürüyüş → dörtnala).
 *  ✦ Binici: attachRider(character) → karakter eyer yuvasına bağlanır,
 *    mountedIdle pozu uygulanır, tek geometride bake edilebilir (süvari).
 *  ✦ Üçgen bütçesi: zırhlı savaş atı 500–900 (Bölüm 1 / madde 3).
 *
 *  ÖLÇEK: cidago (withers) ≈ 1.52 m, gövde uzunluğu ≈ 1.7 m, baş +Z'ye bakar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import {
  BUDGET,
  BudgetTracker,
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
  triCount,
  tubeFromPoints,
  v3,
} from './Core.ts';
import { FactionPalette } from './Faction.ts';
import { Animator, HORSE_PROPORTIONS, Rig, horseJoints } from './Rig.ts';
import { Character } from './Character.ts';

/* ─────────────────────────── tipler ─────────────────────────── */

export type CoatColor = 'bay' | 'chestnut' | 'grey' | 'black' | 'palomino' | 'dun';

export const COAT_COLORS: Record<CoatColor, { coat: number; dark: number; mane: number }> = {
  bay: { coat: 0x6b4227, dark: 0x2e2019, mane: 0x241a14 },
  chestnut: { coat: 0x8c4a26, dark: 0x4a2a18, mane: 0x6d3d20 },
  grey: { coat: 0x9aa0a4, dark: 0x5c6165, mane: 0xd2d6d8 },
  black: { coat: 0x24232a, dark: 0x14131a, mane: 0x0e0d12 },
  palomino: { coat: 0xc9a15e, dark: 0x8a6a34, mane: 0xe8dcc0 },
  dun: { coat: 0xa08a63, dark: 0x5f5138, mane: 0x3c3325 },
};

/** At cinsi: oranlar, yele dokusu ve varsayılan don rengi değişir. */
export type HorseBreed = 'war' | 'steppe' | 'destrier';

export interface BreedProfile {
  leg: number;
  girth: number;
  len: number;
  neck: number;
  mane: number;
  /** Tüm LOD'larda paça tüyü (bozkır ve ağır atlar). */
  feather: boolean;
  coat: CoatColor;
  ad: string;
}

export const HORSE_BREEDS: Record<HorseBreed, BreedProfile> = {
  war: { leg: 1, girth: 1, len: 1, neck: 1, mane: 1, feather: false, coat: 'bay', ad: 'Savaş Atı' },
  steppe: { leg: 0.86, girth: 1.07, len: 0.93, neck: 0.94, mane: 1.45, feather: true, coat: 'dun', ad: 'Bozkır Midillisi' },
  destrier: { leg: 1.1, girth: 1.15, len: 1.06, neck: 1.05, mane: 0.85, feather: true, coat: 'black', ad: 'Destrier' },
};

export interface HorseOptions {
  breed?: HorseBreed;
  faction?: FactionPalette | string;
  lod?: LodLevel;
  coat?: CoatColor;
  /** Zırhlı barding (ağır süvari). */
  barding?: boolean;
  /** Fraksiyon kumaşlı kaplama (caparison). */
  caparison?: boolean;
  /** Eyer + üzengi. */
  saddle?: boolean;
  seed?: number;
  /** Boy ölçeği (1 = 1.6 m cidago). */
  scale?: number;
}

export interface HorseBuild {
  group: THREE.Group;
  rig: Rig;
  animator: Animator;
  triangles: number;
  budget: number;
  withinBudget: boolean;
}

/* ─────────────────────────── palet ─────────────────────────── */

export function createHorsePalette(f: FactionPalette, coat: CoatColor): Record<string, Omit<MaterialDef, 'key'>> {
  const c = COAT_COLORS[coat];
  return {
    coat: { color: c.coat, metalness: 0.06, roughness: 0.86 },
    coatDark: { color: c.dark, metalness: 0.06, roughness: 0.9 },
    mane: { color: c.mane, metalness: 0.05, roughness: 0.96 },
    hoof: { color: 0x3a352e, metalness: 0.1, roughness: 0.82 },
    eye: { color: 0x1a1410, metalness: 0.2, roughness: 0.35 },
    leather: { color: f.colors.leather, metalness: 0.05, roughness: 0.9 },
    leatherDark: { color: new THREE.Color(f.colors.leather).lerp(new THREE.Color(0x120c06), 0.45).getHex(), metalness: 0.05, roughness: 0.94 },
    steel: { color: f.colors.steel, metalness: 0.72, roughness: 0.46 },
    steelBright: { color: new THREE.Color(f.colors.steel).lerp(new THREE.Color(0xffffff), 0.35).getHex(), metalness: 0.85, roughness: 0.32 },
    steelDark: { color: f.colors.steelDark, metalness: 0.6, roughness: 0.6 },
    gold: { color: f.colors.gold, metalness: 0.9, roughness: 0.32 },
    caparison: { color: f.colors.primary, metalness: 0.04, roughness: 0.95, factionTint: 'primary' },
    caparisonTrim: { color: f.colors.trim, metalness: 0.3, roughness: 0.6, factionTint: 'trim' },
  };
}

/** Bölüm 1 bütçesi: zırhlı savaş atı 500-900 üçgen (crowd'da %72). */
export function horseBudget(lod: LodLevel): number {
  return lod === 'crowd' ? Math.round(BUDGET.horseMax * 0.72) : BUDGET.horseMax;
}

/* ─────────────────────────── geometri üreticileri ─────────────────────────── */

interface HCtx {
  lod: LodLevel;
  mats: MaterialLibrary;
  faction: FactionPalette;
  rng: () => number;
  jitter: number;
  rad: (n?: number) => number;
  steps: (n: number) => number;
  scale: number;
  /** Cins çarpanları. */
  bp: BreedProfile;
  /** Cinsle ölçeklenmiş iskelet oranları. */
  hp: Record<string, number>;
}

function makeHorseCtx(o: { lod: LodLevel; faction: FactionPalette; seed: number; scale: number; bp: BreedProfile; hp: Record<string, number> }): HCtx {
  const radialBase = o.lod === 'hero' ? 8 : o.lod === 'battle' ? 6 : 5;
  const stepScale = o.lod === 'hero' ? 1 : o.lod === 'battle' ? 0.55 : 0.38;
  let a = o.seed >>> 0 || 17;
  return {
    lod: o.lod,
    faction: o.faction,
    mats: null as unknown as MaterialLibrary,
    rng: () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    jitter: o.lod === 'hero' ? 0.006 : 0,
    rad: (n = radialBase) => Math.max(4, n),
    steps: (n: number) => Math.max(2, Math.round(n * stepScale)),
    scale: o.scale,
    bp: o.bp,
    hp: o.hp,
  };
}

type HorsePiece = { geometry: THREE.BufferGeometry; material: string; joint: string; position?: Vec3Tuple; rotation?: Vec3Tuple; scale?: Vec3Tuple | number };

/** Gövde (fıçı): omurga boyunca süpürülmüş eliptik kesitler. */
function buildBarrel(ctx: HCtx): HorsePiece[] {
  const P: HorsePiece[] = [];
  const steps = ctx.steps(10);
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    spine.push(v3((-0.82 + t * 1.62) * ctx.bp.len, 0.06 * Math.sin(Math.PI * t) - 0.02 * t, 0));
  }
  const profile: Vec2Tuple[] = [
    [-0.19, -0.2],
    [0, -0.26],
    [0.19, -0.2],
    [0.22, 0.06],
    [0.14, 0.24],
    [0, 0.3],
    [-0.14, 0.24],
    [-0.22, 0.06],
    [-0.19, -0.2],
  ];
  const barrel = sweep(profile2(profile), spine, {
    scale: (t) => {
      // göğüste dar, fıçıda geniş, sağrıda geniş, kuyrukta dar
      if (t < 0.18) return 0.78 + t * 1.1;
      if (t < 0.62) return 0.98 + 0.06 * Math.sin(((t - 0.18) / 0.44) * Math.PI);
      return 1.02 - (t - 0.62) * 0.62;
    },
    seedNormal: v3(0, 0, 1),
    jitter: ctx.jitter,
  });
  barrel.scale(1, ctx.bp.girth, ctx.bp.girth * 0.86); // yandan basık + cins gövdesi
  P.push({ geometry: barrel, material: 'coat', joint: 'body' });

  // göğüs (chest) kas kütlesi
  const chest = new THREE.SphereGeometry(0.26 * ctx.bp.girth, ctx.rad(6), ctx.rad(5));
  chest.scale(0.8, 1, 0.92);
  P.push({ geometry: chest, material: 'coat', joint: 'body', position: [0.74 * ctx.bp.len, -0.02, 0] });

  // sağrı (croup)
  const croup = new THREE.SphereGeometry(0.28 * ctx.bp.girth, ctx.rad(6), ctx.rad(5));
  croup.scale(0.95, 0.9, 0.92);
  P.push({ geometry: croup, material: 'coat', joint: 'body', position: [-0.72 * ctx.bp.len, 0.08, 0] });

  // karın altı çizgisi (silüeti kırar)
  if (ctx.lod === 'hero') {
    const belly = sweep(
      profile2([[-0.16, 0], [0, -0.06], [0.16, 0], [0, 0.03], [-0.16, 0]]),
      [v3(-0.5, -0.24, 0), v3(0, -0.28, 0), v3(0.5, -0.24, 0)],
      { scale: (t) => 0.7 + 0.5 * Math.sin(Math.PI * t), seedNormal: v3(0, 0, 1) },
    );
    P.push({ geometry: belly, material: 'coatDark', joint: 'body' });
  }
  return P;
}

/** Boyun + yele: cidagodan kafaya kavisli süpürme. */
function buildNeck(ctx: HCtx): HorsePiece[] {
  const P: HorsePiece[] = [];
  const steps = ctx.steps(9);
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // kavisli boyun: öne ve yukarı
    spine.push(v3((0.78 + t * 0.5) * ctx.bp.len, 0.1 + t * 0.62 * ctx.bp.neck - t * t * 0.16 * ctx.bp.neck, 0));
  }
  const profile: Vec2Tuple[] = [
    [-0.13, -0.16],
    [0, -0.2],
    [0.13, -0.16],
    [0.15, 0.05],
    [0.09, 0.16],
    [0, 0.19],
    [-0.09, 0.16],
    [-0.15, 0.05],
    [-0.13, -0.16],
  ];
  const neck = sweep(profile2(profile), spine, {
    scale: (t) => 1.06 - t * 0.44,
    seedNormal: v3(0, 0, 1),
    jitter: ctx.jitter,
  });
  neck.scale(1, ctx.bp.girth, 0.72 * ctx.bp.girth);
  // Boyun gövde uzayında modellenir; neck eklemine asılırsa kopuk durur.
  P.push({ geometry: neck, material: 'coat', joint: 'body' });

  // yele (crest): boyun üst çizgisi boyunca dalgalı şerit
  const maneSteps = ctx.steps(8);
  const maneSpine: THREE.Vector3[] = [];
  for (let i = 0; i <= maneSteps; i++) {
    const t = i / maneSteps;
    maneSpine.push(v3((0.74 + t * 0.52) * ctx.bp.len, (0.26 + t * 0.6 - t * t * 0.16) * ctx.bp.neck, -0.02 + Math.sin(t * 5.5) * 0.022));
  }
  const mane = sweep(
    profile2([[-0.055, 0], [0.012, -0.01], [0.05, -0.09], [0.0, -0.12], [-0.06, -0.05], [-0.055, 0]]),
    maneSpine,
    { scale: (t) => 0.55 + 0.75 * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.08)), seedNormal: v3(0, 0, 1), jitter: ctx.jitter * 1.6 },
  );
  mane.scale(1, ctx.bp.mane, 0.8 * ctx.bp.mane);
  P.push({ geometry: mane, material: 'mane', joint: 'body' });

  // cidago (withers) çıkıntısı
  const withers = new THREE.ConeGeometry(0.14, 0.2, ctx.rad(5));
  withers.rotateZ(-38 * DEG);
  P.push({ geometry: withers, material: 'coat', joint: 'body', position: [0.62 * ctx.bp.len, 0.245, 0], rotation: [0, 0, 42 * DEG] });
  return P;
}

/** Kafa: alın → burun → ağız + kulaklar + gözler. */
function buildHead(ctx: HCtx): HorsePiece[] {
  const P: HorsePiece[] = [];
  const steps = ctx.steps(7);
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    spine.push(v3(t * 0.56, -t * t * 0.16, 0));
  }
  const skull = sweep(
    profile2([
      [-0.085, -0.1],
      [0, -0.13],
      [0.085, -0.1],
      [0.1, 0.03],
      [0.05, 0.11],
      [0, 0.13],
      [-0.05, 0.11],
      [-0.1, 0.03],
      [-0.085, -0.1],
    ]),
    spine,
    { scale: (t) => 1.02 - t * 0.42, seedNormal: v3(0, 0, 1), jitter: ctx.jitter },
  );
  skull.scale(1, 1, 0.88);
  P.push({ geometry: skull, material: 'coat', joint: 'head' });

  // burun/ağız bloğu
  const muzzle = new THREE.BoxGeometry(0.17, 0.13, 0.17);
  if (ctx.lod === 'hero') quantizeGeometry(muzzle, 0.014);
  P.push({ geometry: muzzle, material: 'coatDark', joint: 'head', position: [0.56, -0.16, 0] });
  const lip = new THREE.BoxGeometry(0.14, 0.05, 0.13);
  P.push({ geometry: lip, material: 'coatDark', joint: 'head', position: [0.63, -0.22, 0] });

  // alt çene
  const jaw = sweep(
    profile2([[-0.07, -0.06], [0.07, -0.06], [0.06, 0.05], [-0.06, 0.05], [-0.07, -0.06]]),
    [v3(0.1, -0.12, 0), v3(0.38, -0.17, 0), v3(0.56, -0.2, 0)],
    { scale: (t) => 1 - t * 0.35, seedNormal: v3(0, 1, 0) },
  );
  P.push({ geometry: jaw, material: 'coat', joint: 'jaw' });

  // burun delikleri
  for (const s of [-1, 1]) {
    const nostril = new THREE.OctahedronGeometry(0.026, 0);
    nostril.scale(1, 0.7, 0.6);
    P.push({ geometry: nostril, material: 'eye', joint: 'head', position: [0.63, -0.15, s * 0.05] });
  }

  // gözler
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.032, ctx.rad(5), 4);
    eye.scale(1, 1, 0.6);
    P.push({ geometry: eye, material: 'eye', joint: 'head', position: [0.2, 0.02, s * 0.1] });
    if (ctx.lod === 'hero') {
      const brow = new THREE.BoxGeometry(0.06, 0.018, 0.02);
      P.push({ geometry: brow, material: 'coatDark', joint: 'head', position: [0.2, 0.06, s * 0.1] });
    }
  }

  // kulaklar
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.042, 0.15, 4);
    ear.rotateZ(-14 * DEG * s);
    P.push({
      geometry: ear,
      material: 'coat',
      joint: s > 0 ? 'earR' : 'earL',
      position: [0, 0.06, 0],
      rotation: [s * 8 * DEG, 0, s * 10 * DEG],
    });
    if (ctx.lod === 'hero') {
      const inner = new THREE.ConeGeometry(0.024, 0.1, 3);
      P.push({ geometry: inner, material: 'coatDark', joint: s > 0 ? 'earR' : 'earL', position: [0.008, 0.06, s * 0.012] });
    }
  }

  // perçem (alın yelesi)
  if (ctx.lod !== 'crowd') {
    const forelock = sweep(
      profile2([[-0.05, 0], [0.05, 0], [0.03, -0.1], [-0.03, -0.1], [-0.05, 0]]),
      [v3(-0.02, 0.14, 0), v3(0.06, 0.06, 0.01), v3(0.12, -0.02, 0)],
      { scale: (t) => 1 - t * 0.55, seedNormal: v3(0, 0, 1), jitter: 0.008 },
    );
    P.push({ geometry: forelock, material: 'mane', joint: 'head' });
  }
  return P;
}

/** Bacaklar: omuz/uyluk kütlesi + incik + tırnak. */
function buildLegs(ctx: HCtx): HorsePiece[] {
  const P: HorsePiece[] = [];
  const upper = ctx.hp.upperLeg;
  const cannon = ctx.hp.cannon;
  const hero = ctx.lod === 'hero';

  const legs: [string, number, number, boolean][] = [
    ['frontL', ctx.hp.frontLegX, ctx.hp.legSpread, false],
    ['frontR', ctx.hp.frontLegX, -ctx.hp.legSpread, false],
    ['hindL', ctx.hp.hindLegX, ctx.hp.legSpread, true],
    ['hindR', ctx.hp.hindLegX, -ctx.hp.legSpread, true],
  ];

  for (const [name, x, z, isHind] of legs) {
    const thighJoint = `${name}Thigh`;
    const cannonJoint = `${name}Cannon`;
    const hoofJoint = `${name}Hoof`;
    const side = z > 0 ? 1 : -1;

    if (isHind) {
      // sağrı + incik üstü (gaskin) — açıyla duran kas kütlesi
      const gaskin = new THREE.CylinderGeometry(0.115, 0.075, upper * 1.02, ctx.rad(6), hero ? 2 : 1);
      gaskin.translate(0, -upper * 0.5, 0);
      gaskin.scale(1, 1, 0.86);
      if (ctx.jitter) jitterGeometry(gaskin, ctx.jitter, 51 + Math.round(x * 100));
      P.push({ geometry: gaskin, material: 'coat', joint: thighJoint, rotation: [0, 0, side * 2 * DEG] });
      const hock = new THREE.SphereGeometry(0.072, ctx.rad(5), 4);
      P.push({ geometry: hock, material: 'coat', joint: cannonJoint, position: [0, 0.01, 0] });
    } else {
      // ön bacak: omuz kürek kemiği + radius
      const shoulderBlade = new THREE.BoxGeometry(0.1, 0.36, 0.17);
      shoulderBlade.rotateZ(18 * DEG);
      P.push({ geometry: shoulderBlade, material: 'coat', joint: 'body', position: [x + 0.06, 0.06, z * 0.94] });
      const forearm = new THREE.CylinderGeometry(0.088, 0.062, upper * 1.0, ctx.rad(6), hero ? 2 : 1);
      forearm.translate(0, -upper * 0.5, 0);
      forearm.scale(1, 1, 0.88);
      if (ctx.jitter) jitterGeometry(forearm, ctx.jitter, 61);
      P.push({ geometry: forearm, material: 'coat', joint: thighJoint });
      const knee = new THREE.BoxGeometry(0.11, 0.09, 0.11);
      P.push({ geometry: knee, material: 'coatDark', joint: cannonJoint, position: [0, -0.02, 0] });
    }

    // incik (cannon bone) — ince ve uzun
    const cannonGeo = new THREE.CylinderGeometry(0.052, 0.04, cannon * 0.98, ctx.rad(5), hero ? 2 : 1);
    cannonGeo.translate(0, -cannon * 0.49, 0);
    if (ctx.jitter) jitterGeometry(cannonGeo, ctx.jitter * 0.7, 71);
    P.push({ geometry: cannonGeo, material: 'coat', joint: cannonJoint });

    // arka bacakta incik üstü açılı olur (hock → fetlock)
    if (isHind) {
      const point = new THREE.BoxGeometry(0.09, 0.14, 0.1);
      P.push({ geometry: point, material: 'coatDark', joint: cannonJoint, position: [-0.02, -cannon * 0.18, 0] });
    }

    // fetlock + tırnak
    const fetlock = new THREE.SphereGeometry(0.05, ctx.rad(5), 4);
    fetlock.scale(1, 0.85, 1);
    P.push({ geometry: fetlock, material: 'coatDark', joint: hoofJoint, position: [0, 0.01, 0] });
    const hoof = new THREE.CylinderGeometry(0.062, 0.075, 0.11, ctx.rad(6));
    hoof.translate(0, -0.055, 0);
    P.push({ geometry: hoof, material: 'hoof', joint: hoofJoint });
    if (hero || ctx.bp.feather) {
      // tırnak üstü (pastern) tüyü — bozkır ve ağır atlarda tüm LOD'larda
      const feathering = new THREE.ConeGeometry(0.07, 0.09, 5);
      feathering.rotateX(180 * DEG);
      P.push({ geometry: feathering, material: 'mane', joint: hoofJoint, position: [0, 0.02, 0] });
      // nal
      const shoe = new THREE.TorusGeometry(0.072, 0.012, 3, 6);
      shoe.rotateX(90 * DEG);
      P.push({ geometry: shoe, material: 'steelDark', joint: hoofJoint, position: [0, -0.108, 0] });
    }
  }
  return P;
}

/** Kuyruk: süpürülmüş, jitter'lı kıllar. */
function buildTail(ctx: HCtx): HorsePiece[] {
  const P: HorsePiece[] = [];
  const steps = ctx.steps(8);
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    spine.push(v3(-0.1 - t * 0.16, -t * 0.66 + t * t * 0.16, Math.sin(t * 3.2) * 0.04));
  }
  const tail = sweep(
    profile2([[-0.055, -0.03], [0.055, -0.03], [0.045, 0.05], [0, 0.07], [-0.045, 0.05], [-0.055, -0.03]]),
    spine,
    { scale: (t) => (1 - t * 0.72) * (0.7 + 0.5 * Math.sin(Math.PI * Math.min(1, t + 0.15))), seedNormal: v3(0, 0, 1), jitter: 0.012 },
  );
  P.push({ geometry: tail, material: 'mane', joint: 'tail' });

  // kuyruk kaidesi (dock)
  const dock = new THREE.CylinderGeometry(0.07, 0.05, 0.2, ctx.rad(5));
  dock.rotateZ(64 * DEG);
  P.push({ geometry: dock, material: 'coat', joint: 'tail', position: [0.02, 0.02, 0] });
  return P;
}

/** Eyer, eyer örtüsü, üzengi ve kayışlar. */
function buildSaddle(ctx: HCtx): HorsePiece[] {
  const P: HorsePiece[] = [];
  const hero = ctx.lod === 'hero';

  // eyer kaşı (ön/arka yükseltiler) + oturak
  const seat = shellSweep(
    profile2([[-0.24, -0.02], [-0.12, 0.05], [0.1, 0.06], [0.26, -0.02], [0.16, -0.12], [-0.16, -0.12]]),
    profile2([[0, 0.03], [0.05, 0.05], [0.09, 0.02], [0.1, -0.03]]),
  );
  P.push({ geometry: seat, material: 'leather', joint: 'body', position: [0.02, 0.3, 0], rotation: [90 * DEG, 0, 0] });

  const pommel = new THREE.BoxGeometry(0.09, 0.14, 0.2);
  pommel.rotateZ(-12 * DEG);
  P.push({ geometry: pommel, material: 'leatherDark', joint: 'body', position: [0.26, 0.38, 0] });
  const cantle = new THREE.BoxGeometry(0.09, 0.18, 0.22);
  cantle.rotateZ(16 * DEG);
  P.push({ geometry: cantle, material: 'leatherDark', joint: 'body', position: [-0.22, 0.38, 0] });

  // eyer örtüsü (shabrack) — fraksiyon rengi
  const cloth = shellSweep(
    profile2([[-0.42, -0.06], [-0.3, 0.1], [0.2, 0.12], [0.42, -0.04], [0.3, -0.34], [-0.3, -0.36]]),
    profile2([[0, 0.02], [0.045, 0.03], [0.075, 0.0], [0.08, -0.04]]),
  );
  P.push({ geometry: cloth, material: 'caparison', joint: 'body', position: [0.02, 0.26, 0], rotation: [90 * DEG, 0, 0] });
  if (hero) {
    const trim = shellSweep(
      profile2([[-0.42, -0.06], [-0.3, 0.1], [0.2, 0.12], [0.42, -0.04], [0.3, -0.34], [-0.3, -0.36]]),
      profile2([[0.076, -0.042], [0.088, -0.046], [0.086, -0.03]]),
    );
    P.push({ geometry: trim, material: 'caparisonTrim', joint: 'body', position: [0.02, 0.26, 0], rotation: [90 * DEG, 0, 0] });
  }

  // üzengi kayışları + üzengiler
  for (const s of [-1, 1]) {
    const strap = new THREE.BoxGeometry(0.03, 0.44, 0.014);
    P.push({ geometry: strap, material: 'leatherDark', joint: 'body', position: [0.06, 0.08, s * 0.21] });
    const stirrup = new THREE.TorusGeometry(0.075, 0.014, 3, ctx.rad(6), 260 * DEG);
    stirrup.rotateY(90 * DEG);
    stirrup.rotateX(200 * DEG);
    P.push({ geometry: stirrup, material: 'steel', joint: 'body', position: [0.06, -0.16, s * 0.22] });
    if (hero) {
      const tread = new THREE.BoxGeometry(0.03, 0.014, 0.13);
      P.push({ geometry: tread, material: 'steelDark', joint: 'body', position: [0.06, -0.23, s * 0.22] });
    }
  }

  // göğüs kayışı + kuyruk kayışı
  const girth = new THREE.TorusGeometry(0.25, hero ? 0.022 : 0.026, 3, ctx.rad(8));
  girth.rotateY(90 * DEG);
  girth.scale(1, 1, 0.88);
  P.push({ geometry: girth, material: 'leatherDark', joint: 'body', position: [0.14, -0.02, 0] });
  if (hero) {
    const breastCollar = tubeFromPoints([v3(0.72, 0.1, -0.18), v3(0.8, 0.02, 0), v3(0.72, 0.1, 0.18)], 0.024, 4, 2);
    P.push({ geometry: breastCollar, material: 'leather', joint: 'body' });
    const buckle = new THREE.TorusGeometry(0.03, 0.007, 3, 5);
    buckle.rotateY(90 * DEG);
    P.push({ geometry: buckle, material: 'gold', joint: 'body', position: [0.8, 0.02, 0] });
  }
  return P;
}

/** Zırhlı barding: chanfron, criniere, peytral, flanchard, croupiere. */
function buildBarding(ctx: HCtx, caparison: boolean): HorsePiece[] {
  const P: HorsePiece[] = [];
  const hero = ctx.lod === 'hero';

  // ── chanfron (yüz zırhı) ──
  const chanfron = shellSweep(
    profile2([[-0.1, -0.09], [0.06, -0.12], [0.34, -0.06], [0.5, 0.04], [0.3, 0.12], [0.02, 0.12], [-0.1, 0.04]]),
    profile2([[0, 0.012], [0.05, 0.026], [0.085, 0.012], [0.09, -0.014]]),
  );
  P.push({ geometry: chanfron, material: 'steel', joint: 'head', rotation: [90 * DEG, 0, 0] });
  const nasalBand = new THREE.BoxGeometry(0.045, 0.5, 0.02);
  nasalBand.rotateZ(72 * DEG);
  P.push({ geometry: nasalBand, material: 'steelDark', joint: 'head', position: [0.24, 0.02, 0.1] });
  if (hero) {
    // göz koruyucuları
    for (const s of [-1, 1]) {
      const eyeGuard = new THREE.SphereGeometry(0.055, 5, 4, 0, TAU, 0, 120 * DEG);
      P.push({ geometry: eyeGuard, material: 'steelBright', joint: 'head', position: [0.19, 0.03, s * 0.1], rotation: [s * 60 * DEG, 0, 0] });
    }
    const crest = new THREE.ConeGeometry(0.03, 0.14, 4);
    crest.rotateZ(-70 * DEG);
    P.push({ geometry: crest, material: 'gold', joint: 'head', position: [-0.02, 0.16, 0] });
  }

  // ── criniere (boyun zırhı lameleri) ──
  const lameCount = hero ? 4 : 3;
  for (let i = 0; i < lameCount; i++) {
    const t = i / (lameCount - 1 || 1);
    const lame = shellSweep(
      profile2([[-0.12, -0.1], [-0.02, -0.15], [0.1, -0.08], [0.12, 0.06], [0.0, 0.14], [-0.12, 0.06]]),
      profile2([[0, 0.012], [0.055, 0.02], [0.085, 0.0], [0.088, -0.026]]),
    );
    P.push({
      geometry: lame,
      material: i % 2 === 0 ? 'steel' : 'steelDark',
      joint: 'neck',
      position: [0.82 + t * 0.42, 0.16 + t * 0.5 - t * t * 0.14, 0],
      rotation: [90 * DEG, 0, -32 * DEG + t * 12 * DEG],
      scale: 1 - t * 0.22,
    });
  }

  // ── peytral (göğüs zırhı) ──
  const peytral = shellSweep(
    profile2([[-0.3, -0.22], [-0.1, -0.3], [0.16, -0.26], [0.34, -0.1], [0.24, 0.1], [-0.1, 0.12], [-0.3, 0.0]]),
    profile2([[0, 0.014], [0.06, 0.03], [0.1, 0.01], [0.1, -0.03]]),
  );
  P.push({ geometry: peytral, material: 'steel', joint: 'body', position: [0.78, 0.0, 0], rotation: [90 * DEG, 0, -8 * DEG] });
  if (hero) {
    for (let i = 0; i < 3; i++) {
      const a = (-30 + i * 30) * DEG;
      const pendant = new THREE.ConeGeometry(0.035, 0.1, 4);
      pendant.rotateX(180 * DEG);
      P.push({ geometry: pendant, material: 'caparisonTrim', joint: 'body', position: [0.86 + Math.sin(a) * 0.06, -0.24, Math.cos(a) * 0.16] });
    }
  }

  // ── flanchard (yan kalça levhaları) ──
  for (const s of [-1, 1]) {
    const flanch = shellSweep(
      profile2([[-0.24, -0.16], [-0.04, -0.24], [0.2, -0.14], [0.26, 0.06], [0.06, 0.18], [-0.2, 0.1]]),
      profile2([[0, 0.012], [0.05, 0.022], [0.085, 0.006], [0.088, -0.02]]),
    );
    P.push({
      geometry: flanch,
      material: 'steel',
      joint: 'body',
      position: [-0.56, 0.06, s * 0.2],
      rotation: [90 * DEG, 0, s > 0 ? 6 * DEG : -6 * DEG],
    });
  }

  // ── croupiere (sağrı zırhı) ──
  const croupiere = shellSweep(
    profile2([[-0.3, -0.16], [-0.06, -0.26], [0.22, -0.18], [0.32, 0.0], [0.14, 0.18], [-0.16, 0.16], [-0.32, 0.0]]),
    profile2([[0, 0.014], [0.055, 0.026], [0.09, 0.008], [0.092, -0.022]]),
  );
  P.push({ geometry: croupiere, material: 'steelDark', joint: 'body', position: [-0.82, 0.12, 0], rotation: [90 * DEG, 0, 0] });

  // ── caparison (fraksiyon kumaş örtüsü) ──
  if (caparison) {
    const cap = shellSweep(
      profile2([
        [-0.92, -0.34], [-0.6, -0.46], [0.0, -0.5], [0.56, -0.44],
        [0.82, -0.24], [0.6, 0.24], [0.0, 0.34], [-0.6, 0.26], [-0.92, 0.06],
      ]),
      profile2([[0, 0.01], [0.03, 0.016], [0.055, 0.0], [0.06, -0.02]]),
    );
    P.push({ geometry: cap, material: 'caparison', joint: 'body', position: [0, 0.1, 0], rotation: [90 * DEG, 0, 0] });
    if (hero) {
      // etek saçağı
      const fringe = shellSweep(
        profile2([[-0.92, -0.34], [-0.6, -0.46], [0.0, -0.5], [0.56, -0.44], [0.82, -0.24]]),
        profile2([[0.055, -0.02], [0.07, -0.12], [0.05, -0.13]]),
      );
      P.push({ geometry: fringe, material: 'caparisonTrim', joint: 'body', position: [0, 0.1, 0], rotation: [90 * DEG, 0, 0] });
      // sırt boyunca arma şeridi
      const band = new THREE.BoxGeometry(1.5, 0.02, 0.24);
      P.push({ geometry: band, material: 'caparisonTrim', joint: 'body', position: [0, 0.42, 0] });
    }
  }
  return P;
}

/* ─────────────────────────── Horse sınıfı ─────────────────────────── */

export class Horse {
  readonly rig: Rig;
  readonly animator: Animator;
  readonly group = new THREE.Group();
  readonly mats: MaterialLibrary;
  readonly faction: FactionPalette;
  readonly lod: LodLevel;
  readonly coat: CoatColor;
  /** Binicinin oturduğu boş Object3D (karakter kökü buraya bağlanır). */
  readonly saddleSlot = new THREE.Object3D();
  /** Bake + otomatik LOD sonrası GERÇEK çizilen üçgen sayısı. */
  triangles = 0;
  /** Sahne hiyerarşisinin ham üçgen sayısı (vitrin kalitesi). */
  rawTriangles = 0;

  constructor(options: HorseOptions = {}) {
    const factionId = options.faction ?? 'vlandia';
    this.faction = typeof factionId === 'string' ? FactionPalette.byId(factionId) : factionId;
    this.lod = options.lod ?? 'hero';
    const breed = HORSE_BREEDS[options.breed ?? 'war'];
    this.coat = options.coat ?? breed.coat;
    const seed = options.seed ?? 5150;
    const scale = options.scale ?? 1;
    // Cins oranları: iskelet VE geometri aynı tablodan beslenir (eklem kayması olmaz).
    const hp: Record<string, number> = {
      ...HORSE_PROPORTIONS,
      bodyY: HORSE_PROPORTIONS.bodyY * breed.leg,
      shoulderY: HORSE_PROPORTIONS.shoulderY * breed.leg,
      hipY: HORSE_PROPORTIONS.hipY * breed.leg,
      upperLeg: HORSE_PROPORTIONS.upperLeg * breed.leg,
      cannon: HORSE_PROPORTIONS.cannon * breed.leg,
      neckLen: HORSE_PROPORTIONS.neckLen * breed.neck,
      bodyLen: HORSE_PROPORTIONS.bodyLen * breed.len,
      frontLegX: HORSE_PROPORTIONS.frontLegX * breed.len,
      hindLegX: HORSE_PROPORTIONS.hindLegX * breed.len,
    };

    this.mats = new MaterialLibrary(createHorsePalette(this.faction, this.coat));
    this.mats.setFaction(this.faction);

    this.rig = new Rig(horseJoints(scale, hp));
    this.animator = new Animator();
    this.animator.current = 'horseWalk';
    this.animator.ctx.speed = 1;

    this.group.name = `horse_${this.coat}_${this.faction.id}`;
    this.group.add(this.rig.root);

    const ctx = makeHorseCtx({ lod: this.lod, faction: this.faction, seed, scale, bp: breed, hp });
    ctx.mats = this.mats;

    let pieces: HorsePiece[] = [];
    pieces = pieces.concat(buildBarrel(ctx));
    pieces = pieces.concat(buildNeck(ctx));
    pieces = pieces.concat(buildHead(ctx));
    pieces = pieces.concat(buildLegs(ctx));
    pieces = pieces.concat(buildTail(ctx));
    if (options.saddle !== false) pieces = pieces.concat(buildSaddle(ctx));
    if (options.barding) pieces = pieces.concat(buildBarding(ctx, options.caparison !== false));

    for (const piece of pieces) {
      if (!this.rig.has(piece.joint)) continue;
      const def = this.mats.resolve(piece.material);
      const mat =
        def && this.mats.has(def.key)
          ? this.mats.material(def.key)
          : new THREE.MeshStandardMaterial({
              color: def ? def.color : 0xffffff,
              metalness: def ? def.metalness : 0.15,
              roughness: def ? def.roughness : 0.85,
              flatShading: true,
            });
      const mesh = new THREE.Mesh(piece.geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (piece.position) mesh.position.set(...piece.position);
      if (piece.rotation) mesh.rotation.set(...piece.rotation);
      if (piece.scale !== undefined) {
        if (typeof piece.scale === 'number') mesh.scale.setScalar(piece.scale);
        else mesh.scale.set(...piece.scale);
      }
      this.rig.joint(piece.joint).add(mesh);
    }

    // eyer yuvası (binici burada oturur)
    this.saddleSlot.name = 'saddleSlot';
    // body eklemi ZATEN bodyY yüksekliğinde: slot yalnızca eyer kadar yükselir.
    this.saddleSlot.position.set(0.02, 0.42 * scale, 0);
    this.rig.joint('body').add(this.saddleSlot);

    this.rawTriangles = this.countTriangles();
    // Çizilen üçgen: bake + otomatik LOD indirgeme sonrası (Bölüm 1: 500-900).
    this.triangles = Math.round(triCount(this.bakeToGeometry()));
  }

  /** Biniciyi eyere oturtur (mountedIdle pozu uygulanır). */
  attachRider(character: Character): void {
    // Character kökü AYAKLARDA: eyer yuvasına sıfırla bırakırsak ayaklar
    // eyer hizasında kalıp binici havada asılı durur. Leğen kemiği (~0.95 m)
    // kadar indiriyoruz ki kalça eyere, dizler barding'e otursun.
    character.group.position.set(0, -0.93, 0.01);
    character.group.rotation.set(0, 0, 0);
    this.saddleSlot.add(character.group);
    character.animator.play('mountedIdle');
    character.animator.ctx.mounted = true;
    // bacaklar eyere göre kırılır
    character.setPose({
      thighL: [-74, 0, 12],
      shinL: [78, 0, 0],
      footL: [-8, 0, 0],
      thighR: [-74, 0, -12],
      shinR: [78, 0, 0],
      footR: [-8, 0, 0],
    });
  }

  detachRider(character: Character): void {
    this.saddleSlot.remove(character.group);
    character.animator.ctx.mounted = false;
  }

  countTriangles(): number {
    let total = 0;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) total += triCount(m.geometry);
    });
    return Math.round(total);
  }

  /** Bütçe kontrolü: zırhlı savaş atı 500–900 üçgen (battle LOD). */
  checkBudget(tracker = new BudgetTracker()): { triangles: number; budget: number; ok: boolean } {
    const budget = this.lod === 'hero' ? BUDGET.horseMax * 3 : BUDGET.horseMax;
    tracker.check(`horse/${this.lod}`, this.bakeToGeometry(), budget);
    return { triangles: this.triangles, budget, ok: this.triangles <= budget };
  }

  update(dt: number): void {
    this.animator.update(this.rig, dt);
  }

  setGait(speed: number): void {
    this.animator.ctx.speed = speed;
    this.animator.play('horseWalk');
  }

  /** At + biniciyi tek geometriye pişirir (süvari InstancedMesh için). */
  bakeToGeometry(maxTris: number = horseBudget(this.lod)): THREE.BufferGeometry {
    this.group.updateMatrixWorld(true);
    const refBone = this.rig.joints.get('root') ?? this.group;
    const inv = new THREE.Matrix4().copy(refBone.matrixWorld).invert();
    const m = new THREE.Matrix4();
    const pieces: Piece[] = [];
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.updateWorldMatrix(true, false);
      m.multiplyMatrices(inv, mesh.matrixWorld);
      const g = mesh.geometry.clone();
      g.applyMatrix4(m);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      pieces.push({
        geometry: g,
        material: { key: 'bake', color: mat.color.getHex(), metalness: mat.metalness, roughness: mat.roughness, flatShading: true },
      });
    });
    const merged = mergePieces(pieces, this.mats);
    if (maxTris === undefined || triCount(merged) <= maxTris) return merged;
    const reduced = reduceToBudget(merged, maxTris);
    merged.dispose();
    return reduced;
  }

  createBakedMesh(maxTris?: number): THREE.Mesh {
    return new THREE.Mesh(this.bakeToGeometry(maxTris), this.mats.mergedMaterial(`horse_${this.coat}_${this.faction.id}`));
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.mats.dispose();
    this.rig.dispose();
  }
}
