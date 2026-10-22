import {
  SETTLEMENT_TERRACES,
  distanceToRiverNetwork,
  groundHeightAt,
  registerSettlementTerrace,
} from './mapGen.ts';
import { snapToNearestLand } from './navigation.ts';
import { ensureNotables, type SettlementNotable } from './notables';
import { battleGoldReward, describeLoot, rollBattleLoot } from './loot';
import {
  CharacterMorphDNA,
  cloneDNA,
  getLordDNA,
  PLAYER_DEFAULT_DNA,
} from './characterMorph.ts';
import { generateLordParties } from './heroGen.ts';
import {
  addItemDefinitionToInventory,
  ensureBannerlordFoundation,
  equipInventoryItemForHero,
  PLAYER_HERO_ID,
} from './bannerlordFoundation';
import {
  advanceDailyPartyFood,
  calculateDailyFoodDemand,
} from './foodSystem.ts';

export type FactionId =
  | 'player'
  | 'vlandia'
  | 'battania'
  | 'sturgia'
  | 'empire'
  | 'khuzait'
  | 'aserai'
  | 'bandits';

export type UnitTierId = 'militia' | 'archer' | 'cavalry' | 'guard';

export type TacticalOrder = 'CHARGE' | 'SHIELD_WALL' | 'FOLLOW_ME' | 'HOLD_VOLLEY';

export interface UnitDefinition {
  id: UnitTierId;
  name: string;
  role: string;
  recruitCost: number;
  dailyWage: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  isRanged: boolean;
  isMounted: boolean;
  keyHint: string;
}

export interface TroopRoster {
  militia: number;
  archer: number;
  cavalry: number;
  guard: number;
}

export type BuildingProjectId =
  | 'FORTIFICATIONS'
  | 'GRANARY'
  | 'BARRACKS'
  | 'FAIRGROUNDS'
  | 'FORUM'
  | 'AQUEDUCTS';

export type SettlementDailyDefault = 'FESTIVAL' | 'IRRIGATION' | 'MILITIA' | 'HOUSING';

export type WorkshopTypeId = 'NONE' | 'BREWERY' | 'SMITHY' | 'OLIVE_PRESS' | 'WEAVERY';

export type SiegeEngineType =
  | 'TREBUCHET'
  | 'MANGONEL'
  | 'BALLISTA'
  | 'BATTERING_RAM'
  | 'SIEGE_TOWER';

export type AttributeId =
  | 'VIGOR'
  | 'CONTROL'
  | 'ENDURANCE'
  | 'CUNNING'
  | 'SOCIAL'
  | 'INTELLIGENCE';

export type BannerlordSkillId =
  | 'oneHanded'
  | 'twoHanded'
  | 'polearm'
  | 'bow'
  | 'crossbow'
  | 'throwing'
  | 'riding'
  | 'athletics'
  | 'smithing'
  | 'scouting'
  | 'tactics'
  | 'roguery'
  | 'charm'
  | 'leadership'
  | 'trade'
  | 'steward'
  | 'medicine'
  | 'engineering';

export type EquipmentSlotId =
  | 'HEAD'
  | 'SHOULDER'
  | 'BODY'
  | 'GLOVES'
  | 'LEG'
  | 'MOUNT'
  | 'HARNESS'
  | 'BANNER'
  | 'WEAPON1'
  | 'WEAPON2'
  | 'WEAPON3'
  | 'WEAPON4';

export type ClanRoleId = 'QUARTERMASTER' | 'SCOUT' | 'SURGEON' | 'ENGINEER';

export type ItemCategory = 'WEAPON' | 'SHIELD' | 'ARMOR' | 'FOOD' | 'HORSE' | 'TRADE';
export type DonationKind = 'ARMOR' | 'WEAPON';
export type HorseKind = 'NONE' | 'PACK' | 'RIDING' | 'WAR';

/** Serbest `statBonus` metninden ayrıştırılan sayısal eşya istatistikleri. */
export interface ItemStats {
  damage?: number;
  armorHead?: number;
  armorBody?: number;
  armorArm?: number;
  armorLeg?: number;
  armorMount?: number;
  shieldDurability?: number;
  block?: number;
  speed?: number;
  range?: number;
  ammo?: number;
  mountSpeed?: number;
  mountManeuver?: number;
  mountCharge?: number;
  mountHp?: number;
  foodAmount?: number;
  cargoCapacity?: number;
  moraleBonus?: number;
}

/** Katalogdaki veya eski kayıttan türetilmiş kalıcı eşya tanımı. */
export interface ItemDefinition {
  id: string;
  name: string;
  category: ItemCategory;
  slot: EquipmentSlotId | 'TRADE';
  baseValue: number;
  weight: number;
  tier: number;
  civilianLegal: boolean;
  icon: string;
  statBonus: string;
  stats: ItemStats;
  donationKind: DonationKind | null;
  horseKind: HorseKind;
}

/**
 * Envanter satırı artık tek eşya değil, bir tanımın adetli yığınıdır.
 * `id` geriye uyumlu yığın kimliği, `definitionId` kalıcı eşya kimliğidir.
 * `value` ve `weight` **birim** değerlerdir; toplam için `quantity` ile çarpılır.
 */
export interface InventoryItem {
  id: string;
  definitionId?: string;
  name: string;
  slot: EquipmentSlotId | 'TRADE';
  category?: ItemCategory;
  quantity?: number;
  locked?: boolean;
  value: number;
  weight: number;
  statBonus: string;
  stats?: ItemStats;
  civilianLegal: boolean;
  icon?: string;
  tier?: number;
}

export interface HeroSkillState {
  level: number;
  focus: number;
  xp: number;
}

export type EquipmentSetId = 'BATTLE' | 'CIVILIAN';
export type HeroEquipmentSet = Partial<Record<EquipmentSlotId, string | null>>;

/** Oyuncu, eş ve yoldaşlar için kalıcı kahraman kaydı. */
export interface CampaignHero {
  id: string;
  name: string;
  kind: 'PLAYER' | 'COMPANION' | 'SPOUSE' | 'FAMILY';
  culture: FactionId;
  age: number;
  hp: number;
  maxHp: number;
  wage: number;
  level: number;
  xp: number;
  freeAttributePoints: number;
  freeFocusPoints: number;
  attributes: Record<AttributeId, number>;
  skills: Record<BannerlordSkillId, HeroSkillState>;
  perks: string[];
  equipment: Record<EquipmentSetId, HeroEquipmentSet>;
  activeEquipmentSet: EquipmentSetId;
  isInPlayerParty: boolean;
  morphDNA?: CharacterMorphDNA;
  spouseId?: string | null;
  fatherId?: string | null;
  motherId?: string | null;
}

export type HorseRequirement = 'NONE' | 'HORSE' | 'WAR_HORSE';

/** Kültür ağacındaki tek birlik türü. `horseRequirement`, bu türe terfi ederken gerekir. */
export interface TroopDefinition {
  id: string;
  culture: FactionId;
  name: string;
  tier: number;
  battleClass: UnitTierId;
  wage: number;
  upgradeXp: number;
  upgradeGold: number;
  horseRequirement: HorseRequirement;
  upgrades: string[];
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
}

/** XP ve yaralı sayısı birlik türü yığını bazında tutulur. */
export interface TroopStack {
  troopId: string;
  count: number;
  wounded: number;
  xp: number;
}

export interface PrisonerStack {
  troopId: string;
  count: number;
  ready: number;
  readinessProgress: number;
}

export interface Settlement {
  id: string;
  name: string;
  type: 'CASTLE' | 'TOWN' | 'VILLAGE';
  faction: FactionId;
  x: number;
  z: number;
  prosperity: number;
  garrison: number;
  recruitPool: TroopRoster;
  foodStock: number;
  description: string;
  boundSettlementId?: string;
  boundSettlementName?: string;
  militia?: number;
  loyalty?: number;
  security?: number;
  wallLevel?: number;
  primaryProduction?: string;
  hearths?: number;
  isRaided?: boolean;
  buildings?: Record<BuildingProjectId, number>;
  dailyDefault?: SettlementDailyDefault;
  workshopType?: WorkshopTypeId;
  /** Atölyenin sahibi. Oyuncu atölyesi her gün gelir getirir (Faz B0). */
  workshopOwner?: 'player';
  siegeEngines?: SiegeEngineType[];
  reserveEngines?: SiegeEngineType[];
  wallHealth?: number;
  /** Faz B0: yerleşimin ileri gelenleri (deterministik üretilir, kayda yazılır). */
  notables?: SettlementNotable[];
  /** P2: kalıcı pazar stoğu (tanım kimliği → adet). İlk pazar ziyaretinde türetilir. */
  marketStock?: Record<string, number>;
  /** P2: oyuncunun satışlarını sınırlayan kalıcı tüccar kasası. */
  merchantGold?: number;
  /** P2: ticaret söylentileri yalnız ziyaret edilmiş yerleşimler için görünür. */
  visited?: boolean;
}

export function getSettlementArrivalRadius(type: 'TOWN' | 'CASTLE' | 'VILLAGE'): number {
  switch (type) {
    case 'TOWN':
      return 5.2;
    case 'CASTLE':
      return 3.8;
    case 'VILLAGE':
      return 2.6;
  }
}

/** Lord'un stratejik emri (Faz 11 — canlı dünya). */
export type LordOrderKind =
  | 'PATROL' // kendi bölgesinde devriye
  | 'REINFORCE' // kendi yerleşiminde asker topla
  | 'SIEGE' // düşman yerleşimini kuşat
  | 'DEFEND' // kuşatılan kendi yerleşimini savun
  | 'HUNT_PLAYER' // oyuncuyu avla
  | 'FLEE'; // güçsüzken kaç

export interface LordOrder {
  kind: LordOrderKind;
  /** SIEGE / DEFEND / REINFORCE / PATROL hedefi. */
  targetSettlementId?: string;
  /** Emrin verildiği gün (churn'ü önlemek için). */
  sinceDay: number;
  /** Kuşatma ilerlemesi 0..100 (yalnız SIEGE). */
  siegeProgress?: number;
}

/** İki krallık arasındaki savaş kaydı (Faz 11). */
export interface KingdomWarRecord {
  a: FactionId;
  b: FactionId;
  sinceDay: number;
  /** + ise `a` üstün, − ise `b` üstün (−100..+100). */
  score: number;
  sieges: number;
}

export interface WorldStats {
  events: number;
  warsDeclared: number;
  warsEnded: number;
  siegesWon: number;
  fiefsChangedHands: number;
  reinforcements: number;
}

/** Seferin canlı dünya durumu (kayda yazılır). */
export interface WorldState {
  seed: number;
  wars: KingdomWarRecord[];
  stats: WorldStats;
  /** Yeni fethedilen yerleşim → yeniden kuşatılamayacağı gün (ping-pong önleyici). */
  siegeCooldowns?: Record<string, number>;
}

export const EMPTY_WORLD_STATS: WorldStats = {
  events: 0,
  warsDeclared: 0,
  warsEnded: 0,
  siegesWon: 0,
  fiefsChangedHands: 0,
  reinforcements: 0,
};

export interface LordAgent {
  id: string;
  name: string;
  title: string;
  faction: FactionId;
  personality: string;
  relation: number; // -100 to +100
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  armySize: number;
  roster: TroopRoster;
  wounded?: number;
  prisoners?: number;
  morale?: number;
  foodDays?: number;
  isAtWarWithPlayer: boolean;
  isAlliedWithPlayer: boolean;
  currentAction: string;
  bannerColor: string;
  persuasionPips?: number;
  morphDNA?: CharacterMorphDNA;
  /** Faz 11: stratejik emir (canlı dünya simülasyonu yazar, harita uygular). */
  order?: LordOrder;
}

export interface ChronicleEvent {
  id: string;
  day: number;
  text: string;
  category: 'WAR' | 'DIPLOMACY' | 'ECONOMY' | 'CONQUEST' | string;
}

export interface CampaignState {
  playerName: string;
  backgroundId: 'noble' | 'steppe' | 'tactician';
  day: number;
  hour: number;
  season: 'Bahar' | 'Yaz' | 'Güz' | 'Kış';
  gold: number;
  food: number;
  renown: number;
  morale: number;
  playerHp: number;
  playerMaxHp: number;
  playerX: number;
  playerZ: number;
  roster: TroopRoster;
  prisoners: number;
  battlesWon: number;
  settlements: Settlement[];
  lords: LordAgent[];
  chronicle: ChronicleEvent[];
  characterLevel?: number;
  freeAttributePoints?: number;
  freeFocusPoints?: number;
  attributes?: Record<AttributeId, number>;
  skills?: Record<BannerlordSkillId, { level: number; focus: number }>;
  unlockedPerks?: string[];
  outfitMode?: 'BATTLE' | 'CIVILIAN';
  equipment?: Record<EquipmentSlotId, string>;
  inventoryItems?: InventoryItem[];
  clanRoles?: Record<ClanRoleId, string>;
  /** Bannerlord veri temeli (P1): eski alanlar geçiş döneminde görüntüleme/uyumluluk yedeğidir. */
  foundationVersion?: number;
  influence?: number;
  heroes?: CampaignHero[];
  roleAssignments?: Partial<Record<ClanRoleId, string | null>>;
  troopStacks?: TroopStack[];
  prisonerStacks?: PrisonerStack[];
  customItemDefinitions?: ItemDefinition[];
  playerMorphDNA?: CharacterMorphDNA;
  /** Faz 11: savaşlar + sayaçlar (kayda yazılır). */
  world?: WorldState;
}

export const FACTION_INFO: Record<
  FactionId,
  { name: string; color: string; hex: number; emblemName: string; ruler: string; glyph: string }
> = {
  player: {
    name: 'Bağımsız Sancak',
    color: '#d97706',
    hex: 0xd97706,
    emblemName: 'Altın Kartal Sancağı',
    ruler: 'Komutan Demirhan',
    glyph: '🦅',
  },
  vlandia: {
    name: 'Vlandiya Krallığı',
    color: '#991b1b',
    hex: 0x991b1b,
    emblemName: 'Kızıl Aslan Hanedanı',
    ruler: 'Kral Derthert',
    glyph: '🦁',
  },
  battania: {
    name: 'Battaniya Krallığı',
    color: '#166534',
    hex: 0x166534,
    emblemName: 'Ulu Orman Geyiği',
    ruler: 'Yüksek Kral Caladog',
    glyph: '🦌',
  },
  sturgia: {
    name: 'Sturgia Prensliği',
    color: '#1e3a8a',
    hex: 0x1e3a8a,
    emblemName: 'Kuzey Kalkanı',
    ruler: 'Büyük Prens Raganvad',
    glyph: '⚔',
  },
  empire: {
    name: 'Kalradya İmparatorluğu',
    color: '#581c87',
    hex: 0x581c87,
    emblemName: 'Çift Başlı Kartal',
    ruler: 'İmparatoriçe Rhagaea',
    glyph: '👑',
  },
  khuzait: {
    name: 'Khuzait Hanlığı',
    color: '#0f766e',
    hex: 0x0f766e,
    emblemName: 'Gök Kurdu Boyu',
    ruler: 'Monchug Han',
    glyph: '🐎',
  },
  aserai: {
    name: 'Aserai Sultanlığı',
    color: '#b45309',
    hex: 0xb45309,
    emblemName: 'Altın Şahin Kabileleri',
    ruler: 'Sultan Unqid',
    glyph: '☀',
  },
  bandits: {
    name: 'Kara Geçit Yağmacıları',
    color: '#44403c',
    hex: 0x44403c,
    emblemName: 'Kırık Kalkan Çetesi',
    ruler: 'Reis Kargı',
    glyph: '☠',
  },
};

