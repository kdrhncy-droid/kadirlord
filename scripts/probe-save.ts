/**
 * probe-save.ts — Sefer kaydı (Faz 10a)
 *
 *   npx tsx scripts/probe-save.ts
 *
 * `localStorage` yerine bellek içi sahte depolama kullanılır; böylece
 * tarayıcı olmadan gerçek serileştirme/doğrulama yolu sınanır.
 */
import { createInitialCampaignState } from '../src/game/rules.ts';
import { createInitialKingdomMacroState } from '../src/game/kingdomSystem.ts';
import { advanceDailyEconomyAndWorld } from '../src/game/rules.ts';
import {
  SAVE_KEY,
  SAVE_VERSION,
  clearSave,
  createSaveData,
  defaultStorage,
  parseSave,
  readSave,
  readSaveSummary,
  serializeSave,
  summarizeSave,
  writeSave,
  type SaveStorage,
} from '../src/game/saveGame.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const memoryStorage = (): SaveStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

/* ── 1. Gerçek kampanya ile tur ── */
const campaign = createInitialCampaignState('Komutan Demirhan', 'steppe');
const macroState = createInitialKingdomMacroState(campaign);
const metHeroIds = [campaign.lords[0].id, campaign.lords[1].id];
const storage = memoryStorage();

ok(
  writeSave(storage, { campaign, macroState, metHeroIds, backgroundChoice: 'steppe' }, 1_700_000_000_000),
  'kayıt yazıldı',
);
const loaded = readSave(storage);
ok(loaded !== null, 'kayıt okundu');
ok(loaded !== null && loaded.backgroundChoice === 'steppe', 'geçmiş (background) korundu');
ok(
  loaded !== null && loaded.metHeroIds.join(',') === metHeroIds.join(','),
  'tanışılan kahramanlar korundu',
  `${loaded?.metHeroIds.length ?? 0} kayıt`,
);
ok(
  loaded !== null && JSON.stringify(loaded.campaign) === JSON.stringify(campaign),
  'kampanya birebir aynı (derin eşitlik)',
);
ok(
  loaded !== null && loaded.macroState.clans.length === macroState.clans.length,
  'makro krallık durumu korundu',
  `${loaded?.macroState.clans.length ?? 0} klan`,
);
ok(loaded !== null && loaded.version === SAVE_VERSION, 'sürüm alanı doğru', `v${loaded?.version}`);

const summary = loaded ? summarizeSave(loaded) : null;
ok(
  summary?.day === campaign.day && summary?.playerName === campaign.playerName && summary?.gold === campaign.gold,
  'özet (gün/ad/altın) doğru',
  `Gün ${summary?.day} · ${summary?.playerName} · ${summary?.gold}`,
);
ok(readSaveSummary(storage)?.day === campaign.day, 'başlık ekranı özeti okunabiliyor');

/* ── 2. Uzun sefer (400 gün) tur ── */
let longCampaign = createInitialCampaignState('Uzun Sefer', 'noble');
for (let d = 0; d < 400; d++) longCampaign = advanceDailyEconomyAndWorld(longCampaign);
const longMacro = createInitialKingdomMacroState(longCampaign);
const storage2 = memoryStorage();
writeSave(storage2, {
  campaign: longCampaign,
  macroState: longMacro,
  metHeroIds: [],
  backgroundChoice: 'noble',
});
const longLoaded = readSave(storage2);
ok(longLoaded !== null && longLoaded.campaign.day === 401, '400 günlük sefer kaydedilip geri yüklendi', `Gün ${longLoaded?.campaign.day}`);
ok(
  longLoaded !== null && JSON.stringify(longLoaded.campaign.settlements) === JSON.stringify(longCampaign.settlements),
  '211 yerleşimin durumu kayıpsız',
  `${longLoaded?.campaign.settlements.length ?? 0} yerleşim`,
);

/* ── 3. Bozuk / eski / eksik kayıt → sessizce null (çökme yok) ── */
ok(parseSave(null) === null, 'boş kayıt → null');
ok(parseSave('') === null, 'boş metin → null');
ok(parseSave('{bozuk json') === null, 'bozuk JSON → null');
ok(parseSave('[1,2,3]') === null, 'dizi → null');

const good = createSaveData({ campaign, macroState, metHeroIds, backgroundChoice: 'noble' });
ok(parseSave(JSON.stringify({ ...good, version: SAVE_VERSION + 1 })) === null, 'farklı sürüm → null');
ok(
  parseSave(JSON.stringify({ ...good, campaign: { ...campaign, settlements: [] } })) === null,
  'yerleşimsiz kampanya → null',
);
ok(
  parseSave(JSON.stringify({ ...good, campaign: { ...campaign, day: 'pazartesi' } })) === null,
  'gün sayı değilse → null',
);
ok(
  parseSave(JSON.stringify({ ...good, macroState: { clans: [] } })) === null,
  'klansız makro durum → null',
);

const partial = parseSave(JSON.stringify({ ...good, metHeroIds: 'yok', backgroundChoice: 'xyz' }));
ok(
  partial !== null && partial.metHeroIds.length === 0 && partial.backgroundChoice === 'noble',
  'eksik alanlar güvenli varsayılana düşüyor',
);

/* ── 4. Depolama yok / dolu / bozuk ── */
ok(writeSave(null, { campaign, macroState, metHeroIds, backgroundChoice: 'noble' }) === false, 'depolama yoksa yazma false');
ok(readSave(null) === null, 'depolama yoksa okuma null');
ok(readSaveSummary(null) === null, 'depolama yoksa özet null');

const throwing: SaveStorage = {
  getItem: () => {
    throw new Error('quota');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('quota');
  },
};
ok(writeSave(throwing, { campaign, macroState, metHeroIds, backgroundChoice: 'noble' }) === false, 'dolu depolama yazmayı çökertmiyor');
ok(readSave(throwing) === null, 'bozuk depolama okumayı çökertmiyor');
clearSave(throwing); // hata fırlatmamalı
ok(true, 'clearSave hata fırlatmıyor');

/* ── 5. Silme ── */
clearSave(storage);
ok(storage.data.size === 0 && readSave(storage) === null, 'kayıt silindi');

/* ── 6. Anahtar ve varsayılan depolama ── */
ok(SAVE_KEY.startsWith('sancak-kalradya/'), 'kayıt anahtarı ad alanlı', SAVE_KEY);
ok(defaultStorage() === null, 'tarayıcısız ortamda depolama null (SSR güvenli)');
ok(serializeSave(good).length > 1000, 'serileştirme gerçek veri üretiyor', `${serializeSave(good).length} bayt`);

console.log(fails === 0 ? '\n✅ SEFER KAYDI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
