/**
 * quests.ts — Faz 5: görev (quest) sistemi
 *
 * Bannerlord'un görev yapısını sadeleştirerek modeller:
 *  - **Görev**: bir veren (lord/yerleşim), tür, hedefler, süre, ödül.
 *  - **Hedef (objective)**: ilerlemesi kampanya durumundan okunabilen tek bir ölçüt
 *    (ör. "3 haydut partisi yen", "Varnovapol'a teslim et").
 *  - İlerleme **saklanmaz**, kampanya durumundan türetilir (deterministik, kayıt
 *    uyumsuzluğu yok). Böylece görev günlüğü her zaman tutarlıdır.
 *
 * Tasarım kararı: görevler kampanya başlangıcında **deterministik** üretilir;
 * dünya durumu değiştikçe ilerleme kendiliğinden güncellenir.
 */
import type { CampaignState, FactionId, Settlement } from './rules.ts';

export type QuestKind =
  | 'BOUNTY' // haydut avı
  | 'DELIVER' // kargo teslimi
  | 'ESCORT' // kervan/lord koruma
  | 'PATROL' // bölge devriyesi
  | 'RECRUIT'; // asker toplama (Faz 8 ile bağlanacak)

export type QuestStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED';

export interface QuestObjective {
  /** Tekil anahtar — UI'da ilerleme çubuğu için. */
  key: string;
  /** Görünen metin, ör. "Haydut partisi yen". */
  label: string;
  current: number;
  target: number;
  done: boolean;
}

export interface QuestReward {
  gold: number;
  renown: number;
  /** İlişki artışı (görevi verenle). */
  relation: number;
}

export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  /** Kısa açıklama — diyalog ve günlük aynı metni kullanır. */
  description: string;
  /** Görevi veren lord id'si (yoksa yerleşim). */
  giverLordId?: string;
  giverName: string;
  giverClanId?: string;
  /** Hedef yerleşim (teslim/escort). */
  targetSettlementId?: string;
  /** Çıkış yerleşimi (escort: kervanın beklediği yer). */
  originSettlementId?: string;
  targetSettlementName?: string;
  faction: FactionId;
  /** Görevin kabul edildiği gün (0 = başlangıçta verilmiş). */
  startDay: number;
  /** Son teslim günü. */
  deadlineDay: number;
  status: QuestStatus;
  objectives: QuestObjective[];
  reward: QuestReward;
  /** Günlükte gösterilen ipucu. */
  hint: string;
}

export interface QuestLog {
  quests: Quest[];
  active: Quest[];
  completed: Quest[];
  failed: Quest[];
  /** Günlük özeti — HUD'da tek satır. */
  summary: string;
}

/** Oyuncunun "yerleşime vardı" sayıldığı yarıçap (harita birimi). */
export const ARRIVAL_RADIUS = 6;

export const QUEST_KIND_LABELS: Record<QuestKind, string> = {
  BOUNTY: 'Haydut Avı',
  DELIVER: 'Kargo Teslimi',
  ESCORT: 'Kervan Koruma',
  PATROL: 'Bölge Devriyesi',
  RECRUIT: 'Asker Toplama',
};

export const QUEST_KIND_ICONS: Record<QuestKind, string> = {
  BOUNTY: '⚔',
  DELIVER: '📦',
  ESCORT: '🛡',
  PATROL: '👁',
  RECRUIT: '🏹',
};

/* ─────────────────────────── yardımcılar ─────────────────────────── */

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: readonly T[], seed: number, salt: string): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[(hash32(`${seed}:${salt}`) >>> 0) % arr.length];
}

/* ─────────────────────────── görev üretimi ─────────────────────────── */

/**
 * Kampanyadan deterministik görev günlüğü üretir.
 *
 * Aynı kampanya durumu → aynı görevler. Hedefler **mevcut** dünya durumuna göre
 * hesaplanır; ör. teslim görevinin hedef yerleşimi oyuncunun bulunduğu yerden
 * farklı bir şehirdir.
 */
