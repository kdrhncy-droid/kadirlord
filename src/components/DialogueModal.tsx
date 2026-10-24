/**
 * DialogueModal.tsx — Gerçek Bannerlord 3B Karşılaşma ve Diyalog Ekranı
 *
 * Mount & Blade II: Bannerlord'daki konuşma (`MissionConversationView`) ve
 * zorunlu harita karşılaşması (`PlayerEncounter`) düzeni:
 *  - Tam ekran canlı 3B omuz-üstü konuşma sahnesi (`ConversationCanvas`) arka planı doldurur;
 *    haritadaki diğer lordların/şehirlerin isim etiketleri görünmez.
 *  - Üst-orta şeritte yalnızca karşınızdaki muhatabın sancağı, unvanı/adı, ilişki çubuğu
 *    ve (birlik karşılaşmalarında) iki ordunun Güç Dengesi Çubuğu yer alır.
 *  - Alt-orta panelde muhatabın konuşma metni (mükerrer isim öneki olmadan) ve
 *    altında 1–9 numaralı oyuncu yanıtları sıralanır.
 *  - Zorunlu karşılaşmada (`forcedEncounter: true`) Esc veya X ile kaçılamaz;
 *    oyuncu savaşmak, otomatik çözmek, artçı bırakıp kaçmak, rüşvet/müzakere veya teslim olmak zorundadır.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { heroFromLord } from '../game/conversation';
import {
  type DialogueGraph,
  type EncounterActionTrigger,
  applyOption,
  buildDialogue,
  numberedOptions,
  stripSpeakerPrefix,
} from '../game/dialogue';
import {
  type EncounterScenario,
  classifyEncounterScenario,
  getLordPartyStrength,
  getPlayerPartyStrength,
} from '../game/encounter';
import { buildQuestLog } from '../game/quests';
import {
  type CampaignState,
  FACTION_INFO,
  type LordAgent,
  type Settlement,
  getTotalTroops,
} from '../game/rules';
import { sound } from '../game/sound';
import { ConversationCanvas } from './ConversationCanvas';

interface DialogueModalProps {
  campaign: CampaignState;
  lord?: LordAgent | null;
  settlement?: Settlement | null;
  /** Muhatap pazaryeri olan bir yerleşkede mi? */
  canTrade?: boolean;
  /** Düşman/haydut yakalaması mı? True ise Esc ve X kapatma kilitlenir. */
  forcedEncounter?: boolean;
  /** Karşılaşma senaryosu (güçlü haydut, zayıf haydut, güçlü lord, zayıf lord). */
  encounterScenario?: EncounterScenario;
  onClose: () => void;
  /** İlişki değişimi (lord id'si ile). */
  onRelationChange?: (lordId: string, delta: number) => void;
  /** Lordla ilk kez konuşulduğunda Ansiklopedi'de tanışıldı (revealed) işaretler. */
  onMeetHero?: (heroId: string) => void;
  /** Takas (Barter) tamamlandığında altın/ilişki/antlaşma günceller. */
  onCompleteBarter?: (payload: {
    lordId: string;
    goldDelta: number;
    relationDelta: number;
    peaceSigned?: boolean;
  }) => void;
  /** Pazaryeri açma isteği. */
  onOpenTrade?: () => void;
  /** Görev kabul edildiğinde. */
  onAcceptQuest?: (questId: string) => void;
  /** 3B Meydan Muharebesini başlatır. */
  onStartFieldBattle?: (lord: LordAgent) => void;
  /** Askerleri Gönder (Otomatik Muharebe Çözümü). */
  onAutoResolveBattle?: (lord: LordAgent) => void;
  /** Artçı asker bırakıp karşılaşmadan kaçma. */
  onSacrificeEscape?: (lord: LordAgent) => void;
  /** Altın/rüşvet ödeyerek karşılaşmadan ayrılma. */
  onBribeEscape?: (lord: LordAgent, cost: number) => void;
  /** Kaçan zayıf haydutları teslim olmaya zorlama. */
  onDemandSurrender?: (lord: LordAgent) => void;
  /** Oyuncunun teslim olması. */
  onPlayerSurrender?: (lord: LordAgent) => void;
  /** Detaylı siyasi divan / ikna penceresini açmak isterse. */
  onOpenDiplomacyCouncil?: (lord: LordAgent) => void;
  /** Lordla daha önce tanışıldı mı? False ise Bannerlord ilk tanışma diyaloğu ('intro-root') başlar. */
  hasMet?: boolean;
}

