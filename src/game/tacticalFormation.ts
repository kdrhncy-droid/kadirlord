/**
 * ============================================================================
 *  TACTICAL FORMATION, DIRECTIONAL PARRY & SPATIAL HASH ENGINE
 *  Bannerlord-inspired F1/F2/F3 division orders, formation slot solver,
 *  4-directional combat parry rules, and O(N) spatial hash grid.
 * ============================================================================
 */

import type { AttackDirection } from './characterAnimator.ts';

export type DivisionId = 'ALL' | 'INFANTRY' | 'ARCHERS' | 'CAVALRY' | 'HORSE_ARCHERS';
export type FormationArrangement = 'LINE' | 'SHIELD_WALL' | 'LOOSE' | 'WEDGE' | 'SQUARE' | 'COLUMN';
export type FormationOrder = 'CHARGE' | 'HOLD_POSITION' | 'FOLLOW_ME' | 'ADVANCE' | 'RETREAT';
export type FireOrder = 'FREE_FIRE' | 'HOLD_FIRE';

export interface FormationSlot {
  /** World X coordinate of the slot */
  x: number;
  /** World Z coordinate of the slot */
  z: number;
  /** World yaw angle (radians) the soldier should face */
  facing: number;
  /** Row index (0 = front rank) */
  rank: number;
  /** Column offset from center */
  file: number;
}

export interface FormationAnchor {
  x: number;
  z: number;
  facing: number;
}

export interface FormationConfig {
  arrangement: FormationArrangement;
  order: FormationOrder;
  fireOrder: FireOrder;
  anchor: FormationAnchor;
}

export interface FormationStatsModifier {
  moveSpeedMultiplier: number;
  rangedDamageTakenMultiplier: number;
  meleeDefenseBonus: number;
  chargeBonusMultiplier: number;
  forceShieldBlock: boolean;
  spacingX: number;
  spacingZ: number;
}

export const FORMATION_ARRANGEMENT_META: Record<
  FormationArrangement,
  {
    label: string;
    shortDesc: string;
    modifier: FormationStatsModifier;
  }
> = {
  LINE: {
    label: 'Çizgi Düzeni',
    shortDesc: 'Dengeli cephe hattı, standart hareket ve dövüş aralığı.',
    modifier: {
      moveSpeedMultiplier: 1.0,
      rangedDamageTakenMultiplier: 1.0,
      meleeDefenseBonus: 0,
      chargeBonusMultiplier: 1.0,
      forceShieldBlock: false,
      spacingX: 1.45,
      spacingZ: 1.35,
    },
  },
  SHIELD_WALL: {
    label: 'Kalkan Duvarı',
    shortDesc: 'Omuz omuza kilitli kalkanlar. Ok hasarını %85 azaltır, hızı düşürür.',
    modifier: {
      moveSpeedMultiplier: 0.62,
      rangedDamageTakenMultiplier: 0.15,
      meleeDefenseBonus: 0.35,
      chargeBonusMultiplier: 0.8,
      forceShieldBlock: true,
      spacingX: 0.86,
      spacingZ: 0.92,
    },
  },
  LOOSE: {
    label: 'Dağınık Düzen',
    shortDesc: 'Geniş aralıklı avcı/okçu dizilimi. Rahat atış açısı ve yüksek hız.',
    modifier: {
      moveSpeedMultiplier: 1.08,
      rangedDamageTakenMultiplier: 0.7,
      meleeDefenseBonus: -0.1,
      chargeBonusMultiplier: 0.9,
      forceShieldBlock: false,
      spacingX: 2.35,
      spacingZ: 2.1,
    },
  },
  WEDGE: {
    label: 'Kama (Üçgen) Düzeni',
    shortDesc: 'Düşman hattını yaran okbaşı hücum dizilimi. Süvari ve şok piyadeleri için.',
    modifier: {
      moveSpeedMultiplier: 1.12,
      rangedDamageTakenMultiplier: 0.95,
      meleeDefenseBonus: 0.1,
      chargeBonusMultiplier: 1.55,
      forceShieldBlock: false,
      spacingX: 1.25,
      spacingZ: 1.2,
    },
  },
  SQUARE: {
    label: 'Kare (Halka) Düzeni',
    shortDesc: 'Dört yöne bakan süvari karşıtı savunma kutusu.',
    modifier: {
      moveSpeedMultiplier: 0.75,
      rangedDamageTakenMultiplier: 0.45,
      meleeDefenseBonus: 0.3,
      chargeBonusMultiplier: 0.7,
      forceShieldBlock: true,
      spacingX: 1.1,
      spacingZ: 1.1,
    },
  },
  COLUMN: {
    label: 'Kolon Düzeni',
    shortDesc: 'Dar ve derin yürüyüş kolu. Hızlı intikal ve flank yarışı.',
    modifier: {
      moveSpeedMultiplier: 1.18,
      rangedDamageTakenMultiplier: 1.1,
      meleeDefenseBonus: -0.05,
      chargeBonusMultiplier: 1.2,
      forceShieldBlock: false,
      spacingX: 1.15,
      spacingZ: 1.6,
    },
  },
};

