/**
 * encounter.ts — Bannerlord Kampanya Haritası Kovalama, Kaçma ve Zorunlu Karşılaşma Motoru
 *
 * Mount & Blade II: Bannerlord'daki `AiBanditPatrolBehavior`, `AiEngagePartyBehavior`
 * ve `PlayerEncounter` sistemlerinin saf (pure) ve deterministik karşılığı:
 *
 *  1. Gerçek Zamanlı Görüş & Güç Analizi (`evaluateHostileReaction`):
 *     - Düşman lordlar (`isAtWarWithPlayer`) ve haydutlar (`faction === 'bandits'`)
 *       oyuncu menzile girdiğinde iki tarafın toplam parti gücünü (`calculatePartyStrength`) karşılaştırır.
 *     - Güç oranı (ρ = DüşmanGücü / OyuncuGücü) eşiği:
 *       · ρ >= 1.02 (lord) / 1.08 (haydut) → `PURSUE_PLAYER` (oyuncunun canlı koordinatına kilitlenir)
 *       · ρ <= 0.88 → `FLEE_FROM_PLAYER` (oyuncunun tersi vektöre kaçar)
 *       · Ara bölge → `PATROL` (temkinli devriyeye devam eder)
 *
 *  2. Otomatik Harita Yakalaması (`checkMapInterception`):
 *     - Oyuncu tıklamamış olsa bile düşman veya haydut `INTERCEPT_RADIUS` (3.2m) içine girdiğinde
 *       harita zamanı durur ve zorunlu karşılaşma (`PlayerEncounter`) açılır.
 *     - Kaçış, rüşvet veya ateşkes sonrasında `ENCOUNTER_COOLDOWN_MS` (6 sn) boyunca
 *       aynı partinin oyuncuyu anında tekrar yakalaması engellenir.
 *
 *  3. Taktik Karşılaşma Aksiyonları:
 *     - Rüşvet / Geçiş Hakkı (`calculateBribeCost`)
 *     - Artçı Bırakıp Kaçma (`calculateSacrificeEscape`, `applySacrificeEscape`)
 *     - Askerleri Gönder / Otomatik Çözüm (`simulateSendTroopsBattle`)
 *     - Zayıf Haydutların Teslim Olması (`resolveCorneredBanditSurrender`)
 *     - Oyuncunun Teslim Olması (`applyPlayerSurrender`)
 */
import { isNavigableLandAt, snapToNearestLand } from './navigation.ts';
import {
  type CampaignState,
  type LordAgent,
  type TroopRoster,
  calculatePartyStrength,
  getTotalTroops,
} from './rules.ts';

export const INTERCEPT_RADIUS = 3.2;
export const ENCOUNTER_COOLDOWN_SEC = 6.5;

export type HostileReactionKind = 'PURSUE_PLAYER' | 'FLEE_FROM_PLAYER' | 'PATROL';

export type EncounterScenario =
  | 'BANDIT_CAUGHT_PLAYER'
  | 'PLAYER_CAUGHT_BANDIT'
  | 'LORD_CAUGHT_PLAYER'
  | 'PLAYER_CAUGHT_LORD'
  | 'PEACEFUL_MEETING';

export interface HostileReaction {
  kind: HostileReactionKind;
  /** Düşman Gücü / Oyuncu Gücü oranı. */
  strengthRatio: number;
  enemyStrength: number;
  playerStrength: number;
  distance: number;
  /** Kovalama veya kaçma durumunda gidilecek canlı hedef nokta. */
  targetPos: { x: number; z: number } | null;
  /** Harita üzerinde ve istihbaratta görünecek canlı aksiyon metni. */
  actionLabel: string;
}

export interface InterceptionEvent {
  lord: LordAgent;
  scenario: EncounterScenario;
  forced: boolean;
  enemyStrength: number;
  playerStrength: number;
  strengthRatio: number;
  distance: number;
}

/** Bir lord/haydut oyuncu için düşman mı? */
export function isHostileToPlayer(lord: LordAgent): boolean {
  return Boolean(lord.isAtWarWithPlayer || lord.faction === 'bandits');
}

