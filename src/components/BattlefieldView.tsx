/**
 * BattlefieldView.tsx — 10.2/B1: ayrı meydan savaşı misyonu.
 *
 * Savaş artık WorldCanvas sefer sahnesinin içinde düz bir arenada değil,
 * kendi sahnesinde geçer: arazi, karşılaşma noktasının sefer haritası
 * çevresinden `battlefield.ts` profiliyle kurulur (nehir/köprü/köy/orman
 * dünya haritasında ne varsa sahnede de o vardır; doğuş kenarları yaklaşma
 * vektöründen türer; alan 460×460 ve kırmızı yumuşak sınırla çevrilidir).
 *
 * B1 kapsamı sahne + taşınan aktör çekirdeğidir. B3 ile Order of Battle
 * konuşlanma fazı eklendi (saf mantık: deployment.ts). Sonraki fazlar:
 * B4 bölük emirleri, B5 1 aktör =
 * 1 asker + takviye dalgaları (şu an taraflar en çok 60 aktöre ölçeklenir
 * ve kayıplar sınıf bazında orantılı yazılır), B6 yönlü şahsi dövüş,
 * B7 moral/bozgun/esaret. Eski arenanın Bannerlord'a yabancı katmanı
 * (dash, stamina, kombo, hitstop, telegraph halkası, kamera sarsıntısı)
 * bu misyona taşınmadı.
 */
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  FACTION_INFO,
  computeMeleeDamage,
  factionHasHorseArchers,
  getTotalTroops,
  type CampaignState,
  type LordAgent,
  type Settlement,
  type TroopRoster,
  type UnitTierId,
} from '../game/rules';
import type { BattleTelemetry } from '../game/types';
import {
  battleGroundY,
  buildBattlefieldProfile,
  clampToBattlefield,
  type BattlefieldProfile,
} from '../game/battlefield';
import { createBattleTerrain } from '../game/battleTerrain';
import {
  DEPLOY_FORMATION_LABEL,
  DEPLOY_ZONE,
  DEPLOYMENT_MIN_TROOPS,
  DIVISION_LABEL,
  DIVISION_NUMBER,
  DIVISION_ORDER,
  MAX_PER_ROW,
  MIN_PER_ROW,
  clampToDeployZone,
  computeDivisionSlots,
  defaultPerRow,
  formationCycleFor,
  nextFormation,
  type DeployFormation,
} from '../game/deployment';
import {
  BATTLE_FIELD_CAP,
  REINFORCEMENT_CHECK_INTERVAL,
  allocateByClass,
  computeInitialFieldCounts,
  hasReserves,
  planReinforcementWave,
  remainingReserves,
} from '../game/reinforcements';
import {
  animateWarriorRigPose,
  createWarriorModel,
  type WarriorMeshHandles,
} from '../game/proceduralModels';
import {
  type AttackDirection,
  type BallisticArrow,
  type BattleAttackPhase,
  type DirectionalReticleState,
  type DivisionMoraleState,
  applyDivisionCasualtyShock,
  applyReinforcementMoraleBoost,
  canMaintainCouchLance,
  computeArcherAimVelocity,
  computeDirectionalReticleState,
  createDivisionMoraleState,
  derivePlayerBattleLoadout,
  getUnitClassCombatSpec,
  resolveBattleActorCollisions,
  resolveDirectionalMeleeHit,
  shouldUnitUseRanged,
  splitBattleCasualties,
  stepBallisticArrow,
  stepDivisionMorale,
  stepPlayerAttackState,
} from '../game/battleCombat';
import { sound } from '../game/sound';

interface BattlefieldViewProps {
  /** Duraklatma menüsü açıkken simülasyon donar (bileşen sökülmez). */
  paused?: boolean;
  campaign: CampaignState;
  targetLord: LordAgent | null;
  targetSettlement: Settlement | null;
  onBattleTelemetry: (telemetry: BattleTelemetry) => void;
  onBattleComplete: (
    victory: boolean,
    losses: Partial<TroopRoster>,
    enemiesDefeated: number,
  ) => void;
}

type ActorTeam = 'ally' | 'enemy';
type ActorArchetype = 'CHASER' | 'KITER' | 'CHARGER';

/** B4: bölük hareket emirleri (Bannerlord F1 menüsü). Dur/Fallback da HOLD'a
 *  iner (yeni çapa hedefiyle); ayrıca bak. step() bölük güncellemesi. */
type DivisionMoveOrder = 'HOLD' | 'FOLLOW' | 'CHARGE' | 'ADVANCE' | 'RETREAT';

const MOVE_ORDER_LABEL: Record<DivisionMoveOrder, string> = {
  HOLD: 'Konumu Tut',
  FOLLOW: 'Beni Takip Et',
  CHARGE: 'Hücum',
  ADVANCE: 'İlerle',
  RETREAT: 'Ricat',
};

export interface BattleKillFeedEntry {
  id: number;
  killerName: string;
  victimName: string;
  killerTeam: ActorTeam;
  weaponLabel: string;
  isHeadshot: boolean;
}

export interface BattleOrderShout {
  id: number;
  text: string;
}

interface CmdUiCard {
  cls: UnitTierId;
  num: number;
  alive: number;
  total: number;
  formation: DeployFormation;
  order: DivisionMoveOrder;
  delegated: boolean;
  holdFire: boolean;
  morale: number;
  routing: boolean;
  ammoPct: number | null;
}

interface CmdUiData {
  selection: 'ALL' | UnitTierId;
  menu: 'MOVE' | 'FACE' | 'FORM' | null;
  cards: CmdUiCard[];
  allyAlive: number;
  allyTotal: number;
  allyRouted: number;
  allyWounded: number;
  allyDead: number;
  enemyAlive: number;
  enemyTotal: number;
  enemyRouted: number;
  enemyWounded: number;
  enemyDead: number;
  enemyCommanderName: string;
  enemyHexCss: string;
  playerHp: number;
  playerMaxHp: number;
  horseHp: number;
  horseMaxHp: number;
  shieldHp: number;
  shieldMaxHp: number;
  weaponName: string;
  usingBow: boolean;
  ammo: number;
  maxAmmo: number;
  attackDir: AttackDirection;
  attackPhase: BattleAttackPhase;
  isBlocking: boolean;
  reticle: DirectionalReticleState;
  isCouched: boolean;
  canCouch: boolean;
  isMounted: boolean;
  canMountNearbyHorse: boolean;
  speedMps: number;
  firstPerson: boolean;
  playerKills: number;
  killFeed: BattleKillFeedEntry[];
  orderLog: BattleOrderShout[];
  scoreboardOpen: boolean;
}

interface MissionActor {
  id: string;
  numericId: number;
  displayName: string;
  team: ActorTeam;
  unitType: UnitTierId | 'commander';
  archetype: ActorArchetype;
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  range: number;
  isRanged: boolean;
  isMounted: boolean;
  isBlocking: boolean;
  inShieldWall?: boolean;
  attackDir: AttackDirection;
  blockDir: AttackDirection;
  ammo: number;
  maxAmmo: number;
  shieldHp: number;
  maxShieldHp: number;
  horseHp: number;
  maxHorseHp: number;
  isCouchedLance: boolean;
  couchCooldown: number;
  routing: boolean;
  kills: number;
  phaseOffset: number;
  attackPhase: BattleAttackPhase;
  attackTimer: number;
  cooldownTimer: number;
  hitFlashTimer: number;
  koTimer: number;
  gone: boolean;
  /** B4: bölük üstündeyken her kare doldurulan formasyon slotu (dünya). */
  hasSlot: boolean;
  slotX: number;
  slotZ: number;
  slotFacing: number;
  /** B4: süvari çevrim hücumu durumu. */
  cyclePhase: 'ATTACK' | 'REGROUP';
  cycleTimer: number;
  homeX: number;
  homeZ: number;
  handles: WarriorMeshHandles;
}

const CLASS_ORDER: UnitTierId[] = ['infantry', 'archer', 'horseArcher', 'cavalry'];

