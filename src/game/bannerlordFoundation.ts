/**
 * bannerlordFoundation.ts — P0/P1 veri temeli ve eski kayıt göçü.
 *
 * Bu modül Bannerlord düzeninin ekranlardan önce gelen kanonik veri katmanıdır:
 * sayısal stat'lı eşya tanımları, adetli/kilitli envanter yığınları, tanım
 * kimliğine bağlı kahraman ekipmanı, gerçek oyuncu/yoldaş kayıtları, kültür
 * birlik ağaçları ve XP/yaralı taşıyan birlik/tutsak yığınları.
 *
 * Göç geriye uyumludur ve idempotenttir. Eski `roster`, `prisoners`,
 * `equipment` (metin) ve `clanRoles` (metin) alanları silinmez; yeni alanlar
 * bunlardan türetilir ve P2/P3 ekranları hazır olana kadar mutabık tutulur.
 */
import { CALRADIA_MARKETPLACE_ITEMS, type MarketplaceItem } from './marketRules';
import { hashString } from './rng';
import { CULTURE_TROOPS } from './troops';
import { getPartyFoodUnits } from './foodSystem.ts';
import {
  normalizeSiegeEngineSlots,
  setWallSections,
} from './siegeMechanics';
import type {
  AttributeId,
  BannerlordSkillId,
  CampaignHero,
  CampaignState,
  ClanRoleId,
  DonationKind,
  EquipmentSetId,
  EquipmentSlotId,
  FactionId,
  HeroEquipmentSet,
  HeroSkillState,
  HorseKind,
  InventoryItem,
  ItemCategory,
  ItemDefinition,
  ItemStats,
  PrisonerStack,
  Settlement,
  TroopDefinition,
  TroopRoster,
  TroopStack,
  UnitTierId,
} from './rules.ts';

export const FOUNDATION_VERSION = 1;
export const PLAYER_HERO_ID = 'hero_player';
export const COMPANION_HERO_IDS = {
  Aybars: 'companion_Aybars',
  Helena: 'companion_Helena',
  Torvald: 'companion_Torvald',
} as const;

const ATTRIBUTE_IDS: AttributeId[] = [
  'VIGOR',
  'CONTROL',
  'ENDURANCE',
  'CUNNING',
  'SOCIAL',
  'INTELLIGENCE',
];

const SKILL_IDS: BannerlordSkillId[] = [
  'oneHanded',
  'twoHanded',
  'polearm',
  'bow',
  'crossbow',
  'throwing',
  'riding',
  'athletics',
  'smithing',
  'scouting',
  'tactics',
  'roguery',
  'charm',
  'leadership',
  'trade',
  'steward',
  'medicine',
  'engineering',
];

export const EQUIPMENT_SLOT_IDS: EquipmentSlotId[] = [
  'HEAD',
  'SHOULDER',
  'BODY',
  'GLOVES',
  'LEG',
  'MOUNT',
  'HARNESS',
  'BANNER',
  'WEAPON1',
  'WEAPON2',
  'WEAPON3',
  'WEAPON4',
];
const EQUIPMENT_SLOTS = EQUIPMENT_SLOT_IDS;

const ITEM_CATEGORIES: ItemCategory[] = ['WEAPON', 'SHIELD', 'ARMOR', 'FOOD', 'HORSE', 'TRADE'];
const ITEM_STAT_KEYS: Array<keyof ItemStats> = [
  'damage',
  'armorHead',
  'armorBody',
  'armorArm',
  'armorLeg',
  'armorMount',
  'shieldDurability',
  'block',
  'speed',
  'range',
  'ammo',
  'mountSpeed',
  'mountManeuver',
  'mountCharge',
  'mountHp',
  'foodAmount',
  'cargoCapacity',
  'moraleBonus',
];

const EMPTY_EQUIPMENT_MARKERS = [
  'kuşanılmış eşya yok',
  'boş slot',
  'başlıksız',
  'omuzluksuz',
  'zırhsız',
  'eldivensiz',
  'çizmesiz',
  'binek yok',
  'bineksiz',
  'koşumsuz',
  'sancak yok',
  'sancaksız',
  'silah yok',
  'silahsız',
];

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback = min): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  return Math.floor(clampNumber(value, min, max, fallback));
}

function positiveInt(value: unknown, fallback = 0): number {
  return Math.max(0, Math.floor(finiteNumber(value, fallback)));
}

