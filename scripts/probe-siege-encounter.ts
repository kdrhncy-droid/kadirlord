/**
 * probe-siege-encounter.ts — Görev 1 kuşatma karşılaşma kuralları
 *
 *   npx tsx scripts/probe-siege-encounter.ts
 */
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  advanceDailyEconomyAndWorld,
  bombardSettlementWalls,
  constructSiegeEngine,
  createInitialCampaignState,
  deployReservedSiegeEngines,
  getSettlementArrivalRadius,
  getTotalTroops,
  removeDestroyedSiegeEngines,
  setWallSections,
  SIEGE_GARRISON_FOOD_PER_DAY,
  type SiegeEngineType,
} from '../src/game/rules.ts';
import { SiegeEncounterModal } from '../src/components/SiegeEncounterModal.tsx';
import {
  SIEGE_CAMP_STANDOFF,
  applyBreakInCasualties,
  besiegedSettlementIdSet,
  breakInLossRate,
  buildSiegeEncounterView,
  enterBesiegedSettlement,
  getSiegeCampPoint,
  liftPlayerSiege,
  resolveSiegeRole,
  startPlayerSiege,
} from '../src/game/siegeEncounter.ts';
import { advanceUpkeep } from '../src/game/worldSim.ts';
import {
  computePlayerSpottingRange,
  isWithinSpottingRange,
} from '../src/game/campaignSystem.ts';
import { buildE2ESiegeScenario, parseE2ERequest } from '../src/game/testHarness.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const seed = createInitialCampaignState();
const town = seed.settlements.find((s) => s.type === 'TOWN' && s.faction !== 'player');
if (!town) throw new Error('düşman şehir yok');
const lord = seed.lords.find((item) => item.faction !== town.faction && item.faction !== 'player') ?? seed.lords[0];

ok(resolveSiegeRole(seed, town.id) === null, 'kuşatma yokken normal menü');

const castle = seed.settlements.find(
  (settlement) => settlement.type === 'CASTLE' && settlement.faction !== 'player',
) ?? town;
const campPoint = getSiegeCampPoint(castle, lord.x, lord.z);
const campDistance = Math.hypot(campPoint.x - castle.x, campPoint.z - castle.z);
const campFallback = getSiegeCampPoint(castle, castle.x, castle.z);
ok(
  Math.abs(campDistance - SIEGE_CAMP_STANDOFF) < 0.001 &&
    campDistance > 8 &&
    campDistance > getSettlementArrivalRadius(castle.type),
  'kuşatan kampı yerleşim çarpışma yarıçapının dışında',
  `uzaklık=${campDistance.toFixed(1)} standoff=${SIEGE_CAMP_STANDOFF}`,
);
ok(
  Math.abs(campFallback.x - (castle.x + SIEGE_CAMP_STANDOFF)) < 0.001 &&
    Math.abs(campFallback.z - castle.z) < 0.001,
  'merkezden yaklaşımda kamp +x yönünü kullanıyor',
);

const attackerSetup = buildE2ESiegeScenario(seed, 'attacker');
const attackerSettlement = attackerSetup
  ? attackerSetup.campaign.settlements.find(
      (settlement) => settlement.id === attackerSetup.settlementId,
    )
  : undefined;
const attackerLord = attackerSetup
  ? attackerSetup.campaign.lords.find(
      (candidate) =>
        candidate.order?.kind === 'SIEGE' &&
        candidate.order.targetSettlementId === attackerSetup.settlementId,
    )
  : undefined;
const attackerDistance =
  attackerSettlement && attackerLord
    ? Math.hypot(attackerLord.x - attackerSettlement.x, attackerLord.z - attackerSettlement.z)
    : 0;
ok(
  !!attackerSetup &&
    !!attackerSettlement &&
    !!attackerLord &&
    Math.abs(attackerDistance - SIEGE_CAMP_STANDOFF) < 0.001 &&
    attackerDistance > 8 &&
    attackerDistance > getSettlementArrivalRadius(attackerSettlement.type),
  'E2E kuşatan lordu standoff noktasında başlıyor',
);
const outsiderSetup = buildE2ESiegeScenario(seed, 'outsider');
const outsiderSettlement = outsiderSetup
  ? outsiderSetup.campaign.settlements.find(
      (settlement) => settlement.id === outsiderSetup.settlementId,
    )
  : undefined;