export const DialogueModal: React.FC<DialogueModalProps> = ({
  campaign,
  lord,
  settlement,
  canTrade = false,
  forcedEncounter,
  encounterScenario,
  onClose,
  onRelationChange,
  onMeetHero,
  onCompleteBarter,
  onOpenTrade,
  onAcceptQuest,
  onStartFieldBattle,
  onAutoResolveBattle,
  onSacrificeEscape,
  onBribeEscape,
  onDemandSurrender,
  onPlayerSurrender,
  onOpenDiplomacyCouncil,
  hasMet = true,
}) => {
  const questLog = useMemo(() => buildQuestLog(campaign), [campaign]);

  const encounterInfo = useMemo(
    () => (lord ? classifyEncounterScenario(lord, campaign) : null),
    [lord, campaign],
  );

  const isForced = forcedEncounter ?? false;
  const activeScenario = encounterScenario ?? encounterInfo?.scenario;

  const startRelation = lord?.relation ?? 0;
  const [relation, setRelation] = useState(startRelation);
  const [gold, setGold] = useState(campaign.gold);
  const isHostileLord = Boolean(lord && (lord.isAtWarWithPlayer || lord.faction === 'bandits'));
  const initialRootId =
    lord && !isHostileLord && !isForced && hasMet === false ? 'intro-root' : 'root';
  const [nodeId, setNodeId] = useState<string>(initialRootId);
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(true);
  const [gestureKey, setGestureKey] = useState(0);
  const speakTimer = useRef<number | null>(null);

  // ADIM 4.3: Bannerlord Çift Sütunlu Takas (Barter) & Yeşil Tatmin Çubuğu Durumu
  const [barterOpen, setBarterOpen] = useState(false);
  const [offeredGold, setOfferedGold] = useState(0);
  const [requestedGold, setRequestedGold] = useState(0);
  const [offeredPrisoners, setOfferedPrisoners] = useState(0);
  const [requestPeace, setRequestPeace] = useState(false);
  const [requestMarriageAlliance, setRequestMarriageAlliance] = useState(false);

  const lordPurse = useMemo(() => Math.max(450, (lord?.armySize ?? 25) * 32), [lord?.armySize]);
  const peaceDemandCost = useMemo(
    () => (lord?.isAtWarWithPlayer ? Math.max(350, (lord.armySize ?? 30) * 18) : 0),
    [lord?.armySize, lord?.isAtWarWithPlayer],
  );
  const marriageDemandCost = useMemo(
    () => Math.max(400, Math.round(650 - relation * 4)),
    [relation],
  );

  const barterDemandValue =
    requestedGold +
    (requestPeace ? peaceDemandCost : 0) +
    (requestMarriageAlliance ? marriageDemandCost : 0);
  const barterOfferValue = offeredGold + offeredPrisoners * 45;
  const barterSatisfactionPct = useMemo(() => {
    if (barterDemandValue <= 0) {
      return barterOfferValue > 0 ? 100 : 0;
    }
    const charmBonus = 1 + Math.max(-0.15, Math.min(0.25, relation * 0.003));
    return Math.max(0, Math.min(100, Math.round(((barterOfferValue * charmBonus) / barterDemandValue) * 100)));
  }, [barterDemandValue, barterOfferValue, relation]);

  const handleAutoBalanceBarter = () => {
    if (barterDemandValue <= 0) {
      const giftAmount = Math.min(gold, 150);
      setOfferedGold(giftAmount);
      return;
    }
    const charmBonus = 1 + Math.max(-0.15, Math.min(0.25, relation * 0.003));
    const neededTotal = Math.ceil(barterDemandValue / charmBonus);
    const neededGold = Math.max(0, neededTotal - offeredPrisoners * 45);
    setOfferedGold(Math.min(gold, neededGold));
  };

  const handleOfferGift = () => {
    const giftGold = offeredGold > 0 ? offeredGold : Math.min(gold, 100);
    if (giftGold <= 0 || gold < giftGold) {
      setLastOutcome('Hediye vermek için yeterli dinar yok.');
      return;
    }
    const relGain = Math.max(2, Math.round(giftGold / 45));
    const nextGold = gold - giftGold;
    const nextRel = Math.min(100, relation + relGain);
    setGold(nextGold);
    setRelation(nextRel);
    setOfferedGold(0);
    if (lord) {
      onRelationChange?.(lord.id, relGain);
      onCompleteBarter?.({ lordId: lord.id, goldDelta: -giftGold, relationDelta: relGain });
    }
    sound.playCoinChime();
    setLastOutcome(`Hediye sunuldu (-${giftGold} Dinar, +${relGain} İlişki).`);
    setBarterOpen(false);
  };

  const handleCommitBarter = () => {
    if (barterSatisfactionPct < 100) return;
    const netGoldDelta = requestedGold - offeredGold;
    const relGain = requestMarriageAlliance ? 12 : requestPeace ? 8 : Math.max(1, Math.round(barterOfferValue / 80));
    const nextGold = Math.max(0, gold + netGoldDelta);
    const nextRel = Math.min(100, relation + relGain);
    setGold(nextGold);
    setRelation(nextRel);
    if (lord) {
      onRelationChange?.(lord.id, relGain);
      onCompleteBarter?.({
        lordId: lord.id,
        goldDelta: netGoldDelta,
        relationDelta: relGain,
        peaceSigned: requestPeace,
      });
    }
    sound.playAgreement();
    setLastOutcome(
      requestPeace
        ? `${lord?.name ?? 'Lord'} ile Barış Takası onaylandı!`
        : requestMarriageAlliance
          ? `${lord?.name ?? 'Lord'} ile Hanedan & Evlilik Başlık Parası anlaşması imzalandı!`
          : `Takas anlaşması başarıyla tamamlandı (+${relGain} İlişki).`,
    );
    setBarterOpen(false);
  };

  const graph: DialogueGraph = useMemo(
    () =>
      buildDialogue({
        lord: lord ?? undefined,
        settlement: settlement ?? undefined,
        campaign,
        relation: startRelation,
        atWar: isHostileLord,
        forcedEncounter: isForced,
        scenario: activeScenario,
        hasMet,
        quest: questLog.active.find(
          (q) =>
            (lord && q.giverLordId === lord.id) ||
            (settlement && q.targetSettlementId === settlement.id),
        ),
        canTrade,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      lord?.id,
      settlement?.id,
      campaign.day,
      canTrade,
      questLog.active.length,
      isForced,
      activeScenario,
      hasMet,
    ],
  );

  const node = graph.nodes[nodeId] ?? graph.nodes[graph.root];
  const options = numberedOptions(node);
  const canDismiss = !isForced && nodeId !== 'encounter-menu';

  const relationColor =
    relation >= 40
      ? '#34d399'
      : relation > 0
        ? '#a3e635'
        : relation > -40
          ? '#fbbf24'
          : '#f87171';

  useEffect(() => {
    sound.unlock();
    sound.playDialogueOpen();
    if (lord?.id && (hasMet || isHostileLord || isForced)) {
      onMeetHero?.(lord.id);
    }
    return () => sound.playDialogueClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lord?.id]);

  useEffect(() => {
    setSpeaking(true);
    sound.playDialogueBlip();
    if (speakTimer.current) window.clearTimeout(speakTimer.current);
    speakTimer.current = window.setTimeout(() => setSpeaking(false), 2600);
    return () => {
      if (speakTimer.current) window.clearTimeout(speakTimer.current);
    };
  }, [nodeId]);

  const handleEncounterAction = (action: EncounterActionTrigger) => {
    if (!action || !lord) return false;
    switch (action.kind) {
      case 'START_BATTLE':
        onStartFieldBattle?.(lord);
        return true;
      case 'AUTO_RESOLVE':
        onAutoResolveBattle?.(lord);
        return true;
      case 'SACRIFICE_ESCAPE':
        onSacrificeEscape?.(lord);
        return true;
      case 'BRIBE_ESCAPE':
        onBribeEscape?.(lord, action.cost);
        return true;
      case 'DEMAND_SURRENDER':
        onDemandSurrender?.(lord);
        return true;
      case 'PLAYER_SURRENDER':
        onPlayerSurrender?.(lord);
        return true;
      case 'MEET_HERO':
        onMeetHero?.(lord.id);
        return false;
      case 'OPEN_BARTER':
        setBarterOpen(true);
        if (action.presetMarriage) setRequestMarriageAlliance(true);
        if (action.presetPeace) setRequestPeace(true);
        return true;
      case 'OPEN_COUNCIL':
        onOpenDiplomacyCouncil?.(lord);
        return true;
      default:
        return false;
    }
  };

  const choose = (optionId: string) => {
    setGestureKey((k) => k + 1);
    const res = applyOption(graph, node.id, optionId, { relation, gold });
    const delta = res.relation - relation;
    const goldDelta = res.gold - gold;
    sound.playDialogueChoice(delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral');
    setRelation(res.relation);
    setGold(res.gold);
    if (goldDelta !== 0 && lord && onCompleteBarter) {
      onCompleteBarter({
        lordId: lord.id,
        goldDelta,
        relationDelta: delta,
      });
    } else if (delta !== 0 && lord && onRelationChange) {
      onRelationChange(lord.id, delta);
    }
    if (res.acceptedQuestId) {
      sound.playAgreement();
      onAcceptQuest?.(res.acceptedQuestId);
      setLastOutcome('Görev günlüğe eklendi.');
      window.setTimeout(() => setLastOutcome(null), 2500);
    }
    if (res.encounterAction) {
      const handled = handleEncounterAction(res.encounterAction);
      if (handled) return;
    }
    if (res.openTrade && onOpenTrade) {
      onOpenTrade();
      onClose();
      return;
    }
    if (res.closed || !res.nextId) {
      onClose();
      return;
    }
    setNodeId(res.nextId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (canDismiss) onClose();
        return;
      }
      const n = Number(e.key);
      if (!Number.isNaN(n) && n >= 1 && n <= options.length) {
        e.preventDefault();
        choose(options[n - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, nodeId, relation, gold, canDismiss]);

  const faction =
    FACTION_INFO[
      (lord?.faction ?? settlement?.faction ?? 'player') as keyof typeof FACTION_INFO
    ];
  const speakerName = graph.speakerName;
  const cleanSpeechText = stripSpeakerPrefix(node.text, speakerName);

  const playerTroops = getTotalTroops(campaign.roster);
  const playerPower = getPlayerPartyStrength(campaign);
  const enemyTroops = lord?.armySize ?? 0;
  const enemyPower = lord ? getLordPartyStrength(lord) : 0;
  const totalPower = Math.max(1, playerPower + enemyPower);
  const playerPowerPct = Math.max(12, Math.min(88, Math.round((playerPower / totalPower) * 100)));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-hidden select-none pointer-events-auto bg-[#0f0c08]"
      data-testid="dialogue-modal"
    >
      {/* 1. TAM EKRAN 3B KONUŞMA SAHNESİ (Omuz Üstü Bannerlord Kamera Kadrajı) */}
      <div className="absolute inset-0 z-0">
        <ConversationCanvas
          hero={
            lord
              ? heroFromLord(lord)
              : {
                  id: settlement?.id ?? 'settlement',
                  name: graph.speakerName,
                  occupation: 'NOTABLE',
                  culture: (settlement?.faction ?? 'player') as never,
                  bannerColor: faction?.color ?? '#7f1d1d',
                }
          }
          speaking={speaking}
          gestureKey={gestureKey}
          className="w-full h-full"
        />
        {/* Sinematik vinyet ve alt/üst okunabilirlik gradyanı */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 42%, rgba(15,12,8,0.05) 0%, rgba(10,8,5,0.55) 75%, rgba(8,6,4,0.88) 100%)',
          }}
        />
      </div>

      {/* 2. ÜST-ORTA BANNERLORD MUHATAP PLAKASI & GÜÇ DENGESİ ÇUBUĞU */}
      <div className="relative z-10 w-full flex flex-col items-center pt-4 px-4">
        <div className="w-full max-w-3xl hud-panel rounded-md border border-[#c6a15b]/60 border-t-2 border-t-[#f59e0b] px-4 py-2.5 shadow-2xl">
          <div className="flex items-center justify-between gap-4">
            {/* Sol: Sancak Arması + Muhatap Unvan ve Adı */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                style={{
                  backgroundColor: faction?.color ?? '#3b2f1d',
                  clipPath: 'polygon(0% 0%, 100% 0%, 100% 72%, 50% 100%, 0% 72%)',
                }}
                className="w-8 h-9 shrink-0 border border-[#fbbf24] flex items-center justify-center shadow-md"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#fde68a]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-bold text-[#f8f0df] truncate">
                    {speakerName}
                  </span>
                  <span className="text-[11px] font-semibold text-[#c6a15b] truncate">
                    · {graph.speakerTitle}
                  </span>
                </div>
                <div className="text-[11px] text-[#b5a890] flex items-center gap-2">
                  <span>{faction?.name}</span>
                  <span className="text-[#8b8072]">· 3B sahne</span>
                  {(lord?.isAtWarWithPlayer || lord?.faction === 'bandits') && (
                    <span className="px-1.5 py-0.2 rounded bg-[#7f1d1d]/80 border border-[#f87171]/50 text-[10px] font-bold text-[#fca5a5]">
                      SAVAŞ
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sağ: İlişki Çubuğu + Siyasi Divan / Kapat */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 bg-[#16120c] px-2.5 py-1 rounded border border-[#c6a15b]/25">
                <span className="text-[10px] text-[#a2957f]">İlişki</span>
                <span className="w-20 h-1.5 rounded bg-[#241c12] overflow-hidden">
                  <span
                    className="block h-full"
                    style={{
                      width: `${Math.min(100, Math.abs(relation))}%`,
                      background: relationColor,
                    }}
                  />
                </span>
                <span
                  className="text-[11px] font-mono-tabular font-bold"
                  style={{ color: relationColor }}
                >
                  {relation > 0 ? `+${relation}` : relation}
                </span>
              </div>

              {lord && lord.faction !== 'bandits' && (
                <button
                  type="button"
                  data-testid="dialogue-barter-toggle-btn"
                  onClick={() => setBarterOpen((prev) => !prev)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                    barterOpen
                      ? 'bg-[#b45309] text-white border-[#fde68a]/60'
                      : 'bg-[#1f1912] hover:bg-[#31261a] text-[#fde68a] border-[#c6a15b]/45'
                  }`}
                >
                  {barterOpen ? 'Konuşmaya Dön' : 'Takas & Pazarlık'}
                </button>
              )}

              {lord && lord.faction !== 'bandits' && onOpenDiplomacyCouncil && !isForced && (
                <button
                  type="button"
                  onClick={() => onOpenDiplomacyCouncil(lord)}
                  className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[#241c12] hover:bg-[#362a1c] text-[#fde68a] border border-[#c6a15b]/45 transition-colors"
                >
                  Divan Müzakeresi
                </button>
              )}

              {canDismiss ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-7 h-7 rounded bg-[#1c1610] hover:bg-[#2c2218] border border-[#c6a15b]/40 text-[#c6a15b] hover:text-[#f8f0df] text-xs flex items-center justify-center"
                  aria-label="Diyaloğu kapat"
                >
                  ✕
                </button>
              ) : (
                <span
                  data-testid="forced-encounter-badge"
                  className="px-2.5 py-1 rounded bg-[#7f1d1d] border border-[#f87171]/60 text-[10px] font-bold tracking-wider text-[#fecaca]"
                >
                  ZORUNLU KARŞILAŞMA
                </span>
              )}
            </div>
          </div>

          {/* Birlik Karşılaşmalarında Bannerlord Güç Dengesi Çubuğu (Power Balance Bar) */}
          {lord && (
            <div className="mt-2 pt-2 border-t border-[#c6a15b]/20 flex items-center gap-3 text-[11px] font-mono-tabular">
              <div className="text-[#6ee7b7] font-semibold shrink-0">
                {campaign.playerName} ({playerTroops} Asker · Güç {playerPower})
              </div>
              <div className="flex-1 h-2 rounded-full bg-[#451a1a] overflow-hidden flex">
                <div
                  className="h-full bg-gradient-to-r from-[#059669] to-[#34d399] transition-all duration-300"
                  style={{ width: `${playerPowerPct}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-[#dc2626] to-[#991b1b] transition-all duration-300"
                  style={{ width: `${100 - playerPowerPct}%` }}
                />
              </div>
              <div className="text-[#fca5a5] font-semibold shrink-0">
                {lord.name} ({enemyTroops} Asker · Güç {enemyPower})
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2B. BANNERLORD ÇİFT SÜTUNLU TAKAS (BARTER) VE YEŞİL TATMİN ÇUBUĞU EKRANI */}
      {barterOpen && lord && (
        <div
          data-testid="dialogue-barter-panel"
          className="relative z-10 w-full flex justify-center px-4 my-auto"
        >
          <div className="w-full max-w-5xl rounded-lg border border-[#c6a15b]/65 bg-[#120e0a]/95 shadow-2xl overflow-hidden text-[#f3ead8]">
            <div className="px-4 py-2 border-b border-[#c6a15b]/30 bg-[#1a140e] flex items-center justify-between text-xs">
              <span className="font-display font-bold text-[#fef08a] tracking-wide">
                BANNERLORD TAKAS & DİPLOMATİK PAZARLIK MASASI
              </span>
              <span className="text-[#b5a890]">
                Karşı Taraf: <strong className="text-[#fde68a]">{lord.title} {lord.name}</strong> · Sizin Hazineniz:{' '}
                <strong className="text-[#34d399] font-mono-tabular">{gold} Dinar</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#c6a15b]/25 p-3 gap-3">
              {/* SOL SÜTUN: KARŞI TARAFIN VARLIKLARI */}
              <div className="md:col-span-4 space-y-2.5 pr-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#fca5a5] border-b border-[#c6a15b]/20 pb-1">
                  Karşı Tarafın Varlıkları ({lord.name})
                </div>
                <div className="p-2 rounded bg-[#1a1510] border border-[#c6a15b]/20 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#b5a890]">Talep Edilen Altın:</span>
                    <strong className="text-[#fbbf24] font-mono-tabular">{requestedGold} / {lordPurse} D</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={lordPurse}
                    step={25}
                    value={requestedGold}
                    onChange={(e) => setRequestedGold(Number(e.target.value))}
                    className="w-full accent-[#f59e0b]"
                  />
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div className="text-[10px] uppercase tracking-wider text-[#a89b84]">Diplomatik Talepler</div>
                  {lord.isAtWarWithPlayer && (
                    <label className="flex items-center justify-between p-2 rounded bg-[#1f1712] border border-[#c6a15b]/25 cursor-pointer">
                      <span>Barış Antlaşması İmzala</span>
                      <input
                        type="checkbox"
                        checked={requestPeace}
                        onChange={(e) => setRequestPeace(e.target.checked)}
                        data-testid="barter-request-peace"
                        className="accent-[#34d399]"
                      />
                    </label>
                  )}
                  <label className="flex items-center justify-between p-2 rounded bg-[#1f1712] border border-[#c6a15b]/25 cursor-pointer">
                    <span>Hanedan & Evlilik Başlık Parası</span>
                    <input
                      type="checkbox"
                      checked={requestMarriageAlliance}
                      onChange={(e) => setRequestMarriageAlliance(e.target.checked)}
                      data-testid="barter-request-marriage"
                      className="accent-[#34d399]"
                    />
                  </label>
                </div>
              </div>

              {/* ORTA SÜTUN: YEŞİL TATMİN OLMA ÇUBUĞU (SATISFACTION BAR) VE BUTONLAR */}
              <div className="md:col-span-4 flex flex-col justify-between px-3 space-y-3">
                <div className="text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#fef08a]">
                    Tatmin Olma Çubuğu (Satisfaction)
                  </div>
                  <div className="text-[10px] text-[#a89b84] mt-0.5">
                    Teklif: <strong className="text-[#34d399] font-mono-tabular">{barterOfferValue} D</strong> vs Talep:{' '}
                    <strong className="text-[#fca5a5] font-mono-tabular">{barterDemandValue} D</strong>
                  </div>
                </div>

                {/* Yeşil Tatmin Olma Çubuğu */}
                <div className="space-y-1">
                  <div
                    data-testid="barter-satisfaction-bar"
                    data-satisfaction={barterSatisfactionPct}
                    className="w-full h-5 rounded-full bg-[#1f1912] border border-[#c6a15b]/50 overflow-hidden p-0.5 shadow-inner"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#15803d] via-[#22c55e] to-[#4ade80] transition-all duration-200"
                      style={{ width: `${barterSatisfactionPct}%` }}
                    />
                  </div>
                  <div className="text-center text-xs font-mono-tabular font-bold text-[#4ade80]">
                    %{barterSatisfactionPct} Kabul Oranı
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    data-testid="barter-gift-btn"
                    onClick={handleOfferGift}
                    className="px-2 py-2 rounded text-[11px] font-bold bg-[#1e293b] hover:bg-[#334155] text-[#fde68a] border border-[#c6a15b]/35"
                    title="Karşılıksız Hediye Ver (+İlişki & Cazibe XP)"
                  >
                    Hediye
                  </button>
                  <button
                    type="button"
                    data-testid="barter-auto-balance-btn"
                    onClick={handleAutoBalanceBarter}
                    className="px-2 py-2 rounded text-[11px] font-bold bg-[#33291c] hover:bg-[#463723] text-[#fef08a] border border-[#c6a15b]/45"
                    title="Otomatik Teklif / El Sıkışma ile Dengele"
                  >
                    Otomatik Teklif
                  </button>
                  <button
                    type="button"
                    data-testid="barter-offer-btn"
                    disabled={barterSatisfactionPct < 100}
                    onClick={handleCommitBarter}
                    className="px-2 py-2 rounded text-[11px] font-bold bg-[#15803d] hover:bg-[#16a34a] disabled:opacity-40 text-white border border-[#86efac]/50 shadow"
                  >
                    Teklif Et
                  </button>
                </div>
              </div>

              {/* SAĞ SÜTUN: OYUNCUNUN TEKLİFİ */}
              <div className="md:col-span-4 space-y-2.5 pl-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#6ee7b7] border-b border-[#c6a15b]/20 pb-1">
                  Sizin Teklifiniz ({campaign.playerName})
                </div>
                <div className="p-2 rounded bg-[#1a1510] border border-[#c6a15b]/20 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#b5a890]">Sunulan Altın (Dinar):</span>
                    <strong className="text-[#34d399] font-mono-tabular">{offeredGold} / {gold} D</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, gold)}
                    step={25}
                    value={offeredGold}
                    data-testid="barter-offer-gold-slider"
                    onChange={(e) => setOfferedGold(Number(e.target.value))}
                    className="w-full accent-[#22c55e]"
                  />
                </div>

                <div className="p-2 rounded bg-[#1a1510] border border-[#c6a15b]/20 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#b5a890]">Esir Devri (45 D/esir):</span>
                    <strong className="text-[#fde68a] font-mono-tabular">
                      {offeredPrisoners} / {campaign.prisoners} Esir
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, campaign.prisoners)}
                    step={1}
                    value={offeredPrisoners}
                    onChange={(e) => setOfferedPrisoners(Number(e.target.value))}
                    className="w-full accent-[#fbbf24]"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. ALT-ORTA BANNERLORD KONUŞMA METNİ VE NUMARALI SEÇENEKLER KUTUSU */}
      <div className="relative z-10 w-full flex justify-center pb-5 px-4">
        <div className="w-full max-w-4xl hud-panel rounded-lg border-t-2 border-t-[#c6a15b] p-4 shadow-2xl bg-[#120e0a]/95">
          {/* Muhatabın Sözü */}
          <div className="mb-3 px-3 py-2.5 rounded bg-[#1a150f] border border-[#c6a15b]/25">
            <p
              data-testid="dialogue-speech-text"
              className="text-[13px] leading-relaxed text-[#f3ead8] whitespace-pre-line min-h-[2.75rem]"
            >
              {cleanSpeechText}
            </p>
          </div>

          {lastOutcome && (
            <div className="mb-2 px-2 text-[11px] font-semibold text-[#34d399]">
              {lastOutcome}
            </div>
          )}

          {/* Numaralı Oyuncu Yanıtları (1–9) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {options.map((opt) => {
              const isBattleOpt =
                opt.id.includes('attack') ||
                opt.id.includes('fight') ||
                opt.id === 'enc-attack';
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`dialogue-option-${opt.id}`}
                  onClick={() => choose(opt.id)}
                  title={opt.hint}
                  className={`flex items-start gap-2.5 text-left px-3 py-2 rounded border transition-colors cursor-pointer ${
                    isBattleOpt
                      ? 'border-[#f87171]/50 bg-[#2a1212] hover:bg-[#3f1818] hover:border-[#f87171]'
                      : 'border-[#c6a15b]/30 bg-[#181510] hover:bg-[#241c12] hover:border-[#c6a15b]/70'
                  }`}
                >
                  <span className="shrink-0 mt-0.5 w-5 h-5 rounded bg-[#241c12] text-[#fbbf24] text-[10px] font-bold flex items-center justify-center">
                    {opt.index}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium text-[#f3ead8] leading-snug">
                      {opt.text}
                    </span>
                    {opt.hint && (
                      <span className="block text-[10px] text-[#a89b84] mt-0.5">
                        {opt.hint}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Alt Durum Çubuğu */}
          <div className="mt-3 pt-2 border-t border-[#c6a15b]/15 flex items-center justify-between text-[10px] text-[#9c8f7a]">
            <span>
              1–{options.length} tuşlarıyla seç{' '}
              {canDismiss ? '· Esc çıkış' : '· Zorunlu karşılaşma (karar verilmeli)'}
            </span>
            <span className="font-mono-tabular text-[#fde68a]">Kese: {gold} dinar</span>
          </div>
        </div>
      </div>
    </div>
  );
};
