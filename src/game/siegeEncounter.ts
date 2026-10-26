/**
 * siegeEncounter.ts — Görev 1 + Çoklu Lord Kuşatma Çemberi & Müşterek Muharebe
 *
 * Kuşatılan bir yerleşime tıklandığında normal şehir menüsü yerine Bannerlord'un
 * üç bağlamlı kuşatma ekranı açılır:
 *   1. `attacker`  — oyuncu yerleşimi bizzat kuşatıyor
 *   2. `outsider`  — yabancı bir lord/ordu kuşatıyor, oyuncu dışarıdan yaklaştı
 *   3. `defender`  — oyuncunun kendi mülkü kuşatılıyor veya oyuncu hatları yarıp içeri girdi
 */
import {
  CampaignState,
  FactionId,
  LordAgent,
  Settlement,
  TroopRoster,
  deductCasualtiesFromRoster,
  getSettlementArrivalRadius,
  getTotalTroops,
} from './rules';
import {
  SIEGE_CAMP_SLOT_ANGLE_STEP,
  SIEGE_CAMP_STANDOFF,
  SIEGE_MELEE_SLOTS,
  SIEGE_RANGED_SLOTS,
  canFitSiegeEngine,
  countSiegeEngineSlots,
  getBesiegerSlotAssignments,
  getSiegeCampPoint,
  getSiegeCampSlotPoint,
  getWallSections,
  normalizeSiegeEngineSlots,
  removeDestroyedSiegeEngines,
  setWallSections,
  wallBreached,
} from './siegeMechanics';
import { getPlayerArmy } from './armySystem';
import { troopStackTotals } from './bannerlordFoundation';
import { snapToNearestLand } from './navigation';

export {
  SIEGE_CAMP_SLOT_ANGLE_STEP,
  SIEGE_CAMP_STANDOFF,
  SIEGE_MELEE_SLOTS,
  SIEGE_RANGED_SLOTS,
  canFitSiegeEngine,
  countSiegeEngineSlots,
  getBesiegerSlotAssignments,
  getSiegeCampPoint,
  getSiegeCampSlotPoint,
  getWallSections,
  normalizeSiegeEngineSlots,
  removeDestroyedSiegeEngines,
  setWallSections,
  wallBreached,
};

export type SiegeEncounterRole = 'attacker' | 'outsider' | 'defender';

export interface SiegeEncounterView {
  settlement: Settlement;
  role: SiegeEncounterRole;
  besiegers: LordAgent[];
  campProgress: number;
  wallHealth: number;
  wallSections: [number, number];
  campReady: boolean;
  breached: boolean;
  hasRam: boolean;
  hasTower: boolean;
  rangedCount: number;
  attackerFaction: FactionId;
  attackerTroops: number;
  defenderTroops: number;
}

/** Bu yerleşimi aktif olarak kuşatan lordları döndürür. */
export function getBesiegingLords(state: CampaignState, settlementId: string): LordAgent[] {
  return state.lords.filter(
    (lord) =>
      lord.order?.kind === 'SIEGE' && lord.order.targetSettlementId === settlementId,
  );
}

/**
 * Bir yerleşimi kuşatan tüm düşman lordların birliklerini (`TroopRoster`) tek bir
 * müşterek kuşatma ordusu komutanı altında birleştirir.
 * Oyuncu dışarıdan "Kuşatan Orduya Taarruz" veya içeriden "Huruc Harekâtı (Sally Out)"
 * başlattığında yalnız `besiegers[0]` ile değil, tüm kuşatmacıların birleşik ordusuyla savaşır!
 */
