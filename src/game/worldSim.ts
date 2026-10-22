/**
 * worldSim.ts — Faz 11: CANLI DÜNYA (günlük stratejik simülasyon)
 *
 * Bannerlord'da kampanya haritası kendi kendine yaşar: krallıklar savaş ilan eder,
 * lordlar kuşatmaya gider, kaleler el değiştirir, vakayiname (chronicle) olaylarla dolar.
 * Bu modül o döngünün **saf** (DOM'suz, React'siz) çekirdeğidir:
 *
 *   ekonomi → diplomasi (savaş/barış) → lord emirleri (FSM) → kuşatmalar →
 *   fetih → takviye/iaşe → vakayiname
 *
 * Tasarım kuralları:
 *  - **Deterministik:** `Math.random()` / `Date.now()` yok; tohum `world.seed ^ gün`.
 *  - **Saf:** girdi durumu değiştirilmez; yeni durum + olay listesi döner.
 *  - **Test edilebilir:** her adım ayrı dışa aktarılır (`assignLordOrders`, `advanceSieges`…).
 *  - **Harita görünümüne bağımlı değil:** lord konumları dışarıdan verilir; verilmezse
 *    `LordAgent.x/z` kullanılır (kayıt yüklendiğinde de çalışsın).
 */
import {
  CampaignState,
  ChronicleEvent,
  EMPTY_WORLD_STATS,
  FACTION_INFO,
  FactionId,
  LordAgent,
  LordOrder,
  Settlement,
  WorldStats,
  WorldState,
  advanceDailyEconomyAndWorld,
  getSettlementArrivalRadius,
  getTotalTroops,
} from './rules';
import { SIEGE_CAMP_STANDOFF } from './siegeMechanics';
import { advanceArmiesDaily, getPlayerArmy } from './armySystem';
import {
  evaluateSiegeThreatReaction,
  getLordPartyStrength,
  getPlayerPartyStrength,
} from './encounter';
import { type FeudalClanRecord, calculateWarDesireAndTribute } from './kingdomSystem';
import { hashString, mulberry32 } from './rng';

// Geriye dönük uyumluluk: eski çağıranlar bu yardımcıları worldSim'den de alabilir.
export { hashString, mulberry32 } from './rng';

/* ─────────────────────────── yardımcılar ─────────────────────────── */

export interface WorldVec {
  x: number;
  z: number;
}

export interface WorldTickOptions {
  /** Harita görünümünden gelen gerçek lord konumları (id → konum). */
  lordPositions?: Map<string, WorldVec> | Record<string, WorldVec>;
  /** Klan kayıtları (varsa savaş isteği Bannerlord formülüyle hesaplanır). */
  clans?: FeudalClanRecord[];
  /** Test enjeksiyonu: 0..1 üreten fonksiyon. */
  rng?: () => number;
  /** Savaş ilanı eşiği (0..100). Varsayılan 58. */
  warThreshold?: number;
  /** Barış olasılığı çarpanı. Varsayılan 1. */
  peaceRate?: number;
  /** Oyuncu konumu (verilmezse durumdan okunur). */
  playerPos?: WorldVec;
}

export interface WorldTickResult {
  state: CampaignState;
  events: ChronicleEvent[];
  stats: WorldStats;
}

/** Eski kayıtlarda `world` yoksa güvenli varsayılan üretir. */
export function ensureWorld(state: CampaignState): WorldState {
  const existing = state.world;
  if (existing && Array.isArray(existing.wars)) {
    return {
      seed: Number.isFinite(existing.seed) ? existing.seed : 20261021,
      wars: existing.wars.filter((w) => w && w.a && w.b && w.a !== w.b),
      stats: { ...EMPTY_WORLD_STATS, ...(existing.stats ?? {}) },
      siegeCooldowns: { ...(existing.siegeCooldowns ?? {}) },
    };
  }
  return {
    seed: 20261021,
    wars: [],
    stats: { ...EMPTY_WORLD_STATS },
    siegeCooldowns: {},
  };
}

