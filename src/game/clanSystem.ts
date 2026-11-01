/**
 * clanSystem.ts — Mount & Blade II: Bannerlord Klan (Clan) Sistemi
 *
 * Bannerlord klan mekaniği:
 *  1. Klan Kademesi & Nam İlerlemesi (Tier 0..6)
 *  2. Üyeler: Oyuncu, Aile (kardeşler/eş) ve Yoldaşlar; 4 Klan Rolü (İaşeci, İzci, Cerrah, Mühendis)
 *  3. Birlikler: Ana ordu + Klan üyelerinin yönettiği ek klan partileri + Kervanlar + Garnizonlar
 *  4. Tımarlar & Valilik: Şehir ve kalelere vali atama (kültür uyumu sadakat bonusu)
 *  5. Finans: Tımar vergileri, köy tarifeleri, atölye ve kervan kârları vs parti ve garnizon maaşları
 */

import {
  type AttributeId,
  type BannerlordSkillId,
  type CampaignHero,
  type CampaignState,
  type ClanRoleId,
  type FactionId,
  type Settlement,
  type TroopStack,
  type WorkshopTypeId,
  calculateClanTier,
  calculatePartyDailyWage,
  getTotalTroops,
} from './rules.ts';

export interface ClanRoleDefinition {
  id: ClanRoleId;
  name: string;
  skillId: BannerlordSkillId;
  skillName: string;
  description: string;
  effectDescription: string;
  icon: string;
}

export const CLAN_ROLES_CATALOG: ClanRoleDefinition[] = [
  {
    id: 'QUARTERMASTER',
    name: 'İaşeci',
    skillId: 'steward',
    skillName: 'İdare',
    description: 'Partinin lojistik, erzak tüketimi ve birlik taşıma kapasitesini yönetir.',
    effectDescription: 'Her 4 İdare seviyesi için +1 parti kapasitesi sağlar, erzak tüketimini dengeler.',
    icon: 'bag',
  },
  {
    id: 'SCOUT',
    name: 'İzci',
    skillId: 'scouting',
    skillName: 'İzcilik',
    description: 'Haritada keşif yapar, düşman birliklerinin izlerini sürer ve görüş menzilini açar.',
    effectDescription: 'Harita görüş menzilini (Spotting Range) ve sefer yürüyüş hızını artırır.',
    icon: 'eye',
  },
  {
    id: 'SURGEON',
    name: 'Cerrah',
    skillId: 'medicine',
    skillName: 'Hekimlik',
    description: 'Muharebe sonrası yaralı askerleri tedavi eder ve can yenilenme hızını artırır.',
    effectDescription: 'Ölümcül darbeleri yaralanmaya çevirir, günlük yaralı iyileşme hızını ikiye katlar.',
    icon: 'heart',
  },
  {
    id: 'ENGINEER',
    name: 'Mühendis',
    skillId: 'engineering',
    skillName: 'Mühendislik',
    description: 'Kuşatma silahlarının, koçbaşlarının, kulelerin ve sur makinelerinin inşasını yönetir.',
    effectDescription: 'Kuşatma kampı kurma ve makine inşaat hızını artırır, düşman surlarına gedik açmayı kolaylaştırır.',
    icon: 'cog',
  },
];

export interface ClanPartyRecord {
  id: string;
  name: string;
  leaderHeroId: string;
  leaderHeroName: string;
  rosterCount: number;
  woundedCount: number;
  wage: number;
  wageLimit: number;
  stance: 'AGGRESSIVE' | 'DEFENSIVE' | 'NEUTRAL';
  location: string;
}

export interface ClanCaravanRecord {
  id: string;
  name: string;
  leaderHeroId: string;
  leaderHeroName: string;
  guardCount: number;
  dailyIncome: number;
  homeSettlementId: string;
  homeSettlementName: string;
}

