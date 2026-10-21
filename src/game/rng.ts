/**
 * rng.ts — deterministik rastgelelik yardımcıları.
 *
 * Ayrı dosyada duruyor ki `rules.ts`, `notables.ts` ve `worldSim.ts` birbirine
 * dairesel bağımlılık kurmadan aynı tohum mantığını paylaşabilsin.
 */

/** Metinden 32 bit tohum üretir (FNV-1a benzeri, işaretli int'e indirgenir). */
export function hashString(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}

/** Küçük, hızlı, deterministik PRNG. Aynı tohum → aynı dizi. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `[min, max]` aralığında tamsayı. */
export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Diziden deterministik seçim. */
export function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}
