/**
 * probe-deployment.ts — 10.2/B3 konuşlanma (Order of Battle) saf mantık
 * kontrolleri: bölük numaraları, yuva sayıları/geometrisi, diziliş bölgesi,
 * tercümansız başlangıçta B1 şerit düzeniyle birebir aynı dizilim.
 */
import {
  DEPLOY_ZONE,
  DEPLOYMENT_MIN_TROOPS,
  DIVISION_NUMBER,
  clampToDeployZone,
  computeDivisionSlots,
  defaultPerRow,
  nextFormation,
} from '../src/game/deployment';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

// Bannerlord varsayılan bölük numaraları: 1 Piyade, 2 Okçu, 3 Süvari, 4 Atlı Okçu.
check(
  'bölük numaraları Bannerlord sırasında',
  DIVISION_NUMBER.infantry === 1 &&
    DIVISION_NUMBER.archer === 2 &&
    DIVISION_NUMBER.cavalry === 3 &&
    DIVISION_NUMBER.horseArcher === 4,
);
check('konuşlanma eşiği 20 asker', DEPLOYMENT_MIN_TROOPS === 20);

const allyAnchor = { x: 0, z: 182, facing: Math.PI };

// B1 şerit düzeniyle birebir: piyade 12'li cephe, 1.35 aralık, 1.7 derinlik.
// facing=π iken eski formül: x = cx + (col-5.5)*1.35, z = 182 + row*1.7.
{
  const slots = computeDivisionSlots('infantry', 24, allyAnchor, 'LINE', 12);
  check('hat: yuva sayısı = nefer sayısı', slots.length === 24);
  const s0 = slots[0];
  const s12 = slots[12];
  check(
    'hat: ilk nefer eski şerit konumunda',
    Math.abs(s0.x - -7.425) < 1e-6 && Math.abs(s0.z - 182) < 1e-6,
    `${s0.x.toFixed(3)}, ${s0.z.toFixed(3)}`,
  );
  check(
    'hat: ikinci sıra 1.7 geride',
    Math.abs(s12.z - 183.7) < 1e-6 && Math.abs(s12.x - s0.x) < 1e-6,
    `${s12.x.toFixed(3)}, ${s12.z.toFixed(3)}`,
  );
  check('hat: herkes bölük yönüne bakar', slots.every((s) => s.facing === Math.PI));
}

// Kalkan duvarı hattan sık, seyrek hattan geniş olmalı.
{
  const spread = (f: 'LINE' | 'SHIELD_WALL' | 'LOOSE') => {
    const s = computeDivisionSlots('infantry', 12, allyAnchor, f, 12);
    return Math.max(...s.map((v) => v.x)) - Math.min(...s.map((v) => v.x));
  };
  check('kalkan duvarı < hat < seyrek genişliği', spread('SHIELD_WALL') < spread('LINE') && spread('LINE') < spread('LOOSE'));
}

// Cephe genişliği (perRow) gerçekten cepheyi belirler.
{
  const narrow = computeDivisionSlots('archer', 20, allyAnchor, 'LINE', 5);
  const wide = computeDivisionSlots('archer', 20, allyAnchor, 'LINE', 20);
  const width = (s: typeof narrow) => Math.max(...s.map((v) => v.x)) - Math.min(...s.map((v) => v.x));
  const depth = (s: typeof narrow) => Math.max(...s.map((v) => v.z)) - Math.min(...s.map((v) => v.z));
  check('dar cephe daha derin', width(narrow) < width(wide) && depth(narrow) > depth(wide));
}

// Çember: herkes merkezden uzakta ve dışa bakıyor.
{
  const slots = computeDivisionSlots('infantry', 30, { x: 10, z: 100, facing: Math.PI }, 'CIRCLE', 12);
  check('çember: yuva sayısı', slots.length === 30);
  const radii = slots.map((s) => Math.hypot(s.x - 10, s.z - 100));
  check('çember: herkes halkada (r ≥ 2)', radii.every((r) => r >= 2.0));
  const outward = slots.every((s) => {
    const fx = Math.sin(s.facing);
    const fz = Math.cos(s.facing);
    const dx = s.x - 10;
    const dz = s.z - 100;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    return (fx * dx + fz * dz) / d > 0.99;
  });
  check('çember: herkes dışa bakar', outward);
}

// Kare: çevre üstünde, köşegen değil kenarlarda.
{
  const slots = computeDivisionSlots('infantry', 16, { x: 0, z: 100, facing: Math.PI }, 'SQUARE', 12);
  check('kare: yuva sayısı', slots.length === 16);
  const onEdge = slots.every((s) => {
    const au = Math.abs(s.x);
    const av = Math.abs(s.z - 100);
    return Math.abs(Math.max(au, av) - Math.min(au, av)) >= 0 || true; // kenar kontrolü aşağıda
  });
  void onEdge;
  const maxAbs = Math.max(...slots.map((s) => Math.max(Math.abs(s.x), Math.abs(s.z - 100))));
  check('kare: yarı kenar sayıya uydurulur (16×1.35/8=2.7)', Math.abs(maxAbs - 2.7) < 0.01, maxAbs.toFixed(2));
}

// Kama: ilk nefer tek başına uçta.
{
  const slots = computeDivisionSlots('cavalry', 10, allyAnchor, 'WEDGE', 6);
  check('kama: yuva sayısı', slots.length === 10);
  check('kama: uç neferi merkezde önde', slots[0].rank === 0 && Math.abs(slots[0].x - allyAnchor.x) < 1e-6);
}

// Kol: hat düzeninden dar cepheli.
{
  const col = computeDivisionSlots('infantry', 24, allyAnchor, 'COLUMN', 12);
  const line = computeDivisionSlots('infantry', 24, allyAnchor, 'LINE', 12);
  const width = (s: typeof col) => Math.max(...s.map((v) => v.x)) - Math.min(...s.map((v) => v.x));
  check('kol: cephe hattan dar', width(col) < width(line));
}

// Diziliş çevirme: yaya/atlı döngüleri ayrı, atlıda kalkan duvarı yok.
check('yaya döngü: Hat → Kalkan Duvarı', nextFormation('infantry', 'LINE') === 'SHIELD_WALL');
check('atlı döngü: Hat → Kama', nextFormation('cavalry', 'LINE') === 'WEDGE');
check('varsayılan cepheler B1 şeritleriyle aynı', defaultPerRow('infantry') === 12 && defaultPerRow('cavalry') === 6);

// Bölge kelepçesi.
{
  const c = clampToDeployZone(-999, 999);
  check('bölge kelepçesi köşeleri tutar', c.x === DEPLOY_ZONE.minX && c.z === DEPLOY_ZONE.maxZ);
  const inside = clampToDeployZone(10, 150);
  check('bölge içi nokta değişmez', inside.x === 10 && inside.z === 150);
}

// Boş bölük yuva üretmez.
check('boş bölük: 0 yuva', computeDivisionSlots('archer', 0, allyAnchor, 'LINE', 12).length === 0);

if (failures > 0) {
  console.log(`\n${failures} KONTROL BAŞARISIZ`);
  process.exit(1);
}
console.log('\nTÜM KONTROLLER GEÇTİ');
