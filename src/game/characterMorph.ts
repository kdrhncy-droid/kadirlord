import * as THREE from 'three';
import { CharacterRig, HEAD, TORSO_DEPTH_SCALE } from './characterRig.ts';
import { FactionId } from './rules.ts';

/* =======================================================================
 * BANNERLORD LOW-POLY CHARACTER MORPH & PROCEDURAL DNA ARCHITECTURE
 * ======================================================================= */

export type GenderType = 'male' | 'female';
export type FaceShape = 'oval' | 'square' | 'round' | 'angular' | 'chiseled';

export type HairStyleId =
  | 'bald'
  | 'short_parted'
  | 'nordic_braids'
  | 'steppe_topknot'
  | 'warrior_knot'
  | 'shoulder_wavy'
  | 'imperial_crop'
  | 'royal_braid';

export type BeardStyleId =
  | 'clean_shaven'
  | 'stubble'
  | 'full_beard'
  | 'braided_viking'
  | 'imperial_mustache'
  | 'nomad_goatee'
  | 'long_patriarch';

export type ScarType = 'none' | 'eye_slash' | 'cheek_cross' | 'jaw_gash' | 'battle_brow';
export type WarPaintType = 'none' | 'woad_lines' | 'steppe_chevrons' | 'imperial_mark' | 'ash_smear';

export interface CharacterMorphDNA {
  // Stature & Physique
  gender: GenderType;
  height: number; // 0.88 - 1.16 (multiplier)
  build: number; // 0.80 - 1.35 (muscular / shoulder width)
  weight: number; // 0.85 - 1.30 (waist & belly fullness)
  armLength: number; // 0.92 - 1.10
  legLength: number; // 0.90 - 1.12

  // Facial Morphology & Skin
  skinTone: string; // hex
  skinAge: number; // 0.0 - 1.0 (wrinkle shading)
  faceShape: FaceShape;
  jawWidth: number; // 0.80 - 1.30
  chinLength: number; // 0.80 - 1.30
  noseLength: number; // 0.70 - 1.40
  noseBridge: number; // 0.80 - 1.30
  eyeColor: string;
  browProminence: number; // 0.80 - 1.30

  // Hair & Grooming
  hairStyle: HairStyleId;
  hairColor: string;
  beardStyle: BeardStyleId;
  beardColor: string;

  // Heritage & Markings
  scar: ScarType;
  warPaint: WarPaintType;
  warPaintColor: string;
  culture: FactionId;
}

/* -----------------------------------------------------------------------
 * PALETTES & PRESET DATA
 * ----------------------------------------------------------------------- */

export const SKIN_TONES = [
  { id: 'pale_nordic', name: 'Kuzeyli Açık Ten', color: '#f5d0b5' },
  { id: 'vlandian_fair', name: 'Vlandiya Buğday', color: '#e8be99' },
  { id: 'calradic_olive', name: 'İmparatorluk Zeytini', color: '#dfa882' },
  { id: 'steppe_bronze', name: 'Bozkır Bronzu', color: '#c68a5c' },
  { id: 'nahasa_sun', name: 'Nahasa Güneşi', color: '#9d6840' },
  { id: 'deep_desert', name: 'Koyu Çöl Esmeri', color: '#704626' },
];

export const HAIR_COLORS = [
  { id: 'raven_black', name: 'Kuzguni Siyah', color: '#171412' },
  { id: 'dark_chestnut', name: 'Koyu Kestane', color: '#382212' },
  { id: 'warm_brown', name: 'Sıcak Kahve', color: '#573319' },
  { id: 'battanian_auburn', name: 'Battaniya Kızılı', color: '#883317' },
  { id: 'nordic_blonde', name: 'Nordik Altın Sarısı', color: '#d8b065' },
  { id: 'ash_grey', name: 'Kül Grisi', color: '#7a7a7a' },
  { id: 'venerable_white', name: 'Ak Sakallı Beyaz', color: '#e2e8f0' },
];

export const EYE_COLORS = [
  { id: 'dark_brown', name: 'Koyu Kahve', color: '#1c1917' },
  { id: 'amber_hazel', name: 'Kehribar / Ela', color: '#78350f' },
  { id: 'ice_blue', name: 'Buz Mavisi', color: '#0284c7' },
  { id: 'forest_green', name: 'Orman Yeşili', color: '#15803d' },
  { id: 'steel_grey', name: 'Çelik Grisi', color: '#475569' },
];

export const HAIR_STYLE_LABELS: Record<HairStyleId, { name: string; desc: string }> = {
  bald: { name: 'Kazıtılmış / Kel', desc: 'Savaş miğferi için pürüzsüz baş' },
  short_parted: { name: 'Yandan Ayrık', desc: 'Asil Vlandiya şövalye kesimi' },
  nordic_braids: { name: 'Nordik Örgüler', desc: 'Sturgia savaşçılarının iki yana örgülü saçları' },
  steppe_topknot: { name: 'Bozkır Tepeliği', desc: 'Khuzait atlılarının geleneksel tepelik atkuyruğu' },
  warrior_knot: { name: 'Savaşçı Topuzu', desc: 'Battaniya klanlarının arkadan düğümlü saçı' },
  shoulder_wavy: { name: 'Omuz Hizasında Dalgalı', desc: 'Yele gibi dalgalı feodal saç' },
  imperial_crop: { name: 'İmparatorluk Kesimi', desc: 'Roma lejyonerlerine has kısa nizam saç' },
  royal_braid: { name: 'Hanedan Tacı Örgüsü', desc: 'Başa taç gibi dolanan asil saray örgüsü' },
};

