/**
 * probe-recruitment-ui.tsx — Faz 8: asker toplama panelinin yapısal testi
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { SettlementModal } from '../src/components/SettlementModal.tsx';
import { BannerlordRecruitmentModal } from '../src/components/BannerlordRecruitmentModal.tsx';
import { readFileSync } from 'node:fs';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const town = campaign.settlements.find((s) => s.type === 'TOWN')!;
const village = campaign.settlements.find((s) => s.type === 'VILLAGE')!;

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const noop = () => null;
const render = (settlement: typeof town, tab = 'overview') =>
  renderToStaticMarkup(
    React.createElement(SettlementModal, {
      settlement,
      campaign,
      initialTab: tab,
      onClose: () => {},
      onRecruit: noop,
      onBuyFood: noop,
      onStartSiegeBattle: noop,
      onHireMercenaries: noop,
      onRansomPrisoners: noop,
      onBuyTavernRound: noop,
      onArenaPractice: noop,
      onArenaTournament: noop,
      onSellLoot: noop,
      onManageGarrison: noop,
      onRestAndRecover: noop,
    } as never),
  );

// SettlementModal sekme durumunu içeride tutuyor; sadece render'ın çökmediğini
// ve genel yerleşim arayüzünün geldiğini doğruluyoruz.
const html = render(town);
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok(html.length > 1000, 'yerleşim modalı render ediliyor');
ok(text.includes(town.name), 'yerleşke adı görünüyor');
ok(text.includes('Asker') || text.includes('Ordu'), 'asker/Ordu bilgisi var');

// Faz 8 veri katmanı UI'a bağlandı mı? (kaynak düzeyinde kontrol)
const src = readFileSync(new URL('../src/components/SettlementModal.tsx', import.meta.url), 'utf8');
ok(src.includes('recruitQuote'), 'panel recruitQuote kullanıyor');
ok(src.includes('partyLimit(campaign)'), 'parti kapasitesi gösteriliyor');
ok(src.includes('data-testid="recruit-panel"'), 'toplama paneli işaretli');
ok(src.includes('Tümü ('), 'toplu toplama düğmesi var');
ok(src.includes('factionRelation'), 'ilişki kapısı panelde hesaplanıyor');
ok(src.includes('blockedReason'), 'engel gerekçesi gösteriliyor');

const villageHtml = render(village);
ok(villageHtml.includes(village.name), 'köy modalı render ediliyor');

// BannerlordRecruitmentModal: köylerde rastgele/farklı sayıda asker ve toplanan slotların boşalması
const villagesSample = campaign.settlements.filter((s) => s.type === 'VILLAGE').slice(0, 12);
const slotCountsPerVillage = villagesSample.map((v) => {
  const mHtml = renderToStaticMarkup(
    React.createElement(BannerlordRecruitmentModal, {
      settlement: v,
      campaign,
      onCommitRecruits: () => {},
      onClose: () => {},
    }),
  );
  return (mHtml.match(/data-testid="recruitment-slot-/g) || []).length;
});
const distinctCounts = new Set(slotCountsPerVillage);
ok(
  distinctCounts.size >= 2,
  `köyler farklı sayıda gönüllü asker çıkarıyor (${Array.from(distinctCounts).join(', ')})`,
);

// Toplanan slotların ikinci açılışta Boş görünmesi
const testVillage = villagesSample[0];
const firstModalHtml = renderToStaticMarkup(
  React.createElement(BannerlordRecruitmentModal, {
    settlement: testVillage,
    campaign,
    onCommitRecruits: () => {},
    onClose: () => {},
  }),
);
const slotMatches = [...firstModalHtml.matchAll(/data-testid="recruitment-slot-([^"]+)"/g)].map((m) => {
  const raw = m[1];
  const lastDash = raw.lastIndexOf('-');
  return `${raw.slice(0, lastDash)}_${raw.slice(lastDash + 1)}`;
});
ok(slotMatches.length > 0, `köyde başlangıçta açık gönüllü slotu var (${slotMatches.length})`);

const emptiedVillage = {
  ...testVillage,
  recruitedSlotKeys: slotMatches,
};
const afterRecruitHtml = renderToStaticMarkup(
  React.createElement(BannerlordRecruitmentModal, {
    settlement: emptiedVillage,
    campaign,
    onCommitRecruits: () => {},
    onClose: () => {},
  }),
);
const remainingSlots = (afterRecruitHtml.match(/data-testid="recruitment-slot-/g) || []).length;
ok(remainingSlots === 0, 'asker toplandıktan sonra tekrar açıldığında alınan tüm slotlar boşalıyor');

console.log(fails === 0 ? '\n✅ ASKER TOPLAMA ARAYÜZÜ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
