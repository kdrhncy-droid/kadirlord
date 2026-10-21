/**
 * probe-encyclopedia.ts — Ansiklopedi mantığı doğrulaması (Faz 1a)
 *
 *   npx tsx scripts/probe-encyclopedia.ts
 */
import { FACTION_INFO, createInitialCampaignState, type Settlement } from '../src/game/rules.ts';
import { ageOf } from '../src/game/heroes.ts';
import {
  HOME_ROUTE,
  breadcrumb,
  buildEncyclopediaIndex,
  canGoBack,
  createNav,
  currentRoute,
  filterHeroes,
  goBack,
  jumpTo,
  pushRoute,
  routeKey,
  searchEncyclopedia,
} from '../src/game/encyclopedia.ts';

const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const index = buildEncyclopediaIndex(campaign, factionNames);

let fails = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}`);
};

/* 1. Dizin */
ok(index.heroes.length === 40, `dizin 40 kahraman içeriyor (${index.heroes.length})`);
ok(index.clans.length >= 7, `klanlar üretildi (${index.clans.length})`);
ok(index.kingdoms.length === 6, `6 krallık (${index.kingdoms.length})`);
ok(index.settlements.length === 211, `211 yerleşim (${index.settlements.length})`);

/* 2. Referans bütünlüğü */
ok(index.heroes.every((h) => index.clanById[h.clanId]), 'her kahramanın klanı dizinde');
ok(
  index.heroes.filter((h) => h.kingdomId).every((h) => index.kingdomById[h.kingdomId!]),
  'her kahramanın krallığı dizinde',
);
ok(
  index.clans.every((c) => !c.kingdomId || index.kingdomById[c.kingdomId]),
  'klanların krallık referansları geçerli',
);
ok(
  index.kingdoms.every((k) => k.rulerId && index.heroById[k.rulerId]),
  'her krallığın hükümdarı var',
);

/* 3. Gezinme */
let nav = createNav();
ok(routeKey(currentRoute(nav)) === 'HOME', 'başlangıç: HOME');
ok(!canGoBack(nav), 'ilk sayfada geri yok');

const hero = index.heroes[0];
nav = pushRoute(nav, { section: 'HEROES' });
nav = pushRoute(nav, { section: 'HERO', id: hero.id });
ok(routeKey(currentRoute(nav)) === `HERO:${hero.id}`, 'hero detayına gidildi');
ok(canGoBack(nav), 'detayda geri var');

const crumbs = breadcrumb(nav, index);
ok(crumbs.length === 3, `breadcrumb 3 kademe (${crumbs.map((c) => c.label).join(' / ')})`);
ok(crumbs[0].label === 'Ansiklopedi', 'breadcrumb başı Ansiklopedi');
ok(crumbs[2].label === hero.name, 'breadcrumb sonu kahraman adı');

// aynı sayfaya tekrar gitmek yığını büyütmez
const before = nav.stack.length;
nav = pushRoute(nav, { section: 'HERO', id: hero.id });
ok(nav.stack.length === before, 'aynı sayfaya tekrar gidiş yığını büyütmüyor');

nav = goBack(nav);
ok(routeKey(currentRoute(nav)) === 'HEROES', 'geri → HEROES');
nav = goBack(nav);
ok(routeKey(currentRoute(nav)) === 'HOME', 'geri → HOME');
nav = goBack(nav);
ok(routeKey(currentRoute(nav)) === 'HOME', 'ilk sayfada geri yığını bozmuyor');

// listeden listeye geçiş
let nav2 = createNav();
nav2 = jumpTo(nav2, { section: 'KINGDOM', id: index.kingdoms[0].id });
nav2 = jumpTo(nav2, { section: 'KINGDOM', id: index.kingdoms[1].id });
ok(nav2.stack.length === 2, 'aynı bölümde detaydan detaya geçiş yığını şişirmiyor');

/* 4. Arama */
const byName = searchEncyclopedia(index, hero.name.split(' ')[0].slice(0, 4));
ok(byName.length >= 1 && byName[0].kind === 'HERO', `ada göre arama (${byName.length} sonuç)`);
const byKingdom = searchEncyclopedia(index, index.kingdoms[0].name.split(' ')[0]);
ok(byKingdom.some((h) => h.kind === 'KINGDOM'), 'krallık adına göre arama');
const byClan = searchEncyclopedia(index, index.clans[0].name.split(' ')[0]);
ok(byClan.some((h) => h.kind === 'CLAN'), 'klan adına göre arama');
const settlement: Settlement = index.settlements[0];
const bySettlement = searchEncyclopedia(index, settlement.name);
ok(bySettlement.some((h) => h.kind === 'SETTLEMENT'), 'yerleşim adına göre arama');
ok(searchEncyclopedia(index, '').length === 0, 'boş arama sonuç döndürmüyor');
ok(searchEncyclopedia(index, 'zzzzqqq').length === 0, 'sonuçsuz arama boş dizi');

/* 5. Filtreler */
const all = filterHeroes(index, {});
ok(all.length === 40, `filtresiz 40 kayıt (${all.length})`);
const rulers = filterHeroes(index, { occupation: 'RULER' });
ok(rulers.length > 0 && rulers.every((h) => h.occupation === 'RULER'), `hükümdar filtresi (${rulers.length})`);
const ladies = filterHeroes(index, { occupation: 'LADY' });
ok(ladies.length > 0 && ladies.every((h) => h.occupation === 'LADY'), `leydi filtresi (${ladies.length})`);
const kingdomId = index.kingdoms[0].id;
const inKingdom = filterHeroes(index, { kingdomId });
ok(inKingdom.length > 0 && inKingdom.every((h) => h.kingdomId === kingdomId), `krallık filtresi (${inKingdom.length})`);

/* 6. Sıralama */
const byAge = filterHeroes(index, { sort: 'AGE' });
const ages = byAge.map((h) => ageOf(h, index.day));
ok(
  ages.every((v, i, arr) => i === 0 || arr[i - 1] <= v),
  'yaşa göre artan sıralama',
);
const rel = byAge.map((h) => h.relation);
ok(
  filterHeroes(index, { sort: 'RELATION' }).map((h) => h.relation).every((v, i, arr) => i === 0 || arr[i - 1] >= v),
  'ilişkiye göre azalan sıralama',
);
const names = filterHeroes(index, { sort: 'NAME' }).map((h) => h.name);
ok(
  names.every((n, i) => i === 0 || names[i - 1].localeCompare(n, 'tr') <= 0),
  'isme göre alfabetik sıralama',
);
console.log('   yaş aralığı:', Math.min(...ages), '–', Math.max(...ages), '· ilişki:', Math.min(...rel), '..', Math.max(...rel));

/* 7. Boş sorgu / kenar durumlar */
ok(filterHeroes(index, { query: '  ' }).length === 40, 'boşluklu sorgu tüm listeyi döndürür');
ok(filterHeroes(index, { kingdomId: 'yok-boyle-bir-sey' }).length === 0, 'geçersiz krallık filtresi boş dizi');
ok(
  breadcrumb(createNav(), index).length === 1 && breadcrumb(createNav(), index)[0].label === 'Ansiklopedi',
  'tek kademe breadcrumb',
);
ok(HOME_ROUTE.section === 'HOME', 'HOME_ROUTE sabiti');

console.log(fails === 0 ? '\n✅ ANSİKLOPEDİ MANTIĞI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
