/**
 * deployment.ts — 10.2/B3: Order of Battle konuşlanma fazının saf mantığı.
 *
 * Bannerlord'da oyuncu tarafında ~20+ asker varken savaş, konuşlanma
 * fazıyla açılır: kamera sahneyi üstten görür, bölükler (en çok 8) tür +
 * filtreyle kurulur, oyuncu bölükleri diziliş bölgesi içinde konum/yön/
 * genişlik vererek yerleştirir, ayarlar savaşlar arasında hatırlanır ve
 * "Ready" ile savaş başlar (e1.7.0 Order of Battle tanımı; varsayılan
 * bölük numaraları 1 Piyade, 2 Okçu, 3 Süvari, 4 Atlı Okçu).
 *
 * Bu modül yalnız geometri/kural üretir (three/React bilmez):
 * - bölük yuva (slot) çözümü: `tacticalFormation.computeFormationSlots`
 *   çekirdeği sınıf aralığı + cephe genişliği seçenekleriyle sarılır,
 *   Çember/Kol düzenleri burada eklenir;
 * - diziliş bölgesi sınırları ve kelepçesi.
 *
 * Filtreler (Kalkan/Mızrak/Fırlatma/Ağır) + yüzde kaydırıcılarıyla özel
 * bölükler (5–8) ve kaptan atama, aktör = tekil asker tipi seviyesine
 * (B5) bağlıdır; B3 çekirdeği dört sınıf bölüğüdür.
 */
import type { UnitTierId } from './rules';
import { computeFormationSlots, type FormationSlot } from './tacticalFormation';

/** Konuşlanma fazı için gereken en az oyuncu askeri (Bannerlord ~20). */
export const DEPLOYMENT_MIN_TROOPS = 20;

/** Bannerlord varsayılan bölük numaraları: 1 Piyade, 2 Okçu, 3 Süvari, 4 Atlı Okçu. */
export const DIVISION_NUMBER: Record<UnitTierId, number> = {
  infantry: 1,
  archer: 2,
  cavalry: 3,
  horseArcher: 4,
};

export const DIVISION_ORDER: UnitTierId[] = ['infantry', 'archer', 'cavalry', 'horseArcher'];

export const DIVISION_LABEL: Record<UnitTierId, string> = {
  infantry: 'Piyade',
  archer: 'Okçu',
  cavalry: 'Süvari',
  horseArcher: 'Atlı Okçu',
};

/**
 * Konuşlanma dizilişleri. LINE/SHIELD_WALL/LOOSE/WEDGE çekirdeği
 * tacticalFormation'dandır; CIRCLE/SQUARE/COLUMN Bannerlord F3 listesinin
 * geri kalanından B3'e alınanlardır (Serbest/Scatter B4 emirleriyle gelir).
 */
export type DeployFormation =
  | 'LINE'
  | 'SHIELD_WALL'
  | 'LOOSE'
  | 'WEDGE'
  | 'CIRCLE'
  | 'SQUARE'
  | 'COLUMN';

export const DEPLOY_FORMATION_LABEL: Record<DeployFormation, string> = {
  LINE: 'Hat',
  SHIELD_WALL: 'Kalkan Duvarı',
  LOOSE: 'Seyrek',
  WEDGE: 'Kama',
  CIRCLE: 'Çember',
  SQUARE: 'Kare',
  COLUMN: 'Kol',
};

/** Yaya bölükte F ile dönülen diziliş sırası. */
export const FORMATION_CYCLE_FOOT: DeployFormation[] = [
  'LINE',
  'SHIELD_WALL',
  'LOOSE',
  'CIRCLE',
  'SQUARE',
  'COLUMN',
];

/** Atlı bölükte diziliş sırası (kalkan duvarı/çember/kare yaya düzenleridir). */
export const FORMATION_CYCLE_MOUNTED: DeployFormation[] = ['LINE', 'WEDGE', 'LOOSE', 'COLUMN'];

export function formationCycleFor(cls: UnitTierId): DeployFormation[] {
  return cls === 'cavalry' || cls === 'horseArcher'
    ? FORMATION_CYCLE_MOUNTED
    : FORMATION_CYCLE_FOOT;
}

export function nextFormation(cls: UnitTierId, current: DeployFormation): DeployFormation {
  const cycle = formationCycleFor(cls);
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}

/** Sınıf baz aralığı (B1 şerit ölçüleriyle aynı: piyade sık, atlı at genişliği ister). */
export function classGap(cls: UnitTierId): number {
  switch (cls) {
    case 'infantry':
      return 1.35;
    case 'archer':
      return 1.7;
    default:
      return 2.6;
  }
}

/** Varsayılan cephe genişliği (sıra başına nefer) — B1 şeritleriyle aynı. */
export function defaultPerRow(cls: UnitTierId): number {
  return cls === 'cavalry' || cls === 'horseArcher' ? 6 : 12;
}

export const MIN_PER_ROW = 3;
export const MAX_PER_ROW = 24;

