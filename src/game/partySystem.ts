import type {
  CampaignState,
  CaptivityDilemmaEvent,
  CaptivityDilemmaOption,
  CharacterState,
  ChronicleEvent,
  FactionId,
  InventoryItem,
  LordAgent,
  PrisonerStack,
  Settlement,
  TroopDefinition,
  TroopRoster,
  TroopStack,
  UnitTierId,
} from './rules.ts';
import {
  CULTURE_TROOPS,
  troopName,
} from './troops.ts';
import {
  getTroopDefinition,
  TROOP_DEFINITIONS,
  troopStackTotals,
  troopStackTotal,
  troopStackWoundedTotal,
  prisonerStackTotal,
  getRoleHero,
  getPlayerHero,
  ensureBannerlordFoundation,
  removeInventoryStackQuantity,
} from './bannerlordFoundation.ts';
import { addSkillXpToHero } from './characterDevelopment.ts';
import {
  FACTION_INFO,
  calculateClanTier,
  deductCasualtiesFromRoster,
  getTotalTroops,
  resolveBattleOutcome,
} from './rules.ts';
import { countPartyAnimals } from './logistics.ts';
import { snapToNearestLand } from './navigation.ts';
import { hashString, mulberry32 } from './rng.ts';

export interface PartyLimitBreakdown {
  base: number;
  clanTierBonus: number;
  quartermasterBonus: number;
  total: number;
}

export interface PrisonerLimitBreakdown {
  /** Yaralı olmayan (sağlıklı) mevcut asker sayısı. */
  healthyTroops: number;
  total: number;
}

/**
 * Bannerlord parti asker kapasitesi dökümü (10.5):
 * Taban 20 + Klan Kademesi (Kademe 1: +25, sonra +15/kademe birikimli)
 * + İaşeci İdare becerisi (puan başına +0.25).
 * Liderlik becerisi ve nam doğrudan kapasite vermez — nam kademe üzerinden,
 * Liderlik yalnız perkleriyle (örn. 275 perki) etki eder. Eski uydurma
 * `Liderlik×0.15` ve `Nam/50` kalemleri kaldırıldı.
 */
export function calculatePartyLimitBreakdown(state: CampaignState): PartyLimitBreakdown {
  const base = 20;
  const clanTier = calculateClanTier(state.renown);
  const clanTierBonus = clanTier.maxPartyBonus;

  // İaşeci (Quartermaster) İdare (Steward) becerisi ve perkleri
  const qmHero = getRoleHero(state, 'QUARTERMASTER') ?? getPlayerHero(state);
  const stewardSkill = qmHero?.skills?.steward?.level ?? state.skills?.steward?.level ?? 25;
  const qmPerkBonus = qmHero?.perks?.includes('steward_25_a') ? 5 : 0;
  const quartermasterBonus = Math.floor(stewardSkill * 0.25) + qmPerkBonus;

  const total = base + clanTierBonus + quartermasterBonus;

  return {
    base,
    clanTierBonus,
    quartermasterBonus,
    total: Math.max(20, total),
  };
}

export function getPartyLimit(state: CampaignState): number {
  return calculatePartyLimitBreakdown(state).total;
}

/**
 * Tutsak taşıma kapasitesi — Bannerlord modeli (10.5): sınır, o anki **sağlıklı
 * (yaralı olmayan) asker sayısının yaklaşık yarısıdır**; yaralılar sayılmaz, bu
 * yüzden büyük savaş sonrası sınır düşer. Eski `10 + limit×0.4 + Haydutluk×0.1`
 * formülü uydurmaydı. Kaynak: topluluk doğrulaması (RPS/Reddit) — "prisoner cap
 * is around half of your current troop party size; wounded don't count".
 */
export function calculatePrisonerLimitBreakdown(state: CampaignState): PrisonerLimitBreakdown {
  const stacks = state.troopStacks ?? [];
  const healthyTroops =
    stacks.length > 0
      ? Math.max(0, troopStackTotal(stacks) - troopStackWoundedTotal(stacks))
      : Math.max(
          0,
          (state.roster.infantry ?? 0) +
            (state.roster.archer ?? 0) +
            (state.roster.cavalry ?? 0) +
            (state.roster.horseArcher ?? 0),
        );

  return {
    healthyTroops,
    total: Math.floor(healthyTroops / 2),
  };
}

export function getPrisonerLimit(state: CampaignState): number {
  return calculatePrisonerLimitBreakdown(state).total;
}

export interface TroopUpgradeOption {
  targetDefinition: TroopDefinition;
  readyCount: number;
  goldCost: number;
  horseRequirement: 'NONE' | 'HORSE' | 'WAR_HORSE';
  hasHorse: boolean;
  canUpgrade: boolean;
  blockedReason?: string;
}

/**
 * Bir birlik yığını için terfi dallarını ve terfi edilebilirlik durumunu hesaplar.
 */
export function getTroopUpgradeOptions(
  state: CampaignState,
  stack: TroopStack,
): TroopUpgradeOption[] {
  const definition = getTroopDefinition(stack.troopId);
  if (!definition || definition.upgrades.length === 0) return [];

  const animals = countPartyAnimals(state.inventoryItems);
  const readyByXp = Math.min(
    stack.count,
    Math.floor((stack.xp ?? 0) / Math.max(1, definition.upgradeXp)),
  );

  return definition.upgrades.map((upgradeId) => {
    const targetDef = getTroopDefinition(upgradeId);
    if (!targetDef) {
      return {
        targetDefinition: {
          id: upgradeId,
          culture: definition.culture,
          name: upgradeId,
          tier: definition.tier + 1,
          battleClass: definition.battleClass,
          wage: definition.wage + 2,
          upgradeXp: 999,
          upgradeGold: 20,
          horseRequirement: 'NONE',
          isNobleLine: false,
          isMounted: false,
          upgrades: [],
          maxHp: 80,
          attack: 20,
          defense: 10,
          speed: 5.5,
        },
        readyCount: 0,
        goldCost: 20,
        horseRequirement: 'NONE',
        hasHorse: true,
        canUpgrade: false,
        blockedReason: 'Birlik tanımı bulunamadı.',
      };
    }

    const horseReq = targetDef.horseRequirement;
    const hasHorse =
      horseReq === 'NONE'
        ? true
        : horseReq === 'WAR_HORSE'
          ? animals.warHorses > 0
          : animals.ridingHorses > 0 || animals.warHorses > 0;

    const goldCost = targetDef.upgradeGold;
    const canAffordGold = state.gold >= goldCost;
    const canUpgrade = readyByXp > 0 && canAffordGold && hasHorse;

    let blockedReason: string | undefined;
    if (readyByXp <= 0) blockedReason = 'Yeterli tecrübe (XP) birikmedi.';
    else if (!canAffordGold) blockedReason = `Yetersiz Dinar (${goldCost} Dinar gerekli).`;
    else if (!hasHorse) {
      blockedReason =
        horseReq === 'WAR_HORSE'
          ? 'Envanterde savaş atı bulunmuyor.'
          : 'Envanterde binek atı bulunmuyor.';
    }

    return {
      targetDefinition: targetDef,
      readyCount: readyByXp,
      goldCost,
      horseRequirement: horseReq,
      hasHorse,
      canUpgrade,
      blockedReason,
    };
  });
}

export interface UpgradeTroopResult {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  goldSpent: number;
  horseConsumedId?: string;
}

