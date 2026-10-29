import React, { useMemo, useState } from 'react';
import {
  CampaignState,
  FACTION_INFO,
  FactionId,
  Settlement,
} from '../game/rules';
import {
  KINGDOM_POLICIES,
  KingdomMacroState,
  KingdomPolicyId,
  calculateSettlementLoyaltyAndFood,
  calculateWarDesireAndTribute,
  generateSettlementClaimantBallot,
  resolveKingdomCouncilVote,
} from '../game/kingdomSystem';
import { sound } from '../game/sound';

interface KingdomManagementModalProps {
  campaign: CampaignState;
  macroState: KingdomMacroState;
  onUpdateMacroState: (next: KingdomMacroState) => void;
  onUpdateCampaign: (next: CampaignState) => void;
  onClose: () => void;
}

type KingdomTabId = 'diplomacy' | 'fiefs' | 'policies' | 'clans';

export const KingdomManagementModal: React.FC<KingdomManagementModalProps> = ({
  campaign,
  macroState,
  onUpdateMacroState,
  onUpdateCampaign,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<KingdomTabId>('diplomacy');
  const [selectedEnemyFaction, setSelectedEnemyFaction] = useState<FactionId>('empire');
  const [selectedElectionSettlementId, setSelectedElectionSettlementId] = useState<string>(
    macroState.activeElection?.settlementId ||
      campaign.settlements.find((s) => s.faction === 'player' && s.type !== 'VILLAGE')?.id ||
      'poros',
  );
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Klavyeden Esc ile kapatma desteği
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyK') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const playerClans = useMemo(
    () => macroState.clans.filter((c) => c.isPlayerClan || c.faction === 'player'),
    [macroState.clans],
  );

  const enemyClans = useMemo(
    () => macroState.clans.filter((c) => c.faction === selectedEnemyFaction),
    [macroState.clans, selectedEnemyFaction],
  );

  const playerFiefs = useMemo(
    () => campaign.settlements.filter((s) => s.faction === 'player'),
    [campaign.settlements],
  );

  const enemyFiefs = useMemo(
    () => campaign.settlements.filter((s) => s.faction === selectedEnemyFaction),
    [campaign.settlements, selectedEnemyFaction],
  );

  // Aktif savaş durumu kontrolü (Hem campaign.world.wars hem de lordların durumu)
  const isCurrentlyAtWarWithSelected = useMemo(() => {
    const activeWars = campaign.world?.wars ?? [];
    const directWar = activeWars.some(
      (w) =>
        (w.a === 'player' && w.b === selectedEnemyFaction) ||
        (w.b === 'player' && w.a === selectedEnemyFaction),
    );
    const hasHostileLords = campaign.lords.some(
      (l) => l.faction === selectedEnemyFaction && l.isAtWarWithPlayer,
    );
    return directWar || hasHostileLords;
  }, [campaign.world?.wars, campaign.lords, selectedEnemyFaction]);

  const liveWarReport = useMemo(() => {
    const warStats = macroState.wars[selectedEnemyFaction];
    return calculateWarDesireAndTribute({
      factionA: 'player',
      factionB: selectedEnemyFaction,
      clansA: playerClans,
      clansB: enemyClans.length > 0 ? enemyClans : macroState.clans.slice(1, 3),
      fiefsA: playerFiefs.length > 0 ? playerFiefs : campaign.settlements.slice(0, 3),
      fiefsB: enemyFiefs,
      warStats,
      useImprovedArchitecture: true,
    });
  }, [
    selectedEnemyFaction,
    macroState.wars,
    macroState.clans,
    playerClans,
    enemyClans,
    playerFiefs,
    enemyFiefs,
    campaign.settlements,
  ]);

  const currentElection = useMemo(() => {
    const target =
      campaign.settlements.find((s) => s.id === selectedElectionSettlementId) ||
      campaign.settlements[0];
    return generateSettlementClaimantBallot({
      settlement: target,
      kingdomClans: macroState.clans.slice(0, 5),
      allSettlements: campaign.settlements,
      conquerorClanId: 'clan-player',
      useImprovedArchitecture: true,
    });
  }, [selectedElectionSettlementId, campaign.settlements, macroState.clans]);

  // Savaş İlan Et
  const handleDeclareWar = (targetFac: FactionId) => {
    const cost = 50;
    if (macroState.influence < cost) {
      setFeedbackBanner(`Savaş ilanı için en az ${cost} Nüfuz gerekiyor.`);
      return;
    }
    sound.playWarhorn();
    const existingWars = campaign.world?.wars ?? [];
    const newWars = [
      ...existingWars.filter(
        (w) =>
          !(
            (w.a === 'player' && w.b === targetFac) ||
            (w.b === 'player' && w.a === targetFac)
          ),
      ),
      { a: 'player' as FactionId, b: targetFac, sinceDay: campaign.day, score: 0, sieges: 0 },
    ];

    const updatedLords = campaign.lords.map((l) =>
      l.faction === targetFac ? { ...l, isAtWarWithPlayer: true } : l,
    );

    onUpdateCampaign({
      ...campaign,
      world: {
        ...(campaign.world ?? { seed: 20261021, stats: {} as any, siegeCooldowns: {} }),
        wars: newWars,
      },
      lords: updatedLords,
    });

    onUpdateMacroState({
      ...macroState,
      influence: macroState.influence - cost,
    });

    setFeedbackBanner(
      `${FACTION_INFO[targetFac].name} devletine resmen savaş ilan edildi! Krallık orduları teyakkuza geçti (-${cost} Nüfuz).`,
    );
  };

  // Barış İmzala
  const handleProposePeace = (targetFac: FactionId) => {
    sound.playCoinChime();
    const existingWars = campaign.world?.wars ?? [];
    const newWars = existingWars.filter(
      (w) =>
        !(
          (w.a === 'player' && w.b === targetFac) ||
          (w.b === 'player' && w.a === targetFac)
        ),
    );

    const updatedLords = campaign.lords.map((l) =>
      l.faction === targetFac ? { ...l, isAtWarWithPlayer: false } : l,
    );

    onUpdateCampaign({
      ...campaign,
      world: {
        ...(campaign.world ?? { seed: 20261021, stats: {} as any, siegeCooldowns: {} }),
        wars: newWars,
      },
      lords: updatedLords,
    });

    setFeedbackBanner(
      `${FACTION_INFO[targetFac].name} ile barış antlaşması imzalandı! Savaş hâli resmen sona erdi.`,
    );
  };

  // Tımar Oylaması
  const handleVoteOnFief = (clanId: string, tier: 1 | 2 | 3, isOverride = false) => {
    const res = resolveKingdomCouncilVote({
      election: currentElection,
      chosenClanId: clanId,
      influenceTier: tier,
      hasFlexibleEthicsPerk: false,
      hasRoyalPrivilegePolicy: macroState.activePolicies.includes('ROYAL_PRIVILEGE'),
      isRulerOverride: isOverride,
      useImprovedArchitecture: true,
    });

    if (macroState.influence < res.influenceSpent && !isOverride) {
      setFeedbackBanner(`Yeterli Nüfuz yok! Gerekli: ${res.influenceSpent}`);
      return;
    }

    sound.playWarhorn();
    const winningClan = macroState.clans.find((c) => c.id === clanId);
    const updatedClans = macroState.clans.map((c) => {
      if (c.id !== clanId) return c;
      const nextFiefs = c.fiefIds.includes(currentElection.settlementId)
        ? c.fiefIds
        : [...c.fiefIds, currentElection.settlementId];
      return {
        ...c,
        fiefIds: nextFiefs,
        relationWithPlayer: Math.min(100, c.relationWithPlayer + res.relationGained),
      };
    });

    const updatedSettlements = campaign.settlements.map((s) =>
      s.id === currentElection.settlementId || s.boundSettlementId === currentElection.settlementId
        ? {
            ...s,
            faction: (winningClan?.isPlayerClan ? 'player' : winningClan?.faction || 'player') as FactionId,
          }
        : s,
    );

    onUpdateCampaign({
      ...campaign,
      settlements: updatedSettlements,
    });

    onUpdateMacroState({
      ...macroState,
      influence: macroState.influence - res.influenceSpent,
      clans: updatedClans,
    });

    setFeedbackBanner(
      `Konsey Kararı Onaylandı: ${currentElection.settlementName} tımarı ${winningClan?.name} hanedanına verildi (-${res.influenceSpent} Nüfuz, +${res.relationGained} İlişki).`,
    );
  };

  // Politika Yürürlüğe Koy / Kaldır
  const handleTogglePolicy = (policyId: KingdomPolicyId) => {
    const exists = macroState.activePolicies.includes(policyId);
    const cost = KINGDOM_POLICIES[policyId].influenceCostToPropose;
    if (!exists && macroState.influence < cost) {
      setFeedbackBanner(`Politika oylaması için ${cost} Nüfuz gerekiyor.`);
      return;
    }
    sound.playCoinChime();
    const nextPolicies = exists
      ? macroState.activePolicies.filter((p) => p !== policyId)
      : [...macroState.activePolicies, policyId];
    onUpdateMacroState({
      ...macroState,
      influence: exists ? macroState.influence : macroState.influence - cost,
      activePolicies: nextPolicies,
    });
    setFeedbackBanner(
      exists
        ? `${KINGDOM_POLICIES[policyId].name} yürürlükten kaldırıldı.`
        : `${KINGDOM_POLICIES[policyId].name} Krallık Meclisi tarafından yürürlüğe kondu (-${cost} Nüfuz)!`,
    );
  };

  // Yoldaşı Vasal Klana Terfi Ettir
  const handlePromoteCompanionToClan = () => {
    const costGold = 500;
    const costInfluence = 50;
    const playerFiefsNonVillage = campaign.settlements.filter(
      (s) => s.faction === 'player' && s.type !== 'VILLAGE',
    );
    if (playerFiefsNonVillage.length === 0) {
      setFeedbackBanner('Yoldaşı soylu yapmak için krallığınıza ait en az 1 Kale veya Şehir tımarı bağışlamalısınız.');
      return;
    }
    if (campaign.gold < costGold || macroState.influence < costInfluence) {
      setFeedbackBanner(
        `Yoldaşı soylu klana terfi ettirmek için ${costGold} Dinar ve ${costInfluence} Nüfuz gerekiyor.`,
      );
      return;
    }
    sound.playWarhorn();
    const newClanId = `clan-comp-${Date.now()}`;
    const targetFief = playerFiefsNonVillage[0];

    const newClan = {
      id: newClanId,
      name: 'Sungur Hanedanı (Yoldaş Soylusu)',
      faction: 'player' as FactionId,
      culture: 'empire' as FactionId,
      tier: 3,
      renown: 420,
      gold: 25000,
      influence: 120,
      isRulingClan: false,
      isPlayerClan: false,
      isIndependent: false,
      daysWithoutKingdom: 0,
      warPartyCount: 2,
      totalStrength: 380,
      fiefIds: [targetFief.id],
      totalFiefValue: targetFief.prosperity,
      workshopsCount: 1,
      caravansCount: 1,
      traits: ['HONORABLE', 'DARING'] as const,
      relationWithPlayer: 75,
      relationWithRuler: 75,
      succession: {
        leaderId: `hero-${newClanId}`,
        leaderName: 'Lord Sungur',
        isRegentActive: false,
        regentName: null,
        heirQueue: [{ id: `heir-${newClanId}`, name: 'Alp Sungur', age: 19, isAdult: true }],
      },
    };

    onUpdateCampaign({
      ...campaign,
      gold: campaign.gold - costGold,
      settlements: campaign.settlements.map((s) =>
        s.id === targetFief.id ? { ...s, faction: 'player' as FactionId } : s,
      ),
    });

    onUpdateMacroState({
      ...macroState,
      influence: macroState.influence - costInfluence,
      clans: [...macroState.clans, { ...newClan, traits: [...newClan.traits] }],
    });

    setFeedbackBanner(
      `Yoldaşınız, "${newClan.name}" adıyla Seviye 3 Soylu Derebeyi ilan edildi ve ${targetFief.name} tımarı kendisine bağlandı (-${costGold} Dinar, -${costInfluence} Nüfuz).`,
    );
  };

  const majorFactions: FactionId[] = ['empire', 'vlandia', 'battania', 'sturgia', 'khuzait', 'aserai'];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 pointer-events-auto select-none"
      style={{ backgroundColor: 'rgba(6, 5, 4, 0.88)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kingdom-macro-modal-title"
    >
      <div className="hud-panel w-full max-w-6xl max-h-[92vh] flex flex-col rounded-lg border-2 border-[#c6a15b]/55 bg-[#110e0b] text-[#f3ead8] shadow-2xl overflow-hidden">
        {/* ÜST BAŞLIK */}
        <div className="px-5 py-3.5 border-b border-[#c6a15b]/35 bg-gradient-to-r from-[#191510] via-[#231c14] to-[#191510] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-[#c6a15b]/60 bg-[#1c1610] flex items-center justify-center text-[#fbbf24] shadow-inner">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5m14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
              </svg>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#c6a15b] tracking-wider uppercase">
                SANCAK DİVANI · DEVLET MECLİSİ
              </div>
              <h2
                id="kingdom-macro-modal-title"
                className="text-xl sm:text-2xl font-display font-bold text-[#fef08a]"
              >
                Krallık Divanı ve Devlet Yönetimi
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3 py-1.5 rounded bg-[#18140f] border border-[#c6a15b]/30 font-mono-tabular text-xs flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="text-[#a89b84]">Nüfuz:</span>
                <strong className="text-[#fbbf24] font-bold">{macroState.influence}</strong>
              </span>
              <span className="text-[#c6a15b]/40">·</span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#a89b84]">Hazine:</span>
                <strong className="text-[#34d399] font-bold">{campaign.gold.toLocaleString()} Dinar</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Krallık ekranını kapat"
              className="px-3 py-1.5 rounded text-xs font-bold bg-[#282118] hover:bg-[#382f22] text-[#fde68a] border border-[#c6a15b]/50 transition-colors whitespace-nowrap"
            >
              Kapat [K / Esc]
            </button>
          </div>
        </div>

        {/* 4 KANONİK BANNERLORD SEKMESİ */}
        <div className="px-4 py-2 border-b border-[#c6a15b]/25 bg-[#16120d] flex flex-wrap items-center gap-2">
          {[
            { id: 'diplomacy', label: '1. DİPLOMASİ (Savaş & Barış)' },
            { id: 'fiefs', label: '2. TIMARLAR (Mülkler & Oylama)' },
            { id: 'policies', label: '3. POLİTİKALAR (Krallık Kanunları)' },
            { id: 'clans', label: '4. KLANLAR (Derebeyleri & Hanedanlar)' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id as KingdomTabId);
                setFeedbackBanner(null);
              }}
              className={`px-4 py-2 rounded text-xs font-bold tracking-wide transition-all whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-gradient-to-r from-[#b45309] to-[#d97706] text-white border border-[#fde68a]/60 shadow-md'
                  : 'bg-[#1f1a13] text-[#d1c5b0] hover:bg-[#2c251b] border border-[#c6a15b]/20'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {feedbackBanner && (
          <div className="mx-5 mt-3 px-4 py-2.5 rounded bg-[#261f14] border border-[#f59e0b]/60 text-xs text-[#fde68a] flex items-center justify-between gap-2 shadow-lg">
            <span className="font-medium">{feedbackBanner}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-[#c6a15b] hover:text-white font-bold px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* SEKME İÇERİKLERİ */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* ================================================================ */}
          {/* SEKME 1: DİPLOMASİ (SAVAŞ & BARIŞ DURUMU)                        */}
          {/* ================================================================ */}
          {activeTab === 'diplomacy' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Sol: Krallık Listesi */}
              <div className="lg:col-span-4 space-y-2">
                <div className="text-xs font-bold text-[#c6a15b] uppercase tracking-wider mb-2">
                  Kalradya Krallıkları
                </div>
                <div className="space-y-1.5">
                  {majorFactions.map((fac) => {
                    const isSelected = selectedEnemyFaction === fac;
                    const wars = campaign.world?.wars ?? [];
                    const isWar =
                      wars.some(
                        (w) =>
                          (w.a === 'player' && w.b === fac) ||
                          (w.b === 'player' && w.a === fac),
                      ) ||
                      campaign.lords.some((l) => l.faction === fac && l.isAtWarWithPlayer);
                    const facSettlements = campaign.settlements.filter(
                      (s) => s.faction === fac && s.type !== 'VILLAGE',
                    );

                    return (
                      <button
                        key={fac}
                        type="button"
                        onClick={() => setSelectedEnemyFaction(fac)}
                        className={`w-full p-3 rounded text-left transition-all flex items-center justify-between border ${
                          isSelected
                            ? 'bg-[#2a2217] border-[#fbbf24] shadow-md'
                            : 'bg-[#18140f] border-[#c6a15b]/20 hover:bg-[#221c15]'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-sm text-[#f8f0df]">
                            {FACTION_INFO[fac].name}
                          </div>
                          <div className="text-[11px] text-[#a89b84]">
                            {facSettlements.length} Şehir/Kale · Kültür: {fac.toUpperCase()}
                          </div>
                        </div>

                        <div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isWar
                                ? 'bg-[#7f1d1d] text-[#fecaca] border border-[#ef4444]/40'
                                : 'bg-[#14532d] text-[#bbf7d0] border border-[#22c55e]/30'
                            }`}
                          >
                            {isWar ? 'SAVAŞTA' : 'BARIŞTA'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sağ: Seçili Krallıkla Diplomasi Detayı */}
              <div className="lg:col-span-8 space-y-4">
                <div className="p-5 rounded bg-[#17130e] border border-[#c6a15b]/30 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c6a15b]/20 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#fef08a]">
                        {FACTION_INFO[selectedEnemyFaction].name} ile İlişkiler
                      </h3>
                      <p className="text-xs text-[#b5a890]">
                        Hükümdar sancağı ve iki devlet arasındaki diplomatik denge
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCurrentlyAtWarWithSelected ? (
                        <button
                          type="button"
                          onClick={() => handleProposePeace(selectedEnemyFaction)}
                          className="px-4 py-2 rounded text-xs font-bold bg-[#15803d] hover:bg-[#16a34a] text-white border border-[#86efac] shadow transition-colors"
                        >
                          Barış Antlaşması Teklif Et
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDeclareWar(selectedEnemyFaction)}
                          className="px-4 py-2 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-[#fca5a5] shadow transition-colors"
                        >
                          Savaş İlan Et (50 Nüfuz)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* İstatistik Göstergeleri */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-tabular">
                    <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[11px] text-[#a89b84] block">Devlet Statüsü</span>
                      <strong
                        className={`text-sm font-bold ${
                          isCurrentlyAtWarWithSelected ? 'text-[#f87171]' : 'text-[#34d399]'
                        }`}
                      >
                        {isCurrentlyAtWarWithSelected ? 'Resmi Savaş Hâli' : 'Sulh ve Barış'}
                      </strong>
                    </div>

                    <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[11px] text-[#a89b84] block">Savaş İsteği</span>
                      <strong className="text-sm font-bold text-[#fbbf24]">
                        %{liveWarReport.warDesireScorePct}
                      </strong>
                    </div>

                    <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[11px] text-[#a89b84] block">Karşı Taraf Tımar</span>
                      <strong className="text-sm font-bold text-[#f8f0df]">
                        {enemyFiefs.length} Yerleşim
                      </strong>
                    </div>

                    <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[11px] text-[#a89b84] block">Öngörülen Haraç</span>
                      <strong className="text-sm font-bold text-[#38bdf8]">
                        {liveWarReport.dailyTributeFromAToB < 0
                          ? `+${Math.abs(liveWarReport.dailyTributeFromAToB)} Dinar/gün (Bize)`
                          : liveWarReport.dailyTributeFromAToB > 0
                            ? `-${liveWarReport.dailyTributeFromAToB} Dinar/gün (Onlara)`
                            : 'Denk (0)'}
                      </strong>
                    </div>
                  </div>

                  {/* Açıklama Metni */}
                  <div className="p-3.5 rounded bg-[#130f0c] border border-[#c6a15b]/20 text-xs text-[#d1c5b0] leading-relaxed">
                    {isCurrentlyAtWarWithSelected ? (
                      <p>
                        ⚔️ <strong className="text-[#f87171]">Savaş hâli devam ediyor:</strong> Bu krallığın birlikleri haritada görüldüğü yerde ordumuza hücum edebilir. Barış imzalamak için divan heyeti gönderip antlaşma teklif edebilir veya şehirlerini kuşatarak üstünlük sağlayabilirsiniz.
                      </p>
                    ) : (
                      <p>
                        🕊️ <strong className="text-[#34d399]">Barış hâli geçerli:</strong> Sınır boylarında ticaret ve kervan hareketleri serbesttir. Toprak genişletmek veya nüfuz kazanmak için 50 Nüfuz karşılığında divan oylamasıyla savaş ilan edebilirsiniz.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* SEKME 2: TIMARLAR & KONSEY OYLAMASI                              */}
          {/* ================================================================ */}
          {activeTab === 'fiefs' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Sol: Krallık Tımarları Listesi */}
              <div className="lg:col-span-5 space-y-2">
                <div className="text-xs font-bold text-[#c6a15b] uppercase tracking-wider mb-2">
                  Krallığa Ait Şehirler ve Kaleler
                </div>
                <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                  {campaign.settlements
                    .filter((s) => s.faction === 'player' && s.type !== 'VILLAGE')
                    .map((fief) => {
                      const isSelected = selectedElectionSettlementId === fief.id;
                      return (
                        <button
                          key={fief.id}
                          type="button"
                          onClick={() => setSelectedElectionSettlementId(fief.id)}
                          className={`w-full p-3 rounded text-left transition-all border ${
                            isSelected
                              ? 'bg-[#2a2217] border-[#fbbf24] shadow-md'
                              : 'bg-[#18140f] border-[#c6a15b]/20 hover:bg-[#221c15]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-[#f8f0df]">{fief.name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#1c1610] text-[#fbbf24] border border-[#c6a15b]/30">
                              {fief.type === 'TOWN' ? 'ŞEHİR' : 'KALE'}
                            </span>
                          </div>
                          <div className="text-xs text-[#a89b84] mt-1 flex items-center gap-3">
                            <span>Refah: {fief.prosperity}</span>
                            <span>Garnizon: {fief.garrison}</span>
                            <span>Milis: {fief.militia ?? 0}</span>
                          </div>
                        </button>
                      );
                    })}
                  {campaign.settlements.filter((s) => s.faction === 'player' && s.type !== 'VILLAGE').length === 0 && (
                    <div className="p-4 rounded bg-[#18140f] border border-[#c6a15b]/20 text-xs text-[#a89b84] text-center">
                      Henüz krallığınıza bağlı bir Şehir veya Kale bulunmuyor. Bir kale fethederek ilk mülkünüzü edinin.
                    </div>
                  )}
                </div>
              </div>

              {/* Sağ: Tımar Dağıtımı Konsey Oylaması */}
              <div className="lg:col-span-7 space-y-4">
                <div className="p-5 rounded bg-[#17130e] border border-[#c6a15b]/30 space-y-4">
                  <div className="border-b border-[#c6a15b]/20 pb-3">
                    <h3 className="text-base font-bold text-[#fef08a]">
                      Tımar Oylaması: {currentElection.settlementName}
                    </h3>
                    <p className="text-xs text-[#b5a890]">
                      Bu mülkün hangi derebeyi hanedanına verileceğine krallık meclisinde karar verin
                    </p>
                  </div>

                  {/* 3 Aday Klan */}
                  <div className="space-y-3">
                    {currentElection.candidates.map((cand) => {
                      const clan = macroState.clans.find((c) => c.id === cand.clanId);
                      return (
                        <div
                          key={cand.clanId}
                          className="p-3.5 rounded bg-[#120f0b] border border-[#c6a15b]/25 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-sm text-[#f8f0df]">
                                {cand.clanName}
                                {clan?.isPlayerClan && (
                                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#14532d] text-[#86efac]">
                                    Sizin Klanınız
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#a89b84]">
                                Liyakat Puanı: {Math.round(cand.finalMeritScore)} (%{Math.round(cand.councilSupportPct)} Meclis Desteği) · Seviye {clan?.tier ?? 3} · {clan?.fiefIds.length ?? 0} Mevcut Tımar
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleVoteOnFief(cand.clanId, 1)}
                                className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#221c14] hover:bg-[#32271a] text-[#fbbf24] border border-[#c6a15b]/30 transition-colors"
                              >
                                20 Nüfuz
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVoteOnFief(cand.clanId, 2)}
                                className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#221c14] hover:bg-[#32271a] text-[#fbbf24] border border-[#c6a15b]/30 transition-colors"
                              >
                                60 Nüfuz
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVoteOnFief(cand.clanId, 3)}
                                className="px-2.5 py-1.5 rounded text-xs font-semibold bg-[#221c14] hover:bg-[#32271a] text-[#fbbf24] border border-[#c6a15b]/30 transition-colors"
                              >
                                140 Nüfuz
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVoteOnFief(cand.clanId, 1, true)}
                                className="px-2.5 py-1.5 rounded text-xs font-bold bg-[#9a3412] hover:bg-[#c2410c] text-white border border-[#fdba74]/50 transition-colors"
                              >
                                Fermanla Ver
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* SEKME 3: KRALLIK POLİTİKALARI (KANUNLAR)                         */}
          {/* ================================================================ */}
          {activeTab === 'policies' && (
            <div className="space-y-4">
              <div className="border-b border-[#c6a15b]/20 pb-2">
                <h3 className="text-base font-bold text-[#fef08a]">
                  Resmi Krallık Politikaları ve Kanunları
                </h3>
                <p className="text-xs text-[#b5a890]">
                  Yürürlüğe konan kanunlar tüm krallık genelinde kalıcı sadakat, üretim ve nüfuz etkileri yaratır
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(Object.keys(KINGDOM_POLICIES) as KingdomPolicyId[]).map((polId) => {
                  const policy = KINGDOM_POLICIES[polId];
                  const isActive = macroState.activePolicies.includes(polId);

                  return (
                    <div
                      key={polId}
                      className={`p-4 rounded border transition-all flex flex-col justify-between gap-3 ${
                        isActive
                          ? 'bg-[#1f281b] border-[#22c55e]/50 shadow-md'
                          : 'bg-[#15110d] border-[#c6a15b]/25 hover:border-[#c6a15b]/45'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-bold text-sm text-[#f8f0df]">{policy.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isActive
                                ? 'bg-[#14532d] text-[#86efac] border border-[#22c55e]/30'
                                : 'bg-[#221c15] text-[#a89b84]'
                            }`}
                          >
                            {isActive ? 'YÜRÜRLÜKTE' : 'PASİF'}
                          </span>
                        </div>
                        <p className="text-xs text-[#c7baa3] leading-relaxed">{policy.summary}</p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-[#c6a15b]/15 text-xs">
                        <div className="flex items-center gap-3 text-[#fbbf24] font-mono-tabular">
                          {policy.dailyLoyaltyBonus > 0 && <span>+{policy.dailyLoyaltyBonus} Sadakat</span>}
                          {policy.dailyInfluenceBonus > 0 && <span>+{policy.dailyInfluenceBonus} Nüfuz</span>}
                          {policy.productionModifierPct !== 0 && (
                            <span>{policy.productionModifierPct}% Üretim</span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTogglePolicy(polId)}
                          className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${
                            isActive
                              ? 'bg-[#7f1d1d] hover:bg-[#991b1b] text-white border border-[#f87171]/40'
                              : 'bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/40'
                          }`}
                        >
                          {isActive
                            ? 'Yürürlükten Kaldır'
                            : `Yürürlüğe Koy (${policy.influenceCostToPropose} Nüfuz)`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* SEKME 4: KLANLAR VE DEREBEYLERİ                                  */}
          {/* ================================================================ */}
          {activeTab === 'clans' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c6a15b]/20 pb-3">
                <div>
                  <h3 className="text-base font-bold text-[#fef08a]">
                    Krallık Klanları ve Feodal Derebeyleri
                  </h3>
                  <p className="text-xs text-[#b5a890]">
                    Krallığınıza bağlı soylu hanedanların güç dengesi, ordu mevcutları ve tımarları
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePromoteCompanionToClan}
                  className="px-4 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/50 shadow transition-colors"
                >
                  Yoldaşı Vasal Klana Terfi Ettir (500 Dinar + 50 Nüfuz)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {macroState.clans.map((clan) => (
                  <div
                    key={clan.id}
                    className={`p-4 rounded border ${
                      clan.isPlayerClan
                        ? 'bg-[#241c14] border-[#fbbf24] shadow-md'
                        : 'bg-[#15110d] border-[#c6a15b]/25'
                    } space-y-3`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm text-[#f8f0df]">
                          {clan.name}
                          {clan.isPlayerClan && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#15803d] text-white">
                              Hükümdar Klanı
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#a89b84]">
                          Lider: {clan.succession.leaderName || 'Lord'} · Seviye {clan.tier}
                        </div>
                      </div>

                      <div className="text-right font-mono-tabular text-xs">
                        <div className="text-[#fbbf24] font-bold">{clan.renown} Nam</div>
                        <div className="text-[#a89b84]">{clan.influence} Nüfuz</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs font-mono-tabular text-center pt-2 border-t border-[#c6a15b]/15">
                      <div className="p-2 rounded bg-[#100c09]">
                        <span className="text-[10px] text-[#a89b84] block">Asker Gücü</span>
                        <span className="font-bold text-[#f8f0df]">{clan.totalStrength}</span>
                      </div>
                      <div className="p-2 rounded bg-[#100c09]">
                        <span className="text-[10px] text-[#a89b84] block">Tımar Sayısı</span>
                        <span className="font-bold text-[#fbbf24]">{clan.fiefIds.length}</span>
                      </div>
                      <div className="p-2 rounded bg-[#100c09]">
                        <span className="text-[10px] text-[#a89b84] block">İlişki</span>
                        <span
                          className={`font-bold ${
                            clan.relationWithPlayer >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'
                          }`}
                        >
                          {clan.relationWithPlayer >= 0 ? `+${clan.relationWithPlayer}` : clan.relationWithPlayer}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
