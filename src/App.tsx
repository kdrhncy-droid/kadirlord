import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttributeId,
  BannerlordSkillId,
  BuildingProjectId,
  CampaignState,
  FactionId,
  LordAgent,
  NewGameStartOptions,
  Settlement,
  SettlementDailyDefault,
  SiegeEngineType,
  TroopRoster,
  UnitTierId,
  WorkshopTypeId,
  advanceDailyEconomyAndWorld,
  advanceSettlementHourlyRest,
  allocateAttributePoint,
  allocateFocusPoint,
  applyPlayerAllegianceChange,
  attemptLordPersuasionStep,
  bombardSettlementWalls,
  buyFoodAtSettlement,
  buyOrChangeWorkshop,
  buyTavernRound,
  calculatePartyStrength,
  constructSiegeEngine,
  createInitialCampaignState,
  deployReservedSiegeEngines,
  executeLordBarterOffer,
  forcePeasantsRecruits,
  forcePeasantsSupplies,
  forgeCustomWeaponAtSmithy,
  getTotalTroops,
  hireMercenariesAtTavern,
  joinArenaTournament,
  manageGarrisonTransfer,
  participateInArenaPractice,
  raidAndPillageVillage,
  ransomPrisonersAtTavern,
  recruitCapturedPrisoners,
  recruitUnit,
  resolveBattleOutcome,
  restAndRecoverAtSettlement,
  sellSurplusLootAtMarket,
  setSettlementDailyDefault,
  upgradeSettlementBuilding,
} from './game/rules';
import type {
  BattleTelemetry,
  CameraControlActions,
  MapCameraTelemetry,
} from './game/types';
import { WorldCanvas } from './components/WorldCanvas';
import { BattlefieldView } from './components/BattlefieldView';
import { GameHud } from './components/GameHud';
import { SettlementModal } from './components/SettlementModal';
import { SiegeEncounterModal } from './components/SiegeEncounterModal';
import { DialogueModal } from './components/DialogueModal';
import { DiplomacyModal } from './components/DiplomacyModal';
import { BannerlordMarketModal } from './components/BannerlordMarketModal';
import { InventoryModal } from './components/InventoryModal';
import { BattleLootModal } from './components/BattleLootModal';
import { PartyModal } from './components/PartyModal';
import { CharacterModal } from './components/CharacterModal';
import {
  commitBattleLoot,
  prepareBattleLoot,
  type PendingBattleLoot,
} from './game/lootTransaction';
import { rollBattleLoot } from './game/loot';
import {
  inventoryItemQuantity,
  getTroopDefinition,
  troopStackTotals,
} from './game/bannerlordFoundation';
import { KingdomManagementModal } from './components/KingdomManagementModal';
import { ArmyCohesionHudWidget, ArmyModal } from './components/ArmyModal';
import {
  boostArmyCohesion,
  createOrExpandPlayerArmy,
  disbandArmy,
  removeLordFromArmy,
  setPlayerArmyTargetSettlement,
} from './game/armySystem';
import { CharacterArenaView } from './components/CharacterArenaView';
import { CharacterCreatorModal } from './components/CharacterCreatorModal';
import { BannerlordPauseModal } from './components/BannerlordPauseModal';
import { BattlePrewarmModal } from './components/BattlePrewarmModal';
import { EncyclopediaModal } from './components/encyclopedia/EncyclopediaModal';
import { BattleMemoryPool, PrewarmStageReport } from './game/battleEnginePool';
import {
  KingdomMacroState,
  createInitialKingdomMacroState,
} from './game/kingdomSystem';
import { advanceWorldDay, stepLiveLordSettlementRecruitment } from './game/worldSim';
import {
  applyBreakInCasualties,
  buildSiegeEncounterView,
  distributeCombinedBesiegerCasualties,
  enterBesiegedSettlement,
  liftPlayerSiege,
  resolveSiegeRole,
  startPlayerSiege,
} from './game/siegeEncounter';
import {
  type EncounterScenario,
  applyPlayerSurrender,
  applySacrificeEscape,
  classifyEncounterScenario,
  isHostileToPlayer,
  resolveCorneredBanditSurrender,
  simulateSendTroopsBattle,
} from './game/encounter';
import { sound } from './game/sound';
import { recruitBatch, refreshRecruitPools } from './game/recruitment';
import {
  defaultStorage,
  readSave,
  readSaveSummary,
  summarizeSave,
  writeSave,
  type BackgroundChoice,
  type SaveData,
  type SaveSummary,
} from './game/saveGame';
import type { CharacterMorphDNA } from './game/characterMorph';
import {
  countLayers,
  speedAfterUi,
  speedBeforeUi,
  topLayer,
  type TimeScale,
  type UiLayer,
  type UiLayerFlags,
} from './game/uiSession';
import {
  buildE2ESiegeScenario,
  buildE2EScenario,
  parseE2ERequest,
  type KadirlordTestApi,
} from './game/testHarness';
import type { SiegeEncounterRole } from './game/siegeEncounter';
import {
  computePlayerDailyEscapeChance,
  payPlayerCaptivityRansom,
  resolvePlayerCaptivityDilemma,
  triggerPlayerCapturedSequence,
} from './game/partySystem';

