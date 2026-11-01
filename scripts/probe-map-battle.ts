/**
 * scripts/probe-map-battle.ts — AI-AI Map Battles ve Müdahale Sistemi Doğrulama Probu
 */
import assert from 'node:assert/strict';
import { createInitialCampaignState, getTotalTroops } from '../src/game/rules.ts';
import {
  areFactionsAtWar,
  areLordsHostileToEachOther,
  checkAiLordEngagements,
  tickMapBattles,
  getMapBattleInterventionInfo,
  type MapBattleEvent,
} from '../src/game/mapBattle.ts';

console.log('[PROBE-MAP-BATTLE] AI-AI Harita Muharebeleri testi başlıyor...');

const state = createInitialCampaignState('Test Commander', 'noble');

// 1. Savaş & Düşmanlık Kontrolü
const banditLord = state.lords.find((l) => l.faction === 'bandits');
const vlandiaLord = state.lords.find((l) => l.faction === 'vlandia');
const battaniaLord = state.lords.find((l) => l.faction === 'battania');
const secondVlandiaLord = state.lords.find((l) => l.faction === 'vlandia' && l.id !== vlandiaLord?.id);

assert.ok(banditLord, 'Bandit lord bulunamadı');
assert.ok(vlandiaLord, 'Vlandia lord bulunamadı');

// Haydut vs Lord her zaman hostile'dır
assert.equal(
  areLordsHostileToEachOther(banditLord, vlandiaLord, state),
  true,
  'Haydut ve lord birbirine düşman olmalı',
);

// Aynı krallık lordları asla hostile olmamalı
if (secondVlandiaLord) {
  assert.equal(
    areLordsHostileToEachOther(vlandiaLord, secondVlandiaLord, state),
    false,
    'Aynı krallıktaki iki lord hostile olamaz',
  );
}

// 2. Çarpışma Tespiti (checkAiLordEngagements)
const lordPositions = new Map<string, { x: number; z: number }>();
lordPositions.set(banditLord.id, { x: 100, z: 100 });
lordPositions.set(vlandiaLord.id, { x: 102, z: 100 }); // Mesafe: 2.0m (<= 3.8m)

const cooldowns = new Map<string, number>();

const engagementResult = checkAiLordEngagements({
  state,
  lordPositions,
  currentBattles: [],
  cooldowns,
  nowSec: 10,
  engagementRadius: 3.8,
});

assert.equal(engagementResult.newEvents.length, 1, 'Yakınlaşan düşmanlar savaş başlatmalı');
const battle = engagementResult.newEvents[0];
assert.equal(battle.status, 'ACTIVE');
assert.equal(battle.attackerId, banditLord.id);
assert.equal(battle.defenderId, vlandiaLord.id);
assert.equal(battle.attackerArmy, banditLord.armySize);
assert.equal(battle.defenderArmy, vlandiaLord.armySize);

console.log(`[PROBE-MAP-BATTLE] Başlatılan muharebe: ${battle.attackerName} (${battle.attackerArmy}) vs ${battle.defenderName} (${battle.defenderArmy})`);

// 3. Zaman Akışı & Asker Zayiatı (tickMapBattles)
let currentState = state;
let currentBattles = [battle];

// Simüle et: 3 saniye geçsin
const tick1 = tickMapBattles({
  state: currentState,
  battles: currentBattles,
  dt: 3.0,
  timeScale: 1.0,
});

currentState = tick1.nextState;
currentBattles = tick1.nextBattles;

assert.equal(currentBattles.length, 1, 'Savaş henüz devam ediyor olmalı');
const updatedBattle = currentBattles[0];
assert.ok(
  updatedBattle.attackerArmy < battle.attackerInitialArmy ||
  updatedBattle.defenderArmy < battle.defenderInitialArmy,
  'Zayiat düşmüş olmalı',
);

// Kural 1: Lordun armySize'ı ve roster toplamı senkron olmalı!
const lordInState = currentState.lords.find((l) => l.id === battle.attackerId)!;
assert.equal(lordInState.armySize, updatedBattle.attackerArmy, 'Lord armySize battle ile senkron olmalı');
if (lordInState.roster) {
  assert.equal(getTotalTroops(lordInState.roster), lordInState.armySize, 'Kural 1: Roster toplamı armySize ile eşleşmeli');
}

// 4. Zafer ve Esir Düşme Simülasyonu
// Ordulardan birini zayıflatıp sonlandırıcı darbe vurulmasını test et
const lowBattle: MapBattleEvent = {
  ...updatedBattle,
  attackerArmy: 20,
  defenderArmy: 5,
};
const defLord = currentState.lords.find((l) => l.id === vlandiaLord.id)!;
defLord.armySize = 5;
if (defLord.roster) {
  defLord.roster = { infantry: 5, archer: 0, cavalry: 0, horseArcher: 0 };
}

const tickEnd = tickMapBattles({
  state: currentState,
  battles: [lowBattle],
  dt: 3.0,
  timeScale: 1.0,
});

assert.equal(tickEnd.concludedBattles.length, 1, 'Biri <=4 askere inince savaş sonuçlanmalı');
const conclusion = tickEnd.concludedBattles[0];
assert.equal(conclusion.winnerId, banditLord.id);
assert.equal(conclusion.loserId, vlandiaLord.id);

const defeatedLord = tickEnd.nextState.lords.find((l) => l.id === vlandiaLord.id)!;
assert.equal(defeatedLord.characterState, 'CAPTIVE', 'Kaybeden lord esir düşmeli');
assert.equal(defeatedLord.captorId, banditLord.id, 'Esir alan lord kaydedilmeli');
assert.ok(tickEnd.nextState.chronicle.some((c) => c.text.includes(vlandiaLord.name)), 'Kronik kaydı eklenmiş olmalı');

// 5. Oyuncu Müdahale Bilgisi (getMapBattleInterventionInfo)
const intervention = getMapBattleInterventionInfo(battle, state);
assert.ok(intervention, 'Müdahale bilgisi üretilmeli');
console.log(`[PROBE-MAP-BATTLE] Müdahale tavsiyesi: ${intervention.recommendation}`);

console.log('[PROBE-MAP-BATTLE] Tüm testler başarıyla geçti! ✓');
