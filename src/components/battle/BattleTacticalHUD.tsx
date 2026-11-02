import React from 'react';
import type { ArenaBattleMode } from '../../game/arenaTypes';
import type { DivisionId, FireOrder, FormationOrder, FormationArrangement } from '../../game/tacticalFormation';
import type { BattleScaleId } from '../../game/battleEnginePool';

export interface BattleTacticalHUDProps {
  arenaBattleMode: ArenaBattleMode;
  activeTacticalMenu: 'MOVEMENT' | 'FACING' | 'FORMATION' | null;
  setActiveTacticalMenu: React.Dispatch<React.SetStateAction<'MOVEMENT' | 'FACING' | 'FORMATION' | null>>;
  issueHoldPositionOrder: () => void;
  showOrderShout: (text: string) => void;
  formationOrder: FormationOrder;
  setFormationOrder: (order: FormationOrder) => void;
  formationArrangement: FormationArrangement;
  setFormationArrangement: (arr: FormationArrangement) => void;
  fireOrder: FireOrder;
  setFireOrder: (fo: FireOrder) => void;
  isFieldOrSiege: boolean;
  selectedDivision: DivisionId;
  setSelectedDivision: (div: DivisionId) => void;
  battleScale: BattleScaleId;
  setBattleScale: (s: BattleScaleId) => void;
  siegeEnabled: boolean;
  setSiegeEnabled: (s: boolean) => void;
  launchMassBattleWithPrewarm: (scale: BattleScaleId, siege: boolean, resetScene?: boolean) => void;
}

