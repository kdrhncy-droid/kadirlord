import type {
  CampaignState,
  FactionId,
  InventoryItem,
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
import { calculateClanTier } from './rules.ts';
import { countPartyAnimals } from './logistics.ts';

export interface PartyLimitBreakdown {
  base: number;
  clanTierBonus: number;
  quartermasterBonus: number;
  leadershipBonus: number;
  renownBonus: number;
  total: number;
}

export interface PrisonerLimitBreakdown {
  base: number;
  partyCapacityBonus: number;
  rogueryBonus: number;
  total: number;
}

/**
 * Bannerlord kuralına uygun parti asker kapasitesi dökümü:
 * Taban (20) + Klan Kademesi (+15/kademe) + İaşeci (Steward) becerisi + Liderlik + Nam
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

  // Liderlik becerisi katkısı (parti lideri)
  const playerHero = getPlayerHero(state);
  const leadershipSkill = playerHero?.skills?.leadership?.level ?? state.skills?.leadership?.level ?? 20;
  const leadershipBonus = Math.floor(leadershipSkill * 0.15);

  const renownBonus = Math.floor(state.renown / 50);

  const total = base + clanTierBonus + quartermasterBonus + leadershipBonus + renownBonus;

  return {
    base,
    clanTierBonus,
    quartermasterBonus,
    leadershipBonus,
    renownBonus,
    total: Math.max(20, total),
  };
}

export function getPartyLimit(state: CampaignState): number {
  return calculatePartyLimitBreakdown(state).total;
}

/**
 * Tutsak taşıma kapasitesi dökümü:
 * Taban (10) + Parti kapasitesinin yarısı + Haydutluk (Roguery) becerisi
 */
export function calculatePrisonerLimitBreakdown(state: CampaignState): PrisonerLimitBreakdown {
  const base = 10;
  const partyCap = getPartyLimit(state);
  const partyCapacityBonus = Math.floor(partyCap * 0.4);
  const playerHero = getPlayerHero(state);
  const roguery = playerHero?.skills?.roguery?.level ?? state.skills?.roguery?.level ?? 10;
  const rogueryBonus = Math.floor(roguery * 0.1);

  const total = base + partyCapacityBonus + rogueryBonus;

  return {
    base,
    partyCapacityBonus,
    rogueryBonus,
    total: Math.max(10, total),
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
    return { success: false, reason: `Yalnızca ${ready} tutsak devşirilmeye hazır.`, nextState: state };
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
 * Günlük döngüde yaralı askerlerin iyileşmesini ve tutsakların devşirilmeye hazır olmasını işletir.
 * Cerrah (Medicine) becerisi ve yerleşimde dinlenme iyileşme hızını artırır.
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

  // Tutsak hazır olma (devşirilme isteği)
  const rogueryLevel = state.skills?.roguery?.level ?? 15;
  const rogueryBonus = Math.floor(rogueryLevel / 35);
  const totalReadyCapacity = Math.max(1, 1 + rogueryBonus);

  let remainingReadyPoints = totalReadyCapacity;
  let prisonersBecameReady = 0;

  const currentPrisonerStacks = (state.prisonerStacks ?? []).map((pStack) => {
    const unready = pStack.count - (pStack.ready ?? 0);
    if (remainingReadyPoints <= 0 || unready <= 0) {
      return pStack;
    }
    const readyIncrement = Math.min(unready, remainingReadyPoints);
    remainingReadyPoints -= readyIncrement;
    prisonersBecameReady += readyIncrement;
    return {
      ...pStack,
      ready: (pStack.ready ?? 0) + readyIncrement,
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

