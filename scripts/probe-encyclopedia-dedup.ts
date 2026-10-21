/**
 * probe-encyclopedia-dedup.ts — Ansiklopedide **tekrar** ölçümü (Faz 9g)
 *
 *   npx tsx scripts/probe-encyclopedia-dedup.ts
 *
 * Amaç: aynı bilgi (lider adı, krallık adı) sayfada kaç kez anılıyor?
 * Kural: kimlik bilgisi tek yerde okunur.
 *   · Klan sayfası  → lider adı: kimlik bloğunda **1**, kadroda yalnız kendi satırı.
 *                     Krallık adı **1** (LinkCard). "Aile Bağı" şeridi yok.
 *   · Yerleşim sayfası → tür **1**, krallık **1** (LinkCard).
 *   · Kahraman sayfası → "Son görüldü" **1**.
 *
 * Ölçüm **görünür metin** üzerinden yapılır: HTML etiketleri atılır (böylece
 * `title` / `aria-label` gibi erişilebilirlik nitelikleri tekrar sayılmaz) ve
 * **başka varlıkların adları maskelenir** (ör. "Kara" adlı liderin sayfasında
 * "Kara Geçit Yağmacıları" krallığı liderin ikinci anılışı sanılmasın).
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState, FACTION_INFO } from '../src/game/rules.ts';
import { EncyclopediaModal } from '../src/components/encyclopedia/EncyclopediaModal.tsx';
import {
  buildEncyclopediaIndex,
  clanMembers,
  settlementKingdom,
  type EncyclopediaRoute,
} from '../src/game/encyclopedia.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const factionNames = Object.fromEntries(
  Object.entries(FACTION_INFO).map(([id, info]) => [id, info.name]),
);
const index = buildEncyclopediaIndex(campaign, factionNames);

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/** HTML entity'lerini çöz (metni olduğu gibi sayabilmek için). */
const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** Sayfayı görünür metne çevir: etiketler boşluğa dönüşür. */
const textOf = (route: EncyclopediaRoute) =>
  decode(
    renderToStaticMarkup(
      React.createElement(EncyclopediaModal, {
        campaign,
        onClose: () => {},
        initialRoute: route,
        revealedHeroIds: index.heroes.map((h) => h.id),
      } as never),
    ).replace(/<[^>]*>/g, ' '),
  ).replace(/\s+/g, ' ');

/** Ölçümde karışmaması gereken özel adlar (krallık, klan, yerleşim). */
const OTHER_NAMES = [
  ...index.kingdoms.map((k) => k.name),
  ...index.clans.map((c) => c.name),
  // Haydut klanlarının `kingdomName`'i `index.kingdoms` içinde yok (bağımsızlar).
  ...index.clans.map((c) => c.kingdomName),
  ...index.settlements.map((s) => s.name),
]
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

/** Başka varlıkların adlarını `⌧` ile maskeler (uzun ad önce).
 *  `except` içindeki adlar korunur — ölçülen varlık maskelenmesin. */
const maskNames = (text: string, except: string[] = []) =>
  OTHER_NAMES.reduce((acc, name) => {
    if (except.includes(name) || !acc.includes(name)) return acc;
    return acc.split(name).join(' ⌧ ');
  }, text);

/** Harf/rakam dışı karakterler ayırıcıdır; sayım tam sözcük üzerinden yapılır. */
const tokensOf = (text: string) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const countWord = (haystack: string, needle: string) => {
  if (!needle) return 0;
  const hay = tokensOf(haystack);
  const parts = tokensOf(needle);
  if (parts.length === 0) return 0;
  let n = 0;
  for (let i = 0; i + parts.length <= hay.length; i++) {
    let hit = true;
    for (let j = 0; j < parts.length; j++) {
      if (hay[i + j] !== parts[j]) {
        hit = false;
        break;
      }
    }
    if (hit) n++;
  }
  return n;
};

/** Düz metin sayımı ("Lider", "Aile Bağı" gibi sabit etiketler için). */
const count = (haystack: string, needle: string) => {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
};

/**
 * Bir klan sayfasında lider adı için izin verilen anış sayısı:
 * kimlik bloğu (1) + kadroda o adı taşıyan üye sayısı (aynı adlı iki lord olabilir).
 */
const allowedLeaderMentions = (leaderName: string, clanId: string) =>
  1 + clanMembers(index, clanId).filter((h) => h.name === leaderName).length;

/* ───────────────── 1. Klan sayfası: lider ve krallık ───────────────── */

const clan =
  index.clans.find((c) => c.leaderId && c.kingdomId && c.memberIds.length > 2) ?? index.clans[0];
const rawClan = textOf({ section: 'CLAN', id: clan.id });
const clanText = maskNames(rawClan);
const leader = clan.leaderId ? index.heroById[clan.leaderId] : undefined;

