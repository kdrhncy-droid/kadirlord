/**
 * probe-loot.ts — Faz B0: savaş ganimeti, emtia satışı ve atölye geliri
 *
 *   npx tsx scripts/probe-loot.ts
 *
 * Bannerlord'da zafer üç şey bırakır: altın, **eşya** ve esir. Önceden zafer
 * yalnız altın veriyordu; atölye satın almak ise hiç gelir getirmiyordu
 * (para bir kez gidiyor, karşılığı gelmiyordu). Bu probe üç akışı da sınar.
 */
import { createInitialCampaignState, CALRADIA_MARKETPLACE_ITEMS } from '../src/game/rules.ts';
import {
  resolveBattleOutcome,
  sellSurplusLootAtMarket,
  settlementWorkshopIncome,
  advanceDailyEconomyAndWorld,
  buyOrChangeWorkshop,
  calculateDailyWage,
} from '../src/game/rules.ts';
import { rollBattleLoot, battleGoldReward, describeLoot } from '../src/game/loot.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const base = () => createInitialCampaignState('Komutan Demirhan', 'noble');
const byId = (items: typeof CALRADIA_MARKETPLACE_ITEMS, name: string) => items.find((i) => i.name === name);

/* ── 1. Ganimet üretimi ── */
const state = base();
const small = rollBattleLoot(state, { enemyFaction: 'vlandia', defeated: 10 });
const medium = rollBattleLoot(state, { enemyFaction: 'vlandia', defeated: 40 });
const big = rollBattleLoot(state, { enemyFaction: 'vlandia', defeated: 90 });
const siege = rollBattleLoot(state, { enemyFaction: 'vlandia', defeated: 90, siege: true });

ok(small.length === 1, 'küçük çatışma 1 eşya bırakıyor', `${small.length}`);
ok(medium.length === 2, 'orta savaş 2 eşya bırakıyor', `${medium.length}`);
ok(big.length === 3, 'büyük savaş 3 eşya bırakıyor', `${big.length}`);
ok(siege.length === 4, 'kuşatma zaferi 4 eşya bırakıyor', `${siege.length}`);

const all = [...small, ...medium, ...big, ...siege];
ok(
  all.every((item) => byId(CALRADIA_MARKETPLACE_ITEMS, item.name) !== undefined),
  'her ganimet eşyası katalogdan geliyor',
);
ok(
  new Set(all.map((i) => i.id)).size === all.length,
  'ganimet kimlikleri benzersiz',
  `${all.length} eşya`,
);
ok(
  small.concat(medium).filter((i) => i.slot !== 'TRADE').every((i) => (i.tier ?? 1) <= 3),
  'küçük savaşta üst kademe eşya düşmüyor',
);
ok(big.every((i) => (i.tier ?? 1) <= 4), 'büyük savaşta kademe tavanı 4');
ok(
  all.every((item) => {
    const template = byId(CALRADIA_MARKETPLACE_ITEMS, item.name)!;
    return item.value === Math.round(template.value * 0.75);
  }),
  'ganimet satış değeri %75 (pazardaki alım fiyatıyla aynı mantık)',
);
ok(all.every((i) => i.icon && i.icon.length > 0), 'ganimet ikon anahtarını taşıyor');

/* ── 2. Determinizm ── */
const a = rollBattleLoot(state, { enemyFaction: 'sturgia', defeated: 55 });
const b = rollBattleLoot(state, { enemyFaction: 'sturgia', defeated: 55 });
ok(JSON.stringify(a) === JSON.stringify(b), 'aynı savaş → aynı ganimet');
const otherDay = rollBattleLoot({ ...state, day: state.day + 1 }, { enemyFaction: 'sturgia', defeated: 55 });
ok(JSON.stringify(a) !== JSON.stringify(otherDay), 'gün değişince ganimet değişiyor');
const otherFaction = rollBattleLoot(state, { enemyFaction: 'battania', defeated: 55 });
ok(JSON.stringify(a) !== JSON.stringify(otherFaction), 'düşman kültürü ganimeti değiştiriyor');

/* ── 3. Savaş sonucu envantere düşüyor ── */
const before = base();
const afterWin = resolveBattleOutcome(before, true, null, {}, 40);
const added = (afterWin.inventoryItems ?? []).length - (before.inventoryItems ?? []).length;
ok(added >= 1, 'zafer envantere eşya ekliyor', `+${added}`);
ok(afterWin.gold === before.gold + battleGoldReward(40, false), 'zafer altını yeni formülle hesaplanıyor', `${afterWin.gold - before.gold}`);
ok(afterWin.prisoners > before.prisoners, 'zafer esir de getiriyor', `+${afterWin.prisoners - before.prisoners}`);