export const UNIT_DEFINITIONS: Record<UnitTierId, UnitDefinition> = {
  militia: {
    id: 'militia',
    name: 'Acemi Mızrakçı',
    role: 'Yakın Dövüş · Kalkan Hattı',
    recruitCost: 25,
    dailyWage: 3,
    maxHp: 85,
    attack: 16,
    defense: 12,
    speed: 5.8,
    isRanged: false,
    isMounted: false,
    keyHint: '1',
  },
  archer: {
    id: 'archer',
    name: 'Kıdemli Uzun Okçu',
    role: 'Menzilli · Ok Yağmuru',
    recruitCost: 45,
    dailyWage: 5,
    maxHp: 70,
    attack: 22,
    defense: 8,
    speed: 6.2,
    isRanged: true,
    isMounted: false,
    keyHint: '2',
  },
  cavalry: {
    id: 'cavalry',
    name: 'Zırhlı Bozkır Süvarisi',
    role: 'Atlı Hücum · Kanat Kırıcı',
    recruitCost: 85,
    dailyWage: 9,
    maxHp: 130,
    attack: 28,
    defense: 18,
    speed: 9.4,
    isRanged: false,
    isMounted: true,
    keyHint: '3',
  },
  guard: {
    id: 'guard',
    name: 'Saray Muhafızı',
    role: 'Ağır Zırhlı · Çift Elli Kılıç',
    recruitCost: 110,
    dailyWage: 12,
    maxHp: 155,
    attack: 34,
    defense: 24,
    speed: 5.4,
    isRanged: false,
    isMounted: false,
    keyHint: '4',
  },
};

export function getTotalTroops(roster: TroopRoster): number {
  return (
    Math.max(0, Math.floor(roster.militia)) +
    Math.max(0, Math.floor(roster.archer)) +
    Math.max(0, Math.floor(roster.cavalry)) +
    Math.max(0, Math.floor(roster.guard))
  );
}

export function calculatePartyStrength(roster: TroopRoster, commanderHpRatio = 1): number {
  const unitScore =
    roster.militia * 12 +
    roster.archer * 18 +
    roster.cavalry * 32 +
    roster.guard * 40;
  const commanderScore = Math.round(45 * Math.max(0.2, Math.min(1, commanderHpRatio)));
  return Math.max(0, Math.round(unitScore + commanderScore));
}

export function calculateDailyWage(roster: TroopRoster): number {
  return (
    roster.militia * UNIT_DEFINITIONS.militia.dailyWage +
    roster.archer * UNIT_DEFINITIONS.archer.dailyWage +
    roster.cavalry * UNIT_DEFINITIONS.cavalry.dailyWage +
    roster.guard * UNIT_DEFINITIONS.guard.dailyWage
  );
}

export function calculateDailyFoodConsumption(roster: TroopRoster): number {
  return calculateDailyFoodDemand(roster);
}

export function recruitUnit(
  state: CampaignState,
  settlementId: string,
  unitId: UnitTierId,
  amount = 1,
): { nextState: CampaignState; success: boolean; reason?: string } {
  if (amount <= 0) {
    return { nextState: state, success: false, reason: 'Geçersiz miktar.' };
  }
  const settlementIndex = state.settlements.findIndex((s) => s.id === settlementId);
  if (settlementIndex === -1) {
    return { nextState: state, success: false, reason: 'Yerleşim bulunamadı.' };
  }

  const settlement = state.settlements[settlementIndex];
  const available = settlement.recruitPool[unitId];
  if (available < amount) {
    return { nextState: state, success: false, reason: 'Yerleşimde yeterli gönüllü asker yok.' };
  }

  const unitDef = UNIT_DEFINITIONS[unitId];
  const totalCost = unitDef.recruitCost * amount;
  if (state.gold < totalCost) {
    return { nextState: state, success: false, reason: 'Yeterli dinar yok.' };
  }

  const updatedSettlements = [...state.settlements];
  updatedSettlements[settlementIndex] = {
    ...settlement,
    recruitPool: {
      ...settlement.recruitPool,
      [unitId]: available - amount,
    },
  };

  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - totalCost,
      roster: {
        ...state.roster,
        [unitId]: state.roster[unitId] + amount,
      },
      settlements: updatedSettlements,
    },
  };
}

export function buyFoodAtSettlement(
  state: CampaignState,
  settlementId: string,
  packs = 5,
): { nextState: CampaignState; success: boolean; reason?: string } {
  const costPerPack = 6;
  const totalCost = packs * costPerPack;
  const idx = state.settlements.findIndex((s) => s.id === settlementId);
  if (idx === -1) return { nextState: state, success: false, reason: 'Yerleşim bulunamadı.' };
  if (state.settlements[idx].foodStock < packs) {
    return { nextState: state, success: false, reason: 'Pazarda yeterli erzak kalmadı.' };
  }
  if (state.gold < totalCost) {
    return { nextState: state, success: false, reason: 'Yeterli dinar yok.' };
  }

  const nextSettlements = [...state.settlements];
  nextSettlements[idx] = {
    ...nextSettlements[idx],
    foodStock: nextSettlements[idx].foodStock - packs,
  };

  const nextInventory = addItemDefinitionToInventory(
    state,
    'mkt_grain_sack',
    packs,
    costPerPack,
  );

  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - totalCost,
      food: state.food + packs,
      inventoryItems: nextInventory,
      morale: Math.min(100, state.morale + 2),
      settlements: nextSettlements,
    },
  };
}

export function hireMercenariesAtTavern(
  state: CampaignState,
  settlementId: string,
): { nextState: CampaignState; success: boolean; reason?: string; hiredCount?: number } {
  const cost = 120;
  if (state.gold < cost) {
    return { nextState: state, success: false, reason: 'Yeterli dinarınız yok (120 Dinar gerekli).' };
  }
  const s = state.settlements.find((item) => item.id === settlementId);
  if (!s || s.type !== 'TOWN') {
    return { nextState: state, success: false, reason: 'Yalnızca büyük şehir meyhanelerinde paralı asker loncası bulunur.' };
  }

  return {
    success: true,
    hiredCount: 4,
    nextState: {
      ...state,
      gold: state.gold - cost,
      roster: {
        ...state.roster,
        cavalry: state.roster.cavalry + 2,
        archer: state.roster.archer + 2,
      },
      morale: Math.min(100, state.morale + 3),
      chronicle: [
        {
          id: `merc-${Date.now()}`,
          day: state.day,
          category: 'ECONOMY' as const,
          text: `${s.name} meyhanesinden 4 kıdemli paralı asker sancağınıza katıldı.`,
        },
        ...state.chronicle,
      ].slice(0, 25),
    },
  };
}

export function ransomPrisonersAtTavern(
  state: CampaignState,
  settlementId: string,
): { nextState: CampaignState; success: boolean; goldGained?: number; reason?: string } {
  if (state.prisoners <= 0) {
    return { nextState: state, success: false, reason: 'Fidyeciye teslim edilecek esiriniz yok.' };
  }
  const ransomPerPrisoner = 35;
  const count = state.prisoners;
  const totalGold = count * ransomPerPrisoner;
  const s = state.settlements.find((item) => item.id === settlementId);

  return {
    success: true,
    goldGained: totalGold,
    nextState: {
      ...state,
      gold: state.gold + totalGold,
      prisoners: 0,
      renown: state.renown + 1,
      chronicle: [
        {
          id: `ransom-${Date.now()}`,
          day: state.day,
          category: 'ECONOMY' as const,
          text: `${s?.name || 'Şehir'} fidyecisine ${count} esir teslim edildi (+${totalGold} Dinar).`,
        },
        ...state.chronicle,
      ].slice(0, 25),
    },
  };
}

export function buyTavernRound(
  state: CampaignState,
): { nextState: CampaignState; success: boolean; reason?: string } {
  const cost = 25;
  if (state.gold < cost) {
    return { nextState: state, success: false, reason: 'Yeterli dinarınız yok (25 Dinar).' };
  }
  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - cost,
      morale: Math.min(100, state.morale + 8),
    },
  };
}

export function participateInArenaPractice(
  state: CampaignState,
  settlementId: string,
): { nextState: CampaignState; success: boolean; goldEarned: number; renownEarned: number } {
  const goldEarned = 25;
  const renownEarned = 2;
  const s = state.settlements.find((item) => item.id === settlementId);

  return {
    success: true,
    goldEarned,
    renownEarned,
    nextState: {
      ...state,
      gold: state.gold + goldEarned,
      renown: state.renown + renownEarned,
      chronicle: [
        {
          id: `arena-prac-${Date.now()}`,
          day: state.day,
          category: 'WAR' as const,
          text: `${s?.name || 'Şehir'} arenasında talim dövüşünü kazanıp +${goldEarned} Dinar elde ettiniz.`,
        },
        ...state.chronicle,
      ].slice(0, 25),
    },
  };
}

export function joinArenaTournament(
  state: CampaignState,
  settlementId: string,
): { nextState: CampaignState; success: boolean; victory: boolean; goldEarned: number; renownEarned: number; prizeName: string } {
  const s = state.settlements.find((item) => item.id === settlementId);
  const entryFee = 30;
  if (state.gold < entryFee) {
    return {
      nextState: state,
      success: false,
      victory: false,
      goldEarned: 0,
      renownEarned: 0,
      prizeName: '',
    };
  }

  const partyStrength = calculatePartyStrength(state.roster);
  const winChance = Math.min(0.85, 0.55 + partyStrength * 0.005);
  const victory = Math.random() < winChance;

  if (victory) {
    const goldEarned = 250;
    const renownEarned = 15;
    const prizeName = 'Şampiyonun Çelik Kalkanı ve Şeref Miğferi';
    return {
      success: true,
      victory: true,
      goldEarned,
      renownEarned,
      prizeName,
      nextState: {
        ...state,
        gold: state.gold - entryFee + goldEarned,
        renown: state.renown + renownEarned,
        morale: Math.min(100, state.morale + 10),
        chronicle: [
          {
            id: `tourney-win-${Date.now()}`,
            day: state.day,
            category: 'CONQUEST' as const,
            text: `${s?.name || 'Şehir'} arenasında büyük turnuva şampiyonu oldunuz! (+${renownEarned} Nam, +${goldEarned} Dinar, ${prizeName})`,
          },
          ...state.chronicle,
        ].slice(0, 25),
      },
    };
  } else {
    return {
      success: true,
      victory: false,
      goldEarned: 0,
      renownEarned: 2,
      prizeName: '',
      nextState: {
        ...state,
        gold: state.gold - entryFee,
        renown: state.renown + 2,
        chronicle: [
          {
            id: `tourney-loss-${Date.now()}`,
            day: state.day,
            category: 'WAR' as const,
            text: `${s?.name || 'Şehir'} turnuvasının yarı finalinde elendiniz (+2 Nam).`,
          },
          ...state.chronicle,
        ].slice(0, 25),
      },
    };
  }
}

/**
 * Çuvaldaki **ticari emtia**yı pazara satar (savaş ganimeti ve alım-satım
 * fazlalıkları). Kuşanılabilir eşyaya dokunmaz — onlar envanterde kalır.
 * Faz B0: sabit 45 dinar yerine satılan malın gerçek değeri ödenir.
 */
export function sellSurplusLootAtMarket(
  state: CampaignState,
  settlementId: string,
): { nextState: CampaignState; success: boolean; goldGained: number; reason?: string } {
  const s = state.settlements.find((item) => item.id === settlementId);
  if (!s) return { nextState: state, success: false, goldGained: 0, reason: 'Yerleşim bulunamadı.' };

  const goods = (state.inventoryItems ?? []).filter(
    (item) => item.slot === 'TRADE' && item.category === 'FOOD',
  );
  if (goods.length === 0) {
    return {
      nextState: state,
      success: false,
      goldGained: 0,
      reason: 'Çuvalınızda satılacak emtia yok. Ganimet eşyaları pazaryerinde tek tek satılır.',
    };
  }

  const goldGained = goods.reduce((sum, item) => sum + Math.max(1, Math.round(item.value)), 0);
  const soldIds = new Set(goods.map((item) => item.id));
  const remaining = (state.inventoryItems ?? []).filter((item) => !soldIds.has(item.id));

  return {
    success: true,
    goldGained,
    nextState: {
      ...state,
      gold: state.gold + goldGained,
      inventoryItems: remaining,
      chronicle: [
        {
          id: `loot-sell-${state.day}-${goods.length}`,
          day: state.day,
          category: 'ECONOMY' as const,
          text: `${s.name} pazarına ${goods.length} kalem ganimet/emtia satıldı (+${goldGained} Dinar).`,
        },
        ...state.chronicle,
      ].slice(0, 25),
    },
  };
}

export function manageGarrisonTransfer(
  state: CampaignState,
  settlementId: string,
  unitId: UnitTierId,
  direction: 'deposit' | 'withdraw',
  amount = 1,
): { nextState: CampaignState; success: boolean; reason?: string } {
  const sIdx = state.settlements.findIndex((item) => item.id === settlementId);
  if (sIdx === -1) return { nextState: state, success: false, reason: 'Yerleşim bulunamadı.' };
  const s = state.settlements[sIdx];

  if (direction === 'deposit') {
    if (state.roster[unitId] < amount) {
      return { nextState: state, success: false, reason: 'Ordunuzda bu birlikten yeterli asker yok.' };
    }
    const updatedSettlements = [...state.settlements];
    updatedSettlements[sIdx] = {
      ...s,
      garrison: s.garrison + amount,
    };
    return {
      success: true,
      nextState: {
        ...state,
        roster: {
          ...state.roster,
          [unitId]: state.roster[unitId] - amount,
        },
        settlements: updatedSettlements,
      },
    };
  } else {
    if (s.garrison <= 5) {
      return { nextState: state, success: false, reason: 'Garnizon asgari savunma seviyesinin altına düşemez (en az 5 muhafız).' };
    }
    const updatedSettlements = [...state.settlements];
    updatedSettlements[sIdx] = {
      ...s,
      garrison: s.garrison - amount,
    };
    return {
      success: true,
      nextState: {
        ...state,
        roster: {
          ...state.roster,
          [unitId]: state.roster[unitId] + amount,
        },
        settlements: updatedSettlements,
      },
    };
  }
}

export function restAndRecoverAtSettlement(
  state: CampaignState,
  settlementId: string,
): { nextState: CampaignState; success: boolean; healedCount: number; message: string } {
  const s = state.settlements.find((item) => item.id === settlementId);
  return {
    success: true,
    healedCount: 4,
    message: `${s?.name || 'Yerleşim'} surları altında güvenle dinlenildi. Askerlerinizin morali yükseldi.`,
    nextState: {
      ...state,
      morale: Math.min(100, state.morale + 6),
      playerHp: Math.min(state.playerMaxHp, state.playerHp + 25),
    },
  };
}

export function raidAndPillageVillage(
  state: CampaignState,
  villageId: string,
): { nextState: CampaignState; success: boolean; goldLoot: number; foodLoot: number; reason?: string } {
  const vIdx = state.settlements.findIndex((item) => item.id === villageId);
  if (vIdx === -1) return { nextState: state, success: false, reason: 'Köy bulunamadı.', goldLoot: 0, foodLoot: 0 };
  const v = state.settlements[vIdx];
  if (v.type !== 'VILLAGE') {
    return { nextState: state, success: false, reason: 'Yalnızca köyler doğrudan yağmalanabilir.', goldLoot: 0, foodLoot: 0 };
  }
  if (v.isRaided) {
    return { nextState: state, success: false, reason: 'Bu köy zaten yakın zamanda yağmalanmış ve dumanlar altında.', goldLoot: 0, foodLoot: 0 };
  }

  const goldLoot = 280;
  const foodLoot = 16;

  const updatedSettlements = [...state.settlements];
  updatedSettlements[vIdx] = {
    ...v,
    prosperity: Math.max(20, v.prosperity - 80),
    isRaided: true,
    foodStock: 2,
  };

  const villageFaction = v.faction;
  const updatedLords = state.lords.map((l) => {
    if (l.faction === villageFaction) {
      return {
        ...l,
        isAtWarWithPlayer: true,
        relation: Math.max(-100, l.relation - 35),
      };
    }
    return l;
  });

  let nextInventory = addItemDefinitionToInventory(state, 'mkt_grain_sack', 10, 0);
  nextInventory = addItemDefinitionToInventory({ ...state, inventoryItems: nextInventory }, 'mkt_cured_meat', 3, 0);
  nextInventory = addItemDefinitionToInventory({ ...state, inventoryItems: nextInventory }, 'mkt_cheese_wheel', 3, 0);

  return {
    success: true,
    goldLoot,
    foodLoot,
    nextState: {
      ...state,
      gold: state.gold + goldLoot,
      food: state.food + foodLoot,
      inventoryItems: nextInventory,
      morale: Math.max(10, state.morale - 4),
      renown: state.renown + 5,
      settlements: updatedSettlements,
      lords: updatedLords,
      chronicle: [
        {
          id: `raid-${Date.now()}`,
          day: state.day,
          category: 'WAR' as const,
          text: `${v.name} köyü yağmalanıp ateşe verildi! (+${goldLoot} Dinar, +${foodLoot} Erzak). ${FACTION_INFO[villageFaction].name} ile savaş durumu başladı!`,
        },
        ...state.chronicle,
      ].slice(0, 25),
    },
  };
}

