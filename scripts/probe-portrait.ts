/**
 * probe-portrait.ts — Baked portre hattı (Faz 1c) doğrulaması
 *
 *   npx tsx scripts/probe-portrait.ts
 *
 * Node'da `document`/WebGL yoktur; bu yüzden burada **hattın mantığı** doğrulanır:
 *  - önbellek anahtarı deterministik ve 40 kahramanda tekil,
 *  - WebGL yokken `requestPortrait` sessizce `null` döner (çökmez),
 *  - `resetPortraitCache` temizler ve tekrar denemeyi mümkün kılar,
 *  - arayüz WebGL yokken **baş harf rozetine** düşer (ekran bozulmaz).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import {
  getCachedPortrait,
  portraitCacheKey,
  requestPortrait,
  resetPortraitCache,
  PORTRAIT_W,
  PORTRAIT_H,
} from '../src/game/portraitRenderer.ts';
import { HeroPortrait } from '../src/components/encyclopedia/HeroPortrait.tsx';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const heroes = Object.values(buildHeroRegistry(campaign, factionNames).heroes);

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* 1. Boyut sözleşmesi */
ok(PORTRAIT_W === 256 && PORTRAIT_H === 320, 'portre 256×320 (4:5)', `${PORTRAIT_W}×${PORTRAIT_H}`);

/* 2. Anahtar deterministik + tekil */
const keys = heroes.map((h) => portraitCacheKey(h));
ok(new Set(keys).size === keys.length, 'her kahramanın anahtarı tekil', `${keys.length} kahraman`);
ok(portraitCacheKey(heroes[0]) === portraitCacheKey(heroes[0]), 'anahtar deterministik');
ok(
  portraitCacheKey(heroes[0]) !== portraitCacheKey(heroes[1]),
  'farklı kahraman → farklı anahtar',
);

/* 3. WebGL yokken güvenli geri düşme */
ok(getCachedPortrait(heroes[0]) === null, 'başlangıçta önbellek boş');
resetPortraitCache();

const results = await Promise.all(heroes.map((h) => requestPortrait(h)));
ok(results.length === heroes.length, 'tüm istekler çözüldü (çökme yok)');
ok(
  results.every((r) => r === null),
  'WebGL yok → null (baş harf rozetine düşer)',
);
ok(getCachedPortrait(heroes[0]) === null, 'başarısız üretim önbelleğe yazılmadı');

/* 4. Aynı kahraman için tek iş */
const [a, b] = await Promise.all([requestPortrait(heroes[0]), requestPortrait(heroes[0])]);
ok(a === b, 'aynı kahraman → aynı sonuç (pending paylaşımı)');

/* 5. Arayüz geri düşmesi ekranı bozmuyor */
const html = renderToStaticMarkup(
  React.createElement(HeroPortrait, { hero: heroes[0], width: 36, square: true }),
);
ok(html.includes(heroes[0].name), 'rozet erişilebilir ad taşıyor');
ok(html.includes('width:36px'), 'liste rozeti 36px');
ok(html.includes(heroes[0].bannerColor), 'rozet sancak rengini kullanıyor');
ok(!html.includes('<img'), 'WebGL yokken <img> üretilmiyor (SSR uyumlu)');

const detailHtml = renderToStaticMarkup(
  React.createElement(HeroPortrait, { hero: heroes[0], width: 208 }),
);
ok(detailHtml.includes('height:260px'), 'detay portresi 4:5 oranında', '208×260');

/* 6. Sıfırlama tekrar denemeye izin veriyor */
resetPortraitCache();
ok(getCachedPortrait(heroes[0]) === null, 'resetPortraitCache sonrası önbellek temiz');

console.log(fails === 0 ? '\n✅ PORTRE HATTI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
