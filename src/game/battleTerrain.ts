/**
 * battleTerrain.ts — 10.2/B1: arazi profilinden three.js sahne parçalarını kurar.
 *
 * `battlefield.ts` saf profili üretir; bu modül onu görselleştirir: köşe
 * renkli arazi, su düzlemi, taş köprü, köy evleri, instancing'li ağaç/kaya
 * serpmesi ve Bannerlord'un kırmızı yumuşak sınırı (soft border). Sınır,
 * araziyi izleyen yarı saydam kırmızı şerit duvar olarak çizilir — oyundaki
 * kırmızı sınır çizgisinin karşılığı.
 */
import * as THREE from 'three';
import {
  sampleBattleHeight,
  type BattlefieldProfile,
} from './battlefield.ts';

export interface BattleTerrainHandles {
  group: THREE.Group;
  dispose: () => void;
}

function buildTerrainMesh(profile: BattlefieldProfile): THREE.Mesh {
  const n = profile.gridN;
  const size = profile.halfExtent * 2;
  const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // PlaneGeometry köşeleri satır-major: önce +Z'den -Z'ye? rotateX sonrası
  // köşe (x, z) değerlerinden ızgara indeksini geri çıkarırız; varsayım yok.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ix = Math.round(((x + profile.halfExtent) / size) * (n - 1));
    const iz = Math.round(((z + profile.halfExtent) / size) * (n - 1));
    const gi = Math.max(0, Math.min(n - 1, iz)) * n + Math.max(0, Math.min(n - 1, ix));
    pos.setY(i, profile.heights[gi]);
    colors[i * 3] = profile.colors[gi * 3];
    colors[i * 3 + 1] = profile.colors[gi * 3 + 1];
    colors[i * 3 + 2] = profile.colors[gi * 3 + 2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.0,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildWater(profile: BattlefieldProfile): THREE.Mesh | null {
  if (profile.waterY === null) return null;
  const size = profile.halfExtent * 2;
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2e5d7c,
    transparent: true,
    opacity: 0.78,
    roughness: 0.25,
    metalness: 0.1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = profile.waterY;
  return mesh;
}

function buildBridge(profile: BattlefieldProfile): THREE.Group | null {
  const b = profile.bridge;
  if (!b) return null;
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({
    color: 0xa49b8e,
    roughness: 0.85,
    metalness: 0.05,
  });
  const deckLen = b.length;
  const dirX = Math.sin(b.angle);
  const dirZ = Math.cos(b.angle);
  const bank1 = sampleBattleHeight(profile, b.x - dirX * deckLen * 0.5, b.z - dirZ * deckLen * 0.5);
  const bank2 = sampleBattleHeight(profile, b.x + dirX * deckLen * 0.5, b.z + dirZ * deckLen * 0.5);
  const deckY = Math.max(bank1, bank2) + 0.55;

  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, deckLen), stone);
  deck.position.y = 0;
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, deckLen * 0.96), stone);
    wall.position.set(side * 1.95, 0.6, 0);
    wall.castShadow = true;
    group.add(wall);
  }
  for (const t of [-0.3, 0, 0.3]) {
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.25, 7, 8), stone);
    pier.position.set(0, -3.4, t * deckLen);
    group.add(pier);
  }
  group.position.set(b.x, deckY, b.z);
  group.rotation.y = b.angle;
  return group;
}

function buildHouses(profile: BattlefieldProfile): THREE.Group | null {
  if (!profile.village) return null;
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xb8a58c, roughness: 0.92 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2e, roughness: 0.9 });
  for (const house of profile.village.houses) {
    const y = sampleBattleHeight(profile, house.x, house.z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(house.w, house.h, house.d), wallMat);
    base.position.set(house.x, y + house.h / 2 - 0.15, house.z);
    base.rotation.y = house.rot;
    base.castShadow = true;
    base.receiveShadow = true;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(house.w, house.d) * 0.78, house.h * 0.62, 4),
      roofMat,
    );
    roof.position.set(house.x, y + house.h + house.h * 0.3 - 0.15, house.z);
    roof.rotation.y = house.rot + Math.PI / 4;
    roof.castShadow = true;
    group.add(base, roof);
  }
  return group;
}

