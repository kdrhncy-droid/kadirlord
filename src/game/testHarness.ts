/**
 * testHarness.ts — E2E senaryo kurulumu (yalnız geliştirme modu)
 *
 * Amaç: Tarayıcı testlerinin bir karşılaşmayı haritada dakikalarca kovalamadan,
 * deterministik bir başlangıç durumuyla açabilmesi. Bu modül saf veri dönüşümü
 * yapar; React/DOM erişimi `App.tsx` tarafındadır.
 *
 * Güvenlik sınırı:
 *   - Kanca yalnız `import.meta.env.DEV && ?e2e=1` iken etkinleşir.
 *   - Üretim derlemesinde URL parametresi tek başına hiçbir şeyi açmaz.
 *   - E2E oturumunda otomatik kayıt App tarafında kapatılır.
 */
import {
  classifyEncounterScenario,
  type EncounterScenario,
} from './encounter.ts';
import {
  getTotalTroops,
  setWallSections,
  type CampaignState,
  type InventoryItem,
  type LordAgent,
  type SiegeEngineType,
  type TroopRoster,
} from './rules.ts';
import {
  getSiegeCampPoint,
  SIEGE_CAMP_STANDOFF,
  type SiegeEncounterRole,
} from './siegeEncounter.ts';

export const E2E_SCENARIOS = [
  'boot',
  'encyclopedia',
  'party',
  'bandit-caught-player',
  'player-caught-bandit',
  'lord-caught-player',
] as const;

export type E2EScenarioName = (typeof E2E_SCENARIOS)[number];
export type E2ETimeScale = 0 | 1 | 2 | 4;

export interface E2ERequest {
  enabled: boolean;
  scenario: E2EScenarioName;
  seed: number;
  timeScale: E2ETimeScale;
  siegeRole: SiegeEncounterRole | null;
  focusSiegeCamp: boolean;
}

export interface E2EScenarioSetup {
  campaign: CampaignState;
  dialogueLord: LordAgent | null;
  forcedEncounter: boolean;
  encounterScenario?: EncounterScenario;
  encyclopediaOpen: boolean;
  partyOpen: boolean;
}

export interface KadirlordPlayerPatch {
  gold?: number;
  food?: number;
  morale?: number;
  renown?: number;
  influence?: number;
  playerHp?: number;
  playerMaxHp?: number;
  prisoners?: number;
  roster?: Partial<TroopRoster>;
}

export interface KadirlordLordPatch {
  x?: number;
  z?: number;
  armySize?: number;
  roster?: TroopRoster;
  relation?: number;
  isAtWarWithPlayer?: boolean;
  isAlliedWithPlayer?: boolean;
  isPlayerClan?: boolean;
  clanTier?: number;
  foodDays?: number;
  order?: LordAgent['order'];
  currentAction?: string;
}

export interface KadirlordTestSnapshot {
  ready: true;
  version: 1;
  scenario: E2EScenarioName;
  seed: number;
  gameState: string;
  subMode: string;
  timeScale: number;
  day: number;
  player: {
    name: string;
    x: number;
    z: number;
    hp: number;
    maxHp: number;
    gold: number;
    food: number;
    morale: number;
    renown: number;
    prisoners: number;
    roster: TroopRoster;
    troops: number;
  };
  dialogue: {
    lordId: string | null;
    lordName: string | null;
    forced: boolean;
    scenario: EncounterScenario | null;
  };
  encyclopediaOpen: boolean;
  partyOpen: boolean;
  characterOpen: boolean;
  inventory: Array<{
    id: string;
    definitionId: string;
    quantity: number;
    locked: boolean;
  }>;
  inventoryOpen: boolean;
  heroes: Array<{
    id: string;
    name: string;
    activeEquipmentSet: string;
    equipment: {
      BATTLE: Record<string, string | null>;
      CIVILIAN: Record<string, string | null>;
    };
  }>;
  troopStacks: Array<{
    troopId: string;
    count: number;
    wounded: number;
    xp: number;
  }>;
  market: {
    open: boolean;
    settlementId: string | null;
    merchantGold: number | null;
    stock: Record<string, number>;
  };
  loot: {
    open: boolean;
    itemCount: number;
    gold: number;
    items: Array<{
      id: string;
      definitionId: string;
      quantity: number;
    }>;
  };
  counts: {
    lords: number;
    settlements: number;
  };
  settlementOpen?: boolean;
  activeSettlementId?: string | null;
}

