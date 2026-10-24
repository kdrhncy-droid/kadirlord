import type { CampaignState, InventoryItem, TroopRoster, ChronicleEvent } from './rules.ts';

function itemQuantity(item: InventoryItem): number {
  return Math.max(1, Math.floor(Number.isFinite(item.quantity) ? (item.quantity as number) : 1));
}

/**
 * Bannerlord'un 9 yiyecek türü (10.4): tahıl, et, balık, peynir, tereyağı,
 * üzüm, zeytin, bira, hurma. Zeytinyağı yiyecek **değildir** (ticaret malıdır);
 * `FOOD` kategorisi bu projede çömlek/demir gibi mallarda da kullanıldığı için
 * yenebilirlik kategoriyle değil, tanım kimliği → yiyecek türü eşlemesiyle belirlenir.
 */
export const FOOD_TYPE_BY_DEFINITION_ID: Record<string, string> = {
  mkt_grain_sack: 'grain',
  mkt_cured_meat: 'meat',
  mkt_smoked_fish: 'fish',
  mkt_cheese_wheel: 'cheese',
  mkt_cheese_round: 'cheese',
  mkt_butter: 'butter',
  mkt_grapes: 'grapes',
  mkt_olives: 'olives',
  mkt_beer: 'beer',
  mkt_dates: 'dates',
};

export const EDIBLE_FOOD_DEFINITION_IDS = Object.keys(FOOD_TYPE_BY_DEFINITION_ID) as readonly string[];

export type EdibleFoodDefinitionId = keyof typeof FOOD_TYPE_BY_DEFINITION_ID;

export function foodTypeOfItem(
  item: { definitionId?: string; id?: string; category?: string } | null | undefined,
): string | null {
  if (!item) return null;
  const defId = item.definitionId ?? item.id;
  if (!defId) return null;
  return FOOD_TYPE_BY_DEFINITION_ID[defId] ?? null;
}

export function isEdibleFoodItem(
  item: { definitionId?: string; id?: string; category?: string } | null | undefined,
): boolean {
  return foodTypeOfItem(item) !== null;
}

export interface PartyFoodSummary {
  totalFood: number;
  distinctVarieties: number;
  varietyMoraleBonus: number;
  varietyBreakdown: Record<string, number>;
}

/**
 * Bannerlord erzak çeşitliliği morali (10.4): her ek yiyecek türü yaklaşık +1,
 * tavan +8 (9 tür). İdare 175 "Gourmet" perki çeşitlilik moralini ikiye katlar
 * (tavan ~+16) — perk bağlaması 10.10 ile gelecek, parametre hazır.
 * Eski `0/2/5/8/12` tablosu uydurmaydı.
 */
export function calculateVarietyMoraleBonus(distinctCount: number, hasGourmetPerk = false): number {
  const base = Math.max(0, Math.min(8, Math.floor(distinctCount) - 1));
  return hasGourmetPerk ? base * 2 : base;
}

export function getPartyFoodSummary(inventoryItems: InventoryItem[] | undefined): PartyFoodSummary {
  const breakdown: Record<string, number> = {};
  let totalFood = 0;

  for (const item of inventoryItems ?? []) {
    // Çeşit, tanım kimliğiyle değil yiyecek **türüyle** sayılır: iki farklı peynir
    // tek çeşit eder (Bannerlord'da tür esastır).
    const foodKey = foodTypeOfItem(item);
    if (!foodKey) continue;
    const qty = itemQuantity(item);
    if (qty <= 0) continue;
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

/**
 * Günlük erzak talebi — Bannerlord ölçeği (10.4): yaklaşık **20 askere günde
 * 1 birim** yiyecek ("20 garnizon askeri günde 1 yemek yer"). Eski
 * `ceil((asker+1)/4)` ölçeği ~5 kat fazlaydı. Kesirli tüketim yerine tam
 * birime yuvarlanır; +1, parti liderinin kendisidir.
 */
export function calculateDailyFoodDemand(roster: TroopRoster, unlockedPerks: string[] = []): number {
  const totalTroops =
    Math.max(0, Math.floor(roster.infantry)) +
    Math.max(0, Math.floor(roster.archer)) +
    Math.max(0, Math.floor(roster.cavalry)) +
    Math.max(0, Math.floor(roster.horseArcher));
  const base = Math.max(1, Math.ceil((totalTroops + 1) / 20));
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

    const eatenType = foodTypeOfItem(targetItem);
    if (eatenType) eatenKeys.add(eatenType);
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
      state.roster.infantry + state.roster.archer + state.roster.cavalry + state.roster.horseArcher;
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
    // Bannerlord morali toplamsal birikmez; hedef değere yakınsar (10.4).
    // Beslenen partide hedef = 50 taban + çeşitlilik bonusu; moral her gün
    // hedefe %25 yaklaşır. Eski günlük `+2 + bonus` morali hep 100'e şişiriyordu.
    const varietyBonus = calculateVarietyMoraleBonus(eatenVarieties);
    const moraleTarget = 50 + varietyBonus;
    moraleDelta += Math.round((moraleTarget - state.morale) * 0.25);
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
