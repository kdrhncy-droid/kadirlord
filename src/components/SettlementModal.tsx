import React, { useState } from 'react';
import {
  CampaignState,
  FACTION_INFO,
  Settlement,
  UNIT_DEFINITIONS,
  UnitTierId,
} from '../game/rules';

interface SettlementModalProps {
  settlement: Settlement;
  campaign: CampaignState;
  onClose: () => void;
  onRecruit: (settlementId: string, unitId: UnitTierId, amount: number) => string | null;
  onBuyFood: (settlementId: string, packs: number) => string | null;
  onStartSiegeBattle: (settlement: Settlement) => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  settlement,
  campaign,
  onClose,
  onRecruit,
  onBuyFood,
  onStartSiegeBattle,
}) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const factionInfo = FACTION_INFO[settlement.faction];
  const isPlayerOwned = settlement.faction === 'player';

  const handleRecruitClick = (unitId: UnitTierId) => {
    const err = onRecruit(settlement.id, unitId, 1);
    if (err) {
      setFeedback(err);
    } else {
      setFeedback(`${UNIT_DEFINITIONS[unitId].name} sancağınıza katıldı!`);
    }
  };

  const handleFoodClick = () => {
    const err = onBuyFood(settlement.id, 5);
    if (err) {
      setFeedback(err);
    } else {
      setFeedback('+5 Erzak sandığı ordunuza eklendi.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 pointer-events-auto"
      style={{ backgroundColor: 'rgba(8, 7, 5, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settlement-modal-title"
    >
      <div className="hud-panel w-full max-w-3xl rounded-lg p-6 text-[#f3ead8]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#c6a15b]/30 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#c6a15b] tracking-wider">
              <span>{settlement.type === 'CASTLE' ? 'Müstahkem Kale' : settlement.type === 'TOWN' ? 'Ticaret Şehri' : 'Köy Yerleşimi'}</span>
              <span aria-hidden="true">·</span>
              <span>{factionInfo.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">Refah {settlement.prosperity}</span>
            </div>
            <h2 id="settlement-modal-title" className="text-2xl font-bold text-[#f8f0df] mt-1">
              {settlement.name}
            </h2>
            <p className="text-sm text-[#d1c5b0] mt-1 max-w-xl">{settlement.description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Yerleşim menüsünü kapat"
            className="px-3 py-1.5 text-xs font-semibold text-[#f3ead8] bg-[#26211a] border border-[#c6a15b]/40 rounded hover:bg-[#362f25] transition-colors whitespace-nowrap shrink-0"
          >
            Haritaya Dön [Esc]
          </button>
        </div>

        {/* Status Bar */}
        <div className="grid grid-cols-3 gap-4 my-4 p-3 rounded bg-[#181510] border border-[#c6a15b]/20 text-sm">
          <div>
            <span className="text-xs text-[#a89b84] block">Hazineniz</span>
            <span className="text-lg font-bold font-mono-tabular text-[#fbbf24]">
              {campaign.gold} Dinar
            </span>
          </div>
          <div>
            <span className="text-xs text-[#a89b84] block">Ordu Erzağı</span>
            <span className="text-lg font-bold font-mono-tabular text-[#34d399]">
              {campaign.food} Erzak (Pazar: {settlement.foodStock})
            </span>
          </div>
          <div>
            <span className="text-xs text-[#a89b84] block">Kale Garnizonu</span>
            <span className="text-lg font-bold font-mono-tabular text-[#f3ead8]">
              {settlement.garrison} Muhafız
            </span>
          </div>
        </div>

        {feedback && (
          <div className="mb-4 px-3 py-2 rounded bg-[#292216] border border-[#d97706]/50 text-xs text-[#fde68a]">
            {feedback}
          </div>
        )}

        {/* Recruitment Roster */}
        <h3 className="text-sm font-semibold text-[#c6a15b] mb-2">
          Gönüllü Asker Topla (Kışla ve Köylü Yazımı)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {(Object.keys(UNIT_DEFINITIONS) as UnitTierId[]).map((unitId) => {
            const def = UNIT_DEFINITIONS[unitId];
            const available = settlement.recruitPool[unitId];
            const owned = campaign.roster[unitId];
            const canAfford = campaign.gold >= def.recruitCost && available > 0;

            return (
              <div
                key={unitId}
                className="flex items-center justify-between p-3 rounded bg-[#1a1712] border border-[#c6a15b]/25"
              >
                <div>
                  <div className="font-semibold text-sm text-[#f8f0df]">{def.name}</div>
                  <div className="text-xs text-[#b5a890] mt-0.5">{def.role}</div>
                  <div className="text-xs text-[#c6a15b] mt-1 font-mono-tabular">
                    Mevcut: {available} · Orduda: {owned} · Günlük: {def.dailyWage} Dinar
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => handleRecruitClick(unitId)}
                  className={`px-3 py-2 rounded text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    canAfford
                      ? 'bg-[#b45309] hover:bg-[#d97706] text-white'
                      : 'bg-[#2a251e] text-[#6e6455] cursor-not-allowed'
                  }`}
                >
                  Topla ({def.recruitCost} Dinar)
                </button>
              </div>
            );
          })}
        </div>

        {/* Bottom Actions: Buy Food or Besiege */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#c6a15b]/25">
          <button
            type="button"
            onClick={handleFoodClick}
            disabled={campaign.gold < 30 || settlement.foodStock < 5}
            className="px-4 py-2 rounded text-xs font-semibold bg-[#1f2922] hover:bg-[#28382d] text-[#6ee7b7] border border-[#34d399]/40 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            Erzak Satın Al (+5 Erzak · 30 Dinar)
          </button>

          {!isPlayerOwned && (
            <button
              type="button"
              onClick={() => onStartSiegeBattle(settlement)}
              className="px-4 py-2 rounded text-xs font-semibold bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-[#f87171]/40 transition-colors whitespace-nowrap shrink-0"
            >
              Yerleşimi Kuşat ve Meydan Savaşına Gir
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