const targetTown = before.settlements.find((s) => s.type === 'TOWN' && s.faction !== 'player')!;
const siegeWin = resolveBattleOutcome(before, true, null, {}, 60, targetTown.id);
ok(
  (siegeWin.inventoryItems ?? []).length > (afterWin.inventoryItems ?? []).length,
  'kuşatma zaferi daha çok ganimet bırakıyor',
);
ok(
  siegeWin.settlements.find((s) => s.id === targetTown.id)?.faction === 'player',
  'kuşatma zaferi mülkü oyuncuya geçiriyor',
  targetTown.name,
);

const defeat = resolveBattleOutcome(before, false, null, { militia: 2 }, 30);
ok((defeat.inventoryItems ?? []).length === (before.inventoryItems ?? []).length, 'yenilgide ganimet yok');

/* ── 4. Emtia satışı ── */
const town = before.settlements.find((s) => s.type === 'TOWN')!;
const withGoods = {
  ...before,
  inventoryItems: [
    ...(before.inventoryItems ?? []),
    {
      id: 'g1', name: 'Tuz Sandığı', slot: 'TRADE' as const, category: 'FOOD' as const,
      value: 40, weight: 5, statBonus: 'Ticaret', civilianLegal: true, tier: 1,
    },
    {
      id: 'g2', name: 'Yün Balyası', slot: 'TRADE' as const, category: 'FOOD' as const,
      value: 55, weight: 4, statBonus: 'Ticaret', civilianLegal: true, tier: 1,
    },
  ],
};
const sale = sellSurplusLootAtMarket(withGoods, town.id);
ok(sale.success, 'emtia satılabiliyor');
ok(sale.goldGained === 95, 'satış gerçek değeri ödüyor (40 + 55)', `${sale.goldGained}`);
ok(
  (sale.nextState.inventoryItems ?? []).every((i) => i.id !== 'g1' && i.id !== 'g2'),
  'satılan emtia çuvaldan düşüyor',
);
ok(
  (sale.nextState.inventoryItems ?? []).length === (before.inventoryItems ?? []).length,
  'kuşanılabilir eşyaya dokunulmuyor',
);

const emptySale = sellSurplusLootAtMarket(before, town.id);
ok(!emptySale.success && emptySale.goldGained === 0, 'çuval boşsa satış reddediliyor', emptySale.reason ?? '');
ok(emptySale.nextState === before, 'başarısız satışta durum değişmiyor');

/* ── 5. Atölye geliri ── */
const noShop = { ...town, workshopType: undefined, workshopOwner: undefined, prosperity: 800 };
ok(settlementWorkshopIncome(noShop) === 0, 'atölyesiz şehirde gelir yok');

const brewery = settlementWorkshopIncome({ ...noShop, workshopType: 'BREWERY' });
const smithy = settlementWorkshopIncome({ ...noShop, workshopType: 'SMITHY' });
ok(brewery === 20 + Math.round(800 * 0.08), 'gelir refaha bağlı', `${brewery}`);
ok(smithy > brewery, 'demirci atölyesi bira fabrikasından kârlı', `${smithy} > ${brewery}`);
ok(
  settlementWorkshopIncome({ ...noShop, workshopType: 'BREWERY', prosperity: 900 }) > brewery,
  'refah artınca gelir artıyor',
);

const bought = buyOrChangeWorkshop({ ...before, gold: 5000 }, town.id, 'SMITHY');
ok(bought.success, 'atölye satın alınabiliyor');
const shopTown = bought.nextState.settlements.find((s) => s.id === town.id)!;
ok(shopTown.workshopOwner === 'player', 'satın alınca atölye oyuncunun oluyor');

const beforeDaily = bought.nextState.gold;
const daily = advanceDailyEconomyAndWorld(bought.nextState);
const wage = calculateDailyWage(bought.nextState.roster);
const income = settlementWorkshopIncome(shopTown);
ok(
  daily.gold === Math.max(0, beforeDaily + 0 - wage + income) || daily.gold > beforeDaily - wage,
  'günlük tick atölye gelirini ekliyor',
  `${beforeDaily} → ${daily.gold} (maaş ${wage}, atölye ${income})`,
);

const enemyTown = { ...town, faction: 'vlandia' as const };
const enemyShop = {
  ...before,
  settlements: before.settlements.map((s) => (s.id === town.id ? { ...enemyTown, workshopType: 'SMITHY' as const, workshopOwner: 'player' as const } : s)),
};
const enemyDaily = advanceDailyEconomyAndWorld(enemyShop);
ok(
  enemyDaily.gold >= enemyShop.gold - wage + income,
  'düşman şehrindeki oyuncu atölyesi de gelir getiriyor (Bannerlord kuralı)',
);

/* ── 6. Özet metni ── */
ok(describeLoot([]) === 'ganimet alınamadı', 'boş ganimet metni');
ok(describeLoot(small) === `1 ganimet eşyası (${small[0].name})`, 'tek eşya metni');
ok(big.length > 1 && describeLoot(big).includes('ve diğerleri'), 'çok eşya metni');

console.log(fails === 0 ? '\n✅ GANİMET VE ATÖLYE GELİRİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