const outsiderLord = outsiderSetup
  ? outsiderSetup.campaign.lords.find(
      (candidate) =>
        candidate.order?.kind === 'SIEGE' &&
        candidate.order.targetSettlementId === outsiderSetup.settlementId,
    )
  : undefined;
const outsiderCampPoint =
  outsiderSettlement && outsiderLord
    ? getSiegeCampPoint(outsiderSettlement, outsiderLord.x, outsiderLord.z)
    : null;
const outsiderToCamp = outsiderCampPoint
  ? Math.hypot(
      outsiderSetup!.campaign.playerX - outsiderCampPoint.x,
      outsiderSetup!.campaign.playerZ - outsiderCampPoint.z,
    )
  : 0;
const outsiderSpotting =
  outsiderSetup && outsiderLord
    ? computePlayerSpottingRange(
        outsiderSetup.campaign.playerX,
        outsiderSetup.campaign.playerZ,
        outsiderSetup.campaign.roster,
      )
    : 0;
ok(
  !!outsiderSetup &&
    !!outsiderLord &&
    Math.abs(outsiderToCamp - 25) < 0.001 &&
    isWithinSpottingRange(
      outsiderSetup.campaign.playerX,
      outsiderSetup.campaign.playerZ,
      outsiderLord.x,
      outsiderLord.z,
      outsiderSpotting,
    ),
  'E2E outsider 25 birim dışarıda ve kuşatanı görebiliyor',
);
const shortcut = parseE2ERequest('?e2e=1&autostart=1&seed=42&timeScale=0&siege=attacker', true);
ok(shortcut.enabled && shortcut.siegeRole === 'attacker' && shortcut.timeScale === 0, 'DEV siege URL kısayolu');

const sieging = {
  ...seed,
  lords: seed.lords.map((item) =>
    item.id === lord.id
      ? {
          ...item,
          order: { kind: 'SIEGE' as const, targetSettlementId: town.id, sinceDay: 1, siegeProgress: 40 },
        }
      : item,
  ),
};

ok(besiegedSettlementIdSet(sieging).has(town.id), 'kuşatılan id kümesi');
ok(resolveSiegeRole(sieging, town.id) === 'outsider', 'dışarıdaki oyuncu: outsider');

const playerAttack = startPlayerSiege(seed, town.id);
ok(resolveSiegeRole(playerAttack, town.id) === 'attacker', 'oyuncu kuşatınca attacker');
ok((playerAttack.playerSiege?.campProgress ?? 0) > 0, 'kamp ilerleme başlar');

const lifted = liftPlayerSiege(playerAttack, town.id);
ok(resolveSiegeRole(lifted, town.id) === null, 'kuşatma kalkınca menü kapanır');

const owned = seed.settlements.find((s) => s.faction === 'player' && s.type !== 'VILLAGE') ?? town;
const defendingState = {
  ...seed,
  settlements: seed.settlements.map((s) => (s.id === owned.id ? { ...s, faction: 'player' as const } : s)),
  lords: seed.lords.map((item) =>
    item.id === lord.id
      ? {
          ...item,
          order: { kind: 'SIEGE' as const, targetSettlementId: owned.id, sinceDay: 1, siegeProgress: 55 },
        }
      : item,
  ),
};
ok(resolveSiegeRole(defendingState, owned.id) === 'defender', 'kendi şehri kuşatılınca defender');

const inside = enterBesiegedSettlement(sieging, town.id);
ok(inside.playerSiege?.inside === true, 'yarma sonrası inside');
ok(resolveSiegeRole(inside, town.id) === 'defender', 'içeri girince defender');

const afterBreak = applyBreakInCasualties({
  ...seed,
  roster: { infantry: 20, archer: 10, cavalry: 8, horseArcher: 4 },
  troopStacks: [],
});
const afterCount = getTotalTroops(afterBreak.roster);
const rate = breakInLossRate(seed.day);
ok(afterCount < 42 && afterCount >= Math.floor(42 * (1 - 0.26)), 'yarma zayiatı roster düşürür', `${afterCount} keep~${(1 - rate).toFixed(2)}`);
const stackBreak = applyBreakInCasualties(seed);
const stackCount = (stackBreak.troopStacks ?? []).reduce((sum, stack) => sum + stack.count, 0);
ok(
  getTotalTroops(stackBreak.roster) === stackCount &&
    (stackBreak.troopStacks ?? []).every((stack) => stack.wounded <= stack.count),
  'yarma zayiatı roster ve troopStacks toplamını eşit tutuyor',
);

