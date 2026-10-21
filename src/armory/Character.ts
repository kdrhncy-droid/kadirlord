/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · Character.ts
 *  Modüler low-poly insan birimi: gövde + zırh + silah + kalkan + miğfer.
 *
 *  ✦ Tüm parçalar EKLEM PIVOT'larına bağlanır (Rig.ts) → animasyon bedava.
 *  ✦ Ekipman yuvaları (equipment slots): weaponR / weaponL / shield / back /
 *    head / torso. Silahlar Armory.ts'ten gelir, kuşanma anında takılır.
 *  ✦ bakeToGeometry(): rig'in o anki pozunu tüm parçaların dünya matrisleriyle
 *    TEK BufferGeometry'ye pişirir. Army.ts bunu InstancedMesh ile çoğaltır
 *    → 500v500 savaşta birim başına 1 draw-call bile değil, TİP başına 1.
 *  ✦ Üçgen bütçesi: tam donanımlı piyade 400–800 (Bölüm 1 / madde 3).
 *
 *  ÖLÇEK: 1.80 m, zemin y = 0, karakter +Z'ye bakar.
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
  Vec3Tuple,
  jitterGeometry,
  mergePieces,
  normalizeGeometry,
  profile2,
  quantizeGeometry,
  reduceToBudget,
  sweep,
  triCount,
  v3,
} from './Core.ts';
import { Armory, ArmoryItemId, ArmoryItemBuild } from './Armory.ts';
import { ArmorOptions, ArmorPiece, ArmorSet, buildArmorSet, createArmorPalette } from './Armor.ts';
import { FactionPalette } from './Faction.ts';
import { Animator, HUMANOID, Rig, humanoidJoints } from './Rig.ts';

/* ─────────────────────────── tipler ─────────────────────────── */

export type UnitRole = 'infantry' | 'archer' | 'cavalry' | 'sergeant' | 'banner';

export interface CharacterLoadout {
  /** Sağ el silahı. */
  weapon?: ArmoryItemId | null;
  /** Sol el (kalkan, ikinci silah ya da yay). */
  offhand?: ArmoryItemId | null;
  /** Sırta asılan (kılıç, balta, yay, kalkan). */
  back?: ArmoryItemId | null;
  /** Zırh tier'ı. */
  tier?: 'light' | 'medium' | 'heavy';
  /** Miğfer stili ('none' = baş açık). */
  helm?: 'greatHelm' | 'spangen' | 'kettle' | 'none';
  /** Surcoat (fraksiyon kumaşı). */
  surcoat?: boolean;
  /** Rol: animasyon ve ekipman ön ayarları. */
  role?: UnitRole;
}

export interface CharacterOptions {
  faction?: FactionPalette | string;
  loadout?: CharacterLoadout;
  lod?: LodLevel;
  seed?: number;
  /** Boy ölçeği (1 = 1.80 m). */
  scale?: number;
  /** Vücut tipi varyasyonu (0..1) — omuz/genişlik. */
  build?: number;
  /** Deri tonu. */
  skin?: number;
}

export class CharacterBudget {
  body = 0;
  armor = 0;
  equipment = 0;
  /** Sahne hiyerarşisinin ham üçgen sayısı (vitrin kalitesi). */
  rawTotal = 0;
  /** Bake + otomatik LOD sonrası GERÇEK çizilen üçgen sayısı. */
  total = 0;
  budget = 0;
  ok = true;
}

export const ROLE_PRESETS: Record<UnitRole, CharacterLoadout> = {
  infantry: { weapon: 'gladius', offhand: 'vikingShield', tier: 'medium', helm: 'spangen', role: 'infantry' },
  archer: { weapon: 'recurveBow', offhand: null, back: 'arrow', tier: 'light', helm: 'kettle', role: 'archer' },
  cavalry: { weapon: 'lance', offhand: 'kiteShield', back: 'scimitar', tier: 'heavy', helm: 'greatHelm', role: 'cavalry' },
  sergeant: { weapon: 'greatsword', offhand: null, tier: 'heavy', helm: 'greatHelm', role: 'sergeant' },
  banner: { weapon: 'gladius', offhand: 'vikingShield', tier: 'medium', helm: 'spangen', role: 'banner' },
};

/* ─────────────────────────── vücut paleti ─────────────────────────── */

