/**
 * probe-conversation.ts — Faz 6d: diyalog sahnesi (kamera + jest + konuşma)
 *
 *   npx tsx scripts/probe-conversation.ts
 *
 * Ölçülenler:
 *   1. Yaklaşma: kamera **tek yönlü** olarak yaklaşır ve durur (mesafe azalır).
 *   2. Baş takibi: muhatap başını kameraya çevirir, açı sınırların içinde kalır.
 *   3. Jest: seçenek seçilince sağ el kalkar, sonra geri döner.
 *   4. Konuşma: konuşurken alt dudak aşağı iner, susunca yerine döner.
 *   5. Göz kırpma: göz ölçeği kısa süre düşer, geri açılır.
 *   6. Yaşam: nefes/gövde hareketi var ama abartılı değil.
 *   7. Sahne temizlenir (rig'ler sökülür).
 */
import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import {
  APPROACH,
  HEAD_LIMIT,
  createConversationScene,
} from '../src/game/conversation.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(Object.entries(FACTION_INFO).map(([id, i]) => [id, i.name]));
const heroes = Object.values(buildHeroRegistry(campaign, factionNames as never).heroes) as any[];

const dt = 1 / 60;
const startDist = APPROACH.from.distanceTo(APPROACH.target);
const endDist = APPROACH.to.distanceTo(APPROACH.target);

/* ── 1. yaklaşma ── */
{
  const conv = createConversationScene({ hero: heroes[0] });
  const samples: number[] = [];
  for (let i = 0; i < 130; i++) {
    conv.update(dt);
    samples.push(conv.cameraDistance);
  }
  ok(Math.abs(samples[0] - startDist) < 0.12, 'kamera geniş planda başlıyor', samples[0].toFixed(2));
  ok(Math.abs(samples[samples.length - 1] - endDist) < 0.25, 'kamera yakın plana geliyor', samples[samples.length - 1].toFixed(2));
  let monotonic = true;
  for (let i = 1; i < samples.length; i++) if (samples[i] > samples[i - 1] + 1e-3) monotonic = false;
  ok(monotonic, 'yaklaşma tek yönlü (geri sıçrama yok)');
  ok(endDist < startDist * 0.7, 'yaklaşma belirgin (%35+ kısalma)', `${startDist.toFixed(2)} → ${endDist.toFixed(2)} m`);
  conv.dispose();
}

/* ── 2-6. baş takibi / jest / konuşma / kırpma / yaşam ── */
{
  const conv = createConversationScene({ hero: heroes[0] });
  for (let i = 0; i < 90; i++) conv.update(dt, { speaking: false });

  // Baş takibi: yön vektörü kameraya bakıyor mu?
  conv.npc.root.updateMatrixWorld(true);
  const headPos = new THREE.Vector3();
  conv.npc.head.getWorldPosition(headPos);
  const look = new THREE.Vector3(0, 0, 1).applyQuaternion(conv.npc.head.getWorldQuaternion(new THREE.Quaternion()));
  const toCam = conv.camera.position.clone().sub(headPos).normalize();
  const dot = look.dot(toCam);
  ok(dot > 0.9, 'muhatap başını kameraya çeviriyor', `cos ${dot.toFixed(3)}`);
  ok(
    Math.abs(conv.npc.head.rotation.y) <= HEAD_LIMIT.yaw + 1e-6 &&
      Math.abs(conv.npc.head.rotation.x) <= HEAD_LIMIT.pitch + 0.12,
    'baş açısı sınırlar içinde',
    `yaw ${conv.npc.head.rotation.y.toFixed(2)} / pitch ${conv.npc.head.rotation.x.toFixed(2)}`,
  );

  // Konuşma: alt dudak hareketi
  const face = conv.npc.head.getObjectByName('Face')!;
  const lowerLip = face.getObjectByName('lowerLip')!;
  const restY = lowerLip.position.y;
  let minLip = Infinity;
  let maxLip = -Infinity;
  conv.setSpeaking(true);
  for (let i = 0; i < 90; i++) {
    conv.update(dt, { speaking: true });
    minLip = Math.min(minLip, lowerLip.position.y);
    maxLip = Math.max(maxLip, lowerLip.position.y);
  }
  ok(maxLip - minLip > 0.004, 'konuşurken ağız açılıp kapanıyor', `genlik ${((maxLip - minLip) * 1000).toFixed(1)} mm`);
  conv.setSpeaking(false);
  for (let i = 0; i < 30; i++) conv.update(dt, { speaking: false });
  ok(Math.abs(lowerLip.position.y - restY) < 0.0005, 'susunca ağız kapanıyor', `Δ ${((lowerLip.position.y - restY) * 1000).toFixed(2)} mm`);

  // Jest: sağ el kalkıyor mu?
  const handRest = conv.npc.rightHand.getWorldPosition(new THREE.Vector3()).y;
  conv.gesture();
  let handPeak = -Infinity;
  for (let i = 0; i < 45; i++) {
    conv.update(dt);
    handPeak = Math.max(handPeak, conv.npc.rightHand.getWorldPosition(new THREE.Vector3()).y);
  }
  ok(handPeak - handRest > 0.05, 'jest sırasında el kalkıyor', `+${((handPeak - handRest) * 100).toFixed(1)} cm`);
  for (let i = 0; i < 60; i++) conv.update(dt);
  const handBack = conv.npc.rightHand.getWorldPosition(new THREE.Vector3()).y;
  ok(Math.abs(handBack - handRest) < 0.03, 'jest sonunda el geri dönüyor', `Δ ${((handBack - handRest) * 100).toFixed(1)} cm`);

  // Göz kırpma: 8 saniyede en az bir kez kapanmalı
  let minEyeScale = 1;
  for (let i = 0; i < 480; i++) {
    conv.update(dt);
    const eye = face.getObjectByName('eyeWhiteL') as THREE.Mesh;
    minEyeScale = Math.min(minEyeScale, eye.scale.y);
  }
  ok(minEyeScale < 0.5, 'göz kırpma çalışıyor', `en düşük ölçek ${minEyeScale.toFixed(2)}`);

  // Yaşam: gövde nefes alıyor (abartısız)
  const breaths: number[] = [];
  for (let i = 0; i < 120; i++) {
    conv.update(dt);
    breaths.push(conv.npc.torso.rotation.x);
  }
  const amp = Math.max(...breaths) - Math.min(...breaths);
  ok(amp > 0.002 && amp < 0.08, 'nefes/hareketsizlik canlı ama abartısız', `genlik ${(amp * 1000).toFixed(1)} mrad`);

  // Oyuncu figürü yakın planda var mı?
  ok(!!conv.player, 'oyuncu figürü sahnede (omuz üstü kadraj)');

  // Sahne temizliği
  const before = conv.scene.children.length;
  conv.dispose();
  ok(before > 3 && conv.scene.children.length === 0, 'sahne temizleniyor', `${before} → 0`);
}

console.log(fails === 0 ? '\n✅ DİYALOG SAHNESİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