export function forcePeasantsSupplies(
  state: CampaignState,
  villageId: string,
): { nextState: CampaignState; success: boolean; foodGained: number; reason?: string } {
  const vIdx = state.settlements.findIndex((item) => item.id === villageId);
  if (vIdx === -1) return { nextState: state, success: false, reason: 'Köy bulunamadı.', foodGained: 0 };
  const v = state.settlements[vIdx];
  if (v.foodStock < 4) {
    return { nextState: state, success: false, reason: 'Köylülerin verebilecek erzağı kalmamış.', foodGained: 0 };
  }

  const foodGained = 8;
  const updatedSettlements = [...state.settlements];
  updatedSettlements[vIdx] = {
    ...v,
    foodStock: Math.max(0, v.foodStock - foodGained),
    prosperity: Math.max(10, v.prosperity - 15),
  };

  const nextInventory = addItemDefinitionToInventory(
    state,
    'mkt_grain_sack',
    foodGained,
    0,
  );

  return {
    success: true,
    foodGained,
    nextState: {
      ...state,
      food: state.food + foodGained,
      inventoryItems: nextInventory,
      morale: Math.min(100, state.morale + 1),
      settlements: updatedSettlements,
      chronicle: [
        {
          id: `force-supplies-${Date.now()}`,
          day: state.day,
          category: 'ECONOMY' as const,
          text: `${v.name} köylüleri kılıç zoruyla erzak vermeye zorlandı (+${foodGained} Erzak).`,
        },
        ...state.chronicle,
      ].slice(0, 25),
    },
  };
}

export function forcePeasantsRecruits(
  state: CampaignState,
  villageId: string,
): { nextState: CampaignState; success: boolean; recruitsGained: number; reason?: string } {
  const vIdx = state.settlements.findIndex((item) => item.id === villageId);
  if (vIdx === -1) return { nextState: state, success: false, reason: 'Köy bulunamadı.', recruitsGained: 0 };
  const v = state.settlements[vIdx];
  if (v.recruitPool.militia < 2) {
    return { nextState: state, success: false, reason: 'Köyde silah altına alınabilecek genç kalmamış.', recruitsGained: 0 };
  }

  const recruitsGained = 3;
  const updatedSettlements = [...state.settlements];
  updatedSettlements[vIdx] = {
    ...v,
    recruitPool: {
      ...v.recruitPool,
      militia: Math.max(0, v.recruitPool.militia - recruitsGained),
    },
    prosperity: Math.max(10, v.prosperity - 12),
  };

  return {
    success: true,
    recruitsGained,
    nextState: {
      ...state,
      roster: {
        ...state.roster,
        militia: state.roster.militia + recruitsGained,
      },
      settlements: updatedSettlements,
      chronicle: [
        {
          id: `force-recruits-${Date.now()}`,
          day: state.day,
          category: 'WAR' as const,
          text: `${v.name} köyünden ${recruitsGained} köylü zorla sancağınıza katıldı.`,
        },
        ...state.chronicle,
      ].slice(0, 25),
    },
  };
}

const WORKSHOP_TYPE_BONUS: Record<string, number> = {
  BREWERY: 0,
  SMITHY: 15,
  OLIVE_PRESS: 8,
  WEAVERY: 12,
};

/**
 * Atölyenin günlük geliri (Faz B0).
 * Refah arttıkça kâr artar; atölye türü küçük bir çarpan ekler. Arayüz ve
 * günlük ekonomi **aynı** fonksiyonu kullanır ki ekranda yazan rakam yalan olmasın.
 */
export function settlementWorkshopIncome(settlement: Settlement): number {
  if (!settlement.workshopType || settlement.workshopType === 'NONE') return 0;
  const base = 20 + Math.round(settlement.prosperity * 0.08);
  return base + (WORKSHOP_TYPE_BONUS[settlement.workshopType] ?? 0);
}

export function advanceDailyEconomyAndWorld(state: CampaignState): CampaignState {
  const wage = calculateDailyWage(state.roster);
  const foodResult = advanceDailyPartyFood(state);
  const stateAfterFood = foodResult.nextState;

  let playerSettlementTaxes = 0;
  let playerWorkshopIncome = 0;
  const updatedSettlements = state.settlements.map((s) => {
    if (s.faction === 'player') {
      playerSettlementTaxes += Math.round(s.prosperity * 0.25);
    }
    // Faz B0: oyuncunun atölyesi refaha bağlı günlük gelir üretir.
    if (s.workshopOwner === 'player') {
      playerWorkshopIncome += settlementWorkshopIncome(s);
    }
    return {
      ...s,
      prosperity: Math.min(999, s.prosperity + 2),
      foodStock: Math.min(60, s.foodStock + 3),
      recruitPool: {
        militia: Math.min(12, s.recruitPool.militia + 2),
        archer: Math.min(8, s.recruitPool.archer + 1),
        cavalry: Math.min(5, s.recruitPool.cavalry + 1),
        guard: Math.min(4, s.recruitPool.guard + (s.type !== 'VILLAGE' ? 1 : 0)),
      },
    };
  });

  const nextGold = Math.max(0, state.gold + playerSettlementTaxes + playerWorkshopIncome - wage);
  let wageMoraleDelta = 0;
  if (state.gold + playerSettlementTaxes + playerWorkshopIncome < wage) wageMoraleDelta -= 8;

  const seasons: Array<'Bahar' | 'Yaz' | 'Güz' | 'Kış'> = ['Bahar', 'Yaz', 'Güz', 'Kış'];
  const nextDay = state.day + 1;
  const seasonIdx = Math.floor(((nextDay - 1) % 40) / 10);

  // Atölye gelirini 10 günde bir vakayinameye yaz (her gün yazmak günlüğü boğar).
  const economyChronicle =
    playerWorkshopIncome > 0 && nextDay % 10 === 0
      ? [
          {
            id: `workshop-income-${nextDay}`,
            day: nextDay,
            category: 'ECONOMY' as const,
            text: `Atölyelerin son on günde yaklaşık ${(playerWorkshopIncome * 10).toLocaleString('tr-TR')} Dinar kazandırdı.`,
          },
          ...stateAfterFood.chronicle,
        ].slice(0, 20)
      : stateAfterFood.chronicle;

  return {
    ...stateAfterFood,
    day: nextDay,
    season: seasons[seasonIdx] || 'Güz',
    gold: nextGold,
    chronicle: economyChronicle,
    morale: Math.max(15, Math.min(100, stateAfterFood.morale + wageMoraleDelta)),
    playerHp: Math.min(state.playerMaxHp, state.playerHp + 15),
    settlements: updatedSettlements,
  };
}

export function computeMeleeDamage(
  baseAttack: number,
  targetDefense: number,
  isHeavyStrike: boolean,
  isTargetBlocking: boolean,
  speedBonusMultiplier = 1,
): number {
  const raw = baseAttack * (isHeavyStrike ? 1.45 : 1.0) * Math.max(0.8, Math.min(1.8, speedBonusMultiplier));
  const mitigated = Math.max(4, raw - targetDefense * 0.45);
  const finalDmg = isTargetBlocking ? mitigated * 0.25 : mitigated;
  return Math.max(2, Math.round(finalDmg));
}

export function deductCasualtiesFromRoster(
  roster: TroopRoster,
  casualties: number,
): TroopRoster {
  const next: TroopRoster = {
    militia: Math.max(0, roster.militia),
    archer: Math.max(0, roster.archer),
    cavalry: Math.max(0, roster.cavalry),
    guard: Math.max(0, roster.guard),
  };
  let remaining = Math.max(0, Math.round(casualties));
  const order: UnitTierId[] = ['militia', 'archer', 'cavalry', 'guard'];
  let guardLoop = 0;
  while (remaining > 0 && guardLoop < 2000) {
    guardLoop++;
    let deductedAny = false;
    for (const tier of order) {
      if (remaining <= 0) break;
      if (next[tier] > 0) {
        next[tier] -= 1;
        remaining -= 1;
        deductedAny = true;
      }
    }
    if (!deductedAny) break;
  }
  return next;
}

export function resolveBattleOutcome(
  state: CampaignState,
  victory: boolean,
  enemyLordId: string | null,
  playerTroopLosses: Partial<TroopRoster>,
  enemiesDefeatedCount: number,
  conqueredSettlementId?: string | null,
): CampaignState {
  const nextRoster: TroopRoster = {
    militia: Math.max(0, state.roster.militia - (playerTroopLosses.militia || 0)),
    archer: Math.max(0, state.roster.archer - (playerTroopLosses.archer || 0)),
    cavalry: Math.max(0, state.roster.cavalry - (playerTroopLosses.cavalry || 0)),
    guard: Math.max(0, state.roster.guard - (playerTroopLosses.guard || 0)),
  };

  const nextLords = state.lords.map((l) => {
    if (l.id !== enemyLordId) return l;

    const currentRoster: TroopRoster = l.roster || {
      militia: Math.max(2, Math.floor(l.armySize * 0.35)),
      archer: Math.max(2, Math.floor(l.armySize * 0.28)),
      cavalry: Math.max(1, Math.floor(l.armySize * 0.22)),
      guard: Math.max(1, Math.floor(l.armySize * 0.15)),
    };

    // Deduct every enemy killed during the battle from the Lord's actual roster
    let updatedRoster = deductCasualtiesFromRoster(currentRoster, enemiesDefeatedCount);
    let updatedTotal = getTotalTroops(updatedRoster);

    if (victory) {
      // On total battlefield victory, routed/captured troops also reduce the Lord's active retinue
      const maxSurvivingOnDefeat = Math.max(2, Math.floor(l.armySize * 0.25));
      if (updatedTotal > maxSurvivingOnDefeat) {
        updatedRoster = deductCasualtiesFromRoster(
          updatedRoster,
          updatedTotal - maxSurvivingOnDefeat,
        );
        updatedTotal = getTotalTroops(updatedRoster);
      }
      // Ensure defeated Lord keeps at least 1 battered retainer on the map while rebuilding
      if (updatedTotal <= 0) {
        updatedRoster = { militia: 1, archer: 0, cavalry: 0, guard: 0 };
        updatedTotal = 1;
      }
      const safeRetreat = snapToNearestLand(l.x + 18, l.z - 18);
      return {
        ...l,
        roster: updatedRoster,
        armySize: updatedTotal,
        wounded: (l.wounded ?? 1) + Math.max(1, Math.floor(enemiesDefeatedCount * 0.35)),
        x: safeRetreat.x,
        z: safeRetreat.z,
        currentAction: 'Ordusunu yeniden topluyor',
      };
    }

    // Even on player retreat or defeat, the enemies killed in battle are permanently deducted!
    return {
      ...l,
      roster: updatedRoster,
      armySize: Math.max(1, updatedTotal),
      wounded: (l.wounded ?? 1) + Math.floor(enemiesDefeatedCount * 0.25),
    };
  });

  if (!victory) {
    const nextSettlementsOnDefeat = state.settlements.map((s) => {
      if (conqueredSettlementId && s.id === conqueredSettlementId && enemiesDefeatedCount > 0) {
        return {
          ...s,
          garrison: Math.max(4, s.garrison - enemiesDefeatedCount),
        };
      }
      return s;
    });

    return ensureBannerlordFoundation({
      ...state,
      roster: nextRoster,
      lords: nextLords,
      settlements: nextSettlementsOnDefeat,
      morale: Math.max(20, state.morale - 15),
      gold: Math.max(0, state.gold - 40),
      playerHp: Math.max(25, state.playerHp),
    });
  }

  const isSiegeVictory = Boolean(conqueredSettlementId);
  const goldLoot = battleGoldReward(enemiesDefeatedCount, isSiegeVictory);
  const renownGain = 15 + enemiesDefeatedCount * 3;
  const prisonersGain = Math.max(1, Math.floor(enemiesDefeatedCount * 0.35));
  // Faz B0: zafer artık eşya da bırakır (envantere düşer, pazarda satılır).
  const defeatedFaction =
    state.lords.find((l) => l.isAtWarWithPlayer)?.faction ??
    (conqueredSettlementId
      ? state.settlements.find((s) => s.id === conqueredSettlementId)?.faction
      : undefined) ??
    'bandits';
  const loot = rollBattleLoot(state, {
    enemyFaction: defeatedFaction,
    defeated: enemiesDefeatedCount,
    siege: isSiegeVictory,
  });

  const nextSettlements = state.settlements.map((s) => {
    if (conqueredSettlementId && (s.id === conqueredSettlementId || s.boundSettlementId === conqueredSettlementId)) {
      return {
        ...s,
        faction: 'player' as FactionId,
        garrison: s.id === conqueredSettlementId ? Math.max(20, Math.floor(s.garrison * 0.6)) : s.garrison,
      };
    }
    return s;
  });

  const newChronicle: ChronicleEvent = {
    id: `evt-${state.day}-${Date.now()}`,
    day: state.day,
    category: conqueredSettlementId ? 'CONQUEST' : 'WAR',
    text: conqueredSettlementId
      ? `${state.playerName}, kuşatma zaferiyle yeni bir mülkü ve bağlı köylerini sancağı altına aldı!`
      : `${state.playerName}, meydan savaşında düşman ordusunu bozguna uğrattı (+${renownGain} Nam, +${goldLoot} Dinar, ${describeLoot(loot)}).`,
  };

  return ensureBannerlordFoundation({
    ...state,
    gold: state.gold + goldLoot,
    renown: state.renown + renownGain,
    prisoners: state.prisoners + prisonersGain,
    morale: Math.min(100, state.morale + 10),
    battlesWon: state.battlesWon + 1,
    inventoryItems: [...(state.inventoryItems ?? []), ...loot],
    roster: nextRoster,
    lords: nextLords,
    settlements: nextSettlements,
    chronicle: [newChronicle, ...state.chronicle].slice(0, 20),
  });
}

// Canonical Regional Village Name Pools per Faction for Authentic Feudal Fiefs
const FACTION_VILLAGE_NAMES: Record<FactionId, string[]> = {
  player: ['Sancaktepe'],
  empire: [
    'Nideon', 'Agalmon', 'Carphenion', 'Palea', 'Tarcutis', 'Marathea', 'Oristocorys', 'Primessos',
    'Aeoria', 'Sestadeim', 'Vatatzes', 'Gessios', 'Dradios', 'Rhesos', 'Phasos', 'Crios',
    'Gamardan', 'Alision', 'Themys', 'Calocote', 'Leblenion', 'Dyopalis', 'Nortan', 'Sermenos',
    'Epinosa', 'Zestos', 'Tismil', 'Bergum', 'Meroc', 'Hispia', 'Pos', 'Thios',
    'Apsos', 'Mylea', 'Vacos', 'Cyrton', 'Kynon', 'Panoplia', 'Chanos', 'Golina',
    'Tevea', 'Zonica', 'Lavenia Köyü', 'Hertogea Köyü', 'Veron Köyü', 'Lochana Köyü', 'Onica Köyü',
  ],
  vlandia: [
    'Bruck', 'Drapand', 'Aldhan', 'Tarcut', 'Nulanc', 'Boran', 'Etirburg', 'Marei',
    'Chorn', 'Binhall', 'Lanbris', 'Rovalt Kıyısı', 'Ostican Burnu', 'Ocs Yaylası', 'Jaculan Vadisi',
    'Sargot Bağı', 'Charas Limanı', 'Caleus Köyü', 'Hongard Köyü', 'Tirby Köyü', 'Ormanfard Köyü',
  ],
  battania: [
    'Swenryn', 'Tor Melina', 'Bryn Glas', 'Imlagh', 'Cairngorm', 'Glintor', 'Morihig', 'Durn',
    'Fenon', 'Ath Cafal', 'Canton', 'Llanoc Köyü', 'Garontor Köyü', 'Ab Comer Köyü', 'Pendraic Köyü',
  ],
  sturgia: [
    'Kvol', 'Dvorusta', 'Iskra', 'Surmya', 'Ostrov', 'Varnov', 'Zimna', 'Shibal Zumr',
    'Borchov', 'Korsyas', 'Urik Köyü', 'Vladiv Köyü', 'Ov Köyü', 'Mazolm Köyü', 'Balgard Koyu', 'Sibir Obası',
  ],
  khuzait: [
    'Kushul', 'Asmait', 'Dulac', 'Karaka', 'Bozkırpınar', 'Makeb Yaylası', 'Ortongard Obası',
    'Akkalat Yurdu', 'Odokh Vahası', 'Baltakhand Obası', 'Simira Obası', 'Kaysar Obası',
    'Tepes Obası', 'Khimli Obası', 'Pabastan', 'Tebircan',
  ],
  aserai: [
    'Wadar', 'Baq', 'Tashba', 'Habiya', 'Nufar', 'Shabwa', 'Zimran', 'Quyaz Kıyısı',
    'Askar Vahası', 'Qasira Hurmalığı', 'Razih Pınarı', 'Husn Deltası', 'Tubilis Köyü',
    'Medeni Vahası', 'Barihal Vahası',
  ],
  bandits: ['Karageçit Obası'],
};

