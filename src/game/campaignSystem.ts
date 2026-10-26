import {
  distanceToNearestRoad,
  getBiomeAt,
  getForestMaskAt,
  getTerrainSlopeAndColorAt,
  groundHeightAt,
} from './mapGen.ts';
import {
  type HostileReactionKind,
  evaluateHostileReaction,
  isHostileToPlayer,
} from './encounter.ts';
import { computeLandPath, isNavigableLandAt, stepAlongLandOnly } from './navigation.ts';
import { factionHasHorseArchers } from './rules.ts';
import type { LordAgent, Settlement, TroopRoster } from './rules.ts';
import { getArmyEscortSlotPoint } from './armySystem.ts';
import { getSiegeCampPoint, getSiegeCampSlotPoint } from './siegeMechanics.ts';

export interface BannerlordSpeedBreakdown {
  baseSpeed: number;
  sizePenalty: number;
  cavalryBonus: number;
  woundedPrisonerPenalty: number;
  herdAndCargoPenalty: number;
  moraleModifier: number;
  terrainMultiplier: number;
  terrainLabel: string;
  onRoad: boolean;
  finalSpeed: number;
  worldUnitsPerSecAt1x: number;
}

export interface LordDetailedIntel {
  totalHealthy: number;
  wounded: number;
  prisoners: number;
  roster: TroopRoster;
  cavalryRatio: number;
  morale: number;
  foodDays: number;
  currentAction: string;
  speedInfo: BannerlordSpeedBreakdown;
}

import { calculatePartyLogistics } from './logistics.ts';
import type { InventoryItem, CampaignState } from './rules.ts';

/**
 * DefaultPartySpeedCalculatingModel implementation delegating to the unified logistics model:
 * - Base Speed = 5.00
 * - Size Effect = 5.00 - (TotalTroops * 0.018 + coordination drag)
 * - Cavalry & Mounted Footmen Bonus
 * - Herd & Overburden Penalty + Wounded/Prisoner drag + Morale + Terrain/Road/Biome multiplier
 */
export function calculateBannerlordPartySpeed(params: {
  x: number;
  z: number;
  totalHealthy: number;
  cavalryCount: number;
  woundedCount?: number;
  prisonerCount?: number;
  foodUnits?: number;
  herdAnimals?: number;
  morale?: number;
  inventoryItems?: InventoryItem[];
  perks?: string[];
  state?: Pick<CampaignState, 'customItemDefinitions'>;
  culture?: string | null;
}): BannerlordSpeedBreakdown {
  const result = calculatePartyLogistics({
    x: params.x,
    z: params.z,
    healthyTroops: params.totalHealthy,
    cavalryCount: params.cavalryCount,
    woundedCount: params.woundedCount,
    prisonerCount: params.prisonerCount,
    inventoryItems: params.inventoryItems,
    morale: params.morale,
    perks: params.perks,
    state: params.state,
    culture: params.culture,
    legacyFoodUnits: params.foodUnits,
    legacyHerdAnimals: params.herdAnimals,
  });

  return {
    baseSpeed: result.baseSpeed,
    sizePenalty: result.sizePenalty,
    cavalryBonus: result.cavalryBonus,
    woundedPrisonerPenalty: Number((result.woundedPenalty + result.prisonerPenalty).toFixed(2)),
    herdAndCargoPenalty: Number((result.herdPenalty + result.overburdenPenalty).toFixed(2)),
    moraleModifier: result.moraleModifier,
    terrainMultiplier: result.terrainMultiplier,
    terrainLabel: result.terrainLabel,
    onRoad: result.onRoad,
    finalSpeed: result.finalSpeed,
    worldUnitsPerSecAt1x: result.worldUnitsPerSecAt1x,
  };
}

/**
 * Computes detailed Bannerlord party composition, wounded, prisoners, current AI task, and dynamic speed for any LordAgent.
 */
