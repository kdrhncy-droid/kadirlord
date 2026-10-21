/**
 * render-styles.ts — saç / sakal / miğfer kontakt sayfaları
 *
 *   npx tsx scripts/render-styles.ts
 *
 * Çıktı: docs/renders/hair-styles.png, beard-styles.png, helmets.png
 * Kafanın yüzü kapatılıp kapatılmadığını gözle doğrulamak için.
 */
import * as THREE from 'three';
import { createCharacterRig, type CharacterVisualOptions } from '../src/game/characterRig.ts';
import {
  applyMorphDNAToRig,
  PLAYER_DEFAULT_DNA,
  type HairStyleId,
  type BeardStyleId,
  HAIR_STYLE_LABELS,
  BEARD_STYLE_LABELS,
} from '../src/game/characterMorph.ts';
import { collectTriangles, renderTriangles, montage, writePng } from './lib/softRender.ts';

const TILE = 240;

function buildRig(
  dnaOverride: Record<string, unknown>,
  visual: Partial<CharacterVisualOptions> = {},
) {
  const rig = createCharacterRig({
    skinTone: '#e8be99',
    hairColor: '#382212',
    beardColor: '#382212',
    factionColor: '#991b1b',
    hasBeard: true,
    weaponType: 'UNARMED',
    shieldType: 'NONE',
    helmetType: 'NONE',
    armorTier: 'CIVILIAN',
    factionId: 'vlandia',
    ...visual,
  });
  applyMorphDNAToRig(rig, { ...PLAYER_DEFAULT_DNA, ...dnaOverride } as typeof PLAYER_DEFAULT_DNA);
  rig.root.updateMatrixWorld(true);
  return rig;
}

/** Kafatası mesh'inin dünya kutusundan gerçek kafa merkezini bulur. */
function headCenterOf(rig: ReturnType<typeof buildRig>): THREE.Vector3 {
  const skull = rig.head.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh;
  const box = new THREE.Box3().setFromObject(skull);
  return box.getCenter(new THREE.Vector3());
}

function tile(rig: ReturnType<typeof buildRig>, angleDeg: number, dist = 0.92) {
  const center = headCenterOf(rig);
  const a = (angleDeg * Math.PI) / 180;
  const eye = new THREE.Vector3(
    center.x + Math.sin(a) * dist,
    center.y + 0.05,
    center.z + Math.cos(a) * dist,
  );
  return renderTriangles(collectTriangles(rig.root), eye, center, 30, TILE, TILE);
}

/* ── saç stilleri (önden + 3/4) ── */
const hairStyles = Object.keys(HAIR_STYLE_LABELS) as HairStyleId[];
const hairTiles = [];
for (const style of hairStyles) {
  const rig = buildRig({ hairStyle: style, beardStyle: 'clean_shaven' });
  hairTiles.push(tile(rig, 0), tile(rig, 40));
}
writePng('docs/renders/hair-styles.png', montage(hairTiles, 4));
console.log(`saç: ${hairStyles.length} stil → docs/renders/hair-styles.png`);

/* ── sakal stilleri ── */
const beardStyles = Object.keys(BEARD_STYLE_LABELS) as BeardStyleId[];
const beardTiles = [];
for (const style of beardStyles) {
  const rig = buildRig({ hairStyle: 'bald', beardStyle: style });
  beardTiles.push(tile(rig, 0), tile(rig, 40));
}
writePng('docs/renders/beard-styles.png', montage(beardTiles, 4));
console.log(`sakal: ${beardStyles.length} stil → docs/renders/beard-styles.png`);

/* ── miğferli kafalar ── */
const outfits: [string, Partial<CharacterVisualOptions>][] = [
  ['civilian', { helmetType: 'NONE', armorTier: 'CIVILIAN' }],
  ['leather', { helmetType: 'KETTLE_HAT', armorTier: 'LEATHER' }],
  ['chainmail', { helmetType: 'SPANGENHELM', armorTier: 'CHAINMAIL' }],
  ['royal', { helmetType: 'IMPERIAL_VISOR', armorTier: 'PLATE' }],
];
const helmetTiles = [];
for (const [, visual] of outfits) {
  const rig = buildRig({ hairStyle: 'short_parted', beardStyle: 'full_beard' }, visual);
  helmetTiles.push(tile(rig, 0), tile(rig, 90));
}
writePng('docs/renders/helmets.png', montage(helmetTiles, 4));
console.log('miğferler → docs/renders/helmets.png');
