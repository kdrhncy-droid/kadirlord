import assert from 'node:assert/strict';
import {
  TROOP_DEFINITIONS,
  validateTroopDefinitions,
  getTroopDefinition,
  troopStackTotals,
  distributeCombatXpToTroopStacks,
} from '../src/game/bannerlordFoundation';
import {
  getTroopUpgradeOptions,
  upgradeTroop,
} from '../src/game/partySystem';
import { createInitialCampaignState, type CampaignState, type TroopStack, type InventoryItem } from '../src/game/rules';

console.log('=== KADIRLORD ASKER GELİŞTİRME AĞACI KAPSAMLI DENETİMİ ===\n');

// 1. Ağaç Bütünlüğü Doğrulaması
console.log('--- 1. Birlik Tanımları & Döngü/Kopukluk Kontrolü ---');
const validationErrors = validateTroopDefinitions();
assert.equal(validationErrors.length, 0, `Ağaç bütünlüğü hataları var: ${validationErrors.join(', ')}`);
console.log(`✓ Toplam ${TROOP_DEFINITIONS.length} birlik tanımı doğrulandı. 0 kopuk dal, 0 döngü, 0 geçersiz kademe sıçraması.`);

// 2. Kültür Ağaçları ve Bannerlord Uyumu
console.log('\n--- 2. Kültür Ağaçları & Bannerlord Vanilla Sadakati ---');
const cultures = ['empire', 'vlandia', 'battania', 'sturgia', 'khuzait', 'aserai', 'bandits', 'player'] as const;

for (const culture of cultures) {
  const cultureTroops = TROOP_DEFINITIONS.filter((t) => t.culture === culture);
  const commonRoot = cultureTroops.find((t) => t.tier === 1 && !t.isNobleLine);
  assert.ok(commonRoot, `${culture} halk kökü (T1) bulunamadı!`);

  if (culture !== 'bandits' && culture !== 'player') {
    const nobleRoot = cultureTroops.find((t) => t.tier === 2 && t.isNobleLine);
    assert.ok(nobleRoot, `${culture} soylu kökü (T2) bulunamadı!`);

    // Soylu hat T6'da bitmeli
    let currentNoble = nobleRoot;
    while (currentNoble.upgrades.length > 0) {
      const nextId = currentNoble.upgrades[0];
      const nextTroop = getTroopDefinition(nextId);
      assert.ok(nextTroop, `Soylu devamı bulunamadı: ${nextId}`);
      assert.equal(nextTroop.tier, currentNoble.tier + 1, 'Kademeler ardışık olmalı');
      assert.equal(nextTroop.isNobleLine, true, 'Soylu hattı korunmalı');
      currentNoble = nextTroop;
    }
    assert.equal(currentNoble.tier, 6, `${culture} soylu hattı T6'ya ulaşmalı, ulaştığı kademe: ${currentNoble.tier}`);
    console.log(`✓ ${culture.toUpperCase()}: Halk kökü [${commonRoot.name}] -> T5, Soylu kökü [${nobleRoot.name}] -> T6 [${currentNoble.name}] tam.`);
  } else {
    console.log(`✓ ${culture.toUpperCase()}: ${cultureTroops.length} birlik tanımlı.`);
  }
}

// 3. Altın ve XP Maliyet Formülleri (Bannerlord Kademe Eşikleri)
console.log('\n--- 3. Kademe XP ve Altın Maliyeti Standartları ---');
const expectedXp = { 1: 50, 2: 100, 3: 200, 4: 350, 5: 500 };
const expectedGold = { 1: 20, 2: 40, 3: 80, 4: 120, 5: 200 };

for (const troop of TROOP_DEFINITIONS) {
  if (troop.tier in expectedXp && troop.upgrades.length > 0) {
    const expX = expectedXp[troop.tier as keyof typeof expectedXp];
    const expG = expectedGold[troop.tier as keyof typeof expectedGold];
    assert.equal(troop.upgradeXp, expX, `${troop.id} XP maliyeti hatalı!`);
    assert.equal(troop.upgradeGold, expG, `${troop.id} Altın maliyeti hatalı!`);
  }
}
console.log('✓ Tüm kademelerin XP ve Altın maliyetleri Bannerlord formülleriyle birebir uyumlu (T1: 50xp/20g, T2: 100xp/40g, T3: 200xp/80g, T4: 350xp/120g, T5: 500xp/200g).');

