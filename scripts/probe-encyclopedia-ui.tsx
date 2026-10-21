/**
 * probe-encyclopedia-ui.tsx — Ansiklopedi arayüzünün tarayıcısız duman testi
 *
 *   npx tsx scripts/probe-encyclopedia-ui.tsx
 *
 * React bileşeni `renderToStaticMarkup` ile HTML'e çevrilir; beklenen metinler
 * ve bölümler aranır. Görsel değil, **yapısal** doğrulama yapar.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { EncyclopediaModal } from '../src/components/encyclopedia/EncyclopediaModal.tsx';
import { buildEncyclopediaIndex } from '../src/game/encyclopedia.ts';
import { FACTION_INFO } from '../src/game/rules.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const index = buildEncyclopediaIndex(campaign, factionNames);

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const render = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(EncyclopediaModal, {
      campaign,
      onClose: () => {},
      ...props,
    } as never),
  );

/* 1. Ana sayfa */
const home = render();
ok(home.includes('Ansiklopedi'), 'başlık plakası render edildi');
for (const label of ['Kahramanlar', 'Krallıklar', 'Klanlar', 'Yerleşimler', 'Kavramlar']) {
  ok(home.includes(label), `ana sayfa kartı: ${label}`);
}
ok(home.includes('Ara'), 'arama kutusu var');

/* 2. Kahraman listesi */
const list = render({ initialRoute: { section: 'HEROES' } });
ok(list.includes('kayıt'), 'liste başlığı ("N kayıt")');
ok(list.includes('Tümü'), 'meslek filtresi');
ok(list.includes('Sırala'), 'sıralama grubu');
ok(list.includes(index.heroes[0].name) || list.includes(index.heroes[5].name), 'kahraman satırları');
ok(list.includes('yaş gizli'), 'fog: tanışılmamışta yaş gizli');
ok(list.includes('Kral'), 'hükümdar meslek etiketi görünüyor');

/* 3. Kahraman detayı */
const hero = index.heroes.find((h) => h.occupation === 'RULER')!;
const detail = render({ initialRoute: { section: 'HERO', id: hero.id } });
ok(detail.includes(hero.name), 'detayda kahraman adı');
ok(detail.includes('Bilgi'), 'detayda Bilgi bölümü');
ok(detail.includes('Son görüldü'), 'detayda son görülme satırı');
ok(detail.includes('Kişilik'), 'detayda kişilik bölümü');
ok(detail.includes('Beceriler'), 'detayda beceri bölümü');
ok(detail.includes('gizli'), 'fog: beceriler gizli');
ok(detail.includes('Tanış'), 'tanış düğmesi var');

const revealed = render({ initialRoute: { section: 'HERO', id: hero.id }, revealedHeroIds: [hero.id] });
ok(!revealed.includes('Tanış (bilgileri aç)'), 'tanışılmışta tanış düğmesi kalkıyor');
ok(revealed.includes('Cesaret'), 'tanışılmışta kişilik değerleri');
ok(!revealed.includes('beceriler gizli'), 'tanışılmışta beceriler açık');

/* 4. Yer tutucu sayfalar */
const kingdoms = render({ initialRoute: { section: 'KINGDOMS' } });
ok(kingdoms.includes('Krallıklar'), 'krallık bölümü açılıyor');
ok(kingdoms.includes('Faz 2'), 'yer tutucu mesajı');

/* 5. Bilinmeyen id güvenli */
const broken = render({ initialRoute: { section: 'HERO', id: 'yok-boyle-bir-id' } });
ok(broken.includes('Kahraman bulunamadı'), 'geçersiz hero id çökmüyor');

console.log(fails === 0 ? '\n✅ ANSİKLOPEDİ ARAYÜZÜ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
