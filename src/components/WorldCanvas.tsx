import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CampaignState,
  FACTION_INFO,
  LordAgent,
  Settlement,
  SiegeEngineType,
  getSettlementArrivalRadius,
  factionHasHorseArchers,
  getTotalTroops,
  getVillagePrimaryProduction,
  getWallSections,
} from '../game/rules';
import {
  besiegedSettlementIdSet,
  getSiegeCampPoint,
  getSiegeCampSlotPoint,
} from '../game/siegeEncounter';
import { getPlayerArmy } from '../game/armySystem';
import { getLordPartyStrength } from '../game/encounter';
import {
  CONTINENTAL_LANDMARKS,
  MAP_HEIGHT,
  MAP_WIDTH,
  OVERWORLD_BASE_MARCH_SPEED,
  OVERWORLD_LORD_PATROL_SPEED,
  clampCameraFocus,
  computeBannerlordCameraTransform,
  computeZoomStep,
  getPartySpeedInfo,
  groundHeightAt,
  isSettlementLabelVisible,
} from '../game/mapGen';
import {
  computeLandPath,
  snapToNearestLand,
  stepAlongLandOnly,
} from '../game/navigation';
import {
  type LordLiveRouteState,
  applyLordOrderToRoute,
  applyTacticalPlayerReactionToRoute,
  calculateBannerlordPartySpeed,
  computePlayerSpottingRange,
  getLordDetailedIntel,
  isWithinSpottingRange,
  stepLordCampaignRoute,
} from '../game/campaignSystem';
import { getPlayerCulture } from '../game/cultureBonuses';
import {
  ENCOUNTER_COOLDOWN_SEC,
  type EncounterScenario,
  INTERCEPT_RADIUS,
  classifyEncounterScenario,
  getPlayerPartyStrength,
  isHostileToPlayer,
} from '../game/encounter';
import type {
  BattleTelemetry,
  CameraControlActions,
  MapCameraTelemetry,
  ProjectedMapLabel,
} from '../game/types';
import {
  WarriorMeshHandles,
  createContinentalBridgesGroup,
  createContinentalForestsAndRocksGroup,
  createContinentalTerrainMesh,
  createSettlementModel,
  createStoneTextures,
  createTerrainTextures,
  createWarriorModel,
} from '../game/proceduralModels';
import { sound } from '../game/sound';

export type {
  BattleTelemetry,
  CameraControlActions,
  MapCameraTelemetry,
  ProjectedMapLabel,
};

// Pre-allocated module-scope math helpers (Zero GC in requestAnimationFrame)
const _v1 = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

interface WorldCanvasProps {
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  subMode: 'overworld' | 'battle';
  campaignTimeScale: 0 | 1 | 2 | 4;
  campaign: CampaignState;
  activeDiplomacyLordId?: string | null;
  activeDialogueLordId?: string | null;
  activeSettlementModalId?: string | null;
  /** Tam ekran bir modal açıkken arka plan 3B WebGL çizimini duraklatarak FPS düşüşünü önler. */
  isRenderPaused?: boolean;
  cameraActionsRef: React.MutableRefObject<CameraControlActions | null>;
  /** Faz 11: lord konumları her karede buraya yazılır (dünya simülasyonu okur). */
  lordPositionsRef?: React.MutableRefObject<Map<string, { x: number; z: number }>>;
  lordPositionCommandsRef?: React.MutableRefObject<Map<string, { x: number; z: number }>>;
  playerPositionCommandRef?: React.MutableRefObject<{ x: number; z: number } | null>;
  onSetTimeScale?: (timeScale: 0 | 1 | 2 | 4) => void;
  onUpdatePlayerPos: (
    x: number,
    z: number,
    nearSettlement: Settlement | null,
    nearLord: LordAgent | null,
    camTelemetry: MapCameraTelemetry,
  ) => void;
  onOpenSettlement: (settlement: Settlement) => void;
  onOpenDiplomacy: (lord: LordAgent) => void;
  onHostileEncounter?: (lord: LordAgent, scenario: EncounterScenario) => void;
}

interface SiegeMapMarker {
  element: HTMLDivElement;
  fill: HTMLDivElement | null;
  x: number;
  y: number;
  z: number;
}