function classStats(unitType: UnitTierId): {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  range: number;
  archetype: ActorArchetype;
} {
  switch (unitType) {
    case 'archer':
      return { hp: 75, attack: 17, defense: 7, speed: 5.2, range: 55, archetype: 'KITER' };
    case 'cavalry':
      return { hp: 115, attack: 24, defense: 10, speed: 10.6, range: 2.9, archetype: 'CHARGER' };
    case 'horseArcher':
      return { hp: 95, attack: 18, defense: 8, speed: 10.6, range: 45, archetype: 'KITER' };
    default:
      return { hp: 95, attack: 18, defense: 12, speed: 5.0, range: 2.6, archetype: 'CHASER' };
  }
}

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Konuşlanma diziliş tercihleri savaşlar arasında hatırlanır (Bannerlord'da kalıcıdır). */
const deploymentPrefs: Partial<
  Record<UnitTierId, { formation: DeployFormation; perRow: number }>
> = {};

interface DeployCardData {
  cls: UnitTierId;
  num: number;
  count: number;
  formation: DeployFormation;
  perRow: number;
}

interface DeployApi {
  select: (cls: UnitTierId) => void;
  cycleFormation: (cls: UnitTierId) => void;
  adjustWidth: (cls: UnitTierId, delta: number) => void;
  rotate: (cls: UnitTierId, dir: 1 | -1) => void;
  start: () => void;
}

export const BattlefieldView: React.FC<BattlefieldViewProps> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [deployUi, setDeployUi] = useState<{
    cards: DeployCardData[];
    selected: UnitTierId;
  } | null>(null);
  const [cmdUi, setCmdUi] = useState<CmdUiData | null>(null);
  const deployApiRef = useRef<DeployApi | null>(null);
  const retreatApiRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const { campaign, targetLord, targetSettlement } = propsRef.current;

    /* ── Misyon girdileri: karşılaşma noktası + yaklaşma vektörü ── */
    const anchorX = targetLord?.x ?? targetSettlement?.x ?? campaign.playerX;
    const anchorZ = targetLord?.z ?? targetSettlement?.z ?? campaign.playerZ;
    const profile: BattlefieldProfile = buildBattlefieldProfile({
      worldX: campaign.playerX,
      worldZ: campaign.playerZ,
      dirX: anchorX - campaign.playerX,
      dirZ: anchorZ - campaign.playerZ,
      settlements: campaign.settlements,
    });

    const enemyRoster: TroopRoster = targetLord
      ? targetLord.roster
      : targetSettlement
        ? (() => {
            const haShare = Math.max(2, Math.round((targetSettlement.garrison || 0) * 0.25));
            const hasHA = factionHasHorseArchers(targetSettlement.faction);
            return {
              infantry:
                Math.max(4, Math.round((targetSettlement.militia || 20) * 0.4)) +
                (hasHA ? 0 : haShare),
              archer: Math.max(
                3,
                Math.round(
                  ((targetSettlement.garrison || 0) + (targetSettlement.militia || 10)) * 0.25,
                ),
              ),
              cavalry: Math.max(1, Math.round((targetSettlement.garrison || 0) * 0.15)),
              horseArcher: hasHA ? haShare : 0,
            };
          })()
        : { infantry: 5, archer: 3, cavalry: 2, horseArcher: 1 };
    const enemyFaction = targetLord?.faction ?? targetSettlement?.faction ?? 'bandits';
    const enemyHex = FACTION_INFO[enemyFaction]?.hex ?? 0x991b1b;
    const enemyCommanderName =
      targetLord?.name ?? (targetSettlement ? `${targetSettlement.name} Garnizonu` : 'Haydut Çetesi');

    /* ── Sahne ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Güneş sabit: gölge haritası her Karede değil, 0.5 sn'de bir tazelenir
    // (aşağıda needsUpdate). Hareketli aktör gölgeleri bu aralıkta güncellenir;
    // statik sahnenin her kare tam gölge geçişi bedeli düşer.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const skyByBiome: Record<string, number> = {
      NORTH_SNOW_PEAKS: 0xbdd3e4,
      SOUTH_DESERT: 0xd8e6ee,
      EAST_STEPPE: 0xc4dde8,
    };
    scene.background = new THREE.Color(skyByBiome[profile.biome] ?? 0xbdd8ea);
    scene.fog = new THREE.Fog(scene.background.getHex(), 260, 620);

    const camera = new THREE.PerspectiveCamera(
      55,
      mount.clientWidth / Math.max(1, mount.clientHeight),
      0.1,
      1500,
    );

    const sun = new THREE.DirectionalLight(0xffe4b5, 1.5);
    sun.position.set(-140, 180, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sd = 260;
    sun.shadow.camera.left = -sd;
    sun.shadow.camera.right = sd;
    sun.shadow.camera.top = sd;
    sun.shadow.camera.bottom = -sd;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 700;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x6b5a44, 0.75));

    const terrain = createBattleTerrain(profile);
    scene.add(terrain.group);

    /* ── Aktörler ── */
    const actors: MissionActor[] = [];
    const groundY = (x: number, z: number) => battleGroundY(profile, x, z);

    const playerLoadout = derivePlayerBattleLoadout(campaign);
    const enemyFactionLabel = FACTION_INFO[enemyFaction]?.name ?? 'Düşman';
    const unitClassLabel: Record<UnitTierId, string> = {
      infantry: 'Piyadesi',
      archer: 'Okçusu',
      cavalry: 'Süvarisi',
      horseArcher: 'Atlı Okçusu',
    };

    let actorSeq = 1;
    const spawnActors = (
      team: ActorTeam,
      counts: Record<UnitTierId, number>,
      factionHex: number,
      spawn: { x: number; z: number; facing: number },
    ): MissionActor[] => {
      const created: MissionActor[] = [];
      const forward = team === 'ally' ? -1 : 1; // müttefik -Z'ye, düşman +Z'ye bakar
      const lanes: Array<{ cls: UnitTierId; cx: number; cz: number; perRow: number; gap: number }> = [
        { cls: 'infantry', cx: 0, cz: 0, perRow: 12, gap: 1.35 },
        { cls: 'archer', cx: 0, cz: -9, perRow: 12, gap: 1.7 },
        { cls: 'horseArcher', cx: -30, cz: -4, perRow: 6, gap: 2.6 },
        { cls: 'cavalry', cx: 30, cz: -4, perRow: 6, gap: 2.6 },
      ];
      for (const lane of lanes) {
        const count = counts[lane.cls];
        const stats = classStats(lane.cls);
        const combatSpec = getUnitClassCombatSpec(lane.cls);
        for (let i = 0; i < count; i++) {
          const col = i % lane.perRow;
          const row = Math.floor(i / lane.perRow);
          const x = spawn.x + lane.cx + (col - (lane.perRow - 1) / 2) * lane.gap;
          const z = spawn.z + forward * lane.cz - forward * row * 1.7;
          const handles = createWarriorModel({
            factionHex,
            isMounted: lane.cls === 'cavalry' || lane.cls === 'horseArcher',
            isRanged: lane.cls === 'archer' || lane.cls === 'horseArcher',
          });
          handles.telegraphRing.visible = false;
          handles.root.position.set(x, groundY(x, z), z);
          scene.add(handles.root);
          const numericId = actorSeq++;
          const dirs: AttackDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
          const actor: MissionActor = {
            id: `${team}-${lane.cls}-${numericId}`,
            numericId,
            displayName: `${team === 'ally' ? 'Sancak' : enemyFactionLabel} ${unitClassLabel[lane.cls]}`,
            team,
            unitType: lane.cls,
            archetype: stats.archetype,
            x,
            z,
            vx: 0,
            vz: 0,
            facing: spawn.facing,
            hp: stats.hp,
            maxHp: stats.hp,
            attack: stats.attack,
            defense: stats.defense,
            speed: stats.speed,
            range: stats.range,
            isRanged: lane.cls === 'archer' || lane.cls === 'horseArcher',
            isMounted: lane.cls === 'cavalry' || lane.cls === 'horseArcher',
            isBlocking: false,
            attackDir: dirs[numericId % 4],
            blockDir: dirs[(numericId + 1) % 4],
            ammo: combatSpec.maxAmmo,
            maxAmmo: combatSpec.maxAmmo,
            shieldHp: combatSpec.maxShieldHp,
            maxShieldHp: combatSpec.maxShieldHp,
            horseHp: combatSpec.maxHorseHp,
            maxHorseHp: combatSpec.maxHorseHp,
            isCouchedLance: false,
            couchCooldown: 0,
            routing: false,
            kills: 0,
            phaseOffset: (numericId * 0.73) % (Math.PI * 2),
            attackPhase: 'IDLE',
            attackTimer: 0,
            cooldownTimer: Math.random() * 0.4,
            hitFlashTimer: 0,
            koTimer: 0,
            gone: false,
            hasSlot: false,
            slotX: 0,
            slotZ: 0,
            slotFacing: 0,
            cyclePhase: 'ATTACK',
            cycleTimer: 0,
            homeX: x,
            homeZ: z,
            handles,
          };
          actors.push(actor);
          created.push(actor);
        }
      }
      return created;
    };

    /* B5: 1 aktör = 1 asker. İlk dalga saha bütçesini ordu büyüklüğüne
       orantılı paylaşır (%75 tavanıyla); kalani yedekte bekler ve takviye
       dalgalarıyla kendi kenarından girer (bkz. reinforcements.ts). */
    const allyRosterTotal = Math.max(0, getTotalTroops(campaign.roster));
    const enemyRosterTotal = Math.max(0, getTotalTroops(enemyRoster));
    const initialField = computeInitialFieldCounts(allyRosterTotal, enemyRosterTotal);
    const allyFielded = allocateByClass(campaign.roster, initialField.ally);
    const enemyFielded = allocateByClass(enemyRoster, initialField.enemy);
    const reserves: Record<ActorTeam, TroopRoster> = {
      ally: remainingReserves(campaign.roster, allyFielded),
      enemy: remainingReserves(enemyRoster, enemyFielded),
    };
    spawnActors('ally', allyFielded, FACTION_INFO.player.hex, profile.allySpawn);
    spawnActors('enemy', enemyFielded, enemyHex, profile.enemySpawn);

    // Düşman komutanı (ağır süvari görünümü; kadro dışı tek aktör).
    {
      const handles = createWarriorModel({
        factionHex: enemyHex,
        isMounted: true,
        isHeavy: true,
        isCommander: true,
      });
      handles.telegraphRing.visible = false;
      const x = profile.enemySpawn.x;
      const z = profile.enemySpawn.z - 6;
      handles.root.position.set(x, groundY(x, z), z);
      handles.root.scale.setScalar(1.15);
      scene.add(handles.root);
      const cmdId = actorSeq++;
      actors.push({
        id: 'enemy-commander',
        numericId: cmdId,
        displayName: enemyCommanderName,
        team: 'enemy',
        unitType: 'cavalry',
        archetype: 'CHARGER',
        x,
        z,
        vx: 0,
        vz: 0,
        facing: profile.enemySpawn.facing,
        hp: 165,
        maxHp: 165,
        attack: 28,
        defense: 18,
        speed: 10.8,
        range: 2.9,
        isRanged: false,
        isMounted: true,
        isBlocking: false,
        attackDir: 'RIGHT',
        blockDir: 'UP',
        ammo: 0,
        maxAmmo: 0,
        shieldHp: 210,
        maxShieldHp: 210,
        horseHp: 195,
        maxHorseHp: 195,
        isCouchedLance: false,
        couchCooldown: 0,
        routing: false,
        kills: 0,
        phaseOffset: 0.4,
        attackPhase: 'IDLE',
        attackTimer: 0,
        cooldownTimer: 0,
        hitFlashTimer: 0,
        koTimer: 0,
        gone: false,
        hasSlot: false,
        slotX: 0,
        slotZ: 0,
        slotFacing: 0,
        cyclePhase: 'ATTACK',
        cycleTimer: 0,
        homeX: x,
        homeZ: z,
        handles,
      });
    }

    // Oyuncu komutan (gerçek ekipman ve yeteneklerinden türetilmiş donanımla).
    const playerHandles = createWarriorModel({
      factionHex: FACTION_INFO.player.hex,
      isMounted: playerLoadout.isMounted,
      isCommander: true,
    });
    playerHandles.telegraphRing.visible = false;
    playerHandles.root.scale.setScalar(1.18);

    // Oyuncu attan indiğinde at havada kaybolmaz; indiği noktada canlı olarak bekler!
    const dismountedHorseHandles = createWarriorModel({
      factionHex: FACTION_INFO.player.hex,
      isMounted: true,
      isCommander: true,
    });
    dismountedHorseHandles.telegraphRing.visible = false;
    if (dismountedHorseHandles.riderGroup) {
      dismountedHorseHandles.riderGroup.visible = false;
    }
    dismountedHorseHandles.root.scale.setScalar(1.18);
    dismountedHorseHandles.root.visible = false;
    scene.add(dismountedHorseHandles.root);
    const dismountedHorse = {
      active: false,
      x: profile.allySpawn.x,
      z: profile.allySpawn.z + 8,
      facing: Math.PI,
      handles: dismountedHorseHandles,
    };

    const playerNumericId = actorSeq++;
    const player: MissionActor = {
      id: 'player-commander',
      numericId: playerNumericId,
      displayName: campaign.playerName || 'Sancak Beyi',
      team: 'ally',
      unitType: 'commander',
      archetype: 'CHARGER',
      x: profile.allySpawn.x,
      z: profile.allySpawn.z + 8,
      vx: 0,
      vz: 0,
      facing: Math.PI,
      hp: playerLoadout.initialPlayerHp,
      maxHp: playerLoadout.maxPlayerHp,
      attack: playerLoadout.meleeAttack,
      defense: playerLoadout.armorDefense,
      speed: playerLoadout.isMounted ? playerLoadout.horseSpeed : playerLoadout.footSpeed,
      range: playerLoadout.meleeReach,
      isRanged: false,
      isMounted: playerLoadout.isMounted,
      isBlocking: false,
      attackDir: 'RIGHT',
      blockDir: 'UP',
      ammo: playerLoadout.maxAmmo,
      maxAmmo: playerLoadout.maxAmmo,
      shieldHp: playerLoadout.hasShield ? playerLoadout.maxShieldHp : 0,
      maxShieldHp: playerLoadout.hasShield ? playerLoadout.maxShieldHp : 0,
      horseHp: playerLoadout.isMounted ? playerLoadout.maxHorseHp : 0,
      maxHorseHp: playerLoadout.isMounted ? playerLoadout.maxHorseHp : 0,
      isCouchedLance: false,
      couchCooldown: 0,
      routing: false,
      kills: 0,
      phaseOffset: 0,
      attackPhase: 'IDLE',
      attackTimer: 0,
      cooldownTimer: 0,
      hitFlashTimer: 0,
      koTimer: 0,
      gone: false,
      hasSlot: false,
      slotX: 0,
      slotZ: 0,
      slotFacing: 0,
      cyclePhase: 'ATTACK',
      cycleTimer: 0,
      homeX: profile.allySpawn.x,
      homeZ: profile.allySpawn.z + 8,
      handles: playerHandles,
    };
    playerHandles.root.position.set(player.x, groundY(player.x, player.z), player.z);
    scene.add(playerHandles.root);
    actors.push(player);

    // HUD toplamları yedekler dahil tam ordudur (komutan aktörleri +1).
    const alliesTotal = allyRosterTotal + 1;
    const enemiesTotal = enemyRosterTotal + 1;

    /* ── B3: Order of Battle konuşlanma fazı ──────────────────────────────
       Oyuncu tarafında ≥20 asker varsa savaş konuşlanmayla açılır (Bannerlord
       eşiği ~20): kamera sahneyi üstten görür, bölükler (1 Piyade, 2 Okçu,
       3 Süvari, 4 Atlı Okçu) diziliş bölgesi içinde yerleştirilir. Düşman
       kendi şablonuyla dizilmiş bekler. Simülasyon bu fazda koşmaz. */
    const deployEnabled = getTotalTroops(campaign.roster) >= DEPLOYMENT_MIN_TROOPS;
    let phase: 'deploy' | 'battle' = deployEnabled ? 'deploy' : 'battle';

    interface DivisionState {
      team: ActorTeam;
      cls: UnitTierId;
      x: number;
      z: number;
      facing: number;
      formation: DeployFormation;
      perRow: number;
      members: MissionActor[];
      marker: THREE.Group | null;
      markerMat: THREE.MeshBasicMaterial | null;
      /** B4 emir durumu */
      moveOrder: DivisionMoveOrder;
      facingMode: 'ENEMY' | 'DIRECTION';
      holdFire: boolean;
      /** Kaptan AI yönetiyor (F6); düşman bölükleri hep devredilmiştir. */
      delegated: boolean;
      targetX: number;
      targetZ: number;
      aiTimer: number;
      /** Çapa bu kare hareket ediyor mu + hareket yönü (slot bakışı için). */
      moving: boolean;
      moveDirX: number;
      moveDirZ: number;
      /** B7: Bölük morali ve bozgun durumu */
      morale: DivisionMoraleState;
    }
    const divisions: DivisionState[] = [];
    let selectedCls: UnitTierId = 'infantry';
    let facingDrag = false;

    const createDivisionMarker = (): { group: THREE.Group; mat: THREE.MeshBasicMaterial } => {
      const mat = new THREE.MeshBasicMaterial({
        color: FACTION_INFO.player.hex,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const group = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.15, 40), mat);
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.2, 4), mat);
      arrow.rotation.x = Math.PI / 2; // koni ucu +Y → yerel +Z (bölük bakış yönü)
      arrow.position.set(0, 0, 3.6);
      group.add(arrow);
      return { group, mat };
    };

    const applyDivision = (div: DivisionState) => {
      const slots = computeDivisionSlots(
        div.cls,
        div.members.length,
        div,
        div.formation,
        div.perRow,
      );
      div.members.forEach((actor, i) => {
        const s = slots[i];
        if (!s) return;
        const clamped = clampToBattlefield(profile, s.x, s.z);
        actor.x = clamped.x;
        actor.z = clamped.z;
        actor.homeX = clamped.x;
        actor.homeZ = clamped.z;
        actor.slotX = clamped.x;
        actor.slotZ = clamped.z;
        actor.slotFacing = s.facing;
        actor.hasSlot = true;
        actor.vx = 0;
        actor.vz = 0;
        actor.facing = s.facing;
        actor.handles.root.position.set(clamped.x, groundY(clamped.x, clamped.z), clamped.z);
        actor.handles.root.rotation.y = s.facing;
      });
      if (div.marker) {
        div.marker.position.set(div.x, groundY(div.x, div.z) + 0.2, div.z);
        div.marker.rotation.y = div.facing;
      }
    };

    const refreshDeployUi = () => {
      for (const d of divisions) {
        d.markerMat?.color.setHex(d.cls === selectedCls ? 0xfbbf24 : FACTION_INFO.player.hex);
      }
      setDeployUi({
        cards: divisions.map((d) => ({
          cls: d.cls,
          num: DIVISION_NUMBER[d.cls],
          count: d.members.length,
          formation: d.formation,
          perRow: d.perRow,
        })),
        selected: selectedCls,
      });
    };

    const startBattle = () => {
      if (phase !== 'deploy') return;
      phase = 'battle';
      for (const d of divisions) {
        deploymentPrefs[d.cls] = { formation: d.formation, perRow: d.perRow };
        if (d.marker) d.marker.visible = false;
      }
      zoneGroup.visible = false;
      deployApiRef.current = null;
      setDeployUi(null);
      cmdSelection = 'ALL';
      cmdMenu = null;
      refreshCmdUi();
    };

    const zoneGroup = new THREE.Group();
    const anchorDefaults: Record<UnitTierId, { x: number; z: number }> = {
      infantry: { x: profile.allySpawn.x, z: profile.allySpawn.z },
      archer: { x: profile.allySpawn.x, z: profile.allySpawn.z + 9 },
      horseArcher: { x: profile.allySpawn.x - 30, z: profile.allySpawn.z + 4 },
      cavalry: { x: profile.allySpawn.x + 30, z: profile.allySpawn.z + 4 },
    };
    const enemyAnchorDefaults: Record<UnitTierId, { x: number; z: number }> = {
      infantry: { x: profile.enemySpawn.x, z: profile.enemySpawn.z },
      archer: { x: profile.enemySpawn.x, z: profile.enemySpawn.z - 9 },
      horseArcher: { x: profile.enemySpawn.x + 30, z: profile.enemySpawn.z - 4 },
      cavalry: { x: profile.enemySpawn.x - 30, z: profile.enemySpawn.z - 4 },
    };
    const buildDivision = (
      team: ActorTeam,
      cls: UnitTierId,
      anchor: { x: number; z: number },
      facing: number,
      withMarker: boolean,
      rosterHasClass: boolean,
    ): DivisionState | null => {
      const members = actors.filter((a) => a.team === team && a.unitType === cls);
      if (members.length === 0 && !rosterHasClass) return null;
      const marker = withMarker ? createDivisionMarker() : null;
      if (marker) scene.add(marker.group);
      const pref = team === 'ally' ? deploymentPrefs[cls] : undefined;
      const div: DivisionState = {
        team,
        cls,
        x: anchor.x,
        z: anchor.z,
        facing,
        formation: pref?.formation ?? 'LINE',
        perRow: pref?.perRow ?? defaultPerRow(cls),
        members,
        marker: marker?.group ?? null,
        markerMat: marker?.mat ?? null,
        moveOrder: 'HOLD',
        facingMode: 'ENEMY',
        holdFire: false,
        delegated: team === 'enemy',
        targetX: anchor.x,
        targetZ: anchor.z,
        aiTimer: 0.4 + Math.random() * 0.8,
        moving: false,
        moveDirX: 0,
        moveDirZ: 0,
        morale: createDivisionMoraleState(cls, Math.max(1, members.length), {
          campaignMorale: team === 'ally' ? campaign.morale : 68,
          leadershipSkill: team === 'ally' ? playerLoadout.leadershipSkill : 40,
        }),
      };
      applyDivision(div);
      return div;
    };
    const enemyDivisions: DivisionState[] = [];
    const actorDivision = new Map<string, DivisionState>();
    for (const cls of DIVISION_ORDER) {
      const ally = buildDivision('ally', cls, anchorDefaults[cls], profile.allySpawn.facing, true, campaign.roster[cls] > 0);
      if (ally) {
        divisions.push(ally);
        for (const m of ally.members) actorDivision.set(m.id, ally);
        if (!deployEnabled && ally.marker) ally.marker.visible = false;
      }
      const foe = buildDivision('enemy', cls, enemyAnchorDefaults[cls], profile.enemySpawn.facing, false, enemyRoster[cls] > 0);
      if (foe) {
        enemyDivisions.push(foe);
        for (const m of foe.members) actorDivision.set(m.id, foe);
      }
    }
    selectedCls = divisions[0]?.cls ?? 'infantry';

    /* B5: takviye dalgaları — sahadaki mevcut ilk dalganın yarısına düşünce
       yedekler kendi konuşlanma kenarından girip bölüğüne koşar. */
    const fieldAliveOf = (team: ActorTeam): number =>
      actors.filter(
        (a) =>
          a.team === team &&
          a.hp > 0 &&
          !a.gone &&
          a.id !== 'player-commander' &&
          a.id !== 'enemy-commander',
      ).length;
    const processReinforcements = (team: ActorTeam) => {
      const totalAlive = actors.filter((a) => a.hp > 0 && !a.gone).length;
      const plan = planReinforcementWave({
        fieldAlive: fieldAliveOf(team),
        initialField: team === 'ally' ? initialField.ally : initialField.enemy,
        reserves: reserves[team],
        fieldCapRemaining: BATTLE_FIELD_CAP - totalAlive,
      });
      if (!plan) return;
      const hex = team === 'ally' ? FACTION_INFO.player.hex : enemyHex;
      const spawn = team === 'ally' ? profile.allySpawn : profile.enemySpawn;
      const created = spawnActors(team, plan, hex, spawn);
      const divs = team === 'ally' ? divisions : enemyDivisions;
      for (const a of created) {
        const cls = a.unitType;
        if (cls === 'commander') continue;
        const div = divs.find((d) => d.cls === cls);
        if (div) {
          div.members.push(a);
          actorDivision.set(a.id, div);
        }
      }
      for (const cls of CLASS_ORDER) {
        if (plan[cls] > 0) {
          const div = divs.find((d) => d.cls === cls);
          if (div) applyReinforcementMoraleBoost(div.morale, plan[cls]);
        }
        reserves[team][cls] = Math.max(0, reserves[team][cls] - plan[cls]);
      }
    };

    if (deployEnabled) {
      const zonePoints: THREE.Vector3[] = [];
      const zoneEdges: Array<[number, number, number, number]> = [
        [DEPLOY_ZONE.minX, DEPLOY_ZONE.minZ, DEPLOY_ZONE.maxX, DEPLOY_ZONE.minZ],
        [DEPLOY_ZONE.maxX, DEPLOY_ZONE.minZ, DEPLOY_ZONE.maxX, DEPLOY_ZONE.maxZ],
        [DEPLOY_ZONE.maxX, DEPLOY_ZONE.maxZ, DEPLOY_ZONE.minX, DEPLOY_ZONE.maxZ],
        [DEPLOY_ZONE.minX, DEPLOY_ZONE.maxZ, DEPLOY_ZONE.minX, DEPLOY_ZONE.minZ],
      ];
      for (const [x0, z0, x1, z1] of zoneEdges) {
        const segs = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 12));
        for (let i = 0; i <= segs; i++) {
          const t = i / segs;
          const x = x0 + (x1 - x0) * t;
          const z = z0 + (z1 - z0) * t;
          zonePoints.push(new THREE.Vector3(x, groundY(x, z) + 0.3, z));
        }
      }
      const zoneLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(zonePoints),
        new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.7 }),
      );
      zoneGroup.add(zoneLine);
      scene.add(zoneGroup);

      deployApiRef.current = {
        select: (cls) => {
          selectedCls = cls;
          refreshDeployUi();
        },
        cycleFormation: (cls) => {
          const div = divisions.find((d) => d.cls === cls);
          if (!div) return;
          selectedCls = cls;
          div.formation = nextFormation(cls, div.formation);
          applyDivision(div);
          refreshDeployUi();
        },
        adjustWidth: (cls, delta) => {
          const div = divisions.find((d) => d.cls === cls);
          if (!div) return;
          div.perRow = THREE.MathUtils.clamp(div.perRow + delta, MIN_PER_ROW, MAX_PER_ROW);
          applyDivision(div);
          refreshDeployUi();
        },
        rotate: (cls, dir) => {
          const div = divisions.find((d) => d.cls === cls);
          if (!div) return;
          div.facing += dir * (Math.PI / 12);
          applyDivision(div);
        },
        start: startBattle,
      };
      refreshDeployUi();
    }

    const deployRaycaster = new THREE.Raycaster();
    const groundPointFromEvent = (e: MouseEvent): { x: number; z: number } | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
      deployRaycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hits = deployRaycaster.intersectObject(terrain.group, true);
      return hits.length > 0 ? { x: hits[0].point.x, z: hits[0].point.z } : null;
    };
    const selectedDivision = (): DivisionState | undefined =>
      divisions.find((d) => d.cls === selectedCls);

    // Konuşlanma kamerası: müttefik gerisinden yukarıdan bakan taktik görünüm.
    let deployCamTx = profile.allySpawn.x;
    let deployCamTz = profile.allySpawn.z - 6;
    let deployCamDist = 105;

    /* ── B4: Bölük emirleri (Bannerlord F1–F6 komuta ağacı) ──────────────
       Seçim: 0 Herkes, 1 Piyade, 2 Okçu, 3 Süvari, 4 Atlı Okçu.
       F1 Hareket (Konuma Git/Beni Takip Et/Hücum/İlerle/Geri Çekil/Dur/Ricat),
       F2 Yön (Sancak yönüne/Düşmana), F3 Diziliş, F4 Ateş Serbest/Ateş Kes,
       F6 Komutayı Devret (kaptan AI), F9 Geri. Elle verilen emir devri bozar.
       Düşman bölükleri baştan devredilmiştir (şablon AI aşağıda). */
    let cmdSelection: 'ALL' | UnitTierId = 'ALL';
    let cmdMenu: 'MOVE' | 'FACE' | 'FORM' | null = null;

    // Konum sancağı: F1 menüsü açıkken oyuncunun baktığı yerdeki yeşil işaret.
    const positionFlag = new THREE.Group();
    {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6),
        new THREE.MeshBasicMaterial({ color: 0xd9d9d9 }),
      );
      pole.position.y = 1.7;
      positionFlag.add(pole);
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.9),
        new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide }),
      );
      cloth.position.set(0.78, 2.9, 0);
      positionFlag.add(cloth);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.25, 28),
        new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.15;
      positionFlag.add(ring);
      positionFlag.visible = false;
      scene.add(positionFlag);
    }

    const lookGroundPoint = (): { x: number; z: number } | null => {
      deployRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const hits = deployRaycaster.intersectObject(terrain.group, true);
      return hits.length > 0 ? { x: hits[0].point.x, z: hits[0].point.z } : null;
    };

    const selectedDivisions = (): DivisionState[] =>
      cmdSelection === 'ALL' ? divisions : divisions.filter((d) => d.cls === cmdSelection);

    let killFeedSeq = 1;
    const killFeedLog: BattleKillFeedEntry[] = [];
    const pushKillFeed = (
      killer: MissionActor,
      victim: MissionActor,
      weaponLabel: string,
      isHeadshot = false,
    ) => {
      killer.kills += 1;
      killFeedLog.unshift({
        id: killFeedSeq++,
        killerName: killer.displayName,
        victimName: victim.displayName,
        killerTeam: killer.team,
        weaponLabel,
        isHeadshot,
      });
      if (killFeedLog.length > 6) killFeedLog.length = 6;
    };

    let orderShoutSeq = 1;
    const orderShoutLog: BattleOrderShout[] = [];
    const pushOrderShout = (text: string) => {
      orderShoutLog.unshift({ id: orderShoutSeq++, text });
      if (orderShoutLog.length > 4) orderShoutLog.length = 4;
    };

    let scoreboardOpen = false;
    let firstPersonCam = false;
    let allyRoutedCount = 0;
    let enemyRoutedCount = 0;
    let dirCueTimer = 1.2;
    const trampleCooldownByPair = new Map<string, number>();

    const refreshCmdUi = () => {
      const allyFieldAlive =
        actors.filter((a) => a.team === 'ally' && a.hp > 0 && !a.gone).length +
        getTotalTroops(reserves.ally);
      const enemyFieldAlive =
        actors.filter((a) => a.team === 'enemy' && a.hp > 0 && !a.gone).length +
        getTotalTroops(reserves.enemy);

      const allyFallenByClass: Partial<TroopRoster> = {};
      const enemyFallenByClass: Partial<TroopRoster> = {};
      for (const cls of CLASS_ORDER) {
        allyFallenByClass[cls] = actors.filter(
          (a) => a.team === 'ally' && a.unitType === cls && a.hp <= 0,
        ).length;
        enemyFallenByClass[cls] = actors.filter(
          (a) => a.team === 'enemy' && a.unitType === cls && a.hp <= 0,
        ).length;
      }
      const allyCasualtySplit = splitBattleCasualties(
        allyFallenByClass,
        playerLoadout.surgeonMedicineSkill,
      );
      const enemyCasualtySplit = splitBattleCasualties(enemyFallenByClass, 30);

      const canMountNearbyHorse =
        !player.isMounted &&
        player.horseHp > 0 &&
        (!dismountedHorse.active ||
          Math.hypot(player.x - dismountedHorse.x, player.z - dismountedHorse.z) <= 3.8);

      const reticle = computeDirectionalReticleState({
        attackDir: player.attackDir,
        blockDir: player.blockDir,
        attackPhase: player.attackPhase,
        isBlocking: player.isBlocking,
        hasShield: player.shieldHp > 0,
        mouseLeftHeld,
        usingBow: player.isRanged,
        dirCueTimer,
      });

      setCmdUi({
        selection: cmdSelection,
        menu: cmdMenu,
        cards: divisions.map((d) => {
          const isRangedDiv = d.cls === 'archer' || d.cls === 'horseArcher';
          const aliveMembers = d.members.filter((m) => m.hp > 0 && !m.gone);
          let ammoPct: number | null = null;
          if (isRangedDiv) {
            const totalAmmo = aliveMembers.reduce((s, m) => s + m.ammo, 0);
            const maxAmmoSum = Math.max(1, aliveMembers.reduce((s, m) => s + m.maxAmmo, 0));
            ammoPct = aliveMembers.length > 0 ? Math.round((totalAmmo / maxAmmoSum) * 100) : 0;
          }
          return {
            cls: d.cls,
            num: DIVISION_NUMBER[d.cls],
            alive: aliveMembers.length,
            total: d.members.length,
            formation: d.formation,
            order: d.moveOrder,
            delegated: d.delegated,
            holdFire: d.holdFire,
            morale: d.morale.currentMorale,
            routing: d.morale.isRouting,
            ammoPct,
          };
        }),
        allyAlive: allyFieldAlive,
        allyTotal: alliesTotal,
        allyRouted: allyRoutedCount,
        allyWounded: allyCasualtySplit.totalWounded,
        allyDead: allyCasualtySplit.totalKilled,
        enemyAlive: enemyFieldAlive,
        enemyTotal: enemiesTotal,
        enemyRouted: enemyRoutedCount,
        enemyWounded: enemyCasualtySplit.totalWounded,
        enemyDead: enemyCasualtySplit.totalKilled,
        enemyCommanderName,
        enemyHexCss: hexToCss(enemyHex),
        playerHp: Math.max(0, Math.round(player.hp)),
        playerMaxHp: player.maxHp,
        horseHp: Math.max(0, Math.round(player.horseHp)),
        horseMaxHp: player.maxHorseHp,
        shieldHp: Math.max(0, Math.round(player.shieldHp)),
        shieldMaxHp: player.maxShieldHp,
        weaponName: player.isRanged ? playerLoadout.rangedWeaponName : playerLoadout.meleeWeaponName,
        usingBow: player.isRanged,
        ammo: player.ammo,
        maxAmmo: player.maxAmmo,
        attackDir: player.isBlocking ? player.blockDir : player.attackDir,
        attackPhase: player.attackPhase,
        isBlocking: player.isBlocking,
        reticle,
        isCouched: player.isCouchedLance,
        canCouch: player.isMounted && !player.isRanged,
        isMounted: player.isMounted,
        canMountNearbyHorse,
        speedMps: Number(Math.hypot(player.vx, player.vz).toFixed(1)),
        firstPerson: firstPersonCam,
        playerKills: player.kills,
        killFeed: [...killFeedLog],
        orderLog: [...orderShoutLog],
        scoreboardOpen,
      });
    };

    const computeOrderSummary = (): string => {
      if (divisions.length === 0) return '—';
      if (cmdSelection !== 'ALL') {
        const d = divisions.find((x) => x.cls === cmdSelection);
        return d
          ? `${DIVISION_NUMBER[d.cls]} ${DIVISION_LABEL[d.cls]}: ${MOVE_ORDER_LABEL[d.moveOrder]}`
          : '—';
      }
      const first = divisions[0].moveOrder;
      return divisions.every((d) => d.moveOrder === first)
        ? `Tümü: ${MOVE_ORDER_LABEL[first]}`
        : 'Tümü: Karışık emir';
    };

    const nearestEnemyTo = (
      team: ActorTeam,
      x: number,
      z: number,
    ): { x: number; z: number; dist: number } | null => {
      let best: MissionActor | null = null;
      let bd = Infinity;
      for (const a of actors) {
        if (a.team === team || a.hp <= 0 || a.gone) continue;
        const d = Math.hypot(a.x - x, a.z - z);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      return best ? { x: best.x, z: best.z, dist: bd } : null;
    };

    const resetChargeCycle = (div: DivisionState) => {
      for (const m of div.members) {
        m.cyclePhase = 'ATTACK';
        m.cycleTimer = 5 + Math.random() * 3;
      }
    };

    /* Bölük çapası emre göre yürür; slotlar her Karede tazelenir, aktörler
       slotlarını koruyarak hareket eder (Bannerlord formasyon hareketi). */
    const updateDivision = (div: DivisionState, dt: number, battleElapsedSec: number) => {
      div.moving = false;
      const aliveMembers = div.members.filter((m) => m.hp > 0 && !m.gone);
      if (aliveMembers.length === 0) return;

      const allyCount = actors.filter((a) => a.team === div.team && a.hp > 0 && !a.gone).length;
      const totalCount = Math.max(1, actors.filter((a) => a.hp > 0 && !a.gone).length);
      const commanderActor = actors.find(
        (a) => a.id === (div.team === 'ally' ? 'player-commander' : 'enemy-commander'),
      );
      stepDivisionMorale(div.morale, dt, {
        aliveInDivision: aliveMembers.length,
        commanderDown: (commanderActor?.hp ?? 0) <= 0,
        hasReserves: hasReserves(reserves[div.team]),
        battleElapsedSec,
        allyStrengthRatio: allyCount / totalCount,
      });

      if (div.morale.isRouting) {
        div.moveOrder = 'RETREAT';
        for (const m of aliveMembers) {
          m.routing = true;
        }
      }

      const stats = classStats(div.cls);

      if (div.delegated && !div.morale.isRouting) {
        div.aiTimer -= dt;
        if (div.aiTimer <= 0) {
          div.aiTimer = 0.8 + Math.random() * 0.8;
          const near = nearestEnemyTo(div.team, div.x, div.z);
          if (near) {
            const prev = div.moveOrder;
            if (div.cls === 'infantry') {
              div.moveOrder = near.dist > 42 ? 'ADVANCE' : 'CHARGE';
            } else if (div.cls === 'archer') {
              const hasArrows = aliveMembers.some((m) => m.ammo > 0);
              if (!hasArrows) {
                div.moveOrder = 'CHARGE';
              } else if (near.dist > stats.range * 0.85) {
                div.moveOrder = 'ADVANCE';
              } else {
                div.moveOrder = 'HOLD';
                div.targetX = div.x;
                div.targetZ = div.z;
              }
            } else if (div.cls === 'cavalry') {
              div.moveOrder = near.dist > 55 ? 'ADVANCE' : 'CHARGE';
            } else {
              div.moveOrder = 'CHARGE';
            }
            if (div.moveOrder === 'CHARGE' && prev !== 'CHARGE') resetChargeCycle(div);
          }
        }
      }

      if (div.moveOrder === 'CHARGE') return; // çapa sabit, aktörler serbest

      let desiredX = div.x;
      let desiredZ = div.z;
      if (div.moveOrder === 'FOLLOW' && div.team === 'ally' && player.hp > 0) {
        desiredX = player.x - Math.sin(player.facing) * 9;
        desiredZ = player.z - Math.cos(player.facing) * 9;
      } else if (div.moveOrder === 'ADVANCE') {
        const near = nearestEnemyTo(div.team, div.x, div.z);
        if (near) {
          const standOff = stats.range > 6 ? stats.range * 0.8 : 3;
          if (near.dist > standOff) {
            const d = Math.max(0.01, near.dist);
            desiredX = near.x - ((near.x - div.x) / d) * standOff;
            desiredZ = near.z - ((near.z - div.z) / d) * standOff;
          }
        }
      } else if (div.moveOrder === 'RETREAT') {
        desiredX = div.team === 'ally' ? profile.allySpawn.x : profile.enemySpawn.x;
        desiredZ =
          div.team === 'ally' ? profile.allySpawn.z + 60 : profile.enemySpawn.z - 60;
      } else {
        desiredX = div.targetX;
        desiredZ = div.targetZ;
      }

      const clamped = clampToBattlefield(profile, desiredX, desiredZ);
      const dx = clamped.x - div.x;
      const dz = clamped.z - div.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6) {
        const stepLen = Math.min(dist, stats.speed * 0.95 * dt);
        div.moveDirX = dx / dist;
        div.moveDirZ = dz / dist;
        div.x += div.moveDirX * stepLen;
        div.z += div.moveDirZ * stepLen;
        div.moving = true;
      }

      if (div.moving) div.facing = Math.atan2(div.moveDirX, div.moveDirZ);
      else if (div.facingMode === 'ENEMY') {
        const near = nearestEnemyTo(div.team, div.x, div.z);
        if (near) div.facing = Math.atan2(near.x - div.x, near.z - div.z);
      }

      const slots = computeDivisionSlots(
        div.cls,
        div.members.length,
        div,
        div.formation,
        div.perRow,
      );
      div.members.forEach((m, i) => {
        const s = slots[i];
        if (!s) return;
        const cs = clampToBattlefield(profile, s.x, s.z);
        m.slotX = cs.x;
        m.slotZ = cs.z;
        m.slotFacing = s.facing;
        m.hasSlot = true;
        m.homeX = cs.x;
        m.homeZ = cs.z;
      });
    };

    /* ── 3B Balistik Ok Havuzu (uçan ve saplanan gerçek 3B oklar) ── */
    const MAX_ARROWS = 96;
    const arrowPoolMeshes: THREE.Group[] = [];
    const activeArrows: BallisticArrow[] = [];
    const arrowShaftGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.92, 5);
    arrowShaftGeo.rotateX(Math.PI / 2);
    const arrowTipGeo = new THREE.ConeGeometry(0.032, 0.14, 5);
    arrowTipGeo.rotateX(Math.PI / 2);
    const arrowShaftMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 });
    const arrowTipMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.5, roughness: 0.3 });
    for (let i = 0; i < MAX_ARROWS; i++) {
      const grp = new THREE.Group();
      const shaft = new THREE.Mesh(arrowShaftGeo, arrowShaftMat);
      const tip = new THREE.Mesh(arrowTipGeo, arrowTipMat);
      tip.position.z = 0.5;
      grp.add(shaft);
      grp.add(tip);
      grp.visible = false;
      scene.add(grp);
      arrowPoolMeshes.push(grp);
      activeArrows.push({
        id: i,
        shooterId: 0,
        team: 'ally',
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        baseDamage: 18,
        age: 0,
        stuck: false,
        stuckTimer: 0,
        active: false,
      });
    }
    let arrowCursor = 0;
    const spawnBallisticArrowMesh = (
      shooter: MissionActor,
      vx: number,
      vy: number,
      vz: number,
      baseDamage: number,
    ) => {
      const idx = arrowCursor;
      arrowCursor = (arrowCursor + 1) % MAX_ARROWS;
      const arr = activeArrows[idx];
      const launchY = groundY(shooter.x, shooter.z) + (shooter.isMounted ? 2.15 : 1.48);
      arr.shooterId = shooter.numericId;
      arr.team = shooter.team;
      arr.x = shooter.x + Math.sin(shooter.facing) * 0.65;
      arr.y = launchY;
      arr.z = shooter.z + Math.cos(shooter.facing) * 0.65;
      arr.vx = vx;
      arr.vy = vy;
      arr.vz = vz;
      arr.baseDamage = baseDamage;
      arr.age = 0;
      arr.stuck = false;
      arr.stuckTimer = 0;
      arr.active = true;
      const mesh = arrowPoolMeshes[idx];
      mesh.visible = true;
      mesh.position.set(arr.x, arr.y, arr.z);
      mesh.lookAt(arr.x + vx, arr.y + vy, arr.z + vz);
    };

    /* ── Basit parçacık havuzu (vuruş geri bildirimi) ── */
    const P_COUNT = 360;
    const pPos = new Float32Array(P_COUNT * 3);
    const pVel = new Float32Array(P_COUNT * 3);
    const pLife = new Float32Array(P_COUNT);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xef4444,
      size: 0.55,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    scene.add(points);
    let pCursor = 0;
    const spawnParticles = (x: number, y: number, z: number, count: number, blocked: boolean) => {
      pMat.color.setHex(blocked ? 0xfbbf24 : 0xef4444);
      for (let i = 0; i < count; i++) {
        const idx = pCursor;
        pCursor = (pCursor + 1) % P_COUNT;
        pPos[idx * 3] = x;
        pPos[idx * 3 + 1] = y;
        pPos[idx * 3 + 2] = z;
        pVel[idx * 3] = (Math.random() - 0.5) * 4;
        pVel[idx * 3 + 1] = Math.random() * 3.2;
        pVel[idx * 3 + 2] = (Math.random() - 0.5) * 4;
        pLife[idx] = 0.35 + Math.random() * 0.3;
      }
    };

    /* ── Girdi ── */
    const keys = new Set<string>();
    let mouseLeftHeld = false;
    let mouseLeftJustPressed = false;
    let mouseRightHeld = false;
    let lastMouseX: number | null = null;
    let lastMouseY: number | null = null;
    let camYaw = Math.PI; // oyuncu -Z'ye (düşmana) bakar
    let camPitch = 0.24;
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    const onMouseDown = (e: MouseEvent) => {
      if (e.target !== renderer.domElement) return;
      sound.unlock();
      if (phase === 'deploy') {
        if (propsRef.current.paused) return;
        const div = selectedDivision();
        if (!div) return;
        if (e.button === 0) {
          const p = groundPointFromEvent(e);
          if (p) {
            const clamped = clampToDeployZone(p.x, p.z);
            div.x = clamped.x;
            div.z = clamped.z;
            applyDivision(div);
          }
        } else if (e.button === 2) {
          facingDrag = true;
        }
        return;
      }
      if (document.pointerLockElement !== renderer.domElement) {
        try {
          renderer.domElement.requestPointerLock();
        } catch {
          // Tarayıcı/headless ortamda pointerLock reddedilirse dövüş girdisi yine de çalışır
        }
      }
      if (e.button === 0) {
        mouseLeftHeld = true;
        mouseLeftJustPressed = true;
        if (!mouseRightHeld && player.attackPhase === 'IDLE' && player.cooldownTimer <= 0) {
          if (player.isRanged && player.ammo <= 0) player.isRanged = false;
          player.attackPhase = 'WINDUP';
          player.attackTimer = player.isRanged ? 0.26 : 0.15;
          mouseLeftJustPressed = false;
        }
        refreshCmdUi();
      }
      if (e.button === 2) {
        mouseRightHeld = true;
        if (!player.isRanged && player.attackPhase !== 'ACTIVE') {
          player.attackPhase = 'IDLE';
          player.attackTimer = 0;
          player.isBlocking = true;
          player.isCouchedLance = false;
        }
        refreshCmdUi();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseLeftHeld = false;
        if (
          phase === 'battle' &&
          !propsRef.current.paused &&
          player.hp > 0 &&
          player.attackPhase === 'READY'
        ) {
          player.attackPhase = 'ACTIVE';
          player.attackTimer = 0.14;
          if (!player.isRanged) sound.playSwordSwing();
          executeActorAttackRelease(player);
          refreshCmdUi();
        }
      }
      if (e.button === 2) {
        mouseRightHeld = false;
        facingDrag = false;
        if (phase === 'battle') {
          player.isBlocking = false;
          refreshCmdUi();
        }
      }
    };
    const onWindowBlur = () => {
      mouseLeftHeld = false;
      mouseLeftJustPressed = false;
      mouseRightHeld = false;
      facingDrag = false;
      keys.clear();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (phase === 'deploy' && facingDrag) {
        const div = selectedDivision();
        const p = div ? groundPointFromEvent(e) : null;
        if (div && p) {
          const dx = p.x - div.x;
          const dz = p.z - div.z;
          if (Math.hypot(dx, dz) > 1.5) {
            div.facing = Math.atan2(dx, dz);
            applyDivision(div);
          }
        }
        return;
      }
      const locked = document.pointerLockElement === renderer.domElement;
      const mx =
        locked || e.movementX !== 0
          ? e.movementX
          : lastMouseX !== null
            ? e.clientX - lastMouseX
            : 0;
      const my =
        locked || e.movementY !== 0
          ? e.movementY
          : lastMouseY !== null
            ? e.clientY - lastMouseY
            : 0;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      if (locked) {
        camYaw -= mx * 0.0021;
        camPitch = THREE.MathUtils.clamp(camPitch + my * 0.0021, -0.22, 0.92);
      }

      // Bannerlord 4 yönlü saldırı/blok: fare hareket vektöründen yön seçimi.
      // Saldırı henüz başlamamışken (IDLE) veya blok tutarken yön değiştirilebilir.
      if (phase === 'battle' && Math.hypot(mx, my) >= 3.2 && player.attackPhase === 'IDLE') {
        let nextDir: AttackDirection;
        if (Math.abs(mx) > Math.abs(my) * 1.15) {
          nextDir = mx < 0 ? 'LEFT' : 'RIGHT';
        } else {
          nextDir = my < 0 ? 'UP' : 'DOWN';
        }
        const changed = player.attackDir !== nextDir || player.blockDir !== nextDir;
        player.attackDir = nextDir;
        player.blockDir = nextDir;
        dirCueTimer = 1.25;
        if (changed) refreshCmdUi();
      }
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onDeployKeyDown = (e: KeyboardEvent) => {
      /* B4: savaş fazı bölük emirleri ve B6 oyuncu savaş kısayolları */
      if (phase === 'battle') {
        if (propsRef.current.paused) return;
        const code = e.code;
        let handled = true;
        const targetLabel = () => {
          if (cmdSelection === 'ALL') return 'Tüm Birlikler';
          return `${DIVISION_LABEL[cmdSelection]}`;
        };
        const issue = (fn: (d: DivisionState) => void, shoutText?: string) => {
          for (const d of selectedDivisions()) fn(d);
          if (shoutText) pushOrderShout(`${targetLabel()}: ${shoutText}`);
          sound.playWarhorn();
        };
        if (code === 'Tab') {
          scoreboardOpen = !scoreboardOpen;
          e.preventDefault();
          e.stopPropagation();
          refreshCmdUi();
          return;
        }
        if (code === 'KeyV') {
          firstPersonCam = !firstPersonCam;
          e.preventDefault();
          refreshCmdUi();
          return;
        }
        if (code === 'KeyG') {
          if (player.isRanged) {
            player.isRanged = false;
          } else if (player.ammo > 0) {
            player.isRanged = true;
            player.isCouchedLance = false;
          }
          e.preventDefault();
          refreshCmdUi();
          return;
        }
        if (code === 'KeyX') {
          if (player.isMounted && !player.isRanged) {
            player.isCouchedLance = !player.isCouchedLance;
          }
          e.preventDefault();
          refreshCmdUi();
          return;
        }
        if ((code === 'KeyF' || code === 'KeyZ') && player.hp > 0) {
          if (player.isMounted) {
            if (Math.hypot(player.vx, player.vz) < 4.5) {
              dismountedHorse.active = true;
              dismountedHorse.x = player.x;
              dismountedHorse.z = player.z;
              dismountedHorse.facing = player.facing;
              dismountedHorse.handles.root.position.set(
                dismountedHorse.x,
                groundY(dismountedHorse.x, dismountedHorse.z),
                dismountedHorse.z,
              );
              dismountedHorse.handles.root.rotation.y = dismountedHorse.facing;
              dismountedHorse.handles.root.visible = true;

              player.isMounted = false;
              player.isCouchedLance = false;
              player.speed = playerLoadout.footSpeed;
              player.vx = 0;
              player.vz = 0;
              if (player.handles.horseGroup) player.handles.horseGroup.visible = false;

              const dismountStep = clampToBattlefield(
                profile,
                player.x - Math.cos(player.facing) * 0.95,
                player.z + Math.sin(player.facing) * 0.95,
              );
              player.x = dismountStep.x;
              player.z = dismountStep.z;
              player.handles.root.position.set(player.x, groundY(player.x, player.z), player.z);
              pushOrderShout('Attan inildi — [F] ile tekrar binebilirsiniz.');
            } else {
              pushOrderShout('Attan inmek için yavaşlayın!');
            }
          } else if (player.horseHp > 0) {
            const distToHorse = dismountedHorse.active
              ? Math.hypot(player.x - dismountedHorse.x, player.z - dismountedHorse.z)
              : 0;
            if (distToHorse <= 3.8) {
              if (dismountedHorse.active) {
                player.x = dismountedHorse.x;
                player.z = dismountedHorse.z;
                player.facing = dismountedHorse.facing;
                camYaw = dismountedHorse.facing;
                dismountedHorse.active = false;
                dismountedHorse.handles.root.visible = false;
              }
              player.isMounted = true;
              player.speed = playerLoadout.horseSpeed;
              if (player.handles.horseGroup) player.handles.horseGroup.visible = true;
              player.handles.root.position.set(player.x, groundY(player.x, player.z), player.z);
              pushOrderShout('Ata binildi!');
            } else {
              pushOrderShout('Ata binmek için atınıza yaklaşın!');
            }
          }
          e.preventDefault();
          refreshCmdUi();
          return;
        }
        if (cmdMenu) {
          if (code === 'F9') {
            cmdMenu = null;
          } else if (cmdMenu === 'MOVE') {
            if (code === 'F1') {
              const p = lookGroundPoint();
              if (p) {
                const cl = clampToBattlefield(profile, p.x, p.z);
                issue((d) => {
                  d.delegated = false;
                  d.moveOrder = 'HOLD';
                  d.targetX = cl.x;
                  d.targetZ = cl.z;
                }, 'Bu konumu tutun!');
              }
            } else if (code === 'F2') {
              issue((d) => { d.delegated = false; d.moveOrder = 'FOLLOW'; }, 'Beni takip edin!');
            } else if (code === 'F3') {
              issue((d) => {
                d.delegated = false;
                if (d.moveOrder !== 'CHARGE') resetChargeCycle(d);
                d.moveOrder = 'CHARGE';
              }, 'Hücum!');
            } else if (code === 'F4') {
              issue((d) => { d.delegated = false; d.moveOrder = 'ADVANCE'; }, 'Düzeni bozmadan ilerleyin!');
            } else if (code === 'F5') {
              issue((d) => {
                d.delegated = false;
                const near = nearestEnemyTo('ally', d.x, d.z);
                let tx = d.x;
                let tz = d.z + 12;
                if (near && near.dist > 0.5) {
                  tx = d.x - ((near.x - d.x) / near.dist) * 12;
                  tz = d.z - ((near.z - d.z) / near.dist) * 12;
                }
                const cl = clampToBattlefield(profile, tx, tz);
                d.moveOrder = 'HOLD';
                d.targetX = cl.x;
                d.targetZ = cl.z;
              }, 'Geri çekilin!');
            } else if (code === 'F6') {
              issue((d) => {
                d.delegated = false;
                d.moveOrder = 'HOLD';
                d.targetX = d.x;
                d.targetZ = d.z;
              }, 'Olduğunuz yerde durun!');
            } else if (code === 'F7') {
              issue((d) => { d.delegated = false; d.moveOrder = 'RETREAT'; }, 'Meydandan çekilin!');
            } else handled = false;
            if (handled) cmdMenu = null;
          } else if (cmdMenu === 'FACE') {
            if (code === 'F1') {
              const p = lookGroundPoint();
              issue((d) => {
                d.delegated = false;
                d.facingMode = 'DIRECTION';
                if (p) d.facing = Math.atan2(p.x - d.x, p.z - d.z);
              }, 'Bu yöne dönün!');
            } else if (code === 'F2') {
              issue((d) => { d.delegated = false; d.facingMode = 'ENEMY'; }, 'Düşmana dönün!');
            } else handled = false;
            if (handled) cmdMenu = null;
          } else {
            const byKey: Record<string, DeployFormation> = {
              F1: 'LINE', F2: 'SHIELD_WALL', F3: 'LOOSE', F4: 'CIRCLE',
              F5: 'SQUARE', F6: 'WEDGE', F7: 'COLUMN',
            };
            const f = byKey[code];
            if (f) {
              issue((d) => {
                d.delegated = false;
                if (formationCycleFor(d.cls).includes(f)) d.formation = f;
              }, `${DEPLOY_FORMATION_LABEL[f]} düzenine geçin!`);
            } else handled = false;
            if (handled) cmdMenu = null;
          }
        } else if (code === 'Digit0') {
          cmdSelection = 'ALL';
        } else if (
          code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4'
        ) {
          const num = Number(code.slice(-1));
          const div = divisions.find((d) => DIVISION_NUMBER[d.cls] === num);
          if (div) cmdSelection = div.cls;
          else handled = false;
        } else if (code === 'F1') {
          cmdMenu = 'MOVE';
        } else if (code === 'F2') {
          cmdMenu = 'FACE';
        } else if (code === 'F3') {
          cmdMenu = 'FORM';
        } else if (code === 'F4') {
          const next = !(selectedDivisions()[0]?.holdFire ?? false);
          issue((d) => { d.holdFire = next; }, next ? 'Ateş kes!' : 'Ateş serbest!');
        } else if (code === 'F6') {
          const next = !(selectedDivisions()[0]?.delegated ?? false);
          issue((d) => {
            d.delegated = next;
            d.aiTimer = Math.min(d.aiTimer, 0.15);
          }, next ? 'Komutayı çavuşlara devrediyorum!' : 'Komuta yeniden bende!');
        } else if (code === 'BracketLeft' || code === 'BracketRight') {
          const delta = code === 'BracketLeft' ? -1 : 1;
          for (const d of selectedDivisions()) {
            d.perRow = THREE.MathUtils.clamp(d.perRow + delta, MIN_PER_ROW, MAX_PER_ROW);
          }
        } else if (code === 'KeyQ' || code === 'KeyE') {
          const dir = code === 'KeyQ' ? 1 : -1;
          for (const d of selectedDivisions()) {
            d.facingMode = 'DIRECTION';
            d.facing += dir * (Math.PI / 12);
          }
        } else handled = false;
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          refreshCmdUi();
        }
        return;
      }
      if (phase !== 'deploy' || propsRef.current.paused) return;
      const api = deployApiRef.current;
      if (!api) return;
      let handled = true;
      switch (e.code) {
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4': {
          const num = Number(e.code.slice(-1));
          const div = divisions.find((d) => DIVISION_NUMBER[d.cls] === num);
          if (div) api.select(div.cls);
          break;
        }
        case 'KeyF':
          api.cycleFormation(selectedCls);
          break;
        case 'KeyQ':
          api.rotate(selectedCls, 1);
          break;
        case 'KeyE':
          api.rotate(selectedCls, -1);
          break;
        case 'BracketLeft':
          api.adjustWidth(selectedCls, -1);
          break;
        case 'BracketRight':
          api.adjustWidth(selectedCls, 1);
          break;
        case 'Enter':
          api.start();
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onDeployWheel = (e: WheelEvent) => {
      if (e.target !== renderer.domElement) return;
      if (phase === 'deploy') {
        deployCamDist = THREE.MathUtils.clamp(
          deployCamDist + Math.sign(e.deltaY) * 9,
          42,
          165,
        );
        return;
      }
      if (phase === 'battle' && !propsRef.current.paused && player.hp > 0) {
        if (player.isRanged) {
          player.isRanged = false;
        } else if (player.ammo > 0) {
          player.isRanged = true;
          player.isCouchedLance = false;
        }
        refreshCmdUi();
      }
    };
    const onResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onDeployKeyDown, true);
    window.addEventListener('wheel', onDeployWheel, { passive: true });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', onWindowBlur);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);

    /* ── Döngü ── */
    let rafId = 0;
    let lastNow = performance.now();
    let elapsed = 0;
    let hudTimer = 0;
    let waveTimer = REINFORCEMENT_CHECK_INTERVAL;
    let battleEnded = false;
    let forcedRetreat = false;
    let endTimer = 0;
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      const enemiesAlive =
        actors.filter((a) => a.team === 'enemy' && a.hp > 0 && !a.gone).length +
        getTotalTroops(reserves.enemy);
      const victory = !forcedRetreat && enemiesAlive === 0;

      // B7: Savaşta düşen dost askerler Cerrah Hekimlik (Medicine) yeteneğine
      // göre Yaralı ve Ölü olarak ayrılır; yalnız Ölü olanlar kadrodan silinir!
      const fallenByClass: Partial<TroopRoster> = {};
      for (const cls of CLASS_ORDER) {
        fallenByClass[cls] = actors.filter(
          (a) => a.team === 'ally' && a.unitType === cls && a.hp <= 0,
        ).length;
      }
      const split = splitBattleCasualties(
        fallenByClass,
        playerLoadout.surgeonMedicineSkill,
      );
      const enemiesDefeated = actors.filter(
        (a) => a.team === 'enemy' && a.hp <= 0 && a.id !== 'enemy-commander',
      ).length;
      if (document.pointerLockElement) document.exitPointerLock();
      propsRef.current.onBattleComplete(victory, split.killed, enemiesDefeated);
    };
    retreatApiRef.current = () => {
      forcedRetreat = true;
      finish();
    };

    const nearestOpponent = (actor: MissionActor): { opp: MissionActor; dist: number } | null => {
      let best: MissionActor | null = null;
      let bestD = Infinity;
      for (const other of actors) {
        if (other.team === actor.team || other.hp <= 0 || other.gone) continue;
        const d = Math.hypot(other.x - actor.x, other.z - actor.z);
        if (d < bestD) {
          bestD = d;
          best = other;
        }
      }
      return best ? { opp: best, dist: bestD } : null;
    };

    const recordActorFall = (killer: MissionActor, victim: MissionActor, weaponLabel: string, isHeadshot: boolean) => {
      pushKillFeed(killer, victim, weaponLabel, isHeadshot);
      const victimDiv = actorDivision.get(victim.id);
      if (victimDiv) {
        applyDivisionCasualtyShock(victimDiv.morale, 1, killer.isMounted);
      }
    };

    const STEP_DT = 1 / 60;
    let accumulator = 0;
    let shadowTimer = 0;

    const executeActorAttackRelease = (actor: MissionActor) => {
      if (actor.isRanged && actor.ammo > 0) {
        actor.ammo = Math.max(0, actor.ammo - 1);
        sound.playBowShot();
        if (actor.id === 'player-commander') {
          const spd = playerLoadout.projectileSpeed;
          const vx = Math.sin(camYaw) * Math.cos(camPitch) * spd;
          const vy = -Math.sin(camPitch) * spd + 2.4;
          const vz = Math.cos(camYaw) * Math.cos(camPitch) * spd;
          spawnBallisticArrowMesh(actor, vx, vy, vz, playerLoadout.rangedDamage);
        } else {
          const near = nearestOpponent(actor);
          if (near && near.dist <= actor.range * 1.2) {
            const target = near.opp;
            const aim = computeArcherAimVelocity(
              {
                x: actor.x,
                y: groundY(actor.x, actor.z) + (actor.isMounted ? 2.1 : 1.45),
                z: actor.z,
              },
              {
                x: target.x,
                y: groundY(target.x, target.z) + (target.isMounted ? 1.5 : 1.1),
                z: target.z,
                vx: target.vx,
                vz: target.vz,
              },
              48,
              0.035,
            );
            spawnBallisticArrowMesh(actor, aim.vx, aim.vy, aim.vz, actor.attack);
          }
        }
        return;
      }

      const reach =
        actor.range +
        (actor.attackDir === 'DOWN' ? 0.95 : 0.65) +
        (actor.isCouchedLance ? 0.55 : 0);
      const fx = Math.sin(actor.facing);
      const fz = Math.cos(actor.facing);
      for (const o of actors) {
        if (o.team === actor.team || o.hp <= 0 || o.gone) continue;
        const dx = o.x - actor.x;
        const dz = o.z - actor.z;
        const d = Math.hypot(dx, dz);
        if (d > reach) continue;
        const nx = dx / Math.max(0.01, d);
        const nz = dz / Math.max(0.01, d);
        if (nx * fx + nz * fz < 0.25) continue;

        // Bağıl yaklaşma hızı (Bannerlord hız bonusu)
        const relClosingSpeed = (actor.vx - o.vx) * nx + (actor.vz - o.vz) * nz;
        const hitRes = resolveDirectionalMeleeHit({
          baseAttack: actor.attack,
          targetDefense: o.defense,
          attackDirection: actor.attackDir,
          isTargetBlocking: o.isBlocking,
          targetBlockDirection: o.blockDir,
          targetShieldHp: o.shieldHp,
          relativeClosingSpeed: relClosingSpeed,
          isCouchedLance: actor.isCouchedLance,
          isHeavyStrike: actor.archetype === 'CHARGER',
        });

        o.shieldHp = hitRes.nextShieldHp;
        const prevHp = o.hp;
        o.hp = Math.max(0, o.hp - hitRes.hpDamage);
        o.hitFlashTimer = 0.08;
        const blockedAny = hitRes.shieldBlocked || hitRes.weaponParried;
        const knock = actor.isCouchedLance ? 9.5 : actor.isMounted ? 5.2 : 2.8;
        o.vx += nx * knock * (blockedAny ? 0.45 : 1);
        o.vz += nz * knock * (blockedAny ? 0.45 : 1);
        spawnParticles(
          o.x,
          groundY(o.x, o.z) + 1.3,
          o.z,
          blockedAny ? 7 : 12,
          blockedAny,
        );
        if (o.id === 'player-commander' || actor.id === 'player-commander') {
          sound.playHeavyHit(blockedAny);
        }
        if (actor.isCouchedLance) {
          actor.isCouchedLance = false;
          actor.couchCooldown = 3.2;
        }
        if (prevHp > 0 && o.hp <= 0) {
          const wLabel = actor.isCouchedLance
            ? 'Koltuklanmış Kargı'
            : actor.id === 'player-commander'
              ? playerLoadout.meleeWeaponName
              : actor.isMounted
                ? 'Süvari Kargısı'
                : 'Kılıç';
          recordActorFall(actor, o, wLabel, hitRes.isHeadshot);
        }
      }
    };

    const step = (dt: number) => {
      elapsed += dt;
      dirCueTimer = Math.max(0, dirCueTimer - dt);

      if (battleEnded) {
        endTimer -= dt;
        if (endTimer <= 0) finish();
      } else {
        /* Oyuncu */
        if (player.hp > 0) {
          player.couchCooldown = Math.max(0, player.couchCooldown - dt);
          const fwdX = Math.sin(camYaw);
          const fwdZ = Math.cos(camYaw);
          const rightXv = Math.sin(camYaw - Math.PI / 2);
          const rightZv = Math.cos(camYaw - Math.PI / 2);
          let mx = 0;
          let mz = 0;
          if (keys.has('KeyW')) { mx += fwdX; mz += fwdZ; }
          if (keys.has('KeyS')) { mx -= fwdX; mz -= fwdZ; }
          if (keys.has('KeyD')) { mx += rightXv; mz += rightZv; }
          if (keys.has('KeyA')) { mx -= rightXv; mz -= rightZv; }

          if (mouseLeftJustPressed && player.isRanged && player.ammo <= 0) {
            player.isRanged = false;
          }

          const prevPhase = player.attackPhase;
          const prevBlocking = player.isBlocking;
          const playerAtkOut = stepPlayerAttackState({
            phase: player.attackPhase,
            attackTimer: player.attackTimer,
            cooldownTimer: player.cooldownTimer,
            windupDuration: player.isRanged ? 0.26 : 0.15,
            activeDuration: 0.14,
            recoveryDuration: 0.22,
            meleeCooldown: playerLoadout.meleeCooldown,
            rangedCooldown: playerLoadout.rangedCooldown,
            isRanged: player.isRanged,
            ammo: player.ammo,
            mouseLeftHeld,
            mouseLeftJustPressed,
            mouseRightHeld,
            dt,
          });
          player.attackPhase = playerAtkOut.phase;
          player.attackTimer = playerAtkOut.attackTimer;
          player.cooldownTimer = playerAtkOut.cooldownTimer;
          player.isRanged = playerAtkOut.isRanged;
          player.isBlocking = mouseRightHeld && !player.isRanged && player.attackPhase === 'IDLE';
          if (player.isBlocking) player.isCouchedLance = false;
          player.facing = camYaw;

          const mLen = Math.hypot(mx, mz);
          if (mLen > 0.01) {
            const chamberSlow =
              player.attackPhase === 'READY' && player.isRanged ? 0.68 : 1;
            const spd = player.speed * (player.isBlocking ? 0.52 : chamberSlow);
            player.vx = THREE.MathUtils.lerp(player.vx, (mx / mLen) * spd, 8 * dt);
            player.vz = THREE.MathUtils.lerp(player.vz, (mz / mLen) * spd, 8 * dt);
          } else {
            player.vx *= Math.exp(-6 * dt);
            player.vz *= Math.exp(-6 * dt);
          }

          const playerSpeed = Math.hypot(player.vx, player.vz);
          if (
            player.isCouchedLance &&
            !canMaintainCouchLance(player.isMounted, playerSpeed, player.couchCooldown)
          ) {
            player.isCouchedLance = false;
          }

          // Koltuklanmış kargı (Couch Lance) otomatik çarpışma vuruşu
          if (player.isCouchedLance && player.attackPhase === 'IDLE') {
            const near = nearestOpponent(player);
            if (near && near.dist <= 2.9) {
              player.attackPhase = 'ACTIVE';
              player.attackTimer = 0.14;
              sound.playSwordSwing();
              executeActorAttackRelease(player);
            }
          }

          // Sol tık bırakıldığında (triggeredRelease) savurma/atış gerçekleşir
          if (playerAtkOut.triggeredRelease) {
            if (!player.isRanged) sound.playSwordSwing();
            executeActorAttackRelease(player);
          }

          if (
            prevPhase !== player.attackPhase ||
            prevBlocking !== player.isBlocking ||
            playerAtkOut.feinted
          ) {
            refreshCmdUi();
          }
        }
        mouseLeftJustPressed = false;

        /* B4 & B7: bölük çapaları + formasyon slotları + bölük morali */
        for (const d of divisions) updateDivision(d, dt, elapsed);
        for (const d of enemyDivisions) updateDivision(d, dt, elapsed);

        /* B5: takviye dalgası kontrolü */
        waveTimer -= dt;
        if (waveTimer <= 0) {
          waveTimer = REINFORCEMENT_CHECK_INTERVAL;
          processReinforcements('ally');
          processReinforcements('enemy');
        }

        /* 3B Balistik okların uçuş ve çarpışma güncellemesi */
        const arrowTargets = actors
          .filter((a) => a.hp > 0 && !a.gone)
          .map((a) => ({
            id: a.numericId,
            team: a.team,
            x: a.x,
            y: groundY(a.x, a.z),
            z: a.z,
            isMounted: a.isMounted,
            isBlocking: a.isBlocking,
            shieldHp: a.shieldHp,
            defense: a.defense,
            hp: a.hp,
          }));

        for (let ai = 0; ai < MAX_ARROWS; ai++) {
          const arr = activeArrows[ai];
          if (!arr.active) continue;
          const hit = stepBallisticArrow(arr, dt, groundY, arrowTargets);
          const mesh = arrowPoolMeshes[ai];
          if (!arr.active) {
            mesh.visible = false;
          } else {
            mesh.position.set(arr.x, arr.y, arr.z);
            if (!arr.stuck) {
              mesh.lookAt(arr.x + arr.vx, arr.y + arr.vy, arr.z + arr.vz);
            }
          }
          if (hit) {
            const victim = actors.find((a) => a.numericId === hit.hitActorId);
            const shooter = actors.find((a) => a.numericId === arr.shooterId);
            if (victim && victim.hp > 0) {
              victim.shieldHp = Math.max(0, victim.shieldHp - hit.shieldDamage);
              const prevHp = victim.hp;
              victim.hp = Math.max(0, victim.hp - hit.hpDamage);
              victim.hitFlashTimer = 0.08;
              spawnParticles(
                victim.x,
                groundY(victim.x, victim.z) + 1.35,
                victim.z,
                hit.shieldBlocked ? 6 : 10,
                hit.shieldBlocked,
              );
              if (prevHp > 0 && victim.hp <= 0 && shooter) {
                recordActorFall(shooter, victim, 'Ok', hit.isHeadshot);
              }
            }
          }
        }

        const enemyHasActiveArchers = actors.some(
          (a) => a.team === 'enemy' && a.hp > 0 && !a.gone && a.isRanged && a.ammo > 0,
        );
        const allyHasActiveArchers = actors.some(
          (a) => a.team === 'ally' && a.hp > 0 && !a.gone && a.isRanged && a.ammo > 0,
        );

        /* Aktör hareket ve AI karar güncellemesi */
        for (let i = 0; i < actors.length; i++) {
          const actor = actors[i];
          if (actor.gone) continue;

          if (actor.hp <= 0) {
            actor.koTimer += dt;
            actor.handles.root.rotation.x = Math.min(
              Math.PI / 2,
              (actor.koTimer / 0.38) * (Math.PI / 2),
            );
            if (actor.koTimer >= 0.42) {
              // B6/B7: Düşen askerler sahadan silinmez; yerde yatarak savaş meydanında kalır!
              actor.gone = true;
              actor.handles.bodyGroup.position.y = 0;
              if (actor.handles.horseGroup) actor.handles.horseGroup.visible = false;
              actor.handles.root.position.y = groundY(actor.x, actor.z) + 0.14;
              actor.handles.armorMat.emissive.setHex(0x000000);
              actor.handles.armorMat.emissiveIntensity = 0;
            }
            continue;
          }

          if (actor.hitFlashTimer > 0) {
            actor.hitFlashTimer -= dt;
            const on = actor.hitFlashTimer > 0;
            actor.handles.armorMat.emissive.setHex(on ? 0xffffff : 0x000000);
            actor.handles.armorMat.emissiveIntensity = on ? 0.7 : 0;
          }

          if (actor.id !== 'player-commander') {
            actor.cooldownTimer = Math.max(0, actor.cooldownTimer - dt);
            const div = actorDivision.get(actor.id);
            const near = nearestOpponent(actor);
            let moveX = 0;
            let moveZ = 0;
            let speedMul = 1;
            const order: DivisionMoveOrder = actor.routing
              ? 'RETREAT'
              : div
                ? div.moveOrder
                : 'CHARGE';
            const holdFire = div?.holdFire ?? false;

            actor.inShieldWall =
              !!div && div.formation === 'SHIELD_WALL' && !actor.isMounted;

            // B6: Okçunun oku bittiğinde veya düşman dibine girdiğinde otomatik kılıç/kalkan yakın dövüşe geçer
            if (actor.unitType === 'archer' || actor.unitType === 'horseArcher') {
              const useBow = shouldUnitUseRanged(
                actor.unitType,
                actor.ammo,
                holdFire,
                near ? near.dist : 999,
              );
              actor.isRanged = useBow;
              actor.range = useBow ? (actor.unitType === 'archer' ? 55 : 45) : 2.6;
              actor.archetype = useBow ? 'KITER' : actor.isMounted ? 'CHARGER' : 'CHASER';
            }

            const slotSteer = !!div && order !== 'CHARGE' && order !== 'RETREAT' && actor.hasSlot;
            const engageRange = actor.isRanged ? actor.range : 3.4;
            const engaged = !!near && near.dist <= engageRange && order !== 'RETREAT';
            const underRangedThreat =
              actor.team === 'ally' ? enemyHasActiveArchers : allyHasActiveArchers;

            // Kalkan duvarındaki yaya, ok yağmuru altındaki piyade veya yakın dövüşte savunma yapan asker
            actor.isBlocking =
              !actor.isRanged &&
              actor.attackPhase === 'IDLE' &&
              (actor.inShieldWall ||
                (actor.shieldHp > 0 && underRangedThreat && (!near || near.dist > 3.6)) ||
                (!!near &&
                  near.dist < 3.6 &&
                  Math.sin(elapsed * 3.2 + actor.numericId * 1.7) > (actor.shieldHp > 0 ? 0.05 : 0.45)));

            if (near && actor.isBlocking) {
              // Karşıdaki düşman savurma hazırlığındaysa AI blok yönünü ona göre ayarlamaya çalışır
              if (
                near.opp.attackPhase === 'WINDUP' ||
                near.opp.attackPhase === 'READY' ||
                near.opp.attackPhase === 'ACTIVE'
              ) {
                const matchRoll = ((actor.numericId * 37 + Math.floor(elapsed * 2)) % 100) / 100;
                if (matchRoll < (actor.shieldHp > 0 ? 0.85 : 0.58)) {
                  actor.blockDir = near.opp.attackDir;
                }
              }
            }

            if (near && order !== 'RETREAT') {
              const { opp, dist } = near;
              const dx = opp.x - actor.x;
              const dz = opp.z - actor.z;
              const d = Math.max(0.01, dist);
              const dirX = dx / d;
              const dirZ = dz / d;

              if (!slotSteer) {
                actor.facing = Math.atan2(dirX, dirZ);
                if (actor.archetype === 'CHARGER') {
                  actor.cycleTimer -= dt;
                  if (actor.cyclePhase === 'ATTACK') {
                    if (actor.cycleTimer <= 0 || dist < 2.5) {
                      actor.cyclePhase = 'REGROUP';
                      actor.cycleTimer = 2.2 + Math.random();
                    } else if (dist > 2.2) {
                      moveX = dirX;
                      moveZ = dirZ;
                      speedMul = dist > 6 ? 1.25 : 1;
                    }
                  } else {
                    const gx = opp.x + dirX * 18 - actor.x;
                    const gz = opp.z + dirZ * 18 - actor.z;
                    const gd = Math.max(0.01, Math.hypot(gx, gz));
                    moveX = gx / gd;
                    moveZ = gz / gd;
                    actor.facing = Math.atan2(moveX, moveZ);
                    if (actor.cycleTimer <= 0) {
                      actor.cyclePhase = 'ATTACK';
                      actor.cycleTimer = 5 + Math.random() * 3;
                    }
                  }
                } else if (actor.archetype === 'KITER') {
                  if (dist < actor.range * 0.45) { moveX = -dirX; moveZ = -dirZ; }
                  else if (dist > actor.range * 0.9) { moveX = dirX; moveZ = dirZ; }
                  else { moveX = -dirZ; moveZ = dirX; speedMul = 0.45; }
                } else if (dist > 1.75) {
                  // Piyadeler silah menzili sınırında (1.75m) durup çarpışır, düşmanın içine yürümez
                  moveX = dirX;
                  moveZ = dirZ;
                  if (actor.inShieldWall) speedMul = 0.68;
                }
              } else if (engaged) {
                actor.facing = Math.atan2(dirX, dirZ);
                if (!actor.isRanged && dist > 1.75) {
                  moveX = dirX;
                  moveZ = dirZ;
                  speedMul = actor.inShieldWall ? 0.62 : 0.8;
                }
              }

              // Süvari dörtnala hücum ederken kargısını koltuk altına indirir
              actor.isCouchedLance =
                actor.isMounted &&
                !actor.isRanged &&
                Math.hypot(actor.vx, actor.vz) >= 7.8 &&
                dist > 2.0 &&
                dist < 14;

              const fireOK = !(actor.isRanged && holdFire);
              if (
                fireOK &&
                dist <= actor.range &&
                actor.attackPhase === 'IDLE' &&
                actor.cooldownTimer <= 0
              ) {
                const dirs: AttackDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
                actor.attackDir = dirs[Math.floor((elapsed * 7 + actor.numericId) % 4)];
                actor.attackPhase = 'WINDUP';
                actor.attackTimer = actor.isRanged ? 0.45 : 0.26;
                actor.isBlocking = false;
              }
            } else if (order === 'RETREAT') {
              const retreatZ =
                actor.team === 'ally' ? profile.allySpawn.z + 28 : profile.enemySpawn.z - 28;
              const rx = (actor.team === 'ally' ? profile.allySpawn.x : profile.enemySpawn.x) - actor.x;
              const rz = retreatZ - actor.z;
              const rd = Math.max(0.01, Math.hypot(rx, rz));
              moveX = rx / rd;
              moveZ = rz / rd;
              speedMul = 1.15;
              actor.facing = Math.atan2(moveX, moveZ);
            }

            if (slotSteer && moveX === 0 && moveZ === 0 && !engaged) {
              const sx = actor.slotX - actor.x;
              const sz = actor.slotZ - actor.z;
              const sd = Math.hypot(sx, sz);
              if (sd > 0.75) {
                moveX = sx / sd;
                moveZ = sz / sd;
                speedMul = sd > 8 ? 1.45 : sd > 3 ? 1.1 : 0.75;
                if (actor.inShieldWall) speedMul = Math.min(speedMul, 0.75);
                actor.facing = Math.atan2(moveX, moveZ);
              } else {
                actor.facing = actor.slotFacing;
              }
            }

            // Ricat / Bozgun: kendi kenarına varan aktör sahneden ayrılır (ölü sayılmaz, kaçan sayılır).
            if (order === 'RETREAT') {
              if (
                (actor.team === 'ally' && actor.z >= profile.allySpawn.z + 22) ||
                (actor.team === 'enemy' && actor.z <= profile.enemySpawn.z - 22)
              ) {
                actor.gone = true;
                actor.handles.root.visible = false;
                if (actor.team === 'ally') allyRoutedCount += 1;
                else enemyRoutedCount += 1;
                continue;
              }
            }

            // Arazi etkisi: suda yavaşla, dik yokuşta yavaşla.
            const yHere = groundY(actor.x, actor.z);
            if (profile.waterY !== null && yHere < profile.waterY + 0.05) {
              speedMul *= actor.isMounted ? 0.7 : 0.55;
            }
            if (moveX !== 0 || moveZ !== 0) {
              const yAhead = groundY(actor.x + moveX * 2.5, actor.z + moveZ * 2.5);
              const climb = (yAhead - yHere) / 2.5;
              if (climb > 0) speedMul *= Math.max(0.45, 1 - climb * 0.9);
              actor.vx = moveX * actor.speed * speedMul;
              actor.vz = moveZ * actor.speed * speedMul;
            } else {
              actor.vx *= 0.4;
              actor.vz *= 0.4;
            }

            /* AI saldırı aşamaları (WINDUP -> ACTIVE -> RECOVERY) */
            if (actor.attackPhase === 'WINDUP') {
              actor.attackTimer -= dt;
              if (actor.attackTimer <= 0) {
                actor.attackPhase = 'ACTIVE';
                actor.attackTimer = 0.14;
                executeActorAttackRelease(actor);
              }
            } else if (actor.attackPhase === 'ACTIVE') {
              actor.attackTimer -= dt;
              if (actor.attackTimer <= 0) {
                actor.attackPhase = 'RECOVERY';
                actor.attackTimer = 0.22;
              }
            } else if (actor.attackPhase === 'RECOVERY') {
              actor.attackTimer -= dt;
              if (actor.attackTimer <= 0) {
                actor.attackPhase = 'IDLE';
                actor.cooldownTimer = actor.isRanged
                  ? 1.35 + Math.random() * 0.55
                  : 0.52 + Math.random() * 0.32;
              }
            }
          }

          /* Ham konum ilerletimi (çarpışma çözücüsü hemen ardından çalışır) */
          const moved = clampToBattlefield(
            profile,
            actor.x + actor.vx * dt,
            actor.z + actor.vz * dt,
          );
          actor.x = moved.x;
          actor.z = moved.z;
        }

        /* Birimlerin iç içe geçmesini önleyen çok-iterasyonlu çarpışma ve kalkan duvarı çözücüsü */
        for (const [pairKey, cd] of trampleCooldownByPair.entries()) {
          if (cd - dt <= 0) trampleCooldownByPair.delete(pairKey);
          else trampleCooldownByPair.set(pairKey, cd - dt);
        }
        const activeTramplePairs = new Set<string>(trampleCooldownByPair.keys());
        const trampleEvents = resolveBattleActorCollisions(actors, {
          iterations: 3,
          clampPosition: (x, z) => clampToBattlefield(profile, x, z),
          trampleCooldownByPair: activeTramplePairs,
        });
        for (const k of activeTramplePairs) {
          if (!trampleCooldownByPair.has(k)) {
            trampleCooldownByPair.set(k, 1.4);
          }
        }
        for (const ev of trampleEvents) {
          const charger = actors.find((a) => a.numericId === ev.chargerId);
          const victim = actors.find((a) => a.numericId === ev.victimId);
          if (charger && victim && victim.hp > 0) {
            const prevHp = victim.hp;
            victim.hp = Math.max(0, victim.hp - ev.damage);
            victim.hitFlashTimer = 0.08;
            spawnParticles(
              victim.x,
              groundY(victim.x, victim.z) + 1.05,
              victim.z,
              8,
              false,
            );
            if (prevHp > 0 && victim.hp <= 0) {
              recordActorFall(charger, victim, 'Süvari Çiğnemesi', false);
            }
          }
        }

        /* Çarpışma sonrası 3B pozisyon ve iskelet animasyonlarının uygulanması */
        for (let i = 0; i < actors.length; i++) {
          const actor = actors[i];
          if (actor.gone || actor.hp <= 0) continue;
          const y = groundY(actor.x, actor.z);
          actor.handles.root.position.set(actor.x, y, actor.z);
          actor.handles.root.rotation.y = actor.facing;
          const moveSpd = Math.hypot(actor.vx, actor.vz);
          const windupDur =
            actor.id === 'player-commander'
              ? actor.isRanged
                ? 0.26
                : 0.15
              : actor.isRanged
                ? 0.45
                : 0.26;

          animateWarriorRigPose(actor.handles, {
            speed: moveSpd,
            time: elapsed,
            phaseOffset: actor.phaseOffset,
            isMounted: actor.isMounted,
            usingRanged: actor.isRanged,
            shieldIntact: actor.shieldHp > 0,
            isBlocking: actor.isBlocking,
            blockDirection: actor.blockDir,
            attackPhase:
              actor.attackPhase === 'ACTIVE'
                ? 'RELEASE'
                : actor.attackPhase,
            attackDirection: actor.attackDir,
            attackProgress:
              actor.attackPhase === 'READY'
                ? 1
                : actor.attackPhase === 'WINDUP'
                  ? Math.max(0, Math.min(1, 1 - actor.attackTimer / windupDur))
                  : actor.attackPhase === 'ACTIVE'
                    ? Math.max(0, Math.min(1, 1 - actor.attackTimer / 0.14))
                    : Math.max(0, Math.min(1, 1 - actor.attackTimer / 0.22)),
            isCouchedLance: actor.isCouchedLance,
          });
        }

        /* Parçacıklar */
        for (let i = 0; i < P_COUNT; i++) {
          if (pLife[i] <= 0) continue;
          pLife[i] -= dt;
          pVel[i * 3 + 1] -= 7.5 * dt;
          pPos[i * 3] += pVel[i * 3] * dt;
          pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
          pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
          if (pLife[i] <= 0) pPos[i * 3 + 1] = -50;
        }
        pGeo.attributes.position.needsUpdate = true;

        /* Telemetri + bitiş */
        const alliesAlive =
          actors.filter((a) => a.team === 'ally' && a.hp > 0 && !a.gone).length +
          getTotalTroops(reserves.ally);
        const enemiesAlive =
          actors.filter((a) => a.team === 'enemy' && a.hp > 0 && !a.gone).length +
          getTotalTroops(reserves.enemy);
        hudTimer += dt;
        if (hudTimer >= 0.12) {
          hudTimer = 0;
          propsRef.current.onBattleTelemetry({
            playerHp: Math.round(player.hp),
            playerMaxHp: player.maxHp,
            alliesAlive,
            alliesTotal,
            enemiesAlive,
            enemiesTotal,
            enemyCommanderName,
            orderSummary: computeOrderSummary(),
          });
          refreshCmdUi();
        }
        if (enemiesAlive === 0 || alliesAlive === 0) {
          battleEnded = true;
          endTimer = 0.8;
          if (enemiesAlive === 0) sound.playVictoryFanfare();
          else sound.playDefeatSting();
        }
      }
    };

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      const frameDt = Math.min(0.25, Math.max(0.001, (now - lastNow) / 1000));
      lastNow = now;

      if (!propsRef.current.paused && phase === 'battle') {
        accumulator = Math.min(accumulator + frameDt, STEP_DT * 6);
        while (accumulator >= STEP_DT) {
          step(STEP_DT);
          accumulator -= STEP_DT;
        }
      }

      if (dismountedHorse.active) {
        animateWarriorRigPose(dismountedHorse.handles, {
          speed: 0,
          time: now * 0.001,
          phaseOffset: 0.7,
          isMounted: true,
          usingRanged: false,
          shieldIntact: false,
          isBlocking: false,
          blockDirection: 'UP',
          attackPhase: 'IDLE',
          attackDirection: 'RIGHT',
          attackProgress: 0,
          isCouchedLance: false,
        });
      }

      shadowTimer += frameDt;
      if (shadowTimer >= 0.5) {
        shadowTimer = 0;
        renderer.shadowMap.needsUpdate = true;
      }

      /* Kamera */
      if (phase === 'deploy') {
        player.handles.root.visible = true;
        const pan = 62 * frameDt;
        if (keys.has('KeyW')) deployCamTz -= pan;
        if (keys.has('KeyS')) deployCamTz += pan;
        if (keys.has('KeyA')) deployCamTx -= pan;
        if (keys.has('KeyD')) deployCamTx += pan;
        deployCamTx = THREE.MathUtils.clamp(deployCamTx, -205, 205);
        deployCamTz = THREE.MathUtils.clamp(deployCamTz, -60, 228);
        const gy = groundY(deployCamTx, deployCamTz);
        camera.position.set(
          deployCamTx,
          gy + deployCamDist * 0.62,
          deployCamTz + deployCamDist * 0.78,
        );
        camera.lookAt(deployCamTx, gy, deployCamTz - deployCamDist * 0.22);
      } else if (player.hp > 0) {
        const px = player.x;
        const pz = player.z;
        const py = groundY(px, pz);
        const mountOffset = player.isMounted ? 0.78 : 0;
        if (firstPersonCam) {
          // 1. Şahıs (V tuşu): miğfer göz hizasından ileri bakış
          player.handles.root.visible = false;
          const eyeY = py + 1.66 + mountOffset;
          camera.position.set(
            px + Math.sin(camYaw) * 0.28,
            eyeY,
            pz + Math.cos(camYaw) * 0.28,
          );
          camera.lookAt(
            px + Math.sin(camYaw) * Math.cos(camPitch) * 18,
            eyeY - Math.sin(camPitch) * 14,
            pz + Math.cos(camYaw) * Math.cos(camPitch) * 18,
          );
        } else {
          // Bannerlord yükseltilmiş omuz üstü 3. Şahıs kamera (oyuncu miğferi nişangâhı kapatmaz)
          player.handles.root.visible = true;
          const dist = player.isMounted ? 5.1 : 4.15;
          const shoulderOffset = player.isMounted ? 0.68 : 0.58;
          const shoulderRightX = Math.sin(camYaw - Math.PI / 2) * shoulderOffset;
          const shoulderRightZ = Math.cos(camYaw - Math.PI / 2) * shoulderOffset;
          const cx = px + shoulderRightX - Math.sin(camYaw) * Math.cos(camPitch) * dist;
          const cz = pz + shoulderRightZ - Math.cos(camYaw) * Math.cos(camPitch) * dist;
          const cy = py + 2.42 + mountOffset + Math.sin(camPitch) * dist;
          camera.position.set(cx, Math.max(cy, groundY(cx, cz) + 0.85), cz);
          camera.lookAt(
            px + shoulderRightX * 0.45 + Math.sin(camYaw) * 14,
            py + 1.92 + mountOffset - Math.sin(camPitch) * 5.2,
            pz + shoulderRightZ * 0.45 + Math.cos(camYaw) * 14,
          );
        }
      } else {
        player.handles.root.visible = true;
        const t = elapsed * 0.05;
        camera.position.set(Math.sin(t) * 150, 85, Math.cos(t) * 150);
        camera.lookAt(0, 0, 0);
      }

      /* B4: seçili bölük işareti + konum sancağı */
      if (phase === 'battle') {
        for (const d of divisions) {
          if (!d.marker) continue;
          const show = cmdSelection !== 'ALL' && d.cls === cmdSelection;
          d.marker.visible = show;
          if (show) {
            d.markerMat?.color.setHex(0xfbbf24);
            d.marker.position.set(d.x, groundY(d.x, d.z) + 0.2, d.z);
            d.marker.rotation.y = d.facing;
          }
        }
        const flagP = cmdMenu === 'MOVE' ? lookGroundPoint() : null;
        positionFlag.visible = flagP !== null;
        if (flagP) {
          positionFlag.position.set(flagP.x, groundY(flagP.x, flagP.z) + 0.1, flagP.z);
        }
      }

      renderer.render(scene, camera);
    };
    propsRef.current.onBattleTelemetry({
      playerHp: Math.round(player.hp),
      playerMaxHp: player.maxHp,
      alliesAlive: alliesTotal,
      alliesTotal,
      enemiesAlive: enemiesTotal,
      enemiesTotal,
      enemyCommanderName,
      orderSummary: computeOrderSummary(),
    });
    if (!deployEnabled) refreshCmdUi();
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onDeployKeyDown, true);
      window.removeEventListener('wheel', onDeployWheel);
      window.removeEventListener('keyup', onKeyUp);
      deployApiRef.current = null;
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      if (document.pointerLockElement) document.exitPointerLock();
      terrain.dispose();
      pGeo.dispose();
      pMat.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // Misyon, bileşen takıldığında bir kez kurulur; savaş girdileri o an sabitlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={mountRef} className="absolute inset-0 h-full w-full">
      {deployUi ? (
        <>
          <div className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded border border-[#8a6d3b]/60 bg-black/60 px-4 py-2 text-center">
            <div className="text-[13px] font-bold tracking-[0.22em] text-[#f3d98b]">
              SAVAŞ DÜZENİ · KONUŞLANMA
            </div>
            <div className="mt-0.5 text-[11px] tracking-wide text-[#e8dcc3]">
              Bölük seç (kart ya da 1-4) · Sol tık: yerleştir · Sağ tık sürükle: yön · F: diziliş · [ ]:
              cephe · Q/E: döndür · WASD + tekerlek: kamera · Enter: başla
            </div>
          </div>
          <div
            data-testid="deployment-panel"
            className="absolute bottom-28 left-1/2 z-10 flex -translate-x-1/2 items-stretch gap-2"
          >
            {deployUi.cards.map((card) => {
              const selected = deployUi.selected === card.cls;
              return (
                <div
                  key={card.cls}
                  data-testid={`deployment-card-${card.cls}`}
                  onClick={() => deployApiRef.current?.select(card.cls)}
                  className={`w-40 cursor-pointer rounded border px-3 py-2 ${
                    selected
                      ? 'border-amber-300 bg-amber-950/70'
                      : 'border-[#8a6d3b]/50 bg-black/55'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#f3d98b]">
                      <span className="rounded bg-[#8a6d3b]/70 px-1 text-[11px] text-black">
                        {card.num}
                      </span>
                      {DIVISION_LABEL[card.cls]}
                    </span>
                    <span className="text-[11px] text-[#e8dcc3]">{card.count} nefer</span>
                  </div>
                  <button
                    type="button"
                    data-testid={`deployment-formation-${card.cls}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      deployApiRef.current?.cycleFormation(card.cls);
                    }}
                    className="mt-1.5 w-full rounded border border-[#8a6d3b]/60 bg-black/40 px-2 py-0.5 text-[11px] text-[#e8dcc3] hover:bg-black/70"
                  >
                    {DEPLOY_FORMATION_LABEL[card.formation]} ▸
                  </button>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#e8dcc3]">
                    <button
                      type="button"
                      aria-label="Cepheyi daralt"
                      onClick={(e) => {
                        e.stopPropagation();
                        deployApiRef.current?.adjustWidth(card.cls, -1);
                      }}
                      className="rounded border border-[#8a6d3b]/60 px-1.5 hover:bg-black/70"
                    >
                      −
                    </button>
                    <span>
                      Cephe: <span className="text-[#f3d98b]">{card.perRow}</span>
                    </span>
                    <button
                      type="button"
                      aria-label="Cepheyi genişlet"
                      onClick={(e) => {
                        e.stopPropagation();
                        deployApiRef.current?.adjustWidth(card.cls, 1);
                      }}
                      className="rounded border border-[#8a6d3b]/60 px-1.5 hover:bg-black/70"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              data-testid="deployment-start"
              onClick={() => deployApiRef.current?.start()}
              className="rounded border border-amber-300/80 bg-amber-700/80 px-5 text-[13px] font-bold tracking-widest text-amber-50 hover:bg-amber-600/90"
            >
              SAVAŞA
              <br />
              BAŞLA
            </button>
          </div>
        </>
      ) : cmdUi ? (
        <>
          {/* 1. ÜST ORTA: BANNERLORD GÜÇ DENGESİ ÇUBUĞU (Balance-of-Power Bar) */}
          {(() => {
            const totalActive = Math.max(1, cmdUi.allyAlive + cmdUi.enemyAlive);
            const allyPct = Math.max(4, Math.min(96, Math.round((cmdUi.allyAlive / totalActive) * 100)));
            return (
              <div
                data-testid="battle-power-bar"
                className="pointer-events-none absolute left-1/2 top-3 z-10 w-[540px] max-w-[92vw] -translate-x-1/2"
              >
                <div className="flex items-center gap-2.5 rounded-lg border border-[#8a6d3b]/75 bg-[#0f0c08]/90 px-3.5 py-2 shadow-2xl">
                  {/* Sol Sancak Arması + Canlı Asker */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-7 items-center justify-center rounded-b-lg border border-[#fbbf24] bg-[#166534] text-xs font-bold text-[#fef08a] shadow">
                      ⚔
                    </div>
                    <div className="text-left">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#86efac]">
                        Sancak Ordusu
                      </div>
                      <div className="font-mono text-base font-bold text-[#f8f0df]">
                        {cmdUi.allyAlive}
                      </div>
                    </div>
                  </div>

                  {/* İki Renkli Sürekli Güç Çubuğu */}
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="relative h-3.5 w-full overflow-hidden rounded-full border border-[#c6a15b]/60 bg-[#3f1111]">
                      <div
                        style={{ width: `${allyPct}%` }}
                        className="h-full bg-gradient-to-r from-[#15803d] via-[#22c55e] to-[#86efac] transition-all duration-300"
                      />
                      <div
                        style={{ left: `${allyPct}%` }}
                        className="absolute inset-y-0 -ml-0.5 w-1 bg-[#fef08a] shadow-[0_0_8px_#fbbf24]"
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#d1c5b0]">
                      <span>
                        Yaralı: <strong className="text-[#fde68a]">{cmdUi.allyWounded}</strong> · Kaçan:{' '}
                        <strong className="text-[#cbd5e1]">{cmdUi.allyRouted}</strong>
                      </span>
                      <span className="font-semibold text-[#fbbf24]">[Tab] Muharebe Çetelesi</span>
                      <span>
                        Kaçan: <strong className="text-[#cbd5e1]">{cmdUi.enemyRouted}</strong> · Yaralı:{' '}
                        <strong className="text-[#fca5a5]">{cmdUi.enemyWounded}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Sağ Düşman Arması + Canlı Asker */}
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#fca5a5]">
                        {cmdUi.enemyCommanderName}
                      </div>
                      <div className="font-mono text-base font-bold text-[#f8f0df]">
                        {cmdUi.enemyAlive}
                      </div>
                    </div>
                    <div
                      style={{ backgroundColor: cmdUi.enemyHexCss }}
                      className="flex h-8 w-7 items-center justify-center rounded-b-lg border border-[#fca5a5]/80 text-xs font-bold text-white shadow"
                    >
                      🛡
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 2. SAĞ ÜST: BANNERLORD CANLI KAYIP AKIŞI (Kill Feed) */}
          {cmdUi.killFeed.length > 0 && (
            <div
              data-testid="battle-kill-feed"
              className="pointer-events-none absolute right-4 top-14 z-10 flex w-80 flex-col gap-1"
            >
              {cmdUi.killFeed.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded border border-[#8a6d3b]/40 bg-black/70 px-2.5 py-1 text-[11px] shadow"
                >
                  <span
                    className={`truncate font-semibold ${
                      entry.killerTeam === 'ally' ? 'text-[#4ade80]' : 'text-[#f87171]'
                    }`}
                  >
                    {entry.killerName}
                  </span>
                  <span className="shrink-0 rounded bg-[#272017] px-1.5 py-0.5 text-[10px] text-[#fbbf24]">
                    {entry.isHeadshot ? '🎯 ' : '⚔ '}
                    {entry.weaponLabel}
                  </span>
                  <span
                    className={`truncate font-semibold ${
                      entry.killerTeam === 'ally' ? 'text-[#fca5a5]' : 'text-[#86efac]'
                    }`}
                  >
                    {entry.victimName}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 3. EKRAN ORTASI: BANNERLORD 4 YÖNLÜ SALDIRI / SAVUNMA OKLARI VE NİŞANGÂH */}
          <div
            data-testid="battle-directional-reticle"
            data-mode={cmdUi.reticle.mode}
            data-direction={cmdUi.reticle.activeDirection}
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative h-28 w-28">
              {(
                [
                  {
                    dir: 'UP' as const,
                    posClass: 'left-1/2 top-0 -translate-x-1/2',
                    rotationDeg: 0,
                  },
                  {
                    dir: 'DOWN' as const,
                    posClass: 'bottom-0 left-1/2 -translate-x-1/2',
                    rotationDeg: 180,
                  },
                  {
                    dir: 'LEFT' as const,
                    posClass: 'left-0 top-1/2 -translate-y-1/2',
                    rotationDeg: -90,
                  },
                  {
                    dir: 'RIGHT' as const,
                    posClass: 'right-0 top-1/2 -translate-y-1/2',
                    rotationDeg: 90,
                  },
                ] as const
              ).map(({ dir, posClass, rotationDeg }) => {
                const arrow = cmdUi.reticle.arrows[dir];
                const isAttack = arrow.variant === 'attack' && arrow.active;
                const isBlock = arrow.variant === 'block' && arrow.active;
                const colorClass = isBlock
                  ? 'text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.95)]'
                  : isAttack
                    ? 'text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.95)]'
                    : arrow.active
                      ? 'text-amber-200/90 drop-shadow-[0_0_4px_rgba(251,191,36,0.55)]'
                      : 'text-stone-200/35';
                return (
                  <div
                    key={dir}
                    data-testid={`reticle-arrow-${dir.toLowerCase()}`}
                    data-active={arrow.active ? 'true' : 'false'}
                    data-variant={arrow.variant}
                    style={{
                      opacity: arrow.opacity,
                      transform: `scale(${arrow.scale})`,
                    }}
                    className={`absolute ${posClass} transition-all duration-75 ${colorClass}`}
                  >
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 28 28"
                      fill="none"
                      style={{ transform: `rotate(${rotationDeg}deg)` }}
                    >
                      {/* Kavisli Bannerlord yön yayı */}
                      <path
                        d="M5 17C8.2 12.2 19.8 12.2 23 17"
                        stroke="currentColor"
                        strokeWidth={arrow.active ? '2.4' : '1.5'}
                        strokeLinecap="round"
                      />
                      {/* Sivri yön oku başı */}
                      <path
                        d="M14 3L20.5 11.5H16.2V16.5H11.8V11.5H7.5L14 3Z"
                        fill="currentColor"
                        fillOpacity={arrow.active ? '0.92' : '0.45'}
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                      {/* Blok modunda koruma çift çizgisi */}
                      {isBlock && (
                        <path
                          d="M7 20.5C10.2 17.8 17.8 17.8 21 20.5"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                        />
                      )}
                    </svg>
                  </div>
                );
              })}

              {/* Merkez Nişangâh / Blok Kalkan Simgesi */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                {cmdUi.isBlocking ? (
                  <svg
                    width="18"
                    height="18"
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
                ) : (
                  <div
                    className={`h-2.5 w-2.5 rounded-full border transition-transform ${
                      cmdUi.attackPhase === 'READY'
                        ? 'scale-125 border-amber-200 bg-amber-400/80 shadow-[0_0_8px_#fbbf24]'
                        : 'border-amber-200/80 bg-amber-300/40'
                    }`}
                  />
                )}
              </div>
            </div>

            {/* Saldırı Hazırlık / Savurma / Blok Durum Etiketi */}
            {cmdUi.reticle.statusLabel && (
              <div
                data-testid="battle-reticle-status"
                className={`mt-1 whitespace-nowrap rounded border px-2 py-0.5 text-center text-[10px] font-semibold tracking-wide shadow ${
                  cmdUi.isBlocking
                    ? 'border-sky-400/50 bg-slate-950/75 text-sky-200'
                    : 'border-amber-400/50 bg-stone-950/75 text-amber-200'
                }`}
              >
                {cmdUi.reticle.statusLabel}
              </div>
            )}
          </div>

          {/* 4. SOL ALT: EMİR SESLENİŞ GÜNLÜĞÜ (Order Shout Log) */}
          {cmdUi.orderLog.length > 0 && (
            <div className="pointer-events-none absolute bottom-44 left-4 z-10 flex flex-col gap-1">
              {cmdUi.orderLog.map((o) => (
                <div
                  key={o.id}
                  className="rounded border border-[#c6a15b]/50 bg-black/70 px-3 py-1 text-[11px] font-medium text-[#fde68a] shadow"
                >
                  📣 {o.text}
                </div>
              ))}
            </div>
          )}

          {/* 5. ALT ORTA: BÖLÜK KOMUTA KARTLARI (0-4) VE F1-F6 EMİR MENÜSÜ */}
          <div
            data-testid="command-panel"
            className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2"
          >
            <div className="flex items-stretch justify-center gap-2">
              <div
                className={`flex w-20 flex-col items-center justify-center rounded border px-2 py-2 text-center ${
                  cmdUi.selection === 'ALL'
                    ? 'border-amber-300 bg-amber-950/70'
                    : 'border-[#8a6d3b]/50 bg-black/65'
                }`}
              >
                <span className="rounded bg-[#8a6d3b]/70 px-1 text-[11px] font-bold text-black">0</span>
                <span className="mt-0.5 text-[11px] font-bold text-[#f3d98b]">Tümü</span>
              </div>
              {cmdUi.cards.map((card) => {
                const selected = cmdUi.selection === 'ALL' || cmdUi.selection === card.cls;
                return (
                  <div
                    key={card.cls}
                    data-testid={`cmd-card-${card.cls}`}
                    data-order={card.order}
                    data-formation={card.formation}
                    className={`w-44 rounded border px-3 py-2 ${
                      selected
                        ? 'border-amber-300/80 bg-amber-950/70'
                        : 'border-[#8a6d3b]/50 bg-black/65 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#f3d98b]">
                        <span className="rounded bg-[#8a6d3b]/70 px-1 text-[11px] text-black">
                          {card.num}
                        </span>
                        {DIVISION_LABEL[card.cls]}
                      </span>
                      <span className="text-[11px] font-semibold text-[#e8dcc3]">
                        {card.alive}/{card.total}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[#e8dcc3]">
                      <span className={card.routing ? 'font-bold text-red-400' : 'text-[#f3d98b]'}>
                        {card.routing ? 'Bozgun!' : MOVE_ORDER_LABEL[card.order]}
                      </span>
                      <span>{DEPLOY_FORMATION_LABEL[card.formation]}</span>
                    </div>
                    {/* Moral & Sadak Çubukları */}
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-[#d1c5b0]">
                        <span className="w-9 shrink-0">Moral</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded bg-black/60">
                          <div
                            style={{ width: `${card.morale}%` }}
                            className={`h-full ${
                              card.morale < 25
                                ? 'bg-red-500'
                                : card.morale < 50
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                            }`}
                          />
                        </div>
                        <span className="w-7 text-right font-mono">%{card.morale}</span>
                      </div>
                      {card.ammoPct !== null && (
                        <div className="flex items-center gap-1.5 text-[10px] text-[#d1c5b0]">
                          <span className="w-9 shrink-0">Sadak</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded bg-black/60">
                            <div
                              style={{ width: `${card.ammoPct}%` }}
                              className="h-full bg-amber-300"
                            />
                          </div>
                          <span className="w-7 text-right font-mono">%{card.ammoPct}</span>
                        </div>
                      )}
                    </div>
                    {(card.delegated || card.holdFire) && (
                      <div className="mt-1 flex gap-1.5 text-[10px] tracking-wide">
                        {card.delegated && <span className="text-sky-300">Kaptan yönetiyor</span>}
                        {card.holdFire && <span className="text-red-300">Ateş Kes</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              data-testid="command-menu"
              className="mx-auto mt-2 w-fit rounded border border-[#8a6d3b]/60 bg-black/75 px-4 py-1.5 text-center text-[12px] tracking-wide text-[#e8dcc3]"
            >
              {cmdUi.menu === 'MOVE' ? (
                <span>
                  <span className="font-bold text-[#f3d98b]">Hareket:</span> F1 Konuma Git · F2 Beni
                  Takip Et · F3 Hücum · F4 İlerle · F5 Geri Çekil · F6 Dur · F7 Ricat · F9 Geri
                </span>
              ) : cmdUi.menu === 'FACE' ? (
                <span>
                  <span className="font-bold text-[#f3d98b]">Yön:</span> F1 Sancak Yönüne Dön · F2
                  Düşmana Dön · F9 Geri
                </span>
              ) : cmdUi.menu === 'FORM' ? (
                <span>
                  <span className="font-bold text-[#f3d98b]">Diziliş:</span> F1{' '}
                  {DEPLOY_FORMATION_LABEL.LINE} · F2 {DEPLOY_FORMATION_LABEL.SHIELD_WALL} · F3{' '}
                  {DEPLOY_FORMATION_LABEL.LOOSE} · F4 {DEPLOY_FORMATION_LABEL.CIRCLE} · F5{' '}
                  {DEPLOY_FORMATION_LABEL.SQUARE} · F6 {DEPLOY_FORMATION_LABEL.WEDGE} · F7{' '}
                  {DEPLOY_FORMATION_LABEL.COLUMN} · F9 Geri
                </span>
              ) : (
                <span>
                  F1 Hareket · F2 Yön · F3 Diziliş · F4 Ateş Serbest/Ateş Kes · F6 Komutayı
                  Devret
                </span>
              )}
            </div>
          </div>

          {/* 6. SAĞ ALT: BANNERLORD OYUNCU SAVAŞ DURUM PANELİ (Can, At, Kalkan, Silah, Sadak, Kargı) */}
          <div
            data-testid="battle-player-hud"
            className="pointer-events-none absolute bottom-10 right-4 z-10 w-64 rounded-lg border border-[#c6a15b]/70 bg-[#0f0c08]/90 p-3 text-xs text-[#f3ead8] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#c6a15b]/25 pb-1.5">
              <span className="font-bold text-[#fde68a]">{cmdUi.weaponName}</span>
              <span className="rounded bg-[#261f16] px-1.5 py-0.5 font-mono text-[10px] text-[#cbd5e1]">
                {cmdUi.speedMps} m/s
              </span>
            </div>

            <div className="mt-2 space-y-1.5">
              {/* Oyuncu Canı */}
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-[#fca5a5]">Sağlık</span>
                  <span className="font-mono font-bold text-[#f8f0df]">
                    {cmdUi.playerHp} / {cmdUi.playerMaxHp}
                  </span>
                </div>
                <div className="mt-0.5 h-2 w-full overflow-hidden rounded bg-black/70">
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, (cmdUi.playerHp / Math.max(1, cmdUi.playerMaxHp)) * 100))}%`,
                    }}
                    className="h-full bg-gradient-to-r from-red-700 to-red-400"
                  />
                </div>
              </div>

              {/* Binek At Canı */}
              {cmdUi.horseMaxHp > 0 && (
                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#fde68a]">Binek At</span>
                    <span className="font-mono text-[#e2d6c1]">
                      {cmdUi.horseHp} / {cmdUi.horseMaxHp}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-black/70">
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, (cmdUi.horseHp / Math.max(1, cmdUi.horseMaxHp)) * 100))}%`,
                      }}
                      className="h-full bg-amber-500"
                    />
                  </div>
                </div>
              )}

              {/* Kalkan Dayanıklılığı */}
              {cmdUi.shieldMaxHp > 0 && (
                <div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-sky-300">Kalkan</span>
                    <span className="font-mono text-[#e2d6c1]">
                      {cmdUi.shieldHp > 0 ? `${cmdUi.shieldHp} / ${cmdUi.shieldMaxHp}` : 'KIRILDI'}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-black/70">
                    <div
                      style={{
                        width: `${Math.max(0, Math.min(100, (cmdUi.shieldHp / Math.max(1, cmdUi.shieldMaxHp)) * 100))}%`,
                      }}
                      className="h-full bg-sky-400"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-1 border-t border-[#c6a15b]/25 pt-1.5 text-[11px]">
              <span>
                Sadak: <strong className="font-mono text-[#fbbf24]">{cmdUi.ammo}</strong>/{cmdUi.maxAmmo}
              </span>
              <span>
                Leş: <strong className="font-mono text-[#4ade80]">{cmdUi.playerKills}</strong>
              </span>
              {cmdUi.canCouch && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    cmdUi.isCouched
                      ? 'bg-amber-500 text-black'
                      : 'bg-[#261f16] text-[#d1c5b0]'
                  }`}
                >
                  {cmdUi.isCouched ? 'KARGI KOLTUKLANDI!' : '[X] Kargı Koltukla'}
                </span>
              )}
              {cmdUi.horseHp > 0 && (
                <span className="rounded bg-[#261f16] px-1.5 py-0.5 text-[10px] font-semibold text-[#fde68a]">
                  {cmdUi.isMounted ? '[F] Attan İn' : cmdUi.canMountNearbyHorse ? '[F] Ata Bin' : 'At Bekliyor'}
                </span>
              )}
            </div>
          </div>

          {cmdUi.canMountNearbyHorse && (
            <div
              data-testid="battle-mount-prompt"
              className="pointer-events-none absolute left-1/2 top-[58%] z-10 -translate-x-1/2 rounded border border-amber-300/75 bg-black/80 px-3.5 py-1 text-xs font-bold tracking-wider text-amber-200 shadow-lg"
            >
              🐎 [F] Ata Bin
            </div>
          )}

          {/* 7. TAB: CANLI MUHAREBE ÇETELESİ VE KURALLI GERİ ÇEKİLME MODALI */}
          {cmdUi.scoreboardOpen && (
            <div
              data-testid="battle-scoreboard"
              className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
            >
              <div className="w-full max-w-2xl rounded-xl border-2 border-[#c6a15b] bg-[#120e0a]/95 p-6 text-[#f3ead8] shadow-2xl">
                <div className="flex items-center justify-between border-b border-[#c6a15b]/40 pb-3">
                  <div>
                    <h2 className="text-lg font-bold tracking-wider text-[#fde68a]">
                      MUHAREBE ÇETELESİ
                    </h2>
                    <p className="text-xs text-[#b5a890]">
                      Cerrah Hekimlik koruması devrede · Yaralı askerler savaştan sonra orduda kalır
                    </p>
                  </div>
                  <span className="rounded border border-[#c6a15b]/50 bg-[#1c1610] px-2.5 py-1 text-xs text-[#fbbf24]">
                    [Tab] Kapat
                  </span>
                </div>

                <table className="mt-4 w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#c6a15b]/30 text-[#c6a15b]">
                      <th className="py-2">Taraf</th>
                      <th className="py-2 text-right">Mevcut</th>
                      <th className="py-2 text-right">Sağ</th>
                      <th className="py-2 text-right">Yaralı</th>
                      <th className="py-2 text-right">Kaçan</th>
                      <th className="py-2 text-right">Ölü</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#c6a15b]/15 font-mono">
                    <tr>
                      <td className="py-2.5 font-sans font-bold text-[#4ade80]">
                        Sancak Kuvvetleri
                      </td>
                      <td className="py-2.5 text-right">{cmdUi.allyTotal}</td>
                      <td className="py-2.5 text-right font-bold text-[#86efac]">
                        {cmdUi.allyAlive}
                      </td>
                      <td className="py-2.5 text-right text-[#fde68a]">{cmdUi.allyWounded}</td>
                      <td className="py-2.5 text-right text-[#cbd5e1]">{cmdUi.allyRouted}</td>
                      <td className="py-2.5 text-right text-[#f87171]">{cmdUi.allyDead}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans font-bold text-[#f87171]">
                        {cmdUi.enemyCommanderName}
                      </td>
                      <td className="py-2.5 text-right">{cmdUi.enemyTotal}</td>
                      <td className="py-2.5 text-right font-bold text-[#fca5a5]">
                        {cmdUi.enemyAlive}
                      </td>
                      <td className="py-2.5 text-right text-[#fde68a]">{cmdUi.enemyWounded}</td>
                      <td className="py-2.5 text-right text-[#cbd5e1]">{cmdUi.enemyRouted}</td>
                      <td className="py-2.5 text-right text-[#f87171]">{cmdUi.enemyDead}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="mt-5 flex items-center justify-between border-t border-[#c6a15b]/30 pt-4">
                  <div className="text-xs text-[#d1c5b0]">
                    Şahsi Devrilen Düşman: <strong className="text-[#4ade80]">{cmdUi.playerKills}</strong>
                  </div>
                  <button
                    type="button"
                    data-testid="battle-retreat-btn"
                    onClick={() => retreatApiRef.current?.()}
                    className="rounded border border-red-400/70 bg-red-900/80 px-4 py-2 text-xs font-bold text-red-100 hover:bg-red-800"
                  >
                    Meydandan Kurallı Geri Çekil
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded bg-black/55 px-3 py-1 text-[11px] tracking-wide text-[#e8dcc3]">
            Tıkla: nişan kilidi · WASD: sür · Fare yönü + Sol tık: 4 yönlü saldır · Sağ tık: yönlü
            blok · G/Tekerlek: Yay/Kılıç · X: Kargı · V: 1./3. Şahıs · F: Ata Bin/İn · Tab: Çetele
          </div>
        </>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded bg-black/45 px-3 py-1 text-[11px] tracking-wide text-[#e8dcc3]">
          Tıkla: nişan kilidi · WASD: sür · Sol tık: saldır · Sağ tık (basılı): blok
        </div>
      )}
    </div>
  );
};

export default BattlefieldView;
