/**
 * troops.ts — kültüre özgü asker adları (10.9 ile gerçek birlik ağaçlarına bağlı).
 *
 * Bannerlord'da savaş sınıfları dörttür: piyade, okçu (menzilli), süvari ve
 * atlı okçu. Her kültürün ağacı farklıdır ve bazı kültürlerde bazı sınıflar
 * hiç yoktur (örn. Vlandiya'da atlı okçu, Batanya'da sıradan okçu hattı).
 * Buradaki adlar, `bannerlordFoundation.ts` içindeki gerçek ağaçların
 * kültür/sınıf temsilcisidir; sınıfı olmayan kültürde anahtar bulunmaz ve
 * çağıranlar genel sınıf adına düşer (havuz da o sınıfta sıfırdır).
 */
import type { FactionId, UnitTierId } from './rules';
import { UNIT_DEFINITIONS } from './rules';

export interface CultureTroop {
  /** Kültürün dilinde asker adı. */
  name: string;
  /** Kısa sınıf etiketi (insan okur, UI'da ikinci satır). */
  role: string;
}

/**
 * Kültür → sınıf → temsilci ad/rol. Eksik sınıf = o kültürün ağacında o sınıf
 * yok demektir (Bannerlord doğrusu); uydurma karşılık yazılmaz.
 */
export const CULTURE_TROOPS: Record<FactionId, Partial<Record<UnitTierId, CultureTroop>>> = {
  empire: {
    infantry: { name: 'İmparatorluk Lejyoneri', role: 'Kalkan hattı · Pilum' },
    archer: { name: 'İmparatorluk Palatin Muhafızı', role: 'Menzilli · Yay/Arbalet' },
    cavalry: { name: 'İmparatorluk Katafraktı', role: 'Ağır süvari · Kontos' },
    horseArcher: { name: 'İmparatorluk Bukelları', role: 'Atlı okçu · Yay' },
  },
  vlandia: {
    infantry: { name: 'Vlandiya Çavuşu', role: 'Kalkan hattı · Kargı/Kılıç' },
    archer: { name: 'Vlandiya Keskin Nişancısı', role: 'Menzilli · Arbalet' },
    cavalry: { name: 'Vlandiya Sancak Şövalyesi', role: 'Ağır süvari · Mızrak' },
    // Vlandiya'da atlı okçu yoktur.
  },
  battania: {
    infantry: { name: 'Battaniya Yeminli Savaşçısı', role: 'Kalkan hattı · Falks/Balta' },
    archer: { name: 'Battaniya Fian Şampiyonu', role: 'Menzilli · Uzun yay' },
    cavalry: { name: 'Battaniya Süvarisi', role: 'Hafif süvari · Cirit' },
    // Batanya'da atlı okçu yoktur; sıradan okçu hattı da yoktur (Fian soylu hattıdır).
  },
  sturgia: {
    infantry: { name: 'Sturgiya Ağır Baltacısı', role: 'Kalkan hattı · Balta' },
    archer: { name: 'Sturgiya Kıdemli Okçusu', role: 'Menzilli · Yay' },
    cavalry: { name: 'Sturgiya Drujinik Şampiyonu', role: 'Ağır süvari · Mızrak' },
    // Sturgiya'da atlı okçu yoktur.
  },
  khuzait: {
    infantry: { name: 'Kuzeyit Darhanı', role: 'Kalkan hattı · Mızrak' },
    archer: { name: 'Kuzeyit Keskin Nişancısı', role: 'Menzilli · Kompozit yay' },
    cavalry: { name: 'Kuzeyit Ağır Kargıcısı', role: 'Süvari · Kargı' },
    horseArcher: { name: 'Kuzeyit Han Muhafızı', role: 'Atlı okçu · Yay/Kargı' },
  },
  aserai: {
    infantry: { name: 'Aserai Memlük Saray Muhafızı', role: 'Şok piyadesi · Çift elli balta' },
    archer: { name: 'Aserai Usta Okçusu', role: 'Menzilli · Kısa yay' },
    cavalry: { name: 'Aserai Öncü Farisi', role: 'Süvari · Cirit/Mızrak' },
    horseArcher: { name: 'Aserai Ağır Memlük Süvarisi', role: 'Atlı okçu · Yay' },
  },
  bandits: {
    infantry: { name: 'Haydut Reisi', role: 'Çete · Balta' },
    archer: { name: 'Orman Haydutu', role: 'Çete · Yay' },
    cavalry: { name: 'Atlı Haydut', role: 'Çete · Atlı' },
  },
  player: {
    infantry: { name: 'Sancak Piyadesi', role: 'Kalkan hattı · Mızrak' },
    archer: { name: 'Sancak Okçusu', role: 'Menzilli · Yay' },
    cavalry: { name: 'Sancak Süvarisi', role: 'Süvari · Mızrak' },
    horseArcher: { name: 'Sancak Atlı Okçusu', role: 'Atlı okçu · Yay' },
  },
};

/** Kültürde bu savaş sınıfı var mı? (havuz ve arayüz bunu kullanır) */
export function cultureHasClass(faction: FactionId, unitId: UnitTierId): boolean {
  return Boolean(CULTURE_TROOPS[faction]?.[unitId]);
}

/** Kültüre göre asker adı; kültürde sınıf yoksa genel sınıf adına düşer. */
export function troopName(unitId: UnitTierId, faction?: FactionId): string {
  const culture = faction ? CULTURE_TROOPS[faction] : undefined;
  return culture?.[unitId]?.name ?? UNIT_DEFINITIONS[unitId].name;
}

/** Kültüre göre sınıf etiketi (kısa). */
export function troopRole(unitId: UnitTierId, faction?: FactionId): string {
  const culture = faction ? CULTURE_TROOPS[faction] : undefined;
  return culture?.[unitId]?.role ?? UNIT_DEFINITIONS[unitId].role;
}

/** Bir kültürün var olan sınıflarının listesi (UI ızgarası için). */
export function cultureTroopLine(faction: FactionId): Array<CultureTroop & { id: UnitTierId }> {
  const line = CULTURE_TROOPS[faction] ?? CULTURE_TROOPS.player;
  return (Object.keys(UNIT_DEFINITIONS) as UnitTierId[])
    .filter((id) => line[id])
    .map((id) => ({ id, ...line[id]! }));
}
