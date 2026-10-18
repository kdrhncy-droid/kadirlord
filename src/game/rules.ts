import { snapToNearestLand } from './navigation.ts';

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
}

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
  isAtWarWithPlayer: boolean;
  isAlliedWithPlayer: boolean;
  currentAction: string;
  bannerColor: string;
}

export interface ChronicleEvent {
  id: string;
  day: number;
  text: string;
  category: 'WAR' | 'DIPLOMACY' | 'ECONOMY' | 'CONQUEST';
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
  const total = getTotalTroops(roster);
  return Math.max(1, Math.ceil((total + 1) / 4));
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

  return {
    success: true,
    nextState: {
      ...state,
      gold: state.gold - totalCost,
      food: state.food + packs,
      morale: Math.min(100, state.morale + 2),
      settlements: nextSettlements,
    },
  };
}

export function advanceDailyEconomyAndWorld(state: CampaignState): CampaignState {
  const wage = calculateDailyWage(state.roster);
  const foodUsed = calculateDailyFoodConsumption(state.roster);

  let playerSettlementTaxes = 0;
  const updatedSettlements = state.settlements.map((s) => {
    if (s.faction === 'player') {
      playerSettlementTaxes += Math.round(s.prosperity * 0.25);
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

  const nextFood = Math.max(0, state.food - foodUsed);
  const nextGold = Math.max(0, state.gold + playerSettlementTaxes - wage);
  let moraleDelta = 0;
  if (state.food < foodUsed) moraleDelta -= 10;
  else moraleDelta += 2;
  if (state.gold + playerSettlementTaxes < wage) moraleDelta -= 8;

  const seasons: Array<'Bahar' | 'Yaz' | 'Güz' | 'Kış'> = ['Bahar', 'Yaz', 'Güz', 'Kış'];
  const nextDay = state.day + 1;
  const seasonIdx = Math.floor(((nextDay - 1) % 40) / 10);

  return {
    ...state,
    day: nextDay,
    season: seasons[seasonIdx] || 'Güz',
    gold: nextGold,
    food: nextFood,
    morale: Math.max(15, Math.min(100, state.morale + moraleDelta)),
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

  if (!victory) {
    return {
      ...state,
      roster: nextRoster,
      morale: Math.max(20, state.morale - 15),
      gold: Math.max(0, state.gold - 40),
      playerHp: Math.max(25, state.playerHp),
    };
  }

  const goldLoot = 120 + enemiesDefeatedCount * 22;
  const renownGain = 15 + enemiesDefeatedCount * 3;
  const prisonersGain = Math.max(1, Math.floor(enemiesDefeatedCount * 0.35));

  const nextLords = state.lords.map((l) => {
    if (l.id === enemyLordId) {
      const safeRetreat = snapToNearestLand(l.x + 18, l.z - 18);
      return {
        ...l,
        armySize: Math.max(8, Math.floor(l.armySize * 0.45)),
        x: safeRetreat.x,
        z: safeRetreat.z,
        currentAction: 'Ordusunu yeniden topluyor',
      };
    }
    return l;
  });

  const nextSettlements = state.settlements.map((s) => {
    if (conqueredSettlementId && s.id === conqueredSettlementId) {
      return {
        ...s,
        faction: 'player' as FactionId,
        garrison: Math.max(20, Math.floor(s.garrison * 0.6)),
      };
    }
    return s;
  });

  const newChronicle: ChronicleEvent = {
    id: `evt-${state.day}-${Date.now()}`,
    day: state.day,
    category: conqueredSettlementId ? 'CONQUEST' : 'WAR',
    text: conqueredSettlementId
      ? `${state.playerName}, kuşatma zaferiyle yeni bir mülkü sancağı altına aldı!`
      : `${state.playerName}, meydan savaşında düşman ordusunu bozguna uğrattı (+${renownGain} Nam, +${goldLoot} Dinar).`,
  };

  return {
    ...state,
    gold: state.gold + goldLoot,
    renown: state.renown + renownGain,
    prisoners: state.prisoners + prisonersGain,
    morale: Math.min(100, state.morale + 10),
    battlesWon: state.battlesWon + 1,
    roster: nextRoster,
    lords: nextLords,
    settlements: nextSettlements,
    chronicle: [newChronicle, ...state.chronicle].slice(0, 20),
  };
}

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

  // 74 Authentic Calradia Continental Settlements (50 Towns, 15 Castles, 9 Villages) matching the official Bannerlord map!
  const settlements: Settlement[] = [
    // === EMPIRE (CENTRAL HEARTLAND) ===
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
      description: 'Sancağınıza bağlı sadık köylülerin, tahıl ambarlarının ve nehir vadisi geçidinin merkezi.',
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
      description: 'Dağ geçitleri ve nehir vadileri arasında stratejik İmparatorluk kalesi.',
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
      description: 'Sturgia sınırı ve kuzey nehir vadilerini koruyan İmparatorluk kalesi.',
    },
    {
      id: 'lochana_castle',
      name: 'Lochana Castle',
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
      id: 'hertogea_castle',
      name: 'Hertogea Castle',
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
      name: 'Veron Castle',
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
      name: 'Lavenia Castle',
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
    },

    // === VLANDIA (WESTERN COAST & HIGHLANDS) ===
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
      description: 'Kuzeybatı kıyı şeridini ve Sturgia deniz yolunu gözetleyen Vlandiya kalesi.',
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
      name: 'Caleus Castle',
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
      name: 'Hongard Castle',
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
    },

    // === BATTANIA (NORTHWEST WOODLAND LAKE BASIN) ===
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
      description: 'Battaniya dağ gölü güneydoğu vadisinde yükselen Ulu Orman kalesi.',
    },
    {
      id: 'llanoc_hen_castle',
      name: 'Llanoc Hen Castle',
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
      name: 'Garontor Castle',
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
    },

    // === STURGIA (NORTHERN SNOW PENINSULA & FJORDS) ===
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
      description: 'Doğu karlı sıradağ geçitlerine hükmeden müstahkem Sturgia kalesi.',
    },
    {
      id: 'ov_castle',
      name: 'Ov Castle',
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
      name: 'Urikskala Castle',
      type: 'CASTLE',
      faction: 'sturgia',
      x: 118,
      z: -242,
      prosperity: 370,
      garrison: 41,
      recruitPool: { militia: 8, archer: 4, cavalry: 2, guard: 3 },
      foodStock: 32,
      description: 'Varnovapol ile Tyal arasındaki karlı geçidi koruyan Sturgia hisarı.',
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
    },

    // === KHUZAIT (EASTERN INLAND LAKE & STEPPE) ===
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
      name: 'Simira Castle',
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
      name: 'Kaysar Castle',
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
    },

    // === ASERAI (SOUTHERN PERASSIC COAST & NAHASA DESERT) + BANDIT FORT ===
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
      name: 'Tubilis Castle',
      type: 'CASTLE',
      faction: 'aserai',
      x: -168,
      z: 228,
      prosperity: 385,
      garrison: 42,
      recruitPool: { militia: 6, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 35,
      description: 'Quyaz ile Sanala arasındaki kıyı yolunu koruyan Aserai sahil kalesi.',
    },
    {
      id: 'medeni_castle',
      name: 'Medeni Castle',
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
      roster: { militia: 9, archer: 4, cavalry: 2, guard: 1 },
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
      z: 112,
      targetZ: 138,
      armySize: 36,
      roster: { militia: 14, archer: 10, cavalry: 6, guard: 6 },
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

  return {
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
    prisoners: 0,
    battlesWon: 0,
    settlements,
    lords,
    chronicle,
  };
}