export function combineBesiegerForces(besiegers: readonly LordAgent[]): LordAgent | null {
  if (besiegers.length === 0) return null;
  if (besiegers.length === 1) {
    const single = besiegers[0];
    const roster: TroopRoster = single.roster ?? {
      infantry: Math.max(2, Math.floor(single.armySize * 0.35)),
      archer: Math.max(2, Math.floor(single.armySize * 0.28)),
      cavalry: Math.max(1, Math.floor(single.armySize * 0.22)),
      horseArcher: Math.max(1, Math.floor(single.armySize * 0.15)),
    };
    return {
      ...single,
      roster: { ...roster },
      armySize: Math.max(1, getTotalTroops(roster)),
    };
  }

  const combinedRoster: TroopRoster = {
    infantry: 0,
    archer: 0,
    cavalry: 0,
    horseArcher: 0,
  };
  let totalWounded = 0;
  let totalPrisoners = 0;
  let moraleSum = 0;

  for (const lord of besiegers) {
    const r: TroopRoster = lord.roster ?? {
      infantry: Math.max(2, Math.floor(lord.armySize * 0.35)),
      archer: Math.max(2, Math.floor(lord.armySize * 0.28)),
      cavalry: Math.max(1, Math.floor(lord.armySize * 0.22)),
      horseArcher: Math.max(1, Math.floor(lord.armySize * 0.15)),
    };
    combinedRoster.infantry += Math.max(0, r.infantry);
    combinedRoster.archer += Math.max(0, r.archer);
    combinedRoster.cavalry += Math.max(0, r.cavalry);
    combinedRoster.horseArcher += Math.max(0, r.horseArcher);
    totalWounded += lord.wounded ?? 0;
    totalPrisoners += lord.prisoners ?? 0;
    moraleSum += lord.morale ?? 75;
  }

  const commander = besiegers[0];
  const combinedTotal = Math.max(1, getTotalTroops(combinedRoster));

  return {
    ...commander,
    roster: combinedRoster,
    armySize: combinedTotal,
    wounded: totalWounded,
    prisoners: totalPrisoners,
    morale: Math.round(moraleSum / besiegers.length),
    currentAction: `${commander.name} ve ${besiegers.length - 1} müttefik komutanın müşterek kuşatma ordusu`,
  };
}

/**
 * Müşterek kuşatma muharebesi tamamlandığında zayiatı kuşatmaya katılan TÜM düşman
 * lordlara orantılı olarak dağıtır ve zafer halinde hepsinin kuşatma emrini kaldırıp
 * güvenli karaya geri çekilmelerini sağlar.
 */
export function distributeCombinedBesiegerCasualties(
  lords: readonly LordAgent[],
  settlementId: string,
  victory: boolean,
  enemiesDefeatedCount: number,
  day: number,
): LordAgent[] {
  const besiegers = lords.filter(
    (l) => l.order?.kind === 'SIEGE' && l.order.targetSettlementId === settlementId,
  );
  if (besiegers.length === 0) return [...lords];

  const totalInitialTroops = Math.max(
    1,
    besiegers.reduce((sum, l) => sum + Math.max(1, getTotalTroops(l.roster)), 0),
  );

  return lords.map((lord) => {
    const isBesieger =
      lord.order?.kind === 'SIEGE' && lord.order.targetSettlementId === settlementId;
    if (!isBesieger) return lord;

    const currentRoster: TroopRoster = lord.roster ?? {
      infantry: Math.max(2, Math.floor(lord.armySize * 0.35)),
      archer: Math.max(2, Math.floor(lord.armySize * 0.28)),
      cavalry: Math.max(1, Math.floor(lord.armySize * 0.22)),
      horseArcher: Math.max(1, Math.floor(lord.armySize * 0.15)),
    };
    const lordTroops = Math.max(1, getTotalTroops(currentRoster));
    const share = lordTroops / totalInitialTroops;
    const lordCasualties = Math.max(1, Math.round(enemiesDefeatedCount * share));

    let updatedRoster = deductCasualtiesFromRoster(currentRoster, lordCasualties);
    let updatedTotal = getTotalTroops(updatedRoster);

    if (victory) {
      const maxSurviving = Math.max(2, Math.floor(lordTroops * 0.25));
      if (updatedTotal > maxSurviving) {
        updatedRoster = deductCasualtiesFromRoster(
          updatedRoster,
          updatedTotal - maxSurviving,
        );
        updatedTotal = getTotalTroops(updatedRoster);
      }
      if (updatedTotal <= 0) {
        updatedRoster = { infantry: 1, archer: 0, cavalry: 0, horseArcher: 0 };
        updatedTotal = 1;
      }
      const retreatPt = snapToNearestLand(lord.x + 20, lord.z - 20);
      return {
        ...lord,
        roster: updatedRoster,
        armySize: updatedTotal,
        wounded: (lord.wounded ?? 1) + Math.max(1, Math.floor(lordCasualties * 0.35)),
        x: retreatPt.x,
        z: retreatPt.z,
        targetX: retreatPt.x,
        targetZ: retreatPt.z,
        currentAction: 'Kuşatma bozgunundan sonra ordusunu yeniden topluyor',
        order: {
          kind: 'FLEE' as const,
          sinceDay: day,
        },
      };
    }

    return {
      ...lord,
      roster: updatedRoster,
      armySize: Math.max(1, updatedTotal),
      wounded: (lord.wounded ?? 1) + Math.floor(lordCasualties * 0.25),
    };
  });
}