export interface ClanFinanceBreakdown {
  incomes: {
    fiefTaxes: { name: string; amount: number }[];
    villageTariffs: { name: string; amount: number }[];
    workshops: { name: string; settlementName: string; amount: number }[];
    caravans: { name: string; amount: number }[];
    mercenaryPayment: number;
    totalIncome: number;
  };
  expenses: {
    mainPartyWage: number;
    clanPartiesWages: { name: string; amount: number }[];
    garrisonWages: { name: string; amount: number }[];
    totalExpense: number;
  };
  netDailyChange: number;
}

/**
 * Oyuncunun klan bilgilerini ve kademe ilerlemesini özetler.
 */
export function getPlayerClanSummary(state: CampaignState) {
  const tierInfo = calculateClanTier(state.renown);
  const clanName = (state as any).clanName || `${state.playerName} Sancağı`;
  const playerFaction = state.playerFaction || 'player';

  // Klan kademesine göre yoldaş, parti ve atölye sınırları (Bannerlord kuralları):
  // Tier 0: 1 Parti, 3 Yoldaş, 1 Atölye
  // Tier 1: 1 Parti, 4 Yoldaş, 2 Atölye
  // Tier 2: 2 Parti, 5 Yoldaş, 3 Atölye
  // Tier 3: 3 Parti, 6 Yoldaş, 4 Atölye
  // Tier 4: 4 Parti, 7 Yoldaş, 5 Atölye
  // Tier 5+: 4 Parti, 8 Yoldaş, 6 Atölye
  const maxParties = Math.min(4, Math.max(1, tierInfo.tier === 0 ? 1 : tierInfo.tier));
  const maxCompanions = 3 + tierInfo.tier;
  const maxWorkshops = 1 + tierInfo.tier;

  // Mevcut klan atölyeleri
  const ownedWorkshops: {
    settlementId: string;
    settlementName: string;
    type: WorkshopTypeId;
    dailyProfit: number;
  }[] = [];

  for (const s of state.settlements) {
    if (s.workshops) {
      for (const w of s.workshops) {
        if (w.owner === 'player' && w.type !== 'NONE') {
          ownedWorkshops.push({
            settlementId: s.id,
            settlementName: s.name,
            type: w.type,
            dailyProfit: w.lastDailyProfit ?? 75,
          });
        }
      }
    } else if (s.workshopOwner === 'player' && s.workshopType && s.workshopType !== 'NONE') {
      ownedWorkshops.push({
        settlementId: s.id,
        settlementName: s.name,
        type: s.workshopType,
        dailyProfit: 75,
      });
    }
  }

  // Önceki seviyenin taban namı ve mevcut seviye içindeki ilerleme yüzdesi
  const prevTierRenown =
    tierInfo.tier === 0
      ? 0
      : tierInfo.tier === 1
        ? 50
        : tierInfo.tier === 2
          ? 150
          : tierInfo.tier === 3
            ? 350
            : tierInfo.tier === 4
              ? 900
              : tierInfo.tier === 5
                ? 2350
                : 6150;

  const currentRenownInTier = Math.max(0, state.renown - prevTierRenown);
  const renownNeededForNext = Math.max(1, tierInfo.nextRenown - prevTierRenown);
  const progressPercent = Math.min(100, Math.round((currentRenownInTier / renownNeededForNext) * 100));

  return {
    clanName,
    tier: tierInfo.tier,
    title: tierInfo.title,
    renown: state.renown,
    nextTierRenown: tierInfo.nextRenown,
    progressPercent,
    influence: state.influence ?? 0,
    gold: state.gold,
    playerFaction,
    maxParties,
    maxCompanions,
    maxWorkshops,
    ownedWorkshops,
  };
}

/**
 * Klana ait tüm kahramanları (oyuncu, aile, yoldaşlar) listeler.
 */