export function createBodyPalette(f: FactionPalette, skin: number): Record<string, Omit<MaterialDef, 'key'>> {
  return {
    skin: { color: skin, metalness: 0.03, roughness: 0.88 },
    skinDark: { color: mixChar(skin, 0x2a1a12, 0.35), metalness: 0.03, roughness: 0.9 },
    hair: { color: 0x2c211a, metalness: 0.05, roughness: 0.95 },
    eye: { color: 0x14100e, metalness: 0.1, roughness: 0.4 },
    undersuit: { color: mixChar(f.colors.cloth, 0x2a2622, 0.3), metalness: 0.04, roughness: 0.95 },
    hose: { color: mixChar(f.colors.cloth, 0x1e1a16, 0.5), metalness: 0.04, roughness: 0.95 },
    bootLeather: { color: f.colors.leather, metalness: 0.04, roughness: 0.92 },
    beltLeather: { color: mixChar(f.colors.leather, 0x120c06, 0.4), metalness: 0.05, roughness: 0.94 },
  };
}

function mixChar(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

/* ─────────────────────────── vücut üreticisi ─────────────────────────── */

interface BodyPiece {
  geometry: THREE.BufferGeometry;
  material: string;
  joint: string;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple | number;
}

/**
 * İnsan gövdesi: ~170 üçgen (battle LOD). Her parça ait olduğu eklemin
 * uzayında, eklem pivotundan aşağı/ileri uzanacak şekilde modellenir.
 */
export function buildBody(
  ctx: { lod: LodLevel; rng: () => number; build: number; scale: number },
): BodyPiece[] {
  const P: BodyPiece[] = [];
  const hero = ctx.lod === 'hero';
  // Bölüm 1 bütçesi (400-800) gövdeye ≈ 360 üçgen ayırır → radyal sayılar buna göre.
  const rad = ctx.lod === 'hero' ? 8 : ctx.lod === 'battle' ? 6 : 5;
  const sphSeg = ctx.lod === 'hero' ? [7, 5] : ctx.lod === 'battle' ? [5, 3] : [4, 3];
  const b = 0.88 + ctx.build * 0.26; // vücut genişliği çarpanı
  const jitter = hero ? 0.0025 : 0;

  const tube = (
    len: number,
    r0: number,
    r1: number,
    mat: string,
    joint: string,
    opts: { y?: number; squash?: number; radial?: number; rotZ?: number } = {},
  ) => {
    const g = new THREE.CylinderGeometry(r1, r0, len, Math.max(4, opts.radial ?? rad), hero ? 2 : 1);
    g.translate(0, (opts.y ?? 0) - len / 2, 0);
    if (opts.squash) g.scale(1, 1, opts.squash);
    if (opts.rotZ) g.rotateZ(opts.rotZ);
    if (jitter) jitterGeometry(g, jitter, 1234);
    P.push({ geometry: g, material: mat, joint });
  };

  // ── pelvis + karın ──
  const pelvis = new THREE.CylinderGeometry(0.135 * b, 0.15 * b, 0.14, rad, 1);
  pelvis.scale(1, 1, 0.86);
  P.push({ geometry: pelvis, material: 'undersuit', joint: 'pelvis', position: [0, 0.02, 0] });

  const abdomen = new THREE.CylinderGeometry(0.152 * b, 0.142 * b, 0.19, rad, 1);
  abdomen.scale(1, 1, 0.84);
  if (jitter) jitterGeometry(abdomen, jitter, 22);
  P.push({ geometry: abdomen, material: 'undersuit', joint: 'spine', position: [0, 0.02, 0] });

  // ── göğüs: omuzlarda geniş, belde dar (süpürülmüş kesit) ──
  const chest = sweep(
    profile2([
      [-0.175 * b, -0.075],
      [0, -0.1],
      [0.175 * b, -0.075],
      [0.185 * b, 0.03],
      [0, 0.075],
      [-0.185 * b, 0.03],
      [-0.175 * b, -0.075],
    ]),
    hero ? [v3(0, 0, 0), v3(0, 0.12, 0), v3(0, 0.24, -0.005)] : [v3(0, 0, 0), v3(0, 0.24, -0.005)],
    { scale: (t) => 1 - t * 0.12, seedNormal: v3(1, 0, 0) },
  );
  if (jitter) jitterGeometry(chest, jitter, 33);
  P.push({ geometry: chest, material: 'undersuit', joint: 'chest', position: [0, -0.02, 0] });

  // ── boyun ──
  tube(0.1, 0.052, 0.048, 'skin', 'neck', { y: 0.06 });

  // ── kafa: fasetli tas + çene + burun ──
  const head = new THREE.SphereGeometry(0.103, sphSeg[0], sphSeg[1]);
  head.scale(0.92, 1.06, 1);
  if (hero) quantizeGeometry(head, 0.012);
  P.push({ geometry: head, material: 'skin', joint: 'head', position: [0, 0.028, 0] });

  const jaw = new THREE.BoxGeometry(0.11, 0.062, 0.1);
  jaw.translate(0, -0.04, 0.026);
  if (hero) quantizeGeometry(jaw, 0.012);
  P.push({ geometry: jaw, material: 'skin', joint: 'head' });

  const nose = new THREE.ConeGeometry(0.019, 0.045, 3);
  nose.rotateX(90 * DEG);
  P.push({ geometry: nose, material: 'skinDark', joint: 'head', position: [0, 0.022, 0.104] });

  if (hero) {
    for (const s of [-1, 1]) {
      const eye = new THREE.OctahedronGeometry(0.012, 0);
      eye.scale(1.3, 0.8, 0.5);
      P.push({ geometry: eye, material: 'eye', joint: 'head', position: [s * 0.038, 0.042, 0.088] });
      const brow = new THREE.BoxGeometry(0.045, 0.012, 0.02);
      P.push({ geometry: brow, material: 'hair', joint: 'head', position: [s * 0.038, 0.066, 0.088] });
      const ear = new THREE.BoxGeometry(0.018, 0.038, 0.014);
      P.push({ geometry: ear, material: 'skinDark', joint: 'head', position: [s * 0.098, 0.022, 0] });
    }
    // saç: tasın üst/arka yarısı
    const hair = new THREE.SphereGeometry(0.108, 6, 3, 0, TAU, 0, 118 * DEG);
    hair.scale(0.96, 1.06, 1.04);
    hair.translate(0, 0.028, -0.012);
    P.push({ geometry: hair, material: 'hair', joint: 'head' });
    const beard = new THREE.ConeGeometry(0.06, 0.12, 4);
    beard.rotateX(180 * DEG);
    P.push({ geometry: beard, material: 'hair', joint: 'head', position: [0, -0.085, 0.04] });
  } else {
    // düşük LOD: tek parça saç kapağı
    const hair = new THREE.SphereGeometry(0.108, sphSeg[0] - 1, sphSeg[1] - 1, 0, TAU, 0, 110 * DEG);
    hair.scale(0.96, 1.05, 1.03);
    P.push({ geometry: hair, material: 'hair', joint: 'head', position: [0, 0.028, -0.01] });
  }

  // ── kollar ──
  for (const side of [-1, 1]) {
    const sJ = side > 0 ? 'shoulderR' : 'shoulderL';
    const uJ = side > 0 ? 'upperArmR' : 'upperArmL';
    const fJ = side > 0 ? 'forearmR' : 'forearmL';
    const hJ = side > 0 ? 'handR' : 'handL';

    const deltoid = new THREE.SphereGeometry(0.062 * b, sphSeg[0] - 1, sphSeg[1] - 1);
    deltoid.scale(1, 0.92, 1);
    P.push({ geometry: deltoid, material: 'undersuit', joint: sJ, position: [side * 0.012, -0.01, 0] });

    tube(HUMANOID.upperArm * 0.98, 0.052 * b, 0.043 * b, 'skin', uJ);
    const elbow = new THREE.SphereGeometry(0.045 * b, sphSeg[0] - 2, sphSeg[1] - 1);
    P.push({ geometry: elbow, material: 'skin', joint: fJ, position: [0, 0.006, 0] });
    tube(HUMANOID.forearm * 0.94, 0.044 * b, 0.032 * b, 'skin', fJ);

    // el: avuç + başparmak (blok, low-poly)
    const palm = new THREE.BoxGeometry(0.052, 0.085, 0.036);
    P.push({ geometry: palm, material: 'skin', joint: hJ, position: [0, -0.055, 0] });
    if (hero) {
      const thumb = new THREE.BoxGeometry(0.02, 0.045, 0.026);
      P.push({
        geometry: thumb,
        material: 'skin',
        joint: hJ,
        position: [side * 0.032, -0.045, 0.014],
        rotation: [0, 0, side * -24 * DEG],
      });
    }
  }

  // ── bacaklar ──
  for (const side of [-1, 1]) {
    const tJ = side > 0 ? 'thighR' : 'thighL';
    const sJ = side > 0 ? 'shinR' : 'shinL';
    const fJ = side > 0 ? 'footR' : 'footL';

    tube(HUMANOID.thigh * 0.98, 0.088 * b, 0.068 * b, 'hose', tJ);
    const knee = new THREE.SphereGeometry(0.066 * b, sphSeg[0] - 2, sphSeg[1] - 1);
    P.push({ geometry: knee, material: 'hose', joint: sJ, position: [0, 0.008, 0] });
    tube(HUMANOID.shin * 0.96, 0.062 * b, 0.044 * b, 'hose', sJ);

    // ayak/çizme: topuk + burun
    const boot = new THREE.BoxGeometry(0.088, 0.075, hero ? 0.2 : 0.26);
    boot.translate(0, -HUMANOID.ankleY + 0.036, hero ? 0.045 : 0.06);
    if (hero) quantizeGeometry(boot, 0.012);
    P.push({ geometry: boot, material: 'bootLeather', joint: fJ });
    if (hero) {
      const toe = new THREE.BoxGeometry(0.084, 0.05, 0.07);
      toe.translate(0, -HUMANOID.ankleY + 0.024, 0.155);
      P.push({ geometry: toe, material: 'bootLeather', joint: fJ });
    }
    if (hero) {
      const cuffGeo = new THREE.CylinderGeometry(0.058, 0.05, 0.05, 6);
      P.push({ geometry: cuffGeo, material: 'beltLeather', joint: sJ, position: [0, -HUMANOID.shin * 0.92, 0] });
    }
  }

  // ── kemerde temel deri ──
  const belt = new THREE.TorusGeometry(0.152 * b, hero ? 0.018 : 0.022, 3, rad);
  belt.rotateX(90 * DEG);
  belt.scale(1, 1, 0.86);
  P.push({ geometry: belt, material: 'beltLeather', joint: 'pelvis', position: [0, 0.05, 0] });

  return P;
}

/* ─────────────────────────── ekipman tutturma noktaları ─────────────────────────── */

export interface EquipmentMount {
  joint: string;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: number;
}

/**
 * Her ekipmanın elde/sırta nasıl duracağı. Değerler karakter ölçeğinde
 * (1.80 m) tanımlıdır; Armory modelleri gerçek boyutlarında üretilir.
 */
/**
 * Her ekipmanın elde / sırta nasıl duracağı. `position` değeri parçanın
 * KABZA (grip) noktasını ekleme oturtur: position = -grip + el ofseti.
 * Karakter +Z'ye bakar; sağ el +X, sol el -X tarafındadır.
 */
export const EQUIPMENT_MOUNTS: Record<string, EquipmentMount> = {
  // ── sağ el: kılıçlar ──
  gladius: { joint: 'weaponR', position: [0.01, -0.19, 0.02], rotation: [0, 0, 0], scale: 1 },
  scimitar: { joint: 'weaponR', position: [0.01, -0.2, 0.02], rotation: [0, 0, 0], scale: 1 },
  greatsword: { joint: 'weaponR', position: [0.0, -0.18, -0.02], rotation: [0, 0, 0], scale: 1 },
  // ── sağ el: baltalar (sap elde, baş yukarıda) ──
  warAxe: { joint: 'weaponR', position: [0.01, -0.3, 0.01], rotation: [0, 0, 0], scale: 1 },
  flangedMace: { joint: 'weaponR', position: [0.01, -0.16, 0.02], rotation: [0, 0, 0], scale: 1 },
  warHammer: { joint: 'weaponR', position: [0.01, -0.17, 0.02], rotation: [0, 0, 0], scale: 1 },
  morningstar: { joint: 'weaponR', position: [0.01, -0.15, 0.02], rotation: [0, 0, 0], scale: 1 },
  bardiche: { joint: 'weaponR', position: [0.02, -0.82, 0.0], rotation: [0, 0, 0], scale: 1 },
  // ── sağ el: gönderliler ──
  lance: { joint: 'weaponR', position: [0.01, -0.995, 0.125], rotation: [-6 * DEG, 0, 0], scale: 1 },
  halberd: { joint: 'weaponR', position: [0.02, -0.78, 0.02], rotation: [0, 0, 0], scale: 1 },
  billhook: { joint: 'weaponR', position: [0.01, -0.55, 0.02], rotation: [0, 0, 0], scale: 1 },
  // ── sol el: yay (kollar dikey, kiriş karaktere bakacak şekilde) ──
  recurveBow: { joint: 'weaponL', position: [0.0, -0.02, -0.04], rotation: [0, 90 * DEG, 0], scale: 1 },
  // ── sağ el: ok (atış anında) ──
  arrow: { joint: 'weaponR', position: [0.0, -0.06, 0.02], rotation: [0, 0, 0], scale: 1 },
  // ── sol ön kol: kalkanlar (yüz dışarı, -X'e bakar) ──
  vikingShield: { joint: 'forearmL', position: [-0.07, -0.18, -0.01], rotation: [0, -90 * DEG, 0], scale: 1 },
  kiteShield: { joint: 'forearmL', position: [-0.1, -0.16, -0.02], rotation: [0, -90 * DEG, 0], scale: 1 },
  paviseShield: { joint: 'forearmL', position: [-0.061, -0.3, -0.02], rotation: [0, -90 * DEG, 0], scale: 1 },
  cavalryRound: { joint: 'forearmL', position: [-0.058, -0.12, -0.01], rotation: [0, -90 * DEG, 0], scale: 1 },
  // ── kafa: Armory miğferleri (zırh sistemi yerine vitrin amaçlı kullanım) ──
  greatHelm: { joint: 'head', position: [0, 0.055, 0], rotation: [0, 0, 0], scale: 1 },
  hornedHelm: { joint: 'head', position: [0, 0.05, 0], rotation: [0, 0, 0], scale: 1 },
  nasalHelm: { joint: 'head', position: [0, 0.045, 0], rotation: [0, 0, 0], scale: 1 },
  kettleHat: { joint: 'head', position: [0, 0.05, 0], rotation: [0, 0, 0], scale: 1 },
  // ── gövde: Armory göğüs zırhı ──
  cuirass: { joint: 'pelvis', position: [0, 0.28, 0], rotation: [0, 0, 0], scale: 1 },
  // ── sırt ──
  backSword: { joint: 'chest', position: [0.04, 0.02, -0.19], rotation: [0, 0, 166 * DEG], scale: 1 },
  backAxe: { joint: 'chest', position: [-0.05, 0.0, -0.19], rotation: [0, 0, 186 * DEG], scale: 1 },
  backBow: { joint: 'chest', position: [-0.08, 0.0, -0.18], rotation: [0, 0, 96 * DEG], scale: 1 },
  backQuiver: { joint: 'chest', position: [0.1, 0.04, -0.18], rotation: [0, 0, -20 * DEG], scale: 1 },
  backShield: { joint: 'chest', position: [0, -0.04, -0.21], rotation: [0, 180 * DEG, 0], scale: 1 },
};

/** Ok kılıfı (sadak): sırtta taşınan, içinden oklar görünen deri tüp. */
export function buildQuiver(lod: LodLevel, faction: FactionPalette): Piece[] {
  const hero = lod === 'hero';
  const rad = lod === 'hero' ? 8 : 6;
  const P: Piece[] = [];
  const body = new THREE.CylinderGeometry(0.055, 0.042, 0.52, rad, 1);
  P.push({ geometry: body, material: { key: 'quiverBody', color: faction.colors.leather, metalness: 0.05, roughness: 0.92, flatShading: true } });
  const rim = new THREE.TorusGeometry(0.056, hero ? 0.008 : 0.01, 3, rad);
  rim.rotateX(90 * DEG);
  P.push({ geometry: rim, material: { key: 'quiverRim', color: faction.colors.gold, metalness: 0.85, roughness: 0.35, flatShading: true }, position: [0, 0.26, 0] });
  // içinden çıkan oklar
  const arrows = hero ? 5 : 3;
  for (let i = 0; i < arrows; i++) {
    const a = (i / arrows) * TAU;
    const shaft = new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4);
    P.push({
      geometry: shaft,
      material: { key: 'quiverArrow', color: faction.colors.wood, metalness: 0.05, roughness: 0.88, flatShading: true },
      position: [Math.cos(a) * 0.022, 0.36, Math.sin(a) * 0.022],
      rotation: [Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08],
    });
    const fletch = new THREE.BoxGeometry(0.006, 0.07, 0.028);
    P.push({
      geometry: fletch,
      material: { key: 'quiverFletch', color: faction.colors.primary, metalness: 0.04, roughness: 0.95, flatShading: true, factionTint: 'primary' },
      position: [Math.cos(a) * 0.026, 0.48, Math.sin(a) * 0.026],
    });
  }
  // askı kayışı
  const strap = sweep(
    profile2([[-0.012, -0.004], [0.012, -0.004], [0.012, 0.004], [-0.012, 0.004], [-0.012, -0.004]]),
    [v3(0.05, 0.22, 0), v3(0.02, 0.05, 0.05), v3(-0.03, -0.15, 0.02)],
    {},
  );
  P.push({ geometry: strap, material: { key: 'quiverStrap', color: mixChar(faction.colors.leather, 0x100a04, 0.4), metalness: 0.04, roughness: 0.95, flatShading: true } });
  return P;
}

