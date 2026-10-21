/**
 * probe-equipment.ts — Faz 9: miğfer ve kalkan görselleri
 *
 *   npx tsx scripts/probe-equipment.ts
 *
 * Kullanıcı bulgusu: "katafrakt kask görseli bozuk, birkaç kalkan da öyle".
 * Bu probe geometriyi ölçer:
 *   · katafrakt miğferi kafayı sarıyor mu, göz yarığı göz hizasında mı?
 *   · kalkanlar dik duruyor mu (üst = +Y), yüzü ileri mi (+Z)?
 *   · kalkan yere değiyor / gövdeye giriyor mu?
 *   · kılıftan çıkarınca duruş bozuluyor mu?
 */
import * as THREE from 'three';
import { createCharacterRig, HEAD, setRigSheathed, type CharacterVisualOptions } from '../src/game/characterRig.ts';

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
const size = (b: THREE.Box3) => b.getSize(new THREE.Vector3());

/* ── referans: kafatası ── */
const ref = createCharacterRig({ ...base } as CharacterVisualOptions);
ref.root.updateMatrixWorld(true);
const skullMesh = ref.helmetSocket.parent!.children.find((c) => (c as THREE.Mesh).isMesh)!;
const skull = box(skullMesh);
const skullSize = size(skull);
const eyeY = (skull.min.y + skull.max.y) / 2 + 0.012;

console.log(
  `kafatası y ${skull.min.y.toFixed(3)}..${skull.max.y.toFixed(3)} · ` +
    `göz hizası ${eyeY.toFixed(3)} · genişlik ${skullSize.x.toFixed(3)}`,
);

/* ── 1. Katafrakt (IMPERIAL_VISOR) ── */
{
  const rig = createCharacterRig({ ...base, helmetType: 'IMPERIAL_VISOR' } as CharacterVisualOptions);
  rig.root.updateMatrixWorld(true);
  const helmet = rig.helmetSocket.children[0];
  ok(!!helmet, 'katafrakt miğferi üretildi');
  ok(helmet?.name !== 'Armory_greatHelm', 'BannerForge greatHelm yerine özel model kullanılıyor', helmet?.name ?? '-');

  const b = box(helmet);
  const s = size(b);
  const headCenterY = (skull.min.y + skull.max.y) / 2;

  ok(b.max.y > skull.max.y, 'kubbe tepesi kafatasının üstünde', `${b.max.y.toFixed(3)} > ${skull.max.y.toFixed(3)}`);
  ok(
    b.max.y - skull.max.y < 0.1,
    'miğfer tepesi kafadan çok yükselmiyor (kova görünümü yok)',
    `${(b.max.y - skull.max.y).toFixed(3)} m`,
  );
  ok(
    b.min.y > skull.min.y - 0.13,
    'miğfer çene hizasının çok altına sarkmıyor',
    `${(skull.min.y - b.min.y).toFixed(3)} m`,
  );
  ok(s.x < skullSize.x + 0.13, 'miğfer genişliği kafayla orantılı', `${s.x.toFixed(3)} m`);
  ok(b.min.z < 0.0 && b.max.z > 0.1, 'miğfer önden arkaya uzanıyor');

  // göz yarığı: koyu renkli, göz hizasında, içe gömük halka
  const slit = helmet.getObjectByName('visorEyeSlit');
  ok(!!slit, 'göz yarığı ayrı (koyu) parça olarak var');
  if (slit) {
    const sb = box(slit as THREE.Mesh);
    const slitCenterY = (sb.min.y + sb.max.y) / 2;
    ok(Math.abs(slitCenterY - eyeY) < 0.02, 'göz yarığı göz hizasında', `Δ ${(slitCenterY - eyeY).toFixed(3)} m`);
    ok(sb.max.z > 0.1, 'göz yarığı yüzün önünde (arkada kalmıyor)');
  }

  // yüz plakaları: göz hizasını çevreliyor ve TAM TUR (ten sızmıyor)
  const frontMeshes: THREE.Mesh[] = [];
  let fullRings = 0;
  helmet.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    if (box(m).max.z > 0.12) frontMeshes.push(m);
    if ((m.geometry as THREE.CylinderGeometry).type === 'CylinderGeometry') {
      const geo = m.geometry as THREE.CylinderGeometry;
      const params = geo.parameters as { radiusTop: number; radiusBottom: number };
      const maxR = Math.max(params.radiusTop ?? 0, params.radiusBottom ?? 0);
      // Kafatası elipsoidinin yatay yarıçapı 0.125; halka bundan büyükse tam sarar.
      if (maxR >= 0.125) fullRings += 1;
    }
  });
  ok(frontMeshes.length >= 3, 'yüz plakası çok parçalı', `${frontMeshes.length} parça`);
  ok(fullRings >= 2, 'yüz plakaları tam tur halka (aralarda ten kalmıyor)', `${fullRings} halka`);
  ok(headCenterY > skull.min.y && headCenterY < skull.max.y, 'referans kafa merkezi tutarlı');
}

