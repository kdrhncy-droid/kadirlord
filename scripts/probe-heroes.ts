/**
 * probe-heroes.ts — Ansiklopedi veri temeli (Faz 0) doğrulaması
 *
 *   npx tsx scripts/probe-heroes.ts
 */
import {
  FACTION_INFO,
  createInitialCampaignState,
  type LordAgent,
} from '../src/game/rules.ts';
import {
  ageOf,
  buildHeroRegistry,
  lastSeenLabel,
  revealHero,
  searchHeroes,
  visibleHeroInfo,
  SKILL_ORDER,
} from '../src/game/heroes.ts';

const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const registry = buildHeroRegistry(campaign, factionNames);
const heroes = Object.values(registry.heroes);

let fails = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}`);
};

/* 1. Kapsam */
ok(heroes.length === campaign.lords.length, `her lord için kayıt var (${heroes.length}/${campaign.lords.length})`);
ok(heroes.every((h) => registry.heroes[h.id]), 'kayıtlar id ile indeksli');

/* 2. Zorunlu alanlar */
const missing = heroes.filter(
  (h) => !h.name || !h.title || !h.clanId || !h.clanName || !h.kingdomName || !h.bio,
);
ok(missing.length === 0, `zorunlu alanlar dolu (eksik: ${missing.map((h) => h.id).join(', ') || 'yok'})`);

/* 3. Yaş */
const ages = heroes.map((h) => ageOf(h, campaign.day));
const ageOk = ages.every((a) => a >= 16 && a <= 70);
const ageSet = new Set(ages).size;
ok(ageOk, `yaşlar makul aralıkta (${Math.min(...ages)}–${Math.max(...ages)}) ve ${ageSet} farklı değer`);
ok(ages.every((a) => Number.isInteger(a)), 'yaşlar tam sayı');

/* 4. Determinizm */
const again = buildHeroRegistry(createInitialCampaignState('Komutan Demirhan', 'noble'), factionNames);
ok(JSON.stringify(again) === JSON.stringify(registry), 'iki kez üretim birebir aynı (deterministik)');

/* 5. Son görülme */
const badSeen = heroes.filter(
  (h) => !campaign.settlements.some((s) => s.id === h.lastSeen.settlementId),
);
ok(badSeen.length === 0, `son görülme yerleşimi geçerli (${heroes.length - badSeen.length}/${heroes.length})`);
ok(
  heroes.every((h) => typeof lastSeenLabel(h, campaign.day) === 'string' && lastSeenLabel(h, campaign.day).length > 8),
  'son görülme metni üretiliyor',
);
console.log('   örnek:', lastSeenLabel(heroes[0], campaign.day));

/* 6. Krallık / klan */
const bandit = heroes.filter((h) => h.kingdomId === null);
ok(bandit.every((h) => h.culture === 'bandits'), `krallıksız kayıtlar yalnızca haydutlar (${bandit.length})`);
ok(
  heroes.filter((h) => h.kingdomId).every((h) => h.kingdomName === factionNames[h.kingdomId!]),
  'krallık adları FACTION_INFO ile uyumlu',
);

/* 7. Beceri ve kişilik */
const skillCounts = new Set(heroes.map((h) => Object.keys(h.skills).length));
ok(
  skillCounts.size === 1 && [...skillCounts][0] === SKILL_ORDER.length,
  `her kahramanda ${SKILL_ORDER.length} beceri var`,
);
const lvl = heroes.flatMap((h) => Object.values(h.skills).map((s) => s!.level));
ok(Math.min(...lvl) >= 0 && Math.max(...lvl) <= 300, `beceri seviyeleri 0–300 (${Math.min(...lvl)}–${Math.max(...lvl)})`);
const tr = heroes.flatMap((h) => Object.values(h.traits));
ok(tr.every((v) => v >= -2 && v <= 2), `kişilik özellikleri -2..+2 (${Math.min(...tr)}..${Math.max(...tr)})`);

/* 8. Fog of war (orta yol) */
const h0 = heroes[0];
const hidden = visibleHeroInfo(h0, campaign.day);
ok(hidden.age === null && hidden.skills === null, 'tanışılmamış kahramanda yaş + beceri gizli');
const revealed = revealHero(registry, h0.id);
ok(
  visibleHeroInfo(revealed.heroes[h0.id], campaign.day).age !== null,
  'tanışılınca yaş açılıyor',
);
const q = searchHeroes(registry, heroes[0].name.slice(0, 4));
ok(q.length >= 1, `arama çalışıyor ("${heroes[0].name.slice(0, 4)}" → ${q.length} sonuç)`);

/* 9. Durum dağılımı */
const byStatus = heroes.reduce<Record<string, number>>((acc, h) => {
  acc[h.status] = (acc[h.status] ?? 0) + 1;
  return acc;
}, {});
console.log('   durumlar:', byStatus);
ok(Object.keys(byStatus).length >= 1, 'durum ataması yapıldı');

/* 10. Tablo özeti */
console.log('\n   kahraman                     yaş  meslek        krallık        son görülme');
for (const h of heroes as ReturnType<typeof Object.values<never>> extends never ? never : typeof heroes) {
  console.log(
    `   ${h.name.padEnd(26)} ${String(ageOf(h, campaign.day)).padStart(3)}  ` +
    `${h.occupation.padEnd(13)} ${h.kingdomName.padEnd(14)} ${h.lastSeen.settlementName}`,
  );
}

console.log(fails === 0 ? '\n✅ HERO VERİ TEMELİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
