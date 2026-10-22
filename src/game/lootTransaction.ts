/**
 * lootTransaction.ts — P2 savaş sonrası ganimet ve bekleyen transfer çekirdeği.
 *
 * Zafer sonrasında düşmandan ele geçirilen eşyalar (ganimet) ve altın
 * doğrudan envantere düşürülmez; oyuncu ganimet ekranında (sol = ganimet,
 * sağ = parti envanteri) seçimini yapar.
 *
 * Özellikler:
 *   - Bekleyen transfer: eşyalar sol ve sağ arasında Shift / Ctrl / tekil aktarılır.
 *   - Tümünü Al / Tümünü Bırak kısayolları.
 *   - Yığın birleştirme: envantere alınan eşyalar aynı tanım kimlikli yığınlarla birleşir.
 *   - Discard XP entegrasyonu: solda bırakılan teçhizat, İdare perkleri
 *     (paid_in_promise, giving_hands) varsa birlik XP'sine dönüştürülür.
 *   - Bitti (`Done`) işlemi atomiktir: altın, nam, envanter, kahraman ekipmanı ve
 *     Discard XP tek seferde işlenir; Vazgeç (`Cancel`) ganimeti arkada bırakır.
 */
import {
  addInventoryStackQuantity,
  ensureBannerlordFoundation,
  getTroopDefinition,
  inventoryItemQuantity,
  previewDiscardDonation,
  transferInventoryQuantity,
  type DiscardPreview,
  type InventoryTransferResult,
} from './bannerlordFoundation.ts';
import {
  battleGoldReward,
  describeLoot,
  rollBattleLoot,
} from './loot.ts';
import { snapToNearestLand } from './navigation.ts';
import {
  deductCasualtiesFromRoster,
  getTotalTroops,
  type CampaignHero,
  type CampaignState,
  type ChronicleEvent,
  type EquipmentSetId,
  type EquipmentSlotId,
  type FactionId,
  type InventoryItem,
  type TroopRoster,
} from './rules.ts';

export interface PendingBattleLoot {
  enemyLordId: string | null;
  conqueredSettlementId: string | null;
  enemiesDefeatedCount: number;
  playerTroopLosses: Partial<TroopRoster>;
  goldLoot: number;
  renownGain: number;
  prisonersGain: number;
  lootItems: InventoryItem[];
  isSiegeVictory: boolean;
  defeatedFaction: FactionId;
}

export interface PrepareBattleLootOptions {
  enemyLordId?: string | null;
  enemiesDefeated: number;
  losses?: Partial<TroopRoster>;
  conqueredSettlementId?: string | null;
  isSiege?: boolean;
  seedKey?: string;
}

/**
 * Muharebe zaferinde ganimet paketini deterministik olarak hazırlar.
 */
export function prepareBattleLoot(
  state: CampaignState,
  options: PrepareBattleLootOptions,
): PendingBattleLoot {
  const {
    enemyLordId = null,
    enemiesDefeated,
    losses = {},
    conqueredSettlementId = null,
    isSiege = Boolean(conqueredSettlementId),
    seedKey,
  } = options;

  const defeatedFaction: FactionId =
    state.lords.find((l) => l.id === enemyLordId)?.faction ??
    (conqueredSettlementId
      ? state.settlements.find((s) => s.id === conqueredSettlementId)?.faction
      : undefined) ??
    'bandits';

  const goldLoot = battleGoldReward(enemiesDefeated, isSiege);
  const renownGain = 15 + enemiesDefeated * 3;
  const prisonersGain = Math.max(1, Math.floor(enemiesDefeated * 0.35));

  const rolled = rollBattleLoot(state, {
    enemyFaction: defeatedFaction,
    defeated: enemiesDefeated,
    siege: isSiege,
    seedKey,
  });

  return {
    enemyLordId,
    conqueredSettlementId,
    enemiesDefeatedCount: enemiesDefeated,
    playerTroopLosses: losses,
    goldLoot,
    renownGain,
    prisonersGain,
    lootItems: rolled,
    isSiegeVictory: isSiege,
    defeatedFaction,
  };
}

/**
 * Ganimetten envantere tekil veya adetli aktarım.
 */
export function transferLootToInventory(
  lootItems: InventoryItem[],
  inventoryItems: InventoryItem[],
  stackId: string,
  quantity: number,
): InventoryTransferResult {
  return transferInventoryQuantity(lootItems, inventoryItems, stackId, quantity, {
    allowLocked: true,
  });
}

/**
 * Envanterden ganimete (terk edilecekler alanına) aktarım. Kilitli eşyalar aktarılmaz.
 */
export function transferInventoryToLoot(
  inventoryItems: InventoryItem[],
  lootItems: InventoryItem[],
  stackId: string,
  quantity: number,
): InventoryTransferResult {
  return transferInventoryQuantity(inventoryItems, lootItems, stackId, quantity);
}

