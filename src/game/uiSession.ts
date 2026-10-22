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
  | 'inventory'
  | 'market'
  | 'kingdom'
  | 'dialogue'
  | 'settlement'
  | 'diplomacy'
  | 'pause';

/** Üstten alta: Esc önce `creator`'ı, en son `pause`u kapatır. */
export const UI_LAYER_ORDER: readonly UiLayer[] = [
  'creator',
  'inventory',
  'market',
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
