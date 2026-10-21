/**
 * probe-troops.ts — Faz B2 (ilk dilim): kültüre özgü asker adları
 *
 *   npx tsx scripts/probe-troops.ts
 *
 * Savaş motoru dört sınıfla çalışıyor; bu dilim yalnızca **adları** kültüre
 * bağlıyor. Probe şunları arar:
 *  1. 8 taraf × 4 sınıf için ad/rol tanımlı mı, adlar kendi içinde tekil mi?
 *  2. Kültürler birbirinden gerçekten farklı mı (kopyala-yapıştır kalmamış mı)?
 *  3. Metinlerde Kiril/bozuk karakter var mı?
 *  4. Arayüz doğru kültürü gösteriyor mu (Vlandiya kasabasında şövalye, bozkırda noyan)?
 *  5. Tanımsız taraf için güvenli geri düşüş var mı?
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FACTION_INFO, UNIT_DEFINITIONS, createInitialCampaignState } from '../src/game/rules.ts';
import type { FactionId, UnitTierId } from '../src/game/rules.ts';
import { CULTURE_TROOPS, cultureTroopLine, troopName, troopRole } from '../src/game/troops.ts';
import { SettlementModal } from '../src/components/SettlementModal.tsx';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const factions = Object.keys(CULTURE_TROOPS) as FactionId[];
const tiers = Object.keys(UNIT_DEFINITIONS) as UnitTierId[];

/* ── 1. Bütünlük ── */
ok(factions.length === 8, 'sekiz taraf tanımlı', factions.join(', '));
ok(tiers.length === 4, 'dört asker sınıfı var', tiers.join(', '));

const incomplete = factions.filter((f) =>
  tiers.some((t) => !CULTURE_TROOPS[f][t] || !CULTURE_TROOPS[f][t].name || !CULTURE_TROOPS[f][t].role),
);
ok(incomplete.length === 0, 'her taraf × sınıf için ad ve rol dolu', `${factions.length * tiers.length} kayıt`);

const duplicateNames = factions.filter((f) => {
  const names = tiers.map((t) => CULTURE_TROOPS[f][t].name);
  return new Set(names).size !== names.length;
});
ok(duplicateNames.length === 0, 'aynı kültür içinde ad tekrarı yok', `${duplicateNames.length} kültür`);

/* ── 2. Kültürler farklı ── */
const signatures = factions.map((f) => tiers.map((t) => CULTURE_TROOPS[f][t].name).join('|'));
ok(new Set(signatures).size === signatures.length, 'hiçbir kültür diğerinin listesini kopyalamıyor');

const vlandiaCav = CULTURE_TROOPS.vlandia.cavalry.name;
const khuzaitCav = CULTURE_TROOPS.khuzait.cavalry.name;
ok(vlandiaCav !== khuzaitCav, 'Vlandiya ve Khuzait süvarisi ayrı adlandırılmış', `${vlandiaCav} ↔ ${khuzaitCav}`);
ok(/şövalye/i.test(vlandiaCav), 'Vlandiya süvarisi şövalye');
ok(/atlı okçu/i.test(khuzaitCav), 'Khuzait süvarisi atlı okçu');

/* ── 3. Kiril/bozuk karakter yok ── */
const cyrillic = /[\u0400-\u04FF]/;
const bad = factions.flatMap((f) => tiers.map((t) => CULTURE_TROOPS[f][t])).filter((u) => cyrillic.test(u.name + u.role));
ok(bad.length === 0, 'adlarda Kiril karakter yok', `${bad.length} kayıt`);

const emptyish = factions
  .flatMap((f) => tiers.map((t) => CULTURE_TROOPS[f][t]))
  .filter((u) => u.name.trim().length < 4 || u.role.trim().length < 4);
ok(emptyish.length === 0, 'adlar ve roller anlamlı uzunlukta', `${emptyish.length} kısa kayıt`);

/* ── 4. Yardımcı fonksiyonlar ── */
ok(troopName('cavalry', 'battania') === CULTURE_TROOPS.battania.cavalry.name, 'troopName kültürü kullanıyor');
ok(troopName('cavalry') === UNIT_DEFINITIONS.cavalry.name, 'taraf verilmezse genel ada düşüyor');
ok(troopRole('archer', 'sturgia') === CULTURE_TROOPS.sturgia.archer.role, 'troopRole kültürü kullanıyor');
ok(UNIT_DEFINITIONS.cavalry.name !== troopName('cavalry', 'vlandia'), 'kültür adı genel addan farklı (gerçekten yeni bilgi)');

const line = cultureTroopLine('aserai');
ok(line.length === 4 && line.every((u) => u.id && u.name), 'kültür hattı dört sınıf döndürüyor');
ok(cultureTroopLine('bandits')[0].name === CULTURE_TROOPS.bandits.militia.name, 'haydut hattı tanımlı');

/* ── 5. Arayüz doğru kültürü gösteriyor ── */
const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const byFaction = (f: FactionId) =>
  campaign.settlements.find((s) => s.faction === f && s.type === 'TOWN')!;

const noop = () => null;
const render = (settlement: (typeof campaign.settlements)[number]) =>
  renderToStaticMarkup(
    React.createElement(SettlementModal, {
      settlement,
      campaign,
      initialTab: 'recruit',
      onClose: () => {},
      onRecruit: noop,
      onBuyFood: noop,
      onStartSiegeBattle: noop,
      onHireMercenaries: noop,
      onRansomPrisoners: noop,
      onBuyTavernRound: noop,
      onArenaPractice: noop,
      onArenaTournament: noop,
      onSellLoot: noop,
      onManageGarrison: noop,
      onRestAndRecover: noop,
    } as never),
  );

const vlandiaTown = byFaction('vlandia');
const khuzaitTown = byFaction('khuzait');
const vText = render(vlandiaTown).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const kText = render(khuzaitTown).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

ok(vText.includes(CULTURE_TROOPS.vlandia.cavalry.name), 'Vlandiya kasabasında Vlandiya süvarisi görünüyor');
ok(kText.includes(CULTURE_TROOPS.khuzait.cavalry.name), 'Khuzait kasabasında bozkır süvarisi görünüyor');
ok(!kText.includes(CULTURE_TROOPS.vlandia.cavalry.name), 'Khuzait kasabasında Vlandiya adı sızmıyor');
ok(vText.includes(UNIT_DEFINITIONS.cavalry.name), 'genel sınıf adı da yazılıyor (savaş paneliyle eşleşsin)');

/* ── 6. FACTION_INFO ile tutarlılık ── */
ok(
  factions.every((f) => FACTION_INFO[f as keyof typeof FACTION_INFO] !== undefined),
  'kültür anahtarları FACTION_INFO ile uyumlu',
);
ok(UNIT_DEFINITIONS.guard.name.length > 0, 'muhafız sınıfı tanımı duruyor (savaş kodu değişmedi)');

console.log(fails === 0 ? '\n✅ KÜLTÜR ASKER ADLARI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
