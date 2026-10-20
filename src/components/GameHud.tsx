import React, { useState } from 'react';
import {
  AttributeId,
  BannerlordSkillId,
  CampaignState,
  FACTION_INFO,
  LordAgent,
  Settlement,
  TacticalOrder,
  UNIT_DEFINITIONS,
  UnitTierId,
  calculateClanTier,
  calculateDailyWage,
  calculateLearningLimit,
  calculatePartyStrength,
  getTotalTroops,
} from '../game/rules';
import type {
  BattleTelemetry,
  CameraControlActions,
  MapCameraTelemetry,
} from '../game/types';
import { isSettlementLabelVisible } from '../game/mapGen';

interface GameHudProps {
  subMode: 'overworld' | 'battle';
  campaignTimeScale: 0 | 1 | 2 | 4;
  campaign: CampaignState;
  nearSettlement: Settlement | null;
  nearLord: LordAgent | null;
  mapTelemetry: MapCameraTelemetry;
  cameraActionsRef: React.MutableRefObject<CameraControlActions | null>;
  activeOrder: TacticalOrder;
  battleTelemetry: BattleTelemetry;
  muted: boolean;
  onSetTimeScale: (scale: 0 | 1 | 2 | 4) => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSetTacticalOrder: (order: TacticalOrder) => void;
  onOpenSettlement: (s: Settlement) => void;
  onOpenDiplomacy: (l: LordAgent) => void;
  onStartQuickBattle: () => void;
  onRetreatBattle: () => void;
  onAdvanceDay: () => void;
  onAllocateAttribute?: (attrId: AttributeId) => string | null;
  onAllocateFocus?: (skillId: BannerlordSkillId) => string | null;
  onEquipItem?: (itemId: string) => string | null;
  onUpgradeTroop?: (fromTier: UnitTierId, toTier: UnitTierId) => string | null;
  onRecruitPrisoners?: () => string | null;
  onOpenMarketModal?: () => void;
  onOpenCharacterArena?: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  subMode,
  campaignTimeScale,
  campaign,
  nearSettlement,
  nearLord,
  mapTelemetry,
  cameraActionsRef,
  activeOrder,
  battleTelemetry,
  muted,
  onSetTimeScale,
  onToggleMute,
  onPause,
  onRestart,
  onSetTacticalOrder,
  onOpenSettlement,
  onOpenDiplomacy,
  onStartQuickBattle,
  onRetreatBattle,
  onAdvanceDay,
  onAllocateAttribute,
  onAllocateFocus,
  onEquipItem,
  onUpgradeTroop,
  onRecruitPrisoners,
  onOpenMarketModal,
  onOpenCharacterArena,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'none' | 'army' | 'character' | 'inventory' | 'chronicle' | 'atlas'
  >('none');
  const [hudFeedback, setHudFeedback] = useState<string | null>(null);
  const [outfitMode, setOutfitMode] = useState<'BATTLE' | 'CIVILIAN'>('BATTLE');
  const [hoveredLabelId, setHoveredLabelId] = useState<string | null>(null);
  const [councilAdvice, setCouncilAdvice] = useState<string | null>(null);
  const [councilLoading, setCouncilLoading] = useState(false);

