/**
 * probe-siege-encounter.ts — Görev 1 kuşatma karşılaşma kuralları
 *
 *   npx tsx scripts/probe-siege-encounter.ts
 */
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { createInitialCampaignState, getTotalTroops } from '../src/game/rules.ts';
import { SiegeEncounterModal } from '../src/components/SiegeEncounterModal.tsx';
import {
  applyBreakInCasualties,
  besiegedSettlementIdSet,
  breakInLossRate,
  buildSiegeEncounterView,
  enterBesiegedSettlement,
  liftPlayerSiege,
  resolveSiegeRole,
  startPlayerSiege,
} from '../src/game/siegeEncounter.ts';

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

const afterBreak = applyBreakInCasualties({ ...seed, roster: { militia: 20, archer: 10, cavalry: 8, guard: 4 } });
const afterCount = getTotalTroops(afterBreak.roster);
const rate = breakInLossRate(seed.day);
ok(afterCount < 42 && afterCount >= Math.floor(42 * (1 - 0.26)), 'yarma zayiatı roster düşürür', `${afterCount} keep~${(1 - rate).toFixed(2)}`);

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