export function buildQuestLog(campaign: CampaignState, nowDay = campaign.day): QuestLog {
  const towns = campaign.settlements.filter((s) => s.type !== 'VILLAGE');
  const villages = campaign.settlements.filter((s) => s.type === 'VILLAGE');
  const lords = campaign.lords.filter((l) => l.faction !== 'bandits');
  const seed = hash32(`${campaign.playerName}:${campaign.backgroundId}`);

  const quests: Quest[] = [];
  const day = campaign.day;

  // 1) Haydut avı — savaş kazanma sayacına bağlı.
  const bountyGiver = pick(lords, seed, 'bounty-giver');
  if (bountyGiver) {
    const target = 3 + (seed % 3);
    const killed = Math.min(target, campaign.battlesWon);
    quests.push({
      id: 'quest-bounty',
      kind: 'BOUNTY',
      title: `${bountyGiver.name} için haydut avı`,
      description:
        'Yolları kesen haydut sürülerini dağıt. Her temizlenen sürü, ticaret yollarını biraz daha güvenli kılar.',
      giverLordId: bountyGiver.id,
      giverName: bountyGiver.name,
      faction: bountyGiver.faction,
      startDay: day,
      deadlineDay: day + 20,
      status: 'ACTIVE',
      objectives: [
        {
          key: 'battles',
          label: 'Haydut sürüsü dağıt',
          current: killed,
          target,
          done: killed >= target,
        },
      ],
      reward: { gold: 420, renown: 12, relation: 4 },
      hint: 'Haritada kırmızı haydut partilerini bul; vardığında savaş başlar.',
    });
  }

  // 2) Kargo teslimi — oyuncunun bulunduğu yerden başka bir şehre.
  const deliverTarget = pick(
    towns.filter((t) => t.faction !== 'bandits'),
    seed,
    'deliver-target',
  );
  const deliverGiver = pick(lords, seed, 'deliver-giver');
  if (deliverTarget && deliverGiver) {
    const distance = Math.round(
      Math.hypot(deliverTarget.x - campaign.playerX, deliverTarget.z - campaign.playerZ),
    );
    const arrived = distance <= ARRIVAL_RADIUS;
    quests.push({
      id: 'quest-deliver',
      kind: 'DELIVER',
      title: `${deliverTarget.name}'a mühürlü kargo`,
      description: `${deliverGiver.name}, ${deliverTarget.name} ticaret loncasına ulaştırılmak üzere mühürlü bir sandık verdi. Sandığı açmadan teslim et.`,
      giverLordId: deliverGiver.id,
      giverName: deliverGiver.name,
      faction: deliverGiver.faction,
      targetSettlementId: deliverTarget.id,
      targetSettlementName: deliverTarget.name,
      startDay: day,
      deadlineDay: day + 12,
      status: 'ACTIVE',
      objectives: [
        {
          key: 'travel',
          label: `${deliverTarget.name} kapısına ulaş`,
          current: arrived ? 1 : 0,
          target: 1,
          done: arrived,
        },
      ],
      reward: { gold: 260 + distance, renown: 6, relation: 3 },
      hint: `Hedef yaklaşık ${distance} birim uzakta; haritada sancağı oraya yürüt.`,
    });
  }

  // 3) Kervan koruma — bir köyden şehre erzak taşıma.
  const escortFrom = pick(villages, seed, 'escort-from');
  const escortTo = pick(towns, seed, 'escort-to');
  if (escortFrom && escortTo && escortTo.id !== escortFrom.id) {
    const escortArrived =
      Math.hypot(escortTo.x - campaign.playerX, escortTo.z - campaign.playerZ) <= ARRIVAL_RADIUS;
    quests.push({
      id: 'quest-escort',
      kind: 'ESCORT',
      title: `${escortFrom.name} kervanını koru`,
      description: `${escortFrom.name} muhtarı, ${escortTo.name} pazarına giden erzak kervanına eşlik etmeni istiyor. Yol boyunca haydut baskını riski var.`,
      giverName: `${escortFrom.name} Muhtarı`,
      faction: escortFrom.faction,
      targetSettlementId: escortTo.id,
      targetSettlementName: escortTo.name,
      originSettlementId: escortFrom.id,
      startDay: day,
      deadlineDay: day + 8,
      status: 'ACTIVE',
      objectives: [
        {
          key: 'reach',
          label: `Kervanla ${escortTo.name}'a var`,
          current: escortArrived ? 1 : 0,
          target: 1,
          done: escortArrived,
        },
        {
          key: 'safe',
          label: 'Kervanı kayıpsız götür',
          current: escortArrived ? 1 : 0,
          target: 1,
          done: escortArrived,
        },
      ],
      reward: { gold: 340, renown: 9, relation: 4 },
      hint: 'Kervan senin hızına uyar; çok yavaşlarsan süre dolar.',
    });
  }

  // 4) Bölge devriyesi — orduda yeterli asker istiyor.
  const patrolTarget = pick(towns, seed, 'patrol');
  if (patrolTarget) {
    const troops = Object.values(campaign.roster).reduce((a, b) => a + b, 0);
    const patrolArrived =
      Math.hypot(patrolTarget.x - campaign.playerX, patrolTarget.z - campaign.playerZ) <=
      ARRIVAL_RADIUS;
    const need = 12;
    quests.push({
      id: 'quest-patrol',
      kind: 'PATROL',
      title: `${patrolTarget.name} çevresinde devriye`,
      description: `${patrolTarget.name} garnizon komutanı, surların dışında düzenli devriye istiyor. En az ${need} askerle çık.`,
      giverName: `${patrolTarget.name} Garnizon Komutanı`,
      faction: patrolTarget.faction,
      targetSettlementId: patrolTarget.id,
      targetSettlementName: patrolTarget.name,
      startDay: day,
      deadlineDay: day + 10,
      status: 'ACTIVE',
      objectives: [
        {
          key: 'troops',
          label: `Orduda ${need} asker topla`,
          current: Math.min(troops, need),
          target: need,
          done: troops >= need,
        },
        {
          key: 'patrol',
          label: `${patrolTarget.name} surlarına dön`,
          current: patrolArrived && troops >= need ? 1 : 0,
          target: 1,
          done: patrolArrived && troops >= need,
        },
      ],
      reward: { gold: 300, renown: 8, relation: 3 },
      hint: 'Köylerden asker topla (Faz 8) veya esirleri sancağına kat.',
    });
  }

  // 5) Asker toplama — Faz 8 ile bağlanacak.
  const recruitTarget = pick(villages, seed, 'recruit');
  if (recruitTarget) {
    const troops = Object.values(campaign.roster).reduce((a, b) => a + b, 0);
    quests.push({
      id: 'quest-recruit',
      kind: 'RECRUIT',
      title: `${recruitTarget.name}'dan gönüllü topla`,
      description: `${recruitTarget.name} muhtarı, sancağına katılmak isteyen gönüllüler olduğunu söylüyor. En az 25 kişilik bir birlikle geri dön.`,
      giverName: `${recruitTarget.name} Muhtarı`,
      faction: recruitTarget.faction,
      targetSettlementId: recruitTarget.id,
      targetSettlementName: recruitTarget.name,
      startDay: day,
      deadlineDay: day + 15,
      status: 'ACTIVE',
      objectives: [
        {
          key: 'party',
          label: 'Ordunu 25 askere çıkar',
          current: Math.min(troops, 25),
          target: 25,
          done: troops >= 25,
        },
      ],
      reward: { gold: 180, renown: 5, relation: 2 },
      hint: 'Köy muhtarıyla konuş (diyalog ekranı, Faz 6).',
    });
  }

  return summarize(quests, nowDay);
}