export const BEARD_STYLE_LABELS: Record<BeardStyleId, { name: string; desc: string }> = {
  clean_shaven: { name: 'Sinekkaydı Tıraş', desc: 'Pürüzsüz yüz, genç veya saray tarzı' },
  stubble: { name: 'Gölge / Kirli Sakal', desc: 'Savaş meydanında birkaç günlük sakal' },
  full_beard: { name: 'Gür Şövalye Sakalı', desc: 'Dolu ve biçimli feodal sakal' },
  braided_viking: { name: 'Viking Örgülü Sakal', desc: 'Çift örgülü Sturgia deniz kurdu sakalı' },
  imperial_mustache: { name: 'İmparatorluk Bıyığı', desc: 'Kıvrık uçlu gösterişli general bıyığı' },
  nomad_goatee: { name: 'Bozkır Keçisakalı & Sarkık Bıyık', desc: 'Khuzait hanlarının karakteristik sakalı' },
  long_patriarch: { name: 'Uzun Patrik Sakalı', desc: 'Göğse inen bilge ihtiyar sakalı' },
};

export const SCAR_LABELS: Record<ScarType, { name: string; desc: string }> = {
  none: { name: 'Yarasız', desc: 'Kusursuz ten' },
  eye_slash: { name: 'Göz Kesiği', desc: 'Sol kaş ve göz kapağını yaran kılıç darbesi' },
  cheek_cross: { name: 'Yanak Çarpısı', desc: 'Sağ yanakta çapraz hançer izi' },
  jaw_gash: { name: 'Çene Yarası', desc: 'Gürz darbesiyle yarılmış çene kemiği izi' },
  battle_brow: { name: 'Alın Gazisi İzi', desc: 'Alında miğfer altından sıyrılan ok yarası' },
};

export const WAR_PAINT_LABELS: Record<WarPaintType, { name: string; desc: string }> = {
  none: { name: 'Boyasız', desc: 'Doğal yüz' },
  woad_lines: { name: 'Battaniya Çivit Boyası', desc: 'Yanaklarda ve burunda mavi kabile çizgileri' },
  steppe_chevrons: { name: 'Bozkır Ok Başları', desc: 'Göz altlarında siyah süvari şeritleri' },
  imperial_mark: { name: 'Lejyoner Kırmızısı', desc: 'Alından aşağı inen İmparatorluk kırmızı damgası' },
  ash_smear: { name: 'Kül & İs İzi', desc: 'Kuşatma harabelerinden kalma savaş isi' },
};

/* -----------------------------------------------------------------------
 * CANONICAL DNA PRESETS FOR ALL 9 LORDS & KINGS OF CALRADIA
 * ----------------------------------------------------------------------- */

