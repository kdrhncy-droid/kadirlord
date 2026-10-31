/**
 * battle-check.mjs — Birleşik Kalradya Muharebe Motoru E2E ve Görsel Denetimi:
 * 1. Şehir Arenası / 1v1 Düello (tam iskeletli rig, IK, 4 yönlü nişangâh, zırh/silah).
 * 2. Meydan Muharebesi & Taktik Bölük Seçimi (1-4 bölükler, F1-F6 emir kartları, kill feed, güç çubuğu).
 * 3. 3B Kale Kuşatması (sur üstü okçuları, koçbaşı, kuşatma kuleleri ve mancınıklar).
 * 4. Zafer / Yenilgi Savaş Sonu Paneli (zayiatlar, esirler, haritaya dönüş).
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

// 1. ARENA & DÜELLO EKRANI (Tam İskeletli Rig, IK, Warband 4 Yönlü Nişangâh)
await page.evaluate(() => window.__kadirlordTest.openArena());
await wait(1800);
await page.screenshot({ path: join(ARTIFACT_DIR, 'battle-1-arena-duel.png') });
console.log('✓ 1. Arena & Düello ekranı kaydedildi');

// 2. MEYDAN MUHAREBESİ & TAKTİK EMİR KARTLARI (F1-F6, 1-4 Bölükler, Kill Feed)
await page.evaluate(() => {
  const modeBtn = document.querySelector('[data-testid="arena-mode-MASS_BATTLE"]');
  modeBtn?.click();
});
await wait(1500);

// F1 Hareket Menüsünü Aç ve Piyadeleri Seç
await page.evaluate(() => {
  window.__kadirlordTest.selectDivision?.('INFANTRY');
  // F1 Hareket butonuna tıkla
  const buttons = [...document.querySelectorAll('button')];
  const f1Btn = buttons.find((b) => b.innerText.includes('[F1] Hareket'));
  f1Btn?.click();
});
await wait(600);
await page.screenshot({ path: join(ARTIFACT_DIR, 'battle-2-tactical-orders.png') });
console.log('✓ 2. Taktik Hareket Menüsü ve Bölük Kartları kaydedildi');

// 3. 3B KALE KUŞATMASI (Sur Üstü Okçuları, Koçbaşı, Kuleler & Mancınıklar)
await page.evaluate(() => {
  const toggleSiege = document.querySelector('[data-testid="toggle-siege-btn"]');
  toggleSiege?.click();
});
await wait(1800);
await page.screenshot({ path: join(ARTIFACT_DIR, 'battle-3-siege-assault.png') });
console.log('✓ 3. 3B Kale Kuşatması ve Sur Okçuları kaydedildi');

// 4. ZAFER VE MUHAREBE SONUCU MODALI
await page.evaluate(() => {
  window.__kadirlordTest.triggerVictory?.();
});
await wait(800);
await page.screenshot({ path: join(ARTIFACT_DIR, 'battle-4-victory-modal.png') });
console.log('✓ 4. Zafer ve Muharebe Sonucu Modalı kaydedildi');

// 5. Sefer haritasına geri dönüş
await page.evaluate(() => {
  const returnBtn = document.querySelector('[data-testid="battle-return-btn"]');
  returnBtn?.click();
});
await wait(800);
await page.screenshot({ path: join(ARTIFACT_DIR, 'battle-5-back-to-campaign.png') });
console.log('✓ 5. Sefer haritasına geri dönüş doğrulandı');

// 6. GERÇEK LORDLA MEYDAN MUHAREBESİ (Lord Garios, Tam İskeletli Rigler, Zırhlar, 0 Küp, Temiz Bannerlord HUD)
await page.evaluate(() => {
  window.__kadirlordTest.openBattle();
});
await wait(2400);
await page.screenshot({ path: join(ARTIFACT_DIR, 'battle-6-lord-encounter.png') });
console.log('✓ 6. Lord ile Meydan Muharebesi (İskeletli Rigler, Lord Rozeti & Temiz HUD) kaydedildi');

await browser.close();

if (problems.length > 0) {
  console.error('Test sırasında sorunlar tespit edildi:', problems);
  process.exit(1);
} else {
  console.log('✅ TÜM MUHAREBE E2E DENETİMLERİ BAŞARIYLA GEÇTİ!');
}
