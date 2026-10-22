/**
 * marketTransaction.ts — P2 pazar bekleyen işlem çekirdeği.
 *
 * Pazar ekranı bu fonksiyonları yalnız kendi taslak `CampaignState`i üzerinde
 * çalıştırır. `Done` taslağı App kampanyasına işler, `Cancel` taslağı atar.
 * Böylece alış, satış, kuşanma, stok ve tüccar kasası atomik onaylanır.
 *
 * Fiyat tek kaynaktan gelir: soldaki satın alma fiyatı da sağdaki satış
 * fiyatı da `ItemDefinition.baseValue` + yerleşim profiliyle hesaplanır.
 */
import type { CampaignState, InventoryItem, ItemDefinition, Settlement } from './rules.ts';
import {
  addItemDefinitionToInventory,
  ensureBannerlordFoundation,
  inventoryItemQuantity,
  removeInventoryStackQuantity,
  resolveItemDefinition,
} from './bannerlordFoundation.ts';
import { CALRADIA_MARKETPLACE_ITEMS } from './marketRules.ts';
import {
  buildMarketStock,
  buyPriceAt,
  marketProfile,
  sellPriceAt,
  type MarketProfile,
} from './market.ts';

const SPECIAL_FOOD_GAIN: Record<string, { food: number; morale: number }> = {
  mkt_grain_sack: { food: 10, morale: 1 },
  mkt_cured_meat: { food: 12, morale: 4 },
  mkt_smoked_fish: { food: 8, morale: 2 },
  mkt_cheese_wheel: { food: 8, morale: 2 },
};

function safeQuantity(quantity: number): number {
  return Number.isFinite(quantity) ? Math.floor(quantity) : 0;
}

export function getMarketSettlement(
  state: Pick<CampaignState, 'settlements'>,
  settlementId: string,
): Settlement | null {
  return state.settlements.find((settlement) => settlement.id === settlementId) ?? null;
}

export function marketUnitBuyPrice(definition: ItemDefinition, profile: MarketProfile): number {
  return buyPriceAt({ value: definition.baseValue, tier: definition.tier }, profile);
}

export function marketUnitSellPrice(definition: ItemDefinition, profile: MarketProfile): number {
  return sellPriceAt({ value: definition.baseValue, tier: definition.tier }, profile);
}

/**
 * İlk ziyaret edilen yerleşime deterministik stok ile tüccar kasası yazar.
 * Daha önce kalıcılaşmış değerler korunur; yalnız ziyaret bilgisi tamamlanır.
 */
export function initializeMarketSettlement(
  state: CampaignState,
  settlementId: string,
): CampaignState {
  const normalized = ensureBannerlordFoundation(state);
  const index = normalized.settlements.findIndex((settlement) => settlement.id === settlementId);
  if (index < 0) return state;

  const settlement = normalized.settlements[index];
  if (
    settlement.marketStock !== undefined &&
    Object.keys(settlement.marketStock).length > 0 &&
    settlement.merchantGold !== undefined &&
    settlement.visited === true
  ) {
    return normalized;
  }

  const profile = marketProfile(settlement);
  const generatedStock = Object.fromEntries(
    buildMarketStock(CALRADIA_MARKETPLACE_ITEMS, profile).map((entry) => [
      entry.item.id,
      entry.quantity,
    ]),
  );

  const settlements = normalized.settlements.map((candidate, candidateIndex) =>
    candidateIndex === index
      ? {
          ...candidate,
          marketStock:
            candidate.marketStock && Object.keys(candidate.marketStock).length > 0
              ? candidate.marketStock
              : generatedStock,
          merchantGold: candidate.merchantGold ?? profile.merchantGold,
          visited: true,
        }
      : candidate,
  );

  return ensureBannerlordFoundation({ ...normalized, settlements });
}

export interface MarketTradeResult {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  unitPrice: number;
  totalPrice: number;
  quantity: number;
}

function tradeFailure(
  state: CampaignState,
  reason: string,
  unitPrice = 0,
  quantity = 0,
): MarketTradeResult {
  return {
    success: false,
    reason,
    nextState: state,
    unitPrice,
    totalPrice: unitPrice * Math.max(0, quantity),
    quantity: 0,
  };
}