export const LORD_DNA_PRESETS: Record<string, CharacterMorphDNA> = {
  // İmparatoriçe Rhagaea
  'lord-rhagaea': {
    gender: 'female',
    height: 1.02,
    build: 0.94,
    weight: 0.95,
    armLength: 0.98,
    legLength: 1.02,
    skinTone: '#dfa882',
    skinAge: 0.28,
    faceShape: 'oval',
    jawWidth: 0.92,
    chinLength: 0.96,
    noseLength: 0.95,
    noseBridge: 0.92,
    eyeColor: '#78350f',
    browProminence: 0.88,
    hairStyle: 'royal_braid',
    hairColor: '#382212',
    beardStyle: 'clean_shaven',
    beardColor: '#382212',
    scar: 'none',
    warPaint: 'none',
    warPaintColor: '#881337',
    culture: 'empire',
  },

  // Kral Derthert (Vlandia)
  'lord-derthert': {
    gender: 'male',
    height: 1.08,
    build: 1.14,
    weight: 1.08,
    armLength: 1.02,
    legLength: 1.04,
    skinTone: '#e8be99',
    skinAge: 0.58,
    faceShape: 'square',
    jawWidth: 1.18,
    chinLength: 1.12,
    noseLength: 1.08,
    noseBridge: 1.05,
    eyeColor: '#0284c7',
    browProminence: 1.12,
    hairStyle: 'short_parted',
    hairColor: '#7a7a7a', // Gümüşlenmiş kestane
    beardStyle: 'full_beard',
    beardColor: '#7a7a7a',
    scar: 'none',
    warPaint: 'none',
    warPaintColor: '#991b1b',
    culture: 'vlandia',
  },

  // Yüksek Kral Caladog (Battania)
  'lord-caladog': {
    gender: 'male',
    height: 1.12,
    build: 1.28,
    weight: 1.16,
    armLength: 1.06,
    legLength: 1.05,
    skinTone: '#f5d0b5',
    skinAge: 0.48,
    faceShape: 'angular',
    jawWidth: 1.22,
    chinLength: 1.18,
    noseLength: 1.15,
    noseBridge: 1.12,
    eyeColor: '#15803d',
    browProminence: 1.25,
    hairStyle: 'nordic_braids',
    hairColor: '#883317', // Battaniya kızılı
    beardStyle: 'full_beard',
    beardColor: '#883317',
    scar: 'eye_slash',
    warPaint: 'woad_lines',
    warPaintColor: '#0284c7', // Kelt mavi çivit boyası
    culture: 'battania',
  },

  // Büyük Prens Raganvad (Sturgia)
  'lord-raganvad': {
    gender: 'male',
    height: 1.14,
    build: 1.30,
    weight: 1.22,
    armLength: 1.05,
    legLength: 1.06,
    skinTone: '#f5d0b5',
    skinAge: 0.45,
    faceShape: 'chiseled',
    jawWidth: 1.24,
    chinLength: 1.15,
    noseLength: 1.12,
    noseBridge: 1.14,
    eyeColor: '#0284c7',
    browProminence: 1.22,
    hairStyle: 'shoulder_wavy',
    hairColor: '#d8b065', // Nordik altın sarısı
    beardStyle: 'braided_viking',
    beardColor: '#d8b065',
    scar: 'cheek_cross',
    warPaint: 'none',
    warPaintColor: '#1e3a8a',
    culture: 'sturgia',
  },

  // Monchug Han (Khuzait)
  'lord-monchug': {
    gender: 'male',
    height: 1.04,
    build: 1.15,
    weight: 1.02,
    armLength: 1.02,
    legLength: 0.98,
    skinTone: '#c68a5c',
    skinAge: 0.52,
    faceShape: 'round',
    jawWidth: 1.15,
    chinLength: 1.05,
    noseLength: 0.96,
    noseBridge: 0.88,
    eyeColor: '#171412',
    browProminence: 1.10,
    hairStyle: 'steppe_topknot',
    hairColor: '#171412',
    beardStyle: 'nomad_goatee',
    beardColor: '#171412',
    scar: 'battle_brow',
    warPaint: 'steppe_chevrons',
    warPaintColor: '#171412',
    culture: 'khuzait',
  },

  // Sultan Unqid (Aserai)
  'lord-unqid': {
    gender: 'male',
    height: 1.09,
    build: 1.06,
    weight: 1.04,
    armLength: 1.02,
    legLength: 1.05,
    skinTone: '#9d6840',
    skinAge: 0.56,
    faceShape: 'angular',
    jawWidth: 1.08,
    chinLength: 1.16,
    noseLength: 1.26, // Şahin burnu
    noseBridge: 1.18,
    eyeColor: '#78350f',
    browProminence: 1.15,
    hairStyle: 'short_parted',
    hairColor: '#382212',
    beardStyle: 'full_beard',
    beardColor: '#382212',
    scar: 'none',
    warPaint: 'none',
    warPaintColor: '#b45309',
    culture: 'aserai',
  },

  // General Garios (Empire)
  'lord-garios': {
    gender: 'male',
    height: 1.08,
    build: 1.25,
    weight: 1.14,
    armLength: 1.04,
    legLength: 1.02,
    skinTone: '#dfa882',
    skinAge: 0.55,
    faceShape: 'square',
    jawWidth: 1.22,
    chinLength: 1.10,
    noseLength: 1.14,
    noseBridge: 1.10,
    eyeColor: '#475569',
    browProminence: 1.24,
    hairStyle: 'imperial_crop',
    hairColor: '#7a7a7a',
    beardStyle: 'stubble',
    beardColor: '#7a7a7a',
    scar: 'jaw_gash',
    warPaint: 'imperial_mark',
    warPaintColor: '#881337',
    culture: 'empire',
  },

  // Arkon Lucon (Empire)
  'lord-lucon': {
    gender: 'male',
    height: 1.05,
    build: 0.98,
    weight: 1.05,
    armLength: 1.0,
    legLength: 1.0,
    skinTone: '#e8be99',
    skinAge: 0.78, // Yaşlı bilge senatör
    faceShape: 'chiseled',
    jawWidth: 1.06,
    chinLength: 1.20,
    noseLength: 1.18,
    noseBridge: 1.12,
    eyeColor: '#1c1917',
    browProminence: 1.16,
    hairStyle: 'bald',
    hairColor: '#e2e8f0',
    beardStyle: 'long_patriarch',
    beardColor: '#e2e8f0',
    scar: 'none',
    warPaint: 'none',
    warPaintColor: '#4c1d95',
    culture: 'empire',
  },

  // Reis Kargı (Bandits)
  'lord-kargi': {
    gender: 'male',
    height: 1.07,
    build: 1.22,
    weight: 1.12,
    armLength: 1.03,
    legLength: 1.02,
    skinTone: '#c68a5c',
    skinAge: 0.50,
    faceShape: 'angular',
    jawWidth: 1.26,
    chinLength: 1.14,
    noseLength: 1.10,
    noseBridge: 1.25, // Kırık burun
    eyeColor: '#171412',
    browProminence: 1.28,
    hairStyle: 'warrior_knot',
    hairColor: '#171412',
    beardStyle: 'full_beard',
    beardColor: '#171412',
    scar: 'eye_slash',
    warPaint: 'ash_smear',
    warPaintColor: '#262626',
    culture: 'bandits',
  },
};

