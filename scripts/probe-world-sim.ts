/**
 * probe-world-sim.ts — Faz 11: canlı dünya simülasyonu (başsız protokol)
 *
 *   npx tsx scripts/probe-world-sim.ts
 *
 * Ne ölçüyor?
 *  1. `advanceWorldDay` gerçekten dünya üretiyor mu (savaş, kuşatma, fetih, olay)?
 *  2. Deterministik mi (aynı tohum + aynı durum → aynı sonuç)?
 *  3. Saf mı (girdi durumu değişmiyor mu)?
 *  4. 365 gün sonunda KPI'lar tutuyor mu (≥15 sahiplik değişimi, ≥120 olay)?
 *  5. Yardımcı API'ler (ensureWorld, summarizeWars, applyLordOrderToRoute) doğru mu?
 *
 * Simülasyon, haritanın gerçek döngüsünü taklit eder: her gün 16 sn'lik dünya
 * zamanı boyunca lordlar rotalarında yürür (`applyLordOrderToRoute` +
 * `stepLordCampaignRoute`), sonra günlük tick çalışır.
 */
import { createInitialCampaignState, FACTION_INFO, getTotalTroops } from '../src/game/rules.ts';
import {
  applyLordOrderToRoute,
  type LordLiveRouteState,
  stepLordCampaignRoute,
} from '../src/game/campaignSystem.ts';
import {
  advanceWorldDay,
  areAtWar,
  ensureWorld,
  summarizeWars,
} from '../src/game/worldSim.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* ────────────────── yardımcı: gün gün simülasyon ────────────────── */

interface SimResult {
  state: ReturnType<typeof createInitialCampaignState>;
  ownershipChanges: number;
  events: number;
  distinctConquerors: Set<string>;
  ordersSeen: Set<string>;
  siegeTargetValid: boolean;
  cooldownRespected: boolean;
}

function simulate(days: number, seedText = 'Komutan Demirhan'): SimResult {
  let state = createInitialCampaignState(seedText, 'noble');
  const routes = new Map<string, LordLiveRouteState>();
  for (const lord of state.lords) {
    routes.set(lord.id, {
      x: lord.x,
      z: lord.z,
      rotY: 0,
      targetSettlementId: null,
      waypoints: [],
      currentAction: lord.currentAction,
    });
  }

  const owners = new Map(state.settlements.map((s) => [s.id, s.faction]));
  let ownershipChanges = 0;
  let events = 0;
  const distinctConquerors = new Set<string>();
  const ordersSeen = new Set<string>();
  let siegeTargetValid = true;
  let cooldownRespected = true;

  for (let day = 0; day < days; day++) {
    for (let step = 0; step < 16; step++) {
      for (const lord of state.lords) {
        const route = routes.get(lord.id)!;
        applyLordOrderToRoute(lord, route, state.settlements, {
          x: state.playerX,
          z: state.playerZ,
        });
        stepLordCampaignRoute(lord, route, 1, 1, state.settlements);
      }
    }

    const positions = new Map([...routes.entries()].map(([id, r]) => [id, { x: r.x, z: r.z }]));
    const tick = advanceWorldDay(state, {
      lordPositions: positions,
      playerPos: { x: state.playerX, z: state.playerZ },
    });
    state = tick.state;
    events += tick.events.length;

    for (const event of tick.events) {
      if (event.category === 'CONQUEST') {
        const conquerorName = event.text.split('komutasındaki ')[1]?.split(' kuvvetlerinin')[0];
        if (conquerorName) distinctConquerors.add(conquerorName);
      }
    }

    for (const lord of state.lords) {
      const order = lord.order;
      if (!order) continue;
      ordersSeen.add(order.kind);
      if (order.kind === 'SIEGE') {
        const target = state.settlements.find((s) => s.id === order.targetSettlementId);
        if (!target || target.faction === lord.faction) siegeTargetValid = false;
      }
    }

    for (const settlement of state.settlements) {
      if (owners.get(settlement.id) !== settlement.faction) {
        const cooldown = state.world?.siegeCooldowns?.[settlement.id] ?? 0;
        if (settlement.type !== 'VILLAGE' && cooldown < state.day - 1 && cooldown !== 0) {
          // Bekleme süresi dolmadan aynı yerleşim yeniden el değiştirdiyse işaretle.
          if (state.day - cooldown < 29) cooldownRespected = false;
        }
        owners.set(settlement.id, settlement.faction);
        ownershipChanges++;
      }
    }
  }

  return { state, ownershipChanges, events, distinctConquerors, ordersSeen, siegeTargetValid, cooldownRespected };
}

/* ────────────────── 1. tek gün: saf + determinist ────────────────── */

const seedState = createInitialCampaignState('Komutan Demirhan', 'noble');
const snapshot = JSON.stringify(seedState);

const single = advanceWorldDay(seedState, { rng: () => 0.5 });
ok(single.state.day === seedState.day + 1, 'bir gün ilerliyor', `gün ${seedState.day} → ${single.state.day}`);
ok(JSON.stringify(seedState) === snapshot, 'girdi durumu değiştirilmiyor (saf fonksiyon)');
ok(single.state !== seedState, 'yeni durum nesnesi dönüyor');

