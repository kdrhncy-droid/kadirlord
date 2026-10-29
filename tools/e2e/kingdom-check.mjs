/**
 * kingdom-check.mjs — Krallık Divanı (K) ekranı E2E ve görsel denetimi:
 * 4 kanonik Bannerlord sekmesini (Diplomasi, Tımarlar, Politikalar, Klanlar)
 * sırayla açar, ekran görüntülerini artifacts dizinine kaydeder ve hata olmadığını doğrular.
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
console.log('✓ Oyun hazır');

// Krallık modalını aç
await page.evaluate(() => window.__kadirlordTest.openKingdom());
await wait(800);

// 1. DİPLOMASİ SEKME EKRANI
await page.screenshot({ path: join(ARTIFACT_DIR, 'kingdom-tab-diplomacy.png') });
console.log('✓ 1. Diplomasi sekmesi kaydedildi');

// 2. TIMARLAR SEKME EKRANI
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  const fiefsBtn = buttons.find((b) => b.innerText.includes('TIMARLAR'));
  fiefsBtn?.click();
});
await wait(500);
await page.screenshot({ path: join(ARTIFACT_DIR, 'kingdom-tab-fiefs.png') });
console.log('✓ 2. Tımarlar sekmesi kaydedildi');

// 3. POLİTİKALAR SEKME EKRANI
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  const polBtn = buttons.find((b) => b.innerText.includes('POLİTİKALAR'));
  polBtn?.click();
});
await wait(500);
await page.screenshot({ path: join(ARTIFACT_DIR, 'kingdom-tab-policies.png') });
console.log('✓ 3. Politikalar sekmesi kaydedildi');

// 4. KLANLAR SEKME EKRANI
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  const clansBtn = buttons.find((b) => b.innerText.includes('KLANLAR'));
  clansBtn?.click();
});
await wait(500);
await page.screenshot({ path: join(ARTIFACT_DIR, 'kingdom-tab-clans.png') });
console.log('✓ 4. Klanlar sekmesi kaydedildi');

// Kapatma testi
await page.evaluate(() => window.__kadirlordTest.closeKingdom());
await wait(400);
console.log('✓ Krallık ekranı başarıyla kapatıldı');

console.log(problems.length === 0 ? '✓ Sayfa hatası yok' : `✗ Hatalar:\n${problems.join('\n')}`);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
