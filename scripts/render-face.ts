/**
 * render-face.ts — Faz 9c: yüz yakın planı (zırh/miğfer yüzü kapatıyor mu?)
 *
 *   npx tsx scripts/render-face.ts
 *
 * Çıktı: docs/renders/face-cover.png
 *   4 satır (zırh kademesi) × 4 kolon (miğfersiz + 3 miğfer), göğüs üstü kadraj.
 */
import * as THREE from 'three';
import { createCharacterRig, type ArmorTier, type CharacterVisualOptions, type HelmetType } from '../src/game/characterRig.ts';
import { collectTriangles, renderTriangles, montage, writePng } from './lib/softRender.ts';

const TILE = 300;
const base = {
  skinTone: '#e8be99',
  hairColor: '#2b1b10',
  beardColor: '#2b1b10',
  factionColor: '#7f1d1d',
  hasBeard: true,
  weaponType: 'NONE',
  shieldType: 'NONE',
  helmetType: 'NONE',
  armorTier: 'CHAINMAIL',
  factionId: 'vlandia',
} as unknown as CharacterVisualOptions;

const TIERS: ArmorTier[] = ['CIVILIAN', 'LEATHER', 'CHAINMAIL', 'PLATE'];
const HELMETS: HelmetType[] = ['NONE', 'KETTLE_HAT', 'SPANGENHELM', 'IMPERIAL_VISOR'];

const tiles = [];
for (const tier of TIERS) {
  for (const helmetType of HELMETS) {
    const rig = createCharacterRig({ ...base, armorTier: tier, helmetType } as CharacterVisualOptions);
    rig.root.updateMatrixWorld(true);
    const eye = new THREE.Vector3(0.3, 1.98, 1.0);
    const target = new THREE.Vector3(0, 1.86, 0.02);
    tiles.push(renderTriangles(collectTriangles(rig.root), eye, target, 32, TILE, TILE));
  }
}
const sheet = montage(tiles, 4, 4);
writePng('docs/renders/face-cover.png', sheet);
console.log(`docs/renders/face-cover.png yazıldı (${sheet.width}×${sheet.height}) — ${tiles.length} karo`);
