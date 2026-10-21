/**
 * probe-portrait-face.ts — Faz 9f: portre YÜZ DETAYI
 *
 *   npx tsx scripts/probe-portrait-face.ts
 *
 * Kadraj DEĞİŞMEZ (portre kamerası `createPortraitCamera`). Burada yalnız yüzün
 * kendi detayları ölçülür:
 *   1. Burun gerçekten çıkıntı yapıyor mu (kafatası yüzeyinden ≥ 8 mm)?
 *   2. Kaş kalınlığı makul mü (≤ 9 mm) ve gözün üstünde mi?
 *   3. Alın görünüyor mu (saç çizgisi kaşın ≥ 8 mm üstünde)?
 *   4. Dudaklar var ve alt dudak üstten dolgun mu?
 *   5. Göz kapağı var (göz akı çıplak yapıştırma gibi durmuyor)?
 */
import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import { createHeroPortraitRig, createPortraitCamera, disposeRig } from '../src/game/portraitRenderer.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(Object.entries(FACTION_INFO).map(([id, i]) => [id, i.name]));
const heroes = Object.values(buildHeroRegistry(campaign, factionNames as never).heroes) as any[];

const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

/**
 * Saç çizgisi: saç geometrisinin **yüzün önünde** (z > 0.05) kalan en alt y.
 * Saç grubunun tamamının kutusu alınırsa enseye inen arka parça ölçüme girer.
 */
function hairlineY(hairGroup: THREE.Object3D): number {
  if (!hairGroup.visible) return 3; // kel → alın tamamen açık
  let min = Infinity;
  hairGroup.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const pos = m.geometry.getAttribute('position');
    if (!pos) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (v.z > 0.05) min = Math.min(min, v.y);
    }
  });
  return min === Infinity ? 3 : min;
}

interface Row {
  name: string;
  noseLift: number;
  browThick: number;
  browAboveEye: number;
  forehead: number;
  lowerLipH: number;
  upperLipH: number;
  hasLid: number;
  camOk: boolean;
}

const rows: Row[] = heroes.map((hero) => {
  const rig = createHeroPortraitRig(hero);
  try {
    rig.root.updateMatrixWorld(true);
    const face = rig.head.getObjectByName('Face')!;
    const skull = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    const skullBox = box(skull);
    const skullFront = skullBox.max.z;

    const nose = face.getObjectByName('nose')!;
    const noseBox = box(nose);
    const noseLift = noseBox.max.z - skullFront;

    const browMesh = face.getObjectByName('browL') as THREE.Mesh;
    // Döndürülmüş ince plakada dünya AABB'si kalınlığı şişirir → yerel geometri × ölçek.
    browMesh.geometry.computeBoundingBox();
    const gb = browMesh.geometry.boundingBox!;
    const browThickLocal = (gb.max.y - gb.min.y) * browMesh.scale.y;
    const browL = box(browMesh);
    const eyeL = box(face.getObjectByName('eyeWhiteL')!);
    /*
     * Saç çizgisi = saç **takkesinin** alt kenarı. Grubun tamamının kutusu
     * alınırsa enseye inen arka parça ölçüme girer ve alın yanlış çıkar.
     * Kel kahramanlarda grup gizli → alın tamamen açık kabul edilir.
     */
    const hairline = hairlineY(rig.hairGroup);
    const lowerLip = box(face.getObjectByName('lowerLip')!);
    const upper = face.getObjectByName('upperLip')!;
    const upperBox = box(upper);
    const lids = face.children.filter((c) => c.name.startsWith('lid') && c.visible).length;

    const cam = createPortraitCamera(rig);
    // Kadraj sözleşmesi: 30° FOV, kafanın önünde, makul mesafede.
    const headCenter = box(rig.head).getCenter(new THREE.Vector3());
    const dist = cam.position.distanceTo(headCenter);

    return {
      name: hero.name,
      noseLift,
      browThick: browThickLocal,
      browAboveEye: browL.min.y - eyeL.max.y,
      // Alın: kaşın üstü ile saç çizgisi arasındaki dikey boşluk.
      forehead: hairline - browL.max.y,
      lowerLipH: lowerLip.max.y - lowerLip.min.y,
      upperLipH: upperBox.max.y - upperBox.min.y,
      hasLid: lids,
      camOk: Math.abs(cam.fov - 30) < 0.001 && dist > 0.5 && dist < 2.6 && cam.position.z > headCenter.z,
    };
  } finally {
    disposeRig(rig);
  }
});

const span = (pick: (r: Row) => number) =>
  `${Math.min(...rows.map(pick)).toFixed(3)}..${Math.max(...rows.map(pick)).toFixed(3)}`;

ok(rows.every((r) => r.noseLift >= 0.008), 'burun kafatası yüzeyinden çıkıntı yapıyor (≥ 8 mm)', span((r) => r.noseLift));
ok(rows.every((r) => r.browThick <= 0.0095), 'kaş ince (≤ 9.5 mm)', span((r) => r.browThick));
ok(rows.every((r) => r.browAboveEye > 0.004), 'kaş gözün üstünde', span((r) => r.browAboveEye));
ok(rows.every((r) => r.forehead >= 0.008), 'alın görünüyor (saç çizgisi kaşın üstünde)', span((r) => r.forehead));
ok(rows.every((r) => r.lowerLipH >= 0.010), 'alt dudak dolgun (≥ 10 mm)', span((r) => r.lowerLipH));
ok(rows.every((r) => r.hasLid >= 2), 'göz kapağı var (üst + alt)', span((r) => r.hasLid));
ok(rows.every((r) => r.camOk), 'portre kadrajı korunmuş (30° FOV, kafanın önünde)');

const lowForehead = rows.filter((r) => r.forehead < 0.008);
if (lowForehead.length) console.log('alın kapalı:', lowForehead.map((r) => `${r.name} ${r.forehead.toFixed(3)}`).join(', '));

console.log(fails === 0 ? '\n✅ PORTRE YÜZ DETAYI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
