import React from 'react';
import type { TroopRoster, UnitTierId } from '../../game/rules';
import { DIVISION_LABEL } from '../../game/deployment';

export interface BattleOutcomeData {
  victory: boolean;
  losses: Partial<TroopRoster>;
  wounded?: Partial<TroopRoster>;
  survivalRate?: number;
  enemiesDefeated: number;
}

export interface BattleOutcomeModalProps {
  effectiveMode: 'ARENA' | 'FIELD' | 'SIEGE';
  battleOutcome: BattleOutcomeData | null;
  onReturnToMap: () => void;
  onBattleComplete?: (
    victory: boolean,
    losses: Partial<TroopRoster>,
    enemiesDefeated: number,
  ) => void;
}

export const BattleOutcomeModal: React.FC<BattleOutcomeModalProps> = ({
  effectiveMode,
  battleOutcome,
  onReturnToMap,
  onBattleComplete,
}) => {
  if (!battleOutcome) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md pointer-events-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg p-6 sm:p-7 rounded-xl bg-gradient-to-b from-[#181410] to-[#0e0c09] border-2 border-[#c6a15b] shadow-2xl text-center space-y-4">
        <div className="text-xs font-bold tracking-widest uppercase text-[#c6a15b]">
          {effectiveMode === 'SIEGE' ? 'Kuşatma Muharebesi' : 'Meydan Muharebesi'}
        </div>
        <h2
          className={`text-2xl font-black tracking-widest uppercase ${
            battleOutcome.victory ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {battleOutcome.victory ? '🏆 ZAFER KAZANILDI!' : '☠️ YENİLGİ — ESARET DÜŞTÜNÜZ!'}
        </h2>
        <p className="text-xs sm:text-sm text-[#e2d6c1] leading-relaxed">
          {battleOutcome.victory
            ? 'Düşman ordusu dağıtıldı ve savaş alanı tamamen kontrolünüz altına geçti.'
            : 'Birlikleriniz ağır kayıplar vererek dağıtıldı. Düşman komutanı sizi ve kalan birliklerinizi kıskaca alarak esir aldı!'}
        </p>
        <div className="p-3.5 rounded bg-black/60 border border-[#c6a15b]/30 text-xs font-mono space-y-2 text-[#d6cbb5] text-left">
          <div className="flex justify-between border-b border-[#c6a15b]/20 pb-1">
            <span>Etkisiz Hale Getirilen Düşman:</span>
            <span className="font-bold text-amber-300">{battleOutcome.enemiesDefeated}</span>
          </div>
          <div className="flex justify-between border-b border-[#c6a15b]/20 pb-1">
            <span>Şehit Sayısı (Kalıcı Kayıp):</span>
            <span className="font-bold text-rose-400">
              {Object.entries(battleOutcome.losses)
                .filter(([, c]) => (c ?? 0) > 0)
                .map(([t, c]) => `${DIVISION_LABEL[t as UnitTierId] || t}: ${c}`)
                .join(', ') || '0 (Kusursuz Zafer)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Yaralı Kurtulanlar (Hekimlik):</span>
            <span className="font-bold text-emerald-400">
              {battleOutcome.wounded &&
              Object.entries(battleOutcome.wounded).filter(([, c]) => (c ?? 0) > 0).length > 0
                ? Object.entries(battleOutcome.wounded)
                    .filter(([, c]) => (c ?? 0) > 0)
                    .map(([t, c]) => `${DIVISION_LABEL[t as UnitTierId] || t}: ${c}`)
                    .join(', ')
                : 'Yok'}
              {battleOutcome.survivalRate !== undefined && (
                <span className="text-gray-400 text-[10px] ml-1">
                  (%{Math.round(battleOutcome.survivalRate * 100)} Cerrah)
                </span>
              )}
            </span>
          </div>
        </div>
        <button
          type="button"
          data-testid="battle-return-btn"
          onClick={() => {
            if (document.pointerLockElement) document.exitPointerLock();
            if (onBattleComplete) {
              onBattleComplete(
                battleOutcome.victory,
                battleOutcome.losses,
                battleOutcome.enemiesDefeated,
              );
            } else {
              onReturnToMap();
            }
          }}
          className={`w-full py-2.5 rounded font-bold text-white border shadow-lg transition-colors cursor-pointer ${
            battleOutcome.victory
              ? 'bg-[#b45309] hover:bg-[#d97706] border-[#fde68a]/50'
              : 'bg-[#7f1d1d] hover:bg-[#991b1b] border-rose-500/50'
          }`}
        >
          {battleOutcome.victory ? '[TAB] Ganimet ve Sefer Haritasına Dön' : '[TAB] Esarete Teslim Ol (Sefer Haritasına Dön)'}
        </button>
      </div>
    </div>
  );
};
