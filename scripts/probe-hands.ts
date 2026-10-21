/**
 * probe-hands.ts — El geometrisi (Faz 1j)
 *
 *   npx tsx scripts/probe-hands.ts
 *
 * Eski el tek bir kutu (0.07 × 0.09 × 0.08) idi → ön planda "tuğla" gibi.
 * Yeni el: bilek + avuç + parmak bloğu + iki oluk + başparmak.
 * Bu probe parça sayısını, oranları ve kapatma mesafesini ölçer.
 */
import * as THREE from 'three';
import { createCharacterRig, type CharacterVisualOptions } from '../src/game/characterRig.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const base: CharacterVisualOptions = {
  skinTone: '#e8be99',
  hairColor: '#2b1b10',
  beardColor: '#2b1b10',
  factionColor: '#7f1d1d',
  hasBeard: false,
  weaponType: 'NONE',
  shieldType: 'NONE',
  helmetType: 'NONE',
  armorTier: 'CHAINMAIL',
  factionId: 'vlandia',
} as unknown as CharacterVisualOptions;

const rig = createCharacterRig(base);
try {
  rig.root.updateMatrixWorld(true);

  for (const side of ['left', 'right'] as const) {
    const hand = rig[`${side}Hand`];
    const parts = hand.children.filter((c) => (c as THREE.Mesh).isMesh);
    const box = new THREE.Box3().setFromObject(hand).getSize(new THREE.Vector3());
    const forearm = rig[`${side}Forearm`];
    const armBox = new THREE.Box3().setFromObject(forearm).getSize(new THREE.Vector3());
    // Önkol çapı (silindir ekseni y): bilek ve el bundan kalın olmamalı.
    const armDiameter = Math.max(armBox.x, armBox.z);

    console.log(
      `${side.padEnd(6)} parça ${parts.length}  el ${box.x.toFixed(3)}×${box.y.toFixed(3)}×${box.z.toFixed(3)}  ` +
        `önkol çapı ${(armBox.y / Math.max(armBox.x, armBox.z)).toFixed(2)}`,
    );

    ok(parts.length >= 5, `${side}: el çok parçalı (kutu değil)`, `${parts.length} parça`);
    // Avuç/parmak önkol çapından çok geniş olmamalı (eldiven gibi şişmesin).
    ok(box.x < 0.1, `${side}: el genişliği makul`, `${box.x.toFixed(3)} m`);
    ok(box.y > 0.09 && box.y < 0.17, `${side}: el uzunluğu makul`, `${box.y.toFixed(3)} m`);
    ok(
      box.z <= armDiameter * 1.02,
      `${side}: el kalınlığı ön kol çapını aşmıyor`,
      `${box.z.toFixed(3)} ≤ ${armDiameter.toFixed(3)} m`,
    );
  }

  // Kavrama (silâh yuvası) noktası elin içinde olmalı → kılıç/kalkan elden kopmasın.
  for (const side of ['left', 'right'] as const) {
    const hand = rig[`${side}Hand`];
    const socket = hand.children.find((c) => (c as THREE.Group).type === 'Group');
    const world = socket
      ? socket.getWorldPosition(new THREE.Vector3())
      : hand.getWorldPosition(new THREE.Vector3());
    const box = new THREE.Box3().setFromObject(hand);
    ok(box.containsPoint(world), `${side}: kavrama noktası elin içinde`);
  }
} finally {
  // Test ortamı: GPU kaynağı yok, sahne referansı düşünce GC toplar.
}

console.log(fails === 0 ? '\n✅ ELLER DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
