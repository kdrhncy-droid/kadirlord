import assert from 'node:assert';
import * as THREE from 'three';
import { createInitialCampaignState } from '../src/game/rules';
import {
  applyDivisionCasualtyShock,
  applyReinforcementMoraleBoost,
  canMaintainCouchLance,
  computeArcherAimVelocity,
  computeRelativeSpeedBonus,
  createDivisionMoraleState,
  derivePlayerBattleLoadout,
  getUnitClassCombatSpec,
  resolveDirectionalMeleeHit,
  shouldUnitUseRanged,
  splitBattleCasualties,
  stepBallisticArrow,
  stepDivisionMorale,
  type BallisticArrow,
} from '../src/game/battleCombat';
import { animateWarriorRigPose, createWarriorModel } from '../src/game/proceduralModels';

// ── 1. Oyuncu Savaş Teçhizatı Türetimi (Hero Equipment -> Battle Loadout)
const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const loadout = derivePlayerBattleLoadout(campaign);
assert.ok(loadout.meleeAttack >= 24, 'Oyuncu yakın dövüş hasarı anlamlı olmalı');
assert.ok(loadout.meleeReach >= 1.9, 'Oyuncu yakın dövüş menzili anlamlı olmalı');
assert.ok(loadout.maxShieldHp >= 120, 'Kalkan dayanıklılığı anlamlı olmalı');
assert.equal(loadout.isMounted, true, 'Başlangıç kahramanının binek atı olmalı');
assert.ok(loadout.maxAmmo >= 18, 'Sadak ok kapasitesi anlamlı olmalı');
console.log('✓ 1. Oyuncu teçhizatı kahraman ekipmanından doğru türetildi:', {
  meleeWeaponName: loadout.meleeWeaponName,
  meleeAttack: loadout.meleeAttack,
  maxShieldHp: loadout.maxShieldHp,
  maxAmmo: loadout.maxAmmo,
});

// ── 2. 4 Yönlü Yakın Dövüş, Hız Bonusu, Kalkan Kırılması ve Koltuklanmış Kargı (B6)
assert.ok(computeRelativeSpeedBonus(0) === 1, 'Durgun hız çarpanı 1.0 olmalı');
assert.ok(computeRelativeSpeedBonus(10) > 1.45, 'Hızlı yaklaşma pozitif momentum bonusu vermeli');
assert.ok(computeRelativeSpeedBonus(-5) < 1.0, 'Geri çekilirken vuruş momentumu düşmeli');

assert.equal(canMaintainCouchLance(false, 9.5, 0), false, 'Yaya iken kargı koltuklanamaz');
assert.equal(canMaintainCouchLance(true, 4.2, 0), false, 'Düşük hızda kargı koltuklanamaz');
assert.equal(canMaintainCouchLance(true, 8.2, 0), true, 'At sırtında yüksek hızda kargı koltuklanabilir');

// Kalkan bloklaması ve kalkan kırılması
const shieldBlockHit = resolveDirectionalMeleeHit({
  baseAttack: 40,
  targetDefense: 20,
  attackDirection: 'LEFT',
  isTargetBlocking: true,
  targetBlockDirection: 'RIGHT',
  targetShieldHp: 100,
  relativeClosingSpeed: 2,
  isCouchedLance: false,
  isHeavyStrike: false,
});
assert.equal(shieldBlockHit.shieldBlocked, true, 'Kalkan darbeyi karşılamalı');
assert.equal(shieldBlockHit.hpDamage, 0, 'Sağlam kalkan HP hasarını sıfırlamalı');
assert.ok(shieldBlockHit.nextShieldHp < 100, 'Kalkan dayanıklılığı azalmalı');

const shieldBreakHit = resolveDirectionalMeleeHit({
  baseAttack: 48,
  targetDefense: 16,
  attackDirection: 'UP',
  isTargetBlocking: true,
  targetBlockDirection: 'DOWN',
  targetShieldHp: 20,
  relativeClosingSpeed: 6,
  isCouchedLance: false,
  isHeavyStrike: false,
});
assert.equal(shieldBreakHit.shieldBroken, true, 'Düşük HP kalkan ağır darbede kırılmalı');
assert.equal(shieldBreakHit.nextShieldHp, 0, 'Kırılan kalkanın HP değeri 0 olmalı');