/** Default Player Starting DNA */
export const PLAYER_DEFAULT_DNA: CharacterMorphDNA = {
  gender: 'male',
  height: 1.04,
  build: 1.10,
  weight: 1.02,
  armLength: 1.0,
  legLength: 1.02,
  skinTone: '#e8be99',
  skinAge: 0.25,
  faceShape: 'chiseled',
  jawWidth: 1.08,
  chinLength: 1.05,
  noseLength: 1.02,
  noseBridge: 1.0,
  eyeColor: '#0284c7',
  browProminence: 1.08,
  hairStyle: 'short_parted',
  hairColor: '#382212',
  beardStyle: 'stubble',
  beardColor: '#382212',
  scar: 'none',
  warPaint: 'none',
  warPaintColor: '#0284c7',
  culture: 'vlandia',
};

/* -----------------------------------------------------------------------
 * GET DNA HELPER & RANDOMIZER
 * ----------------------------------------------------------------------- */

export function getLordDNA(lordId: string, factionFallback: FactionId = 'empire'): CharacterMorphDNA {
  if (LORD_DNA_PRESETS[lordId]) {
    return cloneDNA(LORD_DNA_PRESETS[lordId]);
  }
  return generateRandomDNA(factionFallback);
}

export function cloneDNA(dna: CharacterMorphDNA): CharacterMorphDNA {
  return JSON.parse(JSON.stringify(dna));
}

export function generateRandomDNA(culture: FactionId, gender?: GenderType): CharacterMorphDNA {
  const chosenGender: GenderType = gender || (Math.random() > 0.4 ? 'male' : 'female');

  // Culture-specific defaults
  let skinTone = '#dfa882';
  let hairColor = '#382212';
  let eyeColor = '#1c1917';
  let hairStyle: HairStyleId = 'short_parted';
  let beardStyle: BeardStyleId = chosenGender === 'female' ? 'clean_shaven' : 'stubble';

  if (culture === 'vlandia') {
    skinTone = Math.random() > 0.5 ? '#f5d0b5' : '#e8be99';
    hairColor = Math.random() > 0.5 ? '#382212' : '#573319';
    eyeColor = Math.random() > 0.4 ? '#0284c7' : '#78350f';
    hairStyle = chosenGender === 'female' ? 'royal_braid' : 'short_parted';
    if (chosenGender === 'male') beardStyle = Math.random() > 0.5 ? 'full_beard' : 'stubble';
  } else if (culture === 'sturgia') {
    skinTone = '#f5d0b5';
    hairColor = Math.random() > 0.4 ? '#d8b065' : '#7a7a7a';
    eyeColor = '#0284c7';
    hairStyle = chosenGender === 'female' ? 'shoulder_wavy' : 'nordic_braids';
    if (chosenGender === 'male') beardStyle = 'braided_viking';
  } else if (culture === 'battania') {
    skinTone = '#f5d0b5';
    hairColor = Math.random() > 0.5 ? '#883317' : '#382212';
    eyeColor = '#15803d';
    hairStyle = 'warrior_knot';
    if (chosenGender === 'male') beardStyle = 'full_beard';
  } else if (culture === 'khuzait') {
    skinTone = '#c68a5c';
    hairColor = '#171412';
    eyeColor = '#171412';
    hairStyle = 'steppe_topknot';
    if (chosenGender === 'male') beardStyle = 'nomad_goatee';
  } else if (culture === 'aserai') {
    skinTone = Math.random() > 0.5 ? '#9d6840' : '#704626';
    hairColor = '#171412';
    eyeColor = '#78350f';
    hairStyle = 'short_parted';
    if (chosenGender === 'male') beardStyle = 'full_beard';
  } else {
    // Empire
    skinTone = '#dfa882';
    hairColor = '#382212';
    eyeColor = '#475569';
    hairStyle = chosenGender === 'female' ? 'royal_braid' : 'imperial_crop';
    if (chosenGender === 'male') beardStyle = Math.random() > 0.5 ? 'stubble' : 'imperial_mustache';
  }

  const scarRoll = Math.random();
  const scar: ScarType =
    scarRoll > 0.75
      ? 'eye_slash'
      : scarRoll > 0.55
        ? 'cheek_cross'
        : scarRoll > 0.4
          ? 'jaw_gash'
          : 'none';

  return {
    gender: chosenGender,
    height: Math.round((0.92 + Math.random() * 0.22) * 100) / 100,
    build: Math.round((0.88 + Math.random() * 0.38) * 100) / 100,
    weight: Math.round((0.9 + Math.random() * 0.28) * 100) / 100,
    armLength: 1.0,
    legLength: Math.round((0.95 + Math.random() * 0.12) * 100) / 100,
    skinTone,
    skinAge: Math.round(Math.random() * 0.6 * 100) / 100,
    faceShape: (['oval', 'square', 'round', 'angular', 'chiseled'] as const)[
      Math.floor(Math.random() * 5)
    ],
    jawWidth: Math.round((0.9 + Math.random() * 0.3) * 100) / 100,
    chinLength: Math.round((0.9 + Math.random() * 0.26) * 100) / 100,
    noseLength: Math.round((0.85 + Math.random() * 0.35) * 100) / 100,
    noseBridge: Math.round((0.9 + Math.random() * 0.25) * 100) / 100,
    eyeColor,
    browProminence: Math.round((0.9 + Math.random() * 0.3) * 100) / 100,
    hairStyle,
    hairColor,
    beardStyle,
    beardColor: hairColor,
    scar,
    warPaint: culture === 'battania' && Math.random() > 0.4 ? 'woad_lines' : 'none',
    warPaintColor: culture === 'battania' ? '#0284c7' : '#881337',
    culture,
  };
}

