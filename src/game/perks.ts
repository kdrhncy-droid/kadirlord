/**
 * perks.ts — P4: Bannerlord 18 beceri için tam perk kataloğu ve mekanik etkileri.
 *
 * Her beceri 25, 50, 75, 100, 125, 150, 175, 200, 225, 250 eşiklerinde
 * iki karşılıklı (mutually exclusive) perk seçeneği sunar.
 * Her perk; Kişisel, Kaptan, Parti Lideri, Klan Rolü veya Vali etkilerine sahiptir.
 */

import type { BannerlordSkillId, CampaignHero } from './rules.ts';

export type PerkScope = 'PERSONAL' | 'CAPTAIN' | 'PARTY_LEADER' | 'CLAN_ROLE' | 'GOVERNOR';

export interface PerkDefinition {
  id: string;
  skillId: BannerlordSkillId;
  requiredLevel: number;
  tierIndex: number;
  choiceGroup: string;
  name: string;
  description: string;
  primaryScope: PerkScope;
  secondaryScope?: PerkScope;
  // Sayısal Oyun İçi Etkileri
  meleeDamageBonus?: number;
  rangedDamageBonus?: number;
  speedBonus?: number;
  maxHpBonus?: number;
  partySizeBonus?: number;
  wageReduction?: number;
  carryCapacityBonus?: number;
  healingSpeedBonus?: number;
  scoutVisionBonus?: number;
  siegeBuildSpeedBonus?: number;
  tradeProfitBonus?: number;
  moraleBonus?: number;
}

