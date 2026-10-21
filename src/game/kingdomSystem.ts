import {
  CampaignState,
  ChronicleEvent,
  FACTION_INFO,
  FactionId,
  LordAgent,
  Settlement,
  calculateClanTier,
  calculatePartyStrength,
} from './rules.ts';

// ============================================================================
// 1. HİYERARŞİK VERİ MODELİ: KAHRAMANLAR (HERO/REGENT), KLANLAR VE KRALLIKLAR
// ============================================================================

export type PersonalityTraitId = 'HONORABLE' | 'MERCIFUL' | 'CALCULATING' | 'GENEROUS' | 'DARING';

export interface ClanSuccessionState {
  leaderId: string;
  leaderName: string;
  isRegentActive: boolean;
  regentName: string | null;
  heirQueue: Array<{ id: string; name: string; age: number; isAdult: boolean }>;
}

export interface FeudalClanRecord {
  id: string;
  name: string;
  faction: FactionId;
  culture: FactionId;
  tier: number;
  renown: number;
  gold: number;
  influence: number;
  isRulingClan: boolean;
  isPlayerClan: boolean;
  isIndependent: boolean;
  daysWithoutKingdom: number;
  warPartyCount: number;
  totalStrength: number;
  fiefIds: string[];
  totalFiefValue: number;
  workshopsCount: number;
  caravansCount: number;
  traits: PersonalityTraitId[];
  relationWithPlayer: number;
  relationWithRuler: number;
  succession: ClanSuccessionState;
}

export type KingdomPolicyId =
  | 'FORGIVENESS_OF_DEBTS'
  | 'ROYAL_PRIVILEGE'
  | 'FEUDAL_INHERITANCE'
  | 'SENATE_TRIBUNE'
  | 'SACRED_MAJESTY';

export interface KingdomPolicyDefinition {
  id: KingdomPolicyId;
  name: string;
  summary: string;
  dailyLoyaltyBonus: number;
  productionModifierPct: number;
  rulerVetoDiscountPct: number;
  dailyInfluenceBonus: number;
  influenceCostToPropose: number;
}

export const KINGDOM_POLICIES: Record<KingdomPolicyId, KingdomPolicyDefinition> = {
  FORGIVENESS_OF_DEBTS: {
    id: 'FORGIVENESS_OF_DEBTS',
    name: 'Borçların Affı (Forgiveness of Debts)',
    summary: 'Yerleşke üretimini %5 düşürür ancak tüm şehirlerde günlük sadakati +2.0 artırarak farklı kültür isyanlarını önler.',
    dailyLoyaltyBonus: 2.0,
    productionModifierPct: -5,
    rulerVetoDiscountPct: 0,
    dailyInfluenceBonus: 0,
    influenceCostToPropose: 50,
  },
  ROYAL_PRIVILEGE: {
    id: 'ROYAL_PRIVILEGE',
    name: 'Kraliyet Ayrıcalığı (Royal Privilege)',
    summary: 'Hükümdarın konsey kararlarını veto etme (Override) nüfuz maliyetini %20 düşürür ve yönetici klana günlük +1 nüfuz sağlar.',
    dailyLoyaltyBonus: 0,
    productionModifierPct: 0,
    rulerVetoDiscountPct: 20,
    dailyInfluenceBonus: 1.0,
    influenceCostToPropose: 60,
  },
  FEUDAL_INHERITANCE: {
    id: 'FEUDAL_INHERITANCE',
    name: 'Feodal Veraset (Feudal Inheritance)',
    summary: 'Klanların tımar mülkiyetini güvenceye alır; her tımar başına klana günlük +0.5 nüfuz ve +0.5 şehir sadakati kazandırır.',
    dailyLoyaltyBonus: 0.5,
    productionModifierPct: 2,
    rulerVetoDiscountPct: 0,
    dailyInfluenceBonus: 0.5,
    influenceCostToPropose: 50,
  },
  SENATE_TRIBUNE: {
    id: 'SENATE_TRIBUNE',
    name: 'Halk Tribünü (Tribunes of the People)',
    summary: 'Şehir halkının vergi yükünü dengeler; tüm şehirlerde günlük +1.0 sadakat ve +3% üretim artışı sağlar.',
    dailyLoyaltyBonus: 1.0,
    productionModifierPct: 3,
    rulerVetoDiscountPct: 0,
    dailyInfluenceBonus: 0.5,
    influenceCostToPropose: 55,
  },
  SACRED_MAJESTY: {
    id: 'SACRED_MAJESTY',
    name: 'Kutsal Hükümdarlık (Sacred Majesty)',
    summary: 'Hükümdar sancağının otoritesini yüceltir; günlük +2.5 nüfuz kazandırır.',
    dailyLoyaltyBonus: 0,
    productionModifierPct: 0,
    rulerVetoDiscountPct: 10,
    dailyInfluenceBonus: 2.5,
    influenceCostToPropose: 70,
  },
};

export interface WarMetricsRecord {
  targetFaction: FactionId;
  isAtWar: boolean;
  casualtiesInflicted: number;
  casualtiesSustained: number;
  prisonersCaptured: number;
  raidsInflicted: number;
  raidsSustained: number;
  siegesWon: number;
  siegesLost: number;
  warExhaustion: number; // 0..100
  dailyTributePaid: number; // Positive = paying tribute, Negative = receiving tribute
  tributeDebt: number;
}

export interface MeritCandidateBreakdown {
  clanId: string;
  clanName: string;
  faction: FactionId;
  culture: FactionId;
  tierBonus: number;
  strengthContribution: number;
  fieflessBonus: number;
  rulerBonus: number;
  conquerorBonus: number;
  povertyAndPlayerBonus: number;
  cultureMatchBonus: number;
  relationBonus: number;
  totalFiefValueDenominator: number;
  effectiveDistance: number;
  distanceFactorVanilla: number; // ^0.5
  distanceFactorImproved: number; // ^0.25 damped
  vanillaMeritScore: number;
  improvedMeritScore: number;
  finalMeritScore: number;
  councilSupportPct: number;
}