const wallAttack = startPlayerSiege(seed, town.id);
const wallSectionsState = {
  ...wallAttack,
  settlements: wallAttack.settlements.map((settlement) =>
    settlement.id === town.id ? setWallSections(settlement, [0, 63]) : settlement,
  ),
};
const breachedView = buildSiegeEncounterView(wallSectionsState, town.id);
ok(
  breachedView?.breached === true &&
    breachedView.wallSections[0] === 0 &&
    breachedView.wallSections[1] === 63,
  'tek bir sur bölümünün sıfırlanması gedik açar',
);

const fullRangedState = {
  ...seed,
  gold: 10_000,
  settlements: seed.settlements.map((settlement) =>
    settlement.id === town.id
      ? {
          ...settlement,
          siegeEngines: ['TREBUCHET', 'MANGONEL', 'BALLISTA', 'TREBUCHET'] as SiegeEngineType[],
          siegeEngineHp: [100, 100, 100, 100],
          reserveEngines: [],
        }
      : settlement,
  ),
};
const fullRangedResult = constructSiegeEngine(fullRangedState, town.id, 'BALLISTA');
ok(
  !fullRangedResult.success &&
    fullRangedResult.reason?.includes('yuvaları dolu') === true &&
    fullRangedResult.nextState.gold === fullRangedState.gold,
  'dolu menzilli yuva altın harcamadan reddedilir',
);
const deployState = {
  ...seed,
  settlements: seed.settlements.map((settlement) =>
    settlement.id === town.id
      ? {
          ...settlement,
          siegeEngines: ['TREBUCHET', 'MANGONEL', 'BALLISTA'] as SiegeEngineType[],
          siegeEngineHp: [100, 100, 100],
          reserveEngines: [
            'BALLISTA',
            'BATTERING_RAM',
            'SIEGE_TOWER',
            'SIEGE_TOWER',
            'SIEGE_TOWER',
          ] as SiegeEngineType[],
        }
      : settlement,
  ),
};
const deployed = deployReservedSiegeEngines(deployState, town.id);
const deployedSettlement = deployed.nextState.settlements.find((settlement) => settlement.id === town.id);
ok(
  deployed.success &&
    deployedSettlement?.siegeEngines?.length === 7 &&
    deployedSettlement.reserveEngines?.length === 1 &&
    deployedSettlement.siegeEngineHp?.length === deployedSettlement.siegeEngines.length,
  'rezerv konuşlandırması yalnız sığan silahları etkinleştirir',
);

const bombardState = {
  ...seed,
  settlements: seed.settlements.map((settlement) =>
    settlement.id === town.id
      ? {
          ...setWallSections(settlement, [92, 50]),
          siegeEngines: ['TREBUCHET'] as SiegeEngineType[],
          siegeEngineHp: [77],
          foodStock: 60,
        }
      : settlement,
  ),
};
const wallBombard = bombardSettlementWalls(bombardState, town.id);
const wallBombardSettlement = wallBombard.nextState.settlements.find((settlement) => settlement.id === town.id);
ok(
  wallBombard.success &&
    wallBombardSettlement?.wallSections?.[0] === 92 &&
    (wallBombardSettlement.wallSections?.[1] ?? 100) < 50 &&
    wallBombardSettlement.siegeEngineHp?.[0] === 77,
  'otomatik bombardıman zayıf sura yönelir ve motor HP’sini değiştirmez',
);
const peopleBombardState = {
  ...bombardState,
  settlements: bombardState.settlements.map((settlement) =>
    settlement.id === town.id
      ? {
          ...setWallSections(settlement, [100, 100]),
          siegeEngines: ['BALLISTA'] as SiegeEngineType[],
          garrison: 20,
        }
      : settlement,
  ),
};
const peopleBombard = bombardSettlementWalls(peopleBombardState, town.id, 'PEOPLE');
const peopleSettlement = peopleBombard.nextState.settlements.find((settlement) => settlement.id === town.id);
ok(
  peopleBombard.success &&
    peopleSettlement?.garrison === 4 &&
    peopleSettlement.wallSections?.[0] === 100 &&
    peopleSettlement.wallSections?.[1] === 100,
  'asker hedefli bombardıman yalnız garnizonu azaltır ve dörtte tutar',
);
const noRangedState = {
  ...bombardState,
  settlements: bombardState.settlements.map((settlement) =>
    settlement.id === town.id
      ? {
          ...settlement,
          siegeEngines: ['BATTERING_RAM'] as SiegeEngineType[],
          siegeEngineHp: [100],
        }
      : settlement,
  ),
};
ok(!bombardSettlementWalls(noRangedState, town.id).success, 'menzilli silah yokken bombardıman reddedilir');

