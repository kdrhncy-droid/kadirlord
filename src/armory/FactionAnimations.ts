/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BANNERFORGE ENGINE · FactionAnimations.ts
 *  6 Krallık Silah, Kalkan Duvarı, Süvari Kargısı ve Okçuluk Animasyonları
 *
 *  Bu modül, oyunun gerçek 2-eklemli analitik IK (`solveTwoBoneIK` + `orientHand`)
 *  kullanan `CharacterAnimator` (`src/game/characterAnimator.ts`) motoruna
 *  doğrudan `ClipDef` olarak kaydolur:
 *    · Çift elli kılıç/baltalarda (`2H`) sol el `lGrip = -0.11` ile kabzanın alt
 *      boğumunu iki elle gerçekten kavrar.
 *    · Gönderli silahlarda (`SPEAR`, kalkansız) sol el `lGrip = +0.42` ile
 *      mızrak/glaive gövdesini ileriden iki elle kavrar.
 *    · Kalkan + Mızrak/Kılıç kombinasyonlarında sol el `SHIELD_CARRY` IK hedefiyle
 *      kalkanı göğsün önünde dik ve gövdeye değmeden tutar.
 *    · Yaylarda (`BOW`) sol el yayı hedefe doğrulturken sağ el kirişi ve oku
 *      çeneye kadar gerçek zamanlı gerer.
 *    · Atlı birliklerde `updateWarHorseAnimation` + `applyRiderMountedPosture`
 *      ile dört zamanlı dörtnal ve üzengi oturuşu tam senkron çalışır.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  CharacterAnimator,
  registerCustomClip,
  type ClipDef,
  type WeaponClass,
} from '../game/characterAnimator.ts';
import {
  applyRiderMountedPosture,
  updateWarHorseAnimation,
  type CharacterRig,
  type WarHorseRig,
} from '../game/characterRig.ts';

export type FactionAnimationId =
  | 'idle'
  | 'ready'
  | 'mountedIdle'
  | 'walk'
  | 'run'
  | 'attackSlash'
  | 'attackSword'
  | 'attackAxe'
  | 'attackThrust'
  | 'block'
  | 'shootBow'
  | 'cavalryTrot'
  | 'salute'
  // Yeni eklenen krallık & silah sınıfı animasyonları:
  | 'attackTwoHandedCleave'
  | 'attackPolearmSweep'
  | 'attackCouchedLance'
  | 'attackMaceCrush'
  | 'attackSabreSlash'
  | 'shieldWallBrace'
  | 'crossbowAimFire'
  | 'javelinThrow'
  | 'weaponFlourish'
  | 'cavalryGallop'
  | 'horseChargeGallop'
  | 'horseRear';

export interface FactionAnimMeta {
  id: FactionAnimationId;
  nameTr: string;
  categoryTr: string;
  durationSec: number;
  loop: boolean;
  recommendedFor: string[];
  descriptionTr: string;
}