export interface SettlementClaimantElection {
  id: string;
  settlementId: string;
  settlementName: string;
  settlementCulture: FactionId;
  settlementValue: number;
  conquerorClanId: string;
  candidates: MeritCandidateBreakdown[];
  resolved: boolean;
  winnerClanId: string | null;
}

export interface KingdomMacroState {
  playerKingdomFaction: FactionId;
  influence: number;
  manpowerPools: Record<FactionId, number>;
  activePolicies: KingdomPolicyId[];
  clans: FeudalClanRecord[];
  wars: Record<FactionId, WarMetricsRecord>;
  activeElection: SettlementClaimantElection | null;
  destroyedKingdoms: FactionId[];
  weatherCondition: 'CLEAR' | 'RAIN' | 'SNOW';
  useImprovedArchitecture: boolean; // Toggle between Vanilla Bannerlord formulas & Improved Architecture fixes
}

// ============================================================================
// 2. ZORUNLU NULL-OBJECT DESENİ VE NAİP (REGENT) VERASET SİSTEMİ
// ============================================================================

const DEFAULT_FALLBACK_REGENT = {
  id: 'regent-null-safe',
  name: 'Naip Vekilharç Kaelen',
  relation: 0,
};

/**
 * Ensures GetRelationWithClan and OnSettlementOwnerChanged never throw NullReferenceException
 * even if all adult clan leaders die in battle or are executed.
 */
export function resolveClanLeaderOrRegent(
  clan: Partial<FeudalClanRecord> | null | undefined,
): ClanSuccessionState {
  if (!clan) {
    return {
      leaderId: DEFAULT_FALLBACK_REGENT.id,
      leaderName: DEFAULT_FALLBACK_REGENT.name,
      isRegentActive: true,
      regentName: DEFAULT_FALLBACK_REGENT.name,
      heirQueue: [],
    };
  }

  const queue = clan.succession?.heirQueue ?? [];
  const currentLeaderName = clan.succession?.leaderName?.trim();

  if (currentLeaderName && !clan.succession?.isRegentActive) {
    return {
      leaderId: clan.succession?.leaderId || `leader-${clan.id || 'unknown'}`,
      leaderName: currentLeaderName,
      isRegentActive: false,
      regentName: null,
      heirQueue: queue,
    };
  }

  // Promote first adult heir in Queue<Hero>
  const adultHeir = queue.find((h) => h.isAdult);
  if (adultHeir) {
    return {
      leaderId: adultHeir.id,
      leaderName: adultHeir.name,
      isRegentActive: false,
      regentName: null,
      heirQueue: queue.filter((h) => h.id !== adultHeir.id),
    };
  }

  // If only underage heirs or empty queue remain, appoint a Regent (Naip) so reference is never null
  const regentLabel = `Naip Vekilharç (${clan.name || 'Sancak'})`;
  return {
    leaderId: `regent-${clan.id || 'safe'}`,
    leaderName: regentLabel,
    isRegentActive: true,
    regentName: regentLabel,
    heirQueue: queue,
  };
}

export function getSafeRelationBetweenClans(
  clanA: Partial<FeudalClanRecord> | null | undefined,
  clanB: Partial<FeudalClanRecord> | null | undefined,
): number {
  if (!clanA || !clanB) return 0;
  // Verify leaders via Null-Object / Regent guard first
  const leaderA = resolveClanLeaderOrRegent(clanA);
  const leaderB = resolveClanLeaderOrRegent(clanB);
  if (!leaderA.leaderId || !leaderB.leaderId) return 0;
  const baseRel = clanA.relationWithPlayer ?? clanB.relationWithPlayer ?? 0;
  return Math.max(-100, Math.min(100, baseRel));
}

// ============================================================================
// 3. DEFAULTDIPLOMACYMODEL: SAVAŞ İSTEĞİ (WARDESIRERATIO) VE HARAÇ (TRIBUTE)
// ============================================================================

export interface WarDesireAndTributeReport {
  factionA: FactionId;
  factionB: FactionId;
  totalWarPartiesA: number;
  dynamicMultiplierX: number;
  totalStrengthA: number;
  totalValueOfFiefsA: number;
  warDesireRatioA: number;
  warDesireRatioB: number;
  warDesireScorePct: number; // 0..100
  fiefPowerParadoxTriggered: boolean;
  fieflessDesperationTriggered: boolean;
  dailyTributeFromAToB: number; // Positive = A pays B, Negative = B pays A
  warExhaustionA: number;
  warExhaustionB: number;
  forcedTruceEligible: boolean;
  explanation: string;
}

/**
 * Implements mexxico's verified DefaultDiplomacyModel.GetScoreOfDeclaringWar & GetScoreOfWarInternal:
 * WarDesireRatio = ((TotalClanWarPartyCount * X) + TotalKingdomStrength) / TotalValueOfKingdomFiefs
 * Plus comparative analysis between Vanilla Bannerlord (Fief-Power Paradox) and Improved Architecture.
 */