export const FORMATION_ORDER_LABELS: Record<FormationOrder, string> = {
  HOLD_POSITION: 'Konumu Tut (F1-F1)',
  FOLLOW_ME: 'Beni Takip Et (F1-F2)',
  CHARGE: 'Hücum Et (F1-F3)',
  ADVANCE: 'İlerle (F1-F4)',
  RETREAT: 'Ricat (F1-F5)',
};

/**
 * Computes world-space formation slots around `anchor` for `count` soldiers
 * according to the given Bannerlord `arrangement`.
 */
export interface FormationSlotOptions {
  /** Nefer arası yan aralık (varsayılan: düzen meta değeri). */
  spacingX?: number;
  /** Sıra arası derinlik aralığı (varsayılan: düzen meta değeri). */
  spacingZ?: number;
  /** Cephe genişliği: sıra başına nefer (varsayılan: sayıdan türetilir). */
  maxCols?: number;
}

export function computeFormationSlots(
  count: number,
  anchor: FormationAnchor,
  arrangement: FormationArrangement,
  options?: FormationSlotOptions,
): FormationSlot[] {
  if (count <= 0) return [];
  const slots: FormationSlot[] = [];
  const meta = FORMATION_ARRANGEMENT_META[arrangement].modifier;
  const sx = options?.spacingX ?? meta.spacingX;
  const sz = options?.spacingZ ?? meta.spacingZ;

  // Forward direction in world space: (+sin(facing), +cos(facing))
  const fwdX = Math.sin(anchor.facing);
  const fwdZ = Math.cos(anchor.facing);
  // Right direction in world space: (-cos(facing), +sin(facing))
  const rightX = -Math.cos(anchor.facing);
  const rightZ = Math.sin(anchor.facing);

  if (arrangement === 'WEDGE') {
    // Triangular arrowhead: rank 0 has 1 unit, rank 1 has 2, rank 2 has 3, etc.
    let placed = 0;
    let rank = 0;
    while (placed < count) {
      const unitsInRank = Math.min(rank + 1, count - placed);
      for (let i = 0; i < unitsInRank; i++) {
        const file = i - (unitsInRank - 1) * 0.5;
        const localRight = file * sx;
        const localBack = rank * sz;
        slots.push({
          x: anchor.x + rightX * localRight - fwdX * localBack,
          z: anchor.z + rightZ * localRight - fwdZ * localBack,
          facing: anchor.facing,
          rank,
          file,
        });
        placed++;
      }
      rank++;
    }
    return slots;
  }

  // Standard rectangular ranks (LINE, SHIELD_WALL, LOOSE, SQUARE, COLUMN)
  const derivedMaxCols =
    arrangement === 'COLUMN'
      ? 2
      : arrangement === 'SQUARE'
        ? Math.max(2, Math.ceil(Math.sqrt(count)))
        : arrangement === 'SHIELD_WALL'
          ? Math.max(3, Math.ceil(Math.sqrt(count * 2.5)))
          : arrangement === 'LOOSE'
            ? Math.max(2, Math.ceil(Math.sqrt(count * 1.6)))
            : Math.max(3, Math.ceil(Math.sqrt(count * 2.2)));
  const maxCols = Math.max(1, options?.maxCols ?? derivedMaxCols);

  for (let idx = 0; idx < count; idx++) {
    const rank = Math.floor(idx / maxCols);
    const remainingInRank = Math.min(maxCols, count - rank * maxCols);
    const colInRank = idx % maxCols;
    const file = colInRank - (remainingInRank - 1) * 0.5;

    // Slight stagger on odd ranks in LOOSE formation so back archers have clear line of sight
    const stagger = arrangement === 'LOOSE' && rank % 2 === 1 ? sx * 0.35 : 0;
    const localRight = file * sx + stagger;
    const localBack = rank * sz;

    slots.push({
      x: anchor.x + rightX * localRight - fwdX * localBack,
      z: anchor.z + rightZ * localRight - fwdZ * localBack,
      facing: anchor.facing,
      rank,
      file,
    });
  }

  return slots;
}

