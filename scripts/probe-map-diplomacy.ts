import assert from 'node:assert/strict';
import { createInitialCampaignState } from '../src/game/rules.ts';
import { applyPlayerAllegianceChange } from '../src/game/rules.ts';
import {
  getSettlementDiplomacyStance,
  getLordDiplomacyStance,
  getDiplomacyVisualTheme,
} from '../src/game/mapDiplomacy.ts';

console.log('🧪 Harita Diplomasi ve Renklendirme Sistemi Testi Başlatılıyor...');

const baseCampaign = createInitialCampaignState();

// 1. Bağımsız Oyuncu Durumu:
// Bağımsızken oyuncu hiçbir krallıkla resmi savaşta değildir.
const vlandiaTown = baseCampaign.settlements.find((s) => s.faction === 'vlandia')!;
assert.ok(vlandiaTown);
assert.equal(getSettlementDiplomacyStance(vlandiaTown, baseCampaign), 'NEUTRAL');

const derthert = baseCampaign.lords.find((l) => l.faction === 'vlandia')!;
assert.ok(derthert);
assert.equal(getLordDiplomacyStance(derthert, baseCampaign), 'NEUTRAL');

// Haydutlar bağımsızken de düşmandır
const bandit = baseCampaign.lords.find((l) => l.faction === 'bandits')!;
assert.ok(bandit);
assert.equal(getLordDiplomacyStance(bandit, baseCampaign), 'HOSTILE');

// 2. Vlandiya'ya Paralı Asker Olarak Katılma Durumu:
// Vlandiya Batanya ile savaşta başlar.
const allegianceRes = applyPlayerAllegianceChange(baseCampaign, 'vlandia', 'MERCENARY');
assert.equal(allegianceRes.success, true);
const mercenaryCamp = allegianceRes.nextState;

// Vlandiya yerleşimi dost (yeşil) olmalıdır
assert.equal(getSettlementDiplomacyStance(vlandiaTown, mercenaryCamp), 'FRIENDLY');

// Vlandiya lordu dost olmalıdır
assert.equal(getLordDiplomacyStance(derthert, mercenaryCamp), 'FRIENDLY');

// Batanya yerleşimi düşman (kırmızı) olmalıdır
const battaniaTown = mercenaryCamp.settlements.find((s) => s.faction === 'battania')!;
assert.ok(battaniaTown);
assert.equal(getSettlementDiplomacyStance(battaniaTown, mercenaryCamp), 'HOSTILE');

// Batanya lordu düşman (kırmızı) olmalıdır
const caladog = mercenaryCamp.lords.find((l) => l.faction === 'battania')!;
assert.ok(caladog);
assert.equal(getLordDiplomacyStance(caladog, mercenaryCamp), 'HOSTILE');

// Savaşta olunmayan tarafsız krallık (örn: Aserai) nötr kalmalıdır
const aseraiTown = mercenaryCamp.settlements.find((s) => s.faction === 'aserai')!;
assert.ok(aseraiTown);
assert.equal(getSettlementDiplomacyStance(aseraiTown, mercenaryCamp), 'NEUTRAL');

// 3. Görsel Tema Testi
const hostileTheme = getDiplomacyVisualTheme('HOSTILE', 'battania');
assert.equal(hostileTheme.hexColor, 0xef4444);
assert.equal(hostileTheme.shieldBgColor, '#b91c1c');
assert.match(hostileTheme.containerBorderClass, /red/);

const friendlyTheme = getDiplomacyVisualTheme('FRIENDLY', 'vlandia');
assert.equal(friendlyTheme.hexColor, 0x22c55e);
assert.equal(friendlyTheme.shieldBgColor, '#047857');
assert.match(friendlyTheme.containerBorderClass, /emerald/);

const neutralTheme = getDiplomacyVisualTheme('NEUTRAL', 'sturgia');
assert.notEqual(neutralTheme.hexColor, 0xef4444);
assert.notEqual(neutralTheme.hexColor, 0x22c55e);

console.log('✅ TÜM HARİTA DİPLOMASİ VE RENKLENDİRME TESTLERİ GEÇTİ!');
