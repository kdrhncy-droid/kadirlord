import assert from 'node:assert/strict';
import {
  SKILL_ATTRIBUTE_MAP,
  ATTRIBUTE_SKILLS_MAP,
  calculateLearningLimit,
  calculateLearningRate,
  getXpRequiredForSkillLevel,
  getCharacterXpRequired,
  addSkillXpToHero,
  allocateHeroFocus,
  allocateHeroAttribute,
} from '../src/game/characterDevelopment.ts';
import {
  calculatePartyLimitBreakdown,
  advanceDailyPartyHealthAndPrisoners,
} from '../src/game/partySystem.ts';
import { createInitialCampaignState, type CampaignHero, type BannerlordSkillId } from '../src/game/rules.ts';
import { getPerksForSkill, unlockHeroPerk } from '../src/game/perks.ts';
import { getRoleHero } from '../src/game/bannerlordFoundation.ts';

console.log('🧪 P4 Karakter Gelişim ve Beceri XP Motoru Testi Başlatılıyor...');

// 1. Haritalama doğrulaması
assert.equal(Object.keys(SKILL_ATTRIBUTE_MAP).length, 18, '18 beceri olmalı');
assert.equal(Object.keys(ATTRIBUTE_SKILLS_MAP).length, 6, '6 nitelik olmalı');
assert.equal(SKILL_ATTRIBUTE_MAP.oneHanded, 'VIGOR');
assert.equal(SKILL_ATTRIBUTE_MAP.bow, 'CONTROL');
assert.equal(SKILL_ATTRIBUTE_MAP.riding, 'ENDURANCE');
assert.equal(SKILL_ATTRIBUTE_MAP.scouting, 'CUNNING');
assert.equal(SKILL_ATTRIBUTE_MAP.leadership, 'SOCIAL');
assert.equal(SKILL_ATTRIBUTE_MAP.steward, 'INTELLIGENCE');

// 2. Öğrenme Sınırı (Learning Limit) — Bannerlord yumuşak tavan (10.6)
// Limit = Odak * 30 + (Nitelik - 1) * 10; Sert Tavan = 4 + (Nitelik - 1) * 14 + Odak * 40
assert.equal(calculateLearningLimit(1, 0), 0);
assert.equal(calculateLearningLimit(5, 4), 4 * 30 + (5 - 1) * 10); // 160
assert.equal(calculateLearningLimit(10, 5), 5 * 30 + (10 - 1) * 10); // 240 (sert tavan 330)
console.log('✓ Öğrenme sınırı formülü doğru (5 Nitelik, 4 Odak -> 160)');

// 3. Öğrenme Hızı (Learning Rate)
// Sınır altında: 0.5*N + 1.25*O + 1.25; üstünde: 0.5*N + 1.25*O - 0.125*(Seviye - Sınır)
const normalRate = calculateLearningRate(50, 5, 4); // limit 160, seviye 50 -> 8.75
assert.equal(normalRate, 0.5 * 5 + 1.25 * 4 + 1.25);

const overflowRate = calculateLearningRate(200, 5, 4); // limit 160, seviye 200 -> 2.5
assert.equal(overflowRate, 2.5);
assert.ok(overflowRate < normalRate && overflowRate > 0, `Sınır aşımı hızı düşmeli, gelen: ${overflowRate}`);

const hardCappedRate = calculateLearningRate(220, 5, 4); // sert tavan: 4 + 4*14 + 4*40 = 220
assert.equal(hardCappedRate, 0, 'Sert tavanda öğrenme hızı 0 olmalı');
assert.equal(calculateLearningRate(290, 5, 4), 0, 'Sert tavan üstünde hız 0 kalmalı');
console.log('✓ Öğrenme hızı sınır ve tavan sönümlemesi doğru');