function withMarketChronicle(
  state: CampaignState,
  settlement: Settlement,
  definitionId: string,
  text: string,
): CampaignState['chronicle'] {
  return [
    {
      id: `market-${state.day}-${settlement.id}-${definitionId}-${state.chronicle.length}`,
      day: state.day,
      category: 'ECONOMY',
      text,
    },
    ...state.chronicle,
  ].slice(0, 30);
}

function updateMarketSettlement(
  state: CampaignState,
  settlementId: string,
  update: (settlement: Settlement) => Settlement,
): Settlement[] {
  return state.settlements.map((settlement) =>
    settlement.id === settlementId ? update(settlement) : settlement,
  );
}

/** Taslak kampanyada şehir stoğundan belirtilen adedi satın alır. */
export function buyFromMarket(
  state: CampaignState,
  settlementId: string,
  definitionId: string,
  quantity: number,
): MarketTradeResult {
  const safeQty = safeQuantity(quantity);
  if (safeQty <= 0) return tradeFailure(state, 'Satın alınacak adet en az 1 olmalıdır.');

  const initialized = initializeMarketSettlement(state, settlementId);
  const settlement = getMarketSettlement(initialized, settlementId);
  if (!settlement) return tradeFailure(state, 'Pazar yerleşimi bulunamadı.');

  const definition = resolveItemDefinition(initialized, definitionId);
  if (!definition) return tradeFailure(state, 'Satın alınacak eşya tanımı bulunamadı.');

  const profile = marketProfile(settlement);
  const unitPrice = marketUnitBuyPrice(definition, profile);
  const totalPrice = unitPrice * safeQty;
  const available = Math.max(0, Math.floor(settlement.marketStock?.[definition.id] ?? 0));

  if (available < safeQty) {
    return tradeFailure(
      state,
      `Tezgahta "${definition.name}" için yalnız ${available} adet var.`,
      unitPrice,
      safeQty,
    );
  }
  if (initialized.gold < totalPrice) {
    return tradeFailure(
      state,
      `Yetersiz Dinar: ${safeQty} adet için ${totalPrice} Dinar gerekiyor (mevcut ${initialized.gold}).`,
      unitPrice,
      safeQty,
    );
  }

  const specialFood = SPECIAL_FOOD_GAIN[definition.id];
  const inventoryItems = specialFood
    ? initialized.inventoryItems
    : addItemDefinitionToInventory(
        initialized,
        definition.id,
        safeQty,
        Math.round(unitPrice * 0.75),
      );

  const settlements = updateMarketSettlement(initialized, settlementId, (current) => ({
    ...current,
    marketStock: {
      ...(current.marketStock ?? {}),
      [definition.id]: Math.max(0, (current.marketStock?.[definition.id] ?? 0) - safeQty),
    },
    merchantGold: (current.merchantGold ?? profile.merchantGold) + totalPrice,
    visited: true,
  }));

  const nextState = ensureBannerlordFoundation({
    ...initialized,
    gold: initialized.gold - totalPrice,
    food: specialFood ? initialized.food + specialFood.food * safeQty : initialized.food,
    morale: specialFood
      ? Math.min(100, initialized.morale + specialFood.morale * safeQty)
      : initialized.morale,
    inventoryItems,
    settlements,
    chronicle: withMarketChronicle(
      initialized,
      settlement,
      definition.id,
      `${settlement.name} pazarından ${safeQty} adet "${definition.name}" satın alındı (-${totalPrice} Dinar).`,
    ),
  });

  return { success: true, nextState, unitPrice, totalPrice, quantity: safeQty };
}

