/**
 * BattlefieldView.tsx — 10.2/B1: ayrı meydan savaşı misyonu.
 *
 * Savaş artık WorldCanvas sefer sahnesinin içinde düz bir arenada değil,
 * kendi sahnesinde geçer: arazi, karşılaşma noktasının sefer haritası
 * çevresinden `battlefield.ts` profiliyle kurulur (nehir/köprü/köy/orman
 * dünya haritasında ne varsa sahnede de o vardır; doğuş kenarları yaklaşma
 * vektöründen türer; alan 460×460 ve kırmızı yumuşak sınırla çevrilidir).
 *
 * B1 kapsamı sahne + taşınan aktör çekirdeğidir. Sonraki fazlar burada
 * büyüyecek: B3 Order of Battle dizilişi, B4 bölük emirleri, B5 1 aktör =
 * 1 asker + takviye dalgaları (şu an taraflar en çok 60 aktöre ölçeklenir
 * ve kayıplar sınıf bazında orantılı yazılır), B6 yönlü şahsi dövüş,
 * B7 moral/bozgun/esaret. Eski arenanın Bannerlord'a yabancı katmanı
 * (dash, stamina, kombo, hitstop, telegraph halkası, kamera sarsıntısı)
 * bu misyona taşınmadı.
 */
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  FACTION_INFO,
  computeMeleeDamage,
  factionHasHorseArchers,
  getTotalTroops,
  type CampaignState,
  type LordAgent,
  type Settlement,
  type TacticalOrder,
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
import { createWarriorModel, type WarriorMeshHandles } from '../game/proceduralModels';
import { sound } from '../game/sound';

interface BattlefieldViewProps {
  /** Duraklatma menüsü açıkken simülasyon donar (bileşen sökülmez). */
  paused?: boolean;
  campaign: CampaignState;
  targetLord: LordAgent | null;
  targetSettlement: Settlement | null;
  activeOrder: TacticalOrder;
  onBattleTelemetry: (telemetry: BattleTelemetry) => void;
  onBattleComplete: (
    victory: boolean,
    losses: Partial<TroopRoster>,
    enemiesDefeated: number,
  ) => void;
}

type ActorTeam = 'ally' | 'enemy';
type ActorArchetype = 'CHASER' | 'KITER' | 'CHARGER';

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
  homeX: number;
  homeZ: number;
  handles: WarriorMeshHandles;
}

/** Taraf başına en çok aktör (B5'te 1:1 + takviye dalgalarına geçilecek). */
const MAX_ACTORS_PER_SIDE = 60;

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

/** Kadro sınıf sayılarını aktör bütçesine orantılı böler (her sınıftan en az 1, varsa). */
function allocateActors(roster: TroopRoster): Record<UnitTierId, number> {
  const total = Math.max(0, getTotalTroops(roster));
  const out: Record<UnitTierId, number> = { infantry: 0, archer: 0, cavalry: 0, horseArcher: 0 };
  if (total <= 0) return out;
  const budget = Math.min(MAX_ACTORS_PER_SIDE, total);
  for (const cls of CLASS_ORDER) {
    if (roster[cls] > 0) out[cls] = Math.max(1, Math.round((roster[cls] / total) * budget));
  }
  // Yuvarlama bütçeyi aşarsa en kalabalık sınıftan kıs.
  let sum = CLASS_ORDER.reduce((s, c) => s + out[c], 0);
  while (sum > budget) {
    const biggest = CLASS_ORDER.reduce((a, b) => (out[a] >= out[b] ? a : b));
    if (out[biggest] <= 1) break;
    out[biggest]--;
    sum--;
  }
  return out;
}

