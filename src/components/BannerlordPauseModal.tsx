import React, { useState, useMemo } from 'react';
import {
  type CampaignState,
  getTotalTroops,
} from '../game/rules';
import {
  type SaveData,
  type SaveSlotInfo,
  type SaveInput,
  defaultStorage,
  readAllSlots,
  writeSaveToSlot,
  deleteSaveSlot,
} from '../game/saveGame';
import { sound } from '../game/sound';
import { Shield, Coins, Star, Calendar, Trash2, ArrowLeft, Volume2, Monitor } from 'lucide-react';

interface BannerlordPauseModalProps {
  campaign: CampaignState;
  saveInput: SaveInput;
  onResume: () => void;
  onLoadSave: (saveData: SaveData) => void;
  onExitToTitle: () => void;
  onShowToast: (msg: string) => void;
  initialView?: PauseView;
}

type PauseView = 'menu' | 'load' | 'save_as' | 'options';

export const BannerlordPauseModal: React.FC<BannerlordPauseModalProps> = ({
  campaign,
  saveInput,
  onResume,
  onLoadSave,
  onExitToTitle,
  onShowToast,
  initialView = 'menu',
}) => {
  const [view, setView] = useState<PauseView>(initialView);
  const [masterVolume, setMasterVolume] = useState<number>(80);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const storage = useMemo(() => defaultStorage(), []);
  const slots = useMemo<SaveSlotInfo[]>(() => {
    return readAllSlots(storage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, refreshTrigger]);

  const handleQuickSave = () => {
    const ok = writeSaveToSlot(storage, 'quick', saveInput);
    if (ok) {
      sound.playCoin();
      onShowToast(`Sefer hızlı kaydedildi (Hızlı Kayıt) · Gün ${campaign.day}`);
      setRefreshTrigger((prev) => prev + 1);
    } else {
      onShowToast('Kayıt yazılamadı (depolama kapalı).');
    }
  };

  const handleSaveToSlot = (slotId: string, slotName: string) => {
    const ok = writeSaveToSlot(storage, slotId, saveInput);
    if (ok) {
      sound.playCoin();
      onShowToast(`Sefer kaydedildi (${slotName}) · Gün ${campaign.day}`);
      setRefreshTrigger((prev) => prev + 1);
      setView('menu');
    } else {
      onShowToast('Kayıt yazılamadı.');
    }
  };

  const handleDeleteSlot = (slotId: string, slotName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSaveSlot(storage, slotId);
    sound.playShieldHit();
    onShowToast(`${slotName} kaydı silindi.`);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleSaveAndExit = () => {
    writeSaveToSlot(storage, 'slot1', saveInput);
    onShowToast('Sefer kaydedildi ve ana menüye dönülüyor.');
    onExitToTitle();
  };

  return (
    <div
      data-testid="bannerlord-pause-modal"
      className="fixed inset-0 modal-anim-in z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-none pointer-events-auto select-none"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-xl border-2 border-[#c6a15b]/80 bg-[#14110d] text-[#f4ecd8] shadow-2xl p-6 flex flex-col items-center">
        {/* VIEW: MAIN PAUSE MENU */}
        {view === 'menu' && (
          <div className="w-full flex flex-col items-center">
            <h2 className="text-2xl font-display font-bold text-[#fde68a] tracking-wider uppercase drop-shadow mb-1">
              SEFER DURAKLATILDI
            </h2>
            <p className="text-xs text-[#a89b84] mb-4">
              {campaign.playerName} · Gün {campaign.day} ({campaign.season})
            </p>

            {/* QUICK STATS BOX */}
            <div className="w-full grid grid-cols-3 gap-2 p-3 mb-5 rounded-lg border border-[#c6a15b]/30 bg-[#1c1813] text-center font-mono">
              <div>
                <span className="text-[10px] text-[#a89b84] block">Asker</span>
                <span className="text-sm font-bold text-[#f4ecd8]">
                  {getTotalTroops(campaign.roster)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#a89b84] block">Hazine</span>
                <span className="text-sm font-bold text-[#fbbf24]">{Math.round(campaign.gold)}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#a89b84] block">Şöhret</span>
                <span className="text-sm font-bold text-[#34d399]">{campaign.renown}</span>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="w-full space-y-2">
              <button
                type="button"
                data-testid="pause-resume-btn"
                onClick={onResume}
                className="w-full py-2.5 px-4 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/50 shadow transition uppercase tracking-wider"
              >
                Oyuna Dön [Esc]
              </button>

              <button
                type="button"
                data-testid="pause-save-btn"
                onClick={handleQuickSave}
                className="w-full py-2.5 px-4 rounded text-xs font-bold bg-[#166534] hover:bg-[#15803d] text-[#ecfdf5] border border-[#34d399]/50 shadow transition uppercase tracking-wider"
              >
                Seferi Kaydet (Hızlı Kayıt)
              </button>

              <button
                type="button"
                data-testid="pause-load-screen-btn"
                onClick={() => setView('load')}
                className="w-full py-2.5 px-4 rounded text-xs font-bold bg-[#261f17] hover:bg-[#382d22] text-[#fde68a] border border-[#c6a15b]/40 transition uppercase tracking-wider"
              >
                Kayıt Yükle (Load Game)
              </button>

              <button
                type="button"
                data-testid="pause-saveas-screen-btn"
                onClick={() => setView('save_as')}
                className="w-full py-2.5 px-4 rounded text-xs font-bold bg-[#261f17] hover:bg-[#382d22] text-[#e2d6c1] border border-[#c6a15b]/40 transition uppercase tracking-wider"
              >
                Farklı Kaydet (Save As)
              </button>

              <button
                type="button"
                data-testid="pause-options-btn"
                onClick={() => setView('options')}
                className="w-full py-2 px-4 rounded text-xs font-semibold bg-[#1e1913] hover:bg-[#2c231b] text-[#cbd5e1] border border-[#c6a15b]/20 transition"
              >
                Ayarlar (Options)
              </button>

              <div className="pt-2 border-t border-[#c6a15b]/20 space-y-2">
                <button
                  type="button"
                  data-testid="pause-save-exit-btn"
                  onClick={handleSaveAndExit}
                  className="w-full py-2 px-4 rounded text-xs font-semibold bg-[#2a1d13] hover:bg-[#3d2a1b] text-[#fef08a] border border-[#c6a15b]/30 transition"
                >
                  Kaydet ve Çık
                </button>

                <button
                  type="button"
                  data-testid="pause-mainmenu-btn"
                  onClick={() => {
                    onExitToTitle();
                  }}
                  className="w-full py-2 px-4 rounded text-xs font-semibold bg-[#18140f] hover:bg-[#251f18] text-[#a89b84] hover:text-white transition"
                >
                  Ana Menüye Dön
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW: LOAD GAME SLOTS */}
        {view === 'load' && (
          <div className="w-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 border-b border-[#c6a15b]/30 pb-2">
              <button
                type="button"
                onClick={() => (initialView === 'load' ? onResume() : setView('menu'))}
                className="p-1 rounded bg-[#201a14] hover:bg-[#332a20] text-[#c6a15b]"
              >
                <ArrowLeft size={16} />
              </button>
              <h3 className="text-base font-bold text-[#fde68a] tracking-wide">
                Kayıt Yükle (Load Game)
              </h3>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {slots.map((slot) => {
                const data = slot.saveData;
                return (
                  <div
                    key={slot.id}
                    data-testid={`load-slot-${slot.id}`}
                    onClick={() => {
                      if (!data) return;
                      sound.playWarhorn();
                      onLoadSave(data);
                    }}
                    className={`p-3 rounded-lg border flex items-center justify-between transition ${
                      data
                        ? 'border-[#c6a15b]/40 bg-[#1c1813] hover:bg-[#2d251c] hover:border-[#fde68a] cursor-pointer'
                        : 'border-[#443828]/40 bg-[#14110d]/50 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-[#fef08a] flex items-center gap-2">
                        <span>{slot.name}</span>
                        {slot.isAuto && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-200 border border-amber-600/40">
                            OTO
                          </span>
                        )}
                      </div>
                      {data ? (
                        <div className="text-[11px] text-[#cbd5e1] mt-1 space-y-0.5">
                          <div>
                            {data.campaign.playerName} · Gün {data.campaign.day} ({data.campaign.season})
                          </div>
                          <div className="text-[10px] text-[#a89b84] font-mono">
                            {data.campaign.gold} Dinar · {getTotalTroops(data.campaign.roster)} Asker ·{' '}
                            {data.savedAt > 0
                              ? new Date(data.savedAt).toLocaleDateString('tr-TR', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Kayıtlı'}
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#716859] italic mt-0.5">
                          Boş Yuva
                        </div>
                      )}
                    </div>

                    {data && (
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded bg-[#166534] hover:bg-[#15803d] text-white text-xs font-bold shadow">
                          Yükle
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSlot(slot.id, slot.name, e)}
                          title="Kaydı Sil"
                          className="p-1 rounded text-[#a89b84] hover:text-red-400 hover:bg-red-950/40 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW: SAVE AS SLOTS */}
        {view === 'save_as' && (
          <div className="w-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 border-b border-[#c6a15b]/30 pb-2">
              <button
                type="button"
                onClick={() => setView('menu')}
                className="p-1 rounded bg-[#201a14] hover:bg-[#332a20] text-[#c6a15b]"
              >
                <ArrowLeft size={16} />
              </button>
              <h3 className="text-base font-bold text-[#fde68a] tracking-wide">
                Farklı Kaydet (Save As)
              </h3>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {slots.map((slot) => {
                const data = slot.saveData;
                return (
                  <div
                    key={slot.id}
                    data-testid={`saveas-slot-${slot.id}`}
                    onClick={() => handleSaveToSlot(slot.id, slot.name)}
                    className="p-3 rounded-lg border border-[#c6a15b]/40 bg-[#1c1813] hover:bg-[#2d251c] hover:border-[#34d399] transition cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-[#fef08a]">{slot.name}</div>
                      <div className="text-[10px] text-[#a89b84] mt-0.5">
                        {data
                          ? `Üzerine yazılacak: Gün ${data.campaign.day} (${new Date(data.savedAt).toLocaleTimeString()})`
                          : 'Boş Yuva — Kaydetmek için tıklayın'}
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded bg-[#b45309] hover:bg-[#d97706] text-white text-xs font-bold shadow">
                      Kaydet
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW: OPTIONS / SETTINGS */}
        {view === 'options' && (
          <div className="w-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 border-b border-[#c6a15b]/30 pb-2">
              <button
                type="button"
                onClick={() => setView('menu')}
                className="p-1 rounded bg-[#201a14] hover:bg-[#332a20] text-[#c6a15b]"
              >
                <ArrowLeft size={16} />
              </button>
              <h3 className="text-base font-bold text-[#fde68a] tracking-wide">
                Ayarlar (Options)
              </h3>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-[#c6a15b] font-semibold flex items-center gap-1.5 mb-1.5">
                  <Volume2 size={14} />
                  <span>Ana Ses Seviyesi (%{masterVolume})</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={masterVolume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMasterVolume(val);
                    sound.setVolume(val / 100);
                  }}
                  className="w-full accent-[#b45309]"
                />
              </div>

              <div>
                <label className="text-[#c6a15b] font-semibold flex items-center gap-1.5 mb-1.5">
                  <Monitor size={14} />
                  <span>3B Grafik & WebGL İşleme</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-[#201a14] border border-[#c6a15b]/30 text-center font-bold text-[#34d399]">
                    Donanım Hızlandırma: Aktif
                  </div>
                  <div className="p-2 rounded bg-[#201a14] border border-[#c6a15b]/30 text-center font-bold text-[#fde68a]">
                    Low-Poly Instanced
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setView('menu')}
              className="mt-6 w-full py-2 rounded bg-[#b45309] hover:bg-[#d97706] text-white font-bold transition text-xs"
            >
              Tamam
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