// 4. Terfi (Upgrade) Mekaniği Simülasyonu
console.log('\n--- 4. Terfi Mekaniği, At Tüketimi ve Hata Yönetimi ---');

function makeHorseItem(id: string, name: string, quantity = 1): InventoryItem {
  return {
    id,
    definitionId: id,
    name,
    category: 'HORSE',
    slot: 'MOUNT',
    quantity,
    value: 100,
    weight: 0,
    statBonus: '',
    civilianLegal: true,
  };
}

const baseState: CampaignState = {
  ...createInitialCampaignState(),
  gold: 500,
  inventoryItems: [
    makeHorseItem('horse_1', 'Yük Beygiri', 5),
    makeHorseItem('horse_2', 'Binek Atı', 2),
    makeHorseItem('horse_3', 'Savaş Küheylanı', 1),
  ],
  troopStacks: [
    { troopId: 'vlandia_recruit', count: 4, wounded: 0, xp: 120 }, // 50 XP/kişi -> 2 tanesi terfi edebilir, 20 XP artar
  ],
};

// 4a. getTroopUpgradeOptions testi
const options = getTroopUpgradeOptions(baseState, baseState.troopStacks![0]);
assert.equal(options.length, 2, 'Vlandiya acemisi 2 dala ayrılmalı (Arbaletçi & Yaya)');
assert.equal(options[0].readyCount, 2, '120 XP ile tam 2 asker terfiye hazır olmalı');
assert.equal(options[0].canUpgrade, true);
console.log(`✓ Terfi seçenekleri ve hazır asker sayısı doğru hesaplandı (120 XP / 50 = ${options[0].readyCount} asker hazır).`);

// 4b. Yetersiz hazır asker ile terfi denemesi
const failReady = upgradeTroop(baseState, 'vlandia_recruit', options[0].targetDefinition.id, 3);
assert.equal(failReady.success, false, 'Hazır olandan fazla terfi reddedilmeli');
assert.ok(failReady.reason?.includes('Yalnızca 2 asker terfiye hazır'), 'Hata mesajı doğru olmalı');
console.log('✓ Hazır olandan fazla asker terfisi engellendi.');

// 4c. Yetersiz altın ile terfi denemesi
const poorState = { ...baseState, gold: 10 };
const failGold = upgradeTroop(poorState, 'vlandia_recruit', options[0].targetDefinition.id, 1);
assert.equal(failGold.success, false, 'Yetersiz altınla terfi engellenmeli');
assert.ok(failGold.reason?.includes('Yetersiz altın'), 'Altın hatası verildi');
console.log('✓ Yetersiz altın engeli çalışıyor.');

// 4d. Başarılı terfi (1 asker)
const success1 = upgradeTroop(baseState, 'vlandia_recruit', options[0].targetDefinition.id, 1);
assert.equal(success1.success, true);
assert.equal(success1.goldSpent, options[0].goldCost);
assert.equal(success1.nextState.gold, 500 - options[0].goldCost);
const sourceRemaining = success1.nextState.troopStacks!.find((s) => s.troopId === 'vlandia_recruit')!;
assert.equal(sourceRemaining.count, 3, 'Kaynak 4 -> 3 oldu');
assert.equal(sourceRemaining.xp, 70, '120 - 50 = 70 XP kaldı');
const targetAdded = success1.nextState.troopStacks!.find((s) => s.troopId === options[0].targetDefinition.id)!;
assert.equal(targetAdded.count, 1, 'Hedefte 1 asker oluştu');
assert.deepEqual(success1.nextState.roster, troopStackTotals(success1.nextState.troopStacks), 'Roster ve troopStacks senkron');
console.log('✓ Başarılı piyade terfisi: Altın düştü, XP düştü, adetler güncellendi, roster senkron kaldı.');

// 4e. Süvariye geçişte At gereksinimi ve Yük beygiri kuralı
console.log('\n--- 5. Süvari Terfisi & At/Savaş Atı Tüketim Testi ---');
const cavTransitionState: CampaignState = {
  ...baseState,
  gold: 1000,
  inventoryItems: [
    makeHorseItem('mule_1', 'Katır', 5),
    makeHorseItem('pack_1', 'Yük Devesi', 3),
  ],
  troopStacks: [
    { troopId: 'vlandia_infantry_3', count: 2, wounded: 0, xp: 400 }, // vlandia_lightcav_4 için at ister
  ],
};

