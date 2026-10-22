import React from 'react';
import { FACTION_INFO, type CampaignState, type LordAgent } from '../game/rules';
import {
  type SiegeEncounterView,
  ACTIVE_SIEGE_SLOTS,
} from '../game/siegeEncounter';

interface SiegeEncounterModalProps {
  view: SiegeEncounterView;
  campaign: CampaignState;
  onClose: () => void;
  onOpenSiegeCamp: () => void;
  onAssaultBreach: () => void;
  onAssaultRam: () => void;
  onLiftSiege: () => void;
  onAttackBesiegers: (lord: LordAgent) => void;
  onBreakIn: () => void;
  onObserve: () => void;
  onDefendWalls: () => void;
  onSallyOut: (lord: LordAgent | null) => void;
  onTalkSurrender: () => void;
}

function leadLord(campaign: CampaignState, view: SiegeEncounterView): LordAgent | null {
  const id = view.siege.leadBesiegerId;
  if (!id) return null;
  return campaign.lords.find((lord) => lord.id === id) ?? null;
}

export const SiegeEncounterModal: React.FC<SiegeEncounterModalProps> = ({
  view,
  campaign,
  onClose,
  onOpenSiegeCamp,
  onAssaultBreach,
  onAssaultRam,
  onLiftSiege,
  onAttackBesiegers,
  onBreakIn,
  onObserve,
  onDefendWalls,
  onSallyOut,
  onTalkSurrender,
}) => {
  const { settlement, role, siege, wallHealth, wallBreached, garrisonFood, campReady } = view;
  const fac = FACTION_INFO[settlement.faction];
  const besieger = leadLord(campaign, view);
  const engineCount = settlement.siegeEngines?.length ?? 0;
  const reserveCount = settlement.reserveEngines?.length ?? 0;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/55"
      data-testid="siege-encounter-modal"
    >
      <div className="w-[min(640px,94vw)] rounded border border-[#c6a15b]/55 bg-[#120f0c] shadow-2xl text-[#f4ecd8]">
        <header className="px-5 py-3 border-b border-[#c6a15b]/35 flex items-start justify-between gap-3 bg-[#181510]">
          <div>
            <div className="font-display text-sm tracking-wide text-[#fbbf24]">
              {settlement.type === 'CASTLE' ? 'Kale' : 'Şehir'} Kuşatma Durumu
            </div>
            <h2 className="font-display text-xl text-[#fde68a] mt-0.5">{settlement.name}</h2>
            <div className="text-[11px] text-[#e2d6c1]/80 mt-1">
              {fac.name}
              {besieger ? ` · Kuşatan: ${besieger.name}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs border border-[#c6a15b]/40 rounded hover:border-[#fbbf24] text-[#e2d6c1]"
          >
            Kapat
          </button>
        </header>

        <div className="px-5 py-3 grid grid-cols-3 gap-2 text-[11px] font-mono-tabular border-b border-[#c6a15b]/20 bg-[#1a140d]">
          <div>
            Sur
            <div className="text-[#fde68a] text-sm">{wallBreached ? 'GEDİK AÇIK' : `%${wallHealth}`}</div>
          </div>
          <div>
            Garnizon erzağı
            <div className="text-[#fde68a] text-sm">{garrisonFood}</div>
          </div>
          <div>
            Kamp / silah
            <div className="text-[#fde68a] text-sm">
              %{Math.round(siege.progress)} · {engineCount}/{ACTIVE_SIEGE_SLOTS}+{reserveCount} rzv
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-2">
          {role === 'attacker' && (
            <>
              <p className="text-xs text-[#e2d6c1]/90">
                Kuşatma kampındasın. Silahları rezervede biriktirip birlikte sürü; sur canı 0 olunca gedikten hücum et.
              </p>
              <ActionButton
                testId="siege-open-camp"
                label="Kuşatma Kampı"
                hint={campReady ? 'Silah yuvaları ve bombardıman' : 'Kamp kurulumu sürüyor'}
                onClick={onOpenSiegeCamp}
              />
              <ActionButton
                testId="siege-assault-breach"
                label="Sur Gediklerinden Hücum Et"
                hint={wallBreached ? 'Moloz üzerinden taarruz' : 'Önce sur canını sıfırla'}
                disabled={!wallBreached}
                onClick={onAssaultBreach}
              />
              <ActionButton
                testId="siege-assault-ram"
                label="Koçbaşıyla Kapıyı Zorla"
                hint="Koçbaşı ve kulelerle taarruz"
                onClick={onAssaultRam}
              />
              <ActionButton
                testId="siege-lift"
                label="Kuşatmayı Kaldır"
                hint="Kampı sök ve geri çekil"
                tone="muted"
                onClick={onLiftSiege}
              />
            </>
          )}

          {role === 'outsider' && (
            <>
              <p className="text-xs text-[#e2d6c1]/90">
                Düşman bu yerleşimi kuşatıyor. Hatları yardıktan sonra garnizona katılabilirsin; yarma asker kaybettirir.
              </p>
              <ActionButton
                testId="siege-attack-besiegers"
                label="Kuşatan Orduya Taarruz Et (Kuşatmayı Kır)"
                hint={besieger ? besieger.name : 'Açık meydan muharebesi'}
                disabled={!besieger}
                onClick={() => besieger && onAttackBesiegers(besieger)}
              />
              <ActionButton
                testId="siege-break-in"
                label="Kuşatmayı Yararak İçeri Gir"
                hint="Savunuculara katıl · %15–25 zayiat riski"
                onClick={onBreakIn}
              />
              <ActionButton
                testId="siege-observe"
                label="Uzaktan Gözlemle / Bekle"
                hint="Haritaya dön"
                tone="muted"
                onClick={onObserve}
              />
            </>
          )}

          {role === 'defender' && (
            <>
              <p className="text-xs text-[#e2d6c1]/90">
                Kuşatma altındaki surların içindesin. Huruc ile kampı vurabilir veya teslim şartlarını konuşabilirsin.
              </p>
              <ActionButton
                testId="siege-defend-walls"
                label="Sur Savunmasını Yönet / Taarruzu Karşıla"
                hint="Düşman hücumunu surda karşıla"
                onClick={onDefendWalls}
              />
              <ActionButton
                testId="siege-sally"
                label="Huruc Hareketi Yap"
                hint="Kapıdan çık, kuşatma makinelerini yak"
                onClick={() => onSallyOut(besieger)}
              />
              <ActionButton
                testId="siege-surrender-talk"
                label="Teslim Şartlarını Konuş"
                hint="Kuşatan komutanla barter"
                tone="muted"
                onClick={onTalkSurrender}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function ActionButton({
  label,
  hint,
  onClick,
  disabled,
  tone = 'gold',
  testId,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'gold' | 'muted';
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded border transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed border-[#c6a15b]/20 bg-[#1c1914]'
          : tone === 'gold'
            ? 'border-[#c6a15b]/50 bg-[#1a140d] hover:border-[#fbbf24] hover:shadow-md'
            : 'border-[#c6a15b]/25 bg-[#181510] hover:border-[#c6a15b]'
      }`}
    >
      <div className="font-display text-sm text-[#fde68a]">{label}</div>
      <div className="text-[11px] text-[#e2d6c1]/70 mt-0.5">{hint}</div>
    </button>
  );
}
