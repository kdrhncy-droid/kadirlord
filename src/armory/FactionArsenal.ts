/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · FactionArsenal.ts
 *  6 Krallık Özel Kılıçlar, Silahlar, Zırhlar, Miğferler ve Savaş Atları
 *  + Kalite (Modifier) Sistemi, Hasar/Hız/Dayanıklılık/Zırh Hesaplayıcıları
 *  + Pazar (Market) Fiyatlandırması ve 3B Prosedürel Geometri Üreticileri
 *
 *  Bu dosya dışarıya (başka bir geliştirme ortamına) doğrudan kopyalanıp
 *  bağlanabilecek şekilde bağımsız ve modüler tasarlanmıştır.
 *
 *  Desteklenen Krallıklar:
 *    · empire   (Kalradya İmparatorluğu — Geç Roma / Bizans Katafrakt & Lejyon)
 *    · vlandia  (Vlandiya Krallığı — Feodal Norman / Frank Şövalye & Arbalet)
 *    · sturgia  (Sturgiya — Nord / Kiev Rus Huskarl, Balta & Druzhinnik)
 *    · khuzait  (Kuzait Hanlığı — Türk-Moğol Bozkır Atlı Okçu & Glaive)
 *    · aserai   (Aseray Sultanlığı — Memlük & Bedevi Şamşır, Cirit & Faris)
 *    · battania (Battanya — Kelt / Yayla Falx, Rhomphaia & Fian Uzun Yayı)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as THREE from 'three';
import {
  DEG,
  LodLevel,
  MaterialLibrary,
  Piece,
  TAU,
  Vec2Tuple,
  Vec3Tuple,
  bendGeometry,
  extrudeOpts,
  jitterGeometry,
  lerp,
  mergePieces,
  profile2,
  shapeFrom,
  shellSweep,
  sweep,
  triCount,
  v2,
  v3,
} from './Core.ts';
import { ArmoryItemId, createArmoryPalette } from './Armory.ts';
import { ArmorPiece, ArmorTier, buildArmorSet, createArmorPalette } from './Armor.ts';
import { CoatColor, Horse, HorseBreed } from './Horse.ts';
import { FactionPalette } from './Faction.ts';
import { FactionAnimationId } from './FactionAnimations.ts';
import {
  HEAD,
  TORSO_DEPTH_SCALE,
  applyEquipmentToRig,
  createWarHorseRig,
  refitArmorToHead,
  type ArmorTier as RigArmorTier,
  type BowParts,
  type CharacterRig,
  type WarHorseRig,
} from '../game/characterRig.ts';
import { SHIELD_REST_POSITION, SHIELD_REST_ROTATION } from '../game/equipmentPose.ts';

/* ═══════════════════════════════════════════════════════════════════════
   1. TEMEL TİPLER VE KALİTE (MODIFIER) SİSTEMİ
   ═══════════════════════════════════════════════════════════════════════ */

export type ArsenalFactionId =
  | 'empire'
  | 'vlandia'
  | 'sturgia'
  | 'khuzait'
  | 'aserai'
  | 'battania';

export const ARSENAL_FACTIONS: {
  id: ArsenalFactionId;
  nameTr: string;
  shortTr: string;
  cultureTr: string;
  accentHex: string;
  secondaryHex: string;
  signatureTr: string;
}[] = [
  {
    id: 'empire',
    nameTr: 'Kalradya İmparatorluğu',
    shortTr: 'İmparatorluk',
    cultureTr: 'Geç Roma / Bizans',
    accentHex: '#a92335',
    secondaryHex: '#e0b558',
    signatureTr: 'Spatha, Paramion, Menavlion, Kontos & Katafrakt Pullu Zırhı',
  },
  {
    id: 'vlandia',
    nameTr: 'Vlandiya Krallığı',
    shortTr: 'Vlandiya',
    cultureTr: 'Feodal Norman / Frank',
    accentHex: '#2f5fb3',
    secondaryHex: '#d9a441',
    signatureTr: 'Şövalye Kılıcı, Çift Elli Greatsword, Voulge, Ağır Kargı & Plaka Zırh',
  },
  {
    id: 'sturgia',
    nameTr: 'Sturgiya Knezliği',
    shortTr: 'Sturgiya',
    cultureTr: 'Nord / Kiev Rus',
    accentHex: '#2c6e49',
    secondaryHex: '#a9b2bb',
    signatureTr: 'Ulfberht Kılıcı, Sakallı Balta, Dane Axe, Sovnya & Huskarl Kalkanı',
  },
  {
    id: 'khuzait',
    nameTr: 'Kuzait Hanlığı',
    shortTr: 'Kuzait',
    cultureTr: 'Türk-Moğol Bozkır',
    accentHex: '#d08a1e',
    secondaryHex: '#e5c46a',
    signatureTr: 'İld Eğri Kılıcı, Han Şamşırı, Uzun Glaive, Kompozit Yay & Bozkır Atı',
  },
  {
    id: 'aserai',
    nameTr: 'Aseray Sultanlığı',
    shortTr: 'Aseray',
    cultureTr: 'Çöl / Memlük Sultanlığı',
    accentHex: '#1d7a72',
    secondaryHex: '#d9b45f',
    signatureTr: 'Kaskara, Altın Şamşır, Hilal Tabarzin, Cirit (Jereed) & Çöl Küheylanı',
  },
  {
    id: 'battania',
    nameTr: 'Battanya Krallığı',
    shortTr: 'Battanya',
    cultureTr: 'Kelt / Yayla Klanları',
    accentHex: '#3f6b32',
    secondaryHex: '#b9863c',
    signatureTr: 'Falx Orak Kılıcı, Rhomphaia, Claymore, Fian Uzun Yayı & Kurt Postlu Zırh',
  },
];

export type ItemQualityId =
  | 'RUSTY'
  | 'WORN'
  | 'STANDARD'
  | 'FINE'
  | 'MASTERWORK'
  | 'LEGENDARY';

export interface ItemQualityModifier {
  id: ItemQualityId;
  prefixTr: string;
  badgeColor: string;
  damageMultiplier: number;
  speedBonus: number;
  durabilityMultiplier: number;
  armorBonus: number;
  horseStatBonus: number;
  weightMultiplier: number;
  priceMultiplier: number;
}

export const ITEM_QUALITY_MODIFIERS: Record<ItemQualityId, ItemQualityModifier> = {
  RUSTY: {
    id: 'RUSTY',
    prefixTr: 'Paslı / Çatlak',
    badgeColor: '#78716c',
    damageMultiplier: 0.84,
    speedBonus: -4,
    durabilityMultiplier: 0.75,
    armorBonus: -4,
    horseStatBonus: -4,
    weightMultiplier: 1.05,
    priceMultiplier: 0.55,
  },
  WORN: {
    id: 'WORN',
    prefixTr: 'Yıpranmış',
    badgeColor: '#a8a29e',
    damageMultiplier: 0.92,
    speedBonus: -2,
    durabilityMultiplier: 0.88,
    armorBonus: -2,
    horseStatBonus: -2,
    weightMultiplier: 1.02,
    priceMultiplier: 0.78,
  },
  STANDARD: {
    id: 'STANDARD',
    prefixTr: 'Standart',
    badgeColor: '#e7e5e4',
    damageMultiplier: 1.0,
    speedBonus: 0,
    durabilityMultiplier: 1.0,
    armorBonus: 0,
    horseStatBonus: 0,
    weightMultiplier: 1.0,
    priceMultiplier: 1.0,
  },
  FINE: {
    id: 'FINE',
    prefixTr: 'Dengeli / Kaliteli',
    badgeColor: '#38bdf8',
    damageMultiplier: 1.08,
    speedBonus: 3,
    durabilityMultiplier: 1.15,
    armorBonus: 3,
    horseStatBonus: 3,
    weightMultiplier: 0.97,
    priceMultiplier: 1.45,
  },
  MASTERWORK: {
    id: 'MASTERWORK',
    prefixTr: 'Usta İşi',
    badgeColor: '#c084fc',
    damageMultiplier: 1.17,
    speedBonus: 5,
    durabilityMultiplier: 1.32,
    armorBonus: 6,
    horseStatBonus: 6,
    weightMultiplier: 0.94,
    priceMultiplier: 2.25,
  },
  LEGENDARY: {
    id: 'LEGENDARY',
    prefixTr: 'Efsanevi (Hükümdar İşi)',
    badgeColor: '#fbbf24',
    damageMultiplier: 1.28,
    speedBonus: 8,
    durabilityMultiplier: 1.55,
    armorBonus: 10,
    horseStatBonus: 9,
    weightMultiplier: 0.9,
    priceMultiplier: 3.6,
  },
};

export const QUALITY_ORDER: ItemQualityId[] = [
  'RUSTY',
  'WORN',
  'STANDARD',
  'FINE',
  'MASTERWORK',
  'LEGENDARY',
];

/* ═══════════════════════════════════════════════════════════════════════
   2. SİLAH, ZIRH VE SAVAŞ ATI VERİ ŞEMALARI
   ═══════════════════════════════════════════════════════════════════════ */

export type ArsenalWeaponKind =
  | 'one_handed_sword'
  | 'curved_sabre'
  | 'two_handed_sword'
  | 'falx_blade'
  | 'one_handed_axe'
  | 'two_handed_axe'
  | 'mace'
  | 'polearm_cleave'
  | 'cavalry_lance'
  | 'bow'
  | 'crossbow'
  | 'javelin'
  | 'shield';

export interface FactionWeaponDef {
  id: string;
  faction: ArsenalFactionId;
  nameTr: string;
  kind: ArsenalWeaponKind;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  twoHanded: boolean;
  /** Kesici hasar (Cut) */
  swingDamage: number;
  swingDamageType: 'CUT' | 'BLUNT' | 'PIERCE';
  /** Saplama hasarı (Thrust) */
  thrustDamage: number;
  thrustDamageType: 'PIERCE' | 'BLUNT' | 'NONE';
  /** Savurma / Çekiş hızı (Bannerlord ölçeği: 70–105) */
  speed: number;
  /** Hakimiyet / Denge (Handling: 65–102) */
  handling: number;
  /** Silah uzunluğu / Erişim (cm: 75–265) */
  reachCm: number;
  /** Dayanıklılık / Kalkan Canı (HP: silahlar için 120–360, kalkanlar için 420–780) */
  durability: number;
  /** Ağırlık (kg) */
  weightKg: number;
  /** Kalkan kırıcı bonus var mı? (Baltalar, Falx) */
  shieldBreaker: boolean;
  /** Koltuklanmış kargı yapılabilir mi? (Süvari kargıları) */
  canCouchLance: boolean;
  /** Temel Pazar Fiyatı (Dinar) */
  basePrice: number;
  /** Standart Armory.ts eşleşmesi (Character.ts uyumu için yedek ID) */
  baseArmoryId: ArmoryItemId;
  /** Önerilen vitrin/savaş animasyonu */
  defaultAnimation: FactionAnimationId;
  /** 3B prosedürel model arketipi */
  visualArchetype:
    | 'spatha'
    | 'paramion'
    | 'thamaskene_spatha'
    | 'menavlion'
    | 'kontos'
    | 'pernach'
    | 'scutum'
    | 'arming_sword'
    | 'bastard_sword'
    | 'royal_greatsword'
    | 'voulge'
    | 'knight_lance'
    | 'crossbow'
    | 'heater_shield'
    | 'ulfberht'
    | 'varsheg_sword'
    | 'bearded_axe'
    | 'dane_axe'
    | 'sovnya'
    | 'huskarl_shield'
    | 'steppe_sabre'
    | 'khan_scimitar'
    | 'glaive'
    | 'steppe_lance'
    | 'composite_bow'
    | 'steppe_shield'
    | 'kaskara'
    | 'sultan_scimitar'
    | 'tabarzin'
    | 'faris_lance'
    | 'jereed'
    | 'mamluke_shield'
    | 'highland_sword'
    | 'claymore'
    | 'falx'
    | 'rhomphaia'
    | 'fian_longbow'
    | 'celtic_shield';
  loreTr: string;
}

export interface FactionArmorDef {
  id: string;
  faction: ArsenalFactionId;
  nameTr: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  armorClass: ArmorTier;
  helmStyle: 'greatHelm' | 'spangen' | 'kettle' | 'none';
  surcoat: boolean;
  /** Baş zırhı (Head Armor) */
  headArmor: number;
  /** Gövde zırhı (Body Armor) */
  bodyArmor: number;
  /** Omuz / Kol zırhı (Shoulder & Arm Armor) */
  armArmor: number;
  /** Bacak zırhı (Leg Armor) */
  legArmor: number;
  /** Zırh bütünü dayanıklılığı */
  durability: number;
  /** Toplam ağırlık (kg) */
  weightKg: number;
  /** Temel Pazar Fiyatı (Dinar) */
  basePrice: number;
  /** Kültürel özel 3B eklenti (miğfer sorgucu, yüz maskesi, kürk pelerin, sarık vb.) */
  culturalCrest:
    | 'imperial_plume_mask'
    | 'imperial_legion_crest'
    | 'vlandian_crowned_helm'
    | 'vlandian_heraldic_pauldron'
    | 'sturgian_fur_mantle'
    | 'sturgian_gjermundbu'
    | 'khuzait_horsehair_tail'
    | 'khuzait_mirror_disc'
    | 'aserai_turban_wrap'
    | 'aserai_golden_collar'
    | 'battanian_wolf_pelt'
    | 'battanian_bronze_torc'
    | 'none';
  loreTr: string;
}

