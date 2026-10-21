/**
 * probe-armor-legs.ts — Faz 9d: asker zırhının BACAK ve AYAK bölgesi
 *
 *   npx tsx scripts/probe-armor-legs.ts
 *
 * Faz 9b'de göğüs/kollar düzeltildi. Aynı iskelet uyumsuzluğu bacaklarda da
 * varsa: zırh bacağı örtmez, iki bacak zırhı birbirine girer, ayaklık yeri
 * deler ya da havada durur. Ölçülenler (her kademe × iki katman):
 *   1. Uyluk/bilek zırhı bacağı tam örtüyor mu (pay > 0),
 *   2. Zırh bacağın içine gömülüyor mu (kesişim derinliği),
 *   3. İki bacağın zırhı birbirine giriyor mu,
 *   4. Ayaklık ayağı örtüyor mu ve yere değiyor mu (havada/değil).
 */
import * as THREE from 'three';
import { setArmoryVisualsEnabled } from '../src/game/armoryBridge.ts';
import {
  createCharacterRig,
  type ArmorTier,
  type CharacterVisualOptions,
} from '../src/game/characterRig.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
const r3 = (v: number) => v.toFixed(3);

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

const TIERS: ArmorTier[] = ['LEATHER', 'CHAINMAIL', 'PLATE'];

/** Bir eklemdeki zırh parçaları (kendi işaretimiz ya da armory_ sarmalayıcısı). */
function armorIn(node: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  node.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData?.limbArmor) out.push(m);
  });
  return out;
}

/** Eklemdeki ten/kumaş mesh'i (zırh işaretli olmayan ilk mesh). */
function bodyIn(node: THREE.Object3D): THREE.Mesh | undefined {
  return node.children.find((c) => (c as THREE.Mesh).isMesh && !(c as THREE.Mesh).userData.limbArmor) as
    | THREE.Mesh
    | undefined;
}

for (const armory of [true, false]) {
  setArmoryVisualsEnabled(armory);
  console.log(`\n── ${armory ? 'BannerForge (varsayılan)' : 'legacy'} katmanı ──`);
  for (const tier of TIERS) {
    const rig = createCharacterRig({ ...base, armorTier: tier } as CharacterVisualOptions);
    rig.root.updateMatrixWorld(true);

    for (const side of ['left', 'right'] as const) {
      for (const [label, node] of [
        ['uyluk', rig[`${side}Thigh` as 'leftThigh']],
        ['baldır', rig[`${side}Shin` as 'leftShin']],
      ] as const) {
        const parts = armorIn(node as THREE.Object3D);
        const bodyMesh = bodyIn(node as THREE.Object3D);
        if (!bodyMesh) continue;
        ok(parts.length > 0, `${tier} · ${side} ${label}: zırh parçası var`, `${parts.length}`);
        if (!parts.length) continue;
        const bodyBox = box(bodyMesh);
        const armorBox = new THREE.Box3();
        for (const p of parts) armorBox.union(box(p));
        // Örtme: zırh her eksende ten mesh'inden büyük/eşit olmalı.
        const sA = armorBox.getSize(new THREE.Vector3());
        const sB = bodyBox.getSize(new THREE.Vector3());
        const cover = Math.min(sA.x - sB.x, sA.z - sB.z);
        ok(cover >= -0.002, `${tier} · ${side} ${label}: zırh uzvu örtüyor`, `pay ${r3(cover)} m`);
        // Uzuvdan kaymamış olmalı: zırh, uzvun boyunu kapsamalı (kayarsa
        // zırh dizin altına düşer ya da kalçaya çıkar).
        ok(
          armorBox.min.y <= bodyBox.min.y + 0.03 && armorBox.max.y >= bodyBox.max.y - 0.03,
          `${tier} · ${side} ${label}: zırh uzvun boyunca oturuyor`,
          `zırh ${r3(armorBox.min.y)}..${r3(armorBox.max.y)} / uzuv ${r3(bodyBox.min.y)}..${r3(bodyBox.max.y)}`,
        );
      }
    }

    // İki bacak zırhı birbirine giriyor mu?
    const legBoxes: Array<{ side: string; b: THREE.Box3 }> = [];
    for (const side of ['left', 'right'] as const) {
      for (const node of [rig[`${side}Thigh` as 'leftThigh'], rig[`${side}Shin` as 'leftShin']]) {
        for (const p of armorIn(node as THREE.Object3D)) legBoxes.push({ side, b: box(p) });
      }
    }
    let cross = 0;
    for (let i = 0; i < legBoxes.length; i++) {
      for (let j = i + 1; j < legBoxes.length; j++) {
        if (legBoxes[i].side === legBoxes[j].side) continue;
        if (!legBoxes[i].b.intersectsBox(legBoxes[j].b)) continue;
        const s = legBoxes[i].b.clone().intersect(legBoxes[j].b).getSize(new THREE.Vector3());
        cross = Math.max(cross, Math.min(s.x, s.y, s.z));
      }
    }
    ok(cross < 0.01, `${tier}: iki bacağın zırhı birbirine girmiyor`, `giriş ${(cross * 1000).toFixed(0)} mm`);

    // Ayaklık: ayağı örtüyor mu, yere basıyor mu?
    for (const side of ['left', 'right'] as const) {
      const foot = rig[`${side}Foot` as 'leftFoot'] as THREE.Object3D;
      const parts = armorIn(foot);
      const bodyMesh = bodyIn(foot);
      if (!bodyMesh) continue;
      const fb = box(bodyMesh);
      if (parts.length) {
        const ab = new THREE.Box3();
        for (const p of parts) ab.union(box(p));
        const covers = ab.min.y <= fb.min.y + 0.002 && ab.max.y >= fb.max.y - 0.004;
        ok(covers, `${tier} · ${side} ayaklık ayağı örtüyor`, `ayak ${r3(fb.min.y)}..${r3(fb.max.y)} / zırh ${r3(ab.min.y)}..${r3(ab.max.y)}`);
        // Ayaklık, ayağın tabanıyla aynı hizada olmalı (ne havada ne gömülü).
        ok(
          ab.min.y >= fb.min.y - 0.006 && ab.min.y <= fb.min.y + 0.02,
          `${tier} · ${side} ayaklık ayağın tabanıyla hizalı`,
          `zırh ${r3(ab.min.y)} / ayak ${r3(fb.min.y)}`,
        );
      } else {
        ok(tier === 'LEATHER', `${tier} · ${side}: ayaklık var`, parts.length ? '' : 'yok (deri: çizme ten)');
      }
    }
  }
}

console.log(fails === 0 ? '\n✅ BACAK/AYAK ZIRHI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