export const BattlefieldView: React.FC<BattlefieldViewProps> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

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
    const enemyTotal = Math.max(1, getTotalTroops(enemyRoster));

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

    const spawnSide = (
      team: ActorTeam,
      roster: TroopRoster,
      factionHex: number,
      spawn: { x: number; z: number; facing: number },
    ): Record<UnitTierId, number> => {
      const counts = allocateActors(roster);
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
          if (i === 0 && count >= 3) {
            const banner = createFormationBanner(factionHex);
            banner.group.position.set(0.42, 0.55, 0.1);
            banner.group.rotation.x = -0.08;
            banner.group.scale.setScalar(0.8);
            handles.rightArm.add(banner.group);
            bannerCloths.push(banner.cloth);
          }
          handles.root.position.set(x, groundY(x, z), z);
          scene.add(handles.root);
          actors.push({
            id: `${team}-${lane.cls}-${i}`,
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
            homeX: x,
            homeZ: z,
            handles,
          });
        }
      }
      return counts;
    };

    const allyCounts = spawnSide('ally', campaign.roster, FACTION_INFO.player.hex, profile.allySpawn);
    const enemyCounts = spawnSide('enemy', enemyRoster, enemyHex, profile.enemySpawn);

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
      homeX: profile.allySpawn.x,
      homeZ: profile.allySpawn.z + 8,
      handles: playerHandles,
    };
    playerHandles.root.position.set(player.x, groundY(player.x, player.z), player.z);
    scene.add(playerHandles.root);
    actors.push(player);

    const alliesTotal = actors.filter((a) => a.team === 'ally').length;
    const enemiesTotal = actors.filter((a) => a.team === 'enemy').length;

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
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
        return;
      }
      if (e.button === 0) mouseLeftPressed = true;
      if (e.button === 2) mouseRightHeld = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) mouseRightHeld = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      camYaw -= e.movementX * 0.0021;
      camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0021, -0.12, 1.0);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onResize = () => {
      const w = mount.clientWidth;
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('keydown', onKeyDown);
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
    let battleEnded = false;
    let endTimer = 0;
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      const enemiesAlive = actors.filter((a) => a.team === 'enemy' && a.hp > 0).length;
      const victory = enemiesAlive === 0;
      // Kayıplar sınıf bazında orantılı yazılır (B5'te 1:1 olacak).
      const losses: Partial<TroopRoster> = {};
      for (const cls of CLASS_ORDER) {
        const dead = actors.filter(
          (a) => a.team === 'ally' && a.unitType === cls && a.hp <= 0,
        ).length;
        const fielded = allyCounts[cls];
        const real = campaign.roster[cls];
        losses[cls] =
          fielded > 0 ? Math.min(real, Math.round((dead / fielded) * real)) : 0;
      }
      const enemyDead = actors.filter((a) => a.team === 'enemy' && a.hp <= 0).length;
      const enemyFielded = Math.max(1, enemiesTotal);
      const enemiesDefeated = Math.min(
        enemyTotal,
        Math.round((enemyDead / enemyFielded) * enemyTotal),
      );
      if (document.pointerLockElement) document.exitPointerLock();
      propsRef.current.onBattleComplete(victory, losses, enemiesDefeated);
    };

    const nearestOpponent = (actor: MissionActor): { opp: MissionActor; dist: number } | null => {
      let best: MissionActor | null = null;
      let bestD = Infinity;
      for (const other of actors) {
        if (other.team === actor.team || other.hp <= 0) continue;
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
            const near = nearestOpponent(actor);
            actor.cooldownTimer = Math.max(0, actor.cooldownTimer - dt);
            if (near) {
              const { opp, dist } = near;
              const dx = opp.x - actor.x;
              const dz = opp.z - actor.z;
              const d = Math.max(0.01, dist);
              const dirX = dx / d;
              const dirZ = dz / d;
              actor.facing = Math.atan2(dirX, dirZ);

              let moveX = 0;
              let moveZ = 0;
              let speedMul = 1;
              const stopDist = actor.isRanged ? actor.range * 0.82 : 2.2;

              if (actor.team === 'ally') {
                const order = propsRef.current.activeOrder;
                if (order === 'SHIELD_WALL' || (order === 'HOLD_VOLLEY' && actor.isRanged)) {
                  actor.isBlocking = !actor.isRanged && order === 'SHIELD_WALL';
                  const hx = actor.homeX - actor.x;
                  const hz = actor.homeZ - actor.z;
                  const hd = Math.hypot(hx, hz);
                  if (hd > 1.4 && dist > 11) {
                    moveX = hx / hd;
                    moveZ = hz / hd;
                    speedMul = 0.7;
                  } else if (dist <= 11 && !actor.isRanged) {
                    moveX = dirX;
                    moveZ = dirZ;
                    speedMul = 0.85;
                  }
                } else if (order === 'FOLLOW_ME' && player.hp > 0 && dist > 26) {
                  const slotX = player.x + ((i % 7) - 3) * 2.6;
                  const slotZ = player.z + Math.floor(i / 7) * 2.6 + 3;
                  const sx = slotX - actor.x;
                  const sz = slotZ - actor.z;
                  const sd = Math.hypot(sx, sz);
                  if (sd > 2.4) {
                    moveX = sx / sd;
                    moveZ = sz / sd;
                    actor.facing = Math.atan2(sx, sz);
                  }
                } else {
                  actor.isBlocking = false;
                  if (actor.archetype === 'KITER') {
                    if (dist < actor.range * 0.55) { moveX = -dirX; moveZ = -dirZ; }
                    else if (dist > actor.range * 0.9) { moveX = dirX; moveZ = dirZ; }
                    else { moveX = -dirZ; moveZ = dirX; speedMul = 0.5; }
                  } else if (dist > stopDist) {
                    moveX = dirX;
                    moveZ = dirZ;
                    if (actor.archetype === 'CHARGER' && dist > 6 && dist < 30) speedMul = 1.25;
                  }
                }
              } else {
                // Düşman: sınıfa göre sade ilerleme (kaptan AI B4'te).
                if (actor.archetype === 'KITER') {
                  if (dist < actor.range * 0.55) { moveX = -dirX; moveZ = -dirZ; }
                  else if (dist > actor.range * 0.9) { moveX = dirX; moveZ = dirZ; }
                  else { moveX = -dirZ; moveZ = dirX; speedMul = 0.5; }
                } else if (dist > stopDist) {
                  moveX = dirX;
                  moveZ = dirZ;
                  if (actor.archetype === 'CHARGER' && dist > 6 && dist < 30) speedMul = 1.25;
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

              if (
                dist <= actor.range &&
                actor.attackPhase === 'IDLE' &&
                actor.cooldownTimer <= 0
              ) {
                actor.attackPhase = 'WINDUP';
                actor.attackTimer = actor.isRanged ? 0.5 : 0.3;
              }
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
                  if (o.team === actor.team || o.hp <= 0) continue;
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
        const alliesAlive = actors.filter((a) => a.team === 'ally' && a.hp > 0).length;
        const enemiesAlive = actors.filter((a) => a.team === 'enemy' && a.hp > 0).length;
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
            activeOrder: propsRef.current.activeOrder,
          });
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

      if (!propsRef.current.paused) {
        accumulator = Math.min(accumulator + frameDt, STEP_DT * 6);
        while (accumulator >= STEP_DT) {
          step(STEP_DT);
          accumulator -= STEP_DT;
        }
      }

      // Sancak bezleri rüzgârda dalgalanır (hafif salınım, fazlar bez başına ayrı).
      for (let ci = 0; ci < bannerCloths.length; ci++) {
        bannerCloths[ci].rotation.y = Math.sin(elapsed * 2.3 + ci * 1.7) * 0.22;
        bannerCloths[ci].rotation.x = Math.sin(elapsed * 1.7 + ci * 2.3) * 0.06;
      }

      shadowTimer += frameDt;
      if (shadowTimer >= 0.5) {
        shadowTimer = 0;
        renderer.shadowMap.needsUpdate = true;
      }

      /* Kamera */
      if (player.hp > 0) {
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

      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
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
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded bg-black/45 px-3 py-1 text-[11px] tracking-wide text-[#e8dcc3]">
        Tıkla: nişan kilidi · WASD: sür · Sol tık: saldır · Sağ tık (basılı): blok
      </div>
    </div>
  );
};

export default BattlefieldView;