export interface FactionHorseDef {
  id: string;
  faction: ArsenalFactionId;
  nameTr: string;
  tier: 2 | 3 | 4 | 5 | 6;
  breed: HorseBreed;
  coat: CoatColor;
  barding: boolean;
  caparison: boolean;
  /** Dörtnala Hız (Speed: 38–68) */
  speed: number;
  /** Manevra kabiliyeti (Maneuver: 40–72) */
  maneuver: number;
  /** Hücum çarpma hasarı (Charge Damage: 12–46) */
  chargeDamage: number;
  /** At Canı / Dayanıklılığı (Hit Points: 140–340) */
  hitPoints: number;
  /** At Zırhı (Barding Armor: 0–68) */
  bardingArmor: number;
  /** Ağırlık (koşum/zırh yükü kg) */
  harnessWeightKg: number;
  /** Temel Pazar Fiyatı (Dinar) */
  basePrice: number;
  /** Boyut ölçeği */
  scale: number;
  loreTr: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   3. 6 KRALLIK SİLAH KATALOĞU (38 ÖZEL SİLAH & KALKAN)
   ═══════════════════════════════════════════════════════════════════════ */

export const FACTION_WEAPONS: FactionWeaponDef[] = [
  // ─────────────────── 1. KALRADYA İMPARATORLUĞU (EMPIRE) ───────────────────
  {
    id: 'emp_spatha_t3',
    faction: 'empire',
    nameTr: 'İmparatorluk Piyade Spathası',
    kind: 'one_handed_sword',
    tier: 3,
    twoHanded: false,
    swingDamage: 68,
    swingDamageType: 'CUT',
    thrustDamage: 44,
    thrustDamageType: 'PIERCE',
    speed: 95,
    handling: 92,
    reachCm: 96,
    durability: 190,
    weightKg: 1.35,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 340,
    baseArmoryId: 'gladius',
    defaultAnimation: 'attackSword',
    visualArchetype: 'spatha',
    loreTr: 'Nizami İmparatorluk piyadelerinin kalkan duvarı arkasından hem kesici hem delici kullandığı düz namlulu kılıç.',
  },
  {
    id: 'emp_paramion_t4',
    faction: 'empire',
    nameTr: 'İmparatorluk Paramion Süvari Kılıcı',
    kind: 'curved_sabre',
    tier: 4,
    twoHanded: false,
    swingDamage: 79,
    swingDamageType: 'CUT',
    thrustDamage: 36,
    thrustDamageType: 'PIERCE',
    speed: 97,
    handling: 94,
    reachCm: 94,
    durability: 215,
    weightKg: 1.3,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 540,
    baseArmoryId: 'scimitar',
    defaultAnimation: 'attackSabreSlash',
    visualArchetype: 'paramion',
    loreTr: 'Doğu sınırındaki Bizans-tipi hafif eğri namlusuyla at sırtında yüksek kesici hasar veren subay kılıcı.',
  },
  {
    id: 'emp_thamaskene_spatha_t6',
    faction: 'empire',
    nameTr: 'Altın Kartallı Thamaskene Katafrakt Spathası',
    kind: 'one_handed_sword',
    tier: 6,
    twoHanded: false,
    swingDamage: 92,
    swingDamageType: 'CUT',
    thrustDamage: 56,
    thrustDamageType: 'PIERCE',
    speed: 99,
    handling: 96,
    reachCm: 102,
    durability: 295,
    weightKg: 1.25,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 1480,
    baseArmoryId: 'gladius',
    defaultAnimation: 'weaponFlourish',
    visualArchetype: 'thamaskene_spatha',
    loreTr: 'Hareli Thamaskene çeliğinden dövülmüş, altın kartal balçaklı İmparatorluk Arkhon ve Elit Katafrakt kılıcı.',
  },
  {
    id: 'emp_menavlion_t5',
    faction: 'empire',
    nameTr: 'İmparatorluk Ağır Menavlion Gönderlisi',
    kind: 'polearm_cleave',
    tier: 5,
    twoHanded: true,
    swingDamage: 126,
    swingDamageType: 'CUT',
    thrustDamage: 74,
    thrustDamageType: 'PIERCE',
    speed: 82,
    handling: 76,
    reachCm: 195,
    durability: 260,
    weightKg: 2.6,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 890,
    baseArmoryId: 'halberd',
    defaultAnimation: 'attackPolearmSweep',
    visualArchetype: 'menavlion',
    loreTr: 'Kalın meşe gönder ucuna takılmış uzun çift ağızlı ağır namlu; düşman süvarilerini tek vuruşta eyerden düşürür.',
  },
  {
    id: 'emp_kontos_t6',
    faction: 'empire',
    nameTr: 'Katafrakt Kontos Ağır Süvari Kargısı',
    kind: 'cavalry_lance',
    tier: 6,
    twoHanded: false,
    swingDamage: 0,
    swingDamageType: 'BLUNT',
    thrustDamage: 98,
    thrustDamageType: 'PIERCE',
    speed: 78,
    handling: 72,
    reachCm: 255,
    durability: 270,
    weightKg: 2.9,
    shieldBreaker: false,
    canCouchLance: true,
    basePrice: 1120,
    baseArmoryId: 'lance',
    defaultAnimation: 'attackCouchedLance',
    visualArchetype: 'kontos',
    loreTr: 'Zırhlı İmparatorluk Katafraktlarının hücumda düşman saflarını şişlediği uzun ve esnemez çelik uçlu kargı.',
  },
  {
    id: 'emp_pernach_mace_t5',
    faction: 'empire',
    nameTr: 'İmparatorluk Altın Kanatlı Katafrakt Gürzü',
    kind: 'mace',
    tier: 5,
    twoHanded: false,
    swingDamage: 68,
    swingDamageType: 'BLUNT',
    thrustDamage: 32,
    thrustDamageType: 'BLUNT',
    speed: 91,
    handling: 89,
    reachCm: 78,
    durability: 320,
    weightKg: 1.85,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 760,
    baseArmoryId: 'flangedMace',
    defaultAnimation: 'attackMaceCrush',
    visualArchetype: 'pernach',
    loreTr: 'Ağır plaka ve pullu zırh giyen düşmanları bayıltıp esir almak için tasarlanmış 6 kanatlı bronz-çelik topuz.',
  },
  {
    id: 'emp_scutum_shield_t5',
    faction: 'empire',
    nameTr: 'Lejyoner Altın Kartallı Scutum Kalkanı',
    kind: 'shield',
    tier: 5,
    twoHanded: false,
    swingDamage: 24,
    swingDamageType: 'BLUNT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 86,
    handling: 84,
    reachCm: 118,
    durability: 690,
    weightKg: 5.1,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 680,
    baseArmoryId: 'paviseShield',
    defaultAnimation: 'shieldWallBrace',
    visualArchetype: 'scutum',
    loreTr: 'Testudo ve kalkan duvarı diziliminde ok yağmurunu tamamen kesen kavisli dikdörtgen lejyon kalkanı.',
  },

  // ─────────────────── 2. VLANDİYA KRALLIĞI (VLANDIA) ───────────────────
  {
    id: 'vla_arming_sword_t3',
    faction: 'vlandia',
    nameTr: 'Vlandiya Şövalye Arming Kılıcı',
    kind: 'one_handed_sword',
    tier: 3,
    twoHanded: false,
    swingDamage: 72,
    swingDamageType: 'CUT',
    thrustDamage: 46,
    thrustDamageType: 'PIERCE',
    speed: 93,
    handling: 90,
    reachCm: 98,
    durability: 205,
    weightKg: 1.4,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 380,
    baseArmoryId: 'gladius',
    defaultAnimation: 'attackSword',
    visualArchetype: 'arming_sword',
    loreTr: 'Haç biçimli çelik siperi ve tekerlek pommeliyle Vlandiya yaverlerinin ve çavuşlarının standart kılıcı.',
  },
  {
    id: 'vla_bastard_longsword_t5',
    faction: 'vlandia',
    nameTr: 'Vlandiya Şövalye Bastard Uzun Kılıcı',
    kind: 'two_handed_sword',
    tier: 5,
    twoHanded: true,
    swingDamage: 102,
    swingDamageType: 'CUT',
    thrustDamage: 66,
    thrustDamageType: 'PIERCE',
    speed: 90,
    handling: 86,
    reachCm: 116,
    durability: 265,
    weightKg: 1.85,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 920,
    baseArmoryId: 'greatsword',
    defaultAnimation: 'attackTwoHandedCleave',
    visualArchetype: 'bastard_sword',
    loreTr: 'Hem at sırtında tek elle hem yaya savaşta çift elle savrulabilen, zırh boşluklarını delen uzun şövalye kılıcı.',
  },
  {
    id: 'vla_royal_greatsword_t6',
    faction: 'vlandia',
    nameTr: 'Dey Meroc Kraliyet Çift Elli Şövalye Kılıcı',
    kind: 'two_handed_sword',
    tier: 6,
    twoHanded: true,
    swingDamage: 124,
    swingDamageType: 'CUT',
    thrustDamage: 74,
    thrustDamageType: 'PIERCE',
    speed: 86,
    handling: 82,
    reachCm: 132,
    durability: 310,
    weightKg: 2.35,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1620,
    baseArmoryId: 'greatsword',
    defaultAnimation: 'attackTwoHandedCleave',
    visualArchetype: 'royal_greatsword',
    loreTr: 'Altın aslan işlemeli ricasso siperi ve derin kan oluğuyla Vlandiya Baronlarının kuşatma yarma kılıcı.',
  },
  {
    id: 'vla_voulge_t5',
    faction: 'vlandia',
    nameTr: 'Vlandiya Ağır Voulge Satır-Kargısı',
    kind: 'polearm_cleave',
    tier: 5,
    twoHanded: true,
    swingDamage: 138,
    swingDamageType: 'CUT',
    thrustDamage: 52,
    thrustDamageType: 'PIERCE',
    speed: 77,
    handling: 73,
    reachCm: 192,
    durability: 275,
    weightKg: 2.95,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 940,
    baseArmoryId: 'billhook',
    defaultAnimation: 'attackPolearmSweep',
    visualArchetype: 'voulge',
    loreTr: 'Vlandiya Voulger piyadelerinin kalkanları ve at zırhlarını ikiye biçtiği devasa satır başlıklı gönderli silah.',
  },
  {
    id: 'vla_heavy_knight_lance_t6',
    faction: 'vlandia',
    nameTr: 'Sancak Şövalyesi Koltuklu Ağır Kargısı',
    kind: 'cavalry_lance',
    tier: 6,
    twoHanded: false,
    swingDamage: 0,
    swingDamageType: 'BLUNT',
    thrustDamage: 108,
    thrustDamageType: 'PIERCE',
    speed: 75,
    handling: 70,
    reachCm: 264,
    durability: 285,
    weightKg: 3.2,
    shieldBreaker: false,
    canCouchLance: true,
    basePrice: 1290,
    baseArmoryId: 'lance',
    defaultAnimation: 'attackCouchedLance',
    visualArchetype: 'knight_lance',
    loreTr: 'El koruyucu çelik vamplate konisi ve uçuşan Vlandiya flamasıyla koltuklanmış hücumların en yıkıcı kargısı.',
  },
  {
    id: 'vla_heavy_crossbow_t5',
    faction: 'vlandia',
    nameTr: 'Vlandiya Çıkrıklı Çelik Ağır Arbaleti',
    kind: 'crossbow',
    tier: 5,
    twoHanded: true,
    swingDamage: 0,
    swingDamageType: 'BLUNT',
    thrustDamage: 96,
    thrustDamageType: 'PIERCE',
    speed: 72,
    handling: 78,
    reachCm: 92,
    durability: 240,
    weightKg: 3.4,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 1050,
    baseArmoryId: 'recurveBow',
    defaultAnimation: 'crossbowAimFire',
    visualArchetype: 'crossbow',
    loreTr: 'Kalın çelik yayı ve çıkrık mekanizması sayesinde en ağır katafrakt zırhlarını bile uzaktan delen Vlandiya arbaleti.',
  },
  {
    id: 'vla_heater_kite_shield_t5',
    faction: 'vlandia',
    nameTr: 'Vlandiya Asil Şövalye Damla Kalkanı',
    kind: 'shield',
    tier: 5,
    twoHanded: false,
    swingDamage: 22,
    swingDamageType: 'BLUNT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 88,
    handling: 86,
    reachCm: 112,
    durability: 640,
    weightKg: 4.1,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 620,
    baseArmoryId: 'kiteShield',
    defaultAnimation: 'block',
    visualArchetype: 'heater_shield',
    loreTr: 'Üzerinde Vlandiya haçı ve altın perçinler bulunan, hem eyerde hem yaya kalkan duvarında kullanılan damla kalkan.',
  },

  // ─────────────────── 3. STURGİYA KNEZLİĞİ (STURGIA) ───────────────────
  {
    id: 'stu_nord_broadsword_t4',
    faction: 'sturgia',
    nameTr: 'Sturgiya Ulfberht Kuzey Kılıcı',
    kind: 'one_handed_sword',
    tier: 4,
    twoHanded: false,
    swingDamage: 82,
    swingDamageType: 'CUT',
    thrustDamage: 42,
    thrustDamageType: 'PIERCE',
    speed: 92,
    handling: 89,
    reachCm: 97,
    durability: 235,
    weightKg: 1.5,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 590,
    baseArmoryId: 'gladius',
    defaultAnimation: 'attackSword',
    visualArchetype: 'ulfberht',
    loreTr: 'Geniş kan oluklu namlusu ve üç loblu Viking pommeliyle dondurucu kuzey savaşlarının efsanevi kılıcı.',
  },
  {
    id: 'stu_varsheg_greatsword_t6',
    faction: 'sturgia',
    nameTr: 'Varşeg Knyaz Muhafızı Çift Elli Kuzey Kılıcı',
    kind: 'two_handed_sword',
    tier: 6,
    twoHanded: true,
    swingDamage: 120,
    swingDamageType: 'CUT',
    thrustDamage: 64,
    thrustDamageType: 'PIERCE',
    speed: 88,
    handling: 84,
    reachCm: 126,
    durability: 300,
    weightKg: 2.25,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1490,
    baseArmoryId: 'greatsword',
    defaultAnimation: 'attackTwoHandedCleave',
    visualArchetype: 'varsheg_sword',
    loreTr: 'Kürk sarılı uzun kabzası ve rün kazımalı ağır çeliğiyle Sturgiya Boyarlarının kullandığı çift elli yarma kılıcı.',
  },
  {
    id: 'stu_bearded_axe_t4',
    faction: 'sturgia',
    nameTr: 'Sturgiya Sakallı Kalkan Baltası',
    kind: 'one_handed_axe',
    tier: 4,
    twoHanded: false,
    swingDamage: 86,
    swingDamageType: 'CUT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 91,
    handling: 88,
    reachCm: 86,
    durability: 250,
    weightKg: 1.65,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 520,
    baseArmoryId: 'warAxe',
    defaultAnimation: 'attackAxe',
    visualArchetype: 'bearded_axe',
    loreTr: 'Aşağı uzanan çengelli "sakal" ağzı sayesinde düşman kalkanını aşağı çekip parçalayan kuzey savaş baltası.',
  },
  {
    id: 'stu_dane_great_axe_t6',
    faction: 'sturgia',
    nameTr: 'Sturgiya Kahraman Yarma Baltası (Ağır Dane Axe)',
    kind: 'two_handed_axe',
    tier: 6,
    twoHanded: true,
    swingDamage: 144,
    swingDamageType: 'CUT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 81,
    handling: 76,
    reachCm: 148,
    durability: 315,
    weightKg: 2.75,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1580,
    baseArmoryId: 'bardiche',
    defaultAnimation: 'attackTwoHandedCleave',
    visualArchetype: 'dane_axe',
    loreTr: 'Kahraman Hat Kırıcıların (Heroic Line Breaker) tek savuruşta hem kalkanı hem arkasındaki askeri biçtiği hilal balta.',
  },
  {
    id: 'stu_sovnya_polearm_t5',
    faction: 'sturgia',
    nameTr: 'Sturgiya Sovnya Gönderli Kılıç-Bıçağı',
    kind: 'polearm_cleave',
    tier: 5,
    twoHanded: true,
    swingDamage: 122,
    swingDamageType: 'CUT',
    thrustDamage: 68,
    thrustDamageType: 'PIERCE',
    speed: 85,
    handling: 80,
    reachCm: 186,
    durability: 255,
    weightKg: 2.5,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 870,
    baseArmoryId: 'billhook',
    defaultAnimation: 'attackPolearmSweep',
    visualArchetype: 'sovnya',
    loreTr: 'Rus-Kuzey geleneğinde uzun dişbudak sopası ucuna perçinlenmiş hafif kavisli ağır pala namlusu.',
  },
  {
    id: 'stu_huskarl_round_shield_t6',
    faction: 'sturgia',
    nameTr: 'Huskarl Demir Çemberli Ağır Yuvarlak Kalkanı',
    kind: 'shield',
    tier: 6,
    twoHanded: false,
    swingDamage: 26,
    swingDamageType: 'BLUNT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 87,
    handling: 85,
    reachCm: 108,
    durability: 760,
    weightKg: 4.7,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 820,
    baseArmoryId: 'vikingShield',
    defaultAnimation: 'shieldWallBrace',
    visualArchetype: 'huskarl_shield',
    loreTr: 'Kalın ıhlamur tahtası üzerine dövme demir çember ve kubbeli göbek (umbo) çakılmış geçilmez Huskarl kalkanı.',
  },

  // ─────────────────── 4. KUZAİT HANLIĞI (KHUZAIT) ───────────────────
  {
    id: 'khu_steppe_ild_sabre_t3',
    faction: 'khuzait',
    nameTr: 'Kuzait Bozkır İld Eğri Kılıcı',
    kind: 'curved_sabre',
    tier: 3,
    twoHanded: false,
    swingDamage: 74,
    swingDamageType: 'CUT',
    thrustDamage: 34,
    thrustDamageType: 'PIERCE',
    speed: 98,
    handling: 95,
    reachCm: 95,
    durability: 195,
    weightKg: 1.2,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 360,
    baseArmoryId: 'scimitar',
    defaultAnimation: 'attackSabreSlash',
    visualArchetype: 'steppe_sabre',
    loreTr: 'Dörtnala giden bozkır atı sırtında bileği yormadan kesici vuruşlar yapmak için üretilmiş hafif eğri kılıç.',
  },
  {
    id: 'khu_khan_scimitar_t6',
    faction: 'khuzait',
    nameTr: 'Altın Kakmalı Han Muhafızı Şamşırı',
    kind: 'curved_sabre',
    tier: 6,
    twoHanded: false,
    swingDamage: 96,
    swingDamageType: 'CUT',
    thrustDamage: 44,
    thrustDamageType: 'PIERCE',
    speed: 102,
    handling: 98,
    reachCm: 101,
    durability: 280,
    weightKg: 1.25,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 1520,
    baseArmoryId: 'scimitar',
    defaultAnimation: 'attackSabreSlash',
    visualArchetype: 'khan_scimitar',
    loreTr: 'Monchug Han ve Noyanlarının kuşandığı, yeşim taşı ve altın kakmalı jilet keskinliğinde bozkır şamşırı.',
  },
  {
    id: 'khu_long_glaive_t6',
    faction: 'khuzait',
    nameTr: 'Kuzait Han Muhafızı Uzun Glaive Kargı-Kılıcı',
    kind: 'polearm_cleave',
    tier: 6,
    twoHanded: true,
    swingDamage: 146,
    swingDamageType: 'CUT',
    thrustDamage: 68,
    thrustDamageType: 'PIERCE',
    speed: 86,
    handling: 82,
    reachCm: 208,
    durability: 290,
    weightKg: 2.55,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1680,
    baseArmoryId: 'halberd',
    defaultAnimation: 'attackPolearmSweep',
    visualArchetype: 'glaive',
    loreTr: 'Kuzait Han Muhafızlarının (Khan’s Guard) hem at üstünde hem yaya olarak düşmanlarını biçtiği efsanevi gönderli kılıç.',
  },
  {
    id: 'khu_steppe_lance_t4',
    faction: 'khuzait',
    nameTr: 'Kuzait At Kuyruklu Tug Süvari Kargısı',
    kind: 'cavalry_lance',
    tier: 4,
    twoHanded: false,
    swingDamage: 0,
    swingDamageType: 'BLUNT',
    thrustDamage: 84,
    thrustDamageType: 'PIERCE',
    speed: 84,
    handling: 80,
    reachCm: 232,
    durability: 225,
    weightKg: 2.3,
    shieldBreaker: false,
    canCouchLance: true,
    basePrice: 610,
    baseArmoryId: 'lance',
    defaultAnimation: 'attackCouchedLance',
    visualArchetype: 'steppe_lance',
    loreTr: 'Ucu altında dalgalanan at kuyruğu tuğuyla Kuzait Kargıcılarının hızlı baskınlarda kullandığı hafif kargı.',
  },
  {
    id: 'khu_horn_composite_bow_t6',
    faction: 'khuzait',
    nameTr: 'Kuzait Boynuz Lamine Han Kompozit Yayı',
    kind: 'bow',
    tier: 6,
    twoHanded: true,
    swingDamage: 0,
    swingDamageType: 'BLUNT',
    thrustDamage: 86,
    thrustDamageType: 'PIERCE',
    speed: 96,
    handling: 95,
    reachCm: 112,
    durability: 260,
    weightKg: 1.05,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 1450,
    baseArmoryId: 'recurveBow',
    defaultAnimation: 'shootBow',
    visualArchetype: 'composite_bow',
    loreTr: 'Su büfesi boynuzu, akçaağaç ve aşil sinirinin yıllarca preslenmesiyle üretilen, at sırtında en ölümcül refleks yay.',
  },
  {
    id: 'khu_cavalry_round_shield_t4',
    faction: 'khuzait',
    nameTr: 'Kuzait Bronz Göbekli Süvari Kalkanı',
    kind: 'shield',
    tier: 4,
    twoHanded: false,
    swingDamage: 18,
    swingDamageType: 'BLUNT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 94,
    handling: 92,
    reachCm: 88,
    durability: 490,
    weightKg: 2.8,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 440,
    baseArmoryId: 'cavalryRound',
    defaultAnimation: 'block',
    visualArchetype: 'steppe_shield',
    loreTr: 'Yay kullanırken bile sol kola ağırlık yapmayan, güneş motifli bronz göbekli çevik bozkır kalkanı.',
  },

  // ─────────────────── 5. ASERAY SULTANLIĞI (ASERAI) ───────────────────
  {
    id: 'ase_kaskara_sword_t4',
    faction: 'aserai',
    nameTr: 'Aseray Çift Ağızlı Kaskara Kılıcı',
    kind: 'one_handed_sword',
    tier: 4,
    twoHanded: false,
    swingDamage: 78,
    swingDamageType: 'CUT',
    thrustDamage: 52,
    thrustDamageType: 'PIERCE',
    speed: 96,
    handling: 94,
    reachCm: 100,
    durability: 225,
    weightKg: 1.3,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 560,
    baseArmoryId: 'gladius',
    defaultAnimation: 'attackSword',
    visualArchetype: 'kaskara',
    loreTr: 'Geniş düz namlusu ve altın işlemeli düz siperiyle Güney Çölü kervan muhafızlarının ve emirlerinin zarif kılıcı.',
  },
  {
    id: 'ase_golden_scimitar_t6',
    faction: 'aserai',
    nameTr: 'Nahasawi Altın Kakmalı Sultan Şamşırı',
    kind: 'curved_sabre',
    tier: 6,
    twoHanded: false,
    swingDamage: 98,
    swingDamageType: 'CUT',
    thrustDamage: 42,
    thrustDamageType: 'PIERCE',
    speed: 103,
    handling: 99,
    reachCm: 99,
    durability: 285,
    weightKg: 1.2,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 1590,
    baseArmoryId: 'scimitar',
    defaultAnimation: 'attackSabreSlash',
    visualArchetype: 'sultan_scimitar',
    loreTr: 'K부ş (Quyaz) ve Husn Fulq demircilerinin cevher çeliğinden dövdüğü, altın hat işlemeli efsanevi Aseray şamşırı.',
  },
  {
    id: 'ase_mamluke_tabarzin_t5',
    faction: 'aserai',
    nameTr: 'Memlük Saray Muhafızı İki Elli Hilal Tabarzini',
    kind: 'two_handed_axe',
    tier: 5,
    twoHanded: true,
    swingDamage: 134,
    swingDamageType: 'CUT',
    thrustDamage: 48,
    thrustDamageType: 'PIERCE',
    speed: 85,
    handling: 82,
    reachCm: 142,
    durability: 295,
    weightKg: 2.45,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1180,
    baseArmoryId: 'bardiche',
    defaultAnimation: 'attackTwoHandedCleave',
    visualArchetype: 'tabarzin',
    loreTr: 'Aseray Saray Muhafızlarının (Palace Guard) pirinç kakmalı çift hilal ağzıyla kalkanları двух parçaya ayırdığı balta.',
  },
  {
    id: 'ase_faris_lance_t5',
    faction: 'aserai',
    nameTr: 'Aseray Faris Bambu Gövdeli Süvari Kargısı',
    kind: 'cavalry_lance',
    tier: 5,
    twoHanded: false,
    swingDamage: 0,
    swingDamageType: 'BLUNT',
    thrustDamage: 92,
    thrustDamageType: 'PIERCE',
    speed: 88,
    handling: 86,
    reachCm: 242,
    durability: 245,
    weightKg: 2.15,
    shieldBreaker: false,
    canCouchLance: true,
    basePrice: 890,
    baseArmoryId: 'lance',
    defaultAnimation: 'attackCouchedLance',
    visualArchetype: 'faris_lance',
    loreTr: 'Hafif ama kırılmaz bambu gövdesi ve yaprak biçimli Şam çeliği ucuyla Aseray Vanguard Faris süvarilerinin kargısı.',
  },
  {
    id: 'ase_jereed_quiver_t5',
    faction: 'aserai',
    nameTr: 'Aseray Altın Bilezikli Cirit (Jereed) Seti',
    kind: 'javelin',
    tier: 5,
    twoHanded: false,
    swingDamage: 54,
    swingDamageType: 'PIERCE',
    thrustDamage: 118,
    thrustDamageType: 'PIERCE',
    speed: 94,
    handling: 92,
    reachCm: 135,
    durability: 210,
    weightKg: 2.0,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 840,
    baseArmoryId: 'lance',
    defaultAnimation: 'javelinThrow',
    visualArchetype: 'jereed',
    loreTr: 'Dörtnala hücum öncesi fırlatıldığında kalkanı delip arkasındaki biniciyi deviren ağır çelik uçlu çöl ciriti.',
  },
  {
    id: 'ase_mamluke_shield_t5',
    faction: 'aserai',
    nameTr: 'Memlük Sekiz Köşeli Yıldızlı Kalkanı',
    kind: 'shield',
    tier: 5,
    twoHanded: false,
    swingDamage: 20,
    swingDamageType: 'BLUNT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 92,
    handling: 90,
    reachCm: 96,
    durability: 580,
    weightKg: 3.3,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 590,
    baseArmoryId: 'cavalryRound',
    defaultAnimation: 'block',
    visualArchetype: 'mamluke_shield',
    loreTr: 'Turkuaz zemin üzerine sekiz köşeli altın Aseray yıldızı işlenmiş, hem ok hem kılıç darbelerini saptıran çelik kalkan.',
  },

  // ─────────────────── 6. BATTANYA KRALLIĞI (BATTANIA) ───────────────────
  {
    id: 'bat_highland_broadsword_t4',
    faction: 'battania',
    nameTr: 'Battanya Yayla Kelt Geniş Kılıcı',
    kind: 'one_handed_sword',
    tier: 4,
    twoHanded: false,
    swingDamage: 80,
    swingDamageType: 'CUT',
    thrustDamage: 45,
    thrustDamageType: 'PIERCE',
    speed: 94,
    handling: 91,
    reachCm: 99,
    durability: 220,
    weightKg: 1.45,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 530,
    baseArmoryId: 'gladius',
    defaultAnimation: 'attackSword',
    visualArchetype: 'highland_sword',
    loreTr: 'Bronz Kelt düğümü (knotwork) balçaklı, sisli Uthelaim yaylalarının klan savaşçıları için dövülmüş geniş kılıç.',
  },
  {
    id: 'bat_claymore_t6',
    faction: 'battania',
    nameTr: 'Marunath Kraliyet Claymore Çift Elli Kılıcı',
    kind: 'two_handed_sword',
    tier: 6,
    twoHanded: true,
    swingDamage: 128,
    swingDamageType: 'CUT',
    thrustDamage: 70,
    thrustDamageType: 'PIERCE',
    speed: 89,
    handling: 85,
    reachCm: 134,
    durability: 305,
    weightKg: 2.3,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1560,
    baseArmoryId: 'greatsword',
    defaultAnimation: 'attackTwoHandedCleave',
    visualArchetype: 'claymore',
    loreTr: 'İleri doğru V açısıyla uzanan yonca uçlu bronz-çelik siperiyle Battanya Fian Şampiyonlarının yakın dövüş kılıcı.',
  },
  {
    id: 'bat_falx_t5',
    faction: 'battania',
    nameTr: 'Battanya Yaban Falx İki Elli Orak Kılıcı',
    kind: 'falx_blade',
    tier: 5,
    twoHanded: true,
    swingDamage: 136,
    swingDamageType: 'CUT',
    thrustDamage: 38,
    thrustDamageType: 'PIERCE',
    speed: 87,
    handling: 81,
    reachCm: 124,
    durability: 270,
    weightKg: 2.2,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1120,
    baseArmoryId: 'bardiche',
    defaultAnimation: 'attackTwoHandedCleave',
    visualArchetype: 'falx',
    loreTr: 'İçe doğru kavisli keskin ağzı bütün darbe enerjisini tek noktaya toplar; İmparatorluk kalkanlarını ve miğferlerini yarar.',
  },
  {
    id: 'bat_rhomphaia_t6',
    faction: 'battania',
    nameTr: 'Battanya Uzun Rhomphaia Biçici Kargı-Orağı',
    kind: 'polearm_cleave',
    tier: 6,
    twoHanded: true,
    swingDamage: 148,
    swingDamageType: 'CUT',
    thrustDamage: 54,
    thrustDamageType: 'PIERCE',
    speed: 83,
    handling: 78,
    reachCm: 198,
    durability: 280,
    weightKg: 2.65,
    shieldBreaker: true,
    canCouchLance: false,
    basePrice: 1640,
    baseArmoryId: 'billhook',
    defaultAnimation: 'attackPolearmSweep',
    visualArchetype: 'rhomphaia',
    loreTr: 'Uzun dişbudak sap ucundaki devasa orak namlusuyla Caladog ve Battanya Orakçılarının (Reaper) en korkulan silahı.',
  },
  {
    id: 'bat_fian_longbow_t6',
    faction: 'battania',
    nameTr: 'Battanya Fian Şampiyon Porsuk Uzun Yayı',
    kind: 'bow',
    tier: 6,
    twoHanded: true,
    swingDamage: 0,
    swingDamageType: 'BLUNT',
    thrustDamage: 94,
    thrustDamageType: 'PIERCE',
    speed: 91,
    handling: 92,
    reachCm: 176,
    durability: 270,
    weightKg: 1.35,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 1580,
    baseArmoryId: 'recurveBow',
    defaultAnimation: 'shootBow',
    visualArchetype: 'fian_longbow',
    loreTr: 'Yüksek yayla porsuk ağacından (yew) tek parça yontulmuş, Kalradya’nın en yüksek menzil ve deliş gücüne sahip uzun yayı.',
  },
  {
    id: 'bat_celtic_oval_shield_t4',
    faction: 'battania',
    nameTr: 'Battanya Bronz Sarmallı Kelt Oval Kalkanı',
    kind: 'shield',
    tier: 4,
    twoHanded: false,
    swingDamage: 21,
    swingDamageType: 'BLUNT',
    thrustDamage: 0,
    thrustDamageType: 'NONE',
    speed: 90,
    handling: 88,
    reachCm: 104,
    durability: 540,
    weightKg: 3.6,
    shieldBreaker: false,
    canCouchLance: false,
    basePrice: 460,
    baseArmoryId: 'vikingShield',
    defaultAnimation: 'block',
    visualArchetype: 'celtic_shield',
    loreTr: 'Meşe gövde üzerine yeşil boya ve bronz Triskelion sarmalı işlenmiş çevik orman kalkanı.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   4. 6 KRALLIK ZIRH SETLERİ KATALOĞU (18 ZIRH SETİ: T2, T4, T6)
   ═══════════════════════════════════════════════════════════════════════ */

export const FACTION_ARMORS: FactionArmorDef[] = [
  // ── İMPARATORLUK (EMPIRE) ──
  {
    id: 'emp_armor_vigla_t2',
    faction: 'empire',
    nameTr: 'İmparatorluk Vigla Dolgulu Tunik & Deri Yelek',
    tier: 2,
    armorClass: 'light',
    helmStyle: 'kettle',
    surcoat: true,
    headArmor: 18,
    bodyArmor: 24,
    armArmor: 10,
    legArmor: 12,
    durability: 220,
    weightKg: 5.4,
    basePrice: 320,
    culturalCrest: 'none',
    loreTr: 'Ergeneon moru yün tunik üzerine dikilmiş kalın keten ve sertleştirilmiş deri şeritlerinden oluşan acemi/okçu zırhı.',
  },
  {
    id: 'emp_armor_legionary_t4',
    faction: 'empire',
    nameTr: 'İmparatorluk Lejyoner Pullu Lorica & Sorguçlu Miğfer',
    tier: 4,
    armorClass: 'medium',
    helmStyle: 'spangen',
    surcoat: true,
    headArmor: 38,
    bodyArmor: 46,
    armArmor: 20,
    legArmor: 22,
    durability: 410,
    weightKg: 10.6,
    basePrice: 980,
    culturalCrest: 'imperial_legion_crest',
    loreTr: 'Örme zincir üzerine dizilmiş çelik pullar (lorica squamata) ve bordo fırça sorguçlu lejyon miğferi.',
  },
  {
    id: 'emp_armor_cataphract_t6',
    faction: 'empire',
    nameTr: 'İmparatorluk Elit Katafrakt Lamellar Zırhı & Yüz Maskeli Miğfer',
    tier: 6,
    armorClass: 'heavy',
    helmStyle: 'greatHelm',
    surcoat: true,
    headArmor: 54,
    bodyArmor: 68,
    armArmor: 32,
    legArmor: 30,
    durability: 640,
    weightKg: 15.8,
    basePrice: 2450,
    culturalCrest: 'imperial_plume_mask',
    loreTr: 'Altın bronz yüz maskeli miğferi, omuz kalkanları ve çift katmanlı çelik lamellar göğüslüğüyle yürüyen kale.',
  },

  // ── VLANDİYA (VLANDIA) ──
  {
    id: 'vla_armor_levy_t2',
    faction: 'vlandia',
    nameTr: 'Vlandiya Akabinde Gambeson & Şapkalı Demir Kep',
    tier: 2,
    armorClass: 'light',
    helmStyle: 'kettle',
    surcoat: true,
    headArmor: 20,
    bodyArmor: 22,
    armArmor: 9,
    legArmor: 11,
    durability: 210,
    weightKg: 5.2,
    basePrice: 310,
    culturalCrest: 'none',
    loreTr: 'Arbaletçileri ve mızraklı milisleri ok yağmurundan koruyan geniş siperli demir şapka (Kettle Hat) ve kapitone ceket.',
  },
  {
    id: 'vla_armor_sergeant_t4',
    faction: 'vlandia',
    nameTr: 'Vlandiya Çavuş Hauberk Zincir Zırhı & Armalı Surcoat',
    tier: 4,
    armorClass: 'medium',
    helmStyle: 'spangen',
    surcoat: true,
    headArmor: 36,
    bodyArmor: 45,
    armArmor: 18,
    legArmor: 20,
    durability: 400,
    weightKg: 10.2,
    basePrice: 940,
    culturalCrest: 'vlandian_heraldic_pauldron',
    loreTr: 'Tam boy perçinli zincir gömlek üzerine giyilen kraliyet mavisi-altın Vlandiya surcoat kumaşı ve burunluklu miğfer.',
  },
  {
    id: 'vla_armor_banner_knight_t6',
    faction: 'vlandia',
    nameTr: 'Vlandiya Sancak Şövalyesi Tam Plaka Zırhı & Great Helm',
    tier: 6,
    armorClass: 'heavy',
    helmStyle: 'greatHelm',
    surcoat: true,
    headArmor: 56,
    bodyArmor: 64,
    armArmor: 30,
    legArmor: 28,
    durability: 620,
    weightKg: 15.2,
    basePrice: 2380,
    culturalCrest: 'vlandian_crowned_helm',
    loreTr: 'Altın haç işlemeli kova miğferi (Great Helm), kanatlı çelik omuzlukları ve dövme göğüs plakasıyla şövalye zırhı.',
  },

  // ── STURGİYA (STURGIA) ──
  {
    id: 'stu_armor_hunter_t2',
    faction: 'sturgia',
    nameTr: 'Sturgiya Kürk Yakalı Deri Kaftan & Kuzey Başlığı',
    tier: 2,
    armorClass: 'light',
    helmStyle: 'kettle',
    surcoat: false,
    headArmor: 17,
    bodyArmor: 25,
    armArmor: 11,
    legArmor: 13,
    durability: 230,
    weightKg: 5.6,
    basePrice: 300,
    culturalCrest: 'sturgian_fur_mantle',
    loreTr: 'Kuzey tundrasının ayazına ve kesici silahlara dayanıklı kalın kurt kürkü yakalı sertleştirilmiş deri kaftan.',
  },
  {
    id: 'stu_armor_varyag_t4',
    faction: 'sturgia',
    nameTr: 'Sturgiya Varyag Örme Zincir Zırhı & Gözlüklü Gjermundbu Miğfer',
    tier: 4,
    armorClass: 'medium',
    helmStyle: 'spangen',
    surcoat: true,
    headArmor: 40,
    bodyArmor: 47,
    armArmor: 19,
    legArmor: 21,
    durability: 430,
    weightKg: 10.8,
    basePrice: 990,
    culturalCrest: 'sturgian_gjermundbu',
    loreTr: 'Göz çevresini koruyan demir çerçeveli Nord miğferi ve zincir peçeli (aventail) ağır kuzey zırhı.',
  },
  {
    id: 'stu_armor_druzhinnik_t6',
    faction: 'sturgia',
    nameTr: 'Sturgiya Knyaz Druzhinnik Lamellar Hauberk & Kürklü Omuzluk',
    tier: 6,
    armorClass: 'heavy',
    helmStyle: 'greatHelm',
    surcoat: true,
    headArmor: 53,
    bodyArmor: 65,
    armArmor: 31,
    legArmor: 29,
    durability: 635,
    weightKg: 15.5,
    basePrice: 2360,
    culturalCrest: 'sturgian_fur_mantle',
    loreTr: 'Sivri Slav-Nord kubbeli miğfer, ayı postu omuz pelerini ve çelik şeritlerle güçlendirilmiş ağır Boyar zırhı.',
  },

  // ── KUZAİT (KHUZAIT) ──
  {
    id: 'khu_armor_nomad_t2',
    faction: 'khuzait',
    nameTr: 'Kuzait Göçebe Keçe Kaftan & Deri Bozkır Börkü',
    tier: 2,
    armorClass: 'light',
    helmStyle: 'kettle',
    surcoat: true,
    headArmor: 16,
    bodyArmor: 23,
    armArmor: 10,
    legArmor: 12,
    durability: 205,
    weightKg: 4.8,
    basePrice: 290,
    culturalCrest: 'khuzait_horsehair_tail',
    loreTr: 'At sırtında geriye dönüp ok atmayı (Part atışı) hiç kısıtlamayan esnek deri plakalı bozkır kaftanı.',
  },
  {
    id: 'khu_armor_lancer_t4',
    faction: 'khuzait',
    nameTr: 'Kuzait Kargıcı Deri-Çelik Lamellar Yelek & Tuğlu Tolga',
    tier: 4,
    armorClass: 'medium',
    helmStyle: 'spangen',
    surcoat: true,
    headArmor: 37,
    bodyArmor: 44,
    armArmor: 18,
    legArmor: 19,
    durability: 390,
    weightKg: 9.4,
    basePrice: 910,
    culturalCrest: 'khuzait_horsehair_tail',
    loreTr: 'İpek kordonlarla birbirine bağlanmış sert çelik pullar ve tepesinde at kuyruğu tuğu dalgalanan bozkır tolgası.',
  },
  {
    id: 'khu_armor_khans_guard_t6',
    faction: 'khuzait',
    nameTr: 'Han Muhafızı Ayna Plakalı Ağır Lamellar & Altın Tuğlu Tolga',
    tier: 6,
    armorClass: 'heavy',
    helmStyle: 'greatHelm',
    surcoat: true,
    headArmor: 52,
    bodyArmor: 62,
    armArmor: 29,
    legArmor: 27,
    durability: 595,
    weightKg: 13.8,
    basePrice: 2290,
    culturalCrest: 'khuzait_mirror_disc',
    loreTr: 'Göğüs ortasında altın güneş aynası (krug) taşıyan, hem ok yağmuruna hem kargı darbelerine dirençli Noyan zırhı.',
  },

  // ── ASERAY (ASERAI) ──
  {
    id: 'ase_armor_bedouin_t2',
    faction: 'aserai',
    nameTr: 'Aseray Çöl İpek Cübbesi & Kefiyeli Deri Zırh',
    tier: 2,
    armorClass: 'light',
    helmStyle: 'kettle',
    surcoat: true,
    headArmor: 18,
    bodyArmor: 22,
    armArmor: 9,
    legArmor: 11,
    durability: 200,
    weightKg: 4.6,
    basePrice: 305,
    culturalCrest: 'aserai_turban_wrap',
    loreTr: 'Çöl sıcağını yansıtan keten-ipek kumaş altına gizlenmiş hafif deri pullar ve kum fırtınası kefiyesi.',
  },
  {
    id: 'ase_armor_mamluke_t4',
    faction: 'aserai',
    nameTr: 'Aseray Memlük Pirinç Pullu Hauberk & Sarıklı Tolga',
    tier: 4,
    armorClass: 'medium',
    helmStyle: 'spangen',
    surcoat: true,
    headArmor: 38,
    bodyArmor: 45,
    armArmor: 19,
    legArmor: 20,
    durability: 405,
    weightKg: 9.8,
    basePrice: 950,
    culturalCrest: 'aserai_turban_wrap',
    loreTr: 'Etrafına turkuaz ve altın ipek sarık dolanmış sivri çelik tolga ve pirinç pullu Memlük süvari zırhı.',
  },
  {
    id: 'ase_armor_faris_emir_t6',
    faction: 'aserai',
    nameTr: 'Aseray Sultan Farisi Altın Kakmalı Cevher Zırhı',
    tier: 6,
    armorClass: 'heavy',
    helmStyle: 'greatHelm',
    surcoat: true,
    headArmor: 53,
    bodyArmor: 64,
    armArmor: 30,
    legArmor: 28,
    durability: 615,
    weightKg: 14.4,
    basePrice: 2420,
    culturalCrest: 'aserai_golden_collar',
    loreTr: 'Yaldızlı çelik yüz peçesi, altın işlemeli omuz plakaları ve sık dokunmuş Şam zinciriyle Emir ve Faris zırhı.',
  },

  // ── BATTANYA (BATTANIA) ──
  {
    id: 'bat_armor_woodrunner_t2',
    faction: 'battania',
    nameTr: 'Battanya Ekose Tartan Pelerin & Yaban Deri Yelek',
    tier: 2,
    armorClass: 'light',
    helmStyle: 'kettle',
    surcoat: true,
    headArmor: 16,
    bodyArmor: 23,
    armArmor: 10,
    legArmor: 12,
    durability: 215,
    weightKg: 4.9,
    basePrice: 295,
    culturalCrest: 'battanian_wolf_pelt',
    loreTr: 'Orman pusularında tam hareket serbestliği sağlayan yeşil-kahve ekose (tartan) pelerin ve perçinli yaban domuzu derisi.',
  },
  {
    id: 'bat_armor_oathsworn_t4',
    faction: 'battania',
    nameTr: 'Battanya Yeminli Bronz Göğüslük & Kurt Postlu Omuzluk',
    tier: 4,
    armorClass: 'medium',
    helmStyle: 'spangen',
    surcoat: true,
    headArmor: 39,
    bodyArmor: 44,
    armArmor: 20,
    legArmor: 19,
    durability: 415,
    weightKg: 9.9,
    basePrice: 930,
    culturalCrest: 'battanian_wolf_pelt',
    loreTr: 'Omuzlarında gerçek kurt postu taşıyan, Kelt bronz diskleriyle güçlendirilmiş zincir gömlek ve boynuzlu miğfer.',
  },
  {
    id: 'bat_armor_fian_champion_t6',
    faction: 'battania',
    nameTr: 'Battanya Fian Şampiyonu Kelt Kraliyet Bronz-Çelik Zırhı',
    tier: 6,
    armorClass: 'heavy',
    helmStyle: 'greatHelm',
    surcoat: true,
    headArmor: 51,
    bodyArmor: 61,
    armArmor: 29,
    legArmor: 27,
    durability: 590,
    weightKg: 13.4,
    basePrice: 2260,
    culturalCrest: 'battanian_bronze_torc',
    loreTr: 'Boyunda altın Kelt torku (Torc), omuzlarda ağır kurt postu ve kabartmalı antik bronz-çelik plakalarla Fian Şampiyonu zırhı.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   5. 6 KRALLIK SAVAŞ ATLARI KATALOĞU (12 ÖZEL BİNEK & KÜHEYLAN)
   ═══════════════════════════════════════════════════════════════════════ */

export const FACTION_HORSES: FactionHorseDef[] = [
  // ── İMPARATORLUK ──
  {
    id: 'emp_horse_courser_t4',
    faction: 'empire',
    nameTr: 'İmparatorluk Vigla Şarjör Atı',
    tier: 4,
    breed: 'war',
    coat: 'bay',
    barding: false,
    caparison: true,
    speed: 60,
    maneuver: 62,
    chargeDamage: 24,
    hitPoints: 210,
    bardingArmor: 18,
    harnessWeightKg: 14,
    basePrice: 680,
    scale: 1.0,
    loreTr: 'İmparatorluk süvari okullarında disiplinle eğitilmiş, mor-altın haşalı dengeli savaş atı.',
  },
  {
    id: 'emp_horse_cataphract_t6',
    faction: 'empire',
    nameTr: 'Zırhlı İmparatorluk Katafrakt Küheylanı',
    tier: 6,
    breed: 'destrier',
    coat: 'grey',
    barding: true,
    caparison: true,
    speed: 54,
    maneuver: 54,
    chargeDamage: 42,
    hitPoints: 325,
    bardingArmor: 66,
    harnessWeightKg: 42,
    basePrice: 2150,
    scale: 1.05,
    loreTr: 'Baştan sağrıya kadar çelik-bronz pullu zırhla (barding) kaplanmış, ok işlemez ağır Katafrakt savaş atı.',
  },

  // ── VLANDİYA ──
  {
    id: 'vla_horse_palfrey_t4',
    faction: 'vlandia',
    nameTr: 'Vlandiya Şövalye Palfrey Atı',
    tier: 4,
    breed: 'war',
    coat: 'chestnut',
    barding: false,
    caparison: true,
    speed: 59,
    maneuver: 58,
    chargeDamage: 28,
    hitPoints: 230,
    bardingArmor: 20,
    harnessWeightKg: 16,
    basePrice: 720,
    scale: 1.03,
    loreTr: 'Geniş göğüslü, uzun mesafe yürüyüşlerine ve mızraklı süvari hücumlarına dayanıklı Vlandiya atı.',
  },
  {
    id: 'vla_horse_destrier_t6',
    faction: 'vlandia',
    nameTr: 'Zırhlı Vlandiya Kraliyet Destrier Küheylanı',
    tier: 6,
    breed: 'destrier',
    coat: 'black',
    barding: true,
    caparison: true,
    speed: 55,
    maneuver: 52,
    chargeDamage: 46,
    hitPoints: 340,
    bardingArmor: 64,
    harnessWeightKg: 44,
    basePrice: 2280,
    scale: 1.08,
    loreTr: 'Kraliyet mavisi armalı örtüsü (caparison) ve alın zırhıyla (chanfron) piyade hatlarını ezip geçen dev Destrier.',
  },

  // ── STURGİYA ──
  {
    id: 'stu_horse_tundra_t3',
    faction: 'sturgia',
    nameTr: 'Sturgiya Kar Tundrası Atı',
    tier: 3,
    breed: 'steppe',
    coat: 'dun',
    barding: false,
    caparison: false,
    speed: 56,
    maneuver: 65,
    chargeDamage: 22,
    hitPoints: 225,
    bardingArmor: 12,
    harnessWeightKg: 11,
    basePrice: 510,
    scale: 0.96,
    loreTr: 'Kalın kış tüyleri ve sağlam toynaklarıyla derin karda ve bataklıkta hız kaybetmeyen kuzey binek atı.',
  },
  {
    id: 'stu_horse_druzhinnik_t6',
    faction: 'sturgia',
    nameTr: 'Druzhinnik Zincir ve Kürk Zırhlı Kuzey Küheylanı',
    tier: 6,
    breed: 'destrier',
    coat: 'grey',
    barding: true,
    caparison: true,
    speed: 55,
    maneuver: 56,
    chargeDamage: 40,
    hitPoints: 315,
    bardingArmor: 58,
    harnessWeightKg: 38,
    basePrice: 1960,
    scale: 1.04,
    loreTr: 'Knyaz muhafızlarının bindiği, kürk kenarlı yeşil örtü ve perçinli çelik göğüs zırhı taşıyan güçlü kuzey atı.',
  },

  // ── KUZAİT ──
  {
    id: 'khu_horse_steppe_t3',
    faction: 'khuzait',
    nameTr: 'Kuzait Çevik Bozkır Midillisi',
    tier: 3,
    breed: 'steppe',
    coat: 'dun',
    barding: false,
    caparison: true,
    speed: 64,
    maneuver: 72,
    chargeDamage: 18,
    hitPoints: 195,
    bardingArmor: 14,
    harnessWeightKg: 9,
    basePrice: 540,
    scale: 0.94,
    loreTr: 'Atlı okçuların dar daireler çizerek kesintisiz ok yağdırmasını sağlayan eşsiz manevra kabiliyetli bozkır atı.',
  },
  {
    id: 'khu_horse_khan_t6',
    faction: 'khuzait',
    nameTr: 'Kanglı Lamellar Zırhlı Han Küheylanı',
    tier: 6,
    breed: 'war',
    coat: 'palomino',
    barding: true,
    caparison: true,
    speed: 62,
    maneuver: 66,
    chargeDamage: 36,
    hitPoints: 285,
    bardingArmor: 54,
    harnessWeightKg: 29,
    basePrice: 2050,
    scale: 1.01,
    loreTr: 'Altın yeleli Palomino donu üzerine esnek bozkır lamellar zırhı giydirilmiş, hızından ödün vermeyen Han binek atı.',
  },

  // ── ASERAY ──
  {
    id: 'ase_horse_desert_t4',
    faction: 'aserai',
    nameTr: 'Aseray Rüzgârı Safkan Çöl Koşucusu',
    tier: 4,
    breed: 'war',
    coat: 'palomino',
    barding: false,
    caparison: true,
    speed: 67,
    maneuver: 68,
    chargeDamage: 22,
    hitPoints: 190,
    bardingArmor: 16,
    harnessWeightKg: 10,
    basePrice: 790,
    scale: 0.99,
    loreTr: 'Nahasa Çölü’nün en hızlı safkan kısrağı; savaş meydanında hiçbir süvari onu yakalayamaz.',
  },
  {
    id: 'ase_horse_nahasawi_t6',
    faction: 'aserai',
    nameTr: 'Nahasawi Altın Pullu Memlük Küheylanı',
    tier: 6,
    breed: 'destrier',
    coat: 'bay',
    barding: true,
    caparison: true,
    speed: 63,
    maneuver: 62,
    chargeDamage: 38,
    hitPoints: 290,
    bardingArmor: 56,
    harnessWeightKg: 31,
    basePrice: 2240,
    scale: 1.03,
    loreTr: 'Turkuaz ipek haşa ve yaldızlı Memlük alın-göğüs zırhıyla hem hız hem koruma sunan asil çöl küheylanı.',
  },

  // ── BATTANYA ──
  {
    id: 'bat_horse_highland_t3',
    faction: 'battania',
    nameTr: 'Battanya Sisli Yayla Midillisi',
    tier: 3,
    breed: 'steppe',
    coat: 'chestnut',
    barding: false,
    caparison: false,
    speed: 57,
    maneuver: 69,
    chargeDamage: 20,
    hitPoints: 215,
    bardingArmor: 10,
    harnessWeightKg: 9,
    basePrice: 480,
    scale: 0.93,
    loreTr: 'Sık ormanlarda ve dik kayalık yamaçlarda tökezlemeden koşabilen çevik yayla midillisi.',
  },
  {
    id: 'bat_horse_celtic_war_t5',
    faction: 'battania',
    nameTr: 'Battanya Bronz Maskeli Klan Savaş Atı',
    tier: 5,
    breed: 'war',
    coat: 'black',
    barding: true,
    caparison: true,
    speed: 58,
    maneuver: 61,
    chargeDamage: 34,
    hitPoints: 270,
    bardingArmor: 48,
    harnessWeightKg: 26,
    basePrice: 1580,
    scale: 1.0,
    loreTr: 'Kelt sarmallı bronz alın maskesi ve ekose kumaş örtüsüyle Battanya klan reislerinin savaş atı.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   6. KALİTE (MODIFIER) HESAPLAYICILARI VE PAZAR ENTEGRASYONU
   ═══════════════════════════════════════════════════════════════════════ */

export interface ComputedWeaponStats {
  fullNameTr: string;
  quality: ItemQualityModifier;
  swingDamage: number;
  thrustDamage: number;
  speed: number;
  handling: number;
  reachCm: number;
  durability: number;
  weightKg: number;
  priceDinar: number;
  statSummaryTr: string;
}

export function computeWeaponStatsWithQuality(
  weapon: FactionWeaponDef,
  qualityId: ItemQualityId = 'STANDARD',
): ComputedWeaponStats {
  const q = ITEM_QUALITY_MODIFIERS[qualityId];
  const fullNameTr =
    qualityId === 'STANDARD' ? weapon.nameTr : `${q.prefixTr} ${weapon.nameTr}`;

  const swingDamage =
    weapon.swingDamage > 0
      ? Math.max(1, Math.round(weapon.swingDamage * q.damageMultiplier))
      : 0;
  const thrustDamage =
    weapon.thrustDamage > 0
      ? Math.max(1, Math.round(weapon.thrustDamage * q.damageMultiplier))
      : 0;
  const speed = Math.max(50, Math.round(weapon.speed + q.speedBonus));
  const handling = Math.max(50, Math.round(weapon.handling + q.speedBonus));
  const durability = Math.max(
    40,
    Math.round(weapon.durability * q.durabilityMultiplier),
  );
  const weightKg = Number((weapon.weightKg * q.weightMultiplier).toFixed(2));
  const priceDinar = Math.max(25, Math.round(weapon.basePrice * q.priceMultiplier));

  let statSummaryTr = '';
  if (weapon.kind === 'shield') {
    statSummaryTr = `Dayanıklılık: ${durability} HP · Hız: ${speed} · Genişlik: ${weapon.reachCm}cm`;
  } else if (weapon.kind === 'bow' || weapon.kind === 'crossbow') {
    statSummaryTr = `+${thrustDamage} Delici Ok Hasarı · Hız: ${speed} · Dayanıklılık: ${durability}`;
  } else if (weapon.kind === 'cavalry_lance') {
    statSummaryTr = `+${thrustDamage} Delici (Koltuklu Hücum) · Erişim: ${weapon.reachCm}cm · Hız: ${speed}`;
  } else {
    const dmgTypeTr =
      weapon.swingDamageType === 'CUT'
        ? 'Kesici'
        : weapon.swingDamageType === 'BLUNT'
          ? 'Ezici'
          : 'Delici';
    const thrustPart =
      thrustDamage > 0 ? ` · +${thrustDamage} Saplama` : '';
    const breakerPart = weapon.shieldBreaker ? ' · Kalkan Kırıcı' : '';
    statSummaryTr = `+${swingDamage} ${dmgTypeTr}${thrustPart} · Hız: ${speed} · Dayanıklılık: ${durability}${breakerPart}`;
  }

  return {
    fullNameTr,
    quality: q,
    swingDamage,
    thrustDamage,
    speed,
    handling,
    reachCm: weapon.reachCm,
    durability,
    weightKg,
    priceDinar,
    statSummaryTr,
  };
}

export interface ComputedArmorStats {
  fullNameTr: string;
  quality: ItemQualityModifier;
  headArmor: number;
  bodyArmor: number;
  armArmor: number;
  legArmor: number;
  totalArmor: number;
  durability: number;
  weightKg: number;
  priceDinar: number;
  statSummaryTr: string;
}

export function computeArmorStatsWithQuality(
  armor: FactionArmorDef,
  qualityId: ItemQualityId = 'STANDARD',
): ComputedArmorStats {
  const q = ITEM_QUALITY_MODIFIERS[qualityId];
  const fullNameTr =
    qualityId === 'STANDARD' ? armor.nameTr : `${q.prefixTr} ${armor.nameTr}`;

  const headArmor = Math.max(4, armor.headArmor + q.armorBonus);
  const bodyArmor = Math.max(8, armor.bodyArmor + q.armorBonus);
  const armArmor = Math.max(2, armor.armArmor + Math.round(q.armorBonus * 0.6));
  const legArmor = Math.max(3, armor.legArmor + Math.round(q.armorBonus * 0.6));
  const totalArmor = headArmor + bodyArmor + armArmor + legArmor;
  const durability = Math.max(
    80,
    Math.round(armor.durability * q.durabilityMultiplier),
  );
  const weightKg = Number((armor.weightKg * q.weightMultiplier).toFixed(1));
  const priceDinar = Math.max(40, Math.round(armor.basePrice * q.priceMultiplier));

  const statSummaryTr = `+${bodyArmor} Gövde · +${headArmor} Baş · +${armArmor} Kol · +${legArmor} Bacak (Dayanıklılık: ${durability})`;

  return {
    fullNameTr,
    quality: q,
    headArmor,
    bodyArmor,
    armArmor,
    legArmor,
    totalArmor,
    durability,
    weightKg,
    priceDinar,
    statSummaryTr,
  };
}

export interface ComputedHorseStats {
  fullNameTr: string;
  quality: ItemQualityModifier;
  speed: number;
  maneuver: number;
  chargeDamage: number;
  hitPoints: number;
  bardingArmor: number;
  harnessWeightKg: number;
  priceDinar: number;
  statSummaryTr: string;
}

export function computeHorseStatsWithQuality(
  horse: FactionHorseDef,
  qualityId: ItemQualityId = 'STANDARD',
): ComputedHorseStats {
  const q = ITEM_QUALITY_MODIFIERS[qualityId];
  const fullNameTr =
    qualityId === 'STANDARD' ? horse.nameTr : `${q.prefixTr} ${horse.nameTr}`;

  const speed = Math.max(35, horse.speed + q.horseStatBonus);
  const maneuver = Math.max(35, horse.maneuver + q.horseStatBonus);
  const chargeDamage = Math.max(8, horse.chargeDamage + Math.round(q.horseStatBonus * 0.8));
  const hitPoints = Math.max(
    110,
    Math.round(horse.hitPoints * q.durabilityMultiplier),
  );
  const bardingArmor =
    horse.bardingArmor > 0
      ? Math.max(5, horse.bardingArmor + q.armorBonus)
      : 0;
  const priceDinar = Math.max(80, Math.round(horse.basePrice * q.priceMultiplier));

  const statSummaryTr = `Hız: ${speed} · Manevra: ${maneuver} · Hücum: +${chargeDamage} · Can: ${hitPoints}${bardingArmor > 0 ? ` · Zırh: +${bardingArmor}` : ''}`;

  return {
    fullNameTr,
    quality: q,
    speed,
    maneuver,
    chargeDamage,
    hitPoints,
    bardingArmor,
    harnessWeightKg: horse.harnessWeightKg,
    priceDinar,
    statSummaryTr,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   7. 3B PROSEDÜREL SİLAH, ZIRH VE AT ÜRETİCİLERİ
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Her krallığın kendine özgü 3B kılıç, gönderli silah, balta, gürz, yay, arbalet
 * ve kalkan geometrilerini üretir.
 * Hem sahne hiyerarşisi (`group`) hem de üçgen sayısı döner.
 */
export function buildFactionWeapon3D(
  weapon: FactionWeaponDef,
  qualityId: ItemQualityId = 'STANDARD',
  lod: LodLevel = 'hero',
): {
  group: THREE.Group;
  triangles: number;
  weaponDef: FactionWeaponDef;
  computed: ComputedWeaponStats;
} {
  const factionPalette = FactionPalette.byId(weapon.faction);
  const palDefs = createArmoryPalette(factionPalette);

  // Kaliteye göre metal parlaklığı (Usta İşi / Efsanevi daha parlak çelik, Paslı daha mat/koyu)
  if (qualityId === 'RUSTY') {
    palDefs.steel = { color: 0x625347, metalness: 0.45, roughness: 0.78 };
    palDefs.steelBright = { color: 0x78685a, metalness: 0.52, roughness: 0.68 };
  } else if (qualityId === 'MASTERWORK' || qualityId === 'LEGENDARY') {
    palDefs.steelBright = { color: 0xf4f7fb, metalness: 0.94, roughness: 0.18 };
    palDefs.gold = { color: 0xffd56b, metalness: 0.95, roughness: 0.22 };
  }

  const mats = new MaterialLibrary(palDefs);
  mats.setFaction(factionPalette);

  const pieces = buildWeaponArchetypePieces(weapon, lod);
  const group = new THREE.Group();
  group.name = `arsenal_weapon_${weapon.id}`;

  let triangles = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const def = mats.resolve(p.material);
    const mat =
      def && mats.has(def.key)
        ? mats.material(def.key)
        : mats.material('steel');
    const mesh = new THREE.Mesh(p.geometry, mat);
    if (p.position) mesh.position.set(...p.position);
    if (p.rotation) mesh.rotation.set(...p.rotation);
    if (p.scale !== undefined) {
      if (typeof p.scale === 'number') mesh.scale.setScalar(p.scale);
      else mesh.scale.set(...p.scale);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    triangles += triCount(p.geometry);
  }

  return {
    group,
    triangles: Math.round(triangles),
    weaponDef: weapon,
    computed: computeWeaponStatsWithQuality(weapon, qualityId),
  };
}

function buildWeaponArchetypePieces(
  weapon: FactionWeaponDef,
  lod: LodLevel,
): Piece[] {
  const hero = lod === 'hero';
  const seg = hero ? 10 : 6;
  const rad = hero ? 8 : 5;
  const P: Piece[] = [];

  const arch = weapon.visualArchetype;

  // ── 1. KILIÇLAR (Tek Elli & Çift Elli & Eğri Kılıçlar & Falx) ──
  if (
    arch === 'spatha' ||
    arch === 'thamaskene_spatha' ||
    arch === 'arming_sword' ||
    arch === 'bastard_sword' ||
    arch === 'royal_greatsword' ||
    arch === 'ulfberht' ||
    arch === 'varsheg_sword' ||
    arch === 'kaskara' ||
    arch === 'highland_sword' ||
    arch === 'claymore'
  ) {
    const isTwoHand = weapon.twoHanded;
    const gripLen = isTwoHand ? 0.25 : 0.14;
    const bladeLen = isTwoHand ? 0.96 : 0.74;
    const bladeW = arch === 'ulfberht' || arch === 'highland_sword' ? 0.048 : isTwoHand ? 0.052 : 0.042;
    const isOrnate = weapon.tier >= 6;

    // Pommel (Topuz)
    const pommelGeo =
      arch === 'ulfberht' || arch === 'varsheg_sword'
        ? new THREE.OctahedronGeometry(0.032, 0) // Viking üç loblu pommel
        : arch === 'spatha' || arch === 'thamaskene_spatha'
          ? new THREE.SphereGeometry(0.028, rad, rad - 2) // Roma küre pommel
          : new THREE.CylinderGeometry(0.026, 0.026, 0.018, rad); // Şövalye tekerlek pommel
    if (arch === 'arming_sword' || arch === 'bastard_sword' || arch === 'royal_greatsword') {
      pommelGeo.rotateX(90 * DEG);
    }
    P.push({
      geometry: pommelGeo,
      material: isOrnate ? 'gold' : 'steelDark',
      position: [0, -gripLen - 0.018, 0],
    });

    // Kabza (Grip)
    const gripGeo = new THREE.CylinderGeometry(0.016, 0.019, gripLen, rad, 2);
    gripGeo.scale(1.15, 1, 0.78);
    P.push({
      geometry: gripGeo,
      material: isOrnate ? 'cloth' : 'leatherDark',
      position: [0, -gripLen * 0.5, 0],
    });

    // Kabza bilezikleri
    for (let i = 0; i < (isTwoHand ? 4 : 3); i++) {
      const ring = new THREE.TorusGeometry(0.018, 0.0035, 4, rad);
      ring.rotateX(90 * DEG);
      P.push({
        geometry: ring,
        material: isOrnate ? 'gold' : 'steel',
        position: [0, -gripLen * (0.18 + i * 0.24), 0],
      });
    }

    // Balçak / Siper (Crossguard)
    if (arch === 'claymore' || arch === 'highland_sword') {
      // Kelt V-açılı ileri uzanan siper + yonca uçlar
      for (const s of [-1, 1]) {
        const arm = new THREE.BoxGeometry(0.11, 0.016, 0.022);
        P.push({
          geometry: arm,
          material: isOrnate ? 'gold' : 'bronze',
          position: [s * 0.052, 0.018, 0],
          rotation: [0, 0, s * 16 * DEG],
        });
        const quatrefoil = new THREE.OctahedronGeometry(0.016, 0);
        P.push({
          geometry: quatrefoil,
          material: 'gold',
          position: [s * 0.105, 0.034, 0],
        });
      }
    } else if (arch === 'spatha' || arch === 'thamaskene_spatha') {
      // İmparatorluk oval kemik/altın balçak
      const guard = new THREE.BoxGeometry(0.11, 0.028, 0.036);
      P.push({
        geometry: guard,
        material: isOrnate ? 'gold' : 'bronze',
        position: [0, 0.008, 0],
      });
    } else {
      // Geniş haç siper (Vlandiya / Kaskara / Ulfberht)
      const guardW = isTwoHand ? 0.24 : arch === 'kaskara' ? 0.17 : 0.15;
      const guard = new THREE.BoxGeometry(guardW, 0.02, 0.026);
      P.push({
        geometry: guard,
        material: isOrnate ? 'gold' : 'steelDark',
        position: [0, 0.006, 0],
      });
    }

    // Namlu (Elmas kesitli süpürme + kan oluğu)
    const spinePts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      spinePts.push(v3(0, (i / seg) * bladeLen, 0));
    }
    const diamond = profile2([
      [-bladeW, 0],
      [0, -0.007],
      [bladeW, 0],
      [0, 0.007],
      [-bladeW, 0],
    ]);
    const bladeGeo = sweep(diamond, spinePts, {
      scale: (t) => (t < 0.78 ? 1 - t * 0.18 : Math.max(0.04, (1 - t) / 0.22 * 0.86)),
      seedNormal: v3(0, 0, 1),
    });
    P.push({
      geometry: bladeGeo,
      material: isOrnate ? 'steelBright' : 'steel',
      position: [0, 0.014, 0],
    });

    // Kan oluğu (Fuller)
    if (hero) {
      const fuller = new THREE.BoxGeometry(bladeW * 0.42, bladeLen * 0.64, 0.016);
      P.push({
        geometry: fuller,
        material: isOrnate ? 'gold' : 'steelDark',
        position: [0, bladeLen * 0.34, 0],
      });
    }

    // Çift elli kılıçlarda deri ricasso + yan kancalar (parrying hooks)
    if (arch === 'royal_greatsword') {
      const ricasso = new THREE.BoxGeometry(bladeW * 1.45, 0.14, 0.018);
      P.push({ geometry: ricasso, material: 'cloth', position: [0, 0.085, 0] });
      for (const s of [-1, 1]) {
        const lug = new THREE.ConeGeometry(0.012, 0.055, 4);
        lug.rotateZ(s * -68 * DEG);
        P.push({ geometry: lug, material: 'gold', position: [s * 0.048, 0.16, 0] });
      }
    }

    return P;
  }

  // ── 2. EĞRİ KILIÇLAR / ŞAMŞIRLAR / FALX ──
  if (
    arch === 'paramion' ||
    arch === 'steppe_sabre' ||
    arch === 'khan_scimitar' ||
    arch === 'sultan_scimitar' ||
    arch === 'falx'
  ) {
    const isFalx = arch === 'falx';
    const isOrnate = weapon.tier >= 6;
    const gripLen = isFalx ? 0.26 : 0.14;
    const bladeLen = isFalx ? 0.86 : 0.76;
    const curveAngle = isFalx ? -0.46 : 0.38; // Falx içe (öne) bükülür, Şamşır geriye kavis alır

    // Kabza
    const grip = new THREE.CylinderGeometry(0.016, 0.019, gripLen, rad, 2);
    P.push({
      geometry: grip,
      material: isOrnate ? 'cloth' : 'leatherDark',
      position: [0, -gripLen * 0.5, 0],
    });

    // Kuşbaşı / Hilal Pommel
    const pommel = new THREE.SphereGeometry(0.025, rad, rad - 2);
    P.push({
      geometry: pommel,
      material: isOrnate ? 'gold' : 'bronze',
      position: [isFalx ? 0 : -0.01, -gripLen - 0.015, 0],
    });

    // Siper
    const guard = new THREE.BoxGeometry(isFalx ? 0.09 : 0.13, 0.022, 0.026);
    P.push({
      geometry: guard,
      material: isOrnate ? 'gold' : 'bronze',
      position: [0, 0.006, 0],
    });

    // Kavisli Namlu (bendGeometry ile)
    const spinePts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      spinePts.push(v3(0, (i / seg) * bladeLen, 0));
    }
    const prof = profile2([
      [-0.024, 0],
      [0.012, -0.006],
      [0.032, 0],
      [0.012, 0.006],
      [-0.024, 0],
    ]);
    const blade = sweep(prof, spinePts, {
      scale: (t) => {
        if (t < 0.72) return 0.9 + t * 0.35; // uca doğru yatağan/şamşır genişlemesi
        return Math.max(0.05, ((1 - t) / 0.28) * 1.15);
      },
      seedNormal: v3(0, 0, 1),
    });
    bendGeometry(blade, (y) => (y / bladeLen) * curveAngle);
    P.push({
      geometry: blade,
      material: isOrnate ? 'steelBright' : 'steel',
      position: [0, 0.014, 0],
    });

    return P;
  }

  // ── 3. BALTALAR VE GÜRZLER (Bearded Axe, Dane Axe, Tabarzin, Pernach) ──
  if (
    arch === 'bearded_axe' ||
    arch === 'dane_axe' ||
    arch === 'tabarzin' ||
    arch === 'pernach'
  ) {
    const isTwoHand = weapon.twoHanded;
    const haftLen = arch === 'pernach' ? 0.62 : isTwoHand ? 1.18 : 0.72;
    const isOrnate = weapon.tier >= 5;

    // Ahşap/Çelik Sap
    const shaft = new THREE.CylinderGeometry(0.018, 0.021, haftLen, rad, 3);
    P.push({
      geometry: shaft,
      material: arch === 'pernach' ? 'steelDark' : 'wood',
      position: [0, haftLen * 0.35, 0],
    });

    // Deri tutamak sargıları (hem sağ el hem 2H sol el tutuş bölgesini kapsar)
    const grip = new THREE.CylinderGeometry(0.021, 0.022, haftLen * 0.42, rad, 1);
    P.push({
      geometry: grip,
      material: 'leatherDark',
      position: [0, isTwoHand ? 0.04 : haftLen * 0.05, 0],
    });

    const headY = haftLen * 0.74;

    if (arch === 'pernach') {
      // 6 Kanatlı İmparatorluk Gürzü
      const core = new THREE.CylinderGeometry(0.026, 0.024, 0.16, rad);
      P.push({ geometry: core, material: 'gold', position: [0, headY, 0] });
      const flangeCount = 6;
      for (let i = 0; i < flangeCount; i++) {
        const a = (i / flangeCount) * TAU;
        const flange = new THREE.BoxGeometry(0.055, 0.14, 0.008);
        P.push({
          geometry: flange,
          material: 'steelBright',
          position: [Math.cos(a) * 0.032, headY, Math.sin(a) * 0.032],
          rotation: [0, -a, 0],
        });
      }
      const spike = new THREE.ConeGeometry(0.016, 0.06, rad);
      P.push({ geometry: spike, material: 'gold', position: [0, headY + 0.11, 0] });
      return P;
    }

    // Balta ağzı (Sakallı / Dane Hilal / Çift Hilal Tabarzin)
    const bladeShape = shapeFrom(
      arch === 'bearded_axe'
        ? [
            [0.015, 0.05],
            [0.14, 0.09],
            [0.17, 0.02],
            [0.16, -0.14], // aşağı sarkan sakal
            [0.09, -0.12],
            [0.06, -0.02],
            [0.015, -0.03],
          ]
        : [
            [0.015, 0.06],
            [0.18, 0.16],
            [0.22, 0.04],
            [0.21, -0.08],
            [0.16, -0.18],
            [0.015, -0.06],
          ],
    );
    const axeHead = new THREE.ExtrudeGeometry(bladeShape, extrudeOpts(0.014, 0.004, 2));
    axeHead.translate(0, 0, -0.007);
    P.push({
      geometry: axeHead,
      material: isOrnate ? 'steelBright' : 'steel',
      position: [0, headY, 0],
    });

    // Tabarzin ise çift taraflı hilal ağız + altın göbek
    if (arch === 'tabarzin') {
      const secondHead = axeHead.clone();
      secondHead.scale(-1, 1, 1);
      P.push({
        geometry: secondHead,
        material: 'steelBright',
        position: [0, headY, 0],
      });
      const collar = new THREE.CylinderGeometry(0.028, 0.028, 0.14, rad);
      P.push({ geometry: collar, material: 'gold', position: [0, headY, 0] });
    }

    const spearTip = new THREE.ConeGeometry(0.018, 0.08, 4);
    P.push({
      geometry: spearTip,
      material: isOrnate ? 'gold' : 'steel',
      position: [0, haftLen * 0.85 + 0.04, 0],
    });

    return P;
  }

  // ── 4. GÖNDERLİ SİLAHLAR VE SÜVARİ KARGILARI (Menavlion, Voulge, Glaive, Sovnya, Rhomphaia, Kontos, Lance, Jereed) ──
  if (
    arch === 'menavlion' ||
    arch === 'voulge' ||
    arch === 'glaive' ||
    arch === 'sovnya' ||
    arch === 'rhomphaia' ||
    arch === 'kontos' ||
    arch === 'knight_lance' ||
    arch === 'steppe_lance' ||
    arch === 'faris_lance' ||
    arch === 'jereed'
  ) {
    const isLance =
      arch === 'kontos' ||
      arch === 'knight_lance' ||
      arch === 'steppe_lance' ||
      arch === 'faris_lance';
    const isJereed = arch === 'jereed';
    const shaftLen = isJereed ? 1.15 : isLance ? 1.85 : 1.52;

    const shaft = new THREE.CylinderGeometry(
      isLance ? 0.015 : 0.019,
      0.022,
      shaftLen,
      rad,
      3,
    );
    P.push({
      geometry: shaft,
      material: arch === 'faris_lance' ? 'woodLight' : 'wood',
      position: [0, shaftLen * 0.38, 0],
    });

    // Sağ ve sol elin kavradığı deri sargı kuşağı + dip demiri (sauroter)
    const gripWrapLen = isJereed ? 0.28 : 0.56;
    const gripWrap = new THREE.CylinderGeometry(0.021, 0.023, gripWrapLen, rad, 1);
    P.push({
      geometry: gripWrap,
      material: 'leatherDark',
      position: [0, isJereed ? 0.36 : 0.26, 0],
    });

    const buttCap = new THREE.ConeGeometry(0.024, 0.09, rad);
    buttCap.rotateZ(Math.PI);
    P.push({
      geometry: buttCap,
      material: 'bronze',
      position: [0, -shaftLen * 0.12 - 0.03, 0],
    });

    const tipBaseY = shaftLen * 0.88;

    // Vlandiya Şövalye Kargısı el siperi (vamplate)
    if (arch === 'knight_lance') {
      const vamplate = new THREE.ConeGeometry(0.085, 0.12, rad, 1, true);
      P.push({
        geometry: vamplate,
        material: 'steelBright',
        position: [0, shaftLen * 0.18, 0],
      });
    }

    // Sancak / Tuğ flaması
    if (isLance) {
      const pennant = new THREE.BoxGeometry(0.22, 0.09, 0.006);
      P.push({
        geometry: pennant,
        material: 'cloth',
        position: [-0.12, tipBaseY - 0.12, 0],
      });
    }

    if (isLance || isJereed) {
      // Yaprak / Elmas kesitli delici mızrak ucu
      const spearHead = new THREE.ConeGeometry(0.028, isJereed ? 0.24 : 0.34, 4);
      spearHead.scale(1, 1, 0.45);
      P.push({
        geometry: spearHead,
        material: 'steelBright',
        position: [0, tipBaseY + (isJereed ? 0.12 : 0.17), 0],
      });
      const socket = new THREE.CylinderGeometry(0.018, 0.024, 0.08, rad);
      P.push({ geometry: socket, material: 'gold', position: [0, tipBaseY, 0] });
      return P;
    }

    // Biçici Gönderli Başlığı (Glaive / Menavlion / Voulge / Sovnya / Rhomphaia)
    const headLen = arch === 'glaive' || arch === 'rhomphaia' ? 0.56 : 0.44;
    const headW = arch === 'voulge' ? 0.075 : 0.048;
    const spinePts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      spinePts.push(v3(0, (i / seg) * headLen, 0));
    }
    const prof = profile2([
      [-headW * 0.4, 0],
      [0, -0.007],
      [headW, 0],
      [0, 0.007],
      [-headW * 0.4, 0],
    ]);
    const poleBlade = sweep(prof, spinePts, {
      scale: (t) => (t < 0.75 ? 1 + t * 0.15 : Math.max(0.06, ((1 - t) / 0.25) * 1.1)),
      seedNormal: v3(0, 0, 1),
    });
    if (arch === 'glaive' || arch === 'sovnya') {
      bendGeometry(poleBlade, (y) => (y / headLen) * 0.28);
    } else if (arch === 'rhomphaia') {
      bendGeometry(poleBlade, (y) => (y / headLen) * -0.36); // İçe bükümlü orak
    }
    P.push({
      geometry: poleBlade,
      material: 'steelBright',
      position: [0, tipBaseY, 0],
    });
    const collar = new THREE.CylinderGeometry(0.026, 0.024, 0.09, rad);
    P.push({ geometry: collar, material: 'gold', position: [0, tipBaseY, 0] });

    return P;
  }

  // ── 5. YAYLAR VE ARBALETLER (Composite Bow, Fian Longbow, Crossbow) ──
  if (arch === 'composite_bow' || arch === 'fian_longbow' || arch === 'crossbow') {
    if (arch === 'crossbow') {
      // Vlandiya Ağır Arbalet kundak + çelik yay + üzengi
      const stock = new THREE.BoxGeometry(0.048, 0.68, 0.068);
      P.push({ geometry: stock, material: 'wood', position: [0, 0, 0] });
      const prod = new THREE.BoxGeometry(0.58, 0.026, 0.018, 6, 1, 1);
      bendGeometry(prod, (y) => y * -0.35);
      P.push({
        geometry: prod,
        material: 'steelBright',
        position: [0, 0.28, 0.02],
      });
      const stringGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.54, 4);
      stringGeo.rotateZ(90 * DEG);
      P.push({
        geometry: stringGeo,
        material: 'bone',
        position: [0, 0.12, 0.025],
      });
      return P;
    }

    const halfSpan = arch === 'fian_longbow' ? 0.68 : 0.52;
    const bowSpine: THREE.Vector3[] = [];
    for (let i = -seg; i <= seg; i++) {
      const u = i / seg;
      const y = u * halfSpan;
      const z =
        arch === 'composite_bow'
          ? -Math.cos(u * Math.PI * 0.5) * 0.14 + Math.pow(Math.abs(u), 3) * 0.09
          : -Math.cos(u * Math.PI * 0.5) * 0.12;
      bowSpine.push(v3(0, y, z));
    }
    const limb = sweep(
      profile2([
        [-0.014, -0.01],
        [0.014, -0.01],
        [0.014, 0.01],
        [-0.014, 0.01],
        [-0.014, -0.01],
      ]),
      bowSpine,
      {
        scale: (t) => 1 - Math.abs(t - 0.5) * 1.1,
        seedNormal: v3(1, 0, 0),
      },
    );
    P.push({
      geometry: limb,
      material: arch === 'composite_bow' ? 'horn' : 'wood',
    });

    const bowString = new THREE.CylinderGeometry(0.0025, 0.0025, halfSpan * 1.94, 4);
    P.push({
      geometry: bowString,
      material: 'bone',
      position: [0, 0, arch === 'composite_bow' ? 0.06 : 0.01],
    });
    return P;
  }

  // ── 6. KALKANLAR (Scutum, Heater, Huskarl, Steppe, Mamluke, Celtic) ──
  const isRound =
    arch === 'huskarl_shield' ||
    arch === 'steppe_shield' ||
    arch === 'mamluke_shield' ||
    arch === 'celtic_shield';

  // Kalkan arka yüz (-Z) tutamak barı (handle), önkol deri kayışı (enarme) ve kol yastığı:
  const addShieldBackGrip = () => {
    const pad = new THREE.BoxGeometry(0.18, 0.14, 0.016);
    P.push({
      geometry: pad,
      material: 'leatherDark',
      position: [0.02, 0, -0.018],
    });
    const gripBar = new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6);
    P.push({
      geometry: gripBar,
      material: 'wood',
      position: [-0.045, 0, -0.032],
    });
    const enarme = new THREE.TorusGeometry(0.056, 0.011, 5, 8, Math.PI * 1.15);
    enarme.rotateY(90 * DEG);
    P.push({
      geometry: enarme,
      material: 'leatherDark',
      position: [0.065, 0, -0.022],
    });
  };

  if (isRound) {
    const radius = arch === 'huskarl_shield' ? 0.44 : 0.37;
    const disc = new THREE.CylinderGeometry(radius, radius, 0.024, hero ? 16 : 10);
    disc.rotateX(90 * DEG);
    if (arch === 'celtic_shield') disc.scale(0.84, 1.16, 1);
    P.push({ geometry: disc, material: 'cloth' });

    const rim = new THREE.TorusGeometry(radius, 0.016, 5, hero ? 16 : 10);
    if (arch === 'celtic_shield') rim.scale(0.84, 1.16, 1);
    P.push({
      geometry: rim,
      material: arch === 'mamluke_shield' || arch === 'celtic_shield' ? 'gold' : 'steelDark',
    });

    const boss = new THREE.SphereGeometry(0.085, rad, rad - 2, 0, TAU, 0, 90 * DEG);
    boss.rotateX(90 * DEG);
    P.push({
      geometry: boss,
      material: arch === 'huskarl_shield' ? 'steelBright' : 'gold',
      position: [0, 0, 0.012],
    });
    addShieldBackGrip();
    return P;
  }

  // Dikdörtgen Scutum veya Damla Heater Kalkan
  const w = arch === 'scutum' ? 0.48 : 0.42;
  const h = arch === 'scutum' ? 0.88 : 0.76;
  const plate = new THREE.BoxGeometry(w, h, 0.026, 4, 4, 1);
  bendGeometry(plate, (y) => y * 0.18);
  P.push({ geometry: plate, material: 'cloth' });

  const boss = new THREE.SphereGeometry(0.075, rad, rad - 2);
  P.push({ geometry: boss, material: 'gold', position: [0, 0.04, 0.03] });
  addShieldBackGrip();

  return P;
}

/**
 * Krallığa özel miğfer sorgucu, yüz maskesi, sarık, kurt postu ve omuz/göğüs
 * süslemeleriyle birlikte tam 3B zırh parçalarını (`ArmorPiece[]`) üretir.
 */
export function buildFactionArmorPieces(
  armorDef: FactionArmorDef,
  lod: LodLevel = 'hero',
): {
  baseSet: ReturnType<typeof buildArmorSet>;
  culturalExtras: ArmorPiece[];
} {
  const faction = FactionPalette.byId(armorDef.faction);
  const baseSet = buildArmorSet({
    tier: armorDef.armorClass,
    lod,
    faction,
    helmStyle: armorDef.helmStyle,
    surcoat: armorDef.surcoat,
  });

  const extras: ArmorPiece[] = [];
  const crest = armorDef.culturalCrest;

  if (crest === 'imperial_plume_mask' || crest === 'imperial_legion_crest') {
    // İmparatorluk fırça sorgucu (crista) + altın alın çemberi
    const crestPlume = new THREE.BoxGeometry(0.036, 0.11, 0.26);
    extras.push({
      geometry: crestPlume,
      material: 'surcoat',
      joint: 'head',
      position: [0, 0.26, -0.01],
    });
    const crestHolder = new THREE.BoxGeometry(0.024, 0.035, 0.24);
    extras.push({
      geometry: crestHolder,
      material: 'gold',
      joint: 'head',
      position: [0, 0.2, -0.01],
    });
    if (crest === 'imperial_plume_mask') {
      const mask = new THREE.CylinderGeometry(0.11, 0.095, 0.14, 7, 1, false, -1.1, 2.2);
      extras.push({
        geometry: mask,
        material: 'gold',
        joint: 'head',
        position: [0, 0.01, 0.055],
      });
    }
  } else if (crest === 'vlandian_crowned_helm') {
    // Vlandiya Great Helm üstü altın kraliyet tacı
    const crown = new THREE.TorusGeometry(0.125, 0.014, 5, 8);
    crown.rotateX(90 * DEG);
    extras.push({
      geometry: crown,
      material: 'gold',
      joint: 'head',
      position: [0, 0.18, 0],
    });
  } else if (crest === 'vlandian_heraldic_pauldron') {
    // Vlandiya şövalye omuz rondelleri (besagews)
    for (const side of [-1, 1]) {
      const rondel = new THREE.CylinderGeometry(0.052, 0.052, 0.014, 8);
      rondel.rotateX(90 * DEG);
      extras.push({
        geometry: rondel,
        material: 'gold',
        joint: side > 0 ? 'shoulderR' : 'shoulderL',
        position: [side * 0.04, 0.01, 0.075],
      });
    }
  } else if (crest === 'sturgian_gjermundbu') {
    // Sturgiya Gjermundbu gözlüklü Nord demir maskesi
    const spectacle = new THREE.BoxGeometry(0.16, 0.042, 0.03);
    extras.push({
      geometry: spectacle,
      material: 'plate',
      joint: 'head',
      position: [0, 0.04, 0.135],
    });
  } else if (crest === 'sturgian_fur_mantle' || crest === 'battanian_wolf_pelt') {
    // Omuzları saran kalın kurt/ayı kürkü pelerin yakası
    const furCollar = new THREE.TorusGeometry(0.19, 0.065, 6, 9, Math.PI * 1.35);
    furCollar.rotateX(90 * DEG);
    furCollar.rotateZ(32 * DEG);
    extras.push({
      geometry: furCollar,
      material: 'leatherDark',
      joint: 'chest',
      position: [0, 0.11, -0.02],
    });
  } else if (crest === 'khuzait_horsehair_tail' || crest === 'khuzait_mirror_disc') {
    // Kuzait tolga tepesi sivri koni + sarkan at kuyruğu tuğu
    const spike = new THREE.ConeGeometry(0.022, 0.09, 6);
    extras.push({
      geometry: spike,
      material: 'gold',
      joint: 'head',
      position: [0, 0.25, 0],
    });
    const tail = new THREE.ConeGeometry(0.038, 0.22, 6);
    tail.rotateX(28 * DEG);
    extras.push({
      geometry: tail,
      material: 'surcoat',
      joint: 'head',
      position: [0, 0.16, -0.08],
    });
    if (crest === 'khuzait_mirror_disc') {
      const mirror = new THREE.CylinderGeometry(0.075, 0.075, 0.016, 8);
      mirror.rotateX(90 * DEG);
      extras.push({
        geometry: mirror,
        material: 'gold',
        joint: 'chest',
        position: [0, 0.06, 0.125],
      });
    }
  } else if (crest === 'aserai_turban_wrap' || crest === 'aserai_golden_collar') {
    // Aseray miğfer çevresi dolgun sarık sargısı
    const turban = new THREE.TorusGeometry(0.138, 0.044, 6, 10);
    turban.rotateX(90 * DEG);
    extras.push({
      geometry: turban,
      material: 'surcoat',
      joint: 'head',
      position: [0, 0.08, 0],
    });
  } else if (crest === 'battanian_bronze_torc') {
    // Kelt altın boyun torku (Torc)
    const torc = new THREE.TorusGeometry(0.11, 0.018, 5, 8);
    torc.rotateX(82 * DEG);
    extras.push({
      geometry: torc,
      material: 'gold',
      joint: 'neck',
      position: [0, 0.01, 0.01],
    });
  }

  return { baseSet, culturalExtras: extras };
}

/**
 * Krallığa özel savaş atını (`Horse`) doğru cins, don rengi, ölçek ve zırhlı
 * haşa (barding/caparison) ile inşa eder.
 */
export function buildFactionHorse3D(
  horseDef: FactionHorseDef,
  lod: LodLevel = 'hero',
): Horse {
  return new Horse({
    faction: horseDef.faction,
    breed: horseDef.breed,
    coat: horseDef.coat,
    barding: horseDef.barding,
    caparison: horseDef.caparison,
    saddle: true,
    scale: horseDef.scale,
    lod,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   8. KALİBRE EDİLMİŞ `CharacterRig` & `WarHorseRig` ENTEGRASYONU
      (Sıfır İç İçe Girme · Gerçek 2-Bone IK Çift El Tutuş · Dinamik Yay)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Her silahın kendi yerel +Y ekseni üzerinde **sağ el avuç içinin (fist)**
 * tam kavradığı noktanın Y koordinatını döndürür.
 *
 * · Tek elli kılıç / şamşır: `y = -0.06` (siperin hemen altındaki deri kabza ortası)
 * · Çift elli kılıç / falx: `y = -0.055` (sağ el üst kabzada, sol el `lGrip = -0.11` ile `y = -0.165` alt kabzada!)
 * · Çift elli balta: `y = +0.08` (sağ el üst tutamakta, sol el `lGrip = -0.11` ile `y = -0.03` alt tutamakta!)
 * · Gönderli (Menavlion / Voulge / Glaive / Sovnya / Rhomphaia): `y = +0.06`
 *   (sağ el alt sapta `y = 0.06`, sol el `lGrip = +0.42` ile `y = +0.48` orta sapta!)
 * · Süvari kargısı (Kontos / Lance): `y = +0.18` (el siperi vamplate'in hemen arkası)
 */
export function getWeaponGripOffsetY(weapon: FactionWeaponDef): number {
  const arch = weapon.visualArchetype;
  if (
    arch === 'spatha' ||
    arch === 'thamaskene_spatha' ||
    arch === 'arming_sword' ||
    arch === 'bastard_sword' ||
    arch === 'royal_greatsword' ||
    arch === 'ulfberht' ||
    arch === 'varsheg_sword' ||
    arch === 'kaskara' ||
    arch === 'highland_sword' ||
    arch === 'claymore' ||
    arch === 'paramion' ||
    arch === 'steppe_sabre' ||
    arch === 'khan_scimitar' ||
    arch === 'sultan_scimitar' ||
    arch === 'falx'
  ) {
    return weapon.twoHanded ? -0.055 : -0.065;
  }
  if (arch === 'bearded_axe' || arch === 'tabarzin' || arch === 'pernach') {
    return 0.04;
  }
  if (arch === 'dane_axe') {
    return 0.08;
  }
  if (
    arch === 'kontos' ||
    arch === 'knight_lance' ||
    arch === 'steppe_lance' ||
    arch === 'faris_lance'
  ) {
    return 0.18;
  }
  if (arch === 'jereed') {
    return 0.36;
  }
  if (
    arch === 'menavlion' ||
    arch === 'voulge' ||
    arch === 'glaive' ||
    arch === 'sovnya' ||
    arch === 'rhomphaia'
  ) {
    return 0.06;
  }
  if (arch === 'crossbow') {
    return -0.08;
  }
  return 0.0;
}

/**
 * Sol el (`leftShieldSocket`) uzayında gerçek dinamik kirişli (`stringGeo`)
 * ve oklu (`nockedArrow`) krallık yayı (`BowParts`) üretir.
 */
export function buildFactionBowPartsForRig(
  weapon: FactionWeaponDef,
  rig: CharacterRig,
): BowParts {
  const isLongbow = weapon.visualArchetype === 'fian_longbow';
  const facInfo =
    ARSENAL_FACTIONS.find((f) => f.id === weapon.faction) ?? ARSENAL_FACTIONS[0];

  const woodMat = new THREE.MeshStandardMaterial({
    color: isLongbow ? '#6e4726' : '#3a2416',
    roughness: 0.65,
    metalness: 0.08,
    flatShading: true,
  });
  const hornMat = new THREE.MeshStandardMaterial({
    color: '#221c18',
    roughness: 0.45,
    metalness: 0.18,
    flatShading: true,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: facInfo.secondaryHex,
    roughness: 0.32,
    metalness: 0.82,
    flatShading: true,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: facInfo.accentHex,
    roughness: 0.78,
    metalness: 0.05,
    flatShading: true,
  });

  const group = new THREE.Group();
  group.name = 'Bow';
  group.position.set(0, -0.05, 0);

  // Orta kabza (riser) + altın bilezikler
  const riser = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.044, 0.16), gripMat);
  riser.castShadow = true;
  group.add(riser);

  for (const zOff of [-0.085, 0.085]) {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.022, 6), goldMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0, zOff);
    group.add(collar);
  }

  const brace = isLongbow ? 0.13 : 0.145;
  const tipZ = isLongbow ? 0.64 : 0.54;

  const limbSeg = (
    z0: number,
    y0: number,
    z1: number,
    y1: number,
    r0: number,
    r1: number,
    mat: THREE.Material,
  ) => {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const geo = new THREE.CylinderGeometry(r1, r0, len, 6);
    const seg = new THREE.Mesh(geo, mat);
    seg.castShadow = true;
    seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, y1 - y0, z1 - z0).normalize(),
    );
    return seg;
  };

  for (const s of [1, -1]) {
    if (isLongbow) {
      // Battanya Fian Porsuk Uzun Yayı
      group.add(limbSeg(0.08 * s, 0, 0.38 * s, -0.04, 0.02, 0.015, woodMat));
      group.add(limbSeg(0.38 * s, -0.04, tipZ * s, brace, 0.015, 0.009, woodMat));
      const nockTip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 5), hornMat);
      nockTip.position.set(0, brace, tipZ * s);
      nockTip.rotation.x = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(nockTip);
    } else {
      // Kuzait / Aseray / İmparatorluk Refleks Kompozit Yay (Siyah uçlu)
      group.add(limbSeg(0.08 * s, 0, 0.28 * s, -0.07, 0.021, 0.017, hornMat));
      group.add(limbSeg(0.28 * s, -0.07, 0.44 * s, 0.04, 0.017, 0.013, woodMat));
      group.add(limbSeg(0.44 * s, 0.04, tipZ * s, brace, 0.013, 0.009, goldMat));
    }
  }

