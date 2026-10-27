/**
 * probe-recruitment.ts — Faz 8: asker toplama kuralları
 *
 *   npx tsx scripts/probe-recruitment.ts
 */
import {
  advanceDailyEconomyAndWorld,
  createInitialCampaignState,
  getTotalTroops,
  type UnitTierId,
} from '../src/game/rules.ts';
import { stepLiveLordSettlementRecruitment } from '../src/game/worldSim.ts';
import {
  partyLimit,
  partyRoom,
  partySize,
  poolTotal,
  recruitBatch,
  recruitCostModifier,
  recruitPoolCap,
  recruitQuote,
  recruitRelationGate,
  refreshRecruitPools,
  validateRecruitment,
} from '../src/game/recruitment.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const town = campaign.settlements.find((s) => s.type === 'TOWN')!;
const village = campaign.settlements.find((s) => s.type === 'VILLAGE')!;
const unit = (Object.keys(town.recruitPool) as UnitTierId[]).find((u) => (town.recruitPool[u] ?? 0) > 1)!;

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* 1. Parti kapasitesi */
ok(partyLimit(campaign) >= 20, 'parti kapasitesi taban 20+', `${partyLimit(campaign)}`);
ok(partySize(campaign) === getTotalTroops(campaign.roster), 'parti mevcudu orduyla aynı');
ok(partyRoom(campaign) === Math.max(0, partyLimit(campaign) - partySize(campaign)), 'boş yer hesabı doğru');

/* 2. İlişki kapısı */
ok(recruitRelationGate(0).allowed, 'nötr ilişkide toplama serbest');
ok(!recruitRelationGate(-30).allowed, 'ilişki −30 iken toplama reddedilir');
ok(recruitRelationGate(-19).allowed, 'ilişki −19 sınırda serbest');

/* 3. Ücret çarpanı */
ok(recruitCostModifier(100) < 1, 'iyi ilişki indirim yapar');
ok(recruitCostModifier(-100) > 1, 'kötü ilişki zam yapar');
ok(recruitCostModifier(0) === 1, 'nötr ilişkide taban ücret');
ok(recruitCostModifier(500) >= 0.85 && recruitCostModifier(-500) <= 1.15, 'çarpan sınır içinde');

/* 4. Teklif */
const q = recruitQuote(campaign, town, unit, 0);
ok(q.unitCost === q.baseCost, 'nötr ilişkide birim ücret taban');
ok(q.maxRecruitable <= q.available, 'teklif havuzu aşmıyor');
ok(q.maxRecruitable <= q.maxAffordableByRoom, 'teklif parti kapasitesini aşmıyor');
ok(!!q.blockedReason === (q.maxRecruitable === 0), 'engel varsa miktar 0');

const blocked = recruitQuote(campaign, town, unit, -40);
ok(blocked.maxRecruitable === 0 && !!blocked.blockedReason, 'ilişki kapısı teklifi kapatıyor');

/* 5. Toplu toplama */
const before = partySize(campaign);
const res = recruitBatch(campaign, town.id, unit, 3, 0);
ok(res.success, 'toplu toplama başarılı', res.reason ?? '');
ok(res.recruited >= 1 && res.recruited <= 3, 'miktar 1..3', `${res.recruited}`);
const after = partySize(res.nextState);
ok(after === before + res.recruited, 'ordu mevcudu kadar arttı', `${before}→${after}`);
ok(res.nextState.gold === campaign.gold - res.totalCost, 'altın tam olarak düşüldü');
ok(
  res.nextState.settlements.find((s) => s.id === town.id)!.recruitPool[unit] ===
    (town.recruitPool[unit] ?? 0) - res.recruited,
  'havuz azaldı',
);

/* 6. İndirim gerçekten uygulanıyor */
const cheap = recruitBatch(campaign, town.id, unit, 1, 80);
const normal = recruitBatch(campaign, town.id, unit, 1, 0);
ok(cheap.totalCost < normal.totalCost, 'iyi ilişkide daha az ödenir', `${cheap.totalCost} < ${normal.totalCost}`);