/**
 * Tüm ganimet eşyalarını envantere aktarır ve mevcut yığınlarla birleştirir.
 */
export function takeAllLoot(
  lootItems: InventoryItem[],
  inventoryItems: InventoryItem[],
): { nextLoot: InventoryItem[]; nextInventory: InventoryItem[]; movedCount: number } {
  let nextInventory = [...inventoryItems];
  let movedCount = 0;

  for (const item of lootItems) {
    const qty = inventoryItemQuantity(item);
    if (qty <= 0) continue;
    nextInventory = addInventoryStackQuantity(nextInventory, item, qty, {
      unitValue: item.value,
      locked: Boolean(item.locked),
    });
    movedCount += qty;
  }

  return {
    nextLoot: [],
    nextInventory,
    movedCount,
  };
}

/**
 * Parti çantasındaki kilitli olmayan tüm eşyaları ganimet/terk alanına bırakır.
 */
export function leaveAllUnlockedToLoot(
  inventoryItems: InventoryItem[],
  lootItems: InventoryItem[],
): { nextLoot: InventoryItem[]; nextInventory: InventoryItem[]; movedCount: number } {
  let nextLoot = [...lootItems];
  const nextInventory: InventoryItem[] = [];
  let movedCount = 0;

  for (const item of inventoryItems) {
    if (item.locked) {
      nextInventory.push(item);
      continue;
    }
    const qty = inventoryItemQuantity(item);
    if (qty <= 0) continue;
    nextLoot = addInventoryStackQuantity(nextLoot, item, qty, {
      unitValue: item.value,
      locked: false,
    });
    movedCount += qty;
  }

  return {
    nextLoot,
    nextInventory,
    movedCount,
  };
}

/**
 * Solda bırakılan ganimet eşyalarının birlik XP önizlemesini hesaplar.
 */
export function previewLootDiscard(
  state: CampaignState,
  leftoverLootItems: InventoryItem[],
): DiscardPreview {
  const byDefinition = new Map<string, number>();
  for (const item of leftoverLootItems) {
    const definitionId = item.definitionId ?? item.id;
    byDefinition.set(
      definitionId,
      (byDefinition.get(definitionId) ?? 0) + inventoryItemQuantity(item),
    );
  }

  return previewDiscardDonation(
    state,
    [...byDefinition].map(([definitionId, quantity]) => ({ definitionId, quantity })),
  );
}

export interface HeroEquipmentUpdate {
  heroId: string;
  activeSet: EquipmentSetId;
  equipment: Record<EquipmentSlotId, string | null>;
}

export interface CommitBattleLootOptions {
  finalInventoryItems: InventoryItem[];
  leftoverLootItems: InventoryItem[];
  heroUpdates?: HeroEquipmentUpdate[];
  applyDiscard?: boolean;
}

export interface CommitBattleLootResult {
  nextState: CampaignState;
  goldGained: number;
  renownGained: number;
  prisonersGained: number;
  itemsKeptCount: number;
  discardXpAwarded: number;
}

/**
 * Savaş ganimeti ekranını onaylayıp (`Done`) sefer durumuna atomik olarak işler.
 */