  const restNock = new THREE.Vector3(0, brace, 0);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, brace, tipZ),
    restNock.clone(),
    new THREE.Vector3(0, brace, -tipZ),
  ]);
  const stringLine = new THREE.Line(
    stringGeo,
    new THREE.LineBasicMaterial({ color: '#f3ead8' }),
  );
  stringLine.frustumCulled = false;
  group.add(stringLine);

  // Ok (nockedArrow)
  const nockedArrow = new THREE.Group();
  nockedArrow.name = 'NockedArrow';
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.72, 5),
    rig.materials.wood,
  );
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.013, 0.055, 4),
    rig.materials.metal,
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.38;
  const fletchMat = new THREE.MeshStandardMaterial({
    color: facInfo.accentHex,
    flatShading: true,
  });
  const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.09), fletchMat);
  fletch.position.z = -0.31;
  nockedArrow.add(shaft, head, fletch);
  nockedArrow.visible = false;
  group.add(nockedArrow);

  return {
    group,
    stringGeo,
    restNock,
    arrowRest: new THREE.Vector3(0, -0.02, 0),
    nockedArrow,
  };
}

/**
 * Krallık kalkanını `CharacterRig.leftShieldSocket` üzerine **dik (+Y yukarı),
 * yüzü ileri (+Z normal) ve gövdeden güvenli mesafede (`SHIELD_REST_POSITION`)**
 * monte eder. `probe-equipment.ts` kriterlerinin tamamını (%100) sağlar.
 */