// Koltuklanmış kargı darbesi
const couchHit = resolveDirectionalMeleeHit({
  baseAttack: 38,
  targetDefense: 22,
  attackDirection: 'DOWN',
  isTargetBlocking: false,
  targetBlockDirection: 'UP',
  targetShieldHp: 0,
  relativeClosingSpeed: 9.2,
  isCouchedLance: true,
  isHeavyStrike: false,
});
assert.ok(couchHit.hpDamage >= 110, `Koltuklanmış kargı yıkıcı hasar vermeli (${couchHit.hpDamage})`);
console.log('✓ 2. 4 yönlü dövüş, kalkan kırılması ve koltuklanmış kargı doğrulandı');

// ── 3. Balistik Ok Fiziği ve Sınırlı Sadak / Yakın Dövüşe Geçiş (B6)
const archerSpec = getUnitClassCombatSpec('archer');
assert.equal(archerSpec.maxAmmo, 30, 'Yaya okçu 30 ok ile başlamalı');
assert.equal(shouldUnitUseRanged('archer', 15, false, 28), true, 'Ok varken ve menzildeyken yay kullanmalı');
assert.equal(shouldUnitUseRanged('archer', 0, false, 28), false, 'Oku biten okçu kılıca geçmeli');
assert.equal(shouldUnitUseRanged('archer', 15, true, 28), false, 'Ateş Kes emrinde yay kullanmamalı');
assert.equal(shouldUnitUseRanged('archer', 15, false, 2.2), false, 'Göğüs göğüse mesafede kılıca geçmeli');

const aimVel = computeArcherAimVelocity(
  { x: 0, y: 1.5, z: 0 },
  { x: 0, y: 1.4, z: -30, vx: 0, vz: 0 },
  42,
  0,
);
assert.ok(aimVel.vy > 1.5, 'Balistik nişan yerçekimini telafi etmek için yukarı eğim vermeli');
assert.ok(aimVel.vz < -35, 'Hedefe doğru ileri hız bileşeni olmalı');

const arrow: BallisticArrow = {
  id: 1,
  shooterId: -1,
  team: 'ally',
  x: 0,
  y: 1.45,
  z: 0,
  vx: 0,
  vy: 0.2,
  vz: -40,
  baseDamage: 32,
  age: 0,
  stuck: false,
  stuckTimer: 0,
  active: true,
};
const stepRes = stepBallisticArrow(
  arrow,
  0.05,
  () => 0,
  [
    {
      id: 7,
      team: 'enemy',
      x: 0,
      y: 0,
      z: -1.2,
      isMounted: false,
      isBlocking: false,
      shieldHp: 0,
      defense: 14,
      hp: 80,
    },
  ],
);
assert.ok(stepRes !== null, 'Uçan ok yol üzerindeki hedefe isabet etmeli');
assert.equal(stepRes.hitActorId, 7, 'Doğru hedef aktöre isabet etmeli');
assert.ok(stepRes.hpDamage >= 18, 'Ok isabeti zırh düşümü sonrası hasar vermeli');
console.log('✓ 3. Balistik ok uçuşu, sadak tükenmesi ve yan silaha geçiş doğrulandı');

// ── 4. Bölük Morali, Kayıp Şoku, Yedek Dalga Koruması ve Bozgun (B7)
const divMorale = createDivisionMoraleState('infantry', 20, { campaignMorale: 72 });
applyDivisionCasualtyShock(divMorale, 8, false);
assert.ok(divMorale.recentShock > 10, 'Kayıplar moral şoku biriktirmeli');

// Yedek dalga varken bozgun kilidi (B5 takviye dalgalarını korur)
stepDivisionMorale(divMorale, 1.0, {
  aliveInDivision: 2,
  commanderDown: true,
  hasReserves: true,
  battleElapsedSec: 25,
  allyStrengthRatio: 0.15,
});
assert.equal(divMorale.isRouting, false, 'Yedek dalga beklerken erken toplu bozgun tetiklenmemeli');

// Yedek dalga kalmadığında ağır kayıplı bölük bozguna uğramalı
const brokenMorale = createDivisionMoraleState('infantry', 20, { campaignMorale: 42 });
applyDivisionCasualtyShock(brokenMorale, 17, true);
for (let i = 0; i < 6; i++) {
  stepDivisionMorale(brokenMorale, 0.8, {
    aliveInDivision: 3,
    commanderDown: true,
    hasReserves: false,
    battleElapsedSec: 25,
    allyStrengthRatio: 0.12,
  });
}
assert.equal(brokenMorale.isRouting, true, 'Ağır kayıp + komutan düşmesi + süvari baskısında bölük bozguna uğramalı');

