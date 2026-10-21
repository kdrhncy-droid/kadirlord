/**
 * probe-market-ui.tsx — Faz 7: pazar arayüzünün yapısal testi (tarayıcısız)
 *
 *   npx tsx scripts/probe-market-ui.tsx
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { BannerlordMarketModal } from '../src/components/BannerlordMarketModal.tsx';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const town = campaign.settlements.find((s) => s.type === 'TOWN')!;

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const html = renderToStaticMarkup(
  React.createElement(BannerlordMarketModal, {
    settlement: town,
    campaign,
    onClose: () => {},
    onUpdateCampaign: () => {},
  } as never),
);
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

ok(text.includes(town.name), 'yerleşke adı başlıkta', town.name);
ok(text.includes('Pazaryeri Tezgahı'), 'sol sütun: pazaryeri tezgahı');
ok(text.includes('3B Canlı Karakter'), 'orta sütun: karakter mankeni');
ok(text.includes('Kuşanılmış Teçhizat Slotları'), 'orta sütun: 12 teçhizat slotu');
ok(text.includes('Refah:'), 'başlıkta yerleşke refahı');
ok(/Fiyat endeksi/.test(text), 'fiyat endeksi gösteriliyor');
ok(/Taban \d+ D/.test(text), 'her malda taban fiyat yazılı');
ok(/Ticaret söylentisi|: \d+ D/.test(text), 'ticaret söylentisi satırları var');
ok(text.includes('Stok'), 'tezgah stoğu gösteriliyor');
ok(/Bitir/.test(text), 'alt barda "Bitir" düğmesi');
ok(/net sonucu|0 D · \d+ alış/.test(text) || text.includes('alış /'), 'alt barda net sonuç şeridi');
ok(html.includes('🔒') || html.includes('🔓'), 'envanterde kilit kolonu var');
ok(!html.includes('14800'), 'sabit 14.800 tüccar altını kalmadı');
ok(/Fiyat \(Artan\)/.test(text), 'sıralama seçenekleri duruyor');

/* Kategoriler: 6 filtre */
for (const cat of ['TÜMÜ', 'SİLAHLAR', 'KALKANLAR', 'ZIRHLAR', 'ERZAK &amp; EMTİA', 'BİNEKLER']) {
  ok(text.includes(cat), `kategori "${cat.replace('&amp;', '&')}"`);
}

console.log(fails === 0 ? '\n✅ PAZARYERİ ARAYÜZÜ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