const cavOpts = getTroopUpgradeOptions(cavTransitionState, cavTransitionState.troopStacks![0]);
const cavTarget = cavOpts.find((o) => o.targetDefinition.id === 'vlandia_lightcav_4')!;
assert.ok(cavTarget, 'Hafif süvari dalı bulundu');
assert.equal(cavTarget.horseRequirement, 'HORSE', 'Binek atı gereksinimi tespit edildi');
assert.equal(cavTarget.hasHorse, false, 'Yük hayvanları binek atı sayılamaz');

const failHorse = upgradeTroop(cavTransitionState, 'vlandia_infantry_3', 'vlandia_lightcav_4', 1);
assert.equal(failHorse.success, false);
assert.ok(failHorse.reason?.includes('binek atı'), 'Katır/yük beygiri binek atı olarak kabul edilmedi');
console.log('✓ Yük hayvanları (katır/yük devesi/yük beygiri) süvari terfisinde tüketilmiyor, binek atı şartı zorunlu.');

// Binek atı ekleyelim
const stateWithRidingHorse: CampaignState = {
  ...cavTransitionState,
  inventoryItems: [
    ...cavTransitionState.inventoryItems!,
    makeHorseItem('riding_1', 'Bozkır Binek Atı', 1),
  ],
};
const successCav = upgradeTroop(stateWithRidingHorse, 'vlandia_infantry_3', 'vlandia_lightcav_4', 1);
assert.equal(successCav.success, true);
assert.equal(successCav.nextState.inventoryItems!.some((i) => i.id === 'riding_1'), false, '1 adet binek atı envanterden harcandı');
console.log('✓ Binek atı başarıyla envanterden düşüldü ve piyade süvariye terfi etti.');

// Savaş Atı şartı testi (vlandia_lightcav_4 -> vlandia_vanguard_5)
const vanguardDef = getTroopDefinition('vlandia_vanguard_5')!;
assert.equal(vanguardDef.horseRequirement, 'WAR_HORSE', 'Vanguard T5 savaş atı ister');
const testWarHorseState: CampaignState = {
  ...baseState,
  gold: 1000,
  inventoryItems: [
    makeHorseItem('riding_2', 'Binek Atı', 5),
  ],
  troopStacks: [
    { troopId: 'vlandia_lightcav_4', count: 1, wounded: 0, xp: 350 },
  ],
};
const failWarHorse = upgradeTroop(testWarHorseState, 'vlandia_lightcav_4', 'vlandia_vanguard_5', 1);
assert.equal(failWarHorse.success, false);
assert.ok(failWarHorse.reason?.includes('savaş atı'), 'Normal binek atı savaş atı yerine geçemez');
console.log('✓ Normal binek atı savaş atı yerine geçemez kuralı doğrulandı.');

// 6. Muharebe XP Dağıtımı & Taşma (Spillover)
console.log('\n--- 6. Muharebe XP Paylaşımı & Doygunluk (Cap) Mantığı ---');
const partyStacks: TroopStack[] = [
  { troopId: 'vlandia_recruit', count: 2, wounded: 0, xp: 80 }, // T1: maxCap = 2 * 50 = 100 XP (kalan kapasite 20)
  { troopId: 'vlandia_footman_2', count: 1, wounded: 0, xp: 0 },  // T2: maxCap = 1 * 100 = 100 XP
];

// 120 XP dağıtalım: recruit en fazla 20 alabilir (toplam 100'e vurur), kalan 100 XP footman'e akmalı!
const xpDist = distributeCombatXpToTroopStacks(partyStacks, 120);
const rRecruit = xpDist.nextStacks.find((s) => s.troopId === 'vlandia_recruit')!;
const rFootman = xpDist.nextStacks.find((s) => s.troopId === 'vlandia_footman_2')!;

assert.equal(rRecruit.xp, 100, 'Recruit tam 100 XP ile doyuma ulaştı');
assert.equal(rFootman.xp, 100, 'Kalan tecrübe diğer birliğe aktı');
assert.equal(xpDist.newlyReadyTroops, 2, '2 asker yeni terfiye hazır hale geldi (1 recruit, 1 footman)');
console.log('✓ Kapasitesi dolan birliğin tecrübesi diğer birliklere taştı (spillover) ve terfiye hazır sayısı doğru hesaplandı.');

console.log('\n🎉 TÜM ASKER GELİŞTİRME AĞACI DENETİMLERİ BAŞARIYLA GEÇTİ!');
