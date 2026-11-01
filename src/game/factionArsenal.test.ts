import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ARSENAL_FACTIONS,
  FACTION_ARMORS,
  FACTION_HORSES,
  FACTION_WEAPONS,
  QUALITY_ORDER,
  applyFactionArmorToRig,
  buildFactionArmorPieces,
  buildFactionWarHorseRig,
  buildFactionWeapon3D,
  computeArmorStatsWithQuality,
  computeHorseStatsWithQuality,
  computeWeaponStatsWithQuality,
  getArmorsByFaction,
  getHorsesByFaction,
  getWeaponsByFaction,
  mountFactionShieldToRig,
  mountFactionWeaponToRig,
} from '../armory/FactionArsenal.ts';
import {
  FACTION_ANIMATION_META,
  FACTION_IK_CLIPS,
  applyFactionAnimationToCharacterAnimator,
  ensureFactionIKClipsRegistered,
} from '../armory/FactionAnimations.ts';
import {
  FACTION_TROOP_LOADOUTS,
  buildEquippedTroopOrLordScene,
  buildFactionArsenalMarketCatalog,
  getTroopLoadoutsByFaction,
} from './factionTroopLoadouts.ts';
import { createCharacterRig } from './characterRig.ts';
import { CharacterAnimator } from './characterAnimator.ts';
import { CALRADIA_MARKETPLACE_ITEMS } from './marketRules.ts';

