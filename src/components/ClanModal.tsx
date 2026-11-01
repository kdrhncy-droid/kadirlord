import React, { useState } from 'react';
import {
  type CampaignHero,
  type CampaignState,
  type ClanRoleId,
  type FactionId,
  type Settlement,
  FACTION_INFO,
  calculatePartyDailyWage,
  getTotalTroops,
} from '../game/rules';
import {
  CLAN_ROLES_CATALOG,
  ClanPartyRecord,
  assignClanRole,
  assignSettlementGovernor,
  calculateClanDailyFinance,
  changeClanName,
  getClanFiefs,
  getClanHeroes,
  getPlayerClanSummary,
} from '../game/clanSystem';
import { sound } from '../game/sound';

interface ClanModalProps {
  campaign: CampaignState;
  onUpdateCampaign: (next: CampaignState) => void;
  onClose: () => void;
  onOpenArmyModal?: () => void;
}

type ClanTabId = 'members' | 'parties' | 'fiefs' | 'other';

export const ClanModal: React.FC<ClanModalProps> = ({
  campaign,
  onUpdateCampaign,
  onClose,
  onOpenArmyModal,
}) => {
  const [activeTab, setActiveTab] = useState<ClanTabId>('members');
  const [selectedHeroId, setSelectedHeroId] = useState<string>('player_hero');
  const [isEditingClanName, setIsEditingClanName] = useState(false);
  const [clanNameInput, setClanNameInput] = useState('');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const clanSummary = getPlayerClanSummary(campaign);
  const heroes = getClanHeroes(campaign);
  const { townsAndCastles, boundVillages } = getClanFiefs(campaign);
  const finance = calculateClanDailyFinance(campaign);

  // Klavye kısayolu ile (Esc veya L) kapatma desteği
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyL') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    window.setTimeout(() => setFeedbackToast(null), 3500);
  };

  const handleRoleChange = (roleId: ClanRoleId, heroId: string | null) => {
    sound.playUiClick();
    const next = assignClanRole(campaign, roleId, heroId);
    onUpdateCampaign(next);
    const heroName = heroId ? heroes.find((h) => h.id === heroId)?.name ?? 'Kahraman' : null;
    showToast(
      heroName
        ? `${heroName}, ${CLAN_ROLES_CATALOG.find((r) => r.id === roleId)?.name} olarak atandı.`
        : `${CLAN_ROLES_CATALOG.find((r) => r.id === roleId)?.name} görevi boşaltıldı.`,
    );
  };

  const handleGovernorChange = (settlementId: string, heroId: string | null) => {
    sound.playUiClick();
    const res = assignSettlementGovernor(campaign, settlementId, heroId);
    if (res.success) {
      onUpdateCampaign(res.nextState);
      const sName = campaign.settlements.find((s) => s.id === settlementId)?.name ?? 'Yerleşim';
      const hName = heroId ? heroes.find((h) => h.id === heroId)?.name ?? 'Kahraman' : null;
      showToast(hName ? `${hName}, ${sName} valisi olarak atandı.` : `${sName} valiliği boşaltıldı.`);
    } else if (res.reason) {
      showToast(res.reason);
    }
  };

  const handleSaveClanName = () => {
    if (clanNameInput.trim()) {
      sound.playUiClick();
      const next = changeClanName(campaign, clanNameInput);
      onUpdateCampaign(next);
      setIsEditingClanName(false);
      showToast(`Klan adı "${clanNameInput.trim()}" olarak güncellendi.`);
    }
  };

  const selectedHero = heroes.find((h) => h.id === selectedHeroId) || heroes[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clan-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md select-none animate-fadeIn"
      data-testid="clan-modal"
    >
      <div className="relative w-full max-w-6xl h-[92vh] flex flex-col bg-gradient-to-b from-[#1c1813] via-[#14110d] to-[#0d0b08] border-2 border-[#c6a15b]/80 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden text-[#e7d8c4]">
        {/* Bildirim Toast'u */}
        {feedbackToast && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#2a2217] border border-[#d4af37] rounded-lg shadow-xl text-[#fef08a] text-xs font-bold animate-bounce">
            {feedbackToast}
          </div>
        )}

        {/* ── 1. ÜST BAŞLIK (KLAN KİMLİĞİ & İSTATİSTİKLER) ── */}
        <header className="relative flex flex-wrap items-center justify-between px-6 py-4 border-b border-[#4a3b2c] bg-gradient-to-r from-[#241e17] via-[#1a1611] to-[#241e17] gap-4">
          {/* Sol: Sancak & Klan Adı & Kademe */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full border-2 border-[#d4af37] bg-gradient-to-b from-[#3a2f20] to-[#14100b] flex items-center justify-center shadow-lg text-2xl text-[#fde68a]">
              🦅
            </div>
            <div>
              <div className="flex items-center gap-2">
                {isEditingClanName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={clanNameInput}
                      onChange={(e) => setClanNameInput(e.target.value)}
                      placeholder="Klan Adı..."
                      className="bg-[#14100b] border border-[#d4af37] text-white px-2 py-0.5 rounded text-sm font-serif outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleSaveClanName}
                      className="px-2 py-0.5 bg-[#d4af37] hover:bg-[#fbbf24] text-[#14100b] text-xs font-bold rounded"
                    >
                      Kaydet
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingClanName(false)}
                      className="px-2 py-0.5 bg-[#2a2217] hover:bg-[#3a2f20] text-gray-300 text-xs rounded"
                    >
                      İptal
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 id="clan-modal-title" className="text-xl md:text-2xl font-serif font-black tracking-wide text-[#fde68a]">
                      {clanSummary.clanName}
                    </h1>
                    <button
                      type="button"
                      title="Klan Adını Değiştir"
                      onClick={() => {
                        setClanNameInput(clanSummary.clanName);
                        setIsEditingClanName(true);
                      }}
                      className="text-xs text-[#c6a15b] hover:text-white px-1.5 py-0.5 rounded border border-[#c6a15b]/40 hover:border-[#fbbf24] transition"
                    >
                      ✎
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-[#a89680] font-sans mt-0.5">
                {clanSummary.title} · Lider: <span className="text-[#fef08a] font-semibold">{campaign.playerName}</span>
              </p>
            </div>
          </div>

          {/* Orta: Nam & Kademe İlerleme Çubuğu */}
          <div className="flex flex-col min-w-[200px] max-w-xs flex-1">
            <div className="flex justify-between text-xs font-mono font-bold mb-1">
              <span className="text-[#c6a15b]">Klan Kademesi {clanSummary.tier}</span>
              <span className="text-[#fef08a]">
                {clanSummary.renown} / {clanSummary.nextTierRenown} Nam ({clanSummary.progressPercent}%)
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#14100b] rounded-full overflow-hidden border border-[#5a4834] p-0.5">
              <div
                className="h-full bg-gradient-to-r from-[#d97706] to-[#fbbf24] rounded-full transition-all duration-300"
                style={{ width: `${clanSummary.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Sağ: Finans Özeti & Kapat */}
          <div className="flex items-center gap-6">
            <div className="text-right font-mono text-xs hidden sm:block">
              <div className="text-[#a89680]">
                Hazine: <span className="text-[#fbbf24] font-bold">{clanSummary.gold} Dinar</span>
              </div>
              <div className="mt-0.5">
                Net Günlük Bütçe:{' '}
                <span
                  className={`font-bold ${
                    finance.netDailyChange >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'
                  }`}
                >
                  {finance.netDailyChange >= 0 ? `+${finance.netDailyChange}` : finance.netDailyChange} D/gün
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              title="Kapat (ESC / L)"
              className="w-9 h-9 rounded-full bg-[#2a2217] hover:bg-[#3d3121] border border-[#c6a15b]/60 hover:border-[#fbbf24] text-[#fde68a] flex items-center justify-center font-bold text-lg transition shadow-md"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ── 2. DÖRT ANA BANNERLORD SEKME ÇUBUĞU ── */}
        <nav className="flex items-center px-6 border-b border-[#3d3022] bg-[#17130f] gap-2 overflow-x-auto">
          {[
            { id: 'members', label: 'Üyeler (Members)', icon: '👥' },
            { id: 'parties', label: 'Birlikler (Parties)', icon: '⚔️' },
            { id: 'fiefs', label: 'Tımarlar (Fiefs)', icon: '🏰' },
            { id: 'other', label: 'Diğer & Finans (Other)', icon: '💰' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  sound.playUiClick();
                  setActiveTab(tab.id as ClanTabId);
                }}
                className={`flex items-center gap-2 px-5 py-3 font-serif text-sm font-bold border-b-2 transition -mb-[2px] whitespace-nowrap ${
                  isActive
                    ? 'border-[#d4af37] text-[#fef08a] bg-[#241e17]'
                    : 'border-transparent text-[#9c8975] hover:text-[#dcd1c2] hover:bg-[#1d1712]'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── 3. SEKME İÇERİKLERİ ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gradient-to-b from-[#14110d] to-[#0e0c09]">
          {/* ════════ SEKME 1: ÜYELER & 4 KLAN ROLÜ ════════ */}
          {activeTab === 'members' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Sol Sütun: Klan Kahramanları Listesi */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                <h3 className="font-serif text-sm font-bold text-[#c6a15b] tracking-wider uppercase border-b border-[#3d3022] pb-1.5 flex justify-between">
                  <span>Klan Mensupları</span>
                  <span className="text-xs font-mono text-[#a89680]">
                    {heroes.length} / {clanSummary.maxCompanions} Üye
                  </span>
                </h3>

                <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
                  {heroes.map((h) => {
                    const isSelected = h.id === selectedHeroId;
                    const assignedRole = Object.entries(campaign.clanRoles ?? {}).find(
                      ([_, heroId]) => heroId === h.id,
                    )?.[0] as ClanRoleId | undefined;
                    const roleDef = assignedRole
                      ? CLAN_ROLES_CATALOG.find((r) => r.id === assignedRole)
                      : null;

                    return (
                      <div
                        key={h.id}
                        onClick={() => setSelectedHeroId(h.id)}
                        className={`p-3 rounded-lg border transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#2a2217] border-[#d4af37] shadow-md'
                            : 'bg-[#181410] border-[#3d3022] hover:border-[#6b543b]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full border border-[#8c7149] bg-[#120f0c] flex items-center justify-center font-bold text-[#fde68a]">
                            {h.kind === 'PLAYER' ? '👑' : h.kind === 'FAMILY' ? '🛡️' : '⚔️'}
                          </div>
                          <div>
                            <div className="font-serif font-bold text-sm text-[#fef08a] flex items-center gap-1.5">
                              <span>{h.name}</span>
                              {h.kind === 'PLAYER' && (
                                <span className="text-[10px] px-1 bg-[#d97706]/30 text-[#fef08a] rounded border border-[#d97706]/50">
                                  Başkomutan
                                </span>
                              )}
                              {h.kind === 'FAMILY' && (
                                <span className="text-[10px] px-1 bg-[#3b82f6]/30 text-[#93c5fd] rounded border border-[#3b82f6]/50">
                                  Aile
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#9c8975] flex items-center gap-2 mt-0.5">
                              <span>{h.age} Yaşında</span>
                              <span>·</span>
                              <span>{h.isInPlayerParty ? 'Ordunuzda' : 'Tımarda'}</span>
                            </div>
                          </div>
                        </div>

                        {roleDef && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#3d3022] border border-[#c6a15b]/60 text-[#fde68a]">
                            {roleDef.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sağ Sütun: Seçili Kahraman Detayı & 4 Klan Rolü Atama Paneli */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                {/* 4 Bannerlord Klan Rolü Kartları */}
                <div>
                  <h3 className="font-serif text-sm font-bold text-[#c6a15b] tracking-wider uppercase border-b border-[#3d3022] pb-1.5 mb-3">
                    Bannerlord 4 Klan Rolü Ataması
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CLAN_ROLES_CATALOG.map((role) => {
                      const assignedHeroId = (campaign.clanRoles as any)?.[role.id] ?? null;
                      const assignedHero = assignedHeroId
                        ? heroes.find((h) => h.id === assignedHeroId)
                        : null;
                      const skillVal = assignedHero
                        ? (assignedHero.skills as any)?.[role.skillId]?.level ?? 25
                        : 0;

                      return (
                        <div
                          key={role.id}
                          className="p-3.5 rounded-lg border border-[#3d3022] bg-[#1a1510] flex flex-col justify-between shadow-sm hover:border-[#6b543b] transition"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-serif font-bold text-sm text-[#fde68a] flex items-center gap-1.5">
                                <span>{role.name}</span>
                                <span className="text-xs text-[#a89680]">({role.skillName})</span>
                              </span>
                              {assignedHero ? (
                                <span className="text-xs font-mono font-bold text-[#4ade80] bg-[#14532d]/40 px-2 py-0.5 rounded border border-[#166534]">
                                  {skillVal} {role.skillName}
                                </span>
                              ) : (
                                <span className="text-xs text-[#9c8975] italic">Atanmamış</span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#a89680] leading-snug mb-3">
                              {role.effectDescription}
                            </p>
                          </div>

                          {/* Rol Değiştirme / Atama Açılır Menüsü */}
                          <div className="flex items-center gap-2 pt-2 border-t border-[#2a2217]">
                            <select
                              value={assignedHeroId || ''}
                              onChange={(e) => handleRoleChange(role.id, e.target.value || null)}
                              className="w-full bg-[#120f0c] border border-[#5a4834] text-xs font-sans text-white px-2 py-1 rounded outline-none focus:border-[#fbbf24]"
                            >
                              <option value="">(Atanmamış / Boş)</option>
                              {heroes.map((h) => {
                                const hSkill = (h.skills as any)?.[role.skillId]?.level ?? 20;
                                return (
                                  <option key={h.id} value={h.id}>
                                    {h.name} — {hSkill} {role.skillName}
                                  </option>
                                );
                              })}
                            </select>
                            {assignedHeroId && (
                              <button
                                type="button"
                                title="Görevi Boşalt"
                                onClick={() => handleRoleChange(role.id, null)}
                                className="px-2 py-1 bg-[#2a2217] hover:bg-[#3d3022] text-xs text-red-300 rounded border border-red-900/60"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Seçili Kahraman İstatistikleri */}
                {selectedHero && (
                  <div className="p-4 rounded-lg border border-[#3d3022] bg-[#16120e]">
                    <div className="flex items-center justify-between border-b border-[#2d241a] pb-2 mb-3">
                      <div>
                        <h4 className="font-serif text-base font-bold text-[#fef08a]">
                          {selectedHero.name}
                        </h4>
                        <span className="text-xs text-[#a89680]">
                          Seviye {selectedHero.level} · {selectedHero.age} Yaşında ·{' '}
                          {FACTION_INFO[selectedHero.culture]?.name ?? 'Kalradya'} Kültürü
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-[#a89680] font-mono">
                          Can: {selectedHero.hp} / {selectedHero.maxHp} HP
                        </span>
                        <div className="w-28 h-2 bg-[#120f0c] rounded-full overflow-hidden border border-red-900/40 mt-1">
                          <div
                            className="h-full bg-red-600 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((selectedHero.hp / selectedHero.maxHp) * 100),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Nitelik & Başlıca Beceriler */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {CLAN_ROLES_CATALOG.map((r) => {
                        const lvl = (selectedHero.skills as any)?.[r.skillId]?.level ?? 20;
                        return (
                          <div
                            key={r.id}
                            className="p-2 rounded bg-[#1f1912] border border-[#2d241a] flex flex-col"
                          >
                            <span className="text-[#a89680]">{r.skillName}</span>
                            <span className="font-mono font-bold text-sm text-[#fef08a]">{lvl}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ SEKME 2: BİRLİKLER (PARTIES) ════════ */}
          {activeTab === 'parties' && (
            <div className="flex flex-col gap-6">
              {/* Savaş Orduları (War Parties) */}
              <div>
                <div className="flex items-center justify-between border-b border-[#3d3022] pb-1.5 mb-3">
                  <h3 className="font-serif text-sm font-bold text-[#c6a15b] tracking-wider uppercase">
                    Klan Savaş Partileri
                  </h3>
                  <span className="text-xs font-mono text-[#a89680]">
                    Kapasite: 1 / {clanSummary.maxParties} Ordu
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 1. Başkomutanın Ana Ordusu */}
                  <div className="p-4 rounded-lg border border-[#d4af37] bg-[#1c1712] shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-serif font-bold text-[#fef08a]">
                        {campaign.playerName} Ordusu (Ana Birlik)
                      </h4>
                      <span className="text-xs px-2 py-0.5 rounded bg-[#15803d]/40 text-[#86efac] border border-[#166534]">
                        Başkomutan
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-3">
                      <div className="bg-[#120f0c] p-2 rounded border border-[#2d241a]">
                        <span className="text-[#a89680] block text-[10px]">Mevcut</span>
                        <span className="font-bold text-[#fef08a]">
                          {getTotalTroops(campaign.roster)} Asker
                        </span>
                      </div>
                      <div className="bg-[#120f0c] p-2 rounded border border-[#2d241a]">
                        <span className="text-[#a89680] block text-[10px]">Tutsaklar</span>
                        <span className="font-bold text-amber-400">{campaign.prisoners} Tutsak</span>
                      </div>
                      <div className="bg-[#120f0c] p-2 rounded border border-[#2d241a]">
                        <span className="text-[#a89680] block text-[10px]">Günlük Maaş</span>
                        <span className="font-bold text-red-400">
                          {calculatePartyDailyWage(campaign)} D
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[#a89680] italic">
                      Harita Konumu: [{Math.round(campaign.playerX)}, {Math.round(campaign.playerZ)}]
                    </p>
                  </div>

                  {/* 2. Ek Klan Partisi Kartı */}
                  <div className="p-4 rounded-lg border border-dashed border-[#5a4834] bg-[#14100b]/50 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl mb-1">⚔️</span>
                    <h4 className="font-serif font-bold text-sm text-[#c6a15b]">İkinci Klan Partisi</h4>
                    <p className="text-xs text-[#8c7865] max-w-xs mt-1 mb-3">
                      Klan Kademesi {clanSummary.tier >= 2 ? 'hazır' : '2 gerektirir'}. Bir yoldaşınızı
                      bağımsız harita devriyesi olarak atayabilirsiniz.
                    </p>
                    {clanSummary.tier >= 2 ? (
                      <button
                        type="button"
                        onClick={() =>
                          showToast('Yeni klan partisi için en az 1 yoldaş ve 20 asker gereklidir.')
                        }
                        className="px-3 py-1.5 bg-[#d4af37] hover:bg-[#fbbf24] text-[#14100b] text-xs font-bold rounded shadow transition"
                      >
                        + Yeni Birlik Kur (20 Asker)
                      </button>
                    ) : (
                      <span className="text-xs text-red-400 font-mono">
                        Klan Kademesi 2'de Açılır
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Garnizonlar (Garrisons) */}
              <div>
                <h3 className="font-serif text-sm font-bold text-[#c6a15b] tracking-wider uppercase border-b border-[#3d3022] pb-1.5 mb-3">
                  Klana Ait Tımar Garnizonları
                </h3>

                {townsAndCastles.length === 0 ? (
                  <div className="p-6 rounded-lg border border-[#2d241a] bg-[#120f0c] text-center text-xs text-[#8c7865]">
                    Klana ait henüz bir kale veya şehir bulunmuyor.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {townsAndCastles.map((tc) => (
                      <div
                        key={tc.id}
                        className="p-3 rounded-lg border border-[#3d3022] bg-[#181410] flex justify-between items-center"
                      >
                        <div>
                          <span className="font-serif font-bold text-sm text-[#fef08a] block">
                            {tc.name}
                          </span>
                          <span className="text-xs text-[#a89680]">
                            Garnizon: {tc.garrison} Asker · Milis: {tc.militia ?? 0}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-red-400">
                          -{Math.round((tc.garrison ?? 0) * 1.6)} D/gün
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ SEKME 3: TIMARLAR & VALİLİK (FIEFS) ════════ */}
          {activeTab === 'fiefs' && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-[#3d3022] pb-1.5">
                <h3 className="font-serif text-sm font-bold text-[#c6a15b] tracking-wider uppercase">
                  Klana Ait Şehir ve Kaleler ({townsAndCastles.length})
                </h3>
                <span className="text-xs text-[#a89680]">
                  Bağlı Köyler: {boundVillages.length}
                </span>
              </div>

              {townsAndCastles.length === 0 ? (
                <div className="p-12 rounded-xl border border-dashed border-[#4a3b2c] bg-[#14100b] text-center flex flex-col items-center justify-center">
                  <span className="text-4xl mb-2">🏰</span>
                  <h4 className="font-serif text-base font-bold text-[#fde68a]">
                    Henüz Klana Ait Bir Tımar Yok
                  </h4>
                  <p className="text-xs text-[#8c7865] max-w-md mt-1">
                    Bir krallığa vasal olarak katılıp fethedilen kalelerden tımar alabilir veya bağımsız
                    ordunuzla zayıf bir kaleyi kuşatarak ilk toprağınızı kazanabilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {townsAndCastles.map((tc) => {
                    const govId = (tc as any).governorHeroId ?? null;
                    const govName = (tc as any).governorHeroName ?? null;
                    const tax = Math.round((tc.prosperity ?? 4000) * (tc.type === 'TOWN' ? 0.42 : 0.28));

                    return (
                      <div
                        key={tc.id}
                        className="p-4 rounded-lg border border-[#4a3b2c] bg-[#1a1510] flex flex-col justify-between shadow-md"
                      >
                        <div>
                          <div className="flex items-center justify-between border-b border-[#2d241a] pb-2 mb-3">
                            <div>
                              <span className="font-serif font-bold text-base text-[#fef08a] block">
                                {tc.name}
                              </span>
                              <span className="text-xs text-[#8c7865]">
                                {tc.type === 'TOWN' ? 'Büyük Şehir' : 'Sınır Kalesi'} ·{' '}
                                {FACTION_INFO[tc.faction]?.name}
                              </span>
                            </div>
                            <span className="text-xs font-mono font-bold text-[#4ade80]">
                              +{tax} D/gün Vergi
                            </span>
                          </div>

                          <div className="grid grid-cols-4 gap-2 text-center text-xs mb-4">
                            <div className="bg-[#120f0c] p-2 rounded border border-[#2d241a]">
                              <span className="text-[10px] text-[#8c7865] block">Refah</span>
                              <span className="font-bold text-[#fef08a]">{tc.prosperity}</span>
                            </div>
                            <div className="bg-[#120f0c] p-2 rounded border border-[#2d241a]">
                              <span className="text-[10px] text-[#8c7865] block">Sadakat</span>
                              <span className="font-bold text-[#fef08a]">{tc.loyalty ?? 65}</span>
                            </div>
                            <div className="bg-[#120f0c] p-2 rounded border border-[#2d241a]">
                              <span className="text-[10px] text-[#8c7865] block">Güvenlik</span>
                              <span className="font-bold text-[#fef08a]">{tc.security ?? 70}</span>
                            </div>
                            <div className="bg-[#120f0c] p-2 rounded border border-[#2d241a]">
                              <span className="text-[10px] text-[#8c7865] block">Garnizon</span>
                              <span className="font-bold text-[#fef08a]">{tc.garrison}</span>
                            </div>
                          </div>
                        </div>

                        {/* Vali Atama Bölümü */}
                        <div className="pt-3 border-t border-[#2d241a] flex items-center justify-between">
                          <span className="text-xs text-[#c6a15b] font-serif font-bold">
                            Şehir Valisi:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={govId || ''}
                              onChange={(e) => handleGovernorChange(tc.id, e.target.value || null)}
                              className="bg-[#120f0c] border border-[#5a4834] text-xs text-white px-2 py-1 rounded outline-none"
                            >
                              <option value="">(Vali Yok)</option>
                              {heroes.map((h) => (
                                <option key={h.id} value={h.id}>
                                  {h.name}
                                </option>
                              ))}
                            </select>
                            {govId && (
                              <button
                                type="button"
                                title="Valiyi Görevden Al"
                                onClick={() => handleGovernorChange(tc.id, null)}
                                className="px-2 py-1 bg-[#2a2217] hover:bg-red-950 text-xs text-red-300 rounded border border-red-900"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════ SEKME 4: DİĞER (ATÖLYELER & BÜTÇE) ════════ */}
          {activeTab === 'other' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Sol: Atölyeler & Kervanlar */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-[#3d3022] pb-1.5">
                  <h3 className="font-serif text-sm font-bold text-[#c6a15b] tracking-wider uppercase">
                    Klan Atölyeleri
                  </h3>
                  <span className="text-xs font-mono text-[#a89680]">
                    {clanSummary.ownedWorkshops.length} / {clanSummary.maxWorkshops} Yuva
                  </span>
                </div>

                {clanSummary.ownedWorkshops.length === 0 ? (
                  <div className="p-6 rounded-lg border border-[#2d241a] bg-[#120f0c] text-center text-xs text-[#8c7865]">
                    Henüz bir atölye satın alınmadı. Şehir pazarlarındaki demirci ve zanaatkarlarla
                    konuşarak atölye kurabilirsiniz.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {clanSummary.ownedWorkshops.map((w, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-[#3d3022] bg-[#181410] flex items-center justify-between"
                      >
                        <div>
                          <span className="font-serif font-bold text-sm text-[#fef08a] block">
                            {w.settlementName} {w.type}
                          </span>
                          <span className="text-[11px] text-[#8c7865]">Kâr sağlayan zanaat</span>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#4ade80]">
                          +{w.dailyProfit} D/gün
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sağ: Detaylı Finans Tablosu (Bilanço) */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <h3 className="font-serif text-sm font-bold text-[#c6a15b] tracking-wider uppercase border-b border-[#3d3022] pb-1.5">
                  Günlük Finans Tablosu (Gelir / Gider Bilançosu)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Gelirler Sütunu */}
                  <div className="p-4 rounded-lg border border-[#166534]/60 bg-[#121c14]/40 flex flex-col justify-between">
                    <div>
                      <h4 className="font-serif font-bold text-xs text-[#4ade80] uppercase tracking-wider mb-2 border-b border-[#166534]/40 pb-1">
                        Günlük Gelirler
                      </h4>
                      <div className="flex flex-col gap-1.5 text-xs">
                        {finance.incomes.fiefTaxes.map((f, i) => (
                          <div key={i} className="flex justify-between text-[#86efac]">
                            <span>{f.name} Vergisi</span>
                            <span className="font-mono">+{f.amount} D</span>
                          </div>
                        ))}
                        {finance.incomes.villageTariffs.map((v, i) => (
                          <div key={i} className="flex justify-between text-[#86efac]">
                            <span>{v.name} Tarifesi</span>
                            <span className="font-mono">+{v.amount} D</span>
                          </div>
                        ))}
                        {finance.incomes.workshops.map((w, i) => (
                          <div key={i} className="flex justify-between text-[#86efac]">
                            <span>{w.settlementName} Atölyesi</span>
                            <span className="font-mono">+{w.amount} D</span>
                          </div>
                        ))}
                        {finance.incomes.mercenaryPayment > 0 && (
                          <div className="flex justify-between text-[#86efac]">
                            <span>Paralı Asker Sözleşmesi</span>
                            <span className="font-mono">+{finance.incomes.mercenaryPayment} D</span>
                          </div>
                        )}
                        {finance.incomes.totalIncome === 0 && (
                          <span className="text-[#8c7865] italic">Aktif gelir kalemi yok.</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#166534] flex justify-between font-bold text-xs text-[#4ade80] mt-3">
                      <span>Toplam Gelir</span>
                      <span className="font-mono">+{finance.incomes.totalIncome} Dinar</span>
                    </div>
                  </div>

                  {/* Giderler Sütunu */}
                  <div className="p-4 rounded-lg border border-red-900/60 bg-[#211313]/40 flex flex-col justify-between">
                    <div>
                      <h4 className="font-serif font-bold text-xs text-red-400 uppercase tracking-wider mb-2 border-b border-red-900/40 pb-1">
                        Günlük Giderler
                      </h4>
                      <div className="flex flex-col gap-1.5 text-xs">
                        <div className="flex justify-between text-red-300">
                          <span>Ana Birlik Maaşı</span>
                          <span className="font-mono">-{finance.expenses.mainPartyWage} D</span>
                        </div>
                        {finance.expenses.garrisonWages.map((g, i) => (
                          <div key={i} className="flex justify-between text-red-300">
                            <span>{g.name}</span>
                            <span className="font-mono">-{g.amount} D</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-red-900 flex justify-between font-bold text-xs text-red-400 mt-3">
                      <span>Toplam Gider</span>
                      <span className="font-mono">-{finance.expenses.totalExpense} Dinar</span>
                    </div>
                  </div>
                </div>

                {/* Net Bilanço Barı */}
                <div className="p-3.5 rounded-lg border border-[#c6a15b]/60 bg-[#1e1913] flex items-center justify-between">
                  <span className="font-serif font-bold text-sm text-[#fef08a]">
                    Net Günlük Kasa Değişimi:
                  </span>
                  <span
                    className={`font-mono text-base font-black ${
                      finance.netDailyChange >= 0 ? 'text-[#4ade80]' : 'text-[#f87171]'
                    }`}
                  >
                    {finance.netDailyChange >= 0
                      ? `+${finance.netDailyChange} Dinar / Gün`
                      : `${finance.netDailyChange} Dinar / Gün`}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 4. ALT BİLGİ & KISAYOL ŞERİDİ ── */}
        <footer className="px-6 py-2.5 border-t border-[#3d3022] bg-[#14100b] flex items-center justify-between text-xs text-[#a89680] font-sans">
          <span>
            Kalradya İpucu: Klan kademenizi artırmak için turnuvalar kazanın ve meydan savaşlarında
            zafer elde edin.
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[#c6a15b]">[ESC / L] Kapat</span>
          </div>
        </footer>
      </div>
    </div>
  );
};
