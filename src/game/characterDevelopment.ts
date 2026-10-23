/**
 * characterDevelopment.ts — P4: Kullanım bazlı beceri ve karakter gelişim motoru.
 *
 * Bannerlord matematik modeline sadık kalır:
 * - 18 beceri, 6 ana niteliğe (VIGOR, CONTROL, ENDURANCE, CUNNING, SOCIAL, INTELLIGENCE) bağlıdır.
 * - Öğrenme Sınırı (Learning Limit): Odak ve Nitelik puanı ile belirlenen yumuşak sınır.
 * - Öğrenme Hızı (Learning Rate): Becerinin sınırla ilişkisine göre x0.0 ile x3.0 arası çarpan.
 * - Karakter Seviyesi: Beceriler seviye atladıkça kazanılan karakter tecrübesiyle ilerler.
 * - Seviye Ödülleri: Her seviyede 1 Odak, her 4 seviyede 1 Nitelik puanı.
 */

import type {
  AttributeId,
  BannerlordSkillId,
  CampaignHero,
  CampaignState,
  HeroSkillState,
} from './rules.ts';
import { PLAYER_HERO_ID } from './bannerlordFoundation.ts';

export const SKILL_ATTRIBUTE_MAP: Record<BannerlordSkillId, AttributeId> = {
  oneHanded: 'VIGOR',
  twoHanded: 'VIGOR',
  polearm: 'VIGOR',
  bow: 'CONTROL',
  crossbow: 'CONTROL',
  throwing: 'CONTROL',
  riding: 'ENDURANCE',
  athletics: 'ENDURANCE',
  smithing: 'ENDURANCE',
  scouting: 'CUNNING',
  tactics: 'CUNNING',
  roguery: 'CUNNING',
  charm: 'SOCIAL',
  leadership: 'SOCIAL',
  trade: 'SOCIAL',
  steward: 'INTELLIGENCE',
  medicine: 'INTELLIGENCE',
  engineering: 'INTELLIGENCE',
};

export const ATTRIBUTE_SKILLS_MAP: Record<AttributeId, BannerlordSkillId[]> = {
  VIGOR: ['oneHanded', 'twoHanded', 'polearm'],
  CONTROL: ['bow', 'crossbow', 'throwing'],
  ENDURANCE: ['riding', 'athletics', 'smithing'],
  CUNNING: ['scouting', 'tactics', 'roguery'],
  SOCIAL: ['charm', 'leadership', 'trade'],
  INTELLIGENCE: ['steward', 'medicine', 'engineering'],
};

export const SKILL_LABELS: Record<BannerlordSkillId, string> = {
  oneHanded: 'Tek Elli Silahlar',
  twoHanded: 'Çift Elli Silahlar',
  polearm: 'Gönderli Silahlar',
  bow: 'Yay',
  crossbow: 'Kundaklı Yay',
  throwing: 'Fırlatma',
  riding: 'Binicilik',
  athletics: 'Atletizm',
  smithing: 'Demircilik',
  scouting: 'İzcilik',
  tactics: 'Taktik',
  roguery: 'Serserilik',
  charm: 'Cazibe',
  leadership: 'Liderlik',
  trade: 'Ticaret',
  steward: 'İdarecilik',
  medicine: 'Hekimlik',
  engineering: 'Mühendislik',
};

export const ATTRIBUTE_LABELS: Record<AttributeId, { name: string; desc: string }> = {
  VIGOR: { name: 'Zindelik', desc: 'Yakın dövüş gücü ve silah savurma hızı' },
  CONTROL: { name: 'Kontrol', desc: 'Menzilli silah isabeti ve germe kuvveti' },
  ENDURANCE: { name: 'Dayanıklılık', desc: 'Fiziksel direnç, binek kontrolü ve zanaat' },
  CUNNING: { name: 'Kurnazlık', desc: 'Hile, iz sürme önsezisi ve askeri strateji' },
  SOCIAL: { name: 'Sosyallik', desc: 'İkna kabiliyeti, liderlik ve ticaret' },
  INTELLIGENCE: { name: 'Zeka', desc: 'Lojistik idare, cerrahi tıp ve kuşatma mühendisliği' },
};

/**
 * Bannerlord yumuşak öğrenme sınırı:
 * Taban 10 + (Nitelik - 1) * 14 + Odak * 40
 */
export function calculateLearningLimit(attributeValue: number, focusPoints: number): number {
  const safeAttr = Math.max(1, Math.min(10, attributeValue));
  const safeFocus = Math.max(0, Math.min(5, focusPoints));
  return (safeAttr - 1) * 14 + safeFocus * 40 + 10;
}

