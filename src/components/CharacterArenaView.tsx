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
  createArrowMesh,
  createCharacterRig,
  createPracticeDummy,
  createTacticalBannerMesh,
  createWarHorseRig,
  deriveRigVisualOptionsFromEquipment,
  updateWarHorseAnimation,
} from '../game/characterRig';
import { setupArenaEnvironment } from '../game/arenaEnvironment';
import {
  getTroopLoadoutForRole,
  getLordLoadout,
  normalizeArsenalFactionId,
} from '../game/factionTroopLoadouts';
import {
  applyFactionArmorToRig,
  mountFactionWeaponToRig,
  mountFactionShieldToRig,
  buildFactionWarHorseRig,
  getArsenalArmorById,
  getArsenalWeaponById,
  getArsenalHorseById,
} from '../armory/FactionArsenal';
import {
  ensureFactionIKClipsRegistered,
} from '../armory/FactionAnimations';
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
  type UnitTierId,
  FACTION_INFO,
  getTotalTroops,
} from '../game/rules';
import type { BattleTelemetry } from '../game/types';
import {
  createDivisionMoraleState,
  applyDivisionCasualtyShock,
  stepDivisionMorale,
  splitBattleCasualties,
  MORALE_ROUT_THRESHOLD,
  type DivisionMoraleState,
} from '../game/battleCombat';
import { DIVISION_LABEL } from '../game/deployment';
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
import {
  createCampaignArmyFighters,
  createSkirmishInitialAllies,
  createSkirmishWaveEnemies,
} from '../game/battleArmySpawner';
import { BattleCombatReticle } from './battle/BattleCombatReticle';
import { BattleTopHeader } from './battle/BattleTopHeader';
import { BattleTacticalHUD } from './battle/BattleTacticalHUD';
import { BattleKillFeed } from './battle/BattleKillFeed';
import { BattleTestingDock } from './battle/BattleTestingDock';
import { BattleOutcomeModal, type BattleOutcomeData } from './battle/BattleOutcomeModal';
import { BattleScoreboardModal, type ScoreboardData } from './battle/BattleScoreboardModal';
import { BattlePrewarmModal } from './BattlePrewarmModal';
import { sound } from '../game/sound';
import { getLordDNA } from '../game/characterMorph';

import {
  type ArenaBattleMode,
  type CharacterArenaViewProps,
  type FloatingText,
  type FlyingArrow,
  type KillFeedItem,
  type SkirmishFighter,
  ALL_DIRS,
  ARENA_RADIUS,
  ARROW_LIFETIME,
  ARROW_SPEED,
  CAM_LERP,
  CAM_LOOK_HEIGHT,
  DMG_TEXT_LIFETIME,
  HORSE_GALLOP_SPEED,
  HORSE_WALK_SPEED,
  MASS_BATTLE_RADIUS,
  MOUSE_SENSITIVITY,
  MOVE_SPEED,
  SPRINT_SPEED,
  createLordBannerBadge,
  getFieldElevation,
} from '../game/arenaTypes';

