import React from 'react';
import type { UnitTierId } from '../../game/rules';

export interface ScoreboardDivisionRow {
  division: UnitTierId;
  label: string;
  initial: number;
  alive: number;
  wounded: number;
  killed: number;
  routed: number;
  morale: number;
  isRouting: boolean;
}

export interface ScoreboardData {
  allies: ScoreboardDivisionRow[];
  enemies: ScoreboardDivisionRow[];
  totalAlliesAlive: number;
  totalEnemiesAlive: number;
  totalAlliesKilled: number;
  totalEnemiesKilled: number;
  totalAlliesWounded: number;
  totalEnemiesWounded: number;
  totalAlliesRouted: number;
  totalEnemiesRouted: number;
}

export interface BattleScoreboardModalProps {
  showScoreboard: boolean;
  effectiveMode: 'ARENA' | 'FIELD' | 'SIEGE';
  scoreboardData: ScoreboardData | null;
  allyAliveCount: number;
  onClose: () => void;
  onTacticalRetreat: () => void;
}

export const BattleScoreboardModal: React.FC<BattleScoreboardModalProps> = ({
  showScoreboard,
  effectiveMode,
  scoreboardData,
  allyAliveCount,
  onClose,
  onTacticalRetreat,
}) => {
  if (!showScoreboard) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md pointer-events-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl p-5 sm:p-7 rounded-xl bg-gradient-to-b from-[#181410] to-[#0e0c09] border-2 border-[#c6a15b] shadow-2xl space-y-5 text-[#e2d6c1]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#c6a15b]/30 pb-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-[#c6a15b]">
              {effectiveMode === 'SIEGE' ? 'Kuşatma Muharebesi' : 'Meydan Muharebesi'} • Canlı Durum
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#fde68a] tracking-wider uppercase">
              ⚔️ MUHAREBE SKOR TABLOSU & BÖLÜK MORALİ
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs font-bold bg-black/60 hover:bg-[#b45309] text-amber-200 border border-[#c6a15b]/40 transition-colors cursor-pointer"
          >
            Kapat [TAB / ESC]
          </button>
        </div>

        {/* Scoreboard Two-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Ally Column */}
          <div className="p-3.5 rounded-lg bg-black/50 border border-emerald-500/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-emerald-500/20">
                <span className="font-black text-emerald-400 text-sm tracking-wide flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                  Sancak Ordusu (Müttefikler)
                </span>
                <span className="text-xs font-mono text-emerald-300">
                  Sağlam: {scoreboardData?.totalAlliesAlive ?? allyAliveCount}
                </span>
              </div>
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="text-[#a89984] border-b border-[#c6a15b]/20">
                    <th className="py-1">Bölük</th>
                    <th className="py-1 text-center">Mevcut</th>
                    <th className="py-1 text-center">Sağlam</th>
                    <th className="py-1 text-center text-amber-400">Yaralı</th>
                    <th className="py-1 text-center text-rose-400">Şehit</th>
                    <th className="py-1 text-center text-gray-400">Kaçan</th>
                    <th className="py-1 text-right">Moral</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c6a15b]/10">
                  {(scoreboardData?.allies ?? []).map((row) => (
                    <tr key={row.division} className={row.isRouting ? 'bg-red-950/20' : ''}>
                      <td className="py-1.5 font-bold text-[#fde68a] flex items-center gap-1">
                        {row.label}
                        {row.isRouting && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-red-600/60 text-white font-sans animate-pulse">
                            KAÇIYOR
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-center text-gray-300">{row.initial}</td>
                      <td className="py-1.5 text-center font-bold text-emerald-400">{row.alive}</td>
                      <td className="py-1.5 text-center text-amber-300">{row.wounded}</td>
                      <td className="py-1.5 text-center text-rose-400">{row.killed}</td>
                      <td className="py-1.5 text-center text-gray-400">{row.routed}</td>
                      <td className="py-1.5 text-right font-bold">
                        <span
                          className={
                            row.morale >= 50
                              ? 'text-emerald-400'
                              : row.morale >= 20
                                ? 'text-amber-400'
                                : 'text-rose-500 animate-pulse'
                          }
                        >
                          %{row.morale}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-2 border-t border-emerald-500/20 flex justify-between text-xs font-mono text-emerald-300">
              <span>Şehit / Kayıp: {scoreboardData?.totalAlliesKilled ?? 0}</span>
              <span>Yaralı: {scoreboardData?.totalAlliesWounded ?? 0}</span>
              <span>Kaçan: {scoreboardData?.totalAlliesRouted ?? 0}</span>
            </div>
          </div>

          {/* Enemy Column */}
          <div className="p-3.5 rounded-lg bg-black/50 border border-rose-500/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-rose-500/20">
                <span className="font-black text-rose-400 text-sm tracking-wide flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                  Düşman Ordusu
                </span>
                <span className="text-xs font-mono text-rose-300">
                  Kalan: {scoreboardData?.totalEnemiesAlive ?? 0}
                </span>
              </div>
              <table className="w-full text-xs font-mono text-left">
                <thead>
                  <tr className="text-[#a89984] border-b border-[#c6a15b]/20">
                    <th className="py-1">Bölük</th>
                    <th className="py-1 text-center">Mevcut</th>
                    <th className="py-1 text-center">Kalan</th>
                    <th className="py-1 text-center text-amber-400">Yaralı</th>
                    <th className="py-1 text-center text-rose-400">Ölü</th>
                    <th className="py-1 text-center text-gray-400">Kaçan</th>
                    <th className="py-1 text-right">Moral</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c6a15b]/10">
                  {(scoreboardData?.enemies ?? []).map((row) => (
                    <tr key={row.division} className={row.isRouting ? 'bg-red-950/20' : ''}>
                      <td className="py-1.5 font-bold text-[#fde68a] flex items-center gap-1">
                        {row.label}
                        {row.isRouting && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-red-600/60 text-white font-sans animate-pulse">
                            KAÇIYOR
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-center text-gray-300">{row.initial}</td>
                      <td className="py-1.5 text-center font-bold text-rose-400">{row.alive}</td>
                      <td className="py-1.5 text-center text-amber-300">{row.wounded}</td>
                      <td className="py-1.5 text-center text-rose-400">{row.killed}</td>
                      <td className="py-1.5 text-center text-gray-400">{row.routed}</td>
                      <td className="py-1.5 text-right font-bold">
                        <span
                          className={
                            row.morale >= 50
                              ? 'text-emerald-400'
                              : row.morale >= 20
                                ? 'text-amber-400'
                                : 'text-rose-500 animate-pulse'
                          }
                        >
                          %{row.morale}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-2 border-t border-rose-500/20 flex justify-between text-xs font-mono text-rose-300">
              <span>Etkisiz Hale Getirilen: {(scoreboardData?.totalEnemiesKilled ?? 0) + (scoreboardData?.totalEnemiesWounded ?? 0)}</span>
              <span>Kaçan Düşman: {scoreboardData?.totalEnemiesRouted ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-[#c6a15b]/20">
          <div className="text-xs text-[#a89984]">
            💡 <span className="text-amber-200">İpucu:</span> Bölük morali %20 altına düşen birlikler paniğe kapılarak harita kenarına kaçar.
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onTacticalRetreat}
              className="w-full sm:w-auto px-4 py-2 rounded text-xs font-bold bg-[#7f1d1d] hover:bg-[#991b1b] text-white border border-rose-500/40 shadow-lg transition-colors cursor-pointer"
            >
              ◀️ Taktiksel Geri Çekil (Ricat Et)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/50 shadow-lg transition-colors cursor-pointer"
            >
              Muharebeye Dön [TAB]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