export function mountFactionShieldToRig(
  rig: CharacterRig,
  shieldDef: FactionWeaponDef,
  qualityId: ItemQualityId = 'STANDARD',
  lod: LodLevel = 'hero',
): THREE.Group {
  while (rig.leftShieldSocket.children.length > 0) {
    rig.leftShieldSocket.remove(rig.leftShieldSocket.children[0]);
  }

  const built = buildFactionWeapon3D(shieldDef, qualityId, lod);
  const body = built.group;
  body.scale.setScalar(0.74);

  const holder = new THREE.Group();
  holder.name = 'Shield';
  holder.position.set(...SHIELD_REST_POSITION);
  holder.rotation.set(...SHIELD_REST_ROTATION);
  holder.add(body);

  rig.leftShieldSocket.add(holder);
  rig.offHandItem = holder;
  rig.currentOptions.shieldType =
    shieldDef.visualArchetype === 'scutum'
      ? 'PAVISE'
      : shieldDef.visualArchetype === 'heater_shield'
        ? 'KITE_SHIELD'
        : 'ROUND_SHIELD';

  return holder;
}

/**
 * Krallık silahını `CharacterRig` üzerine doğru el soketi, doğru kabza merkezi
 * (`getWeaponGripOffsetY`) ve doğru `WeaponClass` (`1H`, `2H`, `SPEAR`, `BOW`)
 * ile monte eder.
 */