/** Haritada duman/çember gösterilecek tüm kuşatılan yerleşim kimlikleri. */
export function besiegedSettlementIdSet(state: CampaignState): Set<string> {
  const ids = new Set<string>();
  for (const lord of state.lords) {
    // Kuşatma, ordu hedefe VARIP kampı kurduğunda başlar (Bannerlord): emir
    // verilmiş ama lord hâlâ yoldayken yerleşim "kuşatma altında" sayılmaz —
    // kamp halkası/motor görselleri erken beliriyordu. Varış ölçütü
    // worldSim'in ilerleme kapısıyla aynıdır: kurulu yarıçap içinde olma
    // veya ilerleme birikmiş olma (kamp kurulduktan sonra lord itilse bile).
    if (lord.order?.kind === 'SIEGE' && lord.order.targetSettlementId) {
      const target = state.settlements.find((s) => s.id === lord.order?.targetSettlementId);
      if (!target) continue;
      const radius = Math.max(getSettlementArrivalRadius(target.type) + 3, SIEGE_CAMP_STANDOFF + 4);
      const dist = Math.hypot(lord.x - target.x, lord.z - target.z);
      if (dist <= radius || (lord.order.siegeProgress ?? 0) > 0) {
        ids.add(target.id);
      }
    }
  }
  if (state.playerSiege?.settlementId) {
    ids.add(state.playerSiege.settlementId);
  }
  return ids;
}

/** Yerleşim kuşatma altındaysa oyuncunun rolünü belirler; değilse `null`. */
export function resolveSiegeRole(
  state: CampaignState,
  settlementId: string,
): SiegeEncounterRole | null {
  const settlement = state.settlements.find((s) => s.id === settlementId);
  if (!settlement || settlement.type === 'VILLAGE') return null;

  const playerHere = state.playerSiege?.settlementId === settlementId;
  if (playerHere && state.playerSiege?.inside) return 'defender';
  if (playerHere) return 'attacker';

  const besiegers = getBesiegingLords(state, settlementId);
  if (besiegers.length === 0) return null;

  if (settlement.faction === 'player') return 'defender';
  return 'outsider';
}

export function buildSiegeEncounterView(
  state: CampaignState,
  settlementId: string,
): SiegeEncounterView | null {
  const settlement = state.settlements.find((s) => s.id === settlementId);
  if (!settlement) return null;
  const role = resolveSiegeRole(state, settlementId);
  if (!role) return null;

  const besiegers = getBesiegingLords(state, settlementId);
  const lordProgress = besiegers.reduce(
    (max, lord) => Math.max(max, lord.order?.siegeProgress ?? 0),
    0,
  );
  const playerProgress =
    state.playerSiege?.settlementId === settlementId ? state.playerSiege.campProgress : 0;
  const campProgress = Math.max(0, Math.min(100, Math.max(lordProgress, playerProgress)));
  const wallSections = getWallSections(settlement);
  const wallHealth = Math.max(
    0,
    Math.min(100, Math.round((wallSections[0] + wallSections[1]) / 2)),
  );
  const engines = settlement.siegeEngines ?? [];
  const hasRam = engines.includes('BATTERING_RAM');
  const hasTower = engines.includes('SIEGE_TOWER');
  const rangedCount = engines.filter(
    (e) => e === 'TREBUCHET' || e === 'MANGONEL' || e === 'BALLISTA',
  ).length;

  const lordTroops = besiegers.reduce(
    (sum, lord) => sum + Math.max(1, lord.armySize || getTotalTroops(lord.roster)),
    0,
  );
  const playerTroops = getTotalTroops(state.roster);
  const attackerTroops =
    role === 'attacker' ? playerTroops + lordTroops : Math.max(1, lordTroops);
  const defenderTroops =
    settlement.garrison + (role === 'defender' ? playerTroops : 0);
  const attackerFaction: FactionId =
    role === 'attacker' ? 'player' : (besiegers[0]?.faction ?? 'empire');

  return {
    settlement,
    role,
    besiegers,
    campProgress,
    wallHealth,
    wallSections,
    campReady: campProgress >= 100 || engines.length > 0 || role === 'attacker',
    breached: wallBreached(settlement),
    hasRam,
    hasTower,
    rangedCount,
    attackerFaction,
    attackerTroops,
    defenderTroops,
  };
}