/* -----------------------------------------------------------------------
 * PROCEDURAL LOW-POLY 3D MESH GENERATORS
 * ----------------------------------------------------------------------- */

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

/**
 * Builds distinctive 3D low-poly hair styles that sit cleanly on top of the head ellipsoid.
 */
export function createHairMesh(style: HairStyleId, hairMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = `Hair_${style}`;

  if (style === 'bald') {
    // Subtle shaved stubble cap if any, or empty group
    return g;
  }

  if (style === 'short_parted') {
    // Vlandian neat side-parted hair cap
    const cap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.016, 8, 4, 0, Math.PI * 2, 0, (Math.PI * 3.5) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    // Side part fringe (swept left-to-right)
    const fringe = mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), hairMat, false);
    fringe.position.set(0.04, HEAD.cy + 0.09, (HEAD.r + 0.01) * HEAD.sz);
    fringe.rotation.z = -0.15;

    // Back taper
    const back = mesh(
      new THREE.CylinderGeometry(HEAD.r + 0.014, HEAD.r + 0.008, 0.1, 7, 1, true),
      hairMat,
      false,
    );
    back.scale.set(1, 1, HEAD.sz);
    back.position.set(0, HEAD.cy - 0.04, -0.01);

    g.add(cap, fringe, back);
    return g;
  }

  if (style === 'nordic_braids') {
    // Sturgian hair with side braids hanging over shoulders
    const cap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.016, 8, 4, 0, Math.PI * 2, 0, (Math.PI * 3.6) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    // Left braid hanging down
    const braidGeo = new THREE.CylinderGeometry(0.02, 0.012, 0.28, 5);
    const leftBraid = mesh(braidGeo, hairMat, false);
    leftBraid.position.set(0.11, HEAD.cy - 0.08, 0.04);
    leftBraid.rotation.z = -0.12;

    // Right braid hanging down
    const rightBraid = mesh(braidGeo.clone(), hairMat, false);
    rightBraid.position.set(-0.11, HEAD.cy - 0.08, 0.04);
    rightBraid.rotation.z = 0.12;

    // Back hair fall
    const backFall = mesh(new THREE.BoxGeometry(0.18, 0.22, 0.06), hairMat, false);
    backFall.position.set(0, HEAD.cy - 0.08, -HEAD.r * HEAD.sz - 0.005);
    backFall.rotation.x = -0.1;

    g.add(cap, leftBraid, rightBraid, backFall);
    return g;
  }

  if (style === 'steppe_topknot') {
    // Khuzait shaved temples with high knotted ponytail
    const crownCap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.015, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.26),
      hairMat,
      false,
    );
    crownCap.scale.set(0.9, HEAD.sy, 0.9);
    crownCap.position.y = HEAD.cy + 0.02;

    // Topknot knot/bun
    const knot = mesh(new THREE.SphereGeometry(0.045, 6, 5), hairMat, false);
    knot.position.set(0, HEAD.cy + 0.15, -0.02);

    // Drooping ponytail
    const ponytail = mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.26, 5), hairMat, false);
    ponytail.position.set(0, HEAD.cy + 0.06, -0.12);
    ponytail.rotation.x = -0.7;

    g.add(crownCap, knot, ponytail);
    return g;
  }

  if (style === 'warrior_knot') {
    // Battanian rugged warrior topknot / man-bun
    const cap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.018, 8, 4, 0, Math.PI * 2, 0, (Math.PI * 3.4) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    const bun = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 6), hairMat, false);
    bun.rotation.x = Math.PI * 0.45;
    bun.position.set(0, HEAD.cy + 0.12, -0.09);

    g.add(cap, bun);
    return g;
  }

  if (style === 'shoulder_wavy') {
    // Flowing wavy hair covering ears and nape down to shoulders
    const cap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.02, 8, 5, 0, Math.PI * 2, 0, (Math.PI * 4.2) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    const leftFlow = mesh(new THREE.BoxGeometry(0.07, 0.26, 0.14), hairMat, false);
    leftFlow.position.set(0.12, HEAD.cy - 0.08, -0.02);

    const rightFlow = mesh(new THREE.BoxGeometry(0.07, 0.26, 0.14), hairMat, false);
    rightFlow.position.set(-0.12, HEAD.cy - 0.08, -0.02);

    const backFlow = mesh(new THREE.BoxGeometry(0.22, 0.28, 0.07), hairMat, false);
    backFlow.position.set(0, HEAD.cy - 0.09, -HEAD.r * HEAD.sz - 0.01);

    g.add(cap, leftFlow, rightFlow, backFlow);
    return g;
  }

  if (style === 'imperial_crop') {
    // Tight, disciplined Roman/Empire short crop
    const cap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.014, 8, 4, 0, Math.PI * 2, 0, (Math.PI * 3.2) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    // Small brow bangs fringe
    const fringe = mesh(new THREE.BoxGeometry(0.14, 0.028, 0.035), hairMat, false);
    fringe.position.set(0, HEAD.cy + 0.08, (HEAD.r + 0.012) * HEAD.sz);

    g.add(cap, fringe);
    return g;
  }

  if (style === 'royal_braid') {
    // Aristocratic crown braid wrapped around head (Rhagaea style)
    const cap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.016, 8, 4, 0, Math.PI * 2, 0, (Math.PI * 3.5) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    // Crown braid torus wrapping the brow
    const crownBraid = mesh(new THREE.TorusGeometry(HEAD.r + 0.015, 0.022, 4, 10), hairMat, false);
    crownBraid.rotation.x = Math.PI * 0.45;
    crownBraid.position.set(0, HEAD.cy + 0.05, 0.01);

    // Chignon / back hair knot
    const chignon = mesh(new THREE.SphereGeometry(0.065, 6, 5), hairMat, false);
    chignon.position.set(0, HEAD.cy, -HEAD.r * HEAD.sz - 0.02);

    g.add(cap, crownBraid, chignon);
    return g;
  }

  return g;
}

