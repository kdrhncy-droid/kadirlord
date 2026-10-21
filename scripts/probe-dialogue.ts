/**
 * probe-dialogue.ts — Faz 6: diyalog grafiğinin sözleşmesi
 *
 *   npx tsx scripts/probe-dialogue.ts
 */
import { createInitialCampaignState } from '../src/game/rules.ts';
import { buildQuestLog } from '../src/game/quests.ts';
import {
  applyOption,
  buildDialogue,
  canExit,
  numberedOptions,
  persuadeChance,
  validateDialogue,
} from '../src/game/dialogue.ts';

const campaign = createInitialCampaignState('Komutan Demirhan', 'noble');
const log = buildQuestLog(campaign);
const lord = campaign.lords.find((l) => l.faction !== 'bandits')!;
const town = campaign.settlements.find((s) => s.type !== 'VILLAGE')!;
const village = campaign.settlements.find((s) => s.type === 'VILLAGE')!;

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* 1. Barış diyaloğu */
const peace = buildDialogue({
  lord,
  campaign,
  relation: lord.relation,
  atWar: false,
  quest: log.active[0],
  canTrade: true,
});
const p1 = validateDialogue(peace);
ok(p1.length === 0, 'barış diyaloğu tutarlı', p1.slice(0, 3).join(' | '));
ok(canExit(peace), 'barış diyaloğunda çıkış yolu var');
ok(Object.keys(peace.nodes).length >= 8, 'barış diyaloğunda yeterli düğüm', `${Object.keys(peace.nodes).length}`);
ok(peace.root === 'root', 'kök düğüm root');
ok(peace.speakerName === lord.name, 'konuşan adı lord adı');

const rootOptions = numberedOptions(peace.nodes.root);
ok(rootOptions.length <= 9, 'seçenek sayısı 1–9 aralığında', `${rootOptions.length}`);
ok(rootOptions[0].index === 1, 'seçenek numaralandırması 1’den başlar');
ok(
  rootOptions.some((o) => o.id === 'quest-talk'),
  'görev seçeneği kökte var',
);
ok(rootOptions.some((o) => o.id === 'trade-rumour'), 'ticaret söylentisi seçeneği var');
ok(rootOptions.some((o) => o.id === 'leave'), 'vedalaşma seçeneği var');

/* 2. Görev kabulü etkisi */
const accepted = applyOption(peace, 'quest-offer', 'quest-accept', { relation: 10, gold: 500 });
ok(accepted.acceptedQuestId === log.active[0].id, 'görev kabulü doğru id döndürüyor');
ok(accepted.nextId === 'quest-accepted', 'kabul sonrası onay düğümüne gidiyor');
ok(accepted.relation === 10, 'kabul ilişkiyi bozmuyor');

/* 3. İlişki/altın etkileri */
const threatened = applyOption(peace, 'root', 'threat', { relation: 10, gold: 500 });
ok(threatened.relation === 7, 'tehdit ilişkiyi 3 düşürüyor');
const closed = applyOption(peace, 'root', 'leave', { relation: 10, gold: 500 });
ok(closed.closed === true, 'vedalaşma diyaloğu kapatıyor');
const trade = applyOption(peace, 'rumour', 'rumour-market', { relation: 0, gold: 0 });
ok(trade.openTrade === true, 'pazaryeri seçeneği ticaret açıyor');

/* 4. Ticaret yoksa pazaryeri seçeneği görünmüyor */
const noTrade = buildDialogue({ lord, campaign, relation: 0, atWar: false, quest: undefined, canTrade: false });
ok(
  !noTrade.nodes.rumour.options.some((o) => o.id === 'rumour-market'),
  'yerleşim dışında pazaryeri seçeneği yok',
);

/* 5. Görev yoksa görev seçeneği yok */
ok(
  !numberedOptions(noTrade.nodes.root).some((o) => o.id === 'quest-talk'),
  'görev yokken görev seçeneği çıkmıyor',
);

/* 6. Savaş diyaloğu */
const war = buildDialogue({ lord, campaign, relation: -30, atWar: true });
const p2 = validateDialogue(war);
ok(p2.length === 0, 'savaş diyaloğu tutarlı', p2.slice(0, 3).join(' | '));
ok(canExit(war), 'savaş diyaloğunda çıkış yolu var');
ok(
  war.nodes.root.text.includes('kılıcını'),
  'savaş diyaloğu tehdit tonunda',
);
ok(
  numberedOptions(war.nodes.root).some((o) => o.id === 'war-parley'),
  'savaşta ateşkes seçeneği var',
);

/* 7. İkna olasılığı sınırları */
ok(persuadeChance(40, 0) > 0.4 && persuadeChance(40, 0) < 0.6, 'nötr ikna ~%50');
ok(persuadeChance(90, -100) >= 0.05, 'ikna alt sınırı 0.05');
ok(persuadeChance(0, 200) <= 0.95, 'ikna üst sınırı 0.95');
ok(persuadeChance(40, 60) > persuadeChance(40, -60), 'yüksek ilişki iknayı artırıyor');

/* 8. Yerleşim muhatabı (muhtar) */
const headman = buildDialogue({ settlement: village, campaign, relation: 5, atWar: false, quest: log.active[1] });
ok(headman.speakerName === village.name, 'yerleşim muhatabı adı doğru');
ok(validateDialogue(headman).length === 0, 'muhtar diyaloğu tutarlı');

/* 9. Bozuk grafik yakalanıyor */
const broken = structuredClone(peace);
broken.nodes.root.options.push({ id: 'bad', text: 'x', next: 'yok-düğüm' });
ok(validateDialogue(broken).length > 0, 'eksik hedef düğüm doğrulamada yakalanıyor');
const deadEnd = structuredClone(peace);
deadEnd.nodes.root.options = [];
ok(validateDialogue(deadEnd).some((p) => p.includes('çıkmaz')), 'seçeneksiz düğüm çıkmaz olarak işaretleniyor');

console.log(fails === 0 ? '\n✅ DİYALOG SİSTEMİ DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
