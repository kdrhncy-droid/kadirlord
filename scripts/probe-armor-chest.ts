/**
 * probe-armor-chest.ts — Faz 9b: asker zırhının GÖĞÜS bölgesi
 *
 *   npx tsx scripts/probe-armor-chest.ts
 *
 * Kullanıcı bulgusu: "askerlerin zırhlarını kontrol eder misin, göğüs kısımlarını".
 *
 * Ölçülenler (her zırh kademesi × her görsel katman için):
 *   1. Zırh göğsü **kapatıyor mu** (ön, arka, yan)?  → ten kumaşı görünüyor mu?
 *   2. Göğüs ile karın/kuşak arasında **boşluk** var mı?
 *   3. Zırh parçaları kolların **içine giriyor** mu (omuz/üst kol)?
 *   4. Zırh gövdeden dışarı **taşıyor** mu (fazla geniş → palto gibi)?
 *   5. Zırhın iç yüzeyi görünüyor mu (tek yüzlü geometri + yanlış ölçek)?
 */
import * as THREE from 'three';
import { setArmoryVisualsEnabled } from '../src/game/armoryBridge.ts';
import {
  createCharacterRig,
  TORSO_DEPTH_SCALE,
  type ArmorTier,
  type CharacterVisualOptions,
} from '../src/game/characterRig.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const base = {
  skinTone: '#e8be99',
  hairColor: '#2b1b10',
  beardColor: '#2b1b10',
  factionColor: '#7f1d1d',
  hasBeard: false,
  weaponType: 'ONE_HANDED_SWORD',
  shieldType: 'NONE',
  helmetType: 'NONE',
  armorTier: 'CHAINMAIL',
  factionId: 'vlandia',
} as unknown as CharacterVisualOptions;

const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

/**
 * Göğüs bölgesindeki zırh parçaları.
 *
 * DİKKAT: yalnız `armory_*` sarmalayıcılarına bakmak yanıltıcı — kol/bacak
 * parçaları da torso altında olduğu için ölçüme karışıp "göğüs kapalı"
 * yanılgısı veriyor. Ölçüm yalnız `userData.chestArmor` işaretli parçalara
 * bakar (buildArmor bunları işaretler).
 */
function chestPieces(rig: ReturnType<typeof createCharacterRig>): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  rig.torso.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.userData?.chestArmor) out.push(m);
  });
  return out;
}

const TIERS: ArmorTier[] = ['LEATHER', 'CHAINMAIL', 'PLATE'];