/**
 * Builds distinctive 3D low-poly facial hair styles.
 */
export function createBeardMesh(style: BeardStyleId, beardMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = `Beard_${style}`;

  if (style === 'clean_shaven') {
    return g;
  }

  if (style === 'stubble') {
    // 5 o'clock shadow low-profile jaw wraps
    const shadowGeo = new THREE.BoxGeometry(0.165, 0.08, 0.09);
    const m = mesh(shadowGeo, beardMat, false);
    m.position.set(0, HEAD.cy - 0.095, 0.08);
    m.scale.set(1.0, 0.6, 0.75);
    g.add(m);
    return g;
  }

  if (style === 'full_beard') {
    // Classic full knight beard
    const jawBox = mesh(new THREE.BoxGeometry(0.18, 0.13, 0.11), beardMat, false);
    jawBox.position.set(0, HEAD.cy - 0.11, 0.085);

    const mustache = mesh(new THREE.BoxGeometry(0.14, 0.035, 0.04), beardMat, false);
    mustache.position.set(0, HEAD.cy - 0.04, 0.132);

    g.add(jawBox, mustache);
    return g;
  }

  if (style === 'braided_viking') {
    // Sturgian two long braided strands hanging off the chin
    const base = mesh(new THREE.BoxGeometry(0.17, 0.1, 0.1), beardMat, false);
    base.position.set(0, HEAD.cy - 0.1, 0.085);

    // Left chin braid
    const braidGeo = new THREE.CylinderGeometry(0.022, 0.014, 0.22, 5);
    const leftBraid = mesh(braidGeo, beardMat, false);
    leftBraid.position.set(0.045, HEAD.cy - 0.22, 0.1);
    leftBraid.rotation.z = -0.06;

    // Right chin braid
    const rightBraid = mesh(braidGeo.clone(), beardMat, false);
    rightBraid.position.set(-0.045, HEAD.cy - 0.22, 0.1);
    rightBraid.rotation.z = 0.06;

    const mustache = mesh(new THREE.BoxGeometry(0.15, 0.038, 0.045), beardMat, false);
    mustache.position.set(0, HEAD.cy - 0.04, 0.132);

    g.add(base, leftBraid, rightBraid, mustache);
    return g;
  }

  if (style === 'imperial_mustache') {
    // Big prominent mustache with turned-up wingtips, clean chin
    const center = mesh(new THREE.BoxGeometry(0.12, 0.04, 0.038), beardMat, false);
    center.position.set(0, HEAD.cy - 0.04, 0.132);

    const leftWing = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), beardMat, false);
    leftWing.position.set(0.08, HEAD.cy - 0.032, 0.128);
    leftWing.rotation.z = 0.45;

    const rightWing = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), beardMat, false);
    rightWing.position.set(-0.08, HEAD.cy - 0.032, 0.128);
    rightWing.rotation.z = -0.45;

    g.add(center, leftWing, rightWing);
    return g;
  }

  if (style === 'nomad_goatee') {
    // Khuzait drooping mustache and pointed chin goatee
    const goatee = mesh(new THREE.ConeGeometry(0.04, 0.14, 5), beardMat, false);
    goatee.rotation.x = Math.PI;
    goatee.position.set(0, HEAD.cy - 0.15, 0.1);

    const leftDroop = mesh(new THREE.BoxGeometry(0.025, 0.08, 0.025), beardMat, false);
    leftDroop.position.set(0.06, HEAD.cy - 0.07, 0.128);
    leftDroop.rotation.z = 0.25;

    const rightDroop = mesh(new THREE.BoxGeometry(0.025, 0.08, 0.025), beardMat, false);
    rightDroop.position.set(-0.06, HEAD.cy - 0.07, 0.128);
    rightDroop.rotation.z = -0.25;

    g.add(goatee, leftDroop, rightDroop);
    return g;
  }

  if (style === 'long_patriarch') {
    // Long wise elder beard flowing down the upper chest
    const upper = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.11), beardMat, false);
    upper.position.set(0, HEAD.cy - 0.11, 0.085);

    const flowingFall = mesh(new THREE.CylinderGeometry(0.09, 0.04, 0.32, 6), beardMat, false);
    flowingFall.position.set(0, HEAD.cy - 0.26, 0.09);
    flowingFall.rotation.x = 0.15;

    const mustache = mesh(new THREE.BoxGeometry(0.15, 0.045, 0.045), beardMat, false);
    mustache.position.set(0, HEAD.cy - 0.04, 0.134);

    g.add(upper, flowingFall, mustache);
    return g;
  }

  return g;
}