export interface KadirlordTestApi {
  version: 1;
  ready: true;
  scenario: E2EScenarioName;
  seed: number;
  getState: () => KadirlordTestSnapshot;
  setTimeScale: (scale: E2ETimeScale) => void;
  setPlayer: (patch: KadirlordPlayerPatch) => void;
  setLord: (lordId: string, patch: KadirlordLordPatch) => boolean;
  getLordPosition: (lordId: string) => { x: number; z: number } | null;
  openSiege: (role: SiegeEncounterRole, options?: { focusOnCamp?: boolean }) => boolean;
  closeSiege: () => void;
  openSettlement: (
    settlementIdOrType?: string,
    options?: { tab?: 'overview' | 'siege' },
  ) => boolean;
  closeSettlement: () => void;
  openDialogue: (
    lordId: string,
    options?: { forced?: boolean; scenario?: EncounterScenario },
  ) => boolean;
  closeDialogue: () => void;
  openEncyclopedia: () => void;
  closeEncyclopedia: () => void;
  openParty: () => void;
  closeParty: () => void;
  openCharacter: () => void;
  closeCharacter: () => void;
  openMarket: (settlementId?: string) => boolean;
  closeMarket: () => void;
  openInventory: () => void;
  closeInventory: () => void;
  openLoot: (
    lootItems?: InventoryItem[],
    options?: { goldLoot?: number; enemiesDefeated?: number },
  ) => boolean;
  closeLoot: () => void;
}

export function buildE2ESiegeScenario(
  base: CampaignState,
  role: SiegeEncounterRole,
): { campaign: CampaignState; settlementId: string } | null {
  const settlement =
    base.settlements.find((item) => item.type === 'CASTLE' && item.faction !== 'player') ??
    base.settlements.find((item) => item.type === 'TOWN' && item.faction !== 'player');
  if (!settlement) return null;

  const besieger =
    base.lords.find(
      (lord) => lord.faction !== 'bandits' && lord.faction !== settlement.faction,
    ) ?? base.lords.find((lord) => lord.faction !== settlement.faction);
  if (!besieger) return null;

  const siegeApproachX = settlement.x + 22;
  const siegeApproachZ = settlement.z + 8;
  const campPoint = getSiegeCampPoint(settlement, siegeApproachX, siegeApproachZ);
  const approachDistance = Math.hypot(campPoint.x - settlement.x, campPoint.z - settlement.z);
  const approachX = approachDistance > 0.001 ? (campPoint.x - settlement.x) / approachDistance : 1;
  const approachZ = approachDistance > 0.001 ? (campPoint.z - settlement.z) / approachDistance : 0;
  const playerPoint =
    role === 'attacker'
      ? campPoint
      : role === 'outsider'
        ? {
            x: settlement.x + approachX * (SIEGE_CAMP_STANDOFF + 25),
            z: settlement.z + approachZ * (SIEGE_CAMP_STANDOFF + 25),
          }
        : null;
  const campaign: CampaignState = {
    ...base,
    playerX: playerPoint ? playerPoint.x : settlement.x,
    playerZ: playerPoint ? playerPoint.z : settlement.z,
    lords: base.lords.map((lord) =>
      lord.id === besieger.id
        ? {
            ...lord,
            x: campPoint.x,
            z: campPoint.z,
            targetX: campPoint.x,
            targetZ: campPoint.z,
            order: {
              kind: 'SIEGE',
              targetSettlementId: settlement.id,
              sinceDay: base.day,
              siegeProgress: 72,
            },
          }
        : lord,
    ),
    settlements: base.settlements.map((item) => {
      if (item.id !== settlement.id) return item;
      const siegeEngines: SiegeEngineType[] =
        item.siegeEngines && item.siegeEngines.length > 0
          ? item.siegeEngines
          : ['TREBUCHET', 'BALLISTA', 'BATTERING_RAM'];
      const withWalls = setWallSections(item, [78, 52]);
      return {
        ...withWalls,
        siegeEngines,
        siegeEngineHp: siegeEngines.map((_, idx) => item.siegeEngineHp?.[idx] ?? 100),
      };
    }),
    playerSiege:
      role === 'attacker'
        ? { settlementId: settlement.id, campProgress: 72, inside: false }
        : role === 'defender'
          ? { settlementId: settlement.id, campProgress: 72, inside: true }
          : null,
  };

  return { campaign, settlementId: settlement.id };
}

