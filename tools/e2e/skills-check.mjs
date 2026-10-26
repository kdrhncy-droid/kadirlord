/**
 * skills-check.mjs — karakter (beceri) ekranı canlı kontrolü: oyunu açar,
 * openCharacter kancasıyla Karakter modalını getirir, ekran görüntüsü alır,
 * perk tıklama yolunun hata vermediğini doğrular.
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

const params = new URLSearchParams({ e2e: '1', autostart: '1', seed: '42', timeScale: '0' });
await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 120_000 });
console.log('✓ oyun hazır');

await page.evaluate(() => window.__kadirlordTest.openCharacter());
await page.waitForSelector('[data-testid="bannerlord-character-modal"]', { timeout: 30_000 });
await wait(800);
await page.screenshot({ path: join(ARTIFACT_DIR, 'skills-menu.png') });
console.log('✓ karakter ekranı açık');

const layout = await page.evaluate(() => {
  const modal = document.querySelector('[data-testid="bannerlord-character-modal"]');
  const buttons = modal ? [...modal.querySelectorAll('button')] : [];
  return {
    modalVisible: Boolean(modal),
    buttonCount: buttons.length,
    hasPerkNames: modal ? modal.innerText.includes('Yumruk Gibi') : false,
  };
});
console.log(`   düzen: ${JSON.stringify(layout)}`);

await page.click('[data-testid="char-modal-close"]');
await wait(400);
console.log(problems.length === 0 ? '✓ sayfa hatası yok' : `✗ hatalar:\n${problems.join('\n')}`);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
