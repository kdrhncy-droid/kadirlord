/**
 * heroGen.ts — Dünya nüfusu üretimi (Faz 0b)
 *
 * Kullanıcı kararı (2026-10-21): **~40 kahraman** ve **gerçek partiler**
 * (haritada dolaşan, savaşa girebilen lordlar).
 *
 * Depoda elle yazılmış 9 lord var; bu modül kalan **31 lordu** kültüre uygun
 * isim/unvan/hanelerle **deterministik** olarak üretir. `Math.random()` yoktur:
 * aynı kampanya her açılışta aynı dünyayı verir (save tutarlılığı için şart).
 */
import type { FactionId, LordAgent, Settlement, TroopRoster } from './rules.ts';
import { hash32 } from './heroes.ts';

interface CulturePool {
  male: string[];
  female: string[];
  titles: string[];
  ladyTitles: string[];
  banner: string[];
  /** Üretilecek lord sayısı */
  count: number;
}

/** Kültür başına isim/unvan havuzları (Bannerlord kültür tonuna yakın). */
const POOLS: Partial<Record<FactionId, CulturePool>> = {
  empire: {
    count: 7,
    male: ['Valens', 'Cassius', 'Aurelius', 'Nikephoros', 'Leon', 'Marcellus', 'Theodoros', 'Basileios'],
    female: ['Helena', 'Serena', 'Iulia', 'Theodora', 'Aurelia', 'Eudokia'],
    titles: ['General', 'Senatör', 'Voyvoda', 'Strategos'],
    ladyTitles: ['Leydi', 'Senatris'],
    banner: ['#581c87', '#6b21a8', '#7e22ce', '#4c1d95'],
  },
  vlandia: {
    count: 5,
    male: ['Godfrey', 'Baldwin', 'Roland', 'Raymond', 'Hugh', 'Gareth', 'Osric'],
    female: ['Isolde', 'Eleanor', 'Mathilde', 'Cecily', 'Adelheid'],
    titles: ['Kont', 'Baron', 'Şövalye'],
    ladyTitles: ['Kontes', 'Leydi'],
    banner: ['#991b1b', '#b91c1c', '#7f1d1d', '#dc2626'],
  },
  battania: {
    count: 4,
    male: ['Cadwal', 'Bryn', 'Owain', 'Maddoc', 'Gwydion'],
    female: ['Rhiannon', 'Alys', 'Morwen', 'Ceridwen'],
    titles: ['Şef', 'Bilge', 'Avcıbaşı'],
    ladyTitles: ['Leydi', 'Kâhin'],
    banner: ['#166534', '#15803d', '#14532d', '#22c55e'],
  },
  sturgia: {
    count: 4,
    male: ['Vsevolod', 'Yaroslav', 'Rurik', 'Gundar', 'Svyatopolk'],
    female: ['Ingrid', 'Astrid', 'Sigrid', 'Helga'],
    titles: ['Boyar', 'Drujinnik', 'Voyvoda'],
    ladyTitles: ['Leydi', 'Boyarina'],
    banner: ['#1e40af', '#1d4ed8', '#1e3a8a', '#2563eb'],
  },
  khuzait: {
    count: 4,
    male: ['Temur', 'Baidur', 'Chagatai', 'Altan', 'Subutai'],
    female: ['Altani', 'Saran', 'Borte', 'Khulan'],
    titles: ['Boy Beyi', 'Noyan', 'Bahadır'],
    ladyTitles: ['Hatun'],
    banner: ['#0f766e', '#0d9488', '#115e59', '#14b8a6'],
  },
  aserai: {
    count: 4,
    male: ['Faris', 'Hakim', 'Nassir', 'Ziyad', 'Tariq'],
    female: ['Leyla', 'Zahra', 'Amina', 'Yasmin'],
    titles: ['Emir', 'Şeyh', 'Kervanbaşı'],
    ladyTitles: ['Hatun', 'Emire'],
    banner: ['#b45309', '#d97706', '#92400e', '#ca8a04'],
  },
  bandits: {
    count: 3,
    male: ['Kara', 'Çakır', 'Deli', 'Kel', 'Topal'],
    female: ['Yıldız', 'Gülbeyaz'],
    titles: ['Haydut Reisi'],
    ladyTitles: ['Haydut Reisi'],
    banner: ['#44403c', '#57534e', '#292524'],
  },
};

const ACTIONS = [
  'Sınır devriyesinde',
  'Kervan koruyor',
  'Köy topluyor',
  'Kaleyi teftiş ediyor',
  'Av peşinde',
  'Yol kesiyor',
  'Ordu topluyor',
];

const PERSONALITIES = [
  'Sert mizaçlı, sözünü sakınmayan bir komutan; sadakati satın alınamaz',
  'Kurnaz ve sabırlı; savaştan çok müzakereyle kazanmayı sever',
  'Cömert ama savurgan; adamlarının sevgisini altınla kazanır',
  'Soğukkanlı taktikçi; kaybı asla kabul etmez, geri çekilmeyi bilir',
  'Onurlu ve gelenekçi; atalarının yasasını her şeyin üstünde tutar',
  'Hırslı ve hesapçı; yükselmek için her fırsatı değerlendirir',
  'Halkın içinden gelmiş, köylülerin derdini dinleyen bir lider',
  'Savaşta acımasız, barışta misafirperver; ittifakları kanla kurar',
];

const FACTION_IDS: FactionId[] = ['empire', 'vlandia', 'battania', 'sturgia', 'khuzait', 'aserai', 'bandits'];

function pickFrom<T>(list: T[], seed: number, salt: string): T {
  return list[hash32(`${seed}:${salt}`) % list.length];
}