export function getLordDetailedIntel(
  lord: LordAgent,
  liveX = lord.x,
  liveZ = lord.z,
  settlements: Settlement[] = [],
  liveAction?: string,
): LordDetailedIntel {
  const seed = lord.id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const horseArcherShare = Math.max(1, Math.floor(lord.armySize * 0.15));
  const hasHorseArchers = factionHasHorseArchers(lord.faction);
  const roster: TroopRoster = lord.roster || {
    infantry:
      Math.max(2, Math.floor(lord.armySize * 0.35)) + (hasHorseArchers ? 0 : horseArcherShare),
    archer: Math.max(2, Math.floor(lord.armySize * 0.28)),
    cavalry: Math.max(1, Math.floor(lord.armySize * 0.22)),
    horseArcher: hasHorseArchers ? horseArcherShare : 0,
  };
  const totalHealthy = Math.max(
    0,
    roster.infantry + roster.archer + roster.cavalry + roster.horseArcher,
  );

  const wounded = lord.wounded ?? ((seed % 4) + (totalHealthy >= 34 ? 3 : 1));
  const prisoners = lord.prisoners ?? ((seed % 6) + (lord.isAtWarWithPlayer ? 3 : 1));
  const morale = lord.morale ?? (75 + (seed % 16));
  const foodDays = lord.foodDays ?? (9 + (seed % 10));

  let currentAction = liveAction || lord.currentAction;
  if (!currentAction && settlements.length > 0) {
    let nearestName = 'Sınır Hattı';
    let bestDist = Infinity;
    for (let i = 0; i < settlements.length; i++) {
      const s = settlements[i];
      if (s.type === 'VILLAGE') continue;
      const d = Math.hypot(s.x - liveX, s.z - liveZ);
      if (d < bestDist) {
        bestDist = d;
        nearestName = s.name;
      }
    }
    currentAction = `${nearestName} çevresinde devriye geziyor`;
  }

  const speedInfo = calculateBannerlordPartySpeed({
    x: liveX,
    z: liveZ,
    totalHealthy,
    cavalryCount: roster.cavalry,
    woundedCount: wounded,
    prisonerCount: prisoners,
    foodUnits: foodDays * 2,
    morale,
  });

  return {
    totalHealthy,
    wounded,
    prisoners,
    roster,
    cavalryRatio: roster.cavalry / Math.max(1, totalHealthy),
    morale,
    foodDays,
    currentAction,
    speedInfo,
  };
}

/**
 * Dynamic Spotting / Vision Range (Fog of War) based on elevation, forest cover, and scouting cavalry.
 * High elevation significantly expands spotting range into valleys, while dense forest reduces it.
 */
export function computePlayerSpottingRange(
  playerX: number,
  playerZ: number,
  roster: TroopRoster,
): number {
  const elev = Math.max(0, groundHeightAt(playerX, playerZ));
  const forest = getForestMaskAt(playerX, playerZ);
  const baseRange = 135;
  const elevationBonus = Math.min(65, Math.max(0, elev - 1.8) * 7.5);
  const scoutingBonus = Math.min(28, roster.cavalry * 2.4 + roster.archer * 0.8);
  const forestCoverPenalty = forest * 16;

  return Math.round(baseRange + elevationBonus + scoutingBonus - forestCoverPenalty);
}

/**
 * Checks if a world coordinate (Lord or Settlement detail) is within the player's current spotting range.
 */
export function isWithinSpottingRange(
  playerX: number,
  playerZ: number,
  targetX: number,
  targetZ: number,
  spottingRange: number,
): boolean {
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  return dx * dx + dz * dz <= spottingRange * spottingRange;
}

export interface LordLiveRouteState {
  x: number;
  z: number;
  rotY: number;
  targetSettlementId: string | null;
  waypoints: Array<{ x: number; z: number }>;
  currentAction: string;
  /** Faz 11: uygulanan emrin anahtarı (aynı emir için yeniden A* yapılmaz). */
  orderKey?: string;
  /** Gerçek zamanlı kovalama / kaçma durumu (harita rozetleri ve animasyon hızı için). */
  tacticalState?: 'PURSUE' | 'FLEE' | null;
  /**
   * Sıkışma bekçisi: rota noktası varken net ilerleme yoksa (kıyıda kayma
   * salınımı vb.) geçen sim süresi; eşik aşılınca mevcut rota noktası
   * atlanır, birlik sonsuza dek aynı yerde takılı kalmaz.
   */
  stuckWatch?: { x: number; z: number; elapsed: number };
}