applyReinforcementMoraleBoost(brokenMorale, 15);
assert.equal(brokenMorale.isRouting, false, 'Takviye dalgası bozgunu toparlamalı');
console.log('✓ 4. Bölük morali, B5 yedek dalga koruması ve bozgun (rout) mekaniği doğrulandı');

// ── 5. Cerrah (Medicine) Becerisine Göre Yaralı / Ölü Ayrımı (B7)
const lowMedSplit = splitBattleCasualties({ infantry: 10, archer: 6, cavalry: 4, horseArcher: 0 }, 10);
const highMedSplit = splitBattleCasualties({ infantry: 10, archer: 6, cavalry: 4, horseArcher: 0 }, 100);
assert.equal(
  (lowMedSplit.killed.infantry ?? 0) + (lowMedSplit.wounded.infantry ?? 0),
  10,
  'Yaralı + ölü toplamı düşen asker sayısına eşit olmalı',
);
assert.ok(
  highMedSplit.survivalRate > lowMedSplit.survivalRate,
  'Yüksek Hekimlik (Medicine) becerisi yaralı kurtulma oranını artırmalı',
);
console.log('✓ 5. Hekimlik (Medicine) becerisine göre yaralı/ölü ayrımı doğrulandı:', {
  lowMedKilledInf: lowMedSplit.killed.infantry,
  highMedKilledInf: highMedSplit.killed.infantry,
});

// ── 6. 3B Karakter Rig Animasyon ve Silah Geçişi (Okçu Yay <-> Kılıç, Süvari Kargısı)
const archerRig = createWarriorModel({
  factionHex: 0x3b82f6,
  isMounted: false,
  isRanged: true,
});
assert.ok(archerRig.bowMesh && archerRig.meleeWeaponGroup, 'Okçu hem yay hem yan silah grubuna sahip olmalı');
animateWarriorRigPose(archerRig, {
  speed: 3.5,
  time: 1.2,
  phaseOffset: 0,
  isMounted: false,
  usingRanged: true,
  shieldIntact: false,
  isBlocking: false,
  blockDirection: 'LEFT',
  attackPhase: 'WINDUP',
  attackDirection: 'UP',
  attackProgress: 0.4,
  isCouchedLance: false,
});
assert.equal(archerRig.bowMesh?.visible, true, 'Okçu menzilli modda yay taşımalı');
assert.equal(archerRig.meleeWeaponGroup?.visible, false, 'Okçu menzilli modda kılıcı kında tutmalı');

animateWarriorRigPose(archerRig, {
  speed: 4.0,
  time: 1.5,
  phaseOffset: 0,
  isMounted: false,
  usingRanged: false,
  shieldIntact: true,
  isBlocking: true,
  blockDirection: 'UP',
  attackPhase: 'IDLE',
  attackDirection: 'RIGHT',
  attackProgress: 0,
  isCouchedLance: false,
});
assert.equal(archerRig.bowMesh?.visible, false, 'Okçu yakın dövüşe geçince yayı gizlemeli');
assert.equal(archerRig.meleeWeaponGroup?.visible, true, 'Okçu yakın dövüşe geçince kılıcını çekmeli');

const cavRig = createWarriorModel({
  factionHex: 0xf59e0b,
  isMounted: true,
  isRanged: false,
});
assert.ok((cavRig.horseLegs?.length ?? 0) === 4, 'Atlı birliğin 4 eklemli at bacağı olmalı');
animateWarriorRigPose(cavRig, {
  speed: 8.5,
  time: 0.8,
  phaseOffset: 0.3,
  isMounted: true,
  usingRanged: false,
  shieldIntact: true,
  isBlocking: false,
  blockDirection: 'LEFT',
  attackPhase: 'IDLE',
  attackDirection: 'DOWN',
  attackProgress: 0,
  isCouchedLance: true,
});
const legAngles = cavRig.horseLegs!.map((leg: THREE.Group) => Number(leg.rotation.x.toFixed(3)));
assert.ok(legAngles.some((a: number) => a !== 0), 'Dörtnala koşan atın bacakları hareket etmeli');
assert.ok(THREE.MathUtils.radToDeg(cavRig.rightArm.rotation.x) > 45, 'Koltuklanmış kargıda sağ kol ileri yatmalı');
console.log('✓ 6. 3B asker/at bacak animasyonu ve okçu yay-kılıç geçişi doğrulandı');

console.log('\nTÜM MEYDAN SAVAŞI (B6-B7) KONTROLLERİ GEÇTİ');