export const BattleTacticalHUD: React.FC<BattleTacticalHUDProps> = ({
  arenaBattleMode,
  activeTacticalMenu,
  setActiveTacticalMenu,
  issueHoldPositionOrder,
  showOrderShout,
  formationOrder,
  setFormationOrder,
  formationArrangement,
  setFormationArrangement,
  fireOrder,
  setFireOrder,
  isFieldOrSiege,
  selectedDivision,
  setSelectedDivision,
  battleScale,
  setBattleScale,
  siegeEnabled,
  setSiegeEnabled,
  launchMassBattleWithPrewarm,
}) => {
  if (arenaBattleMode !== 'SKIRMISH' && arenaBattleMode !== 'MASS_BATTLE') {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Active F1 / F2 / F3 Sub-Menu Popup Cards */}
      {activeTacticalMenu && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#100d0a]/95 border-2 border-[#fbbf24]/70 text-xs pointer-events-auto shadow-2xl">
          <span className="text-[#fbbf24] font-black tracking-wider uppercase mr-1">
            {activeTacticalMenu === 'MOVEMENT'
              ? 'F1 HAREKET EMİRLERİ:'
              : activeTacticalMenu === 'FACING'
                ? 'F2 YÖN EMİRLERİ:'
                : 'F3 DİZİLİŞ DÜZENLERİ:'}
          </span>

          {activeTacticalMenu === 'MOVEMENT' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  issueHoldPositionOrder();
                  setActiveTacticalMenu(null);
                  showOrderShout('🚩 BU KONUMU TUT!');
                }}
                className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
              >
                [F1] Bu Konumu Tut
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormationOrder('FOLLOW_ME');
                  setActiveTacticalMenu(null);
                  showOrderShout('🛡️ BENİ TAKİP ET!');
                }}
                className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
              >
                [F2] Beni Takip Et
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormationOrder('CHARGE');
                  setActiveTacticalMenu(null);
                  showOrderShout('⚔️ TÜM GÜCÜNÜZLE HÜCUM EDİN!');
                }}
                className="px-2.5 py-1 rounded bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-rose-400/60 font-bold"
              >
                [F3] Hücum Et
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormationOrder('ADVANCE');
                  setActiveTacticalMenu(null);
                  showOrderShout('🏹 İLERLEYİN VE ATEŞ AÇIN!');
                }}
                className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
              >
                [F4] İlerle
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormationOrder('RETREAT');
                  setActiveTacticalMenu(null);
                  showOrderShout('🛡️ GERİ ÇEKİLİN!');
                }}
                className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
              >
                [F5] Geri Çekil
              </button>
              <button
                type="button"
                onClick={() => setActiveTacticalMenu(null)}
                className="px-2 py-1 rounded bg-stone-800 text-stone-300 text-[10px]"
              >
                [Esc] Kapat
              </button>
            </div>
          )}

          {activeTacticalMenu === 'FACING' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTacticalMenu(null);
                  showOrderShout('⚔️ DÜŞMANA DÖNÜN!');
                }}
                className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
              >
                [F1] Düşmana Dön
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTacticalMenu(null);
                  showOrderShout('🧭 İLERİ YÖNE DÖNÜN!');
                }}
                className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
              >
                [F2] İleri Yöne Dön
              </button>
              <button
                type="button"
                onClick={() => setActiveTacticalMenu(null)}
                className="px-2 py-1 rounded bg-stone-800 text-stone-300 text-[10px]"
              >
                [Esc] Kapat
              </button>
            </div>
          )}

          {activeTacticalMenu === 'FORMATION' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'LINE' as const, label: '[F1] Çizgi (Line)' },
                  { id: 'SHIELD_WALL' as const, label: '[F2] 🛡️ Kalkan Duvarı' },
                  { id: 'LOOSE' as const, label: '[F3] Dağınık (Loose)' },
                  { id: 'SQUARE' as const, label: '[F4] ⬛ Kare (Square)' },
                  { id: 'WEDGE' as const, label: '[F5] 🔺 Kama (Wedge)' },
                  { id: 'COLUMN' as const, label: '[F6] ║ Kolon (Column)' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFormationArrangement(f.id);
                    setActiveTacticalMenu(null);
                    showOrderShout(`${f.label.split(' ')[1] || f.label} Düzenine Geçildi!`);
                  }}
                  className={`px-2.5 py-1 rounded font-bold border transition-colors ${
                    formationArrangement === f.id
                      ? 'bg-[#991b1b] text-[#fde68a] border-[#fbbf24]'
                      : 'bg-[#2a1e12] text-[#d6cbb5] border-[#c6a15b]/40 hover:bg-[#3d2c1a]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setActiveTacticalMenu(null)}
                className="px-2 py-1 rounded bg-stone-800 text-stone-300 text-[10px]"
              >
                [Esc] Kapat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Division Cards and Tactical Command Toolbar */}
      {(!isFieldOrSiege || activeTacticalMenu) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded bg-[#14100c]/95 border border-[#c6a15b]/40 text-xs pointer-events-auto shadow-xl">
          <div className="flex items-center gap-1.5">
            <span className="text-[#c6a15b] font-bold mr-1">BÖLÜK:</span>
            {(
              [
                { id: 'ALL' as const, label: '0: Tümü' },
                { id: 'INFANTRY' as const, label: '1: Piyade' },
                { id: 'ARCHERS' as const, label: '2: Okçular' },
                { id: 'CAVALRY' as const, label: '3: Süvari' },
                { id: 'HORSE_ARCHERS' as const, label: '4: Atlı Okçu' },
              ] as const
            ).map((div) => (
              <button
                key={div.id}
                type="button"
                onClick={() => setSelectedDivision(div.id)}
                className={`px-2 py-0.5 rounded font-bold transition-colors ${
                  selectedDivision === div.id
                    ? 'bg-[#b45309] text-white border border-amber-300/50'
                    : 'bg-[#1f1913] text-[#a89b84] hover:text-white'
                }`}
              >
                {div.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#c6a15b] font-bold mr-1">KOMUT [F]:</span>
            <button
              type="button"
              onClick={() => setActiveTacticalMenu((m) => (m === 'MOVEMENT' ? null : 'MOVEMENT'))}
              className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                activeTacticalMenu === 'MOVEMENT'
                  ? 'bg-amber-600 text-white border border-amber-300'
                  : 'bg-[#1f1913] text-[#d6cbb5] hover:bg-[#2c231b]'
              }`}
            >
              [F1] Hareket ({formationOrder})
            </button>
            <button
              type="button"
              onClick={() => setActiveTacticalMenu((m) => (m === 'FACING' ? null : 'FACING'))}
              className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                activeTacticalMenu === 'FACING'
                  ? 'bg-amber-600 text-white border border-amber-300'
                  : 'bg-[#1f1913] text-[#d6cbb5] hover:bg-[#2c231b]'
              }`}
            >
              [F2] Yön
            </button>
            <button
              type="button"
              onClick={() => setActiveTacticalMenu((m) => (m === 'FORMATION' ? null : 'FORMATION'))}
              className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                activeTacticalMenu === 'FORMATION'
                  ? 'bg-amber-600 text-white border border-amber-300'
                  : 'bg-[#1f1913] text-[#d6cbb5] hover:bg-[#2c231b]'
              }`}
            >
              [F3] Düzen ({formationArrangement})
            </button>
            <button
              type="button"
              onClick={() => {
                const next = fireOrder === 'FREE_FIRE' ? 'HOLD_FIRE' : 'FREE_FIRE';
                setFireOrder(next);
                showOrderShout(next === 'FREE_FIRE' ? '🏹 ATEŞ SERBEST!' : '🏹 ATEŞİ KES!');
              }}
              className={`ml-1 px-2.5 py-0.5 rounded font-bold border transition-colors ${
                fireOrder === 'FREE_FIRE'
                  ? 'bg-amber-900/60 text-amber-200 border-amber-500/40'
                  : 'bg-stone-800 text-stone-400 border-stone-600'
              }`}
            >
              [F4] {fireOrder === 'FREE_FIRE' ? 'Ateş Serbest' : 'Ateşi Kes'}
            </button>
          </div>

          {/* Faz 3 & Faz 4: Battle Scale (50v50 / 250v250 / 500v500) + Siege Engines + Prewarm Trigger */}
          {!isFieldOrSiege && arenaBattleMode === 'MASS_BATTLE' && (
            <div className="w-full pt-1.5 mt-1 border-t border-[#c6a15b]/25 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[#fbbf24] font-bold">ÖLÇEK SEÇİMİ:</span>
                {(
                  [
                    { id: 'SKIRMISH_50' as BattleScaleId, label: '50v50 (Öncü)' },
                    { id: 'CLASH_150' as BattleScaleId, label: '150v150 (Meydan)' },
                    { id: 'BATTLE_250' as BattleScaleId, label: '250v250 (Büyük)' },
                    { id: 'EPIC_500' as BattleScaleId, label: '500v500 (1000 Asker)' },
                  ] as const
                ).map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    data-testid={`scale-btn-${sc.id}`}
                    onClick={() => {
                      setBattleScale(sc.id);
                      launchMassBattleWithPrewarm(sc.id, siegeEnabled, true);
                    }}
                    className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                      battleScale === sc.id
                        ? 'bg-[#b45309] text-white border border-[#fde68a]/50'
                        : 'bg-[#1f1913] text-[#a89b84] hover:text-white'
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="toggle-siege-btn"
                  onClick={() => {
                    const next = !siegeEnabled;
                    setSiegeEnabled(next);
                    launchMassBattleWithPrewarm(battleScale, next, false);
                  }}
                  className={`px-2.5 py-0.5 rounded font-bold border transition-colors ${
                    siegeEnabled
                      ? 'bg-amber-800 text-[#fef08a] border-amber-400'
                      : 'bg-[#1f1913] text-[#a89b84] border-[#c6a15b]/30'
                  }`}
                >
                  🏰 {siegeEnabled ? 'Kuşatma: AÇIK' : 'Kuşatma: KAPALI'}
                </button>

                <button
                  type="button"
                  data-testid="retrigger-prewarm-btn"
                  onClick={() => launchMassBattleWithPrewarm(battleScale, siegeEnabled, true)}
                  className="px-2.5 py-0.5 rounded font-bold bg-[#261c12] hover:bg-[#38291b] text-[#fbbf24] border border-[#f59e0b]/50"
                >
                  🔄 Ön Yükleme Havuzu
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
