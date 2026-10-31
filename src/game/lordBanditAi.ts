/**
 * lordBanditAi.ts — Canlı Haritada Lord vs Haydut Taktik AI ve Karşılaşma Motoru
 *
 * Bannerlord 1.2+ Standartları:
 * 1. Krallık lordları devriye gezerken yakınlarındaki (30m) zayıf haydut çetelerini kovalar.
 * 2. Haydutlar üstün güçteki lordlardan kaçar.
 * 3. Yakalama gerçekleştiğinde (mesafe <= 3.2m) lord haydutları muharebede mağlup eder;
 *    haydutlar dağıtılır, lord tutsak/moral kazanır, asker sayısı ve roster daima senkron kalır.
 * 4. Asker toplayan lordlar köylerde bir süre hareketsiz durup ("Recruiting") askerlerini toplar.
 */

import {
  CampaignState,
  ChronicleEvent,
  LordAgent,
  Settlement,
  getTotalTroops,
} from './rules';
import { LordLiveRouteState } from './campaignSystem';
import { computeLandPath } from './navigation';
import { getLordPartyStrength } from './encounter';

export interface LordTacticalAction {
  action: 'PURSUE' | 'FLEE' | 'NONE';
  targetLordId: string | null;
  targetPos: { x: number; z: number } | null;
  actionLabel: string;
}

/**
 * Bir lord veya haydutun diğer AI birliklerine (lord vs haydut) göre
 * kovalama veya kaçma taktik niyetini hesaplar.
 */
export function evaluateLordVsBanditTactics(params: {
  lord: LordAgent;
  route: LordLiveRouteState;
  allLords: LordAgent[];
  lordPositions: Map<string, { x: number; z: number }>;
  cooldowns?: Map<string, number>;
  nowSec?: number;
}): LordTacticalAction {
  const { lord, route, allLords, lordPositions, cooldowns, nowSec = 0 } = params;

  // Tutsak veya ölü birlikler taktik değerlendirmeye girmez
  if (lord.characterState === 'CAPTIVE' || lord.characterState === 'DEAD') {
    return { action: 'NONE', targetLordId: null, targetPos: null, actionLabel: '' };
  }

  // Cooldown kontrolü
  if (cooldowns && (cooldowns.get(lord.id) ?? 0) > nowSec) {
    return { action: 'NONE', targetLordId: null, targetPos: null, actionLabel: '' };
  }

  const myStrength = getLordPartyStrength(lord);

  // 1. Krallık Lordu: Yakındaki zayıf haydutları kovalama
  if (lord.faction !== 'bandits') {
    // Kuşatma yapan veya çok zayıf (ordusu erimiş) lordlar haydut kovalamaz
    if (lord.order?.kind === 'SIEGE' || lord.armySize < 10) {
      return { action: 'NONE', targetLordId: null, targetPos: null, actionLabel: '' };
    }

    let closestBandit: LordAgent | null = null;
    let closestBanditDist = 32; // 32 birim tespit menzili
    let closestBanditPos: { x: number; z: number } | null = null;

    for (const other of allLords) {
      if (other.faction !== 'bandits') continue;
      if (other.characterState === 'CAPTIVE' || other.characterState === 'DEAD') continue;
      if (cooldowns && (cooldowns.get(other.id) ?? 0) > nowSec) continue;

      const pos = lordPositions.get(other.id) ?? { x: other.x, z: other.z };
      const d = Math.hypot(route.x - pos.x, route.z - pos.z);
      if (d < closestBanditDist) {
        const banditStrength = getLordPartyStrength(other);
        // Lord hayduttan belirgin derecede güçlüyse kovalar
        if (myStrength >= banditStrength * 1.08) {
          closestBanditDist = d;
          closestBandit = other;
          closestBanditPos = pos;
        }
      }
    }

    if (closestBandit && closestBanditPos) {
      return {
        action: 'PURSUE',
        targetLordId: closestBandit.id,
        targetPos: closestBanditPos,
        actionLabel: `${closestBandit.name} çetesini kovalıyor`,
      };
    }
  }

  // 2. Haydut Çetesi: Yakındaki üstün krallık lordlarından kaçma
  if (lord.faction === 'bandits') {
    let dangerousLord: LordAgent | null = null;
    let closestLordDist = 26; // 26 birim kaçış menzili
    let dangerousLordPos: { x: number; z: number } | null = null;

    for (const other of allLords) {
      if (other.faction === 'bandits') continue;
      if (other.characterState === 'CAPTIVE' || other.characterState === 'DEAD') continue;

      const pos = lordPositions.get(other.id) ?? { x: other.x, z: other.z };
      const d = Math.hypot(route.x - pos.x, route.z - pos.z);
      if (d < closestLordDist) {
        const lordStrength = getLordPartyStrength(other);
        if (lordStrength >= myStrength * 0.9) {
          closestLordDist = d;
          dangerousLord = other;
          dangerousLordPos = pos;
        }
      }
    }

    if (dangerousLord && dangerousLordPos) {
      const dx = route.x - dangerousLordPos.x;
      const dz = route.z - dangerousLordPos.z;
      const len = Math.hypot(dx, dz) || 1;
      const retreatX = route.x + (dx / len) * 28;
      const retreatZ = route.z + (dz / len) * 28;

      return {
        action: 'FLEE',
        targetLordId: dangerousLord.id,
        targetPos: { x: retreatX, z: retreatZ },
        actionLabel: `${dangerousLord.title} ${dangerousLord.name} ordusundan kaçıyor`,
      };
    }
  }

  return { action: 'NONE', targetLordId: null, targetPos: null, actionLabel: '' };
}