/** Görevleri durumlarına göre gruplar, süresi dolanları FAILED yapar. */
export function summarize(quests: Quest[], nowDay: number): QuestLog {
  const resolved = quests.map((q) => {
    const allDone = q.objectives.every((o) => o.done);
    if (allDone) return { ...q, status: 'COMPLETED' as QuestStatus };
    if (nowDay > q.deadlineDay) return { ...q, status: 'FAILED' as QuestStatus };
    return { ...q, status: 'ACTIVE' as QuestStatus };
  });

  const active = resolved.filter((q) => q.status === 'ACTIVE');
  const completed = resolved.filter((q) => q.status === 'COMPLETED');
  const failed = resolved.filter((q) => q.status === 'FAILED');

  return {
    quests: resolved,
    active,
    completed,
    failed,
    summary:
      active.length === 0
        ? completed.length > 0
          ? 'Tüm görevler tamam'
          : 'Görev yok'
        : `${active.length} aktif görev · ${completed.length} tamamlandı`,
  };
}

/** Görev ilerleme oranı (0..1) — UI çubuğu. */
export function questProgress(quest: Quest): number {
  if (quest.objectives.length === 0) return 0;
  const total = quest.objectives.reduce((sum, o) => sum + Math.min(1, o.current / Math.max(1, o.target)), 0);
  return total / quest.objectives.length;
}

/** Kalan gün (negatif = süresi geçmiş). */
export function daysLeft(quest: Quest, nowDay: number): number {
  return quest.deadlineDay - nowDay;
}

/** Görev günlüğündeki toplam ödül (tamamlanabilir görevler için). */
export function totalReward(log: QuestLog): QuestReward {
  return log.quests.reduce(
    (acc, q) => {
      if (q.status !== 'COMPLETED') return acc;
      return {
        gold: acc.gold + q.reward.gold,
        renown: acc.renown + q.reward.renown,
        relation: acc.relation + q.reward.relation,
      };
    },
    { gold: 0, renown: 0, relation: 0 },
  );
}

/**
 * Hedef yerleşime varış bildirimi — harita hareketi bu fonksiyonu çağırır.
 * (Faz 5: yalnız teslim/escort/devriye hedefleri.)
 */
export function registerArrival(quests: Quest[], settlement: Settlement): Quest[] {
  return quests.map((q) => {
    if (q.status !== 'ACTIVE' || q.targetSettlementId !== settlement.id) return q;
    return {
      ...q,
      objectives: q.objectives.map((o) => {
        if (o.key === 'travel' || o.key === 'reach' || o.key === 'patrol') {
          return { ...o, current: o.target, done: true };
        }
        if (o.key === 'safe') return { ...o, current: 1, done: true };
        return o;
      }),
    };
  });
}