function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Etiketin önündeki veya arkasındaki ilk sayıyı bulur (`+38 Baş`, `Hız: 64`). */
function numberNear(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    // `+48 Baş Zırhı · +4 İtibar` gibi metinlerde etiketten sonraki ilk sayı
    // başka bir bonus olabilir; bu yüzden önce etiketten hemen önceki sayı aranır.
    const before = new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*(?:kg|cm|adet)?\\s*${escaped}`, 'i').exec(text);
    if (before) return Number(before[1].replace(',', '.'));
    const after = new RegExp(`${escaped}[^0-9-]{0,14}([0-9]+(?:[.,][0-9]+)?)`, 'i').exec(text);
    if (after) return Number(after[1].replace(',', '.'));
  }
  return undefined;
}

function firstSignedNumber(text: string): number | undefined {
  const match = /([0-9]+(?:[.,][0-9]+)?)/.exec(text);
  return match ? Number(match[1].replace(',', '.')) : undefined;
}

function assignStat(stats: ItemStats, key: keyof ItemStats, value: number | undefined): void {
  if (value !== undefined && Number.isFinite(value)) stats[key] = Math.round(value);
}

/**
 * Eski serbest metin `statBonus` alanını deterministik sayısal stat'lara çevirir.
 * Bilinmeyen desenler sessizce atlanır; metnin kendisi tanımda korunur.
 */
export function parseItemStats(
  statBonus: string,
  slot: EquipmentSlotId | 'TRADE',
  category: ItemCategory,
): ItemStats {
  const text = statBonus ?? '';
  const stats: ItemStats = {};

  if (category === 'WEAPON') {
    const candidates = ['Kesici', 'Kesme', 'Saplama', 'Delici', 'Delme', 'Darbe', 'Hücum', 'Hasar']
      .map((label) => numberNear(text, [label]))
      .filter((value): value is number => value !== undefined);
    assignStat(stats, 'damage', candidates.length ? Math.max(...candidates) : firstSignedNumber(text));
    assignStat(stats, 'speed', numberNear(text, ['Hız', 'Çekiş Hızı', 'Atış Hızı']));
    assignStat(stats, 'range', numberNear(text, ['Erişim', 'Menzil', 'Uzunluk']));
    const ammo = /([0-9]+)\s*Adet/i.exec(text);
    if (ammo) assignStat(stats, 'ammo', Number(ammo[1]));
  }

  if (category === 'SHIELD') {
    assignStat(stats, 'shieldDurability', numberNear(text, ['Dayanıklılık', 'Kalkan Canı']));
    assignStat(stats, 'block', numberNear(text, ['Blok']));
    assignStat(stats, 'armorBody', numberNear(text, ['Gövde Koruması', 'Gövde Zırhı', 'Koruma']));
    assignStat(stats, 'speed', numberNear(text, ['Hız']));
  }

  if (category === 'ARMOR' || slot === 'HARNESS') {
    assignStat(stats, 'armorHead', numberNear(text, ['Baş Zırhı', 'Baş Koruması', 'Baş']));
    assignStat(stats, 'armorBody', numberNear(text, ['Gövde Zırhı', 'Gövde Koruması', 'Gövde']));
    assignStat(stats, 'armorArm', numberNear(text, ['Kol Zırhı', 'Kol Koruması', 'Kol']));
    assignStat(stats, 'armorLeg', numberNear(text, ['Bacak Zırhı', 'Bacak Koruması', 'Bacak']));
    assignStat(stats, 'armorMount', numberNear(text, ['Binek Zırhı', 'At Zırhı', 'Binek']));

    if (/Gövde\s*\/\s*Kol/i.test(text)) {
      const combined = firstSignedNumber(text);
      assignStat(stats, 'armorBody', combined);
      assignStat(stats, 'armorArm', combined);
    }

    const hasArmor =
      stats.armorHead !== undefined ||
      stats.armorBody !== undefined ||
      stats.armorArm !== undefined ||
      stats.armorLeg !== undefined ||
      stats.armorMount !== undefined;
    if (!hasArmor) {
      const generic = numberNear(text, ['Zırh', 'Koruma']) ?? firstSignedNumber(text);
      if (slot === 'HEAD') assignStat(stats, 'armorHead', generic);
      else if (slot === 'GLOVES') assignStat(stats, 'armorArm', generic);
      else if (slot === 'LEG') assignStat(stats, 'armorLeg', generic);
      else if (slot === 'HARNESS') assignStat(stats, 'armorMount', generic);
      else assignStat(stats, 'armorBody', generic);
    }
  }

  if (category === 'HORSE' || slot === 'MOUNT') {
    assignStat(stats, 'mountSpeed', numberNear(text, ['Hız']));
    assignStat(stats, 'mountManeuver', numberNear(text, ['Manevra']));
    assignStat(stats, 'mountCharge', numberNear(text, ['Hücum']));
    assignStat(stats, 'mountHp', numberNear(text, ['Binek Canı', 'At Canı', 'Can']));
  }

  if (category === 'FOOD') {
    assignStat(stats, 'foodAmount', numberNear(text, ['Erzak', 'Gıda', 'Yiyecek', 'Tayın']));
  }

  const cargo = /\+?\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/i.exec(text);
  if (cargo) assignStat(stats, 'cargoCapacity', Number(cargo[1].replace(',', '.')));
  const morale = /%\s*([0-9]+)[^·]*Moral/i.exec(text);
  if (morale) assignStat(stats, 'moraleBonus', Number(morale[1]));

  return stats;
}

function primaryStatValue(stats: ItemStats): number {
  return Math.max(
    stats.damage ?? 0,
    stats.armorHead ?? 0,
    stats.armorBody ?? 0,
    stats.armorArm ?? 0,
    stats.armorLeg ?? 0,
    stats.armorMount ?? 0,
    stats.mountSpeed ?? 0,
    Math.floor((stats.shieldDurability ?? 0) / 8),
  );
}

function inferTier(baseValue: number, stats: ItemStats, category: ItemCategory): number {
  let tier = 1;
  if (baseValue >= 900) tier = 6;
  else if (baseValue >= 650) tier = 5;
  else if (baseValue >= 450) tier = 4;
  else if (baseValue >= 250) tier = 3;
  else if (baseValue >= 100) tier = 2;

  if (category === 'WEAPON' || category === 'SHIELD' || category === 'ARMOR' || category === 'HORSE') {
    const primary = primaryStatValue(stats);
    if (primary >= 110) tier = Math.max(tier, 6);
    else if (primary >= 90) tier = Math.max(tier, 5);
    else if (primary >= 70) tier = Math.max(tier, 4);
    else if (primary >= 50) tier = Math.max(tier, 3);
    else if (primary >= 30) tier = Math.max(tier, 2);
  }
  return clampInt(tier, 0, 6, 1);
}

function inferCategory(
  slot: EquipmentSlotId | 'TRADE',
  name: string,
  statBonus: string,
  existing?: string,
): ItemCategory {
  if (existing && ITEM_CATEGORIES.includes(existing as ItemCategory)) return existing as ItemCategory;
  const lowerName = name.toLocaleLowerCase('tr-TR');
  if (slot === 'MOUNT') return 'HORSE';
  if (slot === 'HARNESS' || slot === 'HEAD' || slot === 'SHOULDER' || slot === 'BODY' || slot === 'GLOVES' || slot === 'LEG') {
    return 'ARMOR';
  }
  if (slot.startsWith('WEAPON')) return lowerName.includes('kalkan') ? 'SHIELD' : 'WEAPON';
  if (slot === 'BANNER') return 'TRADE';
  if (/katır|küheylan|savaş atı|binek atı/.test(lowerName)) return 'HORSE';
  if (/Erzak|Gıda|Yiyecek/i.test(statBonus)) return 'FOOD';
  return 'TRADE';
}

function donationKindForCategory(category: ItemCategory): DonationKind | null {
  if (category === 'ARMOR') return 'ARMOR';
  if (category === 'WEAPON' || category === 'SHIELD') return 'WEAPON';
  return null;
}

function horseKindFor(
  category: ItemCategory,
  slot: EquipmentSlotId | 'TRADE',
  name: string,
  tier: number,
  stats: ItemStats,
): HorseKind {
  if (category !== 'HORSE') return 'NONE';
  const lowerName = name.toLocaleLowerCase('tr-TR');
  if (slot === 'TRADE' || lowerName.includes('katır') || lowerName.includes('yük')) return 'PACK';
  if (lowerName.includes('savaş') || lowerName.includes('küheylan') || tier >= 5) return 'WAR';
  if ((stats.mountHp ?? 0) >= 250) return 'WAR';
  return 'RIDING';
}

function defaultIcon(slot: EquipmentSlotId | 'TRADE', category: ItemCategory, name: string): string {
  const lowerName = name.toLocaleLowerCase('tr-TR');
  if (category === 'SHIELD' || lowerName.includes('kalkan')) return 'shield';
  if (category === 'HORSE' || slot === 'MOUNT') return 'horse';
  if (slot === 'HARNESS') return 'harness';
  if (slot === 'HEAD') return 'helmet';
  if (slot === 'SHOULDER') return 'shoulder';
  if (slot === 'GLOVES') return 'gloves';
  if (slot === 'LEG') return 'boots';
  if (slot === 'BODY') return 'armor';
  if (lowerName.includes('sadak') || lowerName.includes('ok ')) return 'arrows';
  if (lowerName.includes('yay')) return 'bow';
  if (lowerName.includes('arbalet')) return 'crossbow';
  if (lowerName.includes('kargı') || lowerName.includes('mızrak') || lowerName.includes('kontos')) return 'spear';
  if (lowerName.includes('balta') || lowerName.includes('falx')) return 'axe';
  if (lowerName.includes('gürz') || lowerName.includes('topuz')) return 'mace';
  if (category === 'WEAPON') return 'sword';
  if (category === 'FOOD') return 'grain';
  return 'crate';
}

function sanitizeStats(raw: unknown): ItemStats {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Partial<Record<keyof ItemStats, unknown>>;
  const stats: ItemStats = {};
  for (const key of ITEM_STAT_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) stats[key] = Math.round(value);
  }
  return stats;
}

function sanitizeItemDefinition(raw: unknown): ItemDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<ItemDefinition>;
  const id = cleanString(source.id);
  const name = cleanString(source.name);
  const slot = source.slot;
  if (!id || !name || (slot !== 'TRADE' && !EQUIPMENT_SLOTS.includes(slot as EquipmentSlotId))) return null;
  const safeSlot = slot as EquipmentSlotId | 'TRADE';
  const category = inferCategory(safeSlot, name, source.statBonus ?? '', source.category);
  const statBonus = typeof source.statBonus === 'string' ? source.statBonus : '';
  const stats = Object.keys(sanitizeStats(source.stats)).length
    ? sanitizeStats(source.stats)
    : parseItemStats(statBonus, safeSlot, category);
  const baseValue = Math.max(0, Math.round(finiteNumber(source.baseValue, 0)));
  const tier = clampInt(source.tier, 0, 6, inferTier(baseValue, stats, category));
  return {
    id,
    name,
    category,
    slot: safeSlot,
    baseValue,
    weight: Math.max(0, finiteNumber(source.weight, 0)),
    tier,
    civilianLegal: Boolean(source.civilianLegal),
    icon: cleanString(source.icon, defaultIcon(safeSlot, category, name)),
    statBonus,
    stats,
    donationKind:
      source.donationKind === 'ARMOR' || source.donationKind === 'WEAPON'
        ? source.donationKind
        : donationKindForCategory(category),
    horseKind:
      source.horseKind === 'PACK' || source.horseKind === 'RIDING' || source.horseKind === 'WAR' || source.horseKind === 'NONE'
        ? source.horseKind
        : horseKindFor(category, safeSlot, name, tier, stats),
  };
}

function definitionFromMarketplace(item: MarketplaceItem): ItemDefinition {
  const stats = parseItemStats(item.statBonus, item.slot, item.category);
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    slot: item.slot,
    baseValue: item.value,
    weight: item.weight,
    tier: clampInt(item.tier, 0, 6, 1),
    civilianLegal: item.civilianLegal,
    icon: item.iconKey,
    statBonus: item.statBonus,
    stats,
    donationKind: donationKindForCategory(item.category),
    horseKind: horseKindFor(item.category, item.slot, item.name, item.tier, stats),
  };
}

export const ITEM_DEFINITIONS: readonly ItemDefinition[] = CALRADIA_MARKETPLACE_ITEMS.map(definitionFromMarketplace);
export const ITEM_DEFINITION_BY_ID: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_DEFINITIONS.map((definition) => [definition.id, definition]),
);
const ITEM_DEFINITION_IDS_BY_LENGTH = [...ITEM_DEFINITION_BY_ID.keys()].sort((a, b) => b.length - a.length);

function definitionIdentityKey(name: string, slot: EquipmentSlotId | 'TRADE', statBonus: string): string {
  return `${slot}|${name.trim()}|${statBonus.trim()}`;
}

const STATIC_DEFINITION_BY_IDENTITY = new Map(
  ITEM_DEFINITIONS.map((definition) => [
    definitionIdentityKey(definition.name, definition.slot, definition.statBonus),
    definition,
  ]),
);

function definitionFromLegacyItem(item: InventoryItem, forcedId?: string): ItemDefinition {
  const isOriginalMuleBundle = item.id === 'item_sumpter_mule' && item.quantity === undefined;
  const name = isOriginalMuleBundle ? item.name.replace(/\s*\(x3\)\s*$/i, '') : cleanString(item.name, 'Bilinmeyen Eşya');
  const slot = item.slot;
  const category = inferCategory(slot, name, item.statBonus ?? '', item.category);
  const stats = Object.keys(sanitizeStats(item.stats)).length
    ? sanitizeStats(item.stats)
    : parseItemStats(item.statBonus ?? '', slot, category);
  if (isOriginalMuleBundle && stats.cargoCapacity !== undefined) {
    // Eski tek satır üç katırı ve toplam +300 kg kapasiteyi temsil ediyordu.
    stats.cargoCapacity = Math.round(stats.cargoCapacity / 3);
  }
  const baseValue = isOriginalMuleBundle
    ? Math.round(Math.max(0, finiteNumber(item.value, 240)) / 3)
    : Math.max(0, Math.round(finiteNumber(item.value, 0)));
  const tier = item.tier !== undefined ? clampInt(item.tier, 0, 6, 1) : inferTier(baseValue, stats, category);
  const statBonus =
    isOriginalMuleBundle && stats.cargoCapacity !== undefined
      ? `+${stats.cargoCapacity} kg Ordu Taşıma Kapasitesi`
      : item.statBonus ?? '';
  return {
    id: forcedId ?? item.id,
    name,
    category,
    slot,
    baseValue,
    weight: Math.max(0, finiteNumber(item.weight, 0)),
    tier,
    civilianLegal: Boolean(item.civilianLegal),
    icon: cleanString(item.icon, defaultIcon(slot, category, name)),
    statBonus,
    stats,
    donationKind: donationKindForCategory(category),
    horseKind: horseKindFor(category, slot, name, tier, stats),
  };
}

function parseEquipmentText(text: string): { name: string; statBonus: string } {
  const match = /^(.*?)\s*\((.*)\)\s*$/.exec(text.trim());
  if (!match) return { name: text.trim(), statBonus: '' };
  return { name: match[1].trim(), statBonus: match[2].trim() };
}

function isEmptyEquipmentText(text: string): boolean {
  const lower = text.toLocaleLowerCase('tr-TR').trim();
  return !lower || EMPTY_EQUIPMENT_MARKERS.some((marker) => lower.includes(marker));
}

function defaultEquipmentWeight(slot: EquipmentSlotId): number {
  switch (slot) {
    case 'HEAD': return 2.5;
    case 'SHOULDER': return 2;
    case 'BODY': return 9;
    case 'GLOVES': return 1;
    case 'LEG': return 2.5;
    case 'MOUNT': return 0;
    case 'HARNESS': return 8;
    case 'BANNER': return 1;
    default: return 2;
  }
}

function equipmentDefinitionValue(slot: EquipmentSlotId, stats: ItemStats): number {
  if (stats.damage) return Math.round(stats.damage * 6 + 80);
  if (stats.shieldDurability) return Math.round(stats.shieldDurability * 0.75 + 60);
  if (stats.mountSpeed) return Math.round(stats.mountSpeed * 11 + (stats.mountCharge ?? 0) * 4);
  const armorTotal =
    (stats.armorHead ?? 0) +
    (stats.armorBody ?? 0) +
    (stats.armorArm ?? 0) +
    (stats.armorLeg ?? 0) +
    (stats.armorMount ?? 0);
  if (armorTotal > 0) return Math.round(armorTotal * 13 + 70);
  if (slot === 'BANNER') return 500;
  if (slot.startsWith('WEAPON')) return 360;
  return 180;
}

function definitionFromEquipmentText(
  slot: EquipmentSlotId,
  text: string,
  customDefinitions: Map<string, ItemDefinition>,
): ItemDefinition {
  const parsed = parseEquipmentText(text);
  const identity = definitionIdentityKey(parsed.name, slot, parsed.statBonus);
  const staticDefinition = STATIC_DEFINITION_BY_IDENTITY.get(identity);
  if (staticDefinition) return staticDefinition;

  for (const definition of customDefinitions.values()) {
    if (definitionIdentityKey(definition.name, definition.slot, definition.statBonus) === identity) {
      return definition;
    }
  }

  const category = inferCategory(slot, parsed.name, parsed.statBonus);
  const stats = parseItemStats(parsed.statBonus, slot, category);
  const baseValue = equipmentDefinitionValue(slot, stats);
  const tier = inferTier(baseValue, stats, category);
  const definition: ItemDefinition = {
    id: `legacy_${(hashString(identity) >>> 0).toString(36)}`,
    name: parsed.name,
    category,
    slot,
    baseValue,
    weight: defaultEquipmentWeight(slot),
    tier,
    civilianLegal: slot === 'MOUNT' || slot === 'BANNER',
    icon: defaultIcon(slot, category, parsed.name),
    statBonus: parsed.statBonus,
    stats,
    donationKind: donationKindForCategory(category),
    horseKind: horseKindFor(category, slot, parsed.name, tier, stats),
  };
  customDefinitions.set(definition.id, definition);
  return definition;
}

function resolveDefinitionForInventoryItem(
  item: InventoryItem,
  customDefinitions: Map<string, ItemDefinition>,
): ItemDefinition {
  const directId = cleanString(item.definitionId) || cleanString(item.id);
  const direct = ITEM_DEFINITION_BY_ID.get(directId) ?? customDefinitions.get(directId);
  if (direct) return direct;

  const byItemId = ITEM_DEFINITION_BY_ID.get(item.id) ?? customDefinitions.get(item.id);
  if (byItemId) return byItemId;

  const generatedCatalogId = ITEM_DEFINITION_IDS_BY_LENGTH.find(
    (definitionId) => item.id === definitionId || item.id.startsWith(`${definitionId}_`),
  );
  if (generatedCatalogId) return ITEM_DEFINITION_BY_ID.get(generatedCatalogId)!;

  const identity = definitionIdentityKey(item.name, item.slot, item.statBonus ?? '');
  const staticByIdentity = STATIC_DEFINITION_BY_IDENTITY.get(identity);
  if (staticByIdentity) return staticByIdentity;
  for (const definition of customDefinitions.values()) {
    if (definitionIdentityKey(definition.name, definition.slot, definition.statBonus) === identity) {
      return definition;
    }
  }

  const stableId = /^(item|mkt)_[a-z0-9_]+$/i.test(item.id)
    ? item.id
    : `legacy_${(hashString(identity) >>> 0).toString(36)}`;
  const definition = definitionFromLegacyItem(item, stableId);
  customDefinitions.set(definition.id, definition);
  return definition;
}

export function resolveItemDefinition(
  state: Pick<CampaignState, 'customItemDefinitions'>,
  definitionId: string | null | undefined,
): ItemDefinition | null {
  if (!definitionId) return null;
  const staticDefinition = ITEM_DEFINITION_BY_ID.get(definitionId);
  if (staticDefinition) return staticDefinition;
  for (const raw of state.customItemDefinitions ?? []) {
    const definition = sanitizeItemDefinition(raw);
    if (definition?.id === definitionId) return definition;
  }
  return null;
}

export function inventoryItemQuantity(item: InventoryItem): number {
  return Math.max(1, Math.floor(finiteNumber(item.quantity, 1)));
}

export function inventoryTotalQuantity(items: InventoryItem[] | undefined): number {
  return (items ?? []).reduce((sum, item) => sum + inventoryItemQuantity(item), 0);
}

export function inventoryTotalWeight(items: InventoryItem[] | undefined): number {
  return (items ?? []).reduce(
    (sum, item) => sum + Math.max(0, finiteNumber(item.weight, 0)) * inventoryItemQuantity(item),
    0,
  );
}

export function inventoryTotalValue(items: InventoryItem[] | undefined): number {
  return (items ?? []).reduce(
    (sum, item) => sum + Math.max(0, finiteNumber(item.value, 0)) * inventoryItemQuantity(item),
    0,
  );
}

function normalizeInventory(
  rawItems: InventoryItem[] | undefined,
  customDefinitions: Map<string, ItemDefinition>,
): InventoryItem[] {
  const stacks: InventoryItem[] = [];
  const stackByKey = new Map<string, InventoryItem>();
  const usedStackIds = new Set<string>();

  for (const rawItem of rawItems ?? []) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const slot = rawItem.slot;
    if (slot !== 'TRADE' && !EQUIPMENT_SLOTS.includes(slot)) continue;

    const item: InventoryItem = {
      ...rawItem,
      id: cleanString(rawItem.id),
      name: cleanString(rawItem.name, 'Bilinmeyen Eşya'),
      slot,
      statBonus: typeof rawItem.statBonus === 'string' ? rawItem.statBonus : '',
      civilianLegal: Boolean(rawItem.civilianLegal),
    };
    if (!item.id) continue;

    const isOriginalMuleBundle = item.id === 'item_sumpter_mule' && item.quantity === undefined;
    const definition = resolveDefinitionForInventoryItem(item, customDefinitions);
    const quantity = isOriginalMuleBundle ? 3 : inventoryItemQuantity(item);
    const unitValue = isOriginalMuleBundle
      ? Math.round(Math.max(0, finiteNumber(item.value, definition.baseValue * 3)) / 3)
      : Math.max(0, Math.round(finiteNumber(item.value, definition.baseValue)));
    const locked = Boolean(item.locked);
    const key = `${definition.id}|${locked ? 'locked' : 'open'}`;
    const existing = stackByKey.get(key);

    if (existing) {
      const oldQuantity = inventoryItemQuantity(existing);
      const totalValue = existing.value * oldQuantity + unitValue * quantity;
      existing.quantity = oldQuantity + quantity;
      existing.value = Math.round(totalValue / existing.quantity);
      continue;
    }

    let stackId = item.id;
    if (usedStackIds.has(stackId)) stackId = `stack_${definition.id}`;
    if (usedStackIds.has(stackId)) stackId = `${stackId}_${stacks.length + 1}`;
    usedStackIds.add(stackId);

    const stack: InventoryItem = {
      id: stackId,
      definitionId: definition.id,
      name: definition.name,
      slot: definition.slot,
      category: definition.category,
      quantity,
      locked,
      value: unitValue,
      weight: definition.weight,
      statBonus: definition.statBonus,
      stats: { ...definition.stats },
      civilianLegal: definition.civilianLegal,
      icon: definition.icon,
      tier: definition.tier,
    };
    stacks.push(stack);
    stackByKey.set(key, stack);
  }

  return stacks;
}

/** Bir tanımı mevcut yığınla birleştirerek envantere ekler. */
export function addItemDefinitionToInventory(
  state: Pick<CampaignState, 'customItemDefinitions' | 'inventoryItems'>,
  definitionId: string,
  quantity = 1,
  unitValue?: number,
): InventoryItem[] {
  const definition = resolveItemDefinition(state, definitionId);
  const items = [...(state.inventoryItems ?? [])];
  if (!definition || quantity <= 0) return items;

  const index = items.findIndex(
    (item) => (item.definitionId ?? item.id) === definition.id && !item.locked,
  );
  if (index >= 0) {
    const current = items[index];
    items[index] = {
      ...current,
      definitionId: definition.id,
      quantity: inventoryItemQuantity(current) + Math.floor(quantity),
      category: definition.category,
      stats: { ...definition.stats },
      tier: definition.tier,
    };
    return items;
  }

  items.push({
    id: `stack_${definition.id}`,
    definitionId: definition.id,
    name: definition.name,
    slot: definition.slot,
    category: definition.category,
    quantity: Math.floor(quantity),
    locked: false,
    value: Math.max(0, Math.round(finiteNumber(unitValue, definition.baseValue))),
    weight: definition.weight,
    statBonus: definition.statBonus,
    stats: { ...definition.stats },
    civilianLegal: definition.civilianLegal,
    icon: definition.icon,
    tier: definition.tier,
  });
  return items;
}

/** Aynı tanım + aynı kilit durumundaki yığınlar tek satırda birleşir. */
export function inventoryStackKey(item: Pick<InventoryItem, 'id' | 'definitionId' | 'locked'>): string {
  return `${item.definitionId ?? item.id}|${item.locked ? 'locked' : 'open'}`;
}

export interface InventoryStackRemovalResult {
  success: boolean;
  reason?: string;
  items: InventoryItem[];
  removedStack: InventoryItem | null;
  removedQuantity: number;
}

function cloneInventoryStack(item: InventoryItem, quantity = inventoryItemQuantity(item)): InventoryItem {
  return {
    ...item,
    definitionId: item.definitionId ?? item.id,
    quantity: Math.max(0, Math.floor(quantity)),
    locked: Boolean(item.locked),
    stats: item.stats ? { ...item.stats } : undefined,
  };
}

function mergedUnitValue(
  current: InventoryItem,
  incomingUnitValue: number,
  incomingQuantity: number,
): number {
  const currentQuantity = inventoryItemQuantity(current);
  const totalQuantity = currentQuantity + incomingQuantity;
  if (totalQuantity <= 0) return Math.max(0, Math.round(finiteNumber(current.value, 0)));
  return Math.max(
    0,
    Math.round(
      (Math.max(0, finiteNumber(current.value, 0)) * currentQuantity +
        Math.max(0, finiteNumber(incomingUnitValue, 0)) * incomingQuantity) /
        totalQuantity,
    ),
  );
}

/**
 * Bir şablon yığınının belirtilen adedini hedef listeye ekler.
 * Aynı tanım/kilit anahtarı varsa adetler ve birim değer (ağırlıklı ortalama)
 * birleşir; yoksa çakışmayan kararlı bir yığın kimliği üretilir.
 */
export function addInventoryStackQuantity(
  destinationItems: InventoryItem[] | undefined,
  template: InventoryItem,
  quantity: number,
  options: { unitValue?: number; locked?: boolean } = {},
): InventoryItem[] {
  const safeQuantity = Math.max(0, Math.floor(finiteNumber(quantity, 0)));
  const items = [...(destinationItems ?? [])];
  if (safeQuantity <= 0) return items;

  const incoming = cloneInventoryStack(template, safeQuantity);
  incoming.locked = options.locked ?? incoming.locked;
  const incomingUnitValue = Math.max(
    0,
    Math.round(finiteNumber(options.unitValue, finiteNumber(template.value, 0))),
  );
  const key = inventoryStackKey(incoming);
  const existingIndex = items.findIndex((item) => inventoryStackKey(item) === key);
  if (existingIndex >= 0) {
    const current = items[existingIndex];
    items[existingIndex] = {
      ...cloneInventoryStack(current, inventoryItemQuantity(current) + safeQuantity),
      value: mergedUnitValue(current, incomingUnitValue, safeQuantity),
      stats: current.stats ? { ...current.stats } : incoming.stats ? { ...incoming.stats } : undefined,
    };
    return items;
  }

  const definitionId = incoming.definitionId ?? incoming.id;
  const usedIds = new Set(items.map((item) => item.id));
  let stackId = incoming.id;
  if (!stackId || usedIds.has(stackId)) stackId = `stack_${definitionId}`;
  let suffix = 2;
  while (usedIds.has(stackId)) {
    stackId = `stack_${definitionId}_${suffix}`;
    suffix += 1;
  }

  items.push({
    ...incoming,
    id: stackId,
    definitionId,
    quantity: safeQuantity,
    value: incomingUnitValue,
  });
  return items;
}

/** Bir yığından adet düşürür; doğrulama başarısızsa girdi listesini aynen döndürür. */
export function removeInventoryStackQuantity(
  sourceItems: InventoryItem[] | undefined,
  stackId: string,
  quantity: number,
  options: { allowLocked?: boolean } = {},
): InventoryStackRemovalResult {
  const items = [...(sourceItems ?? [])];
  const safeQuantity = Math.floor(finiteNumber(quantity, 0));
  if (safeQuantity <= 0) {
    return {
      success: false,
      reason: 'Taşınacak adet en az 1 olmalıdır.',
      items: sourceItems ?? [],
      removedStack: null,
      removedQuantity: 0,
    };
  }

  const index = items.findIndex((item) => item.id === stackId);
  if (index < 0) {
    return {
      success: false,
      reason: 'Eşya yığını bulunamadı.',
      items: sourceItems ?? [],
      removedStack: null,
      removedQuantity: 0,
    };
  }

  const source = items[index];
  if (source.locked && !options.allowLocked) {
    return {
      success: false,
      reason: 'Kilitli eşyalar taşınamaz, satılamaz veya atılamaz.',
      items: sourceItems ?? [],
      removedStack: null,
      removedQuantity: 0,
    };
  }

  const available = inventoryItemQuantity(source);
  if (safeQuantity > available) {
    return {
      success: false,
      reason: `Yığında yalnız ${available} adet var.`,
      items: sourceItems ?? [],
      removedStack: null,
      removedQuantity: 0,
    };
  }

  const nextItems =
    safeQuantity === available
      ? items.filter((_, itemIndex) => itemIndex !== index)
      : items.map((item, itemIndex) =>
          itemIndex === index
            ? cloneInventoryStack(item, available - safeQuantity)
            : item,
        );

  return {
    success: true,
    items: nextItems,
    removedStack: cloneInventoryStack(source, safeQuantity),
    removedQuantity: safeQuantity,
  };
}

export interface InventoryTransferResult {
  success: boolean;
  reason?: string;
  sourceItems: InventoryItem[];
  destinationItems: InventoryItem[];
  movedStack: InventoryItem | null;
  movedQuantity: number;
}

/**
 * Bannerlord ekranlarının ortak bekleyen-transfer atomu.
 * Kaynak ile hedef aynı anda güncellenir; doğrulama başarısızsa iki liste de
 * değişmeden döner. UI bu sonucu yalnız taslak durumda saklar, `Done`da
 * kampanyaya işler; `Cancel` taslağı atar.
 */
export function transferInventoryQuantity(
  sourceItems: InventoryItem[] | undefined,
  destinationItems: InventoryItem[] | undefined,
  stackId: string,
  quantity: number,
  options: { allowLocked?: boolean; destinationUnitValue?: number } = {},
): InventoryTransferResult {
  const removal = removeInventoryStackQuantity(sourceItems, stackId, quantity, {
    allowLocked: options.allowLocked,
  });
  if (!removal.success || !removal.removedStack) {
    return {
      success: false,
      reason: removal.reason,
      sourceItems: sourceItems ?? [],
      destinationItems: destinationItems ?? [],
      movedStack: null,
      movedQuantity: 0,
    };
  }

  return {
    success: true,
    sourceItems: removal.items,
    destinationItems: addInventoryStackQuantity(
      destinationItems,
      removal.removedStack,
      removal.removedQuantity,
      { unitValue: options.destinationUnitValue },
    ),
    movedStack: removal.removedStack,
    movedQuantity: removal.removedQuantity,
  };
}

/**
 * Bir yığının tamamını kilitler/kilidini açar. Karşı kilit durumunda aynı
 * tanım varsa iki yığın birleşir; böylece kanonik listede aynı tanımdan en
 * fazla bir kilitli ve bir açık satır kalır.
 */
export function toggleInventoryStackLocked(
  sourceItems: InventoryItem[] | undefined,
  stackId: string,
): { success: boolean; reason?: string; items: InventoryItem[]; stack: InventoryItem | null } {
  const items = [...(sourceItems ?? [])];
  const index = items.findIndex((item) => item.id === stackId);
  if (index < 0) {
    return {
      success: false,
      reason: 'Eşya yığını bulunamadı.',
      items: sourceItems ?? [],
      stack: null,
    };
  }

  const source = cloneInventoryStack(items[index]);
  const nextLocked = !source.locked;
  const remaining = items.filter((_, itemIndex) => itemIndex !== index);
  const nextItems = addInventoryStackQuantity(remaining, source, inventoryItemQuantity(source), {
    locked: nextLocked,
  });
  const key = `${source.definitionId ?? source.id}|${nextLocked ? 'locked' : 'open'}`;
  return {
    success: true,
    items: nextItems,
    stack: nextItems.find((item) => inventoryStackKey(item) === key) ?? null,
  };
}

export interface HeroEquipmentResult {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  heroId: string | null;
  slot: EquipmentSlotId | null;
  equipmentSet: EquipmentSetId | null;
  equippedDefinitionId: string | null;
  returnedDefinitionId: string | null;
}

function equipmentFailure(
  state: CampaignState,
  reason: string,
  partial: Partial<Omit<HeroEquipmentResult, 'success' | 'reason' | 'nextState'>> = {},
): HeroEquipmentResult {
  return {
    success: false,
    reason,
    nextState: state,
    heroId: partial.heroId ?? null,
    slot: partial.slot ?? null,
    equipmentSet: partial.equipmentSet ?? null,
    equippedDefinitionId: partial.equippedDefinitionId ?? null,
    returnedDefinitionId: partial.returnedDefinitionId ?? null,
  };
}

function legacyPlayerEquipmentText(
  state: CampaignState,
  slot: EquipmentSlotId,
  definition: ItemDefinition | null,
): Record<EquipmentSlotId, string> {
  const current = (state.equipment ?? {}) as Record<EquipmentSlotId, string>;
  return {
    ...current,
    [slot]: definition
      ? definition.statBonus
        ? `${definition.name} (${definition.statBonus})`
        : definition.name
      : 'Kuşanılmış Eşya Yok',
  };
}

/**
 * Herhangi bir parti kahramanının seçili ekipman setine bir envanter
 * yığınından tek adet kuşanır. Eski eşya aynı işlemde envantere döner.
 * Sivil sete yalnız `civilianLegal` tanımlar girebilir.
 */
export function equipInventoryItemForHero(
  state: CampaignState,
  heroId: string,
  stackId: string,
  equipmentSet?: EquipmentSetId,
): HeroEquipmentResult {
  const normalized = ensureBannerlordFoundation(state);
  const hero = normalized.heroes?.find((candidate) => candidate.id === heroId);
  if (!hero || !hero.isInPlayerParty) {
    return equipmentFailure(state, 'Kuşanacak kahraman partide bulunamadı.', { heroId });
  }

  const targetSet: EquipmentSetId =
    equipmentSet === 'CIVILIAN' || equipmentSet === 'BATTLE'
      ? equipmentSet
      : hero.activeEquipmentSet;
  const items = normalized.inventoryItems ?? [];
  const stack =
    items.find((item) => item.id === stackId) ??
    items.find((item) => (item.definitionId ?? item.id) === stackId);
  if (!stack) {
    return equipmentFailure(state, 'Eşya envanterde bulunamadı.', {
      heroId: hero.id,
      equipmentSet: targetSet,
    });
  }

  const definitionId = stack.definitionId ?? stack.id;
  const definition = resolveItemDefinition(normalized, definitionId);
  if (!definition || definition.slot === 'TRADE') {
    return equipmentFailure(state, 'Bu eşya kuşanılamaz.', {
      heroId: hero.id,
      equipmentSet: targetSet,
      equippedDefinitionId: definitionId,
    });
  }
  const slot = definition.slot;
  if (targetSet === 'CIVILIAN' && !definition.civilianLegal) {
    return equipmentFailure(state, `"${definition.name}" sivil kıyafetle taşınamaz.`, {
      heroId: hero.id,
      slot,
      equipmentSet: targetSet,
      equippedDefinitionId: definition.id,
    });
  }

  const previousDefinitionId = hero.equipment[targetSet][slot] ?? null;
  if (previousDefinitionId === definition.id) {
    return equipmentFailure(state, `"${definition.name}" zaten kuşanılmış.`, {
      heroId: hero.id,
      slot,
      equipmentSet: targetSet,
      equippedDefinitionId: definition.id,
    });
  }

  const removal = removeInventoryStackQuantity(items, stack.id, 1, { allowLocked: true });
  if (!removal.success) {
    return equipmentFailure(state, removal.reason ?? 'Eşya kuşanılamadı.', {
      heroId: hero.id,
      slot,
      equipmentSet: targetSet,
      equippedDefinitionId: definition.id,
    });
  }

  let nextItems = removal.items;
  if (previousDefinitionId) {
    const previousDefinition = resolveItemDefinition(normalized, previousDefinitionId);
    if (!previousDefinition) {
      return equipmentFailure(state, 'Çıkarılan ekipmanın tanımı bulunamadı.', {
        heroId: hero.id,
        slot,
        equipmentSet: targetSet,
        equippedDefinitionId: definition.id,
        returnedDefinitionId: previousDefinitionId,
      });
    }
    nextItems = addItemDefinitionToInventory(
      { customItemDefinitions: normalized.customItemDefinitions, inventoryItems: nextItems },
      previousDefinitionId,
      1,
      previousDefinition.baseValue,
    );
  }

  const nextHeroes = normalized.heroes?.map((candidate) =>
    candidate.id === hero.id
      ? {
          ...candidate,
          equipment: {
            ...candidate.equipment,
            [targetSet]: {
              ...candidate.equipment[targetSet],
              [slot]: definition.id,
            },
          },
        }
      : candidate,
  );
  const isPlayer = hero.id === PLAYER_HERO_ID || hero.kind === 'PLAYER';

  return {
    success: true,
    nextState: ensureBannerlordFoundation({
      ...normalized,
      heroes: nextHeroes,
      inventoryItems: nextItems,
      equipment:
        isPlayer && targetSet === 'BATTLE'
          ? legacyPlayerEquipmentText(normalized, slot, definition)
          : normalized.equipment,
    }),
    heroId: hero.id,
    slot,
    equipmentSet: targetSet,
    equippedDefinitionId: definition.id,
    returnedDefinitionId: previousDefinitionId,
  };
}

/** Seçili kahramanın seçili setindeki bir slotu boşaltır ve eşyayı partiye geri koyar. */
export function unequipHeroEquipmentSlot(
  state: CampaignState,
  heroId: string,
  slot: EquipmentSlotId,
  equipmentSet?: EquipmentSetId,
): HeroEquipmentResult {
  const normalized = ensureBannerlordFoundation(state);
  const hero = normalized.heroes?.find((candidate) => candidate.id === heroId);
  if (!hero || !hero.isInPlayerParty) {
    return equipmentFailure(state, 'Ekipmanı çıkarılacak kahraman partide bulunamadı.', {
      heroId,
      slot,
    });
  }

  const targetSet: EquipmentSetId =
    equipmentSet === 'CIVILIAN' || equipmentSet === 'BATTLE'
      ? equipmentSet
      : hero.activeEquipmentSet;
  const definitionId = hero.equipment[targetSet][slot] ?? null;
  if (!definitionId) {
    return equipmentFailure(state, 'Bu slot zaten boş.', {
      heroId: hero.id,
      slot,
      equipmentSet: targetSet,
    });
  }
  const definition = resolveItemDefinition(normalized, definitionId);
  if (!definition) {
    return equipmentFailure(state, 'Çıkarılan ekipmanın tanımı bulunamadı.', {
      heroId: hero.id,
      slot,
      equipmentSet: targetSet,
      returnedDefinitionId: definitionId,
    });
  }

  const nextItems = addItemDefinitionToInventory(
    {
      customItemDefinitions: normalized.customItemDefinitions,
      inventoryItems: normalized.inventoryItems,
    },
    definitionId,
    1,
    definition.baseValue,
  );
  const nextHeroes = normalized.heroes?.map((candidate) =>
    candidate.id === hero.id
      ? {
          ...candidate,
          equipment: {
            ...candidate.equipment,
            [targetSet]: {
              ...candidate.equipment[targetSet],
              [slot]: null,
            },
          },
        }
      : candidate,
  );
  const isPlayer = hero.id === PLAYER_HERO_ID || hero.kind === 'PLAYER';

  return {
    success: true,
    nextState: ensureBannerlordFoundation({
      ...normalized,
      heroes: nextHeroes,
      inventoryItems: nextItems,
      equipment:
        isPlayer && targetSet === 'BATTLE'
          ? legacyPlayerEquipmentText(normalized, slot, null)
          : normalized.equipment,
    }),
    heroId: hero.id,
    slot,
    equipmentSet: targetSet,
    equippedDefinitionId: null,
    returnedDefinitionId: definitionId,
  };
}

/** Bir kahramanın aktif savaş/sivil setini değiştirir; oyuncuda eski metin aynasını da senkronlar. */
export function setHeroActiveEquipmentSet(
  state: CampaignState,
  heroId: string,
  equipmentSet: EquipmentSetId,
): HeroEquipmentResult {
  const normalized = ensureBannerlordFoundation(state);
  const hero = normalized.heroes?.find((candidate) => candidate.id === heroId);
  if (!hero || !hero.isInPlayerParty) {
    return equipmentFailure(state, 'Seti değiştirilecek kahraman partide bulunamadı.', {
      heroId,
      equipmentSet,
    });
  }
  const isPlayer = hero.id === PLAYER_HERO_ID || hero.kind === 'PLAYER';
  return {
    success: true,
    nextState: ensureBannerlordFoundation({
      ...normalized,
      heroes: normalized.heroes?.map((candidate) =>
        candidate.id === hero.id ? { ...candidate, activeEquipmentSet: equipmentSet } : candidate,
      ),
      outfitMode: isPlayer ? equipmentSet : normalized.outfitMode,
    }),
    heroId: hero.id,
    slot: null,
    equipmentSet,
    equippedDefinitionId: null,
    returnedDefinitionId: null,
  };
}

function makeSkills(
  source?: Partial<Record<BannerlordSkillId, Partial<HeroSkillState>>>,
  defaults?: Partial<Record<BannerlordSkillId, Partial<HeroSkillState>>>,
): Record<BannerlordSkillId, HeroSkillState> {
  const skills = {} as Record<BannerlordSkillId, HeroSkillState>;
  for (const skillId of SKILL_IDS) {
    const current = source?.[skillId];
    const fallback = defaults?.[skillId];
    skills[skillId] = {
      level: clampInt(current?.level, 0, 330, clampInt(fallback?.level, 0, 330, 10)),
      focus: clampInt(current?.focus, 0, 5, clampInt(fallback?.focus, 0, 5, 0)),
      xp: Math.max(0, finiteNumber(current?.xp, Math.max(0, finiteNumber(fallback?.xp, 0)))),
    };
  }
  return skills;
}

function makeAttributes(
  source?: Partial<Record<AttributeId, number>>,
  defaults?: Partial<Record<AttributeId, number>>,
): Record<AttributeId, number> {
  const attributes = {} as Record<AttributeId, number>;
  for (const attributeId of ATTRIBUTE_IDS) {
    attributes[attributeId] = clampInt(
      source?.[attributeId],
      1,
      10,
      clampInt(defaults?.[attributeId], 1, 10, 3),
    );
  }
  return attributes;
}

function emptyEquipmentSet(): HeroEquipmentSet {
  const set: HeroEquipmentSet = {};
  for (const slot of EQUIPMENT_SLOTS) set[slot] = null;
  return set;
}

function sanitizeEquipmentSet(
  raw: HeroEquipmentSet | undefined,
  validDefinitionIds: Set<string>,
): HeroEquipmentSet {
  const set = emptyEquipmentSet();
  for (const slot of EQUIPMENT_SLOTS) {
    const definitionId = raw?.[slot];
    set[slot] = definitionId && validDefinitionIds.has(definitionId) ? definitionId : null;
  }
  return set;
}

function sanitizeHero(
  raw: unknown,
  validDefinitionIds: Set<string>,
): CampaignHero | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Partial<CampaignHero>;
  const id = cleanString(source.id);
  const name = cleanString(source.name);
  if (!id || !name) return null;
  const maxHp = Math.max(1, Math.round(finiteNumber(source.maxHp, 100)));
  const kind =
    source.kind === 'PLAYER' || source.kind === 'COMPANION' || source.kind === 'SPOUSE' || source.kind === 'FAMILY'
      ? source.kind
      : id === PLAYER_HERO_ID
        ? 'PLAYER'
        : 'COMPANION';
  const cultures: FactionId[] = ['player', 'vlandia', 'battania', 'sturgia', 'empire', 'khuzait', 'aserai', 'bandits'];
  return {
    id,
    name,
    kind,
    culture: cultures.includes(source.culture as FactionId) ? (source.culture as FactionId) : 'player',
    age: clampInt(source.age, 0, 120, 30),
    hp: clampNumber(source.hp, 0, maxHp, maxHp),
    maxHp,
    wage: Math.max(0, Math.round(finiteNumber(source.wage, 0))),
    level: clampInt(source.level, 1, 62, 1),
    xp: Math.max(0, finiteNumber(source.xp, 0)),
    freeAttributePoints: Math.max(0, Math.floor(finiteNumber(source.freeAttributePoints, 0))),
    freeFocusPoints: Math.max(0, Math.floor(finiteNumber(source.freeFocusPoints, 0))),
    attributes: makeAttributes(source.attributes),
    skills: makeSkills(source.skills),
    perks: [...new Set((source.perks ?? []).filter((perk) => typeof perk === 'string' && perk.length > 0))],
    equipment: {
      BATTLE: sanitizeEquipmentSet(source.equipment?.BATTLE, validDefinitionIds),
      CIVILIAN: sanitizeEquipmentSet(source.equipment?.CIVILIAN, validDefinitionIds),
    },
    activeEquipmentSet: source.activeEquipmentSet === 'CIVILIAN' ? 'CIVILIAN' : 'BATTLE',
    isInPlayerParty: source.isInPlayerParty !== false,
    ...(source.morphDNA ? { morphDNA: source.morphDNA } : {}),
    spouseId: source.spouseId ?? null,
    fatherId: source.fatherId ?? null,
    motherId: source.motherId ?? null,
  };
}

function seedCompanion(options: {
  id: string;
  name: string;
  culture: FactionId;
  age: number;
  wage: number;
  attributes: Partial<Record<AttributeId, number>>;
  skills: Partial<Record<BannerlordSkillId, Partial<HeroSkillState>>>;
}): CampaignHero {
  return {
    id: options.id,
    name: options.name,
    kind: 'COMPANION',
    culture: options.culture,
    age: options.age,
    hp: 100,
    maxHp: 100,
    wage: options.wage,
    level: 12,
    xp: 0,
    freeAttributePoints: 0,
    freeFocusPoints: 0,
    attributes: makeAttributes(options.attributes, {
      VIGOR: 4,
      CONTROL: 4,
      ENDURANCE: 4,
      CUNNING: 4,
      SOCIAL: 4,
      INTELLIGENCE: 4,
    }),
    skills: makeSkills(options.skills),
    perks: [],
    equipment: { BATTLE: emptyEquipmentSet(), CIVILIAN: emptyEquipmentSet() },
    activeEquipmentSet: 'BATTLE',
    isInPlayerParty: true,
    spouseId: null,
    fatherId: null,
    motherId: null,
  };
}

function buildHeroes(
  state: CampaignState,
  customDefinitions: Map<string, ItemDefinition>,
): { heroes: CampaignHero[]; roleAssignments: Partial<Record<ClanRoleId, string | null>> } {
  const validDefinitionIds = new Set<string>([
    ...ITEM_DEFINITION_BY_ID.keys(),
    ...customDefinitions.keys(),
  ]);
  const hadHeroes = Array.isArray(state.heroes);
  const existingHeroes = (state.heroes ?? [])
    .map((hero) => sanitizeHero(hero, validDefinitionIds))
    .filter((hero): hero is CampaignHero => hero !== null);
  const existingPlayer = existingHeroes.find((hero) => hero.id === PLAYER_HERO_ID || hero.kind === 'PLAYER');

  const playerSkills = makeSkills(existingPlayer?.skills);
  if (state.skills) {
    for (const skillId of SKILL_IDS) {
      const legacy = state.skills[skillId];
      if (!legacy) continue;
      playerSkills[skillId] = {
        level: clampInt(legacy.level, 0, 330, playerSkills[skillId].level),
        focus: clampInt(legacy.focus, 0, 5, playerSkills[skillId].focus),
        xp: playerSkills[skillId].xp,
      };
    }
  }

  const playerBattleEquipment = sanitizeEquipmentSet(existingPlayer?.equipment.BATTLE, validDefinitionIds);
  for (const slot of EQUIPMENT_SLOTS) {
    const legacyText = state.equipment?.[slot];
    if (legacyText === undefined) continue;
    if (isEmptyEquipmentText(legacyText)) {
      playerBattleEquipment[slot] = null;
      continue;
    }
    const definition = definitionFromEquipmentText(slot, legacyText, customDefinitions);
    playerBattleEquipment[slot] = definition.id;
  }

  const playerMaxHp = Math.max(1, Math.round(finiteNumber(state.playerMaxHp, existingPlayer?.maxHp ?? 100)));
  const playerHero: CampaignHero = {
    id: PLAYER_HERO_ID,
    name: cleanString(state.playerName, existingPlayer?.name ?? 'Komutan Demirhan'),
    kind: 'PLAYER',
    culture: existingPlayer?.culture ?? 'player',
    age: existingPlayer?.age ?? 28,
    hp: clampNumber(state.playerHp, 0, playerMaxHp, existingPlayer?.hp ?? playerMaxHp),
    maxHp: playerMaxHp,
    wage: 0,
    level: clampInt(state.characterLevel, 1, 62, existingPlayer?.level ?? 1),
    xp: existingPlayer?.xp ?? 0,
    freeAttributePoints: Math.max(0, Math.floor(finiteNumber(state.freeAttributePoints, existingPlayer?.freeAttributePoints ?? 0))),
    freeFocusPoints: Math.max(0, Math.floor(finiteNumber(state.freeFocusPoints, existingPlayer?.freeFocusPoints ?? 0))),
    attributes: makeAttributes(state.attributes, existingPlayer?.attributes),
    skills: playerSkills,
    perks: [...new Set([...(existingPlayer?.perks ?? []), ...(state.unlockedPerks ?? [])])],
    equipment: {
      BATTLE: playerBattleEquipment,
      CIVILIAN: sanitizeEquipmentSet(existingPlayer?.equipment.CIVILIAN, validDefinitionIds),
    },
    activeEquipmentSet: state.outfitMode === 'CIVILIAN' ? 'CIVILIAN' : existingPlayer?.activeEquipmentSet ?? 'BATTLE',
    isInPlayerParty: true,
    morphDNA: state.playerMorphDNA ?? existingPlayer?.morphDNA,
    spouseId: existingPlayer?.spouseId ?? null,
    fatherId: existingPlayer?.fatherId ?? null,
    motherId: existingPlayer?.motherId ?? null,
  };

  let companions = existingHeroes.filter((hero) => hero.id !== existingPlayer?.id && hero.kind !== 'PLAYER');
  if (!hadHeroes) {
    companions = [
      seedCompanion({
        id: COMPANION_HERO_IDS.Aybars,
        name: 'Aybars',
        culture: 'khuzait',
        age: 29,
        wage: 18,
        attributes: { CONTROL: 5, ENDURANCE: 5, CUNNING: 6 },
        skills: {
          scouting: { level: 110, focus: 4 },
          riding: { level: 80, focus: 3 },
          bow: { level: 70, focus: 2 },
          tactics: { level: 55, focus: 2 },
        },
      }),
      seedCompanion({
        id: COMPANION_HERO_IDS.Helena,
        name: 'Helena',
        culture: 'empire',
        age: 34,
        wage: 20,
        attributes: { SOCIAL: 5, INTELLIGENCE: 7 },
        skills: {
          medicine: { level: 115, focus: 4 },
          steward: { level: 55, focus: 2 },
          charm: { level: 65, focus: 2 },
          trade: { level: 45, focus: 1 },
        },
      }),
      seedCompanion({
        id: COMPANION_HERO_IDS.Torvald,
        name: 'Torvald',
        culture: 'sturgia',
        age: 41,
        wage: 22,
        attributes: { VIGOR: 5, ENDURANCE: 6, INTELLIGENCE: 6 },
        skills: {
          engineering: { level: 110, focus: 4 },
          smithing: { level: 75, focus: 3 },
          athletics: { level: 60, focus: 2 },
          tactics: { level: 45, focus: 1 },
        },
      }),
    ];
  }

  const heroes: CampaignHero[] = [];
  const seen = new Set<string>();
  for (const hero of [playerHero, ...companions]) {
    if (seen.has(hero.id)) continue;
    seen.add(hero.id);
    heroes.push(hero);
  }

  const defaults: Record<ClanRoleId, string> = {
    QUARTERMASTER: PLAYER_HERO_ID,
    SCOUT: COMPANION_HERO_IDS.Aybars,
    SURGEON: COMPANION_HERO_IDS.Helena,
    ENGINEER: COMPANION_HERO_IDS.Torvald,
  };
  const roleAssignments: Partial<Record<ClanRoleId, string | null>> = {};
  (Object.keys(defaults) as ClanRoleId[]).forEach((role) => {
    const assigned = state.roleAssignments?.[role];
    if (assigned && seen.has(assigned)) roleAssignments[role] = assigned;
    else if (assigned === null) roleAssignments[role] = null;
    else roleAssignments[role] = seen.has(defaults[role]) ? defaults[role] : null;
  });

  return { heroes, roleAssignments };
}

export function getPlayerHero(state: Pick<CampaignState, 'heroes'>): CampaignHero | null {
  return state.heroes?.find((hero) => hero.id === PLAYER_HERO_ID || hero.kind === 'PLAYER') ?? null;
}

export function getHeroById(
  state: Pick<CampaignState, 'heroes'>,
  heroId: string | null | undefined,
): CampaignHero | null {
  if (!heroId) return null;
  return state.heroes?.find((hero) => hero.id === heroId) ?? null;
}

export function getRoleHero(
  state: Pick<CampaignState, 'heroes' | 'roleAssignments'>,
  role: ClanRoleId,
): CampaignHero | null {
  return getHeroById(state, state.roleAssignments?.[role]) ?? (role === 'QUARTERMASTER' ? getPlayerHero(state) : null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Kültür birlik ağaçları
// ─────────────────────────────────────────────────────────────────────────────

const CULTURE_PREFIX: Record<FactionId, string> = {
  player: 'Sancak',
  empire: 'İmparatorluk',
  vlandia: 'Vlandiya',
  battania: 'Battaniya',
  sturgia: 'Sturgiya',
  khuzait: 'Bozkır',
  aserai: 'Aserai',
  bandits: 'Haydut',
};

const TROOP_CLASS_BASE: Record<UnitTierId, { hp: number; attack: number; defense: number; speed: number; wage: number }> = {
  infantry: { hp: 85, attack: 12, defense: 10, speed: 5.6, wage: 3 },
  archer: { hp: 70, attack: 15, defense: 6, speed: 5.8, wage: 4 },
  cavalry: { hp: 105, attack: 17, defense: 9, speed: 9.5, wage: 8 },
  horseArcher: { hp: 90, attack: 16, defense: 7, speed: 9.5, wage: 9 },
};

function troopUpgradeXpForTier(tier: number): number {
  switch (tier) {
    case 1: return 50;
    case 2: return 100;
    case 3: return 200;
    case 4: return 350;
    case 5: return 500;
    default: return 0;
  }
}

function troopUpgradeGoldForTier(tier: number): number {
  switch (tier) {
    case 1: return 20;
    case 2: return 40;
    case 3: return 80;
    case 4: return 120;
    case 5: return 200;
    default: return 0;
  }
}

function makeTroopDefinition(options: {
  culture: FactionId;
  suffix: string;
  name: string;
  tier: number;
  battleClass: UnitTierId;
  upgrades: string[];
  horseRequirement?: TroopDefinition['horseRequirement'];
  isNobleLine?: boolean;
  isMounted?: boolean;
}): TroopDefinition {
  const base = TROOP_CLASS_BASE[options.battleClass];
  const tierSteps = Math.max(0, options.tier - 1);
  return {
    id: `${options.culture}_${options.suffix}`,
    culture: options.culture,
    name: options.name,
    tier: options.tier,
    battleClass: options.battleClass,
    wage: base.wage + tierSteps * 2,
    upgradeXp: troopUpgradeXpForTier(options.tier),
    upgradeGold: troopUpgradeGoldForTier(options.tier),
    horseRequirement: options.horseRequirement ?? 'NONE',
    upgrades: options.upgrades,
    isNobleLine: options.isNobleLine ?? false,
    isMounted: options.isMounted ?? false,
    maxHp: base.hp + tierSteps * 12,
    attack: base.attack + tierSteps * 4,
    defense: base.defense + tierSteps * 3,
    speed: Math.round((base.speed + tierSteps * 0.15) * 10) / 10,
  };
}

/**
 * 10.9 — gerçek kültür birlik ağaçları (Bannerlord vanilla).
 *
 * Her kültürde iki kök vardır: T1 halk kökü (acemi) ve T2 soylu kökü.
 * Halk hatları T5'te, soylu hatlar T6'da biter. Sınıf dağılımı kültürün
 * karakteridir: Batanya'da halk okçusu yoktur (okçu soylu Fian hattıdır),
 * Vlandiya/Sturgiya/Batanya'da atlı okçu yoktur. Terfi bağlantıları tekil
 * birlik sayfalarından doğrulandı (GamerGuides/Fandom "Upgrades to/via").
 * `bandits` sadeleştirilmiş uyarlama, `player` genel yedek ağaçtır.
 */
interface TroopSpec {
  suffix: string;
  name: string;
  tier: number;
  battleClass: UnitTierId;
  upgrades: string[];
  noble?: boolean;
  horse?: boolean;
}

const TROOP_TREES: Record<FactionId, TroopSpec[]> = {
  empire: [
    { suffix: 'recruit', name: 'İmparatorluk Acemi', tier: 1, battleClass: 'infantry', upgrades: ['infantry_2', 'archer_2'] },
    { suffix: 'infantry_2', name: 'İmparatorluk Piyadesi', tier: 2, battleClass: 'infantry', upgrades: ['infantry_3'] },
    { suffix: 'infantry_3', name: 'İmparatorluk Eğitimli Piyadesi', tier: 3, battleClass: 'infantry', upgrades: ['infantry_4', 'menavliaton_4'] },
    { suffix: 'infantry_4', name: 'İmparatorluk Kıdemli Piyadesi', tier: 4, battleClass: 'infantry', upgrades: ['legionary_5'] },
    { suffix: 'legionary_5', name: 'İmparatorluk Lejyoneri', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'menavliaton_4', name: 'İmparatorluk Menavliatonu', tier: 4, battleClass: 'infantry', upgrades: ['menavliaton_5'] },
    { suffix: 'menavliaton_5', name: 'İmparatorluk Seçkin Menavliatonu', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'archer_2', name: 'İmparatorluk Okçusu', tier: 2, battleClass: 'archer', upgrades: ['archer_3'] },
    { suffix: 'archer_3', name: 'İmparatorluk Eğitimli Okçusu', tier: 3, battleClass: 'archer', upgrades: ['archer_4', 'crossbow_4'] },
    { suffix: 'archer_4', name: 'İmparatorluk Kıdemli Okçusu', tier: 4, battleClass: 'archer', upgrades: ['palatine_5', 'bucellarii_5'] },
    { suffix: 'palatine_5', name: 'İmparatorluk Palatin Muhafızı', tier: 5, battleClass: 'archer', upgrades: [] },
    { suffix: 'bucellarii_5', name: 'İmparatorluk Bukelları', tier: 5, battleClass: 'horseArcher', upgrades: [], horse: true },
    { suffix: 'crossbow_4', name: 'İmparatorluk Arbaletçisi', tier: 4, battleClass: 'archer', upgrades: ['crossbow_5'] },
    { suffix: 'crossbow_5', name: 'İmparatorluk Çavuş Arbaletçisi', tier: 5, battleClass: 'archer', upgrades: [] },
    { suffix: 'vigla_2', name: 'İmparatorluk Vigla Acemi', tier: 2, battleClass: 'cavalry', upgrades: ['equite_3'], noble: true, horse: true },
    { suffix: 'equite_3', name: 'İmparatorluk Ekvitesi', tier: 3, battleClass: 'cavalry', upgrades: ['horseman_4'], noble: true, horse: true },
    { suffix: 'horseman_4', name: 'İmparatorluk Ağır Süvarisi', tier: 4, battleClass: 'cavalry', upgrades: ['cataphract_5'], noble: true, horse: true },
    { suffix: 'cataphract_5', name: 'İmparatorluk Katafraktı', tier: 5, battleClass: 'cavalry', upgrades: ['cataphract_6'], noble: true, horse: true },
    { suffix: 'cataphract_6', name: 'İmparatorluk Seçkin Katafraktı', tier: 6, battleClass: 'cavalry', upgrades: [], noble: true, horse: true },
  ],
  vlandia: [
    { suffix: 'recruit', name: 'Vlandiya Acemi', tier: 1, battleClass: 'infantry', upgrades: ['crossbow_2', 'footman_2'] },
    { suffix: 'crossbow_2', name: 'Vlandiya Görevli Arbaletçisi', tier: 2, battleClass: 'archer', upgrades: ['crossbow_3'] },
    { suffix: 'crossbow_3', name: 'Vlandiya Arbaletçisi', tier: 3, battleClass: 'archer', upgrades: ['crossbow_4'] },
    { suffix: 'crossbow_4', name: 'Vlandiya Sertleşmiş Arbaletçisi', tier: 4, battleClass: 'archer', upgrades: ['sharpshooter_5'] },
    { suffix: 'sharpshooter_5', name: 'Vlandiya Keskin Nişancısı', tier: 5, battleClass: 'archer', upgrades: [] },
    { suffix: 'footman_2', name: 'Vlandiya Yaya Askeri', tier: 2, battleClass: 'infantry', upgrades: ['spearman_3', 'infantry_3'] },
    { suffix: 'spearman_3', name: 'Vlandiya Mızrakçısı', tier: 3, battleClass: 'infantry', upgrades: ['billman_4'] },
    { suffix: 'billman_4', name: 'Vlandiya Kancalı Mızrakçısı', tier: 4, battleClass: 'infantry', upgrades: ['voulgier_5', 'pikeman_5'] },
    { suffix: 'voulgier_5', name: 'Vlandiya Vujiyesi', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'pikeman_5', name: 'Vlandiya Kargıcısı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'infantry_3', name: 'Vlandiya Piyadesi', tier: 3, battleClass: 'infantry', upgrades: ['swordsman_4', 'lightcav_4'] },
    { suffix: 'swordsman_4', name: 'Vlandiya Kılıççısı', tier: 4, battleClass: 'infantry', upgrades: ['sergeant_5'] },
    { suffix: 'sergeant_5', name: 'Vlandiya Çavuşu', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'lightcav_4', name: 'Vlandiya Hafif Süvarisi', tier: 4, battleClass: 'cavalry', upgrades: ['vanguard_5'], horse: true },
    { suffix: 'vanguard_5', name: 'Vlandiya Öncüsü', tier: 5, battleClass: 'cavalry', upgrades: [], horse: true },
    { suffix: 'squire_2', name: 'Vlandiya Şövalye Çırağı', tier: 2, battleClass: 'cavalry', upgrades: ['gallant_3'], noble: true, horse: true },
    { suffix: 'gallant_3', name: 'Vlandiya Yiğidi', tier: 3, battleClass: 'cavalry', upgrades: ['knight_4'], noble: true, horse: true },
    { suffix: 'knight_4', name: 'Vlandiya Şövalyesi', tier: 4, battleClass: 'cavalry', upgrades: ['champion_5'], noble: true, horse: true },
    { suffix: 'champion_5', name: 'Vlandiya Şampiyonu', tier: 5, battleClass: 'cavalry', upgrades: ['bannerknight_6'], noble: true, horse: true },
    { suffix: 'bannerknight_6', name: 'Vlandiya Sancak Şövalyesi', tier: 6, battleClass: 'cavalry', upgrades: [], noble: true, horse: true },
  ],
  battania: [
    { suffix: 'volunteer', name: 'Battaniya Gönüllüsü', tier: 1, battleClass: 'infantry', upgrades: ['clanwarrior_2', 'woodrunner_2'] },
    { suffix: 'clanwarrior_2', name: 'Battaniya Klan Savaşçısı', tier: 2, battleClass: 'infantry', upgrades: ['trained_3'] },
    { suffix: 'trained_3', name: 'Battaniya Eğitimli Savaşçısı', tier: 3, battleClass: 'infantry', upgrades: ['picked_4', 'scout_4'] },
    { suffix: 'picked_4', name: 'Battaniya Seçme Savaşçısı', tier: 4, battleClass: 'infantry', upgrades: ['oathsworn_5'] },
    { suffix: 'oathsworn_5', name: 'Battaniya Yeminli Savaşçısı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'scout_4', name: 'Battaniya Gözcüsü', tier: 4, battleClass: 'cavalry', upgrades: ['horseman_5'], horse: true },
    { suffix: 'horseman_5', name: 'Battaniya Süvarisi', tier: 5, battleClass: 'cavalry', upgrades: [], horse: true },
    { suffix: 'woodrunner_2', name: 'Battaniya Orman Koşucusu', tier: 2, battleClass: 'infantry', upgrades: ['raider_3', 'skirmisher_3'] },
    { suffix: 'raider_3', name: 'Battaniya Yağmacısı', tier: 3, battleClass: 'infantry', upgrades: ['falxman_4'] },
    { suffix: 'falxman_4', name: 'Battaniya Falkçısı', tier: 4, battleClass: 'infantry', upgrades: ['falxman_5'] },
    { suffix: 'falxman_5', name: 'Battaniya Kıdemli Falkçısı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'skirmisher_3', name: 'Battaniya Avcı Eri', tier: 3, battleClass: 'infantry', upgrades: ['skirmisher_4'] },
    { suffix: 'skirmisher_4', name: 'Battaniya Kıdemli Avcı Eri', tier: 4, battleClass: 'infantry', upgrades: ['wildling_5', 'mountedskirmisher_5'] },
    { suffix: 'wildling_5', name: 'Battaniya Yabanılı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'mountedskirmisher_5', name: 'Battaniya Atlı Avcı Eri', tier: 5, battleClass: 'cavalry', upgrades: [], horse: true },
    { suffix: 'highborn_2', name: 'Battaniya Asilzade Genci', tier: 2, battleClass: 'archer', upgrades: ['highborn_3'], noble: true },
    { suffix: 'highborn_3', name: 'Battaniya Asilzade Savaşçısı', tier: 3, battleClass: 'archer', upgrades: ['hero_4'], noble: true },
    { suffix: 'hero_4', name: 'Battaniya Kahramanı', tier: 4, battleClass: 'archer', upgrades: ['fian_5'], noble: true },
    { suffix: 'fian_5', name: 'Battaniya Fianı', tier: 5, battleClass: 'archer', upgrades: ['fian_6'], noble: true },
    { suffix: 'fian_6', name: 'Battaniya Fian Şampiyonu', tier: 6, battleClass: 'archer', upgrades: [], noble: true },
  ],
  sturgia: [
    { suffix: 'recruit', name: 'Sturgiya Acemi', tier: 1, battleClass: 'infantry', upgrades: ['warrior_2', 'woodsman_2'] },
    { suffix: 'warrior_2', name: 'Sturgiya Savaşçısı', tier: 2, battleClass: 'infantry', upgrades: ['soldier_3'] },
    { suffix: 'soldier_3', name: 'Sturgiya Askeri', tier: 3, battleClass: 'infantry', upgrades: ['spearman_4', 'linebreaker_4'] },
    { suffix: 'spearman_4', name: 'Sturgiya Mızrakçısı', tier: 4, battleClass: 'infantry', upgrades: ['heavyspear_5', 'heavyaxe_5'] },
    { suffix: 'heavyspear_5', name: 'Sturgiya Ağır Mızrakçısı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'heavyaxe_5', name: 'Sturgiya Ağır Baltacısı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'linebreaker_4', name: 'Sturgiya Hat Kıranı', tier: 4, battleClass: 'infantry', upgrades: ['linebreaker_5'] },
    { suffix: 'linebreaker_5', name: 'Sturgiya Kahraman Hat Kıranı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'woodsman_2', name: 'Sturgiya Ormancısı', tier: 2, battleClass: 'infantry', upgrades: ['hunter_3', 'brigand_3'] },
    { suffix: 'hunter_3', name: 'Sturgiya Avcısı', tier: 3, battleClass: 'archer', upgrades: ['archer_4'] },
    { suffix: 'archer_4', name: 'Sturgiya Okçusu', tier: 4, battleClass: 'archer', upgrades: ['bowman_5'] },
    { suffix: 'bowman_5', name: 'Sturgiya Kıdemli Okçusu', tier: 5, battleClass: 'archer', upgrades: [] },
    { suffix: 'brigand_3', name: 'Sturgiya Eşkıyası', tier: 3, battleClass: 'infantry', upgrades: ['brigand_4'] },
    { suffix: 'brigand_4', name: 'Sturgiya Sertleşmiş Eşkıyası', tier: 4, battleClass: 'cavalry', upgrades: ['horseraider_5'], horse: true },
    { suffix: 'horseraider_5', name: 'Sturgiya Atlı Yağmacısı', tier: 5, battleClass: 'cavalry', upgrades: [], horse: true },
    { suffix: 'warriorson_2', name: 'Sturgiya Savaşçı Oğlu', tier: 2, battleClass: 'infantry', upgrades: ['varyag_3'], noble: true },
    { suffix: 'varyag_3', name: 'Sturgiya Varyagi', tier: 3, battleClass: 'infantry', upgrades: ['varyagveteran_4'], noble: true },
    { suffix: 'varyagveteran_4', name: 'Sturgiya Kıdemli Varyagi', tier: 4, battleClass: 'cavalry', upgrades: ['druzhinnik_5'], noble: true, horse: true },
    { suffix: 'druzhinnik_5', name: 'Sturgiya Drujiniki', tier: 5, battleClass: 'cavalry', upgrades: ['druzhinnik_6'], noble: true, horse: true },
    { suffix: 'druzhinnik_6', name: 'Sturgiya Drujinik Şampiyonu', tier: 6, battleClass: 'cavalry', upgrades: [], noble: true, horse: true },
  ],
  khuzait: [
    { suffix: 'nomad', name: 'Kuzeyit Göçeri', tier: 1, battleClass: 'infantry', upgrades: ['footman_2', 'tribal_2'] },
    { suffix: 'footman_2', name: 'Kuzeyit Yaya Askeri', tier: 2, battleClass: 'infantry', upgrades: ['spearman_3', 'hunter_3'] },
    { suffix: 'spearman_3', name: 'Kuzeyit Mızrakçısı', tier: 3, battleClass: 'infantry', upgrades: ['spearinfantry_4'] },
    { suffix: 'spearinfantry_4', name: 'Kuzeyit Mızrak Piyadesi', tier: 4, battleClass: 'infantry', upgrades: ['darkhan_5'] },
    { suffix: 'darkhan_5', name: 'Kuzeyit Darhanı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'hunter_3', name: 'Kuzeyit Avcısı', tier: 3, battleClass: 'archer', upgrades: ['archer_4'] },
    { suffix: 'archer_4', name: 'Kuzeyit Okçusu', tier: 4, battleClass: 'archer', upgrades: ['marksman_5'] },
    { suffix: 'marksman_5', name: 'Kuzeyit Keskin Nişancısı', tier: 5, battleClass: 'archer', upgrades: [] },
    { suffix: 'tribal_2', name: 'Kuzeyit Kabile Savaşçısı', tier: 2, battleClass: 'horseArcher', upgrades: ['raider_3', 'horseman_3'], horse: true },
    { suffix: 'raider_3', name: 'Kuzeyit Yağmacısı', tier: 3, battleClass: 'horseArcher', upgrades: ['horsearcher_4'], horse: true },
    { suffix: 'horsearcher_4', name: 'Kuzeyit Atlı Okçusu', tier: 4, battleClass: 'horseArcher', upgrades: ['heavyhorsearcher_5'], horse: true },
    { suffix: 'heavyhorsearcher_5', name: 'Kuzeyit Ağır Atlı Okçusu', tier: 5, battleClass: 'horseArcher', upgrades: [], horse: true },
    { suffix: 'horseman_3', name: 'Kuzeyit Süvarisi', tier: 3, battleClass: 'cavalry', upgrades: ['lancer_4'], horse: true },
    { suffix: 'lancer_4', name: 'Kuzeyit Kargıcısı', tier: 4, battleClass: 'cavalry', upgrades: ['heavylancer_5'], horse: true },
    { suffix: 'heavylancer_5', name: 'Kuzeyit Ağır Kargıcısı', tier: 5, battleClass: 'cavalry', upgrades: [], horse: true },
    { suffix: 'noblesson_2', name: 'Kuzeyit Asilzade Oğlu', tier: 2, battleClass: 'horseArcher', upgrades: ['qanqli_3'], noble: true, horse: true },
    { suffix: 'qanqli_3', name: 'Kuzeyit Kanglısı', tier: 3, battleClass: 'horseArcher', upgrades: ['torguud_4'], noble: true, horse: true },
    { suffix: 'torguud_4', name: 'Kuzeyit Torgudu', tier: 4, battleClass: 'horseArcher', upgrades: ['kheshig_5'], noble: true, horse: true },
    { suffix: 'kheshig_5', name: 'Kuzeyit Keşiği', tier: 5, battleClass: 'horseArcher', upgrades: ['khansguard_6'], noble: true, horse: true },
    { suffix: 'khansguard_6', name: 'Kuzeyit Han Muhafızı', tier: 6, battleClass: 'horseArcher', upgrades: [], noble: true, horse: true },
  ],
  aserai: [
    { suffix: 'recruit', name: 'Aserai Acemi', tier: 1, battleClass: 'infantry', upgrades: ['tribesman_2', 'mamluke_2'] },
    { suffix: 'tribesman_2', name: 'Aserai Kabile Savaşçısı', tier: 2, battleClass: 'infantry', upgrades: ['footman_3', 'lightarcher_3'] },
    { suffix: 'footman_3', name: 'Aserai Yaya Askeri', tier: 3, battleClass: 'infantry', upgrades: ['infantry_4'] },
    { suffix: 'infantry_4', name: 'Aserai Piyadesi', tier: 4, battleClass: 'infantry', upgrades: ['infantry_5'] },
    { suffix: 'infantry_5', name: 'Aserai Kıdemli Piyadesi', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'lightarcher_3', name: 'Aserai Hafif Okçusu', tier: 3, battleClass: 'archer', upgrades: ['archer_4'] },
    { suffix: 'archer_4', name: 'Aserai Okçusu', tier: 4, battleClass: 'archer', upgrades: ['masterarcher_5'] },
    { suffix: 'masterarcher_5', name: 'Aserai Usta Okçusu', tier: 5, battleClass: 'archer', upgrades: [] },
    { suffix: 'mamluke_2', name: 'Aserai Memlük Askeri', tier: 2, battleClass: 'infantry', upgrades: ['mamlukeaxe_3', 'mamlukeregular_3'] },
    { suffix: 'mamlukeaxe_3', name: 'Aserai Memlük Baltacısı', tier: 3, battleClass: 'infantry', upgrades: ['mamlukeguard_4'] },
    { suffix: 'mamlukeguard_4', name: 'Aserai Memlük Muhafızı', tier: 4, battleClass: 'infantry', upgrades: ['mamlukepalace_5'] },
    { suffix: 'mamlukepalace_5', name: 'Aserai Memlük Saray Muhafızı', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'mamlukeregular_3', name: 'Aserai Nizami Memlüğü', tier: 3, battleClass: 'cavalry', upgrades: ['mamlukecavalry_4'], horse: true },
    { suffix: 'mamlukecavalry_4', name: 'Aserai Memlük Süvarisi', tier: 4, battleClass: 'horseArcher', upgrades: ['mamlukeheavy_5'], horse: true },
    { suffix: 'mamlukeheavy_5', name: 'Aserai Ağır Memlük Süvarisi', tier: 5, battleClass: 'horseArcher', upgrades: [], horse: true },
    { suffix: 'youth_2', name: 'Aserai Genci', tier: 2, battleClass: 'cavalry', upgrades: ['tribalhorseman_3'], noble: true, horse: true },
    { suffix: 'tribalhorseman_3', name: 'Aserai Kabile Süvarisi', tier: 3, battleClass: 'cavalry', upgrades: ['faris_4'], noble: true, horse: true },
    { suffix: 'faris_4', name: 'Aserai Farisi', tier: 4, battleClass: 'cavalry', upgrades: ['farisveteran_5'], noble: true, horse: true },
    { suffix: 'farisveteran_5', name: 'Aserai Kıdemli Farisi', tier: 5, battleClass: 'cavalry', upgrades: ['farisvanguard_6'], noble: true, horse: true },
    { suffix: 'farisvanguard_6', name: 'Aserai Öncü Farisi', tier: 6, battleClass: 'cavalry', upgrades: [], noble: true, horse: true },
  ],
  bandits: [
    { suffix: 'recruit', name: 'Haydut', tier: 1, battleClass: 'infantry', upgrades: ['infantry_2', 'archer_2'] },
    { suffix: 'infantry_2', name: 'Serseri', tier: 2, battleClass: 'infantry', upgrades: ['infantry_3', 'cavalry_3'] },
    { suffix: 'infantry_3', name: 'Eşkıya', tier: 3, battleClass: 'infantry', upgrades: ['boss_4'] },
    { suffix: 'boss_4', name: 'Haydut Reisi', tier: 4, battleClass: 'infantry', upgrades: [] },
    { suffix: 'archer_2', name: 'Pusucu', tier: 2, battleClass: 'archer', upgrades: ['archer_3'] },
    { suffix: 'archer_3', name: 'Orman Haydutu', tier: 3, battleClass: 'archer', upgrades: [] },
    { suffix: 'cavalry_3', name: 'Atlı Haydut', tier: 3, battleClass: 'cavalry', upgrades: [], horse: true },
  ],
  player: [
    { suffix: 'recruit', name: 'Sancak Acemi', tier: 1, battleClass: 'infantry', upgrades: ['infantry_2', 'archer_2'] },
    { suffix: 'infantry_2', name: 'Sancak Piyadesi', tier: 2, battleClass: 'infantry', upgrades: ['infantry_3', 'cavalry_3'] },
    { suffix: 'infantry_3', name: 'Sancak Eğitimli Piyadesi', tier: 3, battleClass: 'infantry', upgrades: ['infantry_4'] },
    { suffix: 'infantry_4', name: 'Sancak Kıdemli Piyadesi', tier: 4, battleClass: 'infantry', upgrades: ['infantry_5'] },
    { suffix: 'infantry_5', name: 'Sancak Lejyoneri', tier: 5, battleClass: 'infantry', upgrades: [] },
    { suffix: 'archer_2', name: 'Sancak Okçusu', tier: 2, battleClass: 'archer', upgrades: ['archer_3'] },
    { suffix: 'archer_3', name: 'Sancak Eğitimli Okçusu', tier: 3, battleClass: 'archer', upgrades: ['archer_4', 'horsearcher_4'] },
    { suffix: 'archer_4', name: 'Sancak Kıdemli Okçusu', tier: 4, battleClass: 'archer', upgrades: ['archer_5'] },
    { suffix: 'archer_5', name: 'Sancak Usta Okçusu', tier: 5, battleClass: 'archer', upgrades: [] },
    { suffix: 'horsearcher_4', name: 'Sancak Atlı Okçusu', tier: 4, battleClass: 'horseArcher', upgrades: ['horsearcher_5'], horse: true },
    { suffix: 'horsearcher_5', name: 'Sancak Ağır Atlı Okçusu', tier: 5, battleClass: 'horseArcher', upgrades: [], horse: true },
    { suffix: 'cavalry_3', name: 'Sancak Süvarisi', tier: 3, battleClass: 'cavalry', upgrades: ['cavalry_4'], horse: true },
    { suffix: 'cavalry_4', name: 'Sancak Ağır Süvarisi', tier: 4, battleClass: 'cavalry', upgrades: ['cavalry_5'], horse: true },
    { suffix: 'cavalry_5', name: 'Sancak Seçkin Süvarisi', tier: 5, battleClass: 'cavalry', upgrades: [], horse: true },
  ],
};

function buildCultureTree(culture: FactionId): TroopDefinition[] {
  const specs = TROOP_TREES[culture] ?? [];
  const bySuffix = new Map(specs.map((spec) => [spec.suffix, spec]));
  const parentOf = new Map<string, TroopSpec>();
  for (const spec of specs) {
    for (const target of spec.upgrades) parentOf.set(target, spec);
  }
  return specs.map((spec) => {
    const parent = parentOf.get(spec.suffix);
    // Ata ilk kez binen birlik at ister; T4/T6 atlıları savaş atı ister.
    let horseRequirement: TroopDefinition['horseRequirement'] = 'NONE';
    if (spec.horse && parent) {
      if (!parent.horse) horseRequirement = 'HORSE';
      else if (spec.tier === 4 || spec.tier === 6) horseRequirement = 'WAR_HORSE';
    }
    return makeTroopDefinition({
      culture,
      suffix: spec.suffix,
      name: spec.name,
      tier: spec.tier,
      battleClass: spec.battleClass,
      upgrades: spec.upgrades.map((suffix) => `${culture}_${suffix}`),
      horseRequirement,
      isNobleLine: Boolean(spec.noble),
      isMounted: Boolean(spec.horse),
    });
  });
}

export const TROOP_DEFINITIONS: readonly TroopDefinition[] = (
  Object.keys(CULTURE_TROOPS) as FactionId[]
).flatMap(buildCultureTree);
export const TROOP_DEFINITION_BY_ID: ReadonlyMap<string, TroopDefinition> = new Map(
  TROOP_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function getTroopDefinition(troopId: string): TroopDefinition | null {
  return (
    TROOP_DEFINITION_BY_ID.get(troopId) ??
    TROOP_DEFINITION_BY_ID.get(migrateLegacyTroopId(troopId)) ??
    null
  );
}

/** Kültürde sınıfın temsili orta kademe birliği (eski sınıf-temelli çağrılar için). */
export function legacyTroopIdForClass(
  battleClass: UnitTierId,
  culture: FactionId = 'player',
): string {
  const byClass = TROOP_DEFINITIONS.filter(
    (def) => def.culture === culture && def.battleClass === battleClass,
  );
  // Halk hattı yeğlenir; sınıf yalnız soylu hatta varsa (örn. Batanya okçusu
  // Fian hattı) soylu temsilci kullanılır.
  const candidates = byClass.filter((def) => !def.isNobleLine);
  const pool = candidates.length > 0 ? candidates : byClass;
  if (pool.length > 0) {
    const sorted = [...pool].sort((a, b) => a.tier - b.tier);
    return (sorted.find((def) => def.tier >= 3) ?? sorted[sorted.length - 1]).id;
  }
  // Kültürde bu sınıf yoksa (örn. Vlandiya atlı okçusu) kültür köküne düş.
  const root = TROOP_DEFINITIONS.find((def) => def.culture === culture && def.tier === 1);
  return root?.id ?? 'player_recruit';
}

const LEGACY_TROOP_ID_PATTERN =
  /^(player|empire|vlandia|battania|sturgia|khuzait|aserai|bandits)_(recruit|infantry|archer|cavalry|guard)(?:_(\d+))?$/;

/**
 * 10.9 öncesi sahte ağaç kimliklerinin (`kültür_sınıf_kademe`) yeni ağaçlara
 * göçü: eski `guard` seçkin piyadeydi, piyadeye gider; kademe korunur,
 * halk hattında aynı kademedeki ilk birlik seçilir.
 */
export function migrateLegacyTroopId(troopId: string): string {
  if (TROOP_DEFINITION_BY_ID.has(troopId)) return troopId;
  const match = LEGACY_TROOP_ID_PATTERN.exec(troopId);
  if (!match) return troopId;
  const culture = match[1] as FactionId;
  const legacyClass = match[2];
  const tier = match[3] ? Number(match[3]) : 1;
  if (legacyClass === 'recruit' || tier <= 1) {
    return TROOP_DEFINITIONS.find((def) => def.culture === culture && def.tier === 1)?.id ?? troopId;
  }
  const battleClass: UnitTierId =
    legacyClass === 'archer' ? 'archer' : legacyClass === 'cavalry' ? 'cavalry' : 'infantry';
  const candidates = TROOP_DEFINITIONS.filter(
    (def) => def.culture === culture && def.battleClass === battleClass && !def.isNobleLine,
  );
  if (candidates.length === 0) {
    return TROOP_DEFINITIONS.find((def) => def.culture === culture && def.tier === 1)?.id ?? troopId;
  }
  const exact = candidates.find((def) => def.tier === tier);
  if (exact) return exact.id;
  const sorted = [...candidates].sort((a, b) => a.tier - b.tier);
  return (sorted.filter((def) => def.tier < tier).pop() ?? sorted[0]).id;
}

/** Ağaç bütünlüğü: tekrarlanan kimlik, kopuk terfi, kademe sıçraması ve kökten erişilemeyen birlik olmamalı. */
export function validateTroopDefinitions(
  definitions: readonly TroopDefinition[] = TROOP_DEFINITIONS,
): string[] {
  const errors: string[] = [];
  const byId = new Map<string, TroopDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) errors.push(`Tekrarlanan birlik kimliği: ${definition.id}`);
    byId.set(definition.id, definition);
  }
  const hasParent = new Set<string>();
  for (const definition of definitions) {
    for (const upgradeId of definition.upgrades) hasParent.add(upgradeId);
  }
  for (const definition of definitions) {
    for (const upgradeId of definition.upgrades) {
      const target = byId.get(upgradeId);
      if (!target) errors.push(`${definition.id} bilinmeyen hedefe terfi ediyor: ${upgradeId}`);
      else if (target.culture !== definition.culture) errors.push(`${definition.id} kültür dışı hedefe terfi ediyor: ${upgradeId}`);
      else if (target.tier !== definition.tier + 1) errors.push(`${definition.id} kademe atlayarak terfi ediyor: ${upgradeId}`);
      else if (target.isNobleLine !== definition.isNobleLine) errors.push(`${definition.id} hat değiştirerek terfi ediyor: ${upgradeId}`);
    }
    if (definition.tier < 1 || definition.tier > 6) {
      errors.push(`Geçersiz kademe: ${definition.id} (T${definition.tier})`);
    }
    const isRoot = !hasParent.has(definition.id);
    if (isRoot && !((definition.tier === 1 && !definition.isNobleLine) || (definition.tier === 2 && definition.isNobleLine))) {
      errors.push(`Kök olmayan birlik terfi kaynağısız: ${definition.id}`);
    }
    if (!isRoot && definition.tier === 1) {
      errors.push(`T1 birlik terfi hedefi olamaz: ${definition.id}`);
    }
    if (definition.tier >= 6 && definition.upgrades.length > 0) {
      errors.push(`Son kademe (T6) birlik terfi içeriyor: ${definition.id}`);
    }
  }
  return errors;
}

export function troopStackTotals(stacks: TroopStack[] | undefined): TroopRoster {
  const totals: TroopRoster = { infantry: 0, archer: 0, cavalry: 0, horseArcher: 0 };
  for (const stack of stacks ?? []) {
    const definition = getTroopDefinition(stack.troopId);
    if (!definition) continue;
    totals[definition.battleClass] += Math.max(0, Math.floor(finiteNumber(stack.count, 0)));
  }
  return totals;
}

export function troopStackTotal(stacks: TroopStack[] | undefined): number {
  return (stacks ?? []).reduce((sum, stack) => sum + Math.max(0, Math.floor(finiteNumber(stack.count, 0))), 0);
}

export function troopStackWoundedTotal(stacks: TroopStack[] | undefined): number {
  return (stacks ?? []).reduce((sum, stack) => {
    const count = Math.max(0, Math.floor(finiteNumber(stack.count, 0)));
    return sum + Math.min(count, Math.max(0, Math.floor(finiteNumber(stack.wounded, 0))));
  }, 0);
}

export function prisonerStackTotal(stacks: PrisonerStack[] | undefined): number {
  return (stacks ?? []).reduce((sum, stack) => sum + Math.max(0, Math.floor(finiteNumber(stack.count, 0))), 0);
}

function sanitizeRoster(roster: TroopRoster | undefined): TroopRoster {
  // 10.9 göçü: eski kayıtlardaki `militia` (piyade) ve `guard` (seçkin piyade)
  // alanları piyade sınıfında birleştirilir; asker kaybı olmaz.
  const legacy = (roster ?? {}) as Record<string, unknown>;
  return {
    infantry:
      positiveInt(roster?.infantry) +
      positiveInt(legacy.militia as number) +
      positiveInt(legacy.guard as number),
    archer: positiveInt(roster?.archer),
    cavalry: positiveInt(roster?.cavalry),
    horseArcher: positiveInt(roster?.horseArcher),
  };
}

function capTroopStackXp(stack: TroopStack): TroopStack {
  const definition = getTroopDefinition(stack.troopId);
  if (!definition || definition.upgrades.length === 0) return { ...stack, xp: 0 };
  return { ...stack, xp: Math.min(Math.max(0, finiteNumber(stack.xp, 0)), stack.count * definition.upgradeXp) };
}

function sanitizeTroopStacks(rawStacks: TroopStack[] | undefined): TroopStack[] {
  const byId = new Map<string, TroopStack>();
  for (const raw of rawStacks ?? []) {
    if (!raw || typeof raw !== 'object' || typeof raw.troopId !== 'string') continue;
    const troopId = migrateLegacyTroopId(raw.troopId);
    if (!getTroopDefinition(troopId)) continue;
    const count = positiveInt(raw.count);
    if (count <= 0) continue;
    const current = byId.get(troopId);
    const merged: TroopStack = {
      troopId,
      count: (current?.count ?? 0) + count,
      wounded: (current?.wounded ?? 0) + Math.min(count, positiveInt(raw.wounded)),
      xp: (current?.xp ?? 0) + Math.max(0, finiteNumber(raw.xp, 0)),
    };
    merged.wounded = Math.min(merged.count, merged.wounded);
    byId.set(troopId, capTroopStackXp(merged));
  }
  return [...byId.values()];
}

function sortTroopStacks(stacks: TroopStack[]): TroopStack[] {
  return stacks
    .filter((stack) => stack.count > 0)
    .sort((a, b) => {
      const defA = getTroopDefinition(a.troopId);
      const defB = getTroopDefinition(b.troopId);
      return (
        (defA?.culture ?? '').localeCompare(defB?.culture ?? '') ||
        (defA?.tier ?? 0) - (defB?.tier ?? 0) ||
        a.troopId.localeCompare(b.troopId)
      );
    });
}

function reconcileTroopStacks(rawStacks: TroopStack[] | undefined, desired: TroopRoster): TroopStack[] {
  const stacks = sanitizeTroopStacks(rawStacks);
  if (stacks.length === 0) {
    (Object.keys(desired) as UnitTierId[]).forEach((battleClass) => {
      if (desired[battleClass] > 0) {
        stacks.push({
          troopId: legacyTroopIdForClass(battleClass),
          count: desired[battleClass],
          wounded: 0,
          xp: 0,
        });
      }
    });
    return sortTroopStacks(stacks);
  }

  (Object.keys(desired) as UnitTierId[]).forEach((battleClass) => {
    let total = stacks
      .filter((stack) => getTroopDefinition(stack.troopId)?.battleClass === battleClass)
      .reduce((sum, stack) => sum + stack.count, 0);

    if (total > desired[battleClass]) {
      let excess = total - desired[battleClass];
      const candidates = stacks
        .filter((stack) => getTroopDefinition(stack.troopId)?.battleClass === battleClass)
        .sort((a, b) => (getTroopDefinition(a.troopId)?.tier ?? 0) - (getTroopDefinition(b.troopId)?.tier ?? 0));
      for (const stack of candidates) {
        if (excess <= 0) break;
        const removed = Math.min(excess, stack.count);
        const oldCount = stack.count;
        stack.count -= removed;
        stack.wounded = Math.min(stack.wounded, stack.count);
        stack.xp = oldCount > 0 ? Math.floor((stack.xp * stack.count) / oldCount) : 0;
        Object.assign(stack, capTroopStackXp(stack));
        excess -= removed;
      }
      total = desired[battleClass];
    }

    if (total < desired[battleClass]) {
      const representativeId = legacyTroopIdForClass(battleClass);
      const representative = stacks.find((stack) => stack.troopId === representativeId);
      if (representative) representative.count += desired[battleClass] - total;
      else {
        stacks.push({
          troopId: representativeId,
          count: desired[battleClass] - total,
          wounded: 0,
          xp: 0,
        });
      }
    }
  });

  return sortTroopStacks(stacks.map(capTroopStackXp));
}

function sanitizePrisonerStacks(rawStacks: PrisonerStack[] | undefined): PrisonerStack[] {
  const byId = new Map<string, PrisonerStack>();
  for (const raw of rawStacks ?? []) {
    if (!raw || typeof raw !== 'object' || typeof raw.troopId !== 'string') continue;
    const troopId = migrateLegacyTroopId(raw.troopId);
    if (!getTroopDefinition(troopId)) continue;
    const count = positiveInt(raw.count);
    if (count <= 0) continue;
    const current = byId.get(troopId);
    const merged: PrisonerStack = {
      troopId: raw.troopId,
      count: (current?.count ?? 0) + count,
      ready: (current?.ready ?? 0) + Math.min(count, positiveInt(raw.ready)),
      readinessProgress: clampNumber(raw.readinessProgress, 0, 0.999, current?.readinessProgress ?? 0),
    };
    merged.ready = Math.min(merged.count, merged.ready);
    byId.set(raw.troopId, merged);
  }
  return [...byId.values()];
}

function reconcilePrisonerStacks(rawStacks: PrisonerStack[] | undefined, desiredTotal: number): PrisonerStack[] {
  const stacks = sanitizePrisonerStacks(rawStacks);
  let total = prisonerStackTotal(stacks);

  if (total > desiredTotal) {
    let excess = total - desiredTotal;
    const candidates = [...stacks].sort((a, b) => b.count - a.count || a.troopId.localeCompare(b.troopId));
    for (const stack of candidates) {
      if (excess <= 0) break;
      const unready = stack.count - stack.ready;
      const removeUnready = Math.min(excess, unready);
      stack.count -= removeUnready;
      excess -= removeUnready;
      if (excess > 0) {
        const removeReady = Math.min(excess, stack.ready);
        stack.ready -= removeReady;
        stack.count -= removeReady;
        excess -= removeReady;
      }
    }
    total = desiredTotal;
  }

  if (total < desiredTotal) {
    const fallbackId = 'bandits_recruit';
    const fallback = stacks.find((stack) => stack.troopId === fallbackId);
    if (fallback) fallback.count += desiredTotal - total;
    else {
      stacks.push({
        troopId: fallbackId,
        count: desiredTotal - total,
        ready: 0,
        readinessProgress: 0,
      });
    }
  }

  return stacks
    .filter((stack) => stack.count > 0)
    .sort((a, b) => a.troopId.localeCompare(b.troopId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Karakter gelişimi ve Discard hesap sözleşmeleri (P2/P4 bunları kullanır)
// ─────────────────────────────────────────────────────────────────────────────

export function calculateLearningSoftCap(attributeValue: number, focusPoints: number): number {
  const attribute = clampInt(attributeValue, 1, 10, 1);
  const focus = clampInt(focusPoints, 0, 5, 0);
  return (attribute - 1) * 10 + focus * 30;
}

export function calculateLearningHardCap(attributeValue: number, focusPoints: number): number {
  const attribute = clampInt(attributeValue, 1, 10, 1);
  const focus = clampInt(focusPoints, 0, 5, 0);
  return 4 + (attribute - 1) * 14 + focus * 40;
}

export const DISCARD_DONATION_VALUE_RATIO = 0.5;
export const DISCARD_XP_CAP_TIER_0 = 35;
export const DISCARD_PERKS = {
  ARMOR: { id: 'paid_in_promise', skill: 'steward' as BannerlordSkillId, requiredLevel: 100 },
  WEAPON: { id: 'giving_hands', skill: 'steward' as BannerlordSkillId, requiredLevel: 125 },
} as const;

export function discardXpCapForTier(tier: number): number {
  const safeTier = clampInt(tier, 0, 6, 1);
  if (safeTier === 0) return DISCARD_XP_CAP_TIER_0;
  if (safeTier === 1) return 75;
  if (safeTier === 2) return 150;
  if (safeTier === 3) return 250;
  return 300;
}

export function itemDiscardXpPerUnit(definition: ItemDefinition): number {
  if (!definition.donationKind) return 0;
  return Math.floor(
    Math.min(
      Math.max(0, definition.baseValue) * DISCARD_DONATION_VALUE_RATIO,
      discardXpCapForTier(definition.tier),
    ),
  );
}

export interface DiscardEligibility {
  eligible: boolean;
  donationKind: DonationKind | null;
  requiredPerkId: string | null;
  hero: CampaignHero | null;
  reason: string;
}

export function discardEligibility(
  state: Pick<CampaignState, 'heroes' | 'roleAssignments'>,
  definition: ItemDefinition,
): DiscardEligibility {
  const hero = getRoleHero(state, 'QUARTERMASTER');
  if (!definition.donationKind) {
    return {
      eligible: false,
      donationKind: null,
      requiredPerkId: null,
      hero,
      reason: 'Bu eşya türü bağış XP’si vermez.',
    };
  }
  const requirement = DISCARD_PERKS[definition.donationKind];
  if (!hero) {
    return {
      eligible: false,
      donationKind: definition.donationKind,
      requiredPerkId: requirement.id,
      hero: null,
      reason: 'Atanmış bir İaşeci bulunamadı.',
    };
  }
  const stewardLevel = hero.skills[requirement.skill]?.level ?? 0;
  const hasPerk = hero.perks.includes(requirement.id);
  if (stewardLevel < requirement.requiredLevel || !hasPerk) {
    return {
      eligible: false,
      donationKind: definition.donationKind,
      requiredPerkId: requirement.id,
      hero,
      reason: `İaşeci için İdare ${requirement.requiredLevel} ve ${requirement.id} perki gerekir.`,
    };
  }
  return {
    eligible: true,
    donationKind: definition.donationKind,
    requiredPerkId: requirement.id,
    hero,
    reason: 'Bağış XP’si için uygun.',
  };
}

export function discardCapacityXp(state: Pick<CampaignState, 'troopStacks' | 'roster'>): number {
  const stacks = state.troopStacks?.length
    ? sanitizeTroopStacks(state.troopStacks)
    : reconcileTroopStacks(undefined, sanitizeRoster(state.roster));
  return stacks.reduce((sum, stack) => {
    const definition = getTroopDefinition(stack.troopId);
    if (!definition || definition.upgrades.length === 0) return sum;
    return sum + Math.max(0, stack.count * definition.upgradeXp - stack.xp);
  }, 0);
}

export interface DiscardSelection {
  definitionId: string;
  quantity: number;
}

export interface DiscardPreviewLine {
  definition: ItemDefinition;
  quantity: number;
  xpPerUnit: number;
  totalXp: number;
  eligible: boolean;
  reason: string;
}

export interface DiscardPreview {
  lines: DiscardPreviewLine[];
  grossXp: number;
  capacityXp: number;
  acceptedXp: number;
  overflowXp: number;
  exceedsCapacity: boolean;
}

export function previewDiscardDonation(
  state: Pick<CampaignState, 'customItemDefinitions' | 'heroes' | 'roleAssignments' | 'troopStacks' | 'roster'>,
  selections: DiscardSelection[],
): DiscardPreview {
  const lines: DiscardPreviewLine[] = [];
  for (const selection of selections) {
    const definition = resolveItemDefinition(state, selection.definitionId);
    if (!definition) continue;
    const quantity = Math.max(0, Math.floor(finiteNumber(selection.quantity, 0)));
    if (quantity <= 0) continue;
    const eligibility = discardEligibility(state, definition);
    const xpPerUnit = eligibility.eligible ? itemDiscardXpPerUnit(definition) : 0;
    lines.push({
      definition,
      quantity,
      xpPerUnit,
      totalXp: xpPerUnit * quantity,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    });
  }
  const grossXp = lines.reduce((sum, line) => sum + line.totalXp, 0);
  const capacityXp = discardCapacityXp(state);
  const acceptedXp = Math.min(grossXp, capacityXp);
  return {
    lines,
    grossXp,
    capacityXp,
    acceptedXp,
    overflowXp: Math.max(0, grossXp - acceptedXp),
    exceedsCapacity: grossXp > capacityXp,
  };
}

export interface DiscardStackSelection {
  stackId: string;
  quantity: number;
}

export interface DiscardDistributionLine {
  troopId: string;
  xpBefore: number;
  xpApplied: number;
  xpAfter: number;
  capacityBefore: number;
}

export interface ApplyDiscardResult {
  success: boolean;
  reason?: string;
  nextState: CampaignState;
  preview: DiscardPreview;
  distribution: DiscardDistributionLine[];
  removedSelections: DiscardStackSelection[];
}

const EMPTY_DISCARD_PREVIEW: DiscardPreview = {
  lines: [],
  grossXp: 0,
  capacityXp: 0,
  acceptedXp: 0,
  overflowXp: 0,
  exceedsCapacity: false,
};

/**
 * Discard seçimini gerçekten uygular: kilitsiz yığınlardan adet düşer ve
 * uygun perk varsa XP'yi, yalnız bir sonraki kademeye ilerleyebilen birlik
 * yığınlarının kalan kapasitesi kadar dağıtır. Taşan XP Bannerlord'daki gibi
 * boşa gider. Herhangi bir seçim geçersizse hiçbir alan değişmez.
 */
export function applyDiscardDonation(
  state: CampaignState,
  selections: DiscardStackSelection[],
): ApplyDiscardResult {
  const fail = (reason: string, preview: DiscardPreview = EMPTY_DISCARD_PREVIEW): ApplyDiscardResult => ({
    success: false,
    reason,
    nextState: state,
    preview,
    distribution: [],
    removedSelections: [],
  });

  const aggregated = new Map<string, number>();
  for (const selection of selections) {
    const quantity = Math.floor(finiteNumber(selection.quantity, 0));
    if (!selection.stackId || quantity <= 0) return fail('Atılacak her yığının adedi en az 1 olmalıdır.');
    aggregated.set(selection.stackId, (aggregated.get(selection.stackId) ?? 0) + quantity);
  }
  if (aggregated.size === 0) return fail('Atılacak eşya seçilmedi.');

  const normalized = ensureBannerlordFoundation(state);
  const inventoryById = new Map((normalized.inventoryItems ?? []).map((item) => [item.id, item]));
  const definitionSelections = new Map<string, number>();

  for (const [stackId, quantity] of aggregated) {
    const stack = inventoryById.get(stackId);
    if (!stack) return fail('Atılacak eşyalardan biri envanterde bulunamadı.');
    if (stack.locked) return fail('Kilitli eşyalar atılamaz. Önce kilidini kaldır.');
    if (quantity > inventoryItemQuantity(stack)) {
      return fail(`"${stack.name}" yığınında yalnız ${inventoryItemQuantity(stack)} adet var.`);
    }
    const definitionId = stack.definitionId ?? stack.id;
    definitionSelections.set(definitionId, (definitionSelections.get(definitionId) ?? 0) + quantity);
  }

  const preview = previewDiscardDonation(
    normalized,
    [...definitionSelections].map(([definitionId, quantity]) => ({ definitionId, quantity })),
  );

  let remainingItems = normalized.inventoryItems ?? [];
  for (const [stackId, quantity] of aggregated) {
    const removal = removeInventoryStackQuantity(remainingItems, stackId, quantity);
    if (!removal.success) return fail(removal.reason ?? 'Eşya atılamadı.', preview);
    remainingItems = removal.items;
  }

  let xpLeft = preview.acceptedXp;
  const distribution: DiscardDistributionLine[] = [];
  const nextTroopStacks = sanitizeTroopStacks(normalized.troopStacks).map((stack) => {
    if (xpLeft <= 0) return stack;
    const definition = getTroopDefinition(stack.troopId);
    if (!definition || definition.upgrades.length === 0) return stack;
    const capacityBefore = Math.max(0, stack.count * definition.upgradeXp - stack.xp);
    const xpApplied = Math.min(xpLeft, capacityBefore);
    if (xpApplied <= 0) return stack;
    xpLeft -= xpApplied;
    const nextStack = { ...stack, xp: stack.xp + xpApplied };
    distribution.push({
      troopId: stack.troopId,
      xpBefore: stack.xp,
      xpApplied,
      xpAfter: nextStack.xp,
      capacityBefore,
    });
    return nextStack;
  });

  return {
    success: true,
    nextState: ensureBannerlordFoundation({
      ...normalized,
      inventoryItems: remainingItems,
      troopStacks: nextTroopStacks,
    }),
    preview,
    distribution,
    removedSelections: [...aggregated].map(([stackId, quantity]) => ({ stackId, quantity })),
  };
}

function sanitizeSettlementMarket(
  settlement: Settlement,
  validDefinitionIds: Set<string>,
): Settlement {
  const hasMarketFields =
    settlement.marketStock !== undefined ||
    settlement.merchantGold !== undefined ||
    settlement.visited !== undefined;
  if (!hasMarketFields) return settlement;

  const next: Settlement = {
    ...settlement,
    merchantGold:
      settlement.merchantGold === undefined
        ? undefined
        : clampInt(settlement.merchantGold, 0, 10_000_000, 0),
    visited: settlement.visited === undefined ? undefined : Boolean(settlement.visited),
  };

  // Yalnız ziyaret bilgisi yazılmış bir yerleşimde stok alanı uydurma `{}`a
  // dönüşmemeli; aksi hâlde ilk pazar başlatıcısı bunu gerçek stok sanır.
  if (settlement.marketStock && typeof settlement.marketStock === 'object') {
    const marketStock: Record<string, number> = {};
    for (const [definitionId, quantity] of Object.entries(settlement.marketStock)) {
      if (!validDefinitionIds.has(definitionId)) continue;
      marketStock[definitionId] = clampInt(quantity, 0, 9999, 0);
    }
    next.marketStock = marketStock;
  } else {
    delete next.marketStock;
  }

  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ana göç kapısı
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Herhangi bir eski/yeni kampanya durumunu P1 kanonik biçimine getirir.
 * Aynı girdiye ikinci kez uygulanması sonucu değiştirmez.
 */
export function ensureBannerlordFoundation(state: CampaignState): CampaignState {
  const customDefinitions = new Map<string, ItemDefinition>();
  for (const raw of state.customItemDefinitions ?? []) {
    const definition = sanitizeItemDefinition(raw);
    if (definition && !ITEM_DEFINITION_BY_ID.has(definition.id)) {
      customDefinitions.set(definition.id, definition);
    }
  }

  const inventoryItems = normalizeInventory(state.inventoryItems, customDefinitions);
  const { heroes, roleAssignments } = buildHeroes(state, customDefinitions);

  const usedCustomDefinitionIds = new Set<string>();
  for (const item of inventoryItems) {
    if (item.definitionId && customDefinitions.has(item.definitionId)) {
      usedCustomDefinitionIds.add(item.definitionId);
    }
  }
  for (const hero of heroes) {
    (Object.keys(hero.equipment) as EquipmentSetId[]).forEach((setId) => {
      for (const slot of EQUIPMENT_SLOTS) {
        const definitionId = hero.equipment[setId][slot];
        if (definitionId && customDefinitions.has(definitionId)) usedCustomDefinitionIds.add(definitionId);
      }
    });
  }

  const validDefinitionIds = new Set<string>([
    ...ITEM_DEFINITION_BY_ID.keys(),
    ...customDefinitions.keys(),
  ]);
  const settlements = (state.settlements ?? []).map((rawSettlement) => {
    const settlement = sanitizeSettlementMarket(rawSettlement, validDefinitionIds);
    const activeEngines = settlement.siegeEngines ?? [];
    const activeHp = settlement.siegeEngineHp ?? [];
    const hpByType = new Map<string, number[]>();
    activeEngines.forEach((engine, index) => {
      const value = activeHp[index];
      const hp = Math.round(Math.max(0, Math.min(100, Number.isFinite(value) ? value : 100)));
      const values = hpByType.get(engine) ?? [];
      values.push(hp);
      hpByType.set(engine, values);
    });
    const normalizedSlots = normalizeSiegeEngineSlots(
      activeEngines,
      settlement.reserveEngines ?? [],
    );
    const siegeEngineHp = normalizedSlots.siegeEngines.map(
      (engine) => hpByType.get(engine)?.shift() ?? 100,
    );
    const legacyWallHealth = settlement.wallHealth ?? 100;
    const wallSections: [number, number] = [
      settlement.wallSections?.[0] ?? legacyWallHealth,
      settlement.wallSections?.[1] ?? legacyWallHealth,
    ];
    return {
      ...setWallSections(settlement, wallSections),
      garrison: settlement.type === 'VILLAGE' ? 0 : settlement.garrison,
      siegeEngines: normalizedSlots.siegeEngines,
      reserveEngines: normalizedSlots.reserveEngines,
      siegeEngineHp,
    };
  });
  for (const settlement of settlements) {
    for (const definitionId of Object.keys(settlement.marketStock ?? {})) {
      if (customDefinitions.has(definitionId)) usedCustomDefinitionIds.add(definitionId);
    }
  }

  const roster = sanitizeRoster(state.roster);
  const prisoners = positiveInt(state.prisoners);

  const foodInInventory = getPartyFoodUnits(inventoryItems);
  const finalFood =
    foodInInventory > 0
      ? foodInInventory
      : Math.max(0, Math.floor(finiteNumber(state.food, 0)));

  return {
    ...state,
    settlements,
    roster,
    prisoners,
    food: finalFood,
    foundationVersion: FOUNDATION_VERSION,
    influence: Math.max(0, Math.floor(finiteNumber(state.influence, 0))),
    inventoryItems,
    heroes,
    roleAssignments,
    troopStacks: reconcileTroopStacks(state.troopStacks, roster),
    prisonerStacks: reconcilePrisonerStacks(state.prisonerStacks, prisoners),
    customItemDefinitions: [...usedCustomDefinitionIds]
      .map((definitionId) => customDefinitions.get(definitionId)!)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
