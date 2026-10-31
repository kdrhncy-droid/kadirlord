import assert from 'node:assert/strict';
import { createInitialCampaignState } from '../src/game/rules';
import { LordLiveRouteState } from '../src/game/campaignSystem';
import {
  evaluateLordVsBanditTactics,
  resolveLordBanditClash,
  processLordVillageRecruiting,
} from '../src/game/lordBanditAi';
import { getTotalTroops } from '../src/game/rules';

console.log('🧪 Lord vs Haydut Taktik AI ve Asker Toplama Testi Başlatılıyor...');

const state = createInitialCampaignState();
const derthert = state.lords.find((l) => l.faction === 'vlandia')!;
const bandit = state.lords.find((l) => l.faction === 'bandits')!;
const village = state.settlements.find((s) => s.type === 'VILLAGE')!;

assert(derthert, 'Derthert bulunamadı');
assert(bandit, 'Haydut lord bulunamadı');
assert(village, 'Köy bulunamadı');

// 1. Lord haydutu yakında görünce kovalama kararı
const derthertRoute: LordLiveRouteState = {
  x: 10,
  z: 10,
  rotY: 0,
  targetSettlementId: null,
  waypoints: [],
  currentAction: 'Devriyede',
};

const banditRoute: LordLiveRouteState = {
  x: 22,
  z: 18,
  rotY: 0,
  targetSettlementId: null,
  waypoints: [],
  currentAction: 'Pusu kuruyor',
};

const positions = new Map<string, { x: number; z: number }>([
  [derthert.id, { x: 10, z: 10 }],
  [bandit.id, { x: 22, z: 18 }],
]);

const derthertTactics = evaluateLordVsBanditTactics({
  lord: derthert,
  route: derthertRoute,
  allLords: state.lords,
  lordPositions: positions,
});

assert.equal(derthertTactics.action, 'PURSUE', 'Güçlü lord yakındaki haydutu kovalamalı');
assert.equal(derthertTactics.targetLordId, bandit.id, 'Hedef haydut olmalı');
console.log('✓ [1/4] Lord yakındaki zayıf haydutu tespit edip PURSUE kararı aldı');

// 2. Haydut güçlü lordu görünce kaçma kararı
const banditTactics = evaluateLordVsBanditTactics({
  lord: bandit,
  route: banditRoute,
  allLords: state.lords,
  lordPositions: positions,
});

assert.equal(banditTactics.action, 'FLEE', 'Zayıf haydut güçlü lorddan kaçmalı');
assert.equal(banditTactics.targetLordId, derthert.id, 'Kaçılan hedef Derthert olmalı');
assert(banditTactics.targetPos, 'Kaçış hedef koordinatı olmalı');
console.log('✓ [2/4] Haydut güçlü lordu görünce FLEE kararı aldı ve ters yöne kaçtı');

// 3. Karşılaşma ve Muharebe Sonuçlandırma
const clashResult = resolveLordBanditClash(state, derthert, bandit);
assert.equal(clashResult.victorLordId, derthert.id, 'Derthert haydutu mağlup etmeli');
assert.equal(clashResult.defeatedLordId, bandit.id, 'Haydut mağlup olmalı');
assert(clashResult.events.length > 0, 'Savaş vakayiname olayı üretilmeli');

const updatedBandit = clashResult.nextState.lords.find((l) => l.id === bandit.id)!;
assert.equal(
  updatedBandit.armySize,
  getTotalTroops(updatedBandit.roster),
  'Bozguna uğrayan haydutun armySize ve roster toplamı senkron olmalı (Kural 1)',
);
assert(Math.abs(updatedBandit.x - (-62)) <= 4, 'Bozulan haydut Karageçit Hisarı eteklerine gönderilmeli');
console.log('✓ [3/4] Lord vs Haydut muharebesi tamamlandı; haydut dağıtıldı, Kural 1 doğrulandı');

// 4. Köyde Hareketsiz Asker Toplama Testi
const recruitingRoute: LordLiveRouteState = {
  x: village.x,
  z: village.z,
  rotY: 0,
  targetSettlementId: village.id,
  waypoints: [],
  currentAction: 'Köye vardı',
};

// İlk tik: Hareketsiz bekleme başlar
const recStep1 = processLordVillageRecruiting({
  lord: derthert,
  route: recruitingRoute,
  village,
  dt: 1.0,
  timeScale: 1.0,
});

assert.equal(recStep1.isFinished, false, 'İlk saniyede asker toplama hemen bitmemeli');
assert.equal(recruitingRoute.isWaiting, true, 'Lord asker toplarken hareketsiz (isWaiting: true) olmalı');
assert(recruitingRoute.recruitingTimer! > 0, 'Sayaç çalışmalı');
assert(
  recruitingRoute.currentAction.includes('asker topluyor'),
  'Aksiyon metninde "asker topluyor" yazmalı',
);

// 8 saniye sonra: Asker toplama biter
const recStep2 = processLordVillageRecruiting({
  lord: derthert,
  route: recruitingRoute,
  village,
  dt: 8.5,
  timeScale: 1.0,
});

assert.equal(recStep2.isFinished, true, 'Süre dolunca toplama bitmeli');
assert.equal(recruitingRoute.isWaiting, false, 'Lord yeniden harekete geçebilmeli');
assert.equal(recruitingRoute.recruitingTimer, undefined, 'Sayaç sıfırlanmalı');
assert(recStep2.recruitedRosterDelta, 'Yeni askerler teslim edilmeli');
console.log('✓ [4/4] Köyde hareketsiz durup asker toplama süreci başarıyla doğrulandı');

console.log('🎉 TÜM LORD VS HAYDUT VE ASKER TOPLAMA TESTLERİ BAŞARIYLA GEÇTİ!');