export function calculateWarDesireAndTribute(params: {
  factionA: FactionId;
  factionB: FactionId;
  clansA: FeudalClanRecord[];
  clansB: FeudalClanRecord[];
  fiefsA: Settlement[];
  fiefsB: Settlement[];
  warStats?: Partial<WarMetricsRecord>;
  useImprovedArchitecture?: boolean;
}): WarDesireAndTributeReport {
  const {
    factionA,
    factionB,
    clansA,
    clansB,
    fiefsA,
    fiefsB,
    warStats,
    useImprovedArchitecture = true,
  } = params;

  const totalWarPartiesA = Math.max(
    1,
    clansA.reduce((sum, c) => sum + Math.max(1, c.warPartyCount), 0),
  );
  const totalWarPartiesB = Math.max(
    1,
    clansB.reduce((sum, c) => sum + Math.max(1, c.warPartyCount), 0),
  );

  // Note: Militia is strictly excluded from TotalKingdomStrength per Bannerlord architecture
  const fiefGarrisonStrengthA = fiefsA
    .filter((f) => f.type !== 'VILLAGE')
    .reduce((sum, f) => sum + f.garrison * 18, 0);
  const fiefGarrisonStrengthB = fiefsB
    .filter((f) => f.type !== 'VILLAGE')
    .reduce((sum, f) => sum + f.garrison * 18, 0);

  const totalStrengthA = Math.max(
    120,
    clansA.reduce((sum, c) => sum + c.totalStrength, 0) + fiefGarrisonStrengthA,
  );
  const totalStrengthB = Math.max(
    120,
    clansB.reduce((sum, c) => sum + c.totalStrength, 0) + fiefGarrisonStrengthB,
  );

  const fortificationsA = fiefsA.filter((f) => f.type !== 'VILLAGE');
  const fortificationsB = fiefsB.filter((f) => f.type !== 'VILLAGE');

  // Dynamic weight X slowly scales with fortification count
  const dynamicMultiplierX = Math.round(140 + Math.min(180, fortificationsA.length * 6.5));
  const dynamicMultiplierXB = Math.round(140 + Math.min(180, fortificationsB.length * 6.5));

  const clanFiefFallbackA = clansA.reduce((sum, c) => sum + (c.totalFiefValue || 0), 0);
  const clanFiefFallbackB = clansB.reduce((sum, c) => sum + (c.totalFiefValue || 0), 0);

  const rawFiefValueA = Math.max(
    clanFiefFallbackA,
    fiefsA.reduce(
      (sum, f) =>
        sum + f.prosperity * (f.type === 'TOWN' ? 1.6 : f.type === 'CASTLE' ? 1.0 : 0.65),
      0,
    ),
  );
  const rawFiefValueB = Math.max(
    fiefsB.length === 0 ? 0 : clanFiefFallbackB,
    fiefsB.reduce(
      (sum, f) =>
        sum + f.prosperity * (f.type === 'TOWN' ? 1.6 : f.type === 'CASTLE' ? 1.0 : 0.65),
      0,
    ),
  );

  // In Vanilla Bannerlord, 0 fiefs makes denominator tiny (~50), causing WarDesireRatio to skyrocket!
  const denomA = useImprovedArchitecture
    ? Math.max(900, Math.pow(Math.max(400, rawFiefValueA), 0.78) * 6.5)
    : Math.max(60, rawFiefValueA);
  const denomB = useImprovedArchitecture
    ? Math.max(900, Math.pow(Math.max(400, rawFiefValueB), 0.78) * 6.5)
    : Math.max(60, rawFiefValueB);

  const warDesireRatioA = Number(
    (((totalWarPartiesA * dynamicMultiplierX) + totalStrengthA) / denomA).toFixed(2),
  );
  const warDesireRatioB = Number(
    (((totalWarPartiesB * dynamicMultiplierXB) + totalStrengthB) / denomB).toFixed(2),
  );

  // Asymmetric War Statistics (Casualties vs Prisoners vs Raids vs Sieges)
  const casualtiesInflicted = warStats?.casualtiesInflicted ?? 0;
  const casualtiesSustained = warStats?.casualtiesSustained ?? 0;
  const prisonersCaptured = warStats?.prisonersCaptured ?? 0;
  const raidsInflicted = warStats?.raidsInflicted ?? 0;
  const raidsSustained = warStats?.raidsSustained ?? 0;
  const siegesWon = warStats?.siegesWon ?? 0;
  const siegesLost = warStats?.siegesLost ?? 0;

  // In Vanilla, casualties have almost 0 weight (0.002), while raids have extreme weight (45) and prisoners (38)
  const casualtyPressure = useImprovedArchitecture
    ? (casualtiesInflicted - casualtiesSustained) * 0.08
    : (casualtiesInflicted - casualtiesSustained) * 0.002;
  const prisonerPressure = prisonersCaptured * 38;
  const raidPressure = (raidsInflicted - raidsSustained) * (useImprovedArchitecture ? 18 : 48);
  const siegePressure = (siegesWon - siegesLost) * 28;

  const warExhaustionA = Math.min(
    100,
    Math.max(0, Math.round(casualtiesSustained * 0.015 + raidsSustained * 8 + siegesLost * 15)),
  );
  const warExhaustionB = Math.min(
    100,
    Math.max(0, Math.round(casualtiesInflicted * 0.015 + raidsInflicted * 8 + siegesWon * 15)),
  );

  const fiefPowerParadoxTriggered =
    fortificationsA.length >= fortificationsB.length * 2 &&
    totalStrengthA >= totalStrengthB &&
    warDesireRatioA < warDesireRatioB;

  const fieflessDesperationTriggered = fortificationsB.length <= 1 && totalStrengthA > totalStrengthB * 1.5;

  const ratioDelta = warDesireRatioB - warDesireRatioA;
  const rawScore = 50 + (warDesireRatioA - warDesireRatioB) * 18 + (prisonerPressure + raidPressure + siegePressure + casualtyPressure) * 0.15;
  const warDesireScorePct = Math.max(5, Math.min(98, Math.round(rawScore)));

  // Tribute calculation: positive means A pays B; negative means B pays A
  let dailyTributeFromAToB = Math.round(
    ratioDelta * 520 - prisonerPressure * 4 - raidPressure * 10 - siegePressure * 6 - casualtyPressure * 2,
  );

  if (fiefPowerParadoxTriggered && dailyTributeFromAToB <= 0) {
    dailyTributeFromAToB = Math.max(140, Math.round(ratioDelta * 620));
  }

  if (useImprovedArchitecture) {
    // Improved Architecture Fix: Cap maximum tribute demand of 0-1 fief kingdoms to their actual military capacity
    if (fortificationsB.length <= 1 && totalStrengthA > totalStrengthB) {
      dailyTributeFromAToB = Math.min(-150, -Math.round((totalStrengthA - totalStrengthB) * 0.35));
    }
  } else if (fieflessDesperationTriggered) {
    // Vanilla Bug: Fiefless kingdom has 0 denominator so it demands tribute from the superpower!
    dailyTributeFromAToB = Math.max(480, Math.abs(dailyTributeFromAToB));
  }

  const forcedTruceEligible =
    useImprovedArchitecture && (warExhaustionB >= 80 || (fortificationsB.length === 0 && prisonersCaptured >= 2));

  const explanation = fiefPowerParadoxTriggered
    ? `Tımar-Güç Paradoksu: ${FACTION_INFO[factionA].name} (${fortificationsA.length} tımar) daha fazla toprağa sahip olduğu için tımar başına düşen parti yoğunluğu düşük kalıyor.`
    : fieflessDesperationTriggered
      ? `Tımarsız Düşman Dinamiği: ${FACTION_INFO[factionB].name} kaybedecek tımarı kalmadığı için vanilla formülünde paydası sıfıra yaklaşır; Mimari Çözüm ile kapasite sınırı uygulandı.`
      : `Aktif parti yoğunluğu (${totalWarPartiesA} parti × ${dynamicMultiplierX}) ve toplam askeri güç (${totalStrengthA}) üzerinden hesaplandı.`;

  return {
    factionA,
    factionB,
    totalWarPartiesA,
    dynamicMultiplierX,
    totalStrengthA,
    totalValueOfFiefsA: Math.round(rawFiefValueA),
    warDesireRatioA,
    warDesireRatioB,
    warDesireScorePct,
    fiefPowerParadoxTriggered,
    fieflessDesperationTriggered,
    dailyTributeFromAToB,
    warExhaustionA,
    warExhaustionB,
    forcedTruceEligible,
    explanation,
  };
}

