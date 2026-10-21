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

/* 4. Krallık / klan / yerleşim / kavram sayfaları (Faz 1b) */
const k = index.kingdoms[0];
const kingdoms = render({ initialRoute: { section: 'KINGDOMS' } });
ok(kingdoms.includes(k.name), 'krallık listesinde krallık adı');
ok(kingdoms.includes('Hükümdar:'), 'krallık satırında hükümdar');
ok(kingdoms.includes('kayıt'), 'krallık listesi kayıt sayısı');

const kingdomDetail = render({ initialRoute: { section: 'KINGDOM', id: k.id } });
ok(kingdomDetail.includes(k.name), 'krallık detayında ad');
ok(kingdomDetail.includes('Klanlar'), 'krallık detayında Klanlar bölümü');
ok(kingdomDetail.includes('Topraklar'), 'krallık detayında Topraklar bölümü');
ok(kingdomDetail.includes('Lordlar ve leydiler'), 'krallık detayında üyeler');
ok(kingdomDetail.includes(k.rulerName), 'krallık detayında hükümdar adı');

const clan = index.clans[0];
const clans = render({ initialRoute: { section: 'CLANS' } });
ok(clans.includes(clan.name), 'klan listesinde klan adı');

const clanDetail = render({ initialRoute: { section: 'CLAN', id: clan.id } });
ok(clanDetail.includes(clan.name), 'klan detayında ad');
ok(clanDetail.includes('Üyeler'), 'klan detayında Üyeler bölümü');
ok(clanDetail.includes('Lider'), 'klan detayında lider');

const settlements = render({ initialRoute: { section: 'SETTLEMENTS' } });
ok(settlements.includes('Tür'), 'yerleşim filtresi var');
// İkonlar artık SVG (emoji fontu olmayan sistemlerde tofu çıkıyordu).
ok(
  settlements.includes('<svg') && settlements.includes('lucide-castle'),
  'yerleşim tür ikonları SVG (lucide)',
);
ok(!/🏙️|🏰|🏡|🧔|🛡️|📖/.test(home + settlements), 'emoji ikon kalmadı (font bağımsız)');

const st = index.settlements[0];
const settlementDetail = render({ initialRoute: { section: 'SETTLEMENT', id: st.id } });
ok(settlementDetail.includes(st.name), 'yerleşim detayında ad');
ok(settlementDetail.includes('Açıklama'), 'yerleşim detayında açıklama');
ok(settlementDetail.includes('Burada son görülenler'), 'yerleşim detayında son görülenler');

/* 4b. Portreler (Faz 1c) — WebGL yokken baş harf rozeti, kadraj bozulmadan */
ok(list.includes('width:36px'), 'kahraman listesinde 36px portre kutusu');
ok(list.includes(index.heroes[0].bannerColor), 'liste portresi sancak rengini taşıyor');
ok(detail.includes('width:208px'), 'kahraman detayında 208px portre');
ok(detail.includes('height:260px'), 'detay portresi 4:5 oranında (208×260)');
ok(!detail.includes('<img'), 'WebGL yokken detayda <img> yok (rozet fallback)');

const concepts = render({ initialRoute: { section: 'CONCEPTS' } });
ok(concepts.includes('Renown'), 'kavramlar: Renown');
ok(concepts.includes('Kalkan Duvarı'), 'kavramlar: Kalkan Duvarı');
ok(concepts.includes('Gruplar'), 'kavramlar filtre grubu');

/* 5. Bozuk id güvenliği */
ok(render({ initialRoute: { section: 'HERO', id: 'yok' } }).includes('Kahraman bulunamadı'), 'geçersiz hero id çökmüyor');
ok(render({ initialRoute: { section: 'KINGDOM', id: 'yok' } }).includes('Krallık bulunamadı'), 'geçersiz kingdom id çökmüyor');
ok(render({ initialRoute: { section: 'CLAN', id: 'yok' } }).includes('Klan bulunamadı'), 'geçersiz clan id çökmüyor');
ok(render({ initialRoute: { section: 'SETTLEMENT', id: 'yok' } }).includes('Yerleşim bulunamadı'), 'geçersiz settlement id çökmüyor');

/* 6. Faz 1i: klan/krallık listelerinde portre (Bannerlord deseni) */
const kingdomsPage = render({ initialRoute: { section: 'KINGDOMS' } });
const clansPage = render({ initialRoute: { section: 'CLANS' } });
ok(kingdomsPage.includes('width:36px'), 'krallık listesinde hükümdar portresi (36px)');
ok(clansPage.includes('width:34px'), 'klan listesinde lider portresi (34px)');
const rulerColor = index.kingdomById[index.kingdoms[0].id]?.rulerId
  ? index.heroById[index.kingdomById[index.kingdoms[0].id]!.rulerId!]?.bannerColor
  : undefined;
ok(!rulerColor || kingdomsPage.includes(rulerColor), 'krallık portresi sancak rengini taşıyor');

/* 7. Kontrast: en koyu mikro etiket tonu yükseltildi */
ok(
  !home.includes('#6b6154') && !kingdomsPage.includes('#6b6154'),
  'düşük kontrastlı #6b6154 metin kalmadı',
);

console.log(fails === 0 ? '\n✅ ANSİKLOPEDİ ARAYÜZÜ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
