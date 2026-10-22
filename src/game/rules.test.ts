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
import {
  getLordDNA,
  LORD_DNA_PRESETS,
  PLAYER_DEFAULT_DNA,
  generateRandomDNA,
  applyMorphDNAToRig,
} from './characterMorph.ts';
import { createCharacterRig } from './characterRig.ts';
import {
  COMPANION_HERO_IDS,
  FOUNDATION_VERSION,
  ITEM_DEFINITIONS,
  PLAYER_HERO_ID,
  TROOP_DEFINITIONS,
  calculateLearningHardCap,
  calculateLearningSoftCap,
  applyDiscardDonation,
  discardEligibility,
  discardXpCapForTier,
  ensureBannerlordFoundation,
  equipInventoryItemForHero,
  getPlayerHero,
  getRoleHero,
  inventoryTotalQuantity,
  inventoryTotalValue,
  itemDiscardXpPerUnit,
  parseItemStats,
  previewDiscardDonation,
  prisonerStackTotal,
  resolveItemDefinition,
  setHeroActiveEquipmentSet,
  toggleInventoryStackLocked,
  transferInventoryQuantity,
  troopStackTotals,
  unequipHeroEquipmentSlot,
  validateTroopDefinitions,
} from './bannerlordFoundation.ts';
import { SAVE_VERSION, createSaveData, parseSave, serializeSave } from './saveGame.ts';
import {
  buyFromMarket,
  getMarketSettlement,
  initializeMarketSettlement,
  sellAllSurplusToMarket,
  sellToMarket,
} from './marketTransaction.ts';

