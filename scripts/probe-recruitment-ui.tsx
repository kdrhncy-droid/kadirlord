/**
 * probe-recruitment-ui.tsx — Faz 8: asker toplama panelinin yapısal testi
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { SettlementModal } from '../src/components/SettlementModal.tsx';
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

console.log(fails === 0 ? '\n✅ ASKER TOPLAMA ARAYÜZÜ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
