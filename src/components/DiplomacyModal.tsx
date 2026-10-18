import React, { useState } from 'react';
import {
  CampaignState,
  FACTION_INFO,
  LordAgent,
  getTotalTroops,
} from '../game/rules';

interface DiplomacyModalProps {
  selectedLord: LordAgent;
  campaign: CampaignState;
  onClose: () => void;
  onSelectLord: (lord: LordAgent) => void;
  onApplyDiplomacyResult: (
    lordId: string,
    relationDelta: number,
    politicalAction: string,
    goldDelta: number,
    renownDelta: number,
    chronicleEntry: string,
  ) => void;
  onStartFieldBattle: (lord: LordAgent) => void;
}

export const DiplomacyModal: React.FC<DiplomacyModalProps> = ({
  selectedLord,
  campaign,
  onClose,
  onSelectLord,
  onApplyDiplomacyResult,
  onStartFieldBattle,
}) => {
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [dialogueLog, setDialogueLog] = useState<
    Array<{ speaker: string; text: string; outcome?: string }>
  >([
    {
      speaker: `${selectedLord.title} ${selectedLord.name}`,
      text: selectedLord.isAtWarWithPlayer
        ? `Demek huzuruma çıkmaya cesaret ettin ${campaign.playerName}! Kılıcım kınından çıkmadan önce son sözün nedir?`
        : `Sancağını uzaktan gördüm ${campaign.playerName}. Kalradya'nın bu fırtınalı günlerinde seni divanıma getiren sebep nedir?`,
    },
  ]);

  const sendProposal = async (proposalType: string, defaultPrompt: string) => {
    if (loading) return;
    const messageToSend = customMessage.trim() || defaultPrompt;
    setLoading(true);
    setCustomMessage('');

    setDialogueLog((prev) => [
      ...prev,
      { speaker: campaign.playerName, text: messageToSend },
    ]);

    try {
      const response = await fetch('/api/diplomacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lordName: selectedLord.name,
          lordTitle: selectedLord.title,
          factionName: FACTION_INFO[selectedLord.faction].name,
          personality: selectedLord.personality,
          relation: selectedLord.relation,
          playerName: campaign.playerName,
          playerRenown: campaign.renown,
          playerGold: campaign.gold,
          playerArmySize: getTotalTroops(campaign.roster),
          isAtWar: selectedLord.isAtWarWithPlayer,
          playerMessage: messageToSend,
          proposalType,
          worldContext: `Gün ${campaign.day}, Mevsim ${campaign.season}. Son olay: ${
            campaign.chronicle[0]?.text || 'Sınır boylarında gergin bekleyiş.'
          }`,
        }),
      });

      const data = await response.json();
      const relationStr =
        data.relationDelta >= 0 ? `+${data.relationDelta}` : `${data.relationDelta}`;
      const outcomeSummary = `İlişki: ${relationStr} · Karar: ${data.politicalAction} · Nam: +${data.renownDelta || 0}`;

      setDialogueLog((prev) => [
        ...prev,
        {
          speaker: `${selectedLord.title} ${selectedLord.name}`,
          text: data.reply,
          outcome: outcomeSummary,
        },
      ]);

      onApplyDiplomacyResult(
        selectedLord.id,
        data.relationDelta || 0,
        data.politicalAction || 'NONE',
        data.goldDelta || 0,
        data.renownDelta || 2,
        data.chronicleEntry || `${selectedLord.title} ${selectedLord.name} ile görüşüldü.`,
      );
    } catch (_err) {
      setDialogueLog((prev) => [
        ...prev,
        {
          speaker: `${selectedLord.title} ${selectedLord.name}`,
          text: `Sözlerin диванımızda yankı buldu ${campaign.playerName}. Şartları değerlendireceğiz.`,
          outcome: 'İlişki: +4 · Karar: NONE',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleLordSwitch = (lord: LordAgent) => {
    onSelectLord(lord);
    setDialogueLog([
      {
        speaker: `${lord.title} ${lord.name}`,
        text: lord.isAtWarWithPlayer
          ? `Savaş meydanında karşılaşmadan önce ne söyleyeceksin ${campaign.playerName}?`
          : `Hoş geldin ${campaign.playerName}. ${FACTION_INFO[lord.faction].name} adına seni dinliyorum.`,
      },
    ]);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 pointer-events-auto"
      style={{ backgroundColor: 'rgba(8, 7, 5, 0.82)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diplomacy-modal-title"
    >
      <div className="hud-panel w-full max-w-4xl rounded-lg p-6 text-[#f3ead8] flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[#c6a15b]/30 pb-3">
          <div>
            <div className="text-xs text-[#c6a15b]">
              Kalradya Siyasi Divanı · Gemini Dinamik Lord Zekası
            </div>
            <h2 id="diplomacy-modal-title" className="text-xl font-bold text-[#f8f0df]">
              {selectedLord.title} {selectedLord.name} — {FACTION_INFO[selectedLord.faction].name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Diplomasi ekranını kapat"
            className="px-3 py-1.5 text-xs font-semibold bg-[#26211a] border border-[#c6a15b]/40 rounded hover:bg-[#362f25] transition-colors whitespace-nowrap shrink-0"
          >
            Divandan Ayrıl [Esc]
          </button>
        </div>

        {/* Lord Selector Strip */}
        <div className="flex items-center gap-2 py-3 border-b border-[#c6a15b]/20 overflow-x-auto">
          {campaign.lords.map((l) => {
            const active = l.id === selectedLord.id;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => handleLordSwitch(l)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#b45309] text-white'
                    : 'bg-[#1a1712] text-[#d1c5b0] hover:bg-[#2a241c]'
                }`}
              >
                {l.title} {l.name} ({l.isAtWarWithPlayer ? 'Savaşta' : l.isAlliedWithPlayer ? 'Müttefik' : `İlişki ${l.relation}`})
              </button>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 my-4 flex-1 overflow-hidden">
          {/* Left Column: Lord Dossier */}
          <div className="bg-[#16130f] border border-[#c6a15b]/25 rounded p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs text-[#a89b84]">Karakter & Sancak Özeti</div>
              <div className="text-base font-bold text-[#f8f0df] mt-1">
                {selectedLord.title} {selectedLord.name}
              </div>
              <p className="text-xs text-[#c7baa3] mt-2 leading-relaxed">
                {selectedLord.personality}
              </p>

              <div className="mt-4 space-y-2 text-xs border-t border-[#c6a15b]/20 pt-3 font-mono-tabular">
                <div className="flex justify-between">
                  <span className="text-[#a89b84]">İlişki Puanı:</span>
                  <span
                    className={
                      selectedLord.relation >= 10
                        ? 'text-[#34d399] font-semibold'
                        : selectedLord.relation < 0
                          ? 'text-[#f87171] font-semibold'
                          : 'text-[#fbbf24]'
                    }
                  >
                    {selectedLord.relation} / 100
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a89b84]">Lordun Ordusu:</span>
                  <span className="text-[#f3ead8]">{selectedLord.armySize} Asker</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a89b84]">Diplomatik Durum:</span>
                  <span className="text-[#f3ead8]">
                    {selectedLord.isAtWarWithPlayer
                      ? 'Savaş Halinde'
                      : selectedLord.isAlliedWithPlayer
                        ? 'Askeri İttifak'
                        : 'Ateşkes / Nötr'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#a89b84]">Güncel Hareket:</span>
                  <span className="text-[#d1c5b0]">{selectedLord.currentAction}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#c6a15b]/20">
              <button
                type="button"
                onClick={() => onStartFieldBattle(selectedLord)}
                className="w-full py-2.5 px-3 rounded text-xs font-bold bg-[#991b1b] hover:bg-[#b91c1c] text-white transition-colors whitespace-nowrap"
              >
                Meydan Savaşına Tutuş ({selectedLord.armySize} Asker)
              </button>
            </div>
          </div>

          {/* Right 2 Columns: Dialogue & Diplomatic Decisions */}
          <div className="lg:col-span-2 flex flex-col bg-[#16130f] border border-[#c6a15b]/25 rounded p-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 max-h-56">
              {dialogueLog.map((entry, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded text-sm ${
                    entry.speaker === campaign.playerName
                      ? 'bg-[#262017] border border-[#d97706]/30 ml-6'
                      : 'bg-[#1f1b15] border border-[#c6a15b]/25 mr-6'
                  }`}
                >
                  <div className="text-xs font-semibold text-[#c6a15b] mb-1">
                    {entry.speaker}
                  </div>
                  <div className="text-[#f3ead8] leading-relaxed">{entry.text}</div>
                  {entry.outcome && (
                    <div className="mt-1.5 text-xs font-mono-tabular text-[#34d399]">
                      {entry.outcome}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="text-xs text-[#fbbf24] italic px-2">
                  {selectedLord.title} {selectedLord.name} teklifinizi tartıyor...
                </div>
              )}
            </div>

            {/* Quick Diplomatic Proposals */}
            <div className="mt-3 pt-3 border-t border-[#c6a15b]/20">
              <div className="text-xs text-[#a89b84] mb-2">Diplomatik Hamle Seçin:</div>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    sendProposal(
                      'ALLIANCE',
                      'Ortak düşmanlarımıza karşı sancaklarımızı birleştirip askeri ittifak kuralım.',
                    )
                  }
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-[#1e293b] hover:bg-[#334155] text-[#93c5fd] border border-[#60a5fa]/30 whitespace-nowrap shrink-0"
                >
                  Askeri İttifak Teklif Et
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    sendProposal(
                      'PEACE',
                      'Aramızdaki savaşı sonlandırıp kalıcı bir barış ahitnamesi imzalayalım.',
                    )
                  }
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-[#172e24] hover:bg-[#224234] text-[#6ee7b7] border border-[#34d399]/30 whitespace-nowrap shrink-0"
                >
                  Barış Ahitnamesi Sun
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    sendProposal(
                      'MERCENARY',
                      'Ordumun kılıçlarını sancaklarınız adına paralı sefer hizmetine sunuyorum.',
                    )
                  }
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-[#2e2415] hover:bg-[#42331d] text-[#fcd34d] border border-[#f59e0b]/30 whitespace-nowrap shrink-0"
                >
                  Paralı Sancaktar Sözleşmesi
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    sendProposal(
                      'TRADE',
                      'Şehirlerimiz arasında güvenli kervan yolu ve gümrük imtiyazı kuralım.',
                    )
                  }
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-[#27211c] hover:bg-[#382f28] text-[#e7e5e4] border border-[#a8a29e]/30 whitespace-nowrap shrink-0"
                >
                  Kervan Ticaret Anlaşması
                </button>
              </div>

              {/* Free-form Gemini Dialogue Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customMessage.trim()) {
                    sendProposal('CUSTOM', customMessage.trim());
                  }
                }}
                className="flex items-center gap-2"
              >
                <label htmlFor="diplomacy-custom-input" className="sr-only">
                  Lorda mesajınızı yazın
                </label>
                <input
                  id="diplomacy-custom-input"
                  type="text"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={`${selectedLord.title} ${selectedLord.name} huzurunda sözünüzü söyleyin...`}
                  className="flex-1 bg-[#0e0c09] border border-[#c6a15b]/35 rounded px-3 py-2 text-xs text-[#f3ead8] placeholder-[#786e5d] focus:outline-none focus:border-[#f59e0b]"
                />
                <button
                  type="submit"
                  disabled={loading || !customMessage.trim()}
                  className="px-4 py-2 rounded text-xs font-semibold bg-[#b45309] hover:bg-[#d97706] text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  Sözü İlet
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
