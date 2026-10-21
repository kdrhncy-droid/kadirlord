/**
 * BannerForge entegrasyon doğrulaması — tarayıcısız (Node + three.js).
 *
 *   npx tsx scripts/verify-armory.ts
 *
 * Neyi kanıtlıyor?
 *  1. 22 ekipman × 3 LOD: NaN yok, üçgen bütçesi aşılmıyor.
 *  2. Silah/kalkan/miğfer: BannerForge modeli, legacy modelin TAM OLARAK
 *     durduğu yerde duruyor (merkez mesafesi + boyut oranı toleransı).
 *     → Animasyon/IK hedefleri değişmeden doğru görünüyor demektir.
 *  3. Zırh: her parça, vücudun ilgili uzvunu DIŞARIDAN kapsıyor
 *     (radyal kapsama testi).
 *  4. At ve sadak modelleri üretilebiliyor.
 */
import * as THREE from 'three';
import { createCharacterRig, type CharacterVisualOptions, type WeaponType, type ShieldType, type HelmetType, type ArmorTier } from '../src/game/characterRig.ts';
import { setArmoryVisualsEnabled } from '../src/game/armoryBridge.ts';
import { ARMORY_IDS, budgetFor } from '../src/armory/Armory.ts';
import { buildArmoryItem, createArmoryHorse } from '../src/game/armoryBridge.ts';

let failures = 0;
const log = (s: string) => console.log(s);
const ok = (s: string) => log(`  ✓ ${s}`);
const bad = (s: string) => {
  failures++;
  log(`  ✗ ${s}`);
};

const baseOptions: CharacterVisualOptions = {
  weaponType: 'ONE_HANDED_SWORD',
  shieldType: 'NONE',
  helmetType: 'NONE',
  armorTier: 'CIVILIAN',
  factionId: 'vlandia',
  factionColor: '#991b1b',
};

function build(options: Partial<CharacterVisualOptions>, armory: boolean) {
  setArmoryVisualsEnabled(armory);
  const rig = createCharacterRig({ ...baseOptions, ...options });
  rig.root.updateMatrixWorld(true);
  return rig;
}

function worldBox(obj: THREE.Object3D | null): THREE.Box3 {
  if (!obj) return new THREE.Box3();
  return new THREE.Box3().setFromObject(obj);
}

function center(box: THREE.Box3) {
  return box.getCenter(new THREE.Vector3());
}

/* ═══════════ 1) KATALOG ═══════════ */
log('═══ 1) KATALOG · 22 ekipman × 3 LOD ═══');
let itemCount = 0;
for (const lod of ['hero', 'battle', 'crowd'] as const) {
  for (const id of ARMORY_IDS) {
    const item = buildArmoryItem(id, { lod, factionId: 'vlandia' });
    itemCount++;
    const pos = item.merged.getAttribute('position');
    let nan = false;
    if (!pos) nan = true;
    else {
      for (let i = 0; i < pos.array.length; i++) {
        if (!Number.isFinite(pos.array[i] as number)) { nan = true; break; }
      }
    }
    if (nan) bad(`${id}/${lod}: NaN veya boş geometri`);
    if (item.triangles > budgetFor(id, lod) * 1.0001) {
      bad(`${id}/${lod}: ${item.triangles} > bütçe ${budgetFor(id, lod)}`);
    }
  }
}
ok(`${itemCount} ekipman üretildi, NaN yok, bütçe içinde`);

/* ═══════════ 2) YERLEŞİM PARİTESİ (armory vs legacy) ═══════════ */
log('\n═══ 2) YERLEŞİM · BannerForge modeli legacy modelin yerinde mi? ═══');

/** Legacy model ile armory modeli arasında merkez/boyut karşılaştırması. */
function compareMount(
  label: string,
  armoryOptions: Partial<CharacterVisualOptions>,
  pick: (rig: ReturnType<typeof build>) => THREE.Object3D | null,
  tolerances = { shift: 0.35, minRatio: 0.55, maxRatio: 1.75 },
) {
  const legacy = build({ ...armoryOptions }, false);
  const armory = build({ ...armoryOptions }, true);
  const a = worldBox(pick(legacy));
  const b = worldBox(pick(armory));
  if (a.isEmpty() || b.isEmpty()) {
    bad(`${label}: model bulunamadı (legacy=${!a.isEmpty()}, armory=${!b.isEmpty()})`);
    return;
  }
  const shift = center(a).distanceTo(center(b));
  const sa = a.getSize(new THREE.Vector3());
  const sb = b.getSize(new THREE.Vector3());
  const ratio = sb.length() / sa.length();
  const pass = shift <= tolerances.shift && ratio >= tolerances.minRatio && ratio <= tolerances.maxRatio;
  const msg = `${label.padEnd(26)} kayma ${shift.toFixed(2)} m · boyut oranı ${ratio.toFixed(2)} · legacy ${sa.x.toFixed(2)}×${sa.y.toFixed(2)}×${sa.z.toFixed(2)} → armory ${sb.x.toFixed(2)}×${sb.y.toFixed(2)}×${sb.z.toFixed(2)}`;
  pass ? ok(msg) : bad(msg);
}