export type {
  ArenaBattleMode,
  CharacterArenaViewProps,
  FloatingText,
  FlyingArrow,
  KillFeedItem,
  SkirmishFighter,
};
export { getFieldElevation };

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
  const [formationOrder, setFormationOrder] = useState<FormationOrder>('HOLD_POSITION');
  const [formationArrangement, setFormationArrangement] = useState<FormationArrangement>('LINE');
  const [fireOrder, setFireOrder] = useState<FireOrder>('FREE_FIRE');
  const [activeTacticalMenu, setActiveTacticalMenu] = useState<'MOVEMENT' | 'FACING' | 'FORMATION' | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedItem[]>([]);
  const [orderShout, setOrderShout] = useState<string | null>(null);
  const [battleOutcome, setBattleOutcome] = useState<{
    victory: boolean;
    enemiesDefeated: number;
    losses: Partial<TroopRoster>;
    wounded?: Partial<TroopRoster>;
    survivalRate?: number;
  } | null>(null);

  // 11.4: Canlı Tab Muharebe Skor Tablosu & Bölük Morali
  const [showScoreboard, setShowScoreboard] = useState<boolean>(false);
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(null);

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
  const lastFrameTimeRef = useRef<number>(performance.now());
  const elapsedTimeRef = useRef<number>(0);

  const [fpsStats, setFpsStats] = useState<{ current: number; min: number; max: number }>({
    current: 60,
    min: 60,
    max: 60,
  });
  const fpsTrackerRef = useRef<{
    current: number;
    min: number;
    max: number;
    samples: number[];
    lastUpdate: number;
  }>({
    current: 60,
    min: 60,
    max: 60,
    samples: [],
    lastUpdate: 0,
  });

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
  const fieldSpawnZRef = useRef(58);

  const keysDownRef = useRef<Record<string, boolean>>({});
  const controlModeRef = useRef<'INSPECTOR' | 'PLAYABLE'>('PLAYABLE');
  const arenaBattleModeRef = useRef<ArenaBattleMode>(initialBattleMode);
  const battleScaleRef = useRef<BattleScaleId>('EPIC_500');
  const siegeEnabledRef = useRef<boolean>(initialSiegeEnabled);
  const isMountedRef = useRef<boolean>(false);
  const selectedDivisionRef = useRef<DivisionId>('ALL');
  const formationOrderRef = useRef<FormationOrder>('HOLD_POSITION');
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
    z: 22.0,
    facing: Math.PI,
  });
  const divisionOrdersRef = useRef<Record<'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS', FormationOrder>>({
    INFANTRY: 'HOLD_POSITION',
    ARCHERS: 'HOLD_POSITION',
    CAVALRY: 'HOLD_POSITION',
    HORSE_ARCHERS: 'HOLD_POSITION',
  });
  const divisionAnchorsRef = useRef<Record<'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS', { x: number; z: number; facing: number }>>({
    INFANTRY: { x: 0, z: 22.0, facing: Math.PI },
    ARCHERS: { x: 0, z: 26.5, facing: Math.PI },
    CAVALRY: { x: -14.0, z: 24.0, facing: Math.PI },
    HORSE_ARCHERS: { x: 14.0, z: 24.0, facing: Math.PI },
  });

  const showScoreboardRef = useRef(false);
  useEffect(() => { showScoreboardRef.current = showScoreboard; }, [showScoreboard]);
  const battleOutcomeRef = useRef(battleOutcome);
  useEffect(() => { battleOutcomeRef.current = battleOutcome; }, [battleOutcome]);

  const allyMoraleStatesRef = useRef<Map<UnitTierId, DivisionMoraleState>>(new Map());
  const enemyMoraleStatesRef = useRef<Map<UnitTierId, DivisionMoraleState>>(new Map());
  const allyCasualtiesRef = useRef<Partial<TroopRoster>>({});
  const enemyCasualtiesRef = useRef<Partial<TroopRoster>>({});
  const allyRoutedRef = useRef<Partial<TroopRoster>>({});
  const enemyRoutedRef = useRef<Partial<TroopRoster>>({});
  const battleElapsedSecRef = useRef<number>(0);
  const playerFallenNoticeRef = useRef<boolean>(false);

  const divisionIdToUnitTierId = useCallback(
    (div: 'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS'): UnitTierId => {
      if (div === 'ARCHERS') return 'archer';
      if (div === 'CAVALRY') return 'cavalry';
      if (div === 'HORSE_ARCHERS') return 'horseArcher';
      return 'infantry';
    },
    [],
  );

  const unitTierIdToDivision = useCallback(
    (cls: UnitTierId): 'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS' => {
      if (cls === 'archer') return 'ARCHERS';
      if (cls === 'cavalry') return 'CAVALRY';
      if (cls === 'horseArcher') return 'HORSE_ARCHERS';
      return 'INFANTRY';
    },
    [],
  );

  const recordUnitCasualty = useCallback(
    (unit: SkirmishFighter, isCavalryCharge = false) => {
      const cls = divisionIdToUnitTierId(unit.division);
      if (unit.team === 'ALLY') {
        allyCasualtiesRef.current[cls] = (allyCasualtiesRef.current[cls] || 0) + 1;
        const st = allyMoraleStatesRef.current.get(cls);
        if (st) {
          applyDivisionCasualtyShock(st, 1, isCavalryCharge);
        }
      } else {
        enemyCasualtiesRef.current[cls] = (enemyCasualtiesRef.current[cls] || 0) + 1;
        const st = enemyMoraleStatesRef.current.get(cls);
        if (st) {
          applyDivisionCasualtyShock(st, 1, isCavalryCharge);
        }
      }
    },
    [divisionIdToUnitTierId],
  );

  const recordUnitRouted = useCallback(
    (unit: SkirmishFighter) => {
      const cls = divisionIdToUnitTierId(unit.division);
      if (unit.team === 'ALLY') {
        allyRoutedRef.current[cls] = (allyRoutedRef.current[cls] || 0) + 1;
        const st = allyMoraleStatesRef.current.get(cls);
        if (st) st.routedCount++;
      } else {
        enemyRoutedRef.current[cls] = (enemyRoutedRef.current[cls] || 0) + 1;
        const st = enemyMoraleStatesRef.current.get(cls);
        if (st) st.routedCount++;
      }
    },
    [divisionIdToUnitTierId],
  );

  const dismountFallenRider = useCallback((fighter: SkirmishFighter) => {
    if (!fighter.horse) return;
    const group = skirmishGroupRef.current;
    const horse = fighter.horse;
    const fallSide = Math.random() < 0.5 ? 1 : -1;
    const perpX = Math.cos(fighter.yaw) * (0.85 * fallSide);
    const perpZ = -Math.sin(fighter.yaw) * (0.85 * fallSide);

    // Detach rider rig from horse saddle mount and add directly to world skirmish group
    horse.riderMount.remove(fighter.rig.root);
    if (group) {
      group.add(fighter.rig.root);
    }
    const startY = horse.root.position.y + 1.35;
    fighter.x = horse.root.position.x + perpX * 0.4;
    fighter.z = horse.root.position.z + perpZ * 0.4;
    fighter.rig.root.position.set(fighter.x, startY, fighter.z);
    fighter.rig.root.rotation.set(0, fighter.yaw + fallSide * 0.35, 0);

    // Reset rider lower body so it is not frozen in mounted saddle pose
    fighter.rig.pelvis.position.set(0, 0, 0);
    fighter.rig.pelvis.rotation.set(0, 0, 0);
    fighter.rig.leftThigh.rotation.set(0, 0, 0);
    fighter.rig.rightThigh.rotation.set(0, 0, 0);
    fighter.rig.leftShin.rotation.set(0, 0, 0);
    fighter.rig.rightShin.rotation.set(0, 0, 0);
    fighter.rig.leftFoot.rotation.set(0, 0, 0);
    fighter.rig.rightFoot.rotation.set(0, 0, 0);

    // Play fall animation and start airborne tumbling off horse
    fighter.animator.fall();
    fighter.fallingFromHorse = true;
    fighter.fallY = startY;
    fighter.fallVy = 1.4;
    fighter.fallRoll = 0;
    fighter.fallRollSpeed = fallSide * 4.2;
    sound.playDeathScream();

    // Mark horse as riderless; it gallops forward in panic away from the fallen rider
    fighter.isRiderlessHorse = true;
    fighter.panicVelocity = 7.8;
    fighter.panicDir = fighter.yaw + (Math.random() - 0.5) * 0.5;
    fighter.panicTimer = 3.8;
  }, []);

  const handleTacticalRetreat = useCallback(() => {
    if (battleOutcome) return;
    if (document.pointerLockElement) document.exitPointerLock();
    sound.playWarhorn();
    setShowScoreboard(false);

    const medSkill = campaign?.skills?.medicine?.level ?? 35;
    const split = splitBattleCasualties(allyCasualtiesRef.current, medSkill);

    setBattleOutcome({
      victory: false,
      enemiesDefeated: killsCountRef.current,
      losses: split.killed,
      wounded: split.wounded,
      survivalRate: split.survivalRate,
    });
  }, [battleOutcome, campaign]);

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

  const lastWeaponCycleTimeRef = useRef<number>(0);

  const WEAPON_CYCLE: { type: WeaponType; label: string; icon: string }[] = [
    { type: 'ONE_HANDED_SWORD', label: 'Tek Elli Kılıç & Kalkan', icon: '⚔️' },
    { type: 'TWO_HANDED_SWORD', label: 'Çift Elli Kılıç', icon: '🗡️' },
    { type: 'BOW', label: 'Menzilli Yay', icon: '🏹' },
    { type: 'SPEAR', label: 'Kargı / Mızrak', icon: '🔱' },
    { type: 'UNARMED', label: 'Yumruk (Silahsız)', icon: '👊' },
  ];

  const cycleEquippedWeapon = useCallback((dir: 1 | -1) => {
    if (playerHpRef.current <= 0) return;
    const curIdx = WEAPON_CYCLE.findIndex((w) => w.type === weaponTypeRef.current);
    const nextIdx = (curIdx + dir + WEAPON_CYCLE.length) % WEAPON_CYCLE.length;
    const nextItem = WEAPON_CYCLE[nextIdx];

    // Yay ile nişan alınıyorsa geçiş öncesinde nişanı temizce iptal et
    if (isAimingBowRef.current) {
      isAimingBowRef.current = false;
      setIsAimingBow(false);
      bowAimStartRef.current = 0;
      if (bowPowerBarRef.current) bowPowerBarRef.current.style.width = '0%';
      const anim = playerAnimatorRef.current;
      if (anim) anim.cancelBowDraw();
    }

    weaponTypeRef.current = nextItem.type;
    setWeaponType(nextItem.type);

    sound.playSwordSwoosh();
    showOrderShout(`${nextItem.icon} ${nextItem.label} Kuşanıldı`);
  }, [showOrderShout]);

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
      testApi.setBattleScale = (scale: BattleScaleId) => {
        setBattleScale(scale);
        launchMassBattleWithPrewarm(scale, siegeEnabledRef.current, true);
      };
      testApi.setArenaBattleMode = (m: ArenaBattleMode) => setArenaBattleMode(m);
      testApi.getBattleFps = () => (window as unknown as { __kadirlordBattleFps?: unknown }).__kadirlordBattleFps;
      testApi.getBattleState = () => ({
        mode: effectiveMode,
        arenaBattleMode: arenaBattleModeRef.current,
        battleScale: battleScaleRef.current,
        selectedDivision: selectedDivisionRef.current,
        formationOrder: formationOrderRef.current,
        formationArrangement: formationArrangementRef.current,
        playerHp: playerHpRef.current,
        allyAliveCount,
        enemyAliveCount,
        gateHpPct: siegeGateHpPct,
        fps: (window as unknown as { __kadirlordBattleFps?: unknown }).__kadirlordBattleFps,
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
      // Authentic Mount & Blade: dismounted horse remains in the world standing idle
      horseRig.root.visible = true;
      horseRig.riderMount.remove(playerRig.root);
      scene.add(horseRig.root);
      scene.add(playerRig.root);
      playerPosRef.current.x += Math.cos(playerYawRef.current) * 1.15;
      playerPosRef.current.z -= Math.sin(playerYawRef.current) * 1.15;
      playerRig.root.position.copy(playerPosRef.current);
      playerRig.root.rotation.y = playerYawRef.current;
      // Reset rider posture
      playerRig.pelvis.position.set(0, 0, 0);
      playerRig.pelvis.rotation.set(0, 0, 0);
      playerRig.leftThigh.rotation.set(0, 0, 0);
      playerRig.rightThigh.rotation.set(0, 0, 0);
      playerRig.leftShin.rotation.set(0, 0, 0);
      playerRig.rightShin.rotation.set(0, 0, 0);
      playerRig.leftFoot.rotation.set(0, 0, 0);
      playerRig.rightFoot.rotation.set(0, 0, 0);
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

  // ── Issue Hold Position Banner at player's exact ground spot (Bannerlord F1-F1) ──
  const issueHoldPositionOrder = useCallback(() => {
    const pX = playerPosRef.current.x;
    const pZ = playerPosRef.current.z;
    const selDiv = selectedDivisionRef.current;

    // Face towards enemy lines (Three.js -Z is Math.PI) or enemy centroid
    let toEnemyFacing = Math.PI;
    const enemies = skirmishUnitsRef.current.filter((u) => u.team === 'ENEMY' && u.alive && !u.routed);
    if (enemies.length > 0) {
      let sumEx = 0;
      let sumEz = 0;
      for (const e of enemies) {
        sumEx += e.x;
        sumEz += e.z;
      }
      toEnemyFacing = Math.atan2(sumEx / enemies.length - pX, sumEz / enemies.length - pZ);
    }

    const boundX = 75;
    const boundZ = fieldSpawnZRef.current + 35;
    const holdX = THREE.MathUtils.clamp(pX, -boundX, boundX);
    const holdZ = THREE.MathUtils.clamp(pZ, -boundZ, boundZ);

    if (selDiv === 'ALL') {
      holdAnchorRef.current = { x: holdX, z: holdZ, facing: toEnemyFacing };
      setFormationOrder('HOLD_POSITION');
      formationOrderRef.current = 'HOLD_POSITION';
      divisionOrdersRef.current.INFANTRY = 'HOLD_POSITION';
      divisionOrdersRef.current.ARCHERS = 'HOLD_POSITION';
      divisionOrdersRef.current.CAVALRY = 'HOLD_POSITION';
      divisionOrdersRef.current.HORSE_ARCHERS = 'HOLD_POSITION';
      divisionAnchorsRef.current.INFANTRY = { x: holdX, z: holdZ, facing: toEnemyFacing };
      divisionAnchorsRef.current.ARCHERS = { x: holdX, z: holdZ + 4.5, facing: toEnemyFacing };
      divisionAnchorsRef.current.CAVALRY = { x: holdX - 14.0, z: holdZ + 2.0, facing: toEnemyFacing };
      divisionAnchorsRef.current.HORSE_ARCHERS = { x: holdX + 14.0, z: holdZ + 2.0, facing: toEnemyFacing };
      showOrderShout('⚔️ [F1-F1] Tüm Ordu: Bu Konumu Tutun!');
    } else {
      const selKey = selDiv as 'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS';
      divisionOrdersRef.current[selKey] = 'HOLD_POSITION';
      divisionAnchorsRef.current[selKey] = { x: holdX, z: holdZ, facing: toEnemyFacing };
      const divLabel =
        selKey === 'ARCHERS'
          ? '🏹 Okçular'
          : selKey === 'INFANTRY'
            ? '🛡️ Piyadeler'
            : selKey === 'CAVALRY'
              ? '🏇 Süvariler'
              : '🎯 Atlı Okçular';
      showOrderShout(`${divLabel}: Bulunduğunuz Konumda Kalın!`);
    }

    if (tacticalBannerRef.current) {
      tacticalBannerRef.current.visible = true;
      tacticalBannerRef.current.position.set(holdX, 0, holdZ);
      tacticalBannerRef.current.rotation.y = toEnemyFacing;
    }
    sound.playShieldHit();
    spawnDamageText('SANCAK DİKİLDİ: BU KONUMU TUT!', '#facc15', new THREE.Vector3(holdX, 0.5, holdZ));
  }, [showOrderShout, sound, spawnDamageText]);

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

    // ── 6 Krallık Birlik ve Donanım Ağacı Entegrasyonu ──
    const allyArsenalFaction = normalizeArsenalFactionId(playerCulture);
    const allyInfLoadout = getTroopLoadoutForRole(allyArsenalFaction, 'INFANTRY', 3);
    const allyArcLoadout = getTroopLoadoutForRole(allyArsenalFaction, 'ARCHERS', 3);
    const allyCavLoadout = getTroopLoadoutForRole(allyArsenalFaction, 'CAVALRY', 5);

    const enemyArsenalFaction = normalizeArsenalFactionId(
      eLord?.faction ?? eSettlement?.faction ?? 'empire',
    );
    const enemyInfLoadout = getTroopLoadoutForRole(enemyArsenalFaction, 'INFANTRY', 3);
    const enemyArcLoadout = getTroopLoadoutForRole(enemyArsenalFaction, 'ARCHERS', 3);
    const enemyCavLoadout = getTroopLoadoutForRole(enemyArsenalFaction, 'CAVALRY', 5);

    // Roster scaling (faithful 1:1 up to 16 models per troop category for solid 60fps)
    const allyInfCount = Math.min(16, Math.max(3, pRoster.infantry ?? 10));
    const allyArcCount = Math.min(10, Math.max(2, pRoster.archer ?? 6));
    const allyCavCount = Math.min(6, Math.max(1, pRoster.cavalry ?? 3));

    const enemyInfCount = Math.min(16, Math.max(3, eRoster.infantry ?? 10));
    const enemyArcCount = Math.min(10, Math.max(2, eRoster.archer ?? 6));
    const enemyCavCount = Math.min(6, Math.max(1, eRoster.cavalry ?? 3));

    const isSiege = effectiveMode === 'SIEGE';

    const totalPlayerTroops = getTotalTroops(pRoster);
    const totalEnemyTroops = getTotalTroops(eRoster);
    const totalBattleTroops = totalPlayerTroops + totalEnemyTroops;

    // Warband / Bannerlord dinamik savaş meydanı ölçeklemesi:
    // Ordu büyüklüğüne göre spawn mesafesi ve savaş alanı derinliği genişler
    const baseSpawnZ = isSiege
      ? 11.0
      : Math.min(150, Math.max(38, 32 + Math.sqrt(Math.max(1, totalBattleTroops)) * 6.5));
    fieldSpawnZRef.current = baseSpawnZ;

    // Oyuncuyu kendi ordusunun safında, düşmana bakacak şekilde konumlandır
    if (resetAllies && isFieldOrSiege) {
      const playerStartZ = isSiege ? 8.0 : baseSpawnZ - 3.0;
      playerPosRef.current.set(0, isSiege ? 0 : getFieldElevation(0, playerStartZ), playerStartZ);
      playerYawRef.current = Math.PI; // Düşman ordusuna doğru bak (-Z)
      if (playerRigRef.current && !isMountedRef.current) {
        playerRigRef.current.root.position.copy(playerPosRef.current);
        playerRigRef.current.root.rotation.y = playerYawRef.current;
      }
      if (playerHorseRef.current && isMountedRef.current) {
        playerHorseRef.current.root.position.copy(playerPosRef.current);
        playerHorseRef.current.root.rotation.y = playerYawRef.current;
      }
      holdAnchorRef.current = { x: 0, z: isSiege ? 11.0 : baseSpawnZ + 2.0, facing: Math.PI };
      divisionAnchorsRef.current = {
        INFANTRY: { x: 0, z: isSiege ? 11.0 : baseSpawnZ + 2.0, facing: Math.PI },
        ARCHERS: { x: 0, z: isSiege ? 15.0 : baseSpawnZ + 6.0, facing: Math.PI },
        CAVALRY: { x: -14.0, z: isSiege ? 13.0 : baseSpawnZ + 4.0, facing: Math.PI },
        HORSE_ARCHERS: { x: 14.0, z: isSiege ? 13.0 : baseSpawnZ + 4.0, facing: Math.PI },
      };
      divisionOrdersRef.current = {
        INFANTRY: 'HOLD_POSITION',
        ARCHERS: 'HOLD_POSITION',
        CAVALRY: 'HOLD_POSITION',
        HORSE_ARCHERS: 'HOLD_POSITION',
      };
      formationOrderRef.current = 'HOLD_POSITION';
      setFormationOrder('HOLD_POSITION');
    }

    const { units: campaignUnits, meshes: campaignMeshes } = createCampaignArmyFighters({
      campaign,
      targetLord: targetLordRef.current,
      targetSettlement: targetSettlementRef.current,
      isSiege,
      baseSpawnZ,
    });
    for (const mesh of campaignMeshes) {
      group.add(mesh);
    }
    skirmishUnitsRef.current = campaignUnits;

    // Set initial telemetry & alive counts
    const aliveA = skirmishUnitsRef.current.filter((u) => u.team === 'ALLY' && u.alive).length;
    const aliveE = skirmishUnitsRef.current.filter((u) => u.team === 'ENEMY' && u.alive).length;
    setAllyAliveCount(aliveA);
    setEnemyAliveCount(aliveE);
    playerHpRef.current = 100;
    setPlayerHp(100);

    // Position player directly at the vanguard (facing north toward enemy line)
    const initPz = isSiege ? 13.5 : 52.0;
    const initPy = isSiege ? 0 : getFieldElevation(0, initPz);
    playerPosRef.current.set(0, initPy, initPz);
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

    if (resetAllies) sound.playWarhorn();
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

      const { units: initUnits, meshes: initMeshes } = createSkirmishInitialAllies();
      for (const mesh of initMeshes) {
        group.add(mesh);
      }
      skirmishUnitsRef.current = initUnits;
    } else {
      // Remove old enemy meshes & revive/heal allies slightly
      const keptAllies: SkirmishFighter[] = [];
      for (const u of skirmishUnitsRef.current) {
        if (u.team === 'ENEMY') {
          if (u.horse) group.remove(u.horse.root);
          group.remove(u.rig.root);
        } else {
          if (!u.alive) {
            u.alive = true;
            u.hp = u.maxHp;
            u.animator.reset();
            if (u.horse) {
              group.remove(u.rig.root);
              u.horse.riderMount.add(u.rig.root);
              u.rig.root.position.set(0, 0, 0);
              u.rig.root.rotation.set(0, 0, 0);
              u.isRiderlessHorse = false;
            }
          } else {
            u.hp = Math.min(u.maxHp, u.hp + 35);
          }
          keptAllies.push(u);
        }
      }
      skirmishUnitsRef.current = keptAllies;
    }

    const { units: enemyWaveUnits, meshes: enemyWaveMeshes } = createSkirmishWaveEnemies(waveNumber);
    for (const mesh of enemyWaveMeshes) {
      group.add(mesh);
    }
    skirmishUnitsRef.current.push(...enemyWaveUnits);

    setAllyAliveCount(skirmishUnitsRef.current.filter((u) => u.team === 'ALLY' && u.alive).length);
    setEnemyAliveCount(4);

    // 11.4: Bölük Başlangıç Moralleri ve Bozgun Durumları
    allyMoraleStatesRef.current.clear();
    const allyDivCounts: Partial<Record<UnitTierId, number>> = { infantry: 2, archer: 1, cavalry: 1 };
    for (const [cls, cnt] of Object.entries(allyDivCounts) as [UnitTierId, number][]) {
      allyMoraleStatesRef.current.set(
        cls,
        createDivisionMoraleState(cls, cnt, {
          campaignMorale: campaign?.morale ?? 70,
          leadershipSkill: campaign?.skills?.leadership?.level ?? 35,
        }),
      );
    }

    enemyMoraleStatesRef.current.clear();
    const enemyDivCounts: Partial<Record<UnitTierId, number>> = { infantry: 3, archer: 1 };
    for (const [cls, cnt] of Object.entries(enemyDivCounts) as [UnitTierId, number][]) {
      enemyMoraleStatesRef.current.set(
        cls,
        createDivisionMoraleState(cls, cnt, {
          campaignMorale: targetLord?.morale ?? 65,
          leadershipSkill: Math.round(35 + (targetLord?.clanTier ?? 2) * 8),
        }),
      );
    }

    allyCasualtiesRef.current = {};
    enemyCasualtiesRef.current = {};
    allyRoutedRef.current = {};
    enemyRoutedRef.current = {};
    battleElapsedSecRef.current = 0;
    playerFallenNoticeRef.current = false;
  }, [campaign, targetLord]);

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
      if (floorMesh) floorMesh.scale.set(1, 1, 1);
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

    // ---- 2-Bone IK Faction Animations Registration ----
    ensureFactionIKClipsRegistered();

    // ---- Scene ----
    const scene = new THREE.Scene();
    if (isFieldOrSiege) {
      scene.background = new THREE.Color('#7baed8');
      scene.fog = new THREE.Fog('#7baed8', 90, 360);
    } else {
      scene.background = new THREE.Color('#0f0c09');
      scene.fog = new THREE.FogExp2('#0f0c09', 0.014);
    }
    sceneRef.current = scene;

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 450);
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ---- Arena Environment / Battlefield Terrain & Lighting ----
    const envHandles = setupArenaEnvironment(scene, isFieldOrSiege, effectiveMode);
    floorMeshRef.current = envHandles.floorMesh;
    arenaPerimeterGroupRef.current = envHandles.arenaPerimeterGroup;

    const dummy = createPracticeDummy();
    dummy.group.position.set(4.5, 0, -5.5);
    dummy.group.rotation.y = -0.5;
    envHandles.arenaPerimeterGroup.add(dummy.group);
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
        sound.playHit();
        sound.playPainReaction();
        spawnDamageText(`-${dmg} HASAR ALDIN!`, '#ef4444', pPos);
        if (playerHpRef.current <= 0) {
          playerAnim?.fall();
          sound.playDeathScream();
          spawnDamageText('ARENA DÜELLOSUNDA YERE SERİLDİN!', '#dc2626', pPos);
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
      envHandles.arenaPerimeterGroup.visible = false;
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
                  if (unit.horse) {
                    dismountFallenRider(unit);
                  } else {
                    unit.animator.fall();
                  }
                  setKillsCount((k) => k + 1);
                  recordUnitCasualty(unit, isMountedRef.current);
                  if (unit.isLord) {
                    sound.playDeathScream();
                    spawnDamageText(`${unit.name.toUpperCase()} MAĞLUP EDİLDİ!`, '#fbbf24', uPos);
                    pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', unit.name, 'ALLY', '⚔️');
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
              if (u.horse) {
                dismountFallenRider(u);
              } else {
                u.animator.fall();
              }
              setKillsCount((k) => k + 1);
              recordUnitCasualty(u, false);
              pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', u.name, 'ALLY', '🛡️');
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
              if (u.horse) {
                dismountFallenRider(u);
              } else {
                u.animator.fall();
              }
              setKillsCount((k) => k + 1);
              recordUnitCasualty(u, false);
              pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', u.name, 'ALLY', '🦶');
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
        if (!anim || playerHpRef.current <= 0) return;

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
        if (e.altKey || e.ctrlKey) {
          // Alt/Ctrl ile serbest kamera yakınlaştırma mesafesini ince ayarlama
          playableCamDistRef.current = THREE.MathUtils.clamp(
            playableCamDistRef.current + e.deltaY * 0.002,
            1.6,
            4.5,
          );
          return;
        }

        // Mount & Blade / Bannerlord: Fare tekerleği (roller) ile silah/yay geçişi
        // Tekerlek aşağı (deltaY > 0) -> Sonraki Silah; Tekerlek yukarı (deltaY < 0) -> Önceki Silah
        const now = performance.now();
        if (now - lastWeaponCycleTimeRef.current < 160) return;
        lastWeaponCycleTimeRef.current = now;

        cycleEquippedWeapon(e.deltaY > 0 ? 1 : -1);
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onKeyDown = (e: KeyboardEvent) => {
      keysDownRef.current[e.code] = true;

      // [Q] Tuşu: Hızlı silah / yay geçişi (Fare tekerleği alternatif tuşu)
      if (e.code === 'KeyQ' && playerHpRef.current > 0 && controlModeRef.current === 'PLAYABLE') {
        cycleEquippedWeapon(1);
      }

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
      if (e.code === 'KeyE' && playerHpRef.current > 0) {
        if (controlModeRef.current === 'PLAYABLE') {
          if (isBlockingRef.current && shieldTypeRef.current !== 'NONE') {
            triggerPlayerShieldBash();
          } else {
            triggerPlayerKick();
          }
        }
      }

      // KeyM -> Toggle WarHorse Mount!
      if (e.code === 'KeyM' && playerHpRef.current > 0) {
        setIsMounted((prev) => !prev);
      }

      // Bannerlord Tactical Orders (F1 / F2 / F3 / F4 / F5 / F6)
      if (playerHpRef.current > 0) {
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
        }
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        if (battleOutcomeRef.current) {
          if (document.pointerLockElement) document.exitPointerLock();
          if (onBattleCompleteRef.current) {
            onBattleCompleteRef.current(
              battleOutcomeRef.current.victory,
              battleOutcomeRef.current.losses,
              battleOutcomeRef.current.enemiesDefeated,
            );
          } else {
            onReturnToMap();
          }
          return;
        }
        setShowScoreboard((prev) => {
          const next = !prev;
          if (next && document.pointerLockElement) {
            document.exitPointerLock();
          }
          return next;
        });
        sound.playUiClick();
      } else if (e.code === 'Escape') {
        if (showScoreboardRef.current) {
          e.preventDefault();
          setShowScoreboard(false);
          return;
        }
        if (activeTacticalMenuRef.current) {
          e.preventDefault();
          setActiveTacticalMenu(null);
        }
      }

      // Space → quick attack in selected direction
      if (e.code === 'Space' && controlModeRef.current === 'PLAYABLE' && playerHpRef.current > 0) {
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
      const frameNow = performance.now();
      const rawDelta = Math.min(0.1, Math.max(0.001, (frameNow - lastFrameTimeRef.current) / 1000));
      lastFrameTimeRef.current = frameNow;
      const speed = animSpeedRef.current;
      const delta = Math.min(0.1, rawDelta * speed);
      elapsedTimeRef.current += delta;
      const elapsed = elapsedTimeRef.current;
      const mode = controlModeRef.current;

      // 0. Live FPS tracking (sample every frame, emit to window/React every 250ms)
      const instantFps = rawDelta > 0.0001 ? Math.min(240, Math.max(1, Math.round(1 / rawDelta))) : 60;
      if (elapsedTimeRef.current > 1.0) {
        const tracker = fpsTrackerRef.current;
        tracker.current = instantFps;
        tracker.min = Math.min(tracker.min, instantFps);
        tracker.max = Math.max(tracker.max, instantFps);
        tracker.samples.push(instantFps);
        if (tracker.samples.length > 300) tracker.samples.shift();

        if (frameNow - tracker.lastUpdate > 250) {
          tracker.lastUpdate = frameNow;
          const stats = {
            current: instantFps,
            min: tracker.min,
            max: tracker.max,
            avg: Math.round(tracker.samples.reduce((a, b) => a + b, 0) / tracker.samples.length),
            samplesCount: tracker.samples.length,
          };
          if (typeof window !== 'undefined') {
            (window as unknown as { __kadirlordBattleFps?: unknown }).__kadirlordBattleFps = stats;
          }
          setFpsStats({ current: instantFps, min: tracker.min, max: tracker.max });
        }
      }

      // ─ 1. Player movement & Mounted WarHorse Physics ─
      const anim = playerAnimatorRef.current;
      const keys = keysDownRef.current;
      const mounted = isMountedRef.current;

      if (mode === 'PLAYABLE' && anim) {
        const localMove = new THREE.Vector3();
        if (playerHpRef.current > 0) {
          if (keys['KeyW'] || keys['ArrowUp']) localMove.z += 1;
          if (keys['KeyS'] || keys['ArrowDown']) localMove.z -= 1;
          if (keys['KeyA'] || keys['ArrowLeft']) localMove.x += 1;
          if (keys['KeyD'] || keys['ArrowRight']) localMove.x -= 1;
        }

        const isSprint = keys['ShiftLeft'] || keys['ShiftRight'];

        if (playerHpRef.current > 0 && localMove.lengthSq() > 0) {
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
            ? Math.max(160.0, fieldSpawnZRef.current + 50.0)
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

        // Adjust player position Y based on field terrain elevation
        const pElevation = isFieldOrSiege && effectiveMode !== 'SIEGE'
          ? getFieldElevation(playerPosRef.current.x, playerPosRef.current.z)
          : 0;
        playerPosRef.current.y = pElevation;

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
                    if (u.horse) {
                      dismountFallenRider(u);
                    } else {
                      u.animator.fall();
                    }
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

        battleElapsedSecRef.current += delta;

        // 11.4: Bölük Morali & Bozgun Kontrolü (Tek Geçişli 0-GC Sayaç)
        const aliveAllies: SkirmishFighter[] = [];
        const aliveEnemies: SkirmishFighter[] = [];
        const allyCountsByDiv: Record<string, number> = { INFANTRY: 0, ARCHERS: 0, CAVALRY: 0, HORSE_ARCHERS: 0 };
        const enemyCountsByDiv: Record<string, number> = { INFANTRY: 0, ARCHERS: 0, CAVALRY: 0, HORSE_ARCHERS: 0 };

        for (let ui = 0; ui < units.length; ui++) {
          const u = units[ui];
          if (!u.alive || u.routed) continue;
          if (u.team === 'ALLY') {
            aliveAllies.push(u);
            allyCountsByDiv[u.division] = (allyCountsByDiv[u.division] || 0) + 1;
          } else {
            aliveEnemies.push(u);
            enemyCountsByDiv[u.division] = (enemyCountsByDiv[u.division] || 0) + 1;
          }
        }

        const curAlliesAlive = aliveAllies.length;
        const curEnemiesAlive = aliveEnemies.length;
        const totalAlive = Math.max(1, curAlliesAlive + curEnemiesAlive);
        const allyRatio = curAlliesAlive / totalAlive;
        const enemyRatio = curEnemiesAlive / totalAlive;

        for (const [cls, st] of allyMoraleStatesRef.current.entries()) {
          const divName = unitTierIdToDivision(cls);
          const aliveInDiv = allyCountsByDiv[divName] || 0;
          const wasRouting = st.isRouting;
          stepDivisionMorale(st, delta, {
            aliveInDivision: aliveInDiv,
            commanderDown: playerHpRef.current <= 0,
            hasReserves: false,
            battleElapsedSec: battleElapsedSecRef.current,
            allyStrengthRatio: allyRatio,
          });
          if (st.isRouting && !wasRouting) {
            spawnDamageText(`${DIVISION_LABEL[cls].toUpperCase()} BOZGUNA UĞRADI!`, '#ef4444', playerPosRef.current);
            sound.playBattleYell();
            pushKillFeedEntry('Sancak Ordusu', `${DIVISION_LABEL[cls]} Kaçıyor!`, 'ALLY', 'Kaçış');
          }
        }

        for (const [cls, st] of enemyMoraleStatesRef.current.entries()) {
          const divName = unitTierIdToDivision(cls);
          const aliveInDiv = enemyCountsByDiv[divName] || 0;
          const wasRouting = st.isRouting;
          stepDivisionMorale(st, delta, {
            aliveInDivision: aliveInDiv,
            commanderDown: false,
            hasReserves: false,
            battleElapsedSec: battleElapsedSecRef.current,
            allyStrengthRatio: enemyRatio,
          });
          if (st.isRouting && !wasRouting) {
            spawnDamageText(`🏳️ DÜŞMAN ${DIVISION_LABEL[cls].toUpperCase()} KAÇIYOR!`, '#22c55e', playerPosRef.current);
            pushKillFeedEntry(targetLord?.name ?? 'Düşman Ordusu', `${DIVISION_LABEL[cls]} Bozguna Uğradı!`, 'ENEMY', '🏳️');
          }
        }

        // Komutan düştüğünde Çavuş yapay zekası devreye girer: ordu hücum moduna geçer!
        if (playerHpRef.current <= 0 && formationOrderRef.current !== 'CHARGE') {
          formationOrderRef.current = 'CHARGE';
          setFormationOrder('CHARGE');
          showOrderShout('🚩 KOMUTAN DÜŞTÜ! ÇAVUŞ KOMUTAYI ALDI: HÜCUM!');
          sound.playWarhorn();
        }

        const order = formationOrderRef.current;
        const arrangement = formationArrangementRef.current;
        const arrMeta = FORMATION_ARRANGEMENT_META[arrangement].modifier;

        // Bölüklere göre canlı asker listeleri
        const aliveInfantry: SkirmishFighter[] = [];
        const aliveArchers: SkirmishFighter[] = [];
        const aliveCavalry: SkirmishFighter[] = [];
        const aliveHorseArchers: SkirmishFighter[] = [];
        for (let i = 0; i < aliveAllies.length; i++) {
          const a = aliveAllies[i];
          if (a.division === 'ARCHERS') aliveArchers.push(a);
          else if (a.division === 'CAVALRY') aliveCavalry.push(a);
          else if (a.division === 'HORSE_ARCHERS') aliveHorseArchers.push(a);
          else aliveInfantry.push(a);
        }

        const getDivisionAnchor = (div: 'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS') => {
          const ord = divisionOrdersRef.current[div] ?? formationOrderRef.current;
          if (ord === 'HOLD_POSITION') {
            return divisionAnchorsRef.current[div] ?? holdAnchorRef.current;
          }
          // FOLLOW_ME: Oyuncunun arkasında yürür fakat yüzü DAİMA düşman hattına bakar (Math.PI)
          const pX = playerPosRef.current.x;
          const pZ = playerPosRef.current.z;
          const pYaw = playerYawRef.current;
          const offsetZ = div === 'ARCHERS' ? 6.5 : div === 'CAVALRY' ? 4.5 : 2.5;
          return {
            x: pX - Math.sin(pYaw) * offsetZ,
            z: pZ - Math.cos(pYaw) * offsetZ,
            facing: Math.PI, // Düşman hattına (-Z) bakar, oyuncu kamerasıyla ASLA dönmez
          };
        };

        const infSlots = computeFormationSlots(aliveInfantry.length, getDivisionAnchor('INFANTRY'), arrangement);
        const arcSlots = computeFormationSlots(aliveArchers.length, getDivisionAnchor('ARCHERS'), 'LOOSE');
        const cavSlots = computeFormationSlots(aliveCavalry.length, getDivisionAnchor('CAVALRY'), 'WEDGE');
        const haSlots = computeFormationSlots(aliveHorseArchers.length, getDivisionAnchor('HORSE_ARCHERS'), 'LOOSE');

        // 11.5: Düşman Lordu Taktik Yapay Zekası ve Ordu Düzeni (Bannerlord AI)
        const enemyCommander = aliveEnemies.find((u) => u.isLord) ?? aliveEnemies[0];
        let sumAllyX = playerPosRef.current.x;
        let sumAllyZ = playerPosRef.current.z;
        let allyCenterCount = 1;
        for (const a of aliveAllies) {
          sumAllyX += a.x;
          sumAllyZ += a.z;
          allyCenterCount++;
        }
        const avgAllyX = sumAllyX / allyCenterCount;
        const avgAllyZ = sumAllyZ / allyCenterCount;

        const cmdDistToFrontline = enemyCommander
          ? Math.hypot(avgAllyX - enemyCommander.x, avgAllyZ - enemyCommander.z)
          : 999;
        const enemyFacing = enemyCommander
          ? Math.atan2(avgAllyX - enemyCommander.x, avgAllyZ - enemyCommander.z)
          : 0;

        // Düşman lordu stratejik kararı:
        // - Uzak mesafe (> 30m): Savunma hattı / Kalkan duvarı tutulur, okçular geride bekler
        // - Orta mesafe (15m - 30m): Düzenli hatla ilerlenir (ADVANCE)
        // - Yakın mesafe (< 15m) veya komutan düştüyse: Doğrudan hücum (CHARGE)
        const enemyTacticalMode: 'HOLD' | 'ADVANCE' | 'CHARGE' =
          !enemyCommander || cmdDistToFrontline < 15
            ? 'CHARGE'
            : cmdDistToFrontline > 30
              ? 'HOLD'
              : 'ADVANCE';

        const enemyAnchor = enemyCommander
          ? {
              x: enemyCommander.x + Math.sin(enemyFacing) * (enemyTacticalMode === 'ADVANCE' ? 3.5 : 0),
              z: enemyCommander.z + Math.cos(enemyFacing) * (enemyTacticalMode === 'ADVANCE' ? 3.5 : 0),
              facing: enemyFacing,
            }
          : { x: 0, z: -50, facing: 0 };

        const enemySlots = computeFormationSlots(
          aliveEnemies.length,
          enemyAnchor,
          cmdDistToFrontline > 24 ? 'SHIELD_WALL' : 'LINE',
        );

        aliveAllies.forEach((ally, idx) => {
          const cls = divisionIdToUnitTierId(ally.division);
          const divMorale = allyMoraleStatesRef.current.get(cls);
          const isFleeing = ally.isRouting || divMorale?.isRouting;

          // 11.4: Bozguna uğrayan asker silahını bırakıp geriye doğru kaçar
          if (isFleeing) {
            ally.isRouting = true;
            ally.animator.release();
            const fleeSpd = ally.horse ? HORSE_GALLOP_SPEED : SPRINT_SPEED;
            ally.yaw = 0; // Kendi spawn sınırına (+Z) doğru kaçış
            ally.z += fleeSpd * delta;
            ally.animator.setMove(0, ally.horse ? 0 : fleeSpd);
            const fleeBoundaryZ = isFieldOrSiege ? (fieldSpawnZRef.current + 40) : (ARENA_RADIUS - 0.5);
            if (ally.z >= fleeBoundaryZ) {
              ally.alive = false;
              ally.routed = true;
              recordUnitRouted(ally);
              const grp = skirmishGroupRef.current;
              if (grp) grp.remove(ally.horse ? ally.horse.root : ally.rig.root);
              spawnDamageText(`🏃 ${ally.name} kaçtı!`, '#f87171', new THREE.Vector3(ally.x, 1, ally.z));
            }
            return;
          }

          const divKey = (ally.division as 'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS') || 'INFANTRY';
          const unitOrder = divisionOrdersRef.current[divKey] ?? order;
          const unitAnchor = divisionAnchorsRef.current[divKey] ?? holdAnchorRef.current;

          let slot: { x: number; z: number; facing: number } | undefined;
          if (divKey === 'INFANTRY') {
            const idxInDiv = aliveInfantry.indexOf(ally);
            slot = infSlots[idxInDiv];
          } else if (divKey === 'ARCHERS') {
            const idxInDiv = aliveArchers.indexOf(ally);
            slot = arcSlots[idxInDiv];
          } else if (divKey === 'CAVALRY') {
            const idxInDiv = aliveCavalry.indexOf(ally);
            slot = cavSlots[idxInDiv];
          } else {
            const idxInDiv = aliveHorseArchers.indexOf(ally);
            slot = haSlots[idxInDiv];
          }

          const nearestEnemy = grid.findNearest(ally.x, ally.z, isFieldOrSiege ? 280 : 28, (c) => c.team === 'ENEMY' && c.alive && !c.routed);
          const targetEnemy = nearestEnemy?.agent;
          const distToEnemy = nearestEnemy?.dist ?? 999;

          let goalX = slot ? slot.x : ally.x;
          let goalZ = slot ? slot.z : ally.z;
          // Askerlerin yüzü daima düşman hattına veya hedefe bakar, oyuncu arkasını dönünce ASLA dönmez
          let desiredFacing = targetEnemy && distToEnemy < 35
            ? Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z)
            : (slot ? slot.facing : unitAnchor.facing);
          let moveSpd = 0;

          // ─── 1. SÜVARİ VUR-KAÇ DÖNGÜSÜ (Bannerlord Cavalry Cycle-Charge) ───
          if (ally.horse || ally.division === 'CAVALRY') {
            const chargeState = ally.cavalryChargeState || 'CHARGE';
            const baseCavSpd = HORSE_GALLOP_SPEED * arrMeta.moveSpeedMultiplier;

            if (unitOrder === 'HOLD_POSITION') {
              // Süvari bekleme hattında düzenli durur
              const toSx = (slot ? slot.x : goalX) - ally.x;
              const toSz = (slot ? slot.z : goalZ) - ally.z;
              const dS = Math.hypot(toSx, toSz);
              if (dS > 0.5) {
                moveSpd = 4.2;
                ally.x += (toSx / dS) * moveSpd * delta;
                ally.z += (toSz / dS) * moveSpd * delta;
                desiredFacing = Math.atan2(toSx, toSz);
              } else {
                moveSpd = 0;
                desiredFacing = targetEnemy && distToEnemy < 28 ? Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z) : (slot ? slot.facing : unitAnchor.facing);
              }
            } else if (chargeState === 'CHARGE') {
              if (targetEnemy) {
                const toTx = targetEnemy.x - ally.x;
                const toTz = targetEnemy.z - ally.z;
                const distT = Math.hypot(toTx, toTz) || 0.01;
                desiredFacing = Math.atan2(toTx, toTz);
                moveSpd = baseCavSpd;
                ally.x += (toTx / distT) * moveSpd * delta;
                ally.z += (toTz / distT) * moveSpd * delta;

                // Süvari Darbesi / Hücum Teması: Düşmana çarpıp içinden geçer
                if (distT < 2.5) {
                  ally.cavalryHeadingX = toTx / distT;
                  ally.cavalryHeadingZ = toTz / distT;
                  ally.cavalryChargeState = 'PASS_THROUGH';
                  ally.cavalryTimer = 1.25 + Math.random() * 0.4;

                  sound.playShieldHit();
                  const trampleDmg = Math.round(36 + (ally.tier >= 5 ? 14 : 0));
                  targetEnemy.hp = Math.max(0, targetEnemy.hp - trampleDmg);
                  targetEnemy.animator.hitReact(true);
                  spawnDamageText(`🏇 SÜVARİ ÇARPMASI! (-${trampleDmg})`, '#facc15', new THREE.Vector3(targetEnemy.x, 0, targetEnemy.z));
                  if (targetEnemy.hp <= 0) {
                    targetEnemy.alive = false;
                    if (targetEnemy.horse) dismountFallenRider(targetEnemy);
                    else targetEnemy.animator.fall();
                    setKillsCount((k) => k + 1);
                    recordUnitCasualty(targetEnemy, true);
                    pushKillFeedEntry(ally.name, targetEnemy.name, 'ALLY', '🏇');
                  }
                }
              } else {
                moveSpd = 3.5;
                if (slot) {
                  const toSx = slot.x - ally.x;
                  const toSz = slot.z - ally.z;
                  const dS = Math.hypot(toSx, toSz) || 0.01;
                  if (dS > 0.4) {
                    ally.x += (toSx / dS) * moveSpd * delta;
                    ally.z += (toSz / dS) * moveSpd * delta;
                    desiredFacing = slot.facing;
                  }
                }
              }
            } else if (chargeState === 'PASS_THROUGH') {
              // Yarma Aşaması: Hız kesmeden piyade hattının içinden delip geçer
              moveSpd = baseCavSpd * 1.05;
              const hx = ally.cavalryHeadingX ?? Math.sin(ally.yaw);
              const hz = ally.cavalryHeadingZ ?? Math.cos(ally.yaw);
              desiredFacing = Math.atan2(hx, hz);
              ally.x += hx * moveSpd * delta;
              ally.z += hz * moveSpd * delta;

              ally.cavalryTimer = (ally.cavalryTimer ?? 0) - delta;
              if (ally.cavalryTimer <= 0) {
                ally.cavalryChargeState = 'PULL_AWAY';
                ally.cavalryTimer = 2.0 + Math.random() * 0.5;
              }
            } else if (chargeState === 'PULL_AWAY') {
              // Açılma Aşaması: 20-25m güvenli mesafeye çıkana kadar koşturur
              moveSpd = baseCavSpd;
              const hx = ally.cavalryHeadingX ?? Math.sin(ally.yaw);
              const hz = ally.cavalryHeadingZ ?? Math.cos(ally.yaw);
              desiredFacing = Math.atan2(hx, hz);
              ally.x += hx * moveSpd * delta;
              ally.z += hz * moveSpd * delta;

              ally.cavalryTimer = (ally.cavalryTimer ?? 0) - delta;
              if (ally.cavalryTimer <= 0 || distToEnemy > 22) {
                ally.cavalryChargeState = 'CHARGE';
                ally.cavalryTimer = 0;
              }
            }
          }
          // ─── 2. OKÇU (Bannerlord Ranged Skirmish & Konum Tutma) ───
          else if (ally.division === 'ARCHERS') {
            const isDangerClose = distToEnemy < 3.2 && distToEnemy > 1.2 && targetEnemy;
            if (isDangerClose) {
              const awayX = (ally.x - targetEnemy.x) / distToEnemy;
              const awayZ = (ally.z - targetEnemy.z) / distToEnemy;
              const kiteSpd = 2.4 * arrMeta.moveSpeedMultiplier;
              moveSpd = kiteSpd;
              ally.x += awayX * kiteSpd * delta;
              ally.z += awayZ * kiteSpd * delta;
              desiredFacing = Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z);
            } else if (unitOrder === 'CHARGE') {
              if (targetEnemy && distToEnemy > 18) {
                goalX = targetEnemy.x;
                goalZ = targetEnemy.z;
                desiredFacing = Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z);
              }
              const toGoalX = goalX - ally.x;
              const toGoalZ = goalZ - ally.z;
              const distToGoal = Math.hypot(toGoalX, toGoalZ);
              if (distToGoal > 1.2) {
                moveSpd = 3.2 * arrMeta.moveSpeedMultiplier;
                ally.x += (toGoalX / distToGoal) * moveSpd * delta;
                ally.z += (toGoalZ / distToGoal) * moveSpd * delta;
              }
            } else {
              // HOLD_POSITION veya FOLLOW_ME: tam tahsis edilen forma slotuna dizilip orada kal!
              const toGoalX = goalX - ally.x;
              const toGoalZ = goalZ - ally.z;
              const distToGoal = Math.hypot(toGoalX, toGoalZ);
              if (distToGoal > 0.4) {
                moveSpd = 3.2 * arrMeta.moveSpeedMultiplier;
                ally.x += (toGoalX / distToGoal) * moveSpd * delta;
                ally.z += (toGoalZ / distToGoal) * moveSpd * delta;
              } else {
                moveSpd = 0;
              }
              if (targetEnemy) {
                desiredFacing = Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z);
              } else if (slot) {
                desiredFacing = slot.facing;
              }
            }
          }
          // ─── 3. PİYADE (Tier Bazlı Taktik, Kuşatılma Algısı ve Flank Adımı) ───
          else {
            const isElite = (ally.tier ?? 3) >= 4;

            // Kuşatılma Kontrolü (Tier 4+ elit askerler 2+ kişiye karşı kalkanla geri adım atar)
            if (isElite && (ally.tacticalTimer ?? 0) <= 0 && distToEnemy < 3.2) {
              const nearby = grid.queryRadius(ally.x, ally.z, 2.7);
              let hostileCount = 0;
              let friendlyCount = 0;
              for (const n of nearby) {
                if (!n.alive) continue;
                if (n.team === 'ENEMY') hostileCount++;
                else if (n.team === 'ALLY' && n.id !== ally.id) friendlyCount++;
              }
              if (hostileCount >= 2 && friendlyCount === 0) {
                ally.tacticalStance = 'BACKPEDAL';
                ally.tacticalTimer = 1.35;
              } else {
                ally.tacticalStance = 'ATTACK';
              }
            }

            if (ally.tacticalStance === 'BACKPEDAL' && targetEnemy) {
              if (ally.hasShield) ally.animator.block('up');
              const toX = targetEnemy.x - ally.x;
              const toZ = targetEnemy.z - ally.z;
              const d = Math.hypot(toX, toZ) || 0.01;
              desiredFacing = Math.atan2(toX, toZ);
              moveSpd = 2.1;
              ally.x -= (toX / d) * moveSpd * delta;
              ally.z -= (toZ / d) * moveSpd * delta;

              ally.tacticalTimer = (ally.tacticalTimer ?? 0) - delta;
              if (ally.tacticalTimer <= 0) ally.tacticalStance = 'ATTACK';
            } else {
              if ((unitOrder === 'CHARGE' || distToEnemy < 3.5) && targetEnemy) {
                goalX = targetEnemy.x;
                goalZ = targetEnemy.z;
                desiredFacing = Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z);

                // Flank Adımı (Elit askerler kalkanlı hedefin yan açısına kavis çizer)
                if (isElite && targetEnemy.hasShield && distToEnemy < 2.5) {
                  const strafe = ally.strafeSign || 1;
                  const perpX = -Math.cos(desiredFacing) * strafe;
                  const perpZ = Math.sin(desiredFacing) * strafe;
                  goalX += perpX * 1.6;
                  goalZ += perpZ * 1.6;
                }
              }

              const toGoalX = goalX - ally.x;
              const toGoalZ = goalZ - ally.z;
              const distToGoal = Math.hypot(toGoalX, toGoalZ);
              const stopDist = unitOrder === 'CHARGE' && targetEnemy ? 1.85 : 0.35;

              if (distToGoal > stopDist) {
                moveSpd = 3.3 * arrMeta.moveSpeedMultiplier;
                ally.x += (toGoalX / distToGoal) * moveSpd * delta;
                ally.z += (toGoalZ / distToGoal) * moveSpd * delta;
              } else {
                moveSpd = 0;
                if (targetEnemy && distToEnemy < 18) {
                  desiredFacing = Math.atan2(targetEnemy.x - ally.x, targetEnemy.z - ally.z);
                } else if (slot) {
                  desiredFacing = slot.facing;
                }
              }
            }
          }

          // Elastik İtme / Yumuşak Gövde Çarpışması: yalnızca birim hareket halindeyken veya düşman yakınken (FPS kazancı!)
          if (moveSpd > 0.1 || distToEnemy < 3.5) {
            const neighbors = grid.queryRadius(ally.x, ally.z, ally.horse ? 1.6 : 1.15);
            for (let ni = 0; ni < neighbors.length; ni++) {
              const nb = neighbors[ni];
              if (nb.id === ally.id || !nb.alive) continue;
              const sx = ally.x - nb.x;
              const sz = ally.z - nb.z;
              const sdSq = sx * sx + sz * sz;
              const minDist = (ally.horse || nb.horse) ? 1.55 : (ally.team === nb.team ? 1.05 : 0.88);
              const minDSq = minDist * minDist;
              if (sdSq < minDSq && sdSq > 0.0001) {
                const sd = Math.sqrt(sdSq);
                const pushForce = ((minDist - sd) / minDist) * (ally.horse ? 3.4 : 2.5);
                const invSd = 1 / sd;
                ally.x += sx * invSd * pushForce * delta;
                ally.z += sz * invSd * pushForce * delta;
              }
            }
          }

          // Arena Sınır Koruması
          const boundX = isFieldOrSiege ? 78 : (ARENA_RADIUS - 0.7);
          const boundZ = isFieldOrSiege ? (fieldSpawnZRef.current + 38) : (ARENA_RADIUS - 0.7);
          ally.x = THREE.MathUtils.clamp(ally.x, -boundX, boundX);
          ally.z = THREE.MathUtils.clamp(ally.z, -boundZ, boundZ);

          ally.yaw = desiredFacing;
          ally.animator.setMove(0, ally.horse ? 0 : moveSpd);

          ally.aiTimer -= delta;
          if (arrMeta.forceShieldBlock && ally.hasShield && distToEnemy > 2.2) {
            ally.animator.block('up');
          } else if (ally.division === 'ARCHERS' && targetEnemy && fireOrderRef.current === 'FREE_FIRE') {
            if (ally.aiTimer <= 0 && distToEnemy < 22 && distToEnemy > 2.2) {
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
            ally.aiTimer = (ally.tier >= 5 ? 0.95 : 1.2) + Math.random() * 0.35;

            const enemyParry = evaluateDirectionalParry({
              attackDir: dir,
              defenderBlockDir: targetEnemy.blockDir,
              hasShield: targetEnemy.hasShield,
              isBlocking: targetEnemy.animator.isBlocking(),
              isFacingAttacker: true,
            });
            if (!enemyParry.blocked) {
              const baseDamage = ally.horse ? 34 : (ally.tier >= 4 ? 26 : 18);
              const dmg = Math.round(baseDamage * enemyParry.damageMultiplier);
              targetEnemy.hp = Math.max(0, targetEnemy.hp - dmg);
              if (targetEnemy.hp <= 0) {
                targetEnemy.alive = false;
                if (targetEnemy.horse) {
                  dismountFallenRider(targetEnemy);
                } else {
                  targetEnemy.animator.fall();
                }
                setKillsCount((k) => k + 1);
                recordUnitCasualty(targetEnemy, ally.horse ? true : false);
                spawnDamageText(`⚔️ Müttefik Leşi: ${targetEnemy.name}`, '#34d399', new THREE.Vector3(targetEnemy.x, 0, targetEnemy.z));
                pushKillFeedEntry(ally.name, targetEnemy.name, 'ALLY', '⚔️');
              } else {
                targetEnemy.animator.hitReact(true);
              }
            }
          }
        });

        // Update Enemy Fighters
        aliveEnemies.forEach((enemy, idx) => {
          const cls = divisionIdToUnitTierId(enemy.division);
          const divMorale = enemyMoraleStatesRef.current.get(cls);
          const isFleeing = enemy.isRouting || divMorale?.isRouting;

          // 11.4: Bozguna uğrayan düşman harita sınırına (-Z) doğru kaçar
          if (isFleeing) {
            enemy.isRouting = true;
            enemy.animator.release();
            const fleeSpd = enemy.horse ? HORSE_GALLOP_SPEED : SPRINT_SPEED;
            enemy.yaw = Math.PI; // Düşman kaçış sınırı (-Z)
            enemy.z -= fleeSpd * delta;
            enemy.animator.setMove(0, fleeSpd);
            const fleeBoundaryZ = isFieldOrSiege ? (fieldSpawnZRef.current + 40) : (ARENA_RADIUS - 0.5);
            if (enemy.z <= -fleeBoundaryZ) {
              enemy.alive = false;
              enemy.routed = true;
              recordUnitRouted(enemy);
              const grp = skirmishGroupRef.current;
              if (grp) grp.remove(enemy.horse ? enemy.horse.root : enemy.rig.root);
              spawnDamageText(`🏳️ ${enemy.name} kaçarak kurtuldu!`, '#4ade80', new THREE.Vector3(enemy.x, 1, enemy.z));
            }
            return;
          }

          const nearestAlly = grid.findNearest(enemy.x, enemy.z, isFieldOrSiege ? 280 : 60, (c) => c.team === 'ALLY' && c.alive && !c.routed);
          const distToPlayer = Math.hypot(playerPosRef.current.x - enemy.x, playerPosRef.current.z - enemy.z);
          const targetPlayer = playerHpRef.current > 0 && (!nearestAlly || distToPlayer < 4.2);

          if (!targetPlayer && !nearestAlly) {
            enemy.animator.setMove(0, 0);
            enemy.animator.play('cheer');
            return;
          }

          const tx = targetPlayer ? playerPosRef.current.x : nearestAlly!.agent.x;
          const tz = targetPlayer ? playerPosRef.current.z : nearestAlly!.agent.z;
          const dist = targetPlayer ? distToPlayer : nearestAlly!.dist;

          // 11.5: Taktik Formasyon veya Doğrudan Hücum Hedefi
          const slot = enemySlots[idx];
          let goalX = tx;
          let goalZ = tz;
          let desiredFacing = Math.atan2(tx - enemy.x, tz - enemy.z);
          let moveSpd = 0;

          // ─── 1. DÜŞMAN SÜVARİSİ & LORD VUR-KAÇ DÖNGÜSÜ (Bannerlord Cavalry Cycle-Charge) ───
          if (enemy.horse || enemy.division === 'CAVALRY') {
            const chargeState = enemy.cavalryChargeState || 'CHARGE';
            const baseCavSpd = HORSE_GALLOP_SPEED;

            if (chargeState === 'CHARGE') {
              const toTx = tx - enemy.x;
              const toTz = tz - enemy.z;
              const distT = Math.hypot(toTx, toTz) || 0.01;
              desiredFacing = Math.atan2(toTx, toTz);
              moveSpd = baseCavSpd;
              enemy.x += (toTx / distT) * moveSpd * delta;
              enemy.z += (toTz / distT) * moveSpd * delta;

              // Süvari Darbesi / Hücum Teması: Oyuncuya veya müttefike çarpıp delip geçer
              if (distT < 2.5) {
                enemy.cavalryHeadingX = toTx / distT;
                enemy.cavalryHeadingZ = toTz / distT;
                enemy.cavalryChargeState = 'PASS_THROUGH';
                enemy.cavalryTimer = 1.35 + Math.random() * 0.35;

                sound.playShieldHit();
                const trampleDmg = Math.round((enemy.isLord ? 38 : 28) + (enemy.tier >= 5 ? 10 : 0));

                if (targetPlayer) {
                  playerHpRef.current = Math.max(0, playerHpRef.current - trampleDmg);
                  setPlayerHp(playerHpRef.current);
                  playerAnimatorRef.current?.hitReact(true);
                  spawnDamageText(`🏇 SÜVARİ ÇARPMASI! (-${trampleDmg})`, '#ef4444', playerPosRef.current);
                  sound.playHit();
                  sound.playPainReaction();
                } else if (nearestAlly) {
                  const ally = nearestAlly.agent;
                  ally.hp = Math.max(0, ally.hp - trampleDmg);
                  ally.animator.hitReact(true);
                  spawnDamageText(`🏇 SÜVARİ EZDİ! (-${trampleDmg})`, '#f87171', new THREE.Vector3(ally.x, 0, ally.z));
                  if (ally.hp <= 0) {
                    ally.alive = false;
                    if (ally.horse) dismountFallenRider(ally);
                    else ally.animator.fall();
                    recordUnitCasualty(ally, false);
                    pushKillFeedEntry(enemy.name, ally.name, 'ENEMY', '🏇');
                  }
                }
              }
            } else if (chargeState === 'PASS_THROUGH') {
              // Yarma Aşaması: Hız kesmeden ileri sürer
              moveSpd = baseCavSpd * 1.05;
              const hx = enemy.cavalryHeadingX ?? Math.sin(enemy.yaw);
              const hz = enemy.cavalryHeadingZ ?? Math.cos(enemy.yaw);
              desiredFacing = Math.atan2(hx, hz);
              enemy.x += hx * moveSpd * delta;
              enemy.z += hz * moveSpd * delta;

              enemy.cavalryTimer = (enemy.cavalryTimer ?? 0) - delta;
              if (enemy.cavalryTimer <= 0) {
                enemy.cavalryChargeState = 'PULL_AWAY';
                enemy.cavalryTimer = 2.1 + Math.random() * 0.5;
              }
            } else if (chargeState === 'PULL_AWAY') {
              // Açılma Aşaması: Güvenli mesafeye kadar uzaklaşır
              moveSpd = baseCavSpd;
              const hx = enemy.cavalryHeadingX ?? Math.sin(enemy.yaw);
              const hz = enemy.cavalryHeadingZ ?? Math.cos(enemy.yaw);
              desiredFacing = Math.atan2(hx, hz);
              enemy.x += hx * moveSpd * delta;
              enemy.z += hz * moveSpd * delta;

              enemy.cavalryTimer = (enemy.cavalryTimer ?? 0) - delta;
              if (enemy.cavalryTimer <= 0 || dist > 22) {
                enemy.cavalryChargeState = 'CHARGE';
                enemy.cavalryTimer = 0;
              }
            }
          }
          // ─── 2. DÜŞMAN OKÇUSU GERİ ADIM / KITING (Bannerlord Ranged Skirmish) ───
          else if (enemy.division === 'ARCHERS') {
            const isDangerClose = dist < 8.0 && dist > 1.6;
            if (isDangerClose) {
              const awayX = (enemy.x - tx) / dist;
              const awayZ = (enemy.z - tz) / dist;
              const kiteSpd = 2.75;
              moveSpd = kiteSpd;
              enemy.x += awayX * kiteSpd * delta;
              enemy.z += awayZ * kiteSpd * delta;
              desiredFacing = Math.atan2(tx - enemy.x, tz - enemy.z);
            } else {
              if (enemyTacticalMode !== 'CHARGE' && dist > 6.0 && slot) {
                goalX = slot.x;
                goalZ = slot.z;
                desiredFacing = slot.facing;
              }
              const toGoalX = goalX - enemy.x;
              const toGoalZ = goalZ - enemy.z;
              const distToGoal = Math.hypot(toGoalX, toGoalZ);
              if (distToGoal > 10.5) {
                moveSpd = 3.1;
                enemy.x += (toGoalX / distToGoal) * moveSpd * delta;
                enemy.z += (toGoalZ / distToGoal) * moveSpd * delta;
              }
            }
          }
          // ─── 3. DÜŞMAN PİYADESİ (Tier Bazlı Taktik, Kuşatılma Algısı ve Flank Adımı) ───
          else {
            const isElite = (enemy.tier ?? 3) >= 4 || enemy.isLord;

            // Kuşatılma Algısı (Tier 4+ lejyonerler 2+ kişiye karşı kalkanla geri adım atar)
            if (isElite && (enemy.tacticalTimer ?? 0) <= 0 && dist < 3.2) {
              const nearby = grid.queryRadius(enemy.x, enemy.z, 2.7);
              let hostileCount = 0;
              let friendlyCount = 0;
              for (const n of nearby) {
                if (!n.alive) continue;
                if (n.team === 'ALLY') hostileCount++;
                else if (n.team === 'ENEMY' && n.id !== enemy.id) friendlyCount++;
              }
              if (hostileCount >= 2 && friendlyCount === 0) {
                enemy.tacticalStance = 'BACKPEDAL';
                enemy.tacticalTimer = 1.35;
              } else {
                enemy.tacticalStance = 'ATTACK';
              }
            }

            if (enemy.tacticalStance === 'BACKPEDAL') {
              if (enemy.hasShield) enemy.animator.block('up');
              const toX = tx - enemy.x;
              const toZ = tz - enemy.z;
              const d = Math.hypot(toX, toZ) || 0.01;
              desiredFacing = Math.atan2(toX, toZ);
              moveSpd = 2.1;
              enemy.x -= (toX / d) * moveSpd * delta;
              enemy.z -= (toZ / d) * moveSpd * delta;

              enemy.tacticalTimer = (enemy.tacticalTimer ?? 0) - delta;
              if (enemy.tacticalTimer <= 0) enemy.tacticalStance = 'ATTACK';
            } else {
              if (enemyTacticalMode !== 'CHARGE' && dist > 5.5 && slot) {
                goalX = slot.x;
                goalZ = slot.z;
                desiredFacing = slot.facing;
              } else if (dist < 3.5) {
                goalX = tx;
                goalZ = tz;
                desiredFacing = Math.atan2(tx - enemy.x, tz - enemy.z);

                // Flank Adımı (Elit düşman kalkanlı hedefin etrafından dolanır)
                if (isElite && dist < 2.5) {
                  const strafe = enemy.strafeSign || -1;
                  const perpX = -Math.cos(desiredFacing) * strafe;
                  const perpZ = Math.sin(desiredFacing) * strafe;
                  goalX += perpX * 1.5;
                  goalZ += perpZ * 1.5;
                }
              }

              const toGoalX = goalX - enemy.x;
              const toGoalZ = goalZ - enemy.z;
              const distToGoal = Math.hypot(toGoalX, toGoalZ);
              const standOff = enemyTacticalMode === 'CHARGE' ? 1.85 : 0.45;

              if (distToGoal > standOff) {
                const baseSpd = 3.1;
                const tacticSpeedMod = enemyTacticalMode === 'HOLD' ? 0.65 : 1.0;
                moveSpd = baseSpd * tacticSpeedMod;
                enemy.x += (toGoalX / distToGoal) * moveSpd * delta;
                enemy.z += (toGoalZ / distToGoal) * moveSpd * delta;
              }
            }
          }

          // Düşmanlar İçin Elastik İtme Fiziği (Yalnızca hareket ederken veya yakın temasta)
          if (moveSpd > 0.1 || dist < 3.5) {
            const neighbors = grid.queryRadius(enemy.x, enemy.z, enemy.horse ? 1.6 : 1.15);
            for (let ni = 0; ni < neighbors.length; ni++) {
              const nb = neighbors[ni];
              if (nb.id === enemy.id || !nb.alive) continue;
              const sx = enemy.x - nb.x;
              const sz = enemy.z - nb.z;
              const sdSq = sx * sx + sz * sz;
              const minDist = (enemy.horse || nb.horse) ? 1.55 : (enemy.team === nb.team ? 1.05 : 0.88);
              const minDSq = minDist * minDist;
              if (sdSq < minDSq && sdSq > 0.0001) {
                const sd = Math.sqrt(sdSq);
                const pushForce = ((minDist - sd) / minDist) * (enemy.horse ? 3.4 : 2.5);
                const invSd = 1 / sd;
                enemy.x += sx * invSd * pushForce * delta;
                enemy.z += sz * invSd * pushForce * delta;
              }
            }
          }

          // Arena Sınır Koruması
          const boundX = isFieldOrSiege ? 78 : (ARENA_RADIUS - 0.7);
          const boundZ = isFieldOrSiege ? (fieldSpawnZRef.current + 38) : (ARENA_RADIUS - 0.7);
          enemy.x = THREE.MathUtils.clamp(enemy.x, -boundX, boundX);
          enemy.z = THREE.MathUtils.clamp(enemy.z, -boundZ, boundZ);

          enemy.yaw = desiredFacing;
          enemy.animator.setMove(0, enemy.horse ? 0 : moveSpd);

          enemy.aiTimer -= delta;
          if (enemyTacticalMode === 'HOLD' && enemy.hasShield && dist > 3.5) {
            enemy.animator.block('up');
          } else if (enemy.division === 'ARCHERS' && enemy.aiTimer <= 0 && dist < 22 && dist > 2.2) {
            enemy.animator.play('bow_release', { force: true });
            const origin = new THREE.Vector3(enemy.x, 1.45, enemy.z);
            const dir = new THREE.Vector3(tx - enemy.x, 0.55 + dist * 0.04, tz - enemy.z).normalize();
            fireArrowProjectile('ENEMY', origin, dir);
            enemy.aiTimer = 2.8 + Math.random() * 0.9;
          } else if (dist < 2.35 && enemy.aiTimer <= 0) {
            const blockChance = (enemy.tier ?? 3) >= 5 ? 0.75 : ((enemy.tier ?? 3) >= 4 ? 0.50 : 0.22);
            if (Math.random() < blockChance && enemy.hasShield) {
              enemy.blockDir = ALL_DIRS[Math.floor(Math.random() * 4)];
              enemy.animator.block(enemy.blockDir);
              enemy.aiTimer = 0.65;
            } else {
              enemy.animator.release();
              const dir = ALL_DIRS[Math.floor(Math.random() * 4)];
              enemy.attackDir = dir;
              enemy.animator.attack(dir, false);
              enemy.aiTimer = (enemy.tier >= 5 ? 0.95 : 1.25) + Math.random() * 0.45;

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
                    if (isMountedRef.current && playerHorseRef.current && playerRigRef.current) {
                      const pHorse = playerHorseRef.current;
                      pHorse.riderMount.remove(playerRigRef.current.root);
                      const scn = sceneRef.current;
                      if (scn) scn.add(playerRigRef.current.root);
                      setIsMounted(false);
                      isMountedRef.current = false;
                      playerPosRef.current.x += 0.85;
                      playerRigRef.current.root.position.set(playerPosRef.current.x, 0, playerPosRef.current.z);
                      playerRigRef.current.root.rotation.set(0, playerYawRef.current + 0.45, 0);
                      playerRigRef.current.pelvis.position.set(0, 0, 0);
                      playerRigRef.current.pelvis.rotation.set(0, 0, 0);
                      playerRigRef.current.leftThigh.rotation.set(0, 0, 0);
                      playerRigRef.current.rightThigh.rotation.set(0, 0, 0);
                      playerRigRef.current.leftShin.rotation.set(0, 0, 0);
                      playerRigRef.current.rightShin.rotation.set(0, 0, 0);
                      playerRigRef.current.leftFoot.rotation.set(0, 0, 0);
                      playerRigRef.current.rightFoot.rotation.set(0, 0, 0);
                    }
                    pAnim?.fall();
                    if (!playerFallenNoticeRef.current) {
                      playerFallenNoticeRef.current = true;
                      sound.playDeathScream();
                      spawnDamageText('AĞIR YARALANDIN VE YERE DÜŞTÜN!', '#dc2626', playerPosRef.current);
                      // Komutan düştü: müttefiklere -22 moral şoku
                      for (const st of allyMoraleStatesRef.current.values()) {
                        st.commanderDown = true;
                      }
                    }
                  } else {
                    sound.playHit();
                    sound.playPainReaction();
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
                    if (ally.horse) {
                      dismountFallenRider(ally);
                    } else {
                      ally.animator.fall();
                    }
                    recordUnitCasualty(ally, false);
                    spawnDamageText(`☠️ ${ally.name} Düştü!`, '#f87171', new THREE.Vector3(ally.x, 0, ally.z));
                    pushKillFeedEntry(enemy.name, ally.name, 'ENEMY', '⚔️');
                  } else {
                    ally.animator.hitReact(true);
                  }
                }
              }
            }
          }
        });

        // Sync transforms & animators for all skirmish units
        for (const u of units) {
          const elev = isFieldOrSiege && effectiveMode !== 'SIEGE' ? getFieldElevation(u.x, u.z) : 0;
          if (u.fallingFromHorse) {
            u.fallVy = (u.fallVy || 0) - 9.8 * delta;
            u.fallY = (u.fallY ?? 1.35) + u.fallVy * delta;
            u.fallRoll = (u.fallRoll || 0) + (u.fallRollSpeed || 3.2) * delta;
            if (u.fallY <= elev) {
              u.fallingFromHorse = false;
              u.fallY = elev;
              u.rig.root.position.set(u.x, elev, u.z);
              u.rig.root.rotation.set(0, u.yaw, THREE.MathUtils.clamp(u.fallRoll, -1.4, 1.4));
              sound.playShieldHit();
            } else {
              u.rig.root.position.set(u.x, u.fallY, u.z);
              u.rig.root.rotation.set(u.fallRoll * 0.5, u.yaw, u.fallRoll);
            }
            u.animator.fall();
            u.animator.update(delta);
            if (u.horse && u.isRiderlessHorse) {
              const hElev = isFieldOrSiege && effectiveMode !== 'SIEGE' ? getFieldElevation(u.horse.root.position.x, u.horse.root.position.z) : 0;
              u.horse.root.position.y = hElev;
              if (u.panicTimer && u.panicTimer > 0) {
                u.panicTimer -= delta;
                const spd = THREE.MathUtils.lerp(0, u.panicVelocity || 7.5, Math.min(1, u.panicTimer / 1.5));
                const fwdX = -Math.sin(u.panicDir || u.yaw);
                const fwdZ = -Math.cos(u.panicDir || u.yaw);
                u.horse.root.position.x += fwdX * spd * delta;
                u.horse.root.position.z += fwdZ * spd * delta;
                u.horse.root.rotation.y = u.panicDir || u.yaw;
                updateWarHorseAnimation(u.horse, spd, elapsed);
              } else {
                updateWarHorseAnimation(u.horse, 0, elapsed);
              }
            }
            continue;
          }

          if (!u.alive) {
            u.animator.setMove(0, 0);
            u.animator.update(delta);
            u.rig.root.position.set(u.x, elev, u.z);
            if (u.horse && u.isRiderlessHorse) {
              const hElev = isFieldOrSiege && effectiveMode !== 'SIEGE' ? getFieldElevation(u.horse.root.position.x, u.horse.root.position.z) : 0;
              u.horse.root.position.y = hElev;
              if (u.panicTimer && u.panicTimer > 0) {
                u.panicTimer -= delta;
                const spd = THREE.MathUtils.lerp(0, u.panicVelocity || 7.5, Math.min(1, u.panicTimer / 1.5));
                const fwdX = -Math.sin(u.panicDir || u.yaw);
                const fwdZ = -Math.cos(u.panicDir || u.yaw);
                u.horse.root.position.x += fwdX * spd * delta;
                u.horse.root.position.z += fwdZ * spd * delta;
                u.horse.root.rotation.y = u.panicDir || u.yaw;
                updateWarHorseAnimation(u.horse, spd, elapsed);
              } else {
                updateWarHorseAnimation(u.horse, 0, elapsed);
              }
            }
            continue;
          }

          const cam = cameraRef.current;
          const distToCam = cam ? Math.hypot(cam.position.x - u.x, cam.position.z - u.z) : 10;

          // 1. Dinamik Gölge Culling (Yalnızca kameraya < 34m mesafedeki birimler gölge döker)
          const shouldCastShadow = distToCam < 34;
          if (u.currentShadowState !== shouldCastShadow) {
            u.currentShadowState = shouldCastShadow;
            u.rig.root.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = shouldCastShadow;
              }
            });
            if (u.horse) {
              u.horse.root.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                  child.castShadow = shouldCastShadow;
                }
              });
            }
          }

          // 2. İskelet Animasyonu Kademelendirmesi (Tick Staggering / Skeletal LOD)
          u.animTickCounter = (u.animTickCounter || 0) + 1;
          const shouldUpdateAnim =
            distToCam < 25
              ? true
              : distToCam < 55
                ? u.animTickCounter % 2 === 0
                : u.animTickCounter % 3 === 0;

          if (shouldUpdateAnim) {
            const animDelta = delta * (distToCam < 25 ? 1 : distToCam < 55 ? 2 : 3);
            u.animator.update(animDelta);
            if (u.horse) {
              updateWarHorseAnimation(u.horse, 4.2, elapsed);
              applyRiderMountedPosture(u.rig, 4.2, elapsed);
            }
          }

          if (u.horse) {
            u.horse.root.position.set(u.x, elev, u.z);
            u.horse.root.rotation.y = u.yaw;
          } else {
            u.rig.root.position.set(u.x, elev, u.z);
            u.rig.root.rotation.y = u.yaw;
          }
        }

        // Update live counts without allocating new arrays every frame
        let curAllies = 0;
        let curEnemies = 0;
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (u.alive && !u.routed) {
            if (u.team === 'ALLY') curAllies++;
            else curEnemies++;
          }
        }
        setAllyAliveCount(curAllies);
        setEnemyAliveCount(curEnemies);

        // 11.4: Skor Tablosu senkronizasyonu (~6Hz)
        hudSyncThrottleRef.current += delta;
        if (hudSyncThrottleRef.current >= 0.16) {
          hudSyncThrottleRef.current = 0;
          const medSkill = campaign?.skills?.medicine?.level ?? 35;
          const allySplit = splitBattleCasualties(allyCasualtiesRef.current, medSkill);
          const enemySplit = splitBattleCasualties(
            enemyCasualtiesRef.current,
            Math.round(35 + (targetLord?.clanTier ?? 2) * 8)
          );

          const alliesRows = Array.from(allyMoraleStatesRef.current.entries()).map(([cls, st]) => {
            const divName = unitTierIdToDivision(cls);
            const alive = units.filter((u) => u.team === 'ALLY' && u.alive && !u.routed && u.division === divName).length;
            const killed = allySplit.killed[cls] ?? 0;
            const wounded = allySplit.wounded[cls] ?? 0;
            const routed = allyRoutedRef.current[cls] ?? 0;
            return {
              division: cls,
              label: DIVISION_LABEL[cls],
              initial: st.initialFielded,
              alive,
              wounded,
              killed,
              routed,
              morale: st.currentMorale,
              isRouting: st.isRouting,
            };
          });

          const enemiesRows = Array.from(enemyMoraleStatesRef.current.entries()).map(([cls, st]) => {
            const divName = unitTierIdToDivision(cls);
            const alive = units.filter((u) => u.team === 'ENEMY' && u.alive && !u.routed && u.division === divName).length;
            const killed = enemySplit.killed[cls] ?? 0;
            const wounded = enemySplit.wounded[cls] ?? 0;
            const routed = enemyRoutedRef.current[cls] ?? 0;
            return {
              division: cls,
              label: DIVISION_LABEL[cls],
              initial: st.initialFielded,
              alive,
              wounded,
              killed,
              routed,
              morale: st.currentMorale,
              isRouting: st.isRouting,
            };
          });

          setScoreboardData({
            allies: alliesRows,
            enemies: enemiesRows,
            totalAlliesAlive: curAllies,
            totalEnemiesAlive: curEnemies,
            totalAlliesKilled: allySplit.totalKilled,
            totalEnemiesKilled: enemySplit.totalKilled,
            totalAlliesWounded: allySplit.totalWounded,
            totalEnemiesWounded: enemySplit.totalWounded,
            totalAlliesRouted: Object.values(allyRoutedRef.current).reduce((a, b) => a + (b || 0), 0),
            totalEnemiesRouted: Object.values(enemyRoutedRef.current).reduce((a, b) => a + (b || 0), 0),
          });
        }

        // Next wave check OR Campaign Battle Victory/Defeat
        if (curEnemies === 0 && units.length > 0) {
          if (isFieldOrSiege) {
            if (!battleOutcome) {
              const medSkill = campaign?.skills?.medicine?.level ?? 35;
              const split = splitBattleCasualties(allyCasualtiesRef.current, medSkill);
              const defeatedCount = units.filter((u) => u.team === 'ENEMY' && (!u.alive || u.routed)).length;
              const totalEnemiesDefeated = Math.max(
                defeatedCount,
                killsCountRef.current,
                units.filter((u) => u.team === 'ENEMY').length,
              );
              sound.playVictoryFanfare();
              aliveAllies.forEach((a) => {
                a.animator.setMove(0, 0);
                a.animator.play('cheer');
              });
              setBattleOutcome({
                victory: true,
                enemiesDefeated: totalEnemiesDefeated,
                losses: split.killed,
                wounded: split.wounded,
                survivalRate: split.survivalRate,
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
          // Oyuncu da düştü ve tüm müttefikler elendi/kaçtı: YENİLGİ & ESARET
          const medSkill = campaign?.skills?.medicine?.level ?? 35;
          const split = splitBattleCasualties(allyCasualtiesRef.current, medSkill);
          const enemyCasualties = units.filter((u) => u.team === 'ENEMY' && (!u.alive || u.routed)).length;
          sound.playDefeatSting();
          aliveEnemies.forEach((e) => {
            e.animator.setMove(0, 0);
            e.animator.play('cheer');
          });
          setBattleOutcome({
            victory: false,
            enemiesDefeated: Math.max(enemyCasualties, killsCountRef.current),
            losses: split.killed,
            wounded: split.wounded,
            survivalRate: split.survivalRate,
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
            const medSkill = campaign?.skills?.medicine?.level ?? 35;
            if (pool.enemiesAliveCount <= 0 && pool.alliesAliveCount > 0) {
              const fallenAllies = Math.max(0, preset.alliesCount - pool.alliesAliveCount);
              const rawLosses = {
                infantry: Math.round(fallenAllies * 0.5),
                archer: Math.round(fallenAllies * 0.3),
                cavalry: Math.round(fallenAllies * 0.2),
              };
              const split = splitBattleCasualties(rawLosses, medSkill);
              setBattleOutcome({
                victory: true,
                enemiesDefeated: preset.enemiesCount,
                losses: split.killed,
                wounded: split.wounded,
                survivalRate: split.survivalRate,
              });
            } else if (pool.alliesAliveCount <= 0) {
              const rawLosses = {
                infantry: Math.round(preset.alliesCount * 0.5),
                archer: Math.round(preset.alliesCount * 0.3),
                cavalry: Math.round(preset.alliesCount * 0.2),
              };
              const split = splitBattleCasualties(rawLosses, medSkill);
              setBattleOutcome({
                victory: false,
                enemiesDefeated: Math.floor(preset.enemiesCount * 0.4),
                losses: split.killed,
                wounded: split.wounded,
                survivalRate: split.survivalRate,
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
      const now = Date.now();
      flyingArrowsRef.current = flyingArrowsRef.current.filter((arrow) => {
        if (arrow.despawnAt && now >= arrow.despawnAt) {
          scene.remove(arrow.mesh);
          return false;
        }
        if (now - arrow.spawnTime > ARROW_LIFETIME) {
          scene.remove(arrow.mesh);
          return false;
        }
        return true;
      });

      const arrows = flyingArrowsRef.current;
      for (const arrow of arrows) {
        if (!arrow.inFlight) continue;

        arrow.velocity.addScaledVector(gravity, delta);
        arrow.mesh.position.addScaledVector(arrow.velocity, delta);

        const forward = arrow.velocity.clone().normalize();
        arrow.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);

        const groundElev = isFieldOrSiege && effectiveMode !== 'SIEGE'
          ? getFieldElevation(arrow.mesh.position.x, arrow.mesh.position.z)
          : 0;

        // Ground collision
        if (arrow.mesh.position.y <= groundElev + 0.05) {
          arrow.inFlight = false;
          arrow.mesh.position.y = groundElev + 0.05;
          arrow.despawnAt = now + 4000;
          continue;
        }

        // Archery target collision
        const distToTarget = arrow.mesh.position.distanceTo(new THREE.Vector3(-5.5, 1.25, -8));
        if (distToTarget < 0.6) {
          arrow.inFlight = false;
          arrow.despawnAt = now + 4000;
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
            arrow.despawnAt = now + 3000;
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
              arrow.despawnAt = now + 1500;
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
                  sound.playDeathScream();
                  spawnDamageText(`🏹 OK İLE DEVİRDİN! (+${bowDmg})`, '#facc15', botRoot.position);
                } else {
                  botAnimatorRef.current?.hitReact(true);
                  sound.playPainReaction();
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
              arrow.despawnAt = now + 1500;
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
                  sound.playDeathScream();
                  if (isMountedRef.current && playerHorseRef.current && playerRigRef.current) {
                    const pHorse = playerHorseRef.current;
                    pHorse.riderMount.remove(playerRigRef.current.root);
                    const scn = sceneRef.current;
                    if (scn) scn.add(playerRigRef.current.root);
                    setIsMounted(false);
                    isMountedRef.current = false;
                    playerPosRef.current.x += 0.85;
                    const pElev = isFieldOrSiege && effectiveMode !== 'SIEGE' ? getFieldElevation(playerPosRef.current.x, playerPosRef.current.z) : 0;
                    playerRigRef.current.root.position.set(playerPosRef.current.x, pElev, playerPosRef.current.z);
                    playerRigRef.current.root.rotation.set(0, playerYawRef.current + 0.45, 0);
                    playerRigRef.current.pelvis.position.set(0, 0, 0);
                    playerRigRef.current.pelvis.rotation.set(0, 0, 0);
                    playerRigRef.current.leftThigh.rotation.set(0, 0, 0);
                    playerRigRef.current.rightThigh.rotation.set(0, 0, 0);
                    playerRigRef.current.leftShin.rotation.set(0, 0, 0);
                    playerRigRef.current.rightShin.rotation.set(0, 0, 0);
                    playerRigRef.current.leftFoot.rotation.set(0, 0, 0);
                    playerRigRef.current.rightFoot.rotation.set(0, 0, 0);
                  }
                  pAnim?.fall();
                  if (!playerFallenNoticeRef.current) {
                    playerFallenNoticeRef.current = true;
                    sound.playDeathScream();
                    spawnDamageText('OKLA VURULDUN VE YERE DÜŞTÜN!', '#dc2626', pPos);
                    for (const st of allyMoraleStatesRef.current.values()) {
                      st.commanderDown = true;
                    }
                  }
                } else {
                  sound.playPainReaction();
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
              arrow.despawnAt = now + 1500;
              hitUnit = true;
              sound.playShieldHit();
              const inSW = u.team === 'ALLY' && formationArrangementRef.current === 'SHIELD_WALL';
              if ((u.animator.isBlocking() && u.hasShield) || (inSW && u.hasShield)) {
                const reduced = Math.round(36 * (inSW ? 0.15 : 0));
                if (reduced > 0) u.hp = Math.max(0, u.hp - reduced);
                spawnDamageText('🛡️ KALKAN DUVARI OKU TUTTU!', '#38bdf8', new THREE.Vector3(u.x, 0, u.z));
              } else {
                const bowDmg = Math.round(38 * (0.8 + 0.4 * arrow.power));
                u.hp = Math.max(0, u.hp - bowDmg);
                if (u.hp <= 0) {
                  u.alive = false;
                  sound.playDeathScream();
                  if (u.horse) {
                    dismountFallenRider(u);
                  } else {
                    u.animator.fall();
                  }
                  recordUnitCasualty(u, false);
                  if (u.team === 'ENEMY') {
                    setKillsCount((k) => k + 1);
                    if (u.isLord) {
                      sound.playDeathScream();
                      spawnDamageText(`${u.name.toUpperCase()} OKLA MAĞLUP EDİLDİ!`, '#fbbf24', new THREE.Vector3(u.x, 2.0, u.z));
                      pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', u.name, 'ALLY', '🏹');
                    } else {
                      pushKillFeedEntry(campaign?.playerName ?? 'Oyuncu', u.name, 'ALLY', '🏹');
                    }
                  } else {
                    pushKillFeedEntry(arrow.team === 'ENEMY' ? (targetLord?.name ?? 'Düşman Okçusu') : 'Düşman', u.name, 'ENEMY', '🏹');
                  }
                } else {
                  sound.playPainReaction();
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
            arrow.despawnAt = now + 1500;
            pool.soldierHp[cand.index] -= 48;
            sound.playShieldHit();
            if (pool.soldierHp[cand.index] <= 0) {
              pool.soldierAlive[cand.index] = 0;
              pool.recordFallenCorpse(pool.soldierX[cand.index], 0.08, pool.soldierZ[cand.index], pool.soldierYaw[cand.index], 2);
              setKillsCount((k) => k + 1);
              sound.playDeathScream();
              spawnDamageText('🏹 OK İLE DEVİRDİN!', '#facc15', arrow.mesh.position);
            } else {
              sound.playPainReaction();
            }
            break;
          }
          if (!arrow.inFlight) continue;
        }

        // Lifetime
        if (now - arrow.spawnTime > ARROW_LIFETIME) {
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
      try {
        renderer.forceContextLoss();
      } catch {
        // yoksay
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
        <BattleTopHeader
          isFieldOrSiege={isFieldOrSiege}
          onReturnToMap={onReturnToMap}
          onOpenMarket={onOpenMarket}
          arenaBattleMode={arenaBattleMode}
          setArenaBattleMode={setArenaBattleMode}
          isMounted={isMounted}
          setIsMounted={setIsMounted}
          playerHp={playerHp}
          botHp={botHp}
          skirmishWave={skirmishWave}
          allyAliveCount={allyAliveCount}
          enemyAliveCount={enemyAliveCount}
          pooledArrowsCount={pooledArrowsCount}
          pooledCorpsesCount={pooledCorpsesCount}
          siegeEnabled={siegeEnabled}
          siegeGateHpPct={siegeGateHpPct}
          killsCount={killsCount}
          controlMode={controlMode}
          setControlMode={setControlMode}
          targetLord={targetLord}
          targetSettlement={targetSettlement}
          battleOutcome={battleOutcome}
          fpsStats={fpsStats}
        />

        <BattleTacticalHUD
          arenaBattleMode={arenaBattleMode}
          activeTacticalMenu={activeTacticalMenu}
          setActiveTacticalMenu={setActiveTacticalMenu}
          issueHoldPositionOrder={issueHoldPositionOrder}
          showOrderShout={showOrderShout}
          formationOrder={formationOrder}
          setFormationOrder={(order) => {
            setFormationOrder(order);
            formationOrderRef.current = order;
            if (tacticalBannerRef.current && (order === 'FOLLOW_ME' || order === 'CHARGE')) {
              tacticalBannerRef.current.visible = false;
            }
          }}
          formationArrangement={formationArrangement}
          setFormationArrangement={(arr) => {
            setFormationArrangement(arr);
            formationArrangementRef.current = arr;
          }}
          fireOrder={fireOrder}
          setFireOrder={(fo) => {
            setFireOrder(fo);
            fireOrderRef.current = fo;
          }}
          isFieldOrSiege={isFieldOrSiege}
          selectedDivision={selectedDivision}
          setSelectedDivision={(div) => {
            setSelectedDivision(div);
            selectedDivisionRef.current = div;
          }}
          battleScale={battleScale}
          setBattleScale={setBattleScale}
          siegeEnabled={siegeEnabled}
          setSiegeEnabled={setSiegeEnabled}
          launchMassBattleWithPrewarm={launchMassBattleWithPrewarm}
        />
      </header>

      <BattleKillFeed killFeed={killFeed} orderShout={orderShout} />

      {/* ⚔️ BANNERLORD LIVE TAB SCOREBOARD & MORALE MODAL (11.4) */}
      <BattleScoreboardModal
        showScoreboard={showScoreboard}
        effectiveMode={effectiveMode}
        scoreboardData={scoreboardData}
        allyAliveCount={allyAliveCount}
        onClose={() => setShowScoreboard(false)}
        onTacticalRetreat={handleTacticalRetreat}
      />

      {/* 🏆 VICTORY / ☠️ DEFEAT & ESARET BATTLE OUTCOME MODAL */}
      <BattleOutcomeModal
        effectiveMode={effectiveMode}
        battleOutcome={battleOutcome}
        onReturnToMap={onReturnToMap}
        onBattleComplete={onBattleCompleteRef.current}
      />

      {/* BANNERLORD / WARBAND 4-DIRECTIONAL COMBAT RETICLE (PLAYABLE MODE ONLY) */}
      <BattleCombatReticle
        controlMode={controlMode}
        weaponType={weaponType}
        shieldType={shieldType}
        isAimingBow={isAimingBow}
        isAttacking={isAttacking}
        isBlocking={isBlocking}
        combatDirection={combatDirection}
        bowPowerLabelRef={bowPowerLabelRef}
        bowPowerBarRef={bowPowerBarRef}
        isFieldOrSiege={isFieldOrSiege}
      />

      {/* BOTTOM CONTROL DOCK (Only in Arena Training / Testing Mode, Never in Field/Siege Battles) */}
      <BattleTestingDock
        isFieldOrSiege={isFieldOrSiege}
        dockCollapsed={dockCollapsed}
        setDockCollapsed={setDockCollapsed}
        activeDockTab={activeDockTab}
        setActiveDockTab={setActiveDockTab}
        weaponType={weaponType}
        setWeaponType={setWeaponType}
        armorTier={armorTier}
        setArmorTier={setArmorTier}
        helmetType={helmetType}
        setHelmetType={setHelmetType}
        shieldType={shieldType}
        setShieldType={setShieldType}
        factionColor={factionColor}
        setFactionColor={setFactionColor}
        hasBeard={hasBeard}
        setHasBeard={setHasBeard}
        activeAnimLabel={activeAnimLabel}
        triggerDirectionalAction={triggerDirectionalAction}
        triggerAnimation={triggerAnimation}
        animSpeed={animSpeed}
        setAnimSpeed={setAnimSpeed}
        isWireframe={isWireframe}
        setIsWireframe={setIsWireframe}
        onResetTargets={() => {
          setArrowCount(32);
          setDummyHitCount(0);
          playerPosRef.current.set(0, 0, 4);
          playerYawRef.current = Math.PI;
          playerPitchRef.current = 0;
          if (playerAnimatorRef.current) playerAnimatorRef.current.reset();
          const scene = sceneRef.current;
          if (scene) {
            for (const arrow of flyingArrowsRef.current) {
              scene.remove(arrow.mesh);
            }
            flyingArrowsRef.current = [];
          }
        }}
      />
    </div>
  );
};
