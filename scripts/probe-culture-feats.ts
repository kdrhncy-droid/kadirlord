/**
 * probe-culture-feats.ts — 10.8: kültürel feat'ler tek kaynaktan ve gerçekten uygulanıyor mu?
 *
 *   npx tsx scripts/probe-culture-feats.ts
 */
import assert from 'node:assert/strict';
import { createInitialCampaignState } from '../src/game/rules.ts';
import {
  CULTURE_FEATS,
  PLAYABLE_CULTURES,
  getPlayerCulture,
  getPlayerCultureModifiers,
} from '../src/game/cultureBonuses.ts';
import { calculatePartyLogistics } from '../src/game/logistics.ts';
import { distanceToNearestRoad, getBiomeAt, getForestMaskAt } from '../src/game/mapGen.ts';
import { calculatePartyCallInfluenceCost } from '../src/game/armySystem.ts';

// 1. Kaynak bütünlüğü: 6 kültür, her satırın kod karşılığı işaretli
assert.equal(PLAYABLE_CULTURES.length, 6);
for (const culture of PLAYABLE_CULTURES) {
  const feat = CULTURE_FEATS[culture];
  assert.ok(feat, `${culture} tanımı var`);
  for (const line of feat.lines) {
    assert.ok(line.wiredIn.length > 3, `${culture}: "${line.text}" kod karşılığı işaretli`);
  }
  console.log(
    `✓ ${feat.title}: ${feat.lines.length} bağlı satır, ${feat.pendingLines.length} bekleyen (karta çıkmaz)`,
  );
}

// 2. Kültür seçimi oyuncu kahramanına yazılıyor
const battanian = createInitialCampaignState('Komutan Test', 'noble', {
  realisticBannerlordStart: true,
  culture: 'battania',
});
assert.equal(getPlayerCulture(battanian), 'battania');
assert.equal(getPlayerCultureModifiers(battanian).forestSpeedPenaltyReduction, 0.5);
console.log('✓ kültür seçimi oyuncu kahramanına işleniyor');

// 3. Arazi feat'leri lojistikte etkili
const findPoint = (pred: (x: number, z: number) => boolean) => {
  for (let x = -450; x <= 350; x += 10) {
    for (let z = -300; z <= 300; z += 10) {
      if (pred(x, z)) return { x, z };
    }
  }
  throw new Error('uygun arazi noktası bulunamadı');
};
const forestPoint = findPoint(
  (x, z) =>
    getForestMaskAt(x, z) > 0.35 &&
    getBiomeAt(x, z) !== 'NORTH_SNOW_PEAKS' &&
    distanceToNearestRoad(x, z) >= 4.5,
);
const desertPoint = findPoint(
  (x, z) =>
    getBiomeAt(x, z) === 'SOUTH_DESERT' &&
    getForestMaskAt(x, z) <= 0.35 &&
    distanceToNearestRoad(x, z) >= 4.5,
);
const baseParams = { healthyTroops: 40, cavalryCount: 0, morale: 70, legacyFoodUnits: 10 };

const forestNeutral = calculatePartyLogistics({ ...baseParams, ...forestPoint, culture: null });
const forestBattania = calculatePartyLogistics({ ...baseParams, ...forestPoint, culture: 'battania' });
assert.ok(
  forestBattania.terrainMultiplier > forestNeutral.terrainMultiplier,
  `Batanya ormanda hızlı olmalı (${forestBattania.terrainMultiplier} > ${forestNeutral.terrainMultiplier})`,
);
console.log(`✓ Batanya orman çarpanı: ${forestNeutral.terrainMultiplier} → ${forestBattania.terrainMultiplier}`);

const desertNeutral = calculatePartyLogistics({ ...baseParams, ...desertPoint, culture: null });
const desertAserai = calculatePartyLogistics({ ...baseParams, ...desertPoint, culture: 'aserai' });
assert.equal(desertAserai.terrainMultiplier, 1);
assert.ok(desertNeutral.terrainMultiplier < 1);
console.log(`✓ Aserai çöl çarpanı cezasız (nötr: ${desertNeutral.terrainMultiplier})`);

// 4. Ordu çağırma maliyeti kültür çarpanı (Sturgia %50 ucuz, Vlandiya %20 pahalı)
const state = createInitialCampaignState('Komutan Test', 'noble');
const foreignLord = state.lords.find((l) => !l.isPlayerClan && l.faction !== 'player' && l.faction !== 'bandits')!;
const withCulture = (culture: string) =>
  calculatePartyCallInfluenceCost(foreignLord, {
    ...state,
    heroes: (state.heroes ?? []).map((h) => (h.kind === 'PLAYER' ? { ...h, culture: culture as never } : h)),
  });
const sturgiaCost = withCulture('sturgia');
const vlandiaCost = withCulture('vlandia');
assert.ok(sturgiaCost < vlandiaCost, `Sturgia ucuz, Vlandiya pahalı olmalı (${sturgiaCost} < ${vlandiaCost})`);
console.log(`✓ ordu çağırma maliyeti kültüre göre: Sturgia ${sturgiaCost} < Vlandiya ${vlandiaCost}`);

console.log('\n✅ KÜLTÜREL FEATLER TEK KAYNAKTAN DOĞRU');