/**
 * Advances a Lord party along authentic land routes between settlements at a speed determined by their party size & cavalry ratio.
 */
export function stepLordCampaignRoute(
  lord: LordAgent,
  route: LordLiveRouteState,
  dt: number,
  timeScale: number,
  settlements: Settlement[],
): void {
  if (timeScale <= 0 || dt <= 0) return;

  const intel = getLordDetailedIntel(
    lord,
    route.x,
    route.z,
    settlements,
    route.currentAction,
  );

  // Pick a new patrol destination settlement if waypoints are empty (never override an active SIEGE camp!)
  if (route.waypoints.length === 0 && lord.order?.kind !== 'SIEGE') {
    const candidateSettlements = settlements.filter(
      (s) =>
        (lord.faction === 'bandits' ? s.type === 'VILLAGE' : s.faction === lord.faction) &&
        Math.hypot(s.x - route.x, s.z - route.z) > 15 &&
        Math.hypot(s.x - route.x, s.z - route.z) < 155,
    );

    const pool =
      candidateSettlements.length > 0
        ? candidateSettlements
        : settlements.filter(
            (s) =>
              Math.hypot(s.x - route.x, s.z - route.z) > 12 &&
              Math.hypot(s.x - route.x, s.z - route.z) < 120,
          );

    if (pool.length > 0) {
      const pickIdx =
        Math.abs(Math.floor(route.x * 13 + route.z * 17 + lord.armySize * 7)) % pool.length;
      const dest = pool[pickIdx];
      route.targetSettlementId = dest.id;
      const gateX = dest.x + (pickIdx % 2 === 0 ? 1 : -1) * 4.5;
      const gateZ = dest.z + 4.5;
      route.waypoints = computeLandPath(route.x, route.z, gateX, gateZ);
      route.currentAction =
        lord.faction === 'bandits'
          ? `${dest.name} civarında kervan kolluyor`
          : dest.type === 'VILLAGE'
            ? `${dest.name} köyünü denetlemeye gidiyor`
            : `${dest.name} garnizonuna doğru ilerliyor`;
    } else {
      const angle = (Date.now() * 0.001 + lord.armySize) % 6.28;
      const tx = route.x + Math.cos(angle) * 24;
      const tz = route.z + Math.sin(angle) * 24;
      if (isNavigableLandAt(tx, tz)) {
        route.waypoints = [{ x: tx, z: tz }];
      }
    }
  }

  if (route.waypoints.length > 0) {
    const nextWp = route.waypoints[0];
    const dx = nextWp.x - route.x;
    const dz = nextWp.z - route.z;
    const dist = Math.hypot(dx, dz);

    // Kovalama veya kaçma sırasında birlikler tam kapasite (%100-104) hızla hareket eder
    const urgencyMult =
      route.tacticalState === 'PURSUE'
        ? 1.04
        : route.tacticalState === 'FLEE'
          ? 1.02
          : 0.95;
    const stepSpeed = intel.speedInfo.worldUnitsPerSecAt1x * urgencyMult * timeScale;
    const maxStep = stepSpeed * dt;

    // Kovalama hedefinde (oyuncunun üstüne yürürken) 0.65m eşiği yüzünden erken durmasın
    const wpStopThreshold = route.tacticalState === 'PURSUE' ? 0.15 : 0.65;

    if (dist > wpStopThreshold) {
      const nextPos = stepAlongLandOnly(
        route.x,
        route.z,
        nextWp.x,
        nextWp.z,
        Math.min(dist, maxStep),
      );
      const movedDx = nextPos.x - route.x;
      const movedDz = nextPos.z - route.z;
      if (Math.hypot(movedDx, movedDz) > 0.001) {
        route.rotY = Math.atan2(movedDx, movedDz);
        route.x = nextPos.x;
        route.z = nextPos.z;
      } else {
        route.waypoints.shift();
      }
    } else {
      route.waypoints.shift();
    }

    // Sıkışma bekçisi: stepAlongLandOnly kıyıda teğet kaymasıyla her
    // karede minik ama net ilerlemesiz hareket üretebilir; bu durumda
    // shift() hiç tetiklenmez ve birlik aynı noktada salınır. 4 sim
    // saniyesinde 2 birimden az net yol alındıysa rota noktasını atla.
    const watch = (route.stuckWatch ??= { x: route.x, z: route.z, elapsed: 0 });
    if (Math.hypot(route.x - watch.x, route.z - watch.z) > 2) {
      watch.x = route.x;
      watch.z = route.z;
      watch.elapsed = 0;
    } else {
      watch.elapsed += dt * timeScale;
      if (watch.elapsed > 4) {
        route.waypoints.shift();
        watch.x = route.x;
        watch.z = route.z;
        watch.elapsed = 0;
      }
    }
  }
}