/**
 * Bir askeri hedef dala terfi ettirir; altın, tecrübe ve gerekirse at tüketir.
 */
export function upgradeTroop(
  state: CampaignState,
  fromTroopId: string,
  toTroopId: string,
  count = 1,
): UpgradeTroopResult {
  if (count <= 0) return { success: false, reason: 'Geçersiz miktar.', nextState: state, goldSpent: 0 };

  const stacks = [...(state.troopStacks ?? [])];
  const sourceIndex = stacks.findIndex((s) => s.troopId === fromTroopId);
  if (sourceIndex === -1) {
    return { success: false, reason: 'Kaynak birlik bulunamadı.', nextState: state, goldSpent: 0 };
  }

  const sourceStack = stacks[sourceIndex];
  const sourceDef = getTroopDefinition(fromTroopId);
  const targetDef = getTroopDefinition(toTroopId);
  if (!sourceDef || !targetDef) {
    return { success: false, reason: 'Birlik tanımı geçersiz.', nextState: state, goldSpent: 0 };
  }

  if (!sourceDef.upgrades.includes(toTroopId)) {
    return { success: false, reason: 'Bu birliğe terfi yolu bulunmuyor.', nextState: state, goldSpent: 0 };
  }

  const availableReady = Math.min(
    sourceStack.count,
    Math.floor((sourceStack.xp ?? 0) / Math.max(1, sourceDef.upgradeXp)),
  );
  if (count > availableReady) {
    return {
      success: false,
      reason: `Yalnızca ${availableReady} asker terfiye hazır.`,
      nextState: state,
      goldSpent: 0,
    };
  }

  const totalGoldCost = targetDef.upgradeGold * count;
  if (state.gold < totalGoldCost) {
    return {
      success: false,
      reason: `Yetersiz altın! ${totalGoldCost} Dinar gerekiyor.`,
      nextState: state,
      goldSpent: 0,
    };
  }

  // At şartı kontrolü ve tüketimi
  let nextInventory = state.inventoryItems ?? [];
  let consumedHorseDefId: string | undefined;

  if (targetDef.horseRequirement !== 'NONE') {
    const isWarHorse = targetDef.horseRequirement === 'WAR_HORSE';
    const horseStack = nextInventory.find((item) => {
      if (item.category !== 'HORSE' || item.locked) return false;
      const lowerName = item.name.toLocaleLowerCase('tr-TR');
      if (lowerName.includes('katır') || lowerName.includes('yük')) return false;
      if (isWarHorse) {
        return lowerName.includes('savaş') || lowerName.includes('küheylan') || (item.tier ?? 0) >= 5;
      }
      return true;
    });

    if (!horseStack) {
      return {
        success: false,
        reason: isWarHorse
          ? 'Terfi için kilitli olmayan savaş atı gerekiyor.'
          : 'Terfi için kilitli olmayan binek atı gerekiyor.',
        nextState: state,
        goldSpent: 0,
      };
    }

    const horseAvailable = Math.max(1, Math.floor(horseStack.quantity ?? 1));
    if (horseAvailable < count) {
      return {
        success: false,
        reason: `Yeterli at yok (${count} gerekli, ${horseAvailable} mevcut).`,
        nextState: state,
        goldSpent: 0,
      };
    }

    const removal = removeInventoryStackQuantity(nextInventory, horseStack.id, count, { allowLocked: false });
    if (!removal.success) {
      return { success: false, reason: removal.reason, nextState: state, goldSpent: 0 };
    }
    nextInventory = removal.items;
    consumedHorseDefId = horseStack.definitionId ?? horseStack.id;
  }

  // XP ve adet düşüşü
  const xpSpent = count * sourceDef.upgradeXp;
  const remainingCount = sourceStack.count - count;
  const remainingXp = Math.max(0, (sourceStack.xp ?? 0) - xpSpent);
  const remainingWounded = Math.min(remainingCount, sourceStack.wounded ?? 0);

  if (remainingCount <= 0) {
    stacks.splice(sourceIndex, 1);
  } else {
    stacks[sourceIndex] = {
      ...sourceStack,
      count: remainingCount,
      xp: remainingXp,
      wounded: remainingWounded,
    };
  }

  // Hedef birliğe ekleme
  const targetIndex = stacks.findIndex((s) => s.troopId === toTroopId);
  if (targetIndex >= 0) {
    stacks[targetIndex] = {
      ...stacks[targetIndex],
      count: stacks[targetIndex].count + count,
    };
  } else {
    stacks.push({
      troopId: toTroopId,
      count,
      wounded: 0,
      xp: 0,
    });
  }

  const updatedRoster = troopStackTotals(stacks);

  const nextState = ensureBannerlordFoundation({
    ...state,
    gold: state.gold - totalGoldCost,
    inventoryItems: nextInventory,
    troopStacks: stacks,
    roster: updatedRoster,
  });

  return {
    success: true,
    nextState,
    goldSpent: totalGoldCost,
    horseConsumedId: consumedHorseDefId,
  };
}

/**
 * Tutsak birliğini devşirir (asker saflarına katar).
 * Uyum (Conformity) barı dolmuş (`ready >= count`) esirleri orduya katar.
 */
export function recruitPrisonerStack(
  state: CampaignState,
  troopId: string,
  count = 1,
): { success: boolean; reason?: string; nextState: CampaignState } {
  if (count <= 0) return { success: false, reason: 'Geçersiz miktar.', nextState: state };

  const currentPartySize = troopStackTotal(state.troopStacks);
  const partyLimit = getPartyLimit(state);
  if (currentPartySize + count > partyLimit) {
    return {
      success: false,
      reason: `Parti kapasitesi dolu! (${currentPartySize}/${partyLimit})`,
      nextState: state,
    };
  }

  const pStacks = [...(state.prisonerStacks ?? [])];
  const pIndex = pStacks.findIndex((p) => p.troopId === troopId);
  if (pIndex === -1) {
    return { success: false, reason: 'Tutsak yığını bulunamadı.', nextState: state };
  }

  const pStack = pStacks[pIndex];
  const ready = Math.min(pStack.count, pStack.ready ?? pStack.count);
  if (ready < count) {
    return {
      success: false,
      reason:
        ready <= 0
          ? 'Henüz ikna olan (uyum sağlayan) tutsak yok; zaman geçtikçe Liderlik becerinizle ikna olurlar.'
          : `Yalnızca ${ready} tutsak devşirilmeye hazır.`,
      nextState: state,
    };
  }

  const remaining = pStack.count - count;
  if (remaining <= 0) {
    pStacks.splice(pIndex, 1);
  } else {
    pStacks[pIndex] = {
      ...pStack,
      count: remaining,
      ready: Math.max(0, ready - count),
    };
  }

  const tStacks = [...(state.troopStacks ?? [])];
  const tIndex = tStacks.findIndex((t) => t.troopId === troopId);
  if (tIndex >= 0) {
    tStacks[tIndex] = {
      ...tStacks[tIndex],
      count: tStacks[tIndex].count + count,
    };
  } else {
    tStacks.push({
      troopId,
      count,
      wounded: 0,
      xp: 0,
    });
  }

  const updatedRoster = troopStackTotals(tStacks);
  const updatedPrisoners = prisonerStackTotal(pStacks);

  const nextState = ensureBannerlordFoundation({
    ...state,
    troopStacks: tStacks,
    prisonerStacks: pStacks,
    roster: updatedRoster,
    prisoners: updatedPrisoners,
    morale: Math.max(10, state.morale - 2), // Tutsak devşirme hafif moral düşürür
  });

  return { success: true, nextState };
}

