/**
 * probe-content.ts — Yerleşim adları ve içerik tutarlılığı (Faz 10b)
 *
 *   npx tsx scripts/probe-content.ts
 *
 * Bannerlord'un Türkçe yerelleştirmesinde kaleler **"… Kalesi"** ekiyle yazılır
 * ("Lochana Kalesi"), şehir ve köyler yalın addır ("Lycaron", "Canterion").
 * İngilizce sürümdeki " Castle" eki TR arayüzde hata olarak görünüyordu.
 */
import { createInitialCampaignState } from '../src/game/rules.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const settlements = campaign.settlements;

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const castles = settlements.filter((s) => s.type === 'CASTLE');
const towns = settlements.filter((s) => s.type === 'TOWN');
const villages = settlements.filter((s) => s.type === 'VILLAGE');

/* ── 1. Dil: İngilizce yerleşim türü eki kalmadı ── */
const englishSuffix = /(^|\s)(Castle|Village|Town|Keep|Fort|Fortress)\b/i;
const englishNames = settlements.filter((s) => englishSuffix.test(s.name));
ok(
  englishNames.length === 0,
  'hiçbir yerleşim adında İngilizce tür eki yok',
  englishNames.slice(0, 3).map((s) => s.name).join(', '),
);

/* ── 2. Kale adları Türkçe ek taşır ── */
// "Hisar" da geçerli bir Türkçe kale adıdır (ör. Karageçit Hisarı).
const castleSuffix = /(Kalesi|Hisarı)$/;
const castlesWithoutSuffix = castles.filter((s) => !castleSuffix.test(s.name));
ok(
  castlesWithoutSuffix.length === 0,
  'tüm kale adları "… Kalesi" / "… Hisarı" ile bitiyor',
  `${castles.length - castlesWithoutSuffix.length}/${castles.length}`,
);

const townsWithSuffix = towns.filter((s) => /Kalesi$/.test(s.name));
ok(townsWithSuffix.length === 0, 'şehir adlarında "Kalesi" eki yok');

const villagesWithSuffix = villages.filter((s) => /(Kalesi|Hisarı)$/.test(s.name));
ok(villagesWithSuffix.length === 0, 'köy adlarında "Kalesi"/"Hisarı" eki yok');

/* ── 3. Ad tekilliği (211 yerleşim) ── */
const names = settlements.map((s) => s.name);
ok(new Set(names).size === names.length, 'tüm yerleşim adları tekil', `${new Set(names).size}/${names.length}`);

/* ── 4. Türkçe karakter kullanımı (kalelerde ş/ç/ğ/ı/ö/ü) ── */
ok(
  castles.some((s) => /[çğıöşü]/i.test(s.name)),
  'kale adları Türkçe karakter taşıyor (yerelleştirme doğrulaması)',
);

/* ── 5. Açıklama ve ekonomi alanları boş değil ── */
const noDescription = settlements.filter((s) => !s.description || s.description.length < 20);
ok(noDescription.length === 0, 'her yerleşimin açıklaması var', `${settlements.length} yerleşim`);
const badNumbers = settlements.filter(
  (s) => !Number.isFinite(s.prosperity) || s.prosperity <= 0 || !Number.isFinite(s.garrison) || s.garrison < 0,
);
ok(badNumbers.length === 0, 'refah ve garnizon değerleri geçerli');

/* ── 6. Bağlı köy ilişkisi tutarlı (Bannerlord: her köy bir kaleye/şehre bağlı) ── */
const orphanVillages = villages.filter(
  (v) => !v.boundSettlementId || !settlements.some((s) => s.id === v.boundSettlementId),
);
ok(orphanVillages.length === 0, 'her köy bir şehre/kaleye bağlı', `${orphanVillages.length} bağsız`);

/* ── 7. Bannerlord yapısı: şehre 2, kaleye 1 köy bağlı ── */
const boundTo = (id: string) => villages.filter((v) => v.boundSettlementId === id).length;
const townsWithWrong = towns.filter((t) => boundTo(t.id) !== 2);
const castlesWithWrong = castles.filter((c) => boundTo(c.id) !== 1);
ok(
  townsWithWrong.length === 0 && castlesWithWrong.length === 0,
  'her şehre 2, her kaleye 1 köy bağlı',
  `şehir ${towns.length - townsWithWrong.length}/${towns.length} · kale ${castles.length - castlesWithWrong.length}/${castles.length}`,
);

console.log(fails === 0 ? '\n✅ YERLEŞİM İÇERİĞİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
