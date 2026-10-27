/**
 * recruitment.ts — Faz 8: asker toplama kuralları
 *
 * Bannerlord'da asker toplama üç şeye bağlıdır:
 *  1. **Parti kapasitesi** — klan kademesi ve nüfuz ile artar; doluysa kimse alınmaz.
 *  2. **Yerleşkenin havuzu** — köy/şehir/kale farklı birlikler ve farklı hızda tazelenir.
 *  3. **İlişki** — düşman lordlarla ilişki kötüyse muhtar asker vermez.
 *
 * Bu modül saf fonksiyonlar içerir; kampanya durumunu yalnız `recruitBatch` değiştirir.
 */
import {
  UNIT_DEFINITIONS,
  getTotalTroops,
  recruitUnit,
  type CampaignState,
  type Settlement,
  type UnitTierId,
} from './rules.ts';
import { getPartyLimit } from './partySystem.ts';
import { getPlayerCultureModifiers } from './cultureBonuses.ts';

/**
 * Parti kapasitesi — tek kaynak `partySystem.getPartyLimit` (10.5):
 * 20 taban + klan kademesi + İaşeci İdare×0.25. Eski `+ Nam/40` uydurmaydı;
 * nam yalnız klan kademesi üzerinden etki eder.
 */
export function partyLimit(campaign: CampaignState): number {
  return getPartyLimit(campaign);
}

export function partySize(campaign: CampaignState): number {
  return getTotalTroops(campaign.roster);
}

export function partyRoom(campaign: CampaignState): number {
  return Math.max(0, partyLimit(campaign) - partySize(campaign));
}

/** İlişki asker toplamayı açıyor mu? (-20 altı reddeder.) */
export function recruitRelationGate(relation: number): { allowed: boolean; reason?: string } {
  if (relation <= -20) {
    return {
      allowed: false,
      reason: 'Muhtar seninle çalışmayı reddediyor (ilişki −20 altında). Önce ilişkini düzelt.',
    };
  }
  return { allowed: true };
}

/**
 * İlişkiye göre ücret çarpanı: iyi ilişki indirim, kötü ilişki zam.
 * ±%15 sınırında tutulur.
 */
export function recruitCostModifier(relation: number): number {
  const raw = 1 - relation / 400;
  return Math.max(0.85, Math.min(1.15, Math.round(raw * 100) / 100));
}

export interface RecruitQuote {
  unitId: UnitTierId;
  name: string;
  role: string;
  available: number;
  /** İlişki indirimi/zammı uygulanmış birim ücret. */
  unitCost: number;
  baseCost: number;
  dailyWage: number;
  /** Parti kapasitesi nedeniyle alınabilecek en fazla. */
  maxAffordableByRoom: number;
  /** Altın nedeniyle alınabilecek en fazla. */
  maxAffordableByGold: number;
  /** Gerçekte alınabilecek miktar (0 = alınamaz). */
  maxRecruitable: number;
  blockedReason: string | null;
}

/** Bir birliğin toplama teklifi — UI ve testler aynı hesabı kullanır. */
export function recruitQuote(
  campaign: CampaignState,
  settlement: Settlement,
  unitId: UnitTierId,
  relation = 0,
): RecruitQuote {
  const def = UNIT_DEFINITIONS[unitId];
  const available = settlement.recruitPool[unitId] ?? 0;
  const modifier = recruitCostModifier(relation);
  // 10.8: Kuzait feat'i — atlı birlik devşirme %10 ucuz.
  const cultureModifier = def.isMounted
    ? getPlayerCultureModifiers(campaign).mountedRecruitCostMultiplier
    : 1;
  const unitCost = Math.max(1, Math.round(def.recruitCost * modifier * cultureModifier));
  const room = partyRoom(campaign);
  const byRoom = Math.floor(room);
  const byGold = unitCost > 0 ? Math.floor(campaign.gold / unitCost) : 0;
  const gate = recruitRelationGate(relation);

  const depletedToday = settlement.lastLordRecruitDay === campaign.day;
  const effectiveAvailable = depletedToday ? 0 : available;

  let blockedReason: string | null = null;
  if (!gate.allowed) blockedReason = gate.reason ?? null;
  else if (depletedToday)
    blockedReason =
      'Bu yerleşimdeki gönüllüler bugün başka bir sancakbeyi tarafından toplandı (1 gün boyunca yeni gönüllü çıkmaz).';
  else if (effectiveAvailable <= 0) blockedReason = 'Yerleşkede bu birlikten gönüllü kalmadı.';
  else if (room <= 0) blockedReason = 'Parti kapasitesi dolu — önce asker terhis et veya klan kademeni yükselt.';
  else if (campaign.gold < unitCost) blockedReason = 'Yetersiz dinar.';

  const maxRecruitable = blockedReason
    ? 0
    : Math.max(0, Math.min(effectiveAvailable, byRoom, byGold));

  return {
    unitId,
    name: def.name,
    role: def.role,
    available: effectiveAvailable,
    unitCost,
    baseCost: def.recruitCost,
    dailyWage: def.dailyWage,
    maxAffordableByRoom: byRoom,
    maxAffordableByGold: byGold,
    maxRecruitable,
    blockedReason,
  };
}