function createSiegeMapMarker(
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

function hideSiegeMapMarkers(markers: readonly SiegeMapMarker[]): void {
  markers.forEach(({ element }) => {
    element.style.display = 'none';
  });
}

function addCampBox(
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

function addCampBeam(
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

function addCampDisc(
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

function createCampaignSiegeEngineModel(engine: SiegeEngineType): THREE.Group {
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

const SIEGE_SLOT_SPECS = [
  { offset: -0.45, radius: 13.0 },
  { offset: -0.15, radius: 13.0 },
  { offset: 0.15, radius: 13.0 },
  { offset: 0.45, radius: 13.0 },
  { offset: 0, radius: 10.6 },
  { offset: -0.3, radius: 11.2 },
  { offset: 0.3, radius: 11.2 },
] as const;

function siegeEngineSlots(
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

function createSiegeEngineGroup(
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

function disposeSiegeEngineModel(group: THREE.Group): void {
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

type CampInstanceTransform = {
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

function addStaticCampInstances(
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

function addStaticSiegeCampVisuals(
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

export const WorldCanvas: React.FC<WorldCanvasProps> = ({
  gameState,
  subMode,
  campaignTimeScale,
  campaign,
  activeDiplomacyLordId,
  activeDialogueLordId,
  activeSettlementModalId,
  isRenderPaused = false,
  cameraActionsRef,
  lordPositionsRef,
  lordPositionCommandsRef,
  playerPositionCommandRef,
  onSetTimeScale,
  onUpdatePlayerPos,
  onOpenSettlement,
  onOpenDiplomacy,
  onHostileEncounter,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef({
    gameState,
    subMode,
    campaignTimeScale,
    campaign,
    activeDiplomacyLordId,
    activeDialogueLordId,
    activeSettlementModalId,
    isRenderPaused,
    onSetTimeScale,
    onUpdatePlayerPos,
    onOpenSettlement,
    onOpenDiplomacy,
    onHostileEncounter,
  });

  useEffect(() => {
    stateRef.current = {
      gameState,
      subMode,
      campaignTimeScale,
      campaign,
      activeDiplomacyLordId,
      activeDialogueLordId,
      activeSettlementModalId,
      isRenderPaused,
      onSetTimeScale,
      onUpdatePlayerPos,
      onOpenSettlement,
      onOpenDiplomacy,
      onHostileEncounter,
    };
  }, [
    gameState,
    subMode,
    campaignTimeScale,
    campaign,
    activeDiplomacyLordId,
    activeDialogueLordId,
    activeSettlementModalId,
    isRenderPaused,
    onSetTimeScale,
    onUpdatePlayerPos,
    onOpenSettlement,
    onOpenDiplomacy,
    onHostileEncounter,
  ]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isHeadless,
      preserveDrawingBuffer: isHeadless,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x1e384b);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(0x1e384b, 0.00014);

    const camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      3.0,
      2800,
    );

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Bannerlord Golden-Hour Low-Angle Sunlight Rig for Dramatic Mountain Ridge Relief Shadows
    const hemiLight = new THREE.HemisphereLight(0xbcd4e6, 0x3b3224, 0.58);
    hemiLight.position.set(0, 120, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffe4b5, 1.45);
    sunLight.position.set(-125, 88, 95);
    if (!isHeadless) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(1024, 1024);
      const d = 145;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.near = 10;
      sunLight.shadow.camera.far = 360;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
    }
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.45);
    rimLight.position.set(110, 65, -90);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { albedoTex, bumpTex, detailTex } = createTerrainTextures(maxAniso);
    const stoneTex = createStoneTextures(maxAniso);

    // 1. 2400x1800 High-Res Slope-Shaded Continental Terrain Mesh with Multi-Scale Close-Up Detail Shader
    const terrainMesh = createContinentalTerrainMesh(albedoTex, bumpTex, detailTex);
    terrainMesh.updateMatrix();
    terrainMesh.matrixAutoUpdate = false;
    scene.add(terrainMesh);

    // 2. Deep Abyssal Backdrop Skirt at y = -18.0 (Zero Z-Fighting with Terrain Water Surface at y = -0.25)
    const waterGeo = new THREE.PlaneGeometry(MAP_WIDTH * 1.5, MAP_HEIGHT * 1.5, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshBasicMaterial({
      color: 0x0f2c40,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = -18.0;
    waterMesh.updateMatrix();
    waterMesh.matrixAutoUpdate = false;
    scene.add(waterMesh);

    // 3. Weathered Stone Arch Bridges
    const bridgesGroup = createContinentalBridgesGroup(stoneTex);
    scene.add(bridgesGroup);

    // 4. Dense Organic Multi-Canopy Forests & Craggy Mountain Outcrop Boulders
    const forestsAndRocksGroup = createContinentalForestsAndRocksGroup();
    scene.add(forestsAndRocksGroup);

    // Overworld vs Battle Layer Groups
    const overworldGroup = new THREE.Group();
    scene.add(overworldGroup);

    const settlementMeshes = new Map<string, THREE.Group>();
    const siegeCampRings = new Map<string, THREE.Group>();
    const siegeRingMat = new THREE.MeshBasicMaterial({
      color: 0x7f1d1d,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const siegeSmokeMat = new THREE.MeshBasicMaterial({
      color: 0x1c1914,
      transparent: true,
      opacity: 0.35,
    });
    const siegeRingGeo = new THREE.RingGeometry(7.2, 8.4, 28);
    siegeRingGeo.rotateX(-Math.PI / 2);
    const siegeSmokeGeo = new THREE.SphereGeometry(0.55, 6, 6);
    const settlementFlagHandles = new Map<
      string,
      { flag: THREE.Mesh; lastFaction: string }
    >();
    const interactableProxies: THREE.Mesh[] = [];
    const sharedSettleProxyGeo = new THREE.CylinderGeometry(5.5, 5.5, 8, 8);
    const sharedLordProxyGeo = new THREE.CylinderGeometry(3.5, 3.5, 5, 8);
    const sharedHiddenProxyMat = new THREE.MeshBasicMaterial({ visible: false });

    stateRef.current.campaign.settlements.forEach((s) => {
      const facHex = FACTION_INFO[s.faction].hex;
      const model = createSettlementModel(s.type, facHex, stoneTex);
      const sy = groundHeightAt(s.x, s.z);
      model.position.set(s.x, sy, s.z);
      model.updateMatrix();
      model.matrixAutoUpdate = false;
      overworldGroup.add(model);
      settlementMeshes.set(s.id, model);

      if (s.type !== 'VILLAGE') {
        const camp = new THREE.Group();
        camp.position.set(s.x, sy + 0.12, s.z);
        camp.matrixAutoUpdate = false;
        camp.updateMatrix();
        camp.visible = false;
        overworldGroup.add(camp);
        siegeCampRings.set(s.id, camp);
      }

      const flag = model.getObjectByName('bannerFlag') as THREE.Mesh | undefined;
      if (flag) {
        // Malzeme kültür başına önbelleklenir; fetih sonrası rengi değiştirmek
        // aynı kültürdeki tüm sancakları boyamasın diye her yerleşime kopya verilir.
        flag.material = (flag.material as THREE.Material).clone();
        settlementFlagHandles.set(s.id, { flag, lastFaction: s.faction });
      }

      const proxy = new THREE.Mesh(sharedSettleProxyGeo, sharedHiddenProxyMat);
      proxy.position.set(s.x, sy + 4, s.z);
      proxy.updateMatrix();
      proxy.matrixAutoUpdate = false;
      proxy.userData = { kind: 'settlement', id: s.id };
      overworldGroup.add(proxy);
      interactableProxies.push(proxy);
    });

    const lordMeshes = new Map<string, WarriorMeshHandles>();
    const lordProxies = new Map<string, THREE.Mesh>();
    const lordProxyList: THREE.Mesh[] = [];
    stateRef.current.campaign.lords.forEach((l) => {
      const facHex = FACTION_INFO[l.faction].hex;
      const warrior = createWarriorModel({
        factionHex: facHex,
        isMounted: true,
        isCommander: true,
      });
      warrior.root.scale.setScalar(1.45);
      const ly = groundHeightAt(l.x, l.z);
      warrior.root.position.set(l.x, ly, l.z);
      overworldGroup.add(warrior.root);
      lordMeshes.set(l.id, warrior);

      const proxy = new THREE.Mesh(sharedLordProxyGeo, sharedHiddenProxyMat);
      proxy.position.set(l.x, ly + 2.5, l.z);
      proxy.userData = { kind: 'lord', id: l.id };
      overworldGroup.add(proxy);
      interactableProxies.push(proxy);
      lordProxies.set(l.id, proxy);
      lordProxyList.push(proxy);
    });

    // Overworld Player Commander Avatar
    const overworldPlayer = createWarriorModel({
      factionHex: FACTION_INFO.player.hex,
      isMounted: true,
      isCommander: true,
    });
    overworldPlayer.root.scale.setScalar(1.55);
    overworldPlayer.root.position.set(
      stateRef.current.campaign.playerX,
      groundHeightAt(stateRef.current.campaign.playerX, stateRef.current.campaign.playerZ),
      stateRef.current.campaign.playerZ,
    );
    overworldGroup.add(overworldPlayer.root);

    // Destination Waypoint Ring & Golden March Path Line on Overworld
    const destRing = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.85, 28),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
      }),
    );
    destRing.rotateX(-Math.PI / 2);
    overworldGroup.add(destRing);

    const pathPoints = Array.from({ length: 24 }, () => new THREE.Vector3(0, -50, 0));
    const pathGeo = new THREE.BufferGeometry().setFromPoints(pathPoints);
    const pathMat = new THREE.LineBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.85,
    });
    const marchPathLine = new THREE.Line(pathGeo, pathMat);
    marchPathLine.frustumCulled = false;
    overworldGroup.add(marchPathLine);

    // ============================================================================
    // BANNERLORD STRATEGIC CAMPAIGN MAP CAMERA STATE & INPUTS
    // ============================================================================
    let playerOverworldX = stateRef.current.campaign.playerX;
    let playerOverworldZ = stateRef.current.campaign.playerZ;
    let playerOverworldFacing = 0;
    let walkPhase = 0;
    let lordWalkPhase = 0;
    let overworldTargetPos: { x: number; z: number } | null = null;
    let overworldWaypoints: Array<{ x: number; z: number }> = [];
    let marchPathDirty = true;

    // Live route state for each Lord (moves along land routes at party-size-dependent speed)
    const lordLiveRoutes = new Map<string, LordLiveRouteState & { cachedY?: number }>();
    stateRef.current.campaign.lords.forEach((l) => {
      lordLiveRoutes.set(l.id, {
        x: l.x,
        z: l.z,
        rotY: 0,
        targetSettlementId: null,
        waypoints: computeLandPath(l.x, l.z, l.targetX, l.targetZ),
        currentAction: l.currentAction,
        cachedY: Math.max(0.25, groundHeightAt(l.x, l.z)),
      });
    });

    const initContinentView =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('view') === 'continent';

    let camFocusX = initContinentView ? -75 : playerOverworldX;
    let camFocusZ = initContinentView ? -8 : playerOverworldZ;
    let camFocusY = Math.max(0, groundHeightAt(camFocusX, camFocusZ));
    let targetCamFocusX = camFocusX;
    let targetCamFocusZ = camFocusZ;
    let camYaw = 0;
    let targetCamYaw = 0;
    let camZoomDist = initContinentView ? 860 : 48;
    let targetCamZoomDist = camZoomDist;
    let isFollowingPlayer = !initContinentView;

    let pendingTarget: { type: 'settlement' | 'lord'; id: string } | null = null;
    let followingLordId: string | null = null;
    let followRepathTimer = 0;
    const encounterCooldowns = new Map<string, number>();
    let lastActiveTalkingLordId: string | null = null;

    function setMarchDestination(
      tx: number,
      tz: number,
      target?: { type: 'settlement' | 'lord'; id: string },
    ) {
      let resolvedTarget = target ?? null;
      if (!resolvedTarget) {
        // Automatically detect if coordinates match a settlement so Atlas "Sefer Yürüt" also auto-enters on arrival
        const nearS = stateRef.current.campaign.settlements.find(
          (s) => Math.hypot(s.x - tx, s.z - tz) < 7.5,
        );
        if (nearS) {
          resolvedTarget = { type: 'settlement', id: nearS.id };
        }
      }

      pendingTarget = resolvedTarget;
      followingLordId = resolvedTarget?.type === 'lord' ? resolvedTarget.id : null;
      followRepathTimer = 0;

      if (stateRef.current.campaignTimeScale === 0) {
        stateRef.current.onSetTimeScale?.(1);
      }

      const clampedX = THREE.MathUtils.clamp(tx, -520, 520);
      const clampedZ = THREE.MathUtils.clamp(tz, -390, 390);
      const safeGoal = snapToNearestLand(clampedX, clampedZ);
      overworldWaypoints = computeLandPath(
        playerOverworldX,
        playerOverworldZ,
        safeGoal.x,
        safeGoal.z,
      );
      const finalWp =
        overworldWaypoints.length > 0
          ? overworldWaypoints[overworldWaypoints.length - 1]
          : safeGoal;
      overworldTargetPos = { x: finalWp.x, z: finalWp.z };
      const dy = Math.max(0.0, groundHeightAt(finalWp.x, finalWp.z)) + 0.14;
      destRing.position.set(finalWp.x, dy, finalWp.z);
      (destRing.material as THREE.MeshBasicMaterial).opacity = 0.95;
      marchPathDirty = true;
    }

    function updateMarchPathGeometry() {
      if (!marchPathDirty) return;
      marchPathDirty = false;
      const posAttr = marchPathLine.geometry.attributes.position as THREE.BufferAttribute;
      if (!overworldTargetPos || overworldWaypoints.length === 0) {
        for (let i = 0; i < 24; i++) {
          posAttr.setXYZ(i, 0, -50, 0);
        }
        posAttr.needsUpdate = true;
        return;
      }
      const chain = [{ x: playerOverworldX, z: playerOverworldZ }, ...overworldWaypoints];
      // Compute cumulative length along waypoint chain
      const segLengths: number[] = [];
      let totalLen = 0;
      for (let i = 0; i < chain.length - 1; i++) {
        const d = Math.hypot(chain[i + 1].x - chain[i].x, chain[i + 1].z - chain[i].z);
        segLengths.push(d);
        totalLen += d;
      }
      for (let i = 0; i < 24; i++) {
        const targetDist = (i / 23) * Math.max(0.001, totalLen);
        let acc = 0;
        let px = chain[chain.length - 1].x;
        let pz = chain[chain.length - 1].z;
        for (let s = 0; s < segLengths.length; s++) {
          const sl = segLengths[s];
          if (acc + sl >= targetDist || s === segLengths.length - 1) {
            const localT = sl > 0.0001 ? Math.min(1, Math.max(0, (targetDist - acc) / sl)) : 1;
            px = THREE.MathUtils.lerp(chain[s].x, chain[s + 1].x, localT);
            pz = THREE.MathUtils.lerp(chain[s].z, chain[s + 1].z, localT);
            break;
          }
          acc += sl;
        }
        const py = Math.max(0.25, groundHeightAt(px, pz)) + 0.32;
        posAttr.setXYZ(i, px, py, pz);
      }
      posAttr.needsUpdate = true;
    }

    // 0ms Latency Hardware-Accelerated Overworld Label Overlay (Pinned 100% to 3D terrain on every frame)
    const labelOverlay = document.createElement('div');
    labelOverlay.className = 'absolute inset-0 pointer-events-none overflow-hidden z-10';
    container.appendChild(labelOverlay);

    // Single dynamic Bannerlord dark-green / gold hover inspection card
    const tooltipCard = document.createElement('div');
    tooltipCard.setAttribute('data-testid', 'overworld-hover-tooltip');
    tooltipCard.className =
      'absolute top-0 left-0 z-30 w-60 rounded border border-[#c6a15b]/70 border-t-2 border-t-[#f59e0b] px-3 py-2.5 text-center shadow-2xl pointer-events-none hidden';
    tooltipCard.style.background =
      'linear-gradient(180deg, rgba(16, 26, 18, 0.97) 0%, rgba(12, 18, 13, 0.99) 100%)';
    labelOverlay.appendChild(tooltipCard);

    function showLordTooltip(lord: LordAgent, anchorX: number, anchorY: number) {
      const route = lordLiveRoutes.get(lord.id);
      const lx = route ? route.x : lord.x;
      const lz = route ? route.z : lord.z;
      const intel = getLordDetailedIntel(
        lord,
        lx,
        lz,
        stateRef.current.campaign.settlements,
        route?.currentAction,
      );
      const fac = FACTION_INFO[lord.faction];
      const lordIndex = Math.max(0, stateRef.current.campaign.lords.findIndex((item) => item.id === lord.id));
      const clanGroups: Record<string, [string, string, string]> = {
        player: ['Demirtaç', 'Gümüşyay', 'Kartalpençe'],
        vlandia: ['Bozkurt', 'Alşahin', 'Karadağ'],
        battania: ['Aybora', 'Tuğrul', 'Sırmaok'],
        sturgia: ['Erguvan', 'Yelkovan', 'Sarpkalkan'],
        empire: ['Altınkule', 'Mermertaş', 'Ayışığı'],
        khuzait: ['Tulpar', 'Demirbörü', 'Gökbayrak'],
        aserai: ['Kumyeli', 'Çölduman', 'Baharatkolu'],
        bandits: ['Karagölge', 'Paslıkılıç', 'Kırıkdiş'],
      };
      const clanStem = (clanGroups[lord.faction] ?? ['Sınır', 'Uzak', 'Gezgin'])[lordIndex % 3];
      const clanName = `${clanStem} ${lord.faction === 'bandits' ? 'Çetesi' : 'Hanedanı'}`;

      const statusBadge = lord.isAtWarWithPlayer
        ? '<span class="px-1.5 py-0.5 rounded bg-[#7f1d1d] text-[#fecaca] text-[9px] font-bold">SAVAŞTA</span>'
        : lord.isAlliedWithPlayer || lord.relation >= 20
          ? '<span class="px-1.5 py-0.5 rounded bg-[#064e3b] text-[#a7f3d0] text-[9px] font-bold">DOST</span>'
          : '<span class="px-1.5 py-0.5 rounded bg-[#1e293b] text-[#fde68a] text-[9px] font-bold">TARAFSIZ</span>';

      tooltipCard.innerHTML = `
        <div class="flex items-center justify-center gap-1.5 font-display font-bold text-xs text-[#fbbf24] border-b border-[#c6a15b]/30 pb-1 mb-1">
          <span style="background-color: ${lord.bannerColor}; clip-path: polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%);" class="w-3.5 h-4 inline-flex items-center justify-center border border-[#fcd34d] text-[8px]">${fac.glyph}</span>
          <span>${lord.title} ${lord.name}</span>
          ${statusBadge}
        </div>
        <div class="text-[10px] text-[#a3b19b]">
          Klan: <span class="font-semibold text-[#f8f0df]">${clanName}</span> · Krallık: <span class="font-semibold text-[#fde68a]">${fac.name}</span>
        </div>
        <div class="text-[9px] text-[#86efac] mt-0.5 italic">
          ${intel.currentAction}
        </div>
        <div class="my-1.5 border-t border-[#c6a15b]/25 pt-1 text-[10px] text-[#c6a15b] font-semibold">
          Birlik: <span class="text-[#86efac] font-mono">${intel.totalHealthy}${intel.wounded > 0 ? ` + ${intel.wounded}y` : ''}</span> <span class="text-[#a89b84] text-[9px]">(${intel.totalHealthy} Sağlam${
            intel.wounded > 0 ? `, ${intel.wounded} Yaralı` : ''
          })</span>
        </div>
        <div class="text-[9px] text-[#e2e8f0] font-mono">
          Piyade: ${intel.roster.infantry} · Okçu: ${intel.roster.archer} · Süvari: ${intel.roster.cavalry} · Muhafız: ${intel.roster.horseArcher}
        </div>
        <div class="mt-1 pt-1 border-t border-[#c6a15b]/20 flex items-center justify-between text-[9px] text-[#fde68a] font-mono">
          <span>Esirler: ${intel.prisoners} (+${intel.prisoners}e)</span>
          <span>Harita Hızı: ${intel.speedInfo.finalSpeed}</span>
        </div>
        <div class="text-[8px] text-[#9ca3af] mt-0.5">
          İlişki: ${lord.relation >= 0 ? `+${lord.relation}` : lord.relation} · Moral: ${intel.morale} · Erzak: ${intel.foodDays} Gün
        </div>
      `;
      const clampedX = Math.max(130, Math.min(window.innerWidth - 130, Math.round(anchorX)));
      const clampedY = Math.max(150, Math.round(anchorY - 10));
      tooltipCard.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0) translate(-50%, -100%)`;
      tooltipCard.classList.remove('hidden');
    }

    interface SettlementLabelRecord {
      settlement: Settlement;
      el: HTMLDivElement;
      gSpan: HTMLElement | null;
      sMesh: THREE.Group | undefined;
      worldY: number;
      meshCullDist: number;
      visible: boolean;
      meshVisible: boolean;
      lastSx: number;
      lastSy: number;
      lastText: string;
      bannerEl: HTMLElement | null;
      siegeBadgeEl: HTMLElement | null;
      siegeMarkers: SiegeMapMarker[];
      siegeEngineSignature: string | null;
      lastFaction: string;
      lastBesieged: boolean;
    }

    const settlementLabelRecords: SettlementLabelRecord[] = [];
    stateRef.current.campaign.settlements.forEach((s, idx) => {
      const siegeMarkers: SiegeMapMarker[] = [];
      const el = document.createElement('div');
      // NOT: transition-transform ve hover:scale-* kaldırıldı; fare üzerine gelince isim asla hareket etmez!
      el.className =
        'absolute top-0 left-0 pointer-events-auto flex items-center cursor-pointer select-none group hover:brightness-110';
      el.style.contain = 'layout style';
      el.style.willChange = 'transform';
      el.setAttribute('data-testid', `map-label-${s.id}`);
      el.setAttribute('data-settlement-type', s.type);

      const fac = FACTION_INFO[s.faction];
      const isTown = s.type === 'TOWN';
      const isCastle = s.type === 'CASTLE';
      const isVillage = s.type === 'VILLAGE';
      const villageProd = isVillage ? getVillagePrimaryProduction(s) : null;

      el.innerHTML = `
        <div data-role="banner-shield" data-faction="${s.faction}" style="background-color: ${fac.color}; clip-path: polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%);"
             class="${isVillage ? 'w-4 h-5' : isCastle ? 'w-5 h-6' : 'w-6 h-7'} flex items-center justify-center border border-[#d4af37] z-10 shrink-0 shadow">
          <svg viewBox="0 0 16 16" class="w-3 h-3 fill-[#fde68a]">
            ${
              isTown
                ? '<path d="M8 1.5L9.8 5.2H13.8L10.6 7.8L11.8 12.2L8 9.5L4.2 12.2L5.4 7.8L2.2 5.2H6.2L8 1.5Z"/>'
                : isCastle
                  ? '<path d="M3 2H5V4H7V2H9V4H11V2H13V14H3V2Z"/>'
                  : '<path d="M8 2L14 7V14H2V7L8 2Z"/>'
            }
          </svg>
        </div>
        <div style="background: linear-gradient(90deg, rgba(20, 17, 13, 0.92) 0%, rgba(30, 26, 20, 0.82) 84%, rgba(30, 26, 20, 0.32) 100%); clip-path: polygon(0% 0%, 91% 0%, 100% 50%, 91% 100%, 0% 100%);"
             class="-ml-1 pl-2 pr-3 py-0.5 border-y border-[#c6a15b]/45 group-hover:border-[#e6c885]/80 flex items-center gap-1.5 shadow">
          <span class="font-display font-semibold ${isVillage ? 'text-[10px]' : isCastle ? 'text-[11px]' : 'text-[12px]'} text-[#f5ead4] tracking-wide hud-stroke">
            ${s.name}
          </span>
          ${
            villageProd
              ? `<span data-role="production-badge" title="Birincil Üretim: ${villageProd.name}" class="text-[8px] font-mono uppercase tracking-tighter text-[#e6c885] leading-none px-1 py-0.5 rounded bg-[#18130d]/90 border border-[#c6a15b]/40">${villageProd.shortLabel}</span>`
              : ''
          }
          <span data-role="garrison-count" class="text-[9px] text-[#c6a15b] font-mono">
            ${s.garrison}
          </span>
          <span data-role="siege-badge" style="display:none;color:#fecaca;font-size:8px;font-weight:800;letter-spacing:.06em">KUŞATMA ALTINDA</span>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        tooltipCard.classList.add('hidden');
        const liveS =
          stateRef.current.campaign.settlements.find((item) => item.id === s.id) ?? s;
        const currentDist = Math.hypot(liveS.x - playerOverworldX, liveS.z - playerOverworldZ);
        const arrivalRadius = getSettlementArrivalRadius(liveS.type);
        setMarchDestination(liveS.x, liveS.z + 1.2, { type: 'settlement', id: liveS.id });
        if (currentDist <= arrivalRadius) {
          stateRef.current.onSetTimeScale?.(0);
          stateRef.current.onOpenSettlement(liveS);
        }
      });

      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        isFollowingPlayer = false;
        targetCamZoomDist = 38;
        const safe = clampCameraFocus(s.x, s.z, 38);
        targetCamFocusX = safe.x;
        targetCamFocusZ = safe.z;
      });

      el.addEventListener('mouseenter', () => {
        const liveS =
          stateRef.current.campaign.settlements.find((item) => item.id === s.id) ?? s;
        const liveFac = FACTION_INFO[liveS.faction];
        const spotRange = computePlayerSpottingRange(
          playerOverworldX,
          playerOverworldZ,
          stateRef.current.campaign.roster,
        );
        const isScouted =
          liveS.faction === 'player' ||
          isWithinSpottingRange(
            playerOverworldX,
            playerOverworldZ,
            liveS.x,
            liveS.z,
            spotRange * 1.15,
          );

        const boundVillages =
          liveS.type !== 'VILLAGE'
            ? stateRef.current.campaign.settlements
                .filter((v) => v.type === 'VILLAGE' && v.boundSettlementId === liveS.id)
                .map((v) => `${getVillagePrimaryProduction(v).icon} ${v.name}`)
            : [];
        const liveProd = liveS.type === 'VILLAGE' ? getVillagePrimaryProduction(liveS) : null;
        const fiefLine =
          liveS.type === 'VILLAGE'
            ? `<div class="text-[9px] text-[#fde68a]/90 mt-0.5">Bağlı Mülk: <span class="font-semibold">${liveS.boundSettlementName || 'Bağımsız'}</span></div>
               <div class="text-[9px] text-[#86efac] mt-0.5">Birincil Üretim: <span class="font-semibold">${liveProd?.icon ?? '🌾'} ${liveProd?.name ?? 'Tahıl'}</span></div>
               <div class="text-[9px] text-[#d6c9b1] mt-0.5">Ocak (Hane): <span class="font-mono font-semibold">${liveS.hearths ?? Math.round(liveS.prosperity * 1.15)}</span> · Durum: <span class="font-semibold">${liveS.isRaided ? '🔥 Yağmalanmış' : 'Normal'}</span></div>`
            : boundVillages.length > 0
              ? `<div class="text-[9px] text-[#fde68a]/90 mt-0.5">Bağlı Köyler (${boundVillages.length}): <span class="font-semibold">${boundVillages.join(', ')}</span></div>`
              : '';

        const intelHtml = isScouted
          ? `
            <div class="my-1 border-t border-[#c6a15b]/25 pt-1 text-[10px] text-[#c6a15b] font-semibold">
              Refah: ${liveS.prosperity} · Garnizon: ${liveS.garrison} · Erzak: ${liveS.foodStock}
            </div>
            <div class="text-[9px] text-[#d1d5db]">
              Piyade: ${liveS.recruitPool.infantry + liveS.recruitPool.horseArcher} · Okçu: ${liveS.recruitPool.archer} · Süvari: ${liveS.recruitPool.cavalry}
            </div>
          `
          : `
            <div class="my-1 border-t border-[#c6a15b]/25 pt-1 text-[10px] text-[#9ca3af] italic">
              Garnizon ve Erzak: ? (Görüş Menzili Dışında)
            </div>
            <div class="text-[9px] text-[#fde68a]/80">
              Detaylı istihbarat için yerleşime yaklaşın veya tıklayıp yürüyün
            </div>
          `;

        tooltipCard.innerHTML = `
          <div class="font-display font-bold text-xs text-[#fbbf24] border-b border-[#c6a15b]/30 pb-1 mb-1.5">
            ${liveS.name} (${liveS.type === 'CASTLE' ? 'Kale' : liveS.type === 'TOWN' ? 'Şehir' : 'Köy'})
          </div>
          <div class="text-[10px] text-[#a3b19b]">
            Krallık: <span class="font-semibold text-[#fde68a]">${liveFac.name}</span>
          </div>
          ${fiefLine}
          ${intelHtml}
        `;
        const rect = el.getBoundingClientRect();
        tooltipCard.style.transform = `translate3d(${Math.round(rect.left + rect.width / 2)}px, ${Math.round(rect.top - 8)}px, 0) translate(-50%, -100%)`;
        tooltipCard.classList.remove('hidden');
      });

      el.addEventListener('mouseleave', () => {
        tooltipCard.classList.add('hidden');
      });

      labelOverlay.appendChild(el);
      const baseH = groundHeightAt(s.x, s.z);
      settlementLabelRecords.push({
        settlement: s,
        el,
        gSpan: el.querySelector('[data-role="garrison-count"]'),
        sMesh: settlementMeshes.get(s.id),
        worldY: baseH + (isVillage ? 4.4 : isCastle ? 6.8 : 7.4),
        // Stagger village 3D model culling distance (225m..265m) so all 131 villages never pop on the same frame
        meshCullDist: isVillage ? 225 + (idx % 16) * 2.5 : isCastle ? 540 : 1200,
        visible: true,
        meshVisible: true,
        lastSx: -9999,
        lastSy: -9999,
        lastText: String(s.garrison),
        bannerEl: el.querySelector('[data-role="banner-shield"]'),
        siegeBadgeEl: el.querySelector('[data-role="siege-badge"]'),
        siegeMarkers,
        siegeEngineSignature: null,
        lastFaction: s.faction,
        lastBesieged: false,
      });
    });

    interface LordLabelRecord {
      id: string;
      el: HTMLDivElement;
      troopSpan: HTMLElement | null;
      visible: boolean;
      lastSx: number;
      lastSy: number;
      lastHtml: string;
    }

    // Under-Foot Lord Coat-of-Arms + Troop & Wounded Nameplates (Directly underneath each Lord's horse!)
    const lordLabelRecords = new Map<string, LordLabelRecord>();
    stateRef.current.campaign.lords.forEach((l) => {
      const el = document.createElement('div');
      // NOT: transition-transform ve hover:scale-110 kaldırıldı; fare üzerine gelince lord etiketi sabit kalır!
      el.className =
        'absolute top-0 left-0 pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#14120e]/90 border border-[#c6a15b]/50 hover:border-[#f3d999] cursor-pointer select-none group shadow-md';
      el.style.contain = 'layout style';
      el.style.willChange = 'transform';
      el.setAttribute('data-testid', `map-label-${l.id}`);
      const intel = getLordDetailedIntel(l);
      const initialTroopHtml = `${intel.totalHealthy}${intel.wounded > 0 ? `<span class="text-[10px] text-[#d97706]">+${intel.wounded}</span>` : ''}`;
      el.innerHTML = `
        <span style="background-color: ${l.bannerColor}; clip-path: polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%);"
              class="w-4 h-5 flex items-center justify-center border border-[#d4af37]/90 shadow shrink-0">
          <svg viewBox="0 0 16 16" class="w-2.5 h-2.5 fill-[#fde68a]">
            <path d="M8 2L10.5 6.5L15 8L10.5 9.5L8 14L5.5 9.5L1 8L5.5 6.5L8 2Z"/>
          </svg>
        </span>
        <span data-role="lord-troops" class="font-display font-extrabold text-[12px] ${
          l.isAtWarWithPlayer ? 'text-[#f87171]' : 'text-[#e6d8b8]'
        } hud-stroke tracking-tight">${initialTroopHtml}</span>
      `;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        tooltipCard.classList.add('hidden');
        const liveLord =
          stateRef.current.campaign.lords.find((item) => item.id === l.id) ?? l;
        const route = lordLiveRoutes.get(l.id);
        const lx = route ? route.x : liveLord.x;
        const lz = route ? route.z : liveLord.z;
        const currentDist = Math.hypot(lx - playerOverworldX, lz - playerOverworldZ);
        setMarchDestination(lx, lz, { type: 'lord', id: liveLord.id });
        if (currentDist <= 3.2) {
          stateRef.current.onSetTimeScale?.(0);
          stateRef.current.onOpenDiplomacy(liveLord);
        }
      });
      el.addEventListener('mouseenter', () => {
        const liveLord =
          stateRef.current.campaign.lords.find((item) => item.id === l.id) ?? l;
        const rect = el.getBoundingClientRect();
        showLordTooltip(liveLord, rect.left + rect.width / 2, rect.top);
      });
      el.addEventListener('mouseleave', () => {
        tooltipCard.classList.add('hidden');
      });
      labelOverlay.appendChild(el);
      lordLabelRecords.set(l.id, {
        id: l.id,
        el,
        troopSpan: el.querySelector('[data-role="lord-troops"]'),
        visible: true,
        lastSx: -9999,
        lastSy: -9999,
        lastHtml: initialTroopHtml,
      });
    });

    // Under-Foot Player Party Coat-of-Arms + Troop Count Nameplate (Directly underneath Player's horse!)
    const playerPartyEl = document.createElement('div');
    playerPartyEl.setAttribute('data-testid', 'map-label-player-party');
    playerPartyEl.className =
      'absolute top-0 left-0 pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#14120e]/90 border border-[#d4af37]/75 cursor-pointer select-none shadow-md';
    playerPartyEl.style.contain = 'layout style';
    playerPartyEl.style.willChange = 'transform';
    playerPartyEl.innerHTML = `
      <span style="background-color: ${FACTION_INFO.player.color}; clip-path: polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%);"
            class="w-4 h-5 flex items-center justify-center border border-[#fcd34d] shadow shrink-0">
        <svg viewBox="0 0 16 16" class="w-2.5 h-2.5 fill-[#fef08a]">
          <path d="M8 1.5L10 5.5L14.5 4L12 9L14 14L8 11.5L2 14L4 9L1.5 4L6 5.5L8 1.5Z"/>
        </svg>
      </span>
      <span id="player-party-count" class="font-display font-extrabold text-[12px] text-[#fef08a] hud-stroke tracking-tight">
        ${getTotalTroops(stateRef.current.campaign.roster)}
      </span>
    `;
    const playerPartyCountSpan = playerPartyEl.querySelector('#player-party-count');
    let playerLabelVisible = true;
    let playerLabelLastSx = -9999;
    let playerLabelLastSy = -9999;
    let playerLabelLastText = String(getTotalTroops(stateRef.current.campaign.roster));

    playerPartyEl.addEventListener('mouseenter', () => {
      const camp = stateRef.current.campaign;
      const totalHealthy = getTotalTroops(camp.roster);
      const pSpeed = calculateBannerlordPartySpeed({
        x: playerOverworldX,
        z: playerOverworldZ,
        totalHealthy,
        cavalryCount: camp.roster.cavalry,
        prisonerCount: camp.prisoners,
        foodUnits: camp.food,
        morale: camp.morale,
        culture: getPlayerCulture(camp),
      });
      tooltipCard.innerHTML = `
        <div class="font-display font-bold text-xs text-[#fbbf24] border-b border-[#c6a15b]/30 pb-1 mb-1">
          ${camp.playerName} Sancağı
        </div>
        <div class="text-[10px] text-[#a3b19b]">
          ${FACTION_INFO.player.emblemName}
        </div>
        <div class="my-1 border-t border-[#c6a15b]/25 pt-1 text-[10px] text-[#86efac] font-semibold">
          Toplam Asker: ${totalHealthy} · Esirler: ${camp.prisoners}
        </div>
        <div class="text-[9px] text-[#e2e8f0] font-mono">
          Piyade: ${camp.roster.infantry} · Okçu: ${camp.roster.archer} · Süvari: ${camp.roster.cavalry} · Muhafız: ${camp.roster.horseArcher}
        </div>
        <div class="mt-1 pt-1 border-t border-[#c6a15b]/20 text-[9px] text-[#fde68a] font-mono">
          Hız: ${pSpeed.finalSpeed} (${pSpeed.terrainLabel})
        </div>
      `;
      const rect = playerPartyEl.getBoundingClientRect();
      tooltipCard.style.transform = `translate3d(${Math.round(rect.left + rect.width / 2)}px, ${Math.round(rect.top - 8)}px, 0) translate(-50%, -100%)`;
      tooltipCard.classList.remove('hidden');
    });
    playerPartyEl.addEventListener('mouseleave', () => {
      tooltipCard.classList.add('hidden');
    });
    labelOverlay.appendChild(playerPartyEl);

    // Expose programmatic camera & march actions to HUD buttons
    cameraActionsRef.current = {
      focusOnPlayer: () => {
        isFollowingPlayer = true;
        const safe = clampCameraFocus(playerOverworldX, playerOverworldZ, targetCamZoomDist);
        targetCamFocusX = safe.x;
        targetCamFocusZ = safe.z;
        camFocusX = safe.x;
        camFocusZ = safe.z;
      },
      focusOnCoords: (x: number, z: number, zoom?: number) => {
        isFollowingPlayer = false;
        if (zoom !== undefined) {
          const czoom = THREE.MathUtils.clamp(zoom, 16, 940);
          targetCamZoomDist = czoom;
          camZoomDist = czoom;
        }
        const safe = clampCameraFocus(x, z, targetCamZoomDist);
        targetCamFocusX = safe.x;
        targetCamFocusZ = safe.z;
        camFocusX = safe.x;
        camFocusZ = safe.z;
      },
      adjustZoom: (delta: number) => {
        targetCamZoomDist = THREE.MathUtils.clamp(targetCamZoomDist + delta, 16, 940);
        const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
        targetCamFocusX = safe.x;
        targetCamFocusZ = safe.z;
      },
      rotateYaw: (deltaRad: number) => {
        targetCamYaw += deltaRad;
      },
      resetNorth: () => {
        targetCamYaw = 0;
      },
      commandMarchTo: (
        x: number,
        z: number,
        target?: { type: 'settlement' | 'lord'; id: string },
      ) => {
        setMarchDestination(x, z, target);
      },
    };

    // Unified Input Hub
    const keysHeld = new Set<string>();
    const keysJustPressed = new Set<string>();
    let mouseLeftJustPressed = false;
    let mouseRightHeld = false;
    let mouseMiddleHeld = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    // Cached viewport metrics so RAF and pointermove never force synchronous DOM reflows
    let cachedCanvasWidth = container.clientWidth || window.innerWidth;
    let cachedCanvasHeight = container.clientHeight || window.innerHeight;
    let cachedCanvasLeft = 0;
    let cachedCanvasTop = 0;
    const updateCachedCanvasMetrics = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        cachedCanvasWidth = rect.width;
        cachedCanvasHeight = rect.height;
        cachedCanvasLeft = rect.left;
        cachedCanvasTop = rect.top;
      }
    };
    updateCachedCanvasMetrics();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (!keysHeld.has(e.code)) {
        keysJustPressed.add(e.code);
      }
      keysHeld.add(e.code);

      if (stateRef.current.gameState === 'playing' && stateRef.current.subMode === 'overworld') {
        const stepDist = Math.max(10, targetCamZoomDist * 0.16);
        let tapX = 0;
        let tapZ = 0;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') tapZ -= 1;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') tapZ += 1;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') tapX -= 1;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') tapX += 1;
        if (tapX !== 0 || tapZ !== 0) {
          isFollowingPlayer = false;
          const worldTapX = tapX * Math.cos(camYaw) + tapZ * Math.sin(camYaw);
          const worldTapZ = -tapX * Math.sin(camYaw) + tapZ * Math.cos(camYaw);
          const safe = clampCameraFocus(
            targetCamFocusX + worldTapX * stepDist,
            targetCamFocusZ + worldTapZ * stepDist,
            targetCamZoomDist,
          );
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        } else if (e.code === 'KeyQ') {
          targetCamYaw += 0.25;
        } else if (e.code === 'KeyE') {
          targetCamYaw -= 0.25;
        } else if (e.code === 'KeyZ' || e.code === 'Equal') {
          targetCamZoomDist = computeZoomStep(targetCamZoomDist, -75, 0);
          const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        } else if (e.code === 'KeyX' || e.code === 'Minus') {
          targetCamZoomDist = computeZoomStep(targetCamZoomDist, 75, 0);
          const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        } else if (e.code === 'KeyC' || e.code === 'Home') {
          isFollowingPlayer = true;
          const safe = clampCameraFocus(playerOverworldX, playerOverworldZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        } else if (e.code === 'KeyV' || e.code === 'End') {
          isFollowingPlayer = false;
          targetCamZoomDist = 860;
          camZoomDist = 860;
          const safe = clampCameraFocus(-75, -8, 860);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
          camFocusX = safe.x;
          camFocusZ = safe.z;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const clearInputs = () => {
      keysHeld.clear();
      keysJustPressed.clear();
      mouseLeftJustPressed = false;
      mouseRightHeld = false;
      mouseMiddleHeld = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearInputs);

    // Raycaster & Mouse Controls (Bannerlord Right-Click Orbit, Middle-Click Pan, Wheel Zoom, Left-Click March)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let hovered3DLordId: string | null = null;
    let lastHoverRaycastTime = 0;

    const handlePointerDown = (e: PointerEvent) => {
      if (stateRef.current.gameState !== 'playing') return;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;

      if (e.button === 2) {
        mouseRightHeld = true;
        return;
      }
      if (e.button === 1) {
        mouseMiddleHeld = true;
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;

      if (stateRef.current.subMode === 'battle') {
        mouseLeftJustPressed = true;
        return;
      }

      // Overworld Left-Click: Select Settlement/Lord or Set March Target
      updateCachedCanvasMetrics();
      pointerNdc.x = ((e.clientX - cachedCanvasLeft) / cachedCanvasWidth) * 2 - 1;
      pointerNdc.y = -((e.clientY - cachedCanvasTop) / cachedCanvasHeight) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);

      const proxyHits = raycaster.intersectObjects(interactableProxies, false);
      if (proxyHits.length > 0) {
        const hitData = proxyHits[0].object.userData;
        if (hitData.kind === 'settlement') {
          const found = stateRef.current.campaign.settlements.find((s) => s.id === hitData.id);
          if (found) {
            const currentDist = Math.hypot(found.x - playerOverworldX, found.z - playerOverworldZ);
            const arrivalRadius = getSettlementArrivalRadius(found.type);
            setMarchDestination(found.x, found.z + 1.2, { type: 'settlement', id: found.id });
            if (currentDist <= arrivalRadius) {
              stateRef.current.onSetTimeScale?.(0);
              stateRef.current.onOpenSettlement(found);
            }
            return;
          }
        } else if (hitData.kind === 'lord') {
          const foundLord = stateRef.current.campaign.lords.find((l) => l.id === hitData.id);
          if (foundLord) {
            const route = lordLiveRoutes.get(foundLord.id);
            const lx = route ? route.x : foundLord.x;
            const lz = route ? route.z : foundLord.z;
            const currentDist = Math.hypot(lx - playerOverworldX, lz - playerOverworldZ);
            setMarchDestination(lx, lz, { type: 'lord', id: foundLord.id });
            if (currentDist <= 3.2) {
              stateRef.current.onSetTimeScale?.(0);
              stateRef.current.onOpenDiplomacy(foundLord);
            }
            return;
          }
        }
      }

      const groundHits = raycaster.intersectObject(terrainMesh, false);
      if (groundHits.length > 0) {
        const pt = groundHits[0].point;
        setMarchDestination(pt.x, pt.z);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (stateRef.current.gameState !== 'playing' || stateRef.current.subMode !== 'overworld') {
        return;
      }
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;

      if (mouseRightHeld) {
        // Bannerlord Right-Click + Drag rotates camera yaw & adjusts zoom slightly with vertical drag
        targetCamYaw -= dx * 0.0065;
        targetCamZoomDist = THREE.MathUtils.clamp(targetCamZoomDist + dy * 0.28, 16, 940);
        const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
        targetCamFocusX = safe.x;
        targetCamFocusZ = safe.z;
        return;
      }
      if (mouseMiddleHeld) {
        // Middle-Click + Drag pans map focus directly
        isFollowingPlayer = false;
        const panScale = targetCamZoomDist * 0.0022;
        const rightX = Math.cos(camYaw);
        const rightZ = -Math.sin(camYaw);
        const fwdX = -Math.sin(camYaw);
        const fwdZ = -Math.cos(camYaw);
        const safe = clampCameraFocus(
          targetCamFocusX - (dx * rightX - dy * fwdX) * panScale,
          targetCamFocusZ - (dx * rightZ - dy * fwdZ) * panScale,
          targetCamZoomDist,
        );
        targetCamFocusX = safe.x;
        targetCamFocusZ = safe.z;
        return;
      }

      // Throttled 3D Raycast Hover Check on Lord Meshes (skip when zoomed out > 260m or actively zooming)
      if (
        e.target === renderer.domElement &&
        camZoomDist <= 260 &&
        Math.abs(targetCamZoomDist - camZoomDist) < 12
      ) {
        const nowMs = performance.now();
        if (nowMs - lastHoverRaycastTime < 45) return;
        lastHoverRaycastTime = nowMs;

        pointerNdc.x = ((e.clientX - cachedCanvasLeft) / cachedCanvasWidth) * 2 - 1;
        pointerNdc.y = -((e.clientY - cachedCanvasTop) / cachedCanvasHeight) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(lordProxyList, false);
        if (hits.length > 0) {
          const hitId = hits[0].object.userData?.id as string | undefined;
          const hoveredLord = stateRef.current.campaign.lords.find((l) => l.id === hitId);
          const lMesh = hitId ? lordMeshes.get(hitId) : undefined;
          if (hoveredLord && lMesh?.root.visible) {
            hovered3DLordId = hoveredLord.id;
            showLordTooltip(hoveredLord, e.clientX, e.clientY - 14);
            return;
          }
        }
        if (hovered3DLordId) {
          hovered3DLordId = null;
          tooltipCard.classList.add('hidden');
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button === 2) mouseRightHeld = false;
      if (e.button === 1) mouseMiddleHeld = false;
    };

    const handleWheel = (e: WheelEvent) => {
      if (stateRef.current.gameState !== 'playing' || stateRef.current.subMode !== 'overworld') {
        return;
      }
      e.preventDefault();
      // Smooth normalized logarithmic zoom across mouse wheel notches and trackpads
      targetCamZoomDist = computeZoomStep(targetCamZoomDist, e.deltaY, e.deltaMode);
      const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
      targetCamFocusX = safe.x;
      targetCamFocusZ = safe.z;
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          updateCachedCanvasMetrics();
        }
      }
    });
    resizeObserver.observe(container);

    renderer.compile(scene, camera);

    // Main 60Hz Loop
    let rafId = 0;
    let lastTime = performance.now();
    let elapsedTotal = 0;
    let hudSyncTimer = 0;
    let headlessFrameSkip = 0;
    let headlessRenderedFrames = 0;

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);

      // Tam ekran bir modal (Karakter Oluşturma, Kayıt Yükle, Envanter, Pazar vb.) açıkken
      // arka plandaki ağır 3B kıta renderını duraklat -> 0 GPU yükü, %100 akıcı 60 FPS arayüz!
      if (stateRef.current.isRenderPaused) {
        lastTime = now;
        keysJustPressed.clear();
        mouseLeftJustPressed = false;
        return;
      }

      if (isHeadless) {
        const camSettled =
          headlessRenderedFrames >= 2 &&
          stateRef.current.campaignTimeScale === 0 &&
          Math.abs(camFocusX - targetCamFocusX) < 0.05 &&
          Math.abs(camFocusZ - targetCamFocusZ) < 0.05 &&
          Math.abs(camZoomDist - targetCamZoomDist) < 0.05;
        const skipModulo = camSettled ? 20 : 4;
        headlessFrameSkip = (headlessFrameSkip + 1) % skipModulo;
        if (headlessFrameSkip !== 0) return;
        headlessRenderedFrames++;
      }

      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      elapsedTotal += dt;

      const {
        gameState: gState,
        subMode: sMode,
        campaignTimeScale: timeScale,
        campaign: camp,
      } = stateRef.current;

      // 1. TITLE SCREEN: Smooth low-overhead Continental Camera Flyover
      if (gState === 'title') {
        const tourAngle = elapsedTotal * 0.11;
        const camX = -18 + Math.cos(tourAngle) * 58;
        const camZ = -4 + Math.sin(tourAngle) * 48;
        const camY = 32 + Math.sin(elapsedTotal * 0.25) * 4;
        camera.position.lerp(_v1.set(camX, camY, camZ), 1 - Math.exp(-3 * dt));
        _camTarget.set(-18, groundHeightAt(-18, -4) + 2.5, -4);
        camera.lookAt(_camTarget);

        renderer.render(scene, camera);
        keysJustPressed.clear();
        mouseLeftJustPressed = false;
        return;
      }

      if (gState === 'paused' || gState === 'gameover') {
        keysJustPressed.clear();
        mouseLeftJustPressed = false;
        return;
      }

      // 2. OVERWORLD CONTINENTAL MAP & BANNERLORD STRATEGIC CAMERA
      if (sMode === 'overworld') {
        // A. Bannerlord Camera Controls: WASD / Arrow Keys Pan Map Focus
        let panInputX = 0;
        let panInputZ = 0;
        if (keysHeld.has('KeyW') || keysHeld.has('ArrowUp')) panInputZ -= 1;
        if (keysHeld.has('KeyS') || keysHeld.has('ArrowDown')) panInputZ += 1;
        if (keysHeld.has('KeyA') || keysHeld.has('ArrowLeft')) panInputX -= 1;
        if (keysHeld.has('KeyD') || keysHeld.has('ArrowRight')) panInputX += 1;

        if (panInputX !== 0 || panInputZ !== 0) {
          isFollowingPlayer = false;
          const len = Math.hypot(panInputX, panInputZ);
          const nx = panInputX / len;
          const nz = panInputZ / len;
          const worldPanX = nx * Math.cos(camYaw) + nz * Math.sin(camYaw);
          const worldPanZ = -nx * Math.sin(camYaw) + nz * Math.cos(camYaw);
          const panSpeed = Math.max(32, camZoomDist * 1.15);
          const safe = clampCameraFocus(
            targetCamFocusX + worldPanX * panSpeed * dt,
            targetCamFocusZ + worldPanZ * panSpeed * dt,
            targetCamZoomDist,
          );
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        }

        // B. Q / E Orbit Rotation
        const rotSpeed = 1.65;
        if (keysHeld.has('KeyQ')) targetCamYaw += rotSpeed * dt;
        if (keysHeld.has('KeyE') && !keysJustPressed.has('KeyE')) {
          targetCamYaw -= rotSpeed * dt;
        }

        // C. Z / X or +/- Zoom (Proportional exponential speed matching wheel zoom)
        if (keysHeld.has('KeyZ') || keysHeld.has('Equal')) {
          const zRate = Math.max(65, targetCamZoomDist * 1.35);
          targetCamZoomDist = THREE.MathUtils.clamp(targetCamZoomDist - zRate * dt, 16, 940);
          const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        }
        if (keysHeld.has('KeyX') || keysHeld.has('Minus')) {
          const zRate = Math.max(65, targetCamZoomDist * 1.35);
          targetCamZoomDist = THREE.MathUtils.clamp(targetCamZoomDist + zRate * dt, 16, 940);
          const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        }

        // D. Center / Follow Player Party on KeyC or Home
        if (keysJustPressed.has('KeyC') || keysJustPressed.has('Home')) {
          isFollowingPlayer = true;
        }

        // E. Compute Player Spotting Range (Fog of War) & Bannerlord Party Speed
        const playerPositionCommand = playerPositionCommandRef?.current;
        if (playerPositionCommand) {
          playerOverworldX = playerPositionCommand.x;
          playerOverworldZ = playerPositionCommand.z;
          overworldTargetPos = null;
          overworldWaypoints = [];
          pendingTarget = null;
          followingLordId = null;
          marchPathDirty = true;
          playerPositionCommandRef!.current = null;
        }
        const totalTroops = Math.max(1, getTotalTroops(camp.roster));
        const playerSpottingRange = computePlayerSpottingRange(
          playerOverworldX,
          playerOverworldZ,
          camp.roster,
        );
        const bannerlordSpeed = calculateBannerlordPartySpeed({
          x: playerOverworldX,
          z: playerOverworldZ,
          totalHealthy: totalTroops,
          cavalryCount: camp.roster.cavalry,
          woundedCount: (camp.troopStacks ?? []).reduce((sum, s) => sum + (s.wounded ?? 0), 0),
          prisonerCount: camp.prisoners,
          inventoryItems: camp.inventoryItems,
          morale: camp.morale,
          perks: camp.unlockedPerks,
          state: camp,
          culture: getPlayerCulture(camp),
        });
        const cavRatio = camp.roster.cavalry / totalTroops;
        const speedInfo = getPartySpeedInfo(playerOverworldX, playerOverworldZ, cavRatio);
        const effectivePartySpeed = bannerlordSpeed.worldUnitsPerSecAt1x;

        const activeTalkingLordId =
          stateRef.current.activeDialogueLordId ??
          stateRef.current.activeDiplomacyLordId ??
          null;
        if (lastActiveTalkingLordId && !activeTalkingLordId) {
          // Diyalog/karşılaşma kapandığında aynı lord 6.5 sn boyunca tekrar yakalamasın
          encounterCooldowns.set(lastActiveTalkingLordId, elapsedTotal + ENCOUNTER_COOLDOWN_SEC);
        }
        lastActiveTalkingLordId = activeTalkingLordId;

        const isDialogueOpen = Boolean(activeTalkingLordId);
        const isSettlementModalOpen = Boolean(stateRef.current.activeSettlementModalId);
        const isWorldEffectivelyPaused =
          timeScale === 0 || isDialogueOpen || isSettlementModalOpen;

        const worldSimDt = dt * (isWorldEffectivelyPaused ? 0 : timeScale);
        const playerStrength = getPlayerPartyStrength(camp);
        const activePlayerArmy = getPlayerArmy(camp);
        const playerArmyMemberIds = activePlayerArmy?.memberLordIds ?? [];

        // F. Advance Lord Parties Along Authentic Land Routes (Frozen if paused or in dialogue)
        if (!isWorldEffectivelyPaused) {
          lordWalkPhase += worldSimDt * 4.8;
        }

        camp.lords.forEach((l, idx) => {
          let route = lordLiveRoutes.get(l.id);
          if (!route) {
            route = {
              x: l.x,
              z: l.z,
              rotY: 0,
              targetSettlementId: null,
              waypoints: computeLandPath(l.x, l.z, l.targetX, l.targetZ),
              currentAction: l.currentAction,
              cachedY: Math.max(0.25, groundHeightAt(l.x, l.z)),
            };
            lordLiveRoutes.set(l.id, route);
          }

          const positionCommand = lordPositionCommandsRef?.current.get(l.id);
          if (positionCommand) {
            route.x = positionCommand.x;
            route.z = positionCommand.z;
            route.waypoints = [];
            route.orderKey = undefined;
            route.tacticalState = null;
            route.cachedY = Math.max(0.25, groundHeightAt(route.x, route.z));
            lordPositionCommandsRef!.current.delete(l.id);
          }

          const isThisLordTalking = activeTalkingLordId === l.id;
          let siegeSlotIndex = 0;
          let totalBesiegers = 1;
          let siegeAnchorPos: { x: number; z: number } | undefined;
          let siegeDefenderStrength = 0;
          let totalBesiegerStrength: number | undefined;
          let siegeTargetSettlement: Settlement | undefined;

          if (
            (l.order?.kind === 'SIEGE' || l.order?.kind === 'DEFEND') &&
            l.order.targetSettlementId
          ) {
            const siegeTargetId = l.order.targetSettlementId;
            siegeTargetSettlement = camp.settlements.find((s) => s.id === siegeTargetId);
            const coBesiegers = camp.lords.filter(
              (other) =>
                other.order?.kind === 'SIEGE' &&
                other.order.targetSettlementId === siegeTargetId,
            );
            const playerAlsoBesieging =
              camp.playerSiege?.settlementId === siegeTargetId && !camp.playerSiege.inside;
            const idxInSiege = Math.max(
              0,
              coBesiegers.findIndex((other) => other.id === l.id),
            );
            siegeSlotIndex = idxInSiege + (playerAlsoBesieging ? 1 : 0);
            totalBesiegers = coBesiegers.length + (playerAlsoBesieging ? 1 : 0);
            const firstCo = coBesiegers[0];
            const firstRoute = firstCo ? lordLiveRoutes.get(firstCo.id) : undefined;
            if (playerAlsoBesieging || coBesiegers.length > 0) {
              siegeAnchorPos = playerAlsoBesieging
                ? { x: playerOverworldX, z: playerOverworldZ }
                : firstRoute
                  ? { x: firstRoute.x, z: firstRoute.z }
                  : firstCo
                    ? { x: firstCo.x, z: firstCo.z }
                    : { x: route.x, z: route.z };
            }
            if (siegeTargetSettlement) {
              siegeDefenderStrength = Math.round(
                siegeTargetSettlement.garrison * 1.15 +
                  (siegeTargetSettlement.militia ?? 0) * 0.55,
              );
            }
            if (l.order.kind === 'SIEGE') {
              totalBesiegerStrength = coBesiegers.reduce(
                (sum, other) => sum + getLordPartyStrength(other),
                0,
              );
              // Kuşatma kampında konuşlanmış lordlar (veya oyun duraklatılmışken kuşatmada olanlar)
              // yarım-ay (half-moon arc) yuvasında kalenin tam dışında görünür durur!
              if (
                siegeTargetSettlement &&
                siegeAnchorPos &&
                ((l.order.siegeProgress ?? 0) > 0 ||
                  Math.hypot(
                    route.x - siegeTargetSettlement.x,
                    route.z - siegeTargetSettlement.z,
                  ) <= 36)
              ) {
                const slotPt =
                  siegeSlotIndex > 0 || totalBesiegers > 1
                    ? getSiegeCampSlotPoint(
                        siegeTargetSettlement,
                        siegeAnchorPos.x,
                        siegeAnchorPos.z,
                        siegeSlotIndex,
                        totalBesiegers,
                      )
                    : getSiegeCampPoint(
                        siegeTargetSettlement,
                        siegeAnchorPos.x,
                        siegeAnchorPos.z,
                      );
                if (
                  isWorldEffectivelyPaused ||
                  Math.hypot(route.x - slotPt.x, route.z - slotPt.z) <= 3.5
                ) {
                  route.x = slotPt.x;
                  route.z = slotPt.z;
                  route.rotY = Math.atan2(
                    siegeTargetSettlement.x - route.x,
                    siegeTargetSettlement.z - route.z,
                  );
                  route.cachedY = Math.max(0.25, groundHeightAt(route.x, route.z));
                }
              }
            }
          }

          if (!isWorldEffectivelyPaused && !isThisLordTalking && timeScale > 0) {
            const onCooldown = (encounterCooldowns.get(l.id) ?? 0) > elapsedTotal;
            const escortIdx = playerArmyMemberIds.indexOf(l.id);

            // Gerçek zamanlı kovalama (güçlüyse) / kaçma (zayıfsa) / kuşatma tehdit AI veya stratejik emir
            applyTacticalPlayerReactionToRoute({
              lord: l,
              route,
              settlements: camp.settlements,
              playerX: playerOverworldX,
              playerZ: playerOverworldZ,
              playerStrength,
              onCooldown,
              siegeDefenderStrength,
              totalBesiegerStrength,
              routeOptions: {
                siegeSlotIndex,
                totalBesiegers,
                siegeAnchorPos,
                armyEscortIndex: escortIdx >= 0 ? escortIdx : undefined,
                armyLeaderFacing: overworldPlayer.root.rotation.y,
              },
            });
            stepLordCampaignRoute(l, route, dt, timeScale, camp.settlements);
            route.cachedY = Math.max(0.25, groundHeightAt(route.x, route.z));
          }
          // Faz 11: dünya simülasyonu için gerçek konumları paylaş (React state'e dokunmaz).
          if (lordPositionsRef) {
            const store = lordPositionsRef.current;
            const prevPos = store.get(l.id);
            if (!prevPos || Math.abs(prevPos.x - route.x) > 0.05 || Math.abs(prevPos.z - route.z) > 0.05) {
              store.set(l.id, { x: route.x, z: route.z });
            }
          }

          const lx = route.x;
          const lz = route.z;
          const ly = route.cachedY ?? Math.max(0.25, groundHeightAt(lx, lz));
          const siegeTargetInSight =
            l.order?.kind === 'SIEGE' &&
            siegeTargetSettlement !== undefined &&
            (camp.playerSiege?.settlementId === siegeTargetSettlement.id ||
              isWithinSpottingRange(
                playerOverworldX,
                playerOverworldZ,
                siegeTargetSettlement.x,
                siegeTargetSettlement.z,
                playerSpottingRange * 1.15,
              ));
          const inSight =
            siegeTargetInSight ||
            isWithinSpottingRange(
              playerOverworldX,
              playerOverworldZ,
              lx,
              lz,
              playerSpottingRange,
            );

          const lMesh = lordMeshes.get(l.id);
          const lProxy = lordProxies.get(l.id);
          if (lMesh) {
            lMesh.root.visible = inSight && camZoomDist <= 310;
            if (lMesh.root.visible) {
              lMesh.root.position.set(lx, ly, lz);
              lMesh.root.rotation.y = route.rotY;
              lMesh.bodyGroup.position.y =
                !isWorldEffectivelyPaused && !isThisLordTalking
                  ? Math.abs(Math.sin(lordWalkPhase + idx * 1.3)) * 0.11
                  : 0;
            }
          }
          if (lProxy) {
            lProxy.position.set(lx, ly + 2.5, lz);
          }
        });

        // G. Continuous Unbreakable Lord Pursuit (Never drops pursuit until caught up OR Lord leaves spottingRange!)
        if (followingLordId) {
          const pursuedLord = camp.lords.find((item) => item.id === followingLordId);
          const pursuedRoute = lordLiveRoutes.get(followingLordId);
          if (!pursuedLord || !pursuedRoute) {
            followingLordId = null;
            pendingTarget = null;
          } else {
            const lx = pursuedRoute.x;
            const lz = pursuedRoute.z;
            const stillVisible = isWithinSpottingRange(
              playerOverworldX,
              playerOverworldZ,
              lx,
              lz,
              playerSpottingRange,
            );

            if (!stillVisible) {
              // Target Lord escaped beyond player's vision range (Fog of War) -> end pursuit
              followingLordId = null;
              pendingTarget = null;
              overworldTargetPos = null;
              overworldWaypoints = [];
              (destRing.material as THREE.MeshBasicMaterial).opacity = 0;
              marchPathDirty = true;
            } else {
              followRepathTimer += dt;
              const targetMovedDist = overworldTargetPos
                ? Math.hypot(lx - overworldTargetPos.x, lz - overworldTargetPos.z)
                : 999;
              if (
                overworldWaypoints.length === 0 ||
                (followRepathTimer >= 0.25 && targetMovedDist > 1.2)
              ) {
                followRepathTimer = 0;
                const safeGoal = snapToNearestLand(lx, lz);
                overworldWaypoints = computeLandPath(
                  playerOverworldX,
                  playerOverworldZ,
                  safeGoal.x,
                  safeGoal.z,
                );
                overworldTargetPos = { x: safeGoal.x, z: safeGoal.z };
                const dy = Math.max(0.0, groundHeightAt(safeGoal.x, safeGoal.z)) + 0.14;
                destRing.position.set(safeGoal.x, dy, safeGoal.z);
                (destRing.material as THREE.MeshBasicMaterial).opacity = 0.95;
                marchPathDirty = true;
              }
            }
          }
        }

        // H. Advance Player Party Movement along March Path
        let isPartyMoving = false;
        if (overworldTargetPos && overworldWaypoints.length > 0 && worldSimDt > 0) {
          const wp = overworldWaypoints[0];
          const dx = wp.x - playerOverworldX;
          const dz = wp.z - playerOverworldZ;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.85) {
            const step = Math.min(dist, effectivePartySpeed * worldSimDt);
            const moveRes = stepAlongLandOnly(
              playerOverworldX,
              playerOverworldZ,
              wp.x,
              wp.z,
              step,
            );
            if (!moveRes.blocked) {
              isPartyMoving = true;
              marchPathDirty = true;
              playerOverworldX = THREE.MathUtils.clamp(moveRes.x, -520, 520);
              playerOverworldZ = THREE.MathUtils.clamp(moveRes.z, -390, 390);
              playerOverworldFacing = moveRes.facing;
              walkPhase += worldSimDt * 5.8 * bannerlordSpeed.terrainMultiplier;
              // Haritada hareket ederken gerçekçi at nalı / yürüyüş ritmi çal
              const hasMount =
                Boolean(camp.equipment?.MOUNT && !camp.equipment.MOUNT.includes('Yok')) ||
                camp.roster.cavalry > 0;
              sound.playMapStep(hasMount, timeScale);
            } else {
              overworldWaypoints.shift();
              marchPathDirty = true;
            }
          } else {
            overworldWaypoints.shift();
            marchPathDirty = true;
          }

          // Handle completion of static waypoint chain (for non-Lord targets)
          if (overworldWaypoints.length === 0 && !followingLordId) {
            overworldTargetPos = null;
            (destRing.material as THREE.MeshBasicMaterial).opacity = 0;
            marchPathDirty = true;
            if (pendingTarget?.type === 'settlement') {
              const s = stateRef.current.campaign.settlements.find(
                (item) => item.id === pendingTarget!.id,
              );
              if (s) {
                const arrivalRadius = getSettlementArrivalRadius(s.type);
                const dist = Math.hypot(s.x - playerOverworldX, s.z - playerOverworldZ);
                if (dist <= arrivalRadius + 1.2) {
                  stateRef.current.onSetTimeScale?.(0);
                  stateRef.current.onOpenSettlement(s);
                }
              }
              pendingTarget = null;
            }
          }
        }

        // I. Proximity Arrival Check for Automatic Settlement Entry & Lord Encounter
        if (pendingTarget) {
          let reached = false;
          if (pendingTarget.type === 'settlement') {
            const s = stateRef.current.campaign.settlements.find(
              (item) => item.id === pendingTarget!.id,
            );
            if (s) {
              const arrivalRadius = getSettlementArrivalRadius(s.type);
              const dist = Math.hypot(s.x - playerOverworldX, s.z - playerOverworldZ);
              if (dist <= arrivalRadius) {
                reached = true;
                stateRef.current.onOpenSettlement(s);
              }
            }
          } else if (pendingTarget.type === 'lord') {
            const l = stateRef.current.campaign.lords.find(
              (item) => item.id === pendingTarget!.id,
            );
            if (l) {
              const route = lordLiveRoutes.get(l.id);
              const lx = route ? route.x : l.x;
              const lz = route ? route.z : l.z;
              const dist = Math.hypot(lx - playerOverworldX, lz - playerOverworldZ);
              if (dist <= INTERCEPT_RADIUS) {
                reached = true;
                encounterCooldowns.set(l.id, elapsedTotal + ENCOUNTER_COOLDOWN_SEC);
                if (isHostileToPlayer(l) && stateRef.current.onHostileEncounter) {
                  const info = classifyEncounterScenario(l, camp);
                  stateRef.current.onHostileEncounter(l, info.scenario);
                } else {
                  stateRef.current.onOpenDiplomacy(l);
                }
              }
            }
          }
          if (reached) {
            stateRef.current.onSetTimeScale?.(0);
            followingLordId = null;
            pendingTarget = null;
            overworldTargetPos = null;
            overworldWaypoints = [];
            (destRing.material as THREE.MeshBasicMaterial).opacity = 0;
            marchPathDirty = true;
          }
        }

        // I-2. Bannerlord Automatic Hostile Interception (Düşman lord veya haydut oyuncuyu yakaladığında!)
        if (!isWorldEffectivelyPaused && !activeTalkingLordId) {
          for (let i = 0; i < camp.lords.length; i++) {
            const l = camp.lords[i];
            if (!isHostileToPlayer(l)) continue;
            if ((encounterCooldowns.get(l.id) ?? 0) > elapsedTotal) continue;

            const route = lordLiveRoutes.get(l.id);
            const lx = route ? route.x : l.x;
            const lz = route ? route.z : l.z;
            const dist = Math.hypot(lx - playerOverworldX, lz - playerOverworldZ);

            if (dist <= INTERCEPT_RADIUS) {
              encounterCooldowns.set(l.id, elapsedTotal + ENCOUNTER_COOLDOWN_SEC);
              // Yakalama sonrası iç içe geçmeyi önlemek için düşmanı güvenli temas sınırında tut
              if (route) {
                const dx = lx - playerOverworldX;
                const dz = lz - playerOverworldZ;
                const len = Math.hypot(dx, dz) || 1;
                route.x = playerOverworldX + (dx / len) * (INTERCEPT_RADIUS + 0.6);
                route.z = playerOverworldZ + (dz / len) * (INTERCEPT_RADIUS + 0.6);
                route.waypoints = [];
              }
              stateRef.current.onSetTimeScale?.(0);
              followingLordId = null;
              pendingTarget = null;
              overworldTargetPos = null;
              overworldWaypoints = [];
              (destRing.material as THREE.MeshBasicMaterial).opacity = 0;
              marchPathDirty = true;

              const info = classifyEncounterScenario(l, camp);
              if (stateRef.current.onHostileEncounter) {
                stateRef.current.onHostileEncounter(l, info.scenario);
              } else {
                stateRef.current.onOpenDiplomacy(l);
              }
              break;
            }
          }
        }

        if (isFollowingPlayer) {
          const safe = clampCameraFocus(playerOverworldX, playerOverworldZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        }

        updateMarchPathGeometry();

        const py = Math.max(0.15, groundHeightAt(playerOverworldX, playerOverworldZ));
        overworldPlayer.root.position.set(playerOverworldX, py, playerOverworldZ);
        overworldPlayer.root.rotation.y = playerOverworldFacing;
        overworldPlayer.bodyGroup.position.y = isPartyMoving
          ? Math.abs(Math.sin(walkPhase)) * 0.14
          : 0;

        // Animate Settlement Flags using pre-cached handles (skip micro flag wave at macro zoom > 240m)
        const animateFlags = camZoomDist <= 240;
        for (let i = 0; i < camp.settlements.length; i++) {
          const s = camp.settlements[i];
          const handle = settlementFlagHandles.get(s.id);
          if (handle) {
            if (animateFlags) {
              handle.flag.rotation.y = Math.sin(elapsedTotal * 3 + s.x) * 0.22;
            }
            if (handle.lastFaction !== s.faction) {
              handle.lastFaction = s.faction;
              (handle.flag.material as THREE.MeshStandardMaterial).color.setHex(
                FACTION_INFO[s.faction].hex,
              );
            }
          }
        }

        // Smooth Exponential Damping for Bannerlord Strategic Map Camera (Focus XZ, Focus Y, Yaw, Zoom)
        const camDamp = isHeadless ? 1 : 1 - Math.exp(-11.0 * dt);
        camFocusX = THREE.MathUtils.lerp(camFocusX, targetCamFocusX, camDamp);
        camFocusZ = THREE.MathUtils.lerp(camFocusZ, targetCamFocusZ, camDamp);
        camYaw = THREE.MathUtils.lerp(camYaw, targetCamYaw, camDamp);
        camZoomDist = THREE.MathUtils.lerp(camZoomDist, targetCamZoomDist, camDamp);

        const targetFocusY = Math.max(0, groundHeightAt(camFocusX, camFocusZ));
        camFocusY = THREE.MathUtils.lerp(camFocusY, targetFocusY, camDamp);

        // Disable real-time directional shadow pass at macro continental zoom (> 290m) to save GPU vertex bandwidth
        if (!isHeadless) {
          const wantShadows = camZoomDist <= 290;
          if (sunLight.castShadow !== wantShadows) {
            sunLight.castShadow = wantShadows;
          }
        }

        const camPose = computeBannerlordCameraTransform(
          camFocusX,
          camFocusY,
          camFocusZ,
          camYaw,
          camZoomDist,
        );

        camera.position.set(camPose.camX, camPose.camY, camPose.camZ);
        _camTarget.set(camPose.lookX, camPose.lookY, camPose.lookZ);
        camera.lookAt(_camTarget);
        camera.updateMatrixWorld();

        // Check proximity to settlements & visible lords
        let nearestSettlement: Settlement | null = null;
        let minSettleDist = 13.0;
        for (let i = 0; i < camp.settlements.length; i++) {
          const s = camp.settlements[i];
          const d = Math.hypot(s.x - playerOverworldX, s.z - playerOverworldZ);
          if (d < minSettleDist) {
            minSettleDist = d;
            nearestSettlement = s;
          }
        }

        let nearestLord: LordAgent | null = null;
        let minLordDist = 11.5;
        for (let i = 0; i < camp.lords.length; i++) {
          const l = camp.lords[i];
          const route = lordLiveRoutes.get(l.id);
          const lx = route ? route.x : l.x;
          const lz = route ? route.z : l.z;
          const d = Math.hypot(lx - playerOverworldX, lz - playerOverworldZ);
          if (d < minLordDist) {
            minLordDist = d;
            nearestLord = l;
          }
        }

        // 60 FPS Zero-Reflow Direct DOM Label Updates (Hidden during dialogue/settlement modals so names never clutter conversation screen!)
        const wantLabelsVisible = !isDialogueOpen && !isSettlementModalOpen;
        const targetDisplay = wantLabelsVisible ? 'block' : 'none';
        if (labelOverlay.style.display !== targetDisplay) {
          labelOverlay.style.display = targetDisplay;
        }
        const cw = cachedCanvasWidth;
        const ch = cachedCanvasHeight;
        const scoutRadius = playerSpottingRange * 1.15;
        // Kuşatma yalnız kurulu kamplarda görünür (emir alıp yola çıkan ordu
        // henüz kamp kurmadı). Ayrıca uzaktan yalnız rozet görünür; kamp/ motor
        // detayları Bannerlord'daki gibi yakın zoom'da belirir.
        const besiegedIds = besiegedSettlementIdSet(camp);
        const showSiegeCamp = camZoomDist <= 320;
        const showSiegeDetails = camZoomDist <= 175;

        for (let i = 0; i < settlementLabelRecords.length; i++) {
          const rec = settlementLabelRecords[i];
          const s = camp.settlements[i] ?? rec.settlement;

          // Staggered 3D Village/Castle Mesh LOD culling (only mutates visible flag when changed)
          if (rec.sMesh) {
            const wantMeshVis = camZoomDist <= rec.meshCullDist;
            if (rec.meshVisible !== wantMeshVis) {
              rec.meshVisible = wantMeshVis;
              rec.sMesh.visible = wantMeshVis;
            }
          }

          // Settlement Label LOD: Hide villages at mid zoom (>190) and castles at far zoom (>380)
          if (!isSettlementLabelVisible(s.type, camZoomDist)) {
            if (rec.visible) {
              rec.visible = false;
              rec.el.style.display = 'none';
            }
            continue;
          }

          _projVec.set(s.x, rec.worldY, s.z).project(camera);
          if (
            _projVec.z < -1 ||
            _projVec.z > 1 ||
            Math.abs(_projVec.x) > 1.05 ||
            Math.abs(_projVec.y) > 1.05
          ) {
            if (rec.visible) {
              rec.visible = false;
              rec.el.style.display = 'none';
            }
            continue;
          }

          // Information Restriction: Show exact garrison only when within scouting range (or player-owned)
          if (rec.gSpan) {
            const scouted =
              s.faction === 'player' ||
              isWithinSpottingRange(playerOverworldX, playerOverworldZ, s.x, s.z, scoutRadius);
            const expectedText = scouted ? String(s.garrison) : '?';
            if (rec.lastText !== expectedText) {
              rec.lastText = expectedText;
              rec.gSpan.textContent = expectedText;
            }
          }

          // Fetih sonrası harita etiketi yeni sahibin rengini alır (Faz 11).
          if (rec.lastFaction !== s.faction) {
            rec.lastFaction = s.faction;
            if (rec.bannerEl) {
              rec.bannerEl.style.backgroundColor = FACTION_INFO[s.faction].color;
              rec.bannerEl.setAttribute('data-faction', s.faction);
            }
          }

          const isBesieged = besiegedIds.has(s.id);
          const showCampHere = isBesieged && showSiegeCamp;
          const campRing = siegeCampRings.get(s.id);
          if (showCampHere && campRing) {
            if (!campRing.userData.staticCampBuilt) {
              const besiegerLord = camp.lords.find(
                (lord) =>
                  lord.order?.kind === 'SIEGE' &&
                  lord.order.targetSettlementId === s.id,
              );
              const liveBesieger = besiegerLord
                ? lordLiveRoutes.get(besiegerLord.id)
                : null;
              const playerIsBesieging =
                camp.playerSiege?.settlementId === s.id && !camp.playerSiege.inside;
              const campX = playerIsBesieging
                ? playerOverworldX
                : (liveBesieger?.x ?? besiegerLord?.x ?? s.x + 1);
              const campZ = playerIsBesieging
                ? playerOverworldZ
                : (liveBesieger?.z ?? besiegerLord?.z ?? s.z);
              const facingAngle = Math.atan2(campZ - s.z, campX - s.x);
              const factionColor = playerIsBesieging
                ? FACTION_INFO.player.hex
                : FACTION_INFO[besiegerLord?.faction ?? 'player'].hex;
              addStaticSiegeCampVisuals(campRing, facingAngle, factionColor);
              campRing.userData.siegeFacingAngle = facingAngle;
              campRing.userData.staticCampBuilt = true;
            }
            if (!campRing.visible) campRing.visible = true;
            const facingAngle = (campRing.userData.siegeFacingAngle as number | undefined) ?? 0;
            const engines = s.siegeEngines ?? [];
            const engineSignature = engines.join('|');
            if (campRing.userData.engineSignature !== engineSignature) {
              const oldEngineGroup = campRing.userData.engineGroup as THREE.Group | undefined;
              if (oldEngineGroup) {
                campRing.remove(oldEngineGroup);
                disposeSiegeEngineModel(oldEngineGroup);
              }
              const engineGroup = createSiegeEngineGroup(engines, facingAngle);
              campRing.add(engineGroup);
              campRing.userData.engineGroup = engineGroup;
              campRing.userData.engineSignature = engineSignature;
              const frameGroups = campRing.userData.siegeSlotFrames as THREE.Group[] | undefined;
              const filledSlots = siegeEngineSlots(engines);
              frameGroups?.forEach((frame, index) => {
                frame.visible = !filledSlots[index];
              });
            }
            if (rec.siegeEngineSignature !== engineSignature) {
              rec.siegeMarkers.forEach(({ element }) => element.remove());
              rec.siegeMarkers = [];
              const slots = siegeEngineSlots(engines);
              slots.forEach((engine, slotIndex) => {
                if (!engine) return;
                const { offset, radius } = SIEGE_SLOT_SPECS[slotIndex];
                const angle = facingAngle + offset;
                const x = s.x + Math.cos(angle) * radius;
                const z = s.z + Math.sin(angle) * radius;
                const glyphs: Record<typeof engine, string> = {
                  TREBUCHET: '⌁',
                  MANGONEL: '⌃',
                  BALLISTA: '➶',
                  BATTERING_RAM: '◆',
                  SIEGE_TOWER: '▥',
                };
                const marker = createSiegeMapMarker(glyphs[engine], 'engine');
                marker.x = x;
                marker.y = groundHeightAt(x, z) + (engine === 'SIEGE_TOWER' ? 4.3 : 3.1);
                marker.z = z;
                labelOverlay.appendChild(marker.element);
                rec.siegeMarkers.push(marker);
              });
              for (const [wallIndex, side] of [-1, 1].entries()) {
                const radialX = Math.cos(facingAngle);
                const radialZ = Math.sin(facingAngle);
                const tangentX = -radialZ;
                const tangentZ = radialX;
                const x = s.x + radialX * 5.8 + tangentX * side * 4.3;
                const z = s.z + radialZ * 5.8 + tangentZ * side * 4.3;
                const marker = createSiegeMapMarker('▥', 'wall');
                marker.element.dataset.wallIndex = String(wallIndex);
                marker.x = x;
                marker.y = groundHeightAt(x, z) + 6.4;
                marker.z = z;
                labelOverlay.appendChild(marker.element);
                rec.siegeMarkers.push(marker);
              }
              rec.siegeEngineSignature = engineSignature;
            }
            const wallSections = getWallSections(s);
            rec.siegeMarkers.forEach((marker) => {
              if (marker.element.dataset.role === 'siege-wall-health' && marker.fill) {
                const wallIndex = Number(marker.element.dataset.wallIndex ?? 0);
                const wallHealth = wallSections[wallIndex] ?? 100;
                const healthColor =
                  wallHealth < 25 ? '#ef4444' : wallHealth < 50 ? '#facc15' : '#4ade80';
                const nextWidth = `${wallHealth}%`;
                if (marker.fill.style.width !== nextWidth) {
                  marker.fill.style.width = nextWidth;
                }
                if (marker.fill.style.backgroundColor !== healthColor) {
                  marker.fill.style.backgroundColor = healthColor;
                }
              }
              _projVec.set(marker.x, marker.y, marker.z).project(camera);
              const markerOnScreen =
                showSiegeDetails &&
                _projVec.z >= -1 &&
                _projVec.z <= 1 &&
                Math.abs(_projVec.x) <= 1.05 &&
                Math.abs(_projVec.y) <= 1.05;
              if (!markerOnScreen) {
                marker.element.style.display = 'none';
                return;
              }
              const markerX = Math.round(((_projVec.x + 1) / 2) * cw);
              const markerY = Math.round(((-_projVec.y + 1) / 2) * ch);
              if (marker.element.style.display !== 'flex') {
                marker.element.style.display = 'flex';
              }
              const nextTransform = `translate3d(${markerX}px, ${markerY}px, 0) translate(-50%, -50%)`;
              if (marker.element.style.transform !== nextTransform) {
                marker.element.style.transform = nextTransform;
              }
            });
            const t = performance.now() * 0.0015;
            campRing.children.forEach((child, index) => {
              if (!child.userData.siegeSmoke) return;
              const smokeIndex = (child.userData.smokeIndex as number | undefined) ?? index;
              const baseY = (child.userData.baseY as number) ?? 1.6;
              const stagger = (smokeIndex % 3) * 0.38;
              child.position.y = baseY + ((t * 0.55 + stagger) % 2.2);
            });
          } else if (campRing?.visible) {
            campRing.visible = false;
            hideSiegeMapMarkers(rec.siegeMarkers);
          } else if (!showCampHere) {
            hideSiegeMapMarkers(rec.siegeMarkers);
          }
          if (rec.lastBesieged !== isBesieged) {
            rec.lastBesieged = isBesieged;
            if (rec.siegeBadgeEl) {
              rec.siegeBadgeEl.style.display = isBesieged ? 'inline' : 'none';
            }
          }

          const sx = Math.round(((_projVec.x + 1) / 2) * cw);
          const screenY = Math.round(((-_projVec.y + 1) / 2) * ch);
          if (!rec.visible) {
            rec.visible = true;
            rec.el.style.display = 'flex';
          }
          if (rec.lastSx !== sx || rec.lastSy !== screenY) {
            rec.lastSx = sx;
            rec.lastSy = screenY;
            rec.el.style.transform = `translate3d(${sx}px, ${screenY}px, 0) translate(-50%, -100%)`;
          }
        }

        // Project Lord Coat-of-Arms & Troop Count DIRECTLY UNDERNEATH (tam altında) each visible Lord's horse!
        for (let i = 0; i < camp.lords.length; i++) {
          const l = camp.lords[i];
          const rec = lordLabelRecords.get(l.id);
          if (!rec) continue;
          const route = lordLiveRoutes.get(l.id);
          const lx = route ? route.x : l.x;
          const lz = route ? route.z : l.z;
          const siegeSettle =
            l.order?.kind === 'SIEGE' && l.order.targetSettlementId
              ? camp.settlements.find((s) => s.id === l.order?.targetSettlementId)
              : undefined;
          const siegeLabelInSight =
            siegeSettle !== undefined &&
            (camp.playerSiege?.settlementId === siegeSettle.id ||
              isWithinSpottingRange(
                playerOverworldX,
                playerOverworldZ,
                siegeSettle.x,
                siegeSettle.z,
                playerSpottingRange * 1.15,
              ));
          const inSight =
            camZoomDist <= 260 &&
            (siegeLabelInSight ||
              isWithinSpottingRange(
                playerOverworldX,
                playerOverworldZ,
                lx,
                lz,
                playerSpottingRange,
              ));
          if (!inSight) {
            if (rec.visible) {
              rec.visible = false;
              rec.el.style.display = 'none';
            }
            continue;
          }
          const ly = (route?.cachedY ?? groundHeightAt(lx, lz)) - 0.15;
          _projVec.set(lx, ly, lz).project(camera);
          if (
            _projVec.z < -1 ||
            _projVec.z > 1 ||
            Math.abs(_projVec.x) > 1.05 ||
            Math.abs(_projVec.y) > 1.05
          ) {
            if (rec.visible) {
              rec.visible = false;
              rec.el.style.display = 'none';
            }
            continue;
          }
          if (rec.troopSpan) {
            const intel = getLordDetailedIntel(l, lx, lz);
            const statePrefix =
              route?.tacticalState === 'PURSUE'
                ? '⚔️ '
                : route?.tacticalState === 'FLEE'
                  ? '🏃 '
                  : '';
            const expectedHtml = `${statePrefix}${intel.totalHealthy}${intel.wounded > 0 ? `<span class="text-[10px] text-[#fb923c]">+${intel.wounded}</span>` : ''}`;
            if (rec.lastHtml !== expectedHtml) {
              rec.lastHtml = expectedHtml;
              rec.troopSpan.innerHTML = expectedHtml;
            }
            rec.troopSpan.className = `font-display font-extrabold text-[12px] ${
              route?.tacticalState === 'PURSUE'
                ? 'text-[#f87171]'
                : route?.tacticalState === 'FLEE'
                  ? 'text-[#fbbf24]'
                  : l.isAtWarWithPlayer || l.faction === 'bandits'
                    ? 'text-[#fca5a5]'
                    : 'text-[#86efac]'
            } hud-stroke tracking-tight`;
          }
          const sx = Math.round(((_projVec.x + 1) / 2) * cw);
          const sy = Math.round(((-_projVec.y + 1) / 2) * ch);
          if (!rec.visible) {
            rec.visible = true;
            rec.el.style.display = 'flex';
          }
          if (rec.lastSx !== sx || rec.lastSy !== sy) {
            rec.lastSx = sx;
            rec.lastSy = sy;
            rec.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, 6px)`;
          }
        }

        // Project Player Coat-of-Arms & Troop Count DIRECTLY UNDERNEATH (tam altında) the Player's horse!
        const ppy = py - 0.15;
        _projVec.set(playerOverworldX, ppy, playerOverworldZ).project(camera);
        if (
          _projVec.z >= -1 &&
          _projVec.z <= 1 &&
          Math.abs(_projVec.x) <= 1.05 &&
          Math.abs(_projVec.y) <= 1.05
        ) {
          const sx = Math.round(((_projVec.x + 1) / 2) * cw);
          const sy = Math.round(((-_projVec.y + 1) / 2) * ch);
          if (!playerLabelVisible) {
            playerLabelVisible = true;
            playerPartyEl.style.display = 'flex';
          }
          if (playerLabelLastSx !== sx || playerLabelLastSy !== sy) {
            playerLabelLastSx = sx;
            playerLabelLastSy = sy;
            playerPartyEl.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, 6px)`;
          }
          if (playerPartyCountSpan) {
            const expectedPlayerText =
              camp.prisoners > 0 ? `${totalTroops}+${camp.prisoners}e` : String(totalTroops);
            if (playerLabelLastText !== expectedPlayerText) {
              playerLabelLastText = expectedPlayerText;
              playerPartyCountSpan.textContent = expectedPlayerText;
            }
          }
        } else if (playerLabelVisible) {
          playerLabelVisible = false;
          playerPartyEl.style.display = 'none';
        }

        // Sync campaign HUD telemetry for bottom dock (throttled during active zoom to avoid React render contention)
        const isActivelyZooming = Math.abs(targetCamZoomDist - camZoomDist) > 1.5;
        hudSyncTimer += dt;
        if (hudSyncTimer >= (isActivelyZooming ? 0.18 : 0.1)) {
          hudSyncTimer = 0;
          const followedLordObj = followingLordId
            ? camp.lords.find((item) => item.id === followingLordId)
            : null;
          const targetSettleObj =
            pendingTarget?.type === 'settlement'
              ? camp.settlements.find((item) => item.id === pendingTarget!.id)
              : null;

          stateRef.current.onUpdatePlayerPos(
            playerOverworldX,
            playerOverworldZ,
            nearestSettlement,
            nearestLord,
            {
              focusX: Math.round(camFocusX),
              focusZ: Math.round(camFocusZ),
              zoomDist: Math.round(camZoomDist),
              yawDeg: Math.round(((camYaw * 180) / Math.PI) % 360),
              isFollowingPlayer,
              biomeLabel: bannerlordSpeed.terrainLabel || speedInfo.statusLabel,
              partySpeed: bannerlordSpeed.finalSpeed,
              spottingRange: playerSpottingRange,
              followingLordName: followedLordObj
                ? `${followedLordObj.title} ${followedLordObj.name}`
                : null,
              targetSettlementName: targetSettleObj ? targetSettleObj.name : null,
              onRoad: bannerlordSpeed.onRoad,
              isMoving: isPartyMoving,
              labels: [],
            },
          );
        }
      }

      keysJustPressed.clear();
      mouseLeftJustPressed = false;
      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearInputs);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      renderer.dispose();
      if (container.contains(labelOverlay)) {
        container.removeChild(labelOverlay);
      }
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="world-canvas-container"
      className="fixed inset-0 w-full h-full overflow-hidden z-0"
    />
  );
};
