/**
 * probe-notables.ts — Faz B0: yerleşim ileri gelenleri
 *
 *   npx tsx scripts/probe-notables.ts
 *
 * Üç şeyi doğrular:
 *  1. **Veri:** her yerleşimin kendi ileri gelenleri var; sayılar türüne uygun,
 *     isimler aynı yerleşimde tekil, nüfuz/ilişki aralıkları geçerli, kültür havuzu doğru.
 *  2. **Determinizm:** aynı sefer + aynı yerleşim → hep aynı kişiler; farklı sefer → farklı.
 *  3. **Arayüz:** modal veriyi kullanıyor (sabit liste değil), nüfuz/ilişki yazılıyor.
 *  4. **Kayıt göçü:** v2 (notables yok) ve v1 (world de yok) kayıtları tamamlanıyor.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { NotableSpeechCard, SettlementModal } from '../src/components/SettlementModal.tsx';
import {
  NAMES_FOR_TEST,
  generateNotables,
  ensureNotables,
  type SettlementNotable,
} from '../src/game/notables.ts';
import { createSaveData, parseSave } from '../src/game/saveGame.ts';
import { createInitialKingdomMacroState } from '../src/game/kingdomSystem.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const { settlements } = campaign;
const towns = settlements.filter((s) => s.type === 'TOWN');
const castles = settlements.filter((s) => s.type === 'CASTLE');
const villages = settlements.filter((s) => s.type === 'VILLAGE');

/* ── 1. Veri bütünlüğü ── */
const missing = settlements.filter((s) => !s.notables || s.notables.length === 0);
ok(missing.length === 0, 'her yerleşimin ileri geleni var', `${settlements.length} yerleşim`);

const total = settlements.reduce((n, s) => n + (s.notables?.length ?? 0), 0);
ok(total > 300, 'toplam ileri gelen sayısı anlamlı', `${total}`);

const townCounts = towns.map((s) => s.notables?.length ?? 0);
const villageCounts = villages.map((s) => s.notables?.length ?? 0);
ok(townCounts.every((n) => n >= 3 && n <= 4), 'kasabada 3–4 ileri gelen', `${Math.min(...townCounts)}–${Math.max(...townCounts)}`);
ok(villageCounts.every((n) => n >= 1 && n <= 2), 'köyde 1–2 ileri gelen', `${Math.min(...villageCounts)}–${Math.max(...villageCounts)}`);
ok(
  castles.every((s) => (s.notables?.length ?? 0) >= 2 && (s.notables?.length ?? 0) <= 3),
  'kalede 2–3 ileri gelen',
);

// 10.7: nüfuz Bannerlord ölçeğindedir (Sıradan <100, Etkili 100–199, Güçlü 200+).
const badPower = settlements.flatMap((s) => s.notables ?? []).filter((n) => n.power < 0 || n.power > 600);
const badRelation = settlements.flatMap((s) => s.notables ?? []).filter((n) => n.relation < -100 || n.relation > 100);
ok(badPower.length === 0, 'nüfuz Bannerlord ölçeğinde (0..600)', `${badPower.length} aykırı`);
const powerfulCount = settlements.flatMap((s) => s.notables ?? []).filter((n) => n.power >= 200).length;
ok(powerfulCount > 0, 'Güçlü (200+) eşraf var — soylu gönüllü kaynağı mevcut', `${powerfulCount} kişi`);
ok(badRelation.length === 0, 'ilişki -100..100 aralığında', `${badRelation.length} aykırı`);

const duplicateNames = settlements.filter((s) => {
  const names = new Set((s.notables ?? []).map((n) => n.name));
  return names.size !== (s.notables?.length ?? 0);
});
ok(duplicateNames.length === 0, 'aynı yerleşimde isim tekrarı yok', `${duplicateNames.length} yerleşim`);

const badSpeech = settlements
  .flatMap((s) => s.notables ?? [])
  .filter((n) => typeof n.speech !== 'string' || n.speech.length < 15 || !/[.!?]$/.test(n.speech.trim()));
ok(badSpeech.length === 0, 'her ileri gelenin dolu bir repliği var', `${badSpeech.length} eksik`);

const ids = settlements.flatMap((s) => (s.notables ?? []).map((n) => n.id));
ok(new Set(ids).size === ids.length, 'ileri gelen kimlikleri benzersiz', `${ids.length} kayıt`);

// Kültür havuzu: Vlandia kasabalarında Khuzait isimlerinden biri geçmemeli.
const khuzaitOnly = ['Temur', 'Bortai', 'Chagatai', 'Subutai', 'Khulan'];
const vlandiaTowns = towns.filter((s) => s.faction === 'vlandia');
const leaked = vlandiaTowns.flatMap((s) => (s.notables ?? []).map((n) => n.name));
ok(
  !leaked.some((name) => khuzaitOnly.some((k) => name.includes(k))),
  'isimler kültüre uygun (Vlandia kasabalarında bozkır adı yok)',
  `${leaked.length} ileri gelen tarandı`,
);

/* ── 2. Determinizm ── */
const town = towns[0];
const a = generateNotables(town, 20261021);
const b = generateNotables(town, 20261021);
ok(JSON.stringify(a) === JSON.stringify(b), 'aynı tohum → aynı ileri gelenler');

