import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArmorTier,
  CharacterRig,
  CharacterVisualOptions,
  HelmetType,
  ShieldType,
  WarHorseRig,
  WeaponType,
  applyEquipmentToRig,
  applyCosmeticsToRig,
  applyMorphDNAToRig,
  applyRiderMountedPosture,
  setRigWireframe,
  createArcheryTarget,
  createArrowMesh,
  createCharacterRig,
  createPracticeDummy,
  createTacticalBannerMesh,
  createWarHorseRig,
  deriveRigVisualOptionsFromEquipment,
  updateWarHorseAnimation,
} from '../game/characterRig';
import {
  BOW_MIN_RELEASE_DRAW,
  CharacterAnimator,
  CharacterAnimState,
  AttackDirection,
} from '../game/characterAnimator';
import {
  DivisionId,
  FireOrder,
  FormationArrangement,
  FormationOrder,
  FORMATION_ARRANGEMENT_META,
  SpatialHashGrid,
  computeFormationSlots,
  evaluateDirectionalParry,
} from '../game/tacticalFormation';
import {
  type CampaignState,
  type LordAgent,
  type Settlement,
  type TroopRoster,
  FACTION_INFO,
  getTotalTroops,
} from '../game/rules';
import type { BattleTelemetry } from '../game/types';
import {
  BATTLE_SCALE_PRESETS,
  BattleMemoryPool,
  BattleScaleId,
  PrewarmStageReport,
} from '../game/battleEnginePool';
import {
  InstancedBattleSceneHandles,
  createInstancedBattleScene,
} from '../game/instancedArmyRenderer';
import { BattlePrewarmModal } from './BattlePrewarmModal';
import { sound } from '../game/sound';
import { getLordDNA } from '../game/characterMorph';

/* ─── Interfaces ─── */

export type ArenaBattleMode = 'TRAINING' | 'DUEL' | 'SKIRMISH' | 'MASS_BATTLE';

function createLordBannerBadge(titleAndName: string, factionColor: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(18, 14, 10, 0.94)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 108, 20);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = factionColor;
    ctx.fillRect(24, 22, 18, 84);

    ctx.font = 'bold 34px serif';
    ctx.fillStyle = '#fde68a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`👑 ${titleAndName}`, 268, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.2, 1.05, 1);
  sprite.position.set(0, 3.45, 0);
  return sprite;
}

interface FlyingArrow {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  inFlight: boolean;
  spawnTime: number;
  team: 'ALLY' | 'ENEMY';
  /** Çekiş gücü 0..1 — hız ve hasarı bu belirler. */
  power: number;
}

interface FloatingText {
  id: string;
  text: string;
  color: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  createdAt: number;
}

interface SkirmishFighter {
  id: string;
  name: string;
  team: 'ALLY' | 'ENEMY';
  division: 'INFANTRY' | 'ARCHERS' | 'CAVALRY';
  rig: CharacterRig;
  animator: CharacterAnimator;
  horse?: WarHorseRig;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  hasShield: boolean;
  weaponType: WeaponType;
  attackDir: AttackDirection;
  blockDir: AttackDirection;
  aiTimer: number;
  strafeSign: number;
  respawnTimer: number;
  isLord?: boolean;
  badge?: THREE.Sprite;
}

export interface KillFeedItem {
  id: string;
  killer: string;
  victim: string;
  killerTeam: 'ALLY' | 'ENEMY';
  icon: string;
  createdAt: number;
}

export interface CharacterArenaViewProps {
  campaign?: CampaignState;
  onReturnToMap: () => void;
  onOpenMarket?: () => void;
  // Meydan & Kuşatma Birleşik Muharebe Modu
  mode?: 'ARENA' | 'FIELD' | 'SIEGE';
  targetLord?: LordAgent | null;
  targetSettlement?: Settlement | null;
  onBattleTelemetry?: (telemetry: BattleTelemetry) => void;
  onBattleComplete?: (
    victory: boolean,
    losses: Partial<TroopRoster>,
    enemiesDefeated: number,
  ) => void;
  paused?: boolean;
}

/* ─── Constants ─── */

const ARENA_RADIUS = 17;
const MASS_BATTLE_RADIUS = 46;
const MOVE_SPEED = 3.4;
const SPRINT_SPEED = 5.8;
const HORSE_WALK_SPEED = 5.6;
const HORSE_GALLOP_SPEED = 8.8;
const CAM_LOOK_HEIGHT = 1.3;
const CAM_LERP = 0.12;
const MOUSE_SENSITIVITY = 0.002;
const ARROW_SPEED = 34;
const ARROW_LIFETIME = 4000; // ms
const DMG_TEXT_LIFETIME = 2400; // ms
const ALL_DIRS: AttackDirection[] = ['up', 'down', 'left', 'right'];

/* ─── Component ─── */