/**
 * Tutsakları fidye karşılığı salar veya hanlarda satar.
 */
export function ransomPrisonerStack(
  state: CampaignState,
  troopId: string,
  count = 1,
): { success: boolean; reason?: string; nextState: CampaignState; goldEarned: number } {
  if (count <= 0) return { success: false, reason: 'Geçersiz miktar.', nextState: state, goldEarned: 0 };

  const pStacks = [...(state.prisonerStacks ?? [])];
  const pIndex = pStacks.findIndex((p) => p.troopId === troopId);
  if (pIndex === -1) {
    return { success: false, reason: 'Tutsak bulunamadı.', nextState: state, goldEarned: 0 };
  }

  const pStack = pStacks[pIndex];
  if (pStack.count < count) {
    return { success: false, reason: `Yalnızca ${pStack.count} tutsak mevcut.`, nextState: state, goldEarned: 0 };
  }

  const def = getTroopDefinition(troopId);
  const tier = def?.tier ?? 2;
  const ransomPerHead = tier * 15 + 10;
  const totalGold = ransomPerHead * count;

  const remaining = pStack.count - count;
  if (remaining <= 0) {
    pStacks.splice(pIndex, 1);
  } else {
    pStacks[pIndex] = {
      ...pStack,
      count: remaining,
      ready: Math.max(0, (pStack.ready ?? 0) - count),
    };
  }

  const updatedPrisoners = prisonerStackTotal(pStacks);

  const nextState = ensureBannerlordFoundation({
    ...state,
    gold: state.gold + totalGold,
    prisonerStacks: pStacks,
    prisoners: updatedPrisoners,
  });

  return { success: true, nextState, goldEarned: totalGold };
}

/**
 * Birliği ordudan terhis eder (Dismiss).
 */
export function dismissTroopStack(
  state: CampaignState,
  troopId: string,
  count = 1,
): { success: boolean; reason?: string; nextState: CampaignState } {
  if (count <= 0) return { success: false, reason: 'Geçersiz miktar.', nextState: state };

  const stacks = [...(state.troopStacks ?? [])];
  const idx = stacks.findIndex((s) => s.troopId === troopId);
  if (idx === -1) return { success: false, reason: 'Birlik bulunamadı.', nextState: state };

  const stack = stacks[idx];
  if (stack.count < count) {
    return { success: false, reason: `Yalnızca ${stack.count} asker var.`, nextState: state };
  }

  const remaining = stack.count - count;
  if (remaining <= 0) {
    stacks.splice(idx, 1);
  } else {
    stacks[idx] = {
      ...stack,
      count: remaining,
      wounded: Math.min(remaining, stack.wounded ?? 0),
    };
  }

  const updatedRoster = troopStackTotals(stacks);

  const nextState = ensureBannerlordFoundation({
    ...state,
    troopStacks: stacks,
    roster: updatedRoster,
  });

  return { success: true, nextState };
}

/**
 * Garnizon ile parti arasında birlik transferi.
 */
export function transferTroopToGarrison(
  partyStacks: TroopStack[],
  garrisonStacks: TroopStack[],
  troopId: string,
  count = 1,
): { partyStacks: TroopStack[]; garrisonStacks: TroopStack[]; moved: number } {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount <= 0) return { partyStacks, garrisonStacks, moved: 0 };

  const pStacks = [...partyStacks];
  const pIdx = pStacks.findIndex((s) => s.troopId === troopId);
  if (pIdx === -1) return { partyStacks, garrisonStacks, moved: 0 };

  const pStack = pStacks[pIdx];
  const toMove = Math.min(pStack.count, safeCount);
  const pRem = pStack.count - toMove;

  if (pRem <= 0) {
    pStacks.splice(pIdx, 1);
  } else {
    pStacks[pIdx] = {
      ...pStack,
      count: pRem,
      wounded: Math.min(pRem, pStack.wounded ?? 0),
    };
  }

  const gStacks = [...garrisonStacks];
  const gIdx = gStacks.findIndex((s) => s.troopId === troopId);
  if (gIdx >= 0) {
    gStacks[gIdx] = {
      ...gStacks[gIdx],
      count: gStacks[gIdx].count + toMove,
    };
  } else {
    gStacks.push({
      troopId,
      count: toMove,
      wounded: 0,
      xp: 0,
    });
  }

  return { partyStacks: pStacks, garrisonStacks: gStacks, moved: toMove };
}

export function transferTroopFromGarrison(
  partyStacks: TroopStack[],
  garrisonStacks: TroopStack[],
  troopId: string,
  count = 1,
  partyLimit = 999,
): { partyStacks: TroopStack[]; garrisonStacks: TroopStack[]; moved: number } {
  const currentTotal = troopStackTotal(partyStacks);
  const room = Math.max(0, partyLimit - currentTotal);
  const safeCount = Math.min(room, Math.max(0, Math.floor(count)));
  if (safeCount <= 0) return { partyStacks, garrisonStacks, moved: 0 };

  const gStacks = [...garrisonStacks];
  const gIdx = gStacks.findIndex((s) => s.troopId === troopId);
  if (gIdx === -1) return { partyStacks, garrisonStacks, moved: 0 };

  const gStack = gStacks[gIdx];
  const toMove = Math.min(gStack.count, safeCount);
  const gRem = gStack.count - toMove;

  if (gRem <= 0) {
    gStacks.splice(gIdx, 1);
  } else {
    gStacks[gIdx] = {
      ...gStack,
      count: gRem,
      wounded: Math.min(gRem, gStack.wounded ?? 0),
    };
  }

  const pStacks = [...partyStacks];
  const pIdx = pStacks.findIndex((s) => s.troopId === troopId);
  if (pIdx >= 0) {
    pStacks[pIdx] = {
      ...pStacks[pIdx],
      count: pStacks[pIdx].count + toMove,
    };
  } else {
    pStacks.push({
      troopId,
      count: toMove,
      wounded: 0,
      xp: 0,
    });
  }

  return { partyStacks: pStacks, garrisonStacks: gStacks, moved: toMove };
}

export interface DailyHealthAndPrisonersResult {
  nextState: CampaignState;
  healedTroops: number;
  prisonersBecameReady: number;
}

/**
 * Günlük döngüde yaralı askerlerin iyileşmesini ve tutsakların Uyum (Conformity)
 * puanı kazanarak devşirilmeye hazır (`ready`) olmasını işletir.
 * Liderlik (Leadership) ve Haydutluk (Roguery) becerileri uyum hızını artırır.
 */
