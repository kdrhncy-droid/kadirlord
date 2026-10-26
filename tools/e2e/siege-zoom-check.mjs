/**
 * siege-zoom-check.mjs — kuşatma detaylarının zoom kapısına bağlı olduğunu
 * canlı doğrular: yakın görünümde motor/duvar işaretçileri görünür, uzak
 * görünümde gizlenir (Bannerlord: kuşatma ikonu ancak zoom yapınca ayrıntı
 * verir; motorlar yalnız yakın/kuşatma bağlamında).
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

const params = new URLSearchParams({
  e2e: '1',
  autostart: '1',
  seed: '42',
  timeScale: '0',
  siege: 'outsider',
  focusSiegeCamp: '1',
});
await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 120_000 });
await wait(4000);
console.log('✓ kuşatma sahnesi kurulu');

const visibleMarkers = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-role="siege-engine-marker"],[data-role="siege-wall-health"]')]
      .filter((el) => el.style.display !== 'none')
      .map((el) => el.dataset.role),
  );

const nearVisible = await visibleMarkers();
console.log(`   yakın görünüm işaretçileri: ${nearVisible.length} (${nearVisible.join(',')})`);
await page.screenshot({ path: join(ARTIFACT_DIR, 'siege-near.png') });

await page.mouse.move(720, 450);
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel({ deltaY: 220 });
  await wait(140);
}
await wait(1500);
const farVisible = await visibleMarkers();
console.log(`   uzak görünüm işaretçileri: ${farVisible.length}`);
await page.screenshot({ path: join(ARTIFACT_DIR, 'siege-far.png') });

if (nearVisible.length === 0) problems.push('Yakın görünümde kuşatma işaretçisi yok (senaryo kurulmadı mı?)');
if (farVisible.length !== 0) problems.push(`Uzak görünümde hâlâ ${farVisible.length} işaretçi görünüyor`);
console.log(problems.length === 0 ? '✓ zoom kapısı çalışıyor' : `✗ sorunlar:\n${problems.join('\n')}`);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
