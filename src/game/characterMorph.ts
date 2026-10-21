import * as THREE from 'three';
import { CharacterRig, HEAD, RIG_DIMENSIONS, TORSO_DEPTH_SCALE } from './characterRig.ts';
import { applyFaceDNA, faceShapeScale } from './characterFace.ts';
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
      new THREE.SphereGeometry(HEAD.r + 0.016, 8, 4, 0, Math.PI * 2, 0, (Math.PI * 3.25) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    // Side part fringe (swept left-to-right)
    const fringe = mesh(new THREE.BoxGeometry(0.115, 0.028, 0.042), hairMat, false);
    fringe.position.set(0.038, HEAD.cy + 0.105, (HEAD.r + 0.008) * HEAD.sz - 0.012);
    fringe.rotation.z = -0.14;
    fringe.rotation.x = -0.2;

    // Back taper — SADECE ense: tam 360° silindir yüzün ortasından bant gibi
    // geçip gözleri kapatıyordu. thetaStart/thetaLength ile arka yayla sınırla.
    const back = mesh(
      new THREE.CylinderGeometry(
        HEAD.r + 0.014,
        HEAD.r + 0.008,
        0.1,
        7,
        1,
        true,
        Math.PI * 0.55,
        Math.PI * 0.9,
      ),
      hairMat,
      false,
    );
    back.material = hairMat;
    (back.material as THREE.Material).side = THREE.DoubleSide;
    back.scale.set(1, 1, HEAD.sz);
    back.position.set(0, HEAD.cy - 0.04, -0.012);

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
    leftBraid.position.set(0.115, HEAD.cy - 0.075, -0.03);
    leftBraid.rotation.z = -0.1;
    leftBraid.rotation.x = 0.06;

    // Right braid hanging down
    const rightBraid = mesh(braidGeo.clone(), hairMat, false);
    rightBraid.position.set(-0.115, HEAD.cy - 0.075, -0.03);
    rightBraid.rotation.z = 0.1;
    rightBraid.rotation.x = 0.06;

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
      new THREE.SphereGeometry(HEAD.r + 0.02, 8, 5, 0, Math.PI * 2, 0, (Math.PI * 3.35) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    const leftFlow = mesh(new THREE.BoxGeometry(0.05, 0.26, 0.1), hairMat, false);
    leftFlow.position.set(0.116, HEAD.cy - 0.085, -0.062);
    leftFlow.rotation.y = 0.12;

    const rightFlow = mesh(new THREE.BoxGeometry(0.05, 0.26, 0.1), hairMat, false);
    rightFlow.position.set(-0.116, HEAD.cy - 0.085, -0.062);
    rightFlow.rotation.y = -0.12;

    const backFlow = mesh(new THREE.BoxGeometry(0.24, 0.28, 0.06), hairMat, false);
    backFlow.position.set(0, HEAD.cy - 0.09, -HEAD.r * HEAD.sz - 0.025);

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
    const fringe = mesh(new THREE.BoxGeometry(0.135, 0.024, 0.03), hairMat, false);
    fringe.position.set(0, HEAD.cy + 0.098, (HEAD.r + 0.008) * HEAD.sz - 0.008);

    g.add(cap, fringe);
    return g;
  }

  if (style === 'royal_braid') {
    // Aristocratic crown braid wrapped around head (Rhagaea style)
    const cap = mesh(
      new THREE.SphereGeometry(HEAD.r + 0.016, 8, 4, 0, Math.PI * 2, 0, (Math.PI * 3.25) / 8),
      hairMat,
      false,
    );
    cap.scale.set(1, HEAD.sy, HEAD.sz);
    cap.position.y = HEAD.cy;

    // Crown braid torus wrapping the brow
    const crownBraid = mesh(new THREE.TorusGeometry(HEAD.r + 0.015, 0.022, 4, 10), hairMat, false);
    crownBraid.rotation.x = Math.PI * 0.38;
    crownBraid.position.set(0, HEAD.cy + 0.085, -0.005);

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
  if (style === 'clean_shaven') return g;

  /* ── anatomi (kafa eklemi yerel uzayı) ──
     kafatası: rx 0.125 · ry 0.147 · rz 0.131, merkez y = 0.14
     alt dudak y ≈ 0.0595 · çene ön yüzeyi z ≈ 0.096                  */
  const CY = HEAD.cy;
  const JAW_TOP = CY - 0.088; // alt dudağın hemen altı
  const CHIN_Y = CY - 0.205; // çene ucu

  /** Kafatası yüzeyinin ön z'si — sakal/bıyık yüzün DIŞINA otursun. */
  const surfZ = (y: number, x = 0) => {
    const nx = x / HEAD.r;
    const ny = (y - CY) / (HEAD.r * HEAD.sy);
    return HEAD.r * HEAD.sz * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  };

  /**
   * Alt dudaktan çeneye inen SAĞLAM sakal kütlesi.
   * Eski sürümde üst üste binen kutular kafatasını kesip "kıymık" gibi
   * görünüyordu. Tek parça altıgen prizma hem ucuz (12 üçgen) hem temiz.
   */
  const mass = (
    topRadius: number,
    bottomRadius: number,
    height: number,
    yBottom: number,
    zOffset: number,
    mat: THREE.Material = beardMat,
  ) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, 7), mat);
    // Ön-arka yönde yassılaştır: sakal çeneyi sarar, enseden taşmaz.
    m.scale.set(1.02, 1, 0.82);
    m.position.set(0, yBottom + height / 2, zOffset);
    m.rotation.x = -0.05;
    m.castShadow = false;
    return m;
  };

  /** Bıyık: dudakların üstünde, ince ve hafif öne kıvrık. */
  const mustache = (width = 0.058, y = CY - 0.052) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.013, 0.02), beardMat);
    m.position.set(0, y, surfZ(y) - 0.002);
    m.rotation.x = 0.2;
    m.castShadow = false;
    return m;
  };

  if (style === 'stubble') {
    // Gölge: yarı saydam, yassı tek parça (ağız tamamen açık kalır).
    const shadow = beardMat.clone();
    shadow.transparent = true;
    shadow.opacity = 0.34;
    shadow.depthWrite = false;
    g.add(mass(0.084, 0.058, 0.07, JAW_TOP - 0.076, 0.052, shadow));
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.007, 0.01), shadow);
    line.position.set(0, JAW_TOP - 0.002, surfZ(JAW_TOP) - 0.002);
    line.castShadow = false;
    g.add(line);
    return g;
  }

  if (style === 'full_beard') {
    g.add(mustache());
    g.add(mass(0.078, 0.054, 0.09, JAW_TOP - 0.082, 0.05));
    // çene ucu: sivri koni
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.075, 6), beardMat);
    tip.rotation.x = Math.PI;
    tip.position.set(0, CHIN_Y + 0.012, 0.062);
    tip.castShadow = false;
    g.add(tip);
    return g;
  }

  if (style === 'braided_viking') {
    g.add(mustache(0.062));
    g.add(mass(0.073, 0.05, 0.082, JAW_TOP - 0.08, 0.05));
    for (const side of [-1, 1] as const) {
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.008, 0.15, 5), beardMat);
      braid.position.set(side * 0.032, CHIN_Y + 0.02, 0.062);
      braid.rotation.z = side * 0.05;
      braid.castShadow = false;
      g.add(braid);
    }
    return g;
  }

  if (style === 'imperial_mustache') {
    g.add(mustache(0.054, CY - 0.056));
    for (const side of [-1, 1] as const) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.011, 0.016), beardMat);
      wing.position.set(side * 0.042, CY - 0.048, surfZ(CY - 0.048, 0.042) + 0.006);
      wing.rotation.z = side * 0.55;
      wing.castShadow = false;
      g.add(wing);
    }
    // sinekkaydı çene gölgesi
    const trim = beardMat.clone();
    trim.transparent = true;
    trim.opacity = 0.4;
    trim.depthWrite = false;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.008), trim);
    plate.position.set(0, JAW_TOP - 0.012, surfZ(JAW_TOP - 0.012) + 0.001);
    plate.castShadow = false;
    g.add(plate);
    return g;
  }

  if (style === 'nomad_goatee') {
    g.add(mustache(0.05, CY - 0.056));
    const goatee = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.105, 5), beardMat);
    goatee.rotation.x = Math.PI;
    goatee.position.set(0, JAW_TOP - 0.075, 0.094);
    goatee.castShadow = false;
    g.add(goatee);
    for (const side of [-1, 1] as const) {
      const droop = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.016), beardMat);
      droop.position.set(side * 0.032, JAW_TOP - 0.03, 0.1);
      droop.rotation.z = side * -0.15;
      droop.castShadow = false;
      g.add(droop);
    }
    return g;
  }

  if (style === 'long_patriarch') {
    g.add(mustache(0.058));
    g.add(mass(0.08, 0.055, 0.102, JAW_TOP - 0.09, 0.05));
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.046, 0.11, 6), beardMat);
    mid.position.set(0, CHIN_Y - 0.03, 0.05);
    mid.castShadow = false;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.1, 6), beardMat);
    tip.rotation.x = Math.PI;
    tip.position.set(0, CHIN_Y - 0.125, 0.048);
    tip.castShadow = false;
    g.add(mid, tip);
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

  // 2. Gövde oranları — HER ÖLÇEK BİR KEZ.
  //    Omuz/kol `torso`nun, bacak `pelvis`in çocuğu; ebeveyn ölçeği zaten
  //    aşağı yansıyor. Eski kod bScale/hScale'i tekrar çarpıyordu:
  //    omuz açıklığı 0.40–1.32, boy 1.88–2.70 oluyor ve zırhlar oturmuyordu.
  const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const hScale = clampN(dna.height || 1.0, 0.92, 1.12);
  const bScale = clampN(dna.build || 1.0, 0.86, 1.24);
  const wScale = clampN(dna.weight || 1.0, 0.88, 1.28);

  // Karın/hip derinliği: pelvis yalnız derinlikte büyür (boyu kısaltmaz,
  // kafayı uzatmaz → oblong kafa sorunu).
  rig.pelvis.scale.set(1, 1, Math.max(1, wScale * 0.9));
  // Göğüs: genişlik build'den, derinlik build+weight ortalamasından.
  rig.torso.scale.set(bScale, 1.0, (bScale + wScale) * 0.5);

  // Omuz açıklığı: taban ölçü ✕ yalnız cinsiyet faktörü.
  const shoulderX = RIG_DIMENSIONS.shoulderX * (dna.gender === 'female' ? 0.92 : 1.0);
  rig.leftShoulder.position.x = shoulderX;
  rig.rightShoulder.position.x = -shoulderX;

  // Bacak: boy farkı buradan gelir (uzun bacak = uzun insan).
  const legScale = (dna.legLength || 1.0) * hScale;
  rig.leftThigh.scale.set(1.0, legScale, 1.0);
  rig.rightThigh.scale.set(1.0, legScale, 1.0);

  // Kol: yalnız uzunluk; kalınlık `torso` ölçeğinden gelir.
  const armScale = clampN(dna.armLength || 1.0, 0.88, 1.12);
  rig.leftUpperArm.scale.set(1.0, armScale, 1.0);
  rig.rightUpperArm.scale.set(1.0, armScale, 1.0);

  // 3. Kafa & yüz morfolojisi.
  //    Çene/elmacık DNA'sı 0.75–1.35 arası çarpıldığında kafa 1.8 kat uzuyordu
  //    (yüz "maske" gibi görünüyordu). Oranı sınırlıyoruz: şekil farkı kalır,
  //    oblong kafa oluşmaz.
  const jaw = clampN(dna.jawWidth || 1.0, 0.86, 1.16);
  const chin = clampN(dna.chinLength || 1.0, 0.86, 1.16);
  const nose = clampN(dna.noseLength || 1.0, 0.85, 1.2);
  const shape = faceShapeScale(dna.faceShape);

  const sx = jaw * shape.x;
  const syNatural = chin * shape.y;
  const sy = sx * clampN(syNatural / sx, 0.9, 1.12);
  rig.head.scale.set(sx, sy, (jaw + nose) * 0.5 * shape.z);

  // 3a. Boyun/çene hizası: kafa ölçeği değiştiğinde çene ile gövde arasındaki
  //     boşluk -0.14…+0.14 arasında salınıyordu (kiminde gömük, kiminde
  //     "zürafa" boyun). Çeneyi gövde tepesine sabit bir boşlukla oturtuyoruz.
  rig.root.updateMatrixWorld(true);
  // Çene referansı **kafatasıdır**: sakal kutuya girerse çene yanlış ölçülür.
  const skullTmp = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as
    | THREE.Mesh
    | undefined;
  const torsoMeshTmp = rig.torso.children.find((c) => (c as THREE.Mesh).isMesh) as
    | THREE.Mesh
    | undefined;
  if (skullTmp && torsoMeshTmp) {
    const chinY = new THREE.Box3().setFromObject(skullTmp).min.y;
    const torsoTop = new THREE.Box3().setFromObject(torsoMeshTmp).max.y;
    rig.head.position.y -= chinY - torsoTop - 0.02;
    rig.root.updateMatrixWorld(true);
  }

  // 3b. Yere oturt: bacak uzunluğu değiştiğinde ayaklar y=0'da kalsın.
  rig.root.updateMatrixWorld(true);
  const feetBox = new THREE.Box3();
  feetBox.union(new THREE.Box3().setFromObject(rig.leftFoot));
  feetBox.union(new THREE.Box3().setFromObject(rig.rightFoot));
  if (!feetBox.isEmpty()) rig.pelvis.position.y -= feetBox.min.y;

  // Yüz katmanı: göz rengi, burun, kaş, çene, yanak, ağız DNA'ya göre güncellenir.
  applyFaceDNA(rig.head.getObjectByName('Face') ?? null, dna, { skin: rig.materials.skin, hair: rig.materials.hair });

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