/** Taslak kampanyada oyuncu yığınından belirtilen adedi şehre satar. */
export function sellToMarket(
  state: CampaignState,
  settlementId: string,
  stackId: string,
  quantity: number,
): MarketTradeResult {
  const safeQty = safeQuantity(quantity);
  if (safeQty <= 0) return tradeFailure(state, 'Satılacak adet en az 1 olmalıdır.');

  const initialized = initializeMarketSettlement(state, settlementId);
  const settlement = getMarketSettlement(initialized, settlementId);
  if (!settlement) return tradeFailure(state, 'Pazar yerleşimi bulunamadı.');

  const stack = (initialized.inventoryItems ?? []).find((item) => item.id === stackId);
  if (!stack) return tradeFailure(state, 'Satılacak eşya envanterde bulunamadı.');

  const definition = resolveItemDefinition(initialized, stack.definitionId ?? stack.id);
  if (!definition) return tradeFailure(state, 'Satılacak eşyanın tanımı bulunamadı.');

  const profile = marketProfile(settlement);
  const unitPrice = marketUnitSellPrice(definition, profile);
  if (stack.locked) {
    return tradeFailure(state, 'Kilitli eşyalar satılamaz. Önce kilidini kaldır.', unitPrice, safeQty);
  }

  const available = inventoryItemQuantity(stack);
  if (safeQty > available) {
    return tradeFailure(state, `"${stack.name}" yığınında yalnız ${available} adet var.`, unitPrice, safeQty);
  }

  const totalPrice = unitPrice * safeQty;
  const merchantGold = settlement.merchantGold ?? profile.merchantGold;
  if (merchantGold < totalPrice) {
    return tradeFailure(
      state,
      `Tüccarın kasasında ${merchantGold} Dinar var; bu satış için ${totalPrice} Dinar gerekiyor.`,
      unitPrice,
      safeQty,
    );
  }

  const removal = removeInventoryStackQuantity(initialized.inventoryItems, stackId, safeQty);
  if (!removal.success) {
    return tradeFailure(state, removal.reason ?? 'Eşya satılamadı.', unitPrice, safeQty);
  }

  const settlements = updateMarketSettlement(initialized, settlementId, (current) => ({
    ...current,
    marketStock: {
      ...(current.marketStock ?? {}),
      [definition.id]: Math.max(0, (current.marketStock?.[definition.id] ?? 0) + safeQty),
    },
    merchantGold: (current.merchantGold ?? profile.merchantGold) - totalPrice,
    visited: true,
  }));

  const nextState = ensureBannerlordFoundation({
    ...initialized,
    gold: initialized.gold + totalPrice,
    inventoryItems: removal.items,
    settlements,
    chronicle: withMarketChronicle(
      initialized,
      settlement,
      definition.id,
      `${settlement.name} pazarına ${safeQty} adet "${definition.name}" satıldı (+${totalPrice} Dinar).`,
    ),
  });

  return { success: true, nextState, unitPrice, totalPrice, quantity: safeQty };
}

export interface SellAllSurplusResult {
  nextState: CampaignState;
  totalEarned: number;
  totalQuantity: number;
  soldStackCount: number;
}

function isSurplusEquipment(stack: InventoryItem, definition: ItemDefinition | null): boolean {
  if (stack.locked) return false;
  const category = definition?.category ?? stack.category;
  return category === 'WEAPON' || category === 'SHIELD' || category === 'ARMOR';
}

/**
 * Kilitli olmayan silah/kalkan/zırh yığınlarının tamamını, tüccar kasasının
 * yetmediği yerde kısmi adetle, tek taslak işlem zinciri olarak satar.
 */
export function sellAllSurplusToMarket(
  state: CampaignState,
  settlementId: string,
): SellAllSurplusResult {
  let current = initializeMarketSettlement(state, settlementId);
  const settlement = getMarketSettlement(current, settlementId);
  if (!settlement) {
    return { nextState: state, totalEarned: 0, totalQuantity: 0, soldStackCount: 0 };
  }

  const profile = marketProfile(settlement);
  const candidateStacks = [...(current.inventoryItems ?? [])];
  let totalEarned = 0;
  let totalQuantity = 0;
  let soldStackCount = 0;

  for (const candidate of candidateStacks) {
    const liveStack = (current.inventoryItems ?? []).find((item) => item.id === candidate.id);
    if (!liveStack) continue;
    const definition = resolveItemDefinition(current, liveStack.definitionId ?? liveStack.id);
    if (!isSurplusEquipment(liveStack, definition) || !definition) continue;

    const liveSettlement = getMarketSettlement(current, settlementId);
    if (!liveSettlement) break;
    const unitPrice = marketUnitSellPrice(definition, profile);
    const merchantGold = liveSettlement.merchantGold ?? profile.merchantGold;
    const affordableQuantity = unitPrice > 0 ? Math.floor(merchantGold / unitPrice) : 0;
    const quantity = Math.min(inventoryItemQuantity(liveStack), affordableQuantity);
    if (quantity <= 0) continue;

    const result = sellToMarket(current, settlementId, liveStack.id, quantity);
    if (!result.success) continue;
    current = result.nextState;
    totalEarned += result.totalPrice;
    totalQuantity += result.quantity;
    soldStackCount += 1;
  }

  return { nextState: current, totalEarned, totalQuantity, soldStackCount };
}
