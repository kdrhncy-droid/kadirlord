import React from 'react';
import type { WeaponType, ArmorTier, HelmetType, ShieldType, CharacterAnimState } from '../../game/characterRig';
import type { AttackDirection } from '../../game/arenaTypes';

export interface BattleTestingDockProps {
  isFieldOrSiege: boolean;
  dockCollapsed: boolean;
  setDockCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  activeDockTab: 'WEAPON' | 'ARMOR' | 'ANIM' | 'SETTINGS';
  setActiveDockTab: (tab: 'WEAPON' | 'ARMOR' | 'ANIM' | 'SETTINGS') => void;
  weaponType: WeaponType;
  setWeaponType: (w: WeaponType) => void;
  armorTier: ArmorTier;
  setArmorTier: (a: ArmorTier) => void;
  helmetType: HelmetType;
  setHelmetType: (h: HelmetType) => void;
  shieldType: ShieldType;
  setShieldType: (s: ShieldType) => void;
  factionColor: string;
  setFactionColor: (c: string) => void;
  hasBeard: boolean;
  setHasBeard: React.Dispatch<React.SetStateAction<boolean>>;
  activeAnimLabel: string;
  triggerDirectionalAction: (type: 'attack' | 'block', dir: AttackDirection) => void;
  triggerAnimation: (anim: CharacterAnimState) => void;
  animSpeed: number;
  setAnimSpeed: (s: number) => void;
  isWireframe: boolean;
  setIsWireframe: React.Dispatch<React.SetStateAction<boolean>>;
  onResetTargets: () => void;
}