export const FACTION_ANIMATION_META: FactionAnimMeta[] = [
  {
    id: 'idle',
    nameTr: 'Nöbet Duruşu (Hazır)',
    categoryTr: 'Temel',
    durationSec: 2.4,
    loop: true,
    recommendedFor: ['all'],
    descriptionTr: 'Nefes alıp verme, ağırlık aktarma ve silah sınıfına özel çift el/kalkan IK hazır duruşu.',
  },
  {
    id: 'walk',
    nameTr: 'Devriye Yürüyüşü',
    categoryTr: 'Hareket',
    durationSec: 1.1,
    loop: true,
    recommendedFor: ['all'],
    descriptionTr: 'Doğal adım döngüsü ve silah taşıma salınımı.',
  },
  {
    id: 'run',
    nameTr: 'Hücum Koşusu',
    categoryTr: 'Hareket',
    durationSec: 0.72,
    loop: true,
    recommendedFor: ['all'],
    descriptionTr: 'Meydan muharebesi taarruz koşusu.',
  },
  {
    id: 'attackSlash',
    nameTr: 'Tek El Kılıç Savurma',
    categoryTr: 'Yakın Dövüş',
    durationSec: 0.95,
    loop: true,
    recommendedFor: ['sword_1h', 'axe_1h'],
    descriptionTr: 'Spatha, Arming Sword, Ulfberht ve Kaskara için omuzdan çapraz kesik.',
  },
  {
    id: 'attackSabreSlash',
    nameTr: 'Eğri Kılıç / Şamşır Biçme',
    categoryTr: 'Yakın Dövüş',
    durationSec: 0.88,
    loop: true,
    recommendedFor: ['sabre_1h', 'scimitar'],
    descriptionTr: 'Kuzait İld, Aseray Şamşırı ve İmparatorluk Paramion için bilekten akıcı kavisli kesik.',
  },
  {
    id: 'attackTwoHandedCleave',
    nameTr: 'Çift El Yarma (2-Bone IK Çift El)',
    categoryTr: 'Ağır Silah',
    durationSec: 1.05,
    loop: true,
    recommendedFor: ['sword_2h', 'axe_2h', 'falx_2h'],
    descriptionTr: 'Her iki el kabzaya IK ile kilitli; Greatsword, Dane Axe, Cellat Baltası ve Falx için baş üstü yarma.',
  },
  {
    id: 'attackPolearmSweep',
    nameTr: 'Gönderli Tırpan / Biçme (2-Bone IK Çift El)',
    categoryTr: 'Gönderli',
    durationSec: 1.08,
    loop: true,
    recommendedFor: ['polearm_cut', 'polearm_thrust'],
    descriptionTr: 'Sol el mızrak gövdesini 42 cm ileriden kavrar; Menavlion, Voulge, Glaive ve Rhomphaia için geniş tırpan.',
  },
  {
    id: 'attackThrust',
    nameTr: 'Mızrak / Kılıç Saplama',
    categoryTr: 'Gönderli & Kılıç',
    durationSec: 0.85,
    loop: true,
    recommendedFor: ['polearm_thrust', 'sword_1h'],
    descriptionTr: 'Kalkan arkasından veya çift elle ileriye delici saplama.',
  },
  {
    id: 'attackCouchedLance',
    nameTr: 'Koltuklanmış Süvari Kargısı (Couched Lance)',
    categoryTr: 'Süvari',
    durationSec: 1.2,
    loop: true,
    recommendedFor: ['cavalry_lance'],
    descriptionTr: 'Katafrakt Kontos, Vlandiya Şövalye Kargısı ve Faris Kargısı için koltuk altı kilitli taarruz.',
  },
  {
    id: 'attackMaceCrush',
    nameTr: 'Gürz & Balta Zırh Kırma',
    categoryTr: 'Ağır Darbe',
    durationSec: 0.9,
    loop: true,
    recommendedFor: ['mace_1h', 'axe_1h'],
    descriptionTr: 'İmparatorluk Pernach Gürzü, Tabarzin ve Sakallı Balta için yukarıdan sert zırh ezme darbesi.',
  },
  {
    id: 'shieldWallBrace',
    nameTr: 'Kalkan Duvarı Siperi (Shield Wall)',
    categoryTr: 'Savunma',
    durationSec: 1.6,
    loop: true,
    recommendedFor: ['shield', 'sword_1h', 'axe_1h', 'polearm_thrust'],
    descriptionTr: 'Huskarl, Lejyoner ve Çavuşlar için kalkanı göğüs önünde dik kenetleyip mızrak/kılıç hazırlama.',
  },
  {
    id: 'shootBow',
    nameTr: 'Yay Germe ve Ok Atışı (Dinamik Kiriş + Ok)',
    categoryTr: 'Menzilli',
    durationSec: 1.35,
    loop: true,
    recommendedFor: ['bow'],
    descriptionTr: 'Sol el yayı tutar, sağ el kirişi ve oku çeneye kadar gerip bırakır.',
  },
  {
    id: 'crossbowAimFire',
    nameTr: 'Arbalet Nişan & Atış',
    categoryTr: 'Menzilli',
    durationSec: 1.45,
    loop: true,
    recommendedFor: ['crossbow'],
    descriptionTr: 'Vlandiya Ağır Arbaleti ile omuzdan iki elle nişan alma, tetik tepmesi ve kurma.',
  },
  {
    id: 'javelinThrow',
    nameTr: 'Cirit (Jereed) Fırlatma',
    categoryTr: 'Menzilli',
    durationSec: 1.0,
    loop: true,
    recommendedFor: ['throwing_javelin'],
    descriptionTr: 'Aseray Ciriti (Jereed) için geriye esneyip adım alarak omuz üstü fırlatma.',
  },
  {
    id: 'weaponFlourish',
    nameTr: 'Zafer / Kılıç Gösterisi (Flourish)',
    categoryTr: 'Tören & Lord',
    durationSec: 1.4,
    loop: true,
    recommendedFor: ['sword_1h', 'sabre_1h', 'sword_2h'],
    descriptionTr: 'Lordlar ve hükümdarlar için kılıcı göğüs önünde 8 çizerek çevirme ve selam.',
  },
  {
    id: 'salute',
    nameTr: 'Askerî Selam',
    categoryTr: 'Tören & Lord',
    durationSec: 1.5,
    loop: true,
    recommendedFor: ['all'],
    descriptionTr: 'Sancak ve komutan önünde resmi kılıç/göğüs selamı.',
  },
  {
    id: 'cavalryGallop',
    nameTr: 'Ağır Süvari Dörtnal Hücumu',
    categoryTr: 'Süvari',
    durationSec: 0.9,
    loop: true,
    recommendedFor: ['cavalry_lance', 'bow', 'sabre_1h'],
    descriptionTr: 'Binek üzerinde dört zamanlı dörtnal ritmiyle uyumlu süvari taarruz duruşu.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   1. GERÇEK 2-BONE IK CLIP TANIMLARI (`CharacterAnimator` İÇİN)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Not: `2H` ve `SPEAR` kliplerinde `l` (sol el) anahtarlanmaz; böylece
 * `CharacterAnimator.evalStance` içindeki `lGrip` (-0.11 veya +0.42) aktif
 * kalır ve `solveHand('l')` sol eli silahın kabzasına/gövdesine 2-bone IK ile
 * otomatik kilitler!
 */
export const FACTION_IK_CLIPS: Record<string, ClipDef> = {
  attackSlash: {
    name: 'attackSlash',
    label: '⚔️ Tek El Kılıç Savurma',
    kind: 'attack',
    duration: 0.95,
    hitTime: 0.5,
    fadeIn: 0.14,
    fadeOut: 0.24,
    keys: [
      {
        t: 0.28,
        body: { torso: [0, -0.68, 0], pelvis: [0, -0.2, 0] },
        r: { p: [-0.52, 1.62, -0.08], z: [-0.55, 0.45, -0.7], pole: [-0.4, -0.5, -0.8] },
      },
      {
        t: 0.44,
        body: { torso: [0.06, -0.22, 0] },
        r: { p: [-0.38, 1.48, 0.38], z: [-0.55, 0.2, 0.78] },
      },
      {
        t: 0.54,
        body: { torso: [0.14, 0.16, 0], pelvis: [0, 0.08, 0] },
        r: { p: [-0.08, 1.38, 0.52], z: [0.18, 0.04, 0.98] },
      },
      {
        t: 0.74,
        body: { torso: [0.1, 0.44, 0], pelvis: [0, 0.14, 0] },
        r: { p: [0.22, 1.28, 0.38], z: [0.88, -0.12, 0.42] },
      },
    ],
  },

  attackSabreSlash: {
    name: 'attackSabreSlash',
    label: '🌙 Eğri Kılıç / Şamşır Biçme',
    kind: 'attack',
    duration: 0.88,
    hitTime: 0.46,
    fadeIn: 0.12,
    fadeOut: 0.22,
    keys: [
      {
        t: 0.24,
        body: { torso: [-0.06, -0.62, 0.05], pelvis: [0, -0.22, 0] },
        r: { p: [-0.46, 1.72, -0.06], z: [-0.48, 0.55, -0.68], pole: [-0.5, -0.4, -0.8] },
      },
      {
        t: 0.42,
        body: { torso: [0.1, -0.1, -0.04] },
        r: { p: [-0.26, 1.46, 0.46], z: [-0.25, 0.12, 0.96] },
      },
      {
        t: 0.52,
        body: { torso: [0.14, 0.32, -0.06], pelvis: [0, 0.14, 0] },
        r: { p: [0.08, 1.32, 0.50], z: [0.55, -0.08, 0.82] },
      },
      {
        t: 0.72,
        body: { torso: [0.08, 0.48, 0], pelvis: [0, 0.18, 0] },
        r: { p: [0.26, 1.22, 0.34], z: [0.9, -0.2, 0.38] },
      },
    ],
  },

  attackTwoHandedCleave: {
    name: 'attackTwoHandedCleave',
    label: '🗡️ Çift El Yarma (2-Bone IK)',
    kind: 'attack',
    duration: 1.05,
    hitTime: 0.54,
    fadeIn: 0.16,
    fadeOut: 0.26,
    keys: [
      {
        t: 0.32,
        body: { torso: [-0.18, -0.42, 0], pelvis: [0, -0.16, 0] },
        r: { p: [-0.22, 1.96, -0.08], z: [-0.18, -0.35, -0.92], pole: [-0.7, 0.35, -0.5] },
      },
      {
        t: 0.46,
        body: { torso: [0.08, -0.08, 0] },
        r: { p: [-0.12, 1.78, 0.38], z: [-0.08, 0.82, 0.56] },
      },
      {
        t: 0.56,
        body: { torso: [0.34, 0.18, 0], pelvis: [0.06, 0.08, 0] },
        pelvisPos: [0, -0.04, 0.06],
        r: { p: [0.02, 1.24, 0.50], z: [0.18, -0.42, 0.88] },
      },
      {
        t: 0.8,
        body: { torso: [0.24, 0.32, 0], pelvis: [0.04, 0.12, 0] },
        r: { p: [0.14, 1.08, 0.38], z: [0.42, -0.68, 0.6] },
      },
    ],
  },

  attackPolearmSweep: {
    name: 'attackPolearmSweep',
    label: '🔱 Gönderli Tırpan / Biçme (2-Bone IK)',
    kind: 'attack',
    duration: 1.08,
    hitTime: 0.52,
    fadeIn: 0.16,
    fadeOut: 0.28,
    keys: [
      {
        t: 0.3,
        body: { torso: [-0.06, -0.58, 0], pelvis: [0, -0.22, 0] },
        r: { p: [-0.36, 1.36, -0.14], z: [-0.42, 0.22, 0.88] },
      },
      {
        t: 0.48,
        body: { torso: [0.12, 0.08, 0], pelvis: [0.04, 0.06, 0] },
        pelvisPos: [0, -0.03, 0.06],
        r: { p: [-0.12, 1.28, 0.38], z: [0.18, 0.08, 0.98] },
      },
      {
        t: 0.62,
        body: { torso: [0.14, 0.36, 0], pelvis: [0.04, 0.14, 0] },
        r: { p: [0.08, 1.24, 0.34], z: [0.58, 0.04, 0.81] },
      },
      {
        t: 0.84,
        body: { torso: [0.06, 0.12, 0] },
        r: { p: [-0.08, 1.20, 0.20], z: [0.32, 0.08, 0.94] },
      },
    ],
  },

  attackThrust: {
    name: 'attackThrust',
    label: '🔱 Mızrak / Kılıç Saplama',
    kind: 'attack',
    duration: 0.85,
    hitTime: 0.44,
    fadeIn: 0.14,
    fadeOut: 0.24,
    keys: [
      {
        t: 0.26,
        body: { torso: [0, -0.4, 0], pelvis: [0, -0.14, 0] },
        r: { p: [-0.26, 1.18, -0.24], z: [0.15, 0.08, 0.98] },
      },
      {
        t: 0.44,
        body: { torso: [0.16, 0.14, 0], pelvis: [0.05, 0.06, 0] },
        pelvisPos: [0, -0.04, 0.08],
        r: { p: [-0.12, 1.28, 0.42], z: [0.08, 0.04, 0.99] },
      },
      {
        t: 0.64,
        body: { torso: [0.1, 0.08, 0] },
        r: { p: [-0.14, 1.24, 0.32], z: [0.1, 0.05, 0.99] },
      },
    ],
  },

  attackCouchedLance: {
    name: 'attackCouchedLance',
    label: '🐎 Koltuklanmış Süvari Kargısı',
    kind: 'attack',
    duration: 1.2,
    fadeIn: 0.18,
    fadeOut: 0.22,
    keys: [
      {
        t: 0.2,
        body: { torso: [0.22, -0.14, 0], head: [-0.12, 0.12, 0] },
        r: { p: [-0.25, 1.22, 0.14], z: [0.02, -0.02, 1.0], pole: [-0.7, -0.4, -0.5] },
      },
      {
        t: 0.6,
        body: { torso: [0.26, -0.12, 0], head: [-0.15, 0.1, 0] },
        r: { p: [-0.25, 1.20, 0.20], z: [0.01, -0.03, 1.0], pole: [-0.7, -0.4, -0.5] },
      },
      {
        t: 1.0,
        body: { torso: [0.22, -0.14, 0], head: [-0.12, 0.12, 0] },
        r: { p: [-0.25, 1.22, 0.14], z: [0.02, -0.02, 1.0], pole: [-0.7, -0.4, -0.5] },
      },
    ],
  },

  attackMaceCrush: {
    name: 'attackMaceCrush',
    label: '🔨 Gürz & Balta Zırh Kırma',
    kind: 'attack',
    duration: 0.9,
    hitTime: 0.48,
    fadeIn: 0.14,
    fadeOut: 0.24,
    keys: [
      {
        t: 0.28,
        body: { torso: [-0.2, -0.25, 0], pelvis: [0, -0.1, 0] },
        r: { p: [-0.20, 2.02, -0.06], z: [0, -0.35, -0.94], pole: [-0.7, 0.4, -0.5] },
      },
      {
        t: 0.42,
        body: { torso: [0.1, -0.04, 0] },
        r: { p: [-0.14, 1.82, 0.38], z: [0, 0.8, 0.6] },
      },
      {
        t: 0.5,
        body: { torso: [0.36, 0.1, 0], pelvis: [0.08, 0.05, 0] },
        pelvisPos: [0, -0.05, 0.06],
        r: { p: [-0.1, 1.22, 0.48], z: [0, -0.55, 0.84] },
      },
      {
        t: 0.72,
        body: { torso: [0.22, 0.06, 0] },
        r: { p: [-0.14, 1.08, 0.36], z: [0, -0.75, 0.66] },
      },
    ],
  },

  shieldWallBrace: {
    name: 'shieldWallBrace',
    label: '🛡️ Kalkan Duvarı Siperi',
    kind: 'block',
    duration: 1.6,
    fadeIn: 0.2,
    fadeOut: 0.2,
    keys: [
      {
        t: 0.25,
        body: { torso: [0.08, 0.14, 0], pelvis: [0, 0.08, 0] },
        pelvisPos: [0, -0.02, 0],
        l: { p: [0.12, 1.28, 0.30], z: [0.08, 0.05, 0.99], hint: [0, -1, 0], axis: 'x', pole: [0.65, -0.75, -0.25] },
        r: { p: [-0.28, 1.52, 0.14], z: [0.02, 0.12, 0.99], pole: [-0.8, -0.2, -0.5] },
      },
      {
        t: 0.85,
        body: { torso: [0.12, 0.16, 0], pelvis: [0, 0.08, 0] },
        pelvisPos: [0, -0.03, 0.02],
        l: { p: [0.10, 1.30, 0.33], z: [0.06, 0.04, 0.99], hint: [0, -1, 0], axis: 'x', pole: [0.65, -0.75, -0.25] },
        r: { p: [-0.26, 1.54, 0.22], z: [0.02, 0.08, 0.99], pole: [-0.8, -0.2, -0.5] },
      },
      {
        t: 1.4,
        body: { torso: [0.08, 0.14, 0], pelvis: [0, 0.08, 0] },
        pelvisPos: [0, -0.02, 0],
        l: { p: [0.12, 1.28, 0.30], z: [0.08, 0.05, 0.99], hint: [0, -1, 0], axis: 'x', pole: [0.65, -0.75, -0.25] },
        r: { p: [-0.28, 1.52, 0.14], z: [0.02, 0.12, 0.99], pole: [-0.8, -0.2, -0.5] },
      },
    ],
  },

  shootBow: {
    name: 'shootBow',
    label: '🏹 Yay Germe ve Ok Atışı',
    kind: 'bow_draw',
    duration: 1.35,
    fadeIn: 0.18,
    fadeOut: 0.22,
    keys: [
      { t: 0.22, body: { torso: [0, -1.05, 0], pelvis: [0, -0.28, 0] } },
      { t: 0.78, body: { torso: [0, -1.1, 0], pelvis: [0, -0.3, 0] } },
      { t: 0.92, body: { torso: [-0.04, -1.08, 0], pelvis: [0, -0.3, 0] } },
      { t: 1.25, body: { torso: [0, -0.4, 0], pelvis: [0, -0.1, 0] } },
    ],
    bowAim: [
      [0, 0],
      [0.22, 1],
      [1.05, 1],
      [1.35, 0],
    ],
    bowDraw: [
      [0.15, 0],
      [0.75, 1],
      [0.84, 1.05],
      [0.9, 0],
      [1.35, 0],
    ],
    lookForward: 1,
  },

  crossbowAimFire: {
    name: 'crossbowAimFire',
    label: '🎯 Arbalet Nişan & Atış',
    kind: 'attack',
    duration: 1.45,
    hitTime: 0.62,
    fadeIn: 0.18,
    fadeOut: 0.25,
    keys: [
      {
        t: 0.25,
        body: { torso: [0.08, -0.18, 0], head: [-0.06, 0.16, 0.08] },
        r: { p: [-0.10, 1.44, 0.22], z: [0.02, 0.02, 1.0], pole: [-0.7, -0.4, -0.4] },
        l: { p: [-0.04, 1.42, 0.46], z: [0.02, 0.02, 1.0], pole: [0.6, -0.5, -0.3] },
      },
      {
        t: 0.58,
        body: { torso: [0.08, -0.18, 0], head: [-0.06, 0.16, 0.08] },
        r: { p: [-0.10, 1.44, 0.22], z: [0.02, 0.02, 1.0], pole: [-0.7, -0.4, -0.4] },
        l: { p: [-0.04, 1.42, 0.46], z: [0.02, 0.02, 1.0], pole: [0.6, -0.5, -0.3] },
      },
      {
        // Tetik düşüşü ve geri tepme (recoil)
        t: 0.68,
        body: { torso: [-0.06, -0.16, 0], head: [-0.12, 0.14, 0.05] },
        r: { p: [-0.10, 1.48, 0.16], z: [0.02, 0.14, 0.99], pole: [-0.7, -0.4, -0.4] },
        l: { p: [-0.04, 1.46, 0.40], z: [0.02, 0.14, 0.99], pole: [0.6, -0.5, -0.3] },
      },
      {
        // Kurma için aşağı indirme
        t: 1.15,
        body: { torso: [0.24, -0.06, 0], pelvis: [0.06, 0, 0] },
        pelvisPos: [0, -0.05, 0],
        r: { p: [-0.14, 1.14, 0.30], z: [0.05, -0.55, 0.83] },
        l: { p: [0.08, 1.06, 0.36], z: [0.05, -0.55, 0.83] },
      },
    ],
  },

  javelinThrow: {
    name: 'javelinThrow',
    label: '⚡ Cirit (Jereed) Fırlatma',
    kind: 'attack',
    duration: 1.0,
    hitTime: 0.52,
    fadeIn: 0.15,
    fadeOut: 0.24,
    keys: [
      {
        t: 0.28,
        body: { torso: [-0.16, -0.55, 0], pelvis: [0, -0.22, 0] },
        r: { p: [-0.32, 1.86, -0.22], z: [0.08, 0.12, 0.99], pole: [-0.8, 0.2, -0.5] },
      },
      {
        t: 0.5,
        body: { torso: [0.24, 0.28, 0], pelvis: [0.06, 0.12, 0] },
        pelvisPos: [0, -0.04, 0.08],
        r: { p: [-0.14, 1.64, 0.48], z: [0.04, -0.22, 0.97], pole: [-0.7, 0.1, -0.4] },
      },
      {
        t: 0.76,
        body: { torso: [0.18, 0.22, 0] },
        r: { p: [-0.12, 1.32, 0.42], z: [0.08, -0.45, 0.88] },
      },
    ],
  },

  weaponFlourish: {
    name: 'weaponFlourish',
    label: '👑 Zafer / Kılıç Gösterisi',
    kind: 'misc',
    duration: 1.4,
    fadeIn: 0.18,
    fadeOut: 0.24,
    keys: [
      {
        t: 0.25,
        body: { torso: [-0.06, -0.22, 0] },
        r: { p: [-0.28, 1.56, 0.34], z: [-0.45, 0.75, 0.48] },
      },
      {
        t: 0.55,
        body: { torso: [-0.04, 0.2, 0] },
        r: { p: [0.06, 1.58, 0.38], z: [0.55, 0.72, 0.42] },
      },
      {
        t: 0.88,
        body: { torso: [-0.08, -0.18, 0] },
        r: { p: [-0.22, 1.72, 0.30], z: [0.05, 0.96, 0.26] },
      },
      {
        t: 1.2,
        body: { torso: [-0.04, 0, 0] },
        r: { p: [-0.20, 1.36, 0.34], z: [0.08, 0.85, 0.52] },
      },
    ],
  },

  salute: {
    name: 'salute',
    label: '🦅 Askerî Selam',
    kind: 'misc',
    duration: 1.5,
    fadeIn: 0.2,
    fadeOut: 0.25,
    keys: [
      {
        t: 0.3,
        body: { torso: [-0.08, 0, 0], head: [-0.06, 0, 0] },
        r: { p: [-0.06, 1.54, 0.30], z: [0.0, 0.98, 0.18], pole: [-0.6, -0.5, -0.3] },
      },
      {
        t: 1.1,
        body: { torso: [-0.08, 0, 0], head: [0.08, 0, 0] },
        r: { p: [-0.06, 1.54, 0.30], z: [0.0, 0.98, 0.18], pole: [-0.6, -0.5, -0.3] },
      },
    ],
  },

  cavalryGallop: {
    name: 'cavalryGallop',
    label: '🐎 Ağır Süvari Dörtnal Hücumu',
    kind: 'misc',
    duration: 0.9,
    fadeIn: 0.15,
    fadeOut: 0.15,
    keys: [
      {
        t: 0.22,
        body: { torso: [0.16, -0.08, 0], head: [-0.1, 0.06, 0] },
        r: { p: [-0.28, 1.28, 0.24], z: [0.1, 0.68, 0.72] },
      },
      {
        t: 0.65,
        body: { torso: [0.22, -0.06, 0], head: [-0.14, 0.05, 0] },
        r: { p: [-0.26, 1.22, 0.28], z: [0.08, 0.62, 0.78] },
      },
    ],
  },
};

let _ikClipsRegistered = false;

/**
 * Tüm krallık özel IK kliplerini `CharacterAnimator`'ın derlenmiş klip
 * tablosuna (`COMPILED`) kaydeder (idempotent).
 */
export function ensureFactionIKClipsRegistered(): void {
  if (_ikClipsRegistered) return;
  _ikClipsRegistered = true;
  const allClasses: WeaponClass[] = ['1H', '1H_SHIELD', '2H', 'SPEAR', 'BOW', 'UNARMED'];
  // Alias eşlemeleri:
  FACTION_IK_CLIPS.attackSword = { ...FACTION_IK_CLIPS.attackSlash, name: 'attackSword' };
  FACTION_IK_CLIPS.block = { ...FACTION_IK_CLIPS.shieldWallBrace, name: 'block' };
  FACTION_IK_CLIPS.horseChargeGallop = { ...FACTION_IK_CLIPS.cavalryGallop, name: 'horseChargeGallop' };
  FACTION_IK_CLIPS.horseRear = { ...FACTION_IK_CLIPS.cavalryGallop, name: 'horseRear' };
  for (const clip of Object.values(FACTION_IK_CLIPS)) {
    registerCustomClip(clip, allClasses);
  }
}

/**
 * Verilen `FactionAnimationId` değerini `CharacterAnimator` üzerinde çalıştırır.
 * Sürekli döngü (loop) modunda klip bittikçe otomatik yeniden tetiklenir.
 */
export function applyFactionAnimationToCharacterAnimator(
  animator: CharacterAnimator,
  animId: FactionAnimationId,
): void {
  ensureFactionIKClipsRegistered();

  if (animId === 'idle' || animId === 'ready' || animId === 'mountedIdle') {
    animator.setMove(0, 0);
    animator.cancelAction();
    return;
  }
  if (animId === 'walk') {
    animator.cancelAction();
    animator.setMove(0, 1.65);
    return;
  }
  if (animId === 'run') {
    animator.cancelAction();
    animator.setMove(0, 5.2);
    return;
  }
  if (
    animId === 'cavalryTrot' ||
    animId === 'cavalryGallop' ||
    animId === 'horseChargeGallop' ||
    animId === 'horseRear'
  ) {
    animator.setMove(0, 0);
    if (!animator.currentAction || animator.currentAction.name !== 'cavalryGallop') {
      animator.play('cavalryGallop', { force: true });
    }
    return;
  }

  animator.setMove(0, 0);
  if (!animator.currentAction || animator.currentAction.name !== animId) {
    animator.play(animId, { force: true });
  }
}

/**
 * Her karede (frame) karakterin `CharacterAnimator`'ını ve varsa bineğini
 * (`WarHorseRig`) + binici bacak oturuşunu (`applyRiderMountedPosture`) günceller.
 */
export function updateEquippedCharacterAndMount(params: {
  rig: CharacterRig;
  animator: CharacterAnimator;
  horseRig?: WarHorseRig | null;
  animId: FactionAnimationId;
  dt: number;
  elapsedSec: number;
}): void {
  const { rig, animator, horseRig, animId, dt, elapsedSec } = params;
  ensureFactionIKClipsRegistered();

  // Loop eden aksiyon klipleri bittiğinde yeniden başlat:
  if (
    animId !== 'idle' &&
    animId !== 'ready' &&
    animId !== 'mountedIdle' &&
    animId !== 'walk' &&
    animId !== 'run' &&
    !animator.currentAction
  ) {
    const clipName =
      animId === 'cavalryTrot' || animId === 'horseChargeGallop' || animId === 'horseRear'
        ? 'cavalryGallop'
        : animId;
    animator.play(clipName, { force: true });
  }

  animator.update(dt);

  if (horseRig) {
    const horseSpeed =
      animId === 'cavalryGallop' ||
      animId === 'horseChargeGallop' ||
      animId === 'horseRear' ||
      animId === 'attackCouchedLance' ||
      animId === 'run'
        ? 6.2
        : animId === 'cavalryTrot' || animId === 'walk'
          ? 3.2
          : 0.0;
    updateWarHorseAnimation(horseRig, horseSpeed, elapsedSec);
    applyRiderMountedPosture(rig, horseSpeed, elapsedSec);
  }
}

export function getAnimationMetaById(id: FactionAnimationId): FactionAnimMeta {
  return FACTION_ANIMATION_META.find((m) => m.id === id) ?? FACTION_ANIMATION_META[0];
}

export function getAnimationsForCategory(weaponCategory: string): FactionAnimMeta[] {
  return FACTION_ANIMATION_META.filter(
    (m) =>
      m.recommendedFor.includes('all') ||
      m.recommendedFor.includes(weaponCategory),
  );
}