/**
 * Bannerlord öğrenme hızı çarpanı:
 * Becerinin seviyesi sınırın altındayken yüksek hız (x1.0 - x3.0),
 * sınır aşıldığında kademeli olarak sıfıra düşer (Sert tavan: Sınır + 60).
 */
export function calculateLearningRate(
  skillLevel: number,
  attributeValue: number,
  focusPoints: number,
): number {
  const limit = calculateLearningLimit(attributeValue, focusPoints);
  const hardCap = limit + 60;
  if (skillLevel >= hardCap) return 0;

  // Temel çarpan: her odak puanı +0.4, her nitelik +0.1 çarpan katar
  const baseMultiplier = 1.0 + focusPoints * 0.4 + (Math.max(1, attributeValue) - 1) * 0.1;

  if (skillLevel <= limit) {
    const ratio = skillLevel / Math.max(1, limit);
    return Math.max(0.3, baseMultiplier * (1.0 - ratio * 0.35));
  } else {
    // Sınır aşımı durumunda yumuşak sönümleme
    const overflow = skillLevel - limit;
    const decay = Math.max(0, 1 - overflow / 60);
    return Number((baseMultiplier * 0.65 * decay).toFixed(3));
  }
}

/**
 * Becerinin bir sonraki seviyeye geçmesi için gereken tecrübe puanı (XP).
 */
export function getXpRequiredForSkillLevel(currentLevel: number): number {
  const lvl = Math.max(0, currentLevel);
  return (lvl + 1) * 25 + Math.floor(Math.pow(lvl, 1.35) * 6);
}

/**
 * Karakterin (Kahramanın) bir sonraki seviyeye geçmesi için gereken toplam Karakter XP'si.
 */
export function getCharacterXpRequired(currentHeroLevel: number): number {
  const lvl = Math.max(1, currentHeroLevel);
  return lvl * 600 + Math.floor(Math.pow(lvl, 1.5) * 120);
}

export interface SkillXpResult {
  hero: CampaignHero;
  skillLeveledUp: boolean;
  newSkillLevel: number;
  levelsGained: number;
  characterLeveledUp: boolean;
  newHeroLevel: number;
  gainedFocus: number;
  gainedAttributes: number;
}

/**
 * Bir kahramana kullanım bazlı beceri tecrübesi (XP) ekler.
 * Öğrenme hızı (learning rate) uygulanır. Gereken XP dolunca seviye atlatılır.
 * Kazanılan beceri seviyeleri ana karakter seviyesine de tecrübe aktarır.
 */
export function addSkillXpToHero(
  hero: CampaignHero,
  skillId: BannerlordSkillId,
  rawXp: number,
): SkillXpResult {
  if (rawXp <= 0) {
    const current = hero.skills[skillId] ?? { level: 0, focus: 0, xp: 0 };
    return {
      hero,
      skillLeveledUp: false,
      newSkillLevel: current.level,
      levelsGained: 0,
      characterLeveledUp: false,
      newHeroLevel: hero.level,
      gainedFocus: 0,
      gainedAttributes: 0,
    };
  }

  const attrId = SKILL_ATTRIBUTE_MAP[skillId];
  const attrVal = hero.attributes[attrId] ?? 2;
  const currentSkill: HeroSkillState = hero.skills[skillId]
    ? { ...hero.skills[skillId] }
    : { level: 10, focus: 0, xp: 0 };

  const rate = calculateLearningRate(currentSkill.level, attrVal, currentSkill.focus);
  const effectiveXp = Math.round(rawXp * rate);

  let curSkillLevel = currentSkill.level;
  let curSkillXp = currentSkill.xp + effectiveXp;
  let levelsGained = 0;

  // Seviye atlama döngüsü
  let req = getXpRequiredForSkillLevel(curSkillLevel);
  while (curSkillXp >= req && curSkillLevel < 300) {
    curSkillXp -= req;
    curSkillLevel += 1;
    levelsGained += 1;
    req = getXpRequiredForSkillLevel(curSkillLevel);
  }

  // Karakter Seviyesi İlerlemesi
  let charXpGained = 0;
  if (levelsGained > 0) {
    charXpGained = levelsGained * (curSkillLevel * 10);
  }

  let curHeroLevel = hero.level || 1;
  let curHeroXp = (hero.xp || 0) + charXpGained;
  let gainedFocus = 0;
  let gainedAttributes = 0;
  let charReq = getCharacterXpRequired(curHeroLevel);

  while (curHeroXp >= charReq) {
    curHeroXp -= charReq;
    curHeroLevel += 1;
    gainedFocus += 1;
    if (curHeroLevel % 4 === 0) {
      gainedAttributes += 1;
    }
    charReq = getCharacterXpRequired(curHeroLevel);
  }

  const nextHero: CampaignHero = {
    ...hero,
    level: curHeroLevel,
    xp: curHeroXp,
    freeFocusPoints: (hero.freeFocusPoints || 0) + gainedFocus,
    freeAttributePoints: (hero.freeAttributePoints || 0) + gainedAttributes,
    skills: {
      ...hero.skills,
      [skillId]: {
        level: curSkillLevel,
        focus: currentSkill.focus,
        xp: curSkillXp,
      },
    },
  };

  return {
    hero: nextHero,
    skillLeveledUp: levelsGained > 0,
    newSkillLevel: curSkillLevel,
    levelsGained,
    characterLeveledUp: curHeroLevel > (hero.level || 1),
    newHeroLevel: curHeroLevel,
    gainedFocus,
    gainedAttributes,
  };
}