/* ─────────────────── Faz 11: stratejik emir → rota ─────────────────── */

/**
 * Lord'un stratejik emrini (`lord.order`) harita rotasına çevirir.
 *
 * Faz 11'de emirleri **dünya simülasyonu** (`worldSim.ts`) yazar; harita katmanı
 * (ve başsız testler) yalnızca bu fonksiyonu çağırır. Böylece "lord nereye gidiyor"
 * mantığı tek yerde kalır ve Node üzerinde de aynı şekilde test edilebilir.
 *
 * Emir değişmediyse rota korunur (her karede A* çalışmaz).
 */
export interface ApplyLordOrderOptions {
  /** Yerleşimi kuşatan diğer lordlarla çakışmamak için yuva indeksi (0 = merkez, 1 = sağ kanat, 2 = sol kanat...). */
  siegeSlotIndex?: number;
  totalBesiegers?: number;
  siegeAnchorPos?: { x: number; z: number };
  /** Oyuncunun ordusuna bağlı üye lord ise eskort indeks numarası. */
  armyEscortIndex?: number;
  armyLeaderFacing?: number;
}

export function applyLordOrderToRoute(
  lord: LordAgent,
  route: LordLiveRouteState,
  settlements: Settlement[],
  playerPos?: { x: number; z: number },
  options?: ApplyLordOrderOptions,
): void {
  // Oyuncu ordusuna bağlı üye lord (kuşatma emri yoksa komutanın eskort hattında yürür)
  if (
    options?.armyEscortIndex !== undefined &&
    options.armyEscortIndex >= 0 &&
    playerPos &&
    lord.order?.kind !== 'SIEGE'
  ) {
    const escortPt = getArmyEscortSlotPoint(
      playerPos.x,
      playerPos.z,
      options.armyLeaderFacing ?? 0,
      options.armyEscortIndex,
    );
    const qx = Math.round(escortPt.x * 2) / 2;
    const qz = Math.round(escortPt.z * 2) / 2;
    const key = `army-escort:${options.armyEscortIndex}:${qx}:${qz}`;
    const dist = Math.hypot(route.x - escortPt.x, route.z - escortPt.z);
    route.currentAction =
      dist <= 12
        ? 'Ordu sancağı altında eskort düzeninde ilerliyor'
        : 'Ordu sancağına katılmak üzere hızla ilerliyor';

    if (route.orderKey !== key || route.waypoints.length === 0) {
      route.orderKey = key;
      if (dist <= 20) {
        route.waypoints = [{ x: escortPt.x, z: escortPt.z }];
      } else {
        route.waypoints = computeLandPath(route.x, route.z, escortPt.x, escortPt.z);
      }
    }
    return;
  }

  const order = lord.order;
  if (!order) return;

  let targetX: number | null = null;
  let targetZ: number | null = null;
  let key = '';
  let action = route.currentAction;

  if (order.kind === 'HUNT_PLAYER' && playerPos) {
    const dPlayer = Math.hypot(route.x - playerPos.x, route.z - playerPos.z);
    if (dPlayer <= 20) {
      // Yakın mesafede ızgaraya yuvarlama yapma, doğrudan oyuncunun konumuna kilitlen!
      const qx = Math.round(playerPos.x * 2) / 2;
      const qz = Math.round(playerPos.z * 2) / 2;
      targetX = playerPos.x;
      targetZ = playerPos.z;
      key = `hunt-close:${qx}:${qz}`;
    } else {
      const qx = Math.round(playerPos.x / 16) * 16;
      const qz = Math.round(playerPos.z / 16) * 16;
      targetX = qx;
      targetZ = qz;
      key = `hunt:${qx}:${qz}`;
    }
    action = 'Sancağını senin üzerine sürüyor';
  } else if (order.kind === 'FLEE' && playerPos) {
    const dx = route.x - playerPos.x;
    const dz = route.z - playerPos.z;
    const len = Math.hypot(dx, dz) || 1;
    targetX = route.x + (dx / len) * 40;
    targetZ = route.z + (dz / len) * 40;
    key = `flee:${Math.round(targetX / 20)}:${Math.round(targetZ / 20)}`;
    action = 'Geri çekiliyor';
  } else if (order.targetSettlementId) {
    const target = settlements.find((s) => s.id === order.targetSettlementId);
    if (target) {
      if (order.kind === 'SIEGE') {
        const slotIdx = options?.siegeSlotIndex ?? 0;
        const totalBesiegers = options?.totalBesiegers ?? 1;
        const anchorX = options?.siegeAnchorPos?.x ?? route.x;
        const anchorZ = options?.siegeAnchorPos?.z ?? route.z;
        const campSlot =
          slotIdx > 0 || totalBesiegers > 1
            ? getSiegeCampSlotPoint(target, anchorX, anchorZ, slotIdx, totalBesiegers)
            : getSiegeCampPoint(target, route.x, route.z);
        targetX = campSlot.x;
        targetZ = campSlot.z;
        key = `set:${target.id}:slot:${slotIdx}`;
        const distToSlot = Math.hypot(route.x - targetX, route.z - targetZ);
        if (distToSlot <= 1.25) {
          route.x = targetX;
          route.z = targetZ;
          route.rotY = Math.atan2(target.x - route.x, target.z - route.z);
          route.waypoints = [];
          route.orderKey = key;
          route.targetSettlementId = target.id;
          route.currentAction = `${target.name} kuşatma çemberinde bekliyor`;
          return;
        }
        action = `${target.name} kuşatma hattına ilerliyor`;
      } else if (order.kind === 'DEFEND' && options?.siegeAnchorPos) {
        targetX = options.siegeAnchorPos.x;
        targetZ = options.siegeAnchorPos.z;
        key = `defend-siege:${target.id}:${Math.round(targetX / 4)}:${Math.round(targetZ / 4)}`;
        action = `${target.name} kuşatmasını yarmak için yardıma koşuyor`;
      } else {
        targetX = target.x + 4.5;
        targetZ = target.z + 4.5;
        key = `set:${target.id}`;
        // "Asker topluyor" ancak varış noktasındayken doğrudur; yoldayken
        // aynı metin yazılıyordu ve lord yolda (örn. açlıktan) asker
        // kaybederse oyuncuya "topluyor ama azalıyor" görünüyordu.
        const distToGate = Math.hypot(route.x - targetX, route.z - targetZ);
        action =
          order.kind === 'DEFEND'
            ? `${target.name} savunmasına koşuyor`
            : order.kind === 'REINFORCE'
              ? distToGate <= 7
                ? `${target.name} garnizonunda asker topluyor`
                : `${target.name} garnizonuna takviye almaya gidiyor`
              : `${target.name} bölgesini denetliyor`;
      }
    }
  }

  if (targetX === null || targetZ === null) return;

  if (route.orderKey !== key || route.waypoints.length === 0) {
    route.orderKey = key;
    route.targetSettlementId = order.targetSettlementId ?? null;
    route.currentAction = action;
    route.waypoints = computeLandPath(route.x, route.z, targetX, targetZ);
  } else if (route.currentAction !== action) {
    route.currentAction = action;
  }
}