// ============================================================================
// 4. SETTLEMENTCLAIMANTDECISION: TIMAR ADAYLIĞI VE LİYAKAT ALGORİTMASI
// ============================================================================

const CAMPAIGN_AVERAGE_DISTANCE_BETWEEN_TWO_TOWNS = 95;
const CAMPAIGN_MAP_DIAGONAL = 1800;

/**
 * Exact implementation of TaleWorlds.CampaignSystem.Elections.SettlementClaimantDecision.CalculateMeritOfOutcome()
 * including both Vanilla (num7 = (num6 / clamp(val2))^0.5) and Improved (^0.25 + Culture + Relation) modes.
 */
export function calculateSettlementClaimantMerit(params: {
  clan: FeudalClanRecord;
  targetSettlement: Settlement;
  allSettlements: Settlement[];
  isConqueror: boolean;
  useImprovedArchitecture?: boolean;
}): MeritCandidateBreakdown {
  const {
    clan,
    targetSettlement,
    allSettlements,
    isConqueror,
    useImprovedArchitecture = true,
  } = params;

  // Exclude targetSettlement from clan's existing fiefs to prevent the "Greedy Ruler" temporary-ownership distance=0 bug!
  const clanFortifications = allSettlements.filter(
    (s) =>
      s.type !== 'VILLAGE' &&
      s.id !== targetSettlement.id &&
      (clan.fiefIds.includes(s.id) || (clan.isPlayerClan && s.faction === 'player')),
  );

  // 1. Numerator terms
  const tierBonus = clan.tier * 30; // Clan.Tier * 30f
  const strengthContribution = Number((clan.totalStrength / 10).toFixed(1)); // num8 / 10f
  const fieflessBonus = clanFortifications.length === 0 ? 30 : 0; // num9 (+30 if no fiefs)
  const rulerBonus = clan.isRulingClan ? 100 : 0; // num11 (+100 if Ruler)
  const conquerorBonus = isConqueror ? 50 : 0; // num10 (+50 if captured settlement)
  const povertyBonus = clan.gold < 30000 ? 25 : 0; // num12
  const playerBonus = clan.isPlayerClan ? 20 : 0; // num13
  const povertyAndPlayerBonus = povertyBonus + playerBonus;

  // Architectural Improvements: Culture Match (+60) & Relation Multiplier
  const cultureMatchBonus =
    useImprovedArchitecture && clan.culture === targetSettlement.faction ? 60 : 0;
  const relationBonus = useImprovedArchitecture
    ? Math.max(-20, Math.min(35, Math.round(clan.relationWithRuler * 0.35)))
    : 0;

  // 2. Denominator: num + settlementValueForFaction
  const settlementValueForFaction =
    targetSettlement.prosperity * (targetSettlement.type === 'TOWN' ? 1.5 : 1.0);
  const existingFiefValue = clanFortifications.reduce(
    (sum, s) => sum + s.prosperity * (s.type === 'TOWN' ? 1.5 : 1.0),
    0,
  );
  const totalFiefValueDenominator = Math.max(250, existingFiefValue + settlementValueForFaction);

  // 3. Distance Multiplier (num7)
  // Find shortest (num3) and second-shortest (num4) distances from clan fortifications to targetSettlement
  let num3 = CAMPAIGN_MAP_DIAGONAL;
  let num4 = CAMPAIGN_MAP_DIAGONAL;

  for (const fief of clanFortifications) {
    const d = Math.hypot(fief.x - targetSettlement.x, fief.z - targetSettlement.z);
    if (d < num3) {
      num4 = num3;
      num3 = d;
    } else if (d < num4) {
      num4 = d;
    }
  }

  const num6 = CAMPAIGN_AVERAGE_DISTANCE_BETWEEN_TWO_TOWNS * 1.5; // 142.5
  const val = num6 * 0.25; // 35.625

  let val2 = num6;
  if (clanFortifications.length >= 2 && num4 < CAMPAIGN_MAP_DIAGONAL) {
    val2 = (num3 + num4) / 2;
  } else if (clanFortifications.length === 1 && num3 < CAMPAIGN_MAP_DIAGONAL) {
    val2 = num3;
  } else {
    val2 = num6; // Fiefless clan gets exact reference distance -> multiplier = 1.0
  }

  const clampedDistance = Math.max(val, Math.min(400, val2));
  const distanceRatio = num6 / clampedDistance;

  const distanceFactorVanilla = Number(Math.pow(distanceRatio, 0.5).toFixed(3));
  const distanceFactorImproved = Number(Math.pow(distanceRatio, 0.25).toFixed(3));

  const vanillaNumerator =
    tierBonus +
    strengthContribution +
    fieflessBonus +
    rulerBonus +
    conquerorBonus +
    povertyAndPlayerBonus;

  const improvedNumerator = vanillaNumerator + cultureMatchBonus + relationBonus;

  const vanillaMeritScore = Math.round(
    (vanillaNumerator / totalFiefValueDenominator) * distanceFactorVanilla * 2000,
  );
  const improvedMeritScore = Math.round(
    (improvedNumerator / totalFiefValueDenominator) * distanceFactorImproved * 2000,
  );

  const finalMeritScore = useImprovedArchitecture ? improvedMeritScore : vanillaMeritScore;

  return {
    clanId: clan.id,
    clanName: clan.name,
    faction: clan.faction,
    culture: clan.culture,
    tierBonus,
    strengthContribution,
    fieflessBonus,
    rulerBonus,
    conquerorBonus,
    povertyAndPlayerBonus,
    cultureMatchBonus,
    relationBonus,
    totalFiefValueDenominator: Math.round(totalFiefValueDenominator),
    effectiveDistance: Math.round(val2),
    distanceFactorVanilla,
    distanceFactorImproved,
    vanillaMeritScore,
    improvedMeritScore,
    finalMeritScore,
    councilSupportPct: 33,
  };
}

