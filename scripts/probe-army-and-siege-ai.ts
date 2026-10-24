import assert from 'node:assert/strict';
import { createInitialCampaignState, getTotalTroops } from '../src/game/rules';
import {
  SIEGE_CAMP_STANDOFF,
  getBesiegerSlotAssignments,
  getSiegeCampSlotPoint,
} from '../src/game/siegeMechanics';
import {
  combineBesiegerForces,
  distributeCombinedBesiegerCasualties,
} from '../src/game/siegeEncounter';
import { evaluateSiegeThreatReaction } from '../src/game/encounter';
import { advanceSieges, ensureWorld } from '../src/game/worldSim';
import {
  advanceArmiesDaily,
  boostArmyCohesion,
  calculateCohesionBoostCost,
  calculateDailyCohesionLoss,
  calculatePartyCallInfluenceCost,
  createOrExpandPlayerArmy,
  getPlayerArmy,
} from '../src/game/armySystem';

console.log('=== PROBE: Görev 2 (Ordu & Uyum) + Çoklu Kuşatma Yay Çemberi + Kuşatma Tehdit AI ===');

// ─────────────────────────────────────────────────────────────────────────────
// 1. ÇOKLU LORD KUŞATMA YAY ÇEMBERİ & MÜŞTEREK MUHAREBE DOĞRULAMASI
// ─────────────────────────────────────────────────────────────────────────────
{
  const state = createInitialCampaignState('Komutan Demirhan', 'noble');
  const target = state.settlements.find((s) => s.id === 'zeonica')!;

  const s0 = getSiegeCampSlotPoint(target, target.x + 30, target.z, 0, 3);
  const s1 = getSiegeCampSlotPoint(target, target.x + 30, target.z, 1, 3);
  const s2 = getSiegeCampSlotPoint(target, target.x + 30, target.z, 2, 3);

  const d01 = Math.hypot(s0.x - s1.x, s0.z - s1.z);
  const d02 = Math.hypot(s0.x - s2.x, s0.z - s2.z);
  const d12 = Math.hypot(s1.x - s2.x, s1.z - s2.z);

  assert.ok(d01 > 6.5, `Slot 0 ve Slot 1 üst üste binmemeli (mesafe: ${d01.toFixed(2)}m)`);
  assert.ok(d02 > 6.5, `Slot 0 ve Slot 2 üst üste binmemeli (mesafe: ${d02.toFixed(2)}m)`);
  assert.ok(d12 > 13.0, `Sağ ve sol kanat yuvaları birbirinden ayrı olmalı (mesafe: ${d12.toFixed(2)}m)`);

  const r0 = Math.hypot(s0.x - target.x, s0.z - target.z);
  const r1 = Math.hypot(s1.x - target.x, s1.z - target.z);
  assert.ok(Math.abs(r0 - SIEGE_CAMP_STANDOFF) < 1.5, 'Merkez slot SIEGE_CAMP_STANDOFF yarıçapında olmalı');
  assert.ok(Math.abs(r1 - SIEGE_CAMP_STANDOFF) < 1.5, 'Kanat slotu SIEGE_CAMP_STANDOFF yarıçapında olmalı');

  const threeLords = state.lords.slice(0, 3).map((l, idx) => ({
    ...l,
    roster: { infantry: 10 + idx * 2, archer: 8, cavalry: 6, horseArcher: 4 },
    armySize: 28 + idx * 2,
    order: {
      kind: 'SIEGE' as const,
      targetSettlementId: target.id,
      sinceDay: state.day,
      siegeProgress: 50,
    },
  }));

  const slotsMap = getBesiegerSlotAssignments(target, threeLords);
  assert.equal(slotsMap.size, 3, '3 kuşatmacı lordun tamamına ayrı yay yuvası atanmalı');

  const combined = combineBesiegerForces(threeLords);
  assert.ok(combined, 'combineBesiegerForces birleşik komutan döndürmeli');
  const expectedTotal = threeLords.reduce((sum, l) => sum + getTotalTroops(l.roster), 0);
  assert.equal(
    getTotalTroops(combined!.roster),
    expectedTotal,
    `Müşterek kuşatma ordusu 3 lordun toplam askerini (${expectedTotal}) içermeli`,
  );

  const afterDefeat = distributeCombinedBesiegerCasualties(
    threeLords,
    target.id,
    true,
    Math.round(expectedTotal * 0.8),
    state.day,
  );
  assert.ok(
    afterDefeat.every((l) => l.order?.kind === 'FLEE'),
    'Müşterek kuşatma ordusu yenildiğinde tüm kuşatan lordların kuşatma emri kalkıp FLEE olmalı',
  );
  console.log('✓ [1/3] Çoklu Lord Kuşatma Yay Çemberi ve Müşterek Muharebe doğrulandı.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. KUŞATMA TEHDİT AI (LIFT_SIEGE / INTERCEPT / SIEGE) DOĞRULAMASI
// ─────────────────────────────────────────────────────────────────────────────
{
  // A) Üstün yardım ordusu + garnizon hurucu -> LIFT_SIEGE
  const liftRes = evaluateSiegeThreatReaction({
    totalBesiegerStrength: 100,
    reliefForceStrength: 115,
    defenderStrength: 60, // 115 + 60*0.5 = 145 >= 100*1.35 (135)
    distance: 42, // <= 55m
    reliefPos: { x: 40, z: 80 },
    siegePos: { x: 24, z: 78 },
  });
  assert.equal(liftRes.kind, 'LIFT_SIEGE', 'Üstün yardım ordusu yaklaştığında LIFT_SIEGE dönmeli');
  assert.ok(liftRes.targetPos, 'LIFT_SIEGE geri çekilme koordinatı üretmeli');

  // B) Zayıf yardım ordusu 28m içine girdi -> INTERCEPT
  const interceptRes = evaluateSiegeThreatReaction({
    totalBesiegerStrength: 140,
    reliefForceStrength: 90, // 140 >= 90*1.15 (103.5)
    defenderStrength: 40,
    distance: 22, // <= 28m
    reliefPos: { x: 35, z: 78 },
    siegePos: { x: 24, z: 78 },
  });
  assert.equal(interceptRes.kind, 'INTERCEPT', 'Zayıf yardım ordusu 28m içine girdiğinde INTERCEPT dönmeli');

  // C) Uzakta veya dengeli -> SIEGE devam
  const keepRes = evaluateSiegeThreatReaction({
    totalBesiegerStrength: 130,
    reliefForceStrength: 100,
    defenderStrength: 40,
    distance: 70, // > 55m
  });
  assert.equal(keepRes.kind, 'SIEGE', 'Tehdit menzil dışındayken SIEGE korunmalı');

  // D) worldSim.advanceSieges içinde üstün oyuncu ordusu yaklaştığında kuşatmanın kalkması
  let simState = createInitialCampaignState('Komutan Demirhan', 'noble');
  const settlement = simState.settlements.find((s) => s.id === 'zeonica')!;
  const besieger = simState.lords[0];
  simState = {
    ...simState,
    playerX: settlement.x + 18,
    playerZ: settlement.z + 10,
    roster: { infantry: 45, archer: 40, cavalry: 35, horseArcher: 30 }, // Çok güçlü oyuncu ordusu
    lords: simState.lords.map((l, i) =>
      i === 0
        ? {
            ...l,
            faction: 'vlandia',
            isAtWarWithPlayer: true,
            x: settlement.x + 20,
            z: settlement.z,
            roster: { infantry: 8, archer: 6, cavalry: 4, horseArcher: 2 },
            armySize: 20,
            order: {
              kind: 'SIEGE',
              targetSettlementId: settlement.id,
              sinceDay: simState.day,
              siegeProgress: 40,
            },
          }
        : l,
    ),
  };
  const world = ensureWorld(simState);
  const siegeOut = advanceSieges(simState, world, undefined, () => 0.5);
  const updatedBesieger = siegeOut.lords.find((l) => l.id === besieger.id)!;
  assert.equal(
    updatedBesieger.order?.kind,
    'FLEE',
    'advanceSieges içinde üstün yardım ordusu 55m içindeyken kuşatan lord FLEE emrine geçmeli',
  );
  console.log('✓ [2/3] Kuşatma Tehdit AI (LIFT_SIEGE / INTERCEPT / SIEGE) doğrulandı.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ORDU & UYUM (ARMY & COHESION) SİSTEMİ DOĞRULAMASI
// ─────────────────────────────────────────────────────────────────────────────
{
  let state = createInitialCampaignState('Komutan Demirhan', 'noble');
  state = {
    ...state,
    influence: 150,
    food: 40,
    lords: state.lords.map((l, idx) => {
      if (idx === 0) {
        return {
          ...l,
          isPlayerClan: true,
          isAlliedWithPlayer: true,
          isAtWarWithPlayer: false,
          relation: 50,
          foodDays: 0, // Aç — ordudan erzak paylaşımı testi için
        };
      }
      if (idx === 1) {
        return {
          ...l,
          isPlayerClan: false,
          isAlliedWithPlayer: true,
          isAtWarWithPlayer: false,
          relation: 20,
          clanTier: 3,
          foodDays: 5,
        };
      }
      return l;
    }),
  };

  const ownClanLord = state.lords[0];
  const vassalLord = state.lords[1];

  const ownCost = calculatePartyCallInfluenceCost(ownClanLord, state);
  const vassalCost = calculatePartyCallInfluenceCost(vassalLord, state);

  assert.equal(ownCost, 0, 'Kendi klanındaki yoldaş/aile partisinin çağrı maliyeti 0 Nüfuz olmalı');
  assert.ok(
    vassalCost >= 15 && vassalCost <= 65,
    `Diğer klan lordunun çağrı maliyeti 15..65 Nüfuz aralığında olmalı (hesaplanan: ${vassalCost})`,
  );

  const created = createOrExpandPlayerArmy(state, [ownClanLord.id, vassalLord.id], 'zeonica');
  assert.ok(created.success, 'Ordu başarıyla kurulmalı');
  assert.equal(created.influenceSpent, vassalCost, 'Toplam harcanan nüfuz yalnız yabancı lordun maliyeti olmalı');
  state = created.nextState;

  const army = getPlayerArmy(state);
  assert.ok(army, 'getPlayerArmy aktif oyuncu ordusunu döndürmeli');
  assert.equal(army!.cohesion, 100, 'Yeni kurulan ordunun başlangıç uyumu 100 olmalı');
  assert.equal(army!.memberLordIds.length, 2, 'Orduda 2 üye parti bulunmalı');

  const expectedLoss = calculateDailyCohesionLoss(army!, state);
  // 10.11: -2 baz -1/parti -0.5/aç parti. Fikstürde 2 üye parti + 1 aç üye var.
  const starvingMembers = state.lords.filter(
    (l) => army!.memberLordIds.includes(l.id) && (l.foodDays ?? 5) <= 0,
  ).length;
  assert.equal(
    expectedLoss,
    -2 - army!.memberLordIds.length - 0.5 * starvingMembers,
    `Günlük uyum kaybı Bannerlord modeline uymalı (${expectedLoss})`,
  );

  // Günlük Ordu & Erzak Paylaşımı döngüsü
  const beforeFood = state.food;
  const beforeInf = state.influence ?? 0;
  const dailyRes = advanceArmiesDaily(state);
  state = dailyRes.nextState;

  const armyAfterDay1 = getPlayerArmy(state)!;
  assert.ok(
    armyAfterDay1.cohesion < 100,
    `1 gün sonra ordu uyumu düşmeli (100 -> ${armyAfterDay1.cohesion})`,
  );
  assert.ok(
    state.food < beforeFood && (state.influence ?? 0) === beforeInf + 2,
    'Aç kalan üye lord liderin erzağından beslenmeli ve lidere +2 Nüfuz kazandırmalı',
  );

  // +10 Uyum Artırma (Boost Cohesion)
  const boostCost = calculateCohesionBoostCost(armyAfterDay1, state);
  // 10.11: +10 maliyeti = üye çağrı maliyetleri toplamının %10'u; kendi klan
  // partisi (0) girmez, yalnız yabancı lordunkinin %10'u kalır.
  assert.equal(
    boostCost,
    Math.round(vassalCost * 0.1),
    '+10 Uyum maliyeti, yabancı partilerin çağrı maliyetinin %10\'u olmalı',
  );
  const boosted = boostArmyCohesion(state);
  assert.ok(boosted.success, '+10 Uyum artışı başarılı olmalı');
  assert.equal(boosted.influenceSpent, boostCost, '+10 Uyum için doğru nüfuz düşülmeli');
  state = boosted.nextState;

  // Cohesion <= 0 olduğunda otomatik dağılma testi
  state = {
    ...state,
    armies: state.armies!.map((a) => ({ ...a, cohesion: 2 })),
  };
  const disbandedTick = advanceArmiesDaily(state);
  assert.equal(
    getPlayerArmy(disbandedTick.nextState),
    null,
    'Cohesion <= 0 olduğunda ordu otomatik olarak dağılmalı (disbandArmy)',
  );

  console.log('✓ [3/3] Ordu & Uyum (Army & Cohesion) sistemi doğrulandı.');
}

console.log('=== TÜM PROBE TESTLERİ BAŞARIYLA GEÇTİ ===');
