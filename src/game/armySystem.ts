/**
 * armySystem.ts — Bannerlord Ordu & Uyum (Army & Cohesion) Sistemi
 *
 * Mount & Blade II: Bannerlord `DefaultArmyManagementCalculationModel` ve `Army`
 * sınıfının saf (pure) ve deterministik karşılığı:
 *  - Çağrı Nüfuz Maliyeti (`calculatePartyCallInfluenceCost`):
 *      · Kendi klanındaki yoldaş/aile partileri: 0 Nüfuz
 *      · Diğer klan lordları: kademe (tier), asker sayısı, mesafe ve ilişki bazlı 15..65 Nüfuz
 *  - Günlük Uyum Kaybı (`calculateDailyCohesionLoss`, 10.11 araştırması):
 *      · Baz -2/gün, ordudaki her ek parti için -1/gün; aç parti başına -0.5
 *  - Uyum Artırma (`boostArmyCohesion`, 10.11):
 *      · +10 Uyum maliyeti, üye partilerin çağrı maliyetleri toplamının %10'udur;
 *        çağrı maliyeti 0 olan klan partileri maliyete hiç girmez
 *  - Ordu İaşesi (`shareArmyFoodDaily`):
 *      · Ordudaki bir lordun `foodDays <= 0` olduğunda liderin erzağından tüketir ve lidere +2 Nüfuz kazandırır
 *  - Otomatik Dağılma (`disbandArmy`):
 *      · `cohesion <= 0` olduğunda ordu dağılır, lordlar bireysel emirlerine döner
 */
import {
  type CampaignState,
  type ChronicleEvent,
  type FactionId,
  type LordAgent,
  type Settlement,
  getTotalTroops,
} from './rules';
import { getSiegeCampSlotPoint } from './siegeMechanics';
import { getPlayerCultureModifiers } from './cultureBonuses.ts';

export type ArmyOrderKind = 'GATHERING' | 'SIEGE' | 'DEFEND' | 'PATROL';

export interface ArmyRecord {
  id: string;
  name: string;
  faction: FactionId;
  leaderId: string; // 'player' veya lord.id
  memberLordIds: string[];
  cohesion: number; // 0..100, başlangıç 100
  targetSettlementId?: string;
  orderKind?: ArmyOrderKind;
  createdDay?: number;
}

