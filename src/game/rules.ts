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
      return {
        ...l,
        armySize: Math.max(8, Math.floor(l.armySize * 0.45)),
        x: l.x + 18,
        z: l.z - 18,
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

  // 36 Authentic Calradia Continental Settlements (Towns, Castles, Villages) across 1200x900 World
  const settlements: Settlement[] = [
    // === EMPIRE (CENTRAL HEARTLAND) ===
    {
      id: 'zeonica',
      name: 'Lycaron',
      type: 'TOWN',
      faction: 'empire',
      x: 38,
      z: 18,
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
      x: 16,
      z: 36,
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
      x: -10,
      z: 96,
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
      x: -78,
      z: 82,
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
      x: -36,
      z: 22,
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
      x: -112,
      z: -8,
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
      x: -128,
      z: 54,
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
      x: -195,
      z: 84,
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
      x: -185,
      z: -15,
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
      x: -135,
      z: -145,
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
      x: -72,
      z: -152,
      prosperity: 580,
      garrison: 54,
      recruitPool: { militia: 8, archer: 7, cavalry: 3, guard: 3 },
      foodStock: 43,
      description: 'Kuzey İmparatorluğunun nehir deltası ve kıyı ticareti merkezi.',
    },
    {
      id: 'saneopa',
      name: 'Saneopa',
      type: 'TOWN',
      faction: 'empire',
      x: 28,
      z: -75,
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
      z: -92,
      prosperity: 570,
      garrison: 52,
      recruitPool: { militia: 8, archer: 7, cavalry: 3, guard: 3 },
      foodStock: 41,
      description: 'Karlı doğu sıradağlarının eteğinde yükselen Kuzey İmparatorluğu kenti.',
    },
    {
      id: 'phycaon',
      name: 'Phycaon',
      type: 'TOWN',
      faction: 'empire',
      x: 105,
      z: 18,
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
      x: 162,
      z: -32,
      prosperity: 590,
      garrison: 55,
      recruitPool: { militia: 8, archer: 7, cavalry: 4, guard: 3 },
      foodStock: 44,
      description: 'Doğu iç gölünün batı kıyısında Khuzait akınlarına karşı duran sınır şehri.',
    },
    {
      id: 'onira',
      name: 'Onira',
      type: 'TOWN',
      faction: 'empire',
      x: 178,
      z: 48,
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
      z: 112,
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
      x: 92,
      z: 145,
      prosperity: 645,
      garrison: 60,
      recruitPool: { militia: 9, archer: 7, cavalry: 4, guard: 4 },
      foodStock: 49,
      description: 'Güney İmparatorluğunun Perassic Denizi kıyısındaki büyük liman şehri.',
    },

    // === VLANDIA (WESTERN COAST & HIGHLANDS) ===
    {
      id: 'pravend',
      name: 'Pravend',
      type: 'TOWN',
      faction: 'vlandia',
      x: -415,
      z: -95,
      prosperity: 630,
      garrison: 60,
      recruitPool: { militia: 9, archer: 6, cavalry: 5, guard: 3 },
      foodStock: 48,
      description: 'Vlandiya Krallığının batı ovaları ve nehir ağzındaki görkemli başkenti.',
    },
    {
      id: 'ocs_hall',
      name: 'Ocs Hall',
      type: 'TOWN',
      faction: 'vlandia',
      x: -365,
      z: -145,
      prosperity: 575,
      garrison: 54,
      recruitPool: { militia: 8, archer: 6, cavalry: 5, guard: 2 },
      foodStock: 43,
      description: 'Vlandiya şövalye hanedanlarının ormanlık yayla kenti.',
    },
    {
      id: 'rovalt',
      name: 'Rovalt',
      type: 'TOWN',
      faction: 'vlandia',
      x: -425,
      z: -235,
      prosperity: 550,
      garrison: 52,
      recruitPool: { militia: 8, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 40,
      description: 'Kuzeybatı okyanus burnunu koruyan Vlandiya liman kalesi.',
    },
    {
      id: 'sargot',
      name: 'Sargot',
      type: 'TOWN',
      faction: 'vlandia',
      x: -335,
      z: 45,
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
      x: -355,
      z: 118,
      prosperity: 540,
      garrison: 50,
      recruitPool: { militia: 8, archer: 6, cavalry: 4, guard: 2 },
      foodStock: 42,
      description: 'Güneybatı körfezine hakim Vlandiya deniz ticareti kenti.',
    },

    // === BATTANIA (NORTHWEST WOODLAND LAKE BASIN) ===
    {
      id: 'marunath',
      name: 'Marunath',
      type: 'TOWN',
      faction: 'battania',
      x: -235,
      z: -62,
      prosperity: 560,
      garrison: 54,
      recruitPool: { militia: 7, archer: 10, cavalry: 2, guard: 3 },
      foodStock: 42,
      description: 'Battaniya dağ gölü güney kıyısında yükselen Ulu Orman kalesi.',
    },
    {
      id: 'seonon',
      name: 'Seonon',
      type: 'TOWN',
      faction: 'battania',
      x: -215,
      z: -125,
      prosperity: 545,
      garrison: 52,
      recruitPool: { militia: 7, archer: 9, cavalry: 2, guard: 3 },
      foodStock: 40,
      description: 'Sık çam ormanları ve sarp kayalıklarla çevrili Battaniya yayla şehri.',
    },
    {
      id: 'dunglanys',
      name: 'Dunglanys',
      type: 'TOWN',
      faction: 'battania',
      x: -285,
      z: -115,
      prosperity: 530,
      garrison: 50,
      recruitPool: { militia: 7, archer: 9, cavalry: 2, guard: 3 },
      foodStock: 39,
      description: 'Battaniya gölü batı yakasında okçu klanların merkezi.',
    },
    {
      id: 'pen_cannoc',
      name: 'Pen Cannoc',
      type: 'TOWN',
      faction: 'battania',
      x: -305,
      z: -58,
      prosperity: 525,
      garrison: 48,
      recruitPool: { militia: 7, archer: 9, cavalry: 2, guard: 2 },
      foodStock: 38,
      description: 'Kil madenleri ve sarp vadi geçitleriyle ünlü Battaniya şehri.',
    },

    // === STURGIA (NORTHERN SNOW PENINSULA & FJORDS — IMAGE 2!) ===
    {
      id: 'buzulkale',
      name: 'Varcheg',
      type: 'TOWN',
      faction: 'sturgia',
      x: -182,
      z: -235,
      prosperity: 535,
      garrison: 54,
      recruitPool: { militia: 9, archer: 4, cavalry: 2, guard: 4 },
      foodStock: 38,
      description: 'Kuzey körfezinin batı yakasında Sturgia donanma ve kalkan duvarı merkezi.',
    },
    {
      id: 'omor',
      name: 'Omor',
      type: 'TOWN',
      faction: 'sturgia',
      x: -35,
      z: -215,
      prosperity: 560,
      garrison: 55,
      recruitPool: { militia: 9, archer: 5, cavalry: 2, guard: 4 },
      foodStock: 40,
      description: 'Kuzey fiyortları ile İmparatorluk sınırı arasındaki karlı Sturgia limanı.',
    },
    {
      id: 'sibir',
      name: 'Sibir',
      type: 'TOWN',
      faction: 'sturgia',
      x: 95,
      z: -315,
      prosperity: 520,
      garrison: 52,
      recruitPool: { militia: 10, archer: 4, cavalry: 2, guard: 4 },
      foodStock: 36,
      description: 'Sturgia karlı yarımadasının kuzey kıyısında yükselen buzul kenti.',
    },
    {
      id: 'tyal',
      name: 'Tyal',
      type: 'TOWN',
      faction: 'sturgia',
      x: 205,
      z: -285,
      prosperity: 530,
      garrison: 54,
      recruitPool: { militia: 9, archer: 5, cavalry: 3, guard: 4 },
      foodStock: 37,
      description: 'Doğu fiyortlarına ve karlı dağ geçitlerine hükmeden Sturgia kalesi.',
    },
    {
      id: 'vladiv_castle',
      name: 'Vladiv Castle',
      type: 'CASTLE',
      faction: 'sturgia',
      x: 145,
      z: -265,
      prosperity: 390,
      garrison: 44,
      recruitPool: { militia: 8, archer: 4, cavalry: 2, guard: 3 },
      foodStock: 32,
      description: 'Sibir ile Tyal arasındaki karlı tayga vadisini koruyan Sturgia hisarı.',
    },

    // === KHUZAIT (EASTERN INLAND LAKE & STEPPE — IMAGE 3!) ===
    {
      id: 'baltakhand',
      name: 'Makeb',
      type: 'TOWN',
      faction: 'khuzait',
      x: 245,
      z: -165,
      prosperity: 580,
      garrison: 56,
      recruitPool: { militia: 6, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 44,
      description: 'Khuzait iç gölünün kuzey boğazını tutan müstahkem bozkır şehri.',
    },
    {
      id: 'makeb',
      name: 'Chaikand',
      type: 'TOWN',
      faction: 'khuzait',
      x: 252,
      z: -65,
      prosperity: 640,
      garrison: 62,
      recruitPool: { militia: 6, archer: 9, cavalry: 8, guard: 3 },
      foodStock: 48,
      description: 'Khuzait Hanlığının iç göl doğu kıyısındaki başkent otağı ve süvari merkezi.',
    },
    {
      id: 'ortongard',
      name: 'Ortongard',
      type: 'TOWN',
      faction: 'khuzait',
      x: 325,
      z: -115,
      prosperity: 545,
      garrison: 52,
      recruitPool: { militia: 5, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 42,
      description: 'Uçsuz bucaksız doğu bozkır platosunun ortasında yükselen hanlık kenti.',
    },
    {
      id: 'akkalat',
      name: 'Akkalat',
      type: 'TOWN',
      faction: 'khuzait',
      x: 305,
      z: 18,
      prosperity: 530,
      garrison: 50,
      recruitPool: { militia: 5, archer: 8, cavalry: 7, guard: 2 },
      foodStock: 40,
      description: 'Güney bozkır geçitlerini kontrol eden Khuzait atlı okçu sancağı.',
    },

    // === ASERAI (SOUTHERN PERASSIC COAST & NAHASA DESERT — IMAGE 1 & 4!) ===
    {
      id: 'quyaz',
      name: 'Quyaz',
      type: 'TOWN',
      faction: 'aserai',
      x: -205,
      z: 182,
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
      x: -95,
      z: 245,
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
      x: 8,
      z: 295,
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
      x: 145,
      z: 278,
      prosperity: 580,
      garrison: 53,
      recruitPool: { militia: 7, archer: 7, cavalry: 5, guard: 3 },
      foodStock: 43,
      description: 'Nahasa çölü ile nehir deltası arasındaki stratejik Aserai kenti.',
    },
    {
      id: 'kehribar',
      name: 'Husn Fulq',
      type: 'TOWN',
      faction: 'aserai',
      x: 235,
      z: 195,
      prosperity: 625,
      garrison: 58,
      recruitPool: { militia: 7, archer: 7, cavalry: 5, guard: 3 },
      foodStock: 48,
      description: 'Doğu berzahını ve nehir deltasını koruyan müstahkem vaha şehri.',
    },
    {
      id: 'karagecit',
      name: 'Karageçit Hisarı',
      type: 'CASTLE',
      faction: 'bandits',
      x: -62,
      z: 48,
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
      x: 42,
      z: 36,
      targetX: 38,
      targetZ: 18,
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
      x: -12,
      z: 56,
      targetX: 16,
      targetZ: 36,
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
      x: -88,
      z: 35,
      targetX: -78,
      targetZ: 82,
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
      x: 52,
      z: -62,
      targetX: 28,
      targetZ: -75,
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
      x: -345,
      z: -75,
      targetX: -415,
      targetZ: -95,
      armySize: 40,
      roster: { militia: 14, archer: 10, cavalry: 10, guard: 6 },
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Pravend - Sargot kraliyet yolunu denetliyor',
      bannerColor: '#991b1b',
    },
    {
      id: 'lord-caladog',
      name: 'Caladog',
      title: 'Yüksek Kral',
      faction: 'battania',
      personality: 'Atılgan, orman pusularında usta, bağımsızlığına düşkün yayla savaşçısı',
      relation: 10,
      x: -225,
      z: -85,
      targetX: -235,
      targetZ: -62,
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
      x: 118,
      z: -278,
      targetX: 95,
      targetZ: -315,
      armySize: 36,
      roster: { militia: 16, archer: 8, cavalry: 4, guard: 8 },
      isAtWarWithPlayer: false,
      isAlliedWithPlayer: false,
      currentAction: 'Sibir ve Tyal karlı geçidini bekliyor',
      bannerColor: '#1e3a8a',
    },
    {
      id: 'lord-monchug',
      name: 'Monchug',
      title: 'Kağan',
      faction: 'khuzait',
      personality: 'Cesur, doğrudan konuşan, savaş meydanındaki atlı hücumlara değer veren bozkır hanı',
      relation: 8,
      x: 268,
      z: -95,
      targetX: 252,
      targetZ: -65,
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
      x: -45,
      z: 255,
      targetX: -95,
      targetZ: 245,
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
    playerX: 28,
    playerZ: 44,
    roster: initialRoster,
    prisoners: 0,
    battlesWon: 0,
    settlements,
    lords,
    chronicle,
  };
}