/**
 * Selects the top 3 clans for a newly conquered or contested settlement ballot.
 */
export function generateSettlementClaimantBallot(params: {
  settlement: Settlement;
  kingdomClans: FeudalClanRecord[];
  allSettlements: Settlement[];
  conquerorClanId: string;
  useImprovedArchitecture?: boolean;
}): SettlementClaimantElection {
  const {
    settlement,
    kingdomClans,
    allSettlements,
    conquerorClanId,
    useImprovedArchitecture = true,
  } = params;

  const scored = kingdomClans
    .map((clan) =>
      calculateSettlementClaimantMerit({
        clan,
        targetSettlement: settlement,
        allSettlements,
        isConqueror: clan.id === conquerorClanId,
        useImprovedArchitecture,
      }),
    )
    .sort((a, b) => b.finalMeritScore - a.finalMeritScore)
    .slice(0, 3);

  const totalScore = Math.max(1, scored.reduce((s, c) => s + c.finalMeritScore, 0));
  const candidates = scored.map((c, idx) => ({
    ...c,
    councilSupportPct:
      idx === 0
        ? Math.round((c.finalMeritScore / totalScore) * 100)
        : Math.max(10, Math.round((c.finalMeritScore / totalScore) * 100)),
  }));

  return {
    id: `election-${settlement.id}-${Date.now()}`,
    settlementId: settlement.id,
    settlementName: settlement.name,
    settlementCulture: settlement.faction,
    settlementValue: Math.round(settlement.prosperity * (settlement.type === 'TOWN' ? 1.5 : 1.0)),
    conquerorClanId,
    candidates,
    resolved: false,
    winnerClanId: null,
  };
}

/**
 * Resolves a council vote (KingdomElection.GetAiChoice) with Normalized Thresholds
 * so cost-reducing perks like Flexible Ethics (17 influence instead of 20) STILL award Charm & Relation!
 */
export function resolveKingdomCouncilVote(params: {
  election: SettlementClaimantElection;
  chosenClanId: string;
  influenceTier: 1 | 2 | 3; // Tier 1 = base 20 (or 17 with Flexible Ethics), Tier 2 = 50, Tier 3 = 100
  hasFlexibleEthicsPerk: boolean;
  hasRoyalPrivilegePolicy: boolean;
  isRulerOverride: boolean;
  useImprovedArchitecture?: boolean;
}): {
  winnerClanId: string;
  influenceSpent: number;
  relationGained: number;
  charmXpGained: number;
  flexibleEthicsBugTriggered: boolean;
} {
  const {
    election,
    chosenClanId,
    influenceTier,
    hasFlexibleEthicsPerk,
    hasRoyalPrivilegePolicy,
    isRulerOverride,
    useImprovedArchitecture = true,
  } = params;

  const baseCost = influenceTier === 1 ? 20 : influenceTier === 2 ? 50 : 100;
  const perkDiscount = hasFlexibleEthicsPerk ? 0.85 : 1.0; // 20 -> 17
  const policyDiscount = isRulerOverride && hasRoyalPrivilegePolicy ? 0.8 : 1.0; // -20% Royal Privilege

  const influenceSpent = Math.round(baseCost * perkDiscount * policyDiscount);

  // Vanilla Hardcoded Threshold Bug: checks `influenceSpent >= 20`, which fails when Flexible Ethics reduces 20 -> 17!
  const flexibleEthicsBugTriggered =
    !useImprovedArchitecture && hasFlexibleEthicsPerk && influenceTier === 1 && influenceSpent < 20;

  const relationGained = flexibleEthicsBugTriggered ? 0 : influenceTier * 8;
  const charmXpGained = flexibleEthicsBugTriggered ? 0 : influenceTier * 15;

  return {
    winnerClanId: chosenClanId,
    influenceSpent,
    relationGained,
    charmXpGained,
    flexibleEthicsBugTriggered,
  };
}

// ============================================================================
// 5. TIMARSIZ KRALLIK YIKIMI (FIEFLESS KINGDOM DESTRUCTION) VE 4 HAFTALIK ERİME
// ============================================================================

export interface KingdomDestructionCheckResult {
  newlyDestroyedFactions: FactionId[];
  independentClansCreated: number;
  witheredClanNames: string[];
  restorationRebellionsTriggered: string[];
  updatedClans: FeudalClanRecord[];
}

/**
 * State-Driven Kingdom Destruction (`if (kingdom.Fiefs.Count == 0)` on any ownership change,
 * including conquest, defection/parley, or barter) + 28-day (4-week) independent clan survival window.
 */
