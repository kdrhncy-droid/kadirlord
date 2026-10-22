/**
 * logistics.ts — Bannerlord Tek Lojistik ve Ordu Hareketi Modeli.
 *
 * Bu modül; parti taşıma kapasitesi (InventoryCapacityModel) ve ordu harita
 * hızını (DefaultPartySpeedCalculatingModel) tek bir deterministik çekirdekte
 * toplar.
 *
 * Bileşenler:
 *   1. Taşıma Kapasitesi:
 *      - Temel parti tabanı (40 kg)
 *      - Sağlıklı asker başına yük kapasitesi (+20 kg/asker)
 *      - Boşta duran binek/savaş atları (+20 kg/binek)
 *      - Yük hayvanları / Katırlar (+100 kg/hayvan)
 *      - İdare (Steward) perkleri (ör. 'pack_mules' ile yük hayvanlarına +%20)
 *
 *   2. Ordu Harita Hızı (Party Speed):
 *      - Temel hız (5.00)
 *      - Birlik mevcudu koordinasyon cezası (-0.018 * N - ekstra ordu direnci)
 *      - Süvari oranı bonusu (+3.0 * C / (I + C) * D)
 *      - Bindirilmiş Yaya Bonusu (Mounted Footmen): yedek binek atı sayısı
 *        kadar yaya askerin at sırtında seyahat etmesi (+1.2 * M / N)
 *      - Sürü Cezası (Herd Penalty): asker sayısından (1.1x) fazla hayvan
 *        bulunduğunda güdüm zorluğu (-0.04 * fazla)
 *      - Aşırı Yük Cezası (Overburdened): kapasite aşıldığında kademeli yavaşlama
 *      - Yaralı ve Tutsak cezaları (-0.025/yaralı, -0.02/esir)
 *      - Moral çarpanı (yüksek moralde +0.14, düşükte -0.22)
 *      - Arazi ve İmparatorluk Taş Yolu çarpanı (harita coğrafyası)
 */
import {
  distanceToNearestRoad,
  getBiomeAt,
  getForestMaskAt,
  getTerrainSlopeAndColorAt,
} from './mapGen.ts';
import {
  getTotalTroops,
  type CampaignState,
  type HorseKind,
  type InventoryItem,
  type ItemCategory,
  type ItemDefinition,
  type TroopRoster,
} from './rules.ts';
import {
  inventoryItemQuantity,
  inventoryTotalWeight,
  resolveItemDefinition,
} from './bannerlordFoundation.ts';

export interface PartyAnimalInventory {
  /** Katırlar ve yük hayvanları (horseKind === 'PACK'). */
  packAnimals: number;
  /** Envanterde boşta bekleyen binek ve savaş atları (RIDING veya WAR). */
  spareMounts: number;
  /** Envanterdeki toplam hayvan sayısı. */
  totalHorses: number;
}

export interface CapacityBreakdown {
  base: number;
  troopsCapacity: number;
  spareMountsCapacity: number;
  packAnimalsCapacity: number;
  perkBonus: number;
  totalCapacity: number;
  currentWeight: number;
  isOverweight: boolean;
  overweightRatio: number;
}

export interface PartyLogisticsParams {
  x: number;
  z: number;
  healthyTroops: number;
  cavalryCount?: number;
  woundedCount?: number;
  prisonerCount?: number;
  inventoryItems?: InventoryItem[];
  morale?: number;
  perks?: string[];
  state?: Pick<CampaignState, 'customItemDefinitions'>;
  /** Geriye dönük uyumluluk için eski alanlar (envanter verilmemişse kullanılır). */
  legacyFoodUnits?: number;
  legacyHerdAnimals?: number;
}

export interface PartyLogisticsResult {
  // Kapasite
  capacity: CapacityBreakdown;
  animals: PartyAnimalInventory;

  // Hız Bileşenleri
  baseSpeed: number;
  sizePenalty: number;
  cavalryBonus: number;
  mountedFootmenBonus: number;
  herdPenalty: number;
  overburdenPenalty: number;
  woundedPenalty: number;
  prisonerPenalty: number;
  moraleModifier: number;
  terrainMultiplier: number;
  terrainLabel: string;
  onRoad: boolean;
  finalSpeed: number;
  worldUnitsPerSecAt1x: number;
}

/**
 * Envanterdeki hayvan ve binek yığınlarını sayar.
 */