declare global {
  interface Window {
    __kadirlordTest?: KadirlordTestApi;
  }
}

const DIALOGUE_SCENARIOS = new Set<E2EScenarioName>([
  'bandit-caught-player',
  'player-caught-bandit',
  'lord-caught-player',
]);

function isScenario(value: string | null): value is E2EScenarioName {
  return value !== null && (E2E_SCENARIOS as readonly string[]).includes(value);
}

function isSiegeRole(value: string | null): value is SiegeEncounterRole {
  return value === 'attacker' || value === 'outsider' || value === 'defender';
}

function parseTimeScale(value: string | null, scenario: E2EScenarioName): E2ETimeScale {
  const parsed = Number(value);
  if (parsed === 0 || parsed === 1 || parsed === 2 || parsed === 4) return parsed;
  return DIALOGUE_SCENARIOS.has(scenario) ? 0 : 1;
}

/**
 * URL isteğini çözümlerken üretim kilidini uygular.
 * `search` başında `?` olsa da olmasa da kabul edilir (probe kolaylığı).
 */
export function parseE2ERequest(search: string, isDev: boolean): E2ERequest {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const scenarioRaw = params.get('scenario');
  const scenario: E2EScenarioName = isScenario(scenarioRaw) ? scenarioRaw : 'boot';
  const seedRaw = Number(params.get('seed'));
  const seed = Number.isFinite(seedRaw) && params.has('seed') ? Math.trunc(seedRaw) >>> 0 : 42;
  const siegeRaw = params.get('siege');
  const enabled = isDev && params.get('e2e') === '1';

  return {
    enabled,
    scenario,
    seed,
    timeScale: parseTimeScale(params.get('timeScale'), scenario),
    siegeRole: enabled && isSiegeRole(siegeRaw) ? siegeRaw : null,
    focusSiegeCamp: enabled && (params.get('focusSiegeCamp') === '1' || params.get('siegeCamp') === '1'),
  };
}

/** Mulberry32 — küçük, hızlı ve tekrarlanabilir test RNG'si. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let originalRandom: (() => number) | null = null;

/**
 * E2E sayfasında `Math.random` akışını tohuma bağlar. Yalnız `main.tsx`,
 * üretim kilidi açıkken çağırır. Aynı sayfada ikinci çağrı akışı sıfırlar.
 */
export function installDeterministicRandom(seed: number): void {
  if (originalRandom === null) originalRandom = Math.random;
  Math.random = createSeededRandom(seed);
}

export function restoreRandom(): void {
  if (originalRandom !== null) {
    Math.random = originalRandom;
    originalRandom = null;
  }
}

function withRoster(lord: LordAgent, roster: TroopRoster): LordAgent {
  return {
    ...lord,
    roster,
    armySize: getTotalTroops(roster),
  };
}

function replaceFirstLord(
  campaign: CampaignState,
  predicate: (lord: LordAgent) => boolean,
  update: (lord: LordAgent) => LordAgent,
): { campaign: CampaignState; lord: LordAgent | null } {
  const index = campaign.lords.findIndex(predicate);
  if (index < 0) return { campaign, lord: null };

  const lord = update(campaign.lords[index]);
  return {
    campaign: {
      ...campaign,
      lords: campaign.lords.map((candidate, i) => (i === index ? lord : candidate)),
    },
    lord,
  };
}

/** Önce sabit senaryo kimliğini, bulunamazsa aynı türden ilk lordu seçer. */
function replacePreferredLord(
  campaign: CampaignState,
  preferredId: string,
  fallback: (lord: LordAgent) => boolean,
  update: (lord: LordAgent) => LordAgent,
): { campaign: CampaignState; lord: LordAgent | null } {
  const preferred = replaceFirstLord(campaign, (lord) => lord.id === preferredId, update);
  return preferred.lord ? preferred : replaceFirstLord(campaign, fallback, update);
}

