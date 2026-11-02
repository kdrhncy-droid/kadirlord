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
  getPlayerPartyHeadcount,
  getTotalTroops,
  getVillagePrimaryProduction,
  getWallSections,
} from '../game/rules';
import {
  besiegedSettlementIdSet,
  getBesiegingLords,
  getSiegeCampPoint,
  getSiegeCampSlotPoint,
} from '../game/siegeEncounter';
import { getPlayerArmy } from '../game/armySystem';
import { getLordPartyStrength } from '../game/encounter';
import { getSettlementOwnerDetails } from '../game/settlementOwnership';
import { advanceSmoothCelestialHour } from '../game/uiSession';
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
  checkHostileMapInterception,
  classifyEncounterScenario,
  getPlayerPartyStrength,
  isHostileToPlayer,
} from '../game/encounter';
import {
  type DiplomacyStance,
  getDiplomacyVisualTheme,
  getLordDiplomacyStance,
  getSettlementDiplomacyStance,
} from '../game/mapDiplomacy';
import { resolveLordBanditClash } from '../game/lordBanditAi';
import {
  type MapBattleEvent,
  checkAiLordEngagements,
  tickMapBattles,
} from '../game/mapBattle';
import type {
  BattleTelemetry,
  CameraControlActions,
  MapCameraTelemetry,
  ProjectedMapLabel,
} from '../game/types';
import {
  WarriorMeshHandles,
  animateWarriorRigPose,
  createContinentalBridgesGroup,
  createContinentalForestsAndRocksGroup,
  createContinentalTerrainMesh,
  createSettlementModel,
  createStoneTextures,
  createTerrainTextures,
  createWarriorModel,
} from '../game/proceduralModels';
import { buildQuestLog } from '../game/quests';
import { sound } from '../game/sound';
import {
  type BattleMapMarker,
  type SiegeMapMarker,
  SIEGE_SLOT_SPECS,
  addStaticSiegeCampVisuals,
  createBattleMapMarker,
  createSiegeEngineGroup,
  createSiegeMapMarker,
  disposeSiegeEngineModel,
  hideSiegeMapMarkers,
  siegeEngineSlots,
} from '../game/mapSiegeVisuals';

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
  /** Şehir veya kalede "Burada bir süre bekle" modu aktifken kamerayı zarifçe döndürür. */
  isWaitingInSettlement?: boolean;
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
  onInterveneMapBattle?: (battle: MapBattleEvent) => void;
  onCampaignUpdate?: (next: CampaignState) => void;
  onToast?: (message: string) => void;
}