export const BattleTestingDock: React.FC<BattleTestingDockProps> = ({
  isFieldOrSiege,
  dockCollapsed,
  setDockCollapsed,
  activeDockTab,
  setActiveDockTab,
  weaponType,
  setWeaponType,
  armorTier,
  setArmorTier,
  helmetType,
  setHelmetType,
  shieldType,
  setShieldType,
  factionColor,
  setFactionColor,
  hasBeard,
  setHasBeard,
  activeAnimLabel,
  triggerDirectionalAction,
  triggerAnimation,
  animSpeed,
  setAnimSpeed,
  isWireframe,
  setIsWireframe,
  onResetTargets,
}) => {
  if (isFieldOrSiege) return null;

  return (
    <footer className="relative z-30 pb-3 px-4 flex flex-col items-center pointer-events-none">
      <button
        type="button"
        onClick={() => setDockCollapsed((prev) => !prev)}
        className="mb-1.5 px-4 py-1 rounded-t bg-[#1a140f] border-t border-x border-[#c6a15b]/40 text-[11px] font-bold text-[#fde68a] hover:bg-[#261f18] transition-colors pointer-events-auto shadow-md"
      >
        {dockCollapsed ? '▴ Savaş & Karakter Kontrol Paneli [H]' : '▾ Paneli Gizle [H]'}
      </button>

      {!dockCollapsed && (
        <div
          className="w-full max-w-4xl p-3 rounded-lg border border-[#c6a15b]/40 bg-[#14100c]/95 shadow-2xl pointer-events-auto flex flex-col gap-2.5"
          style={{ backdropFilter: 'none' }}
        >
          {/* DOCK TABS */}
          <div className="flex items-center justify-between border-b border-[#c6a15b]/20 pb-2 text-xs">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'WEAPON', label: '⚔️ Silah & Duruş' },
                  { id: 'ARMOR', label: '🪖 Zırh & Görünüm' },
                  { id: 'ANIM', label: '🎬 Animasyon Testi' },
                  { id: 'SETTINGS', label: '⚙️ Fizik & Ağır Çekim' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDockTab(tab.id)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                    activeDockTab === tab.id
                      ? 'bg-[#b45309] text-white border border-[#fde68a]/40 shadow'
                      : 'bg-[#1e1913] text-[#b5a890] hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-[11px] text-[#fbbf24] font-semibold hidden sm:block">
              Karakter: {weaponType} · {armorTier} · {helmetType}
            </div>
          </div>

          {/* TAB 1: WEAPON */}
          {activeDockTab === 'WEAPON' && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {(
                [
                  { id: 'ONE_HANDED_SWORD', label: 'Tek Elli Kılıç & Kalkan', sub: 'Spatha & Yuvarlak Kalkan', icon: '⚔️' },
                  { id: 'TWO_HANDED_SWORD', label: 'Çift Elli Kılıç (Falx)', sub: 'Yıkıcı Alan Darbesi', icon: '🗡️' },
                  { id: 'BOW', label: 'Kompozit Yay & Ok', sub: 'Menzilli Fizik Atışı', icon: '🏹' },
                  { id: 'SPEAR', label: 'Süvari Kargısı & Mızrak', sub: 'Düz Delici Hamle', icon: '🔱' },
                  { id: 'UNARMED', label: 'Silahsız / Yumruk', sub: 'Güreş & Sokak Dövüşü', icon: '🥊' },
                ] as const
              ).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWeaponType(w.id)}
                  className={`p-2 rounded text-left border transition-all ${
                    weaponType === w.id
                      ? 'bg-[#2b1f13] border-[#f59e0b] text-[#fef08a] shadow'
                      : 'bg-[#18130e] border-[#c6a15b]/20 text-[#a89b84] hover:border-[#c6a15b]/50'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5 truncate">
                    <span>{w.icon}</span>
                    <span className="truncate">{w.label}</span>
                  </div>
                  <div className="text-[10px] text-[#c6a15b] truncate mt-0.5">{w.sub}</div>
                </button>
              ))}
            </div>
          )}

          {/* TAB 2: ARMOR */}
          {activeDockTab === 'ARMOR' && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              {/* Helmets */}
              <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                <span className="text-[10px] text-[#c6a15b] font-bold block">🪖 Miğfer Tipi:</span>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'NONE', label: 'Yok' },
                      { id: 'KETTLE_HAT', label: 'Çanak' },
                      { id: 'SPANGENHELM', label: 'Spangen' },
                      { id: 'IMPERIAL_VISOR', label: 'Katafrakt' },
                    ] as const
                  ).map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setHelmetType(h.id)}
                      className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                        helmetType === h.id
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Armor */}
              <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                <span className="text-[10px] text-[#c6a15b] font-bold block">🥋 Gövde Zırhı:</span>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'CIVILIAN', label: 'Sivil Tunik' },
                      { id: 'LEATHER', label: 'Deri Gambeson' },
                      { id: 'CHAINMAIL', label: 'Örme Zincir' },
                      { id: 'PLATE', label: 'Ağır Katafrakt' },
                    ] as const
                  ).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setArmorTier(a.id)}
                      className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                        armorTier === a.id
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shields */}
              <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                <span className="text-[10px] text-[#c6a15b] font-bold block">🛡️ Kalkan Modeli:</span>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'NONE', label: 'Yok' },
                      { id: 'ROUND_SHIELD', label: 'Yuvarlak' },
                      { id: 'KITE_SHIELD', label: 'Damla' },
                      { id: 'PAVISE', label: 'Pavise' },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setShieldType(s.id)}
                      className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                        shieldType === s.id
                          ? 'bg-[#b45309] text-white'
                          : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Faction Colors & Beard */}
              <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                <span className="text-[10px] text-[#c6a15b] font-bold block">🚩 Krallık Renkleri:</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { color: '#991b1b', name: 'Vlandia' },
                    { color: '#581c87', name: 'Empire' },
                    { color: '#166534', name: 'Battania' },
                    { color: '#1e3a8a', name: 'Sturgia' },
                    { color: '#b45309', name: 'Aserai' },
                    { color: '#047857', name: 'Khuzait' },
                  ].map((f) => (
                    <button
                      key={f.color}
                      type="button"
                      onClick={() => setFactionColor(f.color)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${
                        factionColor === f.color ? 'scale-110 border-white' : 'border-black/50'
                      }`}
                      style={{ backgroundColor: f.color }}
                      title={f.name}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setHasBeard((b) => !b)}
                  className="w-full mt-1 py-0.5 rounded text-[10px] font-bold bg-[#241c14] hover:bg-[#34281c] text-[#d6cbb5]"
                >
                  {hasBeard ? '🧔 Sakal: Var' : '🧑 Sakal: Yok (Tıraşlı)'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ANIMATION TESTER */}
          {activeDockTab === 'ANIM' && (
            <div className="flex flex-col gap-2 text-xs">
              {/* 4 Directional Attacks & Blocks */}
              <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded bg-[#18130e] border border-[#c6a15b]/20">
                <span className="text-[10px] text-[#fbbf24] font-bold mr-1">⚔️ 4 Yönlü Saldırı:</span>
                {(
                  [
                    { dir: 'up', label: '⬆️ Üst (Overhead)' },
                    { dir: 'down', label: '⬇️ Delici (Thrust)' },
                    { dir: 'left', label: '⬅️ Sol Savurma' },
                    { dir: 'right', label: '➡️ Sağ Savurma' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.dir}
                    type="button"
                    onClick={() => triggerDirectionalAction('attack', item.dir)}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                      activeAnimLabel === `ATTACK_${item.dir.toUpperCase()}`
                        ? 'bg-[#b45309] text-white shadow'
                        : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}

                <span className="text-[10px] text-[#38bdf8] font-bold ml-2 mr-1">🛡️ 4 Yönlü Blok:</span>
                {(
                  [
                    { dir: 'up', label: '⬆️ Üst Blok' },
                    { dir: 'down', label: '⬇️ Alt Blok' },
                    { dir: 'left', label: '⬅️ Sol Blok' },
                    { dir: 'right', label: '➡️ Sağ Blok' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.dir}
                    type="button"
                    onClick={() => triggerDirectionalAction('block', item.dir)}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                      activeAnimLabel === `BLOCK_${item.dir.toUpperCase()}`
                        ? 'bg-[#0369a1] text-white shadow'
                        : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* General Actions */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'IDLE', label: 'Duruş (Idle)' },
                    { id: 'WALK', label: 'Yürü' },
                    { id: 'RUN', label: 'Koş' },
                    { id: 'BOW_DRAW', label: '🏹 Yay Çek' },
                    { id: 'BOW_RELEASE', label: '🎯 Oku Fırlat' },
                    { id: 'SHIELD_BASH', label: '🛡️ Kalkan Vur (BannerPage)' },
                    { id: 'KICK', label: '🦶 Tekme (Warband)' },
                    { id: 'HIT_STAGGER', label: '💥 Darbe Al' },
                    { id: 'FALL_DEFEAT', label: '☠️ Yere Düş (Yenilgi)' },
                  ] as const
                ).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => triggerAnimation(a.id)}
                    className={`px-2.5 py-1.5 rounded text-[11px] font-bold transition-colors ${
                      activeAnimLabel === a.id
                        ? 'bg-[#b45309] text-white shadow'
                        : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeDockTab === 'SETTINGS' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center text-xs">
              {/* Speed slider */}
              <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-[#c6a15b] font-bold">⏱️ Animasyon & Fizik Hızı:</span>
                  <span className="font-mono text-[#fbbf24] font-bold">{animSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.1"
                  value={animSpeed}
                  onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
                  className="w-full accent-[#f59e0b] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-[#78716c] mt-0.5">
                  <span>0.1x (Ağır Çekim)</span>
                  <span>1.0x (Normal)</span>
                  <span>1.5x (Hızlı)</span>
                </div>
              </div>

              {/* Wireframe */}
              <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 flex items-center justify-between">
                <div>
                  <span className="font-bold text-[#f8f0df] block text-[11px]">3B Tel Kafes (Wireframe)</span>
                  <span className="text-[10px] text-[#a89b84]">Düşük poligon ağ yapısını incele</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWireframe((w) => !w)}
                  className={`px-3 py-1 rounded text-[11px] font-bold ${
                    isWireframe ? 'bg-[#15803d] text-white' : 'bg-[#2b2218] text-[#a89b84]'
                  }`}
                >
                  {isWireframe ? 'AÇIK' : 'KAPALI'}
                </button>
              </div>

              {/* Reset targets */}
              <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-[#f8f0df] block text-[11px]">Hedef ve Bot Sıfırla</span>
                  <span className="text-[10px] text-[#a89b84]">Kukla pozisyonunu ve okları yenile</span>
                </div>
                <button
                  type="button"
                  onClick={onResetTargets}
                  className="px-3 py-1 rounded text-[11px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white whitespace-nowrap"
                >
                  Sıfırla
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </footer>
  );
};