const destroyedOnLift = liftPlayerSiege({
  ...wallAttack,
  settlements: wallAttack.settlements.map((settlement) =>
    settlement.id === town.id
      ? {
          ...settlement,
          siegeEngines: ['TREBUCHET', 'BALLISTA'] as SiegeEngineType[],
          siegeEngineHp: [0, 51],
        }
      : settlement,
  ),
}, town.id);
const survivingEngines = destroyedOnLift.settlements.find((settlement) => settlement.id === town.id);
ok(
  survivingEngines?.siegeEngines?.length === 1 &&
    survivingEngines.siegeEngines[0] === 'BALLISTA' &&
    survivingEngines.siegeEngineHp?.[0] === 51,
  'kuşatma kalkarken HP 0 olan motorlar temizlenir',
);
const cleanedEngines = removeDestroyedSiegeEngines({
  ...town,
  siegeEngines: ['TREBUCHET'] as SiegeEngineType[],
  siegeEngineHp: [0],
});
ok(cleanedEngines.siegeEngines?.length === 0, 'yıkılmış motor temizleme yardımcısı çalışır');

const starvingState = {
  ...seed,
  playerSiege: { settlementId: town.id, campProgress: 100, inside: false },
  settlements: seed.settlements.map((settlement) =>
    settlement.id === town.id
      ? { ...settlement, foodStock: 0, garrison: 20 }
      : settlement,
  ),
};
const starvingUpkeep = advanceUpkeep(
  starvingState,
  starvingState.settlements,
  [],
  undefined,
);
const starvingSettlement = starvingUpkeep.settlements.find((settlement) => settlement.id === town.id);
ok(
  starvingSettlement?.garrison === 18 &&
    starvingUpkeep.events.some((event) => event.category === 'WAR'),
  'açlıktaki kuşatılmış garnizon günde yüzde on kayıp ve WAR olayı alır',
);
const foodTick = advanceDailyEconomyAndWorld({
  ...starvingState,
  settlements: starvingState.settlements.map((settlement) =>
    settlement.id === town.id ? { ...settlement, foodStock: 2 } : settlement,
  ),
});
ok(
  foodTick.settlements.find((settlement) => settlement.id === town.id)?.foodStock === 0 &&
    SIEGE_GARRISON_FOOD_PER_DAY === 3,
  'kuşatılmış yerleşim günlük erzak tüketir, stok yenilenmez',
);

const view = buildSiegeEncounterView(sieging, town.id);
ok(!!view && view.role === 'outsider', 'view outsider');
if (view) {
  const html = renderToStaticMarkup(
    React.createElement(SiegeEncounterModal, {
      view,
      campaign: sieging,
      onClose: () => {},
      onOpenSiegeCamp: () => {},
      onAssaultBreach: () => {},
      onAssaultRam: () => {},
      onLiftSiege: () => {},
      onAttackBesiegers: () => {},
      onBreakIn: () => {},
      onObserve: () => {},
      onDefendWalls: () => {},
      onSallyOut: () => {},
      onTalkSurrender: () => {},
    }),
  );
  ok(html.includes('Kuşatan Orduya Taarruz'), 'outsider menü metni');
  ok(html.includes('data-testid="siege-encounter-modal"'), 'testid');
}

const attackerView = buildSiegeEncounterView(playerAttack, town.id);
ok(!!attackerView && attackerView.role === 'attacker', 'attacker view');
if (attackerView) {
  const html = renderToStaticMarkup(
    React.createElement(SiegeEncounterModal, {
      view: attackerView,
      campaign: playerAttack,
      onClose: () => {},
      onOpenSiegeCamp: () => {},
      onAssaultBreach: () => {},
      onAssaultRam: () => {},
      onLiftSiege: () => {},
      onAttackBesiegers: () => {},
      onBreakIn: () => {},
      onObserve: () => {},
      onDefendWalls: () => {},
      onSallyOut: () => {},
      onTalkSurrender: () => {},
    }),
  );
  ok(html.includes('Kuşatma Kampı'), 'attacker kamp düğmesi');
  ok(html.includes('Koçbaşıyla Kapıyı Zorla'), 'koçbaşı seçeneği');
}

if (fails > 0) {
  console.error(`\n${fails} siege encounter probe failed`);
  process.exit(1);
}
console.log('\nprobe-siege-encounter: all passed');