  React.useEffect(() => {
    const onKeyH = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'KeyC') {
        setActiveTab((prev) => (prev === 'character' ? 'none' : 'character'));
      } else if (e.code === 'KeyI') {
        if (onOpenMarketModal) {
          onOpenMarketModal();
        } else {
          setActiveTab((prev) => (prev === 'inventory' ? 'none' : 'inventory'));
        }
      }
    };
    window.addEventListener('keydown', onKeyH);
    return () => window.removeEventListener('keydown', onKeyH);
  }, [onOpenMarketModal]);

  const totalTroops = getTotalTroops(campaign.roster);
  const partyStrength = calculatePartyStrength(
    campaign.roster,
    campaign.playerHp / campaign.playerMaxHp,
  );
  const dailyWage = calculateDailyWage(campaign.roster);

  const currentHp = subMode === 'battle' ? battleTelemetry.playerHp : campaign.playerHp;
  const maxHp = subMode === 'battle' ? battleTelemetry.playerMaxHp : campaign.playerMaxHp;
  const hpPercent = Math.max(0, Math.min(100, Math.round((currentHp / maxHp) * 100)));

  const renderVitalityPips = () => {
    const pips = [];
    for (let i = 0; i < 5; i++) {
      const thresholdFull = (i + 1) * 20;
      const thresholdHalf = i * 20 + 8;
      const state =
        hpPercent >= thresholdFull ? 'full' : hpPercent >= thresholdHalf ? 'cracked' : 'empty';
      pips.push(
        <svg
          key={i}
          viewBox="0 0 24 24"
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path
            d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z"
            fill={
              state === 'full'
                ? '#dc2626'
                : state === 'cracked'
                  ? '#b45309'
                  : 'rgba(24, 20, 16, 0.85)'
            }
            stroke="#c6a15b"
            strokeWidth="1.8"
          />
          {state === 'cracked' && (
            <path d="M9 6l4 5-3 4 3 5" stroke="#18130e" strokeWidth="1.8" fill="none" />
          )}
          {state === 'full' && (
            <path
              d="M12 4.5L6.5 6.6v4.2c0 3.4 2.3 6.7 5.5 7.7"
              stroke="#fca5a5"
              strokeWidth="1.2"
              fill="none"
            />
          )}
        </svg>,
      );
    }
    return pips;
  };

  const consultRoyalCouncil = async () => {
    if (councilLoading) return;
    setCouncilLoading(true);
    try {
      const res = await fetch('/api/world-council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: campaign.day,
          season: campaign.season,
          playerFaction: FACTION_INFO.player.name,
          playerRenown: campaign.renown,
          settlementsSummary: campaign.settlements
            .map((s) => `${s.name} (${FACTION_INFO[s.faction].name})`)
            .join(', '),
          recentEvents: campaign.chronicle
            .slice(0, 2)
            .map((c) => c.text)
            .join(' | '),
        }),
      });
      const data = await res.json();
      setCouncilAdvice(`${data.headline}: ${data.decree} — Tavsiye: ${data.strategicAdvice}`);
    } catch (_e) {
      setCouncilAdvice(
        'Divan Baş Vakanüvisi: Sınır kalelerindeki garnizonları takviye edin ve erzak stoklarınızı koruyun.',
      );
    } finally {
      setCouncilLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between p-4">
      {/* 3D WORLD-TO-SCREEN PROJECTED BANNERLORD HERALDIC SETTLEMENT PENNANTS, PARTY BADGES & HOVER TOOLTIP */}
      {subMode === 'overworld' && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-10">
          {mapTelemetry.labels.map((lbl) => {
            if (!lbl.visible) return null;
            const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
            const bottomClearance = activeTab !== 'none' && !dockCollapsed ? 360 : 54;
            if (lbl.screenY < 16 || lbl.screenY > vh - bottomClearance) return null;

            // Hide landmark text at full continental zoom so the 36 settlement banners shine cleanly like Image 1 & 4
            if (lbl.kind === 'landmark') {
              if (mapTelemetry.zoomDist > 180) return null;
              return (
                <div
                  key={lbl.id}
                  style={{
                    transform: `translate3d(${lbl.screenX}px, ${lbl.screenY}px, 0) translate(-50%, -50%)`,
                  }}
                  className="absolute top-0 left-0 pointer-events-none text-center select-none"
                >
                  <div className="text-[11px] font-display font-bold tracking-[0.22em] uppercase text-[#fde68a]/80 hud-stroke whitespace-nowrap">
                    {lbl.name}
                  </div>
                </div>
              );
            }

            // 1. PARTY TROOP NUMBER BADGE (Like "24" in Image 2!)
            if (lbl.kind === 'lord' || lbl.kind === 'player_party') {
              // At extreme continental zoom (> 260m), keep only player party badge visible so 36 settlement banners have zero clutter (like Image 1 & 4!)
              if (mapTelemetry.zoomDist > 260 && lbl.kind === 'lord') return null;
              return (
                <button
                  key={lbl.id}
                  type="button"
                  data-testid={`map-label-${lbl.id}`}
                  onMouseEnter={() => setHoveredLabelId(lbl.id)}
                  onMouseLeave={() =>
                    setHoveredLabelId((prev) => (prev === lbl.id ? null : prev))
                  }
                  onClick={() => {
                    cameraActionsRef.current?.commandMarchTo(lbl.worldX, lbl.worldZ);
                  }}
                  onDoubleClick={() => {
                    cameraActionsRef.current?.focusOnCoords(lbl.worldX, lbl.worldZ, 36);
                  }}
                  style={{
                    transform: `translate3d(${lbl.screenX}px, ${lbl.screenY}px, 0) translate(-50%, -50%)`,
                  }}
                  className="absolute top-0 left-0 pointer-events-auto flex items-center gap-1 group cursor-pointer hover:scale-110 transition-transform whitespace-nowrap"
                >
                  {/* Heraldic Mini-Shield Crest */}
                  <span
                    style={{
                      backgroundColor: lbl.color,
                      clipPath: 'polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%)',
                    }}
                    className="w-4 h-5 flex items-center justify-center border border-[#fcd34d]/85 shadow-md shrink-0"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#fde68a]" />
                  </span>
                  {/* Crisp Outlined Bannerlord Troop Count Numeral */}
                  <span className="font-display font-extrabold text-[14px] text-[#86efac] hud-stroke tracking-tight">
                    {lbl.troopCount ?? lbl.sublabel}
                  </span>
                </button>
              );
            }

            // 2. SETTLEMENT HERALDIC SHIELD + SMOKY TRANSLUCENT PENNANT BANNER (Towns, Castles, Villages from Image 4!)
            const isContinentalZoom = mapTelemetry.zoomDist > 220;
            const isCastle = lbl.settlementType === 'CASTLE';

            // Hide villages at mid zoom and castles at maximum/continental zoom so only Town (city) names are visible at max distance
            if (!isSettlementLabelVisible(lbl.settlementType ?? 'TOWN', mapTelemetry.zoomDist)) {
              return null;
            }

            return (
              <div
                key={lbl.id}
                style={{
                  transform: `translate3d(${lbl.screenX}px, ${lbl.screenY}px, 0) translate(-50%, -100%)`,
                }}
                className="absolute top-0 left-0 pointer-events-auto flex flex-col items-center"
              >
                <button
                  type="button"
                  data-testid={`map-label-${lbl.id}`}
                  onMouseEnter={() => setHoveredLabelId(lbl.id)}
                  onMouseLeave={() =>
                    setHoveredLabelId((prev) => (prev === lbl.id ? null : prev))
                  }
                  onClick={() => {
                    cameraActionsRef.current?.commandMarchTo(lbl.worldX, lbl.worldZ);
                  }}
                  onDoubleClick={() => {
                    cameraActionsRef.current?.focusOnCoords(lbl.worldX, lbl.worldZ, 38);
                  }}
                  className="flex items-center group cursor-pointer hover:scale-105 transition-transform whitespace-nowrap drop-shadow-md"
                >
                  {/* Left Heraldic Kingdom Shield */}
                  <div
                    style={{
                      backgroundColor: lbl.color,
                      clipPath: 'polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%)',
                    }}
                    className={`${
                      isContinentalZoom
                        ? isCastle
                          ? 'w-4 h-4.5'
                          : 'w-5 h-6'
                        : 'w-6 h-7'
                    } flex items-center justify-center border border-[#d4af37] z-10 shrink-0 shadow`}
                  >
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#fde68a]">
                      {lbl.settlementType === 'TOWN' ? (
                        <path d="M8 1.5L9.8 5.2H13.8L10.6 7.8L11.8 12.2L8 9.5L4.2 12.2L5.4 7.8L2.2 5.2H6.2L8 1.5Z" />
                      ) : lbl.settlementType === 'CASTLE' ? (
                        <path d="M3 2H5V4H7V2H9V4H11V2H13V14H3V2Z" />
                      ) : (
                        <path d="M8 2L14 7V14H2V7L8 2Z" />
                      )}
                    </svg>
                  </div>

                  {/* Right Smoky Translucent Pointed Pennant Ribbon */}
                  <div
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(24, 22, 19, 0.82) 0%, rgba(34, 31, 27, 0.70) 84%, rgba(34, 31, 27, 0.25) 100%)',
                      clipPath: 'polygon(0% 0%, 89% 0%, 100% 50%, 89% 100%, 0% 100%)',
                    }}
                    className={`-ml-1 pl-2 pr-3 ${
                      isContinentalZoom ? 'py-0' : 'py-0.5'
                    } border-y border-[#c6a15b]/35 flex items-center gap-1`}
                  >
                    <span
                      className={`font-display font-semibold ${
                        isContinentalZoom
                          ? isCastle
                            ? 'text-[10px] text-[#e5dccb]'
                            : 'text-[11px] text-[#fff8eb]'
                          : 'text-[12px] text-[#f5efe2]'
                      } tracking-wide hud-stroke`}
                    >
                      {lbl.name}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}

          {/* AUTHENTIC BANNERLORD DARK-GREEN/GOLD VERTICAL HOVER INSPECTION CARD (Like "Smith's Party" in Image 2 & 3!) */}
          {(() => {
            const inspected =
              mapTelemetry.labels.find((l) => l.id === hoveredLabelId && l.visible) || null;
            if (!inspected) return null;
            const cardX = Math.min(
              (typeof window !== 'undefined' ? window.innerWidth : 1440) - 210,
              Math.max(24, inspected.screenX),
            );
            const cardY = Math.max(92, inspected.screenY - 12);
            return (
              <div
                style={{
                  transform: `translate3d(${cardX}px, ${cardY}px, 0) translate(-50%, -100%)`,
                  background:
                    'linear-gradient(180deg, rgba(16, 26, 18, 0.95) 0%, rgba(12, 18, 13, 0.96) 100%)',
                }}
                className="absolute top-0 left-0 z-30 w-48 rounded-xs border border-[#c6a15b]/60 border-t-2 border-t-[#f59e0b] px-3 py-2.5 text-center shadow-2xl pointer-events-none"
              >
                <div className="font-display font-bold text-xs text-[#fbbf24] border-b border-[#c6a15b]/30 pb-1 mb-1.5">
                  {inspected.name}
                </div>
                <div className="text-[10px] text-[#a3b19b] uppercase tracking-wider">Hükümdar</div>
                <div className="text-[11px] font-semibold text-[#f3ead8] mb-1">
                  {inspected.ownerName}
                </div>
                <div className="text-[10px] text-[#a3b19b]">
                  Krallık:{' '}
                  <span className="font-semibold text-[#fde68a]">{inspected.factionName}</span>
                </div>

                <div className="my-1.5 border-t border-[#c6a15b]/25 pt-1 text-[10px] text-[#c6a15b] font-semibold">
                  Sefer Bilgisi
                </div>
                {inspected.speed !== undefined ? (
                  <div className="text-[11px] font-mono-tabular text-[#e2e8f0]">
                    Harita Hızı: {inspected.speed}
                  </div>
                ) : (
                  <div className="text-[11px] font-mono-tabular text-[#e2e8f0]">
                    Refah: {inspected.prosperity}
                  </div>
                )}

                <div className="my-1.5 border-t border-[#c6a15b]/25 pt-1 text-[10px] text-[#c6a15b] font-semibold">
                  Birlikler ({inspected.troopCount}
                  {inspected.woundedCount ? `+${inspected.woundedCount}y` : ''})
                </div>
                <div className="text-[10px] font-mono-tabular text-[#d1d5db] space-y-0.5">
                  <div>Piyade: {inspected.infantry ?? 10}</div>
                  <div>Menzilli: {inspected.ranged ?? 6}</div>
                  <div>Süvari: {inspected.cavalry ?? 4}</div>
                </div>

                {inspected.prisoners !== undefined && (
                  <div className="mt-1.5 pt-1 border-t border-[#c6a15b]/20 text-[10px] text-[#9ca3af]">
                    Esirler ({inspected.prisoners})
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* TOP ROW: Uncluttered on Overworld (only compact right camera/utility pill); Full Battle Counter in Battle Mode */}
      <div className="relative z-20 flex items-start justify-between gap-2">
        {subMode === 'battle' ? (
          <>
            <div className="hud-panel rounded-lg px-3.5 py-2 pointer-events-auto flex items-center gap-3 whitespace-nowrap">
              <div className="flex items-center gap-2.5">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-[#c6a15b] font-semibold">
                    {campaign.playerName}
                  </span>
                  <div className="flex items-center gap-1 mt-1">{renderVitalityPips()}</div>
                </div>
                <div className="font-mono-tabular text-lg font-bold text-[#f8f0df] hud-stroke">
                  {Math.round(currentHp)}
                  <span className="text-xs text-[#a89b84] font-normal ml-0.5">/{maxHp} HP</span>
                </div>
              </div>
              <div className="h-7 w-px bg-[#c6a15b]/25" />
              <div>
                <span className="text-[10px] uppercase tracking-wider text-[#a89b84] block">
                  Sancak Ordusu
                </span>
                <span className="text-base font-bold font-mono-tabular text-[#f3ead8]">
                  {battleTelemetry.alliesAlive}
                  <span className="text-xs font-normal text-[#c6a15b] ml-1">
                    Asker ({partyStrength})
                  </span>
                </span>
              </div>
            </div>

            <div className="hud-panel rounded-lg px-5 py-2.5 pointer-events-auto flex items-center gap-6 whitespace-nowrap">
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-[#6ee7b7] block">
                  Sancak Kuvvetleri
                </span>
                <span className="text-xl font-bold font-mono-tabular text-[#34d399]">
                  {battleTelemetry.alliesAlive} / {battleTelemetry.alliesTotal}
                </span>
              </div>

              <div className="text-center px-2">
                <span className="text-xs font-display font-bold text-[#fbbf24] block">
                  MEYDAN SAVAŞI
                </span>
                <span className="text-[11px] text-[#d1c5b0]">
                  Emir:{' '}
                  {activeOrder === 'CHARGE'
                    ? 'Hücum'
                    : activeOrder === 'SHIELD_WALL'
                      ? 'Kalkan Duvarı'
                      : activeOrder === 'FOLLOW_ME'
                        ? 'Takip Et'
                        : 'Ok Yağmuru'}
                </span>
              </div>

              <div className="text-left">
                <span className="text-[10px] uppercase tracking-wider text-[#fca5a5] block">
                  {battleTelemetry.enemyCommanderName}
                </span>
                <span className="text-xl font-bold font-mono-tabular text-[#f87171]">
                  {battleTelemetry.enemiesAlive} / {battleTelemetry.enemiesTotal}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div />
        )}

        {/* Top-Right Compact Camera & Utility Controls */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {subMode === 'overworld' && (
            <div className="hud-panel-subtle rounded px-2 py-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  cameraActionsRef.current?.focusOnPlayer();
                  cameraActionsRef.current?.adjustZoom(-800);
                  cameraActionsRef.current?.adjustZoom(32);
                }}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                  mapTelemetry.isFollowingPlayer
                    ? 'bg-[#b45309] text-white'
                    : 'bg-[#1c1914] text-[#e2d6c1] hover:bg-[#2b261e]'
                }`}
              >
                Sancak [C]
              </button>
              <button
                type="button"
                onClick={() => cameraActionsRef.current?.focusOnCoords(-75, -8, 860)}
                className="px-2 py-1 rounded text-xs font-semibold bg-[#1c1914] text-[#fde68a] hover:bg-[#2b261e] border border-[#c6a15b]/35"
              >
                Tam Kıta [V]
              </button>
            </div>
          )}

          {onOpenCharacterArena && (
            <button
              type="button"
              onClick={onOpenCharacterArena}
              className="px-3 py-1.5 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-[#fca5a5]/40 shadow flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>⚔️</span>
              <span>Savaş & Karakter Arenası</span>
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Sesi Aç [M]' : 'Sesi Kapat [M]'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="hud-panel-subtle w-9 h-9 rounded flex items-center justify-center text-[#f3ead8] hover:border-[#fbbf24] transition-colors"
          >
            {muted ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Oyunu Duraklat [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="hud-panel-subtle w-9 h-9 rounded flex items-center justify-center text-[#f3ead8] hover:border-[#fbbf24] transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Seferi Yeniden Başlat [R]"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="hud-panel-subtle w-9 h-9 rounded flex items-center justify-center text-[#f3ead8] hover:border-[#fbbf24] transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      {/* BOTTOM DOCK & BANNERLORD CAMPAIGN TIME CONTROLS */}
      <div className="relative z-20 flex flex-col items-center gap-2.5">
        {/* Proximity Action Prompt when near a Castle/Town or Lord on the Overworld */}
        {subMode === 'overworld' && (nearSettlement || nearLord) && (
          <div className="hud-panel rounded-lg px-4 py-2 pointer-events-auto flex items-center gap-4">
            {nearSettlement && (
              <>
                <div className="text-xs">
                  <span className="text-[#c6a15b] font-semibold block">
                    Kapıdasınız: {nearSettlement.name}
                  </span>
                  <span className="text-[#d1c5b0]">
                    {FACTION_INFO[nearSettlement.faction].name} · Garnizon {nearSettlement.garrison}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSettlement(nearSettlement)}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white whitespace-nowrap shrink-0"
                >
                  Yerleşime Gir
                </button>
              </>
            )}

            {nearLord && (
              <>
                <div className="text-xs">
                  <span className="text-[#c6a15b] font-semibold block">
                    Karşılaşılan Sancak: {nearLord.title} {nearLord.name}
                  </span>
                  <span className="text-[#d1c5b0]">
                    {FACTION_INFO[nearLord.faction].name} · {nearLord.armySize} Asker
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenDiplomacy(nearLord)}
                  className="px-3 py-1.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white whitespace-nowrap shrink-0"
                >
                  Elçi Gönder / Görüş
                </button>
              </>
            )}
          </div>
        )}

        {/* Continental Map Atlas & Camera Jump Drawer */}
        {subMode === 'overworld' && activeTab === 'atlas' && !dockCollapsed && (
          <div className="hud-panel rounded-lg p-4 w-full max-w-4xl pointer-events-auto">
            <div className="flex items-center justify-between border-b border-[#c6a15b]/25 pb-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#f8f0df]">
                  Kalradya Kıta Atlası ve Stratejik Kamera Rehberi
                </h3>
                <p className="text-xs text-[#b5a890]">
                  WASD: Harita Kamerasını Kaydır · Q/E veya Sağ Tık Sürükle: Kamerayı Döndür · Fare Tekerleği (Z/X): Stratejik Yakınlaştır/Uzaklaştır · Sol Tık: Ordunu Yürüt
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('none')}
                className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
              >
                Kapat
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {campaign.settlements.map((s) => (
                <div
                  key={s.id}
                  className="p-2.5 rounded bg-[#181510] border border-[#c6a15b]/25 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-[#f8f0df]">{s.name}</div>
                    <div className="text-[11px] text-[#c6a15b]">
                      {FACTION_INFO[s.faction].name} · Garnizon {s.garrison}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        cameraActionsRef.current?.focusOnCoords(s.x, s.z, 38);
                      }}
                      className="flex-1 px-2 py-1 rounded text-[11px] font-semibold bg-[#26211a] hover:bg-[#362f25] text-[#e2d6c1] whitespace-nowrap"
                    >
                      Kamerayı Odakla
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        cameraActionsRef.current?.commandMarchTo(s.x, s.z + 2.2, {
                          type: 'settlement',
                          id: s.id,
                        });
                        setActiveTab('none');
                      }}
                      className="flex-1 px-2 py-1 rounded text-[11px] font-semibold bg-[#b45309] hover:bg-[#d97706] text-white whitespace-nowrap"
                    >
                      Sefer Yürüt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expandable Army Drawer (With Troop Upgrades, Prisoner Recruitment & 4 Clan Roles) */}
        {subMode === 'overworld' && activeTab === 'army' && !dockCollapsed && (
          <div className="hud-panel rounded-lg p-4 w-full max-w-4xl pointer-events-auto max-h-[68vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#c6a15b]/25 pb-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#f8f0df]">
                  Sancak Ordusu, Terfi Ağacı ve 4 Klan Rolü (Günlük Maaş: {dailyWage} Dinar · Esir: {campaign.prisoners})
                </h3>
                <p className="text-xs text-[#b5a890]">
                  Birliklerinizi üst kademeye terfi ettirin, savaş esirlerini sancağınıza katın veya yerleşimlere hızla erişin.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {campaign.prisoners > 0 && onRecruitPrisoners && (
                  <button
                    type="button"
                    onClick={() => {
                      const err = onRecruitPrisoners();
                      setHudFeedback(
                        err || '⛓️ 1 Savaş Esiri ikna edilerek sancağımıza Milis Piyade olarak katıldı!',
                      );
                    }}
                    className="px-2.5 py-1 rounded text-xs font-bold bg-[#15803d] hover:bg-[#16a34a] text-white whitespace-nowrap"
                  >
                    ⛓️ Esir Devşir ({campaign.prisoners})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('none')}
                  className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
                >
                  Kapat
                </button>
              </div>
            </div>

            {hudFeedback && (
              <div className="mb-3 px-3 py-1.5 rounded bg-[#262015] border border-[#f59e0b]/40 text-xs text-[#fde68a]">
                {hudFeedback}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.values(UNIT_DEFINITIONS).map((u) => {
                const nextTier: UnitTierId | null =
                  u.id === 'militia'
                    ? 'archer'
                    : u.id === 'archer'
                      ? 'cavalry'
                      : u.id === 'cavalry'
                        ? 'guard'
                        : null;
                return (
                  <div
                    key={u.id}
                    className="p-2.5 rounded bg-[#181510] border border-[#c6a15b]/20 text-xs flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-[#f8f0df]">{u.name}</div>
                      <div className="text-[11px] text-[#a89b84]">{u.role}</div>
                      <div className="mt-1.5 font-mono-tabular text-sm font-bold text-[#fbbf24]">
                        {campaign.roster[u.id]} Birlik
                      </div>
                    </div>
                    {nextTier && onUpgradeTroop && (
                      <button
                        type="button"
                        disabled={campaign.roster[u.id] <= 0}
                        onClick={() => {
                          const err = onUpgradeTroop(u.id, nextTier);
                          setHudFeedback(
                            err ||
                              `🎖️ 1 ${u.name} üst kademeye (${UNIT_DEFINITIONS[nextTier].name}) terfi ettirildi!`,
                          );
                        }}
                        className="w-full py-1 rounded text-[11px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-35 transition-colors"
                      >
                        + Terfi: {UNIT_DEFINITIONS[nextTier].name.split(' ')[0]}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 4 Clan Party Roles */}
            <div className="mt-3 pt-2.5 border-t border-[#c6a15b]/20 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">📦 İaşe Subayı (Steward)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.QUARTERMASTER ?? 'Komutan Demirhan (+45 Kapasite)'}
                </span>
              </div>
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">🧭 İzci (Scout)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.SCOUT ?? 'İzci Aybars (+%12 Görüş & Hız)'}
                </span>
              </div>
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">⚕️ Cerrah (Surgeon)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.SURGEON ?? 'Hekim Helena (+%25 Yaralı Kurtarma)'}
                </span>
              </div>
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">⚙️ Mühendis (Engineer)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.ENGINEER ?? 'Mimar Торвальд (+%30 Kuşatma İnşası)'}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#c6a15b]/20 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {campaign.settlements.slice(0, 16).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenSettlement(s)}
                    className="px-2.5 py-1 rounded text-xs bg-[#241f18] hover:bg-[#332c22] text-[#e2d6c1] border border-[#c6a15b]/30 whitespace-nowrap shrink-0"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onAdvanceDay}
                className="px-3 py-1 rounded text-xs font-semibold bg-[#1e293b] hover:bg-[#334155] text-[#93c5fd] whitespace-nowrap shrink-0"
              >
                Kamp Kur & Günü İlerlet (+1 Gün)
              </button>
            </div>
          </div>
        )}

        {/* Expandable Character Sheet Drawer (6 Attributes & 18 Skills) */}
        {subMode === 'overworld' && activeTab === 'character' && !dockCollapsed && (
          <div className="hud-panel rounded-lg p-4 w-full max-w-5xl pointer-events-auto max-h-[70vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between border-b border-[#c6a15b]/25 pb-2 mb-3 gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#fef08a]">
                  🛡️ Karakter Ekranı: {campaign.playerName} · Seviye {campaign.characterLevel ?? 6} ·{' '}
                  {calculateClanTier(campaign.renown).title}
                </h3>
                <p className="text-xs text-[#b5a890]">
                  Serbest Nitelik Puanı:{' '}
                  <strong className="text-[#34d399]">{campaign.freeAttributePoints ?? 0}</strong> ·
                  Serbest Odak Puanı (Focus):{' '}
                  <strong className="text-[#fbbf24]">{campaign.freeFocusPoints ?? 0}</strong> · Klan
                  Kapasite Bonusu: +{calculateClanTier(campaign.renown).maxPartyBonus} Asker
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('none')}
                className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
              >
                Kapat [C]
              </button>
            </div>

            {hudFeedback && (
              <div className="mb-3 px-3 py-1.5 rounded bg-[#262015] border border-[#f59e0b]/40 text-xs text-[#fde68a]">
                {hudFeedback}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {(
                [
                  {
                    attrId: 'VIGOR',
                    name: 'DİNÇLİK (VIGOR)',
                    skills: [
                      { id: 'oneHanded', label: 'Tek Elli Silahlar' },
                      { id: 'twoHanded', label: 'Çift Elli Silahlar' },
                      { id: 'polearm', label: 'Gönderli Silahlar' },
                    ],
                  },
                  {
                    attrId: 'CONTROL',
                    name: 'KONTROL (CONTROL)',
                    skills: [
                      { id: 'bow', label: 'Yay (Bow)' },
                      { id: 'crossbow', label: 'Arbalet (Crossbow)' },
                      { id: 'throwing', label: 'Fırlatma (Throwing)' },
                    ],
                  },
                  {
                    attrId: 'ENDURANCE',
                    name: 'DAYANIKLILIK (ENDURANCE)',
                    skills: [
                      { id: 'riding', label: 'Binicilik (Riding)' },
                      { id: 'athletics', label: 'Atletizm (Athletics)' },
                      { id: 'smithing', label: 'Demircilik (Smithing)' },
                    ],
                  },
                  {
                    attrId: 'CUNNING',
                    name: 'KURNAZLIK (CUNNING)',
                    skills: [
                      { id: 'scouting', label: 'İzcilik (Scouting)' },
                      { id: 'tactics', label: 'Taktik (Tactics)' },
                      { id: 'roguery', label: 'Serserilik (Roguery)' },
                    ],
                  },
                  {
                    attrId: 'SOCIAL',
                    name: 'SOSYALLİK (SOCIAL)',
                    skills: [
                      { id: 'charm', label: 'Cazibe (Charm)' },
                      { id: 'leadership', label: 'Liderlik (Leadership)' },
                      { id: 'trade', label: 'Ticaret (Trade)' },
                    ],
                  },
                  {
                    attrId: 'INTELLIGENCE',
                    name: 'ZEKA (INTELLIGENCE)',
                    skills: [
                      { id: 'steward', label: 'İdarecilik (Steward)' },
                      { id: 'medicine', label: 'Hekimlik (Medicine)' },
                      { id: 'engineering', label: 'Mühendislik (Engineering)' },
                    ],
                  },
                ] as Array<{
                  attrId: AttributeId;
                  name: string;
                  skills: Array<{ id: BannerlordSkillId; label: string }>;
                }>
              ).map((group) => {
                const attrVal = campaign.attributes?.[group.attrId] ?? 4;
                return (
                  <div
                    key={group.attrId}
                    className="p-3 rounded bg-[#181510] border border-[#c6a15b]/25 space-y-2"
                  >
                    <div className="flex items-center justify-between border-b border-[#c6a15b]/20 pb-1.5">
                      <span className="font-bold text-[#fef08a]">
                        {group.name}: <span className="text-[#34d399] font-mono">{attrVal}</span>
                      </span>
                      <button
                        type="button"
                        disabled={(campaign.freeAttributePoints ?? 0) <= 0 || attrVal >= 10}
                        onClick={() => {
                          if (!onAllocateAttribute) return;
                          const err = onAllocateAttribute(group.attrId);
                          setHudFeedback(
                            err || `✨ ${group.name} niteliği +1 artırıldı!`,
                          );
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#15803d] hover:bg-[#16a34a] text-white disabled:opacity-35"
                      >
                        + Nitelik Ver
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {group.skills.map((sk) => {
                        const skData = campaign.skills?.[sk.id] ?? { level: 60, focus: 2 };
                        const limit = calculateLearningLimit(attrVal, skData.focus);
                        return (
                          <div
                            key={sk.id}
                            className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/15 flex flex-col justify-between gap-1"
                          >
                            <div>
                              <div className="font-semibold text-[#f8f0df] text-[11px]">
                                {sk.label}
                              </div>
                              <div className="font-mono-tabular text-[#fbbf24] font-bold">
                                Sv. {skData.level}{' '}
                                <span className="text-[10px] text-[#94a3b8]">/ Sınır {limit}</span>
                              </div>
                              <div className="text-[10px] text-[#34d399] tracking-widest">
                                {'●'.repeat(skData.focus)}
                                {'○'.repeat(Math.max(0, 5 - skData.focus))}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={(campaign.freeFocusPoints ?? 0) <= 0 || skData.focus >= 5}
                              onClick={() => {
                                if (!onAllocateFocus) return;
                                const err = onAllocateFocus(sk.id);
                                setHudFeedback(
                                  err || `🔥 ${sk.label} becerisine +1 Odak Puanı (Focus) verildi!`,
                                );
                              }}
                              className="w-full py-0.5 rounded text-[10px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-35"
                            >
                              + Odak ({skData.focus}/5)
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Expandable Inventory & 12-Slot Equipment Drawer */}
        {subMode === 'overworld' && activeTab === 'inventory' && !dockCollapsed && (
          <div className="hud-panel rounded-lg p-4 w-full max-w-5xl pointer-events-auto max-h-[70vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between border-b border-[#c6a15b]/25 pb-2 mb-3 gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#fef08a]">
                  🎒 Envanter ve 12 Ekipman Slotu ({outfitMode === 'BATTLE' ? '⚔️ Savaş Donanımı' : '👘 Sivil Kıyafet Seti'})
                </h3>
                <p className="text-xs text-[#b5a890]">
                  Taşıma Kapasitesi: 138 / {totalTroops * 10 + 300} kg · Hazine: {campaign.gold} Dinar
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onOpenMarketModal && (
                  <button
                    type="button"
                    onClick={onOpenMarketModal}
                    className="px-3 py-1 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#f59e0b]/40 flex items-center gap-1.5 shadow"
                  >
                    <span>⚖️</span>
                    <span>Bannerlord Ticaret & Envanter Pazarı</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setOutfitMode((prev) => (prev === 'BATTLE' ? 'CIVILIAN' : 'BATTLE'))
                  }
                  className="px-2.5 py-1 rounded text-xs font-bold bg-[#26211a] hover:bg-[#362f25] text-[#fde68a] border border-[#c6a15b]/40"
                >
                  {outfitMode === 'BATTLE' ? '👘 Sivil Sete Geç' : '⚔️ Savaş Setine Geç'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('none')}
                  className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
                >
                  Kapat [I]
                </button>
              </div>
            </div>

            {hudFeedback && (
              <div className="mb-3 px-3 py-1.5 rounded bg-[#262015] border border-[#f59e0b]/40 text-xs text-[#fde68a]">
                {hudFeedback}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
              {/* Left & Center: 12 Equipped Slots */}
              <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(
                  [
                    { slot: 'HEAD', label: '🪖 Başlık (Head)' },
                    { slot: 'SHOULDER', label: '🧣 Omuzluk (Shoulder)' },
                    { slot: 'BODY', label: '🥋 Gövde Zırhı (Body)' },
                    { slot: 'GLOVES', label: '🧤 Eldiven (Gloves)' },
                    { slot: 'LEG', label: '👢 Çizme (Leg)' },
                    { slot: 'MOUNT', label: '🐎 Savaş Atı (Mount)' },
                    { slot: 'HARNESS', label: '🛡️ At Zırhı (Harness)' },
                    { slot: 'BANNER', label: '🦅 Sancak (Banner)' },
                    { slot: 'WEAPON1', label: '🗡️ Silah Slotu I' },
                    { slot: 'WEAPON2', label: '🛡️ Silah Slotu II' },
                    { slot: 'WEAPON3', label: '🔱 Silah Slotu III' },
                    { slot: 'WEAPON4', label: '🏹 Silah Slotu IV' },
                  ] as const
                ).map((eq) => (
                  <div
                    key={eq.slot}
                    className="p-2.5 rounded bg-[#181510] border border-[#c6a15b]/30"
                  >
                    <div className="text-[10px] text-[#c6a15b] font-bold">{eq.label}</div>
                    <div className="text-[#f8f0df] font-semibold mt-0.5 leading-snug">
                      {campaign.equipment?.[eq.slot] ?? 'Standart Donanım'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Bag & Loot Items */}
              <div className="p-3 rounded bg-[#14110d] border border-[#c6a15b]/25 space-y-2">
                <div className="font-bold text-[#fef08a] border-b border-[#c6a15b]/20 pb-1">
                  Envanter Çantası & Yedek Ganimetler
                </div>
                {(campaign.inventoryItems ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="p-2 rounded bg-[#1c1812] border border-[#c6a15b]/20 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-[#f8f0df]">{item.name}</div>
                      <div className="text-[10px] text-[#34d399]">{item.statBonus}</div>
                      <div className="text-[10px] text-[#a89b84]">
                        Değer: {item.value} D · Ağırlık: {item.weight} kg
                      </div>
                    </div>
                    {item.slot !== 'TRADE' && onEquipItem && (
                      <button
                        type="button"
                        onClick={() => {
                          const err = onEquipItem(item.id);
                          setHudFeedback(
                            err || `🛡️ "${item.name}" kuşanıldı!`,
                          );
                        }}
                        className="px-2.5 py-1 rounded text-[11px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white shrink-0"
                      >
                        Kuşan
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {subMode === 'overworld' && activeTab === 'chronicle' && !dockCollapsed && (
          <div className="hud-panel rounded-lg p-4 w-full max-w-4xl pointer-events-auto">
            <div className="flex items-center justify-between border-b border-[#c6a15b]/25 pb-2 mb-3">
              <h3 className="text-sm font-bold text-[#f8f0df]">
                Kalradya Vakanüvis Günlüğü ve Krallık Divanı
              </h3>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={councilLoading}
                  onClick={consultRoyalCouncil}
                  className="px-3 py-1 rounded text-xs font-semibold bg-[#b45309] hover:bg-[#d97706] text-white whitespace-nowrap shrink-0"
                >
                  {councilLoading ? 'Divan Toplanıyor...' : 'Gemini Divan Raporu Al'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('none')}
                  className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
                >
                  Kapat
                </button>
              </div>
            </div>

            {councilAdvice && (
              <div className="mb-3 p-2.5 rounded bg-[#262015] border border-[#f59e0b]/40 text-xs text-[#fde68a]">
                {councilAdvice}
              </div>
            )}

            <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs">
              {campaign.chronicle.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 py-1 border-b border-[#c6a15b]/10 text-[#e2d6c1]"
                >
                  <span className="font-mono-tabular text-[#c6a15b] shrink-0">
                    Gün {ev.day}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{ev.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AUTHENTIC BANNERLORD 3-PIECE BOTTOM RIM HUD (Matching bottom of Image 2, 3, and 4!) */}
        <div className="w-full pointer-events-none flex flex-col items-center">
          {subMode === 'overworld' &&
            (mapTelemetry.followingLordName || mapTelemetry.targetSettlementName) && (
              <div
                data-testid="active-march-banner"
                className="mb-1 px-3 py-0.5 rounded-full bg-[#181510]/90 border border-[#f59e0b]/60 text-[11px] font-semibold text-[#fde68a] shadow-lg"
              >
                {mapTelemetry.followingLordName
                  ? `Kesintisiz Takip: ${mapTelemetry.followingLordName} (Görüş Menzilinde)`
                  : `Sefer Hedefi: ${mapTelemetry.targetSettlementName} (Varışta Otomatik Giriş)`}
              </div>
            )}

          {subMode === 'overworld' && campaignTimeScale === 0 && (
            <div className="mb-1 font-display font-extrabold text-base tracking-[0.18em] text-[#f8f0df] hud-stroke uppercase select-none">
              PAUSED
            </div>
          )}

          {!dockCollapsed && (
            <div className="w-full flex items-end justify-between gap-2 pointer-events-auto">
              {subMode === 'overworld' ? (
                <>
                  {/* 1. Bottom-Left: Clean Bannerlord Bronze-Gold Menu Rim */}
                  <div className="hud-panel rounded-t-xl rounded-bl-lg px-3 py-2 flex items-center gap-1.5 border-t-2 border-t-[#c6a15b]">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTab(activeTab === 'character' ? 'none' : 'character')
                      }
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                        activeTab === 'character'
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#1c1914] text-[#e2d6c1] hover:bg-[#2b261e]'
                      }`}
                    >
                      Karakter [C]
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenMarketModal) {
                          onOpenMarketModal();
                        } else {
                          setActiveTab(activeTab === 'inventory' ? 'none' : 'inventory');
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                        activeTab === 'inventory'
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#1c1914] text-[#e2d6c1] hover:bg-[#2b261e]'
                      }`}
                    >
                      Envanter & Pazar [I]
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab(activeTab === 'army' ? 'none' : 'army')}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                        activeTab === 'army'
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#1c1914] text-[#e2d6c1] hover:bg-[#2b261e]'
                      }`}
                    >
                      Ordum ({totalTroops})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab(activeTab === 'atlas' ? 'none' : 'atlas')}
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                        activeTab === 'atlas'
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#1c1914] text-[#e2d6c1] hover:bg-[#2b261e]'
                      }`}
                    >
                      Kıta Atlası ({campaign.settlements.length})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTab(activeTab === 'chronicle' ? 'none' : 'chronicle')
                      }
                      className={`px-2.5 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                        activeTab === 'chronicle'
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#1c1914] text-[#e2d6c1] hover:bg-[#2b261e]'
                      }`}
                    >
                      Vakanüvis
                    </button>
                    {onOpenCharacterArena && (
                      <button
                        type="button"
                        onClick={onOpenCharacterArena}
                        className="px-3 py-1.5 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-[#f87171]/40 transition-colors whitespace-nowrap flex items-center gap-1 shadow"
                      >
                        <span>⚔️</span>
                        <span>Karakter & Savaş Arenası</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onStartQuickBattle}
                      className="px-3 py-1.5 rounded text-xs font-bold bg-[#7f1d1d] hover:bg-[#991b1b] text-white border border-[#f87171]/40 transition-colors whitespace-nowrap"
                    >
                      Meydan Savaşı
                    </button>
                  </div>

                  {/* 2. Bottom-Center: Authentic Bannerlord Circular Sun/Moon Medallion Dial (Like Image 2, 3, 4!) */}
                  <div className="hud-panel rounded-t-3xl px-5 py-1.5 flex items-center gap-3 border-t-2 border-t-[#d4af37] shadow-2xl">
                    <span className="font-display text-xs text-[#e2d6c1] whitespace-nowrap">
                      {campaign.season} {campaign.day}, 1084
                    </span>

                    {/* Circular Celestial Sun/Moon Medallion */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-b from-[#1e3a8a] via-[#172554] to-[#0f172a] border-2 border-[#d4af37] flex items-center justify-center shadow-inner shrink-0">
                      <div className="w-4 h-4 rounded-full bg-[#fbbf24] shadow-[0_0_8px_#f59e0b]" />
                    </div>

                    <div className="flex items-center gap-1 font-mono-tabular">
                      {(
                        [
                          { scale: 0, label: '||' },
                          { scale: 1, label: '▶' },
                          { scale: 2, label: '▶▶' },
                          { scale: 4, label: '▶▶▶' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.scale}
                          type="button"
                          onClick={() => onSetTimeScale(t.scale)}
                          className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                            campaignTimeScale === t.scale
                              ? 'bg-[#b45309] text-white'
                              : 'text-[#c6a15b] hover:text-[#f8f0df]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Bottom-Right: Bannerlord 2-Row Compact Status Rim (Like Image 2, 3, 4!) */}
                  <div className="hud-panel rounded-t-xl rounded-br-lg px-4 py-1.5 border-t-2 border-t-[#c6a15b] font-mono-tabular text-xs flex flex-col gap-0.5 whitespace-nowrap">
                    <div className="flex items-center gap-3 text-[#f3ead8]">
                      <span>
                        <strong className="text-[#fbbf24]">{Math.round(campaign.gold)}</strong> Dinar
                      </span>
                      <span>
                        <strong className="text-[#fde68a]">{campaign.renown}</strong> Nam
                      </span>
                      <span>
                        <strong className="text-[#f87171]">{hpPercent}%</strong> HP
                      </span>
                      <span>
                        <strong className="text-[#86efac]">{totalTroops}</strong> Asker
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-3 text-[11px] text-[#cbd5e1]">
                      <span>Erzak: {campaign.food}</span>
                      <span>Moral: {campaign.morale}</span>
                      <span>Hız: {mapTelemetry.partySpeed}</span>
                      <span>Görüş: {mapTelemetry.spottingRange ?? 140}m</span>
                      <span>Maaş: {dailyWage}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="hud-panel rounded-lg px-4 py-2.5 w-full flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { id: 'CHARGE', label: '[1] Hücum · Tam Taarruz' },
                        { id: 'SHIELD_WALL', label: '[2] Kalkan Duvarı · Savunma Hattı' },
                        { id: 'FOLLOW_ME', label: '[3] Beni Takip Et · Muhafız' },
                        { id: 'HOLD_VOLLEY', label: '[4] Ok Yağmuru · Menzilli' },
                      ] as Array<{ id: TacticalOrder; label: string }>
                    ).map((ord) => (
                      <button
                        key={ord.id}
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onSetTacticalOrder(ord.id);
                        }}
                        className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          activeOrder === ord.id
                            ? 'bg-[#b45309] text-white border border-[#fbbf24]'
                            : 'bg-[#1c1914] text-[#d1c5b0] hover:bg-[#2a241c]'
                        }`}
                      >
                        {ord.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono-tabular text-[#d1c5b0]">
                      Sol Tık/F: Kılıç Savur · Sağ Tık: Kalkan · Space: Hücum
                    </span>
                    <button
                      type="button"
                      onClick={onRetreatBattle}
                      className="px-3 py-1.5 rounded text-xs font-semibold bg-[#29221a] hover:bg-[#3b3126] text-[#fca5a5] border border-[#f87171]/30 whitespace-nowrap shrink-0"
                    >
                      Haritaya Çekil
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