export function countPartyAnimals(
  items: InventoryItem[] | undefined,
  state?: Pick<CampaignState, 'customItemDefinitions'>,
): PartyAnimalInventory {
  let packAnimals = 0;
  let spareMounts = 0;
  let totalHorses = 0;

  for (const item of items ?? []) {
    const qty = inventoryItemQuantity(item);
    if (qty <= 0) continue;

    const def = resolveItemDefinition(state ?? {}, item.definitionId ?? item.id);
    const category: ItemCategory = def?.category ?? item.category ?? 'TRADE';
    const horseKind: HorseKind = def?.horseKind ?? (category === 'HORSE' ? 'RIDING' : 'NONE');
    const lowerName = (item.name ?? '').toLocaleLowerCase('tr-TR');

    const isPack =
      horseKind === 'PACK' ||
      item.id.includes('mule') ||
      lowerName.includes('katır') ||
      lowerName.includes('yük atı');

    const isMount =
      !isPack &&
      (horseKind === 'RIDING' ||
        horseKind === 'WAR' ||
        category === 'HORSE' ||
        lowerName.includes('küheylan') ||
        lowerName.includes('at '));

    if (isPack) {
      packAnimals += qty;
      totalHorses += qty;
    } else if (isMount) {
      spareMounts += qty;
      totalHorses += qty;
    }
  }

  return { packAnimals, spareMounts, totalHorses };
}

/**
 * Bir ordunun tekil taşıma kapasitesini ve aşırı yük durumunu hesaplar.
 */
export function calculatePartyCarryCapacity(params: {
  healthyTroops: number;
  inventoryItems?: InventoryItem[];
  perks?: string[];
  state?: Pick<CampaignState, 'customItemDefinitions'>;
}): CapacityBreakdown {
  const { healthyTroops, inventoryItems, perks = [], state } = params;
  const animals = countPartyAnimals(inventoryItems, state);

  const base = 40;
  const troopsCapacity = Math.max(1, healthyTroops) * 20;
  const spareMountsCapacity = animals.spareMounts * 20;
  let packAnimalsCapacity = animals.packAnimals * 100;

  // İdare perkleri (pack_mules vb.)
  const hasPackMulesPerk = perks.includes('pack_mules');
  const perkBonus = hasPackMulesPerk ? Math.round(packAnimalsCapacity * 0.2) : 0;
  packAnimalsCapacity += perkBonus;

  const totalCapacity = base + troopsCapacity + spareMountsCapacity + packAnimalsCapacity;
  const currentWeight = inventoryTotalWeight(inventoryItems);
  const isOverweight = currentWeight > totalCapacity;
  const overweightRatio = isOverweight ? (currentWeight - totalCapacity) / totalCapacity : 0;

  return {
    base,
    troopsCapacity,
    spareMountsCapacity,
    packAnimalsCapacity,
    perkBonus,
    totalCapacity,
    currentWeight,
    isOverweight,
    overweightRatio,
  };
}

/**
 * Bannerlord DefaultPartySpeedCalculatingModel ve lojistik motoru.
 */
