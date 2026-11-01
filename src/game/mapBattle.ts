/**
 * mapBattle.ts — Bannerlord Harita Üzeri AI-AI Lord Muharebeleri (MapEvent)
 * ve Oyuncu Müdahalesi (Yardıma Gitme / Müttefike Katılma)
 *
 * Bannerlord mekaniği:
 *  1. Düşman iki ordu haritada 3.8m mesafeye geldiğinde anında bitmez;
 *     harita üzerinde canlı bir MapEvent (Meydan Savaşı) başlar.
 *  2. İki lord birbirine kilitlenir, üzerlerinde döner çapraz kılıçlar belirir.
 *  3. Zaman aktıkça (1x, 2x, 4x) ordular kademeli olarak asker kaybeder (attrition).
 *  4. Biri <5 askere inince muharebe biter; kazanan esir alır, kaybeden esir düşer.
 *  5. Oyuncu haritada bu savaşa tıklayıp yaklaşarak müttefikine destek verebilir!
 */

import {
  type CampaignState,
  type FactionId,
  type LordAgent,
  calculatePartyStrength,
  getTotalTroops,
} from './rules.ts';
import { scaleRoster } from './worldSim.ts';

export interface MapBattleEvent {
  id: string;
  type: 'FIELD' | 'SIEGE_RELIEF';
  x: number;
  z: number;
  settlementId?: string;

  attackerId: string;
  attackerName: string;
  attackerFaction: FactionId;
  attackerInitialArmy: number;
  attackerArmy: number;

  defenderId: string;
  defenderName: string;
  defenderFaction: FactionId;
  defenderInitialArmy: number;
  defenderArmy: number;

  startedDay: number;
  elapsedSec: number;
  lastAttritionSec: number;
  status: 'ACTIVE' | 'ATTACKER_WON' | 'DEFENDER_WON';
}

/**
 * İki krallığın veya birliğin savaşta olup olmadığını kontrol eder.
 */
export function areFactionsAtWar(
  factionA: FactionId,
  factionB: FactionId,
  state: CampaignState,
): boolean {
  if (factionA === factionB) return false;
  // Haydutlar herkesle düşmandır
  if (factionA === 'bandits' || factionB === 'bandits') return true;

  // Oyuncu tarafı kontrolü
  const playerKingdom = state.playerFaction || 'player';
  if (factionA === 'player' || factionA === playerKingdom) {
    const bLord = state.lords.find((l) => l.faction === factionB);
    if (bLord?.isAtWarWithPlayer) return true;
  }
  if (factionB === 'player' || factionB === playerKingdom) {
    const aLord = state.lords.find((l) => l.faction === factionA);
    if (aLord?.isAtWarWithPlayer) return true;
  }

  // Dünya savaşları kaydı
  const wars = state.world?.wars ?? [];
  return wars.some(
    (w) =>
      (w.a === factionA && w.b === factionB) ||
      (w.a === factionB && w.b === factionA),
  );
}

/**
 * İki lordun birbirine düşman olup olmadığını kontrol eder.
 */
export function areLordsHostileToEachOther(
  lordA: LordAgent,
  lordB: LordAgent,
  state: CampaignState,
): boolean {
  if (lordA.id === lordB.id) return false;
  if (lordA.characterState === 'CAPTIVE' || lordA.characterState === 'DEAD') return false;
  if (lordB.characterState === 'CAPTIVE' || lordB.characterState === 'DEAD') return false;

  return areFactionsAtWar(lordA.faction, lordB.faction, state);
}

/**
 * Haritadaki canlı lord pozisyonlarını tarayarak çarpışan düşman AI ordularını tespit eder
 * ve yeni MapBattleEvent başlatır.
 */