export function mountFactionWeaponToRig(
  rig: CharacterRig,
  weaponDef: FactionWeaponDef,
  qualityId: ItemQualityId = 'STANDARD',
  lod: LodLevel = 'hero',
): THREE.Object3D {
  if (weaponDef.kind === 'shield') {
    return mountFactionShieldToRig(rig, weaponDef, qualityId, lod);
  }

  while (rig.rightWeaponSocket.children.length > 0) {
    rig.rightWeaponSocket.remove(rig.rightWeaponSocket.children[0]);
  }

  if (weaponDef.kind === 'bow') {
    while (rig.leftShieldSocket.children.length > 0) {
      rig.leftShieldSocket.remove(rig.leftShieldSocket.children[0]);
    }
    const bowParts = buildFactionBowPartsForRig(weaponDef, rig);
    rig.leftShieldSocket.add(bowParts.group);
    rig.bow = bowParts;
    rig.offHandItem = bowParts.group;
    rig.mainHandItem = null;
    rig.currentOptions.weaponType = 'BOW';
    rig.currentOptions.shieldType = 'NONE';

    // Sırt sadağı (Quiver)
    while (rig.backSocket.children.length > 0) {
      rig.backSocket.remove(rig.backSocket.children[0]);
    }
    const quiver = new THREE.Group();
    quiver.name = 'Quiver';
    quiver.position.set(0.12, -0.04, 0);
    quiver.rotation.z = -0.35;
    const qBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.058, 0.54, 6),
      rig.materials.leather,
    );
    quiver.add(qBody);
    rig.backSocket.add(quiver);

    return bowParts.group;
  }

  const built = buildFactionWeapon3D(weaponDef, qualityId, lod);
  const gripY = getWeaponGripOffsetY(weaponDef);

  // Kabza merkezini (0, 0, 0)'a taşı, ardından +Y namlu/gövde eksenini elin +Z eksenine çevir:
  const gripAligned = new THREE.Group();
  built.group.position.set(0, -gripY, 0);
  gripAligned.add(built.group);
  gripAligned.rotation.x = Math.PI / 2;

  const holder = new THREE.Group();
  holder.name = 'MainWeapon';
  // Sağ el parmaklarının sardığı avuç merkezi: (0, -0.06, 0)
  holder.position.set(0, -0.06, 0);
  holder.add(gripAligned);

  rig.rightWeaponSocket.add(holder);
  rig.mainHandItem = holder;

  // Animator'ın doğru 2-bone IK duruşunu seçmesi için weaponType eşlemesi:
  if (
    weaponDef.kind === 'polearm_cleave' ||
    weaponDef.kind === 'cavalry_lance' ||
    weaponDef.kind === 'javelin'
  ) {
    rig.currentOptions.weaponType = 'SPEAR';
  } else if (weaponDef.twoHanded) {
    rig.currentOptions.weaponType = 'TWO_HANDED_SWORD';
  } else {
    rig.currentOptions.weaponType = 'ONE_HANDED_SWORD';
  }

  return holder;
}

