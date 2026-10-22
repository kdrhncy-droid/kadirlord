/**
 * siegeEncounter.ts — Görev 1: Canlı kuşatma karşılaşma durumu ve yardımcıları
 *
 * Kuşatılan bir yerleşime tıklandığında normal şehir menüsü yerine Bannerlord'un
 * üç bağlamlı kuşatma ekranı açılır:
 *   1. `attacker`  — oyuncu yerleşimi bizzat kuşatıyor
 *   2. `outsider`  — yabancı bir lord kuşatıyor, oyuncu dışarıdan yaklaştı
 *   3. `defender`  — oyuncunun kendi mülkü kuşatılıyor veya oyuncu hatları yarıp içeri girdi
 */
import {
  CampaignState,
  FactionId,
  LordAgent,
  Settlement,
  TroopRoster,
  getTotalTroops,
} from './rules';
import {
  SIEGE_CAMP_STANDOFF,
  SIEGE_MELEE_SLOTS,
  SIEGE_RANGED_SLOTS,
  canFitSiegeEngine,
  getSiegeCampPoint,
  getWallSections,
  normalizeSiegeEngineSlots,
  removeDestroyedSiegeEngines,
  setWallSections,
  wallBreached,
} from './siegeMechanics';
import { troopStackTotals } from './bannerlordFoundation';

export {
  SIEGE_CAMP_STANDOFF,
  SIEGE_MELEE_SLOTS,
  SIEGE_RANGED_SLOTS,
  canFitSiegeEngine,
  getSiegeCampPoint,
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

/** Haritada duman/çember gösterilecek tüm kuşatılan yerleşim kimlikleri. */
export function besiegedSettlementIdSet(state: CampaignState): Set<string> {
  const ids = new Set<string>();
  for (const lord of state.lords) {
    if (lord.order?.kind === 'SIEGE' && lord.order.targetSettlementId) {
      ids.add(lord.order.targetSettlementId);
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

/** Oyuncu bir yerleşimi kuşatmaya başlar. */
export function startPlayerSiege(state: CampaignState, settlementId: string): CampaignState {
  const settlement = state.settlements.find((s) => s.id === settlementId);
  if (!settlement || settlement.type === 'VILLAGE') return state;
  const campPoint = getSiegeCampPoint(settlement, state.playerX, state.playerZ);
  return {
    ...state,
    playerX: campPoint.x,
    playerZ: campPoint.z,
    playerSiege: {
      settlementId,
      campProgress: Math.max(12, state.playerSiege?.campProgress ?? 18),
      inside: false,
    },
  };
}

/** Oyuncu kuşatmayı kaldırır veya savunmadan ayrılır. */
export function liftPlayerSiege(state: CampaignState, settlementId?: string): CampaignState {
  if (!state.playerSiege) return state;
  const targetId = settlementId ?? state.playerSiege.settlementId;
  if (settlementId && state.playerSiege.settlementId !== settlementId) return state;
  return {
    ...state,
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
    militia: scale(state.roster.militia),
    archer: scale(state.roster.archer),
    cavalry: scale(state.roster.cavalry),
    guard: scale(state.roster.guard),
  };
  if (getTotalTroops(next) === 0) {
    next.militia = 1;
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
