/**
 * Canlı kuşatma karşılaşma kuralları (Görev 1).
 * Bannerlord: kuşatma altındaki kale/şehir normal şehir menüsünü açmaz.
 */
import {
  type CampaignState,
  type PlayerSiegeState,
  type Settlement,
  type TroopRoster,
  getTotalTroops,
} from './rules';
import { areAtWar } from './worldSim';

export const ACTIVE_SIEGE_SLOTS = 4;
export const BREAK_IN_LOSS_MIN = 0.15;
export const BREAK_IN_LOSS_MAX = 0.25;

export type SiegeEncounterRole = 'attacker' | 'outsider' | 'defender';

export interface ActiveSiege {
  settlementId: string;
  besiegerLordIds: string[];
  leadBesiegerId: string | null;
  progress: number;
  playerIsBesieger: boolean;
}

export interface SiegeEncounterView {
  role: SiegeEncounterRole;
  settlement: Settlement;
  siege: ActiveSiege;
  wallHealth: number;
  wallBreached: boolean;
  garrisonFood: number;
  campReady: boolean;
}

export function isSiegeableSettlement(settlement: Settlement): boolean {
  return settlement.type === 'TOWN' || settlement.type === 'CASTLE';
}

export function listActiveSieges(state: CampaignState): ActiveSiege[] {
  const byTarget = new Map<string, ActiveSiege>();

  for (const lord of state.lords) {
    if (lord.order?.kind !== 'SIEGE' || !lord.order.targetSettlementId) continue;
    const settlementId = lord.order.targetSettlementId;
    const existing = byTarget.get(settlementId);
    const progress = lord.order.siegeProgress ?? 0;
    if (existing) {
      existing.besiegerLordIds.push(lord.id);
      existing.progress = Math.max(existing.progress, progress);
      continue;
    }
    byTarget.set(settlementId, {
      settlementId,
      besiegerLordIds: [lord.id],
      leadBesiegerId: lord.id,
      progress,
      playerIsBesieger: false,
    });
  }

  const playerSiege = state.playerSiege;
  if (playerSiege?.settlementId) {
    const existing = byTarget.get(playerSiege.settlementId);
    if (existing) {
      existing.playerIsBesieger = true;
      existing.progress = Math.max(existing.progress, playerSiege.campProgress);
    } else {
      byTarget.set(playerSiege.settlementId, {
        settlementId: playerSiege.settlementId,
        besiegerLordIds: [],
        leadBesiegerId: null,
        progress: playerSiege.campProgress,
        playerIsBesieger: true,
      });
    }
  }

  return [...byTarget.values()];
}

export function besiegedSettlementIdSet(state: CampaignState): Set<string> {
  return new Set(listActiveSieges(state).map((siege) => siege.settlementId));
}

export function findActiveSiege(
  state: CampaignState,
  settlementId: string,
): ActiveSiege | null {
  return listActiveSieges(state).find((siege) => siege.settlementId === settlementId) ?? null;
}

function playerAtWarWith(state: CampaignState, faction: Settlement['faction']): boolean {
  if (faction === 'player') return false;
  if (!state.world) return false;
  return areAtWar(state.world, 'player', faction);
}

export function resolveSiegeRole(
  state: CampaignState,
  settlementId: string,
): SiegeEncounterRole | null {
  const settlement = state.settlements.find((item) => item.id === settlementId);
  if (!settlement || !isSiegeableSettlement(settlement)) return null;

  const siege = findActiveSiege(state, settlementId);
  const playerSiege = state.playerSiege?.settlementId === settlementId ? state.playerSiege : null;

  if (playerSiege?.inside || (settlement.faction === 'player' && siege)) {
    return 'defender';
  }
  if (playerSiege && !playerSiege.inside) {
    return 'attacker';
  }
  if (siege?.playerIsBesieger) {
    return 'attacker';
  }
  if (siege && settlement.faction !== 'player') {
    return 'outsider';
  }
  if (siege && settlement.faction === 'player') {
    return 'defender';
  }
  if (!siege && playerAtWarWith(state, settlement.faction)) {
    return 'attacker';
  }
  return null;
}