let cachedCanonicalSettlements: Settlement[] | null = null;

function buildCanonicalCalradiaSettlements(): Settlement[] {
  if (cachedCanonicalSettlements) {
    return cachedCanonicalSettlements.map((s) => ({
      ...s,
      recruitPool: { ...s.recruitPool },
    }));
  }

  // Core Towns (51), Castles (29), and Anchor Villages (9)
  const baseSettlements: Settlement[] = [
    // === EMPIRE (19 TOWNS, 9 CASTLES, 2 ANCHOR VILLAGES) ===
    {
      id: 'zeonica',
      name: 'Lycaron',
      type: 'TOWN',
      faction: 'empire',
      x: 24,
      z: 78,
      prosperity: 690,
      garrison: 65,
      recruitPool: { militia: 10, archer: 7, cavalry: 3, guard: 4 },
      foodStock: 52,
      description: 'Güney İmparatorluğunun sarp Lycaron sıradağları eteğindeki başkent şehri.',
    },
    {
      id: 'sancaktepe',
      name: 'Sancaktepe',
      type: 'VILLAGE',
      faction: 'player',
      x: 4,
      z: 98,
      prosperity: 340,
      garrison: 28,
      recruitPool: { militia: 10, archer: 6, cavalry: 3, guard: 2 },
      foodStock: 46,
      description: 'Lycaron vadisinde sancağınıza bağlı sadık köylülerin ve tahıl ambarlarının merkezi.',
      boundSettlementId: 'zeonica',
      boundSettlementName: 'Lycaron',
    },
    {
      id: 'canterion_village',
      name: 'Canterion',
      type: 'VILLAGE',
      faction: 'empire',
      x: 48,
      z: 118,
      prosperity: 310,
      garrison: 22,
      recruitPool: { militia: 8, archer: 5, cavalry: 2, guard: 1 },
      foodStock: 42,
      description: 'Lycaron nehir vadisinde zeytin ve buğday üretimiyle bilinen İmparatorluk köyü.',
      boundSettlementId: 'zeonica',
      boundSettlementName: 'Lycaron',
    },
    {
      id: 'poros',
      name: 'Poros',
      type: 'TOWN',
      faction: 'empire',
      x: -18,
      z: 142,
      prosperity: 620,
      garrison: 58,
      recruitPool: { militia: 9, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 48,
      description: 'Perassic İç Denizi kuzey ovalarını kontrol eden zengin İmparatorluk ticaret kenti.',
    },
    {
      id: 'zeonica_west',
      name: 'Zeonica',
      type: 'TOWN',
      faction: 'empire',
      x: -105,
      z: 138,
      prosperity: 650,
      garrison: 62,
      recruitPool: { militia: 9, archer: 8, cavalry: 3, guard: 4 },
      foodStock: 50,
      description: 'Batı İmparatorluğu tahıl ovalarının ve nehir ağzının incisi.',
    },
    {
      id: 'amitatys',
      name: 'Amitatys',
      type: 'TOWN',
      faction: 'empire',
      x: -68,
      z: 56,
      prosperity: 610,
      garrison: 56,
      recruitPool: { militia: 8, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 44,
      description: 'Orta Kalradya vadilerinin kavşağında yükselen tarihi İmparatorluk şehri.',
    },
    {
      id: 'rhotae',
      name: 'Rhotae',
      type: 'TOWN',
      faction: 'empire',
      x: -132,
      z: 2,
      prosperity: 640,
      garrison: 60,
      recruitPool: { militia: 9, archer: 7, cavalry: 4, guard: 4 },
      foodStock: 47,
      description: 'Dağ geçitleri ve nehir vadileri arasında stratejik İmparatorluk şehri.',
    },
    {
      id: 'jalmarys',
      name: 'Jalmarys',
      type: 'TOWN',
      faction: 'empire',
      x: -145,
      z: 86,
      prosperity: 590,
      garrison: 54,
      recruitPool: { militia: 8, archer: 6, cavalry: 3, guard: 3 },
      foodStock: 42,
      description: 'Batı İmparatorluk platolarının müstahkem garnizon şehri.',
    },
    {
      id: 'ortysia',
      name: 'Ortysia',
      type: 'TOWN',
      faction: 'empire',
      x: -232,
      z: 102,
      prosperity: 670,
      garrison: 64,
      recruitPool: { militia: 9, archer: 7, cavalry: 4, guard: 4 },
      foodStock: 52,
      description: 'Batı boğazını ve Perassic Denizi ticaretini tutan zengin liman kenti.',
    },
    {
      id: 'lageta',
      name: 'Lageta',
      type: 'TOWN',
      faction: 'empire',
      x: -218,
      z: -5,
      prosperity: 560,
      garrison: 52,
      recruitPool: { militia: 8, archer: 6, cavalry: 3, guard: 3 },
      foodStock: 40,
      description: 'Battaniya yaylaları sınırındaki müstahkem İmparatorluk sancağı.',
    },
    {
      id: 'epicrotea',
      name: 'Epicrotea',
      type: 'TOWN',
      faction: 'empire',
      x: -125,
      z: -125,
      prosperity: 610,
      garrison: 58,
      recruitPool: { militia: 9, archer: 7, cavalry: 3, guard: 4 },
      foodStock: 45,
      description: 'Kuzey körfezi kıyısında demir madenleriyle ünlü İmparatorluk şehri.',
    },
    {
      id: 'diathma',
      name: 'Diathma',
      type: 'TOWN',
      faction: 'empire',
      x: -55,
      z: -128,
      prosperity: 580,
      garrison: 54,
      recruitPool: { militia: 8, archer: 7, cavalry: 3, guard: 3 },
      foodStock: 43,
      description: 'Kuzey İmparatorluğunun nehir deltası ve kıyı ticareti merkezi.',
    },
    {
      id: 'argoron',
      name: 'Argoron',
      type: 'TOWN',
      faction: 'empire',
      x: 38,
      z: -158,
      prosperity: 595,
      garrison: 56,
      recruitPool: { militia: 8, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 44,
      description: 'Sturgia sınırı ve kuzey nehir vadilerini koruyan İmparatorluk kenti.',
    },
    {
      id: 'amprela',
      name: 'Amprela',
      type: 'TOWN',
      faction: 'empire',
      x: 148,
      z: -128,
      prosperity: 575,
      garrison: 54,
      recruitPool: { militia: 8, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 42,
      description: 'Kuzeydoğu İmparatorluk sınırında Makeb geçidine bakan müstahkem şehir.',
    },
    {
      id: 'saneopa',
      name: 'Saneopa',
      type: 'TOWN',
      faction: 'empire',
      x: 18,
      z: -58,
      prosperity: 600,
      garrison: 55,
      recruitPool: { militia: 8, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 44,
      description: 'Kuzey vadilerini Orta Kalradya ovalarına bağlayan yüksek plato şehri.',
    },
    {
      id: 'myzea',
      name: 'Myzea',
      type: 'TOWN',
      faction: 'empire',
      x: 128,
      z: -52,
      prosperity: 570,
      garrison: 52,
      recruitPool: { militia: 8, archer: 7, cavalry: 3, guard: 3 },
      foodStock: 41,
      description: 'Doğu sıradağlarının eteğinde yükselen Kuzey İmparatorluğu kenti.',
    },
    {
      id: 'phycaon',
      name: 'Phycaon',
      type: 'TOWN',
      faction: 'empire',
      x: 92,
      z: 62,
      prosperity: 615,
      garrison: 57,
      recruitPool: { militia: 9, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 46,
      description: 'Lycaron ile doğu gölü arasındaki bereketli vadinin koruyucu şehri.',
    },
    {
      id: 'syronea',
      name: 'Syronea',
      type: 'TOWN',
      faction: 'empire',
      x: 175,
      z: -4,
      prosperity: 590,
      garrison: 55,
      recruitPool: { militia: 8, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 44,
      description: 'Doğu iç gölünün güneybatı kıyısında Khuzait akınlarına karşı duran sınır şehri.',
    },
    {
      id: 'onira',
      name: 'Onira',
      type: 'TOWN',
      faction: 'empire',
      x: 178,
      z: 88,
      prosperity: 585,
      garrison: 53,
      recruitPool: { militia: 8, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 42,
      description: 'Güney iç göl boğazına bakan kervan ve ipek yolu merkezi.',
    },
    {
      id: 'danustica',
      name: 'Danustica',
      type: 'TOWN',
      faction: 'empire',
      x: 205,
      z: 158,
      prosperity: 660,
      garrison: 62,
      recruitPool: { militia: 9, archer: 8, cavalry: 4, guard: 4 },
      foodStock: 50,
      description: 'Doğu berzahını ve Perassic Denizi geçidini tutan stratejik İmparatorluk kenti.',
    },
    {
      id: 'vostrum',
      name: 'Vostrum',
      type: 'TOWN',
      faction: 'empire',
      x: 88,
      z: 162,
      prosperity: 645,
      garrison: 60,
      recruitPool: { militia: 9, archer: 7, cavalry: 4, guard: 4 },
      foodStock: 49,
      description: 'Güney İmparatorluğunun Perassic Denizi kıyısındaki büyük liman şehri.',
    },
    {
      id: 'lochana_castle',
      name: 'Lochana Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: 105,
      z: -165,
      prosperity: 420,
      garrison: 48,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 3 },
      foodStock: 36,
      description: 'Argoron ile Amprela arasındaki sarp kuzey dağ geçidini tutan İmparatorluk hisarı.',
    },
    {
      id: 'hertogea_castle',
      name: 'Hertogea Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: -95,
      z: 18,
      prosperity: 390,
      garrison: 42,
      recruitPool: { militia: 7, archer: 5, cavalry: 3, guard: 2 },
      foodStock: 34,
      description: 'Rhotae ile Amitatys arasındaki dağ boğazını tutan İmparatorluk kalesi.',
    },
    {
      id: 'veron_castle',
      name: 'Veron Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: -32,
      z: 112,
      prosperity: 405,
      garrison: 44,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 2 },
      foodStock: 35,
      description: 'Jalmarys ve Poros nehir kavşağını gözeten İmparatorluk hisarı.',
    },
    {
      id: 'lavenia_castle',
      name: 'Lavenia Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: 142,
      z: 122,
      prosperity: 410,
      garrison: 45,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 3 },
      foodStock: 36,
      description: 'Vostrum ile Danustica arasındaki kıyı ovasını koruyan kale.',
    },
    {
      id: 'gersegos_castle',
      name: 'Gersegos Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: -162,
      z: -52,
      prosperity: 395,
      garrison: 43,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 2 },
      foodStock: 34,
      description: 'Epicrotea ve Rhotae arasındaki sarp vadiyi tutan İmparatorluk kalesi.',
    },
    {
      id: 'gaos_castle',
      name: 'Gaos Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: -18,
      z: -98,
      prosperity: 390,
      garrison: 42,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 2 },
      foodStock: 34,
      description: 'Diathma ile Saneopa arasındaki kuzey sırtlarını gözetleyen hisar.',
    },
    {
      id: 'melion_castle',
      name: 'Melion Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: 152,
      z: -28,
      prosperity: 400,
      garrison: 44,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 2 },
      foodStock: 35,
      description: 'Myzea ve Syronea arasındaki doğu sıradağ geçidini koruyan İmparatorluk kalesi.',
    },
    {
      id: 'morenia_castle',
      name: 'Morenia Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: 68,
      z: 22,
      prosperity: 395,
      garrison: 43,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 2 },
      foodStock: 35,
      description: 'Lycaron ve Phycaon kuzeyindeki sarp vadileri tutan İmparatorluk kalesi.',
    },
    {
      id: 'onica_castle',
      name: 'Onica Kalesi',
      type: 'CASTLE',
      faction: 'empire',
      x: -178,
      z: 112,
      prosperity: 390,
      garrison: 42,
      recruitPool: { militia: 7, archer: 6, cavalry: 3, guard: 2 },
      foodStock: 34,
      description: 'Ortysia ile Zeonica arasındaki güneybatı kıyı geçidini tutan kale.',
    },

    // === VLANDIA (8 TOWNS, 4 CASTLES, 2 ANCHOR VILLAGES) ===
    {
      id: 'ostican',
      name: 'Ostican',
      type: 'TOWN',
      faction: 'vlandia',
      x: -458,
      z: -242,
      prosperity: 545,
      garrison: 52,
      recruitPool: { militia: 8, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 41,
      description: 'Vlandiya kuzeybatı yarımadasının en uç burnunu tutan müstahkem liman kenti.',
    },
    {
      id: 'rovalt',
      name: 'Rovalt',
      type: 'TOWN',
      faction: 'vlandia',
      x: -398,
      z: -238,
      prosperity: 560,
      garrison: 54,
      recruitPool: { militia: 8, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 42,
      description: 'Kuzeybatı kıyı şeridini ve Sturgia deniz yolunu gözetleyen Vlandiya kenti.',
    },
    {
      id: 'ocs_hall',
      name: 'Ocs Hall',
      type: 'TOWN',
      faction: 'vlandia',
      x: -378,
      z: -162,
      prosperity: 575,
      garrison: 54,
      recruitPool: { militia: 8, archer: 6, cavalry: 5, guard: 2 },
      foodStock: 43,
      description: 'Vlandiya şövalye hanedanlarının ormanlık yayla kenti.',
    },
    {
      id: 'pravend',
      name: 'Pravend',
      type: 'TOWN',
      faction: 'vlandia',
      x: -438,
      z: -122,
      prosperity: 630,
      garrison: 60,
      recruitPool: { militia: 9, archer: 6, cavalry: 5, guard: 3 },
      foodStock: 48,
      description: 'Vlandiya Krallığının batı ovaları ve nehir ağzındaki görkemli başkenti.',
    },
    {
      id: 'galend',
      name: 'Galend',
      type: 'TOWN',
      faction: 'vlandia',
      x: -472,
      z: -32,
      prosperity: 580,
      garrison: 55,
      recruitPool: { militia: 8, archer: 6, cavalry: 5, guard: 3 },
      foodStock: 45,
      description: 'Batı Okyanusu kıyısında zeytinlikleri ve tersaneleriyle ünlü Vlandiya şehri.',
    },
    {
      id: 'jaculan',
      name: 'Jaculan',
      type: 'TOWN',
      faction: 'vlandia',
      x: -425,
      z: 12,
      prosperity: 565,
      garrison: 53,
      recruitPool: { militia: 8, archer: 6, cavalry: 5, guard: 2 },
      foodStock: 43,
      description: 'Galend ile Sargot arasındaki nehir vadisini kontrol eden Vlandiya sancağı.',
    },
    {
      id: 'sargot',
      name: 'Sargot',
      type: 'TOWN',
      faction: 'vlandia',
      x: -358,
      z: 28,
      prosperity: 590,
      garrison: 56,
      recruitPool: { militia: 8, archer: 6, cavalry: 5, guard: 3 },
      foodStock: 45,
      description: 'Güney Vlandiya vadilerini ve taş yollarını kontrol eden müstahkem şehir.',
    },
    {
      id: 'charas',
      name: 'Charas',
      type: 'TOWN',
      faction: 'vlandia',
      x: -388,
      z: 92,
      prosperity: 540,
      garrison: 50,
      recruitPool: { militia: 8, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 42,
      description: 'Güneybatı körfezine ve takımadalara hakim Vlandiya deniz ticareti kenti.',
    },
    {
      id: 'caleus_castle',
      name: 'Caleus Kalesi',
      type: 'CASTLE',
      faction: 'vlandia',
      x: -412,
      z: -195,
      prosperity: 380,
      garrison: 42,
      recruitPool: { militia: 7, archer: 5, cavalry: 4, guard: 2 },
      foodStock: 34,
      description: 'Ostican Körfezi ile Ocs Hall arasındaki kıyı geçidini tutan Vlandiya kalesi.',
    },
    {
      id: 'hongard_castle',
      name: 'Hongard Kalesi',
      type: 'CASTLE',
      faction: 'vlandia',
      x: -395,
      z: 48,
      prosperity: 385,
      garrison: 43,
      recruitPool: { militia: 7, archer: 5, cavalry: 4, guard: 2 },
      foodStock: 35,
      description: 'Jaculan ve Charas arasındaki sırtları koruyan Vlandiya şövalye hisarı.',
    },
    {
      id: 'tirby_castle',
      name: 'Tirby Kalesi',
      type: 'CASTLE',
      faction: 'vlandia',
      x: -352,
      z: -222,
      prosperity: 375,
      garrison: 41,
      recruitPool: { militia: 7, archer: 5, cavalry: 4, guard: 2 },
      foodStock: 34,
      description: 'Rovalt ile Car Banseth sınırındaki kuzey geçidini tutan Vlandiya kalesi.',
    },
    {
      id: 'ormanfard_castle',
      name: 'Ormanfard Kalesi',
      type: 'CASTLE',
      faction: 'vlandia',
      x: -445,
      z: -78,
      prosperity: 380,
      garrison: 42,
      recruitPool: { militia: 7, archer: 5, cavalry: 4, guard: 2 },
      foodStock: 34,
      description: 'Pravend ile Galend arasındaki kıyı ovasını koruyan Vlandiya hisarı.',
    },
    {
      id: 'valanby_village',
      name: 'Valanby',
      type: 'VILLAGE',
      faction: 'vlandia',
      x: -458,
      z: -155,
      prosperity: 295,
      garrison: 20,
      recruitPool: { militia: 8, archer: 5, cavalry: 3, guard: 1 },
      foodStock: 38,
      description: 'Pravend kuzeyinde balıkçılık ve tahıl tarımıyla geçinen kıyı köyü.',
      boundSettlementId: 'pravend',
      boundSettlementName: 'Pravend',
    },
    {
      id: 'cantrec_village',
      name: 'Cantrec',
      type: 'VILLAGE',
      faction: 'vlandia',
      x: -435,
      z: -62,
      prosperity: 290,
      garrison: 20,
      recruitPool: { militia: 8, archer: 5, cavalry: 3, guard: 1 },
      foodStock: 38,
      description: 'Galend kuzeydoğusunda nehir mendereslerine bakan Vlandiya köyü.',
      boundSettlementId: 'galend',
      boundSettlementName: 'Galend',
    },

    // === BATTANIA (5 TOWNS, 4 CASTLES, 1 ANCHOR VILLAGE) ===
    {
      id: 'car_banseth',
      name: 'Car Banseth',
      type: 'TOWN',
      faction: 'battania',
      x: -315,
      z: -192,
      prosperity: 540,
      garrison: 52,
      recruitPool: { militia: 7, archer: 9, cavalry: 2, guard: 3 },
      foodStock: 40,
      description: 'Kuzey Battaniya ormanlarının ve sarp yayla geçitlerinin koruyucu kenti.',
    },
    {
      id: 'dunglanys',
      name: 'Dunglanys',
      type: 'TOWN',
      faction: 'battania',
      x: -298,
      z: -142,
      prosperity: 530,
      garrison: 50,
      recruitPool: { militia: 7, archer: 9, cavalry: 2, guard: 3 },
      foodStock: 39,
      description: 'Battaniya gölü kuzeydoğu yakasında okçu klanların merkezi.',
    },
    {
      id: 'seonon',
      name: 'Seonon',
      type: 'TOWN',
      faction: 'battania',
      x: -225,
      z: -132,
      prosperity: 545,
      garrison: 52,
      recruitPool: { militia: 7, archer: 9, cavalry: 2, guard: 3 },
      foodStock: 40,
      description: 'Sık çam ormanları ve sarp kayalıklarla çevrili Battaniya yayla şehri.',
    },
    {
      id: 'pen_cannoc',
      name: 'Pen Cannoc',
      type: 'TOWN',
      faction: 'battania',
      x: -298,
      z: -85,
      prosperity: 525,
      garrison: 48,
      recruitPool: { militia: 7, archer: 9, cavalry: 2, guard: 2 },
      foodStock: 38,
      description: 'Kil madenleri ve sarp vadi geçitleriyle ünlü Battaniya şehri.',
    },
    {
      id: 'marunath',
      name: 'Marunath',
      type: 'TOWN',
      faction: 'battania',
      x: -258,
      z: -68,
      prosperity: 560,
      garrison: 54,
      recruitPool: { militia: 7, archer: 10, cavalry: 2, guard: 3 },
      foodStock: 42,
      description: 'Battaniya dağ gölü güneydoğu vadisinde yükselen Ulu Orman kenti.',
    },
    {
      id: 'llanoc_hen_castle',
      name: 'Llanoc Hen Kalesi',
      type: 'CASTLE',
      faction: 'battania',
      x: -268,
      z: -162,
      prosperity: 375,
      garrison: 40,
      recruitPool: { militia: 6, archer: 8, cavalry: 2, guard: 2 },
      foodStock: 33,
      description: 'Car Banseth ile Seonon arasındaki orman sırtlarını koruyan Battaniya kalesi.',
    },
    {
      id: 'garontor_castle',
      name: 'Garontor Kalesi',
      type: 'CASTLE',
      faction: 'battania',
      x: -195,
      z: -85,
      prosperity: 370,
      garrison: 40,
      recruitPool: { militia: 6, archer: 8, cavalry: 2, guard: 2 },
      foodStock: 33,
      description: 'Battaniya yaylasından Lageta ve Rhotae ovalarına inen geçidi tutan kale.',
    },
    {
      id: 'ab_comer_castle',
      name: 'Ab Comer Kalesi',
      type: 'CASTLE',
      faction: 'battania',
      x: -342,
      z: -55,
      prosperity: 372,
      garrison: 40,
      recruitPool: { militia: 6, archer: 8, cavalry: 2, guard: 2 },
      foodStock: 33,
      description: 'Pen Cannoc batısında Vlandiya sınır boğazını gözetleyen Battaniya kalesi.',
    },
    {
      id: 'pendraic_castle',
      name: 'Pendraic Kalesi',
      type: 'CASTLE',
      faction: 'battania',
      x: -188,
      z: -158,
      prosperity: 375,
      garrison: 41,
      recruitPool: { militia: 6, archer: 8, cavalry: 2, guard: 2 },
      foodStock: 34,
      description: 'Seonon kuzeydoğusunda tarihi Pendraic Savaşı ovasına bakan kale.',
    },
    {
      id: 'glenlithrig_village',
      name: 'Glenlithrig',
      type: 'VILLAGE',
      faction: 'battania',
      x: -268,
      z: -112,
      prosperity: 285,
      garrison: 19,
      recruitPool: { militia: 6, archer: 8, cavalry: 1, guard: 1 },
      foodStock: 36,
      description: 'Battaniya gölü doğu yamacında kereste ve yay yapımıyla ünlü orman köyü.',
      boundSettlementId: 'dunglanys',
      boundSettlementName: 'Dunglanys',
    },

    // === STURGIA (7 TOWNS, 4 CASTLES, 2 ANCHOR VILLAGES) ===
    {
      id: 'revyl',
      name: 'Revyl',
      type: 'TOWN',
      faction: 'sturgia',
      x: -262,
      z: -278,
      prosperity: 515,
      garrison: 52,
      recruitPool: { militia: 9, archer: 4, cavalry: 2, guard: 4 },
      foodStock: 37,
      description: 'Sturgia batı burnunda kuzey denizini ve fiyort girişini tutan kale-şehir.',
    },
    {
      id: 'buzulkale',
      name: 'Varcheg',
      type: 'TOWN',
      faction: 'sturgia',
      x: -175,
      z: -245,
      prosperity: 535,
      garrison: 54,
      recruitPool: { militia: 9, archer: 4, cavalry: 2, guard: 4 },
      foodStock: 38,
      description: 'Kuzey körfezinin batı yakasında Sturgia donanma ve kalkan duvarı merkezi.',
    },
    {
      id: 'balgard',
      name: 'Balgard',
      type: 'TOWN',
      faction: 'sturgia',
      x: -42,
      z: -262,
      prosperity: 545,
      garrison: 55,
      recruitPool: { militia: 9, archer: 5, cavalry: 2, guard: 4 },
      foodStock: 39,
      description: 'Kuzey fiyort kanalı kıyısında yükselen karlı Sturgia kenti.',
    },
    {
      id: 'omor',
      name: 'Omor',
      type: 'TOWN',
      faction: 'sturgia',
      x: -58,
      z: -192,
      prosperity: 560,
      garrison: 55,
      recruitPool: { militia: 9, archer: 5, cavalry: 2, guard: 4 },
      foodStock: 40,
      description: 'Kuzey iç körfezi doğu yakasında İmparatorluk sınırına bakan zengin Sturgia limanı.',
    },
    {
      id: 'sibir',
      name: 'Sibir',
      type: 'TOWN',
      faction: 'sturgia',
      x: 68,
      z: -285,
      prosperity: 520,
      garrison: 52,
      recruitPool: { militia: 10, archer: 4, cavalry: 2, guard: 4 },
      foodStock: 36,
      description: 'Sturgia karlı sıradağlarının eteklerinde yükselen kuzey buzul kenti.',
    },
    {
      id: 'varnovapol',
      name: 'Varnovapol',
      type: 'TOWN',
      faction: 'sturgia',
      x: 48,
      z: -228,
      prosperity: 530,
      garrison: 53,
      recruitPool: { militia: 9, archer: 5, cavalry: 2, guard: 4 },
      foodStock: 38,
      description: 'Kuzey fiyordunun doğu yakasında kürk ticaretiyle ünlü Sturgia şehri.',
    },
    {
      id: 'tyal',
      name: 'Tyal',
      type: 'TOWN',
      faction: 'sturgia',
      x: 188,
      z: -265,
      prosperity: 530,
      garrison: 54,
      recruitPool: { militia: 9, archer: 5, cavalry: 3, guard: 4 },
      foodStock: 37,
      description: 'Doğu karlı sıradağ geçitlerine hükmeden müstahkem Sturgia kenti.',
    },
    {
      id: 'ov_castle',
      name: 'Ov Kalesi',
      type: 'CASTLE',
      faction: 'sturgia',
      x: -85,
      z: -235,
      prosperity: 365,
      garrison: 40,
      recruitPool: { militia: 8, archer: 4, cavalry: 2, guard: 3 },
      foodStock: 32,
      description: 'Omor Körfezi ile Balgard arasındaki buzul kıyı geçidini tutan kale.',
    },
    {
      id: 'urikskala_castle',
      name: 'Urikskala Kalesi',
      type: 'CASTLE',
      faction: 'sturgia',
      x: 92,
      z: -238,
      prosperity: 370,
      garrison: 41,
      recruitPool: { militia: 8, archer: 4, cavalry: 2, guard: 3 },
      foodStock: 32,
      description: 'Varnovapol ile Sibir arasındaki karlı vadiyi koruyan Sturgia hisarı.',
    },
    {
      id: 'vladiv_castle',
      name: 'Vladiv Kalesi',
      type: 'CASTLE',
      faction: 'sturgia',
      x: 134,
      z: -268,
      prosperity: 375,
      garrison: 42,
      recruitPool: { militia: 8, archer: 4, cavalry: 2, guard: 3 },
      foodStock: 33,
      description: 'Sibir ile Tyal arasındaki karlı sıradağ boğazını tutan Sturgia kalesi.',
    },
    {
      id: 'mazolm_castle',
      name: 'Mazolm Kalesi',
      type: 'CASTLE',
      faction: 'sturgia',
      x: -152,
      z: -198,
      prosperity: 368,
      garrison: 40,
      recruitPool: { militia: 8, archer: 4, cavalry: 2, guard: 3 },
      foodStock: 32,
      description: 'Varcheg güneyinde Epicrotea sınırını gözetleyen Sturgia kalesi.',
    },
    {
      id: 'forin_village',
      name: 'Forin',
      type: 'VILLAGE',
      faction: 'sturgia',
      x: -212,
      z: -258,
      prosperity: 275,
      garrison: 18,
      recruitPool: { militia: 8, archer: 4, cavalry: 1, guard: 2 },
      foodStock: 34,
      description: 'Revyl yarımadası berzahında balıkçılık ve kürk avcılığı yapılan kuzey köyü.',
      boundSettlementId: 'revyl',
      boundSettlementName: 'Revyl',
    },
    {
      id: 'kranirag_village',
      name: 'Kranirag',
      type: 'VILLAGE',
      faction: 'sturgia',
      x: 145,
      z: -255,
      prosperity: 280,
      garrison: 18,
      recruitPool: { militia: 8, archer: 4, cavalry: 2, guard: 2 },
      foodStock: 34,
      description: 'Tyal batısında demir ve çam kerestesi üreten karlı dağ köyü.',
      boundSettlementId: 'tyal',
      boundSettlementName: 'Tyal',
    },

    // === KHUZAIT (6 TOWNS, 4 CASTLES, 1 ANCHOR VILLAGE) ===
    {
      id: 'baltakhand_north',
      name: 'Baltakhand',
      type: 'TOWN',
      faction: 'khuzait',
      x: 292,
      z: -225,
      prosperity: 540,
      garrison: 54,
      recruitPool: { militia: 6, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 41,
      description: 'Kuzeydoğu bozkır dağlarının eteğinde Khuzait at sürülerinin merkezi.',
    },
    {
      id: 'baltakhand',
      name: 'Makeb',
      type: 'TOWN',
      faction: 'khuzait',
      x: 248,
      z: -125,
      prosperity: 580,
      garrison: 56,
      recruitPool: { militia: 6, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 44,
      description: 'Khuzait iç gölünün doğu yakasını tutan müstahkem bozkır şehri.',
    },
    {
      id: 'ortongard',
      name: 'Ortongard',
      type: 'TOWN',
      faction: 'khuzait',
      x: 318,
      z: -78,
      prosperity: 545,
      garrison: 52,
      recruitPool: { militia: 5, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 42,
      description: 'Uçsuz bucaksız doğu bozkır platosunun ortasında yükselen hanlık kenti.',
    },
    {
      id: 'makeb',
      name: 'Chaikand',
      type: 'TOWN',
      faction: 'khuzait',
      x: 252,
      z: -48,
      prosperity: 640,
      garrison: 62,
      recruitPool: { militia: 6, archer: 9, cavalry: 8, guard: 3 },
      foodStock: 48,
      description: 'Khuzait Hanlığının iç göl doğu kıyısındaki başkent otağı ve süvari merkezi.',
    },
    {
      id: 'akkalat',
      name: 'Akkalat',
      type: 'TOWN',
      faction: 'khuzait',
      x: 292,
      z: 25,
      prosperity: 530,
      garrison: 50,
      recruitPool: { militia: 5, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 40,
      description: 'Güney bozkır geçitlerini kontrol eden Khuzait atlı okçu sancağı.',
    },
    {
      id: 'odokh',
      name: 'Odokh',
      type: 'TOWN',
      faction: 'khuzait',
      x: 322,
      z: 88,
      prosperity: 525,
      garrison: 50,
      recruitPool: { militia: 5, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 39,
      description: 'Güneydoğu kanyonları ve bozkır sınırında yükselen Khuzait kervan şehri.',
    },
    {
      id: 'simira_castle',
      name: 'Simira Kalesi',
      type: 'CASTLE',
      faction: 'khuzait',
      x: 278,
      z: -162,
      prosperity: 375,
      garrison: 42,
      recruitPool: { militia: 5, archer: 7, cavalry: 6, guard: 2 },
      foodStock: 34,
      description: 'Baltakhand ile Makeb arasındaki kuzey bozkır yolunu tutan Khuzait kalesi.',
    },
    {
      id: 'kaysar_castle',
      name: 'Kaysar Kalesi',
      type: 'CASTLE',
      faction: 'khuzait',
      x: 282,
      z: 62,
      prosperity: 370,
      garrison: 41,
      recruitPool: { militia: 5, archer: 7, cavalry: 6, guard: 2 },
      foodStock: 33,
      description: 'Akkalat ve Odokh arasındaki güney bozkır geçidini koruyan hisar.',
    },
    {
      id: 'tepes_castle',
      name: 'Tepes Kalesi',
      type: 'CASTLE',
      faction: 'khuzait',
      x: 288,
      z: -102,
      prosperity: 372,
      garrison: 41,
      recruitPool: { militia: 5, archer: 7, cavalry: 6, guard: 2 },
      foodStock: 33,
      description: 'Makeb ile Ortongard arasındaki bozkır sırtlarını gözetleyen Khuzait hisarı.',
    },
    {
      id: 'khimli_castle',
      name: 'Khimli Kalesi',
      type: 'CASTLE',
      faction: 'khuzait',
      x: 268,
      z: -8,
      prosperity: 374,
      garrison: 42,
      recruitPool: { militia: 5, archer: 7, cavalry: 6, guard: 2 },
      foodStock: 34,
      description: 'Chaikand güneyinde iç göl çıkışını ve bozkır yolunu koruyan kale.',
    },
    {
      id: 'ulaan_village',
      name: 'Ulaan',
      type: 'VILLAGE',
      faction: 'khuzait',
      x: 275,
      z: -18,
      prosperity: 290,
      garrison: 20,
      recruitPool: { militia: 5, archer: 7, cavalry: 6, guard: 1 },
      foodStock: 37,
      description: 'Chaikand ile Akkalat arasındaki otlaklarda yılkı yetiştiren bozkır obası.',
      boundSettlementId: 'makeb',
      boundSettlementName: 'Chaikand',
    },

    // === ASERAI (6 TOWNS, 3 CASTLES, 1 ANCHOR VILLAGE) + BANDIT CASTLE ===
    {
      id: 'quyaz',
      name: 'Quyaz',
      type: 'TOWN',
      faction: 'aserai',
      x: -232,
      z: 202,
      prosperity: 600,
      garrison: 56,
      recruitPool: { militia: 7, archer: 7, cavalry: 5, guard: 3 },
      foodStock: 45,
      description: 'Batı boğazının güney yakasını tutan Aserai kıyı kalesi ve limanı.',
    },
    {
      id: 'askar',
      name: 'Askar',
      type: 'TOWN',
      faction: 'aserai',
      x: -168,
      z: 238,
      prosperity: 615,
      garrison: 58,
      recruitPool: { militia: 7, archer: 7, cavalry: 6, guard: 3 },
      foodStock: 47,
      description: 'Batı Nahasa vahalarında Aserai süvari kabilelerinin ve at yetiştiricilerinin şehri.',
    },
    {
      id: 'sanala',
      name: 'Sanala',
      type: 'TOWN',
      faction: 'aserai',
      x: -108,
      z: 248,
      prosperity: 685,
      garrison: 64,
      recruitPool: { militia: 8, archer: 7, cavalry: 5, guard: 4 },
      foodStock: 54,
      description: 'Perassic Denizi güney kıyısında Aserai Sultanlığının en zengin vaha şehri.',
    },
    {
      id: 'qasira',
      name: 'Qasira',
      type: 'TOWN',
      faction: 'aserai',
      x: 2,
      z: 268,
      prosperity: 590,
      garrison: 54,
      recruitPool: { militia: 7, archer: 7, cavalry: 5, guard: 3 },
      foodStock: 44,
      description: 'İç deniz güney sahilinde hurma vahaları ve kervansaraylarıyla ünlü şehir.',
    },
    {
      id: 'razih',
      name: 'Razih',
      type: 'TOWN',
      faction: 'aserai',
      x: 122,
      z: 262,
      prosperity: 580,
      garrison: 53,
      recruitPool: { militia: 7, archer: 7, cavalry: 5, guard: 3 },
      foodStock: 43,
      description: 'Nahasa çölü ile doğu iç deniz körfezi arasındaki stratejik Aserai kenti.',
    },
    {
      id: 'kehribar',
      name: 'Husn Fulq',
      type: 'TOWN',
      faction: 'aserai',
      x: 225,
      z: 218,
      prosperity: 625,
      garrison: 58,
      recruitPool: { militia: 7, archer: 7, cavalry: 5, guard: 3 },
      foodStock: 48,
      description: 'Güneydoğu nehir deltasını ve doğu berzahını koruyan müstahkem vaha şehri.',
    },
    {
      id: 'tubilis_castle',
      name: 'Tubilis Kalesi',
      type: 'CASTLE',
      faction: 'aserai',
      x: -198,
      z: 218,
      prosperity: 385,
      garrison: 42,
      recruitPool: { militia: 6, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 35,
      description: 'Quyaz ile Askar arasındaki kıyı yolunu koruyan Aserai sahil kalesi.',
    },
    {
      id: 'barihal_castle',
      name: 'Barihal Kalesi',
      type: 'CASTLE',
      faction: 'aserai',
      x: -48,
      z: 262,
      prosperity: 382,
      garrison: 42,
      recruitPool: { militia: 6, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 35,
      description: 'Sanala ile Qasira arasındaki çöl geçidini tutan Aserai kalesi.',
    },
    {
      id: 'medeni_castle',
      name: 'Medeni Kalesi',
      type: 'CASTLE',
      faction: 'aserai',
      x: 58,
      z: 265,
      prosperity: 380,
      garrison: 42,
      recruitPool: { militia: 6, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 35,
      description: 'Qasira ile Razih arasındaki vaha nehrini tutan Aserai kalesi.',
    },
    {
      id: 'abou_khih_village',
      name: 'Abou Khih',
      type: 'VILLAGE',
      faction: 'aserai',
      x: -62,
      z: 255,
      prosperity: 295,
      garrison: 20,
      recruitPool: { militia: 6, archer: 6, cavalry: 4, guard: 1 },
      foodStock: 39,
      description: 'Sanala doğusunda hurma bahçeleri ve kervan kuyularıyla ünlü vaha köyü.',
      boundSettlementId: 'sanala',
      boundSettlementName: 'Sanala',
    },
    {
      id: 'karagecit',
      name: 'Karageçit Hisarı',
      type: 'CASTLE',
      faction: 'bandits',
      x: -62,
      z: 102,
      prosperity: 260,
      garrison: 30,
      recruitPool: { militia: 7, archer: 4, cavalry: 2, guard: 1 },
      foodStock: 28,
      description: 'Orta Kalradya sarp dağ geçidini tutan asi savaş ağalarının müstahkem kalesi.',
    },
  ];

  // Deterministically generate bound villages so EVERY TOWN has 2 villages and EVERY CASTLE has 1 village!
  const allSettlements: Settlement[] = [...baseSettlements];
  const nameCounters: Record<FactionId, number> = {
    player: 0,
    empire: 0,
    vlandia: 0,
    battania: 0,
    sturgia: 0,
    khuzait: 0,
    aserai: 0,
    bandits: 0,
  };

  const usedNames = new Set(allSettlements.map((s) => s.name));

  function findDryVillageSpot(parentX: number, parentZ: number, seedIdx: number): { x: number; z: number } {
    const radii = [11.5, 14.5, 17.5, 20.5, 24.0, 28.0];
    for (let rIdx = 0; rIdx < radii.length; rIdx++) {
      const rad = radii[rIdx];
      for (let step = 0; step < 16; step++) {
        const angle = ((seedIdx * 5 + step * 3) % 16) * ((Math.PI * 2) / 16) + rIdx * 0.22;
        const cx = Math.max(-476, Math.min(336, Math.round(parentX + Math.cos(angle) * rad)));
        const cz = Math.max(-288, Math.min(278, Math.round(parentZ + Math.sin(angle) * rad)));

        const h = groundHeightAt(cx, cz);
        if (h < 0.65 || h > 9.5) continue;

        const { dist: rDist, width: rWidth } = distanceToRiverNetwork(cx, cz);
        if (rDist < rWidth * 1.65) continue;

        let tooClose = false;
        for (let i = 0; i < allSettlements.length; i++) {
          const other = allSettlements[i];
          const minSep = other.type === 'VILLAGE' ? 6.8 : 8.4;
          if (Math.hypot(cx - other.x, cz - other.z) < minSep) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          return { x: cx, z: cz };
        }
      }
    }
    const fallback = snapToNearestLand(
      Math.max(-475, Math.min(335, parentX + (seedIdx % 2 === 0 ? 11 : -11))),
      Math.max(-285, Math.min(275, parentZ + (seedIdx % 3 === 0 ? 11 : -11))),
    );
    return { x: Math.round(fallback.x), z: Math.round(fallback.z) };
  }

  const townsAndCastles = baseSettlements.filter((s) => s.type === 'TOWN' || s.type === 'CASTLE');
  townsAndCastles.forEach((parent, pIdx) => {
    const requiredVillages = parent.type === 'TOWN' ? 2 : 1;
    const existingBound = allSettlements.filter(
      (s) => s.type === 'VILLAGE' && s.boundSettlementId === parent.id,
    );
    const needed = requiredVillages - existingBound.length;

    for (let v = 0; v < needed; v++) {
      const pool = FACTION_VILLAGE_NAMES[parent.faction] || FACTION_VILLAGE_NAMES.empire;
      let vName = '';
      while (nameCounters[parent.faction] < pool.length) {
        const candidate = pool[nameCounters[parent.faction]++];
        if (!usedNames.has(candidate)) {
          vName = candidate;
          break;
        }
      }
      if (!vName) {
        const baseClean = parent.name
          .replace(' Kalesi', '')
          .replace(' Castle', '')
          .replace(' Hisarı', '');
        vName = v === 0 && needed === 1 ? `${baseClean} Köyü` : `${baseClean} ${v + 1}. Köyü`;
      }
      usedNames.add(vName);

      const spot = findDryVillageSpot(parent.x, parent.z, pIdx * 3 + v + 1);
      const villageId = `${parent.id}_village_${existingBound.length + v + 1}`;

      // Register compact terrace in SETTLEMENT_TERRACES so every village sits on flat ground
      SETTLEMENT_TERRACES.push({ x: spot.x, z: spot.z, radius: 5 });

      const basePool = parent.recruitPool;
      allSettlements.push({
        id: villageId,
        name: vName,
        type: 'VILLAGE',
        faction: parent.faction,
        x: spot.x,
        z: spot.z,
        prosperity: 270 + ((pIdx * 17 + v * 13) % 55),
        garrison: 18 + ((pIdx + v) % 7),
        recruitPool: {
          militia: Math.max(5, basePool.militia - 1),
          archer: Math.max(4, basePool.archer - 1),
          cavalry: Math.max(1, basePool.cavalry - 1),
          guard: 1,
        },
        foodStock: 34 + ((pIdx * 7 + v * 5) % 12),
        description: `${parent.name} mülküne bağlı, erzak ve gönüllü asker sağlayan kırsal köy yerleşimi.`,
        boundSettlementId: parent.id,
        boundSettlementName: parent.name,
      });
    }
  });

  // Register flat valley plateau for every single Town, Castle, and Bound Village so no settlement is ever buried by a mountain
  for (let i = 0; i < allSettlements.length; i++) {
    const s = allSettlements[i];
    const radius = s.type === 'TOWN' ? 14.5 : s.type === 'CASTLE' ? 11.2 : 8.0;
    registerSettlementTerrace(s.x, s.z, radius);
  }

  cachedCanonicalSettlements = allSettlements;
  return allSettlements.map((s) => ({
    ...s,
    recruitPool: { ...s.recruitPool },
  }));
}

// Pre-register all 211 canonical settlement terraces at module load so terrain mesh & textures always flatten all settlements
buildCanonicalCalradiaSettlements();

export function createInitialCampaignState(
  playerName = 'Komutan Demirhan',
  backgroundId: 'noble' | 'steppe' | 'tactician' = 'noble',
): CampaignState {
  const initialRoster: TroopRoster =
    backgroundId === 'steppe'
      ? { militia: 4, archer: 5, cavalry: 6, guard: 1 }
      : backgroundId === 'tactician'
        ? { militia: 6, archer: 7, cavalry: 2, guard: 3 }
        : { militia: 6, archer: 4, cavalry: 4, guard: 3 };

  const initialGold = backgroundId === 'noble' ? 680 : backgroundId === 'tactician' ? 620 : 550;
  const initialRenown = backgroundId === 'noble' ? 65 : 45;

  // Faz B0: her yerleşimin kendi ileri gelenleri (deterministik, kayda yazılır).
  const settlements: Settlement[] = ensureNotables(buildCanonicalCalradiaSettlements());

  const lords: LordAgent[] = [
    {
      id: 'lord-rhagaea',
      name: 'Rhagaea',
      title: 'İmparatoriçe',
      faction: 'empire',
      personality: 'Diplomatik, stratejik vizyonu derin, ticaret ve meşruiyeti önemseyen imparatoriçe',
      relation: 18,
      x: 28,
      z: 92,
      targetX: 24,
      targetZ: 78,
      armySize: 28,
      roster: { militia: 10, archer: 8, cavalry: 5, guard: 5 },
      wounded: 2,
      prisoners: 4,
      morale: 86,
      foodDays: 14,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Lycaron vadisini koruyor',
      bannerColor: '#581c87',
    },
    {
      id: 'lord-kargi',
      name: 'Kargı',
      title: 'Savaş Ağası',
      faction: 'bandits',
      personality: 'Acımasız, yağma ve ganimet peşinde koşan, yalnızca kılıçtan anlayan asi komutan',
      relation: -45,
      x: -18,
      z: 122,
      targetX: 4,
      targetZ: 98,
      armySize: 16,
      roster: { militia: 7, archer: 4, cavalry: 4, guard: 1 },
      wounded: 1,
      prisoners: 5,
      morale: 74,
      foodDays: 9,
      isAtWarWithPlayer: true,
      isAlliedWithPlayer: false,
      currentAction: 'Sancaktepe - Poros yolunda pusu kuruyor',
      bannerColor: '#44403c',
    },
    {
      id: 'lord-garios',
      name: 'Garios',
      title: 'General',
      faction: 'empire',
      personality: 'Askeri disipline bağlı, lejyonların gücüyle İmparatorluğu birleştirmek isteyen komutan',
      relation: 10,
      x: -95,
      z: 112,
      targetX: -105,
      targetZ: 138,
      armySize: 36,
      roster: { militia: 14, archer: 10, cavalry: 6, guard: 6 },
      wounded: 3,
      prisoners: 6,
      morale: 84,
      foodDays: 15,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Zeonica ve Amitatys hattını denetliyor',
      bannerColor: '#6b21a8',
    },
    {
      id: 'lord-lucon',
      name: 'Lucon',
      title: 'Arkon',
      faction: 'empire',
      personality: 'Senato yasalarına ve kadim İmparatorluk geleneklerine sadık devlet adamı',
      relation: 14,
      x: 42,
      z: -55,
      targetX: 18,
      targetZ: -58,
      armySize: 34,
      roster: { militia: 12, archer: 10, cavalry: 6, guard: 6 },
      wounded: 2,
      prisoners: 3,
      morale: 82,
      foodDays: 13,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Saneopa ve Myzea sınırını koruyor',
      bannerColor: '#4c1d95',
    },
    {
      id: 'lord-derthert',
      name: 'Derthert',
      title: 'Kral',
      faction: 'vlandia',
      personality: 'Gururlu, feodal geleneklere bağlı, güçlü ordulara saygı duyan pragmatist hükümdar',
      relation: 12,
      x: -412,
      z: -115,
      targetX: -438,
      targetZ: -122,
      armySize: 40,
      roster: { militia: 14, archer: 10, cavalry: 10, guard: 6 },
      wounded: 4,
      prisoners: 7,
      morale: 88,
      foodDays: 16,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Pravend - Galend kraliyet yolunu denetliyor',
      bannerColor: '#991b1b',
    },
    {
      id: 'lord-caladog',
      name: 'Caladog',
      title: 'Yüksek Kral',
      faction: 'battania',
      personality: 'Atılgan, orman pusularında usta, bağımsızlığına düşkün yayla savaşçısı',
      relation: 10,
      x: -252,
      z: -82,
      targetX: -258,
      targetZ: -68,
      armySize: 34,
      roster: { militia: 10, archer: 16, cavalry: 3, guard: 5 },
      wounded: 2,
      prisoners: 4,
      morale: 85,
      foodDays: 12,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Battaniya dağ gölü koruluklarını kolaçan ediyor',
      bannerColor: '#166534',
    },
    {
      id: 'lord-raganvad',
      name: 'Raganvad',
      title: 'Büyük Prens',
      faction: 'sturgia',
      personality: 'Sert mizaçlı, kuzey disiplinini ve kalkan duvarını her şeyin üstünde tutan prens',
      relation: 5,
      x: 62,
      z: -255,
      targetX: 68,
      targetZ: -285,
      armySize: 36,
      roster: { militia: 16, archer: 8, cavalry: 4, guard: 8 },
      wounded: 3,
      prisoners: 5,
      morale: 80,
      foodDays: 14,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Sibir ve Varnovapol karlı geçidini bekliyor',
      bannerColor: '#1e3a8a',
    },
    {
      id: 'lord-monchug',
      name: 'Monchug',
      title: 'Kağan',
      faction: 'khuzait',
      personality: 'Cesur, doğrudan konuşan, savaş meydanındaki atlı hücumlara değer veren bozkır hanı',
      relation: 8,
      x: 262,
      z: -62,
      targetX: 252,
      targetZ: -48,
      armySize: 42,
      roster: { militia: 10, archer: 12, cavalry: 15, guard: 5 },
      wounded: 3,
      prisoners: 8,
      morale: 89,
      foodDays: 15,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Chaikand ve Makeb iç göl kıyısını tutuyor',
      bannerColor: '#0f766e',
    },
    {
      id: 'lord-unqid',
      name: 'Unqid',
      title: 'Sultan',
      faction: 'aserai',
      personality: 'Bilge, kervan yollarını ve çöl kabileleri arasındaki dengeyi gözeten sultan',
      relation: 15,
      x: -55,
      z: 258,
      targetX: -108,
      targetZ: 248,
      armySize: 38,
      roster: { militia: 12, archer: 10, cavalry: 10, guard: 6 },
      wounded: 2,
      prisoners: 5,
      morale: 87,
      foodDays: 16,
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Sanala ve Qasira vaha hattını koruyor',
      bannerColor: '#b45309',
    },
  ];

  const chronicle: ChronicleEvent[] = [
    {
      id: 'init-1',
      day: 1,
      category: 'DIPLOMACY',
      text: `${playerName}, Lycaron ve Sancaktepe vadisinde sancağını göndere çekti ve Kalradya kıtasında seferine başladı.`,
    },
    {
      id: 'init-2',
      day: 1,
      category: 'WAR',
      text: 'Kuzeyde Sturgia fiyortlarından güneyde Aserai vahalarına kadar 6 büyük krallık sınır garnizonlarını seferber etti.',
    },
    {
      id: 'init-3',
      day: 1,
      category: 'ECONOMY',
      text: 'Danustica, Zeonica, Pravend ve Chaikand arasındaki kıtasal kervan yolları ticarete açıldı.',
    },
  ];

  return ensureBannerlordFoundation({
    playerName,
    backgroundId,
    day: 1,
    hour: 9,
    season: 'Yaz',
    gold: initialGold,
    food: 36,
    renown: initialRenown,
    morale: 86,
    playerHp: 120,
    playerMaxHp: 120,
    playerX: 14,
    playerZ: 88,
    roster: initialRoster,
    prisoners: 2,
    battlesWon: 0,
    settlements,
    lords: [...lords, ...generateLordParties(settlements, new Set(lords.map((l) => l.id)))].map((l) => ({
      ...l,
      morphDNA: l.morphDNA || getLordDNA(l.id, l.faction),
    })),
    chronicle,
    world: {
      seed: 20261021,
      // Faz 11: kıta başlangıçta iki sınır savaşıyla açılır (Bannerlord'un açılış durumu gibi).
      wars: [
        { a: 'vlandia', b: 'battania', sinceDay: 1, score: 4, sieges: 0 },
        { a: 'empire', b: 'sturgia', sinceDay: 1, score: -3, sieges: 0 },
      ],
      stats: { ...EMPTY_WORLD_STATS },
    },
    playerMorphDNA: cloneDNA(PLAYER_DEFAULT_DNA),
    characterLevel: 6,
    freeAttributePoints: 2,
    freeFocusPoints: 4,
    attributes: {
      VIGOR: backgroundId === 'noble' ? 5 : 4,
      CONTROL: backgroundId === 'steppe' ? 5 : 3,
      ENDURANCE: backgroundId === 'steppe' ? 5 : 4,
      CUNNING: backgroundId === 'tactician' ? 5 : 3,
      SOCIAL: backgroundId === 'noble' ? 5 : 4,
      INTELLIGENCE: backgroundId === 'tactician' ? 5 : 4,
    },
    skills: {
      oneHanded: { level: 95, focus: 3 },
      twoHanded: { level: 45, focus: 1 },
      polearm: { level: 85, focus: 3 },
      bow: { level: 70, focus: 2 },
      crossbow: { level: 25, focus: 1 },
      throwing: { level: 35, focus: 1 },
      riding: { level: 110, focus: 4 },
      athletics: { level: 65, focus: 2 },
      smithing: { level: 60, focus: 2 },
      scouting: { level: 80, focus: 3 },
      tactics: { level: 90, focus: 3 },
      roguery: { level: 30, focus: 1 },
      charm: { level: 105, focus: 3 },
      leadership: { level: 120, focus: 4 },
      trade: { level: 65, focus: 2 },
      steward: { level: 115, focus: 4 },
      medicine: { level: 80, focus: 3 },
      engineering: { level: 75, focus: 2 },
    },
    unlockedPerks: ['shield_wall_master', 'full_speed_charge', 'spartan_rations'],
    outfitMode: 'BATTLE',
    equipment: {
      HEAD: 'İmparatorluk Miğferi (+38 Baş Zırhı)',
      SHOULDER: 'Pullu Omuzluk & Pelerin (+16 Gövde/Kol)',
      BODY: 'Lamellar Süvari Zırhı (+52 Gövde Zırhı)',
      GLOVES: 'Çelik Bileklikli Eldiven (+22 Kol Zırhı)',
      LEG: 'Zincir Zırhlı Süvari Çizmesi (+26 Bacak Zırhı)',
      MOUNT: 'Asil Kalradya Küheylanı (Hız: 64 · Hücum: 28)',
      HARNESS: 'Yarım Pullu At Zırhı (+42 Binek Zırhı)',
      BANNER: 'Altın Kartal Sancağı (+%10 Yakın Dövüş Hasarı)',
      WEAPON1: 'Thamaskene İmparatorluk Spathası (Kesici: 84)',
      WEAPON2: 'Ağır Süvari Kalkanı (Dayanıklılık: 480)',
      WEAPON3: 'Kontos Ağır Süvari Kargısı (Delici: 135)',
      WEAPON4: 'Kompozit Bozkır Yayı & Zırh Delici Sadak',
    },
    inventoryItems: [
      {
        id: 'item_thamaskene_sword',
        name: 'Thamaskene Çift Elli Falx Kılıcı',
        slot: 'WEAPON1',
        value: 540,
        weight: 2.4,
        statBonus: '+96 Kesici Hasar · Kalkan Kırıcı',
        civilianLegal: false,
      },
      {
        id: 'item_imperial_helm',
        name: 'Altın Kakmalı Katafrakt Miğferi',
        slot: 'HEAD',
        value: 620,
        weight: 3.1,
        statBonus: '+48 Baş Zırhı · +4 İtibar',
        civilianLegal: false,
      },
      {
        id: 'item_cataphract_armor',
        name: 'Ağır İmparatorluk Katafrakt Zırhı',
        slot: 'BODY',
        value: 980,
        weight: 11.5,
        statBonus: '+64 Gövde Zırhı · +22 Bacak Zırhı',
        civilianLegal: false,
      },
      {
        id: 'item_noble_steed',
        name: 'Safkan Aserai Savaş Küheylanı',
        slot: 'MOUNT',
        value: 750,
        weight: 0,
        statBonus: 'Hız: 68 · Manevra: 72 · +20kg Taşıma',
        civilianLegal: true,
      },
      {
        id: 'item_dragon_banner',
        name: 'Kalradya Ejderha Sancağı',
        slot: 'BANNER',
        value: 1200,
        weight: 1.0,
        statBonus: '+%15 Ordu Morali · +%12 Hücum Hasarı',
        civilianLegal: true,
      },
      {
        id: 'item_sumpter_mule',
        name: 'Kervan Yük Katırı (x3)',
        slot: 'TRADE',
        value: 240,
        weight: 0,
        statBonus: '+300 kg Ordu Taşıma Kapasitesi',
        civilianLegal: true,
      },
    ],
    clanRoles: {
      QUARTERMASTER: 'Komutan Demirhan (+45 Birlik Kapasitesi)',
      SCOUT: 'İzci Aybars (+%12 Harita Görüşü & Hız)',
      SURGEON: 'Hekim Helena (+%25 Yaralı Kurtarma)',
      ENGINEER: 'Mimar Torvald (+%30 Kuşatma İnşası)',
    },
  });
}

export function calculateLearningLimit(attributeValue: number, focusPoints: number): number {
  const safeAttr = Math.max(1, Math.min(10, attributeValue));
  const safeFocus = Math.max(0, Math.min(5, focusPoints));
  return (safeAttr - 1) * 14 + safeFocus * 40 + 10;
}

export function calculateClanTier(renown: number): {
  tier: number;
  maxPartyBonus: number;
  nextRenown: number;
  title: string;
} {
  if (renown >= 6150) return { tier: 6, maxPartyBonus: 150, nextRenown: 10000, title: 'İmparatorluk Hanedanı (Kademe 6)' };
  if (renown >= 2350) return { tier: 5, maxPartyBonus: 125, nextRenown: 6150, title: 'Ulu Soylu Klan (Kademe 5)' };
  if (renown >= 900) return { tier: 4, maxPartyBonus: 100, nextRenown: 2350, title: 'Krallık Kurucu Klan (Kademe 4)' };
  if (renown >= 350) return { tier: 3, maxPartyBonus: 75, nextRenown: 900, title: 'Sancakbeyi Klanı (Kademe 3)' };
  if (renown >= 150) return { tier: 2, maxPartyBonus: 50, nextRenown: 350, title: 'Derebeyi / Vasal Klanı (Kademe 2)' };
  if (renown >= 50) return { tier: 1, maxPartyBonus: 25, nextRenown: 150, title: 'Paralı Asker Sancağı (Kademe 1)' };
  return { tier: 0, maxPartyBonus: 15, nextRenown: 50, title: 'Gezgin Sancak (Kademe 0)' };
}

export function allocateAttributePoint(
  state: CampaignState,
  attrId: AttributeId,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const freePts = state.freeAttributePoints ?? 0;
  if (freePts <= 0) {
    return { success: false, reason: 'Kullanılabilir Nitelik Puanı (Attribute Point) kalmadı.', nextState: state };
  }
  const currentAttrs = state.attributes ?? {
    VIGOR: 4,
    CONTROL: 3,
    ENDURANCE: 4,
    CUNNING: 3,
    SOCIAL: 4,
    INTELLIGENCE: 4,
  };
  if (currentAttrs[attrId] >= 10) {
    return { success: false, reason: 'Bu nitelik maksimum seviyeye (10) ulaştı.', nextState: state };
  }
  return {
    success: true,
    nextState: {
      ...state,
      freeAttributePoints: freePts - 1,
      attributes: {
        ...currentAttrs,
        [attrId]: currentAttrs[attrId] + 1,
      },
    },
  };
}

export function allocateFocusPoint(
  state: CampaignState,
  skillId: BannerlordSkillId,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const freeFocus = state.freeFocusPoints ?? 0;
  if (freeFocus <= 0) {
    return { success: false, reason: 'Kullanılabilir Odak Puanı (Focus Point) kalmadı.', nextState: state };
  }
  const baseSkills = state.skills ?? createInitialCampaignState().skills!;
  const currentSkill = baseSkills[skillId] ?? { level: 50, focus: 1 };
  if (currentSkill.focus >= 5) {
    return { success: false, reason: 'Bir beceriye en fazla 5 Odak Puanı verilebilir.', nextState: state };
  }
  return {
    success: true,
    nextState: {
      ...state,
      freeFocusPoints: freeFocus - 1,
      skills: {
        ...baseSkills,
        [skillId]: {
          level: currentSkill.level,
          focus: currentSkill.focus + 1,
        },
      },
    },
  };
}

export function equipInventoryItem(
  state: CampaignState,
  itemId: string,
): { success: boolean; reason?: string; nextState: CampaignState } {
  // Eski oyuncu-only API artık her kahramanın kullandığı tek kuşanma
  // çekirdeğine devreder; aktif set ve sivil yasallık orada doğrulanır.
  const result = equipInventoryItemForHero(state, PLAYER_HERO_ID, itemId);
  return {
    success: result.success,
    reason: result.reason,
    nextState: result.nextState,
  };
}

export function upgradeSettlementBuilding(
  state: CampaignState,
  settlementId: string,
  buildingId: BuildingProjectId,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const idx = state.settlements.findIndex((s) => s.id === settlementId);
  if (idx === -1) return { success: false, reason: 'Yerleşim bulunamadı.', nextState: state };
  const s = state.settlements[idx];
  if (s.type === 'VILLAGE') {
    return { success: false, reason: 'Bina projeleri yalnızca Şehir ve Kalelerde inşa edilebilir.', nextState: state };
  }
  const currentBuildings: Record<BuildingProjectId, number> = s.buildings ?? {
    FORTIFICATIONS: s.wallLevel ?? 2,
    GRANARY: 1,
    BARRACKS: 1,
    FAIRGROUNDS: 1,
    FORUM: 1,
    AQUEDUCTS: 1,
  };
  const currentLevel = currentBuildings[buildingId] ?? 1;
  if (currentLevel >= 3) {
    return { success: false, reason: 'Bu bina projesi zaten maksimum seviyede (Seviye III).', nextState: state };
  }
  const upgradeCost = currentLevel === 1 ? 180 : 320;
  if (state.gold < upgradeCost) {
    return {
      success: false,
      reason: `Bina yükseltmesi için ${upgradeCost} Dinar gerekiyor.`,
      nextState: state,
    };
  }
  const nextLevel = currentLevel + 1;
  const nextSettlements = state.settlements.map((item, i) =>
    i === idx
      ? {
          ...item,
          wallLevel: buildingId === 'FORTIFICATIONS' ? nextLevel : item.wallLevel ?? 2,
          foodStock: buildingId === 'GRANARY' ? item.foodStock + 25 : item.foodStock,
          garrison: buildingId === 'BARRACKS' ? item.garrison + 6 : item.garrison,
          loyalty:
            buildingId === 'FAIRGROUNDS'
              ? Math.min(100, (item.loyalty ?? 82) + 8)
              : item.loyalty ?? 82,
          prosperity:
            buildingId === 'AQUEDUCTS' ? item.prosperity + 45 : item.prosperity + 15,
          buildings: {
            ...currentBuildings,
            [buildingId]: nextLevel,
          },
        }
      : item,
  );
  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - upgradeCost,
      renown: buildingId === 'FORUM' ? state.renown + 8 : state.renown + 3,
      settlements: nextSettlements,
      chronicle: [
        {
          id: `bldg-${state.day}-${settlementId}-${buildingId}`,
          day: state.day,
          category: 'ECONOMY',
          text: `${s.name} mülkünde ${buildingId} projesi Seviye ${nextLevel} kademesine yükseltildi.`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export function setSettlementDailyDefault(
  state: CampaignState,
  settlementId: string,
  defaultType: SettlementDailyDefault,
): { success: boolean; nextState: CampaignState } {
  const nextSettlements = state.settlements.map((s) => {
    if (s.id !== settlementId) return s;
    return {
      ...s,
      dailyDefault: defaultType,
      loyalty: defaultType === 'FESTIVAL' ? Math.min(100, (s.loyalty ?? 82) + 3) : s.loyalty,
      prosperity: defaultType === 'HOUSING' || defaultType === 'IRRIGATION' ? s.prosperity + 10 : s.prosperity,
      militia: defaultType === 'MILITIA' ? (s.militia ?? 40) + 4 : s.militia,
    };
  });
  return {
    success: true,
    nextState: {
      ...state,
      settlements: nextSettlements,
    },
  };
}

export function buyOrChangeWorkshop(
  state: CampaignState,
  settlementId: string,
  workshopType: WorkshopTypeId,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const idx = state.settlements.findIndex((s) => s.id === settlementId);
  if (idx === -1) return { success: false, reason: 'Şehir bulunamadı.', nextState: state };
  const s = state.settlements[idx];
  if (s.type !== 'TOWN') {
    return { success: false, reason: 'Atölyeler (Workshops) yalnızca büyük şehirlerde kurulabilir.', nextState: state };
  }
  const cost = 220;
  if (state.gold < cost) {
    return { success: false, reason: `Atölye satın almak için ${cost} Dinar gerekiyor.`, nextState: state };
  }
  const nextSettlements = state.settlements.map((item, i) =>
    i === idx
      ? {
          ...item,
          workshopType,
          workshopOwner: 'player' as const,
          prosperity: item.prosperity + 25,
        }
      : item,
  );
  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - cost,
      renown: state.renown + 4,
      settlements: nextSettlements,
      chronicle: [
        {
          id: `workshop-${state.day}-${settlementId}`,
          day: state.day,
          category: 'ECONOMY',
          text: `${s.name} şehrinde ${workshopType} atölyesi satın alındı; günlük kervan üretimi başladı.`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export function forgeCustomWeaponAtSmithy(
  state: CampaignState,
  settlementId: string,
  blueprintId: 'SPATHA' | 'FALX' | 'LANCE',
): { success: boolean; reason?: string; weaponName?: string; profitGold?: number; nextState: CampaignState } {
  const s = state.settlements.find((item) => item.id === settlementId);
  if (!s || s.type !== 'TOWN') {
    return { success: false, reason: 'Demirci Ocağı yalnızca şehirlerde bulunur.', nextState: state };
  }
  const materialCost = blueprintId === 'LANCE' ? 95 : blueprintId === 'FALX' ? 80 : 65;
  if (state.gold < materialCost) {
    return {
      success: false,
      reason: `Demir cevheri ve odun kömürü için ${materialCost} Dinar gerekiyor.`,
      nextState: state,
    };
  }
  const weaponMeta =
    blueprintId === 'LANCE'
      ? { name: 'Usta İşi Kalradya Kontos Kargısı', profit: 195, stat: '+148 Hücum Delici Hasar' }
      : blueprintId === 'FALX'
        ? { name: 'Thamaskene Çift Elli Savaş Falxı', profit: 165, stat: '+104 Kesici ZırhYaran' }
        : { name: 'Altın Kabzalı İmparatorluk Spathası', profit: 140, stat: '+88 Hızlı Kesici Hasar' };

  const baseSkills = state.skills ?? createInitialCampaignState().skills!;
  const currentSmithing = baseSkills.smithing ?? { level: 60, focus: 2 };

  return {
    success: true,
    weaponName: weaponMeta.name,
    profitGold: weaponMeta.profit,
    nextState: {
      ...state,
      gold: state.gold - materialCost + weaponMeta.profit,
      renown: state.renown + 3,
      skills: {
        ...baseSkills,
        smithing: {
          ...currentSmithing,
          level: currentSmithing.level + 8,
        },
      },
      equipment: {
        ...(state.equipment ?? createInitialCampaignState().equipment!),
        WEAPON1: `${weaponMeta.name} (${weaponMeta.stat})`,
      },
      chronicle: [
        {
          id: `smithy-${state.day}-${settlementId}-${blueprintId}`,
          day: state.day,
          category: 'ECONOMY',
          text: `${s.name} Demirci Ocağında "${weaponMeta.name}" dövüldü; lonca siparişinden net +${weaponMeta.profit - materialCost} Dinar kazanç sağlandı.`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export function constructSiegeEngine(
  state: CampaignState,
  settlementId: string,
  engineType: SiegeEngineType,
  moveToReserve = false,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const idx = state.settlements.findIndex((s) => s.id === settlementId);
  if (idx === -1) return { success: false, reason: 'Hedef yerleşim bulunamadı.', nextState: state };
  const s = state.settlements[idx];
  const cost =
    engineType === 'TREBUCHET'
      ? 90
      : engineType === 'SIEGE_TOWER'
        ? 80
        : engineType === 'MANGONEL'
          ? 65
          : 50;
  if (state.gold < cost) {
    return {
      success: false,
      reason: `${engineType} inşası için ${cost} Dinar mühendislik malzemesi gerekiyor.`,
      nextState: state,
    };
  }
  const currentActive = s.siegeEngines ?? [];
  const currentReserve = s.reserveEngines ?? [];

  const nextSettlements = state.settlements.map((item, i) =>
    i === idx
      ? {
          ...item,
          siegeEngines: moveToReserve ? currentActive : [...currentActive, engineType].slice(0, 6),
          reserveEngines: moveToReserve ? [...currentReserve, engineType] : currentReserve,
        }
      : item,
  );
  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - cost,
      settlements: nextSettlements,
      chronicle: [
        {
          id: `siege-eng-${state.day}-${settlementId}-${engineType}`,
          day: state.day,
          category: 'WAR',
          text: `${s.name} kuşatma kampında ${engineType} inşa edildi${moveToReserve ? ' ve bombardıman için Rezerve çekildi' : ''}.`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export function deployReservedSiegeEngines(
  state: CampaignState,
  settlementId: string,
): { success: boolean; nextState: CampaignState } {
  const idx = state.settlements.findIndex((s) => s.id === settlementId);
  if (idx === -1) return { success: false, nextState: state };
  const s = state.settlements[idx];
  const reserve = s.reserveEngines ?? [];
  if (reserve.length === 0) return { success: false, nextState: state };

  const nextSettlements = state.settlements.map((item, i) =>
    i === idx
      ? {
          ...item,
          siegeEngines: [...(item.siegeEngines ?? []), ...reserve].slice(0, 6),
          reserveEngines: [],
        }
      : item,
  );
  return {
    success: true,
    nextState: {
      ...state,
      settlements: nextSettlements,
    },
  };
}

export function bombardSettlementWalls(
  state: CampaignState,
  settlementId: string,
): {
  success: boolean;
  reason?: string;
  wallHealthAfter?: number;
  garrisonLost?: number;
  nextState: CampaignState;
} {
  const idx = state.settlements.findIndex((s) => s.id === settlementId);
  if (idx === -1) return { success: false, reason: 'Yerleşim bulunamadı.', nextState: state };
  const s = state.settlements[idx];
  const activeEngines = s.siegeEngines ?? [];
  if (activeEngines.length === 0) {
    return {
      success: false,
      reason: 'Sur bombardımanı için önce en az 1 kuşatma silahı (Trebuchet, Mangonel veya Balista) sahaya sürmelisiniz.',
      nextState: state,
    };
  }
  const trebuchetCount = activeEngines.filter((e) => e === 'TREBUCHET').length;
  const mangonelCount = activeEngines.filter((e) => e === 'MANGONEL').length;
  const wallDamage = Math.min(100, trebuchetCount * 35 + mangonelCount * 20 + activeEngines.length * 10);
  const currentWallHp = s.wallHealth ?? 100;
  const nextWallHp = Math.max(0, currentWallHp - wallDamage);
  const garrisonLoss = Math.min(Math.max(1, s.garrison - 4), Math.max(3, Math.round(wallDamage * 0.25)));
  const foodLoss = Math.min(s.foodStock, 18);

  const nextSettlements = state.settlements.map((item, i) =>
    i === idx
      ? {
          ...item,
          wallHealth: nextWallHp,
          garrison: Math.max(4, item.garrison - garrisonLoss),
          foodStock: Math.max(0, item.foodStock - foodLoss),
        }
      : item,
  );

  return {
    success: true,
    wallHealthAfter: nextWallHp,
    garrisonLost: garrisonLoss,
    nextState: {
      ...state,
      day: state.day + 1,
      renown: state.renown + 4,
      settlements: nextSettlements,
      chronicle: [
        {
          id: `bombard-${state.day}-${settlementId}`,
          day: state.day + 1,
          category: 'WAR',
          text: `${s.name} surları kuşatma silahlarıyla dövüldü! Duvar sağlığı %${nextWallHp} seviyesine indi, ${garrisonLoss} savunmacı saf dışı kaldı.`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export function upgradeTroopTier(
  state: CampaignState,
  fromTier: UnitTierId,
  toTier: UnitTierId,
  count = 1,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const safeCount = Math.max(1, count);
  if (state.roster[fromTier] < safeCount) {
    return {
      success: false,
      reason: `Terfi ettirmek için yeterli ${UNIT_DEFINITIONS[fromTier].name} yok.`,
      nextState: state,
    };
  }
  const upgradeCostPerUnit = Math.max(15, UNIT_DEFINITIONS[toTier].recruitCost - UNIT_DEFINITIONS[fromTier].recruitCost + 10);
  const totalCost = upgradeCostPerUnit * safeCount;
  if (state.gold < totalCost) {
    return {
      success: false,
      reason: `Terfi ekipmanı ve savaş atı için ${totalCost} Dinar gerekiyor.`,
      nextState: state,
    };
  }
  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - totalCost,
      roster: {
        ...state.roster,
        [fromTier]: state.roster[fromTier] - safeCount,
        [toTier]: state.roster[toTier] + safeCount,
      },
      morale: Math.min(100, state.morale + 1),
    },
  };
}

export function recruitCapturedPrisoners(
  state: CampaignState,
  count = 1,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const safeCount = Math.max(1, Math.min(count, state.prisoners));
  if (state.prisoners <= 0) {
    return { success: false, reason: 'Devşirilecek savaş esiri bulunmuyor.', nextState: state };
  }
  return {
    success: true,
    nextState: {
      ...state,
      prisoners: state.prisoners - safeCount,
      roster: {
        ...state.roster,
        militia: state.roster.militia + safeCount,
      },
      morale: Math.max(40, state.morale - 1),
    },
  };
}

export function assignClanRole(
  state: CampaignState,
  roleId: ClanRoleId,
  assigneeName: string,
): { success: boolean; nextState: CampaignState } {
  const currentRoles = state.clanRoles ?? createInitialCampaignState().clanRoles!;
  return {
    success: true,
    nextState: {
      ...state,
      clanRoles: {
        ...currentRoles,
        [roleId]: assigneeName,
      },
    },
  };
}

export function attemptLordPersuasionStep(
  state: CampaignState,
  lordId: string,
  argumentType: 'HONOR' | 'VALOR' | 'CALCULATING' | 'MERCY',
): {
  success: boolean;
  pipsGained: number;
  totalPips: number;
  convinced: boolean;
  replyText: string;
  nextState: CampaignState;
} {
  const idx = state.lords.findIndex((l) => l.id === lordId);
  if (idx === -1) {
    return {
      success: false,
      pipsGained: 0,
      totalPips: 0,
      convinced: false,
      replyText: 'Lord bulunamadı.',
      nextState: state,
    };
  }
  const lord = state.lords[idx];
  const currentPips = lord.persuasionPips ?? 0;
  const charmLevel = state.skills?.charm?.level ?? 100;

  // Deterministic high-reward check based on argument affinity + Charm skill
  const isCritical =
    (argumentType === 'HONOR' && (lord.personality.includes('sadık') || lord.personality.includes('Bilge'))) ||
    (argumentType === 'VALOR' && (lord.personality.includes('Cesur') || lord.personality.includes('Askeri'))) ||
    (argumentType === 'CALCULATING' && charmLevel >= 90);

  const pipsGained = isCritical ? 2 : 1;
  const nextPips = Math.min(4, currentPips + pipsGained);
  const convinced = nextPips >= 4;

  const replyText = convinced
    ? `Sözlerin de sancağın kadar güçlü ${state.playerName}! Tüm şüphelerimi giderdin (4/4 İkna Tamamlandı). Artık seninle müttefikim!`
    : isCritical
      ? `Çok yerinde bir tespit (${argumentType} Kritiği: +2 İkna Aşaması)! Devam et, seni dinliyorum.`
      : `Söylediklerinde doğruluk payı var (+1 İkna Aşaması: ${nextPips}/4).`;

  const nextLords = state.lords.map((l, i) =>
    i === idx
      ? {
          ...l,
          persuasionPips: nextPips,
          relation: Math.min(100, l.relation + (convinced ? 15 : 4)),
          isAtWarWithPlayer: convinced ? false : l.isAtWarWithPlayer,
          isAlliedWithPlayer: convinced ? true : l.isAlliedWithPlayer,
        }
      : l,
  );

  const baseSkills = state.skills ?? createInitialCampaignState().skills!;
  const currentCharm = baseSkills.charm ?? { level: 100, focus: 3 };

  return {
    success: true,
    pipsGained,
    totalPips: nextPips,
    convinced,
    replyText,
    nextState: {
      ...state,
      renown: convinced ? state.renown + 15 : state.renown + 2,
      skills: {
        ...baseSkills,
        charm: {
          ...currentCharm,
          level: currentCharm.level + 5,
        },
      },
      lords: nextLords,
      chronicle: convinced
        ? [
            {
              id: `persuade-${state.day}-${lord.id}`,
              day: state.day,
              category: 'DIPLOMACY',
              text: `${lord.title} ${lord.name}, 4 aşamalı divan müzakeresi sonucunda ikna edilerek sancağımızla ittifak kurdu!`,
            },
            ...state.chronicle,
          ].slice(0, 30)
        : state.chronicle,
    },
  };
}

export function executeLordBarterOffer(
  state: CampaignState,
  lordId: string,
  goldOffered: number,
  prisonersOffered: number,
): { success: boolean; reason?: string; nextState: CampaignState } {
  const idx = state.lords.findIndex((l) => l.id === lordId);
  if (idx === -1) return { success: false, reason: 'Lord bulunamadı.', nextState: state };
  if (state.gold < goldOffered) {
    return { success: false, reason: 'Teklif edilen Dinar miktarı hazinede yok.', nextState: state };
  }
  if (state.prisoners < prisonersOffered) {
    return { success: false, reason: 'Teklif edilen esir sayısı orduda yok.', nextState: state };
  }
  const lord = state.lords[idx];
  const nextLords = state.lords.map((l, i) =>
    i === idx
      ? {
          ...l,
          relation: Math.min(100, l.relation + 18),
          isAtWarWithPlayer: false,
          isAlliedWithPlayer: true,
          persuasionPips: 4,
        }
      : l,
  );
  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - goldOffered,
      prisoners: state.prisoners - prisonersOffered,
      renown: state.renown + 10,
      lords: nextLords,
      chronicle: [
        {
          id: `barter-${state.day}-${lord.id}`,
          day: state.day,
          category: 'DIPLOMACY',
          text: `${lord.title} ${lord.name} ile ${goldOffered} Dinar ve ${prisonersOffered} esir karşılığında takas antlaşması (Barter) imzalandı.`,
        },
        ...state.chronicle,
      ].slice(0, 30),
    },
  };
}

export {
  type MarketCategory,
  type MarketplaceItem,
  CALRADIA_MARKETPLACE_ITEMS,
  buyMarketplaceItem,
  sellMarketplaceItem,
  unequipEquipmentSlot,
} from './marketRules.ts';


