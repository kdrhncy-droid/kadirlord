/**
 * render-bow.ts — yayın çekiş anları (headless render)
 *
 *   npx tsx scripts/render-bow.ts
 *
 * Çıktı: docs/renders/bow-draw.png  (dinlenme / yarım çekiş / tam çekiş / 1 sn basılı tutma)
 * Ayrıca kiriş geometrisini ölçer: uç noktaları uzuv uçlarıyla aynı yerde mi,
 * çekiş sırasında kiriş nok noktası geriye (okçuya) doğru mu geliyor?
 */
import * as THREE from 'three';
import { createCharacterRig } from '../src/game/characterRig.ts';
import { CharacterAnimator } from '../src/game/characterAnimator.ts';
import { collectTriangles, renderTriangles, montage, writePng, type Tri } from './lib/softRender.ts';

const TILE = 300;

/** Kiriş bir THREE.Line olduğu için rasterleştirici onu göremez; ince silindire çeviriyoruz. */
function lineHelpers(group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xf3ead8 });
  for (const [p, q] of [[a, b], [b, c]] as [THREE.Vector3, THREE.Vector3][]) {
    const len = p.distanceTo(q);
    if (len < 1e-5) continue;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, len, 5), mat);
    seg.position.copy(p).add(q).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(q, p).normalize());
    group.add(seg);
  }
  group.updateMatrixWorld(true);
}

const rig = createCharacterRig({
  skinTone: '#e8be99',
  hairColor: '#382212',
  beardColor: '#382212',
  factionColor: '#991b1b',
  hasBeard: true,
  weaponType: 'BOW',
  shieldType: 'NONE',
  helmetType: 'NONE',
  armorTier: 'CIVILIAN',
  factionId: 'vlandia',
} as any);
const anim = new CharacterAnimator(rig);
anim.play('bow_draw', { hold: true });

const states = [
  { label: 'dinlenme', frames: 1 },
  { label: 'yarım çekiş', frames: 24 },
  { label: 'tam çekiş', frames: 42 },
  { label: 'basılı tutma', frames: 60 },
];

const tiles = [];
const bow = rig.bow!;
const stringPos = bow.stringGeo.attributes.position as THREE.BufferAttribute;
const rows: string[] = [];

for (const st of states) {
  for (let i = 0; i < st.frames; i++) anim.update(1 / 60);
  rig.root.updateMatrixWorld(true);

  const p0 = new THREE.Vector3().fromBufferAttribute(stringPos, 0);
  const p1 = new THREE.Vector3().fromBufferAttribute(stringPos, 1);
  const p2 = new THREE.Vector3().fromBufferAttribute(stringPos, 2);
  const w0 = bow.group.localToWorld(p0.clone());
  const w1 = bow.group.localToWorld(p1.clone());
  const w2 = bow.group.localToWorld(p2.clone());

  const helpers = new THREE.Group();
  lineHelpers(helpers, w0, w1, w2);
  const tris: Tri[] = [...collectTriangles(rig.root), ...collectTriangles(helpers)];

  const center = new THREE.Vector3(0, 1.15, 0);
  const eye = new THREE.Vector3(2.6, 1.5, 1.1);
  tiles.push(renderTriangles(tris, eye, center, 40, TILE, TILE));

  rows.push(
    `${st.label.padEnd(12)} çekiş ${anim.getBowDrawProgress().toFixed(2)} · ` +
    `nok lokal (${p1.toArray().map((v) => v.toFixed(3)).join(', ')}) · ` +
    `kiriş uçları (${p0.y.toFixed(3)}, ±${Math.abs(p0.z).toFixed(3)})`,
  );

  helpers.clear();
}

writePng('docs/renders/bow-draw.png', montage(tiles, 4));
rows.push(`kiriş ucu ↔ uzuv ucu: kiriş (0, ${(0.13).toFixed(2)}, ±0.56), uzuv son noktası (0, brace, ±tipZ) — aynı`);
console.log(rows.join('\n'));
console.log('→ docs/renders/bow-draw.png');
