import React, { useEffect, useState } from 'react';
import {
  BATTLE_SCALE_PRESETS,
  BattleScaleId,
  MAX_CORPSE_POOL,
  MAX_PROJECTILE_POOL,
  PrewarmStageReport,
} from '../game/battleEnginePool';

interface BattlePrewarmModalProps {
  title: string;
  subtitle: string;
  scaleId: BattleScaleId;
  siegeEnabled: boolean;
  stages: PrewarmStageReport[];
  onComplete: () => void;
}

const BANNERLORD_BATTLE_TIPS = [
  'Nesne Havuzlama (Object Pooling): 10.000 ok ve 10.000 ceset matrisi savaş başlamadan önce RAM ve VRAM üzerinde sabitlenir; savaş anında tek bir byte bile (new Object) tahsis edilmez.',
  'Kalkan Duvarı [F2]: Piyadeleriniz kalkan duvarı düzenindeyken düşman ok yağmurlarına karşı %82 ek koruma kazanır.',
  'Kuşatma Taarruzu: Koçbaşı (Battering Ram) kale kapısına ulaştığında meşe kapıları kırar; Kuşatma Kuleleri ise surlara rampa indirir.',
  'Süvari Hücumu [M]: Savaş atınızla dörtnala (Shift) koşarken düşman piyade hatlarına çarpmak yıkıcı ezme hasarı (+45) verir.',
];