export function evaluateStateDrivenKingdomDestruction(params: {
  settlements: Settlement[];
  clans: FeudalClanRecord[];
  alreadyDestroyed: FactionId[];
  daysElapsed?: number;
}): KingdomDestructionCheckResult {
  const { settlements, clans, alreadyDestroyed, daysElapsed = 1 } = params;

  const majorFactions: FactionId[] = [
    'vlandia',
    'battania',
    'sturgia',
    'empire',
    'khuzait',
    'aserai',
  ];

  const newlyDestroyedFactions: FactionId[] = [];
  let independentClansCreated = 0;
  const witheredClanNames: string[] = [];
  const restorationRebellionsTriggered: string[] = [];

  for (const fac of majorFactions) {
    if (alreadyDestroyed.includes(fac)) continue;
    const fiefCount = settlements.filter((s) => s.type !== 'VILLAGE' && s.faction === fac).length;
    if (fiefCount === 0) {
      newlyDestroyedFactions.push(fac);
    }
  }

  const updatedClans: FeudalClanRecord[] = [];

  for (const clan of clans) {
    if (newlyDestroyedFactions.includes(clan.faction) && !clan.isIndependent) {
      independentClansCreated++;
      updatedClans.push({
        ...clan,
        isIndependent: true,
        isRulingClan: false,
        fiefIds: [],
        daysWithoutKingdom: 1,
      });
      continue;
    }

    if (clan.isIndependent) {
      const nextDays = clan.daysWithoutKingdom + daysElapsed;
      // High-tier clans (Tier >= 4) have a chance to defect into surviving kingdoms or spark a cultural restoration
      if (nextDays >= 28 || clan.gold <= 0) {
        if (clan.tier >= 5) {
          restorationRebellionsTriggered.push(
            `${clan.name} (Kademe ${clan.tier}), sürgünde yok olmak yerine ${FACTION_INFO[clan.culture].name} sancağı altında Restorasyon Direnişi başlattı!`,
          );
          updatedClans.push({
            ...clan,
            daysWithoutKingdom: 0,
            gold: Math.max(5000, clan.gold),
          });
        } else {
          witheredClanNames.push(clan.name);
        }
        continue;
      }
      updatedClans.push({
        ...clan,
        daysWithoutKingdom: nextDays,
      });
      continue;
    }

    updatedClans.push(clan);
  }

  return {
    newlyDestroyedFactions,
    independentClansCreated,
    witheredClanNames,
    restorationRebellionsTriggered,
    updatedClans,
  };
}

// ============================================================================
// 6. DEFAULTSETTLEMENTLOYALTYMODEL, DEFAULTSETTLEMENTFOODMODEL & İKLİM ETKİLERİ
// ============================================================================

export interface SettlementLoyaltyAndFoodBreakdown {
  settlementId: string;
  settlementName: string;
  baseLoyaltyDrift: number;
  cultureMismatchPenalty: number;
  fairgroundsBonus: number;
  dailyDefaultBonus: number;
  policyLoyaltyBonus: number;
  starvationPenalty: number;
  netDailyLoyaltyChange: number;
  projectedLoyalty: number;
  rebellionRisk: boolean;
  villageFoodProduction: number;
  caravanSupply: number;
  prosperityConsumption: number;
  garrisonConsumption: number;
  netDailyFoodChange: number;
  isStarving: boolean;
}

export function calculateSettlementLoyaltyAndFood(params: {
  settlement: Settlement;
  ownerCulture: FactionId;
  boundVillages: Settlement[];
  activePolicies: KingdomPolicyId[];
  isBesieged?: boolean;
}): SettlementLoyaltyAndFoodBreakdown {
  const {
    settlement,
    ownerCulture,
    boundVillages,
    activePolicies,
    isBesieged = false,
  } = params;

  const currentLoyalty = settlement.loyalty ?? 78;
  // Native Culture Penalty: -3.0/day if ruling clan culture != settlement native culture
  const sameCulture = ownerCulture === settlement.faction;
  const cultureMismatchPenalty = sameCulture ? 0 : -3.0;

  const fairgroundsLevel = settlement.buildings?.FAIRGROUNDS ?? 1;
  const fairgroundsBonus = fairgroundsLevel * 0.5;
  const dailyDefaultBonus = settlement.dailyDefault === 'FESTIVAL' ? 3.0 : 0;

  const policyLoyaltyBonus = activePolicies.reduce(
    (sum, pid) => sum + (KINGDOM_POLICIES[pid]?.dailyLoyaltyBonus ?? 0),
    0,
  );

  // Food Model
  const unraidedVillages = boundVillages.filter((v) => !v.isRaided);
  const villageFoodProduction = isBesieged ? 0 : unraidedVillages.length * 8 + 6;
  const caravanSupply = isBesieged ? 0 : settlement.type === 'TOWN' ? 6 : 2;
  const prosperityConsumption = -Number((settlement.prosperity / 50).toFixed(1));
  const garrisonConsumption = -Number((settlement.garrison / 5).toFixed(1));

  const netDailyFoodChange = Number(
    (
      villageFoodProduction +
      caravanSupply +
      prosperityConsumption +
      garrisonConsumption
    ).toFixed(1),
  );

  const isStarving = settlement.foodStock <= 0 && netDailyFoodChange < 0;
  const starvationPenalty = isStarving ? -3.5 : 0;

  const baseLoyaltyDrift = Number(((50 - currentLoyalty) * 0.05).toFixed(1));
  const netDailyLoyaltyChange = Number(
    (
      baseLoyaltyDrift +
      cultureMismatchPenalty +
      fairgroundsBonus +
      dailyDefaultBonus +
      policyLoyaltyBonus +
      starvationPenalty
    ).toFixed(1),
  );

  const projectedLoyalty = Math.max(0, Math.min(100, Number((currentLoyalty + netDailyLoyaltyChange).toFixed(1))));
  const rebellionRisk = projectedLoyalty < 25;

  return {
    settlementId: settlement.id,
    settlementName: settlement.name,
    baseLoyaltyDrift,
    cultureMismatchPenalty,
    fairgroundsBonus,
    dailyDefaultBonus,
    policyLoyaltyBonus,
    starvationPenalty,
    netDailyLoyaltyChange,
    projectedLoyalty,
    rebellionRisk,
    villageFoodProduction,
    caravanSupply,
    prosperityConsumption,
    garrisonConsumption,
    netDailyFoodChange,
    isStarving,
  };
}