export function checkAiLordEngagements(params: {
  state: CampaignState;
  lordPositions: ReadonlyMap<string, { x: number; z: number }>;
  currentBattles: MapBattleEvent[];
  cooldowns: Map<string, number>;
  nowSec: number;
  engagementRadius?: number;
}): { nextBattles: MapBattleEvent[]; newEvents: MapBattleEvent[] } {
  const {
    state,
    lordPositions,
    currentBattles,
    cooldowns,
    nowSec,
    engagementRadius = 3.8,
  } = params;

  const nextBattles = [...currentBattles];
  const newEvents: MapBattleEvent[] = [];

  // Zaten savaşta olan lordların kimlikleri
  const busyLordIds = new Set<string>();
  for (const b of currentBattles) {
    if (b.status === 'ACTIVE') {
      busyLordIds.add(b.attackerId);
      busyLordIds.add(b.defenderId);
    }
  }

  const activeLords = state.lords.filter(
    (l) =>
      l.characterState !== 'CAPTIVE' &&
      l.characterState !== 'DEAD' &&
      !busyLordIds.has(l.id) &&
      (cooldowns.get(l.id) ?? 0) <= nowSec,
  );

  for (let i = 0; i < activeLords.length; i++) {
    const lordA = activeLords[i];
    if (busyLordIds.has(lordA.id)) continue;
    const posA = lordPositions.get(lordA.id) ?? { x: lordA.x, z: lordA.z };

    for (let j = i + 1; j < activeLords.length; j++) {
      const lordB = activeLords[j];
      if (busyLordIds.has(lordB.id)) continue;

      if (!areLordsHostileToEachOther(lordA, lordB, state)) continue;

      const posB = lordPositions.get(lordB.id) ?? { x: lordB.x, z: lordB.z };
      const dist = Math.hypot(posA.x - posB.x, posA.z - posB.z);

      if (dist <= engagementRadius) {
        // İki ordu çarpıştı! Yeni harita muharebesi başlat
        const battleId = `battle-${lordA.id}-${lordB.id}-${state.day}-${Math.round(nowSec)}`;
        const midX = (posA.x + posB.x) / 2;
        const midZ = (posA.z + posB.z) / 2;

        const battle: MapBattleEvent = {
          id: battleId,
          type: 'FIELD',
          x: midX,
          z: midZ,
          attackerId: lordA.id,
          attackerName: lordA.name,
          attackerFaction: lordA.faction,
          attackerInitialArmy: lordA.armySize,
          attackerArmy: lordA.armySize,

          defenderId: lordB.id,
          defenderName: lordB.name,
          defenderFaction: lordB.faction,
          defenderInitialArmy: lordB.armySize,
          defenderArmy: lordB.armySize,

          startedDay: state.day,
          elapsedSec: 0,
          lastAttritionSec: 0,
          status: 'ACTIVE',
        };

        nextBattles.push(battle);
        newEvents.push(battle);
        busyLordIds.add(lordA.id);
        busyLordIds.add(lordB.id);
        break;
      }
    }
  }

  return { nextBattles, newEvents };
}

/**
 * Ordudan tam zayiat sayısını düşer ve yeni roster döndürür.
 */
export function applyCasualtiesToRoster(
  roster: LordAgent['roster'],
  loss: number,
): LordAgent['roster'] {
  if (!roster || loss <= 0) return roster;
  let remainingLoss = loss;
  const nextRoster = {
    infantry: roster.infantry,
    archer: roster.archer,
    cavalry: roster.cavalry,
    horseArcher: roster.horseArcher,
  };

  const categories: Array<'infantry' | 'archer' | 'cavalry' | 'horseArcher'> = [
    'infantry',
    'archer',
    'cavalry',
    'horseArcher',
  ];
  for (const cat of categories) {
    if (remainingLoss <= 0) break;
    const current = nextRoster[cat];
    const take = Math.min(current, remainingLoss);
    nextRoster[cat] = current - take;
    remainingLoss -= take;
  }
  return nextRoster;
}

/**
 * Haritadaki aktif savaşları zaman adımıyla ilerletir (canlı asker erimesi / attrition).
 */