console.log(`\n— Klan: ${clan.name} (${clan.memberIds.length} üye) —`);
if (leader) {
  const allowed = allowedLeaderMentions(leader.name, clan.id);
  ok(
    countWord(clanText, leader.name) === allowed,
    'lider adı yalnız kimlik + kadro satırında',
    `${leader.name} → ${countWord(clanText, leader.name)}× (izin ${allowed})`,
  );
  // Kimlik bloğu: başlık + altyazı (+ sağdaki krallık kartı). Orada tam 1 kez.
  const headerRaw = rawClan.split('Üyeler')[0] ?? '';
  ok(
    countWord(maskNames(headerRaw), leader.name) === 1,
    'kimlik bloğunda lider adı tam 1 kez',
    `${countWord(maskNames(headerRaw), leader.name)}×`,
  );
  ok(!clanText.includes('Lider: '), 'ayrı "Lider: ad" çipi kaldırıldı');
}
ok(
  count(clanText, 'Lider') === 1,
  'ayrı "Lider" kutusu/kartı yok, yalnız kadro rozeti',
  `"Lider" → ${count(clanText, 'Lider')}×`,
);
ok(!rawClan.includes('Aile Bağı'), 'tekrar eden "Aile Bağı" şeridi yok');
if (clan.kingdomId) {
  const n = countWord(maskNames(rawClan, [clan.kingdomName]), clan.kingdomName);
  ok(n === 1, 'krallık adı klan sayfasında tam 1 kez', `${clan.kingdomName} → ${n}×`);
}
ok(
  count(rawClan, `${clan.memberIds.length} üye`) === 1,
  'üye sayısı yalnız bir kez',
  `${count(rawClan, `${clan.memberIds.length} üye`)}×`,
);

/* 1b. Tüm klanlar: kural her klan için geçerli mi? (boş kadro / lidersiz klan) */
let clanViolations = 0;
for (const c of index.clans) {
  const page = textOf({ section: 'CLAN', id: c.id });
  const masked = maskNames(page);
  const led = c.leaderId ? index.heroById[c.leaderId] : undefined;
  if (led && countWord(masked, led.name) !== allowedLeaderMentions(led.name, c.id)) {
    clanViolations++;
    if (process.env.DEDUP_DEBUG) {
      console.log(`  [debug] ${c.id} lider ${led.name} → ${countWord(masked, led.name)}× (izin ${allowedLeaderMentions(led.name, c.id)})`);
    }
  }
  if (c.kingdomId && countWord(maskNames(page, [c.kingdomName]), c.kingdomName) !== 1) {
    clanViolations++;
    if (process.env.DEDUP_DEBUG) {
      console.log(`  [debug] ${c.id} krallık ${c.kingdomName} → ${countWord(maskNames(page, [c.kingdomName]), c.kingdomName)}×`);
    }
  }
  if (count(masked, 'Lider') > 1) {
    clanViolations++;
    if (process.env.DEDUP_DEBUG) console.log(`  [debug] ${c.id} "Lider" → ${count(masked, 'Lider')}×`);
  }
}
ok(
  clanViolations === 0,
  'tüm klan sayfaları tekrar kuralına uyuyor',
  `${index.clans.length} klan, ${clanViolations} ihlal`,
);

/* ───────────────── 2. Yerleşim sayfası: tür ve krallık ───────────────── */

const withKingdom = index.settlements
  .map((s) => ({ s, k: settlementKingdom(index, s) }))
  .filter((x) => !!x.k);
const target = withKingdom[0] ?? { s: index.settlements[0], k: null };
const rawSettlement = textOf({ section: 'SETTLEMENT', id: target.s.id });
const settlementText = maskNames(rawSettlement);
const typeLabel = { TOWN: 'Şehir', CASTLE: 'Kale', VILLAGE: 'Köy' }[target.s.type];

console.log(`\n— Yerleşim: ${target.s.name} —`);
ok(
  count(settlementText, typeLabel) === 1,
  'yerleşim türü tam 1 kez',
  `${typeLabel} → ${count(settlementText, typeLabel)}×`,
);
if (target.k) {
  const n = countWord(maskNames(rawSettlement, [target.k.name]), target.k.name);
  ok(n === 1, 'krallık adı yerleşim sayfasında tam 1 kez', `${target.k.name} → ${n}×`);
}

/* ───────────────── 3. Liste sayfalarında bilgi tekrarı ───────────────── */

const clanList = textOf({ section: 'CLANS' });
// Aynı adı taşıyan klanlar olabilir (isim üreticisi krallıklar arasında
// çakışabiliyor); ölçüt "her klan satırı adını bir kez yazar".
const sameNameClans = index.clans.filter((c) => c.name === clan.name).length;
ok(
  countWord(clanList, clan.name) === sameNameClans,
  'klan listesinde klan adı satır başına bir kez',
  `${clan.name} → ${countWord(clanList, clan.name)}× / ${sameNameClans} klan`,
);
if (clan.kingdomId) {
  const sameKingdom = index.clans.filter((c) => c.kingdomId === clan.kingdomId).length;
  const n = count(clanList, `${clan.kingdomName} · `);
  ok(
    n === sameKingdom,
    'klan listesinde krallık adı satır başına bir kez',
    `${clan.kingdomName} → ${n}× / ${sameKingdom} klan`,
  );
}

/* ───────────────── 4. Kahraman sayfası: ad ve son görülme ───────────────── */

const heroWithFamily = index.heroes.find((h) => !!h.family.spouseId) ?? index.heroes[0];
const heroRaw = textOf({ section: 'HERO', id: heroWithFamily.id });
const heroText = maskNames(heroRaw);
const heroName = countWord(heroText, heroWithFamily.name);
ok(
  heroName >= 1 && heroName <= 3,
  'kahraman adı 1–3 kez (başlık + aile ağacındaki kendi düğümü)',
  `${heroName}×`,
);
ok(
  count(heroText, 'Son görüldü') === 1,
  'son görülme kahraman sayfasında tek yerde',
  `${count(heroText, 'Son görüldü')}×`,
);

console.log(fails === 0 ? '\n✅ TEKRAR ÖLÇÜMÜ TEMİZ' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
