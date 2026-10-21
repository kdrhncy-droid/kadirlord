/**
 * troops.ts — Faz B2 (ilk dilim): kültüre özgü asker adları.
 *
 * Bannerlord'da asker ağacı kültüre göre ayrılır: Vlandiya arbaletçisi, Battaniya
 * Fian okçusu, Khuzait atlı okçusu… Bizde savaş motoru dört temel sınıfla
 * (`militia / archer / cavalry / guard`) çalışıyor; o sınıfların **istatistikleri**
 * aynı kalıyor, ama **ad ve kimlik** artık askerin toplandığı yerleşimin
 * kültüründen geliyor. Böylece arayüz gerçek Bannerlord terminolojisini kullanır,
 * savaş dengesi (ve `CharacterArenaView` rig/animasyon sözleşmesi) değişmez.
 *
 * Sıradaki adım (bu dilimin dışında): her kültüre 5 kademeli ayrı ağaç ve
 * kademe yükseltmeleri (`recruitment.ts` + `UNIT_DEFINITIONS` genişletmesi).
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
 * Kültür → sınıf → ad. Haydut ve oyuncu tarafı için de karşılık var; bilinmeyen
 * kültürde `UNIT_DEFINITIONS` adına düşülür.
 */
export const CULTURE_TROOPS: Record<FactionId, Record<UnitTierId, CultureTroop>> = {
  empire: {
    militia: { name: 'İmparatorluk Lejyoneri', role: 'Kalkan hattı · Mızrak' },
    archer: { name: 'İmparatorluk Okçusu', role: 'Menzilli · Ok yağmuru' },
    cavalry: { name: 'İmparatorluk Kataphraktı', role: 'Ağır süvari · Mızrak' },
    guard: { name: 'İmparatorluk Excubitoru', role: 'Seçkin muhafız · Kılıç' },
  },
  vlandia: {
    militia: { name: 'Vlandiya Milisi', role: 'Kalkan hattı · Mızrak' },
    archer: { name: 'Vlandiya Arbaletçisi', role: 'Menzilli · Arbalet' },
    cavalry: { name: 'Vlandiya Şövalyesi', role: 'Ağır süvari · Mızrak' },
    guard: { name: 'Vlandiya Sancaktarı', role: 'Seçkin muhafız · Çift elli' },
  },
  battania: {
    militia: { name: 'Battaniya Savaşçısı', role: 'Kalkan hattı · Balta' },
    archer: { name: 'Battaniya Fian Okçusu', role: 'Menzilli · Uzun yay' },
    cavalry: { name: 'Battaniya Atlı Avcısı', role: 'Hafif süvari · Cirit' },
    guard: { name: 'Battaniya Şampiyonu', role: 'Seçkin muhafız · Çift elli' },
  },
  sturgia: {
    militia: { name: 'Sturgiya Baltacısı', role: 'Kalkan hattı · Balta' },
    archer: { name: 'Sturgiya Okçusu', role: 'Menzilli · Yay' },
    cavalry: { name: 'Sturgiya Drujinniki', role: 'Ağır süvari · Mızrak' },
    guard: { name: 'Sturgiya Voyvodası', role: 'Seçkin muhafız · Balta' },
  },
  khuzait: {
    militia: { name: 'Bozkır Savaşçısı', role: 'Kalkan hattı · Kılıç' },
    archer: { name: 'Bozkır Okçusu', role: 'Menzilli · Kompozit yay' },
    cavalry: { name: 'Bozkır Atlı Okçusu', role: 'Süvari · At üstünde yay' },
    guard: { name: 'Bozkır Noyanı', role: 'Seçkin muhafız · Mızrak' },
  },
  aserai: {
    militia: { name: 'Aserai Mızrakçısı', role: 'Kalkan hattı · Mızrak' },
    archer: { name: 'Aserai Okçusu', role: 'Menzilli · Kısa yay' },
    cavalry: { name: 'Aserai Memlûk Süvarisi', role: 'Süvari · Kılıç' },
    guard: { name: 'Aserai Şeyh Muhafızı', role: 'Seçkin muhafız · Kılıç' },
  },
  bandits: {
    militia: { name: 'Haydut', role: 'Çete · Balta' },
    archer: { name: 'Haydut Okçusu', role: 'Çete · Yay' },
    cavalry: { name: 'Haydut Süvarisi', role: 'Çete · Atlı' },
    guard: { name: 'Haydut Reisi', role: 'Çete başı · Kılıç' },
  },
  player: {
    militia: { name: 'Sancak Piyadesi', role: 'Kalkan hattı · Mızrak' },
    archer: { name: 'Sancak Okçusu', role: 'Menzilli · Yay' },
    cavalry: { name: 'Sancak Süvarisi', role: 'Süvari · Mızrak' },
    guard: { name: 'Sancak Muhafızı', role: 'Seçkin muhafız · Kılıç' },
  },
};

/** Kültüre göre asker adı; bilinmeyen kültürde genel tanıma düşer. */
export function troopName(unitId: UnitTierId, faction?: FactionId): string {
  const culture = faction ? CULTURE_TROOPS[faction] : undefined;
  return culture?.[unitId]?.name ?? UNIT_DEFINITIONS[unitId].name;
}

/** Kültüre göre sınıf etiketi (kısa). */
export function troopRole(unitId: UnitTierId, faction?: FactionId): string {
  const culture = faction ? CULTURE_TROOPS[faction] : undefined;
  return culture?.[unitId]?.role ?? UNIT_DEFINITIONS[unitId].role;
}

/** Bir kültürün dört sınıfının tam listesi (UI ızgarası için). */
export function cultureTroopLine(faction: FactionId): Array<CultureTroop & { id: UnitTierId }> {
  const line = CULTURE_TROOPS[faction] ?? CULTURE_TROOPS.player;
  return (Object.keys(UNIT_DEFINITIONS) as UnitTierId[]).map((id) => ({ id, ...line[id] }));
}
