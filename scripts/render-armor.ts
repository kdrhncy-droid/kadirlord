/**
 * render-armor.ts — asker zırhı (göğüs bölgesi) görsel önizleme
 *
 *   npx tsx scripts/render-armor.ts
 *
 * Çıktı: docs/renders/armor-chest.png
 *   3 satır (LEATHER / CHAINMAIL / PLATE) × 4 kolon (ön, 3/4, yan, arka)
 *   + altta göğüs yakın planı.
 */
import * as THREE from 'three';
import { createCharacterRig, type ArmorTier, type CharacterVisualOptions } from '../src/game/characterRig.ts';
import { setArmoryVisualsEnabled } from '../src/game/armoryBridge.ts';
import { collectTriangles, renderTriangles, montage, writePng, type Bitmap } from './lib/softRender.ts';

const TILE = 300;

const base = {
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

/** Gövde merkezine bakan kamera; `yaw` 0 = önden. */
function shot(
  rig: ReturnType<typeof createCharacterRig>,
  yaw: number,
  height: number,
  dist: number,
  targetY = 1.42,
): Bitmap {
  const center = new THREE.Vector3(0, targetY, 0);
  const eye = new THREE.Vector3(Math.sin(yaw) * dist, height, Math.cos(yaw) * dist);
  return renderTriangles(collectTriangles(rig.root), eye, center, 34, TILE, TILE);
}

const tiles: Bitmap[] = [];
const TIERS: ArmorTier[] = ['LEATHER', 'CHAINMAIL', 'PLATE'];

for (const armory of [true, false]) {
  setArmoryVisualsEnabled(armory);
  for (const tier of TIERS) {
    const rig = createCharacterRig({ ...base, armorTier: tier } as CharacterVisualOptions);
    rig.root.updateMatrixWorld(true);
    for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      tiles.push(shot(rig, yaw, 1.5, 2.6));
    }
  }
}

/* Göğüs yakın planı (BannerForge) */
setArmoryVisualsEnabled(true);
for (const tier of TIERS) {
  const rig = createCharacterRig({ ...base, armorTier: tier } as CharacterVisualOptions);
  rig.root.updateMatrixWorld(true);
  tiles.push(shot(rig, 0, 1.5, 1.35, 1.5));
  tiles.push(shot(rig, Math.PI / 5, 1.5, 1.35, 1.5));
}

// 4 kolonlu ızgara: 6 satır × 4
const sheet = montage(tiles, 4, 4);
writePng('docs/renders/armor-chest.png', sheet);
console.log(`docs/renders/armor-chest.png yazıldı (${sheet.width}×${sheet.height}) — ${tiles.length} karo`);