export function getClanHeroes(state: CampaignState): CampaignHero[] {
  if (state.heroes && state.heroes.length > 0) {
    return state.heroes;
  }
  // Geriye dönük uyumluluk: heroes henüz başlatılmadıysa oyuncu kahramanını oluştur
  return [
    {
      id: 'player_hero',
      name: state.playerName,
      kind: 'PLAYER',
      culture: (state.playerFaction as FactionId) || 'player',
      age: 26,
      hp: state.playerHp,
      maxHp: state.playerMaxHp,
      wage: 0,
      level: state.characterLevel ?? 1,
      xp: 0,
      freeAttributePoints: state.freeAttributePoints ?? 0,
      freeFocusPoints: state.freeFocusPoints ?? 0,
      attributes: state.attributes ?? {
        VIGOR: 4,
        CONTROL: 3,
        ENDURANCE: 4,
        CUNNING: 3,
        SOCIAL: 4,
        INTELLIGENCE: 4,
      },
      skills: (state.skills as any) ?? {},
      perks: state.unlockedPerks ?? [],
      equipment: {
        BATTLE: (state.equipment as any) ?? {},
        CIVILIAN: (state.equipment as any) ?? {},
      },
      activeEquipmentSet: state.outfitMode ?? 'BATTLE',
      isInPlayerParty: true,
    },
  ];
}

/**
 * Belirli bir klan rolüne kahraman atar veya rolü boşaltır.
 */
export function assignClanRole(
  state: CampaignState,
  roleId: ClanRoleId,
  heroId: string | null,
): CampaignState {
  const currentRoles: Record<string, string> = { ...(state.clanRoles ?? {}) };
  const currentAssignments = { ...(state.roleAssignments ?? {}) };

  if (heroId) {
    currentRoles[roleId] = heroId;
    currentAssignments[roleId] = heroId;
  } else {
    delete currentRoles[roleId];
    currentAssignments[roleId] = null;
  }

  return {
    ...state,
    clanRoles: currentRoles as Record<ClanRoleId, string>,
    roleAssignments: currentAssignments,
  };
}

/**
 * Klana ait tımarları (şehir, kale ve bağlı köyler) döndürür.
 */
export function getClanFiefs(state: CampaignState): {
  townsAndCastles: Settlement[];
  boundVillages: Settlement[];
} {
  const playerClanId = 'player';
  const townsAndCastles = state.settlements.filter(
    (s) =>
      s.type !== 'VILLAGE' &&
      (s.faction === 'player' || s.ownerClanId === playerClanId || (s as any).isPlayerOwned),
  );

  const boundVillageIds = new Set<string>();
  for (const tc of townsAndCastles) {
    for (const v of state.settlements) {
      if (v.type === 'VILLAGE' && v.boundSettlementId === tc.id) {
        boundVillageIds.add(v.id);
      }
    }
  }

  const boundVillages = state.settlements.filter((s) => boundVillageIds.has(s.id));

  return {
    townsAndCastles,
    boundVillages,
  };
}

/**
 * Şehir veya kaleye klandan vali (Governor) atar veya görevden alır.
 */
export function assignSettlementGovernor(
  state: CampaignState,
  settlementId: string,
  heroId: string | null,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const settlement = state.settlements.find((s) => s.id === settlementId);
  if (!settlement) {
    return { success: false, reason: 'Yerleşim bulunamadı.', nextState: state };
  }

  let heroName: string | null = null;
  let heroCulture: FactionId | null = null;

  if (heroId) {
    const heroes = getClanHeroes(state);
    const hero = heroes.find((h) => h.id === heroId);
    if (!hero) {
      return { success: false, reason: 'Seçilen klan üyesi bulunamadı.', nextState: state };
    }
    heroName = hero.name;
    heroCulture = hero.culture;
  }

  const nextSettlements = state.settlements.map((s) => {
    if (s.id !== settlementId) return s;
    return {
      ...s,
      governorHeroId: heroId,
      governorHeroName: heroName,
      governorCulture: heroCulture,
    } as Settlement;
  });

  return {
    success: true,
    nextState: {
      ...state,
      settlements: nextSettlements,
    },
  };
}

/**
 * Klanın detaylı günlük gelir, gider ve net bilanço tablosunu hesaplar.
 */
