import React, { useEffect, useMemo, useState } from 'react';
import { WorldWarPanel } from './WorldWarPanel';
import {
  AttributeId,
  BannerlordSkillId,
  CampaignState,
  FACTION_INFO,
  LordAgent,
  Settlement,
  UNIT_DEFINITIONS,
  UnitTierId,
  calculateClanTier,
  calculatePartyDailyWage,
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
import { getPartyLimit } from '../game/partySystem';
import {
  QUEST_KIND_ICONS,
  QUEST_KIND_LABELS,
  buildQuestLog,
  daysLeft,
  questProgress,
} from '../game/quests';

interface GameHudProps {
  subMode: 'overworld' | 'battle';
  campaignTimeScale: 0 | 1 | 2 | 4;
  campaign: CampaignState;
  nearSettlement: Settlement | null;
  nearLord: LordAgent | null;
  mapTelemetry: MapCameraTelemetry;
  cameraActionsRef: React.MutableRefObject<CameraControlActions | null>;
  battleTelemetry: BattleTelemetry;
  muted: boolean;
  onSetTimeScale: (scale: 0 | 1 | 2 | 4) => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onOpenSettlement: (s: Settlement) => void;
  onOpenDiplomacy: (l: LordAgent) => void;
  /** Faz 6: yüz yüze diyalog ekranı. */
  onTalkToLord?: (l: LordAgent) => void;
  onStartQuickBattle: () => void;
  onAdvanceDay: () => void;
  onAllocateAttribute?: (attrId: AttributeId) => string | null;
  onAllocateFocus?: (skillId: BannerlordSkillId) => string | null;
  onOpenInventoryModal?: () => void;
  onRecruitPrisoners?: () => string | null;
  onOpenMarketModal?: () => void;
  /**
   * Oyuncu bir yerleşimin içinde mi? Bannerlord'da pazar yalnızca şehir/kale/köy
   * menüsünden açılır; haritada gezerken pazar yok.
   */
  canTrade?: boolean;
  onOpenCharacterArena?: () => void;
  onOpenKingdomModal?: () => void;
  onOpenCharacterCreator?: () => void;
  onOpenEncyclopedia?: () => void;
  onOpenPartyModal?: () => void;
  onOpenCharacterModal?: () => void;
  onOpenArmyModal?: () => void;
}

type WorldPane = 'chronicle' | 'quests';

/** "Harita & Günlük" panelinin sekmeleri — Faz 4/5. */
const WorldTabs: React.FC<{ pane: WorldPane; onChange: (p: WorldPane) => void }> = ({
  pane,
  onChange,
}) => (
  <div className="flex items-center gap-1 mt-1" data-testid="world-tabs">
    {(
      [
        { id: 'quests' as const, label: 'Görevler' },
        { id: 'chronicle' as const, label: 'Raporlar' },
      ] as const
    ).map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
          pane === t.id
            ? 'bg-[#b45309] text-white font-bold'
            : 'bg-[#1c1914] text-[#e2d6c1] hover:bg-[#2b261e]'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

export const GameHud: React.FC<GameHudProps> = ({
  subMode,
  campaignTimeScale,
  campaign,
  nearSettlement,
  nearLord,
  mapTelemetry,
  cameraActionsRef,
  battleTelemetry,
  muted,
  onSetTimeScale,
  onToggleMute,
  onPause,
  onRestart,
  onOpenSettlement,
  onOpenDiplomacy,
  onTalkToLord,
  onStartQuickBattle,
  onAdvanceDay,
  onAllocateAttribute,
  onAllocateFocus,
  onOpenInventoryModal,
  onRecruitPrisoners,
  onOpenMarketModal,
  canTrade = false,
  onOpenCharacterArena,
  onOpenKingdomModal,
  onOpenCharacterCreator,
  onOpenEncyclopedia,
  onOpenPartyModal,
  onOpenCharacterModal,
  onOpenArmyModal,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [rightBarCollapsed, setRightBarCollapsed] = useState(false);
  /** J menüsü: Görevler ve Raporlar sekmeleri. */
  const [worldPane, setWorldPane] = useState<'chronicle' | 'quests'>('quests');
  // Sol alt rapor şeridi Bannerlord'daki gibi geçicidir: yeni olayda
  // belirir, bir süre sonra solar (kalıcı kayıt "Raporlar" panelindedir).
  const [feedVisible, setFeedVisible] = useState(true);
  const lastChronicleId = campaign.chronicle[campaign.chronicle.length - 1]?.id;
  useEffect(() => {
    if (!lastChronicleId) return;
    setFeedVisible(true);
    const timer = setTimeout(() => setFeedVisible(false), 7000);
    return () => clearTimeout(timer);
  }, [lastChronicleId]);
  const [activeTab, setActiveTab] = useState<'none' | 'army' | 'character' | 'world'>('none');
  const [hudFeedback, setHudFeedback] = useState<string | null>(null);
  const [hoveredLabelId, setHoveredLabelId] = useState<string | null>(null);


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
        if (onOpenCharacterModal) {
          e.preventDefault();
          onOpenCharacterModal();
        } else {
          setActiveTab((prev) => (prev === 'character' ? 'none' : 'character'));
        }
      } else if (e.code === 'KeyB') {
        if (onOpenCharacterCreator) {
          onOpenCharacterCreator();
        }
      } else if (e.code === 'KeyI') {
        // Bannerlord'da I tam ekran saha envanterini açar/kapatır.
        e.preventDefault();
        onOpenInventoryModal?.();
      } else if (e.code === 'KeyP') {
        // Bannerlord'da P tam ekran parti/asker ekranını açar/kapatır.
        e.preventDefault();
        onOpenPartyModal?.();
      } else if (e.code === 'KeyL') {
        // Bannerlord'da L klan ekranını açar.
        e.preventDefault();
        onOpenKingdomModal?.();
      } else if (e.code === 'KeyJ') {
        // Bannerlord'da J görev günlüğünü açar.
        e.preventDefault();
        setActiveTab((prev) => (prev === 'world' ? 'none' : 'world'));
        setWorldPane('quests');
      } else if (e.code === 'F9') {
        // Faz 4: Arena düğmesi HUD'dan kalktı; test için F9 (ana menüde de var).
        if (onOpenCharacterArena) onOpenCharacterArena();
      } else if (e.code === 'F10') {
        onStartQuickBattle();
      } else if (e.code === 'KeyV') {
        setActiveTab((prev) => (prev === 'world' ? 'none' : 'world'));
        setWorldPane('chronicle');
      } else if (e.code === 'KeyK') {
        if (onOpenKingdomModal) {
          onOpenKingdomModal();
        }
      }
    };
    window.addEventListener('keydown', onKeyH);
    return () => window.removeEventListener('keydown', onKeyH);
  }, [
    onOpenInventoryModal,
    onOpenPartyModal,
    onOpenCharacterModal,
    onOpenKingdomModal,
    onOpenCharacterCreator,
    onOpenCharacterArena,
    onStartQuickBattle,
  ]);

  const questLog = useMemo(() => buildQuestLog(campaign), [campaign]);
  const totalTroops = getTotalTroops(campaign.roster);
  const partyStrength = calculatePartyStrength(
    campaign.roster,
    campaign.playerHp / campaign.playerMaxHp,
  );
  const dailyWage = calculatePartyDailyWage(campaign);
  const clanInfo = calculateClanTier(campaign.renown);
  // Tek kaynak (10.5): parti kapasitesi partySystem'den gelir; eski `45 + kademe` uydurmaydı.
  const partyCapacity = getPartyLimit(campaign);

  // Bannerlord Takvimi: 1 Mevsim = 21 Gün, 1 Yıl = 84 Gün (Başlangıç Yılı: 1084)
  const dayInSeason = ((Math.max(1, campaign.day) - 1) % 21) + 1;
  const yearNumber = 1084 + Math.floor((Math.max(1, campaign.day) - 1) / 84);
  const seasonCycle: Array<'Yaz' | 'Güz' | 'Kış' | 'Bahar'> = ['Yaz', 'Güz', 'Kış', 'Bahar'];
  const calendarSeason =
    campaign.day <= 1
      ? campaign.season
      : seasonCycle[Math.floor(((campaign.day - 1) % 84) / 21)] ?? campaign.season;
  const hourOfDay = campaign.hour ?? 9;
  const isNightTime = hourOfDay >= 20 || hourOfDay < 6;
  const dialAngleDeg = Math.round((hourOfDay / 24) * 360 - 90);

  // Ekonomik özet (Altın & Erzak & Moral hover kırılımları için)
  const playerOwnedCount = campaign.settlements.filter((s) => s.faction === 'player').length;
  const estTaxIncome = campaign.settlements
    .filter((s) => s.faction === 'player')
    .reduce((acc, s) => acc + Math.round(s.prosperity * 0.25), 0);
  const estWorkshopIncome = campaign.settlements
    .filter((s) => s.workshopOwner === 'player' && s.workshopType && s.workshopType !== 'NONE')
    .reduce((acc, s) => acc + 20 + Math.round(s.prosperity * 0.08), 0);
  const netDailyGold = estTaxIncome + estWorkshopIncome - dailyWage;
  const dailyFoodUse = Math.max(1, Math.ceil(totalTroops / 5));
  const daysOfFoodLeft = Math.max(0, Math.floor(campaign.food / dailyFoodUse));

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
                  className="absolute top-0 left-0 pointer-events-auto flex items-center gap-1 group cursor-pointer whitespace-nowrap"
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
                  className="flex items-center group cursor-pointer whitespace-nowrap drop-shadow-md"
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
                    'linear-gradient(180deg, rgba(18, 16, 13, 0.96) 0%, rgba(11, 10, 8, 0.98) 100%)',
                }}
                className="absolute top-0 left-0 z-30 w-48 rounded-xs border border-[#c6a15b]/60 border-t-2 border-t-[#c6a15b] px-3 py-2.5 text-center shadow-2xl pointer-events-none"
              >
                <div className="font-display font-bold text-xs text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1.5">
                  {inspected.name}
                </div>
                <div className="text-[10px] text-[#b5a890] uppercase tracking-wider">Hükümdar</div>
                <div className="text-[11px] font-semibold text-[#f3ead8] mb-1">
                  {inspected.ownerName}
                </div>
                <div className="text-[10px] text-[#b5a890]">
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
                  Emir: {battleTelemetry.orderSummary}
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
                        err || '1 Savaş Esiri ikna edilerek sancağımıza Milis Piyade olarak katıldı!',
                      );
                    }}
                    className="px-2.5 py-1 rounded text-xs font-bold bg-[#15803d] hover:bg-[#16a34a] text-white whitespace-nowrap"
                  >
                    Esir Devşir ({campaign.prisoners})
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
                  </div>
                );
              })}
            </div>

            {/* 4 Clan Party Roles */}
            <div className="mt-3 pt-2.5 border-t border-[#c6a15b]/20 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">İaşe Subayı (Steward)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.QUARTERMASTER ?? 'Komutan Demirhan (+45 Kapasite)'}
                </span>
              </div>
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">İzci (Scout)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.SCOUT ?? 'İzci Aybars (+%12 Görüş & Hız)'}
                </span>
              </div>
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">Cerrah (Surgeon)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.SURGEON ?? 'Hekim Helena (+%25 Yaralı Kurtarma)'}
                </span>
              </div>
              <div className="p-2 rounded bg-[#14110d] border border-[#c6a15b]/20">
                <span className="text-[#c6a15b] font-bold block">Mühendis (Engineer)</span>
                <span className="text-[#e2d6c1]">
                  {campaign.clanRoles?.ENGINEER ?? 'Mimar Torvald (+%30 Kuşatma İnşası)'}
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
                  Karakter Ekranı: {campaign.playerName} · Seviye {campaign.characterLevel ?? 6} ·{' '}
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
              <div className="flex items-center gap-2">
                {onOpenCharacterCreator && (
                  <button
                    type="button"
                    onClick={onOpenCharacterCreator}
                    className="px-3 py-1.5 rounded text-xs font-bold bg-[#c6a15b] hover:bg-[#d4af37] text-[#14100c] shadow transition flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <span>Berber &amp; Suret Modelle [B]</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('none')}
                  className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
                >
                  Kapat [C]
                </button>
              </div>
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

        {subMode === 'overworld' && activeTab === 'world' && worldPane === 'quests' && !dockCollapsed && (
          <div
            data-testid="quest-log"
            className="hud-panel rounded-lg p-4 w-full max-w-4xl pointer-events-auto max-h-[68vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between border-b border-[#c6a15b]/25 pb-2 mb-3 gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#f8f0df]">Görev Günlüğü</h3>
                <p className="text-xs text-[#b5a890]">
                  {questLog.summary} · Kampanya günü {campaign.day}
                </p>
                <WorldTabs pane={worldPane} onChange={setWorldPane} />
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('none')}
                className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
              >
                Kapat
              </button>
            </div>

            {questLog.active.length === 0 ? (
              <div className="text-[11px] text-[#8b8072] py-6 text-center">
                Şu an aktif görev yok. Lordlarla konuştuğunda (Faz 6) yeni görevler açılacak.
              </div>
            ) : (
              <div className="space-y-2">
                {questLog.active.map((q) => {
                  const progress = questProgress(q);
                  const left = daysLeft(q, campaign.day);
                  const late = left <= 3;
                  return (
                    <div
                      key={q.id}
                      data-quest={q.id}
                      className="rounded border border-[#c6a15b]/30 bg-[#181510] p-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#fbbf24]" aria-hidden="true">
                              {QUEST_KIND_ICONS[q.kind]}
                            </span>
                            <span className="text-xs font-bold text-[#f8f0df] truncate">
                              {q.title}
                            </span>
                            <span className="text-[9px] px-1 py-0.5 rounded bg-[#241c12] text-[#c6a15b] shrink-0">
                              {QUEST_KIND_LABELS[q.kind]}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#a2957f] mt-0.5">
                            Veren: {q.giverName}
                            {q.targetSettlementName ? ` · Hedef: ${q.targetSettlementName}` : ''}
                          </div>
                        </div>
                        <div className={`text-[10px] shrink-0 ${late ? 'text-[#fca5a5]' : 'text-[#8b8072]'}`}>
                          {left >= 0 ? `${left} gün kaldı` : 'Süresi geçti'}
                        </div>
                      </div>

                      <p className="text-[11px] text-[#c9bda8] mt-1 leading-relaxed">
                        {q.description}
                      </p>

                      <div className="mt-2 space-y-1">
                        {q.objectives.map((o) => (
                          <div key={o.key} className="flex items-center gap-2">
                            <span className="text-[10px] text-[#a2957f] w-44 truncate">
                              {o.done ? '✓' : '•'} {o.label}
                            </span>
                            <span className="flex-1 h-1.5 rounded bg-[#241c12] overflow-hidden">
                              <span
                                className={`block h-full ${o.done ? 'bg-[#34d399]' : 'bg-[#c6a15b]'}`}
                                style={{
                                  width: `${Math.min(100, (o.current / Math.max(1, o.target)) * 100)}%`,
                                }}
                              />
                            </span>
                            <span className="text-[9px] text-[#8b8072] font-mono-tabular w-12 text-right">
                              {Math.min(o.current, o.target)}/{o.target}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-[#8b8072] italic truncate">{q.hint}</span>
                        <span className="shrink-0 text-[#fbbf24] font-mono-tabular">
                          {q.reward.gold} dinar · +{q.reward.renown} nam · +{q.reward.relation} ilişki
                        </span>
                      </div>
                      <div className="mt-1 h-0.5 rounded bg-[#241c12] overflow-hidden">
                        <span
                          className="block h-full bg-[#b45309]"
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(questLog.completed.length > 0 || questLog.failed.length > 0) && (
              <div className="mt-3 pt-2 border-t border-[#c6a15b]/20 text-[10px] flex flex-wrap gap-2">
                {questLog.completed.map((q) => (
                  <span
                    key={q.id}
                    className="px-1.5 py-0.5 rounded border border-[#34d399]/40 text-[#34d399]"
                  >
                    ✓ {q.title}
                  </span>
                ))}
                {questLog.failed.map((q) => (
                  <span
                    key={q.id}
                    className="px-1.5 py-0.5 rounded border border-[#f87171]/40 text-[#fca5a5]"
                  >
                    ✕ {q.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {subMode === 'overworld' && activeTab === 'world' && worldPane === 'chronicle' && !dockCollapsed && (
          <div className="hud-panel rounded-lg p-4 w-full max-w-4xl pointer-events-auto">
            <div className="flex items-center justify-between border-b border-[#c6a15b]/25 pb-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#f8f0df]">
                  Kalradya'da Son Olaylar
                </h3>
                <WorldTabs pane={worldPane} onChange={setWorldPane} />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('none')}
                  className="text-xs text-[#c6a15b] hover:underline whitespace-nowrap shrink-0"
                >
                  Kapat
                </button>
              </div>
            </div>

            <WorldWarPanel campaign={campaign} />

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
            <div className="mb-1 font-display font-extrabold text-sm tracking-[0.22em] text-[#f8f0df] hud-stroke uppercase select-none">
              DURAKLATILDI · PAUSED
            </div>
          )}

          {!dockCollapsed && (
            <div className="w-full flex items-end justify-between gap-2 pointer-events-auto">
              {subMode === 'overworld' ? (
                <>
                  {/* 1. Bottom-Left: Bannerlord 7-İkonlu Menü Şeridi (#1 - #7) */}
                  {/* Event Log / Chronicle Ticker (Bannerlord Vakanüvis Akışı — Sol Alt) */}
                  <div
                    data-testid="hud-event-feed"
                    className={`absolute bottom-16 left-4 max-w-sm flex flex-col gap-1 pointer-events-none select-none z-30 mb-1 transition-opacity duration-700 ${feedVisible ? 'opacity-100' : 'opacity-0'}`}
                  >
                    {campaign.chronicle.slice(-4).reverse().map((ev) => (
                      <div
                        key={ev.id}
                        className="px-2.5 py-1 rounded border border-[#c6a15b]/20 shadow-sm flex items-center gap-1.5 text-[11px] text-[#f1eadc] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                      >
                        <span
                          className={`px-1 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                            ev.category === 'WAR'
                              ? 'bg-red-950 text-red-300 border border-red-700/50'
                              : ev.category === 'DIPLOMACY'
                                ? 'bg-amber-950 text-amber-300 border border-amber-700/50'
                                : ev.category === 'ECONOMY'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                                  : 'bg-stone-900 text-stone-300 border border-stone-700/50'
                          }`}
                        >
                          {ev.category === 'WAR'
                            ? 'SAVAŞ'
                            : ev.category === 'DIPLOMACY'
                              ? 'DİPLOMASİ'
                              : ev.category === 'ECONOMY'
                                ? 'TİCARET'
                                : 'HABER'}
                        </span>
                        <span className="font-mono text-[#fbbf24] text-[10px] shrink-0">
                          G{ev.day}:
                        </span>
                        <span className="truncate">{ev.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* 1. Bottom-Left: Authentic Bannerlord 6-İkonlu Yuvarlak Menü Şeridi */}
                  <div
                    data-testid="hud-dock"
                    className="hud-panel rounded-t-2xl rounded-bl-xl p-1.5 flex items-center gap-1.5 border-t-2 border-t-[#d4af37] shadow-2xl relative"
                  >
                    {/* #1 Karakter [C] */}
                    <button
                      type="button"
                      data-testid="hud-open-character"
                      title="Karakter Ekranı (C) — Baş karakterinizin nitelikleri, 18 becerisi ve odak puanları"
                      onClick={() => {
                        if (onOpenCharacterModal) onOpenCharacterModal();
                        else setActiveTab(activeTab === 'character' ? 'none' : 'character');
                      }}
                      className="relative w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2217] to-[#14100b] hover:from-[#3a2f20] hover:to-[#1e1811] border border-[#c6a15b]/60 hover:border-[#fbbf24] text-[#fde68a] flex items-center justify-center transition shadow-md group"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                        <path d="M12 2C7.5 2 4 5.5 4 10v4c0 3 2 5.5 5 6.5V22h6v-1.5c3-1 5-3.5 5-6.5v-4c0-4.5-3.5-8-8-8zm-4 9h8v2H8v-2zm2 4h4v1.5h-4V15z" />
                      </svg>
                      {((campaign.freeAttributePoints ?? 0) > 0 || (campaign.freeFocusPoints ?? 0) > 0) && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#fbbf24] text-[#14100b] text-[10px] font-black flex items-center justify-center shadow-[0_0_6px_#f59e0b] border border-[#fef08a]">
                          !
                        </span>
                      )}
                      <span className="absolute -bottom-1 text-[8px] font-mono font-bold text-[#c6a15b] group-hover:text-white">C</span>
                    </button>

                    {/* #2 Envanter [I] */}
                    <button
                      type="button"
                      data-testid="hud-open-inventory"
                      title="Envanter (I) — Grubun taşıdığı zırhlar, silahlar, erzaklar ve binekler"
                      onClick={onOpenInventoryModal}
                      className="relative w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2217] to-[#14100b] hover:from-[#3a2f20] hover:to-[#1e1811] border border-[#c6a15b]/60 hover:border-[#fbbf24] text-[#fde68a] flex items-center justify-center transition shadow-md group"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                        <path d="M16 4a2 2 0 00-2-2h-4a2 2 0 00-2 2H6a2 2 0 00-2 2c0 1.5.8 2.8 2 3.5V18a4 4 0 004 4h4a4 4 0 004-4V9.5c1.2-.7 2-2 2-3.5a2 2 0 00-2-2h-2zm-6 0h4v2h-4V4zm-1 6h6v2H9v-2z" />
                      </svg>
                      <span className="absolute -bottom-1 text-[8px] font-mono font-bold text-[#c6a15b] group-hover:text-white">I</span>
                    </button>

                    {/* #3 Birlik / Parti [P] */}
                    <button
                      type="button"
                      data-testid="hud-open-party"
                      title="Birlik & Parti Ekranı (P) — Ordunuzdaki askerler, terfiler ve esirler"
                      onClick={onOpenPartyModal}
                      className="relative w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2217] to-[#14100b] hover:from-[#3a2f20] hover:to-[#1e1811] border border-[#c6a15b]/60 hover:border-[#fbbf24] text-[#fde68a] flex items-center justify-center transition shadow-md group"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                        <path d="M12 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5zm-5 4a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zM12 8.5c-2.3 0-4.5 1.2-4.5 3.5V14h9v-2c0-2.3-2.2-3.5-4.5-3.5zM7 11.5c-1.8 0-3.5.9-3.5 2.7V16h3.5v-2c0-.9.4-1.7 1-2.2-.3-.2-.7-.3-1-.3zm10 0c-.3 0-.7.1-1 .3.6.5 1 1.3 1 2.2v2h3.5v-1.8c0-1.8-1.7-2.7-3.5-2.7zM3 21h18v1.5H3V21z" />
                      </svg>
                      {campaign.prisoners > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#fbbf24] text-[#14100b] text-[10px] font-black flex items-center justify-center shadow-[0_0_6px_#f59e0b] border border-[#fef08a]">
                          !
                        </span>
                      )}
                      <span className="absolute -bottom-1 text-[8px] font-mono font-bold text-[#c6a15b] group-hover:text-white">P</span>
                    </button>

                    {/* #4 Klan [L] */}
                    {onOpenKingdomModal && (
                      <button
                        type="button"
                        data-testid="hud-open-clan"
                        title="Klan Menüsü (L) — Yoldaşlar, aile üyeleri, mülkler ve kervanlar"
                        onClick={onOpenKingdomModal}
                        className="relative w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2217] to-[#14100b] hover:from-[#3a2f20] hover:to-[#1e1811] border border-[#c6a15b]/60 hover:border-[#fbbf24] text-[#fde68a] flex items-center justify-center transition shadow-md group"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                          <path d="M12 2c4.4 0 8 3.6 8 8 0 3.1-1.8 5.8-4.4 7.1L17 22H7l1.4-4.9C5.8 15.8 4 13.1 4 10c0-4.4 3.6-8 8-8zm-2.5 6.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm5 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 13l-2.5 2.5h5L12 13z" />
                        </svg>
                        <span className="absolute -bottom-1 text-[8px] font-mono font-bold text-[#c6a15b] group-hover:text-white">L</span>
                      </button>
                    )}

                    {/* #5 Krallık [K] */}
                    {onOpenKingdomModal && (
                      <button
                        type="button"
                        data-testid="hud-open-kingdom"
                        title="Krallık Divanı (K) — Savaş ve barış oylamaları, politikalar ve tımarlar"
                        onClick={onOpenKingdomModal}
                        className="relative w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2217] to-[#14100b] hover:from-[#3a2f20] hover:to-[#1e1811] border border-[#c6a15b]/60 hover:border-[#fbbf24] text-[#fde68a] flex items-center justify-center transition shadow-md group"
                      >
                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                          <path d="M3 18h18v2.5H3V18zm0-2l2.2-8.5 4.8 4.2L12 4l2 7.7 4.8-4.2L21 16H3z" />
                        </svg>
                        <span className="absolute -bottom-1 text-[8px] font-mono font-bold text-[#c6a15b] group-hover:text-white">K</span>
                      </button>
                    )}

                    {/* #6 Günlük / Görevler [J] */}
                    <button
                      type="button"
                      data-testid="hud-open-quests"
                      title="Görev Günlüğü (J) — Lordlardan ve köylülerden aldığınız görevler"
                      onClick={() => {
                        setActiveTab(activeTab === 'world' && worldPane === 'quests' ? 'none' : 'world');
                        setWorldPane('quests');
                      }}
                      className="relative w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2217] to-[#14100b] hover:from-[#3a2f20] hover:to-[#1e1811] border border-[#c6a15b]/60 hover:border-[#fbbf24] text-[#fde68a] flex items-center justify-center transition shadow-md group"
                    >
                      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                        <path d="M19 3H7a4 4 0 00-4 4v10a4 4 0 004 4h11a3 3 0 003-3V5a2 2 0 00-2-2zM7 5h12v11H7a2 2 0 01-2-2V7a2 2 0 012-2zm12 14H7a2 2 0 010-4h12v4zm-11-9h8v1.5H8V10zm0 3h6v1.5H8V13z" />
                      </svg>
                      {questLog.active.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#38bdf8] text-[#0f172a] text-[10px] font-black flex items-center justify-center shadow border border-white">
                          {questLog.active.length}
                        </span>
                      )}
                      <span className="absolute -bottom-1 text-[8px] font-mono font-bold text-[#c6a15b] group-hover:text-white">J</span>
                    </button>
                  </div>

                  {/* 2. Bottom-Center: Authentic Bannerlord Circular Sun/Moon Medallion Dial (#8, #9, #10) */}
                  <div
                    data-testid="hud-time-dial"
                    className="absolute left-1/2 -translate-x-1/2 bottom-0 hud-panel rounded-t-3xl px-5 py-1.5 flex items-center gap-3 border-t-2 border-t-[#d4af37] shadow-2xl z-30 pointer-events-auto"
                  >
                    {/* #9 Mevsim ve Yıl Gösterimi (1 Mevsim = 21 Gün, 1 Yıl = 84 Gün) */}
                    <div
                      className="relative group cursor-help flex flex-col items-end"
                      title={`Sefer Günü ${campaign.day} · Saat ${hourOfDay}:00 (1 Mevsim = 21 Gün, 1 Yıl = 84 Gün)`}
                    >
                      <span className="font-display font-bold text-xs text-[#f5ebd6] whitespace-nowrap tracking-wide">
                        {calendarSeason} {dayInSeason}, {yearNumber}
                      </span>
                      <span className="text-[9.5px] font-mono text-[#c6a15b]">
                        Saat {String(hourOfDay).padStart(2, '0')}:00 · {isNightTime ? 'Gece' : 'Gündüz'}
                      </span>
                    </div>

                    {/* #8 Dönen Göksel Güneş / Ay Kadranı (Celestial Medallion) */}
                    <div
                      title={isNightTime ? 'Gece Vakti (Görüş ve hız düşer)' : 'Gündüz Vakti (Tam görüş)'}
                      className={`relative w-10 h-10 rounded-full border-2 border-[#d4af37] flex items-center justify-center shadow-inner shrink-0 overflow-hidden transition-colors ${
                        isNightTime
                          ? 'bg-gradient-to-b from-[#090d16] via-[#111827] to-[#1e1b4b]'
                          : 'bg-gradient-to-b from-[#1d4ed8] via-[#1e3a8a] to-[#172554]'
                      }`}
                    >
                      <div
                        style={{ transform: `rotate(${dialAngleDeg}deg)` }}
                        className="w-full h-full flex items-center justify-between px-1 transition-transform duration-500"
                      >
                        <div className="w-4 h-4 rounded-full bg-[#fbbf24] shadow-[0_0_8px_#f59e0b] border border-[#fef08a]" />
                        <div className="w-3 h-3 rounded-full bg-[#e2e8f0] shadow-[0_0_5px_#94a3b8]" />
                      </div>
                      <div className="absolute inset-x-0 bottom-0 h-2.5 bg-gradient-to-t from-[#1c1610] to-transparent border-t border-[#c6a15b]/40" />
                    </div>

                    {/* #10 Zaman Kontrol Butonları (|| / ▶ / ▶▶ / ▶▶▶ — Space, 1, 2, 3) */}
                    <div className="flex items-center gap-1 font-mono-tabular">
                      {(
                        [
                          { scale: 0, label: '||', hint: 'Durdur [Space]' },
                          { scale: 1, label: '▶', hint: 'Normal Hız [1]' },
                          { scale: 2, label: '▶▶', hint: 'Hızlı İlerlet [2]' },
                          { scale: 4, label: '▶▶▶', hint: 'Çok Hızlı İlerlet [3]' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.scale}
                          type="button"
                          title={t.hint}
                          onClick={() => onSetTimeScale(t.scale)}
                          className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                            campaignTimeScale === t.scale
                              ? 'bg-[#b45309] text-white border border-[#fbbf24]/60 shadow'
                              : 'text-[#c6a15b] hover:text-[#f8f0df] hover:bg-[#241d15]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. Bottom-Right: Bannerlord Kaynak & Parti Durum Şeridi (#11 - #21 + Hover Kırılımları) */}
                  <div
                    data-testid="hud-right-status"
                    className="hud-panel rounded-t-xl rounded-br-lg px-3.5 py-1.5 border-t-2 border-t-[#c6a15b] font-mono-tabular text-xs flex flex-col gap-1 whitespace-nowrap shadow-2xl"
                  >
                    {/* Üst Satır (#11 Can, #12 Kalkan/Asker, #13 Altın/Dinar, #14 Nüfuz/Şöhret, #20 Ordu, #21 Daralt/Genişlet) */}
                    <div className="flex items-center gap-3 text-[#f3ead8]">
                      {/* #13 Altın (Dinar) */}
                      <div className="relative group cursor-help flex items-center gap-1">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#fbbf24]" aria-hidden="true">
                          <circle cx="8" cy="8" r="6" />
                        </svg>
                        <span>
                          <strong className="text-[#fbbf24]">{Math.round(campaign.gold)}</strong>
                        </span>
                        <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-60 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                          <div className="font-bold text-[#fbbf24] border-b border-[#c6a15b]/30 pb-1 mb-1">
                            Hazine: {Math.round(campaign.gold)} Dinar
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Mülk Vergileri ({playerOwnedCount}):</span>
                            <span className="font-mono text-[#4ade80]">+{estTaxIncome}</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Atölye Gelirleri:</span>
                            <span className="font-mono text-[#4ade80]">+{estWorkshopIncome}</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Günlük Parti Maaşı:</span>
                            <span className="font-mono text-[#f87171]">-{dailyWage}</span>
                          </div>
                          <div className="flex justify-between pt-1 mt-1 border-t border-[#c6a15b]/25 font-bold">
                            <span className="text-[#fde68a]">Beklenen Değişim:</span>
                            <span className={`font-mono ${netDailyGold >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                              {netDailyGold >= 0 ? `+${netDailyGold}` : netDailyGold}/gün
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* #14 Nüfuz & Şöhret */}
                      <div className="relative group cursor-help flex items-center gap-1">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#fde68a]" aria-hidden="true">
                          <path d="M8 1l2.1 4.4 4.9.7-3.5 3.4.8 4.8L8 12l-4.3 2.3.8-4.8L1 6.1l4.9-.7L8 1z" />
                        </svg>
                        <span className="flex items-center gap-1">
                          <strong className="text-[#fde68a]">{campaign.renown}</strong>
                          <span className="text-[#93c5fd]">({Math.round(campaign.influence ?? 0)})</span>
                        </span>
                        <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-60 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                          <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                            {clanInfo.title}
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Mevcut Şöhret:</span>
                            <span className="font-mono text-[#fde68a]">{campaign.renown} / {clanInfo.nextRenown}</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Krallık Nüfuzu:</span>
                            <span className="font-mono text-[#93c5fd]">{Math.round(campaign.influence ?? 0)}</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Günlük Nüfuz Kazanımı:</span>
                            <span className="font-mono text-[#4ade80]">+{1 + clanInfo.tier}/gün</span>
                          </div>
                        </div>
                      </div>

                      {/* #11 Can (HP %) */}
                      <div className="relative group cursor-help flex items-center gap-1">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#f87171]" aria-hidden="true">
                          <path d="M8 14s-5.5-3.3-5.5-7.5A3.2 3.2 0 018 4.2a3.2 3.2 0 015.5 2.3C13.5 10.7 8 14 8 14z" />
                        </svg>
                        <span>
                          <strong className="text-[#f87171]">{hpPercent}%</strong>
                        </span>
                        <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                          <div className="font-bold text-[#fca5a5] border-b border-[#c6a15b]/30 pb-1 mb-1">
                            Sağlık: {Math.round(currentHp)} / {maxHp} HP (%{hpPercent})
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Temel Yenilenme:</span>
                            <span className="font-mono text-[#4ade80]">+15 HP/gün</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Cerrah ({campaign.skills?.medicine?.level ?? 80}):</span>
                            <span className="font-mono text-[#4ade80]">+%25 İyileşme</span>
                          </div>
                        </div>
                      </div>

                      {/* #12 Birlik & Kalkan (Asker) */}
                      <div className="relative group cursor-help flex items-center gap-1">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#86efac]" aria-hidden="true">
                          <path d="M8 1.5L2.5 3.8v4.4c0 3.5 2.3 6.6 5.5 7.4 3.2-.8 5.5-3.9 5.5-7.4V3.8L8 1.5z" />
                        </svg>
                        <span>
                          <strong className="text-[#86efac]">{totalTroops}</strong>
                        </span>
                        <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-60 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                          <div className="font-bold text-[#86efac] border-b border-[#c6a15b]/30 pb-1 mb-1">
                            Sancak Birliği: {totalTroops} / {partyCapacity}
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Temel + İaşe Subayı:</span>
                            <span className="font-mono text-[#4ade80]">+45 Kapasite</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Klan Kademesi ({clanInfo.tier}):</span>
                            <span className="font-mono text-[#4ade80]">+{clanInfo.maxPartyBonus} Kapasite</span>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <span className="text-[#d1c5b0]">Savaş Esirleri:</span>
                            <span className="font-mono text-[#fde68a]">{campaign.prisoners} Esir</span>
                          </div>
                          <div className="flex justify-between pt-1 mt-1 border-t border-[#c6a15b]/25 font-bold">
                            <span className="text-[#fde68a]">Muharebe Gücü:</span>
                            <span className="font-mono text-[#fbbf24]">{partyStrength}</span>
                          </div>
                        </div>
                      </div>

                      {/* #20 Ordu (Army — Üç Bayraklı Sancak İkonu) */}
                      {onOpenArmyModal && (
                        <button
                          type="button"
                          data-testid="open-army-modal-btn"
                          onClick={onOpenArmyModal}
                          title="Ordu Yönetimi ve Sancak Çağrısı (#20 Ordu)"
                          className="px-2 py-0.5 rounded bg-[#231b12] hover:bg-[#33271a] border border-[#c6a15b]/60 text-[#fde68a] font-bold text-[11px] flex items-center gap-1 transition-colors"
                        >
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#fbbf24]" aria-hidden="true">
                            <path d="M2 2v12h1.2V8h3.3l-.7-2.5L6.5 3H3.2V2H2zm5.5 1v11h1.2V9h3.3l-.7-2.5L12 4H8.7V3H7.5z" />
                          </svg>
                          <span className="text-[#fde68a]">Ordu</span>
                        </button>
                      )}

                      {/* #21 Daralt / Genişlet (▲/▼) Ok Butonu */}
                      <button
                        type="button"
                        data-testid="hud-right-collapse-toggle"
                        onClick={() => setRightBarCollapsed((prev) => !prev)}
                        title={rightBarCollapsed ? 'Detay Satırını Genişlet (#21)' : 'Detay Satırını Daralt (#21)'}
                        className="w-5 h-5 rounded bg-[#1c1711] hover:bg-[#2d2419] border border-[#c6a15b]/40 text-[#c6a15b] flex items-center justify-center text-[10px]"
                      >
                        {rightBarCollapsed ? '▲' : '▼'}
                      </button>
                    </div>

                    {/* Alt Satır (#15 Moral, #16 Erzak, #17 Görüş, #18 Hız, #19 Günlük Ücret / Maaş) */}
                    {!rightBarCollapsed && (
                      <div className="flex items-center justify-end gap-3 text-[11px] text-[#cbd5e1] border-t border-[#c6a15b]/20 pt-0.5">
                        {/* #16 Erzak */}
                        <div className="relative group cursor-help">
                          <span><strong className="text-[#86efac]">{campaign.food}</strong></span>
                          <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                            <div className="font-bold text-[#86efac] border-b border-[#c6a15b]/30 pb-1 mb-1">
                              Erzak Stoğu: {campaign.food} Sandık
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Günlük Tüketim:</span>
                              <span className="font-mono text-[#f87171]">-{dailyFoodUse}/gün</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Tahmini Yetme Süresi:</span>
                              <span className="font-mono text-[#fde68a]">{daysOfFoodLeft} Gün</span>
                            </div>
                          </div>
                        </div>

                        {/* #15 Moral */}
                        <div className="relative group cursor-help">
                          <span><strong className="text-[#fde68a]">{campaign.morale}</strong></span>
                          <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                            <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                              Parti Morali: {campaign.morale} / 100
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Temel Moral:</span>
                              <span className="font-mono text-[#4ade80]">+50</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Liderlik ({campaign.skills?.leadership?.level ?? 120}):</span>
                              <span className="font-mono text-[#4ade80]">+16</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Erzak Çeşitliliği:</span>
                              <span className="font-mono text-[#4ade80]">+{campaign.food > 0 ? 12 : -15}</span>
                            </div>
                          </div>
                        </div>

                        {/* #18 Harita Hızı */}
                        <div className="relative group cursor-help">
                          <span><strong className="text-[#f8fafc]">{mapTelemetry.partySpeed}</strong></span>
                          <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-60 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                            <div className="font-bold text-[#fde68a] border-b border-[#c6a15b]/30 pb-1 mb-1">
                              Harita Hızı: {mapTelemetry.partySpeed} ({mapTelemetry.biomeLabel})
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Temel Parti Hızı:</span>
                              <span className="font-mono text-[#4ade80]">4.80</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Süvari & Atlı Piyade:</span>
                              <span className="font-mono text-[#4ade80]">+0.65</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">İzcilik ({campaign.skills?.scouting?.level ?? 80}):</span>
                              <span className="font-mono text-[#4ade80]">+0.35</span>
                            </div>
                          </div>
                        </div>

                        {/* #17 İzcilik / Görüş Mesafesi */}
                        <div className="relative group cursor-help">
                          <span><strong className="text-[#93c5fd]">{mapTelemetry.spottingRange ?? 140}</strong></span>
                          <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-56 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                            <div className="font-bold text-[#93c5fd] border-b border-[#c6a15b]/30 pb-1 mb-1">
                              Keşif & Görüş Menzili: {mapTelemetry.spottingRange ?? 140}m
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">Temel Menzil:</span>
                              <span className="font-mono text-[#4ade80]">110m</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span className="text-[#d1c5b0]">İzci Rolü Bonusu:</span>
                              <span className="font-mono text-[#4ade80]">+38m</span>
                            </div>
                          </div>
                        </div>

                        {/* #19 Günlük Ücret (Maaş) */}
                        <div className="relative group cursor-help">
                          <span><strong className="text-[#fca5a5]">{dailyWage}</strong></span>
                          <div className="hidden group-hover:block absolute bottom-full right-0 mb-2 z-50 w-60 p-2.5 rounded bg-[#0e0b08]/95 border border-[#c6a15b]/80 shadow-2xl text-[11px] font-sans">
                            <div className="font-bold text-[#fca5a5] border-b border-[#c6a15b]/30 pb-1 mb-1">
                              Günlük Parti Ücreti (#19): {dailyWage} Dinar
                            </div>
                            {Object.values(UNIT_DEFINITIONS).map((u) => {
                              const count = campaign.roster[u.id] ?? 0;
                              if (count <= 0) return null;
                              return (
                                <div key={u.id} className="flex justify-between py-0.5">
                                  <span className="text-[#d1c5b0]">
                                    {u.name} (×{count}):
                                  </span>
                                  <span className="font-mono text-[#fca5a5]">
                                    -{count * u.dailyWage} Dinar
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="hud-panel rounded-lg px-4 py-2.5 w-full flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#d1c5b0]">
                      Bölük emirleri: <span className="text-[#f3d98b]">0-4</span> bölük seç ·{' '}
                      <span className="text-[#f3d98b]">F1</span> Hareket ·{' '}
                      <span className="text-[#f3d98b]">F2</span> Yön ·{' '}
                      <span className="text-[#f3d98b]">F3</span> Diziliş ·{' '}
                      <span className="text-[#f3d98b]">F4</span> Ateş ·{' '}
                      <span className="text-[#f3d98b]">F6</span> Devret
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono-tabular text-[#d1c5b0]">
                      WASD: Sür · Sol Tık: Saldır · Sağ Tık (basılı): Blok
                    </span>
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