/* ─────────────────────────── Character sınıfı ─────────────────────────── */

export class Character {
  readonly rig: Rig;
  readonly animator: Animator;
  readonly group = new THREE.Group();
  readonly mats: MaterialLibrary;
  readonly faction: FactionPalette;
  readonly lod: LodLevel;
  readonly loadout: CharacterLoadout;
  private readonly _budget = new CharacterBudget();
  private budgetDirty = true;

  /** Bölge/eklem adı → takılı ekipman mesh'leri. */
  private equipped = new Map<string, THREE.Object3D[]>();
  private armorSet: ArmorSet | null = null;
  private armory: Armory;
  private scale: number;
  private build_: number;

  constructor(options: CharacterOptions = {}) {
    const factionId = options.faction ?? 'vlandia';
    this.faction = typeof factionId === 'string' ? FactionPalette.byId(factionId) : factionId;
    this.lod = options.lod ?? 'hero';
    this.loadout = { ...(options.loadout ?? ROLE_PRESETS.infantry) };
    this.scale = options.scale ?? 1;
    this.build_ = options.build ?? 0.5;
    const seed = options.seed ?? 90210;

    this.mats = new MaterialLibrary({
      ...createBodyPalette(this.faction, options.skin ?? 0xc08a62),
      ...createArmorPalette(this.faction),
    });
    this.mats.setFaction(this.faction);
    this.armory = new Armory(this.faction, { seed, warnOnBudgetOverflow: false });

    this.rig = new Rig(humanoidJoints(this.scale));
    this.animator = new Animator();
    this.group.name = `character_${this.faction.id}_${this.loadout.role ?? 'infantry'}`;
    this.group.add(this.rig.root);

    this.buildBody(seed);
    this.equipArmor({
      tier: this.loadout.tier ?? 'medium',
      helmStyle: this.loadout.helm ?? 'spangen',
      surcoat: this.loadout.surcoat ?? true,
      lod: this.lod,
      faction: this.faction,
      seed,
    });
    this.equipFromLoadout();
    this.budgetDirty = true;
  }

