/**
 * DialogueModal.tsx — Faz 6: Bannerlord tarzı diyalog ekranı
 *
 * Bannerlord'da konuşma haritanın **üzerine binen** alt-orta panelde açılır:
 * solda muhatabın portresi, ortada konuşma metni, altta numaralı seçenekler.
 * Klavyeden 1–9 ile seçilir, Esc ile çıkılır.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FACTION_INFO, type CampaignState, type LordAgent, type Settlement } from '../game/rules';
import { buildQuestLog } from '../game/quests';
import {
  applyOption,
  buildDialogue,
  numberedOptions,
  persuadeChance,
  type DialogueGraph,
} from '../game/dialogue';
import { heroFromLord } from '../game/conversation';
import { sound } from '../game/sound';
import { ConversationCanvas } from './ConversationCanvas';

interface DialogueModalProps {
  campaign: CampaignState;
  lord?: LordAgent | null;
  settlement?: Settlement | null;
  /** Muhatap pazaryeri olan bir yerleşkede mi? */
  canTrade?: boolean;
  onClose: () => void;
  /** İlişki değişimi (lord id'si ile). */
  onRelationChange?: (lordId: string, delta: number) => void;
  /** Pazaryeri açma isteği. */
  onOpenTrade?: () => void;
}

export const DialogueModal: React.FC<DialogueModalProps> = ({
  campaign,
  lord,
  settlement,
  canTrade = false,
  onClose,
  onRelationChange,
  onOpenTrade,
}) => {
  const questLog = useMemo(() => buildQuestLog(campaign), [campaign]);

  const startRelation = lord?.relation ?? 8;
  const [relation, setRelation] = useState(startRelation);
  const [gold, setGold] = useState(campaign.gold);
  const [nodeId, setNodeId] = useState<string>('root');
  const [lastOutcome, setLastOutcome] = useState<string | null>(null);
  /**
   * Faz 6d: muhatap konuşuyor mu? Yeni metin geldiğinde 2.6 sn ağız hareketi,
   * her seçimde bir el jesti. (Ses dosyası yok; "konuşuyor" görsel ritmi.)
   */
  const [speaking, setSpeaking] = useState(true);
  const [gestureKey, setGestureKey] = useState(0);
  const speakTimer = useRef<number | null>(null);

  const graph: DialogueGraph = useMemo(
    () =>
      buildDialogue({
        lord: lord ?? undefined,
        settlement: settlement ?? undefined,
        campaign,
        relation: startRelation,
        atWar: lord?.isAtWarWithPlayer ?? false,
        // Muhatabın kendi görevi: veren adı eşleşen ilk aktif görev.
        quest: questLog.active.find(
          (q) =>
            (lord && q.giverLordId === lord.id) ||
            (settlement && q.targetSettlementId === settlement.id),
        ),
        canTrade,
      }),
    // graph yalnız muhatap/kampanya ile yeniden kurulur; ilişki ayrı state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lord?.id, settlement?.id, campaign.day, canTrade, questLog.active.length],
  );

  const node = graph.nodes[nodeId] ?? graph.nodes[graph.root];
  const options = numberedOptions(node);
  const relationColor =
    relation >= 40 ? '#34d399' : relation > 0 ? '#a3e635' : relation > -40 ? '#fbbf24' : '#f87171';

  // Diyalog açılışı: yumuşak perde sesi (tarayıcı autoplay kilidi için
  // kullanıcı jesti zaten tıklama/klavye ile geliyor).
  useEffect(() => {
    sound.unlock();
    sound.playDialogueOpen();
    return () => sound.playDialogueClose();
  }, []);

  useEffect(() => {
    setSpeaking(true);
    sound.playDialogueBlip();
    if (speakTimer.current) window.clearTimeout(speakTimer.current);
    speakTimer.current = window.setTimeout(() => setSpeaking(false), 2600);
    return () => {
      if (speakTimer.current) window.clearTimeout(speakTimer.current);
    };
  }, [nodeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
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
  }, [options.length, nodeId, relation, gold]);

  const choose = (optionId: string) => {
    setGestureKey((k) => k + 1); // muhatap eliyle jest yapar
    const res = applyOption(graph, node.id, optionId, { relation, gold });
    const delta = res.relation - relation;
    sound.playDialogueChoice(delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral');
    setRelation(res.relation);
    setGold(res.gold);
    if (res.relation !== relation && lord && onRelationChange) {
      onRelationChange(lord.id, res.relation - relation);
    }
    if (res.acceptedQuestId) {
      sound.playAgreement();
      setLastOutcome('Görev günlüğe eklendi.');
      // kısa süre göster, sonra temizle
      window.setTimeout(() => setLastOutcome(null), 2500);
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

  const faction = FACTION_INFO[(lord?.faction ?? settlement?.faction ?? 'player') as keyof typeof FACTION_INFO];
  const speakerName = graph.speakerName;
  const initials = speakerName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center pb-6 pointer-events-none"
      data-testid="dialogue-modal"
    >
      {/* hafif karartma — harita görünür kalsın (Bannerlord davranışı) */}
      <div className="absolute inset-0 bg-black/35 pointer-events-auto" onClick={onClose} />

      <div className="relative w-full max-w-5xl pointer-events-auto px-3">
        {/* muhatap sahnesi — omuz üstü kadraj, kamera yaklaşır (Faz 6d) */}
        <div className="flex items-end gap-3">
          <div
            className="shrink-0 w-[300px] rounded-t-lg border-2 border-[#c6a15b]/70 shadow-2xl overflow-hidden"
            style={{ background: `linear-gradient(180deg, ${faction?.color ?? '#3b2f1d'} 0%, #14100c 100%)` }}
          >
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
              className="h-[168px] w-full"
            />
            <div className="bg-[#0d0b08]/85 px-1 py-1 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-display text-[11px] text-[#f8f0df] truncate">{initials}</div>
                <div className="text-[9px] text-[#c6a15b] truncate">{graph.speakerTitle}</div>
              </div>
              <span className="text-[9px] text-[#8b8072] shrink-0">3B sahne</span>
            </div>
          </div>

          {/* konuşma paneli */}
          <div className="flex-1 hud-panel rounded-t-lg border-t-2 border-t-[#c6a15b] p-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#c6a15b]/25 pb-1.5 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-display text-xs text-[#f8f0df] truncate">{speakerName}</span>
                <span className="text-[10px] text-[#a2957f] truncate">{faction?.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-[#a2957f]">İlişki</span>
                <span className="w-24 h-1.5 rounded bg-[#241c12] overflow-hidden">
                  <span
                    className="block h-full"
                    style={{
                      width: `${Math.min(100, Math.abs(relation))}%`,
                      background: relationColor,
                    }}
                  />
                </span>
                <span className="text-[10px] font-mono-tabular" style={{ color: relationColor }}>
                  {relation > 0 ? `+${relation}` : relation}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-2 text-[#c6a15b] hover:text-[#f8f0df] text-xs"
                  aria-label="Diyaloğu kapat"
                >
                  ✕
                </button>
              </div>
            </div>

            <p className="text-[12px] leading-relaxed text-[#e9dfcc] whitespace-pre-line min-h-[3.5rem]">
              {node.text}
            </p>

            {lastOutcome && (
              <div className="mt-1 text-[10px] text-[#34d399]">{lastOutcome}</div>
            )}

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => choose(opt.id)}
                  title={opt.hint}
                  className="flex items-start gap-2 text-left px-2 py-1.5 rounded border border-[#c6a15b]/25 bg-[#181510] hover:bg-[#241c12] hover:border-[#c6a15b]/60 transition-colors"
                >
                  <span className="shrink-0 mt-0.5 w-4 h-4 rounded bg-[#241c12] text-[#fbbf24] text-[9px] font-bold flex items-center justify-center">
                    {opt.index}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] text-[#e2d6c1] leading-snug">{opt.text}</span>
                    {opt.hint && (
                      <span className="block text-[9px] text-[#8b8072] mt-0.5">{opt.hint}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between text-[9px] text-[#8b8072]">
              <span>1–{options.length} tuşlarıyla seç · Esc çıkış</span>
              <span className="font-mono-tabular">
                Kese: {gold} dinar
                {lord?.isAtWarWithPlayer && <span className="ml-2 text-[#fca5a5]">SAVAŞ</span>}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
