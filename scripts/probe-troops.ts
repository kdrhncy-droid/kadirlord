/**
 * probe-troops.ts — 10.9: gerçek kültür birlik ağaçları + sınıf düzeltmesi
 *
 *   npx tsx scripts/probe-troops.ts
 *
 * Doğrular:
 *  1. Savaş sınıfları Bannerlord'un dörtlüsü (piyade/okçu/süvari/atlı okçu);
 *     atlı okçu hem atlı hem menzilli.
 *  2. Ağaç bütünlüğü: tekrar kimlik/kopuk terfi/kademe sıçraması yok, kökten
 *     her birliğe erişilebiliyor, hat geçişi yok.
 *  3. Vanilla yapı: her kültürde tek T1 halk kökü; altı kültürde T2→T6 soylu
 *     hat; atlı okçu yalnız İmparatorluk/Kuzait/Aserai'de; Batanya okçusu
 *     yalnız soylu Fian hattında; bilinen zincir uçları mevcut.
 *  4. CULTURE_TROOPS temsilci adları gerçek ağaçlarla tutarlı.
 *  5. Eski kayıt göçü: sahte `*_guard_N` kimlikleri ve `militia+guard`
 *     roster alanları piyadeye kayıpsız geçiyor.
 */
import { UNIT_DEFINITIONS, createInitialCampaignState, factionHasHorseArchers } from '../src/game/rules.ts';
import type { FactionId, UnitTierId } from '../src/game/rules.ts';
import {
  TROOP_DEFINITIONS,
  getTroopDefinition,
  migrateLegacyTroopId,
  validateTroopDefinitions,
  ensureBannerlordFoundation,
} from '../src/game/bannerlordFoundation.ts';
import { CULTURE_TROOPS, cultureHasClass } from '../src/game/troops.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const CULTURES: FactionId[] = ['empire', 'vlandia', 'battania', 'sturgia', 'khuzait', 'aserai'];
const ALL: FactionId[] = [...CULTURES, 'bandits', 'player'];
const defsOf = (c: FactionId) => TROOP_DEFINITIONS.filter((d) => d.culture === c);

/* ── 1. Sınıflar ── */
const classes = Object.keys(UNIT_DEFINITIONS) as UnitTierId[];
ok(
  JSON.stringify([...classes].sort()) === JSON.stringify(['archer', 'cavalry', 'horseArcher', 'infantry']),
  'dört Bannerlord sınıfı',
  classes.join(', '),
);
ok(
  UNIT_DEFINITIONS.horseArcher.isRanged && UNIT_DEFINITIONS.horseArcher.isMounted,
  'atlı okçu hem atlı hem menzilli',
);
ok(
  TROOP_DEFINITIONS.every((d) => d.battleClass !== ('guard' as string)),
  'hiçbir birlik tanımında guard sınıfı yok',
);

/* ── 2. Ağaç bütünlüğü ── */
const errors = validateTroopDefinitions();
ok(errors.length === 0, 'validateTroopDefinitions temiz', errors.slice(0, 3).join(' | '));

for (const culture of ALL) {
  const defs = defsOf(culture);
  const parents = new Set(defs.flatMap((d) => d.upgrades));
  const roots = defs.filter((d) => !parents.has(d.id));
  const seen = new Set<string>();
  const queue = roots.map((r) => r.id);
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(defs.find((d) => d.id === id)?.upgrades ?? []));
  }
  ok(seen.size === defs.length, `${culture}: tüm birlikler kökten erişilebilir`, `${seen.size}/${defs.length}`);
}

/* ── 3. Vanilla yapı ── */
for (const culture of ALL) {
  const t1 = defsOf(culture).filter((d) => d.tier === 1);
  ok(t1.length === 1 && !t1[0].isNobleLine, `${culture}: tek T1 halk kökü`, t1[0]?.id ?? 'yok');
}
for (const culture of CULTURES) {
  const noble = defsOf(culture).filter((d) => d.isNobleLine);
  const nobleParents = new Set(noble.flatMap((d) => d.upgrades));
  const nobleRoots = noble.filter((d) => !nobleParents.has(d.id));
  ok(
    nobleRoots.length === 1 && nobleRoots[0].tier === 2 && noble.some((d) => d.tier === 6 && d.upgrades.length === 0),
    `${culture}: soylu hat T2 kökten T6 uca`,
    `${nobleRoots[0]?.id} → ${noble.find((d) => d.tier === 6)?.id}`,
  );
  const commonLeaves = defsOf(culture).filter((d) => !d.isNobleLine && d.upgrades.length === 0);
  ok(commonLeaves.every((d) => d.tier === 5), `${culture}: halk hatları T5'te biter`, commonLeaves.map((d) => d.id).join(', '));
}

const haCultures = ALL.filter((c) => defsOf(c).some((d) => d.battleClass === 'horseArcher'));
ok(
  JSON.stringify([...haCultures].sort()) === JSON.stringify(['aserai', 'empire', 'khuzait', 'player']),
  'atlı okçu yalnız İmparatorluk/Kuzait/Aserai (+genel yedek)',
  haCultures.join(', '),
);
const battArchers = defsOf('battania').filter((d) => d.battleClass === 'archer');
ok(
  battArchers.length > 0 && battArchers.every((d) => d.isNobleLine),
  'Batanya okçusu yalnız soylu Fian hattında',
  battArchers.map((d) => d.id).join(', '),
);

