import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AttributeId,
  BannerlordSkillId,
  BuildingProjectId,
  CampaignState,
  LordAgent,
  Settlement,
  SettlementDailyDefault,
  SiegeEngineType,
  TacticalOrder,
  TroopRoster,
  UnitTierId,
  WorkshopTypeId,
  advanceDailyEconomyAndWorld,
  allocateAttributePoint,
  allocateFocusPoint,
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
  upgradeTroopTier,
} from './game/rules';
import type {
  BattleTelemetry,
  CameraControlActions,
  MapCameraTelemetry,
} from './game/types';
import { WorldCanvas } from './components/WorldCanvas';
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
import { advanceWorldDay } from './game/worldSim';
import {
  applyBreakInCasualties,
  buildSiegeEncounterView,
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
  const [isCharacterCreatorOpen, setIsCharacterCreatorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'campaign' | 'character_arena'>('campaign');
  // Faz 1: Bannerlord Ansiklopedisi (N)
  const [isEncyclopediaOpen, setIsEncyclopediaOpen] = useState(
    e2eRequest.enabled ? initialE2ESetup.encyclopediaOpen : false,
  );
  /** Tanışılan kahramanlar — orta yol fog of war (yaş/beceri açılır). */
  const [metHeroIds, setMetHeroIds] = useState<string[]>([]);

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
  const [activeOrder, setActiveOrder] = useState<TacticalOrder>('CHARGE');
  const [battleTargetLordId, setBattleTargetLordId] = useState<string | null>(null);
  const [battleTargetSettlementId, setBattleTargetSettlementId] = useState<string | null>(null);
  const [battleTelemetry, setBattleTelemetry] = useState<BattleTelemetry>({
    playerHp: 120,
    playerMaxHp: 120,
    playerStamina: 100,
    alliesAlive: 17,
    alliesTotal: 17,
    enemiesAlive: 11,
    enemiesTotal: 11,
    enemyCommanderName: 'Kara Geçit Yağmacıları',
    activeOrder: 'CHARGE',
    comboCount: 0,
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
          lordPositionCommandsRef.current.set(lordId, {
            x: patch.x ?? live?.x ?? campaignLord.x,
            z: patch.z ?? live?.z ?? campaignLord.z,
          });
        }
        const applyPatch = (lord: LordAgent): LordAgent => {
          const roster = patch.roster ?? lord.roster;
          return {
            ...lord,
            ...patch,
            roster,
            armySize: patch.armySize ?? getTotalTroops(roster),
          };
        };
        setCampaign((prev) => ({
          ...prev,
          lords: prev.lords.map((lord) => (lord.id === lordId ? applyPatch(lord) : lord)),
        }));
        setDialogueLord((prev) => (prev?.id === lordId ? applyPatch(prev) : prev));
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
            lordPositionCommandsRef.current.set(lord.id, { x: lord.x, z: lord.z });
          });
        if (role !== 'defender') {
          playerPositionCommandRef.current = {
            x: setup.campaign.playerX,
            z: setup.campaign.playerZ,
          };
        }
        const campAngle = Math.atan2(campZ - settlement.z, campX - settlement.x);
        const focusOffset = options?.focusOnCamp ? 8 : 0;
        setCampaign(setup.campaign);
        setActiveSettlementModal(null);
        setDialogueLord(null);
        setDialogueSettlement(null);
        setActiveSiegeSettlementId(setup.settlementId);
        cameraActionsRef.current?.focusOnCoords(
          settlement.x + Math.cos(campAngle) * focusOffset,
          settlement.z + Math.sin(campAngle) * focusOffset,
          34,
        );
        return true;
      },
      closeSiege: () => setActiveSiegeSettlementId(null),
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

  const startGame = useCallback((customDna?: CharacterMorphDNA, customName?: string) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const finalName = customName || playerName;
    const fresh = createInitialCampaignState(finalName, backgroundChoice);
    if (customDna) {
      fresh.playerMorphDNA = customDna;
    }
    setCampaign(fresh);
    setMacroState(createInitialKingdomMacroState(fresh));
    setSubMode('overworld');
    setCampaignTimeScale(1);
    setActiveSettlementModal(null);
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
    // Yeni seferde tanışıklıklar sıfırlanır (fog of war baştan).
    setMetHeroIds([]);
    setGameState('playing');
    document.body.dataset.state = 'playing';
    cameraActionsRef.current?.focusOnCoords(fresh.playerX, fresh.playerZ, 52);
    cameraActionsRef.current?.focusOnPlayer();
    sound.playWarhorn();
  }, [backgroundChoice, playerName]);

  /* ───────────────── Faz 10a: UI katmanları & kayıt ───────────────── */

  /** O an açık olan UI katmanları (Esc sırası ve duraklatma bunlardan türetilir). */
  const uiLayers: UiLayerFlags = {
    creator: isCharacterCreatorOpen,
    character: isCharacterModalOpen,
    inventory: isInventoryModalOpen,
    party: isPartyModalOpen,
    market: isMarketModalOpen,
    kingdom: isKingdomModalOpen,
    dialogue: !!(dialogueLord || dialogueSettlement),
    settlement: !!activeSettlementModal || !!activeSiegeSettlementId,
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
      if (ok) setSaveInfo(readSaveSummary(defaultStorage()));
      return ok;
    },
    [campaign, macroState, metHeroIds, backgroundChoice, e2eRequest.enabled],
  );

  /** Otomatik kayıt: her oyun günü geçişinde. */
  const lastAutosaveDayRef = useRef(-1);
  useEffect(() => {
    if (e2eRequest.enabled) return;
    if (gameState === 'title' || gameState === 'gameover') return;
    if (lastAutosaveDayRef.current === campaign.day) return;
    lastAutosaveDayRef.current = campaign.day;
    persist();
  }, [campaign.day, gameState, persist, e2eRequest.enabled]);

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
    sound.playWarhorn();
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
    sound.playWarhorn();
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
        } else if (e.code === 'Escape') {
          if (isCharacterCreatorOpen) {
            setIsNewGameCreatorFlow(false);
            setIsCharacterCreatorOpen(false);
          } else if (isTitleLoadOpen) {
            setIsTitleLoadOpen(false);
          }
        }
        return;
      }

      if (e.code === 'KeyN' && gameState === 'playing') {
        e.preventDefault();
        setIsEncyclopediaOpen(true);
        return;
      }

      if (e.code === 'KeyM') {
        const nextMuted = sound.toggleMute();
        setMuted(nextMuted);
        return;
      }

      if (e.code === 'KeyR' && gameState === 'playing' && !uiPausesWorld) {
        // Kayıt silineceği için onay istenir (eski sürüm sessizce sıfırlıyordu).
        const ok =
          typeof window === 'undefined' ||
          window.confirm('Yeni sefer başlatılsın mı? Mevcut kayıt silinecek.');
        if (ok) startGame();
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

      if (gameState === 'playing' && subMode === 'battle') {
        if (e.code === 'Digit1') setActiveOrder('CHARGE');
        if (e.code === 'Digit2') setActiveOrder('SHIELD_WALL');
        if (e.code === 'Digit3') setActiveOrder('FOLLOW_ME');
        if (e.code === 'Digit4') setActiveOrder('HOLD_VOLLEY');
      }
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
        // Faz 8: gönüllü havuzları her 3 günde bir tazelenir.
        return { ...next, settlements: refreshRecruitPools(next.settlements, next.day) };
      });
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
    (settlementId: string, recruits: Array<{ troopId: string; cost: number }>): string | null => {
      let errorMsg: string | null = null;
      setCampaign((prev) => {
        const totalCost = recruits.reduce((s, r) => s + r.cost, 0);
        if (prev.gold < totalCost) {
          errorMsg = 'Yetersiz dinar.';
          return prev;
        }

        const nextStacks = [...(prev.troopStacks ?? [])];
        for (const recruit of recruits) {
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

        const nextRoster = troopStackTotals(nextStacks);
        const nextArmySize = getTotalTroops(nextRoster);
        const nextStrength = calculatePartyStrength(nextRoster);

        showToast(`${recruits.length} yeni asker sancağınıza katıldı! (-${totalCost} Dinar)`);
        sound.playCoinChime();

        return {
          ...prev,
          gold: Math.max(0, prev.gold - totalCost),
          troopStacks: nextStacks,
          roster: nextRoster,
          armySize: nextArmySize,
          strength: nextStrength,
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
            message: `3 tur boyunca tüm gladyatörleri dize getirerek turnuva şampiyonu oldunuz! Kazanılan ödül: +${res.goldEarned} Dinar, +${res.renownEarned} Nam ve ${res.prizeName}!`,
          };
        } else {
          outcome = {
            victory: false,
            message:
              'Turnuvanın çekişmeli yarı finalinde elendiniz. Yine de sergilediğiniz cesaretle +2 Nam kazandınız.',
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
      return res.nextState;
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
    setActiveOrder('CHARGE');
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
    setActiveOrder('CHARGE');
    const stages = campaignBattlePoolRef.current.prewarmMemoryPages();
    setBattlePrewarmStages(stages);
    setSubMode('battle');
  }, []);

  const handleStartQuickBattle = useCallback(() => {
    setActiveSettlementModal(null);
    setActiveDiplomacyLord(null);
    setBattleTargetLordId('lord-kargi');
    setBattleTargetSettlementId(null);
    setActiveOrder('CHARGE');
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
          const next = resolveBattleOutcome(
            prev,
            false,
            battleTargetLordId,
            losses,
            enemiesDefeated,
            battleTargetSettlementId,
          );
          const fiefsOwned = next.settlements.filter((s) => s.faction === 'player').length;

          setOutcomeSnapshot({
            victory: false,
            title: 'SANCAK GERİ ÇEKİLDİ',
            subtitle: 'Komutan yaralandı; muhafızlarınız sizi savaş meydanından çıkardı.',
            enemiesDefeated,
            renown: next.renown,
            gold: next.gold,
            fiefsOwned,
          });
          return next;
        });
        setSubMode('overworld');
        setGameState('gameover');
      }
    },
    [battleTargetLordId, battleTargetSettlementId, campaign],
  );

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#0d0c0a] select-none"
      data-testid="app-root"
      data-e2e-enabled={e2eRequest.enabled ? 'true' : 'false'}
      data-e2e-scenario={e2eRequest.enabled ? e2eRequest.scenario : undefined}
    >
      {/* Persistent 3D WebGL Continental Map & Tactical Battlefield Canvas */}
      <WorldCanvas
        gameState={gameState}
        subMode={subMode}
        campaignTimeScale={campaignTimeScale}
        campaign={campaign}
        activeOrder={activeOrder}
        battleTargetLordId={battleTargetLordId}
        battleTargetSettlementId={battleTargetSettlementId}
        cameraActionsRef={cameraActionsRef}
        lordPositionsRef={lordPositionsRef}
        lordPositionCommandsRef={lordPositionCommandsRef}
        playerPositionCommandRef={playerPositionCommandRef}
        activeDiplomacyLordId={activeDiplomacyLord?.id ?? null}
        activeDialogueLordId={dialogueLord?.id ?? null}
        activeSettlementModalId={activeSettlementModal?.id ?? null}
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
          sound.playWarhorn();
          setDialogueLord(l);
          setIsForcedEncounter(true);
          setEncounterScenario(scenario);
          showToast(
            l.faction === 'bandits'
              ? `${l.name} yolunuzu kesti!`
              : `${l.title} ${l.name} sancağınızı kıstırdı!`,
          );
        }}
        onBattleTelemetry={setBattleTelemetry}
        onBattleComplete={handleBattleComplete}
      />

      {/* 1. TITLE SCREEN OVERLAY */}
      {gameState === 'title' && (
        <div
          className="fixed inset-0 z-30 flex flex-col justify-between p-12 pointer-events-auto"
          style={{
            background:
              'linear-gradient(90deg, rgba(10,9,7,0.92) 0%, rgba(10,9,7,0.72) 42%, rgba(10,9,7,0.12) 100%)',
          }}
        >
          <div className="max-w-lg my-auto">
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
                    <stop offset="50%" stopColor="#d97706" />
                    <stop offset="100%" stopColor="#92400e" />
                  </linearGradient>
                </defs>
                <g transform="translate(8, 10)">
                  <path
                    d="M36 4L8 16v26c0 24 12 42 28 48 16-6 28-24 28-48V16L36 4z"
                    fill="#1c1610"
                    stroke="url(#crestGold)"
                    strokeWidth="3"
                  />
                  <path
                    d="M22 24l28 36M50 24L22 60"
                    stroke="#f3ead8"
                    strokeWidth="2.5"
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
                  fill="#fbbf24"
                  fontFamily="Cinzel, Georgia, serif"
                  fontWeight="600"
                  fontSize="15"
                  letterSpacing="4.5"
                >
                  TAHT VE KILIÇ
                </text>
              </svg>
            </div>

            <p className="text-sm text-[#d6cbb5] leading-relaxed mb-6 max-w-md">
              Kuzeyin karlı sıradağlarından doğunun altın bozkırlarına ve güneyin kızıl
              vahalarına uzanan devasa 3B Kalradya kıtasında Bannerlord tarzı stratejik
              harita kamerasıyla ordunuzu yönetin, lordlarla diplomasi yürütün ve
              meydan savaşlarına liderlik edin.
            </p>

            <div className="mb-6">
              <div className="text-xs font-semibold text-[#c6a15b] mb-2">
                Sancaktar Geçmişini Seçin:
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    {
                      id: 'noble',
                      title: 'Soylu Sancaktar',
                      sub: '680 Dinar · Yüksek Nam',
                    },
                    {
                      id: 'steppe',
                      title: 'Bozkır Akıncısı',
                      sub: '6 Zırhlı Süvari · Hızlı Ordu',
                    },
                    {
                      id: 'tactician',
                      title: 'İmparatorluk Taktisyeni',
                      sub: '7 Uzun Okçu · 3 Muhafız',
                    },
                  ] as const
                ).map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackgroundChoice(bg.id)}
                    className={`p-2.5 rounded text-left border transition-colors ${
                      backgroundChoice === bg.id
                        ? 'bg-[#2b2114] border-[#f59e0b] text-[#f8f0df]'
                        : 'bg-[#16130e] border-[#c6a15b]/25 text-[#b5a890] hover:border-[#c6a15b]/50'
                    }`}
                  >
                    <div className="text-xs font-bold whitespace-nowrap truncate">
                      {bg.title}
                    </div>
                    <div className="text-[11px] text-[#c6a15b] mt-0.5 truncate">
                      {bg.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {saveInfo && (
              <div className="mb-4 rounded border border-[#34d399]/40 bg-[#0f1a13] px-3 py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={continueGame}
                    className="px-6 py-3 rounded text-sm font-display font-bold tracking-wider bg-[#166534] hover:bg-[#15803d] text-[#ecfdf5] border border-[#34d399]/60 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    SEFERE DEVAM ET · GÜN {saveInfo.day} [ENTER]
                  </button>
                  <div className="text-[11px] text-[#a7d8bd] leading-tight">
                    <div>
                      {saveInfo.playerName} · {saveInfo.gold} dinar
                    </div>
                    <div className="text-[#6f8f7d]">
                      Son kayıt:{' '}
                      {saveInfo.savedAt > 0
                        ? new Date(saveInfo.savedAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={() => {
                  if (saveInfo && !window.confirm('Yeni sefer başlatılsın mı? Mevcut kayıt silinecek.')) return;
                  setIsNewGameCreatorFlow(true);
                  setIsCharacterCreatorOpen(true);
                  sound.playCoin();
                }}
                className="px-7 py-3.5 rounded text-sm font-display font-bold tracking-wider bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/60 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {saveInfo ? 'YENİ SEFER BAŞLAT' : 'SEFERİ BAŞLAT [ENTER]'}
              </button>
              <button
                type="button"
                data-testid="title-load-saves-btn"
                onClick={() => {
                  sound.playCoin();
                  setIsTitleLoadOpen(true);
                }}
                className="px-5 py-3.5 rounded text-sm font-display font-bold tracking-wider bg-[#261f17] hover:bg-[#382d22] text-[#fde68a] border border-[#c6a15b]/60 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
              >
                <span>📂</span>
                <span>KAYIT YÜKLE (LOAD GAME)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsNewGameCreatorFlow(false);
                  setIsCharacterCreatorOpen(true);
                  sound.playCoin();
                }}
                className="px-5 py-3.5 rounded text-sm font-display font-bold tracking-wider bg-[#2a1d13] hover:bg-[#3d2a1b] text-[#fef3c7] border border-[#c6a15b]/60 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
              >
                <span>👤</span>
                <span>KARAKTERİNİ MODELLE [B]</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('character_arena');
                  sound.playWarhorn();
                }}
                className="px-5 py-3.5 rounded text-sm font-display font-bold tracking-wider bg-[#221a12] hover:bg-[#34271a] text-[#fbbf24] border border-[#f59e0b]/50 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
              >
                <span>⚔️</span>
                <span>SAVAŞ & KARAKTER ARENASI TEST ET</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-[#c7baa3] tracking-wide">
            WASD Harita Kamerasını Kaydır · Q/E veya Sağ Tık Kamera Döndür · Tekerlek (Z/X) Yakınlaştır · Sol Tık Sancağı Yürüt · C Sancağa Odakla · Space Zamanı Duraklat
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
          activeOrder={activeOrder}
          battleTelemetry={battleTelemetry}
          muted={muted}
          onSetTimeScale={setMapTimeScale}
          onToggleMute={() => {
            const next = sound.toggleMute();
            setMuted(next);
          }}
          onPause={() => setGameState('paused')}
          onRestart={startGame}
          onSetTacticalOrder={(ord) => {
            setActiveOrder(ord);
            sound.playWarhorn();
          }}
          onOpenSettlement={handleOpenSettlement}
          onOpenDiplomacy={(l) => {
            setActiveDiplomacyLord(l);
          }}
          onOpenEncyclopedia={() => {
            setIsEncyclopediaOpen(true);
          }}
          onStartQuickBattle={handleStartQuickBattle}
          onRetreatBattle={() => setSubMode('overworld')}
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
          onUpgradeTroop={(fromTier, toTier) => {
            const res = upgradeTroopTier(campaign, fromTier, toTier, 1);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
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
                setCampaign((prev) => startPlayerSiege(prev, liveSettlement.id));
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
              onAttackBesiegers={(lord) => handleStartFieldBattle(lord)}
              onBreakIn={() => {
                setCampaign((prev) =>
                  enterBesiegedSettlement(applyBreakInCasualties(prev), liveSettlement.id),
                );
              }}
              onObserve={() => setActiveSiegeSettlementId(null)}
              onDefendWalls={() => handleStartSiegeBattle(liveSettlement)}
              onSallyOut={(lord) => {
                if (lord) handleStartFieldBattle(lord);
                else handleStartSiegeBattle(liveSettlement);
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
          onClose={() => setActiveSettlementModal(null)}
          onOpenFullMarket={() => setIsMarketModalOpen(true)}
          onTalkToReeve={() => {
            setDialogueSettlement(activeSettlementModal);
          }}
          onOpenCharacterArena={() => setViewMode('character_arena')}
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
                  if (window.confirm('Yeni sefer başlatılsın mı? Mevcut kayıt silinecek.')) startGame();
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
          campaign={campaign}
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
          onClose={() => {
            setDialogueLord(null);
            setDialogueSettlement(null);
            setIsForcedEncounter(false);
            setEncounterScenario(undefined);
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
              setCampaign((prev) => {
                const next = resolveBattleOutcome(prev, false, l.id, sim.losses, sim.enemiesDefeated, null);
                const fiefsOwned = next.settlements.filter((s) => s.faction === 'player').length;
                setOutcomeSnapshot({
                  victory: false,
                  title: 'BİRLİKLER GERİ ÇEKİLDİ',
                  subtitle: 'Otomatik muharebede hatlarınız kırıldı; ağır kayıpla geri çekildiniz.',
                  enemiesDefeated: sim.enemiesDefeated,
                  renown: next.renown,
                  gold: next.gold,
                  fiefsOwned,
                });
                return next;
              });
              setGameState('gameover');
            }
          }}
          onSacrificeEscape={(l) => {
            const res = applySacrificeEscape(campaign, l);
            setCampaign(res.nextState);
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
            setCampaign((prev) => ({
              ...prev,
              gold: Math.max(0, prev.gold - cost),
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
            setCampaign(res.nextState);
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
            setGameState('playing');
          }}
          onCommit={(result) => {
            setCampaign(result.nextState);
            setPendingBattleLoot(null);
            setGameState('playing');
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

      {/* 10. BANNERLORD LOW-POLY CHARACTER & LORD MORPH STUDIO */}
      {isCharacterCreatorOpen && (
        <CharacterCreatorModal
          initialDNA={campaign.playerMorphDNA}
          characterName={campaign.playerName}
          confirmLabel={isNewGameCreatorFlow ? 'Seferi Başlat [Enter]' : 'Karakteri Onayla'}
          onSave={(newDNA, newName) => {
            if (isNewGameCreatorFlow) {
              setIsNewGameCreatorFlow(false);
              setIsCharacterCreatorOpen(false);
              startGame(newDNA, newName);
            } else {
              setCampaign((prev) => ({
                ...prev,
                playerMorphDNA: newDNA,
                playerName: newName || prev.playerName,
              }));
              // Faz 10a: seçilen ad yeni seferde de korunur (eski sürümde 'Komutan Demirhan'a dönüyordu).
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
    </main>
  );
}