for (const weapon of ['ONE_HANDED_SWORD', 'TWO_HANDED_SWORD', 'SPEAR'] as WeaponType[]) {
  for (const shield of ['NONE', 'KITE_SHIELD'] as ShieldType[]) {
    if (weapon !== 'ONE_HANDED_SWORD' && shield !== 'NONE') continue; // 2H + kalkan yok
    compareMount(
      `${weapon}${shield === 'NONE' ? '' : ' + ' + shield}`,
      { weaponType: weapon, shieldType: shield },
      (r) => r.mainHandItem,
    );
    if (shield !== 'NONE') {
      compareMount(`${shield} (kalkan)`, { weaponType: weapon, shieldType: shield }, (r) => r.offHandItem, {
        shift: 0.3,
        minRatio: 0.6,
        maxRatio: 1.6,
      });
    }
  }
}

for (const helmet of ['KETTLE_HAT', 'SPANGENHELM', 'IMPERIAL_VISOR'] as HelmetType[]) {
  compareMount(`Miğfer ${helmet}`, { helmetType: helmet }, (r) => r.helmetSocket.children[0] ?? null, {
    shift: 0.16,
    // BannerForge siperliği legacy modelden dar (legacy 0.59 m çap = kafa için
    // fazla genişti); 0.62 alt sınırı gerçekçi.
    minRatio: 0.62,
    maxRatio: 1.6,
  });
}

/* ═══════════ 3) ZIRH KAPSAMA ═══════════ */
log('\n═══ 3) ZIRH · parçalar vücudu dışarıdan kapsıyor mu? ═══');

interface Coverage {
  zone: string;
  bodyRadius: number;
  armorRadius: number;
}

/** Eklem ekseninden (eklem orijini, -Y boyunca) en büyük radyal uzaklık. */
function radialExtent(box: THREE.Box3, originY: number): number {
  const r = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
  return { r, originY } as unknown as number;
}

const BODY_RADII: Record<string, number> = {
  upperArm: 0.068,
  forearm: 0.058,
  thigh: 0.088,
  shin: 0.068,
  hand: 0.05,
};

for (const tier of ['LEATHER', 'CHAINMAIL', 'PLATE'] as ArmorTier[]) {
  const rig = build({ armorTier: tier }, true);
  rig.root.updateMatrixWorld(true);
  const joints: [string, THREE.Object3D, number][] = [
    ['upperArm', rig.leftUpperArm, BODY_RADII.upperArm],
    ['forearm', rig.leftForearm, BODY_RADII.forearm],
    ['thigh', rig.leftThigh, BODY_RADII.thigh],
    ['shin', rig.leftShin, BODY_RADII.shin],
  ];
  let worst = Infinity;
  let worstName = '';
  let measured = 0;
  const jointPos = new THREE.Vector3();
  for (const [name, joint, bodyR] of joints) {
    const wrappers = joint.children.filter((c) => c.userData.armoryArmor);
    if (wrappers.length === 0) continue;
    measured++;
    joint.getWorldPosition(jointPos);
    const box = new THREE.Box3();
    // Yalnızca BannerForge zırh parçalarını ölç (vücut mesh'leri hariç) ve
    // EKLEM EKSENİNE göre radyal uzaklığı hesapla.
    wrappers.forEach((wrapper) => box.expandByObject(wrapper));
    const extent = Math.max(
      Math.abs(box.min.x - jointPos.x), Math.abs(box.max.x - jointPos.x),
      Math.abs(box.min.z - jointPos.z), Math.abs(box.max.z - jointPos.z),
    );
    const margin = extent - bodyR;
    if (margin < worst) {
      worst = margin;
      worstName = name;
    }
  }
  if (measured === 0) {
    bad(`${tier}: hiçbir uzva zırh takılmamış (kapsama testi yapılamadı)`);
    continue;
  }
  if (worst < -0.005) {
    bad(`${tier}: ${worstName} zırhı vücudun İÇİNDE kalıyor (marj ${worst.toFixed(3)} m)`);
  } else {
    ok(`${tier}: tüm uzuv zırhları vücudu kapsıyor (en dar marj +${worst.toFixed(3)} m)`);
  }
}

/* ═══════════ 4) AT + SADAK ═══════════ */
log('\n═══ 4) AT & SADAK ═══');
const horse = createArmoryHorse({ breed: 'war', factionId: 'vlandia', barding: true, lod: 'battle' });
if (!horse) bad('at modeli üretilemedi');
else {
  const box = new THREE.Box3().setFromObject(horse);
  const size = box.getSize(new THREE.Vector3());
  const pass = size.y > 1.6 && size.y < 3.2 && size.x > 2.0 && size.x < 4.2;
  pass
    ? ok(`savaş atı ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} m (kendi iskeleti, +X'e bakar)`)
    : bad(`at boyutu beklenen aralıkta değil: ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} m`);
}