/**
 * Her krallığın Bannerlord askeri doktrinine göre özel birlik oranları ve
 * toplam asker sayısı (`armySize === getTotalTroops(roster)` garantili).
 */
const CULTURE_TROOP_DOCTRINE: Record<
  FactionId,
  { baseSize: number; spread: number; ratios: [number, number, number, number] }
> = {
  player: { baseSize: 22, spread: 10, ratios: [0.32, 0.28, 0.24, 0.16] },
  empire: { baseSize: 24, spread: 14, ratios: [0.32, 0.26, 0.22, 0.20] }, // Lejyoner + Palatin + Katafrakt
  vlandia: { baseSize: 25, spread: 14, ratios: [0.22, 0.28, 0.34, 0.16] }, // Şövalye Süvarisi + Arbaletçi
  battania: { baseSize: 22, spread: 12, ratios: [0.28, 0.44, 0.10, 0.18] }, // Fian Şampiyon Okçuları + Yaban Süvarisi
  sturgia: { baseSize: 24, spread: 13, ratios: [0.42, 0.18, 0.12, 0.28] }, // Ağır Kalkan Duvarı Piyadesi + Drujinnik
  khuzait: { baseSize: 26, spread: 14, ratios: [0.16, 0.32, 0.42, 0.10] }, // Atlı Okçu + Kargılı Bozkır Süvarisi
  aserai: { baseSize: 24, spread: 13, ratios: [0.24, 0.30, 0.30, 0.16] }, // Faris Süvarisi + Çöl Okçusu + Memlük
  bandits: { baseSize: 16, spread: 9, ratios: [0.50, 0.28, 0.14, 0.08] }, // Haydut Çetesi
};

function makeCultureRoster(faction: FactionId, targetSize: number): { roster: TroopRoster; armySize: number } {
  const doc = CULTURE_TROOP_DOCTRINE[faction] ?? CULTURE_TROOP_DOCTRINE.empire;
  const [rMilitia, rArcher, rCavalry] = doc.ratios;
  const militia = Math.max(1, Math.round(targetSize * rMilitia));
  const archer = Math.max(1, Math.round(targetSize * rArcher));
  const cavalry = Math.max(1, Math.round(targetSize * rCavalry));
  const guard = Math.max(1, targetSize - (militia + archer + cavalry));
  const roster: TroopRoster = { militia, archer, cavalry, guard };
  const exactTotal = roster.militia + roster.archer + roster.cavalry + roster.guard;
  return { roster, armySize: exactTotal };
}

/**
 * Kalan lordları üretir.
 * @param settlements dünya yerleşimleri (konum ve kültür için)
 * @param existingIds mevcut lord id'leri (çakışma olmasın)
 */
export function generateLordParties(
  settlements: Settlement[],
  existingIds: Set<string>,
): LordAgent[] {
  const out: LordAgent[] = [];
  let serial = 0;

  for (const faction of FACTION_IDS) {
    const pool = POOLS[faction];
    if (!pool) continue;

    const ownSettlements = settlements.filter((s) => s.faction === faction);
    if (ownSettlements.length === 0) continue;

    // İsimler kültür içinde TEKİL olsun: deterministik karıştırıp sırayla alıyoruz
    // (hash tabanlı seçim aynı ismi iki lorda verebiliyordu).
    const roster: { name: string; female: boolean }[] = [
      ...pool.male.map((name) => ({ name, female: false })),
      ...pool.female.map((name) => ({ name, female: true })),
    ].sort((a, b) => hash32(`${faction}:${a.name}`) - hash32(`${faction}:${b.name}`));

    const doctrine = CULTURE_TROOP_DOCTRINE[faction] ?? CULTURE_TROOP_DOCTRINE.empire;

    for (let i = 0; i < pool.count; i++) {
      serial += 1;
      const seed = hash32(`${faction}:${i}:${serial}`);
      const entry = roster[i % roster.length];
      const name = entry.name;
      const female = entry.female;
      const title = female
        ? pickFrom(pool.ladyTitles, seed, 'title')
        : pickFrom(pool.titles, seed, 'title');

      const id = `lord-gen-${faction}-${i}`;
      if (existingIds.has(id)) continue;

      // Başlangıç ve hedef: kendi kültürünün yerleşimleri arasında dolaşım.
      const home = ownSettlements[(seed + i) % ownSettlements.length];
      const dest = ownSettlements[(seed + i * 3 + 1) % ownSettlements.length];
      const jitterX = ((seed % 7) - 3) * 0.9;
      const jitterZ = (((seed >> 3) % 7) - 3) * 0.9;

      // Kültür doktrinine göre parti büyüklüğü ve dağılımı (en az 16 sağlıklı asker)
      const targetSize = Math.max(16, doctrine.baseSize + (seed % doctrine.spread));
      const { roster: lordRoster, armySize } = makeCultureRoster(faction, targetSize);
      out.push({
        id,
        name,
        title,
        faction,
        personality: pickFrom(PERSONALITIES, seed, 'persona'),
        relation: (seed % 61) - 25, // -25..+35
        x: home.x + jitterX,
        z: home.z + jitterZ,
        targetX: dest.x + jitterX,
        targetZ: dest.z + jitterZ,
        armySize,
        roster: lordRoster,
        wounded: 1 + (seed % 4),
        prisoners: 1 + (seed % 3),
        morale: 68 + (seed % 28),
        foodDays: 7 + (seed % 10),
        isAtWarWithPlayer: faction === 'bandits',
        isAlliedWithPlayer: false,
        currentAction: pickFrom(ACTIONS, seed, 'action'),
        bannerColor: pickFrom(pool.banner, seed, 'banner'),
      });
    }
  }

  return out;
}

/** Hedef nüfus — Faz 0b kabul kriteri. */
export const TARGET_HERO_COUNT = 40;
