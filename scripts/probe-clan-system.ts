/**
 * probe-clan-system.ts — Bannerlord Klan Sistemi Sözleşme ve Doğrulama Testi
 *
 *   npx tsx scripts/probe-clan-system.ts
 */

import { createInitialCampaignState } from '../src/game/rules.ts';
import {
  CLAN_ROLES_CATALOG,
  assignClanRole,
  assignSettlementGovernor,
  calculateClanDailyFinance,
  changeClanName,
  getClanFiefs,
  getClanHeroes,
  getPlayerClanSummary,
} from '../src/game/clanSystem.ts';

let fails = 0;
const assert = (condition: boolean, msg: string) => {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    fails++;
  } else {
    console.log(`✓ ${msg}`);
  }
};

console.log('🧪 Bannerlord Klan Sistemi (ClanModal & clanSystem) Test Ediliyor...\n');

const state = createInitialCampaignState('Komutan Demirhan', 'noble');

// 1. Klan Özeti ve Kademe Testi
const summary = getPlayerClanSummary(state);
assert(summary.renown === 65, 'Başlangıç namı 65 olarak okunuyor');
assert(summary.tier === 1, '65 nam ile Klan Kademesi 1');
assert(summary.maxParties === 1, 'Kademe 1 için maksimum savaş partisi 1');
assert(summary.maxCompanions === 4, 'Kademe 1 için yoldaş sınırı 4');
assert(summary.maxWorkshops === 2, 'Kademe 1 için atölye sınırı 2');
assert(summary.progressPercent >= 0 && summary.progressPercent <= 100, 'Nam ilerleme yüzdesi 0-100 arasında');

// 2. Klan Adı Değiştirme
const updatedNameState = changeClanName(state, 'Kurtboğan Sancağı');
const updatedSummary = getPlayerClanSummary(updatedNameState);
assert(updatedSummary.clanName === 'Kurtboğan Sancağı', 'Klan adı başarıyla güncellendi');

// 3. Klan Üyeleri & 4 Klan Rolü
const heroes = getClanHeroes(state);
assert(heroes.length >= 1, 'En azından başkomutan klan üyeleri arasında');
const playerHero = heroes.find((h) => h.kind === 'PLAYER');
assert(playerHero !== undefined, 'Başkomutan PLAYER tipinde mevcut');

// 4 Klan Rolü kataloğu
assert(CLAN_ROLES_CATALOG.length === 4, '4 resmi Bannerlord klan rolü tanımlı');
assert(
  CLAN_ROLES_CATALOG.some((r) => r.id === 'QUARTERMASTER' && r.skillId === 'steward'),
  'İaşeci rolü İdare becerisine bağlı',
);
assert(
  CLAN_ROLES_CATALOG.some((r) => r.id === 'SCOUT' && r.skillId === 'scouting'),
  'İzci rolü İzcilik becerisine bağlı',
);
assert(
  CLAN_ROLES_CATALOG.some((r) => r.id === 'SURGEON' && r.skillId === 'medicine'),
  'Cerrah rolü Hekimlik becerisine bağlı',
);
assert(
  CLAN_ROLES_CATALOG.some((r) => r.id === 'ENGINEER' && r.skillId === 'engineering'),
  'Mühendis rolü Mühendislik becerisine bağlı',
);

// Rol atama testi
const stateWithRoles = assignClanRole(state, 'QUARTERMASTER', playerHero!.id);
assert(stateWithRoles.clanRoles?.QUARTERMASTER === playerHero!.id, 'İaşeci rolü oyuncuya atandı');
const stateUnassigned = assignClanRole(stateWithRoles, 'QUARTERMASTER', null);
assert(stateUnassigned.clanRoles?.QUARTERMASTER === undefined, 'İaşeci rolü boşaltıldı');

// 4. Vali Ataması Testi
const zeonica = state.settlements.find((s) => s.id === 'zeonica_west')!;
const govResult = assignSettlementGovernor(state, zeonica.id, playerHero!.id);
assert(govResult.success, 'Vali ataması başarılı');
const updatedZeonica = govResult.nextState.settlements.find((s) => s.id === zeonica.id)!;
assert(
  (updatedZeonica as any).governorHeroId === playerHero!.id,
  'Yerleşime vali olarak oyuncu atandı',
);

// 5. Klan Günlük Finans Tablosu Testi
const finance = calculateClanDailyFinance(state);
assert(finance.expenses.mainPartyWage >= 0, 'Ana birlik maaşı hesaplandı');
assert(typeof finance.netDailyChange === 'number', 'Net günlük değişim bir sayı');
assert(finance.incomes.totalIncome >= 0, 'Toplam gelir hesaplandı');
assert(finance.expenses.totalExpense >= 0, 'Toplam gider hesaplandı');

console.log(`\nTest Sonucu: ${fails === 0 ? 'TÜM TESTLER GEÇTİ ✅' : `${fails} TEST BAŞARISIZ ❌`}`);
process.exit(fails === 0 ? 0 : 1);
