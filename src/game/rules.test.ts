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
  getSettlementArrivalRadius,
  hireMercenariesAtTavern,
  ransomPrisonersAtTavern,
  participateInArenaPractice,
  joinArenaTournament,
  manageGarrisonTransfer,
  restAndRecoverAtSettlement,
  raidAndPillageVillage,
  forcePeasantsSupplies,
  forcePeasantsRecruits,
  sellSurplusLootAtMarket,
  calculateLearningLimit,
  calculateClanTier,
  allocateAttributePoint,
  allocateFocusPoint,
  equipInventoryItem,
  upgradeSettlementBuilding,
  setSettlementDailyDefault,
  buyOrChangeWorkshop,
  forgeCustomWeaponAtSmithy,
  constructSiegeEngine,
  deployReservedSiegeEngines,
  bombardSettlementWalls,
  upgradeTroopTier,
  recruitCapturedPrisoners,
  attemptLordPersuasionStep,
  executeLordBarterOffer,
  CALRADIA_MARKETPLACE_ITEMS,
  buyMarketplaceItem,
  sellMarketplaceItem,
  unequipEquipmentSlot,
} from './rules.ts';
import {
  CONTINENTAL_BRIDGES,
  OVERWORLD_BASE_MARCH_SPEED,
  OVERWORLD_LORD_PATROL_SPEED,
  getBiomeAt,
  getPartySpeedInfo,
  groundHeightAt,
  clampCameraFocus,
  computeBannerlordCameraTransform,
  isSettlementLabelVisible,
} from './mapGen.ts';
import {
  computeLandPath,
  computeLordPatrolPos,
  isNavigableLandAt,
  snapToNearestLand,
  stepAlongLandOnly,
} from './navigation.ts';
import {
  calculateBannerlordPartySpeed,
  computePlayerSpottingRange,
  getLordDetailedIntel,
  isWithinSpottingRange,
  stepLordCampaignRoute,
} from './campaignSystem.ts';