export interface RecruitResult {
  success: boolean;
  nextState: CampaignState;
  recruited: number;
  totalCost: number;
  reason?: string;
}

/**
 * Toplu asker toplama. Parti kapasitesi, altın, havuz ve ilişki kapısı birlikte
 * denetlenir; istenen miktar mümkün olan en yakın değere kırpılır.
 */
export function recruitBatch(
  campaign: CampaignState,
  settlementId: string,
  unitId: UnitTierId,
  amount: number,
  relation = 0,
): RecruitResult {
  const settlement = campaign.settlements.find((s) => s.id === settlementId);
  if (!settlement) {
    return { success: false, nextState: campaign, recruited: 0, totalCost: 0, reason: 'Yerleşim bulunamadı.' };
  }
  if (amount <= 0) {
    return { success: false, nextState: campaign, recruited: 0, totalCost: 0, reason: 'Geçersiz miktar.' };
  }

  const quote = recruitQuote(campaign, settlement, unitId, relation);
  if (quote.maxRecruitable <= 0) {
    return {
      success: false,
      nextState: campaign,
      recruited: 0,
      totalCost: 0,
      reason: quote.blockedReason ?? 'Asker toplanamadı.',
    };
  }

  const take = Math.min(amount, quote.maxRecruitable);
  let state = campaign;
  let recruited = 0;
  let totalCost = 0;

  for (let i = 0; i < take; i++) {
    // İlişki indirimi: ücret farkını altına geri ekleyerek uygularız.
    const res = recruitUnit(state, settlementId, unitId, 1);
    if (!res.success) break;
    state = res.nextState;
    recruited += 1;
    totalCost += quote.unitCost;
  }

  if (recruited === 0) {
    return { success: false, nextState: campaign, recruited: 0, totalCost: 0, reason: 'Asker toplanamadı.' };
  }

  // Altın: `recruitUnit` her asker için **taban** ücreti düşürür; ilişki
  // indirimi/zammı uygulanmış gerçek tutarı yazıyoruz (tek kaynak: totalCost).
  // Günlük kilit işareti yazılmaz — Bannerlord'da böyle bir kural yok (10.7).
  state = {
    ...state,
    gold: Math.max(0, campaign.gold - totalCost),
  };

  return { success: true, nextState: state, recruited, totalCost };
}

/** Yerleşim havuzunun üst sınırı (tipine göre). */
export function recruitPoolCap(type: Settlement['type']): number {
  return type === 'TOWN' ? 14 : type === 'CASTLE' ? 10 : 10;
}

/**
 * Havuz tazeleme — Bannerlord modeli (10.7): gönüllüler **her gün** azar azar
 * üretilir (`GetDailyVolunteerProductionProbability`); 3 günde bir toplu dolum
 * ve toplanmış yuvaların toplu sıfırlanması Bannerlord'da yoktur.
 *
 * Günlük üretim tek yerden, `rules.ts` günlük tikinden yapılır (havuz artışı +
 * günde 2 toplanmış yuvanın geri açılması). Bu fonksiyon eski çağrı uyumu için
 * durur ve artık toplu tazeleme yapmaz.
 */
export function refreshRecruitPools(settlements: Settlement[], _day: number): Settlement[] {
  return settlements;
}

/** Toplam havuz (UI özeti). */
export function poolTotal(settlement: Settlement): number {
  return Object.values(settlement.recruitPool).reduce((a, b) => a + b, 0);
}

/** Doğrulama — probe'lar kullanır. */
export function validateRecruitment(campaign: CampaignState): string[] {
  const problems: string[] = [];
  const limit = partyLimit(campaign);
  const size = partySize(campaign);
  if (limit < 10) problems.push('parti kapasitesi çok düşük');
  if (size > limit) problems.push('ordu kapasiteyi aşıyor');
  if (recruitCostModifier(100) < 0.85 || recruitCostModifier(-100) > 1.15) {
    problems.push('ücret çarpanı sınır dışı');
  }
  for (const s of campaign.settlements) {
    if (poolTotal(s) < 0) problems.push(`${s.id}: negatif havuz`);
  }
  return problems;
}
