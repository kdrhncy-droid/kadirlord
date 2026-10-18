import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialCampaignState,
  getTotalTroops,
  calculatePartyStrength,
  calculateDailyWage,
  recruitUnit,
  buyFoodAtSettlement,
  advanceDailyEconomyAndWorld,
  computeMeleeDamage,
  resolveBattleOutcome,
} from './rules.ts';
import {
  getBiomeAt,
  getPartySpeedInfo,
  computeBannerlordCameraTransform,
} from './mapGen.ts';

test('initial campaign state creates balanced troops, 42 continental settlements, and 9 lords', () => {
  const state = createInitialCampaignState('Komutan Alparslan', 'noble');
  assert.equal(state.playerName, 'Komutan Alparslan');
  assert.equal(getTotalTroops(state.roster), 17);
  assert.equal(state.settlements.length, 42);
  assert.equal(state.lords.length, 9);
  assert.ok(calculatePartyStrength(state.roster) > 250);
});

test('recruitUnit deducts gold, increments troop count, and updates settlement pool', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const initialGold = state.gold;
  const initialCavalry = state.roster.cavalry;

  const result = recruitUnit(state, 'sancaktepe', 'cavalry', 2);
  assert.equal(result.success, true);
  assert.equal(result.nextState.roster.cavalry, initialCavalry + 2);
  assert.equal(result.nextState.gold, initialGold - 85 * 2);

  const sancaktepe = result.nextState.settlements.find((s) => s.id === 'sancaktepe')!;
  assert.equal(sancaktepe.recruitPool.cavalry, 1);
});

test('buyFoodAtSettlement increases party food and deducts gold', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'steppe');
  const res = buyFoodAtSettlement(state, 'sancaktepe', 5);
  assert.equal(res.success, true);
  assert.equal(res.nextState.food, state.food + 5);
  assert.equal(res.nextState.gold, state.gold - 30);
});

test('advanceDailyEconomyAndWorld advances day, collects fief taxes, and pays wages', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const wage = calculateDailyWage(state.roster);
  const next = advanceDailyEconomyAndWorld(state);
  assert.equal(next.day, 2);
  // Player owns sancaktepe (prosperity 340 -> tax 85)
  assert.equal(next.gold, state.gold + Math.round(340 * 0.25) - wage);
});

test('computeMeleeDamage accounts for heavy strikes, armor defense, and shield block', () => {
  const normalHit = computeMeleeDamage(30, 10, false, false, 1.0);
  const heavyHit = computeMeleeDamage(30, 10, true, false, 1.2);
  const blockedHit = computeMeleeDamage(30, 10, false, true, 1.0);

  assert.ok(heavyHit > normalHit);
  assert.ok(blockedHit < normalHit);
});

test('resolveBattleOutcome awards renown, gold loot, prisoners, and conquers settlement on victory', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const afterVictory = resolveBattleOutcome(
    state,
    true,
    'lord-kargi',
    { militia: 1 },
    12,
    'karagecit',
  );

  assert.equal(afterVictory.battlesWon, 1);
  assert.ok(afterVictory.gold > state.gold);
  assert.ok(afterVictory.renown > state.renown);
  assert.ok(afterVictory.prisoners > 0);
  const conquered = afterVictory.settlements.find((s) => s.id === 'karagecit')!;
  assert.equal(conquered.faction, 'player');
});

test('continental biomes and imperial road speed bonuses calculate accurately across 1200x900 Calradia', () => {
  assert.equal(getBiomeAt(0, -280), 'NORTH_SNOW_PEAKS');
  assert.equal(getBiomeAt(320, 40), 'EAST_STEPPE');
  assert.equal(getBiomeAt(80, 310), 'SOUTH_DESERT');

  // Point directly on imperial road (-18, 12) vs deep snow mountains (-45, -310)
  const roadSpeed = getPartySpeedInfo(-18, 12, 0.25);
  const snowSpeed = getPartySpeedInfo(-45, -310, 0.25);
  assert.equal(roadSpeed.onRoad, true);
  assert.ok(roadSpeed.multiplier > snowSpeed.multiplier);
});

test('Bannerlord strategic camera pitch scales smoothly with zoom distance up to 510m continental view', () => {
  const closeCam = computeBannerlordCameraTransform(0, 2, 0, 0, 22);
  const farCam = computeBannerlordCameraTransform(0, 2, 0, 0, 440);

  assert.ok(farCam.pitchRad > closeCam.pitchRad);
  assert.ok(farCam.camY > closeCam.camY);
});