/**
 * `CharacterRig` üzerine **hiçbir uzuv veya çeneyle iç içe girmeyen**,
 * gövde Lathe profilini (`PROFILE` + `frontZ`) milimetrik takip eden
 * 6 krallık zırhını ve kalibre edilmiş miğferini giydirir.
 */
export function applyFactionArmorToRig(
  rig: CharacterRig,
  armorDef: FactionArmorDef,
  qualityId: ItemQualityId = 'STANDARD',
): void {
  const facInfo =
    ARSENAL_FACTIONS.find((f) => f.id === armorDef.faction) ?? ARSENAL_FACTIONS[0];
  const qMod = ITEM_QUALITY_MODIFIERS[qualityId] ?? ITEM_QUALITY_MODIFIERS.STANDARD;
  const polishFactor = (qMod.damageMultiplier - 1.0) * 0.6;

  // 1) Ana materyal renklerini krallık ve kaliteye göre güncelle:
  rig.materials.faction.color.set(facInfo.accentHex);
  rig.materials.cloth.color.set(facInfo.accentHex);
  rig.materials.padded.color.set(
    armorDef.faction === 'aserai'
      ? '#c8ab73'
      : armorDef.faction === 'khuzait'
        ? '#6b4c30'
        : '#524436',
  );
  rig.materials.leather.color.set('#472e1b');
  rig.materials.gold.color.set(facInfo.secondaryHex);
  rig.materials.metal.color.set(
    armorDef.armorClass === 'heavy'
      ? '#adb6c2'
      : armorDef.armorClass === 'medium'
        ? '#9da5ae'
        : '#848c96',
  );
  rig.materials.metal.roughness = Math.max(
    0.16,
    Math.min(0.75, 0.36 - polishFactor),
  );
  rig.materials.metal.metalness = Math.max(
    0.45,
    Math.min(0.95, 0.78 + polishFactor),
  );

  // 2) Temel kalibre zırh katmanını (`LEATHER` / `CHAINMAIL` / `PLATE`) oluştur:
  const baseTier: RigArmorTier =
    armorDef.armorClass === 'heavy'
      ? 'PLATE'
      : armorDef.armorClass === 'medium'
        ? 'CHAINMAIL'
        : 'LEATHER';

  applyEquipmentToRig(rig, {
    ...rig.currentOptions,
    factionColor: facInfo.accentHex,
    factionId: armorDef.faction,
    armorTier: baseTier,
    helmetType: 'NONE', // Miğferi aşağıda krallığa özel kalibre edilmiş olarak kuracağız
  });

  // 3) Gövde kabuğu (`armorChest`) üzerine krallığa özel dış katmanları ekle:
  const chestGroup = rig.chestArmorSocket.getObjectByName('armorChest') as THREE.Group | undefined;
  if (chestGroup) {
    const PROFILE: Array<[number, number]> = [
      [-0.24, 0.176],
      [-0.16, 0.183],
      [-0.06, 0.192],
      [0.04, 0.198],
      [0.12, 0.201],
      [0.18, 0.203],
      [0.21, 0.204],
      [0.225, 0.182],
    ];
    const radiusAt = (y: number) => {
      if (y <= PROFILE[0][0]) return PROFILE[0][1];
      for (let i = 1; i < PROFILE.length; i++) {
        const [y1, r1] = PROFILE[i];
        if (y <= y1) {
          const [y0, r0] = PROFILE[i - 1];
          const t = (y - y0) / (y1 - y0 || 1);
          return r0 + (r1 - r0) * t;
        }
      }
      return PROFILE[PROFILE.length - 1][1];
    };
    const DEPTH = TORSO_DEPTH_SCALE + 0.02;
    const basePad = baseTier === 'PLATE' ? 0.028 : baseTier === 'CHAINMAIL' ? 0.02 : 0.016;
    const frontZ = (y: number, out = 0.006) => (radiusAt(y) + basePad + out) * DEPTH;

    const trimMat = rig.materials.gold;
    const factionMat = rig.materials.faction;
    const darkLeatherMat = new THREE.MeshStandardMaterial({
      color: '#2c1d12',
      roughness: 0.85,
      flatShading: true,
    });

    if (armorDef.faction === 'empire') {
      // İmparatorluk: yatay pirinç/çelik lorica kuşakları + belde pteruges deri şeritleri + mor kuşak
      for (const y of [-0.14, -0.04, 0.06, 0.15]) {
        const r = radiusAt(y) + basePad + 0.004;
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(r, r, 0.018, 10, 1, true),
          trimMat,
        );
        band.position.y = y;
        band.scale.z = DEPTH;
        chestGroup.add(band);
      }
      // Pteruges (bel çevresinde deri ve altın uçlu şeritler)
      const stripCount = 10;
      for (let i = 0; i < stripCount; i++) {
        const ang = (i / stripCount) * TAU;
        const rx = Math.sin(ang) * 0.215;
        const rz = Math.cos(ang) * 0.215 * DEPTH;
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.036, 0.13, 0.01),
          i % 2 === 0 ? factionMat : darkLeatherMat,
        );
        strip.position.set(rx, -0.24, rz);
        strip.rotation.y = ang;
        chestGroup.add(strip);
      }
    } else if (armorDef.faction === 'vlandia') {
      // Vlandiya: gövdeyi saran heraldik Surcoat tabard + altın aslan arması + şövalye kemeri
      if (armorDef.surcoat) {
        const surcoatPts = PROFILE.slice(0, 6).map(
          ([y, r]) => new THREE.Vector2(r + basePad + 0.005, y),
        );
        const surcoatGeo = new THREE.LatheGeometry(surcoatPts, 10);
        const surcoatMesh = new THREE.Mesh(surcoatGeo, factionMat);
        surcoatMesh.scale.z = DEPTH;
        chestGroup.add(surcoatMesh);
      }
      const shieldCrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.095, 0.012),
        trimMat,
      );
      shieldCrest.position.set(0, 0.08, frontZ(0.08, 0.01));
      chestGroup.add(shieldCrest);

      // Omuz rondelleri (besagews)
      if (armorDef.tier >= 4) {
        for (const [sock, side] of [
          [rig.leftPauldronSocket, 1],
          [rig.rightPauldronSocket, -1],
        ] as const) {
          const rondel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.044, 0.044, 0.012, 8),
            trimMat,
          );
          rondel.rotation.x = Math.PI / 2;
          rondel.position.set(side * 0.02, 0.01, 0.082);
          sock.add(rondel);
        }
      }
    } else if (armorDef.faction === 'sturgia') {
      // Sturgiya: omuz ve sırtı saran kuzey kürk yakası (ön boğazı kapatmaz) + Nord göğüs broşları
      const furMat = new THREE.MeshStandardMaterial({
        color: '#3b2b20',
        roughness: 0.94,
        flatShading: true,
      });
      const furMantle = new THREE.Mesh(
        new THREE.TorusGeometry(0.165, 0.032, 6, 10, Math.PI * 0.76),
        furMat,
      );
      furMantle.rotation.x = -Math.PI / 2;
      furMantle.rotation.z = Math.PI * 0.12;
      furMantle.scale.y = DEPTH;
      furMantle.position.set(0, 0.195, -0.015);
      chestGroup.add(furMantle);

      for (const side of [-1, 1]) {
        const brooch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.026, 0.012, 8),
          trimMat,
        );
        brooch.rotation.x = Math.PI / 2;
        brooch.position.set(side * 0.075, 0.12, frontZ(0.12, 0.01));
        chestGroup.add(brooch);
      }
    } else if (armorDef.faction === 'khuzait') {
      // Kuzait: bozkır lamel kuşakları + göğüs ortasında altın ayna (Toli)
      const mirror = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.014, 10),
        trimMat,
      );
      mirror.rotation.x = Math.PI / 2;
      mirror.position.set(0, 0.07, frontZ(0.07, 0.01));
      chestGroup.add(mirror);

      for (const y of [-0.12, -0.02, 0.08]) {
        const r = radiusAt(y) + basePad + 0.004;
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(r, r, 0.016, 10, 1, true),
          factionMat,
        );
        band.position.y = y;
        band.scale.z = DEPTH;
        chestGroup.add(band);
      }
    } else if (armorDef.faction === 'aserai') {
      // Aseray: Memlük altın/pirinç göğüs aynaları (Kardaha) + turkuaz ipek bel kuşağı
      const sashR = radiusAt(-0.1) + basePad + 0.008;
      const sash = new THREE.Mesh(
        new THREE.CylinderGeometry(sashR, sashR, 0.055, 10, 1, true),
        factionMat,
      );
      sash.position.y = -0.1;
      sash.scale.z = DEPTH;
      chestGroup.add(sash);

      const pectoral = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.058, 0.014, 8),
        trimMat,
      );
      pectoral.rotation.x = Math.PI / 2;
      pectoral.position.set(0, 0.09, frontZ(0.09, 0.01));
      chestGroup.add(pectoral);
    } else if (armorDef.faction === 'battania') {
      // Battanya: çapraz ekose (plaid) şal + Kelt altın boyun torku + kurt postu omuz
      const plaidStrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.34, 0.016),
        factionMat,
      );
      plaidStrap.position.set(0.04, 0.03, frontZ(0.03, 0.01));
      plaidStrap.rotation.z = 0.42;
      chestGroup.add(plaidStrap);

      const torc = new THREE.Mesh(
        new THREE.TorusGeometry(0.108, 0.012, 5, 10),
        trimMat,
      );
      torc.rotation.x = Math.PI / 2;
      torc.scale.y = DEPTH;
      torc.position.set(0, 0.208, -0.005);
      chestGroup.add(torc);
    }
  }

  // 4) Krallığa özel kalibre miğferi `helmetSocket` üzerine kur:
  const helmetGroup = buildCalibratedFactionHelmet(armorDef, rig);
  rig.helmetSocket.add(helmetGroup);

  // Saç/sakal görünürlüğü: tam kapalı miğferlerde saç/sakal dışarı taşmasın
  const isFullClosedHelm =
    armorDef.helmStyle === 'greatHelm' ||
    armorDef.culturalCrest === 'imperial_plume_mask' ||
    armorDef.culturalCrest === 'vlandian_crowned_helm';
  if (rig.hairGroup) rig.hairGroup.visible = false;
  if (rig.beardMesh) {
    rig.beardMesh.visible = !isFullClosedHelm && !!rig.currentOptions.hasBeard;
  }

  // 5) Çene ile yaka/göğüs zırhı arasında en az 2-3 cm boşluk bırak (`refitArmorToHead`):
  refitArmorToHead(rig);
}

