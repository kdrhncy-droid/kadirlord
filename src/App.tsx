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
  constructSiegeEngine,
  createInitialCampaignState,
  deployReservedSiegeEngines,
  equipInventoryItem,
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
import { DialogueModal } from './components/DialogueModal';
import { DiplomacyModal } from './components/DiplomacyModal';
import { BannerlordMarketModal } from './components/BannerlordMarketModal';
import { KingdomManagementModal } from './components/KingdomManagementModal';
import { CharacterArenaView } from './components/CharacterArenaView';
import { CharacterCreatorModal } from './components/CharacterCreatorModal';
import { BattlePrewarmModal } from './components/BattlePrewarmModal';
import { EncyclopediaModal } from './components/encyclopedia/EncyclopediaModal';
import { BattleMemoryPool, PrewarmStageReport } from './game/battleEnginePool';
import {
  KingdomMacroState,
  createInitialKingdomMacroState,
} from './game/kingdomSystem';
import { sound } from './game/sound';

export default function App() {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [gameState, setGameState] = useState<'title' | 'playing' | 'paused' | 'gameover'>(
    isAutostart ? 'playing' : 'title',
  );
  const [subMode, setSubMode] = useState<'overworld' | 'battle'>('overworld');
  const [campaignTimeScale, setCampaignTimeScale] = useState<0 | 1 | 2 | 4>(1);
  const [backgroundChoice, setBackgroundChoice] = useState<'noble' | 'steppe' | 'tactician'>(
    'noble',
  );
  const [campaign, setCampaign] = useState<CampaignState>(() =>
    createInitialCampaignState('Komutan Demirhan', 'noble'),
  );
  const [macroState, setMacroState] = useState<KingdomMacroState>(() =>
    createInitialKingdomMacroState(createInitialCampaignState('Komutan Demirhan', 'noble')),
  );

  const cameraActionsRef = useRef<CameraControlActions | null>(null);

  // Proximity & Active Modals
  const [nearSettlement, setNearSettlement] = useState<Settlement | null>(null);
  const [nearLord, setNearLord] = useState<LordAgent | null>(null);
  const [activeSettlementModal, setActiveSettlementModal] = useState<Settlement | null>(null);
  const [activeDiplomacyLord, setActiveDiplomacyLord] = useState<LordAgent | null>(null);
  // Faz 6: yüz yüze diyalog ekranı (lord veya yerleşim reisi)
  const [dialogueLord, setDialogueLord] = useState<LordAgent | null>(null);
  const [dialogueSettlement, setDialogueSettlement] = useState<Settlement | null>(null);
  const [isMarketModalOpen, setIsMarketModalOpen] = useState(false);
  const [isKingdomModalOpen, setIsKingdomModalOpen] = useState(false);
  const [isCharacterCreatorOpen, setIsCharacterCreatorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'campaign' | 'character_arena'>('campaign');
  // Faz 1: Bannerlord Ansiklopedisi (N)
  const [isEncyclopediaOpen, setIsEncyclopediaOpen] = useState(false);
  /** Tanışılan kahramanlar — orta yol fog of war (yaş/beceri açılır). */
  const [metHeroIds, setMetHeroIds] = useState<string[]>([]);

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

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  const startGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const fresh = createInitialCampaignState('Komutan Demirhan', backgroundChoice);
    setCampaign(fresh);
    setSubMode('overworld');
    setCampaignTimeScale(1);
    setActiveSettlementModal(null);
    setActiveDiplomacyLord(null);
    setDialogueLord(null);
    setDialogueSettlement(null);
    setOutcomeSnapshot(null);
    setGameState('playing');
    document.body.dataset.state = 'playing';
    cameraActionsRef.current?.focusOnCoords(fresh.playerX, fresh.playerZ, 52);
    cameraActionsRef.current?.focusOnPlayer();
    sound.playWarhorn();
  }, [backgroundChoice]);

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

      if (gameState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startGame();
        } else if (e.code === 'KeyB') {
          e.preventDefault();
          setIsCharacterCreatorOpen((prev) => !prev);
        }
        return;
      }

      if (e.code === 'KeyN' && gameState === 'playing') {
        e.preventDefault();
        setCampaignTimeScale(0);
        setIsEncyclopediaOpen(true);
        return;
      }

      if (e.code === 'KeyM') {
        const nextMuted = sound.toggleMute();
        setMuted(nextMuted);
        return;
      }

      if (e.code === 'KeyR' && gameState === 'playing') {
        startGame();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (activeSettlementModal) {
          setActiveSettlementModal(null);
          return;
        }
        if (activeDiplomacyLord) {
          setActiveDiplomacyLord(null);
          return;
        }
        if (gameState === 'playing') {
          setGameState('paused');
        } else if (gameState === 'paused') {
          setGameState('playing');
        }
        return;
      }

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
    startGame,
  ]);

  // Living World Periodic Tick scaled by campaignTimeScale
  useEffect(() => {
    if (gameState !== 'playing' || subMode !== 'overworld' || campaignTimeScale === 0) return;
    const intervalMs = Math.round(16000 / campaignTimeScale);
    const timer = setInterval(() => {
      setCampaign((prev) => advanceDailyEconomyAndWorld(prev));
    }, intervalMs);
    return () => clearInterval(timer);
  }, [gameState, subMode, campaignTimeScale]);

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
        const res = recruitUnit(prev, settlementId, unitId, amount);
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

  const handleSellLoot = useCallback((settlementId: string): string | null => {
    setCampaign((prev) => {
      const res = sellSurplusLootAtMarket(prev, settlementId);
      sound.playCoinChime();
      return res.nextState;
    });
    return null;
  }, []);

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
    setActiveSettlementModal(null);
    setBattleTargetLordId(lord.id);
    setBattleTargetSettlementId(null);
    setActiveOrder('CHARGE');
    const stages = campaignBattlePoolRef.current.prewarmMemoryPages();
    setBattlePrewarmStages(stages);
    setSubMode('battle');
  }, []);

  const handleStartSiegeBattle = useCallback((settlement: Settlement) => {
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
      setCampaign((prev) => {
        const next = resolveBattleOutcome(
          prev,
          victory,
          battleTargetLordId,
          losses,
          enemiesDefeated,
          battleTargetSettlementId,
        );
        const fiefsOwned = next.settlements.filter((s) => s.faction === 'player').length;

        setOutcomeSnapshot({
          victory,
          title: victory ? 'MEYDAN ZAFERİ KAZANILDI' : 'SANCAK GERİ ÇEKİLDİ',
          subtitle: victory
            ? 'Düşman hatları yarıldı, ganimet ve esirler ordugaha taşındı.'
            : 'Komutan yaralandı; muhafızlarınız sizi savaş meydanından çıkardı.',
          enemiesDefeated,
          renown: next.renown,
          gold: next.gold,
          fiefsOwned,
        });
        return next;
      });
      setSubMode('overworld');
      setGameState('gameover');
    },
    [battleTargetLordId, battleTargetSettlementId],
  );

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0d0c0a] select-none">
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
        activeDiplomacyLordId={activeDiplomacyLord?.id ?? null}
        activeSettlementModalId={activeSettlementModal?.id ?? null}
        onSetTimeScale={setCampaignTimeScale}
        onUpdatePlayerPos={handleUpdatePlayerPos}
        onOpenSettlement={(s) => {
          setCampaignTimeScale(0);
          setActiveSettlementModal(s);
        }}
        onOpenDiplomacy={(l) => {
          setCampaignTimeScale(0);
          setActiveDiplomacyLord(l);
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

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={startGame}
                className="px-7 py-3.5 rounded text-sm font-display font-bold tracking-wider bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/60 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                SEFERİ BAŞLAT [ENTER]
              </button>
              <button
                type="button"
                onClick={() => {
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

      {/* 2. PLAYING HUD */}
      {gameState === 'playing' && (
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
          onSetTimeScale={(s) => setCampaignTimeScale(s)}
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
          onOpenSettlement={(s) => {
            setCampaignTimeScale(0);
            setActiveSettlementModal(s);
          }}
          onOpenDiplomacy={(l) => {
            setCampaignTimeScale(0);
            setActiveDiplomacyLord(l);
          }}
          onOpenEncyclopedia={() => {
            setCampaignTimeScale(0);
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
          onEquipItem={(itemId) => {
            const res = equipInventoryItem(campaign, itemId);
            if (res.success) setCampaign(res.nextState);
            return res.reason || null;
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
            setCampaignTimeScale(0);
            setDialogueLord(l);
          }}
          canTrade={!!(activeSettlementModal || nearSettlement)}
          onOpenCharacterArena={() => setViewMode('character_arena')}
          onOpenKingdomModal={() => setIsKingdomModalOpen(true)}
          onOpenCharacterCreator={() => setIsCharacterCreatorOpen(true)}
        />
      )}

      {/* 3. SETTLEMENT & RECRUITMENT MODAL */}
      {gameState === 'playing' && activeSettlementModal && (
        <SettlementModal
          settlement={
            campaign.settlements.find((s) => s.id === activeSettlementModal.id) ??
            activeSettlementModal
          }
          campaign={campaign}
          onClose={() => setActiveSettlementModal(null)}
          onOpenFullMarket={() => setIsMarketModalOpen(true)}
          onTalkToReeve={() => {
            setCampaignTimeScale(0);
            setDialogueSettlement(activeSettlementModal);
          }}
          onOpenCharacterArena={() => setViewMode('character_arena')}
          onRecruit={handleRecruit}
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
          onBombardWalls={(settlementId) => {
            const res = bombardSettlementWalls(campaign, settlementId);
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

      {/* 5. PAUSE MODAL */}
      {gameState === 'paused' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto"
          style={{ backgroundColor: 'rgba(8, 7, 5, 0.82)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <div className="hud-panel rounded-lg p-6 w-full max-w-md text-center">
            <h2
              id="pause-modal-title"
              className="text-2xl font-display font-bold text-[#f8f0df]"
            >
              SEFER DURAKLATILDI
            </h2>
            <p className="text-xs text-[#b5a890] mt-1">
              {campaign.playerName} · Gün {campaign.day} ({campaign.season})
            </p>

            <div className="grid grid-cols-3 gap-2 my-5 p-3 rounded bg-[#16130e] border border-[#c6a15b]/20 font-mono-tabular">
              <div>
                <span className="text-[10px] text-[#a89b84] block">Asker</span>
                <span className="text-base font-bold text-[#f3ead8]">
                  {getTotalTroops(campaign.roster)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#a89b84] block">Hazine</span>
                <span className="text-base font-bold text-[#fbbf24]">
                  {campaign.gold}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#a89b84] block">Nam</span>
                <span className="text-base font-bold text-[#34d399]">
                  {campaign.renown}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setGameState('playing')}
                className="w-full py-2.5 px-4 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
              >
                Sefere Devam Et [Esc]
              </button>
              <button
                type="button"
                onClick={startGame}
                className="w-full py-2.5 px-4 rounded text-xs font-semibold bg-[#241f18] hover:bg-[#332c22] text-[#e2d6c1] border border-[#c6a15b]/30 transition-colors"
              >
                Seferi Baştan Başlat
              </button>
              <button
                type="button"
                onClick={() => setGameState('title')}
                className="w-full py-2.5 px-4 rounded text-xs font-semibold bg-[#181510] hover:bg-[#26211a] text-[#a89b84] transition-colors"
              >
                Ana Ekrana Dön
              </button>
            </div>
          </div>
        </div>
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
                onClick={startGame}
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
          onClose={() => {
            setDialogueLord(null);
            setDialogueSettlement(null);
          }}
          onRelationChange={(lordId, delta) =>
            setCampaign((prev) => ({
              ...prev,
              lords: prev.lords.map((l) =>
                l.id === lordId ? { ...l, relation: Math.max(-100, Math.min(100, l.relation + delta)) } : l,
              ),
            }))
          }
          onOpenTrade={() => setIsMarketModalOpen(true)}
        />
      )}

      {isMarketModalOpen && (activeSettlementModal || nearSettlement) && (
        <BannerlordMarketModal
          settlement={activeSettlementModal || nearSettlement}
          campaign={campaign}
          onClose={() => setIsMarketModalOpen(false)}
          onUpdateCampaign={(next) => setCampaign(next)}
          onOpenArenaTest={() => {
            setIsMarketModalOpen(false);
            setViewMode('character_arena');
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

      {/* 10. BANNERLORD LOW-POLY CHARACTER & LORD MORPH STUDIO */}
      {isCharacterCreatorOpen && (
        <CharacterCreatorModal
          initialDNA={campaign.playerMorphDNA}
          characterName={campaign.playerName}
          onSave={(newDNA, newName) => {
            setCampaign((prev) => ({
              ...prev,
              playerMorphDNA: newDNA,
              playerName: newName || prev.playerName,
            }));
          }}
          onClose={() => setIsCharacterCreatorOpen(false)}
        />
      )}
    </main>
  );
}

