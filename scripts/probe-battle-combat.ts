import assert from 'node:assert';
import * as THREE from 'three';
import { createInitialCampaignState } from '../src/game/rules';
import {
  applyDivisionCasualtyShock,
  applyReinforcementMoraleBoost,
  canMaintainCouchLance,
  computeArcherAimVelocity,
  computeDirectionalReticleState,
  computeRelativeSpeedBonus,
  createDivisionMoraleState,
  derivePlayerBattleLoadout,
  getUnitClassCombatSpec,
  resolveBattleActorCollisions,
  resolveDirectionalMeleeHit,
  shouldUnitUseRanged,
  splitBattleCasualties,
  stepBallisticArrow,
  stepDivisionMorale,
  stepPlayerAttackState,
  type BallisticArrow,
  type BattleAttackPhase,
  type CollidableBattleActor,
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
assert.ok((cavRig.horseKnees?.length ?? 0) === 4, 'Atlı birliğin 4 diz/topuk eklemi olmalı');
assert.ok(cavRig.horseNeck && cavRig.horseTail && cavRig.riderGroup, 'At boyun, kuyruk ve ayrı binici grubu (riderGroup) olmalı');
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
const kneeAngles = cavRig.horseKnees!.map((knee: THREE.Group) => Number(knee.rotation.x.toFixed(3)));
assert.ok(legAngles.some((a: number) => a !== 0), 'Dörtnala koşan atın bacakları hareket etmeli');
assert.ok(kneeAngles.some((a: number) => a > 0.1), 'Dörtnala koşan atın diz/topuk eklemleri bükülmeli');
assert.ok(cavRig.riderGroup!.position.y >= 0.75, 'Binici eyer yüksekliğinde (y >= 0.75) oturmalı');
assert.ok(THREE.MathUtils.radToDeg(cavRig.rightArm.rotation.x) > 45, 'Koltuklanmış kargıda sağ kol ileri yatmalı');

// Attan inildiğinde (isMounted: false) binici havada asılı kalmamalı, zemine inmeli ve bacakları düzelmeli
animateWarriorRigPose(cavRig, {
  speed: 4.2,
  time: 1.1,
  phaseOffset: 0.3,
  isMounted: false,
  usingRanged: false,
  shieldIntact: true,
  isBlocking: false,
  blockDirection: 'UP',
  attackPhase: 'IDLE',
  attackDirection: 'RIGHT',
  attackProgress: 0,
  isCouchedLance: false,
});
assert.ok(cavRig.riderGroup!.position.y < 0.1, 'Attan inen karakter zemine inmeli (havada asılı kalmamalı)');
assert.equal(cavRig.leftLeg.rotation.z, 0, 'Attan inen karakterin bacak açıklığı yaya yürüyüşe dönmeli');
console.log('✓ 6. 3B asker/at 2 eklemli bacak animasyonu, boyun/kuyruk salınımı ve attan inme geçişi doğrulandı');

// ── 7. 11.3: Basılı Tutarak Silah Hazır Bekletme (Hold-to-Chamber) & Bırakınca Savurma (Release-to-Swing)
let pPhase: BattleAttackPhase = 'IDLE';
let pTimer = 0;
let pCooldown = 0;

// Sol tık basıldı ve basılı tutuluyor: IDLE -> WINDUP
let out = stepPlayerAttackState({
  phase: pPhase,
  attackTimer: pTimer,
  cooldownTimer: pCooldown,
  dt: 0.05,
  mouseLeftHeld: true,
  mouseLeftJustPressed: true,
  mouseRightHeld: false,
  isRanged: false,
  ammo: 20,
  windupDuration: 0.15,
  activeDuration: 0.14,
  recoveryDuration: 0.22,
  meleeCooldown: 0.35,
  rangedCooldown: 0.65,
});
assert.equal(out.phase, 'WINDUP', 'Sol tık basıldığında WINDUP başlamalı');
assert.equal(out.triggeredRelease, false, 'Basılı tutulurken kılıç hemen savrulmamalı');
pPhase = out.phase;
pTimer = out.attackTimer;
pCooldown = out.cooldownTimer;

// 2.0 saniye boyunca (40 kare) sol tık basılı tutuluyor: READY aşamasında beklemeli, savurmamalı!
for (let f = 0; f < 40; f++) {
  out = stepPlayerAttackState({
    phase: pPhase,
    attackTimer: pTimer,
    cooldownTimer: pCooldown,
    dt: 0.05,
    mouseLeftHeld: true,
    mouseLeftJustPressed: false,
    mouseRightHeld: false,
    isRanged: false,
    ammo: 20,
    windupDuration: 0.15,
    activeDuration: 0.14,
    recoveryDuration: 0.22,
    meleeCooldown: 0.35,
    rangedCooldown: 0.65,
  });
  assert.equal(
    out.triggeredRelease,
    false,
    `Sol tık basılı tutulduğu sürece (kare ${f}) kılıç savrulmamalı`,
  );
  pPhase = out.phase;
  pTimer = out.attackTimer;
  pCooldown = out.cooldownTimer;
}
assert.equal(pPhase, 'READY', 'Sol tık basılı tutulurken karakter elini READY durumunda hazır bekletmeli');

// READY durumunda rig animasyonu silahı geride hazır tutmalı
animateWarriorRigPose(cavRig, {
  speed: 0,
  time: 2.0,
  phaseOffset: 0,
  isMounted: false,
  usingRanged: false,
  shieldIntact: true,
  isBlocking: false,
  blockDirection: 'UP',
  attackPhase: 'READY',
  attackDirection: 'RIGHT',
  attackProgress: 1,
  isCouchedLance: false,
});
assert.ok(cavRig.rightArm.rotation.y < -0.5, 'READY durumunda sağ kol savurmaya hazır geride beklemeli');

// Oyuncu sol tıktan elini çektiğinde (mouseLeftHeld: false) kılıç anında savrulmalı!
out = stepPlayerAttackState({
  phase: pPhase,
  attackTimer: pTimer,
  cooldownTimer: pCooldown,
  dt: 0.05,
  mouseLeftHeld: false,
  mouseLeftJustPressed: false,
  mouseRightHeld: false,
  isRanged: false,
  ammo: 20,
  windupDuration: 0.15,
  activeDuration: 0.14,
  recoveryDuration: 0.22,
  meleeCooldown: 0.35,
  rangedCooldown: 0.65,
});
assert.equal(out.phase, 'ACTIVE', 'Sol tık bırakıldığında ACTIVE savurma aşamasına geçmeli');
assert.equal(out.triggeredRelease, true, 'Sol tık bırakıldığı an vuruş tetiklenmeli (triggeredRelease = true)');

// Sağ tık (RMB) ile feint/iptal testi: READY aşamasında sağ tık basılırsa saldırı iptal olup IDLE'a dönmeli
const feintOut = stepPlayerAttackState({
  phase: 'READY',
  attackTimer: 0,
  cooldownTimer: 0,
  dt: 0.05,
  mouseLeftHeld: true,
  mouseLeftJustPressed: false,
  mouseRightHeld: true,
  isRanged: false,
  ammo: 20,
  windupDuration: 0.15,
  activeDuration: 0.14,
  recoveryDuration: 0.22,
  meleeCooldown: 0.35,
  rangedCooldown: 0.65,
});
assert.equal(feintOut.feinted, true, 'Hazır beklerken sağ tık basılınca saldırı iptal (feint) edilmeli');
assert.equal(feintOut.phase, 'IDLE', 'İptal sonrası saldırı fazı IDLE olmalı');
console.log('✓ 7. Sol tık basılı tutunca hazır bekletme (READY), bırakınca savurma (ACTIVE) ve sağ tık feint doğrulandı');

// ── 8. 11.3: Saldırı ve Savunma Yönüne Göre HUD Ok Göstergesi (Directional Reticle)
const chamberReticle = computeDirectionalReticleState({
  usingBow: false,
  isBlocking: false,
  attackPhase: 'READY',
  attackDir: 'LEFT',
  blockDir: 'UP',
  mouseLeftHeld: true,
  dirCueTimer: 0,
});
assert.equal(chamberReticle.mode, 'ATTACK_CHAMBER', 'Sol tık basılıyken nişangâh ATTACK_CHAMBER modunda olmalı');
assert.equal(chamberReticle.activeDirection, 'LEFT', 'Aktif yön LEFT olmalı');
assert.equal(chamberReticle.arrows.LEFT.active, true, 'Sol ok aktif yanmalı');
assert.equal(chamberReticle.arrows.LEFT.variant, 'attack', 'Sol ok attack stilinde olmalı');
assert.equal(chamberReticle.arrows.RIGHT.active, false, 'Diğer yön okları aktif olmamalı');

const blockReticleWeapon = computeDirectionalReticleState({
  usingBow: false,
  isBlocking: true,
  hasShield: false,
  attackPhase: 'IDLE',
  attackDir: 'LEFT',
  blockDir: 'UP',
  mouseLeftHeld: false,
  dirCueTimer: 0,
});
assert.equal(blockReticleWeapon.mode, 'BLOCK', 'Kalkansız sağ tık basılıyken nişangâh BLOCK modunda olmalı');
assert.equal(blockReticleWeapon.activeDirection, 'UP', 'Aktif savunma yönü UP olmalı');
assert.equal(blockReticleWeapon.arrows.UP.active, true, 'Tek/çift elli silah bloğunda üst savunma oku aktif yanmalı');
assert.equal(blockReticleWeapon.arrows.UP.variant, 'block', 'Tek/çift elli silah bloğunda üst savunma oku block stilinde olmalı');

const blockReticleShield = computeDirectionalReticleState({
  usingBow: false,
  isBlocking: true,
  hasShield: true,
  attackPhase: 'IDLE',
  attackDir: 'LEFT',
  blockDir: 'UP',
  mouseLeftHeld: false,
  dirCueTimer: 0,
});
assert.equal(blockReticleShield.mode, 'BLOCK', 'Kalkanla sağ tık basılıyken nişangâh BLOCK modunda olmalı');
assert.equal(
  blockReticleShield.arrows.UP.active ||
    blockReticleShield.arrows.DOWN.active ||
    blockReticleShield.arrows.LEFT.active ||
    blockReticleShield.arrows.RIGHT.active,
  false,
  'Kalkan ile savunmada 4 yönlü blok oku çıkmamalı (kalkan her yönü savunur)',
);
console.log('✓ 8. Saldırı okları, kalkansız 4 yönlü silah bloğu oku ve kalkanın tam yön savunması doğrulandı');

// ── 9. 11.3: Birimlerin İç İçe Geçmesini Önleyen Kalkan Hattı Çarpışma Çözücüsü ve Süvari Çiğnemesi
const lineActors: CollidableBattleActor[] = [
  // Müttefik kalkan duvarı (z = 0 hattında)
  {
    id: 'ally-1',
    numericId: 101,
    team: 'ally',
    x: -0.4,
    z: 0,
    vx: 0,
    vz: -4.5,
    hp: 100,
    gone: false,
    isMounted: false,
    isBlocking: true,
    inShieldWall: true,
  },
  {
    id: 'ally-2',
    numericId: 102,
    team: 'ally',
    x: 0.1,
    z: 0,
    vx: 0,
    vz: -4.5,
    hp: 100,
    gone: false,
    isMounted: false,
    isBlocking: true,
    inShieldWall: true,
  },
  // Karşıdan hücum eden düşman piyadeleri (aynı noktaya girmeye çalışıyor)
  {
    id: 'enemy-1',
    numericId: 201,
    team: 'enemy',
    x: -0.35,
    z: -0.6,
    vx: 0,
    vz: 4.5,
    hp: 100,
    gone: false,
    isMounted: false,
    isBlocking: false,
    inShieldWall: false,
  },
  // Dörtnala çarpan düşman süvarisi
  {
    id: 'enemy-cav',
    numericId: 202,
    team: 'enemy',
    x: 0.1,
    z: -1.1,
    vx: 0,
    vz: 9.8,
    hp: 115,
    gone: false,
    isMounted: true,
    isBlocking: false,
    inShieldWall: false,
  },
];

const tramples = resolveBattleActorCollisions(lineActors, { iterations: 4 });
const allyDist = Math.hypot(lineActors[0].x - lineActors[1].x, lineActors[0].z - lineActors[1].z);
const frontDist = Math.hypot(lineActors[0].x - lineActors[2].x, lineActors[0].z - lineActors[2].z);
assert.ok(allyDist >= 1.04, `Dost kalkan duvarı askerleri iç içe geçmemeli (mesafe: ${allyDist.toFixed(2)}m)`);
assert.ok(frontDist >= 1.34, `Karşıt cephe askerleri birbirinin içinden geçmemeli (mesafe: ${frontDist.toFixed(2)}m)`);
assert.ok(tramples.length >= 1, 'Dörtnala piyadeye çarpan süvari çiğneme (trample) olayı üretmeli');
assert.ok(tramples[0].damage >= 4, 'Süvari çiğnemesi anlamlı darbe hasarı üretmeli');
console.log('✓ 9. Birimlerin iç içe geçmesini önleyen kalkan hattı çarpışması ve süvari çiğnemesi doğrulandı');

console.log('\nTÜM MEYDAN SAVAŞI (B6-B7 & 11.3) KONTROLLERİ GEÇTİ');
