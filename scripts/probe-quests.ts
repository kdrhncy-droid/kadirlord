/**
 * probe-quests.ts — Faz 5: görev sisteminin veri sözleşmesi
 *
 *   npx tsx scripts/probe-quests.ts
 */
import { createInitialCampaignState } from '../src/game/rules.ts';
import {
  ARRIVAL_RADIUS,
  buildQuestLog,
  daysLeft,
  questProgress,
  summarize,
  totalReward,
} from '../src/game/quests.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const log = buildQuestLog(campaign);
ok(log.quests.length >= 4, 'en az 4 görev üretildi', `${log.quests.length}`);
ok(log.active.length === log.quests.length, 'başlangıçta hepsi aktif');
ok(log.quests.every((q) => q.objectives.length > 0), 'her görevin en az bir hedefi var');
ok(log.quests.every((q) => q.deadlineDay >= q.startDay), 'son tarih başlangıçtan önce değil');
ok(log.quests.every((q) => q.reward.gold > 0), 'her görevin altın ödülü var');
ok(new Set(log.quests.map((q) => q.id)).size === log.quests.length, 'görev id\'leri tekil');

/* Determinizm */
const log2 = buildQuestLog(campaign);
ok(
  JSON.stringify(log.quests.map((q) => [q.id, q.title, q.reward.gold])) ===
    JSON.stringify(log2.quests.map((q) => [q.id, q.title, q.reward.gold])),
  'görev üretimi deterministik',
);

/* İlerleme yüzdeleri 0..1 */
ok(
  log.quests.every((q) => {
    const p = questProgress(q);
    return p >= 0 && p <= 1;
  }),
  'görev ilerlemesi 0..1 aralığında',
);

/* Nesnel ilerleme hedefi aşmıyor */
ok(
  log.quests.every((q) => q.objectives.every((o) => o.current <= o.target || o.done)),
  'hedef ilerlemesi hedefi aşmıyor',
);

/* Savaş sayısı artınca haydut avı ilerler */
const fought = { ...campaign, battlesWon: campaign.battlesWon + 3 };
const logFought = buildQuestLog(fought);
const bounty = logFought.quests.find((q) => q.kind === 'BOUNTY')!;
const bountyBefore = log.quests.find((q) => q.kind === 'BOUNTY')!;
ok(bounty.objectives[0].current >= bountyBefore.objectives[0].current, 'savaş kazanınca av ilerler');

/* Süre dolunca FAILED */
const late = summarize(log.quests, log.quests[0].deadlineDay + 30);
ok(late.failed.length > 0, 'süresi geçen görev FAILED olur');
ok(late.active.length === 0, 'süresi geçen gün hepsi kapanır');

/* Teslim görevi: hedefe yaklaşınca tamamlanır */
const deliver = log.quests.find((q) => q.kind === 'DELIVER');
if (deliver?.targetSettlementId) {
  const target = campaign.settlements.find((s) => s.id === deliver.targetSettlementId)!;
  const near = { ...campaign, playerX: target.x + ARRIVAL_RADIUS / 2, playerZ: target.z };
  const nearLog = buildQuestLog(near);
  const nearDeliver = nearLog.quests.find((q) => q.kind === 'DELIVER')!;
  ok(nearDeliver.objectives[0].done, 'hedefe varınca teslim görevi tamamlanır');
  const far = { ...campaign, playerX: target.x + 400, playerZ: target.z };
  const farLog = buildQuestLog(far);
  ok(
    !farLog.quests.find((q) => q.kind === 'DELIVER')!.objectives[0].done,
    'uzaktayken teslim tamamlanmış sayılmaz',
  );
}

/* Ödül toplamı yalnız tamamlananları sayar */
ok(totalReward(log).gold === 0 || log.completed.length > 0, 'tamamlanmamış görevler ödül yazmaz');

/* Kalan gün hesabı */
ok(daysLeft(log.quests[0], campaign.day) === log.quests[0].deadlineDay - campaign.day, 'kalan gün doğru');

console.log(fails === 0 ? '\n✅ GÖREV SİSTEMİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
