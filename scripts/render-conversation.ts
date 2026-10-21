/**
 * render-conversation.ts — Faz 6d: diyalog sahnesi önizlemesi
 *
 *   npx tsx scripts/render-conversation.ts
 *
 * Çıktı: docs/renders/conversation.png
 *   3 satır (3 lord) × 4 kolon: yaklaşma %0, %50, %100 ve jest anı.
 */
import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import { createConversationScene } from '../src/game/conversation.ts';
import { collectTriangles, renderTriangles, montage, writePng, type Bitmap } from './lib/softRender.ts';

const W = 300;
const H = 200;

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(Object.entries(FACTION_INFO).map(([id, i]) => [id, i.name]));
const heroes = Object.values(buildHeroRegistry(campaign, factionNames as never).heroes) as any[];
const picked = [
  heroes.find((h) => h.occupation === 'RULER'),
  heroes.find((h) => h.occupation === 'LADY'),
  heroes.find((h) => h.occupation === 'LORD'),
].filter(Boolean);

const tiles: Bitmap[] = [];
for (const hero of picked) {
  const conv = createConversationScene({ hero });
  conv.scene.updateMatrixWorld(true);
  for (const step of [0, 0.5, 1]) {
    conv.update(0, { approach: step, speaking: true });
    conv.scene.updateMatrixWorld(true);
    const target = new THREE.Vector3();
    conv.camera.getWorldDirection(target).multiplyScalar(1.5).add(conv.camera.position);
    tiles.push(
      renderTriangles(collectTriangles(conv.scene), conv.camera.position.clone(), target, conv.camera.fov, W, H),
    );
  }
  // Jest anı (el kalkmış)
  conv.setSpeaking(true);
  conv.update(1 / 60);
  conv.gesture();
  for (let i = 0; i < 12; i++) conv.update(1 / 60);
  conv.scene.updateMatrixWorld(true);
  const target = new THREE.Vector3();
  conv.camera.getWorldDirection(target).multiplyScalar(1.5).add(conv.camera.position);
  tiles.push(
    renderTriangles(collectTriangles(conv.scene), conv.camera.position.clone(), target, conv.camera.fov, W, H),
  );
  conv.dispose();
}

const sheet = montage(tiles, 4, 5);
writePng('docs/renders/conversation.png', sheet);
console.log(`docs/renders/conversation.png (${sheet.width}×${sheet.height}) — ${tiles.length} karo`);
