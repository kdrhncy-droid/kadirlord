/**
 * probe-ui-session.ts — Zaman geri yükleme + Esc katman sırası (Faz 10a)
 *
 *   npx tsx scripts/probe-ui-session.ts
 *
 * İki eski hata burada kilitleniyor:
 *  1. Modal açılınca hız 0'a iniyordu ve **hiç geri dönmüyordu** (oyun donmuş kalıyordu).
 *  2. Esc yalnız iki modalı kapatıyordu; pazar/divan/yaratıcı açık kalıyordu.
 */
import {
  BANNERLORD_HOUR_MS_AT_1X,
  BANNERLORD_HOUR_SECONDS_AT_1X,
  UI_LAYER_ORDER,
  advanceSmoothCelestialHour,
  computeCelestialDialAngleDeg,
  countLayers,
  getCampaignHourIntervalMs,
  speedAfterUi,
  speedBeforeUi,
  stepCampaignClockHour,
  topLayer,
  type TimeScale,
  type UiLayerFlags,
} from '../src/game/uiSession.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* ── 1. UI öncesi hız ── */
ok(speedBeforeUi(1) === 1, 'hız 1x korunur');
ok(speedBeforeUi(2) === 2, 'hız 2x korunur');
ok(speedBeforeUi(4) === 4, 'hız 4x korunur');
ok(speedBeforeUi(0) === 1, 'elle duraklatılmışsa UI öncesi hız 1x kabul edilir');

/* ── 2. UI sonrası hız ── */
ok(speedAfterUi(1) === 1 && speedAfterUi(2) === 2 && speedAfterUi(4) === 4, 'saklanan hız geri verilir');
ok(speedAfterUi(0) === 1, 'geçersiz/0 saklanmışsa 1x (donmuş kalmaz)');

/* ── 3. App akışı: aç → kapa döngüsü hızı bozmamalı ── */
const cycle = (start: TimeScale, saved?: TimeScale): TimeScale => {
  // Açılış: hız saklanır, dünya 0'a iner.
  const remembered = saved ?? speedBeforeUi(start);
  const duringUi: TimeScale = 0;
  ok(duringUi === 0, `UI açıkken dünya durur (başlangıç ${start}x)`);
  // Kapanış: saklanan hıza dön.
  return speedAfterUi(remembered);
};
ok(cycle(1) === 1, '1x → UI → 1x');
ok(cycle(2) === 2, '2x → UI → 2x');
ok(cycle(4) === 4, '4x → UI → 4x');
ok(cycle(0) === 1, '0x (elle pause) → UI → 1x (donmuş kalmaz)');

// Zincirleme: iki modal üst üste açılıp kapanırsa hız kaybolmamalı.
let scale: TimeScale = 4;
const firstOpen = speedBeforeUi(scale);
scale = 0;
const secondOpen = speedBeforeUi(scale); // zaten 0 → 1 kabul edilir (üstteki katman)
scale = 0;
scale = speedAfterUi(firstOpen); // alttaki katman kapanınca ilk saklanan hıza dönülür
ok(scale === 4, 'iki katman üst üste açılsa da asıl hız (4x) korunur', `ikinci kayıt ${secondOpen}x`);

/* ── 4. Esc katman sırası ── */
const noLayers: UiLayerFlags = {};
ok(topLayer(noLayers) === null, 'katman yokken Esc seferi duraklatır (null)');
ok(countLayers(noLayers) === 0, 'katman sayısı 0');

ok(topLayer({ market: true }) === 'market', 'yalnız pazar açıkken Esc pazarı kapatır');
ok(topLayer({ pause: true }) === 'pause', 'yalnız duraklatma açıkken Esc devam ettirir');
ok(
  topLayer({ market: true, pause: true }) === 'market',
  'pazar + duraklatma: Esc önce pazarı kapatır (oyun duraklamış kalmaz)',
);
ok(
  topLayer({ creator: true, market: true, kingdom: true }) === 'creator',
  'karakter yaratıcı en üstte',
);
ok(
  topLayer({ kingdom: true, market: true }) === 'market',
  'divan + pazar: pazar (üstte açılan) kapanır',
);
ok(
  topLayer({ settlement: true, diplomacy: true }) === 'settlement',
  'yerleşim + diplomasi: yerleşim kapanır',
);
ok(topLayer({ dialogue: true, settlement: true }) === 'dialogue', 'diyalog yerleşimin üstünde');
ok(countLayers({ market: true, kingdom: true, pause: true }) === 3, 'katman sayısı 3');

/* ── 5. Sıra listesi tutarlılığı ── */
ok(UI_LAYER_ORDER.length === 11, 'on bir UI katmanı tanımlı');
ok(new Set(UI_LAYER_ORDER).size === 11, 'katman kimlikleri tekil');
ok(UI_LAYER_ORDER[UI_LAYER_ORDER.length - 1] === 'pause', 'duraklatma en son kapanır');
ok(
  UI_LAYER_ORDER.every((layer) => topLayer({ [layer]: true }) === layer),
  'her katman tek başına açıkken kendini döndürür',
);

/* ── 6. Bannerlord 24 Saatlik Birleşik Sefer Saati & Kadran Monotonluğu ── */
ok(BANNERLORD_HOUR_SECONDS_AT_1X === 4 && BANNERLORD_HOUR_MS_AT_1X === 4000, '1x hızda 1 oyun saati = 4 sn (96 sn/gün)');
ok(getCampaignHourIntervalMs(0) === null, '0x hızda saat zamanlayıcısı durur');
ok(getCampaignHourIntervalMs(1) === 4000, '1x hızda saat adımı 4000 ms');
ok(getCampaignHourIntervalMs(2) === 2000, '2x hızda saat adımı 2000 ms');
ok(getCampaignHourIntervalMs(4) === 1000, '4x hızda saat adımı 1000 ms (24 sn/gün, flaşlama yok)');

const step22 = stepCampaignClockHour(22);
ok(step22.nextHour === 23 && !step22.crossedMidnight, '22:00 -> 23:00 gece yarısını geçmez');
const step23 = stepCampaignClockHour(23);
ok(step23.nextHour === 0 && step23.crossedMidnight, '23:00 -> 00:00 gece yarısını geçer ve yeni günü tetikler');

const angleDay1Hour23 = computeCelestialDialAngleDeg(1, 23);
const angleDay2Hour0 = computeCelestialDialAngleDeg(2, 0);
ok(
  angleDay2Hour0 - angleDay1Hour23 === 15,
  'gece yarısı geçişinde Güneş/Ay kadranı -345° geriye sarmak yerine +15° ileri döner',
  `${angleDay1Hour23}° -> ${angleDay2Hour0}°`,
);

// 4x hızda 1 saniye boyunca (60 kare) smoothHour ~1 saat ilerlemeli (6 saat değil!)
let smooth = 9.0;
for (let i = 0; i < 60; i++) {
  smooth = advanceSmoothCelestialHour(smooth, 9, 1 / 60, 4, false);
}
ok(
  smooth > 9.7 && smooth < 10.3,
  '4x hızda 1 gerçek saniyede 3B güneş saati ~1 oyun saati ilerler',
  `smoothHour=${smooth.toFixed(2)}`,
);

console.log(fails === 0 ? '\n✅ ZAMAN VE KATMAN YÖNETİMİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);

