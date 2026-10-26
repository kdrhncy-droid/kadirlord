/**
 * Kullanıcı bildirimleri probu (2026-10-24):
 * 1) Yeni kayıtta isimsiz lord partisi var mı?
 * 2) ESCORT (kervan) görevi kabul edilmeden aktif mi? Çıkış köyü neresi?
 * 3) Evinde (REINFORCE) ama asker sayısı tavanın üstünde olan lord erzak
 *    doldurabiliyor mu, yoksa "asker toplarken" eriyor mu?
 * 4) REINFORCE etiketi yoldayken de "asker topluyor" mu diyor?
 */
import { createInitialCampaignState, getTotalTroops } from '../src/game/rules.ts';
import { buildQuestLog } from '../src/game/quests.ts';
import { advanceUpkeep } from '../src/game/worldSim.ts';
import {
  applyLordOrderToRoute,
  type LordLiveRouteState,
} from '../src/game/campaignSystem.ts';

const state = createInitialCampaignState('Komutan Demirhan', 'noble');

// 1) İsimler
const nameless = state.lords.filter((l) => !l.name || l.name.trim().length === 0);
console.log(`1) Lord partileri: ${state.lords.length}, isimsiz: ${nameless.length}`);

// 2) ESCORT aktivasyonu
const log = buildQuestLog(state);
const escort = log.active.find((q) => q.kind === 'ESCORT');
const origin = escort?.originSettlementId
  ? state.settlements.find((s) => s.id === escort.originSettlementId)
  : undefined;
console.log(
  `2) Aktif görevler: ${log.active.map((q) => q.kind).join(', ')} | ESCORT: ${escort ? `AKTİF (çıkış: ${origin?.name}, ${origin?.faction})` : 'yok'}`,
);

// 3) Evde tavan üstü lord: erzak erimesi
const home = state.settlements.find((s) => s.type !== 'VILLAGE' && s.faction !== 'bandits')!;
const cap = Math.max(24, Math.min(60, home.garrison + 22));
const lord = state.lords.find((l) => l.faction === home.faction)!;
const testLord = {
  ...lord,
  x: home.x,
  z: home.z,
  roster: { infantry: cap + 20, archer: 10, cavalry: 10, horseArcher: 0 },
  armySize: cap + 40,
  foodDays: 1,
  order: { kind: 'REINFORCE' as const, targetSettlementId: home.id, sinceDay: state.day },
};
const before = getTotalTroops(testLord.roster);
const r1 = advanceUpkeep(state, state.settlements, [testLord], undefined);
const r2 = advanceUpkeep(state, r1.settlements, r1.lords, undefined);
const after = r2.lords[0];
console.log(
  `3) Evde REINFORCE (tavan ${cap}): asker ${before} → ${getTotalTroops(after.roster ?? { infantry: 0, archer: 0, cavalry: 0, horseArcher: 0 })}, erzak günü 1 → ${after.foodDays}`,
);

// 4) Etiket: hedeften uzaktayken
const route: LordLiveRouteState = {
  x: home.x + 120,
  z: home.z + 120,
  rotY: 0,
  targetSettlementId: null,
  waypoints: [],
  currentAction: '',
};
applyLordOrderToRoute({ ...testLord, x: route.x, z: route.z }, route, state.settlements);
console.log(`4) Uzakta REINFORCE etiketi: "${route.currentAction}"`);