export const BattlePrewarmModal: React.FC<BattlePrewarmModalProps> = ({
  title,
  subtitle,
  scaleId,
  siegeEnabled,
  stages,
  onComplete,
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [tipIndex] = useState(() => Math.floor(Math.random() * BANNERLORD_BATTLE_TIPS.length));

  const preset = BATTLE_SCALE_PRESETS[scaleId];
  const currentStage: PrewarmStageReport =
    stages[Math.min(stepIdx, stages.length - 1)] ?? {
      stageIndex: 5,
      totalStages: 5,
      progressPercent: 100,
      title: 'Savaş Meydanı Hazır',
      detail: 'Tüm havuzlar ve GPU shader programları derlendi.',
      allocatedBytes: 514048,
      corpseSlotsReady: MAX_CORPSE_POOL,
      arrowSlotsReady: MAX_PROJECTILE_POOL,
      soldierSlotsReady: preset.totalSoldiers,
    };

  useEffect(() => {
    if (stepIdx < stages.length - 1) {
      const timer = setTimeout(() => {
        setStepIdx((prev) => prev + 1);
      }, 170);
      return () => clearTimeout(timer);
    } else {
      const doneTimer = setTimeout(() => {
        onComplete();
      }, 320);
      return () => clearTimeout(doneTimer);
    }
  }, [stepIdx, stages.length, onComplete]);

  return (
    <div
      data-testid="battle-prewarm-modal"
      className="fixed inset-0 z-50 flex flex-col justify-between p-8 bg-[#0b0907]/96 text-[#f8f0df] select-none pointer-events-auto"
    >
      {/* Top Banner Header */}
      <div className="flex items-center justify-between border-b border-[#c6a15b]/35 pb-4">
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-[#fbbf24]">
            ⚔️ SANCAK-I KALRADYA · ÖN-TAHSİSAT VE GPU BELLEK HAVUZLAMA MOTORU
          </div>
          <h2 className="text-2xl font-display font-bold text-[#f8f0df] mt-0.5">
            {title}
          </h2>
          <p className="text-xs text-[#c7baa3] mt-0.5">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded bg-[#18130e] border border-[#c6a15b]/40 text-right font-mono-tabular">
            <div className="text-[10px] text-[#a89b84]">MUHAREBE ÖLÇEĞİ</div>
            <div className="text-xs font-bold text-[#fde68a]">
              {preset.label} {siegeEnabled ? '· 🏰 KUŞATMA' : '· ⚔️ MEYDAN'}
            </div>
          </div>
          <button
            type="button"
            data-testid="prewarm-skip-btn"
            onClick={onComplete}
            className="px-4 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/60 shadow cursor-pointer transition-colors"
          >
            Hemen Savaşa Gir ➔
          </button>
        </div>
      </div>

      {/* Center Pre-Allocated Object Pool Telemetry Cards */}
      <div className="my-auto max-w-4xl w-full mx-auto space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-tabular">
          <div className="p-3.5 rounded-lg bg-[#15110c] border border-[#c6a15b]/35 shadow-lg">
            <div className="text-[10px] font-bold text-[#c6a15b] uppercase">
              🏹 Ok & Mühimmat Havuzu
            </div>
            <div className="text-xl font-bold text-[#fde68a] mt-1">
              {currentStage.arrowSlotsReady.toLocaleString('tr-TR')} / 10.000
            </div>
            <div className="text-[10px] text-[#86efac] mt-0.5">
              Ring-Buffer Hazır (1 Draw Call)
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#15110c] border border-[#c6a15b]/35 shadow-lg">
            <div className="text-[10px] font-bold text-[#c6a15b] uppercase">
              ☠️ Ölü Asker / Ceset Havuzu
            </div>
            <div className="text-xl font-bold text-[#fde68a] mt-1">
              {currentStage.corpseSlotsReady.toLocaleString('tr-TR')} / 10.000
            </div>
            <div className="text-[10px] text-[#86efac] mt-0.5">
              Sıfır GC Sabit Slot (1 Draw Call)
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#15110c] border border-[#c6a15b]/35 shadow-lg">
            <div className="text-[10px] font-bold text-[#c6a15b] uppercase">
              🛡️ Canlı Ordu (Instanced LOD)
            </div>
            <div className="text-xl font-bold text-[#fde68a] mt-1">
              {preset.totalSoldiers.toLocaleString('tr-TR')} Asker
            </div>
            <div className="text-[10px] text-[#86efac] mt-0.5">
              {preset.alliesCount} Müttefik vs {preset.enemiesCount} Düşman
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-[#15110c] border border-[#c6a15b]/35 shadow-lg">
            <div className="text-[10px] font-bold text-[#c6a15b] uppercase">
              💾 Tahsis Edilen Sabit RAM
            </div>
            <div className="text-xl font-bold text-[#34d399] mt-1">
              {Math.round(currentStage.allocatedBytes / 1024)} KB
            </div>
            <div className="text-[10px] text-[#a89b84] mt-0.5">
              Float32Array SoA · 0 ms Takılma
            </div>
          </div>
        </div>

        {/* Stage Checklist */}
        <div className="p-4 rounded-lg bg-[#14100c] border border-[#c6a15b]/30 space-y-2">
          {stages.map((st, idx) => {
            const isDone = idx <= stepIdx;
            const isCurrent = idx === stepIdx;
            return (
              <div
                key={st.stageIndex}
                className={`flex items-center justify-between text-xs px-3 py-1.5 rounded border ${
                  isCurrent
                    ? 'bg-[#261c12] border-[#f59e0b]/60 text-[#fef08a]'
                    : isDone
                      ? 'bg-[#18130e] border-[#c6a15b]/20 text-[#86efac]'
                      : 'bg-[#110e0a] border-transparent text-[#78716c]'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <span>{isDone ? '✓' : '○'}</span>
                  <span>{st.title}</span>
                </div>
                <span className="text-[11px] text-[#c7baa3] hidden sm:inline">
                  {st.detail}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Progress Bar & Tip */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#fbbf24]">{currentStage.title}</span>
          <span className="font-mono font-bold text-[#fde68a]">
            %{currentStage.progressPercent}
          </span>
        </div>
        <div className="w-full h-3 rounded-full bg-[#1c1610] border border-[#c6a15b]/40 overflow-hidden">
          <div
            className="h-full bg-[#d97706] transition-all duration-150"
            style={{ width: `${currentStage.progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-[#b5a890] italic">
          💡 <strong className="text-[#fde68a] not-italic">Muharebe İpucu:</strong>{' '}
          {BANNERLORD_BATTLE_TIPS[tipIndex]}
        </p>
      </div>
    </div>
  );
};