for (const armory of [true, false]) {
  setArmoryVisualsEnabled(armory);
  console.log(`\n── ${armory ? 'BannerForge (varsayılan)' : 'legacy'} zırh katmanı ──`);

  // Referans: çıplak gövde (zırh CIVILIAN)
  const bare = createCharacterRig({ ...base, armorTier: 'CIVILIAN' } as CharacterVisualOptions);
  bare.root.updateMatrixWorld(true);
  const torsoMesh = bare.torso.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
  const tBox = box(torsoMesh);
  const tSize = tBox.getSize(new THREE.Vector3());
  const tFront = tBox.max.z;
  const tBack = tBox.min.z;
  const shoulderY = bare.leftShoulder.getWorldPosition(new THREE.Vector3()).y;
  console.log(
    `gövde: y ${tBox.min.y.toFixed(2)}..${tBox.max.y.toFixed(2)} · ` +
      `genişlik ${tSize.x.toFixed(2)} · derinlik ${(tFront - tBack).toFixed(2)} · ` +
      `omuz y ${shoulderY.toFixed(2)}`,
  );

  for (const tier of TIERS) {
    const rig = createCharacterRig({ ...base, armorTier: tier } as CharacterVisualOptions);
    rig.root.updateMatrixWorld(true);
    const pieces = chestPieces(rig);
    ok(pieces.length > 0, `${tier}: göğüs zırhı parçası var`, `${pieces.length} parça`);
    if (pieces.length === 0) continue;

    const group = new THREE.Group();
    pieces.forEach((p) => {
      const clone = new THREE.Mesh(p.geometry, p.material);
      clone.applyMatrix4(p.matrixWorld);
      group.add(clone);
    });
    group.updateMatrixWorld(true);
    const aBox = box(group);
    const aSize = aBox.getSize(new THREE.Vector3());

    // 1) Ön/arka kapsama: zırh gövde yüzeyinin önünde ve arkasında mı?
    ok(aBox.max.z >= tFront - 0.005, `${tier}: göğsün ÖNÜNÜ kapatıyor`, `z ${aBox.max.z.toFixed(3)} ≥ ${tFront.toFixed(3)}`);
    ok(aBox.min.z <= tBack + 0.005, `${tier}: SIRTINI kapatıyor`, `z ${aBox.min.z.toFixed(3)} ≤ ${tBack.toFixed(3)}`);

    // 2) Yan kapsama: gövde genişliğini sarıyor mu?
    ok(
      aSize.x >= tSize.x * 0.98,
      `${tier}: yanları sarıyor (göğüs genişliği)`,
      `${aSize.x.toFixed(3)} vs ${tSize.x.toFixed(3)}`,
    );

    // 3) Dikey kapsama: göğüsten bele kadar (kemer üstüne kadar iniyor mu?)
    const beltTop = bare.torso.getWorldPosition(new THREE.Vector3()).y + 0.08;
    ok(aBox.min.y <= beltTop + 0.02, `${tier}: bele kadar iniyor (karın açıkta değil)`, `alt ${aBox.min.y.toFixed(3)} ≤ ${beltTop.toFixed(3)}`);
    ok(aBox.max.y >= shoulderY - 0.09, `${tier}: köprücük kemiğine kadar çıkıyor`, `üst ${aBox.max.y.toFixed(3)}`);

    // 4) Aşırı taşma: zırh gövdeden %35'ten fazla genişse "palto" gibi durur
    ok(
      aSize.x <= tSize.x * 1.35,
      `${tier}: gövdeden aşırı taşmıyor`,
      `${(aSize.x / tSize.x).toFixed(2)}×`,
    );
    ok(
      aSize.z <= tFront - tBack + 0.16,
      `${tier}: derinlik makul (şişkin değil)`,
      `${aSize.z.toFixed(2)} m`,
    );

    // 5) Kol içine girme: zırh kutusu omuz eklemlerini yutuyor mu?
    for (const side of ['left', 'right'] as const) {
      const shoulder = rig[`${side}Shoulder`].getWorldPosition(new THREE.Vector3());
      const upper = rig[`${side}UpperArm`].getWorldPosition(new THREE.Vector3());
      const insideShoulder = aBox.containsPoint(shoulder);
      const armMesh = rig[`${side}UpperArm`].children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
      if (!armMesh) continue;
      const armBox = box(armMesh);
      const overlap = aBox.clone().intersect(armBox);
      const overlapSize = overlap.isEmpty() ? new THREE.Vector3() : overlap.getSize(new THREE.Vector3());
      ok(
        overlapSize.length() < 0.09,
        `${tier}: ${side} üst kol zırha gömülmüyor`,
        `kesişim ${overlapSize.length().toFixed(3)}`,
      );
      ok(!insideShoulder || aSize.x < 0.8, `${tier}: ${side} omuz eklemi zırhın içinde kalıyor (normal)`, upper.y.toFixed(2));
    }

    // 6) İç yüzey / ters normal: geometri tek yüzlü ve dışa bakıyorsa,
    //    göğüs kutusunun ön yüzünde ağırlıklı olarak dış normal bulunur.
    let frontFaces = 0;
    let inwardFaces = 0;
    for (const mesh of pieces) {
      const geo = mesh.geometry as THREE.BufferGeometry;
      const pos = geo.getAttribute('position');
      const idx = geo.getIndex();
      if (!pos) continue;
      const n = idx ? idx.count : pos.count;
      const va = new THREE.Vector3();
      const vb = new THREE.Vector3();
      const vc = new THREE.Vector3();
      const ab = new THREE.Vector3();
      const ac = new THREE.Vector3();
      const nrm = new THREE.Vector3();
      const center = new THREE.Vector3();
      for (let i = 0; i + 2 < n; i += 3) {
        const ia = idx ? idx.getX(i) : i;
        const ib = idx ? idx.getX(i + 1) : i + 1;
        const ic = idx ? idx.getX(i + 2) : i + 2;
        va.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
        vb.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
        vc.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
        center.copy(va).add(vb).add(vc).divideScalar(3);
        if (center.z < tFront - 0.02) continue; // yalnız ön yüz
        ab.subVectors(vb, va);
        ac.subVectors(vc, va);
        nrm.crossVectors(ab, ac).normalize();
        if (nrm.z > 0.2) frontFaces += 1;
        else if (nrm.z < -0.2) inwardFaces += 1;
      }
    }
    ok(
      inwardFaces <= frontFaces * 0.35,
      `${tier}: ön yüzde ters normal yok (iç yüzey görünmüyor)`,
      `dış ${frontFaces} / iç ${inwardFaces}`,
    );
  }
}