export interface WeatherAndAutoBattleModifiers {
  weather: 'CLEAR' | 'RAIN' | 'SNOW';
  siegePreparationTimeMultiplier: number; // 2.0x on wet/snowy ground
  cavalrySpeedAndAccelMultiplier: number; // -15% (0.85x) on wet/snowy ground
  rangedMissileSpeedMultiplier: number; // -20% (0.80x) in active rain/snow
  captainPerkTier8BonusPct: number; // +3% cumulative bonus (Deft Hands + Form Fitting Armor)
}

export function computeWeatherAndAutoBattleModifiers(
  weather: 'CLEAR' | 'RAIN' | 'SNOW',
  hasCaptainPerks = true,
): WeatherAndAutoBattleModifiers {
  const isWetOrSnowy = weather === 'RAIN' || weather === 'SNOW';
  return {
    weather,
    siegePreparationTimeMultiplier: isWetOrSnowy ? 2.0 : 1.0,
    cavalrySpeedAndAccelMultiplier: isWetOrSnowy ? 0.85 : 1.0,
    rangedMissileSpeedMultiplier: isWetOrSnowy ? 0.8 : 1.0,
    captainPerkTier8BonusPct: hasCaptainPerks ? 3 : 0,
  };
}

// ============================================================================
// 7. INITIAL MACRO STATE BUILDER FOR SANCAK-I KALRADYA
// ============================================================================