/**
 * Builds battle scar and war paint decals that stick to facial planes.
 */
export function createScarAndWarPaintMesh(
  scar: ScarType,
  warPaint: WarPaintType,
  warPaintColor: string,
): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Face_Decals';

  // --- SCARS (Darkened skin ridge) ---
  if (scar !== 'none') {
    const scarMat = new THREE.MeshStandardMaterial({
      color: '#652d27',
      roughness: 0.9,
      flatShading: true,
    });

    if (scar === 'eye_slash') {
      const slash = mesh(new THREE.BoxGeometry(0.012, 0.08, 0.02), scarMat, false);
      slash.position.set(0.052, HEAD.cy + 0.025, HEAD.r * HEAD.sz + 0.008);
      slash.rotation.z = -0.25;
      slash.rotation.y = 0.2;
      g.add(slash);
    } else if (scar === 'cheek_cross') {
      const bar1 = mesh(new THREE.BoxGeometry(0.012, 0.06, 0.02), scarMat, false);
      bar1.position.set(-0.065, HEAD.cy - 0.04, HEAD.r * HEAD.sz - 0.005);
      bar1.rotation.z = 0.78;
      const bar2 = mesh(new THREE.BoxGeometry(0.012, 0.06, 0.02), scarMat, false);
      bar2.position.set(-0.065, HEAD.cy - 0.04, HEAD.r * HEAD.sz - 0.005);
      bar2.rotation.z = -0.78;
      g.add(bar1, bar2);
    } else if (scar === 'jaw_gash') {
      const gash = mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), scarMat, false);
      gash.position.set(0.04, HEAD.cy - 0.08, HEAD.r * HEAD.sz + 0.005);
      gash.rotation.z = 0.2;
      g.add(gash);
    } else if (scar === 'battle_brow') {
      const browSlash = mesh(new THREE.BoxGeometry(0.07, 0.012, 0.02), scarMat, false);
      browSlash.position.set(-0.02, HEAD.cy + 0.06, HEAD.r * HEAD.sz + 0.005);
      browSlash.rotation.z = -0.15;
      g.add(browSlash);
    }
  }

  // --- WAR PAINT (Vivid ceremonial pigments) ---
  if (warPaint !== 'none') {
    const paintMat = new THREE.MeshStandardMaterial({
      color: warPaintColor || '#0284c7',
      roughness: 0.6,
      flatShading: true,
    });

    if (warPaint === 'woad_lines') {
      // Celtic stripes on cheeks
      for (let i = 0; i < 2; i++) {
        const stripeL = mesh(new THREE.BoxGeometry(0.045, 0.01, 0.02), paintMat, false);
        stripeL.position.set(0.06, HEAD.cy - 0.02 - i * 0.025, HEAD.r * HEAD.sz + 0.002);
        stripeL.rotation.y = 0.35;
        const stripeR = mesh(new THREE.BoxGeometry(0.045, 0.01, 0.02), paintMat, false);
        stripeR.position.set(-0.06, HEAD.cy - 0.02 - i * 0.025, HEAD.r * HEAD.sz + 0.002);
        stripeR.rotation.y = -0.35;
        g.add(stripeL, stripeR);
      }
    } else if (warPaint === 'steppe_chevrons') {
      // Khuzait arrow markings under eyes
      const chevL = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), paintMat, false);
      chevL.position.set(0.05, HEAD.cy, HEAD.r * HEAD.sz);
      chevL.rotation.z = -0.4;
      const chevR = mesh(new THREE.BoxGeometry(0.04, 0.012, 0.02), paintMat, false);
      chevR.position.set(-0.05, HEAD.cy, HEAD.r * HEAD.sz);
      chevR.rotation.z = 0.4;
      g.add(chevL, chevR);
    } else if (warPaint === 'imperial_mark') {
      // Vertical red mark down the forehead to the nose bridge
      const stripe = mesh(new THREE.BoxGeometry(0.018, 0.09, 0.02), paintMat, false);
      stripe.position.set(0, HEAD.cy + 0.045, HEAD.r * HEAD.sz + 0.005);
      g.add(stripe);
    } else if (warPaint === 'ash_smear') {
      const ashMat = new THREE.MeshStandardMaterial({ color: '#262626', roughness: 0.9 });
      const smear = mesh(new THREE.BoxGeometry(0.1, 0.04, 0.02), ashMat, false);
      smear.position.set(-0.02, HEAD.cy - 0.03, HEAD.r * HEAD.sz);
      smear.rotation.z = 0.15;
      g.add(smear);
    }
  }

  return g;
}