function buildScatter(profile: BattlefieldProfile): THREE.Group {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  if (profile.trees.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6);
    trunkGeo.translate(0, 1.3, 0);
    const canopyGeo = new THREE.ConeGeometry(1.7, 4.6, 7);
    canopyGeo.translate(0, 4.9, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4230, roughness: 0.95 });
    const leafColor =
      profile.biome === 'NORTH_SNOW_PEAKS'
        ? 0xcfdde8
        : profile.biome === 'SOUTH_DESERT'
          ? 0x6f7d3a
          : 0x3f6030;
    const canopyMat = new THREE.MeshStandardMaterial({
      color: leafColor,
      roughness: 0.92,
      flatShading: true,
    });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, profile.trees.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, profile.trees.length);
    profile.trees.forEach((t, i) => {
      const y = sampleBattleHeight(profile, t.x, t.z);
      dummy.position.set(t.x, y - 0.15, t.z);
      dummy.rotation.set(0, t.rot, 0);
      dummy.scale.setScalar(t.scale * 1.6);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      canopies.setMatrixAt(i, dummy.matrix);
    });
    trunks.castShadow = true;
    canopies.castShadow = true;
    group.add(trunks, canopies);
  }

  if (profile.rocks.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: profile.biome === 'SOUTH_DESERT' ? 0xb08d5f : 0x8a8a90,
      roughness: 0.98,
      flatShading: true,
    });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, profile.rocks.length);
    profile.rocks.forEach((r, i) => {
      const y = sampleBattleHeight(profile, r.x, r.z);
      dummy.position.set(r.x, y + r.scale * 0.15, r.z);
      dummy.rotation.set(r.rot * 0.4, r.rot, r.rot * 0.7);
      dummy.scale.set(r.scale * 1.3, r.scale * 0.85, r.scale * 1.1);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    });
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    group.add(rocks);
  }
  return group;
}

/**
 * Çim/calı tutamları: yakın çekimde çıplak zemin yerine bitki örtüsü hissi.
 * İki çapraz üçgen şerit tek InstancedMesh'te; konumlar profil tohumu ile
 * deterministik serpilir, su üstü ve dik yamaçlar elenir. Renk biyomdan.
 */
function buildGroundCover(profile: BattlefieldProfile): THREE.InstancedMesh | null {
  if (profile.biome === 'NORTH_SNOW_PEAKS') return null; // kar altında tutam yok
  const COUNT = 700;
  // Çift çapraz şerit geometrisi (X biçiminde iki üçgen çift).
  const positions: number[] = [];
  const pushQuad = (angle: number) => {
    const dx = Math.cos(angle) * 0.34;
    const dz = Math.sin(angle) * 0.34;
    const tx = dx * 0.22; // üst kenar daralır: ot tutamı silueti, kart değil
    const tz = dz * 0.22;
    positions.push(-dx, 0, -dz, dx, 0, dz, tx, 0.62, tz, -dx, 0, -dz, tx, 0.62, tz, -tx, 0.62, -tz);
  };
  pushQuad(0);
  pushQuad(Math.PI / 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const color = profile.biome === 'SOUTH_DESERT' ? 0xa89a55 : 0x6f8f44;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const dummy = new THREE.Object3D();
  // Deterministik serpme (profil her seferinde aynı düzeni verir).
  let state = 2166136261;
  const nextRand = () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
  let placed = 0;
  for (let i = 0; i < COUNT * 3 && placed < COUNT; i++) {
    const x = (nextRand() * 2 - 1) * profile.halfExtent * 0.97;
    const z = (nextRand() * 2 - 1) * profile.halfExtent * 0.97;
    const y = sampleBattleHeight(profile, x, z);
    if (profile.waterY !== null && y < profile.waterY + 0.1) continue;
    const slope = Math.abs(sampleBattleHeight(profile, x + 1.5, z) - y);
    if (slope > 0.9) continue;
    dummy.position.set(x, y - 0.05, z);
    dummy.rotation.set(0, nextRand() * Math.PI, 0);
    dummy.scale.setScalar(0.5 + nextRand() * 0.55);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.receiveShadow = true;
  return mesh;
}

/** Kırmızı yumuşak sınır: kenarlarda araziyi izleyen yarı saydam kırmızı şeritler. */
function buildBorder(profile: BattlefieldProfile): THREE.Group {
  const group = new THREE.Group();
  const half = profile.halfExtent;
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const segments = 56;
  const edges: Array<(t: number) => { x: number; z: number }> = [
    (t) => ({ x: -half + t * half * 2, z: -half }),
    (t) => ({ x: half, z: -half + t * half * 2 }),
    (t) => ({ x: half - t * half * 2, z: half }),
    (t) => ({ x: -half, z: half - t * half * 2 }),
  ];
  for (const edge of edges) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const p = edge(i / segments);
      const y = sampleBattleHeight(profile, p.x, p.z);
      positions.push(p.x, y - 0.4, p.z, p.x, y + 2.1, p.z);
      if (i < segments) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    const strip = new THREE.Mesh(geo, mat);
    strip.renderOrder = 5;
    group.add(strip);
  }
  return group;
}

/** Arazi profilinden eksiksiz sahne grubu kurar. */
export function createBattleTerrain(profile: BattlefieldProfile): BattleTerrainHandles {
  const group = new THREE.Group();
  group.add(buildTerrainMesh(profile));
  const water = buildWater(profile);
  if (water) group.add(water);
  const bridge = buildBridge(profile);
  if (bridge) group.add(bridge);
  const houses = buildHouses(profile);
  if (houses) group.add(houses);
  group.add(buildScatter(profile));
  const cover = buildGroundCover(profile);
  if (cover) group.add(cover);
  group.add(buildBorder(profile));

  const dispose = () => {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  };
  return { group, dispose };
}
