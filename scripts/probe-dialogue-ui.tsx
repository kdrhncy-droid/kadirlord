/**
 * probe-dialogue-ui.tsx — Faz 6: diyalog ekranının yapısal testi (tarayıcısız)
 *
 *   npx tsx scripts/probe-dialogue-ui.tsx
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { DialogueModal } from '../src/components/DialogueModal.tsx';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const lord = campaign.lords.find((l) => l.faction !== 'bandits')!;
const village = campaign.settlements.find((s) => s.type === 'VILLAGE')!;

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    React.createElement(DialogueModal, {
      campaign,
      onClose: () => {},
      ...props,
    } as never),
  );

const html = render({ lord, canTrade: false });
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

ok(html.includes('data-testid="dialogue-modal"'), 'diyalog katmanı render ediliyor');
ok(text.includes(lord.name), 'muhatabın adı başlıkta');
ok(text.includes('İlişki'), 'ilişki göstergesi var');
ok(/1–\d+ tuşlarıyla seç/.test(text), 'klavye ipucu görünüyor');
ok(text.includes('Kese:'), 'kese (altın) göstergesi var');

const numbered = [...html.matchAll(/rounded bg-\[#241c12\][^>]*>(\d)<\/span>/g)].map((m) => m[1]);
ok(numbered.length >= 4, 'numaralı seçenekler var', numbered.join(','));
ok(numbered[0] === '1', 'ilk seçenek 1 numaralı');
ok(numbered.length <= 9, 'seçenek sayısı 9’u geçmiyor');

ok(text.includes('Vedalaş'), 'vedalaşma seçeneği görünüyor');
ok(!text.includes('Pazaryerini göster'), 'yerleşim dışında pazaryeri seçeneği yok');

const inTown = render({ settlement: village, canTrade: true });
const townText = inTown.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok(townText.includes(village.name), 'yerleşim muhatabı adı görünüyor');

const warLord = campaign.lords.find((l) => l.isAtWarWithPlayer);
if (warLord) {
  const war = render({ lord: warLord });
  const warText = war.replace(/<[^>]+>/g, ' ');
  ok(warText.includes('SAVAŞ'), 'savaş hâli diyalogta işaretli');
} else {
  ok(true, 'savaş hâlindeki lord bulunamadı (atlandı)');
}

console.log(fails === 0 ? '\n✅ DİYALOG ARAYÜZÜ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