const spotIds = [
  'empire_legionary_5', 'empire_cataphract_6', 'empire_bucellarii_5', 'empire_menavliaton_5',
  'vlandia_bannerknight_6', 'vlandia_sharpshooter_5', 'vlandia_vanguard_5',
  'battania_fian_6', 'battania_oathsworn_5',
  'sturgia_druzhinnik_6', 'sturgia_heavyaxe_5',
  'khuzait_khansguard_6', 'khuzait_darkhan_5', 'khuzait_heavylancer_5',
  'aserai_farisvanguard_6', 'aserai_mamlukepalace_5', 'aserai_masterarcher_5',
];
const missing = spotIds.filter((id) => !getTroopDefinition(id));
ok(missing.length === 0, 'bilinen vanilla zincir uçları mevcut', missing.join(', ') || `${spotIds.length} birlik`);
ok(getTroopDefinition('empire_bucellarii_5')?.battleClass === 'horseArcher', 'Bukelları atlı okçu sınıfında');
ok(
  getTroopDefinition('sturgia_varyag_3')?.battleClass === 'infantry' &&
    getTroopDefinition('sturgia_varyagveteran_4')?.battleClass === 'cavalry',
  'Sturgiya soylu hattı yaya başlayıp süvariye geçer',
);
ok(
  getTroopDefinition('empire_recruit')?.upgrades.includes('empire_archer_2') ?? false,
  'İmparatorluk acemisi doğrudan okçuya da terfi eder',
);

/* ── 3b. Havuz koruması: kültürde olmayan sınıf gönüllü veremez ── */
let poolMatrixOk = true;
for (const culture of ALL) {
  if (factionHasHorseArchers(culture) !== cultureHasClass(culture, 'horseArcher')) poolMatrixOk = false;
}
ok(poolMatrixOk, 'factionHasHorseArchers matrisi ağaçlarla tutarlı');
const world = createInitialCampaignState();
const badPools = world.settlements.filter(
  (s) => !factionHasHorseArchers(s.faction) && s.recruitPool.horseArcher > 0,
);
ok(badPools.length === 0, 'atlı okçusu olmayan kültür yerleşimleri havuzda atlı okçu vermez', badPools.map((s) => s.name).join(', '));
ok(
  world.settlements.some((s) => s.faction === 'khuzait' && s.recruitPool.horseArcher > 0),
  'Kuzait yerleşimleri atlı okçu gönüllüsü verebilir',
);

/* ── 4. Temsilci ad tutarlılığı ── */
let consistent = true;
for (const culture of ALL) {
  for (const cls of classes) {
    const hasDef = defsOf(culture).some((d) => d.battleClass === cls);
    if (hasDef !== cultureHasClass(culture, cls)) consistent = false;
    if (hasDef && !CULTURE_TROOPS[culture]?.[cls]?.name) consistent = false;
  }
}
ok(consistent, 'CULTURE_TROOPS sınıfları gerçek ağaçlarla birebir');

/* ── 5. Eski kayıt göçü ── */
ok(
  getTroopDefinition(migrateLegacyTroopId('empire_guard_5'))?.battleClass === 'infantry',
  'eski empire_guard_5 → piyade',
  migrateLegacyTroopId('empire_guard_5'),
);
ok(
  migrateLegacyTroopId('khuzait_cavalry_3') === 'khuzait_horseman_3',
  'eski khuzait_cavalry_3 → khuzait_horseman_3',
);
ok(
  getTroopDefinition('aserai_guard_4')?.battleClass === 'infantry',
  'getTroopDefinition eski kimliği göçle buluyor',
);
ok(
  getTroopDefinition(migrateLegacyTroopId('vlandia_infantry_2'))?.tier === 2,
  'göçte kademe korunur',
  migrateLegacyTroopId('vlandia_infantry_2'),
);

const base = createInitialCampaignState();
const legacyState = {
  ...base,
  roster: { militia: 10, guard: 5, archer: 3, cavalry: 2 },
  troopStacks: [
    { troopId: 'empire_guard_5', count: 4, wounded: 1, xp: 0 },
    { troopId: 'empire_infantry_3', count: 6, wounded: 0, xp: 0 },
  ],
} as unknown as typeof base;
const migrated = ensureBannerlordFoundation(legacyState);
ok(
  migrated.roster.infantry >= 15 && migrated.roster.archer === 3 && migrated.roster.cavalry === 2,
  'eski militia+guard rosterı piyadede birleşti (kayıpsız)',
  JSON.stringify(migrated.roster),
);
ok(
  (migrated.troopStacks ?? []).length > 0 &&
    (migrated.troopStacks ?? []).every((s) => getTroopDefinition(s.troopId)?.id === s.troopId),
  'eski yığın kimlikleri yeni ağaçlara göç etti',
  (migrated.troopStacks ?? []).map((s) => `${s.troopId}×${s.count}`).join(', '),
);

console.log(fails === 0 ? '\nTÜM KONTROLLER GEÇTİ' : `\n${fails} KONTROL BAŞARISIZ`);
process.exit(fails === 0 ? 0 : 1);