  /* ── gövde ── */
  private buildBody(seed: number): void {
    let a = seed >>> 0 || 1;
    const rng = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pieces = buildBody({ lod: this.lod, rng, build: this.build_, scale: this.scale });
    for (const piece of pieces) {
      const mesh = new THREE.Mesh(piece.geometry, this.mats.material(piece.material));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (piece.position) mesh.position.set(...piece.position);
      if (piece.rotation) mesh.rotation.set(...piece.rotation);
      if (piece.scale !== undefined) {
        if (typeof piece.scale === 'number') mesh.scale.setScalar(piece.scale);
        else mesh.scale.set(...piece.scale);
      }
      this.rig.joint(piece.joint).add(mesh);
      this.track('body', mesh);
    }
  }

  /* ── zırh ── */
  equipArmor(opts: ArmorOptions): ArmorSet {
    this.clearSlotGroup('armor');
    this.budgetDirty = true;
    const set = buildArmorSet({ ...opts, faction: opts.faction ?? this.faction, lod: opts.lod ?? this.lod });
    this.armorSet = set;
    for (const zone of Object.keys(set.zones) as (keyof typeof set.zones)[]) {
      for (const piece of set.zones[zone] ?? []) this.attachArmorPiece(piece);
    }
    return set;
  }

  private attachArmorPiece(piece: ArmorPiece): void {
    if (!this.rig.has(piece.joint)) return;
    const def = this.mats.resolve(piece.material);
    const mat = def && this.mats.has(def.key) ? this.mats.material(def.key) : inlineMat((def ?? piece.material) as MaterialDef);
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
    this.track('armor', mesh);
  }

