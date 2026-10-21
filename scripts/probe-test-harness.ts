/**
 * probe-test-harness.ts — E2E senaryo kancasının saf katmanı
 *
 *   npx tsx scripts/probe-test-harness.ts
 *
 * Tarayıcı açmadan şunları kilitler:
 *   1. Üretim kilidi: DEV değilken `e2e=1` hiçbir şey açmaz.
 *   2. Seed RNG'si aynı tohumda aynı diziyi üretir.
 *   3. Karşılaşma senaryoları gerçekten beklenen `EncounterScenario`yu üretir.
 *   4. Senaryoda `roster` ile `armySize` senkron kalır.
 *   5. Kurulum girdi kampanyasını mutasyona uğratmaz.
 */
import { classifyEncounterScenario } from '../src/game/encounter.ts';
import { createInitialCampaignState, getTotalTroops } from '../src/game/rules.ts';
import {
  buildE2EScenario,
  createSeededRandom,
  parseE2ERequest,
  type E2EScenarioName,
} from '../src/game/testHarness.ts';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

/* ── 1. üretim kilidi ve URL çözümleme ── */
{
  const prod = parseE2ERequest('?e2e=1&scenario=bandit-caught-player&seed=7', false);
  ok(!prod.enabled, 'üretimde e2e=1 kancayı açmıyor');

  const dev = parseE2ERequest('?e2e=1&scenario=bandit-caught-player&seed=7', true);
  ok(dev.enabled && dev.scenario === 'bandit-caught-player', 'DEV + e2e=1 senaryoyu açıyor');
  ok(dev.seed === 7 && dev.timeScale === 0, 'seed ve varsayılan diyalog zaman ölçeği doğru');

  const invalid = parseE2ERequest('?e2e=1&scenario=bilinmeyen&timeScale=99', true);
  ok(
    invalid.scenario === 'boot' && invalid.timeScale === 1,
    'geçersiz senaryo/zaman güvenli varsayılana düşüyor',
  );
}

/* ── 2. deterministik RNG ── */
{
  const first = createSeededRandom(42);
  const second = createSeededRandom(42);
  const a = Array.from({ length: 8 }, () => first());
  const b = Array.from({ length: 8 }, () => second());
  ok(a.every((value, i) => value === b[i]), 'aynı seed aynı RNG dizisini üretiyor');
  ok(a.every((value) => value >= 0 && value < 1), 'RNG değerleri [0,1) aralığında');
}

/* ── 3-5. senaryolar ── */
{
  const base = createInitialCampaignState('Komutan Demirhan', 'noble');
  const basePlayerRoster = { ...base.roster };
  const baseBandit = base.lords.find((lord) => lord.id === 'lord-kargi')!;
  const baseBanditRoster = { ...baseBandit.roster };

  const cases: Array<{
    name: E2EScenarioName;
    expected: string;
    lordId: string;
    playerTroops: number;
  }> = [
    {
      name: 'bandit-caught-player',
      expected: 'BANDIT_CAUGHT_PLAYER',
      lordId: 'lord-kargi',
      playerTroops: 6,
    },
    {
      name: 'player-caught-bandit',
      expected: 'PLAYER_CAUGHT_BANDIT',
      lordId: 'lord-kargi',
      playerTroops: 70,
    },
    {
      name: 'lord-caught-player',
      expected: 'LORD_CAUGHT_PLAYER',
      lordId: 'lord-garios',
      playerTroops: 6,
    },
  ];

  for (const testCase of cases) {
    const setup = buildE2EScenario(base, testCase.name);
    const lord = setup.dialogueLord;
    ok(lord?.id === testCase.lordId, `${testCase.name}: doğru muhatap seçiliyor`, lord?.id ?? 'yok');
    ok(setup.forcedEncounter, `${testCase.name}: zorunlu karşılaşma`);
    ok(
      setup.encounterScenario === testCase.expected,
      `${testCase.name}: senaryo etiketi doğru`,
      setup.encounterScenario ?? 'yok',
    );
    if (lord) {
      const info = classifyEncounterScenario(lord, setup.campaign);
      ok(
        info.scenario === testCase.expected,
        `${testCase.name}: üretim sınıflandırıcısı da aynı sonucu veriyor`,
        `oran=${info.strengthRatio}`,
      );
      ok(
        lord.armySize === getTotalTroops(lord.roster),
        `${testCase.name}: armySize ↔ roster senkron`,
        `${lord.armySize}/${getTotalTroops(lord.roster)}`,
      );
      ok(
        Math.hypot(lord.x - setup.campaign.playerX, lord.z - setup.campaign.playerZ) <= 2.01,
        `${testCase.name}: muhatap oyuncunun yanında başlıyor`,
      );
    }
    ok(
      getTotalTroops(setup.campaign.roster) === testCase.playerTroops,
      `${testCase.name}: oyuncu ordusu beklenen büyüklükte`,
      `${getTotalTroops(setup.campaign.roster)}`,
    );
  }

  const boot = buildE2EScenario(base, 'boot');
  ok(!boot.dialogueLord && !boot.encyclopediaOpen, 'boot: hiçbir panel zorla açılmıyor');

  const encyclopedia = buildE2EScenario(base, 'encyclopedia');
  ok(encyclopedia.encyclopediaOpen && !encyclopedia.dialogueLord, 'encyclopedia: yalnız ansiklopedi açık');

  ok(
    JSON.stringify(base.roster) === JSON.stringify(basePlayerRoster) &&
      JSON.stringify(baseBandit.roster) === JSON.stringify(baseBanditRoster),
    'senaryo kurulumu girdi kampanyasını mutasyona uğratmıyor',
  );
}

console.log(fails === 0 ? '\n✅ E2E TEST KANCASI DOĞRU' : `\n❌ ${fails} hata`);
process.exit(fails === 0 ? 0 : 1);