/**
 * `HEAD = { r: 0.125, sy: 1.12, sz: 1.05, cy: 0.14 }` kafatası elipsoidine
 * %100 kalibre edilmiş krallık miğferi üretir.
 * Göz hizası `helmetSocket` yerel uzayında `y = 0.0` noktasındadır.
 */
function buildCalibratedFactionHelmet(
  armorDef: FactionArmorDef,
  rig: CharacterRig,
): THREE.Group {
  const { metal, gold, faction, leather } = rig.materials;
  const g = new THREE.Group();
  g.name = `FactionHelmet_${armorDef.id}`;

  const style = armorDef.helmStyle;
  const crest = armorDef.culturalCrest;

  // ── A. TAM KAPALI MİĞFERLER (Katafrakt Maskeli & Vlandiya Great Helm) ──
  if (
    style === 'greatHelm' ||
    crest === 'imperial_plume_mask' ||
    crest === 'vlandian_crowned_helm'
  ) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.133, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.46),
      metal,
    );
    dome.scale.set(1, 1.12, 1.06);
    dome.position.y = 0.012;

    const browBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.142, 0.05, 12),
      crest === 'vlandian_crowned_helm' ? gold : metal,
    );
    browBand.scale.z = 1.05;
    browBand.position.y = 0.043;

    const slitMat = new THREE.MeshBasicMaterial({ color: '#0a0908' });
    const eyeSlit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1355, 0.1355, 0.03, 12),
      slitMat,
    );
    eyeSlit.scale.z = 1.05;
    eyeSlit.position.y = 0.0;
    eyeSlit.name = 'visorEyeSlit';

    const jawBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.139, 0.106, 0.15, 12),
      metal,
    );
    jawBand.scale.z = 1.05;
    jawBand.position.y = -0.091;

    const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.088, 0.014), gold);
    nasal.position.set(0, 0.002, 0.14);

    const aventail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.104, 0.116, 0.085, 12, 1, true),
      metal,
    );
    aventail.scale.z = 1.02;
    aventail.position.set(0, -0.145, -0.01);

    g.add(dome, browBand, eyeSlit, jawBand, nasal, aventail);

    if (crest === 'imperial_plume_mask') {
      // İmparatorluk Katafrakt mor/altın tepelik sorgucu
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.032, 0.16), gold);
      ridge.position.set(0, 0.154, -0.01);
      const plume = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.055, 0.14), faction);
      plume.position.set(0, 0.185, -0.02);
      g.add(ridge, plume);
    } else if (crest === 'vlandian_crowned_helm') {
      // Vlandiya Kraliyet Tacı
      const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.012, 5, 10), gold);
      crownRing.rotation.x = Math.PI / 2;
      crownRing.position.y = 0.085;
      g.add(crownRing);
    }
    return g;
  }

  // ── B. ŞAPKA TİPİ SİPERLİKLİ MİĞFER (Kettle Hat — gözü kapatmaz, y > 0.02) ──
  if (style === 'kettle') {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(HEAD.r + 0.016, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48),
      metal,
    );
    dome.scale.set(1, HEAD.sy * 0.9, HEAD.sz);
    dome.position.y = 0.025;

    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.215, 0.016, 12),
      metal,
    );
    brim.scale.set(1, 1, HEAD.sz);
    brim.position.y = 0.032; // Göz hizasının (0.0) üstünde!

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(HEAD.r + 0.018, HEAD.r + 0.018, 0.022, 10),
      gold,
    );
    band.scale.set(1, 1, HEAD.sz);
    band.position.y = 0.044;

    g.add(dome, brim, band);
    return g;
  }

  // ── C. AÇIK YÜZLÜ KONİK / SPANGENHELM / SARIKLI / BOZKIR / KELT MİĞFERLERİ ──
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(HEAD.r + 0.016, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45),
    armorDef.armorClass === 'light' ? leather : metal,
  );
  dome.scale.set(1, HEAD.sy * 0.88, HEAD.sz);
  dome.position.y = 0.022;

  const browBand = new THREE.Mesh(
    new THREE.CylinderGeometry(HEAD.r + 0.02, HEAD.r + 0.02, 0.03, 10),
    gold,
  );
  browBand.scale.set(1, 1, HEAD.sz);
  browBand.position.y = 0.032; // Gözlerin (y = 0.0) üstünde durur, gözleri asla kapatmaz!

  // Ense zincir koruması (yalnız arka enseyi sarar, boyun yanlarından dışa taşmaz)
  const napeMail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.122, 0.112, 0.085, 10, 1, true, Math.PI * 0.62, Math.PI * 0.76),
    metal,
  );
  napeMail.scale.set(1, 1, HEAD.sz);
  napeMail.position.set(0, -0.035, -0.008);

  g.add(dome, browBand, napeMail);

  if (style === 'spangen' || crest === 'sturgian_gjermundbu') {
    // İnce burun demiri (burun köprüsüne oturur, dudak önüne sarkmaz)
    const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.062, 0.014), metal);
    nasal.position.set(0, 0.002, (HEAD.r + 0.015) * HEAD.sz);
    nasal.rotation.x = -0.06;
    g.add(nasal);
  }

  if (crest === 'imperial_legion_crest') {
    const holder = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.028, 0.14), gold);
    holder.position.set(0, 0.15, 0);
    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.16), faction);
    plume.position.set(0, 0.18, 0);
    g.add(holder, plume);
  } else if (crest === 'aserai_turban_wrap' || crest === 'aserai_golden_collar') {
    // Aseray sarığı: alın bandının (y = 0.055) etrafını sarar, gözlerin üstündedir
    const turban = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.032, 6, 12), faction);
    turban.rotation.x = Math.PI / 2;
    turban.scale.set(1, 1.05, 1);
    turban.position.set(0, 0.055, 0);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.055, 6), gold);
    spike.position.set(0, 0.165, 0);
    g.add(turban, spike);
  } else if (crest === 'khuzait_horsehair_tail' || crest === 'khuzait_mirror_disc') {
    // Kuzait tolga tepeliği ve arkaya sarkan at kılı tuğu
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 6), gold);
    finial.position.set(0, 0.165, 0);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.15, 6), faction);
    plume.rotation.x = -0.45;
    plume.position.set(0, 0.13, -0.075);
    g.add(finial, plume);
  } else if (crest === 'battanian_wolf_pelt' || crest === 'battanian_bronze_torc') {
    // Battanya Kelt tacı / kanat kabartmaları
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.075, 4), gold);
      wing.position.set(side * 0.135, 0.075, 0.01);
      wing.rotation.z = side * -0.35;
      g.add(wing);
    }
  }

  return g;
}

