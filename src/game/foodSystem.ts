import type { CampaignState, InventoryItem, TroopRoster, ChronicleEvent } from './rules.ts';

function itemQuantity(item: InventoryItem): number {
  return Math.max(1, Math.floor(Number.isFinite(item.quantity) ? (item.quantity as number) : 1));
}

export const EDIBLE_FOOD_DEFINITION_IDS = [
  'mkt_grain_sack',
  'mkt_cured_meat',
  'mkt_smoked_fish',
  'mkt_cheese_wheel',
  'mkt_olive_oil',
] as const;

export type EdibleFoodDefinitionId = (typeof EDIBLE_FOOD_DEFINITION_IDS)[number];

export function isEdibleFoodItem(
  item: { definitionId?: string; id?: string; category?: string } | null | undefined,
): boolean {
  if (!item) return false;
  const defId = item.definitionId ?? item.id;
  if (defId && (EDIBLE_FOOD_DEFINITION_IDS as readonly string[]).includes(defId)) return true;
  // Ticari mallar (demir külçesi, ipek) gıda sayılamaz
  if (defId === 'mkt_iron_ingot' || defId === 'mkt_velvet_silk') return false;
  return item.category === 'FOOD';
}

export interface PartyFoodSummary {
  totalFood: number;
  distinctVarieties: number;
  varietyMoraleBonus: number;
  varietyBreakdown: Record<string, number>;
}

/**
 * Bannerlord erzak çeşitliliği moral bonusu:
 * 1 çeşit: 0
 * 2 çeşit: +2
 * 3 çeşit: +5
 * 4 çeşit: +8
 * 5+ çeşit: +12
 */
export function calculateVarietyMoraleBonus(distinctCount: number): number {
  if (distinctCount <= 1) return 0;
  if (distinctCount === 2) return 2;
  if (distinctCount === 3) return 5;
  if (distinctCount === 4) return 8;
  return 12;
}

export function getPartyFoodSummary(inventoryItems: InventoryItem[] | undefined): PartyFoodSummary {
  const breakdown: Record<string, number> = {};
  let totalFood = 0;

  for (const item of inventoryItems ?? []) {
    if (!isEdibleFoodItem(item)) continue;
    const qty = itemQuantity(item);
    if (qty <= 0) continue;
    const foodKey = item.definitionId ?? item.id;
    breakdown[foodKey] = (breakdown[foodKey] ?? 0) + qty;
    totalFood += qty;
  }

  const distinctVarieties = Object.keys(breakdown).length;
  const varietyMoraleBonus = calculateVarietyMoraleBonus(distinctVarieties);

  return {
    totalFood,
    distinctVarieties,
    varietyMoraleBonus,
    varietyBreakdown: breakdown,
  };
}

export function getPartyFoodUnits(inventoryItems: InventoryItem[] | undefined): number {
  return getPartyFoodSummary(inventoryItems).totalFood;
}

export function calculateDailyFoodDemand(roster: TroopRoster, unlockedPerks: string[] = []): number {
  const totalTroops =
    Math.max(0, Math.floor(roster.militia)) +
    Math.max(0, Math.floor(roster.archer)) +
    Math.max(0, Math.floor(roster.cavalry)) +
    Math.max(0, Math.floor(roster.guard));
  const base = Math.max(1, Math.ceil((totalTroops + 1) / 4));
  if (unlockedPerks.includes('spartan_rations')) {
    return Math.max(1, Math.ceil(base * 0.8));
  }
  return base;
}

export interface PartyFoodConsumptionResult {
  nextInventoryItems: InventoryItem[];
  consumedUnits: number;
  remainingFood: number;
  starving: boolean;
  eatenVarieties: number;
}

/**
 * Günlük erzağı envanter yığınlarından dengeli/çeşitli (round-robin) biçimde tüketir.
 */