// 4. Kahraman üzerinde beceri XP ve seviye atlama
const initialSkills: Record<BannerlordSkillId, { level: number; focus: number; xp: number }> = {
  oneHanded: { level: 20, focus: 2, xp: 0 },
  twoHanded: { level: 10, focus: 0, xp: 0 },
  polearm: { level: 10, focus: 0, xp: 0 },
  bow: { level: 10, focus: 0, xp: 0 },
  crossbow: { level: 10, focus: 0, xp: 0 },
  throwing: { level: 10, focus: 0, xp: 0 },
  riding: { level: 15, focus: 1, xp: 0 },
  athletics: { level: 15, focus: 1, xp: 0 },
  smithing: { level: 10, focus: 0, xp: 0 },
  scouting: { level: 10, focus: 0, xp: 0 },
  tactics: { level: 10, focus: 0, xp: 0 },
  roguery: { level: 10, focus: 0, xp: 0 },
  charm: { level: 10, focus: 0, xp: 0 },
  leadership: { level: 10, focus: 0, xp: 0 },
  trade: { level: 10, focus: 0, xp: 0 },
  steward: { level: 15, focus: 1, xp: 0 },
  medicine: { level: 10, focus: 0, xp: 0 },
  engineering: { level: 10, focus: 0, xp: 0 },
};

const dummyHero: CampaignHero = {
  id: 'hero_player',
  name: 'Komutan Demirhan',
  kind: 'PLAYER',
  culture: 'vlandia',
  age: 26,
  hp: 120,
  maxHp: 120,
  wage: 0,
  level: 1,
  xp: 0,
  freeAttributePoints: 1,
  freeFocusPoints: 2,
  attributes: {
    VIGOR: 4,
    CONTROL: 3,
    ENDURANCE: 4,
    CUNNING: 3,
    SOCIAL: 4,
    INTELLIGENCE: 4,
  },
  skills: initialSkills,
  perks: [],
  equipment: { BATTLE: {}, CIVILIAN: {} },
  activeEquipmentSet: 'BATTLE',
  isInPlayerParty: true,
};

// Tecrübe ekleme testi
const xpResult = addSkillXpToHero(dummyHero, 'oneHanded', 1200);
assert.ok(xpResult.skillLeveledUp, 'Beceri seviye atlamalı');
assert.ok(xpResult.newSkillLevel > 20, `Seviye 20'nin üstüne çıkmalı, gelen: ${xpResult.newSkillLevel}`);
console.log(`✓ Beceri seviyesi başarıyla arttı: 20 -> ${xpResult.newSkillLevel} (+${xpResult.levelsGained} seviye)`);

// 5. Odak ve Nitelik Puanı Verme
const focusAlloc = allocateHeroFocus(dummyHero, 'twoHanded');
assert.equal(focusAlloc.success, true);
assert.equal(focusAlloc.hero.freeFocusPoints, 1, 'Odak puanı 1 eksilmeli');
assert.equal(focusAlloc.hero.skills.twoHanded.focus, 1, 'İki elli odak 1 artmalı');
assert.equal(focusAlloc.hero.skills.twoHanded.level, 10, 'Odak puanı seviyeyi yapay olarak artırmamalı!');
console.log('✓ Odak puanı tahsisi seviye hilesi yapmadan sınırı genişletti');

const attrAlloc = allocateHeroAttribute(dummyHero, 'VIGOR');
assert.equal(attrAlloc.success, true);
assert.equal(attrAlloc.hero.freeAttributePoints, 0, 'Nitelik puanı eksilmeli');
assert.equal(attrAlloc.hero.attributes.VIGOR, 5, 'VIGOR 4 -> 5 olmalı');
assert.equal(attrAlloc.hero.maxHp, 120, 'Nitelik tahsisi doğrudan HP şişirmemeli');
console.log('✓ Nitelik puanı tahsisi HP yapay artışı olmadan başarıyla uygulandı');

// 6. Perk Kataloğu ve Çiftli Seçenek (Mutually Exclusive)
const oneHandedPairs = getPerksForSkill('oneHanded');
assert.ok(oneHandedPairs[25], 'Seviye 25 eşiği olmalı');
assert.equal(oneHandedPairs[25][0].id, 'oneHanded_25_a');
assert.equal(oneHandedPairs[25][1].id, 'oneHanded_25_b');
assert.ok(oneHandedPairs[50], 'Seviye 50 eşiği olmalı');