/** Bir lordun mevcut birliğinin toplam muharebe gücünü hesaplar. */
export function getLordPartyStrength(lord: LordAgent): number {
  const roster: TroopRoster = lord.roster ?? {
    militia: Math.max(2, Math.floor(lord.armySize * 0.35)),
    archer: Math.max(1, Math.floor(lord.armySize * 0.28)),
    cavalry: Math.max(1, Math.floor(lord.armySize * 0.22)),
    guard: Math.max(0, Math.floor(lord.armySize * 0.15)),
  };
  return Math.max(1, calculatePartyStrength(roster, 1.0));
}

/** Oyuncunun mevcut birliğinin toplam muharebe gücünü hesaplar. */
export function getPlayerPartyStrength(campaign: CampaignState): number {
  const hpRatio = Math.max(0.25, campaign.playerHp / Math.max(1, campaign.playerMaxHp));
  return Math.max(1, calculatePartyStrength(campaign.roster, hpRatio));
}

/**
 * Bir düşman lordunun veya haydut birliğinin oyuncuya göre gerçek zamanlı
 * kovalama (`PURSUE_PLAYER`) veya kaçma (`FLEE_FROM_PLAYER`) kararını verir.
 */
export function evaluateHostileReaction(params: {
  lord: LordAgent;
  lordX: number;
  lordZ: number;
  playerX: number;
  playerZ: number;
  playerStrength: number;
  nearbyHostileStrength?: number;
}): HostileReaction {
  const {
    lord,
    lordX,
    lordZ,
    playerX,
    playerZ,
    playerStrength,
    nearbyHostileStrength = 0,
  } = params;

  const distance = Math.hypot(lordX - playerX, lordZ - playerZ);
  const enemyStrength = getLordPartyStrength(lord);
  const effectiveEnemyStrength = enemyStrength + nearbyHostileStrength * 0.6;
  const safePlayerStrength = Math.max(1, playerStrength);
  const strengthRatio = Number((effectiveEnemyStrength / safePlayerStrength).toFixed(2));

  if (!isHostileToPlayer(lord)) {
    return {
      kind: 'PATROL',
      strengthRatio,
      enemyStrength,
      playerStrength: safePlayerStrength,
      distance,
      targetPos: null,
      actionLabel: lord.currentAction || 'Devriye geziyor',
    };
  }

  const isBandit = lord.faction === 'bandits';
  const pursueRange = isBandit ? 48 : 66;
  const fleeRange = isBandit ? 38 : 42;
  const pursueThreshold = isBandit ? 1.06 : 1.0;
  const fleeThreshold = 0.88;

  // 1. KOVALAMA: Düşman oyuncudan güçlü ve görüş menzilinde
  if (distance <= pursueRange && strengthRatio >= pursueThreshold) {
    const goal = snapToNearestLand(playerX, playerZ);
    return {
      kind: 'PURSUE_PLAYER',
      strengthRatio,
      enemyStrength,
      playerStrength: safePlayerStrength,
      distance,
      targetPos: { x: goal.x, z: goal.z },
      actionLabel: isBandit
        ? 'Seni gözüne kestirdi, kovalıyor!'
        : 'Sancağını senin üzerine sürüyor!',
    };
  }

  // 2. KAÇMA: Oyuncu düşmandan güçlü ve tehlike menzilinde
  if (distance <= fleeRange && strengthRatio <= fleeThreshold) {
    const dx = lordX - playerX;
    const dz = lordZ - playerZ;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;

    // Tam tersi yöne doğru güvenli kara noktası bul (engele takılırsa açıyı esnet)
    let fleeTarget = { x: lordX + nx * 28, z: lordZ + nz * 28 };
    if (!isNavigableLandAt(fleeTarget.x, fleeTarget.z)) {
      const angles = [0.45, -0.45, 0.9, -0.9, 1.35, -1.35];
      for (const ang of angles) {
        const rx = nx * Math.cos(ang) - nz * Math.sin(ang);
        const rz = nx * Math.sin(ang) + nz * Math.cos(ang);
        const candX = lordX + rx * 26;
        const candZ = lordZ + rz * 26;
        if (isNavigableLandAt(candX, candZ)) {
          fleeTarget = { x: candX, z: candZ };
          break;
        }
      }
      fleeTarget = snapToNearestLand(fleeTarget.x, fleeTarget.z);
    }

    return {
      kind: 'FLEE_FROM_PLAYER',
      strengthRatio,
      enemyStrength,
      playerStrength: safePlayerStrength,
      distance,
      targetPos: fleeTarget,
      actionLabel: isBandit
        ? 'Sancağından korkup kaçıyor!'
        : 'Üstün ordunun önünden çekiliyor!',
    };
  }

  return {
    kind: 'PATROL',
    strengthRatio,
    enemyStrength,
    playerStrength: safePlayerStrength,
    distance,
    targetPos: null,
    actionLabel: lord.currentAction || 'Devriye geziyor',
  };
}