export const CharacterArenaView: React.FC<CharacterArenaViewProps> = ({
  campaign,
  onReturnToMap,
  onOpenMarket,
  mode,
  targetLord,
  targetSettlement,
  onBattleTelemetry,
  onBattleComplete,
  paused,
}) => {
  const effectiveMode = mode ?? (targetSettlement ? 'SIEGE' : targetLord ? 'FIELD' : 'ARENA');
  const isFieldOrSiege = effectiveMode === 'FIELD' || effectiveMode === 'SIEGE';
  const initialBattleMode: ArenaBattleMode = isFieldOrSiege ? 'SKIRMISH' : 'DUEL';
  const initialSiegeEnabled: boolean = effectiveMode === 'SIEGE';

  const initialEquipmentVisuals = deriveRigVisualOptionsFromEquipment(
    campaign?.equipment,
    '#991b1b',
  );

  // ---- UI State (causes React re-render but NOT scene rebuild) ----
  const [weaponType, setWeaponType] = useState<WeaponType>(initialEquipmentVisuals.weaponType);
  const [shieldType, setShieldType] = useState<ShieldType>(initialEquipmentVisuals.shieldType);
  const [helmetType, setHelmetType] = useState<HelmetType>(initialEquipmentVisuals.helmetType);
  const [armorTier, setArmorTier] = useState<ArmorTier>(initialEquipmentVisuals.armorTier);
  const [factionColor, setFactionColor] = useState<string>(initialEquipmentVisuals.factionColor);
  const [hasBeard, setHasBeard] = useState<boolean>(true);

  const [controlMode, setControlMode] = useState<'INSPECTOR' | 'PLAYABLE'>('PLAYABLE');
  const [arenaBattleMode, setArenaBattleMode] = useState<ArenaBattleMode>(initialBattleMode);
  const [isMounted, setIsMounted] = useState<boolean>(isFieldOrSiege && Boolean(campaign?.equipment?.MOUNT));

  // Faz 3 & Faz 4: Mass 500v500 Battle Pool, Scale Preset & 3D Siege Assault State
  const [battleScale, setBattleScale] = useState<BattleScaleId>('EPIC_500');
  const [siegeEnabled, setSiegeEnabled] = useState<boolean>(initialSiegeEnabled);
  const [prewarmStages, setPrewarmStages] = useState<PrewarmStageReport[] | null>(null);
  const [pooledArrowsCount, setPooledArrowsCount] = useState<number>(0);
  const [pooledCorpsesCount, setPooledCorpsesCount] = useState<number>(0);
  const [siegeGateHpPct, setSiegeGateHpPct] = useState<number>(100);

  // Bannerlord Tactical Command State (Faz 2)
  const [selectedDivision, setSelectedDivision] = useState<DivisionId>('ALL');
  const [formationOrder, setFormationOrder] = useState<FormationOrder>('FOLLOW_ME');
  const [formationArrangement, setFormationArrangement] = useState<FormationArrangement>('LINE');
  const [fireOrder, setFireOrder] = useState<FireOrder>('FREE_FIRE');
  const [activeTacticalMenu, setActiveTacticalMenu] = useState<'MOVEMENT' | 'FACING' | 'FORMATION' | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [orderShout, setOrderShout] = useState<string | null>(null);
  const [battleOutcome, setBattleOutcome] = useState<{
    victory: boolean;
    enemiesDefeated: number;
    losses: Partial<TroopRoster>;
  } | null>(null);

  // Combat Telemetry HUD State
  const [playerHp, setPlayerHp] = useState<number>(100);
  const [botHp, setBotHp] = useState<number>(100);
  const [killsCount, setKillsCount] = useState<number>(0);
  const [skirmishWave, setSkirmishWave] = useState<number>(1);
  const [allyAliveCount, setAllyAliveCount] = useState<number>(4);
  const [enemyAliveCount, setEnemyAliveCount] = useState<number>(4);

  const [activeAnimLabel, setActiveAnimLabel] = useState<string>('IDLE');
  const [animSpeed, setAnimSpeed] = useState<number>(1.0);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [activeDockTab, setActiveDockTab] = useState<'ARMOR' | 'WEAPON' | 'ANIM' | 'SETTINGS'>('WEAPON');
  const [arrowCount, setArrowCount] = useState<number>(32);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [dummyHitCount, setDummyHitCount] = useState<number>(0);
  const [combatDirection, setCombatDirection] = useState<AttackDirection>('up');
  const [isAimingBow, setIsAimingBow] = useState<boolean>(false);
  const [isAttacking, setIsAttacking] = useState<boolean>(false);
  const [isBlocking, setIsBlocking] = useState<boolean>(false);

  const canvasMountRef = useRef<HTMLDivElement>(null);

  // ---- Persistent refs (survive across renders, hold 3D world state) ----
  const sceneCreatedRef = useRef(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const playerRigRef = useRef<CharacterRig | null>(null);
  const playerAnimatorRef = useRef<CharacterAnimator | null>(null);
  const playerHorseRef = useRef<WarHorseRig | null>(null);
  const tacticalBannerRef = useRef<THREE.Group | null>(null);
  const botRigRef = useRef<CharacterRig | null>(null);
  const botAnimatorRef = useRef<CharacterAnimator | null>(null);
  const skirmishGroupRef = useRef<THREE.Group | null>(null);
  const skirmishUnitsRef = useRef<SkirmishFighter[]>([]);
  const spatialGridRef = useRef(new SpatialHashGrid<SkirmishFighter & { id: string; x: number; z: number }>(3.5));
  const battlePoolRef = useRef<BattleMemoryPool>(new BattleMemoryPool());
  const instancedBattleSceneRef = useRef<InstancedBattleSceneHandles | null>(null);
  const arenaPerimeterGroupRef = useRef<THREE.Group | null>(null);
  const floorMeshRef = useRef<THREE.Mesh | null>(null);
  const dummyRef = useRef<ReturnType<typeof createPracticeDummy> | null>(null);
  const flyingArrowsRef = useRef<FlyingArrow[]>([]);
  const animIdRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

  // ---- Player movement/input refs ----
  const playerPosRef = useRef(new THREE.Vector3(0, 0, 4));
  const playerYawRef = useRef(Math.PI);
  const playerPitchRef = useRef(0);
  const playableCamDistRef = useRef(2.40);
  const playerSpeedRef = useRef(0);
  const playerHpRef = useRef(100);
  const killsCountRef = useRef(0);
  const botHpRef = useRef(100);
  const botAttackDirRef = useRef<AttackDirection>('right');
  const botBlockDirRef = useRef<AttackDirection>('up');
  const botAiTimerRef = useRef(0);
  const botRespawnTimerRef = useRef(0);
  const trampleCooldownRef = useRef(0);
  const hudSyncThrottleRef = useRef(0);

  const keysDownRef = useRef<Record<string, boolean>>({});
  const controlModeRef = useRef<'INSPECTOR' | 'PLAYABLE'>('PLAYABLE');
  const arenaBattleModeRef = useRef<ArenaBattleMode>(initialBattleMode);
  const battleScaleRef = useRef<BattleScaleId>('EPIC_500');
  const siegeEnabledRef = useRef<boolean>(initialSiegeEnabled);
  const isMountedRef = useRef<boolean>(false);
  const selectedDivisionRef = useRef<DivisionId>('ALL');
  const formationOrderRef = useRef<FormationOrder>('FOLLOW_ME');
  const formationArrangementRef = useRef<FormationArrangement>('LINE');
  const fireOrderRef = useRef<FireOrder>('FREE_FIRE');
  const activeTacticalMenuRef = useRef<'MOVEMENT' | 'FACING' | 'FORMATION' | null>(null);
  const targetLordRef = useRef<LordAgent | null>(targetLord ?? null);
  const targetSettlementRef = useRef<Settlement | null>(targetSettlement ?? null);
  const onBattleCompleteRef = useRef(onBattleComplete);
  const onBattleTelemetryRef = useRef(onBattleTelemetry);
  const pausedRef = useRef(paused ?? false);
  const shoutTimeoutRef = useRef<number>(0);
  const holdAnchorRef = useRef<{ x: number; z: number; facing: number }>({
    x: 0,
    z: 1.5,
    facing: Math.PI,
  });

  const animSpeedRef = useRef(1.0);
  const weaponTypeRef = useRef<WeaponType>(initialEquipmentVisuals.weaponType);
  const shieldTypeRef = useRef<ShieldType>(initialEquipmentVisuals.shieldType);
  const combatDirRef = useRef<AttackDirection>('up');
  const isAimingBowRef = useRef<boolean>(false);
  const isBlockingRef = useRef<boolean>(false);
  /** Nişanın başladığı an (ms) — çok erken bırakmayı ayırt etmek için. */
  const bowAimStartRef = useRef<number>(0);
  /** HUD güç çubuğu (DOM'a doğrudan yazılır, React render'ı tetiklemez). */
  const bowPowerBarRef = useRef<HTMLDivElement | null>(null);
  const bowPowerLabelRef = useRef<HTMLSpanElement | null>(null);

  // Inspector orbit refs
  const orbitRef = useRef({ azimuth: 0, polar: 0.35, distance: 5.2, dragging: false, lastX: 0, lastY: 0 });

  // Sync when campaign.equipment changes (e.g. player equips new items in Market modal)
  useEffect(() => {
    if (!campaign?.equipment) return;
    const synced = deriveRigVisualOptionsFromEquipment(campaign.equipment, factionColor);
    setWeaponType(synced.weaponType);
    setShieldType(synced.shieldType);
    setHelmetType(synced.helmetType);
    setArmorTier(synced.armorTier);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.equipment]);

  // Sync when campaign.playerMorphDNA changes (e.g. player updates character in Character Creator Studio)
  useEffect(() => {
    if (!campaign?.playerMorphDNA || !playerRigRef.current) return;
    applyMorphDNAToRig(playerRigRef.current, campaign.playerMorphDNA);
  }, [campaign?.playerMorphDNA]);

  // Keep refs in sync with state (so the animation loop reads latest values without re-mounting)
  useEffect(() => { controlModeRef.current = controlMode; }, [controlMode]);
  useEffect(() => { arenaBattleModeRef.current = arenaBattleMode; }, [arenaBattleMode]);
  useEffect(() => { battleScaleRef.current = battleScale; }, [battleScale]);
  useEffect(() => { siegeEnabledRef.current = siegeEnabled; }, [siegeEnabled]);
  useEffect(() => { isMountedRef.current = isMounted; }, [isMounted]);
  useEffect(() => { selectedDivisionRef.current = selectedDivision; }, [selectedDivision]);
  useEffect(() => { formationOrderRef.current = formationOrder; }, [formationOrder]);
  useEffect(() => { formationArrangementRef.current = formationArrangement; }, [formationArrangement]);
  useEffect(() => { fireOrderRef.current = fireOrder; }, [fireOrder]);
  useEffect(() => { activeTacticalMenuRef.current = activeTacticalMenu; }, [activeTacticalMenu]);
  useEffect(() => { targetLordRef.current = targetLord ?? null; }, [targetLord]);
  useEffect(() => { targetSettlementRef.current = targetSettlement ?? null; }, [targetSettlement]);
  useEffect(() => { onBattleCompleteRef.current = onBattleComplete; }, [onBattleComplete]);
  useEffect(() => { onBattleTelemetryRef.current = onBattleTelemetry; }, [onBattleTelemetry]);
  useEffect(() => { pausedRef.current = paused ?? false; }, [paused]);
  useEffect(() => { animSpeedRef.current = animSpeed; }, [animSpeed]);
  useEffect(() => { weaponTypeRef.current = weaponType; }, [weaponType]);
  useEffect(() => { shieldTypeRef.current = shieldType; }, [shieldType]);
  useEffect(() => { combatDirRef.current = combatDirection; }, [combatDirection]);
  useEffect(() => { killsCountRef.current = killsCount; }, [killsCount]);

  const showOrderShout = useCallback((text: string) => {
    setOrderShout(text);
    if (shoutTimeoutRef.current) window.clearTimeout(shoutTimeoutRef.current);
    shoutTimeoutRef.current = window.setTimeout(() => setOrderShout(null), 3200);
  }, []);

  const pushKillFeedEntry = useCallback((killer: string, victim: string, killerTeam: 'ALLY' | 'ENEMY', icon: string) => {
    const item: KillFeedItem = {
      id: `kf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      killer,
      victim,
      killerTeam,
      icon,
      createdAt: Date.now(),
    };
    setKillFeed((prev) => [item, ...prev].slice(0, 5));
  }, []);

  // E2E Test Harness API registration for battle and arena
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const testApi = (window as unknown as { __kadirlordTest?: Record<string, unknown> }).__kadirlordTest;
    if (testApi) {
      testApi.selectDivision = (div: string) => setSelectedDivision(div as DivisionId);
      testApi.setFormationOrder = (ord: string) => setFormationOrder(ord as FormationOrder);
      testApi.setFormationArrangement = (arr: string) => setFormationArrangement(arr as FormationArrangement);
      testApi.triggerVictory = () => {
        setBattleOutcome({
          victory: true,
          enemiesDefeated: 24,
          losses: { infantry: 1 },
        });
      };
      testApi.getBattleState = () => ({
        mode: effectiveMode,
        arenaBattleMode: arenaBattleModeRef.current,
        selectedDivision: selectedDivisionRef.current,
        formationOrder: formationOrderRef.current,
        formationArrangement: formationArrangementRef.current,
        playerHp: playerHpRef.current,
        allyAliveCount,
        enemyAliveCount,
        gateHpPct: siegeGateHpPct,
      });
    }
  });
  // NOT: `isAimingBow` yalnızca ARAYÜZ içindir. Ref'e geri yazılmaz; eskiden
  // buradaki senkron, hızlı bas-bırak sonrası ref'i "true"da bırakıp bir
  // sonraki tıklamada anında ok atılmasına yol açıyordu.

  // ── Mount / Dismount synchronization on 3D Player & WarHorseRig ──
  useEffect(() => {
    const scene = sceneRef.current;
    const playerRig = playerRigRef.current;
    const horseRig = playerHorseRef.current;
    if (!scene || !playerRig || !horseRig) return;

    if (isMounted) {
      horseRig.root.visible = true;
      horseRig.root.position.copy(playerPosRef.current);
      horseRig.root.rotation.y = playerYawRef.current;
      horseRig.riderMount.add(playerRig.root);
      playerRig.root.position.set(0, 0, 0);
      playerRig.root.rotation.set(0, 0, 0);
    } else {
      horseRig.root.visible = false;
      scene.add(playerRig.root);
      playerRig.root.position.copy(playerPosRef.current);
      playerRig.root.rotation.y = playerYawRef.current;
    }
  }, [isMounted]);

  // ── Floating damage text helper ──
  const spawnDamageText = useCallback((text: string, color: string, pos: THREE.Vector3) => {
    const newId = `dmg-${Date.now()}-${Math.random()}`;
    setFloatingTexts((prev) => [
      ...prev.slice(-8),
      {
        id: newId,
        text,
        color,
        worldX: pos.x,
        worldY: pos.y + 1.6,
        worldZ: pos.z,
        createdAt: Date.now(),
      },
    ]);
  }, []);

  // ── Issue Hold Position Banner at player's forward ground spot ──
  const issueHoldPositionOrder = useCallback(() => {
    const fwdX = Math.sin(playerYawRef.current);
    const fwdZ = Math.cos(playerYawRef.current);
    const holdX = THREE.MathUtils.clamp(playerPosRef.current.x + fwdX * 4.2, -13, 13);
    const holdZ = THREE.MathUtils.clamp(playerPosRef.current.z + fwdZ * 4.2, -13, 13);
    holdAnchorRef.current = { x: holdX, z: holdZ, facing: playerYawRef.current };
    setFormationOrder('HOLD_POSITION');
    formationOrderRef.current = 'HOLD_POSITION';
    if (tacticalBannerRef.current) {
      tacticalBannerRef.current.visible = true;
      tacticalBannerRef.current.position.set(holdX, 0, holdZ);
      tacticalBannerRef.current.rotation.y = playerYawRef.current;
    }
    spawnDamageText('SANCAK DİKİLDİ: BU KONUMU TUT!', '#facc15', new THREE.Vector3(holdX, 0.5, holdZ));
  }, [spawnDamageText]);

  // ── Spawn Authentic Campaign Armies (Full Rig Skeletons, Opposing Lord, Real Rosters) ──
  const spawnCampaignForces = useCallback((resetAllies = true) => {
    const group = skirmishGroupRef.current;
    if (!group) return;
    group.visible = true;

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
    skirmishUnitsRef.current = [];

    const pRoster: TroopRoster = campaign?.roster ?? { infantry: 14, archer: 8, cavalry: 4, horseArcher: 0 };
    const eLord = targetLordRef.current;
    const eSettlement = targetSettlementRef.current;
    const eRoster: TroopRoster = eLord?.roster ?? {
      infantry: Math.round((eSettlement?.garrison ?? 24) * 0.5),
      archer: Math.round((eSettlement?.garrison ?? 24) * 0.35),
      cavalry: Math.round((eSettlement?.garrison ?? 24) * 0.15),
      horseArcher: 0,
    };

    // Faction colors
    const playerCulture = (campaign?.heroes?.find((h) => h.id === 'player')?.culture ?? 'vlandia') as keyof typeof FACTION_INFO;
    const playerFactionColor = FACTION_INFO[playerCulture]?.color ?? '#991b1b';
    const enemyFaction = (eLord?.faction ?? eSettlement?.faction ?? 'empire') as keyof typeof FACTION_INFO;
    const enemyFactionColor = FACTION_INFO[enemyFaction]?.color ?? '#581c87';

    // Roster scaling (faithful 1:1 up to 16 models per troop category for solid 60fps)
    const allyInfCount = Math.min(16, Math.max(3, pRoster.infantry ?? 10));
    const allyArcCount = Math.min(10, Math.max(2, pRoster.archer ?? 6));
    const allyCavCount = Math.min(6, Math.max(1, pRoster.cavalry ?? 3));

    const enemyInfCount = Math.min(16, Math.max(3, eRoster.infantry ?? 10));
    const enemyArcCount = Math.min(10, Math.max(2, eRoster.archer ?? 6));
    const enemyCavCount = Math.min(6, Math.max(1, eRoster.cavalry ?? 3));

    // 1. ALLIED FORCES (Player's Real Army)
    // 1.1 Allied Infantry (Sword & Shield Ranks)
    for (let i = 0; i < allyInfCount; i++) {
      const col = (i % 7) - 3.0;
      const row = Math.floor(i / 7);
      const x = col * 2.0;
      const z = 11.0 + row * 2.0;

      const rig = createCharacterRig({
        skinTone: '#d9a17c',
        hairColor: '#2b1d12',
        factionColor: playerFactionColor,
        weaponType: 'ONE_HANDED_SWORD',
        shieldType: i % 2 === 0 ? 'ROUND_SHIELD' : 'KITE_SHIELD',
        helmetType: i % 3 === 0 ? 'SPANGENHELM' : 'KETTLE_HAT',
        armorTier: i % 2 === 0 ? 'CHAINMAIL' : 'LEATHER',
      });
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = Math.PI;
      group.add(rig.root);

      const animator = new CharacterAnimator(rig);
      skirmishUnitsRef.current.push({
        id: `ally-inf-${i}`,
        name: `${campaign?.playerName ?? 'Sancak'} Kalkanlı Piyadesi #${i + 1}`,
        team: 'ALLY',
        division: 'INFANTRY',
        rig,
        animator,
        x,
        z,
        yaw: Math.PI,
        hp: 110,
        maxHp: 110,
        alive: true,
        hasShield: true,
        weaponType: 'ONE_HANDED_SWORD',
        attackDir: ALL_DIRS[i % 4],
        blockDir: 'up',
        aiTimer: 0.2 + (i % 5) * 0.15,
        strafeSign: i % 2 === 0 ? 1 : -1,
        respawnTimer: 0,
      });
    }

    // 1.2 Allied Archers (Firing Lines Behind Infantry)
    for (let i = 0; i < allyArcCount; i++) {
      const col = (i % 6) - 2.5;
      const row = Math.floor(i / 6);
      const x = col * 2.2;
      const z = 16.5 + row * 2.0;

      const rig = createCharacterRig({
        skinTone: '#c68a62',
        hairColor: '#1c1917',
        factionColor: playerFactionColor,
        weaponType: 'BOW',
        shieldType: 'NONE',
        helmetType: 'KETTLE_HAT',
        armorTier: 'LEATHER',
      });
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = Math.PI;
      group.add(rig.root);

      const animator = new CharacterAnimator(rig);
      skirmishUnitsRef.current.push({
        id: `ally-arc-${i}`,
        name: `${campaign?.playerName ?? 'Sancak'} Keskin Nişancısı #${i + 1}`,
        team: 'ALLY',
        division: 'ARCHERS',
        rig,
        animator,
        x,
        z,
        yaw: Math.PI,
        hp: 90,
        maxHp: 90,
        alive: true,
        hasShield: false,
        weaponType: 'BOW',
        attackDir: 'up',
        blockDir: 'up',
        aiTimer: 0.5 + i * 0.2,
        strafeSign: i % 2 === 0 ? 1 : -1,
        respawnTimer: 0,
      });
    }

    // 1.3 Allied Cavalry (Mounted on WarHorses on Left Flank)
    for (let i = 0; i < allyCavCount; i++) {
      const x = -11.0 - (i % 3) * 2.4;
      const z = 12.0 + Math.floor(i / 3) * 2.6;

      const rig = createCharacterRig({
        skinTone: '#d9a17c',
        hairColor: '#3a2212',
        factionColor: playerFactionColor,
        weaponType: i % 2 === 0 ? 'SPEAR' : 'ONE_HANDED_SWORD',
        shieldType: 'KITE_SHIELD',
        helmetType: 'IMPERIAL_VISOR',
        armorTier: 'CHAINMAIL',
      });
      const horse = createWarHorseRig({
        coatColor: '#3b281a',
        factionColor: playerFactionColor,
        armoredBarding: true,
      });
      horse.root.position.set(x, 0, z);
      horse.root.rotation.y = Math.PI;
      horse.riderMount.add(rig.root);
      rig.root.position.set(0, 0, 0);
      group.add(horse.root);

      const animator = new CharacterAnimator(rig);
      skirmishUnitsRef.current.push({
        id: `ally-cav-${i}`,
        name: `${campaign?.playerName ?? 'Sancak'} Ağır Süvarisi #${i + 1}`,
        team: 'ALLY',
        division: 'CAVALRY',
        rig,
        animator,
        horse,
        x,
        z,
        yaw: Math.PI,
        hp: 145,
        maxHp: 145,
        alive: true,
        hasShield: true,
        weaponType: i % 2 === 0 ? 'SPEAR' : 'ONE_HANDED_SWORD',
        attackDir: 'down',
        blockDir: 'up',
        aiTimer: 0.3 + i * 0.2,
        strafeSign: 1,
        respawnTimer: 0,
      });
    }

    // 2. ENEMY FORCES
    // 2.1 THE OPPOSING LORD (Garios, Derthert, Rhagaea, Caladog, etc.)
    if (eLord) {
      const lordDNA = eLord.morphDNA || getLordDNA(eLord.id, eLord.faction);
      const lordRig = createCharacterRig({
        factionColor: enemyFactionColor,
        weaponType: 'ONE_HANDED_SWORD',
        shieldType: 'KITE_SHIELD',
        helmetType: 'IMPERIAL_VISOR',
        armorTier: 'PLATE',
      });
      applyMorphDNAToRig(lordRig, lordDNA);

      const lordHorse = createWarHorseRig({
        coatColor: '#1a1816',
        factionColor: enemyFactionColor,
        armoredBarding: true,
      });
      const lx = 0;
      const lz = -18.0;
      lordHorse.root.position.set(lx, 0, lz);
      lordHorse.root.rotation.y = 0;
      lordHorse.riderMount.add(lordRig.root);
      lordRig.root.position.set(0, 0, 0);
      group.add(lordHorse.root);

      // Create floating 3D crown banner above the Lord's head
      const lordBadge = createLordBannerBadge(
        `${eLord.title ? `${eLord.title} ` : 'Lord '}${eLord.name}`,
        enemyFactionColor,
      );
      lordHorse.root.add(lordBadge);

      const lordAnimator = new CharacterAnimator(lordRig);
      skirmishUnitsRef.current.push({
        id: `enemy-lord-${eLord.id}`,
        name: `${eLord.title ? `${eLord.title} ` : 'Lord '}${eLord.name}`,
        team: 'ENEMY',
        division: 'CAVALRY',
        rig: lordRig,
        animator: lordAnimator,
        horse: lordHorse,
        x: lx,
        z: lz,
        yaw: 0,
        hp: 200,
        maxHp: 200,
        alive: true,
        hasShield: true,
        weaponType: 'ONE_HANDED_SWORD',
        attackDir: 'right',
        blockDir: 'up',
        aiTimer: 0.1,
        strafeSign: 1,
        respawnTimer: 0,
        isLord: true,
        badge: lordBadge,
      });
    }

    // 2.2 Enemy Infantry (Shields, Swords & Spears)
    for (let i = 0; i < enemyInfCount; i++) {
      const col = (i % 7) - 3.0;
      const row = Math.floor(i / 7);
      const x = col * 2.0;
      const z = -22.0 - row * 2.0;

      const rig = createCharacterRig({
        skinTone: '#c68a62',
        hairColor: '#1c1917',
        factionColor: enemyFactionColor,
        weaponType: i % 3 === 0 ? 'SPEAR' : 'ONE_HANDED_SWORD',
        shieldType: 'ROUND_SHIELD',
        helmetType: i % 2 === 0 ? 'SPANGENHELM' : 'KETTLE_HAT',
        armorTier: i % 2 === 0 ? 'CHAINMAIL' : 'LEATHER',
      });
      rig.root.position.set(x, 0, z);
      rig.root.rotation.y = 0;
      group.add(rig.root);

      const animator = new CharacterAnimator(rig);
      skirmishUnitsRef.current.push({
        id: `enemy-inf-${i}`,
        name: `${eLord?.name ?? 'Düşman'} Lejyoneri #${i + 1}`,
        team: 'ENEMY',
        division: 'INFANTRY',
        rig,
        animator,
        x,
        z,
        yaw: 0,
        hp: 105,
        maxHp: 105,
        alive: true,
        hasShield: true,
        weaponType: i % 3 === 0 ? 'SPEAR' : 'ONE_HANDED_SWORD',
        attackDir: ALL_DIRS[i % 4],
        blockDir: 'up',
        aiTimer: 0.3 + (i % 5) * 0.15,
        strafeSign: i % 2 === 0 ? 1 : -1,
        respawnTimer: 0,
      });
    }

    // 2.3 Enemy Archers (On Parapet Walls in Siege, or in Formation in Field)
    const isSiege = effectiveMode === 'SIEGE';
    for (let i = 0; i < enemyArcCount; i++) {
      const col = (i % 6) - 2.5;
      const row = Math.floor(i / 6);
      const x = col * 2.2;
      const z = isSiege ? -20.8 : -26.0 - row * 2.0;
      const y = isSiege ? 5.4 : 0;

      const rig = createCharacterRig({
        skinTone: '#d9a17c',
        hairColor: '#2b1d12',
        factionColor: enemyFactionColor,
        weaponType: 'BOW',
        shieldType: 'NONE',
        helmetType: 'KETTLE_HAT',
        armorTier: 'LEATHER',
      });
      rig.root.position.set(x, y, z);
      rig.root.rotation.y = 0;
      group.add(rig.root);

      const animator = new CharacterAnimator(rig);
      skirmishUnitsRef.current.push({
        id: `enemy-arc-${i}`,
        name: isSiege ? `Sur Okçusu #${i + 1}` : `${eLord?.name ?? 'Düşman'} Okçusu #${i + 1}`,
        team: 'ENEMY',
        division: 'ARCHERS',
        rig,
        animator,
        x,
        z,
        yaw: 0,
        hp: 90,
        maxHp: 90,
        alive: true,
        hasShield: false,
        weaponType: 'BOW',
        attackDir: 'up',
        blockDir: 'up',
        aiTimer: 2.2 + (i % 5) * 0.4,
        strafeSign: i % 2 === 0 ? 1 : -1,
        respawnTimer: 0,
      });
    }

    // 2.4 Enemy Cavalry (Mounted on WarHorses on Right Flank)
    for (let i = 0; i < enemyCavCount; i++) {
      const x = 11.0 + (i % 3) * 2.4;
      const z = -20.0 - Math.floor(i / 3) * 2.6;

      const rig = createCharacterRig({
        skinTone: '#c68a62',
        hairColor: '#1c1917',
        factionColor: enemyFactionColor,
        weaponType: 'SPEAR',
        shieldType: 'KITE_SHIELD',
        helmetType: 'IMPERIAL_VISOR',
        armorTier: 'CHAINMAIL',
      });
      const horse = createWarHorseRig({
        coatColor: '#2a1a10',
        factionColor: enemyFactionColor,
        armoredBarding: true,
      });
      horse.root.position.set(x, 0, z);
      horse.root.rotation.y = 0;
      horse.riderMount.add(rig.root);
      rig.root.position.set(0, 0, 0);
      group.add(horse.root);

      const animator = new CharacterAnimator(rig);
      skirmishUnitsRef.current.push({
        id: `enemy-cav-${i}`,
        name: `${eLord?.name ?? 'Düşman'} Süvarisi #${i + 1}`,
        team: 'ENEMY',
        division: 'CAVALRY',
        rig,
        animator,
        horse,
        x,
        z,
        yaw: 0,
        hp: 145,
        maxHp: 145,
        alive: true,
        hasShield: true,
        weaponType: 'SPEAR',
        attackDir: 'down',
        blockDir: 'up',
        aiTimer: 0.3 + i * 0.2,
        strafeSign: -1,
        respawnTimer: 0,
      });
    }

    // Set initial telemetry & alive counts
    const aliveA = skirmishUnitsRef.current.filter((u) => u.team === 'ALLY' && u.alive).length;
    const aliveE = skirmishUnitsRef.current.filter((u) => u.team === 'ENEMY' && u.alive).length;
    setAllyAliveCount(aliveA);
    setEnemyAliveCount(aliveE);
    playerHpRef.current = 100;
    setPlayerHp(100);

    // Position player directly at the vanguard
    playerPosRef.current.set(0, 0, 13.5);
    playerYawRef.current = Math.PI;

    if (isMountedRef.current && playerHorseRef.current) {
      playerHorseRef.current.root.position.copy(playerPosRef.current);
      playerHorseRef.current.root.rotation.y = playerYawRef.current;
    } else if (playerRigRef.current) {
      playerRigRef.current.root.position.copy(playerPosRef.current);
      playerRigRef.current.root.rotation.y = playerYawRef.current;
    }

    if (cameraRef.current) {
      const cam = cameraRef.current;
      const initDist = isMountedRef.current ? 4.2 : 3.4;
      const fwdX = Math.sin(playerYawRef.current);
      const fwdZ = Math.cos(playerYawRef.current);
      const pivotY = playerPosRef.current.y + (isMountedRef.current ? 2.2 : 1.6);
      cam.position.set(
        playerPosRef.current.x - fwdX * initDist,
        pivotY + 0.35,
        playerPosRef.current.z - fwdZ * initDist,
      );
      cam.lookAt(
        playerPosRef.current.x + fwdX * 25,
        pivotY,
        playerPosRef.current.z + fwdZ * 25,
      );
    }

    sound.playWarhorn();
  }, [campaign?.heroes, campaign?.playerName, campaign?.roster, effectiveMode]);

  // ── Spawn / Reset Skirmish Wave Fighters ──
  const spawnSkirmishWave = useCallback((waveNumber: number, resetAllies = false) => {
    const group = skirmishGroupRef.current;
    if (!group) return;

    if (resetAllies || skirmishUnitsRef.current.length === 0) {
      // Clear all existing
      while (group.children.length > 0) {
        group.remove(group.children[0]);
      }
      skirmishUnitsRef.current = [];

      // Create 4 Allied Soldiers (2 Infantry, 1 Archer, 1 Mounted Cavalry)
      const allyDefs: Array<{
        id: string;
        name: string;
        division: 'INFANTRY' | 'ARCHERS' | 'CAVALRY';
        weapon: WeaponType;
        shield: ShieldType;
        helmet: HelmetType;
        armor: ArmorTier;
        mounted?: boolean;
        x: number;
        z: number;
      }> = [
        {
          id: 'ally-inf-1',
          name: 'Kalradya Kalkanlı Piyade',
          division: 'INFANTRY',
          weapon: 'ONE_HANDED_SWORD',
          shield: 'ROUND_SHIELD',
          helmet: 'SPANGENHELM',
          armor: 'CHAINMAIL',
          x: -2.4,
          z: 3.5,
        },
        {
          id: 'ally-inf-2',
          name: 'İmparatorluk Ağır Piyadesi',
          division: 'INFANTRY',
          weapon: 'ONE_HANDED_SWORD',
          shield: 'KITE_SHIELD',
          helmet: 'IMPERIAL_VISOR',
          armor: 'PLATE',
          x: 2.4,
          z: 3.5,
        },
        {
          id: 'ally-arc-1',
          name: 'Sancak Keskin Nişancısı',
          division: 'ARCHERS',
          weapon: 'BOW',
          shield: 'NONE',
          helmet: 'KETTLE_HAT',
          armor: 'LEATHER',
          x: -1.5,
          z: 6.2,
        },
        {
          id: 'ally-cav-1',
          name: 'Zırhlı Katafrakt Süvarisi',
          division: 'CAVALRY',
          weapon: 'SPEAR',
          shield: 'KITE_SHIELD',
          helmet: 'IMPERIAL_VISOR',
          armor: 'PLATE',
          mounted: true,
          x: 3.8,
          z: 5.2,
        },
      ];

      for (const def of allyDefs) {
        const rig = createCharacterRig({
          skinTone: '#d9a17c',
          hairColor: '#2b1d12',
          factionColor: '#991b1b',
          weaponType: def.weapon,
          shieldType: def.shield,
          helmetType: def.helmet,
          armorTier: def.armor,
        });
        const animator = new CharacterAnimator(rig);
        let horse: WarHorseRig | undefined;
        if (def.mounted) {
          horse = createWarHorseRig({
            coatColor: '#3b281a',
            factionColor: '#991b1b',
            armoredBarding: true,
          });
          horse.root.position.set(def.x, 0, def.z);
          horse.root.rotation.y = Math.PI;
          horse.riderMount.add(rig.root);
          rig.root.position.set(0, 0, 0);
          group.add(horse.root);
        } else {
          rig.root.position.set(def.x, 0, def.z);
          rig.root.rotation.y = Math.PI;
          group.add(rig.root);
        }

        skirmishUnitsRef.current.push({
          id: def.id,
          name: def.name,
          team: 'ALLY',
          division: def.division,
          rig,
          animator,
          horse,
          x: def.x,
          z: def.z,
          yaw: Math.PI,
          hp: def.mounted ? 140 : 110,
          maxHp: def.mounted ? 140 : 110,
          alive: true,
          hasShield: def.shield !== 'NONE',
          weaponType: def.weapon,
          attackDir: 'right',
          blockDir: 'up',
          aiTimer: Math.random() * 0.6,
          strafeSign: Math.random() > 0.5 ? 1 : -1,
          respawnTimer: 0,
        });
      }
    } else {
      // Remove old enemy meshes & revive/heal allies slightly
      const keptAllies: SkirmishFighter[] = [];
      for (const u of skirmishUnitsRef.current) {
        if (u.team === 'ENEMY') {
          group.remove(u.horse ? u.horse.root : u.rig.root);
        } else {
          if (!u.alive) {
            u.alive = true;
            u.hp = u.maxHp;
            u.animator.reset();
          } else {
            u.hp = Math.min(u.maxHp, u.hp + 35);
          }
          keptAllies.push(u);
        }
      }
      skirmishUnitsRef.current = keptAllies;
    }

    // Spawn 4 Enemy Raiders for this Wave
    const enemyConfigs: Array<{
      name: string;
      division: 'INFANTRY' | 'ARCHERS' | 'CAVALRY';
      weapon: WeaponType;
      shield: ShieldType;
      helmet: HelmetType;
      armor: ArmorTier;
      x: number;
      z: number;
    }> = [
      {
        name: 'Kuzeyli Kalkanlı Yağmacı',
        division: 'INFANTRY',
        weapon: 'ONE_HANDED_SWORD',
        shield: 'ROUND_SHIELD',
        helmet: 'SPANGENHELM',
        armor: waveNumber >= 2 ? 'CHAINMAIL' : 'LEATHER',
        x: -3.2,
        z: -8.5,
      },
      {
        name: 'Vlandiya Çift Elli Şövalye',
        division: 'INFANTRY',
        weapon: 'TWO_HANDED_SWORD',
        shield: 'NONE',
        helmet: 'IMPERIAL_VISOR',
        armor: waveNumber >= 2 ? 'PLATE' : 'CHAINMAIL',
        x: 0.2,
        z: -9.0,
      },
      {
        name: 'Bozkır Mızrakçısı',
        division: 'INFANTRY',
        weapon: 'SPEAR',
        shield: 'ROUND_SHIELD',
        helmet: 'KETTLE_HAT',
        armor: 'CHAINMAIL',
        x: 3.4,
        z: -8.5,
      },
      {
        name: 'Gölge Okçusu',
        division: 'ARCHERS',
        weapon: 'BOW',
        shield: 'NONE',
        helmet: 'KETTLE_HAT',
        armor: 'LEATHER',
        x: 0,
        z: -11.5,
      },
    ];

    enemyConfigs.forEach((cfg, idx) => {
      const rig = createCharacterRig({
        skinTone: '#c68a62',
        hairColor: '#1c1917',
        factionColor: '#581c87',
        weaponType: cfg.weapon,
        shieldType: cfg.shield,
        helmetType: cfg.helmet,
        armorTier: cfg.armor,
      });
      rig.root.position.set(cfg.x, 0, cfg.z);
      rig.root.rotation.y = 0;
      group.add(rig.root);

      const animator = new CharacterAnimator(rig);
      const maxHp = 85 + waveNumber * 15;
      skirmishUnitsRef.current.push({
        id: `enemy-w${waveNumber}-${idx}`,
        name: cfg.name,
        team: 'ENEMY',
        division: cfg.division,
        rig,
        animator,
        x: cfg.x,
        z: cfg.z,
        yaw: 0,
        hp: maxHp,
        maxHp,
        alive: true,
        hasShield: cfg.shield !== 'NONE',
        weaponType: cfg.weapon,
        attackDir: ALL_DIRS[idx % 4],
        blockDir: 'up',
        aiTimer: 0.4 + idx * 0.25,
        strafeSign: idx % 2 === 0 ? 1 : -1,
        respawnTimer: 0,
      });
    });

    setAllyAliveCount(skirmishUnitsRef.current.filter((u) => u.team === 'ALLY' && u.alive).length);
    setEnemyAliveCount(4);
  }, []);

  // ── Launch 500v500 Mass Battle & Siege with Ahead-of-Time Object Pool Pre-Warm Screen ──
  const launchMassBattleWithPrewarm = useCallback(
    (nextScale: BattleScaleId, nextSiege: boolean, showLoadingModal = true) => {
      const pool = battlePoolRef.current;
      const stages = pool.prewarmMemoryPages();
      pool.spawnBattleArmies(nextScale, nextSiege);

      if (instancedBattleSceneRef.current) {
        instancedBattleSceneRef.current.syncFromPool(pool);
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.compile(sceneRef.current, cameraRef.current);
      }

      const preset = BATTLE_SCALE_PRESETS[nextScale];
      setAllyAliveCount(preset.alliesCount);
      setEnemyAliveCount(preset.enemiesCount);
      setPooledArrowsCount(0);
      setPooledCorpsesCount(0);
      setSiegeGateHpPct(100);
      playerHpRef.current = 100;
      setPlayerHp(100);

      // Position player at the front of the Allied Vanguard
      playerPosRef.current.set(0, 0, 12.5);
      playerYawRef.current = Math.PI;

      if (showLoadingModal) {
        if (document.pointerLockElement) document.exitPointerLock();
        setPrewarmStages(stages);
      }
      sound.playWarhorn();
    },
    [],
  );

  // Toggle skirmish / mass battle group visibility when switching Arena Battle Mode
  useEffect(() => {
    const skirmishGroup = skirmishGroupRef.current;
    const instancedScene = instancedBattleSceneRef.current;
    const perimeterGroup = arenaPerimeterGroupRef.current;
    const floorMesh = floorMeshRef.current;
    const botRig = botRigRef.current;
    const tacticalBanner = tacticalBannerRef.current;
    if (!skirmishGroup || !botRig) return;

    if (isFieldOrSiege) {
      botRig.root.visible = false;
      skirmishGroup.visible = true;
      if (instancedScene) instancedScene.root.visible = false;
      if (perimeterGroup) perimeterGroup.visible = false;
      if (floorMesh) floorMesh.scale.set(3.5, 1, 3.5);
      spawnCampaignForces(true);
    } else if (arenaBattleMode === 'MASS_BATTLE') {
      botRig.root.visible = false;
      skirmishGroup.visible = false;
      if (instancedScene) instancedScene.root.visible = true;
      if (perimeterGroup) perimeterGroup.visible = false;
      if (floorMesh) floorMesh.scale.set(2.8, 1, 2.8);
      launchMassBattleWithPrewarm(battleScale, siegeEnabled, true);
    } else if (arenaBattleMode === 'SKIRMISH') {
      botRig.root.visible = false;
      skirmishGroup.visible = true;
      if (instancedScene) instancedScene.root.visible = false;
      if (perimeterGroup) perimeterGroup.visible = true;
      if (floorMesh) floorMesh.scale.set(1, 1, 1);
      spawnSkirmishWave(skirmishWave, true);
    } else {
      skirmishGroup.visible = false;
      if (instancedScene) instancedScene.root.visible = false;
      if (perimeterGroup) perimeterGroup.visible = true;
      if (floorMesh) floorMesh.scale.set(1, 1, 1);
      if (tacticalBanner) tacticalBanner.visible = false;
      botRig.root.visible = true;
      botHpRef.current = 100;
      setBotHp(100);
      botAnimatorRef.current?.reset();
      if (arenaBattleMode === 'TRAINING') {
        botRig.root.position.set(0, 0, -6.5);
        botAnimatorRef.current?.block('up');
      } else {
        botRig.root.position.set(0, 0, -5.5);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arenaBattleMode]);

  // ══════════════════════════════════════════════════════════════════════
  //  ONE-TIME SCENE SETUP (runs once on mount, never re-runs)
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (sceneCreatedRef.current) return;
    const container = canvasMountRef.current;
    if (!container) return;
    sceneCreatedRef.current = true;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // ---- Scene ----
    const scene = new THREE.Scene();
    if (isFieldOrSiege) {
      scene.background = new THREE.Color('#6ba3d6');
      scene.fog = new THREE.Fog('#6ba3d6', 55, 250);
    } else {
      scene.background = new THREE.Color('#0f0c09');
      scene.fog = new THREE.FogExp2('#0f0c09', 0.014);
    }
    sceneRef.current = scene;

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 140);
    const initDist = isFieldOrSiege && Boolean(campaign?.equipment?.MOUNT) ? 4.25 : 3.4;
    const initFwdX = Math.sin(playerYawRef.current);
    const initFwdZ = Math.cos(playerYawRef.current);
    const initPivotY = playerPosRef.current.y + 1.6;
    camera.position.set(
      playerPosRef.current.x - initFwdX * initDist,
      initPivotY + 0.35,
      playerPosRef.current.z - initFwdZ * initDist,
    );
    camera.lookAt(
      playerPosRef.current.x + initFwdX * 20,
      initPivotY,
      playerPosRef.current.z + initFwdZ * 20,
    );
    cameraRef.current = camera;

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ---- Arena Environment / Battlefield Terrain ----
    const floorGeo = isFieldOrSiege
      ? new THREE.PlaneGeometry(380, 380, 20, 20)
      : new THREE.CylinderGeometry(18, 18, 0.2, 32);
    const floorMat = new THREE.MeshStandardMaterial({
      color: isFieldOrSiege ? '#3e5229' : '#453526',
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    if (isFieldOrSiege) {
      floor.rotation.x = -Math.PI * 0.5;
      floor.position.y = 0;
    } else {
      floor.position.y = -0.1;
    }
    floor.receiveShadow = true;
    scene.add(floor);
    floorMeshRef.current = floor;

    const arenaPerimeterGroup = new THREE.Group();
    arenaPerimeterGroupRef.current = arenaPerimeterGroup;
    if (isFieldOrSiege) {
      arenaPerimeterGroup.visible = false;
    }
    scene.add(arenaPerimeterGroup);

    // Stone wall
    const wallGeo = new THREE.TorusGeometry(17.8, 0.4, 8, 32);
    const wallMat = new THREE.MeshStandardMaterial({ color: '#2b231a', roughness: 0.9, flatShading: true });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.rotation.x = Math.PI * 0.5;
    wall.position.y = 0.2;
    arenaPerimeterGroup.add(wall);

    // Palisade posts
    const palisadeGroup = new THREE.Group();
    const postGeo = new THREE.CylinderGeometry(0.12, 0.15, 2.8, 5);
    const postMat = new THREE.MeshStandardMaterial({ color: '#2d1e13', roughness: 0.9 });
    for (let i = 0; i < 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(Math.cos(angle) * 18.2, 1.4, Math.sin(angle) * 18.2);
      post.castShadow = true;
      palisadeGroup.add(post);
    }
    arenaPerimeterGroup.add(palisadeGroup);

    // ---- Lighting ----
    const sunLight = new THREE.DirectionalLight(isFieldOrSiege ? '#fffdf5' : '#fffbeb', isFieldOrSiege ? 2.6 : 2.2);
    sunLight.position.set(16, 28, 14);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 140;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    scene.add(sunLight);

    const skyFill = new THREE.HemisphereLight(
      isFieldOrSiege ? '#a5d0fa' : '#fef08a',
      isFieldOrSiege ? '#384d20' : '#181410',
      isFieldOrSiege ? 1.15 : 0.85,
    );
    scene.add(skyFill);

    const rimLight = new THREE.DirectionalLight('#93c5fd', 0.7);
    rimLight.position.set(-10, 8, -12);
    scene.add(rimLight);

    // ---- Interactive Targets ----
    const archeryTarget = createArcheryTarget();
    archeryTarget.position.set(-5.5, 0, -8);
    archeryTarget.rotation.y = 0.5;
    arenaPerimeterGroup.add(archeryTarget);

    const dummy = createPracticeDummy();
    dummy.group.position.set(4.5, 0, -5.5);
    dummy.group.rotation.y = -0.5;
    arenaPerimeterGroup.add(dummy.group);
    dummyRef.current = dummy;

    // ---- 3D Tactical Hold Position Banner (F1) ----
    const tacticalBanner = createTacticalBannerMesh('#991b1b');
    tacticalBanner.visible = false;
    scene.add(tacticalBanner);
    tacticalBannerRef.current = tacticalBanner;

    // ---- Skirmish Multi-Agent Container ----
    const skirmishGroup = new THREE.Group();
    skirmishGroup.visible = false;
    scene.add(skirmishGroup);
    skirmishGroupRef.current = skirmishGroup;

    // ---- 500v500 GPU InstancedMesh Army, 10,000-Arrow & 10,000-Corpse Pool + 3D Siege Scene ----
    const instancedBattleScene = createInstancedBattleScene();
    instancedBattleScene.root.visible = false;
    scene.add(instancedBattleScene.root);
    instancedBattleSceneRef.current = instancedBattleScene;

    // ---- Duel Gladiator Bot Sparring Partner ----
    const botRig = createCharacterRig({
      skinTone: '#c68a62',
      hairColor: '#1c1917',
      factionColor: '#581c87',
      weaponType: 'ONE_HANDED_SWORD',
      shieldType: 'ROUND_SHIELD',
      helmetType: 'KETTLE_HAT',
      armorTier: 'CHAINMAIL',
    });
    botRig.root.position.set(0, 0, -5.5);
    scene.add(botRig.root);
    botRigRef.current = botRig;
    const botAnimator = new CharacterAnimator(botRig);
    botAnimatorRef.current = botAnimator;


    // Duel Gladiator hit callback (when bot swings at player!)
    botAnimator.onEvent = (event) => {
      if (event !== 'hit' || arenaBattleModeRef.current !== 'DUEL') return;
      if (botHpRef.current <= 0) return;

      const bPos = botRig.root.position;
      const pPos = playerPosRef.current;
      const dist = bPos.distanceTo(pPos);
      if (dist > 2.55) return;

      const playerAnim = playerAnimatorRef.current;
      const playerHasShield = shieldTypeRef.current !== 'NONE' && weaponTypeRef.current === 'ONE_HANDED_SWORD';
      const playerBlocking = !!playerAnim?.isBlocking();

      const parryRes = evaluateDirectionalParry({
        attackDir: botAttackDirRef.current,
        defenderBlockDir: combatDirRef.current,
        hasShield: playerHasShield,
        isBlocking: playerBlocking,
        isFacingAttacker: true,
      });

      if (parryRes.blocked) {
        sound.playShieldHit();
        const blockMsg =
          parryRes.blockType === 'SHIELD'
            ? 'KALKAN İLE SAVUŞTURULDU!'
            : `KUSURSUZ SİLAH PARRY! (${botAttackDirRef.current.toUpperCase()})`;
        spawnDamageText(blockMsg, '#38bdf8', pPos);
      } else {
        const dmg = Math.round(18 * parryRes.damageMultiplier);
        playerHpRef.current = Math.max(0, playerHpRef.current - dmg);
        setPlayerHp(playerHpRef.current);
        sound.playShieldHit();
        spawnDamageText(`-${dmg} HASAR ALDIN!`, '#ef4444', pPos);
        if (playerHpRef.current <= 0) {
          playerAnim?.fall();
          sound.playDefeatSting();
          spawnDamageText('☠️ ARENA DÜELLOSUNDA YERE SERİLDİN!', '#dc2626', pPos);
        } else {
          playerAnim?.hitReact(true);
        }
      }
    };

    // ---- Player WarHorse Rig (Faz 1.4 Mounted Combat) ----
    const playerHorse = createWarHorseRig({
      coatColor: '#4a3222',
      maneColor: '#1a130e',
      factionColor: initialEquipmentVisuals.factionColor,
      armoredBarding: true,
    });
    playerHorse.root.position.copy(playerPosRef.current);
    playerHorse.root.rotation.y = playerYawRef.current;
    playerHorse.root.visible = false;
    scene.add(playerHorse.root);
    playerHorseRef.current = playerHorse;

    // ---- Player Hero Rig (Custom Low-Poly Morph DNA) ----
    const pDna = campaign?.playerMorphDNA;
    const playerRig = createCharacterRig({
      skinTone: pDna?.skinTone || '#dfa882',
      hairColor: pDna?.hairColor || '#382212',
      beardColor: pDna?.beardColor || '#382212',
      factionColor: initialEquipmentVisuals.factionColor,
      hasBeard: pDna ? pDna.beardStyle !== 'clean_shaven' : true,
      weaponType: initialEquipmentVisuals.weaponType,
      shieldType: initialEquipmentVisuals.shieldType,
      helmetType: initialEquipmentVisuals.helmetType,
      armorTier: initialEquipmentVisuals.armorTier,
    });
    if (pDna) {
      applyMorphDNAToRig(playerRig, pDna);
    }

    if (isMountedRef.current) {
      playerHorse.root.visible = true;
      playerHorse.riderMount.add(playerRig.root);
      playerRig.root.position.set(0, 0, 0);
      playerRig.root.rotation.set(0, 0, 0);
    } else {
      playerRig.root.position.copy(playerPosRef.current);
      playerRig.root.rotation.y = playerYawRef.current;
      scene.add(playerRig.root);
    }
    playerRigRef.current = playerRig;
    const playerAnimator = new CharacterAnimator(playerRig);
    playerAnimatorRef.current = playerAnimator;

    // If starting in Campaign Field / Siege mode, initialize authentic armies & terrain immediately
    if (isFieldOrSiege) {
      botRig.root.visible = false;
      instancedBattleScene.root.visible = false;
      arenaPerimeterGroup.visible = false;
      skirmishGroup.visible = true;
      spawnCampaignForces(true);
    }

    // ── Event handler: hit detection, arrow firing, sounds ──
    playerAnimator.onEvent = (event, clipName) => {
      if (event === 'hit') {
        sound.playSwordSwoosh();
        const pPos = playerPosRef.current;
        const forward = new THREE.Vector3(
          Math.sin(playerYawRef.current),
          0,
          Math.cos(playerYawRef.current),
        );
        const reach =
          weaponTypeRef.current === 'SPEAR'
            ? 3.1
            : weaponTypeRef.current === 'TWO_HANDED_SWORD'
              ? 2.75
              : 2.45;
        const baseDmg =
          weaponTypeRef.current === 'TWO_HANDED_SWORD'
            ? 46
            : weaponTypeRef.current === 'SPEAR'
              ? 38
              : 34;
        const speedBonus = Math.round(playerSpeedRef.current * 2.2);

        // 1. Practice Dummy check
        const dummyObj = dummyRef.current;
        if (dummyObj && arenaBattleModeRef.current !== 'MASS_BATTLE') {
          const toDummy = new THREE.Vector3().subVectors(dummyObj.group.position, pPos);
          const distToDummy = toDummy.length();
          if (distToDummy < reach + 0.2 && toDummy.normalize().dot(forward) > 0.15) {
            dummyObj.hit();
            sound.playShieldHit();
            spawnDamageText(`${baseDmg + speedBonus} KESİCİ!`, '#facc15', dummyObj.group.position);
            setDummyHitCount((c) => c + 1);
          }
        }

        // 2. Duel / Training Bot check
        if (arenaBattleModeRef.current === 'TRAINING' || arenaBattleModeRef.current === 'DUEL') {
          const botRoot = botRigRef.current?.root;
          const bAnim = botAnimatorRef.current;
          if (botRoot && bAnim && botHpRef.current > 0) {
            const toBot = new THREE.Vector3().subVectors(botRoot.position, pPos);
            const distToBot = toBot.length();
            if (distToBot < reach && toBot.normalize().dot(forward) > 0.15) {
              if (arenaBattleModeRef.current === 'TRAINING') {
                sound.playShieldHit();
                spawnDamageText('ANTRENMAN BLOKU (0 Hasar)', '#93c5fd', botRoot.position);
              } else {
                // DUEL mode: evaluate directional parry!
                const parry = evaluateDirectionalParry({
                  attackDir: combatDirRef.current,
                  defenderBlockDir: botBlockDirRef.current,
                  hasShield: true,
                  isBlocking: bAnim.isBlocking(),
                  isFacingAttacker: true,
                });
                if (parry.blocked) {
                  sound.playShieldHit();
                  spawnDamageText('🛡️ GLADYATÖR BLOKLADI!', '#93c5fd', botRoot.position);
                } else {
                  const totalDmg = Math.round((baseDmg + speedBonus) * parry.damageMultiplier);
                  botHpRef.current = Math.max(0, botHpRef.current - totalDmg);
                  setBotHp(botHpRef.current);
                  sound.playShieldHit();
                  if (botHpRef.current <= 0) {
                    bAnim.fall();
                    botRespawnTimerRef.current = 2.6;
                    setKillsCount((k) => k + 1);
                    spawnDamageText(`☠️ GLADYATÖR YIKILDI! (+${totalDmg})`, '#facc15', botRoot.position);
                  } else {
                    bAnim.hitReact(true);
                    spawnDamageText(`💥 -${totalDmg} (${combatDirRef.current.toUpperCase()} DARBE!)`, '#fbbf24', botRoot.position);
                  }
                }
              }
            }
          }
        } else if (arenaBattleModeRef.current === 'SKIRMISH') {
          // 3. SKIRMISH mode: check enemy fighters in reach
          for (const unit of skirmishUnitsRef.current) {
            if (unit.team !== 'ENEMY' || !unit.alive) continue;
            const uPos = new THREE.Vector3(unit.x, 0, unit.z);
            const toUnit = new THREE.Vector3().subVectors(uPos, pPos);
            const dist = toUnit.length();
            if (dist < reach && toUnit.normalize().dot(forward) > 0.1) {
              const parry = evaluateDirectionalParry({
                attackDir: combatDirRef.current,
                defenderBlockDir: unit.blockDir,
                hasShield: unit.hasShield,
                isBlocking: unit.animator.isBlocking(),
                isFacingAttacker: true,
              });
              if (parry.blocked) {
                sound.playShieldHit();
                spawnDamageText(`🛡️ ${unit.name} Blokladı!`, '#93c5fd', uPos);
              } else {
                const dmg = Math.round((baseDmg + speedBonus) * parry.damageMultiplier);
                unit.hp = Math.max(0, unit.hp - dmg);
                sound.playShieldHit();
                if (unit.hp <= 0) {
                  unit.alive = false;
                  unit.animator.fall();
                  setKillsCount((k) => k + 1);
                  if (unit.isLord) {
                    sound.playVictoryFanfare();
                    spawnDamageText(`👑 ${unit.name.toUpperCase()} MAĞLUP EDİLDİ!`, '#fbbf24', uPos);
                    pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', unit.name, 'ALLY', '👑');
                  } else {
                    spawnDamageText(`☠️ ${unit.name} Düştü! (-${dmg})`, '#facc15', uPos);
                    pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', unit.name, 'ALLY', '⚔️');
                  }
                } else {
                  unit.animator.hitReact(true);
                  spawnDamageText(`💥 -${dmg} Hasar!`, '#fbbf24', uPos);
                }
              }
            }
          }
        } else if (arenaBattleModeRef.current === 'MASS_BATTLE') {
          // 4. MASS_BATTLE (500v500 Pool): check enemies in SpatialHashGrid within reach!
          const pool = battlePoolRef.current;
          const nearby = pool.spatialGrid.queryRadius(pPos.x, pPos.z, reach + 0.4);
          let hitAny = false;
          for (const cand of nearby) {
            if (cand.team !== 2) continue;
            const idx = cand.index;
            if (pool.soldierAlive[idx] === 0) continue;
            const dx = pool.soldierX[idx] - pPos.x;
            const dz = pool.soldierZ[idx] - pPos.z;
            const d = Math.hypot(dx, dz) || 0.01;
            if (d <= reach && (dx / d) * forward.x + (dz / d) * forward.z > 0.05) {
              const dmg = baseDmg + speedBonus;
              pool.soldierHp[idx] -= dmg;
              hitAny = true;
              if (pool.soldierHp[idx] <= 0) {
                pool.soldierAlive[idx] = 0;
                pool.recordFallenCorpse(
                  pool.soldierX[idx],
                  0.08,
                  pool.soldierZ[idx],
                  pool.soldierYaw[idx],
                  2,
                );
                setKillsCount((k) => k + 1);
                spawnDamageText(`☠️ DÜŞMAN ASKERİ DEVİRDİN! (-${dmg})`, '#facc15', new THREE.Vector3(pool.soldierX[idx], 0, pool.soldierZ[idx]));
              } else {
                spawnDamageText(`💥 -${dmg} DARBE!`, '#fbbf24', new THREE.Vector3(pool.soldierX[idx], 0, pool.soldierZ[idx]));
              }
            }
          }
          if (hitAny) sound.playShieldHit();
        }
      }
      if (event === 'release' && clipName === 'bow_release') {
        fireArrowProjectile('ALLY');
      }
    };

    // ── Arrow projectile spawning ──
    function fireArrowProjectile(
      team: 'ALLY' | 'ENEMY' = 'ALLY',
      customOrigin?: THREE.Vector3,
      customDir?: THREE.Vector3,
    ) {
      const rig = playerRigRef.current;
      const anim = playerAnimatorRef.current;
      if (!rig || !anim) return;

      // Çekiş gücü: bırakma anında animatörün hesapladığı değer (0..1).
      // Özel çağrılarda (bot/asker okları) tam güç kullanılır.
      const shotPower = customOrigin ? 1 : Math.min(1, Math.max(BOW_MIN_RELEASE_DRAW, anim.getLastBowPower()));

      sound.playArrowFly();
      const arrowMesh = createArrowMesh(rig.materials);
      arrowMesh.castShadow = true;

      const spawnPos = new THREE.Vector3();
      const spawnDir = new THREE.Vector3();

      if (customOrigin && customDir) {
        spawnPos.copy(customOrigin);
        spawnDir.copy(customDir).normalize();
      } else if (anim.getArrowLaunch(spawnPos, spawnDir)) {
        spawnDir.y += 0.08;
        spawnDir.normalize();
      } else {
        rig.leftHand.getWorldPosition(spawnPos);
        spawnPos.y += 0.15;
        spawnDir.set(
          Math.sin(playerYawRef.current),
          Math.sin(playerPitchRef.current) + 0.08,
          Math.cos(playerYawRef.current),
        ).normalize();
      }

      arrowMesh.position.copy(spawnPos);
      arrowMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spawnDir);
      scene.add(arrowMesh);

      // Güçsüz çekiş daha yavaş ve daha çok düşer (Bannerlord hissi).
      const speed = ARROW_SPEED * (0.45 + 0.55 * shotPower);
      flyingArrowsRef.current.push({
        mesh: arrowMesh,
        velocity: spawnDir.clone().multiplyScalar(speed),
        inFlight: true,
        spawnTime: Date.now(),
        team,
        power: shotPower,
      });

      if (team === 'ALLY' && !customOrigin) {
        setArrowCount((prev) => Math.max(0, prev - 1));
      }
    }

    // ══════════════════════════════════════════════════════════════════
    //  BANNERPAGE / WARBAND SPECIAL COMBAT ACTIONS: SHIELD BASH & KICK
    // ══════════════════════════════════════════════════════════════════

    const triggerPlayerShieldBash = () => {
      const anim = playerAnimatorRef.current;
      if (!anim) return;
      anim.shieldBash();
      sound.playShieldHit();
      spawnDamageText('🛡️ KALKAN DARBESİ! (GARD KIRILDI)', '#38bdf8', playerPosRef.current.clone().setY(2.1));

      const pPos = playerPosRef.current;
      const fwd = new THREE.Vector3(Math.sin(playerYawRef.current), 0, Math.cos(playerYawRef.current));

      if (arenaBattleModeRef.current === 'DUEL' || arenaBattleModeRef.current === 'TRAINING') {
        const botRoot = botRigRef.current?.root;
        const bAnim = botAnimatorRef.current;
        if (botRoot && bAnim && botHpRef.current > 0) {
          const toBot = new THREE.Vector3().subVectors(botRoot.position, pPos);
          const dist = toBot.length();
          if (dist < 2.45 && toBot.normalize().dot(fwd) > 0.25) {
            const dmg = 16;
            botHpRef.current = Math.max(0, botHpRef.current - dmg);
            setBotHp(botHpRef.current);
            bAnim.hitReact(true);
            botAiTimerRef.current = 1.0;
            sound.playShieldHit();
            spawnDamageText(`🛡️ -${dmg} BLUNT (GARD KIRILDI!)`, '#38bdf8', botRoot.position);
            if (botHpRef.current <= 0) {
              bAnim.fall();
              botRespawnTimerRef.current = 2.6;
              setKillsCount((k) => k + 1);
            }
          }
        }
      } else if (arenaBattleModeRef.current === 'SKIRMISH') {
        for (const u of skirmishUnitsRef.current) {
          if (u.team !== 'ENEMY' || !u.alive) continue;
          const uPos = new THREE.Vector3(u.x, 0, u.z);
          const toU = new THREE.Vector3().subVectors(uPos, pPos);
          if (toU.length() < 2.45 && toU.normalize().dot(fwd) > 0.25) {
            u.hp = Math.max(0, u.hp - 18);
            u.animator.hitReact(true);
            u.aiTimer = 1.0;
            sound.playShieldHit();
            spawnDamageText('🛡️ -18 (GARD KIRILDI!)', '#38bdf8', uPos);
            if (u.hp <= 0) {
              u.alive = false;
              u.animator.fall();
            }
          }
        }
      }
    };

    const triggerPlayerKick = () => {
      const anim = playerAnimatorRef.current;
      if (!anim) return;
      anim.kick();
      spawnDamageText('🦶 TEKME DARBESİ! (SERSEMLETME)', '#f59e0b', playerPosRef.current.clone().setY(2.1));

      const pPos = playerPosRef.current;
      const fwd = new THREE.Vector3(Math.sin(playerYawRef.current), 0, Math.cos(playerYawRef.current));

      if (arenaBattleModeRef.current === 'DUEL' || arenaBattleModeRef.current === 'TRAINING') {
        const botRoot = botRigRef.current?.root;
        const bAnim = botAnimatorRef.current;
        if (botRoot && bAnim && botHpRef.current > 0) {
          const toBot = new THREE.Vector3().subVectors(botRoot.position, pPos);
          const dist = toBot.length();
          if (dist < 2.15 && toBot.normalize().dot(fwd) > 0.3) {
            const dmg = 12;
            botHpRef.current = Math.max(0, botHpRef.current - dmg);
            setBotHp(botHpRef.current);
            bAnim.hitReact(true);
            botAiTimerRef.current = 0.85;
            spawnDamageText(`🦶 -${dmg} (SERSEMLİK!)`, '#f59e0b', botRoot.position);
            if (botHpRef.current <= 0) {
              bAnim.fall();
              botRespawnTimerRef.current = 2.6;
              setKillsCount((k) => k + 1);
            }
          }
        }
      } else if (arenaBattleModeRef.current === 'SKIRMISH') {
        for (const u of skirmishUnitsRef.current) {
          if (u.team !== 'ENEMY' || !u.alive) continue;
          const uPos = new THREE.Vector3(u.x, 0, u.z);
          const toU = new THREE.Vector3().subVectors(uPos, pPos);
          if (toU.length() < 2.15 && toU.normalize().dot(fwd) > 0.3) {
            u.hp = Math.max(0, u.hp - 14);
            u.animator.hitReact(true);
            u.aiTimer = 0.85;
            sound.playHit();
            spawnDamageText('🦶 -14 (SERSEMLİK!)', '#f59e0b', uPos);
            if (u.hp <= 0) {
              u.alive = false;
              u.animator.fall();
            }
          }
        }
      }
    };

    // ══════════════════════════════════════════════════════════════════
    //  INPUT HANDLERS
    // ══════════════════════════════════════════════════════════════════

    const onMouseDown = (e: MouseEvent) => {
      if (e.target !== renderer.domElement) return;
      // Tarayıcı autoplay kilidi: ilk tıklamada ses motorunu aç.
      sound.unlock();
      const mode = controlModeRef.current;
      if (mode === 'INSPECTOR') {
        orbitRef.current.dragging = true;
        orbitRef.current.lastX = e.clientX;
        orbitRef.current.lastY = e.clientY;
      } else if (mode === 'PLAYABLE') {
        if (document.pointerLockElement !== renderer.domElement) {
          try {
            renderer.domElement.requestPointerLock();
          } catch {
            // ignore
          }
        }

        const anim = playerAnimatorRef.current;
        if (!anim) return;

        if (e.button === 0) {
          // BannerPage SHIELD BASH: Sağ Tık (blok) basılıyken Sol Tık!
          if (isBlockingRef.current && shieldTypeRef.current !== 'NONE') {
            triggerPlayerShieldBash();
            return;
          }

          const wt = weaponTypeRef.current;
          if (wt === 'BOW') {
            // Zaten nişan alıyorsak yeniden başlatma (çift tık çekişi kesmesin).
            if (isAimingBowRef.current) return;
            isAimingBowRef.current = true;
            bowAimStartRef.current = performance.now();
            setIsAimingBow(true);
            anim.play('bow_draw', { hold: true });
          } else {
            setIsAttacking(true);
            anim.attack(combatDirRef.current, true);
          }
        } else if (e.button === 2) {
          e.preventDefault();
          const wt = weaponTypeRef.current;
          if (wt === 'BOW') {
            // Sağ tık: nişanı iptal et (ok takılı kalır, atış olmaz).
            if (!isAimingBowRef.current) return;
            isAimingBowRef.current = false;
            setIsAimingBow(false);
            anim.cancelBowDraw();
          } else {
            isBlockingRef.current = true;
            setIsBlocking(true);
            anim.block(combatDirRef.current);
          }
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      orbitRef.current.dragging = false;
      const mode = controlModeRef.current;
      if (mode !== 'PLAYABLE') return;
      const anim = playerAnimatorRef.current;
      if (!anim) return;

      if (e.button === 0) {
        setIsAttacking(false);
        if (isAimingBowRef.current) {
          // Yay: yalnızca nişan alıyorsak bırakma işlemi yapılır.
          const heldMs = performance.now() - bowAimStartRef.current;
          isAimingBowRef.current = false;
          setIsAimingBow(false);
          anim.release();

          const power = anim.getLastBowPower();
          if (power >= BOW_MIN_RELEASE_DRAW) {
            const pct = Math.round(power * 100);
            const label = power > 0.92 ? 'TAM ÇEKİŞ' : power > 0.6 ? 'GÜÇLÜ' : power > 0.35 ? 'ORTA' : 'ZAYIF';
            spawnDamageText(
              `🏹 ${label} ATIŞ (${pct}%)`,
              power > 0.92 ? '#fbbf24' : power > 0.6 ? '#fcd34d' : '#d6d3d1',
              playerPosRef.current.clone().setY(2.2),
            );
          } else {
            spawnDamageText(
              heldMs < 400 ? '🏹 Çok erken — düğmeyi basılı tut' : '🏹 Çekiş yetersiz — ok takılı kaldı',
              '#a8a29e',
              playerPosRef.current.clone().setY(2.2),
            );
          }
        } else {
          // Yakın dövüş: basılı tutulan saldırıyı bırak.
          anim.release();
        }
      }
      if (e.button === 2) {
        isBlockingRef.current = false;
        setIsBlocking(false);
        if (!isAimingBowRef.current) anim.release();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const mode = controlModeRef.current;
      if (mode === 'INSPECTOR' && orbitRef.current.dragging) {
        const o = orbitRef.current;
        const dx = e.clientX - o.lastX;
        const dy = e.clientY - o.lastY;
        o.lastX = e.clientX;
        o.lastY = e.clientY;
        o.azimuth -= dx * 0.01;
        o.polar = Math.max(0.05, Math.min(Math.PI * 0.48, o.polar - dy * 0.01));
      } else if (mode === 'PLAYABLE') {
        const isLocked = document.pointerLockElement === renderer.domElement;
        const dx = e.movementX || 0;
        const dy = e.movementY || 0;
        if (isLocked || e.buttons > 0 || isFieldOrSiege) {
          playerYawRef.current -= dx * MOUSE_SENSITIVITY;
          playerPitchRef.current = THREE.MathUtils.clamp(
            playerPitchRef.current - dy * MOUSE_SENSITIVITY,
            -0.8,
            0.8,
          );
          const anim = playerAnimatorRef.current;
          if (anim) anim.setAimPitch(playerPitchRef.current);
        }

        const mx = e.movementX;
        const my = e.movementY;
        const absX = Math.abs(mx);
        const absY = Math.abs(my);

        if (absX > 3 || absY > 3) {
          let chosenDir: AttackDirection = combatDirRef.current;
          if (absX > absY * 0.95) {
            chosenDir = mx > 0 ? 'right' : 'left';
          } else {
            chosenDir = my < 0 ? 'up' : 'down';
          }
          if (chosenDir !== combatDirRef.current) {
            combatDirRef.current = chosenDir;
            setCombatDirection(chosenDir);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (controlModeRef.current === 'INSPECTOR') {
        orbitRef.current.distance = Math.max(1.8, Math.min(16, orbitRef.current.distance + e.deltaY * 0.006));
      } else if (controlModeRef.current === 'PLAYABLE') {
        playableCamDistRef.current = THREE.MathUtils.clamp(
          playableCamDistRef.current + e.deltaY * 0.002,
          1.6,
          4.5,
        );
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = true;
      const inTacticalMode =
        arenaBattleModeRef.current === 'SKIRMISH' ||
        arenaBattleModeRef.current === 'MASS_BATTLE' ||
        isFieldOrSiege;

      if (inTacticalMode) {
        if (e.code === 'Digit1') {
          setSelectedDivision('INFANTRY');
          showOrderShout('🛡️ [1] Piyade Bölüğü Seçildi');
          sound.playUiClick();
        } else if (e.code === 'Digit2') {
          setSelectedDivision('ARCHERS');
          showOrderShout('🏹 [2] Okçu Bölüğü Seçildi');
          sound.playUiClick();
        } else if (e.code === 'Digit3') {
          setSelectedDivision('CAVALRY');
          showOrderShout('🏇 [3] Süvari Bölüğü Seçildi');
          sound.playUiClick();
        } else if (e.code === 'Digit4') {
          setSelectedDivision('HORSE_ARCHERS');
          showOrderShout('🎯 [4] Atlı Okçu Bölüğü Seçildi');
          sound.playUiClick();
        } else if (e.code === 'Digit0' || e.code === 'Backquote') {
          setSelectedDivision('ALL');
          showOrderShout('⚔️ [0] Tüm Ordu Seçildi');
          sound.playUiClick();
        }
      } else {
        // Quick weapon swap keys in Training/Duel/Inspector (1-5)
        if (e.code === 'Digit1') setWeaponType('ONE_HANDED_SWORD');
        if (e.code === 'Digit2') setWeaponType('TWO_HANDED_SWORD');
        if (e.code === 'Digit3') setWeaponType('BOW');
        if (e.code === 'Digit4') setWeaponType('SPEAR');
        if (e.code === 'Digit5') setWeaponType('UNARMED');
      }

      if (e.code === 'KeyH') setDockCollapsed((prev) => !prev);

      // BannerPage Key Actions: [E] Tekme / Kalkan Vuruşu
      if (e.code === 'KeyE') {
        if (controlModeRef.current === 'PLAYABLE') {
          if (isBlockingRef.current && shieldTypeRef.current !== 'NONE') {
            triggerPlayerShieldBash();
          } else {
            triggerPlayerKick();
          }
        }
      }

      // KeyM -> Toggle WarHorse Mount!
      if (e.code === 'KeyM') {
        setIsMounted((prev) => !prev);
      }

      // Bannerlord Tactical Orders (F1 / F2 / F3 / F4 / F5 / F6)
      if (e.code === 'F1') {
        e.preventDefault();
        if (activeTacticalMenuRef.current === 'MOVEMENT') {
          issueHoldPositionOrder();
          setActiveTacticalMenu(null);
        } else if (activeTacticalMenuRef.current === 'FACING') {
          showOrderShout('👀 [F2-F1] Düşmana Dönüldü!');
          setActiveTacticalMenu(null);
        } else if (activeTacticalMenuRef.current === 'FORMATION') {
          setFormationArrangement('LINE');
          showOrderShout('➖ [F3-F1] Çizgi Düzenine Geçildi!');
          setActiveTacticalMenu(null);
        } else {
          setActiveTacticalMenu('MOVEMENT');
          sound.playUiClick();
        }
      } else if (e.code === 'F2') {
        e.preventDefault();
        if (activeTacticalMenuRef.current === 'MOVEMENT') {
          setFormationOrder('FOLLOW_ME');
          if (tacticalBannerRef.current) tacticalBannerRef.current.visible = false;
          showOrderShout('🛡️ [F1-F2] Beni Takip Et Emri!');
          setActiveTacticalMenu(null);
        } else if (activeTacticalMenuRef.current === 'FACING') {
          showOrderShout('🧭 [F2-F2] Bu Yöne Dönüldü!');
          setActiveTacticalMenu(null);
        } else if (activeTacticalMenuRef.current === 'FORMATION') {
          setFormationArrangement('SHIELD_WALL');
          showOrderShout('🛡️ [F3-F2] Kalkan Duvarı Örüldü!');
          sound.playShieldHit();
          setActiveTacticalMenu(null);
        } else {
          setActiveTacticalMenu('FACING');
          sound.playUiClick();
        }
      } else if (e.code === 'F3') {
        e.preventDefault();
        if (activeTacticalMenuRef.current === 'MOVEMENT') {
          setFormationOrder('CHARGE');
          if (tacticalBannerRef.current) tacticalBannerRef.current.visible = false;
          showOrderShout('⚔️ [F1-F3] Hücum Emri! Düşmana saldırın!');
          sound.playWarhorn();
          setActiveTacticalMenu(null);
        } else if (activeTacticalMenuRef.current === 'FORMATION') {
          setFormationArrangement('LOOSE');
          showOrderShout('〰️ [F3-F3] Dağınık Düzene Geçildi!');
          setActiveTacticalMenu(null);
        } else {
          setActiveTacticalMenu('FORMATION');
          sound.playUiClick();
        }
      } else if (e.code === 'F4') {
        e.preventDefault();
        if (activeTacticalMenuRef.current === 'MOVEMENT') {
          setFormationOrder('ADVANCE');
          showOrderShout('➡️ [F1-F4] İlerle Emri Verildi!');
          setActiveTacticalMenu(null);
        } else if (activeTacticalMenuRef.current === 'FORMATION') {
          setFormationArrangement('SQUARE');
          showOrderShout('⏹️ [F3-F4] Kare Düzene Geçildi!');
          setActiveTacticalMenu(null);
        } else {
          setFireOrder((prev) => {
            const next = prev === 'FREE_FIRE' ? 'HOLD_FIRE' : 'FREE_FIRE';
            showOrderShout(next === 'FREE_FIRE' ? '🏹 [F4] Serbest Atış Emri Verildi!' : '🛡️ [F4] Ateşi Kes Emri Verildi!');
            return next;
          });
          sound.playUiClick();
        }
      } else if (e.code === 'F5') {
        e.preventDefault();
        if (activeTacticalMenuRef.current === 'MOVEMENT') {
          setFormationOrder('RETREAT');
          showOrderShout('◀️ [F1-F5] Ricat Emri! Geri çekilin!');
          setActiveTacticalMenu(null);
        } else if (activeTacticalMenuRef.current === 'FORMATION') {
          setFormationArrangement('WEDGE');
          showOrderShout('🔺 [F3-F5] Kama Düzenine Geçildi!');
          setActiveTacticalMenu(null);
        }
      } else if (e.code === 'F6') {
        e.preventDefault();
        if (activeTacticalMenuRef.current === 'FORMATION') {
          setFormationArrangement('COLUMN');
          showOrderShout('❚ [F3-F6] Kolon Düzenine Geçildi!');
          setActiveTacticalMenu(null);
        }
      } else if (e.code === 'Escape') {
        if (activeTacticalMenuRef.current) {
          e.preventDefault();
          setActiveTacticalMenu(null);
        }
      }

      // Space → quick attack in selected direction
      if (e.code === 'Space' && controlModeRef.current === 'PLAYABLE') {
        const anim = playerAnimatorRef.current;
        if (anim) anim.attack(combatDirRef.current, false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = false;
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ══════════════════════════════════════════════════════════════════
    //  ANIMATION LOOP (60 FPS)
    // ══════════════════════════════════════════════════════════════════

    const gravity = new THREE.Vector3(0, -9.8, 0);
    const _tmpV = new THREE.Vector3();

    const loop = () => {
      animIdRef.current = requestAnimationFrame(loop);
      const rawDelta = clockRef.current.getDelta();
      const speed = animSpeedRef.current;
      const delta = Math.min(0.1, rawDelta * speed);
      const elapsed = clockRef.current.elapsedTime;
      const mode = controlModeRef.current;

      // ─ 1. Player movement & Mounted WarHorse Physics ─
      const anim = playerAnimatorRef.current;
      const keys = keysDownRef.current;
      const mounted = isMountedRef.current;

      if (mode === 'PLAYABLE' && anim) {
        const localMove = new THREE.Vector3();
        if (keys['KeyW'] || keys['ArrowUp']) localMove.z += 1;
        if (keys['KeyS'] || keys['ArrowDown']) localMove.z -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) localMove.x += 1;
        if (keys['KeyD'] || keys['ArrowRight']) localMove.x -= 1;

        const isSprint = keys['ShiftLeft'] || keys['ShiftRight'];

        if (localMove.lengthSq() > 0) {
          localMove.normalize();
          const moveSpeed = mounted
            ? isSprint
              ? HORSE_GALLOP_SPEED
              : HORSE_WALK_SPEED
            : isSprint
              ? SPRINT_SPEED
              : MOVE_SPEED;
          playerSpeedRef.current = moveSpeed;
          anim.setMove(mounted ? 0 : localMove.x * moveSpeed, mounted ? 0 : localMove.z * moveSpeed);

          const worldMove = localMove.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), playerYawRef.current);
          playerPosRef.current.addScaledVector(worldMove, moveSpeed * delta);

          const maxR = isFieldOrSiege
            ? 140.0
            : arenaBattleModeRef.current === 'MASS_BATTLE'
              ? MASS_BATTLE_RADIUS
              : ARENA_RADIUS - 0.6;
          if (playerPosRef.current.length() > maxR) {
            playerPosRef.current.setLength(maxR);
          }
        } else {
          playerSpeedRef.current = 0;
          anim.setMove(0, 0);
        }

        const rig = playerRigRef.current!;
        const horse = playerHorseRef.current;

        anim.update(delta);

        if (mounted && horse) {
          horse.root.position.copy(playerPosRef.current);
          horse.root.rotation.y = playerYawRef.current;
          updateWarHorseAnimation(horse, playerSpeedRef.current, elapsed);
          applyRiderMountedPosture(rig, playerSpeedRef.current, elapsed);

          // Cavalry Charge Trample check when galloping fast!
          if (trampleCooldownRef.current > 0) {
            trampleCooldownRef.current -= delta;
          } else if (playerSpeedRef.current >= 6.8) {
            if (arenaBattleModeRef.current === 'DUEL' && botRigRef.current && botHpRef.current > 0) {
              const distToBot = botRigRef.current.root.position.distanceTo(playerPosRef.current);
              if (distToBot < 1.65) {
                trampleCooldownRef.current = 1.4;
                const trampleDmg = 42;
                botHpRef.current = Math.max(0, botHpRef.current - trampleDmg);
                setBotHp(botHpRef.current);
                sound.playShieldHit();
                if (botHpRef.current <= 0) {
                  botAnimatorRef.current?.fall();
                  botRespawnTimerRef.current = 2.6;
                  setKillsCount((k) => k + 1);
                  spawnDamageText('🏇 SÜVARİ HÜCUMUYLA EZİLDİ! (+42)', '#facc15', botRigRef.current.root.position);
                } else {
                  botAnimatorRef.current?.hitReact(true);
                  spawnDamageText('🏇 SÜVARİ ÇARPMASI! (-42)', '#fb923c', botRigRef.current.root.position);
                }
              }
            } else if (arenaBattleModeRef.current === 'SKIRMISH') {
              for (const u of skirmishUnitsRef.current) {
                if (u.team !== 'ENEMY' || !u.alive) continue;
                const d = Math.hypot(u.x - playerPosRef.current.x, u.z - playerPosRef.current.z);
                if (d < 1.65) {
                  trampleCooldownRef.current = 1.1;
                  u.hp = Math.max(0, u.hp - 45);
                  sound.playShieldHit();
                  if (u.hp <= 0) {
                    u.alive = false;
                    u.animator.fall();
                    setKillsCount((k) => k + 1);
                    spawnDamageText(`🏇 SÜVARİ HÜCUMU: ${u.name} Yıkıldı!`, '#facc15', new THREE.Vector3(u.x, 0, u.z));
                  } else {
                    u.animator.hitReact(true);
                    spawnDamageText('🏇 SÜVARİ ÇARPMASI! (-45)', '#fb923c', new THREE.Vector3(u.x, 0, u.z));
                  }
                  break;
                }
              }
            } else if (arenaBattleModeRef.current === 'MASS_BATTLE') {
              const pool = battlePoolRef.current;
              const hits = pool.spatialGrid.queryRadius(playerPosRef.current.x, playerPosRef.current.z, 1.75);
              for (const cand of hits) {
                if (cand.team !== 2) continue;
                const idx = cand.index;
                if (pool.soldierAlive[idx] === 0) continue;
                trampleCooldownRef.current = 0.65;
                pool.soldierHp[idx] -= 52;
                sound.playShieldHit();
                if (pool.soldierHp[idx] <= 0) {
                  pool.soldierAlive[idx] = 0;
                  pool.recordFallenCorpse(pool.soldierX[idx], 0.08, pool.soldierZ[idx], pool.soldierYaw[idx], 2);
                  setKillsCount((k) => k + 1);
                  spawnDamageText('🏇 SÜVARİ HÜCUMU: DÜŞMAN EZİLDİ!', '#facc15', new THREE.Vector3(pool.soldierX[idx], 0, pool.soldierZ[idx]));
                } else {
                  spawnDamageText('🏇 SÜVARİ ÇARPMASI! (-52)', '#fb923c', new THREE.Vector3(pool.soldierX[idx], 0, pool.soldierZ[idx]));
                }
                break;
              }
            }
          }
        } else {
          rig.root.position.copy(playerPosRef.current);
          rig.root.rotation.y = playerYawRef.current;
        }
      } else if (mode === 'INSPECTOR' && anim) {
        anim.update(delta);
        if (mounted && playerHorseRef.current && playerRigRef.current) {
          updateWarHorseAnimation(playerHorseRef.current, 0, elapsed);
          applyRiderMountedPosture(playerRigRef.current, 0, elapsed);
        }
      }

      // ─ 2. Dummy update ─
      const dm = dummyRef.current;
      if (dm) dm.update(delta);

      // ─ 3. Duel Bot AI OR Skirmish Multi-Agent OR 500v500 Mass Battle & Siege ─
      const battleMode = arenaBattleModeRef.current;
      const botAnim = botAnimatorRef.current;
      const botRig = botRigRef.current;

      if (battleMode === 'TRAINING' && botAnim && botRig) {
        botRig.root.rotation.y = Math.atan2(
          playerPosRef.current.x - botRig.root.position.x,
          playerPosRef.current.z - botRig.root.position.z,
        );
        botAnim.update(delta);
      } else if (battleMode === 'DUEL' && botAnim && botRig) {
        const bRoot = botRig.root;
        if (botHpRef.current <= 0) {
          botAnim.setMove(0, 0);
          botAnim.update(delta);
          botRespawnTimerRef.current -= delta;
          if (botRespawnTimerRef.current <= 0) {
            // Respawn new gladiator with varied weapon!
            const weapons: WeaponType[] = ['ONE_HANDED_SWORD', 'TWO_HANDED_SWORD', 'SPEAR'];
            const nextW = weapons[Math.floor(Math.random() * weapons.length)];
            applyEquipmentToRig(botRig, {
              skinTone: '#c68a62',
              hairColor: '#1c1917',
              factionColor: '#581c87',
              weaponType: nextW,
              shieldType: nextW === 'ONE_HANDED_SWORD' || nextW === 'SPEAR' ? 'KITE_SHIELD' : 'NONE',
              helmetType: 'IMPERIAL_VISOR',
              armorTier: 'PLATE',
            });
            botAnim.reset();
            bRoot.position.set((Math.random() - 0.5) * 6, 0, -7.5);
            botHpRef.current = 100;
            setBotHp(100);
            spawnDamageText('⚔️ YENİ ŞAMPİYON ARENAYA GİRDİ!', '#c084fc', bRoot.position);
          }
        } else {
          const dx = playerPosRef.current.x - bRoot.position.x;
          const dz = playerPosRef.current.z - bRoot.position.z;
          const dist = Math.hypot(dx, dz);
          bRoot.rotation.y = Math.atan2(dx, dz);

          // Approach / maintain 2.05m dueling range + slight circle strafe
          if (dist > 2.25) {
            const spd = dist > 5.0 ? 4.4 : 2.9;
            botAnim.setMove(0.4, spd);
            bRoot.position.x += (dx / dist) * spd * delta;
            bRoot.position.z += (dz / dist) * spd * delta;
          } else if (dist < 1.45) {
            botAnim.setMove(0, -1.8);
            bRoot.position.x -= (dx / Math.max(0.1, dist)) * 1.5 * delta;
            bRoot.position.z -= (dz / Math.max(0.1, dist)) * 1.5 * delta;
          } else {
            const strafe = Math.sin(elapsed * 1.7) * 1.3;
            botAnim.setMove(strafe, 0);
            bRoot.position.x += (-dz / dist) * strafe * 0.45 * delta;
            bRoot.position.z += (dx / dist) * strafe * 0.45 * delta;
          }

          // AI Decision cycle: block player windup OR launch 4-directional swing
          botAiTimerRef.current -= delta;
          if (botAiTimerRef.current <= 0) {
            const pWinding = playerAnimatorRef.current?.isWindingUp();
            if (dist < 2.8 && pWinding && Math.random() < 0.72) {
              botBlockDirRef.current = combatDirRef.current;
              botAnim.block(botBlockDirRef.current);
              botAiTimerRef.current = 0.55;
            } else if (dist < 2.45) {
              botAnim.release();
              const dir = ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)];
              botAttackDirRef.current = dir;
              botAnim.attack(dir, false);
              botAiTimerRef.current = 1.05 + Math.random() * 0.45;
            } else {
              botAnim.release();
              botAiTimerRef.current = 0.35;
            }
          }
          botAnim.update(delta);
        }
      } else if (battleMode === 'SKIRMISH') {
        const units = skirmishUnitsRef.current;
        const grid = spatialGridRef.current;
        grid.rebuild(units);

        // Compute tactical formation slots for alive ALLY units
        const aliveAllies = units.filter((u) => u.team === 'ALLY' && u.alive);
        const aliveEnemies = units.filter((u) => u.team === 'ENEMY' && u.alive);

        const order = formationOrderRef.current;
        const arrangement = formationArrangementRef.current;
        const arrMeta = FORMATION_ARRANGEMENT_META[arrangement].modifier;

        const anchor =
          order === 'HOLD_POSITION'
            ? holdAnchorRef.current
            : {
                x: playerPosRef.current.x - Math.sin(playerYawRef.current) * 2.2,
                z: playerPosRef.current.z - Math.cos(playerYawRef.current) * 2.2,
                facing: playerYawRef.current,
              };

        const allySlots = computeFormationSlots(aliveAllies.length, anchor, arrangement);

        aliveAllies.forEach((ally, idx) => {
          const slot = allySlots[idx];
          const nearestEnemy = grid.findNearest(ally.x, ally.z, 28, (c) => c.team === 'ENEMY' && c.alive);
          const targetEnemy = nearestEnemy?.agent;
          const distToEnemy = nearestEnemy?.dist ?? 999;

          let goalX = slot ? slot.x : ally.x;
          let goalZ = slot ? slot.z : ally.z;
          let desiredFacing = slot ? slot.facing : ally.yaw;

          if (
            (order === 'CHARGE' || distToEnemy < 3.4 || ally.division === 'ARCHERS') &&
            targetEnemy
          ) {
            desiredFacing = Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z);
            if (ally.division === 'ARCHERS') {
              // Archers hold standoff distance
              if (distToEnemy > 11.5 && order === 'CHARGE') {
                goalX = targetEnemy.x;
                goalZ = targetEnemy.z;
              }
            } else if (order === 'CHARGE' || distToEnemy < 3.2) {
              goalX = targetEnemy.x;
              goalZ = targetEnemy.z;
            }
          }

          // Move toward goal with O(N) spatial separation
          const toGoalX = goalX - ally.x;
          const toGoalZ = goalZ - ally.z;
          const distToGoal = Math.hypot(toGoalX, toGoalZ);
          const stopDist = order === 'CHARGE' && targetEnemy ? 1.85 : 0.35;

          let moveSpd = 0;
          if (distToGoal > stopDist) {
            const baseSpd = ally.horse ? 5.6 : 3.3;
            moveSpd = baseSpd * arrMeta.moveSpeedMultiplier;
            ally.x += (toGoalX / distToGoal) * moveSpd * delta;
            ally.z += (toGoalZ / distToGoal) * moveSpd * delta;
          }

          // Separation push from neighbors
          const neighbors = grid.queryRadius(ally.x, ally.z, 1.05);
          for (const nb of neighbors) {
            if (nb.id === ally.id || !nb.alive) continue;
            const sx = ally.x - nb.x;
            const sz = ally.z - nb.z;
            const sd = Math.hypot(sx, sz) || 0.01;
            if (sd < 0.95) {
              ally.x += (sx / sd) * 1.6 * delta;
              ally.z += (sz / sd) * 1.6 * delta;
            }
          }

          ally.yaw = desiredFacing;
          ally.animator.setMove(0, ally.horse ? 0 : moveSpd);

          // Combat AI for Ally
          ally.aiTimer -= delta;
          if (arrMeta.forceShieldBlock && ally.hasShield && distToEnemy > 2.2) {
            ally.animator.block('up');
          } else if (ally.division === 'ARCHERS' && targetEnemy && fireOrderRef.current === 'FREE_FIRE') {
            if (ally.aiTimer <= 0 && distToEnemy < 22) {
              ally.animator.play('bow_release', { force: true });
              const origin = new THREE.Vector3(ally.x, 1.45, ally.z);
              const dir = new THREE.Vector3(
                targetEnemy.x - ally.x,
                0.6 + distToEnemy * 0.04,
                targetEnemy.z - ally.z,
              ).normalize();
              fireArrowProjectile('ALLY', origin, dir);
              ally.aiTimer = 2.4 + Math.random() * 0.8;
            }
          } else if (targetEnemy && distToEnemy < 2.35 && ally.aiTimer <= 0) {
            ally.animator.release();
            const dir = ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)];
            ally.attackDir = dir;
            ally.animator.attack(dir, false);
            ally.aiTimer = 1.15 + Math.random() * 0.4;

            // Resolve ally melee strike against targetEnemy
            const enemyParry = evaluateDirectionalParry({
              attackDir: dir,
              defenderBlockDir: targetEnemy.blockDir,
              hasShield: targetEnemy.hasShield,
              isBlocking: targetEnemy.animator.isBlocking(),
              isFacingAttacker: true,
            });
            if (!enemyParry.blocked) {
              const dmg = Math.round((ally.horse ? 32 : 24) * enemyParry.damageMultiplier);
              targetEnemy.hp = Math.max(0, targetEnemy.hp - dmg);
              if (targetEnemy.hp <= 0) {
                targetEnemy.alive = false;
                targetEnemy.animator.fall();
                setKillsCount((k) => k + 1);
                spawnDamageText(`⚔️ Müttefik Leşi: ${targetEnemy.name}`, '#34d399', new THREE.Vector3(targetEnemy.x, 0, targetEnemy.z));
              } else {
                targetEnemy.animator.hitReact(true);
              }
            }
          }
        });

        // Update Enemy Fighters
        for (const enemy of aliveEnemies) {
          const nearestAlly = grid.findNearest(enemy.x, enemy.z, 60, (c) => c.team === 'ALLY' && c.alive);
          const distToPlayer = Math.hypot(playerPosRef.current.x - enemy.x, playerPosRef.current.z - enemy.z);
          // Target player if player is within close combat range (< 4.2m) or if no allies are alive
          const targetPlayer = playerHpRef.current > 0 && (!nearestAlly || distToPlayer < 4.2);

          const tx = targetPlayer ? playerPosRef.current.x : nearestAlly!.agent.x;
          const tz = targetPlayer ? playerPosRef.current.z : nearestAlly!.agent.z;
          const dist = targetPlayer ? distToPlayer : nearestAlly!.dist;

          enemy.yaw = Math.atan2(tx - enemy.x, tz - enemy.z);

          let moveSpd = 0;
          const standOff = enemy.division === 'ARCHERS' ? 10.5 : 1.95;
          if (dist > standOff) {
            moveSpd = 3.1;
            enemy.x += ((tx - enemy.x) / dist) * moveSpd * delta;
            enemy.z += ((tz - enemy.z) / dist) * moveSpd * delta;
          }
          enemy.animator.setMove(0, moveSpd);

          enemy.aiTimer -= delta;
          if (enemy.division === 'ARCHERS' && enemy.aiTimer <= 0 && dist < 22) {
            enemy.animator.play('bow_release', { force: true });
            const origin = new THREE.Vector3(enemy.x, 1.45, enemy.z);
            const dir = new THREE.Vector3(tx - enemy.x, 0.55 + dist * 0.04, tz - enemy.z).normalize();
            fireArrowProjectile('ENEMY', origin, dir);
            enemy.aiTimer = 2.8 + Math.random() * 0.9;
          } else if (dist < 2.35 && enemy.aiTimer <= 0) {
            if (Math.random() < 0.35 && enemy.hasShield) {
              enemy.blockDir = ALL_DIRS[Math.floor(Math.random() * 4)];
              enemy.animator.block(enemy.blockDir);
              enemy.aiTimer = 0.65;
            } else {
              enemy.animator.release();
              const dir = ALL_DIRS[Math.floor(Math.random() * 4)];
              enemy.attackDir = dir;
              enemy.animator.attack(dir, false);
              enemy.aiTimer = 1.25 + Math.random() * 0.45;

              if (targetPlayer) {
                const pAnim = playerAnimatorRef.current;
                const pShield = shieldTypeRef.current !== 'NONE' && weaponTypeRef.current === 'ONE_HANDED_SWORD';
                const parry = evaluateDirectionalParry({
                  attackDir: dir,
                  defenderBlockDir: combatDirRef.current,
                  hasShield: pShield,
                  isBlocking: !!pAnim?.isBlocking(),
                  isFacingAttacker: true,
                });
                if (parry.blocked) {
                  sound.playShieldHit();
                  spawnDamageText('🛡️ SAVUŞTURULDU!', '#38bdf8', playerPosRef.current);
                } else {
                  const dmg = Math.round((enemy.isLord ? 22 : 14) * parry.damageMultiplier);
                  playerHpRef.current = Math.max(0, playerHpRef.current - dmg);
                  setPlayerHp(playerHpRef.current);
                  spawnDamageText(`-${dmg} HASAR ALDIN!`, '#ef4444', playerPosRef.current);
                  if (playerHpRef.current <= 0) {
                    pAnim?.fall();
                    sound.playDefeatSting();
                    spawnDamageText('☠️ AĞIR YARALANDIN VE YERE DÜŞTÜN!', '#dc2626', playerPosRef.current);
                    setTimeout(() => {
                      setBattleOutcome((prev) => prev ?? {
                        victory: false,
                        enemiesDefeated: killsCountRef.current,
                        losses: { infantry: 3, archer: 2, cavalry: 1 },
                      });
                    }, 1500);
                  } else {
                    pAnim?.hitReact(true);
                  }
                }
              } else if (nearestAlly) {
                const ally = nearestAlly.agent;
                const inSW = formationArrangementRef.current === 'SHIELD_WALL';
                const parry = evaluateDirectionalParry({
                  attackDir: dir,
                  defenderBlockDir: ally.blockDir,
                  hasShield: ally.hasShield,
                  isBlocking: ally.animator.isBlocking(),
                  isFacingAttacker: true,
                  inShieldWall: inSW,
                });
                if (!parry.blocked) {
                  ally.hp = Math.max(0, ally.hp - Math.round(18 * parry.damageMultiplier));
                  if (ally.hp <= 0) {
                    ally.alive = false;
                    ally.animator.fall();
                  } else {
                    ally.animator.hitReact(true);
                  }
                }
              }
            }
          }
        }

        // Sync transforms & animators for all skirmish units
        for (const u of units) {
          if (!u.alive) u.animator.setMove(0, 0);
          u.animator.update(delta);
          if (u.horse) {
            u.horse.root.position.set(u.x, 0, u.z);
            u.horse.root.rotation.y = u.yaw;
            updateWarHorseAnimation(u.horse, u.alive ? 4.2 : 0, elapsed);
            applyRiderMountedPosture(u.rig, u.alive ? 4.2 : 0, elapsed);
          } else {
            u.rig.root.position.set(u.x, 0, u.z);
            u.rig.root.rotation.y = u.yaw;
          }
        }

        const curAllies = units.filter((u) => u.team === 'ALLY' && u.alive).length;
        const curEnemies = units.filter((u) => u.team === 'ENEMY' && u.alive).length;
        setAllyAliveCount(curAllies);
        setEnemyAliveCount(curEnemies);

        // Next wave check OR Campaign Battle Victory/Defeat
        if (curEnemies === 0 && units.length > 0) {
          if (isFieldOrSiege) {
            if (!battleOutcome) {
              setBattleOutcome({
                victory: true,
                enemiesDefeated: killsCountRef.current || units.filter((u) => u.team === 'ENEMY').length,
                losses: { infantry: 1, archer: 1 },
              });
            }
          } else {
            setSkirmishWave((w) => {
              const nextW = w + 1;
              spawnSkirmishWave(nextW, false);
              spawnDamageText(`🏆 DALGA ${w} TEMİZLENDİ! DALGA ${nextW} GELİYOR!`, '#facc15', playerPosRef.current);
              return nextW;
            });
          }
        } else if (isFieldOrSiege && playerHpRef.current <= 0 && curAllies === 0 && !battleOutcome) {
          setBattleOutcome({
            victory: false,
            enemiesDefeated: killsCountRef.current,
            losses: { infantry: 4, archer: 2, cavalry: 2 },
          });
        }
      } else if (battleMode === 'MASS_BATTLE') {
        const pool = battlePoolRef.current;
        const stepRes = pool.stepSimulation(
          delta,
          playerPosRef.current.x,
          playerPosRef.current.z,
          playerYawRef.current,
          formationOrderRef.current,
          formationArrangementRef.current,
          fireOrderRef.current === 'FREE_FIRE',
          holdAnchorRef.current,
        );

        if (instancedBattleSceneRef.current) {
          instancedBattleSceneRef.current.syncFromPool(pool);
        }

        if (stepRes.gateJustBreached) {
          sound.playWarhorn();
          spawnDamageText(
            '🪵 KOÇBAŞI KALE KAPISINI YIKTI! HÜCUM!',
            '#facc15',
            new THREE.Vector3(0, 2.0, -21.5),
          );
        }

        // Throttle React HUD telemetry updates to ~6Hz
        hudSyncThrottleRef.current += delta;
        if (hudSyncThrottleRef.current >= 0.16) {
          hudSyncThrottleRef.current = 0;
          setAllyAliveCount(pool.alliesAliveCount);
          setEnemyAliveCount(pool.enemiesAliveCount);
          setPooledArrowsCount(pool.projActiveTotal);
          setPooledCorpsesCount(pool.corpseCount);
          setSiegeGateHpPct(Math.round((pool.siege.gateHp / pool.siege.gateMaxHp) * 100));
          if (stepRes.killsDelta > 0) {
            setKillsCount((k) => k + stepRes.killsDelta);
            const allyKilledEnemy = Math.random() > 0.4;
            if (allyKilledEnemy) {
              const allyKillers = ['Vlandiya Şövalyesi', 'Sancak Muhafızı', 'Kalradya Piyadesi', 'Usta Okçu'];
              const enemyVictims = ['İmparatorluk Lejyoneri', 'Düşman Okçusu', 'Düşman Süvarisi'];
              const kName = allyKillers[Math.floor(Math.random() * allyKillers.length)];
              const vName = enemyVictims[Math.floor(Math.random() * enemyVictims.length)];
              pushKillFeedEntry(kName, vName, 'ALLY', '⚔️');
            } else {
              const enemyKillers = ['Düşman Lejyoneri', 'Düşman Süvarisi', 'Kuşatmacı Asker'];
              const allyVictims = ['Sancak Askeri', 'Müttefik Piyade', 'Acemi'];
              const kName = enemyKillers[Math.floor(Math.random() * enemyKillers.length)];
              const vName = allyVictims[Math.floor(Math.random() * allyVictims.length)];
              pushKillFeedEntry(kName, vName, 'ENEMY', '⚔️');
            }
          }

          // Telemetry reporting to campaign
          if (onBattleTelemetryRef.current) {
            const preset = BATTLE_SCALE_PRESETS[battleScaleRef.current];
            onBattleTelemetryRef.current({
              playerHp: playerHpRef.current,
              playerMaxHp: 100,
              alliesAlive: pool.alliesAliveCount,
              alliesTotal: preset.alliesCount,
              enemiesAlive: pool.enemiesAliveCount,
              enemiesTotal: preset.enemiesCount,
              enemyCommanderName:
                targetLordRef.current?.name ??
                (targetSettlementRef.current ? `${targetSettlementRef.current.name} Garnizonu` : 'Düşman Ordusu'),
              orderSummary: `${selectedDivisionRef.current}: ${formationOrderRef.current} (${formationArrangementRef.current})`,
            });
          }

          // Campaign battle completion check
          if (isFieldOrSiege && !battleOutcome) {
            const preset = BATTLE_SCALE_PRESETS[battleScaleRef.current];
            if (pool.enemiesAliveCount <= 0 && pool.alliesAliveCount > 0) {
              setBattleOutcome({
                victory: true,
                enemiesDefeated: preset.enemiesCount,
                losses: { infantry: 2, archer: 1 },
              });
            } else if (pool.alliesAliveCount <= 0) {
              setBattleOutcome({
                victory: false,
                enemiesDefeated: Math.floor(preset.enemiesCount * 0.4),
                losses: { infantry: 5, archer: 3, cavalry: 2 },
              });
            }
          }
        }
      }

      // ─ 4. Camera (Bannerlord Over-the-shoulder view with dynamic aim & mount elevation) ─
      if (mode === 'PLAYABLE') {
        const isAiming = isAimingBowRef.current;
        // Çekiş gücü: 0 → yay gerilmemiş, 1 → tam çekiş. HUD çubuğu ve kamera
        // yakınlaşması bu değerle sürekli güncellenir.
        const bowPower = isAiming ? playerAnimatorRef.current?.getBowDrawProgress() ?? 0 : 0;
        const bar = bowPowerBarRef.current;
        if (bar) {
          bar.style.width = `${Math.min(100, bowPower * 100).toFixed(1)}%`;
          // %25 altı = kırmızımsı uyarı rengi
          bar.style.filter = bowPower > 0 && bowPower < BOW_MIN_RELEASE_DRAW ? 'saturate(0.4)' : 'none';
          const label = bowPowerLabelRef.current;
          if (label) label.textContent = `${Math.round(bowPower * 100)}%`;
        }
        const targetFov = isAiming ? 48 - bowPower * 8 : mounted ? 66 : 65;
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.12);
          camera.updateProjectionMatrix();
        }

        // Mount & Blade: Warband merkezlenmiş 3. şahıs kamera
        // Karakter ekranın tam ortasında (sağa kaydırma yok: rightOffset = 0)
        // Kamera miğferin hemen üstünden (y ~ 1.75m) ileri bakar, nişangâh doğrudan kaskın üstündeki boşluğa odaklanır
        const baseDist = playableCamDistRef.current;
        const targetCamDist = isAiming ? Math.max(1.7, baseDist * 0.72) : mounted ? baseDist + 0.85 : baseDist;
        const targetRightOffset = isAiming ? 0.28 : mounted ? 0.35 : 0.22;
        const pivotY = playerPosRef.current.y + (mounted ? 2.35 : 1.65);

        const fwdX = Math.sin(playerYawRef.current);
        const fwdZ = Math.cos(playerYawRef.current);
        const rightX = -Math.cos(playerYawRef.current);
        const rightZ = Math.sin(playerYawRef.current);

        const pitch = playerPitchRef.current;
        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);

        const cx = playerPosRef.current.x - fwdX * cosP * targetCamDist + rightX * targetRightOffset;
        const cz = playerPosRef.current.z - fwdZ * cosP * targetCamDist + rightZ * targetRightOffset;
        const cy = pivotY + 0.20 - sinP * targetCamDist * 0.65;

        const targetCamPos = _tmpV.set(cx, cy, cz);
        camera.position.lerp(targetCamPos, CAM_LERP);

        // İleri bakış noktası: Warband nişangâh çizgisi
        const lookDist = 20.0;
        camera.lookAt(
          playerPosRef.current.x + fwdX * cosP * lookDist + rightX * targetRightOffset,
          pivotY + sinP * lookDist,
          playerPosRef.current.z + fwdZ * cosP * lookDist + rightZ * targetRightOffset,
        );
      } else {
        const o = orbitRef.current;
        camera.position.set(
          Math.sin(o.azimuth) * Math.cos(o.polar) * o.distance,
          Math.sin(o.polar) * o.distance + (mounted ? 1.45 : 0.8),
          Math.cos(o.azimuth) * Math.cos(o.polar) * o.distance,
        );
        camera.lookAt(0, mounted ? 1.65 : 1.1, 0);
      }

      // ─ 5. Flying arrows ─
      const arrows = flyingArrowsRef.current;
      for (const arrow of arrows) {
        if (!arrow.inFlight) continue;

        arrow.velocity.addScaledVector(gravity, delta);
        arrow.mesh.position.addScaledVector(arrow.velocity, delta);

        const forward = arrow.velocity.clone().normalize();
        arrow.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);

        // Ground collision
        if (arrow.mesh.position.y <= 0.05) {
          arrow.inFlight = false;
          arrow.mesh.position.y = 0.05;
          continue;
        }

        // Archery target collision
        const distToTarget = arrow.mesh.position.distanceTo(new THREE.Vector3(-5.5, 1.25, -8));
        if (distToTarget < 0.6) {
          arrow.inFlight = false;
          sound.playShieldHit();
          const bullseye = distToTarget < 0.2;
          const full = arrow.power > 0.9;
          const score = bullseye
            ? full ? "🎯 100 TAM 12'DEN! (TAM ÇEKİŞ)" : "🎯 100 TAM 12'DEN!"
            : full ? '🎯 75 İSABET! (TAM ÇEKİŞ)' : '🎯 75 İSABET!';
          spawnDamageText(score, '#facc15', arrow.mesh.position);
          continue;
        }

        // Dummy collision
        const dummyObj = dummyRef.current;
        if (dummyObj) {
          const distToDummy = arrow.mesh.position.distanceTo(new THREE.Vector3(4.5, 1.2, -5.5));
          if (distToDummy < 0.7) {
            arrow.inFlight = false;
            dummyObj.hit();
            sound.playShieldHit();
            const dummyDmg = Math.round(50 + 40 * arrow.power);
            spawnDamageText(
              `💥 ${dummyDmg} DELİCİ OK HASARI!${arrow.power > 0.9 ? ' (TAM ÇEKİŞ)' : ''}`,
              arrow.power > 0.9 ? '#f97316' : '#ef4444',
              arrow.mesh.position,
            );
            setDummyHitCount((c) => c + 1);
            continue;
          }
        }

        // Duel Bot collision
        if ((arenaBattleModeRef.current === 'TRAINING' || arenaBattleModeRef.current === 'DUEL') && arrow.team === 'ALLY') {
          const botRoot = botRigRef.current?.root;
          if (botRoot && botHpRef.current > 0) {
            const distToBot = arrow.mesh.position.distanceTo(
              new THREE.Vector3(botRoot.position.x, 1.15, botRoot.position.z),
            );
            if (distToBot < 0.85) {
              arrow.inFlight = false;
              sound.playShieldHit();
              if (botAnimatorRef.current?.isBlocking()) {
                spawnDamageText('🛡️ KALKAN OKU YUTTU!', '#38bdf8', botRoot.position);
              } else {
                const bowDmg = Math.round(20 + 32 * arrow.power);
                botHpRef.current = Math.max(0, botHpRef.current - bowDmg);
                setBotHp(botHpRef.current);
                if (botHpRef.current <= 0) {
                  botAnimatorRef.current?.fall();
                  botRespawnTimerRef.current = 2.6;
                  setKillsCount((k) => k + 1);
                  spawnDamageText(`🏹 OK İLE DEVİRDİN! (+${bowDmg})`, '#facc15', botRoot.position);
                } else {
                  botAnimatorRef.current?.hitReact(true);
                  spawnDamageText(`🏹 -${bowDmg} DELİCİ OK!`, arrow.power > 0.9 ? '#fb923c' : '#ef4444', botRoot.position);
                }
              }
              continue;
            }
          }
        }

        // Skirmish fighters & Player arrow collision
        if (arenaBattleModeRef.current === 'SKIRMISH') {
          // Check collision with player if arrow is from enemy
          if (arrow.team === 'ENEMY' && playerHpRef.current > 0) {
            const pPos = playerPosRef.current;
            const dToP = arrow.mesh.position.distanceTo(
              new THREE.Vector3(pPos.x, isMounted ? 2.0 : 1.3, pPos.z),
            );
            if (dToP < 0.95) {
              arrow.inFlight = false;
              sound.playShieldHit();
              const pAnim = playerAnimatorRef.current;
              const hasShield = shieldTypeRef.current !== 'NONE';
              const isBlocking = !!pAnim?.isBlocking();
              if (isBlocking && hasShield) {
                spawnDamageText('🛡️ OK KALKANA SAPLANDI!', '#38bdf8', pPos);
              } else {
                const dmg = Math.round(20 + 18 * arrow.power);
                playerHpRef.current = Math.max(0, playerHpRef.current - dmg);
                setPlayerHp(playerHpRef.current);
                spawnDamageText(`🏹 -${dmg} OK HASARI!`, '#ef4444', pPos);
                if (playerHpRef.current <= 0) {
                  pAnim?.fall();
                  sound.playDefeatSting();
                  spawnDamageText('☠️ OKLA VURULDUN VE YERE DÜŞTÜN!', '#dc2626', pPos);
                  setTimeout(() => {
                    setBattleOutcome((prev) => prev ?? {
                      victory: false,
                      enemiesDefeated: killsCountRef.current,
                      losses: { infantry: 2, archer: 1 },
                    });
                  }, 1500);
                } else {
                  pAnim?.hitReact(true);
                }
              }
              continue;
            }
          }

          let hitUnit = false;
          for (const u of skirmishUnitsRef.current) {
            if (!u.alive || u.team === arrow.team) continue;
            const d = arrow.mesh.position.distanceTo(new THREE.Vector3(u.x, 1.2, u.z));
            if (d < 0.85) {
              arrow.inFlight = false;
              hitUnit = true;
              sound.playShieldHit();
              const inSW = u.team === 'ALLY' && formationArrangementRef.current === 'SHIELD_WALL';
              if ((u.animator.isBlocking() && u.hasShield) || (inSW && u.hasShield)) {
                const reduced = Math.round(36 * (inSW ? 0.15 : 0));
                if (reduced > 0) u.hp = Math.max(0, u.hp - reduced);
                spawnDamageText('🛡️ KALKAN DUVARI OKU TUTTU!', '#38bdf8', new THREE.Vector3(u.x, 0, u.z));
              } else {
                u.hp = Math.max(0, u.hp - 38);
                if (u.hp <= 0) {
                  u.alive = false;
                  u.animator.fall();
                  if (u.team === 'ENEMY') {
                    setKillsCount((k) => k + 1);
                    if (u.isLord) {
                      sound.playVictoryFanfare();
                      spawnDamageText(`🏹👑 ${u.name.toUpperCase()} OKLA MAĞLUP EDİLDİ!`, '#fbbf24', new THREE.Vector3(u.x, 2.0, u.z));
                      pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', u.name, 'ALLY', '🏹');
                    } else {
                      pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', u.name, 'ALLY', '🏹');
                    }
                  }
                } else {
                  u.animator.hitReact(true);
                }
              }
              break;
            }
          }
          if (hitUnit) continue;
        }

        // MASS_BATTLE arrow collision
        if (arenaBattleModeRef.current === 'MASS_BATTLE') {
          const pool = battlePoolRef.current;
          const nearby = pool.spatialGrid.queryRadius(arrow.mesh.position.x, arrow.mesh.position.z, 1.0);
          for (const cand of nearby) {
            if (cand.team !== 2 || pool.soldierAlive[cand.index] === 0) continue;
            arrow.inFlight = false;
            pool.soldierHp[cand.index] -= 48;
            sound.playShieldHit();
            if (pool.soldierHp[cand.index] <= 0) {
              pool.soldierAlive[cand.index] = 0;
              pool.recordFallenCorpse(pool.soldierX[cand.index], 0.08, pool.soldierZ[cand.index], pool.soldierYaw[cand.index], 2);
              setKillsCount((k) => k + 1);
              spawnDamageText('🏹 OK İLE DEVİRDİN!', '#facc15', arrow.mesh.position);
            }
            break;
          }
          if (!arrow.inFlight) continue;
        }

        // Lifetime
        if (Date.now() - arrow.spawnTime > ARROW_LIFETIME) {
          arrow.inFlight = false;
          scene.remove(arrow.mesh);
        }
      }

      renderer.render(scene, camera);
    };

    loop();

    // ── Resize handler ──
    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(animIdRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneCreatedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // EMPTY DEPS — scene created once

  // ══════════════════════════════════════════════════════════════════════
  //  EQUIPMENT SYNC — reacts to React state changes, updates the rig
  //  WITHOUT rebuilding the 3D scene
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const rig = playerRigRef.current;
    const anim = playerAnimatorRef.current;
    if (!rig) return;

    const opts: CharacterVisualOptions = {
      skinTone: '#dfa882',
      hairColor: '#382212',
      beardColor: '#382212',
      factionColor,
      hasBeard,
      weaponType,
      shieldType,
      helmetType,
      armorTier,
    };

    applyEquipmentToRig(rig, opts);

    // Animator needs to reset to pick up new weapon class
    if (anim) anim.reset();
  }, [weaponType, shieldType, helmetType, armorTier, factionColor, hasBeard]);

  // ── Wireframe toggle ──
  useEffect(() => {
    const rig = playerRigRef.current;
    if (rig) setRigWireframe(rig, isWireframe);
  }, [isWireframe]);

  // ── Cosmetics-only changes (faction color, beard) ──
  useEffect(() => {
    const rig = playerRigRef.current;
    if (rig) {
      applyCosmeticsToRig(rig, { factionColor, hasBeard });
    }
  }, [factionColor, hasBeard]);

  // ── Animation panel trigger ──
  const triggerAnimation = useCallback((anim: CharacterAnimState) => {
    setActiveAnimLabel(anim);
    const animator = playerAnimatorRef.current;
    if (animator) {
      animator.applyLegacyState(anim);
    }
  }, []);

  const triggerDirectionalAction = useCallback((type: 'attack' | 'block', dir: AttackDirection) => {
    setCombatDirection(dir);
    combatDirRef.current = dir;
    setActiveAnimLabel(`${type.toUpperCase()}_${dir.toUpperCase()}`);
    const animator = playerAnimatorRef.current;
    if (animator) {
      if (type === 'attack') animator.attack(dir, false);
      else animator.block(dir);
    }
  }, []);

  // ══════════════════════════════════════════════════════════════════════
  //  JSX UI
  // ══════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-40 bg-[#0d0c0a] text-[#f3ead8] overflow-hidden select-none flex flex-col justify-between pointer-events-auto">
      {/* PRE-BATTLE OBJECT POOL & SHADER WARM-UP LOADING OVERLAY (Arena Test Only) */}
      {!isFieldOrSiege && prewarmStages && (
        <BattlePrewarmModal
          title={
            siegeEnabled
              ? 'KALE KUŞATMASI VE 500v500 ORDU HAVUZU HAZIRLANIYOR'
              : 'MEYDAN MUHAREBESİ VE NESNE HAVUZU HAZIRLANIYOR'
          }
          subtitle="Savaş sırasında FPS düşüşü ve takılma (Garbage Collection) yaşanmaması için 10.000 ok, 10.000 ceset ve ordu matrisleri önceden belleğe tahsis ediliyor."
          scaleId={battleScale}
          siegeEnabled={siegeEnabled}
          stages={prewarmStages}
          onComplete={() => setPrewarmStages(null)}
        />
      )}

      {/* 3D WebGL Arena Canvas */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

      {/* FLOATING 3D HIT DAMAGE LABELS */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {floatingTexts.map((txt) => {
          const age = Date.now() - txt.createdAt;
          if (age > DMG_TEXT_LIFETIME) return null;
          const opacity = Math.max(0, 1 - age / DMG_TEXT_LIFETIME);
          const offsetY = (age / DMG_TEXT_LIFETIME) * 45;
          return (
            <div
              key={txt.id}
              className="absolute font-display font-black text-sm tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] animate-bounce"
              style={{
                left: '50%',
                top: `calc(42% - ${offsetY}px)`,
                transform: 'translate(-50%, -50%)',
                color: txt.color,
                opacity,
              }}
            >
              {txt.text}
            </div>
          );
        })}
      </div>

      {/* TOP STATUS, BATTLE MODE & TACTICAL COMMAND BAR */}
      <header className="relative z-30 p-3 flex flex-col gap-2 pointer-events-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                if (document.pointerLockElement) document.exitPointerLock();
                onReturnToMap();
              }}
              className="px-3.5 py-1.5 rounded text-xs font-bold bg-[#1e1913] hover:bg-[#2b2218] text-[#fde68a] border border-[#c6a15b]/40 shadow-lg flex items-center gap-1.5 transition-colors"
            >
              <span>←</span>
              <span>Sefer Haritası</span>
            </button>

            {onOpenMarket && (
              // Arena bir yerleşim değil: pazar buradan açılmaz (Bannerlord'da
              // pazaryeri yalnız şehir/kale/köy menüsündedir). Yalnız envanter.
              <button
                type="button"
                onClick={onOpenMarket}
                title="Savaş alanında pazaryeri yok — yalnız envanter"
                className="px-3 py-1.5 rounded text-xs font-bold bg-[#2a2015] hover:bg-[#3d2e20] text-[#fde68a] border border-[#c6a15b]/50 shadow transition-colors flex items-center gap-1.5"
              >
                <span aria-hidden="true">⚖</span>
                <span>Envanter</span>
              </button>
            )}

            {/* Arena Mode Switcher OR Field/Siege Encounter Badge */}
            {isFieldOrSiege ? (
              <div className="px-3 py-1.5 rounded bg-[#18130e]/95 border border-[#c6a15b]/50 text-xs font-bold text-[#fde68a] flex items-center gap-2 shadow-lg">
                <span className="text-amber-400">⚔️</span>
                <span>
                  {effectiveMode === 'SIEGE'
                    ? `${targetSettlement?.name ?? 'Kale'} Kuşatması`
                    : `${targetLord?.name ?? 'Düşman Ordusu'} ile Meydan Muharebesi`}
                </span>
              </div>
            ) : (
              <div className="p-0.5 rounded bg-[#18130e] border border-[#c6a15b]/40 flex flex-wrap items-center gap-1 text-xs">
                {(
                  [
                    { id: 'TRAINING', label: '🎯 Antrenman' },
                    { id: 'DUEL', label: '⚔️ 1v1 Düello' },
                    { id: 'SKIRMISH', label: '🛡️ Bölük Savaşı' },
                    { id: 'MASS_BATTLE', label: '🏰 500v500 Ordu & Kuşatma (Havuzlu)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`arena-mode-${m.id}`}
                    onClick={() => setArenaBattleMode(m.id)}
                    className={`px-2.5 py-1 rounded font-bold transition-colors ${
                      arenaBattleMode === m.id
                        ? 'bg-[#991b1b] text-[#fde68a] border border-[#fbbf24]/40'
                        : 'text-[#a89b84] hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {/* Mounted WarHorse Toggle (Faz 1.4) */}
            <button
              type="button"
              onClick={() => setIsMounted((prev) => !prev)}
              className={`px-3 py-1.5 rounded text-xs font-bold border shadow transition-colors flex items-center gap-1.5 ${
                isMounted
                  ? 'bg-amber-700 text-white border-amber-300'
                  : 'bg-[#1e1913] text-[#e2d6c1] border-[#c6a15b]/40 hover:bg-[#2b2218]'
              }`}
            >
              <span>🏇</span>
              <span>{isMounted ? 'Savaş Atında [M: İn]' : 'Savaş Atına Bin [M]'}</span>
            </button>
          </div>

          {/* Right: Health / Kills / Pool Stats / Camera Mode */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <div className="px-3 py-1 rounded bg-[#18130e]/95 border border-[#c6a15b]/30 text-xs font-semibold text-[#e2d6c1] flex items-center gap-3 shadow font-mono-tabular">
              <span className="text-red-400 font-bold">❤️ Can: {playerHp}%</span>
              {arenaBattleMode === 'DUEL' && (
                <span className="text-purple-300 font-bold">⚔️ Rakip: {botHp}%</span>
              )}
              {arenaBattleMode === 'SKIRMISH' && (
                <span className="text-emerald-300 font-bold">
                  🚩 Dalga {skirmishWave} ({allyAliveCount} vs {enemyAliveCount})
                </span>
              )}
              {arenaBattleMode === 'MASS_BATTLE' && (
                <>
                  <span className="text-emerald-300 font-bold" data-testid="mass-battle-army-counts">
                    ⚔️ Ordu: {allyAliveCount} vs {enemyAliveCount}
                  </span>
                  <span className="text-amber-300 font-bold hidden lg:inline" data-testid="mass-battle-pool-stats">
                    🏹 Ok: {pooledArrowsCount}/10B · ☠️ Ceset: {pooledCorpsesCount}/10B
                  </span>
                  {siegeEnabled && (
                    <span className="text-orange-300 font-bold">
                      🪵 Kapı: %{siegeGateHpPct}
                    </span>
                  )}
                </>
              )}
              <span className="text-[#fbbf24] font-bold">☠️ Leş: {killsCount}</span>
            </div>

            {!isFieldOrSiege && (
              <div className="p-0.5 rounded bg-[#1c1711] border border-[#c6a15b]/30 flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (document.pointerLockElement) document.exitPointerLock();
                    setControlMode('PLAYABLE');
                  }}
                  className={`px-2.5 py-1 rounded font-bold transition-colors ${
                    controlMode === 'PLAYABLE'
                      ? 'bg-[#b45309] text-white'
                      : 'text-[#a89b84] hover:text-white'
                  }`}
                >
                  🎮 Savaşçı
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (document.pointerLockElement) document.exitPointerLock();
                    setControlMode('INSPECTOR');
                  }}
                  className={`px-2.5 py-1 rounded font-bold transition-colors ${
                    controlMode === 'INSPECTOR'
                      ? 'bg-[#b45309] text-white'
                      : 'text-[#a89b84] hover:text-white'
                  }`}
                >
                  🔍 360° Manken
                </button>
              </div>
            )}
          </div>
        </div>

        {/* BANNERLORD LIVE BATTLE STRENGTH & GATE HP BAR */}
        {(isFieldOrSiege || arenaBattleMode === 'MASS_BATTLE' || arenaBattleMode === 'SKIRMISH') && (
          <div className="mx-auto w-full max-w-xl pointer-events-auto flex flex-col items-center gap-1 my-1">
            <div className="w-full flex items-center justify-between text-xs font-bold px-2 text-[#e2d6c1]">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <span>Müttefik Kuvvetler ({allyAliveCount})</span>
              </div>
              {siegeEnabled && (
                <div className="flex items-center gap-1 text-amber-300 font-mono text-[11px]">
                  <span>🪵 Kapı:</span>
                  <span className={siegeGateHpPct <= 25 ? 'text-red-400 font-black' : 'text-amber-300'}>
                    %{siegeGateHpPct}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-rose-400">
                <span>
                  {targetLord
                    ? `👑 ${targetLord.title ? `${targetLord.title} ` : 'Lord '}${targetLord.name}`
                    : (targetSettlement ? `🏰 ${targetSettlement.name} Garnizonu` : 'Düşman Kuvvetler')}{' '}
                  ({enemyAliveCount})
                </span>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
              </div>
            </div>

            {/* Live Troop Ratio Bar */}
            <div className="w-full h-2 rounded bg-black/80 border border-[#c6a15b]/40 overflow-hidden flex shadow-lg">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-300"
                style={{
                  width: `${Math.round((allyAliveCount / Math.max(1, allyAliveCount + enemyAliveCount)) * 100)}%`,
                }}
              />
              <div
                className="h-full bg-gradient-to-r from-rose-500 to-rose-700 transition-all duration-300"
                style={{
                  width: `${Math.round((enemyAliveCount / Math.max(1, allyAliveCount + enemyAliveCount)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* BANNERLORD F1-F6 TACTICAL COMMAND SUB-MENU OVERLAY */}
        {(arenaBattleMode === 'SKIRMISH' || arenaBattleMode === 'MASS_BATTLE') && (
          <div className="flex flex-col gap-1.5">
            {/* Active F1 / F2 / F3 Sub-Menu Popup Cards */}
            {activeTacticalMenu && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#100d0a]/95 border-2 border-[#fbbf24]/70 text-xs pointer-events-auto shadow-2xl">
                <span className="text-[#fbbf24] font-black tracking-wider uppercase mr-1">
                  {activeTacticalMenu === 'MOVEMENT'
                    ? 'F1 HAREKET EMİRLERİ:'
                    : activeTacticalMenu === 'FACING'
                      ? 'F2 YÖN EMİRLERİ:'
                      : 'F3 DİZİLİŞ DÜZENLERİ:'}
                </span>

                {activeTacticalMenu === 'MOVEMENT' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        issueHoldPositionOrder();
                        setActiveTacticalMenu(null);
                        showOrderShout('🚩 BU KONUMU TUT!');
                      }}
                      className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
                    >
                      [F1] Bu Konumu Tut
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormationOrder('FOLLOW_ME');
                        formationOrderRef.current = 'FOLLOW_ME';
                        if (tacticalBannerRef.current) tacticalBannerRef.current.visible = false;
                        setActiveTacticalMenu(null);
                        showOrderShout('🛡️ BENİ TAKİP ET!');
                      }}
                      className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
                    >
                      [F2] Beni Takip Et
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormationOrder('CHARGE');
                        formationOrderRef.current = 'CHARGE';
                        if (tacticalBannerRef.current) tacticalBannerRef.current.visible = false;
                        setActiveTacticalMenu(null);
                        showOrderShout('⚔️ TÜM GÜCÜNÜZLE HÜCUM EDİN!');
                      }}
                      className="px-2.5 py-1 rounded bg-[#991b1b] hover:bg-[#b91c1c] text-white border border-rose-400/60 font-bold"
                    >
                      [F3] Hücum Et
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormationOrder('ADVANCE');
                        formationOrderRef.current = 'ADVANCE';
                        setActiveTacticalMenu(null);
                        showOrderShout('🏹 İLERLEYİN VE ATEŞ AÇIN!');
                      }}
                      className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
                    >
                      [F4] İlerle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormationOrder('RETREAT');
                        formationOrderRef.current = 'RETREAT';
                        setActiveTacticalMenu(null);
                        showOrderShout('🛡️ GERİ ÇEKİLİN!');
                      }}
                      className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
                    >
                      [F5] Geri Çekil
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTacticalMenu(null)}
                      className="px-2 py-1 rounded bg-stone-800 text-stone-300 text-[10px]"
                    >
                      [Esc] Kapat
                    </button>
                  </div>
                )}

                {activeTacticalMenu === 'FACING' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTacticalMenu(null);
                        showOrderShout('⚔️ DÜŞMANA DÖNÜN!');
                      }}
                      className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
                    >
                      [F1] Düşmana Dön
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTacticalMenu(null);
                        showOrderShout('🧭 İLERİ YÖNE DÖNÜN!');
                      }}
                      className="px-2.5 py-1 rounded bg-[#2a1e12] hover:bg-[#3d2c1a] text-white border border-[#c6a15b]/40 font-bold"
                    >
                      [F2] İleri Yöne Dön
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTacticalMenu(null)}
                      className="px-2 py-1 rounded bg-stone-800 text-stone-300 text-[10px]"
                    >
                      [Esc] Kapat
                    </button>
                  </div>
                )}

                {activeTacticalMenu === 'FORMATION' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: 'LINE' as const, label: '[F1] Çizgi (Line)' },
                        { id: 'SHIELD_WALL' as const, label: '[F2] 🛡️ Kalkan Duvarı' },
                        { id: 'LOOSE' as const, label: '[F3] Dağınık (Loose)' },
                        { id: 'SQUARE' as const, label: '[F4] ⬛ Kare (Square)' },
                        { id: 'WEDGE' as const, label: '[F5] 🔺 Kama (Wedge)' },
                        { id: 'COLUMN' as const, label: '[F6] ║ Kolon (Column)' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          setFormationArrangement(f.id);
                          formationArrangementRef.current = f.id;
                          setActiveTacticalMenu(null);
                          showOrderShout(`${f.label.split(' ')[1] || f.label} Düzenine Geçildi!`);
                        }}
                        className={`px-2.5 py-1 rounded font-bold border transition-colors ${
                          formationArrangement === f.id
                            ? 'bg-[#991b1b] text-[#fde68a] border-[#fbbf24]'
                            : 'bg-[#2a1e12] text-[#d6cbb5] border-[#c6a15b]/40 hover:bg-[#3d2c1a]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setActiveTacticalMenu(null)}
                      className="px-2 py-1 rounded bg-stone-800 text-stone-300 text-[10px]"
                    >
                      [Esc] Kapat
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Division Cards and Tactical Command Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded bg-[#14100c]/95 border border-[#c6a15b]/40 text-xs pointer-events-auto shadow-xl">
              <div className="flex items-center gap-1.5">
                <span className="text-[#c6a15b] font-bold mr-1">BÖLÜK:</span>
                {(
                  [
                    { id: 'ALL' as const, label: '0: Tümü' },
                    { id: 'INFANTRY' as const, label: '1: Piyade' },
                    { id: 'ARCHERS' as const, label: '2: Okçular' },
                    { id: 'CAVALRY' as const, label: '3: Süvari' },
                    { id: 'HORSE_ARCHERS' as const, label: '4: Atlı Okçu' },
                  ] as const
                ).map((div) => (
                  <button
                    key={div.id}
                    type="button"
                    onClick={() => {
                      setSelectedDivision(div.id);
                      selectedDivisionRef.current = div.id;
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-colors ${
                      selectedDivision === div.id
                        ? 'bg-[#b45309] text-white border border-amber-300/50'
                        : 'bg-[#1f1913] text-[#a89b84] hover:text-white'
                    }`}
                  >
                    {div.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[#c6a15b] font-bold mr-1">KOMUT [F]:</span>
                <button
                  type="button"
                  onClick={() => setActiveTacticalMenu((m) => (m === 'MOVEMENT' ? null : 'MOVEMENT'))}
                  className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                    activeTacticalMenu === 'MOVEMENT'
                      ? 'bg-amber-600 text-white border border-amber-300'
                      : 'bg-[#1f1913] text-[#d6cbb5] hover:bg-[#2c231b]'
                  }`}
                >
                  [F1] Hareket ({formationOrder})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTacticalMenu((m) => (m === 'FACING' ? null : 'FACING'))}
                  className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                    activeTacticalMenu === 'FACING'
                      ? 'bg-amber-600 text-white border border-amber-300'
                      : 'bg-[#1f1913] text-[#d6cbb5] hover:bg-[#2c231b]'
                  }`}
                >
                  [F2] Yön
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTacticalMenu((m) => (m === 'FORMATION' ? null : 'FORMATION'))}
                  className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                    activeTacticalMenu === 'FORMATION'
                      ? 'bg-amber-600 text-white border border-amber-300'
                      : 'bg-[#1f1913] text-[#d6cbb5] hover:bg-[#2c231b]'
                  }`}
                >
                  [F3] Düzen ({formationArrangement})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = fireOrder === 'FREE_FIRE' ? 'HOLD_FIRE' : 'FREE_FIRE';
                    setFireOrder(next);
                    fireOrderRef.current = next;
                    showOrderShout(next === 'FREE_FIRE' ? '🏹 ATEŞ SERBEST!' : '🏹 ATEŞİ KES!');
                  }}
                  className={`ml-1 px-2.5 py-0.5 rounded font-bold border transition-colors ${
                    fireOrder === 'FREE_FIRE'
                      ? 'bg-amber-900/60 text-amber-200 border-amber-500/40'
                      : 'bg-stone-800 text-stone-400 border-stone-600'
                  }`}
                >
                  [F4] {fireOrder === 'FREE_FIRE' ? 'Ateş Serbest' : 'Ateşi Kes'}
                </button>
              </div>

              {/* Faz 3 & Faz 4: Battle Scale (50v50 / 250v250 / 500v500) + Siege Engines + Prewarm Trigger */}
              {!isFieldOrSiege && arenaBattleMode === 'MASS_BATTLE' && (
                <div className="w-full pt-1.5 mt-1 border-t border-[#c6a15b]/25 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#fbbf24] font-bold">ÖLÇEK SEÇİMİ:</span>
                    {(
                      [
                        { id: 'SKIRMISH_50', label: '50v50 (Öncü)' },
                        { id: 'BATTLE_250', label: '250v250 (Meydan)' },
                        { id: 'EPIC_500', label: '500v500 (1000 Asker)' },
                      ] as const
                    ).map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        data-testid={`scale-btn-${sc.id}`}
                        onClick={() => {
                          setBattleScale(sc.id);
                          launchMassBattleWithPrewarm(sc.id, siegeEnabled, true);
                        }}
                        className={`px-2.5 py-0.5 rounded font-bold transition-colors ${
                          battleScale === sc.id
                            ? 'bg-[#b45309] text-white border border-[#fde68a]/50'
                            : 'bg-[#1f1913] text-[#a89b84] hover:text-white'
                        }`}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="toggle-siege-btn"
                      onClick={() => {
                        const next = !siegeEnabled;
                        setSiegeEnabled(next);
                        launchMassBattleWithPrewarm(battleScale, next, false);
                      }}
                      className={`px-2.5 py-0.5 rounded font-bold border transition-colors ${
                        siegeEnabled
                          ? 'bg-amber-800 text-[#fef08a] border-amber-400'
                          : 'bg-[#1f1913] text-[#a89b84] border-[#c6a15b]/30'
                      }`}
                    >
                      🏰 {siegeEnabled ? 'Kuşatma: AÇIK' : 'Kuşatma: KAPALI'}
                    </button>

                    <button
                      type="button"
                      data-testid="retrigger-prewarm-btn"
                      onClick={() => launchMassBattleWithPrewarm(battleScale, siegeEnabled, true)}
                      className="px-2.5 py-0.5 rounded font-bold bg-[#261c12] hover:bg-[#38291b] text-[#fbbf24] border border-[#f59e0b]/50"
                    >
                      🔄 Ön Yükleme Havuzu
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* BANNERLORD AUTHENTIC KILL FEED (Top Right) */}
      {killFeed.length > 0 && (
        <aside
          aria-label="Savaş Bildirimleri"
          className="absolute top-20 right-4 z-30 flex flex-col gap-1.5 pointer-events-none select-none max-w-xs"
        >
          {killFeed.map((item) => (
            <div
              key={item.id}
              className={`px-2.5 py-1 rounded text-[11px] font-bold tracking-wide flex items-center justify-between gap-2 border shadow-lg backdrop-blur-sm transition-all duration-300 ${
                item.killerTeam === 'ALLY'
                  ? 'bg-emerald-950/85 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/85 border-rose-500/40 text-rose-200'
              }`}
            >
              <span className="truncate max-w-[110px]">{item.killer}</span>
              <span className="text-amber-400">{item.icon}</span>
              <span className="truncate max-w-[110px] opacity-90">{item.victim}</span>
            </div>
          ))}
        </aside>
      )}

      {/* TACTICAL ORDER SHOUT BANNER */}
      {orderShout && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-35 pointer-events-none animate-bounce">
          <div className="px-6 py-2 rounded bg-black/90 border-2 border-[#c6a15b] shadow-[0_0_25px_rgba(198,161,91,0.6)] text-center">
            <div className="text-sm font-black tracking-widest text-[#fde68a] uppercase drop-shadow">
              {orderShout}
            </div>
          </div>
        </div>
      )}

      {/* 🏆 VICTORY / ☠️ DEFEAT BATTLE OUTCOME MODAL */}
      {battleOutcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md pointer-events-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md p-6 rounded-lg bg-[#14100c] border-2 border-[#c6a15b] shadow-2xl text-center space-y-4">
            <div className="text-xs font-bold tracking-widest uppercase text-[#c6a15b]">
              {effectiveMode === 'SIEGE' ? 'Kuşatma Muharebesi' : 'Meydan Muharebesi'}
            </div>
            <h2
              className={`text-2xl font-black tracking-widest uppercase ${
                battleOutcome.victory ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {battleOutcome.victory ? '🏆 ZAFER KAZANILDI!' : '☠️ YENİLGİ!'}
            </h2>
            <p className="text-xs text-[#e2d6c1]">
              {battleOutcome.victory
                ? 'Düşman ordusu dağıtıldı ve savaş alanı tamamen kontrolünüz altına geçti.'
                : 'Birlikleriniz ağır kayıplar verdi ve geri çekilmek zorunda kaldınız.'}
            </p>
            <div className="p-3.5 rounded bg-black/60 border border-[#c6a15b]/30 text-xs font-mono space-y-1.5 text-[#d6cbb5]">
              <div className="flex justify-between">
                <span>Etkisiz Hale Getirilen Düşman:</span>
                <span className="font-bold text-amber-300">{battleOutcome.enemiesDefeated}</span>
              </div>
              <div className="flex justify-between">
                <span>Kayıplarınız:</span>
                <span className="font-bold text-rose-300">
                  {Object.entries(battleOutcome.losses)
                    .map(([t, c]) => `${t}: ${c}`)
                    .join(', ') || 'Yok (Kusursuz Zafer)'}
                </span>
              </div>
            </div>
            <button
              type="button"
              data-testid="battle-return-btn"
              onClick={() => {
                if (document.pointerLockElement) document.exitPointerLock();
                if (onBattleCompleteRef.current) {
                  onBattleCompleteRef.current(
                    battleOutcome.victory,
                    battleOutcome.losses,
                    battleOutcome.enemiesDefeated,
                  );
                } else {
                  onReturnToMap();
                }
              }}
              className="w-full py-2.5 rounded font-bold bg-[#b45309] hover:bg-[#d97706] text-white border border-[#fde68a]/50 shadow-lg transition-colors cursor-pointer"
            >
              Sefer Haritasına Dön
            </button>
          </div>
        </div>
      )}

      {/* BANNERLORD / WARBAND 4-DIRECTIONAL COMBAT RETICLE (PLAYABLE MODE ONLY) */}
      {controlMode === 'PLAYABLE' && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-25">
          {weaponType === 'BOW' ? (
            /* Archery Reticle */
            <div className="relative flex flex-col items-center justify-center">
              <div
                className={`relative flex items-center justify-center transition-all duration-150 ${
                  isAimingBow ? 'scale-75' : 'scale-100'
                }`}
              >
                <div
                  className={`w-10 h-10 border border-[#fde68a]/60 rounded-full transition-all duration-200 ${
                    isAimingBow ? 'scale-60 border-amber-400 bg-amber-400/10' : 'scale-100'
                  }`}
                />
                <div className="absolute w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
              </div>
              {/* Canlı çekiş gücü çubuğu — her karede anim.getBowDrawProgress() ile güncellenir */}
              <div
                className={`mt-5 w-44 transition-opacity duration-150 ${isAimingBow ? 'opacity-100' : 'opacity-0'}`}
              >
                <div className="flex items-center justify-between text-[9px] font-bold tracking-widest text-[#c6a15b] mb-1">
                  <span>ÇEKİŞ</span>
                  <span ref={bowPowerLabelRef}>0%</span>
                </div>
                <div className="relative h-2 w-full rounded-sm bg-black/70 border border-[#c6a15b]/50 overflow-hidden">
                  {/* %25 eşik çizgisi: altında bırakılırsa ok takılı kalır */}
                  <div className="absolute top-0 bottom-0 left-1/4 w-px bg-red-400/80" />
                  <div
                    ref={bowPowerBarRef}
                    className="h-full w-0 bg-gradient-to-r from-[#a16207] via-[#f59e0b] to-[#fde68a]"
                  />
                </div>
              </div>
              <div className="mt-2 text-[11px] font-bold tracking-wider px-2.5 py-0.5 rounded bg-black/60 border border-[#c6a15b]/40 backdrop-blur-none text-[#fbbf24]">
                {isAimingBow ? '🏹 NİŞAN ALINIYOR (Bırak: Fırlat | Sağ Tık: İptal)' : '🏹 Sol Tık: Ger & Nişan Al'}
              </div>
              {isAimingBow && (
                <div className="mt-1.5 text-[9px] tracking-wide px-2 py-0.5 rounded bg-black/50 text-[#a8a29e]">
                  %25 altında bırakırsan ok takılı kalır
                </div>
              )}
            </div>
          ) : (
            /* Authentic Mount & Blade: Warband 4-Directional Combat Reticle & Bars */
            <div className="relative flex flex-col items-center justify-center pointer-events-none select-none">
              <div className="relative w-36 h-36 flex items-center justify-center">
                {/* Merkez Blok Kalkan Simgesi (Yalnızca Kalkan Blokundayken) */}
                {isBlocking && shieldType !== 'NONE' && (
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,0.85)]"
                    >
                      <path
                        d="M12 2.5L4.5 5.8V11.6C4.5 16.5 7.7 20.8 12 22.2C16.3 20.8 19.5 16.5 19.5 11.6V5.8L12 2.5Z"
                        fill="currentColor"
                        fillOpacity="0.32"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                )}

                {/* Warband Orijinal Yön Oku Degrade Tanımları */}
                <svg width="0" height="0" className="absolute">
                  <defs>
                    <linearGradient id="wbArenaAttackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#fffee0" />
                      <stop offset="30%" stopColor="#fff266" />
                      <stop offset="75%" stopColor="#facc15" />
                      <stop offset="100%" stopColor="#ca8a04" />
                    </linearGradient>
                    <linearGradient id="wbArenaBlockGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#f0f9ff" />
                      <stop offset="35%" stopColor="#7dd3fc" />
                      <stop offset="80%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* WARBAND TEK YÖNLÜ PARLAK SALDIRI / SAVUNMA OKU */}
                {(
                  [
                    {
                      dir: 'up' as const,
                      posStyle: { top: '4px', left: '50%', transform: 'translateX(-50%)' },
                      rotation: 0,
                    },
                    {
                      dir: 'down' as const,
                      posStyle: { bottom: '4px', left: '50%', transform: 'translateX(-50%)' },
                      rotation: 180,
                    },
                    {
                      dir: 'left' as const,
                      posStyle: { left: '4px', top: '50%', transform: 'translateY(-50%)' },
                      rotation: -90,
                    },
                    {
                      dir: 'right' as const,
                      posStyle: { right: '4px', top: '50%', transform: 'translateY(-50%)' },
                      rotation: 90,
                    },
                  ] as const
                ).map(({ dir, posStyle, rotation }) => {
                  const isSelected = combatDirection === dir;
                  const isCurAttack = isSelected && isAttacking;
                  const isCurBlock = isSelected && isBlocking;
                  const isVisible = isCurAttack || isCurBlock;

                  return (
                    <div
                      key={dir}
                      className={`absolute transition-all duration-75 flex items-center justify-center pointer-events-none ${
                        isVisible ? '' : 'hidden'
                      }`}
                      style={{
                        ...posStyle,
                        filter: isCurBlock
                          ? 'drop-shadow(0 0 8px rgba(56,189,248,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.85))'
                          : isCurAttack
                            ? 'drop-shadow(0 0 8px rgba(250,204,21,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.85))'
                            : 'none',
                      }}
                    >
                      {/* Mount & Blade Warband Orijinal Yön Oku (Yuvarlak Başlı & İnce Gövdeli) */}
                      <svg
                        width="24"
                        height="46"
                        viewBox="0 0 32 64"
                        fill="none"
                        style={{ transform: `rotate(${rotation}deg)` }}
                      >
                        <path
                          d="M 16 3
                             C 18.8 3, 22.8 7.5, 23.2 14.5
                             C 23.5 18.2, 21.2 20.8, 18.8 21.8
                             L 18.8 59
                             C 18.8 61.2, 13.2 61.2, 13.2 59
                             L 13.2 21.8
                             C 10.8 20.8, 8.5 18.2, 8.8 14.5
                             C 9.2 7.5, 13.2 3, 16 3 Z"
                          fill={isCurBlock ? 'url(#wbArenaBlockGrad)' : 'url(#wbArenaAttackGrad)'}
                          stroke={isCurBlock ? '#0284c7' : '#78350f'}
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  );
                })}
              </div>

              {/* Warband Yön Bilgi Rozeti */}
              <div className="mt-3 flex items-center gap-2 text-[11px] font-bold tracking-wider px-3 py-1 rounded-sm bg-black/80 border border-[#c6a15b]/50 backdrop-blur-sm text-[#fbbf24] shadow-lg">
                <span>
                  {isBlocking
                    ? `🛡️ SAVUNMA: ${
                        combatDirection === 'up'
                          ? 'ÜST BLOK'
                          : combatDirection === 'down'
                            ? 'ALT BLOK'
                            : combatDirection === 'left'
                              ? 'SOL BLOK'
                              : 'SAĞ BLOK'
                      }`
                    : isAttacking
                      ? `⚔️ SALDIRI: ${
                          combatDirection === 'up'
                            ? 'TEPEDEN KESİŞ'
                            : combatDirection === 'down'
                              ? 'DÜRTME / SAPLAMA'
                              : combatDirection === 'left'
                                ? 'SOL SAVURMA'
                                : 'SAĞ SAVURMA'
                        }`
                      : `${
                          combatDirection === 'up'
                            ? '⬆️ ÜST VURUŞ / BLOK'
                            : combatDirection === 'down'
                              ? '⬇️ SAPLAMA / ALT BLOK'
                              : combatDirection === 'left'
                                ? '⬅️ SOL KESİK / BLOK'
                                : '➡️ SAĞ KESİK / BLOK'
                        }`}
                </span>
                {shieldType !== 'NONE' && (
                  <span className="text-[10px] text-emerald-400 font-semibold border-l border-[#c6a15b]/40 pl-2">
                    🛡️ Kalkan Koruması Aktif
                  </span>
                )}
              </div>

              {/* BannerPage / Warband Kontrol Kılavuzu Rozeti */}
              <div className="mt-1.5 flex items-center gap-2 text-[10px] tracking-wide px-2.5 py-0.5 rounded bg-black/60 border border-[#c6a15b]/30 text-[#d1c5b0]">
                <span>[Sol Tık] Saldır</span>
                <span>•</span>
                <span>[Sağ Tık] Blok</span>
                <span>•</span>
                <span className="text-[#fbbf24] font-bold">[E] Tekme</span>
                <span>•</span>
                <span className="text-sky-300 font-bold">[Sağ Tık + Sol Tık] Kalkan Darbesi</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM CONTROL DOCK (Only in Arena Training / Testing Mode, Never in Field/Siege Battles) */}
      {!isFieldOrSiege && (
        <footer className="relative z-30 pb-3 px-4 flex flex-col items-center pointer-events-none">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          className="mb-1.5 px-4 py-1 rounded-t bg-[#1a140f] border-t border-x border-[#c6a15b]/40 text-[11px] font-bold text-[#fde68a] hover:bg-[#261f18] transition-colors pointer-events-auto shadow-md"
        >
          {dockCollapsed ? '▴ Savaş & Karakter Kontrol Paneli [H]' : '▾ Paneli Gizle [H]'}
        </button>

        {!dockCollapsed && (
          <div
            className="w-full max-w-4xl p-3 rounded-lg border border-[#c6a15b]/40 bg-[#14100c]/95 shadow-2xl pointer-events-auto flex flex-col gap-2.5"
            style={{ backdropFilter: 'none' }}
          >
            {/* DOCK TABS */}
            <div className="flex items-center justify-between border-b border-[#c6a15b]/20 pb-2 text-xs">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'WEAPON', label: '⚔️ Silah & Duruş' },
                    { id: 'ARMOR', label: '🪖 Zırh & Görünüm' },
                    { id: 'ANIM', label: '🎬 Animasyon Testi' },
                    { id: 'SETTINGS', label: '⚙️ Fizik & Ağır Çekim' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveDockTab(tab.id)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                      activeDockTab === tab.id
                        ? 'bg-[#b45309] text-white border border-[#fde68a]/40 shadow'
                        : 'bg-[#1e1913] text-[#b5a890] hover:text-white border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-[#fbbf24] font-semibold hidden sm:block">
                Karakter: {weaponType} · {armorTier} · {helmetType}
              </div>
            </div>

            {/* TAB 1: WEAPON */}
            {activeDockTab === 'WEAPON' && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {(
                  [
                    { id: 'ONE_HANDED_SWORD', label: 'Tek Elli Kılıç & Kalkan', sub: 'Spatha & Yuvarlak Kalkan', icon: '⚔️' },
                    { id: 'TWO_HANDED_SWORD', label: 'Çift Elli Kılıç (Falx)', sub: 'Yıkıcı Alan Darbesi', icon: '🗡️' },
                    { id: 'BOW', label: 'Kompozit Yay & Ok', sub: 'Menzilli Fizik Atışı', icon: '🏹' },
                    { id: 'SPEAR', label: 'Süvari Kargısı & Mızrak', sub: 'Düz Delici Hamle', icon: '🔱' },
                    { id: 'UNARMED', label: 'Silahsız / Yumruk', sub: 'Güreş & Sokak Dövüşü', icon: '🥊' },
                  ] as const
                ).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWeaponType(w.id)}
                    className={`p-2 rounded text-left border transition-all ${
                      weaponType === w.id
                        ? 'bg-[#2b1f13] border-[#f59e0b] text-[#fef08a] shadow'
                        : 'bg-[#18130e] border-[#c6a15b]/20 text-[#a89b84] hover:border-[#c6a15b]/50'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5 truncate">
                      <span>{w.icon}</span>
                      <span className="truncate">{w.label}</span>
                    </div>
                    <div className="text-[10px] text-[#c6a15b] truncate mt-0.5">{w.sub}</div>
                  </button>
                ))}
              </div>
            )}

            {/* TAB 2: ARMOR */}
            {activeDockTab === 'ARMOR' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                {/* Helmets */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🪖 Miğfer Tipi:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'NONE', label: 'Yok' },
                        { id: 'KETTLE_HAT', label: 'Çanak' },
                        { id: 'SPANGENHELM', label: 'Spangen' },
                        { id: 'IMPERIAL_VISOR', label: 'Katafrakt' },
                      ] as const
                    ).map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setHelmetType(h.id)}
                        className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                          helmetType === h.id
                            ? 'bg-[#b45309] text-white'
                            : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                        }`}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Armor */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🥋 Gövde Zırhı:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'CIVILIAN', label: 'Sivil Tunik' },
                        { id: 'LEATHER', label: 'Deri Gambeson' },
                        { id: 'CHAINMAIL', label: 'Örme Zincir' },
                        { id: 'PLATE', label: 'Ağır Katafrakt' },
                      ] as const
                    ).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setArmorTier(a.id)}
                        className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                          armorTier === a.id
                            ? 'bg-[#b45309] text-white'
                            : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shields */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🛡️ Kalkan Modeli:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {(
                      [
                        { id: 'NONE', label: 'Yok' },
                        { id: 'ROUND_SHIELD', label: 'Yuvarlak' },
                        { id: 'KITE_SHIELD', label: 'Damla' },
                        { id: 'PAVISE', label: 'Pavise' },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setShieldType(s.id)}
                        className={`py-1 px-1.5 rounded text-[10px] font-bold text-center ${
                          shieldType === s.id
                            ? 'bg-[#b45309] text-white'
                            : 'bg-[#241c14] text-[#a89b84] hover:text-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Faction Colors & Beard */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 space-y-1.5">
                  <span className="text-[10px] text-[#c6a15b] font-bold block">🚩 Krallık Renkleri:</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { color: '#991b1b', name: 'Vlandia' },
                      { color: '#581c87', name: 'Empire' },
                      { color: '#166534', name: 'Battania' },
                      { color: '#1e3a8a', name: 'Sturgia' },
                      { color: '#b45309', name: 'Aserai' },
                      { color: '#047857', name: 'Khuzait' },
                    ].map((f) => (
                      <button
                        key={f.color}
                        type="button"
                        onClick={() => setFactionColor(f.color)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          factionColor === f.color ? 'scale-110 border-white' : 'border-black/50'
                        }`}
                        style={{ backgroundColor: f.color }}
                        title={f.name}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHasBeard((b) => !b)}
                    className="w-full mt-1 py-0.5 rounded text-[10px] font-bold bg-[#241c14] hover:bg-[#34281c] text-[#d6cbb5]"
                  >
                    {hasBeard ? '🧔 Sakal: Var' : '🧑 Sakal: Yok (Tıraşlı)'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: ANIMATION TESTER */}
            {activeDockTab === 'ANIM' && (
              <div className="flex flex-col gap-2 text-xs">
                {/* 4 Directional Attacks & Blocks */}
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded bg-[#18130e] border border-[#c6a15b]/20">
                  <span className="text-[10px] text-[#fbbf24] font-bold mr-1">⚔️ 4 Yönlü Saldırı:</span>
                  {(
                    [
                      { dir: 'up', label: '⬆️ Üst (Overhead)' },
                      { dir: 'down', label: '⬇️ Delici (Thrust)' },
                      { dir: 'left', label: '⬅️ Sol Savurma' },
                      { dir: 'right', label: '➡️ Sağ Savurma' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.dir}
                      type="button"
                      onClick={() => triggerDirectionalAction('attack', item.dir)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        activeAnimLabel === `ATTACK_${item.dir.toUpperCase()}`
                          ? 'bg-[#b45309] text-white shadow'
                          : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}

                  <span className="text-[10px] text-[#38bdf8] font-bold ml-2 mr-1">🛡️ 4 Yönlü Blok:</span>
                  {(
                    [
                      { dir: 'up', label: '⬆️ Üst Blok' },
                      { dir: 'down', label: '⬇️ Alt Blok' },
                      { dir: 'left', label: '⬅️ Sol Blok' },
                      { dir: 'right', label: '➡️ Sağ Blok' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.dir}
                      type="button"
                      onClick={() => triggerDirectionalAction('block', item.dir)}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                        activeAnimLabel === `BLOCK_${item.dir.toUpperCase()}`
                          ? 'bg-[#0369a1] text-white shadow'
                          : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* General Actions */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'IDLE', label: 'Duruş (Idle)' },
                      { id: 'WALK', label: 'Yürü' },
                      { id: 'RUN', label: 'Koş' },
                      { id: 'BOW_DRAW', label: '🏹 Yay Çek' },
                      { id: 'BOW_RELEASE', label: '🎯 Oku Fırlat' },
                      { id: 'SHIELD_BASH', label: '🛡️ Kalkan Vur (BannerPage)' },
                      { id: 'KICK', label: '🦶 Tekme (Warband)' },
                      { id: 'HIT_STAGGER', label: '💥 Darbe Al' },
                      { id: 'FALL_DEFEAT', label: '☠️ Yere Düş (Yenilgi)' },
                    ] as const
                  ).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => triggerAnimation(a.id)}
                      className={`px-2.5 py-1.5 rounded text-[11px] font-bold transition-colors ${
                        activeAnimLabel === a.id
                          ? 'bg-[#b45309] text-white shadow'
                          : 'bg-[#221c15] text-[#d1c5b0] hover:text-white hover:bg-[#30271e]'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: SETTINGS */}
            {activeDockTab === 'SETTINGS' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center text-xs">
                {/* Speed slider */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-[#c6a15b] font-bold">⏱️ Animasyon & Fizik Hızı:</span>
                    <span className="font-mono text-[#fbbf24] font-bold">{animSpeed.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.1"
                    value={animSpeed}
                    onChange={(e) => setAnimSpeed(parseFloat(e.target.value))}
                    className="w-full accent-[#f59e0b] cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-[#78716c] mt-0.5">
                    <span>0.1x (Ağır Çekim)</span>
                    <span>1.0x (Normal)</span>
                    <span>1.5x (Hızlı)</span>
                  </div>
                </div>

                {/* Wireframe */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[#f8f0df] block text-[11px]">3B Tel Kafes (Wireframe)</span>
                    <span className="text-[10px] text-[#a89b84]">Düşük poligon ağ yapısını incele</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWireframe((w) => !w)}
                    className={`px-3 py-1 rounded text-[11px] font-bold ${
                      isWireframe ? 'bg-[#15803d] text-white' : 'bg-[#2b2218] text-[#a89b84]'
                    }`}
                  >
                    {isWireframe ? 'AÇIK' : 'KAPALI'}
                  </button>
                </div>

                {/* Reset targets */}
                <div className="p-2 rounded bg-[#18130e] border border-[#c6a15b]/20 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-[#f8f0df] block text-[11px]">Hedef ve Bot Sıfırla</span>
                    <span className="text-[10px] text-[#a89b84]">Kukla pozisyonunu ve okları yenile</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setArrowCount(32);
                      setDummyHitCount(0);
                      playerPosRef.current.set(0, 0, 4);
                      playerYawRef.current = Math.PI;
                      playerPitchRef.current = 0;
                      if (playerAnimatorRef.current) playerAnimatorRef.current.reset();
                      // Clear stuck arrows from scene
                      const scene = sceneRef.current;
                      if (scene) {
                        for (const arrow of flyingArrowsRef.current) {
                          scene.remove(arrow.mesh);
                        }
                        flyingArrowsRef.current = [];
                      }
                    }}
                    className="px-3 py-1 rounded text-[11px] font-bold bg-[#b45309] hover:bg-[#d97706] text-white whitespace-nowrap"
                  >
                    Sıfırla
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </footer>
      )}
    </div>
  );
};
