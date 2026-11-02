import * as THREE from 'three';
import type { SiegeEngineType } from './rules';
import type { MapBattleEvent } from './mapBattle';
import { groundHeightAt } from './mapGen';

export interface SiegeMapMarker {
  element: HTMLDivElement;
  fill: HTMLDivElement | null;
  x: number;
  y: number;
  z: number;
}

export function createSiegeMapMarker(
  glyph: string,
  kind: 'engine' | 'wall',
): SiegeMapMarker {
  const element = document.createElement('div');
  element.dataset.role = kind === 'wall' ? 'siege-wall-health' : 'siege-engine-marker';
  element.style.position = 'absolute';
  element.style.top = '0';
  element.style.left = '0';
  element.style.display = 'none';
  element.style.pointerEvents = 'none';
  element.style.alignItems = 'center';
  element.style.gap = '3px';
  element.style.padding = '1px 4px';
  element.style.borderRadius = '3px';
  element.style.background = 'rgba(18, 14, 10, 0.88)';
  element.style.border =
    kind === 'wall'
      ? '1px solid rgba(250, 204, 21, 0.65)'
      : '1px solid rgba(96, 165, 250, 0.72)';
  element.style.color = kind === 'wall' ? '#fde68a' : '#bfdbfe';
  element.style.fontSize = '9px';
  element.style.fontWeight = '700';

  const icon = document.createElement('span');
  icon.textContent = glyph;
  element.appendChild(icon);

  let fill: HTMLDivElement | null = null;
  const bar = document.createElement('div');
  bar.style.width = kind === 'wall' ? '22px' : '16px';
  bar.style.height = '3px';
  bar.style.borderRadius = '999px';
  bar.style.background = 'rgba(0, 0, 0, 0.65)';
  bar.style.overflow = 'hidden';

  fill = document.createElement('div');
  fill.style.width = '100%';
  fill.style.height = '100%';
  fill.style.backgroundColor = '#4ade80';
  bar.appendChild(fill);
  element.appendChild(bar);

  return { element, fill, x: 0, y: 0, z: 0 };
}

export function hideSiegeMapMarkers(markers: readonly SiegeMapMarker[]): void {
  markers.forEach(({ element }) => {
    element.style.display = 'none';
  });
}

export interface BattleMapMarker {
  element: HTMLDivElement;
  battleId: string;
  x: number;
  y: number;
  z: number;
  lastHtml?: string;
}

export function createBattleMapMarker(
  battle: MapBattleEvent,
  onClick: (battle: MapBattleEvent) => void,
): BattleMapMarker {
  const element = document.createElement('div');
  element.dataset.role = 'map-battle-marker';
  element.style.position = 'absolute';
  element.style.top = '0';
  element.style.left = '0';
  element.style.transform = 'translate(-50%, -100%)';
  element.style.cursor = 'pointer';
  element.style.pointerEvents = 'auto';
  element.style.display = 'none';
  element.style.userSelect = 'none';
  element.style.transition = 'transform 0.15s ease, filter 0.15s ease';
  element.title = `⚔️ ${battle.attackerName} vs ${battle.defenderName} Meydan Muharebesi (Müdahale Etmek İçin Tıkla)`;

  element.onmouseenter = () => {
    element.style.transform = 'translate(-50%, -106%) scale(1.05)';
    element.style.filter = 'brightness(1.18)';
  };
  element.onmouseleave = () => {
    element.style.transform = 'translate(-50%, -100%) scale(1)';
    element.style.filter = 'brightness(1)';
  };

  element.onclick = (e) => {
    e.stopPropagation();
    onClick(battle);
  };

  return {
    element,
    battleId: battle.id,
    x: battle.x,
    y: groundHeightAt(battle.x, battle.z) + 3.4,
    z: battle.z,
  };
}