/**
 * Oyunun gerçek savaş atı iskeleti (`WarHorseRig`, +Z yönüne bakan,
 * `updateWarHorseAnimation` ve `applyRiderMountedPosture` ile %100 uyumlu)
 * üzerinde krallığa özel cins, don rengi ve haşa/zırh (barding) inşa eder.
 */
export function buildFactionWarHorseRig(
  horseDef: FactionHorseDef,
  qualityId: ItemQualityId = 'STANDARD',
): WarHorseRig {
  const coatHexMap: Record<CoatColor, { coat: string; mane: string }> = {
    bay: { coat: '#63371e', mane: '#1a120d' },
    black: { coat: '#1e1d21', mane: '#0f0e11' },
    chestnut: { coat: '#8a431d', mane: '#3d1c0a' },
    grey: { coat: '#9ca3af', mane: '#374151' },
    dun: { coat: '#b28b5a', mane: '#261a11' },
    palomino: { coat: '#d4a359', mane: '#f3ead8' },
  };
  const colors = coatHexMap[horseDef.coat] ?? coatHexMap.bay;
  const facInfo =
    ARSENAL_FACTIONS.find((f) => f.id === horseDef.faction) ?? ARSENAL_FACTIONS[0];
  const isArmored = horseDef.barding || horseDef.caparison;

  const horseRig = createWarHorseRig({
    coatColor: colors.coat,
    maneColor: colors.mane,
    factionColor: facInfo.accentHex,
    armoredBarding: isArmored,
  });

  // Cins (breed) ve kaliteye göre gövde/boyun orantılarını özelleştir:
  const qMod = ITEM_QUALITY_MODIFIERS[qualityId] ?? ITEM_QUALITY_MODIFIERS.STANDARD;
  const polishFactor = (qMod.damageMultiplier - 1.0) * 0.5;
  const s = horseDef.scale;
  if (horseDef.breed === 'steppe') {
    horseRig.root.scale.set(s * 0.96, s * 0.92, s * 0.98);
  } else if (horseDef.breed === 'destrier') {
    horseRig.root.scale.set(s * 1.05, s * 1.04, s * 1.05);
  } else {
    horseRig.root.scale.setScalar(s);
  }

  // Ağır Katafrakt / Kraliyet Destrier zırhı için boyun (crinet) ve sağrı plakaları ekle:
  if (horseDef.barding) {
    const bardingMat = new THREE.MeshStandardMaterial({
      color:
        horseDef.faction === 'aserai' || horseDef.faction === 'empire'
          ? facInfo.secondaryHex
          : '#9aa3ad',
      roughness: Math.max(0.2, 0.35 - polishFactor),
      metalness: 0.8,
      flatShading: true,
    });
    const crinet = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.54, 0.14), bardingMat);
    crinet.position.set(0, 0.28, 0.22);
    horseRig.neck.add(crinet);

    const croupArmor = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 0.52), bardingMat);
    croupArmor.position.set(0, 0.06, -0.52);
    horseRig.body.add(croupArmor);
  }

  return horseRig;
}

/* ═══════════════════════════════════════════════════════════════════════
   9. SORGU YARDIMCILARI
   ═══════════════════════════════════════════════════════════════════════ */

export function getWeaponsByFaction(faction: ArsenalFactionId): FactionWeaponDef[] {
  return FACTION_WEAPONS.filter((w) => w.faction === faction);
}

export function getArmorsByFaction(faction: ArsenalFactionId): FactionArmorDef[] {
  return FACTION_ARMORS.filter((a) => a.faction === faction);
}

export function getHorsesByFaction(faction: ArsenalFactionId): FactionHorseDef[] {
  return FACTION_HORSES.filter((h) => h.faction === faction);
}

export function getArsenalWeaponById(id: string): FactionWeaponDef | undefined {
  return FACTION_WEAPONS.find((w) => w.id === id);
}

export function getArsenalArmorById(id: string): FactionArmorDef | undefined {
  return FACTION_ARMORS.find((a) => a.id === id);
}

export function getArsenalHorseById(id: string): FactionHorseDef | undefined {
  return FACTION_HORSES.find((h) => h.id === id);
}