test('initial campaign state creates balanced troops, 211 authentic continental settlements (51 Towns with 2 villages each, 29 Castles with 1 village each) on flat dry plateaus, and 9 lords', () => {
  const state = createInitialCampaignState('Komutan Alparslan', 'noble');
  assert.equal(state.playerName, 'Komutan Alparslan');
  assert.equal(getTotalTroops(state.roster), 17);
  assert.equal(state.lords.length, 9);
  assert.ok(calculatePartyStrength(state.roster) > 250);

  const towns = state.settlements.filter((s) => s.type === 'TOWN');
  const castles = state.settlements.filter((s) => s.type === 'CASTLE');
  const villages = state.settlements.filter((s) => s.type === 'VILLAGE');

  assert.equal(towns.length, 51, 'Should include all 51 authentic Calradia Towns');
  assert.equal(castles.length, 29, 'Should include 29 authentic Calradia Castles across all kingdoms');
  assert.equal(villages.length, 51 * 2 + 29 * 1, 'Every Town must have 2 villages and every Castle 1 village');
  assert.equal(state.settlements.length, 211);

  // Verify every Town has exactly 2 bound villages
  for (const town of towns) {
    const bound = villages.filter((v) => v.boundSettlementId === town.id);
    assert.equal(
      bound.length,
      2,
      `Town ${town.name} (${town.id}) must have exactly 2 bound villages, got ${bound.length}`,
    );
  }

  // Verify every Castle has at least 1 bound village
  for (const castle of castles) {
    const bound = villages.filter((v) => v.boundSettlementId === castle.id);
    assert.equal(
      bound.length,
      1,
      `Castle ${castle.name} (${castle.id}) must have 1 bound village, got ${bound.length}`,
    );
  }

  // Every single settlement and its outer wall perimeter must sit on a flat valley plateau (2.05m) so mountains never bury settlements
  for (const s of state.settlements) {
    const hCenter = groundHeightAt(s.x, s.z);
    assert.equal(
      hCenter,
      2.05,
      `Settlement ${s.name} (${s.type}) center at (${s.x}, ${s.z}) should sit on flat terrace 2.05m, got ${hCenter}`,
    );
    const checkR = s.type === 'TOWN' ? 8.5 : s.type === 'CASTLE' ? 6.5 : 4.5;
    for (const [ox, oz] of [
      [checkR, 0],
      [-checkR, 0],
      [0, checkR],
      [0, -checkR],
    ]) {
      const hEdge = groundHeightAt(s.x + ox, s.z + oz);
      assert.equal(
        hEdge,
        2.05,
        `Settlement ${s.name} (${s.type}) perimeter (${s.x + ox}, ${s.z + oz}) must be flat (2.05m) with zero mountain burial, got ${hEdge}`,
      );
    }
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

test('advanceDailyEconomyAndWorld advances day, collects fief taxes from castle and bound village, and pays wages', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const wage = calculateDailyWage(state.roster);
  const playerFiefs = state.settlements.filter((s) => s.faction === 'player');
  const expectedTax = playerFiefs.reduce((sum, s) => sum + Math.round(s.prosperity * 0.25), 0);
  const next = advanceDailyEconomyAndWorld(state);
  assert.equal(next.day, 2);
  assert.equal(next.gold, state.gold + expectedTax - wage);
});

test('computeMeleeDamage accounts for heavy strikes, armor defense, and shield block', () => {
  const normalHit = computeMeleeDamage(30, 10, false, false, 1.0);
  const heavyHit = computeMeleeDamage(30, 10, true, false, 1.2);
  const blockedHit = computeMeleeDamage(30, 10, false, true, 1.0);

  assert.ok(heavyHit > normalHit);
  assert.ok(blockedHit < normalHit);
});

test('resolveBattleOutcome awards renown, gold loot, prisoners, and conquers settlement plus its bound villages on victory', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  // Conquer a Castle (karagecit = Ab Comer Kalesi -> 1 bound village)
  const afterCastleVictory = resolveBattleOutcome(
    state,
    true,
    'lord-kargi',
    { militia: 1 },
    12,
    'karagecit',
  );

  assert.equal(afterCastleVictory.battlesWon, 1);
  assert.ok(afterCastleVictory.gold > state.gold);
  assert.ok(afterCastleVictory.renown > state.renown);
  assert.ok(afterCastleVictory.prisoners > 0);
  const conqueredCastle = afterCastleVictory.settlements.find((s) => s.id === 'karagecit')!;
  assert.equal(conqueredCastle.faction, 'player');
  const castleBoundVillages = afterCastleVictory.settlements.filter(
    (s) => s.boundSettlementId === 'karagecit',
  );
  assert.equal(castleBoundVillages.length, 1);
  assert.equal(castleBoundVillages.every((v) => v.faction === 'player'), true);

  // Conquer a Town (poros = Poros -> 2 bound villages)
  const afterTownVictory = resolveBattleOutcome(
    afterCastleVictory,
    true,
    'lord-bozkurt',
    { militia: 1 },
    18,
    'poros',
  );
  const conqueredTown = afterTownVictory.settlements.find((s) => s.id === 'poros')!;
  assert.equal(conqueredTown.faction, 'player');
  const townBoundVillages = afterTownVictory.settlements.filter(
    (s) => s.boundSettlementId === 'poros',
  );
  assert.equal(townBoundVillages.length, 2);
  assert.equal(townBoundVillages.every((v) => v.faction === 'player'), true);
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

test('settlement label LOD hides castles and villages at maximum zoom so only town (city) names are visible', () => {
  const state = createInitialCampaignState('Komutan Alparslan', 'noble');

  // At close zoom (48m), towns, castles, and villages are all visible
  assert.equal(isSettlementLabelVisible('TOWN', 48), true);
  assert.equal(isSettlementLabelVisible('CASTLE', 48), true);
  assert.equal(isSettlementLabelVisible('VILLAGE', 48), true);

  // At mid zoom (250m), towns and castles are visible, villages are hidden
  assert.equal(isSettlementLabelVisible('TOWN', 250), true);
  assert.equal(isSettlementLabelVisible('CASTLE', 250), true);
  assert.equal(isSettlementLabelVisible('VILLAGE', 250), false);

  // At continental / maximum zoom (860m and 940m), ONLY towns (cities) are visible; castles and villages are hidden
  for (const maxZoom of [860, 940]) {
    const visibleAtMax = state.settlements.filter((s) =>
      isSettlementLabelVisible(s.type, maxZoom),
    );
    assert.ok(visibleAtMax.length > 0, 'Towns should remain visible at maximum zoom');
    assert.equal(
      visibleAtMax.every((s) => s.type === 'TOWN'),
      true,
      'Only TOWN (city) names should be visible at maximum zoom; no CASTLE or VILLAGE names allowed',
    );
  }
});

test('1x overworld party march speed and lord patrol speed are calibrated for a deliberate, measured pace', () => {
  assert.ok(
    OVERWORLD_BASE_MARCH_SPEED <= 6.0 && OVERWORLD_BASE_MARCH_SPEED >= 4.0,
    `Expected OVERWORLD_BASE_MARCH_SPEED in [4.0, 6.0], got ${OVERWORLD_BASE_MARCH_SPEED}`,
  );
  assert.ok(
    OVERWORLD_LORD_PATROL_SPEED <= 0.12 && OVERWORLD_LORD_PATROL_SPEED > 0.04,
    `Expected OVERWORLD_LORD_PATROL_SPEED in (0.04, 0.12], got ${OVERWORLD_LORD_PATROL_SPEED}`,
  );

  const info = getPartySpeedInfo(4, 98, 0.25);
  assert.ok(
    info.effectiveSpeed >= 3.5 && info.effectiveSpeed <= 5.5,
    `Expected HUD partySpeed in [3.5, 5.5], got ${info.effectiveSpeed}`,
  );
  assert.ok(
    info.worldUnitsPerSecAt1x <= 8.0,
    `Expected 1x world units per sec <= 8.0, got ${info.worldUnitsPerSecAt1x}`,
  );
});

test('Bannerlord DefaultPartySpeedCalculatingModel, Lord intel, route movement, and spotting range work accurately', () => {
  const state = createInitialCampaignState('Komutan Alparslan', 'noble');

  // 1. Small agile warband (16 troops) vs large heavy army (40 troops) on identical plain terrain
  const smallPartySpeed = calculateBannerlordPartySpeed({
    x: 24,
    z: 78,
    totalHealthy: 16,
    cavalryCount: 4,
    woundedCount: 1,
    prisonerCount: 2,
  });
  const largeArmySpeed = calculateBannerlordPartySpeed({
    x: 24,
    z: 78,
    totalHealthy: 42,
    cavalryCount: 4,
    woundedCount: 4,
    prisonerCount: 7,
  });
  assert.ok(
    smallPartySpeed.finalSpeed > largeArmySpeed.finalSpeed,
    `Small 16-troop warband (${smallPartySpeed.finalSpeed}) must move faster than 42-troop heavy army (${largeArmySpeed.finalSpeed})`,
  );

  // 2. Every Lord provides full detailed intel (troops, wounded, prisoners, roster, speed, action)
  for (const lord of state.lords) {
    const intel = getLordDetailedIntel(lord, lord.x, lord.z, state.settlements);
    assert.ok(intel.totalHealthy >= 16);
    assert.ok(intel.wounded >= 1);
    assert.ok(intel.prisoners >= 1);
    assert.ok(intel.speedInfo.finalSpeed >= 2.5 && intel.speedInfo.finalSpeed <= 6.5);
    assert.ok(intel.currentAction.length > 5);
  }

  // 3. Step a Lord along their campaign route and verify they advance on navigable dry land
  const kargi = state.lords.find((l) => l.id === 'lord-kargi')!;
  const route = {
    x: kargi.x,
    z: kargi.z,
    rotY: 0,
    targetSettlementId: null,
    waypoints: computeLandPath(kargi.x, kargi.z, kargi.targetX, kargi.targetZ),
    currentAction: kargi.currentAction,
  };
  stepLordCampaignRoute(kargi, route, 0.5, 1, state.settlements);
  assert.ok(
    Math.hypot(route.x - kargi.x, route.z - kargi.z) > 1.0,
    'Lord Kargi should move briskly along his route at 1x speed',
  );
  assert.equal(isNavigableLandAt(route.x, route.z), true);

  // 4. Spotting range & Fog of War checks
  const spotRange = computePlayerSpottingRange(state.playerX, state.playerZ, state.roster);
  assert.ok(spotRange >= 120 && spotRange <= 230);
  // Rhagaea at (28, 92) is within spotting range of player at (14, 88)
  assert.equal(isWithinSpottingRange(state.playerX, state.playerZ, 28, 92, spotRange), true);
  // Derthert in distant Vlandia (-412, -115) is outside spotting range (hidden by Fog of War)
  assert.equal(isWithinSpottingRange(state.playerX, state.playerZ, -412, -115, spotRange), false);
});

test('Bannerlord settlement arrival radii and Town, Castle, Village menu systems function accurately', () => {
  // 1. Arrival Radii: Town (5.2), Castle (3.8), Village (2.6)
  assert.equal(getSettlementArrivalRadius('TOWN'), 5.2);
  assert.equal(getSettlementArrivalRadius('CASTLE'), 3.8);
  assert.equal(getSettlementArrivalRadius('VILLAGE'), 2.6);

  let state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const lycaron = state.settlements.find((s) => s.id === 'zeonica')!;
  const sancaktepe = state.settlements.find((s) => s.id === 'sancaktepe')!;
  const castle = state.settlements.find((s) => s.type === 'CASTLE')!;

  assert.ok(lycaron && lycaron.type === 'TOWN');
  assert.ok(sancaktepe && sancaktepe.type === 'VILLAGE');
  assert.ok(castle && castle.type === 'CASTLE');

  // 2. Tavern: Hire Mercenaries
  const initialGold = state.gold;
  const initialCav = state.roster.cavalry;
  const mercRes = hireMercenariesAtTavern(state, lycaron.id);
  assert.equal(mercRes.success, true);
  assert.equal(mercRes.hiredCount, 4);
  assert.equal(mercRes.nextState.gold, initialGold - 120);
  assert.equal(mercRes.nextState.roster.cavalry, initialCav + 2);
  state = mercRes.nextState;

  // 3. Tavern: Ransom Prisoners
  state = { ...state, prisoners: 6 };
  const ransomRes = ransomPrisonersAtTavern(state, lycaron.id);
  assert.equal(ransomRes.success, true);
  assert.equal(ransomRes.goldGained, 6 * 35);
  assert.equal(ransomRes.nextState.prisoners, 0);
  assert.equal(ransomRes.nextState.gold, state.gold + 210);
  state = ransomRes.nextState;

  // 4. Arena: Practice Fight
  const goldBeforeArena = state.gold;
  const arenaRes = participateInArenaPractice(state, lycaron.id);
  assert.equal(arenaRes.success, true);
  assert.equal(arenaRes.goldEarned, 25);
  assert.equal(arenaRes.nextState.gold, goldBeforeArena + 25);
  state = arenaRes.nextState;

  // 5. Market: Sell Surplus Loot
  const goldBeforeLoot = state.gold;
  const lootRes = sellSurplusLootAtMarket(state, lycaron.id);
  assert.equal(lootRes.success, true);
  assert.equal(lootRes.goldGained, 45);
  assert.equal(lootRes.nextState.gold, goldBeforeLoot + 45);
  state = lootRes.nextState;

  // 6. Castle: Manage Garrison Transfer
  const castleGarrisonBefore = castle.garrison;
  const garrisonRes = manageGarrisonTransfer(state, castle.id, 'militia', 'deposit', 1);
  assert.equal(garrisonRes.success, true);
  const updatedCastle = garrisonRes.nextState.settlements.find((s) => s.id === castle.id)!;
  assert.equal(updatedCastle.garrison, castleGarrisonBefore + 1);
  state = garrisonRes.nextState;

  // 7. Rest and Recovery
  state = { ...state, playerHp: 60 };
  const restRes = restAndRecoverAtSettlement(state, lycaron.id);
  assert.equal(restRes.success, true);
  assert.equal(restRes.nextState.playerHp, 85);
  state = restRes.nextState;

  // 8. Village: Hostile Actions - Force Supplies
  const foodBeforeSupplies = state.food;
  const forceSupRes = forcePeasantsSupplies(state, sancaktepe.id);
  assert.equal(forceSupRes.success, true);
  assert.equal(forceSupRes.nextState.food, foodBeforeSupplies + 8);
  state = forceSupRes.nextState;

  // 9. Village: Hostile Actions - Force Recruits
  const militiaBeforeRecruits = state.roster.militia;
  const forceRecRes = forcePeasantsRecruits(state, sancaktepe.id);
  assert.equal(forceRecRes.success, true);
  assert.equal(forceRecRes.nextState.roster.militia, militiaBeforeRecruits + 3);
  state = forceRecRes.nextState;

  // 10. Village: Hostile Actions - Raid and Pillage Village
  const raidRes = raidAndPillageVillage(state, sancaktepe.id);
  assert.equal(raidRes.success, true);
  assert.equal(raidRes.goldLoot, 280);
  assert.equal(raidRes.foodLoot, 16);
  const raidedVillage = raidRes.nextState.settlements.find((s) => s.id === sancaktepe.id)!;
  assert.equal(raidedVillage.isRaided, true);
});

test('Bannerlord Character Sheet, Inventory, Building Projects, Smithy, Siege Camp & Persuasion systems work deterministically', () => {
  let state = createInitialCampaignState('Komutan Demirhan', 'noble');

  // 1. Learning Limit & Clan Tier math
  assert.equal(calculateLearningLimit(5, 4), (5 - 1) * 14 + 4 * 40 + 10);
  assert.equal(calculateClanTier(65).tier, 1);
  assert.equal(calculateClanTier(950).tier, 4);

  // 2. Attribute & Focus Point allocation
  const vigorBefore = state.attributes!.VIGOR;
  const attrRes = allocateAttributePoint(state, 'VIGOR');
  assert.equal(attrRes.success, true);
  assert.equal(attrRes.nextState.attributes!.VIGOR, vigorBefore + 1);
  state = attrRes.nextState;

  const focusBefore = state.skills!.oneHanded.focus;
  const focusRes = allocateFocusPoint(state, 'oneHanded');
  assert.equal(focusRes.success, true);
  assert.equal(focusRes.nextState.skills!.oneHanded.focus, focusBefore + 1);
  state = focusRes.nextState;

  // 3. Equip Inventory Item
  const equipRes = equipInventoryItem(state, 'item_thamaskene_sword');
  assert.equal(equipRes.success, true);
  assert.ok(equipRes.nextState.equipment!.WEAPON1.includes('Thamaskene Çift Elli Falx'));
  state = equipRes.nextState;

  // 4. Town Building Project, Daily Default, Workshop & Smithy
  state = { ...state, gold: 2500 };
  const lycaron = state.settlements.find((s) => s.id === 'zeonica')!;
  const bldgRes = upgradeSettlementBuilding(state, lycaron.id, 'GRANARY');
  assert.equal(bldgRes.success, true);
  state = bldgRes.nextState;

  const defRes = setSettlementDailyDefault(state, lycaron.id, 'IRRIGATION');
  assert.equal(defRes.success, true);
  state = defRes.nextState;

  const wsRes = buyOrChangeWorkshop(state, lycaron.id, 'SMITHY');
  assert.equal(wsRes.success, true);
  state = wsRes.nextState;

  const forgeRes = forgeCustomWeaponAtSmithy(state, lycaron.id, 'LANCE');
  assert.equal(forgeRes.success, true);
  assert.ok((forgeRes.profitGold ?? 0) > 0);
  state = forgeRes.nextState;

  // 5. Siege Camp Reserve Trick & Wall Bombardment
  const trebuchetReserve = constructSiegeEngine(state, lycaron.id, 'TREBUCHET', true);
  assert.equal(trebuchetReserve.success, true);
  state = trebuchetReserve.nextState;

  const deployRes = deployReservedSiegeEngines(state, lycaron.id);
  assert.equal(deployRes.success, true);
  state = deployRes.nextState;

  const bombardRes = bombardSettlementWalls(state, lycaron.id);
  assert.equal(bombardRes.success, true);
  assert.ok((bombardRes.wallHealthAfter ?? 100) < 100);
  state = bombardRes.nextState;

  // 6. Party Troop Upgrade & Prisoner Recruitment
  const archersBefore = state.roster.archer;
  const upgRes = upgradeTroopTier(state, 'militia', 'archer', 1);
  assert.equal(upgRes.success, true);
  assert.equal(upgRes.nextState.roster.archer, archersBefore + 1);
  state = upgRes.nextState;

  const prisRes = recruitCapturedPrisoners(state, 1);
  assert.equal(prisRes.success, true);
  assert.equal(prisRes.nextState.prisoners, 1);
  state = prisRes.nextState;

  // 7. Lord 4-Pip Persuasion & Barter
  const pStep = attemptLordPersuasionStep(state, 'lord-rhagaea', 'HONOR');
  assert.equal(pStep.success, true);
  assert.ok(pStep.totalPips >= 1);
  state = pStep.nextState;

  const barterRes = executeLordBarterOffer(state, 'lord-rhagaea', 100, 1);
  assert.equal(barterRes.success, true);
  const rhagaeaAfter = barterRes.nextState.lords.find((l) => l.id === 'lord-rhagaea')!;
  assert.equal(rhagaeaAfter.isAlliedWithPlayer, true);
});

test('Bannerlord marketplace trade system: buying weapons/shields/armor adds to inventory, buying food feeds party, selling returns gold, and unequip works cleanly', () => {
  const state0 = createInitialCampaignState('Komutan Demirhan', 'noble');
  const initialGold = state0.gold;
  const initialFood = state0.food;
  const initialItemCount = state0.inventoryItems?.length ?? 0;

  // 1. Buy Food
  const grainItem = CALRADIA_MARKETPLACE_ITEMS.find((i) => i.id === 'mkt_grain_sack')!;
  const buyFoodRes = buyMarketplaceItem(state0, grainItem, 'Poros Pazarı');
  assert.equal(buyFoodRes.success, true);
  assert.equal(buyFoodRes.nextState.food, initialFood + 10);
  assert.equal(buyFoodRes.nextState.gold, initialGold - grainItem.value);

  // 2. Buy Weapon (Thamaskene Spatha)
  const spathaItem = CALRADIA_MARKETPLACE_ITEMS.find((i) => i.id === 'mkt_thamaskene_spatha')!;
  const buyWeaponRes = buyMarketplaceItem(buyFoodRes.nextState, spathaItem, 'Poros Pazarı');
  assert.equal(buyWeaponRes.success, true);
  assert.equal(buyWeaponRes.nextState.inventoryItems?.length, initialItemCount + 1);
  const boughtItem = buyWeaponRes.nextState.inventoryItems?.find((i) => i.name === spathaItem.name)!;
  assert.ok(boughtItem);
  assert.equal(boughtItem.category, 'WEAPON');

  // 3. Sell Item from inventory
  const sellRes = sellMarketplaceItem(buyWeaponRes.nextState, boughtItem.id, 'Poros Pazarı');
  assert.equal(sellRes.success, true);
  assert.ok(sellRes.goldGained > 0);
  assert.equal(sellRes.nextState.inventoryItems?.length, initialItemCount);

  // 4. Unequip a slot (e.g. HEAD or WEAPON1)
  const unequipRes = unequipEquipmentSlot(state0, 'HEAD');
  assert.equal(unequipRes.success, true);
  assert.ok(unequipRes.nextState.equipment?.HEAD.includes('Başlıksız'));
  assert.equal(unequipRes.nextState.inventoryItems?.length, initialItemCount + 1);
});