/**
 * Bir karşılaşmanın senaryosunu (kimin kimi yakaladığını) belirler.
 */
export function classifyEncounterScenario(
  lord: LordAgent,
  campaign: CampaignState,
): {
  scenario: EncounterScenario;
  forced: boolean;
  enemyStrength: number;
  playerStrength: number;
  strengthRatio: number;
} {
  const enemyStrength = getLordPartyStrength(lord);
  const playerStrength = getPlayerPartyStrength(campaign);
  const strengthRatio = Number((enemyStrength / Math.max(1, playerStrength)).toFixed(2));
  const hostile = isHostileToPlayer(lord);

  if (!hostile) {
    return {
      scenario: 'PEACEFUL_MEETING',
      forced: false,
      enemyStrength,
      playerStrength,
      strengthRatio,
    };
  }

  const isBandit = lord.faction === 'bandits';
  const enemyStronger = strengthRatio >= 0.95;

  if (isBandit) {
    return {
      scenario: enemyStronger ? 'BANDIT_CAUGHT_PLAYER' : 'PLAYER_CAUGHT_BANDIT',
      forced: true,
      enemyStrength,
      playerStrength,
      strengthRatio,
    };
  }

  return {
    scenario: enemyStronger ? 'LORD_CAUGHT_PLAYER' : 'PLAYER_CAUGHT_LORD',
    forced: true,
    enemyStrength,
    playerStrength,
    strengthRatio,
  };
}

/**
 * Harita üzerinde oyuncuya `INTERCEPT_RADIUS` (3.2m) kadar yaklaşmış ve
 * dokunulmazlık süresinde olmayan düşman/haydut var mı kontrol eder.
 */
export function checkHostileMapInterception(params: {
  campaign: CampaignState;
  playerX: number;
  playerZ: number;
  lordPositions: Map<string, { x: number; z: number }>;
  cooldowns: Map<string, number>;
  nowSec: number;
  interceptRadius?: number;
}): InterceptionEvent | null {
  const {
    campaign,
    playerX,
    playerZ,
    lordPositions,
    cooldowns,
    nowSec,
    interceptRadius = INTERCEPT_RADIUS,
  } = params;

  let closestEvent: InterceptionEvent | null = null;

  for (const lord of campaign.lords) {
    if (!isHostileToPlayer(lord)) continue;
    const cooldownUntil = cooldowns.get(lord.id) ?? 0;
    if (nowSec < cooldownUntil) continue;

    const pos = lordPositions.get(lord.id) ?? { x: lord.x, z: lord.z };
    const dist = Math.hypot(pos.x - playerX, pos.z - playerZ);
    if (dist <= interceptRadius) {
      const info = classifyEncounterScenario(lord, campaign);
      if (!closestEvent || dist < closestEvent.distance) {
        closestEvent = {
          lord,
          scenario: info.scenario,
          forced: info.forced,
          enemyStrength: info.enemyStrength,
          playerStrength: info.playerStrength,
          strengthRatio: info.strengthRatio,
          distance: dist,
        };
      }
    }
  }

  return closestEvent;
}

/**
 * Haydut veya düşman birliğine savaştan kaçınmak için ödenecek geçiş/rüşvet bedeli.
 */
export function calculateBribeCost(lord: LordAgent, campaign: CampaignState): number {
  const enemyStrength = getLordPartyStrength(lord);
  const rawCost = Math.round(enemyStrength * 2.6 + lord.armySize * 7);
  return Math.max(45, Math.min(850, rawCost));
}

/**
 * Savaş öncesi karşılaşma ekranında "Artçı Bırakıp Kaç" seçeneğinin maliyetini hesaplar.
 * Bannerlord'da oyuncu çemberi yarıp kaçmak için bir kısım askerini geride bırakır.
 */