export const WorldCanvas: React.FC<WorldCanvasProps> = ({
  gameState,
  subMode,
  campaignTimeScale,
  campaign,
  activeDiplomacyLordId,
  activeDialogueLordId,
  activeSettlementModalId,
  isWaitingInSettlement = false,
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
  onInterveneMapBattle,
  onCampaignUpdate,
  onToast,
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
    isWaitingInSettlement,
    isRenderPaused,
    onSetTimeScale,
    onUpdatePlayerPos,
    onOpenSettlement,
    onOpenDiplomacy,
    onHostileEncounter,
    onInterveneMapBattle,
    onCampaignUpdate,
    onToast,
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
      isWaitingInSettlement,
      isRenderPaused,
      onSetTimeScale,
      onUpdatePlayerPos,
      onOpenSettlement,
      onOpenDiplomacy,
      onHostileEncounter,
      onInterveneMapBattle,
      onCampaignUpdate,
      onToast,
    };
  }, [
    gameState,
    subMode,
    campaignTimeScale,
    campaign,
    activeDiplomacyLordId,
    activeDialogueLordId,
    activeSettlementModalId,
    isWaitingInSettlement,
    isRenderPaused,
    onSetTimeScale,
    onUpdatePlayerPos,
    onOpenSettlement,
    onOpenDiplomacy,
    onHostileEncounter,
    onCampaignUpdate,
    onToast,
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
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    container.appendChild(renderer.domElement);

    let isContextLost = false;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      isContextLost = true;
      console.warn('[WorldCanvas] WebGL context geçici olarak kaybedildi.');
    };
    const handleContextRestored = () => {
      isContextLost = false;
      console.info('[WorldCanvas] WebGL context geri yüklendi.');
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

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

    /* Kervan Koruma görevi görseli (Bannerlord eşlik görevi): kervan çıkış
       köyünde bekler; oyuncu yanına varınca arkasına takılır ve hedefe dek
       izler. Görev bitince görünmez olur. Yalnızca görseldir. */
    interface CaravanFollower {
      handles: ReturnType<typeof createWarriorModel>;
      x: number;
      z: number;
    }
    const caravanFollowers: CaravanFollower[] = [];
    for (const mounted of [true, true, false, true]) {
      const handles = createWarriorModel({ factionHex: 0x8a6d3b, isMounted: mounted });
      handles.telegraphRing.visible = false;
      handles.root.scale.setScalar(1.35);
      handles.root.visible = false;
      overworldGroup.add(handles.root);
      caravanFollowers.push({
        handles,
        x: stateRef.current.campaign.playerX,
        z: stateRef.current.campaign.playerZ,
      });
    }
    let caravanPickedUp = false;
    let caravanCheckTimer = 0;
    let caravanOrigin: { x: number; z: number } | null = null;
    // Takipçilerin hâlihazırda yerleştirildiği çıkış yerleşimi; doğuş
    // konumları oyuncunun yanı olduğu için, çıkış ilk çözüldüğünde
    // oraya ışınlanırlar (yoksa harita açılır açılmaz oyuncunun yanından
    // köye koşan isimsiz figürler görünüyordu — kullanıcı bildirimi).
    let caravanPlacedFor: string | null = null;

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

    // Canlı AI-AI Meydan Muharebeleri (Bannerlord MapEvent)
    const activeMapBattles: MapBattleEvent[] = [];
    const battleMarkers = new Map<string, BattleMapMarker>();
    let lastInterventionSec = 0;

    const handleBattleMarkerClick = (b: MapBattleEvent) => {
      overworldTargetPos = { x: b.x, z: b.z };
      overworldWaypoints = computeLandPath(playerOverworldX, playerOverworldZ, b.x, b.z);
      marchPathDirty = true;
      stateRef.current.onToast?.(`⚔️ ${b.attackerName} vs ${b.defenderName} muharebesine doğru ilerleniyor...`);
    };

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
    let smoothHour = typeof stateRef.current.campaign.hour === 'number' ? stateRef.current.campaign.hour : 9;

    const _daySunColor = new THREE.Color(0xfffaed);
    const _twilightSunColor = new THREE.Color(0xff9b54);
    const _nightSunColor = new THREE.Color(0x88b0e4);

    const _dayHemiSkyColor = new THREE.Color(0xbcd4e6);
    const _twilightHemiSkyColor = new THREE.Color(0xb58363);
    const _nightHemiSkyColor = new THREE.Color(0x415f82);

    const _dayHemiGroundColor = new THREE.Color(0x3b3224);
    const _twilightHemiGroundColor = new THREE.Color(0x2d1e15);
    const _nightHemiGroundColor = new THREE.Color(0x1e2530);

    const _daySkyFogColor = new THREE.Color(0x1e384b);
    const _twilightSkyFogColor = new THREE.Color(0x28212d);
    const _nightSkyFogColor = new THREE.Color(0x152638);

    const _tempColorA = new THREE.Color();
    const _tempColorB = new THREE.Color();

    function setMarchDestination(
      tx: number,
      tz: number,
      target?: { type: 'settlement' | 'lord'; id: string },
    ) {
      if (stateRef.current.campaign.playerCaptureState?.isCaptive) {
        return;
      }
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
      isFollowingPlayer = true;

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

      const isHostile = lord.isAtWarWithPlayer || lord.faction === 'bandits';
      if (isHostile) {
        tooltipCard.style.borderColor = 'rgba(239, 68, 68, 0.85)';
        tooltipCard.style.borderTopColor = '#ef4444';
        tooltipCard.style.boxShadow = '0 0 22px rgba(220, 38, 38, 0.5), 0 10px 25px -5px rgba(0, 0, 0, 0.85)';
      } else {
        tooltipCard.style.borderColor = 'rgba(198, 161, 91, 0.70)';
        tooltipCard.style.borderTopColor = '#f59e0b';
        tooltipCard.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.85)';
      }

      // SAVAŞTA metin rozeti kullanıcı talimatıyla kaldırıldı; kırmızı çerçeve ve parlama yeterlidir.
      const statusBadge = isHostile
        ? ''
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

    let hoveredSettlementRecord: { s: Settlement; el: HTMLElement } | null = null;

    function renderSettlementTooltip(liveS: Settlement, el: HTMLElement, isAltHeld: boolean) {
      const liveFac = FACTION_INFO[liveS.faction] ?? FACTION_INFO.empire;
      const owner = getSettlementOwnerDetails(liveS, stateRef.current.campaign);
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

      const altInspectionHeader = isAltHeld
        ? `
          <div class="mb-2 p-2 rounded bg-[#2b1f14]/95 border-2 border-[#f59e0b] shadow-lg text-left">
            <div class="flex items-center justify-between text-[9px] font-mono text-[#fcd34d] font-bold uppercase tracking-wider">
              <span>MÜLK SAHİBİ (LORD / LEYDİ)</span>
              <span class="px-1 py-0.2 rounded bg-[#1f2937] text-[#86efac] text-[8px]">${owner.isPlayerOwned ? 'OYUNCU MÜLKÜ' : 'DEREBEYİ'}</span>
            </div>
            <div class="mt-1 text-[13px] font-display font-bold text-[#fef08a] flex items-center justify-between">
              <span>${owner.heroTitle ? `${owner.heroTitle} ` : ''}${owner.heroName}</span>
            </div>
            <div class="text-[10px] text-[#d6c9b1] mt-0.5">
              Yönetici Klan: <span class="text-[#fde68a] font-semibold">${owner.clanName}</span>
            </div>
            <div class="text-[9px] text-[#9ca3af] mt-0.5">
              Bağlı Krallık: <span class="text-[#e2e8f0] font-semibold">${owner.factionName}</span>
            </div>
            ${
              liveS.type === 'VILLAGE'
                ? `<div class="mt-1 pt-1 border-t border-[#c6a15b]/25 text-[8px] text-[#fbbf24] italic">
                     Bannerlord Mülkiyet Kuralı: Köyler bağımsız alınıp verilmez, bağlı olduğu ${owner.boundParentName || 'merkez yerleşkenin'} sahibine aittir.
                   </div>`
                : ''
            }
          </div>
        `
        : '';

      const fiefLine =
        liveS.type === 'VILLAGE'
          ? `<div class="text-[9px] text-[#fde68a]/90 mt-0.5">Bağlı Mülk: <span class="font-semibold">${owner.boundParentName || liveS.boundSettlementName || 'Bağımsız'}</span></div>
             <div class="text-[9px] text-[#86efac] mt-0.5">Birincil Üretim: <span class="font-semibold">${liveProd?.name ?? 'Tahıl'}</span></div>
             <div class="text-[9px] text-[#d6c9b1] mt-0.5">Ocak (Hane): <span class="font-mono font-semibold">${liveS.hearths ?? Math.round(liveS.prosperity * 1.15)}</span> · Durum: <span class="font-semibold ${liveS.isRaided ? 'text-[#ef4444]' : 'text-[#86efac]'}">${liveS.isRaided ? 'Yağmalanmış' : 'Normal'}</span></div>`
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

      const insideLords = stateRef.current.campaign.lords.filter((lordItem) => {
        if (lordItem.characterState === 'CAPTIVE' || lordItem.characterState === 'DEAD') return false;
        if (lordItem.insideSettlementId === liveS.id) return true;
        const lPos = lordLiveRoutes.get(lordItem.id) ?? { x: lordItem.x, z: lordItem.z };
        return Math.hypot(lPos.x - liveS.x, lPos.z - liveS.z) < 4.2;
      });
      const lordsHtml =
        insideLords.length > 0
          ? `<div class="mt-1 pt-1 border-t border-[#c6a15b]/25 text-[9px] text-left">
              <span class="font-bold text-[#fde68a]">Şehirdeki Soylular (${insideLords.length}):</span>
              <div class="text-[#e2e8f0] font-mono mt-0.5 max-h-16 overflow-y-auto">
                ${insideLords.map((l) => `${l.title} ${l.name} (${l.armySize})`).join(', ')}
              </div>
            </div>`
          : '';

      const altPromptFooter = !isAltHeld
        ? `<div class="mt-2 pt-1 border-t border-[#c6a15b]/30 text-[9px] text-[#fcd34d] flex items-center justify-center gap-1.5 font-mono">
             <span class="px-1 py-0.2 rounded bg-[#282116] border border-[#f59e0b]/60 text-[8px] font-bold text-[#fde68a]">ALT</span>
             <span>Basılı Tut: Mülk Sahibi İncelemesi</span>
           </div>`
        : '';

      const besiegers = getBesiegingLords(stateRef.current.campaign, liveS.id);
      const isBesieged = besiegers.length > 0 || stateRef.current.campaign.playerSiege?.settlementId === liveS.id;
      const wallSecs = getWallSections(liveS);
      const siegeIntelHtml = isBesieged
        ? `
          <div class="my-1.5 p-2 rounded bg-[#380e0e]/95 border border-[#ef4444] text-left shadow-lg">
            <div class="flex items-center justify-between text-[10px] font-bold text-[#fca5a5] uppercase tracking-wider">
              <span class="flex items-center gap-1"><span>🔥</span> <span>KUŞATMA ALTINDA</span></span>
              <span class="px-1.5 py-0.5 rounded bg-[#7f1d1d] text-[#fee2e2] text-[8px] font-mono">MUHASARA</span>
            </div>
            <div class="mt-1 text-[11px] text-[#fef08a] font-semibold">
              Kuşatan: ${besiegers.map((b) => `${b.title ? `${b.title} ` : ''}${b.name} (${getTotalTroops(b.roster) || b.armySize})`).join(', ') || 'Düşman Ordusu'}
            </div>
            <div class="text-[9px] text-[#fecaca] mt-0.5">
              Savunan Garnizon: ${liveS.garrison} · Sol Sur: %${Math.round(wallSecs[0])} · Sağ Sur: %${Math.round(wallSecs[1])}
            </div>
            ${(liveS.siegeEngines ?? []).length > 0 ? `<div class="text-[8px] text-[#fde047] mt-0.5 font-mono">Kuşatma Silahları: ${(liveS.siegeEngines ?? []).join(', ')}</div>` : ''}
          </div>
        `
        : '';

      tooltipCard.innerHTML = `
        ${altInspectionHeader}
        <div class="font-display font-bold text-xs text-[#fbbf24] border-b border-[#c6a15b]/30 pb-1 mb-1.5">
          ${liveS.name} (${liveS.type === 'CASTLE' ? 'Kale' : liveS.type === 'TOWN' ? 'Şehir' : 'Köy'})
        </div>
        <div class="text-[10px] text-[#a3b19b]">
          Krallık: <span class="font-semibold text-[#fde68a]">${liveFac.name}</span> · Klan: <span class="font-semibold text-[#f8f0df]">${owner.clanName}</span>
        </div>
        ${fiefLine}
        ${siegeIntelHtml}
        ${intelHtml}
        ${lordsHtml}
        ${altPromptFooter}
      `;
      const rect = el.getBoundingClientRect();
      tooltipCard.style.transform = `translate3d(${Math.round(rect.left + rect.width / 2)}px, ${Math.round(rect.top - 8)}px, 0) translate(-50%, -100%)`;
      tooltipCard.classList.remove('hidden');
    }

    interface SettlementLabelRecord {
      settlement: Settlement;
      el: HTMLDivElement;
      gSpan: HTMLElement | null;
      boxEl: HTMLElement | null;
      nameSpan: HTMLElement | null;
      sMesh: THREE.Group | undefined;
      worldY: number;
      meshCullDist: number;
      visible: boolean;
      meshVisible: boolean;
      lastSx: number;
      lastSy: number;
      lastText: string;
      bannerEl: HTMLElement | null;
      clanBannerEl?: HTMLElement | null;
      siegeBadgeEl: HTMLElement | null;
      siegeMarkers: SiegeMapMarker[];
      siegeEngineSignature: string | null;
      lastFaction: string;
      lastBesieged: boolean;
      lastStance?: DiplomacyStance;
      lastScale?: number;
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

      const sStance = getSettlementDiplomacyStance(s, stateRef.current.campaign);
      const sTheme = getDiplomacyVisualTheme(sStance, s.faction);
      const sOwner = getSettlementOwnerDetails(s, stateRef.current.campaign);
      const isTown = s.type === 'TOWN';
      const isCastle = s.type === 'CASTLE';
      const isVillage = s.type === 'VILLAGE';
      const villageProd = isVillage ? getVillagePrimaryProduction(s) : null;

      el.innerHTML = `
        <div data-role="banner-shield" data-faction="${s.faction}" data-stance="${sStance}" style="background-color: ${sTheme.shieldBgColor}; border-color: ${sTheme.shieldBorderColor}; clip-path: polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%);"
             title="Krallık Sancağı: ${FACTION_INFO[s.faction]?.name || s.faction}"
             class="${isVillage ? 'w-4 h-5' : isCastle ? 'w-5 h-6' : 'w-6 h-7'} flex items-center justify-center border z-10 shrink-0 shadow">
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
        ${
          !isVillage
            ? `<div data-role="clan-shield" style="background-color: ${sOwner.clanBannerColor}; border-color: #fde68a; clip-path: polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%);"
                    title="Klan Sancağı: ${sOwner.clanName} (${sOwner.heroName})"
                    class="-ml-1.5 ${isCastle ? 'w-4 h-5' : 'w-5 h-6'} flex items-center justify-center border z-10 shrink-0 shadow">
                 <svg viewBox="0 0 16 16" class="w-2.5 h-2.5 fill-[#fef08a]">
                   <path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.8L3.5 15L5 9.5L1 6H6L8 1Z"/>
                 </svg>
               </div>`
            : ''
        }
        <div data-role="name-box" style="background: ${sTheme.containerBgStyle}; clip-path: polygon(0% 0%, 91% 0%, 100% 50%, 91% 100%, 0% 100%);"
             class="-ml-1 pl-2 pr-3 py-0.5 border-y ${sTheme.containerBorderClass} flex items-center gap-1.5 shadow">
          <span data-role="name-text" class="font-display font-semibold ${isVillage ? 'text-[10px]' : isCastle ? 'text-[11px]' : 'text-[12px]'} ${sTheme.nameTextClass} tracking-wide hud-stroke">
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
          <span data-role="siege-badge" style="display:none;color:#fee2e2;background:#7f1d1d;border:1px solid #ef4444;border-radius:3px;padding:1px 5px;font-size:8px;font-weight:800;letter-spacing:.04em;box-shadow:0 0 8px rgba(239,68,68,0.7);">🔥 KUŞATMA</span>
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
        hoveredSettlementRecord = { s: liveS, el };
        const isAlt = Boolean(keysHeld.has('AltLeft') || keysHeld.has('AltRight') || keysHeld.has('Alt'));
        renderSettlementTooltip(liveS, el, isAlt);
      });

      el.addEventListener('mouseleave', () => {
        if (hoveredSettlementRecord?.s.id === s.id) {
          hoveredSettlementRecord = null;
        }
        tooltipCard.classList.add('hidden');
      });

      labelOverlay.appendChild(el);
      const baseH = groundHeightAt(s.x, s.z);
      settlementLabelRecords.push({
        settlement: s,
        el,
        gSpan: el.querySelector('[data-role="garrison-count"]'),
        boxEl: el.querySelector('[data-role="name-box"]'),
        nameSpan: el.querySelector('[data-role="name-text"]'),
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
        clanBannerEl: el.querySelector('[data-role="clan-shield"]'),
        siegeBadgeEl: el.querySelector('[data-role="siege-badge"]'),
        siegeMarkers,
        siegeEngineSignature: null,
        lastFaction: s.faction,
        lastBesieged: false,
        lastStance: sStance,
        lastScale: 1.0,
      });
    });

    interface LordLabelRecord {
      id: string;
      el: HTMLDivElement;
      shieldSpan: HTMLElement | null;
      troopSpan: HTMLElement | null;
      visible: boolean;
      lastSx: number;
      lastSy: number;
      lastHtml: string;
      lastStance?: DiplomacyStance;
    }

    // Under-Foot Lord Coat-of-Arms + Troop & Wounded Nameplates (Directly underneath each Lord's horse!)
    const lordLabelRecords = new Map<string, LordLabelRecord>();
    stateRef.current.campaign.lords.forEach((l) => {
      const el = document.createElement('div');
      const lStance = getLordDiplomacyStance(l, stateRef.current.campaign);
      const lTheme = getDiplomacyVisualTheme(lStance, l.faction);

      const baseBorderClass =
        lStance === 'HOSTILE'
          ? 'bg-[#1f1010]/95 border border-[#ef4444] shadow-md shadow-red-900/40'
          : lStance === 'FRIENDLY'
            ? 'bg-[#0d1f13]/95 border border-[#22c55e] shadow-md shadow-green-900/40'
            : 'bg-[#14120e]/90 border border-[#c6a15b]/50 hover:border-[#f3d999] shadow-md';

      el.className = `absolute top-0 left-0 pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer select-none group ${baseBorderClass}`;
      el.style.contain = 'layout style';
      el.style.willChange = 'transform';
      el.setAttribute('data-testid', `map-label-${l.id}`);
      const intel = getLordDetailedIntel(l);
      const initialTroopHtml = `${intel.totalHealthy}${intel.wounded > 0 ? `<span class="text-[10px] text-[#fb923c]">+${intel.wounded}</span>` : ''}`;
      el.innerHTML = `
        <span data-role="lord-shield" style="background-color: ${lTheme.shieldBgColor}; border-color: ${lTheme.shieldBorderColor}; clip-path: polygon(0% 0%, 100% 0%, 100% 68%, 50% 100%, 0% 68%);"
              class="w-4 h-5 flex items-center justify-center border shadow shrink-0">
          <svg viewBox="0 0 16 16" class="w-2.5 h-2.5 fill-[#fde68a]">
            <path d="M8 2L10.5 6.5L15 8L10.5 9.5L8 14L5.5 9.5L1 8L5.5 6.5L8 2Z"/>
          </svg>
        </span>
        <span data-role="lord-troops" class="font-display font-extrabold text-[12px] ${
          lStance === 'HOSTILE' ? 'text-[#f87171]' : lStance === 'FRIENDLY' ? 'text-[#4ade80]' : 'text-[#e6d8b8]'
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
        shieldSpan: el.querySelector('[data-role="lord-shield"]'),
        troopSpan: el.querySelector('[data-role="lord-troops"]'),
        visible: true,
        lastSx: -9999,
        lastSy: -9999,
        lastHtml: initialTroopHtml,
        lastStance: lStance,
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
        ${getPlayerPartyHeadcount(stateRef.current.campaign).totalMembers}
      </span>
    `;
    const playerPartyCountSpan = playerPartyEl.querySelector('#player-party-count');
    let playerLabelVisible = true;
    let playerLabelLastSx = -9999;
    let playerLabelLastSy = -9999;
    let playerLabelLastText = String(getPlayerPartyHeadcount(stateRef.current.campaign).totalMembers);

    playerPartyEl.addEventListener('mouseenter', () => {
      const camp = stateRef.current.campaign;
      const headcount = getPlayerPartyHeadcount(camp);
      const pSpeed = calculateBannerlordPartySpeed({
        x: playerOverworldX,
        z: playerOverworldZ,
        totalHealthy: Math.max(1, headcount.totalHealthy),
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
          Sancak Birliği: ${headcount.totalMembers} (${headcount.totalHeroes} Kahraman · ${headcount.troops} Asker) · Esirler: ${camp.prisoners}
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

      if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
        if (hoveredSettlementRecord) {
          e.preventDefault();
          renderSettlementTooltip(hoveredSettlementRecord.s, hoveredSettlementRecord.el, true);
        }
      }

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
      if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
        if (hoveredSettlementRecord) {
          renderSettlementTooltip(hoveredSettlementRecord.s, hoveredSettlementRecord.el, false);
        }
      }
    };

    const clearInputs = () => {
      keysHeld.clear();
      keysJustPressed.clear();
      mouseLeftJustPressed = false;
      mouseRightHeld = false;
      mouseMiddleHeld = false;
      hoveredSettlementRecord = null;
      tooltipCard.classList.add('hidden');
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
      if (isContextLost || stateRef.current.isRenderPaused) {
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
        if (!Number.isFinite(camera.position.x) || !Number.isFinite(camera.position.y) || !Number.isFinite(camera.position.z)) {
          camera.position.set(camX, camY, camZ);
        } else {
          camera.position.lerp(_v1.set(camX, camY, camZ), 1 - Math.exp(-3 * dt));
        }
        _camTarget.set(-18, groundHeightAt(-18, -4) + 2.5, -4);
        camera.lookAt(_camTarget);

        try {
          renderer.render(scene, camera);
        } catch (err) {
          console.warn('[WorldCanvas] Title render hatası bastırıldı:', err);
        }
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
        if (activeTalkingLordId && activeTalkingLordId !== lastActiveTalkingLordId) {
          // Diyalog açılınca kamera lordun birliğine yakınlaşır: görüşme yüz
          // yüze olur; birlik haritada o an görünür olmasa bile Karede
          // oyuncuyla lordun birliği birlikte görünür (Bannerlord düzeni).
          const route = lordLiveRoutes.get(activeTalkingLordId);
          const lx = route?.x ?? playerOverworldX;
          const lz = route?.z ?? playerOverworldZ;
          targetCamFocusX = playerOverworldX + (lx - playerOverworldX) * 0.55;
          targetCamFocusZ = playerOverworldZ + (lz - playerOverworldZ) * 0.55;
          targetCamZoomDist = 36;
          const safe = clampCameraFocus(targetCamFocusX, targetCamFocusZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
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
          if (l.characterState === 'CAPTIVE' || l.characterState === 'DEAD') {
            const lMesh = lordMeshes.get(l.id);
            const lProxy = lordProxies.get(l.id);
            if (lMesh) lMesh.root.visible = false;
            if (lProxy) lProxy.position.set(0, -100, 0);
            return;
          }
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
            encounterCooldowns.set(l.id, elapsedTotal + Math.max(ENCOUNTER_COOLDOWN_SEC, 60));
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
              allLords: camp.lords,
              lordPositions: lordPositionsRef?.current,
              cooldowns: encounterCooldowns,
              nowSec: elapsedTotal,
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
              const isMoving =
                !isWorldEffectivelyPaused &&
                !isThisLordTalking &&
                (route.waypoints.length > 0 || (route.currentAction && !route.currentAction.includes('Bekliyor')));
              animateWarriorRigPose(lMesh, {
                speed: isMoving ? 7.6 : 0,
                time: elapsedTotal,
                phaseOffset: idx * 1.35,
                isMounted: true,
                usingRanged: false,
                shieldIntact: true,
                isBlocking: false,
                blockDirection: 'UP',
                attackPhase: 'IDLE',
                attackDirection: 'UP',
                attackProgress: 0,
                isCouchedLance: false,
              });
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

        // H. Advance Player Party Movement along March Path (or Lock to Captor Party during Captivity)
        let isPartyMoving = false;
        const playerCaptive = Boolean(camp.playerCaptureState?.isCaptive);
        if (playerCaptive && camp.playerCaptureState) {
          followingLordId = null;
          pendingTarget = null;
          overworldTargetPos = null;
          overworldWaypoints = [];
          (destRing.material as THREE.MeshBasicMaterial).opacity = 0;
          marchPathDirty = true;

          const cap = camp.playerCaptureState;
          if (cap.dungeonSettlementId) {
            const ds = camp.settlements.find((s) => s.id === cap.dungeonSettlementId);
            if (ds) {
              playerOverworldX = ds.x;
              playerOverworldZ = ds.z;
            }
          } else {
            const captorRoute = lordLiveRoutes.get(cap.captorLordId);
            const captorLord = camp.lords.find((l) => l.id === cap.captorLordId);
            if (captorRoute) {
              playerOverworldX = captorRoute.x;
              playerOverworldZ = captorRoute.z;
              playerOverworldFacing = captorRoute.rotY;
            } else if (captorLord) {
              playerOverworldX = captorLord.x;
              playerOverworldZ = captorLord.z;
            }
          }
          isFollowingPlayer = true;
        } else if (overworldTargetPos && overworldWaypoints.length > 0 && worldSimDt > 0) {
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
                if (isHostileToPlayer(l, camp) && stateRef.current.onHostileEncounter) {
                  const info = classifyEncounterScenario(l, camp, 'player');
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
          const hit = checkHostileMapInterception({
            campaign: camp,
            playerX: playerOverworldX,
            playerZ: playerOverworldZ,
            lordPositions: lordLiveRoutes,
            cooldowns: encounterCooldowns,
            nowSec: elapsedTotal,
            pursuedLordId: followingLordId,
          });
          if (hit) {
            const l = hit.lord;
            encounterCooldowns.set(l.id, elapsedTotal + ENCOUNTER_COOLDOWN_SEC);
            // Yakalama sonrası iç içe geçmeyi önlemek için düşmanı güvenli temas sınırında tut
            const route = lordLiveRoutes.get(l.id);
            if (route) {
              const dx = route.x - playerOverworldX;
              const dz = route.z - playerOverworldZ;
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

            if (stateRef.current.onHostileEncounter) {
              stateRef.current.onHostileEncounter(l, hit.scenario);
            } else {
              stateRef.current.onOpenDiplomacy(l);
            }
          }
        }

        // I-3. Canlı AI vs AI Harita Muharebeleri (Bannerlord MapEvent Sistemi)
        if (!isWorldEffectivelyPaused && timeScale > 0) {
          // A. Aktif muharebelerde zaman akışı ve canlı asker erimesi
          if (activeMapBattles.length > 0) {
            const tickOutcome = tickMapBattles({
              state: camp,
              battles: activeMapBattles,
              dt,
              timeScale,
            });

            if (tickOutcome.nextState !== camp) {
              stateRef.current.onCampaignUpdate?.(tickOutcome.nextState);
            }

            activeMapBattles.length = 0;
            activeMapBattles.push(...tickOutcome.nextBattles);

            for (const concluded of tickOutcome.concludedBattles) {
              const m = battleMarkers.get(concluded.battle.id);
              if (m) {
                m.element.remove();
                battleMarkers.delete(concluded.battle.id);
              }
              const winnerLord = camp.lords.find((l) => l.id === concluded.winnerId);
              const loserLord = camp.lords.find((l) => l.id === concluded.loserId);
              if (winnerLord && loserLord) {
                const inSight = isWithinSpottingRange(
                  playerOverworldX,
                  playerOverworldZ,
                  concluded.battle.x,
                  concluded.battle.z,
                  playerSpottingRange,
                );
                const playerFaction = camp.playerFaction || 'player';
                const involvesPlayer =
                  winnerLord.faction === playerFaction ||
                  winnerLord.faction === 'player' ||
                  loserLord.faction === playerFaction ||
                  loserLord.faction === 'player';

                if (inSight || involvesPlayer) {
                  stateRef.current.onToast?.(
                    `⚔️ Muharebe Sona Erdi: ${winnerLord.name}, ${loserLord.name} kuvvetlerini mağlup etti!`,
                  );
                }
              }
            }
          }

          // B. Yeni AI-AI orduları çarpışma tespiti
          const engRes = checkAiLordEngagements({
            state: camp,
            lordPositions: lordLiveRoutes,
            currentBattles: activeMapBattles,
            cooldowns: encounterCooldowns,
            nowSec: elapsedTotal,
            engagementRadius: INTERCEPT_RADIUS,
          });

          for (const newBat of engRes.newEvents) {
            activeMapBattles.push(newBat);
            encounterCooldowns.set(newBat.attackerId, elapsedTotal + 45);
            encounterCooldowns.set(newBat.defenderId, elapsedTotal + 45);

            // Savaşan tarafların hareketini kilitler
            const rA = lordLiveRoutes.get(newBat.attackerId);
            const rB = lordLiveRoutes.get(newBat.defenderId);
            if (rA) {
              rA.waypoints = [];
              rA.tacticalState = null;
              rA.currentAction = `Savaşta (${newBat.defenderName})`;
            }
            if (rB) {
              rB.waypoints = [];
              rB.tacticalState = null;
              rB.currentAction = `Savaşta (${newBat.attackerName})`;
            }

            const inSight = isWithinSpottingRange(
              playerOverworldX,
              playerOverworldZ,
              newBat.x,
              newBat.z,
              playerSpottingRange,
            );
            const playerFaction = camp.playerFaction || 'player';
            const attLord = camp.lords.find((l) => l.id === newBat.attackerId);
            const defLord = camp.lords.find((l) => l.id === newBat.defenderId);
            const involvesPlayer =
              attLord?.faction === playerFaction ||
              attLord?.faction === 'player' ||
              defLord?.faction === playerFaction ||
              defLord?.faction === 'player';

            if (inSight || involvesPlayer) {
              stateRef.current.onToast?.(
                `⚔️ Meydan Muharebesi: ${newBat.attackerName} (${newBat.attackerArmy}) ile ${newBat.defenderName} (${newBat.defenderArmy}) savaşa tutuştu!`,
              );
            }
          }
        }

        // I-4. Oyuncunun AI-AI Muharebesine Müdahalesi (Savaşa Katılma / Yardıma Gitme)
        if (
          !isWorldEffectivelyPaused &&
          stateRef.current.onInterveneMapBattle &&
          elapsedTotal - lastInterventionSec >= 10
        ) {
          for (const battle of activeMapBattles) {
            const dist = Math.hypot(battle.x - playerOverworldX, battle.z - playerOverworldZ);
            if (dist <= 4.2) {
              lastInterventionSec = elapsedTotal;
              stateRef.current.onSetTimeScale?.(0);
              stateRef.current.onInterveneMapBattle(battle);
              break;
            }
          }
        }

        if (isFollowingPlayer || isPartyMoving) {
          const safe = clampCameraFocus(playerOverworldX, playerOverworldZ, targetCamZoomDist);
          targetCamFocusX = safe.x;
          targetCamFocusZ = safe.z;
        }

        updateMarchPathGeometry();

        const py = Math.max(0.15, groundHeightAt(playerOverworldX, playerOverworldZ));
        overworldPlayer.root.visible = !playerCaptive;
        overworldPlayer.root.position.set(playerOverworldX, py, playerOverworldZ);
        overworldPlayer.root.rotation.y = playerOverworldFacing;
        animateWarriorRigPose(overworldPlayer, {
          speed: isPartyMoving ? 8.5 : 0,
          time: elapsedTotal,
          phaseOffset: 0,
          isMounted: true,
          usingRanged: false,
          shieldIntact: true,
          isBlocking: false,
          blockDirection: 'UP',
          attackPhase: 'IDLE',
          attackDirection: 'UP',
          attackProgress: 0,
          isCouchedLance: false,
        });

        /* Kervan takipçileri: görev aktifken çıkışta bekler, buluşunca izler */
        {
          caravanCheckTimer -= dt;
          if (caravanCheckTimer <= 0) {
            caravanCheckTimer = 1;
            const escort = buildQuestLog(camp).active.find((q) => q.kind === 'ESCORT');
            if (escort?.originSettlementId) {
              const origin = camp.settlements.find((s) => s.id === escort.originSettlementId);
              caravanOrigin = origin ? { x: origin.x, z: origin.z } : null;
              if (origin && !caravanPickedUp && caravanPlacedFor !== origin.id) {
                caravanPlacedFor = origin.id;
                caravanFollowers.forEach((f, idx) => {
                  const ang = (idx / Math.max(1, caravanFollowers.length)) * Math.PI * 2;
                  f.x = origin.x + Math.cos(ang) * 1.6;
                  f.z = origin.z + Math.sin(ang) * 1.6;
                });
              }
            } else {
              caravanOrigin = null;
              caravanPickedUp = false;
              caravanPlacedFor = null;
            }
            if (
              caravanOrigin &&
              !caravanPickedUp &&
              Math.hypot(playerOverworldX - caravanOrigin.x, playerOverworldZ - caravanOrigin.z) < 14
            ) {
              caravanPickedUp = true;
              for (const f of caravanFollowers) {
                f.x = caravanOrigin.x;
                f.z = caravanOrigin.z;
              }
            }
          }
          const caravanVisible = caravanOrigin !== null;
          let leadX = caravanPickedUp ? playerOverworldX : (caravanOrigin?.x ?? 0);
          let leadZ = caravanPickedUp ? playerOverworldZ : (caravanOrigin?.z ?? 0);
          caravanFollowers.forEach((f, idx) => {
            f.handles.root.visible = caravanVisible;
            if (!caravanVisible) return;
            const tx = leadX - Math.sin(playerOverworldFacing) * (caravanPickedUp ? 0 : idx * 0.5);
            const tz = leadZ - Math.cos(playerOverworldFacing) * (caravanPickedUp ? 0 : idx * 0.5);
            const dx = tx - f.x;
            const dz = tz - f.z;
            const dist = Math.hypot(dx, dz);
            const spacing = idx === 0 ? 3.2 : 2.4;
            if (dist > spacing) {
              const step = Math.min(dist - spacing, dt * 14);
              f.x += (dx / dist) * step;
              f.z += (dz / dist) * step;
              f.handles.root.rotation.y = Math.atan2(dx, dz);
              f.handles.bodyGroup.position.y = Math.abs(Math.sin(walkPhase + idx)) * 0.12;
            }
            f.handles.root.position.set(f.x, Math.max(0.15, groundHeightAt(f.x, f.z)), f.z);
            leadX = f.x;
            leadZ = f.z;
          });
        }

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

        // If waiting in settlement, gently orbit camera around the settlement
        if (stateRef.current.isWaitingInSettlement) {
          targetCamYaw += dt * 0.14;
        }

        // Defensive sanitization: protect against NaN propagation from fast lerps or modal transitions
        if (!Number.isFinite(targetCamFocusX)) targetCamFocusX = playerOverworldX || 0;
        if (!Number.isFinite(targetCamFocusZ)) targetCamFocusZ = playerOverworldZ || 0;
        if (!Number.isFinite(camFocusX)) camFocusX = targetCamFocusX;
        if (!Number.isFinite(camFocusZ)) camFocusZ = targetCamFocusZ;
        if (!Number.isFinite(targetCamYaw)) targetCamYaw = 0;
        if (!Number.isFinite(camYaw)) camYaw = targetCamYaw;
        if (!Number.isFinite(targetCamZoomDist) || targetCamZoomDist < 12) targetCamZoomDist = 48;
        if (!Number.isFinite(camZoomDist) || camZoomDist < 12) camZoomDist = targetCamZoomDist;

        // Smooth Exponential Damping for Bannerlord Strategic Map Camera (Focus XZ, Focus Y, Yaw, Zoom)
        const camDamp = isHeadless ? 1 : 1 - Math.exp(-11.0 * dt);
        camFocusX = THREE.MathUtils.lerp(camFocusX, targetCamFocusX, camDamp);
        camFocusZ = THREE.MathUtils.lerp(camFocusZ, targetCamFocusZ, camDamp);
        camYaw = THREE.MathUtils.lerp(camYaw, targetCamYaw, camDamp);
        camZoomDist = THREE.MathUtils.lerp(camZoomDist, targetCamZoomDist, camDamp);

        const targetFocusY = Math.max(0, groundHeightAt(camFocusX, camFocusZ));
        camFocusY = THREE.MathUtils.lerp(camFocusY, targetFocusY, camDamp);

        // Bannerlord 24-hour Celestial Day/Night Lighting Cycle (Continuous Floating-Point Sun & Shadow Kinematics)
        smoothHour = advanceSmoothCelestialHour(
          smoothHour,
          camp.hour,
          dt,
          timeScale,
          isWorldEffectivelyPaused,
        );

        const celestialPhase = (smoothHour / 24) * Math.PI * 2;
        const sunAngle = celestialPhase - Math.PI * 0.5;
        const sunElev = -Math.cos(celestialPhase); // -1 at 00:00, 0 at 06:00, +1 at 12:00, 0 at 18:00

        const sunRadius = 180;
        const sunY = Math.max(22, sunElev * 110 + 32);
        const sunX = Math.cos(sunAngle) * sunRadius;
        const sunZ = 95;
        sunLight.position.set(sunX, sunY, sunZ);

        // Continuous daylight factor (0 at moonlit night, 1 at peak midday; wide smoothstep prevents sudden brightness snaps)
        const dayFactor = THREE.MathUtils.smoothstep(sunElev, -0.38, 0.38);
        // Twilight / golden hour warmth factor (peaks around sunrise and sunset when sun is near horizon)
        const twilightFactor = Math.exp(-Math.pow(sunElev - 0.02, 2) / 0.06);

        // 1. Sun/Moon directional light color & intensity (moonlit strategic map remains clearly readable at night)
        _tempColorA.copy(_nightSunColor).lerp(_daySunColor, dayFactor);
        _tempColorB.copy(_twilightSunColor);
        sunLight.color.copy(_tempColorA).lerp(_tempColorB, twilightFactor * 0.55);
        sunLight.intensity = THREE.MathUtils.lerp(0.68, 1.42, dayFactor) + twilightFactor * 0.1;

        // 2. Hemisphere ambient light
        _tempColorA.copy(_nightHemiSkyColor).lerp(_dayHemiSkyColor, dayFactor);
        hemiLight.color.copy(_tempColorA).lerp(_twilightHemiSkyColor, twilightFactor * 0.5);

        _tempColorA.copy(_nightHemiGroundColor).lerp(_dayHemiGroundColor, dayFactor);
        hemiLight.groundColor.copy(_tempColorA).lerp(_twilightHemiGroundColor, twilightFactor * 0.5);
        hemiLight.intensity = THREE.MathUtils.lerp(0.4, 0.58, dayFactor);

        // 3. Rim light
        rimLight.intensity = THREE.MathUtils.lerp(0.2, 0.45, dayFactor);

        // 4. Sky background and Fog
        _tempColorA.copy(_nightSkyFogColor).lerp(_daySkyFogColor, dayFactor);
        (skyColor as THREE.Color).copy(_tempColorA).lerp(_twilightSkyFogColor, twilightFactor * 0.5);
        if (scene.fog) {
          (scene.fog as THREE.FogExp2).color.copy(skyColor as THREE.Color);
        }

        // 5. Directional shadow pass: keep castShadow enabled up to zoom distance 290m
        // Do NOT toggle castShadow off at night — shadow naturally fades with low sunlight intensity, avoiding GPU pipeline hitching/strobing!
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

        if (Number.isFinite(camPose.camX) && Number.isFinite(camPose.lookX)) {
          camera.position.set(camPose.camX, camPose.camY, camPose.camZ);
          _camTarget.set(camPose.lookX, camPose.lookY, camPose.lookZ);
          camera.lookAt(_camTarget);
          camera.updateMatrixWorld();
        }

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
          if (l.characterState === 'CAPTIVE' || l.characterState === 'DEAD') continue;
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

        const labelScale =
          camZoomDist > 300
            ? Number((1.0 - Math.min(0.20, ((camZoomDist - 300) / 450) * 0.20)).toFixed(2))
            : 1.0;

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

          // Diplomasi ve fetih sonrası harita etiketi rengini günceller (Bannerlord standardı: Düşman Kırmızı, Dost Yeşil)
          const sStance = getSettlementDiplomacyStance(s, camp);
          if (rec.lastFaction !== s.faction || rec.lastStance !== sStance) {
            rec.lastFaction = s.faction;
            rec.lastStance = sStance;
            const sTheme = getDiplomacyVisualTheme(sStance, s.faction);
            if (rec.bannerEl) {
              rec.bannerEl.style.backgroundColor = sTheme.shieldBgColor;
              rec.bannerEl.style.borderColor = sTheme.shieldBorderColor;
              rec.bannerEl.setAttribute('data-faction', s.faction);
              rec.bannerEl.setAttribute('data-stance', sStance);
            }
            if (rec.clanBannerEl) {
              const liveOwner = getSettlementOwnerDetails(s, camp);
              rec.clanBannerEl.style.backgroundColor = liveOwner.clanBannerColor;
            }
            if (rec.boxEl) {
              rec.boxEl.style.background = sTheme.containerBgStyle;
              rec.boxEl.className = `-ml-1 pl-2 pr-3 py-0.5 border-y ${sTheme.containerBorderClass} flex items-center gap-1.5 shadow`;
            }
            if (rec.nameSpan) {
              rec.nameSpan.className = `font-display font-semibold ${s.type === 'VILLAGE' ? 'text-[10px]' : s.type === 'CASTLE' ? 'text-[11px]' : 'text-[12px]'} ${sTheme.nameTextClass} tracking-wide hud-stroke`;
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
              if (isBesieged) {
                const besiegerLord = camp.lords.find(
                  (lord) => lord.order?.kind === 'SIEGE' && lord.order.targetSettlementId === s.id,
                );
                const bCount = besiegerLord
                  ? Math.max(1, getTotalTroops(besiegerLord.roster) || besiegerLord.armySize)
                  : 0;
                rec.siegeBadgeEl.textContent = besiegerLord
                  ? `🔥 KUŞATMA: ${besiegerLord.name} (${bCount})`
                  : '🔥 KUŞATMA';
                rec.siegeBadgeEl.style.display = 'inline-block';
                if (rec.boxEl) {
                  rec.boxEl.style.borderColor = '#ef4444';
                  rec.boxEl.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.75)';
                }
              } else {
                rec.siegeBadgeEl.style.display = 'none';
                if (rec.boxEl) {
                  rec.boxEl.style.borderColor = '';
                  rec.boxEl.style.boxShadow = '';
                }
              }
            }
          }

          const sx = Math.round(((_projVec.x + 1) / 2) * cw);
          const screenY = Math.round(((-_projVec.y + 1) / 2) * ch);
          if (!rec.visible) {
            rec.visible = true;
            rec.el.style.display = 'flex';
          }
          if (rec.lastSx !== sx || rec.lastSy !== screenY || rec.lastScale !== labelScale) {
            rec.lastSx = sx;
            rec.lastSy = screenY;
            rec.lastScale = labelScale;
            rec.el.style.transform = `translate3d(${sx}px, ${screenY}px, 0) translate(-50%, -100%) scale(${labelScale})`;
          }
        }

        // Project Lord Coat-of-Arms & Troop Count DIRECTLY UNDERNEATH (tam altında) each visible Lord's horse!
        for (let i = 0; i < camp.lords.length; i++) {
          const l = camp.lords[i];
          const rec = lordLabelRecords.get(l.id);
          if (!rec) continue;
          if (l.characterState === 'CAPTIVE' || l.characterState === 'DEAD') {
            if (rec.visible) {
              rec.visible = false;
              rec.el.style.display = 'none';
            }
            continue;
          }
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
          const lStance = getLordDiplomacyStance(l, camp);
          if (rec.lastStance !== lStance) {
            rec.lastStance = lStance;
            const lTheme = getDiplomacyVisualTheme(lStance, l.faction);
            if (rec.shieldSpan) {
              rec.shieldSpan.style.backgroundColor = lTheme.shieldBgColor;
              rec.shieldSpan.style.borderColor = lTheme.shieldBorderColor;
            }
            if (lStance === 'HOSTILE') {
              rec.el.className = 'absolute top-0 left-0 pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1f1010]/95 border border-[#ef4444] cursor-pointer select-none group shadow-md shadow-red-900/40';
            } else if (lStance === 'FRIENDLY') {
              rec.el.className = 'absolute top-0 left-0 pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0d1f13]/95 border border-[#22c55e] cursor-pointer select-none group shadow-md shadow-green-900/40';
            } else {
              rec.el.className = 'absolute top-0 left-0 pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#14120e]/90 border border-[#c6a15b]/50 hover:border-[#f3d999] cursor-pointer select-none group shadow-md';
            }
          }
          if (rec.troopSpan) {
            const intel = getLordDetailedIntel(l, lx, lz);
            const expectedHtml = `${intel.totalHealthy}${intel.wounded > 0 ? `<span class="text-[10px] text-[#fb923c]">+${intel.wounded}</span>` : ''}`;
            if (rec.lastHtml !== expectedHtml) {
              rec.lastHtml = expectedHtml;
              rec.troopSpan.innerHTML = expectedHtml;
            }
            rec.troopSpan.className = `font-display font-extrabold text-[12px] ${
              route?.tacticalState === 'PURSUE'
                ? 'text-[#f87171]'
                : route?.tacticalState === 'FLEE'
                  ? 'text-[#fbbf24]'
                  : lStance === 'HOSTILE'
                    ? 'text-[#f87171]'
                    : lStance === 'FRIENDLY'
                      ? 'text-[#4ade80]'
                      : 'text-[#e6d8b8]'
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
          !playerCaptive &&
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
            const playerMembers = getPlayerPartyHeadcount(camp).totalMembers;
            const expectedPlayerText =
              camp.prisoners > 0 ? `${playerMembers}+${camp.prisoners}e` : String(playerMembers);
            if (playerLabelLastText !== expectedPlayerText) {
              playerLabelLastText = expectedPlayerText;
              playerPartyCountSpan.textContent = expectedPlayerText;
            }
          }
        } else if (playerLabelVisible) {
          playerLabelVisible = false;
          playerPartyEl.style.display = 'none';
        }

        // Project Active AI-AI Battlefield Markers (Crossed Swords Billboards)
        const activeBattleIds = new Set(activeMapBattles.map((b) => b.id));
        for (const [bId, marker] of battleMarkers.entries()) {
          if (!activeBattleIds.has(bId)) {
            marker.element.remove();
            battleMarkers.delete(bId);
          }
        }
        for (const battle of activeMapBattles) {
          let marker = battleMarkers.get(battle.id);
          if (!marker) {
            marker = createBattleMapMarker(battle, handleBattleMarkerClick);
            labelOverlay.appendChild(marker.element);
            battleMarkers.set(battle.id, marker);
          }

          // Bannerlord Fog of War: AI-AI battles are only visible if within player scouting/spotting range
          const inSight =
            camZoomDist <= 280 &&
            isWithinSpottingRange(
              playerOverworldX,
              playerOverworldZ,
              battle.x,
              battle.z,
              playerSpottingRange,
            );

          _projVec.set(marker.x, marker.y, marker.z).project(camera);
          const onScreen =
            _projVec.z >= -1 &&
            _projVec.z <= 1 &&
            Math.abs(_projVec.x) <= 1.05 &&
            Math.abs(_projVec.y) <= 1.05;

          if (!inSight || !onScreen) {
            marker.element.style.display = 'none';
          } else {
            const nextHtml = `
              <div style="display:flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:rgba(20,14,10,0.96);border:1px solid #f59e0b;box-shadow:0 0 14px rgba(245,158,11,0.5),0 4px 10px rgba(0,0,0,0.8);cursor:pointer;white-space:nowrap;">
                <span style="font-size:13px;filter:drop-shadow(0 0 4px #f59e0b);">⚔️</span>
                <span style="color:#fef08a;font-weight:700;font-size:10px;">${battle.attackerName} (${battle.attackerArmy})</span>
                <span style="color:#ef4444;font-size:9px;font-weight:900;">VS</span>
                <span style="color:#fef08a;font-weight:700;font-size:10px;">${battle.defenderName} (${battle.defenderArmy})</span>
              </div>
            `;
            if (marker.lastHtml !== nextHtml) {
              marker.lastHtml = nextHtml;
              marker.element.innerHTML = nextHtml;
            }
            const mx = Math.round(((_projVec.x + 1) / 2) * cw);
            const my = Math.round(((-_projVec.y + 1) / 2) * ch);
            marker.element.style.display = 'flex';
            marker.element.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -100%)`;
          }
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
      try {
        renderer.render(scene, camera);
      } catch (err) {
        console.warn('[WorldCanvas] Overworld render hatası bastırıldı:', err);
      }
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
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
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