/* ── Kol zırhı: kolu örtüyor mu, göğse giriyor mu? ── */
for (const armory of [true, false]) {
  setArmoryVisualsEnabled(armory);
  console.log(`\n── ${armory ? 'BannerForge' : 'legacy'} katmanı: kol zırhı ──`);
  for (const tier of TIERS) {
    const rig = createCharacterRig({ ...base, armorTier: tier } as CharacterVisualOptions);
    rig.root.updateMatrixWorld(true);
    const armPieces: THREE.Mesh[] = [];
    rig.root.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.userData?.armArmor) armPieces.push(m);
    });
    ok(armPieces.length >= 4, `${tier}: kol zırhı parçaları var`, `${armPieces.length} parça`);
    const chest = chestPieces(rig);
    const chestBox = new THREE.Box3();
    for (const p of chest) chestBox.union(box(p));
    let penetration = 0;
    let coverGap = Infinity;
    for (const p of armPieces) {
      const b = box(p);
      // Göğüs kabuğu ile kol zırhının 3B kesişimi: en ince eksendeki giriş derinliği.
      if (b.intersectsBox(chestBox)) {
        const inter = b.clone().intersect(chestBox);
        const size = inter.getSize(new THREE.Vector3());
        const depth = Math.min(size.x, size.y, size.z);
        if (size.y > 0.02) penetration = Math.max(penetration, depth);
      }
      // Kolun kendi mesh'i: aynı ebeveynin ilk mesh'i.
      const armMesh = (p.parent?.children ?? []).find(
        (c) => (c as THREE.Mesh).isMesh && !(c as THREE.Mesh).userData.armArmor,
      ) as THREE.Mesh | undefined;
      if (armMesh) {
        const ab = box(armMesh);
        coverGap = Math.min(coverGap, b.getSize(new THREE.Vector3()).x - ab.getSize(new THREE.Vector3()).x);
      }
    }
    ok(penetration <= 0.02, `${tier}: kol zırhı göğüs kabuğuna girmiyor`, `giriş ${(penetration * 1000).toFixed(0)} mm`);
    ok(coverGap >= 0.012, `${tier}: kol zırhı kolu tam örtüyor`, `pay ${coverGap.toFixed(3)} m`);
  }
}

/* ── Asker (kadro) hattı: applyEquipmentToRig ile aynı yolu kullanıyor mu? ── */
setArmoryVisualsEnabled(true);
{
  const soldier = createCharacterRig({ ...base, armorTier: 'CHAINMAIL' } as CharacterVisualOptions);
  soldier.root.updateMatrixWorld(true);
  const pieces = chestPieces(soldier);
  const covered = pieces.some((p) => {
    const b = box(p);
    return b.max.z > 0.1 && b.min.y < 1.35;
  });
  ok(covered, 'asker rig\'inde göğüs plağı ön tarafta ve göğüs hizasında');
  ok(pieces.every((p) => !p.name.includes('greatHelm')), 'zırh katmanı miğfer getirmiyor');
}

setArmoryVisualsEnabled(true);
console.log(fails === 0 ? '\n✅ GÖĞÜS ZIRHI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
