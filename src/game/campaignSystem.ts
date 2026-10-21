import {
  distanceToNearestRoad,
  getBiomeAt,
  getForestMaskAt,
  getTerrainSlopeAndColorAt,
  groundHeightAt,
} from './mapGen.ts';
import { computeLandPath, isNavigableLandAt, stepAlongLandOnly } from './navigation.ts';
import type { LordAgent, Settlement, TroopRoster } from './rules.ts';

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

/**
 * DefaultPartySpeedCalculatingModel implementation based on Bannerlord's campaign math:
 * - Base Speed = 5.00
 * - Size Effect = 5.00 - (TotalTroops * 0.0075) (with additional army coordination drag for larger forces)
 * - Cavalry Bonus = 3.0 * (C / (I + C)) * D
 * - Herd & Cargo Penalty + Wounded/Prisoner drag + Morale + Terrain/Road/Biome multiplier
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
}): BannerlordSpeedBreakdown {
  const {
    x,
    z,
    totalHealthy,
    cavalryCount,
    woundedCount = 0,
    prisonerCount = 0,
    foodUnits = 24,
    herdAnimals = 0,
    morale = 80,
  } = params;

  const baseSpeed = 5.0;
  const totalPeople = Math.max(1, totalHealthy + woundedCount);

  // 1. Party size coordination penalty: Base 0.0075 per soldier + progressive army drag so 16-man patrols are much faster than 42-man armies
  const sizePenalty = -(totalPeople * 0.018 + Math.max(0, totalPeople - 20) * 0.015);

  // 2. Cavalry & Mounted Footmen bonus: 3 * (C / (I + C)) * D
  const cavRatio = Math.max(0, Math.min(1, cavalryCount / Math.max(1, totalHealthy)));
  const damping = 0.44 / (1 + totalPeople * 0.005);
  const cavalryBonus = 3.0 * cavRatio * damping;

  // 3. Wounded & Prisoner slowdown
  const woundedPrisonerPenalty = -(woundedCount * 0.026 + prisonerCount * 0.02);

  // 4. Herd & Cargo Penalty: (A - T * 1.05) / 10 * 1.05 * D
  const maxManageableAnimals = totalHealthy * 1.05;
  const excessHerd = Math.max(0, herdAnimals - maxManageableAnimals);
  const herdPenalty = (excessHerd / 10) * 1.05 * 0.45;
  const cargoLimit = totalHealthy * 3.5;
  const excessCargo = Math.max(0, foodUnits - cargoLimit);
  const cargoPenalty = Math.min(0.08, foodUnits * 0.001) + excessCargo * 0.018;
  const herdAndCargoPenalty = -(herdPenalty + cargoPenalty);

  // 5. Morale modifier
  const moraleModifier = morale >= 80 ? 0.14 : morale < 45 ? -0.22 : 0;

  // 6. Terrain, Biome & Imperial Road multiplier
  const biome = getBiomeAt(x, z);
  const info = getTerrainSlopeAndColorAt(x, z);
  const forest = getForestMaskAt(x, z);
  const roadDist = distanceToNearestRoad(x, z);
  const onRoad = roadDist < 4.5 && info.height > 0.25;

  let terrainMultiplier = 1.0;
  let terrainLabel = 'Açık Ova';

  if (onRoad) {
    terrainMultiplier = 1.12;
    terrainLabel = 'İmparatorluk Taş Yolu (+%12)';
  } else if (biome === 'NORTH_SNOW_PEAKS' || info.height > 6.5) {
    terrainMultiplier = 0.78;
    terrainLabel = 'Karlı Dağ Geçidi (-%22)';
  } else if (forest > 0.35) {
    terrainMultiplier = 0.76;
    terrainLabel = 'Sık Orman (-%24)';
  } else if (biome === 'SOUTH_DESERT') {
    terrainMultiplier = 0.88;
    terrainLabel = 'Çöl Kumulları (-%12)';
  } else if (info.slope > 0.32) {
    terrainMultiplier = 0.82;
    terrainLabel = 'Engebeli Yamaç (-%18)';
  } else if (biome === 'EAST_STEPPE') {
    terrainMultiplier = 1.04;
    terrainLabel = 'Bozkır Düzlüğü (+%4)';
  }

  const rawPreTerrain =
    baseSpeed +
    sizePenalty +
    cavalryBonus +
    woundedPrisonerPenalty +
    herdAndCargoPenalty +
    moraleModifier;

  const finalSpeed = Number(
    Math.max(1.8, Math.min(6.6, rawPreTerrain * terrainMultiplier)).toFixed(1),
  );

  // Calibrated world units per second at 1x campaign speed
  const worldUnitsPerSecAt1x = Number((finalSpeed * 1.28).toFixed(2));

  return {
    baseSpeed,
    sizePenalty: Number(sizePenalty.toFixed(2)),
    cavalryBonus: Number(cavalryBonus.toFixed(2)),
    woundedPrisonerPenalty: Number(woundedPrisonerPenalty.toFixed(2)),
    herdAndCargoPenalty: Number(herdAndCargoPenalty.toFixed(2)),
    moraleModifier: Number(moraleModifier.toFixed(2)),
    terrainMultiplier: Number(terrainMultiplier.toFixed(2)),
    terrainLabel,
    onRoad,
    finalSpeed,
    worldUnitsPerSecAt1x,
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
  const roster: TroopRoster = lord.roster || {
    militia: Math.max(2, Math.floor(lord.armySize * 0.35)),
    archer: Math.max(2, Math.floor(lord.armySize * 0.28)),
    cavalry: Math.max(1, Math.floor(lord.armySize * 0.22)),
    guard: Math.max(1, Math.floor(lord.armySize * 0.15)),
  };
  const totalHealthy = Math.max(
    0,
    roster.militia + roster.archer + roster.cavalry + roster.guard,
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

  // Pick a new patrol destination settlement if waypoints are empty
  if (route.waypoints.length === 0) {
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

    // Lord moves at their authentic party-size-dependent speed (agile 16-troop parties move noticeably faster than 42-troop heavy armies!)
    const stepSpeed = intel.speedInfo.worldUnitsPerSecAt1x * 0.95 * timeScale;
    const maxStep = stepSpeed * dt;

    if (dist > 0.65) {
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
export function applyLordOrderToRoute(
  lord: LordAgent,
  route: LordLiveRouteState,
  settlements: Settlement[],
  playerPos?: { x: number; z: number },
): void {
  const order = lord.order;
  if (!order) return;

  let targetX: number | null = null;
  let targetZ: number | null = null;
  let key = '';
  let action = route.currentAction;

  if (order.kind === 'HUNT_PLAYER' && playerPos) {
    // 16 birimlik ızgaraya yuvarla: her karede yeni A* hesaplanmasın.
    const qx = Math.round(playerPos.x / 16) * 16;
    const qz = Math.round(playerPos.z / 16) * 16;
    targetX = qx;
    targetZ = qz;
    key = `hunt:${qx}:${qz}`;
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
      targetX = target.x + 4.5;
      targetZ = target.z + 4.5;
      key = `set:${target.id}`;
      action =
        order.kind === 'SIEGE'
          ? `${target.name} kuşatma hattına ilerliyor`
          : order.kind === 'DEFEND'
            ? `${target.name} savunmasına koşuyor`
            : order.kind === 'REINFORCE'
              ? `${target.name} garnizonunda asker topluyor`
              : `${target.name} bölgesini denetliyor`;
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
