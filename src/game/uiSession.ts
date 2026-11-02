/**
 * uiSession.ts — Zaman ölçeği ve UI katman yardımcıları (Faz 10a)
 *
 * İki sorunu kapatır:
 *  1. **Zaman geri yükleme:** Bir modal açılınca dünya duraklatılıyordu ama
 *     kapanınca hız 0'da kalıyordu. Burada "UI öncesi hız" saklanır/geri verilir.
 *  2. **Esc sırası:** Aynı anda birden çok katman açık olabilir (ör. divan üstünde
 *     diyalog). Esc **en üstteki** katmanı kapatır.
 *
 * DOM'a dokunmaz; saf fonksiyonlar → probe'lanabilir.
 */

export type TimeScale = 0 | 1 | 2 | 4;

/**
 * UI açılmadan önceki oynatma hızı.
 * Elle duraklatılmışsa (0) oyun 1x kabul edilir; 0'a geri dönmek "donmuş" hissi verirdi.
 */
export function speedBeforeUi(scale: TimeScale): 1 | 2 | 4 {
  return scale === 0 ? 1 : scale;
}

/** UI kapandığında dönülecek hız (saklanan değer geçersizse 1x). */
export function speedAfterUi(saved: TimeScale): 1 | 2 | 4 {
  return saved === 2 || saved === 4 ? saved : 1;
}

export type UiLayer =
  | 'creator'
  | 'character'
  | 'inventory'
  | 'party'
  | 'market'
  | 'clan'
  | 'kingdom'
  | 'dialogue'
  | 'settlement'
  | 'diplomacy'
  | 'pause';

/** Üstten alta: Esc önce `creator`'ı, en son `pause`u kapatır. */
export const UI_LAYER_ORDER: readonly UiLayer[] = [
  'creator',
  'character',
  'inventory',
  'party',
  'market',
  'clan',
  'kingdom',
  'dialogue',
  'settlement',
  'diplomacy',
  'pause',
];

export type UiLayerFlags = Partial<Record<UiLayer, boolean>>;

/** Ekranda en üstte duran katman; hiçbiri açık değilse `null`. */
export function topLayer(flags: UiLayerFlags): UiLayer | null {
  for (const layer of UI_LAYER_ORDER) {
    if (flags[layer]) return layer;
  }
  return null;
}

/** Açık katman sayısı (0 → Esc doğrudan duraklatma yapar). */
export function countLayers(flags: UiLayerFlags): number {
  return UI_LAYER_ORDER.reduce((n, layer) => (flags[layer] ? n + 1 : n), 0);
}

/**
 * Mount & Blade II: Bannerlord sefer saati sabitleri:
 * - Normal hızda (1x): 1 oyun saati = 4 gerçek saniye (4000 ms), 1 tam gün (24 saat) = 96 saniye.
 * - Hızlı (2x): 1 oyun saati = 2 gerçek saniye (2000 ms), 1 tam gün = 48 saniye.
 * - Çok hızlı (4x / ▶▶▶): 1 oyun saati = 1 gerçek saniye (1000 ms), 1 tam gün = 24 saniye.
 */
export const BANNERLORD_HOUR_SECONDS_AT_1X = 4.0;
export const BANNERLORD_HOUR_MS_AT_1X = 4000;

/** Seçili zaman ölçeğine göre 1 oyun saatinin milisaniye süresi (duraklatılmışsa null). */
export function getCampaignHourIntervalMs(scale: TimeScale): number | null {
  if (scale === 0) return null;
  return Math.round(BANNERLORD_HOUR_MS_AT_1X / scale);
}

/**
 * Tek kaynaklı 24 saatlik sefer saati adımı:
 * Saat 23 -> 0 geçişinde (`crossedMidnight: true`) yeni sefer günü (`advanceWorldDay`) tetiklenir.
 */
export function stepCampaignClockHour(currentHour: number | undefined): {
  nextHour: number;
  crossedMidnight: boolean;
} {
  const normalized =
    typeof currentHour === 'number' && Number.isFinite(currentHour)
      ? ((Math.floor(currentHour) % 24) + 24) % 24
      : 9;
  const nextHour = (normalized + 1) % 24;
  return {
    nextHour,
    crossedMidnight: nextHour === 0,
  };
}

/**
 * Alt orta Güneş/Ay kadranı (Celestial Medallion) için kesintisiz monotonik açı:
 * Gün 23:00 -> Ertesi gün 00:00 geçişinde açıyı 255° -> -90° (-345° geriye) sarmak yerine
 * toplam geçen saatten hesaplayarak ileri (+15°) döndürür; CSS transition takla atmaz.
 */
export function computeCelestialDialAngleDeg(day: number, hourOfDay: number): number {
  const safeDay = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  const safeHour = ((Number.isFinite(hourOfDay) ? hourOfDay : 9) % 24 + 24) % 24;
  const totalHours = (safeDay - 1) * 24 + safeHour;
  return Math.round((totalHours / 24) * 360 - 90);
}

/**
 * 3B harita güneş/ışık döngüsü için sürekli kayan noktalı saat (`smoothHour` ∈ [0, 24)):
 * Tamsayı `campaign.hour` ile kavga edip ileri-geri sıçrama yapmadan `BANNERLORD_HOUR_SECONDS_AT_1X`
 * hızında pürüzsüz ilerler; yalnız büyük sapmalarda (kayıt yükleme / gün atlama) yumuşakça hizalanır.
 */
export function advanceSmoothCelestialHour(
  smoothHour: number,
  targetHour: number | undefined,
  dt: number,
  timeScale: number,
  isPaused: boolean,
): number {
  let next = ((Number.isFinite(smoothHour) ? smoothHour : 9) % 24 + 24) % 24;
  const clampedDt = Math.max(0, Math.min(dt, 0.1));

  if (!isPaused && timeScale > 0) {
    next += (clampedDt * timeScale) / BANNERLORD_HOUR_SECONDS_AT_1X;
  }

  const resolvedTarget =
    typeof targetHour === 'number' && Number.isFinite(targetHour)
      ? ((targetHour % 24) + 24) % 24
      : 9;

  // Tamsayı saat diliminin ortasına (targetHour + 0.5) göre dairesel fark
  const anchorHour = !isPaused && timeScale > 0 ? (resolvedTarget + 0.5) % 24 : resolvedTarget;
  let hourDiff = anchorHour - (next % 24);
  if (hourDiff < -12) hourDiff += 24;
  if (hourDiff > 12) hourDiff -= 24;

  // Normal akışta çok hafif düzeltme; yalnız >1.2 saatlik sapmada (örn. kayıt yükleme) yumuşak yakınsama
  const pullRate = Math.abs(hourDiff) > 1.2 ? 2.0 : 0.35;
  next += hourDiff * Math.min(1, clampedDt * pullRate);

  next = ((next % 24) + 24) % 24;
  return next;
}