/* 7. İlişki kapısı toplamayı engelliyor */
const refused = recruitBatch(campaign, town.id, unit, 2, -50);
ok(!refused.success && refused.recruited === 0, 'ilişki kötüyken toplama reddedilir');
ok(refused.nextState === campaign, 'reddedilen işlem durumu değiştirmez');

/* 8. Geçersiz girdiler */
ok(!recruitBatch(campaign, 'yok', unit, 1).success, 'bilinmeyen yerleşim reddedilir');
ok(!recruitBatch(campaign, town.id, unit, 0).success, 'sıfır miktar reddedilir');

/* 9. Günlük kilit yok + toplu tazeleme yok (10.7: Bannerlord'da yerleşim
      başına 1 günlük toplama kilidi ve 3 günde bir toplu dolum yoktur;
      gönüllüler günlük üretimle azar azar gelir — günlük tik rules.ts'tedir.) */
const sameDayAgain = recruitBatch(res.nextState, town.id, unit, 1, 0);
ok(sameDayAgain.success && sameDayAgain.recruited === 1, 'aynı gün aynı yerleşimden tekrar asker toplanabilir');
const refreshed = refreshRecruitPools(campaign.settlements, 3);
ok(refreshed === campaign.settlements, 'toplu (3 günlük) tazeleme artık yok — üretim günlük tikte');
ok(recruitPoolCap('TOWN') >= recruitPoolCap('VILLAGE'), 'şehir havuz tavanı köyden küçük değil');
void poolTotal;

/* 10. Genel tutarlılık */
ok(validateRecruitment(campaign).length === 0, 'kampanya toplama açısından tutarlı');
ok(validateRecruitment(res.nextState).length === 0, 'toplama sonrası da tutarlı');

/* 11. Lord/Kral/Leydi köyden/şehirden asker topladığında 1 gün boyunca o yerleşimde asker kalmamalı */
const vLord = campaign.lords.find((l) => l.faction !== 'bandits')!;
const targetVillage = campaign.settlements.find(
  (s) => s.type === 'VILLAGE' && s.faction === vLord.faction && poolTotal(s) > 0,
)!;
const smallRoster = { infantry: 8, archer: 4, cavalry: 2, horseArcher: 0 };
const prepState = {
  ...campaign,
  lords: campaign.lords.map((l) =>
    l.id === vLord.id
      ? { ...l, x: targetVillage.x + 1.5, z: targetVillage.z + 1.5, roster: smallRoster, armySize: 14 }
      : l,
  ),
};
const afterLordRecruit = stepLiveLordSettlementRecruitment(prepState);
const updatedLord = afterLordRecruit.lords.find((l) => l.id === vLord.id)!;
const updatedVillage = afterLordRecruit.settlements.find((s) => s.id === targetVillage.id)!;
ok(updatedLord.armySize > 14, 'köye varan lord beklemeden gönüllü toplayıp asker sayısını artırıyor', `14 → ${updatedLord.armySize}`);
ok(
  poolTotal(updatedVillage) === 0 && updatedVillage.lastLordRecruitDay === afterLordRecruit.day,
  'lordun asker topladığı köyde gönüllü havuzu sıfırlanıyor ve gün kilidi yazılıyor',
);
const quoteBlockedToday = recruitQuote(afterLordRecruit, updatedVillage, 'infantry', 20);
ok(
  quoteBlockedToday.maxRecruitable === 0 && Boolean(quoteBlockedToday.blockedReason),
  'lordun asker topladığı köyden aynı gün oyuncu veya başka bir lord asker toplayamıyor',
);
const nextDayState = advanceDailyEconomyAndWorld(afterLordRecruit);
const nextDayVillage = nextDayState.settlements.find((s) => s.id === targetVillage.id)!;
ok(
  nextDayVillage.lastLordRecruitDay === undefined && poolTotal(nextDayVillage) > 0,
  'ertesi gün (1 gün sonra) köyde yeniden gönüllü üretiliyor ve kilit kalkıyor',
);

console.log(fails === 0 ? '\n✅ ASKER TOPLAMA KURALLARI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