const singleB = advanceWorldDay(seedState, { rng: () => 0.5 });
ok(
  JSON.stringify(single.state.lords) === JSON.stringify(singleB.state.lords) &&
    JSON.stringify(single.state.world?.wars) === JSON.stringify(singleB.state.world?.wars),
  'aynı tohum → aynı sonuç (deterministik)',
);

const world0 = ensureWorld(seedState);
ok(world0.wars.length === 2, 'başlangıçta iki sınır savaşı var', `${world0.wars.length}`);
ok(
  areAtWar(world0, 'vlandia', 'battania') && !areAtWar(world0, 'vlandia', 'aserai'),
  'savaş matrisi doğru okunuyor',
);

/* ────────────────── 2. 365 günlük sefer ────────────────── */

const sim = simulate(365);
const stats = sim.state.world?.stats;

console.log('\n── 365 GÜN ÖZETİ ──');
console.log('sahiplik değişimi:', sim.ownershipChanges);
console.log('olay:', sim.events);
console.log('stats:', JSON.stringify(stats));
console.log('görülen emirler:', [...sim.ordersSeen].join(', '));
console.log('fetih yapan ordular:', sim.distinctConquerors.size);

ok(sim.ownershipChanges >= 15, '365 günde ≥15 sahiplik değişimi', `${sim.ownershipChanges}`);
ok(sim.events >= 120, '365 günde ≥120 dünya olayı', `${sim.events}`);
ok((stats?.warsDeclared ?? 0) >= 3, 'en az 3 savaş ilanı', `${stats?.warsDeclared}`);
ok((stats?.warsEnded ?? 0) >= 1, 'en az 1 barış', `${stats?.warsEnded}`);
ok((stats?.siegesWon ?? 0) >= 8, 'en az 8 başarılı kuşatma', `${stats?.siegesWon}`);
ok(sim.distinctConquerors.size >= 3, 'fetihler en az 3 farklı krallığa dağılmış', `${sim.distinctConquerors.size}`);
ok(sim.ordersSeen.has('SIEGE'), 'lordlar kuşatma emri aldı');
ok(sim.ordersSeen.has('REINFORCE') || sim.ordersSeen.has('PATROL'), 'lordlar takviye/devriye yaptı');
ok(sim.siegeTargetValid, 'kuşatma hedefleri her zaman düşman yerleşimi');
ok(sim.cooldownRespected, 'fetih sonrası 30 günlük kuşatma bekleme süresi korunuyor');

/* ────────────────── 3. durum tutarlılığı ────────────────── */

const invalidFaction = sim.state.settlements.filter((s) => !FACTION_INFO[s.faction]);
ok(invalidFaction.length === 0, 'tüm yerleşimlerin geçerli sahibi var', `${invalidFaction.length} geçersiz`);

const degenerateLords = sim.state.lords.filter((l) => {
  const army = l.roster ? getTotalTroops(l.roster) : l.armySize;
  return !Number.isFinite(army) || army < 1 || army > 120;
});
ok(degenerateLords.length === 0, 'lord orduları 1..120 aralığında', `${degenerateLords.length} aykırı`);

const chronicle = sim.state.chronicle;
ok(chronicle.length <= 20, 'vakayiname 20 kayıtla sınırlı', `${chronicle.length}`);
const sortedDesc = chronicle.every((e, i) => i === 0 || chronicle[i - 1].day >= e.day);
ok(sortedDesc, 'vakayiname en yeniden eskiye sıralı');

const summaries = summarizeWars(sim.state);
ok(
  summaries.every((w) => w.days >= 0 && w.a !== w.b),
  'savaş özetleri geçerli',
  `${summaries.length} aktif savaş`,
);

/* ────────────────── 4. göç ve yardımcılar ────────────────── */

const legacy = { ...createInitialCampaignState('Komutan Demirhan', 'noble') } as Record<string, unknown>;
delete legacy.world;
const migrated = ensureWorld(legacy as never);
ok(
  migrated.wars.length === 0 && migrated.stats.events === 0 && typeof migrated.seed === 'number',
  'world alanı olmayan eski kayıt güvenle göç ediyor',
);

const route: LordLiveRouteState = {
  x: 0,
  z: 0,
  rotY: 0,
  targetSettlementId: null,
  waypoints: [],
  currentAction: 'bekliyor',
};
const lord = { ...seedState.lords[0], order: { kind: 'SIEGE' as const, targetSettlementId: 'lochana_castle', sinceDay: 1, siegeProgress: 0 } };
applyLordOrderToRoute(lord, route, seedState.settlements);
ok(
  route.waypoints.length > 0 && route.currentAction.includes('kuşatma'),
  'kuşatma emri rotaya dönüşüyor',
  `${route.waypoints.length} nokta · "${route.currentAction}"`,
);

console.log(fails === 0 ? '\n✅ CANLI DÜNYA SİMÜLASYONU DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