/* -----------------------------------------------------------------------
 * APPLY MORPH DNA TO CHARACTER RIG
 * ----------------------------------------------------------------------- */

/**
 * Dynamically scales bones, replaces hair/beard meshes, and applies skin/hair materials
 * without destroying the rig or breaking animation/IK hierarchy.
 */
export function applyMorphDNAToRig(rig: CharacterRig, dna: CharacterMorphDNA): void {
  // 1. Update Rig Colors & Materials
  if (dna.skinTone) {
    rig.materials.skin.color.set(dna.skinTone);
  }
  if (dna.hairColor) {
    rig.materials.hair.color.set(dna.hairColor);
  }

  // 2. Body Scaling & Stature Proportions
  // Height scales root Y & leg lengths
  const hScale = Math.max(0.85, Math.min(1.22, dna.height || 1.0));
  const bScale = Math.max(0.78, Math.min(1.38, dna.build || 1.0)); // Shoulders, chest
  const wScale = Math.max(0.82, Math.min(1.35, dna.weight || 1.0)); // Belly, girth

  // Scale Pelvis & Torso girth
  rig.pelvis.scale.set(wScale, hScale, wScale);
  rig.torso.scale.set(bScale, 1.0, (bScale + wScale) * 0.5);

  // Female silhouette adjustment: slightly narrower shoulders, higher waist taper
  if (dna.gender === 'female') {
    rig.leftShoulder.position.x = 0.28 * bScale;
    rig.rightShoulder.position.x = -0.28 * bScale;
  } else {
    rig.leftShoulder.position.x = 0.32 * bScale;
    rig.rightShoulder.position.x = -0.32 * bScale;
  }

  // Legs length scaling
  const legScale = (dna.legLength || 1.0) * hScale;
  rig.leftThigh.scale.set(1.0, legScale, 1.0);
  rig.rightThigh.scale.set(1.0, legScale, 1.0);

  // Arms length scaling
  const armScale = dna.armLength || 1.0;
  rig.leftUpperArm.scale.set(bScale * 0.9, armScale, bScale * 0.9);
  rig.rightUpperArm.scale.set(bScale * 0.9, armScale, bScale * 0.9);

  // 3. Head & Facial Morphology Scaling
  const jaw = Math.max(0.75, Math.min(1.35, dna.jawWidth || 1.0));
  const chin = Math.max(0.75, Math.min(1.35, dna.chinLength || 1.0));
  const nose = Math.max(0.7, Math.min(1.4, dna.noseLength || 1.0));

  rig.head.scale.set(jaw, chin, (jaw + nose) * 0.5);

  // 4. Hair Replacement
  // Remove existing procedural hair from hairGroup
  while (rig.hairGroup.children.length > 0) {
    const c = rig.hairGroup.children[0];
    rig.hairGroup.remove(c);
    if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
  }

  const newHair = createHairMesh(dna.hairStyle, rig.materials.hair);
  rig.hairGroup.add(newHair);

  // 5. Beard Replacement
  // Hide legacy beardMesh and replace with full procedural beard if attached
  rig.beardMesh.visible = false;

  let customBeard = rig.head.getObjectByName('Custom_Procedural_Beard');
  if (customBeard) {
    rig.head.remove(customBeard);
    customBeard.traverse((child) => {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
    });
  }

  const isEnclosed = rig.currentOptions.helmetType === 'IMPERIAL_VISOR';
  if (dna.beardStyle !== 'clean_shaven' && !isEnclosed && dna.gender !== 'female') {
    const beardGroup = createBeardMesh(dna.beardStyle, rig.materials.hair);
    beardGroup.name = 'Custom_Procedural_Beard';
    rig.head.add(beardGroup);
  }

  // 6. Face Decals (Scars & War Paint)
  let existingDecals = rig.head.getObjectByName('Face_Decals');
  if (existingDecals) {
    rig.head.remove(existingDecals);
    existingDecals.traverse((child) => {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
    });
  }

  if (dna.scar !== 'none' || dna.warPaint !== 'none') {
    const decals = createScarAndWarPaintMesh(dna.scar, dna.warPaint, dna.warPaintColor);
    rig.head.add(decals);
  }
}