export function buildSiegeEncounterView(
  state: CampaignState,
  settlementId: string,
): SiegeEncounterView | null {
  const settlement = state.settlements.find((item) => item.id === settlementId);
  const role = resolveSiegeRole(state, settlementId);
  if (!settlement || !role) return null;

  const siege =
    findActiveSiege(state, settlementId) ??
    ({
      settlementId,
      besiegerLordIds: [],
      leadBesiegerId: null,
      progress: state.playerSiege?.settlementId === settlementId ? state.playerSiege.campProgress : 0,
      playerIsBesieger: state.playerSiege?.settlementId === settlementId,
    } satisfies ActiveSiege);

  const wallHealth = settlement.wallHealth ?? 100;
  return {
    role,
    settlement,
    siege,
    wallHealth,
    wallBreached: wallHealth <= 0,
    garrisonFood: settlement.foodStock,
    campReady: siege.progress >= 100 || Boolean(state.playerSiege?.settlementId === settlementId && state.playerSiege.campProgress >= 100),
  };
}

export function startPlayerSiege(state: CampaignState, settlementId: string): CampaignState {
  const settlement = state.settlements.find((item) => item.id === settlementId);
  if (!settlement || !isSiegeableSettlement(settlement) || settlement.faction === 'player') {
    return state;
  }
  const existing = state.playerSiege;
  if (existing?.settlementId === settlementId) return state;
  const nextSiege: PlayerSiegeState = {
    settlementId,
    campProgress: Math.max(8, findActiveSiege(state, settlementId)?.progress ?? 8),
    inside: false,
  };
  return { ...state, playerSiege: nextSiege };
}

export function liftPlayerSiege(state: CampaignState, settlementId: string): CampaignState {
  if (state.playerSiege?.settlementId !== settlementId) return state;
  return { ...state, playerSiege: null };
}

export function enterBesiegedSettlement(state: CampaignState, settlementId: string): CampaignState {
  const withSiege =
    state.playerSiege?.settlementId === settlementId
      ? state
      : startPlayerSiege(state, settlementId);
  return {
    ...withSiege,
    playerSiege: withSiege.playerSiege
      ? { ...withSiege.playerSiege, settlementId, inside: true }
      : { settlementId, campProgress: 8, inside: true },
  };
}

export function leaveBesiegedSettlement(state: CampaignState, settlementId: string): CampaignState {
  if (state.playerSiege?.settlementId !== settlementId) return state;
  return {
    ...state,
    playerSiege: { ...state.playerSiege, inside: false },
  };
}

function scaleRoster(roster: TroopRoster, factor: number): TroopRoster {
  const f = Math.max(0, Math.min(1, factor));
  return {
    militia: Math.max(0, Math.floor(roster.militia * f)),
    archer: Math.max(0, Math.floor(roster.archer * f)),
    cavalry: Math.max(0, Math.floor(roster.cavalry * f)),
    guard: Math.max(0, Math.floor(roster.guard * f)),
  };
}

export function breakInLossRate(day: number): number {
  const t = ((day * 17) % 100) / 100;
  return BREAK_IN_LOSS_MIN + t * (BREAK_IN_LOSS_MAX - BREAK_IN_LOSS_MIN);
}

/** Kuşatma hattını yarma: roster + troopStacks birlikte küçülür. */
export function applyBreakInCasualties(state: CampaignState, day = state.day): CampaignState {
  const rate = breakInLossRate(day);
  const keep = 1 - rate;
  const nextRoster = scaleRoster(state.roster, keep);
  const nextStacks = state.troopStacks?.map((stack) => {
    const lost = Math.floor(stack.count * rate);
    const woundedAdd = Math.floor(lost * 0.4);
    return {
      ...stack,
      count: Math.max(0, stack.count - lost),
      wounded: stack.wounded + woundedAdd,
    };
  });
  return {
    ...state,
    roster: nextRoster,
    troopStacks: nextStacks ?? state.troopStacks,
    morale: Math.max(20, state.morale - 6),
  };
}

export function partyTroopCount(state: CampaignState): number {
  return getTotalTroops(state.roster);
}
