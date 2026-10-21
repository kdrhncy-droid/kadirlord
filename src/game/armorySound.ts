/**
 * armorySound.ts — BannerForge `BattleSoundFX` köprüsü
 *
 * Mevcut `sound.ts` (basit osilatör seti) korunur; dövüş vuruşları bu modül
 * üzerinden BannerForge'un **prosedürel savaş ses motoruna** yönlendirilir:
 *   · Fiziksel modelleme: FM metal çınlaması, gürültü tabanlı darbe, BiquadFilter
 *   · Prosedürel impulse response ile meydan yankısı (Convolver)
 *   · Limiter + ses başına polifoni kapısı (spam'de çatlama yok)
 *   · 0 ses dosyası (.mp3/.ogg/.wav yok)
 *
 * Tarayıcı autoplay politikası: ilk kullanıcı etkileşiminde `unlockArmorySound()`
 * çağrılmalı (arena, pointer-lock/click anında çağırıyor).
 */

import { BattleSoundFX, type SoundOptions } from '../armory/BattleSoundFX.ts';

export type BattleSoundName =
  | 'swordClash'
  | 'shieldBlock'
  | 'bowRelease'
  | 'arrowHit'
  | 'heavyAxeSwing'
  | 'battleHorn';

let fx: BattleSoundFX | null = null;
let enabled = true;

export function armorySoundEnabled(): boolean {
  return enabled;
}

/** Kapatıldığında mevcut `sound.ts` osilatörleri devreye girer (geri dönüş yolu). */
export function setArmorySoundEnabled(value: boolean): void {
  enabled = value;
  if (fx) fx.setMasterVolume(value ? 0.9 : 0);
}

/** AudioContext'i ilk kullanıcı jestinde açar (tarayıcı autoplay kuralı). */
export function unlockArmorySound(): void {
  if (!enabled || typeof window === 'undefined') return;
  const engine = ensureEngine();
  engine?.unlock().catch(() => {});
}

function ensureEngine(): BattleSoundFX | null {
  if (typeof window === 'undefined') return null;
  if (fx) return fx;
  try {
    fx = new BattleSoundFX({
      masterVolume: 0.9,
      reverb: 0.35,
      reverbSeconds: 2.4,
      limiter: true,
      maxVoicesPerSound: 3,
      maxTotalVoices: 24,
    });
    return fx;
  } catch (error) {
    console.warn('[armorySound] Ses motoru kurulamadı, eski seslere dönülüyor:', error);
    enabled = false;
    return null;
  }
}

/**
 * BannerForge savaş sesi çalar. Motor kurulamazsa `false` döner ve çağıran
 * taraf (sound.ts) eski osilatörüne geri düşer.
 */
export function playBattleSound(name: BattleSoundName, options: SoundOptions = {}): boolean {
  if (!enabled) return false;
  const engine = ensureEngine();
  if (!engine) return false;
  try {
    switch (name) {
      case 'swordClash':
        engine.playSwordClash(options);
        break;
      case 'shieldBlock':
        engine.playShieldBlock(options);
        break;
      case 'bowRelease':
        engine.playBowRelease(options);
        break;
      case 'arrowHit':
        engine.playArrowHit(options);
        break;
      case 'heavyAxeSwing':
        engine.playHeavyAxeSwing(options);
        break;
      case 'battleHorn':
        engine.playBattleHorn(options);
        break;
      default:
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Arenadaki vuruş yoğunluğuna göre hafif rastgeleleştirme:
 * aynı sesin birebir tekrarı kulağa "kaset" gibi gelmesin.
 */
export function playImpact(
  name: BattleSoundName,
  opts: { intensity?: number; pan?: number } = {},
): boolean {
  const intensity = (opts.intensity ?? 1) * (0.92 + Math.random() * 0.18);
  const rate = 0.94 + Math.random() * 0.12;
  return playBattleSound(name, { intensity, pan: opts.pan, rate });
}

/** Savaş alanı kalabalık çınlaması (yalnızca 500v500 gibi büyük sahnelerde). */
export function playCrowdClash(count = 6): boolean {
  if (!enabled) return false;
  const engine = ensureEngine();
  if (!engine) return false;
  try {
    engine.playCrowdClash(count);
    return true;
  } catch {
    return false;
  }
}

export function disposeArmorySound(): void {
  fx?.dispose();
  fx = null;
}