export function calculateSacrificeEscape(
  campaign: CampaignState,
  lord: LordAgent,
): {
  canEscape: boolean;
  sacrificedTotal: number;
  moraleLoss: number;
  losses: Partial<TroopRoster>;
} {
  const totalTroops = getTotalTroops(campaign.roster);
  if (totalTroops < 4) {
    return { canEscape: false, sacrificedTotal: 0, moraleLoss: 0, losses: {} };
  }

  const enemyStrength = getLordPartyStrength(lord);
  const playerStrength = getPlayerPartyStrength(campaign);
  const ratio = enemyStrength / Math.max(1, playerStrength);

  // Düşman ne kadar güçlüyse artçı olarak bırakılacak asker sayısı o kadar artar (%18 - %30)
  const share = Math.min(0.32, Math.max(0.16, 0.18 * ratio));
  const targetLoss = Math.max(2, Math.min(totalTroops - 1, Math.round(totalTroops * share)));

  let remaining = targetLoss;
  const losses: Partial<TroopRoster> = {};
  const order: Array<keyof TroopRoster> = ['militia', 'archer', 'cavalry', 'guard'];

  for (const tier of order) {
    if (remaining <= 0) break;
    const avail = campaign.roster[tier] ?? 0;
    const take = Math.min(avail, remaining);
    if (take > 0) {
      losses[tier] = take;
      remaining -= take;
    }
  }

  const sacrificedTotal = targetLoss - remaining;
  return {
    canEscape: sacrificedTotal >= 1 && totalTroops - sacrificedTotal >= 1,
    sacrificedTotal,
    moraleLoss: 8,
    losses,
  };
}

/**
 * Artçı bırakıp kaçma kararını kampanya durumuna uygular.
 */
export function applySacrificeEscape(
  campaign: CampaignState,
  lord: LordAgent,
): {
  nextState: CampaignState;
  sacrificedTotal: number;
  moraleLoss: number;
} {
  const calc = calculateSacrificeEscape(campaign, lord);
  if (!calc.canEscape) {
    return { nextState: campaign, sacrificedTotal: 0, moraleLoss: 0 };
  }

  const nextRoster: TroopRoster = {
    militia: Math.max(0, campaign.roster.militia - (calc.losses.militia ?? 0)),
    archer: Math.max(0, campaign.roster.archer - (calc.losses.archer ?? 0)),
    cavalry: Math.max(0, campaign.roster.cavalry - (calc.losses.cavalry ?? 0)),
    guard: Math.max(0, campaign.roster.guard - (calc.losses.guard ?? 0)),
  };

  const nextState: CampaignState = {
    ...campaign,
    roster: nextRoster,
    morale: Math.max(20, campaign.morale - calc.moraleLoss),
    chronicle: [
      {
        id: `esc-${campaign.day}-${Date.now()}`,
        day: campaign.day,
        category: 'BATTLE',
        text: `${lord.title} ${lord.name} çemberinden çıkmak için ${calc.sacrificedTotal} artçı asker geride bırakılarak geri çekilindi.`,
      },
      ...campaign.chronicle,
    ].slice(0, 20),
  };

  return {
    nextState,
    sacrificedTotal: calc.sacrificedTotal,
    moraleLoss: calc.moraleLoss,
  };
}

/**
 * "Askerleri Gönder" (Send Troops / Auto-Resolve) muharebe simülasyonu.
 * İki tarafın gücüne ve oyuncunun Taktik (Tactics) becerisine göre sonucu hesaplar.
 */
export function simulateSendTroopsBattle(
  campaign: CampaignState,
  lord: LordAgent,
): {
  victory: boolean;
  losses: Partial<TroopRoster>;
  enemiesDefeated: number;
} {
  const playerStrength = getPlayerPartyStrength(campaign);
  const enemyStrength = getLordPartyStrength(lord);
  const tacticsLevel = campaign.skills?.tactics?.level ?? 25;
  const tacticsMultiplier = 1 + tacticsLevel * 0.0025;

  const effectivePlayerPower = playerStrength * tacticsMultiplier;
  const victory = effectivePlayerPower >= enemyStrength * 0.92;

  const totalTroops = Math.max(1, getTotalTroops(campaign.roster));
  const lossFraction = victory
    ? Math.min(0.45, Math.max(0.06, (enemyStrength / Math.max(1, effectivePlayerPower)) * 0.22))
    : Math.min(0.75, Math.max(0.35, (enemyStrength / Math.max(1, effectivePlayerPower)) * 0.42));

  let toLose = Math.max(
    victory ? 0 : 1,
    Math.min(totalTroops - 1, Math.round(totalTroops * lossFraction)),
  );
  const losses: Partial<TroopRoster> = {};
  const order: Array<keyof TroopRoster> = ['militia', 'archer', 'cavalry', 'guard'];
  for (const tier of order) {
    if (toLose <= 0) break;
    const avail = campaign.roster[tier] ?? 0;
    const take = Math.min(avail, toLose);
    if (take > 0) {
      losses[tier] = take;
      toLose -= take;
    }
  }

  const enemiesDefeated = victory
    ? Math.max(4, lord.armySize)
    : Math.max(1, Math.round(lord.armySize * (effectivePlayerPower / Math.max(1, enemyStrength)) * 0.5));

  return {
    victory,
    losses,
    enemiesDefeated,
  };
}

