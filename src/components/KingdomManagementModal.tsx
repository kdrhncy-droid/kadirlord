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
  computeWeatherAndAutoBattleModifiers,
  evaluateStateDrivenKingdomDestruction,
  generateSettlementClaimantBallot,
  resolveClanLeaderOrRegent,
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

type KingdomTabId =
  | 'diplomacy_war'
  | 'council_election'
  | 'clans_succession'
  | 'destruction_loyalty'
  | 'architecture_matrix';

export const KingdomManagementModal: React.FC<KingdomManagementModalProps> = ({
  campaign,
  macroState,
  onUpdateMacroState,
  onUpdateCampaign,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<KingdomTabId>('diplomacy_war');
  const [selectedEnemyFaction, setSelectedEnemyFaction] = useState<FactionId>('empire');
  const [selectedElectionSettlementId, setSelectedElectionSettlementId] = useState<string>(
    macroState.activeElection?.settlementId || 'poros',
  );
  const [hasFlexibleEthicsPerk, setHasFlexibleEthicsPerk] = useState(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

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
      useImprovedArchitecture: macroState.useImprovedArchitecture,
    });
  }, [
    selectedEnemyFaction,
    macroState.wars,
    macroState.clans,
    macroState.useImprovedArchitecture,
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
      useImprovedArchitecture: macroState.useImprovedArchitecture,
    });
  }, [
    selectedElectionSettlementId,
    campaign.settlements,
    macroState.clans,
    macroState.useImprovedArchitecture,
  ]);

  const handleToggleArchitectureMode = () => {
    sound.playCoinChime();
    const nextMode = !macroState.useImprovedArchitecture;
    onUpdateMacroState({
      ...macroState,
      useImprovedArchitecture: nextMode,
    });
    setFeedbackBanner(
      nextMode
        ? 'Mimari Çözüm Modu Aktif: Logaritmik Mesafe Sönümlemesi (^0.25), Kültür Eşleşmesi (+60 Puan), Savaş Yorgunluğu ve Naip (Regent) Koruması devrede.'
        : 'Vanilla Bannerlord 1.2 Modu Aktif: Tımar-Güç Paradoksu, ^0.5 Karekök Mesafe Tuzağı ve Sabit 20 Nüfuz Eşiği (Flexible Ethics Hatası) gözlemlenebilir.',
    );
  };

  const handleVoteOnFief = (clanId: string, tier: 1 | 2 | 3, isOverride = false) => {
    const res = resolveKingdomCouncilVote({
      election: currentElection,
      chosenClanId: clanId,
      influenceTier: tier,
      hasFlexibleEthicsPerk,
      hasRoyalPrivilegePolicy: macroState.activePolicies.includes('ROYAL_PRIVILEGE'),
      isRulerOverride: isOverride,
      useImprovedArchitecture: macroState.useImprovedArchitecture,
    });

    if (macroState.influence < res.influenceSpent && !isOverride) {
      setFeedbackBanner(`Yeterli Nüfuz (Influence) yok! Gerekli: ${res.influenceSpent}`);
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

    if (res.flexibleEthicsBugTriggered) {
      setFeedbackBanner(
        `[VANILLA HATASI TETİKLENDİ] Flexible Ethics perki nüfuz maliyetini 20'den ${res.influenceSpent}'ye düşürdüğü için sabit 'influence >= 20' eşiği geçilemedi: +0 İlişki ve +0 Cazibe (Charm) XP verildi!`,
      );
    } else {
      setFeedbackBanner(
        `Konsey Kararı Onaylandı: ${currentElection.settlementName} tımarı ${winningClan?.name} sancağına verildi (-${res.influenceSpent} Nüfuz, +${res.relationGained} İlişki, +${res.charmXpGained} Cazibe XP).`,
      );
    }
  };

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
        : `${KINGDOM_POLICIES[policyId].name} Krallık Konseyi tarafından yürürlüğe kondu!`,
    );
  };

  const handlePromoteCompanionToClan = () => {
    const costGold = 500; // Scaled to campaign economy (represents 20,000 denars in Bannerlord)
    const costInfluence = 50;
    if (campaign.gold < costGold || macroState.influence < costInfluence) {
      setFeedbackBanner(
        `Yoldaşı soylu klana terfi ettirmek için ${costGold} Dinar, ${costInfluence} Nüfuz ve 1 Tımar gerekiyor.`,
      );
      return;
    }
    sound.playWarhorn();
    const newClanId = `clan-comp-${Date.now()}`;
    const targetFief =
      campaign.settlements.find((s) => s.faction === 'player' && s.type !== 'VILLAGE') ||
      campaign.settlements[0];

    const newClan = {
      id: newClanId,
      name: 'Aybars Sancağı (Terfi Eden Yoldaş)',
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
      relationWithPlayer: 65,
      relationWithRuler: 65,
      succession: {
        leaderId: `hero-${newClanId}`,
        leaderName: 'Lord Aybars',
        isRegentActive: false,
        regentName: null,
        heirQueue: [{ id: `heir-${newClanId}`, name: 'Genç Sungur', age: 18, isAdult: true }],
      },
    };

    onUpdateCampaign({
      ...campaign,
      gold: campaign.gold - costGold,
      renown: campaign.renown + 25,
    });

    onUpdateMacroState({
      ...macroState,
      influence: macroState.influence - costInfluence,
      clans: [...macroState.clans, { ...newClan, traits: [...newClan.traits] }],
    });

    setFeedbackBanner(
      `Yoldaşınız İzci Aybars, "${newClan.name}" adıyla Seviye 3 Soylu Vasal Klana terfi ettirildi ve ${targetFief.name} tımarı kendisine bağlandı!`,
    );
  };

  const handleSimulateLeaderFallAndSuccession = (clanId: string) => {
    sound.playSwordSwing();
    const updated = macroState.clans.map((c) => {
      if (c.id !== clanId) return c;
      // Drain adult heirs to demonstrate Null-Safe Regent appointment if needed
      const nextQueue = c.succession.heirQueue.slice(1);
      const nextSucc = resolveClanLeaderOrRegent({
        ...c,
        succession: {
          ...c.succession,
          leaderName: '',
          isRegentActive: false,
          heirQueue: nextQueue,
        },
      });
      return {
        ...c,
        succession: nextSucc,
      };
    });

    onUpdateMacroState({
      ...macroState,
      clans: updated,
    });

    const target = updated.find((c) => c.id === clanId);
    setFeedbackBanner(
      `Veraset & Null-Safety Testi: ${target?.name} liderliği devredildi -> Yeni Lider: ${target?.succession.leaderName} (${
        target?.succession.isRegentActive
          ? 'Reşit varis kalmadığı için Naip [Regent] atandı — NullReferenceException önlendi!'
          : 'Yetişkin Varis Tahta Geçti'
      })`,
    );
  };

  const handleSimulateFieflessDestruction = (targetFaction: FactionId) => {
    sound.playWarhorn();
    // Transfer all fortifications of targetFaction to player to trigger State-Driven Destruction
    const updatedSettlements = campaign.settlements.map((s) =>
      s.faction === targetFaction ? { ...s, faction: 'player' as FactionId } : s,
    );

    const check = evaluateStateDrivenKingdomDestruction({
      settlements: updatedSettlements,
      clans: macroState.clans,
      alreadyDestroyed: macroState.destroyedKingdoms,
      daysElapsed: 7,
    });

    onUpdateCampaign({
      ...campaign,
      settlements: updatedSettlements,
    });

    onUpdateMacroState({
      ...macroState,
      clans: check.updatedClans,
      destroyedKingdoms: [
        ...new Set([...macroState.destroyedKingdoms, ...check.newlyDestroyedFactions]),
      ],
    });

    setFeedbackBanner(
      `Durum Güdümlü (State-Driven) Yıkım Tetiklendi: ${FACTION_INFO[targetFaction].name} son tımarını kaybettiği anda yıkıldı! Klanları 28 günlük (4 hafta) bağımsız hayatta kalma/iltihak penceresine girdi.`,
    );
  };

  const weatherMods = computeWeatherAndAutoBattleModifiers(macroState.weatherCondition, true);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 pointer-events-auto select-none"
      style={{ backgroundColor: 'rgba(6, 5, 4, 0.88)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kingdom-macro-modal-title"
    >
      <div className="hud-panel w-full max-w-6xl max-h-[92vh] flex flex-col rounded-lg border-2 border-[#c6a15b]/55 bg-[#110e0b] text-[#f3ead8] shadow-2xl overflow-hidden">
        {/* TOP HEADER */}
        <div className="px-5 py-3.5 border-b border-[#c6a15b]/35 bg-gradient-to-r from-[#191510] via-[#231c14] to-[#191510] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-[#c6a15b] tracking-wider">
              SANCAK DİVANI · KRALLIK MECLİSİ
            </div>
            <h2
              id="kingdom-macro-modal-title"
              className="text-xl sm:text-2xl font-display font-bold text-[#fef08a]"
            >
              Krallık Divanı ve Diplomasi
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-2.5 py-1.5 rounded bg-[#18140f] border border-[#c6a15b]/30 font-mono-tabular text-xs flex items-center gap-2">
              <span>
                Nüfuz: <strong className="text-[#fbbf24]">{macroState.influence}</strong>
              </span>
              <span>·</span>
              <span>
                İnsan Gücü: <strong className="text-[#34d399]">{macroState.manpowerPools.player}</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={handleToggleArchitectureMode}
              className={`px-2.5 py-1.5 rounded text-xs font-bold border transition-colors whitespace-nowrap ${
                macroState.useImprovedArchitecture
                  ? 'bg-[#15803d] text-white border-[#86efac]'
                  : 'bg-[#7f1d1d] text-[#fecaca] border-[#f87171]'
              }`}
            >
              {macroState.useImprovedArchitecture
                ? 'Mimari: Geliştirilmiş'
                : 'Mimari: Standart'}
            </button>

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

        {/* NAVIGATION TABS */}
        <div className="px-4 py-2 border-b border-[#c6a15b]/25 bg-[#16120d] flex flex-wrap items-center gap-1.5">
          {(
            [
              {
                id: 'diplomacy_war',
                label: '01. Diplomasi & Haraç (DefaultDiplomacyModel)',
              },
              {
                id: 'council_election',
                label: '02. Konsey & Tımar Liyakat (CalculateMeritOfOutcome)',
              },
              {
                id: 'clans_succession',
                label: '03. Klan Ekonomisi & Naip Veraseti',
              },
              {
                id: 'destruction_loyalty',
                label: '04. Krallık Yıkımı, Sadakat & İklim',
              },
              {
                id: 'architecture_matrix',
                label: '05. 4 Katmanlı Mimari & Çözüm Matrisi',
              },
            ] as Array<{ id: KingdomTabId; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id);
                setFeedbackBanner(null);
              }}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-[#b45309] text-white border border-[#fde68a]/50'
                  : 'bg-[#1f1a13] text-[#d1c5b0] hover:bg-[#2c251b]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {feedbackBanner && (
          <div className="mx-5 mt-3 px-4 py-2 rounded bg-[#261f14] border border-[#f59e0b]/50 text-xs text-[#fde68a] flex items-center justify-between gap-2">
            <span>{feedbackBanner}</span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-[#c6a15b] hover:text-white font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB CONTENT */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* ================================================================ */}
          {/* TAB 1: DEFAULTDIPLOMACYMODEL, WARDESIRERATIO & TRIBUTE PARADOX    */}
          {/* ================================================================ */}
          {activeTab === 'diplomacy_war' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Live Kingdom War Desire & Asymmetric Metrics (tam genişlik: sandbox laboratuvarı 10.1 ile kaldırıldı) */}
              <div className="lg:col-span-12 space-y-4">
                <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#c6a15b]/20 pb-2.5 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#fef08a]">
                        DefaultDiplomacyModel.GetScoreOfDeclaringWar & Haraç Motoru
                      </h3>
                      <p className="text-xs text-[#b5a890]">
                        WarDesireRatio = ((TotalClanWarPartyCount × X) + TotalKingdomStrength) / TotalValueOfKingdomFiefs
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(
                        ['empire', 'vlandia', 'battania', 'sturgia', 'khuzait', 'aserai'] as FactionId[]
                      ).map((fac) => (
                        <button
                          key={fac}
                          type="button"
                          onClick={() => setSelectedEnemyFaction(fac)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                            selectedEnemyFaction === fac
                              ? 'bg-[#b45309] text-white'
                              : 'bg-[#221c15] text-[#d1c5b0] hover:bg-[#30281e]'
                          }`}
                        >
                          {FACTION_INFO[fac].name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Formula Live Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono-tabular text-xs mb-3">
                    <div className="p-2.5 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Savaş Partisi Yoğunluğu
                      </span>
                      <span className="text-sm font-bold text-[#f8f0df]">
                        {liveWarReport.totalWarPartiesA} × {liveWarReport.dynamicMultiplierX}
                      </span>
                    </div>
                    <div className="p-2.5 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Toplam Güç (Milis Hariç)
                      </span>
                      <span className="text-sm font-bold text-[#34d399]">
                        {liveWarReport.totalStrengthA}
                      </span>
                    </div>
                    <div className="p-2.5 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Tımar Değeri (Payda)
                      </span>
                      <span className="text-sm font-bold text-[#fbbf24]">
                        {liveWarReport.totalValueOfFiefsA}
                      </span>
                    </div>
                    <div className="p-2.5 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Savaş İsteği Skoru
                      </span>
                      <span className="text-sm font-bold text-[#f87171]">
                        %{liveWarReport.warDesireScorePct}
                      </span>
                    </div>
                  </div>

                  {/* Asymmetric War Metrics Table */}
                  <div className="text-xs space-y-2 border-t border-[#c6a15b]/20 pt-3">
                    <div className="font-semibold text-[#fde68a]">
                      Saha Metriklerinin Asimetrik Ağırlığı ({FACTION_INFO[selectedEnemyFaction].name} Cephesi)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tabular">
                      <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/15">
                        <div className="text-[10px] text-[#a89b84]">Asker Zayiatı (Düşük)</div>
                        <div className="font-bold text-[#e2d6c1]">
                          {macroState.wars[selectedEnemyFaction].casualtiesInflicted} /{' '}
                          {macroState.wars[selectedEnemyFaction].casualtiesSustained}
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/15">
                        <div className="text-[10px] text-[#34d399]">Esir Lordlar (Çok Yüksek)</div>
                        <div className="font-bold text-[#34d399]">
                          {macroState.wars[selectedEnemyFaction].prisonersCaptured} Esir Lord
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/15">
                        <div className="text-[10px] text-[#f87171]">Köy Yağmaları (Aşırı Yüksek)</div>
                        <div className="font-bold text-[#f87171]">
                          {macroState.wars[selectedEnemyFaction].raidsInflicted} vs{' '}
                          {macroState.wars[selectedEnemyFaction].raidsSustained} Yağma
                        </div>
                      </div>
                      <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/15">
                        <div className="text-[10px] text-[#fbbf24]">Kuşatmalar & Yorgunluk</div>
                        <div className="font-bold text-[#fbbf24]">
                          {macroState.wars[selectedEnemyFaction].siegesWon} Zafer · %
                          {liveWarReport.warExhaustionB} Yorgunluk
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      <div className="text-xs text-[#d1c5b0]">
                        Hesaplanan Günlük Haraç:{' '}
                        <strong
                          className={
                            liveWarReport.dailyTributeFromAToB <= 0
                              ? 'text-[#34d399] font-mono-tabular'
                              : 'text-[#f87171] font-mono-tabular'
                          }
                        >
                          {liveWarReport.dailyTributeFromAToB <= 0
                            ? `Günlük +${Math.abs(liveWarReport.dailyTributeFromAToB)} Dinar Haraç Alınır`
                            : `Günlük -${liveWarReport.dailyTributeFromAToB} Dinar Haraç Ödenir`}
                        </strong>
                        {macroState.wars[selectedEnemyFaction].tributeDebt > 0 && (
                          <span className="ml-2 text-[#fbbf24]">
                            (Birikmiş Haraç Borcu: {macroState.wars[selectedEnemyFaction].tributeDebt} Dinar)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sound.playWarhorn();
                            const currentWar = macroState.wars[selectedEnemyFaction];
                            onUpdateMacroState({
                              ...macroState,
                              wars: {
                                ...macroState.wars,
                                [selectedEnemyFaction]: {
                                  ...currentWar,
                                  prisonersCaptured: currentWar.prisonersCaptured + 2,
                                  siegesWon: currentWar.siegesWon + 1,
                                },
                              },
                            });
                            setFeedbackBanner(
                              `${FACTION_INFO[selectedEnemyFaction].name} cephesinde 2 düşman lordu esir alındı; düşmanın aktif savaş partisi yoğunluğu düşürüldü!`,
                            );
                          }}
                          className="px-2.5 py-1 rounded text-xs font-bold bg-[#15803d] hover:bg-[#16a34a] text-white whitespace-nowrap"
                        >
                          +2 Düşman Lordu Esir Al
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 2: COUNCIL ELECTIONS, CALCULATEMERITOFOUTCOME & POLICIES     */}
          {/* ================================================================ */}
          {activeTab === 'council_election' && (
            <div className="space-y-5">
              <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c6a15b]/20 pb-3 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#fef08a]">
                      Tımar Dağıtım Konseyi: SettlementClaimantDecision.CalculateMeritOfOutcome()
                    </h3>
                    <p className="text-xs text-[#b5a890]">
                      En yüksek Liyakat Skorunu (Merit Score) alan 3 klan pusulaya çıkar. İç Bölge
                      İç Bölge Tuzağını (num7 = distance^0.5) ve Flexible Ethics Perk Eşiğini inceleyin.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="election-fief-select" className="text-xs text-[#c6a15b]">
                      Oylanan Tımar:
                    </label>
                    <select
                      id="election-fief-select"
                      value={selectedElectionSettlementId}
                      onChange={(e) => setSelectedElectionSettlementId(e.target.value)}
                      className="bg-[#120f0b] border border-[#c6a15b]/40 rounded px-2.5 py-1 text-xs text-[#f8f0df]"
                    >
                      {campaign.settlements
                        .filter((s) => s.type !== 'VILLAGE')
                        .slice(0, 18)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({FACTION_INFO[s.faction].name} · Refah {s.prosperity})
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setHasFlexibleEthicsPerk((p) => !p)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                        hasFlexibleEthicsPerk
                          ? 'bg-[#2b2114] border-[#f59e0b] text-[#fde68a]'
                          : 'bg-[#14110d] border-[#c6a15b]/25 text-[#a89b84]'
                      }`}
                    >
                      Flexible Ethics Perki: {hasFlexibleEthicsPerk ? 'AÇIK (Maliyet 17)' : 'KAPALI (Maliyet 20)'}
                    </button>
                  </div>
                </div>

                {/* Top 3 Candidates Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {currentElection.candidates.map((cand, idx) => (
                    <div
                      key={cand.clanId}
                      className="p-3.5 rounded bg-[#120f0b] border border-[#c6a15b]/30 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#fbbf24]">
                            #{idx + 1} Aday · Destek %{cand.councilSupportPct}
                          </span>
                          <span className="text-[11px] font-mono-tabular text-[#34d399]">
                            Skor: {cand.finalMeritScore}
                          </span>
                        </div>
                        <div className="text-base font-bold text-[#f8f0df] mt-1">
                          {cand.clanName}
                        </div>

                        <div className="mt-2.5 space-y-1 text-[11px] font-mono-tabular text-[#d1c5b0] border-t border-[#c6a15b]/15 pt-2">
                          <div className="flex justify-between">
                            <span>Klan Seviyesi (Tier × 30):</span>
                            <span>+{cand.tierBonus}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Askeri Güç (num8 / 10):</span>
                            <span>+{cand.strengthContribution}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Tımarsızlık / Kral / Fetih:</span>
                            <span>
                              +{cand.fieflessBonus} / +{cand.rulerBonus} / +{cand.conquerorBonus}
                            </span>
                          </div>
                          <div className="flex justify-between text-[#34d399]">
                            <span>Kültür Uyumu & İlişki Bonusu:</span>
                            <span>
                              +{cand.cultureMatchBonus} / +{cand.relationBonus}
                            </span>
                          </div>
                          <div className="flex justify-between text-[#fbbf24]">
                            <span>Efektif Mesafe (val2):</span>
                            <span>{cand.effectiveDistance}m</span>
                          </div>
                          <div className="flex justify-between text-[#fde68a]">
                            <span>Mesafe Çarpanı (num7):</span>
                            <span>
                              Vanilla ^0.5: {cand.distanceFactorVanilla}x · Çözüm ^0.25:{' '}
                              {cand.distanceFactorImproved}x
                            </span>
                          </div>
                          <div className="flex justify-between text-[#a89b84]">
                            <span>Mevcut Tımar Paydası:</span>
                            <span>/{cand.totalFiefValueDenominator}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-[#c6a15b]/20">
                        <button
                          type="button"
                          onClick={() => handleVoteOnFief(cand.clanId, 1, false)}
                          className="w-full py-1.5 px-2.5 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white transition-colors"
                        >
                          Destekle ({hasFlexibleEthicsPerk ? '17' : '20'} Nüfuz · Kademe 1)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVoteOnFief(cand.clanId, 3, true)}
                          className="w-full py-1 px-2.5 rounded text-[11px] font-semibold bg-[#262018] hover:bg-[#382f22] text-[#fde68a] border border-[#c6a15b]/35 transition-colors"
                        >
                          Hükümdar Vetosu ile Ata (Override)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kingdom Policies */}
              <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30">
                <h3 className="text-sm font-bold text-[#fef08a] mb-2">
                  Krallık Politikaları (Kingdom Policies) ve Sadakat / Nüfuz Etkileri
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.values(KINGDOM_POLICIES).map((pol) => {
                    const isActive = macroState.activePolicies.includes(pol.id);
                    return (
                      <div
                        key={pol.id}
                        className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/25 flex flex-col justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#f8f0df]">{pol.name}</span>
                            <span
                              className={`text-[10px] font-bold ${
                                isActive ? 'text-[#34d399]' : 'text-[#a89b84]'
                              }`}
                            >
                              {isActive ? 'YÜRÜRLÜKTE' : 'PASİF'}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#b5a890] mt-1 leading-relaxed">
                            {pol.summary}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleTogglePolicy(pol.id)}
                          className={`w-full py-1.5 rounded text-xs font-bold transition-colors ${
                            isActive
                              ? 'bg-[#282118] text-[#fca5a5] hover:bg-[#3b2f22]'
                              : 'bg-[#15803d] text-white hover:bg-[#16a34a]'
                          }`}
                        >
                          {isActive
                            ? 'Politikayı Yürürlükten Kaldır'
                            : `Yürürlüğe Koy (${pol.influenceCostToPropose} Nüfuz)`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 3: CLANS, ECONOMY, COMPANION PROMOTION & REGENT SUCCESSION   */}
          {/* ================================================================ */}
          {activeTab === 'clans_succession' && (
            <div className="space-y-4">
              <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#fef08a]">
                    Hiyerarşik Veri Modeli: Klan Ekonomisi, Yoldaş Terfisi ve Zorunlu Naip (Regent)
                    Veraseti
                  </h3>
                  <p className="text-xs text-[#b5a890]">
                    Klan lideri elendiğinde <code className="text-[#fde68a]">GetRelationWithClan</code>{' '}
                    ve <code className="text-[#fde68a]">OnSettlementOwnerChanged</code> çökmelerini
                    önleyen varis kuyruğu (<code className="text-[#fde68a]">Queue&lt;Hero&gt;</code>)
                    ve Naip atama mekanizması.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handlePromoteCompanionToClan}
                  className="px-3.5 py-2 rounded text-xs font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/50 whitespace-nowrap"
                >
                  + Yoldaşı Soylu Klana Terfi Ettir (500 Dinar · 50 Nüfuz · 1 Tımar)
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {macroState.clans.map((clan) => {
                  const succ = resolveClanLeaderOrRegent(clan);
                  return (
                    <div
                      key={clan.id}
                      className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between border-b border-[#c6a15b]/20 pb-2">
                          <div>
                            <span className="text-sm font-bold text-[#fef08a]">{clan.name}</span>
                            <span className="ml-2 text-xs text-[#c6a15b]">
                              Kademe {clan.tier} · {FACTION_INFO[clan.faction].name}
                            </span>
                          </div>
                          <span className="font-mono-tabular text-xs font-bold text-[#34d399]">
                            Güç: {clan.totalStrength}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs font-mono-tabular">
                          <div>
                            <span className="text-[#a89b84]">Aktif Lider / Naip:</span>{' '}
                            <strong
                              className={
                                succ.isRegentActive ? 'text-[#fbbf24]' : 'text-[#f8f0df]'
                              }
                            >
                              {succ.leaderName}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[#a89b84]">Savaş Partileri:</span>{' '}
                            <strong className="text-[#f8f0df]">{clan.warPartyCount} Parti</strong>
                          </div>
                          <div>
                            <span className="text-[#a89b84]">Klan Hazinesi:</span>{' '}
                            <strong className="text-[#fbbf24]">{clan.gold} Dinar</strong>
                          </div>
                          <div>
                            <span className="text-[#a89b84]">Atölye & Kervan:</span>{' '}
                            <strong className="text-[#34d399]">
                              {clan.workshopsCount} Atölye · {clan.caravansCount} Kervan
                            </strong>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-[#c7baa3]">
                          Varis Kuyruğu ({succ.heirQueue.length}):{' '}
                          {succ.heirQueue.length > 0
                            ? succ.heirQueue
                                .map(
                                  (h) =>
                                    `${h.name} (Yaş ${h.age}${h.isAdult ? ', Yetişkin' : ', Reşit Değil'})`,
                                )
                                .join(' -> ')
                            : 'Yetişkin varis kalmadı — Otomatik Naip (Regent) Korumasında'}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#c6a15b]/20">
                        <span className="text-[11px] text-[#a89b84]">
                          Tımar Sayısı: {clan.fiefIds.length} · Nüfuz: {clan.influence}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSimulateLeaderFallAndSuccession(clan.id)}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-[#282118] hover:bg-[#382f22] text-[#fde68a] border border-[#c6a15b]/35"
                        >
                          Lider Kaybı & Veraset Devrini Simüle Et
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 4: FIEFLESS DESTRUCTION, LOYALTY, FOOD & WEATHER             */}
          {/* ================================================================ */}
          {activeTab === 'destruction_loyalty' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: Fiefless Kingdom Destruction & 4-Week Wither */}
              <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30 space-y-3">
                <h3 className="text-sm font-bold text-[#fef08a]">
                  Tımarsız Krallık Yıkımı (Fiefless Kingdom Destruction) & 28 Günlük Erime
                </h3>
                <p className="text-xs text-[#b5a890]">
                  Yama 1.2 sonrası son tımarını (kuşatma, ikna/defection veya takas/barter ile)
                  kaybeden krallık anında dağılır. Bağımsız kalan klanlar 4 hafta (28 gün) içinde
                  başka krallığa katılamazsa erir veya Restorasyon İsyanı başlatır.
                </p>

                <div className="space-y-2">
                  {(['battania', 'sturgia', 'vlandia', 'empire'] as FactionId[]).map((fac) => {
                    const fiefCount = campaign.settlements.filter(
                      (s) => s.faction === fac && s.type !== 'VILLAGE',
                    ).length;
                    const isDestroyed =
                      fiefCount === 0 || macroState.destroyedKingdoms.includes(fac);
                    return (
                      <div
                        key={fac}
                        className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/25 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold text-[#f8f0df]">{FACTION_INFO[fac].name}</div>
                          <div className="text-[11px] text-[#a89b84]">
                            Kalan Şehir/Kale: {fiefCount} · Durum:{' '}
                            <strong className={isDestroyed ? 'text-[#f87171]' : 'text-[#34d399]'}>
                              {isDestroyed ? 'YIKILDI (4 Haftalık Sürgün)' : 'AKTİF KRALLIK'}
                            </strong>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isDestroyed}
                          onClick={() => handleSimulateFieflessDestruction(fac)}
                          className="px-2.5 py-1.5 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white disabled:opacity-40 whitespace-nowrap"
                        >
                          Son Tımarı Devret & Yıkımı Test Et
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Loyalty, Food & Weather Effects */}
              <div className="space-y-4">
                <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#fef08a]">
                      Hava Durumu, Kuşatma Hazırlığı & Otomatik Muharebe Çarpanları
                    </h3>
                    <div className="flex items-center gap-1">
                      {(['CLEAR', 'RAIN', 'SNOW'] as const).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() =>
                            onUpdateMacroState({ ...macroState, weatherCondition: w })
                          }
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            macroState.weatherCondition === w
                              ? 'bg-[#b45309] text-white'
                              : 'bg-[#1f1a13] text-[#d1c5b0]'
                          }`}
                        >
                          {w === 'CLEAR' ? 'Açık Hava' : w === 'RAIN' ? 'Yağmurlu' : 'Karlı Zemin'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono-tabular">
                    <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Kuşatma Kampı İnşa Süresi
                      </span>
                      <span className="font-bold text-[#fbbf24]">
                        {weatherMods.siegePreparationTimeMultiplier}x Süre
                      </span>
                    </div>
                    <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Süvari Hız / İvme Çarpanı
                      </span>
                      <span className="font-bold text-[#f87171]">
                        %{Math.round(weatherMods.cavalrySpeedAndAccelMultiplier * 100)}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Ok & Arbalet Uçuş Hızı
                      </span>
                      <span className="font-bold text-[#93c5fd]">
                        %{Math.round(weatherMods.rangedMissileSpeedMultiplier * 100)}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-[#120f0b] border border-[#c6a15b]/20">
                      <span className="text-[10px] text-[#a89b84] block">
                        Kaptanlık Perk Bonusu (Sv. 8)
                      </span>
                      <span className="font-bold text-[#34d399]">
                        +%{weatherMods.captainPerkTier8BonusPct} Kümülatif
                      </span>
                    </div>
                  </div>
                </div>

                {/* Settlement Loyalty & Food Balance */}
                <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30 space-y-2">
                  <h3 className="text-sm font-bold text-[#fef08a]">
                    DefaultSettlementLoyaltyModel & FoodModel (Garnizon vs Açlık Dengesi)
                  </h3>
                  {campaign.settlements
                    .filter((s) => s.type === 'TOWN')
                    .slice(0, 3)
                    .map((town) => {
                      const bound = campaign.settlements.filter(
                        (v) => v.boundSettlementId === town.id,
                      );
                      const lf = calculateSettlementLoyaltyAndFood({
                        settlement: town,
                        ownerCulture: 'player',
                        boundVillages: bound,
                        activePolicies: macroState.activePolicies,
                      });
                      return (
                        <div
                          key={town.id}
                          className="p-2.5 rounded bg-[#120f0b] border border-[#c6a15b]/20 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular"
                        >
                          <div>
                            <span className="font-bold text-[#f8f0df]">{town.name}</span>
                            <span className="ml-2 text-[#a89b84]">
                              Kültür Cezası: {lf.cultureMismatchPenalty}/gün · Politika: +
                              {lf.policyLoyaltyBonus}/gün
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={
                                lf.netDailyLoyaltyChange >= 0
                                  ? 'text-[#34d399]'
                                  : 'text-[#f87171]'
                              }
                            >
                              Sadakat: {lf.projectedLoyalty} (
                              {lf.netDailyLoyaltyChange >= 0
                                ? `+${lf.netDailyLoyaltyChange}`
                                : lf.netDailyLoyaltyChange}
                              )
                            </span>
                            <span
                              className={
                                lf.netDailyFoodChange >= 0 ? 'text-[#fde68a]' : 'text-[#f87171]'
                              }
                            >
                              Erzak: {lf.netDailyFoodChange >= 0 ? `+${lf.netDailyFoodChange}` : lf.netDailyFoodChange}/gün
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 5: 4-LAYER ARCHITECTURE & DESIGN SOLUTION MATRIX             */}
          {/* ================================================================ */}
          {activeTab === 'architecture_matrix' && (
            <div className="space-y-4">
              <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30">
                <h3 className="text-sm font-bold text-[#fef08a] mb-2">
                  TaleWorlds.CampaignSystem 4 Katmanlı Yazılım Mimarisi
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/25">
                    <div className="font-bold text-[#fbbf24]">
                      1. Hesaplama Modelleri (Models)
                    </div>
                    <div className="text-[11px] text-[#c7baa3] mt-1">
                      Durumsuz (stateless) matematiksel formüller: DefaultDiplomacyModel,
                      DefaultSettlementLoyaltyModel, DefaultSettlementFoodModel, DefaultBarterModel.
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/25">
                    <div className="font-bold text-[#fbbf24]">
                      2. Kampanya Davranışları (Behaviors)
                    </div>
                    <div className="text-[11px] text-[#c7baa3] mt-1">
                      Saatlik/günlük zaman döngüleri ve olay dinleyicileri:
                      ClanVariablesCampaignBehavior, OnSettlementOwnerChanged.
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/25">
                    <div className="font-bold text-[#fbbf24]">
                      3. Durum Değiştiriciler (Actions)
                    </div>
                    <div className="text-[11px] text-[#c7baa3] mt-1">
                      Atomik durum mutasyonları: DeclareWarAction.ApplyInternal(), mülkiyet ve
                      esir devirleri.
                    </div>
                  </div>
                  <div className="p-3 rounded bg-[#120f0b] border border-[#c6a15b]/25">
                    <div className="font-bold text-[#fbbf24]">
                      4. Konsey & Seçim Motoru (Elections)
                    </div>
                    <div className="text-[11px] text-[#c7baa3] mt-1">
                      Feodal oligarşi oylamaları: KingdomDecision, KingdomElection.GetAiChoice(),
                      SettlementClaimantDecision.CalculateMeritOfOutcome().
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded bg-[#17130e] border border-[#c6a15b]/30 overflow-x-auto">
                <h3 className="text-sm font-bold text-[#fef08a] mb-3">
                  Bannerlord Tasarım Anomalileri ve Sancak-ı Kalradya Mimari Çözüm Sentezi
                </h3>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#c6a15b]/30 text-[#c6a15b]">
                      <th className="py-2 pr-3">Sistem Alanı</th>
                      <th className="py-2 pr-3">Bannerlord Mevcut Mekanik ve Sorun</th>
                      <th className="py-2">Uygulanan Mimari Çözüm (Sancak-ı Kalradya)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c6a15b]/15 text-[#e2d6c1]">
                    <tr>
                      <td className="py-2.5 pr-3 font-bold text-[#fef08a]">
                        Haraç ve Savaş Skoru (DefaultDiplomacyModel)
                      </td>
                      <td className="py-2.5 pr-3">
                        Tımar değerinin paydada düz bölen olması nedeniyle büyük imparatorlukların
                        tımarsız krallıklara haraç ödemesi; asker zayiatının skora etki etmemesi.
                      </td>
                      <td className="py-2.5 text-[#34d399]">
                        Savaş Yorgunluğu (War Exhaustion), İnsan Gücü Havuzu (Manpower Pool) ve
                        tımarsız krallıklar için askeri kapasiteye bağlı haraç tavanı + Zorunlu
                        Ateşkes eşiği.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-bold text-[#fef08a]">
                        Tımar Dağıtım Formülü (CalculateMeritOfOutcome)
                      </td>
                      <td className="py-2.5 pr-3">
                        Karekök mesafe çarpanının (^0.5) diğer tüm faktörleri ezmesi (İç Bölge
                        Tuzağı) ve kültür/ilişki uyumunun yok sayılması.
                      </td>
                      <td className="py-2.5 text-[#34d399]">
                        Üssün 0.25 ile sönümlenmesi, geçici sahip (distance=0) hatasının
                        filtrelenmesi, +60 Kültür Eşleşmesi Bonusu ve İlişki çarpanı.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-bold text-[#fef08a]">
                        Krallık Yıkımı & İltihak (Kingdom Destruction)
                      </td>
                      <td className="py-2.5 pr-3">
                        Yıkımın sadece kuşatma olayına bağlı olması; son tımar ikna (Parley) veya
                        takasla alınırsa 0 tımarlı krallığın yıkılmaması.
                      </td>
                      <td className="py-2.5 text-[#34d399]">
                        Durum Güdümlü (State-Driven) if (kingdom.Fiefs.Count == 0) kontrolü + 28
                        günlük bağımsız klan erimesi ve Restorasyon İsyanı.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-bold text-[#fef08a]">
                        Referans Güvenliği & Veraset (Succession)
                      </td>
                      <td className="py-2.5 pr-3">
                        Klan lideri öldüğünde GetRelationWithClan ve OnSettlementOwnerChanged içinde
                        NullReferenceException çökmesi.
                      </td>
                      <td className="py-2.5 text-[#34d399]">
                        Zorunlu Null-Object Deseni, Queue&lt;Hero&gt; varis kuyruğu ve reşit varis
                        yoksa otomatik Naip (Regent) ataması.
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-3 font-bold text-[#fef08a]">
                        Perk ve Nüfuz Etkileşimi (KingdomDecision)
                      </td>
                      <td className="py-2.5 pr-3">
                        Flexible Ethics perkinin oy maliyetini 20'den 17'ye düşürerek sabit 20
                        puanlık ödül eşiğini bozması.
                      </td>
                      <td className="py-2.5 text-[#34d399]">
                        Oransal Kademe Eşikleri (Decision Tier 1/2/3): Ödüller ham nüfuz miktarına
                        değil karar kademesine bağlandı.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