export function addCampBox(
  parent: THREE.Object3D,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

export function addCampBeam(
  parent: THREE.Object3D,
  from: [number, number, number],
  to: [number, number, number],
  thickness: number,
  material: THREE.Material,
): THREE.Mesh {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const delta = end.clone().sub(start);
  const length = Math.max(0.001, delta.length());
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(thickness, length, thickness),
    material,
  );
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  parent.add(mesh);
  return mesh;
}

export function addCampDisc(
  parent: THREE.Object3D,
  position: [number, number, number],
  radius: number,
  width: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 10),
    material,
  );
  mesh.position.set(...position);
  mesh.rotation.z = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

export function createCampaignSiegeEngineModel(engine: SiegeEngineType): THREE.Group {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7c532e, roughness: 1 });
  const woodLight = new THREE.MeshStandardMaterial({ color: 0xb78952, roughness: 1 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x452d19, roughness: 1 });
  const iron = new THREE.MeshStandardMaterial({
    color: 0x565d66,
    roughness: 0.72,
    metalness: 0.45,
  });
  const rope = new THREE.MeshStandardMaterial({ color: 0xd0ba8a, roughness: 1 });
  const hide = new THREE.MeshStandardMaterial({ color: 0x6c4a2b, roughness: 1 });

  if (engine === 'TREBUCHET') {
    for (const x of [-0.62, 0.62]) {
      addCampBox(group, [x, 0.14, 0], [0.18, 0.18, 2.35], woodDark);
      addCampBeam(group, [x, 0.18, -0.78], [x * 0.78, 1.85, 0], 0.15, wood);
      addCampBeam(group, [x, 0.18, 0.78], [x * 0.78, 1.85, 0], 0.15, wood);
    }
    addCampBox(group, [0, 0.14, -0.92], [1.38, 0.16, 0.18], woodDark);
    addCampBox(group, [0, 0.14, 0.92], [1.38, 0.16, 0.18], woodDark);
    addCampBox(group, [0, 1.78, 0], [1.16, 0.16, 0.18], iron);
    addCampBeam(group, [0, 1.38, -0.58], [0, 2.48, 1.18], 0.14, woodLight);
    addCampBeam(group, [0, 1.4, -0.52], [0, 0.85, -0.52], 0.08, rope);
    addCampBox(group, [0, 0.62, -0.52], [0.5, 0.46, 0.44], woodDark);
    addCampBox(group, [0, 0.62, -0.52], [0.54, 0.1, 0.48], iron);
    addCampBeam(group, [0, 2.45, 1.14], [0, 1.55, 1.35], 0.05, rope);
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), iron);
    stone.position.set(0, 0.22, 1.12);
    group.add(stone);
  } else if (engine === 'MANGONEL') {
    for (const x of [-0.56, 0.56]) {
      addCampBox(group, [x, 0.2, 0], [0.18, 0.2, 1.85], woodDark);
      addCampBox(group, [x, 0.68, -0.1], [0.16, 0.82, 0.18], wood);
      for (const z of [-0.62, 0.62]) {
        addCampDisc(group, [x + (x < 0 ? -0.1 : 0.1), 0.26, z], 0.26, 0.11, woodDark);
      }
    }
    addCampBox(group, [0, 0.2, -0.74], [1.26, 0.16, 0.18], woodDark);
    addCampBox(group, [0, 0.2, 0.74], [1.26, 0.16, 0.18], woodDark);
    addCampBox(group, [0, 0.98, -0.1], [1.28, 0.2, 0.22], woodLight);
    addCampBox(group, [0, 0.45, 0.15], [1.14, 0.18, 0.2], rope);
    addCampBeam(group, [0, 0.48, 0.14], [0, 1.56, -0.62], 0.13, woodLight);
    addCampBox(group, [0, 1.62, -0.68], [0.34, 0.12, 0.34], iron);
  } else if (engine === 'BALLISTA') {
    addCampBeam(group, [0, 0.82, 0], [-0.58, 0.1, -0.55], 0.12, woodDark);
    addCampBeam(group, [0, 0.82, 0], [0.58, 0.1, -0.55], 0.12, woodDark);
    addCampBeam(group, [0, 0.82, 0], [0, 0.1, 0.68], 0.12, woodDark);
    addCampBox(group, [0, 0.9, 0.08], [0.22, 0.16, 1.65], wood);
    addCampBox(group, [0, 0.98, 0.42], [1.55, 0.12, 0.16], woodLight);
    addCampBeam(group, [-0.74, 0.98, 0.4], [0, 0.98, -0.45], 0.04, rope);
    addCampBeam(group, [0.74, 0.98, 0.4], [0, 0.98, -0.45], 0.04, rope);
    addCampBox(group, [0, 1.0, 0.18], [0.06, 0.06, 1.05], iron);
  } else if (engine === 'BATTERING_RAM') {
    for (const x of [-0.72, 0.72]) {
      addCampBox(group, [x, 0.26, 0], [0.18, 0.18, 2.35], woodDark);
      for (const z of [-0.74, 0.74]) {
        addCampDisc(group, [x + (x < 0 ? -0.1 : 0.1), 0.32, z], 0.32, 0.14, woodDark);
        addCampBeam(group, [x, 0.32, z], [0, 1.58, z], 0.14, wood);
      }
    }
    addCampBeam(group, [-0.68, 1.05, 0], [0, 1.72, 0], 0.14, wood);
    addCampBeam(group, [0.68, 1.05, 0], [0, 1.72, 0], 0.14, wood);
    addCampBox(group, [-0.38, 1.38, 0], [0.92, 0.12, 2.42], hide, [0, 0, 0.58]);
    addCampBox(group, [0.38, 1.38, 0], [0.92, 0.12, 2.42], hide, [0, 0, -0.58]);
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 2.55, 8),
      woodLight,
    );
    log.position.set(0, 0.78, 0.12);
    log.rotation.x = Math.PI / 2;
    group.add(log);
    const ramHead = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.42, 7), iron);
    ramHead.position.set(0, 0.78, 1.48);
    ramHead.rotation.x = Math.PI / 2;
    group.add(ramHead);
  } else {
    for (const x of [-0.72, 0.72]) {
      for (const z of [-0.66, 0.66]) {
        addCampDisc(group, [x + (x < 0 ? -0.1 : 0.1), 0.34, z], 0.34, 0.14, woodDark);
        addCampBox(group, [x * 0.85, 1.78, z * 0.85], [0.16, 2.85, 0.16], woodDark);
      }
    }
    addCampBox(group, [0, 0.85, 0], [1.32, 0.95, 1.24], wood);
    addCampBox(group, [0, 1.82, -0.04], [1.18, 0.95, 1.12], woodLight);
    addCampBox(group, [0, 2.68, -0.08], [1.06, 0.78, 1.0], hide);
    addCampBox(group, [0, 3.16, -0.08], [1.16, 0.2, 1.08], woodDark);
    addCampBox(group, [0, 2.42, 0.56], [0.96, 1.1, 0.12], woodLight, [-0.36, 0, 0]);
  }

  group.traverse((object) => {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  return group;
}

export const SIEGE_SLOT_SPECS = [
  { offset: -0.45, radius: 13.0 },
  { offset: -0.15, radius: 13.0 },
  { offset: 0.15, radius: 13.0 },
  { offset: 0.45, radius: 13.0 },
  { offset: 0, radius: 10.6 },
  { offset: -0.3, radius: 11.2 },
  { offset: 0.3, radius: 11.2 },
] as const;

export function siegeEngineSlots(
  engines: readonly SiegeEngineType[] = [],
): Array<SiegeEngineType | null> {
  const ranged = engines
    .filter((engine) => engine !== 'BATTERING_RAM' && engine !== 'SIEGE_TOWER')
    .slice(0, 4);
  const ram = engines.find((engine) => engine === 'BATTERING_RAM') ?? null;
  const towers = engines.filter((engine) => engine === 'SIEGE_TOWER').slice(0, 2);
  return [
    ranged[0] ?? null,
    ranged[1] ?? null,
    ranged[2] ?? null,
    ranged[3] ?? null,
    ram,
    towers[0] ?? null,
    towers[1] ?? null,
  ];
}

export function createSiegeEngineGroup(
  engines: readonly SiegeEngineType[],
  facingAngle: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'siegeEngines';
  const slots = siegeEngineSlots(engines);
  slots.forEach((engine, index) => {
    if (!engine) return;
    const { offset, radius } = SIEGE_SLOT_SPECS[index];
    const angle = facingAngle + offset;
    const model = createCampaignSiegeEngineModel(engine);
    model.position.set(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius);
    model.rotation.y = -angle - Math.PI / 2;
    model.scale.setScalar(0.92);
    model.updateMatrix();
    model.matrixAutoUpdate = false;
    group.add(model);
  });
  group.updateMatrix();
  group.matrixAutoUpdate = false;
  return group;
}

export function disposeSiegeEngineModel(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => materials.add(material));
    } else if (object.material) {
      materials.add(object.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export type CampInstanceTransform = {
  x: number;
  y: number;
  z: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
};

export function addStaticCampInstances(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly CampInstanceTransform[],
): THREE.InstancedMesh {
  const instanced = new THREE.InstancedMesh(geometry, material, transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach((item, index) => {
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(
      item.rotationX ?? 0,
      item.rotationY ?? 0,
      item.rotationZ ?? 0,
    );
    dummy.scale.set(
      item.scaleX ?? item.scale ?? 1,
      item.scaleY ?? item.scale ?? 1,
      item.scaleZ ?? item.scale ?? 1,
    );
    dummy.updateMatrix();
    instanced.setMatrixAt(index, dummy.matrix);
  });
  instanced.instanceMatrix.needsUpdate = true;
  instanced.matrixAutoUpdate = false;
  instanced.updateMatrix();
  instanced.computeBoundingSphere();
  instanced.frustumCulled = false;
  parent.add(instanced);
  return instanced;
}

export function addStaticSiegeCampVisuals(
  group: THREE.Group,
  facingAngle: number,
  factionColor: number,
): void {
  const dummy = new THREE.Object3D();
  const ringSegments: CampInstanceTransform[] = [];
  for (let index = 0; index < 8; index++) {
    const angle = facingAngle - 0.65 + (index / 7) * 1.3;
    ringSegments.push({
      x: Math.cos(angle) * 15,
      y: 0.14,
      z: Math.sin(angle) * 15,
      rotationY: -angle - Math.PI / 2,
    });
  }
  addStaticCampInstances(
    group,
    new THREE.BoxGeometry(2.35, 0.08, 0.24),
    new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.9,
    }),
    ringSegments,
  );

  const tentBodyGeometry = new THREE.CylinderGeometry(0.18, 1.85, 2.25, 4);
  tentBodyGeometry.rotateY(Math.PI / 4);
  const tentRoofGeometry = new THREE.ConeGeometry(2.05, 1.32, 4);
  tentRoofGeometry.rotateY(Math.PI / 4);
  const tentDoorGeometry = new THREE.BoxGeometry(0.55, 1.05, 0.12);
  const tentBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8c39a,
    roughness: 0.92,
  });
  const tentRoofMaterial = new THREE.MeshStandardMaterial({
    color: factionColor,
    roughness: 0.86,
  });
  const tentDoorMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a140d,
    roughness: 1,
  });
  const stakeMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f4a28,
    roughness: 0.95,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b3119,
    roughness: 0.96,
  });

  const tentSpecs = [
    { offset: 0, radius: 22.2, scale: 1.5 },
    { offset: -0.68, radius: 19.6, scale: 1.08 },
    { offset: -0.34, radius: 18.8, scale: 1.05 },
    { offset: 0.34, radius: 18.8, scale: 1.05 },
    { offset: 0.68, radius: 19.6, scale: 1.08 },
    { offset: -0.45, radius: 24.4, scale: 0.96 },
    { offset: 0.45, radius: 24.4, scale: 0.96 },
  ];
  addStaticCampInstances(
    group,
    tentBodyGeometry,
    tentBodyMaterial,
    tentSpecs.map(({ offset, radius, scale }) => {
      const angle = facingAngle + offset;
      return {
        x: Math.cos(angle) * radius,
        y: 1.12 * scale,
        z: Math.sin(angle) * radius,
        rotationY: -angle - Math.PI / 2,
        scale,
      };
    }),
  );
  addStaticCampInstances(
    group,
    tentRoofGeometry,
    tentRoofMaterial,
    tentSpecs.map(({ offset, radius, scale }) => {
      const angle = facingAngle + offset;
      return {
        x: Math.cos(angle) * radius,
        y: 2.55 * scale,
        z: Math.sin(angle) * radius,
        rotationY: -angle - Math.PI / 2,
        scale,
      };
    }),
  );
  addStaticCampInstances(
    group,
    tentDoorGeometry,
    tentDoorMaterial,
    tentSpecs.map(({ offset, radius, scale }) => {
      const angle = facingAngle + offset;
      const forward = 1.24 * scale;
      return {
        x: Math.cos(angle) * (radius - forward),
        y: 0.56 * scale,
        z: Math.sin(angle) * (radius - forward),
        rotationY: -angle - Math.PI / 2,
        scale,
      };
    }),
  );

  const stakeTransforms: CampInstanceTransform[] = [];
  const railTransforms: CampInstanceTransform[] = [];
  const fenceRadius = 16.5;
  const fenceSegmentOffsets = [-0.5, 0, 0.5];
  const stakeLean = (25 * Math.PI) / 180;
  fenceSegmentOffsets.forEach((offset) => {
    const angle = facingAngle + offset;
    const tangentX = -Math.sin(angle);
    const tangentZ = Math.cos(angle);
    for (let index = 0; index < 6; index++) {
      const tangent = -2.65 + index * 1.06;
      const radialX = Math.cos(angle);
      const radialZ = Math.sin(angle);
      stakeTransforms.push({
        x: radialX * fenceRadius + tangentX * tangent,
        y: 1.12,
        z: radialZ * fenceRadius + tangentZ * tangent,
        rotationX: Math.asin(-Math.sin(angle) * Math.sin(stakeLean)),
        rotationZ: Math.atan2(
          Math.cos(angle) * Math.sin(stakeLean),
          Math.cos(stakeLean),
        ),
      });
    }
    railTransforms.push({
      x: Math.cos(angle) * fenceRadius,
      y: 0.68,
      z: Math.sin(angle) * fenceRadius,
      rotationY: -angle - Math.PI / 2,
    });
  });
  addStaticCampInstances(
    group,
    new THREE.ConeGeometry(0.17, 2.2, 5),
    stakeMaterial,
    stakeTransforms,
  );
  addStaticCampInstances(
    group,
    new THREE.BoxGeometry(5.5, 0.14, 0.14),
    railMaterial,
    railTransforms,
  );

  const slotFrameMaterial = new THREE.MeshBasicMaterial({
    color: 0x60a5fa,
    transparent: true,
    opacity: 0.97,
  });
  const slotFrameGroups: THREE.Group[] = [];
  SIEGE_SLOT_SPECS.forEach(({ offset, radius }, slotIndex) => {
    const angle = facingAngle + offset;
    const frame = new THREE.Group();
    frame.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    frame.rotation.y = -angle - Math.PI / 2;
    frame.userData.siegeSlotIndex = slotIndex;
    const halfWidth = 1.12;
    const halfDepth = 1.05;
    const addEdge = (position: [number, number, number], size: [number, number, number]) => {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(...size), slotFrameMaterial);
      edge.position.set(...position);
      edge.updateMatrix();
      edge.matrixAutoUpdate = false;
      edge.renderOrder = 2;
      frame.add(edge);
    };
    addEdge([0, 0.16, -halfDepth], [halfWidth * 2 + 0.12, 0.08, 0.12]);
    addEdge([0, 0.16, halfDepth], [halfWidth * 2 + 0.12, 0.08, 0.12]);
    addEdge([-halfWidth, 0.16, 0], [0.12, 0.08, halfDepth * 2 + 0.12]);
    addEdge([halfWidth, 0.16, 0], [0.12, 0.08, halfDepth * 2 + 0.12]);
    const arrowGeometry = new THREE.BufferGeometry();
    arrowGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 0.21, halfDepth + 0.48,
        -0.38, 0.21, -halfDepth + 0.02,
        0.38, 0.21, -halfDepth + 0.02,
      ], 3),
    );
    arrowGeometry.computeVertexNormals();
    const arrow = new THREE.Mesh(
      arrowGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.97,
        side: THREE.DoubleSide,
      }),
    );
    arrow.renderOrder = 2;
    arrow.updateMatrix();
    arrow.matrixAutoUpdate = false;
    frame.add(arrow);
    frame.updateMatrix();
    frame.matrixAutoUpdate = false;
    group.add(frame);
    slotFrameGroups.push(frame);
  });
  group.userData.siegeSlotFrames = slotFrameGroups;

  const campfirePositions = [-0.46, 0.46].map((offset) => {
    const angle = facingAngle + offset;
    return { x: Math.cos(angle) * 19.8, z: Math.sin(angle) * 19.8 };
  });
  const fireLogs: CampInstanceTransform[] = [];
  campfirePositions.forEach(({ x, z }) => {
    for (const angle of [-Math.PI / 4, Math.PI / 4, Math.PI / 2]) {
      fireLogs.push({
        x,
        y: 0.26,
        z,
        rotationZ: Math.PI / 2,
        rotationY: angle,
      });
    }
  });
  addStaticCampInstances(
    group,
    new THREE.CylinderGeometry(0.2, 0.23, 1.55, 7),
    new THREE.MeshStandardMaterial({ color: 0x49351f, roughness: 1 }),
    fireLogs,
  );
  const flameLayers = [
    { radius: 0.82, height: 1.85, centerY: 0.98, color: 0xf05c17, emissive: 0xe94208, intensity: 2.2 },
    { radius: 0.6, height: 1.52, centerY: 0.88, color: 0xff992f, emissive: 0xff6a08, intensity: 2.8 },
    { radius: 0.34, height: 1.12, centerY: 0.76, color: 0xffd965, emissive: 0xffa900, intensity: 3.1 },
  ];
  flameLayers.forEach(({ radius, height, centerY, color, emissive, intensity }) => {
    const flames = new THREE.InstancedMesh(
      new THREE.ConeGeometry(radius, height, 6),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: intensity,
        roughness: 1,
        toneMapped: false,
      }),
      campfirePositions.length,
    );
    campfirePositions.forEach(({ x, z }, index) => {
      dummy.position.set(x, centerY, z);
      dummy.rotation.set(0, index * 0.35, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      flames.setMatrixAt(index, dummy.matrix);
    });
    flames.instanceMatrix.needsUpdate = true;
    flames.matrixAutoUpdate = false;
    flames.updateMatrix();
    flames.computeBoundingSphere();
    flames.frustumCulled = false;
    group.add(flames);
  });
  const smokeMaterial = new THREE.MeshBasicMaterial({
    color: 0xaaa69c,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  let smokeIndex = 0;
  campfirePositions.forEach(({ x, z }, fireIndex) => {
    for (let puff = 0; puff < 3; puff++) {
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.34 + puff * 0.06, 6, 5), smokeMaterial);
      smoke.position.set(
        x + (puff % 2 === 0 ? -0.12 : 0.12),
        2.15 + puff * 0.58,
        z + (fireIndex === 0 ? 0.08 : -0.08),
      );
      smoke.userData.baseY = 2.15 + puff * 0.58;
      smoke.userData.siegeSmoke = true;
      smoke.userData.smokeIndex = smokeIndex++;
      group.add(smoke);
    }
  });

  const bannerPoleMaterial = new THREE.MeshStandardMaterial({ color: 0x49351f, roughness: 1 });
  const bannerMaterial = new THREE.MeshStandardMaterial({
    color: factionColor,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  [-0.31, 0.31].forEach((offset, index) => {
    const angle = facingAngle + offset;
    const x = Math.cos(angle) * 20.3;
    const z = Math.sin(angle) * 20.3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.8, 6), bannerPoleMaterial);
    pole.position.set(x, 1.9, z);
    pole.matrixAutoUpdate = false;
    pole.updateMatrix();
    group.add(pole);
    const clothGeometry = new THREE.BufferGeometry();
    const wave = index === 0 ? 0 : 0.12;
    clothGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 0, 0, 1.05, 0, wave,
        0.96, -0.78, wave, 0.22, -0.66, 0,
      ], 3),
    );
    clothGeometry.setIndex([0, 1, 2, 0, 2, 3]);
    clothGeometry.computeVertexNormals();
    const cloth = new THREE.Mesh(clothGeometry, bannerMaterial);
    cloth.position.set(x + 0.06, 3.35, z);
    cloth.matrixAutoUpdate = false;
    cloth.updateMatrix();
    group.add(cloth);
  });

  const propAngle = facingAngle + 0.17;
  const propX = Math.cos(propAngle) * 19.2;
  const propZ = Math.sin(propAngle) * 19.2;
  addStaticCampInstances(
    group,
    new THREE.BoxGeometry(0.78, 0.72, 0.72),
    new THREE.MeshStandardMaterial({ color: 0x765032, roughness: 1 }),
    [-1, 0, 1].map((index) => ({
      x: propX - Math.sin(propAngle) * (index * 1.35 + 2.8),
      y: 0.38,
      z: propZ + Math.cos(propAngle) * (index * 1.35 + 2.8),
      rotationY: index * 0.22,
    })),
  );
  addStaticCampInstances(
    group,
    new THREE.CylinderGeometry(0.34, 0.38, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x68462e, roughness: 1 }),
    [-1, 0, 1].map((index) => ({
      x: propX + Math.sin(propAngle) * (index * 1.15 + 2.2),
      y: 0.42,
      z: propZ - Math.cos(propAngle) * (index * 1.15 + 2.2),
      rotationY: index * 0.22,
    })),
  );

  const cartX = Math.cos(facingAngle) * 21.3 - Math.sin(facingAngle) * 3.5;
  const cartZ = Math.sin(facingAngle) * 21.3 + Math.cos(facingAngle) * 3.5;
  const cartWood = new THREE.MeshStandardMaterial({ color: 0x805631, roughness: 1 });
  const cartWoodLight = new THREE.MeshStandardMaterial({ color: 0xb48754, roughness: 1 });
  const cartWoodDark = new THREE.MeshStandardMaterial({ color: 0x49321f, roughness: 1 });
  const cart = new THREE.Group();
  cart.position.set(cartX, 0, cartZ);
  cart.rotation.y = -facingAngle - Math.PI / 2;
  addCampBox(cart, [0, 0.76, 0], [1.7, 0.18, 1.05], cartWoodDark);
  for (const z of [-0.46, -0.16, 0.16, 0.46]) {
    addCampBox(cart, [0, 1.08, z], [1.7, 0.52, 0.08], cartWoodLight);
  }
  for (const side of [-1, 1]) {
    const wheelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.14, 8), cartWoodDark);
    wheelMesh.position.set(side * 0.95, 0.48, 0);
    wheelMesh.rotation.z = Math.PI / 2;
    cart.add(wheelMesh);
    addCampBeam(cart, [side * 0.7, 0.7, 0.36], [side * 1.35, 0.45, 1.25], 0.09, cartWood);
  }
  cart.traverse((object) => {
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  cart.updateMatrix();
  cart.matrixAutoUpdate = false;
  group.add(cart);
}
