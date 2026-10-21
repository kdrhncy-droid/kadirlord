/**
 * probe-items.ts — Faz B3: eşya kataloğu + SVG ikonlar
 *
 *   npx tsx scripts/probe-items.ts
 *
 * Bannerlord'un envanteri ~120 eşya + her biri için tek renkli ikon. Bu dilimde
 * katalog 29 → 60'a çıktı ve emoji ikonlar SVG'ye çevrildi.
 *
 * Arananlar:
 *  1. Katalog bütünlüğü: benzersiz id, kategori dağılımı, kademe/fiyat/ağırlık aralıkları.
 *  2. Her eşyanın ikonu `ITEM_ICON_KEYS` içinde ve `ItemIcon` gerçekten SVG üretiyor.
 *  3. Her teçhizat slotu için en az bir eşya var (çıplak slot yok).
 *  4. Emoji sızıntısı yok (veri + pazar arayüzü).
 *  5. Satın alma, ikonu envantere taşıyor.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CALRADIA_MARKETPLACE_ITEMS, buyMarketplaceItem } from '../src/game/marketRules.ts';
import { ITEM_ICON_KEYS, CATEGORY_ICON_KEYS } from '../src/game/itemIcons.ts';
import { ItemIcon } from '../src/components/ItemIcon.tsx';
import { createInitialCampaignState } from '../src/game/rules.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const items = CALRADIA_MARKETPLACE_ITEMS;
const byCategory = (c: string) => items.filter((i) => i.category === c);

/* ── 1. Katalog bütünlüğü ── */
ok(items.length >= 60, 'katalog en az 60 eşya', `${items.length}`);
ok(new Set(items.map((i) => i.id)).size === items.length, 'eşya kimlikleri benzersiz');
ok(new Set(items.map((i) => i.name)).size === items.length, 'eşya adları benzersiz');

const counts = {
  WEAPON: byCategory('WEAPON').length,
  SHIELD: byCategory('SHIELD').length,
  ARMOR: byCategory('ARMOR').length,
  FOOD: byCategory('FOOD').length,
  HORSE: byCategory('HORSE').length,
};
console.log('  dağılım:', JSON.stringify(counts));
ok(counts.WEAPON >= 12, 'en az 12 silah', `${counts.WEAPON}`);
ok(counts.SHIELD >= 6, 'en az 6 kalkan', `${counts.SHIELD}`);
ok(counts.ARMOR >= 15, 'en az 15 zırh', `${counts.ARMOR}`);
ok(counts.FOOD >= 14, 'en az 14 erzak/emtia', `${counts.FOOD}`);
ok(counts.HORSE >= 8, 'en az 8 binek', `${counts.HORSE}`);

const badTier = items.filter((i) => i.tier < 1 || i.tier > 6);
ok(badTier.length === 0, 'kademeler 1..6', `${badTier.length} aykırı`);
const badValue = items.filter((i) => !Number.isFinite(i.value) || i.value <= 0);
ok(badValue.length === 0, 'fiyatlar pozitif', `${badValue.length} aykırı`);
const badWeight = items.filter((i) => !Number.isFinite(i.weight) || i.weight < 0);
ok(badWeight.length === 0, 'ağırlıklar negatif değil', `${badWeight.length} aykırı`);

const mounts = byCategory('HORSE');
ok(
  mounts.every((i) => i.slot === 'MOUNT' || i.slot === 'HARNESS' || i.slot === 'TRADE'),
  'binekler MOUNT/HARNESS slotunda (katır ticari mal olarak da taşınır)',
);
ok(mounts.filter((i) => i.slot === 'MOUNT').every((i) => i.weight === 0), 'binekler ağırlıksız (yük sayılmaz)');
const goods = items.filter((i) => i.slot === 'TRADE' && i.category === 'FOOD');
ok(goods.length >= 15, 'ticari mal sayısı', `${goods.length}`);
ok(goods.every((i) => i.weight > 0), 'ticari malların ağırlığı var');

