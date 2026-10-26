import assert from 'node:assert';
import {
  allocateByClass,
  computeInitialFieldCounts,
  planReinforcementWave,
  remainingReserves,
} from '../src/game/reinforcements';
import type { TroopRoster } from '../src/game/rules';

const R = (
  infantry: number,
  archer: number,
  cavalry: number,
  horseArcher: number,
): TroopRoster => ({ infantry, archer, cavalry, horseArcher });
const sum = (r: Record<string, number>) => Object.values(r).reduce((s, n) => s + n, 0);

// ── İlk dalga paylaşımı (Bannerlord savaş büyüklüğü tahsisi)
assert.deepEqual(computeInitialFieldCounts(70, 9, 200), { ally: 70, enemy: 9 });
console.log('✓ bütçe altı: herkes sahada (70v9)');
assert.deepEqual(computeInitialFieldCounts(300, 300, 200), { ally: 100, enemy: 100 });
console.log('✓ eşit dev ordular: 100v100');
assert.deepEqual(computeInitialFieldCounts(900, 100, 200), { ally: 150, enemy: 50 });
console.log('✓ %75 tavanı: 900v100 → 150v50');
assert.deepEqual(computeInitialFieldCounts(10, 1000, 200), { ally: 10, enemy: 190 });
console.log('✓ küçük tarafın kullanamadığı yer büyüğe geçer (10v1000 → 10v190)');
assert.deepEqual(computeInitialFieldCounts(1000, 10, 200), { ally: 190, enemy: 10 });
console.log('✓ simetrik (1000v10 → 190v10)');
assert.deepEqual(computeInitialFieldCounts(0, 500, 200), { ally: 0, enemy: 200 });
console.log('✓ boş taraf: 0v200');

// ── Sınıf tahsisi
assert.deepEqual(allocateByClass(R(20, 20, 15, 15), 70), R(20, 20, 15, 15));
console.log('✓ tam bütçe: kadro aynen');
const half = allocateByClass(R(20, 20, 15, 15), 35);
assert.equal(sum(half), 35);
assert.equal(half.infantry, 10);
assert.equal(half.archer, 10);
console.log('✓ orantılı yarı bütçe: toplam 35, piyade/okçu 10');
const odd = allocateByClass(R(7, 3, 1, 0), 5);
assert.equal(sum(odd), 5);
assert.ok(odd.infantry <= 7 && odd.archer <= 3 && odd.cavalry <= 1);
console.log('✓ en büyük kalan: toplam bütçeye eşit, mevcut aşılmaz');
assert.deepEqual(allocateByClass(R(0, 0, 0, 0), 10), R(0, 0, 0, 0));
assert.deepEqual(allocateByClass(R(9, 9, 9, 9), 0), R(0, 0, 0, 0));
console.log('✓ boş kadro / sıfır bütçe');

// ── Yedekler
assert.deepEqual(remainingReserves(R(60, 40, 30, 20), R(40, 27, 20, 13)), R(20, 13, 10, 7));
console.log('✓ yedek = kadro − çıkan');

// ── Dalga kararı: ilk dalganın yarısı düşmeden dalga yok
const reserves = R(20, 13, 10, 7);
assert.equal(
  planReinforcementWave({ fieldAlive: 60, initialField: 100, reserves, fieldCapRemaining: 200 }),
  null,
);
assert.equal(
  planReinforcementWave({ fieldAlive: 51, initialField: 100, reserves, fieldCapRemaining: 200 }),
  null,
);
console.log('✓ mevcut %50 üstündeyken dalga yok');
const wave = planReinforcementWave({
  fieldAlive: 50,
  initialField: 100,
  reserves,
  fieldCapRemaining: 200,
});
assert.ok(wave);
assert.equal(sum(wave), 50);
console.log('✓ %50 eşiğinde tam dolduran dalga (50)');
const lastWave = planReinforcementWave({
  fieldAlive: 20,
  initialField: 100,
  reserves: R(5, 0, 0, 0),
  fieldCapRemaining: 200,
});
assert.ok(lastWave);
assert.equal(sum(lastWave), 5);
console.log('✓ son dalga yedek kadar (5)');
assert.equal(
  planReinforcementWave({
    fieldAlive: 10,
    initialField: 100,
    reserves: R(0, 0, 0, 0),
    fieldCapRemaining: 200,
  }),
  null,
);
console.log('✓ yedek yoksa dalga yok');
const capped = planReinforcementWave({
  fieldAlive: 0,
  initialField: 100,
  reserves,
  fieldCapRemaining: 8,
});
assert.ok(capped);
assert.equal(sum(capped), 8);
console.log('✓ saha bütçesi dalgayı sınırlar (8)');

console.log('\nTÜM KONTROLLER GEÇTİ');
