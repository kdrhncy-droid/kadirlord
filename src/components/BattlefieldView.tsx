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
  planReinforcementWave,
  remainingReserves,
} from '../game/reinforcements';
import { createWarriorModel, type WarriorMeshHandles } from '../game/proceduralModels';
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

interface CmdUiCard {
  cls: UnitTierId;
  num: number;
  alive: number;
  total: number;
  formation: DeployFormation;
  order: DivisionMoveOrder;
  delegated: boolean;
  holdFire: boolean;
}

interface CmdUiData {
  selection: 'ALL' | UnitTierId;
  menu: 'MOVE' | 'FACE' | 'FORM' | null;
  cards: CmdUiCard[];
}

interface MissionActor {
  id: string;
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
  attackPhase: 'IDLE' | 'WINDUP' | 'ACTIVE' | 'RECOVERY';
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

/**
 * Bölük sancağı: uzun direk + altın tepelik + enine seren + dikey sancak bezi.
 * Bannerlord misyonlarında her formasyonun önünde taşıdığı sancağın karşılığı;
 * Bannerlord'da sancaklar bölüğü uzaktan okunur kılar. Bez, dalgalanma için
 * ayrı mesh olarak döner. (Arena'daki createTacticalBannerMesh zincirini
 * buraya taşımak yerine aynı ölçülerde yerel üretim; karakter rig'i B6'da.)
 */
function createFormationBanner(factionHex: number): { group: THREE.Group; cloth: THREE.Mesh } {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.85, metalness: 0.05 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.3, metalness: 0.8 });
  const clothMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hexToCss(factionHex)),
    roughness: 0.8,
    side: THREE.DoubleSide,
  });

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 3.4, 8), woodMat);
  pole.position.y = 1.7;
  pole.castShadow = true;
  group.add(pole);

  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), goldMat);
  finial.position.y = 3.48;
  group.add(finial);

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), woodMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0.4, 3.15, 0);
  group.add(crossbar);

  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.25, 0.03), clothMat);
  cloth.position.set(0.42, 2.5, 0);
  cloth.castShadow = true;
  group.add(cloth);
  return { group, cloth };
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
    // Bölük sancakları: her sınıf şeridinin ilk neferi taşır; dalgalanma için
    // bez mesh'leri ayrı listede tutulur (Bannerlord'da formasyon sancağı).
    const bannerCloths: THREE.Mesh[] = [];
    const groundY = (x: number, z: number) => battleGroundY(profile, x, z);

    let actorSeq = 0;
    const spawnActors = (
      team: ActorTeam,
      counts: Record<UnitTierId, number>,
      factionHex: number,
      spawn: { x: number; z: number; facing: number },
      withBanners: boolean,
    ): MissionActor[] => {
      const created: MissionActor[] = [];
      const forward = team === 'ally' ? -1 : 1; // müttefik -Z'ye, düşman +Z'ye bakar
      // Sınıf şeritleri: piyade önde, okçu geride, atlı okçu sol, süvari sağ kanatta.
      // Bannerlord hatları sıktır (kalkan duvarı omuz omuza): piyade 1.35,
      // okçu 1.7 aralık; süvari at genişliği ister (2.6). Sıra derinliği 1.7.
      const lanes: Array<{ cls: UnitTierId; cx: number; cz: number; perRow: number; gap: number }> = [
        { cls: 'infantry', cx: 0, cz: 0, perRow: 12, gap: 1.35 },
        { cls: 'archer', cx: 0, cz: -9, perRow: 12, gap: 1.7 },
        { cls: 'horseArcher', cx: -30, cz: -4, perRow: 6, gap: 2.6 },
        { cls: 'cavalry', cx: 30, cz: -4, perRow: 6, gap: 2.6 },
      ];
      for (const lane of lanes) {
        const count = counts[lane.cls];
        const stats = classStats(lane.cls);
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
          // Şeridin ilk neferi bölük sancağını taşır (sağ kolda uzun direk).
          if (withBanners && i === 0 && count >= 3) {
            const banner = createFormationBanner(factionHex);
            banner.group.position.set(0.42, 0.55, 0.1);
            banner.group.rotation.x = -0.08;
            banner.group.scale.setScalar(0.8);
            handles.rightArm.add(banner.group);
            bannerCloths.push(banner.cloth);
          }
          handles.root.position.set(x, groundY(x, z), z);
          scene.add(handles.root);
          const actor: MissionActor = {
            id: `${team}-${lane.cls}-${actorSeq++}`,
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
    spawnActors('ally', allyFielded, FACTION_INFO.player.hex, profile.allySpawn, true);
    spawnActors('enemy', enemyFielded, enemyHex, profile.enemySpawn, true);

    // Düşman komutanı (ağır süvari görünümü; kadro dışı tek aktör, eski davranış).
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
      actors.push({
        id: 'enemy-commander',
        team: 'enemy',
        unitType: 'cavalry',
        archetype: 'CHARGER',
        x,
        z,
        vx: 0,
        vz: 0,
        facing: profile.enemySpawn.facing,
        hp: 150,
        maxHp: 150,
        attack: 26,
        defense: 16,
        speed: 10.6,
        range: 2.9,
        isRanged: false,
        isMounted: true,
        isBlocking: false,
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

    // Oyuncu (atlı komutan).
    const playerHandles = createWarriorModel({
      factionHex: FACTION_INFO.player.hex,
      isMounted: true,
      isCommander: true,
    });
    playerHandles.telegraphRing.visible = false;
    playerHandles.root.scale.setScalar(1.18);
    // Oyuncu kumanda sancağı taşır (kendi bölüğünün önünde görünür işaret).
    {
      const banner = createFormationBanner(FACTION_INFO.player.hex);
      banner.group.position.set(0.42, 0.55, 0.1);
      banner.group.rotation.x = -0.08;
      banner.group.scale.setScalar(0.8);
      playerHandles.rightArm.add(banner.group);
      bannerCloths.push(banner.cloth);
    }
    const player: MissionActor = {
      id: 'player-commander',
      team: 'ally',
      unitType: 'commander',
      archetype: 'CHARGER',
      x: profile.allySpawn.x,
      z: profile.allySpawn.z + 8,
      vx: 0,
      vz: 0,
      facing: Math.PI,
      hp: Math.max(1, campaign.playerHp),
      maxHp: Math.max(1, campaign.playerMaxHp),
      attack: 34,
      defense: 20,
      speed: 10.8,
      range: 3.1,
      isRanged: false,
      isMounted: true,
      isBlocking: false,
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
    /* B4: Bölükler her meydan savaşında ve İKİ takım için de kurulur — emir
       sistemi bölük üstünden işler. Konuşlanma arayüzü (B3) yalnız ≥20 askerde
       açılır; bölük kurgusu hep vardır. Varsayılan çapalar B1 şerit düzeniyle
       aynıdır (piyade önde, okçu geride, atlı okçu sol, süvari sağ kanatta),
       düşman aynalanır: dokunmadan başlanırsa diziliş eski hâliyle aynıdır. */
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
      // Sınıf kadroda varsa bölük kurulur; ilk dalga o sınıftan kimse
      // çıkarmadıysa üyeler takviye dalgasıyla katılır.
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
      const created = spawnActors(team, plan, hex, spawn, false);
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

    const refreshCmdUi = () => {
      setCmdUi({
        selection: cmdSelection,
        menu: cmdMenu,
        cards: divisions.map((d) => ({
          cls: d.cls,
          num: DIVISION_NUMBER[d.cls],
          alive: d.members.filter((m) => m.hp > 0 && !m.gone).length,
          total: d.members.length,
          formation: d.formation,
          order: d.moveOrder,
          delegated: d.delegated,
          holdFire: d.holdFire,
        })),
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
       slotlarını koruyarak hareket eder (Bannerlord formasyon hareketi).
       Devredilmiş bölükte kaptan AI emri günceller: piyade yaklaşınca hücum,
       okçu menzil bandında tutar, süvari yakında hücum, atlı okçu taciz. */
    const updateDivision = (div: DivisionState, dt: number) => {
      div.moving = false;
      if (!div.members.some((m) => m.hp > 0 && !m.gone)) return;
      const stats = classStats(div.cls);

      if (div.delegated) {
        div.aiTimer -= dt;
        if (div.aiTimer <= 0) {
          div.aiTimer = 0.8 + Math.random() * 0.8;
          const near = nearestEnemyTo(div.team, div.x, div.z);
          if (near) {
            const prev = div.moveOrder;
            if (div.cls === 'infantry') {
              div.moveOrder = near.dist > 42 ? 'ADVANCE' : 'CHARGE';
            } else if (div.cls === 'archer') {
              if (near.dist > stats.range * 0.85) div.moveOrder = 'ADVANCE';
              else {
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
    let mouseLeftPressed = false;
    let mouseRightHeld = false;
    let camYaw = Math.PI; // oyuncu -Z'ye (düşmana) bakar
    let camPitch = 0.32;
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
        renderer.domElement.requestPointerLock();
        return;
      }
      if (e.button === 0) mouseLeftPressed = true;
      if (e.button === 2) mouseRightHeld = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        mouseRightHeld = false;
        facingDrag = false;
      }
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
      if (document.pointerLockElement !== renderer.domElement) return;
      camYaw -= e.movementX * 0.0021;
      camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0021, -0.12, 1.0);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onDeployKeyDown = (e: KeyboardEvent) => {
      /* B4: savaş fazı bölük emirleri (capture + preventDefault: F1 yardımı vb. engellenir) */
      if (phase === 'battle') {
        if (propsRef.current.paused) return;
        const code = e.code;
        let handled = true;
        const issue = (fn: (d: DivisionState) => void) => {
          for (const d of selectedDivisions()) fn(d);
          sound.playWarhorn();
        };
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
                });
              }
            } else if (code === 'F2') {
              issue((d) => { d.delegated = false; d.moveOrder = 'FOLLOW'; });
            } else if (code === 'F3') {
              issue((d) => {
                d.delegated = false;
                if (d.moveOrder !== 'CHARGE') resetChargeCycle(d);
                d.moveOrder = 'CHARGE';
              });
            } else if (code === 'F4') {
              issue((d) => { d.delegated = false; d.moveOrder = 'ADVANCE'; });
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
              });
            } else if (code === 'F6') {
              issue((d) => {
                d.delegated = false;
                d.moveOrder = 'HOLD';
                d.targetX = d.x;
                d.targetZ = d.z;
              });
            } else if (code === 'F7') {
              issue((d) => { d.delegated = false; d.moveOrder = 'RETREAT'; });
            } else handled = false;
            if (handled) cmdMenu = null;
          } else if (cmdMenu === 'FACE') {
            if (code === 'F1') {
              const p = lookGroundPoint();
              issue((d) => {
                d.delegated = false;
                d.facingMode = 'DIRECTION';
                if (p) d.facing = Math.atan2(p.x - d.x, p.z - d.z);
              });
            } else if (code === 'F2') {
              issue((d) => { d.delegated = false; d.facingMode = 'ENEMY'; });
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
              });
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
          issue((d) => { d.holdFire = next; });
        } else if (code === 'F6') {
          const next = !(selectedDivisions()[0]?.delegated ?? false);
          issue((d) => {
            d.delegated = next;
            d.aiTimer = Math.min(d.aiTimer, 0.15);
          });
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
      if (phase !== 'deploy' || e.target !== renderer.domElement) return;
      deployCamDist = THREE.MathUtils.clamp(
        deployCamDist + Math.sign(e.deltaY) * 9,
        42,
        165,
      );
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
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);

    /* ── Döngü ── */
    let rafId = 0;
    let lastNow = performance.now();
    let elapsed = 0;
    let hudTimer = 0;
    let waveTimer = REINFORCEMENT_CHECK_INTERVAL;
    let battleEnded = false;
    let endTimer = 0;
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      const enemiesAlive = actors.filter((a) => a.team === 'enemy' && a.hp > 0 && !a.gone).length;
      const victory = enemiesAlive === 0;
      // B5: kayıplar bire bir — ölen her aktör kadrodan tek askerdir.
      // Ricatla ayrılanlar (hp > 0, gone) ve hiç sahaya çıkmayan yedekler
      // kayıp değildir. Düşman komutanı kadro dışı kahraman aktörüdür.
      const losses: Partial<TroopRoster> = {};
      for (const cls of CLASS_ORDER) {
        losses[cls] = actors.filter(
          (a) => a.team === 'ally' && a.unitType === cls && a.hp <= 0,
        ).length;
      }
      const enemiesDefeated = actors.filter(
        (a) => a.team === 'enemy' && a.hp <= 0 && a.id !== 'enemy-commander',
      ).length;
      if (document.pointerLockElement) document.exitPointerLock();
      propsRef.current.onBattleComplete(victory, losses, enemiesDefeated);
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

    // Sabit adımlı alt adım akümülatörü: simülasyon 1/60 sn adımlarla ilerler.
    // Kare süresi uzadığında (düşük FPS) oyun yavaş çekime dönmez, eksik
    // adımlar telafi edilir (en çok 6 adım/Karede — spiral koruması; aşan
    // birikim atılır). paused iken simülasyon donar ama sahne çizilir.
    const STEP_DT = 1 / 60;
    let accumulator = 0;
    let shadowTimer = 0;

    const step = (dt: number) => {
      elapsed += dt;

      if (battleEnded) {
        endTimer -= dt;
        if (endTimer <= 0) finish();
      } else {
        /* Oyuncu */
        if (player.hp > 0) {
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
          player.isBlocking = mouseRightHeld;
          player.facing = camYaw;
          const mLen = Math.hypot(mx, mz);
          if (mLen > 0.01) {
            const spd = player.speed * (player.isBlocking ? 0.45 : 1);
            player.vx = THREE.MathUtils.lerp(player.vx, (mx / mLen) * spd, 8 * dt);
            player.vz = THREE.MathUtils.lerp(player.vz, (mz / mLen) * spd, 8 * dt);
          } else {
            player.vx *= Math.exp(-6 * dt);
            player.vz *= Math.exp(-6 * dt);
          }
          if (mouseLeftPressed && player.attackPhase === 'IDLE') {
            player.attackPhase = 'WINDUP';
            player.attackTimer = 0.16;
            sound.playSwordSwing();
          }
        }
        mouseLeftPressed = false;

        /* B4: bölük çapaları + formasyon slotları (aktör döngüsünden önce) */
        for (const d of divisions) updateDivision(d, dt);
        for (const d of enemyDivisions) updateDivision(d, dt);

        /* B5: takviye dalgası kontrolü */
        waveTimer -= dt;
        if (waveTimer <= 0) {
          waveTimer = REINFORCEMENT_CHECK_INTERVAL;
          processReinforcements('ally');
          processReinforcements('enemy');
        }

        /* Aktör güncellemesi */
        for (let i = 0; i < actors.length; i++) {
          const actor = actors[i];
          if (actor.gone) continue;

          if (actor.hp <= 0) {
            actor.koTimer += dt;
            actor.handles.root.rotation.x = Math.min(
              Math.PI / 2,
              (actor.koTimer / 0.4) * (Math.PI / 2),
            );
            if (actor.koTimer >= 0.5) {
              actor.gone = true;
              actor.handles.root.visible = false;
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
            const div = actorDivision.get(actor.id);
            const near = nearestOpponent(actor);
            actor.cooldownTimer = Math.max(0, actor.cooldownTimer - dt);
            let moveX = 0;
            let moveZ = 0;
            let speedMul = 1;
            const order: DivisionMoveOrder = div ? div.moveOrder : 'CHARGE';
            const holdFire = div?.holdFire ?? false;
            const slotSteer = !!div && order !== 'CHARGE' && actor.hasSlot;
            const engageRange = actor.isRanged ? actor.range : 3.4;
            const engaged = !!near && near.dist <= engageRange && order !== 'RETREAT';

            // Kalkan duvarındaki yaya kalkanını kaldırır.
            actor.isBlocking =
              !!div && div.formation === 'SHIELD_WALL' && !actor.isMounted;

            if (near && order !== 'RETREAT') {
              const { opp, dist } = near;
              const dx = opp.x - actor.x;
              const dz = opp.z - actor.z;
              const d = Math.max(0.01, dist);
              const dirX = dx / d;
              const dirZ = dz / d;

              if (!slotSteer) {
                /* HÜCUM: düzen bozulur, herkes en yakın düşmanı kovalar.
                   Süvari hattı geçip geride toplanarak çevrim hücumu yapar. */
                actor.facing = Math.atan2(dirX, dirZ);
                if (actor.archetype === 'CHARGER') {
                  actor.cycleTimer -= dt;
                  if (actor.cyclePhase === 'ATTACK') {
                    if (actor.cycleTimer <= 0 || dist < 2.6) {
                      actor.cyclePhase = 'REGROUP';
                      actor.cycleTimer = 2.2 + Math.random();
                    } else if (dist > 2.4) {
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
                  if (dist < actor.range * 0.55) { moveX = -dirX; moveZ = -dirZ; }
                  else if (dist > actor.range * 0.9) { moveX = dirX; moveZ = dirZ; }
                  else { moveX = -dirZ; moveZ = dirX; speedMul = 0.5; }
                } else if (dist > 2.2) {
                  moveX = dirX;
                  moveZ = dirZ;
                }
              } else if (engaged) {
                /* Formasyonda temas: bireysel dövüş (slotu bırakma). */
                actor.facing = Math.atan2(dirX, dirZ);
                if (!actor.isRanged && dist > 2.1) {
                  moveX = dirX;
                  moveZ = dirZ;
                  speedMul = 0.8;
                }
              }

              // Ateş Kes menzilli birimi susturur (yakın dövüş sürer).
              const fireOK = !(actor.isRanged && holdFire);
              if (
                fireOK &&
                dist <= actor.range &&
                actor.attackPhase === 'IDLE' &&
                actor.cooldownTimer <= 0
              ) {
                actor.attackPhase = 'WINDUP';
                actor.attackTimer = actor.isRanged ? 0.5 : 0.3;
              }
            }

            if (slotSteer && moveX === 0 && moveZ === 0 && !engaged) {
              const sx = actor.slotX - actor.x;
              const sz = actor.slotZ - actor.z;
              const sd = Math.hypot(sx, sz);
              if (sd > 0.9) {
                moveX = sx / sd;
                moveZ = sz / sd;
                speedMul = sd > 8 ? 1.45 : sd > 3 ? 1.1 : 0.75;
                actor.facing = Math.atan2(moveX, moveZ);
              } else {
                actor.facing = actor.slotFacing;
              }
            }

            // Ricat: kendi kenarına varan aktör sahneden ayrılır (kayıp sayılmaz).
            if (order === 'RETREAT') {
              if (
                (actor.team === 'ally' && actor.z >= profile.allySpawn.z + 24) ||
                (actor.team === 'enemy' && actor.z <= profile.enemySpawn.z - 24)
              ) {
                actor.gone = true;
                actor.handles.root.visible = false;
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
          }

          /* Saldırı aşamaları */
          if (actor.attackPhase === 'WINDUP') {
            actor.attackTimer -= dt;
            actor.handles.rightArm.rotation.x = -1.35;
            if (actor.attackTimer <= 0) {
              actor.attackPhase = 'ACTIVE';
              actor.attackTimer = 0.13;
              if (actor.isRanged) {
                sound.playBowShot();
                const near = nearestOpponent(actor);
                if (near && near.dist <= actor.range * 1.15) {
                  const target = near.opp;
                  const dmg = computeMeleeDamage(actor.attack, target.defense, false, target.isBlocking, 1);
                  target.hp = Math.max(0, target.hp - dmg);
                  target.hitFlashTimer = 0.07;
                  spawnParticles(target.x, groundY(target.x, target.z) + 1.3, target.z, 6, target.isBlocking);
                }
              } else {
                const reach = actor.range + 0.7;
                for (const o of actors) {
                  if (o.team === actor.team || o.hp <= 0 || o.gone) continue;
                  const dx = o.x - actor.x;
                  const dz = o.z - actor.z;
                  const d = Math.hypot(dx, dz);
                  if (d > reach) continue;
                  // Yön: yalnız ön yarım düzlem vurur.
                  const fx = Math.sin(actor.facing);
                  const fz = Math.cos(actor.facing);
                  if ((dx * fx + dz * fz) / Math.max(0.01, d) < 0.25) continue;
                  const speedMult = 1 + Math.hypot(actor.vx, actor.vz) * 0.03;
                  const dmg = computeMeleeDamage(
                    actor.attack,
                    o.defense,
                    actor.archetype === 'CHARGER',
                    o.isBlocking,
                    speedMult,
                  );
                  o.hp = Math.max(0, o.hp - dmg);
                  o.hitFlashTimer = 0.07;
                  const nx = dx / Math.max(0.1, d);
                  const nz = dz / Math.max(0.1, d);
                  o.vx += nx * (actor.isMounted ? 5.5 : 3);
                  o.vz += nz * (actor.isMounted ? 5.5 : 3);
                  spawnParticles(o.x, groundY(o.x, o.z) + 1.3, o.z, o.isBlocking ? 8 : 11, o.isBlocking);
                  if (o.id === 'player-commander' || actor.id === 'player-commander') {
                    sound.playHeavyHit(o.isBlocking);
                  }
                }
              }
            }
          } else if (actor.attackPhase === 'ACTIVE') {
            actor.attackTimer -= dt;
            actor.handles.rightArm.rotation.x = 0.7;
            if (actor.attackTimer <= 0) {
              actor.attackPhase = 'RECOVERY';
              actor.attackTimer = 0.24;
            }
          } else if (actor.attackPhase === 'RECOVERY') {
            actor.attackTimer -= dt;
            actor.handles.rightArm.rotation.x = THREE.MathUtils.lerp(
              actor.handles.rightArm.rotation.x,
              0,
              10 * dt,
            );
            if (actor.attackTimer <= 0) {
              actor.attackPhase = 'IDLE';
              actor.cooldownTimer = actor.isRanged ? 1.4 + Math.random() * 0.6 : 0.55 + Math.random() * 0.35;
            }
          } else {
            actor.handles.rightArm.rotation.x = THREE.MathUtils.lerp(
              actor.handles.rightArm.rotation.x,
              0,
              8 * dt,
            );
          }
          actor.handles.leftArm.rotation.y = actor.isBlocking ? 0.55 : 0;

          /* Konum + ayırma + sınır */
          const moved = clampToBattlefield(
            profile,
            actor.x + actor.vx * dt,
            actor.z + actor.vz * dt,
          );
          actor.x = moved.x;
          actor.z = moved.z;
          for (let j = i + 1; j < actors.length; j++) {
            const b = actors[j];
            if (b.hp <= 0 || b.gone) continue;
            const sdx = b.x - actor.x;
            const sdz = b.z - actor.z;
            const sDist = Math.hypot(sdx, sdz);
            const minSep = actor.isMounted || b.isMounted ? 1.9 : 1.25;
            if (sDist > 0.001 && sDist < minSep) {
              const push = ((minSep - sDist) / sDist) * 0.5;
              actor.x -= sdx * push;
              actor.z -= sdz * push;
              b.x += sdx * push;
              b.z += sdz * push;
            }
          }

          const y = groundY(actor.x, actor.z);
          actor.handles.root.position.set(actor.x, y, actor.z);
          actor.handles.root.rotation.y = actor.facing;
          const moveSpd = Math.hypot(actor.vx, actor.vz);
          actor.handles.bodyGroup.position.y =
            moveSpd > 0.4 ? Math.abs(Math.sin(elapsed * moveSpd * 1.35 + i)) * 0.1 : 0;
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
        // Bir taraf tamamen düşmeden savaş bitmez; oyuncu bayılırsa tarafı
        // savaşmaya devam eder (kumanda devri B7'de kurallaşacak).
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

      // Sancak bezleri rüzgârda dalgalanır (hafif salınım, fazlar bez başına ayrı).
      const clothT = now * 0.001;
      for (let ci = 0; ci < bannerCloths.length; ci++) {
        bannerCloths[ci].rotation.y = Math.sin(clothT * 2.3 + ci * 1.7) * 0.22;
        bannerCloths[ci].rotation.x = Math.sin(clothT * 1.7 + ci * 2.3) * 0.06;
      }

      shadowTimer += frameDt;
      if (shadowTimer >= 0.5) {
        shadowTimer = 0;
        renderer.shadowMap.needsUpdate = true;
      }

      /* Kamera */
      if (phase === 'deploy') {
        // Konuşlanma: WASD ile kayan, tekerlekle yakınlaşan taktik kamera.
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
        const dist = 8.5;
        const cx = px - Math.sin(camYaw) * Math.cos(camPitch) * dist;
        const cz = pz - Math.cos(camYaw) * Math.cos(camPitch) * dist;
        const cy = py + 2.1 + Math.sin(camPitch) * dist;
        camera.position.set(cx, Math.max(cy, groundY(cx, cz) + 0.7), cz);
        camera.lookAt(
          px + Math.sin(camYaw) * 6,
          py + 1.7,
          pz + Math.cos(camYaw) * 6,
        );
      } else {
        // Oyuncu bayıldı: meydanı yukarıdan seyret.
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
          <div
            data-testid="command-panel"
            className="pointer-events-none absolute bottom-28 left-1/2 z-10 -translate-x-1/2"
          >
            <div className="flex items-stretch justify-center gap-2">
              <div
                className={`flex w-20 flex-col items-center justify-center rounded border px-2 py-2 text-center ${
                  cmdUi.selection === 'ALL'
                    ? 'border-amber-300 bg-amber-950/70'
                    : 'border-[#8a6d3b]/50 bg-black/55'
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
                    className={`w-40 rounded border px-3 py-2 ${
                      selected
                        ? 'border-amber-300/80 bg-amber-950/60'
                        : 'border-[#8a6d3b]/50 bg-black/55 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#f3d98b]">
                        <span className="rounded bg-[#8a6d3b]/70 px-1 text-[11px] text-black">
                          {card.num}
                        </span>
                        {DIVISION_LABEL[card.cls]}
                      </span>
                      <span className="text-[11px] text-[#e8dcc3]">
                        {card.alive}/{card.total}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[#e8dcc3]">
                      <span className="text-[#f3d98b]">{MOVE_ORDER_LABEL[card.order]}</span>
                      <span>{DEPLOY_FORMATION_LABEL[card.formation]}</span>
                    </div>
                    {(card.delegated || card.holdFire) && (
                      <div className="mt-0.5 flex gap-1 text-[10px] tracking-wide">
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
              className="mx-auto mt-2 w-fit rounded border border-[#8a6d3b]/60 bg-black/65 px-4 py-1.5 text-center text-[12px] tracking-wide text-[#e8dcc3]"
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
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded bg-black/45 px-3 py-1 text-[11px] tracking-wide text-[#e8dcc3]">
            Tıkla: nişan kilidi · WASD: sür · Sol tık: saldır · Sağ tık (basılı): blok · 0-4
            bölük seç · F1-F6 emir
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