export interface CohesionBreakdown {
  baseLoss: number;
  partyCountPenalty: number;
  starvationPenalty: number;
  totalDailyChange: number; // negatif (örn. -4.5)
  totalDailyLoss: number; // pozitif büyüklük (örn. 4.5)
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function getLordTroopCount(lord: Pick<LordAgent, 'armySize' | 'roster'>): number {
  const fromRoster = lord.roster ? getTotalTroops(lord.roster) : 0;
  return Math.max(lord.armySize ?? 0, fromRoster);
}

/**
 * Oyuncunun kendi klanına ait bir parti mi?
 */
export function isPlayerClanParty(lord: Pick<LordAgent, 'faction' | 'isPlayerClan'>): boolean {
  return Boolean(lord.isPlayerClan || lord.faction === 'player');
}

/**
 * Oyuncunun ordu kurarken hangi krallık sancağı altında hareket ettiğini belirler.
 */
export function resolvePlayerArmyFaction(state: CampaignState): FactionId {
  if (state.playerFaction && state.playerFaction !== 'bandits') {
    return state.playerFaction;
  }
  const alliedLord = state.lords.find(
    (l) => l.isAlliedWithPlayer && l.faction !== 'bandits' && l.faction !== 'player',
  );
  if (alliedLord) return alliedLord.faction;
  return 'player';
}

/**
 * Bannerlord çağrı maliyeti etkenleri (10.11): kendi klan partileri 0 Nüfuz;
 * diğerleri asker sayısı, klan kademesi, ilişki ve mesafeye göre pahalanır.
 * Etkenler Bannerlord'undur; katsayılar bu projenin nüfuz ekonomisine
 * ölçeklidir (kesin oyun katsayıları kaynaklarda yayımlı değildir).
 */
export function calculatePartyCallInfluenceCost(
  lord: Pick<
    LordAgent,
    'id' | 'faction' | 'armySize' | 'roster' | 'relation' | 'x' | 'z' | 'isPlayerClan' | 'clanTier'
  >,
  state?: Pick<CampaignState, 'playerX' | 'playerZ'> & Partial<Pick<CampaignState, 'heroes'>>,
  leaderPos?: { x: number; z: number },
): number {
  if (isPlayerClanParty(lord)) {
    return 0;
  }

  const refX = leaderPos?.x ?? state?.playerX ?? lord.x;
  const refZ = leaderPos?.z ?? state?.playerZ ?? lord.z;
  const dist = Math.hypot(lord.x - refX, lord.z - refZ);

  const tier = clamp(lord.clanTier ?? 3, 1, 6);
  const troops = getLordTroopCount(lord);
  const relation = clamp(lord.relation ?? 0, -100, 100);

  const tierComponent = tier * 4.5; // 4.5 .. 27
  const sizeComponent = troops * 0.34; // ~8 .. 24
  const distanceComponent = Math.min(14, dist * 0.06); // 0 .. 14
  const relationDiscount = relation * 0.14; // -14 .. +14

  const raw = Math.round(12 + tierComponent + sizeComponent + distanceComponent - relationDiscount);
  // 10.8: Sturgia orduları %50 ucuza toplar; Vlandiya %20 pahalıya (kültürel feat).
  const cultureMultiplier = getPlayerCultureModifiers(
    state?.heroes ? { heroes: state.heroes } : undefined,
  ).armyCallCostMultiplier;
  return Math.max(1, Math.round(clamp(raw, 15, 65) * cultureMultiplier));
}

/**
 * Günlük Uyum (Cohesion) değişimini ve alt kalemlerini hesaplar — Bannerlord
 * modeli (10.11 araştırması):
 *  - Baz kayıp: -2/gün (her ordu için sabit)
 *  - Her ek parti için: -1/gün ("5 ek parti → toplam -7")
 *  - Aç (erzaksız) parti başına: -0.5 (oyun içi döküm satırı)
 * Eski `-1.5×parti - asker/50 - 5 açlık` formülü uydurmaydı; asker sayısı
 * uyum kaybına doğrudan girmez.
 */
export function getArmyCohesionBreakdown(
  army: Pick<ArmyRecord, 'leaderId' | 'memberLordIds'>,
  state: Pick<CampaignState, 'roster' | 'food' | 'lords'>,
): CohesionBreakdown {
  const memberLords = state.lords.filter((l) => army.memberLordIds.includes(l.id));
  const memberCount = memberLords.length;

  const leaderStarving =
    army.leaderId === 'player'
      ? state.food <= 0
      : (() => {
          const leader = state.lords.find((l) => l.id === army.leaderId);
          return (leader?.foodDays ?? 5) <= 0;
        })();
  const starvingMemberCount = memberLords.filter((l) => (l.foodDays ?? 5) <= 0).length;
  const starvingPartyCount = starvingMemberCount + (leaderStarving ? 1 : 0);

  const baseLoss = -2;
  const partyCountPenalty = -memberCount;
  const starvationPenalty = Number((-0.5 * starvingPartyCount).toFixed(2));

  const totalDailyChange = Number(
    (baseLoss + partyCountPenalty + starvationPenalty).toFixed(2),
  );

  return {
    baseLoss,
    partyCountPenalty,
    starvationPenalty,
    totalDailyChange,
    totalDailyLoss: Math.abs(totalDailyChange),
  };
}

/**
 * Günlük Uyum kaybını döndürür (negatif değişim değeri, örn. -6.8).
 */
export function calculateDailyCohesionLoss(
  army: Pick<ArmyRecord, 'leaderId' | 'memberLordIds'>,
  state: Pick<CampaignState, 'roster' | 'food' | 'lords'>,
): number {
  return getArmyCohesionBreakdown(army, state).totalDailyChange;
}

/**
 * +10 Uyum (Cohesion) artışı başına Nüfuz maliyeti — Bannerlord modeli (10.11):
 * maliyet, ordudaki her partinin çağrı maliyetine doğrudan bağlıdır; çağrı
 * maliyeti 0 olan kendi klan partileri maliyete hiç katkı vermez (yalnız klan
 * partilerinden kurulu orduda uyum tazelemek bedavadır). +10 uyum, toplam
 * çağrı maliyetinin %10'u olarak hesaplanır.
 * Eski `10 + memberCount × 2` formülü uydurmaydı.
 */
export function calculateCohesionBoostCost(
  army: Pick<ArmyRecord, 'leaderId' | 'memberLordIds'>,
  state: Pick<CampaignState, 'lords' | 'playerX' | 'playerZ'>,
): number {
  const memberLords = state.lords.filter((l) => army.memberLordIds.includes(l.id));
  const totalCallCost = memberLords.reduce(
    (sum, lord) => sum + calculatePartyCallInfluenceCost(lord, state),
    0,
  );
  return Math.round(totalCallCost * 0.1);
}

/**
 * Oyuncunun mevcut aktif ordusunu döndürür (yoksa `null`).
 */
export function getPlayerArmy(state: Pick<CampaignState, 'armies'>): ArmyRecord | null {
  return (state.armies ?? []).find((a) => a.leaderId === 'player') ?? null;
}

/**
 * Bir lordun içinde bulunduğu orduyu döndürür (lider veya üye olarak).
 */
export function getArmyForLord(
  state: Pick<CampaignState, 'armies'>,
  lordId: string,
): ArmyRecord | null {
  return (
    (state.armies ?? []).find(
      (a) => a.leaderId === lordId || a.memberLordIds.includes(lordId),
    ) ?? null
  );
}

/**
 * Bir ordudaki toplam asker sayısını (lider + tüm üye partiler) hesaplar.
 */
export function getArmyTotalTroops(
  army: Pick<ArmyRecord, 'leaderId' | 'memberLordIds'>,
  state: Pick<CampaignState, 'roster' | 'lords'>,
): number {
  const leaderTroops =
    army.leaderId === 'player'
      ? getTotalTroops(state.roster)
      : (() => {
          const leader = state.lords.find((l) => l.id === army.leaderId);
          return leader ? getLordTroopCount(leader) : 0;
        })();
  const memberTroops = state.lords
    .filter((l) => army.memberLordIds.includes(l.id))
    .reduce((sum, l) => sum + getLordTroopCount(l), 0);
  return leaderTroops + memberTroops;
}

/**
 * Oyuncunun orduya çağırabileceği uygun lord partilerini listeler.
 */
export function getCallableLordsForPlayer(state: CampaignState): LordAgent[] {
  const playerArmy = getPlayerArmy(state);
  const existingMembers = new Set(playerArmy?.memberLordIds ?? []);
  const playerFaction = resolvePlayerArmyFaction(state);

  return state.lords.filter((lord) => {
    if (lord.faction === 'bandits') return false;
    if (lord.isAtWarWithPlayer) return false;
    if (existingMembers.has(lord.id)) return false;

    const otherArmy = getArmyForLord(state, lord.id);
    if (otherArmy && otherArmy.leaderId !== 'player') return false;

    const troops = getLordTroopCount(lord);
    if (troops < 8) return false;

    if (isPlayerClanParty(lord)) return true;
    if (lord.isAlliedWithPlayer) return true;
    if (playerFaction !== 'player' && lord.faction === playerFaction) return true;

    return lord.relation >= 0;
  });
}

/**
 * Haritada komutanı takip eden üye lordun eskort dizilim noktasını hesaplar.
 */
export function getArmyEscortSlotPoint(
  leaderX: number,
  leaderZ: number,
  leaderFacingRad = 0,
  memberIndex = 0,
): { x: number; z: number } {
  const row = Math.floor(memberIndex / 2) + 1;
  const side = memberIndex % 2 === 0 ? 1 : -1;
  const backDist = 3.8 + row * 2.6;
  const lateralDist = side * (2.6 + row * 1.1);

  const backAngle = leaderFacingRad + Math.PI;
  const rightAngle = leaderFacingRad + Math.PI / 2;

  const x = leaderX + Math.cos(backAngle) * backDist + Math.cos(rightAngle) * lateralDist;
  const z = leaderZ + Math.sin(backAngle) * backDist + Math.sin(rightAngle) * lateralDist;

  return {
    x: clamp(x, -505, 505),
    z: clamp(z, -375, 375),
  };
}

/**
 * Oyuncu (veya bir lord) yeni bir ordu kurar ya da mevcut ordusuna yeni lordlar çağırır.
 */
export function createOrExpandPlayerArmy(
  state: CampaignState,
  selectedLordIds: string[],
  targetSettlementId?: string,
): {
  nextState: CampaignState;
  success: boolean;
  influenceSpent: number;
  army: ArmyRecord | null;
  reason?: string;
} {
  const uniqueIds = Array.from(new Set(selectedLordIds)).filter(Boolean);
  const existingArmy = getPlayerArmy(state);

  if (uniqueIds.length === 0 && !existingArmy) {
    return {
      nextState: state,
      success: false,
      influenceSpent: 0,
      army: null,
      reason: 'Ordu kurmak için en az bir sancakbeyi seçmelisiniz.',
    };
  }

  const newIds = uniqueIds.filter((id) => !existingArmy?.memberLordIds.includes(id));
  const calledLords = state.lords.filter((l) => newIds.includes(l.id));

  const totalCost = calledLords.reduce(
    (sum, lord) =>
      sum +
      calculatePartyCallInfluenceCost(lord, state, {
        x: state.playerX,
        z: state.playerZ,
      }),
    0,
  );

  const currentInfluence = state.influence ?? 0;
  if (currentInfluence < totalCost) {
    return {
      nextState: state,
      success: false,
      influenceSpent: 0,
      army: existingArmy,
      reason: `Yetersiz Nüfuz! (Gereken: ★ ${totalCost}, Mevcut: ★ ${currentInfluence})`,
    };
  }

  const activeSiegeSettlementId =
    targetSettlementId ??
    (state.playerSiege && !state.playerSiege.inside ? state.playerSiege.settlementId : undefined) ??
    existingArmy?.targetSettlementId;

  const siegeSettlement = activeSiegeSettlementId
    ? state.settlements.find((s) => s.id === activeSiegeSettlementId)
    : undefined;

  const mergedMemberIds = Array.from(
    new Set([...(existingArmy?.memberLordIds ?? []), ...newIds]),
  );

  const armyId = existingArmy?.id ?? `army-player-${state.day}`;
  const nextArmy: ArmyRecord = {
    id: armyId,
    name: existingArmy?.name ?? `${state.playerName} Ordusu`,
    faction: existingArmy?.faction ?? resolvePlayerArmyFaction(state),
    leaderId: 'player',
    memberLordIds: mergedMemberIds,
    cohesion: existingArmy ? existingArmy.cohesion : 100,
    targetSettlementId: activeSiegeSettlementId,
    orderKind: siegeSettlement ? 'SIEGE' : 'GATHERING',
    createdDay: existingArmy?.createdDay ?? state.day,
  };

  const nextLords = state.lords.map((lord) => {
    const memberIdx = mergedMemberIds.indexOf(lord.id);
    if (memberIdx === -1) return lord;

    if (siegeSettlement) {
      const slotPt = getSiegeCampSlotPoint(
        siegeSettlement,
        state.playerX,
        state.playerZ,
        memberIdx + 1,
        mergedMemberIds.length + 1,
      );
      return {
        ...lord,
        armyId,
        targetX: slotPt.x,
        targetZ: slotPt.z,
        currentAction: `${siegeSettlement.name} kuşatma çemberinde (${nextArmy.name})`,
        order: {
          kind: 'SIEGE' as const,
          targetSettlementId: siegeSettlement.id,
          sinceDay: state.day,
          siegeProgress: lord.order?.siegeProgress ?? state.playerSiege?.campProgress ?? 20,
        },
      };
    }

    const escortPt = getArmyEscortSlotPoint(state.playerX, state.playerZ, 0, memberIdx);
    const dist = Math.hypot(lord.x - state.playerX, lord.z - state.playerZ);
    return {
      ...lord,
      armyId,
      targetX: escortPt.x,
      targetZ: escortPt.z,
      currentAction:
        dist <= 14
          ? `${nextArmy.name} eskort hattında ilerliyor`
          : `${nextArmy.name} sancağına katılmak üzere yolda`,
    };
  });

  const otherArmies = (state.armies ?? []).filter((a) => a.id !== armyId && a.leaderId !== 'player');
  const chronicleEntry: ChronicleEvent = {
    id: `army-call-${state.day}-${mergedMemberIds.length}`,
    day: state.day,
    category: 'WAR',
    text:
      newIds.length > 0
        ? `${nextArmy.name} sancağı altına ${calledLords.map((l) => l.name).join(', ')} çağrıldı (-${totalCost} Nüfuz).`
        : `${nextArmy.name} harekât emri güncellendi.`,
  };

  return {
    success: true,
    influenceSpent: totalCost,
    army: nextArmy,
    nextState: {
      ...state,
      influence: currentInfluence - totalCost,
      lords: nextLords,
      armies: [nextArmy, ...otherArmies],
      chronicle: [chronicleEntry, ...state.chronicle].slice(0, 20),
    },
  };
}

/**
 * +10 Uyum (Cohesion) artışı uygular (maliyet: `calculateCohesionBoostCost`).
 */
export function boostArmyCohesion(
  state: CampaignState,
  armyId?: string,
  steps = 1,
): {
  nextState: CampaignState;
  success: boolean;
  influenceSpent: number;
  newCohesion: number;
  reason?: string;
} {
  const armies = state.armies ?? [];
  const targetArmy = armyId
    ? armies.find((a) => a.id === armyId)
    : armies.find((a) => a.leaderId === 'player');

  if (!targetArmy) {
    return {
      nextState: state,
      success: false,
      influenceSpent: 0,
      newCohesion: 0,
      reason: 'Aktif bir ordu bulunamadı.',
    };
  }

  if (targetArmy.cohesion >= 100) {
    return {
      nextState: state,
      success: false,
      influenceSpent: 0,
      newCohesion: targetArmy.cohesion,
      reason: 'Ordu uyumu zaten tam (%100).',
    };
  }

  const safeSteps = Math.max(1, Math.floor(steps));
  const costPerStep = calculateCohesionBoostCost(targetArmy, state);
  const totalCost = costPerStep * safeSteps;
  const currentInfluence = state.influence ?? 0;

  if (targetArmy.leaderId === 'player' && currentInfluence < totalCost) {
    return {
      nextState: state,
      success: false,
      influenceSpent: 0,
      newCohesion: targetArmy.cohesion,
      reason: `Uyum artırmak için ★ ${totalCost} Nüfuz gerekli (Mevcut: ★ ${currentInfluence}).`,
    };
  }

  const newCohesion = clamp(targetArmy.cohesion + 10 * safeSteps, 0, 100);
  const nextArmies = armies.map((a) =>
    a.id === targetArmy.id ? { ...a, cohesion: newCohesion } : a,
  );

  return {
    success: true,
    influenceSpent: targetArmy.leaderId === 'player' ? totalCost : 0,
    newCohesion,
    nextState: {
      ...state,
      influence:
        targetArmy.leaderId === 'player' ? currentInfluence - totalCost : currentInfluence,
      armies: nextArmies,
    },
  };
}

/**
 * Tek bir lordu ordudan çıkarır. Orduda hiç üye kalmazsa ordu dağılır.
 */
export function removeLordFromArmy(
  state: CampaignState,
  armyId: string,
  lordId: string,
): CampaignState {
  const targetArmy = (state.armies ?? []).find((a) => a.id === armyId);
  if (!targetArmy) return state;

  const remainingMembers = targetArmy.memberLordIds.filter((id) => id !== lordId);
  if (remainingMembers.length === 0) {
    return disbandArmy(state, armyId, 'Son müttefik birlik de ayrıldığı için ordu dağıldı.').nextState;
  }

  const nextLords = state.lords.map((l) =>
    l.id === lordId
      ? {
          ...l,
          armyId: null,
          currentAction: 'Kendi sancağıyla devriyeye döndü',
          order:
            l.order?.kind === 'SIEGE'
              ? { kind: 'PATROL' as const, sinceDay: state.day }
              : l.order,
        }
      : l,
  );

  const nextArmies = (state.armies ?? []).map((a) =>
    a.id === armyId ? { ...a, memberLordIds: remainingMembers } : a,
  );

  return {
    ...state,
    lords: nextLords,
    armies: nextArmies,
  };
}

/**
 * Orduyu tamamen dağıtır (`disbandArmy`), lordların `armyId` bağlarını temizler
 * ve bireysel emirlere döndürür.
 */
export function disbandArmy(
  state: CampaignState,
  armyId?: string,
  reason?: string,
): { nextState: CampaignState; disbandedArmy: ArmyRecord | null } {
  const armies = state.armies ?? [];
  const targetArmy = armyId
    ? armies.find((a) => a.id === armyId)
    : armies.find((a) => a.leaderId === 'player');

  if (!targetArmy) {
    return { nextState: state, disbandedArmy: null };
  }

  const memberSet = new Set([targetArmy.leaderId, ...targetArmy.memberLordIds]);
  const nextLords = state.lords.map((lord) => {
    if (!memberSet.has(lord.id) && lord.armyId !== targetArmy.id) return lord;
    const ownFief = state.settlements.find(
      (s) => s.faction === lord.faction && s.type !== 'VILLAGE',
    );
    return {
      ...lord,
      armyId: null,
      currentAction: 'Ordudan ayrıldı, kendi bölgesinde devriye geziyor',
      order: {
        kind: 'PATROL' as const,
        targetSettlementId: ownFief?.id,
        sinceDay: state.day,
      },
    };
  });

  const nextArmies = armies.filter((a) => a.id !== targetArmy.id);
  const text =
    reason ??
    `${targetArmy.name} sancağı indirildi; birleşik kuvvetler kendi tımarlarına dağıldı.`;

  return {
    disbandedArmy: targetArmy,
    nextState: {
      ...state,
      lords: nextLords,
      armies: nextArmies,
      chronicle: [
        {
          id: `army-disband-${state.day}-${targetArmy.id}`,
          day: state.day,
          category: 'WAR',
          text,
        },
        ...state.chronicle,
      ].slice(0, 20),
    },
  };
}

/**
 * Günlük Ordu & Uyum & Erzak Paylaşımı döngüsü (`worldSim.ts` içinde her gün çalışır):
 *  1. Ordudaki bir lordun `foodDays <= 0` olduğunda liderin/oyuncunun erzağından tüketir
 *     ve lidere günlük `+2` Nüfuz kazandırır.
 *  2. Günlük Uyum (`cohesion`) düşüşünü uygular.
 *  3. `cohesion <= 0` olan ordular otomatik olarak dağılır (`disbandArmy`).
 */
export function advanceArmiesDaily(state: CampaignState): {
  nextState: CampaignState;
  events: Array<{ category: string; text: string }>;
} {
  let working: CampaignState = {
    ...state,
    influence: state.influence ?? 0,
    armies: [...(state.armies ?? [])],
    lords: state.lords.map((l) => ({ ...l })),
  };
  const events: Array<{ category: string; text: string }> = [];

  for (const army of [...(working.armies ?? [])]) {
    const memberLords = working.lords.filter((l) => army.memberLordIds.includes(l.id));
    if (memberLords.length === 0) {
      const res = disbandArmy(working, army.id);
      working = res.nextState;
      continue;
    }

    // 1. Ordu İaşesi (Erzak Paylaşımı): foodDays <= 0 olan üye lordlar liderin erzağından beslenir (+2 Nüfuz)
    for (const member of memberLords) {
      if ((member.foodDays ?? 0) <= 0) {
        if (army.leaderId === 'player' && working.food >= 2) {
          working.food = Math.max(0, working.food - 2);
          working.influence = (working.influence ?? 0) + 2;
          member.foodDays = 2;
          member.morale = Math.min(100, (member.morale ?? 70) + 2);
          events.push({
            category: 'ECONOMY',
            text: `${member.name} birliğine ordunun erzak ambarından tayın dağıtıldı (+2 Nüfuz).`,
          });
        } else if (army.leaderId !== 'player') {
          const leader = working.lords.find((l) => l.id === army.leaderId);
          if (leader && (leader.foodDays ?? 0) >= 3) {
            leader.foodDays = (leader.foodDays ?? 3) - 1;
            member.foodDays = 2;
          }
        }
      }
    }

    // 2. Günlük Uyum (Cohesion) Kaybı
    const lossDelta = calculateDailyCohesionLoss(army, working); // negatif
    const nextCohesion = Math.max(
      0,
      Math.min(100, Math.round((army.cohesion + lossDelta) * 10) / 10),
    );

    if (nextCohesion <= 0) {
      const reason = `${army.name} içindeki uyum tükendi (Cohesion 0); sancakbeyleri ordudan dağıldı!`;
      const res = disbandArmy(working, army.id, reason);
      working = res.nextState;
      events.push({ category: 'WAR', text: reason });
      continue;
    }

    working.armies = (working.armies ?? []).map((a) =>
      a.id === army.id ? { ...a, cohesion: nextCohesion } : a,
    );
  }

  return { nextState: working, events };
}

/**
 * Oyuncunun ordusunun hedef yerleşimini günceller; hedef bir düşman kalesi/şehriyse
 * üye lordları kuşatma düzenine hazırlar.
 */
export function setPlayerArmyTargetSettlement(
  state: CampaignState,
  settlementId: string | undefined,
): CampaignState {
  const playerArmy = getPlayerArmy(state);
  if (!playerArmy) return state;

  const target: Settlement | undefined = settlementId
    ? state.settlements.find((s) => s.id === settlementId)
    : undefined;

  const nextOrderKind: ArmyOrderKind = target
    ? target.faction === 'player'
      ? 'DEFEND'
      : 'SIEGE'
    : 'GATHERING';

  const nextArmies = (state.armies ?? []).map((a) =>
    a.id === playerArmy.id
      ? { ...a, targetSettlementId: target?.id, orderKind: nextOrderKind }
      : a,
  );

  return {
    ...state,
    armies: nextArmies,
  };
}