/**
 * Gerçek zamanlı oyuncu kovalama (`PURSUE_PLAYER`) ve oyuncudan kaçma (`FLEE_FROM_PLAYER`)
 * davranışını lordun canlı rotasına uygular.
 */
export function applyTacticalPlayerReactionToRoute(params: {
  lord: LordAgent;
  route: LordLiveRouteState;
  settlements: Settlement[];
  playerX: number;
  playerZ: number;
  playerStrength: number;
  nearbyHostileStrength?: number;
  onCooldown?: boolean;
  siegeDefenderStrength?: number;
  totalBesiegerStrength?: number;
  routeOptions?: ApplyLordOrderOptions;
}): HostileReactionKind {
  const {
    lord,
    route,
    settlements,
    playerX,
    playerZ,
    playerStrength,
    nearbyHostileStrength = 0,
    onCooldown = false,
    siegeDefenderStrength = 0,
    totalBesiegerStrength,
    routeOptions,
  } = params;

  // Karşılaşma dokunulmazlığı (cooldown) aktifse düşman oyuncudan uzaklaşır
  if (onCooldown && isHostileToPlayer(lord)) {
    const dx = route.x - playerX;
    const dz = route.z - playerZ;
    const len = Math.hypot(dx, dz) || 1;
    const tx = route.x + (dx / len) * 18;
    const tz = route.z + (dz / len) * 18;
    const key = `cooldown-retreat:${Math.round(tx / 6)}:${Math.round(tz / 6)}`;
    route.tacticalState = 'FLEE';
    route.currentAction = 'Mesafeyi açıyor';
    if (route.orderKey !== key || route.waypoints.length === 0) {
      route.orderKey = key;
      route.waypoints = [{ x: tx, z: tz }];
    }
    return 'FLEE_FROM_PLAYER';
  }

  const reaction = evaluateHostileReaction({
    lord,
    lordX: route.x,
    lordZ: route.z,
    playerX,
    playerZ,
    playerStrength,
    nearbyHostileStrength,
    siegeDefenderStrength,
    totalBesiegerStrength,
  });

  if (reaction.kind === 'PURSUE_PLAYER' && reaction.targetPos) {
    route.tacticalState = 'PURSUE';
    route.currentAction = reaction.actionLabel;
    // Yakın takipte (<= 22m) doğrudan oyuncunun canlı konumuna yürü (16m ızgaraya takılma!)
    if (reaction.distance <= 22) {
      route.orderKey = `pursue-direct:${Math.round(playerX)}:${Math.round(playerZ)}`;
      route.waypoints = [{ x: playerX, z: playerZ }];
    } else {
      const qx = Math.round(reaction.targetPos.x / 3) * 3;
      const qz = Math.round(reaction.targetPos.z / 3) * 3;
      const key = `pursue-path:${qx}:${qz}`;
      if (route.orderKey !== key || route.waypoints.length === 0) {
        route.orderKey = key;
        route.waypoints = computeLandPath(route.x, route.z, reaction.targetPos.x, reaction.targetPos.z);
      }
    }
    return 'PURSUE_PLAYER';
  }

  if (reaction.kind === 'FLEE_FROM_PLAYER' && reaction.targetPos) {
    route.tacticalState = 'FLEE';
    route.currentAction = reaction.actionLabel;
    const qx = Math.round(reaction.targetPos.x / 4) * 4;
    const qz = Math.round(reaction.targetPos.z / 4) * 4;
    const key = `flee-player:${qx}:${qz}`;
    if (route.orderKey !== key || route.waypoints.length === 0) {
      route.orderKey = key;
      route.waypoints = computeLandPath(route.x, route.z, reaction.targetPos.x, reaction.targetPos.z);
      if (route.waypoints.length === 0) {
        route.waypoints = [{ x: reaction.targetPos.x, z: reaction.targetPos.z }];
      }
    }
    return 'FLEE_FROM_PLAYER';
  }

  // Normal devriye veya stratejik emir
  if (route.tacticalState) {
    route.tacticalState = null;
    route.orderKey = undefined;
  }
  applyLordOrderToRoute(lord, route, settlements, { x: playerX, z: playerZ }, routeOptions);
  return 'PATROL';
}