/* ── 2. Diğer miğferler ── */
for (const helmetType of ['KETTLE_HAT', 'SPANGENHELM'] as const) {
  const rig = createCharacterRig({ ...base, helmetType } as CharacterVisualOptions);
  rig.root.updateMatrixWorld(true);
  const b = box(rig.helmetSocket.children[0]);
  ok(b.max.y > skull.max.y - 0.02, `${helmetType}: tepe kafatasını örtüyor`);
  if (helmetType === 'KETTLE_HAT') {
    // Siperliği gözleri KAPATMAMALI ama tepenin üstünde de durmamalı.
    ok(b.min.y > eyeY, `${helmetType}: siperlik göz hizasını kapatmıyor`, `${(b.min.y - eyeY).toFixed(3)} m üstte`);
    ok(b.min.y < skull.max.y, `${helmetType}: siperlik tepenin altında (havada durmuyor)`);
  } else {
    // Burun demiri göz hizasının altına iner (nasal helm).
    ok(b.min.y < eyeY, `${helmetType}: burun demiri yüze iniyor`);
  }
  ok(b.max.y - skull.max.y < 0.2, `${helmetType}: aşırı yükselmiyor`);
  ok(size(b).x < 0.5, `${helmetType}: siperlik/genişlik makul`, `${size(b).x.toFixed(3)} m`);
}

/* ── 3. Kalkanlar ── */
const spec: Record<string, { height?: [number, number]; width?: [number, number]; diameter?: [number, number] }> = {
  ROUND_SHIELD: { diameter: [0.6, 0.8] },
  KITE_SHIELD: { height: [0.82, 1.02], width: [0.35, 0.55] },
  PAVISE: { height: [0.7, 0.9], width: [0.38, 0.58] },
};

for (const shieldType of ['ROUND_SHIELD', 'KITE_SHIELD', 'PAVISE'] as const) {
  const rig = createCharacterRig({ ...base, shieldType } as CharacterVisualOptions);
  rig.root.updateMatrixWorld(true);
  const shield = rig.leftShieldSocket.children.find((c) => c.name === 'Shield');
  ok(!!shield, `${shieldType}: kalkan üretildi`);
  if (!shield) continue;

  const q = shield.getWorldQuaternion(new THREE.Quaternion());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const b = box(shield);
  const s = size(b);

  ok(up.y > 0.99, `${shieldType}: kalkan DİK duruyor (üst = +Y)`, `up ${up.toArray().map((v) => v.toFixed(2)).join(',')}`);
  ok(normal.z > 0.99, `${shieldType}: yüzü ileri bakıyor (+Z)`, `n ${normal.toArray().map((v) => v.toFixed(2)).join(',')}`);
  ok(b.min.y > 0.3, `${shieldType}: yere değmiyor`, `alt ${b.min.y.toFixed(2)} m`);
  ok(b.min.z > 0.1, `${shieldType}: gövdenin önünde duruyor`, `z ${b.min.z.toFixed(2)} m`);

  const sp = spec[shieldType];
  if (sp.diameter) {
    ok(s.x >= sp.diameter[0] && s.x <= sp.diameter[1], `${shieldType}: çap ${sp.diameter[0]}–${sp.diameter[1]} m`, `${s.x.toFixed(2)} m`);
  }
  if (sp.height) {
    ok(s.y >= sp.height[0] && s.y <= sp.height[1], `${shieldType}: boy ${sp.height[0]}–${sp.height[1]} m`, `${s.y.toFixed(2)} m`);
  }
  if (sp.width) {
    ok(s.x >= sp.width[0] && s.x <= sp.width[1], `${shieldType}: genişlik ${sp.width[0]}–${sp.width[1]} m`, `${s.x.toFixed(2)} m`);
  }
  ok(s.y > s.x, `${shieldType}: uzun ekseni dikey (yan yatmamış)`, `${s.y.toFixed(2)} > ${s.x.toFixed(2)}`);

  /* kılıftan çıkarma duruşu bozmamalı */
  setRigSheathed(rig, true);
  setRigSheathed(rig, false);
  rig.root.updateMatrixWorld(true);
  const after = rig.leftShieldSocket.children.find((c) => c.name === 'Shield')!;
  const upAfter = new THREE.Vector3(0, 1, 0).applyQuaternion(after.getWorldQuaternion(new THREE.Quaternion()));
  const nAfter = new THREE.Vector3(0, 0, 1).applyQuaternion(after.getWorldQuaternion(new THREE.Quaternion()));
  ok(upAfter.y > 0.99 && nAfter.z > 0.99, `${shieldType}: kılıftan çıkarınca duruş korunuyor`);
}

/* ── 4. Kafa ölçüleriyle tutarlılık ── */
ok(HEAD.r > 0.1 && HEAD.r < 0.15, 'kafa yarıçapı sabiti makul', `${HEAD.r}`);
ok(skull.max.y - skull.min.y < 0.4, 'kafatası yüksekliği makul', `${(skull.max.y - skull.min.y).toFixed(2)} m`);

console.log(fails === 0 ? '\n✅ MİĞFER & KALKAN GEOMETRİSİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