export function createInitialKingdomMacroState(campaign: CampaignState): KingdomMacroState {
  const playerTier = calculateClanTier(campaign.renown).tier;
  const playerStrength = calculatePartyStrength(campaign.roster);
  const playerFiefs = campaign.settlements
    .filter((s) => s.faction === 'player' && s.type !== 'VILLAGE')
    .map((s) => s.id);

  const initialClans: FeudalClanRecord[] = [
    {
      id: 'clan-player',
      name: `${campaign.playerName} Hanedanı`,
      faction: 'player',
      culture: 'empire',
      tier: Math.max(3, playerTier),
      renown: campaign.renown,
      gold: campaign.gold * 25,
      influence: 240,
      isRulingClan: true,
      isPlayerClan: true,
      isIndependent: false,
      daysWithoutKingdom: 0,
      warPartyCount: 3,
      totalStrength: Math.max(420, playerStrength),
      fiefIds: playerFiefs.length > 0 ? playerFiefs : ['zeonica'],
      totalFiefValue: 1150,
      workshopsCount: 2,
      caravansCount: 3,
      traits: ['HONORABLE', 'GENEROUS', 'CALCULATING'],
      relationWithPlayer: 100,
      relationWithRuler: 100,
      succession: {
        leaderId: 'hero-player',
        leaderName: campaign.playerName,
        isRegentActive: false,
        regentName: null,
        heirQueue: [
          { id: 'heir-1', name: 'Alparslan Demirhan', age: 21, isAdult: true },
          { id: 'heir-2', name: 'Ayşe Demirhan', age: 14, isAdult: false },
        ],
      },
    },
    {
      id: 'clan-pethros',
      name: 'Pethros Hanedanı (Rhagaea)',
      faction: 'empire',
      culture: 'empire',
      tier: 6,
      renown: 2850,
      gold: 64000,
      influence: 520,
      isRulingClan: true,
      isPlayerClan: false,
      isIndependent: false,
      daysWithoutKingdom: 0,
      warPartyCount: 4,
      totalStrength: 940,
      fiefIds: ['zeonica', 'poros', 'danustica'],
      totalFiefValue: 2940,
      workshopsCount: 3,
      caravansCount: 4,
      traits: ['CALCULATING', 'HONORABLE'],
      relationWithPlayer: 22,
      relationWithRuler: 65,
      succession: {
        leaderId: 'lord-rhagaea',
        leaderName: 'İmparatoriçe Rhagaea',
        isRegentActive: false,
        regentName: null,
        heirQueue: [{ id: 'heir-ira', name: 'Prenses Ira', age: 22, isAdult: true }],
      },
    },
    {
      id: 'clan-dey-meroc',
      name: 'dey Meroc Hanedanı (Derthert)',
      faction: 'vlandia',
      culture: 'vlandia',
      tier: 6,
      renown: 2740,
      gold: 58000,
      influence: 480,
      isRulingClan: true,
      isPlayerClan: false,
      isIndependent: false,
      daysWithoutKingdom: 0,
      warPartyCount: 4,
      totalStrength: 890,
      fiefIds: ['veron_castle', 'hertogea_castle'],
      totalFiefValue: 1820,
      workshopsCount: 2,
      caravansCount: 3,
      traits: ['CALCULATING', 'GENEROUS'],
      relationWithPlayer: 12,
      relationWithRuler: 40,
      succession: {
        leaderId: 'lord-derthert',
        leaderName: 'Kral Derthert',
        isRegentActive: false,
        regentName: null,
        heirQueue: [{ id: 'heir-erdurand', name: 'Baron Erdurand', age: 25, isAdult: true }],
      },
    },
    {
      id: 'clan-fen-gruffendoc',
      name: 'fen Gruffendoc (Caladog)',
      faction: 'battania',
      culture: 'battania',
      tier: 5,
      renown: 2150,
      gold: 26000,
      influence: 310,
      isRulingClan: false,
      isPlayerClan: false,
      isIndependent: false,
      daysWithoutKingdom: 0,
      warPartyCount: 2,
      totalStrength: 510,
      fiefIds: [], // Fiefless frontier vassal candidate
      totalFiefValue: 0,
      workshopsCount: 1,
      caravansCount: 1,
      traits: ['DARING'],
      relationWithPlayer: 10,
      relationWithRuler: 30,
      succession: {
        leaderId: 'lord-caladog',
        leaderName: 'Yüksek Kral Caladog',
        isRegentActive: false,
        regentName: null,
        heirQueue: [{ id: 'heir-mengus', name: 'Mengus', age: 20, isAdult: true }],
      },
    },
    {
      id: 'clan-khergit',
      name: 'Urkhunait Boyu (Monchug)',
      faction: 'khuzait',
      culture: 'khuzait',
      tier: 6,
      renown: 2690,
      gold: 52000,
      influence: 450,
      isRulingClan: true,
      isPlayerClan: false,
      isIndependent: false,
      daysWithoutKingdom: 0,
      warPartyCount: 4,
      totalStrength: 920,
      fiefIds: ['syronea', 'onira'],
      totalFiefValue: 1760,
      workshopsCount: 2,
      caravansCount: 4,
      traits: ['DARING', 'HONORABLE'],
      relationWithPlayer: 8,
      relationWithRuler: 50,
      succession: {
        leaderId: 'lord-monchug',
        leaderName: 'Monchug Han',
        isRegentActive: false,
        regentName: null,
        heirQueue: [{ id: 'heir-bagai', name: 'Bagai Noyan', age: 23, isAdult: true }],
      },
    },
    {
      id: 'clan-banu-hulyan',
      name: 'Banu Hulyan (Sultan Unqid)',
      faction: 'aserai',
      culture: 'aserai',
      tier: 6,
      renown: 2620,
      gold: 74000,
      influence: 460,
      isRulingClan: true,
      isPlayerClan: false,
      isIndependent: false,
      daysWithoutKingdom: 0,
      warPartyCount: 4,
      totalStrength: 860,
      fiefIds: ['vostrum'],
      totalFiefValue: 1650,
      workshopsCount: 3,
      caravansCount: 5,
      traits: ['GENEROUS', 'MERCIFUL'],
      relationWithPlayer: 15,
      relationWithRuler: 55,
      succession: {
        leaderId: 'lord-unqid',
        leaderName: 'Sultan Unqid',
        isRegentActive: false,
        regentName: null,
        heirQueue: [{ id: 'heir-kava', name: 'Emir Kava', age: 19, isAdult: true }],
      },
    },
  ];

  const wars: Record<FactionId, WarMetricsRecord> = {
    player: {
      targetFaction: 'player',
      isAtWar: false,
      casualtiesInflicted: 0,
      casualtiesSustained: 0,
      prisonersCaptured: 0,
      raidsInflicted: 0,
      raidsSustained: 0,
      siegesWon: 0,
      siegesLost: 0,
      warExhaustion: 0,
      dailyTributePaid: 0,
      tributeDebt: 0,
    },
    empire: {
      targetFaction: 'empire',
      isAtWar: true,
      casualtiesInflicted: 3630,
      casualtiesSustained: 3191,
      prisonersCaptured: 3,
      raidsInflicted: 2,
      raidsSustained: 8,
      siegesWon: 4,
      siegesLost: 1,
      warExhaustion: 42,
      dailyTributePaid: 0,
      tributeDebt: 0,
    },
    vlandia: {
      targetFaction: 'vlandia',
      isAtWar: false,
      casualtiesInflicted: 1420,
      casualtiesSustained: 980,
      prisonersCaptured: 2,
      raidsInflicted: 4,
      raidsSustained: 1,
      siegesWon: 2,
      siegesLost: 0,
      warExhaustion: 28,
      dailyTributePaid: -320,
      tributeDebt: 0,
    },
    battania: {
      targetFaction: 'battania',
      isAtWar: false,
      casualtiesInflicted: 890,
      casualtiesSustained: 410,
      prisonersCaptured: 4,
      raidsInflicted: 3,
      raidsSustained: 0,
      siegesWon: 3,
      siegesLost: 0,
      warExhaustion: 76,
      dailyTributePaid: -450,
      tributeDebt: 1200,
    },
    sturgia: {
      targetFaction: 'sturgia',
      isAtWar: false,
      casualtiesInflicted: 620,
      casualtiesSustained: 540,
      prisonersCaptured: 1,
      raidsInflicted: 1,
      raidsSustained: 1,
      siegesWon: 1,
      siegesLost: 1,
      warExhaustion: 22,
      dailyTributePaid: 0,
      tributeDebt: 0,
    },
    khuzait: {
      targetFaction: 'khuzait',
      isAtWar: true,
      casualtiesInflicted: 2150,
      casualtiesSustained: 1840,
      prisonersCaptured: 2,
      raidsInflicted: 3,
      raidsSustained: 5,
      siegesWon: 2,
      siegesLost: 1,
      warExhaustion: 38,
      dailyTributePaid: 0,
      tributeDebt: 0,
    },
    aserai: {
      targetFaction: 'aserai',
      isAtWar: false,
      casualtiesInflicted: 510,
      casualtiesSustained: 320,
      prisonersCaptured: 1,
      raidsInflicted: 2,
      raidsSustained: 0,
      siegesWon: 1,
      siegesLost: 0,
      warExhaustion: 18,
      dailyTributePaid: -240,
      tributeDebt: 0,
    },
    bandits: {
      targetFaction: 'bandits',
      isAtWar: true,
      casualtiesInflicted: 420,
      casualtiesSustained: 45,
      prisonersCaptured: 5,
      raidsInflicted: 0,
      raidsSustained: 0,
      siegesWon: 1,
      siegesLost: 0,
      warExhaustion: 10,
      dailyTributePaid: 0,
      tributeDebt: 0,
    },
  };

  const targetSettlement =
    campaign.settlements.find((s) => s.id === 'poros') || campaign.settlements[0];

  const initialElection = generateSettlementClaimantBallot({
    settlement: targetSettlement,
    kingdomClans: initialClans.slice(0, 4),
    allSettlements: campaign.settlements,
    conquerorClanId: 'clan-player',
    useImprovedArchitecture: true,
  });

  return {
    playerKingdomFaction: 'player',
    influence: 280,
    manpowerPools: {
      player: 1850,
      empire: 4200,
      vlandia: 3600,
      battania: 1450,
      sturgia: 2100,
      khuzait: 3400,
      aserai: 3100,
      bandits: 800,
    },
    activePolicies: ['FORGIVENESS_OF_DEBTS', 'ROYAL_PRIVILEGE'],
    clans: initialClans,
    wars,
    activeElection: initialElection,
    destroyedKingdoms: [],
    weatherCondition: 'CLEAR',
    useImprovedArchitecture: true,
  };
}