test('initial campaign state creates balanced troops, 211 authentic continental settlements (51 Towns with 2 villages each, 29 Castles with 1 village each) on flat dry plateaus, and 9 lords', () => {
  const state = createInitialCampaignState('Komutan Alparslan', 'noble');
  assert.equal(state.playerName, 'Komutan Alparslan');
  assert.equal(getTotalTroops(state.roster), 17);
  assert.equal(state.lords.length, 40);
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

  // 5. Market: Sell Surplus Loot — çuvaldaki ticari emtia gerçek değerinden satılır
  const noGoodsRes = sellSurplusLootAtMarket(state, lycaron.id);
  assert.equal(noGoodsRes.success, false);
  assert.equal(noGoodsRes.goldGained, 0);

  state = {
    ...state,
    inventoryItems: [
      ...(state.inventoryItems ?? []),
      {
        id: 'test-trade-good',
        name: 'Tuz Sandığı',
        slot: 'TRADE',
        category: 'FOOD',
        value: 40,
        weight: 5,
        statBonus: 'Ticaret',
        civilianLegal: true,
        tier: 1,
      },
    ],
  };
  const goldBeforeLoot = state.gold;
  const lootRes = sellSurplusLootAtMarket(state, lycaron.id);
  assert.equal(lootRes.success, true);
  assert.equal(lootRes.goldGained, 40);
  assert.equal(lootRes.nextState.gold, goldBeforeLoot + 40);
  assert.equal(
    (lootRes.nextState.inventoryItems ?? []).some((item) => item.id === 'test-trade-good'),
    false,
  );
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

test('all 211 settlements including Tubilis Castle and Husn Deltası are on navigable land and reachable within arrival radius', () => {
  const state = createInitialCampaignState();
  const tubilis = state.settlements.find((s) => s.id === 'tubilis_castle');
  const husnDelta = state.settlements.find((s) => s.id === 'tubilis_castle_village_1');
  assert.ok(tubilis, 'Tubilis Castle exists');
  assert.ok(husnDelta, 'Husn Deltası bound village exists');
  assert.equal(isNavigableLandAt(tubilis.x, tubilis.z), true);
  assert.equal(isNavigableLandAt(husnDelta.x, husnDelta.z), true);

  for (const s of state.settlements) {
    assert.equal(
      isNavigableLandAt(s.x, s.z),
      true,
      `Settlement ${s.name} (${s.id}) center must be on navigable land`,
    );
    const gateGoal = snapToNearestLand(s.x, s.z + 1.2);
    const distFromCenter = Math.hypot(gateGoal.x - s.x, gateGoal.z - s.z);
    const arrivalR = getSettlementArrivalRadius(s.type);
    assert.ok(
      distFromCenter <= arrivalR,
      `Settlement ${s.name} (${s.id}) gate target must be within arrivalRadius (${distFromCenter.toFixed(2)} <= ${arrivalR})`,
    );
  }
});

import {
  computeFormationSlots,
  evaluateDirectionalParry,
  SpatialHashGrid,
} from './tacticalFormation.ts';
import {
  createWarHorseRig,
  deriveRigVisualOptionsFromEquipment,
} from './characterRig.ts';

test('tacticalFormation: computeFormationSlots produces distinct geometry for LINE, SHIELD_WALL, LOOSE, and WEDGE', () => {
  const anchor = { x: 0, z: 0, facing: 0 };
  const lineSlots = computeFormationSlots(6, anchor, 'LINE');
  const shieldWallSlots = computeFormationSlots(6, anchor, 'SHIELD_WALL');
  const looseSlots = computeFormationSlots(6, anchor, 'LOOSE');
  const wedgeSlots = computeFormationSlots(6, anchor, 'WEDGE');

  assert.equal(lineSlots.length, 6);
  assert.equal(shieldWallSlots.length, 6);
  assert.equal(looseSlots.length, 6);
  assert.equal(wedgeSlots.length, 6);

  // Shield wall spacing is tighter than line spacing, which is tighter than loose spacing
  const swSpread = Math.abs(shieldWallSlots[1].x - shieldWallSlots[0].x);
  const lineSpread = Math.abs(lineSlots[1].x - lineSlots[0].x);
  const looseSpread = Math.abs(looseSlots[1].x - looseSlots[0].x);
  assert.ok(swSpread < lineSpread, 'Shield wall rank spacing should be tighter than Line');
  assert.ok(lineSpread < looseSpread, 'Line rank spacing should be tighter than Loose');

  // Wedge rank 0 has 1 lead horseman at file 0
  assert.equal(wedgeSlots[0].rank, 0);
  assert.equal(wedgeSlots[0].file, 0);
  assert.equal(wedgeSlots[1].rank, 1);
  assert.equal(wedgeSlots[2].rank, 1);
});

test('tacticalFormation: evaluateDirectionalParry enforces 4-directional parry and shield wall rules', () => {
  // Shield blocks any direction
  const shieldBlock = evaluateDirectionalParry({
    attackDir: 'left',
    defenderBlockDir: 'up',
    hasShield: true,
    isBlocking: true,
    isFacingAttacker: true,
  });
  assert.equal(shieldBlock.blocked, true);
  assert.equal(shieldBlock.blockType, 'SHIELD');
  assert.equal(shieldBlock.damageMultiplier, 0);

  // Weapon parry succeeds on matching direction
  const matchingParry = evaluateDirectionalParry({
    attackDir: 'right',
    defenderBlockDir: 'right',
    hasShield: false,
    isBlocking: true,
    isFacingAttacker: true,
  });
  assert.equal(matchingParry.blocked, true);
  assert.equal(matchingParry.blockType, 'WEAPON_PARRY');

  // Weapon parry fails on wrong direction
  const wrongParry = evaluateDirectionalParry({
    attackDir: 'up',
    defenderBlockDir: 'down',
    hasShield: false,
    isBlocking: true,
    isFacingAttacker: true,
  });
  assert.equal(wrongParry.blocked, false);
  assert.ok(wrongParry.damageMultiplier > 0);
});

test('tacticalFormation: SpatialHashGrid performs O(N) radius and nearest queries accurately', () => {
  const grid = new SpatialHashGrid<{ id: string; x: number; z: number; team: number; alive: boolean }>(4.0);
  const agents = [
    { id: 'a1', x: 0, z: 0, team: 1, alive: true },
    { id: 'e1', x: 2.1, z: 1.2, team: 2, alive: true },
    { id: 'e2', x: 18.0, z: -15.0, team: 2, alive: true },
    { id: 'dead', x: 0.5, z: 0.5, team: 2, alive: false },
  ];
  grid.rebuild(agents);

  const nearby = grid.queryRadius(0, 0, 3.5);
  assert.equal(nearby.length, 2); // a1 and e1 (dead is ignored, e2 is far)

  const nearestEnemy = grid.findNearest(0, 0, 25, (c) => c.team === 2);
  assert.ok(nearestEnemy);
  assert.equal(nearestEnemy.agent.id, 'e1');
});

test('characterRig: deriveRigVisualOptionsFromEquipment and createWarHorseRig work cleanly', () => {
  const visuals = deriveRigVisualOptionsFromEquipment({
    HEAD: 'İmparatorluk Katafrakt Miğferi (+26 Baş Zırhı)',
    BODY: 'İmparatorluk Katafrakt Zırhı (+48 Gövde Zırhı)',
    WEAPON1: 'Çift Elli Battaniya Falx (+42 Kesici)',
    WEAPON2: 'Boş Yuva',
  });
  assert.equal(visuals.helmetType, 'IMPERIAL_VISOR');
  assert.equal(visuals.armorTier, 'PLATE');
  assert.equal(visuals.weaponType, 'TWO_HANDED_SWORD');
  assert.equal(visuals.shieldType, 'NONE');

  const horse = createWarHorseRig({ armoredBarding: true });
  assert.ok(horse.root);
  assert.ok(horse.riderMount);
  assert.ok(horse.frontLeftHip);
  assert.ok(horse.backRightKnee);
});

import { computeZoomStep } from './mapGen.ts';

test('camera zoom and pitch trajectory are C2-smooth with zero velocity kink across 16m..940m', () => {
  // Check that pitch rate of change has no sudden discontinuity across zoom = 247m (t = 0.25)
  const step = 4;
  let prevDeltaPitch = 0;
  for (let z = 20; z <= 900; z += step) {
    const p1 = computeBannerlordCameraTransform(0, 4.0, 0, 0, z - step).pitchRad;
    const p2 = computeBannerlordCameraTransform(0, 4.0, 0, 0, z).pitchRad;
    const deltaPitch = p2 - p1;
    assert.ok(deltaPitch > 0, `Pitch must monotonically increase with zoom at z=${z}`);
    if (prevDeltaPitch > 0) {
      const ratio = deltaPitch / prevDeltaPitch;
      assert.ok(
        ratio > 0.95 && ratio < 1.05,
        `Pitch angular velocity must not jump abruptly at z=${z} (ratio=${ratio.toFixed(4)})`,
      );
    }
    prevDeltaPitch = deltaPitch;
  }

  // Verify computeZoomStep handles pixel, line, and page wheel events smoothly
  const zInPixel = computeZoomStep(100, -60, 0);
  const zOutLine = computeZoomStep(100, 3, 1);
  assert.ok(zInPixel < 100 && zInPixel > 75);
  assert.ok(zOutLine > 100 && zOutLine < 135);
  assert.equal(computeZoomStep(16, -500, 0), 16);
  assert.equal(computeZoomStep(940, 500, 0), 940);
});

import {
  BattleMemoryPool,
  MAX_CORPSE_POOL,
  MAX_PROJECTILE_POOL,
  MAX_SOLDIER_POOL,
} from './battleEnginePool.ts';

test('BattleMemoryPool: Ahead-of-Time Pre-Allocation initializes 10,000-arrow pool, 10,000-corpse pool, 1,000-soldier SoA, and 3D Siege Assault cleanly', () => {
  const pool = new BattleMemoryPool();

  // 1. Pre-warm all 5 stages (10,000 corpses, 10,000 projectiles, 1,024 soldiers, SpatialHashGrid, 3D Siege)
  const reports = pool.prewarmMemoryPages();
  assert.equal(reports.length, 5);
  assert.equal(reports[4].progressPercent, 100);
  assert.equal(reports[4].corpseSlotsReady, MAX_CORPSE_POOL);
  assert.equal(reports[4].arrowSlotsReady, MAX_PROJECTILE_POOL);
  assert.equal(reports[4].soldierSlotsReady, MAX_SOLDIER_POOL);
  assert.equal(pool.isPrewarmed, true);

  // 2. Spawn 500v500 Epic Siege Army (1,000 soldiers)
  pool.spawnBattleArmies('EPIC_500', true);
  assert.equal(pool.soldierActiveCount, 1000);
  assert.equal(pool.alliesAliveCount, 500);
  assert.equal(pool.enemiesAliveCount, 500);

  // 3. Test 10,000-arrow pool O(1) ring buffer
  const arrowSlot = pool.spawnPooledProjectile(0, 1.5, -10, 0, 4, 24, 1, 0);
  assert.equal(arrowSlot, 0);
  assert.equal(pool.projActiveTotal, 1);
  assert.equal(pool.projInFlightCount, 1);

  // 4. Test 10,000-corpse pool O(1) ring buffer
  const corpseSlot = pool.recordFallenCorpse(4, 0.08, 2, 1.2, 2);
  assert.equal(corpseSlot, 0);
  assert.equal(pool.corpseCount, 1);

  // 5. Verify 3D Siege Assault engines (Battering Ram, Siege Tower, 2 Catapults)
  assert.equal(pool.siege.enabled, true);
  assert.equal(pool.siege.gateBreached, false);
  assert.equal(pool.siege.towerDocked, false);

  // Advance simulation ticks so battering ram and siege tower reach the castle wall and breach the gate
  for (let i = 0; i < 320; i++) {
    pool.stepSimulation(0.1, 0, 12, Math.PI, 'CHARGE', 'LINE', true, {
      x: 0,
      z: 10,
      facing: Math.PI,
    });
  }

  assert.equal(pool.siege.towerDocked, true, 'Siege tower should reach the wall and drop its drawbridge');
  assert.equal(pool.siege.gateBreached, true, 'Battering ram should breach the main castle gate');
  assert.ok(pool.corpseCount > 1, 'Combat and catapult volleys should produce casualties recorded in CorpsePool');
  assert.ok(pool.projActiveTotal > 5, 'Archers and catapults should fire pooled projectiles without GC');
});

import {
  calculateSettlementLoyaltyAndFood,
  calculateWarDesireAndTribute,
  computeWeatherAndAutoBattleModifiers,
  createInitialKingdomMacroState,
  evaluateStateDrivenKingdomDestruction,
  generateSettlementClaimantBallot,
  getSafeRelationBetweenClans,
  resolveClanLeaderOrRegent,
  resolveKingdomCouncilVote,
} from './kingdomSystem.ts';

test('KingdomSystem: DefaultDiplomacyModel WarDesireRatio, Fief-Power Paradox, and Tribute calculation work accurately', () => {
  const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
  const macro = createInitialKingdomMacroState(campaign);

  const fiefs10 = campaign.settlements.filter((s) => s.type === 'TOWN').slice(0, 10);
  const fiefs5 = campaign.settlements.filter((s) => s.type === 'TOWN').slice(10, 15);

  // Equal military strength (5000 vs 5000), but Kingdom A has 10 towns while Kingdom B has 5 towns
  const report = calculateWarDesireAndTribute({
    factionA: 'player',
    factionB: 'empire',
    clansA: [{ ...macro.clans[0], warPartyCount: 5, totalStrength: 5000 }],
    clansB: [{ ...macro.clans[1], warPartyCount: 5, totalStrength: 5000 }],
    fiefsA: fiefs10,
    fiefsB: fiefs5,
    useImprovedArchitecture: false,
  });

  assert.equal(report.fiefPowerParadoxTriggered, true, 'Fief-Power Paradox should trigger when equal-strength kingdom owns 2x fiefs');
  assert.ok(report.warDesireRatioA < report.warDesireRatioB, 'Kingdom with more fiefs has lower WarDesireRatio due to larger denominator');
  assert.ok(report.dailyTributeFromAToB > 0, 'Kingdom A with 10 towns pays tribute to Kingdom B with 5 towns');

  // Test Fiefless Desperation in Vanilla vs Improved Architecture cap
  const fieflessVanilla = calculateWarDesireAndTribute({
    factionA: 'player',
    factionB: 'battania',
    clansA: [{ ...macro.clans[0], warPartyCount: 6, totalStrength: 8000 }],
    clansB: [{ ...macro.clans[3], warPartyCount: 1, totalStrength: 600 }],
    fiefsA: fiefs10,
    fiefsB: [],
    useImprovedArchitecture: false,
  });
  const fieflessImproved = calculateWarDesireAndTribute({
    factionA: 'player',
    factionB: 'battania',
    clansA: [{ ...macro.clans[0], warPartyCount: 6, totalStrength: 8000 }],
    clansB: [{ ...macro.clans[3], warPartyCount: 1, totalStrength: 600 }],
    fiefsA: fiefs10,
    fiefsB: [],
    useImprovedArchitecture: true,
  });

  assert.ok(fieflessVanilla.dailyTributeFromAToB > 0, 'Vanilla bug: superpower is asked to pay tribute to 0-fief kingdom');
  assert.ok(fieflessImproved.dailyTributeFromAToB < 0, 'Improved architecture: superpower receives tribute from defeated 0-fief kingdom');
});

test('KingdomSystem: SettlementClaimantDecision.CalculateMeritOfOutcome, distance damping (^0.25 vs ^0.5), and Flexible Ethics threshold fix', () => {
  const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
  const macro = createInitialKingdomMacroState(campaign);
  const targetTown = campaign.settlements.find((s) => s.id === 'poros')!;

  const ballot = generateSettlementClaimantBallot({
    settlement: targetTown,
    kingdomClans: macro.clans.slice(0, 4),
    allSettlements: campaign.settlements,
    conquerorClanId: 'clan-player',
    useImprovedArchitecture: true,
  });

  assert.equal(ballot.candidates.length, 3, 'Exactly top 3 clans appear on the fief election ballot');
  const playerCand = ballot.candidates.find((c) => c.clanId === 'clan-player');
  assert.ok(playerCand, 'Conqueror player clan is included in candidates');
  assert.equal(playerCand.conquerorBonus, 50, 'Conqueror receives +50 merit bonus (num10)');
  assert.equal(playerCand.rulerBonus, 100, 'Ruler receives +100 merit bonus (num11)');
  assert.equal(playerCand.cultureMatchBonus, 60, 'Matching culture receives +60 bonus in improved architecture');

  // Flexible Ethics Perk Bug (Vanilla vs Improved)
  const voteVanilla = resolveKingdomCouncilVote({
    election: ballot,
    chosenClanId: ballot.candidates[0].clanId,
    influenceTier: 1,
    hasFlexibleEthicsPerk: true,
    hasRoyalPrivilegePolicy: false,
    isRulerOverride: false,
    useImprovedArchitecture: false,
  });
  const voteImproved = resolveKingdomCouncilVote({
    election: ballot,
    chosenClanId: ballot.candidates[0].clanId,
    influenceTier: 1,
    hasFlexibleEthicsPerk: true,
    hasRoyalPrivilegePolicy: false,
    isRulerOverride: false,
    useImprovedArchitecture: true,
  });

  assert.equal(voteVanilla.influenceSpent, 17);
  assert.equal(voteVanilla.flexibleEthicsBugTriggered, true);
  assert.equal(voteVanilla.relationGained, 0, 'Vanilla hardcoded >=20 check fails at 17 influence');

  assert.equal(voteImproved.influenceSpent, 17);
  assert.equal(voteImproved.flexibleEthicsBugTriggered, false);
  assert.ok(voteImproved.relationGained > 0, 'Normalized tier check awards relation and Charm XP even at 17 influence');
});

test('KingdomSystem: Null-Safe Regent Succession, State-Driven Fiefless Destruction, Loyalty/Food & Weather Modifiers', () => {
  const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
  const macro = createInitialKingdomMacroState(campaign);

  // 1. Null-Safe Regent when clan leader and all adult heirs are eliminated
  const wipedClan = {
    ...macro.clans[0],
    succession: {
      leaderId: '',
      leaderName: '',
      isRegentActive: false,
      regentName: null,
      heirQueue: [{ id: 'child-1', name: 'Küçük Şehzade', age: 9, isAdult: false }],
    },
  };
  const safeSucc = resolveClanLeaderOrRegent(wipedClan);
  assert.equal(safeSucc.isRegentActive, true, 'Should appoint a Regent when only underage heirs exist');
  assert.ok(safeSucc.leaderName.includes('Naip'), 'Regent name must be non-empty');
  assert.equal(typeof getSafeRelationBetweenClans(wipedClan, null), 'number', 'Null clan relation check must never throw');

  // 2. State-Driven Fiefless Kingdom Destruction
  const noBattaniaFiefs = campaign.settlements.map((s) =>
    s.faction === 'battania' ? { ...s, faction: 'player' as const } : s,
  );
  const destCheck = evaluateStateDrivenKingdomDestruction({
    settlements: noBattaniaFiefs,
    clans: macro.clans,
    alreadyDestroyed: [],
    daysElapsed: 10,
  });
  assert.equal(destCheck.newlyDestroyedFactions.includes('battania'), true);
  assert.ok(destCheck.independentClansCreated >= 1);

  // 3. Loyalty, Culture Penalty, Forgiveness of Debts & Weather Modifiers
  const town = campaign.settlements.find((s) => s.id === 'zeonica')!;
  const mismatchLoyalty = calculateSettlementLoyaltyAndFood({
    settlement: town,
    ownerCulture: 'vlandia',
    boundVillages: [],
    activePolicies: ['FORGIVENESS_OF_DEBTS'],
    isBesieged: true,
  });
  assert.equal(mismatchLoyalty.cultureMismatchPenalty, -3.0);
  assert.equal(mismatchLoyalty.policyLoyaltyBonus, 2.0);

  const snowMods = computeWeatherAndAutoBattleModifiers('SNOW', true);
  assert.equal(snowMods.siegePreparationTimeMultiplier, 2.0);
  assert.equal(snowMods.cavalrySpeedAndAccelMultiplier, 0.85);
  assert.equal(snowMods.rangedMissileSpeedMultiplier, 0.8);
  assert.equal(snowMods.captainPerkTier8BonusPct, 3);
});

test('Faz 6: Bannerlord Low-Poly Character & Lord Customization Engine', () => {
  // 1. Verify all 9 Historical Lords have authentic distinct DNA presets
  const canonicalLords = [
    'lord-rhagaea',
    'lord-derthert',
    'lord-caladog',
    'lord-raganvad',
    'lord-monchug',
    'lord-unqid',
    'lord-garios',
    'lord-lucon',
    'lord-kargi',
  ];

  for (const lordId of canonicalLords) {
    const dna = LORD_DNA_PRESETS[lordId];
    assert.ok(dna, `Preset for ${lordId} must exist`);
    assert.ok(dna.height >= 0.85 && dna.height <= 1.25, `${lordId} height out of bounds`);
    assert.ok(dna.build >= 0.75 && dna.build <= 1.45, `${lordId} build out of bounds`);
    assert.ok(dna.skinTone.startsWith('#'), `${lordId} skin tone must be hex color`);
    assert.ok(dna.hairColor.startsWith('#'), `${lordId} hair color must be hex color`);
  }

  // Rhagaea must have female gender and royal braid
  assert.equal(LORD_DNA_PRESETS['lord-rhagaea'].gender, 'female');
  assert.equal(LORD_DNA_PRESETS['lord-rhagaea'].hairStyle, 'royal_braid');

  // Caladog must have battanian woad paint and eye slash scar
  assert.equal(LORD_DNA_PRESETS['lord-caladog'].warPaint, 'woad_lines');
  assert.equal(LORD_DNA_PRESETS['lord-caladog'].scar, 'eye_slash');

  // Raganvad must have Viking braided beard and Nordic hair
  assert.equal(LORD_DNA_PRESETS['lord-raganvad'].beardStyle, 'braided_viking');

  // 2. getLordDNA fallback & lookup
  const derthertDNA = getLordDNA('lord-derthert', 'vlandia');
  assert.equal(derthertDNA.hairStyle, 'short_parted');
  assert.equal(derthertDNA.culture, 'vlandia');

  const unknownDNA = getLordDNA('unknown-rebel', 'khuzait');
  assert.ok(unknownDNA, 'Fallback DNA must be generated for unknown lord');
  assert.equal(unknownDNA.culture, 'khuzait');

  // 3. Procedural Random DNA generator checks
  const randomSturgian = generateRandomDNA('sturgia', 'male');
  assert.equal(randomSturgian.culture, 'sturgia');
  assert.equal(randomSturgian.gender, 'male');
  assert.ok(randomSturgian.height >= 0.85 && randomSturgian.height <= 1.25);

  const randomFemaleAserai = generateRandomDNA('aserai', 'female');
  assert.equal(randomFemaleAserai.gender, 'female');
  assert.equal(randomFemaleAserai.beardStyle, 'clean_shaven', 'Females must have clean_shaven beardStyle');

  // 4. Live 3D Rig Morphing Transformation
  const rig = createCharacterRig({
    skinTone: '#ffffff',
    weaponType: 'ONE_HANDED_SWORD',
    shieldType: 'ROUND_SHIELD',
    helmetType: 'NONE',
    armorTier: 'CHAINMAIL',
  });

  // Apply Caladog DNA to rig
  applyMorphDNAToRig(rig, LORD_DNA_PRESETS['lord-caladog']);

  assert.equal(rig.materials.skin.color.getHexString().toLowerCase(), LORD_DNA_PRESETS['lord-caladog'].skinTone.replace('#', '').toLowerCase());
  assert.ok(rig.head.getObjectByName('Custom_Procedural_Beard'), 'Caladog full beard must be attached to head');
  assert.ok(rig.head.getObjectByName('Face_Decals'), 'Caladog scars & woad paint decals must be attached to head');
  assert.ok(rig.hairGroup.getObjectByName('Hair_nordic_braids'), 'Nordic braids hair must be attached');

  // 5. Campaign State integration
  const camp = createInitialCampaignState('Komutan Demirhan', 'noble');
  assert.ok(camp.playerMorphDNA, 'Player morph DNA must be initialized');
  assert.equal(camp.playerMorphDNA.gender, PLAYER_DEFAULT_DNA.gender);

  const rhagaeaInCamp = camp.lords.find((l: any) => l.id === 'lord-rhagaea');
  assert.ok(rhagaeaInCamp?.morphDNA, 'Rhagaea must have morphDNA initialized in campaign');
  assert.equal(rhagaeaInCamp.morphDNA?.gender, 'female');

  const derthertInCamp = camp.lords.find((l: any) => l.id === 'lord-derthert');
  assert.ok(derthertInCamp?.morphDNA, 'Derthert must have morphDNA initialized in campaign');
  assert.equal(derthertInCamp.morphDNA?.hairStyle, 'short_parted');
});

test('P0/P1 Bannerlord foundation: canonical heroes, stacks, troop trees, migration, and Discard contract', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');

  // Yeni sefer doğrudan kanonik temelle açılır ve göç ikinci kez sonucu değiştirmez.
  assert.equal(state.foundationVersion, FOUNDATION_VERSION);
  assert.equal(state.influence, 0);
  assert.deepEqual(ensureBannerlordFoundation(state), state);

  const player = getPlayerHero(state)!;
  assert.equal(player.id, PLAYER_HERO_ID);
  assert.equal(player.name, 'Komutan Demirhan');
  assert.equal(Object.keys(player.skills).length, 18);
  assert.deepEqual(player.skills.steward, { level: 115, focus: 4, xp: 0 });
  assert.equal(Object.values(player.equipment.BATTLE).filter(Boolean).length, 12);
  for (const definitionId of Object.values(player.equipment.BATTLE)) {
    assert.ok(resolveItemDefinition(state, definitionId), `Ekipman tanımı çözülebilmelidir: ${definitionId}`);
  }

  assert.deepEqual(
    state.heroes?.map((hero) => hero.name),
    ['Komutan Demirhan', 'Aybars', 'Helena', 'Torvald'],
  );
  assert.equal(getRoleHero(state, 'SCOUT')?.id, COMPANION_HERO_IDS.Aybars);
  assert.equal(getRoleHero(state, 'SURGEON')?.name, 'Helena');
  assert.equal(getRoleHero(state, 'ENGINEER')?.name, 'Torvald');
  assert.equal(getRoleHero(state, 'QUARTERMASTER')?.id, PLAYER_HERO_ID);

  // Başlangıç satırları adetli yığınlardır; eski "(x3)" katır satırı üç birim olur.
  assert.equal(state.inventoryItems?.length, 6);
  assert.equal(inventoryTotalQuantity(state.inventoryItems), 8);
  assert.equal(inventoryTotalValue(state.inventoryItems), 4330);
  const mules = state.inventoryItems?.find((item) => item.definitionId === 'item_sumpter_mule')!;
  assert.equal(mules.quantity, 3);
  assert.equal(mules.value, 80);
  assert.equal(mules.stats?.cargoCapacity, 100);
  assert.equal(
    state.inventoryItems?.find((item) => item.definitionId === 'item_imperial_helm')?.stats?.armorHead,
    48,
  );
  assert.equal(
    state.inventoryItems?.find((item) => item.definitionId === 'item_cataphract_armor')?.stats?.armorBody,
    64,
  );
  for (const item of state.inventoryItems ?? []) {
    assert.ok(item.definitionId, 'Her yığın kalıcı tanım kimliği taşımalı');
    assert.ok(resolveItemDefinition(state, item.definitionId));
    assert.ok((item.quantity ?? 0) >= 1);
    assert.equal(item.locked, false);
  }

  // Pazar kataloğunun tamamı sayısal stat'lı tanımlara çevrilir.
  assert.equal(ITEM_DEFINITIONS.length, CALRADIA_MARKETPLACE_ITEMS.length);
  assert.equal(new Set(ITEM_DEFINITIONS.map((definition) => definition.id)).size, ITEM_DEFINITIONS.length);
  for (const definition of ITEM_DEFINITIONS) {
    if (definition.category === 'WEAPON') assert.ok((definition.stats.damage ?? 0) > 0, definition.id);
    if (definition.category === 'SHIELD') {
      assert.ok((definition.stats.shieldDurability ?? 0) > 0 || (definition.stats.block ?? 0) > 0, definition.id);
    }
    if (definition.category === 'ARMOR') {
      assert.ok(Object.keys(definition.stats).some((key) => key.startsWith('armor')), definition.id);
    }
    if (definition.category === 'HORSE' && definition.slot === 'MOUNT') {
      assert.ok((definition.stats.mountSpeed ?? 0) > 0, definition.id);
    }
  }
  assert.deepEqual(parseItemStats('+48 Baş Zırhı · +4 İtibar', 'HEAD', 'ARMOR'), { armorHead: 48 });

  // Sekiz kültürün her biri dallanan ve bütünlüğü doğrulanabilir bir ağaca sahiptir.
  assert.equal(TROOP_DEFINITIONS.length, 112);
  assert.deepEqual(validateTroopDefinitions(), []);
  for (const definition of TROOP_DEFINITIONS.filter((troop) => troop.id.endsWith('_recruit'))) {
    assert.equal(definition.upgrades.length, 3, definition.id);
  }
  assert.equal(
    TROOP_DEFINITIONS.find((troop) => troop.id === 'player_infantry_3')?.upgrades.length,
    2,
  );
  assert.deepEqual(troopStackTotals(state.troopStacks), state.roster);
  assert.equal(prisonerStackTotal(state.prisonerStacks), state.prisoners);
  assert.ok(state.troopStacks?.every((stack) => stack.wounded === 0 && stack.xp === 0));

  // v3 biçimindeki alanlar kayıpsız göç eder; üretilmiş katalog kimlikleri yığınlaşır.
  const {
    foundationVersion: _foundationVersion,
    influence: _influence,
    heroes: _heroes,
    roleAssignments: _roleAssignments,
    troopStacks: _troopStacks,
    prisonerStacks: _prisonerStacks,
    customItemDefinitions: _customItemDefinitions,
    ...legacyCore
  } = state;
  const spatha = CALRADIA_MARKETPLACE_ITEMS.find((item) => item.id === 'mkt_thamaskene_spatha')!;
  const legacyState = {
    ...legacyCore,
    inventoryItems: [
      ...(legacyCore.inventoryItems ?? []).map((item) => {
        const { definitionId: _definitionId, quantity: _quantity, locked: _locked, stats: _stats, ...legacyItem } = item;
        return item.definitionId === 'item_sumpter_mule'
          ? { ...legacyItem, name: 'Kervan Yük Katırı (x3)', value: 240 }
          : legacyItem;
      }),
      {
        id: 'mkt_thamaskene_spatha_1700000000_ab12',
        name: spatha.name,
        slot: spatha.slot,
        category: spatha.category,
        value: 435,
        weight: spatha.weight,
        statBonus: spatha.statBonus,
        civilianLegal: spatha.civilianLegal,
        icon: spatha.iconKey,
        tier: spatha.tier,
      },
      {
        id: 'mkt_thamaskene_spatha_loot_1_0_seed',
        name: spatha.name,
        slot: spatha.slot,
        category: spatha.category,
        value: 435,
        weight: spatha.weight,
        statBonus: spatha.statBonus,
        civilianLegal: spatha.civilianLegal,
        icon: spatha.iconKey,
        tier: spatha.tier,
      },
    ],
  };
  const migrated = ensureBannerlordFoundation(legacyState);
  assert.equal(migrated.heroes?.length, 4);
  assert.deepEqual(troopStackTotals(migrated.troopStacks), migrated.roster);
  assert.equal(
    migrated.inventoryItems?.find((item) => item.definitionId === spatha.id)?.quantity,
    2,
  );
  assert.equal(
    migrated.inventoryItems?.find((item) => item.definitionId === 'item_sumpter_mule')?.quantity,
    3,
  );
  assert.deepEqual(ensureBannerlordFoundation(migrated), migrated);

  // Bozuk kanonik alanlar kaydı çökertmez; bilinmeyen kimlikler ve taşan sayılar onarılır.
  const repaired = ensureBannerlordFoundation({
    ...state,
    troopStacks: [
      { troopId: 'unknown_troop', count: 50, wounded: 50, xp: 50 },
      { troopId: 'player_infantry_3', count: 999, wounded: 999, xp: 999_999 },
    ],
    prisonerStacks: [
      { troopId: 'unknown_troop', count: 20, ready: 20, readinessProgress: 2 },
      { troopId: 'bandits_recruit', count: 99, ready: 99, readinessProgress: 0.5 },
    ],
  });
  assert.deepEqual(troopStackTotals(repaired.troopStacks), repaired.roster);
  assert.equal(prisonerStackTotal(repaired.prisonerStacks), repaired.prisoners);
  const repairedInfantry = repaired.troopStacks?.find((stack) => stack.troopId === 'player_infantry_3')!;
  assert.equal(repairedInfantry.count, state.roster.militia);
  assert.ok(repairedInfantry.wounded <= repairedInfantry.count);
  assert.ok(repairedInfantry.xp <= repairedInfantry.count * 200);

  // Save v4 round-trip ve v3 ham kaydının parseSave içinde göçü.
  const macro = createInitialKingdomMacroState(state);
  const currentSave = createSaveData(
    { campaign: legacyState, macroState: macro, metHeroIds: [], backgroundChoice: 'noble' },
    123456,
  );
  assert.equal(currentSave.version, SAVE_VERSION);
  assert.equal(currentSave.campaign.foundationVersion, FOUNDATION_VERSION);
  const roundTripped = parseSave(serializeSave(currentSave));
  assert.equal(roundTripped?.campaign.heroes?.length, 4);

  const rawV3 = JSON.parse(serializeSave(currentSave)) as any;
  rawV3.version = 3;
  rawV3.campaign = legacyState;
  const parsedV3 = parseSave(JSON.stringify(rawV3));
  assert.equal(parsedV3?.version, SAVE_VERSION);
  assert.equal(parsedV3?.campaign.foundationVersion, FOUNDATION_VERSION);
  assert.equal(parsedV3?.campaign.heroes?.length, 4);

  // Pazar alım/satımı yığın adedini korur; kilitli yığın satılamaz.
  let tradeState = { ...state, gold: 10_000 };
  const rowCountBefore = tradeState.inventoryItems?.length ?? 0;
  tradeState = buyMarketplaceItem(tradeState, spatha, 'Test Pazarı').nextState;
  tradeState = buyMarketplaceItem(tradeState, spatha, 'Test Pazarı').nextState;
  assert.equal(tradeState.inventoryItems?.length, rowCountBefore + 1);
  let boughtStack = tradeState.inventoryItems?.find((item) => item.definitionId === spatha.id)!;
  assert.equal(boughtStack.quantity, 2);
  const lockedSell = sellMarketplaceItem(
    {
      ...tradeState,
      inventoryItems: tradeState.inventoryItems?.map((item) =>
        item.id === boughtStack.id ? { ...item, locked: true } : item,
      ),
    },
    boughtStack.id,
    'Test Pazarı',
  );
  assert.equal(lockedSell.success, false);
  tradeState = sellMarketplaceItem(tradeState, boughtStack.id, 'Test Pazarı').nextState;
  boughtStack = tradeState.inventoryItems?.find((item) => item.definitionId === spatha.id)!;
  assert.equal(boughtStack.quantity, 1);
  tradeState = sellMarketplaceItem(tradeState, boughtStack.id, 'Test Pazarı').nextState;
  assert.equal(tradeState.inventoryItems?.length, rowCountBefore);

  // Kuşanma yığından bir adet düşürür, eski ekipmanı geri koyar ve kahraman kaydını bağlar.
  const equipState = {
    ...state,
    inventoryItems: state.inventoryItems?.map((item) =>
      item.definitionId === 'item_thamaskene_sword' ? { ...item, quantity: 2 } : item,
    ),
  };
  const previousWeaponId = getPlayerHero(equipState)?.equipment.BATTLE.WEAPON1;
  const equipped = equipInventoryItem(equipState, 'item_thamaskene_sword');
  assert.equal(equipped.success, true);
  assert.equal(
    getPlayerHero(equipped.nextState)?.equipment.BATTLE.WEAPON1,
    'item_thamaskene_sword',
  );
  assert.equal(
    equipped.nextState.inventoryItems?.find((item) => item.definitionId === 'item_thamaskene_sword')?.quantity,
    1,
  );
  assert.equal(
    equipped.nextState.inventoryItems?.find((item) => item.definitionId === previousWeaponId)?.quantity,
    1,
  );

  // Slot boşaltma uydurma 120 dinarlık eşya üretmez; gerçek tanımı envantere döndürür.
  const equippedHeadId = getPlayerHero(state)?.equipment.BATTLE.HEAD;
  const unequipped = unequipEquipmentSlot(state, 'HEAD');
  assert.equal(unequipped.success, true);
  assert.equal(getPlayerHero(unequipped.nextState)?.equipment.BATTLE.HEAD, null);
  assert.equal(
    unequipped.nextState.inventoryItems?.find((item) => item.definitionId === equippedHeadId)?.quantity,
    1,
  );

  // Bannerlord öğrenme sınırları: yumuşak sınır ve sert tavan birbirine karışmaz.
  assert.equal(calculateLearningSoftCap(5, 4), 160);
  assert.equal(calculateLearningHardCap(5, 4), 220);
  assert.equal(calculateLearningSoftCap(2, 0), 10);
  assert.equal(calculateLearningHardCap(2, 0), 18);

  // Discard: değerin %50’si, resmi kademe tavanları, perk şartı ve taşma hesabı.
  assert.deepEqual([0, 1, 2, 3, 4, 6].map(discardXpCapForTier), [35, 75, 150, 250, 300, 300]);
  const armor = resolveItemDefinition(state, 'item_cataphract_armor')!;
  const sword = resolveItemDefinition(state, 'item_thamaskene_sword')!;
  assert.equal(itemDiscardXpPerUnit(armor), 300);
  assert.equal(itemDiscardXpPerUnit(sword), 270);
  assert.equal(discardEligibility(state, armor).eligible, false);
  assert.equal(
    previewDiscardDonation(state, [{ definitionId: armor.id, quantity: 1 }]).grossXp,
    0,
  );

  const armorPerkState = ensureBannerlordFoundation({
    ...state,
    heroes: state.heroes?.map((hero) =>
      hero.id === PLAYER_HERO_ID
        ? { ...hero, perks: [...hero.perks, 'paid_in_promise'] }
        : hero,
    ),
  });
  assert.equal(discardEligibility(armorPerkState, armor).eligible, true);
  assert.equal(discardEligibility(armorPerkState, sword).eligible, false);
  const normalPreview = previewDiscardDonation(armorPerkState, [
    { definitionId: armor.id, quantity: 1 },
  ]);
  assert.equal(normalPreview.grossXp, 300);
  assert.equal(normalPreview.acceptedXp, 300);
  assert.equal(normalPreview.overflowXp, 0);

  const tinyCapacityState = {
    ...armorPerkState,
    roster: { militia: 1, archer: 0, cavalry: 0, guard: 0 },
    troopStacks: [{ troopId: 'player_recruit', count: 1, wounded: 0, xp: 49 }],
  };
  const overflowPreview = previewDiscardDonation(tinyCapacityState, [
    { definitionId: armor.id, quantity: 1 },
  ]);
  assert.equal(overflowPreview.capacityXp, 1);
  assert.equal(overflowPreview.acceptedXp, 1);
  assert.equal(overflowPreview.overflowXp, 299);
  assert.equal(overflowPreview.exceedsCapacity, true);

  const weaponPerkState = ensureBannerlordFoundation({
    ...state,
    skills: {
      ...state.skills!,
      steward: { ...state.skills!.steward, level: 125 },
    },
    heroes: state.heroes?.map((hero) =>
      hero.id === PLAYER_HERO_ID
        ? { ...hero, perks: [...hero.perks, 'giving_hands'] }
        : hero,
    ),
  });
  assert.equal(discardEligibility(weaponPerkState, sword).eligible, true);
});

test('P2 inventory core: pending transfers are atomic and Discard distributes real troop XP', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const mules = state.inventoryItems?.find((item) => item.definitionId === 'item_sumpter_mule')!;

  // Bekleyen transfer iki listeyi aynı anda değiştirir; UI Cancel'da bu
  // taslak listeleri atacağı için kampanya girdisi hiç mutasyona uğramaz.
  const moved = transferInventoryQuantity(state.inventoryItems, [], mules.id, 2);
  assert.equal(moved.success, true);
  assert.equal(
    moved.sourceItems.find((item) => item.definitionId === mules.definitionId)?.quantity,
    1,
  );
  assert.equal(moved.destinationItems[0].quantity, 2);
  assert.equal(
    state.inventoryItems?.find((item) => item.definitionId === mules.definitionId)?.quantity,
    3,
  );

  const movedBack = transferInventoryQuantity(
    moved.destinationItems,
    moved.sourceItems,
    moved.destinationItems[0].id,
    1,
  );
  assert.equal(movedBack.success, true);
  assert.equal(movedBack.sourceItems[0].quantity, 1);
  assert.equal(
    movedBack.destinationItems.find((item) => item.definitionId === mules.definitionId)?.quantity,
    2,
  );

  const invalid = transferInventoryQuantity(state.inventoryItems, [], mules.id, 99);
  assert.equal(invalid.success, false);
  assert.strictEqual(invalid.sourceItems, state.inventoryItems);

  const lockedItems = state.inventoryItems?.map((item) =>
    item.id === mules.id ? { ...item, locked: true } : item,
  );
  const lockedMove = transferInventoryQuantity(lockedItems, [], mules.id, 1);
  assert.equal(lockedMove.success, false);
  assert.strictEqual(lockedMove.sourceItems, lockedItems);

  // Aynı tanımın kilitli ve açık satırları kilit değişiminde tek yığında birleşir.
  const sword = state.inventoryItems?.find((item) => item.definitionId === 'item_thamaskene_sword')!;
  const splitLockItems = [
    { ...sword, quantity: 1, locked: false },
    { ...sword, id: `${sword.id}_locked`, quantity: 2, locked: true },
  ];
  const mergedLock = toggleInventoryStackLocked(splitLockItems, sword.id);
  assert.equal(mergedLock.success, true);
  assert.equal(mergedLock.items.length, 1);
  assert.equal(mergedLock.items[0].quantity, 3);
  assert.equal(mergedLock.items[0].locked, true);

  // Perk yokken atılan silah gerçekten yok olur ama XP üretmez.
  const plainDiscard = applyDiscardDonation(state, [{ stackId: sword.id, quantity: 1 }]);
  assert.equal(plainDiscard.success, true);
  assert.equal(plainDiscard.preview.grossXp, 0);
  assert.equal(
    plainDiscard.nextState.inventoryItems?.some((item) => item.definitionId === sword.definitionId),
    false,
  );
  assert.equal(plainDiscard.nextState.troopStacks?.reduce((sum, stack) => sum + stack.xp, 0), 0);

  // Paid in Promise ile zırh yalnız sıradaki kademe kapasitesi kadar XP verir;
  // 2 acemi × 50 XP kapasite varken 300 XP'nin 200'ü boşa gider.
  const armor = state.inventoryItems?.find((item) => item.definitionId === 'item_cataphract_armor')!;
  const armorPerkState = ensureBannerlordFoundation({
    ...state,
    roster: { militia: 2, archer: 0, cavalry: 0, guard: 0 },
    troopStacks: [{ troopId: 'player_recruit', count: 2, wounded: 0, xp: 0 }],
    heroes: state.heroes?.map((hero) =>
      hero.id === PLAYER_HERO_ID
        ? { ...hero, perks: [...hero.perks, 'paid_in_promise'] }
        : hero,
    ),
  });
  const donated = applyDiscardDonation(armorPerkState, [{ stackId: armor.id, quantity: 1 }]);
  assert.equal(donated.success, true);
  assert.equal(donated.preview.grossXp, 300);
  assert.equal(donated.preview.acceptedXp, 100);
  assert.equal(donated.preview.overflowXp, 200);
  assert.deepEqual(donated.distribution, [
    { troopId: 'player_recruit', xpBefore: 0, xpApplied: 100, xpAfter: 100, capacityBefore: 100 },
  ]);
  assert.equal(donated.nextState.troopStacks?.[0].xp, 100);
  assert.equal(
    donated.nextState.inventoryItems?.some((item) => item.definitionId === armor.definitionId),
    false,
  );
  assert.deepEqual(troopStackTotals(donated.nextState.troopStacks), donated.nextState.roster);

  // Kilitli seçim veya yinelenen seçimle taşan adet bütün işlemi geri alır.
  const lockedArmorState = {
    ...armorPerkState,
    inventoryItems: armorPerkState.inventoryItems?.map((item) =>
      item.id === armor.id ? { ...item, locked: true } : item,
    ),
  };
  const lockedDiscard = applyDiscardDonation(lockedArmorState, [{ stackId: armor.id, quantity: 1 }]);
  assert.equal(lockedDiscard.success, false);
  assert.strictEqual(lockedDiscard.nextState, lockedArmorState);

  const duplicateOverflow = applyDiscardDonation(armorPerkState, [
    { stackId: armor.id, quantity: 1 },
    { stackId: armor.id, quantity: 1 },
  ]);
  assert.equal(duplicateOverflow.success, false);
  assert.strictEqual(duplicateOverflow.nextState, armorPerkState);
});