/**
 * Kahramana 1 Odak Puanı verir.
 * Maksimum 5 odak puanı verilebilir.
 * Bannerlord kuralı: Odak vermek beceri seviyesini doğrudan ARTIRMAZ, öğrenme sınırını ve hızını artırır.
 */
export function allocateHeroFocus(
  hero: CampaignHero,
  skillId: BannerlordSkillId,
): { success: boolean; reason?: string; hero: CampaignHero } {
  const freeFocus = hero.freeFocusPoints || 0;
  if (freeFocus <= 0) {
    return { success: false, reason: 'Kullanılabilir Odak Puanı kalmadı.', hero };
  }
  const currentSkill = hero.skills[skillId] ?? { level: 10, focus: 0, xp: 0 };
  if (currentSkill.focus >= 5) {
    return { success: false, reason: 'Bir beceriye en fazla 5 Odak Puanı verilebilir.', hero };
  }

  const nextHero: CampaignHero = {
    ...hero,
    freeFocusPoints: freeFocus - 1,
    skills: {
      ...hero.skills,
      [skillId]: {
        ...currentSkill,
        focus: currentSkill.focus + 1,
      },
    },
  };

  return { success: true, hero: nextHero };
}

/**
 * Kahramana 1 Nitelik Puanı verir.
 * Maksimum 10 nitelik puanı verilebilir.
 * Bannerlord kuralı: Nitelik vermek doğrudan HP eklemez; o niteliğe bağlı 3 becerinin sınırını ve hızını açar.
 */
export function allocateHeroAttribute(
  hero: CampaignHero,
  attributeId: AttributeId,
): { success: boolean; reason?: string; hero: CampaignHero } {
  const freeAttrs = hero.freeAttributePoints || 0;
  if (freeAttrs <= 0) {
    return { success: false, reason: 'Kullanılabilir Nitelik Puanı kalmadı.', hero };
  }
  const currentVal = hero.attributes[attributeId] || 2;
  if (currentVal >= 10) {
    return { success: false, reason: 'Bu nitelik maksimum seviyeye (10) ulaştı.', hero };
  }

  const nextHero: CampaignHero = {
    ...hero,
    freeAttributePoints: freeAttrs - 1,
    attributes: {
      ...hero.attributes,
      [attributeId]: currentVal + 1,
    },
  };

  return { success: true, hero: nextHero };
}

/**
 * Oyuncu kahraman kaydındaki güncellemeleri geriye dönük uyumluluk için
 * CampaignState'in eski alanlarına (state.skills, state.attributes vb.) deterministik yansıtır.
 */
export function syncPlayerHeroToCampaign(
  hero: CampaignHero,
  state: CampaignState,
): CampaignState {
  // Eski skills kaydını (level, focus) senkronla
  const legacySkills: Record<BannerlordSkillId, { level: number; focus: number }> = {
    ...state.skills,
  } as Record<BannerlordSkillId, { level: number; focus: number }>;

  for (const [sId, sState] of Object.entries(hero.skills)) {
    legacySkills[sId as BannerlordSkillId] = {
      level: sState.level,
      focus: sState.focus,
    };
  }

  const heroesList = [...(state.heroes ?? [])];
  const pIdx = heroesList.findIndex((h) => h.id === PLAYER_HERO_ID || h.kind === 'PLAYER');
  if (pIdx >= 0) {
    heroesList[pIdx] = hero;
  } else {
    heroesList.unshift(hero);
  }

  return {
    ...state,
    characterLevel: hero.level,
    freeFocusPoints: hero.freeFocusPoints,
    freeAttributePoints: hero.freeAttributePoints,
    attributes: { ...hero.attributes },
    skills: legacySkills,
    heroes: heroesList,
  };
}