export interface LordBanditClashResult {
  nextState: CampaignState;
  events: ChronicleEvent[];
  victorLordId: string;
  defeatedLordId: string;
  summaryText: string;
}

/**
 * Lord ve haydut haritada karşılaştığında (mesafe <= 3.2m) meydana gelen
 * muharebeyi deterministik olarak sonuçlandırır.
 */
export function resolveLordBanditClash(
  campaign: CampaignState,
  lord: LordAgent,
  bandit: LordAgent,
): LordBanditClashResult {
  const lordStr = getLordPartyStrength(lord);
  const banditStr = getLordPartyStrength(bandit);

  const lordWon = lordStr >= banditStr * 0.75;
  const victor = lordWon ? lord : bandit;
  const defeated = lordWon ? bandit : lord;

  // Haydut karargâhı: Karageçit Hisarı veya varsayılan güvenli koordinat
  const banditBase = campaign.settlements.find((s) => s.id === 'karagecit') ?? {
    x: -62,
    z: 102,
  };

  const updatedLords = campaign.lords.map((l) => {
    if (l.id === victor.id) {
      // Galip lord: 0-1 yaralı, +2 esir, +3 moral
      const woundedAdd = Math.random() < 0.35 ? 1 : 0;
      return {
        ...l,
        wounded: (l.wounded ?? 0) + woundedAdd,
        prisoners: (l.prisoners ?? 0) + Math.min(5, Math.max(1, Math.floor(defeated.armySize * 0.2))),
        morale: Math.min(100, (l.morale ?? 70) + 3),
      };
    }
    if (l.id === defeated.id) {
      if (defeated.faction === 'bandits') {
        // Mağlup haydut: ordu dağıtıldı, güvenli üsse ışınla ve toparlanma süreci ver
        const respawnRoster = { infantry: 6, archer: 2, cavalry: 1, horseArcher: 0 };
        const respawnSize = getTotalTroops(respawnRoster);
        return {
          ...l,
          x: banditBase.x + (Math.random() - 0.5) * 6,
          z: banditBase.z + (Math.random() - 0.5) * 6,
          targetX: banditBase.x,
          targetZ: banditBase.z,
          armySize: respawnSize,
          roster: respawnRoster,
          wounded: 0,
          prisoners: 0,
          morale: 50,
          currentAction: 'Bozgun sonrası Karageçit eteklerinde yeniden toplanıyor',
        };
      }
      return l;
    }
    return l;
  });

  const summary = `${victor.title} ${victor.name}, ${defeated.name} çetesini muharebede bozguna uğrattı!`;
  const event: ChronicleEvent = {
    id: `event-clash-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    day: campaign.day,
    category: 'WAR',
    text: summary,
  };

  return {
    nextState: {
      ...campaign,
      lords: updatedLords,
    },
    events: [event],
    victorLordId: victor.id,
    defeatedLordId: defeated.id,
    summaryText: summary,
  };
}

/**
 * Lord yerleşkeye vardığında hareketsiz kalarak asker toplama sürecini yönetir.
 *
 * Bannerlord İlkesi:
 * Lord köyün kapısına geldiğinde haritada fırıl fırıl dönmez;
 * hızı 0'a çekilir, `isWaiting = true` yapılır, 8 saniye (~4 oyun saati)
 * köyde kalarak gönüllü toplar ve ardından yoluna devam eder.
 */
export function processLordVillageRecruiting(params: {
  lord: LordAgent;
  route: LordLiveRouteState;
  village: Settlement;
  dt: number;
  timeScale: number;
}): {
  isFinished: boolean;
  recruitedRosterDelta?: Partial<Record<'infantry' | 'archer' | 'cavalry' | 'horseArcher', number>>;
} {
  const { route, village, dt, timeScale } = params;

  // Başlangıç: sayaç yoksa 8 saniye (4 oyun saati) bekleme başlat
  if (route.recruitingTimer === undefined) {
    route.isWaiting = true;
    route.recruitingTimer = 8.0;
    route.waypoints = [];
    route.currentAction = `${village.name} köyünden asker topluyor`;
    return { isFinished: false };
  }

  // Sayaç ilerlet
  route.recruitingTimer -= dt * timeScale;

  if (route.recruitingTimer <= 0) {
    // Bekleme bitti; askerleri teslim al
    route.isWaiting = false;
    route.recruitingTimer = undefined;

    const pool = village.recruitPool;
    const canRecruitInf = Math.min(pool.infantry, 2);
    const canRecruitArch = Math.min(pool.archer, 1);

    const delta = {
      infantry: canRecruitInf,
      archer: canRecruitArch,
      cavalry: 0,
      horseArcher: 0,
    };

    pool.infantry -= canRecruitInf;
    pool.archer -= canRecruitArch;

    route.currentAction = `${village.name} köyünden devriyeye çıkıyor`;
    return { isFinished: true, recruitedRosterDelta: delta };
  }

  return { isFinished: false };
}