function dialogueSetup(campaign: CampaignState, lord: LordAgent | null): E2EScenarioSetup {
  if (!lord) {
    return {
      campaign,
      dialogueLord: null,
      forcedEncounter: false,
      encounterScenario: undefined,
      encyclopediaOpen: false,
      partyOpen: false,
    };
  }

  const info = classifyEncounterScenario(lord, campaign);
  return {
    campaign,
    dialogueLord: lord,
    forcedEncounter: true,
    encounterScenario: info.scenario,
    encyclopediaOpen: false,
    partyOpen: false,
  };
}

function nearPlayer(lord: LordAgent, campaign: CampaignState): LordAgent {
  const x = campaign.playerX + 2;
  const z = campaign.playerZ;
  return {
    ...lord,
    x,
    z,
    targetX: x,
    targetZ: z,
    currentAction: 'E2E senaryosu',
  };
}

/**
 * Başlangıç kampanyasını seçilen E2E sahnesine dönüştürür. Girdi nesnesini
 * değiştirmez; değiştirilen oyuncu/lord alanları yeni nesnelerdir.
 */
export function buildE2EScenario(
  base: CampaignState,
  scenario: E2EScenarioName,
): E2EScenarioSetup {
  switch (scenario) {
    case 'boot':
      return {
        campaign: base,
        dialogueLord: null,
        forcedEncounter: false,
        encounterScenario: undefined,
        encyclopediaOpen: false,
        partyOpen: false,
      };

    case 'encyclopedia':
      return {
        campaign: base,
        dialogueLord: null,
        forcedEncounter: false,
        encounterScenario: undefined,
        encyclopediaOpen: true,
        partyOpen: false,
      };

    case 'party':
      return {
        campaign: base,
        dialogueLord: null,
        forcedEncounter: false,
        encounterScenario: undefined,
        encyclopediaOpen: false,
        partyOpen: true,
      };

    case 'bandit-caught-player': {
      const campaign: CampaignState = {
        ...base,
        roster: { infantry: 6, archer: 0, cavalry: 0, horseArcher: 0 },
        playerHp: base.playerMaxHp,
      };
      const result = replacePreferredLord(
        campaign,
        'lord-kargi',
        (lord) => lord.faction === 'bandits',
        (lord) =>
          nearPlayer(
            withRoster(
              { ...lord, isAtWarWithPlayer: true, relation: -60 },
              { infantry: 16, archer: 8, cavalry: 6, horseArcher: 2 },
            ),
            campaign,
          ),
      );
      return dialogueSetup(result.campaign, result.lord);
    }

    case 'player-caught-bandit': {
      const campaign: CampaignState = {
        ...base,
        roster: { infantry: 20, archer: 20, cavalry: 15, horseArcher: 15 },
        playerHp: base.playerMaxHp,
      };
      const result = replacePreferredLord(
        campaign,
        'lord-kargi',
        (lord) => lord.faction === 'bandits',
        (lord) =>
          nearPlayer(
            withRoster(
              { ...lord, isAtWarWithPlayer: true, relation: -35 },
              { infantry: 6, archer: 2, cavalry: 0, horseArcher: 0 },
            ),
            campaign,
          ),
      );
      return dialogueSetup(result.campaign, result.lord);
    }

    case 'lord-caught-player': {
      const campaign: CampaignState = {
        ...base,
        roster: { infantry: 6, archer: 0, cavalry: 0, horseArcher: 0 },
        playerHp: base.playerMaxHp,
      };
      const result = replacePreferredLord(
        campaign,
        'lord-garios',
        (lord) => lord.faction !== 'bandits',
        (lord) =>
          nearPlayer(
            withRoster(
              { ...lord, isAtWarWithPlayer: true, relation: -55 },
              { infantry: 16, archer: 14, cavalry: 10, horseArcher: 8 },
            ),
            campaign,
          ),
      );
      return dialogueSetup(result.campaign, result.lord);
    }
  }
}
