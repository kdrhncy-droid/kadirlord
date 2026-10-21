/**
 * loot.ts — Faz B0/B3: savaş ganimeti.
 *
 * Bannerlord'da zafer yalnız altın vermez: düşmanın teçhizatı **eşya olarak**
 * envantere düşer, sonra pazarda satılır ya da kuşanılır. Önceden zafer
 * `120 + düşman × 22` dinar ile özetleniyordu; envanter hiç değişmiyordu.
 *
 * Bu modül saf ve deterministiktir: aynı sefer + aynı gün + aynı savaş →
 * aynı ganimet (`rng.ts` tohumu). Savaş motoruna dokunmaz; yalnız sonucu
 * eşyaya çevirir.
 */
import type { CampaignState, FactionId, InventoryItem } from './rules';
import { CALRADIA_MARKETPLACE_ITEMS, type MarketplaceItem } from './marketRules';
import { hashString, mulberry32, pick } from './rng';

export interface BattleLootOptions {
  /** Yenilen taraf — ganimetin kültürü. */
  enemyFaction: FactionId;
  /** Öldürülen/dağıtılan düşman sayısı; ganimet miktarını belirler. */
  defeated: number;
  /** Kuşatma zaferi ise bir eşya daha düşer (şehir depoları). */
  siege?: boolean;
  /** Tohum karışımı (varsayılan: oyuncu adı + gün). */
  seedKey?: string;
}

/** Savaş ganimeti olarak düşebilecek eşyalar (ticari mallar ayrı havuzda). */
function equipmentPool(maxTier: number): MarketplaceItem[] {
  return CALRADIA_MARKETPLACE_ITEMS.filter(
    (item) => item.slot !== 'TRADE' && item.category !== 'FOOD' && item.tier <= maxTier,
  );
}

function tradePool(): MarketplaceItem[] {
  return CALRADIA_MARKETPLACE_ITEMS.filter((item) => item.slot === 'TRADE' && item.category === 'FOOD');
}

/**
 * Zafer ganimetini üretir. Dönüş: envantere eklenecek eşyalar.
 * `defeated < 20` → 1 eşya, `< 60` → 2, üstü → 3; kuşatmada +1.
 */
export function rollBattleLoot(
  state: Pick<CampaignState, 'playerName' | 'day'>,
  options: BattleLootOptions,
): InventoryItem[] {
  const { enemyFaction, defeated, siege = false, seedKey } = options;
  const seed = hashString(
    `${seedKey ?? `${state.playerName}|${state.day}`}|${enemyFaction}|${defeated}|${siege ? 'siege' : 'field'}`,
  );
  const rand = mulberry32(seed);

  const count = Math.max(1, Math.min(4, (defeated < 20 ? 1 : defeated < 60 ? 2 : 3) + (siege ? 1 : 0)));
  // Düşmanın teknoloji seviyesi: büyük savaşlarda daha iyi eşya düşer.
  const maxTier = defeated < 20 ? 2 : defeated < 60 ? 3 : 4;

  const items: InventoryItem[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    const isTrade = rand() < 0.22;
    const pool = isTrade ? tradePool() : equipmentPool(maxTier);
    if (pool.length === 0) continue;

    let template = pick(rand, pool);
    // Aynı savaşta aynı eşya iki kez düşmesin (havuz küçükse 3 denemede vazgeç).
    for (let guard = 0; guard < 3 && used.has(template.id); guard++) template = pick(rand, pool);
    used.add(template.id);

    items.push({
      // Aynı gün iki savaş olabilir: tohum da kimliğe girsin ki kayıt çakışmasın.
      id: `${template.id}_loot_${state.day}_${i}_${(seed >>> 0).toString(36)}`,
      name: template.name,
      slot: template.slot,
      category: template.category,
      value: Math.round(template.value * 0.75),
      weight: template.weight,
      statBonus: template.statBonus,
      civilianLegal: template.civilianLegal,
      icon: template.iconKey,
      tier: template.tier,
    });
  }

  return items;
}

/** Ganimeti tek satırda özetler (vakayiname / bildirim metni). */
export function describeLoot(items: InventoryItem[]): string {
  if (items.length === 0) return 'ganimet alınamadı';
  if (items.length === 1) return `1 ganimet eşyası (${items[0].name})`;
  return `${items.length} ganimet eşyası (${items[0].name} ve diğerleri)`;
}

/** Zafer altınını savaşın büyüklüğüne ve kuşatmaya göre hesaplar. */
export function battleGoldReward(defeated: number, siege: boolean): number {
  return 120 + defeated * 22 + (siege ? 260 : 0);
}

/** Ganimetin pazarda edeceği toplam (satış fiyatı zaten %75'e indirilmiş). */
export function lootSaleValue(items: InventoryItem[]): number {
  return items.reduce((sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0);
}