  /* ── ekipman ── */
  /**
   * Bir ekipmanı belirtilen yuvaya takar. `slot` temizleme/izleme için kullanılır.
   * Döndürür: takılan THREE.Object3D (animasyon/vurgu için).
   */
  equip(itemId: ArmoryItemId | 'quiver', slot: string, mountKey?: string): THREE.Object3D | null {
    this.clearSlotGroup(slot);
    this.budgetDirty = true;
    let node: THREE.Object3D;
    let mount: EquipmentMount;

    if (itemId === 'quiver') {
      mount = EQUIPMENT_MOUNTS.backQuiver;
      const g = new THREE.Group();
      for (const piece of buildQuiver(this.lod, this.faction)) {
        const def = this.mats.resolve(piece.material);
        const mat = def && this.mats.has(def.key) ? this.mats.material(def.key) : inlineMat((def ?? piece.material) as MaterialDef);
        const mesh = new THREE.Mesh(piece.geometry, mat);
        if (piece.position) mesh.position.set(...piece.position);
        if (piece.rotation) mesh.rotation.set(...piece.rotation);
        mesh.castShadow = true;
        g.add(mesh);
      }
      node = g;
    } else {
      const item = this.armory.buildItem(itemId, this.lod === 'crowd' ? 'crowd' : this.lod === 'battle' ? 'battle' : 'hero');
      mount = EQUIPMENT_MOUNTS[mountKey ?? itemId] ?? { joint: 'weaponR', position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
      node = item.group;
    }

    node.position.set(...mount.position);
    node.rotation.set(...mount.rotation);
    node.scale.setScalar(mount.scale);
    if (!this.rig.has(mount.joint)) {
      console.warn(`[Bannerforge] Character: "${mount.joint}" eklemi yok, "${itemId}" chest'e takıldı.`);
      this.rig.joint('chest').add(node);
    } else {
      this.rig.joint(mount.joint).add(node);
    }
    this.track(slot, node);
    return node;
  }

  private equipFromLoadout(): void {
    const L = this.loadout;
    if (L.weapon) this.equip(L.weapon, 'weapon');
    if (L.offhand) {
      if (L.offhand === 'recurveBow') this.equip(L.offhand, 'offhand');
      else this.equip(L.offhand, 'shield');
    }
    if (L.back === 'arrow') this.equip('quiver', 'back');
    else if (L.back) this.equip(L.back, 'back', backMountFor(L.back));
  }

  private track(slot: string, node: THREE.Object3D): void {
    const list = this.equipped.get(slot) ?? [];
    list.push(node);
    this.equipped.set(slot, list);
  }

  clearSlotGroup(slot: string): void {
    const list = this.equipped.get(slot);
    if (!list) return;
    for (const node of list) {
      node.parent?.remove(node);
      node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    this.equipped.delete(slot);
  }

  /** Tüm takılı ekipmanı söker. */
  unequipAll(): void {
    for (const slot of [...this.equipped.keys()]) this.clearSlotGroup(slot);
  }

  /* ── bütçe ── */
  /**
   * VİTRİN bütçesi: hero LOD zengin tutulur (yakın çekim kalite), battle/crowd
   * Bölüm 1 sınırına uyar. `bakeToGeometry()` varsayılan olarak bunu kullanır.
   */
  get triangleBudget(): number {
    return this.lod === 'hero' ? BUDGET.soldierMax * 3 : this.lod === 'battle' ? BUDGET.soldierMax : BUDGET.soldierMin * 2;
  }

  /**
   * PERFORMANS bütçesi: 500v500 savaşta çizilecek birim başına kesin sınır.
   * Bölüm 1 → tam donanımlı piyade 400-800 üçgen.
   */
  get performanceBudget(): number {
    if (this.lod === 'hero') return BUDGET.soldierMax;
    if (this.lod === 'battle') return BUDGET.soldierMax;
    return Math.round(BUDGET.soldierMax * 0.72); // crowd: 576
  }

  /**
   * Bütçe raporu (tembel hesaplanır — ilk erişimde bir kez bake alınır).
   * `rawTotal` sahne hiyerarşisinin (vitrin) üçgen sayısıdır; `total` ise
   * GERÇEKTEN çizilen (bake + otomatik LOD indirgeme sonrası) üçgen sayısıdır.
   * Bölüm 1 uyumu `total` üzerinden denetlenir.
   */
  get budget(): CharacterBudget {
    if (this.budgetDirty) this.computeBudget();
    return this._budget;
  }

  private computeBudget(): void {
    let body = 0;
    let armor = 0;
    let equipment = 0;
    for (const [slot, list] of this.equipped) {
      for (const node of list) {
        const t = countObject(node);
        if (slot === 'body') body += t;
        else if (slot === 'armor') armor += t;
        else equipment += t;
      }
    }
    const raw = body + armor + equipment;
    const baked = triCount(this.bakeToGeometry(this.performanceBudget));
    const limit = this.performanceBudget;
    const b = this._budget;
    b.body = body;
    b.armor = armor;
    b.equipment = equipment;
    b.rawTotal = raw;
    b.total = Math.round(baked);
    b.budget = limit;
    b.ok = baked <= limit;
    this.budgetDirty = false;
    if (!b.ok && typeof console !== 'undefined') {
      console.warn(
        `[Bannerforge] BÜTÇE AŞIMI (${this.group.name}): ${Math.round(baked)} > ${limit} üçgen ` +
          `(ham ${raw}: gövde ${body} + zırh ${armor} + ekipman ${equipment})`,
      );
    }
  }

  /** Gerçekten çizilen üçgen sayısı (bake + otomatik LOD sonrası). */
  get triangles(): number {
    return this.budget.total;
  }

  /** Vitrin hiyerarşisinin ham üçgen sayısı. */
  get rawTriangles(): number {
    return this.budget.rawTotal;
  }

  /** Rol preset'ini uygula (silah/zırh/miğfer değişimi runtime'da). */
  applyRole(role: UnitRole, faction?: FactionPalette | string): void {
    if (faction) {
      this.setFaction(faction);
    }
    const preset = ROLE_PRESETS[role];
    this.loadout.weapon = preset.weapon;
    this.loadout.offhand = preset.offhand;
    this.loadout.back = preset.back;
    this.loadout.tier = preset.tier;
    this.loadout.helm = preset.helm;
    this.loadout.role = role;
    this.equipArmor({
      tier: preset.tier ?? 'medium',
      helmStyle: preset.helm ?? 'spangen',
      surcoat: true,
      lod: this.lod,
      faction: this.faction,
    });
    this.equipFromLoadout();
    this.budgetDirty = true;
  }

  setFaction(faction: FactionPalette | string): void {
    const f = typeof faction === 'string' ? FactionPalette.byId(faction) : faction;
    (this as { faction: FactionPalette }).faction = f;
    for (const [k, def] of Object.entries(createArmorPalette(f))) this.mats.define(k, def);
    this.mats.setFaction(f);
    this.armory.setFaction(f);
    // tint'li materyaller cache'ten yeniden üretilir; mevcut mesh'ler otomatik güncellenir
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) (m.material as THREE.Material).needsUpdate = true;
    });
  }

  /** Pozu uygula (derece cinsinden Euler kayıtları). */
  setPose(pose: Parameters<Rig['applyPose']>[0]): void {
    this.rig.applyPose(pose, true);
  }

  /** Animasyonu bir adım ilerlet. */
  update(dt: number): void {
    this.animator.update(this.rig, dt);
  }

  /* ── instancing için bake ── */

  /**
   * Karakterin ŞU ANKİ pozunu tek BufferGeometry'ye pişirir.
   * Army.ts bunu birkaç animasyon fazı için üretip InstancedMesh'e verir.
   */
  bakeToGeometry(maxTris: number = this.performanceBudget): THREE.BufferGeometry {
    this.rig.root.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
    // Referans kök KEMİK: bake edilen geometri zemin uzayında kalır.
    const refBone = this.rig.joints.get('root') ?? this.group;
    const rootInverse = new THREE.Matrix4().copy(refBone.matrixWorld).invert();
    const pieces: Piece[] = [];
    const m = new THREE.Matrix4();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mesh.updateWorldMatrix(true, false);
      m.multiplyMatrices(rootInverse, mesh.matrixWorld);
      const g = mesh.geometry.clone();
      g.applyMatrix4(m);
      pieces.push({ geometry: g, material: { key: 'bake', color: mat.color.getHex(), metalness: mat.metalness, roughness: mat.roughness, flatShading: true } });
    });
    const merged = mergePieces(pieces, this.mats);
    if (maxTris === undefined || triCount(merged) <= maxTris) return merged;
    const reduced = reduceToBudget(merged, maxTris);
    merged.dispose();
    return reduced;
  }

  /** Statik merged mesh (kalabalık/uzak LOD için). */
  createBakedMesh(maxTris?: number): THREE.Mesh {
    const mesh = new THREE.Mesh(this.bakeToGeometry(maxTris), this.mats.mergedMaterial(`char_${this.faction.id}_${this.lod}`));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Gerçek THREE.Skeleton export (opsiyonel skinning yolu). */
  exportSkeleton(): ReturnType<Rig['exportSkeleton']> {
    return this.rig.exportSkeleton();
  }

  dispose(): void {
    this.unequipAll();
    this.rig.dispose();
    this.mats.dispose();
  }
}

