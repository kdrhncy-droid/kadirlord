import { getTotalTroops, type TroopRoster, type UnitTierId } from './rules';

/**
 * B5 — 1 aktör = 1 asker: savaş büyüklüğü, ilk dalga paylaşımı ve takviye
 * dalgaları (Bannerlord MissionSpawnSettings araştırmasına dayanır).
 *
 * Kaynak özeti (2026-10-24):
 * - "Battle size" sahada aynı anda bulunabilecek toplam askerdir; taraflar bu
 *   bütçeyi asker sayılarına **orantılı** paylaşır (TaleWorlds API:
 *   InitialSpawnMethod.BattleSizeAllocating).
 * - Bir taraf sahadaki payın en çok **%75**'ini alabilir
 *   (DefaultMaximumBattleSizeRatio = 0.75); küçük tarafın en az %25 yer
 *   hakkı olur (askeri varsa).
 * - Sefer meydan savaşlarında takviyeler **dalga** hâlinde gelir: oyun ~3
 *   saniyede bir bakar; tarafın sahadaki mevcudu **ilk dalganın yarısına**
 *   düşünce eksik kadar yeni dalga çağrılır (ReinforcementWavePercentage;
 *   son küçük dalga için de tam kayıp gerekir). Dalgalar kendi konuşlanma
 *   kenarından girer.
 * - Bannerlord'da bu ayar 500 (varsayılan) – 1000 arası; bizde vekil
 *   modellerin çizim maliyeti nedeniyle 200 (B6 instanced render ile
 *   yükseltilecek). Kural yapısı aynıdır, sayı ölçek farkıdır.
 */

/** Sahada aynı anda en çok asker (yerel "savaş büyüklüğü"; B6'da artar). */
export const BATTLE_FIELD_CAP = 200;

/** Bir tarafın alabileceği en yüksek saha payı (TaleWorlds varsayılanı 0.75). */
export const MAX_SIDE_FIELD_RATIO = 0.75;

/** Sahadaki mevcut ilk dalganın bu oranına düşünce takviye dalgası çağrılır. */
export const REINFORCEMENT_TRIGGER_RATIO = 0.5;

/** Takviye kontrol aralığı (saniye). */
export const REINFORCEMENT_CHECK_INTERVAL = 3;

const CLASS_LIST: UnitTierId[] = ['infantry', 'archer', 'cavalry', 'horseArcher'];

const emptyCounts = (): Record<UnitTierId, number> => ({
  infantry: 0,
  archer: 0,
  cavalry: 0,
  horseArcher: 0,
});

/**
 * İlk dalgada her tarafın kaç asker çıkaracağı: toplam saha bütçesini ordu
 * büyüklüklerine orantılı böl, %75 tavanını uygula, artan yeri yedeği
 * olana ver. Toplam bütçeyi aşmıyorsa herkes sahaya çıkar.
 */
export function computeInitialFieldCounts(
  allyTotal: number,
  enemyTotal: number,
  cap: number = BATTLE_FIELD_CAP,
): { ally: number; enemy: number } {
  const a = Math.max(0, allyTotal);
  const e = Math.max(0, enemyTotal);
  const total = a + e;
  if (total <= cap) return { ally: a, enemy: e };

  let shareA = total > 0 ? a / total : 0.5;
  shareA = Math.min(MAX_SIDE_FIELD_RATIO, Math.max(1 - MAX_SIDE_FIELD_RATIO, shareA));
  let fa = Math.min(a, Math.round(cap * shareA));
  let fe = Math.min(e, Math.round(cap * (1 - shareA)));

  // Bir taraf asker sayısından az yer kullandıysa kalan yer öbürüne geçer.
  let leftover = cap - fa - fe;
  if (leftover > 0) {
    const addA = Math.min(leftover, a - fa);
    fa += addA;
    leftover -= addA;
    const addE = Math.min(leftover, e - fe);
    fe += addE;
  }
  return { ally: fa, enemy: fe };
}

/**
 * Verilen bütçeyi kadro sınıflarına orantılı dağıtır (en büyük kalan
 * yöntemi; toplam bütçeye tam eşitlenir, hiçbir sınıf mevcudunu aşmaz).
 * Bannerlord'daki "dengeli" doğuş sırası karşılığı: dalgalar ordunun sınıf
 * bileşimini korur. Bütçe mevcudun tamamını karşılıyorsa kadro aynen döner.
 */
export function allocateByClass(
  roster: TroopRoster,
  budget: number,
): Record<UnitTierId, number> {
  const out = emptyCounts();
  const total = Math.max(0, getTotalTroops(roster));
  const want = Math.max(0, Math.min(budget, total));
  if (want <= 0 || total <= 0) return out;
  if (want >= total) {
    for (const cls of CLASS_LIST) out[cls] = Math.max(0, roster[cls]);
    return out;
  }
  const remainders: Array<{ cls: UnitTierId; rem: number }> = [];
  let assigned = 0;
  for (const cls of CLASS_LIST) {
    const exact = (Math.max(0, roster[cls]) / total) * want;
    const base = Math.floor(exact);
    out[cls] = base;
    assigned += base;
    remainders.push({ cls, rem: exact - base });
  }
  remainders.sort((x, y) => y.rem - x.rem);
  for (let i = 0; assigned < want && i < remainders.length; i++) {
    out[remainders[i].cls]++;
    assigned++;
  }
  return out;
}

/** Kalan yedekler = kadro − sahaya çıkanlar (sınıf sınıf). */
export function remainingReserves(
  roster: TroopRoster,
  fielded: Record<UnitTierId, number>,
): TroopRoster {
  return {
    infantry: Math.max(0, roster.infantry - fielded.infantry),
    archer: Math.max(0, roster.archer - fielded.archer),
    cavalry: Math.max(0, roster.cavalry - fielded.cavalry),
    horseArcher: Math.max(0, roster.horseArcher - fielded.horseArcher),
  };
}

/**
 * Bir taraf için takviye dalgası kararı. Sahadaki mevcut ilk dalganın
 * yarısına (veya altına) düşmedikçe dalga yok; dalga, tarafı ilk dalga
 * gücüne geri doldurur (yedek ve saha bütçesi kadar).
 */
export function planReinforcementWave(args: {
  fieldAlive: number;
  initialField: number;
  reserves: TroopRoster;
  fieldCapRemaining: number;
}): Record<UnitTierId, number> | null {
  const reservesTotal = Math.max(0, getTotalTroops(args.reserves));
  if (reservesTotal <= 0) return null;
  if (args.initialField <= 0) return null;
  if (args.fieldAlive > args.initialField * REINFORCEMENT_TRIGGER_RATIO) return null;
  const waveSize = Math.min(
    reservesTotal,
    Math.max(0, args.initialField - args.fieldAlive),
    Math.max(0, args.fieldCapRemaining),
  );
  if (waveSize <= 0) return null;
  return allocateByClass(args.reserves, waveSize);
}