const other = generateNotables(town, 777);
ok(JSON.stringify(a) !== JSON.stringify(other), 'farklı tohum → farklı ileri gelenler');

const second = towns[1];
ok(
  JSON.stringify(generateNotables(town, 1).map((n) => n.name)) !==
    JSON.stringify(generateNotables(second, 1).map((n) => n.name)),
  'iki ayrı kasaba aynı listeyi paylaşmıyor',
);

const otherTown = generateNotables({ ...town, id: 'baska-kasaba' } as never, 20261021);
ok(
  JSON.stringify(otherTown.map((n) => n.name)) !== JSON.stringify(a.map((n) => n.name)),
  'kimlik değişince isimler de değişiyor (yerleşime özgü)',
);

/* ── 3. ensureNotables yalnızca eksikleri doldurur ── */
const custom: SettlementNotable[] = [
  {
    id: 'test:ruler',
    name: 'Test Beyi',
    title: 'Deneme Valisi',
    role: 'ruler',
    avatarIcon: 'crown',
    power: 42,
    relation: 7,
    speech: 'Bu bir deneme repliğidir.',
  },
];
const filled = ensureNotables([{ ...town, notables: undefined }, { ...town, notables: custom }], 5);
ok(filled[0].notables!.length >= 3, 'eksik yerleşim dolduruldu', `${filled[0].notables!.length}`);
ok(filled[1].notables === custom, 'mevcut liste korunuyor (yeniden üretilmiyor)');
ok(ensureNotables(filled, 5) === filled, 'tümü doluysa aynı dizi dönüyor (gereksiz kopya yok)');

/* ── 4. Arayüz veriyi kullanıyor ── */
const noop = () => null;
const render = (settlement: typeof town, camp = campaign) =>
  renderToStaticMarkup(
    React.createElement(SettlementModal, {
      settlement,
      campaign: camp,
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

const withCustom = { ...campaign, settlements: campaign.settlements.map((s) => (s.id === town.id ? { ...s, notables: custom } : s)) };
const html = render({ ...town, notables: custom }, withCustom);
const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok(text.includes('Test Beyi'), 'modal ileri geleni veriden okuyor', 'özel isim göründü');
const cardHtml = renderToStaticMarkup(React.createElement(NotableSpeechCard, { notable: custom[0], onClose: () => {} }));
const cardText = cardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
ok(cardText.includes('Test Beyi (Deneme Valisi)'), 'konuşma kartı unvanı yazıyor');
ok(cardText.includes('NÜFUZ 42') && cardText.includes('İLİŞKİ +7'), 'nüfuz ve ilişki yazılıyor');
ok(cardText.includes(custom[0].speech), 'replik kartta görünüyor');
ok(cardHtml.includes('data-testid="notable-speech"'), 'konuşma kartı işaretli');
ok(text.includes('İleri Gelenler'), 'ileri gelenler şeridi duruyor');

const generated = render(town);
const generatedText = generated.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const firstName = town.notables![0].name;
ok(generatedText.includes(firstName), 'üretilen ileri gelen modalda görünüyor', firstName);

/* ── 5. Kayıt göçü ── */
const macroState = createInitialKingdomMacroState(campaign);
const base = createSaveData({ campaign, macroState, metHeroIds: [], backgroundChoice: 'noble' });
const strippedNotables = {
  ...campaign,
  settlements: campaign.settlements.map((s) => ({ ...s, notables: undefined })),
};
const v2 = { ...base, version: 2, campaign: strippedNotables };
const migrated2 = parseSave(JSON.stringify(v2));
ok(migrated2 !== null, 'v2 kayıt reddedilmiyor');
ok(
  (migrated2?.campaign.settlements ?? []).every((s) => (s.notables?.length ?? 0) > 0),
  'v2 → v3 ileri gelenler tamamlandı',
);
ok(
  JSON.stringify(migrated2?.campaign.settlements[0].notables) ===
    JSON.stringify(campaign.settlements[0].notables),
  'göç, aynı tohumdan aynı kişileri üretiyor (sefer kimliği korunuyor)',
);

const v1 = { ...base, version: 1, campaign: { ...strippedNotables, world: undefined } };
const migrated1 = parseSave(JSON.stringify(v1));
ok(migrated1 !== null && migrated1.campaign.world !== undefined, 'v1 → v3 dünya durumu tamamlandı');
ok(
  (migrated1?.campaign.settlements ?? []).every((s) => (s.notables?.length ?? 0) > 0),
  'v1 → v3 ileri gelenler tamamlandı',
);

const roundTrip = parseSave(JSON.stringify(createSaveData({ campaign, macroState, metHeroIds: [], backgroundChoice: 'noble' })));
ok(
  JSON.stringify(roundTrip?.campaign.settlements) === JSON.stringify(campaign.settlements),
  'v3 kayıt turu ileri gelenleri kayıpsız koruyor',
  `${roundTrip?.campaign.settlements.reduce((n, s) => n + (s.notables?.length ?? 0), 0)} ileri gelen`,
);

/* ── 6. İsim havuzları boş değil ── */
const emptyPools = Object.entries(NAMES_FOR_TEST).filter(([, names]) => names.length === 0);
ok(emptyPools.length === 0, 'her kültürün isim havuzu dolu', `${Object.keys(NAMES_FOR_TEST).length} kültür`);

console.log(fails === 0 ? '\n✅ İLERİ GELENLER DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