function inlineMat(def: MaterialDef): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    // Birleştirilmiş (merged) parçalar vertex renkli gelir.
    vertexColors: !!(def as MaterialDef & { vertexColors?: boolean }).vertexColors,
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

export function countObject(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) total += triCount(mesh.geometry);
  });
  return Math.round(total);
}

/**
 * Yardımcı: bir Object3D hiyerarşisini (ör. Armory group) tek geometriye
 * pişirir. Normalizasyon: position + normal + color, non-indexed.
 */
export function bakeHierarchy(root: THREE.Object3D, colorFromMaterial = true): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const out: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    mesh.updateWorldMatrix(true, false);
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const g = mesh.geometry.clone();
    g.applyMatrix4(m);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    out.push(normalizeGeometry(g, colorFromMaterial && mat && mat.color ? mat.color.getHex() : 0xffffff));
  });
  if (out.length === 0) return new THREE.BufferGeometry();
  if (out.length === 1) return out[0];
  const merged = mergePieces(out.map((g) => ({ geometry: g })), EMPTY_MATS);
  for (const g of out) g.dispose();
  return merged;
}

const EMPTY_MATS = new MaterialLibrary({});

/** Sırta asılan ekipman için doğru mount anahtarı. */
export function backMountFor(id: ArmoryItemId): string {
  switch (id) {
    case 'recurveBow': return 'backBow';
    case 'vikingShield':
    case 'kiteShield':
    case 'paviseShield':
    case 'cavalryRound': return 'backShield';
    case 'warAxe':
    case 'bardiche':
    case 'flangedMace':
    case 'warHammer':
    case 'morningstar': return 'backAxe';
    default: return 'backSword';
  }
}

export type { ArmoryItemBuild };