export function advanceDailyPartyHealthAndPrisoners(
  state: CampaignState,
  options?: { isInSettlement?: boolean },
): DailyHealthAndPrisonersResult {
  const surgeonHero = getRoleHero(state, 'SURGEON') ?? getPlayerHero(state);
  const medicineLevel = surgeonHero?.skills?.medicine?.level ?? state.skills?.medicine?.level ?? 20;
  const surgeonBonus = Math.floor(medicineLevel / 25) + (surgeonHero?.perks?.includes('medicine_25_a') ? 1 : 0);
  const settlementBonus = options?.isInSettlement ? 2 : 0;
  const totalHealingCapacity = Math.max(1, 1 + surgeonBonus + settlementBonus);

  let remainingHealPoints = totalHealingCapacity;
  let healedTroops = 0;

  const currentTroopStacks = (state.troopStacks ?? []).map((stack) => {
    if (remainingHealPoints <= 0 || !stack.wounded || stack.wounded <= 0) {
      return stack;
    }
    const healCount = Math.min(stack.wounded, remainingHealPoints);
    remainingHealPoints -= healCount;
    healedTroops += healCount;
    return {
      ...stack,
      wounded: stack.wounded - healCount,
    };
  });

  // Bannerlord Uyum (Conformity) Mekaniği:
  // Sıradan esirler oyuncunun Liderlik (Leadership) ve Haydutluk (Roguery) becerisine göre
  // her gün uyum puanı kazanır; bar dolduğunda `ready` (IsRecruitable) artar.
  const playerHero = getPlayerHero(state);
  const leadershipLevel = playerHero?.skills?.leadership?.level ?? state.skills?.leadership?.level ?? 25;
  const rogueryLevel = playerHero?.skills?.roguery?.level ?? state.skills?.roguery?.level ?? 15;
  const dailyConformityPool = Math.max(1.1, 1.0 + leadershipLevel * 0.025 + rogueryLevel * 0.018);

  let remainingConformity = dailyConformityPool;
  let prisonersBecameReady = 0;

  const currentPrisonerStacks = (state.prisonerStacks ?? []).map((pStack) => {
    const unready = Math.max(0, pStack.count - (pStack.ready ?? 0));
    if (remainingConformity <= 0 || unready <= 0) {
      return pStack;
    }
    const def = getTroopDefinition(pStack.troopId);
    const tierDifficulty = Math.max(0.5, (def?.tier ?? 1) * 0.45);
    const currentProgress = pStack.readinessProgress ?? 0;
    const totalProgress = currentProgress + remainingConformity / tierDifficulty;
    const newlyReady = Math.min(unready, Math.floor(totalProgress));
    const leftoverProgress = newlyReady >= unready ? 0 : Math.min(0.99, totalProgress - newlyReady);

    remainingConformity = Math.max(0, remainingConformity - newlyReady * tierDifficulty);
    prisonersBecameReady += newlyReady;

    return {
      ...pStack,
      ready: Math.min(pStack.count, (pStack.ready ?? 0) + newlyReady),
      readinessProgress: Number(leftoverProgress.toFixed(2)),
    };
  });

  let updatedHeroes = state.heroes;
  if (healedTroops > 0 && surgeonHero && state.heroes) {
    const xpEarned = healedTroops * 15;
    const res = addSkillXpToHero(surgeonHero, 'medicine', xpEarned);
    updatedHeroes = state.heroes.map((h) => (h.id === surgeonHero.id ? res.hero : h));
  }

  const nextState: CampaignState = {
    ...state,
    heroes: updatedHeroes,
    troopStacks: currentTroopStacks,
    prisonerStacks: currentPrisonerStacks,
  };

  return {
    nextState,
    healedTroops,
    prisonersBecameReady,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   BANNERLORD ESİR LORD (CAPTIVE HERO) & OYUNCU ESARET (PLAYER CAPTIVITY) SİSTEMİ
   ═══════════════════════════════════════════════════════════════════════════ */

/** Bir lord haritada aktif (serbest) mi? Esir veya ölü lordlar haritada dolaşmaz. */
export function isLordActiveOnMap(lord: Pick<LordAgent, 'characterState'>): boolean {
  return lord.characterState !== 'CAPTIVE' && lord.characterState !== 'DEAD';
}

/** Oyuncunun partisinde zincirli olarak tutulan esir lordları döndürür. */
export function getPlayerCaptiveLords(state: Pick<CampaignState, 'lords'>): LordAgent[] {
  return state.lords.filter(
    (l) => l.characterState === 'CAPTIVE' && l.captorId === 'player' && !l.dungeonSettlementId,
  );
}

/** Belirli bir yerleşimin (kale/şehir) zindanında tutulan esir lordları döndürür. */
export function getDungeonCaptiveLords(
  state: Pick<CampaignState, 'lords'>,
  settlementId: string,
): LordAgent[] {
  return state.lords.filter(
    (l) => l.characterState === 'CAPTIVE' && l.dungeonSettlementId === settlementId,
  );
}

/** Bir esir lordun fidye değerini unvanına, klan kademesine ve krallığına göre hesaplar. */
export function calculateLordRansomValue(lord: LordAgent): number {
  if (lord.faction === 'bandits') return 250;
  const lowerTitle = (lord.title ?? '').toLocaleLowerCase('tr-TR');
  const isRuler =
    lowerTitle.includes('kral') ||
    lowerTitle.includes('imparatoriçe') ||
    lowerTitle.includes('sultan') ||
    lowerTitle.includes('han') ||
    lowerTitle.includes('büyük prens');
  if (isRuler) return 1500;
  const tier = lord.clanTier ?? 3;
  return 450 + tier * 120;
}

/** Bir lordun kendi krallığına ait güvenli bir yeniden doğuş/toplanma yerleşimi bulur. */
function findLordHomeSpawnCoords(
  state: CampaignState,
  lord: LordAgent,
): { x: number; z: number } {
  const friendlySettlement =
    state.settlements.find((s) => s.faction === lord.faction && s.type !== 'VILLAGE') ??
    state.settlements.find((s) => s.faction === lord.faction);
  if (friendlySettlement) {
    return snapToNearestLand(friendlySettlement.x + 4, friendlySettlement.z + 4);
  }
  return snapToNearestLand(lord.x + 22, lord.z - 22);
}

/**
 * Savaş sonunda mağlup edilen düşman lordunu esir alır (`CharacterState = 'CAPTIVE'`).
 */
export function captureDefeatedLord(
  state: CampaignState,
  lordId: string,
): CampaignState {
  const target = state.lords.find((l) => l.id === lordId);
  if (!target || target.characterState === 'DEAD') return state;

  const nextLords = state.lords.map((l) => {
    if (l.id !== lordId) return l;
    return {
      ...l,
      characterState: 'CAPTIVE' as CharacterState,
      captorId: 'player',
      dungeonSettlementId: null,
      daysCaptive: 0,
      order: undefined,
      armyId: null,
      currentAction: `${state.playerName} sancağında tutsak`,
    };
  });

  const evt: ChronicleEvent = {
    id: `cap-lord-${state.day}-${lordId}-${Date.now()}`,
    day: state.day,
    category: 'WAR',
    text: `${target.title} ${target.name} muharebe meydanında esir alınarak sancağınızın zincirlerine vuruldu.`,
  };

  return {
    ...state,
    lords: nextLords,
    chronicle: [evt, ...state.chronicle].slice(0, 25),
  };
}

/**
 * Mağlup veya esir bir lordu karşılıksız serbest bırakır (Release):
 *  - İlişki +10 artar (`relation += 10`)
 *  - Onur +10 artar (`honor += 10`)
 *  - Lord serbest (`'FREE'`) kalır ve kendi mülküne çekilir.
 */
export function releaseCaptiveLord(
  state: CampaignState,
  lordId: string,
  isPostBattle = false,
): {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  relationGain: number;
  honorGain: number;
} {
  const target = state.lords.find((l) => l.id === lordId);
  if (!target) {
    return { success: false, reason: 'Lord bulunamadı.', nextState: state, relationGain: 0, honorGain: 0 };
  }
  if (!isPostBattle && target.characterState !== 'CAPTIVE') {
    return { success: false, reason: 'Bu soylu şu an tutsağınız değil.', nextState: state, relationGain: 0, honorGain: 0 };
  }

  const relationGain = 10;
  const honorGain = 10;
  const spawn = findLordHomeSpawnCoords(state, target);

  const nextLords = state.lords.map((l) => {
    if (l.id !== lordId) return l;
    const minRoster: TroopRoster =
      getTotalTroops(l.roster) >= 12
        ? l.roster
        : { infantry: 10, archer: 6, cavalry: 4, horseArcher: 0 };
    return {
      ...l,
      characterState: 'FREE' as CharacterState,
      captorId: null,
      dungeonSettlementId: null,
      daysCaptive: 0,
      relation: Math.min(100, l.relation + relationGain),
      roster: minRoster,
      armySize: getTotalTroops(minRoster),
      x: spawn.x,
      z: spawn.z,
      currentAction: 'Ordusunu yeniden topluyor',
    };
  });

  const evt: ChronicleEvent = {
    id: `rel-lord-${state.day}-${lordId}-${Date.now()}`,
    day: state.day,
    category: 'DIPLOMACY',
    text: `${state.playerName}, mağlup edilen ${target.title} ${target.name}'ı onuruyla serbest bıraktı (+${relationGain} İlişki, +${honorGain} Onur).`,
  };

  return {
    success: true,
    relationGain,
    honorGain,
    nextState: {
      ...state,
      honor: (state.honor ?? 0) + honorGain,
      lords: nextLords,
      chronicle: [evt, ...state.chronicle].slice(0, 25),
    },
  };
}

/**
 * Esir tutulan bir lordu fidye karşılığı satar (`Ransom`):
 *  - Karakter esير listesinden çıkar (`'FREE'`),
 *  - Oyuncunun hazinesine `goldEarned` eklenir.
 */
export function ransomCaptiveLord(
  state: CampaignState,
  lordId: string,
): {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  goldEarned: number;
} {
  const target = state.lords.find((l) => l.id === lordId);
  if (!target || target.characterState !== 'CAPTIVE' || target.captorId !== 'player') {
    return {
      success: false,
      reason: 'Fidye ile satılabilecek esir soylu bulunamadı.',
      nextState: state,
      goldEarned: 0,
    };
  }

  const goldEarned = calculateLordRansomValue(target);
  const spawn = findLordHomeSpawnCoords(state, target);

  const nextLords = state.lords.map((l) => {
    if (l.id !== lordId) return l;
    const minRoster: TroopRoster = { infantry: 12, archer: 8, cavalry: 5, horseArcher: 0 };
    return {
      ...l,
      characterState: 'FREE' as CharacterState,
      captorId: null,
      dungeonSettlementId: null,
      daysCaptive: 0,
      roster: minRoster,
      armySize: getTotalTroops(minRoster),
      x: spawn.x,
      z: spawn.z,
      currentAction: 'Fidye ödeyerek kurtuldu, ordusunu topluyor',
    };
  });

  const evt: ChronicleEvent = {
    id: `ransom-lord-${state.day}-${lordId}-${Date.now()}`,
    day: state.day,
    category: 'ECONOMY',
    text: `${target.title} ${target.name}, hanedanının ödediği ${goldEarned} Dinar fidye karşılığında serbest bırakıldı.`,
  };

  return {
    success: true,
    goldEarned,
    nextState: {
      ...state,
      gold: state.gold + goldEarned,
      lords: nextLords,
      chronicle: [evt, ...state.chronicle].slice(0, 25),
    },
  };
}

/**
 * Esir bir lordu (veya asker esirleri) dost/kendi yerleşiminin zindanına bağışlar (`Donation to Dungeon`):
 *  - Esir ordudan silinir ve kalenin/şehrin zindan listesine (`dungeonSettlementId`) aktarılır.
 *  - Nüfuz (`influence`) ve kale güvenliği (`security`) artar.
 */
export function donateCaptiveLordToDungeon(
  state: CampaignState,
  settlementId: string,
  lordId: string,
): {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  influenceGained: number;
  securityGained: number;
} {
  const settlement = state.settlements.find((s) => s.id === settlementId);
  if (!settlement || settlement.type === 'VILLAGE') {
    return {
      success: false,
      reason: 'Yalnızca şehir ve kale zindanlarına esir kapatılabilir.',
      nextState: state,
      influenceGained: 0,
      securityGained: 0,
    };
  }
  const target = state.lords.find((l) => l.id === lordId);
  if (!target || target.characterState !== 'CAPTIVE' || target.captorId !== 'player') {
    return {
      success: false,
      reason: 'Bu soylu şu an partinizde esir değil.',
      nextState: state,
      influenceGained: 0,
      securityGained: 0,
    };
  }

  const influenceGained = 20;
  const securityGained = 5;

  const nextLords = state.lords.map((l) => {
    if (l.id !== lordId) {
      if (l.faction === settlement.faction && settlement.faction !== 'player') {
        return { ...l, relation: Math.min(100, l.relation + 6) };
      }
      return l;
    }
    return {
      ...l,
      characterState: 'CAPTIVE' as CharacterState,
      captorId: settlement.id,
      dungeonSettlementId: settlement.id,
      daysCaptive: l.daysCaptive ?? 0,
      x: settlement.x,
      z: settlement.z,
      currentAction: `${settlement.name} zindanında tutsak`,
    };
  });

  const nextSettlements = state.settlements.map((s) =>
    s.id === settlementId
      ? { ...s, security: Math.min(100, (s.security ?? 50) + securityGained) }
      : s,
  );

  const evt: ChronicleEvent = {
    id: `dungeon-lord-${state.day}-${lordId}-${Date.now()}`,
    day: state.day,
    category: 'DIPLOMACY',
    text: `Esir ${target.title} ${target.name}, ${settlement.name} zindanına teslim edildi (+${influenceGained} Nüfuz, +${securityGained} Güvenlik).`,
  };

  return {
    success: true,
    influenceGained,
    securityGained,
    nextState: {
      ...state,
      influence: (state.influence ?? 0) + influenceGained,
      lords: nextLords,
      settlements: nextSettlements,
      chronicle: [evt, ...state.chronicle].slice(0, 25),
    },
  };
}

/**
 * Sıradan esir askerleri (`prisonerStacks`) kalenin/şehrin zindanına bağışlar:
 *  - Nüfuz (`influence`) ve yerleşim güvenliği (`security`) kazandırır.
 */
export function donatePrisonersToDungeon(
  state: CampaignState,
  settlementId: string,
): {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  donatedCount: number;
  influenceGained: number;
  securityGained: number;
} {
  const settlement = state.settlements.find((s) => s.id === settlementId);
  if (!settlement || settlement.type === 'VILLAGE') {
    return {
      success: false,
      reason: 'Yalnızca şehir ve kale zindanlarına esir bağışlanabilir.',
      nextState: state,
      donatedCount: 0,
      influenceGained: 0,
      securityGained: 0,
    };
  }
  const donatedCount = state.prisoners;
  if (donatedCount <= 0) {
    return {
      success: false,
      reason: 'Zindana bağışlanacak asker esiriniz bulunmuyor.',
      nextState: state,
      donatedCount: 0,
      influenceGained: 0,
      securityGained: 0,
    };
  }

  const influenceGained = Math.max(2, donatedCount * 2);
  const securityGained = Math.min(15, Math.max(1, Math.ceil(donatedCount * 0.5)));

  const nextSettlements = state.settlements.map((s) =>
    s.id === settlementId
      ? { ...s, security: Math.min(100, (s.security ?? 50) + securityGained) }
      : s,
  );

  const evt: ChronicleEvent = {
    id: `dungeon-troops-${state.day}-${settlementId}-${Date.now()}`,
    day: state.day,
    category: 'DIPLOMACY',
    text: `${donatedCount} savaş esiri ${settlement.name} zindanına bağışlandı (+${influenceGained} Nüfuz, +${securityGained} Güvenlik).`,
  };

  return {
    success: true,
    donatedCount,
    influenceGained,
    securityGained,
    nextState: ensureBannerlordFoundation({
      ...state,
      prisoners: 0,
      prisonerStacks: [],
      influence: (state.influence ?? 0) + influenceGained,
      settlements: nextSettlements,
      chronicle: [evt, ...state.chronicle].slice(0, 25),
    }),
  };
}

/**
 * Esir bir lordu idam eder (`Execute` — Görev 5.2):
 *  - Karakter oyundan tamamen silinir/öldürülür (`characterState = 'DEAD'`, `armySize = 0`).
 *  - Diğer yapay zeka lordlarıyla olan ilişki (`relation -= 50`) ağır darbe alır.
 *  - Onur puanı düşer (`honor -= 30`).
 */
export function executeCaptiveLord(
  state: CampaignState,
  lordId: string,
): {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  relationPenalty: number;
  honorPenalty: number;
} {
  const target = state.lords.find((l) => l.id === lordId);
  if (!target || target.characterState !== 'CAPTIVE') {
    return {
      success: false,
      reason: 'Yalnızca esir alınmış komutanlar idam edilebilir.',
      nextState: state,
      relationPenalty: 0,
      honorPenalty: 0,
    };
  }

  const relationPenalty = -50;
  const honorPenalty = -30;

  const nextLords = state.lords.map((l) => {
    if (l.id === lordId) {
      return {
        ...l,
        characterState: 'DEAD' as CharacterState,
        captorId: null,
        dungeonSettlementId: null,
        daysCaptive: 0,
        order: undefined,
        armyId: null,
        roster: { infantry: 0, archer: 0, cavalry: 0, horseArcher: 0 },
        armySize: 0,
        wounded: 0,
        currentAction: 'İdam edildi',
      };
    }
    if (l.characterState === 'DEAD') return l;
    // Aynı krallıktaki tüm lordlarla -50 ilişki, diğer krallık soylularıyla -15 ilişki
    const delta = l.faction === target.faction ? relationPenalty : l.faction !== 'bandits' ? -15 : 0;
    return {
      ...l,
      relation: Math.max(-100, l.relation + delta),
      isAtWarWithPlayer: l.faction === target.faction ? true : l.isAtWarWithPlayer,
    };
  });

  const factionName = FACTION_INFO[target.faction]?.name ?? target.faction;
  const evt: ChronicleEvent = {
    id: `exec-lord-${state.day}-${lordId}-${Date.now()}`,
    day: state.day,
    category: 'WAR',
    text: `${state.playerName}, esir tutulan ${target.title} ${target.name}'ı cellat kütüğünde idam ettirdi! ${factionName} soylularıyla ilişkiler ağır darbe aldı (${relationPenalty} İlişki, ${honorPenalty} Onur).`,
  };

  return {
    success: true,
    relationPenalty,
    honorPenalty,
    nextState: {
      ...state,
      honor: (state.honor ?? 0) + honorPenalty,
      lords: nextLords,
      chronicle: [evt, ...state.chronicle].slice(0, 25),
    },
  };
}

/**
 * Oyuncunun günlük esaretten kaçma olasılığını (0..100) hesaplar:
 * `EscapeChance = BaseChance + (ScoutingSkill * 0.1) - PrisonSecurityModifier + (daysCaptive * 10)`
 */
export function computePlayerDailyEscapeChance(
  state: CampaignState,
  daysCaptive = 0,
): number {
  const playerHero = getPlayerHero(state);
  const scoutingSkill =
    playerHero?.skills?.scouting?.level ?? state.skills?.scouting?.level ?? 25;
  const roguerySkill =
    playerHero?.skills?.roguery?.level ?? state.skills?.roguery?.level ?? 15;
  const baseChance = 20;
  const skillBonus = scoutingSkill * 0.15 + roguerySkill * 0.1;
  const prisonSecurityModifier = 8;
  const raw = baseChance + skillBonus - prisonSecurityModifier + daysCaptive * 12;
  return Math.max(10, Math.min(90, Math.round(raw)));
}

function buildCaptivityDilemmaEvent(
  day: number,
  captorName: string,
  ransomCost: number,
): CaptivityDilemmaEvent {
  const templates: Array<Omit<CaptivityDilemmaEvent, 'id' | 'day'>> = [
    {
      title: 'Gece Nöbetçisi Uyukluyor',
      text: `${captorName} kafilesi gece konaklamasında kamp ateşlerinin başında gevşedi. Bileklerinizdeki demir halkalar gevşemiş durumda; nöbetçi ise mızrağına yaslanmış uyukluyor.`,
      options: [
        {
          id: 'ESCAPE_ATTEMPT',
          label: 'Zincirleri Çözüp Karanlığa Sıvış (%55 Kaçış / Yakalanırsan -12 Can)',
          description: 'İzci ve Haydutluk becerilerinizi kullanarak sessizce kamptan kaçmayı denersiniz.',
        },
        {
          id: 'ENDURE',
          label: 'Gücünü Topla ve Sabret (+15 Can, +%12 Kaçış Şansı)',
          description: 'Yaralarınızı sarar ve ertesi günkü yürüyüşte kelepçe pimini gevşetirsiniz.',
        },
      ],
    },
    {
      title: 'Erzak Arabası ve Muhafız Sorgusu',
      text: `Esir kafilesinin başındaki çavuş yanınıza yaklaşarak küstahça güldü; öte yandan erzak arabası hemen yanınızda duruyor.`,
      options: [
        {
          id: 'STEAL_FOOD',
          label: 'Erzak Arabasından Tayın Aşır (+20 Can, +%8 Kaçış Şansı)',
          description: 'Muhafızların dalgınlığından faydalanıp kuru et ve su matarası aşırırsınız.',
        },
        {
          id: 'BRIBE_GUARD',
          label: `Nöbetçiye Rüşvet Fısılda (-${Math.min(120, ransomCost)} Dinar · Anında Kaçış)`,
          description: 'Çizmenizde sakladığınız keseyi nöbetçiye vererek geceleyin atınızı çözmesini sağlarsınız.',
        },
        {
          id: 'ENDURE',
          label: 'Baş Eğmeden Diren (-10 Can, +5 Onur, +%10 Kaçış Şansı)',
          description: 'Muhafızların hırpalamasına boyun eğmez, sancağınızın onurunu korursunuz.',
        },
      ],
    },
  ];
  const chosen = templates[Math.abs(day) % templates.length];
  return {
    id: `cap-dilemma-${day}`,
    day,
    ...chosen,
  };
}

/**
 * Oyuncu savaşta yenildiğinde veya esir düştüğünde (`TriggerPlayerCapturedSequence`) çalışır:
 *  - Oyuncuyu kazanan lordun/haydudun esiri (`playerCaptureState.isCaptive = true`) yapar.
 *  - Harita kontrolünü kilitler ve kamerayı esir alan birliğe bağlar.
 */
export function triggerPlayerCapturedSequence(
  state: CampaignState,
  captorLord: LordAgent,
  losses: Partial<TroopRoster> = {},
  enemiesDefeated = 0,
): CampaignState {
  const afterBattle = resolveBattleOutcome(
    state,
    false,
    captorLord.id,
    losses,
    enemiesDefeated,
    null,
  );

  const escapeChance = computePlayerDailyEscapeChance(afterBattle, 0);
  const ransomCost = Math.max(60, Math.min(600, Math.round(afterBattle.gold * 0.35 + 90)));
  const woundedHp = Math.max(15, Math.min(afterBattle.playerHp, Math.round(afterBattle.playerMaxHp * 0.3)));

  const evt: ChronicleEvent = {
    id: `player-captured-${afterBattle.day}-${captorLord.id}-${Date.now()}`,
    day: afterBattle.day,
    category: 'WAR',
    text: `${afterBattle.playerName}, muharebede ağır yaralanarak ${captorLord.title} ${captorLord.name} kuvvetlerine esir düştü!`,
  };

  return {
    ...afterBattle,
    playerHp: woundedHp,
    playerX: captorLord.x,
    playerZ: captorLord.z,
    escapedCaptivityNotice: null,
    playerCaptureState: {
      isCaptive: true,
      captorLordId: captorLord.id,
      captorName: captorLord.name,
      captorTitle: captorLord.title,
      captorFaction: captorLord.faction,
      daysCaptive: 0,
      escapeChance,
      ransomCost,
      activeEvent: buildCaptivityDilemmaEvent(afterBattle.day, captorLord.name, ransomCost),
    },
    chronicle: [evt, ...afterBattle.chronicle].slice(0, 25),
  };
}

/**
 * Oyuncu esaretten kaçtığında, fidye ödediğinde veya esir tutan birlik yenildiğinde
 * oyuncuyu serbest bırakır (`CharacterState = 'FREE'`) ve kontrolü geri verir.
 */
export function releasePlayerFromCaptivity(
  state: CampaignState,
  method: 'ESCAPE' | 'RANSOM' | 'CAPTOR_DEFEATED' = 'ESCAPE',
  customMessage?: string,
): CampaignState {
  const cap = state.playerCaptureState;
  if (!cap || !cap.isCaptive) return state;

  const captor = state.lords.find((l) => l.id === cap.captorLordId);
  const basePos = captor ? { x: captor.x, z: captor.z } : { x: state.playerX, z: state.playerZ };
  const safeSpawn = snapToNearestLand(basePos.x + 8, basePos.z - 8);

  // Oyuncu kaçtığında en azından küçük bir sadık muhafız çekirdeğiyle veya mevcut sağ kalanlarla devam eder
  const currentTroops = getTotalTroops(state.roster);
  const restoredRoster: TroopRoster =
    currentTroops >= 4
      ? state.roster
      : {
          infantry: Math.max(4, state.roster.infantry),
          archer: Math.max(2, state.roster.archer),
          cavalry: state.roster.cavalry,
          horseArcher: state.roster.horseArcher,
        };

  const defaultMsg =
    method === 'RANSOM'
      ? `${cap.captorTitle} ${cap.captorName}'a fidye ödenerek esaretten kurtulundu ve sancağınız yeniden toplandı!`
      : method === 'CAPTOR_DEFEATED'
        ? `Sizi esir tutan ${cap.captorTitle} ${cap.captorName} birliği dağıldı; kargaşadan faydalanarak özgürlüğünüze kavuştunuz!`
        : `Gece karanlığında zincirlerinizi kırarak ${cap.captorTitle} ${cap.captorName} kampından kaçmayı başardınız!`;

  const evt: ChronicleEvent = {
    id: `player-escape-${state.day}-${Date.now()}`,
    day: state.day,
    category: 'WAR',
    text: customMessage ?? defaultMsg,
  };

  return ensureBannerlordFoundation({
    ...state,
    playerX: safeSpawn.x,
    playerZ: safeSpawn.z,
    playerHp: Math.max(25, state.playerHp),
    roster: restoredRoster,
    playerCaptureState: null,
    escapedCaptivityNotice: {
      captorName: cap.captorName,
      captorTitle: cap.captorTitle,
      daysHeld: Math.max(1, cap.daysCaptive),
      method,
      message: customMessage ?? defaultMsg,
    },
    chronicle: [evt, ...state.chronicle].slice(0, 25),
  });
}

/**
 * Oyuncu esaret altındayken fidye ödeyerek anında serbest kalır.
 */
export function payPlayerCaptivityRansom(
  state: CampaignState,
): { success: boolean; reason?: string; nextState: CampaignState; goldPaid: number } {
  const cap = state.playerCaptureState;
  if (!cap || !cap.isCaptive) {
    return { success: false, reason: 'Şu an esaret altında değilsiniz.', nextState: state, goldPaid: 0 };
  }
  const cost = Math.min(state.gold, cap.ransomCost);
  if (state.gold < cap.ransomCost && state.gold < 40) {
    return {
      success: false,
      reason: `Fidye için yeterli dinarınız yok (${cap.ransomCost} Dinar gerekli).`,
      nextState: state,
      goldPaid: 0,
    };
  }
  const nextAfterGold: CampaignState = {
    ...state,
    gold: Math.max(0, state.gold - cost),
  };
  return {
    success: true,
    goldPaid: cost,
    nextState: releasePlayerFromCaptivity(nextAfterGold, 'RANSOM'),
  };
}

/**
 * Oyuncu esaret altındayken çıkan rastgele olay/ikilem (`CaptivityDilemmaEvent`) kararını uygular.
 */
export function resolvePlayerCaptivityDilemma(
  state: CampaignState,
  optionId: CaptivityDilemmaOption['id'],
): {
  nextState: CampaignState;
  escaped: boolean;
  outcomeText: string;
} {
  const cap = state.playerCaptureState;
  if (!cap || !cap.isCaptive) {
    return { nextState: state, escaped: false, outcomeText: '' };
  }

  if (optionId === 'BRIBE_GUARD') {
    const bribeCost = Math.min(120, cap.ransomCost);
    if (state.gold >= bribeCost) {
      const paidState: CampaignState = {
        ...state,
        gold: state.gold - bribeCost,
      };
      const outcomeText = `Nöbetçiye ${bribeCost} Dinar rüşvet vererek gece yarısı zincirlerinizi açtırdınız ve kamptan kaçtınız!`;
      return {
        nextState: releasePlayerFromCaptivity(paidState, 'ESCAPE', outcomeText),
        escaped: true,
        outcomeText,
      };
    }
    // Yeterli altın yoksa sabretmeye düşer
  }

  if (optionId === 'ESCAPE_ATTEMPT') {
    const rollSeed = hashString(`escape-attempt-${state.day}-${cap.daysCaptive}-${state.playerHp}`);
    const roll = mulberry32(rollSeed)() * 100;
    const effectiveChance = Math.min(88, cap.escapeChance + 25);
    if (roll <= effectiveChance) {
      const outcomeText = 'Karanlıktan faydalanarak nöbetçileri atlattınız ve esaretten kaçtınız!';
      return {
        nextState: releasePlayerFromCaptivity(state, 'ESCAPE', outcomeText),
        escaped: true,
        outcomeText,
      };
    }
    const nextHp = Math.max(10, state.playerHp - 12);
    const outcomeText = 'Nöbetçiler zincir sesini fark etti! Boğuşmada hırpalandınız (-12 Can), ancak bir sonraki fırsat için tecrübe kazandınız (+%10 Kaçış Şansı).';
    return {
      escaped: false,
      outcomeText,
      nextState: {
        ...state,
        playerHp: nextHp,
        playerCaptureState: {
          ...cap,
          escapeChance: Math.min(92, cap.escapeChance + 10),
          activeEvent: null,
        },
      },
    };
  }

  if (optionId === 'STEAL_FOOD') {
    const nextHp = Math.min(state.playerMaxHp, state.playerHp + 20);
    const outcomeText = 'Muhafızların erzak arabasından tayın aşırdınız (+20 Can, +%8 Kaçış Şansı).';
    return {
      escaped: false,
      outcomeText,
      nextState: {
        ...state,
        playerHp: nextHp,
        playerCaptureState: {
          ...cap,
          escapeChance: Math.min(92, cap.escapeChance + 8),
          activeEvent: null,
        },
      },
    };
  }

  // ENDURE / SHARE_RATIONS
  const nextHp = Math.min(state.playerMaxHp, state.playerHp + 12);
  const outcomeText = 'Sabırla gücünüzü topladınız ve kelepçe pimini gevşettiniz (+12 Can, +5 Onur, +%12 Kaçış Şansı).';
  return {
    escaped: false,
    outcomeText,
    nextState: {
      ...state,
      playerHp: nextHp,
      honor: (state.honor ?? 0) + 5,
      playerCaptureState: {
        ...cap,
        escapeChance: Math.min(92, cap.escapeChance + 12),
        activeEvent: null,
      },
    },
  };
}

/**
 * Her oyun gününde (Daily Tick) çalışan birleşik Esir ve Esaret Döngüsü:
 *  1. Yaralı askerleri iyileştirir ve sıradan esirlerin Uyum (`conformity` -> `ready`) barını doldurur.
 *  2. Esir tutulan yapay zeka lordlarının günlük kaçma zarını (`EscapeChance`) atar.
 *  3. Oyuncu esir ise (`playerCaptureState.isCaptive`) günlük kaçma zarını ve rastgele esaret olaylarını işletir.
 */
export function advanceDailyCaptivityAndEscape(
  state: CampaignState,
  options?: { isInSettlement?: boolean; rng?: () => number },
): CampaignState {
  // 1. Sağlık ve sıradan esir uyum (Conformity) döngüsü
  const healthAndPrisoners = advanceDailyPartyHealthAndPrisoners(state, {
    isInSettlement: options?.isInSettlement,
  });
  let current = healthAndPrisoners.nextState;

  const rand =
    options?.rng ??
    mulberry32(hashString(`daily-captivity-${current.day}-${current.gold}-${current.renown}`));

  // 2. Esir AI Lordların Kaçma Zarları (Escape Probability)
  const playerHero = getPlayerHero(current);
  const playerScouting =
    playerHero?.skills?.scouting?.level ?? current.skills?.scouting?.level ?? 25;
  const newChronicles: ChronicleEvent[] = [];

  const updatedLords = current.lords.map((lord) => {
    if (lord.characterState !== 'CAPTIVE') return lord;

    const daysHeld = (lord.daysCaptive ?? 0) + 1;
    // İlk gün esir hemen kaçamaz (oyuncuya fidye/zindan/idam kararı için zaman tanır)
    if (daysHeld < 2) {
      return { ...lord, daysCaptive: daysHeld };
    }

    // EscapeChance = BaseChance - (CaptorScoutingSkill * 0.1) - PrisonSecurityModifier
    let escapeChancePct = 18;
    if (lord.dungeonSettlementId) {
      const dungeonSettlement = current.settlements.find((s) => s.id === lord.dungeonSettlementId);
      const wallLvl = dungeonSettlement?.wallLevel ?? 2;
      const prisonSecurityMod = 8 + wallLvl * 3;
      escapeChancePct = Math.max(3, 16 - prisonSecurityMod);
    } else if (lord.captorId === 'player') {
      const scoutingMitigation = Math.round(playerScouting * 0.08);
      escapeChancePct = Math.max(5, 18 - scoutingMitigation);
    }

    const roll = rand() * 100;
    if (roll < escapeChancePct) {
      const spawn = findLordHomeSpawnCoords(current, lord);
      const minRoster: TroopRoster = { infantry: 12, archer: 8, cavalry: 4, horseArcher: 0 };
      newChronicles.push({
        id: `lord-escaped-${current.day}-${lord.id}`,
        day: current.day,
        category: 'WAR',
        text: `Tutsak ${lord.title} ${lord.name}, muhafızları atlatarak esaretten kaçtı ve yeniden sancak açtı!`,
      });
      return {
        ...lord,
        characterState: 'FREE' as CharacterState,
        captorId: null,
        dungeonSettlementId: null,
        daysCaptive: 0,
        roster: minRoster,
        armySize: getTotalTroops(minRoster),
        x: spawn.x,
        z: spawn.z,
        currentAction: 'Esaretten kaçtı, ordusunu topluyor',
      };
    }

    return {
      ...lord,
      daysCaptive: daysHeld,
    };
  });

  current = {
    ...current,
    lords: updatedLords,
    chronicle:
      newChronicles.length > 0
        ? [...newChronicles, ...current.chronicle].slice(0, 25)
        : current.chronicle,
  };

  // 3. Oyuncu Esaret Altındaysa (Player Captivity Loop)
  const cap = current.playerCaptureState;
  if (cap && cap.isCaptive) {
    const captor = current.lords.find((l) => l.id === cap.captorLordId);
    // Esir tutan lord öldüyse veya kendisi esir düştüyse oyuncu anında kurtulur
    if (!captor || captor.characterState === 'CAPTIVE' || captor.characterState === 'DEAD') {
      return releasePlayerFromCaptivity(current, 'CAPTOR_DEFEATED');
    }

    const nextDaysCaptive = cap.daysCaptive + 1;
    const nextEscapeChance = computePlayerDailyEscapeChance(current, nextDaysCaptive);
    const escapeRoll = rand() * 100;

    // Zar başarılıysa veya 5. güne ulaşıldıysa oyuncu esaretten kaçar!
    if (escapeRoll < nextEscapeChance || nextDaysCaptive >= 5) {
      return releasePlayerFromCaptivity(
        {
          ...current,
          playerCaptureState: {
            ...cap,
            daysCaptive: nextDaysCaptive,
            escapeChance: nextEscapeChance,
          },
        },
        'ESCAPE',
      );
    }

    // Henüz kaçamadıysa konumunu esir tutan lordla senkronla ve yeni günün olayını üret
    return {
      ...current,
      playerX: captor.x,
      playerZ: captor.z,
      playerCaptureState: {
        ...cap,
        daysCaptive: nextDaysCaptive,
        escapeChance: nextEscapeChance,
        activeEvent:
          cap.activeEvent ??
          buildCaptivityDilemmaEvent(current.day, cap.captorName, cap.ransomCost),
      },
    };
  }

  return current;
}


