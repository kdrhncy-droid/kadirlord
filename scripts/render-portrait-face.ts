/**
 * render-portrait-face.ts — Faz 9f: portre YÜZ yakın planı
 *
 *   npx tsx scripts/render-portrait-face.ts
 *
 * Çıktı: docs/renders/portrait-face.png
 *   Satır 1: erkek lordlar — Satır 2: leydiler (aynı kadraj, 4'er kişi).
 * Kamera: portre kamerasının aynısı (kadraj sözleşmesi korunur), sadece
 * yakınlaştırma yok — portre kırpılmadan yüz görünsün diye FOV daraltıldı.
 */
import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import { createHeroPortraitRig, createPortraitCamera, disposeRig } from '../src/game/portraitRenderer.ts';
import { collectTriangles, renderTriangles, montage, writePng, type Bitmap } from './lib/softRender.ts';

const W = 264;
const H = 330;
const TILE = W; // montaj kare karo kullanıyor; genişlik kadar
const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(Object.entries(FACTION_INFO).map(([id, i]) => [id, i.name]));
const heroes = Object.values(buildHeroRegistry(campaign, factionNames as never).heroes) as any[];

const lords = heroes.filter((h) => h.occupation !== 'LADY').slice(0, 4);
const ladies = heroes.filter((h) => h.occupation === 'LADY').slice(0, 4);

const tiles: Bitmap[] = [];
for (const hero of [...lords, ...ladies]) {
  const rig = createHeroPortraitRig(hero);
  rig.root.updateMatrixWorld(true);
  // Oyunun portre kamerasının AYNISI (kadraj sözleşmesi burada da korunur).
  const cam = createPortraitCamera(rig);
  const target = new THREE.Vector3();
  cam.getWorldDirection(target).multiplyScalar(1.2).add(cam.position);
  tiles.push(renderTriangles(collectTriangles(rig.root), cam.position.clone(), target, cam.fov, W, H));
  disposeRig(rig);
}
const sheet = montage(tiles, 4, 4);
writePng('docs/renders/portrait-face.png', sheet);
console.log(`docs/renders/portrait-face.png (${sheet.width}×${sheet.height}) — ${tiles.length} yüz`);