/**
 * Oyuncu bir yerleşimi kuşatmaya başlar.
 * Oyuncunun aktif bir ordusu (`ArmyRecord`) varsa ordudaki tüm üye lordlar da
 * otomatik olarak kuşatma çemberindeki yay yuvalarına (`slotIndex = 1..N`) yerleşir!
 */
export function startPlayerSiege(state: CampaignState, settlementId: string): CampaignState {
  const settlement = state.settlements.find((s) => s.id === settlementId);
  if (!settlement || settlement.type === 'VILLAGE') return state;

  const campPoint = getSiegeCampSlotPoint(
    settlement,
    state.playerX,
    state.playerZ,
    0,
    1,
  );
  const playerArmy = getPlayerArmy(state);
  const memberIds = playerArmy?.memberLordIds ?? [];

  // Bannerlord kuralı: Bir krallığın şehir veya kalesini kuşatmak o krallıkla doğrudan savaşa girmektir!
  const targetFaction = settlement.faction;
  const isHostileAction = targetFaction !== 'player' && state.playerFaction !== targetFaction;
  const wasAlreadyAtWar = state.lords.some(
    (l) => l.faction === targetFaction && l.isAtWarWithPlayer,
  );

  const nextLords = state.lords.map((lord) => {
    const memberIdx = memberIds.indexOf(lord.id);
    if (memberIdx !== -1) {
      const slotPt = getSiegeCampSlotPoint(
        settlement,
        state.playerX,
        state.playerZ,
        memberIdx + 1,
        memberIds.length + 1,
      );
      return {
        ...lord,
        x: slotPt.x,
        z: slotPt.z,
        targetX: slotPt.x,
        targetZ: slotPt.z,
        currentAction: `${settlement.name} kuşatma çemberinde (${playerArmy?.name ?? 'Ordu'})`,
        order: {
          kind: 'SIEGE' as const,
          targetSettlementId: settlement.id,
          sinceDay: state.day,
          siegeProgress: Math.max(12, state.playerSiege?.campProgress ?? 18),
        },
      };
    }
    if (isHostileAction && lord.faction === targetFaction) {
      return {
        ...lord,
        isAtWarWithPlayer: true,
        relation: Math.max(-100, lord.relation - (wasAlreadyAtWar ? 5 : 30)),
      };
    }
    return lord;
  });

  const nextArmies = (state.armies ?? []).map((a) =>
    a.leaderId === 'player'
      ? { ...a, targetSettlementId: settlement.id, orderKind: 'SIEGE' as const }
      : a,
  );

  let nextWorld = state.world;
  if (nextWorld && isHostileAction) {
    const playerSideFaction: FactionId = state.playerFaction ?? 'player';
    const hasWarRecord = nextWorld.wars.some(
      (w) =>
        (w.a === playerSideFaction && w.b === targetFaction) ||
        (w.a === targetFaction && w.b === playerSideFaction),
    );
    if (!hasWarRecord && playerSideFaction !== targetFaction) {
      nextWorld = {
        ...nextWorld,
        wars: [
          ...nextWorld.wars,
          {
            a: playerSideFaction,
            b: targetFaction,
            sinceDay: state.day,
            score: 0,
            sieges: 1,
          },
        ],
      };
    }
  }

  const warNotice =
    isHostileAction && !wasAlreadyAtWar
      ? ` ${settlement.name} kuşatması nedeniyle krallığın tüm lordlarıyla savaş durumu başladı!`
      : '';

  return {
    ...state,
    playerX: campPoint.x,
    playerZ: campPoint.z,
    lords: nextLords,
    armies: nextArmies,
    world: nextWorld,
    playerSiege: {
      settlementId,
      campProgress: Math.max(12, state.playerSiege?.campProgress ?? 18),
      inside: false,
    },
    chronicle: [
      {
        id: `siege-start-${state.day}-${settlementId}`,
        day: state.day,
        category: 'WAR',
        text: `${settlement.name} önünde kuşatma kampı kuruldu.${warNotice}`,
      },
      ...state.chronicle,
    ].slice(0, 25),
  };
}

