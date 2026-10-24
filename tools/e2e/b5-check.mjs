/**
 * b5-check.mjs — 10.2/B5 (1 aktör = 1 asker + takviye dalgaları) canlı kontrolü.
 * big-battle senaryosu: 130v130, toplam 260 > saha bütçesi 200. İlk dalga
 * orantılı olarak 100v100 çıkar (konuşlanma kartları bunu göstermeli),
 * taraf başına 30 yedek kalır. Savaşta kayıplar ilk dalganın yarısına
 * ulaşınca takviye dalgası sahaya girer — komut kartlarındaki "sahaya çıkan
 * toplam" büyümeli. Matematik ayrıntısı probe-reinforcements ile kilitli.
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
page.setDefaultTimeout(180_000);
page.on('pageerror', (e) => problems.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (/Failed to load resource|ERR_|favicon/i.test(text)) return;
  problems.push(`CONSOLE: ${text}`);
});

const cmdTotals = () =>
  page.evaluate(() => {
    let alive = 0;
    let fielded = 0;
    for (const el of document.querySelectorAll('[data-testid^="cmd-card-"]')) {
      const m = (el.textContent ?? '').match(/(\d+)\s*\/\s*(\d+)/);
      if (m) {
        alive += Number(m[1]);
        fielded += Number(m[2]);
      }
    }
    return { alive, fielded };
  });

const params = new URLSearchParams({
  e2e: '1',
  autostart: '1',
  seed: '42',
  scenario: 'big-battle',
  timeScale: '0',
});
await page.goto(`${BASE_URL}/?${params}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForFunction(() => window.__kadirlordTest?.ready === true, { timeout: 180_000 });
console.log('✓ oyun hazır');

// Diyalogdan karşılaşma menüsüne yürü (teslim/rüşvet seçeneklerini atla)
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
      return pick.getAttribute('data-testid');
    }
    return null;
  });
  if (!clicked) break;
  await wait(900);
}
await page.waitForSelector('[data-testid="dialogue-option-enc-attack"]', { timeout: 60_000 });
await page.click('[data-testid="dialogue-option-enc-attack"]');
await page.waitForFunction(() => window.__kadirlordTest.getState().subMode === 'battle', {
  timeout: 180_000,
});
console.log('✓ savaş modu');

// Konuşlanma: ilk dalga 100 nefer göstermeli (130 kişilik ordudan)
await page.waitForSelector('[data-testid="deployment-panel"]', { timeout: 120_000 });
await wait(2500);
const deployTotal = await page.evaluate(() => {
  let sum = 0;
  for (const el of document.querySelectorAll('[data-testid^="deployment-card-"]')) {
    const m = (el.textContent ?? '').match(/(\d+)\s*nefer/);
    if (m) sum += Number(m[1]);
  }
  return sum;
});
console.log(`   konuşlanma ilk dalga toplamı: ${deployTotal} (beklenen 100; ordu 130)`);
if (deployTotal !== 100)
  problems.push(`İlk dalga 100 olmalıydı (saha bütçesi 200, 130v130), gelen ${deployTotal}`);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b5-deploy.png') });

// Savaşı başlat; komut kartları da 100 çıkarmalıyla başlamalı
await page.click('[data-testid="deployment-start"]');
await page.waitForSelector('[data-testid="command-panel"]', { timeout: 60_000 });
await wait(2000);
let totals = await cmdTotals();
console.log(`   savaş başı: canlı ${totals.alive}, çıkan ${totals.fielded}`);
if (totals.fielded !== 100)
  problems.push(`Komut kartları çıkan toplamı 100 olmalıydı, gelen ${totals.fielded}`);

// Herkese hücum: kayıplar birikmeli, yarıya düşünce yedekler girmeli
await page.keyboard.press('Digit0');
await wait(250);
await page.keyboard.press('F1');
await wait(300);
await page.keyboard.press('F3');
console.log('   tümü hücum verildi; takviye dalgası bekleniyor (SwiftShader yavaş)...');

let waveSeen = false;
let ended = false;
for (let i = 0; i < 72 && !waveSeen && !ended; i++) {
  await wait(5000);
  const st = await page.evaluate(() => window.__kadirlordTest.getState());
  ended = st.subMode !== 'battle';
  if (ended) break;
  totals = await cmdTotals();
  if (totals.fielded > 100) {
    waveSeen = true;
    console.log(`   takviye dalgası gözlendi: çıkan toplam 100 → ${totals.fielded} (canlı ${totals.alive})`);
  } else if (i % 6 === 5) {
    console.log(`   ... canlı ${totals.alive}, çıkan ${totals.fielded}, savaş sürüyor`);
  }
}
if (!waveSeen && !ended)
  problems.push('6 dakika içinde takviye dalgası gözlenmedi (çıkan toplam 100 kaldı)');
if (ended && !waveSeen)
  problems.push('Savaş takviye dalgası girmeden bitti — yedekler sahaya çıkmadan sonuç üretildi');
await page.screenshot({ path: join(ARTIFACT_DIR, 'b5-reinforcements.png') });

console.log(problems.length === 0 ? '✓ sorun yok' : `✗ sorunlar:\n${problems.join('\n')}`);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