/**
 * Oyuncu kaçan zayıf bir haydut grubunu yakalayıp teslim olmaya zorladığında çalışır.
 * Oyuncu gücü haydut gücünün en az 1.8 katıysa haydutlar savaşmadan silah bırakır.
 */
export function resolveCorneredBanditSurrender(
  campaign: CampaignState,
  lord: LordAgent,
): {
  surrendered: boolean;
  nextState: CampaignState;
  prisonersGained: number;
  goldGained: number;
} {
  const playerStrength = getPlayerPartyStrength(campaign);
  const enemyStrength = getLordPartyStrength(lord);
  if (playerStrength < enemyStrength * 1.8) {
    return {
      surrendered: false,
      nextState: campaign,
      prisonersGained: 0,
      goldGained: 0,
    };
  }

  const prisonersGained = Math.max(2, Math.round(lord.armySize * 0.6));
  const goldGained = Math.max(35, Math.round(lord.armySize * 9));

  const nextLords = campaign.lords.map((l) => {
    if (l.id !== lord.id) return l;
    const nextSize = Math.max(8, Math.round(lord.armySize * 0.65));
    return {
      ...l,
      armySize: nextSize,
      x: Math.max(-460, Math.min(460, l.x + (l.x >= 0 ? -65 : 65))),
      z: Math.max(-340, Math.min(340, l.z + (l.z >= 0 ? -55 : 55))),
      currentAction: 'Bozguna uğradı, yeniden toplanıyor',
    };
  });

  const nextState: CampaignState = {
    ...campaign,
    gold: campaign.gold + goldGained,
    prisoners: campaign.prisoners + prisonersGained,
    renown: campaign.renown + 4,
    morale: Math.min(100, campaign.morale + 3),
    lords: nextLords,
    chronicle: [
      {
        id: `sur-${campaign.day}-${Date.now()}`,
        day: campaign.day,
        category: 'BATTLE',
        text: `Kıstırılan ${lord.name} çetesi sancağınızın gücü karşısında tek ok atmadan silah bıraktı (+${prisonersGained} Esir, +${goldGained} Dinar).`,
      },
      ...campaign.chronicle,
    ].slice(0, 20),
  };

  return {
    surrendered: true,
    nextState,
    prisonersGained,
    goldGained,
  };
}

/**
 * Oyuncu ezici düşman karşısında teslim olmayı seçtiğinde çalışır.
 */
export function applyPlayerSurrender(
  campaign: CampaignState,
  lord: LordAgent,
): {
  nextState: CampaignState;
  goldLost: number;
  foodLost: number;
} {
  const goldLost = Math.min(campaign.gold, Math.max(30, Math.round(campaign.gold * 0.35)));
  const foodLost = Math.min(campaign.food, Math.max(2, Math.round(campaign.food * 0.3)));

  const nextState: CampaignState = {
    ...campaign,
    gold: Math.max(0, campaign.gold - goldLost),
    food: Math.max(4, campaign.food - foodLost),
    morale: Math.max(20, campaign.morale - 12),
    chronicle: [
      {
        id: `cap-${campaign.day}-${Date.now()}`,
        day: campaign.day,
        category: 'BATTLE',
        text: `${lord.title} ${lord.name} kuvvetlerine karşı ağır haraç ve erzak bırakılarak esaretten kurtulundu (-${goldLost} Dinar).`,
      },
      ...campaign.chronicle,
    ].slice(0, 20),
  };

  return {
    nextState,
    goldLost,
    foodLost,
  };
}