export function calculateClanDailyFinance(state: CampaignState): ClanFinanceBreakdown {
  const { townsAndCastles, boundVillages } = getClanFiefs(state);

  // 1. Şehir ve Kale Vergi Gelirleri
  const fiefTaxes = townsAndCastles.map((tc) => {
    const tax = Math.round((tc.prosperity ?? 4000) * (tc.type === 'TOWN' ? 0.42 : 0.28));
    return { name: tc.name, amount: tax };
  });

  // 2. Bağlı Köy Tarifeleri
  const villageTariffs = boundVillages.map((v) => {
    const hearths = (v as any).hearths ?? Math.round((v.prosperity ?? 1200) * 0.25);
    const tariff = Math.round(hearths * 0.65);
    return { name: v.name, amount: tariff };
  });

  // 3. Atölye Kârları
  const workshops: { name: string; settlementName: string; amount: number }[] = [];
  for (const s of state.settlements) {
    if (s.workshops) {
      for (const w of s.workshops) {
        if (w.owner === 'player' && w.type !== 'NONE') {
          workshops.push({
            name: w.customName || w.type,
            settlementName: s.name,
            amount: w.lastDailyProfit ?? 75,
          });
        }
      }
    } else if (s.workshopOwner === 'player' && s.workshopType && s.workshopType !== 'NONE') {
      workshops.push({
        name: s.workshopType,
        settlementName: s.name,
        amount: 75,
      });
    }
  }

  // 4. Kervan Gelirleri (varsa)
  const caravans: { name: string; amount: number }[] = [];
  const clanCaravans: ClanCaravanRecord[] = (state as any).clanCaravans ?? [];
  for (const c of clanCaravans) {
    caravans.push({
      name: `${c.leaderHeroName} Kervanı`,
      amount: c.dailyIncome ?? 280,
    });
  }

  // 5. Paralı Askerlik Maaşı (Mercenary Payment)
  let mercenaryPayment = 0;
  if (state.allegianceRole === 'MERCENARY' && state.playerFaction && state.playerFaction !== 'player') {
    // Nüfuz ve aktif savaş durumuna göre paralı asker ödülü
    const baseRate = 180;
    mercenaryPayment = baseRate + Math.round((state.influence ?? 0) * 8);
  }

  const totalIncome =
    fiefTaxes.reduce((s, f) => s + f.amount, 0) +
    villageTariffs.reduce((s, v) => s + v.amount, 0) +
    workshops.reduce((s, w) => s + w.amount, 0) +
    caravans.reduce((s, c) => s + c.amount, 0) +
    mercenaryPayment;

  // 6. Giderler: Ana Parti Maaşı
  const mainPartyWage = calculatePartyDailyWage(state);

  // 7. Ek Klan Partileri Maaşları
  const clanPartiesWages: { name: string; amount: number }[] = [];
  const clanParties: ClanPartyRecord[] = (state as any).clanParties ?? [];
  for (const p of clanParties) {
    clanPartiesWages.push({
      name: p.name,
      amount: p.wage ?? 120,
    });
  }

  // 8. Garnizon Maaşları
  const garrisonWages = townsAndCastles.map((tc) => {
    const garrisonCount = tc.garrison ?? 0;
    const wage = Math.round(garrisonCount * 1.6);
    return { name: `${tc.name} Garnizonu`, amount: wage };
  });

  const totalExpense =
    mainPartyWage +
    clanPartiesWages.reduce((s, p) => s + p.amount, 0) +
    garrisonWages.reduce((s, g) => s + g.amount, 0);

  const netDailyChange = totalIncome - totalExpense;

  return {
    incomes: {
      fiefTaxes,
      villageTariffs,
      workshops,
      caravans,
      mercenaryPayment,
      totalIncome,
    },
    expenses: {
      mainPartyWage,
      clanPartiesWages,
      garrisonWages,
      totalExpense,
    },
    netDailyChange,
  };
}

/**
 * Klan adını değiştirir.
 */
export function changeClanName(state: CampaignState, newClanName: string): CampaignState {
  const trimmed = newClanName.trim();
  if (!trimmed) return state;
  return {
    ...state,
    clanName: trimmed,
  } as CampaignState;
}