export function commitBattleLoot(
  state: CampaignState,
  pendingLoot: PendingBattleLoot,
  options: CommitBattleLootOptions,
): CommitBattleLootResult {
  const {
    finalInventoryItems,
    leftoverLootItems,
    heroUpdates,
    applyDiscard = true,
  } = options;

  // 1. Oyuncu zayiatını düş
  const nextRoster: TroopRoster = {
    militia: Math.max(0, state.roster.militia - (pendingLoot.playerTroopLosses.militia || 0)),
    archer: Math.max(0, state.roster.archer - (pendingLoot.playerTroopLosses.archer || 0)),
    cavalry: Math.max(0, state.roster.cavalry - (pendingLoot.playerTroopLosses.cavalry || 0)),
    guard: Math.max(0, state.roster.guard - (pendingLoot.playerTroopLosses.guard || 0)),
  };

  // 2. Düşman lord zayiatı ve geri çekilme
  const nextLords = state.lords.map((l) => {
    if (l.id !== pendingLoot.enemyLordId) return l;

    const currentRoster: TroopRoster = l.roster || {
      militia: Math.max(2, Math.floor(l.armySize * 0.35)),
      archer: Math.max(2, Math.floor(l.armySize * 0.28)),
      cavalry: Math.max(1, Math.floor(l.armySize * 0.22)),
      guard: Math.max(1, Math.floor(l.armySize * 0.15)),
    };

    let updatedRoster = deductCasualtiesFromRoster(currentRoster, pendingLoot.enemiesDefeatedCount);
    let updatedTotal = getTotalTroops(updatedRoster);

    const maxSurvivingOnDefeat = Math.max(2, Math.floor(l.armySize * 0.25));
    if (updatedTotal > maxSurvivingOnDefeat) {
      updatedRoster = deductCasualtiesFromRoster(
        updatedRoster,
        updatedTotal - maxSurvivingOnDefeat,
      );
      updatedTotal = getTotalTroops(updatedRoster);
    }
    if (updatedTotal <= 0) {
      updatedRoster = { militia: 1, archer: 0, cavalry: 0, guard: 0 };
      updatedTotal = 1;
    }
    const safeRetreat = snapToNearestLand(l.x + 18, l.z - 18);
    return {
      ...l,
      roster: updatedRoster,
      armySize: updatedTotal,
      wounded: (l.wounded ?? 1) + Math.max(1, Math.floor(pendingLoot.enemiesDefeatedCount * 0.35)),
      x: safeRetreat.x,
      z: safeRetreat.z,
      currentAction: 'Ordusunu yeniden topluyor',
    };
  });

  // 3. Kuşatılan yerleşim güncellemesi
  const nextSettlements = state.settlements.map((s) => {
    if (
      pendingLoot.conqueredSettlementId &&
      (s.id === pendingLoot.conqueredSettlementId ||
        s.boundSettlementId === pendingLoot.conqueredSettlementId)
    ) {
      return {
        ...s,
        faction: 'player' as FactionId,
        garrison:
          s.id === pendingLoot.conqueredSettlementId
            ? Math.max(20, Math.floor(s.garrison * 0.6))
            : s.garrison,
      };
    }
    return s;
  });

  // 4. Kahraman ekipman güncellemeleri
  let nextHeroes: CampaignHero[] = state.heroes ?? [];
  if (heroUpdates && heroUpdates.length > 0) {
    const updateMap = new Map(heroUpdates.map((u) => [u.heroId, u]));
    nextHeroes = nextHeroes.map((hero) => {
      const update = updateMap.get(hero.id);
      if (!update) return hero;
      return {
        ...hero,
        activeEquipmentSet: update.activeSet,
        equipment: {
          ...hero.equipment,
          [update.activeSet]: {
            ...hero.equipment[update.activeSet],
            ...update.equipment,
          },
        },
      };
    });
  }

  // 5. Discard XP dağıtımı (solda kalan eşyalar)
  let discardXpAwarded = 0;
  let nextTroopStacks = [...(state.troopStacks ?? [])];
  if (applyDiscard && leftoverLootItems.length > 0) {
    const preview = previewLootDiscard(state, leftoverLootItems);
    let xpLeft = preview.acceptedXp;
    discardXpAwarded = preview.acceptedXp;

    nextTroopStacks = nextTroopStacks.map((stack) => {
      if (xpLeft <= 0) return stack;
      const definition = getTroopDefinition(stack.troopId);
      if (!definition || definition.upgrades.length === 0) return stack;
      const capacityBefore = Math.max(0, stack.count * definition.upgradeXp - stack.xp);
      const xpApplied = Math.min(xpLeft, capacityBefore);
      if (xpApplied <= 0) return stack;
      xpLeft -= xpApplied;
      return { ...stack, xp: stack.xp + xpApplied };
    });
  }

  const itemsActuallyKept = finalInventoryItems.filter(
    (item) => !state.inventoryItems?.some((existing) => existing.id === item.id),
  );
  const itemsKeptCount = itemsActuallyKept.reduce(
    (sum, item) => sum + inventoryItemQuantity(item),
    0,
  );

  const newChronicle: ChronicleEvent = {
    id: `evt-${state.day}-${Date.now()}`,
    day: state.day,
    category: pendingLoot.conqueredSettlementId ? 'CONQUEST' : 'WAR',
    text: pendingLoot.conqueredSettlementId
      ? `${state.playerName}, kuşatma zaferiyle yeni bir mülkü ve bağlı köylerini sancağı altına aldı!`
      : `${state.playerName}, meydan savaşında düşman ordusunu bozguna uğrattı (+${pendingLoot.renownGain} Nam, +${pendingLoot.goldLoot} Dinar, ${describeLoot(itemsActuallyKept)}).`,
  };

  const nextState = ensureBannerlordFoundation({
    ...state,
    gold: state.gold + pendingLoot.goldLoot,
    renown: state.renown + pendingLoot.renownGain,
    prisoners: state.prisoners + pendingLoot.prisonersGain,
    morale: Math.min(100, state.morale + 10),
    battlesWon: state.battlesWon + 1,
    inventoryItems: finalInventoryItems,
    roster: nextRoster,
    lords: nextLords,
    settlements: nextSettlements,
    heroes: nextHeroes,
    troopStacks: nextTroopStacks,
    chronicle: [newChronicle, ...state.chronicle].slice(0, 20),
  });

  return {
    nextState,
    goldGained: pendingLoot.goldLoot,
    renownGained: pendingLoot.renownGain,
    prisonersGained: pendingLoot.prisonersGain,
    itemsKeptCount,
    discardXpAwarded,
  };
}
