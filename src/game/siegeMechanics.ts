import type { LordAgent, Settlement, SiegeEngineType } from './rules';

export const SIEGE_CAMP_STANDOFF = 23;
export const SIEGE_CAMP_SLOT_ANGLE_STEP = 0.32; // ~18.3° (yarım ay yay aralığı)
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

export function getWallSections(
  settlement: Pick<Settlement, 'wallHealth' | 'wallSections'>,
): [number, number] {
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

export function wallBreached(
  settlement: Pick<Settlement, 'wallHealth' | 'wallSections'>,
): boolean {
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
 * Kuşatan ordunun kale/şehir merkezine girmek yerine önünde duracağı merkez kamp noktası.
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

/**
 * Bir yerleşimi birden fazla lord aynı anda kuşattığında üst üste binmemeleri için
 * `SIEGE_CAMP_STANDOFF = 23` yarıçaplı çember üzerinde `±18°` (`0.32 rad`) açısal
 * aralıklarla yarım ay (yay) şeklinde yuva koordinatı döndürür.
 *
 * - `slotIndex = 0` → merkez komutan (`baseAngle`)
 * - `slotIndex = 1` → sağ kanat 1 (`baseAngle + 0.32`)
 * - `slotIndex = 2` → sol kanat 1 (`baseAngle - 0.32`)
 * - `slotIndex = 3` → sağ kanat 2 (`baseAngle + 0.64`)
 * - `slotIndex = 4` → sol kanat 2 (`baseAngle - 0.64`)
 */
export function getSiegeCampSlotPoint(
  settlement: Pick<Settlement, 'x' | 'z'>,
  approachFromX?: number,
  approachFromZ?: number,
  slotIndex = 0,
  _totalBesiegers = 1,
): { x: number; z: number; angle: number; slotIndex: number } {
  const dx = (approachFromX ?? settlement.x + 1) - settlement.x;
  const dz = (approachFromZ ?? settlement.z) - settlement.z;
  const dist = Math.hypot(dx, dz);
  const baseAngle = dist > 0.001 ? Math.atan2(dz, dx) : 0;

  const safeSlot = Math.max(0, Math.floor(slotIndex));
  const wingStep = Math.ceil(safeSlot / 2);
  const wingSign = safeSlot === 0 ? 0 : safeSlot % 2 === 1 ? 1 : -1;
  const angle = baseAngle + wingStep * SIEGE_CAMP_SLOT_ANGLE_STEP * wingSign;

  return {
    x: Math.max(-505, Math.min(505, settlement.x + Math.cos(angle) * SIEGE_CAMP_STANDOFF)),
    z: Math.max(-375, Math.min(375, settlement.z + Math.sin(angle) * SIEGE_CAMP_STANDOFF)),
    angle,
    slotIndex: safeSlot,
  };
}

/**
 * Bir yerleşimi kuşatan tüm lordlara deterministik olarak `slotIndex = 0..N`
 * yay yuvalarını atar. Oyuncu da dışarıdan kuşatıyorsa `slotIndex = 0` oyuncuya
 * verilir ve müttefik/ordu lordları `1..N` kanatlarına dizilir.
 */
export function getBesiegerSlotAssignments(
  settlement: Pick<Settlement, 'x' | 'z'>,
  besiegers: readonly Pick<LordAgent, 'id' | 'x' | 'z'>[],
  options?: {
    playerBesieging?: boolean;
    playerX?: number;
    playerZ?: number;
    livePositions?: Map<string, { x: number; z: number }> | Record<string, { x: number; z: number }>;
  },
): Map<string, { x: number; z: number; angle: number; slotIndex: number }> {
  const result = new Map<string, { x: number; z: number; angle: number; slotIndex: number }>();
  if (besiegers.length === 0) return result;

  const resolvePos = (lord: Pick<LordAgent, 'id' | 'x' | 'z'>) => {
    const live = options?.livePositions;
    if (!live) return { x: lord.x, z: lord.z };
    if (live instanceof Map) return live.get(lord.id) ?? { x: lord.x, z: lord.z };
    return live[lord.id] ?? { x: lord.x, z: lord.z };
  };

  const firstLordPos = resolvePos(besiegers[0]);
  const anchorX = options?.playerBesieging
    ? (options.playerX ?? firstLordPos.x)
    : firstLordPos.x;
  const anchorZ = options?.playerBesieging
    ? (options.playerZ ?? firstLordPos.z)
    : firstLordPos.z;

  const slotOffset = options?.playerBesieging ? 1 : 0;
  const totalCount = besiegers.length + slotOffset;

  besiegers.forEach((lord, idx) => {
    const slotIndex = idx + slotOffset;
    const pt = getSiegeCampSlotPoint(settlement, anchorX, anchorZ, slotIndex, totalCount);
    result.set(lord.id, pt);
  });

  return result;
}
