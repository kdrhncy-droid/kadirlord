/**
 * market.ts — Faz 7: Bannerlord tarzı pazaryeri ekonomisi
 *
 * Gerçek oyunun mantığı (TaleWorlds Dev Blog 25.04.2019):
 *  - Her yerleşkenin **refahı** piyasa fiyatını ve tüccarın kesesini belirler.
 *  - Fiyat arz/talep ile oynar: refah yüksekse mal pahalı, küçük köyde ucuz.
 *  - Tüccarın altını **satış kârını sınırlar**; kese biterse satış yapılamaz.
 *  - Alış fiyatı ortalamanın altındaysa **yeşil**, üstündeyse **kırmızı** görünür.
 *  - Ticaret söylentisi: ziyaret edilen yerleşkelerde malın kaça alındığı.
 *
 * Tüm fonksiyonlar saf ve deterministiktir (yerleşim id'si + refah → fiyat).
 */
import type { CampaignState, Settlement } from './rules.ts';
import type { MarketplaceItem } from './rules.ts';

/** Fiyat tonu — Bannerlord'un yeşil/sarı/kırmızı renk mantığı. */
export type PriceTone = 'CHEAP' | 'FAIR' | 'PRICEY';

export interface MarketProfile {
  settlementId: string;
  name: string;
  /** Fiyat çarpanı (0.82 … 1.28). 1.0 = ortalama. */
  modifier: number;
  /** Tüccarın kesesindeki altın (satış üst sınırı). */
  merchantGold: number;
  /** Tezgahta görünen mal oranı (0.55 … 1.0) — küçük yerleşkede daha az çeşit. */
  stockFactor: number;
  /** Refah 0..10000 ölçeğinde. */
  prosperity: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Yerleşkenin piyasa profili.
 *
 * Refah aralığı oyun verisinde 1200 (köy) – 9000 (büyük şehir) civarındadır;
 * 5000'i "ortalama" kabul ediyoruz. `jitter` yerleşim id'sinden gelir, böylece
 * iki komşu şehir birebir aynı fiyatı vermez (Bannerlord'da da öyledir).
 */
export function marketProfile(settlement: Settlement): MarketProfile {
  const seed = hash32(settlement.id);
  const jitter = ((seed % 1000) / 1000 - 0.5) * 0.16; // ±%8
  const prosperity = clamp(settlement.prosperity, 0, 12000);
  const prosperityFactor = (prosperity - 5000) / 20000; // ±0.35
  const typeFactor =
    settlement.type === 'VILLAGE' ? -0.06 : settlement.type === 'CASTLE' ? 0.05 : 0;
  const raidFactor = settlement.isRaided ? 0.18 : 0; // yağmalanmış yerde kıtlık
  const modifier = clamp(1 + prosperityFactor + typeFactor + jitter + raidFactor, 0.82, 1.28);

  const merchantGold = Math.round(
    clamp(prosperity * 1.6 + settlement.garrison * 8 + 600, 800, 22000) * modifier,
  );
  const stockFactor = clamp(0.55 + prosperity / 11000 + (settlement.type === 'TOWN' ? 0.12 : 0), 0.55, 1);

  return {
    settlementId: settlement.id,
    name: settlement.name,
    modifier: Math.round(modifier * 1000) / 1000,
    merchantGold,
    stockFactor: Math.round(stockFactor * 100) / 100,
    prosperity,
  };
}

/** Alış fiyatı (oyuncu öder). */
export function buyPriceAt(item: Pick<MarketplaceItem, 'value' | 'tier'>, profile: MarketProfile): number {
  const tierWeight = 1 + (item.tier - 1) * 0.02; // üst kademe mallar biraz daha oynak
  return Math.max(1, Math.round(item.value * profile.modifier * tierWeight));
}

/** Satış fiyatı (oyuncu alır) — alışın ~%72'si (lonca payı). */
export function sellPriceAt(item: Pick<MarketplaceItem, 'value' | 'tier'>, profile: MarketProfile): number {
  return Math.max(1, Math.round(buyPriceAt(item, profile) * 0.72));
}

/** Fiyat, malın taban değerine göre nerede? */
export function priceTone(price: number, baseValue: number): PriceTone {
  const ratio = price / Math.max(1, baseValue);
  if (ratio < 0.94) return 'CHEAP';
  if (ratio > 1.06) return 'PRICEY';
  return 'FAIR';
}

/** Ton → Tailwind renk sınıfı (Bannerlord yeşil/kırmızı mantığı). */
export const PRICE_TONE_CLASS: Record<PriceTone, string> = {
  CHEAP: 'text-[#34d399]',
  FAIR: 'text-[#e2d6c1]',
  PRICEY: 'text-[#fca5a5]',
};

export const PRICE_TONE_LABEL: Record<PriceTone, string> = {
  CHEAP: 'ortalamanın altında — almak için iyi',
  FAIR: 'ortalama fiyat',
  PRICEY: 'ortalamanın üstünde — pahalı',
};

export interface MarketStock {
  item: MarketplaceItem;
  buyPrice: number;
  /** Tezgahta kalan adet (1..3). */
  quantity: number;
  tone: PriceTone;
}

/**
 * Yerleşkenin tezgâhı: tüm mal listesinden deterministik bir alt küme + fiyat.
 * `stockFactor` kadar mal görünür; her malın 1–3 adedi vardır.
 */
export function buildMarketStock(
  items: readonly MarketplaceItem[],
  profile: MarketProfile,
): MarketStock[] {
  const seed = hash32(profile.settlementId);
  return items
    .filter((item) => {
      if (item.category === 'FOOD') return true; // erzak her yerde bulunur
      const h = hash32(`${seed}:${item.id}`) % 100;
      return h < profile.stockFactor * 100;
    })
    .map((item) => ({
      item,
      buyPrice: buyPriceAt(item, profile),
      quantity: 1 + (hash32(`${seed}:q:${item.id}`) % 3),
      tone: priceTone(buyPriceAt(item, profile), item.value),
    }));
}

export interface Rumour {
  settlementId: string;
  settlementName: string;
  price: number;
  tone: PriceTone;
  /** Oyuncunun bu yerleşkeyi ziyaret edip etmediği. */
  visited: boolean;
}

/**
 * Ticaret söylentisi: haritadaki **en yakın** yerleşkelerde malın fiyatı.
 * Bannerlord'da söylentiler yalnız ziyaret edilen şehirler için oluşur; burada
 * keşfedilmemişler "?" olarak değil, soluk satır olarak gösterilir.
 */
export function tradeRumours(
  campaign: CampaignState,
  item: Pick<MarketplaceItem, 'id' | 'value' | 'tier'>,
  from: Settlement,
  visitedIds: readonly string[] = [],
  limit = 3,
): Rumour[] {
  const visited = new Set(visitedIds);
  return campaign.settlements
    .filter((s) => s.id !== from.id && s.type !== 'VILLAGE')
    .map((s) => ({ s, d: Math.hypot(s.x - from.x, s.z - from.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ s }) => {
      const profile = marketProfile(s);
      const price = buyPriceAt(item, profile);
      return {
        settlementId: s.id,
        settlementName: s.name,
        price,
        tone: priceTone(price, item.value),
        visited: visited.has(s.id),
      };
    });
}

/**
 * Toplu satışta kilitlenen mal sayısını dışarıda bırakır.
 * `lockedIds` = oyuncunun kilitlediği envanter satırları.
 */
export function sellableItems<T extends { id: string }>(
  items: readonly T[],
  lockedIds: readonly string[],
): T[] {
  const locked = new Set(lockedIds);
  return items.filter((i) => !locked.has(i.id));
}

/** Tüccarın kesesi satışı sınırlar: verilebilecek toplam altın. */
export function cappedSale(goldWanted: number, merchantGold: number): { paid: number; shortfall: number } {
  const paid = Math.max(0, Math.min(goldWanted, merchantGold));
  return { paid, shortfall: Math.max(0, goldWanted - paid) };
}

export interface MarketSession {
  spent: number;
  earned: number;
  itemsBought: number;
  itemsSold: number;
  /** Net sonuç: eksi = harcadın, artı = kazandın. */
  net: number;
}

export const emptySession = (): MarketSession => ({
  spent: 0,
  earned: 0,
  itemsBought: 0,
  itemsSold: 0,
  net: 0,
});

export function addPurchase(s: MarketSession, gold: number, quantity = 1): MarketSession {
  const next = {
    ...s,
    spent: s.spent + gold,
    itemsBought: s.itemsBought + Math.max(0, Math.floor(quantity)),
  };
  return { ...next, net: next.earned - next.spent };
}

export function addSale(s: MarketSession, gold: number, quantity = 1): MarketSession {
  const next = {
    ...s,
    earned: s.earned + gold,
    itemsSold: s.itemsSold + Math.max(0, Math.floor(quantity)),
  };
  return { ...next, net: next.earned - next.spent };
}

/** Taşıma kapasitesi (Bannerlord: ordu mevcudu + yük hayvanları). */
export function carryCapacity(troops: number, packAnimals: number): number {
  return troops * 12 + packAnimals * 60 + 120;
}

/** Pazar doğrulaması — probe'lar kullanır. */
export function validateMarketProfile(p: MarketProfile): string[] {
  const problems: string[] = [];
  if (p.modifier < 0.8 || p.modifier > 1.3) problems.push('fiyat çarpanı aralık dışı');
  if (p.merchantGold < 500) problems.push('tüccar kesesi çok düşük');
  if (p.stockFactor < 0.5 || p.stockFactor > 1) problems.push('stok oranı aralık dışı');
  if (!Number.isFinite(p.merchantGold)) problems.push('tüccar altını NaN');
  return problems;
}
