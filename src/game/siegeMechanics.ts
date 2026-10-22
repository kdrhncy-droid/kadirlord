import type { Settlement, SiegeEngineType } from './rules';

export const SIEGE_CAMP_STANDOFF = 23;
export const SIEGE_RANGED_SLOTS = 4;
export const SIEGE_MELEE_SLOTS = 3;

const RANGED_ENGINES: ReadonlySet<SiegeEngineType> = new Set([
  'TREBUCHET',
  'MANGONEL',
  'BALLISTA',
]);

export function isRangedSiegeEngine(engine: SiegeEngineType): boolean {
  return RANGED_ENGINES.has(engine);
}

export function getWallSections(settlement: Pick<Settlement, 'wallHealth' | 'wallSections'>): [number, number] {
  const fallback = Math.max(0, Math.min(100, Math.round(settlement.wallHealth ?? 100)));
  const raw = settlement.wallSections;
  if (!raw || raw.length < 2) return [fallback, fallback];
  return [
    Math.max(0, Math.min(100, Math.round(Number.isFinite(raw[0]) ? raw[0] : fallback))),
    Math.max(0, Math.min(100, Math.round(Number.isFinite(raw[1]) ? raw[1] : fallback))),
  ];
}

export function setWallSections<T extends Pick<Settlement, 'wallHealth' | 'wallSections'>>(
  settlement: T,
  sections: [number, number],
): T {
  const left = Math.max(0, Math.min(100, Math.round(sections[0])));
  const right = Math.max(0, Math.min(100, Math.round(sections[1])));
  return {
    ...settlement,
    wallSections: [left, right],
    wallHealth: Math.round((left + right) / 2),
  };
}

export function wallBreached(settlement: Pick<Settlement, 'wallHealth' | 'wallSections'>): boolean {
  const [left, right] = getWallSections(settlement);
  return left <= 0 || right <= 0;
}

export function countSiegeEngineSlots(engines: readonly SiegeEngineType[] = []): {
  ranged: number;
  rams: number;
  towers: number;
  melee: number;
} {
  let ranged = 0;
  let rams = 0;
  let towers = 0;
  for (const engine of engines) {
    if (isRangedSiegeEngine(engine)) ranged++;
    else if (engine === 'BATTERING_RAM') rams++;
    else if (engine === 'SIEGE_TOWER') towers++;
  }
  return { ranged, rams, towers, melee: rams + towers };
}

export function canFitSiegeEngine(
  engines: readonly SiegeEngineType[] = [],
  candidate: SiegeEngineType,
): boolean {
  const counts = countSiegeEngineSlots(engines);
  if (isRangedSiegeEngine(candidate)) {
    return counts.ranged < SIEGE_RANGED_SLOTS;
  }
  if (counts.melee >= SIEGE_MELEE_SLOTS) {
    return false;
  }
  if (candidate === 'BATTERING_RAM' && counts.rams >= 1) {
    return false;
  }
  if (candidate === 'SIEGE_TOWER' && counts.towers >= 2) {
    return false;
  }
  return true;
}

export function normalizeSiegeEngineSlots(
  activeEngines: readonly SiegeEngineType[] = [],
  reserveEngines: readonly SiegeEngineType[] = [],
): { siegeEngines: SiegeEngineType[]; reserveEngines: SiegeEngineType[] } {
  const siegeEngines: SiegeEngineType[] = [];
  const nextReserve: SiegeEngineType[] = [...reserveEngines];
  for (const engine of activeEngines) {
    if (canFitSiegeEngine(siegeEngines, engine)) {
      siegeEngines.push(engine);
    } else {
      nextReserve.push(engine);
    }
  }
  return { siegeEngines, reserveEngines: nextReserve };
}

export function removeDestroyedSiegeEngines<
  T extends Pick<Settlement, 'siegeEngines' | 'siegeEngineHp'>,
>(settlement: T): T {
  const engines = settlement.siegeEngines ?? [];
  const hpList = settlement.siegeEngineHp ?? [];
  const keptEngines: SiegeEngineType[] = [];
  const keptHp: number[] = [];
  engines.forEach((engine, index) => {
    const hp = Math.max(0, Math.min(100, Math.round(hpList[index] ?? 100)));
    if (hp > 0) {
      keptEngines.push(engine);
      keptHp.push(hp);
    }
  });
  return {
    ...settlement,
    siegeEngines: keptEngines,
    siegeEngineHp: keptHp,
  };
}

/**
 * Kuşatan ordunun kale/şehir merkezine girmek yerine önünde duracağı kamp noktası.
 */
export function getSiegeCampPoint(
  settlement: Pick<Settlement, 'x' | 'z'>,
  approachFromX?: number,
  approachFromZ?: number,
): { x: number; z: number } {
  const dx = (approachFromX ?? settlement.x + 1) - settlement.x;
  const dz = (approachFromZ ?? settlement.z) - settlement.z;
  const dist = Math.hypot(dx, dz);
  const ux = dist > 0.001 ? dx / dist : 1;
  const uz = dist > 0.001 ? dz / dist : 0;
  return {
    x: Math.max(-505, Math.min(505, settlement.x + ux * SIEGE_CAMP_STANDOFF)),
    z: Math.max(-375, Math.min(375, settlement.z + uz * SIEGE_CAMP_STANDOFF)),
  };
}