export function consumePartyFood(
  inventoryItems: InventoryItem[] | undefined,
  demandedUnits: number,
): PartyFoodConsumptionResult {
  const items = (inventoryItems ?? []).map((it) => ({ ...it }));
  let needed = demandedUnits;
  let consumed = 0;
  const eatenKeys = new Set<string>();

  while (needed > 0) {
    // Mevcut yenebilir ve adedi > 0 olan yığınları bul
    const activeFoodIndices = items
      .map((it, idx) => (isEdibleFoodItem(it) && itemQuantity(it) > 0 ? idx : -1))
      .filter((idx) => idx !== -1);

    if (activeFoodIndices.length === 0) break;

    // En çok adedi olandan başlayarak tüket (çeşitliliği olabildiğince uzun korumak için)
    activeFoodIndices.sort((a, b) => itemQuantity(items[b]) - itemQuantity(items[a]));
    const targetIdx = activeFoodIndices[0];
    const targetItem = items[targetIdx];
    const currentQty = itemQuantity(targetItem);

    if (currentQty <= 1) {
      items[targetIdx] = { ...targetItem, quantity: 0 };
    } else {
      items[targetIdx] = { ...targetItem, quantity: currentQty - 1 };
    }

    eatenKeys.add(targetItem.definitionId ?? targetItem.id);
    consumed += 1;
    needed -= 1;
  }

  const nextInventoryItems = items.filter((it) => itemQuantity(it) > 0);
  const remainingFood = getPartyFoodSummary(nextInventoryItems).totalFood;
  const starving = needed > 0;

  return {
    nextInventoryItems,
    consumedUnits: consumed,
    remainingFood,
    starving,
    eatenVarieties: eatenKeys.size,
  };
}

export interface DailyFoodAdvanceResult {
  nextState: CampaignState;
  demanded: number;
  consumed: number;
  starving: boolean;
  varietyMoraleBonus: number;
  moraleDelta: number;
}

/**
 * Kampanya durumuna günlük erzak tüketimini, çeşitlilik moralini ve açlık sonuçlarını işletir.
 */
export function advanceDailyPartyFood(state: CampaignState): DailyFoodAdvanceResult {
  const demanded = calculateDailyFoodDemand(state.roster, state.unlockedPerks);
  const foodInInventory = getPartyFoodUnits(state.inventoryItems);

  let nextInventory = state.inventoryItems ?? [];
  let remainingFood = 0;
  let consumed = 0;
  let starving = false;
  let eatenVarieties = 0;

  if (foodInInventory > 0) {
    const consumption = consumePartyFood(state.inventoryItems, demanded);
    nextInventory = consumption.nextInventoryItems;
    remainingFood = consumption.remainingFood;
    consumed = consumption.consumedUnits;
    starving = consumption.starving;
    eatenVarieties = consumption.eatenVarieties;
  } else if (state.food > 0) {
    consumed = Math.min(state.food, demanded);
    remainingFood = Math.max(0, state.food - consumed);
    starving = state.food < demanded;
    eatenVarieties = 1;
  } else {
    starving = true;
    consumed = 0;
    remainingFood = 0;
    eatenVarieties = 0;
  }

  let moraleDelta = 0;
  let woundedCount = 0;
  const chronicles: ChronicleEvent[] = [...(state.chronicle ?? [])];

  if (starving) {
    moraleDelta -= 15;
    const totalTroops =
      state.roster.militia + state.roster.archer + state.roster.cavalry + state.roster.guard;
    if (totalTroops > 0) {
      woundedCount = Math.min(3, Math.max(1, Math.floor(demanded / 3)));
    }
    chronicles.unshift({
      id: `starvation-${state.day}-${Date.now()}`,
      day: state.day,
      category: 'ECONOMY',
      text: `Ordunun erzağı tükendi! Askerler açlık çekiyor (-15 Moral${
        woundedCount > 0 ? `, ${woundedCount} asker açlıktan dermansız düştü` : ''
      }).`,
    });
  } else {
    // Tokluk: temel ordu beslenme hissi + çeşitlilik morali
    const varietyBonus = calculateVarietyMoraleBonus(eatenVarieties);
    moraleDelta += 2 + varietyBonus;
  }

  let nextTroopStacks = state.troopStacks;
  if (woundedCount > 0 && nextTroopStacks && nextTroopStacks.length > 0) {
    let toWound = woundedCount;
    nextTroopStacks = nextTroopStacks.map((stack) => {
      if (toWound <= 0) return stack;
      const unwounded = Math.max(0, stack.count - (stack.wounded ?? 0));
      const woundHere = Math.min(toWound, unwounded);
      toWound -= woundHere;
      return { ...stack, wounded: (stack.wounded ?? 0) + woundHere };
    });
  }

  const nextState: CampaignState = {
    ...state,
    inventoryItems: nextInventory,
    food: remainingFood,
    morale: Math.max(10, Math.min(100, state.morale + moraleDelta)),
    troopStacks: nextTroopStacks,
    chronicle: chronicles.slice(0, 30),
  };

  return {
    nextState,
    demanded,
    consumed,
    starving,
    varietyMoraleBonus: starving ? 0 : calculateVarietyMoraleBonus(eatenVarieties),
    moraleDelta,
  };
}
