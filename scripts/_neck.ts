import * as THREE from 'three';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { buildHeroRegistry } from '../src/game/heroes.ts';
import { createHeroPortraitRig } from '../src/game/portraitRenderer.ts';
const c = createInitialCampaignState('Komutan Demirhan','noble');
const fn = Object.fromEntries(Object.entries(FACTION_INFO).map(([id,i])=>[id,i.name]));
const heroes = Object.values(buildHeroRegistry(c, fn).heroes);
const vals: number[] = [];
for (const h of heroes) {
  const rig = createHeroPortraitRig(h);
  const headBox = new THREE.Box3().setFromObject(rig.head);
  const torsoMesh = rig.torso.children.find((ch) => (ch as THREE.Mesh).isMesh) as THREE.Mesh;
  const torsoTop = new THREE.Box3().setFromObject(torsoMesh).max.y;
  vals.push(headBox.min.y - torsoTop);
}
console.log('çene–omuz boşluğu', Math.min(...vals).toFixed(3), '..', Math.max(...vals).toFixed(3));