export function tickMapBattles(params: {
  state: CampaignState;
  battles: MapBattleEvent[];
  dt: number;
  timeScale: number;
}): {
  nextState: CampaignState;
  nextBattles: MapBattleEvent[];
  concludedBattles: { battle: MapBattleEvent; winnerId: string; loserId: string }[];
} {
  const { state, battles, dt, timeScale } = params;
  if (battles.length === 0 || timeScale <= 0) {
    return { nextState: state, nextBattles: battles, concludedBattles: [] };
  }

  const effectiveDt = dt * timeScale;
  const nextBattles: MapBattleEvent[] = [];
  const concludedBattles: { battle: MapBattleEvent; winnerId: string; loserId: string }[] = [];
  const updatedLords = [...state.lords];
  const newChronicle = [...state.chronicle];

  for (const b of battles) {
    if (b.status !== 'ACTIVE') continue;

    const nextB = { ...b, elapsedSec: b.elapsedSec + effectiveDt };
    const attackerLordIdx = updatedLords.findIndex((l) => l.id === b.attackerId);
    const defenderLordIdx = updatedLords.findIndex((l) => l.id === b.defenderId);

    if (attackerLordIdx < 0 || defenderLordIdx < 0) {
      continue;
    }

    const attackerLord = updatedLords[attackerLordIdx];
    const defenderLord = updatedLords[defenderLordIdx];

    // Her 2 saniyelik oyun süresinde bir zayiat düşer
    if (nextB.elapsedSec - nextB.lastAttritionSec >= 2.0) {
      nextB.lastAttritionSec = nextB.elapsedSec;

      // Göreceli kuvvet oranına göre zayiat hesaplama
      const strA = Math.max(10, attackerLord.armySize);
      const strB = Math.max(10, defenderLord.armySize);

      const lossA = Math.max(1, Math.min(6, Math.round((strB / strA) * 2 + Math.random() * 2)));
      const lossB = Math.max(1, Math.min(6, Math.round((strA / strB) * 2 + Math.random() * 2)));

      // Lordların ordularını ve roster'larını canlı senkronize et (Kural 1: roster otoritedir)
      if (attackerLord.roster) {
        attackerLord.roster = applyCasualtiesToRoster(attackerLord.roster, lossA);
        attackerLord.armySize = getTotalTroops(attackerLord.roster);
      } else {
        attackerLord.armySize = Math.max(0, attackerLord.armySize - lossA);
      }
      nextB.attackerArmy = attackerLord.armySize;

      if (defenderLord.roster) {
        defenderLord.roster = applyCasualtiesToRoster(defenderLord.roster, lossB);
        defenderLord.armySize = getTotalTroops(defenderLord.roster);
      } else {
        defenderLord.armySize = Math.max(0, defenderLord.armySize - lossB);
      }
      nextB.defenderArmy = defenderLord.armySize;
    }

    // Muharebe sonuçlandı mı?
    if (nextB.attackerArmy <= 4 || nextB.defenderArmy <= 4) {
      if (nextB.attackerArmy > nextB.defenderArmy) {
        // Attacker Kazandı!
        nextB.status = 'ATTACKER_WON';
        defenderLord.characterState = 'CAPTIVE';
        defenderLord.captorId = attackerLord.id;
        concludedBattles.push({
          battle: nextB,
          winnerId: attackerLord.id,
          loserId: defenderLord.id,
        });

        newChronicle.unshift({
          id: `ai-bat-${state.day}-${Date.now()}`,
          day: state.day,
          category: 'BATTLE',
          text: `Meydan Muharebesi: ${attackerLord.name} kuvvetleri, ${defenderLord.name} ordusunu kesin bir yenilgiye uğrattı.`,
        });
      } else {
        // Defender Kazandı!
        nextB.status = 'DEFENDER_WON';
        attackerLord.characterState = 'CAPTIVE';
        attackerLord.captorId = defenderLord.id;
        concludedBattles.push({
          battle: nextB,
          winnerId: defenderLord.id,
          loserId: attackerLord.id,
        });

        newChronicle.unshift({
          id: `ai-bat-${state.day}-${Date.now()}`,
          day: state.day,
          category: 'BATTLE',
          text: `Meydan Muharebesi: ${defenderLord.name} kuvvetleri, ${attackerLord.name} ordusunu püskürterek zafer kazandı.`,
        });
      }
    } else {
      nextBattles.push(nextB);
    }
  }

  const nextState: CampaignState = {
    ...state,
    lords: updatedLords,
    chronicle: newChronicle.slice(0, 30),
  };

  return {
    nextState,
    nextBattles,
    concludedBattles,
  };
}

/**
 * Oyuncu haritadaki bir AI-AI savaşına yaklaştığında müdahale seçeneklerini üretir.
 */
export function getMapBattleInterventionInfo(
  battle: MapBattleEvent,
  state: CampaignState,
) {
  const playerFaction = state.playerFaction || 'player';

  const isAttackerFriendly =
    battle.attackerFaction === playerFaction ||
    !areFactionsAtWar(battle.attackerFaction, playerFaction, state);

  const isDefenderFriendly =
    battle.defenderFaction === playerFaction ||
    !areFactionsAtWar(battle.defenderFaction, playerFaction, state);

  const isAttackerEnemy = areFactionsAtWar(battle.attackerFaction, playerFaction, state);
  const isDefenderEnemy = areFactionsAtWar(battle.defenderFaction, playerFaction, state);

  let recommendation: 'HELP_ATTACKER' | 'HELP_DEFENDER' | 'ATTACK_BOTH' | 'WATCH' = 'WATCH';

  if (isAttackerFriendly && isDefenderEnemy) {
    recommendation = 'HELP_ATTACKER';
  } else if (isDefenderFriendly && isAttackerEnemy) {
    recommendation = 'HELP_DEFENDER';
  } else if (isAttackerEnemy && isDefenderEnemy) {
    recommendation = 'ATTACK_BOTH';
  }

  return {
    battle,
    isAttackerFriendly,
    isDefenderFriendly,
    isAttackerEnemy,
    isDefenderEnemy,
    recommendation,
  };
}