describe('FactionArsenal · 6 Krallık Silah, Zırh, Savaş Atı, Kalite ve 2-Bone IK Sistemi', () => {
  it('6 krallığın her biri için özel kılıç/silah, zırh seti ve savaş atları eksiksiz tanımlanmış olmalı', () => {
    assert.equal(ARSENAL_FACTIONS.length, 6);
    for (const fac of ARSENAL_FACTIONS) {
      const weps = getWeaponsByFaction(fac.id);
      const arms = getArmorsByFaction(fac.id);
      const horses = getHorsesByFaction(fac.id);
      assert.ok(weps.length >= 6, `${fac.id} en az 6 özel silah/kalkana sahip olmalı`);
      assert.equal(arms.length, 3, `${fac.id} T2/T4/T6 3 zırh setine sahip olmalı`);
      assert.equal(horses.length, 2, `${fac.id} 2 özel bineğe sahip olmalı`);
    }
  });

  it('Kalite çarpanları (RUSTY -> LEGENDARY) hasar, hız, dayanıklılık, zırh ve Dinar fiyatını monoton artırmalı', () => {
    const sampleSword = FACTION_WEAPONS[0];
    const sampleArmor = FACTION_ARMORS[2];
    const sampleHorse = FACTION_HORSES[1];

    let prevPriceW = 0;
    let prevDmgW = 0;
    let prevDurW = 0;

    for (const qId of QUALITY_ORDER) {
      const wStats = computeWeaponStatsWithQuality(sampleSword, qId);
      assert.ok(wStats.priceDinar > prevPriceW, `${qId} silah fiyatı artmalı`);
      assert.ok(wStats.swingDamage >= prevDmgW, `${qId} silah hasarı artmalı`);
      assert.ok(wStats.durability > prevDurW, `${qId} silah dayanıklılığı artmalı`);
      prevPriceW = wStats.priceDinar;
      prevDmgW = wStats.swingDamage;
      prevDurW = wStats.durability;

      const aStats = computeArmorStatsWithQuality(sampleArmor, qId);
      assert.ok(aStats.totalArmor > 0);
      assert.ok(aStats.priceDinar > 0);

      const hStats = computeHorseStatsWithQuality(sampleHorse, qId);
      assert.ok(hStats.speed > 30);
      assert.ok(hStats.hitPoints > 100);
      assert.ok(hStats.priceDinar > 0);
    }
  });

  it('18 krallık zırhı ve miğferi CharacterRig üzerinde çeneyle veya gözlerle çakışmamalı (Sıfır İç İçe Girme)', () => {
    for (const arm of FACTION_ARMORS) {
      const rig = createCharacterRig({
        weaponType: 'ONE_HANDED_SWORD',
        shieldType: 'NONE',
        helmetType: 'NONE',
        armorTier: 'CHAINMAIL',
        factionId: arm.faction,
      });
      applyFactionArmorToRig(rig, arm, 'MASTERWORK');
      rig.root.updateMatrixWorld(true);

      const skullMesh = rig.head.children.find((c) => (c as THREE.Mesh).isMesh)!;
      const skullBox = new THREE.Box3().setFromObject(skullMesh);
      const chinY = skullBox.min.y;
      const eyeY = (skullBox.min.y + skullBox.max.y) / 2 + 0.012;

      const chestArmor = rig.chestArmorSocket.getObjectByName('armorChest');
      assert.ok(chestArmor, `${arm.id}: göğüs zırhı üretilmeli`);
      const chestBox = new THREE.Box3().setFromObject(chestArmor!);
      assert.ok(
        chestBox.max.y <= chinY - 0.015,
        `${arm.id}: göğüs zırhı/yakası çeneyi örtmemeli (${chestBox.max.y.toFixed(3)} <= ${(chinY - 0.015).toFixed(3)})`,
      );

      const helmet = rig.helmetSocket.children[0];
      assert.ok(helmet, `${arm.id}: miğfer üretilmeli`);
      const helmBox = new THREE.Box3().setFromObject(helmet);
      assert.ok(
        helmBox.max.y > skullBox.max.y,
        `${arm.id}: miğfer tepesi kafatasını örtmeli`,
      );

      const isClosed =
        arm.helmStyle === 'greatHelm' ||
        arm.culturalCrest === 'imperial_plume_mask' ||
        arm.culturalCrest === 'vlandian_crowned_helm';
      if (isClosed) {
        const slit = helmet.getObjectByName('visorEyeSlit');
        assert.ok(slit, `${arm.id}: kapalı miğferde göz yarığı (visorEyeSlit) bulunmalı`);
        const slitBox = new THREE.Box3().setFromObject(slit!);
        const slitCenterY = (slitBox.min.y + slitBox.max.y) / 2;
        assert.ok(
          Math.abs(slitCenterY - eyeY) < 0.025,
          `${arm.id}: göz yarığı göz hizasında olmalı`,
        );
      }

      const { baseSet } = buildFactionArmorPieces(arm, 'battle');
      assert.ok(baseSet.triangles > 30);
    }
  });

  it('38 krallık silahı, yayları ve kalkanları doğru el soketine ve 2-Bone IK çift el tutuşuna tam oturmalı', () => {
    ensureFactionIKClipsRegistered();

    for (const wep of FACTION_WEAPONS) {
      const rig = createCharacterRig({
        weaponType: 'ONE_HANDED_SWORD',
        shieldType: 'NONE',
        helmetType: 'NONE',
        armorTier: 'CHAINMAIL',
        factionId: wep.faction,
      });

      if (wep.kind === 'shield') {
        const shieldHolder = mountFactionShieldToRig(rig, wep, 'MASTERWORK', 'hero');
        rig.root.updateMatrixWorld(true);
        const q = shieldHolder.getWorldQuaternion(new THREE.Quaternion());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
        const sBox = new THREE.Box3().setFromObject(shieldHolder);
        assert.ok(up.y > 0.98, `${wep.id}: kalkan dik durmalı (+Y)`);
        assert.ok(normal.z > 0.98, `${wep.id}: kalkan yüzü ileri bakmalı (+Z)`);
        assert.ok(sBox.min.z > 0.08, `${wep.id}: kalkan gövdenin önünde durmalı (iç içe girmemeli)`);
      } else if (wep.kind === 'bow') {
        mountFactionWeaponToRig(rig, wep, 'MASTERWORK', 'hero');
        assert.ok(rig.bow, `${wep.id}: sol elde dinamik BowParts kurmalı`);
        const anim = new CharacterAnimator(rig);
        applyFactionAnimationToCharacterAnimator(anim, 'shootBow');
        for (let i = 0; i < 15; i++) anim.update(0.04);
        assert.ok(anim.bowDraw > 0.3, `${wep.id}: yay kirişi çekilmeli`);
      } else {
        const holder = mountFactionWeaponToRig(rig, wep, 'MASTERWORK', 'hero');
        const anim = new CharacterAnimator(rig);
        for (let i = 0; i < 8; i++) anim.update(0.032);
        rig.root.updateMatrixWorld(true);

        // Sağ el avuç merkezi silahın bounding box'ı içinde olmalı:
        const rightPalmWorld = new THREE.Vector3(0, -0.06, 0);
        rig.rightHand.localToWorld(rightPalmWorld);
        const wepBox = new THREE.Box3().setFromObject(holder).expandByScalar(0.04);
        assert.ok(
          wepBox.containsPoint(rightPalmWorld),
          `${wep.id}: sağ el avuç merkezi silah kabzasının içinde olmalı`,
        );

        // Çift elli kılıç/balta/falx veya gönderli silahlarda (kalkansız) sol el de silah ekseni üzerinde olmalı:
        if (wep.twoHanded && wep.kind !== 'crossbow') {
          const leftHandWorld = new THREE.Vector3(0, -0.04, 0);
          rig.leftHand.localToWorld(leftHandWorld);
          assert.ok(
            wepBox.expandByScalar(0.05).containsPoint(leftHandWorld),
            `${wep.id}: çift elli silahta sol el 2-Bone IK ile kabza/gövdeyi kavramalı`,
          );
        }
      }

    }

    for (const hrs of FACTION_HORSES) {
      const horseRig = buildFactionWarHorseRig(hrs, 'MASTERWORK');
      assert.ok(horseRig.riderMount, `${hrs.id}: WarHorseRig riderMount içermeli`);
    }
  });

  it('Yeni eklenen 11 savaş animasyonu CharacterAnimator 2-Bone IK üzerinde kayıtlı ve oynatılabilir olmalı', () => {
    ensureFactionIKClipsRegistered();
    assert.ok(FACTION_ANIMATION_META.length >= 15);

    const rig = createCharacterRig({
      weaponType: 'TWO_HANDED_SWORD',
      shieldType: 'NONE',
      helmetType: 'IMPERIAL_VISOR',
      armorTier: 'PLATE',
    });
    const animator = new CharacterAnimator(rig);

    for (const clipName of Object.keys(FACTION_IK_CLIPS)) {
      assert.ok(animator.hasClip(clipName), `${clipName} CharacterAnimator içinde kayıtlı olmalı`);
      const played = animator.play(clipName, { force: true });
      assert.ok(played, `${clipName} oynatılabilmeli`);
      animator.update(0.15);
    }
  });

  it('6 krallığın T1->T6 asker terfi zincirleri ve Lord/Hükümdar kuşanmaları 3B sahne olarak kurulabilmeli', () => {
    assert.equal(FACTION_TROOP_LOADOUTS.length, 48);
    for (const fac of ARSENAL_FACTIONS) {
      const loadouts = getTroopLoadoutsByFaction(fac.id);
      assert.equal(loadouts.length, 8, `${fac.id} T1..T6 + Lord + Hükümdar (8 kademe) içermeli`);

      const t1 = buildEquippedTroopOrLordScene(loadouts[0], undefined, 'battle');
      const t6 = buildEquippedTroopOrLordScene(loadouts[5], undefined, 'battle');

      assert.ok(t1.totalTriangles > 100);
      assert.ok(t6.totalTriangles > t1.totalTriangles);
      assert.ok(
        t6.totalEquipmentValueDinar > t1.totalEquipmentValueDinar,
        `${fac.id} T6 şampiyon donanım değeri T1 acemiden yüksek olmalı`,
      );

      t1.updateAnimation(0.1);
      t6.updateAnimation(0.1);

      // Mide (chestArmorSocket) ↔ Kalça/Etek (pelvis) ↔ Uyluk başlangıcı (leftThigh/rightThigh)
      // arasında hiçbir boşluk olmamalı (dikey örtüşme > 3 cm):
      for (const scene of [t1, t6]) {
        scene.rootGroup.updateMatrixWorld(true);
        const chestBox = new THREE.Box3().setFromObject(scene.characterRig.chestArmorSocket);
        const pelvisBox = new THREE.Box3();
        for (const c of scene.characterRig.pelvis.children) {
          if (c === scene.characterRig.torso || c === scene.characterRig.leftThigh || c === scene.characterRig.rightThigh) {
            continue;
          }
          pelvisBox.union(new THREE.Box3().setFromObject(c));
        }
        const thighBox = new THREE.Box3()
          .setFromObject(scene.characterRig.leftThigh)
          .union(new THREE.Box3().setFromObject(scene.characterRig.rightThigh));

        assert.ok(
          pelvisBox.max.y >= chestBox.min.y + 0.03,
          `${scene.loadout.id}: mide alt sınırı (${chestBox.min.y.toFixed(3)}) ile kalça/etek üst sınırı (${pelvisBox.max.y.toFixed(3)}) kesintisiz örtüşmeli`,
        );
        assert.ok(
          thighBox.max.y >= pelvisBox.min.y + 0.08,
          `${scene.loadout.id}: kalça/etek alt sınırı (${pelvisBox.min.y.toFixed(3)}) ile bacak başlangıcı (${thighBox.max.y.toFixed(3)}) kesintisiz örtüşmeli`,
        );

        // Yüz/dudak kontrolü: mouth parçası dudakların önünde havada asılı durmamalı (< 6 mm fark)
        const faceGroup = scene.characterRig.head.getObjectByName('Face');
        if (faceGroup) {
          const mouthObj = faceGroup.getObjectByName('mouth');
          const lowerLipObj = faceGroup.getObjectByName('lowerLip');
          if (mouthObj && lowerLipObj) {
            assert.equal(
              mouthObj.position.z,
              0,
              `${scene.loadout.id}: mouth grubu z=0'da olmalı (yüzün önünde ayrık durmamalı)`,
            );
            const mBox = new THREE.Box3().setFromObject(mouthObj);
            const lBox = new THREE.Box3().setFromObject(lowerLipObj);
            assert.ok(
              Math.abs(mBox.max.z - lBox.max.z) < 0.012,
              `${scene.loadout.id}: ağız çizgisi (${mBox.max.z.toFixed(3)}) dudak yüzeyiyle (${lBox.max.z.toFixed(3)}) bitişik olmalı`,
            );
          }
        }

        // Omuz–gövde kontrolü: sol omuz grubu gövde zırhı ile X ekseninde kesintisiz birleşmeli (boşluk olmamalı)
        const leftShoulderBox = new THREE.Box3().setFromObject(scene.characterRig.leftShoulder);
        assert.ok(
          leftShoulderBox.min.x <= chestBox.max.x + 0.005,
          `${scene.loadout.id}: sol omuz iç sınırı (${leftShoulderBox.min.x.toFixed(3)}) gövde dış sınırına (${chestBox.max.x.toFixed(3)}) bitişmeli`,
        );
      }

      t1.dispose();
      t6.dispose();
    }
  });

  it('Yeni krallık ekipmanları CALRADIA_MARKETPLACE_ITEMS pazaryeri kataloğuna benzersiz ID ve fiyatla bağlanmalı', () => {
    const marketArsenal = buildFactionArsenalMarketCatalog();
    assert.equal(
      marketArsenal.length,
      FACTION_WEAPONS.length + FACTION_ARMORS.length + FACTION_HORSES.length,
    );

    for (const mktItem of marketArsenal) {
      const found = CALRADIA_MARKETPLACE_ITEMS.find((i) => i.id === mktItem.id);
      assert.ok(found, `${mktItem.id} pazaryeri kataloğunda bulunmalı`);
      assert.ok(found.value > 0, `${mktItem.id} fiyatı pozitif olmalı`);
    }
  });
});