/** Oyuncu kuşatmayı kaldırır veya savunmadan ayrılır. */
export function liftPlayerSiege(state: CampaignState, settlementId?: string): CampaignState {
  if (!state.playerSiege) return state;
  const targetId = settlementId ?? state.playerSiege.settlementId;
  if (settlementId && state.playerSiege.settlementId !== settlementId) return state;

  const playerArmy = getPlayerArmy(state);
  const memberSet = new Set(playerArmy?.memberLordIds ?? []);

  const nextLords = state.lords.map((lord) => {
    if (
      memberSet.has(lord.id) &&
      lord.order?.kind === 'SIEGE' &&
      lord.order.targetSettlementId === targetId
    ) {
      return {
        ...lord,
        currentAction: `${playerArmy?.name ?? 'Ordu'} eskort hattında ilerliyor`,
        order: {
          kind: 'PATROL' as const,
          sinceDay: state.day,
        },
      };
    }
    return lord;
  });

  const nextArmies = (state.armies ?? []).map((a) =>
    a.leaderId === 'player' && a.targetSettlementId === targetId
      ? { ...a, targetSettlementId: undefined, orderKind: 'GATHERING' as const }
      : a,
  );

  return {
    ...state,
    lords: nextLords,
    armies: nextArmies,
    settlements: state.settlements.map((settlement) =>
      settlement.id === targetId ? removeDestroyedSiegeEngines(settlement) : settlement,
    ),
    playerSiege: null,
  };
}

/**
 * Kuşatma hatlarını yarıp içeri girme (Break in to help defenders):
 * Birlikler %15-%25 arası deterministik zayiat verir; oyuncu kalenin içine geçer.
 */
export function breakInLossRate(day: number): number {
  const step = ((day * 37) % 11) / 100; // 0.00 .. 0.10
  return 0.15 + step;
}

export function applyBreakInCasualties(state: CampaignState): CampaignState {
  const rate = breakInLossRate(state.day);
  const keepRatio = 1 - rate;
  const scale = (n: number) => Math.max(0, Math.floor(n * keepRatio));
  const nextStacks = (state.troopStacks ?? [])
    .map((stack) => {
      const nextCount = scale(stack.count);
      return {
        ...stack,
        count: nextCount,
        wounded: Math.min(stack.wounded, nextCount),
      };
    })
    .filter((stack) => stack.count > 0);

  if (nextStacks.length > 0) {
    return {
      ...state,
      troopStacks: nextStacks,
      roster: troopStackTotals(nextStacks),
    };
  }

  if ((state.troopStacks?.length ?? 0) > 0) {
    const first = state.troopStacks![0];
    const fallbackStacks = [{ ...first, count: 1, wounded: 0 }];
    return {
      ...state,
      troopStacks: fallbackStacks,
      roster: troopStackTotals(fallbackStacks),
    };
  }

  const next: TroopRoster = {
    infantry: scale(state.roster.infantry),
    archer: scale(state.roster.archer),
    cavalry: scale(state.roster.cavalry),
    horseArcher: scale(state.roster.horseArcher),
  };
  if (getTotalTroops(next) === 0) {
    next.infantry = 1;
  }
  return { ...state, roster: next };
}

export function enterBesiegedSettlement(
  state: CampaignState,
  settlementId: string,
): CampaignState {
  return {
    ...state,
    playerSiege: {
      settlementId,
      campProgress: 100,
      inside: true,
    },
  };
}
