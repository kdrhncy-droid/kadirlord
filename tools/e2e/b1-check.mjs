/**
 * b1-check.mjs — 10.2/B1 meydan savaşı canlı kontrolü (geçici tanı betiği)
 * bandit-caught-player senaryosundan gerçek savaşa girer, ekran görüntüleri
 * alır, konsol/sayfa hatalarını ve yaklaşık FPS'i raporlar.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/chromium.mjs';

const E2E_ROOT = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = join(E2E_ROOT, 'artifacts');
mkdirSync(ARTIFACT_DIR, { recursive: true });
const BASE_URL = 'http://127.0.0.1:3000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
const browser = await launchChromium();
console.log(`Tarayıcı: ${await browser.version()}`);
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
page.setDefaultTimeout(120_000);
page.on('pageerror', (e) => problems.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (/Failed to load resource|ERR_|favicon/i.test(text)) return;
  problems.push(`CONSOLE: ${text}`);
});

const params = new URLSearchParams({
  e2e: '1',
  autostart: '1',
  seed: '42',
  scenario: 'bandit-caught-player',
  timeScale: '0',
});
await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 120_000 });
console.log('✓ oyun hazır');

await page.waitForSelector('[data-testid="dialogue-modal"]', { timeout: 120_000 });
await page.click('[data-testid="dialogue-option-bandit-fight"]');
await page.waitForSelector('[data-testid="dialogue-option-enc-attack"]', { timeout: 120_000 });
console.log('✓ karşılaşma menüsünde');

const before = await page.evaluate(() => window.__kadirlordTest.getState());
console.log(`   oyuncu asker: ${before.player.troops}, subMode: ${before.subMode}`);

const t0 = Date.now();
await page.click('[data-testid="dialogue-option-enc-attack"]');
await page.waitForFunction(
  () => window.__kadirlordTest.getState().subMode === 'battle',
  { timeout: 120_000 },
);
console.log(`✓ savaş modu (${Date.now() - t0} ms'de geçiş)`);

await wait(3500);
const dom = await page.evaluate(() => ({
  canvases: document.querySelectorAll('canvas').length,
  worldCanvasMounted: Boolean(document.querySelector('[data-testid="world-canvas-container"]')),
  hintVisible: document.body.innerText.includes('nişan kilidi'),
}));
console.log(`   DOM: ${JSON.stringify(dom)}`);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b1-battle-start.png') });

// FPS ölç (2 sn RAF sayımı)
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      const step = () => {
        frames++;
        if (performance.now() - start < 2000) requestAnimationFrame(step);
        else resolve(Math.round((frames / (performance.now() - start)) * 1000));
      };
      requestAnimationFrame(step);
    }),
);
console.log(`   yaklaşık FPS (SwiftShader): ${fps}`);

// İleri sür + emir değiştir
await page.keyboard.down('KeyW');
await wait(2500);
await page.keyboard.up('KeyW');
await page.screenshot({ path: join(ARTIFACT_DIR, 'b1-battle-advance.png') });

// Sol tık: pointer lock denemesi
await page.mouse.click(720, 450);
await wait(600);
const lock = await page.evaluate(() => Boolean(document.pointerLockElement));
console.log(`   pointer lock: ${lock ? 'aktif' : 'YOK'}`);
await page.mouse.move(900, 450);
await wait(1200);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b1-battle-look.png') });

// D tuşu yön kontrolü: oyuncu dünya konumunu okuyamayız; telemetri üzerinden canlı sayıları al
const mid = await page.evaluate(() => window.__kadirlordTest.getState());
console.log(`   subMode: ${mid.subMode}`);

// 25 sn daha izle (AI vs AI ilerlesin), sonra durum
await wait(25_000);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b1-battle-late.png') });
const late = await page.evaluate(() => window.__kadirlordTest.getState());
console.log(`   geç durum subMode: ${late.subMode}`);

console.log(problems.length === 0 ? '✓ sayfa hatası yok' : `✗ hatalar:\n${problems.join('\n')}`);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
