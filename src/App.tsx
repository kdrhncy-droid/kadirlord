import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CampaignState,
  LordAgent,
  Settlement,
  TacticalOrder,
  TroopRoster,
  UnitTierId,
  advanceDailyEconomyAndWorld,
  buyFoodAtSettlement,
  createInitialCampaignState,
  getTotalTroops,
  recruitUnit,
  resolveBattleOutcome,
} from './game/rules';
import type {
  BattleTelemetry,
  CameraControlActions,
  MapCameraTelemetry,
} from './game/types';
import { WorldCanvas } from './components/WorldCanvas';
import { GameHud } from './components/GameHud';
import { SettlementModal } from './components/SettlementModal';
import { DiplomacyModal } from './components/DiplomacyModal';
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

  const cameraActionsRef = useRef<CameraControlActions | null>(null);

  // Proximity & Active Modals
  const [nearSettlement, setNearSettlement] = useState<Settlement | null>(null);
  const [nearLord, setNearLord] = useState<LordAgent | null>(null);
  const [activeSettlementModal, setActiveSettlementModal] = useState<Settlement | null>(null);
  const [activeDiplomacyLord, setActiveDiplomacyLord] = useState<LordAgent | null>(null);

  const [mapTelemetry, setMapTelemetry] = useState<MapCameraTelemetry>({
    focusX: -24,
    focusZ: 18,
    zoomDist: 52,
    yawDeg: 0,
    isFollowingPlayer: true,
    biomeLabel: 'İmparatorluk Ovaları',
    partySpeed: 5.4,
    onRoad: true,
    isMoving: false,
    labels: [],
  });

  // Battle State
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
    setOutcomeSnapshot(null);
    setGameState('playing');
    document.body.dataset.state = 'playing';
    cameraActionsRef.current?.focusOnCoords(fresh.playerX, fresh.playerZ, 52);
    cameraActionsRef.current?.focusOnPlayer();
    sound.playWarhorn();
  }, [backgroundChoice]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
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
        }
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
      setNearSettlement(nearestS);
      setNearLord(nearestL);
      setMapTelemetry(camTel);
      setCampaign((prev) => ({ ...prev, playerX: x, playerZ: z }));
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
              category: 'DIPLOMACY',
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
    setSubMode('battle');
  }, []);

  const handleStartSiegeBattle = useCallback((settlement: Settlement) => {
    setActiveSettlementModal(null);
    setActiveDiplomacyLord(null);
    setBattleTargetSettlementId(settlement.id);
    setBattleTargetLordId(null);
    setActiveOrder('CHARGE');
    setSubMode('battle');
  }, []);

  const handleStartQuickBattle = useCallback(() => {
    setActiveSettlementModal(null);
    setActiveDiplomacyLord(null);
    setBattleTargetLordId('lord-kargi');
    setBattleTargetSettlementId(null);
    setActiveOrder('CHARGE');
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
        onUpdatePlayerPos={handleUpdatePlayerPos}
        onOpenSettlement={(s) => setActiveSettlementModal(s)}
        onOpenDiplomacy={(l) => setActiveDiplomacyLord(l)}
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

            <div className="flex items-center gap-4">
              <button
                type="button"
                data-start="true"
                onClick={startGame}
                className="px-7 py-3.5 rounded text-sm font-display font-bold tracking-wider bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/60 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                SEFERİ BAŞLAT [ENTER]
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
          onOpenSettlement={(s) => setActiveSettlementModal(s)}
          onOpenDiplomacy={(l) => setActiveDiplomacyLord(l)}
          onStartQuickBattle={handleStartQuickBattle}
          onRetreatBattle={() => setSubMode('overworld')}
          onAdvanceDay={() => {
            sound.playCoinChime();
            setCampaign((prev) => advanceDailyEconomyAndWorld(prev));
          }}
        />
      )}

      {/* 3. SETTLEMENT & RECRUITMENT MODAL */}
      {gameState === 'playing' && activeSettlementModal && (
        <SettlementModal
          settlement={activeSettlementModal}
          campaign={campaign}
          onClose={() => setActiveSettlementModal(null)}
          onRecruit={handleRecruit}
          onBuyFood={handleBuyFood}
          onStartSiegeBattle={handleStartSiegeBattle}
        />
      )}

      {/* 4. GEMINI LORD DIPLOMACY MODAL */}
      {gameState === 'playing' && activeDiplomacyLord && (
        <DiplomacyModal
          selectedLord={activeDiplomacyLord}
          campaign={campaign}
          onClose={() => setActiveDiplomacyLord(null)}
          onSelectLord={(l) => setActiveDiplomacyLord(l)}
          onApplyDiplomacyResult={handleApplyDiplomacyResult}
          onStartFieldBattle={handleStartFieldBattle}
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
    </main>
  );
}