const priceByTier = new Map<number, number[]>();
for (const item of items) {
  if (item.slot === 'TRADE') continue;
  priceByTier.set(item.tier, [...(priceByTier.get(item.tier) ?? []), item.value]);
}
const tier1Avg = (priceByTier.get(1) ?? []).reduce((a, b) => a + b, 0) / ((priceByTier.get(1) ?? []).length || 1);
const tier5Avg = (priceByTier.get(5) ?? []).reduce((a, b) => a + b, 0) / ((priceByTier.get(5) ?? []).length || 1);
ok(tier5Avg > tier1Avg * 2, 'üst kademe eşya belirgin pahalı', `T1 ${Math.round(tier1Avg)} → T5 ${Math.round(tier5Avg)}`);

/* ── 2. İkonlar ── */
const usedKeys = new Set(items.map((i) => i.iconKey));
const unknown = items.filter((i) => !ITEM_ICON_KEYS.includes(i.iconKey));
ok(unknown.length === 0, 'her eşyanın ikon anahtarı tanımlı', `${unknown.length} bilinmeyen`);
ok(usedKeys.size >= 18, 'katalogda en az 18 farklı ikon kullanılıyor', `${usedKeys.size}`);

const uiOnlyKeys = new Set(['crate']);
const unusedKeys = ITEM_ICON_KEYS.filter((k) => !usedKeys.has(k) && !uiOnlyKeys.has(k));
ok(unusedKeys.length === 0, 'tanımlı ama kullanılmayan ikon yok', unusedKeys.join(', ') || 'yok');
ok(ITEM_ICON_KEYS.includes(CATEGORY_ICON_KEYS.ALL), 'arayüz ikonu (crate) da tanımlı');

const rendered = ITEM_ICON_KEYS.map((k) => renderToStaticMarkup(React.createElement(ItemIcon, { iconKey: k })));
ok(rendered.every((html) => html.includes('<svg') && html.length > 40), 'her ikon gerçek SVG üretiyor');
ok(new Set(rendered).size === rendered.length, 'ikonlar birbirinden farklı çizimler');
ok(rendered.every((html) => !html.includes('fill="currentColor"')), 'ikonlar çizgi stilinde (dolu leke yok)');

const catKeys = Object.values(CATEGORY_ICON_KEYS);
ok(catKeys.length === 6 && catKeys.every((k) => ITEM_ICON_KEYS.includes(k)), 'kategori ikonları tanımlı');

/* ── 3. Slot kapsaması ── */
const equipSlots = ['HEAD', 'SHOULDER', 'BODY', 'GLOVES', 'LEG', 'MOUNT', 'HARNESS', 'WEAPON1', 'WEAPON2', 'WEAPON3', 'WEAPON4'] as const;
for (const slot of equipSlots) {
  const n = items.filter((i) => i.slot === slot).length;
  ok(n >= 1, `slot dolu: ${slot}`, `${n} eşya`);
}
const banners = items.filter((i) => i.slot === 'BANNER');
ok(banners.length === 0, 'BANNER slotu pazarda satılmıyor (sancak oyuncuya ait)');

/* ── 4. Emoji sızıntısı ── */
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const emojiNames = items.filter((i) => emoji.test(i.name + i.description + i.statBonus));
ok(emojiNames.length === 0, 'eşya metinlerinde emoji yok', `${emojiNames.length} kayıt`);

/* ── 5. Satın alma ikonu taşıyor ── */
const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const axe = items.find((i) => i.id === 'mkt_iron_war_axe')!;
const purchase = buyMarketplaceItem({ ...campaign, gold: 5000 }, axe);
ok(purchase.success, 'eşya satın alınabiliyor');
const inv = purchase.nextState.inventoryItems ?? [];
const bought = inv.find((i) => i.name === axe.name);
ok(bought !== undefined, 'eşya envantere girdi');
ok(bought?.icon === axe.iconKey, 'envanter kaydı ikon anahtarını koruyor', String(bought?.icon));
ok(
  items.every((i) => i.iconKey.length > 0 && !/\s/.test(i.iconKey)),
  'ikon anahtarları boşluksuz',
);

console.log(fails === 0 ? '\n✅ EŞYA KATALOĞU VE İKONLAR DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