/** Diplomasiye katılan büyük krallıklar (haydutlar ve oyuncu hariç). */
export const MAJOR_FACTIONS: FactionId[] = [
  'empire',
  'vlandia',
  'battania',
  'sturgia',
  'khuzait',
  'aserai',
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

const positionOf = (
  positions: WorldTickOptions['lordPositions'],
  lord: LordAgent,
): WorldVec => {
  if (!positions) return { x: lord.x, z: lord.z };
  if (positions instanceof Map) {
    return positions.get(lord.id) ?? { x: lord.x, z: lord.z };
  }
  return positions[lord.id] ?? { x: lord.x, z: lord.z };
};

/** Verilen krallığın savaşta olduğu krallıklar. */
export function enemiesOf(world: WorldState, faction: FactionId): FactionId[] {
  const out: FactionId[] = [];
  for (const war of world.wars) {
    if (war.a === faction) out.push(war.b);
    else if (war.b === faction) out.push(war.a);
  }
  return out;
}

export function areAtWar(world: WorldState, a: FactionId, b: FactionId): boolean {
  return world.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

/** Krallığın sahadaki toplam gücü (lord orduları + garnizonlar). */
export function factionStrength(state: CampaignState, faction: FactionId): number {
  const armies = state.lords
    .filter((l) => l.faction === faction)
    .reduce((sum, l) => sum + Math.max(armyOf(l), 0), 0);
  const garrisons = state.settlements
    .filter((s) => s.faction === faction)
    .reduce((sum, s) => sum + s.garrison * 0.6 + (s.militia ?? 0) * 0.3, 0);
  return Math.round(armies + garrisons);
}

function armyOf(lord: LordAgent): number {
  const total = lord.roster ? getTotalTroops(lord.roster) : 0;
  return Math.max(lord.armySize ?? 0, total);
}

/* ─────────────────────────── 1. DİPLOMASİ ─────────────────────────── */

export interface WarDesireInput {
  state: CampaignState;
  world: WorldState;
  a: FactionId;
  b: FactionId;
  clans?: FeudalClanRecord[];
}

/**
 * Savaş isteği 0..100.
 *
 * Klan kayıtları verilmişse Bannerlord'un tımar/güç paradoksunu hesaba katan
 * `calculateWarDesireAndTribute` kullanılır (mexxico `GetScoreOfDeclaringWar`).
 * Verilmemişse güç dengesine dayanan sade bir yedek formül devreye girer.
 */
export function computeWarDesire({ state, a, b, clans }: WarDesireInput): number {
  const fiefsA = state.settlements.filter((s) => s.faction === a && s.type !== 'VILLAGE');
  const fiefsB = state.settlements.filter((s) => s.faction === b && s.type !== 'VILLAGE');
  if (fiefsA.length === 0 || fiefsB.length === 0) return 0;

  const clansA = clans?.filter((c) => c.faction === a) ?? [];
  const clansB = clans?.filter((c) => c.faction === b) ?? [];

  if (clansA.length > 0 && clansB.length > 0) {
    try {
      const report = calculateWarDesireAndTribute({
        factionA: a,
        factionB: b,
        clansA,
        clansB,
        fiefsA,
        fiefsB,
        useImprovedArchitecture: true,
      });
      if (Number.isFinite(report.warDesireScorePct)) return report.warDesireScorePct;
    } catch {
      /* yedek formüle düş */
    }
  }

  const strengthA = factionStrength(state, a);
  const strengthB = Math.max(1, factionStrength(state, b));
  const ratio = strengthA / strengthB;
  // Tımar başına güç: çok topraklı krallık "doymuş" sayılır (Bannerlord paradoxu).
  const saturationA = strengthA / Math.max(1, fiefsA.length);
  const saturationB = strengthB / Math.max(1, fiefsB.length);
  const saturationEdge = (saturationA - saturationB) / Math.max(1, saturationA + saturationB);
  return Math.round(clamp(42 + (ratio - 1) * 22 + saturationEdge * 40, 3, 97));
}

/** Günlük savaş ilanı + barış değerlendirmesi. */
export function stepDiplomacy(
  state: CampaignState,
  world: WorldState,
  rand: () => number,
  opts: { warThreshold: number; peaceRate: number; clans?: FeudalClanRecord[] },
): { wars: WorldState['wars']; events: Array<{ category: string; text: string }>; declared: number; ended: number } {
  const wars = world.wars.map((w) => ({ ...w }));
  const events: Array<{ category: string; text: string }> = [];
  let declared = 0;
  let ended = 0;

  const activeCount = (faction: FactionId) => wars.filter((w) => w.a === faction || w.b === faction).length;

  // ── yeni savaşlar ──
  if (state.day >= 8) {
    for (let i = 0; i < MAJOR_FACTIONS.length; i++) {
      for (let j = i + 1; j < MAJOR_FACTIONS.length; j++) {
        const a = MAJOR_FACTIONS[i];
        const b = MAJOR_FACTIONS[j];
        if (areAtWar(world, a, b)) continue;
        if (activeCount(a) >= 2 || activeCount(b) >= 2) continue;

        const desire = computeWarDesire({ state, world, a, b, clans: opts.clans });
        if (desire < opts.warThreshold) continue;

        // Yüksek istek → yüksek olasılık (her gün %4–%28 arası).
        const chance = clamp((desire - opts.warThreshold + 8) * 0.006, 0.004, 0.28);
        if (rand() > chance) continue;

        wars.push({ a, b, sinceDay: state.day, score: 0, sieges: 0 });
        declared++;
        events.push({
          category: 'WAR',
          text: `${FACTION_INFO[a].name}, ${FACTION_INFO[b].name}'a savaş ilan etti. Sınırlarda sancaklar çekildi.`,
        });
      }
    }
  }

  // ── barışlar ──
  for (const war of wars) {
    const age = state.day - war.sinceDay;
    if (age < 20) continue;
    const exhausted = Math.abs(war.score) >= 45;
    const oneSided =
      state.settlements.filter((s) => s.faction === war.b && s.type !== 'VILLAGE').length === 0 ||
      state.settlements.filter((s) => s.faction === war.a && s.type !== 'VILLAGE').length === 0;
    const chance = clamp(0.015 + (age - 20) * 0.0016 + (exhausted ? 0.05 : 0) + (oneSided ? 0.25 : 0), 0, 0.6) *
      opts.peaceRate;
    if (rand() > chance) continue;
    war.sinceDay = -1; // işaretle: barış
    ended++;
    events.push({
      category: 'DIPLOMACY',
      text: `${FACTION_INFO[war.a].name} ile ${FACTION_INFO[war.b].name} arasında barış imzalandı; ${age} günlük savaş sona erdi.`,
    });
  }

  return {
    wars: wars.filter((w) => w.sinceDay !== -1),
    events,
    declared,
    ended,
  };
}

/* ─────────────────────────── 2. LORD EMRİ (FSM) ─────────────────────────── */

export interface OrderContext {
  state: CampaignState;
  world: WorldState;
  lord: LordAgent;
  pos: WorldVec;
  positions: WorldTickOptions['lordPositions'];
  rand: () => number;
  playerPos: WorldVec;
}

/** Bir lordu en mantıklı stratejik emre yönlendirir (saf; lordu değiştirmez). */
export function inspectSettlementSiegeThreat(
  state: CampaignState,
  world: WorldState,
  settlement: Settlement,
  besiegingFaction: FactionId,
  positions: WorldTickOptions['lordPositions'],
  playerPos: WorldVec,
) {
  const besiegers = state.lords.filter(
    (l) =>
      l.faction === besiegingFaction &&
      l.order?.kind === 'SIEGE' &&
      l.order.targetSettlementId === settlement.id,
  );
  const totalBesiegerStrength = Math.max(
    1,
    besiegers.reduce((sum, l) => sum + getLordPartyStrength(l), 0),
  );
  const defenderStrength = Math.round(
    settlement.garrison * 1.15 + (settlement.militia ?? 0) * 0.55,
  );

  const reliefLords = state.lords.filter((other) => {
    if (other.faction === besiegingFaction || other.faction === 'bandits') return false;
    const hostileToBesiegers =
      other.faction === settlement.faction || areAtWar(world, other.faction, besiegingFaction);
    if (!hostileToBesiegers) return false;
    const p = positionOf(positions, other);
    return distance(p.x, p.z, settlement.x, settlement.z) <= 55;
  });

  let reliefForceStrength = reliefLords.reduce(
    (sum, l) => sum + getLordPartyStrength(l),
    0,
  );
  let closestDist = reliefLords.reduce((minD, l) => {
    const p = positionOf(positions, l);
    return Math.min(minD, distance(p.x, p.z, settlement.x, settlement.z));
  }, 999);
  let reliefPos: WorldVec = { x: settlement.x + 25, z: settlement.z };

  if (reliefLords.length > 0) {
    const firstPos = positionOf(positions, reliefLords[0]);
    reliefPos = firstPos;
  }

  // Oyuncu da kuşatmacılara düşmansa ve 55m içindeyse yardım kuvvetine dahil edilir
  const playerHostileToBesiegers =
    settlement.faction === 'player' ||
    besiegers.some((b) => b.isAtWarWithPlayer);
  const playerDist = distance(playerPos.x, playerPos.z, settlement.x, settlement.z);

  if (playerHostileToBesiegers && playerDist <= 55) {
    const playerArmy = getPlayerArmy(state);
    const memberIds = new Set(playerArmy?.memberLordIds ?? []);
    const armyMemberStrength = state.lords
      .filter((l) => memberIds.has(l.id))
      .reduce((sum, l) => sum + getLordPartyStrength(l), 0);

    reliefForceStrength += getPlayerPartyStrength(state) + armyMemberStrength;
    if (playerDist < closestDist) {
      closestDist = playerDist;
      reliefPos = playerPos;
    }
  }

  return evaluateSiegeThreatReaction({
    totalBesiegerStrength,
    reliefForceStrength,
    defenderStrength,
    distance: closestDist,
    reliefPos,
    siegePos: { x: settlement.x, z: settlement.z },
  });
}

export function decideLordOrder(ctx: OrderContext): LordOrder | undefined {
  const { state, world, lord, pos, positions, rand, playerPos } = ctx;
  const day = state.day;

  if (lord.faction === 'player') return lord.order;

  // Oyuncunun ordusuna bağlı üye lordlar kendi başlarına stratejik emir değiştirmez
  const playerArmy = getPlayerArmy(state);
  if (playerArmy && playerArmy.memberLordIds.includes(lord.id)) {
    if (playerArmy.targetSettlementId) {
      return {
        kind: 'SIEGE',
        targetSettlementId: playerArmy.targetSettlementId,
        sinceDay: lord.order?.sinceDay ?? day,
        siegeProgress: lord.order?.siegeProgress ?? 20,
      };
    }
    return lord.order;
  }

  const myFiefs = state.settlements.filter((s) => s.faction === lord.faction);
  const enemies = enemiesOf(world, lord.faction);
  const enemyFiefs = state.settlements.filter(
    (s) => enemies.includes(s.faction) && s.type !== 'VILLAGE',
  );
  const army = armyOf(lord);

  // 0) Süren kuşatma: hedef hâlâ düşman elindeyse tehdit değerlendirmesi yap, tehdit yoksa emri koru.
  if (lord.order?.kind === 'SIEGE' && lord.order.targetSettlementId) {
    const current = state.settlements.find((s) => s.id === lord.order?.targetSettlementId);
    if (current && current.faction !== lord.faction && enemies.includes(current.faction)) {
      const threat = inspectSettlementSiegeThreat(
        state,
        world,
        current,
        lord.faction,
        positions,
        playerPos,
      );
      if (threat.kind === 'LIFT_SIEGE') {
        return { kind: 'FLEE', sinceDay: day };
      }
      return lord.order;
    }
  }

  // 1) Kendi yerleşimim kuşatma altında mı?
  const besiegedOwn = myFiefs.filter((f) =>
    state.lords.some(
      (other) =>
        other.id !== lord.id &&
        other.faction !== lord.faction &&
        other.order?.kind === 'SIEGE' &&
        other.order.targetSettlementId === f.id,
    ),
  );
  if (besiegedOwn.length > 0) {
    const target = besiegedOwn.sort(
      (x, y) => distance(pos.x, pos.z, x.x, x.z) - distance(pos.x, pos.z, y.x, y.z),
    )[0];
    return { kind: 'DEFEND', targetSettlementId: target.id, sinceDay: lord.order?.sinceDay ?? day };
  }

  // 2) Oyuncuyla savaş hâlinde ve yakınsa avla.
  if (lord.isAtWarWithPlayer) {
    const dPlayer = distance(pos.x, pos.z, playerPos.x, playerPos.z);
    if (dPlayer < 110 && rand() < 0.45) {
      return { kind: 'HUNT_PLAYER', sinceDay: lord.order?.sinceDay ?? day };
    }
  }

  // 3) Ordu eridi → takviye (kendi yerleşimine dön), çok yakında düşman varsa kaç.
  if (army <= 10) {
    const nearestEnemyLord = state.lords
      .filter((o) => o.faction !== lord.faction && enemies.includes(o.faction))
      .map((o) => distance(pos.x, pos.z, positionOf(positions, o).x, positionOf(positions, o).z))
      .sort((a, b) => a - b)[0];
    if (nearestEnemyLord !== undefined && nearestEnemyLord < 25) {
      return { kind: 'FLEE', sinceDay: lord.order?.sinceDay ?? day };
    }
    const home = myFiefs.sort(
      (x, y) => distance(pos.x, pos.z, x.x, x.z) - distance(pos.x, pos.z, y.x, y.z),
    )[0];
    if (home) return { kind: 'REINFORCE', targetSettlementId: home.id, sinceDay: lord.order?.sinceDay ?? day };
  }

  // 4) Savaş varsa kuşatma veya takviye.
  if (enemyFiefs.length > 0) {
    const cooldowns = world.siegeCooldowns ?? {};
    const candidates = enemyFiefs
      .map((s) => ({
        s,
        d: distance(pos.x, pos.z, s.x, s.z),
        defence: s.garrison * 0.7 + (s.militia ?? 0) * 0.3,
      }))
      .filter((c) => c.defence <= army * 2.1)
      .filter((c) => (cooldowns[c.s.id] ?? 0) <= state.day)
      .sort((a, b) => a.d - b.d);

    if (candidates.length > 0 && rand() < 0.55) {
      const pick = candidates[Math.min(candidates.length - 1, Math.floor(rand() * 2))];
      return { kind: 'SIEGE', targetSettlementId: pick.s.id, sinceDay: lord.order?.sinceDay ?? day, siegeProgress: 0 };
    }
    const home = myFiefs.sort(
      (x, y) => distance(pos.x, pos.z, x.x, x.z) - distance(pos.x, pos.z, y.x, y.z),
    )[0];
    if (home && rand() < 0.5) {
      return { kind: 'REINFORCE', targetSettlementId: home.id, sinceDay: lord.order?.sinceDay ?? day };
    }
  }

  // 5) Devriye: mevcut hedef hâlâ geçerliyse koru (churn yok).
  if (
    lord.order?.kind === 'PATROL' &&
    lord.order.targetSettlementId &&
    myFiefs.some((f) => f.id === lord.order?.targetSettlementId)
  ) {
    return lord.order;
  }
  const patrolTargets = myFiefs.filter((f) => f.type !== 'VILLAGE');
  const pool = patrolTargets.length > 0 ? patrolTargets : myFiefs;
  if (pool.length === 0) return lord.order;
  const pick = pool[Math.floor(rand() * pool.length) % pool.length];
  return { kind: 'PATROL', targetSettlementId: pick.id, sinceDay: day };
}

/** Emir değişimini gürültüsüz uygular (aynı emir yeniden yazılmaz). */
export function assignLordOrder(lord: LordAgent, next: LordOrder | undefined): LordAgent {
  if (!next) return lord;
  const prev = lord.order;
  const same =
    prev && prev.kind === next.kind && (prev.targetSettlementId ?? null) === (next.targetSettlementId ?? null);
  if (same) return lord;
  return { ...lord, order: { ...next, sinceDay: next.sinceDay } };
}

/* ─────────────────────────── 3. KUŞATMA VE FETİH ─────────────────────────── */

export interface SiegeOutcome {
  settlements: Settlement[];
  lords: LordAgent[];
  wars: WorldState['wars'];
  events: Array<{ category: string; text: string }>;
  siegesWon: number;
  fiefsChangedHands: number;
  siegeCooldowns: Record<string, number>;
}

/** Kuşatma ilerlemesini yürütür; tamamlanınca yerleşim el değiştirir. */
export function advanceSieges(
  state: CampaignState,
  world: WorldState,
  positions: WorldTickOptions['lordPositions'],
  rand: () => number,
): SiegeOutcome {
  const settlements = state.settlements.map((s) => ({ ...s }));
  const lords = state.lords.map((l) => ({ ...l, roster: l.roster ? { ...l.roster } : l.roster }));
  const wars = world.wars.map((w) => ({ ...w }));
  const events: Array<{ category: string; text: string }> = [];
  let siegesWon = 0;
  let fiefsChangedHands = 0;
  const siegeCooldowns: Record<string, number> = { ...(world.siegeCooldowns ?? {}) };

  const playerPos = { x: state.playerX, z: state.playerZ };

  for (const lord of lords) {
    if (lord.order?.kind !== 'SIEGE' || !lord.order.targetSettlementId) continue;
    const target = settlements.find((s) => s.id === lord.order?.targetSettlementId);
    if (!target) {
      lord.order = { kind: 'PATROL', sinceDay: state.day };
      continue;
    }
    if (target.faction === lord.faction) {
      lord.order = { kind: 'DEFEND', targetSettlementId: target.id, sinceDay: state.day };
      continue;
    }

    // Kuşatma Tehdit AI kontrolü: Üstün bir yardım ordusu yaklaştıysa kuşatmayı kaldır!
    const threat = inspectSettlementSiegeThreat(
      { ...state, settlements, lords },
      world,
      target,
      lord.faction,
      positions,
      playerPos,
    );
    if (threat.kind === 'LIFT_SIEGE') {
      for (const coLord of lords) {
        if (
          coLord.faction === lord.faction &&
          coLord.order?.kind === 'SIEGE' &&
          coLord.order.targetSettlementId === target.id
        ) {
          coLord.order = { kind: 'FLEE', sinceDay: state.day };
          coLord.currentAction = threat.actionLabel;
          if (threat.targetPos) {
            coLord.targetX = threat.targetPos.x;
            coLord.targetZ = threat.targetPos.z;
          }
        }
      }
      events.push({
        category: 'WAR',
        text: `${lord.name} komutasındaki kuşatma kuvvetleri, yaklaşan üstün yardım ordusu karşısında ${target.name} kuşatmasını kaldırıp geri çekildi.`,
      });
      continue;
    }

    const pos = positionOf(positions, lord);
    const radius = Math.max(getSettlementArrivalRadius(target.type) + 3, SIEGE_CAMP_STANDOFF + 4);
    const dist = distance(pos.x, pos.z, target.x, target.z);
    const progress = lord.order.siegeProgress ?? 0;

    if (dist > radius) {
      // Henüz kuşatma hattına ulaşmadı: hazırlık ilerlemesi yavaşça erir.
      lord.order = { ...lord.order, siegeProgress: Math.max(0, progress - 2) };
      continue;
    }

    // Aynı yerleşimi kuşatan ve menzilde olan tüm müttefik lordların ortak gücü
    const coBesiegers = lords.filter((other) => {
      if (other.order?.kind !== 'SIEGE' || other.order.targetSettlementId !== target.id) {
        return false;
      }
      if (other.faction !== lord.faction) return false;
      const p = positionOf(positions, other);
      return distance(p.x, p.z, target.x, target.z) <= radius;
    });
    const combinedAttack = coBesiegers.reduce((sum, l) => sum + armyOf(l), 0);

    // Bannerlord'da garnizon + milis birlikte savunur; saldıran ordu kuşatma
    // makineleriyle çarpanlı vurur. Günlük ilerleme 4–26 arasında kalır ki
    // hiçbir kuşatma sonsuza kadar sürmesin (hedef: 5–15 gün).
    const defence = target.garrison * 0.7 + (target.militia ?? 0) * 0.3;
    const attack = Math.max(armyOf(lord), combinedAttack);
    const dailyGain = clamp(8 + (attack * 1.1 - defence) * 0.45, 4, 26);
    const nextProgress = Math.round(progress + dailyGain);

    if (nextProgress < 100) {
      lord.order = { ...lord.order, siegeProgress: nextProgress };
      if (nextProgress >= 25 && Math.floor(nextProgress / 25) > Math.floor(progress / 25)) {
        events.push({
          category: 'WAR',
          text: `${lord.name}, ${target.name} surlarını dövmeye başladı (kuşatma %${nextProgress}).`,
        });
      }
      continue;
    }

    /* ── FETİH ── */
    const oldFaction = target.faction;
    const newFaction = lord.faction;
    target.faction = newFaction;
    target.garrison = Math.max(6, Math.round(attack * 0.3));
    const postConquestWall = Math.max(25, Math.round((target.wallHealth ?? 100) * 0.6));
    target.wallHealth = postConquestWall;
    target.wallSections = [postConquestWall, postConquestWall];
    target.siegeEngines = [];
    target.reserveEngines = [];
    target.siegeEngineHp = [];

    // Bağlı köyler de el değiştirir (Bannerlord kuralı).
    for (const village of settlements) {
      if (village.boundSettlementId === target.id && village.faction === oldFaction) {
        village.faction = newFaction;
      }
    }

    // Saldıran ordu(lar) yıpranır.
    for (const coLord of coBesiegers) {
      const coArmy = armyOf(coLord);
      const losses = Math.max(2, Math.round(coArmy * 0.18 + rand() * 2));
      const remaining = Math.max(5, coArmy - losses);
      coLord.armySize = remaining;
      coLord.roster = scaleRoster(coLord.roster, remaining / Math.max(1, coArmy));
      coLord.foodDays = Math.max(2, (coLord.foodDays ?? 6) - 3);
      coLord.order = { kind: 'DEFEND', targetSettlementId: target.id, sinceDay: state.day };
    }

    const war = wars.find(
      (w) => (w.a === newFaction && w.b === oldFaction) || (w.a === oldFaction && w.b === newFaction),
    );
    if (war) {
      war.score = clamp(war.score + (war.a === newFaction ? 22 : -22), -100, 100);
      war.sieges += 1;
    }

    // 30 gün boyunca bu yerleşim yeniden kuşatılamaz (sürekli el değiştirme önlenir).
    siegeCooldowns[target.id] = state.day + 30;
    siegesWon++;
    fiefsChangedHands++;
    events.push({
      category: 'CONQUEST',
      text: `${target.name}, ${lord.name} komutasındaki ${FACTION_INFO[newFaction].name} kuvvetlerinin eline geçti. (${FACTION_INFO[oldFaction].name} tımarı kaybetti.)`,
    });
  }

  // Temizlik: aynı gün başka bir lord kaleyi aldıysa, kalan kuşatma emirleri geçersizdir.
  for (const lord of lords) {
    if (lord.order?.kind !== 'SIEGE' || !lord.order.targetSettlementId) continue;
    const target = settlements.find((s) => s.id === lord.order?.targetSettlementId);
    if (!target || target.faction === lord.faction) {
      lord.order = {
        kind: target && target.faction === lord.faction ? 'DEFEND' : 'PATROL',
        targetSettlementId: target?.id,
        sinceDay: state.day,
      };
    }
  }

  return { settlements, lords, wars, events, siegesWon, fiefsChangedHands, siegeCooldowns };
}

function scaleRoster(
  roster: LordAgent['roster'],
  factor: number,
): LordAgent['roster'] {
  if (!roster) return roster;
  const f = clamp(factor, 0.2, 1);
  return {
    militia: Math.floor(roster.militia * f),
    archer: Math.floor(roster.archer * f),
    cavalry: Math.floor(roster.cavalry * f),
    guard: Math.floor(roster.guard * f),
  };
}

/* ─────────────────────────── 4. TAKVİYE / İAŞE ─────────────────────────── */

export interface UpkeepOutcome {
  lords: LordAgent[];
  settlements: Settlement[];
  events: Array<{ category: string; text: string }>;
  reinforcements: number;
}

export function advanceUpkeep(
  state: CampaignState,
  settlements: Settlement[],
  lords: LordAgent[],
  positions: WorldTickOptions['lordPositions'],
  rand: () => number = mulberry32(state.day),
): UpkeepOutcome {
  const nextSettlements = settlements.map((s) => ({ ...s }));
  const events: Array<{ category: string; text: string }> = [];
  let reinforcements = 0;

  // Garnizonlar kuşatma altında değilse yavaşça toparlanır; kuşatmada erzak bittiyse açlıktan erir.
  for (const settlement of nextSettlements) {
    const besiegedByLord = lords.some(
      (l) => l.order?.kind === 'SIEGE' && l.order.targetSettlementId === settlement.id,
    );
    const besiegedByPlayer =
      state.playerSiege?.settlementId === settlement.id && !state.playerSiege.inside;
    const besieged = besiegedByLord || besiegedByPlayer;
    if (!besieged) {
      const cap = settlement.type === 'TOWN' ? 70 : settlement.type === 'CASTLE' ? 50 : 12;
      settlement.garrison = Math.min(cap, settlement.garrison + 1);
    } else if (settlement.type !== 'VILLAGE' && settlement.foodStock <= 0 && settlement.garrison > 0) {
      const loss = Math.max(1, Math.round(settlement.garrison * 0.1));
      settlement.garrison = Math.max(0, settlement.garrison - loss);
      events.push({
        category: 'WAR',
        text: `${settlement.name} garnizonu açlıktan kırılıyor (-${loss} asker).`,
      });
    }
  }

  const nextLords = lords.map((lord) => {
    const l = { ...lord, roster: lord.roster ? { ...lord.roster } : lord.roster };
    const pos = positionOf(positions, l);

    // Erzak tüketimi.
    l.foodDays = Math.max(0, (l.foodDays ?? 6) - 1);
    if (l.foodDays <= 0) {
      l.morale = Math.max(20, (l.morale ?? 70) - 3);
      const army = getTotalTroops(l.roster ?? { militia: 0, archer: 0, cavalry: 0, guard: 0 });
      if (army > 6) {
        l.roster = scaleRoster(l.roster, 0.97);
        l.armySize = Math.max(1, getTotalTroops(l.roster ?? { militia: 0, archer: 0, cavalry: 0, guard: 0 }));
      }
    }

    // Kendi yerleşiminde takviye.
    const home = l.order?.targetSettlementId
      ? nextSettlements.find((s) => s.id === l.order?.targetSettlementId)
      : undefined;
    const atHome =
      home &&
      home.faction === l.faction &&
      distance(pos.x, pos.z, home.x, home.z) <= getSettlementArrivalRadius(home.type) + 3;

    if (atHome && (l.order?.kind === 'REINFORCE' || l.order?.kind === 'DEFEND' || l.order?.kind === 'PATROL')) {
      const army = getTotalTroops(l.roster ?? { militia: 0, archer: 0, cavalry: 0, guard: 0 });
      const cap = Math.max(24, Math.min(60, home.garrison + 22));
      if (army < cap) {
        const gain = Math.max(1, Math.min(4, Math.round(home.garrison * 0.08) + 1));
        l.roster = growRoster(l.roster, gain, l.faction, rand);
        l.armySize = getTotalTroops(l.roster ?? { militia: 0, archer: 0, cavalry: 0, guard: 0 });
        l.foodDays = Math.max(l.foodDays ?? 0, Math.min(14, 6 + Math.round(home.foodStock * 0.1)));
        l.morale = Math.min(100, (l.morale ?? 70) + 2);
        l.wounded = Math.max(0, (l.wounded ?? 0) - 1);
        reinforcements++;
      } else if (l.order?.kind === 'REINFORCE') {
        l.order = { kind: 'PATROL', targetSettlementId: home.id, sinceDay: state.day };
      }
    }

    return l;
  });

  return { lords: nextLords, settlements: nextSettlements, events, reinforcements };
}

function growRoster(
  roster: LordAgent['roster'],
  gain: number,
  faction: FactionId,
  rand: () => number,
): LordAgent['roster'] {
  const base = roster ?? { militia: 0, archer: 0, cavalry: 0, guard: 0 };
  const out = { ...base };
  // Kültüre göre eğilim (Khuzait/Aserai süvari, Battania okçu…).
  const cavalryBias = faction === 'khuzait' || faction === 'aserai' ? 0.4 : 0.22;
  const rangedBias = faction === 'battania' ? 0.4 : 0.28;
  for (let i = 0; i < gain; i++) {
    const roll = rand();
    if (roll < cavalryBias) out.cavalry += 1;
    else if (roll < cavalryBias + rangedBias) out.archer += 1;
    else out.militia += 1;
  }
  return out;
}

/* ─────────────────────────── 5. GÜNLÜK BORU HATTI ─────────────────────────── */

/**
 * Bir günü simüle eder.
 *
 * Sıra: ekonomi → diplomasi → emirler → kuşatmalar/fetih → takviye → vakayiname.
 */
export function advanceWorldDay(state: CampaignState, opts: WorldTickOptions = {}): WorldTickResult {
  const base = advanceDailyEconomyAndWorld(state);
  const day = base.day;
  const world = ensureWorld(base);
  const rand = opts.rng ?? mulberry32((world.seed ^ Math.imul(day, 2654435761)) >>> 0);
  const positions = opts.lordPositions;
  const playerPos = opts.playerPos ?? { x: base.playerX, z: base.playerZ };
  const stats: WorldStats = { ...world.stats };
  const events: ChronicleEvent[] = [];

  const pushEvent = (category: string, text: string) => {
    stats.events += 1;
    events.push({
      id: `world-${day}-${events.length}-${stats.events}`,
      day,
      category,
      text,
    });
  };

  /* 1. Diplomasi */
  const diplomacy = stepDiplomacy(base, world, rand, {
    warThreshold: opts.warThreshold ?? 58,
    peaceRate: opts.peaceRate ?? 1,
    clans: opts.clans,
  });
  stats.warsDeclared += diplomacy.declared;
  stats.warsEnded += diplomacy.ended;
  diplomacy.events.forEach((e) => pushEvent(e.category, e.text));

  const worldAfterDiplomacy: WorldState = { ...world, wars: diplomacy.wars, stats };

  /* 2. Emirler */
  let lords: LordAgent[] = base.lords.map((lord) => {
    const pos = positionOf(positions, lord);
    const next = decideLordOrder({
      state: base,
      world: worldAfterDiplomacy,
      lord,
      pos,
      positions,
      rand,
      playerPos,
    });
    return assignLordOrder(lord, next);
  });

  /* 3. Kuşatmalar ve fetih */
  const siege = advanceSieges({ ...base, lords }, worldAfterDiplomacy, positions, rand);
  lords = siege.lords;
  stats.siegesWon += siege.siegesWon;
  stats.fiefsChangedHands += siege.fiefsChangedHands;
  siege.events.forEach((e) => pushEvent(e.category, e.text));

  /* 4. Takviye ve iaşe */
  const upkeep = advanceUpkeep(base, siege.settlements, lords, positions, rand);
  lords = upkeep.lords;
  stats.reinforcements += upkeep.reinforcements;
  upkeep.events.forEach((e) => pushEvent(e.category, e.text));

  /* 4b. Görev 2: Ordu & Uyum & Erzak Paylaşımı */
  const armyTick = advanceArmiesDaily({
    ...base,
    lords,
    settlements: upkeep.settlements,
  });
  lords = armyTick.nextState.lords;
  armyTick.events.forEach((e) => pushEvent(e.category, e.text));

  /* 5. Oyuncu avı teması (savaş başlatmaz; harita karşılaşmayı yönetir) */
  for (const lord of lords) {
    if (lord.order?.kind !== 'HUNT_PLAYER') continue;
    const pos = positionOf(positions, lord);
    if (distance(pos.x, pos.z, playerPos.x, playerPos.z) < 10) {
      lord.isAtWarWithPlayer = true;
      if (rand() < 0.35) {
        pushEvent('WAR', `${lord.name}, sancağını senin yolunun üzerine dikti; karşılaşma an meselesi.`);
      }
    }
  }

  /* 6. Vakayiname (en yeni önce, 20 kayıt) */
  const chronicle = [...events.slice().reverse(), ...base.chronicle].slice(0, 20);

  const nextWorld: WorldState = {
    seed: world.seed,
    wars: siege.wars,
    stats,
    siegeCooldowns: siege.siegeCooldowns,
  };

  return {
    state: {
      ...base,
      food: armyTick.nextState.food,
      influence: armyTick.nextState.influence,
      armies: armyTick.nextState.armies,
      lords,
      settlements: upkeep.settlements,
      chronicle,
      world: nextWorld,
    },
    events,
    stats,
  };
}

/* ─────────────────────────── 6. OKUMA YARDIMCILARI (UI) ─────────────────────────── */

export interface ActiveWarSummary {
  a: FactionId;
  b: FactionId;
  days: number;
  score: number;
  leader: FactionId | null;
  label: string;
}

/** Arayüzde göstermek için savaş özetleri. */
export function summarizeWars(state: CampaignState): ActiveWarSummary[] {
  const world = ensureWorld(state);
  return world.wars
    .map((war) => {
      const days = Math.max(0, state.day - war.sinceDay);
      const leader = war.score > 6 ? war.a : war.score < -6 ? war.b : null;
      return {
        a: war.a,
        b: war.b,
        days,
        score: war.score,
        leader,
        label: `${FACTION_INFO[war.a].name} ↔ ${FACTION_INFO[war.b].name}`,
      };
    })
    .sort((x, y) => y.days - x.days);
}

/** Bir yerleşimin adı + sahibi (fetih sonrası arayüz doğrulaması için). */
export function settlementOwnerLabel(settlement: Settlement): string {
  return `${settlement.name} · ${FACTION_INFO[settlement.faction].name}`;
}
