/**
 * perf-check.mjs — performans ölçümü (denetim amaçlı; eşik iddiası yok).
 * SwiftShader (yazılım GL) gerçek GPU FPS'i vermez; ölçülen şey görece
 * maliyet + ana iş parçacığı uzun görevleri + JS belleğidir. Sahneler:
 * sefer haritası (uzak/yakın), küçük savaş, büyük savaş (130v130).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/chromium.mjs';

const E2E_ROOT = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://127.0.0.1:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchChromium();
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.setDefaultTimeout(180_000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const MEASURE_FN = `async (seconds) => {
  const deltas = [];
  await new Promise((resolve) => {
    let last = performance.now();
    const t0 = last;
    const loop = (t) => {
      deltas.push(t - last);
      last = t;
      if (t - t0 < seconds * 1000) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  deltas.sort((a, b) => a - b);
  const avg = deltas.reduce((s, d) => s + d, 0) / Math.max(1, deltas.length);
  const p95 = deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95))] ?? 0;
  const longtasks = window.__longtasks ?? [];
  window.__longtasks = [];
  return {
    frames: deltas.length,
    fpsAvg: Math.round(1000 / Math.max(0.01, avg)),
    frameP95ms: Math.round(p95),
    longTasksOver50ms: longtasks.filter((d) => d >= 50).length,
    longTaskMaxMs: longtasks.length ? Math.round(Math.max(...longtasks)) : 0,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    domNodes: document.getElementsByTagName('*').length,
  };
}`;

async function installLongtaskObserver() {
  await page.evaluate(() => {
    window.__longtasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longtasks.push(e.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* longtask desteklenmiyor */
    }
  });
}

async function loadScenario(scenario, extra = {}) {
  const params = new URLSearchParams({
    e2e: '1',
    autostart: '1',
    seed: '42',
    scenario,
    timeScale: '0',
    ...extra,
  });
  await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 180_000 });
  await installLongtaskObserver();
  await wait(3000);
}

async function walkDialogueToBattle() {
  await page.waitForSelector('[data-testid="dialogue-modal"]', { timeout: 180_000 });
  for (let step = 0; step < 6; step++) {
    const attack = await page.$('[data-testid="dialogue-option-enc-attack"]');
    if (attack) break;
    const clicked = await page.evaluate(() => {
      const opts = [...document.querySelectorAll('[data-testid^="dialogue-option-"]')];
      const pick = opts.find((el) => {
        const id = el.getAttribute('data-testid') ?? '';
        return !/surrender|parley|bribe|escape/i.test(id);
      });
      if (pick) {
        pick.click();
        return true;
      }
      return false;
    });
    if (!clicked) break;
    await wait(900);
  }
  await page.waitForSelector('[data-testid="dialogue-option-enc-attack"]', { timeout: 60_000 });
  await page.click('[data-testid="dialogue-option-enc-attack"]');
  await page.waitForFunction(() => window.__kadirlordTest.getState().subMode === 'battle', {
    timeout: 180_000,
  });
}

const report = {};

// 1) Sefer haritası (açılış görünümü)
await loadScenario('boot');
report.overworldDefault = await page.evaluate(`(${MEASURE_FN})(5)`);
console.log('harita (varsayılan):', JSON.stringify(report.overworldDefault));

// 2) Harita yakın zoom (etiketler + parti modelleri görünür)
await page.mouse.move(720, 450);
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel({ deltaY: -600 });
  await wait(250);
}
await wait(2000);
report.overworldZoomed = await page.evaluate(`(${MEASURE_FN})(5)`);
console.log('harita (yakın):', JSON.stringify(report.overworldZoomed));

// 3) Küçük savaş (6 asker)
await loadScenario('bandit-caught-player');
await walkDialogueToBattle();
await wait(3000);
report.battleSmall = await page.evaluate(`(${MEASURE_FN})(5)`);
console.log('küçük savaş:', JSON.stringify(report.battleSmall));

// 4) Büyük savaş (130v130, ilk dalga 200 aktör)
await loadScenario('big-battle');
await walkDialogueToBattle();
await page.waitForSelector('[data-testid="deployment-panel"]', { timeout: 120_000 });
await wait(2000);
report.deployBig = await page.evaluate(`(${MEASURE_FN})(4)`);
console.log('konuşlanma (büyük):', JSON.stringify(report.deployBig));
await page.click('[data-testid="deployment-start"]');
await page.waitForSelector('[data-testid="command-panel"]', { timeout: 60_000 });
await page.keyboard.press('Digit0');
await wait(250);
await page.keyboard.press('F1');
await wait(300);
await page.keyboard.press('F3');
await wait(8000);
report.battleBig = await page.evaluate(`(${MEASURE_FN})(6)`);
console.log('büyük savaş:', JSON.stringify(report.battleBig));

console.log('\n=== ÖZET ===');
for (const [k, v] of Object.entries(report)) {
  console.log(
    `${k}: FPS~${v.fpsAvg} (p95 Karede ${v.frameP95ms}ms), uzun görev≥50ms: ${v.longTasksOver50ms} (en uzun ${v.longTaskMaxMs}ms), heap ${v.heapMB}MB, DOM ${v.domNodes}`,
  );
}
console.log(pageErrors.length ? `✗ sayfa hataları: ${pageErrors.join(' | ')}` : '✓ sayfa hatası yok');
await browser.close();
process.exit(pageErrors.length ? 1 : 0);