/* ═══════════ 5) SES MOTORU ═══════════ */
log('\n═══ 5) SES MOTORU ═══');
await import('../src/game/armorySound.ts')
  .then((m) => {
    ok(`BattleSoundFX köprüsü yüklendi (etkin: ${m.armorySoundEnabled()})`);
    m.setArmorySoundEnabled(false);
    m.playBattleSound('swordClash'); // sessiz modda çökmemeli
    ok('sessiz modda çağrı güvenli');
  })
  .catch((error) => bad(`ses köprüsü yüklenemedi: ${error}`));


/* ═══════════ 6) KARAKTER OLUŞTURMA · YÜZ KATMANI ═══════════ */
log('\n═══ 6) YÜZ · gözler/burun/ağız kafatasının DIŞINDA mı? ═══');
{
  const rig = build({ helmetType: 'NONE', armorTier: 'CIVILIAN' }, true);
  const face = rig.head.getObjectByName('Face');
  if (!face) bad('yüz grubu yok (createFace bağlanmamış)');
  else {
    const skull = rig.head.children.find((c) => (c as THREE.Mesh).isMesh && c !== face) as THREE.Mesh;
    const skullBox = new THREE.Box3().setFromObject(skull);
    const frontZ = skullBox.max.z;
    let problems = 0;
    for (const name of ['eyeWhiteL', 'eyeWhiteR', 'irisL', 'irisR', 'nose', 'noseTip', 'mouth', 'upperLip', 'lowerLip', 'browL', 'browR']) {
      const part = face.getObjectByName(name);
      if (!part) {
        bad(`yüz parçası eksik: ${name}`);
        problems++;
        continue;
      }
      const box = new THREE.Box3().setFromObject(part);
      // Parçanın görünen yüzeyi kafatasının ön yüzeyine çok yakın/önünde olmalı.
      if (box.max.z < skullBox.min.z + (frontZ - skullBox.min.z) * 0.55) {
        bad(`${name} kafatasının içinde kalıyor (z=${box.max.z.toFixed(3)} < ön yüzey ${frontZ.toFixed(3)})`);
        problems++;
      }
    }
    if (problems === 0) ok('11 yüz parçası da görünür konumda');
  }
}

/* ═══════════ 7) SAÇ / SAKAL · yüzü kapatmıyor mu? ═══════════ */
log('\n═══ 7) SAÇ & SAKAL · göz hizasını kapatmıyor mu? ═══');
{
  const { createHairMesh, createBeardMesh, HAIR_STYLE_LABELS, BEARD_STYLE_LABELS } = await import('../src/game/characterMorph.ts');
  const rig = build({ helmetType: 'NONE', armorTier: 'CIVILIAN' }, true);
  const skull = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
  const skullBox = new THREE.Box3().setFromObject(skull);
  const eyeY = skullBox.min.y + (skullBox.max.y - skullBox.min.y) * 0.53; // göz hizası

  let hairProblems = 0;
  for (const style of Object.keys(HAIR_STYLE_LABELS) as (keyof typeof HAIR_STYLE_LABELS)[]) {
    const mesh = createHairMesh(style as never, rig.materials.hair);
    rig.head.add(mesh);
    rig.root.updateMatrixWorld(true);
    // Göz hizasında (y = eyeY ± 2 cm) saçın ÖN yüzeyi kafatasının önüne geçmemeli.
    for (const child of mesh.children) {
      const box = new THREE.Box3().setFromObject(child);
      // Saçın alnı örtmesi normaldir; sorun, GÖZ HİZASININ ALTINA inip önde
      // olmasıdır (eski sürümde 360° silindir bandı tam bunu yapıyordu).
      const dipsBelowEyes = box.min.y < eyeY - 0.012;
      const tooForward = box.max.z > skullBox.min.z + (skullBox.max.z - skullBox.min.z) * 0.55;
      if (dipsBelowEyes && tooForward) {
        bad(`saç "${style}": göz hizasının altına sarkıyor (minY=${box.min.y.toFixed(3)}, z=${box.max.z.toFixed(3)})`);
        hairProblems++;
      }
    }
    rig.head.remove(mesh);
  }
  if (hairProblems === 0) ok(`${Object.keys(HAIR_STYLE_LABELS).length} saç stili göz hizasını kapatmıyor`);

  let beardProblems = 0;
  for (const style of Object.keys(BEARD_STYLE_LABELS) as (keyof typeof BEARD_STYLE_LABELS)[]) {
    const mesh = createBeardMesh(style as never, rig.materials.hair);
    rig.head.add(mesh);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    if (!box.isEmpty() && box.max.y > eyeY - 0.005) {
      bad(`sakal "${style}": göz hizasına çıkıyor (tepe ${box.max.y.toFixed(3)} > ${(eyeY - 0.005).toFixed(3)})`);
      beardProblems++;
    }
    rig.head.remove(mesh);
  }
  if (beardProblems === 0) ok(`${Object.keys(BEARD_STYLE_LABELS).length} sakal stili göz hizasının altında`);
}

/* ═══════════ SONUÇ ═══════════ */
log('');
if (failures === 0) {
  log('✅ TÜM DOĞRULAMALAR GEÇTİ');
  process.exit(0);
} else {
  log(`❌ ${failures} DOĞRULAMA BAŞARISIZ`);
  process.exit(1);
}
