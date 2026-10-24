/**
 * b4-check.mjs — 10.2/B4 bölük emirleri canlı kontrolü.
 * player-caught-bandit (70 asker) senaryosunda: konuşlanmadan savaşa geçilir,
 * komut paneli açılır; 0-4 seçimi + F1/F3/F4 emirleri kartlardaki emir/diziliş
 * durumunu değiştirmeli (Bannerlord komuta ağacı). Küçük savaşta (<20) da
 * bölüklerin kurulduğunu b1-check akışı dolaylı korur (komut paneli orada da
 * görünür; burada asıl ağaç sınanır).
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

const getCard = (cls) =>
  page.evaluate((c) => {
    const el = document.querySelector(`[data-testid="cmd-card-${c}"]`);
    return el
      ? {
          order: el.getAttribute('data-order'),
          formation: el.getAttribute('data-formation'),
          text: el.textContent ?? '',
        }
      : null;
  }, cls);

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
  if (!clicked) break;
  await wait(900);
}
await page.waitForSelector('[data-testid="dialogue-option-enc-attack"]', { timeout: 60_000 });
await page.click('[data-testid="dialogue-option-enc-attack"]');
await page.waitForFunction(() => window.__kadirlordTest.getState().subMode === 'battle', {
  timeout: 120_000,
});
console.log('✓ savaş modu');

// Konuşlanmadan doğrudan savaşa geç
await page.waitForSelector('[data-testid="deployment-panel"]', { timeout: 60_000 });
await page.click('[data-testid="deployment-start"]');
await page.waitForSelector('[data-testid="command-panel"]', { timeout: 60_000 });
await wait(1500);
console.log('✓ komut paneli açık');

const cards = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="cmd-card-"]')].map((el) => ({
    id: el.getAttribute('data-testid'),
    order: el.getAttribute('data-order'),
  })),
);
console.log(`   kartlar: ${cards.map((c) => `${c.id}=${c.order}`).join(', ')}`);
if (cards.length !== 4) problems.push(`Beklenen 4 komut kartı, gelen ${cards.length}`);
if (cards.some((c) => c.order !== 'HOLD'))
  problems.push(`Bölükler HOLD ile başlamalıydı: ${JSON.stringify(cards)}`);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b4-battle-start.png') });

// 2 → Okçu seç, F1 menüsü açılmalı
await page.keyboard.press('Digit2');
await wait(300);
await page.keyboard.press('F1');
await wait(400);
const menuText = await page.evaluate(
  () => document.querySelector('[data-testid="command-menu"]')?.textContent ?? '',
);
console.log(`   F1 menüsü: ${menuText.slice(0, 80)}…`);
if (!menuText.includes('Konuma Git')) problems.push('F1 hareket menüsü açılmadı');

// F4 → İlerle (alt menüde): yalnız okçu ADVANCE olmalı
await page.keyboard.press('F4');
await wait(500);
const archer = await getCard('archer');
const infantryHold = await getCard('infantry');
console.log(`   okçu emir: ${archer?.order}, piyade emir: ${infantryHold?.order}`);
if (archer?.order !== 'ADVANCE') problems.push(`Okçu ADVANCE olmalıydı, gelen ${archer?.order}`);
if (infantryHold?.order !== 'HOLD') problems.push('Seçim dışındaki bölük emri değişti');

// F4 (menüsüz) → Ateş Kes etiketi okçuda görünmeli
await page.keyboard.press('F4');
await wait(450);
const archer2 = await getCard('archer');
console.log(`   okçu kartı: ${archer2?.text.replace(/\s+/g, ' ').trim()}`);
if (!archer2?.text.includes('Ateş Kes')) problems.push('F4 Ateş Kes etiketi görünmedi');
await page.keyboard.press('F4'); // geri al: ateş serbest
await wait(350);

// 1 → Piyade, F3 Diziliş, F2 Kalkan Duvarı
await page.keyboard.press('Digit1');
await wait(250);
await page.keyboard.press('F3');
await wait(300);
await page.keyboard.press('F2');
await wait(500);
const infantry = await getCard('infantry');
console.log(`   piyade diziliş: ${infantry?.formation}`);
if (infantry?.formation !== 'SHIELD_WALL')
  problems.push(`Piyade SHIELD_WALL olmalıydı, gelen ${infantry?.formation}`);

// 0 → Tümü, F1 → F3 Hücum: herkes CHARGE
await page.keyboard.press('Digit0');
await wait(250);
await page.keyboard.press('F1');
await wait(300);
await page.keyboard.press('F3');
await wait(600);
const finalCards = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid^="cmd-card-"]')].map((el) => ({
    id: el.getAttribute('data-testid'),
    order: el.getAttribute('data-order'),
  })),
);
console.log(`   hücum sonrası: ${finalCards.map((c) => `${c.id}=${c.order}`).join(', ')}`);
if (finalCards.some((c) => c.order !== 'CHARGE'))
  problems.push(`Tümü CHARGE olmalıydı: ${JSON.stringify(finalCards)}`);

await wait(6000);
await page.screenshot({ path: join(ARTIFACT_DIR, 'b4-charge.png') });

// Savaş ilerliyor mu: temas + kayıp gözlenmeli (SwiftShader yavaş; savaşın
// bitmesi şart değil ama kilitlenme kabul edilemez). Kartlardaki canlı sayısı
// düşerse ya da savaş biterse temas kanıtlanır.
const allyAlive = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="cmd-card-"]')].reduce((sum, el) => {
      const m = (el.textContent ?? '').match(/(\d+)\s*\/\s*(\d+)/);
      return sum + (m ? Number(m[1]) : 0);
    }, 0),
  );
const aliveBefore = await allyAlive();
let ended = false;
let contact = false;
for (let i = 0; i < 24 && !ended && !contact; i++) {
  await wait(5000);
  const st = await page.evaluate(() => window.__kadirlordTest.getState());
  ended = st.subMode !== 'battle';
  if (!ended) {
    const aliveNow = await allyAlive();
    contact = aliveNow < aliveBefore;
    if (contact) console.log(`   temas kanıtı: canlı ${aliveBefore} → ${aliveNow}`);
  }
}
console.log(
  `   savaş durumu: ${ended ? 'savaş sonuçlandı' : contact ? 'temas sürüyor' : 'hâlâ temassız'}`,
);
if (!ended && !contact)
  problems.push('120 sn içinde ne savaş bitti ne kayıp gözlendi — savaş kilitlenmiş olabilir');
await page.screenshot({ path: join(ARTIFACT_DIR, 'b4-combat.png') });

console.log(problems.length === 0 ? '✓ sorun yok' : `✗ sorunlar:\n${problems.join('\n')}`);
await browser.close();
process.exit(problems.length === 0 ? 0 : 1);