export default function App() {
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const isAutostart = new URLSearchParams(search).get('autostart') === '1';
  const [e2eRequest] = useState(() => parseE2ERequest(search, import.meta.env.DEV));
  const [initialE2ESetup] = useState(() =>
    buildE2EScenario(
      createInitialCampaignState('Komutan Demirhan', 'noble'),
      e2eRequest.enabled ? e2eRequest.scenario : 'boot',
    ),
  );

  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover'>(
    isAutostart || e2eRequest.enabled ? 'playing' : 'title',
  );
  const [subMode, setSubMode] = useState<'overworld' | 'battle'>('overworld');
  const [campaignTimeScale, setCampaignTimeScale] = useState<TimeScale>(
    e2eRequest.enabled ? e2eRequest.timeScale : 1,
  );
  const [backgroundChoice, setBackgroundChoice] = useState<BackgroundChoice>('noble');
  const [worldToast, setWorldToast] = useState<{ id: string; text: string } | null>(null);
  const [campaign, setCampaign] = useState<CampaignState>(() => initialE2ESetup.campaign);
  const [macroState, setMacroState] = useState<KingdomMacroState>(() =>
    createInitialKingdomMacroState(initialE2ESetup.campaign),
  );

  const cameraActionsRef = useRef<CameraControlActions | null>(null);
  /** Faz 11: harita katmanı lordların gerçek konumlarını buraya yazar (React render'ı yok). */
  const lordPositionsRef = useRef<Map<string, { x: number; z: number }>>(new Map());
  const lordPositionCommandsRef = useRef(new Map<string, { x: number; z: number }>());
  const playerPositionCommandRef = useRef<{ x: number; z: number } | null>(null);
  /** Faz 11: savaş isteği hesabı için klan kayıtları (interval kapanışında bayatlamasın). */
  const macroStateRef = useRef<KingdomMacroState | null>(null);
  macroStateRef.current = macroState;

  // Proximity & Active Modals
  const [nearSettlement, setNearSettlement] = useState<Settlement | null>(null);
  const [nearLord, setNearLord] = useState<LordAgent | null>(null);
  const [activeSettlementModal, setActiveSettlementModal] = useState<Settlement | null>(null);
  const [activeSiegeSettlementId, setActiveSiegeSettlementId] = useState<string | null>(null);
  const [settlementModalInitialTab, setSettlementModalInitialTab] = useState<'overview' | 'siege'>(
    'overview',
  );
  const [activeDiplomacyLord, setActiveDiplomacyLord] = useState<LordAgent | null>(null);
  // Faz 6: yüz yüze diyalog ekranı (lord veya yerleşim reisi)
  const [dialogueLord, setDialogueLord] = useState<LordAgent | null>(
    e2eRequest.enabled ? initialE2ESetup.dialogueLord : null,
  );
  const [dialogueSettlement, setDialogueSettlement] = useState<Settlement | null>(null);
  const [isForcedEncounter, setIsForcedEncounter] = useState(
    e2eRequest.enabled ? initialE2ESetup.forcedEncounter : false,
  );
  const [encounterScenario, setEncounterScenario] = useState<EncounterScenario | undefined>(
    e2eRequest.enabled ? initialE2ESetup.encounterScenario : undefined,
  );
  const [isMarketModalOpen, setIsMarketModalOpen] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(
    e2eRequest.enabled ? initialE2ESetup.partyOpen : false,
  );
  const [isCharacterModalOpen, setIsCharacterModalOpen] = useState(false);
  const [pendingBattleLoot, setPendingBattleLoot] = useState<PendingBattleLoot | null>(null);
  const [isKingdomModalOpen, setIsKingdomModalOpen] = useState(false);
  const [isArmyModalOpen, setIsArmyModalOpen] = useState(false);
  const [battleSiegeSettlementContextId, setBattleSiegeSettlementContextId] = useState<
    string | null
  >(null);
  const [isCharacterCreatorOpen, setIsCharacterCreatorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'campaign' | 'character_arena'>('campaign');
  // Faz 1: Bannerlord Ansiklopedisi (N)
  const [isEncyclopediaOpen, setIsEncyclopediaOpen] = useState(
    e2eRequest.enabled ? initialE2ESetup.encyclopediaOpen : false,
  );
  /** Tanışılan kahramanlar — orta yol fog of war (yaş/beceri açılır). */
  const [metHeroIds, setMetHeroIds] = useState<string[]>([]);
  /** Yerleşimde aktif bekleme (Burada bir süre bekle / fast-forward rest). */
  const [isWaitingInSettlement, setIsWaitingInSettlement] = useState(false);

  /* ── Faz 10a: kalıcılık + zaman/katman yönetimi ── */
  /** Diskteki kayıt özeti (başlık ekranındaki "Devam Et" için). */
  const [saveInfo, setSaveInfo] = useState<SaveSummary | null>(() => readSaveSummary(defaultStorage()));
  /** Kısa bilgi bildirimi (kaydedildi / yüklendi). */
  const [toast, setToast] = useState<string | null>(null);
  /** UI açılmadan önceki oynatma hızı — kapanışta buraya dönülür. */
  const speedBeforeUiRef = useRef<TimeScale>(1);
  /** Şu an dünya bir UI yüzünden mi duraklatıldı? */
  const pausedByUiRef = useRef(false);

  const [mapTelemetry, setMapTelemetry] = useState<MapCameraTelemetry>({
    focusX: -24,
    focusZ: 18,
    zoomDist: 52,
    yawDeg: 0,
    isFollowingPlayer: true,
    biomeLabel: 'İmparatorluk Ovaları',
    partySpeed: 4.2,
    onRoad: true,
    isMoving: false,
    labels: [],
  });

  // Battle State & Pre-Allocated Object Pool
  const campaignBattlePoolRef = useRef<BattleMemoryPool>(new BattleMemoryPool());
  const [battlePrewarmStages, setBattlePrewarmStages] = useState<PrewarmStageReport[] | null>(null);
  const [battleTargetLordId, setBattleTargetLordId] = useState<string | null>(null);
  const [battleTargetSettlementId, setBattleTargetSettlementId] = useState<string | null>(null);
  const [battleTelemetry, setBattleTelemetry] = useState<BattleTelemetry>({
    playerHp: 120,
    playerMaxHp: 120,
    alliesAlive: 17,
    alliesTotal: 17,
    enemiesAlive: 11,
    enemiesTotal: 11,
    enemyCommanderName: 'Kara Geçit Yağmacıları',
    orderSummary: '—',
  });

  const [outcomeSnapshot, setOutcomeSnapshot] = useState<{
    victory: boolean;
    title: string;
    subtitle: string;
    enemiesDefeated: number;
    renown: number;
    gold: number;
    fiefsOwned: number;
  } | null>(null);

  const [muted, setMuted] = useState(false);

  /* ── E2E test kancası: yalnız DEV + ?e2e=1 (parseE2ERequest kilidi) ── */
  const testStateRef = useRef({
    campaign,
    gameState,
    subMode,
    campaignTimeScale,
    dialogueLord,
    isForcedEncounter,
    encounterScenario,
    isEncyclopediaOpen,
    activeSettlementModal,
    isMarketModalOpen,
    isInventoryModalOpen,
    isPartyModalOpen,
    isCharacterModalOpen,
    pendingBattleLoot,
  });
  testStateRef.current = {
    campaign,
    gameState,
    subMode,
    campaignTimeScale,
    dialogueLord,
    isForcedEncounter,
    encounterScenario,
    isEncyclopediaOpen,
    activeSettlementModal,
    isMarketModalOpen,
    isInventoryModalOpen,
    isPartyModalOpen,
    isCharacterModalOpen,
    pendingBattleLoot,
  };

  useEffect(() => {
    if (!e2eRequest.enabled) return;

    const api: KadirlordTestApi = {
      version: 1,
      ready: true,
      scenario: e2eRequest.scenario,
      seed: e2eRequest.seed,
      getState: () => {
        const state = testStateRef.current;
        const current = state.campaign;
        return {
          ready: true,
          version: 1,
          scenario: e2eRequest.scenario,
          seed: e2eRequest.seed,
          gameState: state.gameState,
          subMode: state.subMode,
          timeScale: state.campaignTimeScale,
          day: current.day,
          player: {
            name: current.playerName,
            x: current.playerX,
            z: current.playerZ,
            hp: current.playerHp,
            maxHp: current.playerMaxHp,
            gold: current.gold,
            food: current.food,
            morale: current.morale,
            renown: current.renown,
            prisoners: current.prisoners,
            roster: { ...current.roster },
            troops: getTotalTroops(current.roster),
          },
          dialogue: {
            lordId: state.dialogueLord?.id ?? null,
            lordName: state.dialogueLord?.name ?? null,
            forced: state.isForcedEncounter,
            scenario: state.encounterScenario ?? null,
          },
          encyclopediaOpen: state.isEncyclopediaOpen,
          inventory: (current.inventoryItems ?? []).map((item) => ({
            id: item.id,
            definitionId: item.definitionId ?? item.id,
            quantity: Math.max(1, Math.floor(item.quantity ?? 1)),
            locked: Boolean(item.locked),
          })),
          inventoryOpen: state.isInventoryModalOpen,
          partyOpen: state.isPartyModalOpen,
          characterOpen: state.isCharacterModalOpen,
          heroes: (current.heroes ?? []).map((hero) => ({
            id: hero.id,
            name: hero.name,
            activeEquipmentSet: hero.activeEquipmentSet,
            equipment: {
              BATTLE: { ...hero.equipment.BATTLE },
              CIVILIAN: { ...hero.equipment.CIVILIAN },
            },
          })),
          troopStacks: (current.troopStacks ?? []).map((stack) => ({
            troopId: stack.troopId,
            count: stack.count,
            wounded: stack.wounded,
            xp: stack.xp,
          })),
          market: {
            open: state.isMarketModalOpen,
            settlementId: state.activeSettlementModal?.id ?? null,
            merchantGold:
              current.settlements.find(
                (settlement) => settlement.id === state.activeSettlementModal?.id,
              )?.merchantGold ?? null,
            stock: {
              ...(current.settlements.find(
                (settlement) => settlement.id === state.activeSettlementModal?.id,
              )?.marketStock ?? {}),
            },
          },
          loot: {
            open: Boolean(state.pendingBattleLoot),
            itemCount: state.pendingBattleLoot?.lootItems.length ?? 0,
            gold: state.pendingBattleLoot?.goldLoot ?? 0,
            items: (state.pendingBattleLoot?.lootItems ?? []).map((item) => ({
              id: item.id,
              definitionId: item.definitionId ?? item.id,
              quantity: inventoryItemQuantity(item),
            })),
          },
          counts: {
            lords: current.lords.length,
            settlements: current.settlements.length,
          },
          settlementOpen: Boolean(state.activeSettlementModal),
          activeSettlementId: state.activeSettlementModal?.id ?? null,
        };
      },
      setTimeScale: (scale) => {
        if (scale === 0 || scale === 1 || scale === 2 || scale === 4) {
          setCampaignTimeScale(scale);
        }
      },
      setPlayer: (patch) => {
        setCampaign((prev) => {
          const playerMaxHp = patch.playerMaxHp ?? prev.playerMaxHp;
          return {
            ...prev,
            gold: patch.gold ?? prev.gold,
            food: patch.food ?? prev.food,
            morale: patch.morale ?? prev.morale,
            renown: patch.renown ?? prev.renown,
            influence: patch.influence ?? prev.influence,
            prisoners: patch.prisoners ?? prev.prisoners,
            roster: patch.roster ? { ...prev.roster, ...patch.roster } : prev.roster,
            playerMaxHp,
            playerHp: Math.max(
              0,
              Math.min(playerMaxHp, patch.playerHp ?? prev.playerHp),
            ),
          };
        });
      },
      setLord: (lordId, patch) => {
        if (!testStateRef.current.campaign.lords.some((lord) => lord.id === lordId)) {
          return false;
        }
        if (patch.x !== undefined || patch.z !== undefined) {
          const campaignLord = testStateRef.current.campaign.lords.find((lord) => lord.id === lordId)!;
          const live = lordPositionsRef.current.get(lordId);
          const nextPos = {
            x: patch.x ?? live?.x ?? campaignLord.x,
            z: patch.z ?? live?.z ?? campaignLord.z,
          };
          lordPositionCommandsRef.current.set(lordId, nextPos);
          lordPositionsRef.current.set(lordId, nextPos);
        }
        const applyPatch = (lord: LordAgent, day: number): LordAgent => {
          const roster = patch.roster ?? lord.roster;
          const legacyTargetId = (patch as { targetSettlementId?: string }).targetSettlementId;
          const nextOrder =
            patch.order !== undefined
              ? patch.order
              : patch.currentAction === 'SIEGE' && legacyTargetId
                ? {
                    kind: 'SIEGE' as const,
                    targetSettlementId: legacyTargetId,
                    sinceDay: lord.order?.sinceDay ?? day,
                    siegeProgress: lord.order?.siegeProgress ?? 68,
                  }
                : lord.order;
          return {
            ...lord,
            ...patch,
            order: nextOrder,
            roster,
            armySize: patch.armySize ?? getTotalTroops(roster),
          };
        };
        setCampaign((prev) => ({
          ...prev,
          lords: prev.lords.map((lord) => (lord.id === lordId ? applyPatch(lord, prev.day) : lord)),
        }));
        setDialogueLord((prev) =>
          prev?.id === lordId ? applyPatch(prev, testStateRef.current.campaign.day) : prev,
        );
        return true;
      },
      getLordPosition: (lordId) => {
        const live = lordPositionsRef.current.get(lordId);
        if (live) return { ...live };
        const lord = testStateRef.current.campaign.lords.find((item) => item.id === lordId);
        return lord ? { x: lord.x, z: lord.z } : null;
      },
      openSiege: (role, options) => {
        const setup = buildE2ESiegeScenario(testStateRef.current.campaign, role);
        if (!setup) return false;
        const settlement = setup.campaign.settlements.find(
          (item) => item.id === setup.settlementId,
        );
        if (!settlement) return false;
        const besieger = setup.campaign.lords.find(
          (lord) =>
            lord.order?.kind === 'SIEGE' &&
            lord.order.targetSettlementId === settlement.id,
        );
        const campX = role === 'attacker' ? setup.campaign.playerX : (besieger?.x ?? settlement.x + 1);
        const campZ = role === 'attacker' ? setup.campaign.playerZ : (besieger?.z ?? settlement.z);
        setup.campaign.lords
          .filter(
            (lord) =>
              lord.order?.kind === 'SIEGE' &&
              lord.order.targetSettlementId === settlement.id,
          )
          .forEach((lord) => {
            const pos = { x: lord.x, z: lord.z };
            lordPositionCommandsRef.current.set(lord.id, pos);
            lordPositionsRef.current.set(lord.id, pos);
          });
        playerPositionCommandRef.current = {
          x: setup.campaign.playerX,
          z: setup.campaign.playerZ,
        };
        testStateRef.current = {
          ...testStateRef.current,
          campaign: setup.campaign,
        };
        const campAngle = Math.atan2(campZ - settlement.z, campX - settlement.x);
        const focusOffset = options?.focusOnCamp ? 11 : 10;
        setCampaign(setup.campaign);
        setActiveSettlementModal(null);
        setDialogueLord(null);
        setDialogueSettlement(null);
        setActiveSiegeSettlementId(setup.settlementId);
        cameraActionsRef.current?.focusOnCoords(
          settlement.x + Math.cos(campAngle) * focusOffset,
          settlement.z + Math.sin(campAngle) * focusOffset,
          42,
        );
        return true;
      },
      closeSiege: () => setActiveSiegeSettlementId(null),
      openSettlement: (settlementIdOrType, options) => {
        const current = testStateRef.current.campaign;
        const target =
          !settlementIdOrType || settlementIdOrType === 'TOWN'
            ? current.settlements.find((s) => s.id === 'zeonica_west') ??
              current.settlements.find((s) => s.id === 'zeonica') ??
              current.settlements.find((s) => s.type === 'TOWN')
            : settlementIdOrType === 'CASTLE'
              ? current.settlements.find((s) => s.id === 'lochana_castle') ??
                current.settlements.find((s) => s.type === 'CASTLE')
              : settlementIdOrType === 'VILLAGE'
                ? current.settlements.find((s) => s.id === 'sancaktepe') ??
                  current.settlements.find((s) => s.type === 'VILLAGE')
                : current.settlements.find(
                    (s) =>
                      s.id === settlementIdOrType ||
                      s.name.toLowerCase() === settlementIdOrType.toLowerCase(),
                  );
        if (!target) return false;
        playerPositionCommandRef.current = { x: target.x + 2, z: target.z + 2 };
        setCampaign((prev) => ({
          ...prev,
          playerX: target.x + 2,
          playerZ: target.z + 2,
          settlements: prev.settlements.map((s) =>
            s.id === target.id ? { ...s, visited: true } : s,
          ),
        }));
        setSettlementModalInitialTab(options?.tab ?? 'overview');
        setActiveSiegeSettlementId(null);
        setDialogueLord(null);
        setDialogueSettlement(null);
        setActiveSettlementModal({ ...target, visited: true });
        cameraActionsRef.current?.focusOnCoords(target.x - 4, target.z, 36);
        return true;
      },
      closeSettlement: () => setActiveSettlementModal(null),
      openDialogue: (lordId, options) => {
        const current = testStateRef.current.campaign;
        const lord = current.lords.find((item) => item.id === lordId);
        if (!lord) return false;
        const info = classifyEncounterScenario(lord, current);
        setDialogueSettlement(null);
        setDialogueLord(lord);
        setIsForcedEncounter(options?.forced ?? info.forced);
        setEncounterScenario(options?.scenario ?? info.scenario);
        return true;
      },
      closeDialogue: () => {
        setDialogueLord(null);
        setDialogueSettlement(null);
        setIsForcedEncounter(false);
        setEncounterScenario(undefined);
      },
      openEncyclopedia: () => setIsEncyclopediaOpen(true),
      closeEncyclopedia: () => setIsEncyclopediaOpen(false),
      openParty: () => setIsPartyModalOpen(true),
      closeParty: () => setIsPartyModalOpen(false),
      openCharacter: () => setIsCharacterModalOpen(true),
      closeCharacter: () => setIsCharacterModalOpen(false),
      openMarket: (settlementId) => {
        const current = testStateRef.current.campaign;
        const settlement = settlementId
          ? current.settlements.find((candidate) => candidate.id === settlementId)
          : current.settlements.find((candidate) => candidate.type === 'TOWN');
        if (!settlement) return false;
        setCampaign((prev) => ({
          ...prev,
          settlements: prev.settlements.map((candidate) =>
            candidate.id === settlement.id ? { ...candidate, visited: true } : candidate,
          ),
        }));
        setActiveSettlementModal({ ...settlement, visited: true });
        setIsMarketModalOpen(true);
        return true;
      },
      closeMarket: () => setIsMarketModalOpen(false),
      openInventory: () => setIsInventoryModalOpen(true),
      closeInventory: () => setIsInventoryModalOpen(false),
      openLoot: (lootItems, options) => {
        const current = testStateRef.current.campaign;
        const items =
          lootItems && lootItems.length > 0
            ? lootItems
            : rollBattleLoot(current, {
                enemyFaction: 'bandits',
                defeated: options?.enemiesDefeated ?? 20,
                siege: false,
                seedKey: 'test-open-loot',
              });
        setPendingBattleLoot({
          enemyLordId: null,
          conqueredSettlementId: null,
          enemiesDefeatedCount: options?.enemiesDefeated ?? 20,
          playerTroopLosses: {},
          goldLoot: options?.goldLoot ?? 180,
          renownGain: 15,
          prisonersGain: 4,
          lootItems: items,
          isSiegeVictory: false,
          defeatedFaction: 'bandits',
        });
        return true;
      },
      closeLoot: () => setPendingBattleLoot(null),
    };

    window.__kadirlordTest = api;
    document.body.dataset.e2eReady = 'true';
    document.body.dataset.e2eScenario = e2eRequest.scenario;
    if (e2eRequest.siegeRole) {
      api.openSiege(e2eRequest.siegeRole, { focusOnCamp: e2eRequest.focusSiegeCamp });
      if (e2eRequest.focusSiegeCamp) api.closeSiege();
    }

    return () => {
      if (window.__kadirlordTest === api) delete window.__kadirlordTest;
      delete document.body.dataset.e2eReady;
      delete document.body.dataset.e2eScenario;
    };
  }, [e2eRequest]);

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  /** Sefer başlatılırken kullanılan ad (karakter yaratıcıda değiştirilebilir). */
  const [playerName, setPlayerName] = useState('Komutan Demirhan');
  const [isNewGameCreatorFlow, setIsNewGameCreatorFlow] = useState(false);
  const [isTitleLoadOpen, setIsTitleLoadOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [loadingScreen, setLoadingScreen] = useState<{
    active: boolean;
    title: string;
    subtitle: string;
    tip: string;
  } | null>(null);

  const BANNERLORD_TIPS = [
    'Kalradya İpucu: Köylerden topladığınız gönüllüleri savaş tecrübesiyle terfi ettirerek krallığınıza özgü ağır süvari ve okçulara dönüştürün.',
    'Kalradya İpucu: Bir krallığın kalesini veya şehrini kuşattığınızda o krallıkla resmen savaşa girersiniz; kuşatma kampında koçbaşı ve mancınık inşa etmeyi unutmayın.',
    'Kalradya İpucu: Envanterinizdeki binek atları piyadelerinizin harita yürüyüş hızını artırır; katırlar ve yük beygirleri ise erzak ve ganimet kapasitenizi genişletir.',
    'Kalradya İpucu: Nam (Renown) yalnız gerçek meydan muharebeleri, kale kuşatmaları, turnuva zaferleri ve eşraf görevleriyle kazanılır.',
  ];

  const runWithLoadingScreen = useCallback(
    (title: string, subtitle: string, action: () => void) => {
      if (e2eRequest.enabled || isAutostart) {
        action();
        return;
      }
      const tip = BANNERLORD_TIPS[Math.floor(Math.random() * BANNERLORD_TIPS.length)];
      setLoadingScreen({ active: true, title, subtitle, tip });
      window.setTimeout(() => {
        action();
        window.setTimeout(() => {
          setLoadingScreen(null);
        }, 260);
      }, 420);
    },
    [e2eRequest.enabled, isAutostart],
  );

  const startGame = useCallback(
    (
      customDna?: CharacterMorphDNA,
      customName?: string,
      startOptions?: NewGameStartOptions,
    ) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const finalName = customName || playerName;
      const fresh = createInitialCampaignState(
        finalName,
        backgroundChoice,
        startOptions ?? { realisticBannerlordStart: true },
      );
      if (customDna) {
        fresh.playerMorphDNA = customDna;
      }
      setCampaign(fresh);
      setMacroState(createInitialKingdomMacroState(fresh));
      setSubMode('overworld');
      setCampaignTimeScale(1);
      setActiveSettlementModal(null);
      setActiveSiegeSettlementId(null);
      setActiveDiplomacyLord(null);
      setDialogueLord(null);
      setDialogueSettlement(null);
      setIsForcedEncounter(false);
      setEncounterScenario(undefined);
      setIsMarketModalOpen(false);
      setIsInventoryModalOpen(false);
      setIsPartyModalOpen(false);
      setIsCharacterModalOpen(false);
      setIsKingdomModalOpen(false);
      setIsEncyclopediaOpen(false);
      setOutcomeSnapshot(null);
      setMetHeroIds([]);
      setGameState('playing');
      document.body.dataset.state = 'playing';
      cameraActionsRef.current?.focusOnCoords(fresh.playerX, fresh.playerZ, 52);
      cameraActionsRef.current?.focusOnPlayer();
      sound.playSettlementEnter();
    },
    [backgroundChoice, playerName],
  );

  /* ───────────────── Faz 10a: UI katmanları & kayıt ───────────────── */

  /** O an açık olan UI katmanları (Esc sırası ve duraklatma bunlardan türetilir). */
  const uiLayers: UiLayerFlags = {
    creator: isCharacterCreatorOpen,
    character: isCharacterModalOpen,
    inventory: isInventoryModalOpen,
    party: isPartyModalOpen,
    market: isMarketModalOpen,
    kingdom: isKingdomModalOpen || isArmyModalOpen,
    dialogue: !!(dialogueLord || dialogueSettlement),
    settlement: !isWaitingInSettlement && (!!activeSettlementModal || !!activeSiegeSettlementId),
    diplomacy: !!activeDiplomacyLord,
    pause: gameState === 'paused',
  };

  const closeLayer = useCallback((layer: UiLayer) => {
    switch (layer) {
      case 'creator':
        setIsCharacterCreatorOpen(false);
        break;
      case 'character':
        setIsCharacterModalOpen(false);
        break;
      case 'inventory':
        setIsInventoryModalOpen(false);
        break;
      case 'party':
        setIsPartyModalOpen(false);
        break;
      case 'market':
        setIsMarketModalOpen(false);
        break;
      case 'kingdom':
        setIsKingdomModalOpen(false);
        setIsArmyModalOpen(false);
        break;
      case 'dialogue':
        if (isForcedEncounter) break;
        setDialogueLord(null);
        setDialogueSettlement(null);
        setIsForcedEncounter(false);
        setEncounterScenario(undefined);
        break;
      case 'settlement':
        setActiveSettlementModal(null);
        setActiveSiegeSettlementId(null);
        setIsWaitingInSettlement(false);
        break;
      case 'diplomacy':
        setActiveDiplomacyLord(null);
        break;
      case 'pause':
        setGameState('playing');
        break;
    }
  }, [isForcedEncounter]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Faz 11: fetih haberini vakayinamenin en yeni kaydından türet (updater içinde yan etki yok).
  const lastChronicleIdRef = useRef<string | null>(null);
  useEffect(() => {
    const latest = campaign.chronicle[0];
    if (!latest) return;
    if (lastChronicleIdRef.current === null) {
      lastChronicleIdRef.current = latest.id; // ilk yüklemede geçmişi duyurma
      return;
    }
    if (lastChronicleIdRef.current === latest.id) return;
    lastChronicleIdRef.current = latest.id;
    if (latest.category === 'CONQUEST') {
      setWorldToast({ id: latest.id, text: latest.text });
    }
  }, [campaign.chronicle]);

  // Faz 11: dünya olayları (fetih/harp) 7 sn görünür.
  useEffect(() => {
    if (!worldToast) return;
    const timer = window.setTimeout(() => setWorldToast(null), 7000);
    return () => window.clearTimeout(timer);
  }, [worldToast]);

  /** Diske yazar; dönen değer başarılı mı? */
  const persist = useCallback(
    (nextCampaign = campaign, nextMacro = macroState) => {
      // Senaryo durumları oyuncunun gerçek sefer kaydını asla ezmemeli.
      if (e2eRequest.enabled) return false;
      const ok = writeSave(defaultStorage(), {
        campaign: nextCampaign,
        macroState: nextMacro,
        metHeroIds,
        backgroundChoice,
      });
      if (ok) {
        setSaveInfo(
          summarizeSave({
            version: 4,
            savedAt: Date.now(),
            backgroundChoice,
            metHeroIds,
            campaign: nextCampaign,
            macroState: nextMacro,
          }),
        );
      }
      return ok;
    },
    [campaign, macroState, metHeroIds, backgroundChoice, e2eRequest.enabled],
  );

  /** Otomatik kayıt: her oyun günü geçişinde (ana iş parçacığını dondurmamak için 150ms gecikmeli). */
  const lastAutosaveDayRef = useRef(-1);
  const autosaveTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (e2eRequest.enabled) return;
    if (gameState !== 'playing' || subMode !== 'overworld') return;
    if (lastAutosaveDayRef.current === campaign.day) return;
    lastAutosaveDayRef.current = campaign.day;
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = window.setTimeout(() => {
      persist();
    }, 150);
  }, [campaign.day, gameState, subMode, persist, e2eRequest.enabled]);

  /** Diskteki kaydı yükler. */
  const continueGame = useCallback(() => {
    const data = readSave(defaultStorage());
    if (!data) {
      showToast('Kayıt bulunamadı — yeni sefer başlatılıyor.');
      setSaveInfo(null);
      startGame();
      return;
    }
    const fresh = data.campaign;
    setCampaign(fresh);
    setMacroState(data.macroState);
    setMetHeroIds(data.metHeroIds);
    setBackgroundChoice(data.backgroundChoice);
    setPlayerName(fresh.playerName);
    setSubMode('overworld');
    setViewMode('campaign');
    setCampaignTimeScale(1);
    setActiveSettlementModal(null);
    setActiveDiplomacyLord(null);
    setDialogueLord(null);
    setDialogueSettlement(null);
    setIsMarketModalOpen(false);
    setIsInventoryModalOpen(false);
    setIsPartyModalOpen(false);
    setIsCharacterModalOpen(false);
    setIsKingdomModalOpen(false);
    setIsEncyclopediaOpen(false);
    setOutcomeSnapshot(null);
    setGameState('playing');
    document.body.dataset.state = 'playing';
    lastAutosaveDayRef.current = fresh.day;
    cameraActionsRef.current?.focusOnCoords(fresh.playerX, fresh.playerZ, 52);
    cameraActionsRef.current?.focusOnPlayer();
    sound.playSettlementEnter();
    showToast(`Sefer yüklendi · Gün ${fresh.day}`);
  }, [showToast, startGame]);

  /** BannerlordPauseModal veya kayıt ekranından gelen tam SaveData'yı yükler. */
  const handleLoadSaveData = useCallback((data: SaveData) => {
    const fresh = data.campaign;
    setCampaign(fresh);
    setMacroState(data.macroState);
    setMetHeroIds(data.metHeroIds);
    setBackgroundChoice(data.backgroundChoice);
    setPlayerName(fresh.playerName);
    setSubMode('overworld');
    setViewMode('campaign');
    setCampaignTimeScale(1);
    setActiveSettlementModal(null);
    setActiveSiegeSettlementId(null);
    setActiveDiplomacyLord(null);
    setDialogueLord(null);
    setDialogueSettlement(null);
    setIsMarketModalOpen(false);
    setIsInventoryModalOpen(false);
    setIsPartyModalOpen(false);
    setIsCharacterModalOpen(false);
    setIsKingdomModalOpen(false);
    setIsEncyclopediaOpen(false);
    setOutcomeSnapshot(null);
    setGameState('playing');
    document.body.dataset.state = 'playing';
    lastAutosaveDayRef.current = fresh.day;
    cameraActionsRef.current?.focusOnCoords(fresh.playerX, fresh.playerZ, 52);
    cameraActionsRef.current?.focusOnPlayer();
    sound.playSettlementEnter();
  }, []);

  /**
   * Dünya yalnız bir UI katmanı açıkken duraklatılır; kapanınca **önceki hıza**
   * dönülür (eski sürümde hız 0'da kalıyordu — Faz 10a).
   */
  const uiPausesWorld = countLayers(uiLayers) > 0;
  const setMapTimeScale = useCallback(
    (timeScale: TimeScale) => {
      if (uiPausesWorld && timeScale !== 0) return;
      setCampaignTimeScale(timeScale);
    },
    [uiPausesWorld],
  );
  useEffect(() => {
    if (uiPausesWorld && !pausedByUiRef.current) {
      if (campaignTimeScale !== 0) speedBeforeUiRef.current = speedBeforeUi(campaignTimeScale);
      pausedByUiRef.current = true;
      setCampaignTimeScale(0);
    } else if (!uiPausesWorld && pausedByUiRef.current) {
      pausedByUiRef.current = false;
      setCampaignTimeScale(speedAfterUi(speedBeforeUiRef.current));
    }
  }, [uiPausesWorld, campaignTimeScale]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Form alanında yazarken kısayollar devre dışı.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Ansiklopedi açıkken kendi tuş yönetimi geçerli (Esc geri, N kapat).
      if (isEncyclopediaOpen) return;
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        if (e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      // ── Esc: en üstteki UI katmanını kapat, katman yoksa seferi duraklat ──
      if (e.code === 'Escape') {
        const layer = topLayer(uiLayers);
        if (layer) {
          e.preventDefault();
          closeLayer(layer);
          return;
        }
      }

      if (gameState === 'title') {
        if (isCharacterCreatorOpen || isTitleLoadOpen || isSettingsModalOpen || isEncyclopediaOpen) {
          if (e.code === 'Escape') {
            if (isCharacterCreatorOpen) {
              setIsNewGameCreatorFlow(false);
              setIsCharacterCreatorOpen(false);
            } else if (isTitleLoadOpen) {
              setIsTitleLoadOpen(false);
            } else if (isSettingsModalOpen) {
              setIsSettingsModalOpen(false);
            }
          }
          return;
        }
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          // Kayıt varsa Enter "devam et"tir; yeni sefer karakter oluşturucuyla başlatılır.
          if (saveInfo) continueGame();
          else {
            setIsNewGameCreatorFlow(true);
            setIsCharacterCreatorOpen(true);
          }
        } else if (e.code === 'KeyB') {
          e.preventDefault();
          setIsNewGameCreatorFlow(false);
          setIsCharacterCreatorOpen((prev) => !prev);
        }
        return;
      }

      if (e.code === 'KeyN' && gameState === 'playing' && subMode === 'overworld') {
        e.preventDefault();
        setIsEncyclopediaOpen(true);
        return;
      }

      if (e.code === 'KeyM') {
        const nextMuted = sound.toggleMute();
        setMuted(nextMuted);
        return;
      }

      if (e.code === 'KeyV' && gameState === 'playing' && subMode === 'overworld' && !uiPausesWorld) {
        setIsNewGameCreatorFlow(false);
        setIsCharacterCreatorOpen(true);
        return;
      }

      if (e.code === 'KeyC' && gameState === 'playing' && subMode === 'overworld') {
        if (uiPausesWorld && !isCharacterModalOpen) return;
        e.preventDefault();
        setIsCharacterModalOpen((prev) => !prev);
        return;
      }

      if (e.code === 'KeyP' && gameState === 'playing' && subMode === 'overworld') {
        if (uiPausesWorld && !isPartyModalOpen) return;
        e.preventDefault();
        setIsPartyModalOpen((prev) => !prev);
        return;
      }

      if (e.code === 'Escape') {
        if (uiPausesWorld) return;
        if (gameState === 'playing') {
          setGameState('paused');
        } else if (gameState === 'paused') {
          setGameState('playing');
        }
        return;
      }

      // UI açıkken dünya kısayolları (Space/1/2/3) çalışmaz.
      if (uiPausesWorld) return;

      // Bannerlord Overworld Map Time Shortcuts: Space toggles pause/play on map, 1/2/3 set speed
      if (gameState === 'playing' && subMode === 'overworld') {
        if (e.code === 'Space') {
          e.preventDefault();
          setCampaignTimeScale((prev) => (prev === 0 ? 1 : 0));
        } else if (e.code === 'Digit1') {
          setCampaignTimeScale(1);
        } else if (e.code === 'Digit2') {
          setCampaignTimeScale(2);
        } else if (e.code === 'Digit3') {
          setCampaignTimeScale(4);
        }
      }

      // Savaş içi bölük emirleri (0-4 + F tuşları) BattlefieldView'de
      // capture aşamasında işlenir (B4); burada rakam tuşlarına dokunulmaz.
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState,
    subMode,
    activeSettlementModal,
    activeDiplomacyLord,
    isEncyclopediaOpen,
    isMarketModalOpen,
    isInventoryModalOpen,
    isPartyModalOpen,
    isCharacterModalOpen,
    isKingdomModalOpen,
    isCharacterCreatorOpen,
    dialogueLord,
    dialogueSettlement,
    uiPausesWorld,
    uiLayers,
    closeLayer,
    startGame,
    continueGame,
    saveInfo,
  ]);

  // Living World Periodic Tick scaled by campaignTimeScale (Faz 11: canlı dünya)
  useEffect(() => {
    if (gameState !== 'playing' || subMode !== 'overworld' || campaignTimeScale === 0) return;
    const intervalMs = Math.round(16000 / campaignTimeScale);
    const timer = setInterval(() => {
      setCampaign((prev) => {
        const tick = advanceWorldDay(prev, {
          lordPositions: lordPositionsRef.current,
          clans: macroStateRef.current?.clans,
          playerPos: { x: prev.playerX, z: prev.playerZ },
        });
        // Fetih bildirimi, vakayinameye düşen en yeni olaydan türetilir (aşağıdaki effect).
        const next = tick.state;
        // Gönüllü üretimi günlük tik içindedir (10.7); toplu tazeleme yok.
        return { ...next, settlements: refreshRecruitPools(next.settlements, next.day) };
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [gameState, subMode, campaignTimeScale]);

  // 24-Hour Continuous Clock & Settlement Waiting Progression (Bannerlord Clock)
  useEffect(() => {
    if (gameState !== 'playing' || subMode !== 'overworld' || campaignTimeScale === 0) return;
    const hourIntervalMs = Math.max(70, Math.round(667 / campaignTimeScale));
    const timer = setInterval(() => {
      setCampaign((prev) => {
        let next = prev;
        const currentHour = typeof next.hour === 'number' ? next.hour : 9;
        const nextHour = (currentHour + 1) % 24;

        if (isWaitingInSettlement && activeSettlementModal) {
          const restRes = advanceSettlementHourlyRest(next, activeSettlementModal.id);
          next = restRes.nextState;
        }

        return {
          ...next,
          hour: nextHour,
        };
      });
    }, hourIntervalMs);
    return () => clearInterval(timer);
  }, [gameState, subMode, campaignTimeScale, isWaitingInSettlement, activeSettlementModal]);

  // Settlement wait interruption when hostile army approaches
  useEffect(() => {
    if (!isWaitingInSettlement || !activeSettlementModal) return;
    const hostile = campaign.lords.find((l) => {
      if (!isHostileToPlayer(l) || l.characterState === 'CAPTIVE' || l.characterState === 'DEAD') return false;
      const live = lordPositionsRef.current.get(l.id) ?? { x: l.x, z: l.z };
      return Math.hypot(live.x - activeSettlementModal.x, live.z - activeSettlementModal.z) < 16;
    });
    if (hostile) {
      setIsWaitingInSettlement(false);
      setCampaignTimeScale(0);
      showToast(
        `Düşman ordusu (${hostile.name}) ${activeSettlementModal.name} surlarına dayandı! Bekleme kesintiye uğradı!`,
      );
    }
  }, [campaign.lords, isWaitingInSettlement, activeSettlementModal, campaign, showToast]);

  // Lordlar dost köy/şehre vardıklarında 16 sn'lik gün sonunu beklemeden gönüllüleri anında toplar ve ayrılır
  useEffect(() => {
    if (gameState !== 'playing' || subMode !== 'overworld' || campaignTimeScale === 0) return;
    const intervalMs = Math.max(500, Math.round(2000 / campaignTimeScale));
    const timer = setInterval(() => {
      setCampaign((prev) => stepLiveLordSettlementRecruitment(prev, lordPositionsRef.current));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [gameState, subMode, campaignTimeScale]);

  const handleOpenSettlement = useCallback((settlement: Settlement) => {
    setCampaign((prev) => {
      const current = prev.settlements.find((candidate) => candidate.id === settlement.id) ?? settlement;
      const nextState =
        current.visited
          ? prev
          : {
              ...prev,
              settlements: prev.settlements.map((candidate) =>
                candidate.id === settlement.id ? { ...candidate, visited: true } : candidate,
              ),
            };
      const live =
        nextState.settlements.find((candidate) => candidate.id === settlement.id) ?? current;
      const role = resolveSiegeRole(nextState, live.id);
      if (role) {
        setSettlementModalInitialTab('overview');
        setActiveSettlementModal(null);
        setActiveSiegeSettlementId(live.id);
      } else {
        setSettlementModalInitialTab('overview');
        setActiveSiegeSettlementId(null);
        setActiveSettlementModal(live);
        cameraActionsRef.current?.focusOnCoords(live.x - 4, live.z, 36);
      }
      return nextState;
    });
  }, []);

  const handleUpdatePlayerPos = useCallback(
    (
      x: number,
      z: number,
      nearestS: Settlement | null,
      nearestL: LordAgent | null,
      camTel: MapCameraTelemetry,
    ) => {
      setNearSettlement((prev) => (prev?.id === nearestS?.id ? prev : nearestS));
      setNearLord((prev) => (prev?.id === nearestL?.id ? prev : nearestL));
      setMapTelemetry((prev) => {
        if (
          prev.focusX === camTel.focusX &&
          prev.focusZ === camTel.focusZ &&
          prev.zoomDist === camTel.zoomDist &&
          prev.yawDeg === camTel.yawDeg &&
          prev.isFollowingPlayer === camTel.isFollowingPlayer &&
          prev.biomeLabel === camTel.biomeLabel &&
          prev.partySpeed === camTel.partySpeed &&
          prev.spottingRange === camTel.spottingRange &&
          prev.followingLordName === camTel.followingLordName &&
          prev.targetSettlementName === camTel.targetSettlementName &&
          prev.onRoad === camTel.onRoad &&
          prev.isMoving === camTel.isMoving
        ) {
          return prev;
        }
        return camTel;
      });
      setCampaign((prev) => {
        if (Math.abs(prev.playerX - x) < 0.05 && Math.abs(prev.playerZ - z) < 0.05) {
          return prev;
        }
        return { ...prev, playerX: x, playerZ: z };
      });
    },
    [],
  );

  const handleRecruit = useCallback(
    (settlementId: string, unitId: UnitTierId, amount: number): string | null => {
      let errorMsg: string | null = null;
      setCampaign((prev) => {
        // Faz 8: parti kapasitesi + ilişki kapısı + ilişki indirimi tek yerde.
        const factionLords = prev.lords.filter(
          (l) => l.faction === prev.settlements.find((s) => s.id === settlementId)?.faction,
        );
        const relation =
          factionLords.length > 0
            ? Math.round(factionLords.reduce((a, l) => a + l.relation, 0) / factionLords.length)
            : 0;
        const res = recruitBatch(prev, settlementId, unitId, amount, relation);
        if (!res.success) {
          errorMsg = res.reason || 'İşlem başarısız.';
          return prev;
        }
        sound.playCoinChime();
        setActiveSettlementModal(
          res.nextState.settlements.find((s) => s.id === settlementId) || null,
        );
        return res.nextState;
      });
      return errorMsg;
    },
    [],
  );

  const handleRecruitBatch = useCallback(
    (
      settlementId: string,
      recruits: Array<{ troopId: string; cost: number; slotKey?: string }>,
    ): string | null => {
      let errorMsg: string | null = null;
      setCampaign((prev) => {
        const targetSettlement = prev.settlements.find((s) => s.id === settlementId);
        const alreadyTaken = new Set(targetSettlement?.recruitedSlotKeys ?? []);
        const validRecruits = recruits.filter((r) => !r.slotKey || !alreadyTaken.has(r.slotKey));

        if (validRecruits.length === 0) {
          errorMsg = 'Bu yerleşimdeki seçili gönüllü slotları zaten toplandı.';
          showToast(errorMsg);
          return prev;
        }

        const totalCost = validRecruits.reduce((s, r) => s + r.cost, 0);
        if (prev.gold < totalCost) {
          errorMsg = 'Yetersiz dinar.';
          return prev;
        }

        const nextStacks = [...(prev.troopStacks ?? [])];
        for (const recruit of validRecruits) {
          const existingIdx = nextStacks.findIndex(
            (st) => st.troopId === recruit.troopId,
          );
          if (existingIdx >= 0) {
            nextStacks[existingIdx] = {
              ...nextStacks[existingIdx],
              count: nextStacks[existingIdx].count + 1,
            };
          } else {
            nextStacks.push({
              troopId: recruit.troopId,
              count: 1,
              wounded: 0,
              xp: 0,
            });
          }
        }

        const newSlotKeys = validRecruits
          .map((r) => r.slotKey)
          .filter((k): k is string => Boolean(k));

        const nextRoster = troopStackTotals(nextStacks);
        const nextArmySize = getTotalTroops(nextRoster);
        const nextStrength = calculatePartyStrength(nextRoster);
        const nextSettlements = prev.settlements.map((s) => {
          if (s.id !== settlementId) return s;
          const mergedKeys = Array.from(new Set([...(s.recruitedSlotKeys ?? []), ...newSlotKeys]));
          const nextPool = { ...s.recruitPool };
          for (let i = 0; i < validRecruits.length; i++) {
            if (nextPool.infantry > 0) nextPool.infantry -= 1;
            else if (nextPool.archer > 0) nextPool.archer -= 1;
            else if (nextPool.cavalry > 0) nextPool.cavalry -= 1;
            else if (nextPool.horseArcher > 0) nextPool.horseArcher -= 1;
          }
          return {
            ...s,
            // Günlük kilit yok (10.7): alınan yuvalar boş kalır, günlük üretimle dolar.
            recruitedSlotKeys: mergedKeys,
            recruitPool: nextPool,
          };
        });
        const updatedSettlement = nextSettlements.find((s) => s.id === settlementId) ?? null;
        if (updatedSettlement) {
          setActiveSettlementModal(updatedSettlement);
        }

        showToast(`${validRecruits.length} yeni asker sancağınıza katıldı! (-${totalCost} Dinar)`);
        sound.playCoinChime();

        return {
          ...prev,
          gold: Math.max(0, prev.gold - totalCost),
          troopStacks: nextStacks,
          roster: nextRoster,
          armySize: nextArmySize,
          strength: nextStrength,
          settlements: nextSettlements,
        };
      });
      return errorMsg;
    },
    [],
  );

  const handleBuyFood = useCallback(
    (settlementId: string, packs: number): string | null => {
      let errorMsg: string | null = null;
      setCampaign((prev) => {
        const res = buyFoodAtSettlement(prev, settlementId, packs);
        if (!res.success) {
          errorMsg = res.reason || 'Erzak alınamadı.';
          return prev;
        }
        sound.playCoinChime();
        setActiveSettlementModal(
          res.nextState.settlements.find((s) => s.id === settlementId) || null,
        );
        return res.nextState;
      });
      return errorMsg;
    },
    [],
  );

  const handleHireMercenaries = useCallback((settlementId: string): string | null => {
    let err: string | null = null;
    setCampaign((prev) => {
      const res = hireMercenariesAtTavern(prev, settlementId);
      if (!res.success) {
        err = res.reason || 'Paralı asker kiralanamadı.';
        return prev;
      }
      sound.playCoinChime();
      return res.nextState;
    });
    return err;
  }, []);

  const handleRansomPrisoners = useCallback((settlementId: string): string | null => {
    let err: string | null = null;
    setCampaign((prev) => {
      const res = ransomPrisonersAtTavern(prev, settlementId);
      if (!res.success) {
        err = res.reason || 'Esir teslim edilemedi.';
        return prev;
      }
      sound.playCoinChime();
      return res.nextState;
    });
    return err;
  }, []);

  const handleBuyTavernRound = useCallback((_settlementId: string): string | null => {
    let err: string | null = null;
    setCampaign((prev) => {
      const res = buyTavernRound(prev);
      if (!res.success) {
        err = res.reason || 'İçki ısmarlanamadı.';
        return prev;
      }
      sound.playCoinChime();
      return res.nextState;
    });
    return err;
  }, []);

  const handleArenaPractice = useCallback((settlementId: string): string | null => {
    setCampaign((prev) => {
      const res = participateInArenaPractice(prev, settlementId);
      return res.nextState;
    });
    return null;
  }, []);

  const handleArenaTournament = useCallback(
    (settlementId: string): { victory: boolean; message: string } => {
      let outcome = { victory: false, message: '' };
      setCampaign((prev) => {
        const res = joinArenaTournament(prev, settlementId);
        if (res.victory) {
          outcome = {
            victory: true,
            message: `3 tur boyunca tüm rakipleri dize getirerek turnuva şampiyonu oldunuz! Kazanılan ödül: +${res.goldEarned} Dinar, +${res.renownEarned} Nam ve ${res.prizeName}!`,
          };
        } else {
          outcome = {
            victory: false,
            message:
              'Turnuvanın çekişmeli yarı finalinde elendiniz.',
          };
        }
        return res.nextState;
      });
      return outcome;
    },
    [],
  );

  const handleSellLoot = useCallback(
    (settlementId: string): string | null => {
      const res = sellSurplusLootAtMarket(campaign, settlementId);
      if (!res.success) return res.reason ?? 'Satış yapılamadı.';
      setCampaign(res.nextState);
      sound.playCoinChime();
      showToast(`Ganimet satıldı: +${res.goldGained} Dinar`);
      return null;
    },
    [campaign, showToast],
  );

  const handleManageGarrison = useCallback(
    (
      settlementId: string,
      unitId: UnitTierId,
      direction: 'deposit' | 'withdraw',
      amount: number,
    ): string | null => {
      let err: string | null = null;
      setCampaign((prev) => {
        const res = manageGarrisonTransfer(prev, settlementId, unitId, direction, amount);
        if (!res.success) {
          err = res.reason || 'İşlem gerçekleştirilemedi.';
          return prev;
        }
        sound.playCoinChime();
        setActiveSettlementModal(
          res.nextState.settlements.find((s) => s.id === settlementId) || null,
        );
        return res.nextState;
      });
      return err;
    },
    [],
  );

  const handleRestAndRecover = useCallback((settlementId: string): string | null => {
    setCampaign((prev) => {
      const res = restAndRecoverAtSettlement(prev, settlementId);
      const tick = advanceWorldDay(res.nextState, {
        lordPositions: lordPositionsRef.current,
        clans: macroStateRef.current?.clans,
        playerPos: { x: res.nextState.playerX, z: res.nextState.playerZ },
      });
      const next = {
        ...tick.state,
        playerHp: res.nextState.playerHp,
        settlements: refreshRecruitPools(tick.state.settlements, tick.state.day),
      };
      setActiveSettlementModal(
        next.settlements.find((s) => s.id === settlementId) || null,
      );
      return next;
    });
    return null;
  }, []);

  const handleRaidVillage = useCallback((villageId: string): string | null => {
    let err: string | null = null;
    setCampaign((prev) => {
      const res = raidAndPillageVillage(prev, villageId);
      if (!res.success) {
        err = res.reason || 'Köy yağmalanamadı.';
        return prev;
      }
      setActiveSettlementModal(
        res.nextState.settlements.find((s) => s.id === villageId) || null,
      );
      return res.nextState;
    });
    return err;
  }, []);

  const handleForceSupplies = useCallback((villageId: string): string | null => {
    let err: string | null = null;
    setCampaign((prev) => {
      const res = forcePeasantsSupplies(prev, villageId);
      if (!res.success) {
        err = res.reason || 'Erzak temin edilemedi.';
        return prev;
      }
      setActiveSettlementModal(
        res.nextState.settlements.find((s) => s.id === villageId) || null,
      );
      return res.nextState;
    });
    return err;
  }, []);

  const handleForceRecruits = useCallback((villageId: string): string | null => {
    let err: string | null = null;
    setCampaign((prev) => {
      const res = forcePeasantsRecruits(prev, villageId);
      if (!res.success) {
        err = res.reason || 'Asker devşirilemedi.';
        return prev;
      }
      setActiveSettlementModal(
        res.nextState.settlements.find((s) => s.id === villageId) || null,
      );
      return res.nextState;
    });
    return err;
  }, []);

  const handleApplyDiplomacyResult = useCallback(
    (
      lordId: string,
      relationDelta: number,
      politicalAction: string,
      goldDelta: number,
      renownDelta: number,
      chronicleEntry: string,
    ) => {
      sound.playCoinChime();
      setCampaign((prev) => {
        const updatedLords = prev.lords.map((l) => {
          if (l.id !== lordId) return l;
          const nextRel = Math.max(-100, Math.min(100, l.relation + relationDelta));
          const isPeace = politicalAction === 'PEACE' || politicalAction === 'ALLIANCE';
          const isWar = politicalAction === 'WAR';
          return {
            ...l,
            relation: nextRel,
            isAtWarWithPlayer: isWar ? true : isPeace ? false : l.isAtWarWithPlayer,
            isAlliedWithPlayer:
              politicalAction === 'ALLIANCE' ? true : isWar ? false : l.isAlliedWithPlayer,
          };
        });

        const updatedLord = updatedLords.find((l) => l.id === lordId) || null;
        setActiveDiplomacyLord(updatedLord);

        return {
          ...prev,
          gold: Math.max(0, prev.gold + goldDelta),
          renown: prev.renown + renownDelta,
          lords: updatedLords,
          chronicle: [
            {
              id: `dip-${Date.now()}`,
              day: prev.day,
              category: 'DIPLOMACY' as const,
              text: chronicleEntry,
            },
            ...prev.chronicle,
          ].slice(0, 20),
        };
      });
    },
    [],
  );

  const handleStartFieldBattle = useCallback((lord: LordAgent) => {
    setActiveDiplomacyLord(null);
    setActiveSiegeSettlementId(null);
    setActiveSettlementModal(null);
    setBattleTargetLordId(lord.id);
    setBattleTargetSettlementId(null);
    const stages = campaignBattlePoolRef.current.prewarmMemoryPages();
    setBattlePrewarmStages(stages);
    setSubMode('battle');
  }, []);

  const handleStartSiegeBattle = useCallback((settlement: Settlement) => {
    setActiveSiegeSettlementId(null);
    setActiveSettlementModal(null);
    setActiveDiplomacyLord(null);
    setBattleTargetSettlementId(settlement.id);
    setBattleTargetLordId(null);
    const stages = campaignBattlePoolRef.current.prewarmMemoryPages();
    setBattlePrewarmStages(stages);
    setSubMode('battle');
  }, []);

  const handleStartQuickBattle = useCallback(() => {
    setActiveSettlementModal(null);
    setActiveDiplomacyLord(null);
    setBattleTargetLordId('lord-kargi');
    setBattleTargetSettlementId(null);
    const stages = campaignBattlePoolRef.current.prewarmMemoryPages();
    setBattlePrewarmStages(stages);
    setSubMode('battle');
  }, []);

  const handleBattleComplete = useCallback(
    (
      victory: boolean,
      losses: Partial<TroopRoster>,
      enemiesDefeated: number,
    ) => {
      if (victory) {
        const pending = prepareBattleLoot(campaign, {
          enemyLordId: battleTargetLordId,
          enemiesDefeated,
          losses,
          conqueredSettlementId: battleTargetSettlementId,
          isSiege: Boolean(battleTargetSettlementId),
        });
        setPendingBattleLoot(pending);
        setSubMode('overworld');
      } else {
        setCampaign((prev) => {
          const enemyLord =
            (battleTargetLordId
              ? prev.lords.find((l) => l.id === battleTargetLordId)
              : null) ??
            prev.lords.find((l) => l.isAtWarWithPlayer || l.faction === 'bandits') ??
            null;
          if (enemyLord) {
            return triggerPlayerCapturedSequence(prev, enemyLord, losses, enemiesDefeated);
          }
          const next = resolveBattleOutcome(
            prev,
            false,
            battleTargetLordId,
            losses,
            enemiesDefeated,
            battleTargetSettlementId,
          );
          return next;
        });
        setSubMode('overworld');
        setGameState('playing');
        setCampaignTimeScale(4);
        showToast('Savaş kaybedildi! Düşman birliği tarafından esir alındınız.');
      }
    },
    [battleTargetLordId, battleTargetSettlementId, campaign, showToast],
  );

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#0d0c0a] select-none"
      data-testid="app-root"
      data-e2e-enabled={e2eRequest.enabled ? 'true' : 'false'}
      data-e2e-scenario={e2eRequest.enabled ? e2eRequest.scenario : undefined}
    >
      {/* Persistent 3D WebGL Continental Map Canvas (sefer haritası): savaş
          sırasında da takılı kalır (isRenderPaused ile donar) — sökülüp yeniden
          kurulması saniyeler süren kasılmaya yol açıyordu. */}
      <WorldCanvas
        gameState={gameState}
        subMode={subMode}
        campaignTimeScale={campaignTimeScale}
        campaign={campaign}
        cameraActionsRef={cameraActionsRef}
        lordPositionsRef={lordPositionsRef}
        lordPositionCommandsRef={lordPositionCommandsRef}
        playerPositionCommandRef={playerPositionCommandRef}
        activeDiplomacyLordId={activeDiplomacyLord?.id ?? null}
        activeDialogueLordId={dialogueLord?.id ?? null}
        activeSettlementModalId={activeSettlementModal?.id ?? null}
        isWaitingInSettlement={isWaitingInSettlement}
        isRenderPaused={
          subMode === 'battle' ||
          Boolean(loadingScreen?.active) ||
          isCharacterCreatorOpen ||
          isTitleLoadOpen ||
          isSettingsModalOpen ||
          isInventoryModalOpen ||
          isMarketModalOpen ||
          isPartyModalOpen ||
          isCharacterModalOpen ||
          isEncyclopediaOpen ||
          isKingdomModalOpen ||
          gameState === 'paused'
        }
        onSetTimeScale={setMapTimeScale}
        onUpdatePlayerPos={handleUpdatePlayerPos}
        onOpenSettlement={handleOpenSettlement}
        onOpenDiplomacy={(l) => {
          const info = classifyEncounterScenario(l, campaign);
          setDialogueLord(l);
          setIsForcedEncounter(info.forced);
          setEncounterScenario(info.scenario);
        }}
        onHostileEncounter={(l, scenario) => {
          sound.playSettlementEnter();
          setDialogueLord(l);
          setIsForcedEncounter(true);
          setEncounterScenario(scenario);
          showToast(
            l.faction === 'bandits'
              ? `${l.name} yolunuzu kesti!`
              : `${l.title} ${l.name} sancağınızı kıstırdı!`,
          );
        }}
      />

      {/* 10.2/B1: meydan savaşı ayrı misyon sahnesinde (arazi profili sefer
          haritasındaki karşılaşma noktasından kurulur) */}
      {subMode === 'battle' && (gameState === 'playing' || gameState === 'paused') && (
        <BattlefieldView
          paused={gameState === 'paused'}
          campaign={campaign}
          targetLord={
            battleTargetLordId
              ? (campaign.lords.find((l) => l.id === battleTargetLordId) ?? null)
              : null
          }
          targetSettlement={
            battleTargetSettlementId
              ? (campaign.settlements.find((s) => s.id === battleTargetSettlementId) ?? null)
              : null
          }
          onBattleTelemetry={setBattleTelemetry}
          onBattleComplete={handleBattleComplete}
        />
      )}

      {/* 1. BANNERLORD MAIN MENU OVERLAY */}
      {gameState === 'title' && (
        <div
          className="fixed inset-0 z-30 flex flex-col justify-between p-10 sm:p-14 pointer-events-auto"
          style={{
            background:
              'linear-gradient(90deg, rgba(10,9,7,0.95) 0%, rgba(12,10,8,0.82) 42%, rgba(10,9,7,0.18) 100%)',
          }}
        >
          <div className="max-w-md my-auto">
            <div className="mb-5">
              <svg
                viewBox="0 0 420 115"
                className="w-full max-w-[390px] h-auto"
                role="img"
                aria-label="Sancak-ı Kalradya: Taht ve Kılıç"
              >
                <defs>
                  <linearGradient id="crestGold" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#fde68a" />
                    <stop offset="50%" stopColor="#c6a15b" />
                    <stop offset="100%" stopColor="#785826" />
                  </linearGradient>
                </defs>
                <g transform="translate(8, 10)">
                  <path
                    d="M36 4L8 16v26c0 24 12 42 28 48 16-6 28-24 28-48V16L36 4z"
                    fill="#14110c"
                    stroke="url(#crestGold)"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M22 24l28 36M50 24L22 60"
                    stroke="#f3ead8"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <polygon points="36,14 41,28 36,24 31,28" fill="url(#crestGold)" />
                </g>

                <text
                  x="86"
                  y="46"
                  fill="#f8f0df"
                  fontFamily="Cinzel, Georgia, serif"
                  fontWeight="700"
                  fontSize="27"
                  letterSpacing="2"
                >
                  SANCAK-I KALRADYA
                </text>
                <line
                  x1="86"
                  y1="58"
                  x2="395"
                  y2="58"
                  stroke="url(#crestGold)"
                  strokeWidth="1.5"
                />
                <text
                  x="86"
                  y="82"
                  fill="#c6a15b"
                  fontFamily="Cinzel, Georgia, serif"
                  fontWeight="600"
                  fontSize="15"
                  letterSpacing="4.5"
                >
                  TAHT VE KILIÇ
                </text>
              </svg>
            </div>

            <p className="text-xs sm:text-sm text-[#cfc3ad] leading-relaxed mb-6">
              İmparatorluk iç savaşının gölgesinde kalan Kalradya kıtasında sancağınızı dikin,
              ailenizin mirasını koruyun, ordular kurup kaleler kuşatın ve tahtın kaderini
              belirleyin.
            </p>

            {/* Bannerlord Vertical Main Menu Stack */}
            <nav
              aria-label="Ana Menü"
              className="flex flex-col gap-2.5 border-l-2 border-[#c6a15b]/45 pl-4"
            >
              {saveInfo && (
                <button
                  type="button"
                  data-testid="title-continue-campaign"
                  onClick={() => {
                    sound.playUiClick();
                    runWithLoadingScreen(
                      'SEFER YÜKLENİYOR',
                      `${saveInfo.playerName} · Gün ${saveInfo.day}`,
                      () => continueGame(),
                    );
                  }}
                  className="group w-full px-5 py-3 rounded-xs text-left bg-[#1b1610]/95 hover:bg-[#2a2117] border border-[#c6a15b]/60 hover:border-[#fde68a] transition-colors flex items-center justify-between shadow-lg"
                >
                  <div>
                    <div className="font-display font-bold text-sm tracking-wider text-[#fde68a] group-hover:text-white">
                      SEFERE DEVAM ET (CONTINUE CAMPAIGN)
                    </div>
                    <div className="text-[11px] text-[#b5a890] mt-0.5">
                      {saveInfo.playerName} · Gün {saveInfo.day} · {saveInfo.gold} Dinar
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[#c6a15b]">[ENTER]</span>
                </button>
              )}

              <button
                type="button"
                data-start="true"
                data-testid="title-start-campaign"
                onClick={() => {
                  sound.playUiClick();
                  setIsNewGameCreatorFlow(true);
                  setIsCharacterCreatorOpen(true);
                }}
                className="group w-full px-5 py-3.5 rounded-xs text-left bg-[#231a11]/95 hover:bg-[#332517] border border-[#c6a15b]/65 hover:border-[#fde68a] transition-colors flex items-center justify-between shadow-lg"
              >
                <span className="font-display font-bold text-sm tracking-wider text-[#f8f0df] group-hover:text-[#fde68a]">
                  {saveInfo ? 'YENİ SEFER BAŞLAT (NEW CAMPAIGN)' : 'SEFERİ BAŞLAT (NEW CAMPAIGN)'}
                </span>
                <span className="text-[10px] font-mono text-[#c6a15b]">Hikâye &amp; Soy</span>
              </button>

              <button
                type="button"
                data-testid="title-load-saves-btn"
                onClick={() => {
                  sound.playUiClick();
                  setIsTitleLoadOpen(true);
                }}
                className="group w-full px-5 py-3 rounded-xs text-left bg-[#16120d]/95 hover:bg-[#241d15] border border-[#c6a15b]/35 hover:border-[#c6a15b]/80 transition-colors flex items-center justify-between shadow"
              >
                <span className="font-display font-semibold text-sm tracking-wider text-[#e2d6c1] group-hover:text-[#fde68a]">
                  KAYITLI OYUNLAR (SAVED GAMES)
                </span>
                <span className="text-[10px] font-mono text-[#9c8e78]">Kayıt Yöneticisi</span>
              </button>

              <button
                type="button"
                data-testid="title-settings-btn"
                onClick={() => {
                  sound.playUiClick();
                  setIsSettingsModalOpen(true);
                }}
                className="group w-full px-5 py-3 rounded-xs text-left bg-[#16120d]/95 hover:bg-[#241d15] border border-[#c6a15b]/35 hover:border-[#c6a15b]/80 transition-colors flex items-center justify-between shadow"
              >
                <span className="font-display font-semibold text-sm tracking-wider text-[#e2d6c1] group-hover:text-[#fde68a]">
                  AYARLAR (OPTIONS)
                </span>
                <span className="text-[10px] font-mono text-[#9c8e78]">Ses · Grafik · Oynanış</span>
              </button>

              <button
                type="button"
                data-testid="title-encyclopedia-btn"
                onClick={() => {
                  sound.playUiClick();
                  setIsEncyclopediaOpen(true);
                }}
                className="group w-full px-5 py-3 rounded-xs text-left bg-[#16120d]/95 hover:bg-[#241d15] border border-[#c6a15b]/35 hover:border-[#c6a15b]/80 transition-colors flex items-center justify-between shadow"
              >
                <span className="font-display font-semibold text-sm tracking-wider text-[#e2d6c1] group-hover:text-[#fde68a]">
                  KALRADYA ANSİKLOPEDİSİ (ENCYCLOPEDIA)
                </span>
                <span className="text-[10px] font-mono text-[#9c8e78]">6 Krallık · 211 Yerleşim</span>
              </button>
            </nav>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#a89b84] tracking-wide border-t border-[#c6a15b]/20 pt-3">
            <span>
              WASD Harita Kamerası · Q/E Kamera Döndür · Tekerlek Yakınlaştır · Sol Tık Yürüt · Space Duraklat
            </span>
            <span className="font-mono text-[11px] text-[#c6a15b]">Sürüm 1.4 · Bannerlord Kurgusu</span>
          </div>
        </div>
      )}

      {/* 2. PLAYING HUD (Diyalog ekranı açıkken gizlenir — harita etiketleri diyaloğa karışmaz) */}
      {gameState === 'playing' && !dialogueLord && !dialogueSettlement && (
        <GameHud
          subMode={subMode}
          campaignTimeScale={campaignTimeScale}
          campaign={campaign}
          nearSettlement={nearSettlement}
          nearLord={nearLord}
          mapTelemetry={mapTelemetry}
          cameraActionsRef={cameraActionsRef}
          battleTelemetry={battleTelemetry}
          muted={muted}
          onSetTimeScale={setMapTimeScale}
          onToggleMute={() => {
            const next = sound.toggleMute();
            setMuted(next);
          }}
          onPause={() => setGameState('paused')}
          onRestart={startGame}
          onOpenSettlement={handleOpenSettlement}
          onOpenDiplomacy={(l) => {
            setActiveDiplomacyLord(l);
          }}
          onOpenEncyclopedia={() => {
            setIsEncyclopediaOpen(true);
          }}
          onStartQuickBattle={handleStartQuickBattle}
          onAdvanceDay={() => {
            sound.playCoinChime();
            setCampaign((prev) => advanceDailyEconomyAndWorld(prev));
          }}
          onAllocateAttribute={(attrId) => {
            const res = allocateAttributePoint(campaign, attrId);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onAllocateFocus={(skillId) => {
            const res = allocateFocusPoint(campaign, skillId);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onOpenInventoryModal={() => {
            // Pazar kendi bekleyen-transfer ekranıyken saha envanteri onun
            // üstüne ikinci bir taslak açmaz; diğer durumlarda I aç/kapatır.
            if (!isMarketModalOpen) setIsInventoryModalOpen((prev) => !prev);
          }}
          onOpenPartyModal={() => {
            setIsPartyModalOpen((prev) => !prev);
          }}
          onOpenCharacterModal={() => {
            setIsCharacterModalOpen((prev) => !prev);
          }}
          onRecruitPrisoners={() => {
            const res = recruitCapturedPrisoners(campaign, 1);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onOpenMarketModal={() => setIsMarketModalOpen(true)}
          onTalkToLord={(l) => {
            const info = classifyEncounterScenario(l, campaign);
            setDialogueLord(l);
            setIsForcedEncounter(info.forced);
            setEncounterScenario(info.scenario);
          }}
          // Bannerlord: pazaryeri yalnız **yerleşim menüsünden** açılır (haritada yakınlık yetmez).
          canTrade={!!activeSettlementModal}
          onOpenCharacterArena={() => setViewMode('character_arena')}
          onOpenKingdomModal={() => setIsKingdomModalOpen(true)}
          onOpenCharacterCreator={() => setIsCharacterCreatorOpen(true)}
          onOpenArmyModal={() => setIsArmyModalOpen(true)}
        />
      )}

      {gameState === 'playing' &&
        activeSiegeSettlementId &&
        (() => {
          const siegeView = buildSiegeEncounterView(campaign, activeSiegeSettlementId);
          if (!siegeView) return null;
          const liveSettlement =
            campaign.settlements.find((s) => s.id === activeSiegeSettlementId) ?? siegeView.settlement;
          return (
            <SiegeEncounterModal
              view={siegeView}
              campaign={campaign}
              onClose={() => setActiveSiegeSettlementId(null)}
              onOpenSiegeCamp={() => {
                setCampaign((prev) => {
                  const next = startPlayerSiege(prev, liveSettlement.id);
                  playerPositionCommandRef.current = { x: next.playerX, z: next.playerZ };
                  return next;
                });
                setSettlementModalInitialTab('siege');
                setActiveSiegeSettlementId(null);
                setActiveSettlementModal(liveSettlement);
              }}
              onAssaultBreach={() => handleStartSiegeBattle(liveSettlement)}
              onAssaultRam={() => handleStartSiegeBattle(liveSettlement)}
              onLiftSiege={() => {
                setCampaign((prev) => liftPlayerSiege(prev, liveSettlement.id));
                setActiveSiegeSettlementId(null);
              }}
              onAttackBesiegers={(lord) => {
                setBattleSiegeSettlementContextId(liveSettlement.id);
                setActiveSiegeSettlementId(null);
                handleStartFieldBattle(lord);
              }}
              onBreakIn={() => {
                setCampaign((prev) =>
                  enterBesiegedSettlement(applyBreakInCasualties(prev), liveSettlement.id),
                );
              }}
              onObserve={() => setActiveSiegeSettlementId(null)}
              onDefendWalls={() => handleStartSiegeBattle(liveSettlement)}
              onSallyOut={(lord) => {
                if (lord) {
                  setBattleSiegeSettlementContextId(liveSettlement.id);
                  setActiveSiegeSettlementId(null);
                  handleStartFieldBattle(lord);
                } else {
                  handleStartSiegeBattle(liveSettlement);
                }
              }}
              onTalkSurrender={() => {
                setCampaign((prev) => ({
                  ...prev,
                  chronicle: [
                    {
                      id: `siege-surrender-talk-${prev.day}-${liveSettlement.id}`,
                      day: prev.day,
                      category: 'DIPLOMACY' as const,
                      text: `${liveSettlement.name} teslim şartları konuşuldu; kuşatma sürüyor.`,
                    },
                    ...prev.chronicle,
                  ].slice(0, 20),
                }));
                setActiveSiegeSettlementId(null);
              }}
            />
          );
        })()}

      {/* 3. SETTLEMENT & RECRUITMENT MODAL */}
      {gameState === 'playing' && activeSettlementModal && (
        <SettlementModal
          key={`${activeSettlementModal.id}-${settlementModalInitialTab}`}
          initialTab={settlementModalInitialTab}
          settlement={
            campaign.settlements.find((s) => s.id === activeSettlementModal.id) ??
            activeSettlementModal
          }
          campaign={campaign}
          isWaiting={isWaitingInSettlement}
          onToggleWaiting={(w) => {
            setIsWaitingInSettlement(w);
            if (w) setCampaignTimeScale(4);
            else setCampaignTimeScale(1);
          }}
          campaignTimeScale={campaignTimeScale}
          onSetCampaignTimeScale={(scale) => setCampaignTimeScale(scale as TimeScale)}
          onClose={() => {
            setActiveSettlementModal(null);
            setIsWaitingInSettlement(false);
          }}
          onUpdateCampaign={(next) => setCampaign(next)}
          onOpenFullMarket={() => setIsMarketModalOpen(true)}
          onTalkToReeve={() => {
            setDialogueSettlement(activeSettlementModal);
          }}
          onOpenCharacterArena={() => setViewMode('character_arena')}
          onBeginSiege={(targetSettlement) => {
            setCampaign((prev) => {
              const next = startPlayerSiege(prev, targetSettlement.id);
              playerPositionCommandRef.current = { x: next.playerX, z: next.playerZ };
              return next;
            });
            setActiveSettlementModal(null);
            setActiveSiegeSettlementId(targetSettlement.id);
            showToast(
              `${targetSettlement.name} kuşatma altına alındı! Krallık ile savaş başladı.`,
            );
          }}
          onRecruit={handleRecruit}
          onRecruitBatch={handleRecruitBatch}
          onBuyFood={handleBuyFood}
          onStartSiegeBattle={handleStartSiegeBattle}
          onHireMercenaries={handleHireMercenaries}
          onRansomPrisoners={handleRansomPrisoners}
          onBuyTavernRound={handleBuyTavernRound}
          onArenaPractice={handleArenaPractice}
          onArenaTournament={handleArenaTournament}
          onSellLoot={handleSellLoot}
          onManageGarrison={handleManageGarrison}
          onRestAndRecover={handleRestAndRecover}
          onRaidVillage={handleRaidVillage}
          onForceSupplies={handleForceSupplies}
          onForceRecruits={handleForceRecruits}
          onUpgradeBuilding={(settlementId, buildingId) => {
            const res = upgradeSettlementBuilding(campaign, settlementId, buildingId);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onSetDailyDefault={(settlementId, defaultType) => {
            const res = setSettlementDailyDefault(campaign, settlementId, defaultType);
            if (res.success) setCampaign(res.nextState);
            return null;
          }}
          onBuyWorkshop={(settlementId, workshopType) => {
            const res = buyOrChangeWorkshop(campaign, settlementId, workshopType);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onForgeWeapon={(settlementId, blueprintId) => {
            const res = forgeCustomWeaponAtSmithy(campaign, settlementId, blueprintId);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onBuildSiegeEngine={(settlementId, engineType, moveToReserve) => {
            const res = constructSiegeEngine(
              campaign,
              settlementId,
              engineType,
              Boolean(moveToReserve),
            );
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onDeployReserveEngines={(settlementId) => {
            const res = deployReservedSiegeEngines(campaign, settlementId);
            if (res.success) setCampaign(res.nextState);
            return null;
          }}
          onBombardWalls={(settlementId, target) => {
            const res = bombardSettlementWalls(campaign, settlementId, target);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
          onResolveNotableQuest={(settlementId, notableId, goldGain, renownGain, relationGain, summaryText) => {
            sound.playCoinChime();
            setCampaign((prev) => {
              const nextSettlements = prev.settlements.map((s) => {
                if (s.id !== settlementId) return s;
                const nextNotables = (s.notables ?? []).map((n) =>
                  n.id === notableId
                    ? { ...n, relation: Math.min(100, n.relation + relationGain) }
                    : n,
                );
                return { ...s, notables: nextNotables };
              });
              const updatedSettlement = nextSettlements.find((s) => s.id === settlementId) ?? null;
              if (updatedSettlement) setActiveSettlementModal(updatedSettlement);
              return {
                ...prev,
                gold: prev.gold + goldGain,
                renown: prev.renown + renownGain,
                settlements: nextSettlements,
                chronicle: [
                  {
                    id: `notable-quest-${prev.day}-${notableId}-${Date.now()}`,
                    day: prev.day,
                    category: 'ECONOMY' as const,
                    text: summaryText,
                  },
                  ...prev.chronicle,
                ].slice(0, 25),
              };
            });
            showToast(summaryText);
          }}
        />
      )}

      {/* 4. GEMINI LORD DIPLOMACY MODAL */}
      {gameState === 'playing' && activeDiplomacyLord && (
        <DiplomacyModal
          selectedLord={
            campaign.lords.find((l) => l.id === activeDiplomacyLord.id) ?? activeDiplomacyLord
          }
          campaign={campaign}
          onClose={() => setActiveDiplomacyLord(null)}
          onSelectLord={(l) => setActiveDiplomacyLord(l)}
          onApplyDiplomacyResult={handleApplyDiplomacyResult}
          onStartFieldBattle={handleStartFieldBattle}
          onPersuadeStep={(lordId, argumentType) => {
            const res = attemptLordPersuasionStep(campaign, lordId, argumentType);
            if (res.success) setCampaign(res.nextState);
            return {
              replyText: res.replyText,
              totalPips: res.totalPips,
              convinced: res.convinced,
            };
          }}
          onBarterOffer={(lordId, goldOffered, prisonersOffered) => {
            const res = executeLordBarterOffer(campaign, lordId, goldOffered, prisonersOffered);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
          }}
        />
      )}

      {/* 5. PAUSE MODAL (BANNERLORD AUTHENTIC ESC MENÜSÜ) */}
      {gameState === 'paused' && (
        <BannerlordPauseModal
          campaign={campaign}
          saveInput={{
            campaign,
            macroState,
            metHeroIds,
            backgroundChoice,
          }}
          onResume={() => setGameState('playing')}
          onLoadSave={(loadedData) => {
            handleLoadSaveData(loadedData);
            showToast(`Kayıt yüklendi · ${loadedData.campaign.playerName} (Gün ${loadedData.campaign.day})`);
          }}
          onExitToTitle={() => {
            setGameState('title');
          }}
          onShowToast={showToast}
        />
      )}

      {/* 5B. TITLE SCREEN LOAD GAME MODAL */}
      {isTitleLoadOpen && (
        <BannerlordPauseModal
          campaign={campaign}
          saveInput={{
            campaign,
            macroState,
            metHeroIds,
            backgroundChoice,
          }}
          initialView="load"
          onResume={() => setIsTitleLoadOpen(false)}
          onLoadSave={(loadedData) => {
            setIsTitleLoadOpen(false);
            handleLoadSaveData(loadedData);
            showToast(`Kayıt yüklendi · ${loadedData.campaign.playerName} (Gün ${loadedData.campaign.day})`);
          }}
          onExitToTitle={() => setIsTitleLoadOpen(false)}
          onShowToast={showToast}
        />
      )}

      {/* 6. VICTORY / DEFEAT OUTCOME MODAL */}
      {gameState === 'gameover' && outcomeSnapshot && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(8, 7, 5, 0.85)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="outcome-modal-title"
        >
          <div className="hud-panel rounded-lg p-6 w-full max-w-lg text-center">
            <div className="text-xs font-semibold tracking-wider text-[#c6a15b] uppercase">
              {outcomeSnapshot.victory ? 'Sancak Zaferi' : 'Muharebe Sonucu'}
            </div>
            <h2
              id="outcome-modal-title"
              className={`text-2xl font-display font-bold mt-1 ${
                outcomeSnapshot.victory ? 'text-[#fbbf24]' : 'text-[#f87171]'
              }`}
            >
              {outcomeSnapshot.title}
            </h2>
            <p className="text-xs text-[#d1c5b0] mt-1">{outcomeSnapshot.subtitle}</p>

            <div className="grid grid-cols-3 gap-3 my-5 p-3.5 rounded bg-[#16130e] border border-[#c6a15b]/25 font-mono-tabular">
              <div>
                <span className="text-[11px] text-[#a89b84] block">Düşman Kaybı</span>
                <span className="text-lg font-bold text-[#f8f0df]">
                  {outcomeSnapshot.enemiesDefeated}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#a89b84] block">Toplam Nam</span>
                <span className="text-lg font-bold text-[#34d399]">
                  {outcomeSnapshot.renown}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#a89b84] block">Hazine (Dinar)</span>
                <span className="text-lg font-bold text-[#fbbf24]">
                  {outcomeSnapshot.gold}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  setOutcomeSnapshot(null);
                  setGameState('playing');
                }}
                className="px-5 py-2.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors whitespace-nowrap"
              >
                Haritaya Dön ve Sefere Devam Et
              </button>
              <button
                type="button"
                onClick={() => {
                  setOutcomeSnapshot(null);
                  setIsNewGameCreatorFlow(true);
                  setIsCharacterCreatorOpen(true);
                }}
                className="px-4 py-2.5 rounded text-xs font-semibold bg-[#241f18] hover:bg-[#332c22] text-[#e2d6c1] border border-[#c6a15b]/30 transition-colors whitespace-nowrap"
              >
                Yeni Sefer Başlat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. FULL-SCREEN BANNERLORD MARKETPLACE & INVENTORY MODAL */}
      {/* FAZ 1: BANNERLORD ANSİKLOPEDİSİ (N) */}
      {isEncyclopediaOpen && (
        <EncyclopediaModal
          campaign={{
            ...campaign,
            lords: campaign.lords.map((l) => {
              const livePos = lordPositionsRef.current.get(l.id);
              return livePos ? { ...l, x: livePos.x, z: livePos.z } : l;
            }),
          }}
          revealedHeroIds={metHeroIds}
          onMeetHero={(heroId) =>
            setMetHeroIds((prev) => (prev.includes(heroId) ? prev : [...prev, heroId]))
          }
          onClose={() => setIsEncyclopediaOpen(false)}
        />
      )}

      {(dialogueLord || dialogueSettlement) && (
        <DialogueModal
          campaign={campaign}
          lord={dialogueLord}
          settlement={dialogueSettlement}
          canTrade={!!dialogueSettlement}
          forcedEncounter={isForcedEncounter}
          encounterScenario={encounterScenario}
          hasMet={dialogueLord ? metHeroIds.includes(dialogueLord.id) : true}
          onClose={() => {
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
          }}
          onMeetHero={(heroId) =>
            setMetHeroIds((prev) => (prev.includes(heroId) ? prev : [...prev, heroId]))
          }
          onAcceptQuest={(questId) => {
            showToast('Soylu görevi kabul edildi ve Sefer Günlüğüne [J] kaydedildi.');
            setCampaign((prev) => ({
              ...prev,
              chronicle: [
                {
                  id: `noble-quest-${prev.day}-${questId}`,
                  day: prev.day,
                  category: 'DIPLOMACY',
                  text: `${dialogueLord?.name ?? dialogueSettlement?.name ?? 'Soylu'} tarafından verilen görev üstlenildi.`,
                },
                ...prev.chronicle,
              ].slice(0, 20),
            }));
          }}
          onCompleteBarter={({ lordId, goldDelta, relationDelta, peaceSigned }) => {
            setCampaign((prev) => ({
              ...prev,
              gold: Math.max(0, prev.gold + goldDelta),
              lords: prev.lords.map((l) =>
                l.id === lordId
                  ? {
                      ...l,
                      relation: Math.max(-100, Math.min(100, l.relation + relationDelta)),
                      isAtWarWithPlayer: peaceSigned ? false : l.isAtWarWithPlayer,
                    }
                  : l,
              ),
            }));
          }}
          onRelationChange={(lordId, delta) =>
            setCampaign((prev) => ({
              ...prev,
              lords: prev.lords.map((l) =>
                l.id === lordId
                  ? { ...l, relation: Math.max(-100, Math.min(100, l.relation + delta)) }
                  : l,
              ),
            }))
          }
          onOpenTrade={() => setIsMarketModalOpen(true)}
          onStartFieldBattle={(l) => {
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
            handleStartFieldBattle(l);
          }}
          onAutoResolveBattle={(l) => {
            const sim = simulateSendTroopsBattle(campaign, l);
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
            setBattleTargetLordId(l.id);
            setBattleTargetSettlementId(null);
            if (sim.victory) {
              const pending = prepareBattleLoot(campaign, {
                enemyLordId: l.id,
                enemiesDefeated: sim.enemiesDefeated,
                losses: sim.losses,
                conqueredSettlementId: null,
                isSiege: false,
              });
              setPendingBattleLoot(pending);
            } else {
              setCampaign((prev) =>
                triggerPlayerCapturedSequence(prev, l, sim.losses, sim.enemiesDefeated),
              );
              setGameState('playing');
              setCampaignTimeScale(4);
              showToast(
                `Muharebe kaybedildi! ${l.title} ${l.name} sancağınızı dağıttı ve sizi zincire vurdu!`,
              );
            }
          }}
          onSacrificeEscape={(l) => {
            const res = applySacrificeEscape(campaign, l);
            const angle = Math.random() * Math.PI * 2;
            const pushDist = 28;
            const pushedX = Math.max(-500, Math.min(500, (l.x || 0) + Math.cos(angle) * pushDist));
            const pushedZ = Math.max(-380, Math.min(380, (l.z || 0) + Math.sin(angle) * pushDist));
            lordPositionCommandsRef.current.set(l.id, { x: pushedX, z: pushedZ });
            setCampaign({
              ...res.nextState,
              lords: res.nextState.lords.map((item) =>
                item.id === l.id ? { ...item, x: pushedX, z: pushedZ } : item,
              ),
            });
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
            showToast(
              `${res.sacrificedTotal} artçı asker geride bırakılarak ${l.name} çemberinden çıkıldı!`,
            );
          }}
          onBribeEscape={(l, cost) => {
            sound.playCoinChime();
            const angle = Math.random() * Math.PI * 2;
            const pushDist = 28;
            const pushedX = Math.max(-500, Math.min(500, (l.x || 0) + Math.cos(angle) * pushDist));
            const pushedZ = Math.max(-380, Math.min(380, (l.z || 0) + Math.sin(angle) * pushDist));
            lordPositionCommandsRef.current.set(l.id, { x: pushedX, z: pushedZ });
            setCampaign((prev) => ({
              ...prev,
              gold: Math.max(0, prev.gold - cost),
              lords: prev.lords.map((item) =>
                item.id === l.id ? { ...item, x: pushedX, z: pushedZ } : item,
              ),
              chronicle: [
                {
                  id: `bribe-${prev.day}-${Date.now()}`,
                  day: prev.day,
                  category: 'DIPLOMACY',
                  text: `${l.name} kuvvetlerine ${cost} Dinar geçiş akçesi ödenerek çatışmadan kaçınıldı.`,
                },
                ...prev.chronicle,
              ].slice(0, 20),
            }));
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
            showToast(`${l.name} birliğine ${cost} Dinar geçiş hakkı ödendi.`);
          }}
          onDemandSurrender={(l) => {
            const res = resolveCorneredBanditSurrender(campaign, l);
            if (res.surrendered) {
              sound.playCoinChime();
              setCampaign(res.nextState);
              setDialogueLord(null);
              setDialogueSettlement(null);
              setIsForcedEncounter(false);
              setEncounterScenario(undefined);
              showToast(
                `${l.name} çetesi silah bıraktı! +${res.prisonersGained} Esir, +${res.goldGained} Dinar`,
              );
            } else {
              // Teslim olmadılar -> doğrudan 3B savaşa gir!
              setDialogueLord(null);
              setDialogueSettlement(null);
              setIsForcedEncounter(false);
              setEncounterScenario(undefined);
              showToast(`${l.name} teslim olmayı reddetti! Savaş başlıyor!`);
              handleStartFieldBattle(l);
            }
          }}
          onPlayerSurrender={(l) => {
            const res = applyPlayerSurrender(campaign, l);
            const angle = Math.random() * Math.PI * 2;
            const pushDist = 28;
            const pushedX = Math.max(-500, Math.min(500, (l.x || 0) + Math.cos(angle) * pushDist));
            const pushedZ = Math.max(-380, Math.min(380, (l.z || 0) + Math.sin(angle) * pushDist));
            lordPositionCommandsRef.current.set(l.id, { x: pushedX, z: pushedZ });
            setCampaign({
              ...res.nextState,
              lords: res.nextState.lords.map((item) =>
                item.id === l.id ? { ...item, x: pushedX, z: pushedZ } : item,
              ),
            });
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
            showToast(
              `${l.name} kuvvetlerine haraç bırakılarak esaretten kurtulundu (-${res.goldLost} Dinar).`,
            );
          }}
          onOpenDiplomacyCouncil={(l) => {
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
            setActiveDiplomacyLord(l);
          }}
          onChangeAllegiance={(targetFaction: FactionId | 'INDEPENDENT', role: 'INDEPENDENT' | 'MERCENARY' | 'VASSAL') => {
            const res = applyPlayerAllegianceChange(campaign, targetFaction, role);
            if (!res.success) {
              if (res.reason) showToast(res.reason);
              return;
            }
            setCampaign(res.nextState);
            if (res.reason) showToast(res.reason);
          }}
        />
      )}

      {isMarketModalOpen && activeSettlementModal && (
        <BannerlordMarketModal
          settlement={activeSettlementModal}
          campaign={campaign}
          onClose={() => setIsMarketModalOpen(false)}
          onUpdateCampaign={(next) => setCampaign(next)}
          onOpenArenaTest={() => {
            setIsMarketModalOpen(false);
            setViewMode('character_arena');
          }}
        />
      )}

      {isInventoryModalOpen && gameState === 'playing' && subMode === 'overworld' && (
        <InventoryModal
          campaign={campaign}
          onClose={() => setIsInventoryModalOpen(false)}
          onUpdateCampaign={(next) => setCampaign(next)}
        />
      )}

      {isPartyModalOpen && gameState === 'playing' && subMode === 'overworld' && (
        <PartyModal
          campaign={campaign}
          settlement={activeSettlementModal ?? undefined}
          onClose={() => setIsPartyModalOpen(false)}
          onUpdateCampaign={(next) => setCampaign(next)}
        />
      )}

      {isCharacterModalOpen && gameState === 'playing' && subMode === 'overworld' && (
        <CharacterModal
          campaign={campaign}
          onClose={() => setIsCharacterModalOpen(false)}
          onUpdateCampaign={(next) => setCampaign(next)}
          onShowToast={showToast}
        />
      )}

      {pendingBattleLoot && (
        <BattleLootModal
          campaign={campaign}
          pendingLoot={pendingBattleLoot}
          onClose={() => {
            setPendingBattleLoot(null);
            setBattleSiegeSettlementContextId(null);
            setGameState('playing');
          }}
          onCommit={(result) => {
            let nextState = result.nextState;
            if (battleSiegeSettlementContextId) {
              nextState = {
                ...nextState,
                lords: distributeCombinedBesiegerCasualties(
                  nextState.lords,
                  battleSiegeSettlementContextId,
                  true,
                  pendingBattleLoot.enemiesDefeatedCount,
                  nextState.day,
                ),
              };
            }
            setCampaign(nextState);
            setPendingBattleLoot(null);
            setBattleSiegeSettlementContextId(null);
            setGameState('playing');
          }}
        />
      )}

      {/* 7A. BANNERLORD ORDU & UYUM (ARMY MANAGEMENT) WIDGET */}
      {gameState === 'playing' && subMode === 'overworld' && !dialogueLord && !dialogueSettlement && (
        <div className="fixed right-4 bottom-20 z-40 flex flex-col items-end gap-2 pointer-events-none">
          <ArmyCohesionHudWidget
            campaign={campaign}
            onOpenArmyModal={() => setIsArmyModalOpen(true)}
            onQuickBoostCohesion={() => {
              const res = boostArmyCohesion(campaign);
              if (res.success) {
                setCampaign(res.nextState);
                showToast(`Ordu uyumu +10 artırıldı (-${res.influenceSpent} Nüfuz).`);
              } else if (res.reason) {
                showToast(res.reason);
              }
            }}
          />
        </div>
      )}

      {isArmyModalOpen && gameState === 'playing' && (
        <ArmyModal
          campaign={campaign}
          onClose={() => setIsArmyModalOpen(false)}
          onCreateOrExpandArmy={(selectedIds, targetId) => {
            const res = createOrExpandPlayerArmy(campaign, selectedIds, targetId);
            if (res.success) {
              setCampaign(res.nextState);
              showToast(
                `${res.army?.name ?? 'Ordu'} sancağı altında birlikler toplandı (-${res.influenceSpent} Nüfuz)!`,
              );
            } else if (res.reason) {
              showToast(res.reason);
            }
          }}
          onBoostCohesion={() => {
            const res = boostArmyCohesion(campaign);
            if (res.success) {
              setCampaign(res.nextState);
              showToast(`Ordu uyumu +10 artırıldı (-${res.influenceSpent} Nüfuz).`);
            } else if (res.reason) {
              showToast(res.reason);
            }
          }}
          onRemoveMember={(lordId) => {
            const army = (campaign.armies ?? []).find((a) => a.leaderId === 'player');
            if (!army) return;
            setCampaign((prev) => removeLordFromArmy(prev, army.id, lordId));
            showToast('Birlik ordudan ayrıldı.');
          }}
          onDisbandArmy={() => {
            const res = disbandArmy(campaign);
            setCampaign(res.nextState);
            setIsArmyModalOpen(false);
            showToast('Ordu dağıtıldı.');
          }}
          onSelectTargetSettlement={(settlementId) => {
            setCampaign((prev) => setPlayerArmyTargetSettlement(prev, settlementId));
          }}
        />
      )}

      {/* 7B. KINGDOM COUNCIL, DIPLOMACY & MACRO-SIMULATION ARCHITECTURE MODAL */}
      {isKingdomModalOpen && (
        <KingdomManagementModal
          campaign={campaign}
          macroState={macroState}
          onUpdateMacroState={(next) => setMacroState(next)}
          onUpdateCampaign={(next) => setCampaign(next)}
          onClose={() => setIsKingdomModalOpen(false)}
        />
      )}

      {/* 8. 3D LOW-POLY CHARACTER & COMBAT TEST ARENA */}
      {viewMode === 'character_arena' && (
        <CharacterArenaView
          campaign={campaign}
          onReturnToMap={() => setViewMode('campaign')}
          onOpenMarket={() => setIsMarketModalOpen(true)}
        />
      )}

      {/* 9B. BİLDİRİM (kayıt / yükleme) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] rounded border border-[#34d399]/50 bg-[#0f1a13]/95 px-4 py-2 text-xs text-[#d1fae5] shadow-lg pointer-events-none"
        >
          {toast}
        </div>
      )}

      {/* 9b. FAZ 11 — CANLI DÜNYA HABERİ (fetih / savaş) */}
      {worldToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-[90] max-w-2xl rounded border border-[#f59e0b]/60 bg-[#1a1208]/95 px-4 py-2 text-xs text-[#fde68a] shadow-lg pointer-events-none"
        >
          <span className="font-bold tracking-[0.18em] mr-2 text-[#f59e0b]">SAVAŞ HABERİ</span>
          {worldToast.text}
        </div>
      )}

      {/* 9c. ESARET MODU (PLAYER CAPTIVITY OVERLAY) & ESARETTEN KAÇIŞ BİLDİRİMİ */}
      {gameState === 'playing' &&
        subMode === 'overworld' &&
        campaign.playerCaptureState?.isCaptive &&
        (() => {
          const cap = campaign.playerCaptureState!;
          const escapePct = Math.round(
            computePlayerDailyEscapeChance(campaign, cap.daysCaptive),
          );
          const dungeonSettle = cap.dungeonSettlementId
            ? campaign.settlements.find((s) => s.id === cap.dungeonSettlementId)
            : null;
          return (
            <div
              data-testid="player-captivity-overlay"
              className="fixed inset-x-0 top-16 z-[65] flex flex-col items-center px-4 pointer-events-none"
            >
              <div className="w-full max-w-2xl rounded-sm border-2 border-[#dc2626]/70 bg-[#120d0a]/95 p-5 text-[#f3ead8] shadow-[0_20px_60px_rgba(0,0,0,0.92)] pointer-events-auto">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dc2626]/30 pb-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#f87171]">
                      Esaret Altındasınız · Kamera Tutsak Kafilesine Kilitli
                    </div>
                    <h2 className="font-display text-lg font-bold text-[#fde68a] mt-0.5">
                      {dungeonSettle
                        ? `${dungeonSettle.name} Zindanında Zincirlisiniz`
                        : `${cap.captorTitle} ${cap.captorName} Kafilesinde Tutsaksınız`}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-[#2a1212] border border-[#f87171]/40 text-xs font-mono font-bold text-[#fca5a5]">
                      Esaret: {cap.daysCaptive} Gün
                    </span>
                    <span className="px-2.5 py-1 rounded bg-[#16271c] border border-[#34d399]/40 text-xs font-mono font-bold text-[#6ee7b7]">
                      Günlük Kaçış: %{escapePct}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#cbbd9f] mt-3 leading-relaxed">
                  {dungeonSettle
                    ? `${cap.captorTitle} ${cap.captorName} sizi ${dungeonSettle.name} zindanına kapattı. Gözcülük ve Serserilik yeteneklerinize göre her gün kaçış zarı atılır.`
                    : `Elleriniz bağlı hâlde ${cap.captorName} birliğinin peşinde sürükleniyorsunuz. Harita zamanı hızlandırılmış akıyor; nöbetçilerin dalgınlığını kollayın veya fidye ödeyin.`}
                </p>

                {/* Zaman Hızı ve Gün İlerletme Kontrolleri */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded bg-[#1b140e] border border-[#c6a15b]/25 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#d6cbb5]">
                    <span className="font-semibold text-[#c6a15b]">Esaret Zaman Akışı:</span>
                    {([1, 2, 4] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setCampaignTimeScale(spd)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${
                          campaignTimeScale === spd
                            ? 'bg-[#b45309] border-[#fbbf24] text-white'
                            : 'bg-[#14110c] border-[#c6a15b]/30 text-[#a89b84]'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="captivity-advance-day-btn"
                      onClick={() => {
                        setCampaign((prev) => {
                          const tick = advanceWorldDay(prev, {
                            lordPositions: lordPositionsRef.current,
                            clans: macroStateRef.current?.clans,
                            playerPos: { x: prev.playerX, z: prev.playerZ },
                          });
                          return {
                            ...tick.state,
                            settlements: refreshRecruitPools(tick.state.settlements, tick.state.day),
                          };
                        });
                      }}
                      className="px-3 py-1.5 rounded bg-[#261f16] hover:bg-[#382d20] border border-[#c6a15b]/45 text-[11px] font-bold text-[#fde68a]"
                    >
                      1 Gün İlerle (Kaçış Zarı At)
                    </button>

                    <button
                      type="button"
                      data-testid="captivity-pay-ransom-btn"
                      disabled={campaign.gold < cap.ransomCost}
                      onClick={() => {
                        const res = payPlayerCaptivityRansom(campaign);
                        if (!res.success) {
                          if (res.reason) showToast(res.reason);
                          return;
                        }
                        sound.playCoinChime();
                        setCampaign(res.nextState);
                        setCampaignTimeScale(1);
                        if (res.reason) showToast(res.reason);
                      }}
                      className="px-3 py-1.5 rounded bg-[#1b3124] hover:bg-[#234230] disabled:opacity-40 border border-[#34d399]/50 text-[11px] font-bold text-[#a7f3d0]"
                    >
                      Fidye Öde ve Kurtul ({cap.ransomCost} Dinar)
                    </button>
                  </div>
                </div>

                {/* Rastgele Esaret Olayı (Random Event Pop-up / Dilemma) */}
                {cap.activeEvent && (
                  <div
                    data-testid="captivity-dilemma-box"
                    className="mt-3 rounded border border-[#f59e0b]/55 bg-[#1c150c] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#fbbf24]">
                        Esaret Fırsatı · {cap.activeEvent.title}
                      </span>
                      <span className="text-[11px] font-mono text-[#a89b84]">
                        Can: %{campaign.playerHp ?? 100} · Hazine: {campaign.gold} Dinar
                      </span>
                    </div>
                    <p className="text-xs text-[#e6dec8]">{cap.activeEvent.text}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {cap.activeEvent.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          data-testid={`captivity-dilemma-${opt.id}`}
                          onClick={() => {
                            const res = resolvePlayerCaptivityDilemma(campaign, opt.id);
                            setCampaign(res.nextState);
                            if (res.escaped) {
                              sound.playSettlementEnter();
                              setCampaignTimeScale(1);
                            }
                            showToast(res.outcomeText);
                          }}
                          className="text-left p-2.5 rounded border border-[#c6a15b]/35 bg-[#14100b] hover:bg-[#261e14] hover:border-[#fbbf24] transition-colors"
                        >
                          <div className="text-xs font-bold text-[#fde68a]">{opt.label}</div>
                          <div className="text-[10px] text-[#a89b84] mt-0.5">{opt.description}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* 9d. ESARETTEN KAÇTINIZ! (ESCAPED CAPTIVITY MODAL) */}
      {campaign.escapedCaptivityNotice && (
        <div
          data-testid="escaped-captivity-modal"
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="hud-panel max-w-md w-full rounded-sm border-2 border-[#c6a15b] bg-[#14110c] p-6 text-center text-[#f3ead8] shadow-2xl space-y-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#34d399]">
              Zincirler Kırıldı
            </div>
            <h2 className="font-display text-2xl font-bold text-[#fde68a]">
              {campaign.escapedCaptivityNotice.method === 'RANSOM'
                ? 'Fidye Ödendi · Özgürsünüz!'
                : 'Esaretten Kaçtınız!'}
            </h2>
            <p className="text-xs text-[#d6cbb5] leading-relaxed">
              {campaign.escapedCaptivityNotice.message}
            </p>
            <div className="pt-2">
              <button
                type="button"
                data-testid="escaped-captivity-confirm-btn"
                onClick={() => {
                  setCampaign((prev) => ({
                    ...prev,
                    escapedCaptivityNotice: null,
                  }));
                  setCampaignTimeScale(1);
                  cameraActionsRef.current?.focusOnPlayer();
                }}
                className="px-6 py-2.5 rounded bg-[#b45309] hover:bg-[#d97706] text-xs font-bold text-white uppercase tracking-wider"
              >
                Sancağı Yeniden Topla [Devam Et]
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. BANNERLORD LOW-POLY CHARACTER & LORD MORPH STUDIO */}
      {isCharacterCreatorOpen && (
        <CharacterCreatorModal
          initialDNA={campaign.playerMorphDNA}
          characterName={campaign.playerName}
          confirmLabel={isNewGameCreatorFlow ? 'Seferi Başlat [Enter]' : 'Karakteri Onayla'}
          onSave={(newDNA, newName, startOptions) => {
            if (isNewGameCreatorFlow) {
              setIsNewGameCreatorFlow(false);
              setIsCharacterCreatorOpen(false);
              if (newName) setPlayerName(newName);
              runWithLoadingScreen(
                'KALRADYA DÜNYASI HAZIRLANIYOR',
                `${newName || playerName} · Yeni Sefer Başlıyor`,
                () => startGame(newDNA, newName, startOptions),
              );
            } else {
              setCampaign((prev) => ({
                ...prev,
                playerMorphDNA: newDNA,
                playerName: newName || prev.playerName,
              }));
              if (newName) setPlayerName(newName);
              showToast('Karakter kaydedildi.');
              setIsCharacterCreatorOpen(false);
            }
          }}
          onClose={() => {
            setIsNewGameCreatorFlow(false);
            setIsCharacterCreatorOpen(false);
          }}
        />
      )}

      {/* 11. BANNERLORD AYARLAR (OPTIONS) MODAL */}
      {isSettingsModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Oyun Ayarları"
          data-testid="settings-modal"
        >
          <div className="hud-panel rounded-sm border-2 border-[#8b6b36] bg-[#14110c] w-full max-w-lg p-6 text-[#f3ead8] shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#c6a15b]/30 pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#fde68a] tracking-wider uppercase">
                  Oyun Ayarları (Options)
                </h2>
                <p className="text-xs text-[#a89b84]">Ses, Harita Performansı ve Kamera Kontrolleri</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-3 py-1 rounded text-xs font-bold bg-[#262018] hover:bg-[#382f23] text-[#fde68a] border border-[#c6a15b]/40"
              >
                Kapat [Esc]
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded bg-[#1b1610] border border-[#c6a15b]/25 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-[#f8f0df]">Oyun Sesleri ve Harita Efektleri</div>
                  <div className="text-[#a89b84] mt-0.5">
                    At nalı sesleri, arayüz tıklamaları ve muharebe efektleri ([M] kısayolu)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = sound.toggleMute();
                    setMuted(next);
                  }}
                  className={`px-4 py-2 rounded font-bold border ${
                    muted
                      ? 'bg-[#3b1d1d] border-[#ef4444]/60 text-[#fecaca]'
                      : 'bg-[#1e3a2a] border-[#34d399]/60 text-[#d1fae5]'
                  }`}
                >
                  {muted ? 'Sessizde (Kapalı)' : 'Ses Açık'}
                </button>
              </div>

              <div className="p-3.5 rounded bg-[#1b1610] border border-[#c6a15b]/25 space-y-2">
                <div className="font-bold text-sm text-[#f8f0df]">Varsayılan Sancak Geçmişi</div>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'noble', label: 'Soylu Sancaktar' },
                      { id: 'steppe', label: 'Bozkır Akıncısı' },
                      { id: 'tactician', label: 'İmparatorluk Taktisyeni' },
                    ] as const
                  ).map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setBackgroundChoice(bg.id)}
                      className={`p-2 rounded border text-center font-bold ${
                        backgroundChoice === bg.id
                          ? 'bg-[#3b2d18] border-[#fbbf24] text-[#fef08a]'
                          : 'bg-[#14110c] border-[#c6a15b]/25 text-[#b5a890]'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded bg-[#1b1610] border border-[#c6a15b]/25 space-y-1 text-[#d1c5b0]">
                <div className="font-bold text-sm text-[#fde68a] mb-1">Klavye &amp; Fare Rehberi</div>
                <div>• Sol Tık: Haritada yürü / Yerleşime veya Lorda doğru takip başlat</div>
                <div>• WASD: Stratejik kamerayı kaydır · Q/E veya Sağ Tık: Kamerayı döndür</div>
                <div>• Space: Zamanı duraklat/başlat · 1 / 2 / 3: Zaman hızı</div>
                <div>• I: Saha Envanteri · P: Parti &amp; Birlikler · C: Karakter · N: Ansiklopedi</div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#c6a15b]/25">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 12. BANNERLORD LOADING SCREEN OVERLAY */}
      {loadingScreen?.active && (
        <div
          className="fixed inset-0 z-[100] flex flex-col justify-between p-10 bg-[#0b0907] text-[#f3ead8] select-none pointer-events-auto"
          data-testid="bannerlord-loading-screen"
        >
          <div className="flex items-center justify-between border-b border-[#c6a15b]/30 pb-4">
            <span className="font-display text-sm tracking-[0.25em] text-[#c6a15b] uppercase">
              Sancak-ı Kalradya · Taht ve Kılıç
            </span>
            <span className="text-xs font-mono text-[#a89b84]">1084 Yazı · Kalradya Kıtası</span>
          </div>

          <div className="my-auto max-w-xl mx-auto text-center space-y-5">
            <svg
              viewBox="0 0 80 80"
              className="w-20 h-20 mx-auto text-[#c6a15b] animate-pulse"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M40 6L12 18v24c0 20 12 34 28 40 16-6 28-20 28-40V18L40 6z" fill="#17130e" />
              <path d="M25 25l30 30M55 25L25 55" stroke="#fde68a" strokeWidth="2.5" />
            </svg>
            <h2 className="font-display text-2xl font-bold text-[#fde68a] tracking-widest uppercase">
              {loadingScreen.title}
            </h2>
            <p className="text-sm text-[#d6cbb5]">{loadingScreen.subtitle}</p>
            <div className="w-80 max-w-full mx-auto h-2 rounded-full bg-[#1c1610] border border-[#c6a15b]/40 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#92400e] via-[#d97706] to-[#fde68a] w-full animate-pulse" />
            </div>
          </div>

          <div className="max-w-2xl mx-auto text-center border-t border-[#c6a15b]/25 pt-4">
            <p className="text-xs text-[#cfc3ad] italic">{loadingScreen.tip}</p>
          </div>
        </div>
      )}
    </main>
  );
}

