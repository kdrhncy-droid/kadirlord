/**
 * user-report-check.mjs — kullanıcı bildirimleri (2026-10-24) canlı doğrulama:
 * - Rapor şeridi (hud-event-feed) ilk anda görünür, ~7 sn sonra solar.
 * - Sayfa hatası yok (WorldCanvas/GameHud düzeltmeleri çalışma zamanı temiz).
 * Ekran görüntüleri artifacts/ altına düşer (kervan figürlerinin oyuncunun
 * yanında belirmediği gözle bakılır).
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

const params = new URLSearchParams({
  e2e: '1',
  autostart: '1',
  seed: '42',
  scenario: 'boot',
  timeScale: '1',
});
await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 180_000 });
await page.waitForSelector('[data-testid="hud-event-feed"]', { timeout: 60_000 });

const feedOpacity = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="hud-event-feed"]');
    return el ? Number(getComputedStyle(el).opacity) : -1;
  });

await wait(2500);
const early = await feedOpacity();
await page.screenshot({ path: join(E2E_ROOT, 'artifacts', 'user-report-early.png') });

await wait(9000);
const late = await feedOpacity();
await page.screenshot({ path: join(E2E_ROOT, 'artifacts', 'user-report-late.png') });

console.log(`rapor şeridi opaklık: erken=${early} geç=${late}`);
console.log(pageErrors.length ? `✗ sayfa hataları: ${pageErrors.join(' | ')}` : '✓ sayfa hatası yok');
const ok = early > 0.5 && late < 0.2 && pageErrors.length === 0;
console.log(ok ? '✓ sorun yok' : '✗ SORUN VAR');
await browser.close();
process.exit(ok ? 0 : 1);
