/**
 * probe-balance.ts — denge denetimi (rapor üretir; eşik iddiası yok).
 * Savaş matrisi, günlük ekonomi, ilerleme eğrileri ve 120 günlük dünya
 * simülasyonu (kartoplaşma/savaş sıklığı) sayılarını basar.
 */
import {
  UNIT_DEFINITIONS,
  calculateClanTier,
  calculateDailyWage,
  computeMeleeDamage,
  createInitialCampaignState,
  getTotalTroops,
  calculateSettlementDailyStats,
  type CampaignState,
  type FactionId,
  type TroopRoster,
} from '../src/game/rules';
import { battleGoldReward } from '../src/game/loot';
import { getPartyLimit } from '../src/game/partySystem';
import { advanceWorldDay } from '../src/game/worldSim';

// BattlefieldView classStats (denetim kopyası; kaynak: BattlefieldView.tsx)
const CLASS_STATS = {
  infantry: { hp: 95, attack: 18, defense: 12, speed: 5.0, range: 2.6 },
  archer: { hp: 75, attack: 17, defense: 7, speed: 5.2, range: 55 },
  cavalry: { hp: 115, attack: 24, defense: 10, speed: 10.6, range: 2.9 },
  horseArcher: { hp: 95, attack: 18, defense: 8, speed: 10.6, range: 45 },
} as const;
type Cls = keyof typeof CLASS_STATS;
const CLASSES = Object.keys(CLASS_STATS) as Cls[];
// Saldırı çevrimi (BattlefieldView): yakın ~1,37 sn, menzilli ~2,57 sn
const cycleOf = (c: Cls) => (CLASS_STATS[c].range > 6 ? 2.57 : 1.37);

console.log('═══ 1) SINIF SAVAŞ MATRİSİ (vuruş hasarı / öldürme süresi) ═══');
for (const atk of CLASSES) {
  const a = CLASS_STATS[atk];
  const cells = CLASSES.map((def) => {
    const d = CLASS_STATS[def];
    const heavy = atk === 'cavalry';
    const dmg = computeMeleeDamage(a.attack, d.defense, heavy, false, 1);
    const hits = Math.ceil(d.hp / dmg);
    const ttk = (hits * cycleOf(atk)).toFixed(1);
    return `${def}: ${dmg}h/${hits}v/${ttk}sn`;
  });
  console.log(`${atk.padEnd(12)} → ${cells.join(' | ')}`);
}
console.log(
  'Not: menzilli hasar şu an isabet garantili (mermi yok); menzil 55/45, ıskalama yok.',
);

console.log('\n═══ 2) GÜNLÜK EKONOMİ ═══');
for (const cls of CLASSES) {
  const def = UNIT_DEFINITIONS[cls];
  console.log(
    `${cls.padEnd(12)} maaş/gün: ${def.dailyWage} | işe alım: ${(def as { recruitCost?: number }).recruitCost ?? '?'} | ad: ${def.name}`,
  );
}
const samples: Array<[string, TroopRoster]> = [
  ['küçük (17)', { infantry: 7, archer: 5, cavalry: 3, horseArcher: 2 }],
  ['orta (60)', { infantry: 25, archer: 18, cavalry: 10, horseArcher: 7 }],
  ['büyük (150)', { infantry: 60, archer: 45, cavalry: 28, horseArcher: 17 }],
];
for (const [label, roster] of samples) {
  console.log(`Parti ${label}: günlük maaş ${calculateDailyWage(roster)} dinar`);
}
for (const n of [8, 30, 100]) {
  console.log(
    `Savaş ganimeti (${n} düşen): ${battleGoldReward(n, false)} dinar (kuşatma: ${battleGoldReward(n, true)})`,
  );
}

console.log('\n═══ 3) İLERLEME ═══');
for (const renown of [0, 50, 150, 350, 900, 2000]) {
  const t = calculateClanTier(renown);
  console.log(
    `Nam ${renown}: kademe ${t.tier} (${t.title}), parti bonusu +${t.maxPartyBonus}, sonraki eşik ${t.nextRenown}`,
  );
}
{
  const st = createInitialCampaignState('Denetim', 'noble', { realisticBannerlordStart: true });
  console.log(
    `Yeni oyun: asker ${getTotalTroops(st.roster)}, altın ${st.gold}, parti limiti ${getPartyLimit(st)}`,
  );
}

console.log('\n═══ 4) YERLEŞİM SAVUNMA ÖLÇEĞİ (örnek kasaba) ═══');
{
  const st = createInitialCampaignState('Denetim', 'noble', { realisticBannerlordStart: true });
  const town = st.settlements.find((s) => s.type === 'TOWN')!;
  const stats = calculateSettlementDailyStats(town, st);
  console.log(
    `${town.name}: garnizon ${town.garrison}, milis ${stats.militia.value}, refah ${town.prosperity}`,
  );
  console.log(
    `  worldSim savunma ağırlığı ≈ ${(town.garrison * 0.7 + stats.militia.value * 0.3).toFixed(0)} (garnizon×0,7 + milis×0,3)`,
  );
  const lordSizes = st.lords.map((l) => getTotalTroops(l.roster ?? { infantry: 0, archer: 0, cavalry: 0, horseArcher: 0 }));
  const sorted = [...lordSizes].sort((a, b) => a - b);
  console.log(
    `Lord partileri: n=${sorted.length}, min ${sorted[0]}, medyan ${sorted[Math.floor(sorted.length / 2)]}, max ${sorted[sorted.length - 1]}`,
  );
}

console.log('\n═══ 5) DÜNYA SİMÜLASYONU (120 gün) ═══');
{
  let state = createInitialCampaignState('Denetim', 'noble', { realisticBannerlordStart: true });
  const snapshot = (label: string) => {
    const counts = new Map<FactionId, number>();
    for (const s of state.settlements) {
      if (s.type === 'VILLAGE') continue;
      counts.set(s.faction, (counts.get(s.faction) ?? 0) + 1);
    }
    const wars = state.world?.wars?.length ?? 0;
    const sizes = state.lords.map((l) =>
      getTotalTroops(l.roster ?? { infantry: 0, archer: 0, cavalry: 0, horseArcher: 0 }),
    );
    const maxSize = Math.max(...sizes);
    const parts = [...counts.entries()].map(([f, n]) => `${f}:${n}`).join(' ');
    console.log(`${label} | şehir/kale: ${parts} | aktif savaş: ${wars} | en büyük parti: ${maxSize}`);
  };
  snapshot('gün 0  ');
  let siegeMentions = 0;
  let captureMentions = 0;
  const categoryTally = new Map<string, number>();
  for (let day = 1; day <= 120; day++) {
    const res = advanceWorldDay(state);
    state = res.state;
    for (const ev of res.events ?? []) {
      const text = (ev as { text?: string }).text ?? '';
      const cat = (ev as { category?: string }).category ?? '?';
      categoryTally.set(cat, (categoryTally.get(cat) ?? 0) + 1);
      if (/kuşat/i.test(text)) siegeMentions++;
      if (/ele geçir|fethetti|düştü|zapt/i.test(text)) captureMentions++;
    }
    if (day === 30) snapshot('gün 30 ');
    if (day === 60) snapshot('gün 60 ');
    if (day === 120) snapshot('gün 120');
  }
  console.log(
    `Olay kategorileri: ${[...categoryTally.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`,
  );
  console.log(`Kuşatma anan olay: ${siegeMentions}, fetih anan olay: ${captureMentions}`);
}

console.log('\nDenetim tamam.');
