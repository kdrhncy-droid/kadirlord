/** Yay çekişinde kafa/el/ok/kiriş yakın planı. */
import * as THREE from 'three';
import { createCharacterRig } from '../src/game/characterRig.ts';
import { CharacterAnimator } from '../src/game/characterAnimator.ts';
import { collectTriangles, renderTriangles, montage, writePng, type Tri } from './lib/softRender.ts';

const TILE = 320;
function helpers(g: THREE.Group, pts: THREE.Vector3[]) {
  g.clear();
  const mat = new THREE.MeshBasicMaterial({ color: 0xf3ead8 });
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1];
    const len = p.distanceTo(q);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, len, 5), mat);
    seg.position.copy(p).add(q).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(q, p).normalize());
    g.add(seg);
  }
  g.updateMatrixWorld(true);
}

const rig = createCharacterRig({ skinTone: '#e8be99', hairColor: '#382212', beardColor: '#382212', factionColor: '#991b1b', hasBeard: true, weaponType: 'BOW', shieldType: 'NONE', helmetType: 'NONE', armorTier: 'CIVILIAN', factionId: 'vlandia' } as any);
const anim = new CharacterAnimator(rig);
anim.play('bow_draw', { hold: true });
for (let i = 0; i < 60; i++) anim.update(1 / 60);
rig.root.updateMatrixWorld(true);

const bow = rig.bow!;
const sp = bow.stringGeo.attributes.position as THREE.BufferAttribute;
const pts = [0, 1, 2].map((i) => bow.group.localToWorld(new THREE.Vector3().fromBufferAttribute(sp, i)));
const h = new THREE.Group(); helpers(h, pts);

const head = new THREE.Vector3(); rig.head.getWorldPosition(head);
const tris: Tri[] = [...collectTriangles(rig.root), ...collectTriangles(h)];
const angles = [0, 40, 90, 140, 210, 300];
const tiles = angles.map((deg) => {
  const a = (deg * Math.PI) / 180;
  const eye = new THREE.Vector3(head.x + Math.sin(a) * 0.85, head.y + 0.05, head.z + Math.cos(a) * 0.85);
  return renderTriangles(tris, eye, new THREE.Vector3(head.x, head.y - 0.02, head.z + 0.25), 40, TILE, TILE);
});
writePng('docs/renders/bow-draw-closeup.png', montage(tiles, 3));
console.log('→ docs/renders/bow-draw-closeup.png');