export interface ParryEvaluation {
  blocked: boolean;
  blockType: 'SHIELD' | 'WEAPON_PARRY' | 'CHAMBER' | 'NONE';
  damageMultiplier: number;
}

/**
 * Evaluates Bannerlord 4-directional melee block/parry rules:
 * - Shield block covers all 4 directions in the frontal arc (0 damage to health).
 * - Weapon parry (no shield) requires matching the attacker's swing direction
 *   (or chambering with a windup in the same direction).
 */
export function evaluateDirectionalParry(params: {
  attackDir: AttackDirection;
  defenderBlockDir: AttackDirection;
  hasShield: boolean;
  isBlocking: boolean;
  isFacingAttacker: boolean;
  inShieldWall?: boolean;
}): ParryEvaluation {
  const {
    attackDir,
    defenderBlockDir,
    hasShield,
    isBlocking,
    isFacingAttacker,
    inShieldWall = false,
  } = params;

  if (!isFacingAttacker) {
    return { blocked: false, blockType: 'NONE', damageMultiplier: 1.15 }; // flank/back hit bonus
  }

  if (hasShield && (isBlocking || inShieldWall)) {
    return { blocked: true, blockType: 'SHIELD', damageMultiplier: 0 };
  }

  if (isBlocking && !hasShield) {
    if (defenderBlockDir === attackDir) {
      return { blocked: true, blockType: 'WEAPON_PARRY', damageMultiplier: 0 };
    }
    // Wrong parry direction: partial glance
    return { blocked: false, blockType: 'NONE', damageMultiplier: 0.85 };
  }

  return {
    blocked: false,
    blockType: 'NONE',
    damageMultiplier: inShieldWall ? 0.65 : 1.0,
  };
}

/**
 * ============================================================================
 *  O(N) SPATIAL HASH GRID (Foundation for 500v500 Crowd & Skirmish Collisions)
 * ============================================================================
 */
export interface SpatialAgent {
  id: string | number;
  x: number;
  z: number;
  team?: string | number;
  alive?: boolean;
}

export class SpatialHashGrid<T extends SpatialAgent> {
  private readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly buckets = new Map<number, T[]>();

  constructor(cellSize = 4.0) {
    this.cellSize = Math.max(0.5, cellSize);
    this.invCellSize = 1 / this.cellSize;
  }

  private hashCoords(cx: number, cz: number): number {
    // 32-bit integer spatial hash
    return ((cx * 73856093) ^ (cz * 19349663)) | 0;
  }

  clear(): void {
    this.buckets.clear();
  }

  insert(agent: T): void {
    if (agent.alive === false) return;
    const cx = Math.floor(agent.x * this.invCellSize);
    const cz = Math.floor(agent.z * this.invCellSize);
    const key = this.hashCoords(cx, cz);
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    list.push(agent);
  }

  rebuild(agents: readonly T[]): void {
    this.clear();
    for (let i = 0; i < agents.length; i++) {
      this.insert(agents[i]);
    }
  }

  /**
   * Returns all agents within `radius` of `(x, z)`.
   */
  queryRadius(x: number, z: number, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const rSq = radius * radius;
    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCz = Math.floor((z - radius) * this.invCellSize);
    const maxCz = Math.floor((z + radius) * this.invCellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.buckets.get(this.hashCoords(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const item = bucket[i];
          const dx = item.x - x;
          const dz = item.z - z;
          if (dx * dx + dz * dz <= rSq) {
            out.push(item);
          }
        }
      }
    }
    return out;
  }

  /**
   * Finds the closest agent matching an optional predicate within `maxSearchRadius`.
   */
  findNearest(
    x: number,
    z: number,
    maxSearchRadius: number,
    predicate?: (candidate: T) => boolean,
  ): { agent: T; dist: number } | null {
    const candidates = this.queryRadius(x, z, maxSearchRadius);
    let best: T | null = null;
    let bestDistSq = Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (predicate && !predicate(c)) continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = c;
      }
    }

    return best ? { agent: best, dist: Math.sqrt(bestDistSq) } : null;
  }
}
