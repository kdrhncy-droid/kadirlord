/**
 * b3-check.mjs — 10.2/B3 Order of Battle konuşlanma canlı kontrolü.
 * player-caught-bandit (70 asker ≥ 20) senaryosunda: konuşlanma paneli
 * açılmalı, bölük kartları seçilebilmeli, tıkla-yerleştir + diziliş değişimi
 * çalışmalı, "SAVAŞA BAŞLA" savaşı başlatmalı. 20 altı orduda konuşlanma
 * çıkmadığını b1-check (6 asker) ayrıca korur.
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
  scenario: 'player-caught-bandit',
  timeScale: '0',
});
await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 120_000 });
console.log('✓ oyun hazır');

// Diyalogdan karşılaşma menüsüne yürü (teslim/rüşvet seçeneklerini atla)
await page.waitForSelector('[data-testid="dialogue-modal"]', { timeout: 120_000 });
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
      return pick.getAttribute('data-testid');
    }
    return null;
  });
  console.log(`   diyalog adımı: ${clicked}`);
  if (!clicked) break;
  await wait(900);
}
await page.waitForSelector('[data-testid="dialogue-option-enc-attack"]', { timeout: 60_000 });
const before = await page.evaluate(() => window.__kadirlordTest.getState());
console.log(`   oyuncu asker: ${before.player.troops}`);

await page.click('[data-testid="dialogue-option-enc-attack"]');
await page.waitForFunction(
  () => window.__kadirlordTest.getState().subMode === 'battle',
  { timeout: 120_000 },
);
console.log('✓ savaş modu');

// Konuşlanma paneli açılmalı (70 asker ≥ 20)
await page.waitForSelector('[data-testid="deployment-panel"]', { timeout: 60_000 });
await wait(2500);
const cards = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="deployment-card-"]')].map(
    (el) => el.getAttribute('data-testid'),
  ),
);
console.log(`✓ konuşlanma paneli açık — kartlar: ${cards.join(', ')}`);
if (cards.length !== 4) problems.push(`Beklenen 4 bölük kartı, gelen ${cards.length}`);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b3-deploy-start.png') });

// Okçuları seç + araziye tıkla-yerleştir
await page.click('[data-testid="deployment-card-archer"]');
await wait(300);
await page.mouse.click(470, 500);
await wait(900);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b3-deploy-moved.png') });
console.log('✓ okçu bölüğü tıkla-yerleştir denendi');

// Piyade dizilişini değiştir (Hat → Kalkan Duvarı)
const formationBefore = await page.evaluate(
  () => document.querySelector('[data-testid="deployment-formation-infantry"]')?.textContent?.trim(),
);
await page.click('[data-testid="deployment-formation-infantry"]');
await wait(500);
const formationAfter = await page.evaluate(
  () => document.querySelector('[data-testid="deployment-formation-infantry"]')?.textContent?.trim(),
);
console.log(`   piyade dizilişi: "${formationBefore}" → "${formationAfter}"`);
if (formationBefore === formationAfter) problems.push('Diziliş düğmesi dizilişi değiştirmedi');

// 3 tuşu süvariyi seçmeli (vurgu sınıfı)
await page.keyboard.press('Digit3');
await wait(400);
const cavSelected = await page.evaluate(() =>
  document
    .querySelector('[data-testid="deployment-card-cavalry"]')
    ?.className.includes('border-amber-300'),
);
console.log(`   Digit3 süvari seçimi: ${cavSelected ? 'aktif' : 'YOK'}`);
if (!cavSelected) problems.push('Digit3 süvari kartını seçmedi');

// Sağ tık sürükle: yön ver
await page.mouse.move(880, 520);
await page.mouse.down({ button: 'right' });
await page.mouse.move(1030, 430, { steps: 8 });
await page.mouse.up({ button: 'right' });
await wait(700);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b3-deploy-final.png') });
console.log('✓ sağ tık yön sürükleme denendi');

// Savaşa başla → panel kapanmalı, subMode battle kalmalı
await page.click('[data-testid="deployment-start"]');
await page.waitForFunction(
  () => !document.querySelector('[data-testid="deployment-panel"]'),
  { timeout: 30_000 },
);
const mid = await page.evaluate(() => window.__kadirlordTest.getState());
console.log(`✓ savaş başladı (subMode: ${mid.subMode})`);
await wait(3500);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b3-battle.png') });

// Savaş ilerliyor mu (60 sn içinde bitmesi şart değil; durumu raporla)
let ended = false;
for (let i = 0; i < 12 && !ended; i++) {
  await wait(5000);
  const st = await page.evaluate(() => window.__kadirlordTest.getState());
  ended = st.subMode !== 'battle';
}
console.log(`   savaş durumu: ${ended ? 'savaş sonuçlandı' : 'hâlâ sürüyor (SwiftShader yavaşlığı olabilir)'}`);

console.log(problems.length === 0 ? '✓ sorun yok' : `✗ sorunlar:\n${problems.join('\n')}`);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