export function calculatePartyLogistics(params: PartyLogisticsParams): PartyLogisticsResult {
  const {
    x,
    z,
    healthyTroops,
    cavalryCount = 0,
    woundedCount = 0,
    prisonerCount = 0,
    inventoryItems,
    morale = 80,
    perks = [],
    state,
    legacyFoodUnits = 24,
    legacyHerdAnimals = 0,
  } = params;

  const baseSpeed = 5.0;
  const totalHealthy = Math.max(1, healthyTroops);
  const totalPeople = Math.max(1, totalHealthy + woundedCount);

  // 1. Kapasite & Hayvan Sayımı
  const capacity = calculatePartyCarryCapacity({
    healthyTroops: totalHealthy,
    inventoryItems,
    perks,
    state,
  });

  const animals = inventoryItems
    ? countPartyAnimals(inventoryItems, state)
    : {
        packAnimals: Math.max(0, Math.floor(legacyHerdAnimals * 0.5)),
        spareMounts: Math.max(0, Math.ceil(legacyHerdAnimals * 0.5)),
        totalHorses: legacyHerdAnimals,
      };

  // 2. Ordu Büyüklüğü Koordinasyon Cezası
  const sizePenalty = -(totalPeople * 0.018 + Math.max(0, totalPeople - 20) * 0.015);

  // 3. Süvari Bonusu: 3.0 * (C / (I + C)) * D
  const effectiveCavalry = Math.min(totalHealthy, Math.max(0, cavalryCount));
  const cavRatio = effectiveCavalry / totalHealthy;
  const damping = 0.44 / (1 + totalPeople * 0.005);
  const cavalryBonus = 3.0 * cavRatio * damping;

  // 4. Bindirilmiş Yaya Bonusu (Mounted Footmen)
  // Envanterdeki boş binek atlarına süvari olmayan piyadeler biner ve hız kazanır
  const footmenCount = Math.max(0, totalHealthy - effectiveCavalry);
  const mountedFootmenCount = Math.min(footmenCount, animals.spareMounts);
  const mountedFootmenBonus =
    footmenCount > 0 ? Number(((mountedFootmenCount / totalPeople) * 1.15).toFixed(2)) : 0;

  // 5. Sürü Cezası (Herd Penalty)
  // Ordu kişi başına 1.1 hayvandan fazlasını güderken yavaşlar
  const totalLiveAnimals = effectiveCavalry + animals.totalHorses;
  const maxManageableAnimals = totalHealthy * 1.1;
  const excessHerd = Math.max(0, totalLiveAnimals - maxManageableAnimals);
  const herdPenalty = -Math.min(2.2, Number((excessHerd * 0.038).toFixed(2)));

  // 6. Aşırı Yük Cezası (Overburdened Drag)
  let overburdenPenalty = 0;
  if (inventoryItems) {
    if (capacity.isOverweight) {
      overburdenPenalty = -Math.min(2.8, Number((0.35 + capacity.overweightRatio * 2.2).toFixed(2)));
    }
  } else {
    // Legacy fallback
    const cargoLimit = totalHealthy * 3.5;
    const excessCargo = Math.max(0, legacyFoodUnits - cargoLimit);
    overburdenPenalty = -(Math.min(0.08, legacyFoodUnits * 0.001) + excessCargo * 0.018);
  }

  // 7. Yaralı ve Tutsak Yavaşlaması
  const woundedPenalty = -Number((woundedCount * 0.024).toFixed(2));
  const prisonerPenalty = -Number((prisonerCount * 0.018).toFixed(2));

  // 8. Moral Çarpanı
  const moraleModifier = morale >= 80 ? 0.14 : morale < 45 ? -0.22 : 0;

  // 9. Coğrafya, Biyom ve Yol Çarpanı
  const biome = getBiomeAt(x, z);
  const info = getTerrainSlopeAndColorAt(x, z);
  const forest = getForestMaskAt(x, z);
  const roadDist = distanceToNearestRoad(x, z);
  const onRoad = roadDist < 4.5 && info.height > 0.25;

  let terrainMultiplier = 1.0;
  let terrainLabel = 'Açık Ova';

  if (onRoad) {
    terrainMultiplier = 1.12;
    terrainLabel = 'İmparatorluk Taş Yolu (+%12)';
  } else if (biome === 'NORTH_SNOW_PEAKS' || info.height > 6.5) {
    terrainMultiplier = 0.78;
    terrainLabel = 'Karlı Dağ Geçidi (-%22)';
  } else if (forest > 0.35) {
    terrainMultiplier = 0.76;
    terrainLabel = 'Sık Orman (-%24)';
  } else if (biome === 'SOUTH_DESERT') {
    terrainMultiplier = 0.88;
    terrainLabel = 'Çöl Kumulları (-%12)';
  } else if (info.slope > 0.32) {
    terrainMultiplier = 0.82;
    terrainLabel = 'Engebeli Yamaç (-%18)';
  } else if (biome === 'EAST_STEPPE') {
    terrainMultiplier = 1.04;
    terrainLabel = 'Bozkır Düzlüğü (+%4)';
  }

  const rawPreTerrain =
    baseSpeed +
    sizePenalty +
    cavalryBonus +
    mountedFootmenBonus +
    herdPenalty +
    overburdenPenalty +
    woundedPenalty +
    prisonerPenalty +
    moraleModifier;

  const finalSpeed = Number(
    Math.max(1.2, Math.min(6.8, rawPreTerrain * terrainMultiplier)).toFixed(1),
  );

  const worldUnitsPerSecAt1x = Number((finalSpeed * 1.28).toFixed(2));

  return {
    capacity,
    animals,
    baseSpeed,
    sizePenalty: Number(sizePenalty.toFixed(2)),
    cavalryBonus: Number(cavalryBonus.toFixed(2)),
    mountedFootmenBonus,
    herdPenalty,
    overburdenPenalty: Number(overburdenPenalty.toFixed(2)),
    woundedPenalty,
    prisonerPenalty,
    moraleModifier: Number(moraleModifier.toFixed(2)),
    terrainMultiplier: Number(terrainMultiplier.toFixed(2)),
    terrainLabel,
    onRoad,
    finalSpeed,
    worldUnitsPerSecAt1x,
  };
}

/**
 * Kampanya durumundan oyuncu partisinin lojistiğini doğrudan üretir.
 */
export function getPlayerPartyLogistics(campaign: CampaignState): PartyLogisticsResult {
  const healthyTroops = getTotalTroops(campaign.roster);
  const playerHero = campaign.heroes?.find((h) => h.isInPlayerParty && h.id === 'hero_player');
  const perks = playerHero?.perks ?? campaign.unlockedPerks ?? [];

  return calculatePartyLogistics({
    x: campaign.playerX,
    z: campaign.playerZ,
    healthyTroops,
    cavalryCount: campaign.roster.cavalry,
    woundedCount: (campaign.troopStacks ?? []).reduce((sum, s) => sum + (s.wounded ?? 0), 0),
    prisonerCount: campaign.prisoners ?? 0,
    inventoryItems: campaign.inventoryItems,
    morale: campaign.morale,
    perks,
    state: campaign,
  });
}