/**
 * Diziliş bölgesi (müttefik tarafı): doğuş kenarından orta sahaya doğru
 * cömert bir kutu. Alan 460×460 (yarı 230), müttefik doğuşu z=+182;
 * bölge z ∈ [55, 218], x ∈ [-175, 175].
 */
export const DEPLOY_ZONE = { minX: -175, maxX: 175, minZ: 55, maxZ: 218 } as const;

export function clampToDeployZone(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(DEPLOY_ZONE.maxX, Math.max(DEPLOY_ZONE.minX, x)),
    z: Math.min(DEPLOY_ZONE.maxZ, Math.max(DEPLOY_ZONE.minZ, z)),
  };
}

/**
 * Bir bölüğün dünya yuvalarını çözer. LINE/SHIELD_WALL/LOOSE/WEDGE
 * tacticalFormation çekirdeğine sınıf aralığı + cephe genişliğiyle
 * devreder; COLUMN dar cepheli hattır; CIRCLE/SQUARE çevre düzenleridir
 * (neferler dışa bakar).
 */
export function computeDivisionSlots(
  cls: UnitTierId,
  count: number,
  anchor: { x: number; z: number; facing: number },
  formation: DeployFormation,
  perRow: number,
): FormationSlot[] {
  if (count <= 0) return [];
  const gap = classGap(cls);

  if (formation === 'CIRCLE' || formation === 'SQUARE') {
    return computePerimeterSlots(count, anchor, formation, gap);
  }
  if (formation === 'COLUMN') {
    return computeFormationSlots(count, anchor, 'LINE', {
      spacingX: gap,
      spacingZ: 1.7,
      maxCols: Math.max(3, Math.ceil(perRow / 3)),
    });
  }
  if (formation === 'WEDGE') {
    return computeFormationSlots(count, anchor, 'WEDGE', {
      spacingX: gap * 0.95,
      spacingZ: 1.7,
    });
  }
  if (formation === 'SHIELD_WALL') {
    return computeFormationSlots(count, anchor, 'SHIELD_WALL', {
      spacingX: gap * 0.68,
      spacingZ: 1.15,
      maxCols: perRow,
    });
  }
  if (formation === 'LOOSE') {
    return computeFormationSlots(count, anchor, 'LOOSE', {
      spacingX: gap * 1.9,
      spacingZ: 1.7 * 1.9,
      maxCols: perRow,
    });
  }
  return computeFormationSlots(count, anchor, 'LINE', {
    spacingX: gap,
    spacingZ: 1.7,
    maxCols: perRow,
  });
}

/**
 * Çevre düzenleri: neferler, çevre uzunluğu asker sayısı × sınıf aralığına
 * uydurulan tek çember/kare üstünde dışa bakar (Bannerlord çemberinde yarıçap
 * bölük büyüklüğüyle ölçeklenir). Yerel eksen: u = sağ, v = geri;
 * dünya = anchor + right*u - fwd*v.
 */
function computePerimeterSlots(
  count: number,
  anchor: { x: number; z: number; facing: number },
  formation: 'CIRCLE' | 'SQUARE',
  gap: number,
): FormationSlot[] {
  const fwdX = Math.sin(anchor.facing);
  const fwdZ = Math.cos(anchor.facing);
  const rightX = -Math.cos(anchor.facing);
  const rightZ = Math.sin(anchor.facing);
  const slots: FormationSlot[] = [];

  const pushLocal = (u: number, v: number) => {
    const len = Math.hypot(u, v);
    // Dışa bakış: yerel yönün ileri bileşeni = -v, sağ bileşeni = u.
    // "Sağ" vektörü forward(a-π/2) olduğundan bakış açısı a - atan2(u, -v)'dir.
    const facingOffset = len > 0.01 ? -Math.atan2(u, -v) : 0;
    slots.push({
      x: anchor.x + rightX * u - fwdX * v,
      z: anchor.z + rightZ * u - fwdZ * v,
      facing: anchor.facing + facingOffset,
      rank: 0,
      file: u,
    });
  };

  if (formation === 'CIRCLE') {
    const radius = Math.max(2.2, (count * gap) / (2 * Math.PI));
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2;
      pushLocal(Math.sin(theta) * radius, -Math.cos(theta) * radius);
    }
    return slots;
  }

  // Kare: çevre = 8 × yarı kenar; neferler yay uzunluğuyla eşit dağıtılır.
  const half = Math.max(2.0, (count * gap) / 8);
  const perimeter = half * 8;
  for (let i = 0; i < count; i++) {
    let d = ((i + 0.5) / count) * perimeter;
    // Ön kenar (v=-half): u = -half → +half
    if (d < half * 2) {
      pushLocal(-half + d, -half);
      continue;
    }
    d -= half * 2;
    // Sağ kenar (u=+half): v = -half → +half
    if (d < half * 2) {
      pushLocal(half, -half + d);
      continue;
    }
    d -= half * 2;
    // Arka kenar (v=+half): u = +half → -half
    if (d < half * 2) {
      pushLocal(half - d, half);
      continue;
    }
    d -= half * 2;
    // Sol kenar (u=-half): v = +half → -half
    pushLocal(-half, half - d);
  }
  return slots;
}
