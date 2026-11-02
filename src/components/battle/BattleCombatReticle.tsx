import React from 'react';
import type { ShieldType, WeaponType } from '../../game/characterRig';
import type { AttackDirection } from '../../game/characterAnimator';

export interface BattleCombatReticleProps {
  controlMode: 'INSPECTOR' | 'PLAYABLE';
  weaponType: WeaponType;
  shieldType: ShieldType;
  isAimingBow: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  combatDirection: AttackDirection;
  bowPowerLabelRef: React.RefObject<HTMLSpanElement | null>;
  bowPowerBarRef: React.RefObject<HTMLDivElement | null>;
  isFieldOrSiege: boolean;
}

export const BattleCombatReticle: React.FC<BattleCombatReticleProps> = ({
  controlMode,
  weaponType,
  shieldType,
  isAimingBow,
  isAttacking,
  isBlocking,
  combatDirection,
  bowPowerLabelRef,
  bowPowerBarRef,
  isFieldOrSiege,
}) => {
  if (controlMode !== 'PLAYABLE') return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-25">
      {weaponType === 'BOW' ? (
        /* Archery Reticle */
        <div className="relative flex flex-col items-center justify-center">
          <div
            className={`relative flex items-center justify-center transition-all duration-150 ${
              isAimingBow ? 'scale-75' : 'scale-100'
            }`}
          >
            <div
              className={`w-10 h-10 border border-[#fde68a]/60 rounded-full transition-all duration-200 ${
                isAimingBow ? 'scale-60 border-amber-400 bg-amber-400/10' : 'scale-100'
              }`}
            />
            <div className="absolute w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
          </div>
          {/* Canlı çekiş gücü çubuğu — her karede anim.getBowDrawProgress() ile güncellenir */}
          <div
            className={`mt-5 w-44 transition-opacity duration-150 ${isAimingBow ? 'opacity-100' : 'opacity-0'}`}
          >
            <div className="flex items-center justify-between text-[9px] font-bold tracking-widest text-[#c6a15b] mb-1">
              <span>ÇEKİŞ</span>
              <span ref={bowPowerLabelRef}>0%</span>
            </div>
            <div className="relative h-2 w-full rounded-sm bg-black/70 border border-[#c6a15b]/50 overflow-hidden">
              {/* %25 eşik çizgisi: altında bırakılırsa ok takılı kalır */}
              <div className="absolute top-0 bottom-0 left-1/4 w-px bg-red-400/80" />
              <div
                ref={bowPowerBarRef}
                className="h-full w-0 bg-gradient-to-r from-[#a16207] via-[#f59e0b] to-[#fde68a]"
              />
            </div>
          </div>
          {!isFieldOrSiege && (
            <>
              <div className="mt-2 text-[11px] font-bold tracking-wider px-2.5 py-0.5 rounded bg-black/60 border border-[#c6a15b]/40 backdrop-blur-none text-[#fbbf24]">
                {isAimingBow ? '🏹 NİŞAN ALINIYOR (Bırak: Fırlat | Sağ Tık: İptal)' : '🏹 Sol Tık: Ger & Nişan Al'}
              </div>
              {isAimingBow && (
                <div className="mt-1.5 text-[9px] tracking-wide px-2 py-0.5 rounded bg-black/50 text-[#a8a29e]">
                  %25 altında bırakırsan ok takılı kalır
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Authentic Mount & Blade: Warband 4-Directional Combat Reticle & Bars */
        <div className="relative flex flex-col items-center justify-center pointer-events-none select-none">
          <div className="relative w-36 h-36 flex items-center justify-center">
            {/* Merkez Blok Kalkan Simgesi (Yalnızca Kalkan Blokundayken) */}
            {isBlocking && shieldType !== 'NONE' && (
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,0.85)]"
                >
                  <path
                    d="M12 2.5L4.5 5.8V11.6C4.5 16.5 7.7 20.8 12 22.2C16.3 20.8 19.5 16.5 19.5 11.6V5.8L12 2.5Z"
                    fill="currentColor"
                    fillOpacity="0.32"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            )}

            {/* Warband Orijinal Yön Oku Degrade Tanımları */}
            <svg width="0" height="0" className="absolute">
              <defs>
                <linearGradient id="wbArenaAttackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#fffee0" />
                  <stop offset="30%" stopColor="#fff266" />
                  <stop offset="75%" stopColor="#facc15" />
                  <stop offset="100%" stopColor="#ca8a04" />
                </linearGradient>
                <linearGradient id="wbArenaBlockGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#f0f9ff" />
                  <stop offset="35%" stopColor="#7dd3fc" />
                  <stop offset="80%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#0284c7" />
                </linearGradient>
              </defs>
            </svg>

            {/* WARBAND TEK YÖNLÜ PARLAK SALDIRI / SAVUNMA OKU */}
            {(
              [
                {
                  dir: 'up' as const,
                  posStyle: { top: '4px', left: '50%', transform: 'translateX(-50%)' },
                  rotation: 0,
                },
                {
                  dir: 'down' as const,
                  posStyle: { bottom: '4px', left: '50%', transform: 'translateX(-50%)' },
                  rotation: 180,
                },
                {
                  dir: 'left' as const,
                  posStyle: { left: '4px', top: '50%', transform: 'translateY(-50%)' },
                  rotation: -90,
                },
                {
                  dir: 'right' as const,
                  posStyle: { right: '4px', top: '50%', transform: 'translateY(-50%)' },
                  rotation: 90,
                },
              ] as const
            ).map(({ dir, posStyle, rotation }) => {
              const isSelected = combatDirection === dir;
              const isCurAttack = isSelected && isAttacking;
              const isCurBlock = isSelected && isBlocking;
              const isVisible = isCurAttack || isCurBlock;

              return (
                <div
                  key={dir}
                  className={`absolute transition-all duration-75 flex items-center justify-center pointer-events-none ${
                    isVisible ? '' : 'hidden'
                  }`}
                  style={{
                    ...posStyle,
                    filter: isCurBlock
                      ? 'drop-shadow(0 0 8px rgba(56,189,248,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.85))'
                      : isCurAttack
                        ? 'drop-shadow(0 0 8px rgba(250,204,21,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.85))'
                        : 'none',
                  }}
                >
                  {/* Mount & Blade Warband Orijinal Yön Oku (Yuvarlak Başlı & İnce Gövdeli) */}
                  <svg
                    width="24"
                    height="46"
                    viewBox="0 0 32 64"
                    fill="none"
                    style={{ transform: `rotate(${rotation}deg)` }}
                  >
                    <path
                      d="M 16 3
                         C 18.8 3, 22.8 7.5, 23.2 14.5
                         C 23.5 18.2, 21.2 20.8, 18.8 21.8
                         L 18.8 59
                         C 18.8 61.2, 13.2 61.2, 13.2 59
                         L 13.2 21.8
                         C 10.8 20.8, 8.5 18.2, 8.8 14.5
                         C 9.2 7.5, 13.2 3, 16 3 Z"
                      fill={isCurBlock ? 'url(#wbArenaBlockGrad)' : 'url(#wbArenaAttackGrad)'}
                      stroke={isCurBlock ? '#0284c7' : '#78350f'}
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              );
            })}
          </div>

          {!isFieldOrSiege && (
            <>
              {/* Warband Yön Bilgi Rozeti */}
              <div className="mt-3 flex items-center gap-2 text-[11px] font-bold tracking-wider px-3 py-1 rounded-sm bg-black/80 border border-[#c6a15b]/50 backdrop-blur-sm text-[#fbbf24] shadow-lg">
                <span>
                  {isBlocking
                    ? `🛡️ SAVUNMA: ${
                        combatDirection === 'up'
                          ? 'ÜST BLOK'
                          : combatDirection === 'down'
                            ? 'ALT BLOK'
                            : combatDirection === 'left'
                              ? 'SOL BLOK'
                              : 'SAĞ BLOK'
                      }`
                    : isAttacking
                      ? `⚔️ SALDIRI: ${
                          combatDirection === 'up'
                            ? 'TEPEDEN KESİŞ'
                            : combatDirection === 'down'
                              ? 'DÜRTME / SAPLAMA'
                              : combatDirection === 'left'
                                ? 'SOL SAVURMA'
                                : 'SAĞ SAVURMA'
                        }`
                      : `${
                          combatDirection === 'up'
                            ? '⬆️ ÜST VURUŞ / BLOK'
                            : combatDirection === 'down'
                              ? '⬇️ SAPLAMA / ALT BLOK'
                              : combatDirection === 'left'
                                ? '⬅️ SOL KESİK / BLOK'
                                : '➡️ SAĞ KESİK / BLOK'
                        }`}
                </span>
                {shieldType !== 'NONE' && (
                  <span className="text-[10px] text-emerald-400 font-semibold border-l border-[#c6a15b]/40 pl-2">
                    🛡️ Kalkan Koruması Aktif
                  </span>
                )}
              </div>

              {/* BannerPage / Warband Kontrol Kılavuzu Rozeti */}
              <div className="mt-1.5 flex items-center gap-2 text-[10px] tracking-wide px-2.5 py-0.5 rounded bg-black/60 border border-[#c6a15b]/30 text-[#d1c5b0]">
                <span>[Sol Tık] Saldır</span>
                <span>•</span>
                <span>[Sağ Tık] Blok</span>
                <span>•</span>
                <span className="text-[#fbbf24] font-bold">[E] Tekme</span>
                <span>•</span>
                <span className="text-sky-300 font-bold">[Sağ Tık + Sol Tık] Kalkan Darbesi</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