test('P2 market draft: persistent stock and merchant gold move atomically with player gold', () => {
  const state = { ...createInitialCampaignState('Komutan Demirhan', 'noble'), gold: 20_000 };
  const town = state.settlements.find((settlement) => settlement.type === 'TOWN')!;

  const initialized = initializeMarketSettlement(state, town.id);
  const initializedAgain = initializeMarketSettlement(initialized, town.id);
  assert.deepEqual(initializedAgain, initialized);
  const market = getMarketSettlement(initialized, town.id)!;
  assert.equal(market.visited, true);
  assert.ok((market.merchantGold ?? 0) > 0);
  assert.ok(Object.values(market.marketStock ?? {}).some((quantity) => quantity >= 2));

  // App yerleşime girişte önce `visited` yazar; bu sıra ilk pazar stoğunu
  // boş bir nesneyle ezip tezgahı ıssız bırakmamalıdır (tarayıcı regresyonu).
  const visitedBeforeMarket = {
    ...state,
    settlements: state.settlements.map((settlement) =>
      settlement.id === town.id ? { ...settlement, visited: true } : settlement,
    ),
  };
  const initializedAfterVisit = initializeMarketSettlement(visitedBeforeMarket, town.id);
  assert.ok(
    Object.keys(getMarketSettlement(initializedAfterVisit, town.id)?.marketStock ?? {}).length > 0,
  );

  const [buyDefinitionId, stockBefore] = Object.entries(market.marketStock ?? {}).find(
    ([definitionId, quantity]) =>
      quantity >= 2 &&
      !['mkt_grain_sack', 'mkt_cured_meat', 'mkt_smoked_fish', 'mkt_cheese_wheel'].includes(
        definitionId,
      ),
  )!;
  const inventoryQuantityBefore = inventoryTotalQuantity(initialized.inventoryItems);
  const bought = buyFromMarket(initialized, town.id, buyDefinitionId, 2);
  assert.equal(bought.success, true);
  assert.equal(bought.nextState.gold, initialized.gold - bought.totalPrice);
  assert.equal(inventoryTotalQuantity(bought.nextState.inventoryItems), inventoryQuantityBefore + 2);
  const marketAfterBuy = getMarketSettlement(bought.nextState, town.id)!;
  assert.equal(marketAfterBuy.marketStock?.[buyDefinitionId], stockBefore - 2);
  assert.equal(marketAfterBuy.merchantGold, (market.merchantGold ?? 0) + bought.totalPrice);

  // Fonksiyon girdisi değişmez; modal Cancel'da taslağı atmak bu yüzden yeterlidir.
  assert.equal(initialized.gold, 20_000);
  assert.equal(getMarketSettlement(initialized, town.id)?.marketStock?.[buyDefinitionId], stockBefore);

  // Satış, gösterilen birim fiyatın aynısını öder ve malı kalıcı stoğa geri koyar.
  const armor = initialized.inventoryItems?.find(
    (item) => item.definitionId === 'item_cataphract_armor',
  )!;
  const armorStockBefore = market.marketStock?.[armor.definitionId!] ?? 0;
  const sold = sellToMarket(initialized, town.id, armor.id, 1);
  assert.equal(sold.success, true);
  assert.equal(sold.nextState.gold, initialized.gold + sold.totalPrice);
  assert.equal(sold.totalPrice, sold.unitPrice);
  assert.equal(
    sold.nextState.inventoryItems?.some((item) => item.definitionId === armor.definitionId),
    false,
  );
  const marketAfterSell = getMarketSettlement(sold.nextState, town.id)!;
  assert.equal(marketAfterSell.marketStock?.[armor.definitionId!], armorStockBefore + 1);
  assert.equal(marketAfterSell.merchantGold, (market.merchantGold ?? 0) - sold.totalPrice);
  assert.ok(resolveItemDefinition(sold.nextState, armor.definitionId));

  const lockedState = {
    ...initialized,
    inventoryItems: initialized.inventoryItems?.map((item) =>
      item.id === armor.id ? { ...item, locked: true } : item,
    ),
  };
  const lockedSale = sellToMarket(lockedState, town.id, armor.id, 1);
  assert.equal(lockedSale.success, false);
  assert.strictEqual(lockedSale.nextState, lockedState);

  const poorMerchantState = {
    ...initialized,
    settlements: initialized.settlements.map((settlement) =>
      settlement.id === town.id ? { ...settlement, merchantGold: 1 } : settlement,
    ),
  };
  const poorSale = sellToMarket(poorMerchantState, town.id, armor.id, 1);
  assert.equal(poorSale.success, false);
  assert.strictEqual(poorSale.nextState, poorMerchantState);

  // Toplu satış kilitli satırlara ve ticaret mallarına dokunmadan yığının tamamını satar.
  const swordDefinitionId = 'item_thamaskene_sword';
  const sellAllState = {
    ...initialized,
    inventoryItems: initialized.inventoryItems?.map((item) => ({
      ...item,
      quantity: item.definitionId === swordDefinitionId ? 2 : item.quantity,
      locked: item.definitionId !== swordDefinitionId,
    })),
  };
  const soldAll = sellAllSurplusToMarket(sellAllState, town.id);
  assert.equal(soldAll.totalQuantity, 2);
  assert.equal(soldAll.soldStackCount, 1);
  assert.ok(soldAll.totalEarned > 0);
  assert.equal(
    soldAll.nextState.inventoryItems?.some((item) => item.definitionId === swordDefinitionId),
    false,
  );
  assert.equal(
    soldAll.nextState.inventoryItems?.some((item) => item.definitionId === armor.definitionId),
    true,
  );
});

