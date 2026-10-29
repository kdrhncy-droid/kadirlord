import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Music,
  Shield,
  Swords,
  Monitor,
  X,
  Play,
  Sparkles,
} from 'lucide-react';
import { sound } from '../game/sound';
import { music } from '../game/music';

interface WarbandOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'audio' | 'combat' | 'display';

export const WarbandOptionsModal: React.FC<WarbandOptionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('audio');
  const [sfxVolume, setSfxVolume] = useState<number>(() => Math.round(sound.getVolume() * 100));
  const [sfxMuted, setSfxMuted] = useState<boolean>(() => sound.isMuted());
  const [musicVolume, setMusicVolume] = useState<number>(() => Math.round(music.getVolume() * 100));
  const [musicMuted, setMusicMuted] = useState<boolean>(() => music.isMuted());
  const [testSoundPlaying, setTestSoundPlaying] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setSfxVolume(Math.round(sound.getVolume() * 100));
    setSfxMuted(sound.isMuted());
    setMusicVolume(Math.round(music.getVolume() * 100));
    setMusicMuted(music.isMuted());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSfxChange = (val: number) => {
    setSfxVolume(val);
    sound.setVolume(val / 100);
    setSfxMuted(sound.isMuted());
  };

  const handleToggleSfxMute = () => {
    const next = sound.toggleMute();
    setSfxMuted(next);
  };

  const handleMusicChange = (val: number) => {
    setMusicVolume(val);
    music.setVolume(val / 100);
    setMusicMuted(music.isMuted());
  };

  const handleToggleMusicMute = () => {
    const next = music.toggleMute();
    setMusicMuted(next);
  };

  const handleTestSfx = () => {
    setTestSoundPlaying(true);
    sound.playSwordClash();
    setTimeout(() => {
      setTestSoundPlaying(false);
    }, 400);
  };

  const currentCategory = music.getCurrentCategory() || 'TITLE';

  return (
    <div
      data-testid="warband-options-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs pointer-events-auto select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Ayarlar"
    >
      <div
        className="relative w-full max-w-xl rounded-lg border-2 border-[#c6a15b] bg-[#14110d] text-[#f4ecd8] shadow-2xl flex flex-col overflow-hidden"
        style={{
          boxShadow: '0 0 35px rgba(0, 0, 0, 0.9), 0 0 15px rgba(198, 161, 91, 0.25)',
        }}
      >
        {/* HEADER */}
        <div className="relative px-6 py-4 border-b border-[#c6a15b]/40 bg-gradient-to-r from-[#201811] via-[#2c2217] to-[#201811] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded border border-[#c6a15b]/70 bg-[#16120e] flex items-center justify-center text-[#fde68a]">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-[#fde68a] tracking-wider uppercase drop-shadow">
                OYUN AYARLARI (OPTIONS)
              </h2>
              <p className="text-[11px] text-[#a89b84]">
                Mount &amp; Blade: Warband &amp; BannerPage Ses ve Kontroller
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="options-modal-close-btn"
            onClick={() => {
              sound.playUiClick();
              onClose();
            }}
            className="p-1.5 rounded bg-[#16120e] hover:bg-[#382b1d] text-[#c6a15b] hover:text-[#fde68a] border border-[#c6a15b]/40 transition"
            title="Kapat [Esc]"
          >
            <X size={18} />
          </button>
        </div>

        {/* TABS */}
        <div className="flex border-b border-[#c6a15b]/30 bg-[#19140e] px-4 pt-2 gap-2">
          <button
            type="button"
            data-testid="options-tab-audio"
            onClick={() => {
              sound.playUiClick();
              setActiveTab('audio');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-md transition border-t border-x ${
              activeTab === 'audio'
                ? 'bg-[#261e16] border-[#c6a15b] text-[#fde68a] shadow-inner'
                : 'border-transparent text-[#9f927c] hover:text-[#f4ecd8] hover:bg-[#1f1912]'
            }`}
          >
            <Volume2 size={14} />
            <span>Ses &amp; Müzik</span>
          </button>

          <button
            type="button"
            data-testid="options-tab-combat"
            onClick={() => {
              sound.playUiClick();
              setActiveTab('combat');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-md transition border-t border-x ${
              activeTab === 'combat'
                ? 'bg-[#261e16] border-[#c6a15b] text-[#fde68a] shadow-inner'
                : 'border-transparent text-[#9f927c] hover:text-[#f4ecd8] hover:bg-[#1f1912]'
            }`}
          >
            <Swords size={14} />
            <span>Oynanış &amp; Dövüş</span>
          </button>

          <button
            type="button"
            data-testid="options-tab-display"
            onClick={() => {
              sound.playUiClick();
              setActiveTab('display');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-t-md transition border-t border-x ${
              activeTab === 'display'
                ? 'bg-[#261e16] border-[#c6a15b] text-[#fde68a] shadow-inner'
                : 'border-transparent text-[#9f927c] hover:text-[#f4ecd8] hover:bg-[#1f1912]'
            }`}
          >
            <Monitor size={14} />
            <span>Görüntü</span>
          </button>
        </div>

        {/* TAB BODY */}
        <div className="p-6 max-h-[65vh] overflow-y-auto space-y-5 bg-[#14110d]">
          {/* TAB: SES & MÜZİK */}
          {activeTab === 'audio' && (
            <div className="space-y-5 text-xs">
              {/* SES EFEKTLERİ (SFX) */}
              <div className="p-4 rounded-lg bg-[#1c1610] border border-[#c6a15b]/35 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {sfxMuted || sfxVolume === 0 ? (
                      <VolumeX size={18} className="text-red-400" />
                    ) : (
                      <Volume2 size={18} className="text-[#34d399]" />
                    )}
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">
                        Ses Efektleri (SFX Volume)
                      </div>
                      <div className="text-[11px] text-[#a89b84]">
                        Kılıç savurma, kalkan darbesi, ok ıslığı, at nalı ve borazan sesleri
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="sfx-mute-toggle-btn"
                    onClick={handleToggleSfxMute}
                    className={`px-3 py-1.5 rounded font-bold border transition ${
                      sfxMuted
                        ? 'bg-[#3d1818] border-red-600/60 text-red-300 hover:bg-[#4d1f1f]'
                        : 'bg-[#1e3323] border-emerald-600/50 text-emerald-200 hover:bg-[#28442e]'
                    }`}
                  >
                    {sfxMuted ? 'Sessizde' : 'Açık'}
                  </button>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[#d6c9b3]">
                    <span>Seviye:</span>
                    <span className="font-mono font-bold text-[#fde68a]">%{sfxVolume}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    data-testid="sfx-volume-slider"
                    value={sfxVolume}
                    onChange={(e) => handleSfxChange(Number(e.target.value))}
                    className="w-full accent-[#c6a15b] h-2 bg-[#2d2218] rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#c6a15b]/20 text-[11px]">
                  <span className="text-[#a89b84]">BannerPage Ses Paketi: Aktif</span>
                  <button
                    type="button"
                    data-testid="test-sfx-btn"
                    onClick={handleTestSfx}
                    disabled={sfxMuted || sfxVolume === 0}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#2b2116] hover:bg-[#3d2e1f] text-[#fde68a] border border-[#c6a15b]/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <Play size={12} className={testSoundPlaying ? 'animate-pulse' : ''} />
                    <span>Sesi Test Et (Kılıç Darbesi)</span>
                  </button>
                </div>
              </div>

              {/* MÜZİK (MUSIC) */}
              <div className="p-4 rounded-lg bg-[#1c1610] border border-[#c6a15b]/35 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {musicMuted || musicVolume === 0 ? (
                      <VolumeX size={18} className="text-red-400" />
                    ) : (
                      <Music size={18} className="text-[#38bdf8]" />
                    )}
                    <div>
                      <div className="font-bold text-sm text-[#f8f0df]">
                        Müzik Seviyesi (Music Volume)
                      </div>
                      <div className="text-[11px] text-[#a89b84]">
                        Ana menü, harita seferi, meydan savaşları, hanlar ve arena parçaları
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="music-mute-toggle-btn"
                    onClick={handleToggleMusicMute}
                    className={`px-3 py-1.5 rounded font-bold border transition ${
                      musicMuted
                        ? 'bg-[#3d1818] border-red-600/60 text-red-300 hover:bg-[#4d1f1f]'
                        : 'bg-[#1e2f3d] border-sky-600/50 text-sky-200 hover:bg-[#283e50]'
                    }`}
                  >
                    {musicMuted ? 'Müzik Kapalı' : 'Müzik Açık'}
                  </button>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[#d6c9b3]">
                    <span>Seviye:</span>
                    <span className="font-mono font-bold text-[#fde68a]">%{musicVolume}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    data-testid="music-volume-slider"
                    value={musicVolume}
                    onChange={(e) => handleMusicChange(Number(e.target.value))}
                    className="w-full accent-[#38bdf8] h-2 bg-[#2d2218] rounded cursor-pointer"
                  />
                </div>

                <div className="pt-2 border-t border-[#c6a15b]/20 flex flex-col gap-1 text-[11px] text-[#a89b84]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#fde68a]">
                      <Sparkles size={13} />
                      <span>BannerPage Orijinal Müzik Koleksiyonu</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#2b2116] border border-[#c6a15b]/30 font-mono text-[10px] text-[#e2d6c1]">
                      Kategori: {currentCategory}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8e816f]">
                    * Modun 11 adet özgün .ogg parçası (Svadya Muharebesi, Haydut Baskını, Şehir Gündüzü, Han Ezgileri, Zafer Borazanı) çalmaktadır.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: OYNANIŞ & DÖVÜŞ */}
          {activeTab === 'combat' && (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded bg-[#1c1610] border border-[#c6a15b]/30 space-y-2">
                <div className="font-bold text-sm text-[#fde68a] flex items-center gap-2">
                  <Swords size={16} />
                  <span>Warband 4-Yönlü Saldırı ve Savunma Sistemi</span>
                </div>
                <p className="text-[#a89b84] text-[11px] leading-relaxed">
                  Savaş meydanında ve arenada saldırı ve blok yönleriniz farenin hareket yönüne göre belirlenir.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="p-2.5 rounded bg-[#15110d] border border-[#c6a15b]/25">
                    <span className="text-[10px] text-[#a89b84] block">Saldırı Yönü:</span>
                    <span className="font-bold text-[#34d399]">Fare Hareketiyle (Mouse)</span>
                  </div>
                  <div className="p-2.5 rounded bg-[#15110d] border border-[#c6a15b]/25">
                    <span className="text-[10px] text-[#a89b84] block">Blok Yönü:</span>
                    <span className="font-bold text-[#34d399]">Fare Hareketiyle (Mouse)</span>
                  </div>
                </div>
              </div>

              {/* DÖVÜŞ KONTROLLERİ REHBERİ */}
              <div className="p-3.5 rounded bg-[#1c1610] border border-[#c6a15b]/30 space-y-2">
                <div className="font-bold text-sm text-[#f8f0df]">Dövüş Tuşları ve Hareket Kombinasyonları</div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">⬆️ Fareyi Yukarı İtip + Sol Tık</span>
                    <span className="font-bold text-[#fde68a]">Üstten Kesme Darbesi</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">⬇️ Fareyi Aşağı Çekip + Sol Tık</span>
                    <span className="font-bold text-[#fde68a]">İleri Saplama (Delici)</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">⬅️ Fareyi Sola Çekip + Sol Tık</span>
                    <span className="font-bold text-[#fde68a]">Soldan Savurma</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">➡️ Fareyi Sağa Çekip + Sol Tık</span>
                    <span className="font-bold text-[#fde68a]">Sağdan Savurma</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">🛡️ Sağ Tık (Basılı Tut)</span>
                    <span className="font-bold text-[#38bdf8]">Yönlü Blok / Savunma</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">🦶 [E] Tuşu</span>
                    <span className="font-bold text-[#f97316]">Tekme Atma (Denge Bozar)</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">🛡️+⚔️ Sağ Tık + Sol Tık</span>
                    <span className="font-bold text-[#fbbf24]">Kalkan Darbesi (Shield Bash)</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">⚔️ [Q] Tuşu</span>
                    <span className="font-bold text-[#cbd5e1]">Silah Tutuşunu Değiştir</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded bg-[#15110d]">
                    <span className="text-[#d1c5b0]">🔍 [Shift] Tuşu</span>
                    <span className="font-bold text-[#cbd5e1]">Yakınlaştırma (Zoom)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GÖRÜNTÜ */}
          {activeTab === 'display' && (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded bg-[#1c1610] border border-[#c6a15b]/30 space-y-2">
                <div className="font-bold text-sm text-[#fde68a] flex items-center gap-2">
                  <Monitor size={16} />
                  <span>3B Grafik &amp; WebGL Donanım Hızlandırma</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2.5 rounded bg-[#15110d] border border-[#c6a15b]/25 text-center">
                    <span className="text-[10px] text-[#a89b84] block">İşleyici:</span>
                    <span className="font-bold text-[#34d399]">WebGL 2.0 Hardware</span>
                  </div>
                  <div className="p-2.5 rounded bg-[#15110d] border border-[#c6a15b]/25 text-center">
                    <span className="text-[10px] text-[#a89b84] block">Hedef Kare Hızı:</span>
                    <span className="font-bold text-[#fde68a]">60 FPS Sabit</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded bg-[#1c1610] border border-[#c6a15b]/30 space-y-1.5 text-[#d1c5b0]">
                <div className="font-bold text-sm text-[#f8f0df]">Performans Optimizasyonları</div>
                <div>• Kalabalık muharebelerde Low-Poly instancing aktif</div>
                <div>• Kamera mesafesine göre dinamik LOD (Level of Detail)</div>
                <div>• BannerPage dokuları ve parçacık efektleri önceden önbelleğe alınır</div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-3.5 border-t border-[#c6a15b]/40 bg-[#19140e] flex items-center justify-end">
          <button
            type="button"
            data-testid="options-confirm-btn"
            onClick={() => {
              sound.playUiClick();
              onClose();
            }}
            className="px-6 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fbbf24]/50 shadow transition uppercase tracking-wider"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