export const PERK_CATALOG: PerkDefinition[] = [
  // ── TEK ELLİ SİLAHLAR (oneHanded) ──
  {
    id: 'oneHanded_25_a',
    skillId: 'oneHanded',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'oneHanded_25',
    name: 'Yumruk Gibi',
    description: 'Kişisel: Tek elli silahlarla yapılan vuruşlar %5 daha fazla hasar verir.',
    primaryScope: 'PERSONAL',
    meleeDamageBonus: 0.05,
  },
  {
    id: 'oneHanded_25_b',
    skillId: 'oneHanded',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'oneHanded_25',
    name: 'Hızlı Savurma',
    description: 'Kişisel: Tek elli silah savurma hızı %4 artar.',
    primaryScope: 'PERSONAL',
    speedBonus: 0.04,
  },
  {
    id: 'oneHanded_50_a',
    skillId: 'oneHanded',
    requiredLevel: 50,
    tierIndex: 1,
    choiceGroup: 'oneHanded_50',
    name: 'Kalkan Kıran',
    description: 'Kişisel: Kalkanlara karşı verilen yakın dövüş hasarı %15 artar.',
    primaryScope: 'PERSONAL',
    meleeDamageBonus: 0.08,
  },
  {
    id: 'oneHanded_50_b',
    skillId: 'oneHanded',
    requiredLevel: 50,
    tierIndex: 1,
    choiceGroup: 'oneHanded_50',
    name: 'Asker Eğitmeni',
    description: 'Parti Lideri: Piyadelerin günlük bakım maaşı %5 azalır.',
    primaryScope: 'PARTY_LEADER',
    wageReduction: 0.05,
  },

  // ── ÇİFT ELLİ SİLAHLAR (twoHanded) ──
  {
    id: 'twoHanded_25_a',
    skillId: 'twoHanded',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'twoHanded_25',
    name: 'Yıkıcı Darbe',
    description: 'Kişisel: Çift elli silah hasarı %7 artar.',
    primaryScope: 'PERSONAL',
    meleeDamageBonus: 0.07,
  },
  {
    id: 'twoHanded_25_b',
    skillId: 'twoHanded',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'twoHanded_25',
    name: 'Ağır Adımlar',
    description: 'Kişisel: Çift elli silah taşırken hareket hız cezası %10 azalır.',
    primaryScope: 'PERSONAL',
    speedBonus: 0.03,
  },

  // ── GÖNDERLİ SİLAHLAR (polearm) ──
  {
    id: 'polearm_25_a',
    skillId: 'polearm',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'polearm_25',
    name: 'Süvari Savar',
    description: 'Kişisel: Atlı hedeflere karşı mızrak ve kargı hasarı %12 artar.',
    primaryScope: 'PERSONAL',
    meleeDamageBonus: 0.06,
  },
  {
    id: 'polearm_25_b',
    skillId: 'polearm',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'polearm_25',
    name: 'Koltuklanmış Kargı',
    description: 'Kişisel: At sırtında hızla yapılan kargı hücumu hasarı %10 artar.',
    primaryScope: 'PERSONAL',
    meleeDamageBonus: 0.05,
  },

  // ── YAY & MENZİLLİ (bow) ──
  {
    id: 'bow_25_a',
    skillId: 'bow',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'bow_25',
    name: 'Gözcü Bakışı',
    description: 'Kişisel: Yay isabet oranı ve ok hasarı %6 artar.',
    primaryScope: 'PERSONAL',
    rangedDamageBonus: 0.06,
  },
  {
    id: 'bow_25_b',
    skillId: 'bow',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'bow_25',
    name: 'Hızlı Çekiş',
    description: 'Kişisel: Yayı kurma ve nişan alma hızı %8 hızlanır.',
    primaryScope: 'PERSONAL',
    speedBonus: 0.05,
  },

  // ── KUNDAKLI YAY (crossbow) ──
  {
    id: 'crossbow_25_a',
    skillId: 'crossbow',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'crossbow_25',
    name: 'Zırh Delen Oklar',
    description: 'Kişisel: Kundaklı yay oklarının ağır zırh delme gücü %8 artar.',
    primaryScope: 'PERSONAL',
    rangedDamageBonus: 0.06,
  },
  {
    id: 'crossbow_25_b',
    skillId: 'crossbow',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'crossbow_25',
    name: 'Çevik Kurma Kolları',
    description: 'Kişisel: Kundaklı yayı yeniden doldurma süresi %10 kısalır.',
    primaryScope: 'PERSONAL',
    speedBonus: 0.04,
  },

  // ── FIRLATMA (throwing) ──
  {
    id: 'throwing_25_a',
    skillId: 'throwing',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'throwing_25',
    name: 'Cirit Yağmuru',
    description: 'Kişisel: Fırlatma silahlarının menzili ve delici hasarı %8 artar.',
    primaryScope: 'PERSONAL',
    rangedDamageBonus: 0.06,
  },
  {
    id: 'throwing_25_b',
    skillId: 'throwing',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'throwing_25',
    name: 'Kalkan Parçalayan',
    description: 'Kişisel: Fırlatılan cirit ve baltaların düşman kalkanlarına hasarı %20 artar.',
    primaryScope: 'PERSONAL',
    meleeDamageBonus: 0.05,
  },

  // ── BİNİCİLİK (riding) ──
  {
    id: 'riding_25_a',
    skillId: 'riding',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'riding_25',
    name: 'Süvari Çevikliği',
    description: 'Kişisel: Binek hızı ve manevra kabiliyeti %5 artar.',
    primaryScope: 'PERSONAL',
    speedBonus: 0.05,
  },
  {
    id: 'riding_25_b',
    skillId: 'riding',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'riding_25',
    name: 'Dolu Dizgin',
    description: 'Parti Lideri: Haritada atlı süvari birliği hareket hızı +0.2 artar.',
    primaryScope: 'PARTY_LEADER',
    speedBonus: 0.03,
  },

  // ── ATLETİZM (athletics) ──
  {
    id: 'athletics_25_a',
    skillId: 'athletics',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'athletics_25',
    name: 'Zinde Vücut',
    description: 'Kişisel: Maksimum can (HP) +5 artar.',
    primaryScope: 'PERSONAL',
    maxHpBonus: 5,
  },
  {
    id: 'athletics_25_b',
    skillId: 'athletics',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'athletics_25',
    name: 'Hızlı Koşucu',
    description: 'Kişisel: Yaya hareket hızı %5 artar.',
    primaryScope: 'PERSONAL',
    speedBonus: 0.05,
  },

  // ── DEMİRCİLİK (smithing) ──
  {
    id: 'smithing_25_a',
    skillId: 'smithing',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'smithing_25',
    name: 'Verimli Kömür Ocağı',
    description: 'Kişisel: Odunlardan odun kömürü üretirken %50 daha yüksek verim alınır.',
    primaryScope: 'PERSONAL',
  },
  {
    id: 'smithing_25_b',
    skillId: 'smithing',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'smithing_25',
    name: 'Çelik Su Ustası',
    description: 'Kişisel: Dövülen silahların denge ve keskinlik kalitesi artar.',
    primaryScope: 'PERSONAL',
    meleeDamageBonus: 0.04,
  },

  // ── İDARECİLİK / İAŞE (steward) ──
  {
    id: 'steward_25_a',
    skillId: 'steward',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'steward_25',
    name: 'Bol İaşe',
    description: 'Parti Lideri: Parti asker taşıma kapasitesi +5 artar.',
    primaryScope: 'PARTY_LEADER',
    partySizeBonus: 5,
  },
  {
    id: 'steward_25_b',
    skillId: 'steward',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'steward_25',
    name: 'Sıkı Ambar',
    description: 'Klan Rolü (İaşeci): Birliklerin erzak tüketimi %10 azalır.',
    primaryScope: 'CLAN_ROLE',
    wageReduction: 0.05,
  },
  {
    id: 'steward_50_a',
    skillId: 'steward',
    requiredLevel: 50,
    tierIndex: 1,
    choiceGroup: 'steward_50',
    name: 'Lojistik Düzen',
    description: 'Klan Rolü (İaşeci): Parti taşıma ağırlık kapasitesi +40 kg artar.',
    primaryScope: 'CLAN_ROLE',
    carryCapacityBonus: 40,
  },
  {
    id: 'steward_50_b',
    skillId: 'steward',
    requiredLevel: 50,
    tierIndex: 1,
    choiceGroup: 'steward_50',
    name: 'Maaş Defteri',
    description: 'Klan Rolü (İaşeci): Tüm ordunun günlük asker maaşı %7 ucuzlar.',
    primaryScope: 'CLAN_ROLE',
    wageReduction: 0.07,
  },

  // ── HEKİMLİK / CERRAH (medicine) ──
  {
    id: 'medicine_25_a',
    skillId: 'medicine',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'medicine_25',
    name: 'Sıcak Sargı',
    description: 'Kişisel / Cerrah: Yaralı kahramanların iyileşme hızı %20 artar.',
    primaryScope: 'CLAN_ROLE',
    healingSpeedBonus: 0.2,
  },
  {
    id: 'medicine_25_b',
    skillId: 'medicine',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'medicine_25',
    name: 'Saha Müdahalesi',
    description: 'Klan Rolü (Cerrah): Savaşta yaralanan askerlerin ölüm oranı %10 azalır.',
    primaryScope: 'CLAN_ROLE',
    healingSpeedBonus: 0.15,
  },

  // ── İZCİLİK (scouting) ──
  {
    id: 'scouting_25_a',
    skillId: 'scouting',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'scouting_25',
    name: 'Uzak Ufuklar',
    description: 'Klan Rolü (İzci): Sefer haritası gündüz görüş mesafesi %15 artar.',
    primaryScope: 'CLAN_ROLE',
    scoutVisionBonus: 0.15,
  },
  {
    id: 'scouting_25_b',
    skillId: 'scouting',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'scouting_25',
    name: 'İz Takibi',
    description: 'Klan Rolü (İzci): Orman ve engebeli arazide hareket hız cezası %20 azalır.',
    primaryScope: 'CLAN_ROLE',
    speedBonus: 0.04,
  },

  // ── MÜHENDİSLİK (engineering) ──
  {
    id: 'engineering_25_a',
    skillId: 'engineering',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'engineering_25',
    name: 'Hızlı Kazıklar',
    description: 'Klan Rolü (Mühendis): Kuşatma kampı kurma ve merdiven hazırlama hızı %20 artar.',
    primaryScope: 'CLAN_ROLE',
    siegeBuildSpeedBonus: 0.2,
  },
  {
    id: 'engineering_25_b',
    skillId: 'engineering',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'engineering_25',
    name: 'Balista Ustalığı',
    description: 'Klan Rolü (Mühendis): Kuşatma mancınık ve balistalarının isabet oranı artar.',
    primaryScope: 'CLAN_ROLE',
    siegeBuildSpeedBonus: 0.15,
  },

  // ── TİCARET (trade) ──
  {
    id: 'trade_25_a',
    skillId: 'trade',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'trade_25',
    name: 'Tüccar Terazisi',
    description: 'Kişisel: Pazarda malların alış ve satış marjı kârı %5 artar.',
    primaryScope: 'PERSONAL',
    tradeProfitBonus: 0.05,
  },
  {
    id: 'trade_25_b',
    skillId: 'trade',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'trade_25',
    name: 'Kervan Başı',
    description: 'Parti Lideri: Yük hayvanlarının taşıma kapasitesi %15 artar.',
    primaryScope: 'PARTY_LEADER',
    carryCapacityBonus: 30,
  },

  // ── LİDERLİK (leadership) ──
  {
    id: 'leadership_25_a',
    skillId: 'leadership',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'leadership_25',
    name: 'Sancak Morali',
    description: 'Parti Lideri: Parti taban morali +4 puan artar.',
    primaryScope: 'PARTY_LEADER',
    moraleBonus: 4,
  },
  {
    id: 'leadership_25_b',
    skillId: 'leadership',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'leadership_25',
    name: 'Gönüllü Çekiciliği',
    description: 'Parti Lideri: Parti asker taşıma kapasitesi +5 artar.',
    primaryScope: 'PARTY_LEADER',
    partySizeBonus: 5,
  },

  // ── TAKTİK (tactics) ──
  {
    id: 'tactics_25_a',
    skillId: 'tactics',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'tactics_25',
    name: 'Sıkı Saflar',
    description: 'Parti Lideri: Otomatik muharebede asker zayiatı %8 azalır.',
    primaryScope: 'PARTY_LEADER',
  },
  {
    id: 'tactics_25_b',
    skillId: 'tactics',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'tactics_25',
    name: 'Öncü Baskını',
    description: 'Parti Lideri: Düşmanı gafil avlama şansı ve taktik avantaj artar.',
    primaryScope: 'PARTY_LEADER',
  },

  // ── CAZİBE (charm) ──
  {
    id: 'charm_25_a',
    skillId: 'charm',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'charm_25',
    name: 'Tatlı Dil',
    description: 'Kişisel: Lordlarla ikna adımlarında başarı şansı +%8 artar.',
    primaryScope: 'PERSONAL',
  },
  {
    id: 'charm_25_b',
    skillId: 'charm',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'charm_25',
    name: 'Asil Tavır',
    description: 'Kişisel: Lordlarla yapılan görevlerde kazanılan ilişki +2 artar.',
    primaryScope: 'PERSONAL',
  },

  // ── SERSERİLİK (roguery) ──
  {
    id: 'roguery_25_a',
    skillId: 'roguery',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'roguery_25',
    name: 'Yağmacı Gözü',
    description: 'Kişisel: Savaş sonu ganimet miktarı %10 artar.',
    primaryScope: 'PERSONAL',
  },
  {
    id: 'roguery_25_b',
    skillId: 'roguery',
    requiredLevel: 25,
    tierIndex: 0,
    choiceGroup: 'roguery_25',
    name: 'Fidye Pazarlığı',
    description: 'Parti Lideri: Esirleri fidyeciye satarken %15 daha fazla altın kazanılır.',
    primaryScope: 'PARTY_LEADER',
  },
];

