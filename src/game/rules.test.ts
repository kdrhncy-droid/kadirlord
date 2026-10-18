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
  CONTINENTAL_BRIDGES,
  getBiomeAt,
  getPartySpeedInfo,
  groundHeightAt,
  clampCameraFocus,
  computeBannerlordCameraTransform,
} from './mapGen.ts';
import {
  computeLandPath,
  computeLordPatrolPos,
  isNavigableLandAt,
  snapToNearestLand,
  stepAlongLandOnly,
} from './navigation.ts';

test('initial campaign state creates balanced troops, 74 authentic continental settlements (Towns, Castles, Villages) on dry ground, and 9 lords', () => {
  const state = createInitialCampaignState('Komutan Alparslan', 'noble');
  assert.equal(state.playerName, 'Komutan Alparslan');
  assert.equal(getTotalTroops(state.roster), 17);
  assert.equal(state.settlements.length, 74);
  assert.equal(state.lords.length, 9);
  assert.ok(calculatePartyStrength(state.roster) > 250);

  const towns = state.settlements.filter((s) => s.type === 'TOWN');
  const castles = state.settlements.filter((s) => s.type === 'CASTLE');
  const villages = state.settlements.filter((s) => s.type === 'VILLAGE');
  assert.ok(towns.length >= 25, 'Should include authentic Calradia Towns');
  assert.ok(castles.length >= 14, 'Should include authentic Calradia Castles');
  assert.ok(villages.length >= 8, 'Should include authentic Calradia Villages');

  // Every single settlement must sit on dry land above water
  for (const s of state.settlements) {
    const h = groundHeightAt(s.x, s.z);
    assert.ok(
      h > 0.5,
      `Settlement ${s.name} (${s.type}) at (${s.x}, ${s.z}) should be on dry land, got height=${h}`,
    );
  }
});

test('authentic Calradia map boundaries: West is ocean, while North-East, East, and South borders are solid land/mountains', () => {
  // West of Vlandia (left border) is Great Western Ocean
  assert.ok(groundHeightAt(-580, -40) < 0, 'West of Galend/Pravend must be ocean');
  // North-West (above Ostican/Revyl) and Gulf of Varcheg are sea
  assert.ok(groundHeightAt(-145, -295) < 0, 'Gulf of Varcheg must be water');
  // North-Center & North-East (above Sibir, Tyal, Baltakhand) must be solid snow mountains, NOT ocean!
  assert.ok(
    groundHeightAt(190, -420) > 4.0,
    'North of Tyal/Sibir must be solid snowy mountains, not ocean',
  );
  // East border (right of Ortongard, Chaikand, Odokh) must be solid steppe/mountains, NOT ocean!
  assert.ok(
    groundHeightAt(460, -20) > 4.0,
    'East of Khuzait must be solid steppe mountains, not ocean',
  );
  // South border (below Sanala, Qasira, Razih, Husn Fulq) must be solid Nahasa desert, NOT ocean!
  assert.ok(
    groundHeightAt(60, 440) > 2.0,
    'South of Aserai must be solid desert/mountains, not ocean',
  );
});

test('players and lords cannot walk across seas or lakes, and cross-sea paths route via land bridges/isthmuses', () => {
  // Center of Perassic Sea (-60, 195) is non-navigable water
  assert.equal(isNavigableLandAt(-60, 195), false, 'Perassic Sea center must not be navigable');

  // Clicking on the middle of the Perassic Sea snaps destination to nearest dry land
  const snapped = snapToNearestLand(-60, 195);
  assert.equal(
    isNavigableLandAt(snapped.x, snapped.z),
    true,
    `Snapped target (${snapped.x}, ${snapped.z}) must be on dry land`,
  );

  // Marching from Zeonica (-105, 138) across Perassic Sea to Sanala (-108, 248) routes via multi-waypoint land/bridge path
  const waypoints = computeLandPath(-105, 138, -108, 248);
  assert.ok(
    waypoints.length >= 2,
    'Cross-sea march from Zeonica to Sanala must use bridge/isthmus waypoints instead of straight line over water',
  );
  for (const wp of waypoints) {
    assert.equal(
      isNavigableLandAt(wp.x, wp.z),
      true,
      `Waypoint (${wp.x}, ${wp.z}) must be on navigable land or bridge`,
    );
  }

  // Stepping toward deep water stops or slides along dry coastline, never entering water
  const stepIntoSea = stepAlongLandOnly(-105, 145, -60, 195, 25);
  assert.equal(
    isNavigableLandAt(stepIntoSea.x, stepIntoSea.z),
    true,
    'Player step must remain on navigable land',
  );

  // Patrolling lords always stay on dry land around all 360 degrees
  const state = createInitialCampaignState('Komutan Alparslan', 'noble');
  for (const lord of state.lords) {
    for (let a = 0; a < 8; a++) {
      const pos = computeLordPatrolPos(lord.x, lord.z, (a * Math.PI) / 4, 7.2);
      assert.equal(
        isNavigableLandAt(pos.x, pos.z),
        true,
        `Lord ${lord.name} patrol position (${pos.x}, ${pos.z}) must stay on dry land`,
      );
    }
  }
});

test('all stone bridges span across river channels with dry land approaches', () => {
  assert.ok(CONTINENTAL_BRIDGES.length >= 8);
  for (const b of CONTINENTAL_BRIDGES) {
    assert.equal(
      isNavigableLandAt(b.x, b.z),
      true,
      `Bridge ${b.id} at (${b.x}, ${b.z}) must be navigable`,
    );
  }
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

test('continental biomes and imperial road speed bonuses calculate accurately across Calradia', () => {
  assert.equal(getBiomeAt(0, -280), 'NORTH_SNOW_PEAKS');
  assert.equal(getBiomeAt(320, 40), 'EAST_STEPPE');
  assert.equal(getBiomeAt(80, 310), 'SOUTH_DESERT');

  // Point directly on imperial road (4, 98) vs deep snow mountains (-45, -310)
  const roadSpeed = getPartySpeedInfo(4, 98, 0.25);
  const snowSpeed = getPartySpeedInfo(-45, -310, 0.25);
  assert.equal(roadSpeed.onRoad, true);
  assert.ok(roadSpeed.multiplier > snowSpeed.multiplier);
});

test('Bannerlord strategic camera pitch and frustum clamping prevent void exposure at 860m continental view', () => {
  const closeCam = computeBannerlordCameraTransform(0, 2, 0, 0, 22);
  const farCam = computeBannerlordCameraTransform(-75, 2, -8, 0, 860);

  assert.ok(farCam.pitchRad > closeCam.pitchRad);
  assert.ok(farCam.camY > closeCam.camY);

  const clampedExtreme = clampCameraFocus(999, -999, 860);
  assert.ok(clampedExtreme.x <= 300 && clampedExtreme.x >= -360);
  assert.ok(clampedExtreme.z <= 300 && clampedExtreme.z >= -310);
});
