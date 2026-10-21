/**
 * probe-market.ts — Faz 7: pazaryeri ekonomisinin sözleşmesi
 *
 *   npx tsx scripts/probe-market.ts
 */
import { CALRADIA_MARKETPLACE_ITEMS, createInitialCampaignState } from '../src/game/rules.ts';
import {
  addPurchase,
  addSale,
  buildMarketStock,
  buyPriceAt,
  cappedSale,
  carryCapacity,
  emptySession,
  marketProfile,
  priceTone,
  sellPriceAt,
  sellableItems,
  tradeRumours,
  validateMarketProfile,
} from '../src/game/market.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const town = campaign.settlements.find((s) => s.type === 'TOWN')!;
const village = campaign.settlements.find((s) => s.type === 'VILLAGE')!;
const poor = { ...village, prosperity: 800 };
const rich = { ...town, prosperity: 11000 };

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* 1. Profil */
const pTown = marketProfile(town);
ok(validateMarketProfile(pTown).length === 0, 'şehir profili tutarlı', validateMarketProfile(pTown).join('|'));
ok(pTown.merchantGold > 800, 'tüccar kesesi pozitif', `${pTown.merchantGold}`);
const pVillage = marketProfile(village);
ok(pVillage.stockFactor < pTown.stockFactor, 'köyde stok çeşidi şehirden az');
const pRich = marketProfile(rich);
const pPoor = marketProfile(poor);
ok(pRich.modifier > pPoor.modifier, 'zengin şehirde fiyat daha yüksek',
  `${pRich.modifier} > ${pPoor.modifier}`);
ok(pRich.merchantGold > pPoor.merchantGold, 'zengin şehirde tüccar daha zengin');

/* determinizm */
const again = marketProfile(town);
ok(again.modifier === pTown.modifier && again.merchantGold === pTown.merchantGold, 'profil deterministik');

/* 2. Fiyatlar */
const sword = CALRADIA_MARKETPLACE_ITEMS.find((i) => i.category === 'WEAPON')!;
const buy = buyPriceAt(sword, pTown);
const sell = sellPriceAt(sword, pTown);
ok(buy > 0 && sell > 0, 'alış/satış fiyatı pozitif');
ok(sell < buy, 'satış fiyatı alıştan düşük (lonca payı)');
ok(Math.abs(sell / buy - 0.72) < 0.02, 'satış oranı ~%72');

/* ton */
ok(priceTone(80, 100) === 'CHEAP', 'düşük fiyat yeşil');
ok(priceTone(100, 100) === 'FAIR', 'taban fiyat nötr');
ok(priceTone(130, 100) === 'PRICEY', 'yüksek fiyat kırmızı');

/* 3. Stok */
const stock = buildMarketStock(CALRADIA_MARKETPLACE_ITEMS, pTown);
ok(stock.length > 0, 'tezgahta mal var', `${stock.length}`);
ok(stock.every((s) => s.quantity >= 1 && s.quantity <= 3), 'adet 1..3');
ok(stock.every((s) => s.buyPrice > 0), 'her malın fiyatı var');
ok(stock.some((s) => s.tone === 'CHEAP') || stock.some((s) => s.tone === 'PRICEY'), 'tonlar çeşitli');
const stockVillage = buildMarketStock(CALRADIA_MARKETPLACE_ITEMS, pVillage);
ok(stockVillage.length <= stock.length, 'köy tezgahı şehirden küçük/eşit');
ok(
  CALRADIA_MARKETPLACE_ITEMS.filter((i) => i.category === 'FOOD').every((food) =>
    stockVillage.some((s) => s.item.id === food.id),
  ),
  'erzak her yerde bulunur',
);

/* 4. Söylentiler */
const rumours = tradeRumours(campaign, sword, town, [village.id], 3);
ok(rumours.length === 3, '3 söylenti döndü', `${rumours.length}`);
ok(rumours.every((r) => r.settlementId !== town.id), 'kendi şehri söylentide yok');
ok(rumours.every((r) => r.price > 0), 'söylenti fiyatları pozitif');
ok(rumours.every((r) => ['CHEAP', 'FAIR', 'PRICEY'].includes(r.tone)), 'söylenti tonu geçerli');

/* 5. Kilit & toplu satış */
const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
ok(sellableItems(items, ['b']).length === 2, 'kilitli eşya satış listesinden çıkar');
ok(sellableItems(items, ['a', 'b', 'c']).length === 0, 'hepsi kilitliyse satış yok');

/* 6. Tüccar altını satışı sınırlar */
ok(cappedSale(500, 300).paid === 300, 'tüccar kesesi satışı sınırlar');
ok(cappedSale(500, 300).shortfall === 200, 'eksik kalan tutar bildirilir');
ok(cappedSale(100, 900).paid === 100, 'kese yeterliyse tamamı ödenir');

/* 7. Seans özeti */
let sess = emptySession();
sess = addPurchase(sess, 120);
ok(sess.net === -120, 'alış net sonucu eksi');
sess = addSale(sess, 200);
ok(sess.net === 80, 'satış sonrası net pozitif');
ok(sess.itemsBought === 1 && sess.itemsSold === 1, 'seans sayaçları doğru');

/* 8. Taşıma kapasitesi */
ok(carryCapacity(10, 0) > carryCapacity(5, 0), 'asker arttıkça kapasite artar');
ok(carryCapacity(0, 3) > carryCapacity(0, 0), 'yük hayvanı kapasiteyi artırır');

console.log(fails === 0 ? '\n✅ PAZARYERİ EKONOMİSİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