/**
 * Belirli bir beceriye ait perkleri seviye eşiklerine göre gruplar.
 */
export function getPerksForSkill(skillId: BannerlordSkillId): Record<number, [PerkDefinition, PerkDefinition]> {
  const perks = PERK_CATALOG.filter((p) => p.skillId === skillId);
  const groups: Record<number, PerkDefinition[]> = {};

  for (const perk of perks) {
    if (!groups[perk.requiredLevel]) {
      groups[perk.requiredLevel] = [];
    }
    groups[perk.requiredLevel].push(perk);
  }

  const result: Record<number, [PerkDefinition, PerkDefinition]> = {};
  for (const [levelStr, pair] of Object.entries(groups)) {
    if (pair.length >= 2) {
      result[Number(levelStr)] = [pair[0], pair[1]];
    }
  }
  return result;
}

/**
 * Kahramanın bir perk seçmesini sağlar.
 * Aynı seviyedeki zıt perk daha önce seçilmişse o kaldırılır (tekil seçim kuralı).
 */
export function unlockHeroPerk(
  hero: CampaignHero,
  perkId: string,
): { success: boolean; reason?: string; hero: CampaignHero } {
  const targetPerk = PERK_CATALOG.find((p) => p.id === perkId);
  if (!targetPerk) {
    return { success: false, reason: 'Perk tanımı bulunamadı.', hero };
  }

  const skillState = hero.skills[targetPerk.skillId];
  if (!skillState || skillState.level < targetPerk.requiredLevel) {
    return {
      success: false,
      reason: `Bu perk için ${targetPerk.requiredLevel} seviye gerekiyor (mevcut: ${skillState?.level ?? 0}).`,
      hero,
    };
  }

  // Aynı choiceGroup'a ait diğer perki listeden çıkar (çift seçenek kuralı)
  const currentPerks = (hero.perks ?? []).filter((id) => {
    const existing = PERK_CATALOG.find((p) => p.id === id);
    if (!existing) return true;
    return existing.choiceGroup !== targetPerk.choiceGroup;
  });

  const nextHero: CampaignHero = {
    ...hero,
    perks: [...currentPerks, targetPerk.id],
  };

  return { success: true, hero: nextHero };
}