test('P2 hero equipment: companions, civilian legality and exact stack returns share one core', () => {
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const companionId = COMPANION_HERO_IDS.Aybars;
  const sword = state.inventoryItems?.find(
    (item) => item.definitionId === 'item_thamaskene_sword',
  )!;
  const steed = state.inventoryItems?.find((item) => item.definitionId === 'item_noble_steed')!;

  const equipped = equipInventoryItemForHero(state, companionId, sword.id, 'BATTLE');
  assert.equal(equipped.success, true);
  assert.equal(
    equipped.nextState.heroes?.find((hero) => hero.id === companionId)?.equipment.BATTLE.WEAPON1,
    sword.definitionId,
  );
  assert.equal(
    equipped.nextState.inventoryItems?.some((item) => item.definitionId === sword.definitionId),
    false,
  );

  const unequipped = unequipHeroEquipmentSlot(
    equipped.nextState,
    companionId,
    'WEAPON1',
    'BATTLE',
  );
  assert.equal(unequipped.success, true);
  assert.equal(
    unequipped.nextState.heroes?.find((hero) => hero.id === companionId)?.equipment.BATTLE.WEAPON1,
    null,
  );
  assert.equal(
    unequipped.nextState.inventoryItems?.find((item) => item.definitionId === sword.definitionId)
      ?.quantity,
    1,
  );

  // Sivil olmayan ağır silah sivil sete giremez ve başarısız işlem girdiyi aynen döndürür.
  const illegalCivilian = equipInventoryItemForHero(state, companionId, sword.id, 'CIVILIAN');
  assert.equal(illegalCivilian.success, false);
  assert.strictEqual(illegalCivilian.nextState, state);

  const civilianMount = equipInventoryItemForHero(state, companionId, steed.id, 'CIVILIAN');
  assert.equal(civilianMount.success, true);
  assert.equal(
    civilianMount.nextState.heroes?.find((hero) => hero.id === companionId)?.equipment.CIVILIAN.MOUNT,
    steed.definitionId,
  );
  assert.equal(
    civilianMount.nextState.heroes?.find((hero) => hero.id === companionId)?.activeEquipmentSet,
    'BATTLE',
  );

  const activated = setHeroActiveEquipmentSet(civilianMount.nextState, companionId, 'CIVILIAN');
  assert.equal(activated.success, true);
  assert.equal(
    activated.nextState.heroes?.find((hero) => hero.id === companionId)?.activeEquipmentSet,
    'CIVILIAN',
  );
  assert.equal(activated.nextState.outfitMode, 'BATTLE');

  // Oyuncu takasında önceki silah kaybolmaz; bir adet olarak envantere döner.
  const playerBefore = getPlayerHero(state)!;
  const previousWeaponId = playerBefore.equipment.BATTLE.WEAPON1!;
  const playerEquipped = equipInventoryItemForHero(state, PLAYER_HERO_ID, sword.id, 'BATTLE');
  assert.equal(playerEquipped.success, true);
  assert.equal(playerEquipped.returnedDefinitionId, previousWeaponId);
  assert.equal(getPlayerHero(playerEquipped.nextState)?.equipment.BATTLE.WEAPON1, sword.definitionId);
  assert.equal(
    playerEquipped.nextState.inventoryItems?.find(
      (item) => item.definitionId === previousWeaponId,
    )?.quantity,
    1,
  );
  assert.ok(playerEquipped.nextState.equipment?.WEAPON1.includes(sword.name));
});






