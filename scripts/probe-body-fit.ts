/**
 * probe-body-fit.ts — Beden oranları ve zırh oturması (Faz 1f)
 *
 *   npx tsx scripts/probe-body-fit.ts
 *
 * `applyMorphDNAToRig` DNA ölçeklerini uygular. Ölçekler ebeveyn gruplara
 * yazıldığı için bir ölçeğin **iki kez** uygulanması kolay: bu probe her
 * kahramanın iskeletini kurup dünya uzayında ölçer ve şu sözleşmeleri arar:
 *   - ayaklar yerde (y ≈ 0), boy 1.55–2.05 arası,
 *   - omuz açıklığı 0.55–0.90 (insan oranı),
 *   - kafa kutusu aşırı uzamıyor (y/x ≤ 1.45),
 *   - göğüs zırhı omuz açıklığının içinde kalıyor (gövdeden taşmıyor).
 */
import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import { createHeroPortraitRig, disposeRig } from '../src/game/portraitRenderer.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const heroes = Object.values(buildHeroRegistry(campaign, factionNames).heroes);

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

interface Row {
  name: string;
  occupation: string;
  gender: 'E' | 'K';
  feetY: number;
  headTop: number;
  height: number;
  shoulderDist: number;
  headAspect: number;
  armorW: number;
  armorD: number;
  torsoW: number;
}

const rows: Row[] = heroes.map((hero) => {
  const rig = createHeroPortraitRig(hero);
  try {
    const feet = new THREE.Box3();
    for (const foot of [rig.leftFoot, rig.rightFoot]) feet.union(new THREE.Box3().setFromObject(foot));
    const headBox = new THREE.Box3().setFromObject(rig.head);
    // Kafa oranı **kafatasından** ölçülür: saç/sakal kutuya girerse yanıltır.
    const skull = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;

    const l = new THREE.Vector3();
    const r = new THREE.Vector3();
    rig.leftShoulder.getWorldPosition(l);
    rig.rightShoulder.getWorldPosition(r);

    const torsoMesh = rig.torso.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
    const torsoSize = new THREE.Box3().setFromObject(torsoMesh).getSize(new THREE.Vector3());

    const armorBox = new THREE.Box3();
    for (const c of rig.chestArmorSocket.children) armorBox.union(new THREE.Box3().setFromObject(c));
    const armorSize = armorBox.isEmpty() ? new THREE.Vector3() : armorBox.getSize(new THREE.Vector3());

    // Kafa oranı: **yerel** ölçek oranı. Dünya kutusu, boyun/gövde dönüşü ve
    // kesme (shear) yüzünden yanıltıcı oluyor.
    skull.geometry.computeBoundingBox();
    const gb = skull.geometry.boundingBox!;
    const geoAspect = (gb.max.y - gb.min.y) / Math.max(gb.max.x - gb.min.x, 1e-6);
    const localAspect = geoAspect * (rig.head.scale.y / Math.max(rig.head.scale.x, 1e-6));
    return {
      name: hero.name,
      occupation: hero.occupation,
      gender: hero.occupation === 'LADY' ? 'K' : 'E',
      feetY: feet.isEmpty() ? 0 : feet.min.y,
      headTop: headBox.max.y,
      height: headBox.max.y - (feet.isEmpty() ? 0 : feet.min.y),
      shoulderDist: l.distanceTo(r),
      headAspect: localAspect,
      armorW: armorSize.x,
      armorD: armorSize.z,
      torsoW: torsoSize.x,
    };
  } finally {
    disposeRig(rig);
  }
});

const span = (pick: (r: Row) => number) => {
  const vals = rows.map(pick);
  return `${Math.min(...vals).toFixed(2)}..${Math.max(...vals).toFixed(2)}`;
};

console.log('ölçüm aralıkları (40 kahraman)');
console.log('  ayak y      ', span((r) => r.feetY));
console.log('  boy         ', span((r) => r.height));
console.log('  omuz        ', span((r) => r.shoulderDist));
console.log('  kafa y/x    ', span((r) => r.headAspect));
console.log('  zırh/göğüs  ', span((r) => r.armorW / Math.max(r.torsoW, 1e-6)));
console.log('');

ok(rows.every((r) => Math.abs(r.feetY) < 0.03), 'ayaklar yerde', span((r) => r.feetY));
ok(
  rows.every((r) => r.height > 1.85 && r.height < 2.35),
  'boy 1.85–2.35 arası (taban iskelet 2.09)',
  span((r) => r.height),
);
ok(
  rows.every((r) => r.shoulderDist > 0.5 && r.shoulderDist < 0.95),
  'omuz açıklığı 0.50–0.95',
  span((r) => r.shoulderDist),
);
ok(
  rows.every((r) => r.headAspect > 0.85 && r.headAspect < 1.35),
  'kafatası oranı normal (0.85–1.35)',
  span((r) => r.headAspect),
);
// Lordlar/hükümdarlar zırhlı; leydiler ve haydut reisleri tunik/deri içinde
// (BannerForge'da o meslekler için göğüs zırhı üretilmiyor) → onlarda beklemiyoruz.
const warriors = rows.filter((r) => r.occupation === 'RULER' || r.occupation === 'LORD');
const armored = warriors.filter((r) => r.armorW > 0);
ok(warriors.length > 15 && armored.length === warriors.length, 'tüm lord/hükümdarlar zırhlı', `${armored.length}/${warriors.length}`);
ok(
  armored.every((r) => r.armorW < r.shoulderDist),
  'göğüs zırhı omuz açıklığının içinde',
  armored.map((r) => (r.armorW / r.shoulderDist).toFixed(2)).join(' '),
);
ok(
  armored.every((r) => r.armorD < r.torsoW * 0.8),
  'zırh derinliği gövdeyle orantılı',
  span((r) => r.armorD),
);

// Omuz açıklığı gövde genişliğiyle tutarlı olmalı (zırh/gövde ayrışmasın).
const ratios = rows.map((r) => r.shoulderDist / Math.max(r.torsoW, 1e-6));
ok(
  ratios.every((v) => v > 1.15 && v < 1.9),
  'omuz/göğüs oranı tutarlı (1.15–1.9)',
  `${Math.min(...ratios).toFixed(2)}..${Math.max(...ratios).toFixed(2)}`,
);

console.log(fails === 0 ? '\n✅ BEDEN ORANLARI VE ZIRH OTURMASI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
