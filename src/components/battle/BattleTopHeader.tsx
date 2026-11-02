import React from 'react';
import type { ArenaBattleMode } from '../../game/arenaTypes';
import type { LordAgent } from '../../game/rules';
import type { Settlement } from '../../game/rules';

export interface BattleTopHeaderProps {
  isFieldOrSiege: boolean;
  onReturnToMap: () => void;
  onOpenMarket?: () => void;
  arenaBattleMode: ArenaBattleMode;
  setArenaBattleMode: (mode: ArenaBattleMode) => void;
  isMounted: boolean;
  setIsMounted: React.Dispatch<React.SetStateAction<boolean>>;
  playerHp: number;
  botHp: number;
  skirmishWave: number;
  allyAliveCount: number;
  enemyAliveCount: number;
  pooledArrowsCount: number;
  pooledCorpsesCount: number;
  siegeEnabled: boolean;
  siegeGateHpPct: number;
  killsCount: number;
  controlMode: 'PLAYABLE' | 'INSPECTOR';
  setControlMode: (mode: 'PLAYABLE' | 'INSPECTOR') => void;
  targetLord?: LordAgent | null;
  targetSettlement?: Settlement | null;
  battleOutcome: any;
  fpsStats?: { current: number; min: number; max: number };
}

export const BattleTopHeader: React.FC<BattleTopHeaderProps> = ({
  isFieldOrSiege,
  onReturnToMap,
  onOpenMarket,
  arenaBattleMode,
  setArenaBattleMode,
  isMounted,
  setIsMounted,
  playerHp,
  botHp,
  skirmishWave,
  allyAliveCount,
  enemyAliveCount,
  pooledArrowsCount,
  pooledCorpsesCount,
  siegeEnabled,
  siegeGateHpPct,
  killsCount,
  controlMode,
  setControlMode,
  targetLord,
  targetSettlement,
  battleOutcome,
  fpsStats,
}) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isFieldOrSiege && (
          <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                if (document.pointerLockElement) document.exitPointerLock();
                onReturnToMap();
              }}
              className="px-3.5 py-1.5 rounded text-xs font-bold bg-[#1e1913] hover:bg-[#2b2218] text-[#fde68a] border border-[#c6a15b]/40 shadow-lg flex items-center gap-1.5 transition-colors"
            >
              <span>←</span>
              <span>Sefer Haritası</span>
            </button>

            {onOpenMarket && (
              <button
                type="button"
                onClick={onOpenMarket}
                title="Savaş alanında pazaryeri yok — yalnız envanter"
                className="px-3 py-1.5 rounded text-xs font-bold bg-[#2a2015] hover:bg-[#3d2e20] text-[#fde68a] border border-[#c6a15b]/50 shadow transition-colors flex items-center gap-1.5"
              >
                <span aria-hidden="true">⚖</span>
                <span>Envanter</span>
              </button>
            )}

            <div className="p-0.5 rounded bg-[#18130e] border border-[#c6a15b]/40 flex flex-wrap items-center gap-1 text-xs">
              {(
                [
                  { id: 'TRAINING', label: '🎯 Antrenman' },
                  { id: 'DUEL', label: '⚔️ 1v1 Düello' },
                  { id: 'SKIRMISH', label: '🛡️ Bölük Savaşı' },
                  { id: 'MASS_BATTLE', label: '🏰 500v500 Ordu & Kuşatma (Havuzlu)' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  data-testid={`arena-mode-${m.id}`}
                  onClick={() => setArenaBattleMode(m.id)}
                  className={`px-2.5 py-1 rounded font-bold transition-colors ${
                    arenaBattleMode === m.id
                      ? 'bg-[#991b1b] text-[#fde68a] border border-[#fbbf24]/40'
                      : 'text-[#a89b84] hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Mounted WarHorse Toggle (Faz 1.4) */}
            <button
              type="button"
              onClick={() => setIsMounted((prev) => !prev)}
              className={`px-3 py-1.5 rounded text-xs font-bold border shadow transition-colors flex items-center gap-1.5 ${
                isMounted
                  ? 'bg-amber-700 text-white border-amber-300'
                  : 'bg-[#1e1913] text-[#e2d6c1] border-[#c6a15b]/40 hover:bg-[#2b2218]'
              }`}
            >
              <span>🏇</span>
              <span>{isMounted ? 'Savaş Atında [M: İn]' : 'Savaş Atına Bin [M]'}</span>
            </button>
          </div>
        )}

        {/* Right: Health / Kills / Pool Stats / Camera Mode */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="px-3 py-1 rounded bg-[#18130e]/95 border border-[#c6a15b]/30 text-xs font-semibold text-[#e2d6c1] flex items-center gap-3 shadow font-mono-tabular">
            <span className="text-red-400 font-bold">❤️ Can: {playerHp}%</span>
            {arenaBattleMode === 'DUEL' && (
              <span className="text-purple-300 font-bold">⚔️ Rakip: {botHp}%</span>
            )}
            {arenaBattleMode === 'SKIRMISH' && (
              <span className="text-emerald-300 font-bold">
                🚩 Dalga {skirmishWave} ({allyAliveCount} vs {enemyAliveCount})
              </span>
            )}
            {arenaBattleMode === 'MASS_BATTLE' && (
              <>
                <span className="text-emerald-300 font-bold" data-testid="mass-battle-army-counts">
                  ⚔️ Ordu: {allyAliveCount} vs {enemyAliveCount}
                </span>
                <span className="text-amber-300 font-bold hidden lg:inline" data-testid="mass-battle-pool-stats">
                  🏹 Ok: {pooledArrowsCount}/10B · ☠️ Ceset: {pooledCorpsesCount}/10B
                </span>
                {siegeEnabled && (
                  <span className="text-orange-300 font-bold">
                    🪵 Kapı: %{siegeGateHpPct}
                  </span>
                )}
              </>
            )}
            <span className="text-[#fbbf24] font-bold">☠️ Leş: {killsCount}</span>
            {fpsStats && (
              <span
                data-testid="live-battle-fps"
                className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                  fpsStats.current >= 50
                    ? 'text-emerald-400 bg-emerald-950/60 border border-emerald-500/40'
                    : fpsStats.current >= 30
                      ? 'text-amber-400 bg-amber-950/60 border border-amber-500/40'
                      : 'text-red-400 bg-red-950/60 border border-red-500/40'
                }`}
              >
                ⚡ {fpsStats.current} FPS (Min: {fpsStats.min} · Max: {fpsStats.max})
              </span>
            )}
          </div>

          {!isFieldOrSiege && (
            <div className="p-0.5 rounded bg-[#1c1711] border border-[#c6a15b]/30 flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (document.pointerLockElement) document.exitPointerLock();
                  setControlMode('PLAYABLE');
                }}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  controlMode === 'PLAYABLE'
                    ? 'bg-[#b45309] text-white'
                    : 'text-[#a89b84] hover:text-white'
                }`}
              >
                🎮 Savaşçı
              </button>
              <button
                type="button"
                onClick={() => {
                  if (document.pointerLockElement) document.exitPointerLock();
                  setControlMode('INSPECTOR');
                }}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  controlMode === 'INSPECTOR'
                    ? 'bg-[#b45309] text-white'
                    : 'text-[#a89b84] hover:text-white'
                }`}
              >
                🔍 360° Manken
              </button>
            </div>
          )}
        </div>
      </div>

      {/* BANNERLORD LIVE BATTLE STRENGTH & GATE HP BAR */}
      {(isFieldOrSiege || arenaBattleMode === 'MASS_BATTLE' || arenaBattleMode === 'SKIRMISH') && (
        <div className={isFieldOrSiege ? "fixed top-2.5 left-1/2 -translate-x-1/2 w-full max-w-xl z-30 pointer-events-none flex flex-col items-center gap-1" : "mx-auto w-full max-w-xl pointer-events-auto flex flex-col items-center gap-1 my-1"}>
          <div className="w-full flex items-center justify-between text-xs font-bold px-2 text-[#e2d6c1] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span>Müttefik Kuvvetler ({allyAliveCount})</span>
            </div>
            {siegeEnabled && (
              <div className="flex items-center gap-1 text-amber-300 font-mono text-[11px]">
                <span>🪵 Kapı:</span>
                <span className={siegeGateHpPct <= 25 ? 'text-red-400 font-black' : 'text-amber-300'}>
                  %{siegeGateHpPct}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-rose-400">
              <span>
                {targetLord
                  ? `👑 ${targetLord.title ? `${targetLord.title} ` : 'Lord '}${targetLord.name}`
                  : (targetSettlement ? `🏰 ${targetSettlement.name} Garnizonu` : 'Düşman Kuvvetler')}{' '}
                ({enemyAliveCount})
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
            </div>
          </div>

          {/* Live Troop Ratio Bar */}
          <div className="w-full h-2 rounded bg-black/80 border border-[#c6a15b]/40 overflow-hidden flex shadow-lg">
            <div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
              style={{
                width: `${Math.round((allyAliveCount / Math.max(1, allyAliveCount + enemyAliveCount)) * 100)}%`,
              }}
            />
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-700 transition-all duration-300"
              style={{
                width: `${Math.round((enemyAliveCount / Math.max(1, allyAliveCount + enemyAliveCount)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 11.4: Oyuncu Yere Düştüğünde Devam Eden Savaş Şeridi (Spectator) */}
      {playerHp <= 0 && !battleOutcome && (
        <div className="mx-auto my-1 px-4 py-2 rounded-lg bg-red-950/90 border-2 border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.5)] text-center pointer-events-auto max-w-xl">
          <div className="text-xs sm:text-sm font-black text-rose-200 tracking-wide flex items-center justify-center gap-2">
            <span>☠️ AĞIR YARALANDINIZ (BAYGIN)</span>
            <span className="text-amber-300">• Birlikleriniz çarpışmaya devam ediyor!</span>
          </div>
          <div className="text-[11px] text-rose-300/80 mt-0.5">
            [TAB] tuşuna basarak muharebe tablosunu açabilir veya taktiksel geri çekilebilirsiniz.
          </div>
        </div>
      )}
    </div>
  );
};