// Seviye yetersizken perk kilitli olmalı
const lowLevelHero: CampaignHero = {
  ...dummyHero,
  skills: {
    ...dummyHero.skills,
    oneHanded: { level: 15, focus: 0, xp: 0 },
  },
};
const failedUnlock = unlockHeroPerk(lowLevelHero, 'oneHanded_25_a');
assert.equal(failedUnlock.success, false, 'Seviye 25 altındayken perk açılamaz');

// Seviye yeterliyken perk açılabilmeli
const eligibleHero: CampaignHero = {
  ...dummyHero,
  skills: {
    ...dummyHero.skills,
    oneHanded: { level: 30, focus: 1, xp: 0 },
  },
};
const successUnlock = unlockHeroPerk(eligibleHero, 'oneHanded_25_a');
assert.equal(successUnlock.success, true, 'Seviye 30 iken seviye 25 perki açılabilmeli');
assert.ok(successUnlock.hero.perks.includes('oneHanded_25_a'));

// Karşıt seçenek seçilirse diğeri listeden düşüp yerine yenisi geçmeli (Bannerlord tekil seçim)
const switchedUnlock = unlockHeroPerk(successUnlock.hero, 'oneHanded_25_b');
assert.equal(switchedUnlock.success, true, 'Karşıt seçenek seçilebilmeli');
assert.ok(switchedUnlock.hero.perks.includes('oneHanded_25_b'));
assert.ok(!switchedUnlock.hero.perks.includes('oneHanded_25_a'), 'Eski perk listeden çıkarılmalı');
console.log('✓ Perk kataloğu ve ikili karşılıklı kilit mekanizması doğrulandı');

// 7. Klan Rolleri (Quartermaster, Surgeon, Scout, Engineer)
const campaign = createInitialCampaignState();
assert.ok(campaign.heroes && campaign.heroes.length >= 4, 'Başlangıçta en az 4 kahraman olmalı');

const defaultQm = getRoleHero(campaign, 'QUARTERMASTER');
assert.equal(defaultQm?.kind, 'PLAYER', 'Varsayılan iaşeci oyuncu olmalı');

const initialBreakdown = calculatePartyLimitBreakdown(campaign);
assert.ok(initialBreakdown.quartermasterBonus > 0, 'İaşeci steward becerisi parti kapasitesine bonus vermeli');

// İaşeciyi Aybars (steward 30) ile değiştirelim
const aybarsHero = campaign.heroes.find((h) => h.name === 'Aybars')!;
const updatedCampaign = {
  ...campaign,
  roleAssignments: {
    ...campaign.roleAssignments,
    QUARTERMASTER: aybarsHero.id,
  },
};
const modifiedBreakdown = calculatePartyLimitBreakdown(updatedCampaign);
assert.equal(
  modifiedBreakdown.quartermasterBonus,
  Math.floor(aybarsHero.skills.steward.level * 0.25),
  'Yeni iaşecinin steward becerisi yansımalı',
);
console.log('✓ Klan rolü değişimi parti asker kapasitesi dökümüne doğrudan yansıyor');

// Cerrahın yaralı iyileştirmesi ve medicine XP kazanımı
const surgeonHero = getRoleHero(campaign, 'SURGEON');
assert.ok(surgeonHero, 'Cerrah kahramanı mevcut olmalı');
const initialMedXp = surgeonHero.skills.medicine.xp;

const injuredCampaign = {
  ...campaign,
  troopStacks: [
    {
      troopId: 'empire_recruit',
      count: 10,
      wounded: 5,
      xp: 0,
    },
  ],
};
const healResult = advanceDailyPartyHealthAndPrisoners(injuredCampaign);
assert.ok(healResult.healedTroops > 0, 'Yaralı askerler iyileştirilmeli');
const afterSurgeon = healResult.nextState.heroes?.find((h) => h.id === surgeonHero.id);
assert.ok(
  (afterSurgeon?.skills.medicine.xp ?? 0) > initialMedXp,
  'Cerrah yaralı iyileştirdiğinde medicine beceri XP kazanmalı',
);
console.log('✓ Cerrah rolü yaralı iyileştirmesi ve tecrübe kazanımı başarıyla doğrulandı');

console.log('\n🎉 P4 KARAKTER GELİŞİM, PERKLER VE KLAN ROLLERİ TESTİ BAŞARIYLA GEÇTİ!');
